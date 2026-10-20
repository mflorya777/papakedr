import * as THREE from 'three'

export type V2 = [number, number]
export type V3 = [number, number, number]

/** Maps (along, a, b) to world space: p = o + e*along + A*a + B*b. */
export interface Basis {
  o: V3
  e: V3
  a: V3
  b: V3
}

export const basis = (o: V3, e: V3, a: V3, b: V3): Basis => ({ o, e, a, b })
/** Extrude along X; the 2D loop lives in (z, y). */
export const alongX = (o: V3 = [0, 0, 0]) => basis(o, [1, 0, 0], [0, 0, 1], [0, 1, 0])
/** Extrude along Z; the 2D loop lives in (x, y). */
export const alongZ = (o: V3 = [0, 0, 0]) => basis(o, [0, 0, 1], [1, 0, 0], [0, 1, 0])
/** Extrude along Y; the 2D loop lives in (x, z). */
export const alongY = (o: V3 = [0, 0, 0]) => basis(o, [0, 1, 0], [1, 0, 0], [0, 0, 1])

const map = (B: Basis, t: number, a: number, b: number): V3 => [
  B.o[0] + B.e[0] * t + B.a[0] * a + B.b[0] * b,
  B.o[1] + B.e[1] * t + B.a[1] * a + B.b[1] * b,
  B.o[2] + B.e[2] * t + B.a[2] * a + B.b[2] * b,
]
const mapDir = (B: Basis, t: number, a: number, b: number): V3 => [
  B.e[0] * t + B.a[0] * a + B.b[0] * b,
  B.e[1] * t + B.a[1] * a + B.b[1] * b,
  B.e[2] * t + B.a[2] * a + B.b[2] * b,
]

const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]
const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
const norm = (p: V3): V3 => {
  const l = Math.hypot(p[0], p[1], p[2]) || 1
  return [p[0] / l, p[1] / l, p[2] / l]
}

export interface ExtrudeOptions {
  /** Metres per texture tile along the extrusion and across the loop. */
  uScale?: number
  vScale?: number
  uOffset?: number
  vOffset?: number
  /** Swap u/v so the grain runs across the extrusion instead of along it. */
  swapUV?: boolean
  caps?: boolean
  /** Edges sharper than this (degrees) get split normals. */
  smoothAngle?: number
}

/**
 * Accumulates indexed triangles with explicit normals, UVs and a per-vertex
 * tint, then emits a single BufferGeometry. All procedural parts are built
 * with it so each material ends up as one draw call.
 */
export class MeshBuilder {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  tint: V3 = [1, 1, 1]

  get count() {
    return this.pos.length / 3
  }

  vertex(p: V3, n: V3, u: number, v: number): number {
    this.pos.push(p[0], p[1], p[2])
    this.nor.push(n[0], n[1], n[2])
    this.uv.push(u, v)
    this.col.push(this.tint[0], this.tint[1], this.tint[2])
    return this.count - 1
  }

