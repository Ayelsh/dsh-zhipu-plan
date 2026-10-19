/**
 * Zhipu coding-plan page, browser half.
 *
 * Two things happen here that an in-tree client plugin gets for free. The
 * application's own Remote assembly mounts only the namespaces it was built
 * with, so this plugin mounts its own `zhipuPlan` contribution — the artifact
 * `src/wire/typert-remote-client.js`, generated from the same host methods —
 * through `ctx.remote.$mount`. And because the contribution is mounted at
 * activation rather than declared, the namespace is read through `ctx.get`
 * instead of an `inject` entry that would deadlock the plugin against the
 * service it is itself creating.
 *
 * Every string this page renders lives in `./locales.ts`.
 *
 * @module dsh-zhipu-plan/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import contribution from '../wire/typert-remote-client.js'
import { BackendSettings, type BackendSettingsProps } from './BackendSettings.tsx'
import { PlanPanel } from './PlanPanel.tsx'
import { SettingsTabs, type SettingsTabSpec, type SettingsTabsProps } from './SettingsTabs.tsx'
import type {
  PlanAccount, PlanBackendSettingKey, PlanBackendSettingsSnapshot, PlanLoginState, PlanQuota, PlanResetKind,
  PlanResetStatus, PlanUsageRange, PlanUsageReport,
} from './plan-types.ts'
import { ensureStyles, styles } from './styles.ts'
import { en, zh, type PlanLocaleKey } from './locales.ts'

/** Dictionary namespace this page's copy lives in. */
export const NS = 'settings.zhipuPlan'

/** Cordis services this plugin needs: the slot registry, this page's dictionary, and the Remote carrier. */
export const inject = ['slots', 'locale', 'remote', 'remote.settings']

/** One Remote call's outcome, as the carrier reports it. */
type RemoteResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** The mounted `zhipuPlan` namespace, method for method. */
interface PlanNamespace {
  status: () => Promise<RemoteResult<{ readonly state: 'signed-out' } | { readonly state: 'signed-in'; readonly account: PlanAccount }>>
  beginLogin: (deployment: PlanAccount['deployment'], planKind: PlanAccount['planKind']) => Promise<RemoteResult<{ accepted: true }>>
  loginState: () => Promise<RemoteResult<PlanLoginState>>
  cancelLogin: () => Promise<RemoteResult<void>>
  logout: () => Promise<RemoteResult<void>>
  quota: () => Promise<RemoteResult<PlanQuota>>
  usage: (range: PlanUsageRange, timeZone: string, signal?: AbortSignal) => Promise<RemoteResult<PlanUsageReport>>
  resetStatus: () => Promise<RemoteResult<PlanResetStatus>>
  useReset: (kind: PlanResetKind, idempotencyKey: string) => Promise<RemoteResult<void>>
  requestResetOpportunity: (
    idempotencyKey: string,
  ) => Promise<RemoteResult<{ readonly granted: true } | { readonly granted: false; readonly nextTryAt: number }>>
  markResetHistoryRead: () => Promise<RemoteResult<void>>
}

/** What the section registration hands its component. */
interface PlanSectionInjected {
  readonly plan: PlanPanelHostOperations
  readonly backend: BackendSectionOperations
}

/** The capability switches' host operations, resolved from the settings namespace. */
interface BackendSectionOperations {
  readonly load: () => Promise<PlanBackendSettingsSnapshot | undefined>
  readonly save: (key: PlanBackendSettingKey, value: boolean) => Promise<PlanBackendSettingsSnapshot>
}

/**
 * The page's two views. They are separate subjects — what this plugin can do,
 * and the account it does it for — so they are chosen rather than stacked.
 */
const TABS: readonly SettingsTabSpec[] = [
  { id: 'web', label: 'tabWeb' },
  { id: 'account', label: 'tabAccount' },
]

/** Profile entry this plugin's volatile switches live on. */
const SETTINGS_NAMESPACE = 'zhipu-plan'

/**
 * The `settings` Remote namespace, as this page uses it: the describe view and
 * the path-addressed write. It is a shell namespace rather than this plugin's,
 * so it is read through the service table like the plan namespace is.
 */
