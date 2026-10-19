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
import { PlanPanel } from './PlanPanel.tsx'
import type {
  PlanAccount, PlanLoginState, PlanQuota, PlanResetKind, PlanResetStatus, PlanUsageRange, PlanUsageReport,
} from './plan-types.ts'
import { ensureStyles, styles } from './styles.ts'
import { en, zh, type PlanLocaleKey } from './locales.ts'

/** Dictionary namespace this page's copy lives in. */
export const NS = 'settings.zhipuPlan'

/** Cordis services this plugin needs: the slot registry, this page's dictionary, and the Remote carrier. */
export const inject = ['slots', 'locale', 'remote']

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
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'zhipu-plan',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, function ZhipuPlanSection(props) {
    return <section className={styles.panel}><PlanPanel {...props.plan} t={props.t as Parameters<typeof PlanPanel>[0]['t']} /></section>
  }))
}