  private P(i: number): V3 {
    return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]]
  }
  private N(i: number): V3 {
    return [this.nor[i * 3], this.nor[i * 3 + 1], this.nor[i * 3 + 2]]
  }

  /** Triangle, wound so its face normal agrees with the vertex normals. */
  tri(a: number, b: number, c: number) {
    const fn = cross(sub(this.P(b), this.P(a)), sub(this.P(c), this.P(a)))
    const vn = this.N(a)
    if (dot(fn, vn) < 0) this.idx.push(a, c, b)
    else this.idx.push(a, b, c)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.tri(a, b, c)
    this.tri(a, c, d)
  }

  /**
   * Extrudes a closed 2D loop between two positions along the basis' e axis.
   * Normals are computed from the loop, so it may be wound either way.
   */
  extrude(loop: V2[], t0: number, t1: number, B: Basis, o: ExtrudeOptions = {}) {
    const n = loop.length
    const uS = o.uScale ?? 1
    const vS = o.vScale ?? 1
    const uO = o.uOffset ?? 0
    const vO = o.vOffset ?? 0
    const cosLimit = Math.cos(((o.smoothAngle ?? 35) * Math.PI) / 180)
    let area = 0
    for (let i = 0; i < n; i++) {
      const [x0, y0] = loop[i]
      const [x1, y1] = loop[(i + 1) % n]
      area += x0 * y1 - x1 * y0
    }
    const sign = area > 0 ? 1 : -1
    const edgeN: V2[] = []
    for (let i = 0; i < n; i++) {
      const [x0, y0] = loop[i]
      const [x1, y1] = loop[(i + 1) % n]
      const dx = x1 - x0
      const dy = y1 - y0
      const l = Math.hypot(dx, dy) || 1
      edgeN.push([(sign * dy) / l, (-sign * dx) / l])
    }
    const vertN = (edge: number, corner: number): V2 => {
      // Normal of `edge` at loop vertex `corner`, smoothed with the neighbour edge.
      const other = corner === edge ? (edge - 1 + n) % n : (edge + 1) % n
      const a = edgeN[edge]
      const b = edgeN[other]
      if (a[0] * b[0] + a[1] * b[1] < cosLimit) return a
      const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1
      return [(a[0] + b[0]) / l, (a[1] + b[1]) / l]
    }
    const uvOf = (t: number, s: number): V2 => {
      const u = t / uS + uO
      const v = s / vS + vO
      return o.swapUV ? [v, u] : [u, v]
    }
    let acc = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const len = Math.hypot(loop[j][0] - loop[i][0], loop[j][1] - loop[i][1])
      const ni = vertN(i, i)
      const nj = vertN(i, j)
      const Ni = norm(mapDir(B, 0, ni[0], ni[1]))
      const Nj = norm(mapDir(B, 0, nj[0], nj[1]))
      const uvs = [uvOf(t0, acc), uvOf(t0, acc + len), uvOf(t1, acc + len), uvOf(t1, acc)]
      const a = this.vertex(map(B, t0, ...loop[i]), Ni, ...uvs[0])
      const b = this.vertex(map(B, t0, ...loop[j]), Nj, ...uvs[1])
      const c = this.vertex(map(B, t1, ...loop[j]), Nj, ...uvs[2])
      const d = this.vertex(map(B, t1, ...loop[i]), Ni, ...uvs[3])
      this.quad(a, b, c, d)
      acc += len
    }
    if (o.caps !== false) {
      const contour = loop.map(([x, y]) => new THREE.Vector2(x, y))
      const tris = THREE.ShapeUtils.triangulateShape(contour, [])
      const dir = Math.sign(t1 - t0) || 1
      for (const [t, nSign] of [
        [t0, -dir],
        [t1, dir],
      ] as const) {
        const Nn = norm(mapDir(B, nSign, 0, 0))
        const base = this.count
        for (const [x, y] of loop) {
          const [u, v] = uvOf(x * (uS / vS), y)
          this.vertex(map(B, t, x, y), Nn, u, v)
        }
        for (const [a, b, c] of tris) this.tri(base + a, base + b, base + c)
      }
    }
  }

  /** Box with chamfered long edges, extruded along the basis e axis. */
  board(t0: number, t1: number, a0: number, a1: number, b0: number, b1: number, B: Basis, chamfer: number, o: ExtrudeOptions = {}) {
    const c = Math.min(chamfer, (a1 - a0) / 3, (b1 - b0) / 3)
    const loop: V2[] = [
      [a0 + c, b0],
      [a1 - c, b0],
      [a1, b0 + c],
      [a1, b1 - c],
      [a1 - c, b1],
      [a0 + c, b1],
      [a0, b1 - c],
      [a0, b0 + c],
    ]
    this.extrude(loop, t0, t1, B, { smoothAngle: 20, ...o })
  }

  /**
   * Structured grid surface. `at(i, j)` returns the position and UV of grid
   * node (i, j); normals come from the grid tangents, oriented towards `hint`
   * (a function returning an approximate outward direction).
   */
  grid(nu: number, nv: number, at: (i: number, j: number) => { p: V3; uv: V2 }, hint: (p: V3) => V3) {
    const P: V3[][] = []
    const UV: V2[][] = []
    for (let i = 0; i <= nu; i++) {
      P.push([])
      UV.push([])
      for (let j = 0; j <= nv; j++) {
        const r = at(i, j)
        P[i].push(r.p)
        UV[i].push(r.uv)
      }
    }
    const ids: number[][] = []
    for (let i = 0; i <= nu; i++) {
      ids.push([])
      for (let j = 0; j <= nv; j++) {
        const du = sub(P[Math.min(i + 1, nu)][j], P[Math.max(i - 1, 0)][j])
        const dv = sub(P[i][Math.min(j + 1, nv)], P[i][Math.max(j - 1, 0)])
        let nrm = norm(cross(du, dv))
        if (dot(nrm, hint(P[i][j])) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]]
        ids[i].push(this.vertex(P[i][j], nrm, ...UV[i][j]))
      }
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) this.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1])
  }

  /**
   * Surface of revolution around the basis e axis. `profile` is a list of
   * (radius, height) points; height runs along e. UV u wraps the circumference
   * (in metres of the reference radius), v follows the profile.
   */
  lathe(profile: V2[], segments: number, B: Basis, o: { uScale?: number; vScale?: number; a0?: number; a1?: number; smoothAngle?: number } = {}) {
    const a0 = o.a0 ?? 0
    const a1 = o.a1 ?? Math.PI * 2
    const uS = o.uScale ?? 1
    const vS = o.vScale ?? 1
    const cosLimit = Math.cos(((o.smoothAngle ?? 40) * Math.PI) / 180)
    const rRef = Math.max(...profile.map((p) => p[0]))
    // Profile edge normals in (r, h).
    const m = profile.length
    const en: V2[] = []
    for (let k = 0; k < m - 1; k++) {
      const dr = profile[k + 1][0] - profile[k][0]
      const dh = profile[k + 1][1] - profile[k][1]
      const l = Math.hypot(dr, dh) || 1
      en.push([dh / l, -dr / l])
    }
    let acc = 0
    for (let k = 0; k < m - 1; k++) {
      const len = Math.hypot(profile[k + 1][0] - profile[k][0], profile[k + 1][1] - profile[k][1])
      const nAt = (corner: number): V2 => {
        const other = corner === k ? k - 1 : k + 1
        const a = en[k]
        const b = en[other]
        if (!b || a[0] * b[0] + a[1] * b[1] < cosLimit) return a
        const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1
        return [(a[0] + b[0]) / l, (a[1] + b[1]) / l]
      }
      const n0 = nAt(k)
      const n1 = nAt(k + 1)
      const row = (pt: V2, nn: V2, v: number) => {
        const ids: number[] = []
        for (let s = 0; s <= segments; s++) {
          const ang = a0 + ((a1 - a0) * s) / segments
          const c = Math.cos(ang)
          const sn = Math.sin(ang)
          const p = map(B, pt[1], pt[0] * c, pt[0] * sn)
          const nrm = norm(mapDir(B, nn[1], nn[0] * c, nn[0] * sn))
          ids.push(this.vertex(p, nrm, (ang * rRef) / uS, v / vS))
        }
        return ids
      }
      const r0 = row(profile[k], n0, acc)
      const r1 = row(profile[k + 1], n1, acc + len)
      for (let s = 0; s < segments; s++) this.quad(r0[s], r0[s + 1], r1[s + 1], r1[s])
      acc += len
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/** Deterministic PRNG so the same configuration always looks the same. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

/** Tint for one board: natural colour scatter between boards. */
export function boardTint(r: () => number, amount = 0.08): V3 {
  const k = 1 + (r() - 0.5) * 2 * amount
  const warm = (r() - 0.5) * amount * 0.5
  return [k * (1 + warm), k, k * (1 - warm)]
}
