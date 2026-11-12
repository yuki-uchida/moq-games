/**
 * Compiled SDF field: the Sculpt's operations flattened into typed arrays, with distance evaluation over a
 * (culled) list of operations and the full per-vertex attribute fold (colour, mask, skin weights).
 */
import { Color } from 'three'
import type { Sculpt, Shape } from './sculpt'

// Module-local numeric constants: imported enum objects cost a property lookup in hot loops.
const ADD = 0,
  SUB = 1,
  INTER = 2,
  PAINT = 3,
  EMBOSS = 4
const SPHERE = 0,
  ELLIPSOID = 1,
  ROUND_CONE = 2,
  ROUND_BOX = 3,
  TORUS = 4,
  CYLINDER = 5,
  PLANE = 6,
  SLAB = 7,
  SHELL = 8,
  ARC = 9

const SS = 21 // floats per shape: c(3) rot(9) params(8) distance multiplier(1)

export interface Field {
  count: number
  /** Op type per op. */
  opType: Uint8Array
  /** Shape index of the op and of its optional `within` region (−1 none). */
  opShape: Int32Array
  opWithin: Int32Array
  /** Extra region shapes unioned per op (null = none). */
  opUnion: (Int32Array | null)[]
  k: Float64Array
  ck: Float64Array
  wk: Float64Array
  soft: Float64Array
  amount: Float64Array
  alpha: Float64Array
  fuzzy: Uint8Array
  /** Linear RGB per op; NaN in [0] when the op brings no colour. */
  color: Float32Array
  /** Mask per op; NaN in [0] when the op brings no mask. */
  mask: Float32Array
  /** Bone index per op (−1 none). */
  bone: Int16Array
  /** Paint bone filters: per op, a list of bone indices or null. */
  boneFilter: (Int16Array | null)[]
  /** Influence sphere per op: centre xyz + radius (Infinity for unbounded). */
  bound: Float64Array
  shapeType: Uint8Array
  shapeData: Float64Array
  /** Largest blend radius (k / soft+amount) of any op: the culling margin. */
  maxBlend: number
  boneNames: string[]
  /** Fast distance over a list of ops (closure over the typed arrays). */
  dist: DistFn
}

export type DistFn = (list: Int32Array, n: number, x: number, y: number, z: number) => number

