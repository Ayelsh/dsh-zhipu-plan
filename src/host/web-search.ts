/**
 * Zhipu-backed web search: the provider registered on the host web service,
 * plus the additional `zhipu_web_search` global tool definition. The built-in
 * `web_search` tool is never replaced — the Zhipu search is an extra
 * capability mounted by the search switch.
 *
 * The provider only maps the upstream `web_search_prime` payload into safe
 * sources. Rendering, citation hints, and the untrusted-content hardening of
 * every externally sourced string are the tool layer's job.
 *
 * @module dsh-zhipu-plan/host/web-search
 */

import { credentialMissingError, providerError } from './errors.ts'
import { callMcpTool, contentText, parseMaybeDoubleEncoded } from './mcp.ts'
import type {
  SystemPromptSectionShape,
  ToolDefinitionShape,
  ToolRenderBlock,
  WebSearchProviderShape,
  ZhipuBackendSettings,
  ZhipuSearchOutcome,
  ZhipuSearchSource,
} from './types.ts'
import {
  escapeMarkdownLinkText,
  foldExternalInlineText,
  isRecord,
  sanitizeExternalUrl,
} from './util.ts'

/** Stable id of the Zhipu search provider, as registered on the host web service. */
export const ZHIPU_SEARCH_PROVIDER_ID = 'zhipu-web-search-prime'

/** Alias kept for the change request's original constant name. */
export const SEARCH_PROVIDER_ID = ZHIPU_SEARCH_PROVIDER_ID

/** Most queries one `web_search` call accepts. */
export const SEARCH_MAX_QUERIES = 4

/**
 * Most sources one `web_search` call returns. The upstream `web_search_prime`
 * hard-caps every query at 10 entries and accepts no count argument, so four
 * queries yield at most 40 candidates; the cap is the full pass-through, not a
 * second filter.
 */
export const SEARCH_MAX_RESULTS = 40

/** Execution deadline of one `web_search` tool call in milliseconds. */
export const SEARCH_TIMEOUT_MS = 30_000

/** Name of the upstream MCP tool that answers search queries. */
const SEARCH_MCP_TOOL = 'web_search_prime'

/** Name of the additional Zhipu search tool this module defines. */
export const ZHIPU_WEB_SEARCH_TOOL_NAME = 'zhipu_web_search'

/** Host services the search provider and the shadow tool read at call time. */
export interface WebSearchDeps {
  /** Current plugin settings snapshot. */
  readonly settings: () => ZhipuBackendSettings
  /** Resolve the MCP endpoint for the configured deployment. */
  readonly endpoint: () => string
  /** Whether a usable credential can be resolved without waiting (sync gate). */
  readonly credentialAvailable: () => boolean
  /** Resolve the plan credential, rejecting when none is stored. */
  readonly resolveApiKey: (signal?: AbortSignal) => Promise<string>
}

/** The search backend the additional `zhipu_web_search` tool executes against. */
export interface ZhipuWebSearchToolDeps {
  /** Current plugin settings snapshot. */
  readonly settings: () => ZhipuBackendSettings
  /** Run one merged search, exactly like the registered provider does. */
  readonly search: (request: {
    readonly query: string
    readonly maxResults?: number
  }, signal?: AbortSignal) => Promise<ZhipuSearchOutcome>
}

/** One value of the shadow tool's output schema. */
interface SearchToolValue {
  /** Optional synthesized answer; the Zhipu backend currently returns none. */
  readonly content?: string
  readonly sources: readonly ZhipuSearchSource[]
  readonly truncated: boolean
}

/** The presentation metadata stored with one tool result. */
interface SearchPresentationMeta {
  readonly sources: readonly ZhipuSearchSource[]
  readonly truncated: boolean
  readonly answer?: string
}

/** A model-facing string with its Chinese and English variants. */
interface LocalizedText {
  readonly zh: string
  readonly en: string
}

/** Pick the Chinese or English variant of model-facing text. */
function pick(localized: LocalizedText, zhPrompt: boolean): string {
  return zhPrompt ? localized.zh : localized.en
}

const WEB_SEARCH_TOOL_DESC: LocalizedText = {
  en: 'Search the web through Zhipu. This is an additional search tool alongside the built-in web_search; prefer it for supplementary or Chinese-language retrieval. Provide 1–4 focused queries in the required queries array and receive a merged list of source URLs. Zhipu applies sensitive-result filtering, so keep each query precise instead of broad.',
  zh: '通过智谱搜索获取网络信息。这是内置 web_search 之外的附加搜索工具，适合补充检索或中文资料。在必填的 queries 数组中提供 1–4 条聚焦的查询，返回合并后的来源 URL 列表。智谱会有敏感结果过滤，请保持每条查询精确，不要过于宽泛。',
}

