/**
 * The character rig toolkit: every character is a tree of parts (root → torso → head → ears …), each part a
 * `Frame` in which shapes are described in the part's own units and then painted wherever the pose puts the part.
 * Parts may move, turn and squash freely, and the light never turns with them: shading is done afterwards in
 * screen space (`cel`), so a head that nods or a body that tumbles is always lit from the top-left.
 *
 *   const root = Frame.at(32, 60)                       // the feet, on the anchor
 *   const torso = root.child(0, -11, pose.lean)         // hips → chest, leaning with the pose
 *   const head = torso.child(2, -17, pose.nod)          // the neck, nodding on its own
 *   g.add(0, (l) => {
 *     fill(l, head, union(squircle(0, 0, 17, 13.5), oval(-10, 5, 7, 6)), PINK[1])   // skull + cheek, one silhouette
 *     tint(l, head, oval(6, 8, 13, 7), CREAM[1])                                    // a patch, kept inside it
 *     cel(l, { shade: 3, deep: 1.2 })                                               // one light for both materials
 *     within(l, (m) => stampAt(m, head, EYE, 4, -10, EYE_KEY))                      // details stay on the part
 *   })
 *
 * Big furry bodies add `mantle()` (a second coat colour on the lit side) and teeth on the shadow's edge
 * (`cel(l, { ..., tooth, pitch, origin })`).
 *
 * Pure data code like raster.ts: it runs the same in Node and in browsers.
 */
import { DARKER, LIGHTER } from './palette'
import { Raster, type Pt } from './raster'

const RAD = Math.PI / 180

// ------------------------------------------------------------------------------------------------- frames

/** An affine part frame: local units (u to the right, v down) → screen pixels. */
export class Frame {
  /** x = a·u + c·v + e, y = b·u + d·v + f */
  private constructor(
    readonly a: number,
    readonly b: number,
    readonly c: number,
    readonly d: number,
    readonly e: number,
    readonly f: number
  ) {}

  /** A frame with its origin on the screen point (x, y), turned `deg` clockwise and scaled. */
  static at(x: number, y: number, deg = 0, sx = 1, sy = sx) {
    const cos = Math.cos(deg * RAD)
    const sin = Math.sin(deg * RAD)
    return new Frame(cos * sx, sin * sx, -sin * sy, cos * sy, x, y)
  }

  /** A part attached at the local point (u, v): turned `deg` clockwise relative to this frame, and scaled. */
  child(u: number, v: number, deg = 0, sx = 1, sy = sx) {
    const [x, y] = this.pt(u, v)
    const k = Frame.at(0, 0, deg, sx, sy)
    return new Frame(
      this.a * k.a + this.c * k.b,
      this.b * k.a + this.d * k.b,
      this.a * k.c + this.c * k.d,
      this.b * k.c + this.d * k.d,
      x,
      y
    )
  }

  /** The same frame moved by a screen offset (bobbing a part without turning it). */
  moved(dx: number, dy: number) {
    return new Frame(this.a, this.b, this.c, this.d, this.e + dx, this.f + dy)
  }

  /** Local point → screen. */
  pt(u: number, v: number): Pt {
    return [this.a * u + this.c * v + this.e, this.b * u + this.d * v + this.f]
  }

  /** Screen point → local. */
  local(x: number, y: number): Pt {
    const det = this.a * this.d - this.b * this.c
    const dx = x - this.e
    const dy = y - this.f
    return [(this.d * dx - this.c * dy) / det, (this.a * dy - this.b * dx) / det]
  }

  /** How far the frame's u axis is turned on screen, in degrees clockwise. */
  get angle() {
    return Math.atan2(this.b, this.a) / RAD
  }

  /** The nearest number of clockwise quarter turns (for stamps that follow a tumbling part). */
  get quarter() {
    return ((Math.round(this.angle / 90) % 4) + 4) % 4
  }
}

// ------------------------------------------------------------------------------------------------- shapes

/** A filled region in a frame's local units. */
export interface Shape {
  /** Bounds: [u0, v0, u1, v1]. */
  readonly box: readonly [number, number, number, number]
  has(u: number, v: number): boolean
}

