import { TEX } from '../materials'
import { basis, boardTint, rng, type Basis, type MeshBuilder, type V2, type V3 } from '../geometry/builder'
import { fp, openingFrame, type Bag, type Frame, type Layout, type Opening } from '../models/layout'

const woodUV = (r: () => number) => ({ uScale: TEX.wood[0], vScale: TEX.wood[1], uOffset: r(), vOffset: r() })

/** Board extruded along the frame's up axis; section in (right, forward). */
const vertical = (F: Frame): Basis => basis(F.o, F.u, F.r, F.f)
/** Board extruded along the frame's right axis; section in (up, forward). */
const horizontal = (F: Frame): Basis => basis(F.o, F.r, F.u, F.f)

/** Board spanning r0..r1, u0..u1, f0..f1 with grain along the longer side. */
function box(b: MeshBuilder, F: Frame, r0: number, r1: number, u0: number, u1: number, f0: number, f1: number, chamfer: number, rnd: () => number) {
  if (u1 - u0 >= r1 - r0) b.board(u0, u1, r0, r1, f0, f1, vertical(F), chamfer, woodUV(rnd))
  else b.board(r0, r1, u0, u1, f0, f1, horizontal(F), chamfer, woodUV(rnd))
}

/** Plain (non-wood) block with a chamfer, UVs in metres. */
function block(b: MeshBuilder, F: Frame, r0: number, r1: number, u0: number, u1: number, f0: number, f1: number, chamfer = 0.002, uvScale = 1) {
  b.board(r0, r1, u0, u1, f0, f1, horizontal(F), chamfer, { uScale: uvScale, vScale: uvScale })
}

/** Cylinder along an arbitrary axis through point c. */
function cylinder(b: MeshBuilder, c: V3, axis: V3, side: V3, radius: number, len: number, seg = 20, profile?: V2[]) {
  const other: V3 = [
    axis[1] * side[2] - axis[2] * side[1],
    axis[2] * side[0] - axis[0] * side[2],
    axis[0] * side[1] - axis[1] * side[0],
  ]
  const pr: V2[] = profile ?? [
    [0, 0],
    [radius, 0],
    [radius, len],
    [0, len],
  ]
  b.lathe(pr, seg, basis(c, axis, side, other), { smoothAngle: 50 })
}

function casing(bag: Bag, F: Frame, o: Opening, rnd: () => number, opts: { side: number; head: number; sill: boolean }) {
  const wood = bag.get('wood')
  const { w, h } = o
  const t = 0.026
  wood.tint = boardTint(rnd, 0.05)
  // Jambs.
  box(wood, F, w / 2 - 0.012, w / 2 + opts.side, opts.sill ? 0 : -0.01, h, 0, t, 0.004, rnd)
  box(wood, F, -w / 2 - opts.side, -w / 2 + 0.012, opts.sill ? 0 : -0.01, h, 0, t, 0.004, rnd)
  // Head, slightly wider and thicker than the jambs.
  box(wood, F, -w / 2 - opts.side - 0.02, w / 2 + opts.side + 0.02, h, h + opts.head, 0, t + 0.006, 0.004, rnd)
  // Drip cap over the head.
  box(wood, F, -w / 2 - opts.side - 0.03, w / 2 + opts.side + 0.03, h + opts.head, h + opts.head + 0.022, 0, t + 0.03, 0.004, rnd)
  if (opts.sill) {
    box(wood, F, -w / 2 - opts.side - 0.025, w / 2 + opts.side + 0.025, -0.05, 0, -0.06, t + 0.045, 0.005, rnd)
  }
  wood.tint = [1, 1, 1]
}

function reveal(bag: Bag, F: Frame, o: Opening, depth: number, rnd: () => number, key: 'wood' | 'stones' = 'wood') {
  const b = bag.get(key)
  const { w, h } = o
  const th = 0.02
  const uv = key === 'wood' ? undefined : TEX.stones
  const make = (r0: number, r1: number, u0: number, u1: number, f0: number, f1: number) => {
    if (uv) block(b, F, r0, r1, u0, u1, f0, f1, 0.002, uv)
    else box(b, F, r0, r1, u0, u1, f0, f1, 0.002, rnd)
  }
  make(w / 2 - th, w / 2, 0, h, -depth, 0.001)
  make(-w / 2, -w / 2 + th, 0, h, -depth, 0.001)
  make(-w / 2, w / 2, h - th, h, -depth, 0.001)
  make(-w / 2, w / 2, 0, th, -depth, 0.001)
}

export interface DoorResult {
  lamp: V3
  lampDir: V3
}

