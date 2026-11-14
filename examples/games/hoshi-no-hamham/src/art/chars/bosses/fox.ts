/**
 * きつね旋風 (`foxBoss`): the captain of the pursuers, a cocky ninja fox built on the rig toolkit. Lean and upright on
 * his toes: a wedge-shaped head with a long pointed muzzle, a white cheek ruff, tall black-tipped ears and slanted
 * amber eyes; a dark navy sleeveless jacket with a red sash, bare orange upper arms and black gloves, black leggings
 * and split-toe boots; the gang's red headband with a steel plate, knotted behind the head with two long tails; and
 * a great brush of a tail, as big as his body, held in an S behind him. His dash turns him into a wheel: the tucked
 * rig itself is turned a sixth of a circle per frame. 128×128, facing right, feet on (64, 120).
 *
 * Rendering (CHARACTERS.md "Big furry bodies"): the tail and the head are single silhouettes with a russet mantle on
 * the back, fur teeth on the shadow and hand-placed locks; the jacket, chest fur and sash are one silhouette shaded
 * once; limbs are two-bone capsules with joints; eyes, nose, mouth lines, the plate and the stars are stamps.
 *
 * Depth (back to front): wind behind, tail (when behind), far leg, far arm, headband tails, body, near leg, far ear,
 * lower jaw, head, near ear, headband, face, near arm, tail (when wrapped in front), wind in front, stars.
 */
import type { SheetModule } from '../../module'
import { TAU, ease, lag, track } from '../../motion'
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

const FUR = R.foxOrange
const FAR = farRamp(FUR)
/** The russet mantle along the back of the head, the back and the upper side of the tail. */
const RUSSET = ramp('#ec8a48', '#c4561f', '#93391a', '#783818', '#3a1a22')
/** White cheeks, chin, chest, inner ears and the tail tip. */
const PALE = ramp('#ffffff', '#f7efe8', '#dccbc4', '#a68c8c', '#3a1a22')
/** The dark navy jacket; one step down it is the black of the gloves, leggings, boots and ear tips. */
const NAVY = ramp('#6c7cc0', '#3e4a86', '#2a3260', '#1b2040', '#1c1830')
/** The pale core of his fox-fire (only the cast uses it). */
const FIRE = R.fire
const BAND = R.bandana
const STEEL = R.steel
const GOLD = R.gold

type Eyes = 'sly' | 'angry' | 'wide' | 'shut' | 'hurt' | 'dizzy' | 'tired' | 'happy'
type Mouth = 'smirk' | 'grin' | 'open' | 'flat'
type Hand = 'fist' | 'two' | 'open'
/** Hand position relative to the shoulder (torso units), hand turn (degrees, 0 = along the forearm), elbow bend. */
type Arm = readonly [number, number, number, 1 | -1]
/** Ball of the foot: forward (px), lift (px), turn (degrees, + toes down). */
type Leg = readonly [number, number, number]

export interface FoxPose {
  /** Whole figure forward (+) and the pelvis up (+); planted feet stay on the ground. */
  x: number
  y: number
  /** The whole rig turned clockwise (degrees) about a point `pivot` px above the ground. */
  spin: number
  pivot: number
  /** Torso tilt (degrees, forward +) and stretch (+ wider and shorter). */
  lean: number
  squash: number
  breath: number
  /** Head offset from its seat on the neck, and nod (degrees, nose down +). */
  head: readonly [number, number]
  nod: number
  eyes: Eyes
  mouth: Mouth
  /** Lower jaw opening 0..1 (with mouth 'open'). */
  jaw: number
  /** Ears turned back (degrees). */
  earN: number
  earF: number
  armN: Arm
  armF: Arm
  handN: Hand
  handF: Hand
  /** The far arm reaches across in front of the chest (drawn over the body, under the near arm). */
  farFront: boolean
  /** Feet relative to their rest place on the ground (or, when `feetFree`, still in the ground frame). */
  legN: Leg
  legF: Leg
  /** The tail's spine: five points in pelvis units (u forward, v down), its width factor (0 = no tail) and a sway phase. */
  tail: readonly Pt[]
  puff: number
  sway: number
  /** How far the sway moves the tail (px at the tip). */
  swayAmp: number
  /** The tail drawn in front of the body (wrapped round him). */
  tailFront: boolean
  /** Headband tails: direction (0 = straight back, + down), length, ripple, phase, droop toward the end (degrees). */
  band: readonly [number, number, number, number, number]
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
  /** Wind streaks round the turning centre: how many (0..3), their angle (degrees) and radius. */
  wind: number
  windAt: number
  windR: number
  /** The whole figure lifted on screen (px), for bounces of a lying or tumbling body. */
  rise: number
  /** Fox-fire gathering over the near hand's fingertips: flame radius (px), 0 = none. */
  fire: number
  /** The release flash in front of the near palm: its reach (px), 0 = none. */
  flash: number
}

/** The tail at rest: down and back from the rump, up behind him, the tip curling forward at head height. */
const TAIL_REST: readonly Pt[] = [
  [-6, -1],
  [-20, 7],
  [-35, 0],
  [-38, -20],
  [-27, -38]
]

export const foxPose = (p: Partial<FoxPose> = {}): FoxPose => ({
  x: 0,
  y: 0,
  spin: 0,
  pivot: 30,
  lean: 4,
  squash: 0,
  breath: 0,
  head: [0, 0],
  nod: 0,
  eyes: 'sly',
  mouth: 'smirk',
  jaw: 0,
  earN: 0,
  earF: 0,
  armN: [12, 6, -10, 1],
  armF: [-7, 15, 30, 1],
  handN: 'two',
  handF: 'fist',
  farFront: false,
  legN: [0, 0, 0],
  legF: [0, 0, 0],
  tail: TAIL_REST,
  puff: 1,
  sway: 0,
  swayAmp: 2.5,
  tailFront: false,
  band: [6, 30, 1.5, 0, 34],
  stars: -1,
  wind: 0,
  windAt: 0,
  windR: 34,
  rise: 0,
  fire: 0,
  flash: 0,
  ...p
})