export function compileField(sculpt: Sculpt, boneNames: readonly string[] = []): Field {
  const ops = sculpt.ops
  const n = ops.length
  const shapes: Shape[] = []
  const shapeIndex = new Map<Shape, number>()
  const indexOf = (s: Shape) => {
    let i = shapeIndex.get(s)
    if (i === undefined) {
      i = shapes.length
      shapes.push(s)
      shapeIndex.set(s, i)
    }
    return i
  }
  const f: Field = {
    count: n,
    opType: new Uint8Array(n),
    opShape: new Int32Array(n),
    opWithin: new Int32Array(n),
    opUnion: [],
    k: new Float64Array(n),
    ck: new Float64Array(n),
    wk: new Float64Array(n),
    soft: new Float64Array(n),
    amount: new Float64Array(n),
    alpha: new Float64Array(n),
    fuzzy: new Uint8Array(n),
    color: new Float32Array(n * 3),
    mask: new Float32Array(n * 4),
    bone: new Int16Array(n),
    boneFilter: [],
    bound: new Float64Array(n * 4),
    shapeType: new Uint8Array(0),
    shapeData: new Float64Array(0),
    maxBlend: 0,
    boneNames: [...boneNames],
    dist: () => 1e9
  }
  const tmp = new Color()
  const boneIdx = (name: string) => {
    const i = boneNames.indexOf(name)
    if (i < 0) throw new Error(`unknown bone ${name}`)
    return i
  }
  for (let i = 0; i < n; i++) {
    const op = ops[i]
    f.opType[i] = op.type
    f.opShape[i] = indexOf(op.shape)
    f.opWithin[i] = op.within ? indexOf(op.within) : -1
    f.opUnion.push(op.union?.length ? Int32Array.from(op.union.map(indexOf)) : null)
    f.k[i] = op.k
    f.ck[i] = op.ck
    f.wk[i] = op.wk
    f.soft[i] = op.soft
    f.amount[i] = op.amount
    f.alpha[i] = op.alpha
    f.fuzzy[i] = op.fuzzy ? 1 : 0
    if (op.color !== undefined) {
      tmp.setHex(op.color)
      f.color[i * 3] = tmp.r
      f.color[i * 3 + 1] = tmp.g
      f.color[i * 3 + 2] = tmp.b
    } else f.color[i * 3] = NaN
    if (op.mask) for (let c = 0; c < 4; c++) f.mask[i * 4 + c] = op.mask[c]
    else f.mask[i * 4] = NaN
    f.bone[i] = op.bone && boneNames.length ? boneIdx(op.bone) : -1
    f.boneFilter.push(op.bones && boneNames.length ? Int16Array.from(op.bones.map(boneIdx)) : null)
    // Influence bound: the tighter of the shape and the `within` region.
    let s = op.shape
    if (op.union?.length) {
      // Enclosing sphere of all unioned shapes (infinite if any is unbounded).
      const all = [op.shape, ...op.union]
      const c: [number, number, number] = [0, 0, 0]
      for (const u of all) for (let a = 0; a < 3; a++) c[a] += u.c[a] / all.length
      let r = 0
      for (const u of all) r = Math.max(r, Math.hypot(u.c[0] - c[0], u.c[1] - c[1], u.c[2] - c[2]) + u.radius)
      s = { ...op.shape, c, radius: r }
    }
    if (op.within && op.within.radius < s.radius) s = op.within
    const blend = op.type === PAINT ? op.soft : op.type === EMBOSS ? op.soft + op.amount * 2 : Math.max(op.k, 0)
    f.bound[i * 4] = s.c[0]
    f.bound[i * 4 + 1] = s.c[1]
    f.bound[i * 4 + 2] = s.c[2]
    f.bound[i * 4 + 3] = s.radius + blend
    if (op.type !== PAINT) f.maxBlend = Math.max(f.maxBlend, blend)
  }
  f.shapeType = new Uint8Array(shapes.length)
  f.shapeData = new Float64Array(shapes.length * SS)
  shapes.forEach((s, i) => {
    f.shapeType[i] = s.type
    const o = i * SS
    f.shapeData[o] = s.c[0]
    f.shapeData[o + 1] = s.c[1]
    f.shapeData[o + 2] = s.c[2]
    const sc = s.scale ?? [1, 1, 1]
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) f.shapeData[o + 3 + r * 3 + c] = s.rot[r][c] / sc[r]
    f.shapeData[o + 20] = Math.min(sc[0], sc[1], sc[2])
    for (let p = 0; p < s.params.length && p < 8; p++) f.shapeData[o + 12 + p] = s.params[p]
  })
  f.dist = makeDistEval(f)
  return f
}

/** Signed distance of shape `s` at a point. */
export function shapeDist(f: Field, s: number, x: number, y: number, z: number): number {
  return rawShapeDist(f, s, x, y, z) * f.shapeData[s * SS + 20]
}

function rawShapeDist(f: Field, s: number, x: number, y: number, z: number): number {
  const D = f.shapeData
  const o = s * SS
  const dx = x - D[o],
    dy = y - D[o + 1],
    dz = z - D[o + 2]
  const lx = D[o + 3] * dx + D[o + 4] * dy + D[o + 5] * dz
  const ly = D[o + 6] * dx + D[o + 7] * dy + D[o + 8] * dz
  const lz = D[o + 9] * dx + D[o + 10] * dy + D[o + 11] * dz
  switch (f.shapeType[s]) {
    case SPHERE:
      return Math.sqrt(lx * lx + ly * ly + lz * lz) - D[o + 12]
    case ELLIPSOID: {
      const rx = D[o + 12],
        ry = D[o + 13],
        rz = D[o + 14]
      const ax = lx / rx,
        ay = ly / ry,
        az = lz / rz
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az)
      const bx = ax / rx,
        by = ay / ry,
        bz = az / rz
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz)
      if (k1 < 1e-9) return -Math.min(rx, ry, rz)
      return (k0 * (k0 - 1)) / k1
    }
    case ROUND_CONE: {
      const r1 = D[o + 12],
        r2 = D[o + 13],
        h = D[o + 14]
      const b = (r1 - r2) / h
      const a = Math.sqrt(1 - b * b)
      const qx = Math.sqrt(lx * lx + lz * lz),
        qy = ly
      const k = -b * qx + a * qy
      if (k < 0) return Math.sqrt(qx * qx + qy * qy) - r1
      if (k > a * h) return Math.sqrt(qx * qx + (qy - h) * (qy - h)) - r2
      return a * qx + b * qy - r1
    }
    case ROUND_BOX: {
      const qx = Math.abs(lx) - D[o + 12],
        qy = Math.abs(ly) - D[o + 13],
        qz = Math.abs(lz) - D[o + 14]
      const mx = Math.max(qx, 0),
        my = Math.max(qy, 0),
        mz = Math.max(qz, 0)
      return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - D[o + 15]
    }
    case TORUS: {
      const qx = Math.sqrt(lx * lx + lz * lz) - D[o + 12]
      return Math.sqrt(qx * qx + ly * ly) - D[o + 13]
    }
    case ARC: {
      // Capped torus (iq): sc = (sin, cos) of the half opening, centred on +Z.
      const R = D[o + 12],
        r = D[o + 13],
        sn = D[o + 14],
        cs = D[o + 15]
      const px = Math.abs(lx)
      const k = cs * px > sn * lz ? px * sn + lz * cs : Math.sqrt(px * px + lz * lz)
      return Math.sqrt(lx * lx + ly * ly + lz * lz + R * R - 2 * R * k) - r
    }
    case CYLINDER: {
      const r = D[o + 12],
        h = D[o + 13],
        rr = D[o + 14]
      const qx = Math.sqrt(lx * lx + lz * lz) - r + rr,
        qy = Math.abs(ly) - h + rr
      const mx = Math.max(qx, 0),
        my = Math.max(qy, 0)
      return Math.min(Math.max(qx, qy), 0) + Math.sqrt(mx * mx + my * my) - rr
    }
    case PLANE:
      return ly
    case SLAB:
      return Math.abs(ly) - D[o + 12]
    case SHELL: {
      const rx = D[o + 12],
        ry = D[o + 13],
        rz = D[o + 14]
      const ax = lx / rx,
        ay = ly / ry,
        az = lz / rz
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az)
      const bx = ax / rx,
        by = ay / ry,
        bz = az / rz
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz)
      const e = k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1
      return Math.abs(e) - D[o + 15]
    }
  }
  return 1e9
}