function door(bag: Bag, F: Frame, o: Opening, style: 'lever' | 'wood', hinge: 1 | -1, rnd: () => number): DoorResult {
  const wood = bag.get('wood')
  const steel = bag.get('blackSteel')
  const nickel = bag.get('nickel')
  const { w, h } = o

  reveal(bag, F, o, 0.13, rnd)
  casing(bag, F, o, rnd, { side: 0.09, head: 0.1, sill: false })
  // Threshold.
  wood.tint = boardTint(rnd, 0.04)
  box(wood, F, -w / 2 - 0.02, w / 2 + 0.02, -0.03, 0.02, -0.13, 0.035, 0.005, rnd)

  // Leaf: vertical tongue-and-groove boards, set back into the opening.
  const lw = w - 0.05
  const n = 5
  const bw = lw / n
  const f0 = -0.05
  const f1 = -0.012
  for (let i = 0; i < n; i++) {
    wood.tint = boardTint(rnd, 0.07)
    const r0 = -lw / 2 + i * bw
    box(wood, F, r0 + 0.0015, r0 + bw - 0.0015, 0.025, h - 0.008, f0, f1, 0.006, rnd)
  }
  // Ledges and diagonal brace (Z-frame).
  const ledgeU = [0.2, h - 0.3]
  const ledgeH = 0.105
  const lr = lw / 2 - 0.035
  for (const u of ledgeU) {
    wood.tint = boardTint(rnd, 0.05)
    box(wood, F, -lr, lr, u, u + ledgeH, f1, f1 + 0.026, 0.005, rnd)
  }
  {
    const p0: V2 = [hinge * (lr - 0.06), ledgeU[0] + ledgeH - 0.01]
    const p1: V2 = [-hinge * (lr - 0.06), ledgeU[1] + 0.01]
    const d: V2 = [p1[0] - p0[0], p1[1] - p0[1]]
    const len = Math.hypot(d[0], d[1])
    const e: V3 = [(F.r[0] * d[0] + F.u[0] * d[1]) / len, (F.r[1] * d[0] + F.u[1] * d[1]) / len, (F.r[2] * d[0] + F.u[2] * d[1]) / len]
    const a: V3 = [(-F.r[0] * d[1] + F.u[0] * d[0]) / len, (-F.r[1] * d[1] + F.u[1] * d[0]) / len, (-F.r[2] * d[1] + F.u[2] * d[0]) / len]
    wood.tint = boardTint(rnd, 0.05)
    wood.board(0, len, -0.045, 0.045, f1, f1 + 0.022, basis(fp(F, p0[0], p0[1], 0), e, a, F.f), 0.005, woodUV(rnd))
  }
  wood.tint = [1, 1, 1]

  // Forged strap hinges over the ledges, with knuckles and bolt heads.
  for (const u of ledgeU) {
    const uc = u + ledgeH / 2
    const edge = hinge * (lw / 2 + 0.03)
    const tip = hinge * (lw / 2 - 0.38)
    const ff = f1 + 0.026
    block(steel, F, Math.min(edge, tip), Math.max(edge, tip), uc - 0.022, uc + 0.022, ff, ff + 0.005, 0.0015)
    // Arrow-shaped tip.
    const tipLoop: V2[] = [
      [tip, uc - 0.034],
      [tip - hinge * 0.05, uc],
      [tip, uc + 0.034],
      [tip + hinge * 0.02, uc],
    ]
    steel.extrude(tipLoop, ff, ff + 0.005, basis(F.o, F.f, F.r, F.u), { uScale: 1, vScale: 1 })
    cylinder(steel, fp(F, hinge * (w / 2 - 0.004), uc - 0.06, 0.012), F.u, F.r, 0.011, 0.12, 16)
    for (const k of [0.08, 0.2, 0.31]) {
      const rr = edge - hinge * k
      cylinder(steel, fp(F, rr, uc, ff + 0.005), F.f, F.r, 0.0075, 0.004, 12, [
        [0, 0],
        [0.0075, 0],
        [0.0068, 0.0025],
        [0.004, 0.0042],
        [0, 0.0048],
      ])
    }
  }

  // Handle.
  const hr = -hinge * (lw / 2 - 0.09)
  const hu = h * 0.53
  if (style === 'lever') {
    block(nickel, F, hr - 0.025, hr + 0.025, hu - 0.12, hu + 0.08, f1, f1 + 0.008, 0.004)
    cylinder(nickel, fp(F, hr, hu, f1 + 0.008), F.f, F.r, 0.011, 0.045, 20)
    const leverAxis: V3 = [F.r[0] * hinge, F.r[1] * hinge, F.r[2] * hinge]
    cylinder(nickel, fp(F, hr, hu, f1 + 0.045), leverAxis, F.u, 0.0095, 0, 20, [
      [0, -0.0095],
      [0.0095, 0],
      [0.0095, 0.13],
      [0.006, 0.137],
      [0, 0.138],
    ])
    // Key cylinder.
    cylinder(nickel, fp(F, hr, hu - 0.08, f1 + 0.008), F.f, F.r, 0.012, 0.012, 20)
    cylinder(steel, fp(F, hr, hu - 0.08, f1 + 0.0205), F.f, F.r, 0.0025, 0.0006, 8)
  } else {
    // Wooden grab handle on two stand-offs, as on the mobile reference.
    wood.tint = boardTint(rnd, 0.05)
    box(wood, F, hr - 0.016, hr + 0.016, hu - 0.12, hu - 0.07, f1, f1 + 0.055, 0.004, rnd)
    box(wood, F, hr - 0.016, hr + 0.016, hu + 0.07, hu + 0.12, f1, f1 + 0.055, 0.004, rnd)
    box(wood, F, hr - 0.019, hr + 0.019, hu - 0.15, hu + 0.15, f1 + 0.055, f1 + 0.085, 0.008, rnd)
    wood.tint = [1, 1, 1]
    // Latch bolt.
    block(steel, F, hr + hinge * 0.06 - 0.05, hr + hinge * 0.06 + 0.05, hu + 0.2, hu + 0.235, f1, f1 + 0.012, 0.002)
  }

  const lampR = -hinge * (w / 2 + 0.24)
  return { lamp: fp(F, lampR, h + 0.05, 0.12), lampDir: F.f }
}

