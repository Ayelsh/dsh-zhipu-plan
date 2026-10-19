/**
 * Offline smoke test for the zread tools.
 *
 * The global fetch is replaced by a recorder that plays the Streamable-HTTP
 * handshake (initialize, initialized notification, tools/call, DELETE). Every
 * exchange is captured so the checks can assert the exact upstream tool name,
 * the forwarded arguments, and the negotiated session header. No network is
 * used and no credential leaves the process.
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings scripts/zread-smoke.mts
 *
 * @module dsh-zhipu-plan/scripts/zread-smoke
 */

import assert from 'node:assert/strict'
import { ZhipuBackendError } from '../src/host/errors.ts'
import {
  REPO_NAME_PATTERN,
  ZREAD_TIMEOUT_MS,
  ZREAD_TOOL_NAMES,
  createZreadToolDefinitions,
  zreadPromptSections,
} from '../src/host/zread.ts'
import type { ZreadDeps, ZreadToolName } from '../src/host/zread.ts'
import type { ToolDefinitionShape, ZhipuBackendSettings } from '../src/host/types.ts'

/** The MCP endpoint the smoke deps report. */
const ENDPOINT = 'https://open.bigmodel.cn/api/mcp/zread/mcp'
/** The plan key the smoke deps resolve. */
const API_KEY = 'smoke-plan-key'
/** Session id the scripted initialize response advertises. */
const SESSION_ID = 'smoke-session-1'
/** Text the happy-path tools/call result carries. */
const ANSWER_TEXT = 'ANSWER-TEXT'

/** One captured fetch exchange. */
interface Exchange {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: unknown
}

/** The tools/call result the scripted gateway returns for the current mode. */
type GatewayMode = 'ok' | 'content-filter' | 'empty' | 'repo-not-found'

const exchanges: Exchange[] = []
let gatewayMode: GatewayMode = 'ok'
let resolvedKey = API_KEY

/** Build the scripted tools/call result for the active mode. */
function gatewayResult(): unknown {
  switch (gatewayMode) {
    case 'content-filter':
      return { isError: true, content: [{ type: 'text', text: 'upstream content filter matched' }] }
    case 'empty':
      return { content: [] }
    case 'repo-not-found':
      return { isError: true, content: [{ type: 'text', text: 'repo not found: owner/repo' }] }
    default:
      return { content: [{ type: 'text', text: ANSWER_TEXT }] }
  }
}

/** Read the JSON-RPC method/id of one captured body. */
function asRpcBody(value: unknown): { method?: string; id?: number } | undefined {
  return typeof value === 'object' && value !== null ? (value as { method?: string; id?: number }) : undefined
}

// Replace the global fetch before any tool is created: the tools resolve fetch
// lazily, so every upstream exchange goes through this recorder.
globalThis.fetch = (async (input: unknown, init: Record<string, unknown> = {}): Promise<Response> => {
  const rawHeaders = typeof init.headers === 'object' && init.headers !== null ? (init.headers as Record<string, string>) : {}
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawHeaders)) headers[key.toLowerCase()] = String(value)
  const rawBody = typeof init.body === 'string' ? init.body : undefined
  const body: unknown = rawBody === undefined ? undefined : JSON.parse(rawBody)
  const method = typeof init.method === 'string' ? init.method.toUpperCase() : 'GET'
  exchanges.push({ url: String(input), method, headers, body })
  const rpc = asRpcBody(body)
  if (rpc?.method === 'initialize') {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'zread-smoke', version: '0.0.0' },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': SESSION_ID } },
    )
  }
  if (rpc?.method === 'notifications/initialized') return new Response(null, { status: 202 })
  if (rpc?.method === 'tools/call') {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: gatewayResult() }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc?.id, error: { code: -32601, message: 'unknown method' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}) as unknown as typeof fetch

/** The runtime settings the smoke deps read. */
const settings: ZhipuBackendSettings = { search: true, reader: true, zread: true, zhPrompt: true }

/** Build deps around the recorder and the mutable plan key. */
const deps: ZreadDeps = {
  settings: () => settings,
  endpoint: () => ENDPOINT,
  resolveApiKey: async () => resolvedKey,
}

const tools = createZreadToolDefinitions(deps)
const toolByName = new Map<string, ToolDefinitionShape>(tools.map((tool) => [tool.name, tool]))

