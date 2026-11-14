/**
 * モグラ隊長 (`tough`): the gang's heavy — a stubborn, barrel-chested mole sergeant in a dented steel helmet. Upright
 * on short thick legs, a barrel body wider than it is tall, almost no neck, a head that is a blunt cone ending in a
 * big pink nose. Signature shapes: the helmet pulled down over the eyes (on its own frame: it bobs late, jumps when
 * he is bitten, flies off when he falls) and two huge cream digging paws held low and forward like boxing gloves.
 * The gang's red neckerchief sits between helmet and chest. 64×64 cell, feet on (32, 60), 52×50 box.
 *
 * Depth (back to front): bandana tails, tail stub, far arm, far paw + claws, far leg, far foot, body, near leg,
 * near foot, bandana, knot, head + face, nose, helmet dome, helmet brim, near arm, near paw + claws.
 * A helmet knocked off (`free`) is drawn as its own object in front of everything.
 */
import { C, R, ramp } from '../../palette'
import { TAU, footPath, footfall, lag, type FootfallModule } from '../../motion'
import { Painter, Raster, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  cel,
  fill,
  half,
  oval,
  overlap,
  ribbon,
  shadow,
  sheen,
  smooth,
  squircle,
  tint,
  union,
  within,
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'
import { BANDANA, bandanaKnot, bandanaTail, neckerchief, type BandanaFit } from './kit'

const MOLE = R.moleBrown
const MOLE_FAR = farRamp(MOLE)
/** The pale belly and muzzle: its shade and deep are the coat's highlight and base (fewer colours per frame). */
const BELLY = ramp('#ecdcc0', '#d2b894', '#b89878', '#8a6a4a', '#3a1a22')
const STEEL = R.steel
/** The digging claws: their own cream (the shared cream's steps are claimed by other ramps). */
const CLAW = ramp('#fff6e2', '#f2dcb4', '#d6b688', '#a08060', '#3a1a22')
const CLAW_FAR = farRamp(CLAW)
const PINK = R.hamEar
const PINK_FAR = farRamp(PINK)

// ------------------------------------------------------------------------------------------------------ pose

export type MoleEyes = 'glare' | 'wide' | 'shut' | 'hurt' | 'dizzy'
export type MoleBrow = 'scowl' | 'up' | 'furious'
export type MoleMouth = 'grim' | 'grit' | 'open' | 'tongue'
/** A foot: forward (px), lift (px), toe-down tilt (degrees). */
export type MoleFoot = readonly [number, number, number]
/** A paw: wrist offset from the shoulder (torso units), the claws' direction (degrees, 0 = forward, + down), spread 0..1. */
export type MolePaw = readonly [number, number, number, number]

export interface MolePose {
  /** Whole figure forward (+) and up (+). */
  x: number
  y: number
  /** Pelvis sink (+ down): the body sinks and rises, planted feet stay. */
  sink: number
  /** Body lean (forward +), squash (+ wider and shorter), and the whole rig turned clockwise (tumbles). */
  lean: number
  squash: number
  spin: number
  /** Feet on the ground row (false: they travel with the body). */
  planted: boolean
  /** Head offset from its seat (forward, up) and nod (snout down +). */
  head: readonly [number, number]
  nod: number
  /** Nose twitch 0..1 (wrinkled up). */
  nose: number
  /** Helmet on the head: offset (forward, up) and tilt (degrees, clockwise). */
  helmet: readonly [number, number, number]
  /** Helmet knocked off: screen position of its seat and its turn; null while he wears it. */
  free: readonly [number, number, number] | null
  pawN: MolePaw
  pawF: MolePaw
  /** The far paw in front of the head and helmet (clamping the helmet down). */
  farOnTop: boolean
  footN: MoleFoot
  footF: MoleFoot
  /** Bandana tails: angle (0 = back, 90 = down), length, ripple, phase. */
  scarf: readonly [number, number, number, number]
  eyes: MoleEyes
  brow: MoleBrow
  /** Pupils: −1 looking back … 1 looking ahead. */
  look: number
  mouth: MoleMouth
}

export const molePose = (p: Partial<MolePose> = {}): MolePose => ({
  x: 0,
  y: 0,
  sink: 0,
  lean: 0,
  squash: 0,
  spin: 0,
  planted: true,
  head: [0, 0],
  nod: 0,
  nose: 0,
  helmet: [0, 0, 4],
  free: null,
  pawN: [4, 6, 30, 0.3],
  pawF: [12, 3, 12, 0.3],
  farOnTop: false,
  footN: [0, 0, 0],
  footF: [0, 0, 0],
  scarf: [40, 6, 0.8, 0],
  eyes: 'glare',
  brow: 'scowl',
  look: 1,
  mouth: 'grim',
  ...p
})

// ---------------------------------------------------------------------------------------------------- stamps

const FACE_KEY = { w: C.white, o: C.black, K: C.ink, m: C.mouth, t: C.tongue, T: CLAW[0], d: MOLE[3] }

/** Small bright eyes: a white with a 2×2 pupil placed by `look`. Near eye 4 wide, far eye 3. */
function eyeRows(kind: MoleEyes, look: number, far: boolean): string[] {
  const w = far ? 3 : kind === 'glare' ? 5 : 4
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
    case 'wide':
      return pupil(far ? ['.w.', 'www', 'www', '.w.'] : ['.ww.', 'wwww', 'wwww', '.ww.'], 1, 2)
    case 'shut':
      return far ? ['...', 'KKK', '.d.'] : ['....', 'KKKK', '.dd.']
    case 'hurt':
      return far ? ['..K', 'KK.', '..K'] : ['K...', '.KK.', '..KK', '.KK.', 'K...'].slice(0, 5)
    case 'dizzy':
      return far ? ['KKK', 'K.K', 'KK.'] : ['.KK.', 'K..K', 'K.KK', '.K..']
    default:
      // glare: the top lid flat, a narrow white under it
      return pupil(far ? ['www', 'www', '.w.'] : ['wwwww', 'wwwww', '.www.'], 0, 2)
  }
}

