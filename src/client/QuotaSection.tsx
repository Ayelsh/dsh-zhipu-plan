/**
 * The plan's remaining quota, one card per bucket.
 *
 * The layout follows ZCode's usage page: a section header carrying the reset
 * entry and the refresh control, then one card per bucket — the five-hour
 * prompt pool, the weekly pool, and the monthly tool allowance — each showing
 * how much is left, when it refills, and a bar in that bucket's colour. A
 * bucket that is still untouched shows no reset entry, because a reset would
 * give nothing back.
 *
 * The reset entry is a small action on the card; the reset dialog it opens
 * lists every bucket's remaining share and the resets the deployment has
 * granted, with the countdown to their expiry.
 *
 * @module dsh-zhipu-plan/client/QuotaSection
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Button, IconCheckOutlineRegular, IconRefreshOutlineRegular, IconSparkleRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PlanLocaleKey } from './locales.ts'
import type { PlanQuota, PlanQuotaLimit, PlanResetKind } from './plan-types.ts'
import {
  LIMIT_COLORS, fiveHourLimit, isLimitFull, remainingPercentage, remainingText, resetTimeText, toolLimit, weeklyLimit,
} from './quota.ts'
import { canReset, countdownText, remainingSeconds, type ResetState, type ResetWindowState } from './reset.ts'
import { styles } from './styles.ts'

/** This page's copy seat. */
type Translate = (key: PlanLocaleKey, params?: Record<string, unknown>) => string

/** One bucket the cards render. */
interface QuotaCard {
  readonly key: 'fiveHour' | 'weekly' | 'tools'
  readonly label: PlanLocaleKey
  readonly limit: PlanQuotaLimit
  readonly color: string
  /** The reset window this bucket spends from, when it has one. */
  readonly kind?: PlanResetKind
}

/** What the section needs from the page. */
export interface QuotaSectionProps {
  readonly t: Translate
  /** Locale the numbers and instants are formatted in. */
  readonly locale: string
  /** The latest snapshot, or undefined before the first read lands. */
  readonly quota: PlanQuota | undefined
  /** The resets on hand, per window. */
  readonly resets: ResetState
  /** Whether a reset call is in flight. */
  readonly resetting: boolean
  /** Spend one reset of a window. */
  readonly onReset: (kind: PlanResetKind) => void
  /** Re-read the snapshot and the reset status. */
  readonly onRefresh: () => void
  /** Current epoch milliseconds, so countdowns tick with the page's clock. */
  readonly now: number
}

/** The buckets this deployment reports, in the order the cards show them. */
function cardsOf(quota: PlanQuota | undefined): QuotaCard[] {
  if (quota === undefined) return []
  const candidates: (QuotaCard | null)[] = [
    { key: 'fiveHour', label: 'quotaFiveHour', limit: fiveHourLimit(quota.limits), color: LIMIT_COLORS.fiveHour, kind: 'five_hour' } as QuotaCard,
    { key: 'weekly', label: 'quotaWeekly', limit: weeklyLimit(quota.limits), color: LIMIT_COLORS.weekly, kind: 'week' } as QuotaCard,
    { key: 'tools', label: 'quotaTools', limit: toolLimit(quota.limits), color: LIMIT_COLORS.tools } as QuotaCard,
  ]
  return candidates.filter((card): card is QuotaCard => card.limit !== null)
}

/**
 * The reset action a card shows next to its label: the entry that opens the
 * dialog, a spinner while a reset runs, or the completion mark afterwards.
 */
function ResetAction(props: {
  readonly t: Translate
  readonly kind: PlanResetKind
  readonly state: ResetWindowState
  readonly busy: boolean
  readonly onOpen: () => void
}): ReactNode {
  const { t, kind, state, busy, onOpen } = props
  if (state.status === 'completed') {
    return (
      <span className={styles.resetDone}>
        <IconCheckOutlineRegular size={12} />
        {t('resetCompleted')}
      </span>
    )
  }
  if (state.status === 'processing' && busy) {
    return <span className={styles.resetPending}>{t(kind === 'five_hour' ? 'resetProcessingFiveHour' : 'resetProcessingWeek')}</span>
  }
  if (!canReset(state)) return null
  return (
    <button
      type="button"
      className={styles.resetEntry}
      aria-label={t(kind === 'five_hour' ? 'resetAriaFiveHour' : 'resetAriaWeek')}
      onClick={onOpen}
    >
      <IconSparkleRegular size={12} />
      {t('reset')}
    </button>
  )
}