interface SettingsNamespaceView {
  readonly ns: string
  readonly value: unknown
  readonly revision: number
}

/** One path-addressed edit carried by a settings write. */
type SettingsPathOp =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: boolean }
  | { readonly op: 'unset'; readonly path: readonly string[] }

interface SettingsRemote {
  readonly describe: () => Promise<RemoteResult<{
    readonly writable: boolean
    readonly hasDocument: boolean
    readonly namespaces: readonly SettingsNamespaceView[]
  }>>
  readonly mutate: (
    ns: string,
    ops: readonly SettingsPathOp[],
    expectedRevision?: number,
  ) => Promise<RemoteResult<SettingsNamespaceView>>
}

/**
 * Read the settings namespace through the Remote carrier.
 * @param ctx - this plugin's context.
 * @returns the shell's settings namespace.
 * @throws {Error} when the shell did not mount it.
 */
function settingsNamespace(ctx: ClientContext): SettingsRemote {
  const namespace = ctx.get('remote.settings') as SettingsRemote | undefined
  if (namespace === undefined) {
    throw new Error('dsh-zhipu-plan: the settings Remote namespace is not mounted')
  }
  return namespace
}

/**
 * Project one namespace view onto the four switches. A missing field reads as
 * the schema default: search and reader on, zread and zhPrompt off.
 * @param namespace - the resolved settings namespace view.
 * @param writable - whether the profile accepts writes.
 * @returns the snapshot the card renders.
 */
function backendSnapshot(namespace: SettingsNamespaceView, writable: boolean): PlanBackendSettingsSnapshot {
  const value = (namespace.value ?? {}) as Record<string, unknown>
  return {
    writable,
    settings: {
      search: value.search !== false,
      reader: value.reader !== false,
      zread: value.zread === true,
      zhPrompt: value.zhPrompt === true,
    },
  }
}

/** Read the switches once; undefined when the profile has no such namespace. */
async function loadBackendSettings(ctx: ClientContext): Promise<PlanBackendSettingsSnapshot | undefined> {
  const view = unwrap('settings/describe', await settingsNamespace(ctx).describe())
  const namespace = view.namespaces.find(candidate => candidate.ns === SETTINGS_NAMESPACE)
  return namespace === undefined ? undefined : backendSnapshot(namespace, view.writable)
}

/** Write one switch, then return the refreshed view. */
async function saveBackendSetting(
  ctx: ClientContext,
  key: PlanBackendSettingKey,
  value: boolean,
): Promise<PlanBackendSettingsSnapshot> {
  const remote = settingsNamespace(ctx)
  const view = unwrap('settings/describe', await remote.describe())
  const namespace = view.namespaces.find(candidate => candidate.ns === SETTINGS_NAMESPACE)
  if (namespace === undefined) {
    throw new Error('dsh-zhipu-plan: the zhipu-plan settings namespace is unavailable')
  }
  const response = await remote.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: [key], value }], namespace.revision)
  return backendSnapshot(unwrap('settings/mutate', response), view.writable)
}

/** The host operations the panel calls, resolved from the mounted namespace. */
type PlanPanelHostOperations = Pick<
  Parameters<typeof PlanPanel>[0],
  'loadAccount' | 'beginLogin' | 'loadLoginState' | 'cancelLogin' | 'logout' | 'loadQuota'
  | 'loadUsage' | 'loadResetStatus' | 'useReset' | 'requestResetOpportunity' | 'markResetHistoryRead'
  | 'currentLocale'
>

/**
 * The mounted namespace, read through the service table.
 *
 * Reading it through `inject` is impossible: this plugin creates the namespace,
 * and a fiber that waits for a service it provides never activates.
 * @param ctx - this plugin's context.
 * @returns the namespace service.
 * @throws {Error} when the namespace is not mounted.
 */
function planNamespace(ctx: ClientContext): PlanNamespace {
  const namespace = ctx.get('remote.zhipuPlan') as PlanNamespace | undefined
  if (namespace === undefined) {
    throw new Error('dsh-zhipu-plan: the zhipuPlan Remote namespace is not mounted')
  }
  return namespace
}

