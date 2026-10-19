/**
 * Render the plan page to a standalone HTML file.
 *
 * The application's page cannot be inspected without a browser and a signed-in
 * account, so this script mounts the real components into jsdom with fixture
 * data, captures the markup, and writes files that open anywhere: the shell's
 * own theme tokens, this plugin's stylesheet, and eight panels — the signed-in
 * page in both languages, the reset dialog, the waiting and signed-out screens,
 * a window being read, a read that failed, and the all-time window — once as
 * the light page and once as the dark one.
 *
 * The two shell primitives this page uses (Button, Modal) are stood in for by
 * `preview-primitives.jsx`, so the buttons and the dialog are preview chrome
 * rather than the application's own; everything else is the shipped code.
 *
 * Usage: `node scripts/preview.mjs [output.html]` — by default it writes
 * `preview/plan-page.html` and `preview/plan-page-dark.html`; with an explicit
 * output path it writes only that file.
 *
 * @module dsh-zhipu-plan/scripts/preview
 */

import { build } from 'esbuild'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zh, en } from '../src/client/locales.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HARNESS = resolve(process.env['DSH_HARNESS_ROOT'] ?? join(ROOT, '..', '..', 'deepseek-harness'))
const ANCHOR = join(HARNESS, 'packages/client/ui-primitives/package.json')
const require = createRequire(ANCHOR)
const OUT = resolve(process.argv[2] ?? join(ROOT, 'preview/plan-page.html'))
const EXPLICIT = process.argv[2] !== undefined

const work = mkdtempSync(join(tmpdir(), 'zhipu-preview-'))
const bundlePath = join(work, 'preview.mjs')

await build({
  entryPoints: [join(ROOT, 'scripts/preview-entry.jsx')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  logLevel: 'warning',
  alias: {
    'react': require.resolve('react'),
    'react/jsx-runtime': require.resolve('react/jsx-runtime'),
    'react-dom/client': require.resolve('react-dom/client'),
    '@deepseek-ai/dsh-client-ui-primitives': join(ROOT, 'scripts/preview-primitives.jsx'),
  },
})

const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', { pretendToBeVisual: true })
const { window } = dom
globalThis.window = window
globalThis.document = window.document
globalThis.HTMLElement = window.HTMLElement
globalThis.MouseEvent = window.MouseEvent
globalThis.Event = window.Event
globalThis.getComputedStyle = window.getComputedStyle.bind(window)
// Node 22 defines `navigator` as a getter on the global object.
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true })

const preview = await import(pathToFileURL(bundlePath).href)

/** Mount one scenario, let its effects settle, and return the rendered markup. */
async function capture(options, interact) {
  const host = window.document.createElement('div')
  host.className = 'dzp-preview-host'
  window.document.body.append(host)
  preview.mount(host, options)
  await new Promise(resolve => setTimeout(resolve, 120))
  if (interact !== undefined) {
    interact(host)
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  const html = host.innerHTML
  host.remove()
  return html
}

const web = await capture({ dictionary: zh, localeId: 'zh-CN', loginState: { state: 'signed-in' }, tab: 'web' })
const webEn = await capture({ dictionary: en, localeId: 'en', loginState: { state: 'signed-in' }, tab: 'web' })
const signedIn = await capture({ dictionary: zh, localeId: 'zh-CN', loginState: { state: 'signed-in' } })
const signedInEn = await capture({ dictionary: en, localeId: 'en', loginState: { state: 'signed-in' } })
const dialog = await capture(
  { dictionary: zh, localeId: 'zh-CN', loginState: { state: 'signed-in' } },
  (host) => {
    const badge = host.querySelector('.dzp-resetBadge') ?? host.querySelector('.dzp-resetEntry')
    badge?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  },
)
const signIn = await capture({
  dictionary: zh,
  localeId: 'zh-CN',
  loginState: { state: 'waiting', authorizeUrl: 'https://chat.z.ai/api/oauth/authorize?client_id=…&state=…' },
})
const signedOut = await capture({ dictionary: zh, localeId: 'zh-CN', loginState: { state: 'idle' }, account: false })
const reading = await capture({
  dictionary: zh,
  localeId: 'zh-CN',
  loginState: { state: 'signed-in' },
  usage: 'pending',
})
const readFailed = await capture({
  dictionary: zh,
  localeId: 'zh-CN',
  loginState: { state: 'signed-in' },
  usage: 'failed',
})
const allTime = await capture(
  {
    dictionary: zh,
    localeId: 'zh-CN',
    loginState: { state: 'signed-in' },
    usage: 'all',
  },
  (host) => {
    const tabs = host.querySelectorAll('[role="tab"]')
    tabs[tabs.length - 1]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  },
)

const inFrame = await capture({ dictionary: zh, localeId: 'zh-CN', loginState: { state: 'signed-in' } })

const themeCss = ['base.css', 'design-platform.css']
  .map(name => readFileSync(join(HARNESS, 'packages/client/ui-theme/src/styles', name), 'utf8'))
  .join('\n')

const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>dsh-zhipu-plan — 界面预览</title>
<style>
${themeCss}
${preview.STYLE_SHEET}
/* Preview chrome: the two shell primitives this page uses are stood in for here. */
body { margin: 0; padding: 24px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family); }
.dzp-preview-page { display: flex; flex-direction: column; gap: 10px; }
.dzp-preview-host { max-width: 860px; padding: 20px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-base); }
.dzp-preview-label { font-size: 12px; color: var(--dsw-alias-label-tertiary); margin: 18px 0 0; }
.dzp-preview-button { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.dzp-preview-sm { height: 26px; padding: 0 10px; }
.dzp-preview-md { height: 32px; padding: 0 14px; }
.dzp-preview-primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: var(--dsw-alias-label-primary-foreground); }
.dzp-preview-outline { background: none; }
.dzp-preview-ghost { background: none; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.dzp-preview-modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
.dzp-preview-modal-mask { position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-1); }
.dzp-preview-modal-dialog { position: relative; width: 460px; max-width: 92vw; border-radius: 14px; background: var(--dsw-alias-bg-overlay); border: 0.5px solid var(--dsw-alias-border-l1); box-shadow: var(--dsw-shadow-lv2); }
.dzp-preview-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 0.5px solid var(--dsw-alias-border-secondary); }
.dzp-preview-modal-title { font-size: 14px; font-weight: 600; }
.dzp-preview-modal-body { padding: 16px; }
/* The settings dialog's own geometry, copied from the shell so this preview can
   answer the one question the page cannot answer alone: whether the page's top
   edge survives the column that scrolls it. */