/** One bucket's card. */
function QuotaCardView(props: {
  readonly t: Translate
  readonly locale: string
  readonly card: QuotaCard
  readonly state: ResetWindowState | undefined
  readonly busy: boolean
  readonly onOpenDialog: () => void
}): ReactNode {
  const { t, locale, card, state, busy, onOpenDialog } = props
  const remaining = remainingPercentage(card.limit)
  const resetAt = resetTimeText(locale, card.limit.nextResetTime)
  return (
    <div className={styles.quotaCard}>
      <div className={styles.quotaCardHead}>
        <span className={styles.quotaCardLabel}>{t(card.label)}</span>
        {card.kind === undefined || state === undefined
          ? null
          : <ResetAction t={t} kind={card.kind} state={state} busy={busy} onOpen={onOpenDialog} />}
      </div>
      <div className={styles.quotaCardFigures}>
        <span className={styles.quotaCardValue}>{remainingText(locale, card.limit)}</span>
        {resetAt === undefined ? null : <span className={styles.quotaCardReset}>{resetAt}</span>}
      </div>
      <div className={styles.quotaBar}>
        <div
          className={styles.quotaBarFill}
          style={{ width: `${String(remaining ?? 0)}%`, backgroundColor: card.color }}
        />
      </div>
    </div>
  )
}

/**
 * Render the quota section with its cards, reset entry, and reset dialog.
 * @param props - copy seat, the snapshot, the reset state, and the two actions.
 * @returns the section, or nothing before the first snapshot lands.
 */
export function QuotaSection(props: QuotaSectionProps): ReactNode {
  const { t, locale, quota, resets, resetting, onReset, onRefresh, now } = props
  const [dialogOpen, setDialogOpen] = useState(false)
  const cards = cardsOf(quota)
  if (cards.length === 0) return null

  const granted = [
    { key: 'five_hour' as const, state: resets.fiveHour },
    { key: 'week' as const, state: resets.week },
  ].filter(entry => entry.state.status === 'available' && entry.state.count > 0)
  const grantCount = granted.reduce((total, entry) => total + entry.state.count, 0)
  const earliestExpiry = granted.reduce<number | undefined>(
    (earliest, entry) => entry.state.expiresAt === undefined
      ? earliest
      : earliest === undefined ? entry.state.expiresAt : Math.min(earliest, entry.state.expiresAt),
    undefined,
  )

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadLeft}>
          <h3 className={styles.sectionTitle}>{t('quotaTitle')}</h3>
          {grantCount === 0 ? null : (
            <button type="button" className={styles.resetBadge} onClick={() => { setDialogOpen(true) }}>
              <IconSparkleRegular size={12} />
              <span>{t('resetOpportunity', { count: grantCount })}</span>
              {earliestExpiry === undefined ? null : (
                <span className={styles.resetBadgeCountdown}>
                  {t('resetCountdown', { time: countdownText(remainingSeconds(earliestExpiry, now), t) })}
                </span>
              )}
            </button>
          )}
        </div>
        <div className={styles.sectionHeadRight}>
          <span className={styles.sectionMeta}>
            {quota?.stale === true ? t('quotaStale') : t('quotaUpdatedAt', { time: resetTimeText(locale, quota?.fetchedAt, 'dateTime') })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('refresh')}
            onClick={() => { onRefresh() }}
          >
            <IconRefreshOutlineRegular size={14} />
          </Button>
        </div>
      </div>
      <div className={styles.quotaCards}>
        {cards.map(card => (
          <QuotaCardView
            key={card.key}
            t={t}
            locale={locale}
            card={card}
            state={card.kind === 'five_hour' ? resets.fiveHour : card.kind === 'week' ? resets.week : undefined}
            busy={resetting}
            onOpenDialog={() => { setDialogOpen(true) }}
          />
        ))}
      </div>
      <ResetDialog
        t={t}
        locale={locale}
        open={dialogOpen}
        cards={cards}
        resets={resets}
        resetting={resetting}
        now={now}
        onClose={() => { setDialogOpen(false) }}
        onReset={onReset}
      />
    </section>
  )
}

