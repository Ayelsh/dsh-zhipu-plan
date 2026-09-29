/**
 * The plan page: the Zhipu coding-plan account.
 *
 * Sign-in runs on the host — the page only picks the deployment and plan kind,
 * relays the authorize address to the user, and polls the attempt's state until
 * it settles — so tokens never pass through the renderer. The signed-in view is
 * the deployment's own picture: remaining quota per bucket, the resets it has
 * granted, and the server-side usage behind them.
 *
 * The page also runs the same reset polls ZCode does. The status is re-read
 * periodically so a reset the deployment grants simply appears, and when none
 * is on hand the eligibility request is repeated on the deployment's terms —
 * never as a button the user is asked to press.
 *
 * @module dsh-zhipu-plan/client/PlanPanel
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PlanLocaleKey } from './locales.ts'
import type {
  PlanAccount, PlanLoginState, PlanQuota, PlanResetKind, PlanResetStatus, PlanUsageRange, PlanUsageReport,
} from './plan-types.ts'
import { randomKey } from './keys.ts'
import { QuotaSection } from './QuotaSection.tsx'
import { PlanUsagePanel } from './PlanUsagePanel.tsx'
import {
  EMPTY_RESET_STATE, RESET_OPPORTUNITY_DEFAULT_COOLDOWN_MS, RESET_OPPORTUNITY_MIN_RETRY_MS,
  RESET_STATUS_POLL_MS, failManualReset, foldResetStatus, startManualReset, type ResetState,
} from './reset.ts'
import { resetTimeText } from './quota.ts'
import { styles } from './styles.ts'

/** This page's copy seat. */
type Translate = (key: PlanLocaleKey, params?: Record<string, unknown>) => string

/** Host operations the panel needs, injected by the registration. */
export interface PlanPanelProps {
  readonly t: Translate
  /** The stored account, or undefined when signed out. */
  readonly loadAccount: () => Promise<PlanAccount | undefined>
  /** Begin one sign-in attempt for the deployment and entitlement. */
  readonly beginLogin: (deployment: PlanAccount['deployment'], planKind: PlanAccount['planKind']) => Promise<void>
  /** Read the running attempt's state. */
  readonly loadLoginState: () => Promise<PlanLoginState>
  /** Withdraw the running attempt. */
  readonly cancelLogin: () => Promise<void>
  /** Delete the stored account. */
  readonly logout: () => Promise<void>
  /** Read the plan quota snapshot. */
  readonly loadQuota: () => Promise<PlanQuota | undefined>
  /** Read the window's server-side usage; undefined when the read failed. */
  readonly loadUsage: (range: PlanUsageRange) => Promise<PlanUsageReport | undefined>
  /** Read the resets on hand. */
  readonly loadResetStatus: () => Promise<PlanResetStatus | undefined>
  /** Spend one reset; the key makes a retried click idempotent. */
  readonly useReset: (kind: PlanResetKind, idempotencyKey: string) => Promise<void>
  /** Ask the deployment for a reset opportunity; a refusal carries the earliest retry moment. */
  readonly requestResetOpportunity: (
    idempotencyKey: string,
  ) => Promise<{ readonly granted: true } | { readonly granted: false; readonly nextTryAt: number }>
  /** Mark the reset history as read once the page has shown it. */
  readonly markResetHistoryRead: () => Promise<void>
  /** The language the shell is showing, so numbers and dates follow it. */
  readonly currentLocale: () => string

}

/** Milliseconds between polls of a running sign-in attempt. */
const POLL_INTERVAL_MS = 1_000

/** How long the completion notice stays after the deployment confirms a reset. */
const COMPLETION_NOTICE_MS = 8_000

