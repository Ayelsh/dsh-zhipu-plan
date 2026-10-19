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
 * Everything this file renders is a view of state it already holds: the markup
 * is grouped around the sheet's surfaces — the account's raised block, the
 * quota section, the usage tables — and no read, poll, or decision lives in it.
 *
 * @module dsh-zhipu-plan/client/PlanPanel
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PlanLocaleKey } from './locales.ts'
import type {
  PlanAccount, PlanLoginState, PlanQuota, PlanResetKind, PlanResetStatus, PlanUsageRange, PlanUsageReport,
} from './plan-types.ts'
import { randomKey } from './keys.ts'
import { QuotaSection } from './QuotaSection.tsx'
import { PlanUsagePanel } from './PlanUsagePanel.tsx'
import { SignInCard } from './SignInCard.tsx'
import {
  EMPTY_RESET_STATE, RESET_OPPORTUNITY_DEFAULT_COOLDOWN_MS, RESET_OPPORTUNITY_MIN_RETRY_MS,
  RESET_STATUS_POLL_MS, failManualReset, foldResetStatus, startManualReset, type ResetState,
} from './reset.ts'
import { resetTimeText } from './quota.ts'
import { shareScale, staggerAt, styles } from './styles.ts'

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

/** How many skeleton rows a surface that has not answered yet stands in with. */
const SKELETON_ROWS = 3

/** One labelled account fact, as the sheet's `heroRow` lays it out. */
function FactRow(props: { readonly label: string; readonly value: ReactNode; readonly stale?: boolean }): ReactNode {
  const { label, value, stale = false } = props
  return (
    <div className={styles.heroRow}>
      <dt className={styles.heroLabel}>{label}</dt>
      <dd className={`${styles.heroValue}${stale ? ` ${styles.heroValueStale}` : ''}`}>{value}</dd>
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

  // The account is not known yet: stand in the surfaces that are about to
  // arrive, at their real shape, rather than showing a line of text where a
  // card will be — the wait reads as the page assembling, not as an empty page.
  if (!loaded) {
    return (
      <div className={styles.page}>
        <p className={styles.status} role="status">{t('planPending')}</p>
        <div className={styles.hero} aria-hidden="true">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className={styles.skeletonRow}>
              <span className={styles.skeleton} data-wide="true" />
              <span className={styles.skeleton} />
            </div>
          ))}
        </div>
        <div className={styles.quotaCards} aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div key={index} className={styles.quotaCard} style={staggerAt(index)}>
              <span className={styles.skeleton} data-wide="true" />
              <span className={styles.skeleton} data-figure="true" />
              <span className={styles.skeleton} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const locale = currentLocale()
  const errorText = resets.fiveHour.error ?? resets.week.error

  if (account === undefined || loginState.state === 'waiting' || loginState.state === 'failed') {
    return (
      <div className={styles.page}>
        {loginState.state === 'failed' ? <p className={styles.error} role="status">{loginState.message}</p> : null}
        {/* A failed attempt leaves the choices on screen, so signing in again is
            one press rather than a reload. */}
        <SignInCard
          t={t}
          loginState={loginState.state === 'failed' ? { state: 'idle' } : loginState}
          deployment={deployment}
          planKind={planKind}
          onDeployment={setDeployment}
          onPlanKind={setPlanKind}
          onSignIn={signIn}
          onCancel={() => { void cancelLogin() }}
        />
      </div>
    )
  }

  const completedNotice = notice === undefined || Date.now() - notice.at > COMPLETION_NOTICE_MS
    ? undefined
    : notice.kind

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <dl className={styles.heroFacts}>
          <FactRow label={t('planAccount')} value={account.accountLabel} />
          <FactRow
            label={t('planDeployment')}
            value={t(account.deployment === 'zai' ? 'planDeploymentZai' : 'planDeploymentBigmodel')}
          />
          <FactRow label={t('planKind')} value={t(planKindKey(account.planKind))} />
          {account.jwtExpiresAt === undefined ? null : (
            <FactRow
              label={t('planTokenExpiry')}
              stale={account.jwtExpired}
              value={account.jwtExpired
                ? t('planTokenExpired')
                : resetTimeText(locale, account.jwtExpiresAt, 'dateTime')}
            />
          )}
        </dl>
        {/* The stamp and the one account action share a row, so the foot of the
            card reads as one line rather than as two stacked blocks. */}
        <div className={styles.heroFooter}>
          <div className={styles.heroMeta}>
            <span className={styles.heroMetaItem}>{t('localNote')}</span>
          </div>
          <div className={styles.heroActions}>
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
        </div>
      </section>

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
        <p className={styles.notice} role="status">
          {t(completedNotice === 'five_hour' ? 'resetDoneFiveHour' : 'resetDoneWeek')}
        </p>
      )}
      {errorText === undefined ? null : <p className={styles.error} role="status">{errorText}</p>}

      <PlanUsagePanel t={t} loadUsage={loadUsage} />
    </div>
  )
}

/** The dictionary key naming one plan kind. */
function planKindKey(kind: PlanAccount['planKind']): 'planKindIndividual' | 'planKindTeam' | 'planKindStart' {
  if (kind === 'team-coding-plan') return 'planKindTeam'
  if (kind === 'start-plan') return 'planKindStart'
  return 'planKindIndividual'
}
