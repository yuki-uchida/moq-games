/**
 * いたち丞相 (`weaselBoss`): the gang's scheming chancellor, a long, sly weasel built on the rig toolkit. He stands
 * upright like a courtier — a sinuous S of a body on short legs, a long neck, a wedge of a head drawn larger than
 * nature with a pale mask around narrow slanted eyes, a raised brow, long whiskers and a thin smile with one fang —
 * in a black scholar's cap with a gold button and the gang's red band, whose two long tails hang down his back, a
 * short black court vest with a gold clasp, and the white feather fan in his near paw. A bushy tail as long as his
 * body with a dark tip curls like a question mark. To charge he drops to all fours and bounds, low and long.
 * 128×128, facing right, feet on (64, 120).
 *
 * Rendering (CHARACTERS.md "Big furry bodies"): the spine is a chain of three frames (hip → waist → chest) and a
 * neck, so the same body stands, bows, coils and gallops; haunch, belly, chest, neck and the near thigh are ONE
 * silhouette shaded once, with a dark saddle (`mantle`) along the whole S of the back, a cream throat and belly,
 * and fur teeth on the shadow. Only what hangs free (shanks, feet, arms, paws) is a part of its own.
 *
 * Depth (back to front): far hind leg, far arm, tail, body, near hind leg, vest, tucked fan, cap tails, far ear,
 * mouth, lower jaw, head, face, whiskers, near ear, cap, fan in the paw, near arm, loose cap and fan, stars.
 */
import type { SheetModule } from '../../module'
import { TAU, lag } from '../../motion'
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

const FUR = R.weaselTan
const FAR = farRamp(FUR)
/** The dark saddle along the spine and the top of the tail, the paws and the tail tip (shares the coat's darks). */
const SADDLE = ramp('#96703f', '#76532f', '#5e4428', '#3e2a1e', '#3a1a22')
const SADDLE_FAR = farRamp(SADDLE)
/** The cream throat, belly, mask and muzzle, and the white feather fan. */
const CREAM = ramp('#ffffff', '#fbf1dc', '#e8cc9c', '#b8925e', '#3a1a22')
/** The black of the scholar's cap and the court vest. */
const BLACK = R.darkFur
const BLACK_FAR = farRamp(BLACK)
const BAND = R.bandana
const GOLD = R.gold
/** The head is drawn larger than nature. */
const HS = 1.3
const RAD = Math.PI / 180

type Eyes = 'sly' | 'glance' | 'narrow' | 'smug' | 'wide' | 'angry' | 'shut' | 'hurt' | 'dizzy' | 'tired'
type Mouth = 'smirk' | 'grin' | 'open' | 'grit'
/** Where the fan is: in the near paw, tucked into the collar, loose in the air or on the ground, or gone. */
type FanAt = 'hand' | 'collar' | 'free' | 'none'
/** A limb target: x, y and a mode (0 = an offset from the shoulder or hip, 1 = a place on the ground). */
type Reach = readonly [number, number, number]
type Foot = readonly [number, number, number]

export interface WeaselPose {
  /** Whole figure forward (+) / up (+). */
  x: number
  y: number
  /** The hip's centre from the anchor: forward (+), height above the ground. */
  hip: readonly [number, number]
  /** The spine: 0 = upright, 90 = on all fours (degrees, forward +), then the bend at hip, waist, chest, neck. */
  pitch: number
  bend: readonly [number, number, number, number]
  /** Stretch of the spine (+ longer). */
  stretch: number
  /** Chest breathing 0..1. */
  breath: number
  /** Head offset from its seat on the neck and turn in degrees (nose down +). */
  head: readonly [number, number]
  nod: number
  /** Lower jaw opening 0..1. */
  jaw: number
  mouth: Mouth
  tongue: boolean
  eyes: Eyes
  /** Ears laid back, in degrees. */
  ear: number
  /** Near and far hands (mode 0: from the shoulder; mode 1: on the ground from the anchor, y up). */
  armN: Reach
  armF: Reach
  /** Hind feet relative to their rest under the hip: forward, lift, turn in degrees (+ toes down). */
  legN: Foot
  legF: Foot
  /** Tail: direction (0 = straight back, + down), curl along its length, sway phase, length. */
  tail: readonly [number, number, number, number]
  /** The cap's two ribbon tails: direction (0 = back, + down), curl, ripple phase, length. */
  tails: readonly [number, number, number, number]
  /** The cap on the head: offset in head units and tilt (+ forward). */
  cap: readonly [number, number, number]
  /** The cap off the head: x, y from the anchor (y up) and turn in degrees; null = on the head. */
  capFree: readonly [number, number, number] | null
  /** The fan: where it is, direction of its axis (0 = up, + forward), how far open 0..1. */
  fan: FanAt
  fanDir: number
  fanOpen: number
  /** A loose fan's pivot: x, y from the anchor (y up). */
  fanFree: readonly [number, number]
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
}

