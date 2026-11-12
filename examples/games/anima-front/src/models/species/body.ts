/**
 * Shared sculpting blocks for the playable animals: the chibi torso, legs, arms, head base and the ARK uniform.
 * Every recipe works in fractions of the body height H through `P()` so all species share one style.
 */
import type { BodyPlan } from '../rig'
import { compileField } from '../sdf/field'
import { traceSurface } from '../sdf/mesher'
import {
  box,
  cone,
  cylinder,
  ellipsoid,
  plane,
  type Mask,
  scaled,
  Sculpt,
  slab,
  sphere,
  torus,
  type Vec3
} from '../sdf/sculpt'

export const NAVY = 0x27355f
export const NAVY_DARK = 0x1c2647
export const CORE = 0xffa040
export const TRIM_BASE = 0xffffff
export const BLUSH = 0xff8fa3

/** Mask presets. */
export const M_ARMOR: Mask = [0, 0, 1, 0]
export const M_TRIM: Mask = [1, 0, 0, 0]
export const M_GLOW: Mask = [0, 1, 0, 0]
export const M_NONE: Mask = [0, 0, 0, 0]

export interface Look {
  fur: number
  /** Belly/chest patch colour (undefined = none). */
  belly?: number
  /** Paw/foot colour (socks). */
  paws?: number
  /** Pads under the feet. */
  pads?: number
}

/** Helper bound to a body height: P(x, y, z) = [x·H, y·H, z·H]. */
export const scaler =
  (H: number) =>
  (x: number, y: number, z: number): Vec3 => [x * H, y * H, z * H]

export interface TorsoParams {
  /** Chest ellipsoid centre y and radii (fractions of H). */
  chestY?: number
  chestR?: Vec3
  bellyY?: number
  bellyR?: Vec3
  hipsR?: Vec3
}

/** Round chibi torso: chest, belly and hips blended into one pear. */
export function torso(s: Sculpt, plan: BodyPlan, look: Look, t: TorsoParams = {}): void {
  const P = scaler(plan.H)
  const H = plan.H
  const cr = t.chestR ?? [0.16, 0.17, 0.14]
  const br = t.bellyR ?? [0.165, 0.14, 0.15]
  const hr = t.hipsR ?? [0.15, 0.1, 0.135]
  s.add(ellipsoid(P(0, t.chestY ?? 0.45, 0), P(cr[0], cr[1], cr[2])), { color: look.fur, bone: 'chest' })
  s.add(ellipsoid(P(0, t.bellyY ?? 0.35, 0.012), P(br[0], br[1], br[2])), {
    color: look.fur,
    bone: 'spine',
    k: 0.08 * H
  })
  s.add(ellipsoid(P(0, 0.265, -0.008), P(hr[0], hr[1], hr[2])), { color: look.fur, bone: 'hips', k: 0.07 * H })
}

export interface LimbParams {
  armR?: [number, number, number]
  pawR?: number
  legR?: [number, number, number]
  foot?: Vec3
  /** Foot centre offset from the ankle (fractions of H). */
  footOff?: Vec3
}

/** Stubby arms with mitten paws (bones upperArm/lowerArm/paw). */
export function arms(s: Sculpt, plan: BodyPlan, look: Look, p: LimbParams = {}): void {
  const H = plan.H
  const L = plan.layout
  const [r0, r1, r2] = p.armR ?? [0.052, 0.046, 0.043]
  const pawR = p.pawR ?? 0.058
  s.mirror((_side, S) => {
    const sh = L[`upperArm${S}`],
      el = L[`lowerArm${S}`],
      wr = L[`paw${S}`]
    s.add(cone(sh, el, r0 * H, r1 * H), { color: look.fur, bone: `upperArm${S}`, k: 0.02 * H, wk: 0.005 * H })
    s.add(cone(el, wr, r1 * H, r2 * H), { color: look.fur, bone: `lowerArm${S}`, k: 0.02 * H, wk: 0.006 * H })
    const pc: Vec3 = [wr[0] + (wr[0] - el[0]) * 0.35, wr[1] - 0.012 * H, wr[2] + 0.01 * H]
    s.add(ellipsoid(pc, [pawR * H, pawR * 0.92 * H, pawR * H]), {
      color: look.paws ?? look.fur,
      bone: `paw${S}`,
      k: 0.025 * H,
      wk: 0.006 * H
    })
  })
}

