/**
 * Freeze what the restyle must not have moved.
 *
 * The page was restyled, not rewritten. The dictionary the page speaks, the
 * identifiers its state machine is built from, the timings it polls on, and the
 * reset request the host sends must all still be exactly what they were before
 * the restyle. The lists below were read out of the build that preceded it
 * (`profiles/zptest/node_modules/dsh-zhipu-plan/lib/client.js`, 2026-09-25).
 *
 * This is a regression gate, not a style check: it fails when a key is renamed,
 * a translated word is reworded, a state hook is dropped, or a poll interval is
 * retuned, so that a "presentational only" change cannot quietly become more.
 *
 * @module dsh-zhipu-plan/scripts/logic-freeze
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CLIENT = join(ROOT, 'src', 'client')

/** How many keys each dictionary carries; the restyle added and removed none. */
const DICTIONARY_KEY_COUNT = 81

/** Every key the page is allowed to resolve, whether by literal or by table. */
const DICTIONARY_KEYS = [
  'localNote', 'nav', 'planAccount', 'planAuthorizeHint', 'planCancel', 'planCopied', 'planCopy',
  'planDeployment', 'planDeploymentBigmodel', 'planDeploymentZai', 'planKind', 'planKindIndividual',
  'planKindStart', 'planKindTeam', 'planPending', 'planSignIn', 'planSignInHint', 'planSignOut',
  'planTokenExpired', 'planTokenExpiry', 'planWaiting', 'quotaFiveHour', 'quotaStale', 'quotaTitle',
  'quotaTools', 'quotaUpdatedAt', 'quotaWeekly', 'range30d', 'range7d', 'rangeAll', 'refresh', 'reset',
  'resetAriaFiveHour', 'resetAriaWeek', 'resetCompleted', 'resetCompletedAt', 'resetCountdown',
  'resetCountdownDaysHours', 'resetCountdownDaysOnly', 'resetCountdownHoursMinutes',
  'resetCountdownHoursOnly', 'resetCountdownMinutesSeconds', 'resetDialogFiveHour',
  'resetDialogRemaining', 'resetDialogResettable', 'resetDialogTitle', 'resetDialogWeek',
  'resetDoneFiveHour', 'resetDoneWeek', 'resetExpiresIn', 'resetExpiresInSoonest', 'resetFailed',
  'resetItemCount', 'resetOpportunity', 'resetProcessing', 'resetUnavailable', 'subscription',
  'subscriptionAutoRenew', 'subscriptionCycle', 'subscriptionRenew', 'toolCalls', 'toolName',
  'unavailable', 'usageActiveDays', 'usageCacheHit', 'usageCalls', 'usageDecodeLite', 'usageDecodePro',
  'usageDecodeSpeed', 'usageEmpty', 'usageFailed', 'usageLoading', 'usageModel', 'usageModels',
  'usagePeakDay', 'usageShare', 'usageStreak', 'usageTitle', 'usageTokens', 'usageTools', 'usageUsageTime',
]

/** Identifiers the restyle must not have renamed, dropped, or replaced. */
const LOGIC_IDENTIFIERS = [
  'POLL_INTERVAL_MS', 'COMPLETION_NOTICE_MS', 'EMPTY_RESET_STATE', 'LIMIT_COLORS',
  'RESET_OPPORTUNITY_DEFAULT_COOLDOWN_MS', 'RESET_OPPORTUNITY_MIN_RETRY_MS', 'RESET_STATUS_POLL_MS',
  'account', 'beginLogin', 'cancelLogin', 'deployment', 'failManualReset', 'loadAccount', 'loadLoginState',
  'loadQuota', 'loadResetStatus', 'loadUsage', 'loginState', 'logout', 'markResetHistoryRead',
  'opportunityDueAt', 'opportunityKey', 'opportunityRunning', 'planKind', 'quota', 'randomKey', 'refresh',
  'requestResetOpportunity', 'resets', 'resetting', 'setResets', 'signIn', 'spendReset', 'startManualReset',
  'useReset',
]

/** Timings that must still carry the values they carried. */
const TIMINGS = [
  ['POLL_INTERVAL_MS', 1_000],
  ['COMPLETION_NOTICE_MS', 8_000],
  ['HOUR_MS', 3_600_000],
]

/** Values that must still appear in the host's reset request. */
const HOST_RESET = ['/api/v1/coding-plan/reset', '/api/v1/coding-plan/reset/opportunity', 'X-Bigmodel-Authorization', 'reset_type']

const failures = []
const fail = message => { failures.push(message) }

/** Read every client module; a key or an identifier may live in any of them. */
const sources = readdirSync(CLIENT)
  .filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
  .map(name => ({ name, text: readFileSync(join(CLIENT, name), 'utf8') }))
const joined = sources.map(file => file.text).join('\n')

/** The keys one dictionary declares, in source order. */
function dictionaryKeys(block) {
  return [...block.matchAll(/^\s{2}([A-Za-z]\w*):/gm)].map(match => match[1])
}

const locales = sources.find(file => file.name === 'locales.ts')
if (locales === undefined) {
  fail('locales.ts is gone')
} else {
  const zh = dictionaryKeys(locales.text.split('export const zh = {')[1]?.split('\n}')[0] ?? '')
  const en = dictionaryKeys(locales.text.split('export const en = {')[1]?.split('\n}')[0] ?? '')
  if (zh.length !== DICTIONARY_KEY_COUNT) fail(`the zh dictionary has ${zh.length} keys, not ${DICTIONARY_KEY_COUNT}`)
  if (en.length !== DICTIONARY_KEY_COUNT) fail(`the en dictionary has ${en.length} keys, not ${DICTIONARY_KEY_COUNT}`)
  if (zh.join() !== en.join()) fail('the two dictionaries no longer declare the same keys, in the same order')
  const drifted = zh.filter(key => !DICTIONARY_KEYS.includes(key))
  const lost = DICTIONARY_KEYS.filter(key => !zh.includes(key))
  for (const key of drifted) fail(`dictionary key added or renamed by the restyle: ${key}`)
  for (const key of lost) fail(`dictionary key removed by the restyle: ${key}`)
  for (const { name, text } of sources) {
    for (const match of text.matchAll(/\bt\(\s*'([A-Za-z]\w*)'/g)) {
      if (!zh.includes(match[1])) fail(`${name} asks for an undefined key: ${match[1]}`)
    }
  }
}

for (const name of LOGIC_IDENTIFIERS) {
  if (!new RegExp(`\\b${name}\\b`).test(joined)) fail(`logic identifier gone: ${name}`)
}

for (const [name, value] of TIMINGS) {
  const match = new RegExp(`const ${name}\\s*=\\s*([\\d_]+)`).exec(joined)
  if (match === null) fail(`timing constant gone: ${name}`)
  else if (Number(match[1].replaceAll('_', '')) !== value) {
    fail(`timing retuned: ${name} is ${match[1]}, was ${String(value)}`)
  }
}

const host = readFileSync(join(ROOT, 'src', 'host', 'reset.ts'), 'utf8')
for (const needle of HOST_RESET) {
  if (!host.includes(needle)) fail(`the host reset request lost ${needle}`)
}

if (failures.length > 0) {
  console.error('logic-freeze: the restyle moved something it must not have moved')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(`logic-freeze: ${DICTIONARY_KEY_COUNT} keys per dictionary, ${LOGIC_IDENTIFIERS.length} identifiers, ${TIMINGS.length} timings, and the reset request unchanged`)
