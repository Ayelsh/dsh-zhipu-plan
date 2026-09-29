/**
 * Stand-ins for the two shell primitives this page uses, so the rendered
 * preview can be produced without the application's own browser build. They
 * keep the same props; only the chrome differs, and the preview's sheet styles
 * them so the layout reads the way the real controls would.
 *
 * @module dsh-zhipu-plan/scripts/preview-primitives
 */

import { createElement as h, useEffect } from 'react'

/**
 * Render one preview button.
 * @param props - the Button props this page passes.
 * @returns the button element.
 */
export function Button({ variant = 'ghost', size = 'md', icon, className, children, ...rest }) {
  return h('button', {
    type: 'button',
    className: ['dzp-preview-button', `dzp-preview-${variant}`, `dzp-preview-${size}`, className].filter(Boolean).join(' '),
    ...rest,
  }, icon == null ? null : h('span', { className: 'dzp-preview-button-icon' }, icon), children)
}

/**
 * Render one preview modal, closed when `open` is false.
 * @param props - the Modal props this page passes.
 * @returns the dialog markup.
 */
export function Modal({ open, onClose, title, closeLabel, children }) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, onClose])
  if (!open) return null
  return h('div', { className: 'dzp-preview-modal' }, [
    h('div', { key: 'mask', className: 'dzp-preview-modal-mask', onClick: onClose }),
    h('div', { key: 'dialog', className: 'dzp-preview-modal-dialog', role: 'dialog', 'aria-label': title }, [
      h('div', { key: 'head', className: 'dzp-preview-modal-head' }, [
        h('span', { key: 'title', className: 'dzp-preview-modal-title' }, title),
        h('button', { key: 'close', type: 'button', className: 'dzp-preview-button dzp-preview-ghost dzp-preview-sm', onClick: onClose }, closeLabel),
      ]),
      h('div', { key: 'body', className: 'dzp-preview-modal-body' }, children),
    ]),
  ])
}

/** The check mark the completed reset shows. */
export function IconCheckOutline16({ size = 16 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
    h('path', { key: 'p', d: 'M3 8.5l3 3 7-7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
  ])
}

/** The refresh mark on the quota header. */
export function IconRefreshOutline16({ size = 16 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
    h('path', { key: 'p', d: 'M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
  ])
}

/** The mark beside a granted reset. */
export function IconSparkle16({ size = 16 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
    h('path', { key: 'p', d: 'M8 2l1.4 4.1L13.5 7.5 9.4 8.9 8 13l-1.4-4.1L2.5 7.5l4.1-1.4z', fill: 'currentColor' }),
  ])
}

/**
 * Copy text to the clipboard.
 * @param text - the text to copy.
 * @returns a promise that resolves once the copy ran.
 */
export async function writeClipboard(text) {
  await globalThis.navigator?.clipboard?.writeText?.(text)
}
