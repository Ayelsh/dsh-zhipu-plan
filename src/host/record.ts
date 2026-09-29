/**
 * The stored account record this plugin owns: its address, its payload format,
 * and the parse that guards every read. The payload is written only here and
 * read only through {@link readAccountPayload}, so a record left by an older
 * layout fails closed instead of feeding a half-typed account to a caller.
 *
 * @module dsh-zhipu-plan/host/record
 */

import { credentialKey, type CredentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { ZhipuPlanDeployment, ZhipuPlanKind } from './types.ts'

/**
 * Record scope every credential this plugin stores is written under. It is the
 * owner name, which is what tells a later reader — a configuration surface, or
 * a second plugin serving the same deployment — that this plugin owns the
 * payload format inside the record.
 */
export const RECORD_SCOPE = 'zhipu-plan'

/** Record id of the signed-in account. One account per deployment is served at a time. */
export const ACCOUNT_RECORD_ID = 'account'

/** Owner-defined payload of the account grant record. Never crosses the Remote wire. */
export interface ZhipuPlanAccountPayload {
  /** Deployment the account was authorized against. */
  readonly deployment: ZhipuPlanDeployment
  /** Entitlement resolved for this account. */
  readonly planKind: ZhipuPlanKind
  /** Account identifier as the deployment reports it. */
  readonly accountId: string
  /** Display label for the account, masked for presentation by the host. */
  readonly accountLabel: string
  /** Account access token used by deployment business endpoints. */
  readonly accessToken: string
  /** ZCode JWT issued by the authorization relay; empty when the flow returned none. */
  readonly zcodeJwt: string
  /** Access-token expiry as epoch milliseconds, when the deployment reported one. */
  readonly accessTokenExpiresAt: number | undefined
  /** ZCode JWT expiry as epoch milliseconds, when the token carries one. */
  readonly jwtExpiresAt: number | undefined
  /**
   * Organization the resolved plan key belongs to, when the plan is scoped to
   * one (team plans). Monitor reads carry it so a multi-organization account
   * reads the project its key was issued for rather than a default one.
   */
  readonly organizationId?: string
  /** Project the resolved plan key belongs to; present exactly when {@link organizationId} is. */
  readonly projectId?: string
  /** When this record was written, epoch milliseconds. */
  readonly signedInAt: number
}

/**
 * Record address of the signed-in account.
 * @returns the credential key the login flow writes and this service reads.
 */
export function accountRecordKey(): CredentialKey {
  return credentialKey(RECORD_SCOPE, ACCOUNT_RECORD_ID)
}

function isDeployment(value: unknown): value is ZhipuPlanDeployment {
  return value === 'bigmodel' || value === 'zai'
}

function isPlanKind(value: unknown): value is ZhipuPlanKind {
  return value === 'individual-coding-plan' || value === 'team-coding-plan' || value === 'start-plan'
}

function optionalTime(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Read the account payload out of a stored record.
 * @param record - the record read from the credential store, if any.
 * @returns the parsed payload, or undefined when nothing is stored.
 * @throws Error when a record exists but does not carry this plugin's payload.
 */
export function readAccountPayload(record: CredentialRecord | undefined): ZhipuPlanAccountPayload | undefined {
  if (record === undefined) return undefined
  if (record.kind !== 'grant') throw new Error('zhipu plan: the stored account record is not a grant')
  const payload = record.payload
  if (typeof payload !== 'object' || payload === null) throw new Error('zhipu plan: the stored account payload is not an object')
  const fields = payload as Record<string, unknown>
  const { deployment, planKind, accountId, accountLabel, accessToken, zcodeJwt } = fields
  if (!isDeployment(deployment)) throw new Error('zhipu plan: the stored account names an unknown deployment')
  if (!isPlanKind(planKind)) throw new Error('zhipu plan: the stored account names an unknown plan kind')
  if (typeof accountId !== 'string' || accountId === '') throw new Error('zhipu plan: the stored account has no identifier')
  if (typeof accountLabel !== 'string') throw new Error('zhipu plan: the stored account has no label')
  if (typeof accessToken !== 'string' || accessToken === '') throw new Error('zhipu plan: the stored account has no access token')
  if (typeof zcodeJwt !== 'string') throw new Error('zhipu plan: the stored account has no ZCode JWT field')
  const signedInAt = optionalTime(fields.signedInAt)
  if (signedInAt === undefined) throw new Error('zhipu plan: the stored account has no sign-in time')
  const scope = organizationScope(fields)
  return {
    deployment,
    planKind,
    accountId,
    accountLabel,
    accessToken,
    zcodeJwt,
    accessTokenExpiresAt: optionalTime(fields.accessTokenExpiresAt),
    jwtExpiresAt: optionalTime(fields.jwtExpiresAt),
    ...scope === undefined ? {} : scope,
    signedInAt,
  }
}

/** The stored organization/project pair; both fields must be present and non-empty. */
function organizationScope(
  fields: Record<string, unknown>,
): { readonly organizationId: string; readonly projectId: string } | undefined {
  const { organizationId, projectId } = fields
  if (organizationId === undefined && projectId === undefined) return undefined
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw new Error('zhipu plan: the stored account names an organization without an id')
  }
  if (typeof projectId !== 'string' || projectId === '') {
    throw new Error('zhipu plan: the stored account names a project without an id')
  }
  return { organizationId, projectId }
}