/** Heavy brows over the eyes: [near, far]. */
const BROWS: Record<MoleBrow, readonly [readonly string[], readonly string[]]> = {
  scowl: [
    ['KK...', '.KKKK'],
    ['KKK', 'KK.']
  ],
  furious: [
    ['KK...', 'KKKK.', '..KKK'],
    ['.KK', 'KKK', 'K..']
  ],
  up: [
    ['..KK.', 'KK..K'],
    ['KK.', '..K']
  ]
}

/** Mouths on the underside of the snout. */
const MOUTHS: Record<MoleMouth, readonly string[]> = {
  grim: ['.KKKKK', 'K...T.'],
  grit: ['KKKKK', 'KTTTK', 'KKKKK'],
  open: ['KKKKK', 'KmTmK', 'KmmmK', '.KKK.'],
  tongue: ['KKKKK', 'KmmmK', '.Ktt.', '..tt.']
}

/** A few whiskers on the snout, in the coat's deep brown. */
const WHISKERS = ['dd..', '..dd', 'dd..']

/** `stampAt`, kept off the layer's edge (whiskers, eyes, mouths never break the outline). */
function stampIn(l: Raster, f: Frame, rows: readonly string[], u: number, v: number, key: Record<string, number>) {
  let grid = [...rows]
  for (let n = f.quarter; n > 0; n--) {
    const h = grid.length
    const w = grid[0].length
    grid = Array.from({ length: w }, (_, r) => Array.from({ length: h }, (_, col) => grid[h - 1 - col][r]).join(''))
  }
  const [x, y] = f.pt(u, v)
  const x0 = Math.round(x - grid[0].length / 2)
  const y0 = Math.round(y - grid.length / 2)
  const src = l.clone()
  const inner = (px: number, py: number) =>
    src.get(px, py) && src.get(px - 1, py) && src.get(px + 1, py) && src.get(px, py - 1) && src.get(px, py + 1)
  grid.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch === '.' || !inner(x0 + i, y0 + j)) continue
      l.set(x0 + i, y0 + j, key[ch])
    }
  })
  return l
}

// ------------------------------------------------------------------------------------------------- shapes