export const oval = (cu: number, cv: number, ru: number, rv = ru): Shape => ({
  box: [cu - ru, cv - rv, cu + ru, cv + rv],
  has: (u, v) => ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2 <= 1.0001
})

/**
 * A superellipse: n = 2 is an oval, 2.4–3 a soft "mochi" box (heads, cheeks, bellies), 4+ nearly a rounded box.
 */
export const squircle = (cu: number, cv: number, ru: number, rv: number, n = 2.6): Shape => ({
  box: [cu - ru, cv - rv, cu + ru, cv + rv],
  has: (u, v) => Math.abs((u - cu) / ru) ** n + Math.abs((v - cv) / rv) ** n <= 1.0001
})

/** An oval whose upper and lower halves have different heights (eggs, pears, drops). */
export const egg = (cu: number, cv: number, ru: number, up: number, down: number): Shape => ({
  box: [cu - ru, cv - up, cu + ru, cv + down],
  has: (u, v) => ((u - cu) / ru) ** 2 + ((v - cv) / (v < cv ? up : down)) ** 2 <= 1.0001
})

/** A limb segment: a capsule from `a` to `b` whose radius runs from `ra` to `rb` (tapered when they differ). */
export function capsule(a: Pt, b: Pt, ra: number, rb = ra): Shape {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  return {
    box: [
      Math.min(a[0] - ra, b[0] - rb),
      Math.min(a[1] - ra, b[1] - rb),
      Math.max(a[0] + ra, b[0] + rb),
      Math.max(a[1] + ra, b[1] + rb)
    ],
    has(u, v) {
      const t = len2 ? Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / len2)) : 0
      const r = ra + (rb - ra) * t
      return (u - a[0] - dx * t) ** 2 + (v - a[1] - dy * t) ** 2 <= r * r + 1e-4
    }
  }
}

/** A polygon (even-odd rule). */
export function polygon(pts: readonly Pt[]): Shape {
  let u0 = Infinity
  let v0 = Infinity
  let u1 = -Infinity
  let v1 = -Infinity
  for (const [u, v] of pts) {
    u0 = Math.min(u0, u)
    v0 = Math.min(v0, v)
    u1 = Math.max(u1, u)
    v1 = Math.max(v1, v)
  }
  return {
    box: [u0, v0, u1, v1],
    has(u, v) {
      let inside = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[i]
        const [bx, by] = pts[j]
        if (ay > v !== by > v && u < ((bx - ax) * (v - ay)) / (by - ay) + ax) inside = !inside
      }
      return inside
    }
  }
}

/** Everything inside any of the shapes: build one silhouette from several volumes before shading it. */
export function union(...shapes: Shape[]): Shape {
  return {
    box: [
      Math.min(...shapes.map((s) => s.box[0])),
      Math.min(...shapes.map((s) => s.box[1])),
      Math.max(...shapes.map((s) => s.box[2])),
      Math.max(...shapes.map((s) => s.box[3]))
    ],
    has(u, v) {
      for (let i = 0; i < shapes.length; i++) if (shapes[i].has(u, v)) return true
      return false
    }
  }
}

/** `shape` without `hole`. */
export const minus = (shape: Shape, hole: Shape): Shape => ({
  box: shape.box,
  has: (u, v) => shape.has(u, v) && !hole.has(u, v)
})

/** Only where both shapes are. */
export const overlap = (a: Shape, b: Shape): Shape => ({
  box: [
    Math.max(a.box[0], b.box[0]),
    Math.max(a.box[1], b.box[1]),
    Math.min(a.box[2], b.box[2]),
    Math.min(a.box[3], b.box[3])
  ],
  has: (u, v) => a.has(u, v) && b.has(u, v)
})

/** Everything on one side of the line through `p` with normal (nu, nv): a straight cut across another shape. */
export const half = (p: Pt, nu: number, nv: number, reach = 200): Shape => ({
  box: [p[0] - reach, p[1] - reach, p[0] + reach, p[1] + reach],
  has: (u, v) => (u - p[0]) * nu + (v - p[1]) * nv >= 0
})