export const weaselPose = (p: Partial<WeaselPose> = {}): WeaselPose => ({
  x: 0,
  y: 0,
  hip: [-3, 21],
  pitch: 0,
  bend: [6, -12, 6, 22],
  stretch: 0,
  breath: 0,
  head: [0, 0],
  nod: 0,
  jaw: 0,
  mouth: 'smirk',
  tongue: false,
  eyes: 'sly',
  ear: 0,
  armN: [11, 1, 0],
  armF: [5, 6, 0],
  legN: [0, 0, 0],
  legF: [0, 0, 0],
  tail: [-12, -150, 0, 50],
  tails: [45, 40, 0, 28],
  cap: [0, 0, 0],
  capFree: null,
  fan: 'hand',
  fanDir: 35,
  fanOpen: 1,
  fanFree: [0, 0],
  stars: -1,
  ...p
})

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = { K: C.black, w: C.white, y: GOLD[1], B: SADDLE[3], i: C.inkWarm }
/** The near eye, narrow and slanted (the back corner higher), under a brow that rises at the back. */
const EYES: Record<Eyes, readonly string[]> = {
  sly: ['BB.......', '..BBB....', '.....BB..', '.........', 'KKKKKK...', '.KwyKyKKK', '..KKKKK..'],
  glance: ['BB.......', '..BBB....', '.....BB..', '.........', 'KKKKKK...', '.KKwyyKKK', '..KKKKK..'],
  narrow: ['.........', 'BBBB.....', '...BBBBB.', '.........', 'KKKKKKK..', '.KKwyKKKK', '.........'],
  smug: ['BB.......', '..BBB....', '.....BB..', '.........', '.........', 'iiiiiii..', '......iii'],
  wide: ['.BBB.....', 'B...BB...', '.........', '.KKKKK...', 'KwwyyKK..', 'KwyyKyyK.', '.KKKKKK..'],
  angry: ['BB.......', '..BBB....', '.....BBBB', '.KKKKKKK.', 'KwwyyKyK.', '.KwyyyKK.', '..KKKK...'],
  shut: ['BB.......', '..BBB....', '.....BB..', '.........', '.........', 'iiiiiiii.', '.........'],
  hurt: ['.B....B..', '..B..B...', '.........', 'ii....ii.', '..ii.ii..', '...iii...', '..ii.ii..'],
  dizzy: ['.........', '..iiiii..', '.i.....i.', '.i.iii.i.', '.i.i.i.i.', '.i...i.i.', '..iii..i.'],
  tired: ['.........', '.........', 'BBBBBBB..', '.........', 'iiiiiiii.', '.KwyyKK..', '..KKKK...']
}
const NOSE = ['.KK.', 'KhKK', 'KKK.']
/** The thin smile: the back corner turned up, one fang hanging over the lip. */
const SMIRK = ['KK.......', '..KKKKKKK']
const GRIT = ['KKKKKKKK', 'KwKwKwKK', 'KKKKKKKK']
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']
/** Fur locks that break a silhouette. */
const TUFT_BACK = ['...ff', '..fff', '.ffff', 'ffff.', 'fff..']
const TUFT_DOWN = ['fffff', 'fffff', '.fff.', '.ff..', '..f..']
const TUFT_UP = ['..f..', '.ff..', '.fff.', 'fffff']
/** Whiskers fanning forward from the muzzle. */
const WHISKERS = ['.............ww', '..........www..', '.......www.....', '...........www.', '........www....']
/** The gold clasp on the vest. */
const CLASP = ['.yy.', 'yYYy', '.yy.']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)

/** A foot or paw on its own frame (origin under the pads): toes forward, flat where it stands. */
const footShape = (grounded: boolean, len: number): Shape => {
  const s = union(oval(2 + len * 0.5, -2, 3.4 + len, 2.1), oval(-1, -2.5, 2.6, 2.5))
  return grounded ? overlap(s, half([0, -0.4], 0, -1)) : s
}

/** A path from `from` heading in direction `deg` (0 = back, + down), bending by `curl` degrees along its length. */
function bentPath(from: Pt, deg: number, curl: number, len: number, wobble: (s: number) => number, hook = 1): Pt[] {
  const pts: Pt[] = [from]
  let [x, y] = from
  const n = 6
  for (let i = 1; i <= n; i++) {
    const s = i / n
    const a = ((deg + curl * s ** hook) * Math.PI) / 180
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

/**
 * White on the very edge of a part takes the cream base instead: the lit outline next to it is two ramp steps
 * darker, and two steps below white is still light. Same as the wolf's; candidate for the toolkit (`cel` option).
 */
function dimEdge(l: Raster) {
  const b = l.bounds()
  if (!b) return
  const src = l.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (
        src.get(x, y) === CREAM[0] &&
        !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1))
      )
        l.set(x, y, CREAM[1])
}

/** The feather fan on its frame (pivot at the origin, axis along −v), `open` 0 (shut) .. 1 (spread). */
function drawFan(l: Raster, f: Frame, open: number) {
  const spread = (10 + 100 * open) * RAD
  const len = 13.5
  const n = 11
  // one lobe per feather, widening from the grip to a round tip: the rim is scalloped between them
  const step = spread / (n - 1)
  const tipR = Math.max(1.8, len * Math.sin(step / 2) + 0.7)
  const tips: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = -spread / 2 + step * i
    tips.push([Math.sin(a) * (len - tipR), -Math.cos(a) * (len - tipR)])
  }
  fill(l, f, union(...tips.map((t) => capsule([0, -1.5], t, 1.6, tipR)), oval(0, -1.5, 2.6, 2.4)), CREAM[1])
  smooth(l)
  cel(l, { shade: 2.4, rim: 1.4 })
  // the lit outer half of the spread feathers is white
  within(
    l,
    (m) => fill(m, f, overlap(oval(-1.5, -1.5, len - 2.5), minus(oval(0, 0, 100), oval(0, 0, len * 0.42))), CREAM[0]),
    true
  )
  dimEdge(l)
  // the quills down the middle of every other feather
  if (open > 0.3)
    within(
      l,
      (m) => {
        for (let i = 1; i < n; i += 3) {
          const [a, b] = [f.pt(tips[i][0] * 0.25, tips[i][1] * 0.25), f.pt(tips[i][0] * 0.95, tips[i][1] * 0.95)]
          m.line(a[0], a[1], b[0], b[1], CREAM[2])
        }
      },
      true
    )
  // the grip, a dark stub below the feathers
  fill(l, f, capsule([0, 1], [0, 5.5], 1.5, 1.3), SADDLE[2])
}

// ------------------------------------------------------------------------------------------------ drawing

