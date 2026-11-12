/**
 * Helpers shared by the antique recipes. Conventions: the paw holds the origin, +Z points to the muzzle / blade
 * tip, +Y is up; sizes are metres for a 1.2 m animal (the character scales held antiques per species).
 * Accent lines use the glow mask so they shine in the antique's ITEMS colour.
 */
import { capsule, type Mask, type Sculpt, sphere, type Vec3 } from '../sdf/sculpt'

export const GLOW: Mask = [0, 1, 0, 0]
/** Animated glow channel (eyes lighting up, charge, crackle). */
export const GLOW2: Mask = [0, 0, 0, 1]
export const INK = 0x2a2230
export const WHITE = 0xfff8ef

/** Two glossy bead eyes with highlights at ±x around `c`, looking along `dir` (unit, default +Z). */
export function beadEyes(s: Sculpt, c: Vec3, spread: number, r: number, dir: Vec3 = [0, 0, 1], color = INK): void {
  for (const side of [1, -1]) {
    const p: Vec3 = [c[0] + spread * side, c[1], c[2]]
    s.add(sphere(p, r), { color, k: r * 0.3 })
    s.paint(sphere([p[0] + dir[0] * r * 0.8 - r * 0.3, p[1] + r * 0.35, p[2] + dir[2] * r * 0.8], r * 0.32), {
      color: WHITE
    })
  }
}

/** A gun grip below the origin for the paw (slightly raked back). */
export function grip(s: Sculpt, color: number, len = 0.075, r = 0.022): void {
  s.add(capsule([0, 0.01, 0.0], [0, -len, -0.022], r), { color, k: 0.01 })
}
