/**
 * How the plan's quota buckets are found and shown.
 *
 * The deployment reports a flat list of buckets whose identity lives in
 * `type`/`unit`/`number`, so this module is the one place that knows which
 * bucket is the five-hour window and which is the weekly one, and the one
 * place that turns a bucket into what a user reads. It follows ZCode's own
 * presentation rules: the same bucket identities, the same reading of
 * `percentage` (spent, so displayed remaining is its complement), the same
 * adaptive reset-time format, and the same "a full bucket has nothing to
 * reset" rule that hides the reset entry.
 *
 * @module dsh-zhipu-plan/client/quota
 */

import type { PlanQuotaLimit } from './plan-types.ts'

/**
 * Token buckets: the mainland backend reports `TOKENS_LIMIT`, the
 * international one `CREDIT_LIMIT`, with identical unit/number meanings.
 */
const TOKEN_LIMIT_TYPES = new Set(['TOKENS_LIMIT', 'CREDIT_LIMIT'])

/** Tool buckets; both backends report the monthly tool quota as `TIME_LIMIT`. */
const TOOL_LIMIT_TYPES = new Set(['TIME_LIMIT'])

/**
 * Whether a reported bucket answers a query for one category.
 * @param reported - the bucket's own `type`.
 * @param queried - the category being looked for.
 * @returns true when the two name the same category.
 */
function isSameLimitCategory(reported: string, queried: string): boolean {
  if (reported === queried) return true
  if (TOKEN_LIMIT_TYPES.has(queried)) return TOKEN_LIMIT_TYPES.has(reported)
  if (TOOL_LIMIT_TYPES.has(queried)) return TOOL_LIMIT_TYPES.has(reported)
  return false
}

/**
 * Find one bucket among the snapshot's limits.
 * @param limits - the snapshot's buckets.
 * @param type - the category to look for.
 * @param unit - the bucket's unit.
 * @param number - the bucket's size, when the deployment distinguishes several.
 * @returns the bucket, or null when the deployment does not report it.
 */
export function findLimit(
  limits: readonly PlanQuotaLimit[],
  type: string,
  unit: number,
  number?: number,
): PlanQuotaLimit | null {
  return limits.find(limit =>
    isSameLimitCategory(limit.type, type)
    && limit.unit === unit
    && (number === undefined || limit.number === number)) ?? null
}

/** The five-hour prompt pool. */
export function fiveHourLimit(limits: readonly PlanQuotaLimit[]): PlanQuotaLimit | null {
  return findLimit(limits, 'TOKENS_LIMIT', 3, 5)
}

/** The weekly pool. */
export function weeklyLimit(limits: readonly PlanQuotaLimit[]): PlanQuotaLimit | null {
  return findLimit(limits, 'TOKENS_LIMIT', 6)
}

/** The monthly tool allowance. */
export function toolLimit(limits: readonly PlanQuotaLimit[]): PlanQuotaLimit | null {
  return findLimit(limits, 'TIME_LIMIT', 5, 1)
}

/**
 * How much of one bucket is left, in percent.
 * @param limit - the bucket, or null when the deployment reports none.
 * @returns 0-100, or null when the bucket carries no usable share.
 */
export function remainingPercentage(limit: PlanQuotaLimit | null): number | null {
  if (limit === null || typeof limit.percentage !== 'number' || !Number.isFinite(limit.percentage)) return null
  return Math.max(0, Math.min(100, 100 - limit.percentage))
}

/**
 * Whether a bucket is untouched, and therefore has nothing a reset could give
 * back. The reset entry is hidden for it rather than offered and refused.
 * @param limit - the bucket, or null.
 * @returns true when the bucket still has all of its allowance.
 */
export function isLimitFull(limit: PlanQuotaLimit | null): boolean {
  return remainingPercentage(limit) === 100
}

/**
 * Remaining-share text (`87%`, `9.5%`).
 * @param locale - the locale to format in.
 * @param limit - the bucket, or null.
 * @returns the percentage text, or `--` when the bucket reports none.
 */
export function remainingText(locale: string, limit: PlanQuotaLimit | null): string {
  const remaining = remainingPercentage(limit)
  if (remaining === null) return '--'
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: remaining >= 10 ? 0 : 1,
  }).format(remaining)}%`
}

/**
 * When a bucket refills: the clock time when that is still today, the date
 * otherwise — the moment is actionable today, the day is what matters later.
 * @param locale - the locale to format in.
 * @param value - the reset instant, epoch milliseconds.
 * @param style - `adaptive` for the cards, `dateTime` for the detail list.
 * @returns the formatted instant, or undefined when the bucket reports none.
 */
export function resetTimeText(
  locale: string,
  value: number | undefined,
  style: 'adaptive' | 'dateTime' = 'adaptive',
): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return undefined
  if (style === 'dateTime') {
    return new Intl.DateTimeFormat(locale, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(at)
  }
  const now = new Date()
  const isToday = at.getFullYear() === now.getFullYear()
    && at.getMonth() === now.getMonth()
    && at.getDate() === now.getDate()
  return isToday
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
    : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(at)
}

/** The palette the quota cards and the reset dialog share, one colour per bucket. */
export const LIMIT_COLORS = {
  fiveHour: 'var(--dsw-alias-brand-primary)',
  weekly: 'var(--dsw-alias-state-business-primary)',
  tools: 'var(--dsw-alias-state-success-primary)',
} as const
