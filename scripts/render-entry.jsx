// Offline render smoke entry: mounts the page shell — the two-view bar with the
// capability switches card in its first view — against a controllable
// snapshot/save pair. The account view is a stand-in, since this smoke is about
// the bar and the switches, not the plan read. Bundled and evaluated by
// scripts/render-smoke.mjs; not part of the build.

import { createRoot } from 'react-dom/client'
import { zh } from '../src/client/locales.ts'
import { BackendSettings } from '../src/client/BackendSettings.tsx'
import { SettingsTabs } from '../src/client/SettingsTabs.tsx'

const state = {
  snapshot: {
    writable: true,
    settings: { search: true, reader: true, zread: false, zhPrompt: false },
  },
  calls: [],
}

const load = async () => state.snapshot

// The second write is refused so the smoke can see the revert-and-error path.
const save = async (key, value) => {
  state.calls.push([key, value])
  if (state.calls.length === 2) throw new Error('settings write refused')
  state.snapshot = {
    ...state.snapshot,
    settings: { ...state.snapshot.settings, [key]: value },
  }
  return state.snapshot
}

const t = (key) => zh[key]

const tabs = [
  { id: 'web', label: 'tabWeb' },
  { id: 'account', label: 'tabAccount' },
]

globalThis.__probe = {
  calls: () => state.calls.map(([key, value]) => `${key}=${value}`),
  zh,
}

createRoot(document.getElementById('app')).render(
  <SettingsTabs
    t={t}
    tabs={tabs}
    render={(id) => (id === 'web'
      ? <BackendSettings t={t} load={load} save={save} />
      : <div className="dzp-accountStub">{zh.tabAccount}</div>)}
  />,
)