.dzp-preview-frame { width: 800px; max-width: 100%; height: 520px; display: flex; flex-direction: column; border-radius: var(--dsw-radius-panel, 12px); background: var(--dsw-alias-bg-layer-1); border: 0.5px solid var(--dsw-alias-border-l1); overflow: hidden; }
.dzp-preview-frameHead { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; height: 54px; padding: 20px 14px 8px 10px; box-sizing: border-box; }
.dzp-preview-frameAction { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dzp-preview-frameClose { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dzp-preview-options { flex: 1; min-height: 0; padding: 0 24px 24px; overflow-y: auto; }
</style>
</head>
<body@@DARK@@>
<div class="dzp-preview-page">
  <p class="dzp-preview-label">联网能力 / web capabilities（中文）</p>
  <div class="dzp-preview-host" id="i">${web}</div>
  <p class="dzp-preview-label">联网能力 / web capabilities（English）</p>
  <div class="dzp-preview-host" id="j">${webEn}</div>
  <p class="dzp-preview-label">已登录 / signed in（中文）</p>
  <div class="dzp-preview-host" id="a">${signedIn}</div>
  <p class="dzp-preview-label">已登录 / signed in（English）</p>
  <div class="dzp-preview-host" id="b">${signedInEn}</div>
  <p class="dzp-preview-label">重置弹窗 / reset dialog</p>
  <div class="dzp-preview-host" id="c">${dialog}</div>
  <p class="dzp-preview-label">等待授权 / waiting for authorization</p>
  <div class="dzp-preview-host" id="d">${signIn}</div>
  <p class="dzp-preview-label">未登录 / signed out</p>
  <div class="dzp-preview-host" id="e">${signedOut}</div>
  <p class="dzp-preview-label">读取中 / reading a window</p>
  <div class="dzp-preview-host" id="f">${reading}</div>
  <p class="dzp-preview-label">读取失败 / read failed</p>
  <div class="dzp-preview-host" id="g">${readFailed}</div>
  <p class="dzp-preview-label">全部时间 / all time</p>
  <div class="dzp-preview-host" id="h">${allTime}</div>
  <p class="dzp-preview-label">设置面板的滚动列里 / inside the settings column</p>
  <div class="dzp-preview-frame" id="k">
    <div class="dzp-preview-frameHead">
      <span class="dzp-preview-frameAction">打开配置文件</span>
      <span class="dzp-preview-frameClose">✕</span>
    </div>
    <div class="dzp-preview-options">${inFrame}</div>
  </div>
</div>
</body>
</html>
`

// The page markup carries no theme of its own: the shell's tokens flip on the
// body attribute, so one capture is enough to write both pages.
const pages = EXPLICIT
  ? [[OUT, '']]
  : [[OUT, ''], [join(dirname(OUT), 'plan-page-dark.html'), ' data-ds-dark-theme']]
for (const [path] of pages) mkdirSync(dirname(path), { recursive: true })
for (const [path, darkAttribute] of pages) {
  writeFileSync(path, page.replaceAll('@@DARK@@', darkAttribute))
  console.log(`preview: wrote ${path}`)
}
console.log(`preview: ${signedIn.length} bytes of signed-in markup, ${dialog.length} of dialog markup`)
// jsdom's visual mode leaves a frame loop running, so the process does not
// drain on its own; the file is written and flushed by now.
process.exit(0)
