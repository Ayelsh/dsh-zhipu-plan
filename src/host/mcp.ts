/**
 * Minimal MCP-over-streamable-HTTP client for the Zhipu MCP gateways.
 *
 * Every call opens a short session instead of sharing one long-lived stream:
 * POST initialize, read the session id from the response header, fire the
 * notifications/initialized notification, POST tools/call, then DELETE the
 * session best-effort. A request is bounded by a 60 s timeout merged with the
 * caller's AbortSignal, response bodies are capped at 8 MiB, and both SSE
 * `data:` frames and a whole-body JSON-RPC document are accepted — the gateway
 * has been observed returning either.
 *
 * The module is transport plus JSON-RPC only: mapping a result to search
 * sources or documents is the caller's job.
 *
 * @module dsh-zhipu-plan/host/mcp
 */

import { createRequire } from 'node:module'
import {
  ZhipuBackendError,
  abortedError,
  contentFilteredError,
  isAbortError,
  isZhipuBackendError,
  providerError,
  repoNotFoundError,
  withUpstreamSummary,
} from './errors.ts'
import { isRecord } from './util.ts'

/** Timeout for one MCP HTTP request (initialize, tools/call, notification). */
export const MCP_TIMEOUT_MS = 60_000
/** Timeout for the best-effort DELETE that ends a session. */
export const MCP_TERMINATE_TIMEOUT_MS = 5_000
/** Hard cap for one response body, checked by content-length and by bytes read. */
export const MCP_MAX_RESPONSE_BYTES = 8 * 1024 * 1024
/** The MCP protocol revision Zhipu's gateways negotiate. */
export const MCP_PROTOCOL_VERSION = '2024-11-05'

const CLIENT_NAME = 'dsh-zhipu'
const INITIALIZE_ID = 1
const CALL_ID = 2
const TERMINATE_ID = 3

/** Caller-tunable behavior of one MCP call. */
export interface McpOptions {
  /** Per-request timeout, defaulting to {@link MCP_TIMEOUT_MS}. */
  readonly timeoutMs?: number
  /** User-Agent header, defaulting to `dsh-zhipu/<plugin version>`. */
  readonly userAgent?: string
  /** Whether gateway diagnostics are written in Chinese (the plugin default). */
  readonly zhPrompt?: boolean
}

/** One open MCP session. */
export interface McpSession {
  /** Invoke one tool inside this session, terminating the session afterwards. */
  call(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>
  /** Release the session. Termination happens per call, so this is a no-op. */
  dispose(): Promise<void>
}

interface SessionOptions {
  readonly timeoutMs: number
  readonly userAgent: string
  readonly zhPrompt: boolean
}

interface RawResponse {
  readonly text: string
  readonly sessionId?: string
}

let cachedVersion: string | undefined

/** Version reported in the MCP client info, tolerant of a relocated manifest. */
function packageVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion
  try {
    const require = createRequire(import.meta.url)
    const manifest = require('../package.json') as { version?: unknown }
    cachedVersion = typeof manifest.version === 'string' ? manifest.version : '0.0.0'
  } catch {
    cachedVersion = '0.0.0'
  }
  return cachedVersion
}

/** Pick the Chinese or English variant of a message from the prompt setting. */
function message(zhPrompt: boolean, zhText: string, enText: string): string {
  return zhPrompt ? zhText : enText
}

/** Keep a diagnostic string short enough for one error message. */
function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

/** Render an unknown upstream payload as one short single-line string. */
function summarize(value: unknown): string {
  if (typeof value === 'string') return truncate(value, 500)
  if (value instanceof Error) return truncate(value.message, 500)
  try {
    const text = JSON.stringify(value)
    return truncate(text === undefined ? String(value) : text, 500)
  } catch {
    return truncate(String(value), 500)
  }
}

/**
 * Whether an upstream payload carries the gateway's sensitive-content marker.
 * The check walks nested JSON-RPC frames because the marker can sit in an
 * `error.message`, a content block, or a plain string body.
 * @param value - the parsed frame, a body string, or a nested value.
 * @param depth - recursion budget, guarding against cyclic payloads.
 * @returns true when a string value or object key matches.
 */