/** Short legs with round feet flattened on the ground. */
export function legs(s: Sculpt, plan: BodyPlan, look: Look, p: LimbParams = {}): void {
  const H = plan.H
  const L = plan.layout
  const [r0, r1, r2] = p.legR ?? [0.07, 0.06, 0.056]
  const foot = p.foot ?? [0.064, 0.05, 0.088]
  const off = p.footOff ?? [0, -0.01, 0.035]
  s.mirror((_side, S) => {
    const hip = L[`thigh${S}`],
      knee = L[`shin${S}`],
      ankle = L[`foot${S}`]
    s.add(cone(hip, knee, r0 * H, r1 * H), { color: look.fur, bone: `thigh${S}`, k: 0.03 * H, wk: 0.01 * H })
    s.add(cone(knee, ankle, r1 * H, r2 * H), { color: look.paws ?? look.fur, bone: `shin${S}`, k: 0.02 * H })
    s.add(
      ellipsoid([ankle[0], ankle[1] + off[1] * H, ankle[2] + off[2] * H], [foot[0] * H, foot[1] * H, foot[2] * H]),
      { color: look.paws ?? look.fur, bone: `foot${S}`, k: 0.03 * H }
    )
  })
  // Flat soles.
  s.sub(plane([0, 0.002 * H, 0], [0, 1, 0]), { k: 0.012 * H, color: look.pads })
}

export interface HeadParams {
  /** Cheek puff radius and position (fractions of H). */
  cheekR?: number
  cheek?: Vec3
  cheekColor?: number
}

/** Head ellipsoid with puffy cheeks (bone head). */
export function head(s: Sculpt, plan: BodyPlan, look: Look, p: HeadParams = {}): void {
  const H = plan.H
  const P = scaler(H)
  s.add(ellipsoid(plan.headC, plan.headR), { color: look.fur, bone: 'head', k: 0.06 * H, wk: 0.018 * H })
  const cr = p.cheekR ?? 0.1
  const ch = p.cheek ?? [0.125, 0.72, 0.075]
  s.mirror((side) => {
    s.add(sphere(P(ch[0] * side, ch[1], ch[2]), cr * H), {
      color: p.cheekColor ?? look.fur,
      bone: 'head',
      k: 0.07 * H
    })
  })
}

/** Soft pink blush on both cheeks (paint only). */
export function blush(s: Sculpt, plan: BodyPlan, at: Vec3, r = 0.045, alpha = 0.55): void {
  const P = scaler(plan.H)
  s.mirror((side) => {
    s.paint(ellipsoid(P(at[0] * side, at[1], at[2]), P(r, r * 0.65, r)), {
      color: BLUSH,
      soft: 0.02 * plan.H,
      alpha
    })
  })
}

/** A flattened triangular ear (two bones) with a carved inner ear. */
export function triEar(
  s: Sculpt,
  plan: BodyPlan,
  o: {
    base: Vec3
    tip: Vec3
    r0: number
    r1: number
    flat?: number
    color: number
    inner?: number
    tipColor?: number
    lean?: Vec3
  }
): void {
  const H = plan.H
  const P = scaler(H)
  s.mirror((side, S) => {
    const a = P(o.base[0] * side, o.base[1], o.base[2])
    const b = P(o.tip[0] * side, o.tip[1], o.tip[2])
    const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    const flat = o.flat ?? 0.45
    const rm = (o.r0 + o.r1) / 2
    const hint: Vec3 = o.lean ? [o.lean[0] * side, o.lean[1], o.lean[2]] : [0, 0, 1]
    s.add(scaled(cone(a, m, o.r0 * H, rm * H, hint), [1, 1, flat]), {
      color: o.color,
      bone: `ear${S}1`,
      k: 0.03 * H
    })
    s.add(scaled(cone(m, b, rm * H, o.r1 * H, hint), [1, 1, flat]), {
      color: o.color,
      bone: `ear${S}2`,
      k: 0.01 * H
    })
    if (o.inner !== undefined) {
      const f: Vec3 = [hint[0] * 0.03 * H, hint[1] * 0.03 * H, hint[2] * 0.03 * H]
      const ia: Vec3 = [a[0] + f[0], a[1] + 0.02 * H + f[1], a[2] + f[2]]
      const ib: Vec3 = [b[0] + f[0] * 0.8, b[1] - 0.035 * H + f[1], b[2] + f[2] * 0.8]
      s.sub(scaled(cone(ia, ib, o.r0 * 0.62 * H, o.r1 * 0.5 * H, hint), [1, 1, flat * 0.9]), {
        k: 0.008 * H,
        color: o.inner,
        ck: 0.006 * H
      })
    }
    if (o.tipColor !== undefined)
      s.paint(sphere(b, 0.06 * H), { color: o.tipColor, soft: 0.012 * H, bones: [`ear${S}2`] })
  })
}

