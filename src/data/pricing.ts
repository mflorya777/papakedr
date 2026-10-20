import { EXTRAS, FINISHES, MODELS, ROOF_COLORS, SHINGLES, STOVES, type Config } from './catalog'

export interface PriceLine {
  label: string
  amount: number
}

export function priceLines(c: Config): PriceLine[] {
  const spec = MODELS[c.model]
  const lines: PriceLine[] = [
    { label: `${spec.name}, ${c.length} м — базовая комплектация`, amount: spec.basePrice[c.length] },
  ]
  const perMetre = (label: string, rate: number) => {
    if (rate > 0) lines.push({ label, amount: rate * c.length })
  }
  const finish = FINISHES.find((f) => f.id === c.finish)!
  perMetre(`Покрытие фасада: ${finish.name}`, finish.pricePerMetre)
  const roof = ROOF_COLORS.find((r) => r.id === c.roofColor)!
  perMetre(`Цвет кровли: ${roof.name}`, roof.pricePerMetre)
  const shingle = SHINGLES.find((s) => s.id === c.shingle)!
  perMetre(`Черепица «${shingle.name}»`, shingle.pricePerMetre)
  const stove = STOVES.find((s) => s.id === c.stove)!
  if (stove.price > 0) lines.push({ label: `Печь: ${stove.name.toLowerCase()}`, amount: stove.price })
  if (c.windows === 2) lines.push({ label: EXTRAS.secondWindow.name, amount: EXTRAS.secondWindow.price })
  if (c.lighting) lines.push({ label: EXTRAS.lighting.name, amount: EXTRAS.lighting.price })
  return lines
}

export function totalPrice(c: Config): number {
  return priceLines(c).reduce((sum, l) => sum + l.amount, 0)
}

export function formatRub(v: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' ₽'
}
