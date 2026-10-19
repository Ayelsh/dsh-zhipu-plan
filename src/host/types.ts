/**
 * Wire contracts of the `zhipuPlan` Remote namespace: what the browser sees of
 * a signed-in Zhipu coding-plan account. Tokens never appear here — the
 * account view is redacted by construction, so no read path can return one.
 *
 * @module dsh-zhipu-plan/host/types
 */

/** Zhipu deployment an account belongs to. */
export type ZhipuPlanDeployment = 'bigmodel' | 'zai'

/** Which entitlement the signed-in account holds. */
export type ZhipuPlanKind = 'individual-coding-plan' | 'team-coding-plan' | 'start-plan'

/** Redacted account facts a configuration surface renders. */
export interface ZhipuPlanAccountView {
  /** Deployment the account was authorized against. */
  readonly deployment: ZhipuPlanDeployment
  /** Entitlement resolved for this account. */
  readonly planKind: ZhipuPlanKind
  /** Account identifier as the deployment reports it. */
  readonly accountId: string
  /** Human-readable account label, already masked by the host. */
  readonly accountLabel: string
  /** Account access token expiry as epoch milliseconds; absent when the deployment reports none. */
  readonly accessTokenExpiresAt?: number
  /** ZCode JWT expiry as epoch milliseconds; absent when the token carries none. */
  readonly jwtExpiresAt?: number
  /** Whether the stored ZCode JWT is already expired at read time. */
  readonly jwtExpired: boolean
}

/** What the browser sees of a sign-in attempt while it runs. */
export type ZhipuPlanLoginState =
  | { readonly state: 'idle' }
  | { readonly state: 'waiting'; readonly authorizeUrl?: string }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'signed-in' }

/** Current sign-in state of the single Zhipu account this plugin serves. */
export type ZhipuPlanStatus =
  | { readonly state: 'signed-out' }
  | { readonly state: 'signed-in'; readonly account: ZhipuPlanAccountView }

/** One limit bucket the monitor reports (prompt, time, credits, …). */
export interface PlanQuotaLimit {
  readonly type: string
  /** Raw monitor numbers, in the bucket's own unit. */
  readonly unit?: number
  readonly number?: number
  readonly usage?: number
  readonly currentValue?: number
  readonly remaining?: number
  readonly percentage?: number
  /** Epoch milliseconds the bucket resets at, when the deployment reports one. */
  readonly nextResetTime?: number
  readonly usageDetails?: readonly { readonly modelCode?: string; readonly displayName?: string; readonly usage?: number }[]
}

/** One quota snapshot as the Remote returns it. */
export interface PlanQuotaSnapshot {
  readonly deployment: ZhipuPlanDeployment
  /** Epoch milliseconds this snapshot was fetched; a stale snapshot's value is older. */
  readonly fetchedAt: number
  readonly stale: boolean
  /** Server-reported plan level, when the monitor carries one. */
  readonly level?: string
  readonly limits: readonly PlanQuotaLimit[]
  /** The limit the surface leads with: the time limit, else the first with a remaining figure. */
  readonly primary?: PlanQuotaLimit
}

/** Window one plan usage read covers. */
export type PlanUsageRange = '7d' | '30d' | 'all'

/** Every range a surface may ask for, in the order it offers them. */
export const PLAN_USAGE_RANGES: readonly PlanUsageRange[] = ['7d', '30d', 'all']

/** Tokens one model consumed over the window. */
export interface PlanModelShare {
  readonly model: string
  readonly tokens: number
}

/** Per-model usage over one window. */
export interface PlanModelUsage {
  /** Day keys the series spans, oldest first. */
  readonly days: readonly string[]
  /** Model calls the window totals. */
  readonly calls: number
  /** Tokens the window totals. */
  readonly tokens: number
  readonly models: readonly PlanModelShare[]
}

/** Calls one tool served over the window. */
export interface PlanToolShare {
  readonly tool: string
  readonly calls: number
}

/** Tool (MCP) usage over one window. */
export interface PlanToolUsage {
  readonly searches: number
  readonly webReads: number
  readonly zreads: number
  readonly tools: readonly PlanToolShare[]
}

/** Tokens one active day consumed. */
export interface PlanActivityDay {
  readonly date: string
  readonly tokens: number
  readonly mcpCalls: number
}

