/**
 * Offline integration smoke for the Zhipu web-backend wiring.
 *
 * Runs the built host bundle (`lib/index.js`) inside a real Cordis Context with
 * fake host services, and drives the runtime switches, agent events, and the
 * teardown path to observe what the service registers, which additional tools
 * it mounts, and that the `web` row is never pointed at the Zhipu providers
 * (only residue from older builds is cleaned). No network, no harness CLI.
 *
 * @module dsh-zhipu-plan/scripts/integration-smoke
 */
import { Context } from '@deepseek-ai/cordis'
import ZhipuPlanService from '../lib/index.js'

let failures = 0
function check(name, ok, extra) {
  if (ok) console.log(`PASS ${name}`)
  else { failures += 1; console.error(`FAIL ${name}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`) }
}
const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const rejections = []
process.on('unhandledRejection', error => { rejections.push(error); console.error('UNHANDLED REJECTION', error) })

const BASE_ROW = { searchProvider: 'deepseek-official', fetchProvider: 'http' }
const ZHIPU_ROW = { searchProvider: 'zhipu-web-search-prime', fetchProvider: 'zhipu-web-reader' }

const flags = { search: true, reader: true, zread: false, zhPrompt: false }
const accountPayload = {
  deployment: 'bigmodel',
  planKind: 'individual-coding-plan',
  accountId: 'acc-1',
  accountLabel: 'Smoke Account',
  accessToken: 'access-token',
  zcodeJwt: 'jwt-token',
  signedInAt: Date.now(),
  accessTokenExpiresAt: undefined,
  jwtExpiresAt: undefined,
}
const state = {
  accountStored: true,
  providerRegistrations: new Map(),
  // Residue an older build left behind: the row starts pointed at Zhipu and
  // the new code must restore it to the inherited backends without ever
  // writing the pointers back.
  rowEntry: { options: { id: 'web', name: '@deepseek-ai/dsh-web', config: { ...ZHIPU_ROW } } },
  webEdits: [],
  globalTools: new Map(),
  promptSections: new Map(),
  agents: [],
  builtinWebSearchVisible: true,
  minimalAgent: null,
  normalAgent: null,
  minimalDenies: [],
  agentTools: new Map(),
}

const fakeCredentials = {
  async readRecord() {
    return state.accountStored ? { kind: 'grant', payload: accountPayload } : undefined
  },
  async resolve() {
    return state.accountStored ? { value: 'fake-plan-key' } : undefined
  },
  async set() {}, async unset() {}, async modifyRecord() {},
}
const fakeAuthorization = { registerFlow() { return () => {} } }
const fakeSettings = {
  describe() { return [] }, // the web row is not volatile on rc.1
  async mutate() { throw new Error('settings.mutate must not be used for the non-volatile web row') },
}
const fakeWeb = {
  registerSearchProvider(provider) {
    if (state.providerRegistrations.has(provider.id)) throw new Error(`already registered: ${provider.id}`)
    state.providerRegistrations.set(provider.id, 'search')
    return () => state.providerRegistrations.delete(provider.id)
  },
  registerFetchProvider(provider) {
    if (state.providerRegistrations.has(provider.id)) throw new Error(`already registered: ${provider.id}`)
    state.providerRegistrations.set(provider.id, 'fetch')
    return () => state.providerRegistrations.delete(provider.id)
  },
}
const fakeToolsRoot = {
  register(definition) {
    state.globalTools.set(definition.name, definition)
    return () => state.globalTools.delete(definition.name)
  },
  get(name, scope) {
    if (name === 'web_search') {
      const visible = scope?.builtinWebSearchVisible ?? state.builtinWebSearchVisible
      return visible ? { name: 'web_search' } : undefined
    }
    return state.globalTools.get(name)
  },
  restrict() { throw new Error('root tools.restrict must not be called') },
}
for (const agent of ['minimal', 'normal']) {
  state.agentTools.set(agent, {
    definitions: new Map(),
    register(definition) {
      this.definitions.set(definition.name, definition)
      return () => this.definitions.delete(definition.name)
    },
    restrict(filter) {
      state.minimalDenies.push(filter)
      return () => {}
    },
    get(name) { return this.definitions.get(name) },
  })
}
const fakeSystemPrompt = {
  section(section) {
    state.promptSections.set(section.name, section)
    return () => state.promptSections.delete(section.name)
  },
}
const fakeAgents = { list() { return [...state.agents] } }
const fakeAgentPresets = {
  composedPreset(agentCtx) { return agentCtx?.presetId ?? 'standard' },
}
const fakeConfigEditor = {
  entries() { return [state.rowEntry] },
  async edit(entry, change) {
    const inherited = { ...BASE_ROW }
    const resolved = { ...(entry.options.config ?? {}) }
    const next = await change(resolved, inherited)
    state.webEdits.push({ next, restore: same(next, inherited) })
    entry.options.config = same(next, inherited) ? { ...inherited } : { ...next }
    return entry
  },
}