const QUERIES_PARAM_DESC: LocalizedText = {
  en: 'Required search queries; accepts 1–4 items and merges their results.',
  zh: '必填搜索查询；接受 1–4 条并合并结果。',
}

/**
 * Narrow one upstream payload item into a safe source. Entries without a
 * usable http(s) link are dropped: an empty, relative, or non-http(s) link can
 * never become a model-visible citation.
 * @param value - one item of the upstream `web_search_prime` array.
 * @returns the safe source, or undefined when the item carries no usable link.
 */
function toSearchSource(value: unknown): ZhipuSearchSource | undefined {
  if (!isRecord(value)) return undefined
  const url = sanitizeExternalUrl(value.link)
  if (url === null) return undefined
  const source: { url: string; title?: string; snippet?: string; publishedAt?: string } = { url }
  if (typeof value.title === 'string' && value.title.length > 0) source.title = value.title
  if (typeof value.content === 'string' && value.content.length > 0) source.snippet = value.content
  if (typeof value.publishedAt === 'string' && value.publishedAt.length > 0) source.publishedAt = value.publishedAt
  return source
}

/**
 * Create the Zhipu search provider for the host web service.
 * The provider is selected only while the search switch is on and a credential
 * is resolvable; `available()` is synchronous and performs no network work.
 * @param deps - the host services the provider reads.
 * @returns the provider to register with the host web service.
 */
export function createZhipuSearchProvider(deps: WebSearchDeps): WebSearchProviderShape {
  return {
    id: ZHIPU_SEARCH_PROVIDER_ID,
    available(): boolean {
      return deps.settings().search && deps.credentialAvailable()
    },
    async search(request, signal) {
      const zhPrompt = deps.settings().zhPrompt
      const query = String(request.query ?? '').trim()
      if (query.length === 0) {
        throw providerError(SEARCH_MCP_TOOL, new Error('query must be a non-empty string'), zhPrompt)
      }
      try {
        const apiKey = await deps.resolveApiKey(signal)
        if (apiKey.length === 0) throw credentialMissingError(zhPrompt)
        const result = await callMcpTool(
          deps.endpoint(),
          apiKey,
          SEARCH_MCP_TOOL,
          { search_query: query },
          signal,
          { zhPrompt },
        )
        const items = parseMaybeDoubleEncoded(contentText(result))
        if (!Array.isArray(items)) throw new Error('web_search_prime returned a malformed result payload')
        const sources: ZhipuSearchSource[] = []
        for (const item of items) {
          const source = toSearchSource(item)
          if (source !== undefined) sources.push(source)
        }
        // Pre-truncate so the seam's own cap never drops anything: every kept
        // source reaches the model, hence truncated stays false.
        const cap = request.maxResults ?? SEARCH_MAX_RESULTS
        const results = cap > 0 && sources.length > cap ? sources.slice(0, cap) : sources
        return { results, truncated: false }
      } catch (error: unknown) {
        throw providerError(SEARCH_MCP_TOOL, error, zhPrompt)
      }
    },
  }
}

/**
 * Reject a malformed `queries` argument and return the deduplicated queries in
 * first-seen order.
 * @param value - the raw `queries` argument.
 * @returns 1–4 trimmed, unique queries.
 */
function parseQueries(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('queries must contain at least one query')
  }
  if (value.length > SEARCH_MAX_QUERIES) {
    throw new Error(`queries must contain at most ${SEARCH_MAX_QUERIES} queries`)
  }
  if (value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error('each query must be a non-empty string')
  }
  return [...new Set(value.map((item) => (item as string).trim()))]
}

/**
 * Round-robin merge of per-query outcomes: interleave by rank, dedupe links
 * case-insensitively, and cap the total source count.
 * @param outcomes - the settled outcomes, in query order.
 * @returns the merged sources and whether anything was dropped.
 */
function mergeOutcomes(outcomes: readonly ZhipuSearchOutcome[]): SearchToolValue {
  const seen = new Set<string>()
  const sources: ZhipuSearchSource[] = []
  const ranks = Math.max(0, ...outcomes.map((outcome) => outcome.results.length))
  let dropped = false

  merge: for (let rank = 0; rank < ranks; rank++) {
    for (const outcome of outcomes) {
      const source = outcome.results[rank]
      if (source === undefined) continue
      const key = source.url.trim().toLowerCase()
      if (key.length === 0 || seen.has(key)) continue
      seen.add(key)
      if (sources.length === SEARCH_MAX_RESULTS) {
        dropped = true
        break merge
      }
      sources.push(source)
    }
  }

  return {
    sources,
    truncated: dropped || outcomes.some((outcome) => outcome.truncated),
  }
}