export function drawWeasel(p: WeaselPose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const k = 1 + p.stretch * 0.1
  const br = p.breath
  const ground = Frame.at(64 + p.x, 120)
  const root = ground.child(0, -p.y)
  const hip = root.child(p.hip[0], -p.hip[1], p.pitch + p.bend[0])
  const waist = hip.child(0, -12 * k, p.bend[1])
  const chest = waist.child(0, -12 * k, p.bend[2])
  const neck = chest.child(1, -7 * k, p.bend[3])
  const seat = neck.pt(0, -10)
  const head = Frame.at(seat[0] + 4 + p.head[0], seat[1] - 5 + p.head[1], p.nod, HS)

  // ---- the body silhouette (screen space through the spine frames)
  const bodyShape = (): { f: Frame; s: Shape }[] => [
    { f: hip, s: union(oval(0, 0, 11, 10.5), oval(3, 4, 7.5, 8.5)) },
    { f: ID, s: capsule(hip.pt(0, 0), waist.pt(0, 0), 10, 8.5) },
    { f: waist, s: oval(2, -3, 8.6, 9.5) },
    { f: ID, s: capsule(waist.pt(0, 0), chest.pt(0, -2), 8.5, 9.2 + br * 0.5) },
    { f: chest, s: oval(0, -2, 9.2 + br * 0.5, 9.5) },
    { f: ID, s: capsule(chest.pt(0, -3), neck.pt(0, 0), 8.4, 6.6) },
    { f: ID, s: capsule(neck.pt(0, 0), seat, 6.6, 6) }
  ]

  // ---- hind legs: thigh in the body, shank and the long foot hang free
  const legGeo = (foot: Foot, near: boolean) => {
    const rx = hip.pt(0, 0)[0] - ground.pt(0, 0)[0] + (near ? 6 : -3)
    const f = ground.child(rx + foot[0], -foot[1], foot[2])
    const grounded = foot[1] < 0.6 && Math.abs(foot[2]) < 10
    const s = hip.pt(near ? 3 : 0, near ? 5 : 4)
    const end = f.pt(-2, -4.5)
    return { f, grounded, s, end, mid: joint(s, end, 8, 7.5, -1).mid }
  }
  type Leg = ReturnType<typeof legGeo>
  /** The toes: two dark splits at the front of the foot. */
  const toes = (l: Raster, leg: Leg, paw: Ramp) =>
    within(l, (m) => stampAt(m, leg.f, ['k.k', 'k.k'], 4.6, -1.6, { k: paw[3] }), true)
  const legN = legGeo(p.legN, true)
  const legF = legGeo(p.legF, false)
  const hindLower = (l: Raster, leg: Leg, tone: Ramp, paw: Ramp) => {
    fill(l, ID, capsule(leg.mid, leg.end, 3.8, 2.8), tone[1])
    fill(l, leg.f, footShape(leg.grounded, 1.2), paw[1])
    fill(l, ID, capsule(leg.end, leg.f.pt(-0.5, -2.5), 3, 2.6), paw[1])
  }

  // ---- arms (front legs on all fours)
  const armGeo = (reach: Reach, near: boolean) => {
    const s = chest.pt(near ? 3 : 0, near ? -2 : -3.5)
    // on the ground the target is the wrist, just above the paw
    const t: Pt = reach[2] > 0.5 ? ground.pt(reach[0], -reach[1] - 3) : [s[0] + reach[0], s[1] + reach[1]]
    const { mid, end } = joint(s, t, 9, 8.5, 1)
    const a = (Math.atan2(end[1] - mid[1], end[0] - mid[0]) * 180) / Math.PI
    return { s, mid, end, hand: Frame.at(end[0], end[1], a), onGround: reach[2] > 0.5 && reach[1] < 2.5 }
  }
  type Arm = ReturnType<typeof armGeo>
  const aN = armGeo(p.armN, true)
  const aF = armGeo(p.armF, false)
  const drawArm = (l: Raster, arm: Arm, tone: Ramp, paw: Ramp, sleeve: Ramp) => {
    fill(l, ID, capsule(arm.s, arm.mid, 3.6, 3.2), tone[1])
    fill(l, ID, capsule(arm.mid, arm.end, 3.2, 2.5), tone[1])
    // the jacket's short sleeve, widening to its cuff above the elbow
    const cuff: Pt = [arm.s[0] + (arm.mid[0] - arm.s[0]) * 0.7, arm.s[1] + (arm.mid[1] - arm.s[1]) * 0.7]
    fill(l, ID, capsule(arm.s, cuff, 4.2, 4.4), sleeve[1])
    if (arm.onGround) {
      const f = Frame.at(arm.end[0] + 1, ground.pt(0, 0)[1], 0)
      fill(l, f, footShape(true, 0.6), paw[1])
    } else fill(l, arm.hand, union(oval(1.2, 0, 3.2, 2.8), oval(3.4, -0.4, 1.8, 2)), paw[1])
  }

  // ---- far hind leg and far arm, a ramp step darker, behind everything
  g.add(-5, (l) => {
    fill(l, ID, capsule(legF.s, legF.mid, 6.5, 4.6), FAR[1])
    hindLower(l, legF, FAR, SADDLE_FAR)
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
    toes(l, legF, SADDLE_FAR)
  })
  g.add(-4, (l) => {
    drawArm(l, aF, FAR, SADDLE_FAR, BLACK_FAR)
    smooth(l)
    cel(l, { shade: 2, rim: 1 })
  })

  // ---- tail: long and bushy, a dark tip, locks along it
  const tailBase = hip.pt(-8, 6)
  g.add(-3, (l) => {
    const sway = (s: number) => Math.sin(p.tail[2] - s * 2.6) * s * 2.4
    const path = bentPath(tailBase, p.tail[0], p.tail[1], p.tail[3], sway, 2.4)
    const width = (t: number) => 7 + Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.85) * 5 - t * 2
    ribbon(l, path, width, FUR[1])
    const n = path.length - 1
    // the dark tip: the last fifth of the tail
    for (let i = Math.round(n * 0.8); i <= n; i++)
      tint(l, Frame.at(path[i][0], path[i][1]), oval(0, 0, width(i / n) / 2 + 1.5), BLACK[1])
    for (const [at, rows, side] of [
      [0.5, TUFT_DOWN, 1],
      [0.3, TUFT_DOWN, 1],
      [0.42, TUFT_UP, -1]
    ] as const) {
      const i = Math.round(at * n)
      const a = (heading(path, i) * Math.PI) / 180
      const w = width(at)
      const nx = -Math.sin(a)
      const ny = Math.cos(a)
      const flip = ny >= 0 ? side : -side
      stampAt(l, ID, rows, path[i][0] + nx * flip * (w / 2 - 0.5), path[i][1] + ny * flip * (w / 2 - 0.5), {
        f: FUR[1]
      })
    }
    smooth(l)
    mantle(l, FUR[1], SADDLE[1], { depth: 4, tooth: 2, pitch: 4, origin: tailBase })
    cel(l, { shade: 4.5, deep: 1.5, rim: 1.6, tooth: 2, pitch: 4, origin: tailBase })
  })

  // ---- the body: haunch, belly, chest, neck and the near thigh as ONE silhouette, shaded once
  const chestAt = chest.pt(0, -2)
  g.add(0, (l) => {
    for (const { f, s } of bodyShape()) fill(l, f, s, FUR[1])
    fill(l, ID, capsule(legN.s, legN.mid, 6.5, 4.4), FUR[1])
    // the cream front: belly, chest and throat
    tint(l, hip, oval(7, -3, 6, 8), CREAM[1])
    tint(l, waist, oval(6.5, -4, 6.5, 10), CREAM[1])
    tint(l, chest, oval(6, -3, 6.5, 9), CREAM[1])
    tint(l, ID, capsule(neck.pt(4.5, 0), neck.pt(3.5, -9), 4.6, 4.2), CREAM[1])
    // locks on the rump and the back of the thigh
    stampAt(l, hip, TUFT_BACK, -11, -3, { f: FUR[1] })
    stampAt(l, hip, TUFT_DOWN, -4, 10, { f: FUR[1] })
    smooth(l)
    mantle(l, FUR[1], SADDLE[1], { depth: 6, tooth: 3, pitch: 5, origin: chestAt })
    cel(l, { shade: 7, deep: 2.4, rim: 2, tooth: 3, pitch: 5, origin: chestAt })
    dimEdge(l)
    // the thigh is a soft shadow in front of the haunch, not a line
    shadow(l, hip, overlap(oval(3, 4, 8, 8.5), minusOval(oval(1.5, 2.5, 8, 8.5))))
  })

  // ---- near hind leg below the body
  g.add(1, (l) => {
    hindLower(l, legN, FUR, SADDLE)
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
    toes(l, legN, SADDLE)
  })

  // ---- the court vest: short, black, over the shoulders and back, open at the cream front; the gold clasp
  g.add(1.5, (l) => {
    // the jacket wraps the chest up to the neck; its front edges part in a V over the cream throat
    const vest = overlap(
      union(oval(0, -1, 9.8, 9.6), capsule([0, -4], chest.local(...neck.pt(0, -2)), 8.6, 7.2)),
      half([4, -2], -1, -0.45)
    )
    fill(l, chest, vest, BLACK[1])
    smooth(l)
    cel(l, { shade: 3, rim: 1.2 })
    // a fold down the back
    within(l, (m) => fill(m, chest, capsule([-5, -5], [-3, 5], 0.7, 0.7), BLACK[2]), true)
  })
  g.add(1.6, (l) => stampAt(l, chest, CLASP, 3.5, -2, { y: GOLD[1], Y: GOLD[2] }), false)

  // ---- the fan tucked into the collar behind the neck, shut
  if (p.fan === 'collar') {
    // stuck in behind the collar, the shut fan stands up over the shoulders like a quill
    const [fx, fy] = chest.pt(-6, -4)
    g.add(1.7, (l) => drawFan(l, Frame.at(fx, fy, -38), 0))
  }

  // ---- the cap's two ribbon tails
  const capF = p.capFree
    ? ground.child(p.capFree[0], -p.capFree[1], p.capFree[2], HS)
    : head.child(-2 + p.cap[0], -8.5 + p.cap[1], p.cap[2])
  const knot = capF.pt(-6, -1.2)
  const wave = (s: number) => Math.sin(p.tails[2] - s * 4) * s * 2
  g.add(p.capFree ? 5.9 : 2.5, (l) => {
    // each tail is shaded on its own, then both are laid on one layer (the near one overlaps the far one)
    const tails: Raster[] = []
    for (const [dd, dl] of [
      [8, 0],
      [-6, -4]
    ] as const) {
      l.data.fill(0)
      const path = bentPath(knot, p.tails[0] + dd, p.tails[1], p.tails[3] + dl, wave)
      ribbon(l, path, (t) => 2.8 + t * 2, BAND[1])
      const n = path.length - 1
      carve(
        l,
        Frame.at(path[n][0], path[n][1], heading(path, n)),
        polygon([
          [3, -2.8],
          [-1.5, 0],
          [3, 2.8]
        ])
      )
      cel(l, { shade: 1.4, rim: 1 })
      tails.push(l.clone())
    }
    l.data.fill(0)
    for (const t of tails) l.blit(t)
  })

  // ---- the head's shapes (head units: the jaw hinge sits near (6, 4.5))
  const skull = oval(0, -2, 10.5, 9)
  const snout = capsule([5, 0], [16.5, 2.4], 6.4, 2.9)
  const cheek = oval(-2.5, 3.5, 7.5, 5.8)
  const headShape = union(skull, snout, cheek)

  // ---- far ear (behind the skull)
  const earF = head.child(-3, -9, -p.ear * 0.6)
  g.add(3.5, (l) => {
    fill(l, earF, oval(0, -2.5, 3.6, 3.4), FAR[1])
    tint(l, earF, oval(0.3, -2.2, 1.8, 1.8), SADDLE[2])
    cel(l, { shade: 1.4 })
  })

  // ---- mouth and lower jaw
  const open = (p.mouth === 'open' || p.tongue) && p.jaw > 0.08
  const jaw = head.child(6, 4.5, open ? p.jaw * 30 : p.mouth === 'grit' ? 2 : 0)
  if (open)
    g.add(
      3.7,
      (l) => {
        fill(l, ID, polygon([head.pt(6, 3), head.pt(16, 3.8), jaw.pt(10, -0.4), jaw.pt(0, -1)]), C.mouth)
      },
      false
    )
  g.add(3.8, (l) => {
    fill(l, jaw, capsule([0, 0], [10, 1.4], 2.6, 1.6), CREAM[1])
    cel(l, { shade: 1.2 })
    dimEdge(l)
    if (open) stampAt(l, jaw, ['w.w', 'W.W'], 7.5, -1.2, { w: C.white, W: CREAM[2] })
  })
  if (p.tongue)
    g.add(3.85, (l) => {
      fill(l, jaw, union(capsule([5, -1], [8, 3.4], 1.9, 1.9), oval(8.3, 4.8, 2.1, 2.1)), C.tongue)
      tint(l, jaw, capsule([6, 0.5], [8.3, 5], 0.5, 0.5), C.mouth)
    })

  // ---- head: skull, cheek and snout as one silhouette, the cream mask and muzzle
  const headAt = head.pt(0, -2)
  g.add(4, (l) => {
    fill(l, head, headShape, FUR[1])
    tint(
      l,
      head,
      union(oval(4.5, -1.2, 4.4, 3.4), capsule([5, 4.4], [16, 4], 2.6, 1.6), oval(-2, 6.5, 6, 3.2)),
      CREAM[1]
    )
    stampAt(l, head, TUFT_BACK, -9.5, 5, { f: FUR[1] })
    stampAt(l, head, TUFT_DOWN, -3.5, 9.5, { f: CREAM[1] })
    smooth(l)
    mantle(l, FUR[1], SADDLE[1], { depth: 4.5, tooth: 2, pitch: 4, origin: headAt })
    cel(l, { shade: 4, deep: 1.4, rim: 1.8, tooth: 1.5, pitch: 4, origin: headAt })
    dimEdge(l)
    shadow(l, capF.moved(0, 2), squircle(0, -1, 7, 2.2, 3))
  })

  // ---- face
  g.add(
    4.2,
    (l) => {
      stampAt(l, head, EYES[p.eyes], 4.5, -2, EYE_KEY)
      stampAt(l, head, NOSE, 18, 1.4, { K: C.black, h: SADDLE[0] })
      if (p.mouth === 'smirk') {
        stampAt(l, head, SMIRK, 12, 4.6, { K: C.inkWarm })
        stampAt(l, head, ['w', 'W'], 13.5, 6.4, { w: C.white, W: CREAM[2] })
      } else if (p.mouth === 'grin') {
        stampAt(l, head, SMIRK, 12, 4.6, { K: C.inkWarm })
        stampAt(l, head, ['w.w.w', 'W...W'], 13, 6.4, { w: C.white, W: CREAM[2] })
      } else if (p.mouth === 'grit') stampAt(l, head, GRIT, 12, 5, { K: C.inkWarm, w: C.white })
    },
    false
  )
  g.add(4.3, (l) => stampAt(l, head, WHISKERS, 16, 3, { w: FUR[1] }), false)

  // ---- near ear: small and round, a dark bowl
  const earN = head.child(-7.5, -6, -p.ear)
  g.add(4.4, (l) => {
    fill(l, earN, oval(0, -2.8, 4.2, 4), FUR[1])
    tint(l, earN, oval(0.6, -2.4, 2.2, 2.2), SADDLE[2])
    cel(l, { shade: 1.6, rim: 1 })
  })

  // ---- the scholar's cap: flat-topped, the red band at its foot, the gold button on top
  g.add(p.capFree ? 6 : 4.6, (l) => {
    const crown = union(squircle(0, -4.6, 6.4, 4.6, 3.4), squircle(0, -1, 7.2, 2, 3))
    fill(l, capF, crown, BLACK[1])
    tint(l, capF, half([0, -2.6], 0, 1), BAND[1])
    fill(l, capF, oval(0, -9.6, 1.6, 1.5), GOLD[1])
    smooth(l)
    cel(l, { shade: 2.4, rim: 1.4 })
  })

  // ---- the fan
  if (p.fan === 'hand') g.add(5, (l) => drawFan(l, aN.hand.child(1.2, 0, p.fanDir - aN.hand.angle), p.fanOpen))
  if (p.fan === 'free') g.add(6.2, (l) => drawFan(l, ground.child(p.fanFree[0], -p.fanFree[1], p.fanDir), p.fanOpen))

  // ---- near arm, in front
  g.add(5.5, (l) => {
    drawArm(l, aN, FUR, SADDLE, BLACK)
    smooth(l)
    cel(l, { shade: 2.2, rim: 1.2 })
  })

  // ---- stars over a knocked-out head, outlined
  if (p.stars >= 0)
    g.add(7, (l) => {
      const [hx, hy] = head.pt(0, 0)
      const cx = hx - 2
      const cy = hy - 20
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 12) - 2,
          Math.round(cy + Math.sin(a) * 3.5) - 2,
          { y: GOLD[1], Y: GOLD[0] }
        )
      }
    })

  return g.render()
}

