/**
 * ヒョウタン熊 (`bearBoss`): the lord of the forest, a huge sleepy violet bear standing upright. A pear of a body on
 * short thick legs with the belly leading, a big round head set straight on the shoulders with round ears, a broad
 * cream muzzle with a black nose, small heavy-lidded eyes under thick brows, long heavy arms with broad paws and
 * dark claws, a sprig of three leaves on the crown and a golden two-bulbed gourd hanging on a rope across his back.
 * He is not one of the gang: no red anywhere. 128×128, facing right, feet on (64, 120).
 *
 * Rendering (CHARACTERS.md "Big furry bodies"): back, shoulders, belly and the thighs are ONE silhouette shaded
 * once, with a darker mantle over the shoulders and back, a cream belly patch with a toothed edge, fur teeth on the
 * shadow and fur-lock stamps; the arms, the shanks and feet hang free as parts of their own.
 *
 * Depth (back to front): back dust, far arm, far leg, gourd, body (rope), near leg, far ear, near ear, near arm,
 * mouth, lower jaw, head, face, leaves, front dust, stars.
 */
import type { SheetModule } from '../../module'
import { TAU, lag } from '../../motion'
import { C, R, ramp } from '../../palette'
import { Painter, Raster, ball, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  cel,
  fill,
  half,
  joint,
  mantle,
  oval,
  overlap,
  polygon,
  ribbon,
  shadow,
  smooth,
  spline,
  stampAt,
  tint,
  union,
  within,
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'

const FUR = R.bearViolet
const FAR = farRamp(FUR)
/** The darker coat over the crown, the shoulders and the back. */
const MANE = ramp('#a283b6', '#634878', '#4a3460', '#2f2140', '#1c1830')
const FAR_MANE = farRamp(MANE)
/** The pale belly, muzzle, inner ears and paw pads (the hamsters' cream: its shades are the ones `cel` steps to). */
const CREAM = R.hamCream
const GOURD = R.honey
const ROPE = R.wood
/** The leaf greens of the game, outlined in the coat's ink so the sprig costs no extra line colour. */
export const LEAF = ramp('#b8f08b', '#4fbf68', '#2f8f4f', '#1f6041', '#1c1830')

type Eyes = 'sleepy' | 'closed' | 'shut' | 'angry' | 'wide' | 'hurt' | 'dizzy' | 'tired'
type Mouth = 'shut' | 'grump' | 'open'
/** A hand relative to its shoulder (screen px), the elbow side (1 = behind for a hanging arm) and the paw's turn. */
type Arm = readonly [number, number, 1 | -1, number]
/** A foot relative to its rest place: forward, lift, turn in degrees (toes up −). */
type Leg = readonly [number, number, number]

export interface BearPose {
  /** Whole figure forward (+) / up (+). */
  x: number
  y: number
  /** Body tilt in degrees (forward +) and squash (+ wider and flatter). */
  lean: number
  squash: number
  /** Breathing 0..1: the belly swells. */
  breath: number
  /** The belly's own bounce, px down. */
  belly: number
  /** Head offset from its seat and nod in degrees (nose down +); `upright` is how much of the lean the neck undoes. */
  head: readonly [number, number]
  nod: number
  upright: number
  eyes: Eyes
  mouth: Mouth
  /** Lower jaw opening 0..1 (with mouth 'open'). */
  jaw: number
  tongue: boolean
  /** Ears pressed back, degrees. */
  earN: number
  earF: number
  armN: Arm
  armF: Arm
  legN: Leg
  legF: Leg
  /** The gourd's swing in degrees (0 = straight down, + toward the back). */
  gourd: number
  /** The gourd lying loose on the ground instead (screen x, y of its neck, turn). */
  gourdAt?: readonly [number, number, number]
  /** Leaves flopping (degrees, + toward the back) and spread (0 = upright sprig, 1 = drooping). */
  leaves: number
  droop: number
  /** Fur bristling 0..1. */
  fur: number
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
  /** Dust thrown out to both sides 0..1+. */
  dust: number
}

export const bearPose = (p: Partial<BearPose> = {}): BearPose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  breath: 0,
  belly: 0,
  head: [0, 0],
  nod: 0,
  upright: 0.8,
  eyes: 'sleepy',
  mouth: 'shut',
  jaw: 0,
  tongue: false,
  earN: 0,
  earF: 0,
  armN: [-4, 30, 1, 0],
  armF: [-1, 29, 1, 0],
  legN: [0, 0, 0],
  legF: [0, 0, 0],
  gourd: 16,
  leaves: 0,
  droop: 0,
  fur: 0,
  stars: -1,
  dust: 0,
  ...p
})

