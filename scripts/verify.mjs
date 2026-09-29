/**
 * Check the built plugin against a deepseek-harness checkout.
 *
 * `pnpm run build` already checks this package against itself. This script
 * checks it against the application it will run inside, using the two pieces
 * that decide whether it loads at all:
 *
 * - the host half is imported with `@deepseek-ai/*` resolved to the harness
 *   workspace (the same packages the profile's module fallback links point at),
 *   so a missing or misspelled import fails here instead of in the application;
 * - the published Typert manifest is handed to the loader's own
 *   `validateTypertManifest`, which is what the running Host calls before it
 *   registers the endpoints.
 *
 * Usage: `node scripts/verify.mjs [path-to-harness-checkout]`
 *
 * @module dsh-zhipu-plan/scripts/verify
 */

import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HARNESS = resolve(process.argv[2] ?? join(ROOT, '..', '..', 'deepseek-harness'))

/** Workspace package directories behind the bare specifiers the host half imports. */
const LINKS = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/schemastery': 'vendor/schemastery',
  '@deepseek-ai/dsh-credentials': 'packages/credentials/credentials',
  '@deepseek-ai/dsh-typert-protocol': 'packages/typert/protocol',
  'zod': null,
}

/**
 * Fail the verification with one named defect.
 * @param message - what is wrong.
 */
function fail(message) {
  throw new Error(`verify: ${message}`)
}

if (!existsSync(join(HARNESS, 'package.json'))) fail(`${HARNESS} is not a deepseek-harness checkout`)
for (const relative of ['lib/index.js', 'lib/typert.js', 'lib/client.js']) {
  if (!existsSync(join(ROOT, relative))) fail(`${relative} is missing — run \`pnpm run build\` first`)
}

// Resolution mirrors the profile the plugin installs into: the harness packages
// are linked beside it rather than declared as dependencies, exactly as the
// profile's module fallback links do at runtime.
const scope = join(ROOT, 'node_modules', '@deepseek-ai')
mkdirSync(scope, { recursive: true })
for (const [specifier, relative] of Object.entries(LINKS)) {
  if (relative === null) continue
  const target = join(HARNESS, relative)
  if (!existsSync(join(target, 'package.json'))) fail(`${specifier} is not built in the harness checkout (${target})`)
  const link = join(ROOT, 'node_modules', specifier)
  rmSync(link, { force: true, recursive: true })
  symlinkSync(target, link, 'dir')
}

const service = (await import(pathToFileURL(join(ROOT, 'lib/index.js')).href)).default
if (typeof service !== 'function') fail('lib/index.js has no default-exported service class')
if (service.name !== 'ZhipuPlanService') fail(`lib/index.js exports ${service.name}, not ZhipuPlanService`)
if (!Array.isArray(service.inject)) fail('the service declares no inject list')
for (const required of ['credentials', 'authorization']) {
  if (!service.inject.includes(required)) fail(`the service does not inject ${required}`)
}

const { TYPERT } = await import(pathToFileURL(join(ROOT, 'lib/typert.js')).href)
const loader = await import(pathToFileURL(join(HARNESS, 'packages/typert/loader/lib/index.js')).href)
if (typeof loader.validateTypertManifest !== 'function') {
  fail('the harness typert-loader does not export validateTypertManifest')
}
try {
  loader.validateTypertManifest('dsh-zhipu-plan', TYPERT)
} catch (error) {
  fail(`the loader refused the published manifest: ${error.message}`)
}

/**
 * The credential store's payload rule, mirrored from
 * `packages/credentials/credentials-local/src/index.ts` (`assertJsonValue`,
 * which is not exported): a grant payload may hold only values JSON can
 * represent, and an own property whose value is `undefined` is not one. A
 * payload that fails this rule is refused at write time, aborting the sign-in
 * after the plan credential has already been stored.
 * @param value - the value to check.
 * @param seen - ancestor objects, for cycle detection.
 */
function assertJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new TypeError('holds a non-finite number')
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('is cyclic')
    if (Object.getPrototypeOf(value) === Object.prototype || Array.isArray(value)) {
      seen.add(value)
      for (const nested of Object.values(value)) assertJsonValue(nested, seen)
      seen.delete(value)
      return
    }
  }
  throw new TypeError(`holds a ${typeof value}, which JSON cannot represent`)
}

const { accountGrant, useReset } = await import(pathToFileURL(join(ROOT, 'lib/index.js')).href)
if (typeof accountGrant !== 'function') fail('lib/index.js does not export accountGrant')
if (typeof useReset !== 'function') fail('lib/index.js does not export useReset')
const signedInAt = Date.now()
const grant = accountGrant({
  deployment: 'zai',
  planKind: 'individual-coding-plan',
  accountId: 'probe',
  accountLabel: 'probe',
  accessToken: 'access',
  zcodeJwt: 'header.payload.signature',
  accessTokenExpiresAt: undefined,
  jwtExpiresAt: undefined,
  signedInAt,
})
try {
  assertJsonValue(grant.payload)
} catch (error) {
  fail(`the account grant the sign-in writes is refused by the credential store (${error.message})`)
}
for (const key of ['accessTokenExpiresAt', 'jwtExpiresAt']) {
  if (key in grant.payload) fail(`the account grant keeps ${key} as undefined instead of dropping it`)
}
for (const key of ['deployment', 'accessToken', 'zcodeJwt', 'signedInAt']) {
  if (!(key in grant.payload)) fail(`the account grant dropped the required field ${key}`)
}
console.log('verify: the account grant is JSON-representable, as the credential store requires')

