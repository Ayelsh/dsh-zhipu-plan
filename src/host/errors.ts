/**
 * Stable failure vocabulary for the Zhipu coding-plan account. Every code is
 * one a caller can branch on: a surface offers re-sign-in for `not-signed-in`
 * and `token-expired`, and shows the message for the rest.
 *
 * @module dsh-zhipu-plan/host/errors
 */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** Every failure the plan account can report, as the wire codes a caller branches on. */
export type ZhipuPlanErrorCode =
  /** A request was malformed, or a stored record or mounted seam is missing or unreadable. */
  | 'zhipu-plan/rejected'
  /** The operation needs a signed-in account and none is stored. */
  | 'zhipu-plan/not-signed-in'
  /** The account holds no coding-plan entitlement the server recognizes. */
  | 'zhipu-plan/no-plan'
  /** The account's organization or project could not be resolved for a plan key. */
  | 'zhipu-plan/missing-org-project'
  /** The stored token has passed its reported expiry. */
  | 'zhipu-plan/token-expired'
  /** The deployment or relay could not be reached. */
  | 'zhipu-plan/network'

/**
 * Build one plan-account failure with its wire code.
 * @param code - the failure class a caller branches on.
 * @param message - what happened, safe to show the user.
 * @param options - the machine-readable reason and the underlying error.
 * @returns the error to throw or return.
 */
export function zhipuPlanError(
  code: ZhipuPlanErrorCode,
  message: string,
  options: { readonly reason?: string; readonly cause?: unknown } = {},
): RemoteError {
  return new RemoteError(code, message, { reason: options.reason ?? code }, options.cause === undefined ? {} : { cause: options.cause })
}