/** Rest places of the feet (x relative to the anchor) and the hips (torso units). */
const FOOT = { n: -6, f: 9 } as const
const HIP = { n: -7, f: 9 } as const

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = { K: C.black, w: C.white, y: GOURD[1], i: C.inkCool, B: MANE[3], s: FUR[2] }
/** Near eye (8 wide) and far eye (6 wide): small heavy-lidded eyes under thick brows. */
const EYES: Record<Eyes, readonly [readonly string[], readonly string[]]> = {
  sleepy: [
    ['BBBB....', '.BBBBBB.', '..ssssss', '.iiiiiii', '.KwKKKK.', '..KKKK..'],
    ['...BBB', '.BBBB.', 'ssss..', 'iiiii.', 'KwKK..', '.KK...']
  ],
  closed: [
    ['BBBB....', '.BBBBBB.', '........', '........', '.i....i.', '..iiii..'],
    ['...BBB', '.BBBB.', '......', '......', 'i...i.', '.iii..']
  ],
  shut: [
    ['BB......', '.BBBB...', '....BBBB', '........', 'iiii....', '...iiiii', '........'],
    ['....BB', '.BBBB.', 'BB....', '......', '..iiii', 'iii...', '......']
  ],
  angry: [
    ['BBB.....', '.BBBB...', '...BBBBB', '..KKKKK.', '.KwwKKKK', '.KwKKKyK', '.KKKKKKK', '..KKKKK.'],
    ['....BB', '..BBB.', 'BBB...', '.KKK..', 'KwKKK.', 'KKKyK.', 'KKKKK.', '.KKK..']
  ],
  wide: [
    ['..BBB...', '.B...B..', '........', '..iiiii.', '.iwwwwwi', '.iwwKKwi', '.iwwKKwi', '..iiiii.'],
    ['..BB..', '.B..B.', '......', '.iii..', 'iwwwi.', 'iwKKi.', 'iwKKi.', '.iii..']
  ],
  hurt: [
    ['BB......', '.BBB....', '........', 'ii......', '..iii...', '....iiii', '..iii...', 'ii......'],
    ['....BB', '...BB.', '......', '....ii', '..ii..', 'iiii..', '..ii..', '....ii']
  ],
  dizzy: [
    ['........', '..iiiii.', '.i.....i', '.i.iii.i', '.i.i.i.i', '.i...i.i', '..iii..i'],
    ['......', '.iiii.', 'i....i', 'i.ii.i', 'i.i..i', '.ii.i.']
  ],
  tired: [
    ['........', 'BBBBBBB.', '.BBBBBBB', '.iiiiiii', '.KwKKK..', '..KKK...'],
    ['......', 'BBBBB.', '.BBBBB', 'iiiii.', 'KwKK..', '.KK...']
  ]
}
const NOSE = ['.KKKK.', 'KhhKKK', 'KKKKKK', '.KKKK.']
/** The closed mouth: the philtrum and a grumpy downturned line running back under the muzzle. */
const MOUTH_SHUT = ['......i.', '......i.', '.iiiii.i', 'i.......']
const MOUTH_GRUMP = ['......i.', '......i.', '..iiii.i', '.i....i.', 'i.......']
/** Upper teeth under the open muzzle (fangs at both ends) and the lower fangs. */
const TEETH_UP = ['W.w.w.w.W', 'W.......W']
const TEETH_DOWN = ['w.....w', 'W.....W']
const CLAWS = ['kk.', '...', 'kkk', '...', 'kk.']
const TOE_CLAWS = ['k.', '..', 'kk', '..', 'k.']
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']
/** Fur locks that break a silhouette. */
const TUFT_BACK = ['...ff', '..fff', '.ffff', 'ffff.', 'fff..']
const TUFT_DOWN = ['fffff', 'fffff', '.fff.', '.ff..', '..f..']
const TUFT_UP = ['..f..', '.ff..', '.fff.', 'fffff']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)

/**
 * An oval whose edge is cut into fur locks: `teeth` locks around it, each `depth` (fraction of the radius) deep.
 * For pale bellies and bibs whose border must be fur, not a smooth curve. Candidate for the toolkit.
 */
const furOval = (cu: number, cv: number, ru: number, rv: number, teeth: number, depth: number): Shape => ({
  box: [cu - ru, cv - rv, cu + ru, cv + rv],
  has(u, v) {
    const du = (u - cu) / ru
    const dv = (v - cv) / rv
    const s = ((Math.atan2(dv, du) + Math.PI) / TAU) * teeth
    const saw = s - Math.floor(s)
    const r = 1 - depth * saw
    return du * du + dv * dv <= r * r
  }
})

/**
 * Light pixels on the very edge of a part take the base colour instead (the selout next to them is two ramp steps
 * darker, and two steps below cream is still light). Same as the wolf's `dimEdge`; candidate for a `cel` option.
 */
function dimEdge(l: Raster, ramps: readonly Ramp[]) {
  const b = l.bounds()
  if (!b) return
  const src = l.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const c = src.get(x, y)
      const r = ramps.find((m) => m[0] === c)
      if (r && !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1))) l.set(x, y, r[1])
    }
}

/** A leaf pointing up from its base (frame origin), widest a third of the way, with a pointed tip. */
const leafShape = (len: number, wid: number): Shape => {
  const pts: Pt[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    pts.push([Math.sin(Math.PI * t ** 0.75) * wid, -t * len])
  }
  for (let i = 8; i >= 0; i--) {
    const t = i / 8
    pts.push([-Math.sin(Math.PI * t ** 0.75) * wid, -t * len])
  }
  return polygon(pts)
}

// ------------------------------------------------------------------------------------------------ drawing

