/**
 * ごりら警部 (`apeBoss`): the jailer of the fortress, a charcoal silverback who plays police inspector for the gang.
 * A wall of muscle with a rule book: enormous shoulders and arms (thick upper arms, even thicker forearms, fists like
 * boulders with four pale knuckles), a barrel chest, a small waist and short bowed legs. The head sits low between
 * the shoulders under a heavy brow, with a broad grey-lavender face mask and a wide mouth that opens into a roar. A
 * navy police cap with a gold star rides on its own frame (it bobs late, tips, flies off); the gang's red band is
 * tied round the near upper arm. 128×128, facing right, feet on (64, 120).
 *
 * Rendering (CHARACTERS.md "Big furry bodies"): chest, shoulders, back, rump, the near upper arm and the near thigh
 * are ONE silhouette shaded once, with a silver saddle on the back (`mantle`, toothed lower edge), a paler chest
 * plate, fur teeth on the shadow and fur-lock stamps; forearms, fists, shanks and feet hang free as parts.
 *
 * Depth (back to front): dust behind, far arm, far leg, body, near leg, armband tails, far ear, mouth, lower jaw,
 * head, face, near ear, cap, near forearm and fist, dust and stone chips in front, stars.
 */
import type { SheetModule } from '../../module'
import { TAU, ease, lag, track, type Key } from '../../motion'
import { C, R, ramp } from '../../palette'
import { Painter, Raster, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  carve,
  cel,
  fill,
  half,
  joint,
  mantle,
  minus,
  oval,
  overlap,
  polygon,
  ribbon,
  shadow,
  smooth,
  spline,
  squircle,
  stampAt,
  tint,
  union,
  within,
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'

const FUR = R.apeCharcoal
const FAR = farRamp(FUR)
/** The silver saddle on the back (and the grey of the fortress dust and stone chips). */
export const SILVER = ramp('#d4d8e6', '#a2a8bc', '#7a8098', '#585c78', '#1c1830')
/** The bare face mask, muzzle, chest plate, knuckles and soles (the portrait's face colours). */
export const SKIN = ramp('#cfc9d8', '#a39cb4', '#7b748c', '#544e66', '#26232f')
/** The police cap. */
export const NAVY = ramp('#7482c4', '#3c4684', '#283060', '#1a1e40', '#1c1830')
const BAND = R.bandana
/** The head is drawn larger than nature. */
const HS = 1.18
const GOLD = R.gold

type Limb = readonly [number, number, number]
type Eyes = 'glare' | 'narrow' | 'wide' | 'shut' | 'hurt' | 'dizzy' | 'tired'
type Mouth = 'shut' | 'grit' | 'open'

export interface ApePose {
  /** Whole figure forward (+) / up (+). */
  x: number
  y: number
  /** Body tilt in degrees (front down +) and squash (+ wider and lower). */
  lean: number
  squash: number
  /** Chest breathing 0..1. */
  breath: number
  /** Head offset from its seat between the shoulders, and nod in degrees (chin down +). */
  head: readonly [number, number]
  nod: number
  /** Lower jaw opening 0..1 (with `mouth: 'open'`). */
  jaw: number
  mouth: Mouth
  tongue: boolean
  eyes: Eyes
  /** Fists relative to their rest place on the ground: forward, lift, turn in degrees (+ knuckles forward-down). */
  aN: Limb
  aF: Limb
  /** Elbows: 1 points back (knuckle stance), −1 points forward/down (arms raised, hands at the chest). */
  bendN: 1 | -1
  bendF: 1 | -1
  /** Feet relative to their rest place: forward, lift, turn in degrees (+ toes up). */
  lN: Limb
  lF: Limb
  /** Cap on its seat: offset and tilt in degrees (+ tipped forward). */
  cap: readonly [number, number, number]
  /** The cap flown off: absolute screen position and turn, or null while it sits on the head. */
  capFree: readonly [number, number, number] | null
  /** Armband tails: direction (0 = hanging down, + swept back) and flutter phase. */
  band: readonly [number, number]
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
  /** Slam dust and stone chips: 0 = the impact … 1 = settled, −1 = none. */
  dust: number
  /** Smear of the near forearm: the fist's previous place (forward, lift), or null. */
  smear: readonly [number, number] | null
  /** The far forearm and fist come round in front of the chest (beating it). */
  farFront: boolean
}

export const apePose = (p: Partial<ApePose> = {}): ApePose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  breath: 0,
  head: [0, 0],
  nod: 0,
  jaw: 0,
  mouth: 'shut',
  tongue: false,
  eyes: 'glare',
  aN: [0, 0, 0],
  aF: [0, 0, 0],
  bendN: 1,
  bendF: 1,
  lN: [0, 0, 0],
  lF: [0, 0, 0],
  cap: [0, 0, 0],
  capFree: null,
  band: [20, 0],
  stars: -1,
  dust: -1,
  smear: null,
  farFront: false,
  ...p
})

/**
 * The whole figure is drawn in figure units, scaled by `S` onto the screen: body shapes, bone lengths, fists, head
 * and cap grow together (the biggest boss fills his 75 px physics box); stamps keep their pixel size.
 */