export interface UniformParams {
  /** Front surface z of the chest at the core height, and the core height (fractions of H). */
  coreY?: number
  coreZ?: number
  coreR?: number
  /** Torso bound for straps (radii, fractions of H) and its centre y. */
  bound?: Vec3
  boundY?: number
  strapX?: number
  beltY?: number
  backZ?: number
  backY?: number
  /** Skip the belt (penguin/owl bodies). */
  noBelt?: boolean
}

/**
 * ARK uniform: navy shoulder straps and a chest strap (embossed, armour mask), a team-trim belt, an orange anima
 * core (glow mask) on the chest and a trimmed back plate.
 */
export function uniform(s: Sculpt, plan: BodyPlan, u: UniformParams = {}): Attachment[] {
  const H = plan.H
  const P = scaler(H)
  const bound = u.bound ?? [0.185, 0.2, 0.17]
  const boundY = u.boundY ?? 0.44
  const within = ellipsoid(P(0, boundY, 0), P(bound[0], bound[1], bound[2]))
  const torsoBones = ['chest', 'spine', 'hips']
  const amount = 0.006 * H
  const strapX = u.strapX ?? 0.085
  const coreY = u.coreY ?? 0.47
  // Locate the chest surface in front and behind on the sculpt so far.
  const field = compileField(s)
  const front = traceSurface(field, [0, coreY * H, H], [0, 0, -1], 2 * H)
  const coreZ = (u.coreZ ?? (front ? front.p[2] / H : 0.145)) + 0.004
  const backHit = traceSurface(field, [0, (u.backY ?? 0.455) * H, -H], [0, 0, 1], 2 * H)
  // Harness: two shoulder straps leaning inwards towards the belt and a chest strap, as one region so the
  // crossings share one colour ramp.
  const straps = [1, -1].map((side) =>
    slab(P(strapX * side, 0.45, 0), [Math.cos(0.22), -Math.sin(0.22) * side, 0], 0.024 * H)
  )
  s.emboss(straps[0], {
    union: [straps[1], box(P(0, coreY, 0.12), P(0.13, 0.022, 0.12), 0.01 * H)],
    within,
    amount,
    soft: 0.01 * H,
    color: NAVY,
    mask: M_ARMOR
  })
  if (!u.noBelt) {
    const beltY = u.beltY ?? 0.285
    s.emboss(slab(P(0, beltY, 0), [0, 1, 0], 0.026 * H), {
      within: ellipsoid(P(0, beltY, -0.005), P(0.24, 0.09, 0.24)),
      amount: amount * 1.2,
      soft: 0.01 * H,
      color: TRIM_BASE,
      mask: M_TRIM,
      bones: torsoBones
    })
  }
  const parts: Attachment[] = []
  // Anima core: a gem on a navy mount, a separate rigid part on the chest bone.
  const cz = coreZ * H
  const cr = (u.coreR ?? 0.042) * H
  const core = new Sculpt()
  core.add(cylinder([0, coreY * H, cz - 0.004 * H], cr * 1.32, 0.012 * H, 0.008 * H, [Math.PI / 2, 0, 0]), {
    color: NAVY_DARK,
    mask: M_ARMOR
  })
  const ring = torus([0, coreY * H, cz + 0.008 * H], cr * 1.08, 0.0085 * H, [Math.PI / 2, 0, 0])
  const dome = ellipsoid([0, coreY * H, cz + 0.004 * H], [cr * 0.92, cr * 0.92, cr * 0.5])
  core.add(ring, { color: NAVY_DARK, mask: M_ARMOR, k: 0.003 * H })
  core.add(dome, { color: NAVY_DARK, mask: M_ARMOR, k: 0.003 * H })
  // Colours as paint regions so their edges are crisp: a light ring and the glowing gem with a highlight.
  core.paint(torus([0, coreY * H, cz + 0.008 * H], cr * 1.08, 0.0095 * H, [Math.PI / 2, 0, 0]), { color: 0x56699f })
  core.paint(ellipsoid([0, coreY * H, cz + 0.004 * H], [cr * 0.93, cr * 0.93, cr * 0.52]), {
    color: CORE,
    mask: M_GLOW
  })
  core.paint(sphere([-cr * 0.35, coreY * H + cr * 0.35, cz + cr * 0.5], cr * 0.2), { color: 0xffe6bd, mask: M_GLOW })
  parts.push({ bone: 'chest', sculpt: core })
  if (!u.noBelt) {
    const beltY = (u.beltY ?? 0.285) * H
    const field2 = compileField(s)
    const hit = traceSurface(field2, [0, beltY, H], [0, 0, -1], 2 * H)
    const bzf = hit ? hit.p[2] : coreZ * H
    const buckle = new Sculpt()
    buckle.add(box([0, beltY, bzf], P(0.036, 0.03, 0.014), 0.009 * H), { color: NAVY_DARK, mask: M_ARMOR })
    buckle.paint(box([0, beltY, bzf + 0.02 * H], P(0.017, 0.012, 0.02), 0.005 * H), { color: CORE, mask: M_GLOW })
    parts.push({ bone: 'hips', sculpt: buckle })
  }
  // Back plate with the team trim and a paw print.
  const by = (u.backY ?? 0.455) * H
  const bz = u.backZ !== undefined ? u.backZ * H : backHit ? backHit.p[2] : -0.14 * H
  const plate = new Sculpt()
  // Deep enough to stay seated when the skin behind it moves with the head or arms.
  plate.add(box([0, by, bz + 0.016 * H], P(0.08, 0.074, 0.03), 0.014 * H), { color: NAVY, mask: M_ARMOR })
  plate.paint(box([0, by, bz - 0.03 * H], P(0.058, 0.052, 0.03), 0.012 * H), { color: TRIM_BASE, mask: M_TRIM })
  const paw = (x: number, y: number, r: number) =>
    plate.paint(scaled(sphere([x * H, by + y * H, bz - 0.03 * H], r * H), [1, 1, 3]), {
      color: NAVY_DARK,
      mask: M_NONE
    })
  paw(0, -0.012, 0.018)
  paw(-0.024, 0.016, 0.0085)
  paw(-0.008, 0.026, 0.0085)
  paw(0.008, 0.026, 0.0085)
  paw(0.024, 0.016, 0.0085)
  parts.push({ bone: 'chest', sculpt: plate })
  return parts
}

