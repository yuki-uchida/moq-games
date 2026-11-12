/** Shared palette and sculpt helpers of the 蝕獣 (creatures). */
import { capsule, slab, sphere, type Sculpt, type Shape, type Vec3 } from '../../sdf/sculpt'
import { EYE, MATTE, VEIN } from '../material'

/** Glossy indigo-black chitin. */
export const CHITIN = 0x241e38
/** Lighter plate tops (catch the light). */
export const PLATE = 0x3a3260
/** Joints and grooves. */
export const JOINT = 0x110e1e
/** Soft underside. */
export const BELLY = 0x4a3f62
/** Vein colour (the VEIN mask makes it glow violet). */
export const VEIN_C = 0xe2c6ff
/** Eye-core colour (EYE mask: orange glow). */
export const EYE_C = 0xffc070
/** Pale violet bone (mandible tips, teeth, claws). */
export const BONE = 0xc4b2e2

/**
 * A glowing vein where a thin slab (plane through `p`, normal `n`, half width `w`) cuts the surface, limited to
 * `within`: plane cuts always land on the surface, so the line follows the body's curvature exactly.
 */
export function veinCut(s: Sculpt, p: Vec3, n: Vec3, w: number, within: Shape): void {
  s.paint(slab(p, n, w), { color: VEIN_C, mask: VEIN, within })
}

/** A glowing vein line on the surface: capsules through the points (each painted region ≈ 2·r wide). */
export function vein(s: Sculpt, pts: Vec3[], r: number): void {
  const shapes = []
  for (let i = 0; i + 1 < pts.length; i++) shapes.push(capsule(pts[i], pts[i + 1], r))
  s.paint(shapes[0], { color: VEIN_C, mask: VEIN, union: shapes.slice(1) })
}

/** A glowing eye-core: a glossy dark socket bead with a bright orange core facing `dir`. */
export function eyeCore(s: Sculpt, p: Vec3, r: number, dir: Vec3 = [0, 0, 1]): void {
  s.add(sphere(p, r), { color: JOINT, k: r * 0.4 })
  s.paint(sphere([p[0] + dir[0] * r * 0.55, p[1] + dir[1] * r * 0.55, p[2] + dir[2] * r * 0.55], r * 0.78), {
    color: EYE_C,
    mask: EYE
  })
}

/** Pale matte tip (claws, teeth). */
export function boneTip(s: Sculpt, c: Vec3, r: number): void {
  s.paint(sphere(c, r), { color: BONE, mask: MATTE })
}
