/**
 * The plan API-key resolver: turn a signed-in account's tokens into the key
 * its deployment's inference endpoint accepts.
 *
 * The chain is the coding-plan product's own (observed from ZCode,
 * Apache-2.0): pick the default organization and project, reuse or create the
 * plan key in it, and pair the key with its secret. The international
 * deployment exchanges the account token for a business token first; a Start
 * Plan needs no key at all because its ZCode JWT is the inference credential.
 * Every host is configurable because none of this is a documented contract.
 *
 * @module dsh-zhipu-plan/host/plan-key
 */

import type { ZhipuPlanErrorCode } from './errors.ts'
import type { ZhipuPlanAccountPayload } from './record.ts'

/** Resolved business origins the resolver calls. */
export interface PlanKeyOrigins {
  /** Mainland deployment business origin. */
  readonly bigmodelApiOrigin: string
  /** International deployment business origin. */
  readonly zaiApiOrigin: string
}

/** One resolved inference credential and the organization scope it belongs to. */
export interface PlanKeyResolution {
  /** The credential a provider profile reads through its `apiKeyEnv`. */
  readonly key: string
  /**
   * Organization and project the key was issued under. Present for team plans,
   * whose monitor reads must name the project the key belongs to; individual
   * keys are account-wide and carry no scope.
   */
  readonly scope?: { readonly organizationId: string; readonly projectId: string }
}

/** Inputs for one resolution. */
export interface ResolvePlanKeyInput {
  readonly deployment: 'bigmodel' | 'zai'
  /** Which entitlement the account holds; `start-plan` never calls the network. */
  readonly planKind: 'individual-coding-plan' | 'team-coding-plan' | 'start-plan'
  readonly account: ZhipuPlanAccountPayload
  readonly origins: PlanKeyOrigins
  readonly requestTimeoutMs: number
  readonly signal: AbortSignal | undefined
}

/** A failure of one business call, classified for the caller. */
export class PlanKeyError extends Error {
  /**
   * @param code - the wire error class a caller branches on.
   * @param message - what went wrong, safe to show the user.
   */
  constructor(readonly code: Extract<ZhipuPlanErrorCode, 'zhipu-plan/no-plan' | 'zhipu-plan/missing-org-project' | 'zhipu-plan/network'>, message: string) {
    super(message)
    this.name = 'PlanKeyError'
  }
}

/** One business answer's envelope. */
interface BizEnvelope<T> {
  readonly code?: unknown
  readonly msg?: unknown
  readonly data?: T
}

interface RemoteOrganization {
  readonly organizationId?: unknown
  readonly organizationName?: unknown
  readonly projects?: ReadonlyArray<{ readonly projectId?: unknown; readonly projectName?: unknown }>
}

interface RemoteApiKeySummary {
  readonly apiKey?: unknown
  readonly keyType?: unknown
  readonly name?: unknown
}

/** Organization/project pair a team-plan call must carry with it. */
interface TeamContext {
  readonly organizationId: string
  readonly projectId: string
}

/** Names and kinds the coding-plan product's keys carry. */
const INDIVIDUAL_KEY_NAME = 'zcode-api-key'
const TEAM_KEY_NAME = 'zcode-team-api-key'
const TEAM_KEY_TYPE = 2
const DEFAULT_ORG_NAME = '默认机构'
const DEFAULT_PROJECT_NAME = '默认项目'

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** Business-code check the deployments share: success is 0 or 200, number or string. */
function isSuccessfulCode(code: unknown): boolean {
  return code === undefined || code === null || code === 0 || code === 200 || code === '0' || code === '200'
}

/**
 * Call one business endpoint and unwrap its envelope.
 * @throws PlanKeyError `network` when the call fails or the envelope refuses.
 */
