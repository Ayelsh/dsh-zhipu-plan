/**
 * Smoke test for the Zhipu web search / reader backends.
 *
 * It stubs `globalThis.fetch` with a minimal MCP gateway and exercises:
 *  - the search provider mapping, filtering, and pre-truncation;
 *  - the search provider error mapping (credential gate and content filter);
 *  - the additional `zhipu_web_search` tool merge, dedupe, cap, and first error;
 *  - the reader clamp plus the bilingual untrusted-content boundary;
 *  - the additional `zhipu_web_fetch` tool url validation, output, and presentation;
 *  - the tool prompt sections and the provider `available()` gates.
 *
 * No network access happens. Run with:
 *   node --experimental-strip-types --no-warnings scripts/web-providers-smoke.mts
 *
 * @module dsh-zhipu-plan/scripts/web-providers-smoke
 */

import assert from 'node:assert/strict'
import { ZhipuBackendError, isZhipuBackendError } from '../src/host/errors.ts'
import type { ZhipuBackendSettings, ZhipuReadOutcome, ZhipuSearchOutcome } from '../src/host/types.ts'
import { untrustedContentBoundary, untrustedContentClosing } from '../src/host/util.ts'
import {
  SEARCH_MAX_RESULTS,
  ZHIPU_SEARCH_PROVIDER_ID,
  ZHIPU_WEB_SEARCH_TOOL_NAME,
  createZhipuSearchProvider,
  createZhipuWebSearchTool,
  webSearchPromptSections,
} from '../src/host/web-search.ts'
import {
  ZHIPU_READER_PROVIDER_ID,
  ZHIPU_WEB_FETCH_TOOL_NAME,
  createZhipuReaderProvider,
  createZhipuWebFetchTool,
  readerPromptSections,
} from '../src/host/web-reader.ts'

const ENDPOINT = 'https://open.bigmodel.cn/api/mcp/mock/mcp'

