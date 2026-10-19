/**
 * The page's stylesheet: one sheet, injected once, scoped by prefix.
 *
 * This plugin is fetched outside the shell's own build, so it cannot use the
 * repository's CSS-module pipeline. The sheet is one string, appended to the
 * document head when the plugin first materializes, and every class is
 * prefixed (`dzp-`) so nothing it declares can collide with the shell's rules.
 * `styles.<name>` resolves to that prefixed class, and the build checks that
 * every class the markup names is declared here.
 *
 * Colours come from the shell's `--dsw-alias-*` tokens, so the page follows the
 * application theme rather than carrying a palette of its own. They are the
 * tokens the shell's own surfaces use: `bg-layer-2` with a `border-l1` hairline
 * and a level-1 shadow for a raised card, the `interactive-bg-*` family for
 * hover and press, `state-*` for meaning.
 *
 * The motion follows the fluid-interface rules. Controls answer on press, not
 * on release. Values settle with a decelerating curve from the value already on
 * screen, so a new snapshot reads as a change rather than as a redraw. Nothing
 * moves that the user did not cause. Every transition is dropped under
 * `prefers-reduced-motion`, and transparency and contrast preferences are
 * honoured.
 *
 * @module dsh-zhipu-plan/client/styles
 */

/** Every class this page's markup names; the sheet below must declare each one. */
export const STYLE_CLASSES = [
  // The shell's own wrapper around this page; the two-view shell and its bar.
  'panel', 'shell', 'tabs', 'tabsThumb', 'tab', 'tabPanel',
  // The page itself.
  'page', 'hero', 'heroFacts', 'heroRow', 'heroLabel', 'heroValue', 'heroValueStale',
  'heroFooter', 'heroMeta', 'heroMetaItem', 'heroActions',
  // Feedback: load, notes, warnings, errors, the completion notice, the spinner.
  'status', 'note', 'warning', 'error', 'notice', 'spinner',
  // The stand-in a surface shows while it is still being read.
  'skeleton', 'skeletonRow', 'emptyState',
  // Sections: the head, the title, the meta line, the one action in a head.
  'section', 'sectionHead', 'sectionTitle', 'sectionTitleGroup', 'sectionMeta', 'cardAction',
  // Quota: the grid of bucket cards, their figures, their bars.
  'quotaCards', 'quotaCard', 'quotaCardHead', 'quotaCardLabel', 'quotaCardFigures',
  'quotaCardValue', 'quotaCardReset', 'quotaBar', 'quotaBarFill',
  'resetBadge', 'resetBadgeCountdown', 'resetEntry', 'resetDone', 'resetPending',
  // The reset dialog.
  'dialogBody', 'dialogSection', 'dialogSectionTitle', 'dialogUsageRow', 'dialogUsageLabel',
  'dialogUsageValue', 'dialogUsageMeta', 'dialogResetRow', 'dialogResetInfo', 'dialogResetLabel',
  'dialogResetMeta', 'countPill',
  // Labelled facts, and the usage tables behind the quota.
  'facts', 'factRow', 'factLabel', 'factValue',
  // The activity figures as a grid of labelled numbers, and the line a table
  // closes with when its rows have a total.
  'stats', 'stat', 'statLabel', 'statValue', 'statMeta', 'usageTotal',
  'rangeTabs', 'rangeThumb', 'rangeTab', 'usagePanel', 'usageSwap', 'usageProgress', 'usageStatus',
  'usageFailure', 'usageRetry', 'usageSection', 'usageSectionHead', 'usageBlock', 'usageTable',
  // Signing in: the card, the two pickers, the authorize notice, its actions.
  'signInCard', 'pickers', 'signInActions', 'pickerRow', 'picker',
  'authorize', 'authorizeLink',
  // The runtime capability switches above the account card: one translucent
  // material, its grouped rows, and the states a row can hold.
  'backendCard', 'backendHead', 'backendSubtitle', 'backendWarn',
  'backendList', 'backendRowSlot', 'backendRow', 'backendIcon', 'backendIconGlyph',
  'backendText', 'backendRowTitle', 'backendRowDesc', 'backendSpinner',
  'backendSwitchTrack', 'backendSwitchKnob', 'backendRowError', 'backendLoadError',
  'backendFootnote', 'backendReadOnly',
  'backendSkeletonRow', 'backendSkeletonIcon', 'backendSkeletonText',
  'backendSkeletonBar', 'backendSkeletonSwitch',
] as const

/** One class name this page uses. */
export type StyleClass = (typeof STYLE_CLASSES)[number]

const PREFIX = 'dzp-'

/**
 * The page's own timing, scoped to `.dzp-page` so the custom properties cannot
 * leak into the shell. `--dzp-ease` is the decelerating curve used for anything
 * that settles; `--dzp-fast` is the press response, which must be felt within a
 * frame or two or it reads as latency.
 */
const MOTION = `
.dzp-page {
  --dzp-ease: cubic-bezier(0.2, 0.9, 0.2, 1);
  --dzp-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dzp-fast: 130ms;
  --dzp-base: 220ms;
  --dzp-settle: 520ms;
}
`

