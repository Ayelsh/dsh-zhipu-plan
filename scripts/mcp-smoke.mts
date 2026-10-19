/**
 * Offline smoke test for src/host/mcp.ts: stubs globalThis.fetch and checks the
 * session frame order, session-header propagation, SSE and whole-JSON parsing,
 * double-encoded payload unwrapping, and the mapped failure modes.
 */
import assert from 'node:assert/strict'
import {
  MCP_MAX_RESPONSE_BYTES,
  callMcpTool,
  contentText,
  createMcpSession,
  parseMaybeDoubleEncoded,
} from '../src/host/mcp.ts'
import { isZhipuBackendError } from '../src/host/errors.ts'

interface RecordedCall {
  method: string
  url: string
  headers: Record<string, string>
  body: any
}

const calls: RecordedCall[] = []
let responder: (call: RecordedCall, index: number) => Response
const realFetch = globalThis.fetch

globalThis.fetch = (async (input: any, init: any = {}) => {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(init.headers ?? {})) headers[key.toLowerCase()] = String(value)
  const raw = init.body === undefined || init.body === null ? undefined : String(init.body)
  const call: RecordedCall = {
    method: String(init.method ?? 'GET'),
    url: String(input),
    headers,
    body: raw === undefined ? undefined : JSON.parse(raw),
  }
  if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
  calls.push(call)
  return responder(call, calls.length - 1)
}) as typeof fetch

function reset(respond: typeof responder): void {
  calls.length = 0
  responder = (call, index) => call.body?.method === 'initialize'
    ? json({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 'sess-abc' })
    : respond(call, index)
}

function json(payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json', ...headers } })
}

function sse(...frames: unknown[]): Response {
  const body = frames.map((frame) => `event: message\ndata: ${JSON.stringify(frame)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const okResult = (text: string) => ({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text }] } })

function standardResponder(): (call: RecordedCall) => Response {
  return (call) => {
    if (call.body?.method === 'initialize') {
      return json({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05', capabilities: {} } }, { 'mcp-session-id': 'sess-abc' })
    }
    if (call.body?.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (call.body?.method === 'tools/call') return sse(okResult('hello'), okResult('duplicate-frame'))
    if (call.method === 'DELETE') return new Response(null, { status: 204 })
    throw new Error(`unexpected call: ${call.method} ${String(call.body?.method)}`)
  }
}

async function expectZhipuError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise
  } catch (error) {
    assert.ok(isZhipuBackendError(error), `expected a ZhipuBackendError, got ${String(error)}`)
    assert.equal(error.code, code)
    return
  }
  assert.fail(`expected ${code} but the call resolved`)
}

// 1. Frame order, headers, and result extraction.
reset(standardResponder())
const result = await callMcpTool('https://open.bigmodel.cn/api/mcp/web_search_prime/mcp', 'key-1', 'web_search_prime', { search_query: 'q' })
assert.deepEqual(result, { content: [{ type: 'text', text: 'hello' }] }, 'the id-2 frame must win over later frames')
assert.deepEqual(calls.map((call) => call.method), ['POST', 'POST', 'POST', 'DELETE'], `frame order: ${JSON.stringify(calls.map((call) => call.method))}`)
assert.equal(calls[0].body.method, 'initialize')
assert.equal(calls[0].body.params.protocolVersion, '2024-11-05')
assert.equal(calls[0].headers['mcp-session-id'], undefined, 'initialize must not carry a session header')
assert.equal(calls[1].body.method, 'notifications/initialized')
assert.equal(calls[1].headers['mcp-session-id'], 'sess-abc')
assert.equal(calls[2].body.method, 'tools/call')
assert.deepEqual(calls[2].body.params, { name: 'web_search_prime', arguments: { search_query: 'q' } })
assert.equal(calls[2].headers['mcp-session-id'], 'sess-abc')
assert.equal(calls[3].headers['mcp-session-id'], 'sess-abc', 'termination must target the same session')
assert.equal(calls[3].body, undefined)
assert.equal(calls[0].headers.authorization, 'Bearer key-1')
assert.equal(calls[0].headers.accept, 'application/json, text/event-stream')

// 2. Whole-body JSON instead of SSE, plus contentText joins text blocks only.
reset(() => json({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x' }, { text: 'b' }] } }))
const whole = await callMcpTool('https://example.test/mcp', 'key', 'webReader', { url: 'https://x' })
assert.deepEqual(contentText(whole), 'a\nb', 'contentText joins text blocks and skips non-text ones')

// 3. Double-encoded tool text unwraps twice.
const doubleEncoded = JSON.stringify(JSON.stringify([{ link: 'https://a.test', content: 'snippet' }]))
assert.deepEqual(parseMaybeDoubleEncoded(doubleEncoded), [{ link: 'https://a.test', content: 'snippet' }])
assert.equal(parseMaybeDoubleEncoded('not json'), 'not json')

// 4. Sensitive-content rejection maps to the fixed Chinese hint.
reset(() => sse({ jsonrpc: '2.0', id: 2, result: { isError: true, content: [{ type: 'text', text: 'content_filter triggered' }] } }))
await expectZhipuError(callMcpTool('https://example.test/mcp', 'key', 'web_search_prime', {}), 'ZHIPU_CONTENT_FILTERED')
assert.equal(calls.at(-1)?.method, 'DELETE', 'termination must still run after a mapped failure')

// 5. Unindexed repository maps to the fixed Chinese answer.
reset(() => sse({ jsonrpc: '2.0', id: 2, result: { isError: true, content: [{ type: 'text', text: 'repo not found: acme/private' }] } }))
await expectZhipuError(callMcpTool('https://example.test/mcp', 'key', 'read_file', {}), 'ZHIPU_REPO_NOT_FOUND')

// 6. Upstream 5xx keeps the status in the message.
reset(() => new Response('MCP error: -500 boom', { status: 500, headers: { 'content-type': 'text/plain' } }))
try {
  await callMcpTool('https://example.test/mcp', 'key', 'web_search_prime', {})
  assert.fail('expected the HTTP 500 to throw')
} catch (error) {
  assert.ok(isZhipuBackendError(error))
  assert.match(error.message, /HTTP 500/)
}

// 7. The 8 MiB cap is enforced from content-length before streaming.
reset(() => new Response('', { status: 200, headers: { 'content-length': String(MCP_MAX_RESPONSE_BYTES + 1) } }))
try {
  await callMcpTool('https://example.test/mcp', 'key', 'web_search_prime', {})
  assert.fail('expected the oversize body to throw')
} catch (error) {
  assert.ok(isZhipuBackendError(error))
  assert.match(error.message, /8/)
}

// 8. A pre-aborted external signal reports ZHIPU_ABORTED.
reset(standardResponder())
const controller = new AbortController()
controller.abort()
await expectZhipuError(createMcpSession('https://example.test/mcp', 'key').call('web_search_prime', {}, controller.signal), 'ZHIPU_ABORTED')

globalThis.fetch = realFetch
console.log(`mcp-smoke: ok — ${calls.length >= 0 ? 'frame order, session header, SSE/JSON, double-encoding, 5 failure modes' : ''}`)
