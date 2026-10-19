/**
 * Zhipu coding-plan account service, exposed to the browser as the `zhipuPlan`
 * Remote namespace. It owns the account record's lifecycle (read here, written
 * by the login flow) and reports the redacted sign-in state a configuration
 * surface renders; the plan credential resolution and plan quota land on the
 * same service as their call sites appear.
 *
 * This package is a local-build integration: it signs in through the ZCode
 * authorization relay using that product's client identity, so a deployment
 * change on the relay's side needs only configuration, never a code change.
 *
 * @module dsh-zhipu-plan/host
 */

import { Context, Service, type Volatile } from '@deepseek-ai/cordis'
import type { AuthorizationFlow, AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import {
  credentialMissingError,
  disabledError,
  isAbortError,
  isZhipuBackendError,
  zhipuPlanError,
} from './errors.ts'
import { LoginError, runLoginAttempt } from './login.ts'
import {
  ACTIVITY_CHUNK_DAYS,
  CREDIT_CHUNK_DAYS,
  USAGE_CHUNK_DAYS,
  fetchActivity,
  fetchCreditSummary,
  fetchDecodeSpeed,
  fetchModelUsage,
  fetchSubscriptionList,
  fetchToolUsage,
  mergeDecodeSpeed,
  mergeModelUsage,
  mergeToolUsage,
  usageWindow,
  usageWindows,
} from './monitor.ts'
import { PlanKeyError, resolvePlanKey } from './plan-key.ts'
import { fetchQuota, pickPrimaryLimit } from './quota.ts'
import {
  fetchResetStatus,
  markResetHistoryRead,
  requestResetOpportunity,
  useReset,
  type ResetReadInput,
} from './reset.ts'
import {
  accountRecordKey,
  readAccountPayload,
  type ZhipuPlanAccountPayload,
} from './record.ts'
import { ZhipuAuthRelay, createPollToken, type RelayPollReady } from './relay.ts'
import { abortable } from './util.ts'
import {
  createZhipuReaderProvider,
  createZhipuWebFetchTool,
  readerPromptSections,
  ZHIPU_READER_PROVIDER_ID,
  ZHIPU_WEB_FETCH_TOOL_NAME,
} from './web-reader.ts'
import {
  createZhipuSearchProvider,
  createZhipuWebSearchTool,
  webSearchPromptSections,
  ZHIPU_SEARCH_PROVIDER_ID,
  ZHIPU_WEB_SEARCH_TOOL_NAME,
} from './web-search.ts'
import type { WebSearchDeps, ZhipuWebSearchToolDeps } from './web-search.ts'
import { ZREAD_TOOL_NAMES, createZreadToolDefinitions, zreadPromptSections } from './zread.ts'
import type { ZreadDeps } from './zread.ts'
import type {
  PlanActivitySummary, PlanCreditSummary, PlanQuotaSnapshot, PlanResetKind, PlanResetStatus,
  PlanSubscription, PlanUsageRange, PlanUsageReport,
  ZhipuPlanAccountView, ZhipuPlanDeployment, ZhipuPlanKind, ZhipuPlanLoginState, ZhipuPlanStatus,
  AgentPresetsShape, AgentShape, AgentsServiceShape, ConfigEditorShape, SystemPromptServiceShape,
  ToolDefinitionShape, ToolsServiceShape, WebFetchProviderShape, WebSearchProviderShape, WebServiceShape,
  ZhipuBackendSettings, ZhipuReadOutcome, ZhipuSearchOutcome,
} from './types.ts'

export {
  ACCOUNT_RECORD_ID,
  RECORD_SCOPE,
  accountRecordKey,
  readAccountPayload,
  type ZhipuPlanAccountPayload,
} from './record.ts'
export { zhipuPlanError, type ZhipuPlanErrorCode } from './errors.ts'
export { PlanKeyError, resolvePlanKey, type ResolvePlanKeyInput } from './plan-key.ts'
export { fetchQuota, pickPrimaryLimit, parseQuotaPayload } from './quota.ts'
export { LoginError, runLoginAttempt, type LoginFailureKind } from './login.ts'
export { createPollToken, RelayError, ZhipuAuthRelay, type RelayFlow, type RelayPoll } from './relay.ts'
export {
  fetchResetStatus, markResetHistoryRead, requestResetOpportunity, useReset, type ResetReadInput,
} from './reset.ts'

/**
 * Read every item through one operation, a few at a time.
 *
 * A year-long usage range is a dozen windows per family; firing them all at once
 * would leave the last ones waiting past the deadline a single request is given,
 * and reading them one by one would spend seconds on round trips. Small batches
 * keep each wave inside the deadline without serialising them.
 *
 * @param items - the items to read.
 * @param size - how many may be in flight at once.
 * @param read - the operation to run for one item.
 * @returns the readings, in the items' order.
 */
async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  read: (item: T) => Promise<R>,
): Promise<R[]> {
  const readings: R[] = []
  for (let index = 0; index < items.length; index += size) {
    readings.push(...await Promise.all(items.slice(index, index + size).map(item => read(item))))
  }
  return readings
}

/**
 * Read one family over its windows, keeping the windows that answered.
 *
 * A family that spans several monitor windows is a sequence of independent
 * reads; one refused window would otherwise blank a breakdown whose other
 * windows arrived fine. The chunks that answered are returned for merging, and
 * every refusal is reported to the caller's logger so a silently short total
 * still leaves a trace. Cancellation is not a partial answer: it is rethrown.
 *
 * @param windows - the range's windows for this family, newest first.
 * @param read - the operation to run for one window.
 * @param signal - the caller's cancellation.
 * @param onFailure - receives each window that could not be read.
 * @returns the readings that arrived, in window order.
 */
async function readBestEffort<T>(
  windows: readonly string[],
  read: (window: string) => Promise<T>,
  signal: AbortSignal | undefined,
  onFailure: (error: unknown) => void,
): Promise<T[]> {
  const readings = await inBatches(windows, 4, async (window): Promise<T | undefined> => {
    try {
      return await read(window)
    } catch (error) {
      if (signal?.aborted === true) throw error
      onFailure(error)
      return undefined
    }
  })
  return readings.filter((reading): reading is T => reading !== undefined)
}

/** Service configuration; every field names a third-party address or a deadline. */
export interface Config {
  /** Authorization relay origin including its path prefix, without a trailing slash. */
  relayBaseUrl: string
  /** Per-call deadline for one relay request, milliseconds. */
  requestTimeoutMs: number
  /** Overall sign-in deadline, milliseconds. */
  loginTimeoutMs: number
  /** Mainland deployment business origin the plan key is resolved against. */
  bigmodelApiOrigin: string
  /** International deployment business origin the plan key is resolved against. */
  zaiApiOrigin: string
  /**
   * ZCode API origin the coding-plan reset service lives on. Reset calls
   * authenticate with the account's ZCode JWT and deployment access token
   * rather than the plan key, so they do not travel to the monitor.
   */
  zcodeApiOrigin: string
  /**
   * Environment-variable names of the credential references the resolved plan
   * keys are written to, one per deployment. The pi-ai provider profile for
   * that deployment's coding endpoint reads the same name through `apiKeyEnv`
   * (the mainland profile reads `bigmodel`, the international one reads
   * `zai`), so a stored key lights up exactly its own deployment's GLM
   * models and leaves the other deployment's provider dormant.
   */
  planKeyEnvs: { bigmodel: string; zai: string }
  /**
   * Runtime switch: route the built-in `web_search` backend through Zhipu.
   * Volatile: the loader hands back a live reference and announces
   * `loader/volatile-update`, so a toggle applies without restart.
   */
  readonly search: Volatile<boolean>
  /** Runtime switch: route the built-in `web_fetch` backend through Zhipu. */
  readonly reader: Volatile<boolean>
  /** Runtime switch: mount the three global `github_*` zread tools. */
  readonly zread: Volatile<boolean>
  /** Language of the model-facing prompt sections: Chinese when true. */
  readonly zhPrompt: Volatile<boolean>
}

/** Validated configuration schema; the defaults name the production relay. */
export const Config: z<Config> = z.object({
  relayBaseUrl: z.string().default('https://zcode.z.ai/api/v1'),
  requestTimeoutMs: z.natural().min(1_000).default(15_000),
  loginTimeoutMs: z.natural().min(1_000).default(300_000),
  bigmodelApiOrigin: z.string().default('https://open.bigmodel.cn'),
  zaiApiOrigin: z.string().default('https://api.z.ai'),
  zcodeApiOrigin: z.string().default('https://zcode.z.ai'),
  planKeyEnvs: z.object({
    bigmodel: z.string().default('DSH_ZHIPU_PLAN_KEY'),
    zai: z.string().default('DSH_ZHIPU_PLAN_KEY_ZAI'),
  }),
  search: z.boolean().default(true).volatile(),
  reader: z.boolean().default(true).volatile(),
  zread: z.boolean().default(false).volatile(),
  zhPrompt: z.boolean().default(false).volatile(),
})
/** Registration retry window for a web provider conflict during a hot re-mount, milliseconds. */
const WEB_PROVIDER_RETRY_MS = 25
/** Backend reconciles are drained on this cadence, outside HMR transactions. */
const BOOTSTRAP_POLL_MS = 100