/** The skull, the cheek and the blunt cone of the snout (head frame: origin on the neck, snout to +u). */
const headShape = (): Shape =>
  union(oval(-1, -7, 11.5, 10), oval(4.5, -2, 9, 5.5), capsule([7, -6], [15.5, -3.2], 7.2, 3.8))
const NOSE = (twitch: number) => oval(17.8, -3.8 - twitch * 0.6, 3.9, 3.5)

/** The helmet in its own frame: origin on the middle of the brim's underside. */
const DOME = overlap(oval(0, -0.5, 11.5, 10.6), half([0, -0.5], 0, -1))
const BRIM = squircle(1.5, -0.2, 14, 2.5, 2.4)

/** Height of the tumble pivot above the feet. */
const PIV = 17
/** Hip height above the soles. */
const HIP = 11

const BANDANA_MOLE: BandanaFit = { back: [-11, -1.5], front: [10, 0], sag: 2.4, width: 4.2, from: 0.4, tip: [5, 8] }

// ------------------------------------------------------------------------------------------------- drawing

/** The helmet: a dented steel dome with a stripe of rivets, the sergeant's chevron, and the brim. */
function helmet(g: Painter, h: Frame, depth: number) {
  const upside = Math.cos((h.angle * Math.PI) / 180) < -0.3
  g.add(depth, (l) => {
    fill(l, h, DOME, STEEL[1])
    smooth(l)
    cel(l, { shade: 2.6, deep: 1, rim: 1 })
    // the dark core and the hard highlight of metal
    // the hard highlight: a short bright streak on the shoulder of the dome
    stampIn(l, h, ['..hh', '.hh.', 'hh..'], -5.5, -6.5, { h: STEEL[0] })
    // the dent on the front of the dome: a dark pit with a lit lower lip
    within(l, (m) => fill(m, h, oval(5.6, -7.2, 1.8, 1.2), STEEL[3]), true)
    within(l, (m) => fill(m, h, oval(6.2, -5.8, 1.6, 0.6), STEEL[0]), true)
    // rivets along the base of the dome and the chevron
    for (const u of [-8, -4, 0, 4, 8]) stampIn(l, h, ['h', 'd'], u, -2.6, { h: STEEL[0], d: STEEL[3] })
    stampIn(l, h, ['r...r', 'rr.rr', '.rrr.', '..r..'], -1.5, -6, { r: BANDANA[1] })
  })
  g.add(depth + 0.05, (l) => {
    fill(l, h, BRIM, STEEL[1])
    smooth(l)
    cel(l, { shade: 1.4, rim: 1 })
    if (upside) shadow(l, h, oval(0.5, -0.8, 10, 1.2), 2)
  })
}

/**
 * A big digging paw in its own frame (wrist at the origin, claws toward +u): a cream hand, its base darker where it
 * meets the fur, and four thick claws fanning out — each claw its own part, so a soft contour separates them.
 */
function digPaw(g: Painter, f: Frame, open: number, tone: Ramp, d: number) {
  const spread = 0.3 + open * 0.7
  ;[-1.5, -0.5, 0.5, 1.5].forEach((i, n) => {
    const r = (i * 17 * spread * Math.PI) / 180
    const root: Pt = [3, i * 2.2]
    const len = Math.abs(i) > 1 ? 5.2 : 6.4
    const tip: Pt = [root[0] + Math.cos(r) * len, root[1] + Math.sin(r) * len + 1]
    g.add(d + 0.01 * (n + 1), (l) => {
      fill(l, f, capsule(root, tip, 2.4, 1.1), tone[1])
      cel(l, { shade: 1.2 })
    })
  })
  g.add(d + 0.06, (l) => {
    fill(l, f, oval(0.6, 0.4, 4.4, 4.6), tone[1])
    tint(l, f, oval(-3, 0.4, 2.6, 4.8), tone[2])
    smooth(l)
    cel(l, { shade: 1.6 })
    // a soft light on the knuckles, kept off the edge (a lit outline on cream would read as no outline)
    within(l, (m) => fill(m, f, oval(1.2, -1.6, 2.2, 1.4), tone[0]), true)
  })
}

