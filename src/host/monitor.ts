/**
 * The plan's server-side usage read model: the monitor endpoints that break a
 * window down by model, by tool, and by day, plus the subscription list the
 * account holds. Every call authenticates with the plan key itself and rides
 * the process proxy like the quota read it sits beside.
 *
 * The endpoint paths are the ones ZCode uses against the same monitor: the
 * usage family lives under `/api/monitor/usage/`, the credit family directly
 * under `/api/monitor/credit-usage/`, and both take `startTime`/`endTime` as
 * `YYYY-MM-DD HH:mm:ss` in the caller's zone.
 *
 * @module dsh-zhipu-plan/host/monitor
 */

import { scopeHeaders } from './quota.ts'
import type {
  PlanActivityDay,
  PlanActivitySummary,
  PlanCreditSummary,
  PlanModelShare,
  PlanModelUsage,
  PlanSubscription,
  PlanToolUsage,
  PlanUsageRange,
  ZhipuPlanDeployment,
} from './types.ts'

/** Monitor authorization and addressing shared by every read in this module. */
export interface MonitorReadInput {
  /** Deployment the account belongs to; selects nothing here but travels with the answer. */
  readonly deployment: ZhipuPlanDeployment
  /** The account's plan API key, which the monitor authenticates with. */
  readonly planKey: string
  /** Monitor origin for the deployment. */
  readonly monitorOrigin: string
  /**
   * Organization and project a team key belongs to. A scoped read names the
   * project its key was issued for and asks the team routing (`type=2` for the
   * usage family, `type=3` for the credit family) instead of the personal one.
   */
  readonly scope?: { readonly organizationId: string; readonly projectId: string }
  readonly requestTimeoutMs: number
  readonly signal: AbortSignal | undefined
}

interface MonitorEnvelope {
  readonly success?: unknown
  readonly code?: unknown
  readonly msg?: unknown
  readonly data?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Numbers a monitor series may carry as strings; absent or unreadable entries become 0. */
function readSeries(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry
    if (typeof entry === 'string') {
      const parsed = Number.parseFloat(entry)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
  })
}

/** One monitor answer's `data`, or a refusal the caller renders as an error. */
async function callMonitor(input: MonitorReadInput, path: string): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs)
  const composed = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout])
  const response = await fetch(`${input.monitorOrigin}${path}`, {
    headers: { Authorization: `Bearer ${input.planKey}`, ...scopeHeaders(input.scope) },
    signal: composed,
  })
  const text = await response.text()
  // The refusal body is not always the envelope: a gateway answers HTML or
  // plain text, so the status is graded before anything is parsed.
  if (!response.ok) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`)
  }
  const envelope = JSON.parse(text) as MonitorEnvelope
  if (envelope['success'] === false) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`)
  }
  return isRecord(envelope.data) ? envelope.data : {}
}

/** Days a range covers; `all` asks the monitor for its longest window. */
const RANGE_DAYS: Record<PlanUsageRange, number> = { '7d': 7, '30d': 30, all: 180 }

/** One day-key in the caller's zone, as the monitor's window parameters are spelled. */
function dayKey(time: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(time))
}

/**
 * The monitor window one range asks for.
 * @param range - the surface's chosen window.
 * @param timeZone - zone the day keys are expressed in.
 * @param now - current epoch milliseconds.
 * @returns the `startTime`/`endTime` parameters in `YYYY-MM-DD HH:mm:ss`.
 */
export function usageWindow(range: PlanUsageRange, timeZone: string, now: number): string {
  const end = `${dayKey(now, timeZone)} 23:59:59`
  const startTime = now - (RANGE_DAYS[range] - 1) * 86_400_000
  return `startTime=${encodeURIComponent(`${dayKey(startTime, timeZone)} 00:00:00`)}&endTime=${encodeURIComponent(end)}`
}

/**
 * The window parameters plus the team routing type when the account has a scope.
 * @param input - the read's addressing, carrying the optional team scope.
 * @param teamType - the `type` value the team routing uses for this family.
 * @param window - the `startTime`/`endTime` query string.
 * @returns the query string with `type` prepended when the account is scoped.
 */
function withScopeType(input: MonitorReadInput, teamType: string, window: string): string {
  return input.scope === undefined ? window : `type=${teamType}&${window}`
}

/**
 * Read the window's per-model usage.
 * @param input - monitor addressing and authorization.
 * @param window - the `startTime`/`endTime` query string.
 * @returns per-model totals, the day keys they span, and the overall call count.
 */
