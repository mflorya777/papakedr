import type { ShingleShapeId } from '../../data/catalog'
import { TEX } from '../materials'
import { MeshBuilder, rng, type V3 } from '../geometry/builder'
import type { RoundedProfile } from '../geometry/profile'
import { ROOF_OVERHANG, SUBSTRATE_T, type Bag, type Layout } from '../models/layout'

// Each shingle tab is a thin solid bent to the roof curvature: a structured
// grid between the tab's lower outline and its top edge, with real thickness
// and side walls, so every tab casts its own shadow line.

const TAB_W = 0.32
const TAB_H = 0.31
const EXPOSURE = 0.142
const THICK = 0.0042
/** Lift of a tab's lower edge so it rests on the row beneath. */
const LIFT = THICK * 2.5

type Outline = (xl: number) => number

function outlineFor(shape: ShingleShapeId, depth: number): Outline {
  const h = TAB_W / 2
  if (shape === 'hexagon') {
    // Lower half of a hexagon: flat bottom in the middle, angled sides.
    return (xl) => {
      const a = Math.abs(xl)
      return a < h / 2 ? 0 : (depth * (a - h / 2)) / (h / 2)
    }
  }
  // Beaver tail: a flattened half-ellipse.
  return (xl) => {
    const t = Math.min(1, Math.abs(xl) / h)
    return depth * (1 - Math.pow(1 - t * t, 0.62))
  }
}

interface TabPlacement {
  /** World x of the tab centre. */
  cx: number
  /** Allowed x range (clips at the roof ends). */
  xMin: number
  xMax: number
  /** Allowed yl range (clips at the ridge). */
  ylMax: number
  /** Maps (xl, yl, offset) to world space. */
  map: (xl: number, yl: number, off: number) => V3
  /** Approximate outward direction at a point. */
  out: (p: V3) => V3
  outline: Outline
  uvOff: [number, number]
}

function tab(b: MeshBuilder, t: TabPlacement) {
  const x0 = Math.max(-TAB_W / 2 + 0.003, t.xMin - t.cx)
  const x1 = Math.min(TAB_W / 2 - 0.003, t.xMax - t.cx)
  if (x1 - x0 < 0.01) return
  const top = Math.min(TAB_H, t.ylMax)
  const nu = Math.max(2, Math.ceil(((x1 - x0) / TAB_W) * 12))
  const nv = 9
  const xl = (i: number) => x0 + ((x1 - x0) * i) / nu
  const ylAt = (i: number, j: number) => {
    const yb = Math.min(t.outline(xl(i)), top - 0.005)
    return yb + ((top - yb) * j) / nv
  }
  const lift = (yl: number) => LIFT * (1 - yl / TAB_H)
  const uv = (x: number, y: number): [number, number] => [x / TEX.shingle + t.uvOff[0], y / TEX.shingle + t.uvOff[1]]
  const centre = t.map((x0 + x1) / 2, top / 2, lift(top / 2))
  const away = (p: V3): V3 => [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]]
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]]

  // Upper and lower faces.
  b.grid(nu, nv, (i, j) => {
    const y = ylAt(i, j)
    return { p: t.map(xl(i), y, lift(y) + THICK), uv: uv(xl(i), y) }
  }, t.out)
  b.grid(nu, nv, (i, j) => {
    const y = ylAt(i, j)
    return { p: t.map(xl(i), y, lift(y)), uv: uv(xl(i), y) }
  }, (p) => neg(t.out(p)))

  // Side walls around the outline (exposed edges show the cut bitumen).
  const wall = (n: number, at: (k: number) => [number, number]) =>
    b.grid(n, 1, (k, j) => {
      const [x, y] = at(k)
      return { p: t.map(x, y, lift(y) + (j ? THICK : 0)), uv: uv(x, y + j * 0.004) }
    }, away)
  wall(nu, (i) => [xl(i), ylAt(i, 0)])
  wall(nu, (i) => [xl(i), ylAt(i, nv)])
  wall(nv, (j) => [xl(0), ylAt(0, j)])
  wall(nv, (j) => [xl(nu), ylAt(nu, j)])
}

function roofPoint(P: RoundedProfile, s: number, x: number, off: number): V3 {
  const a = P.at(s)
  return [x, a.y + a.ny * off, a.z + a.nz * off]
}

export function buildRoof(bag: Bag, lay: Layout, shape: ShingleShapeId) {
  const P = lay.frame
  const L = lay.L
  const b = bag.get('shingle')
  const r = rng(77 + L * 31 + (shape === 'hexagon' ? 1 : 2))
  const outline = outlineFor(shape, shape === 'hexagon' ? 0.1 : 0.12)
  const xMin = -L / 2 - ROOF_OVERHANG
  const xMax = L / 2 + ROOF_OVERHANG
  const base = SUBSTRATE_T
  const chimney = lay.chimney

  const out = (p: V3): V3 => [0, p[1] - (P.top - P.rTopClamped), p[2] * 0.6]

  for (const side of [1, -1]) {
    // Right side: s runs from the eave (s = sEave) up to the ridge (s = 0).
    // Left side mirrors it with negative s.
    const sBottom = lay.sEave + 0.035
    const rows = Math.ceil((sBottom - 0.02) / EXPOSURE)
    for (let k = 0; k < rows; k++) {
      const sb = sBottom - k * EXPOSURE // distance of the row's lower edge from the ridge
      const stagger = (k % 2) * (TAB_W / 2)
      const n = Math.ceil((xMax - xMin) / TAB_W) + 1
      for (let i = 0; i < n; i++) {
        const cx = xMin + stagger + (i - 0.5) * TAB_W + (r() - 0.5) * 0.004
        const tint = 0.9 + r() * 0.18
        b.tint = [tint, tint, tint * (0.98 + r() * 0.04)]
        // Leave a hole around the chimney collar.
        if (chimney && side > 0) {
          const zc = P.at(sb - EXPOSURE).z
          if (Math.abs(cx - chimney.x) < 0.2 && Math.abs(zc - chimney.z) < 0.22 && sb < 0.6) continue
        }
        tab(b, {
          cx,
          xMin,
          xMax,
          ylMax: sb + 0.025,
          map: (xl, yl, off) => roofPoint(P, side * (sb - yl), cx + xl, base + off),
          out,
          outline,
          uvOff: [r(), r()],
        })
      }
    }
  }

  // Ridge cap: tabs running along the ridge, bent over it, overlapping in x.
  const capW = 0.36
  const capStep = 0.15
  const capBase = base + LIFT + THICK * 2
  const caps = Math.ceil((xMax - xMin) / capStep)
  const capOutline = outlineFor(shape, shape === 'hexagon' ? 0.06 : 0.07)
  for (let i = 0; i < caps; i++) {
    const x = xMax - i * capStep
    const tint = 0.92 + r() * 0.12
    b.tint = [tint, tint, tint]
    tab(b, {
      cx: 0,
      xMin: -capW / 2,
      xMax: capW / 2,
      ylMax: Math.min(TAB_H, x - xMin),
      // xl runs across the ridge (as arc length), yl runs towards -x.
      map: (xl, yl, off) => roofPoint(P, xl * (capW / TAB_W), x - yl, capBase + off),
      out: (p) => [0, 1, p[2] * 0.6],
      outline: capOutline,
      uvOff: [r(), r()],
    })
  }
  b.tint = [1, 1, 1]
}