function containsContentFilterMarker(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === undefined || value === null) return false
  if (typeof value === 'string') return /content[\s_-]?filter/i.test(value)
  if (Array.isArray(value)) return value.some((entry) => containsContentFilterMarker(entry, depth + 1))
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (/content[\s_-]?filter/i.test(key)) return true
      if (containsContentFilterMarker(entry, depth + 1)) return true
    }
  }
  return false
}

/** Build the timeout failure with the negotiated limit in its message. */
function timeoutError(timeoutMs: number, zhPrompt: boolean): ZhipuBackendError {
  return new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
    zhPrompt,
    `[ZHIPU_PROVIDER_ERROR] 智谱 MCP 请求超过 ${timeoutMs}ms 未完成，已终止本次 MCP 会话。`,
    `[ZHIPU_PROVIDER_ERROR] Zhipu MCP request timed out after ${timeoutMs}ms; the MCP session was terminated.`,
  ))
}

/** Build the oversize-body failure; a truncated body is never returned. */
function oversizeError(zhPrompt: boolean): ZhipuBackendError {
  return new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
    zhPrompt,
    `[ZHIPU_PROVIDER_ERROR] MCP 响应超过 ${MCP_MAX_RESPONSE_BYTES} 字节上限，已终止本次会话。请缩小请求范围后重试。`,
    `[ZHIPU_PROVIDER_ERROR] The MCP response exceeded the ${MCP_MAX_RESPONSE_BYTES}-byte limit; the session was terminated. Narrow the request and retry.`,
  ))
}

/**
 * Read one response body while enforcing the byte cap. The length header is
 * checked first so an oversize body is rejected before it is streamed.
 * @param response - the fetch response.
 * @param zhPrompt - whether diagnostics are Chinese.
 * @returns the decoded body text.
 */
async function readBodyText(response: Response, zhPrompt: boolean): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared !== null) {
    const length = Number(declared)
    if (Number.isFinite(length) && length > MCP_MAX_RESPONSE_BYTES) throw oversizeError(zhPrompt)
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      if (total > MCP_MAX_RESPONSE_BYTES) throw oversizeError(zhPrompt)
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // The stream is already closed or cancelled; nothing to release.
    }
  }
}

/**
 * One JSON-RPC POST or session DELETE.
 * @param endpoint - the MCP endpoint URL.
 * @param apiKey - the bearer credential.
 * @param sessionId - the negotiated session id, absent for initialize.
 * @param method - the HTTP method of the exchange.
 * @param body - the JSON-RPC payload for POST.
 * @param options - timeout, user agent, and message language.
 * @param signal - the caller's cancellation signal.
 * @returns the decoded body plus a rotated session id when the header carries one.
 */
async function request(
  endpoint: string,
  apiKey: string,
  sessionId: string | undefined,
  method: 'POST' | 'DELETE',
  body: unknown,
  options: SessionOptions,
  signal: AbortSignal | undefined,
): Promise<RawResponse> {
  const controller = new AbortController()
  let timedOut = false
  const forwardAbort = (): void => controller.abort()
  if (signal !== undefined) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json, text/event-stream',
      'User-Agent': options.userAgent,
    }
    if (sessionId !== undefined) headers['Mcp-Session-Id'] = sessionId
    if (method === 'POST') headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await fetch(endpoint, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      })
    } catch (error) {
      if (signal !== undefined && signal.aborted) throw abortedError('MCP 请求')
      if (timedOut) throw timeoutError(options.timeoutMs, options.zhPrompt)
      throw providerError('MCP 请求', error, options.zhPrompt)
    }
    const text = await readBodyText(response, options.zhPrompt)
    const nextSessionId = response.headers.get('mcp-session-id') ?? undefined
    if (!response.ok) {
      if (containsContentFilterMarker(text)) throw contentFilteredError()
      const suffix = withUpstreamSummary('', text)
      throw new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
        options.zhPrompt,
        `[ZHIPU_PROVIDER_ERROR] MCP 网关错误 (HTTP ${response.status})${suffix}`,
        `[ZHIPU_PROVIDER_ERROR] MCP gateway error (HTTP ${response.status})${suffix}`,
      ))
    }
    return { text, sessionId: nextSessionId }
  } catch (error) {
    if (isZhipuBackendError(error)) throw error
    if (signal !== undefined && signal.aborted) throw abortedError('MCP 请求')
    if (timedOut) throw timeoutError(options.timeoutMs, options.zhPrompt)
    if (isAbortError(error)) throw abortedError('MCP 请求')
    throw providerError('MCP 请求', error, options.zhPrompt)
  } finally {
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Parse a JSON-RPC response body that may be a whole JSON document, an SSE
 * stream of `data:` frames, or both concatenated.
 * @param text - the response body.
 * @returns every frame that parsed, in order.
 */
function parseRpcFrames(text: string): unknown[] {
  const frames: unknown[] = []
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) frames.push(...parsed)
      else frames.push(parsed)
    } catch {
      // Mixed content: fall through to the line scan below.
    }
  }
  for (const line of text.split('\n')) {
    const entry = line.trim()
    if (!entry.startsWith('data:')) continue
    const payload = entry.slice(5).trim()
    if (payload === '' || payload === '[DONE]') continue
    try {
      frames.push(JSON.parse(payload))
    } catch {
      // Not a JSON data frame; SSE comments and keep-alives land here.
    }
  }
  return frames
}