function scan(l: Raster, f: Frame, s: Shape, put: (x: number, y: number) => void) {
  const [u0, v0, u1, v1] = s.box
  if (!(u1 >= u0 && v1 >= v0)) return
  const corners = [f.pt(u0, v0), f.pt(u1, v0), f.pt(u0, v1), f.pt(u1, v1)]
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0]))) - 1)
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))) - 1)
  const x1 = Math.min(l.w - 1, Math.ceil(Math.max(...corners.map((p) => p[0]))) + 1)
  const y1 = Math.min(l.h - 1, Math.ceil(Math.max(...corners.map((p) => p[1]))) + 1)
  // The inverse transform, written out (the same arithmetic as `Frame.local`, without an array per pixel).
  const det = f.a * f.d - f.b * f.c
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - f.f
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - f.e
      if (s.has((f.d * dx - f.c * dy) / det, (f.a * dy - f.b * dx) / det)) put(x, y)
    }
  }
}

/** Paints a shape of the frame onto the layer (sampled at pixel centres). */
export function fill(l: Raster, f: Frame, s: Shape, c: number) {
  scan(l, f, s, (x, y) => l.set(x, y, c))
  return l
}

/** Paints a shape only where the layer is already painted: patches (belly, mask, stripes) never leave the silhouette. */
export function tint(l: Raster, f: Frame, s: Shape, c: number) {
  scan(l, f, s, (x, y) => {
    if (l.get(x, y)) l.set(x, y, c)
  })
  return l
}

/** Erases a shape from the layer (notches, open mouths cut into a silhouette). */
export function carve(l: Raster, f: Frame, s: Shape) {
  scan(l, f, s, (x, y) => l.set(x, y, 0))
  return l
}

/**
 * A hand-placed pixel grid that follows a part: its centre sits on the frame's local point (u, v) and the grid is
 * turned by the nearest quarter turn of the frame (eyes and emblems stay crisp while the part tilts or tumbles).
 */
export function stampAt(
  l: Raster,
  f: Frame,
  rows: readonly string[],
  u: number,
  v: number,
  key: Record<string, number>
) {
  let grid = [...rows]
  for (let n = f.quarter; n > 0; n--) {
    const h = grid.length
    const w = grid[0].length
    grid = Array.from({ length: w }, (_, r) => Array.from({ length: h }, (_, col) => grid[h - 1 - col][r]).join(''))
  }
  const [x, y] = f.pt(u, v)
  return l.stamp(grid, Math.round(x - grid[0].length / 2), Math.round(y - grid.length / 2), key)
}

/**
 * Draws with any tool, but keeps only what lands on the layer's painted pixels: eyes, scars, stripes, mouth
 * lines and highlights that must never leave the part they belong to. With `inset` the pixels on the part's very
 * edge are left alone too, so a light detail cannot turn the outline light.
 *
 *   within(l, (m) => stampAt(m, head, EYE, 4, -10, EYE_KEY))
 *   within(l, (m) => fill(m, head, oval(-2, -4.5, 2.6, 1.5), C.blush), true)
 */
export function within(l: Raster, draw: (scratch: Raster) => void, inset = false) {
  const scratch = new Raster(l.w, l.h)
  draw(scratch)
  const src = inset ? l.clone() : l
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      const c = scratch.get(x, y)
      if (!c || !src.get(x, y)) continue
      if (inset && !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1))) continue
      l.set(x, y, c)
    }
  return l
}

// ------------------------------------------------------------------------------------------------- curves

/** A Catmull–Rom spline through the points, as a polyline with a point about every half pixel. */
export function spline(pts: readonly Pt[]): Pt[] {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]] as Pt)
  const out: Pt[] = []
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 *
          (2 * p1[0] +
            (p2[0] - p0[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (p2[1] - p0[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3)
      ])
    }
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]])
  return out
}

/**
 * A band of changing width along a screen path (tails, scarves, capes, tongues): `width(t)` is the full width in
 * pixels at t = 0 (start) … 1 (end). Round at both ends; pass a spline for a smooth curve.
 */