/** Everything outside an oval (for a crease that is the rim of a shape). */
const minusOval = (s: Shape): Shape => ({ box: [-200, -200, 200, 200], has: (u, v) => !s.has(u, v) })

// ------------------------------------------------------------------------------------------------ clips

const P = weaselPose
const phase = (i: number, n: number) => (i / n) * TAU

/** idle: weight on one hip, fanning himself slowly, the tail tip curling, the eyes sliding toward the hero. */
const idle = memo(() => {
  const N = 6
  const shift = Array.from({ length: N }, (_, i) => Math.sin(phase(i, N)))
  const breath = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(phase(i, N)))
  const tailLag = lag(shift, { stiffness: 0.35, damping: 0.5, loop: true })
  const eyes: Eyes[] = ['sly', 'sly', 'glance', 'narrow', 'narrow', 'sly']
  return Array.from({ length: N }, (_, i) =>
    P({
      y: breath[i] * 0.6,
      bend: [6 + shift[i] * 2, -12 - shift[i], 6, 22],
      breath: breath[i],
      head: [0, -breath[i] * 0.5],
      eyes: eyes[i],
      armN: [14 + Math.sin(phase(i, N)) * 1.5, 8 - Math.cos(phase(i, N)) * 1.5, 0],
      fanDir: 50 + Math.sin(phase(i, N)) * 16,
      tail: [-12 + tailLag[i] * 6, -150 - shift[i] * 30, phase(i, N), 50],
      tails: [45 - tailLag[i] * 10, 40, phase(i, N), 28]
    })
  )
})

