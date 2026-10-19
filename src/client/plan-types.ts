/**
 * The plan page's view types: the redacted account the host reports, the quota
 * snapshot the cards read, the resets it holds, and the server-side usage
 * report. Every field mirrors the Remote namespace's wire fields; nothing here
 * is derived.
 *
 * @module dsh-zhipu-plan/client/plan-types
 */

/** Redacted account facts, as the host's status view carries them. */
export interface PlanAccount {
  readonly deployment: 'bigmodel' | 'zai'
  readonly planKind: 'individual-coding-plan' | 'team-coding-plan' | 'start-plan'
  readonly accountId: string
  readonly accountLabel: string
  readonly accessTokenExpiresAt?: number
  readonly jwtExpiresAt?: number
  readonly jwtExpired: boolean
}

/** What the host reports about the sign-in attempt, refreshed by polling. */
export type PlanLoginState =
  | { readonly state: 'idle' }
  | { readonly state: 'waiting'; readonly authorizeUrl?: string }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'signed-in' }

/** One quota bucket the deployment reports for this account. */
export interface PlanQuotaLimit {
  readonly type: string
  readonly unit?: number
  readonly number?: number
  readonly usage?: number
  readonly currentValue?: number
  readonly remaining?: number
  /** Share of the bucket already spent, 0-100. */
  readonly percentage?: number
  readonly nextResetTime?: number
  readonly usageDetails?: readonly {
    readonly modelCode?: string
    readonly displayName?: string
    readonly usage?: number
  }[]
}

/** The quota snapshot the plan cards read. */
export interface PlanQuota {
  readonly fetchedAt: number
  readonly stale: boolean
  readonly level?: string
  readonly limits: readonly PlanQuotaLimit[]
  readonly primary?: PlanQuotaLimit
}

/** Window one usage read covers. */
export type PlanUsageRange = '7d' | '30d' | 'all'

/** Tokens one model consumed. */
export interface PlanModelShare {
  readonly model: string
  readonly tokens: number
}

/** Per-model usage over the window. */
export interface PlanModelUsage {
  readonly days: readonly string[]
  readonly calls: number
  readonly tokens: number
  readonly models: readonly PlanModelShare[]
}

/** Per-tool usage over the window. */
export interface PlanToolUsage {
  readonly searches: number
  readonly webReads: number
  readonly zreads: number
  readonly tools: readonly { readonly tool: string; readonly calls: number }[]
}

/** Tokens one active day consumed. */
export interface PlanActivityDay {
  readonly date: string
  readonly tokens: number
  readonly mcpCalls: number
}

/** Activity totals and streaks over the window. */
export interface PlanActivitySummary {
  readonly days: readonly PlanActivityDay[]
  readonly totalTokens: number
  readonly peakDayTokens: number
  readonly peakDay?: string
  readonly totalUsageMs: number
  readonly currentStreakDays: number
  readonly longestStreakDays: number
}

/** Credit and cache facts; an unreadable figure is absent, never zero. */
export interface PlanCreditSummary {
  readonly cacheHitRate?: number
  readonly offPeakRate?: number
  readonly totalCredits?: number
}

/** Decode-speed series, in tokens per second. */
export interface PlanDecodeSpeed {
  readonly days: readonly string[]
  readonly proMax: readonly number[]
  readonly lite: readonly number[]
}

/** One subscription the account holds. */
export interface PlanSubscription {
  readonly productName: string
  readonly status: string
  readonly inCurrentPeriod: boolean
  readonly autoRenew: boolean
  readonly renewTime?: string
  readonly billingCycle?: string
  readonly validRange?: string
  readonly period?: number
}

/** Everything the usage section renders for one window. */
export interface PlanUsageReport {
  readonly range: PlanUsageRange
  readonly fetchedAt: number
  readonly models: PlanModelUsage
  readonly tools: PlanToolUsage
  readonly activity: PlanActivitySummary
  readonly credits: PlanCreditSummary
  readonly decodeSpeed: PlanDecodeSpeed
  readonly subscriptions: readonly PlanSubscription[]
}

/** Which reset window a reset spends. */
export type PlanResetKind = 'five_hour' | 'week'

/** One unspent reset the server has granted. */
export interface PlanResetOpportunity {
  readonly expireAt: number
}

/** The resets an account holds and the last one it spent. */
export interface PlanResetStatus {
  readonly fiveHour: readonly PlanResetOpportunity[]
  readonly week: readonly PlanResetOpportunity[]
  readonly fiveHourUsedAt?: number
  readonly weekUsedAt?: number
  readonly hasUnreadHistory: boolean
}

/** One claim's outcome: the grant, or the moment worth asking again. */
export type PlanResetClaim =
  | { readonly granted: true }
  | { readonly granted: false; readonly nextTryAt: number }

/** The host's four runtime capability switches, as the settings namespace resolves them. */
export interface PlanBackendSettings {
  readonly search: boolean
  readonly reader: boolean
  readonly zread: boolean
  readonly zhPrompt: boolean
}

/** One switch the card can write. */
export type PlanBackendSettingKey = keyof PlanBackendSettings

/** One resolved snapshot: the switches plus whether the profile accepts writes. */
export interface PlanBackendSettingsSnapshot {
  readonly settings: PlanBackendSettings
  readonly writable: boolean
}
