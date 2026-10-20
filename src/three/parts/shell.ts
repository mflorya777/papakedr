import { TEX } from '../materials'
import { MeshBuilder, alongX, boardTint, rng, type V2 } from '../geometry/builder'
import type { RoundedProfile } from '../geometry/profile'
import { END_WALL_FACE, PLANK_T, RIM_DEPTH, ROOF_OVERHANG, SUBSTRATE_T, type Bag, type Layout } from '../models/layout'

const BOARD_PITCH = 0.138
const BOARD_GAP = 0.006
const CHAMFER = 0.0045

/** (z, y) of the point at arc length s, pushed `off` along the normal. */
function pt(P: RoundedProfile, s: number, off: number): V2 {
  const a = P.at(s)
  return [a.z + a.nz * off, a.y + a.ny * off]
}

/** Cross-section of a curved board lying on profile P between s0 and s1. */
export function curvedBoardLoop(P: RoundedProfile, s0: number, s1: number, t: number, c: number, base = 0): V2[] {
  const loop: V2[] = []
  for (const s of P.samples(s0, s1)) loop.push(pt(P, s, base))
  loop.push(pt(P, s1, base + t - c))
  const outer = P.samples(s0 + c, s1 - c)
  for (let i = outer.length - 1; i >= 0; i--) loop.push(pt(P, outer[i], base + t))
  loop.push(pt(P, s0, base + t - c))
  return loop
}

/**
 * Sweeps a closed 2D cross-section (x offset, normal offset) along profile P
 * between s0 and s1. Grain (u) follows the sweep.
 */
export function sweep(
  b: MeshBuilder,
  P: RoundedProfile,
  s0: number,
  s1: number,
  cross: V2[],
  x0: number,
  o: { caps?: boolean; uOffset?: number; vOffset?: number; uScale?: number; vScale?: number } = {},
) {
  const ss = P.samples(s0, s1, 0.01)
  const n = cross.length
  const uS = o.uScale ?? TEX.wood[0]
  const vS = o.vScale ?? TEX.wood[1]
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x0_, y0_] = cross[i]
    const [x1_, y1_] = cross[(i + 1) % n]
    area += x0_ * y1_ - x1_ * y0_
  }
  const sign = area > 0 ? 1 : -1
  const en: V2[] = []
  for (let i = 0; i < n; i++) {
    const [ax, ay] = cross[i]
    const [bx, by] = cross[(i + 1) % n]
    const l = Math.hypot(bx - ax, by - ay) || 1
    en.push([(sign * (by - ay)) / l, (-sign * (bx - ax)) / l])
  }
  const smooth = (e: number, other: number): V2 => {
    const a = en[e]
    const c = en[other]
    if (a[0] * c[0] + a[1] * c[1] < Math.cos((25 * Math.PI) / 180)) return a
    const l = Math.hypot(a[0] + c[0], a[1] + c[1]) || 1
    return [(a[0] + c[0]) / l, (a[1] + c[1]) / l]
  }
  let acc = 0
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n
    const len = Math.hypot(cross[k][0] - cross[j][0], cross[k][1] - cross[j][1])
    const nj = smooth(j, (j - 1 + n) % n)
    const nk = smooth(j, k)
    let prev: [number, number] | null = null
    for (const s of ss) {
      const a = P.at(s)
      const vert = (c: V2, nn: V2, v: number) =>
        b.vertex(
          [x0 + c[0], a.y + a.ny * c[1], a.z + a.nz * c[1]],
          [nn[0], a.ny * nn[1], a.nz * nn[1]],
          s / uS + (o.uOffset ?? 0),
          v / vS + (o.vOffset ?? 0),
        )
      const pair: [number, number] = [vert(cross[j], nj, acc), vert(cross[k], nk, acc + len)]
      if (prev) b.quad(prev[0], prev[1], pair[1], pair[0])
      prev = pair
    }
    acc += len
  }
  if (o.caps) {
    for (const [s, dir] of [
      [s0, -1],
      [s1, 1],
    ] as const) {
      const a = P.at(s)
      // Tangent direction of increasing s in (z, y) is (-ny, nz) for this clockwise path... use finite difference.
      const a2 = P.at(s + 1e-4)
      let tz = a2.z - a.z
      let ty = a2.y - a.y
      const l = Math.hypot(tz, ty) || 1
      tz = (tz / l) * dir
      ty = (ty / l) * dir
      const base = b.count
      for (const c of cross) b.vertex([x0 + c[0], a.y + a.ny * c[1], a.z + a.nz * c[1]], [0, ty, tz], c[0] / vS, c[1] / vS)
      for (let i = 1; i < n - 1; i++) b.tri(base, base + i, base + i + 1)
    }
  }
}

/** Splits [a, b] by removing the given intervals. */
function subtract(a: number, b: number, cuts: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[a, b]]
  for (const [c0, c1] of cuts) {
    const next: [number, number][] = []
    for (const [p0, p1] of parts) {
      if (c1 <= p0 || c0 >= p1) next.push([p0, p1])
      else {
        if (c0 > p0) next.push([p0, c0])
        if (c1 < p1) next.push([c1, p1])
      }
    }
    parts = next
  }
  return parts.filter(([p0, p1]) => p1 - p0 > 0.02)
}