/** Attempts before a conflicting web provider registration is reported and dropped. */
const WEB_PROVIDER_RETRIES = 8

/**
 * Read one volatile config flag. The loader hands back a live reference, but a
 * caller constructing the service outside the loader may pass a plain boolean.
 * @param value - the config field value.
 * @returns the current flag.
 */
function readConfigFlag(value: Volatile<boolean> | boolean): boolean {
  if (typeof value === 'boolean') return value
  const live = value as { get?: unknown }
  if (typeof live.get === 'function') return Boolean((value as Volatile<boolean>).get())
  return Boolean(value)
}

/** The agent a host agent-event payload carries, when it carries one. */
function agentOf(payload: unknown): AgentShape | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const agent = (payload as { agent?: unknown }).agent
  if (agent === undefined || agent === null || typeof agent !== 'object') return undefined
  return agent as AgentShape
}

/** One-line description of a thrown value for a log message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The plugin entry id whose config points the built-in web tools at a backend. */
const WEB_ROW_ID = 'web'

/** The two `web` row config keys this plugin manages. */
const WEB_ROW_KEYS = ['searchProvider', 'fetchProvider'] as const

/** One managed `web` row config key. */
type WebRowKey = typeof WEB_ROW_KEYS[number]

/** The provider ids the row carries while the corresponding switch is on. */
const WEB_ROW_TARGETS: Record<WebRowKey, string> = {
  searchProvider: 'zhipu-web-search-prime',
  fetchProvider: 'zhipu-web-reader',
}

/** The pointers the built-in `web` row should carry right now. */
type WebRowTarget = Record<WebRowKey, string | undefined>

/** One row-key write: a provider id sets a pointer, `undefined` restores the inherited one. */
interface WebRowWrite {
  readonly value: string | undefined
}

/** Shallow structural equality for the row config and its inherited layer. */
function isRecordEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (left[key] !== right[key]) return false
  }
  return true
}


declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Zhipu coding-plan account service, owner of the `zhipuPlan` Remote namespace. */
    zhipuPlan: ZhipuPlanService
  }
}

/**
 * Project the stored account onto its browser view.
 * @param payload - the parsed account record.
 * @param now - current epoch milliseconds, injected so expiry is testable.
 * @returns the redacted account view; tokens stay behind.
 */
export function accountView(payload: ZhipuPlanAccountPayload, now: number): ZhipuPlanAccountView {
  return {
    deployment: payload.deployment,
    planKind: payload.planKind,
    accountId: payload.accountId,
    accountLabel: payload.accountLabel,
    // Absent rather than undefined: the Remote boundary carries JSON only, and
    // an unusable expiry is a fact the surface reads as "not reported".
    ...payload.accessTokenExpiresAt === undefined ? {} : { accessTokenExpiresAt: payload.accessTokenExpiresAt },
    ...payload.jwtExpiresAt === undefined ? {} : { jwtExpiresAt: payload.jwtExpiresAt },
    jwtExpired: payload.jwtExpiresAt === undefined ? false : payload.jwtExpiresAt <= now,
  }
}

/** Minimum interval between quota reads, milliseconds; the monitor is not a free API. */
const QUOTA_MIN_INTERVAL_MS = 30_000

/** The organization scope one stored account carries, when its plan is scoped to one. */
function accountScope(
  account: ZhipuPlanAccountPayload,
): { readonly organizationId: string; readonly projectId: string } | undefined {
  const { organizationId, projectId } = account
  return organizationId === undefined || projectId === undefined ? undefined : { organizationId, projectId }
}

/**
 * The grant record one account is stored as.
 *
 * Optional fields are dropped rather than written as `undefined`. The
 * credential store admits only JSON-representable payloads, and a property
 * whose value is `undefined` is not one: it refuses such a record with a type
 * error, which aborts the sign-in after the plan credential has already been
 * written and leaves the surface waiting forever. Dropping the key is also
 * what the read path expects, since it reconstructs every optional field from
 * the key's absence.
 *
 * @param payload - the account facts the attempt produced.
 * @returns the record the credential store accepts.
 */
export function accountGrant(payload: ZhipuPlanAccountPayload): CredentialRecord {
  const { accessTokenExpiresAt, jwtExpiresAt, organizationId, projectId, ...required } = payload
  return {
    kind: 'grant',
    payload: {
      ...required,
      ...accessTokenExpiresAt === undefined ? {} : { accessTokenExpiresAt },
      ...jwtExpiresAt === undefined ? {} : { jwtExpiresAt },
      ...organizationId === undefined ? {} : { organizationId },
      ...projectId === undefined ? {} : { projectId },
    },
  }
}

/** Assemble the account payload one finished sign-in stores. */
function accountPayloadFor(
  deployment: ZhipuPlanDeployment,
  planKind: ZhipuPlanKind,
  ready: RelayPollReady,
): ZhipuPlanAccountPayload {
  return {
    deployment,
    planKind,
    accountId: ready.accountId,
    accountLabel: ready.accountName ?? ready.accountEmail ?? ready.accountId,
    accessToken: ready.accessToken,
    zcodeJwt: ready.zcodeJwt,
    accessTokenExpiresAt: undefined,
    jwtExpiresAt: jwtExpiryMs(ready.zcodeJwt),
    signedInAt: Date.now(),
  }
}

/**
 * Decode one ZCode JWT's `exp` claim.
 * @param token - the compact JWT.
 * @returns its expiry as epoch milliseconds, or undefined when the token carries no usable claim.
 */
function jwtExpiryMs(token: string): number | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  try {
    const json = atob((parts[1] as string).replaceAll('-', '+').replaceAll('_', '/'))
    const payload: unknown = JSON.parse(json)
    if (typeof payload !== 'object' || payload === null) return undefined
    const exp = (payload as Record<string, unknown>)['exp']
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1_000 : undefined
  } catch {
    // A JWT whose payload does not decode reports no expiry; the surface
    // renders that as "not reported" instead of refusing the sign-in.
    return undefined
  }
}

/** Zhipu coding-plan account service. */
export class ZhipuPlanService extends TypertRemoteService {
  static inject = ['credentials', 'authorization', 'settings']

  static Config: z<Config> = Config

  private readonly relay: ZhipuAuthRelay
  private readonly config: Config

  private currentLoginState: ZhipuPlanLoginState = { state: 'idle' }

  /** Deployment the running or next attempt authorizes against, as the surface chose it. */
  private requestedDeployment: ZhipuPlanDeployment = 'zai'

  /** Entitlement the running or next attempt resolves credentials for, as the surface chose it. */
  private requestedPlanKind: ZhipuPlanKind = 'individual-coding-plan'

  private lastQuota: PlanQuotaSnapshot | undefined
  private quotaFetchStartedAt = 0

  /** Idempotent search provider registered on the host web service. */
  private readonly searchProvider: WebSearchProviderShape
  /** Idempotent fetch provider registered on the host web service. */
  private readonly readerProvider: WebFetchProviderShape
  /** Web service the providers were registered on; a row remount replaces it. */
  private webServiceSeen: WebServiceShape | undefined
  /** Disposers for the providers registered on the current web service. */
  private readonly webProviderDisposers: Array<() => void> = []
  /** A backend reconcile is due; the poller runs it outside every transaction. */
  private bootstrapPending = false
  /** True while the poller is executing a reconcile, so ticks never overlap. */
  private bootstrapDraining = false
  /** The poller interval; kept alive across unload until the teardown restore settles. */
  private bootstrapTimer: ReturnType<typeof setInterval> | undefined
  /** A teardown must restore the web row once the loader transaction settles. */
  private teardownRestorePending = false
  /** Serializes web-row edits: the loader rejects edits nested in its HMR run. */
  private webRowEditChain: Promise<void> = Promise.resolve()
  /** Whether a plan credential currently resolves; the synchronous backend gate. */
  private backendCredentialReady = false
  /** Root context: the only context whose service lookups survive this fiber's unload. */
  private readonly rootContext: Context
  /** Mounted zread tool/prompt disposers; empty while the zread switch is off. */
  private zreadDisposers: Array<() => void> = []
  /** Mounted additional `zhipu_web_search` disposers; empty while the search switch is off. */
  private webSearchDisposers: Array<() => void> = []
  /** Mounted additional `zhipu_web_fetch` disposers; empty while the reader switch is off. */
  private webReaderDisposers: Array<() => void> = []
  /** Prompt language the mounted tool surfaces were built for. */
  private surfaceZhPrompt: boolean | undefined
  /** Per-agent scoped registrations: a minimal-preset deny. */
  private readonly agentSurfaces = new Map<object, () => void>()
  /** One-shot warning latch for a missing `web` settings row. */
  private webSettingsWarned = false
  /** One-shot warning latch for missing zread host seams. */
  private zreadMountWarned = false
  /** One-shot warning latch for missing web-tool host seams. */
  private webToolsMountWarned = false