/**
 * Run one or more queries concurrently. Any failure aborts the sibling calls;
 * after every call settles, the first failure (in completion order) is thrown.
 * @param deps - the tool's search backend.
 * @param queries - the deduplicated queries.
 * @param signal - the caller's cancellation signal.
 * @returns the merged search value.
 */
async function runQueries(
  deps: ZhipuWebSearchToolDeps,
  queries: readonly string[],
  signal?: AbortSignal,
): Promise<SearchToolValue> {
  if (queries.length === 1) {
    const outcome = await deps.search({ query: queries[0] as string, maxResults: SEARCH_MAX_RESULTS }, signal)
    return mergeOutcomes([outcome])
  }

  const controller = new AbortController()
  const batchSignal = signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal])
  const outcomes: Array<ZhipuSearchOutcome | undefined> = new Array(queries.length).fill(undefined)
  const failures: unknown[] = []
  const searches = queries.map(async (query, index) => {
    try {
      outcomes[index] = await deps.search({ query, maxResults: SEARCH_MAX_RESULTS }, batchSignal)
    } catch (error: unknown) {
      failures.push(error)
      controller.abort()
      throw error
    }
  })
  await Promise.allSettled(searches)
  if (failures.length > 0) throw failures[0]
  return mergeOutcomes(outcomes as ZhipuSearchOutcome[])
}

/** Narrow a value to one search source stored in a tool result. */
function isSearchSource(value: unknown): value is ZhipuSearchSource {
  if (!isRecord(value)) return false
  return typeof value.url === 'string'
    && (value.title === undefined || typeof value.title === 'string')
    && (value.snippet === undefined || typeof value.snippet === 'string')
    && (value.publishedAt === undefined || typeof value.publishedAt === 'string')
}

/**
 * Render one source as a markdown list item. The link is emitted only for a
 * safe http(s) URL; otherwise the label degrades to plain text. Snippets and
 * dates are folded so external text cannot forge list or section structure.
 * @param source - one merged source.
 * @returns the markdown line.
 */
function formatSourceLine(source: ZhipuSearchSource): string {
  const title = typeof source.title === 'string' && source.title.length > 0 ? source.title : source.url
  const safeTitle = escapeMarkdownLinkText(title)
  const safeUrl = sanitizeExternalUrl(source.url)
  const meta = [source.snippet, source.publishedAt === undefined ? undefined : `(${source.publishedAt})`]
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .map((item) => foldExternalInlineText(item))
  const link = safeUrl === null ? safeTitle : `[${safeTitle}](${safeUrl})`
  return `- ${link}${meta.length > 0 ? ` — ${meta.join(' ')}` : ''}`
}

/**
 * Render a shadow tool result as model-facing markdown: sources, truncation
 * note, and the citation hint.
 * @param value - the tool's output value.
 * @returns the rendered text.
 */
function formatSearchOutput(value: unknown): string {
  const record = isRecord(value) ? value : {}
  const content = typeof record.content === 'string' ? record.content : ''
  const rawSources = Array.isArray(record.sources) ? record.sources : []
  const sources = rawSources.filter(isSearchSource)
  const truncated = record.truncated === true
  const parts: string[] = []
  if (content.length > 0) parts.push(content)
  if (sources.length > 0) {
    parts.push(`Sources:\n${sources.map(formatSourceLine).join('\n')}`)
  } else if (content.length === 0) {
    parts.push('No results found.')
  }
  if (truncated) {
    parts.push(`(Showing the first ${sources.length} sources. Refine the query for more.)`)
  }
  parts.push('Cite the relevant URLs above as markdown links in your answer.')
  return parts.join('\n\n')
}

/**
 * Project one tool result into the compact metadata stored with it.
 * @param value - the tool's output value.
 * @returns the presentation metadata.
 */
function projectMeta(value: unknown): SearchPresentationMeta {
  const record = isRecord(value) ? value : {}
  const rawSources = Array.isArray(record.sources) ? record.sources : []
  const sources = rawSources.filter(isSearchSource)
  const content = typeof record.content === 'string' && record.content.length > 0 ? record.content : undefined
  return {
    sources,
    truncated: record.truncated === true,
    ...(content === undefined ? {} : { answer: content }),
  }
}