/** Pelvis height above the ground at rest (standing on his toes). */
const HIP = 23
/** The head is drawn larger than nature. */
const HS = 1.12
/** Rest places of the balls of the feet (x relative to the anchor). */
const REST = { N: 6, F: -5 } as const

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = { K: C.black, w: C.white, y: GOLD[1], o: FUR[1], B: RUSSET[3], i: C.inkWarm }
/** The near eye: slanted (the outer corner high), a heavy upper lid, amber iris with a slit pupil. */
const EYES: Record<Eyes, readonly string[]> = {
  sly: ['BB........', '.BBBB.....', '..KKKKKKK.', '..KwwyyKKK', '..KwyyKyoK', '...KyyKoK.', '....KKKK..'],
  angry: ['B.........', '.BBB......', '...BBBBB..', '..KKKKKKBB', '..KwyyKKK.', '...KyyKoK.', '....KKKK..'],
  wide: [
    '..BBB.....',
    '.B........',
    '..KKKKKK..',
    '.KwwyyyKK.',
    '.KwyyKyyK.',
    '.KyyyKyoK.',
    '..KyyyyK..',
    '...KKKK...'
  ],
  shut: ['BB........', '.BBBB.....', '..........', '..iiiiiii.', '...iiiiiii', '..........'],
  hurt: ['B.........', '.BB.......', '..ii......', '....iii...', '......iii.', '....iii...', '..ii......'],
  dizzy: ['..........', '..iiiii...', '.i.....i..', '.i.iii.i..', '.i.i.i.i..', '.i...i.i..', '..iii..i..'],
  tired: ['..........', 'BBBB......', '..iiiiiii.', '..KKKKKKKK', '..KyyyKyoK', '...KKKKK..'],
  happy: ['BB........', '.BBBB.....', '..........', '...iiiii..', '..i.....i.', '.i.......i']
}
const NOSE = ['.KKK', 'KhKK', 'KKKK', '.KK.']
/** The steel plate on the headband: hard highlight, dark core, an engraved swirl. */
const PLATE = ['.ddddd.', 'dhhsssd', 'dhsmmsd', 'dssmssd', '.ddddd.']
const PLATE_KEY = { h: STEEL[0], s: STEEL[1], d: STEEL[2], m: NAVY[3], '.': STEEL[2] }
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)
const RAD = Math.PI / 180

/** A path from `from` heading in direction `deg` (0 = back, + down), bending by `curl` degrees along its length. */
function bentPath(from: Pt, deg: number, curl: number, len: number, wobble: (s: number) => number): Pt[] {
  const pts: Pt[] = [from]
  let [x, y] = from
  const n = 5
  for (let i = 1; i <= n; i++) {
    const s = i / n
    const a = (deg + curl * s) * RAD
    const w = wobble(s)
    x += -Math.cos(a) * (len / n)
    y += Math.sin(a) * (len / n)
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

/** Index of the point at a share `t` of a path's length. */
function along(path: readonly Pt[], t: number) {
  let total = 0
  const acc = [0]
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    acc.push(total)
  }
  const want = total * t
  let i = 0
  while (i < acc.length - 1 && acc[i] < want) i++
  return i
}

/**
 * White fur on the very edge of a part takes the pale base colour instead, so the outline next to it stays a dark
 * line (as on the wolf). Candidate for the toolkit (`cel` option).
 */
function dimEdge(l: Raster) {
  const b = l.bounds()
  if (!b) return
  const src = l.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (
        src.get(x, y) === PALE[0] &&
        !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1))
      )
        l.set(x, y, PALE[1])
}

/** A hand in its own frame (wrist at the origin, fingers toward +u). */
function handShape(kind: Hand): Shape {
  const palm = oval(2.8, 0, 3.3, 3)
  const thumb = capsule([2.2, -2.2], [4.6, -3.2], 1.4, 1.2)
  if (kind === 'fist') return union(oval(3, 0, 3.6, 3.2), thumb)
  if (kind === 'two') return union(palm, capsule([4, -0.6], [8, -0.8], 1.5, 1.2), thumb)
  return union(
    palm,
    capsule([4.5, -1.8], [8.2, -3.6], 1.2, 1),
    capsule([5, 0], [9, 0.2], 1.2, 1),
    capsule([4.5, 1.8], [8, 3.4], 1.2, 1),
    capsule([2, -2.4], [3.6, -5], 1.2, 1)
  )
}

/** A streak of wind along a circle: thin trailing end, thick head at `a1` (degrees, in frame `f`). */
function streak(l: Raster, f: Frame, r: number, a0: number, a1: number, w: number, c: number) {
  const wid = (t: number) => 0.8 + w * Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.38)) * t ** 0.7
  const pts: Pt[] = []
  const n = 8
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * RAD
    pts.push(f.pt(Math.cos(a) * r, Math.sin(a) * r))
  }
  const path = spline(pts)
  // a dark rim of its own under the light core, so the streak keeps an edge
  ribbon(l, path, (t) => wid(t) + 2, NAVY[3])
  ribbon(l, path, wid, c)
}

// ------------------------------------------------------------------------------------------------ drawing

/** The rig's key points on screen (used by the tests). */
export function foxRig(p: FoxPose) {
  const centre = Frame.at(64 + p.x, 120 - p.pivot - p.rise, p.spin)
  const ground = centre.child(0, p.pivot)
  const pelvis = ground.child(0, -HIP - p.y)
  const k = 1 + p.squash * 0.04
  const torso = pelvis.child(0, -1, p.lean, k, 1 / k)
  const head = torso.child(3.5 + p.head[0], -30 + p.head[1], p.nod - p.lean * 0.55, HS)
  const footN = ground.child(REST.N + p.legN[0], -p.legN[1], p.legN[2])
  const footF = ground.child(REST.F + p.legF[0], -p.legF[1], p.legF[2])
  return { centre, ground, pelvis, torso, head, footN, footF }
}

