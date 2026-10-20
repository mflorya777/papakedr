import { MODELS, type Config } from '../../data/catalog'
import { RoundedProfile } from '../geometry/profile'
import { MeshBuilder, type V3 } from '../geometry/builder'

export const PLANK_T = 0.028 // cladding thickness
export const SUBSTRATE_T = 0.03 // roof deck under the shingles, from the framing surface
export const RIM_DEPTH = 0.05 // end frame depth along x
export const ROOF_OVERHANG = 0.085 // shingles past the end frame

export type MaterialKey =
  | 'wood'
  | 'shingle'
  | 'membrane'
  | 'concrete'
  | 'blackSteel'
  | 'stainless'
  | 'galvanized'
  | 'wheelPaint'
  | 'tread'
  | 'rubber'
  | 'glass'
  | 'fireGlass'
  | 'fire'
  | 'stones'
  | 'nickel'
  | 'ledStrip'
  | 'reflectorAmber'
  | 'reflectorRed'
  | 'lampShade'

export class Bag {
  readonly builders = new Map<MaterialKey, MeshBuilder>()
  get(k: MaterialKey): MeshBuilder {
    let b = this.builders.get(k)
    if (!b) this.builders.set(k, (b = new MeshBuilder()))
    return b
  }
}

/** An opening's local frame: origin at bottom centre on the cladding surface. */
export interface Frame {
  o: V3
  /** Right, as seen from outside. */
  r: V3
  u: V3
  /** Outward. */
  f: V3
}

export interface Opening {
  kind: 'door' | 'window' | 'niche'
  wall: '+z' | '+x'
  /** Centre along the wall: x for side walls, z for the end wall. */
  c: number
  y0: number
  w: number
  h: number
}

export interface Layout {
  config: Config
  L: number
  /** Framing surface: the cladding sits on it, from 0 to PLANK_T outwards. */
  frame: RoundedProfile
  /** Outer surface of the cladding. */
  outer: RoundedProfile
  eaveY: number
  /** Arc length of the right (+z) eave on the framing profile; the roof spans [-sEave, sEave]. */
  sEave: number
  openings: Opening[]
  chimney: { x: number; z: number } | null
  /** Interior light sources for evening mode (window glow), world space. */
  glow: V3[]
}

export function makeLayout(config: Config): Layout {
  const spec = MODELS[config.model]
  const sh = spec.shell
  const L = config.length
  const hw = sh.width / 2 - PLANK_T
  const bottom = sh.elevation + PLANK_T
  const top = sh.elevation + sh.height - SUBSTRATE_T - 0.012
  const frame = new RoundedProfile(hw, bottom, top, Math.max(0.01, sh.bottomRadius - PLANK_T), sh.topRadius - SUBSTRATE_T)
  const outer = frame.offset(PLANK_T)
  const eaveY = top - frame.rTopClamped - 0.02
  const sEave = frame.sOnRightWall(eaveY)

  const openings: Opening[] = []
  const winH = 0.34
  const winY = eaveY - 0.14 - winH
  let chimney: Layout['chimney'] = null
  const wood = config.stove !== 'electric'

  if (spec.door === 'end') {
    // Quadro: entrance in the +x end, offset towards +z like the reference.
    openings.push({ kind: 'door', wall: '+x', c: 0.2, y0: bottom + 0.06, w: 0.68, h: Math.min(1.78, eaveY - bottom + 0.1) })
    openings.push({ kind: 'window', wall: '+z', c: -L / 2 + 0.62, y0: winY, w: 0.34, h: winH })
    if (config.windows === 2) openings.push({ kind: 'window', wall: '+z', c: L / 2 - 1.25, y0: winY, w: 0.34, h: winH })
    if (wood) chimney = { x: -L / 2 + 0.95, z: 0.18 }
  } else {
    // Mobile: entrance in the long side, firebox fed from outside next to it.
    const doorX = L * 0.13
    openings.push({ kind: 'door', wall: '+z', c: doorX, y0: bottom + 0.04, w: 0.66, h: eaveY - bottom - 0.12 })
    const nicheX = doorX - 0.95
    if (config.stove === 'wood-external') {
      openings.push({ kind: 'niche', wall: '+z', c: nicheX, y0: bottom + 0.08, w: 0.46, h: 0.72 })
    }
    openings.push({ kind: 'window', wall: '+z', c: -L / 2 + 0.5, y0: winY, w: 0.34, h: winH })
    if (config.windows === 2) openings.push({ kind: 'window', wall: '+z', c: L / 2 - 0.45, y0: winY, w: 0.34, h: winH })
    if (wood) chimney = { x: nicheX + 0.02, z: 0.16 }
  }

  const glow: V3[] = openings
    .filter((o) => o.kind === 'window')
    .map((o) => [o.c, o.y0 + o.h / 2, hw - 0.4] as V3)

  return { config, L, frame, outer, eaveY, sEave, openings, chimney, glow }
}

/** Frame of an opening on the cladding surface. */
export function openingFrame(lay: Layout, o: Opening): Frame {
  if (o.wall === '+z') {
    return { o: [o.c, o.y0, lay.outer.halfWidth], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1] }
  }
  // End wall boards sit slightly proud of the framing plane; see shell.ts.
  return { o: [lay.L / 2 + END_WALL_FACE, o.y0, o.c], r: [0, 0, -1], u: [0, 1, 0], f: [1, 0, 0] }
}

/** x of the end-wall board face relative to L/2. */
export const END_WALL_FACE = 0.018

/** Point in an opening frame: right, up, forward offsets. */
export function fp(F: Frame, r: number, u: number, f: number): V3 {
  return [
    F.o[0] + F.r[0] * r + F.u[0] * u + F.f[0] * f,
    F.o[1] + F.r[1] * r + F.u[1] * u + F.f[1] * f,
    F.o[2] + F.r[2] * r + F.u[2] * u + F.f[2] * f,
  ]
}