/**
 * Parse the stored presentation metadata back, rejecting a foreign shape.
 * @param value - the stored metadata.
 * @returns the parsed metadata, or undefined when the shape does not match.
 */
function parseMeta(value: unknown): SearchPresentationMeta | undefined {
  if (!isRecord(value)) return undefined
  const { sources, truncated, answer } = value
  if (!Array.isArray(sources) || !sources.every(isSearchSource)) return undefined
  if (typeof truncated !== 'boolean') return undefined
  if (answer !== undefined && typeof answer !== 'string') return undefined
  return {
    sources: sources as readonly ZhipuSearchSource[],
    truncated,
    ...(answer === undefined ? {} : { answer }),
  }
}

/** Read the queries a display callback was given, ignoring malformed entries. */
function displayQueries(args: unknown): string[] {
  const value = isRecord(args) ? args.queries : undefined
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

/**
 * Create the additional `zhipu_web_search` global tool definition.
 * Registration is the service's job; this factory only builds the definition,
 * localized from the current settings snapshot.
 * @param deps - the plugin settings and the merged search backend.
 * @returns the tool definition the host tools service accepts.
 */
export function createZhipuWebSearchTool(deps: ZhipuWebSearchToolDeps): ToolDefinitionShape {
  const settings = deps.settings()
  return {
    name: ZHIPU_WEB_SEARCH_TOOL_NAME,
    description: pick(WEB_SEARCH_TOOL_DESC, settings.zhPrompt),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['queries'],
      properties: {
        queries: {
          type: 'array',
          minItems: 1,
          maxItems: SEARCH_MAX_QUERIES,
          items: { type: 'string' },
          description: pick(QUERIES_PARAM_DESC, settings.zhPrompt),
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['sources', 'truncated'],
        properties: {
          content: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['url'],
              properties: {
                url: { type: 'string' },
                title: { type: 'string' },
                snippet: { type: 'string' },
                publishedAt: { type: 'string' },
              },
            },
          },
          truncated: { type: 'boolean' },
        },
      },
      render: (_args: unknown, value: unknown): readonly ToolRenderBlock[] => [
        { type: 'text', text: formatSearchOutput(value) },
      ],
      presentationMeta: (_args: unknown, value: unknown) => projectMeta(value),
    },
    timeoutMs: SEARCH_TIMEOUT_MS,
    isConcurrencySafe: () => true,
    presentCall: (args: unknown) => {
      const queries = displayQueries(args)
      if (queries.length === 0) return undefined
      const title = queries.join(', ')
      return { card: 'generic', title, kind: 'search', rawInput: title }
    },
    presentResult: (args: unknown, result: unknown) => {
      if (isRecord(result) && result.isError === true) return undefined
      const meta = parseMeta(isRecord(result) ? result.meta : undefined)
      if (meta === undefined) return undefined
      const title = displayQueries(args).join(', ') || 'Web search'
      return {
        card: 'web',
        kind: 'search',
        title,
        sources: meta.sources,
        truncated: meta.truncated,
        ...(meta.answer === undefined ? {} : { answer: meta.answer }),
      }
    },
    async execute(args: unknown, context: { readonly signal?: AbortSignal }): Promise<unknown> {
      const queries = parseQueries(isRecord(args) ? args.queries : undefined)
      return runQueries(deps, queries, context.signal)
    },
  }
}

/** Order of the `tool:zhipu_web_search` prompt section, matching the zread sections. */
const WEB_SEARCH_SECTION_ORDER = 110

/**
 * The `tool:zhipu_web_search` system-prompt section for one prompt language.
 * @param zhPrompt - whether the plugin's prompt language is Chinese.
 * @returns the section, in registration order.
 */
export function webSearchPromptSections(zhPrompt: boolean): SystemPromptSectionShape[] {
  return [{
    name: `tool:${ZHIPU_WEB_SEARCH_TOOL_NAME}`,
    order: WEB_SEARCH_SECTION_ORDER,
    text: zhPrompt
      ? '附加工具 zhipu_web_search 由智谱提供。内置 web_search 仍然可用；当其结果不够、需要补充检索（尤其中文或国内来源）时调用 zhipu_web_search。queries 数组接受 1–4 条查询并合并去重，每条保持精确。回答中引用的来源要以 markdown 链接给出。'
      : 'The additional tool zhipu_web_search is Zhipu-powered. The built-in web_search stays available; call zhipu_web_search when its results are not enough or you want supplementary retrieval, especially for Chinese-language sources. The queries array accepts 1–4 focused queries and merges their results. Cite the sources you used as markdown links.',
  }]
}