/** On all fours: the spine laid forward, the fan tucked into the collar, ears back. */
const Q: Partial<WeaselPose> = {
  hip: [-20, 16],
  pitch: 90,
  bend: [0, 0, 0, -18],
  stretch: 2,
  head: [4, 3],
  fan: 'collar',
  ear: 50,
  eyes: 'angry',
  mouth: 'grin',
  armN: [14, 0, 1],
  armF: [8, 0, 1],
  legN: [0, 0, 0],
  legF: [0, 0, 0],
  tail: [-30, 16, 0, 30],
  tails: [-4, 14, 0, 28]
}

/** intro: a mocking bow — the fan snaps shut, sweeps down into a deep courtly bow (held), he rises and flicks it open
 * in front of his face so only the narrowed eyes show over it (held, alive). */
const intro = memo(() => [
  P({ eyes: 'sly', armN: [13, 5, 0], fanDir: 40 }),
  P({
    y: 1,
    bend: [4, -12, 4, 18],
    nod: -8,
    eyes: 'smug',
    armN: [8, -9, 0],
    fanDir: -10,
    fanOpen: 0,
    tail: [-16, -160, 1, 50],
    tails: [50, 40, 1, 28]
  }),
  P({
    pitch: 22,
    bend: [6, -2, 10, 26],
    head: [1, 2],
    nod: 22,
    eyes: 'shut',
    armN: [15, 9, 0],
    armF: [-8, 6, 0],
    fanDir: 110,
    fanOpen: 0,
    tail: [-20, -170, 2, 50],
    tails: [70, 30, 2, 28]
  }),
  P({
    pitch: 34,
    bend: [6, 2, 12, 32],
    head: [1, 3],
    nod: 34,
    eyes: 'smug',
    ear: 10,
    armN: [12, 15, 0],
    armF: [-10, 4, 0],
    fanDir: 150,
    fanOpen: 0,
    tail: [-22, -175, 3, 50],
    tails: [85, 15, 3, 28]
  }),
  P({
    y: 1,
    pitch: 6,
    bend: [6, -10, 6, 20],
    nod: -4,
    eyes: 'narrow',
    armN: [10, -4, 0],
    fanDir: 0,
    fanOpen: 0.15,
    tail: [-14, -160, 4, 50],
    tails: [40, 40, 4, 28]
  }),
  P({
    bend: [6, -12, 6, 22],
    nod: 2,
    eyes: 'narrow',
    armN: [14, -6, 0],
    fanDir: 12,
    fanOpen: 1,
    tail: [-12, -150, 5, 50],
    tails: [62, 25, 5, 28]
  }),
  P({
    bend: [6, -12, 6, 22],
    nod: 2,
    eyes: 'narrow',
    armN: [14, -5.5, 0],
    fanDir: 6,
    fanOpen: 1,
    tail: [-12, -158, 6, 50],
    tails: [72, 15, 6, 28]
  }),
  P({
    y: 0.5,
    bend: [6, -12, 6, 22],
    nod: 2,
    eyes: 'narrow',
    armN: [14, -6.5, 0],
    fanDir: 16,
    fanOpen: 0.95,
    tail: [-10, -145, 7, 50],
    tails: [66, 20, 7.5, 28]
  })
])

