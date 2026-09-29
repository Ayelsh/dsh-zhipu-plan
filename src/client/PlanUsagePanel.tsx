/**
 * The server-side usage behind the quota cards: what the deployment recorded
 * for this account over a chosen window — per-model and per-tool totals, daily
 * activity, cache health, decode speed, and the subscription the account
 * holds.
 *
 * Every figure here is the server's; nothing is derived or estimated locally.
 *
 * @module dsh-zhipu-plan/client/PlanUsagePanel
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { PlanLocaleKey } from './locales.ts'
import type { PlanDecodeSpeed, PlanUsageRange, PlanUsageReport } from './plan-types.ts'
import { tokenText } from './token-text.ts'
import { styles } from './styles.ts'

/** This page's copy seat. */
type Translate = (key: PlanLocaleKey, params?: Record<string, unknown>) => string

/** Every range the surface offers, in order. */
const RANGES: readonly PlanUsageRange[] = ['7d', '30d', 'all']

/** Milliseconds in one hour, for the "time spent" figure. */
const HOUR_MS = 3_600_000

/** Percentage text for one share of the window total. */
function shareText(tokens: number, total: number): string {
  if (total <= 0) return '—'
  return `${String(Math.round((tokens / total) * 100))}%`
}

/** The newest reported value in a series, ignoring trailing zeroes the monitor pads with. */
function latestReported(series: readonly number[]): number | undefined {
  let latest: number | undefined
  for (const value of series) {
    if (value > 0) latest = value
  }
  return latest
}

/**
 * The decode-speed line for the window, or undefined when no tier reported a figure.
 * @param t - copy seat.
 * @param speed - the window's per-tier series.
 * @returns the reported tiers' latest rates, or undefined when there are none.
 */
function decodeText(t: Translate, speed: PlanDecodeSpeed): string | undefined {
  const reported = [
    { label: t('usageDecodePro'), value: latestReported(speed.proMax) },
    { label: t('usageDecodeLite'), value: latestReported(speed.lite) },
  ].filter((entry): entry is { readonly label: string; readonly value: number } => entry.value !== undefined)
  if (reported.length === 0) return undefined
  return reported.map(entry => `${entry.label} ${entry.value.toFixed(1)} tok/s`).join(' · ')
}

/** One labelled fact row. */
function Fact(props: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <div className={styles.factRow}>
      <dt className={styles.factLabel}>{props.label}</dt>
      <dd className={styles.factValue}>{props.value}</dd>
    </div>
  )
}

/**
 * Render the window's usage: models, tools, activity, and subscriptions.
 * @param props - copy seat and the host read.
 * @returns the range tabs and the window's figures.
 */
export function PlanUsagePanel(props: {
  readonly t: Translate
  readonly loadUsage: (range: PlanUsageRange) => Promise<PlanUsageReport | undefined>
}): ReactNode {
  const { t, loadUsage } = props
  const [range, setRange] = useState<PlanUsageRange>('7d')
  const [report, setReport] = useState<PlanUsageReport | undefined>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const current = { cancelled: false }
    loadUsage(range).then(
      (loaded) => {
        if (current.cancelled) return
        setReport(loaded)
        setFailed(loaded === undefined)
      },
      () => {
        if (current.cancelled) return
        setFailed(true)
      },
    )
    return () => { current.cancelled = true }
  }, [range, loadUsage])

  const decode = report === undefined ? undefined : decodeText(t, report.decodeSpeed)
  const empty = report !== undefined
    && report.models.models.length === 0
    && report.tools.tools.length === 0
    && report.activity.days.length === 0
  const rangeLabel: Record<PlanUsageRange, PlanLocaleKey> = { '7d': 'range7d', '30d': 'range30d', all: 'rangeAll' }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{t('usageTitle')}</h3>
        <div className={styles.rangeTabs} role="group" aria-label={t('usageTitle')}>
          {RANGES.map(candidate => (
            <button
              key={candidate}
              type="button"
              className={styles.rangeTab}
              aria-pressed={candidate === range}
              onClick={() => { setRange(candidate) }}
            >
              {t(rangeLabel[candidate])}
            </button>
          ))}
        </div>
      </div>
      {failed
        ? <p className={styles.warning}>{t('usageFailed')}</p>
        : report === undefined
          ? <p className={styles.status}>{t('usageLoading')}</p>
          : empty
            ? <p className={styles.status}>{t('usageEmpty')}</p>
            : (
              <div className={styles.usageSection}>
                <h4 className={styles.dialogSectionTitle}>{t('usageModels')}</h4>
                <table className={styles.usageTable}>
                  <thead>
                    <tr>
                      <th>{t('usageModel')}</th>
                      <th>{t('usageTokens')}</th>
                      <th>{t('usageShare')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.models.models.map(model => (
                      <tr key={model.model}>
                        <td>{model.model}</td>
                        <td>{tokenText(model.tokens)}</td>
                        <td>{shareText(model.tokens, report.models.tokens)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>{t('usageCalls')}</td>
                      <td>{String(report.models.calls)}</td>
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>

                <h4 className={styles.dialogSectionTitle}>{t('usageTools')}</h4>
                <table className={styles.usageTable}>
                  <thead>
                    <tr>
                      <th>{t('toolName')}</th>
                      <th>{t('toolCalls')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.tools.tools.map(tool => (
                      <tr key={tool.tool}>
                        <td>{tool.tool}</td>
                        <td>{String(tool.calls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <dl className={styles.facts}>
                  <Fact label={t('usageActiveDays')} value={String(report.activity.days.length)} />
                  <Fact
                    label={t('usagePeakDay')}
                    value={`${tokenText(report.activity.peakDayTokens)}${report.activity.peakDay === undefined ? '' : ` (${report.activity.peakDay})`}`}
                  />
                  <Fact
                    label={t('usageStreak')}
                    value={`${String(report.activity.currentStreakDays)} / ${String(report.activity.longestStreakDays)}`}
                  />
                  <Fact label={t('usageUsageTime')} value={`${(report.activity.totalUsageMs / HOUR_MS).toFixed(1)} h`} />
                  {report.credits.cacheHitRate === undefined
                    ? null
                    : <Fact label={t('usageCacheHit')} value={`${(report.credits.cacheHitRate * 100).toFixed(1)}%`} />}
                  {decode === undefined ? null : <Fact label={t('usageDecodeSpeed')} value={decode} />}
                </dl>

                {report.subscriptions.length === 0 ? null : (
                  <>
                    <h4 className={styles.dialogSectionTitle}>{t('subscription')}</h4>
                    <dl className={styles.facts}>
                      {report.subscriptions.map(subscription => (
                        <Fact
                          key={subscription.productName}
                          label={subscription.productName}
                          value={[
                            subscription.renewTime === undefined ? undefined : t('subscriptionRenew', { time: subscription.renewTime }),
                            subscription.billingCycle === undefined ? undefined : t('subscriptionCycle', { cycle: subscription.billingCycle }),
                            subscription.autoRenew ? t('subscriptionAutoRenew') : undefined,
                          ].filter((entry): entry is string => entry !== undefined).join(' · ')}
                        />
                      ))}
                    </dl>
                  </>
                )}
              </div>
            )}
    </section>
  )
}
