import { TEX } from '../materials'
import { alongX, alongY, alongZ, basis, boardTint, rng, type MeshBuilder, type V2, type V3 } from '../geometry/builder'
import { SUBSTRATE_T, type Bag, type Layout } from '../models/layout'

const M = { uScale: 1, vScale: 1 }

/** Axis-aligned box with chamfered edges, UVs in metres (scaled). */
function aab(b: MeshBuilder, min: V3, max: V3, chamfer = 0.003, uv = 1) {
  // Extrude along the longest axis.
  const d = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const o = { uScale: uv, vScale: uv }
  if (d[0] >= d[1] && d[0] >= d[2]) b.board(min[0], max[0], min[2], max[2], min[1], max[1], alongX(), chamfer, o)
  else if (d[2] >= d[1]) b.board(min[2], max[2], min[0], max[0], min[1], max[1], alongZ(), chamfer, o)
  else b.board(min[1], max[1], min[0], max[0], min[2], max[2], alongY(), chamfer, o)
}

/** Solid of revolution around an axis (unit vector) through c. */
function revolve(b: MeshBuilder, c: V3, axis: V3, profile: V2[], seg = 32, o: { uScale?: number; vScale?: number } = {}) {
  const side: V3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  const other: V3 = [
    axis[1] * side[2] - axis[2] * side[1],
    axis[2] * side[0] - axis[0] * side[2],
    axis[0] * side[1] - axis[1] * side[0],
  ]
  b.lathe(profile, seg, basis(c, axis, side, other), { smoothAngle: 45, ...o })
}

/** Concrete blocks with timber cradles shaped to the hull (stationary model). */
export function buildBlocks(bag: Bag, lay: Layout) {
  const { L, outer } = lay
  const concrete = bag.get('concrete')
  const wood = bag.get('wood')
  const r = rng(55 + L)
  const n = L <= 3 ? 2 : L <= 5 ? 3 : 4
  const blockTop = 0.19
  const hw = outer.halfWidth
  const rb = outer.rBottomClamped
  const hullY = (z: number) => {
    const a = Math.abs(z)
    if (a <= hw - rb) return outer.bottom
    const dz = a - (hw - rb)
    return outer.bottom + rb - Math.sqrt(Math.max(0, rb * rb - dz * dz))
  }
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.45 + ((L - 0.9) * i) / (n - 1)
    for (const z of [-0.58, 0.58]) {
      aab(concrete, [x - 0.1, 0, z - 0.195], [x + 0.1, blockTop, z + 0.195], 0.008, TEX.concrete)
    }
    // Cradle.
    const zEnd = Math.min(0.95, hw - 0.04)
    const loop: V2[] = [
      [-zEnd + 0.05, blockTop],
      [zEnd - 0.05, blockTop],
      [zEnd, blockTop + 0.05],
    ]
    const steps = 40
    for (let k = 0; k <= steps; k++) {
      const z = zEnd - (2 * zEnd * k) / steps
      loop.push([z, hullY(z) + 0.002])
    }
    loop.push([-zEnd, blockTop + 0.05])
    wood.tint = boardTint(r, 0.05)
    wood.extrude(loop, x - 0.06, x + 0.06, alongX(), { uScale: TEX.wood[1], vScale: TEX.wood[0], uOffset: r(), vOffset: r(), swapUV: true })
  }
  wood.tint = [1, 1, 1]
}

