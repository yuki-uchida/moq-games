/**
 * SDF sculpting: a model is an ordered list of operations on signed-distance shapes.
 *
 * - `add` smooth-unions a shape (blend radius `k`) and brings its colour, mask and bone.
 * - `sub` smooth-subtracts a shape (optionally colouring the cut).
 * - `inter` smooth-intersects the model so far with a shape.
 * - `paint` changes colour/mask inside a region without changing the shape (markings, patches, socks).
 * - `emboss` raises the surface by `amount` inside a region (straps, seams) and can paint it too.
 *
 * Shapes are plain descriptors built by the helpers below; `compileField` (field.ts) turns a Sculpt into typed
 * arrays for fast evaluation. Every distance is in metres; colours are sRGB hex numbers.
 */

export type Vec3 = readonly [number, number, number]

export const ShapeType = {
  Sphere: 0,
  Ellipsoid: 1,
  RoundCone: 2,
  RoundBox: 3,
  Torus: 4,
  Cylinder: 5,
  /** Half-space below a plane. */
  Plane: 6,
  Slab: 7,
  /** A shell of an ellipsoid: |ellipsoid| − thickness (straps that hug a body). */
  Shell: 8,
  /** Torus segment (an arc) in the local XZ plane, opening angle ±params[2] around +Z. */
  Arc: 9
} as const
export type ShapeType = (typeof ShapeType)[keyof typeof ShapeType]

export interface Shape {
  type: ShapeType
  /** Centre / origin in model space. */
  c: Vec3
  /** Rows of the world→local rotation (orthonormal). */
  rot: [Vec3, Vec3, Vec3]
  params: number[]
  /** Bounding sphere radius around `c` (Infinity for planes). */
  radius: number
  /** Non-uniform scale of the local frame (flattened cones, squashed boxes). */
  scale?: Vec3
}

export const OpType = { Add: 0, Sub: 1, Inter: 2, Paint: 3, Emboss: 4 } as const
export type OpType = (typeof OpType)[keyof typeof OpType]

/** Mask channels: x team trim, y anima glow, z armour (recoloured by looks), w animated glow. */
export type Mask = readonly [number, number, number, number]

export interface OpOptions {
  /** Smooth blend radius of add/sub/inter (m). */
  k?: number
  color?: number
  mask?: Mask
  bone?: string
  /** Colour blend width across seams (default 0.35·k, at least 3 mm). */
  ck?: number
  /** Skin-weight falloff (default 0.25·k + 4 mm). */
  wk?: number
  /** Paint/emboss edge softness (m). */
  soft?: number
  /** Emboss height (m). */
  amount?: number
  /** Paint: only where the summed skin weight of these bones is high. */
  bones?: string[]
  /** Paint opacity 0..1. */
  alpha?: number
  /**
   * Soft blend (blush, shading tints): mixes into every colour layer with a smooth edge instead of becoming a
   * crisp marking whose edge the shader thresholds. Default: true when alpha < 1.
   */
  fuzzy?: boolean
  /** Restrict a paint/emboss/sub region to the inside of this shape too. */
  within?: Shape
  /** More shapes unioned into the region (one op, one consistent colour ramp for same-colour markings). */
  union?: Shape[]
}

export interface Op {
  type: OpType
  shape: Shape
  within?: Shape
  union?: Shape[]
  k: number
  color?: number
  mask?: Mask
  bone?: string
  ck: number
  wk: number
  soft: number
  amount: number
  bones?: string[]
  alpha: number
  fuzzy: boolean
}

// ------------------------------------------------------------------------------------------------ rotations