const S = 1.17
/** Rest places (x relative to the ground frame, in figure units). */
const REST = { aN: 19, aF: 28, lN: -10, lF: -18 } as const
const GROUND_X = 54
/** A screen x a figure-unit distance `u` in front of the ground point (props placed in screen space). */
const gx = (u: number) => GROUND_X + u * S
/** A screen point given in the figure's unscaled layout (absolute cell coordinates around the ground point (58, 120)). */
const fig = (x: number, y: number): Pt => [GROUND_X + (x - 58) * S, 120 - (120 - y) * S]

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = { K: C.inkCool, w: C.white, B: FUR[3], s: SKIN[2] }
/** Small deep-set eyes under the brow: a white, a dark iris looking ahead, one glint. */
const EYES: Record<Eyes, readonly string[]> = {
  glare: ['BBB.....', 'KKBBBB..', 'KwwKKBBB', 'KwwKKwKK', '.KKKKKK.'],
  narrow: ['BBBBBBB', 'BBBBBBB', 'KwwKKwK', '.KKKKK.'],
  wide: ['.KKKKK.', 'KwwwKKK', 'KwwKKwK', 'KwwKKKK', '.KKKKK.'],
  shut: ['BBBBBBB', '.......', 'KKKKKKK', '.K...K.'],
  hurt: ['K.....K', '.KK.KK.', '...K...', '.KK.KK.'],
  dizzy: ['.KKKK..', 'K....K.', 'K.KK.K.', 'K.K..K.', '.K..KK.'],
  tired: ['BBBBBBB', 'BBBBBBB', 'KKKKKKK', '.KwKK..']
}
const EYES_FAR: Record<Eyes, readonly string[]> = {
  glare: ['...BB', '.BBBK', 'BKKwK', 'KwKwK', '.KKK.'],
  narrow: ['BBBBB', 'BBBBB', 'KwKwK', '.KKK.'],
  wide: ['.KKK.', 'KwKKK', 'KwKwK', 'KwKKK', '.KKK.'],
  shut: ['BBBBB', '.....', 'KKKKK', '.K.K.'],
  hurt: ['K...K', '.K.K.', '..K..', '.K.K.'],
  dizzy: ['.KKK.', 'K...K', 'K.K.K', 'K..KK', '.KK..'],
  tired: ['BBBBB', 'BBBBB', 'KKKKK', '.KwK.']
}
/** Big flared nostrils on the flat nose. */
const NOSE = ['.ssss.', 'sKKsKK', 'sKK.KK']
const TEETH_UP = ['wwwwwwwwww', 'W.W.W.W.WW']
const STAR_BADGE = ['..h..', '.hyy.', 'yyyyy', '.yYy.', '.Y.Y.']
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']
/** Four knuckles on the front of a planted fist (h light, s skin, d the creases between the fingers). */
const KNUCKLES = ['.hh.', 'hssd', 'hssd', '.dd.', 'hssd', 'hssd', '.dd.', 'hssd', 'hssd', '.dd.', 'hssd', '.ss.']
/** Toes with pale nails at the front of a foot. */
const TOES = ['h.h.h', 'sdsds']
/** Fur locks that break a silhouette. */
const TUFT_BACK = ['...ff', '..fff', '.ffff', 'ffff.', 'fff..']
const TUFT_DOWN = ['fffff', 'fffff', '.fff.', '.ff..', '..f..']
const TUFT_UP = ['..f..', '.ff..', '.fff.', 'fffff']
const TUFT_ELBOW = ['ffff.', 'fffff', '.ffff', '..fff', '...ff']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)

/** A path from `from` heading in direction `deg` (0 = straight down, + swept back), with a ripple. */
function hangPath(from: Pt, deg: number, len: number, wobble: (s: number) => number): Pt[] {
  const pts: Pt[] = [from]
  const a = (deg * Math.PI) / 180
  const n = 4
  for (let i = 1; i <= n; i++) {
    const s = i / n
    const w = wobble(s)
    pts.push([from[0] - Math.sin(a) * len * s + Math.cos(a) * w, from[1] + Math.cos(a) * len * s + Math.sin(a) * w])
  }
  return spline(pts)
}

/** Direction of a path near its point i, in degrees on screen. */
const heading = (path: readonly Pt[], i: number) => {
  const a = path[Math.max(0, i - 2)]
  const b = path[Math.min(path.length - 1, i + 2)]
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
}

/**
 * The lightest coat colour on the very edge of a part takes the base colour instead, so the outline next to it never
 * sits on a light pixel (the wolf's `dimEdge`, for several ramps). Candidate for the toolkit (`cel` option).
 */
function dimEdge(l: Raster, ramps: readonly Ramp[]) {
  const b = l.bounds()
  if (!b) return
  const src = l.clone()
  const lift = new Map<number, number>()
  for (const r of ramps) lift.set(r[0], r[1])
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const to = lift.get(src.get(x, y))
      if (to !== undefined && !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1)))
        l.set(x, y, to)
    }
}

/** Clears every pixel of the layer outside `shape` (a detail clipped to one volume of a silhouette). */
function keepInside(l: Raster, f: Frame, s: Shape) {
  const b = l.bounds()
  if (!b) return
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (!l.get(x, y)) continue
      const [u, v] = f.local(x + 0.5, y + 0.5)
      if (!s.has(u, v)) l.set(x, y, 0)
    }
}

/** A soft shadow strip just inside one side of a bone (side +1 = the screen-right side of a → b). */
function crease(a: Pt, b: Pt, ra: number, rb: number, side: 1 | -1): Shape {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const n: Pt = [(-(b[1] - a[1]) / d) * side, ((b[0] - a[0]) / d) * side]
  const pa: Pt = [a[0] + n[0] * (ra - 3), a[1] + n[1] * (ra - 3)]
  const pb: Pt = [b[0] + n[0] * (rb - 2.5), b[1] + n[1] * (rb - 2.5)]
  return overlap(capsule(pa, pb, 3.2, 2.5), half(pa, n[0], n[1]))
}

/** The fist on its own frame (origin under the knuckles, u forward): a boulder with the thumb side on top. */
const fistShape = (): Shape => union(squircle(0.5, -7, 8.6, 7, 2.5), oval(-3.5, -10.5, 6, 4.8))

/** A foot on its own frame (origin under the sole): long, with the big toe forward; flat where it stands. */
const footShape = (grounded: boolean): Shape => {
  const s = union(oval(1.5, -3, 7, 3.4), oval(-2.5, -4.6, 4, 3.6))
  return grounded ? overlap(s, half([0, -0.4], 0, -1)) : s
}

// ------------------------------------------------------------------------------------------------ drawing

