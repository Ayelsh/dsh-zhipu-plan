/**
 * Stable failure vocabulary for the Zhipu coding-plan account. Every code is
 * one a caller can branch on: a surface offers re-sign-in for `not-signed-in`
 * and `token-expired`, and shows the message for the rest.
 *
 * The second half of the file is the failure vocabulary of the MCP-backed
 * surfaces (web search, web reader, zread tools). Those failures are thrown
 * inside a tool execution rather than across the Remote boundary, so they are
 * plain errors carrying a stable string code; the text of the code-visible
 * ones (content filter, repository not indexed) is fixed on purpose, because
 * it is the only guidance the model gets to retry usefully.
 *
 * @module dsh-zhipu-plan/host/errors
 */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** Every failure the plan account can report, as the wire codes a caller branches on. */
export type ZhipuPlanErrorCode =
  /** A request was malformed, or a stored record or mounted seam is missing or unreadable. */
  | 'zhipu-plan/rejected'
  /** The operation needs a signed-in account and none is stored. */
  | 'zhipu-plan/not-signed-in'
  /** The account holds no coding-plan entitlement the server recognizes. */
  | 'zhipu-plan/no-plan'
  /** The account's organization or project could not be resolved for a plan key. */
  | 'zhipu-plan/missing-org-project'
  /** The stored token has passed its reported expiry. */
  | 'zhipu-plan/token-expired'
  /** The deployment or relay could not be reached. */
  | 'zhipu-plan/network'

/**
 * Build one plan-account failure with its wire code.
 * @param code - the failure class a caller branches on.
 * @param message - what happened, safe to show the user.
 * @param options - the machine-readable reason and the underlying error.
 * @returns the error to throw or return.
 */
export function zhipuPlanError(
  code: ZhipuPlanErrorCode,
  message: string,
  options: { readonly reason?: string; readonly cause?: unknown } = {},
): RemoteError {
  return new RemoteError(code, message, { reason: options.reason ?? code }, options.cause === undefined ? {} : { cause: options.cause })
}

/** Every failure an MCP-backed surface can report to the model. */
export type ZhipuBackendErrorCode =
  /** The upstream refused the query as sensitive content; retry with a narrower query. */
  | 'ZHIPU_CONTENT_FILTERED'
  /** The upstream does not index the requested GitHub repository. */
  | 'ZHIPU_REPO_NOT_FOUND'
  /** The capability is switched off in the plugin settings. */
  | 'ZHIPU_DISABLED'
  /** The caller aborted the request. */
  | 'ZHIPU_ABORTED'
  /** The upstream, the transport, or a response frame failed. */
  | 'ZHIPU_PROVIDER_ERROR'
  /** No usable Zhipu credential resolved for this deployment. */
  | 'ZHIPU_CREDENTIAL_MISSING'

/**
 * Fixed Chinese hint when Zhipu rejects a query for sensitive content. It is
 * deliberately the entire user-visible answer: the raw upstream text is never
 * shown, and the model gets concrete retry guidance instead.
 */
const CONTENT_FILTERED_MESSAGE = '[ZHIPU_CONTENT_FILTERED] 智谱查询到敏感词拒绝本次输出。搜索范围不要过于泛化，请将请求收窄为一个明确的目标，补充具体实体、时间、地区、指标或来源，用客观、精确的查询重试。'

/** Fixed Chinese answer when the upstream does not index the requested repository. */
const REPO_NOT_FOUND_MESSAGE = '[ZHIPU_REPO_NOT_FOUND] 仓库未被智谱收录。请改用其他方式访问 GitHub。'

/** One MCP-backed surface failure, shaped like the host's own error classes. */
export class ZhipuBackendError extends Error {
  /** The stable code a caller branches on. */
  readonly code: ZhipuBackendErrorCode

  /**
   * @param code - the stable failure code.
   * @param message - what happened, safe to show the model.
   * @param options - the underlying error, when one caused this failure.
   */
  constructor(code: ZhipuBackendErrorCode, message: string, options: { readonly cause?: unknown } = {}) {
    super(message)
    this.name = 'ZhipuBackendError'
    this.code = code
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', { value: options.cause, enumerable: false, writable: true, configurable: true })
    }
  }
}

/**
 * Whether a value is one of this module's MCP-surface failures. The name check
 * keeps the test working across the host's bundling boundaries.
 * @param value - the value to test.
 * @returns true for a `ZhipuBackendError`.
 */
export function isZhipuBackendError(value: unknown): value is ZhipuBackendError {
  return value instanceof ZhipuBackendError
    || (value instanceof Error && value.name === 'ZhipuBackendError' && typeof (value as { code?: unknown }).code === 'string')
}

/**
 * Whether a value is an abort, from this module or from the platform's fetch.
 * @param value - the value to test.
 * @returns true when the value describes a cancellation.
 */
export function isAbortError(value: unknown): boolean {
  if (isZhipuBackendError(value) && value.code === 'ZHIPU_ABORTED') return true
  if (typeof DOMException !== 'undefined' && value instanceof DOMException) return value.name === 'AbortError'
  if (value instanceof Error) return value.name === 'AbortError' || (value as { code?: unknown }).code === 'ABORT_ERR'
  return false
}

/**
 * One fixed hint for queries Zhipu rejected for sensitive content.
 * @returns the fixed Chinese content-filter error.
 */
export function contentFilteredError(): ZhipuBackendError {
  return new ZhipuBackendError('ZHIPU_CONTENT_FILTERED', CONTENT_FILTERED_MESSAGE)
}

/**
 * One fixed answer for repositories Zhipu does not index.
 * @returns the fixed Chinese repository-not-found error.
 */