/** The foot in its own frame (toe toward +u, sole on v = 0): a stubby pink sole with a pale claw tip. */
const FOOT = overlap(union(oval(1.4, -1.9, 4, 2.2), oval(-1.6, -2, 2.6, 2.1)), half([0, 0], 0, -1))
function moleFoot(g: Painter, f: Frame, skin: Ramp, d: number) {
  g.add(d, (l) => {
    fill(l, f, FOOT, skin[1])
    smooth(l)
    cel(l, { shade: 1.2 })
    stampIn(l, f, ['c', 'c'], 4.6, -2, { c: CLAW[2] })
  })
}

interface Face {
  eyes: MoleEyes
  brow: MoleBrow
  look: number
  mouth: MoleMouth
  nose: number
}

/**
 * The face on the head frame, painted without its own outline: the head's silhouette is part of the body layer
 * (no neck), so only the face, the nose and the tongue are drawn here. `brim` is the helmet's seat while he wears it.
 */
function moleFace(g: Painter, head: Frame, p: Face, brim: Frame | null, d: number) {
  g.add(
    d,
    (l) => {
      fill(l, head, headShape(), MOLE[1])
      tint(l, head, union(oval(10, -0.6, 7.5, 2.8), oval(4, 0.2, 5, 2.4)), BELLY[1])
      smooth(l)
      cel(l, { shade: 3, deep: 1 })
      // the brim's shadow over the eyes
      if (brim) shadow(l, brim.moved(0, 2.2), overlap(BRIM, half([0, 0], 0, 1)))
      const lift = brim ? 0 : -0.5
      stampIn(l, head, eyeRows(p.eyes, p.look, false), 6, -6 + lift, FACE_KEY)
      stampIn(l, head, eyeRows(p.eyes, p.look, true), 11.5, -5.8 + lift, FACE_KEY)
      if (p.eyes === 'glare' || p.eyes === 'wide') {
        const [bn, bf] = BROWS[p.brow]
        stampIn(l, head, bn, 5.5, -8.4 + lift, FACE_KEY)
        stampIn(l, head, bf, 11.5, -8 + lift, FACE_KEY)
      }
      stampIn(l, head, WHISKERS, 9, -2.6, FACE_KEY)
      stampIn(l, head, MOUTHS[p.mouth], 11.5, 0.6 + MOUTHS[p.mouth].length / 2 - 1, FACE_KEY)
    },
    false
  )
  g.add(d + 0.2, (l) => {
    fill(l, head, NOSE(p.nose), PINK[1])
    cel(l, { shade: 1.4 })
    stampIn(l, head, ['hh', 'h.'], 15.4, -4.6 - p.nose * 0.6, { h: PINK[0] })
  })
  if (p.mouth === 'tongue')
    g.add(d + 0.1, (l) => {
      // the tongue lolls out of the corner of the mouth and hangs with gravity
      const [tx, ty] = head.pt(12, 1.2)
      ribbon(
        l,
        [
          [tx, ty],
          [tx + 0.6, ty + 2.2],
          [tx + 0.2, ty + 3.8]
        ],
        (t) => 2.4 + t * 0.6,
        PINK[1]
      )
      cel(l, { shade: 1 })
    })
}