export function drawFox(p: FoxPose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const { centre, pelvis, torso, head, footN, footF } = foxRig(p)
  const br = p.breath

  // ---- legs: hip → knee → heel (raised: he stands on his toes) → ball of the foot
  const legGeo = (foot: Frame, lift: number, turn: number, near: boolean) => {
    const hip = pelvis.pt(near ? 2.5 : -2, near ? 2 : 1)
    const heel = foot.pt(-4.6, -6.2)
    const { mid } = joint(hip, heel, 9.5, 10, -1)
    const grounded = lift < 0.6 && Math.abs(turn) < 12
    return { hip, heel, knee: mid, foot, grounded }
  }
  const legNg = legGeo(footN, p.legN[1], p.legN[2], true)
  const legFg = legGeo(footF, p.legF[1], p.legF[2], false)
  const legLayer = (leg: ReturnType<typeof legGeo>, base: number, far: boolean) => (l: Raster) => {
    fill(l, ID, capsule(leg.hip, leg.knee, far ? 4.2 : 4.6, 3.1), base)
    fill(l, ID, capsule(leg.knee, leg.heel, 3, 2.1), base)
    const boot = union(capsule([-4.6, -6.2], [0, -2.4], 2.7, 2.6), oval(2, -2.2, 3.6, 2.2))
    fill(l, leg.foot, leg.grounded ? overlap(boot, half([0, -0.5], 0, -1)) : boot, base)
    smooth(l)
    cel(l, far ? { rim: 1 } : { shade: 2, rim: 1.2 })
    // the shin wrap and the split toe of the boot
    within(l, (m) => {
      stampAt(m, leg.foot, ['k', 'k'], 2.6, -2.4, { k: far ? NAVY[3] : NAVY[3] })
    })
  }
  g.add(-4, legLayer(legFg, NAVY[3], true))

  // ---- arms: bare orange upper arm, black glove with a flared cuff, a shaped hand
  const armGeo = (s: Pt, a: Arm) => {
    const sl = torso.local(...s)
    const w = torso.pt(sl[0] + a[0], sl[1] + a[1])
    // limbs may cheat: a hand thrust out of reach grows the arm (up to about 1.45×)
    const k = Math.max(1, Math.min(1.45, Math.hypot(w[0] - s[0], w[1] - s[1]) / 19))
    const { mid } = joint(s, w, 10 * k, 9.5 * k, a[3])
    const fore = (Math.atan2(w[1] - mid[1], w[0] - mid[0]) * 180) / Math.PI
    return { s, elbow: mid, wrist: w, hand: Frame.at(w[0], w[1], fore + a[2]) }
  }
  const armLayer = (arm: ReturnType<typeof armGeo>, hand: Hand, fur: number, glove: number) => (l: Raster) => {
    fill(l, ID, capsule(arm.s, arm.elbow, 3.7, 2.9), fur)
    const d = Math.hypot(arm.wrist[0] - arm.elbow[0], arm.wrist[1] - arm.elbow[1]) || 1
    const cuff: Pt = [
      arm.elbow[0] + ((arm.wrist[0] - arm.elbow[0]) / d) * 2.2,
      arm.elbow[1] + ((arm.wrist[1] - arm.elbow[1]) / d) * 2.2
    ]
    fill(l, ID, capsule(cuff, arm.wrist, 3.6, 2.5), glove)
    fill(l, arm.hand, handShape(hand), glove)
    smooth(l)
    cel(l, { shade: 1.8, rim: 1.2 })
  }
  const armF = armGeo(torso.pt(4, -17), p.armF)
  const armN = armGeo(torso.pt(0.5, -16.5), p.armN)
  g.add(p.farFront ? 5.2 : -3.5, armLayer(armF, p.handF, FAR[1], NAVY[3]))

  // ---- tail: a great brush with locks along its edges, a russet top and a white tip
  const tailLayer = (l: Raster) => {
    const n = p.tail.length - 1
    const pts = p.tail.map(([u, v], i) => {
      const s = i / n
      const w = Math.sin(p.sway - s * 2.4) * s * p.swayAmp
      return pelvis.pt(u + w * 0.4, v + w)
    })
    const path = spline(pts)
    const width = (t: number) => p.puff * (6 + 13 * Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04) ** 0.9))
    ribbon(l, path, width, FUR[1])
    // locks: pointed tufts along both edges, swept toward the tip
    const last = path.length - 1
    for (const [t, side] of [
      [0.3, 1],
      [0.48, 1],
      [0.66, 1],
      [0.86, 1],
      [0.4, -1],
      [0.6, -1],
      [0.8, -1]
    ] as const) {
      const i = Math.min(last, along(path, t))
      const a = heading(path, i)
      const f = Frame.at(path[i][0], path[i][1], a)
      const r = width(t) / 2
      fill(
        l,
        f,
        polygon([
          [-4.5, side * (r - 2.5)],
          [3, side * (r - 2)],
          [5 * p.puff, side * (r + 3.4 * p.puff)]
        ]),
        FUR[1]
      )
    }
    // the white tip, its border cut into locks
    const ti = along(path, 0.74)
    const tf = Frame.at(path[ti][0], path[ti][1], heading(path, ti))
    const zig: Pt[] = [[60, -30]]
    for (let v = -30; v <= 30; v += 3) zig.push([Math.abs(v / 3) % 2 === 0 ? 0 : 2.6, v])
    zig.push([60, 30])
    tint(l, tf, polygon(zig), PALE[1])
    smooth(l)
    const base = pelvis.pt(-6, -1)
    mantle(l, FUR[1], RUSSET[1], { depth: 6 * p.puff, tooth: 3, pitch: 5, origin: base })
    cel(l, { shade: 5, deep: 1.8, rim: 1.6, tooth: 3, pitch: 5, origin: base })
    dimEdge(l)
  }
  if (p.puff > 0) g.add(p.tailFront ? 6 : -5, tailLayer)

  // ---- headband tails, streaming from the knot behind the head
  const knot = head.pt(-11, -4)
  const bandDir = p.band[0] - head.angle
  for (const [k, dd, ll] of [
    [1, 10, 0.86],
    [0, 0, 1]
  ] as const)
    g.add(-3 + k * 0.1, (l) => {
      const wave = (s: number) => Math.sin(p.band[3] + k * 1.7 - s * 4) * p.band[2] * s * 2
      const path = bentPath(knot, bandDir + dd, p.band[4], p.band[1] * ll, wave)
      ribbon(l, path, (t) => 3.6 + t * 2.4, k ? BAND[2] : BAND[1])
      const m = path.length - 1
      carve(
        l,
        Frame.at(path[m][0], path[m][1], heading(path, m)),
        polygon([
          [4, -3.4],
          [-2, 0],
          [4, 3.4]
        ])
      )
      cel(l, { shade: 1.4, rim: k ? 0 : 1 })
      if (!k)
        for (let i = Math.round(m * 0.4); i <= Math.round(m * 0.62); i++) {
          const a = heading(path, i) * RAD
          l.paint(path[i][0] - Math.sin(a) * 0.8, path[i][1] + Math.cos(a) * 0.8, BAND[2])
        }
    })

  // ---- body: hips, waist and chest in the navy jacket, the white chest fur in its collar, the red sash, the neck
  const neckEnd = torso.local(...head.pt(-3, 6))
  const bodyShape = union(
    oval(-0.5, -1, 8.2, 6.2),
    capsule([0, -4], [1.5, -12], 6.6, 8.6 + br * 0.3),
    oval(2, -14 - br * 0.4, 9.4 + br * 0.3, 7.6),
    polygon([
      [-9, -2],
      [9, -2],
      [9.5, 6.5],
      [1.5, 4.5],
      [-8.5, 6.5]
    ])
  )
  g.add(0, (l) => {
    fill(l, torso, capsule([2, -17], neckEnd, 5, 4.6), FUR[1])
    fill(l, torso, bodyShape, NAVY[1])
    // the open collar shows the white chest fur and throat
    tint(
      l,
      torso,
      union(
        polygon([
          [3, -21.5],
          [11.5, -19.5],
          [7.5, -10.5]
        ]),
        overlap(capsule([2, -17], neckEnd, 5, 4.6), half([3.5, -17], 1, -0.5))
      ),
      PALE[1]
    )
    // the sash
    tint(
      l,
      torso,
      polygon([
        [-10, -6.5],
        [10, -8],
        [10, -3.5],
        [-10, -2.5]
      ]),
      BAND[1]
    )
    fill(l, torso, capsule([6, -5], [9.5, 3], 1.8, 2.4), BAND[1])
    fill(l, torso, oval(6.5, -5.5, 2.4, 2.2), BAND[1])
    smooth(l)
    cel(l, { shade: 3.6, deep: 1.4, rim: 1.4 })
    dimEdge(l)
    // the lapel line and a fold
    within(
      l,
      (m) => {
        fill(m, torso, capsule([1, -21], [7, -10.5], 0.6, 0.6), NAVY[3])
      },
      true
    )
    shadow(l, head.moved(-1, 2), oval(0, 2, 10, 8))
  })

  // ---- near leg, in front of the jacket's skirt only where it hangs free
  g.add(-0.5, legLayer(legNg, NAVY[2], false))

  // ---- head
  const skull = oval(0, -1, 10.5, 9.5)
  const bridge = capsule([2, -3.5], [12, 0.5], 6, 4.4)
  const muzzle = capsule([6, 1.5], [19.5, 3.6], 5.2, 1.9)
  const ruff = union(
    oval(-3.5, 5, 6, 4.4),
    polygon([
      [-6, 2.5],
      [-13.5, 5.5],
      [-9, 7],
      [-11.5, 10.5],
      [-5, 9.5],
      [-5, 12.5],
      [1, 9]
    ])
  )
  const headShape = union(skull, bridge, muzzle, ruff, oval(4, 5.5, 4.5, 3))
  const headAt = head.pt(0, -1)

  // far ear (behind the skull)
  const earShape = (s: number) =>
    polygon([
      [-5 * s, 1],
      [-1.5 * s, -17 * s],
      [5 * s, 0]
    ])
  const tipShape = polygon([
    [-9, -11],
    [9, -11],
    [0, -24]
  ])
  const earF = head.child(5, -8, -p.earF)
  g.add(3.5, (l) => {
    fill(l, earF, earShape(0.9), FAR[1])
    tint(
      l,
      earF,
      polygon([
        [-1.5, -1],
        [-0.8, -9.5],
        [2.2, -1]
      ]),
      PALE[2]
    )
    tint(l, earF, overlap(tipShape, half([0, -10], 0, -1)), NAVY[3])
    cel(l, { shade: 1.4 })
  })

  // mouth and lower jaw
  const open = p.mouth === 'open' && p.jaw > 0.08
  const jaw = head.child(5, 5, open ? p.jaw * 30 : 0)
  if (open) {
    g.add(
      3.7,
      (l) => {
        fill(l, ID, polygon([head.pt(5, 3.5), head.pt(19, 4.6), jaw.pt(13, 0), jaw.pt(0, -0.5)]), RUSSET[2])
      },
      false
    )
    g.add(3.8, (l) => {
      fill(l, jaw, capsule([0, 0], [12.5, 1.6], 2.8, 1.6), PALE[1])
      cel(l, { shade: 1.2 })
      stampAt(l, jaw, ['w.w', 'W.W'], 10, -1.6, { w: C.white, W: PALE[2] })
    })
  }

  g.add(4, (l) => {
    fill(l, head, headShape, FUR[1])
    tint(l, head, union(ruff, capsule([6, 5.2], [18.5, 4.8], 2.4, 1), oval(4, 6, 4.5, 3), oval(-4, 6, 6, 4)), PALE[1])
    smooth(l)
    mantle(l, FUR[1], RUSSET[1], { depth: 4, tooth: 2, pitch: 4, origin: headAt })
    cel(l, { shade: 3.4, deep: 1.3, rim: 1.6, tooth: 1.5, pitch: 4, origin: headAt })
    dimEdge(l)
  })

  // near ear
  const earN = head.child(-3, -7.5, -p.earN)
  g.add(4.5, (l) => {
    fill(l, earN, earShape(1), FUR[1])
    tint(
      l,
      earN,
      polygon([
        [-2, -1],
        [-1.2, -11],
        [2.6, -1]
      ]),
      PALE[1]
    )
    tint(l, earN, overlap(tipShape, half([0, -11.5], 0, -1)), NAVY[2])
    smooth(l)
    mantle(l, FUR[1], RUSSET[1], { depth: 2 })
    cel(l, { shade: 1.6, rim: 1 })
  })

  // headband: red cloth over the forehead with the steel plate, the knot behind
  g.add(4.8, (l) => {
    const band = polygon([
      [-11.5, -4.6],
      [9.5, -6.8],
      [10.5, -3.4],
      [-11, -0.8]
    ])
    fill(l, head, overlap(band, union(oval(0, -1, 11.2, 10.2), capsule([2, -3.5], [12, 0.5], 6.6, 5))), BAND[1])
    fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 2.8, 2.8), BAND[1])
    cel(l, { shade: 1.6, rim: 1 })
    stampAt(l, head, PLATE, 4, -5, PLATE_KEY)
  })

  // face
  g.add(
    5,
    (l) => {
      stampAt(l, head, EYES[p.eyes], 6, -0.5, EYE_KEY)
      stampAt(l, head, NOSE, 20, 2.2, { K: C.black, h: NAVY[1] })
      const lip = { K: C.inkWarm }
      if (p.mouth === 'smirk') stampAt(l, head, ['K.........', '.KK.......', '...KKKKKKK'], 12.5, 5.6, lip)
      else if (p.mouth === 'flat') stampAt(l, head, ['KKKKKKKKKK'], 13, 5.6, lip)
      else if (p.mouth === 'grin')
        stampAt(l, head, ['K..........', '.KKKKKKKKKK', '..wWwWwWwWK', '..KKKKKKKKK'], 12.5, 5.4, {
          ...lip,
          w: C.white,
          W: PALE[2]
        })
    },
    false
  )

  // ---- near arm, in front of everything but a wrapped tail
  g.add(5.5, armLayer(armN, p.handN, FUR[1], NAVY[2]))

  // ---- fox-fire over the fingertips: a flame of his own orange licking up and back, a pale core, the ink line round it
  if (p.fire > 0)
    g.add(5.6, (l) => {
      const r = p.fire
      const [tx, ty] = armN.hand.pt(8.5, -0.8)
      const f = Frame.at(tx - 0.5, ty - r * 1.05)
      fill(
        l,
        f,
        union(
          oval(0, 0, r, r * 0.95),
          polygon([
            [-r * 0.95, -r * 0.1],
            [r * 0.9, -r * 0.3],
            [-r * 0.5, -r * 2.5]
          ]),
          polygon([
            [r * 0.1, -r * 0.6],
            [r * 0.85, -r * 0.2],
            [r * 0.6, -r * 1.6]
          ])
        ),
        FUR[1]
      )
      tint(l, f, union(oval(0, r * 0.15, r * 0.65, r * 0.6), oval(-r * 0.2, -r * 0.7, r * 0.35, r * 0.7)), FUR[0])
      tint(l, f, oval(0, r * 0.2, r * 0.45, r * 0.42), FIRE[0])
    })

  // ---- the release flash in front of the open palm: a pale burst with short rays toward the hero
  if (p.flash > 0)
    g.add(5.7, (l) => {
      const k = p.flash
      const [px, py] = armN.hand.pt(4, 4.5)
      const f = Frame.at(px + 1.5, py)
      const rays = [-55, -22, 10, 42].map((d, i) =>
        capsule([0, 0], [Math.cos(d * RAD) * k * (i % 2 ? 7 : 9), Math.sin(d * RAD) * k * (i % 2 ? 7 : 9)], 1.7, 0.7)
      )
      fill(l, f, union(oval(0, 0, 3.2 * k, 3.6 * k), ...rays), FUR[0])
      tint(l, f, oval(0.4, 0, 1.8 * k, 2.2 * k), FIRE[0])
    })

  // ---- wind streaks round the turning centre
  if (p.wind > 0) {
    const r = p.windR
    for (let k = 0; k < Math.min(3, Math.ceil(p.wind)); k++) {
      const a1 = p.windAt + k * 120
      const span = 64 * Math.min(1, p.wind - k)
      g.add(k === 1 ? -6 : 7, (l) => {
        streak(l, centre, r + (k === 2 ? 3 : 0), a1 - span, a1, 2.6, k === 1 ? FUR[0] : PALE[1])
      })
    }
  }

  // ---- stars over a knocked-out head, outlined
  if (p.stars >= 0)
    g.add(8, (l) => {
      const [cx, cy] = head.pt(0, 0)
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 13) - 2,
          Math.round(cy - 16 + Math.sin(a) * 3.5) - 2,
          { y: GOLD[1], Y: C.white }
        )
      }
    })

  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const P = foxPose