/** hurt: the cap jumps, the fan flies up, eyes shut; recoil; furious, the fan shut and pointed at the hero. */
const hurt = memo(() => [
  P({
    x: -3,
    pitch: -12,
    bend: [2, -8, -4, 12],
    head: [-2, -2],
    nod: -16,
    eyes: 'hurt',
    mouth: 'open',
    jaw: 0.7,
    ear: 40,
    cap: [-1, -5, -22],
    fan: 'free',
    fanFree: [24, 92],
    fanDir: -40,
    fanOpen: 0.7,
    armN: [6, -12, 0],
    armF: [-6, -8, 0],
    tail: [-40, -90, 0, 50],
    tails: [10, 20, 0, 28]
  }),
  P({
    x: -6,
    pitch: -4,
    bend: [6, -8, 4, 16],
    head: [-1, 1],
    nod: 10,
    eyes: 'shut',
    mouth: 'grit',
    ear: 30,
    cap: [0, -2, -10],
    fan: 'free',
    fanFree: [20, 78],
    fanDir: 50,
    fanOpen: 0.4,
    armN: [12, -4, 0],
    tail: [-26, -120, 1.5, 50],
    tails: [40, 40, 1.5, 28]
  }),
  P({
    x: -3,
    pitch: 4,
    bend: [6, -10, 6, 20],
    nod: 4,
    eyes: 'angry',
    mouth: 'grit',
    ear: 20,
    cap: [0, 0, 4],
    armN: [18, 1, 0],
    fanDir: 82,
    fanOpen: 0,
    tail: [-14, -150, 3, 50],
    tails: [70, 20, 3, 28]
  })
])

