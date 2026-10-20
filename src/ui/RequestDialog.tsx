import { useEffect, useRef, useState } from 'react'
import { MODELS, PRICES_PRELIMINARY } from '../data/catalog'
import { formatRub, priceLines, totalPrice } from '../data/pricing'
import { useStore } from '../state'
import { specRows } from './Panel'

/**
 * Where requests are sent. The pilot has no backend: until the client provides
 * a CRM / form endpoint, the request text is copied for the manager to paste.
 */
const LEAD_ENDPOINT = ''

export function RequestDialog({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<'idle' | 'sent' | 'copied' | 'error'>('idle')
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const summary = () =>
    [
      `Заявка: ${MODELS[config.model].name}, ${config.length} м`,
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      ...(comment ? [`Комментарий: ${comment}`] : []),
      '',
      ...specRows(config).map(([k, v]) => `${k}: ${v}`),
      '',
      ...priceLines(config).map((l) => `${l.label} — ${formatRub(l.amount)}`),
      `Итого${PRICES_PRELIMINARY ? ' (предварительно)' : ''}: ${formatRub(totalPrice(config))}`,
      '',
      `Конфигурация: ${window.location.href}`,
    ]
      .join('\n')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (LEAD_ENDPOINT) {
        const res = await fetch(LEAD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, comment, config, total: totalPrice(config), text: summary() }),
        })
        setStatus(res.ok ? 'sent' : 'error')
      } else {
        await navigator.clipboard.writeText(summary())
        setStatus('copied')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
      <form onSubmit={submit}>
        <h2>Заявка на расчёт</h2>
        <p className="muted">
          {MODELS[config.model].name}, {config.length} м · {formatRub(totalPrice(config))}
        </p>
        <label>
          Имя
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label>
          Телефон
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+7" />
        </label>
        <label>
          Комментарий
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Адрес доставки, сроки, пожелания" />
        </label>
        {status === 'sent' && <p className="ok">Заявка отправлена. Мы свяжемся с вами.</p>}
        {status === 'copied' && <p className="ok">Текст заявки с конфигурацией скопирован в буфер обмена.</p>}
        {status === 'error' && <p className="err">Не удалось отправить. Попробуйте ещё раз.</p>}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={() => dialog.current?.close()}>
            Закрыть
          </button>
          <button type="submit" className="cta">
            {LEAD_ENDPOINT ? 'Отправить' : 'Скопировать заявку'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