const phase = (i: number, n: number) => (i / n) * TAU
const draw = (poses: FoxPose[]) => poses.map(drawFox)

/** Points on a circle round `c` (pelvis units): the tail wrapped round the wheel. */
const arc = (c: Pt, r0: number, r1: number, degs: readonly number[]): Pt[] =>
  degs.map((d, i) => {
    const r = r0 + ((r1 - r0) * i) / Math.max(1, degs.length - 1)
    return [c[0] + Math.cos(d * RAD) * r, c[1] + Math.sin(d * RAD) * r]
  })

/** The tail curled round the front of his legs (crouch, windup). */
const TAIL_WRAP: readonly Pt[] = [
  [-6, -1],
  [-17, 2],
  [-10, 6],
  [6, 5],
  [16, -1]
]
/** The tail fanned high behind the intro pose. */
const TAIL_FAN: readonly Pt[] = [
  [-6, -2],
  [-21, 3],
  [-34, -6],
  [-36, -25],
  [-24, -40]
]

/** idle: a ready stance on the balls of his feet, a light bounce, a ninja sign at the chest, the tail in a slow S. */
const idle = memo(() => {
  const N = 6
  const bob = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(phase(i, N)))
  const headLag = lag(bob, { stiffness: 0.4, damping: 0.5, loop: true })
  return Array.from({ length: N }, (_, i) =>
    P({
      y: Math.round(bob[i] * 1.6),
      breath: bob[i],
      head: [0, -Math.round(bob[i] * 1.6) + headLag[i] * 1.2],
      armN: [12, 6 - bob[i], -10, 1],
      earF: i === 3 ? 24 : i === 4 ? 8 : 0,
      eyes: i === 4 ? 'happy' : 'sly',
      mouth: i >= 3 && i <= 4 ? 'grin' : 'smirk',
      sway: phase(i, N),
      band: [6 + Math.sin(phase(i, N) + 1) * 5, 30, 1.5, phase(i, N), 34]
    })
  )
})

