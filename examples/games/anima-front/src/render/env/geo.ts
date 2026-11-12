/**
 * Geometry accumulator for merged environment batches. Every vertex carries: position, normal, uv (in tile
 * repeats), tint (rgb multiplier + emissive strength in a), rect (atlas tile) and fx (sway weight or pulse).
 * Pure (three.js math only), so planning can be unit-tested without WebGL.
 */
import * as THREE from 'three'
import { TILE_SIZE, tileRect, type TileName } from './atlas'

export interface Surf {
  tile: TileName
  /** Linear RGB multiplier (from sRGB hex by `tint()`); default white. */
  color?: number
  /** Emissive strength (× emissive atlas). */
  glow?: number
  /** Sway weight (foliage) or pulse amount (glow material). */
  fx?: number
  /** UV mapping: 'world' uses TILE_SIZE metres per repeat (default), 'fit' stretches the tile once. */
  map?: 'world' | 'fit'
  /** Extra UV offset in repeats (variation between buildings). */
  offset?: [number, number]
  /** Multiplies the world-size repeat count. */
  scale?: number
}

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _c = new THREE.Color()
const _nm = new THREE.Matrix3()
const _b = new THREE.Vector3()
/** Matrix the cached normal matrix `_nm` was computed from (shared by all builders). */
const _lastM = new Float64Array(16).fill(NaN)

export class GeoBuilder {
  readonly pos: number[] = []
  readonly nor: number[] = []
  readonly uv: number[] = []
  readonly tint: number[] = []
  readonly rect: number[] = []
  readonly fx: number[] = []
  readonly index: number[] = []
  /** Transform applied to everything added (reset with `identity()`). */
  readonly matrix = new THREE.Matrix4()
  /** Vertex tint darkening towards y = 0 (fake ambient occlusion), in metres. */
  aoHeight = 0
  /** Extra per-vertex brightness multiplier (set by smooth blobs for a top-lit gradient). */
  private shadeK = 1
  /**
   * Bends every normal towards the direction from `c` (world space) by `k` (0..1): foliage clumps and leaf cards
   * of one canopy then light as one soft volume instead of many small facets.
   */
  bend: { c: readonly [number, number, number]; k: number } | null = null

  get vertexCount() {
    return this.pos.length / 3
  }

  get triangleCount() {
    return this.index.length / 3
  }

  identity() {
    this.matrix.identity()
    return this
  }

