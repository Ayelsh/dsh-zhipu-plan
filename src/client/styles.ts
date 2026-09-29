/**
 * The page's stylesheet, owned by this bundle.
 *
 * This plugin is fetched outside the shell's own build, so it cannot use the
 * repository's CSS-module pipeline: the sheet below is one string, injected
 * once into the document head when the plugin materializes, and every class
 * name is prefixed so nothing it declares can collide with the shell's own
 * rules. `styles.<name>` resolves to the prefixed class for that name, and the
 * build script checks that each class the source names exists in the sheet.
 *
 * Colours come from the shell's `--dsw-alias-*` custom properties, so the page
 * follows the application theme instead of carrying a palette of its own.
 *
 * @module dsh-zhipu-plan/client/styles
 */

/** Every class this page's markup names; the sheet below must declare each one. */
export const STYLE_CLASSES = [
  'page', 'status', 'note', 'warning', 'error', 'section', 'sectionTitle', 'sectionHead',
  'sectionHeadLeft', 'sectionHeadRight', 'sectionMeta',
  'quotaCards', 'quotaCard', 'quotaCardHead', 'quotaCardLabel', 'quotaCardFigures', 'quotaCardValue',
  'quotaCardReset', 'quotaBar', 'quotaBarFill',
  'resetBadge', 'resetBadgeCountdown', 'resetEntry', 'resetDone', 'resetPending',
  'dialogBody', 'dialogSection', 'dialogSectionTitle', 'dialogUsageRow', 'dialogUsageLabel',
  'dialogUsageValue', 'dialogUsageMeta', 'dialogResetRow', 'dialogResetInfo', 'dialogResetLabel',
  'dialogResetMeta', 'countPill',
  'facts', 'factRow', 'factLabel', 'factValue',
  'rangeTabs', 'rangeTab', 'usageTable', 'usageSection',
  'pickers', 'pickerRow', 'picker',
  'signInCard', 'authorize', 'authorizeLink',
] as const

/** One class name this page uses. */
export type StyleClass = (typeof STYLE_CLASSES)[number]

const PREFIX = 'dzp-'

const SHEET = `
.dzp-page, .dzp-section, .dzp-dialogBody, .dzp-dialogSection, .dzp-signInCard, .dzp-pickers,
.dzp-facts, .dzp-usageSection { display: flex; flex-direction: column; }
.dzp-page { gap: 22px; }
.dzp-section { gap: 10px; }
.dzp-dialogBody { gap: 18px; }
.dzp-dialogSection { gap: 8px; }

.dzp-status, .dzp-note, .dzp-warning, .dzp-error {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-warning { color: var(--dsw-alias-state-warn-label); }
.dzp-error { color: var(--dsw-alias-state-error-primary); }
.dzp-note { font-size: 12px; }

.dzp-sectionHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.dzp-sectionHeadLeft, .dzp-sectionHeadRight {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dzp-sectionTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dzp-sectionMeta {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dzp-quotaCards { display: flex; gap: 12px; flex-wrap: wrap; }
.dzp-quotaCard {
  flex: 1 1 200px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 0.5px solid var(--dsw-alias-border-secondary);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.dzp-quotaCardHead {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  min-width: 0;
}
.dzp-quotaCardLabel {
  font-size: 13px;
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
.dzp-quotaCardValue {
  font-size: 24px;
  font-weight: 600;
  line-height: 30px;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dzp-quotaCardReset {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dzp-quotaBar {
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
}
.dzp-quotaBarFill {
  height: 100%;
  min-width: 4px;
  border-radius: 999px;
  transition: width 400ms ease-out;
}

.dzp-resetBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.dzp-resetBadgeCountdown {
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.dzp-resetEntry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  padding: 0;
  background: none;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.dzp-resetEntry:hover { text-decoration: underline; }
.dzp-resetPending { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dzp-resetDone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary);
}

.dzp-dialogSectionTitle {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary);
}
.dzp-dialogUsageRow {
  display: grid;
  grid-template-columns: minmax(96px, 1fr) 56px minmax(88px, auto);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dzp-dialogUsageRow .dzp-quotaBar { grid-column: 1 / -1; }
.dzp-dialogUsageLabel { font-size: 13px; color: var(--dsw-alias-label-primary); }
.dzp-dialogUsageValue {
  font-size: 13px;
  text-align: right;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dzp-dialogUsageMeta {
  font-size: 12px;
  text-align: right;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dzp-dialogResetRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.dzp-dialogResetInfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dzp-dialogResetLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.dzp-dialogResetMeta {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.dzp-countPill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-primary);
  font-size: 11px;
}

.dzp-facts { gap: 6px; margin: 0; }
.dzp-factRow { display: flex; gap: 10px; min-width: 0; }
.dzp-factLabel { min-width: 84px; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
.dzp-factValue {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  min-width: 0;
  overflow-wrap: anywhere;
}

.dzp-rangeTabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
}
.dzp-rangeTab {
  border: 0;
  padding: 4px 10px;
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dzp-rangeTab[aria-pressed='true'] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}

.dzp-usageSection { gap: 8px; }
.dzp-usageTable { width: 100%; border-collapse: collapse; font-size: 13px; }
.dzp-usageTable th, .dzp-usageTable td {
  padding: 7px 8px;
  text-align: left;
  border-bottom: 0.5px solid var(--dsw-alias-border-secondary);
}
.dzp-usageTable th { font-weight: 500; color: var(--dsw-alias-label-tertiary); }
.dzp-usageTable td { color: var(--dsw-alias-label-primary); }
.dzp-usageTable td:not(:first-child), .dzp-usageTable th:not(:first-child) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.dzp-pickers { gap: 10px; }
.dzp-pickerRow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}
.dzp-picker {
  height: 30px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.dzp-signInCard {
  gap: 12px;
  padding: 16px;
  border: 0.5px solid var(--dsw-alias-border-secondary);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.dzp-authorize { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.dzp-authorizeLink {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--dsw-alias-brand-primary);
}
`

/** The stylesheet text, for the build script's class check. */
export const STYLE_SHEET = SHEET

/** Prefixed class names, so the markup and the sheet cannot drift apart. */
export const styles: Record<StyleClass, string> = Object.freeze(
  Object.fromEntries(STYLE_CLASSES.map(name => [name, `${PREFIX}${name}`])) as Record<StyleClass, string>,
)

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