async function callBiz<T>(
  url: string,
  headers: Record<string, string>,
  requestTimeoutMs: number,
  signal: AbortSignal | undefined,
  body?: string,
): Promise<T> {
  const timeout = AbortSignal.timeout(requestTimeoutMs)
  const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...body === undefined ? {} : { body },
      signal: composed,
    })
  } catch (error) {
    if (signal?.aborted === true) throw error
    throw new PlanKeyError('zhipu-plan/network', `the plan service is unreachable: ${String(error)}`)
  }
  let envelope: BizEnvelope<T>
  try {
    envelope = JSON.parse(await response.text()) as BizEnvelope<T>
  } catch {
    throw new PlanKeyError('zhipu-plan/network', `the plan service returned a non-JSON answer (HTTP ${String(response.status)})`)
  }
  if (response.status >= 400 || !isSuccessfulCode(envelope.code)) {
    const message = typeof envelope.msg === 'string' && envelope.msg.length > 0
      ? envelope.msg
      : `the plan service refused the request (HTTP ${String(response.status)})`
    throw new PlanKeyError('zhipu-plan/network', message)
  }
  return (envelope.data ?? null) as T
}

/**
 * Pick the default organization and project.
 * @throws PlanKeyError `missing-org-project` when none qualifies.
 */
function pickOrgAndProject(customerInfo: { readonly organizations?: readonly RemoteOrganization[] } | null): {
  organizationId: string
  projectId: string
} {
  const organizations = customerInfo?.organizations ?? []
  const organization = organizations.find(entry => typeof entry.organizationName === 'string' && entry.organizationName.includes(DEFAULT_ORG_NAME)) ?? organizations[0]
  const projects = organization?.projects ?? []
  const project = projects.find(entry => typeof entry.projectName === 'string' && entry.projectName.includes(DEFAULT_PROJECT_NAME)) ?? projects[0]
  const organizationId = readString(organization?.organizationId)
  const projectId = readString(project?.projectId)
  if (organizationId === undefined || projectId === undefined) {
    throw new PlanKeyError('zhipu-plan/missing-org-project', 'no organization and project could be resolved for this account')
  }
  return { organizationId, projectId }
}

/** Business headers for one authorization style, plus the team context when given. */
function bizHeaders(authorization: string, teamContext?: TeamContext): Record<string, string> {
  return {
    Authorization: authorization,
    'Content-Type': 'application/json',
    ...teamContext === undefined ? {} : {
      'bigmodel-organization': teamContext.organizationId,
      'bigmodel-project': teamContext.projectId,
    },
  }
}

/**
 * Reuse or create the plan key inside one project, then pair it with its secret.
 * @throws PlanKeyError with the deployment's refusal classes.
 */
async function ensureProjectKey(input: {
  readonly origin: string
  readonly location: { readonly organizationId: string; readonly projectId: string }
  readonly headers: Record<string, string>
  readonly keyName: string
  readonly teamKeyType: boolean
  readonly requireSecret: boolean
  readonly requestTimeoutMs: number
  readonly signal: AbortSignal | undefined
}): Promise<string> {
  const { origin, location, headers, keyName, teamKeyType, requireSecret, requestTimeoutMs, signal } = input
  const listUrl = `${origin}/api/biz/v1/organization/${encodeURIComponent(location.organizationId)}/projects/${encodeURIComponent(location.projectId)}/api_keys`
  const listed = await callBiz<readonly RemoteApiKeySummary[]>(listUrl, headers, requestTimeoutMs, signal)
  const usable = listed.find(entry =>
    entry.name === keyName && (!teamKeyType || entry.keyType === TEAM_KEY_TYPE) && readString(entry.apiKey) !== undefined)
  const summary = usable ?? await callBiz<RemoteApiKeySummary>(listUrl, headers, requestTimeoutMs, signal, JSON.stringify(
    teamKeyType ? { name: keyName, keyType: TEAM_KEY_TYPE } : { name: keyName },
  ))
  const apiKey = readString(summary.apiKey)
  if (apiKey === undefined) {
    throw new PlanKeyError('zhipu-plan/no-plan', 'the plan service returned no API key for this account')
  }
  const secretEnvelope = await callBiz<{ readonly secretKey?: unknown }>(
    `${listUrl}/copy/${encodeURIComponent(apiKey)}`,
    headers,
    requestTimeoutMs,
    signal,
  )
  const secretKey = readString(secretEnvelope.secretKey)
  if (secretKey === undefined) {
    if (requireSecret) {
      throw new PlanKeyError('zhipu-plan/no-plan', 'the plan service returned no secret for this API key')
    }
    return apiKey
  }
  return `${apiKey}.${secretKey}`
}

