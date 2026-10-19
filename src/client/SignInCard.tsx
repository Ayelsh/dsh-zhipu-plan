/**
 * The signed-out half of the page: choosing where to sign in, and waiting for
 * the browser hand-off to finish.
 *
 * Both halves live here because they are one surface in the interface — the
 * card the page shows until an account exists. Nothing about the flow itself
 * lives here: the page owns the attempt, and this file only picks the two
 * values the attempt is started with, relays the authorize address, and reports
 * the cancel press back.
 *
 * @module dsh-zhipu-plan/client/SignInCard
 */

import { useState, type ReactNode } from 'react'
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PlanLocaleKey } from './locales.ts'
import type { PlanAccount, PlanLoginState } from './plan-types.ts'
import { styles } from './styles.ts'

/** This page's copy seat. */
type Translate = (key: PlanLocaleKey, params?: Record<string, unknown>) => string

/** The attempt as the card sees it: not started, or running. */
type IdleOrWaiting = Extract<PlanLoginState, { readonly state: 'idle' | 'waiting' }>

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
      {authorizeUrl === undefined
        ? <span className={styles.spinner} aria-hidden="true" />
        : (
          <>
            <a className={styles.authorizeLink} href={authorizeUrl} target="_blank" rel="noreferrer">{authorizeUrl}</a>
            <div className={styles.signInActions}>
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
 * Render the sign-in card: the two pickers and the one action, or the notice
 * that replaces them while the attempt runs.
 * @param props - copy seat, the attempt so far, the chosen values, and the two actions.
 * @returns the card the page shows until an account exists.
 */
export function SignInCard(props: {
  readonly t: Translate
  readonly loginState: IdleOrWaiting
  readonly deployment: PlanAccount['deployment']
  readonly planKind: PlanAccount['planKind']
  readonly onDeployment: (value: PlanAccount['deployment']) => void
  readonly onPlanKind: (value: PlanAccount['planKind']) => void
  readonly onSignIn: () => void
  readonly onCancel: () => void
}): ReactNode {
  const { t, loginState, deployment, planKind, onDeployment, onPlanKind, onSignIn, onCancel } = props
  return (
    <div className={styles.page}>
      <div className={styles.signInCard}>
        {loginState.state === 'waiting'
          ? (
            <WaitingNotice
              t={t}
              {...loginState.authorizeUrl === undefined ? {} : { authorizeUrl: loginState.authorizeUrl }}
              onCancel={onCancel}
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
                  onChange={(value) => { onDeployment(value as PlanAccount['deployment']) }}
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
                  onChange={(value) => { onPlanKind(value as PlanAccount['planKind']) }}
                />
              </div>
              <p className={styles.note}>{t('planSignInHint')}</p>
              <div className={styles.signInActions}>
                <Button variant="primary" size="md" onClick={onSignIn}>{t('planSignIn')}</Button>
              </div>
            </>
          )}
      </div>
    </div>
  )
}
