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

### Plugin market (one click)

The plugin is listed in the [dsh-market](https://github.com/dsh-market/dsh-market) catalog. Open **Settings → Plugin Market**, search for **Zhipu** (or 智谱), and press **Install** — the market installs the prebuilt release tarball below, so nothing is built locally. A profile without the market installs it first (`dsh plugin --profile <profile> add dshmarket`, then restart the host).

### Prebuilt tarball

Every release carries the same version-free asset name, so this address always resolves to the newest release:

<https://github.com/Ayelsh/dsh-zhipu-plan/releases/latest/download/dsh-zhipu-plan.tgz>

```sh
# Desktop: Settings → Plugins accepts this address in the install field.
# CLI (for a CLI-owned profile such as `dsh web`):
dsh plugin --profile <profile> add https://github.com/Ayelsh/dsh-zhipu-plan/releases/latest/download/dsh-zhipu-plan.tgz
```

The asset is the packed package: `lib/index.js`, `lib/typert.js`, `lib/client.js`, `cordis.patch.yml`, `package.json`, `README.md`, and the preview page.

### From source

```sh
dsh plugin --profile <profile> add github:Ayelsh/dsh-zhipu-plan
```

A source install packs the repository exactly as it is. The build artifacts — `lib/index.js`, `lib/typert.js`, `lib/client.js` — are committed, so the installed package carries them and no build script runs on your machine. Nothing in `src/` is compiled at install time; the market still prefers the prebuilt tarball above because a source checkout is slower to download than the release asset.

The Host restarts the affected plugin graph; a full application restart is the reliable way to pick up a newly installed bundle. Then open **Settings → 智谱套餐**, choose the deployment and plan kind, and sign in.

**Install from the tarball, not from this directory.** A local folder installed as a dependency becomes a `link:` to wherever it sits, and both Node and the harness resolve a linked package by its real path. The harness routes bare `@deepseek-ai/*` requests to the running installation only for importers under `$DSH_HOME/profiles`, so a linked folder anywhere else — `G:\dsh-build\dist\dsh-zhipu-plan`, a checkout, a desktop — cannot resolve `@deepseek-ai/cordis` and fails to load with `failed to import`. A tarball is unpacked *into* the profile, which is why it works. Copying the folder into `$DSH_HOME/profiles/<profile>/node_modules/` also works, because then it is under the profiles tree, but nothing manages that copy.

To remove it, uninstall the bundle the same way (`remove dsh-zhipu-plan`), which also drops its patch layer.

## Build

```sh
pnpm install
pnpm run build      # writes lib/index.js, lib/typert.js, lib/client.js
pnpm run verify     # build, then the artifact, dictionary, and Remote checks
pnpm run preview    # writes preview/plan-page.html and preview/plan-page-dark.html
pnpm pack           # writes dsh-zhipu-plan-<version>.tgz
```

`lib/` is committed, because a source install packs only git-tracked files: `pnpm run build` refreshes it after a source change and `prepack` rebuilds it before `pnpm pack`, so a release never packs stale artifacts — commit the rebuilt `lib/` with the source change that caused it. The release asset is that tarball renamed to the version-free `dsh-zhipu-plan.tgz`, which is what keeps the `releases/latest/download/dsh-zhipu-plan.tgz` address stable across versions.

The build runs esbuild directly rather than the repository's client preset, because this package is built outside that repository; it then checks the artifacts it produced: the browser bundle only `require`s specifiers the shell's module table answers, every class name the markup uses exists in the injected stylesheet, both dictionaries carry the same keys, and every Remote method the published wire and the service source name exist on both sides. `pnpm run verify` adds the regression gates: `logic-freeze` pins the dictionary, logic identifiers, poll timings, and host reset request a presentation-only change must not move, `client-smoke` materializes the browser bundle against the shell's module table, and the harness loader must accept the published Typert manifest.

## Layout

| Path | Role |
|---|---|
| `src/host/` | The `zhipuPlan` service: relay sign-in, plan-credential resolution, monitor and reset reads. Ported from the in-tree package of the same shape. |
| `src/wire/` | The generated Typert faces. `typert-host.js` is the manifest `@deepseek-ai/dsh-typert-loader` registers from any mounted package exporting `./typert`; `typert-remote-client.js` is the browser contribution this plugin mounts through `ctx.remote.$mount`. |
| `src/client/` | The Settings page. |
| `lib/` | Committed build output: `index.js` (host), `typert.js` (wire face), `client.js` (browser). Written by `pnpm run build`; never edited by hand. |
| `cordis.patch.yml` | The bundle layer: the authorization seam and this plugin, insert-only. |

### Why the wire faces are copied rather than generated here

The repository's Typert generator analyzes a `ts.Program` over the whole workspace, which an out-of-tree package does not have. These two files are its output for this service, with the package name updated; `pnpm run build` fails if they and `src/host/service.ts` ever disagree about which methods are Remote.

## Runtime dependencies

The host half imports `@deepseek-ai/cordis`, `@deepseek-ai/dsh-authorization`, `@deepseek-ai/dsh-credentials`, `@deepseek-ai/dsh-settings`, `@deepseek-ai/dsh-typert-protocol`, `@deepseek-ai/schemastery`, and `zod`. All of them are part of the installed application's own dependency closure, and the profile's module fallback links resolve them to the copies the running process already loaded — so the plugin shares the host's service instances instead of carrying a second copy. The package therefore declares no dependencies; installing it downloads nothing but the tarball.

The browser half resolves `react`, `react/jsx-runtime`, and `@deepseek-ai/dsh-client-ui-primitives` from the shell's module table and inlines everything else.

## Notes and limits

- Sign-in goes through the ZCode authorization relay (`zcode.z.ai`) using that product's client identity. This is a personal local build; the relay's deployment can change without notice, and the addresses are configuration rather than code (`Config` fields on the `zhipu-plan` row).
- The plan quota, usage, and reset calls read and write the Zhipu account itself: spending a reset is a real change to the account and is confirmed before it is sent.
- The plan API key the sign-in resolves is stored in the harness credential store under the deployment's own reference: `DSH_ZHIPU_PLAN_KEY` for the BigModel mainland deployment, `DSH_ZHIPU_PLAN_KEY_ZAI` for the Z.ai international deployment. A `zai` provider route configured by hand in **Settings → Models** would store its own key under `ZAI_API_KEY` and take precedence for that route.
- The host half also reads the settings service, so the profile must mount `@deepseek-ai/dsh-settings-file` (every shipped app bundle does).
- The application-usage tab of the original in-tree page (local session statistics) is not part of this plugin.
## License and attribution

MIT — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

- The host modules under src/host/ and the generated wire modules under src/wire/ are derived from the in-tree \@deepseek-ai/dsh-zhipu-plan\ package of DeepSeek Harness (MIT, Copyright (c) 2026 DeepSeek); `reset.ts` and `service.ts` were carried over and then extended.
- Sign-in and quota polling talk to the ZCode authorization relay, an undocumented third-party contract observed from ZCode (Apache-2.0, Copyright 2026 Z.AI Co., Ltd) and rebuilt here; no ZCode source is copied into this project.

This plugin is **not** authored by, affiliated with, or endorsed by Z.AI / Zhipu or DeepSeek. The relay mints tokens under ZCode's own client identity, so using this plugin may conflict with the Z.ai terms of service and Z.ai may revoke access at any time. Every relay origin is a configuration field so the dependency can be repointed or removed. "Z.ai", "Zhipu", "BigModel", "GLM" and "ZCode" are trademarks of their respective owners, used here only descriptively.
