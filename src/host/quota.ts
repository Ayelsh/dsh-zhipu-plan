/**
 * The plan-quota read model: one call per deployment's monitor endpoint,
 * reduced to the figures a plan card shows — the primary limit's usage against
 * its size, the reset moment, and the per-model breakdown.
 *
 * The monitor API authenticates with the plan key itself, which is why the
 * credential resolution lands before any quota read. A snapshot is cached with
 * a minimum refresh interval and last-good retention: a refused or failed read
 * answers with the previous snapshot and a stale flag instead of an error the
 * surface would render as "no plan".
 *
 * @module dsh-zhipu-plan/host/quota
 */

import type { PlanQuotaLimit, ZhipuPlanDeployment } from './types.ts'

interface QuotaEnvelope {
  readonly success?: unknown
  readonly code?: unknown
  readonly data?: unknown
}

interface QuotaLimitPayload {
  readonly type?: unknown
  readonly unit?: unknown
  readonly number?: unknown
  readonly usage?: unknown
  readonly currentValue?: unknown
  readonly remaining?: unknown
  readonly percentage?: unknown
  readonly nextResetTime?: unknown
  readonly usageDetails?: unknown
}

/**
 * The organization/project headers one scoped monitor read carries.
 * @param scope - the team scope, when the account has one.
 * @returns the headers, empty for an account-wide key.
 */
export function scopeHeaders(
  scope: { readonly organizationId: string; readonly projectId: string } | undefined,
): Record<string, string> {
  return scope === undefined
    ? {}
    : { 'bigmodel-organization': scope.organizationId, 'bigmodel-project': scope.projectId }
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

function parseLimit(payload: QuotaLimitPayload): PlanQuotaLimit | undefined {
  const type = readString(payload['type'])
  if (type === undefined) return undefined
  const unit = readNumber(payload['unit'])
  const number = readNumber(payload['number'])
  const usage = readNumber(payload['usage'])
  const currentValue = readNumber(payload['currentValue'])
  const remaining = readNumber(payload['remaining'])
  const percentage = readNumber(payload['percentage'])
  const nextResetTime = readNumber(payload['nextResetTime'])
  const details = Array.isArray(payload['usageDetails'])
    ? (payload['usageDetails'] as readonly unknown[]).flatMap((entry) => {
      if (!isRecord(entry)) return []
      const modelCode = readString(entry['modelCode'])
      const displayName = readString(entry['displayName'])
      const usage = readNumber(entry['usage'])
      if (modelCode === undefined && displayName === undefined && usage === undefined) return []
      return [{
        ...modelCode === undefined ? {} : { modelCode },
        ...displayName === undefined ? {} : { displayName },
        ...usage === undefined ? {} : { usage },
      }]
    })
    : undefined
  return {
    type,
    ...unit === undefined ? {} : { unit },
    ...number === undefined ? {} : { number },
    ...usage === undefined ? {} : { usage },
    ...currentValue === undefined ? {} : { currentValue },
    ...remaining === undefined ? {} : { remaining },
    ...percentage === undefined ? {} : { percentage },
    ...nextResetTime === undefined ? {} : { nextResetTime },
    ...details === undefined ? {} : { usageDetails: details },
  }
}

/**
 * Parse one monitor answer into the snapshot's level and limits.
 * @param data - the envelope's `data` value, in any shape the deployment reports.
 * @returns the plan level when present, plus every readable limit bucket.
 */
export function parseQuotaPayload(data: unknown): { readonly level?: string; readonly limits: readonly PlanQuotaLimit[] } {
  if (!isRecord(data)) return { limits: [] }
  const level = readString(data['level'])
  const limits = (Array.isArray(data['limits']) ? data['limits'] : [])
    .flatMap((entry) => {
      if (!isRecord(entry)) return []
      const limit = parseLimit(entry)
      return limit === undefined ? [] : [limit]
    })
  return { ...level === undefined ? {} : { level }, limits }
}

/**
 * The limit a surface leads with.
 * @param limits - the snapshot's limit buckets in monitor order.
 * @returns the time limit, else the first with a remaining figure, else the first.
 */
export function pickPrimaryLimit(limits: readonly PlanQuotaLimit[]): PlanQuotaLimit | undefined {
  return limits.find(limit => limit.type === 'TIME_LIMIT')
    ?? limits.find(limit => limit.remaining !== undefined)
    ?? limits[0]
}

/** Inputs for one quota read. */
export interface FetchQuotaInput {
  readonly deployment: ZhipuPlanDeployment
  /** The account's plan API key, which the monitor API authenticates with. */
  readonly planKey: string
  /** Monitor origin: the mainland business origin for `bigmodel`, the international one for `zai`. */
  readonly monitorOrigin: string
  /**
   * Organization and project a team key belongs to. The monitor routes a team
   * quota read by this scope and the `type=2` parameter; without it the read
   * falls into the personal branch and reports no plan.
   */
  readonly scope?: { readonly organizationId: string; readonly projectId: string }
  readonly requestTimeoutMs: number
  readonly signal?: AbortSignal
}

/**
 * Fetch one quota snapshot.
 * @param input - deployment, plan key, monitor origin, deadline, and the caller's cancellation.
 * @returns the snapshot's level and limit buckets, unpicked.
 * @throws Error when the monitor is unreachable or refuses the key; the caller decides retention.
 */
export async function fetchQuota(input: FetchQuotaInput): Promise<{ readonly level?: string; readonly limits: readonly PlanQuotaLimit[] }> {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs)
  const composed = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout])
  const path = input.scope === undefined
    ? '/api/monitor/usage/quota/limit'
    : '/api/monitor/usage/quota/limit?type=2'
  const response = await fetch(`${input.monitorOrigin}${path}`, {
    headers: { Authorization: `Bearer ${input.planKey}`, ...scopeHeaders(input.scope) },
    signal: composed,
  })
  const text = await response.text()
  // A refusal is not always the envelope: a gateway answers plain text, so the
  // status is graded before anything is parsed.
  if (!response.ok) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`)
  }
  const envelope = JSON.parse(text) as QuotaEnvelope
  if (envelope['success'] === false) {
    throw new Error(`the plan monitor refused the request (HTTP ${String(response.status)})`)
  }
  return parseQuotaPayload(envelope['data'])
}