export function drawBear(p: BearPose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const k = 1 + p.squash * 0.04
  const ground = Frame.at(62 + p.x, 120)
  const root = ground.child(0, -p.y)
  const torso = root.child(0, -34, p.lean, k, 1 / k)
  // The head sits on the torso but keeps only some of its squash (none when he lies on his back).
  const hk = k ** (0.5 * Math.abs(Math.cos((p.lean * Math.PI) / 180)))
  const head = Frame.at(...torso.pt(6 + p.head[0], -27 + p.head[1]), p.lean + p.nod - p.lean * p.upright, hk, 1 / hk)
  const br = p.breath
  const bel = p.belly
  const backAt = torso.pt(-6, -10)

  // ---- legs: the thigh belongs to the body; the shank and the broad flat foot hang free
  const legGeo = (leg: Leg, rest: number, hip: number) => {
    const f = ground.child(rest + leg[0], -leg[1], leg[2])
    const s = torso.pt(hip, 12)
    const end = f.pt(-1.5, -4.5)
    return { f, s, end, mid: joint(s, end, 10, 9, -1).mid, grounded: leg[1] < 0.6 && Math.abs(leg[2]) < 10 }
  }
  type LegGeo = ReturnType<typeof legGeo>
  const legN = legGeo(p.legN, FOOT.n, HIP.n)
  const legF = legGeo(p.legF, FOOT.f, HIP.f)

  // ---- arms: two bones hanging from the shoulders, long enough to reach the knees
  const armGeo = (arm: Arm, s: Pt) => {
    const { mid, end } = joint(s, [s[0] + arm[0], s[1] + arm[1]], 17, 16, arm[2])
    const deg = (Math.atan2(end[1] - mid[1], end[0] - mid[0]) * 180) / Math.PI
    return { s, mid, end, paw: Frame.at(end[0], end[1], deg + arm[3]) }
  }
  type ArmGeo = ReturnType<typeof armGeo>
  const armN = armGeo(p.armN, torso.pt(0, -15))
  const armF = armGeo(p.armF, torso.pt(10, -17))

  // ---- the head's shapes (head units): a round skull with heavy jowls and a broad muzzle
  const skull = union(oval(0, -1, 17, 14.5), oval(-3, 6, 14, 8.5))
  const muzzle = oval(14, 5.5, 10, 6.6)
  const headShape = union(skull, muzzle)

  /** The body silhouette in torso units: belly egg, shoulders, the round back. */
  const bellyShape = oval(4, 4 + bel * 0.5, 27 + br * 0.8, 19 + br * 0.5)
  const bodyShape = union(bellyShape, oval(0, -12, 20, 12.5), oval(-11, 4, 15, 15))

  /** A free-hanging arm: upper arm, forearm and a broad paw with dark claws. */
  const arm = (l: Raster, a: ArmGeo, tone: Ramp, far: boolean) => {
    const r = far ? 0.9 : 1
    fill(l, ID, capsule(a.s, a.mid, 7 * r, 5.6 * r), tone[1])
    fill(l, ID, capsule(a.mid, a.end, 5.6 * r, 4.8 * r), tone[1])
    fill(l, a.paw, union(oval(3.5, 0, 7 * r, 6.6 * r), oval(7, 0.5, 4.6 * r, 5.8 * r)), tone[1])
    // a lock at the back of the elbow
    stampAt(l, ID, TUFT_DOWN, a.mid[0] - 3, a.mid[1] + 2, { f: tone[1] })
    smooth(l)
    cel(l, { shade: 3.2, deep: 1.2, rim: 1.4, tooth: 1.5, pitch: 4, origin: a.s })
    stampAt(l, a.paw, CLAWS, 11, 0.5, { k: CREAM[3] })
  }

  /** Shank and foot. */
  const leg = (l: Raster, lg: LegGeo, tone: Ramp) => {
    fill(l, ID, capsule(lg.mid, lg.end, 7, 6), tone[1])
    const foot = union(oval(3.5, -3.6, 8.5, 3.8), oval(-2.5, -4, 4.5, 4.2))
    fill(l, lg.f, lg.grounded ? overlap(foot, half([0, -0.3], 0, -1)) : foot, tone[1])
    if (!lg.grounded) tint(l, lg.f, oval(2.5, -1.6, 6, 1.8), CREAM[2])
    smooth(l)
    cel(l, { shade: 2.6, deep: 1, rim: 1.2 })
    stampAt(l, lg.f, TOE_CLAWS, 12, -3.4, { k: CREAM[3] })
  }

  // ---- far arm and far leg, a ramp step darker, behind everything
  g.add(-5, (l) => arm(l, armF, FAR, true))
  g.add(-4.5, (l) => {
    fill(l, ID, capsule(legF.s, legF.mid, 8, 7), FAR[1])
    leg(l, legF, FAR)
  })

  // ---- the gourd: two golden bulbs, a waist string and a wooden stopper, hanging from the rope on his back
  const knot = torso.pt(-22, 4.5)
  const neck: Pt = p.gourdAt ? [p.gourdAt[0], p.gourdAt[1]] : torso.pt(-25, -1)
  const gf = Frame.at(neck[0], neck[1], p.gourdAt ? p.gourdAt[2] : p.gourd)
  g.add(-3, (l) => {
    if (!p.gourdAt) ribbon(l, [knot, neck], () => 2.2, ROPE[2])
    fill(l, gf, capsule([0, -2.5], [0, 0.5], 1.9, 2.1), ROPE[2])
    fill(l, gf, union(oval(0, 5.5, 5, 5.2), oval(0, 10.5, 3, 2), oval(0, 17.5, 8.6, 8.2)), GOURD[1])
    tint(l, gf, capsule([-4, 11], [4, 11.5], 1, 1), ROPE[2])
    smooth(l)
    cel(l, { shade: 3, deep: 1.2 })
    dimEdge(l, [GOURD])
    // the hard highlight on each bulb
    within(l, (m) => stampAt(m, gf, ['ww', 'w.'], -4, 14, { w: C.white }), true)
    within(l, (m) => stampAt(m, gf, ['w'], -2, 4, { w: C.white }), true)
  })

  // ---- the body: back, shoulders, belly and the thighs as ONE silhouette, shaded once
  g.add(0, (l) => {
    fill(l, torso, bodyShape, FUR[1])
    fill(l, ID, capsule(legN.s, legN.mid, 9.5, 7.5), FUR[1])
    // the cream belly, a big oval with a fur edge
    tint(l, torso, furOval(9, 5 + bel, 15.5 + br * 0.6, 15 + br * 0.4, 13, 0.12), CREAM[1])
    // locks on the shoulders, the hump of the back and the rump
    const up = p.fur * 2.5
    stampAt(l, torso, TUFT_UP, 4, -25.5 - up, { f: FUR[1] })
    stampAt(l, torso, TUFT_UP, -8, -24 - up, { f: FUR[1] })
    stampAt(l, torso, TUFT_BACK, -26 - up, 2, { f: FUR[1] })
    stampAt(l, torso, TUFT_DOWN, -18, 16, { f: FUR[1] })
    smooth(l)
    mantle(l, FUR[1], MANE[1], { depth: 9, tooth: 4, pitch: 5, origin: backAt })
    cel(l, { shade: 11, deep: 3.5, rim: 2.4, tooth: 3, pitch: 5, origin: backAt })
    dimEdge(l, [CREAM])
    // the head's shadow on the chest
    shadow(l, head.moved(0.5, 3), headShape)
    // the rope across the chest, from the far shoulder down to the gourd on the back
    within(l, (m) => {
      // it sags around the round belly
      const strap = (dv: number) => spline([torso.pt(23, -9 + dv), torso.pt(0, 3 + dv), torso.pt(-26, 6 + dv)])
      ribbon(m, strap(0), () => 2.2, ROPE[3])
      ribbon(m, strap(-0.8), () => 1, ROPE[2])
    })
  })

  // ---- near leg
  g.add(1, (l) => leg(l, legN, FUR))

  // ---- the head's shapes (head units): a round skull with heavy jowls and a broad muzzle

  // ---- ears: round, behind the skull, a pale bowl inside
  const ear = (u: number, v: number, back: number, tone: Ramp, far: boolean) => (l: Raster) => {
    const f = head.child(u, v, -back)
    fill(l, f, oval(0, -2, far ? 5.6 : 6.6, far ? 5.6 : 6.6), tone[1])
    tint(l, f, oval(far ? 1 : 0.8, -1.4, far ? 2.8 : 3.6, far ? 3 : 3.8), far ? CREAM[3] : CREAM[2])
    cel(l, { shade: 1.8, rim: 1 })
  }
  g.add(2, ear(10, -13, p.earF, FAR_MANE, true))
  g.add(2.1, ear(-10, -11.5, p.earN, MANE, false))

  // ---- near arm: in front of the body, and in front of the head when it is raised
  g.add(armN.end[1] < armN.s[1] - 2 ? 4.4 : 3, (l) => arm(l, armN, FUR, false))

  // ---- the open mouth is cut into the muzzle, the lower jaw drops on its hinge in front of it
  const open = p.mouth === 'open' && p.jaw > 0.05
  const jaw = head.child(8, 8, p.jaw * 34)
  if (open) {
    g.add(
      4.1,
      (l) => {
        fill(
          l,
          ID,
          polygon([head.pt(7, 9.5), head.pt(16, 8.6), head.pt(24, 7.6), jaw.pt(16, 2), jaw.pt(8, 6), jaw.pt(0.5, 3.5)]),
          C.mouth
        )
        tint(l, jaw, capsule([4, 3.5], [13, 2.4], 2.4, 2), C.tongue)
      },
      false
    )
    g.add(4.15, (l) => {
      fill(l, jaw, capsule([0.5, 4.8], [15, 2.8], 3.6, 2.6), CREAM[1])
      smooth(l)
      cel(l, { shade: 1.8, rim: 1 })
      dimEdge(l, [CREAM])
      within(l, (m) => stampAt(m, jaw, TEETH_DOWN, 11, 1.5, { w: C.white, W: CREAM[2] }), true)
    })
    // the tongue lolls out over the lower lip
    if (p.tongue)
      g.add(4.16, (l) => {
        fill(l, jaw, union(capsule([9, 2], [13, 7], 2.4, 2.4), oval(13.5, 8.5, 2.6, 2.4)), C.tongue)
        tint(l, jaw, capsule([10.5, 3], [13.5, 8.5], 0.5, 0.5), C.mouth)
      })
  }

  // ---- head: skull, jowls and muzzle as one silhouette
  const headAt = head.pt(0, -1)
  g.add(4, (l) => {
    fill(l, head, headShape, FUR[1])
    tint(l, head, union(oval(15, 6, 9.4, 6.2), oval(8, 9.5, 6, 4)), CREAM[1])
    stampAt(l, head, TUFT_BACK, -17, 5, { f: FUR[1] })
    stampAt(l, head, TUFT_DOWN, -6, 14.5, { f: FUR[1] })
    smooth(l)
    mantle(l, FUR[1], MANE[1], { depth: 6, tooth: 2.5, pitch: 4, origin: headAt })
    cel(l, { shade: 5.5, deep: 1.8, rim: 2, tooth: 1.5, pitch: 4, origin: headAt })
    dimEdge(l, [CREAM])
  })

  // ---- face
  g.add(
    4.2,
    (l) => {
      const [near, far] = EYES[p.eyes]
      stampAt(l, head, near, 4.5, -3.5, EYE_KEY)
      stampAt(l, head, far, 14.5, -4.5, EYE_KEY)
      stampAt(l, head, NOSE, 22, 1, { K: C.black, h: FUR[0] })
      if (open) stampAt(l, head, TEETH_UP, 16.5, 9.6, { w: C.white, W: CREAM[2] })
      else stampAt(l, head, p.mouth === 'grump' ? MOUTH_GRUMP : MOUTH_SHUT, 18, 6, { i: C.inkCool })
    },
    false
  )

  // ---- the sprig: three leaves on the crown that flop a beat behind the head
  const spread = 1 + p.droop * 1.2
  for (const [u, v, deg, len, wid, depth] of [
    [-5, -13, -68, 12, 3.6, 4.5],
    [4, -13.5, 44, 11, 3.4, 4.55],
    [-0.5, -14.5, -14, 14, 4, 4.6]
  ] as const)
    g.add(depth, (l) => {
      const f = head.child(u, v, deg * spread + p.leaves * (1 + Math.abs(deg) / 90))
      fill(l, f, union(leafShape(len, wid), capsule([0, 2], [0, -1.5], 0.9, 0.9)), LEAF[1])
      smooth(l)
      cel(l, { shade: 1.6, rim: 1 })
      // the midrib
      within(l, (m) => fill(m, f, capsule([0, -2], [0, -len * 0.7], 0.45, 0.45), LEAF[2]), true)
    })

  // ---- dust thrown out to both sides of a slam
  if (p.dust > 0) {
    const puffAt = (l: Raster, x: number, side: number) => {
      const d = p.dust
      fill(l, Frame.at(x, 117), oval(0, 0, 5 + d * 2, 3 + d), CREAM[2])
      fill(l, Frame.at(x + side * (7 + d * 4), 115 - d * 2), oval(0, 0, 3.4 + d * 1.4, 2.6 + d), CREAM[2])
      fill(l, Frame.at(x + side * (2 + d * 2), 112 - d * 3), oval(0, 0, 2.6 + d, 2.2 + d * 0.6), CREAM[2])
    }
    g.add(-6, (l) => {
      puffAt(l, ground.pt(-30, 0)[0], -1)
      smooth(l)
      cel(l, { shade: 1.6 })
    })
    g.add(6, (l) => {
      puffAt(l, ground.pt(30, 0)[0], 1)
      smooth(l)
      cel(l, { shade: 1.6 })
    })
  }

  // ---- stars over a knocked-out head, outlined
  if (p.stars >= 0)
    g.add(7, (l) => {
      // over the head on screen, whichever way the head lies
      const [hx, hy] = head.pt(2, 0)
      const cx = hx
      const cy = hy - 20
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 13) - 2,
          Math.round(cy + Math.sin(a) * 3.5) - 2,
          { y: GOURD[1], Y: C.white }
        )
      }
    })

  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const P = bearPose