  /**
   * @param ctx - host context carrying the credential and authorization seams.
   * @param config - validated relay address and deadlines.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'zhipuPlan', { namespace: 'zhipuPlan' })
    this.config = config
    this.rootContext = ctx.root
    this.relay = new ZhipuAuthRelay(config.relayBaseUrl, config.requestTimeoutMs)
    // Both providers are built once and registered resident: their `available()`
    // gates read the live switches, so a settings flip never re-registers them.
    const settings = (): ZhipuBackendSettings => this.webBackendSettings()
    const searchDeps: WebSearchDeps = {
      settings,
      endpoint: () => `${this.config.bigmodelApiOrigin}/api/mcp/web_search_prime/mcp`,
      credentialAvailable: () => this.backendCredentialReady,
      resolveApiKey: signal => this.resolveBackendApiKey(signal),
    }
    this.searchProvider = createZhipuSearchProvider(searchDeps)
    this.readerProvider = createZhipuReaderProvider({
      ...searchDeps,
      endpoint: () => `${this.config.bigmodelApiOrigin}/api/mcp/web_reader/mcp`,
    })

  }

  /** Register the login flow, the resident web providers, and the agent surface. */
  protected [Service.init](): void {
    this.ctx.effect(() => this.ctx.authorization.registerFlow(this.loginFlow()), 'zhipu-plan.loginFlow')
    // Restore the coding routes a stored account signed in for; a restart
    // must not leave the picker dark until the next sign-in.
    void this.syncProviderRoutes().catch((error: unknown) => {
      this.ctx.logger.warn('zhipu-plan: provider route sync failed: %s', error)
    })
    // The host web service is reached through a scoped inject, never a static
    // dependency: editing the `web` row remounts that service, and a static
    // dependency would restart this service with it (a restart writes the row
    // again, so it would loop). A scoped inject reloads only this callback,
    // which re-registers the providers on the new web service.
    this.ctx.inject(['web'], (scope) => {
      scope.effect(() => () => this.disposeWebProviders())
      const web = scope.get('web') as WebServiceShape | undefined
      if (web !== undefined) this.installWebProvidersOn(web)
      this.scheduleBootstrap()
    })
    // The tools and prompt seams only need a reconcile once they appear; a
    // web-row edit does not replace them, so a scoped inject is enough.
    this.ctx.inject(['tools', 'systemPrompt'], () => {
      this.scheduleBootstrap()
    })
    // The poller's timer is created at init, outside every HMR transaction:
    // that is the only async context from which a later row edit can acquire
    // the loader's exclusive lane (a timer scheduled inside a transaction keeps
    // that transaction's token and is rejected as nested).
    //
    // The same effect owns the backend teardown. A bundle disable unloads this
    // fiber from inside the config transaction that applied it, so an edit made
    // from the disposer would be rejected as nested; the disposer only flags the
    // restore and leaves the poller alive. The poller performs the restore once
    // the transaction has settled, then stops itself.
    this.ctx.effect(() => {
      this.bootstrapTimer = setInterval(() => this.drainBootstrap(), BOOTSTRAP_POLL_MS)
      ;(this.bootstrapTimer as unknown as { unref?: () => void }).unref?.()
      return () => {
        this.disposeAgentSurfaces()
        this.unmountZread()
        this.unmountWebTools()
        this.teardownRestorePending = true
        this.bootstrapPending = true
      }
    }, 'zhipu-plan.backend-poller')
    // The loader re-reads volatile config itself, then announces the update
    // with no payload; the new values are read through the config references.
    this.ctx.on('loader/volatile-update', () => {
      void this.onBackendSettingsChanged()
    })
    // Agent events drive only scoped registrations, never a tools/change scan:
    // listening to tools/change would re-enter this registration and hang the
    // session-creation path. Every listener is exception-safe because a throw
    // inside Cordis dispatch breaks the host's session flow.
    this.ctx.on('agent/created', (payload: unknown) => {
      try {
        this.installAgentSurface(agentOf(payload))
      } catch (error) {
        this.ctx.logger.warn('zhipu-plan: agent/created listener failed: %s', error)
      }
    })
    this.ctx.on('agent/disposed', (payload: unknown) => {
      try {
        const agent = agentOf(payload)
        if (agent !== undefined) this.disposeAgentSurface(agent)
      } catch (error) {
        this.ctx.logger.warn('zhipu-plan: agent/disposed listener failed: %s', error)
      }
    })
    this.ctx.on('agent-preset/selected', (sessionId: unknown) => {
      try {
        this.onAgentPresetSelected(sessionId)
      } catch (error) {
        this.ctx.logger.warn('zhipu-plan: agent-preset/selected listener failed: %s', error)
      }
    })
    this.scheduleBootstrap()
  }

  /**
   * Report the current sign-in state for a configuration surface.
   * @returns `signed-out`, or the redacted account of the stored grant.
   * @throws RemoteError when no credential provider is mounted or the stored record is unreadable.
   */
  @Remote
  async status(): Promise<ZhipuPlanStatus> {
    const payload = await this.account()
    if (payload === undefined) return { state: 'signed-out' }
    return { state: 'signed-in', account: accountView(payload, Date.now()) }
  }

  /**
   * Read the plan quota: the server-side usage figure this plan tab leads
   * with. Reads at most once per minimum interval; a refused or failed read
   * answers with the last snapshot (flagged stale) so a deployment hiccup
   * renders as old data, never as "no plan".
   * @param signal - the caller's cancellation.
   * @returns the freshest snapshot this service holds.
   * @throws RemoteError `zhipu-plan/not-signed-in` when no account is stored.
   */
  @Remote
  async quota(signal: AbortSignal): Promise<PlanQuotaSnapshot> {
    const account = await this.account()
    if (account === undefined) {
      throw zhipuPlanError('zhipu-plan/not-signed-in', 'no Zhipu account is signed in', { reason: 'not-signed-in' })
    }
    const now = Date.now()
    const elapsed = now - this.quotaFetchStartedAt
    if (this.lastQuota !== undefined && elapsed < QUOTA_MIN_INTERVAL_MS) return this.lastQuota
    this.quotaFetchStartedAt = now
    let refused = false
    try {
      const key = await this.planKeyFor(account)
      const scope = accountScope(account)
      const fetched = await fetchQuota({
        deployment: account.deployment,
        planKey: key,
        monitorOrigin: account.deployment === 'zai' ? this.config.zaiApiOrigin : this.config.bigmodelApiOrigin,
        ...scope === undefined ? {} : { scope },
        requestTimeoutMs: this.config.requestTimeoutMs,
        signal,
      })
      const primary = pickPrimaryLimit(fetched.limits)
      this.lastQuota = {
        deployment: account.deployment,
        fetchedAt: now,
        stale: false,
        ...fetched.level === undefined ? {} : { level: fetched.level },
        limits: fetched.limits,
        ...primary === undefined ? {} : { primary },
      }
    } catch (error) {
      if (signal.aborted) throw error
      this.quotaFetchStartedAt = 0
      refused = true
    }
    if (this.lastQuota === undefined) {
      return { deployment: account.deployment, fetchedAt: now, stale: true, limits: [] }
    }
    // A retained snapshot answers as old data; only the empty case above is a
    // "no numbers yet" snapshot.
    return refused ? { ...this.lastQuota, stale: true } : this.lastQuota
  }