/** Unwrap one Remote result, turning a refusal into a thrown error the panel renders. */
function unwrap<Value>(endpoint: string, result: RemoteResult<Value>): Value {
  if (!result.ok) throw new Error(`${endpoint} rejected: ${result.error.message}`)
  return result.value
}

/**
 * Mount the Remote namespace and contribute the plan page to Settings.
 * @param ctx - client context carrying the slot registry, locale runtime, and Remote carrier.
 */
export function apply(ctx: ClientContext): void {
  ensureStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-zhipu-plan: copy dictionaries')

  // Mounting is the plugin's own responsibility: the shell's Remote assembly
  // carries only the namespaces the application was built with. The disposer
  // is held by the effect so a plugin reload withdraws the namespace too.
  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(contribution)
    return () => dispose()
  }, 'dsh-zhipu-plan: remote namespace')

  // The nav label is read on every projection, so it follows a locale switch
  // without re-registering the entry.
  const t = ctx.locale.bind(NS) as (key: PlanLocaleKey) => string
  // Stable identities: the card's read/write effects must not restart on every projection.
  const backendOperations: BackendSectionOperations = {
    load: () => loadBackendSettings(ctx),
    save: (key, value) => saveBackendSetting(ctx, key, value),
  }
  const injected = (): PlanSectionInjected => ({
    plan: {
      loadAccount: async () => {
        const status = unwrap('zhipuPlan/status', await planNamespace(ctx).status())
        return status.state === 'signed-in' ? status.account : undefined
      },
      beginLogin: async (deployment, planKind) => {
        unwrap('zhipuPlan/beginLogin', await planNamespace(ctx).beginLogin(deployment, planKind))
      },
      loadLoginState: async () => unwrap('zhipuPlan/loginState', await planNamespace(ctx).loginState()),
      cancelLogin: async () => { unwrap('zhipuPlan/cancelLogin', await planNamespace(ctx).cancelLogin()) },
      logout: async () => { unwrap('zhipuPlan/logout', await planNamespace(ctx).logout()) },
      loadQuota: async () => {
        const result = await planNamespace(ctx).quota()
        return result.ok ? result.value : undefined
      },
      loadUsage: async (range, signal) => {
        // The zone travels with the request because the host buckets days by
        // the calendar the user reads dates in, not by its own. The caller's
        // signal rides the Remote carrier's optional cancellation argument, so
        // switching windows withdraws the read the previous window started.
        const result = await planNamespace(ctx).usage(
          range,
          Intl.DateTimeFormat().resolvedOptions().timeZone,
          signal,
        )
        return result.ok ? result.value : undefined
      },
      loadResetStatus: async () => {
        const result = await planNamespace(ctx).resetStatus()
        return result.ok ? result.value : undefined
      },
      useReset: async (kind, idempotencyKey) => {
        unwrap('zhipuPlan/useReset', await planNamespace(ctx).useReset(kind, idempotencyKey))
      },
      requestResetOpportunity: async (idempotencyKey) => {
        return unwrap('zhipuPlan/requestResetOpportunity', await planNamespace(ctx).requestResetOpportunity(idempotencyKey))
      },
      markResetHistoryRead: async () => {
        unwrap('zhipuPlan/markResetHistoryRead', await planNamespace(ctx).markResetHistoryRead())
      },
      // Dates and numbers follow the language the shell is showing, which is the
      // same one the dictionaries were picked for. The locale service publishes
      // an immutable snapshot whose `active` member is the current locale id.
      currentLocale: () => ctx.locale.getLocale().active,
    },
    backend: backendOperations,
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'zhipu-plan',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, function ZhipuPlanSection(props) {
    const t = props.t as SettingsTabsProps['t']
    return (
      <SettingsTabs
        t={t}
        tabs={TABS}
        render={(id) => (id === 'web'
          ? <BackendSettings {...props.backend} t={props.t as BackendSettingsProps['t']} />
          : <PlanPanel {...props.plan} t={props.t as Parameters<typeof PlanPanel>[0]['t']} />)}
      />
    )
  }))
}