export function drawMole(pose: MolePose): Raster {
  const g = new Painter(64, 64, { soft: true })
  const k = 1 + pose.squash * 0.04
  const center = Frame.at(32 + pose.x, 60 - PIV - pose.y, pose.spin)
  const base = pose.planted && pose.spin === 0 ? Frame.at(32 + pose.x, 60 - pose.y) : center.child(0, PIV)
  const root = center.child(-2, PIV - HIP + pose.sink)
  const torso = root.child(0, 0, pose.lean, k, 1 / k)
  /** A part hung on the torso by position only: it follows the body but keeps its own shape when the body squashes. */
  const hang = (u: number, v: number, deg: number) => Frame.at(...torso.pt(u, v), pose.spin + pose.lean + deg)
  const head = hang(6.5 + pose.head[0], -13 - pose.head[1], pose.nod - pose.lean * 0.5)
  const neck = torso.child(4, -9.5, -6)
  const knot = neck.pt(...BANDANA_MOLE.back)

  // ---- bandana tails behind the body
  const [sa, sl, sr, sp] = pose.scarf
  g.add(-6, (l) => bandanaTail(l, knot, sa + 24 - pose.spin, sl * 0.8, sr, sp + 1.6, true))
  g.add(-5.9, (l) => bandanaTail(l, knot, sa - pose.spin, sl, sr, sp))

  // ---- tail stub
  g.add(-5, (l) => {
    fill(l, torso, oval(-15, -3, 3, 2.6), MOLE[1])
    cel(l, { shade: 1.4 })
  })

  // ---- paws: a broad cream paw with four thick claws, each claw its own part so they read as fingers
  const shoulderN: Pt = [2, -7.5]
  const shoulderF: Pt = [8, -9]
  const pawFrame = (s: Pt, p: MolePaw) => hang(s[0] + p[0], s[1] + p[1], p[2])
  /**
   * A mole has almost no arm: a short furry cuff comes out of the coat toward the wrist. A paw flung far from its
   * shoulder (a flail, a slap on the helmet) cheats and grows an arm to reach it.
   */
  const arm = (d: number, s: Pt, p: MolePaw, fur: Ramp, near: boolean) =>
    g.add(d, (l) => {
      const f = pawFrame(s, p)
      fill(l, f, capsule([-5.5, 0.4], [-1.5, 0.3], near ? 4.4 : 3.8, near ? 4 : 3.4), fur[1])
      if (Math.hypot(p[0], p[1]) > 9) {
        const a = torso.pt(s[0], s[1])
        const w = f.pt(-3, 0.3)
        fill(l, Frame.at(0, 0), capsule(a, w, near ? 4 : 3.6, near ? 3.6 : 3.2), fur[1])
      }
      smooth(l)
      cel(l, { shade: 2.2, rim: near ? 1 : 0 })
    })
  const paw = (d: number, s: Pt, p: MolePaw, tone: Ramp) => digPaw(g, pawFrame(s, p), p[3], tone, d)
  arm(-4, shoulderF, pose.pawF, MOLE_FAR, false)
  paw(pose.farOnTop ? 3.5 : -3.9, shoulderF, pose.pawF, CLAW_FAR)

  // ---- legs and feet
  const footFrame = (at: MoleFoot, u: number) => base.child(u + at[0], -at[1], at[2])
  /** A short thick leg: the thigh is under the coat (drawn behind the body), only the stump and the foot show. */
  const leg = (d: number, df: number, at: MoleFoot, u: number, hip: Pt, fur: Ramp, skin: Ramp) => {
    const f = footFrame(at, u)
    g.add(d, (l) => {
      const a = torso.pt(hip[0], hip[1])
      const b = f.pt(-0.3, -3.2)
      fill(l, Frame.at(0, 0), capsule(a, b, 5, 3.4), fur[1])
      smooth(l)
      cel(l, { shade: 2 })
    })
    moleFoot(g, f, skin, df)
  }
  leg(-3.5, -3.4, pose.footF, 6, [5, -2], MOLE_FAR, PINK_FAR)

  // ---- body: barrel, haunch and chest as one silhouette
  g.add(0, (l) => {
    fill(l, torso, union(squircle(0, -9, 14.5, 10, 2.3), oval(-3, -4.5, 12.5, 6), oval(6, -10.5, 9, 8)), MOLE[1])
    // no neck: the head is under the same skin (its own layer repaints the face without a contour at the back)
    fill(l, head, headShape(), MOLE[1])
    tint(l, torso, union(oval(9, -7, 6.8, 9.5), oval(4, -1, 6.5, 3)), BELLY[1])
    smooth(l)
    cel(l, { shade: 3.4, deep: 1.2, rim: 1.4 })
    sheen(l, torso, oval(-8, -17.5, 4, 1.4))
    shadow(l, head.moved(0.5, 2), headShape())
  })
  leg(-0.5, 0.5, pose.footN, -4, [-4, -1], MOLE, PINK)

  // ---- bandana
  g.add(1, (l) => {
    neckerchief(l, neck, BANDANA_MOLE)
    shadow(l, head.moved(0.5, 1.5), headShape())
  })
  g.add(1.1, (l) => bandanaKnot(l, knot, 2))

  // ---- head and face
  const seat = head.child(-0.5 + pose.helmet[0], -10.4 - pose.helmet[1], pose.helmet[2])
  const worn = !pose.free
  moleFace(g, head, pose, worn ? seat : null, 2)

  // ---- the helmet on his head
  if (worn) helmet(g, seat, 3)

  // ---- near arm and paw, in front
  arm(4, shoulderN, pose.pawN, MOLE, true)
  paw(4.1, shoulderN, pose.pawN, CLAW)

  // ---- a helmet knocked off flies on its own
  if (pose.free) helmet(g, Frame.at(pose.free[0], pose.free[1], pose.free[2]), 6)
  return g.render()
}