/** windup: the fan goes into the collar, he drops onto all fours and coils, back arched, tail lashing; trembles. */
const windup = memo(() => {
  const coil: Partial<WeaselPose> = {
    ...Q,
    hip: [-18, 24],
    pitch: 104,
    bend: [-14, 20, 24, -58],
    head: [0, 2],
    nod: 6,
    armN: [14, 0, 1],
    armF: [9, 0, 1],
    legN: [4, 0, 0],
    legF: [2, 0, 0],
    mouth: 'grit',
    ear: 60
  }
  return [
    P({
      pitch: 30,
      bend: [6, 2, 10, 14],
      head: [1, 2],
      nod: 8,
      eyes: 'narrow',
      mouth: 'grin',
      fan: 'collar',
      armN: [6, 10, 0],
      armF: [8, 10, 0],
      ear: 30,
      tail: [-20, -120, 0, 48],
      tails: [40, 30, 0, 28]
    }),
    P({ ...coil, x: -1, hip: [-17, 22], pitch: 98, tail: [-30, -60, 1, 48], tails: [20, 20, 1.5, 28] }),
    P({ ...coil, x: -2, tail: [-45, -40, 2, 48], tails: [10, 20, 3, 28] }),
    P({ ...coil, x: -3, head: [0.5, 2.5], tail: [-35, -70, 3.5, 48], tails: [14, 16, 4.5, 28] })
  ]
})

/** attack: the bounding gallop — gathered and arched, push-off, stretched flat in the air, front landing, the hind
 * paws swinging in under him. Ears back, ribbons and tail streaming. */
const attack = memo(() => {
  const N = 6
  // hip, bend, y, stretch, front paws (x, lift), hind paws (forward, lift, turn)
  const keys: [number[], number[], number, number, Reach, Reach, Foot, Foot][] = [
    [[-12, 22], [-60, 34, 36, -24], 0, 0.2, [8, 0, 1], [4, 1, 1], [8, 0, 0], [5, 0, 0]],
    [[-16, 20], [-28, 16, 16, -20], 2, 1.2, [22, 6, 1], [18, 8, 1], [-6, 0, 30], [-9, 2, 40]],
    [[-22, 17], [-4, 2, -2, -16], 6, 2.4, [34, 7, 1], [30, 9, 1], [-16, 8, 70], [-20, 10, 80]],
    [[-22, 18], [2, 4, 8, -18], 2, 2.2, [28, 0, 1], [24, 0, 1], [-12, 10, 60], [-16, 9, 50]],
    [[-17, 20], [-30, 18, 24, -22], 1, 1, [18, 0, 1], [16, 0, 1], [2, 9, 10], [-2, 10, 20]],
    [[-13, 22], [-52, 30, 32, -24], 0, 0.4, [12, 3, 1], [9, 5, 1], [9, 2, 0], [6, 3, 0]]
  ]
  const bob = keys.map((k) => k[2])
  const lagged = lag(bob, { stiffness: 0.4, damping: 0.5, loop: true })
  return keys.map(([hp, bend, y, stretch, armN, armF, legN, legF], i) =>
    P({
      ...Q,
      hip: [hp[0], hp[1]],
      bend: [bend[0], bend[1], bend[2], bend[3]],
      y,
      stretch,
      armN,
      armF,
      legN,
      legF,
      head: [4, 3 + lagged[i]],
      nod: 4 + lagged[i] * 3,
      eyes: 'angry',
      mouth: i % 3 === 2 ? 'open' : 'grin',
      jaw: 0.5,
      tail: [-30 + Math.sin(phase(i, N)) * 8, 16, phase(i, N) * 2, 30],
      tails: [-6 + Math.sin(phase(i, N) + 1) * 6, 12, phase(i, N) * 2, 28]
    })
  )
})

/** stunned: sat down hard, legs out in front, the cap askew over one eye, the head circling, tongue out. */
const stunned = memo(() => {
  const N = 6
  return Array.from({ length: N }, (_, i) => {
    const a = phase(i, N)
    return P({
      hip: [-2, 13],
      pitch: -16,
      bend: [0, -6, 8, 26],
      head: [Math.cos(a) * 2.4, Math.sin(a) * 1.8],
      nod: 6 + Math.sin(a) * 10,
      eyes: 'dizzy',
      mouth: 'open',
      jaw: 0.4,
      tongue: true,
      ear: 30 + Math.sin(a) * 15,
      cap: [3, 2, 28 + Math.sin(a) * 4],
      armN: [10, 1, 1],
      armF: [4, 1, 1],
      legN: [16, 3, -70],
      legF: [12, 2, -60],
      fan: 'free',
      fanFree: [30, 5],
      fanDir: 93,
      fanOpen: 0.3,
      tail: [-4, -24, a, 44],
      tails: [80, 0, a, 28]
    })
  })
})