export async function fetchModelUsage(input: MonitorReadInput, window: string): Promise<PlanModelUsage> {
  const data = await callMonitor(input, `/api/monitor/usage/model-usage?${withScopeType(input, '2', window)}`)
  const totals = isRecord(data['totalUsage']) ? data['totalUsage'] : {}
  const summaryList = Array.isArray(totals['modelSummaryList'])
    ? totals['modelSummaryList']
    : Array.isArray(data['modelSummaryList']) ? data['modelSummaryList'] : []
  const models: PlanModelShare[] = summaryList
    .flatMap((entry) => {
      if (!isRecord(entry)) return []
      const name = readString(entry['modelName'])
      if (name === undefined) return []
      return [{ model: name, tokens: readNumber(entry['totalTokens']) ?? 0 }]
    })
  return {
    days: (Array.isArray(data['x_time']) ? data['x_time'] : []).flatMap(entry => readString(entry) ?? []),
    calls: readNumber(totals['totalModelCallCount']) ?? 0,
    tokens: readNumber(totals['totalTokensUsage']) ?? 0,
    models,
  }
}

/**
 * Read the window's per-tool usage.
 * @param input - monitor addressing and authorization.
 * @param window - the `startTime`/`endTime` query string.
 * @returns per-tool call totals plus the search and read counts the monitor leads with.
 */
export async function fetchToolUsage(input: MonitorReadInput, window: string): Promise<PlanToolUsage> {
  const data = await callMonitor(input, `/api/monitor/usage/tool-usage?${withScopeType(input, '2', window)}`)
  const totals = isRecord(data['totalUsage']) ? data['totalUsage'] : {}
  const summaryList = Array.isArray(totals['toolSummaryList'])
    ? totals['toolSummaryList']
    : Array.isArray(data['toolSummaryList']) ? data['toolSummaryList'] : []
  const tools = summaryList
    .flatMap((entry) => {
      if (!isRecord(entry)) return []
      const name = readString(entry['toolName']) ?? readString(entry['toolCode'])
      if (name === undefined) return []
      return [{ tool: name, calls: readNumber(entry['totalUsageCount']) ?? 0 }]
    })
  return {
    searches: readNumber(totals['totalNetworkSearchCount']) ?? 0,
    webReads: readNumber(totals['totalWebReadMcpCount']) ?? 0,
    zreads: readNumber(totals['totalZreadMcpCount']) ?? 0,
    tools,
  }
}

/**
 * Read the window's activity summary and daily series.
 * @param input - monitor addressing and authorization.
 * @param window - the `startTime`/`endTime` query string.
 * @returns the day series plus the totals, streaks, and peak day the monitor reports.
 */
export async function fetchActivity(input: MonitorReadInput, window: string): Promise<PlanActivitySummary> {
  const data = await callMonitor(input, `/api/monitor/credit-usage/activity?type=${input.scope === undefined ? '1' : '3'}&${window}`)
  const summary = isRecord(data['summary']) ? data['summary'] : {}
  const days: PlanActivityDay[] = (Array.isArray(data['series']) ? data['series'] : [])
    .flatMap((entry) => {
      if (!isRecord(entry)) return []
      const date = readString(entry['date'])
      if (date === undefined) return []
      return [{ date, tokens: readNumber(entry['totalTokens']) ?? 0, mcpCalls: readNumber(entry['mcpCalls']) ?? 0 }]
    })
  const peakDay = readString(summary['peakDailyTokensDate'])
  return {
    days,
    totalTokens: readNumber(summary['totalTokens']) ?? 0,
    peakDayTokens: readNumber(summary['peakDailyTokens']) ?? 0,
    ...peakDay === undefined ? {} : { peakDay },
    totalUsageMs: readNumber(summary['totalUsageDurationMs']) ?? 0,
    currentStreakDays: readNumber(summary['currentStreakDays']) ?? 0,
    longestStreakDays: readNumber(summary['longestStreakDays']) ?? 0,
  }
}

/**
 * Read the window's credit summary and cache-hit health.
 * @param input - monitor addressing and authorization.
 * @param window - the `startTime`/`endTime` query string.
 * @returns the reported rates and totals; unreadable figures are absent, never zero.
 */