  /** Sets the transform to translate · rotateY · scale. */
  place(x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx) {
    this.matrix.makeRotationY(yaw)
    this.matrix.scale(_v.set(sx, sy, sz))
    this.matrix.setPosition(x, y, z)
    return this
  }

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, s: Surf) {
    _v.set(x, y, z).applyMatrix4(this.matrix)
    // The normal matrix needs an inverse: only recompute it when the transform changed.
    const e = this.matrix.elements
    let same = true
    for (let i = 0; i < 16; i++)
      if (e[i] !== _lastM[i]) {
        same = false
        break
      }
    if (!same) {
      _nm.getNormalMatrix(this.matrix)
      for (let i = 0; i < 16; i++) _lastM[i] = e[i]
    }
    _n.set(nx, ny, nz).applyMatrix3(_nm).normalize()
    if (this.bend) {
      const c = this.bend.c
      _b.set(_v.x - c[0], _v.y - c[1], _v.z - c[2]).normalize()
      // Keep the face normal where the blend would cancel out (zero normals light as NaN).
      _b.multiplyScalar(this.bend.k).addScaledVector(_n, 1 - this.bend.k)
      if (_b.lengthSq() > 1e-6) _n.copy(_b).normalize()
    }
    this.pos.push(_v.x, _v.y, _v.z)
    this.nor.push(_n.x, _n.y, _n.z)
    this.uv.push(u + (s.offset?.[0] ?? 0), v + (s.offset?.[1] ?? 0))
    _c.setHex(s.color ?? 0xffffff)
    let ao = 1
    if (this.aoHeight > 0) ao = 0.62 + 0.38 * Math.min(1, Math.max(0, _v.y / this.aoHeight))
    const k = ao * this.shadeK
    this.tint.push(_c.r * k, _c.g * k, _c.b * k, s.glow ?? 0)
    const r = tileRect(s.tile)
    this.rect.push(r[0], r[1], r[2], r[3])
    this.fx.push(s.fx ?? 0)
  }

  /**
   * Quad from corner a along edge vectors e1 (u) and e2 (v), in local space; front face = e1 × e2.
   * World-mapped UVs use the edge lengths in metres.
   */
  quad(
    ax: number,
    ay: number,
    az: number,
    e1: readonly [number, number, number],
    e2: readonly [number, number, number],
    s: Surf,
    uv?: readonly [number, number, number, number]
  ) {
    const base = this.vertexCount
    const nx = e1[1] * e2[2] - e1[2] * e2[1]
    const ny = e1[2] * e2[0] - e1[0] * e2[2]
    const nz = e1[0] * e2[1] - e1[1] * e2[0]
    let u0: number
    let v0: number
    let u1: number
    let v1: number
    if (uv) [u0, v0, u1, v1] = uv
    else if (s.map === 'fit' || !TILE_SIZE[s.tile]) [u0, v0, u1, v1] = [0.004, 0.004, 0.996, 0.996]
    else {
      const size = TILE_SIZE[s.tile]!
      const k = s.scale ?? 1
      u0 = 0
      v0 = 0
      u1 = (Math.hypot(e1[0], e1[1], e1[2]) / size[0]) * k
      v1 = (Math.hypot(e2[0], e2[1], e2[2]) / size[1]) * k
    }
    this.vertex(ax, ay, az, nx, ny, nz, u0, v0, s)
    this.vertex(ax + e1[0], ay + e1[1], az + e1[2], nx, ny, nz, u1, v0, s)
    this.vertex(ax + e1[0] + e2[0], ay + e1[1] + e2[1], az + e1[2] + e2[2], nx, ny, nz, u1, v1, s)
    this.vertex(ax + e2[0], ay + e2[1], az + e2[2], nx, ny, nz, u0, v1, s)
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /**
   * Axis-aligned box in local space. `faces` picks a surface per face (px, nx, py, ny, pz, nz) or one for all;
   * omit a face with null. World UVs: side faces map u along the face and v up from the box bottom.
   */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    faces:
      | Surf
      | { px?: Surf | null; nx?: Surf | null; py?: Surf | null; ny?: Surf | null; pz?: Surf | null; nz?: Surf | null }
  ) {
    const all = 'tile' in faces ? (faces as Surf) : null
    const f = all ? { px: all, nx: all, py: all, ny: all, pz: all, nz: all } : (faces as Record<string, Surf | null>)
    const w = x1 - x0
    const h = y1 - y0
    const d = z1 - z0
    if (f.pz) this.quad(x0, y0, z1, [w, 0, 0], [0, h, 0], f.pz)
    if (f.nz) this.quad(x1, y0, z0, [-w, 0, 0], [0, h, 0], f.nz)
    if (f.px) this.quad(x1, y0, z1, [0, 0, -d], [0, h, 0], f.px)
    if (f.nx) this.quad(x0, y0, z0, [0, 0, d], [0, h, 0], f.nx)
    if (f.py) this.quad(x0, y1, z1, [w, 0, 0], [0, 0, -d], f.py)
    if (f.ny) this.quad(x0, y0, z0, [w, 0, 0], [0, 0, d], f.ny)
  }

  /** Vertical cylinder (or cone when r1 differs) around the local y axis, base at y0. */
  cylinder(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, seg: number, s: Surf, caps = true) {
    const base = this.vertexCount
    const slope = (r0 - r1) / h
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      const sx = Math.sin(a)
      const sz = Math.cos(a)
      const nl = Math.hypot(1, slope)
      const u = (i / seg) * (s.map === 'fit' ? 1 : Math.max(1, Math.round((Math.PI * 2 * Math.max(r0, r1)) / 2)))
      const vTop = s.map === 'fit' ? 1 : h / (TILE_SIZE[s.tile]?.[1] ?? 2)
      this.vertex(cx + sx * r0, y0, cz + sz * r0, sx / nl, slope / nl, sz / nl, u, 0, s)
      this.vertex(cx + sx * r1, y0 + h, cz + sz * r1, sx / nl, slope / nl, sz / nl, u, vTop, s)
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2
      this.index.push(a, a + 2, a + 3, a, a + 3, a + 1)
    }
    if (caps && r1 > 0.001) this.disc(cx, y0 + h, cz, r1, seg, 1, s)
  }

  /** Horizontal disc facing up (dir 1) or down (−1). */
  disc(cx: number, y: number, cz: number, r: number, seg: number, dir: 1 | -1, s: Surf) {
    const base = this.vertexCount
    this.vertex(cx, y, cz, 0, dir, 0, 0.5, 0.5, s)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2
      this.vertex(
        cx + Math.sin(a) * r,
        y,
        cz + Math.cos(a) * r,
        0,
        dir,
        0,
        0.5 + Math.sin(a) * 0.48,
        0.5 + Math.cos(a) * 0.48,
        s
      )
    }
    for (let i = 0; i < seg; i++) {
      if (dir > 0) this.index.push(base, base + 1 + i, base + 2 + i)
      else this.index.push(base, base + 2 + i, base + 1 + i)
    }
  }

  /**
   * Faceted blob (subdivided octahedron pushed to a sphere), scaled per axis, with deterministic lumps.
   * Flat-shaded facets read as stylised foliage, rocks and crystals.
   */
  blob(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    s: Surf,
    detail = 1,
    lump = 0.12,
    seed = 0,
    smooth = false
  ) {
    const tris = octaSphere(detail)
    const p = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    const size = TILE_SIZE[s.tile] ?? [2, 2]
    for (let t = 0; t < tris.length; t += 9) {
      for (let k = 0; k < 3; k++) {
        const x = tris[t + k * 3]
        const y = tris[t + k * 3 + 1]
        const z = tris[t + k * 3 + 2]
        const n = 1 + lump * hashNoise(x * 3.1 + seed, y * 2.7 - seed, z * 3.3 + seed * 0.5)
        p[k * 3] = cx + x * rx * n
        p[k * 3 + 1] = cy + y * ry * n
        p[k * 3 + 2] = cz + z * rz * n
      }
      if (!smooth) {
        this.tri(p, s)
        continue
      }
      // Smooth: ellipsoid normals, spherical UVs (soft, cloud-like foliage).
      const base = this.vertexCount
      for (let k = 0; k < 3; k++) {
        const x = tris[t + k * 3]
        const y = tris[t + k * 3 + 1]
        const z = tris[t + k * 3 + 2]
        const nx = x / rx
        const ny = y / ry + 0.25
        const nz = z / rz
        const l = Math.hypot(nx, ny, nz) || 1
        // Darker underside, brighter crown (soft baked occlusion).
        this.shadeK = 0.62 + 0.38 * Math.min(1, Math.max(0, (y + 1) / 2)) ** 0.8
        this.vertex(
          p[k * 3],
          p[k * 3 + 1],
          p[k * 3 + 2],
          nx / l,
          ny / l,
          nz / l,
          (p[k * 3] + p[k * 3 + 2]) / (size[0] * 0.6),
          p[k * 3 + 1] / (size[1] * 0.6),
          s
        )
      }
      this.shadeK = 1
      this.index.push(base, base + 1, base + 2)
    }
  }

  /** Flat-shaded triangle from 9 numbers (local space). UVs are planar from x/z or x/y. */
  tri(p: readonly number[], s: Surf) {
    const ux = p[3] - p[0]
    const uy = p[4] - p[1]
    const uz = p[5] - p[2]
    const vx = p[6] - p[0]
    const vy = p[7] - p[1]
    const vz = p[8] - p[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    const base = this.vertexCount
    const size = TILE_SIZE[s.tile] ?? [2, 2]
    const vertical = Math.abs(ny) < 0.6
    for (let k = 0; k < 3; k++) {
      const x = p[k * 3]
      const y = p[k * 3 + 1]
      const z = p[k * 3 + 2]
      const u = (vertical ? (Math.abs(nx) > Math.abs(nz) ? z : x) : x) / size[0]
      const v = (vertical ? y : z) / size[1]
      this.vertex(x, y, z, nx, ny, nz, u, v, s)
    }
    this.index.push(base, base + 1, base + 2)
  }

  /** Thin tube (cable, rope, rail) between two local points, `seg` sides, optional sag. */
  tube(a: readonly number[], b: readonly number[], r: number, s: Surf, sag = 0, steps = 1, seg = 4) {
    let prev: number[] | null = null
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]
      if (prev) this.segment(prev, pt, r, s, seg)
      prev = pt
    }
  }

  /** Tapered limb (trunk, branch) from radius r0 at a to r1 at b. */
  limb(a: readonly number[], b: readonly number[], r0: number, r1: number, s: Surf, seg = 6) {
    this.segment([a[0], a[1], a[2]], [b[0], b[1], b[2]], r0, s, seg, r1)
  }

  /**
   * Camera-independent leaf card: a quad centred on (x, y, z) spanning `right` and `up` (half extents) with an
   * explicit normal (usually pointing out of the canopy) so cards shade like the volume they belong to.
   */
  card(
    x: number,
    y: number,
    z: number,
    right: readonly [number, number, number],
    up: readonly [number, number, number],
    normal: readonly [number, number, number],
    s: Surf,
    uv: readonly [number, number, number, number] = [0.004, 0.004, 0.996, 0.996]
  ) {
    const base = this.vertexCount
    const [nx, ny, nz] = normal
    const [u0, v0, u1, v1] = uv
    this.vertex(x - right[0] - up[0], y - right[1] - up[1], z - right[2] - up[2], nx, ny, nz, u0, v0, s)
    this.vertex(x + right[0] - up[0], y + right[1] - up[1], z + right[2] - up[2], nx, ny, nz, u1, v0, s)
    this.vertex(x + right[0] + up[0], y + right[1] + up[1], z + right[2] + up[2], nx, ny, nz, u1, v1, s)
    this.vertex(x - right[0] + up[0], y - right[1] + up[1], z - right[2] + up[2], nx, ny, nz, u0, v1, s)
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  private segment(a: number[], b: number[], r: number, s: Surf, seg: number, r1 = r) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const len = d.length()
    if (len < 1e-5) return
    d.divideScalar(len)
    const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(d, up).normalize()
    const up2 = new THREE.Vector3().crossVectors(side, d).normalize()
    const base = this.vertexCount
    for (let i = 0; i <= seg; i++) {
      const ang = (i / seg) * Math.PI * 2
      const nx = side.x * Math.cos(ang) + up2.x * Math.sin(ang)
      const ny = side.y * Math.cos(ang) + up2.y * Math.sin(ang)
      const nz = side.z * Math.cos(ang) + up2.z * Math.sin(ang)
      this.vertex(a[0] + nx * r, a[1] + ny * r, a[2] + nz * r, nx, ny, nz, i / seg, 0, s)
      this.vertex(b[0] + nx * r1, b[1] + ny * r1, b[2] + nz * r1, nx, ny, nz, i / seg, len / 2, s)
    }
    for (let i = 0; i < seg; i++) {
      const k = base + i * 2
      this.index.push(k, k + 1, k + 3, k, k + 3, k + 2)
    }
  }

  /** Crossed vertical cards (grass, flowers, tufts) centred on (x, z), facing all ways. */
  cross(x: number, y: number, z: number, w: number, h: number, s: Surf, cards = 2, rot = 0) {
    for (let i = 0; i < cards; i++) {
      const a = rot + (i / cards) * Math.PI
      const dx = (Math.cos(a) * w) / 2
      const dz = (Math.sin(a) * w) / 2
      this.quad(x - dx, y, z - dz, [dx * 2, 0, dz * 2], [0, h, 0], { ...s, map: 'fit' })
    }
  }

  /** Appends another builder's data (already in world space). */
  append(other: GeoBuilder) {
    const base = this.vertexCount
    push(this.pos, other.pos)
    push(this.nor, other.nor)
    push(this.uv, other.uv)
    push(this.tint, other.tint)
    push(this.rect, other.rect)
    push(this.fx, other.fx)
    for (const i of other.index) this.index.push(i + base)
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tint, 4))
    g.setAttribute('rect', new THREE.Float32BufferAttribute(this.rect, 4))
    g.setAttribute('fx', new THREE.Float32BufferAttribute(this.fx, 1))
    const n = this.vertexCount
    g.setIndex(
      n > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1)
    )
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