export function buildShell(bag: Bag, lay: Layout) {
  const { frame: P, L } = lay
  const r = rng(1234 + L * 17)
  const wood = bag.get('wood')
  const membrane = bag.get('membrane')

  // --- Cladding boards: from the right eave, under the floor, to the left eave.
  const s0 = lay.sEave
  const s1 = P.length - lay.sEave
  const count = Math.round((s1 - s0) / BOARD_PITCH)
  const pitch = (s1 - s0) / count
  const rightWall: [number, number] = [P.starts[2], P.starts[3]]
  const sideOpenings = lay.openings.filter((o) => o.wall === '+z')
  for (let i = 0; i < count; i++) {
    const a = s0 + i * pitch
    const b = a + pitch - BOARD_GAP
    const cuts: [number, number][] = []
    if (a >= rightWall[0] - 1e-6 && b <= rightWall[1] + 1e-6) {
      const yHi = P.at(a).y
      const yLo = P.at(b).y
      for (const o of sideOpenings) {
        if (yHi > o.y0 && yLo < o.y0 + o.h) cuts.push([o.c - o.w / 2, o.c + o.w / 2])
      }
    }
    const loop = curvedBoardLoop(P, a, b, PLANK_T - (r() * 0.0015), CHAMFER)
    const uOffset = r()
    const vOffset = r()
    wood.tint = boardTint(r)
    for (const [x0, x1] of subtract(-L / 2, L / 2, cuts)) {
      wood.extrude(loop, x0, x1, alongX(), {
        uScale: TEX.wood[0],
        vScale: TEX.wood[1],
        uOffset,
        vOffset,
        smoothAngle: 30,
      })
      // Dark membrane behind the board, visible through the gaps.
      const ms = P.samples(a, a + pitch, 0.03)
      membrane.grid(
        ms.length - 1,
        1,
        (i, j) => {
          const p = P.at(ms[i])
          const x = j === 0 ? x0 : x1
          return { p: [x, p.y - p.ny * 0.002, p.z - p.nz * 0.002], uv: [x, ms[i]] }
        },
        (q) => [0, q[1] - (P.top + P.bottom) / 2, q[2]],
      )
    }
  }
  wood.tint = [1, 1, 1]

  // --- Roof deck under the shingles, overhanging both ends.
  const deck = curvedBoardLoop(P, -lay.sEave - 0.01, lay.sEave + 0.01, SUBSTRATE_T, 0.002)
  membrane.extrude(deck, -L / 2 - ROOF_OVERHANG, L / 2 + ROOF_OVERHANG, alongX(), { smoothAngle: 30 })

  // --- End frames: a thick rim board following the profile at both ends.
  for (const side of [1, -1]) {
    const x0 = side > 0 ? L / 2 : -L / 2
    const rim = (outer: number): V2[] => {
      const a0 = side > 0 ? -0.004 : 0.004
      const a1 = side * RIM_DEPTH
      const c = 0.006
      // (x offset, normal offset)
      return [
        [a0, -0.09],
        [a1 - side * c, -0.09],
        [a1, -0.09 + c],
        [a1, outer - c],
        [a1 - side * c, outer],
        [a0, outer],
      ]
    }
    const uOffset = r()
    sweep(wood, P, lay.sEave, P.length - lay.sEave, rim(PLANK_T + 0.016), x0, { caps: true, uOffset })
    sweep(wood, P, -lay.sEave, lay.sEave, rim(SUBSTRATE_T - 0.002), x0, { caps: true, uOffset: uOffset + 0.3 })

    // End wall: horizontal boards inside the rim.
    const inner = P.offset(-0.035)
    const face = side > 0 ? L / 2 + END_WALL_FACE : -L / 2 - END_WALL_FACE
    const back = face - side * PLANK_T
    const doors = lay.openings.filter((o) => o.wall === '+x' && side > 0)
    const rows = Math.round((inner.top - inner.bottom) / BOARD_PITCH)
    const rowPitch = (inner.top - inner.bottom) / rows
    for (let i = 0; i < rows; i++) {
      const y0 = inner.bottom + i * rowPitch
      const y1 = y0 + rowPitch - BOARD_GAP
      const hw = Math.min(inner.halfWidthAt(y0 + 0.001), inner.halfWidthAt(y1 - 0.001))
      if (hw < 0.05) continue
      const cuts: [number, number][] = []
      for (const o of doors) if (y1 > o.y0 && y0 < o.y0 + o.h) cuts.push([o.c - o.w / 2, o.c + o.w / 2])
      wood.tint = boardTint(r)
      const uOffset = r()
      const vOffset = r()
      for (const [z0, z1] of subtract(-hw, hw, cuts)) {
        // Extrude along z; the section lives in (x, y).
        wood.board(z0, z1, Math.min(face, back), Math.max(face, back), y0, y1, { o: [0, 0, 0], e: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0] }, CHAMFER, {
          uScale: TEX.wood[0],
          vScale: TEX.wood[1],
          uOffset,
          vOffset,
        })
      }
    }
    wood.tint = [1, 1, 1]

    // Backing plate behind the end boards.
    const plate = P.offset(-0.012).outline(0.02).map(([z, y]) => [z, y] as V2)
    const pb = back - side * 0.004
    membrane.extrude(plate, pb - side * 0.006, pb, alongX(), {})
  }
}
