/**
 * ネズミ団員 (`walker`): the commonest thug of the ばくろ団 — a sly little rat. On guard he stands up on his hind
 * legs like a look-out, back hunched, belly out, paws held in front of the chest; on the move he drops forward into
 * a low scurry. Signature shapes: the big thin ear and the long pink S-tail; a black bandit mask with bright eyes
 * that act, the gang's red bandana, grabby pink paws. 64×64 cell, feet on (32, 60), 44×38 box.
 *
 * Depth (back to front): far ear, far bandana tail, tail, near bandana tail, far arm, far leg, far foot, body (with
 * the near thigh and shank), near foot, near upper arm, bandana, knot, near ear, head, face, near paw.
 */
import { C, R, ramp } from '../../palette'
import { TAU, ease, lag, track } from '../../motion'
import { Painter, Raster, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  cel,
  fill,
  joint,
  minus,
  overlap,
  oval,
  polygon,
  ribbon,
  shadow,
  sheen,
  smooth,
  spline,
  stampAt,
  tint,
  union,
  within,
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'
import { BANDANA_FIT, bandanaKnot, bandanaTail, neckerchief, wavePath } from './kit'

/** A clean, slightly cool grey that stands apart from grass, cave rock and brick. */
export const RAT_FUR = ramp('#f1f2f8', '#b8bccc', '#8a8ea8', '#5d5f80', '#1c1830')
const FUR = RAT_FUR
const FUR_FAR = farRamp(FUR)
const MASK = ramp('#58546c', '#2c2939', '#211e2c', '#181622', '#1c1830')
const CREAM = R.cream
const PINK = R.hamEar
const PINK_FAR = farRamp(PINK)
/** The bare tail: a soft pink with its own lit step (the ear pinks' lightest step has nothing above it). */
const TAIL = ramp('#ffdbe7', '#f9adc8', '#d0709a', '#a04a74', '#1c1830')
const TEETH = ramp('#fffef9', '#f7f2e8', '#d9ccbd', '#a8927f', '#3a1a22')

export type RatEyes = 'shifty' | 'alert' | 'scowl' | 'hurt' | 'dizzy'
export type RatMouth = 'grin' | 'shut' | 'open' | 'tongue'

/** A foot: forward (px), lift off the ground (px), toe-down tilt (degrees; negative lifts the toes). */
export type RatFoot = readonly [number, number, number]

export interface RatPose {
  /** Whole figure forward (+) and up (+). */
  x: number
  y: number
  /** Height of the hip joint above the soles: about 9 standing up, less in a crouch. */
  hip: number
  /** Body lean in degrees from upright (forward +) and squash (+ wider and shorter, − taller). */
  lean: number
  squash: number
  /** The torso drawn longer along the spine (1 = as built; the scurry stretches it). */
  stretch: number
  /** The whole rig turned clockwise around the middle of the body (tumbles). */
  spin: number
  /** Feet stand on the ground row (false: they travel with the body). */
  planted: boolean
  /** Head offset from its seat (forward, up) and nod in degrees (snout down +). */
  head: readonly [number, number]
  nod: number
  /** Nose twitch: 0 rest, 1 wrinkled up. */
  nose: number
  /** Ears: turn in degrees (back +). */
  earN: number
  earF: number
  /** Paws relative to their shoulders (torso units). */
  armN: readonly [number, number]
  armF: readonly [number, number]
  footN: RatFoot
  footF: RatFoot
  /** Tail: angle (0 = straight back, + up), ripple, phase, length. */
  tail: readonly [number, number, number, number]
  /** Bandana tails: angle (0 = back, 90 = down), length, ripple, phase. */
  scarf: readonly [number, number, number, number]
  eyes: RatEyes
  /** Pupils: −1 looking back … 1 looking ahead. */
  look: number
  mouth: RatMouth
}

export const ratPose = (p: Partial<RatPose> = {}): RatPose => ({
  x: 0,
  y: 0,
  hip: 10,
  lean: 6,
  squash: 0,
  stretch: 1,
  spin: 0,
  planted: true,
  head: [0, 0],
  nod: 0,
  nose: 0,
  earN: 0,
  earF: 0,
  armN: [4.4, 3.4],
  armF: [4.2, 2.4],
  footN: [0, 0, 0],
  footF: [0, 0, 0],
  tail: [30, 4, 0.6, 16],
  scarf: [35, 6, 0.8, 0],
  eyes: 'shifty',
  look: -1,
  mouth: 'grin',
  ...p
})

// ------------------------------------------------------------------------------------------------- face stamps

const FACE_KEY = { w: C.white, o: C.black, K: C.ink, g: FUR[0], m: C.mouth, t: C.tongue, T: TEETH[1] }

/** Eye whites cut into the mask, with the pupil placed by `look`. Near eye 5 wide, far eye 4. */
function eyeRows(kind: RatEyes, look: number, far: boolean): string[] {
  const w = far ? 4 : 5
  const pupil = (rows: string[], top: number, h: number) => {
    const px = Math.max(0, Math.min(w - 2, Math.round(((look + 1) / 2) * (w - 2))))
    return rows.map((r, j) =>
      j >= top && j < top + h
        ? r
            .split('')
            .map((ch, i) => (ch === 'w' && i >= px && i < px + 2 ? 'o' : ch))
            .join('')
        : r
    )
  }
  switch (kind) {
    case 'alert':
      return pupil(far ? ['.ww.', 'wwww', 'wwww', 'wwww', '.ww.'] : ['.www.', 'wwwww', 'wwwww', 'wwwww', '.www.'], 1, 2)
    case 'scowl':
      // the lid slopes down toward the snout
      return pupil(far ? ['ww..', 'wwww', '.ww.'] : ['www..', 'wwwww', '.www.'], 1, 2)
    case 'hurt':
      return far ? ['...w', '.ww.', 'w...', '.ww.', '...w'] : ['w...', '.ww.', '...w', '.ww.', 'w...']
    case 'dizzy':
      return far ? ['.ww.', 'w..w', 'w.ww', '.w..'] : ['.www.', 'w...w', 'w.w.w', 'w..w.', '.ww..']
    default:
      // shifty: half-lidded, a flat lid line on top
      return pupil(far ? ['wwww', 'wwww', '.ww.'] : ['wwwww', 'wwwww', '.www.'], 0, 2)
  }
}

const MOUTHS: Record<RatMouth, string[]> = {
  grin: ['KK...', '.KKKK', '.KTTK', '..KK.'],
  shut: ['.KKKK', '.KTTK', '..KK.'],
  open: ['KKKKK', 'KmmmK', 'KmtmK', '.KKK.'],
  tongue: ['KKKKK', 'KmmmK', '.KttK', '..tt.', '..tt.']
}

// ------------------------------------------------------------------------------------------------- shapes

/** The skull, cheek and snout: one silhouette in the head frame (origin on the neck, snout to +u). */
const headShape = () =>
  union(oval(0, -8.4, 9.4, 7.6), oval(5, -4.4, 7.4, 4.4), capsule([7, -5.8], [18, -3.4], 5.6, 2.6))

/**
 * The torso in its own frame (origin on the hip joint, u forward, v down; upright when lean = 0): a pear with a
 * round seat, a hunched back and a narrower chest that carries the shoulders and the neckerchief.
 */
const TORSO: Shape = polygon(
  spline([
    [-3.4, -1.4],
    [-7.6, -4],
    [-8.6, -8],
    [-6.6, -11.6],
    [-2, -13.6],
    [3.6, -13],
    [8, -10],
    [10.2, -5.4],
    [9.4, -1.2],
    [6, 1],
    [1, 1],
    [-3.4, -1.4]
  ])
)
const torsoShape = () => TORSO
/** The pale belly, a long oval on the front of the pear. */
const bellyShape = () => oval(7, -5.4, 5.4, 6.8)

/** The rat's hind foot in its own frame (origin under the heel's front, sole on v = 0, toes to +u): ~7 px long. */
const FOOT: Shape = union(oval(-1, -1.5, 1.7, 1.6), oval(1, -1.1, 2.4, 1.15), oval(3, -0.9, 1.1, 0.95))
/** Points of the sole, to keep a planted foot on the ground row whatever its tilt. */
const SOLE: readonly Pt[] = [
  [-2.8, -0.2],
  [0, 0],
  [4.6, -0.2]
]

/** The gang's neckerchief cut for the rat's short neck: a smaller triangle, so the belly shows below it. */
const RAT_BANDANA = { ...BANDANA_FIT, width: 3.2, tip: [3.4, 5.4] as Pt }

/** Height of the tumble pivot above the feet. */
const PIV = 14

/** Where the leg's parts sit for one foot: hip, knee, heel (screen), and the thigh's centre and turn. */
interface LegFit {
  hip: Pt
  knee: Pt
  heel: Pt
  thigh: Frame
}

// ------------------------------------------------------------------------------------------------- drawing

export function drawRat(pose: RatPose): Raster {
  const g = new Painter(64, 64, { soft: true })
  const k = 1 + pose.squash * 0.05
  const fig = pose.spin
    ? Frame.at(32 + pose.x, 60 - PIV - pose.y, pose.spin).child(0, PIV)
    : Frame.at(32 + pose.x, 60 - pose.y)
  const ground = pose.planted && !pose.spin ? Frame.at(32 + pose.x, 60) : fig
  const root = fig.child(-3, -pose.hip)
  const torso = root.child(0, 0, pose.lean, k, pose.stretch / k)
  // the head sits on the front of the chest; leaning into the scurry it slides toward the top of the chest
  const seat = torso.pt(6.4 * (1 - Math.min(1, Math.abs(pose.lean) / 90)), -10.2)
  const head = Frame.at(seat[0] + pose.head[0], seat[1] - pose.head[1], pose.spin + pose.lean * 0.1 + pose.nod)
  const neck = torso.child(3, -9.8, -6 - pose.lean * 0.6)
  const knot = neck.pt(...BANDANA_FIT.back)

  /** 0 standing up … 1 down in the scurry. */
  const sc = Math.max(0, Math.min(1, pose.lean / 72))

  // ---- legs: the thigh is a round volume on the hip, the shank runs from a forward knee down to the heel
  const footFrame = (at: RatFoot, u: number) => {
    let ff = ground.child(u + at[0], -at[1], at[2])
    if (pose.planted && !pose.spin) {
      const low = Math.max(...SOLE.map(([su, sv]) => ff.pt(su, sv)[1]))
      if (low > 60.5) ff = ff.moved(0, 60.5 - low)
    }
    return ff
  }
  const legFit = (at: RatFoot, u: number, hipAt: Pt): LegFit & { foot: Frame } => {
    const foot = footFrame(at, u)
    const hip = torso.pt(hipAt[0], hipAt[1])
    const heel = foot.pt(-1.6, -1.6)
    const { mid: knee, end } = joint(hip, heel, 9.4 - sc * 3, 6.2 - sc * 1.4, -1)
    const ang = (Math.atan2(knee[1] - hip[1], knee[0] - hip[0]) * 180) / Math.PI
    const c: Pt = [hip[0] + (knee[0] - hip[0]) * 0.4, hip[1] + (knee[1] - hip[1]) * 0.4]
    return { hip, knee, heel: end, thigh: Frame.at(c[0], c[1], ang), foot }
  }
  // the hip joint sits at the back of the seat when he stands and under the rump when he scurries
  const legN = legFit(pose.footN, -3, [-3.6 + sc * 4.4, -0.4 - sc * 1.2])
  const legF = legFit(pose.footF, -2.2, [-2.4 + sc * 4.8, -0.8 - sc * 1.6])
  const ID = Frame.at(0, 0)
  /** The shank, from the knee down to the heel (screen units). */
  const legShape = (f: LegFit) => capsule(f.knee, f.heel, 1.7, 1.1)
  const thighShape = () => union(oval(-1.2, 0, 4.8, 4.8), oval(1.8, 0.2, 3.6, 3.2))
  const footPaint = (l: Raster, f: Frame, skin: Ramp) => {
    fill(l, f, FOOT, skin[0])
    smooth(l)
    cel(l, { shade: 1 })
  }

  // ---- far ear
  const earF = head.child(3, -14, pose.earF + 6)
  g.add(-6, (l) => {
    fill(l, earF, oval(0, -3.8, 4.4, 5), FUR_FAR[1])
    tint(l, earF, oval(0.4, -3.2, 2.3, 3.2), PINK_FAR[1])
    cel(l, { shade: 1.4 })
  })

  // ---- bandana tails and the rat's tail, behind the body
  g.add(-5, (l) =>
    bandanaTail(l, knot, pose.scarf[0] + 22 - pose.spin, pose.scarf[1] * 0.8, pose.scarf[2], pose.scarf[3] + 1.6, true)
  )
  g.add(-4.5, (l) => {
    const [ang, amp, phase, len] = pose.tail
    const r = torso.pt(-5.2, 0)
    const path = wavePath(r, -ang - pose.spin, len, amp, phase, 1.6)
    // 4 px at the root, tapering evenly to 2 px; only the last few pixels of the tip are 1 px
    ribbon(l, path, (t) => (t < 0.78 ? 4.2 - t * 2.8 : Math.max(1, 2 - (t - 0.78) * 8)), TAIL[1])
    cel(l, { shade: 1, rim: 1 })
  })
  g.add(-4, (l) => bandanaTail(l, knot, pose.scarf[0] - pose.spin, pose.scarf[1], pose.scarf[2], pose.scarf[3]))

  // ---- arms
  const shoulderN: Pt = [3.6, -9]
  const shoulderF: Pt = [6, -9.6]
  /** The furry upper arm from the shoulder `s` to the paw at `s + hand`. */
  const arm = (l: Raster, s: Pt, hand: readonly [number, number], fur: Ramp, near: boolean) => {
    const h: Pt = [s[0] + hand[0], s[1] + hand[1]]
    fill(l, torso, capsule(s, h, near ? 2.3 : 2, 1.6), fur[1])
    cel(l, { shade: 1.1 })
  }
  /** The grabby pink paw (drawn in front of the chest), a finger tick on the near one. */
  const paw = (l: Raster, s: Pt, hand: readonly [number, number], skin: Ramp, near: boolean) => {
    const h: Pt = [s[0] + hand[0], s[1] + hand[1]]
    fill(l, torso, union(oval(h[0] + 0.6, h[1] + 0.2, 2.2, 1.9), oval(h[0] + 1.8, h[1] + 0.9, 1.3, 1.1)), skin[0])
    cel(l, { shade: 1.1 })
    if (near) within(l, (m) => stampAt(m, torso, ['K'], h[0] + 1.3, h[1] + 0.9, { K: skin[2] }), true)
  }
  // the far arm comes from behind the chest, its paw in front of it next to the near one
  g.add(-3.6, (l) => arm(l, shoulderF, pose.armF, FUR_FAR, false))
  g.add(0.8, (l) => paw(l, shoulderF, pose.armF, PINK_FAR, false))
  g.add(-3.4, (l) => {
    fill(l, legF.thigh, thighShape(), FUR_FAR[1])
    fill(l, ID, legShape(legF), FUR_FAR[1])
    smooth(l)
    cel(l, { shade: 1.6 })
  })
  g.add(-3.3, (l) => footPaint(l, legF.foot, PINK_FAR))

  // ---- body: torso, belly, the near thigh and shank as ONE silhouette with one light
  g.add(0, (l) => {
    fill(l, torso, torsoShape(), FUR[1])
    tint(l, torso, bellyShape(), CREAM[1])
    fill(l, legN.thigh, thighShape(), FUR[1])
    fill(l, ID, legShape(legN), FUR[1])
    smooth(l)
    cel(l, { shade: 2.4 })
    // the thigh's roundness: a soft crease along its upper front, not an outline
    const [tx, ty] = legN.thigh.pt(-1.2, 0)
    shadow(l, Frame.at(tx, ty), overlap(minus(oval(0, 0, 4.8), oval(-1, 1.1, 4.8)), oval(3.2, -3, 2.8)))
    shadow(l, head.moved(0.5, 2), headShape())
  })
  g.add(0.6, (l) => footPaint(l, legN.foot, PINK))

  // ---- bandana
  g.add(1, (l) => {
    neckerchief(l, neck, RAT_BANDANA)
    shadow(l, head.moved(0.5, 1.5), headShape())
  })
  g.add(1.1, (l) => bandanaKnot(l, knot))

  // ---- near ear, head
  const earN = head.child(-3.6, -12.5, pose.earN - 34)
  g.add(1.5, (l) => {
    fill(l, earN, union(oval(0, -5.4, 6.6, 7.4), oval(0, -0.5, 3.6, 2.5)), FUR[1])
    tint(l, earN, oval(0.9, -5, 4.2, 5.4), PINK[1])
    tint(l, earN, oval(1.7, -4, 2.4, 3.6), PINK[2])
    cel(l, { shade: 1.6, rim: 1 })
  })
  g.add(2, (l) => {
    fill(l, head, headShape(), FUR[1])
    // the cream underside of the snout and the cheek
    tint(l, head, union(oval(11.5, -0.6, 8, 2.8), oval(3.6, -1.2, 4.6, 3)), CREAM[1])
    // the bandit mask across both eyes
    tint(
      l,
      head,
      polygon([
        [-6, -10.4],
        [0, -11.4],
        [9, -11],
        [15.4, -8.6],
        [15.6, -5.4],
        [9, -4.4],
        [0, -4.8],
        [-5.4, -6.8],
        [-8.6, -7.2]
      ]),
      MASK[1]
    )
    // the nose at the tip of the snout
    fill(l, head, oval(18.4, -4 - pose.nose * 0.8, 2.1, 1.9), PINK[1])
    smooth(l)
    cel(l, { shade: 3, deep: 1 })
    sheen(l, head, oval(-4.5, -14, 2, 1))
    // the eyes, kept inside the head so a tilted stamp never breaks the outline
    within(l, (m) => stampAt(m, head, eyeRows(pose.eyes, pose.look, false), 5, -8, FACE_KEY), true)
    within(l, (m) => stampAt(m, head, eyeRows(pose.eyes, pose.look, true), 11.8, -6.8, FACE_KEY), true)
    // the glint on the nose
    within(l, (m) => stampAt(m, head, ['h'], 17.8, -5 - pose.nose * 0.8, { h: PINK[0] }), true)
  })

  // ---- the tongue lolling out of the corner of the mouth (in the head's frame: it flops out below the jaw)
  if (pose.mouth === 'tongue')
    g.add(2.1, (l) => {
      ribbon(l, spline([head.pt(13, -0.8), head.pt(12.4, 2.4), head.pt(13.6, 5)]), (t) => 2.6 + t * 0.8, PINK[1])
      cel(l, { shade: 1 })
    })

  // ---- face
  g.add(
    2.2,
    (l) => {
      stampAt(l, head, MOUTHS[pose.mouth], 14.5, -1.4, FACE_KEY)
    },
    false
  )

  // ---- near arm
  g.add(0.9, (l) => arm(l, shoulderN, pose.armN, FUR, true))
  g.add(3, (l) => paw(l, shoulderN, pose.armN, PINK, true))
  return g.render()
}

// ------------------------------------------------------------------------------------------------- clips

const frames = (n: number) => Array.from({ length: n }, (_, i) => i)

/** Standing look-out. */
const idle = memo(() => {
  const N = 6
  // the scene: eyes slide to the back and hold → a sniff, snout up, nose twitching → the eyes snap ahead and the
  // ear flicks → the paws rub → settle
  const act = track(
    ratPose(),
    [
      { at: 0, pose: { look: -0.2, nod: 0, nose: 0, head: [0, 0], earN: 0, armN: [4.2, 3.6], armF: [5.2, 1.6] } },
      { at: 1, pose: { look: -1 }, ease: ease.out },
      { at: 2, pose: { look: -1, nod: -9, nose: 1, head: [0.4, 0.8] }, ease: ease.inOut },
      { at: 3, pose: { look: 1, nod: -2, nose: 0, head: [0.6, 0.2], earN: 12, eyes: 'alert' }, ease: ease.snap },
      { at: 4, pose: { look: 1, nod: 0, earN: 4, armN: [5.4, 2.4], armF: [4, 3], eyes: 'shifty' }, ease: ease.out },
      { at: 5, pose: { look: 0.4, armN: [4, 3.8], armF: [5.6, 1.4] }, ease: ease.inOut }
    ],
    N
  )
  return frames(N).map((i) => {
    const a = (i / N) * TAU
    const breath = 0.5 - 0.5 * Math.cos(a)
    const p = act(i)
    return drawRat({
      ...p,
      squash: 0.3 - breath * 0.9,
      head: [p.head[0], p.head[1] + breath * 0.4],
      earF: p.earN * 0.35,
      // the far foot planted a step ahead of the near one, so he stands on two feet
      footF: [4.2, 0, 0],
      // the tail tip sways through the whole loop on its own, slower rhythm
      tail: [30 + Math.sin(a) * 4, 4, 0.6 + Math.sin(a + 1) * 1.1, 16],
      scarf: [44 + Math.sin(a + 0.8) * 8, 6, 0.9, a]
    })
  })
})

/** Foot of the scurry on each of its 8 frames: forward, lift, toe-down tilt. */
const STEP: readonly RatFoot[] = [
  [6, 0, -10], // contact, heel first
  [3, 0, 0], // down: the body sinks over the planted foot
  [0, 0, 0], // passing
  [-3.5, 0.6, 16], // push-off
  [-6.5, 3.4, 38], // kicked up behind
  [-4, 4.6, 24], // swinging through
  [1, 3.6, 4], // passing high
  [4.5, 1.6, -14] // reaching for the next contact
]
const STEP_BOB = [0.8, 0, 1, 2]
const STEP_SQUASH = [0.6, 1.2, 0, -0.8]

/** A sneaky scurry. */
const move = memo(() => {
  const N = 8
  const bob = frames(N).map((i) => STEP_BOB[i % 4])
  const earLag = lag(bob, { stiffness: 0.3, damping: 0.4, loop: true })
  const scarfLag = lag(bob, { stiffness: 0.25, damping: 0.35, loop: true })
  return frames(N).map((i) => {
    const a = (i / N) * TAU
    return drawRat(
      ratPose({
        x: -9,
        y: bob[i],
        hip: 8.5,
        lean: 72,
        squash: STEP_SQUASH[i % 4] - 3,
        stretch: 1.15,
        head: [5, -1.5 - bob[i] * 0.5],
        nod: -2,
        earN: 14 + earLag[i] * 8,
        earF: 8 + earLag[i] * 6,
        footN: STEP[i],
        footF: STEP[(i + 4) % N],
        armN: [6 + Math.cos(a) * 1.6, -0.8 + Math.sin(a) * 1.4],
        armF: [5 - Math.cos(a) * 1.6, -1.6 - Math.sin(a) * 1.4],
        tail: [22 + Math.sin(a) * 5, 3.6, a, 15],
        scarf: [8 + scarfLag[i] * 12, 8, 1.6, a * 2],
        look: 1,
        eyes: 'scowl'
      })
    )
  })
})

/** Bitten: jolted back and up, eyes > <, mouth open, limbs and tail thrown out straight; then the recoil. */
const hurt = memo(() => [
  drawRat(
    ratPose({
      x: -2,
      y: 3,
      planted: false,
      lean: -12,
      squash: -2,
      head: [-1, 1],
      nod: -12,
      earN: 26,
      earF: 18,
      armN: [6.5, -2.5],
      armF: [7.5, -4],
      footN: [5, 1, -30],
      footF: [8, 2, -36],
      tail: [2, 1, 0.4, 16],
      scarf: [-24, 8, 0.6, 0],
      eyes: 'hurt',
      mouth: 'open'
    })
  ),
  drawRat(
    ratPose({
      x: -1,
      y: 1,
      planted: false,
      lean: 12,
      squash: 1.4,
      head: [0, -0.5],
      nod: 6,
      earN: 8,
      earF: 4,
      armN: [4.6, 3.8],
      armF: [4.4, 3],
      footN: [1.5, 0.6, -6],
      footF: [3.5, 0.6, -8],
      tail: [24, 5, 2, 16],
      scarf: [24, 7, 1.4, 2],
      eyes: 'hurt',
      mouth: 'open'
    })
  )
])

/** Lying on his back (the last two frames of the knock-out): a pose of its own, not a turned picture. */
const LIE: Partial<RatPose> = {
  planted: false,
  spin: 270,
  lean: 0,
  x: 2,
  y: 3,
  nod: -62,
  head: [-1, -1],
  earN: 66,
  earF: 50,
  armN: [-4, 1.5],
  armF: [-2.4, -1.4],
  footN: [5, 1.5, -24],
  footF: [7.5, -1.5, 4],
  tail: [-92, 1.4, 4, 14],
  scarf: [80, 5, 0.6, 3],
  eyes: 'dizzy',
  mouth: 'tongue'
}

/** Knocked out: the blow, head over heels (the rig turns), landing on his back with a bounce, limp. */
const defeat = memo(() => {
  const air = (p: Partial<RatPose>) =>
    ratPose({ planted: false, eyes: 'dizzy', mouth: 'open', earN: 24, earF: 18, ...p })
  return [
    // the blow: stretched, thrown back
    air({
      x: -2,
      y: 4,
      lean: -14,
      squash: -2.6,
      head: [-1, 1.2],
      nod: -14,
      armN: [1, -6],
      armF: [3, -6.4],
      footN: [6, 2, -30],
      footF: [9, 3, -36],
      tail: [4, 1, 0.4, 15],
      scarf: [-36, 8, 0.6, 0],
      eyes: 'hurt'
    }),
    // head over heels: the rig turns a quarter each frame, limbs flail
    air({
      x: -3,
      y: 10,
      spin: 90,
      armN: [7, 1],
      armF: [4, 3],
      footN: [7, 5, -40],
      footF: [-4, 6, 30],
      tail: [-20, 5, 1, 14],
      scarf: [-10, 8, 1.4, 1]
    }),
    air({
      y: 18,
      spin: 180,
      armN: [6, 3],
      armF: [7, 0],
      footN: [-3, 6, 30],
      footF: [7, 5, -40],
      tail: [-10, 5, 2.5, 14],
      scarf: [10, 8, 1.4, 2]
    }),
    air({
      x: 3,
      y: 8,
      spin: 270,
      nod: -10,
      armN: [7, 0],
      armF: [5, 3],
      footN: [7, 5, -40],
      footF: [-2, 6, 20],
      tail: [-40, 5, 4, 14],
      scarf: [20, 8, 1.4, 3]
    }),
    // lands on his back: squashed flat, everything still flung
    ratPose({
      ...LIE,
      squash: 0.6,
      y: 3.5,
      mouth: 'open',
      armN: [1, -5],
      armF: [3, -6],
      footN: [7, 2, -30],
      footF: [9, 0, 0],
      tail: [-70, 3, 3, 14]
    }),
    // limp: a pixel lower and wider, tongue out
    ratPose({ ...LIE, squash: 2, y: 3 })
  ].map(drawRat)
})

export const walkerSheet = () => ({
  idle: lazyAnim(idle, 8, true),
  move: lazyAnim(move, 12, true),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})