/** The knocked-out sergeant on his back, designed for the ground rather than turned (CHARACTERS.md, lying poses). */
export interface LiePose extends Face {
  /** The body lifted off the ground (the bounce) and squashed (+ flatter and longer). */
  lift: number
  squash: number
  /** Head turn in degrees (clockwise; −90 points the snout at the sky). */
  tip: number
  /** Paws in screen space: wrist x, y, claw direction (degrees), spread 0..1. */
  pawN: MolePaw
  pawF: MolePaw
  /** Feet in the air: screen x, y and toe direction. */
  footN: MoleFoot
  footF: MoleFoot
  /** The helmet beside him: seat x, y and turn (180 = upside down). */
  helmet: readonly [number, number, number]
}

export function drawLying(p: LiePose): Raster {
  const g = new Painter(64, 64, { soft: true })
  const k = 1 + p.squash * 0.05
  const body = Frame.at(36, 50 - p.lift, 0, k, 1 / k)
  const head = Frame.at(...body.pt(-12, -6.5), p.tip)
  const id = Frame.at(0, 0)
  const hip = body.pt(11, -3)

  // ---- far paw flopped on the ground behind his head, far foot in the air
  digPaw(g, Frame.at(p.pawF[0], p.pawF[1], p.pawF[2]), p.pawF[3], CLAW_FAR, -4)
  g.add(-3.6, (l) => {
    const f = Frame.at(p.footF[0], p.footF[1], p.footF[2])
    fill(l, id, capsule(hip, f.pt(-0.3, -3.2), 4.6, 3.2), MOLE_FAR[1])
    smooth(l)
    cel(l, { shade: 1.6 })
  })
  moleFoot(g, Frame.at(p.footF[0], p.footF[1], p.footF[2]), PINK_FAR, -3.5)

  // ---- the barrel on its back, belly up, and the head under the same skin
  g.add(0, (l) => {
    fill(l, body, union(squircle(0, 0, 14, 8.6, 2.3), oval(-3, 1, 13, 7.5)), MOLE[1])
    fill(l, head, headShape(), MOLE[1])
    // the pale belly is the top of him now
    tint(l, body, oval(2, -5, 10.5, 5), BELLY[1])
    smooth(l)
    cel(l, { shade: 3.4, deep: 1.2, rim: 1.4 })
    shadow(l, head.moved(1, 1), headShape())
  })
  // ---- the near leg kicking up
  g.add(-0.5, (l) => {
    const f = Frame.at(p.footN[0], p.footN[1], p.footN[2])
    fill(l, id, capsule(body.pt(9, -4), f.pt(-0.3, -3.2), 5, 3.4), MOLE[1])
    smooth(l)
    cel(l, { shade: 2 })
  })
  moleFoot(g, Frame.at(p.footN[0], p.footN[1], p.footN[2]), PINK, 0.5)

  // ---- the neckerchief round his neck, its triangle lying on the belly
  g.add(1, (l) => neckerchief(l, body.child(-11, -2, -90), { ...BANDANA_MOLE, back: [-6, -1], front: [9, 0] }))

  moleFace(g, head, p, null, 2)

  // ---- near paw thrown up, limp
  const pn = Frame.at(p.pawN[0], p.pawN[1], p.pawN[2])
  g.add(3.9, (l) => {
    fill(l, id, capsule(body.pt(-6, -5), pn.pt(-3, 0.3), 4, 3.6), MOLE[1])
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
  })
  digPaw(g, pn, p.pawN[3], CLAW, 4)

  // ---- the helmet rocking on the ground beside him, below the belly and behind his feet
  helmet(g, Frame.at(p.helmet[0], p.helmet[1], p.helmet[2]), 0.3)
  return g.render()
}