const IDENTITY: [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
]

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const norm = (v: Vec3): Vec3 => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Rows of the world→local matrix for Euler angles (XYZ order, radians) applied to the shape. */
export function eulerRows(rx: number, ry: number, rz: number): [Vec3, Vec3, Vec3] {
  const a = Math.cos(rx),
    b = Math.sin(rx),
    c = Math.cos(ry),
    d = Math.sin(ry),
    e = Math.cos(rz),
    f = Math.sin(rz)
  // Local→world matrix of THREE's Euler 'XYZ': columns are the local axes in world space.
  const ae = a * e,
    af = a * f,
    be = b * e,
    bf = b * f
  const m00 = c * e,
    m01 = -c * f,
    m02 = d
  const m10 = af + be * d,
    m11 = ae - bf * d,
    m12 = -b * c
  const m20 = bf - ae * d,
    m21 = be + af * d,
    m22 = a * c
  // world→local = transpose.
  return [
    [m00, m10, m20],
    [m01, m11, m21],
    [m02, m12, m22]
  ]
}

/** Rows of a world→local frame whose local +Y points along `dir` (the roll is chosen stably). */
export function alongRows(dir: Vec3, hint: Vec3 = [0, 0, 1]): [Vec3, Vec3, Vec3] {
  const y = norm(dir)
  let h = hint
  if (Math.abs(dot(y, norm(h))) > 0.95) h = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]
  const x = norm(cross(y, h))
  const z = cross(x, y)
  return [x, y, z]
}

type Rot = readonly [number, number, number] | [Vec3, Vec3, Vec3] | undefined

function rows(rot: Rot): [Vec3, Vec3, Vec3] {
  if (!rot) return IDENTITY
  if (typeof rot[0] === 'number') {
    const r = rot as readonly [number, number, number]
    return eulerRows(r[0], r[1], r[2])
  }
  return rot as [Vec3, Vec3, Vec3]
}

// --------------------------------------------------------------------------------------------------- shapes

export const sphere = (c: Vec3, r: number): Shape => ({
  type: ShapeType.Sphere,
  c,
  rot: IDENTITY,
  params: [r],
  radius: r
})

export const ellipsoid = (c: Vec3, r: Vec3, rot?: Rot): Shape => ({
  type: ShapeType.Ellipsoid,
  c,
  rot: rows(rot),
  params: [r[0], r[1], r[2]],
  radius: Math.max(r[0], r[1], r[2])
})

/** Rounded cone from `a` (radius ra) to `b` (radius rb); a capsule when ra = rb. */
export function cone(a: Vec3, b: Vec3, ra: number, rb: number, hint?: Vec3): Shape {
  const d = sub3(b, a)
  let h = len(d)
  if (h < 1e-6) return sphere(a, Math.max(ra, rb))
  // The exact round-cone distance needs |ra − rb| < h.
  if (Math.abs(ra - rb) >= h * 0.98) {
    if (ra > rb) rb = ra - h * 0.98
    else ra = rb - h * 0.98
  }
  h = len(d)
  return {
    type: ShapeType.RoundCone,
    c: a,
    rot: alongRows(d, hint),
    params: [ra, rb, h],
    radius: h + Math.max(ra, rb)
  }
}

export const capsule = (a: Vec3, b: Vec3, r: number, hint?: Vec3): Shape => cone(a, b, r, r, hint)

/** Rounded box with half extents `h` (the rounding is inside the extents). */
export const box = (c: Vec3, h: Vec3, round = 0, rot?: Rot): Shape => ({
  type: ShapeType.RoundBox,
  c,
  rot: rows(rot),
  params: [Math.max(h[0] - round, 1e-5), Math.max(h[1] - round, 1e-5), Math.max(h[2] - round, 1e-5), round],
  radius: len(h)
})

/** Torus around the local Y axis (ring in the local XZ plane). */
export const torus = (c: Vec3, R: number, r: number, rot?: Rot): Shape => ({
  type: ShapeType.Torus,
  c,
  rot: rows(rot),
  params: [R, r],
  radius: R + r
})

