/**
 * The coding-plan reset family: how many five-hour and weekly resets an account
 * holds, when they expire, and the two write operations that claim an
 * opportunity and spend one. These calls go to the ZCode API origin rather than
 * the monitor, and authenticate with both the account's ZCode JWT and its
 * deployment access token — the reset service checks the pair.
 *
 * Every write carries a caller-supplied idempotency key, so a retried click
 * spends at most one reset; the claim operation is additionally throttled by
 * the server, which answers with the earliest moment worth trying again.
 *
 * @module dsh-zhipu-plan/host/reset
 */

import type { PlanResetKind, PlanResetOpportunity, PlanResetStatus } from './types.ts'

/**
 * The reset windows as the service spells them. This module's own kind names
 * are lower-case for the wire types the host publishes; the reset service
 * expects the upper-case spelling, and refuses anything else.
 */
const RESET_TYPE: Record<PlanResetKind, string> = { five_hour: 'FIVE_HOUR', week: 'WEEK' }

/** Addressing and authorization for one reset call. */
export interface ResetReadInput {
  /** ZCode API origin the reset service lives on. */
  readonly zcodeApiOrigin: string
  /** The account's ZCode JWT, bare or already bearing its scheme. */
  readonly zcodeJwt: string
  /** The deployment access token, passed to the reset service through its own header. */
  readonly accessToken: string
  /**
   * Organization and project a team key belongs to, when the account is
   * scoped: the reset service targets the team rather than the personal quota.
   */
  readonly scope?: { readonly organizationId: string; readonly projectId: string }
  readonly requestTimeoutMs: number
  readonly signal: AbortSignal | undefined
}

interface ResetEnvelope {
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

/** Headers every reset call carries; both tokens are checked server-side. */
function resetHeaders(input: ResetReadInput): Record<string, string> {
  const scope = input.scope
  return {
    Authorization: /^Bearer\s/i.test(input.zcodeJwt) ? input.zcodeJwt : `Bearer ${input.zcodeJwt}`,
    'X-Bigmodel-Authorization': input.accessToken,
    'Bigmodel-Target-Type': scope === undefined ? 'PERSONAL' : 'TEAM',
    ...scope === undefined ? {} : { 'Bigmodel-Organization': scope.organizationId, 'Bigmodel-Project': scope.projectId },
  }
}

/**
 * The service's own explanation of a refusal, read out of whatever the reply
 * carried: its envelope, a bare object, or plain text.
 * @param text - the response body as received.
 * @returns the explanation, or undefined when the body names none.
 */
function refusalMessage(text: string): string | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (isRecord(parsed)) {
      for (const key of ['error', 'message', 'msg', 'detail']) {
        const value = parsed[key]
        if (typeof value === 'string' && value.trim() !== '') return value.trim()
      }
      if (typeof parsed['code'] === 'number' && parsed['code'] !== 0) {
        return `code ${String(parsed['code'])}`
      }
    }
  } catch {
    // A gateway answers plain text, which is itself the explanation.
  }
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed
}