export async function fetchCreditSummary(input: MonitorReadInput, window: string): Promise<PlanCreditSummary> {
  const data = await callMonitor(input, `/api/monitor/credit-usage/usage-detail?type=${input.scope === undefined ? '1' : '3'}&${window}&usageType=MODEL`)
  const summary = isRecord(data['summary']) ? data['summary'] : {}
  const metric = (key: string): number | undefined => {
    const entry = summary[key]
    if (!isRecord(entry)) return undefined
    const value = entry['value']
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }
  const cacheHitRate = metric('cacheHitRate')
  const offPeakRate = metric('offPeakUsageRate')
  const totalCredits = metric('totalCredits')
  return {
    ...cacheHitRate === undefined ? {} : { cacheHitRate },
    ...offPeakRate === undefined ? {} : { offPeakRate },
    ...totalCredits === undefined ? {} : { totalCredits },
  }
}

/**
 * Read the window's decode-speed series.
 * @param input - monitor addressing and authorization.
 * @param window - the `startTime`/`endTime` query string.
 * @returns the days and the per-tier token-per-second series the monitor reports.
 */
export async function fetchDecodeSpeed(input: MonitorReadInput, window: string): Promise<{
  readonly days: readonly string[]
  readonly proMax: readonly number[]
  readonly lite: readonly number[]
}> {
  const data = await callMonitor(input, `/api/monitor/usage/model-performance-day?${window}`)
  return {
    days: (Array.isArray(data['x_time']) ? data['x_time'] : []).flatMap(entry => readString(entry) ?? []),
    proMax: readSeries(data['proMaxDecodeSpeed']),
    lite: readSeries(data['liteDecodeSpeed']),
  }
}

/**
 * Read the subscriptions the account holds. A scoped (team) account reads its
 * team subscription detail, which the business API isolates per organization
 * and project; an account-wide key reads the personal subscription list.
 * @param input - monitor addressing and authorization.
 * @param businessToken - the deployment access token a team read authenticates with.
 * @returns every subscription whose product is a coding plan, newest first.
 */
export async function fetchSubscriptionList(
  input: MonitorReadInput,
  businessToken: string,
): Promise<readonly PlanSubscription[]> {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs)
  const composed = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout])
  if (input.scope !== undefined) {
    const response = await fetch(`${input.monitorOrigin}/api/biz/team/subscribe/product/querySubscribeDetail`, {
      headers: {
        Authorization: input.deployment === 'zai' ? `Bearer ${businessToken}` : businessToken,
        ...scopeHeaders(input.scope),
      },
      signal: composed,
    })
    return readTeamSubscription(response)
  }
  const response = await fetch(`${input.monitorOrigin}/api/biz/subscription/list`, {
    headers: { Authorization: `Bearer ${input.planKey}` },
    signal: composed,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`)
  }
  const envelope = JSON.parse(text) as MonitorEnvelope
  if (envelope['success'] === false) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`)
  }
  const entries = Array.isArray(envelope.data) ? envelope.data : []
  return entries.flatMap((entry): PlanSubscription[] => {
    if (!isRecord(entry)) return []
    const productName = readString(entry['productName'])
    const status = readString(entry['status'])
    if (productName === undefined || status === undefined) return []
    const renewTime = readString(entry['nextRenewTime'])
    const billingCycle = readString(entry['billingCycle'])
    const valid = readString(entry['valid'])
    const period = readNumber(entry['currentPeriod'])
    return [{
      productName,
      status,
      inCurrentPeriod: entry['inCurrentPeriod'] === true,
      autoRenew: entry['autoRenew'] === 1 || entry['autoRenew'] === true,
      ...renewTime === undefined ? {} : { renewTime },
      ...billingCycle === undefined ? {} : { billingCycle },
      ...valid === undefined ? {} : { validRange: valid },
      ...period === undefined ? {} : { period },
    }]
  })
}

/**
 * One team subscription answer as the surface renders it.
 * @param response - the business API's answer.
 * @returns the subscription when the account holds one, else an empty list.
 * @throws Error when the service refuses or answers unreadably.
 */
async function readTeamSubscription(response: Response): Promise<readonly PlanSubscription[]> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`)
  }
  const envelope = JSON.parse(text) as MonitorEnvelope
  if (envelope['success'] === false) {
    throw new Error(`the plan service refused the subscription list (HTTP ${String(response.status)})`)
  }
  const data = envelope.data
  if (!isRecord(data) || data['hasSubscription'] !== true) return []
  const productName = readString(data['productName'])
  const status = readString(data['status'])
  if (productName === undefined || status === undefined) return []
  const endTime = readString(data['subscribeEndTime'])
  const period = readString(data['subscribePeriod'])
  return [{
    productName,
    status,
    inCurrentPeriod: true,
    autoRenew: false,
    ...endTime === undefined ? {} : { renewTime: endTime },
    ...period === undefined ? {} : { billingCycle: period },
  }]
}
