/**
 * カラス助 (`crowBoss`): the ばくろ団's swaggering head crow, a pirate captain of the air, built on the rig toolkit.
 * A barrel chest, a big head with an oversized hooked beak that opens on a red-pink mouth, a ruffled crest at the
 * back of the head, a black patch over the far eye and a glaring amber near eye under a heavy feathered brow, the
 * gang's red worn as a pirate head scarf with a knot and two long tails, a fanned tail, strong yellow feet with
 * dark talons, and the wings: about 100 px tip to tip, each an arm of two bones carrying three rows of feathers
 * (coverts, secondaries, long finger-like primaries with gaps at the tips). 128×128, facing right, hovering inside
 * the 63×63 box above the anchor (64, 120) with the body's centre near y = 90.
 *
 * Rendering (CHARACTERS.md "Big furry bodies", feathers as fur): body, thighs and neck are ONE silhouette shaded
 * once, with a darker mantle on the back, a pale chest with toothed edges and feather-toothed `cel`; the head is a
 * second silhouette with the scarf and the pale face tinted inside it; every flight feather is a layer of its own
 * so the soft painter draws the feather structure.
 *
 * Depth (back to front): far wing, far scarf tail, tail fan, far leg, body, near leg, near wing, near scarf tail,
 * head, face, mouth, lower beak, upper beak, knot, loose feathers, stars.
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
  egg,
  fill,
  half,
  mantle,
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

/** Navy feathers, a step lighter than `R.crowBlue` (the same navy as the crow chicks of his gang). */
const NAVY = ramp('#8f9bd8', '#525c9a', '#383f75', '#252955', '#0f0e24')
/** The darker mantle on the back, the crown and the upper side of the flight feathers. */
const MANTLE = ramp('#6d78b9', '#3f4783', '#2c3164', '#1d2049', '#0f0e24')
/** The pale grey-blue chest, face and wing undersides. */
const CHEST = ramp('#d2d8f4', '#a3acd9', '#7480b6', '#4b5389', '#0f0e24')
const BEAK = R.beak
const BAND = R.bandana
const RAD = Math.PI / 180

type Eyes = 'glare' | 'narrow' | 'wide' | 'shut' | 'hurt' | 'dizzy' | 'tired'

/**
 * A wing: the arm's direction on screen in degrees (clockwise from +x: the near wing spreads to the left, about
 * 180, the far one to the right, about 0; −90 is straight up), how far it is opened (0 folded in a W … 1 straight),
 * how far the primaries fan (0 closed … 1 spread with gaps), and the side we see (0 upper, 1 the pale underside).
 */
export type Wing = readonly [number, number, number, number]

export interface CrowBossPose {
  /** Whole bird forward (+) / up (+), in pixels. */
  x: number
  y: number
  /** Body tilt in degrees (beak down +) and squash (+ wider and shorter). */
  lean: number
  squash: number
  /** The whole rig turned clockwise around the body's centre (tumbles). */
  spin: number
  /** Head offset from its seat (forward +, down +) and nod (beak down +). */
  head: readonly [number, number]
  nod: number
  /** Lower beak opening 0..1 (1 = screech). */
  jaw: number
  tongue: boolean
  eyes: Eyes
  wingN: Wing
  wingF: Wing
  /** Tail: direction in degrees from straight down (+ toward the back), fan 0..1. */
  tail: readonly [number, number]
  /** Feet: swing in degrees (+ forward), talons 0 curled … 1 wide open. */
  feet: readonly [number, number]
  /** Legs thrown forward out of the belly feathers, in pixels (the dive's grab). */
  reach: number
  /** Scarf tails: direction (0 straight back, + down), length, ripple, phase. */
  scarf: readonly [number, number, number, number]
  /** Crest and nape feathers ruffled up 0..1. */
  crest: number
  /** Loose feathers flying off, as screen offsets from the body's centre. */
  loose: readonly (readonly [number, number])[]
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
}