export function drawApe(p: ApePose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const k = 1 + p.squash * 0.05
  const ground = Frame.at(GROUND_X + Math.round(p.x * S), 120, 0, S)
  const root = Frame.at(ground.e, 120 - Math.round(p.y * S), 0, S)
  const torso = root.child(0, -36, p.lean, k, 1 / k)
  const br = p.breath
  const head = torso.child(30 + p.head[0], 0 + p.head[1], p.nod - p.lean * 0.75, HS)
  const chestAt = torso.pt(8, -6)

  // ---- arms: shoulder on the body, elbow by the rig, wrist on the fist's own frame
  const armGeo = (limb: Limb, rest: number, near: boolean, bend: 1 | -1) => {
    const target = ground.child(rest + limb[0], -limb[1], limb[2])
    const s = torso.pt(near ? 8 : 15, near ? -4 : -8)
    const want = target.pt(-3, -9)
    // limbs may cheat: an arm thrown overhead grows up to a fifth longer
    const bone = Math.max(17.5 * S, Math.min(21 * S, Math.hypot(want[0] - s[0], want[1] - s[1]) / 2 + 0.4 * S))
    const j = joint(s, want, bone, bone, bend)
    // a fist out of reach follows the wrist
    const f = target.moved(j.end[0] - want[0], j.end[1] - want[1])
    return { f, s, mid: j.mid, end: j.end }
  }
  type Arm = ReturnType<typeof armGeo>
  const armN = armGeo(p.aN, REST.aN, true, p.bendN)
  const armF = armGeo(p.aF, REST.aF, false, p.bendF)

  // ---- legs: short, bowed, the knee forward
  const legGeo = (limb: Limb, rest: number, near: boolean) => {
    const f = ground.child(rest + limb[0], -limb[1], -limb[2])
    const s = torso.pt(near ? -15 : -20, near ? 13 : 11)
    const end = f.pt(-2.5, -5)
    const j = joint(s, end, 12 * S, 11 * S, -1)
    return { f, s, mid: j.mid, end: j.end, grounded: limb[1] < 0.6 && Math.abs(limb[2]) < 10 }
  }
  type Leg = ReturnType<typeof legGeo>
  const legN = legGeo(p.lN, REST.lN, true)
  const legF = legGeo(p.lF, REST.lF, false)

  /** The body silhouette in torso units (the near upper arm and thigh are added in screen space). */
  const neckEnd = torso.local(...head.pt(-4, 2))
  const bodyShape = union(
    oval(8, -6 - br * 1.2, 19 + br * 0.6, 17 + br * 1.2),
    capsule([6, -8 - br * 0.6], [-15, 1], 15, 12),
    oval(-19, 6, 12, 11.5),
    capsule([12, -6], neckEnd, 11, 9)
  )

  /** The forearm: what hangs free below the shoulder, thickest just below the elbow. */
  const foreArm = (l: Raster, arm: Arm, tone: Ramp, smear: Frame | null) => {
    const bulge: Pt = [arm.mid[0] * 0.65 + arm.end[0] * 0.35, arm.mid[1] * 0.65 + arm.end[1] * 0.35]
    fill(l, ID, union(capsule(arm.mid, arm.end, 7.6 * S, 6.4 * S), oval(bulge[0], bulge[1], 8.6 * S, 8.6 * S)), tone[1])
    // one frame of a blur: the forearm doubled along its path
    if (smear) fill(l, ID, capsule(arm.end, smear.pt(-3, -9), 7.5 * S, 7.5 * S), tone[1])
    // the fur at the back of the forearm
    const a = (Math.atan2(arm.end[1] - arm.mid[1], arm.end[0] - arm.mid[0]) * 180) / Math.PI
    stampAt(l, Frame.at(arm.mid[0], arm.mid[1], a, S), TUFT_ELBOW, 2, 6.5, { f: tone[1] })
  }
  const knuckles = (l: Raster, arm: Arm, tone: Ramp, far: boolean) => {
    const key = far ? { h: SKIN[1], s: SKIN[2], d: SKIN[3] } : { h: SKIN[0], s: SKIN[1], d: SKIN[2] }
    within(l, (m) => stampAt(m, arm.f, KNUCKLES, 7.5, -7, key))
    void tone
  }

  // ---- far arm and far leg (a ramp step darker), behind everything
  const farDepth = p.farFront ? 3.6 : -4
  g.add(-4, (l) => {
    fill(l, ID, capsule(armF.s, armF.mid, 9 * S, 7.5 * S), FAR[1])
    if (!p.farFront) foreArm(l, armF, FAR, null)
    smooth(l)
    cel(l, { shade: 3, rim: 1.2 })
    if (!p.farFront) shadow(l, torso.moved(0, 2), bodyShape)
  })
  if (p.farFront)
    g.add(farDepth, (l) => {
      foreArm(l, armF, FAR, null)
      smooth(l)
      cel(l, { shade: 3, rim: 1.2 })
    })
  g.add(farDepth + 0.1, (l) => {
    fill(l, armF.f, fistShape(), FAR[1])
    smooth(l)
    cel(l, { shade: 2.6, rim: 1.2 })
    knuckles(l, armF, FAR, true)
  })
  const lowerLeg = (l: Raster, leg: Leg, tone: Ramp) => {
    fill(l, ID, capsule(leg.mid, leg.end, 5.6 * S, 4.6 * S), tone[1])
    fill(l, leg.f, footShape(leg.grounded), tone[1])
  }
  const toes = (l: Raster, leg: Leg, far: boolean) => {
    const key = far ? { h: SKIN[2], s: SKIN[3], d: FUR[3] } : { h: SKIN[1], s: SKIN[2], d: FUR[3] }
    within(l, (m) => stampAt(m, leg.f, TOES, 6, -1.5, key))
  }
  g.add(-3, (l) => {
    fill(l, ID, capsule(legF.s, legF.mid, 7 * S, 5.6 * S), FAR[1])
    lowerLeg(l, legF, FAR)
    smooth(l)
    cel(l, { shade: 2.4, rim: 1 })
    shadow(l, torso.moved(0, 2), bodyShape)
    toes(l, legF, true)
  })

  // ---- the body: chest, shoulders, back, rump, near upper arm and thigh as ONE silhouette, shaded once
  const bandAt = (t: number): Pt => [
    armN.s[0] + (armN.mid[0] - armN.s[0]) * t,
    armN.s[1] + (armN.mid[1] - armN.s[1]) * t
  ]
  const armDeg = (Math.atan2(armN.mid[1] - armN.s[1], armN.mid[0] - armN.s[0]) * 180) / Math.PI
  const bandFrame = Frame.at(...bandAt(0.52), armDeg, S)
  /** The near upper arm and thigh in screen space (radii in figure units scaled). */
  const upper = capsule(armN.s, armN.mid, 10.5 * S, 8 * S)
  const thigh = capsule(legN.s, legN.mid, 8 * S, 6 * S)
  g.add(0, (l) => {
    fill(l, torso, bodyShape, FUR[1])
    fill(l, ID, upper, FUR[1])
    fill(l, ID, thigh, FUR[1])
    // fur locks: on the rump, under the belly, at the back of the thigh and the shoulder
    stampAt(l, torso, TUFT_BACK, -31, 3, { f: FUR[1] })
    stampAt(l, torso, TUFT_DOWN, -3, 12.5 + br * 0.4, { f: FUR[1] })
    stampAt(l, torso, TUFT_DOWN, -24, 16.5, { f: FUR[1] })
    stampAt(l, torso, TUFT_UP, -8, -21, { f: FUR[1] })
    smooth(l)
    // the silver saddle: a broad cape from behind the shoulders to the rump, ending in fur locks on both sides
    const saddleOrigin = torso.pt(-6, -12)
    const keep = new Raster(128, 128)
    fill(keep, torso, union(oval(-8, -4, 23, 22), oval(-24, 4, 9, 14)), 1)
    fill(keep, torso, oval(13, -10, 13, 19), 0)
    mantle(l, FUR[1], SILVER[1], { depth: 8, tooth: 4, pitch: 5, origin: saddleOrigin })
    {
      // the silver only where the saddle lies (the shoulder hump and the arm stay charcoal), toothed at its front
      const bb = l.bounds()!
      for (let y = bb.y; y < bb.y + bb.h; y++)
        for (let x = bb.x; x < bb.x + bb.w; x++) {
          if (l.get(x, y) !== SILVER[1]) continue
          const [u, v] = torso.local(x + 0.5, y + 0.5)
          const lock = ((((v - u * 0.4) % 5) + 5) % 5) * 0.8
          if (!keep.get(x, y) || u > 5 - lock) l.set(x, y, FUR[1])
        }
    }
    // the paler chest plate between the arm and the neck
    tint(l, torso, union(oval(19, 2 + br * 0.4, 7.5, 10 + br), oval(14, 9, 6, 5)), SKIN[2])
    cel(l, { shade: 11, deep: 4, rim: 2.4, tooth: 3, pitch: 5, origin: chestAt })
    dimEdge(l, [SILVER, FUR])
    // muscles are soft shadows: under the shoulder, the triceps, in front of the thigh
    shadow(l, ID, crease(armN.s, armN.mid, 10.5 * S, 8 * S, armN.mid[0] >= armN.s[0] ? -1 : 1))
    shadow(l, ID, crease(legN.s, legN.mid, 8 * S, 6 * S, legN.mid[1] >= legN.s[1] ? -1 : 1))
    shadow(l, torso, overlap(oval(19, 2, 8.5, 11), half([19, 6], 0, 1)))
    // the gang's red band round the upper arm: a lit upper edge and a fold
    within(l, (m) => {
      fill(m, bandFrame, squircle(0, 0, 2.6, 12, 4), BAND[1])
      fill(m, bandFrame, squircle(-2, 0, 0.8, 12, 4), BAND[0])
      fill(m, bandFrame, squircle(2.2, 0, 0.8, 12, 4), BAND[2])
      keepInside(m, ID, upper)
    })
  })

  // ---- near leg below the body
  g.add(1, (l) => {
    lowerLeg(l, legN, FUR)
    smooth(l)
    cel(l, { shade: 2.6, rim: 1 })
    toes(l, legN, false)
  })

  // ---- armband tails: two short cut ends from the knot at the back of the arm
  const knot = bandFrame.pt(0, 9)
  g.add(1.5, (l) => {
    const wave = (s: number) => Math.sin(p.band[1] - s * 3) * s * 1.6 * S
    for (const [d, len] of [
      [p.band[0] + 12, 10 * S],
      [p.band[0] - 6, 8 * S]
    ] as const) {
      const path = hangPath(knot, d, len, wave)
      ribbon(l, path, (t) => (3 + t * 1.6) * S, BAND[1])
      const n = path.length - 1
      carve(
        l,
        Frame.at(path[n][0], path[n][1], heading(path, n)),
        polygon([
          [2.5, -2.4],
          [-1.2, 0],
          [2.5, 2.4]
        ])
      )
    }
    fill(l, Frame.at(knot[0], knot[1], 0, S), oval(0, 0, 2.2, 2.2), BAND[1])
    cel(l, { shade: 1.4, rim: 1 })
  })

  // ---- the head's shapes (head units: the face looks right; the jaw hinge sits near (1, 7))
  const skull = oval(-1.5, -3, 12, 11.5)
  const brow = capsule([-2, -6.5], [11.5, -5], 3.8, 3.3)
  const muzzle = union(oval(7.5, 4.5, 9, 6.4), oval(3, 1, 6, 6))
  const headShape = union(skull, brow, muzzle)

  // ---- far ear
  g.add(3.5, (l) => {
    fill(l, head, oval(2.5, -1, 3, 3.6), FAR[1])
    cel(l, { shade: 1.4 })
  })

  // ---- mouth and lower jaw
  const open = p.mouth === 'open' && p.jaw > 0.08
  const jaw = head.child(1, 7.5, open ? p.jaw * 26 : 0)
  if (open)
    g.add(
      3.7,
      (l) => {
        fill(l, ID, polygon([head.pt(1, 6.5), head.pt(15.5, 6.5), jaw.pt(14, 0.5), jaw.pt(0, 0.5)]), C.mouth)
        if (p.tongue || p.jaw > 0.5) fill(l, jaw, oval(9, -0.5, 4.6, 1.8), C.tongue)
      },
      false
    )
  g.add(3.8, (l) => {
    fill(l, jaw, union(capsule([-1, 1], [12.5, 1.6], 4.4, 3.6), oval(4, 3, 6, 3)), SKIN[1])
    cel(l, { shade: 1.8 })
    if (open) within(l, (m) => stampAt(m, jaw, ['W.....W', 'w.....w'], 9, -2.4, { w: C.white, W: SKIN[0] }))
  })
  if (p.tongue && open)
    g.add(3.85, (l) => {
      fill(l, jaw, union(capsule([7, -0.5], [12, 3], 2.2, 2.2), oval(12.2, 4.2, 2.4, 2.4)), C.tongue)
    })

  // ---- head: skull, brow ridge and muzzle as one silhouette
  const headAt = head.pt(-1.5, -3)
  g.add(4, (l) => {
    fill(l, head, headShape, FUR[1])
    stampAt(l, head, TUFT_BACK, -12.5, 2, { f: FUR[1] })
    stampAt(l, head, TUFT_DOWN, -6, 9, { f: FUR[1] })
    smooth(l)
    // the bare face mask and muzzle (the brow stays fur)
    tint(l, head, minus(union(oval(5, 0.5, 8, 7.5), muzzle), brow), SKIN[1])
    if (open) carve(l, head, overlap(oval(8, 9, 9, 3.4), half([0, 7], 0, 1)))
    cel(l, { shade: 4.5, deep: 1.5, rim: 1.8, tooth: 1.5, pitch: 4, origin: headAt })
    dimEdge(l, [FUR, SKIN])
    // the brow throws the eyes into shadow
    shadow(l, head, capsule([0, -2.4], [12, -1.8], 1.4, 1.2))
    shadow(l, head, oval(1, 7.8, 9, 1.4))
  })

  // ---- face
  g.add(
    4.2,
    (l) => {
      stampAt(l, head, EYES[p.eyes], 3.5, -0.5, EYE_KEY)
      stampAt(l, head, EYES_FAR[p.eyes], 11, -0.5, EYE_KEY)
      stampAt(l, head, NOSE, 12.5, 3, { K: C.inkCool, s: SKIN[3] })
      const tooth = { w: C.white, W: SKIN[0] }
      if (p.mouth === 'shut')
        stampAt(l, head, ['KK..........', '.KKKKKKKKKK.', '..........KK'], 9.5, 8.5, { K: C.inkCool })
      else if (p.mouth === 'grit')
        stampAt(l, head, ['KKKKKKKKKKK', 'KwwwwwwwwwK', 'KKKKKKKKKKK'], 9.5, 8.5, { K: C.inkCool, ...tooth })
      else stampAt(l, head, TEETH_UP, 8.5, 7.6, tooth)
    },
    false
  )

  // ---- near ear: small, low on the side of the head
  g.add(4.5, (l) => {
    fill(l, head, oval(-8, 1, 3, 3.8), FUR[1])
    tint(l, head, oval(-7.6, 1.6, 1.2, 1.8), FUR[3])
    cel(l, { shade: 1.4, rim: 1 })
  })

  // ---- the police cap on its own frame: navy crown, darker band and peak, a gold star
  const capFrame = p.capFree
    ? Frame.at(...fig(p.capFree[0], p.capFree[1]), p.capFree[2], S * HS)
    : head.child(-0.5 + p.cap[0], -11.5 + p.cap[1], p.cap[2])
  g.add(5, (l) => {
    fill(l, capFrame, union(squircle(0.5, -4.2, 12.6, 5.2, 2.8), squircle(1, 0.2, 11, 2.8, 4)), NAVY[1])
    tint(l, capFrame, overlap(squircle(1, 0.2, 11, 2.8, 4), half([0, -0.8], 0, 1)), NAVY[2])
    smooth(l)
    cel(l, { shade: 2.2, rim: 1.2 })
    within(l, (m) => stampAt(m, capFrame, STAR_BADGE, 5.5, -4.5, { y: GOLD[1], Y: GOLD[2], h: GOLD[0] }))
  })
  g.add(5.2, (l) => {
    fill(
      l,
      capFrame,
      polygon([
        [5, 0.6],
        [17.5, 2.6],
        [16.5, 4.6],
        [4, 3.6]
      ]),
      NAVY[2]
    )
    cel(l, { shade: 1, rim: 1 })
  })

  // ---- near forearm and fist, in front of everything
  const smear = p.smear ? ground.child(REST.aN + p.smear[0], -p.smear[1], p.aN[2]) : null
  g.add(6, (l) => {
    foreArm(l, armN, FUR, smear)
    smooth(l)
    cel(l, { shade: 3.4, deep: 1.2, rim: 1.6, tooth: 2, pitch: 4, origin: armN.mid })
    dimEdge(l, [FUR])
    if (smear) {
      // speed lines in the coat's own colours across the blur
      for (const o of [-3, 0, 3]) {
        const a = smear.pt(-2, -6 + o)
        const b = armN.f.pt(-2, -6 + o)
        within(l, (m) => fill(m, ID, capsule(a, b, 0.5, 0.5), FUR[0]), true)
      }
    }
  })
  g.add(6.1, (l) => {
    fill(l, armN.f, fistShape(), FUR[1])
    if (smear) {
      fill(l, smear, fistShape(), FUR[1])
      fill(l, ID, capsule(armN.f.pt(0, -7), smear.pt(0, -7), 7, 7), FUR[1])
    }
    smooth(l)
    cel(l, { shade: 3.2, deep: 1.2, rim: 1.6 })
    dimEdge(l, [FUR])
    knuckles(l, armN, FUR, false)
  })

  // ---- slam dust and stone chips
  if (p.dust >= 0) {
    const d = p.dust
    const puffs = (l: Raster, front: boolean) => {
      for (const side of [-1, 1]) {
        const cx = gx((side < 0 ? -22 : REST.aF + 8) + side * d * 6)
        const r = (6 + d * 3) * S
        if (front !== side > 0) continue
        fill(l, Frame.at(cx, 120 - (3 + d * 2) * S), oval(0, 0, r, r * 0.6), SKIN[1])
        fill(l, Frame.at(cx + side * (r * 0.9), 120 - (4 + d * 4) * S), oval(0, 0, r * 0.55, r * 0.5), SKIN[1])
      }
      cel(l, { shade: 1.6, rim: 1 })
      dimEdge(l, [SKIN])
    }
    if (d < 0.95) {
      g.add(-6, (l) => puffs(l, false))
      g.add(7, (l) => puffs(l, true))
    }
    // stone chips arc out of the slam
    if (d < 0.7)
      g.add(7.5, (l) => {
        for (const [vx, vy, s] of [
          [16, 30, 1.6],
          [26, 18, 1.2],
          [-10, 26, 1.3]
        ] as const) {
          const t = 0.25 + d * 0.9
          const cx = gx(REST.aN + 8 + vx * t)
          const cy = 120 - (4 + vy * t - 30 * t * t) * S
          fill(l, Frame.at(Math.round(cx), Math.round(cy), 20), squircle(0, 0, s + 0.6, s, 3), SILVER[2])
        }
        cel(l, { rim: 1 })
      })
  }

  // ---- stars over a knocked-out head, outlined
  if (p.stars >= 0)
    g.add(8, (l) => {
      const [cx, cy] = head.pt(0, -20)
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 13 * S) - 2,
          Math.round(cy + Math.sin(a) * 3.5 * S) - 2,
          { y: GOLD[1], Y: GOLD[0] }
        )
      }
    })

  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const P = apePose
