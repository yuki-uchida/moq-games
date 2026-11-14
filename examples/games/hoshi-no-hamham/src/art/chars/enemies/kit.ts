/**
 * What the ばくろ団 gang shares on the rig toolkit (rig.ts): the red bandana (a neckerchief with its triangle on the
 * chest, the knot at the back of the neck and two short tails) and a wavy path for tails and cloth ends.
 *
 *   const neck = torso.child(1.5, -9.5)                        // u points to the character's front, v down
 *   const knot = neck.pt(...BANDANA_FIT.back)
 *   g.add(-4, (l) => bandanaTail(l, knot, 30, 7, 1, phase, true))   // far tail, behind the body
 *   g.add(-3.9, (l) => bandanaTail(l, knot, 10, 8, 1, phase))       // near tail
 *   g.add(1, (l) => neckerchief(l, neck))                           // band + triangle, over the chest
 *   g.add(1.1, (l) => bandanaKnot(l, knot))                         // the knot, over the band
 *
 * Independent of any one gang member: every size is a parameter in the neck frame's units.
 */
import { R } from '../../palette'
import { farRamp, type Pt, type Raster, type Ramp } from '../../raster'
import { Frame, cel, fill, oval, polygon, ribbon, spline } from '../../rig'

/** The gang's red. */
export const BANDANA: Ramp = R.bandana
/** The same red one step darker, for the far tail. */
export const BANDANA_FAR: Ramp = farRamp(R.bandana)

/** Where the neckerchief sits in a neck frame (u toward the character's front, v down). */
export interface BandanaFit {
  /** The knot at the back of the neck. */
  back: Pt
  /** Where the band disappears under the chin. */
  front: Pt
  /** How far the band sags between them. */
  sag: number
  /** Band width in pixels. */
  width: number
  /** The triangle on the chest: where it starts along the band (0 = back, 1 = front) and its tip. */
  from: number
  tip: Pt
}

/** A fit for a small gang member (64 px cell). */
export const BANDANA_FIT: BandanaFit = {
  back: [-6.5, -3],
  front: [6.5, -2],
  sag: 1.6,
  width: 3.6,
  from: 0.3,
  tip: [3.5, 6.5]
}

/**
 * A wavy path from `root`: `angle` in degrees (0 = straight back, i.e. screen left; 90 = straight down; −90 up),
 * `len` long, rippling sideways by `amp` pixels (growing toward the tip) with `waves` half-waves along its length
 * at `phase` radians. Use it for tails and cloth ends; advance `phase` to send a wave down the path.
 */
export function wavePath(root: Pt, angle: number, len: number, amp: number, phase: number, waves = 1.2): Pt[] {
  const a = (angle * Math.PI) / 180
  const dir: Pt = [-Math.cos(a), Math.sin(a)]
  const perp: Pt = [-dir[1], dir[0]]
  const pts: Pt[] = []
  for (let i = 0; i <= 5; i++) {
    const s = i / 5
    const w = amp * Math.sin(phase - s * Math.PI * waves) * Math.min(1, s * 1.8)
    pts.push([root[0] + dir[0] * len * s + perp[0] * w, root[1] + dir[1] * len * s + perp[1] * w])
  }
  return spline(pts)
}

/** The band around the neck and the triangle hanging on the chest, shaded with a rim of light. */
export function neckerchief(l: Raster, neck: Frame, fit: BandanaFit = BANDANA_FIT, tone: Ramp = BANDANA) {
  const [bu, bv] = fit.back
  const [fu, fv] = fit.front
  const mid: Pt = [(bu + fu) / 2, (bv + fv) / 2 + fit.sag]
  const band = spline([neck.pt(bu, bv), neck.pt(mid[0], mid[1]), neck.pt(fu, fv)])
  ribbon(l, band, () => fit.width, tone[1])
  const s = fit.from
  const start: Pt = [bu + (fu - bu) * s, bv + (fv - bv) * s + fit.sag * 0.8]
  fill(l, neck, polygon([start, [fu + 0.5, fv], fit.tip]), tone[1])
  cel(l, { shade: 1.4, rim: 1 })
  return l
}

/** The knot at the back of the neck. */
export function bandanaKnot(l: Raster, at: Pt, r = 2.2, tone: Ramp = BANDANA) {
  fill(l, Frame.at(at[0], at[1]), oval(0, 0, r, r * 0.9), tone[1])
  cel(l, { shade: 1.1, rim: 1 })
  return l
}

/**
 * One tail of the knot: a band that widens a little toward its cut end (see `wavePath` for angle and ripple).
 * Draw the far tail first with `far` and a steeper angle, behind the body.
 */
export function bandanaTail(l: Raster, at: Pt, angle: number, len: number, ripple: number, phase: number, far = false) {
  const tone = far ? BANDANA_FAR : BANDANA
  ribbon(l, wavePath(at, angle, len, ripple, phase), (t) => (far ? 2.2 : 2.6) + t * 0.8, tone[1])
  cel(l, { shade: 1.1, rim: far ? 0 : 1 })
  return l
}
