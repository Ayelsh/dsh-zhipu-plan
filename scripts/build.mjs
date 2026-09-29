/**
 * Build the plugin's three shipped artifacts from source.
 *
 * - `lib/index.js` — the host half (ESM, Node): the `zhipuPlan` service. Every
 *   `@deepseek-ai/*` import stays external; the profile's module fallback links
 *   resolve them to the copies the running application already loaded, so the
 *   plugin shares the host's cordis, credential, and Typert instances instead
 *   of carrying its own.
 * - `lib/typert.js` — the host wire face, a copy of the generated Typert
 *   manifest with its `zod` schemas inlined, so the artifact stands alone.
 * - `lib/client.js` — the browser half in the module-table's lazy-CJS form:
 *   registering the factory is the whole file's side effect, and `react`,
 *   `react/jsx-runtime`, and the UI primitives stay `require`s the shell
 *   answers while everything else — zod included — is inlined.
 *
 * The build then checks what the artifacts must be true of: the wrapper exists,
 * no unanswerable `require()` survived, every class and Remote method the
 * browser half names exists on the other side, both dictionaries carry the same
 * keys, and every Remote method the wire publishes is implemented by the
 * service it names. Each check fails the build with the offending name.
 *
 * @module dsh-zhipu-plan/scripts/build
 */

import { build } from 'esbuild'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, 'lib')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PACKAGE_NAME = MANIFEST.name

/** Module-table specifiers the shell answers for a dynamic bundle. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
]

/** Host packages resolved from the running application through the profile's module fallback links. */
const HOST_PEERS = '@deepseek-ai/*'

/**
 * Fail the build with one named defect.
 * @param message - what is wrong, naming the offending symbol.
 */
function fail(message) {
  throw new Error(`build: ${message}`)
}

/** One esbuild run, with the shared output settings. */
async function bundle(options) {
  await build({
    bundle: true,
    logLevel: 'warning',
    target: 'es2022',
    minify: false,
    ...options,
  })
}

/** Read one source file as UTF-8. */
function source(relative) {
  return readFileSync(join(ROOT, relative), 'utf8')
}

/** Assert the browser half only `require`s what the shell's module table answers. */
function checkClientRequires() {
  const text = source('lib/client.js')
  const requested = new Set(PLATFORM_MODULES)
  const offenders = new Set()
  for (const match of text.matchAll(/\brequire\(\s*"([^"]+)"\s*\)/gu)) {
    const specifier = match[1]
    if (!requested.has(specifier) && !specifier.startsWith('node:')) offenders.add(specifier)
  }
  if (offenders.size > 0) {
    fail(`lib/client.js keeps require() for ${[...offenders].sort().map(name => `"${name}"`).join(', ')} — `
      + 'the module table cannot answer those, so the bundle would throw at materialization')
  }
  if (!text.startsWith('window.__ModuleLoader__.load({')) {
    fail('lib/client.js does not begin with the module-table registration wrapper')
  }
  if (!text.trimEnd().endsWith('return module.exports; } });')) {
    fail('lib/client.js does not end with the module-table factory close')
  }
}

/** Assert every class name the markup uses is declared in the stylesheet. */
async function checkStyleClasses() {
  const { STYLE_CLASSES, STYLE_SHEET } = await import(pathToFileURL(join(ROOT, 'src/client/styles.ts')).href)
    .catch(() => fail('styles.ts must be loadable as a module'))
  const declared = new Set(STYLE_CLASSES)
  for (const panel of ['src/client/PlanPanel.tsx', 'src/client/PlanUsagePanel.tsx']) {
    // The import statement names the module, not a class.
    const text = source(panel).replaceAll("from './styles.ts'", '')
    for (const match of text.matchAll(/styles\.(\w+)/gu)) {
      if (!declared.has(match[1])) fail(`${panel} names styles.${match[1]}, which styles.ts does not declare`)
    }
  }
  for (const name of declared) {
    if (!STYLE_SHEET.includes(`.dzp-${name}`)) fail(`styles.ts declares "${name}" but the sheet has no .dzp-${name} rule`)
  }
}