const phase = (i: number, n: number) => (i / n) * TAU
const sample = (base: ApePose, keys: readonly Key<ApePose>[], n: number, period?: number) => {
  const at = track(base, keys, period)
  return Array.from({ length: n }, (_, i) => at(i))
}

/** idle: on his knuckles, breathing hard, the head turning to keep the hero in view, a fist thumping, the cap late. */
const idle = memo(() => {
  const N = 6
  const breath = [0, 0.55, 1, 0.85, 0.35, 0.1]
  const lift = [0, 2, 6, 7, 0, 0]
  const capLag = lag(
    breath.map((b, i) => b - (i === 4 ? 1.5 : 0)),
    { stiffness: 0.35, damping: 0.45, loop: true }
  )
  return Array.from({ length: N }, (_, i) =>
    P({
      y: breath[i] * 0.6 - (i === 4 ? 1 : 0),
      lean: -breath[i] * 1.5,
      breath: breath[i],
      head: [i === 2 || i === 3 ? 1 : 0, -breath[i] * 2.4],
      nod: [0, -2, -4, -3, 3, 1][i],
      eyes: i === 4 ? 'narrow' : 'glare',
      mouth: i === 4 ? 'grit' : 'shut',
      aN: [[0, -1, -1, 1, 1, 0][i], lift[i], [0, -8, -18, -14, 0, 0][i]],
      cap: [0, Math.round(capLag[i] * 1.6), Math.round(-capLag[i] * 4)],
      band: [20 + Math.sin(phase(i, N)) * 6, phase(i, N)]
    })
  )
})