/** Return one definition, failing loudly when it is absent. */
function toolOf(name: ZreadToolName): ToolDefinitionShape {
  const tool = toolByName.get(name)
  if (tool === undefined) throw new Error(`missing tool definition: ${name}`)
  return tool
}

/** Reset the recorder before one check. */
function reset(mode: GatewayMode = 'ok'): void {
  exchanges.length = 0
  gatewayMode = mode
}

/** Find the tools/call exchange of the current run. */
function findCallExchange(): Exchange | undefined {
  return exchanges.find((entry) => entry.method === 'POST' && asRpcBody(entry.body)?.method === 'tools/call')
}

/** Extract the upstream tool name and arguments from the tools/call exchange. */
function callParams(exchange: Exchange | undefined): { name: string; args: Record<string, unknown> } {
  assert.ok(exchange !== undefined, 'tools/call exchange is missing')
  const body = exchange.body as { params?: { name?: unknown; arguments?: unknown } }
  assert.ok(typeof body.params?.name === 'string', 'tools/call params.name is missing')
  assert.ok(typeof body.params?.arguments === 'object' && body.params.arguments !== null, 'tools/call params.arguments is missing')
  return { name: body.params.name, args: body.params.arguments as Record<string, unknown> }
}

/** Await a rejection and assert its error class, code, and message. */
async function rejectWith(operation: Promise<unknown>, code: string, pattern: RegExp): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof ZhipuBackendError, `expected ZhipuBackendError, got ${String(error)}`)
    assert.equal(error.code, code)
    assert.match(error.message, pattern)
    return true
  })
}

/** The JSON schema every zread tool returns. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: { type: 'string' } },
}

/** Resolve the concurrency flag of a definition. */
function concurrencySafe(tool: ToolDefinitionShape): boolean {
  const flag = tool.isConcurrencySafe
  return typeof flag === 'function' ? flag() : flag === true
}

let passed = 0
let failed = 0

/** Run one check, print a TAP-style line, and keep the run going on failure. */
async function test(name: string, run: () => Promise<void> | void): Promise<void> {
  try {
    await run()
    passed += 1
    console.log(`ok ${passed + failed} - ${name}`)
  } catch (error) {
    failed += 1
    console.log(`not ok ${passed + failed} - ${name}`)
    for (const line of String(error).split('\n')) console.log(`  ${line}`)
  }
}

await test('definitions expose the documented schema', () => {
  assert.equal(tools.length, 3)
  assert.deepEqual(tools.map((tool) => tool.name), [...ZREAD_TOOL_NAMES])
  for (const tool of tools) {
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
    assert.ok(Array.isArray(tool.parameters.required))
    assert.deepEqual(tool.output.schema, OUTPUT_SCHEMA)
    assert.deepEqual(tool.output.render(undefined, { text: 'hello' }), [{ type: 'text', text: 'hello' }])
    assert.deepEqual(tool.output.render(undefined, undefined), [{ type: 'text', text: '' }])
    assert.equal(tool.timeoutMs, ZREAD_TIMEOUT_MS)
    assert.equal(tool.timeoutMs, 60_000)
    assert.equal(concurrencySafe(tool), true)
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.presentCall, 'function')
    assert.equal(typeof tool.presentResult, 'function')
  }
  assert.deepEqual(toolOf('github_search_doc').parameters.required, ['repo_name', 'query'])
  assert.deepEqual(toolOf('github_get_repo_structure').parameters.required, ['repo_name'])
  assert.deepEqual(toolOf('github_read_file').parameters.required, ['repo_name', 'file_path'])
  assert.deepEqual(Object.keys(toolOf('github_get_repo_structure').parameters.properties as object).sort(), ['dir_path', 'repo_name'])
})

await test('REPO_NAME_PATTERN accepts owner/repo and rejects malformed names', () => {
  assert.equal(REPO_NAME_PATTERN.test('vitejs/vite'), true)
  assert.equal(REPO_NAME_PATTERN.test('a/b.c-d_e'), true)
  assert.equal(REPO_NAME_PATTERN.test('ZCode'), false)
  assert.equal(REPO_NAME_PATTERN.test('zai-org/ZCode mcp'), false)
  assert.equal(REPO_NAME_PATTERN.test('zai-org/'), false)
})