export function ribbon(l: Raster, path: readonly Pt[], width: (t: number) => number, c: number) {
  if (!path.length) return l
  let total = 0
  const lengths = [0]
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    lengths.push(total)
  }
  const id = Frame.at(0, 0)
  for (let i = 0; i < path.length - 1; i++) {
    const ta = total ? lengths[i] / total : 0
    const tb = total ? lengths[i + 1] / total : 1
    fill(l, id, capsule(path[i], path[i + 1], Math.max(0.5, width(ta) / 2), Math.max(0.5, width(tb) / 2)), c)
  }
  if (path.length === 1) fill(l, id, oval(path[0][0], path[0][1], Math.max(0.5, width(0) / 2)), c)
  return l
}

/**
 * The middle joint of a two-bone limb (elbow, knee) from `a` toward `b`: bone lengths `l1` and `l2`, bending to
 * the left (`bend` = -1) or right (1) of the line a → b as seen on screen. A target out of reach is pulled in.
 */
export function joint(a: Pt, b: Pt, l1: number, l2: number, bend: 1 | -1): { mid: Pt; end: Pt } {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const far = Math.hypot(dx, dy) || 1e-6
  const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, far))
  const ux = dx / far
  const uy = dy / far
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const off = Math.sqrt(Math.max(0, l1 * l1 - along * along)) * bend
  return {
    mid: [a[0] + ux * along - uy * off, a[1] + uy * along + ux * off],
    end: [a[0] + ux * d, a[1] + uy * d]
  }
}

// ------------------------------------------------------------------------------------------------ shading

export interface CelOptions {
  /** Depth of the form shadow on the side away from the light, in pixels (0 = none). */
  shade?: number
  /** Depth of the darker accent inside the form shadow (0 = none). */
  deep?: number
  /** Depth of the lit rim on the side facing the light (0 = none). */
  rim?: number
  /** Where the light travels on screen (from the lamp toward the form). Default: down and a little right. */
  dir?: readonly [number, number]
  /**
   * Fur: the edge of the form shadow is cut into teeth `tooth` pixels deep and `pitch` pixels apart (0 = a smooth
   * edge, for skin, cloth and plush). Big furry bodies want it: a smooth shadow on 60 px of coat looks like vinyl.
   */
  tooth?: number
  pitch?: number
  /** A screen point that travels with the part, so the teeth stay on the fur while the part moves. */
  origin?: readonly [number, number]
}

/** The light of this game on screen: from the top-left, steeper than 45° so faces looking right stay bright. */
export const LIGHT_DIR: readonly [number, number] = [0.45, 0.89]

/**
 * Cel shading in screen space for a layer painted in base colours: a pixel turns one ramp step darker when the
 * silhouette ends within `shade` pixels behind it (seen from the light), two steps within `deep`, and one step
 * lighter when the silhouette begins within `rim` pixels in front of it. Works on any silhouette (union shapes,
 * limbs, squashed or turned parts) and on several materials at once: every pixel moves along its own ramp.
 * Paint faces, emblems and other flat details after shading.
 */
export function cel(l: Raster, o: CelOptions = {}) {
  const shade = o.shade ?? 0
  const deep = o.deep ?? 0
  const rim = o.rim ?? 0
  const [dx, dy] = o.dir ?? LIGHT_DIR
  const n = Math.hypot(dx, dy) || 1
  const ux = dx / n
  const uy = dy / n
  const tooth = o.tooth ?? 0
  const pitch = Math.max(2, o.pitch ?? 5)
  const [ox, oy] = o.origin ?? [0, 0]
  const src = l.clone()
  /** True when the silhouette ends within `depth` pixels of (x, y) along (sx, sy). */
  const ends = (x: number, y: number, depth: number, sx: number, sy: number) => {
    for (let t = 1; t < depth; t++) if (!src.get(Math.round(x + sx * t), Math.round(y + sy * t))) return true
    return !src.get(Math.round(x + sx * depth), Math.round(y + sy * depth))
  }
  /** 0..1 sawtooth across the light: a tooth rises slowly and drops at once, like a lock of fur. */
  const lock = (x: number, y: number) => {
    const across = ((x - Math.round(ox)) * -uy + (y - Math.round(oy)) * ux) / pitch
    return across - Math.floor(across)
  }
  const b = l.bounds()
  if (!b) return l
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const c = src.get(x, y)
      if (!c) continue
      const extra = tooth > 0 ? tooth * lock(x, y) : 0
      if (deep > 0 && ends(x, y, deep + extra * 0.5, ux, uy)) l.set(x, y, DARKER[DARKER[c]])
      else if (shade > 0 && ends(x, y, shade + extra, ux, uy)) l.set(x, y, DARKER[c])
      else if (rim > 0 && ends(x, y, rim + extra * 0.4, -ux, -uy)) l.set(x, y, LIGHTER[c])
    }
  return l
}

