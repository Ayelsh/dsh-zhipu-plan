# Host recon — `add-zhipu-mcp-tools` (DSH 0.2.0-rc.1)

Read-only recon of the host checkout `/home/ayelsh/workspace/deepseek-harness`
(git HEAD 4878cdabd8, release 0.2.0-rc.1; all package versions below are
0.2.0-rc.1). The running desktop GUI's `app.asar` under
`/mnt/d/kjProject/DSH-Harness/resources` contains the string `0.2.0-rc.1`, and
`apps/cli/lib/bin.js --version` prints `0.2.0-rc.1`, so this checkout matches
the installed desktop host. Line numbers are from that working tree.

Context already gathered by other teammates: `src/host/mcp.ts`,
`web-search.ts`, `web-reader.ts`, `zread.ts` exist in the repo working tree
(in-flight work — recon did not touch them).

---

## Q1. `web` settings row (namespace, keys, provider resolution)

**Verdict:** The namespace is the profile-patch row id, literally `web`
(`@deepseek-ai/dsh-web`). Config keys are `searchProvider?: string` and
`fetchProvider?: string`, with **no defaults in the schema** (the base bundle
patch supplies `deepseek-official` / `http`). The row is **not volatile**, so
`settings.describe()` omits it and `settings.mutate('web', …)` throws
`Plugin entry "web" has no volatile fields`. Provider selection is resolved
on every `search()`/`fetch()` call from a **construction-time cached**
configured id plus the live provider registry; there is no re-selection event
and **no fallback** when the configured id is missing/unavailable.

**Evidence:**
- `packages/web/web/src/index.ts:55-61` — `WebRuntimeConfig { searchProvider?: string; fetchProvider?: string }`.
- `packages/web/web/src/index.ts:80-83` — `static Config: z<WebRuntimeConfig> = z.object({ searchProvider: z.string(), fetchProvider: z.string() })` — no `.defaults`, no `.volatile()`.
- `packages/web/web/src/index.ts:91-94` — ctor caches `this.searchProviderId = config.searchProvider ?? process.env.DSH_WEB_SEARCH_PROVIDER` (same for fetch / `DSH_WEB_FETCH_PROVIDER`).
- `packages/web/web/src/index.ts:103-135` — `registerSearchProvider(provider): () => void` / `registerFetchProvider(provider): () => void`; duplicate id throws `WebError('a web provider with id "<id>" is already registered', 'WEB_DUPLICATE_PROVIDER')`; registration effect is owned by the web service ctx and the returned disposer is synchronous (`() => void dispose()` of a discarded promise).
- `packages/web/web/src/index.ts:170-193` — `resolveProvider(configuredId, providers)`: registered+available → provider; registered but `available()` false → `WebError('configured web provider "<id>" is registered but unavailable', 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')`; not registered → `'configured web provider "<id>" is not registered'` / `WEB_PROVIDER_CONFIGURED_MISSING`; no configured id → one usable provider wins, none → `'no usable web provider is registered'` / `WEB_PROVIDER_UNAVAILABLE`, several → `'multiple usable web providers are registered (…); configure one explicitly'` / `WEB_PROVIDER_AMBIGUOUS`.
- `packages/web/web/src/index.ts:196-200` — `capSources()` slices `sources` to `request.maxResults` and forces `truncated: true`.
- `packages/bundle/base/cordis.patch.yml:475-483` — `- id: web / name: '@deepseek-ai/dsh-web' / config: { searchProvider: deepseek-official, fetchProvider: http }` plus `web-search-deepseek` (`apiKeyEnv: DEEPSEEK_API_KEY`), `web-fetch-http`, `tool-web`.
- `packages/settings/settings/src/index.ts:302-309` — `describe()` skips entries whose schema has no volatile form; `:377-388` — `write()` throws `Plugin entry "<ns>" has no volatile fields`.

**Confidence:** high (verified by reading; corroborated by
`--dump-config --profile test-install`, which shows the `web` row with that
config, and by the absence of any `.volatile()` in the web schema).

**IMPACT for our service.ts:** design.md D2 (“runtime `settings.mutate('web', ops)`”)
**cannot work on 0.2.0-rc.1**. Use the generic config writer instead:
`ctx.get('configEditor').edit(webEntry, (current, inherited) => next)` — it
writes the profile patch YAML and reconciles the loader tree (see Q2/Q10).
Probe first for forward compatibility: if `settings.describe()` contains an
entry with `ns === 'web'`, prefer `settings.mutate('web', ops)`; otherwise
fall back to `configEditor.edit`.

---

## Q2. `settings.mutate` — signature, op shape, persistence

**Verdict:** `mutate(ns, ops, expectedRevision?)` where `ns` is the
profile-patch row id and paths are **relative to that row's config root**;
ops are exactly `{op:'set', path, value}` and `{op:'unset', path}`. `unset`
reverts to the inherited/base value. Writes go through `configEditor.edit` to
the profile's patch document (`profileContext.patchPath`) atomically, i.e. they
**persist**, and are applied through the ordinary Loader reconcile. Mutation
is refused unless the target field(s) are volatile: `No configurable plugin
entry "<ns>"`, `Plugin entry "<ns>" has no volatile fields`, `Config field
"<path>" is not volatile`; a mismatched `expectedRevision` raises
`SettingsConflictError` code `SETTINGS_CONFLICT`. `mutate` awaits
`configEditor.edit` (and `edit` serialises through the profile file lock /
`hmr.runExclusive`), so sequential awaited mutations are ordered; concurrent
mutations should pass `expectedRevision`.