export const crowBossPose = (p: Partial<CrowBossPose> = {}): CrowBossPose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  spin: 0,
  head: [0, 0],
  nod: 0,
  jaw: 0,
  tongue: false,
  eyes: 'glare',
  wingN: [-160, 1, 1, 0],
  wingF: [-20, 1, 1, 0],
  tail: [40, 0.6],
  feet: [0, 0.2],
  reach: 0,
  scarf: [10, 32, 1.5, 0],
  crest: 0,
  loose: [],
  stars: -1,
  ...p
})

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = { K: C.black, w: C.white, a: BEAK[1], A: BEAK[2], B: MANTLE[3], i: C.inkCool }
/** The near eye (9×10): a heavy feathered brow, a white, an amber iris and a pupil with its highlight. */
const EYES: Record<Eyes, readonly string[]> = {
  glare: [
    'BB.......',
    'BBBBB....',
    '.BBBBBBB.',
    '..BBBBBBB',
    '.KKKKKKK.',
    '.KwwaaaK.',
    '.KwawKaK.',
    '.KwaKKaK.',
    '..KwaaK..',
    '...KKK...'
  ],
  narrow: [
    'BB.......',
    'BBBBB....',
    '.BBBBBBB.',
    '..BBBBBBB',
    '...BBBBBB',
    '.KKKKKKK.',
    '.KwawKaK.',
    '..KaKKK..',
    '...KKK...',
    '.........'
  ],
  wide: [
    '.BBBB....',
    'B....BB..',
    '...KKKK..',
    '..KwwwwK.',
    '.KwwaaawK',
    '.KwawKaaK',
    '.KwaKKaaK',
    '.KwaaaaAK',
    '..KwAAAK.',
    '...KKKK..'
  ],
  shut: [
    'BB.......',
    'BBBBB....',
    '.BBBBBBB.',
    '..BBBBBBB',
    '.........',
    '.iiiiiii.',
    '..iiiii..',
    '.........',
    '.........',
    '.........'
  ],
  hurt: [
    'B......B.',
    '.B....B..',
    '..B..B...',
    '.........',
    'ii.......',
    '..iii....',
    '....iiii.',
    '..iii....',
    'ii.......',
    '.........'
  ],
  dizzy: [
    '.........',
    '.........',
    '..iiiii..',
    '.i.....i.',
    'i..iii..i',
    'i.i...i.i',
    'i.i.i.i.i',
    'i..i..i.i',
    '.i...i..i',
    '..iii..i.'
  ],
  tired: [
    '.........',
    'BB.......',
    'BBBBBBB..',
    '.BBBBBBBB',
    '.iiiiiiii',
    '.KwaaaaK.',
    '.KwawKaK.',
    '..KaKKK..',
    '...KKK...',
    '.........'
  ]
}
/** The black patch over the far eye, with a dull sheen. */
const PATCH = ['..KKKK.', '.KKsKKK', 'KKsKKKK', 'KsKKKKK', 'KKKKKKK', '.KKKKK.', '..KKK..']
const NOSTRIL = ['KK.', '.KK']
/** Chest feather scallops (inside the pale chest). */
const SCALLOP = ['s...s', '.sss.']
/** Feathers flying off. */
const LOOSE = ['...ff', '..fff', '.fff.', 'fff..', 'f....']
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)
const pol = (len: number, deg: number): Pt => [len * Math.cos(deg * RAD), len * Math.sin(deg * RAD)]
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
const mixPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** A path from `from` heading in direction `deg` (0 = back, + down), rippling sideways toward its end. */
function clothPath(from: Pt, deg: number, len: number, ripple: number, phase: number): Pt[] {
  const pts: Pt[] = [from]
  let [x, y] = from
  const n = 5
  for (let i = 1; i <= n; i++) {
    const s = i / n
    const a = (deg + Math.sin(phase - s * 3.2) * ripple * 6 * s) * RAD
    x += -Math.cos(a) * (len / n)
    y += Math.sin(a) * (len / n)
    const w = Math.sin(phase - s * 4) * ripple * s
    pts.push([x - Math.sin(a) * w, y - Math.cos(a) * w])
  }
  return spline(pts)
}

/** Direction of a path near its point i, in degrees on screen. */
const heading = (path: readonly Pt[], i: number) => {
  const a = path[Math.max(0, i - 2)]
  const b = path[Math.min(path.length - 1, i + 2)]
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
}

/** Darkens a cloth layer's edge that lies over feathers into a hem (red pixel with a non-red pixel below). */
const SCARF_TONES = new Set<number>(BAND.slice(0, 4))
function hem(l: Raster) {
  const src = l.clone()
  for (let y = 0; y < l.h - 1; y++)
    for (let x = 0; x < l.w; x++) {
      const c = src.get(x, y)
      const below = src.get(x, y + 1)
      if (SCARF_TONES.has(c) && below && !SCARF_TONES.has(below)) l.set(x, y, BAND[3])
    }
}

/**
 * The wing's geometry in its own frame (u along the arm outward, v toward the trailing edge): shoulder, elbow,
 * wrist, and the direction of the hand. Folding bends the arm into a W: the elbow forward, the hand swept back.
 */
function wingBones(open: number) {
  const fold = 1 - open
  const h = -fold * 22
  const f = h + fold * 40
  const p = f + fold * 70
  const S: Pt = [0, 0]
  const E = pol(12, h)
  const W = add(E, pol(13.5, f))
  return { S, E, W, h, f, p }
}