const ctx = new Context()
ctx.baseUrl = 'file:///tmp/zhipu-plan-smoke/'
ctx.provide('credentials', fakeCredentials)
ctx.provide('authorization', fakeAuthorization)
ctx.provide('settings', fakeSettings)
ctx.provide('web', fakeWeb)
ctx.provide('tools', fakeToolsRoot)
ctx.provide('systemPrompt', fakeSystemPrompt)
ctx.provide('agents', fakeAgents)
ctx.provide('agentPresets', fakeAgentPresets)
ctx.provide('configEditor', fakeConfigEditor)

const leaf = () => `[ZHIPU_CONTENT_FILTERED]`
void leaf

const config = {
  relayBaseUrl: 'http://127.0.0.1:1/api/v1',
  requestTimeoutMs: 1_000,
  loginTimeoutMs: 1_000,
  bigmodelApiOrigin: 'https://open.bigmodel.cn',
  zaiApiOrigin: 'https://api.z.ai',
  zcodeApiOrigin: 'https://zcode.z.ai',
  planKeyEnvs: { bigmodel: 'DSH_ZHIPU_PLAN_KEY', zai: 'DSH_ZHIPU_PLAN_KEY_ZAI' },
  // Plain booleans: the Cordis plugin system validates them against the rigid
  // static Config schema, then wraps the volatile fields itself.
  search: true,
  reader: true,
  zread: false,
  zhPrompt: false,
}

// The plugin system wraps volatile fields; point them at the live flag object so
// this smoke can drive the same getters a `loader/volatile-update` would expose.
const liveFlag = get => ({ get })
const fiber = await ctx.plugin(ZhipuPlanService, config)
const service = ctx.zhipuPlan
service.config.search = liveFlag(() => flags.search)
service.config.reader = liveFlag(() => flags.reader)
service.config.zread = liveFlag(() => flags.zread)
service.config.zhPrompt = liveFlag(() => flags.zhPrompt)
await tick(120)

const ZREAD_NAMES = ['github_search_doc', 'github_get_repo_structure', 'github_read_file']
const ALL_EXTRA_TOOLS = ['zhipu_web_fetch', 'zhipu_web_search', ...ZREAD_NAMES]

check('init: both web providers registered', state.providerRegistrations.has('zhipu-web-search-prime') && state.providerRegistrations.has('zhipu-web-reader'), [...state.providerRegistrations.keys()])
check('init: residue web row restored to the inherited backends', same(state.rowEntry.options.config, BASE_ROW), state.rowEntry.options.config)
check('init: residue cleanup was the only row edit', state.webEdits.length === 1 && state.webEdits[0].restore === true, state.webEdits)
check('init: additional zhipu_web_search tool mounted', state.globalTools.has('zhipu_web_search'), [...state.globalTools.keys()])
check('init: tool:zhipu_web_search prompt section mounted', state.promptSections.has('tool:zhipu_web_search'), [...state.promptSections.keys()])
check('init: additional zhipu_web_fetch tool mounted', state.globalTools.has('zhipu_web_fetch'), [...state.globalTools.keys()])
check('init: tool:zhipu_web_fetch prompt section mounted', state.promptSections.has('tool:zhipu_web_fetch'), [...state.promptSections.keys()])
check('init: built-in web_search untouched in the row', state.rowEntry.options.config.searchProvider !== 'zhipu-web-search-prime')

// Hot switch: search off must unmount only the additional search tool.
flags.search = false
ctx.emit('loader/volatile-update')
await tick(160)
check('hot switch: zhipu_web_search tool unmounted', !state.globalTools.has('zhipu_web_search'), [...state.globalTools.keys()])
check('hot switch: tool:zhipu_web_search section unmounted', !state.promptSections.has('tool:zhipu_web_search'))
check('hot switch: zhipu_web_fetch tool kept', state.globalTools.has('zhipu_web_fetch'), [...state.globalTools.keys()])
check('hot switch: web row untouched', same(state.rowEntry.options.config, BASE_ROW), state.rowEntry.options.config)

// zread on: three global tools + three prompt sections on top of the fetch tool.
flags.zread = true
ctx.emit('loader/volatile-update')
await tick(120)
for (const name of ZREAD_NAMES) {
  check(`zread: global tool ${name} registered`, state.globalTools.has(name))
  check(`zread: prompt section tool:${name} mounted`, state.promptSections.has(`tool:${name}`))
}

