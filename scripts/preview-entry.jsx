/**
 * Fixtures and mount points for the rendered preview of the plan page.
 *
 * The shapes are the wire shapes the host sends; the numbers are a realistic
 * month on a Pro coding plan, so the cards, the tables, and the reset dialog
 * all have something to show.
 *
 * @module dsh-zhipu-plan/scripts/preview-entry
 */

import { createRoot } from 'react-dom/client'
import { PlanPanel } from '../src/client/PlanPanel.tsx'
import { STYLE_SHEET } from '../src/client/styles.ts'

export { STYLE_SHEET }

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = Date.now()

const account = {
  deployment: 'bigmodel',
  planKind: 'individual-coding-plan',
  accountId: '00000000000000000',
  accountLabel: 'Example User',
  jwtExpired: false,
  jwtExpiresAt: NOW + 6 * DAY,
}

const quota = {
  deployment: 'bigmodel',
  fetchedAt: NOW,
  stale: false,
  level: 'pro',
  limits: [
    { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 38, nextResetTime: NOW + 2 * HOUR },
    { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 71, nextResetTime: NOW + 3 * DAY },
    {
      type: 'TIME_LIMIT',
      unit: 5,
      number: 1,
      usage: 1000,
      currentValue: 212,
      remaining: 788,
      percentage: 21,
      nextResetTime: NOW + 20 * DAY,
      usageDetails: [
        { modelCode: 'search-prime', usage: 128 },
        { modelCode: 'web-reader', usage: 61 },
        { modelCode: 'zread', usage: 23 },
      ],
    },
  ],
}

const resetStatus = {
  fiveHour: [{ expireAt: NOW + 5 * HOUR }],
  week: [],
  fiveHourUsedAt: NOW - 9 * HOUR,
  weekUsedAt: NOW - 2 * DAY,
  hasUnreadHistory: false,
}

const usage = {
  range: '7d',
  fetchedAt: NOW,
  models: {
    days: ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'],
    calls: 412,
    tokens: 1_560_000,
    models: [
      { model: 'glm-4.6', tokens: 1_240_000 },
      { model: 'glm-4.5-air', tokens: 320_000 },
    ],
  },
  tools: {
    searches: 34,
    webReads: 12,
    zreads: 5,
    tools: [
      { tool: 'web_search', calls: 34 },
      { tool: 'web_reader', calls: 12 },
      { tool: 'zread', calls: 5 },
    ],
  },
  activity: {
    days: [
      { date: '2026-09-16', tokens: 120_000, mcpCalls: 4 },
      { date: '2026-09-17', tokens: 210_000, mcpCalls: 9 },
      { date: '2026-09-18', tokens: 320_000, mcpCalls: 11 },
      { date: '2026-09-19', tokens: 90_000, mcpCalls: 2 },
      { date: '2026-09-20', tokens: 0, mcpCalls: 0 },
      { date: '2026-09-21', tokens: 410_000, mcpCalls: 14 },
      { date: '2026-09-22', tokens: 180_000, mcpCalls: 6 },
    ],
    totalTokens: 1_560_000,
    peakDayTokens: 410_000,
    peakDay: '2026-09-21',
    totalUsageMs: 5 * HOUR + 20 * 60_000,
    currentStreakDays: 4,
    longestStreakDays: 9,
  },
  credits: { cacheHitRate: 0.62, offPeakRate: 0.31, totalCredits: 128 },
  decodeSpeed: { days: ['2026-09-21', '2026-09-22'], proMax: [0, 46.2], lite: [0, 38.5] },
  subscriptions: [
    {
      productName: 'GLM Coding Pro',
      status: 'active',
      inCurrentPeriod: true,
      autoRenew: true,
      renewTime: '2026-10-19',
      billingCycle: 'monthly',
    },
  ],
}

/** An answered all-time window: the year of activity with the latest month of breakdowns. */
const yearActivity = Array.from({ length: 366 }, (_, index) => {
  const date = new Date(NOW - (365 - index) * DAY)
  const tokens = index % 43 === 0 ? 0 : 60_000 + ((index * 37_000) % 480_000)
  return {
    date: date.toISOString().slice(0, 10),
    tokens,
    mcpCalls: index % 11,
  }
})

const allUsage = {
  range: 'all',
  fetchedAt: NOW,
  models: {
    days: usage.models.days,
    calls: 3_284,
    tokens: 12_940_000,
    models: [
      { model: 'glm-4.6', tokens: 9_820_000 },
      { model: 'glm-4.5-air', tokens: 2_140_000 },
      { model: 'glm-4.5-flash', tokens: 980_000 },
    ],
  },
  tools: usage.tools,
  activity: {
    days: yearActivity,
    totalTokens: yearActivity.reduce((sum, day) => sum + day.tokens, 0),
    peakDayTokens: 612_000,
    peakDay: '2026-08-14',
    totalUsageMs: 96 * HOUR + 40 * 60_000,
    currentStreakDays: 12,
    longestStreakDays: 47,
  },
  credits: usage.credits,
  decodeSpeed: usage.decodeSpeed,
  subscriptions: usage.subscriptions,
}

/**
 * The read the mounted page gets: an answered window, a window that is still
 * being read, a read that failed, or the all-time answer above.
 * @param options - the scenario being rendered.
 * @returns the host read for that scenario.
 */
function usageRead(options) {
  if (options.usage === 'pending') return () => new Promise(() => {})
  if (options.usage === 'failed') return async () => undefined
  if (options.usage === 'all') return async range => ({ ...allUsage, range })
  return async () => usage
}

/** The copy seat, resolving keys to the dictionary text for the chosen language. */
function translate(dictionary) {
  return (key, params) => {
    const text = dictionary[key] ?? key
    if (params === undefined) return text
    return text.replace(/\{(\w+)\}/gu, (_match, name) => String(params[name] ?? ''))
  }
}

/**
 * Mount the plan page into one element.
 * @param element - the element to render into.
 * @param options - the scenario to render, its copy, and its BCP 47 locale id.
 */
export function mount(element, options) {
  const t = translate(options.dictionary)
  const props = {
    t,
    loadAccount: async () => account,
    loginState: options.loginState,
    beginLogin: async () => {},
    loadLoginState: async () => options.loginState,
    cancelLogin: async () => {},
    logout: async () => {},
    loadQuota: async () => quota,
    loadUsage: usageRead(options),
    loadResetStatus: async () => resetStatus,
    useReset: async () => {},
    requestResetOpportunity: async () => ({ granted: false, nextTryAt: Date.now() + 10 * 60_000 }),
    markResetHistoryRead: async () => {},
    currentLocale: () => options.localeId,
  }
  if (options.account === false) props.loadAccount = async () => undefined
  createRoot(element).render(<PlanPanel {...props} />)
}