/** The finished intro pose: arm thrust out with two fingers raised, the other hand on the hip, tail fanned, a grin. */
const POSE: Partial<FoxPose> = {
  y: 0,
  lean: -3,
  head: [1, -1],
  nod: -4,
  eyes: 'sly',
  mouth: 'grin',
  armN: [26, 1, -80, 1],
  handN: 'two',
  armF: [-7, 15, 30, 1],
  handF: 'fist',
  legN: [5, 0, 0],
  legF: [-4, 0, 0],
  tail: TAIL_FAN,
  puff: 1.15,
  band: [0, 32, 1.6, 0, 26]
}

/** intro: a low crouch wrapped in his tail, a spin up onto one foot (one smear frame), then the pose, held alive. */
const intro = memo(() => [
  P({
    y: -8,
    lean: 22,
    head: [1, 3],
    nod: 14,
    eyes: 'shut',
    mouth: 'flat',
    earN: 20,
    earF: 20,
    armN: [9, 9, -20, 1],
    handN: 'fist',
    armF: [11, 7, 0, 1],
    farFront: true,
    legN: [2, 0, 0],
    legF: [-1, 0, 0],
    tail: TAIL_WRAP,
    tailFront: true,
    swayAmp: 0,
    band: [30, 26, 0.6, 0, 50]
  }),
  // the smear: stretched tall, spinning, the tail swept round him in an arc
  P({
    y: 4,
    lean: -2,
    squash: -3,
    head: [0, -1],
    nod: -6,
    eyes: 'shut',
    mouth: 'flat',
    earN: 35,
    earF: 35,
    armN: [4, 10, 0, 1],
    handN: 'fist',
    armF: [-4, 12, 0, 1],
    legN: [1, 4, 30],
    legF: [-3, 0, 0],
    tail: [
      [-6, -1],
      [-18, 2],
      [-26, -10],
      [-24, -26],
      [-12, -38]
    ],
    puff: 0.85,
    swayAmp: 0,
    band: [-40, 30, 1, 1, 60],
    wind: 2.6,
    windAt: 40,
    windR: 30,
    pivot: 38
  }),
  // up on one foot, the near knee high, arms opening
  P({
    y: 4,
    lean: -6,
    head: [0, -2],
    nod: -8,
    eyes: 'wide',
    mouth: 'smirk',
    earN: 10,
    earF: 10,
    armN: [14, -10, -40, 1],
    handN: 'two',
    armF: [-12, 4, 0, 1],
    handF: 'open',
    legN: [7, 13, -20],
    legF: [-2, 0, 0],
    tail: [
      [-6, -1],
      [-20, 0],
      [-30, -12],
      [-28, -30],
      [-16, -42]
    ],
    puff: 1,
    swayAmp: 0,
    band: [10, 32, 1.4, 2, 16]
  }),
  // the pose lands: a dip, then up into the hold
  P({ ...POSE, y: -2, squash: 1.5, puff: 1.25, band: [8, 32, 1.8, 3, 24] }),
  P({ ...POSE, y: 0.6, squash: -0.5, puff: 1.2, band: [2, 32, 1.6, 4, 26], sway: 1 }),
  P({ ...POSE, band: [0, 32, 1.5, 5, 28], sway: 1.8 }),
  P({ ...POSE, earF: 18, band: [-2, 32, 1.4, 6, 28], sway: 2.6 }),
  P({ ...POSE, y: 1, head: [1, -2], band: [3, 32, 1.4, 7.2, 26], sway: 3.6, eyes: 'happy' })
])

