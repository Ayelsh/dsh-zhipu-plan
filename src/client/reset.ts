/**
 * The reset state the plan page shows, and how often it is re-read.
 *
 * Two facts decide what a user sees. The first is the resets the deployment
 * itself reports — `/reset/status` lists the unspent ones with their expiry,
 * so a granted reset simply appears; that is the normal path, and nothing is
 * claimed by hand. The second is the eligibility poll ZCode runs alongside it:
 * when the account has spent nothing yet and the deployment is willing to hand
 * out a reset, a background request asks for one. That poll is throttled by the
 * deployment and by the cooldowns below, which is why the state machine keeps a
 * retry key and a next-check instant rather than asking on every render.
 *
 * A manual reset is confirmed by the deployment, never by the call that asked
 * for it: the state stays `processing` until the status reports a newer
 * `usedAt`, so a stale status read cannot make a spent reset look available.
 *
 * @module dsh-zhipu-plan/client/reset
 */

import type { PlanResetKind, PlanResetStatus } from './plan-types.ts'

/** How often the reset status is re-read while the page is open. */
export const RESET_STATUS_POLL_MS = 5 * 60_000

/** Shortest wait before asking for an opportunity again. */
export const RESET_OPPORTUNITY_MIN_RETRY_MS = 5 * 60_000

/** Wait after a refusal that carried no retry instant. */
export const RESET_OPPORTUNITY_DEFAULT_COOLDOWN_MS = 10 * 60_000

/** Wait after a transport failure worth retrying with the same key. */
export const RESET_OPPORTUNITY_TRANSIENT_RETRY_MS = 5 * 60_000

/** Wait after a failure that retrying cannot fix. */
export const RESET_OPPORTUNITY_STABLE_COOLDOWN_MS = 10 * 60_000

/** One reset window's view state. */
export interface ResetWindowState {
  /** `idle` hides the entry; `processing` waits for the deployment to confirm. */
  readonly status: 'idle' | 'available' | 'processing' | 'completed'
  /** Unspent resets the deployment reports for this window. */
  readonly count: number
  /** When the earliest unspent reset expires, epoch milliseconds. */
  readonly expiresAt?: number
  /** When the deployment says the last reset was spent. */
  readonly usedAt?: number
  /** The `usedAt` value the surface has already shown, so it is not celebrated twice. */
  readonly acknowledgedAt?: number
  /** Idempotency key of the in-flight manual reset, reused when it is retried. */
  readonly idempotencyKey?: string
  /** Why the last manual reset failed, as copy the surface shows. */
  readonly error?: string
}

/** The two windows this page tracks, and their state before anything is read. */
export interface ResetState {
  readonly fiveHour: ResetWindowState
  readonly week: ResetWindowState
}

/** The state both windows start in. */
export const EMPTY_RESET_STATE: ResetState = Object.freeze({
  fiveHour: Object.freeze({ status: 'idle', count: 0 }) as ResetWindowState,
  week: Object.freeze({ status: 'idle', count: 0 }) as ResetWindowState,
})

/**
 * The unspent resets of one window that have not expired yet.
 * @param opportunities - the window's resets as the deployment reported them.
 * @param now - current epoch milliseconds.
 * @returns the live ones, earliest expiry first.
 */
function liveOpportunities(
  opportunities: PlanResetStatus['fiveHour'],
  now: number,
): { readonly expireAt: number }[] {
  return opportunities.filter(entry => entry.expireAt > now).sort((left, right) => left.expireAt - right.expireAt)
}

/**
 * Fold a fresh status read into one window's state.
 *
 * The deployment's own list wins whenever it holds a live reset, because that
 * is a reset the user may spend right now. A missing list means the last one
 * was spent (or none was ever granted), which the status reports as `usedAt`;
 * that value is compared against what the surface already showed so a
 * completion is celebrated once, not on every poll.
 *
 * @param previous - the window's state before this read.
 * @param status - the fresh status, or undefined when the read failed.
 * @param kind - which window this state belongs to.
 * @param now - current epoch milliseconds.
 * @returns the window's state after the read.
 */