await test('illegal repo_name is rejected before any upstream call', async () => {
  reset()
  const search = toolOf('github_search_doc')
  await rejectWith(search.execute({ repo_name: 'foo', query: 'usage' }, {}), 'ZHIPU_PROVIDER_ERROR', /repo_name/)
  assert.equal(exchanges.length, 0)
  await rejectWith(search.execute({ repo_name: 'zai-org/ZCode mcp', query: 'usage' }, {}), 'ZHIPU_PROVIDER_ERROR', /owner\/repo/)
  assert.equal(exchanges.length, 0)
  await rejectWith(search.execute({ query: 'usage' }, {}), 'ZHIPU_PROVIDER_ERROR', /repo_name/)
  assert.equal(exchanges.length, 0)
  await rejectWith(toolOf('github_get_repo_structure').execute({ repo_name: 'ZCode' }, {}), 'ZHIPU_PROVIDER_ERROR', /repo_name/)
  assert.equal(exchanges.length, 0)
})

await test('missing required parameters are rejected before any upstream call', async () => {
  reset()
  await rejectWith(toolOf('github_search_doc').execute({ repo_name: 'vitejs/vite' }, {}), 'ZHIPU_PROVIDER_ERROR', /query/)
  await rejectWith(toolOf('github_read_file').execute({ repo_name: 'vitejs/vite' }, {}), 'ZHIPU_PROVIDER_ERROR', /file_path/)
  await rejectWith(toolOf('github_read_file').execute({ repo_name: 'vitejs/vite', file_path: '   ' }, {}), 'ZHIPU_PROVIDER_ERROR', /file_path/)
  assert.equal(exchanges.length, 0)
})

await test('github_search_doc maps to search_doc with unchanged arguments', async () => {
  reset()
  const result = await toolOf('github_search_doc').execute(
    { repo_name: 'vitejs/vite', query: 'build config', language: 'zh' },
    {},
  )
  assert.deepEqual(result, { text: ANSWER_TEXT })
  const call = findCallExchange()
  const params = callParams(call)
  assert.equal(params.name, 'search_doc')
  assert.deepEqual(params.args, { repo_name: 'vitejs/vite', query: 'build config', language: 'zh' })
  assert.equal(call?.url, ENDPOINT)
  assert.equal(call?.headers['mcp-session-id'], SESSION_ID)
  assert.equal(call?.headers.authorization, `Bearer ${API_KEY}`)
  const initialize = exchanges.find((entry) => entry.method === 'POST' && asRpcBody(entry.body)?.method === 'initialize')
  const initializeBody = initialize?.body as { params?: { protocolVersion?: string } } | undefined
  assert.equal(initializeBody?.params?.protocolVersion, '2024-11-05')
  assert.deepEqual(
    exchanges.map((entry) => asRpcBody(entry.body)?.method).filter((method) => method !== undefined),
    ['initialize', 'notifications/initialized', 'tools/call'],
  )
  assert.equal(exchanges.filter((entry) => entry.method === 'DELETE').length, 1)
})

await test('optional search arguments are omitted when absent', async () => {
  reset()
  await toolOf('github_search_doc').execute({ repo_name: 'vitejs/vite', query: 'usage' }, {})
  assert.deepEqual(callParams(findCallExchange()).args, { repo_name: 'vitejs/vite', query: 'usage' })
})

await test('github_get_repo_structure maps to get_repo_structure', async () => {
  reset()
  await toolOf('github_get_repo_structure').execute({ repo_name: 'vitejs/vite', dir_path: 'src' }, {})
  const params = callParams(findCallExchange())
  assert.equal(params.name, 'get_repo_structure')
  assert.deepEqual(params.args, { repo_name: 'vitejs/vite', dir_path: 'src' })
  reset()
  await toolOf('github_get_repo_structure').execute({ repo_name: 'vitejs/vite' }, {})
  assert.deepEqual(callParams(findCallExchange()).args, { repo_name: 'vitejs/vite' })
})

await test('github_read_file maps to read_file', async () => {
  reset()
  await toolOf('github_read_file').execute({ repo_name: 'vitejs/vite', file_path: 'src/index.ts' }, {})
  const params = callParams(findCallExchange())
  assert.equal(params.name, 'read_file')
  assert.deepEqual(params.args, { repo_name: 'vitejs/vite', file_path: 'src/index.ts' })
})