/** One reset answer's `data`, or a refusal carrying the server's message. */
async function callReset(
  input: ResetReadInput,
  path: string,
  body?: string,
): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(input.requestTimeoutMs)
  const composed = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout])
  const response = await fetch(`${input.zcodeApiOrigin}/api/v1/coding-plan/reset${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined
      ? resetHeaders(input)
      : { ...resetHeaders(input), 'Content-Type': 'application/json' },
    ...body === undefined ? {} : { body },
    signal: composed,
  })
  const text = await response.text()
  // A refusal is not always the envelope: a gateway answers plain text, so the
  // status is graded before anything is parsed.
  if (!response.ok) {
    const detail = refusalMessage(text)
    throw new Error(`the reset service refused the request (HTTP ${String(response.status)}${detail === undefined ? '' : `: ${detail}`})`)
  }
  const envelope = JSON.parse(text) as ResetEnvelope
  if (typeof envelope.code === 'number' && envelope.code !== 0) {
    const detail = refusalMessage(text)
    throw new Error(`the reset service refused the request (${detail ?? `code ${String(envelope.code)}`})`)
  }
  return isRecord(envelope.data) ? envelope.data : {}
}

/**
 * Read the resets an account holds and the last one it spent.
 * @param input - reset addressing, credentials, and deadline.
 * @returns available resets by kind, the latest spent reset per kind, and the unread flag.
 */
export async function fetchResetStatus(input: ResetReadInput): Promise<PlanResetStatus> {
  const data = await callReset(input, '/status')
  const opportunities = (key: string): PlanResetOpportunity[] =>
    (Array.isArray(data[key]) ? data[key] : []).flatMap((entry) => {
      if (!isRecord(entry)) return []
      const expireAt = readNumber(entry['expire_at'])
      return expireAt === undefined ? [] : [{ expireAt }]
    })
  const history = (key: string): number | undefined => {
    const entry = data[key]
    if (!isRecord(entry)) return undefined
    return readNumber(entry['used_at'])
  }
  const fiveHourUsedAt = history('latest_five_hour_reset_history')
  const weekUsedAt = history('latest_week_reset_history')
  return {
    fiveHour: opportunities('available_five_hour_resets'),
    week: opportunities('available_week_resets'),
    ...fiveHourUsedAt === undefined ? {} : { fiveHourUsedAt },
    ...weekUsedAt === undefined ? {} : { weekUsedAt },
    hasUnreadHistory: data['has_unread_history'] === true,
  }
}

/**
 * Claim a reset opportunity the server occasionally grants.
 * @param input - reset addressing, credentials, and deadline.
 * @param idempotencyKey - caller-minted key, at most 64 characters.
 * @returns the grant, or the earliest moment worth asking again.
 * @throws Error when the key is unusable or the service refuses.
 */
export async function requestResetOpportunity(
  input: ResetReadInput,
  idempotencyKey: string,
): Promise<{ readonly granted: true } | { readonly granted: false; readonly nextTryAt: number }> {
  assertIdempotencyKey(idempotencyKey)
  const timeout = AbortSignal.timeout(input.requestTimeoutMs)
  const composed = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout])
  const response = await fetch(`${input.zcodeApiOrigin}/api/v1/coding-plan/reset/opportunity`, {
    method: 'POST',
    headers: { ...resetHeaders(input), 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotency_key: idempotencyKey }),
    signal: composed,
  })
  // The throttled answer arrives as HTTP 429 without the envelope a claim carries.
  if (response.status === 429) {
    throw new Error('the reset service is throttling opportunity requests')
  }
  const text = await response.text()
  if (!response.ok) {
    const detail = refusalMessage(text)
    throw new Error(`the reset service refused the request (HTTP ${String(response.status)}${detail === undefined ? '' : `: ${detail}`})`)
  }
  const envelope = JSON.parse(text) as ResetEnvelope
  const data = isRecord(envelope.data) ? envelope.data : {}
  // 3301 is the server's "not now" verdict; its next_try_at is the retry bound.
  if (envelope.code === 3301) {
    const nextTryAt = readNumber(data['next_try_at'])
    if (nextTryAt === undefined) throw new Error('the reset service refused the request without a retry time')
    return { granted: false, nextTryAt }
  }
  if (typeof envelope.code === 'number' && envelope.code !== 0) {
    throw new Error(`the reset service refused the request (code ${String(envelope.code)})`)
  }
  if (data['granted'] !== true) throw new Error('the reset service refused the request without a verdict')
  return { granted: true }
}

/**
 * Spend one reset of the given kind.
 * @param input - reset addressing, credentials, and deadline.
 * @param kind - which reset window is being spent.
 * @param idempotencyKey - caller-minted key, at most 64 characters.
 * @returns once the service confirms the reset was spent.
 * @throws Error when the key is unusable or the service refuses.
 */
export async function useReset(
  input: ResetReadInput,
  kind: PlanResetKind,
  idempotencyKey: string,
): Promise<void> {
  assertIdempotencyKey(idempotencyKey)
  const data = await callReset(input, '/use', JSON.stringify({
    idempotency_key: idempotencyKey,
    reset_type: RESET_TYPE[kind],
  }))
  if (data['used'] !== true) throw new Error('the reset service did not confirm the reset')
}

/**
 * Mark the reset history as read.
 * @param input - reset addressing, credentials, and deadline.
 * @returns once the service acknowledges.
 */
export async function markResetHistoryRead(input: ResetReadInput): Promise<void> {
  await callReset(input, '/history/read', JSON.stringify({}))
}

/** Refuse an idempotency key the service would reject: empty or over 64 characters. */
function assertIdempotencyKey(value: string): void {
  if (value.trim().length === 0 || value.length > 64) {
    throw new Error('the reset idempotency key must be 1 to 64 characters')
  }
}
