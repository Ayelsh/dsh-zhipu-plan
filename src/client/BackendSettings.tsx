/**
 * The runtime capability switches: search, reader, GitHub tools, and the
 * tool prompt language.
 *
 * These are volatile plugin settings on the host - flipping one mounts or
 * unmounts the matching global tools on the next turn, with no restart. The
 * tools are additional: the harness's own web_search and web_fetch stay
 * exactly as they are. The page reads the namespace's resolved value through
 * the settings Remote and writes one field at a time. Every string lives in
 * `./locales.ts`.
 *
 * @module dsh-zhipu-plan/client/BackendSettings
 */

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { PlanBackendSettingKey, PlanBackendSettingsSnapshot } from './plan-types.ts'
import type { PlanLocaleKey } from './locales.ts'
import { styles } from './styles.ts'

/** This page's copy seat. */
type Translate = (key: PlanLocaleKey, params?: Record<string, unknown>) => string

/** Host operations the switches need, injected by the registration. */
export interface BackendSettingsProps {
  readonly t: Translate
  /** Read the resolved switches, or undefined when the namespace is absent. */
  readonly load: () => Promise<PlanBackendSettingsSnapshot | undefined>
  /** Write one switch and return the refreshed snapshot. */
  readonly save: (key: PlanBackendSettingKey, value: boolean) => Promise<PlanBackendSettingsSnapshot>
}

/** One row's fixed dress: where its copy lives and the tint its icon wears. */
interface RowSpec {
  readonly key: PlanBackendSettingKey
  readonly label: PlanLocaleKey
  readonly hint: PlanLocaleKey
  readonly tint: string
  readonly glyph: ReactNode
}

/** The four switches, in the order the card presents them. */
const ROWS: readonly RowSpec[] = [
  {
    key: 'search',
    label: 'backendSearch',
    hint: 'backendSearchHint',
    tint: '#0A84FF',
    glyph: (
      <svg className={styles.backendIconGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.4 10.4 13.6 13.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'reader',
    label: 'backendReader',
    hint: 'backendReaderHint',
    tint: '#64D2FF',
    glyph: (
      <svg className={styles.backendIconGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M9.1 2H5.2C4.5 2 4 2.5 4 3.2v9.6c0 .7.5 1.2 1.2 1.2h5.6c.7 0 1.2-.5 1.2-1.2V5.9L9.1 2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M9 2.3v2.9h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.2 8.4h3.6M6.2 10.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'zread',
    label: 'backendZread',
    hint: 'backendZreadHint',
    tint: '#BF5AF2',
    glyph: (
      <svg className={styles.backendIconGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="4.2" cy="4.1" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="4.2" cy="11.9" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="11.8" cy="4.1" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.2 6V10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11.8 6c0 3-2.7 3.6-5 4.1-1.2.3-2.1 1-2.5 1.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'zhPrompt',
    label: 'backendPromptLanguage',
    hint: 'backendPromptLanguageHint',
    tint: '#8E8E93',
    glyph: (
      <svg className={styles.backendIconGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M4.6 12.6 8 3.6 11.4 12.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 9.6H10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

/** The switch rows shown while the snapshot is still on its way. */
const SKELETON_SLOTS = [0, 1, 2, 3] as const

/**
 * The capability switches card: one translucent material, one grouped list.
 * @param props - the read/write operations and the page's translate seat.
 */
export function BackendSettings(props: BackendSettingsProps): ReactNode {
  const { t, load, save } = props
  const [snapshot, setSnapshot] = useState<PlanBackendSettingsSnapshot>()
  const [loadFailed, setLoadFailed] = useState(false)
  const [pending, setPending] = useState<PlanBackendSettingKey>()
  const [failedKey, setFailedKey] = useState<PlanBackendSettingKey>()
  const [optimistic, setOptimistic] = useState<Partial<Record<PlanBackendSettingKey, boolean>>>({})

  useEffect(() => {
    let current = true
    setLoadFailed(false)
    void load().then(
      (value) => { if (current) setSnapshot(value) },
      () => { if (current) setLoadFailed(true) },
    )
    return () => { current = false }
  }, [load])

  const toggle = useCallback(async (key: PlanBackendSettingKey) => {
    if (pending !== undefined || snapshot === undefined || !snapshot.writable) return
    const next = !(optimistic[key] ?? snapshot.settings[key])
    setPending(key)
    setFailedKey(undefined)
    setOptimistic((prior) => ({ ...prior, [key]: next }))
    try {
      setSnapshot(await save(key, next))
    } catch {
      setFailedKey(key)
    } finally {
      setPending(undefined)
      setOptimistic((prior) => {
        if (prior[key] === undefined) return prior
        const rest = { ...prior }
        delete rest[key]
        return rest
      })
    }
  }, [optimistic, pending, save, snapshot])

  // The host may mark a snapshot whose tools cannot actually run; nothing in
  // the current wire type says so, so the warning only appears when it does.
  const notReady = (snapshot as { readonly ready?: boolean } | undefined)?.ready === false
  const loading = snapshot === undefined && !loadFailed
  const frozen = snapshot !== undefined && !snapshot.writable

  return (
    <section className={styles.backendCard}>
      <header className={styles.backendHead}>
        <p className={styles.backendSubtitle}>{t('backendHint')}</p>
        {notReady ? <p className={styles.backendWarn}>{t('backendNotReady')}</p> : undefined}
      </header>
      {loadFailed ? (
        <p className={styles.backendLoadError}>{t('backendLoadFailed')}</p>
      ) : loading ? (
        <div className={styles.backendList} aria-busy="true">
          {SKELETON_SLOTS.map((slot) => (
            <div key={slot} className={styles.backendSkeletonRow}>
              <span className={styles.backendSkeletonIcon} />
              <span className={styles.backendSkeletonText}>
                <span className={styles.backendSkeletonBar} />
                <span className={styles.backendSkeletonBar} />
              </span>
              <span className={styles.backendSkeletonSwitch} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.backendList}>
          {ROWS.map((spec) => {
            const stored = snapshot?.settings[spec.key] === true
            const value = optimistic[spec.key] ?? stored
            return (
              <div key={spec.key} className={styles.backendRowSlot}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  aria-label={t(spec.label)}
                  aria-disabled={pending === spec.key}
                  className={styles.backendRow}
                  disabled={frozen}
                  onClick={() => { void toggle(spec.key) }}
                >
                  <span
                    className={styles.backendIcon}
                    style={{ '--dzp-be-tint': spec.tint } as CSSProperties}
                  >
                    {spec.glyph}
                  </span>
                  <span className={styles.backendText}>
                    <span className={styles.backendRowTitle}>{t(spec.label)}</span>
                    <span className={styles.backendRowDesc}>{t(spec.hint)}</span>
                  </span>
                  {pending === spec.key ? <span className={styles.backendSpinner} /> : undefined}
                  <span className={styles.backendSwitchTrack}>
                    <span className={styles.backendSwitchKnob} />
                  </span>
                </button>
                {failedKey === spec.key ? (
                  <p className={styles.backendRowError}>{t('backendSaveFailed')}</p>
                ) : undefined}
              </div>
            )
          })}
        </div>
      )}
      <p className={styles.backendFootnote}>{t('backendFootnote')}</p>
      {frozen ? <p className={styles.backendReadOnly}>{t('backendReadOnly')}</p> : undefined}
    </section>
  )
}
