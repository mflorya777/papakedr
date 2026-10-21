// Product catalog for the pilot: two saunas from the client's line-up.
//
// IMPORTANT: the client's site (папа-кедр.рф) could not be reached while this
// pilot was built, so the models were reconstructed from reference photos.
// Every price below is an ESTIMATE and must be replaced with the client's
// price list before the configurator goes public. While PRICES_PRELIMINARY is
// true the UI labels the total as an estimate.
export const PRICES_PRELIMINARY = true

export type ModelId = 'quadro' | 'mobile'
export type FinishId = 'natural' | 'charcoal' | 'walnut' | 'graphite'
export type RoofColorId = 'black' | 'brown' | 'burgundy' | 'green'
export type ShingleShapeId = 'hexagon' | 'beaver'
export type StoveId = 'wood-external' | 'wood-internal' | 'electric'
export type SceneMood = 'day' | 'evening'

export interface Config {
  model: ModelId
  length: number
  finish: FinishId
  roofColor: RoofColorId
  shingle: ShingleShapeId
  stove: StoveId
  windows: 1 | 2
  lighting: boolean
}

/** Cross-section of the shell: a "quadro-barrel" rounded rectangle, metres. */
export interface ShellSpec {
  width: number
  height: number
  bottomRadius: number
  topRadius: number
  /** Height of the shell bottom above the ground (blocks or trailer deck). */
  elevation: number
}

export interface ModelSpec {
  id: ModelId
  name: string
  subtitle: string
  description: string
  lengths: number[]
  /** Base price in RUB per available length, standard configuration. */
  basePrice: Record<number, number>
  shell: ShellSpec
  door: 'end' | 'side'
  base: 'blocks' | 'trailer'
  stoves: StoveId[]
  defaults: Config
}

export const MODELS: Record<ModelId, ModelSpec> = {
  quadro: {
    id: 'quadro',
    name: 'Баня бочка Квадро',
    subtitle: 'Стационарная баня-квадробочка',
    description:
      'Скруглённый корпус из строганой доски, вход с торца, мягкая кровля по всей дуге. Устанавливается на бетонные блоки с ложементами — без фундамента.',
    lengths: [3, 4, 5, 6],
    basePrice: { 3: 280_000, 4: 340_000, 5: 410_000, 6: 480_000 },
    shell: { width: 2.2, height: 2.3, bottomRadius: 0.32, topRadius: 0.58, elevation: 0.42 },
    door: 'end',
    base: 'blocks',
    stoves: ['wood-internal', 'electric'],
    defaults: {
      model: 'quadro',
      length: 5,
      finish: 'charcoal',
      roofColor: 'black',
      shingle: 'beaver',
      stove: 'wood-internal',
      windows: 2,
      lighting: false,
    },
  },
  mobile: {
    id: 'mobile',
    name: 'Баня-прицеп',
    subtitle: 'Мобильная баня на прицепе',
    description:
      'Баня на двухосном прицепе: приезжает к воде или на участок готовой к работе. Вход сбоку, топка печи выведена наружу — дрова не заносятся в парную.',
    lengths: [4, 5],
    basePrice: { 4: 280_000, 5: 350_000 },
    shell: { width: 2.0, height: 2.45, bottomRadius: 0.05, topRadius: 0.66, elevation: 0.66 },
    door: 'side',
    base: 'trailer',
    stoves: ['wood-external', 'wood-internal', 'electric'],
    defaults: {
      model: 'mobile',
      length: 4,
      finish: 'natural',
      roofColor: 'black',
      shingle: 'hexagon',
      stove: 'wood-external',
      windows: 1,
      lighting: false,
    },
  },
}

export interface Option<T extends string> {
  id: T
  name: string
  /** Swatch colour for the UI. */
  swatch: string
  /** Surcharge in RUB per metre of length. */
  pricePerMetre: number
}

export const FINISHES: Option<FinishId>[] = [
  { id: 'natural', name: 'Натуральное масло', swatch: '#b9773f', pricePerMetre: 0 },
  { id: 'walnut', name: 'Орех', swatch: '#6b4227', pricePerMetre: 3_500 },
  { id: 'graphite', name: 'Графит', swatch: '#4a4a48', pricePerMetre: 3_500 },
  { id: 'charcoal', name: 'Чёрный уголь', swatch: '#1c1b1a', pricePerMetre: 5_000 },
]

export const ROOF_COLORS: Option<RoofColorId>[] = [
  { id: 'black', name: 'Чёрный', swatch: '#232425', pricePerMetre: 0 },
  { id: 'brown', name: 'Коричневый', swatch: '#4a3226', pricePerMetre: 0 },
  { id: 'burgundy', name: 'Бордо', swatch: '#5a2224', pricePerMetre: 0 },
  { id: 'green', name: 'Хвоя', swatch: '#2f3d2e', pricePerMetre: 0 },
]

export const SHINGLES: Option<ShingleShapeId>[] = [
  { id: 'hexagon', name: 'Соты', swatch: '', pricePerMetre: 0 },
  { id: 'beaver', name: 'Бобровый хвост', swatch: '', pricePerMetre: 2_500 },
]

export const STOVES: { id: StoveId; name: string; note: string; price: number }[] = [
  { id: 'wood-external', name: 'Дровяная, выносная топка', note: 'Закладка дров с улицы', price: 32_000 },
  { id: 'wood-internal', name: 'Дровяная', note: 'Топка из парной', price: 0 },
  { id: 'electric', name: 'Электрическая', note: 'Без дымохода, 9 кВт', price: 18_000 },
]

export const EXTRAS = {
  secondWindow: { name: 'Второе окно', price: 9_000 },
  lighting: { name: 'Фасадная подсветка', price: 16_000 },
}

export function defaultConfig(model: ModelId): Config {
  return { ...MODELS[model].defaults }
}

/** Keeps a config valid after the model changes or when restored from a URL. */
export function sanitize(c: Partial<Config>): Config {
  const model: ModelId = c.model === 'mobile' ? 'mobile' : 'quadro'
  const spec = MODELS[model]
  const d = spec.defaults
  const pick = <T extends string>(v: unknown, list: { id: T }[], fallback: T): T =>
    list.some((o) => o.id === v) ? (v as T) : fallback
  return {
    model,
    length: spec.lengths.includes(Number(c.length)) ? Number(c.length) : d.length,
    finish: pick(c.finish, FINISHES, d.finish),
    roofColor: pick(c.roofColor, ROOF_COLORS, d.roofColor),
    shingle: pick(c.shingle, SHINGLES, d.shingle),
    stove: spec.stoves.includes(c.stove as StoveId) ? (c.stove as StoveId) : d.stove,
    windows: c.windows === 1 || c.windows === 2 ? c.windows : d.windows,
    lighting: typeof c.lighting === 'boolean' ? c.lighting : d.lighting,
  }
}
