import { create } from 'zustand'
import { defaultConfig, sanitize, type Config, type ModelId, type SceneMood } from './data/catalog'

export type CameraView = 'overview' | 'entrance' | 'side' | 'roof'

interface Store {
  config: Config
  mood: SceneMood
  view: CameraView
  /** Bumped whenever the user asks for a camera preset, even the same one twice. */
  viewNonce: number
  setModel: (m: ModelId) => void
  set: <K extends keyof Config>(key: K, value: Config[K]) => void
  setMood: (m: SceneMood) => void
  setView: (v: CameraView) => void
}

function readHash(): Config {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (!params.has('model')) return defaultConfig('quadro')
    const raw: Record<string, unknown> = Object.fromEntries(params)
    if ('windows' in raw) raw.windows = Number(raw.windows)
    if ('lighting' in raw) raw.lighting = raw.lighting === '1'
    return sanitize(raw as Partial<Config>)
  } catch {
    return defaultConfig('quadro')
  }
}

export function configToHash(c: Config): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(c)) p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
  return p.toString()
}

export const useStore = create<Store>((set) => ({
  config: readHash(),
  mood: 'day',
  view: 'overview',
  viewNonce: 0,
  setModel: (m) =>
    set((s) => (s.config.model === m ? s : { config: defaultConfig(m), view: 'overview', viewNonce: s.viewNonce + 1 })),
  set: (key, value) => set((s) => ({ config: sanitize({ ...s.config, [key]: value }) })),
  setMood: (mood) => set({ mood }),
  setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
}))

useStore.subscribe((s) => {
  const hash = '#' + configToHash(s.config)
  if (window.location.hash !== hash) history.replaceState(null, '', hash)
})
