/**
 * The model catalogs this plugin publishes onto its two pi-ai coding routes.
 *
 * The pi-ai data files the application ships describe every GLM model the
 * coding plans served when the application was *built*. A model Zhipu launches
 * after that build appears nowhere, and a `modelOverrides` entry cannot
 * introduce one — an override reshapes an installed id, it cannot add one. So
 * the service writes this module's list into each lit route's settings
 * profile (the same document the Models page edits), and this module is where
 * a new model is added and released: declare the entry here, bump the
 * version, run `pnpm run verify`, and pack. The next route sync publishes it.
 *
 * Entry semantics follow the `llm-pi-ai` settings schema, whose resolution
 * defaults every unset field from the installed catalog entry of the same id:
 *
 * - A bare `{ id }` keeps that model's shipped capacities, modalities, and
 *   reasoning map exactly as the catalog describes them — the right shape for
 *   every model the installed data already knows, so a pi-ai data upgrade
 *   keeps improving them under us.
 * - An entry naming an id the catalog does not describe (a brand-new model)
 *   must declare what the route needs, because nothing sits below it to
 *   inherit: capacities, modalities, the reasoning-effort map, and the wire
 *   compat. Omitting `reasoningEfforts` on such an entry would resolve the
 *   model as *non-reasoning*, silently.
 *
 * `reasoningEfforts` is the thinking-parameter control this module exists
 * for. Its keys are pi-ai's levels (`off minimal low medium high xhigh max`);
 * its values are the wire strings dispatch sends as `reasoning_effort`. A
 * level left undeclared resolves to "no wire value" (dispatch falls back to
 * the model's default thinking for it), an explicit `null` is refused for
 * every level but `off`, and `false` in place of the map disables reasoning
 * outright.
 *
 * One switch is unreachable from here by design: `compat.zaiToolStream` is
 * withheld from the settings schema (`llm-pi-ai` only lets the shipped
 * catalog data set it), so a model this module declares runs tools without
 * streamed arguments. That costs first-token latency on large tool calls and
 * nothing else.
 *
 * @module dsh-zhipu-plan/host/models
 */

/** The pi-ai routes this plugin manages, keyed as the settings document keys them. */
export type PluginRouteId = 'zai' | 'zai-coding-cn'

/** One request modality a `models` entry may declare. */
export type PluginModality = 'text' | 'image'

/** One pi-ai thinking level, in escalation order. */
export type PluginThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * The compat switches a zai-route entry may declare, narrowed to the fields
 * the `openai-completions` protocol offers and this module has a reason to
 * name. `llm-pi-ai` refuses a model-level compat switch its protocol does not
 * take, so anything else here fails the whole route at sync time — extend
 * this interface only with fields `OpenAICompletionsCompat` itself offers.
 */
export interface PluginModelCompat {
  /** Zhipu endpoints accept no `store` field. */
  supportsStore?: boolean
  /** Zhipu endpoints accept no `developer` role. */
  supportsDeveloperRole?: boolean
  /** Zhipu accepts `reasoning_effort`; URL detection alone reports false for it. */
  supportsReasoningEffort?: boolean
  /** Zhipu caps output through `max_tokens`, not `max_completion_tokens`. */
  maxTokensField?: 'max_tokens' | 'max_completion_tokens'
  /** Zhipu dispatches thinking through `thinking: { type }`. */
  thinkingFormat?: 'zai'
}

/** One `llm-pi-ai` `models` entry as this module declares it; only `id` is required. */
export interface PluginModelEntry {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  input?: readonly PluginModality[]
  reasoningEfforts?: false | { readonly [level in PluginThinkingLevel]?: string | null }
  compat?: PluginModelCompat
}

/**
 * GLM-5.4, the model that motivated this module: launched on both coding
 * plans after the installed pi-ai data was generated, so no catalog entry
 * exists to inherit from and the declaration below is complete.
 *
 * Capacities mirror the glm-5.3 flagship the same coding endpoints already
 * serve (1M context, 131,072 output) and the Coding Plan page's own 5.4 badge
 * (1M / 视觉); Zhipu's launch note quotes the open-platform API spec
 * (200,000 / 64,000) — the smaller numbers. If your endpoint turns out to
 * enforce the open-platform caps, this is the pair to edit: requests only
 * fail past the true limit, and a smaller pair merely packs sessions
 * conservatively.
 *
 * The effort map mirrors glm-5.3's (`low`/`high`/`max`, wire values spelled
 * as themselves); undeclared levels resolve to no wire value, `off` dispatches
 * `thinking: { type: 'disabled' }`, which the 5.4 endpoint accepts (5.3
 * refused it, which is why the shipped map pins `off` to absent — pi-ai
 * reads both the same way).
 *
 * `zaiToolStream` is deliberately absent: see the module doc.
 */
const GLM_5_4: PluginModelEntry = {
  id: 'glm-5.4',
  name: 'GLM-5.4',
  contextWindow: 1_000_000,
  maxTokens: 131_072,
  input: ['text', 'image'],
  reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: true,
    maxTokensField: 'max_tokens',
    thinkingFormat: 'zai',
  },
}