/** The wing's frame: origin on the shoulder, u along the arm's direction, v toward the lower side of the screen. */
function wingFrame(shoulder: Pt, ang: number, near: boolean, reach = 1) {
  const s = Math.sin(ang * RAD)
  const c = Math.cos(ang * RAD)
  // with sy = 1 the v axis is (−sin, cos) on screen; prefer it pointing down, and back for a wing held upright
  const score = c + 0.35 * (near ? 1 : -1) * s
  return Frame.at(shoulder[0], shoulder[1], ang, reach, score >= 0 ? 1 : -1)
}

// ------------------------------------------------------------------------------------------------ drawing

const HEAD_SHAPE = union(squircle(0, -1, 15, 13.5, 2.3), oval(4, 5.5, 10.5, 8), oval(-7, 4.5, 9, 8.5))
/** The head scarf: over the crown, its hem low across the brow, the knot's line at the back. */
const SCARF = polygon([
  [-18, -1],
  [-11, -6.5],
  [-3, -9.5],
  [5, -10],
  [11, -8.5],
  [17, -8],
  [17, -22],
  [-17, -22]
])

/** The five primaries of a wing in its own frame: root and tip of each, the outermost first. */
function primaries(open: number, fan: number): [Pt, Pt][] {
  const b = wingBones(open)
  const lens = [23.5, 25, 23, 20, 16.5]
  return lens.map((len, i) => {
    const base = add(add(b.W, pol(-1.8 * i, b.f)), pol(0.9 * i, b.f + 90))
    const dir = b.p - 10 + i * (5 + fan * 11)
    return [base, add(base, pol(len * (0.86 + 0.14 * open), dir))]
  })
}

/** The rig's frames for a pose (shared by the drawing and the tests). */
export function crowBossRig(p: CrowBossPose) {
  const k = 1 + p.squash * 0.04
  const ground = Frame.at(Math.round(64 + p.x), 120)
  const root = ground.child(-2, -Math.round(30 + p.y), p.spin)
  const body = root.child(0, 0, p.lean, k, 1 / k)
  const head = body.child(5 + p.head[0], -23 + p.head[1], p.nod - p.lean * 0.5)
  const wing = (near: boolean) =>
    wingFrame(body.pt(near ? -6 : 3, near ? -9 : -12), (near ? p.wingN : p.wingF)[0] + p.spin, near, near ? 1 : 0.9)
  return { root, body, head, wingN: wing(true), wingF: wing(false) }
}

/** Screen x of the wing tips (the outermost point of any primary of the near and the far wing). */
export function crowBossWingTips(p: CrowBossPose) {
  const { wingN, wingF } = crowBossRig(p)
  const xs = (f: Frame, w: Wing) => primaries(w[1], w[2]).map(([, tip]) => f.pt(...tip)[0])
  return { near: Math.min(...xs(wingN, p.wingN)), far: Math.max(...xs(wingF, p.wingF)) }
}