await test('repo_name and optional arguments are trimmed', async () => {
  reset()
  await toolOf('github_search_doc').execute({ repo_name: '  vitejs/vite  ', query: '  usage  ', language: '  ' }, {})
  assert.deepEqual(callParams(findCallExchange()).args, { repo_name: 'vitejs/vite', query: 'usage' })
})

await test('no credential is sent when the plan key is missing', async () => {
  reset()
  resolvedKey = ''
  try {
    await rejectWith(toolOf('github_search_doc').execute({ repo_name: 'vitejs/vite', query: 'usage' }, {}), 'ZHIPU_CREDENTIAL_MISSING', /凭据/)
    assert.equal(exchanges.length, 0)
  } finally {
    resolvedKey = API_KEY
  }
})

await test('a disabled zread switch rejects a historical call', async () => {
  reset()
  settings.zread = false
  try {
    await rejectWith(toolOf('github_read_file').execute({ repo_name: 'vitejs/vite', file_path: 'src/index.ts' }, {}), 'ZHIPU_DISABLED', /关闭/)
    assert.equal(exchanges.length, 0)
  } finally {
    settings.zread = true
  }
})

await test('upstream content filter surfaces the fixed Chinese message', async () => {
  reset('content-filter')
  await rejectWith(
    toolOf('github_read_file').execute({ repo_name: 'vitejs/vite', file_path: 'src/index.ts' }, {}),
    'ZHIPU_CONTENT_FILTERED',
    /敏感词/,
  )
})

await test('an empty upstream result is a provider error', async () => {
  reset('empty')
  await rejectWith(
    toolOf('github_search_doc').execute({ repo_name: 'vitejs/vite', query: 'usage' }, {}),
    'ZHIPU_PROVIDER_ERROR',
    /未返回任何文本内容/,
  )
})

await test('an unindexed repository surfaces the fixed Chinese message', async () => {
  reset('repo-not-found')
  await rejectWith(
    toolOf('github_read_file').execute({ repo_name: 'vitejs/vite', file_path: 'src/index.ts' }, {}),
    'ZHIPU_REPO_NOT_FOUND',
    /仓库未被智谱收录/,
  )
})

await test('prompt sections follow the prompt language', () => {
  const zh = zreadPromptSections(true)
  assert.equal(zh.length, 3)
  for (const section of zh) {
    assert.ok(ZREAD_TOOL_NAMES.some((name) => section.name === `tool:${name}`))
    assert.equal(section.order, 110)
    assert.equal(typeof section.text, 'string')
    assert.match(section.text as string, /owner\/repo/)
    assert.match(section.text as string, /不可信/)
  }
  const en = zreadPromptSections(false)
  assert.equal(en.length, 3)
  for (const section of en) {
    assert.equal(typeof section.text, 'string')
    assert.match(section.text as string, /owner\/repo/)
    assert.match(section.text as string, /untrusted/)
    assert.doesNotMatch(section.text as string, /不可信/)
  }
  assert.notDeepEqual(zh.map((section) => section.text), en.map((section) => section.text))
})

await test('presentCall and presentResult degrade gracefully', () => {
  const search = toolOf('github_search_doc')
  assert.deepEqual(search.presentCall?.({ repo_name: 'vitejs/vite', query: 'usage' }), {
    card: 'generic',
    title: 'vitejs/vite: usage',
    kind: 'fetch',
    rawInput: 'vitejs/vite: usage',
  })
  assert.equal(search.presentCall?.({ repo_name: 'foo', query: 'usage' }), undefined)
  assert.equal(search.presentCall?.({}), undefined)
  assert.equal(search.presentCall?.(null), undefined)
  assert.deepEqual(search.presentResult?.({ repo_name: 'vitejs/vite', query: 'usage' }, { text: 'x' }), {
    card: 'generic',
    title: 'vitejs/vite: usage',
    kind: 'fetch',
    rawInput: 'vitejs/vite: usage',
  })
  assert.equal(search.presentResult?.({ repo_name: 'vitejs/vite', query: 'usage' }, { isError: true }), undefined)
})

console.log(`\n# pass ${passed}, fail ${failed}`)
if (failed > 0) process.exitCode = 1
