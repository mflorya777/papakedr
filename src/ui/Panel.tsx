import { useState } from 'react'
import {
  FINISHES,
  MODELS,
  PRICES_PRELIMINARY,
  ROOF_COLORS,
  SHINGLES,
  STOVES,
  EXTRAS,
  type Config,
  type ModelId,
} from '../data/catalog'
import { formatRub, priceLines, totalPrice } from '../data/pricing'
import { useStore } from '../state'
import { RequestDialog } from './RequestDialog'

function Section({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <header>
        <h3>{title}</h3>
        {value && <span className="value">{value}</span>}
      </header>
      {children}
    </section>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Swatches<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; name: string; swatch: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="swatches" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={o.id === value}
          aria-label={o.name}
          title={o.name}
          className={o.id === value ? 'on' : ''}
          onClick={() => onChange(o.id)}
        >
          <span style={{ background: o.swatch }} />
        </button>
      ))}
    </div>
  )
}

export function specRows(c: Config): [string, string][] {
  const m = MODELS[c.model]
  const sh = m.shell
  const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
  const finish = FINISHES.find((f) => f.id === c.finish)!
  const roof = ROOF_COLORS.find((r) => r.id === c.roofColor)!
  const shingle = SHINGLES.find((s) => s.id === c.shingle)!
  const stove = STOVES.find((s) => s.id === c.stove)!
  return [
    ['Габариты корпуса (Д × Ш × В)', `${fmt(c.length)} × ${fmt(sh.width)} × ${fmt(sh.height)} м`],
    ['Площадь по корпусу', `${fmt(c.length * sh.width)} м²`],
    ['Вход', m.door === 'end' ? 'С торца' : 'С длинной стороны'],
    ['Основание', m.base === 'blocks' ? 'Бетонные блоки с ложементами' : 'Двухосный прицеп, опорные домкраты'],
    ['Фасад', `Строганая доска 28 мм, ${finish.name.toLowerCase()}`],
    ['Кровля', `Гибкая черепица «${shingle.name}», ${roof.name.toLowerCase()}`],
    ['Печь', stove.name],
    ['Окна', `${c.windows} шт., двойное остекление`],
  ]
}

export function Panel() {
  const config = useStore((s) => s.config)
  const set = useStore((s) => s.set)
  const setModel = useStore((s) => s.setModel)
  const [requestOpen, setRequestOpen] = useState(false)
  const spec = MODELS[config.model]
  const total = totalPrice(config)
  const lines = priceLines(config)
  const finish = FINISHES.find((f) => f.id === config.finish)!
  const roof = ROOF_COLORS.find((r) => r.id === config.roofColor)!

  return (
    <aside className="panel">
      <div className="panel-scroll">
        <div className="models" role="tablist">
          {(Object.keys(MODELS) as ModelId[]).map((id) => {
            const m = MODELS[id]
            const from = Math.min(...Object.values(m.basePrice))
            return (
              <button key={id} role="tab" aria-selected={config.model === id} className={config.model === id ? 'model on' : 'model'} onClick={() => setModel(id)}>
                <span className="model-name">{m.name}</span>
                <span className="model-sub">{m.subtitle}</span>
                <span className="model-price">от {formatRub(from)}</span>
              </button>
            )
          })}
        </div>

        <p className="lead">{spec.description}</p>

        <Section title="Длина корпуса" value={`${config.length} м`}>
          <Segmented options={spec.lengths.map((l) => ({ id: l, label: `${l} м` }))} value={config.length} onChange={(v) => set('length', v)} />
        </Section>

        <Section title="Покрытие фасада" value={finish.name}>
          <Swatches options={FINISHES} value={config.finish} onChange={(v) => set('finish', v)} />
        </Section>

        <Section title="Кровля" value={roof.name}>
          <Segmented options={SHINGLES.map((s) => ({ id: s.id, label: s.name }))} value={config.shingle} onChange={(v) => set('shingle', v)} />
          <Swatches options={ROOF_COLORS} value={config.roofColor} onChange={(v) => set('roofColor', v)} />
        </Section>

        <Section title="Печь">
          <div className="choices" role="radiogroup">
            {STOVES.filter((s) => spec.stoves.includes(s.id)).map((s) => (
              <button key={s.id} role="radio" aria-checked={config.stove === s.id} className={config.stove === s.id ? 'choice on' : 'choice'} onClick={() => set('stove', s.id)}>
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.note}</small>
                </span>
                <em>{s.price ? `+ ${formatRub(s.price)}` : 'включено'}</em>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Окна">
          <Segmented
            options={[
              { id: 1 as const, label: 'Одно окно' },
              { id: 2 as const, label: `Два окна · + ${formatRub(EXTRAS.secondWindow.price)}` },
            ]}
            value={config.windows}
            onChange={(v) => set('windows', v)}
          />
        </Section>

        <Section title="Подсветка">
          <label className="toggle">
            <input type="checkbox" checked={config.lighting} onChange={(e) => set('lighting', e.target.checked)} />
            <span className="track" />
            <span>
              LED-линия под карнизом и светильник у входа
              <small>+ {formatRub(EXTRAS.lighting.price)}</small>
            </span>
          </label>
        </Section>

        <Section title="Характеристики">
          <dl className="specs">
            {specRows(config).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Расчёт">
          <ul className="lines">
            {lines.map((l) => (
              <li key={l.label}>
                <span>{l.label}</span>
                <span>{formatRub(l.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <footer className="summary">
        <div>
          <span className="summary-label">{PRICES_PRELIMINARY ? 'Предварительная стоимость' : 'Стоимость'}</span>
          <span className="summary-total">{formatRub(total)}</span>
        </div>
        <button className="cta" onClick={() => setRequestOpen(true)}>
          Оставить заявку
        </button>
      </footer>
      {requestOpen && <RequestDialog onClose={() => setRequestOpen(false)} />}
    </aside>
  )
}