/** intro: a deep breath, he rises, beats his chest left-right-left (one smear), roars with the head back, drops. */
const intro = memo(() => {
  const up: Partial<ApePose> = {
    y: 12,
    lean: -48,
    bendN: -1,
    bendF: -1,
    lN: [4, 0, 0],
    lF: [2, 0, 0]
  }
  return [
    P({ y: 2, lean: -6, breath: 1, head: [0, -2], nod: -8, eyes: 'narrow', cap: [0, -1, -4], band: [10, 0] }),
    P({
      ...up,
      breath: 1,
      head: [0, 1],
      nod: 6,
      eyes: 'glare',
      mouth: 'grit',
      aN: [-13, 52, -80],
      aF: [-8, 55, -70],
      cap: [0, 1, 4],
      band: [40, 1]
    }),
    P({
      ...up,
      breath: 0.8,
      head: [1, 0],
      eyes: 'wide',
      mouth: 'open',
      jaw: 0.5,
      aN: [-10, 58, -90],
      aF: [6, 44, -30],
      cap: [0, -2, -2],
      band: [0, 2]
    }),
    P({
      ...up,
      breath: 0.9,
      head: [1, 0],
      eyes: 'wide',
      mouth: 'open',
      jaw: 0.7,
      aN: [-2, 46, -40],
      smear: [-10, 58],
      aF: [-8, 58, -90],
      farFront: true,
      cap: [0, 1, 3],
      band: [-10, 3]
    }),
    P({
      ...up,
      breath: 1,
      head: [1, 0],
      eyes: 'wide',
      mouth: 'open',
      jaw: 0.8,
      aN: [-10, 58, -90],
      aF: [6, 44, -30],
      cap: [0, -2, -3],
      band: [30, 4]
    }),
    P({
      ...up,
      y: 13,
      lean: -52,
      breath: 1,
      head: [-1, -2],
      nod: -30,
      eyes: 'shut',
      mouth: 'open',
      jaw: 1,
      aN: [-10, 30, -40],
      aF: [-2, 34, -30],
      cap: [-1, -1, -14],
      band: [50, 5]
    }),
    P({ y: 1, lean: 3, head: [1, 1], nod: 4, eyes: 'glare', mouth: 'grit', cap: [0, 1, 5], band: [10, 6] }),
    P({
      y: 0.4,
      lean: 2,
      breath: 0.5,
      head: [1, 0],
      nod: 3,
      eyes: 'glare',
      mouth: 'grit',
      cap: [0, 0, 2],
      band: [16, 7.4]
    })
  ]
})