/**
 * The catalog each route serves while lit, newest model first so a freshly
 * released flagship is the first entry a picker shows. Existing models stay
 * bare ids on purpose (see the module doc); a future entry that reshapes an
 * installed model — different thinking levels, a capacity correction — adds
 * those fields to its object here.
 */
export const PLUGIN_MODEL_ROUTES: Record<PluginRouteId, readonly PluginModelEntry[]> = {
  'zai-coding-cn': [
    GLM_5_4,
    { id: 'glm-5.3' },
    { id: 'glm-5.3-flash' },
    { id: 'glm-5.3-highspeed' },
    { id: 'glm-5.2' },
    { id: 'glm-5.2-highspeed' },
    { id: 'glm-5.1' },
    { id: 'glm-5-turbo' },
    { id: 'glm-4.7' },
    { id: 'glm-4.6v' },
    { id: 'glm-5v-turbo' },
  ],
  zai: [
    GLM_5_4,
    { id: 'glm-5.3' },
    { id: 'glm-5.3-flash' },
    { id: 'glm-5.3-highspeed' },
    { id: 'glm-5.2' },
    { id: 'glm-5.2-highspeed' },
    { id: 'glm-5-turbo' },
    { id: 'glm-4.7' },
  ],
}

/** The ids one route's list owns, for telling our entries from the user's own. */
function ownedIds(route: PluginRouteId): ReadonlySet<string> {
  return new Set(PLUGIN_MODEL_ROUTES[route].map(entry => entry.id))
}

/**
 * The models array a lit route should carry: this module's entries in
 * declaration order, then every stored entry whose id this module does not
 * own, in stored order (first occurrence wins). The user's own additions —
 * a model they declared by hand on the Models page — survive every sync;
 * ids this module owns are restated from source, so an upgraded release
 * replaces its own previous entries rather than duplicating them.
 * @param stored - the route's profile value as the settings document holds it.
 * @param route - the lit route.
 */
export function mergeRouteModels(stored: unknown, route: PluginRouteId): Array<PluginModelEntry | Record<string, unknown>> {
  const owned = ownedIds(route)
  const extras: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  const storedList = Array.isArray(stored) ? stored : (stored as { models?: unknown } | undefined)?.models
  for (const entry of Array.isArray(storedList) ? storedList : []) {
    const id = typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string'
      ? (entry as { id: string }).id
      : undefined
    if (id === undefined || owned.has(id) || seen.has(id)) continue
    seen.add(id)
    extras.push(entry as Record<string, unknown>)
  }
  return [...PLUGIN_MODEL_ROUTES[route], ...extras]
}

/**
 * The profile value a lit route should carry: whatever the stored profile
 * already holds (a display name, headers the user added on the Models page),
 * with this plugin's two owned fields restated.
 * @param stored - the route's profile value, or `undefined` for a first write.
 * @param apiKeyEnv - the credential reference the signed-in deployment reads.
 * @param route - the lit route.
 */
export function routeProfileValue(stored: unknown, apiKeyEnv: string, route: PluginRouteId): Record<string, unknown> {
  const base = typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? { ...(stored as Record<string, unknown>) }
    : {}
  return { ...base, apiKeyEnv, models: mergeRouteModels(stored, route) }
}

/** Absent-equivalent values a schemastery round-trip may materialize for an unset field. */
function absentish(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0)
    || (Array.isArray(value) && value.length === 0)
}

/** One entry reduced to the fields a comparison owns, with stable key order. */
function normalizeEntry(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null) return entry
  const source = entry as Record<string, unknown>
  const normalized: Record<string, unknown> = {}
  for (const key of ['id', 'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts', 'compat']) {
    const value = source[key]
    if (absentish(value) && !(key === 'reasoningEfforts' && value === false)) continue
    normalized[key] = value
  }
  return normalized
}

/** JSON with sorted object keys, so stored order never reads as drift. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>
    return `{${Object.keys(source).sort().map(key => `${JSON.stringify(key)}:${stableJson(source[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Whether the stored profile differs from what this plugin would write, in
 * the two fields the plugin owns. Everything else on the profile — the
 * user's display name, headers, capacities — is theirs; drift there is not
 * ours to repair. `undefined` counts as drift: the route is unlit in the
 * document and must be created.
 * @param stored - the route's profile value as the settings document holds it.
 * @param apiKeyEnv - the credential reference the signed-in deployment reads.
 * @param route - the lit route.
 */
export function profileDrifts(stored: unknown, apiKeyEnv: string, route: PluginRouteId): boolean {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return true
  const profile = stored as Record<string, unknown>
  if (profile.apiKeyEnv !== apiKeyEnv) return true
  return stableJson(Array.isArray(profile.models) ? profile.models.map(normalizeEntry) : [])
    !== stableJson(mergeRouteModels(stored, route).map(normalizeEntry))
}