/** Arc of a torus around local Y, centred on local +Z, spanning ±half (radians). */
export const arc = (c: Vec3, R: number, r: number, half: number, rot?: Rot): Shape => ({
  type: ShapeType.Arc,
  c,
  rot: rows(rot),
  params: [R, r, Math.sin(half), Math.cos(half)],
  radius: R + r
})

/** Capped cylinder along local Y: radius r, half height h, edge rounding. */
export const cylinder = (c: Vec3, r: number, h: number, round = 0, rot?: Rot): Shape => ({
  type: ShapeType.Cylinder,
  c,
  rot: rows(rot),
  params: [r, h, Math.min(round, r, h)],
  radius: Math.hypot(r, h)
})

/** Half-space: negative on the side opposite to `n` (i.e. the region "below" the plane). */
export const plane = (p: Vec3, n: Vec3): Shape => ({
  type: ShapeType.Plane,
  c: p,
  rot: alongRows(n),
  params: [],
  radius: Infinity
})

/** A slab of half width `w` around the plane through `p` with normal `n`. */
export const slab = (p: Vec3, n: Vec3, w: number): Shape => ({
  type: ShapeType.Slab,
  c: p,
  rot: alongRows(n),
  params: [w],
  radius: Infinity
})

/** Ellipsoid shell of half thickness t (for bands hugging a body when intersected with a slab). */
export const shell = (c: Vec3, r: Vec3, t: number, rot?: Rot): Shape => ({
  type: ShapeType.Shell,
  c,
  rot: rows(rot),
  params: [r[0], r[1], r[2], t],
  radius: Math.max(r[0], r[1], r[2]) + t
})

/** Scales a shape in its own local frame (e.g. [1, 1, 0.4] flattens a cone front-to-back). */
export const scaled = (shape: Shape, s: Vec3): Shape => {
  const prev = shape.scale ?? [1, 1, 1]
  return { ...shape, scale: [prev[0] * s[0], prev[1] * s[1], prev[2] * s[2]], radius: shape.radius * Math.max(1, ...s) }
}

// -------------------------------------------------------------------------------------------------- builder

export class Sculpt {
  readonly ops: Op[] = []

  private push(type: OpType, shape: Shape, o: OpOptions = {}): this {
    const k = o.k ?? 0
    this.ops.push({
      type,
      shape,
      within: o.within,
      union: o.union,
      k,
      color: o.color,
      mask: o.mask,
      bone: o.bone,
      ck: o.ck ?? Math.max(0.003, k * 0.35),
      wk: o.wk ?? k * 0.25 + 0.004,
      soft: o.soft ?? 0.004,
      amount: o.amount ?? 0,
      bones: o.bones,
      alpha: o.alpha ?? 1,
      fuzzy: o.fuzzy ?? (o.alpha !== undefined && o.alpha < 1)
    })
    return this
  }

  add(shape: Shape, o: OpOptions = {}): this {
    return this.push(OpType.Add, shape, o)
  }
  sub(shape: Shape, o: OpOptions = {}): this {
    return this.push(OpType.Sub, shape, o)
  }
  inter(shape: Shape, o: OpOptions = {}): this {
    return this.push(OpType.Inter, shape, o)
  }
  paint(shape: Shape, o: OpOptions): this {
    return this.push(OpType.Paint, shape, o)
  }
  emboss(shape: Shape, o: OpOptions): this {
    return this.push(OpType.Emboss, shape, o)
  }

  /** Calls `fn` for the left (+1, +X) and right (−1, −X) side with the side letter for bone names. */
  mirror(fn: (side: 1 | -1, s: 'L' | 'R') => void): this {
    fn(1, 'L')
    fn(-1, 'R')
    return this
  }

  /** Appends another sculpt's operations (shared parts such as the uniform). */
  append(other: Sculpt): this {
    this.ops.push(...other.ops)
    return this
  }
}

/** Mirror a point across the YZ plane (left ↔ right). */
export const mx = (p: Vec3, side: number): Vec3 => [p[0] * side, p[1], p[2]]