const phase = (i: number, n: number) => (i / n) * TAU

/** idle: half asleep on his feet — a long breath, the head nodding off, an ear twitch, one belly scratch. */
const idle = memo(() => {
  const N = 6
  const breath = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(phase(i, N)))
  const sway = Array.from({ length: N }, (_, i) => Math.sin(phase(i, N)))
  const nod = Array.from({ length: N }, (_, i) => [0, 1, 3, 5, 2, 0][i])
  const leafLag = lag(nod, { stiffness: 0.35, damping: 0.4, loop: true })
  const gourdLag = lag(sway, { stiffness: 0.3, damping: 0.35, loop: true })
  const scratch: Arm[] = [
    [-3, 30, 1, 0],
    [2, 27, 1, 0],
    [12, 18, 1, -40],
    [13, 21, 1, -30],
    [10, 22, 1, -40],
    [1, 28, 1, 0]
  ]
  return Array.from({ length: N }, (_, i) =>
    P({
      y: breath[i] * 0.8,
      lean: sway[i] * 1.2,
      breath: breath[i],
      belly: -breath[i] * 0.6,
      head: [0, nod[i] * 0.4],
      nod: nod[i] * 1.6,
      eyes: i === 3 ? 'closed' : 'sleepy',
      mouth: 'shut',
      earF: i === 4 ? 24 : 0,
      armN: scratch[i],
      armF: [-1 + sway[i], 29, 1, 0],
      gourd: 16 + gourdLag[i] * 8,
      leaves: leafLag[i] * 4
    })
  )
})