function wheel(bag: Bag, c: V3, outward: 1 | -1) {
  const ax: V3 = [0, 0, outward]
  const R = 0.289
  // Tyre sidewalls (both sides) and tread crown.
  const side: V2[] = [
    [0.166, 0.072],
    [0.19, 0.084],
    [0.235, 0.0885],
    [0.268, 0.083],
    [0.283, 0.072],
  ]
  revolve(bag.get('rubber'), c, ax, side.map(([r, h]) => [r, h] as V2), 64)
  revolve(bag.get('rubber'), c, ax, [...side].reverse().map(([r, h]) => [r, -h] as V2), 64)
  revolve(
    bag.get('tread'),
    c,
    ax,
    [
      [0.283, 0.072],
      [R, 0.058],
      [R, -0.058],
      [0.283, -0.072],
    ],
    96,
    { uScale: 2 * Math.PI * R, vScale: 0.16 },
  )
  // Steel rim: flange, barrel, dish and centre.
  revolve(
    bag.get('wheelPaint'),
    c,
    ax,
    [
      [0.0, 0.03],
      [0.038, 0.03],
      [0.05, 0.034],
      [0.1, 0.032],
      [0.12, 0.026],
      [0.14, 0.03],
      [0.155, 0.05],
      [0.158, 0.066],
      [0.172, 0.074],
      [0.176, 0.066],
      [0.162, 0.058],
      [0.16, -0.058],
      [0.176, -0.066],
      [0.172, -0.074],
      [0.158, -0.066],
    ],
    64,
  )
  // Hub cap and wheel nuts.
  const nickel = bag.get('nickel')
  revolve(nickel, [c[0], c[1], c[2] + outward * 0.032], ax, [
    [0.034, 0],
    [0.034, 0.012],
    [0.025, 0.03],
    [0.0, 0.034],
  ], 32)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    revolve(nickel, [c[0] + Math.cos(a) * 0.05, c[1] + Math.sin(a) * 0.05, c[2] + outward * 0.033], ax, [
      [0.0095, 0],
      [0.0095, 0.012],
      [0.006, 0.015],
      [0, 0.015],
    ], 6)
  }
}