export function drawCrowBoss(p: CrowBossPose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const { root, body, head, wingN, wingF } = crowBossRig(p)
  const centre = root.pt(0, 0)
  const bodyAt = body.pt(4, -4)

  // ---- wings
  const drawWing = (depth: number, near: boolean, w: Wing) => {
    const [, open, fan, under] = w
    const f = near ? wingN : wingF
    const b = wingBones(open)
    const feather = under > 0.5 ? farRamp(CHEST) : MANTLE
    const covert = under > 0.5 ? CHEST : NAVY
    const tone = (r: Ramp) => (near ? r : farRamp(r))
    // primaries: five long fingers from the hand, the outermost first (underneath)
    for (const [i, [base, tip]] of primaries(open, fan).entries()) {
      g.add(depth + i * 0.01, (l) => {
        fill(l, f, capsule(base, tip, 3, 1.5), tone(feather)[1])
        cel(l, { shade: 1.5, rim: near ? 1 : 0 })
      })
    }
    // secondaries: five rounded feathers hanging from the forearm and the upper arm
    for (let j = 0; j < 5; j++) {
      const at = j < 3 ? mixPt(b.W, b.E, j / 2.4) : mixPt(b.E, b.S, (j - 2) / 3.2)
      const dir = (j < 3 ? b.f : b.h) + 72 + j * 4
      const tip = add(at, pol(13.5 - j * 0.6, dir))
      g.add(depth + 0.1 + j * 0.01, (l) => {
        fill(l, f, capsule(at, tip, 3.4, 2.8), tone(feather)[1])
        cel(l, { shade: 1.6, rim: near ? 1 : 0 })
      })
    }
    // greater coverts: a scalloped row over the roots of the flight feathers
    g.add(depth + 0.2, (l) => {
      const row: Shape[] = []
      for (let j = 0; j < 4; j++) {
        const at = j < 2 ? mixPt(b.W, b.E, j / 1.6) : mixPt(b.E, b.S, (j - 1.5) / 2.6)
        row.push(oval(...add(at, pol(4.6, (j < 2 ? b.f : b.h) + 85)), 3.6, 3.2))
      }
      fill(l, f, union(...row), tone(covert)[1])
      cel(l, { shade: 1.6, rim: near ? 1 : 0 })
    })
    // the arm with the lesser coverts: the lit leading edge of the wing
    g.add(depth + 0.3, (l) => {
      fill(
        l,
        f,
        union(capsule(b.S, b.E, 5.6, 4.4), capsule(b.E, b.W, 4.4, 3.2), oval(...b.W, 3.4, 3.2)),
        tone(covert)[1]
      )
      smooth(l)
      if (under < 0.5) mantle(l, tone(covert)[1], tone(MANTLE)[1], { depth: 2 })
      cel(l, { shade: 2, rim: near ? 1.4 : 0 })
    })
  }
  drawWing(-6, false, p.wingF)

  // ---- scarf tails from the knot at the back of the head
  const knot = head.pt(-14, -5)
  const scarfTail = (l: Raster, far: boolean) => {
    const [ang, len, ripple, phase] = p.scarf
    const path = clothPath(knot, ang + (far ? 16 : 0), far ? len * 0.8 : len, ripple, phase + (far ? 1.4 : 0))
    const tone = far ? farRamp(BAND) : BAND
    ribbon(l, path, (t) => 3.6 + t * 3, tone[1])
    const n = path.length - 1
    carve(
      l,
      Frame.at(path[n][0], path[n][1], heading(path, n)),
      polygon([
        [4, -4],
        [-2.2, 0],
        [4, 4]
      ])
    )
    cel(l, { shade: 1.6, rim: far ? 0 : 1 })
    if (!far)
      for (let i = Math.round(n * 0.4); i <= Math.round(n * 0.62); i++) {
        const a = (heading(path, i) * Math.PI) / 180
        const s = Math.cos(a) < 0 ? 1 : -1
        l.paint(path[i][0] - Math.sin(a) * s * 0.8, path[i][1] + Math.cos(a) * s * 0.8, BAND[2])
      }
  }
  g.add(-5, (l) => scarfTail(l, true))

  // ---- tail fan: five broad feathers from the rump, the middle one on top
  const tailBase = body.pt(-8, 12)
  for (const i of [-2, 2, -1, 1, 0]) {
    const dir = 90 + p.tail[0] + i * (5 + p.tail[1] * 10) + p.lean + p.spin
    const len = 22 - Math.abs(i) * 2.4
    g.add(-4 + (2 - Math.abs(i)) * 0.01, (l) => {
      const end = add(tailBase, pol(len, dir))
      fill(
        l,
        ID,
        union(capsule(add(tailBase, pol(3, dir)), end, 2.6, 3.4), oval(...add(end, pol(-1, dir)), 3.8, 3.8)),
        (i < 0 ? farRamp(MANTLE) : MANTLE)[1]
      )
      cel(l, { shade: 1.6, rim: 1 })
    })
  }

  // ---- legs: feathered thighs belong to the body; the yellow shank, toes and dark talons hang free
  const leg = (l: Raster, near: boolean) => {
    const tone = near ? BEAK : farRamp(BEAK)
    const hip = body.pt((near ? 1 : 8) + p.reach, 14 - p.reach * 0.6)
    const dir = 90 - p.feet[0] * (near ? 1 : 0.85) + p.lean + p.spin
    const ankle = add(hip, pol(6.5 + p.feet[1] * 2.5 + p.reach * 0.6, dir))
    const foot = Frame.at(ankle[0], ankle[1], dir - 90)
    fill(l, ID, capsule(hip, ankle, 3, 2.3), tone[1])
    const o = p.feet[1]
    const toes: Pt[] = [
      [2 + o * 3.5, 3.5 - o * 1.5],
      [3.4 + o * 3.4, 1.2 - o * 0.8],
      [0.5 + o * 2.5, 4.5 - o * 0.5],
      [-3.2 - o, 2.5 - o]
    ]
    for (const t of toes) fill(l, foot, capsule([0, 0.5], t, 1.6, 1.2), tone[1])
    smooth(l)
    cel(l, { shade: 1.4, rim: near ? 1 : 0 })
    for (const t of toes) {
      const d = Math.hypot(t[0], t[1] - 0.5) || 1
      const u: Pt = [t[0] / d, (t[1] - 0.5) / d]
      // the talon curls down at the toe's end
      fill(l, foot, capsule(t, [t[0] + u[0] * 2.4 + u[1] * 0.6, t[1] + u[1] * 2.4 + 1.2], 1, 0.6), NAVY[3])
    }
  }
  g.add(-3, (l) => leg(l, false))

  // ---- body: barrel chest, belly, rump, thighs and neck as ONE silhouette, shaded once
  const neckEnd = body.local(...head.pt(-2, 6))
  g.add(0, (l) => {
    fill(
      l,
      body,
      union(
        egg(2, 0, 15, 14, 15),
        oval(7, -3, 11.5, 12.5),
        oval(-7, 8, 9, 8.5),
        oval(1, 12, 7, 5.5),
        capsule([3, -9], neckEnd, 11, 10)
      ),
      NAVY[1]
    )
    tint(l, body, union(oval(10, 1, 9, 12.5), oval(6, 9, 7, 6)), CHEST[1])
    smooth(l)
    mantle(l, NAVY[1], MANTLE[1], { depth: 6, tooth: 3, pitch: 5, origin: bodyAt })
    cel(l, { shade: 7, deep: 2.5, rim: 2, tooth: 3, pitch: 5, origin: bodyAt })
    within(
      l,
      (m) => {
        for (const [u, v] of [
          [11, -3],
          [7, 3],
          [13, 4],
          [9, 9]
        ] as const)
          stampAt(m, body, SCALLOP, u, v, { s: CHEST[2] })
      },
      true
    )
    shadow(l, head.moved(0, 2.5), HEAD_SHAPE)
  })
  g.add(0.5, (l) => leg(l, true))

  // ---- near wing in front of the body
  drawWing(1, true, p.wingN)
  g.add(2.5, (l) => scarfTail(l, false))

  // ---- crest: three ruffled locks at the back of the head, sticking out under the scarf's knot
  g.add(2.9, (l) => {
    const c = p.crest
    fill(
      l,
      head,
      union(
        capsule([-12, -8], [-21 - c * 2, -15 - c * 3], 3.4, 1.4),
        capsule([-13, -3], [-25 - c * 2, -6 - c * 3], 3.4, 1.4),
        capsule([-12, 3], [-22 - c * 2, 5 - c * 2], 3, 1.3)
      ),
      MANTLE[1]
    )
    smooth(l)
    cel(l, { shade: 1.8, rim: 1 })
  })

  // ---- head: skull, jowl and nape as one silhouette; the scarf and the pale face tinted inside it
  const headAt = head.pt(0, -4)
  g.add(3, (l) => {
    fill(l, head, HEAD_SHAPE, NAVY[1])
    tint(l, head, union(oval(4.5, 0, 8.5, 8), oval(6, 6, 7.5, 4.5)), CHEST[1])
    tint(l, head, SCARF, BAND[1])
    smooth(l)
    cel(l, { shade: 4.5, deep: 1.5, rim: 1.6, tooth: 1.5, pitch: 4, origin: headAt })
    hem(l)
    within(l, (m) => {
      stampAt(m, head, EYES[p.eyes], 3.5, -3, EYE_KEY)
    })
  })

  // ---- beak: a big hooked upper mandible, the lower one hinged to open on the mouth
  const bill = head.child(12, 3)
  const jaw = bill.child(0, 2, p.jaw * 42)
  const open = p.jaw > 0.06
  if (open)
    g.add(
      3.3,
      (l) => {
        const [jx, jy] = jaw.pt(14, 0.5)
        fill(l, bill, polygon([[-1, 0], [17, 1.5], bill.local(jx, jy), [-1, 4.5]]), C.mouth)
        if (p.tongue || p.jaw > 0.5) {
          const tip = p.tongue ? jaw.pt(17, 3) : jaw.pt(8, -0.5)
          fill(l, ID, capsule(jaw.pt(2, -0.6), tip, 2.2, p.tongue ? 2.2 : 1.6), C.tongue)
        }
      },
      !p.tongue
    )
  g.add(3.4, (l) => {
    fill(l, jaw, overlap(overlap(oval(1, 0, 15, 3.6), half([0, 0], 0, 1)), half([-3, 0], 1, 0)), BEAK[1])
    smooth(l)
    cel(l, { shade: 1.4 })
  })
  g.add(3.5, (l) => {
    fill(
      l,
      bill,
      union(
        overlap(overlap(oval(2, 2, 17.5, 7.5), half([0, 2], 0, -1)), half([-3, 0], 1, 0)),
        capsule([15.5, 1], [19.5, 5.5], 2.4, 1.3)
      ),
      BEAK[1]
    )
    smooth(l)
    cel(l, { shade: 1.8, rim: 1.2 })
    within(l, (m) => {
      stampAt(m, bill, NOSTRIL, 6, -2, { K: BEAK[3] })
      if (!open) fill(m, bill, capsule([1, 1.6], [15, 1.6], 0.5, 0.5), BEAK[3])
    })
  })
  // the eye patch over the far eye, strapped on over the root of the beak
  g.add(3.7, (l) => {
    stampAt(l, head, PATCH, 12.5, -3.5, { K: C.black, s: MANTLE[2] })
  })
  g.add(3.8, (l) => {
    fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 3.6, 3.2), BAND[1])
    cel(l, { shade: 1.4, rim: 1 })
  })

  // ---- loose feathers
  if (p.loose.length)
    g.add(5, (l) => {
      for (const [dx, dy] of p.loose)
        l.stamp(LOOSE, Math.round(centre[0] + dx - 2), Math.round(centre[1] + dy - 2), { f: NAVY[1] })
      cel(l, { shade: 1 })
    })

  // ---- stars over a knocked-out head, outlined
  if (p.stars >= 0)
    g.add(6, (l) => {
      const [hx, hy] = head.pt(0, 0)
      const cx = hx + 4
      const cy = hy - 29
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 13) - 2,
          Math.round(cy + Math.sin(a) * 3.5) - 2,
          { y: BEAK[1], Y: BEAK[0] }
        )
      }
    })

  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const P = crowBossPose