/** The reset dialog: what each bucket has left, and what may be reset. */
function ResetDialog(props: {
  readonly t: Translate
  readonly locale: string
  readonly open: boolean
  readonly cards: readonly QuotaCard[]
  readonly resets: ResetState
  readonly resetting: boolean
  readonly now: number
  readonly onClose: () => void
  readonly onReset: (kind: PlanResetKind) => void
}): ReactNode {
  const { t, locale, open, cards, resets, resetting, now, onClose, onReset } = props
  // One tick a second keeps the countdown honest while the dialog is open.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => { setTick(value => value + 1) }, 1_000)
    return () => { window.clearInterval(timer) }
  }, [open])

  if (!open) return null
  const rows = [
    { kind: 'five_hour' as const, label: 'resetDialogFiveHour' as const, labelLong: 'resetProcessingFiveHour' as const, state: resets.fiveHour },
    { kind: 'week' as const, label: 'resetDialogWeek' as const, labelLong: 'resetProcessingWeek' as const, state: resets.week },
  ].filter(row => row.state.status === 'available' || row.state.status === 'processing' || row.state.status === 'completed')

  return (
    <Modal open={open} onClose={onClose} title={t('resetDialogTitle')} closeLabel={t('planCancel')}>
      <div className={styles.dialogBody}>
        <section className={styles.dialogSection}>
          <h4 className={styles.dialogSectionTitle}>{t('resetDialogRemaining')}</h4>
          {cards.map(card => {
            const remaining = remainingPercentage(card.limit)
            const resetAt = resetTimeText(locale, card.limit.nextResetTime, 'dateTime')
            return (
              <div key={card.key} className={styles.dialogUsageRow}>
                <span className={styles.dialogUsageLabel}>{t(card.label)}</span>
                <span className={styles.dialogUsageValue}>{remainingText(locale, card.limit)}</span>
                {resetAt === undefined ? null : <span className={styles.dialogUsageMeta}>{resetAt}</span>}
                <div className={styles.quotaBar}>
                  <div
                    className={styles.quotaBarFill}
                    style={{ width: `${String(remaining ?? 0)}%`, backgroundColor: card.color }}
                  />
                </div>
              </div>
            )
          })}
        </section>
        {rows.length === 0 ? null : (
          <section className={styles.dialogSection}>
            <h4 className={styles.dialogSectionTitle}>{t('resetDialogResettable')}</h4>
            {rows.map((row) => {
              const seconds = remainingSeconds(row.state.expiresAt, now)
              const processing = row.state.status === 'processing' && resetting
              const done = row.state.status === 'completed'
              return (
                <div key={row.kind} className={styles.dialogResetRow}>
                  <div className={styles.dialogResetInfo}>
                    <span className={styles.dialogResetLabel}>
                      {t(row.label)}
                      {row.state.count > 1 ? <span className={styles.countPill}>{t('resetItemCount', { count: row.state.count })}</span> : null}
                    </span>
                    <span className={styles.dialogResetMeta}>
                      {done
                        ? t('resetCompletedAt', {
                          time: resetTimeText(locale, row.state.usedAt, 'dateTime'),
                        })
                        : row.state.expiresAt === undefined
                          ? t('resetUnavailable')
                          : t(row.state.count > 1 ? 'resetExpiresInSoonest' : 'resetExpiresIn', {
                            time: countdownText(seconds, t),
                          })}
                    </span>
                  </div>
                  <Button
                    variant={done ? 'outline' : 'primary'}
                    size="sm"
                    disabled={done || processing}
                    onClick={() => { onReset(row.kind) }}
                  >
                    {done
                      ? <><IconCheckOutlineRegular size={14} />{t('resetCompleted')}</>
                      : processing ? t(row.labelLong) : t('reset')}
                  </Button>
                </div>
              )
            })}
          </section>
        )}
      </div>
    </Modal>
  )
}