/** hurt: the cap jumps, eyes shut, a fist up to guard; recoil; he straightens the cap with a glare. */
const hurt = memo(() => [
  P({
    x: -2,
    y: 3,
    lean: -12,
    head: [-2, -2],
    nod: -14,
    eyes: 'hurt',
    mouth: 'open',
    jaw: 0.6,
    aN: [-12, 26, -60],
    bendN: -1,
    cap: [-1, -6, -18],
    band: [-10, 0]
  }),
  P({
    x: -5,
    y: 0,
    lean: -6,
    head: [-1, 1],
    nod: 4,
    eyes: 'shut',
    mouth: 'grit',
    aN: [-8, 12, -30],
    cap: [-1, -1, 12],
    band: [40, 1.5]
  }),
  P({
    x: -3,
    lean: -2,
    head: [0, 0],
    nod: 2,
    eyes: 'narrow',
    mouth: 'grit',
    aN: [-14, 34, -80],
    bendN: -1,
    cap: [0, 0, 4],
    band: [20, 3]
  })
])

/** move: the knuckle walk — fists reach and plant, the body swings between the arms, the legs catch up. */
const move = memo(() => {
  const N = 8
  /** A fist or foot: planted and sliding back for `stance` of the cycle, then swinging forward on an arc. */
  const stride = (s: number, reach: number, height: number, stance: number) => {
    const t = ((s % 1) + 1) % 1
    if (t < stance) return [reach - (2 * reach * t) / stance, 0, 0] as const
    const u = (t - stance) / (1 - stance)
    return [-reach + 2 * reach * ease.inOut(u), Math.sin(u * Math.PI) * height, -Math.sin(u * Math.PI) * 25] as const
  }
  const bob = Array.from({ length: N }, (_, i) => -Math.cos(phase(i, N) * 2) * 1.2)
  const capLag = lag(bob, { stiffness: 0.35, damping: 0.4, loop: true })
  return Array.from({ length: N }, (_, i) => {
    const s = i / N
    const roll = Math.sin(phase(i, N))
    const fN = stride(s, 7, 7, 0.5)
    const fF = stride(s + 0.5, 7, 6, 0.5)
    const lN = stride(s + 0.3, 6, 4, 0.7)
    const lF = stride(s + 0.8, 6, 4, 0.7)
    return P({
      x: 0,
      y: bob[i],
      lean: 3 + roll * 2.5,
      breath: 0.3 + roll * 0.2,
      head: [1, -bob[i] * 0.5],
      nod: -roll * 3,
      eyes: 'glare',
      mouth: i % 4 === 1 ? 'grit' : 'shut',
      aN: [fN[0], fN[1], fN[2]],
      aF: [fF[0], fF[1], fF[2]],
      lN: [lN[0], lN[1], -lN[2] * 0.6],
      lF: [lF[0], lF[1], -lF[2] * 0.6],
      cap: [0, Math.round(capLag[i] * 1.5), Math.round(-capLag[i] * 3)],
      band: [34 + roll * 8, phase(i, N) * 2]
    })
  })
})