/** hurt: knocked off balance with the tail puffed to twice its size, recoil, a glare. */
const hurt = memo(() => [
  P({
    x: -3,
    y: 1,
    lean: -18,
    head: [-2, -2],
    nod: -16,
    eyes: 'hurt',
    mouth: 'open',
    jaw: 0.7,
    earN: 45,
    earF: 45,
    armN: [6, -16, 0, -1],
    handN: 'open',
    armF: [-12, -8, 0, 1],
    handF: 'open',
    legN: [3, 3, 20],
    tail: [
      [-6, -1],
      [-20, 3],
      [-32, -6],
      [-33, -24],
      [-22, -38]
    ],
    puff: 1.7,
    swayAmp: 0,
    band: [-24, 30, 2, 1, 30]
  }),
  P({
    x: -5,
    y: -3,
    lean: 10,
    head: [0, 2],
    nod: 12,
    eyes: 'shut',
    mouth: 'flat',
    earN: 35,
    earF: 35,
    armN: [8, 10, 0, 1],
    handN: 'fist',
    armF: [-6, 14, 30, 1],
    legN: [-1, 0, 0],
    legF: [-4, 0, 0],
    puff: 1.45,
    swayAmp: 1,
    sway: 1,
    band: [24, 30, 1.6, 2.5, 20]
  }),
  P({
    x: -3,
    y: -1,
    lean: 6,
    head: [1, 1],
    nod: 6,
    eyes: 'angry',
    mouth: 'grin',
    earN: 15,
    earF: 12,
    armN: [12, 6, -10, 1],
    handN: 'two',
    puff: 1.15,
    sway: 2,
    band: [12, 30, 1.4, 4, 30]
  })
])

/** move: the ninja run, leaning far forward with the arms trailing straight back, tail and headband streaming level. */
const move = memo(() => {
  const N = 8
  const foot = (t: number): Leg => {
    const f = ((t % 1) + 1) % 1
    if (f < 0.45) return [11 - 22 * (f / 0.45), 0, 0]
    const s = (f - 0.45) / 0.55
    return [-11 + 22 * ease.inOut(s), Math.sin(Math.PI * s) * 10, Math.sin(Math.PI * s) * 30]
  }
  const bob = Array.from({ length: N }, (_, i) => -Math.cos(((i - 1) / 4) * TAU))
  const headLag = lag(bob, { stiffness: 0.45, damping: 0.55, loop: true })
  return Array.from({ length: N }, (_, i) => {
    const n = foot(i / N)
    const f = foot(i / N + 0.5)
    return P({
      x: 4,
      y: -3 + bob[i] * 1.5,
      lean: 42,
      head: [2, 3 + headLag[i]],
      nod: -4,
      eyes: 'angry',
      mouth: 'grin',
      earN: 30,
      earF: 30,
      armN: [-17, 7 + bob[i] * 0.5, 10, 1],
      handN: 'open',
      armF: [-16, 4 + bob[i] * 0.5, 10, 1],
      handF: 'open',
      legN: [n[0] - 4, n[1], n[2]],
      legF: [f[0] + 7, f[1], f[2]],
      tail: [
        [-6, -1],
        [-17, -3],
        [-28, -5],
        [-38, -5],
        [-47, -8]
      ],
      sway: phase(i, N) * 2,
      swayAmp: 2,
      band: [-6, 32, 2, phase(i, N) * 2, 6]
    })
  })
})