/** A rigid part of the uniform (sculpted in model space) attached to a bone. */
export interface Attachment {
  bone: 'chest' | 'hips'
  sculpt: Sculpt
}

/** Dark nose ellipsoid. */
export function nose(s: Sculpt, at: Vec3, r: Vec3, color = 0x2c2226): void {
  s.add(ellipsoid(at, r), { color, bone: 'head', k: Math.min(r[0], r[1]) * 0.6 })
}

/** Small round tail ball. */
export function pomTail(s: Sculpt, plan: BodyPlan, color: number, r = 0.06): void {
  const L = plan.layout
  s.add(sphere(L.tail1, r * plan.H), { color, bone: 'tail1', k: 0.03 * plan.H })
}

/** A tail along the three tail joints plus a tip point, with growing/shrinking radii. */
export function chainTail(
  s: Sculpt,
  plan: BodyPlan,
  tip: Vec3,
  radii: [number, number, number, number],
  color: number
) {
  const H = plan.H
  const L = plan.layout
  const pts = [L.tail1, L.tail2, L.tail3, tip]
  const bones = ['tail1', 'tail2', 'tail3']
  for (let i = 0; i < 3; i++)
    s.add(cone(pts[i], pts[i + 1], radii[i] * H, radii[i + 1] * H), {
      color,
      bone: bones[i],
      k: (i === 0 ? 0.035 : 0.02) * H
    })
}

/**
 * A curled (donut) tail: a tube following an arc behind the rump in the plane of up and back, drifting sideways
 * by `drift`; returns the three tail joints so the body plan can place its bones on the curl.
 */
export function curlJoints(
  H: number,
  c: Vec3,
  R: number,
  from: number,
  to: number,
  drift: number
): { at: (t: number) => Vec3; joints: [Vec3, Vec3, Vec3] } {
  const at = (t: number): Vec3 => {
    const a = from + (to - from) * t
    return [(c[0] + drift * t) * H, (c[1] + R * Math.sin(a)) * H, (c[2] - R * Math.cos(a)) * H]
  }
  const toH = (p: Vec3): Vec3 => [p[0] / H, p[1] / H, p[2] / H]
  return { at, joints: [toH(at(0)), toH(at(0.33)), toH(at(0.66))] }
}

export function curlTail(
  s: Sculpt,
  plan: BodyPlan,
  at: (t: number) => Vec3,
  radius: (t: number) => number,
  color: number,
  segments = 10
): void {
  const H = plan.H
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments,
      t1 = (i + 1) / segments
    const bone = t0 < 0.33 ? 'tail1' : t0 < 0.66 ? 'tail2' : 'tail3'
    s.add(cone(at(t0), at(t1), radius(t0) * H, radius(t1) * H), { color, bone, k: (i === 0 ? 0.035 : 0.012) * H })
  }
}