/** windup: the crouch before the leap — fists wide, hips dropped, shoulders up, eyes on the hero; trembles. */
const windup = memo(() => {
  const set: Partial<ApePose> = {
    y: -9,
    lean: 6,
    squash: 1.4,
    breath: 1,
    head: [-2, 5],
    nod: -6,
    eyes: 'glare',
    mouth: 'grit',
    aN: [6, 0, 0],
    aF: [11, 0, 0],
    lN: [3, 0, 0],
    lF: [1, 0, 0],
    band: [50, 0]
  }
  return [
    P({ ...set, y: -4, squash: 0.6, head: [-1, 3], eyes: 'narrow', aN: [4, 2, -10], aF: [7, 1, 0], cap: [0, 1, 3] }),
    P({ ...set, y: -8, cap: [0, -1, -2], band: [60, 1] }),
    P({ ...set, x: -0.6, cap: [0, 0, 1], band: [56, 2.5] }),
    P({ ...set, x: 0.6, y: -9.4, head: [-2, 5.4], cap: [0, 1, 2], band: [62, 4] })
  ]
})

/** air: 0 rising, arms thrown up, legs tucked; 1 the top, fists locked overhead; 2 falling, fists driving down. */
const air = memo(() => [
  P({
    y: 10,
    lean: -30,
    squash: -1.6,
    head: [0, -1],
    nod: -14,
    eyes: 'wide',
    mouth: 'open',
    jaw: 0.6,
    aN: [-8, 96, -170],
    aF: [-2, 98, -170],
    bendN: -1,
    bendF: -1,
    lN: [2, 8, 30],
    lF: [-2, 10, 30],
    cap: [0, 2, -6],
    band: [-20, 0]
  }),
  P({
    y: 8,
    lean: -14,
    squash: 0.6,
    head: [0, 1],
    nod: 2,
    eyes: 'glare',
    mouth: 'grit',
    aN: [-4, 90, -190],
    aF: [0, 92, -190],
    bendN: 1,
    bendF: 1,
    lN: [6, 12, 40],
    lF: [2, 13, 40],
    cap: [0, -2, -4],
    band: [10, 1.5]
  }),
  P({
    y: 6,
    lean: 10,
    squash: -1.2,
    head: [2, -6],
    nod: -14,
    eyes: 'wide',
    mouth: 'open',
    jaw: 0.9,
    aN: [27, 10, 80],
    aF: [33, 12, 80],
    bendN: -1,
    bendF: -1,
    lN: [-10, 10, -30],
    lF: [-14, 12, -30],
    cap: [-1, -3, -10],
    band: [70, 3]
  })
])