const draw = (poses: CrowBossPose[]) => poses.map(drawCrowBoss)

type Beat = { wn: Wing; wf: Wing; y: number }

/** idle: hovering on a deep, slow wing beat (down on two frames, up on four). */
const idle = memo(() => {
  const N = 6
  const beat: Beat[] = [
    { wn: [-112, 0.95, 0.9, 0], wf: [-68, 0.95, 0.9, 0], y: 0 },
    { wn: [-178, 1, 1, 0], wf: [-2, 1, 1, 0], y: 2 },
    { wn: [146, 0.85, 0.7, 0], wf: [34, 0.85, 0.7, 0], y: 3 },
    { wn: [142, 0.35, 0.1, 0], wf: [38, 0.35, 0.1, 0], y: 2 },
    { wn: [-158, 0.3, 0.15, 1], wf: [-22, 0.3, 0.15, 1], y: 1 },
    { wn: [-126, 0.6, 0.5, 0], wf: [-54, 0.6, 0.5, 0], y: 0 }
  ]
  const ys = beat.map((b) => b.y)
  const late = lag(ys, { stiffness: 0.35, damping: 0.45, loop: true })
  return beat.map((b, i) =>
    P({
      y: b.y,
      wingN: b.wn,
      wingF: b.wf,
      lean: -late[i] * 1.5,
      head: [i === 3 || i === 4 ? 1 : 0, 0],
      nod: [0, -1, -2, 2, 5, 3][i],
      eyes: i === 4 ? 'narrow' : 'glare',
      tail: [40 - late[i] * 6, [0.4, 0.8, 1, 0.7, 0.5, 0.4][i]],
      feet: [late[i] * 5, 0.2],
      scarf: [8 + late[i] * 6, 32, 0.8, (i / N) * TAU]
    })
  )
})