/** intro: a yawn and a stretch, the snap awake, the roar with arms spread (held), then the fighting crouch. */
const intro = memo(() => {
  const roar: Partial<BearPose> = {
    y: 1,
    squash: -3,
    lean: -4,
    head: [-1, -3],
    nod: -14,
    eyes: 'angry',
    mouth: 'open',
    jaw: 1,
    armN: [-25, -12, -1, -50],
    armF: [25, -14, 1, -70],
    earN: 30,
    earF: 30,
    fur: 1,
    leaves: -30,
    droop: -0.5
  }
  const crouch: Partial<BearPose> = {
    y: -3,
    squash: 2.5,
    lean: 10,
    head: [2, 2],
    nod: 4,
    eyes: 'angry',
    mouth: 'grump',
    armN: [15, 17, 1, -60],
    armF: [20, 13, 1, -70],
    legN: [-3, 0, 0],
    legF: [3, 0, 0],
    earN: 20,
    earF: 20,
    fur: 0.4,
    gourd: 28
  }
  return [
    P({
      squash: -1,
      lean: -5,
      head: [-1, -1],
      nod: -16,
      eyes: 'closed',
      mouth: 'open',
      jaw: 0.6,
      armN: [-8, -20, -1, -30],
      armF: [8, -22, 1, -40],
      gourd: 10
    }),
    P({
      y: 1,
      squash: -2.5,
      lean: -8,
      head: [-2, -2],
      nod: -24,
      eyes: 'closed',
      mouth: 'open',
      jaw: 1,
      tongue: true,
      armN: [-4, -30, -1, -10],
      armF: [6, -31, 1, -20],
      gourd: 6,
      leaves: 10
    }),
    P({
      y: -2,
      squash: 2,
      lean: 2,
      head: [1, 1],
      nod: 0,
      eyes: 'wide',
      mouth: 'shut',
      armN: [-6, 18, 1, 0],
      armF: [-2, 16, 1, 0],
      gourd: 24,
      leaves: 20,
      fur: 0.5
    }),
    P({ ...roar, gourd: 2, leaves: -40 }),
    P({ ...roar, y: 1.4, fur: 1.4, jaw: 0.9, gourd: -6, leaves: -24, armN: [-26, -14, -1, -56], armF: [26, -16, 1, -74] }),
    P({ ...crouch, y: -4.5, squash: 3.5, gourd: 4, leaves: 16 }),
    P({ ...crouch, breath: 1, gourd: 26, leaves: -6 }),
    P({ ...crouch, y: -2.6, breath: 0.2, gourd: 32, leaves: 4 })
  ]
})