/**
 * Exchange the account token for the international deployment's business token.
 * @throws PlanKeyError `network` when the exchange fails, `no-plan` when no token comes back.
 */
async function exchangeZaiBusinessToken(
  account: ZhipuPlanAccountPayload,
  origins: PlanKeyOrigins,
  requestTimeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  const envelope = await callBiz<{ readonly access_token?: unknown; readonly accessToken?: unknown }>(
    `${origins.zaiApiOrigin}/api/auth/z/login`,
    { 'Content-Type': 'application/json' },
    requestTimeoutMs,
    signal,
    JSON.stringify({ token: account.accessToken }),
  )
  const bizToken = readString(envelope.access_token) ?? readString(envelope.accessToken)
  if (bizToken === undefined) {
    throw new PlanKeyError('zhipu-plan/no-plan', 'the international deployment returned no business token')
  }
  return bizToken
}

/**
 * Resolve the inference credential one signed-in account uses.
 * @param input - deployment, entitlement, account, origins, and deadlines.
 * @returns the plan key (`key.secret` where the deployment issues one) or the
 *   ZCode JWT for a Start Plan, with the organization scope a team key belongs to.
 * @throws PlanKeyError with the deployment's refusal classes.
 */
export async function resolvePlanKey(input: ResolvePlanKeyInput): Promise<PlanKeyResolution> {
  const { deployment, planKind, account, origins, requestTimeoutMs, signal } = input
  if (planKind === 'start-plan') {
    // A Start Plan infers with the relay's JWT itself; the quota API reads it as a bearer token.
    return { key: account.zcodeJwt }
  }
  const team = planKind === 'team-coding-plan'
  if (deployment === 'bigmodel') {
    const origin = origins.bigmodelApiOrigin
    const customerInfo = await callBiz<{ readonly organizations?: readonly RemoteOrganization[] }>(
      `${origin}/api/biz/customer/getCustomerInfo`,
      bizHeaders(account.accessToken),
      requestTimeoutMs,
      signal,
    )
    const location = pickOrgAndProject(customerInfo)
    const key = await ensureProjectKey({
      origin,
      location,
      headers: bizHeaders(account.accessToken, team ? location : undefined),
      keyName: team ? TEAM_KEY_NAME : INDIVIDUAL_KEY_NAME,
      teamKeyType: team,
      requireSecret: team,
      requestTimeoutMs,
      signal,
    })
    return { key, ...team ? { scope: location } : {} }
  }
  const bizToken = await exchangeZaiBusinessToken(account, origins, requestTimeoutMs, signal)
  const customerInfo = await callBiz<{ readonly organizations?: readonly RemoteOrganization[] }>(
    `${origins.zaiApiOrigin}/api/biz/customer/getCustomerInfo`,
    bizHeaders(`Bearer ${bizToken}`),
    requestTimeoutMs,
    signal,
  )
  const location = pickOrgAndProject(customerInfo)
  const key = await ensureProjectKey({
    origin: origins.zaiApiOrigin,
    location,
    headers: bizHeaders(`Bearer ${bizToken}`, team ? location : undefined),
    keyName: INDIVIDUAL_KEY_NAME,
    teamKeyType: false,
    requireSecret: true,
    requestTimeoutMs,
    signal,
  })
  return { key, ...team ? { scope: location } : {} }
}
