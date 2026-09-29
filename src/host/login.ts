/**
 * One sign-in attempt: open a relay flow, hand the authorize address to the
 * human, and poll until the flow finishes, fails, or runs out of time.
 *
 * The runner is transport-agnostic — the relay and the clock are injected — so
 * the relay's states (`pending` → `ready`, `failed`, timeouts, refused calls)
 * are testable without network. Transport refusals split by class: a server
 * answer (5xx) or an unreachable relay is retried until the deadline, a client
 * refusal (4xx, business code, unusable data) ends the attempt at once, and a
 * human cancellation propagates untouched.
 *
 * @module dsh-zhipu-plan/host/login
 */

import { RelayError, ZhipuAuthRelay, type RelayFlow, type RelayPollReady } from './relay.ts'
import type { ZhipuPlanDeployment } from './types.ts'

/** Why one attempt did not end in a signed-in account. */
export type LoginFailureKind =
  /** The relay closed the flow without issuing tokens. */
  | 'auth-failed'
  /** The attempt outlived its deadline or the flow's own expiry. */
  | 'auth-timeout'
  /** The relay refused a call in a way retrying cannot fix. */
  | 'auth-rejected'

/** A finished attempt that did not sign in. */
export class LoginError extends Error {
  /**
   * @param kind - why the attempt ended without tokens.
   * @param message - what happened, safe to show the user.
   */
  constructor(readonly kind: LoginFailureKind, message: string) {
    super(message)
    this.name = 'LoginError'
  }
}

/** Clock and sleep seams, injected so deadline behaviour is testable. */
export interface LoginClock {
  /** @returns the current epoch milliseconds. */
  now(): number
  /**
   * Wait one interval, or until the signal aborts.
   * @param ms - milliseconds to wait.
   * @param signal - cancellation observed while waiting.
   */
  sleep(ms: number, signal: AbortSignal | undefined): Promise<void>
}

/** Inputs for one attempt. */
export interface RunLoginAttemptInput {
  readonly relay: ZhipuAuthRelay
  readonly deployment: ZhipuPlanDeployment
  /** The attempt's poll token; the relay binds the flow to it. */
  readonly pollToken: string
  readonly clock: LoginClock
  /** Overall attempt deadline in milliseconds, measured from the attempt's start. */
  readonly timeoutMs: number
  readonly signal: AbortSignal | undefined
  /** Floor for the relay's poll interval, milliseconds; tests poll faster than production. */
  readonly minPollIntervalMs?: number
  /**
   * Report the flow's authorize address once the relay has opened it.
   * @param flow - the opened flow.
   */
  readonly onAuthorizeUrl?: (flow: RelayFlow) => void
}

/**
 * Run one sign-in attempt to its end.
 * @param input - relay, deployment, poll token, clock, deadline, and the address callback.
 * @returns the finished sign-in.
 * @throws LoginError when the flow fails, the attempt times out, or the relay refuses.
 * @throws Error untouched when the caller cancels.
 */
export async function runLoginAttempt(input: RunLoginAttemptInput): Promise<RelayPollReady> {
  const { relay, deployment, pollToken, clock, timeoutMs, signal } = input
  const minPollIntervalMs = input.minPollIntervalMs ?? 250
  signal?.throwIfAborted()
  const startedAt = clock.now()
  const flow = await relay.init(deployment, pollToken, signal)
  input.onAuthorizeUrl?.(flow)
  // The attempt ends at the earlier of its own deadline and the flow's expiry.
  const flowExpiresAtMs = flow.expiresAtSec * 1_000
  const deadlineMs = Math.min(startedAt + timeoutMs, flowExpiresAtMs)
  const pollIntervalMs = Math.max(minPollIntervalMs, flow.pollIntervalSec * 1_000)

  for (;;) {
    signal?.throwIfAborted()
    if (clock.now() >= deadlineMs) {
      throw new LoginError('auth-timeout', 'Authorization timed out. Please retry the sign-in.')
    }
    await clock.sleep(pollIntervalMs, signal)
    signal?.throwIfAborted()
    let answer
    try {
      answer = await relay.poll(deployment, flow.flowId, pollToken, signal)
    } catch (error) {
      if (signal?.aborted === true) throw error
      if (!(error instanceof RelayError) || error.details.retryable !== true) {
        // A 4xx, a business refusal, or an unusable answer will not improve by polling again.
        throw new LoginError('auth-rejected', error instanceof Error ? error.message : String(error))
      }
      void error
      if (clock.now() >= deadlineMs) {
        throw new LoginError('auth-timeout', 'Authorization timed out. Please retry the sign-in.')
      }
      // An unreachable relay or a 5xx answer may recover; keep polling.
      continue
    }
    if (answer.status === 'ready') return answer
    if (answer.status === 'failed') {
      throw new LoginError('auth-failed', 'Authorization failed. The sign-in was not completed.')
    }
  }
}