export function foldResetStatus(
  previous: ResetWindowState,
  status: PlanResetStatus | undefined,
  kind: PlanResetKind,
  now: number,
): ResetWindowState {
  if (status === undefined) return previous
  const live = liveOpportunities(kind === 'five_hour' ? status.fiveHour : status.week, now)
  const usedAt = kind === 'five_hour' ? status.fiveHourUsedAt : status.weekUsedAt
  const earliest = live[0]
  if (earliest !== undefined) {
    // A live reset means a new cycle: whatever the previous state was, there is
    // something to spend now, and the completion for the earlier one is history.
    return {
      status: 'available',
      count: live.length,
      expiresAt: earliest.expireAt,
      ...usedAt === undefined ? {} : { usedAt },
      ...usedAt === undefined ? {} : { acknowledgedAt: usedAt },
    }
  }
  if (previous.status === 'processing') {
    // The status may still describe the moment before the reset was spent;
    // only a newer `usedAt` confirms it.
    if (usedAt !== undefined && usedAt > (previous.usedAt ?? 0)) {
      return { status: 'completed', count: 0, usedAt, acknowledgedAt: usedAt }
    }
    return previous
  }
  if (usedAt !== undefined && usedAt !== previous.acknowledgedAt) {
    return { status: 'completed', count: 0, usedAt, acknowledgedAt: usedAt }
  }
  if (usedAt !== undefined) return { status: 'completed', count: 0, usedAt, acknowledgedAt: usedAt }
  return { status: 'idle', count: 0 }
}

/**
 * Mark one window as spending a reset. The deployment confirms it later.
 * @param state - the window's state.
 * @param idempotencyKey - the key this attempt is made under.
 * @returns the state while the reset is in flight.
 */
export function startManualReset(state: ResetWindowState, idempotencyKey: string): ResetWindowState {
  return {
    ...state,
    status: 'processing',
    idempotencyKey: state.idempotencyKey ?? idempotencyKey,
    ...state.error === undefined ? {} : { error: undefined },
  }
}

/**
 * Restore a window whose reset was refused, keeping the key so a retry spends
 * the same reset rather than a second one.
 * @param state - the window's state.
 * @param error - the copy explaining the refusal.
 * @returns the state the surface offers again.
 */
export function failManualReset(state: ResetWindowState, error: string): ResetWindowState {
  return { ...state, status: 'available', error }
}

/** Whether the surface should offer a reset action for one window. */
export function canReset(state: ResetWindowState): boolean {
  return state.status === 'available' && state.count > 0
}

/**
 * Seconds left before one instant, never negative.
 * @param expiresAt - the instant, epoch milliseconds.
 * @param now - current epoch milliseconds.
 * @returns whole seconds remaining.
 */
export function remainingSeconds(expiresAt: number | undefined, now: number): number {
  if (expiresAt === undefined) return 0
  return Math.max(0, Math.ceil((expiresAt - now) / 1_000))
}

/**
 * Countdown text for a remaining number of seconds, choosing the two units
 * that matter at that scale.
 * @param totalSeconds - seconds remaining.
 * @param t - this page's copy seat.
 * @returns the localized countdown.
 */
export function countdownText(
  totalSeconds: number,
  t: (key: 'resetCountdownDaysHours' | 'resetCountdownDaysOnly' | 'resetCountdownHoursMinutes'
    | 'resetCountdownHoursOnly' | 'resetCountdownMinutesSeconds', params?: Record<string, unknown>) => string,
): string {
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const values = { days, hours, minutes, seconds }
  if (days > 0) return hours > 0 ? t('resetCountdownDaysHours', values) : t('resetCountdownDaysOnly', values)
  if (hours > 0) return minutes > 0 ? t('resetCountdownHoursMinutes', values) : t('resetCountdownHoursOnly', values)
  return t('resetCountdownMinutesSeconds', values)
}