**Evidence:**
- `packages/settings/settings/src/index.ts:81-83` — `SettingsPathOp = { op:'set'; path: readonly string[]; value: unknown } | { op:'unset'; path: readonly string[] }`.
- `packages/settings/settings/src/index.ts:367-375` — `mutate(ns, ops, expectedRevision?)` → `write(ns, (current, base, schema) => ops.reduce(...))`; unset computes `inherited = op.path.reduce((node,key)=>member(node,key,true), base)` and applies `{op:'set', value: inherited}` when defined.
- `packages/settings/settings/src/index.ts:377-423` — `write()` finds the entry via `configEditor.entries().find(row => row.options.id === ns)`, gates on `volatileForm(schema)`, then `await configEditor.edit(entry, …)`; `:424` — `await this.describe()` after edit.
- `packages/settings/settings/src/index.ts:302-340` — `describe()` item: `{ ns, autoGenerate, schema, value, revision, base?, user?, applies: 'live', secrets? }` ("live" for volatile entries).
- `packages/settings/settings/src/index.ts:377-423` + `packages/boot/config-editor/src/index.ts:87-155` — `configEditor.edit()` writes `documentPath` (= `profileContext.patchPath`) atomically with `writeFileAtomic(path, 0o600)`, then `reconcileProfilePatches(root, patches, 'dsh', [entry.options.id])`; errors on overridden rows: `Configuration for "<id>" is overridden by a home patch or command-line overlay`; if `next` equals `inherited` the row's `config` key is removed (falls back to bundle/base value).
- `packages/settings/settings/src/index.ts:45-64` — `SettingsConflictError` / `SETTINGS_CONFLICT`.
- Existing intended pattern: `src/host/service.ts:594-608` `syncProviderRoutes()` reads `settings.describe().find(d => d.ns === 'llm-pi-ai')` and calls `await this.ctx.settings.mutate('llm-pi-ai', ops)`; it works because `packages/llm/llm-pi-ai/src/config.ts:353` declares `providers: z.dict(profile).default({}).volatile()`.

**Confidence:** high.

