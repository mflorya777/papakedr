// Rounded-rectangle cross-section of a quadro-barrel sauna in the (z, y) plane.
// The path is parameterised by arc length s, starting at the ridge (top
// centre) and running clockwise: over the right (+z) shoulder, down the right
// wall, across the floor, up the left wall and back to the ridge.

export interface Sample {
  z: number
  y: number
  /** Outward unit normal. */
  nz: number
  ny: number
}

type Segment =
  | { kind: 'line'; len: number; z0: number; y0: number; z1: number; y1: number; nz: number; ny: number }
  | { kind: 'arc'; len: number; cz: number; cy: number; r: number; a0: number; a1: number }

export class RoundedProfile {
  readonly segments: Segment[] = []
  readonly starts: number[] = []
  readonly length: number

  constructor(
    readonly halfWidth: number,
    readonly bottom: number,
    readonly top: number,
    readonly rBottom: number,
    readonly rTop: number,
  ) {
    const hw = halfWidth
    const rt = Math.min(rTop, hw, (top - bottom) / 2)
    const rb = Math.min(rBottom, hw, (top - bottom) / 2)
    const line = (z0: number, y0: number, z1: number, y1: number, nz: number, ny: number) =>
      this.push({ kind: 'line', len: Math.hypot(z1 - z0, y1 - y0), z0, y0, z1, y1, nz, ny })
    const arc = (cz: number, cy: number, r: number, a0: number, a1: number) =>
      this.push({ kind: 'arc', len: Math.abs(a1 - a0) * r, cz, cy, r, a0, a1 })
    const H = Math.PI / 2
    line(0, top, hw - rt, top, 0, 1)
    arc(hw - rt, top - rt, rt, H, 0)
    line(hw, top - rt, hw, bottom + rb, 1, 0)
    arc(hw - rb, bottom + rb, rb, 0, -H)
    line(hw - rb, bottom, -(hw - rb), bottom, 0, -1)
    arc(-(hw - rb), bottom + rb, rb, -H, -2 * H)
    line(-hw, bottom + rb, -hw, top - rt, -1, 0)
    arc(-(hw - rt), top - rt, rt, 2 * H, H)
    line(-(hw - rt), top, 0, top, 0, 1)
    this.length = this.starts.length
      ? this.starts[this.starts.length - 1] + this.segments[this.segments.length - 1].len
      : 0
  }

  private push(seg: Segment) {
    const prev = this.segments.length
      ? this.starts[this.starts.length - 1] + this.segments[this.segments.length - 1].len
      : 0
    this.segments.push(seg)
    this.starts.push(prev)
  }

  /** Same shape grown outwards by d (negative shrinks). */
  offset(d: number): RoundedProfile {
    return new RoundedProfile(
      this.halfWidth + d,
      this.bottom - d,
      this.top + d,
      Math.max(0.004, this.rBottom + d),
      Math.max(0.004, this.rTop + d),
    )
  }

  wrap(s: number): number {
    const L = this.length
    return ((s % L) + L) % L
  }

  at(sIn: number): Sample {
    const s = this.wrap(sIn)
    let i = this.segments.length - 1
    while (i > 0 && this.starts[i] > s) i--
    const seg = this.segments[i]
    const t = seg.len > 0 ? (s - this.starts[i]) / seg.len : 0
    if (seg.kind === 'line') {
      return { z: seg.z0 + (seg.z1 - seg.z0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t, nz: seg.nz, ny: seg.ny }
    }
    const a = seg.a0 + (seg.a1 - seg.a0) * t
    const nz = Math.cos(a)
    const ny = Math.sin(a)
    return { z: seg.cz + seg.r * nz, y: seg.cy + seg.r * ny, nz, ny }
  }

  /**
   * Arc-length samples in [s0, s1] (s1 may exceed the perimeter or s0 be
   * negative): straight runs keep only their ends, curves are subdivided
   * every `step` metres. Segment joints are always included.
   */
  samples(s0: number, s1: number, step = 0.012): number[] {
    const out: number[] = [s0]
    const L = this.length
    const lapStart = Math.floor(s0 / L)
    const lapEnd = Math.floor(s1 / L)
    for (let lap = lapStart; lap <= lapEnd; lap++) {
      for (let i = 0; i < this.segments.length; i++) {
        const seg = this.segments[i]
        const a = this.starts[i] + lap * L
        const b = a + seg.len
        if (b <= s0 || a >= s1) continue
        const lo = Math.max(a, s0)
        const hi = Math.min(b, s1)
        if (seg.kind === 'arc') {
          const n = Math.max(1, Math.ceil((hi - lo) / step))
          for (let k = 1; k <= n; k++) out.push(lo + ((hi - lo) * k) / n)
        } else {
          out.push(hi)
        }
      }
    }
    // Deduplicate close values.
    const res: number[] = []
    for (const v of out) if (!res.length || v - res[res.length - 1] > 1e-6) res.push(v)
    if (s1 - res[res.length - 1] > 1e-6) res.push(s1)
    return res
  }

  /** Half width of the section at height y (the z extent of the interior). */
  halfWidthAt(y: number): number {
    const hw = this.halfWidth
    const rt = Math.min(this.rTop, hw)
    const rb = Math.min(this.rBottom, hw)
    if (y >= this.top || y <= this.bottom) return 0
    if (y > this.top - rt) {
      const dy = y - (this.top - rt)
      return hw - rt + Math.sqrt(Math.max(0, rt * rt - dy * dy))
    }
    if (y < this.bottom + rb) {
      const dy = this.bottom + rb - y
      return hw - rb + Math.sqrt(Math.max(0, rb * rb - dy * dy))
    }
    return hw
  }

  /** Arc length on the right (+z) wall at height y (straight part only). */
  sOnRightWall(y: number): number {
    return this.starts[2] + (this.top - this.rTopClamped - y)
  }

  /** Arc length on the left (-z) wall at height y (straight part only). */
  sOnLeftWall(y: number): number {
    return this.starts[6] + (y - (this.bottom + this.rBottomClamped))
  }

  get rTopClamped() {
    return Math.min(this.rTop, this.halfWidth, (this.top - this.bottom) / 2)
  }
  get rBottomClamped() {
    return Math.min(this.rBottom, this.halfWidth, (this.top - this.bottom) / 2)
  }

  /** Closed outline as (z, y) points, e.g. for THREE.Shape. */
  outline(step = 0.01): [number, number][] {
    return this.samples(0, this.length, step)
      .slice(0, -1)
      .map((s) => {
        const p = this.at(s)
        return [p.z, p.y]
      })
  }
}
