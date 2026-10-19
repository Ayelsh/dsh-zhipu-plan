/**
 * Photograph the preview page.
 *
 * `scripts/preview.mjs` renders the page to HTML, and HTML alone cannot show
 * whether a surface reads as raised, whether a figure is too large for its
 * card, or whether the dark theme still separates the layers. This script opens
 * the generated page in headless Chromium and writes one PNG per scenario, in
 * both themes, into `preview/shots/`.
 *
 * Browsers come from Playwright's cache and Playwright itself is resolved from
 * the harness checkout, so this never becomes a dependency of the plugin:
 *
 *   PLAYWRIGHT_BROWSERS_PATH=~/.cache/ms-playwright node scripts/preview-shots.mjs
 *
 * Options: `--out <dir>` (default `preview/shots`), `--harness <dir>` (default
 * `DSH_HARNESS_ROOT`, then `ROOT/../../deepseek-harness`).
 *
 * @module dsh-zhipu-plan/scripts/preview-shots
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}
const OUT = resolve(ROOT, option('--out', join('preview', 'shots')))
const HARNESS = resolve(option('--harness', process.env['DSH_HARNESS_ROOT'] ?? join(ROOT, '..', '..', 'deepseek-harness')))

// Playwright is a harness dependency; find the installed copy rather than
// assuming it is linked into this package.
const store = join(HARNESS, 'node_modules', '.pnpm')
const playwright = readdirSync(store).filter(name => name.startsWith('playwright-core@'))
if (playwright.length === 0) {
  console.error(`preview-shots: no playwright-core under ${store}; run pnpm install in the harness first`)
  process.exit(1)
}
const entry = join(store, playwright.at(-1), 'node_modules', 'playwright-core', 'index.mjs')
if (!existsSync(entry)) {
  console.error(`preview-shots: ${entry} is missing`)
  process.exit(1)
}
const { chromium } = await import(entry)

/** The scenarios `preview.mjs` writes, and what each one is called here. */
const SCENARIOS = [
  ['a', 'panel'],
  ['d', 'waiting'],
  ['e', 'signin'],
  ['f', 'reading'],
  ['g', 'read-failed'],
  ['h', 'all-time'],
]
const THEMES = [['plan-page.html', 'light'], ['plan-page-dark.html', 'dark']]

mkdirSync(OUT, { recursive: true })
// Playwright pins one Chromium build; a cache installed by a different
// revision of Playwright will not match it. Rather than demand a re-download,
// fall back to whatever Chromium is actually in the cache.
const cached = process.env['PLAYWRIGHT_BROWSERS_PATH']
const found = cached === undefined || !existsSync(cached)
  ? []
  : readdirSync(cached)
    .filter(name => /^chromium(_headless_shell)?-\d+$/.test(name))
    .flatMap(name => [
      join(cached, name, 'chrome-linux64', 'chrome'),
      join(cached, name, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      join(cached, name, 'chrome-linux', 'chrome'),
    ])
    .filter(existsSync)
const browser = await chromium.launch().catch(async error => {
  if (found.length === 0) throw error
  console.warn(`preview-shots: pinned browser missing; using ${found[0]}`)
  return chromium.launch({ executablePath: found[0] })
})
let written = 0

for (const [file, theme] of THEMES) {
  const path = join(ROOT, 'preview', file)
  if (!existsSync(path)) {
    console.error(`preview-shots: ${path} is missing; run scripts/preview.mjs first`)
    continue
  }
  const page = await browser.newPage({ viewport: { width: 980, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`file://${path}`, { waitUntil: 'load' })
  // The page arrives with animation; freeze it so two runs are comparable, and
  // take the reset dialog out of flow so it cannot cover the scenarios.
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; } .dzp-preview-modal { display: none !important; }' })
  await page.waitForTimeout(250)

  for (const [id, name] of SCENARIOS) {
    const element = await page.$(`#${id}`)
    if (element === null) {
      console.error(`preview-shots: no #${id} in ${file}`)
      continue
    }
    await element.screenshot({ path: join(OUT, `${name}-${theme}.png`) })
    written += 1
  }

  // The dialog belongs to no host, so it is lifted out to be photographed whole.
  await page.evaluate(() => {
    const modal = document.querySelector('.dzp-preview-modal')
    if (modal === null) return
    for (const host of document.querySelectorAll('.dzp-preview-page > *')) host.style.display = 'none'
    document.body.append(modal)
    modal.style.cssText = 'position: static; inset: auto; padding: 36px; justify-content: center; align-items: flex-start;'
    const mask = modal.querySelector('.dzp-preview-modal-mask')
    if (mask !== null) mask.style.display = 'none'
  })
  await page.setViewportSize({ width: 600, height: 640 })
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(OUT, `dialog-${theme}.png`) })
  written += 1
  await page.close()
}

await browser.close()
console.log(`preview-shots: wrote ${String(written)} images to ${OUT}`)