/** Print one observed value or check line. */
function observe(label: string, value: unknown): void {
  console.log(`  ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
}

/** Build a settings snapshot with explicit overrides. */
function settings(overrides: Partial<ZhipuBackendSettings> = {}): ZhipuBackendSettings {
  return { search: true, reader: true, zread: true, zhPrompt: false, ...overrides }
}

/** The tool-call exchanges the mock gateway saw. */
interface Exchange {
  readonly endpoint: string
  readonly tool: string
  readonly args: Record<string, unknown>
  readonly authorization: string | undefined
  readonly sessionId: string | undefined
}

let exchanges: Exchange[] = []
/** Tool-result builders, keyed by MCP tool name. */
let toolResults: Record<string, () => unknown> = {}
/** Fail the tool call transport instead of answering it. */
let transportFailure: Error | undefined

/** Encode a payload the way the gateway does: twice-encoded JSON in a text block. */
function textResult(payload: unknown): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(JSON.stringify(payload)) }] }
}

const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const endpoint = String(input)
  const method = init?.method ?? 'GET'
  const headers = new Headers(init?.headers as HeadersInit | undefined)
  let body: Record<string, unknown> | undefined
  if (typeof init?.body === 'string') {
    body = JSON.parse(init.body) as Record<string, unknown>
  }

  if (method === 'DELETE') {
    return new Response('', { status: 200 })
  }
  if (body?.method === 'initialize') {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'mock-gateway', version: '0.0.0' },
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'mock-session' },
    })
  }
  if (body?.method === 'notifications/initialized') {
    return new Response('', { status: 202 })
  }
  if (body?.method === 'tools/call') {
    if (transportFailure !== undefined) throw transportFailure
    const params = body.params as { name?: string; arguments?: Record<string, unknown> }
    const tool = params.name ?? ''
    exchanges.push({
      endpoint,
      tool,
      args: params.arguments ?? {},
      authorization: headers.get('authorization') ?? undefined,
      sessionId: headers.get('mcp-session-id') ?? undefined,
    })
    const result = toolResults[tool]?.() ?? textResult({ content: 'mock' })
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return new Response('', { status: 200 })
}

/** Create provider dependencies; the returned object keeps mutable test state. */
function makeDeps(initial: ZhipuBackendSettings = settings(), apiKey = 'test-key'): {
  deps: {
    settings: () => ZhipuBackendSettings
    endpoint: () => string
    credentialAvailable: () => boolean
    resolveApiKey: () => Promise<string>
  }
  set: (next: ZhipuBackendSettings, credential?: boolean, key?: string) => void
} {
  const state = { current: initial, credential: true, key: apiKey }
  const deps = {
    settings: () => state.current,
    endpoint: () => ENDPOINT,
    credentialAvailable: () => state.credential,
    resolveApiKey: async () => state.key,
  }
  return {
    deps,
    set(next, credential = true, key = apiKey) {
      state.current = next
      state.credential = credential
      state.key = key
    },
  }
}

/** Build a merged-outcome fake search backend for the additional tool. */
function fakeSearch(table: Record<string, ZhipuSearchOutcome[]> | ((query: string, signal?: AbortSignal) => Promise<ZhipuSearchOutcome>), calls: string[] = []): {
  search: (request: { readonly query: string; readonly maxResults?: number }, signal?: AbortSignal) => Promise<ZhipuSearchOutcome>
} {
  return {
    search: async (request, signal) => {
      calls.push(request.query)
      if (typeof table === 'function') return table(request.query, signal)
      const outcomes = table[request.query]
      if (outcomes === undefined) throw new Error(`unexpected query: ${request.query}`)
      return outcomes[0] as ZhipuSearchOutcome
    },
  }
}

/** Build one origin-unique source. */
function source(url: string, title?: string): { readonly url: string; readonly title?: string } {
  return title === undefined ? { url } : { url, title }
}

const originalFetch = globalThis.fetch

try {
  globalThis.fetch = stubFetch as typeof fetch

  // (0) Export ids and constants.
  assert.equal(ZHIPU_SEARCH_PROVIDER_ID, 'zhipu-web-search-prime')
  assert.equal(ZHIPU_READER_PROVIDER_ID, 'zhipu-web-reader')
  assert.equal(SEARCH_MAX_RESULTS, 40)
  assert.equal(ZHIPU_WEB_SEARCH_TOOL_NAME, 'zhipu_web_search')
  assert.equal(ZHIPU_WEB_FETCH_TOOL_NAME, 'zhipu_web_fetch')
  console.log('PASS provider ids and constants')

  // (a) Search mapping: link/content/publishedAt -> url/snippet/publishedAt,
  // empty and non-http(s) links filtered out.
  {
    exchanges = []
    toolResults = {
      web_search_prime: () => textResult([
        { link: 'https://example.com/a', title: ' Alpha ', content: 'snippet alpha', publishedAt: '2026-01-02' },
        { link: '', title: 'empty link' },
        { link: 'javascript:alert(1)', title: 'bad scheme' },
        { link: 'https://example.com/b' },
      ]),
    }
    const { deps } = makeDeps(settings())
    const provider = createZhipuSearchProvider(deps)
    const outcome = await provider.search({ query: '  zhipu mcp  ' })
    assert.deepEqual(outcome.results, [
      { url: 'https://example.com/a', title: ' Alpha ', snippet: 'snippet alpha', publishedAt: '2026-01-02' },
      { url: 'https://example.com/b' },
    ])
    assert.equal(outcome.truncated, false)
    assert.equal(exchanges.length, 1)
    assert.equal(exchanges[0]?.tool, 'web_search_prime')
    assert.equal(exchanges[0]?.args.search_query, 'zhipu mcp')
    assert.equal(exchanges[0]?.authorization, 'Bearer test-key')
    assert.equal(exchanges[0]?.sessionId, 'mock-session')
    observe('mapped results', outcome.results)
    console.log('PASS search mapping + empty/non-http link filtering')
  }

  // (b) maxResults pre-truncation keeps truncated false; the default cap is 40.
  {
    toolResults = {
      web_search_prime: () => textResult([
        { link: 'https://example.com/1' },
        { link: 'https://example.com/2' },
        { link: 'https://example.com/3' },
      ]),
    }
    const provider = createZhipuSearchProvider(makeDeps().deps)
    const capped = await provider.search({ query: 'q', maxResults: 1 })
    assert.equal(capped.results.length, 1)
    assert.equal(capped.truncated, false)
    toolResults = {
      web_search_prime: () => textResult(
        Array.from({ length: 45 }, (_item, index) => ({ link: `https://example.com/def-${index}` })),
      ),
    }
    const defaulted = await provider.search({ query: 'q' })
    assert.equal(defaulted.results.length, SEARCH_MAX_RESULTS)
    assert.equal(defaulted.truncated, false)
    observe('maxResults=1 result count', capped.results.length)
    observe('default result count', defaulted.results.length)
    console.log('PASS maxResults pre-truncation with truncated:false')
  }

  // (c) Provider error mapping: empty credential and upstream content filter.
  {
    const missing = createZhipuSearchProvider(makeDeps(settings(), '').deps)
    await assert.rejects(missing.search({ query: 'q' }), (error: unknown) => {
      assert.ok(error instanceof ZhipuBackendError)
      assert.equal((error as ZhipuBackendError).code, 'ZHIPU_CREDENTIAL_MISSING')
      return true
    })
    toolResults = {
      web_search_prime: () => ({ isError: true, content: [{ type: 'text', text: 'content_filter hit' }] }),
    }
    const filtered = createZhipuSearchProvider(makeDeps().deps)
    await assert.rejects(filtered.search({ query: 'q' }), (error: unknown) => {
      assert.ok(isZhipuBackendError(error))
      assert.equal((error as ZhipuBackendError).code, 'ZHIPU_CONTENT_FILTERED')
      return true
    })
    observe('content-filter message', (await filtered.search({ query: 'q' }).catch((error: ZhipuBackendError) => error.message)))
    console.log('PASS provider credential + content-filter error mapping')
  }

  // (d) Shadow tool: round-robin merge with case-insensitive URL dedupe.
  {
    const calls: string[] = []
    const search = fakeSearch({
      'alpha query': [{
        results: [source('https://merge.example/1'), source('https://merge.example/2'), source('https://merge.example/3')],
        truncated: false,
      }],
      'beta query': [{
        results: [source('https://merge.example/4'), source('https://merge.example/2'), source('https://merge.example/5')],
        truncated: false,
      }],
      'gamma query': [{
        results: [source('https://merge.example/6')],
        truncated: false,
      }],
    }, calls)
    const tool = createZhipuWebSearchTool({ settings: () => settings(), search: search.search })
    const value = await tool.execute({ queries: ['alpha query', 'beta query', 'gamma query'] }, {})
    const urls = (value as { sources: Array<{ url: string }> }).sources.map((item) => item.url)
    assert.deepEqual(urls, [
      'https://merge.example/1',
      'https://merge.example/4',
      'https://merge.example/6',
      'https://merge.example/2',
      'https://merge.example/3',
      'https://merge.example/5',
    ])
    assert.equal((value as { truncated: boolean }).truncated, false)
    assert.deepEqual(calls, ['alpha query', 'beta query', 'gamma query'])
    observe('round-robin order', urls)
    console.log('PASS additional tool round-robin merge + URL dedupe')
  }

  // (d2) Shadow tool cap: 4 queries x 15 unique candidates = 60 -> cap 40, truncated.
  {
    const table: Record<string, ZhipuSearchOutcome[]> = {}
    for (let queryIndex = 0; queryIndex < 4; queryIndex++) {
      table[`q${queryIndex}`] = [{
        results: Array.from({ length: 15 }, (_item, rank) => source(`https://cap.example/q${queryIndex}-${rank}`)),
        truncated: false,
      }]
    }
    const tool = createZhipuWebSearchTool({ settings: () => settings(), search: fakeSearch(table).search })
    const value = await tool.execute({ queries: ['q0', 'q1', 'q2', 'q3'] }, {})
    const sources = (value as { sources: Array<{ url: string }> }).sources
    assert.equal(sources.length, SEARCH_MAX_RESULTS)
    assert.equal((value as { truncated: boolean }).truncated, true)
    assert.equal(sources[0]?.url, 'https://cap.example/q0-0')
    assert.equal(sources[39]?.url, 'https://cap.example/q3-9')
    const rendered = tool.output.render({}, value).map((block) => block.text).join('\n')
    assert.ok(rendered.includes('Cite the relevant URLs above as markdown links in your answer.'))
    assert.ok(rendered.includes('(Showing the first 40 sources. Refine the query for more.)'))
    assert.equal(rendered.split('\n').filter((line) => line.startsWith('- [')).length, 40)
    observe('capped source count', sources.length)
    observe('capped truncated', (value as { truncated: boolean }).truncated)
    console.log('PASS additional tool 40-source cap + truncation rendering')
  }

  // (d3) Shadow tool: single query passes maxResults 40; first error in query
  // order propagates after the other calls settle.
  {
    const singleCalls: Array<{ query: string; maxResults?: number }> = []
    const single = createZhipuWebSearchTool({
      settings: () => settings(),
      search: async (request) => {
        singleCalls.push({ query: request.query, maxResults: request.maxResults })
        return { results: [source('https://single.example/1')], truncated: false }
      },
    })
    const singleValue = await single.execute({ queries: ['solo'] }, {})
    assert.equal((singleValue as { sources: unknown[] }).sources.length, 1)
    assert.equal(singleCalls.length, 1)
    assert.equal(singleCalls[0]?.maxResults, SEARCH_MAX_RESULTS)

    const failing = createZhipuWebSearchTool({
      settings: () => settings(),
      search: async (request) => {
        if (request.query === 'beta query') throw new Error('upstream beta failed')
        return { results: [source(`https://ok.example/${request.query}`)], truncated: false }
      },
    })
    await assert.rejects(
      failing.execute({ queries: ['alpha query', 'beta query', 'gamma query'] }, {}),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.message, 'upstream beta failed')
        return true
      },
    )
    observe('single-query maxResults', singleCalls[0]?.maxResults)
    console.log('PASS additional tool single-query path + first-error propagation')
  }

  // (d4) Shadow tool rejects invalid query lists and appends the citation hint
  // for an empty result set.
  {
    const tool = createZhipuWebSearchTool({
      settings: () => settings(),
      search: async () => ({ results: [], truncated: false }),
    })
    await assert.rejects(tool.execute({ queries: [] }, {}), /at least one query/)
    await assert.rejects(tool.execute({ queries: ['a', 'b', 'c', 'd', 'e'] }, {}), /at most 4 queries/)
    await assert.rejects(tool.execute({ queries: ['ok', '   '] }, {}), /non-empty string/)
    const empty = await tool.execute({ queries: ['nothing'] }, {})
    const rendered = tool.output.render({}, empty).map((block) => block.text).join('\n')
    assert.ok(rendered.includes('No results found.'))
    assert.ok(rendered.includes('Cite the relevant URLs above as markdown links in your answer.'))
    observe('empty result render', rendered)
    console.log('PASS additional tool query validation + empty result rendering')
  }

  // (e) Reader: 200 000-char clamp sets truncated and wraps the bilingual
  // boundary; the payload title and redirected url are kept.
  {
    exchanges = []
    const longBody = 'x'.repeat(200_005)
    toolResults = { webReader: () => textResult({ title: 'Long page', url: 'https://example.com/final', content: longBody }) }
    const provider = createZhipuReaderProvider(makeDeps().deps)
    const outcome = await provider.fetch({ url: 'https://example.com/start' })
    assert.equal(outcome.truncated, true)
    assert.equal(outcome.statusCode, 200)
    assert.equal(outcome.url, 'https://example.com/final')
    assert.equal(outcome.title, 'Long page')
    assert.equal(outcome.body.kind, 'text')
    assert.equal(
      outcome.body.content,
      `${untrustedContentBoundary()}\n\n${'x'.repeat(200_000)}\n\n${untrustedContentClosing()}`,
    )
    assert.equal(exchanges.length, 1)
    assert.equal(exchanges[0]?.tool, 'webReader')
    assert.deepEqual(exchanges[0]?.args, {
      url: 'https://example.com/start',
      return_format: 'markdown',
      retain_images: false,
      timeout: 20,
    })
    observe('reader truncated', outcome.truncated)
    observe('reader clamped body length', outcome.body.content.length)
    observe('reader boundary prefix', outcome.body.content.slice(0, 12))
    console.log('PASS reader 200k clamp + bilingual untrusted boundary')

    toolResults = { webReader: () => textResult({ content: 'hello world' }) }
    const short = await createZhipuReaderProvider(makeDeps().deps).fetch({ url: 'https://example.com/short' })
    assert.equal(short.truncated, false)
    assert.equal(short.url, 'https://example.com/short')
    assert.equal(short.body.content, `${untrustedContentBoundary()}\n\nhello world\n\n${untrustedContentClosing()}`)
    observe('short reader content', short.body.content)
    console.log('PASS reader short page keeps requested url + boundary')
  }

  // (e2) Reader failures: empty body, unsafe redirect, missing credential.
  {
    toolResults = { webReader: () => textResult({ content: '' }) }
    await assert.rejects(
      createZhipuReaderProvider(makeDeps().deps).fetch({ url: 'https://example.com/empty' }),
      (error: unknown) => {
        assert.ok(isZhipuBackendError(error))
        assert.equal((error as ZhipuBackendError).code, 'ZHIPU_PROVIDER_ERROR')
        assert.match((error as Error).message, /webReader/)
        return true
      },
    )
    toolResults = { webReader: () => textResult({ url: 'javascript:alert(1)', content: 'body' }) }
    const unsafe = await createZhipuReaderProvider(makeDeps().deps).fetch({ url: 'https://example.com/safe' })
    assert.equal(unsafe.url, 'https://example.com/safe')
    await assert.rejects(
      createZhipuReaderProvider(makeDeps(settings(), '').deps).fetch({ url: 'https://example.com/x' }),
      (error: unknown) => {
        assert.equal((error as ZhipuBackendError).code, 'ZHIPU_CREDENTIAL_MISSING')
        return true
      },
    )
    console.log('PASS reader empty-body / unsafe-redirect / credential errors')
  }

  // (e3) Additional zhipu_web_fetch tool: url validation, output shape,
  // truncation rendering, and the presentation callbacks.
  {
    const reads: Array<{ url: string }> = []
    const makeFetchTool = (zhPrompt: boolean, outcome: Partial<ZhipuReadOutcome> = {}) => createZhipuWebFetchTool({
      settings: () => settings({ zhPrompt }),
      fetch: async (request) => {
        reads.push({ url: request.url })
        return {
          url: outcome.url ?? request.url,
          statusCode: 200,
          body: { kind: 'text', content: outcome.body?.content ?? 'page body' },
          truncated: outcome.truncated ?? false,
        }
      },
    })
    const tool = makeFetchTool(false)
    const value = await tool.execute({ url: '  https://example.com/page  ' }, {})
    assert.deepEqual(value, { url: 'https://example.com/page', statusCode: 200, text: 'page body' })
    assert.deepEqual(reads, [{ url: 'https://example.com/page' }])
    assert.equal(tool.timeoutMs, 60_000)
    assert.equal(tool.isConcurrencySafe?.(), true)
    await assert.rejects(tool.execute({ url: '   ' }, {}), /non-empty string/)
    await assert.rejects(tool.execute({}, {}), /non-empty string/)
    await assert.rejects(tool.execute({ url: 'javascript:alert(1)' }, {}), /http\(s\) URL/)
    const truncatedTool = makeFetchTool(false, { truncated: true, body: { kind: 'text', content: 'long page' } })
    const truncatedValue = await truncatedTool.execute({ url: 'https://example.com/long' }, {})
    assert.equal((truncatedValue as { truncated?: boolean }).truncated, true)
    const rendered = truncatedTool.output.render({}, truncatedValue).map((block) => block.text).join('\n')
    assert.ok(rendered.includes('long page'))
    assert.ok(rendered.includes('Page content was truncated at 200,000 characters'))
    const zhTool = makeFetchTool(true, { truncated: true, body: { kind: 'text', content: '长页面' } })
    const zhValue = await zhTool.execute({ url: 'https://example.com/zh' }, {})
    assert.ok(zhTool.output.render({}, zhValue).map((block) => block.text).join('\n').includes('页面内容已截断'))
    assert.deepEqual(tool.presentCall?.({ url: 'https://example.com/page' }), {
      card: 'generic',
      title: 'https://example.com/page',
      kind: 'fetch',
      rawInput: 'https://example.com/page',
    })
    assert.equal(tool.presentCall?.({}), undefined)
    assert.deepEqual(tool.presentResult?.({ url: 'https://example.com/page' }, {
      isError: false,
      meta: { url: 'https://example.com/final', statusCode: 200, truncated: false },
    }), {
      card: 'web',
      kind: 'fetch',
      title: 'https://example.com/page',
      url: 'https://example.com/final',
      statusCode: 200,
      truncated: false,
    })
    assert.equal(tool.presentResult?.({ url: 'x' }, { isError: true }), undefined)
    assert.equal(tool.presentResult?.({ url: 'x' }, { isError: false, meta: { url: 1 } }), undefined)
    observe('fetch tool value', value)
    console.log('PASS additional zhipu_web_fetch tool validation + output + presentation')
  }

  // (e4) Tool prompt sections: names, order, and bilingual text.
  {
    const searchEn = webSearchPromptSections(false)
    const searchZh = webSearchPromptSections(true)
    assert.equal(searchEn.length, 1)
    assert.equal(searchEn[0]?.name, 'tool:zhipu_web_search')
    assert.equal(searchEn[0]?.order, 110)
    assert.match(searchEn[0]?.text ?? '', /built-in web_search stays available/)
    assert.match(searchZh[0]?.text ?? '', /内置 web_search 仍然可用/)
    const readerEn = readerPromptSections(false)
    const readerZh = readerPromptSections(true)
    assert.equal(readerEn.length, 1)
    assert.equal(readerEn[0]?.name, 'tool:zhipu_web_fetch')
    assert.equal(readerEn[0]?.order, 110)
    assert.match(readerEn[0]?.text ?? '', /built-in web_fetch stays available/)
    assert.match(readerZh[0]?.text ?? '', /内置 web_fetch 仍然可用/)
    console.log('PASS tool prompt sections zh/en with built-in coexistence wording')
  }

  // (f) available() gates: search switch, reader switch, credential gate.
  {
    const gate = makeDeps(settings())
    const searchProvider = createZhipuSearchProvider(gate.deps)
    const readerProvider = createZhipuReaderProvider(gate.deps)
    assert.equal(searchProvider.available(), true)
    assert.equal(readerProvider.available(), true)
    gate.set(settings({ search: false }))
    assert.equal(searchProvider.available(), false)
    gate.set(settings({ reader: false }))
    assert.equal(readerProvider.available(), false)
    gate.set(settings(), false)
    assert.equal(searchProvider.available(), false)
    assert.equal(readerProvider.available(), false)
    observe('provider ids', [searchProvider.id, readerProvider.id])
    console.log('PASS available() gates follow settings switches + credential')
  }

  // (g) zhPrompt flips model-facing language in the additional tool definition.
  {
    const en = createZhipuWebSearchTool({ settings: () => settings(), search: fakeSearch({ 'x': [{ results: [], truncated: false }] }).search })
    const zh = createZhipuWebSearchTool({ settings: () => settings({ zhPrompt: true }), search: fakeSearch({ 'x': [{ results: [], truncated: false }] }).search })
    assert.notEqual(en.description, zh.description)
    assert.match(en.description, /Search the web/)
    assert.match(zh.description, /智谱/)
    const args = { queries: ['alpha query', 'beta query'] }
    assert.deepEqual(en.presentCall?.(args), {
      card: 'generic',
      title: 'alpha query, beta query',
      kind: 'search',
      rawInput: 'alpha query, beta query',
    })
    const presented = en.presentResult?.(args, {
      isError: false,
      meta: { sources: [{ url: 'https://example.com/a', title: 'A' }], truncated: false },
    })
    assert.deepEqual(presented, {
      card: 'web',
      kind: 'search',
      title: 'alpha query, beta query',
      sources: [{ url: 'https://example.com/a', title: 'A' }],
      truncated: false,
    })
    assert.equal(en.timeoutMs, 30_000)
    assert.equal(en.isConcurrencySafe?.(), true)
    observe('en description head', en.description.slice(0, 60))
    observe('zh description head', zh.description.slice(0, 60))
    console.log('PASS additional tool zhPrompt localization + presentation callbacks')
  }

  console.log('SMOKE OK: all Zhipu web-backend checks passed')
} finally {
  globalThis.fetch = originalFetch
}