/** intro: rears back with the wings cupped, throws them wide and screeches (held), then settles into the hover. */
const intro = memo(() => [
  P({ wingN: [-150, 0.8, 0.6, 0], wingF: [-30, 0.8, 0.6, 0], scarf: [10, 32, 1.4, 0] }),
  P({
    x: -2,
    y: 3,
    lean: -14,
    head: [-2, 1],
    nod: 8,
    eyes: 'narrow',
    wingN: [150, 0.45, 0.2, 1],
    wingF: [32, 0.45, 0.2, 1],
    tail: [62, 0.3],
    feet: [16, 0.1],
    crest: 0.3,
    scarf: [20, 30, 1, 1]
  }),
  P({
    x: -1,
    y: 2,
    lean: -8,
    head: [0, -1],
    nod: -10,
    jaw: 0.7,
    eyes: 'wide',
    wingN: [-168, 1, 1, 0],
    wingF: [-12, 1, 1, 0],
    tail: [36, 1],
    feet: [-6, 0.6],
    crest: 0.8,
    scarf: [-6, 34, 2, 2.4]
  }),
  P({
    y: 3,
    lean: -6,
    head: [0, -2],
    nod: -22,
    jaw: 1,
    eyes: 'shut',
    wingN: [-174, 1, 1, 0],
    wingF: [-6, 1, 1, 0],
    tail: [40, 1],
    feet: [-10, 1],
    crest: 1,
    scarf: [-12, 34, 2.4, 3.6]
  }),
  P({
    y: 3,
    lean: -6,
    head: [0, -2],
    nod: -20,
    jaw: 0.95,
    eyes: 'shut',
    wingN: [-172, 1, 0.9, 0],
    wingF: [-8, 1, 0.9, 0],
    tail: [42, 0.9],
    feet: [-8, 1],
    crest: 0.8,
    scarf: [-8, 34, 2.4, 5]
  }),
  P({
    y: 2,
    lean: 4,
    head: [1, 1],
    nod: 6,
    jaw: 0.15,
    eyes: 'glare',
    wingN: [150, 0.8, 0.6, 0],
    wingF: [32, 0.8, 0.6, 0],
    tail: [44, 0.7],
    feet: [6, 0.4],
    crest: 0.4,
    scarf: [14, 32, 1.6, 6.2]
  }),
  P({
    y: 1,
    lean: 2,
    nod: 3,
    eyes: 'glare',
    wingN: [-148, 0.75, 0.6, 0],
    wingF: [-34, 0.75, 0.6, 0],
    tail: [40, 0.5],
    feet: [4, 0.2],
    crest: 0.2,
    scarf: [8, 32, 1.4, 7.2]
  }),
  P({
    y: 2,
    lean: 1,
    nod: 4,
    eyes: 'glare',
    wingN: [-176, 1, 1, 0],
    wingF: [-4, 1, 1, 0],
    tail: [38, 0.8],
    feet: [0, 0.2],
    crest: 0.1,
    scarf: [12, 32, 1.4, 8.4]
  })
])