/** Find the result frame for one request id, or the first result/error frame. */
function pickFrame(frames: readonly unknown[], id: number): Record<string, unknown> | undefined {
  for (const frame of frames) {
    if (isRecord(frame) && frame.id === id) return frame
  }
  for (const frame of frames) {
    if (isRecord(frame) && (isRecord(frame.result) || isRecord(frame.error))) return frame
  }
  return undefined
}

/** Build the failure a frame's error object becomes. */
function frameError(frame: Record<string, unknown>, context: string, zhPrompt: boolean): ZhipuBackendError {
  const error = frame.error
  if (containsContentFilterMarker(error)) return contentFilteredError()
  return new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
    zhPrompt,
    `[ZHIPU_PROVIDER_ERROR] ${context} 返回错误：${summarize(error)}`,
    `[ZHIPU_PROVIDER_ERROR] ${context} returned an error: ${summarize(error)}`,
  ), { cause: error })
}

/**
 * Turn one JSON-RPC response frame into a tool result, mapping upstream
 * failures (sensitive content, unindexed repository) to their fixed messages.
 * @param frame - the response frame.
 * @param context - the tool name, for diagnostics.
 * @param zhPrompt - whether diagnostics are Chinese.
 * @returns the frame's `result` object.
 */
function frameResult(frame: Record<string, unknown>, context: string, zhPrompt: boolean): Record<string, unknown> {
  if (isRecord(frame.error) || frame.error !== undefined) {
    if (containsContentFilterMarker(frame)) throw contentFilteredError()
    throw frameError(frame, context, zhPrompt)
  }
  const result = frame.result
  if (!isRecord(result)) {
    throw new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
      zhPrompt,
      `[ZHIPU_PROVIDER_ERROR] ${context} 未返回工具结果。`,
      `[ZHIPU_PROVIDER_ERROR] ${context} returned no tool result.`,
    ))
  }
  if (result.isError === true) {
    if (containsContentFilterMarker(result)) throw contentFilteredError()
    const upstream = contentText(result)
    if (upstream === '') {
      throw new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
        zhPrompt,
        `[ZHIPU_PROVIDER_ERROR] ${context} 返回了失败状态但没有说明。`,
        `[ZHIPU_PROVIDER_ERROR] ${context} reported a failure without details.`,
      ))
    }
    if (/repo\s+not\s+found/i.test(upstream)) throw repoNotFoundError()
    throw new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
      zhPrompt,
      `[ZHIPU_PROVIDER_ERROR] ${context} 返回失败：${truncate(upstream, 500)}`,
      `[ZHIPU_PROVIDER_ERROR] ${context} failed: ${truncate(upstream, 500)}`,
    ))
  }
  return result
}

/**
 * The text payload of one MCP tool result: every `text` content block, joined
 * by newlines.
 * @param result - the MCP result object (or any nested payload).
 * @returns the joined text, empty when the result carries no text blocks.
 */