/** Twin-axle flatbed trailer with drawbar, jacks, lights and tie-down rods. */
export function buildTrailer(bag: Bag, lay: Layout) {
  const { L, outer } = lay
  const steel = bag.get('blackSteel')
  const galv = bag.get('galvanized')
  const deck = outer.bottom
  const Lt = L + 0.3
  const zr = outer.halfWidth + 0.03
  const axleY = 0.289
  const axles = [-0.42, 0.42]

  // Perimeter frame and chassis rails.
  for (const z of [-zr, zr]) aab(steel, [-Lt / 2, deck - 0.1, z - 0.025], [Lt / 2, deck, z + 0.025], 0.004)
  for (const x of [-Lt / 2 + 0.025, Lt / 2 - 0.025]) aab(steel, [x - 0.025, deck - 0.1, -zr], [x + 0.025, deck, zr], 0.004)
  for (const z of [-0.55, 0.55]) aab(steel, [-Lt / 2, deck - 0.16, z - 0.03], [Lt / 2 + 0.05, deck - 0.02, z + 0.03], 0.004)
  const cross = Math.round(Lt / 0.55)
  for (let i = 1; i < cross; i++) {
    const x = -Lt / 2 + (Lt * i) / cross
    if (axles.some((a) => Math.abs(x - a) < 0.12)) continue
    aab(steel, [x - 0.02, deck - 0.06, -zr], [x + 0.02, deck, zr], 0.003)
  }

  // A-frame drawbar and coupling.
  const tipX = Lt / 2 + 1.25
  for (const z of [-0.55, 0.55]) {
    const p0: V3 = [Lt / 2 - 0.3, deck - 0.09, z]
    const p1: V3 = [tipX, deck - 0.09, Math.sign(z) * 0.05]
    const d: V3 = [p1[0] - p0[0], 0, p1[2] - p0[2]]
    const len = Math.hypot(d[0], d[2])
    const e: V3 = [d[0] / len, 0, d[2] / len]
    steel.board(0, len, -0.03, 0.03, -0.06, 0.06, basis(p0, e, [-e[2], 0, e[0]], [0, 1, 0]), 0.004, M)
  }
  aab(steel, [tipX - 0.05, deck - 0.16, -0.06], [tipX + 0.25, deck - 0.03, 0.06], 0.006)
  revolve(galv, [tipX + 0.3, deck - 0.1, 0], [0, 1, 0], [
    [0.0, -0.035],
    [0.045, -0.035],
    [0.052, -0.01],
    [0.05, 0.03],
    [0.04, 0.05],
    [0.0, 0.055],
  ], 32)
  aab(steel, [tipX + 0.18, deck - 0.05, -0.035], [tipX + 0.33, deck - 0.02, 0.035], 0.006)

  // Jockey wheel.
  const jx = Lt / 2 + 0.75
  revolve(galv, [jx, 0.17, 0.26], [0, 1, 0], [
    [0, 0],
    [0.03, 0],
    [0.03, deck + 0.1 - 0.17],
    [0, deck + 0.1 - 0.17],
  ], 20)
  revolve(steel, [jx, deck + 0.1, 0.26], [1, 0, 0], [
    [0, 0],
    [0.008, 0],
    [0.008, 0.16],
    [0, 0.16],
  ], 10)
  revolve(bag.get('rubber'), [jx, 0.09, 0.26 - 0.03], [0, 0, 1], [
    [0.02, 0],
    [0.08, 0.0],
    [0.09, 0.015],
    [0.09, 0.045],
    [0.08, 0.06],
    [0.02, 0.06],
  ], 40)

  // Axles, leaf springs and wheels.
  for (const ax of axles) {
    revolve(steel, [ax, axleY, -0.86], [0, 0, 1], [
      [0, 0],
      [0.035, 0],
      [0.035, 1.72],
      [0, 1.72],
    ], 24)
    for (const z of [-0.55, 0.55]) {
      for (let k = 0; k < 4; k++) {
        const half = 0.45 - k * 0.08
        const y = axleY + 0.04 + k * 0.009
        aab(steel, [ax - half, y, z - 0.03], [ax + half, y + 0.008, z + 0.03], 0.002)
      }
      for (const dx of [-0.45, 0.45]) aab(steel, [ax + dx - 0.02, axleY + 0.04, z - 0.035], [ax + dx + 0.02, deck - 0.16, z + 0.035], 0.003)
    }
    wheel(bag, [ax, axleY, 0.8], 1)
    wheel(bag, [ax, axleY, -0.8], -1)
    // Brake drums behind the wheels.
    for (const z of [-0.7, 0.7]) revolve(steel, [ax, axleY, z - Math.sign(z) * 0.04], [0, 0, Math.sign(z)], [
      [0, 0],
      [0.11, 0],
      [0.11, 0.06],
      [0, 0.06],
    ], 32)
  }

  // Corner stabiliser jacks.
  for (const x of [-Lt / 2 + 0.12, Lt / 2 - 0.12]) {
    for (const z of [-zr - 0.05, zr + 0.05]) {
      aab(galv, [x - 0.025, 0.06, z - 0.025], [x + 0.025, deck + 0.12, z + 0.025], 0.003)
      aab(galv, [x - 0.06, 0, z - 0.06], [x + 0.06, 0.012, z + 0.06], 0.003)
      aab(galv, [x - 0.03, deck - 0.09, z - Math.sign(z) * 0.03 - 0.035], [x + 0.03, deck - 0.01, z - Math.sign(z) * 0.03 + 0.035], 0.003)
      revolve(galv, [x, deck + 0.12, z], [0, 1, 0], [
        [0, 0],
        [0.007, 0],
        [0.007, 0.06],
        [0, 0.06],
      ], 10)
    }
  }

  // Rear lights and side reflectors.
  for (const z of [-zr + 0.12, zr - 0.12]) {
    aab(steel, [-Lt / 2 - 0.05, deck - 0.12, z - 0.11], [-Lt / 2, deck - 0.02, z + 0.11], 0.006)
    aab(bag.get('reflectorRed'), [-Lt / 2 - 0.058, deck - 0.11, z - 0.1], [-Lt / 2 - 0.05, deck - 0.03, z + 0.02], 0.002)
    aab(bag.get('reflectorAmber'), [-Lt / 2 - 0.058, deck - 0.11, z + 0.03], [-Lt / 2 - 0.05, deck - 0.03, z + 0.1], 0.002)
  }
  for (const z of [-zr - 0.025, zr + 0.025]) {
    for (const x of [-Lt / 2 + 0.05, Lt / 2 - 0.05]) {
      const s = Math.sign(z)
      aab(bag.get('reflectorAmber'), [x - 0.03, deck - 0.075, z + s * 0.0 - 0.004], [x + 0.03, deck - 0.03, z + s * 0.004 + 0.004], 0.002)
    }
  }

  // Tie-down rods with turnbuckles holding the sauna to the frame.
  for (const x of [-L / 2 + 0.32, L / 2 - 0.32]) {
    for (const s of [1, -1]) {
      const z = s * (outer.halfWidth + 0.002)
      aab(galv, [x - 0.025, deck + 0.12, Math.min(z, z + s * 0.004)], [x + 0.025, lay.eaveY + 0.03, Math.max(z, z + s * 0.004)], 0.001)
      revolve(galv, [x, deck - 0.04, z + s * 0.018], [0, 1, 0], [
        [0, 0],
        [0.007, 0],
        [0.007, 0.06],
        [0.013, 0.07],
        [0.013, 0.13],
        [0.007, 0.14],
        [0.007, 0.17],
        [0, 0.17],
      ], 14)
    }
  }
}