// ------------------------------------------------------------------------------------------------------ clips

const frames = (n: number) => Array.from({ length: n }, (_, i) => i)

/** Standing guard: one heavy breath, the nose twitches twice, the claws flex once, the eyes shift under the brim. */
const idle = memo(() => {
  const N = 6
  const breath = frames(N).map((i) => 0.5 - 0.5 * Math.cos((i / N) * TAU))
  // whole-pixel steps, staggered: the chest rises first, the helmet rides up a frame later and comes down last
  const chest = [0, 1, 1, 1, 0, 0]
  const lid = [0, 0, 1, 1, 1, 0]
  const flex = [0, 0.4, 1, 0.8, 0.2, 0]
  return frames(N).map((i) =>
    drawMole(
      molePose({
        sink: -chest[i],
        squash: 0.4 - breath[i] * 0.9,
        helmet: [0, lid[i], 4 - lid[i] * 2],
        nose: [0, 1, 0, 0, 1, 0][i],
        look: [1, 1, -1, -1, 0, 1][i],
        pawN: [4, 6 - breath[i], 30 - flex[i] * 12, 0.2 + flex[i] * 0.8],
        pawF: [12, 3 - breath[i], 12 - flex[i] * 10, 0.2 + flex[i] * 0.8],
        scarf: [40 + Math.sin((i / N) * TAU) * 6, 6, 0.8, (i / N) * TAU]
      })
    )
  )
})

/**
 * The march's feet: each is down four frames (15 px of ground, the near one frames 0-3, the far one frames 4-7) and
 * swings forward in the four frames between. A foot down moves back 5 px a frame, as far as the body moves on. The
 * near foot plants behind the middle of the body, the far one ahead of it, under their own hips.
 */
const STRIDE = 40
const PATHS = [
  footPath(8, STRIDE, { land: 0, contact: 4, front: 1.5 }),
  footPath(8, STRIDE, { land: 4, contact: 4, front: 9 })
]
/** Where the middle of the sole lies from the foot's origin (the sole is ~9 px long). */
const SOLE_MID = 0.6

/** Foot of the march on frame `i`: forward, lift, toe-down tilt. `u` is the foot's seat in the rig. */
const stepFoot = (path: ReturnType<typeof footPath>, i: number, u: number): MoleFoot => {
  const st = path[i]
  const fwd = st.x - u - SOLE_MID
  if (st.down) return [fwd, 0, 0]
  const s = st.swing
  return [fwd, Math.max(3, 5.4 * Math.sin(Math.PI * s)), 26 * (1 - 2 * s) * (1 - s)]
}
/** Pelvis sink per half stride (+ down): lowest just after the stomp, highest at passing. */
const SINK = [1, 2, 1, 0]

/** The march: a stomping walk, the body sinking on every step and rocking, claws swinging, the helmet a beat late. */
const move = memo(() => {
  const N = 8
  const sink = frames(N).map((i) => SINK[i % 4])
  const late = lag(sink, { stiffness: 0.3, damping: 0.4, loop: true })
  const scarfLate = lag(sink, { stiffness: 0.25, damping: 0.35, loop: true })
  return frames(N).map((i) => {
    const a = (i / N) * TAU
    // the near foot is forward at frame 0: the near paw swings back, the far paw forward
    const swing = Math.cos(a)
    // the barrel rocks over the planted foot: onto the near leg (back) and the far leg (forward) in turn
    const rock = Math.sin(a + 0.6)
    return drawMole(
      molePose({
        sink: sink[i],
        lean: 3 + rock * 3,
        squash: sink[i] * 0.5,
        head: [0.5, 0],
        nod: -rock * 2,
        // the helmet stays up a beat when the body drops, then lands back on the head (never over the eyes)
        helmet: [0, Math.round(Math.max(0, late[i]) * 1.4), 4 + late[i] * 3],
        footN: stepFoot(PATHS[0], i, -4),
        footF: stepFoot(PATHS[1], i, 6),
        pawN: [4 - swing * 3, 3.5 + Math.abs(swing) * 0.5, 18 - swing * 14, 0.25],
        pawF: [10.5 + swing * 2, 3 + Math.abs(swing) * 0.5, 12 + swing * 10, 0.25],
        scarf: [30 - scarfLate[i] * 12, 6.5, 1.2, a * 2],
        look: 1,
        mouth: i % 4 === 1 ? 'grit' : 'grim'
      })
    )
  })
})

