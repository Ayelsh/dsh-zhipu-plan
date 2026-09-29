/**
 * Host half of the Zhipu coding-plan plugin: the `zhipuPlan` cordis service,
 * its browser sign-in flow, the plan credential it resolves, and the monitor
 * reads behind the plan page.
 *
 * The service is the package's default export, so the profile row that mounts
 * this plugin (`dsh-zhipu-plan` in `cordis.patch.yml`) needs no separate
 * entry: the Loader instantiates the class with the row's validated config.
 * The Typert wire face the browser calls is published separately as
 * `exports["./typert"]`, which `@deepseek-ai/dsh-typert-loader` picks up from
 * any mounted package that declares it.
 *
 * @module dsh-zhipu-plan/host
 */

export * from './service.ts'
export { default } from './service.ts'
