import { useState } from 'react'
import { MODELS } from './data/catalog'
import { useStore, type CameraView } from './state'
import { Scene } from './three/Scene'
import { Panel } from './ui/Panel'

const VIEWS: { id: CameraView; label: string }[] = [
  { id: 'overview', label: 'Общий вид' },
  { id: 'entrance', label: 'Вход' },
  { id: 'side', label: 'Фасад' },
  { id: 'roof', label: 'Кровля' },
]

export function App() {
  const [ready, setReady] = useState(false)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const mood = useStore((s) => s.mood)
  const setMood = useStore((s) => s.setMood)
  const model = useStore((s) => s.config.model)

  return (
    <div className={`app mood-${mood}`}>
      <main className="stage">
        <Scene onReady={() => setReady(true)} />
        <div className="brand">
          <span className="brand-mark">Папа Кедр</span>
          <span className="brand-sub">Конфигуратор · {MODELS[model].name}</span>
        </div>
        <div className="mood" role="radiogroup" aria-label="Время суток">
          {(['day', 'evening'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mood === m} className={mood === m ? 'on' : ''} onClick={() => setMood(m)}>
              {m === 'day' ? 'День' : 'Вечер'}
            </button>
          ))}
        </div>
        <nav className="views" aria-label="Ракурс">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </nav>
        <div className={ready ? 'loader done' : 'loader'} aria-hidden={ready}>
          <span>Готовим материалы…</span>
        </div>
      </main>
      <Panel />
    </div>
  )
}
