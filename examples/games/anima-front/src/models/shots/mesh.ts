/**
 * Tiny procedural meshes for projectiles (lathes along +Z, spikes, vanes, ribbons): non-indexed triangles with
 * the attributes the shot material reads (linear vertex colour and the glow mask in animaMask.y). Colours are
 * sRGB hex like the sculpt API.
 */
import * as THREE from 'three'

export type V3 = [number, number, number]

const tmp = new THREE.Color()
const lin = (hex: number): V3 => {
  tmp.setHex(hex)
  return [tmp.r, tmp.g, tmp.b]
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export class MeshBuilder {
  private pos: number[] = []
  private nrm: number[] = []
  private col: number[] = []
  private glw: number[] = []

  /** One triangle (counter-clockwise seen from outside); flat normal unless normals are given. */
  tri(a: V3, b: V3, c: V3, color: number, glow = 0, na?: V3, nb?: V3, nc?: V3): this {
    const f = norm(cross(sub(b, a), sub(c, a)))
    const rgb = lin(color)
    for (const [p, n] of [
      [a, na ?? f],
      [b, nb ?? f],
      [c, nc ?? f]
    ] as [V3, V3][]) {
      this.pos.push(p[0], p[1], p[2])
      this.nrm.push(n[0], n[1], n[2])
      this.col.push(rgb[0], rgb[1], rgb[2])
      this.glw.push(glow)
    }
    return this
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: number, glow = 0): this {
    return this.tri(a, b, c, color, glow).tri(a, c, d, color, glow)
  }

  /**
   * Surface of revolution around +Z. `rings` from back to front: [z, radius, colour, glow]. `sides` facets;
   * `flat` facets (hex bolts) or smooth normals; `stripe(side, ring)` may override a facet's colour.
   */
  lathe(
    rings: [number, number, number, number][],
    sides: number,
    o: {
      flat?: boolean
      twist?: number
      scale?: [number, number]
      /** Rotation applied to positions and normals (e.g. swap the axis), then the offset to positions. */
      rot?: (p: V3) => V3
      offset?: V3
      stripe?: (s: number, r: number) => number | null
    } = {}
  ): this {
    const [sx, sy] = o.scale ?? [1, 1]
    const rot = o.rot ?? ((p: V3) => p)
    const off = o.offset ?? [0, 0, 0]
    const at = (r: number, s: number): V3 => {
      const a = (s / sides) * Math.PI * 2 + (o.twist ?? 0) * r
      const [z, rad] = rings[r]
      const p = rot([Math.cos(a) * rad * sx, Math.sin(a) * rad * sy, z])
      return [p[0] + off[0], p[1] + off[1], p[2] + off[2]]
    }
    // Smooth normals from the profile slope.
    const nAt = (r: number, s: number): V3 => {
      const a = (s / sides) * Math.PI * 2 + (o.twist ?? 0) * r
      const prev = rings[Math.max(0, r - 1)]
      const next = rings[Math.min(rings.length - 1, r + 1)]
      const dz = next[0] - prev[0]
      const dr = next[1] - prev[1]
      const l = Math.hypot(dz, dr) || 1
      const radial = dz / l
      const axial = -dr / l
      return rot(norm([Math.cos(a) * radial * sy, Math.sin(a) * radial * sx, axial]))
    }
    for (let r = 0; r < rings.length - 1; r++)
      for (let s = 0; s < sides; s++) {
        const color = o.stripe?.(s, r) ?? rings[r][2]
        const glow = rings[r][3]
        const a = at(r, s)
        const b = at(r, s + 1)
        const c = at(r + 1, s + 1)
        const d = at(r + 1, s)
        const degenerateBack = rings[r][1] < 1e-6
        const degenerateFront = rings[r + 1][1] < 1e-6
        if (o.flat) {
          if (!degenerateBack) this.tri(a, b, c, color, glow)
          if (!degenerateFront) this.tri(a, c, d, color, glow)
        } else {
          const [na, nb, nc, nd] = [nAt(r, s), nAt(r, s + 1), nAt(r + 1, s + 1), nAt(r + 1, s)]
          if (!degenerateBack) this.tri(a, b, c, color, glow, na, nb, nc)
          if (!degenerateFront) this.tri(a, c, d, color, glow, na, nc, nd)
        }
      }
    return this
  }

  /** A pointed spike (square pyramid) from `base` along `dir` (unit) with half width `w` and length `len`. */
  spike(base: V3, dir: V3, w: number, len: number, color: number, glow = 0): this {
    const d = norm(dir)
    const up: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = norm(cross(d, up))
    const v = cross(u, d)
    const tip: V3 = [base[0] + d[0] * len, base[1] + d[1] * len, base[2] + d[2] * len]
    const corner = (cu: number, cv: number): V3 => [
      base[0] + (u[0] * cu + v[0] * cv) * w,
      base[1] + (u[1] * cu + v[1] * cv) * w,
      base[2] + (u[2] * cu + v[2] * cv) * w
    ]
    const c = [corner(1, 0), corner(0, 1), corner(-1, 0), corner(0, -1)]
    for (let i = 0; i < 4; i++) this.tri(c[i], c[(i + 1) % 4], tip, color, glow)
    return this
  }

  /** A flat outline (polygon in the plane spanned by `u` and +Z) as a fan around its first point. */
  fan(points: [number, number][], u: V3, color: number, glow = 0): this {
    const p = (q: [number, number]): V3 => [u[0] * q[0], u[1] * q[0], q[1]]
    for (let i = 1; i < points.length - 1; i++) this.tri(p(points[0]), p(points[i]), p(points[i + 1]), color, glow)
    return this
  }

  get triangles(): number {
    return this.pos.length / 9
  }

  build(): THREE.BufferGeometry {
    const n = this.pos.length / 3
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    const mask = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) mask[i * 4 + 1] = this.glw[i]
    g.setAttribute('animaMask', new THREE.BufferAttribute(mask, 4))
    g.computeBoundingBox()
    g.computeBoundingSphere()
    return g
  }
}