/** Paws flung up: the near one up and back past the head, the far one up behind the snout (never over the face). */
const FLUNG = { pawN: [-8, -9.5, -120, 1] as MolePaw, pawF: [8, -11, -60, 1] as MolePaw }

/** Bitten: the helmet jumps off his head and the claws fly up; then he clamps it back down, furious. */
const hurt = memo(() => [
  drawMole(
    molePose({
      x: -2,
      lean: -10,
      squash: -1.6,
      head: [-0.5, 0.5],
      nod: -6,
      helmet: [-1, 5, -12],
      ...FLUNG,
      footN: [1, 0, -10],
      footF: [2, 1, -16],
      scarf: [-10, 7, 1.4, 0],
      eyes: 'wide',
      brow: 'up',
      look: 0,
      mouth: 'open'
    })
  ),
  drawMole(
    molePose({
      x: -1,
      sink: 1,
      lean: 4,
      squash: 1.4,
      nod: 5,
      helmet: [0, 0, 2],
      // the near paw comes up over the back of his head and slaps the helmet down on its crown
      pawN: [-3.5, -23, 28, 0.7],
      pawF: [11, 2, 0, 0],
      scarf: [30, 7, 1.2, 2],
      eyes: 'glare',
      brow: 'furious',
      mouth: 'grit'
    })
  )
])

/** The lying pose: on his back, head on the ground at the left, belly up, feet and one paw in the air. */
const lie = (p: Partial<LiePose> = {}): LiePose => ({
  lift: 0,
  squash: 0,
  tip: -150,
  pawN: [31, 31, -80, 1],
  pawF: [45, 33, -40, 0.8],
  footN: [52, 40, -70],
  footF: [56, 44, -45],
  helmet: [49, 49, 180],
  eyes: 'dizzy',
  brow: 'up',
  look: 0,
  mouth: 'open',
  nose: 0,
  ...p
})

/** Knocked out: the helmet flies off, he topples back stiff as a plank, lands on his back, bounces, lies dizzy. */
const defeat = memo(() => {
  const out = (p: Partial<MolePose>) => molePose({ planted: false, eyes: 'hurt', mouth: 'open', ...FLUNG, ...p })
  return [
    drawMole(
      out({ x: -2, lean: -14, squash: -1.6, head: [-1, 1], nod: -10, free: [35, 17, -25], scarf: [-10, 7, 1.4, 0] })
    ),
    drawMole(
      out({
        x: -2,
        y: 1,
        spin: -30,
        free: [45, 14, 60],
        pawN: [-10, -3, -170, 1],
        pawF: [12, -4, -10, 1],
        scarf: [0, 7, 1.4, 1]
      })
    ),
    drawMole(
      out({
        x: -1,
        y: 1,
        spin: -62,
        free: [50, 15, 125],
        pawN: [-10, -1, 170, 1],
        pawF: [12, -2, 10, 1],
        eyes: 'dizzy',
        scarf: [20, 7, 1.4, 2]
      })
    ),
    drawLying(
      lie({
        squash: 1.6,
        helmet: [47, 27, 150],
        eyes: 'hurt',
        pawN: [33, 35, -60, 1],
        footN: [52, 44, -40],
        footF: [56, 47, -20]
      })
    ),
    drawLying(lie({ lift: 3, squash: -1, helmet: [49, 49, 193] })),
    drawLying(lie({ mouth: 'tongue', helmet: [49, 49, 173], pawN: [34, 34, -40, 0.5] }))
  ]
})

export const toughSheet = () => ({
  idle: lazyAnim(idle, 8, true),
  move: lazyAnim(move, 10, true),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})

/** Where the feet of the mole's walk are on the ground (`tests/art-footfall.test.ts`). */
export const footfalls: FootfallModule = { tough: { move: footfall(5, ...PATHS) } }
