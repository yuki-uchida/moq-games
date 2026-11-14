/**
 * 子ガラス (`flyer`): a cheeky crow chick of the ばくろ団, all head and attitude. A big round head on a small round
 * body, a large yellow beak that caws, a pale face disc with a scowling eye, the gang's red worn as a pirate head
 * scarf (knot and two whipping tails at the back), stubby wings with four finger feathers, a short fanned tail and
 * tiny orange feet tucked under the belly. Always airborne: the body's centre sits at about (29, 45), inside the
 * 44×34 box above the anchor (32, 60).
 *
 * Built on the rig toolkit (rig.ts, motion.ts): one pose-parametric draw function (`drawCrow`); the wings are
 * flapped in 3D (a stroke angle around the body axis, projected on the screen, so a level wing is foreshortened).
 *
 * Depth (back to front): far wing, far scarf tail, tail fan, near scarf tail, feet, body, near wing, head (face
 * disc, scarf, tuft, eyes), knot, mouth, lower beak, upper beak, loose feathers.
 */
import { C, R, ramp } from '../../palette'
import { TAU, ease, lag, track, type Key } from '../../motion'
import { Painter, Raster, farRamp, type Pt } from '../../raster'
import {
  Frame,
  capsule,
  cel,
  egg,
  fill,
  half,
  oval,
  overlap,
  polygon,
  shadow,
  sheen,
  smooth,
  squircle,
  stampAt,
  tint,
  union,
  within,
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'
import { BANDANA, bandanaKnot, bandanaTail } from './kit'

/** Navy feathers, a step lighter than `R.crowBlue` so he reads on the night sky and the cave wall. */
export const CROW = ramp('#8f9bd8', '#525c9a', '#383f75', '#252955', '#0f0e24')
const CROW_FAR = farRamp(CROW)
/** The wing's coverts: a lighter blue than the body, so the wing reads in front of it. */
const WING = ramp('#b0bbea', '#7480c2', '#4e5893', '#323867', '#0f0e24')
const WING_FAR = farRamp(WING)
/** The pale grey-blue face disc and chest fluff. */
export const CHEST = ramp('#d2d8f4', '#a3acd9', '#7480b6', '#4b5389', '#0f0e24')
const BEAK = R.beak

// ------------------------------------------------------------------------------------------------------ pose

export type CrowEyes = 'scowl' | 'glare' | 'hurt' | 'dizzy' | 'dizzy2'
/**
 * A wing as two bones, in screen degrees before the rig's spin (y down: 270 straight up, 180 straight back, 90
 * straight down, 0 forward): the arm (shoulder → wrist), the hand (wrist → tip), the spread of the feather fan
 * 0 (closed) … 1 (fanned) and the fold (the hand's length, 1 = stretched). Angles are unwrapped: the flap runs from
 * 262 (up) down through 180 (back) to 90 (down) and back up.
 */
export type Wing = readonly [number, number, number, number]

export interface CrowPose {
  /** The whole bird forward (+) and up (+). */
  x: number
  y: number
  /** The whole rig turned clockwise around the body's centre (tumbles). */
  spin: number
  /** Body squash (+ wider and shorter, − taller). */
  squash: number
  /** Head offset from its seat (forward, up) and nod (beak down +). */
  head: readonly [number, number]
  nod: number
  wingN: Wing
  wingF: Wing
  /** Tail: angle in degrees (+ up), fan 0 … 1. */
  tail: readonly [number, number]
  /** Feet: swing in degrees (+ back), tuck 0 (dangling) … 1 (tucked). */
  feet: readonly [number, number]
  /** Scarf tails: angle (0 straight back, 90 down), length, ripple, phase. */
  scarf: readonly [number, number, number, number]
  eyes: CrowEyes
  /** Pupil: −1 looking back … 1 looking ahead. */
  look: number
  /** Beak: 0 shut … 1 cawing … 1.4 wide open. */
  beak: number
  /** Feathers ruffled up (hurt). */
  ruffle: boolean
  /** Loose feathers flying off, as screen offsets from the body's centre (defeat). */
  loose: readonly Pt[]
}

export const crowPose = (p: Partial<CrowPose> = {}): CrowPose => ({
  x: 0,
  y: 0,
  spin: 0,
  squash: 0,
  head: [0, 0],
  nod: 0,
  wingN: [262, 256, 1, 1],
  wingF: [290, 292, 1, 1],
  tail: [6, 0.5],
  feet: [0, 1],
  scarf: [10, 8, 1.4, 0],
  eyes: 'scowl',
  look: 1,
  beak: 0,
  ruffle: false,
  loose: [],
  ...p
})

// ---------------------------------------------------------------------------------------------------- stamps

const EYE_KEY = { w: C.white, K: C.black, i: C.inkBlue, s: CHEST[2] }

/** Eye whites ('w') with the pupil (2×3) placed by `look` over the columns `cols`, from row `top`. */
function withPupil(rows: readonly string[], look: number, cols: readonly number[], top: number): string[] {
  const at = cols[Math.round(((Math.max(-1, Math.min(1, look)) + 1) / 2) * (cols.length - 1))]
  return rows.map((r, j) =>
    j >= top && j < top + 3
      ? r
          .split('')
          .map((ch, i) => (ch === 'w' && (i === at || i === at + 1) ? 'K' : ch))
          .join('')
      : r
  )
}

/** Near eye (7×7) and far eye (4×6), on the pale face disc. */
function eyeRows(kind: CrowEyes, look: number, far: boolean): string[] {
  switch (kind) {
    case 'glare':
      return far
        ? withPupil(['.ii.', 'iwwi', 'wwww', 'wwww', 'wwww', '.ww.'], look, [0, 1, 2], 2)
        : withPupil(
            ['..iii..', '.iwwwi.', 'wwwwwww', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..'],
            look,
            [1, 2, 3, 4],
            2
          )
    case 'hurt':
      return far
        ? ['....', 'K...', '.KK.', 'K...', '....', '....']
        : ['.......', 'KK.....', '..KK...', '....KK.', '..KK...', 'KK.....', '.......']
    case 'dizzy':
      return far
        ? ['.KK.', 'K..K', 'K.KK', '.K..', '....', '....']
        : ['.......', '.KKKK..', 'K....K.', 'K.KK.K.', 'K.K..K.', '.K..K..', '.......']
    case 'dizzy2':
      return far
        ? ['..K.', '.K.K', 'KK.K', 'K..K', '.KK.', '....']
        : ['.......', '..K..K.', '.K..K.K', '.K.KK.K', '.K....K', '..KKKK.', '.......']
    default:
      // scowl: a heavy lid slanting down toward the beak, the pupil under it
      return far
        ? withPupil(['i...', 'iii.', 'wiii', 'wwww', 'wwww', '.ww.'], look, [0, 1, 2], 3)
        : withPupil(
            ['ii.....', 'iiiii..', '.wwiiii', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..'],
            look,
            [1, 2, 3, 4],
            3
          )
  }
}

const FEATHER_KEY = { f: CROW[1] }
/** Three chunky locks at the nape, pointing back. */
const TUFT = ['ff....', '.fff..', '..ffff', 'fffff.', '..ffff', '.ff...']
/** Ruffled feathers standing up (hurt). */
const RUFFLE = ['f..f', 'ff.f', '.fff', '.fff']

/** Loose feathers, drifting: a dark three-pixel vane around a pale shaft, two slants. */
const LOOSE = [
  ['....dd', '...dsd', '..dsdd', '.dsdd.', 'dsdd..', 's.....'],
  ['dd....', 'dsd...', 'ddsd..', '.ddsd.', '..ddsd', '.....s']
]
const LOOSE_KEY = { d: WING[3], s: WING[1] }

// ------------------------------------------------------------------------------------------------------ draw

const RAD = Math.PI / 180
/** The body's centre in the cell, when the pose says nothing else. */
const CX = 30
const CY = 44
/** The wing's span in its own units. */
const SPAN = 18

const headShape = (): Shape => union(squircle(0, 0, 10.8, 10, 2.15), oval(3.5, 3.8, 8, 6))
const bodyShape = (): Shape => union(egg(0, 0, 8.6, 7, 6.6), oval(3, 2.2, 6, 5.4))

/** The head scarf's region in the head frame: low over the eye at the front, the knot's line at the back. */
const SCARF = polygon([
  [-14, -0.5],
  [-9, -2.6],
  [-2, -4.6],
  [3, -4],
  [7.5, -1.8],
  [10, -0.4],
  [14, -0.6],
  [14, -14],
  [-14, -14]
])
const SCARF_TONES = new Set<number>(BANDANA.slice(0, 4))

/** Darkens the scarf's lower edge (a red pixel with feathers under it) into a hem. */
function hem(l: Raster) {
  const src = l.clone()
  for (let y = 0; y < l.h - 1; y++)
    for (let x = 0; x < l.w; x++) {
      const c = src.get(x, y)
      const below = src.get(x, y + 1)
      if (SCARF_TONES.has(c) && below && !SCARF_TONES.has(below)) l.set(x, y, BANDANA[3])
    }
}

/** Arm and hand lengths of the near wing: 18 px from shoulder to tip, about as long as the body is wide. */
const ARM = 7
const HAND = 12.5
/** Shapes in screen pixels (the wing is built from screen points, so its feathers never shear). */
const SCREEN = Frame.at(0, 0)
const along = (p: Pt, deg: number, k: number): Pt => [p[0] + Math.cos(deg * RAD) * k, p[1] + Math.sin(deg * RAD) * k]
const toward = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/**
 * A wing's bones and feather tips on screen. The leading edge runs along the bones; the feathers grow toward the
 * trailing side (the bone turned −90°, so the wing turns like a paddle as it sweeps around the shoulder): three
 * primaries fanned from the wrist, two secondaries along the arm. Five feather tips, the same five every frame.
 */
export interface WingBones {
  shoulder: Pt
  wrist: Pt
  /** Bone angles on screen (spin included). */
  arm: number
  hand: number
  /** Primary tips, outermost (the wing tip) first; their root is the wrist. */
  primaries: Pt[]
  /** Secondaries as [root, tip]. */
  secondaries: [Pt, Pt][]
  /** The wing tip (the outermost primary). */
  tip: Pt
  /** Size factor (the far wing is a little smaller). */
  k: number
}

export function wingBones(shoulder: Pt, w: Wing, spin: number, k: number): WingBones {
  const [armDeg, handDeg, spread, fold] = w
  const arm = armDeg + spin
  const hand = handDeg + spin
  const wrist = along(shoulder, arm, ARM * k)
  const len = HAND * k * fold
  // four finger feathers fanned from the wrist toward the trailing side
  const fan = 4 + 18 * spread
  const primaries = [0, 1, 2, 3].map((j) => along(wrist, hand - j * fan, len - j * 1.3 * k))
  // one broad secondary lobe under the arm
  const root = along(shoulder, arm, ARM * k * 0.55)
  const secondaries: [Pt, Pt][] = [[root, along(root, arm - 78 + (1 - spread) * 14, 6.4 * k * (0.7 + 0.3 * fold))]]
  return { shoulder, wrist, arm, hand, primaries, secondaries, tip: primaries[0], k }
}

/** The wing's silhouette: rounded feather ends on a webbed fill, so the trailing edge is cut into five tips. */
function wingShape(b: WingBones): Shape {
  const { shoulder, wrist, primaries, secondaries, k } = b
  const parts: Shape[] = [capsule(shoulder, wrist, 2.5 * k, 2.1 * k)]
  for (const t of primaries) parts.push(capsule(wrist, t, 2 * k, 1.05))
  for (const [r, t] of secondaries) parts.push(capsule(r, t, 2.6 * k, 1.6))
  parts.push(
    polygon([
      shoulder,
      wrist,
      ...primaries.map((t) => toward(wrist, t, 0.5)),
      toward(secondaries[0][0], secondaries[0][1], 0.5)
    ])
  )
  return union(...parts)
}

/** Paints a wing: dark navy flight feathers, the darkest tone at the feather ends, a lit leading edge. */
function paintWing(l: Raster, b: WingBones, far: boolean) {
  const tone = far ? CROW_FAR : CROW
  const lit = far ? WING_FAR : WING
  // the flight feathers a step darker than the body, so the wing reads in front of it
  fill(l, SCREEN, wingShape(b), tone[3])
  smooth(l)
  // coverts: the lit rows over the arm and the base of the hand, a scalloped lower edge
  const lead = (p: Pt, deg: number, d: number): Pt => along(p, deg + 90, d * b.k)
  tint(
    l,
    SCREEN,
    union(
      capsule(lead(b.shoulder, b.arm, 0.6), lead(b.wrist, b.arm, 0.6), 2.1 * b.k, 1.7 * b.k),
      capsule(lead(b.wrist, b.hand, 0.8), along(lead(b.wrist, b.hand, 0.8), b.hand, 4 * b.k), 1.5 * b.k, 0.9)
    ),
    tone[2]
  )
  cel(l, { shade: 1.2 })
  // feather splits: a dark line from the hand into every notch between the fingers
  for (let j = 0; j < b.primaries.length - 1; j++) {
    const notch = toward(b.primaries[j], b.primaries[j + 1], 0.5)
    tint(l, SCREEN, capsule(toward(b.wrist, notch, 0.45), notch, 0.6), tone[4])
  }
  // the lit leading edge: a band along the bones on the side away from the feathers
  tint(
    l,
    SCREEN,
    union(
      capsule(lead(b.shoulder, b.arm, 1.6), lead(b.wrist, b.arm, 1.6), 1 * b.k, 0.9 * b.k),
      capsule(lead(b.wrist, b.hand, 1.4), along(lead(b.wrist, b.hand, 1.4), b.hand, 6 * b.k), 0.8 * b.k, 0.5)
    ),
    lit[1]
  )
}

/** Foot points in body units: hip, ankle and two toe ends. */
function footPts(hip: Pt, swing: number, tuck: number) {
  const a = (90 + swing) * RAD
  const reach = 3.4 - tuck * 1.8
  const ankle: Pt = [hip[0] - Math.cos(a) * reach * 0.3, hip[1] + Math.sin(a) * reach]
  return { ankle, toeA: [ankle[0] + 2.6, ankle[1] + 0.6] as Pt, toeB: [ankle[0] + 1.2, ankle[1] + 1.6] as Pt }
}
const HIP_N: Pt = [0, 5.4]
const HIP_F: Pt = [3.5, 4.8]

/** The screen points the rig puts things on (for tests and the clips). */
export function crowRig(p: CrowPose) {
  const k = 1 + p.squash * 0.08
  // tumbles turn around the middle of head and body together, so the bird stays in its box
  const centre = Frame.at(CX + 3 + p.x, CY - 5 - p.y, p.spin).child(-3, 5)
  const body = centre.child(0, 0, 0, k, 1 / k)
  const [hx, hy] = centre.pt(6 + p.head[0], -9 - p.head[1])
  const head = Frame.at(Math.round(hx), Math.round(hy), p.spin + p.nod)
  // the shoulder slides up the back as the wing rises: a raised wing grows from the top of the back
  const seat = (w: Wing, du: number): Pt => {
    const up = (1 - Math.sin(w[0] * RAD)) / 2
    return body.pt(-3 - up * 4.5 + du, -3.6 - 3.2 * up)
  }
  const wingN = wingBones(seat(p.wingN, 0), p.wingN, p.spin, 1)
  const wingF = wingBones(seat(p.wingF, 1.5), p.wingF, p.spin, 0.92)
  const foot = footPts(HIP_N, p.feet[0], p.feet[1])
  return {
    centre,
    body,
    head,
    wingN,
    wingF,
    /** The tip of the near wing. */
    tip: wingN.tip,
    /** The top of the head (screen y). */
    crown: head.pt(0, -10)[1],
    /** The lowest point of the near foot (screen y). */
    feet: Math.max(body.pt(...foot.toeA)[1], body.pt(...foot.toeB)[1]) + 0.8
  }
}

export function drawCrow(p: CrowPose): Raster {
  const g = new Painter(64, 64, { soft: true })
  const { body, head, wingN, wingF } = crowRig(p)
  const knot = head.pt(-9.6, -1.5)

  // ---- far wing, behind everything
  g.add(-6, (l) => paintWing(l, wingF, true))

  // ---- scarf tails, tail fan
  g.add(-5, (l) => bandanaTail(l, knot, p.scarf[0] + 24 - p.spin, p.scarf[1] * 0.8, p.scarf[2], p.scarf[3] + 1.7, true))
  g.add(-4.5, (l) => {
    const [ang, fan] = p.tail
    const root: Pt = [-6.5, 1]
    for (const s of [-1, 0, 1]) {
      const a = (ang + s * (9 + fan * 14)) * RAD
      const len = 10 - Math.abs(s) * 1.5
      fill(l, body, capsule(root, [root[0] - Math.cos(a) * len, root[1] - Math.sin(a) * len], 2.6, 1.5), CROW[2])
    }
    smooth(l)
    // the darkest tone on the feather ends
    tint(l, body, half([root[0] - 6, 0], -1, 0), CROW[3])
    cel(l, { shade: 1.4, rim: 1 })
  })
  // the near scarf tail: in front of the body, behind the near wing (it never crosses the wing as a stripe)
  g.add(0.5, (l) => bandanaTail(l, knot, p.scarf[0] - p.spin, p.scarf[1], p.scarf[2], p.scarf[3]))

  // ---- feet, tucked under the belly
  const foot = (l: Raster, hip: Pt, swing: number, far: boolean) => {
    const tone = far ? farRamp(BEAK) : BEAK
    const { ankle, toeA, toeB } = footPts(hip, swing, p.feet[1])
    fill(l, body, capsule(hip, ankle, 1.2, 1), tone[1])
    // short toes curled forward
    fill(l, body, capsule(ankle, toeA, 1, 0.8), tone[1])
    fill(l, body, capsule(ankle, toeB, 1, 0.8), tone[1])
    cel(l, { shade: 0.8 })
  }
  g.add(-3, (l) => foot(l, HIP_F, p.feet[0] * 1.3, true))
  g.add(-2.9, (l) => foot(l, HIP_N, p.feet[0], false))

  // ---- body
  g.add(0, (l) => {
    fill(l, body, bodyShape(), CROW[1])
    tint(l, body, oval(4.5, 3, 4.6, 4.4), CHEST[1])
    if (p.ruffle) stampAt(l, body, RUFFLE, -3, -7.5, FEATHER_KEY)
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
    shadow(l, head.moved(0.5, 1.5), headShape())
  })

  // ---- near wing: in front of the body and the scarf tail, behind the head (a raised wing rises behind it)
  g.add(1, (l) => paintWing(l, wingN, false))

  // ---- head
  g.add(2, (l) => {
    fill(l, head, headShape(), CROW[1])
    stampAt(l, head, TUFT, -11, 3.5, FEATHER_KEY)
    if (p.ruffle) stampAt(l, head, RUFFLE, -3, -10.5, FEATHER_KEY)
    // the pale face disc around the eye, down to the cheek
    tint(l, head, union(oval(5.5, 1.5, 5.6, 5.4), oval(6, 5.5, 5, 3.2)), CHEST[1])
    // the head scarf, pirate fashion: over the crown, pulled down low over the eye, the knot at the back
    tint(l, head, SCARF, BANDANA[1])
    smooth(l)
    cel(l, { shade: 3, deep: 1, rim: 1 })
    sheen(l, head, overlap(oval(-3, -8, 3.4, 1.4), headShape()))
    // the hem: a dark fold along the scarf's lower edge, the scowling brow over the eye
    hem(l)
    // the eyes go under the scarf
    const cloth = (c: number) => SCARF_TONES.has(c)
    within(l, (m) => {
      stampAt(m, head, eyeRows(p.eyes, p.look, false), 4.5, 0, EYE_KEY)
      stampAt(m, head, eyeRows(p.eyes, p.look, true), 10.5, 0, EYE_KEY)
      for (let i = 0; i < m.data.length; i++) if (cloth(l.data[i])) m.data[i] = 0
    })
  })
  g.add(2.2, (l) => bandanaKnot(l, knot, 1.9))

  // ---- beak: a big curved upper mandible with a hooked tip, the lower one hinged to open
  const root = head.child(8.2, 2)
  const open = Math.max(0, p.beak)
  const jaw = root.child(0, 1.4, open * 30)
  if (open > 0.05)
    g.add(2.4, (l) => {
      const [jx, jy] = jaw.pt(10, 0.4)
      fill(l, root, polygon([[0, 1], [11.5, 1.2], root.local(jx, jy), [0, 4.4]]), C.mouth)
      if (open > 0.6) tint(l, jaw, oval(3.5, -0.6, 3.2, 1.4), C.tongue)
    })
  g.add(2.5, (l) => {
    fill(l, jaw, overlap(overlap(oval(-1, 0, 11.5, 3.2), half([0, 0], 0, 1)), half([-1.5, 0], 1, 0)), BEAK[1])
    cel(l, { shade: 1.2 })
  })
  g.add(2.6, (l) => {
    fill(
      l,
      root,
      union(
        overlap(overlap(oval(-1, 1.4, 14, 5.4), half([0, 1.4], 0, -1)), half([-1.5, 0], 1, 0)),
        oval(11.8, 1.6, 1.3, 1.5)
      ),
      BEAK[1]
    )
    smooth(l)
    cel(l, { shade: 1.4, rim: 1 })
  })

  // ---- loose feathers flying off (defeat)
  if (p.loose.length)
    g.add(4, (l) => {
      const [cx, cy] = crowRig(p).centre.pt(0, 0)
      p.loose.forEach(([dx, dy], i) =>
        l.stamp(LOOSE[i % 2], Math.round(cx + dx - 2), Math.round(cy + dy - 2), LOOSE_KEY)
      )
    })
  return g.render()
}

// ----------------------------------------------------------------------------------------------------- clips

const N = 8
const cyc = (i: number) => (i / N) * TAU

/** Key poses of the flap: wings high, the fast downstroke, wings low and wrapped, the folded upstroke. */
const FLAP: Key<{ wing: Wing; y: number; fan: number; squash: number }>[] = [
  // wings high: a V over the head, feathers fanned; the body at its lowest
  { at: 0, pose: { wing: [256, 250, 1, 1], y: -1, fan: 0.3, squash: -0.3 } },
  // the downstroke: through the diagonal, then level (full span, the widest frame), the body squashed and rising
  { at: 1, pose: { wing: [222, 212, 1, 1], y: -0.2, fan: 0.6, squash: 0.5 } },
  { at: 2, pose: { wing: [180, 174, 1, 1], y: 1, fan: 1, squash: 1 } },
  { at: 3, pose: { wing: [130, 116, 0.9, 1], y: 2.2, fan: 1, squash: 0.8 } },
  // wings low: wrapped under the belly, tips down and a little forward; the body at its highest
  { at: 4, pose: { wing: [100, 84, 0.65, 1], y: 2.8, fan: 0.6, squash: 0.2 } },
  // the upstroke: the elbow leads up and back, the hand trails folded; the body stretches and sinks
  { at: 5, pose: { wing: [148, 104, 0.3, 0.8], y: 2.2, fan: 0.3, squash: -0.5 } },
  { at: 6, pose: { wing: [206, 146, 0.1, 0.66], y: 0.8, fan: 0.2, squash: -1 } },
  { at: 7, pose: { wing: [246, 212, 0.45, 0.84], y: -0.4, fan: 0.2, squash: -0.7 } }
]

/** The far wing: half a frame behind, turned forward so the raised pair opens into a V. */
const farWing = (w: Wing): Wing => [w[0] + 26, w[1] + 36, w[2], w[3]]

/** The flap as poses (exported for the tests). */
export const movePoses = memo(() => {
  const flap = track({ wing: [264, 258, 1, 1] as Wing, y: 0, fan: 0.5, squash: 0 }, FLAP, N)
  const at = Array.from({ length: N }, (_, i) => flap(i))
  const bob = at.map((k) => k.y)
  const late = lag(bob, { stiffness: 0.3, damping: 0.4, loop: true })
  const beak = [0, 0, 0, 0, 0.45, 1, 0.7, 0]
  return at.map((k, i) =>
    crowPose({
      y: k.y,
      squash: k.squash,
      head: [0, -k.y * 0.5],
      nod: -late[i] * 2,
      wingN: k.wing,
      wingF: farWing(flap(i - 0.3).wing),
      tail: [8 - k.fan * 18 + late[i] * 5, k.fan],
      // the feet tuck up on the downstroke and dangle on the upstroke, a beat late
      feet: [8 + late[i] * 14, Math.max(0, Math.min(1, 0.45 + late[i] * 0.25))],
      scarf: [late[i] * 12, 13, 2, cyc(i) * 2],
      eyes: beak[i] > 0.6 ? 'glare' : 'scowl',
      beak: beak[i]
    })
  )
})

const move = () => movePoses().map(drawCrow)

/** Bitten: feathers ruffled, eyes > <, beak wide, wings flung up; then the recoil. */
const hurt = memo(() =>
  [
    crowPose({
      x: -2,
      y: 1,
      spin: -8,
      squash: -1.6,
      head: [-1, 1],
      nod: -10,
      wingN: [248, 236, 1, 1],
      wingF: [288, 298, 1, 1],
      tail: [30, 1],
      feet: [-20, 0],
      scarf: [-20, 9, 1, 0],
      eyes: 'hurt',
      beak: 1.4,
      ruffle: true
    }),
    crowPose({
      x: -1,
      y: -0.5,
      spin: 6,
      squash: 1.2,
      head: [0, -0.5],
      nod: 6,
      wingN: [200, 148, 0.3, 0.7],
      wingF: [222, 172, 0.3, 0.7],
      tail: [-6, 0.3],
      feet: [24, 0.4],
      scarf: [18, 9, 1.8, 2],
      eyes: 'hurt',
      beak: 0.8
    })
  ].map(drawCrow)
)

/**
 * Knocked out: the blow (stretched, beak wide), a spin with the wings spread and feathers flying off (the rig turns
 * a quarter each frame), then lying on his back, designed by hand: belly up, wings flopped open, feet in the air,
 * the head tipped back with the beak hanging open and dizzy eyes.
 */
const defeat = memo(() =>
  [
    crowPose({
      x: -2,
      y: 1,
      spin: -14,
      squash: -1.8,
      head: [-1, 1],
      nod: -10,
      wingN: [246, 234, 1, 1],
      wingF: [290, 300, 1, 1],
      tail: [34, 1],
      feet: [-24, 0],
      scarf: [-30, 12, 1, 0],
      eyes: 'hurt',
      beak: 1.4,
      ruffle: true
    }),
    crowPose({
      spin: -90,
      y: 2,
      wingN: [244, 232, 1, 1],
      wingF: [300, 306, 1, 1],
      tail: [20, 1],
      feet: [-30, 0],
      scarf: [-10, 12, 1.6, 1],
      eyes: 'hurt',
      beak: 1,
      loose: [
        [-14, -12],
        [14, 8]
      ]
    }),
    crowPose({
      spin: -180,
      wingN: [165, 156, 1, 1],
      wingF: [318, 328, 1, 1],
      tail: [10, 1],
      feet: [30, 0],
      scarf: [10, 12, 1.6, 2],
      eyes: 'dizzy',
      beak: 0.8,
      loose: [
        [-19, -17],
        [16, 10],
        [4, -21]
      ]
    }),
    crowPose({
      spin: -270,
      y: 3,
      wingN: [188, 182, 1, 1],
      wingF: [292, 302, 1, 1],
      tail: [0, 1],
      feet: [10, 0],
      scarf: [30, 11, 1.4, 3],
      eyes: 'dizzy2',
      beak: 0.6,
      loose: [
        [-22, -19],
        [8, -23]
      ]
    }),
    // landed on his back: squashed by the bump
    crowPose({
      spin: -168,
      y: -4.5,
      squash: 1.6,
      nod: 14,
      wingN: [203, 218, 1, 1],
      wingF: [98, 113, 1, 1],
      tail: [-14, 1],
      feet: [-10, 0],
      scarf: [70, 10, 1, 4],
      eyes: 'dizzy',
      beak: 1,
      loose: [[6, -24]]
    }),
    // limp
    crowPose({
      spin: -172,
      y: -5.5,
      squash: 0.6,
      nod: 18,
      wingN: [210, 224, 0.9, 1],
      wingF: [120, 144, 0.9, 1],
      tail: [-18, 0.8],
      feet: [6, 0.2],
      scarf: [85, 9, 0.6, 5],
      eyes: 'dizzy2',
      beak: 0.7
    })
  ].map(drawCrow)
)

export const flyerSheet = () => ({
  move: lazyAnim(move, 16, true),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})