/** recover: upright again but bent over, fanning himself frantically, panting. */
const recover = memo(() =>
  [0, 1, 0.3, 0.85].map((pant, i) =>
    P({
      y: -pant * 0.6,
      hip: [-3, 19],
      pitch: 18,
      bend: [6, -2, 10, 24],
      breath: pant,
      head: [2, 3 + pant],
      nod: 18 - pant * 4,
      eyes: 'tired',
      mouth: 'open',
      jaw: 0.4 + pant * 0.35,
      tongue: true,
      ear: 20,
      armN: i % 2 ? [14, -1, 0] : [13, 6, 0],
      armF: [10, 12, 0],
      fanDir: i % 2 ? 28 : 95,
      fanOpen: i % 2 ? 1 : 0.8,
      tail: [-6, -100, i * 1.5, 48],
      tails: [80 + pant * 6, 10, i * 1.6, 28]
    })
  )
)

/** defeat: hit, he spins on one foot, the fan and the cap fly off, he falls flat on his back, long and limp, the cap
 * lands on his belly; stars circle on the last two frames. */
const defeat = memo(() => {
  const lying: Partial<WeaselPose> = {
    hip: [18, 14],
    pitch: -90,
    stretch: 1,
    bend: [0, 0, 0, 14],
    head: [-12, 2],
    nod: -40,
    eyes: 'dizzy',
    mouth: 'open',
    jaw: 0.4,
    tongue: true,
    ear: 40,
    armN: [-8, 1, 1],
    armF: [-14, 2, 1],
    legN: [0, 26, -120],
    legF: [7, 22, -130],
    fan: 'free',
    fanFree: [-52, 7],
    fanDir: -12,
    fanOpen: 0.45,
    tail: [-165, 40, 0, 30],
    tails: [-80, 0, 0, 18]
  }
  return [
    P({
      x: -2,
      pitch: -10,
      bend: [2, -12, -8, 6],
      head: [-1, -2],
      nod: -12,
      eyes: 'wide',
      mouth: 'open',
      jaw: 0.7,
      ear: 40,
      cap: [0, -6, -25],
      fan: 'free',
      fanFree: [22, 76],
      fanDir: -30,
      fanOpen: 0.8,
      armN: [4, -13, 0],
      armF: [-6, -6, 0],
      tail: [-40, -80, 0, 50],
      tails: [0, 30, 0, 28]
    }),
    P({
      x: -4,
      pitch: -20,
      bend: [0, -10, -6, 0],
      head: [-2, -3],
      nod: -30,
      eyes: 'hurt',
      mouth: 'open',
      jaw: 0.6,
      ear: 50,
      legF: [8, 10, -30],
      capFree: [8, 100, -60],
      fan: 'free',
      fanFree: [32, 94],
      fanDir: 120,
      fanOpen: 0.6,
      armN: [14, -8, 0],
      armF: [-12, -6, 0],
      tail: [-60, -40, 1, 50],
      tails: [-20, 30, 1, 28]
    }),
    P({
      x: -6,
      hip: [-4, 19],
      pitch: -45,
      bend: [0, -6, -6, 0],
      nod: -55,
      eyes: 'hurt',
      mouth: 'open',
      jaw: 0.5,
      ear: 50,
      legN: [12, 12, -60],
      capFree: [-4, 102, -140],
      fan: 'free',
      fanFree: [40, 70],
      fanDir: 200,
      fanOpen: 0.5,
      armN: [10, -12, 0],
      armF: [-10, -10, 0],
      tail: [-80, -20, 2, 48],
      tails: [-40, 20, 2, 28]
    }),
    P({
      x: -4,
      hip: [4, 14],
      pitch: -72,
      bend: [0, 0, -4, 6],
      head: [-5, 0],
      nod: -85,
      eyes: 'shut',
      mouth: 'open',
      jaw: 0.4,
      ear: 50,
      legN: [8, 24, -90],
      legF: [12, 20, -100],
      capFree: [-14, 90, -220],
      fan: 'free',
      fanFree: [44, 40],
      fanDir: 260,
      fanOpen: 0.5,
      armN: [-6, -14, 0],
      armF: [-12, -8, 0],
      tail: [-150, 40, 3, 40],
      tails: [-60, 10, 3, 28]
    }),
    P({ ...lying, y: -1, stretch: 1.5, eyes: 'shut', capFree: [2, 72, -300], tails: [-70, 0, 4, 18] }),
    P({ ...lying, y: 3, stretch: 0.6, head: [-12, 0], capFree: [-2, 46, -340], tails: [-95, 20, 5, 18] }),
    P({ ...lying, capFree: [-6, 25, -360], stars: 0, tails: [-84, 6, 6, 18] }),
    P({
      ...lying,
      capFree: [-6, 25.5, -362],
      stars: 1 / 6,
      breath: 0.6,
      tail: [-166, 44, 0.8, 30],
      tails: [-82, 4, 7, 18]
    })
  ]
})

const draw = (poses: WeaselPose[]) => poses.map(drawWeasel)

export const sheets: SheetModule = {
  weaselBoss: () => ({
    idle: lazyAnim(() => draw(idle()), 8, true),
    intro: lazyAnim(() => draw(intro()), 10, false, { sustain: 2, hold: [1, 1, 1, 3, 1, 2, 1, 1] }),
    hurt: lazyAnim(() => draw(hurt()), 12, false),
    defeat: lazyAnim(() => draw(defeat()), 10, false, { sustain: 2, hold: [1, 2, 1, 1, 1, 1, 2, 2] }),
    windup: lazyAnim(() => draw(windup()), 10, false, { sustain: 2 }),
    attack: lazyAnim(() => draw(attack()), 16, true),
    stunned: lazyAnim(() => draw(stunned()), 8, true),
    recover: lazyAnim(() => draw(recover()), 6, true)
  })
}