/** windup: he crouches, crosses his arms before his face, the tail whips round him, the first wind; trembles. */
const windup = memo(() => {
  const set: Partial<FoxPose> = {
    y: -6,
    lean: 16,
    head: [1, 3],
    nod: 8,
    eyes: 'angry',
    mouth: 'grin',
    earN: 40,
    earF: 40,
    armN: [13, -9, -20, 1],
    handN: 'fist',
    armF: [15, -7, -20, 1],
    handF: 'fist',
    farFront: true,
    legN: [3, 0, 0],
    legF: [-2, 0, 0],
    tail: TAIL_WRAP,
    tailFront: true,
    swayAmp: 0,
    windR: 26,
    pivot: 30
  }
  return [
    P({
      y: -4,
      lean: 10,
      head: [1, 1],
      nod: 4,
      eyes: 'angry',
      mouth: 'smirk',
      earN: 25,
      earF: 25,
      armN: [12, -2, -30, 1],
      handN: 'fist',
      armF: [13, 0, -30, 1],
      farFront: true,
      tail: [
        [-6, -1],
        [-20, 1],
        [-27, 7],
        [-12, 9],
        [2, 5]
      ],
      swayAmp: 0,
      band: [10, 30, 1.4, 0, 30]
    }),
    P({ ...set, wind: 1.5, windAt: 200, band: [-10, 30, 1.8, 1, 30] }),
    P({ ...set, x: 1, wind: 2.4, windAt: 214, band: [-14, 30, 2, 2.4, 34] }),
    P({ ...set, x: -1, y: -5, wind: 2.6, windAt: 232, band: [-12, 30, 2, 3.8, 30] })
  ]
})

/**
 * attack: the whirlwind — the tucked rig turned a sixth of a circle further each frame, the tail wrapped round the
 * outside, the headband tails tracing a second arc, three wind streaks turning with him.
 */
const attack = memo(() => {
  const N = 6
  const c: Pt = [1, -11]
  return Array.from({ length: N }, (_, i) =>
    P({
      spin: i * 60,
      pivot: 34,
      y: -5,
      lean: 30,
      head: [2, 5],
      nod: 12,
      eyes: 'angry',
      mouth: 'grin',
      earN: 60,
      earF: 60,
      armN: [11, 13, 0, 1],
      handN: 'fist',
      armF: [13, 11, 0, 1],
      farFront: true,
      legN: [4, 15, -50],
      legF: [0, 13, -50],
      tail: arc(c, 22, 24, [178, 138, 98, 58, 18]),
      tailFront: true,
      puff: 0.85,
      swayAmp: 0,
      band: [-10, 36, 0.5, phase(i, N), 110],
      wind: 3,
      windAt: 30,
      windR: 35
    })
  )
})

/** recover: dizzy from his own spin, staggering on the spot with one hand on his head, the tail limp. */
const recover = memo(() =>
  [0, 1, 2, 3].map((i) => {
    const s = Math.sin(phase(i, 4))
    const c = Math.cos(phase(i, 4))
    return P({
      x: Math.round(s * 1.5),
      y: -2 - Math.abs(c) * 0.6,
      lean: 2 + s * 7,
      head: [c * 1.5, 2 + s],
      nod: 12 + s * 8,
      eyes: 'dizzy',
      mouth: 'open',
      jaw: 0.25 + 0.1 * c,
      earN: 30 + s * 10,
      earF: 20 - s * 10,
      armN: [6, -21, -30, -1],
      handN: 'open',
      armF: [-3, 17, 20, 1],
      handF: 'open',
      legN: [1 + s, 0, 0],
      legF: [-1 + s, 0, 0],
      tail: [
        [-6, 0],
        [-15, 7],
        [-26, 10],
        [-37, 10],
        [-46, 9]
      ],
      puff: 0.8,
      sway: phase(i, 4),
      swayAmp: 1.2,
      band: [40 + s * 6, 28, 0.6, phase(i, 4), 30]
    })
  })
)

/** defeat: hit, one more spin out of control, a trip over his own tail, flat on his back, a bounce, out cold. */
const defeat = memo(() => {
  const lying: Partial<FoxPose> = {
    spin: -90,
    pivot: 10,
    x: 10,
    y: 0,
    lean: 0,
    head: [1, -3],
    nod: 26,
    eyes: 'dizzy',
    mouth: 'open',
    jaw: 0.3,
    earN: 40,
    earF: 30,
    armN: [-6, 8, 0, 1],
    handN: 'open',
    armF: [13, 7, 0, -1],
    handF: 'open',
    legN: [15, 13, -60],
    legF: [6, 19, -30],
    tail: [
      [-5, -1],
      [-4, 9],
      [-3, 20],
      [-3, 31],
      [-6, 42]
    ],
    puff: 0.75,
    swayAmp: 0,
    band: [150, 22, 0.6, 0, -10]
  }
  return [
    P({
      x: -2,
      y: 2,
      lean: -16,
      head: [-2, -2],
      nod: -14,
      eyes: 'hurt',
      mouth: 'open',
      jaw: 0.8,
      earN: 50,
      earF: 50,
      armN: [6, -16, 0, -1],
      handN: 'open',
      armF: [-12, -8, 0, 1],
      handF: 'open',
      puff: 1.5,
      swayAmp: 0,
      band: [-24, 30, 2, 0, 30]
    }),
    P({
      spin: -50,
      pivot: 40,
      x: -3,
      y: 2,
      lean: -10,
      eyes: 'dizzy',
      mouth: 'open',
      jaw: 0.5,
      earN: 40,
      earF: 40,
      armN: [-8, -14, 0, 1],
      handN: 'open',
      armF: [10, -12, 0, -1],
      handF: 'open',
      legN: [8, 8, -40],
      legF: [-6, 4, 20],
      tail: [
        [-6, -1],
        [-12, 10],
        [-4, 22],
        [10, 26],
        [22, 22]
      ],
      puff: 1.1,
      swayAmp: 0,
      band: [-30, 30, 1.6, 1, 60],
      wind: 1.6,
      windAt: 150,
      windR: 32
    }),
    P({
      ...lying,
      spin: -75,
      pivot: 22,
      x: 6,
      rise: 6,
      eyes: 'wide',
      mouth: 'open',
      jaw: 0.7,
      armN: [4, -16, 0, 1],
      armF: [12, -10, 0, 1],
      legN: [16, 10, -70],
      legF: [12, 14, -50],
      band: [-80, 22, 1.4, 2, 30]
    }),
    P({ ...lying, squash: 2, eyes: 'shut', band: [120, 24, 1.2, 3, -20] }),
    P({ ...lying, x: 13, rise: 4, squash: -1, eyes: 'shut', legN: [14, 12, -70], band: [100, 20, 1, 4, -20] }),
    P({ ...lying, squash: 1, band: [140, 22, 0.8, 5, -14] }),
    P({ ...lying, stars: 0, band: [148, 22, 0.6, 6, -10] }),
    P({ ...lying, stars: 1 / 6, legN: [14, 14.6, -62], band: [152, 22, 0.6, 7, -8] })
  ]
})

