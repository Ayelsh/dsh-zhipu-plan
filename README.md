# dsh-zhipu-plan

Zhipu coding-plan sign-in, plan quota, and server-side usage for DeepSeek Harness, shipped as an out-of-tree profile **bundle**. Nothing in the application is patched: the plugin installs into a profile, adds its own Settings page, and registers the coding-plan credential the shipped `zai` provider routes read.

## What it adds

- **Settings → 智谱套餐 (Zhipu plan)**, contributed by this package's browser half, laid out like ZCode's own usage page:
  - **剩余额度** — one card per bucket: the five-hour prompt pool, the weekly pool, and the monthly tool allowance. Each card shows how much is left, when that bucket refills, and a bar in the bucket's colour; a bucket that is still untouched shows no reset entry, because a reset would give nothing back.
  - **可重置额度** — a dialog listing each bucket's remaining share and the resets the deployment has granted, with the countdown to their expiry.
  - **用量趋势** — server-side model and tool totals, activity, cache health, decode speed, and the subscriptions on the account, over a 7-day, 30-day, or all-time window.
  - Sign-in against either deployment (`Z.ai` international or `BigModel` mainland) for the individual, Team, and Start plans: the host opens the relay's authorization page, shows the address with a copy button while it waits, and polls until the attempt settles. The page never sees a token.
- **The `zhipuPlan` Remote namespace** behind that page. The application's own Remote assembly only mounts the namespaces it was built with, so this plugin mounts its own contribution at activation (see `src/wire/`).
- **GLM models usable after sign-in.** The service writes the signed-in deployment's provider route into the shipped `llm-pi-ai` entry's settings document — the same document the Models page edits — and clears both routes on sign-out: `zai-coding-cn` reads `DSH_ZHIPU_PLAN_KEY`, `zai` reads `DSH_ZHIPU_PLAN_KEY_ZAI`. The matching deployment's models resolve in the picker; the other deployment's provider stays dormant, and a request to it fails loud about the missing credential rather than reaching the wrong endpoint. The bundle patch stays insert-only: a patch row overriding another bundle's row would outlive this bundle and keep the plugin manager from uninstalling it. Because the routes live in the profile's own patch layer, uninstalling a signed-in account leaves them (and the stored plan key) in place; remove them in **Settings → Models** if you want the models gone too.

The authorization seam (`@deepseek-ai/dsh-authorization`) is mounted by the installation's own dsh-base since 0.1.7-rc.2; this plugin requires it and verifies against **0.2.0-rc.1**. Its patch deliberately does not insert the seam itself — a row dsh-base already declares would come back from this layer as a duplicate entry id and fail the whole tree load.

### How quota resets work

Resets are **granted by the deployment, not bought by a button**. Two things happen on their own:

- The reset status is re-read every five minutes, so a reset the deployment hands out appears by itself — the badge next to 剩余额度 counts them and counts down to the earliest expiry.
- When none is on hand, the page repeats ZCode's eligibility request (`POST /api/v1/coding-plan/reset/opportunity`) on the deployment's own terms: at most once every five minutes, and at the instant a refusal named. That request is what makes the deployment consider the account; it is never a control the user presses.

Spending one is the only manual step, and it goes through the dialog. The deployment confirms it — the window stays `processing` until the status reports the new `usedAt`, so a stale read cannot make a spent reset look available again. This is the same mechanism ZCode uses (`packages/ui/src/lib/codingPlanQuotaResetCoordinator.ts`, `packages/services/src/usage-stats/providers/bigmodelUsageQuotaProvider.ts` in that repository).

`preview/plan-page.html` in this package renders the page with fixture data — signed in, the reset dialog, the waiting screen, and the signed-out screen — so the layout can be reviewed without installing anything.

## Install

Build the package (see below), then install the **tarball** into the profile the application owns:

```sh
# Desktop: Settings → Plugins accepts the spec below in the install field.
# CLI (for a CLI-owned profile such as `dsh web`):
dsh plugin --profile web add ./dsh-zhipu-plan-0.2.0.tgz
```