/** land: both fists hit the ground, the body squashes over them, dust and chips fly; a rebound; back on his knuckles. */
const land = memo(() => [
  P({
    y: -10,
    lean: 10,
    squash: 2.6,
    head: [3, -1],
    nod: -10,
    eyes: 'shut',
    mouth: 'open',
    jaw: 0.7,
    aN: [8, 0, 10],
    aF: [12, 0, 10],
    lN: [-2, 0, 0],
    lF: [-3, 0, 0],
    cap: [0, -4, 8],
    band: [-10, 0],
    dust: 0
  }),
  P({
    y: -5,
    lean: 6,
    squash: 1.2,
    head: [1, 3],
    nod: 3,
    eyes: 'glare',
    mouth: 'grit',
    aN: [7, 0, 4],
    aF: [11, 0, 4],
    lN: [-1, 0, 0],
    lF: [-2, 0, 0],
    cap: [0, 1, 6],
    band: [50, 1.5],
    dust: 0.35
  }),
  P({
    y: -1,
    lean: 2,
    head: [1, 0],
    eyes: 'glare',
    mouth: 'grit',
    aN: [4, 5, -14],
    aF: [8, 4, -10],
    cap: [0, -1, 0],
    band: [10, 3],
    dust: 0.7
  }),
  P({ lean: 1, breath: 0.4, eyes: 'glare', aN: [1, 0, 0], aF: [2, 0, 0], cap: [0, 0, 1], band: [24, 4.5], dust: 0.9 })
])

/** recover: sat back on his rump, wiping his brow with a forearm, chest heaving, the cap pushed back. */
const recover = memo(() =>
  [0, 1, 0.3, 0.8].map((pant, i) =>
    P({
      x: -2,
      y: -6 - pant,
      lean: -22,
      breath: pant,
      head: [2, 7],
      nod: -4 - pant * 3,
      eyes: 'tired',
      mouth: 'open',
      jaw: 0.3 + pant * 0.3,
      tongue: true,
      aN: [[14, 20, 24, 18][i], [59, 60, 59, 60][i], -170],
      bendN: -1,
      aF: [-6, 0, 0],
      lN: [10, 0, 0],
      lF: [8, 0, 0],
      cap: [-6, -5 - pant * 0.5, -26],
      band: [10 + pant * 6, i * 1.6]
    })
  )
)

/** defeat: the jolt (the cap flies), he sways, tries a salute, topples onto his face with a bounce, out cold. */
const defeat = memo(() => {
  // flat on his belly, the cheek on the floor facing out, arms limp, feet up behind, the cap on his back
  const flat: Partial<ApePose> = {
    x: -4,
    y: -12,
    lean: 4,
    squash: 1.2,
    breath: 0,
    head: [2, 4],
    nod: 4,
    eyes: 'dizzy',
    mouth: 'open',
    jaw: 0.35,
    tongue: true,
    aN: [-17, 0, -10],
    aF: [25, 0, 30],
    bendN: 1,
    bendF: -1,
    lN: [-6, 8, 70],
    lF: [-10, 6, 60],
    capFree: [52, 78, -6],
    band: [70, 0]
  }
  return [
    P({
      x: -2,
      y: 4,
      lean: -14,
      head: [-1, -2],
      nod: -12,
      eyes: 'wide',
      mouth: 'open',
      jaw: 0.7,
      aN: [-6, 20, -40],
      aF: [2, 16, -30],
      capFree: [74, 40, -30],
      band: [-20, 0]
    }),
    P({
      x: -4,
      y: 6,
      lean: -24,
      head: [-1, 0],
      nod: 10,
      eyes: 'dizzy',
      mouth: 'open',
      jaw: 0.3,
      tongue: true,
      aN: [-10, 4, -10],
      aF: [-4, 0, 0],
      lN: [2, 0, 0],
      capFree: [56, 44, -90],
      band: [30, 1]
    }),
    P({
      x: -3,
      y: 8,
      lean: -30,
      head: [0, 0],
      nod: 6,
      eyes: 'dizzy',
      mouth: 'grit',
      aN: [-8, 52, -100],
      bendN: -1,
      aF: [-6, 0, 0],
      lN: [3, 0, 0],
      capFree: [40, 34, -170],
      band: [0, 2]
    }),
    P({
      x: 0,
      y: -1,
      lean: 30,
      head: [2, 2],
      nod: 12,
      eyes: 'hurt',
      mouth: 'open',
      jaw: 0.5,
      aN: [12, 10, 40],
      aF: [17, 8, 40],
      bendN: -1,
      bendF: -1,
      lN: [-2, 4, 20],
      lF: [-5, 2, 20],
      capFree: [38, 50, -200],
      band: [-30, 3]
    }),
    P({ ...flat, y: -13, squash: 2.4, head: [2, 3], eyes: 'shut', jaw: 0.6, capFree: [46, 62, -40], band: [-40, 4] }),
    P({
      ...flat,
      y: -11,
      squash: 0.2,
      head: [2, 4],
      nod: -4,
      eyes: 'hurt',
      lN: [-4, 14, 90],
      lF: [-8, 12, 80],
      capFree: [50, 76, -16],
      band: [60, 5]
    }),
    P({ ...flat, stars: 0, band: [80, 6] }),
    P({ ...flat, stars: 1 / 6, breath: 0.6, band: [78, 7.4] })
  ]
})

const draw = (poses: ApePose[]) => poses.map(drawApe)

export const sheets: SheetModule = {
  apeBoss: () => ({
    idle: lazyAnim(() => draw(idle()), 8, true),
    intro: lazyAnim(() => draw(intro()), 10, false, { sustain: 2, hold: [2, 1, 1, 1, 1, 3, 1, 1] }),
    hurt: lazyAnim(() => draw(hurt()), 12, false),
    defeat: lazyAnim(() => draw(defeat()), 10, false, { sustain: 2 }),
    move: lazyAnim(() => draw(move()), 10, true),
    windup: lazyAnim(() => draw(windup()), 10, false, { sustain: 2 }),
    air: lazyAnim(() => draw(air()), 8, false),
    land: lazyAnim(() => draw(land()), 14, false, { hold: [2, 1, 1, 2] }),
    recover: lazyAnim(() => draw(recover()), 6, true)
  })
}

/** Exposed for the tests. */
export const apeSample = sample
