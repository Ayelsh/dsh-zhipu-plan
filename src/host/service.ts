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

import { Context, Service } from '@deepseek-ai/cordis'
import type { AuthorizationFlow, AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsForms } from '@deepseek-ai/dsh-settings'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { zhipuPlanError } from './errors.ts'
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
import type {
  PlanActivitySummary, PlanCreditSummary, PlanQuotaSnapshot, PlanResetKind, PlanResetStatus,
  PlanSubscription, PlanUsageRange, PlanUsageReport,
  ZhipuPlanAccountView, ZhipuPlanDeployment, ZhipuPlanKind, ZhipuPlanLoginState, ZhipuPlanStatus,
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
})

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

  /**
   * @param ctx - host context carrying the credential and authorization seams.
   * @param config - validated relay address and deadlines.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'zhipuPlan', { namespace: 'zhipuPlan' })
    this.config = config
    this.relay = new ZhipuAuthRelay(config.relayBaseUrl, config.requestTimeoutMs)
  }

  /** Register the login flow with the authorization seam for this fiber. */
  protected [Service.init](): void {
    this.ctx.effect(() => this.ctx.authorization.registerFlow(this.loginFlow()), 'zhipu-plan.loginFlow')
    // Restore the coding routes a stored account signed in for; a restart
    // must not leave the picker dark until the next sign-in.
    void this.syncProviderRoutes().catch((error: unknown) => {
      this.ctx.logger.warn('zhipu-plan: provider route sync failed: %s', error)
    })
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
    this.currentLoginState = { state: 'idle' }
  }
}

export default ZhipuPlanService