function windowUnit(bag: Bag, F: Frame, o: Opening, rnd: () => number) {
  const wood = bag.get('wood')
  const { w, h } = o
  reveal(bag, F, o, 0.11, rnd)
  casing(bag, F, o, rnd, { side: 0.075, head: 0.085, sill: true })
  // Sash.
  const s = 0.032
  const fs0 = -0.075
  const fs1 = -0.04
  wood.tint = boardTint(rnd, 0.05)
  box(wood, F, -w / 2 + 0.02, -w / 2 + 0.02 + s, 0.02, h - 0.02, fs0, fs1, 0.003, rnd)
  box(wood, F, w / 2 - 0.02 - s, w / 2 - 0.02, 0.02, h - 0.02, fs0, fs1, 0.003, rnd)
  box(wood, F, -w / 2 + 0.02, w / 2 - 0.02, h - 0.02 - s, h - 0.02, fs0, fs1, 0.003, rnd)
  box(wood, F, -w / 2 + 0.02, w / 2 - 0.02, 0.02, 0.02 + s, fs0, fs1, 0.003, rnd)
  wood.tint = [1, 1, 1]
  // Double glazing.
  const g = bag.get('glass')
  block(g, F, -w / 2 + 0.04, w / 2 - 0.04, 0.04, h - 0.04, -0.062, -0.055, 0.0005)
}

function niche(bag: Bag, F: Frame, o: Opening, rnd: () => number) {
  const { w, h } = o
  const depth = 0.3
  reveal(bag, F, o, depth, rnd, 'stones')
  casing(bag, F, o, rnd, { side: 0.08, head: 0.09, sill: true })
  const stones = bag.get('stones')
  block(stones, F, -w / 2, w / 2, 0, h, -depth - 0.02, -depth, 0.002, TEX.stones)

  // Firebox tunnel of the stove, fed from outside.
  const steel = bag.get('blackSteel')
  const fu0 = 0.14
  const fu1 = 0.56
  block(steel, F, -0.17, 0.17, fu0, fu1, -depth, -0.03, 0.006)
  // Door frame and door with a fire-glass window.
  block(steel, F, -0.155, 0.155, fu0 + 0.1, fu1 - 0.02, -0.03, -0.018, 0.004)
  const fire = bag.get('fire')
  block(fire, F, -0.1, 0.1, fu0 + 0.15, fu1 - 0.075, -0.035, -0.03, 0.001)
  block(bag.get('fireGlass'), F, -0.1, 0.1, fu0 + 0.15, fu1 - 0.075, -0.018, -0.014, 0.001)
  // Glass retainer bars.
  for (const [r0, r1, u0, u1] of [
    [-0.13, 0.13, fu0 + 0.12, fu0 + 0.15],
    [-0.13, 0.13, fu1 - 0.075, fu1 - 0.045],
    [-0.13, -0.1, fu0 + 0.15, fu1 - 0.075],
    [0.1, 0.13, fu0 + 0.15, fu1 - 0.075],
  ]) block(steel, F, r0, r1, u0, u1, -0.018, -0.008, 0.002)
  // Coil handle and hinge pins.
  const nickel = bag.get('nickel')
  cylinder(nickel, fp(F, 0.115, fu1 - 0.06, -0.008), F.f, F.r, 0.005, 0.035, 10)
  cylinder(nickel, fp(F, 0.115, fu0 + 0.13, -0.008), F.f, F.r, 0.005, 0.035, 10)
  cylinder(steel, fp(F, 0.115, fu0 + 0.13, 0.027), F.u, F.r, 0.012, fu1 - fu0 - 0.19, 18)
  // Ash pan drawer.
  block(steel, F, -0.13, 0.13, fu0 + 0.015, fu0 + 0.085, -0.03, -0.015, 0.003)
  cylinder(nickel, fp(F, -0.04, fu0 + 0.05, -0.015), F.r, F.u, 0.004, 0.08, 10)
}

export function buildOpenings(bag: Bag, lay: Layout): DoorResult | null {
  const rnd = rng(911 + lay.L)
  let result: DoorResult | null = null
  for (const o of lay.openings) {
    const F = openingFrame(lay, o)
    if (o.kind === 'door') {
      const quadro = lay.config.model === 'quadro'
      result = door(bag, F, o, quadro ? 'lever' : 'wood', quadro ? 1 : -1, rnd)
    } else if (o.kind === 'window') windowUnit(bag, F, o, rnd)
    else niche(bag, F, o, rnd)
  }
  return result
}