export function contentText(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) return ''
  const parts: string[] = []
  for (const block of result.content) {
    if (!isRecord(block)) continue
    if (block.type !== undefined && block.type !== 'text') continue
    if (typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Parse a gateway payload that is sometimes JSON-encoded twice: one parse, and
 * a second parse when the first produced a string.
 * @param text - the raw payload.
 * @returns the parsed value, or the original text when neither parse worked.
 */
export function parseMaybeDoubleEncoded(text: string): unknown {
  const attempt = (value: string): unknown => {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return undefined
    }
  }
  let parsed = attempt(text)
  if (typeof parsed === 'string') parsed = attempt(parsed)
  return parsed === undefined ? text : parsed
}

/** Normalize the caller's options into a fully-defaulted session configuration. */
function sessionOptions(options: McpOptions = {}): SessionOptions {
  return {
    timeoutMs: options.timeoutMs ?? MCP_TIMEOUT_MS,
    userAgent: options.userAgent ?? `dsh-zhipu/${packageVersion()}`,
    zhPrompt: options.zhPrompt ?? true,
  }
}

/**
 * Open one short-lived MCP session on demand. The first `call` performs the
 * initialize handshake; a session is not held between calls.
 * @param endpoint - the MCP endpoint URL.
 * @param apiKey - the bearer credential.
 * @param options - timeouts, user agent, and message language.
 * @returns the session handle.
 */
export function createMcpSession(endpoint: string, apiKey: string, options: McpOptions = {}): McpSession {
  const session = sessionOptions(options)
  return {
    async call(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
      const initialized = await request(endpoint, apiKey, undefined, 'POST', {
        jsonrpc: '2.0',
        id: INITIALIZE_ID,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: CLIENT_NAME, version: packageVersion() },
        },
      }, session, signal)
      const sessionId = initialized.sessionId
      if (sessionId === undefined) {
        if (containsContentFilterMarker(initialized.text)) throw contentFilteredError()
        throw new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
          session.zhPrompt,
          '[ZHIPU_PROVIDER_ERROR] MCP initialize 未返回会话标识 (mcp-session-id)。',
          '[ZHIPU_PROVIDER_ERROR] MCP initialize returned no mcp-session-id header.',
        ))
      }
      try {
        // The initialized notification is fire-and-forget by protocol design:
        // the gateway may answer 202 with no body, so its failure is not fatal.
        void request(endpoint, apiKey, sessionId, 'POST', {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        }, session, signal).catch(() => undefined)
        const response = await request(endpoint, apiKey, sessionId, 'POST', {
          jsonrpc: '2.0',
          id: CALL_ID,
          method: 'tools/call',
          params: { name: tool, arguments: args },
        }, session, signal)
        const frames = parseRpcFrames(response.text)
        let frame = pickFrame(frames, CALL_ID)
        if (frame === undefined) frame = pickFrame(frames, INITIALIZE_ID)
        if (frame === undefined && frames.length === 0 && containsContentFilterMarker(response.text)) {
          throw contentFilteredError()
        }
        if (frame === undefined) {
          throw new ZhipuBackendError('ZHIPU_PROVIDER_ERROR', message(
            session.zhPrompt,
            `[ZHIPU_PROVIDER_ERROR] ${tool} 未返回可解析的 JSON-RPC 响应帧。`,
            `[ZHIPU_PROVIDER_ERROR] ${tool} returned no parseable JSON-RPC response frame.`,
          ))
        }
        return frameResult(frame, tool, session.zhPrompt)
      } finally {
        // Best-effort termination. It keeps its own 5 s budget and never
        // replaces the failure that is already propagating.
        const termination = request(endpoint, apiKey, sessionId, 'DELETE', undefined, {
          ...session,
          timeoutMs: MCP_TERMINATE_TIMEOUT_MS,
        }, undefined)
        if (signal !== undefined && signal.aborted) void termination.catch(() => undefined)
        else await termination.catch(() => undefined)
      }
    },
    async dispose(): Promise<void> {
      // Sessions end with their call; there is nothing resident to release.
    },
  }
}

/**
 * Invoke one Zhipu MCP tool in a fresh one-call session.
 * @param endpoint - the MCP endpoint URL.
 * @param apiKey - the bearer credential.
 * @param tool - the upstream tool name.
 * @param args - the tool arguments.
 * @param signal - the caller's cancellation signal.
 * @param options - timeouts, user agent, and message language.
 * @returns the MCP result object.
 */
export async function callMcpTool(
  endpoint: string,
  apiKey: string,
  tool: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  options: McpOptions = {},
): Promise<unknown> {
  const session = createMcpSession(endpoint, apiKey, options)
  try {
    return await session.call(tool, args, signal)
  } finally {
    await session.dispose().catch(() => undefined)
  }
}