/** hurt: a squawk with the wings thrown up and feathers flying off, the recoil, a furious recovery. */
const hurt = memo(() => [
  P({
    x: -3,
    y: 6,
    lean: -12,
    squash: -1.5,
    head: [-2, -1],
    nod: -14,
    jaw: 0.9,
    eyes: 'hurt',
    wingN: [-112, 0.9, 1, 1],
    wingF: [-68, 0.9, 1, 1],
    tail: [22, 1],
    feet: [-14, 1],
    crest: 1,
    scarf: [-14, 32, 2, 0],
    loose: [
      [-30, -22],
      [24, -30],
      [-12, -38]
    ]
  }),
  P({
    x: -6,
    y: -2,
    lean: 10,
    squash: 1,
    head: [-1, 2],
    nod: 12,
    jaw: 0.4,
    eyes: 'shut',
    wingN: [158, 0.7, 0.5, 0],
    wingF: [26, 0.7, 0.5, 0],
    tail: [50, 0.6],
    feet: [20, 0.3],
    crest: 0.7,
    scarf: [24, 32, 1.6, 1.6],
    loose: [
      [-36, -30],
      [30, -38],
      [-16, -46]
    ]
  }),
  P({
    x: -3,
    lean: 4,
    head: [1, 1],
    nod: 6,
    jaw: 0.25,
    eyes: 'narrow',
    wingN: [-150, 0.8, 0.7, 0],
    wingF: [-30, 0.8, 0.7, 0],
    tail: [40, 0.7],
    feet: [6, 0.5],
    crest: 0.5,
    scarf: [10, 32, 1.4, 3]
  })
])

/** windup: climbs, folds the wings half back in a W, the beak aimed down at the hero, talons forward; trembles. */
const windup = memo(() => {
  const set: Partial<CrowBossPose> = {
    y: 6,
    lean: 26,
    head: [2, 2],
    nod: 26,
    eyes: 'glare',
    jaw: 0.1,
    wingN: [-118, 0.3, 0.3, 0],
    wingF: [-62, 0.3, 0.3, 0],
    tail: [10, 0.3],
    feet: [40, 0.8],
    crest: 0.8
  }
  return [
    P({
      y: 3,
      lean: 8,
      head: [1, 0],
      nod: 10,
      eyes: 'narrow',
      wingN: [-132, 0.7, 0.7, 0],
      wingF: [-50, 0.7, 0.7, 0],
      tail: [30, 0.6],
      feet: [10, 0.4],
      crest: 0.4,
      scarf: [0, 32, 1.4, 0]
    }),
    P({ ...set, y: 5, scarf: [-10, 34, 1.8, 1.4] }),
    P({ ...set, x: 1, scarf: [-14, 34, 1.8, 2.8], wingN: [-117, 0.28, 0.35, 0] }),
    P({ ...set, x: -1, y: 7, scarf: [-12, 34, 1.8, 4.2], wingF: [-63, 0.28, 0.25, 0], crest: 1 })
  ]
})

/** attack: the dive — wings swept hard back, the body a spear behind the beak, talons out, the scarf streaming. */
const attack = memo(() =>
  [0, 1, 2].map((i) =>
    P({
      x: 0,
      y: 12,
      lean: 108,
      squash: -2.5,
      head: [1, 0],
      nod: -20,
      jaw: 0.35,
      eyes: 'glare',
      wingN: [-152 + [0, 2, -1][i], 0.88, [0, 0.25, 0.1][i], 0],
      wingF: [-140 + [1, -1, 2][i], 0.88, [0.15, 0, 0.25][i], 0],
      tail: [-8, [0.2, 0.4, 0.3][i]],
      feet: [150, 1],
      reach: 13,
      crest: 0,
      scarf: [-36, 36, 1.2, (i / 3) * TAU]
    })
  )
)