export interface MantleOptions {
  /** How far the second colour reaches into the form from its lit edge, in pixels. */
  depth: number
  /** Teeth of the lower edge, as in `CelOptions` (fur locks). */
  tooth?: number
  pitch?: number
  origin?: readonly [number, number]
  /** Direction the mantle hangs in (default: the light's). */
  dir?: readonly [number, number]
}

/**
 * A second coat colour lying on the lit side of a silhouette: a wolf's dark saddle, a fox's russet back, a boar's
 * bristle ridge, a cap of hair. Every pixel of colour `from` whose silhouette begins within `depth` pixels toward
 * the light becomes `to`; the lower edge can be cut into fur locks. Call it before `cel`, so both colours are
 * shaded along their own ramps.
 */
export function mantle(l: Raster, from: number, to: number, o: MantleOptions) {
  const [dx, dy] = o.dir ?? LIGHT_DIR
  const n = Math.hypot(dx, dy) || 1
  const ux = dx / n
  const uy = dy / n
  const tooth = o.tooth ?? 0
  const pitch = Math.max(2, o.pitch ?? 5)
  const [ox, oy] = o.origin ?? [0, 0]
  const src = l.clone()
  const b = l.bounds()
  if (!b) return l
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (src.get(x, y) !== from) continue
      const across = ((x - Math.round(ox)) * -uy + (y - Math.round(oy)) * ux) / pitch
      const depth = o.depth + tooth * (across - Math.floor(across))
      let open = false
      for (let t = 1; t <= depth && !open; t++) open = !src.get(Math.round(x - ux * t), Math.round(y - uy * t))
      if (open) l.set(x, y, to)
    }
  return l
}

/**
 * A cast shadow: every painted pixel of the layer inside `shape` (in frame `f`) turns one ramp step darker
 * (`steps` = 2 for two). Use it for the shadow a head throws on the chest, an arm on the belly, a hat on the brow.
 */
export function shadow(l: Raster, f: Frame, shape: Shape, steps = 1) {
  scan(l, f, shape, (x, y) => {
    let c = l.get(x, y)
    if (!c) return
    for (let i = 0; i < steps; i++) c = DARKER[c]
    l.set(x, y, c)
  })
  return l
}

/** A soft light patch: painted pixels inside `shape` turn one ramp step lighter (fur sheen, glossy cheeks). */
export function sheen(l: Raster, f: Frame, shape: Shape) {
  scan(l, f, shape, (x, y) => {
    const c = l.get(x, y)
    if (c) l.set(x, y, LIGHTER[c])
  })
  return l
}

/**
 * Cleans a silhouette the way a pixel artist does by hand: single pixels that stick out of an edge are removed
 * and single-pixel notches are filled, so curves step evenly. Run it on a part's layer before shading.
 */
export function smooth(l: Raster) {
  const src = l.clone()
  const n4 = (r: Raster, x: number, y: number) =>
    (r.get(x - 1, y) ? 1 : 0) + (r.get(x + 1, y) ? 1 : 0) + (r.get(x, y - 1) ? 1 : 0) + (r.get(x, y + 1) ? 1 : 0)
  const b = l.bounds()
  if (!b) return l
  for (let y = Math.max(0, b.y - 1); y < Math.min(l.h, b.y + b.h + 1); y++)
    for (let x = Math.max(0, b.x - 1); x < Math.min(l.w, b.x + b.w + 1); x++) {
      const c = src.get(x, y)
      if (c) {
        if (n4(src, x, y) <= 1) l.set(x, y, 0)
      } else if (n4(src, x, y) >= 3) {
        l.set(x, y, src.get(x - 1, y) || src.get(x + 1, y) || src.get(x, y - 1) || src.get(x, y + 1))
      }
    }
  return l
}
