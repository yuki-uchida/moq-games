/**
 * Shared palette, sculpt pieces and pose helpers of the 蝕機 (machines, DESIGN §11): pearl-white ceramic plates
 * over a graphite frame, cyan light seams (VEIN), single lens eyes (EYE) and red warning lights (HOT).
 *
 * Per-instance light effects only exist through part matrices: a lens part retracts into its socket to go dark,
 * a spark part (HOT shards) flickers in and out with a random turn, a charge part grows out of the body.
 * Every helper here is allocation-free (module scratch matrices).
 */
import * as THREE from 'three'
import type { FoeAnim } from '../../api'
import { cone, ellipsoid, slab, Sculpt, type OpOptions, type Shape, type Vec3 } from '../../sdf/sculpt'
import { EYE, HOT, VEIN } from '../material'
import { chain, hash, pivotMatrix, sizeJitter, TAU } from '../rigging'

/** Pearl ceramic (main plates). */
export const PEARL = 0xf4f1ea
/** Cool secondary plates. */
export const PEARL_2 = 0xd9dee8
/** Graphite frame, joints and visors. */
export const GRAPHITE = 0x2b303e
/** Mid steel (pistons, axles). */
export const STEEL = 0x77819a
/** Panel lines on the ceramic. */
export const LINE = 0x9fa8b8
/** Light seams (VEIN mask: pulsing cyan). */
export const SEAM_C = 0xd8fdff
/** Lens glass (EYE mask: steady cyan). */
export const LENS_C = 0xf2ffff
/** Lens socket. */
export const BEZEL = 0x12151e
/** Warning lights (HOT mask: red). */
export const WARN_C = 0xffb4a4

/** Paints a cyan light seam: the slab through `p` with normal `n`, clipped to `within`. */
export function seam(s: Sculpt, p: Vec3, n: Vec3, w: number, within: Shape): void {
  s.paint(slab(p, n, w), { color: SEAM_C, mask: VEIN, within })
}

/**
 * Paints one marking over several shapes. The shader evaluates at most 4 shapes per region (sdf/regions.ts), so
 * longer lists become several regions of the same colour.
 */
export function paintAll(s: Sculpt, shapes: Shape[], o: OpOptions): void {
  for (let i = 0; i < shapes.length; i += 4) s.paint(shapes[i], { ...o, union: shapes.slice(i + 1, i + 4) })
}

/** Paints a panel line (a thin darker groove colour) on the ceramic. */
export function panelLine(s: Sculpt, p: Vec3, n: Vec3, w: number, within: Shape): void {
  s.paint(slab(p, n, w), { color: LINE, within })
}

/** A lens part: a flattened glowing dome facing +Z with a darker iris ring and a bright core. */
export function lensSculpt(c: Vec3, r: number, depth = 0.5): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid(c, [r, r, r * depth]), { color: LENS_C, mask: EYE })
  s.paint(ellipsoid([c[0], c[1], c[2] + r * depth * 0.7], [r * 0.62, r * 0.62, r * 0.4]), {
    color: 0x7fe6f2,
    mask: EYE
  })
  s.paint(ellipsoid([c[0], c[1], c[2] + r * depth * 0.9], [r * 0.3, r * 0.3, r * 0.3]), {
    color: 0xffffff,
    mask: EYE
  })
  return s
}

/**
 * Spark shards for stagger / damage flicker: `n` small HOT spikes spread over a sphere around `c` (golden
 * spiral), pointing outwards.
 */
export function sparkSculpt(c: Vec3, r: Vec3, n = 7, len = 0.09): Sculpt {
  const s = new Sculpt()
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 1.6
    const rr = Math.sqrt(Math.max(0, 1 - y * y))
    const a = i * 2.39996
    const d: Vec3 = [Math.cos(a) * rr, y, Math.sin(a) * rr]
    const p: Vec3 = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]]
    const l = len * (0.7 + 0.6 * (((i * 37) % 10) / 10))
    s.add(cone(p, [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l], len * 0.22, len * 0.06), {
      color: WARN_C,
      mask: HOT,
      k: 0.004
    })
  }
  return s
}

// ------------------------------------------------------------------------------------------------- posing

/** Scale that hides a part (finite, collapses it into its pivot). */
export const GONE = 1e-4

const _root = new THREE.Matrix4()

/** Starts a pose: the per-foe size jitter as the root every part is chained to. */
export function beginPose(a: FoeAnim): THREE.Matrix4 {
  const j = sizeJitter(a)
  return _root.makeScale(j, j, j)
}

/** Chains every part matrix to the root (call last). */
export function endPose(out: THREE.Matrix4[], n: number, root: THREE.Matrix4): void {
  for (let i = 0; i < n; i++) chain(out[i], root)
}

/** Collapses a part into `(x, y, z)` (hidden). */
export function hidePart(out: THREE.Matrix4, x: number, y: number, z: number): THREE.Matrix4 {
  return pivotMatrix(out, x, y, z, 0, 0, 0, 0, 0, 0, GONE, GONE, GONE)
}

/** Deterministic flicker: true for `duty` of the slots of length 1/rate. */
export function flicker(a: FoeAnim, rate: number, duty: number, salt = 0): boolean {
  return hash(a.seed * 13.7 + salt, Math.floor(a.time * rate)) < duty
}

/**
 * Spark part: on = shards around `(cx, cy, cz)` with a random turn per flicker slot; off = hidden.
 * `level` 0..1 scales the chance a slot is lit.
 */
export function sparkPose(out: THREE.Matrix4, a: FoeAnim, cx: number, cy: number, cz: number, level: number): void {
  const slot = Math.floor(a.time * 24)
  const lit = level > 0 && hash(a.seed * 7.3 + 1, slot) < level
  if (!lit) {
    hidePart(out, cx, cy, cz)
    return
  }
  const h1 = hash(a.seed * 3.1 + 2, slot)
  const h2 = hash(a.seed * 5.9 + 3, slot)
  const k = 0.65 + 0.6 * hash(a.seed * 2.3 + 4, slot)
  pivotMatrix(out, cx, cy, cz, 0, 0, 0, (h1 - 0.5) * 1.4, h2 * TAU, (h2 - 0.5) * 1.2, k, k, k)
}

/** High-frequency shudder (stagger, death throes): returns a signed −1..1 jitter. */
export const shudder = (a: FoeAnim, freq: number, salt = 0) =>
  Math.sin(a.time * freq + a.seed * 31 + salt) * 0.6 + Math.sin(a.time * freq * 1.73 + salt * 2.1) * 0.4

/** Exponential decay pulse that starts at `t0` (0 before). */
export const kick = (t: number, t0: number, rate: number) => (t < t0 ? 0 : Math.exp(-(t - t0) * rate))