const SHEET: string = `
${MOTION}
/* The settings column scrolls with no top padding of its own, so the page keeps
   the air the shell's ambient field needs. Without it the field's rounded
   corners are cut by the scroll container, and the bar reads as clipped. */
.dzp-panel { display: block; min-width: 0; padding: 16px 0 6px; }

/* ---- the two views: the ambient field and the bar ----------------------- */

/* The capability switches and the account are separate subjects, so they are
   chosen rather than stacked: one view is on screen at a time and the bar says
   which. What makes the surface read as glass is the field behind it — a wide,
   soft tint the cards' own backdrops refract. The field carries light only,
   never a surface, so nothing translucent is stacked on something translucent. */
.dzp-page, .dzp-shell {
  --dzp-glass: rgba(255, 255, 255, 0.58);
  --dzp-glass-strong: rgba(255, 255, 255, 0.8);
  --dzp-glass-edge: rgba(255, 255, 255, 0.72);
  --dzp-glass-hair: rgba(0, 0, 0, 0.07);
  --dzp-glass-sheen: linear-gradient(168deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 46%);
  --dzp-glass-blur: blur(26px) saturate(180%);
  --dzp-glass-shadow:
    0 1px 1px rgba(0, 0, 0, 0.03),
    0 10px 28px -10px rgba(0, 0, 0, 0.14),
    0 28px 56px -28px rgba(0, 0, 0, 0.2);
}
body[data-ds-dark-theme] .dzp-page, body[data-ds-dark-theme] .dzp-shell {
    --dzp-glass: rgba(28, 28, 30, 0.52);
    --dzp-glass-strong: rgba(58, 58, 60, 0.72);
    --dzp-glass-edge: rgba(255, 255, 255, 0.12);
    --dzp-glass-hair: rgba(255, 255, 255, 0.1);
    --dzp-glass-sheen: linear-gradient(168deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 46%);
  --dzp-glass-shadow:
    0 1px 1px rgba(0, 0, 0, 0.24),
    0 12px 32px -12px rgba(0, 0, 0, 0.5),
    0 32px 64px -32px rgba(0, 0, 0, 0.6);
}
.dzp-shell {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.dzp-shell::before {
  content: '';
  position: absolute;
  inset: -12px -14px -14px;
  z-index: -1;
  border-radius: 26px;
  background:
    radial-gradient(70% 50% at 14% 4%, rgba(10, 132, 255, 0.26), rgba(10, 132, 255, 0) 66%),
    radial-gradient(58% 42% at 98% 2%, rgba(191, 90, 242, 0.24), rgba(191, 90, 242, 0) 68%),
    radial-gradient(86% 58% at 56% 112%, rgba(100, 210, 255, 0.22), rgba(100, 210, 255, 0) 70%);
  pointer-events: none;
}
body[data-ds-dark-theme] .dzp-shell::before {
  background:
    radial-gradient(70% 50% at 14% 4%, rgba(10, 132, 255, 0.3), rgba(10, 132, 255, 0) 66%),
    radial-gradient(58% 42% at 98% 2%, rgba(191, 90, 242, 0.28), rgba(191, 90, 242, 0) 68%),
    radial-gradient(86% 58% at 56% 112%, rgba(100, 210, 255, 0.2), rgba(100, 210, 255, 0) 70%);
}

/* The bar: one glass track, one pill painted behind the labels. The pill is a
   single element that travels, so a selection reads as one object moving
   rather than as two backgrounds cross-fading. */
.dzp-tabs {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 3px;
  border-radius: 13px;
  background: rgba(120, 120, 128, 0.16);
  box-shadow:
    inset 0 0 0 0.5px var(--dzp-glass-hair),
    inset 0 1px 2px rgba(0, 0, 0, 0.05);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  backdrop-filter: blur(14px) saturate(160%);
}
.dzp-tabsThumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / var(--dzp-tab-count, 2));
  border-radius: 10px;
  background-color: var(--dzp-glass-strong);
  background-image: var(--dzp-glass-sheen);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge),
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 4px 12px -4px rgba(0, 0, 0, 0.16);
  transform: translateX(calc(var(--dzp-tab-index, 0) * 100%));
  transition: transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}
.dzp-tab {
  position: relative;
  z-index: 1;
  min-height: 30px;
  padding: 5px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: -0.005em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dzp-tab:hover { color: var(--dsw-alias-label-primary); }
/* The press is answered on the way down, not on the way up. */
.dzp-tab:active { transform: scale(0.97); transition: transform 0s; }
.dzp-tab[aria-selected='true'] {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.dzp-tab:focus-visible {
  outline: 3px solid rgba(10, 132, 255, 0.4);
  outline-offset: 2px;
}
/* The view settles in from the value already on screen: a short lift, never a
   fade from black, so a switch reads as content arriving rather than loading. */
.dzp-tabPanel {
  min-width: 0;
  animation: dzp-tab-in 340ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.dzp-tabPanel[hidden] { display: none; }
@keyframes dzp-tab-in {
  from { opacity: 0; transform: translateY(8px) scale(0.994); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.dzp-page, .dzp-dialogBody, .dzp-dialogSection, .dzp-signInCard,
.dzp-pickers, .dzp-facts, .dzp-usageSection, .dzp-usageBlock, .dzp-authorize,
.dzp-hero, .dzp-heroFacts, .dzp-quotaSection { display: flex; flex-direction: column; }
.dzp-page { gap: 22px; min-width: 0; }
.dzp-dialogBody { gap: 20px; }
.dzp-dialogSection { gap: 10px; }
/* The window's groups are one surface with a hairline between them, not a stack
   of cards: the material groups the figures, and the rule only marks where one
   group ends and the next begins. */
.dzp-usageSection { gap: 0; }
.dzp-usageSection > * { padding-top: 16px; }
.dzp-usageSection > *:first-child { padding-top: 0; }
.dzp-usageSection > * + * { border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dzp-usageBlock { gap: 8px; }
.dzp-facts { gap: 0; margin: 0; padding: 0; }
.dzp-heroFacts { gap: 0; margin: 0; }

/* ---- feedback ---------------------------------------------------------- */

.dzp-status, .dzp-note, .dzp-warning, .dzp-error, .dzp-notice {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: 0.005em;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-note { font-size: 12px; line-height: 18px; }
.dzp-warning { color: var(--dsw-alias-state-warn-label); }
.dzp-error { color: var(--dsw-alias-state-error-secondary); }
/* The one line that reports something the user caused; it arrives, then stays. */
.dzp-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-state-success-primary);
  font-weight: 500;
  animation: dzp-rise var(--dzp-base) var(--dzp-ease-out) both;
}
/* A waiting state says so with motion, so an unchanged screen is not read as a
   hung one. */
.dzp-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-interactive-bg-hover-solid);
  border-top-color: var(--dsw-alias-label-tertiary);
  animation: dzp-spin 720ms linear infinite;
}

/* A surface that has been asked for but has not answered yet is stood in for by
   a block of its own shape. The sweep runs on the compositor: it says "still
   coming" without moving the layout around it. */
.dzp-skeleton {
  display: block;
  width: 96px;
  height: 12px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover-solid);
  opacity: 0.5;
  animation: dzp-breathe 1.6s var(--dzp-ease) infinite;
}
.dzp-skeleton[data-wide='true'] { width: 132px; }
.dzp-skeleton[data-figure='true'] { width: 64px; height: 20px; border-radius: 6px; }
.dzp-skeletonRow { display: flex; align-items: center; gap: 14px; padding: 3px 0; }
.dzp-skeletonRow .dzp-skeleton:first-child { width: 88px; height: 10px; }
/* Inside a table cell the block fills the column it is standing in for. */
.dzp-skeleton[data-cell='true'] { width: 100%; max-width: 160px; }
table td .dzp-skeleton { margin-left: auto; }
table td:first-child .dzp-skeleton { margin-left: 0; }

/* "Nothing here" is a fact about the window, said once, in the middle of the
   surface the data would have filled. */
.dzp-emptyState {
  margin: 0;
  padding: 28px 0;
  text-align: center;
  font-size: 13px;
  line-height: 20px;
  letter-spacing: 0.005em;
  color: var(--dsw-alias-label-tertiary);
  animation: dzp-rise var(--dzp-base) var(--dzp-ease-out) both;
}

/* ---- the account block ------------------------------------------------- */

/* One raised surface for everything about the account. The material is what
   groups it; no rule is needed around the rows inside. */
.dzp-hero {
  gap: 16px;
  padding: 18px 20px 20px;
  border-radius: 18px;
  background-color: var(--dzp-glass, rgba(255, 255, 255, 0.58));
  background-image: var(--dzp-glass-sheen, none);
  -webkit-backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge, rgba(255, 255, 255, 0.72)),
    var(--dzp-glass-shadow, 0 8px 24px -10px rgba(0, 0, 0, 0.14));
  animation: dzp-rise var(--dzp-base) var(--dzp-ease-out) both;
}
.dzp-heroRow {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
  padding: 3px 0;
}
.dzp-heroLabel {
  flex: 0 0 88px;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-heroValue {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
/* An expired credential is the one account fact worth flagging in colour. */
.dzp-heroValueStale { color: var(--dsw-alias-state-warn-label); }
.dzp-heroFooter {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.dzp-heroMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-heroMetaItem { display: inline-flex; align-items: center; gap: 6px; }
.dzp-heroMetaItem + .dzp-heroMetaItem::before {
  content: '';
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
}
.dzp-heroActions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex: 0 0 auto;
}

/* ---- the section head -------------------------------------------------- */

.dzp-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dzp-sectionHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}
.dzp-sectionTitle {
  margin: 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--dsw-alias-label-primary);
}
/* A title and the pill that belongs to it read as one group at the head. */
.dzp-sectionTitleGroup {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.dzp-sectionMeta {
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
/* One glyph-sized action, sized for the pointer rather than for the text. */
.dzp-cardAction { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; flex: 0 0 auto; }

/* On a narrow surface the head stacks: the title keeps its own line and the
   timestamp and refresh control sit under it, right-aligned. */
@media (max-width: 560px) {
  .dzp-sectionHead { row-gap: 6px; }
  .dzp-sectionTitleGroup { flex: 1 0 100%; }
}

/* ---- the quota cards --------------------------------------------------- */

.dzp-quotaSection { gap: 12px; }
.dzp-quotaCards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(172px, 1fr));
  gap: 10px;
  min-width: 0;
}
.dzp-quotaCard {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  background-color: var(--dzp-glass, rgba(255, 255, 255, 0.58));
  background-image: var(--dzp-glass-sheen, none);
  -webkit-backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge, rgba(255, 255, 255, 0.72)),
    var(--dzp-glass-shadow, 0 8px 24px -10px rgba(0, 0, 0, 0.14));
  transition:
    background-color var(--dzp-fast) var(--dzp-ease),
    box-shadow var(--dzp-fast) var(--dzp-ease),
    transform var(--dzp-fast) var(--dzp-ease-out);
  animation: dzp-rise var(--dzp-base) var(--dzp-ease-out) both;
  animation-delay: var(--dzp-stagger, 0ms);
}
.dzp-quotaCard:hover {
  background-color: var(--dzp-glass-strong, rgba(255, 255, 255, 0.8));
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge, rgba(255, 255, 255, 0.72)),
    var(--dzp-glass-shadow, 0 8px 24px -10px rgba(0, 0, 0, 0.14));
}
.dzp-quotaCard:active { transform: scale(0.996); }
.dzp-quotaCardHead {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 18px;
  min-width: 0;
}
.dzp-quotaCardLabel {
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dzp-quotaCardFigures {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
/* The figure is the focal point: large, tight, and on the tabular grid so it
   cannot jitter as the number changes. */
.dzp-quotaCardValue {
  font-size: 26px;
  line-height: 30px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dzp-quotaCardReset {
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The bar is painted once at full width and scaled to the remaining share, so a
   new snapshot animates on the compositor instead of re-laying out, and the
   change reads as the value moving rather than as a redraw. A bucket below a
   tenth keeps a sliver of colour, so "nearly spent" still reads as a bar rather
   than as an empty track. */
.dzp-quotaBar {
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dsw-alias-interactive-bg-hover);
}
.dzp-quotaBarFill {
  width: 100%;
  height: 100%;
  min-width: 4px;
  border-radius: inherit;
  transform-origin: 0 50%;
  transform: scaleX(var(--dzp-fill, 0));
  transition: transform var(--dzp-settle) var(--dzp-ease), background-color var(--dzp-base) linear;
  will-change: transform;
}

/* ---- the reset affordances --------------------------------------------- */

/* The one control here that spends something, so it reads as a control: a pill,
   a fill, and a press that lands on the pointer. */
.dzp-resetEntry, .dzp-resetBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-primary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.01em;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--dzp-fast) var(--dzp-ease),
    transform var(--dzp-fast) var(--dzp-ease-out);
}
.dzp-resetEntry:hover, .dzp-resetBadge:hover { background: var(--dsw-alias-interactive-bg-hover-accent); }
.dzp-resetEntry:active, .dzp-resetBadge:active { transform: scale(0.94); }
.dzp-resetBadge { height: 24px; padding: 0 10px; font-size: 12px; }
.dzp-resetBadgeCountdown {
  margin-left: 2px;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}
/* A reset in flight is reported with the spinner rather than a bare word. */
.dzp-resetPending {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-resetDone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-state-success-primary);
  animation: dzp-pop var(--dzp-base) var(--dzp-ease-out) both;
}

/* ---- the reset dialog -------------------------------------------------- */

.dzp-dialogSectionTitle {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary);
}
/* Rows are separated by a hairline between neighbours rather than by a box
   each, which is what makes a list read as one surface. */
.dzp-dialogUsageRow {
  display: grid;
  grid-template-columns: minmax(96px, 1fr) 64px minmax(96px, auto);
  align-items: center;
  gap: 6px 12px;
  min-height: 46px;
  padding: 10px 2px;
}
.dzp-dialogUsageRow + .dzp-dialogUsageRow { border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dzp-dialogUsageRow .dzp-quotaBar { grid-column: 1 / -1; }
.dzp-dialogUsageLabel {
  font-size: 13px;
  line-height: 18px;
  letter-spacing: 0.005em;
  color: var(--dsw-alias-label-primary);
}
.dzp-dialogUsageValue {
  font-size: 14px;
  line-height: 18px;
  font-weight: 500;
  text-align: right;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dzp-dialogUsageMeta {
  font-size: 11px;
  line-height: 16px;
  text-align: right;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dzp-dialogResetRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 2px;
}
.dzp-dialogResetRow + .dzp-dialogResetRow { border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dzp-dialogResetInfo { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dzp-dialogResetLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--dsw-alias-label-primary);
}
.dzp-dialogResetMeta {
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dzp-countPill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-primary);
  font-size: 11px;
  font-weight: 500;
}

/* ---- the runtime capability switches ---------------------------------- */

/* One translucent material for the whole card: what groups the rows is the
   surface itself, so nothing inside carries a background of its own. The
   hairline, the top-edge light, and the layered shadow are what make the
   material read as raised rather than drawn. */
.dzp-backendCard {
  --dzp-be-bg: rgba(255, 255, 255, 0.62);
  --dzp-be-edge: rgba(0, 0, 0, 0.06);
  --dzp-be-topline: rgba(255, 255, 255, 0.5);
  --dzp-be-label: rgba(0, 0, 0, 0.9);
  --dzp-be-secondary: rgba(0, 0, 0, 0.6);
  --dzp-be-tertiary: rgba(0, 0, 0, 0.38);
  --dzp-be-hair: rgba(0, 0, 0, 0.08);
  --dzp-be-press: rgba(120, 120, 128, 0.12);
  --dzp-be-skeleton: rgba(120, 120, 128, 0.22);
  --dzp-be-track: rgba(120, 120, 128, 0.32);
  --dzp-be-on: #34C759;
  --dzp-be-warn: #B25F00;
  --dzp-be-error: #FF453A;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--dzp-glass-hair, var(--dzp-be-edge));
  border-radius: 18px;
  background-color: var(--dzp-glass, var(--dzp-be-bg));
  background-image: var(--dzp-glass-sheen, none);
  -webkit-backdrop-filter: var(--dzp-glass-blur, blur(20px) saturate(180%));
  backdrop-filter: var(--dzp-glass-blur, blur(20px) saturate(180%));
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge, var(--dzp-be-topline)),
    var(--dzp-glass-shadow, 0 8px 24px rgba(0, 0, 0, 0.08));
  animation: dzp-be-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
body[data-ds-dark-theme] .dzp-backendCard {
    --dzp-be-bg: rgba(28, 28, 30, 0.62);
    --dzp-be-edge: rgba(255, 255, 255, 0.08);
    --dzp-be-topline: rgba(255, 255, 255, 0.08);
    --dzp-be-label: rgba(255, 255, 255, 0.92);
    --dzp-be-secondary: rgba(255, 255, 255, 0.6);
    --dzp-be-tertiary: rgba(255, 255, 255, 0.38);
    --dzp-be-hair: rgba(255, 255, 255, 0.14);
    --dzp-be-skeleton: rgba(120, 120, 128, 0.32);
    --dzp-be-on: #30D158;
  --dzp-be-warn: #FF9F0A;
  box-shadow: inset 0 1px 0 var(--dzp-be-topline), 0 8px 24px rgba(0, 0, 0, 0.32);
}

.dzp-backendHead { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 2px 2px 13px; }
.dzp-backendSubtitle {
  margin: 0;
  font-size: 12.5px;
  line-height: 17px;
  letter-spacing: -0.005em;
  color: var(--dzp-be-secondary);
}
/* The tools run on the plan credential; without it the switches still flip
   but nothing answers. */
.dzp-backendWarn {
  margin: 3px 0 0;
  font-size: 12.5px;
  line-height: 17px;
  color: var(--dzp-be-warn);
}

.dzp-backendList { display: flex; flex-direction: column; min-width: 0; }
.dzp-backendRowSlot { position: relative; display: flex; flex-direction: column; min-width: 0; }
/* A hairline between neighbours that starts beside the text, not at the
   card's edge; the icon column reads as part of the row above it. */
.dzp-backendRowSlot + .dzp-backendRowSlot::after {
  content: '';
  position: absolute;
  top: 0;
  left: 40px;
  right: 0;
  height: 1px;
  background: var(--dzp-be-hair);
}

/* The row is the switch: one button across the whole width, keyboard
   toggleable, with the track as its rightmost element. */
.dzp-backendRow {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 8px 2px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
/* Press feedback lands on pointer-down and fades out on release: the
   transition belongs to the resting state only. */
.dzp-backendRow:active { background-color: var(--dzp-be-press); transition: none; }
.dzp-backendRow:disabled { opacity: 0.45; cursor: not-allowed; }
.dzp-backendRow:focus-visible {
  outline: 3px solid rgba(10, 132, 255, 0.4);
  outline-offset: 2px;
}

/* Icon tile: a solid system tint with a white stroke glyph. */
.dzp-backendIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--dzp-be-tint, #0A84FF);
  color: #fff;
}
.dzp-backendIconGlyph { display: block; width: 16px; height: 16px; }

.dzp-backendText { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.dzp-backendRowTitle {
  font-size: 14px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--dzp-be-label);
}
.dzp-backendRowDesc {
  font-size: 12.5px;
  line-height: 1.35;
  color: var(--dzp-be-secondary);
}

/* A write in flight: a 14px conic sweep beside the track, while the track
   holds the optimistically flipped value. */
.dzp-backendSpinner {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(120, 120, 128, 0), var(--dzp-be-secondary));
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
  animation: dzp-spin 800ms linear infinite;
}

/* The switch: a 51x31 track and a 27px knob that settles without
   overshooting. */
.dzp-backendSwitchTrack {
  position: relative;
  flex: 0 0 auto;
  width: 51px;
  height: 31px;
  border-radius: 999px;
  background: var(--dzp-be-track);
  transition:
    width 120ms cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color 200ms ease-out;
}
.dzp-backendRow[aria-checked='true'] .dzp-backendSwitchTrack { background: var(--dzp-be-on); }
.dzp-backendSwitchKnob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dzp-backendRow[aria-checked='true'] .dzp-backendSwitchKnob { transform: translateX(20px); }
/* The iOS stretch: while the row is held the track widens and the knob grows
   a touch; both answer within 120ms. */
.dzp-backendRow:active .dzp-backendSwitchTrack { width: 55px; }
.dzp-backendRow:active .dzp-backendSwitchKnob {
  transform: scale(1.06);
  transition: transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dzp-backendRow:active[aria-checked='true'] .dzp-backendSwitchKnob { transform: translateX(20px) scale(1.06); }

/* A refused write is the row's own fact, said under the row it belongs to. */
.dzp-backendRowError {
  margin: 0;
  padding: 0 2px 8px 40px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dzp-be-error);
  animation: dzp-be-fade 160ms ease-out both;
}
.dzp-backendLoadError {
  margin: 0;
  padding: 0 2px 4px;
  font-size: 12.5px;
  line-height: 17px;
  color: var(--dzp-be-error);
  animation: dzp-be-fade 160ms ease-out both;
}

.dzp-backendFootnote {
  margin: 10px 0 0;
  padding: 0 2px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dzp-be-tertiary);
}
.dzp-backendReadOnly {
  margin: 4px 0 0;
  padding: 0 2px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dzp-be-secondary);
}

/* The stand-in rows while the snapshot is still on its way. */
.dzp-backendSkeletonRow {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 8px 2px;
}
.dzp-backendSkeletonIcon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--dzp-be-skeleton);
  animation: dzp-breathe 1.6s ease-in-out infinite;
}
.dzp-backendSkeletonText { display: flex; flex-direction: column; gap: 5px; flex: 1 1 auto; min-width: 0; }
.dzp-backendSkeletonBar {
  display: block;
  height: 12px;
  width: 46%;
  border-radius: 4px;
  background: var(--dzp-be-skeleton);
  animation: dzp-breathe 1.6s ease-in-out infinite;
}
.dzp-backendSkeletonBar + .dzp-backendSkeletonBar { width: 30%; }
.dzp-backendSkeletonSwitch {
  flex: 0 0 auto;
  width: 51px;
  height: 31px;
  border-radius: 999px;
  background: var(--dzp-be-skeleton);
  animation: dzp-breathe 1.6s ease-in-out infinite;
}

/* The card arrives once: rising into place with the settling curve. */
@keyframes dzp-be-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dzp-be-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- labelled facts and the usage tables ------------------------------- */

.dzp-factRow {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
  padding: 7px 0;
}
.dzp-factRow + .dzp-factRow { border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dzp-factLabel {
  flex: 0 0 42%;
  max-width: 220px;
  font-size: 13px;
  line-height: 18px;
  letter-spacing: 0.005em;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-factValue {
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.dzp-usageTable { width: 100%; border-collapse: collapse; font-size: 13px; }
.dzp-usageTable th, .dzp-usageTable td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
}
.dzp-usageTable thead th {
  padding-top: 4px;
  padding-bottom: 6px;
  border-bottom-color: var(--dsw-alias-border-l2);
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-usageTable tbody tr { transition: background var(--dzp-fast) var(--dzp-ease); }
.dzp-usageTable tbody tr:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dzp-usageTable tbody tr:last-child td { border-bottom: 0; }
.dzp-usageTable td { color: var(--dsw-alias-label-primary); }
.dzp-usageTable td:not(:first-child), .dzp-usageTable th:not(:first-child) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* Inside the card the table shares the card's content column: its first and last
   cells are flush with the text above it, so the figures read as the card's own
   rows rather than as a table dropped into it. */
.dzp-usageTable th:first-child, .dzp-usageTable td:first-child { padding-left: 0; }
.dzp-usageTable th:last-child, .dzp-usageTable td:last-child { padding-right: 0; }
/* The models table's total is a line under its rows, not a row among them. */
.dzp-usageTotal {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.005em;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dzp-usageTotal > span:first-child { color: var(--dsw-alias-label-tertiary); }

/* ---- the activity figures ---------------------------------------------- */

/* The activity numbers are a grid of labelled figures rather than a list of
   label/value rows: each is a number first, so each gets its own column and its
   own size, and the eye compares them down the column. */
.dzp-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 14px 12px;
  margin: 0;
}
.dzp-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dzp-stat[data-wide='true'] { grid-column: 1 / -1; }
.dzp-statLabel {
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: var(--dsw-alias-label-tertiary);
  overflow-wrap: anywhere;
}
.dzp-statValue {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: 17px;
  line-height: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
/* A figure whose text is a sentence rather than a number keeps the row's
   baseline without pretending to be a figure. */
.dzp-stat[data-wide='true'] .dzp-statValue {
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: 0.005em;
}
.dzp-statMeta {
  font-size: 11px;
  line-height: 16px;
  font-weight: 400;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ---- the range control ------------------------------------------------- */

/* The same segmented control the page's own bar uses: one glass track, and one
   pill painted behind the labels that travels rather than cross-fading, so a
   change of window reads as one object moving rather than as three buttons
   blinking in turn. */
.dzp-rangeTabs {
  position: relative;
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  padding: 3px;
  border-radius: 11px;
  background: rgba(120, 120, 128, 0.16);
  box-shadow:
    inset 0 0 0 0.5px var(--dzp-glass-hair),
    inset 0 1px 2px rgba(0, 0, 0, 0.05);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  backdrop-filter: blur(14px) saturate(160%);
}
.dzp-rangeThumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / var(--dzp-range-count, 3));
  border-radius: 8px;
  background-color: var(--dzp-glass-strong);
  background-image: var(--dzp-glass-sheen);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge),
    0 1px 2px rgba(0, 0, 0, 0.08);
  transform: translateX(calc(var(--dzp-range-index, 0) * 100%));
  transition: transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}
.dzp-rangeTab {
  position: relative;
  z-index: 1;
  border: 0;
  padding: 4px 10px;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.005em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dzp-rangeTab:hover { color: var(--dsw-alias-label-primary); }
.dzp-rangeTab:active { transform: scale(0.96); transition: transform 0s; }
.dzp-rangeTab[aria-selected='true'] {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
/* While the chosen window is still being read, its own tab carries the quiet
   mark that says the strip is waiting. It rides inside the pill, so the
   control's geometry never moves. */
.dzp-rangeTab[data-loading='true']::after {
  content: '';
  position: absolute;
  inset-inline: 8px;
  bottom: 2px;
  height: 2px;
  border-radius: 1px;
  background: var(--dsw-alias-label-tertiary);
  animation: dzp-tabwait 900ms var(--dzp-ease) infinite;
}

/* ---- reading a window --------------------------------------------------- */

/* The panel is the tabpanel: one window's answer, and the motion and copy that
   say while that answer is on its way. */
/* The window's figures are a surface of their own: the same material as the
   cards above, so the lower half of the page is drawn, not left on the page. */
.dzp-usagePanel {
  position: relative;
  min-width: 0;
  padding: 16px 18px;
  border-radius: 16px;
  background-color: var(--dzp-glass, rgba(255, 255, 255, 0.58));
  background-image: var(--dzp-glass-sheen, none);
  -webkit-backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge, rgba(255, 255, 255, 0.72)),
    var(--dzp-glass-shadow, 0 8px 24px -10px rgba(0, 0, 0, 0.14));
  outline: none;
}
/* The panel is focusable so its rows can be scrolled from the keyboard; the ring
   is drawn outside the material rather than over it. */
.dzp-usagePanel:focus-visible {
  outline: 3px solid rgba(10, 132, 255, 0.4);
  outline-offset: 2px;
}
/* The chosen window's content travels in from the side the selection moved
   towards, so a switch has a direction rather than only a destination. */
.dzp-usageSwap { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dzp-usageSwap[data-direction='next'] { animation: dzp-swap-next var(--dzp-base) var(--dzp-ease-out) both; }
.dzp-usageSwap[data-direction='prev'] { animation: dzp-swap-prev var(--dzp-base) var(--dzp-ease-out) both; }
/* An unanswered read is reported at the top of its own surface, not in the
   control: the tab is the control, this is the status. The sweep runs on one
   composited layer and never moves the layout around it. */
.dzp-usageProgress {
  height: 2px;
  overflow: hidden;
  border-radius: 1px;
  background: var(--dsw-alias-interactive-bg-hover);
}
.dzp-usageProgress::before {
  content: '';
  display: block;
  width: 36%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, var(--dsw-alias-label-primary-dimmed), transparent);
  animation: dzp-sweep 1.05s var(--dzp-ease) infinite;
}
.dzp-usageStatus {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.005em;
  color: var(--dsw-alias-label-tertiary);
}
/* A failed read says so where its figures would have rendered, and offers the
   one action that can change the outcome. */
.dzp-usageFailure {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.dzp-usageRetry {
  border: 0;
  padding: 2px 8px;
  border-radius: calc(var(--dsw-radius-sm) - 2px);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.005em;
  cursor: pointer;
  transition:
    background var(--dzp-base) var(--dzp-ease),
    color var(--dzp-base) var(--dzp-ease),
    transform var(--dzp-fast) var(--dzp-ease-out);
}
.dzp-usageRetry:hover { color: var(--dsw-alias-label-primary); }
.dzp-usageRetry:active { transform: scale(0.96); }
/* The answered surface settles in once, in the same frame its figures replace
   the loading placeholder. */
.dzp-usageSection {
  animation: dzp-resolve var(--dzp-base) var(--dzp-ease-out) backwards;
}
/* A heading and the span it covers share one baseline. */
.dzp-usageSectionHead {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

/* ---- signing in -------------------------------------------------------- */

.dzp-signInCard {
  gap: 16px;
  max-width: 440px;
  min-width: 0;
  padding: 20px;
  border-radius: 18px;
  background-color: var(--dzp-glass, rgba(255, 255, 255, 0.58));
  background-image: var(--dzp-glass-sheen, none);
  -webkit-backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  backdrop-filter: var(--dzp-glass-blur, blur(26px) saturate(180%));
  box-shadow:
    inset 0 0.5px 0 var(--dzp-glass-edge, rgba(255, 255, 255, 0.72)),
    var(--dzp-glass-shadow, 0 8px 24px -10px rgba(0, 0, 0, 0.14));
  animation: dzp-rise var(--dzp-base) var(--dzp-ease-out) both;
}
.dzp-pickers { gap: 10px; }
.dzp-pickerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dzp-picker {
  flex: 0 1 220px;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  transition: background var(--dzp-fast) var(--dzp-ease), box-shadow var(--dzp-fast) var(--dzp-ease);
}
.dzp-picker:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
.dzp-picker:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2), 0 0 0 4px var(--dsw-alias-label-primary-dimmed);
}
.dzp-signInActions { display: flex; align-items: center; gap: 8px; }
.dzp-authorize { gap: 10px; align-items: flex-start; }
.dzp-authorizeLink {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-link);
}

/* ---- focus ------------------------------------------------------------- */

/* Pointer users never see a ring; keyboard users always do. */
.dzp-rangeTab:focus-visible, .dzp-usageRetry:focus-visible,
.dzp-resetEntry:focus-visible, .dzp-resetBadge:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2), 0 0 0 4px var(--dsw-alias-label-primary-dimmed);
}

/* ---- motion ------------------------------------------------------------ */

@keyframes dzp-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dzp-pop {
  0% { opacity: 0; transform: scale(0.9); }
  60% { opacity: 1; transform: scale(1.03); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes dzp-spin {
  to { transform: rotate(360deg); }
}
@keyframes dzp-breathe {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.6; }
}
/* A read that has not answered yet: a sweep across the top line, the waiting
   mark under the chosen tab, and the content that resolves into place. */
@keyframes dzp-sweep {
  from { transform: translateX(-100%); }
  to { transform: translateX(280%); }
}
@keyframes dzp-tabwait {
  0%, 100% { opacity: 0.2; transform: scaleX(0.4); }
  50% { opacity: 0.75; transform: scaleX(1); }
}
@keyframes dzp-swap-next {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes dzp-swap-prev {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes dzp-resolve {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Reduced motion keeps every state change and drops the travel: the same
   information, without the movement. */
@media (prefers-reduced-motion: reduce) {
  .dzp-page *, .dzp-page *::before, .dzp-page *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-property: background, background-color, color, box-shadow, opacity !important;
    transition-duration: 120ms !important;
  }
  .dzp-quotaBarFill { transition: none !important; }
  .dzp-rangeThumb { transition: none !important; }
  .dzp-quotaCard:active, .dzp-resetEntry:active, .dzp-resetBadge:active, .dzp-rangeTab:active,
  .dzp-usageRetry:active {
    transform: none !important;
  }
}

/* Reduced transparency: the material goes solid rather than losing its
   edges. */
@media (prefers-reduced-transparency: reduce) {
  .dzp-quotaCard, .dzp-hero, .dzp-signInCard, .dzp-usagePanel {
    background: var(--dsw-alias-bg-layer-1);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .dzp-shell::before { background: none; }
  .dzp-tabs {
    background: var(--dsw-alias-interactive-bg-hover-solid);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .dzp-tabsThumb, .dzp-rangeThumb {
    background: var(--dsw-alias-bg-layer-1);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .dzp-rangeTabs {
    background: var(--dsw-alias-interactive-bg-hover-solid);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

/* More contrast: define the edges the hairline was carrying. */
@media (prefers-contrast: more) {
  .dzp-quotaCard, .dzp-hero, .dzp-signInCard, .dzp-picker, .dzp-rangeTabs, .dzp-tabs, .dzp-usagePanel {
    box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3);
  }
  .dzp-rangeThumb { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3); }
}


/* The two-view shell's own preference answers: the bar stops travelling and
   the view keeps only its fade. */
@media (prefers-reduced-motion: reduce) {
  .dzp-shell *, .dzp-shell *::before, .dzp-shell *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-property: color, background-color, box-shadow, opacity !important;
    transition-duration: 120ms !important;
  }
  .dzp-tabsThumb { transition: none !important; }
  .dzp-tab:active { transform: none !important; }
  .dzp-tabPanel { animation: dzp-be-fade 160ms linear both !important; }
}

/* The switches' own preference answers: the card's arrival keeps only its
   fade, the knob and track settle quickly and linearly, the sweep becomes a
   pulsing dot, and the skeleton stands still. */
@media (prefers-reduced-motion: reduce) {
  .dzp-backendCard { animation: dzp-be-fade 160ms linear both !important; }
  .dzp-backendSwitchKnob, .dzp-backendSwitchTrack { transition: all 80ms linear !important; }
  .dzp-backendSpinner {
    background: var(--dzp-be-secondary);
    -webkit-mask: none;
    mask: none;
    animation: dzp-breathe 1.2s ease-in-out infinite !important;
  }
  .dzp-backendSkeletonIcon, .dzp-backendSkeletonBar, .dzp-backendSkeletonSwitch { animation: none; }
}

/* Reduced transparency: the material goes solid rather than losing its
   edges. */
@media (prefers-reduced-transparency: reduce) {
  .dzp-backendCard {
    background: rgba(255, 255, 255, 0.96);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  body[data-ds-dark-theme] .dzp-backendCard { background: rgba(28, 28, 30, 0.96); }
}

/* More contrast: give the material the edge the hairline was carrying. */
@media (prefers-contrast: more) {
  .dzp-backendCard { border-color: rgba(0, 0, 0, 0.6); }
}
@media (prefers-contrast: more) {
  body[data-ds-dark-theme] .dzp-backendCard { border-color: rgba(255, 255, 255, 0.7); }
}
`

/** The stylesheet text, for the build's class check. */
export const STYLE_SHEET = SHEET

/** Prefixed class names, so the markup and the sheet cannot drift apart. */
export const styles: Record<StyleClass, string> = Object.freeze(
  Object.fromEntries(STYLE_CLASSES.map(name => [name, `${PREFIX}${name}`])) as Record<StyleClass, string>,
)

/** One remaining share, as the transform the bar is painted with. */
export function shareScale(percent: number | undefined): Record<string, string> {
  return { '--dzp-fill': String(Math.max(0, Math.min(100, percent ?? 0)) / 100) }
}

/**
 * A card's place in the arrival order, so a row of cards lands as a sequence
 * rather than as one block.
 * @param index - the card's position.
 * @returns the inline custom property the card animates with.
 */
export function staggerAt(index: number): Record<string, string> {
  return { '--dzp-stagger': `${String(Math.min(index, 5) * 45)}ms` }
}

let injected = false

/** Add the stylesheet to the document once, on this plugin's first materialization. */
export function ensureStyles(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const element = document.createElement('style')
  element.dataset['dshPlugin'] = 'dsh-zhipu-plan'
  element.textContent = SHEET
  document.head.append(element)
}