  /**
   * Read the plan's server-side usage for one window: per-model and per-tool
   * totals, the daily activity series, credit health, decode speed, and the
   * account's subscriptions. Every figure comes from the monitor; nothing here
   * is derived locally.
   * @param range - the window the surface chose.
   * @param timeZone - zone the window's day keys are expressed in.
   * @param signal - the caller's cancellation.
   * @returns the window's report.
   * @throws RemoteError `zhipu-plan/not-signed-in` when no account is stored.
   * @throws RemoteError `zhipu-plan/network` when the monitor cannot be reached.
   */
  @Remote
  async usage(range: PlanUsageRange, timeZone: string, signal: AbortSignal): Promise<PlanUsageReport> {
    const account = await this.account()
    if (account === undefined) {
      throw zhipuPlanError('zhipu-plan/not-signed-in', 'no Zhipu account is signed in', { reason: 'not-signed-in' })
    }
    const scope = accountScope(account)
    const read = {
      deployment: account.deployment,
      planKey: await this.planKeyFor(account),
      monitorOrigin: account.deployment === 'zai' ? this.config.zaiApiOrigin : this.config.bigmodelApiOrigin,
      ...scope === undefined ? {} : { scope },
      requestTimeoutMs: this.config.requestTimeoutMs,
      signal,
    }
    // ZCode's all-time read, translated: its lifetime surface is one year-long
    // activity call, and its breakdown families never ask for more than the
    // month the monitor answers. So an all-time read asks the activity summary
    // for the whole year — the lifetime totals, peak, streak, and active days
    // come from that one answer — while the model, tool, performance, and
    // credit families cover the latest month instead of being stitched out of a
    // dozen windows each. Every request then sits inside the monitor's own cap.
    const now = Date.now()
    const breakdownRange: PlanUsageRange = range === 'all' ? '30d' : range
    const breakdownWindows = usageWindows(breakdownRange, timeZone, now, USAGE_CHUNK_DAYS)
    const creditWindows = usageWindows(breakdownRange, timeZone, now, CREDIT_CHUNK_DAYS)
    const activityWindow = usageWindows(range, timeZone, now, ACTIVITY_CHUNK_DAYS)[0]
      ?? usageWindow(range, timeZone, now)
    const warn = (family: string) => (error: unknown): void => {
      this.ctx.logger.warn('zhipu-plan: usage family %s unavailable: %s', family, error)
    }
    // The activity answer carries the figures the surface cannot derive from
    // any other read, so it stays required. The remaining families are
    // independent data planes, the way ZCode treats them: a refused one clears
    // only its own section and the rest of the tab still renders.
    let activity: PlanActivitySummary
    try {
      activity = await fetchActivity(read, activityWindow)
    } catch (error) {
      if (signal.aborted) throw error
      throw zhipuPlanError('zhipu-plan/network', 'the plan monitor could not be reached', { cause: error })
    }
    const bestEffort = async <T>(family: string, windows: readonly string[], readWindow: (window: string) => Promise<T>) =>
      readBestEffort(windows, readWindow, signal, warn(family))
    const [modelParts, toolParts, decodeParts] = await Promise.all([
      bestEffort('models', breakdownWindows, window => fetchModelUsage(read, window, read)),
      bestEffort('tools', breakdownWindows, window => fetchToolUsage(read, window, read)),
      bestEffort('decodeSpeed', breakdownWindows, window => fetchDecodeSpeed(read, window, read)),
    ])
    const [credits, subscriptions] = await Promise.all([
      fetchCreditSummary(read, creditWindows[0] ?? activityWindow).catch((error: unknown): PlanCreditSummary => {
        if (signal.aborted) throw error
        warn('credits')(error)
        return {}
      }),
      fetchSubscriptionList(read, account.accessToken).catch((error: unknown): readonly PlanSubscription[] => {
        if (signal.aborted) throw error
        warn('subscriptions')(error)
        return []
      }),
    ])
    return {
      deployment: account.deployment,
      range,
      fetchedAt: Date.now(),
      models: mergeModelUsage(modelParts),
      tools: mergeToolUsage(toolParts),
      activity,
      credits,
      decodeSpeed: mergeDecodeSpeed(decodeParts),
      subscriptions,
    }
  }

  /**
   * Read the resets this account holds.
   * @param signal - the caller's cancellation.
   * @returns the available resets by kind plus the last one spent.
   * @throws RemoteError `zhipu-plan/not-signed-in` when no account is stored.
   * @throws RemoteError `zhipu-plan/network` when the reset service cannot be reached.
   */
  @Remote
  async resetStatus(signal: AbortSignal): Promise<PlanResetStatus> {
    const account = await this.account()
    if (account === undefined) {
      throw zhipuPlanError('zhipu-plan/not-signed-in', 'no Zhipu account is signed in', { reason: 'not-signed-in' })
    }
    try {
      return await fetchResetStatus(this.resetRead(account, signal))
    } catch (error) {
      if (signal.aborted) throw error
      throw zhipuPlanError('zhipu-plan/network', 'the reset service could not be reached', { cause: error })
    }
  }

  /**
   * Spend one reset of the given kind. The key makes a retried click idempotent.
   * @param kind - which reset window is being spent.
   * @param idempotencyKey - caller-minted key, at most 64 characters.
   * @param signal - the caller's cancellation.
   * @returns once the service confirms the reset.
   * @throws RemoteError `zhipu-plan/rejected` when the service refuses the reset.
   */
  @Remote
  async useReset(kind: PlanResetKind, idempotencyKey: string, signal: AbortSignal): Promise<void> {
    const account = await this.account()
    if (account === undefined) {
      throw zhipuPlanError('zhipu-plan/not-signed-in', 'no Zhipu account is signed in', { reason: 'not-signed-in' })
    }
    try {
      await useReset(this.resetRead(account, signal), kind, idempotencyKey)
    } catch (error) {
      if (signal.aborted) throw error
      throw zhipuPlanError('zhipu-plan/rejected', 'the reset service refused the reset', { reason: 'reset-refused', cause: error })
    }
  }