/** hurt: a grunt — the head snapped back, eyes shut, arms jerking up; recoil; an annoyed shake of the head. */
const hurt = memo(() => [
  P({
    x: -2,
    y: 1,
    lean: -10,
    squash: -1.5,
    head: [-3, -3],
    nod: -26,
    eyes: 'hurt',
    mouth: 'open',
    jaw: 0.6,
    armN: [-14, -6, -1, -30],
    armF: [14, -8, 1, -40],
    earN: 40,
    earF: 40,
    fur: 1,
    gourd: 34,
    leaves: 30
  }),
  P({
    x: -4,
    y: -1.5,
    lean: 6,
    squash: 1.5,
    head: [0, 2],
    nod: 12,
    eyes: 'shut',
    mouth: 'grump',
    armN: [-2, 26, 1, 0],
    armF: [2, 24, 1, 0],
    earN: 30,
    earF: 34,
    gourd: -4,
    leaves: -20
  }),
  P({
    x: -2,
    lean: 2,
    head: [2, 0],
    nod: 8,
    eyes: 'angry',
    mouth: 'grump',
    armN: [2, 27, 1, 0],
    armF: [3, 26, 1, 0],
    earN: 10,
    earF: -10,
    gourd: 22,
    leaves: 26
  })
])

/**
 * move: the walk of something heavy — contact, sink, pass, rise on each foot, the body rolling, the arms swinging
 * like pendulums against the legs, the belly bouncing a beat late and the gourd swinging behind.
 */
const move = memo(() => {
  const N = 8
  const foot = (t: number): Leg => {
    const u = ((t % 1) + 1) % 1
    if (u < 0.5) return [9 - 36 * u, 0, 0]
    const s = (u - 0.5) * 2
    return [-9 + 18 * s, Math.sin(Math.PI * s) * 6, -Math.sin(Math.PI * s) * 12]
  }
  const t = Array.from({ length: N }, (_, i) => i / N)
  const bob = t.map((u) => -1.8 * Math.cos(TAU * 2 * (u - 0.125)))
  const roll = t.map((u) => Math.sin(TAU * u))
  const bellyLag = lag(bob, { stiffness: 0.4, damping: 0.45, loop: true })
  const gourdLag = lag(roll, { stiffness: 0.3, damping: 0.3, loop: true })
  const leafLag = lag(bob, { stiffness: 0.35, damping: 0.4, loop: true })
  return t.map((u, i) => {
    const swing = Math.cos(TAU * u)
    return P({
      x: Math.round(roll[i] * 0.8),
      y: bob[i],
      lean: 5 + roll[i] * 2.2,
      belly: bellyLag[i] * 1.6,
      head: [1, 1 - bob[i] * 0.3],
      nod: 4 + bob[i],
      eyes: 'sleepy',
      mouth: i === 2 || i === 6 ? 'grump' : 'shut',
      legN: foot(u),
      legF: foot(u + 0.5),
      armN: [-3 - swing * 9, 29 - Math.abs(swing) * 2, 1, swing * 10],
      armF: [-1 + swing * 9, 28 - Math.abs(swing) * 2, 1, -swing * 10],
      gourd: 18 + gourdLag[i] * 14 + bob[i] * 2,
      leaves: leafLag[i] * 8,
      earN: 4,
      earF: 4
    })
  })
})