/**
 * shoot: the ninja's cast — the hand sign before his face, fox-fire gathering at the fingertips while he coils back,
 * the thrust onto the front foot with the palm open (the game spawns the orb on `hit`), the arm swinging down, back
 * to the stance. `x` moves the whole figure; the leg offsets cancel it so the feet stay planted unless he steps.
 */
const shoot = memo(() => [
  // 0 — the sign: weight down, two fingers raised before the face, the tail curled up, eyes narrowed, the band hanging
  P({
    x: -1,
    y: -3,
    lean: 8,
    squash: 1,
    head: [0, 1],
    nod: 5,
    eyes: 'angry',
    mouth: 'flat',
    earN: 10,
    earF: 6,
    armN: [25, -4, -80, 1],
    handN: 'two',
    armF: [-5, 14, 30, 1],
    legN: [1, 0, 0],
    legF: [1, 0, 0],
    tail: [
      [-6, -1],
      [-18, 3],
      [-31, -3],
      [-33, -23],
      [-19, -35]
    ],
    sway: 0.5,
    swayAmp: 1,
    band: [38, 26, 0.6, 0, 30]
  }),
  // 1 — the flame catches; he coils back, the tail fluffs
  P({
    x: -3,
    y: -4,
    lean: -2,
    squash: 1,
    head: [-1, 1],
    nod: 1,
    eyes: 'angry',
    mouth: 'smirk',
    earN: 18,
    earF: 14,
    armN: [25, -5, -86, 1],
    handN: 'two',
    armF: [-8, 12, 30, 1],
    legN: [3, 0, 0],
    legF: [2, 0, 0],
    tail: [
      [-6, -1],
      [-20, 4],
      [-34, -3],
      [-38, -22],
      [-27, -37]
    ],
    puff: 1.15,
    sway: 1,
    swayAmp: 1.5,
    band: [28, 28, 1, 1, 30],
    fire: 3.2
  }),
  // 2 — the flame grows; coiled furthest back, grinning
  P({
    x: -4,
    y: -4,
    lean: -7,
    squash: 0.5,
    head: [-2, 0],
    nod: -2,
    eyes: 'angry',
    mouth: 'grin',
    earN: 22,
    earF: 18,
    armN: [24.5, -5, -90, 1],
    handN: 'two',
    armF: [-10, 10, 30, 1],
    legN: [4, 0, 0],
    legF: [3, 0, 0],
    tail: [
      [-6, -1],
      [-21, 4],
      [-35, -4],
      [-39, -24],
      [-28, -40]
    ],
    puff: 1.3,
    sway: 1.6,
    swayAmp: 1.5,
    band: [22, 28, 1.2, 2, 28],
    fire: 4.6
  }),
  // 3 (hit) — the thrust: arm at full stretch, palm open, a lunge onto the front foot, band and tail snapped straight
  P({
    x: 4,
    y: -4,
    lean: 20,
    squash: -1,
    head: [2, 2],
    nod: -2,
    eyes: 'angry',
    mouth: 'open',
    jaw: 0.45,
    earN: 28,
    earF: 28,
    armN: [30, 1, -82, 1],
    handN: 'open',
    armF: [-15, 5, 0, 1],
    handF: 'fist',
    legN: [4, 0, 0],
    legF: [-5, 0, 0],
    tail: [
      [-6, -1],
      [-18, -3],
      [-30, -5],
      [-41, -6],
      [-51, -10]
    ],
    puff: 1.1,
    swayAmp: 0,
    band: [-8, 34, 0.3, 3, 4],
    flash: 1.3
  }),
  // 4 — follow-through: the arm swings down, the tail swishes through under him
  P({
    x: 3,
    y: -3,
    lean: 13,
    head: [1, 2],
    nod: 3,
    eyes: 'sly',
    mouth: 'grin',
    earN: 16,
    earF: 14,
    armN: [17, 13, -20, 1],
    handN: 'open',
    armF: [-9, 12, 20, 1],
    legN: [5, 0, 0],
    legF: [-4, 0, 0],
    tail: [
      [-6, -1],
      [-19, 6],
      [-32, 4],
      [-39, -11],
      [-32, -28]
    ],
    puff: 1.05,
    sway: 2.4,
    swayAmp: 2,
    band: [8, 32, 1.8, 4, 22]
  }),
  // 5 — straightening back into the stance, the hand returning to the sign at the chest
  P({
    x: 1,
    y: -1,
    lean: 6,
    head: [0, 1],
    nod: 1,
    eyes: 'sly',
    mouth: 'smirk',
    earN: 6,
    earF: 4,
    armN: [13, 8, -12, 1],
    handN: 'two',
    armF: [-7, 15, 30, 1],
    legN: [2, 0, 0],
    legF: [-1, 0, 0],
    sway: 3.4,
    band: [10, 30, 1.6, 5, 32]
  })
])

/** The poses of the idle and move clips (for the tests). */
export const idlePoses = () => idle()
export const movePoses = () => move()

export const sheets: SheetModule = {
  foxBoss: () => ({
    idle: lazyAnim(() => draw(idle()), 8, true),
    intro: lazyAnim(() => draw(intro()), 10, false, { sustain: 2 }),
    hurt: lazyAnim(() => draw(hurt()), 12, false),
    defeat: lazyAnim(() => draw(defeat()), 10, false, { sustain: 2 }),
    move: lazyAnim(() => draw(move()), 12, true),
    windup: lazyAnim(() => draw(windup()), 12, false, { sustain: 2 }),
    attack: lazyAnim(() => draw(attack()), 16, true),
    recover: lazyAnim(() => draw(recover()), 8, true),
    shoot: lazyAnim(() => draw(shoot()), 12, false)
  })
}
