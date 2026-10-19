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
  // The shell's own wrapper around this page, and the page itself.
  'panel', 'page', 'hero', 'heroFacts', 'heroRow', 'heroLabel', 'heroValue', 'heroValueStale',
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
  'rangeTabs', 'rangeTab', 'usagePanel', 'usageSwap', 'usageProgress', 'usageStatus',
  'usageFailure', 'usageRetry', 'usageSection', 'usageSectionHead', 'usageBlock', 'usageTable',
  // Signing in: the card, the two pickers, the authorize notice, its actions.
  'signInCard', 'pickers', 'signInActions', 'pickerRow', 'picker',
  'authorize', 'authorizeLink',
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
.dzp-panel { display: block; min-width: 0; }
.dzp-page, .dzp-dialogBody, .dzp-dialogSection, .dzp-signInCard,
.dzp-pickers, .dzp-facts, .dzp-usageSection, .dzp-usageBlock, .dzp-authorize,
.dzp-hero, .dzp-heroFacts, .dzp-quotaSection { display: flex; flex-direction: column; }
.dzp-page { gap: 22px; min-width: 0; }
.dzp-dialogBody { gap: 20px; }
.dzp-dialogSection { gap: 10px; }
.dzp-usageSection { gap: 20px; }
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
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l1), var(--dsw-shadow-lv1);
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
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l1), var(--dsw-shadow-lv1);
  transition:
    background var(--dzp-fast) var(--dzp-ease),
    box-shadow var(--dzp-fast) var(--dzp-ease),
    transform var(--dzp-fast) var(--dzp-ease-out);
  animation: dzp-rise var(--dzp-base) var(--dzp-ease-out) both;
  animation-delay: var(--dzp-stagger, 0ms);
}
.dzp-quotaCard:hover {
  background: var(--dsw-alias-bg-layer-3);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l2), var(--dsw-shadow-lv2);
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

/* ---- the range control ------------------------------------------------- */

/* A segmented control: the chosen segment is a raised pill inside the track.
   Cross-fading the fills is what makes the switch read as one control rather
   than as three buttons. */
.dzp-rangeTabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dzp-rangeTab {
  position: relative;
  border: 0;
  padding: 4px 10px;
  border-radius: calc(var(--dsw-radius-sm) - 2px);
  background: transparent;
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
.dzp-rangeTab:hover { color: var(--dsw-alias-label-primary); }
.dzp-rangeTab:active { transform: scale(0.96); }
.dzp-rangeTab[aria-selected='true'] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
  box-shadow: var(--dsw-shadow-lv1);
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
.dzp-usagePanel { min-width: 0; border-radius: var(--dsw-radius-sm); outline: none; }
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
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-border-l1), var(--dsw-shadow-lv1);
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
.dzp-rangeTab:focus-visible, .dzp-usagePanel:focus-visible, .dzp-usageRetry:focus-visible,
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
  .dzp-quotaCard:active, .dzp-resetEntry:active, .dzp-resetBadge:active, .dzp-rangeTab:active,
  .dzp-usageRetry:active {
    transform: none !important;
  }
}

/* Reduced transparency: the material goes solid rather than losing its edges. */
@media (prefers-reduced-transparency: reduce) {
  .dzp-quotaCard, .dzp-hero, .dzp-signInCard { background: var(--dsw-alias-bg-layer-1); }
}

/* More contrast: define the edges the hairline was carrying. */
@media (prefers-contrast: more) {
  .dzp-quotaCard, .dzp-hero, .dzp-signInCard, .dzp-picker, .dzp-rangeTabs {
    box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3);
  }
  .dzp-rangeTab[aria-selected='true'] { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3); }
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