/** recover: out of breath — heavy, uneven flaps, the beak open on the tongue, the head hanging. */
const recover = memo(() => {
  const near: Wing[] = [
    [-142, 0.7, 0.5, 0],
    [158, 0.75, 0.5, 0],
    [170, 0.5, 0.2, 1],
    [-170, 0.55, 0.3, 1]
  ]
  const far: Wing[] = [
    [-20, 0.6, 0.4, 1],
    [-44, 0.7, 0.5, 0],
    [24, 0.75, 0.5, 0],
    [10, 0.5, 0.2, 1]
  ]
  const ys = [0, 1, -1, -2]
  return ys.map((y, i) =>
    P({
      y: y - 3,
      lean: 8,
      head: [2, 3 + (i % 2)],
      nod: 18 + (i % 2) * 4,
      jaw: 0.55 + (i % 2) * 0.2,
      tongue: true,
      eyes: 'tired',
      wingN: near[i],
      wingF: far[i],
      tail: [56, 0.4],
      feet: [-4 + i * 3, 0],
      crest: 0.2,
      scarf: [30, 30, 0.8, (i / 4) * TAU]
    })
  )
})

/** defeat: the hit, a spin with feathers bursting off, the wings folding, onto his back, a bounce, out cold. */
const defeat = memo(() => {
  const lying: Partial<CrowBossPose> = {
    x: 2,
    y: -4,
    spin: -90,
    lean: 0,
    squash: 1,
    head: [0, 0],
    nod: -55,
    jaw: 0.5,
    tongue: true,
    eyes: 'dizzy',
    wingN: [-100, 1, 1, 0],
    wingF: [100, 1, 1, 1],
    tail: [30, 1],
    feet: [90, 0.2],
    crest: 0.6,
    scarf: [12, 22, 0.6, 0]
  }
  return [
    P({
      x: -3,
      y: 7,
      lean: -14,
      squash: -2,
      head: [-2, -1],
      nod: -16,
      jaw: 1,
      eyes: 'hurt',
      wingN: [-108, 0.9, 1, 1],
      wingF: [-72, 0.9, 1, 1],
      tail: [20, 1],
      feet: [-16, 1],
      crest: 1,
      scarf: [-16, 32, 2, 0],
      loose: [
        [-32, -20],
        [26, -32]
      ]
    }),
    P({
      x: -2,
      y: 8,
      spin: -90,
      jaw: 0.8,
      eyes: 'hurt',
      wingN: [-120, 0.8, 1, 1],
      wingF: [60, 0.8, 1, 0],
      tail: [30, 1],
      feet: [10, 1],
      crest: 1,
      scarf: [-30, 30, 2, 1.2],
      loose: [
        [-38, -28],
        [32, -40],
        [-6, -44]
      ]
    }),
    P({
      y: 14,
      spin: -180,
      jaw: 0.6,
      eyes: 'dizzy',
      wingN: [60, 0.5, 0.4, 0],
      wingF: [120, 0.5, 0.4, 1],
      tail: [30, 0.6],
      feet: [30, 0.5],
      crest: 0.8,
      scarf: [20, 30, 1.6, 2.4],
      loose: [
        [-42, -36],
        [36, -46]
      ]
    }),
    P({
      x: 1,
      y: 6,
      spin: -270,
      jaw: 0.6,
      eyes: 'dizzy',
      wingN: [-40, 0.45, 0.3, 1],
      wingF: [-120, 0.45, 0.3, 0],
      tail: [30, 0.5],
      feet: [40, 0.3],
      crest: 0.8,
      scarf: [60, 26, 1.6, 3.6],
      loose: [[40, -50]]
    }),
    P({ ...lying, y: -6, squash: 2.5, eyes: 'shut', jaw: 0.8, feet: [80, 0.6], scarf: [30, 22, 1, 4.8] }),
    P({
      ...lying,
      y: -1,
      squash: -1,
      nod: -45,
      wingN: [-108, 0.9, 0.8, 0],
      wingF: [108, 0.9, 0.8, 1],
      feet: [100, 0.4],
      scarf: [-10, 22, 1.2, 6]
    }),
    P({ ...lying, stars: 0, scarf: [8, 22, 0.6, 7] }),
    P({ ...lying, stars: 1 / 6, feet: [94, 0.25], scarf: [10, 22, 0.6, 8.6] })
  ]
})

/** The clips as poses (for the tests). */
export const crowBossPoses = { idle, intro, hurt, windup, attack, recover, defeat }

export const sheets: SheetModule = {
  crowBoss: () => ({
    idle: lazyAnim(() => draw(idle()), 8, true),
    intro: lazyAnim(() => draw(intro()), 10, false, { sustain: 2 }),
    hurt: lazyAnim(() => draw(hurt()), 12, false),
    defeat: lazyAnim(() => draw(defeat()), 10, false, { sustain: 2 }),
    windup: lazyAnim(() => draw(windup()), 10, false, { sustain: 2 }),
    attack: lazyAnim(() => draw(attack()), 14, true),
    recover: lazyAnim(() => draw(recover()), 8, true)
  })
}