  /**
   * Claim a reset opportunity the service occasionally grants.
   * @param idempotencyKey - caller-minted key, at most 64 characters.
   * @param signal - the caller's cancellation.
   * @returns the grant, or the earliest moment worth asking again.
   * @throws RemoteError `zhipu-plan/rejected` when the service throttles or refuses.
   */
  @Remote
  async requestResetOpportunity(
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<{ readonly granted: true } | { readonly granted: false; readonly nextTryAt: number }> {
    const account = await this.account()
    if (account === undefined) {
      throw zhipuPlanError('zhipu-plan/not-signed-in', 'no Zhipu account is signed in', { reason: 'not-signed-in' })
    }
    try {
      return await requestResetOpportunity(this.resetRead(account, signal), idempotencyKey)
    } catch (error) {
      if (signal.aborted) throw error
      throw zhipuPlanError('zhipu-plan/rejected', 'the reset service refused the request', { reason: 'reset-refused', cause: error })
    }
  }

  /**
   * Mark the reset history as read.
   * @param signal - the caller's cancellation.
   * @returns once the service acknowledges.
   * @throws RemoteError `zhipu-plan/rejected` when the service refuses.
   */
  @Remote
  async markResetHistoryRead(signal: AbortSignal): Promise<void> {
    const account = await this.account()
    if (account === undefined) {
      throw zhipuPlanError('zhipu-plan/not-signed-in', 'no Zhipu account is signed in', { reason: 'not-signed-in' })
    }
    try {
      await markResetHistoryRead(this.resetRead(account, signal))
    } catch (error) {
      if (signal.aborted) throw error
      throw zhipuPlanError('zhipu-plan/rejected', 'the reset service refused the request', { reason: 'reset-refused', cause: error })
    }
  }

  /** Reset-service addressing for one stored account. */
  private resetRead(account: ZhipuPlanAccountPayload, signal: AbortSignal): ResetReadInput {
    const scope = accountScope(account)
    return {
      zcodeApiOrigin: this.config.zcodeApiOrigin,
      zcodeJwt: account.zcodeJwt,
      accessToken: account.accessToken,
      ...scope === undefined ? {} : { scope },
      requestTimeoutMs: this.config.requestTimeoutMs,
      signal,
    }
  }

  /** The credential reference one deployment's resolved plan key is stored under. */
  private planKeyRef(deployment: ZhipuPlanDeployment) {
    return credentialRef(this.config.planKeyEnvs[deployment])
  }

  /** The pi-ai provider route one deployment's GLM models serve through. */
  private providerRoute(deployment: ZhipuPlanDeployment): 'zai' | 'zai-coding-cn' {
    return deployment === 'bigmodel' ? 'zai-coding-cn' : 'zai'
  }

  /**
   * Point the shipped pi-ai coding routes at the signed-in deployment's
   * credential reference, or clear both when no account is stored. The
   * routes live in the `llm-pi-ai` entry's settings document — the same
   * document the Models page edits — because a bundle patch row that
   * overrides another bundle's row outlives this bundle and keeps the
   * plugin manager from uninstalling it. Idempotent: only drift writes.
   * @throws when the settings write is refused; the caller owns reporting.
   */
  private async syncProviderRoutes(): Promise<void> {
    const account = readAccountPayload(await this.ctx.credentials.readRecord(accountRecordKey()))
    const lit = account === undefined ? undefined : this.providerRoute(account.deployment)
    const routes = this.providerRoutesInSettings()
    const ops = []
    for (const route of ['zai', 'zai-coding-cn'] as const) {
      const wanted = route === lit ? this.config.planKeyEnvs[account!.deployment] : undefined
      if (routes[route] === wanted) continue
      ops.push(wanted === undefined
        ? { op: 'unset', path: ['providers', route] }
        : { op: 'set', path: ['providers', route], value: { apiKeyEnv: wanted } })
    }
    if (ops.length === 0) return
    await this.ctx.settings.mutate('llm-pi-ai', ops)
  }

  /** The coding routes' credential references currently in the settings document. */
  private providerRoutesInSettings(): Record<'zai' | 'zai-coding-cn', string | undefined> {
    const settings: SettingsForms = this.ctx.settings
    const form = settings.describe().find(descriptor => descriptor.ns === 'llm-pi-ai')
    const providers = (form?.value as { providers?: Record<string, { apiKeyEnv?: string }> } | undefined)
      ?.providers ?? {}
    return { zai: providers.zai?.apiKeyEnv, 'zai-coding-cn': providers['zai-coding-cn']?.apiKeyEnv }
  }

  /** The plan key one stored account currently authenticates the monitor with. */
  private async planKeyFor(account: ZhipuPlanAccountPayload): Promise<string> {
    if (account.planKind === 'start-plan') return account.zcodeJwt
    return await this.ctx.credentials.resolve(this.planKeyRef(account.deployment))
      .then(resolved => resolved?.value)
      .then((value) => {
        if (value === undefined || value === '') {
          throw zhipuPlanError('zhipu-plan/not-signed-in', 'no plan credential is stored; sign in again', { reason: 'no-plan-key' })
        }
        return value
      })
  }

  /**
   * Re-resolve and store the plan credential for the stored account. A login
   * does this itself; a Team deployment re-runs it here because its key is
   * resolved per attempt rather than assumed long-lived.
   * @returns once the credential reference holds a fresh key.
   * @throws RemoteError the plan account's refusal classes.
   */
  @Remote('refreshCredential')
  async refreshCredential(): Promise<{ accepted: true }> {
    const account = await this.account()
    if (account === undefined) {
      throw zhipuPlanError('zhipu-plan/not-signed-in', 'no Zhipu account is signed in', { reason: 'not-signed-in' })
    }
    const refreshed = await this.storePlanCredential(account)
    await this.ctx.credentials.modifyRecord(accountRecordKey(), () => {
      return Promise.resolve(accountGrant(refreshed))
    })
    this.scheduleBootstrap()
    return { accepted: true }
  }

  /**
   * Run one sign-in attempt through the authorization seam.
   * @param deployment - deployment the human authorizes against, chosen on the surface.
   * @param planKind - entitlement the account holds, chosen on the surface.
   * @param signal - the caller's cancellation of the whole attempt.
   * @returns once the attempt has settled; its outcome is in {@link loginState}.
   * @throws RemoteError `zhipu-plan/rejected` when an attempt is already running or no flow is registered.
   */
  @Remote('beginLogin')
  async beginLogin(deployment: ZhipuPlanDeployment, planKind: ZhipuPlanKind, signal: AbortSignal): Promise<{ accepted: true }> {
    if (this.ctx.authorization.describe(accountRecordKey()) === undefined) {
      throw zhipuPlanError('zhipu-plan/rejected', 'the sign-in flow is not registered', { reason: 'no-flow' })
    }
    if (this.currentLoginState.state === 'waiting') {
      throw zhipuPlanError('zhipu-plan/rejected', 'a sign-in is already running', { reason: 'already-waiting' })
    }
    this.requestedDeployment = deployment
    this.requestedPlanKind = planKind
    this.currentLoginState = { state: 'waiting' }
    const outcome = await this.ctx.authorization.begin({
      key: accountRecordKey(),
      interaction: {
        notify: (notice) => {
          this.currentLoginState = { state: 'waiting', ...notice.url === undefined ? {} : { authorizeUrl: notice.url } }
        },
        // The deployment arrives with the request, so the flow asks nothing;
        // a surface without a prompt seat still renders the whole sign-in.
        prompt: () => Promise.reject(new RemoteError('zhipu-plan/rejected', 'this sign-in asks no questions', { reason: 'no-prompt' })),
      },
      signal,
    })
    this.currentLoginState = outcome.status === 'authorized' ? { state: 'signed-in' } : { state: 'idle' }
    return { accepted: true }
  }

  /**
   * What a running sign-in attempt wants the surface to show.
   * @returns the current login state, retained until the next attempt begins.
   */
  @Remote
  loginState(): ZhipuPlanLoginState {
    return this.currentLoginState
  }

  /**
   * Withdraw a running sign-in attempt.
   * @returns once the seam has been asked to cancel; the outcome is in {@link loginState}.
   */
  @Remote
  cancelLogin(): void {
    this.ctx.authorization.cancel(accountRecordKey())
  }

  /**
   * Sign out: delete the stored account and every derived fact with it.
   */
  @Remote
  async logout(): Promise<void> {
    await this.ctx.credentials.deleteRecord(accountRecordKey())
    this.onSignedOut()
  }

  /**
   * Read the stored account payload.
   * @returns the account, or undefined when no record is stored.
   * @throws RemoteError when the record does not parse.
   */
  async account(): Promise<ZhipuPlanAccountPayload | undefined> {
    let record: CredentialRecord | undefined
    try {
      record = await this.ctx.credentials.readRecord(accountRecordKey())
      return readAccountPayload(record)
    } catch (error) {
      throw zhipuPlanError('zhipu-plan/rejected', 'the stored Zhipu account record is unreadable',
        { reason: 'account-record-unreadable', cause: error })
    }
  }

  /** The flow this plugin registers: keyed by the record it writes. */
  private loginFlow(): AuthorizationFlow {
    return {
      key: accountRecordKey(),
      label: 'Zhipu coding plan',
      methods: [{ id: 'browser', label: 'Sign in with the browser' }],
      run: session => this.runLogin(session, this.requestedDeployment, this.requestedPlanKind),
    }
  }

  /** One attempt: open the relay flow, wait for the human, commit the account. */
  private async runLogin(
    session: AuthorizationSession,
    deployment: ZhipuPlanDeployment,
    planKind: ZhipuPlanKind,
  ): Promise<void> {
    let ready: RelayPollReady
    try {
      ready = await runLoginAttempt({
        relay: this.relay,
        deployment,
        pollToken: createPollToken(),
        clock: {
          now: () => Date.now(),
          sleep: ms => new Promise((resolve, reject) => {
            const timer = setTimeout(() => { resolve() }, ms)
            session.signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new Error('authorization cancelled'))
            }, { once: true })
          }),
        },
        timeoutMs: this.config.loginTimeoutMs,
        signal: session.signal,
        onAuthorizeUrl: (flow) => {
          session.notify({
            message: 'Continue in your browser to finish the Zhipu coding-plan sign-in.',
            url: flow.authorizeUrl,
          })
        },
      })
    } catch (error) {
      if (session.signal.aborted) throw error
      const message = error instanceof LoginError ? error.message : 'Authorization failed unexpectedly.'
      this.currentLoginState = { state: 'failed', message }
      throw error
    }
    if (session.signal.aborted) throw new Error('authorization cancelled')
    // Resolve the inference credential before committing: a deployment that
    // refuses the key fails the attempt instead of leaving a half-usable
    // sign-in behind.
    const account = await this.storePlanCredential(accountPayloadFor(deployment, planKind, ready))
    // A cancelled or expired attempt must not persist a late ready answer.
    await this.ctx.credentials.modifyRecord(accountRecordKey(), () => {
      return Promise.resolve(accountGrant(account))
    })
    // Light the models this deployment serves before the surface reports
    // success, so a signed-in picker is never empty.
    await this.syncProviderRoutes()
    this.scheduleBootstrap()
    this.currentLoginState = { state: 'signed-in' }
  }

  /**
   * Resolve the account's inference credential and store it under the
   * reference the provider profiles read.
   * @param account - the account payload the attempt is about to commit.
   * @returns that payload with the resolved organization scope, when the plan has one.
   */
  private async storePlanCredential(account: ZhipuPlanAccountPayload): Promise<ZhipuPlanAccountPayload> {
    let resolution
    try {
      resolution = await resolvePlanKey({
        deployment: account.deployment,
        planKind: account.planKind,
        account,
        origins: {
          bigmodelApiOrigin: this.config.bigmodelApiOrigin,
          zaiApiOrigin: this.config.zaiApiOrigin,
        },
        requestTimeoutMs: this.config.requestTimeoutMs,
        signal: undefined,
      })
    } catch (error) {
      if (error instanceof PlanKeyError) {
        throw zhipuPlanError(error.code, error.message, { cause: error })
      }
      throw zhipuPlanError('zhipu-plan/network', 'the plan service could not be reached', { cause: error })
    }
    await this.ctx.credentials.set(this.planKeyRef(account.deployment), resolution.key)
    // A deployment switch must drop the previous deployment's key, or its
    // provider would stay lit against an account that no longer backs it.
    const previous = account.deployment === 'bigmodel' ? 'zai' : 'bigmodel'
    await this.ctx.credentials.unset(this.planKeyRef(previous))
    return resolution.scope === undefined ? account : { ...account, ...resolution.scope }
  }

  /** Drop the derived plan credential and the attempt state. */
  protected onSignedOut(): void {
    void this.ctx.credentials.unset(this.planKeyRef('bigmodel'))
    void this.ctx.credentials.unset(this.planKeyRef('zai'))
    void this.syncProviderRoutes().catch((error: unknown) => {
      this.ctx.logger.warn('zhipu-plan: provider route sync failed: %s', error)
    })
    this.scheduleBootstrap()
    this.currentLoginState = { state: 'idle' }
  }

  /**
   * The live runtime switches the web and zread backends gate on. Read from the
   * volatile config references so a settings hot-swap applies without restart.
   * @returns the current `search`, `reader`, `zread`, and `zhPrompt` flags.
   */
  private webBackendSettings(): ZhipuBackendSettings {
    return {
      search: readConfigFlag(this.config.search),
      reader: readConfigFlag(this.config.reader),
      zread: readConfigFlag(this.config.zread),
      zhPrompt: readConfigFlag(this.config.zhPrompt),
    }
  }

  /** The host web service seam, when the composition mounts it. */
  private webService(): WebServiceShape | undefined {
    return this.ctx.get('web') as WebServiceShape | undefined
  }

  /** The host tools service seam, when the composition mounts it. */
  private toolsService(): ToolsServiceShape | undefined {
    return this.ctx.get('tools') as ToolsServiceShape | undefined
  }

  /** The host system-prompt service seam, when the composition mounts it. */
  private systemPromptService(): SystemPromptServiceShape | undefined {
    return this.ctx.get('systemPrompt') as SystemPromptServiceShape | undefined
  }

  /** The host agent registry seam, when the composition mounts it. */
  private agentsService(): AgentsServiceShape | undefined {
    return this.ctx.get('agents') as AgentsServiceShape | undefined
  }

  /** The agent-scoped view of the host tools service. */
  private agentTools(agent: AgentShape): ToolsServiceShape | undefined {
    return agent.ctx.get('tools') as ToolsServiceShape | undefined
  }

  /**
   * Unregister both providers from the web service they were registered on.
   * Runs when the web service is replaced or the service unloads.
   */
  private disposeWebProviders(): void {
    this.webServiceSeen = undefined
    const disposers = this.webProviderDisposers.splice(0)
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch { /* the replaced web fiber is already disposed */ }
    }
  }

  /**
   * Register both providers on one live web service, replacing any left on a
   * previous instance. Registration is resident: the providers' own
   * `available()` gates decide selection, so a switch flip never re-registers.
   * @param web - the live host web service.
   */
  private installWebProvidersOn(web: WebServiceShape): void {
    if (web === this.webServiceSeen) return
    this.disposeWebProviders()
    this.webServiceSeen = web
    const install = (kind: string, register: () => () => void): void => {
      let attempt = 0
      const run = (): void => {
        try {
          this.webProviderDisposers.push(register())
        } catch (error) {
          const message = errorMessage(error)
          if (/already registered|duplicate/i.test(message)) {
            // A concurrent registration won the race; the provider is live.
            if (attempt < WEB_PROVIDER_RETRIES - 1) {
              attempt += 1
              setTimeout(run, WEB_PROVIDER_RETRY_MS)
            }
            return
          }
          this.ctx.logger.warn('zhipu-plan: %s registration failed: %s', kind, error)
        }
      }
      run()
    }
    install(`web provider ${ZHIPU_SEARCH_PROVIDER_ID}`, () => web.registerSearchProvider(this.searchProvider))
    install(`web provider ${ZHIPU_READER_PROVIDER_ID}`, () => web.registerFetchProvider(this.readerProvider))
  }

  /**
   * Register both providers when a live web service has not been seen yet.
   * Editing the `web` row remounts that service, which drops the registrations:
   * the identity check re-registers them as soon as the new service appears.
   */
  private ensureWebProviders(): void {
    const web = this.webService()
    if (web === undefined) {
      this.ctx.logger.warn('zhipu-plan: the host web service is not mounted; Zhipu web backends stay off')
      return
    }
    this.installWebProvidersOn(web)
  }

  /**
   * Resolve the plan credential for one backend call, under the caller's
   * cancellation. Every failure surfaces as the fixed credential error so the
   * agent sees one stable failure class instead of a Remote contract code.
   * @param signal - the caller's cancellation.
   * @returns the plan key the MCP endpoint authenticates with.
   */
  private async resolveBackendApiKey(signal?: AbortSignal): Promise<string> {
    const zhPrompt = this.webBackendSettings().zhPrompt
    let account: ZhipuPlanAccountPayload | undefined
    try {
      account = readAccountPayload(await this.ctx.credentials.readRecord(accountRecordKey()))
    } catch {
      throw credentialMissingError(zhPrompt)
    }
    if (account === undefined) throw credentialMissingError(zhPrompt)
    try {
      return await abortable(this.planKeyFor(account), signal)
    } catch (error) {
      if (isZhipuBackendError(error) || isAbortError(error)) throw error
      throw credentialMissingError(zhPrompt)
    }
  }

  /**
   * Re-probe whether the stored account's plan credential resolves. The result
   * is the synchronous gate behind both providers' `available()` and the web
   * row rewrite, so it is cached rather than resolved per check.
   */
  private async refreshBackendAvailability(): Promise<void> {
    try {
      const payload = await this.ctx.credentials.readRecord(accountRecordKey())
      const account = readAccountPayload(payload)
      if (account === undefined) {
        this.backendCredentialReady = false
        return
      }
      const key = await this.planKeyFor(account)
      this.backendCredentialReady = key.trim() !== ''
    } catch {
      this.backendCredentialReady = false
    }
  }

  /**
   * Clear the built-in `web` row pointers this plugin's older builds wrote.
   * The Zhipu backends are additional capabilities now, so the row is never
   * pointed at them; residue is restored to the inherited backends. The row is
   * not volatile on the supported host, so the write goes through the profile
   * config editor (runtime config write, not a bundle patch override).
   * Idempotent: only drift writes, and only pointers this plugin owns are
   * cleared.
   */
  /**
   * Serialize web-row rewrites in this service's own lane: the loader applies
   * an edit inside an HMR transaction, and an edit started before the previous
   * one settles would be rejected as nested.
   * @param restore - whether to clear the pointers unconditionally.
   * @returns the settled write.
   */
  private syncWebBackends(restore = false): Promise<void> {
    const run = (): Promise<void> => this.reconcileWebBackends(restore)
    const next = this.webRowEditChain.then(run, run)
    this.webRowEditChain = next.catch(() => undefined)
    return next
  }

  /**
   * Compare the wanted pointers with the live web row and write only drift.
   * @param restore - whether to clear the pointers unconditionally.
   */
  private async reconcileWebBackends(restore = false): Promise<void> {
    const wanted: WebRowTarget = {
      // Additional capabilities, never replacements: no pointer is ever
      // written, whatever the switches or the credential say. A pointer still
      // naming one of the providers below is residue an older build left and
      // is restored to the inherited backends; a teardown restores the same
      // way.
      searchProvider: undefined,
      fetchProvider: undefined,
    }
    const settings: SettingsForms = this.rootContext.settings
    const descriptor = settings.describe().find(form => form.ns === 'web')
    if (descriptor !== undefined) {
      // Forward compatibility: a host whose `web` row exposes volatile fields
      // can take the ordinary settings API instead of the config editor.
      const current = (descriptor.value ?? {}) as Record<string, unknown>
      const ops: Array<{ op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }> = []
      for (const key of WEB_ROW_KEYS) {
        const write = this.webRowDrift(key, current[key], wanted[key])
        if (write === undefined) continue
        ops.push(write.value === undefined
          ? { op: 'unset', path: [key] }
          : { op: 'set', path: [key], value: write.value })
      }
      if (ops.length === 0) return
      await this.rootContext.settings.mutate('web', ops)
      return
    }
    const editor = this.rootContext.get('configEditor') as ConfigEditorShape | undefined
    if (editor === undefined) {
      this.warnWebSettings('the configEditor service is unavailable; the web row is left untouched')
      return
    }
    const entry = editor.entries().find(row => row.options.id === WEB_ROW_ID)
    if (entry === undefined) {
      this.warnWebSettings('no "web" plugin entry exists in this profile; the web row is left untouched')
      return
    }
    const current = (entry.options.config ?? {}) as Record<string, unknown>
    const drift = WEB_ROW_KEYS.some(key => this.webRowDrift(key, current[key], wanted[key]) !== undefined)
    if (!drift) return
    await editor.edit(entry, (resolved, inherited) => {
      const next: Record<string, unknown> = { ...resolved }
      for (const key of WEB_ROW_KEYS) {
        const write = this.webRowDrift(key, resolved[key], wanted[key])
        if (write === undefined) continue
        const target = write.value ?? inherited[key]
        if (target === undefined) Reflect.deleteProperty(next, key)
        else next[key] = target
      }
      // Returning exactly the inherited layer deletes the row's profile config,
      // so the bundle row (built-in backends) takes over again.
      return isRecordEqual(next, inherited) ? inherited : next
    })
    // The reconcile remounted the web row; re-register on the new service.
    if (!restore) this.ensureWebProviders()
  }

  /**
   * One row key's drift between the live value and the wanted pointer.
   * @param key - the web row config key.
   * @param currentValue - the live value, if any.
   * @param wanted - the pointer this plugin wants, or undefined to restore.
   * @returns the write when one is needed, or undefined for no change.
   */
  private webRowDrift(
    key: WebRowKey,
    currentValue: unknown,
    wanted: string | undefined,
  ): WebRowWrite | undefined {
    const live = typeof currentValue === 'string' ? currentValue : undefined
    if (live === wanted) return undefined
    // Never clear a pointer some other configuration owns; only ours is restored.
    if (wanted === undefined && live !== WEB_ROW_TARGETS[key]) return undefined
    return { value: wanted }
  }

  /** One-shot warning when the web row cannot be managed on this host. */
  private warnWebSettings(message: string): void {
    if (this.webSettingsWarned) return
    this.webSettingsWarned = true
    this.ctx.logger.warn('zhipu-plan: %s', message)
  }

  /**
   * Clear the pointers this plugin owns, so unloading the plugin returns the
   * built-in web tools to the composition's default backends with no residue.
   */
  private async restoreWebBackends(): Promise<void> {
    try {
      await this.syncWebBackends(true)
    } catch (error) {
      this.ctx.logger.warn('zhipu-plan: could not restore the web provider row: %s', error)
    }
  }

  /** Probe the credential, reconcile the web row, and remount the agent surface. */
  private async bootstrapBackends(): Promise<void> {
    await this.refreshBackendAvailability()
    this.refreshBackendSurface()
    await this.syncWebBackends()
    this.ensureWebProviders()
  }

  /**
   * Mark a backend reconcile as due, coalescing bursts. The reconcile runs from
   * the service poller instead of the caller's async context: the loader
   * applies a row edit (and commits volatile config) inside an HMR transaction,
   * and a timer scheduled inside that transaction still carries its token
   * afterwards, so an in-context retry would be rejected as nested forever.
   */
  private scheduleBootstrap(): void {
    this.bootstrapPending = true
  }

  /**
   * Run a due reconcile from the init-time poller, whose async context predates
   * every transaction and can therefore acquire the loader's HMR lane. A
   * reconcile that still lands inside another transaction leaves the flag set
   * and retries on the next tick.
   */
  private drainBootstrap(): void {
    if (this.bootstrapDraining) return
    this.bootstrapDraining = true
    void this.runBootstrapDrain().finally(() => {
      this.bootstrapDraining = false
    })
  }

  /** One poller tick: the teardown restore when one is pending, else the due reconcile. */
  private async runBootstrapDrain(): Promise<void> {
    for (;;) {
      if (this.teardownRestorePending) {
        await this.restoreOnTeardown()
        return
      }
      if (!this.bootstrapPending) return
      this.bootstrapPending = false
      try {
        await this.bootstrapBackends()
      } catch (error) {
        if (/HMR transactions cannot be nested/i.test(errorMessage(error))) {
          this.bootstrapPending = true
          return
        }
        this.ctx.logger.warn('zhipu-plan: web backend bootstrap failed: %s', error)
      }
      if (!this.bootstrapPending && !this.teardownRestorePending) return
    }
  }

  /**
   * Restore the web row after this fiber unloaded. The first poller tick can
   * land while the unload is still draining the other effects, when a service
   * lookup or an edit may transiently fail; retry on the token-free poller
   * until the row no longer points at the providers this plugin registered.
   */
  private async restoreOnTeardown(): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await this.syncWebBackends(true)
        if (!this.webRowPointsAtOurProviders()) {
          this.teardownRestorePending = false
          break
        }
      } catch (error) {
        if (!/HMR transactions cannot be nested/i.test(errorMessage(error)) && attempt === 49) {
          this.rootContext.logger.warn('zhipu-plan: could not restore the web provider row: %s', error)
        }
      }
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, BOOTSTRAP_POLL_MS)
        ;(timer as unknown as { unref?: () => void }).unref?.()
      })
    }
    if (this.teardownRestorePending) {
      this.teardownRestorePending = false
      this.rootContext.logger.warn('zhipu-plan: the web provider row could not be restored after teardown')
    }
    this.stopBootstrapPoller()
  }

  /** Whether the live 'web' row still names one of the providers this plugin owns. */
  private webRowPointsAtOurProviders(): boolean {
    try {
      const settings: SettingsForms = this.rootContext.settings
      const descriptor = settings.describe().find(form => form.ns === 'web')
      const edited = descriptor === undefined
        ? (this.rootContext.get('configEditor') as ConfigEditorShape | undefined)?.entries().find(row => row.options.id === WEB_ROW_ID)?.options?.config
        : descriptor.value
      const current = (edited ?? {}) as Record<string, unknown>
      return WEB_ROW_KEYS.some(key => current[key] === WEB_ROW_TARGETS[key])
    } catch {
      return true
    }
  }

  /** Stop the init-time poller; only the teardown path calls this. */
  private stopBootstrapPoller(): void {
    if (this.bootstrapTimer === undefined) return
    clearInterval(this.bootstrapTimer)
    this.bootstrapTimer = undefined
  }

  /** Re-read the volatile settings and reconcile both backends. */
  private onBackendSettingsChanged(): void {
    this.scheduleBootstrap()
  }

  /**
   * Idempotently mount or unmount the additional Zhipu tools and their prompt
   * sections, then re-evaluate every live agent's scoped tool surface.
   */
  private refreshBackendSurface(): void {
    const settings = this.webBackendSettings()
    // All mounted tool surfaces share one prompt language; a flip unmounts
    // them so the next mount rebuilds descriptions and sections.
    if (this.surfaceZhPrompt !== undefined && this.surfaceZhPrompt !== settings.zhPrompt) {
      this.disposeAgentSurfaces()
      this.unmountWebTools()
      this.unmountZread()
    }
    if (settings.search) this.mountWebSearch(settings.zhPrompt)
    else this.unmountWebSearch()
    if (settings.reader) this.mountWebReader(settings.zhPrompt)
    else this.unmountWebReader()
    if (settings.zread) this.mountZread(settings.zhPrompt)
    else this.unmountZread()
    const agents = this.agentsService()
    if (agents === undefined) return
    for (const agent of agents.list()) this.installAgentSurface(agent)
  }

  /**
   * Mount the additional `zhipu_web_search` tool and its prompt section.
   * @param zhPrompt - prompt language to build the section for.
   */
  private mountWebSearch(zhPrompt: boolean): void {
    if (this.webSearchDisposers.length > 0) {
      this.surfaceZhPrompt = zhPrompt
      return
    }
    const tools = this.toolsService()
    const prompt = this.systemPromptService()
    if (tools === undefined || prompt === undefined) {
      if (!this.webToolsMountWarned) {
        this.webToolsMountWarned = true
        this.ctx.logger.warn('zhipu-plan: the host tools or system-prompt service is not mounted; zhipu_web_search stays off')
      }
      return
    }
    const deps: ZhipuWebSearchToolDeps = {
      settings: () => this.webBackendSettings(),
      search: (request, signal) => this.providerSearch(request, signal),
    }
    const disposers: Array<() => void> = []
    try {
      disposers.push(tools.register(createZhipuWebSearchTool(deps)))
      for (const section of webSearchPromptSections(zhPrompt)) disposers.push(prompt.section(section))
      this.webSearchDisposers = disposers
      this.surfaceZhPrompt = zhPrompt
    } catch (error) {
      for (const dispose of disposers.reverse()) {
        try { dispose() } catch { /* best-effort partial mount rollback */ }
      }
      this.ctx.logger.warn('zhipu-plan: zhipu_web_search mount failed: %s', error)
    }
  }

  /** Unmount the additional `zhipu_web_search` tool and prompt section. */
  private unmountWebSearch(): void {
    const disposers = this.webSearchDisposers
    this.webSearchDisposers = []
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch (error) { this.ctx.logger.warn('zhipu-plan: zhipu_web_search unmount failed: %s', error) }
    }
  }

  /**
   * Mount the additional `zhipu_web_fetch` tool and its prompt section.
   * @param zhPrompt - prompt language to build the section for.
   */
  private mountWebReader(zhPrompt: boolean): void {
    if (this.webReaderDisposers.length > 0) {
      this.surfaceZhPrompt = zhPrompt
      return
    }
    const tools = this.toolsService()
    const prompt = this.systemPromptService()
    if (tools === undefined || prompt === undefined) {
      if (!this.webToolsMountWarned) {
        this.webToolsMountWarned = true
        this.ctx.logger.warn('zhipu-plan: the host tools or system-prompt service is not mounted; zhipu_web_fetch stays off')
      }
      return
    }
    const deps = {
      settings: (): ZhipuBackendSettings => this.webBackendSettings(),
      fetch: (request: { readonly url: string }, signal?: AbortSignal) => this.providerFetch(request, signal),
    }
    const disposers: Array<() => void> = []
    try {
      disposers.push(tools.register(createZhipuWebFetchTool(deps)))
      for (const section of readerPromptSections(zhPrompt)) disposers.push(prompt.section(section))
      this.webReaderDisposers = disposers
      this.surfaceZhPrompt = zhPrompt
    } catch (error) {
      for (const dispose of disposers.reverse()) {
        try { dispose() } catch { /* best-effort partial mount rollback */ }
      }
      this.ctx.logger.warn('zhipu-plan: zhipu_web_fetch mount failed: %s', error)
    }
  }

  /** Unmount the additional `zhipu_web_fetch` tool and prompt section. */
  private unmountWebReader(): void {
    const disposers = this.webReaderDisposers
    this.webReaderDisposers = []
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch (error) { this.ctx.logger.warn('zhipu-plan: zhipu_web_fetch unmount failed: %s', error) }
    }
  }

  /** Unmount both additional web tools; the language flip and teardown paths only. */
  private unmountWebTools(): void {
    this.unmountWebSearch()
    this.unmountWebReader()
    this.surfaceZhPrompt = undefined
  }

  /**
   * Mount the three global zread tools and their prompt sections.
   * @param zhPrompt - prompt language to build the sections for.
   */
  private mountZread(zhPrompt: boolean): void {
    if (this.zreadDisposers.length > 0) {
      this.surfaceZhPrompt = zhPrompt
      return
    }
    const tools = this.toolsService()
    const prompt = this.systemPromptService()
    if (tools === undefined || prompt === undefined) {
      if (!this.zreadMountWarned) {
        this.zreadMountWarned = true
        this.ctx.logger.warn('zhipu-plan: the host tools or system-prompt service is not mounted; zread tools stay off')
      }
      return
    }
    const deps: ZreadDeps = {
      settings: () => this.webBackendSettings(),
      endpoint: () => `${this.config.bigmodelApiOrigin}/api/mcp/zread/mcp`,
      resolveApiKey: signal => this.resolveBackendApiKey(signal),
    }
    const disposers: Array<() => void> = []
    try {
      for (const definition of createZreadToolDefinitions(deps)) disposers.push(tools.register(definition))
      for (const section of zreadPromptSections(zhPrompt)) disposers.push(prompt.section(section))
      this.zreadDisposers = disposers
      this.surfaceZhPrompt = zhPrompt
    } catch (error) {
      for (const dispose of disposers.reverse()) {
        try { dispose() } catch { /* best-effort partial mount rollback */ }
      }
      this.ctx.logger.warn('zhipu-plan: zread mount failed: %s', error)
    }
  }

  /** Unmount the zread tools and prompt sections mounted by {@link mountZread}. */
  private unmountZread(): void {
    const disposers = this.zreadDisposers
    this.zreadDisposers = []
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch (error) { this.ctx.logger.warn('zhipu-plan: zread unmount failed: %s', error) }
    }
  }

  /**
   * Whether one agent runs under the `minimal` preset. The probe is read-only;
   * a host without the preset registry, or one whose probe throws, is treated
   * as non-minimal so the standard tool surface is never lost.
   * @param agent - the live agent to classify.
   * @returns true only when the host positively reports the minimal preset.
   */
  private isMinimalAgent(agent: AgentShape): boolean {
    try {
      const presets = this.ctx.get('agentPresets') as AgentPresetsShape | undefined
      if (presets === undefined) return false
      return presets.composedPreset(agent.ctx) === 'minimal'
    } catch {
      return false
    }
  }

  /**
   * Install the agent-scoped surface for one agent. The additional Zhipu tools
   * are global, so only the minimal preset needs handling: it mounts nothing
   * beyond its fixed toolset and must explicitly deny whichever of the
   * additional tools are live. Replaces any previous surface for that agent.
   * @param agent - the live agent to reconcile.
   */
  private installAgentSurface(agent: AgentShape | undefined): void {
    if (agent === undefined) return
    try {
      this.disposeAgentSurface(agent)
      if (!this.isMinimalAgent(agent)) return
      const deny = this.minimalDenyNames()
      if (deny.length === 0) return
      const tools = this.agentTools(agent)
      if (tools === undefined) return
      this.agentSurfaces.set(agent, tools.restrict({ deny }))
    } catch (error) {
      this.ctx.logger.warn('zhipu-plan: agent tool surface install failed: %s', error)
    }
  }

  /**
   * Names of the additional tools currently mounted, for the minimal-preset
   * deny restriction.
   * @returns the live subset of the Zhipu tool names.
   */
  private minimalDenyNames(): string[] {
    return [
      ...(this.webSearchDisposers.length > 0 ? [ZHIPU_WEB_SEARCH_TOOL_NAME] : []),
      ...(this.webReaderDisposers.length > 0 ? [ZHIPU_WEB_FETCH_TOOL_NAME] : []),
      ...(this.zreadDisposers.length > 0 ? ZREAD_TOOL_NAMES : []),
    ]
  }

  /**
   * Run one additional-tool search through the registered provider.
   * @param request - the merged query request.
   * @param signal - the tool call's cancellation.
   * @returns the provider's search outcome.
   */
  private async providerSearch(
    request: { readonly query: string; readonly maxResults?: number },
    signal?: AbortSignal,
  ): Promise<ZhipuSearchOutcome> {
    const settings = this.webBackendSettings()
    if (!settings.search) throw disabledError(settings.zhPrompt)
    return await this.searchProvider.search(request, signal)
  }

  /**
   * Run one additional-tool page read through the registered provider.
   * @param request - the page-read request.
   * @param signal - the tool call's cancellation.
   * @returns the provider's read outcome.
   */
  private async providerFetch(
    request: { readonly url: string },
    signal?: AbortSignal,
  ): Promise<ZhipuReadOutcome> {
    const settings = this.webBackendSettings()
    if (!settings.reader) throw disabledError(settings.zhPrompt)
    return await this.readerProvider.fetch(request, signal)
  }

  /** Dispose the scoped surface installed for one agent, if any. */
  private disposeAgentSurface(agent: object): void {
    const dispose = this.agentSurfaces.get(agent)
    if (dispose === undefined) return
    this.agentSurfaces.delete(agent)
    try {
      dispose()
    } catch (error) {
      this.ctx.logger.warn('zhipu-plan: agent tool surface dispose failed: %s', error)
    }
  }

  /** Dispose every agent-scoped surface, e.g. before unmounting the zread tools. */
  private disposeAgentSurfaces(): void {
    for (const agent of [...this.agentSurfaces.keys()]) this.disposeAgentSurface(agent)
  }

  /**
   * Re-evaluate the affected agent after a preset selection changes.
   * @param sessionId - the session whose preset was selected, as the host reports it.
   */
  private onAgentPresetSelected(sessionId: unknown): void {
    const agents = this.agentsService()
    if (agents === undefined) return
    for (const agent of agents.list()) {
      const headerId = agent.session?.header?.id
      const sessionIdOf = agent.session?.id
      if (headerId === sessionId || sessionIdOf === sessionId || agent.id === sessionId) this.installAgentSurface(agent)
    }
  }
}

export default ZhipuPlanService