/** windup: the crouch before the leap — sinking low, arms pulled back, belly on the knees, eyes on the hero. */
const windup = memo(() => {
  const set: Partial<BearPose> = {
    y: -9,
    squash: 4,
    lean: 16,
    head: [3, 4],
    nod: -6,
    eyes: 'angry',
    mouth: 'grump',
    armN: [-20, 12, 1, 30],
    armF: [-14, 10, 1, 30],
    legN: [-4, 0, 0],
    legF: [4, 0, 0],
    earN: 35,
    earF: 35,
    fur: 0.8,
    leaves: 20
  }
  return [
    P({
      y: -4,
      squash: 2,
      lean: 8,
      head: [2, 2],
      nod: 0,
      eyes: 'angry',
      mouth: 'grump',
      armN: [-12, 20, 1, 10],
      armF: [-8, 20, 1, 10],
      legN: [-2, 0, 0],
      legF: [2, 0, 0],
      earN: 20,
      earF: 20,
      gourd: 8,
      leaves: -10
    }),
    P({ ...set, y: -10, squash: 5, gourd: 34, leaves: 26 }),
    P({ ...set, x: 0.6, fur: 1, gourd: 30, leaves: 18 }),
    P({ ...set, x: -0.6, y: -9.5, breath: 0.6, gourd: 26, leaves: 24 })
  ]
})

/** air: rising (stretched, arms thrown up), the top (tucked, arms out), falling (belly first, roaring). */
const air = memo(() => [
  P({
    y: 5,
    squash: -4,
    lean: -2,
    head: [0, -2],
    nod: -12,
    eyes: 'angry',
    mouth: 'open',
    jaw: 0.5,
    armN: [-6, -30, -1, -20],
    armF: [8, -30, 1, -30],
    legN: [-6, 2, 30],
    legF: [-2, 4, 30],
    earN: 30,
    earF: 30,
    gourd: 4,
    leaves: 30,
    droop: -0.3
  }),
  P({
    y: 8,
    squash: 2,
    lean: 6,
    head: [1, 2],
    nod: 4,
    eyes: 'wide',
    mouth: 'open',
    jaw: 0.3,
    armN: [-24, 2, 1, -60],
    armF: [24, -2, -1, -90],
    legN: [0, 12, 0],
    legF: [6, 11, 0],
    gourd: 90,
    leaves: -10
  }),
  P({
    y: 6,
    squash: 1,
    lean: 24,
    head: [2, 1],
    nod: -14,
    eyes: 'angry',
    mouth: 'open',
    jaw: 1,
    armN: [-24, -14, -1, -40],
    armF: [24, -18, 1, -70],
    legN: [-12, 8, 20],
    legF: [10, 9, -10],
    earN: 40,
    earF: 40,
    fur: 1,
    gourd: 160,
    leaves: -40,
    droop: -0.4
  })
])

/** land: the slam — flattened with dust to both sides, the gourd crashing down a frame late, rebound, up. */
const land = memo(() => [
  P({
    y: -14,
    squash: 7,
    lean: 14,
    head: [3, 4],
    nod: 4,
    eyes: 'shut',
    mouth: 'open',
    jaw: 0.35,
    armN: [-18, 18, 1, 40],
    armF: [24, 16, -1, -10],
    legN: [-8, 0, 0],
    legF: [8, 0, 0],
    earN: 40,
    earF: 40,
    fur: 1.2,
    gourd: 130,
    leaves: -40,
    dust: 1
  }),
  P({
    y: -9,
    squash: 3,
    lean: 10,
    head: [2, 1],
    nod: 0,
    eyes: 'angry',
    mouth: 'grump',
    armN: [-12, 22, 1, 30],
    armF: [18, 20, -1, -10],
    legN: [-6, 0, 0],
    legF: [6, 0, 0],
    earN: 20,
    earF: 20,
    fur: 0.6,
    gourd: -6,
    leaves: 30,
    dust: 1.8
  }),
  P({
    y: -4,
    squash: 1,
    lean: 12,
    head: [2, 2],
    nod: 4,
    eyes: 'angry',
    mouth: 'shut',
    armN: [8, 18, 1, -40],
    armF: [10, 16, 1, -40],
    legN: [-4, 0, 0],
    legF: [4, 0, 0],
    gourd: 30,
    leaves: -10,
    dust: 0.9
  }),
  P({
    y: -0.5,
    lean: 4,
    head: [1, 0.5],
    nod: 2,
    eyes: 'angry',
    mouth: 'grump',
    armN: [-2, 29, 1, 0],
    armF: [0, 28, 1, 0],
    gourd: 12,
    leaves: 6
  })
])