/** Assert both dictionaries carry exactly the same keys, and that every key the page asks for exists. */
async function checkDictionaries() {
  const { zh, en } = await import(pathToFileURL(join(ROOT, 'src/client/locales.ts')).href)
  const chinese = Object.keys(zh).sort()
  const english = Object.keys(en).sort()
  const missing = chinese.filter(key => !(key in en))
  const extra = english.filter(key => !(key in zh))
  if (missing.length > 0 || extra.length > 0) {
    fail(`locales.ts dictionaries differ: missing in en: ${missing.join(', ') || 'none'}; missing in zh: ${extra.join(', ') || 'none'}`)
  }
  if (chinese.length === 0) fail('locales.ts declares no copy')
  // A key the page names but the dictionary lacks renders as the key itself,
  // which is how a raw `resetDoneWeek` reached a screenshot once.
  const sources = [
    'src/client/PlanPanel.tsx', 'src/client/PlanUsagePanel.tsx',
    'src/client/QuotaSection.tsx', 'src/client/index.tsx',
  ]
  const requested = new Set()
  for (const file of sources) {
    for (const match of source(file).matchAll(/\bt\(\s*'([A-Za-z][\w]*)'/gu)) requested.add(match[1])
  }
  const unknown = [...requested].filter(key => !(key in zh))
  if (unknown.length > 0) {
    fail(`the page asks for dictionary keys that locales.ts does not declare: ${unknown.sort().join(', ')}`)
  }
}

/**
 * Assert the wire and the service agree, in both directions: every Remote
 * method the manifest publishes is one the service source declares, and every
 * method the browser half calls is published.
 *
 * The service module itself is not imported here: its `@deepseek-ai/*` imports
 * resolve in the running application, not in this build tree. The declaration
 * scan is the stronger check anyway — it ties the published table to the
 * source that implements it, so editing one without the other fails the build.
 */
async function checkWireContract() {
  const { TYPERT } = await import(pathToFileURL(join(LIB, 'typert.js')).href)
  if (TYPERT.package !== PACKAGE_NAME) {
    fail(`lib/typert.js publishes package ${JSON.stringify(TYPERT.package)}, not ${JSON.stringify(PACKAGE_NAME)}`)
  }
  const published = new Set(TYPERT.invocations.map(invocation => invocation.method))
  const declared = new Set()
  const text = source('src/host/service.ts')
  for (const match of text.matchAll(/@Remote(?:\(\s*['"](\w+)['"]\s*\))?\s+(?:async\s+)?(\w+)\s*\(/gu)) {
    declared.add(match[1] ?? match[2])
  }
  const unpublished = [...declared].filter(method => !published.has(method))
  const unimplemented = [...published].filter(method => !declared.has(method))
  if (unpublished.length > 0) {
    fail(`the service declares @Remote ${unpublished.join(', ')}, which the published wire omits — regenerate it from the service's types`)
  }
  if (unimplemented.length > 0) {
    fail(`the wire publishes ${unimplemented.join(', ')}, which the service no longer declares`)
  }
  const remote = (await import(pathToFileURL(join(ROOT, 'src/wire/typert-remote-client.js')).href)).default
  const clientMethods = new Set(remote.descriptors.map(descriptor => descriptor.method))
  for (const method of clientMethods) {
    if (!published.has(method)) fail(`the browser contribution declares zhipuPlan/${method}, which the host wire omits`)
  }
  for (const match of source('src/client/index.tsx').matchAll(/planNamespace\(ctx\)\.(\w+)\(/gu)) {
    if (!published.has(match[1])) fail(`src/client/index.tsx calls zhipuPlan/${match[1]}, which the wire does not publish`)
  }
}

rmSync(LIB, { recursive: true, force: true })

await bundle({
  entryPoints: [join(ROOT, 'src/host/index.ts')],
  outfile: join(LIB, 'index.js'),
  format: 'esm',
  platform: 'node',
  external: [HOST_PEERS],
})

await bundle({
  entryPoints: [join(ROOT, 'src/wire/typert-host.js')],
  outfile: join(LIB, 'typert.js'),
  format: 'esm',
  platform: 'node',
  // The loader imports this face inside the running application, where the
  // schema library resolves through the profile's module fallback links; only
  // the browser half, which cannot resolve anything but the module table,
  // carries its own copy.
  external: ['zod'],
})

await bundle({
  entryPoints: [join(ROOT, 'src/client/index.tsx')],
  outfile: join(LIB, 'client.js'),
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: PLATFORM_MODULES,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {\n`
      + 'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})

await checkClientRequires()
await checkStyleClasses()
await checkDictionaries()
await checkWireContract()

console.log(`build: ${PACKAGE_NAME} — host, wire, and browser artifacts written to lib/`)