// The reset service spells its windows in upper case, while this plugin's own
// wire types spell them in lower case; sending the internal spelling is refused
// and the reset silently fails. Pin the request body, and pin that a refusal
// keeps the service's own explanation.
const resetInput = {
  zcodeApiOrigin: 'https://reset.invalid',
  zcodeJwt: 'jwt-token',
  accessToken: 'access-token',
  requestTimeoutMs: 5_000,
  signal: undefined,
}
let captured
globalThis.fetch = async (url, init) => {
  captured = { url: String(url), init }
  return new Response(JSON.stringify({ code: 0, data: { used: true } }), { status: 200 })
}
await useReset(resetInput, 'week', 'key-1')
const useBody = JSON.parse(captured.init.body)
if (useBody.reset_type !== 'WEEK') {
  fail(`useReset sends reset_type ${JSON.stringify(useBody.reset_type)}; the service expects "WEEK"`)
}
if (!captured.url.endsWith('/api/v1/coding-plan/reset/use')) fail(`useReset posts to ${captured.url}`)
if (captured.init.headers['X-Bigmodel-Authorization'] !== 'access-token') {
  fail('useReset does not carry the deployment access token the service checks')
}
await useReset(resetInput, 'five_hour', 'key-2')
if (JSON.parse(captured.init.body).reset_type !== 'FIVE_HOUR') {
  fail('useReset does not spell the five-hour window the way the service expects')
}
console.log('verify: the reset request carries the spelling the reset service accepts')

globalThis.fetch = async () => new Response(
  JSON.stringify({ code: 4000, message: 'no week reset available for this account' }),
  { status: 200 },
)
try {
  await useReset(resetInput, 'week', 'key-3')
  fail('a refused reset resolved instead of throwing')
} catch (error) {
  if (!String(error.message).includes('no week reset available')) {
    fail(`a refused reset hid the service's explanation: ${error.message}`)
  }
}
console.log('verify: a refused reset keeps the explanation the service sent')

// The bundle patch must stay insert-only and must not re-declare a row the
// installation's dsh-base already mounts (`authorization` since 0.1.7-rc.2):
// an overriding row outlives this bundle and blocks uninstall forever (the
// plugin manager counts the still-running target as this bundle's component),
// a nameless one collides with the target id and fails the tree load, and a
// duplicate of a base row fails the tree load the same way. The GLM routes
// belong to the settings document instead; see
// `ZhipuPlanService.syncProviderRoutes`.
const patch = await (await import('node:fs/promises')).readFile(join(ROOT, 'cordis.patch.yml'), 'utf8')
const topLevelIds = [...patch.matchAll(/^- id:/gmu)]
const inserts = [...patch.matchAll(/^- insert:/gmu)]
if (topLevelIds.length > 0 || inserts.length !== 1) {
  fail('cordis.patch.yml must be a single insert block; re-declaring other bundles\' rows'
    + ' either blocks uninstall or fails the tree load')
}
if (!/- id: zhipu-plan/.test(patch) || /- id: authorization/.test(patch)) {
  fail('the patch must insert exactly the zhipu-plan row; dsh-base provides authorization itself')
}
console.log('verify: the patch stays insert-only and re-declares nothing dsh-base mounts')

// The browser half resolves the UI primitives from the shell's module table,
// so a name the running application no longer exports arrives as `undefined`
// and blanks the whole settings section at render. Import-site names are
// checked against the checkout's primitives export surface (direct exports
// plus every `export *` barrel) so the drift fails here, not in the page.
{
  const { readdir } = await import('node:fs/promises')
  const primRoot = join(HARNESS, 'packages/client/ui-primitives/src')
  const exported = new Set()
  const scan = async file => {
    const text = await (await import('node:fs/promises')).readFile(file, 'utf8')
    for (const match of text.matchAll(/export\s+\{([^}]+)\}/g)) {
      for (const name of match[1].split(',')) {
        const target = name.trim().split(/\s+as\s+/).pop()
        if (target !== '') exported.add(target)
      }
    }
    for (const match of text.matchAll(/export\s+(?:const|function|class)\s+(\w+)/g)) exported.add(match[1])
    for (const match of text.matchAll(/export\s+\*\s+from\s+'([^']+)'/g)) {
      await scan(join(dirname(file), match[1]))
    }
  }
  await scan(join(primRoot, 'index.ts'))
  const imports = new Set()
  for (const file of (await readdir(join(ROOT, 'src/client'))).filter(name => name.endsWith('.tsx'))) {
    const text = await (await import('node:fs/promises')).readFile(join(ROOT, 'src/client', file), 'utf8')
    for (const match of text.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'@deepseek-ai\/dsh-client-ui-primitives'/g)) {
      for (const name of match[1].split(',')) {
        const local = name.trim().split(/\s+as\s+/)[0]
        if (local !== '' && !local.startsWith('type ')) imports.add(local)
      }
    }
  }
  const missing = [...imports].filter(name => !exported.has(name))
  if (missing.length > 0) {
    fail(`the running application's UI primitives no longer export ${missing.join(', ')}`
      + ' — rename the imports or the settings page renders blank')
  }
  console.log(`verify: all ${imports.size} UI-primitive imports exist in the checkout's export surface`)
}

const client = await import(pathToFileURL(join(ROOT, 'lib/client.js')).href).catch(() => undefined)
if (client !== undefined) fail('lib/client.js executed under Node — it must only register a browser factory')

const methods = TYPERT.invocations.map(invocation => `${invocation.namespace}/${invocation.method}`).sort()
console.log(`verify: ${service.name} registers ${methods.length} Remote methods`)
for (const method of methods) console.log(`  ${method}`)
console.log('verify: the harness loader accepted the published Typert manifest')
