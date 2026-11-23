/**
 * Offline render smoke for the settings page: bundle the real components with
 * the real React from the harness checkout, mount them in a JSDOM document, and
 * drive the two-view bar and the capability switches (success, refused write,
 * recovery). Not part of the build.
 *
 * The harness checkout is found like the other scripts do it — the first
 * argument, then `DSH_HARNESS_ROOT`, then `ROOT/../../deepseek-harness`.
 *
 * @module dsh-zhipu-plan/scripts/render-smoke
 */

import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const ROOT = dirname(here)
const HARNESS = resolve(process.argv[2] ?? process.env['DSH_HARNESS_ROOT'] ?? join(ROOT, '..', '..', 'deepseek-harness'))
if (!existsSync(join(HARNESS, 'package.json'))) {
  console.error(`render-smoke: ${HARNESS} is not a deepseek-harness checkout`)
  process.exit(1)
}
const require = createRequire(join(HARNESS, 'packages/client/ui-primitives/package.json'))
const work = mkdtempSync(join(tmpdir(), 'zhipu-render-'))
const outfile = join(work, 'render.mjs')

await build({
  entryPoints: [join(here, 'render-entry.jsx')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  logLevel: 'warning',
  alias: {
    'react': require.resolve('react'),
    'react/jsx-runtime': require.resolve('react/jsx-runtime'),
    'react-dom/client': require.resolve('react-dom/client'),
  },
})

const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.MutationObserver = dom.window.MutationObserver

await import(outfile)

const zh = globalThis.__probe.zh
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(label, check, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (check()) { console.log(`render: ${label}`); return }
    if (Date.now() > deadline) throw new Error(`render: timed out waiting for ${label}`)
    await sleep(10)
  }
}

const tabs = () => [...document.querySelectorAll('[role="tab"]')]
const panels = () => [...document.querySelectorAll('[role="tabpanel"]')]
const shownPanel = () => panels().find((el) => !el.hasAttribute('hidden'))
const switches = () => [...document.querySelectorAll('[role="switch"]')]
const states = () => switches().map((el) => el.getAttribute('aria-checked')).join(',')
const errorText = () => document.querySelector('.dzp-backendRowError')?.textContent ?? null

// The bar: two views, the first one selected without a click.
await until('bar mounted with two tabs', () => tabs().length === 2)
if (tabs().map((el) => el.textContent).join('|') !== `${zh.tabWeb}|${zh.tabAccount}`) {
  throw new Error(`render: the tab labels are ${tabs().map((el) => el.textContent).join('|')}`)
}
if (tabs()[0].getAttribute('aria-selected') !== 'true') throw new Error('render: the first tab is not selected')
if (tabs()[1].getAttribute('aria-selected') !== 'false') throw new Error('render: the second tab starts selected')
if (document.querySelector('.dzp-shell') === null) throw new Error('render: the shell class is missing')
if (document.querySelector('.dzp-tabsThumb') === null) throw new Error('render: the travelling pill is missing')
if (shownPanel()?.textContent?.includes(zh.tabAccount) === true) throw new Error('render: the account view is on screen first')
console.log('render: two-view bar, first view selected, shell and pill present')

await until('card mounted with four switches', () => switches().length === 4)
if (!document.querySelector('.dzp-backendCard')) throw new Error('render: the dzp-backendCard class is missing')
if (states() !== 'true,true,false,false') throw new Error(`render: initial switch states are ${states()}`)
if (!document.body.textContent.includes(zh.backendFootnote)) throw new Error('render: the zh footnote is missing')
console.log('render: card class, defaults, and footnote present')

// A host skin may restyle every [role='switch'] as a switch track. The row
// keeps the switch role for its semantics, so its surface must stay its own
// even when such a sheet lands after ours. These are the real rules from
// dsh-liquid-glass, with its token values resolved to literals.
const hostile = document.createElement('style')
hostile.textContent = [
  "[role='switch'] { border-radius: 999px; }",
  "[role='switch'][aria-checked='true'] { background-color: rgb(61, 90, 254); box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.3); }",
  "[role='switch'][aria-checked='false'] { background-color: rgba(0, 0, 0, 0.16); box-shadow: inset 0 1px 2px rgba(16, 22, 40, 0.12); }",
].join('\n')
document.head.append(hostile)
const view = document.defaultView

// Control: the sheet is live, and it does paint a bare switch track.
const bare = document.createElement('button')
bare.setAttribute('role', 'switch')
bare.setAttribute('aria-checked', 'true')
document.body.append(bare)
const bareStyle = view.getComputedStyle(bare)
if (bareStyle.backgroundColor !== 'rgb(61, 90, 254)') {
  throw new Error(`render: the hostile sheet never applied (a bare switch is ${bareStyle.backgroundColor})`)
}
bare.remove()

const rowStyle = view.getComputedStyle(switches()[0])
if (rowStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
  throw new Error(`render: a host skin repainted the row (${rowStyle.backgroundColor})`)
}
if (rowStyle.backgroundImage !== 'none') throw new Error(`render: a host skin painted the row (${rowStyle.backgroundImage})`)
if (rowStyle.borderRadius !== '10px') throw new Error(`render: a host skin reshaped the row (${rowStyle.borderRadius})`)
if (rowStyle.boxShadow !== 'none') throw new Error(`render: a host skin lit the row (${rowStyle.boxShadow})`)
hostile.remove()
console.log('render: the row surface survives a host [role=switch] skin')

switches()[0].click()
await until('search off after the first click', () => states() === 'false,true,false,false')
if (globalThis.__probe.calls().join('|') !== 'search=false') throw new Error(`render: calls are ${globalThis.__probe.calls()}`)
if (errorText() !== null) throw new Error('render: an error row appeared on a successful write')
console.log('render: onSet(search, false) observed, no error')

switches()[0].click()
await until('refused write reverts and reports', () => states() === 'false,true,false,false' && errorText() === zh.backendSaveFailed)
console.log('render: refused write reverted with the error row')

switches()[0].click()
await until('retry succeeds and clears the error', () => states() === 'true,true,false,false' && errorText() === null)
if (globalThis.__probe.calls().join('|') !== 'search=false|search=true|search=true') {
  throw new Error(`render: calls are ${globalThis.__probe.calls()}`)
}
console.log('render: recovery write landed and the error cleared')

// The bar itself: the second view is chosen, and the first one is kept
// mounted while hidden so its state survives the trip.
tabs()[1].click()
await until('account view selected', () => tabs()[1].getAttribute('aria-selected') === 'true')
if (tabs()[0].getAttribute('aria-selected') !== 'false') throw new Error('render: the first tab stayed selected')
if (shownPanel()?.textContent?.includes(zh.tabAccount) !== true) throw new Error('render: the account view is not on screen')
const hiddenWeb = panels().find((el) => el.hasAttribute('hidden'))
if (hiddenWeb === undefined || hiddenWeb.querySelector('[role="switch"]') === null) {
  throw new Error('render: the switches view was unmounted rather than hidden')
}
console.log('render: second view selected, first view hidden but mounted')

tabs()[0].click()
await until('web view restored', () => tabs()[0].getAttribute('aria-selected') === 'true' && states() === 'true,true,false,false')
if (errorText() !== null) throw new Error('render: the switch state did not survive the trip')
console.log('render: switching back restored the switch view intact')

rmSync(work, { recursive: true, force: true })
console.log('RENDER OK')