/** Distance of op `i`'s region (its shape, intersected with `within`). */
export function regionDist(f: Field, i: number, x: number, y: number, z: number): number {
  let d = shapeDist(f, f.opShape[i], x, y, z)
  const u = f.opUnion[i]
  if (u) for (let k = 0; k < u.length; k++) d = Math.min(d, shapeDist(f, u[k], x, y, z))
  const w = f.opWithin[i]
  return w < 0 ? d : Math.max(d, shapeDist(f, w, x, y, z))
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Field distance at a point using only the ops in `list[0..n)` (in op order). */
export function evalDist(f: Field, list: Int32Array, n: number, x: number, y: number, z: number): number {
  return f.dist(list, n, x, y, z)
}

export interface VertexAttribs {
  /** Base colour layer (rgb). */
  color: Float32Array
  /** Top marking colour (rgb) and its linear-ramp weight (a); the shader thresholds a at 0.5. */
  mark: Float32Array
  /** Mask channels (linear ramps, thresholded by the shader). */
  mask: Float32Array
}

/**
 * Colour layers and masks at a surface point. Every colour op's weight is a linear ramp of the signed distance
 * to its region (width ≥ `ramp`, about 1.5 cells) whose 0.5 contour is the exact region boundary. The newest
 * crisp op becomes the top marking layer over the previous visible colour, so the shader can draw its edge
 * crisply at sub-triangle precision; `fuzzy` ops blend softly into both layers. `boneW` (summed skin weight
 * per bone) drives bone-filtered paints; pass null for rigid models.
 */
export function evalAttribs(
  f: Field,
  list: Int32Array,
  n: number,
  x: number,
  y: number,
  z: number,
  boneW: Float32Array | null,
  ramp: number,
  out: VertexAttribs,
  skipRegions = false
): void {
  const base = out.color
  const top = out.mark
  const msk = out.mask
  base[0] = base[1] = base[2] = 0.8
  top[0] = top[1] = top[2] = 0.8
  top[3] = 0
  msk[0] = msk[1] = msk[2] = msk[3] = 0
  let d = 1e9
  const T = f.opType
  const C = f.color
  const M = f.mask
  for (let li = 0; li < n; li++) {
    const i = list[li]
    const t = T[i]
    const di = regionDist(f, i, x, y, z)
    const fuzzy = f.fuzzy[i] === 1
    if (skipRegions && (t === PAINT || t === EMBOSS) && (!Number.isNaN(C[i * 3]) || !Number.isNaN(M[i * 4]))) {
      // Drawn by the shader; only the emboss geometry matters for later colour seams.
      if (t === EMBOSS) d -= f.amount[i] * (1 - smoothstep(-f.soft[i], f.soft[i], di))
      continue
    }
    // Crisp ops: m is the unclamped ramp coordinate (0.5 on the boundary, > 0.5 inside). Fuzzy ops: weight w.
    let m = NaN
    let w = 0
    if (t === ADD) {
      m = 0.5 + (0.5 * (d - di)) / Math.max(f.ck[i], ramp)
      const k = f.k[i]
      if (k > 0) {
        const h = Math.max(k - Math.abs(d - di), 0) / k
        d = Math.min(d, di) - h * h * k * 0.25
      } else if (di < d) d = di
    } else if (t === SUB) {
      const e = -di
      m = 0.5 + (0.5 * (e - d)) / Math.max(f.ck[i], ramp)
      const k = f.k[i]
      if (k > 0) {
        const h = Math.max(k - Math.abs(d - e), 0) / k
        d = Math.max(d, e) + h * h * k * 0.25
      } else if (e > d) d = e
    } else if (t === INTER) {
      const k = f.k[i]
      if (k > 0) {
        const h = Math.max(k - Math.abs(d - di), 0) / k
        d = Math.max(d, di) + h * h * k * 0.25
      } else if (di > d) d = di
      continue
    } else {
      const s = f.soft[i]
      if (t === EMBOSS) d -= f.amount[i] * (1 - smoothstep(-s, s, di))
      let bone = 1
      const filter = f.boneFilter[i]
      if (filter && boneW) {
        bone = 0
        for (let b = 0; b < filter.length; b++) bone += boneW[filter[b]]
        bone = Math.min(bone, 1)
      }
      if (fuzzy) w = (1 - smoothstep(-s, s, di)) * f.alpha[i] * bone
      else m = Math.min(0.5 - (0.5 * di) / Math.max(s, ramp), bone * 1.5 - 0.25)
    }
    if (!fuzzy) w = Math.min(Math.max(m, 0), 1)
    if (w > 0 && !Number.isNaN(M[i * 4])) {
      for (let c = 0; c < 4; c++) msk[c] += (M[i * 4 + c] - msk[c]) * w
    }
    if (Number.isNaN(C[i * 3])) continue
    const r = C[i * 3],
      g = C[i * 3 + 1],
      b = C[i * 3 + 2]
    if (fuzzy) {
      if (w <= 0) continue
      base[0] += (r - base[0]) * w
      base[1] += (g - base[1]) * w
      base[2] += (b - base[2]) * w
      top[0] += (r - top[0]) * w
      top[1] += (g - top[1]) * w
      top[2] += (b - top[2]) * w
      continue
    }
    // xr: signed distance to the op's colour boundary in ramp units (> 0 outside).
    const xr = (0.5 - m) * 2
    // Geometry seams only claim colour right at the seam; markings keep their layer a little further out.
    if (xr > (t === ADD ? 1.2 : EXT)) continue
    // The visible colour so far, thresholded like the shader does.
    const on = top[3] >= 0.5
    const vr = on ? top[0] : base[0],
      vg = on ? top[1] : base[1],
      vb = on ? top[2] : base[2]
    const solid = (base[0] - top[0]) ** 2 + (base[1] - top[1]) ** 2 + (base[2] - top[2]) ** 2 < 1e-6
    if ((r - vr) ** 2 + (g - vg) ** 2 + (b - vb) ** 2 < 1e-5) {
      // Same colour: a solid vertex inside this op only raises its mark, so edge vertices of this op that
      // interpolate towards it keep showing the top colour.
      if (solid && m > 0.5) top[3] = Math.max(top[3], Math.min(m, 2))
      continue
    }
    // New top layer = this op over the visible colour; outside the ramp the top fades back to the visible
    // colour, deep inside the base fades to the op colour, so states agree across triangles.
    const fadeOut = smoothstep(1, EXT, xr)
    const fadeIn = smoothstep(1, EXT, -xr)
    base[0] = vr + (r - vr) * fadeIn
    base[1] = vg + (g - vg) * fadeIn
    base[2] = vb + (b - vb) * fadeIn
    top[0] = r + (vr - r) * fadeOut
    top[1] = g + (vg - g) * fadeOut
    top[2] = b + (vb - b) * fadeOut
    top[3] = Math.min(Math.max(m, -1), 2)
  }
}

/** How far (in ramp half-widths) a crisp colour op keeps its layer around its boundary. */
const EXT = 1.8

/**
 * Skin weights at a surface point: every bone-tagged add op contributes exp(−(dᵢ − d_min)/wk); the strongest op
 * per bone counts. Writes per-bone weights (not normalised) into `boneW`.
 */
export function evalBoneWeights(
  f: Field,
  list: Int32Array,
  n: number,
  x: number,
  y: number,
  z: number,
  scratch: Float64Array,
  boneW: Float32Array
): void {
  boneW.fill(0)
  let dmin = 1e9
  for (let li = 0; li < n; li++) {
    const i = list[li]
    if (f.opType[i] !== ADD || f.bone[i] < 0) {
      scratch[li] = 1e9
      continue
    }
    const di = regionDist(f, i, x, y, z)
    scratch[li] = di
    if (di < dmin) dmin = di
  }
  for (let li = 0; li < n; li++) {
    const di = scratch[li]
    if (di >= 1e8) continue
    const i = list[li]
    const x = Math.max(di - dmin, 0) / f.wk[i]
    // Exponential falloff with a smooth cutoff, so nearby but separate parts (a paw beside the hips) keep none.
    const w = Math.exp(-x) * (1 - smoothstep(2, 3.5, x))
    const b = f.bone[i]
    if (w > boneW[b]) boneW[b] = w
  }
}

/** Builds the hot distance loop with every array captured locally and the shapes inlined. */
function makeDistEval(f: Field): DistFn {
  const D = f.shapeData
  const ST = f.shapeType
  const OT = f.opType
  const OS = f.opShape
  const OW = f.opWithin
  const OU = f.opUnion
  const K = f.k
  const SOFT = f.soft
  const AM = f.amount
  const sd = (s: number, x: number, y: number, z: number): number => {
    const o = s * SS
    const dx = x - D[o],
      dy = y - D[o + 1],
      dz = z - D[o + 2]
    const lx = D[o + 3] * dx + D[o + 4] * dy + D[o + 5] * dz
    const ly = D[o + 6] * dx + D[o + 7] * dy + D[o + 8] * dz
    const lz = D[o + 9] * dx + D[o + 10] * dy + D[o + 11] * dz
    const m = D[o + 20]
    switch (ST[s]) {
      case SPHERE:
        return (Math.sqrt(lx * lx + ly * ly + lz * lz) - D[o + 12]) * m
      case ELLIPSOID: {
        const rx = D[o + 12],
          ry = D[o + 13],
          rz = D[o + 14]
        const ax = lx / rx,
          ay = ly / ry,
          az = lz / rz
        const k0 = Math.sqrt(ax * ax + ay * ay + az * az)
        const bx = ax / rx,
          by = ay / ry,
          bz = az / rz
        const k1 = Math.sqrt(bx * bx + by * by + bz * bz)
        if (k1 < 1e-9) return -Math.min(rx, ry, rz) * m
        return ((k0 * (k0 - 1)) / k1) * m
      }
      case ROUND_CONE: {
        const r1 = D[o + 12],
          r2 = D[o + 13],
          h = D[o + 14]
        const b = (r1 - r2) / h
        const a = Math.sqrt(1 - b * b)
        const qx = Math.sqrt(lx * lx + lz * lz)
        const k = -b * qx + a * ly
        if (k < 0) return (Math.sqrt(qx * qx + ly * ly) - r1) * m
        if (k > a * h) return (Math.sqrt(qx * qx + (ly - h) * (ly - h)) - r2) * m
        return (a * qx + b * ly - r1) * m
      }
      default:
        return shapeDist(f, s, x, y, z)
    }
  }
  return (list, n, x, y, z) => {
    let d = 1e9
    for (let li = 0; li < n; li++) {
      const i = list[li]
      const t = OT[i]
      if (t === PAINT) continue
      let di = sd(OS[i], x, y, z)
      const un = OU[i]
      if (un !== null) for (let k = 0; k < un.length; k++) di = Math.min(di, sd(un[k], x, y, z))
      const w = OW[i]
      if (w >= 0) {
        const e = sd(w, x, y, z)
        if (e > di) di = e
      }
      const k = K[i]
      if (t === ADD) {
        if (k > 0) {
          const h = Math.max(k - Math.abs(d - di), 0) / k
          d = Math.min(d, di) - h * h * k * 0.25
        } else if (di < d) d = di
      } else if (t === SUB) {
        const e = -di
        if (k > 0) {
          const h = Math.max(k - Math.abs(d - e), 0) / k
          d = Math.max(d, e) + h * h * k * 0.25
        } else if (e > d) d = e
      } else if (t === INTER) {
        if (k > 0) {
          const h = Math.max(k - Math.abs(d - di), 0) / k
          d = Math.max(d, di) + h * h * k * 0.25
        } else if (di > d) d = di
      } else {
        const s = SOFT[i]
        const u = Math.min(Math.max((di + s) / (2 * s), 0), 1)
        d -= AM[i] * (1 - u * u * (3 - 2 * u))
      }
    }
    return d
  }
}