/** Stainless sandwich chimney with roof collar, joints and rain cap. */
export function buildChimney(bag: Bag, lay: Layout) {
  if (!lay.chimney) return
  const s = bag.get('stainless')
  const { x, z } = lay.chimney
  const y = lay.frame.top + SUBSTRATE_T + 0.016
  aab(s, [x - 0.24, y - 0.004, z - 0.24], [x + 0.24, y, z + 0.24], 0.002)
  const up: V3 = [0, 1, 0]
  revolve(s, [x, y, z], up, [
    [0.22, 0],
    [0.2, 0.012],
    [0.115, 0.12],
    [0.108, 0.13],
    [0.108, 0.16],
  ], 48)
  const pipe: V2[] = [[0.1, 0.0]]
  const H = 1.3
  for (const j of [0.45, 0.95]) pipe.push([0.1, j - 0.02], [0.105, j - 0.015], [0.105, j + 0.015], [0.1, j + 0.02])
  pipe.push([0.1, H], [0.07, H], [0.065, H + 0.06], [0.06, H + 0.06], [0.06, H - 0.02])
  revolve(s, [x, y, z], up, pipe, 48)
  // Rain cap on three legs.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    aab(s, [x + Math.cos(a) * 0.085 - 0.006, y + H - 0.04, z + Math.sin(a) * 0.085 - 0.006], [x + Math.cos(a) * 0.085 + 0.006, y + H + 0.17, z + Math.sin(a) * 0.085 + 0.006], 0.001)
  }
  revolve(s, [x, y + H + 0.15, z], up, [
    [0.0, 0.0],
    [0.17, -0.002],
    [0.19, 0.0],
    [0.185, 0.006],
    [0.0, 0.1],
  ], 48)
}

export interface LightingMeta {
  strips: { y: number; z: number; x0: number; x1: number; side: number }[]
}

export function buildLighting(bag: Bag, lay: Layout, enabled: boolean, lamp: { lamp: V3; lampDir: V3 } | null): LightingMeta {
  const meta: LightingMeta = { strips: [] }
  if (!enabled) return meta
  const galv = bag.get('galvanized')
  const led = bag.get('ledStrip')
  const y = lay.eaveY - 0.04
  for (const side of [1, -1]) {
    const z = side * (lay.outer.halfWidth + 0.001)
    const x0 = -lay.L / 2 + 0.1
    const x1 = lay.L / 2 - 0.1
    aab(galv, [x0, y, Math.min(z, z + side * 0.018)], [x1, y + 0.014, Math.max(z, z + side * 0.018)], 0.001)
    aab(led, [x0 + 0.01, y - 0.002, Math.min(z + side * 0.003, z + side * 0.015)], [x1 - 0.01, y, Math.max(z + side * 0.003, z + side * 0.015)], 0.0005)
    meta.strips.push({ y: y - 0.01, z: z + side * 0.01, x0, x1, side })
  }
  if (lamp) {
    const [lx, ly, lz] = lamp.lamp
    const f = lamp.lampDir
    const back: V3 = [lx - f[0] * 0.12, ly, lz - f[2] * 0.12]
    const shade = bag.get('lampShade')
    // Wall plate, arm and cylindrical down-light.
    aab(shade, [back[0] - (f[2] ? 0.05 : 0.008), ly - 0.08, back[2] - (f[0] ? 0.05 : 0.008)], [back[0] + (f[2] ? 0.05 : 0.008), ly + 0.08, back[2] + (f[0] ? 0.05 : 0.008)], 0.003)
    revolve(shade, [lx, ly - 0.09, lz], [0, 1, 0], [
      [0.0, 0.0],
      [0.042, 0.0],
      [0.045, 0.004],
      [0.045, 0.17],
      [0.0, 0.17],
    ], 40)
    revolve(led, [lx, ly - 0.0905, lz], [0, -1, 0], [
      [0.034, 0.0],
      [0.0, 0.0],
    ], 32)
    // Arm from the wall plate to the light.
    aab(shade, [Math.min(back[0], lx) - (f[2] ? 0.012 : 0), ly + 0.02, Math.min(back[2], lz) - (f[0] ? 0.012 : 0)], [Math.max(back[0], lx) + (f[2] ? 0.012 : 0), ly + 0.045, Math.max(back[2], lz) + (f[0] ? 0.012 : 0)], 0.002)
  }
  return meta
}