// Minimal agent: scoped deny covers exactly the mounted additional tools
// (fetch + zread at this point, search is still off).
const minimalCtx = { presetId: 'minimal', get: name => name === 'tools' ? state.agentTools.get('minimal') : undefined }
state.minimalAgent = { id: 'agent-minimal', session: { header: { id: 'session-minimal' }, id: 'session-minimal' }, ctx: minimalCtx }
state.agents = [state.minimalAgent]
ctx.emit('agent/created', { agent: state.minimalAgent })
await tick(80)
check('minimal agent: restrict deny covers the mounted subset',
  state.minimalDenies.some(filter => same([...filter.deny].sort(), ['github_get_repo_structure', 'github_read_file', 'github_search_doc', 'zhipu_web_fetch'])),
  state.minimalDenies)

// Normal agent: global tools cover it, so nothing is registered on its scope.
const normalCtx = {
  presetId: 'standard',
  builtinWebSearchVisible: true,
  get: name => name === 'tools' ? state.agentTools.get('normal') : undefined,
}
state.normalAgent = { id: 'agent-normal', session: { header: { id: 'session-normal' }, id: 'session-normal' }, ctx: normalCtx }
state.agents = [state.minimalAgent, state.normalAgent]
ctx.emit('agent/created', { agent: state.normalAgent })
await tick(80)
check('normal agent: no tool registered on the agent scope', state.agentTools.get('normal').definitions.size === 0, [...state.agentTools.get('normal').definitions.keys()])
check('normal agent: no deny applied to the normal scope', state.minimalDenies.length === 1, state.minimalDenies)

// Re-enable search: the tool returns and the minimal deny grows to the full set.
flags.search = true
ctx.emit('loader/volatile-update')
await tick(160)
check('hot switch: zhipu_web_search tool remounted', state.globalTools.has('zhipu_web_search'), [...state.globalTools.keys()])
check('minimal agent: deny now covers every mounted additional tool',
  state.minimalDenies.some(filter => same([...filter.deny].sort(), ALL_EXTRA_TOOLS.slice().sort())),
  state.minimalDenies)
check('hot switch: web row still never pointed at Zhipu', same(state.rowEntry.options.config, BASE_ROW), state.rowEntry.options.config)
check('hot switch: no extra row edits', state.webEdits.length === 1, state.webEdits)

// zhPrompt flip: every mounted tool surface rebuilds in the new language.
const beforeDesc = state.globalTools.get('zhipu_web_search').description
flags.zhPrompt = true
ctx.emit('loader/volatile-update')
await tick(160)
check('zhPrompt flip: tool descriptions rebuilt', state.globalTools.get('zhipu_web_search')?.description !== beforeDesc && /智谱/.test(state.globalTools.get('zhipu_web_search')?.description ?? ''), state.globalTools.get('zhipu_web_search')?.description?.slice(0, 40))
flags.zhPrompt = false
ctx.emit('loader/volatile-update')
await tick(160)

// Foreign pointer: a row pointing at another provider's backend is left alone.
state.rowEntry.options.config = { searchProvider: 'acme-search', fetchProvider: 'http' }
flags.search = false
flags.reader = false
ctx.emit('loader/volatile-update')
await tick(160)
check('foreign pointer: another provider row value is never cleared', state.rowEntry.options.config.searchProvider === 'acme-search', state.rowEntry.options.config)
check('hot switch: all additional web tools unmounted', !state.globalTools.has('zhipu_web_search') && !state.globalTools.has('zhipu_web_fetch'), [...state.globalTools.keys()])

// Teardown: the disposer flags the restore and the init-time poller performs it
// once the loader transaction settled, so wait for the async reconcile.
state.rowEntry.options.config = { ...ZHIPU_ROW }
await fiber.dispose()
for (let attempt = 0; attempt < 60 && !same(state.rowEntry.options.config, BASE_ROW); attempt += 1) await tick(50)
check('teardown: residue web row restored to the inherited row', same(state.rowEntry.options.config, BASE_ROW), state.rowEntry.options.config)
check('teardown: providers unregistered', state.providerRegistrations.size === 0, [...state.providerRegistrations.keys()])
check('teardown: every additional tool unmounted', [...state.globalTools.keys()].filter(name => ALL_EXTRA_TOOLS.includes(name)).length === 0, [...state.globalTools.keys()])
check('teardown: every additional prompt section unmounted', [...state.promptSections.keys()].filter(name => name.startsWith('tool:zhipu_') || name.startsWith('tool:github_')).length === 0, [...state.promptSections.keys()])
check('teardown: no unhandled rejection', rejections.length === 0, rejections.map(error => String(error)))

if (failures > 0) {
  console.error(`\nINTEGRATION SMOKE FAILED: ${failures} check(s)`)
  process.exitCode = 1
} else {
  console.log('\nINTEGRATION SMOKE OK: additional tools, residue cleanup, agent scopes, and teardown all behave')
}
