/**
 * The server-side usage behind the quota cards: what the deployment recorded
 * for this account over a chosen window — per-model and per-tool totals, daily
 * activity, cache health, decode speed, and the subscription the account
 * holds.
 *
 * Every figure here is the server's; nothing is derived or estimated locally.
 * The surface is read-only: it chooses a window, reads it, and reports what came
 * back — including the wait for it.
 *
 * Each window owns its own read state, and a switch holds the loading
 * placeholder until the chosen window's own answer arrives: the pressed tab,
 * the direction-aware swap, the progress line, the spinner, and the skeleton
 * all answer in the same frame, and nothing of the window that was left behind
 * stays on screen while its replacement is read. The in-flight read is aborted
 * when the chosen window changes again, because the answer for a window nobody
 * is looking at is work worth dropping.
 *
 * @module dsh-zhipu-plan/client/PlanUsagePanel
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PlanLocaleKey } from './locales.ts'
import type { PlanDecodeSpeed, PlanUsageRange, PlanUsageReport } from './plan-types.ts'
import { tokenText } from './token-text.ts'
import { staggerAt, styles } from './styles.ts'

/** This page's copy seat. */
type Translate = (key: PlanLocaleKey, params?: Record<string, unknown>) => string

/** Every range the surface offers, in order. */
const RANGES: readonly PlanUsageRange[] = ['7d', '30d', 'all']

/** Milliseconds in one hour, for the "time spent" figure. */
const HOUR_MS = 3_600_000

/** How many stand-in rows the tables show while the window is being read. */
const SKELETON_ROWS = 3

/** The direction the content travels when the chosen window moves. */
type SwapDirection = 'none' | 'next' | 'prev'

/** One window's read state; the answer is carried only once it has arrived. */
interface RangeLoad {
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly report?: PlanUsageReport
}

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

