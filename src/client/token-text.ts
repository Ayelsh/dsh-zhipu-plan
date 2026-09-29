/**
 * Compact token-count text for the plan tables (`937`, `12.4K`, `1.8M`).
 * @module dsh-zhipu-plan/client/token-text
 */

/**
 * Render one token count compactly.
 * @param value - exact token count.
 * @returns whole-unit text with one decimal below ten of the chosen unit.
 */
export function tokenText(value: number): string {
  if (value < 1_000) return `${Math.round(value)}`
  const thousands = value / 1_000
  if (thousands < 1_000) return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}K`
  const millions = thousands / 1_000
  if (millions < 1_000) return `${millions < 10 ? millions.toFixed(1) : Math.round(millions)}M`
  return `${(millions / 1_000).toFixed(1)}B`
}