/** Activity totals and streaks over one window. */
export interface PlanActivitySummary {
  readonly days: readonly PlanActivityDay[]
  readonly totalTokens: number
  readonly peakDayTokens: number
  readonly peakDay?: string
  readonly totalUsageMs: number
  readonly currentStreakDays: number
  readonly longestStreakDays: number
}

/** Credit and cache facts over one window; unreadable figures are absent, never zero. */
export interface PlanCreditSummary {
  readonly cacheHitRate?: number
  readonly offPeakRate?: number
  readonly totalCredits?: number
}

/** Decode-speed series over one window, in tokens per second. */
export interface PlanDecodeSpeed {
  readonly days: readonly string[]
  readonly proMax: readonly number[]
  readonly lite: readonly number[]
}

/** One subscription the account holds. */
export interface PlanSubscription {
  readonly productName: string
  /** Server-reported state, e.g. `VALID`. */
  readonly status: string
  readonly inCurrentPeriod: boolean
  readonly autoRenew: boolean
  /** Next renewal day, when the service reports one. */
  readonly renewTime?: string
  /** Billing cycle, e.g. `monthly`. */
  readonly billingCycle?: string
  /** Validity range text the service reports verbatim. */
  readonly validRange?: string
  /** Ordinal of the period the account is in. */
  readonly period?: number
}

/** Which reset window a reset spends. */
export type PlanResetKind = 'five_hour' | 'week'

/** One reset the account may spend. */
export interface PlanResetOpportunity {
  /** Epoch milliseconds this reset expires at. */
  readonly expireAt: number
}

/** The resets an account holds and the last one it spent. */
export interface PlanResetStatus {
  /** Five-hour resets available now. */
  readonly fiveHour: readonly PlanResetOpportunity[]
  /** Weekly resets available now. */
  readonly week: readonly PlanResetOpportunity[]
  /** Epoch milliseconds the latest five-hour reset was spent, when one was. */
  readonly fiveHourUsedAt?: number
  /** Epoch milliseconds the latest weekly reset was spent, when one was. */
  readonly weekUsedAt?: number
  /** Whether the service reports reset history the surface has not shown. */
  readonly hasUnreadHistory: boolean
}

/** Everything the plan tab's usage section renders for one window. */
export interface PlanUsageReport {
  readonly deployment: ZhipuPlanDeployment
  readonly range: PlanUsageRange
  /** Epoch milliseconds this report was read. */
  readonly fetchedAt: number
  readonly models: PlanModelUsage
  readonly tools: PlanToolUsage
  readonly activity: PlanActivitySummary
  readonly credits: PlanCreditSummary
  readonly decodeSpeed: PlanDecodeSpeed
  readonly subscriptions: readonly PlanSubscription[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /**
     * A Zhipu-plan operation was refused before it reached the deployment:
     * the request was malformed, no credential provider is mounted, or the
     * stored account record is unreadable.
     */
    'zhipu-plan/rejected': { readonly reason: string }
    /** The operation needs a signed-in account and none is stored. */
    'zhipu-plan/not-signed-in': { readonly reason: string }
    /** The account holds no coding-plan entitlement the server recognizes. */
    'zhipu-plan/no-plan': { readonly reason: string }
    /** The account's organization or project could not be resolved for a plan key. */
    'zhipu-plan/missing-org-project': { readonly reason: string }
    /** The stored token has passed its reported expiry. */
    'zhipu-plan/token-expired': { readonly reason: string }
    /** The deployment or relay could not be reached. */
    'zhipu-plan/network': { readonly reason: string }
  }
}

/** Volatile switches the MCP-backed surfaces read at call time. */
export interface ZhipuBackendSettings {
  /** Built-in web search is routed to the Zhipu search provider. */
  readonly search: boolean
  /** Built-in web fetch is routed to the Zhipu reader provider. */
  readonly reader: boolean
  /** The three github_* zread tools are mounted. */
  readonly zread: boolean
  /** Model-facing hint language: Chinese when true, English otherwise. */
  readonly zhPrompt: boolean
}

/** One externally sourced search result. */
export interface ZhipuSearchSource {
  /** The result link, always a safe http(s) URL by the time it leaves the surface. */
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  readonly publishedAt?: string
}