**IMPACT for our service.ts:** keep `settings.mutate('llm-pi-ai', ops)` as-is for
provider routes. For `web`, do **not** call the volatile-gated settings API
unless a `web` descriptor exists (future host). Use `configEditor.edit` with the
same idempotent set/unset semantics, and restore by returning the inherited
config (deletes the row's `config` key, so the bundle default applies again).

---

## Q3. Volatile plugin Config and `loader/volatile-update`

**Verdict:** The API is schemastery `.volatile()` (not `meta({volatile:true})`).
It produces a `Volatile<T>` ref in the resolved config; the Loader detects a
volatile-only config change and commits the new values **in place** through
`updateVolatile`, then emits `loader/volatile-update(paths)` **only to the
owning plugin fiber**. The `config` object handed to the service constructor
stays live for volatile fields — read `this.config.<field>.get()`; ordinary
fields are plain values that only change by remounting the plugin. No loader
service API is needed to re-read config. Listener exceptions are logged and
never fail the update. The event carries only changed paths; every value is
committed before dispatch.

**Evidence:**
- `vendor/schemastery/src/index.ts:480-483` — `Schema.prototype.volatile() { … return this.extra('volatile', true) }`; `:245-247` — `SchemaMode` maps `'volatile'` → `Volatile<T|undefined>`, `'volatile-defined'` → `Volatile<T>`; nesting rejected: `volatile fields require a fixed object path without an enclosing volatile field`.
- `vendor/cosmokit/src/volatile.ts:9-12,39-45,84` — `interface Volatile<T> { get(): VolatileSnapshot<T> }`, `createVolatile`, `updateVolatile(target, source)` = in-place write.
- `vendor/loader/src/config/entry.ts:141-157` — `update()` sets `volatileOnly = changes.length === 1 && changes[0] === 'config' && fiber ACTIVE && proto unchanged && equalExceptVolatile(legacy.config, newConfig, fiber.runtime?.Config)`; volatile-only → `this.fiber._config = this.options.config` and no remount.
- `vendor/loader/src/config/entry.ts:168-195` — `_commitVolatile()`: resolves the candidate config through `internal/config` waterfall, bails to ordinary reload if non-volatile values differ, else `updateVolatile(ref, source)` per changed path and `fiber.ctx.emit(self, 'loader/volatile-update', paths)` where `self` is a filtered ctx (`owner.fiber === fiber`); listener exceptions are caught with `logger.warn`.
- `vendor/loader/src/index.ts:30-34` — `interface Events { 'loader/volatile-update'(paths: readonly (readonly string[])[]): void }`; doc: dispatched to the owning fiber only.
- Consumer example: `packages/llm/llm-pi-ai/src/index.ts:310-316` — `ctx.on('loader/volatile-update', () => { … this.config.providers.get() … })`; another: `packages/preset/agent-preset-registry/src/index.ts:50-56` — `selectedDefault: z.string().volatile()` + `get defaultId() { return this.config.selectedDefault.get() ?? this.config.default }`.

**Confidence:** high.

**IMPACT for our service.ts:** add the four switches to `Config` in
`src/host/service.ts` (interface at :136, schema at :165) as
`search: z.boolean().default(true).volatile()` etc. The resolved type is
`Volatile<boolean>`, so read via a small `switchOn(field)` helper
(`config.search.get()`), and wire
`this.ctx.on('loader/volatile-update', () => { this.refresh() })` inside
`[Service.init]` (wrapped in try/catch; the listener can be sync). Note: a
profile edit that changes **ordinary** config fields remounts our plugin, and
the constructor then receives a fresh plain config — no extra handling needed.

---

## Q4. `tools` runtime API — register / get / restrict, scope rules

**Verdict:** `ctx.tools` and `ctx.get('tools')` both resolve the same
`ToolRuntime` service, on root and agent contexts. Cordis wraps service access
in a *traceable proxy* (`vendor/cordis/src/utils.ts:117-200`) whose
`this.ctx` inside every method is the **context used for the access**, so
`agent.ctx.get('tools').restrict(...)` is scoped to that agent while
`this.ctx.tools.register(...)` (from our root-owned service) is global.
`register(definition)` attaches to the calling ctx scope (root → global;
`agent.ctx` → agent-scoped; scoped registrations shadow globals and are never
masked by restrictions) and returns the exact disposer. `get(name, scope?)`'s
second argument is a `ScopeKey` (an opaque object; **the Agent object itself is
the key**, `packages/core/agent-loop/src/agent.ts:130` `createScope(loopCtx, this)`) and returns `undefined` for unknown/restricted-away names. `restrict({allow?,deny?})`
requires a scoped ctx (calling it on a root context throws verbatim
`tools.restrict() requires a scoped context (agent.ctx): a context-global
restriction would mask every agent — deny the tool for the intended agent
instead`), rejects empty filters and unknown/`run_code` names, only filters
**inherited/global** names (never the scope's own registrations), intersects
along the scope chain, and returns a disposer.

**Evidence:**
- `packages/core/tools/src/index.ts:137-142` — `declare module '@deepseek-ai/cordis' { interface Context { tools: ToolRuntime } }`.
- `packages/core/tools/src/index.ts:1063-1088` — `register(definition: ToolDefinition): () => void`, output validation (`tool "<name>" must declare output { schema, render, presentationMeta? }`), `assertSupportedJsonSchema`, `timeoutMs` positive, `run_code` reservation, `this.layers.effect(this.ctx, …)`.
- `packages/core/tools/src/index.ts:1097-1124` — `restrict(filter: ToolRestriction): () => void`; `const scope = scopeOf(this.ctx)`; errors quoted above; `const known = this.view(scope).restrictableNames`; effect appends `CompiledToolRestriction`.
- `packages/core/tools/src/index.ts:1230-1232` — `get(name: string, scope?: ScopeKey): ToolDefinition | undefined { return this.view(scope).visible.get(name) }`; `schemas(scope?)` at :1260.
- `packages/core/tools/src/index.ts:1177-1215` — `view()`: inherited names from global layer + scope-chain ancestor layers, restrictions (`layer.admits`) filter only inherited entries, own layer entries are added last (shadow, unrestricted), `run_code` appended outside filters.
- `vendor/cordis/src/utils.ts:117-200` — traceable proxy: `if (prop === tracker.property) return ctx`, method calls rebound to caller ctx (`newProxy … this.ctx` = accessing context); `vendor/cordis/src/service.ts:29-57` (`tracker = { associate: name, property: 'ctx' }`).
- Tests proving the model: `packages/core/tools/tests/scoped.spec.ts:127-199,225-246` (`scope.ctx.tools.restrict(...)`, `ctx.tools.get('mine', key)`, root-call throws `/requires a scoped context/`).
- `packages/core/scope/src/index.ts:15` — `export type ScopeKey = object`; `:137-160` — `createScope(ctx, key)` writes the `kScope` tag and `scopeOf(ctx)` reads it.
- `packages/core/agent-loop/src/agent.ts:130` — `this.scope = createScope(loopCtx, this)` (Agent is the ScopeKey).

**Confidence:** high.

**IMPACT for our service.ts:**
- Register the three `github_*` tools on the **root** ctx (`this.ctx.tools.register`)
  when `zread` is on — they must be global (inherited) for the minimal-agent
  `restrict({deny})` to be able to mask them.
- Register the shadow `web_search` on `agent.ctx.get('tools')` per agent
  (own layer shadows the global tool and survives restrictions).
- Only call `get('web_search', agent)` with the Agent object; never with
  `agent.ctx`.
- Restrict for minimal agents: `agent.ctx.get('tools').restrict({ deny })`,
  where `deny` must only name **currently existing global** tools or it throws;
  wrap in try/catch and recompute at enable/disable time.

---

## Q5. `ToolDefinition` shape and `defineTool`

**Verdict:** Structural objects are accepted by `tools.register`; the
recommended helper is `defineTool` exported by `@deepseek-ai/dsh-tools`
(0.2.0-rc.1), which compiles author-facing `parameters`/`output.schema` specs
into the supported JSON-Schema subset, validates args before `execute`, and
softly validates presenters. Required: `name`, `description`, `parameters`,
`output` object with `schema` and `render` (a function returning
`ContentBlock[]`); `presentationMeta` is optional *but must be a function when
present*. Optional: `execute(args, exec: ToolRunContext): Promise<unknown>`,
`timeoutMs` (positive finite), `isConcurrencySafe?(args): boolean` (**function,
not boolean**; only an exact `true` return opts into parallel execution),
`presentCall?(args): ToolCallView|undefined`,
`presentResult?(args, result: ToolResult): ToolResultView|undefined`,
`deferLoading?`, `projectContent?`, `finalizeContent?`. The run context
(`ToolRunContext`) carries `callId`, `rootCallId`, `name`, `arguments`,
`agent?: Agent`, `parent?`, `signal: AbortSignal`, `token`, plus
`deferContext(context)` and `concludeTurn()`. `run_code` is reserved and
cannot be registered/shadowed.

**Evidence:**
- `packages/core/tools/src/index.ts:213-298` — `ToolOutputDefinition` (`schema`, `render(args,value): ContentBlock[]`, `presentationMeta?(args,value): JsonValue`), `ToolDefinition extends ToolSchema` with `execute`, `timeoutMs?`, `isConcurrencySafe?`, `presentCall?`, `presentResult?`.
- `packages/core/tools/src/index.ts:326-352` — `ToolExecutionInput`; `:418-435` — `ToolExecution` / `ToolRunContext` (`deferContext`, `concludeTurn`).
- `packages/core/tools/src/schema.ts` — `defineTool` options/implementation (author-facing per-property parameter spec, output value schema compiled via `parameterSchemaSpecToJsonSchema`, `ToolArgsError` on bad args, presenters return `undefined` on mismatch).
- Built-in example verbatim-ish: `packages/web/tool-web/src/search.ts` — `export const inject = ['tools','web','systemPrompt']`; `ctx.tools.register(defineTool({ name: 'web_search', description, parameters: { queries: { type: 'array', required: true, items: { type: 'string' }, description } }, output: { schema: { type: 'object', additionalProperties: false, properties: { content: { type: 'string' }, sources: { type: 'array', required: true, items: { type: 'object', … } }, truncated: { type: 'boolean', required: true } } }, render: (_args, value) => [{ type: 'text', text: formatSearchOutput(value) }], presentationMeta: (_args, value) => searchMetaFromValue(value) }, timeoutMs, isConcurrencySafe: () => true, async execute(args, exec) { … await runSearchQueries(ctx, queries, maxResults, exec.signal) }, presentCall: presentSearchCall, presentResult: (args, result) => presentSearchResult(args, result) }))`.
- Package: `@deepseek-ai/dsh-tools` 0.2.0-rc.1 (`packages/core/tools/package.json`); callers import `defineTool` from it (e.g. `packages/schedule/schedule/src/tools.ts:9`, `packages/plan/plan-mode/src/index.ts:33`).

**Confidence:** high.

**IMPACT:** use `defineTool` from `@deepseek-ai/dsh-tools` for the zread tools and
the shadow `web_search`; keep full-JSON-Schema `parameters` as tasks.md says
(defineTool accepts author-facing specs, so either pass specs or hand-write the
JSON Schema and pass it through `defineTool`'s schema wrapper — the repo already
has structural definitions in `src/host/web-search.ts` to reuse).

---

## Q6. `systemPrompt.section` API

**Verdict:** Signature is
`section(section: PromptSection): () => void` with
`PromptSection = { name: string; order: number; text: string | ((context: AssembleContext) => string); interpolate?: boolean; complete?: boolean }`.
`order` must be finite; duplicate `name` within one layer throws. Registration
scope is the **calling context**: from our root service ctx it is a global
section (visible to every agent); from `agent.ctx` it is agent-local and
shadows a same-name global section. The disposer is the exact Cordis effect
disposer. `text` as a function receives `AssembleContext { scope?: ScopeKey; signal?: AbortSignal; agent?: Agent }` — so a section can read volatile
switches and call `ctx.tools.get(name, scope)` at assembly time (this is how
built-ins self-suppress). Built-in web section names/orders:
`tool:web_search` at `getSectionOrder('TOOL_WEB_SEARCH')` (= 2000) and
`tool:web_fetch` at `TOOL_WEB_FETCH` (= 2100).

**Evidence:**
- `packages/core/system-prompt/src/index.ts:79-113` — `PromptSection`; `:41-51` — `AssembleContext`; `:453-466` — `section()` validates and registers `this.layers.effect(this.ctx, layer => layer.sections.insert(section.name, section), { label: 'systemPrompt.section()' })`.
- `packages/core/system-prompt/src/index.ts:124-156` — `SECTION_ORDERS` incl. `TOOL_WEB_SEARCH: 2000`, `TOOL_WEB_FETCH: 2100`; `getSectionOrder(name)`.
- `packages/web/tool-web/src/search.ts:315-325` — `ctx.systemPrompt.section({ name: 'tool:web_search', order: ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH'), text: ({ scope }) => ctx.tools.get('web_search', scope) === undefined ? '' : … })`; `packages/web/tool-web/src/fetch.ts:448-449` — same for `tool:web_fetch`.
- `packages/core/system-prompt/src/index.ts:14-18` — `declare module '@deepseek-ai/cordis' { interface Context { systemPrompt: SystemPrompt } }`.

**Confidence:** high.

**IMPACT:** register the three `tool:github_*` sections globally from the service
ctx, with `order` values in a stable range (e.g. 2000/2010/2020, or
`ctx.systemPrompt.getSectionOrder('TOOL_WEB_SEARCH')`-relative). Use
`text: () => this.zreadEnabled() ? (this.zhPromptEnabled() ? zh : en) : ''`
so volatile toggle and zh/en take effect without re-registration; keep names
unique per layer and guard duplicate-name errors when the service restarts.

---

## Q7. Agent lifecycle events, presets, enumeration, session→agent

**Verdict:** Events are declared in `packages/core/agent/src/runtime-types.ts`:
- `'agent/created'(this: Scoped<Agent>, payload: { agent: Agent; source: SessionStartSource; signal?: AbortSignal }): undefined | Promise<undefined>` — `@mode serial`, awaited before creation resolves; a throwing listener fails creation.
- `'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void` — `@mode emit`, listener failures contained.
- `'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void` — **two positional args**, re-emitted by `packages/preset/agent-preset-registry/src/index.ts:69` from `session/event` (`event.type === 'agent-preset/selected'`).

The payload Agent has `agent.ctx` (agent-scoped context), and the Agent object
itself is the tools `ScopeKey`. `agentPresets.composedPreset(ctx: Context): string | undefined`
takes a **Context** (pass `agent.ctx`) and returns the preset id from the
standing mount, or `undefined`. The "minimal" preset id literal is `minimal`
(`packages/bundle/web-app/presets/minimal.patch.yml` inserts a row with
`config.id: minimal`). Enumerate with `ctx.get('agents').list(): Agent[]`
(registration order) or `roots()`; resolve from session id with
`ctx.get('agents').get(sessionId)` (doc: "the shared agent/session id").
**Caveat:** `agent-preset-registry` is mounted by the web-app bundle
(`packages/bundle/web-app/cordis.patch.yml:562`), not by the base bundle — the
base-only `test-install` profile's `--dump-config` has no `agent-presets` row,
so `ctx.get('agentPresets')` can be `undefined`; guard it.

**Evidence:**
- `packages/core/agent/src/runtime-types.ts:245-280` — event declarations; `:164-174` — `Agent` gains `options`, `session`, `inbox`, `status`, `ctx: Context`.
- `packages/core/agent/src/index.ts:550` — announce: `await this.ctx.serial(entry.carrier, 'agent/created', { agent: entry.agent, source, …(signal && { signal }) })`; `:514-522` — `agent/disposed` in detach with contained failures; `:245-256` — `class AgentRegistry extends Service` / `super(ctx, 'agents')`; `:566` — `get(id: SessionId): Agent | undefined`; `:586` — `list(): Agent[]`.
- `packages/preset/agent-preset-registry/src/index.ts:25-32` — `ctx.agentPresets` augmentation; `:50-56` — Config `{ default: z.string().required(), selectedDefault: z.string().volatile() }`; `:290` — `composedPreset(ctx: Context): string | undefined { return standingMountFor(ctx)?.presetId }`; `:69` — re-emit.
- `packages/bundle/web-app/presets/minimal.patch.yml` — `config: { id: minimal, order: 3, … }`; sibling `standard.patch.yml`, `ptc.patch.yml`.
- `packages/core/agent-loop/src/agent.ts:130` — `this.scope = createScope(loopCtx, this)` (Agent = ScopeKey).

**Confidence:** high; medium only on ordering minutiae (whether
`agent-preset/selected` is observed before the matching `agent/created` in every
path — make the handler idempotent).

**IMPACT:** in `[Service.init]` register three `ctx.on(...)` handlers, each body
wrapped in try/catch (Cordis emit is a synchronous chain — a throwing listener
propagates into the emitter path):
`agent/created` → `installAgentSurface(payload.agent)`; `agent/disposed` →
dispose stored per-agent effects and delete the map entry; `agent-preset/selected`
→ `const agent = ctx.get('agents')?.get(sessionId); if (agent) installAgentSurface(agent)`.
`installAgentSurface(agent)` must be idempotent (dispose previous first), must
not await inside `agent/created` (serial bar), and must tolerate
`ctx.get('agentPresets')` being undefined. Never listen `tools/change`
(reference plugin note: registering emits it synchronously → infinite
recursion / frozen sessions).

---

## Q8. Provider registration and interfaces

**Verdict:** Yes — a plugin may call
`ctx.get('web').registerSearchProvider(provider)` /
`registerFetchProvider(provider)` on the root ctx during `[Service.init]`.
Provider interfaces have only `id`, `available()`, and the call method — **no
label/description fields**. `available()` must be a cheap local check with no
network call; `false` simply removes the provider from auto-selection and makes
a *configured* id fail with `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` (no
fallback). Fetch bodies are only `{kind:'html'|'text'}` in this host version
(no `json` kind). The web service caps search `sources` to `maxResults` and
sets `truncated`, but passes fetch results through untouched (clamp yourself).
Registering a duplicate id throws `WEB_DUPLICATE_PROVIDER`; registration does
not trigger provider re-selection.

**Evidence:**
- `packages/web/web/src/types.ts:16-26` — `WebSearchRequest { query: string; maxResults?: number }`; `:35-42` — `WebSearchResult { content?: string; sources: readonly WebSearchSource[]; truncated: boolean }`; `:50-56` — `WebSearchSource { url: string; title?; snippet?; publishedAt? }`; `:64-66` — `WebFetchRequest { url }`; `:74-83` — `WebFetchResult { url; statusCode: number; body: WebFetchBody; truncated: boolean }`; `:94-96` — `WebFetchBody = { kind:'html'; content: string } | { kind:'text'; content: string }`; `:102-108` / `:114-120` — `WebSearchProvider { readonly id: string; available(): boolean; search(request, signal?): Promise<WebSearchResult> }`, `WebFetchProvider { … fetch(request, signal?): Promise<WebFetchResult> }`.
- `packages/web/web/src/index.ts:103-135` (registration + duplicate-id error), `:170-193` (resolution rules quoted in Q1), `:196-200` (search cap).
- Base patch rows: `packages/bundle/base/cordis.patch.yml:475-483`.

**Confidence:** high.

**IMPACT:** register both providers early in `[Service.init]` (ids
`zhipu-web-search-prime`, `zhipu-web-reader`), with
`available(): boolean` = cached switch gate (never async/network). Then point
the `web` row at them via `configEditor.edit`. Because editing the non-volatile
`web` row remounts the web service, **re-register the providers after the edit**
(a duplicate-id error means the registration already exists → treat as
success), or defer provider registration until after `syncWebBackends()`.
Return `truncated` explicitly (`false` for search as tasks.md says; `true` when
the reader clamps to 200k chars). Map reader markdown to
`body: { kind: 'text', content }` and include the untrusted-content boundary in
the content.

---

## Q9. Credentials — async-only seam and the sync `available()` gate

**Verdict:** `ctx.get('credentials')` (service `credentials`, package
`@deepseek-ai/dsh-credentials`) exposes only **async** operations:
`resolve(ref): Promise<ResolvedCredential | undefined>` (returns `undefined`
when unconfigured — it does **not** throw), `describe(ref)`,
`set(ref, value)`, `unset(ref)`, `readRecord(key)`, `describeRecord(key)`,
`listRecords()`, `modifyRecord`, `deleteRecord`. There is **no synchronous
availability test**. But it emits `credentials/reference-updated(ref)` and
`credentials/record-updated(key)` (fan-out with contained listener failures),
so a cached sync flag is the sanctioned pattern. Our plan key is stored by the
plugin under refs `DSH_ZHIPU_PLAN_KEY` (bigmodel) / `DSH_ZHIPU_PLAN_KEY_ZAI`
(zai) via `credentials.set`, which writes the `refs:` section of
`$DSH_HOME/.credentials.yaml`; `credentials-local` resolve order is inherited
process env → stored file ref → `.env` fallback (project-env, then user-env).
The reference plugin (0.1.7) sidesteps the missing sync API with
`credentialAvailable(ref)` = non-empty env || regex scan of
`$DSH_HOME/.credentials.yaml` `refs:` (re-read every call, no cache), and
`credentialResolvable(ctx,ref)` = `ctx?.get('credentials') != null || credentialAvailable(ref)`.

**Evidence:**
- `packages/credentials/credentials/src/index.ts:149-160` — `declare module '@deepseek-ai/cordis' { interface Context { credentials: CredentialProvider } }`; abstract class methods `resolve` (:183), `describe` (:184+), `set`, `unset`, `readRecord`, `describeRecord`, `listRecords`.
- `packages/credentials/credentials/src/types.ts:90,102` — `'credentials/reference-updated'(ref: CredentialRef): void`, `'credentials/record-updated'(key: CredentialKey): void`.
- `packages/credentials/credentials-local/src/index.ts:609-616` — `resolve()`: `inherited(ref)` env → `{ value, source:'env' }`; `this.values.get(ref)` → `'file'`; `dotenvFallback` → entry source; else `undefined`; `:618-631` — `describe()`; `:633-641` — `set/unset`; `:643-647` — `readRecord`.
- Repo: `src/host/service.ts:576-578` — `planKeyRef(deployment) = credentialRef(this.config.planKeyEnvs[deployment])`; `:620-630` — `planKeyFor` uses `await this.ctx.credentials.resolve(ref).then(r => r?.value)`; `:798-824` — `storePlanCredential()` calls `credentials.set(this.planKeyRef(account.deployment), resolution.key)` then unsets the previous deployment ref; `:827-834` — `onSignedOut()` unsets both refs; account record key `credentialKey('zhipu-plan','account')` (`src/host/record.ts:13,17`).
- Reference `/tmp/refpkg/package/src/credentials.ts` — `credentialAvailable`, `resolveApiKey` (service resolve → process.env → `.credentials.yaml`), errors `WEB_PROVIDER_CREDENTIAL_MISSING_CODE` / `ZHIPU_CREDENTIAL_MISSING_CODE`.

**Confidence:** high (API surface + no sync method verified; the reference's file
scan is a workaround, not a host API).

**IMPACT:** implement a synchronous `credentialPresent()` gate in the service:

1. Best: cached `this.planKeyPresent: boolean`, initialized by an async probe
   in `[Service.init]` (`void this.probePlanKey().catch(warn)`), refreshed in
   `ctx.on('credentials/reference-updated', ref => { if (ref === either plan ref) this.probePlanKey() })`,
   after `storePlanCredential`, and in `onSignedOut`.
2. Optionally add the reference plugin's cheap sync env/file check as a fallback
   for the very first `available()` calls before the async probe settles.
3. `available()` for both providers = cached switch (`this.config.search.get()`)
   `&& this.planKeyPresent` (and reader separately); never await in it.

---

## Q10. Real-profile e2e environment

**Verdict:** The running GUI (`http://127.0.0.1:51119`) is the **Windows
desktop app** at `/mnt/d/kjProject/DSH-Harness` (Electron; host under
`resources/app.asar`, string `0.2.0-rc.1` present in the asar, matching this
checkout). Its profile is the reserved `desktop` profile:
`/mnt/c/Users/lenovo/.dsh/profiles/desktop` (`$DSH_HOME` for the desktop app is
`/mnt/c/Users/lenovo/.dsh`; the WSL env also reports `DSH_HOME=/mnt/c/Users/lenovo/.dsh`).
That profile's `package.json` lists `dsh-zhipu-plan` in `dsh.profile.bundles`
and pins it as `github:Ayelsh/dsh-zhipu-plan#2ed4f26…`, and
`profiles/desktop/node_modules/dsh-zhipu-plan` is a real installed copy
(version 0.2.5), **not** a symlink to this repo — so repo edits do not affect
the running GUI until rebuilt + reinstalled. The plugin row itself comes from
the plugin's insert-only `dsh.bundle.patch` (`cordis.patch.yml`); the profile's
own `cordis.patch.yml` currently has no `zhipu-plan` row. Volatile/settings
state is stored in that profile patch YAML (this is where `settings.mutate`
and `configEditor.edit` write: `configEditor.documentPath ===
profileContext.patchPath`); plan key + account record live in
`/mnt/c/Users/lenovo/.dsh/.credentials.yaml` (`refs:` / `records:`).

**Evidence / verified commands:**
- `apps/cli/lib/bin.js --version` → `0.2.0-rc.1`; `--help` lists
  `dsh [--profile] <name>`, `--from-default-profile`, `--patch`, `--dump-config`,
  `dsh plugin --profile <name> …`, `dsh web`.
- `apps/cli/README.md:11-20` — profile boot modes; `:14` headless
  `dsh --profile headless "job"`; `:46` bundles resolve from the installation
  first, then the profile's `node_modules` (pnpm-installed plugins); `:48`
  `--dump-config` inspects the composed tree without booting.
- Verified in this WSL: `DSH_HOME=/mnt/c/Users/lenovo/.dsh node apps/cli/lib/bin.js --dump-config --profile test-install` shows
  `- id: web … config: {searchProvider: deepseek-official, fetchProvider: http}`,
  `web-search-deepseek`, `web-fetch-http`, `tool-web`, `zhipu-plan`;
  `config-editor` is present (base bundle `cordis.patch.yml:97-98`), but
  **no `agent-presets` row** (base-only profile).
- Build artifacts exist in the checkout (`apps/cli/lib/bin.js`,
  `packages/web/web/lib/index.js`); WSL toolchain: node v22.23.2, pnpm 11.24.0.

**How to e2e the local repo (recommended, isolated from the live GUI):**

```bash
# 1) build the plugin in the repo (writes lib/)
cd /home/ayelsh/workspace/dsh-plugins/zhipu-plan && pnpm build

# 2) isolated host home + fresh profile from the headless template
export DSH_HOME=/tmp/dsh-e2e-home
CLI=/home/ayelsh/workspace/deepseek-harness/apps/cli/lib/bin.js
node "$CLI" --profile zhipu-e2e --from-default-profile headless
node "$CLI" plugin --profile zhipu-e2e add "dsh-zhipu-plan@file:/home/ayelsh/workspace/dsh-plugins/zhipu-plan"

# 3) verify composition without booting
node "$CLI" --dump-config --profile zhipu-e2e | grep -A4 "id: zhipu-plan"

# 4) one-shot headless smoke
node "$CLI" --profile zhipu-e2e "Use the web_search tool to search for 'deepseek harness' and report the first URL"
```

Do not boot with the shared `/mnt/c/Users/lenovo/.dsh` home while the desktop
GUI owns it (session/lock conflicts). The CLI rejects the `desktop` profile
name for boot/dump/plugin management (`apps/cli/README.md:20`), so use a custom
name as above. Settings/volatile state for this smoke will land in
`/tmp/dsh-e2e-home/profiles/zhipu-e2e/cordis.patch.yml` and plan keys in
`/tmp/dsh-e2e-home/.credentials.yaml`.

**Confidence:** high for paths/wiring/CLI facts; **medium** for the custom
headless-profile boot (verified `--dump-config`, not a full boot; `pnpm build`
not run by recon).

---

## Recommended integration sketch

1. **Config (volatile switches).** In `src/host/service.ts` add to the `Config`
   interface (:136) and schema (:165):
   `search: z.boolean().default(true).volatile()`,
   `reader: z.boolean().default(true).volatile()`,
   `zread: z.boolean().default(false).volatile()`,
   `zhPrompt: z.boolean().default(false).volatile()`.
   Typed as `Volatile<boolean>`; add `switchOn(field) { return field.get() }`
   helpers and a `switches()` snapshot. Do not mutate the config object.

2. **Provider registration timing.** In `[Service.init]`, first
   `syncWebBackends()` (configEditor edit), then register the search/reader
   providers with `available()` = cached credential/switch gate. If the edit
   remounts the web service, registration after the edit is essential; make
   registration idempotent (treat `WEB_DUPLICATE_PROVIDER` as success, or use
   the reference plugin's 8×25 ms retry-for-“already registered” helper).

3. **`syncWebBackends()` (replaces design D2).**
   ```ts
   const web = this.ctx.get('configEditor')?.entries().find(e => e.options.id === 'web')
   if (!web) { warnOnce('web row missing'); return }
   await this.ctx.get('configEditor')!.edit(web, (current, inherited) => {
     const next = { ...inherited }
     if (searchOn) next.searchProvider = ZHIPU_SEARCH_PROVIDER_ID
     else delete next.searchProvider            // or restore base value
     if (readerOn) next.fetchProvider = ZHIPU_READER_PROVIDER_ID
     else delete next.fetchProvider
     return next                                 // equals inherited ⇒ row config removed
   })
   ```
   For a future host where `settings.describe()` exposes `ns: 'web'`, prefer
   `settings.mutate('web', ops)` with the same set/unset ops (guard by probing
   `describe()` once). Keep it idempotent: compare with the current row config
   and only edit when drift exists. Re-register providers after the edit (the
   web service remounted and lost its provider registry).

4. **`refresh()` on `loader/volatile-update`.** Listener:
   `ctx.on('loader/volatile-update', () => { try { this.refresh() } catch (e) { warn } })`.
   `refresh()` = recompute switches → (a) any switch change → re-run
   `syncWebBackends()` (fire-and-forget with catch), (b) search on/off →
   install/remove per-agent shadows, (c) zread on/off → register/dispose global
   zread tools + prompt sections and re-run `installAgentSurface` for every
   `ctx.get('agents').list()` agent (minimal restrictions must be re-applied
   against the new known-tool set), (d) zhPrompt on/off → only affects section
   text (already dynamic) or re-register sections if the text is static.
   Keep every handler synchronous with void promises + `.catch(warn)`; never
   throw out of a listener.

5. **zread tools + minimal-agent deny.** Register the three `github_*` tools
   **globally** on the root ctx when `zread` is on (needed for restriction
   semantics), using `defineTool` and `timeoutMs: 60_000`,
   `isConcurrencySafe: () => true`, output `{ text }` with a `render` returning
   `[{ type:'text', text }]`. Add three `systemPrompt` sections globally with
   stable names/orders and text `() => zreadOn ? (zhPrompt ? zh : en) : ''`.
   In `installAgentSurface(agent)`:
   - resolve preset: `const preset = this.ctx.get('agentPresets')?.composedPreset(agent.ctx)`;
     `const minimal = preset === 'minimal'` (guarded try/catch, `undefined` ⇒ non-minimal).
   - always dispose the agent's previous surface effects first.
   - if minimal: `const names = zreadEnabled ? ZREAD_TOOL_NAMES.filter(n => rootTools.schemas().some(s => s.name === n)) : []`;
     if `names.length` →
     `agent.ctx.get('tools').restrict({ deny: names })` (try/catch; a throw
     means not-minimal-enough → skip). Return.
   - else (search on): if `this.ctx.tools.get('web_search', agent) !== undefined`
     (built-in exists) register the shadow tool through
     `agent.ctx.get('tools').register(shadowDefinition)`; the shadow has the
     same name and an own-layer registration shadows the global one; own
     registrations survive restrictions. Also install the shadow when the
     global tool is absent if we want it as a standalone provider (design
     wording said `get(...) === undefined` — verify intent; reference 0.1.7
     installs the replacement only when a global `web_search` exists).

6. **`ctx.effect` cleanup.** Collect every disposer (provider registrations,
   per-agent effects, global zread tool/section disposers, event listeners) in
   one `ctx.effect(() => () => { … })` inside `[Service.init]` (or rely on
   service-ctx listeners being auto-disposed and use the effect only for
   explicit ordering). On teardown: dispose agent surfaces, dispose global
   tools/sections, then restore the `web` row by editing it back to
   `inherited` (fire-and-forget with `.catch(warn)`; do not block plugin
   disposal on the file write).

7. **Pitfalls found (all verified):**
   - `settings.mutate('web', …)` **throws** on 0.2.0-rc.1 (`web` config has no
     volatile field; such rows are not even in `describe()`). Use
     `configEditor.edit`; keep the settings path behind a capability probe.
   - Editing the `web` row remounts the **web service** (non-volatile row
     config). Our provider registrations belong to the old web instance — the
     web service's own `ctx.effect` disposes them on remount. Re-register
     after every edit (or register after `syncWebBackends`).
   - `resolveProvider` caches the configured ids **at web-service
     construction**; an edit only takes effect when the service remounts —
     `configEditor.edit` awaits that reconcile, so sequence work accordingly.
   - `tools.restrict` is only valid through an **agent-scoped** context
     (`agent.ctx.get('tools')`); calling it on the root/ToolRuntime-owned ctx
     throws the “requires a scoped context (agent.ctx)” error. It filters only
     inherited/global names — scoped registrations (the shadow `web_search`)
     are immune, and `zread` tools must therefore be global if minimal agents
     must lose them. Names in `deny` must currently exist as global tools or
     it throws (`known global tools: …`).
   - `tools.register` same-layer duplicates throw; a global zread name already
     owned by another plugin → use the reference's retry-on-duplicate helper
     and log, never crash the plugin.
   - `systemPrompt.section` duplicate names per layer throw; sections are
     evaluated per assembly (text function can read volatile refs), and
     `agent/created` is serial/awaited — no awaits there.
   - Cordis services are **traceable proxies**: `this.ctx` inside
     `ToolRuntime` methods is the accessing context, so `this.ctx.tools.*`
     from our root-owned service is global while `agent.ctx.get('tools').*`
     is agent-scoped. `tools.get('web_search', agent)` needs the Agent object
     (it is the `ScopeKey`), not the session id and not `agent.ctx`.
   - Listener exceptions propagate in Cordis's synchronous emit chain; and
     **never** listen to `tools/change` from a registration path (reference
     plugin documents infinite recursion / frozen sessions).
   - `agentPresets` may be absent (base-only profiles) — guard
     `ctx.get('agentPresets')`; minimal detection defaults to false.
   - Credentials: no sync availability API; `available()` must be a cached
     boolean (async probe + `credentials/reference-updated` refresh), never an
     `await`.
   - `WebFetchBody` has no `json` kind in rc.1; reader must return
     `{ kind: 'text', content: markdown }` and set `truncated` itself (the web
     service does not clamp fetch outputs; it does cap search `sources`).
   - `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` is a **hard error** (no fallback):
     when a volatile switch turns search/reader off, either re-point/unset the
     `web` row in the same refresh (recommended) or keep `available()` true —
     don't let `tool-web` hit a configured-but-unavailable provider.
   - `configEditor.edit` requires the `web` row to be an active loader entry
     and not overridden by home patch/overlay; if the profile lacks the row,
     warn and skip (the repo bundle patch is insert-only, so the row normally
     exists).
   - The running desktop GUI uses an installed github copy of the plugin, not
     this repo; repo-local changes need a rebuild + profile reinstall or the
     isolated headless e2e profile above.