/** recover: bent forward with paws on his knees, panting with the tongue out, the leaves drooping. */
const recover = memo(() =>
  [0, 1, 0.3, 0.85].map((pant, i) =>
    P({
      y: -3 - pant * 0.8,
      lean: 20,
      squash: 1,
      breath: pant,
      belly: pant * 0.8,
      head: [3, 5 + pant],
      nod: 6 - pant * 6,
      eyes: 'tired',
      mouth: 'open',
      jaw: 0.35 + pant * 0.3,
      tongue: true,
      armN: [9, 22, 1, -50],
      armF: [11, 20, 1, -50],
      legN: [-3, 0, 0],
      legF: [3, 0, 0],
      earN: 20 + pant * 6,
      earF: 18,
      gourd: 20 + [0, 3, -2, 2][i],
      leaves: pant * 6,
      droop: 1
    })
  )
)

/** defeat: the jolt, a slow sway backward like a felled tree, the crash, a bounce of the belly, out cold. */
const defeat = memo(() => {
  const lying: Partial<BearPose> = {
    x: 0,
    y: -13,
    lean: -90,
    squash: -6,
    upright: 0,
    head: [2, -2],
    nod: 72,
    eyes: 'dizzy',
    mouth: 'open',
    jaw: 0.45,
    tongue: true,
    armN: [-10, 14, -1, 30],
    armF: [8, -18, 1, -30],
    legN: [36, 24, -90],
    legF: [17, 38, -100],
    earN: 0,
    earF: 0,
    gourdAt: [92, 104, -65],
    leaves: 10,
    droop: 1
  }
  return [
    P({
      x: -1,
      y: 1,
      lean: -6,
      squash: -1.5,
      head: [-2, -2],
      nod: -16,
      eyes: 'wide',
      mouth: 'open',
      jaw: 0.6,
      armN: [-12, -4, -1, -30],
      armF: [12, -6, 1, -40],
      earN: 30,
      earF: 30,
      fur: 1.3,
      gourd: 30,
      leaves: 30
    }),
    P({
      x: -4,
      y: -1,
      lean: -16,
      head: [-1, 0],
      nod: -6,
      eyes: 'dizzy',
      mouth: 'open',
      jaw: 0.4,
      armN: [-6, 16, 1, 0],
      armF: [6, 14, -1, 0],
      legF: [3, 3, -20],
      gourd: 2,
      leaves: -16
    }),
    P({
      x: -12,
      y: -6,
      lean: -42,
      head: [-1, 0],
      nod: -4,
      eyes: 'dizzy',
      mouth: 'open',
      jaw: 0.6,
      armN: [-10, -8, -1, -20],
      armF: [10, -12, 1, -40],
      legN: [6, 3, -30],
      legF: [10, 8, -40],
      gourd: 150,
      leaves: -30
    }),
    P({
      ...lying,
      y: -14,
      squash: -5,
      eyes: 'shut',
      legN: [34, 30, -70],
      legF: [14, 42, -80],
      gourdAt: [88, 86, -150],
      leaves: -30,
      dust: 0.8
    }),
    P({
      ...lying,
      x: 1.5,
      y: -10.5,
      squash: -7,
      belly: -2,
      legN: [37, 22, -95],
      gourdAt: [94, 98, -100],
      leaves: 30,
      dust: 1.4
    }),
    P({ ...lying, y: -13.5, squash: -5.5, belly: 1.5, gourdAt: [93, 104, -60], leaves: -6 }),
    P({ ...lying, stars: 0, breath: 0.2 }),
    P({ ...lying, stars: 1 / 6, breath: 0.8, leaves: 16 })
  ]
})

const draw = (poses: BearPose[]) => poses.map(drawBear)

/**
 * A small cloud of dust: three overlapping ball-shaded puffs. Kept for the legacy apeBoss sheet, which still
 * imports it from here until its own redraw.
 */
export function puff(l: Raster, x: number, y: number, r: number) {
  ball(l, x, y, r, r * 0.85, R.paper, false)
  ball(l, x + r * 0.9, y + r * 0.25, r * 0.7, r * 0.6, R.paper, false)
  ball(l, x - r * 0.8, y + r * 0.3, r * 0.6, r * 0.55, R.paper, false)
}

export const sheets: SheetModule = {
  bearBoss: () => ({
    idle: lazyAnim(() => draw(idle()), 8, true),
    intro: lazyAnim(() => draw(intro()), 10, false, { sustain: 2 }),
    hurt: lazyAnim(() => draw(hurt()), 12, false),
    defeat: lazyAnim(() => draw(defeat()), 10, false, { sustain: 2 }),
    move: lazyAnim(() => draw(move()), 10, true),
    windup: lazyAnim(() => draw(windup()), 10, false, { sustain: 2 }),
    air: lazyAnim(() => draw(air()), 8, false),
    land: lazyAnim(() => draw(land()), 14, false),
    recover: lazyAnim(() => draw(recover()), 6, true)
  })
}