The Host restarts the affected plugin graph; a full application restart is the reliable way to pick up a newly installed bundle. Then open **Settings → 智谱套餐**, choose the deployment and plan kind, and sign in.

**Install from the tarball, not from this directory.** A local folder installed as a dependency becomes a `link:` to wherever it sits, and both Node and the harness resolve a linked package by its real path. The harness routes bare `@deepseek-ai/*` requests to the running installation only for importers under `$DSH_HOME/profiles`, so a linked folder anywhere else — `G:\dsh-build\dist\dsh-zhipu-plan-0.2.0`, a checkout, a desktop — cannot resolve `@deepseek-ai/cordis` and fails to load with `failed to import`. A tarball is unpacked *into* the profile, which is why it works. Copying the folder into `$DSH_HOME/profiles/<profile>/node_modules/` also works, because then it is under the profiles tree, but nothing manages that copy.

To remove it, uninstall the bundle the same way (`remove dsh-zhipu-plan`), which also drops its patch layer.

## Build

```sh
pnpm install
pnpm run build      # writes lib/index.js, lib/typert.js, lib/client.js
pnpm pack           # writes dsh-zhipu-plan-<version>.tgz
```

The build runs esbuild directly rather than the repository's client preset, because this package is built outside that repository; it then checks the artifacts it produced: the browser bundle only `require`s specifiers the shell's module table answers, every class name the markup uses exists in the injected stylesheet, both dictionaries carry the same keys, and every Remote method the published wire and the service source name exist on both sides.

## Layout

| Path | Role |
|---|---|
| `src/host/` | The `zhipuPlan` service: relay sign-in, plan-credential resolution, monitor and reset reads. Ported from the in-tree package of the same shape. |
| `src/wire/` | The generated Typert faces. `typert-host.js` is the manifest `@deepseek-ai/dsh-typert-loader` registers from any mounted package exporting `./typert`; `typert-remote-client.js` is the browser contribution this plugin mounts through `ctx.remote.$mount`. |
| `src/client/` | The Settings page. |
| `cordis.patch.yml` | The bundle layer: the authorization seam and this plugin, insert-only. |

### Why the wire faces are copied rather than generated here

The repository's Typert generator analyzes a `ts.Program` over the whole workspace, which an out-of-tree package does not have. These two files are its output for this service, with the package name updated; `pnpm run build` fails if they and `src/host/service.ts` ever disagree about which methods are Remote.

## Runtime dependencies

The host half imports `@deepseek-ai/cordis`, `@deepseek-ai/dsh-credentials`, `@deepseek-ai/dsh-typert-protocol`, `@deepseek-ai/schemastery`, and `zod`. All of them are part of the installed application's own dependency closure, and the profile's module fallback links resolve them to the copies the running process already loaded — so the plugin shares the host's service instances instead of carrying a second copy. The package therefore declares no dependencies; installing it downloads nothing but the tarball.

The browser half resolves `react`, `react/jsx-runtime`, and `@deepseek-ai/dsh-client-ui-primitives` from the shell's module table and inlines everything else.

## Notes and limits

- Sign-in goes through the ZCode authorization relay (`zcode.z.ai`) using that product's client identity. This is a personal local build; the relay's deployment can change without notice, and the addresses are configuration rather than code (`Config` fields on the `zhipu-plan` row).
- The plan quota, usage, and reset calls read and write the Zhipu account itself: spending a reset is a real change to the account and is confirmed before it is sent.
- The plan API key the sign-in resolves is stored in the harness credential store under the deployment's own reference: `DSH_ZHIPU_PLAN_KEY` for the BigModel mainland deployment, `DSH_ZHIPU_PLAN_KEY_ZAI` for the Z.ai international deployment. A `zai` provider route configured by hand in **Settings → Models** would store its own key under `ZAI_API_KEY` and take precedence for that route.
- The host half also reads the settings service, so the profile must mount `@deepseek-ai/dsh-settings-file` (every shipped app bundle does).
- The application-usage tab of the original in-tree page (local session statistics) is not part of this plugin.