/** The rows a table shows while the window is being read. */
function SkeletonRows(props: { readonly columns: number }): ReactNode {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: props.columns }, (_, column) => (
            <td key={column}>
              <span className={styles.skeleton} data-cell="true" style={staggerAt(row)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/**
 * Render the window's usage: models, tools, activity, and subscriptions.
 * @param props - copy seat and the host read.
 * @returns the range tabs and the window's figures.
 */
export function PlanUsagePanel(props: {
  readonly t: Translate
  readonly loadUsage: (range: PlanUsageRange, signal?: AbortSignal) => Promise<PlanUsageReport | undefined>
}): ReactNode {
  const { t, loadUsage } = props
  const [swap, setSwap] = useState<{ readonly range: PlanUsageRange; readonly direction: SwapDirection }>({
    range: '7d',
    direction: 'none',
  })
  const [loads, setLoads] = useState<Partial<Record<PlanUsageRange, RangeLoad>>>({})
  const [attempt, setAttempt] = useState(0)
  const range = swap.range
  const tabRefs = useRef(new Map<PlanUsageRange, HTMLButtonElement>())
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const tabId = (candidate: PlanUsageRange): string => `${baseId}-tab-${candidate}`

  const selectRange = (next: PlanUsageRange): void => {
    if (next === range) return
    setSwap({
      range: next,
      direction: RANGES.indexOf(next) > RANGES.indexOf(range) ? 'next' : 'prev',
    })
  }

  // One read per chosen window: the switch puts the window into its loading
  // state at once and the placeholder holds until this window's own answer
  // lands, and the read the previous window left running is aborted, because
  // the answer for a window nobody is looking at is work worth dropping.
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoads(previous => ({ ...previous, [range]: { phase: 'loading' } }))
    loadUsage(range, controller.signal).then(
      (loaded) => {
        if (!current) return
        setLoads(previous => ({
          ...previous,
          [range]: loaded === undefined
            ? { phase: 'failed' }
            : { phase: 'ready', report: loaded },
        }))
      },
      () => {
        if (!current) return
        setLoads(previous => ({ ...previous, [range]: { phase: 'failed' } }))
      },
    )
    return () => {
      current = false
      controller.abort()
    }
  }, [range, attempt, loadUsage])

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, candidate: PlanUsageRange): void => {
    const index = RANGES.indexOf(candidate)
    let next: PlanUsageRange
    if (event.key === 'ArrowRight') next = RANGES[(index + 1) % RANGES.length] ?? candidate
    else if (event.key === 'ArrowLeft') next = RANGES[(index - 1 + RANGES.length) % RANGES.length] ?? candidate
    else if (event.key === 'Home') next = RANGES[0] ?? candidate
    else if (event.key === 'End') next = RANGES[RANGES.length - 1] ?? candidate
    else return
    event.preventDefault()
    selectRange(next)
    tabRefs.current.get(next)?.focus()
  }

  const current = loads[range]
  const report = current?.phase === 'ready' ? current.report : undefined
  const loading = current === undefined || current.phase === 'loading'
  const failed = current?.phase === 'failed'
  // Active days are the days that reported usage, not every day the monitor
  // pads the series with: a year of zero-token days is still one active day.
  const activeDays = report === undefined
    ? 0
    : report.activity.days.filter(day => day.tokens > 0).length
  const empty = report !== undefined
    && report.models.models.length === 0
    && report.tools.tools.length === 0
    && activeDays === 0
  const decode = report === undefined ? undefined : decodeText(t, report.decodeSpeed)
  // An all-time window reads the activity summary over the year (the lifetime
  // figures) and the breakdown families over their latest month, so the two
  // breakdown sections say which span they cover.
  const monthScoped = range === 'all'
  const rangeLabel: Record<PlanUsageRange, PlanLocaleKey> = { '7d': 'range7d', '30d': 'range30d', all: 'rangeAll' }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{t('usageTitle')}</h3>
        <div className={styles.rangeTabs} role="tablist" aria-label={t('usageTitle')}>
          {RANGES.map((candidate) => {
            const selected = candidate === range
            return (
              <button
                key={candidate}
                ref={(node) => {
                  if (node === null) tabRefs.current.delete(candidate)
                  else tabRefs.current.set(candidate, node)
                }}
                id={tabId(candidate)}
                type="button"
                role="tab"
                className={styles.rangeTab}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                data-loading={selected && loading ? 'true' : undefined}
                onClick={() => { selectRange(candidate) }}
                onKeyDown={(event) => { onTabKeyDown(event, candidate) }}
              >
                {t(rangeLabel[candidate])}
              </button>
            )
          })}
        </div>
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(range)}
        aria-busy={loading || undefined}
        tabIndex={0}
        className={styles.usagePanel}
      >
        {/* Remounted per window: the selected tab is answered with the content
            travelling in from the side the selection came from. */}
        <div key={range} className={styles.usageSwap} data-direction={swap.direction}>
          {loading ? <div className={styles.usageProgress} aria-hidden="true" /> : null}

          {failed
            ? (
              <div className={styles.usageFailure} role="status">
                <p className={styles.warning}>{t('usageFailed')}</p>
                <button
                  type="button"
                  className={styles.usageRetry}
                  onClick={() => { setAttempt(value => value + 1) }}
                >
                  {t('refresh')}
                </button>
              </div>
            )
            : null}

          {loading
            ? (
              <div className={styles.usageBlock} role="status">
                <p className={styles.usageStatus}>
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>{t('usageLoading')}</span>
                </p>
                <table className={styles.usageTable}>
                  <thead>
                    <tr>
                      <th>{t('usageModel')}</th>
                      <th>{t('usageTokens')}</th>
                      <th>{t('usageShare')}</th>
                    </tr>
                  </thead>
                  <tbody><SkeletonRows columns={3} /></tbody>
                </table>
              </div>
            )
            : null}

          {report === undefined
            ? null
            : empty
              ? <p className={styles.emptyState} role="status">{t('usageEmpty')}</p>
              : (
                <div className={styles.usageSection}>
                  {report.models.models.length === 0 ? null : (
                    <>
                      <div className={styles.usageSectionHead}>
                        <h4 className={styles.dialogSectionTitle}>{t('usageModels')}</h4>
                        {monthScoped ? <span className={styles.sectionMeta}>{t('range30d')}</span> : null}
                      </div>
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
                    </>
                  )}

                  {report.tools.tools.length === 0 ? null : (
                    <>
                      <div className={styles.usageSectionHead}>
                        <h4 className={styles.dialogSectionTitle}>{t('usageTools')}</h4>
                        {monthScoped ? <span className={styles.sectionMeta}>{t('range30d')}</span> : null}
                      </div>
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
                    </>
                  )}

                  <dl className={styles.facts}>
                    <Fact label={t('usageActiveDays')} value={String(activeDays)} />
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
                      : (
                        <Fact
                          label={monthScoped ? `${t('usageCacheHit')} (${t('range30d')})` : t('usageCacheHit')}
                          value={`${(report.credits.cacheHitRate * 100).toFixed(1)}%`}
                        />
                      )}
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
        </div>
      </div>
    </section>
  )
}