export function repoNotFoundError(): ZhipuBackendError {
  return new ZhipuBackendError('ZHIPU_REPO_NOT_FOUND', REPO_NOT_FOUND_MESSAGE)
}

/** Pick the Chinese or English variant of a message from the prompt setting. */
function localize(zhPrompt: boolean, zhText: string, enText: string): string {
  return zhPrompt ? zhText : enText
}

/**
 * The error a surface reports when its settings switch is off.
 * @param zhPrompt - whether the user-facing language is Chinese.
 * @returns the `ZHIPU_DISABLED` error.
 */
export function disabledError(zhPrompt = true): ZhipuBackendError {
  return new ZhipuBackendError('ZHIPU_DISABLED', localize(
    zhPrompt,
    '[ZHIPU_DISABLED] 该能力已被 dsh-zhipu-plan 插件设置关闭。请让用户在插件设置中开启后重试。',
    '[ZHIPU_DISABLED] This capability is disabled in the dsh-zhipu-plan plugin settings. Ask the user to enable it and retry.',
  ))
}

/**
 * The error a surface reports when no plan credential resolves.
 * @param zhPrompt - whether the user-facing language is Chinese.
 * @returns the `ZHIPU_CREDENTIAL_MISSING` error.
 */
export function credentialMissingError(zhPrompt = true): ZhipuBackendError {
  return new ZhipuBackendError('ZHIPU_CREDENTIAL_MISSING', localize(
    zhPrompt,
    '[ZHIPU_CREDENTIAL_MISSING] 未找到可用的智谱 Coding Plan 凭据。请先在 dsh-zhipu-plan 插件中登录智谱账号。',
    '[ZHIPU_CREDENTIAL_MISSING] No usable Zhipu Coding Plan credential was found. Sign in to the dsh-zhipu-plan plugin first.',
  ))
}

/**
 * The error a surface reports when the caller cancelled the request.
 * @param scope - which operation was cancelled.
 * @returns the `ZHIPU_ABORTED` error.
 */
export function abortedError(scope: string, signal?: AbortSignal): ZhipuBackendError {
  const cause = signal?.reason
  const options = cause === undefined ? {} : { cause }
  return new ZhipuBackendError('ZHIPU_ABORTED', `[ZHIPU_ABORTED] ${scope} 已中止 (aborted)`, options)
}

/**
 * Text one unknown error value may expose to a caller.
 * @param error - the thrown value.
 * @returns a short, single-line description.
 */
function describeError(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error === undefined || error === null) return 'unknown error'
  try {
    const text = JSON.stringify(error)
    return text === undefined ? String(error) : truncate(text, 300)
  } catch {
    return String(error)
  }
}

/** Keep a diagnostic string short enough for one error message. */
function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

/**
 * Concatenate every string an upstream payload carries, so a marker or a
 * status code nested in a JSON-RPC error frame can still be found.
 * @param value - the upstream value.
 * @param depth - recursion budget, guarding against cyclic payloads.
 * @returns the joined text, empty when the value carries none.
 */
function collectUpstreamText(value: unknown, depth = 0): string {
  if (depth > 8 || value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map((entry) => collectUpstreamText(entry, depth + 1)).filter((entry) => entry !== '').join(' ')
  }
  if (isPlainRecord(value)) {
    const parts: string[] = []
    for (const [key, entry] of Object.entries(value)) {
      parts.push(key)
      parts.push(collectUpstreamText(entry, depth + 1))
    }
    return parts.filter((entry) => entry !== '').join(' ')
  }
  return ''
}

/** Strict plain-object test (kept local so this module needs no other imports). */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The diagnostic suffix an upstream failure earns: the HTTP status and the
 * server code, when the payload carries them.
 * @param upstream - the upstream payload or error text.
 * @returns ` (upstream HTTP -500, code 1234)`, or the empty string.
 */
export function upstreamErrorSummary(upstream: unknown): string {
  const text = collectUpstreamText(upstream)
  if (text === '') return ''
  const status = /(?:http|mcp\s+error|status)\s*[:=]?\s*-?(\d{3})/i.exec(text)
  const code = /["']?code["']?\s*[:=]\s*["']?(-?\d+)/i.exec(text)
  const parts: string[] = []
  if (status !== null) parts.push(`upstream HTTP -${status[1]}`)
  if (code !== null && code[1] !== status?.[1]) parts.push(`code ${code[1]}`)
  return parts.length === 0 ? '' : ` (${parts.join(', ')})`
}

/**
 * Append the upstream diagnostic suffix to a message, once.
 * @param message - the message the caller built.
 * @param upstream - the upstream payload the failure came from.
 * @returns the message with its suffix attached, when one was found.
 */
export function withUpstreamSummary(message: string, upstream: unknown): string {
  if (message.includes('(upstream HTTP')) return message
  return `${message}${upstreamErrorSummary(upstream)}`
}

/**
 * Wrap any thrown value from a surface operation as a provider error, keeping
 * its message and cause for diagnosis.
 * @param scope - the operation name the message leads with.
 * @param error - the thrown value.
 * @param zhPrompt - whether the user-facing language is Chinese.
 * @returns the `ZHIPU_PROVIDER_ERROR` error.
 */
export function providerError(scope: string, error: unknown, zhPrompt = true): ZhipuBackendError {
  if (isZhipuBackendError(error)) return error
  const message = localize(
    zhPrompt,
    `[ZHIPU_PROVIDER_ERROR] ${scope} 失败：${describeError(error)}`,
    `[ZHIPU_PROVIDER_ERROR] ${scope} failed: ${describeError(error)}`,
  )
  return new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', withUpstreamSummary(message, error), { cause: error })
}