/** Which deployment the account authorizes against, chosen before signing in. */
function Picker(props: {
  readonly t: Translate
  readonly label: PlanLocaleKey
  readonly value: string
  readonly options: readonly { readonly value: string; readonly label: PlanLocaleKey }[]
  readonly onChange: (value: string) => void
}): ReactNode {
  const { t, label, value, options, onChange } = props
  return (
    <label className={styles.pickerRow}>
      <span>{t(label)}</span>
      <select
        className={styles.picker}
        value={value}
        onChange={(event) => { onChange(event.currentTarget.value) }}
      >
        {options.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
      </select>
    </label>
  )
}

/** The authorize address and its copyable fallback, shown while waiting. */
function WaitingNotice(props: {
  readonly t: Translate
  readonly authorizeUrl?: string
  readonly onCancel: () => void
}): ReactNode {
  const { t, authorizeUrl, onCancel } = props
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.authorize} role="status">
      <p className={styles.status}>{authorizeUrl === undefined ? t('planWaiting') : t('planAuthorizeHint')}</p>
      {authorizeUrl === undefined ? null : (
        <>
          <a className={styles.authorizeLink} href={authorizeUrl} target="_blank" rel="noreferrer">{authorizeUrl}</a>
          <div className={styles.sectionHeadRight}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void writeClipboard(authorizeUrl).then(() => { setCopied(true) }) }}
            >
              {copied ? t('planCopied') : t('planCopy')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>{t('planCancel')}</Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Render the plan page.
 * @param props - copy seat and the host operations the registration injects.
 * @returns the sign-in flow, or the signed-in account with its quota and usage.
 */
export function PlanPanel(props: PlanPanelProps): ReactNode {
  const {
    t, loadAccount, beginLogin, loadLoginState, cancelLogin, logout, loadQuota, loadUsage,
    loadResetStatus, useReset, requestResetOpportunity, markResetHistoryRead, currentLocale,
  } = props
  const [account, setAccount] = useState<PlanAccount | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [loginState, setLoginState] = useState<PlanLoginState>({ state: 'idle' })
  const [deployment, setDeployment] = useState<'bigmodel' | 'zai'>('zai')
  const [planKind, setPlanKind] = useState<PlanAccount['planKind']>('individual-coding-plan')
  const [quota, setQuota] = useState<PlanQuota | undefined>()
  const [resets, setResets] = useState<ResetState>(EMPTY_RESET_STATE)
  const [resetting, setResetting] = useState(false)
  const [notice, setNotice] = useState<{ readonly kind: PlanResetKind; readonly at: number } | undefined>()
  const [now, setNow] = useState(() => Date.now())
  const opportunityDueAt = useRef(0)
  const opportunityKey = useRef<string | undefined>(undefined)
  const opportunityRunning = useRef(false)

  /** Re-read everything the signed-in view shows. */
  const refresh = useCallback(async (): Promise<void> => {
    const [snapshot, status] = await Promise.all([loadQuota(), loadResetStatus()])
    const at = Date.now()
    if (snapshot !== undefined) setQuota(snapshot)
    setResets((previous) => {
      const fiveHour = foldResetStatus(previous.fiveHour, status, 'five_hour', at)
      const week = foldResetStatus(previous.week, status, 'week', at)
      if (previous.fiveHour.status !== 'completed' && fiveHour.status === 'completed') {
        setNotice({ kind: 'five_hour', at })
      }
      if (previous.week.status !== 'completed' && week.status === 'completed') {
        setNotice({ kind: 'week', at })
      }
      return { fiveHour, week }
    })
    if (status?.hasUnreadHistory === true) await markResetHistoryRead().catch(() => {})
  }, [loadQuota, loadResetStatus, markResetHistoryRead])

  useEffect(() => {
    loadAccount().then(
      (stored) => {
        setAccount(stored)
        setLoaded(true)
      },
      () => { setLoaded(true) },
    )
    // The attempt state is the host's, not this page's: a reload in the middle
    // of a sign-in reattaches to the running attempt instead of showing idle.
    void loadLoginState().then(setLoginState)
  }, [loadAccount, loadLoginState])

  useEffect(() => {
    if (loginState.state !== 'waiting') return
    const poll = (): void => {
      void loadLoginState().then((state) => {
        setLoginState(state)
        if (state.state === 'signed-in') void loadAccount().then((stored) => { setAccount(stored) })
      })
    }
    const timer = setInterval(poll, POLL_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [loginState.state, loadLoginState, loadAccount])

  useEffect(() => {
    if (account === undefined) return
    void refresh()
    const timer = setInterval(() => { void refresh() }, RESET_STATUS_POLL_MS)
    return () => { clearInterval(timer) }
  }, [account, refresh])

  // The eligibility poll: the deployment hands out a reset when it is asked at
  // a moment it allows, and it answers with the earliest moment worth asking
  // again. Nothing here is a user action.
  useEffect(() => {
    if (account === undefined) return
    const timer = setInterval(() => {
      if (opportunityRunning.current || Date.now() < opportunityDueAt.current) return
      opportunityRunning.current = true
      const key = opportunityKey.current ?? randomKey()
      opportunityKey.current = key
      void requestResetOpportunity(key).then(
        (result) => {
          const nowMs = Date.now()
          if (result.granted) {
            opportunityKey.current = undefined
            opportunityDueAt.current = nowMs + RESET_OPPORTUNITY_MIN_RETRY_MS
            void refresh()
            return
          }
          // A refusal is not a failure: it carries the moment the deployment
          // will consider the account again.
          opportunityKey.current = undefined
          opportunityDueAt.current = Math.max(result.nextTryAt, nowMs + RESET_OPPORTUNITY_MIN_RETRY_MS)
        },
        () => {
          // A transport failure is worth retrying with the same key, so a
          // second grant cannot become a second reset.
          opportunityDueAt.current = Date.now() + RESET_OPPORTUNITY_DEFAULT_COOLDOWN_MS
        },
      ).finally(() => { opportunityRunning.current = false })
    }, 30_000)
    return () => { clearInterval(timer) }
  }, [account, requestResetOpportunity, refresh])

  // Countdowns tick only while something shows one.
  const countingDown = resets.fiveHour.expiresAt !== undefined || resets.week.expiresAt !== undefined
  useEffect(() => {
    if (!countingDown) return
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [countingDown])

  const signIn = (): void => {
    setLoginState({ state: 'waiting' })
    beginLogin(deployment, planKind).catch((error: unknown) => {
      console.warn('zhipu-plan: sign-in rejected:', error)
      void loadLoginState().then(setLoginState)
    })
  }

  const spendReset = (kind: PlanResetKind): void => {
    const key = randomKey()
    setResets(previous => ({ ...previous, [kind === 'five_hour' ? 'fiveHour' : 'week']: startManualReset(previous[kind === 'five_hour' ? 'fiveHour' : 'week'], key) }))
    setResetting(true)
    const slot = kind === 'five_hour' ? 'fiveHour' : 'week'
    useReset(kind, key).then(
      // The deployment confirms the reset, not this call: the status poll
      // reports the new `usedAt`, and only that moves the window to done.
      () => { void refresh() },
      (error: unknown) => {
        // The host's line names what the service refused; the generic copy
        // alone would leave the user with nothing to act on.
        const detail = error instanceof Error && error.message.trim() !== '' ? error.message.trim() : ''
        const message = detail === '' ? t('resetFailed') : `${t('resetFailed')} ${detail}`
        setResets(previous => ({ ...previous, [slot]: failManualReset(previous[slot], message) }))
      },
    ).finally(() => { setResetting(false) })
  }

  if (!loaded) return <p className={styles.status}>{t('planPending')}</p>

  const locale = currentLocale()
  const errorText = resets.fiveHour.error ?? resets.week.error

  if (account === undefined || loginState.state === 'waiting' || loginState.state === 'failed') {
    return (
      <div className={styles.page}>
        <div className={styles.signInCard}>
          {loginState.state === 'failed' ? <p className={styles.error}>{loginState.message}</p> : null}
          {loginState.state === 'waiting'
            ? (
              <WaitingNotice
                t={t}
                {...loginState.authorizeUrl === undefined ? {} : { authorizeUrl: loginState.authorizeUrl }}
                onCancel={() => { void cancelLogin() }}
              />
            )
            : (
              <>
                <div className={styles.pickers}>
                  <Picker
                    t={t}
                    label="planDeployment"
                    value={deployment}
                    options={[
                      { value: 'zai', label: 'planDeploymentZai' },
                      { value: 'bigmodel', label: 'planDeploymentBigmodel' },
                    ]}
                    onChange={(value) => { setDeployment(value as 'bigmodel' | 'zai') }}
                  />
                  <Picker
                    t={t}
                    label="planKind"
                    value={planKind}
                    options={[
                      { value: 'individual-coding-plan', label: 'planKindIndividual' },
                      { value: 'team-coding-plan', label: 'planKindTeam' },
                      { value: 'start-plan', label: 'planKindStart' },
                    ]}
                    onChange={(value) => { setPlanKind(value as PlanAccount['planKind']) }}
                  />
                </div>
                <p className={styles.note}>{t('planSignInHint')}</p>
                <div>
                  <Button variant="primary" size="md" onClick={signIn}>{t('planSignIn')}</Button>
                </div>
              </>
            )}
        </div>
      </div>
    )
  }

  const completedNotice = notice === undefined || Date.now() - notice.at > COMPLETION_NOTICE_MS
    ? undefined
    : notice.kind

  return (
    <div className={styles.page}>
      <dl className={styles.facts}>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{t('planAccount')}</dt>
          <dd className={styles.factValue}>{account.accountLabel}</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{t('planDeployment')}</dt>
          <dd className={styles.factValue}>
            {t(account.deployment === 'zai' ? 'planDeploymentZai' : 'planDeploymentBigmodel')}
          </dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{t('planKind')}</dt>
          <dd className={styles.factValue}>{t(planKindKey(account.planKind))}</dd>
        </div>
        {account.jwtExpiresAt === undefined ? null : (
          <div className={styles.factRow}>
            <dt className={styles.factLabel}>{t('planTokenExpiry')}</dt>
            <dd className={styles.factValue}>
              {account.jwtExpired ? t('planTokenExpired') : resetTimeText(locale, account.jwtExpiresAt, 'dateTime')}
            </dd>
          </div>
        )}
      </dl>

      {quota === undefined && resets.fiveHour.status === 'idle' && resets.week.status === 'idle'
        ? <p className={styles.status}>{t('planPending')}</p>
        : null}

      <QuotaSection
        t={t}
        locale={locale}
        quota={quota}
        resets={resets}
        resetting={resetting}
        onReset={spendReset}
        onRefresh={() => { void refresh() }}
        now={now}
      />

      {completedNotice === undefined ? null : (
        <p className={styles.sectionMeta} role="status">
          {t(completedNotice === 'five_hour' ? 'resetDoneFiveHour' : 'resetDoneWeek')}
        </p>
      )}
      {errorText === undefined ? null : <p className={styles.error} role="status">{errorText}</p>}

      <PlanUsagePanel t={t} loadUsage={loadUsage} />

      <div className={styles.sectionHeadRight}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void logout().then(() => {
              setAccount(undefined)
              setLoginState({ state: 'idle' })
              setQuota(undefined)
              setResets(EMPTY_RESET_STATE)
            })
          }}
        >
          {t('planSignOut')}
        </Button>
      </div>
      <p className={styles.note}>{t('localNote')}</p>
    </div>
  )
}

/** The dictionary key naming one plan kind. */
function planKindKey(kind: PlanAccount['planKind']): 'planKindIndividual' | 'planKindTeam' | 'planKindStart' {
  if (kind === 'team-coding-plan') return 'planKindTeam'
  if (kind === 'start-plan') return 'planKindStart'
  return 'planKindIndividual'
}
