/**
 * The page's two views, as one tab bar.
 *
 * 联网能力 and 套餐账户 were stacked in one column, the switches card sitting
 * directly above the account with nothing between them but a gap, so the two
 * read as one long page rather than as two subjects. The bar makes the choice
 * explicit: one view is on screen at a time, and the bar itself says which.
 *
 * It is this plugin's own control rather than a shell slot, because both views
 * belong to this plugin and neither has an identity the shell could address.
 *
 * The bar follows the fluid-interface rules. The selected pill is painted on
 * pointer-down, travels from where it already is rather than cross-fading, and
 * the view it reveals settles in from the value already on screen. A view
 * mounts the first time it is chosen and stays mounted while hidden, so a
 * half-finished read, a running poll, or a scrolled table survives the trip to
 * the other view.
 *
 * Every string this file renders lives in `./locales.ts`.
 *
 * @module dsh-zhipu-plan/client/SettingsTabs
 */

import {
  useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode,
} from 'react'
import type { PlanLocaleKey } from './locales.ts'
import { styles } from './styles.ts'

/** This page's copy seat. */
type Translate = (key: PlanLocaleKey, params?: Record<string, unknown>) => string

/** One view the bar can show. */
export interface SettingsTabSpec {
  /** Stable id, used for the tab's and the panel's element ids. */
  readonly id: string
  /** The dictionary key naming this view. */
  readonly label: PlanLocaleKey
}

/** Props the section registration hands the bar. */
export interface SettingsTabsProps {
  readonly t: Translate
  /** The views, in the order the bar presents them. */
  readonly tabs: readonly SettingsTabSpec[]
  /** Render one view's content; called only for a mounted view. */
  readonly render: (id: string) => ReactNode
}

/**
 * The page shell: the ambient field, the bar, and the one view it selects.
 * @param props - the copy seat, the views, and their content.
 */
export function SettingsTabs(props: SettingsTabsProps): ReactNode {
  const { t, tabs, render } = props
  const tabsId = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const [activeId, setActiveId] = useState<string>()
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set())

  // The first view is selected without a click, so the initial state is the
  // one the bar will show; a later change of `tabs` falls back to the first.
  const active = tabs.find(tab => tab.id === activeId)?.id ?? tabs[0]?.id
  const activeIndex = Math.max(0, tabs.findIndex(tab => tab.id === active))

  // A view joins the mounted set when it is first selected and never leaves
  // it: hiding is not unmounting, so its state and running effects survive.
  useEffect(() => {
    if (active === undefined) return
    setVisited((prior) => (prior.has(active) ? prior : new Set(prior).add(active)))
  }, [active])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = tabs.length - 1
    let next: number | undefined
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === undefined) return
    event.preventDefault()
    setActiveId(tabs[next]?.id)
    buttons.current[next]?.focus()
  }

  return (
    <section className={styles.panel}>
      <div className={styles.shell}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label={t('nav')}
          style={{
            '--dzp-tab-count': String(tabs.length),
            '--dzp-tab-index': String(activeIndex),
          } as CSSProperties}
        >
          <span className={styles.tabsThumb} aria-hidden="true" />
          {tabs.map((tab, index) => {
            const selected = tab.id === active
            return (
              <button
                key={tab.id}
                ref={(node) => { buttons.current[index] = node }}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${tabsId}-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className={styles.tab}
                onClick={() => { setActiveId(tab.id) }}
                onKeyDown={(event) => { onKeyDown(event, index) }}
              >
                {t(tab.label)}
              </button>
            )
          })}
        </div>
        {tabs.filter(tab => tab.id === active || visited.has(tab.id)).map((tab) => {
          const selected = tab.id === active
          return (
            <div
              key={tab.id}
              id={`${tabsId}-panel-${tab.id}`}
              className={styles.tabPanel}
              role="tabpanel"
              aria-labelledby={`${tabsId}-tab-${tab.id}`}
              hidden={!selected}
            >
              {render(tab.id)}
            </div>
          )
        })}
      </div>
    </section>
  )
}