function push(dst: number[], src: number[]) {
  for (let i = 0; i < src.length; i++) dst.push(src[i])
}

const octaCache = new Map<number, number[]>()

/** Triangles of a unit sphere from a subdivided octahedron (flat array of 9 numbers per triangle). */
export function octaSphere(detail: number): number[] {
  const hit = octaCache.get(detail)
  if (hit) return hit
  const v = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ]
  let tris: number[][][] = [
    [v[2], v[4], v[0]],
    [v[2], v[0], v[5]],
    [v[2], v[5], v[1]],
    [v[2], v[1], v[4]],
    [v[3], v[0], v[4]],
    [v[3], v[5], v[0]],
    [v[3], v[1], v[5]],
    [v[3], v[4], v[1]]
  ]
  const norm = (p: number[]) => {
    const l = Math.hypot(p[0], p[1], p[2])
    return [p[0] / l, p[1] / l, p[2] / l]
  }
  const mid = (a: number[], b: number[]) => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])
  for (let d = 0; d < detail; d++) {
    const next: number[][][] = []
    for (const [a, b, c] of tris) {
      const ab = mid(a, b)
      const bc = mid(b, c)
      const ca = mid(c, a)
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca])
    }
    tris = next
  }
  const out: number[] = []
  for (const t of tris) for (const p of t) out.push(p[0], p[1], p[2])
  octaCache.set(detail, out)
  return out
}

/** Deterministic value noise in −1..1 (no RNG state). */
export function hashNoise(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}

/** Small deterministic PRNG for planning (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
