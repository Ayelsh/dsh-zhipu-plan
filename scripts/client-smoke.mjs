/**
 * Materialize the built browser bundle under Node and activate it against a
 * stub shell, checking the two things a browser would otherwise be needed to
 * find: that the factory materializes with only module-table answers, and that
 * `apply` mounts this plugin's own Remote contribution and registers one
 * Settings section.
 *
 * The stub answers exactly the services the plugin injects and records what it
 * was asked for; nothing here renders, so no DOM is needed.
 *
 * @module dsh-zhipu-plan/scripts/client-smoke
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HARNESS = resolve(process.argv[2] ?? join(ROOT, '..', '..', 'deepseek-harness'))
const require = createRequire(`${HARNESS}/packages/client/ui-settings/package.json`)

/** The module-table specifiers the shell answers, resolved here from the harness workspace. */
const TABLE = {
  'react': require('react'),
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@deepseek-ai/dsh-client-ui-primitives': { writeClipboard: async () => {} },
}

const registered = new Map()
globalThis.window = {
  __ModuleLoader__: {
    load: ({ id, factory }) => { registered.set(id, factory) },
  },
}

await import(`file://${join(ROOT, 'lib/client.js')}`)
const id = 'dsh-zhipu-plan'
if (!registered.has(id)) throw new Error(`client-smoke: the bundle did not register ${id}`)
const exported = registered.get(id)((specifier) => {
  if (!(specifier in TABLE)) throw new Error(`client-smoke: the bundle required ${JSON.stringify(specifier)}, which the module table does not answer`)
  return TABLE[specifier]
})

for (const name of ['apply', 'inject', 'NS']) {
  if (exported[name] === undefined) throw new Error(`client-smoke: the bundle exports no ${name}`)
}
console.log(`client-smoke: materialized ${id}; inject=${JSON.stringify(exported.inject)}; locale namespace=${exported.NS}`)

const calls = { effects: [], mounts: [], sections: [], dictionaries: [] }
const stub = {
  effect: (callback, label) => { calls.effects.push(label); void callback() },
  locale: {
    register: (namespace, dictionaries) => { calls.dictionaries.push({ namespace, languages: Object.keys(dictionaries) }) },
    bind: () => (key) => key,
  },
  remote: {
    $mount: async (contribution) => {
      calls.mounts.push({ package: contribution.package, methods: contribution.descriptors.length })
      return async () => {}
    },
  },
  slots: {
    inject: (name, callback) => { calls.sections.push(name); void callback() },
    register: (entry, component) => {
      calls.sections.push({ name: entry.name, id: entry.id, locale: entry.locale, label: entry.label(), component: typeof component })
      return () => {}
    },
  },
  get: () => undefined,
}

await exported.apply(stub)

if (calls.mounts.length !== 1) throw new Error(`client-smoke: apply mounted ${calls.mounts.length} Remote contributions, expected 1`)
if (calls.mounts[0].package !== id) throw new Error(`client-smoke: mounted ${calls.mounts[0].package}, expected ${id}`)
const section = calls.sections.find(entry => typeof entry === 'object')
if (section === undefined) throw new Error('client-smoke: apply registered no Settings section')
if (section.name !== 'settings.section') throw new Error(`client-smoke: registered ${section.name}`)
if (section.component !== 'function') throw new Error('client-smoke: the section registration carries no component')
if (calls.dictionaries.length !== 1) throw new Error('client-smoke: apply registered no dictionaries')

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
if (!bundle.startsWith('window.__ModuleLoader__.load({')) throw new Error('client-smoke: the bundle has no module-table wrapper')

console.log(`client-smoke: mounted ${calls.mounts[0].methods} Remote descriptors as ${calls.mounts[0].package}`)
console.log(`client-smoke: registered Settings section "${section.id}" labeled "${section.label}" with locale namespace ${section.locale}`)
console.log(`client-smoke: registered dictionaries for ${calls.dictionaries[0].languages.join(', ')}`)
console.log(`client-smoke: effects ${JSON.stringify(calls.effects)}`)