/** The search outcome the built-in web service consumes. */
export interface ZhipuSearchOutcome {
  readonly results: readonly ZhipuSearchSource[]
  /** Always false: an over-long result set is pre-truncated, not reported as truncation. */
  readonly truncated: boolean
}

/** The web-fetch outcome the built-in web service consumes. */
export interface ZhipuReadOutcome {
  readonly url: string
  readonly statusCode: 200
  readonly body: { readonly kind: 'text'; readonly content: string }
  readonly truncated: boolean
  readonly title?: string
}

/* The host packages are externalized at build time, so the tool and provider
 * contracts they accept are declared structurally here rather than imported. */

/** One rendered block of a tool result. */
export interface ToolRenderBlock {
  readonly type: 'text'
  readonly text: string
}

/** Structural contract of one tool the host's tools service accepts. */
export interface ToolDefinitionShape {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    readonly render: (args: unknown, result: unknown) => readonly ToolRenderBlock[]
    readonly presentationMeta?: (args: unknown, value: unknown) => unknown
  }
  readonly timeoutMs?: number
  readonly isConcurrencySafe?: boolean | (() => boolean)
  readonly presentCall?: (args: unknown) => unknown
  readonly presentResult?: (args: unknown, result: unknown) => unknown
  readonly execute: (args: unknown, context: { readonly signal?: AbortSignal }) => Promise<unknown>
}

/** Structural contract of one search provider the host's web service accepts. */
export interface WebSearchProviderShape {
  readonly id: string
  readonly label?: string
  available(): boolean
  search(request: { readonly query: string; readonly maxResults?: number }, signal?: AbortSignal): Promise<ZhipuSearchOutcome>
}

/** Structural contract of one fetch provider the host's web service accepts. */
export interface WebFetchProviderShape {
  readonly id: string
  readonly label?: string
  available(): boolean
  fetch(request: { readonly url: string }, signal?: AbortSignal): Promise<ZhipuReadOutcome>
}

/** Structural contract of one system-prompt section the host accepts. */
export interface SystemPromptSectionShape {
  readonly name: string
  readonly order?: number
  readonly text: string | (() => string)
}

/** The session identity an agent exposes for preset-scoped re-evaluation. */
export interface AgentSessionShape {
  readonly id?: unknown
  readonly header?: { readonly id?: unknown }
}

/** Structural contract of one live agent the host registry exposes. */
export interface AgentShape {
  readonly id?: unknown
  readonly session?: AgentSessionShape
  readonly ctx: AgentContextShape
}

/** Structural contract of the agent-scoped context services resolve through. */
export interface AgentContextShape {
  get(name: string): unknown
}

/** Structural contract of the host agent registry seam. */
export interface AgentsServiceShape {
  list(): readonly AgentShape[]
}

/** Structural contract of the host agent-preset registry probe. */
export interface AgentPresetsShape {
  composedPreset(ctx: AgentContextShape): string | undefined
}

/** Structural contract of one agent-scoped tool restriction. */
export interface ToolRestrictionShape {
  readonly allow?: readonly string[]
  readonly deny?: readonly string[]
}

/** Structural contract of the host tools service seams this plugin uses. */
export interface ToolsServiceShape {
  register(definition: ToolDefinitionShape): () => void
  get(name: string, scope?: object): ToolDefinitionShape | undefined
  restrict(filter: ToolRestrictionShape): () => void
}

/** Structural contract of the host system-prompt service seams this plugin uses. */
export interface SystemPromptServiceShape {
  section(section: SystemPromptSectionShape): () => void
}

/** Structural contract of the host web service seams this plugin uses. */
export interface WebServiceShape {
  registerSearchProvider(provider: WebSearchProviderShape): () => void
  registerFetchProvider(provider: WebFetchProviderShape): () => void
}

/** One active profile row the host config editor can address. */
export interface ConfigEditorEntryShape {
  readonly options: {
    readonly id: string
    readonly name?: string
    readonly config?: unknown
  }
}

/** Structural contract of the host config editor that persists profile rows. */
export interface ConfigEditorShape {
  entries(): readonly ConfigEditorEntryShape[]
  edit(
    entry: ConfigEditorEntryShape,
    change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void>
}
