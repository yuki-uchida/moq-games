/**
 * リス団員 (`spitter`): a chubby, greedy red squirrel of the ばくろ団 who sits on his haunches and spits acorns.
 * Signature shapes: the huge bushy question-mark tail rising behind him above his ears and curling forward, and the
 * stuffed cream cheek pouches low on the jaw (the eyes stay clear above them, the muzzle with its nose and two big
 * front teeth sits between them). Tufted pointed ears, a small body with a cream belly, short arms holding an acorn
 * against the chest, big hind feet, the gang's red neckerchief knotted at the back. 64×64 cell, feet on (32, 60),
 * 46×42 box.
 *
 * Depth (back to front): far ear, tail, far bandana tail, far arm + paw, far foot, far shank, body, near shank,
 * near foot, near bandana tail, bandana, knot, far cheek, near ear, head + eyes, near cheek, muzzle, mouth and
 * nose, acorn, near arm + paw, spit puff.
 */
import { C, R, ramp } from '../../palette'
import { clamp, ease, lag, track, type Key } from '../../motion'
import { Painter, Raster, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  cel,
  egg,
  fill,
  joint,
  mantle,
  oval,
  polygon,
  ribbon,
  shadow,
  sheen,
  smooth,
  spline,
  squircle,
  stampAt,
  tint,
  union,
  within
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'
import { BANDANA_FIT, bandanaKnot, bandanaTail, neckerchief } from './kit'

const SQ = R.squirrelRed
const SQ_FAR = farRamp(SQ)
/** The darker coat on the back, the crown and the upper side of the tail (shades along the red's own steps). */
export const SQUIRREL_MANTLE = ramp('#e07650', '#b34a3a', '#8c3332', '#5e2129', '#3a1a22')
const MANTLE = SQUIRREL_MANTLE
const CREAM = R.cream
const CREAM_FAR = farRamp(CREAM)
const WOOD = R.wood
const BARK = R.bark
/** The neckerchief sits a little higher at the back, so the knot rests on his round shoulders. */
const FIT = { ...BANDANA_FIT, back: [-5, -3.5] as Pt, tip: [3.5, 6] as Pt }

export type SquirrelEyes = 'smug' | 'open' | 'puffed' | 'wide' | 'hurt' | 'dizzy'
export type SquirrelBrow = 'mean' | 'up' | 'none'
export type SquirrelMouth = 'smirk' | 'chew' | 'shut' | 'o' | 'open' | 'tongue'
/** Where the acorn is: held against the chest, stuffed in the mouth, flying out of the paws, or gone. */
export type AcornAt = 'paws' | 'mouth' | 'flying' | 'none'
/** A paw relative to its shoulder, in torso units (u forward, v down). */
export type Hand = readonly [number, number]
/** A foot: forward (px), lift (px), toe-down tilt (degrees). */
export type Foot = readonly [number, number, number]

export interface SquirrelPose {
  /** Whole figure forward (+) and up (+). */
  x: number
  y: number
  /** Body lean in degrees (forward +) and squash (+ wider and shorter, − taller). */
  lean: number
  squash: number
  /** The whole rig turned clockwise around the middle of the body (tumbles; negative tips him backwards). */
  spin: number
  /** Feet stand on the ground row (false: they travel with the body). */
  planted: boolean
  /** Head offset from its seat (forward, up) and nod in degrees (down +). */
  head: readonly [number, number]
  nod: number
  /** Cheek pouches: 0 empty and slack, 1 stuffed, 1.6 enormous. */
  cheekN: number
  cheekF: number
  /** Cheeks shifted up (−) or down (+) in pixels: the chewing jaw. */
  chew: number
  /** Ears: turn in degrees (back +). */
  earN: number
  earF: number
  armN: Hand
  armF: Hand
  acorn: AcornAt
  /** The held acorn's turn in degrees. */
  acornTurn: number
  footN: Foot
  footF: Foot
  /** Tail: turn in degrees (+ forward), curl (1 = the question mark, 0 = straight, 1.4 coiled), flick of the tip, length scale. */
  tail: readonly [number, number, number, number]
  /** Bandana tails: angle (0 = back, 90 = down), length, ripple, phase. */
  scarf: readonly [number, number, number, number]
  eyes: SquirrelEyes
  /** Pupils: −1 looking back … 1 looking ahead. */
  look: number
  brow: SquirrelBrow
  mouth: SquirrelMouth
  /** A puff of breath at the lips (the spit). */
  puff: boolean
}

export const squirrelPose = (p: Partial<SquirrelPose> = {}): SquirrelPose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  spin: 0,
  planted: true,
  head: [0, 0],
  nod: 0,
  cheekN: 1,
  cheekF: 1,
  chew: 0,
  earN: 0,
  earF: 0,
  armN: [5, 5.5],
  armF: [6, 3.5],
  acorn: 'paws',
  acornTurn: 0,
  footN: [0, 0, 0],
  footF: [0, 0, 0],
  tail: [0, 1, 0, 1],
  scarf: [70, 7, 0.8, 0],
  eyes: 'smug',
  look: 1,
  brow: 'mean',
  mouth: 'smirk',
  puff: false,
  ...p
})

// ------------------------------------------------------------------------------------------------- face stamps

const FACE_KEY = {
  K: C.inkWarm,
  w: C.white,
  o: C.black,
  n: C.black,
  m: C.mouth,
  t: C.tongue,
  L: CREAM[3],
  h: CREAM[0]
}

/** Eyes: [near, far]. `w` is the white; the pupil (2 wide) is placed into the white rows by `look`. */
const EYES: Record<SquirrelEyes, readonly [readonly string[], readonly string[]]> = {
  smug: [
    ['KKKKKK', 'KwwwwK', 'KwwwwK', '.KKKK.'],
    ['KKKKK', 'KwwwK', 'KwwwK', '.KKK.']
  ],
  open: [
    ['.KKKK.', 'KwwwwK', 'KwwwwK', 'KwwwwK', '.KKKK.'],
    ['.KKK.', 'KwwwK', 'KwwwK', 'KwwwK', '.KKK.']
  ],
  puffed: [
    ['KKKKKK', 'KwwwwK', '.KKKK.'],
    ['KKKKK', 'KwwwK', '.KKK.']
  ],
  wide: [
    ['.KKKK.', 'KwwwwK', 'KwwwwK', 'KwwwwK', 'KwwwwK', '.KKKK.'],
    ['.KKK.', 'KwwwK', 'KwwwK', 'KwwwK', 'KwwwK', '.KKK.']
  ],
  hurt: [
    ['KK....', 'KKKK..', '..KKKK', 'KKKK..', 'KK....'],
    ['...KK', '.KKKK', 'KKK..', '.KKKK', '...KK']
  ],
  dizzy: [
    ['.KKKK.', 'KwwwwK', 'KwKKwK', 'KwKwwK', 'KwwKKK', '.KKKK.'],
    ['.KKK.', 'KwwwK', 'KwKwK', 'KwwKK', '.KKK.']
  ]
}

/** Puts a 2-wide pupil into the white of an eye, `look` −1 (back) … 1 (ahead); `rows` limits it to the top rows. */
function withPupil(rows: readonly string[], look: number, tall = 2): string[] {
  const whiteRows = rows.map((r, j) => (r.includes('w') ? j : -1)).filter((j) => j >= 0)
  if (!whiteRows.length) return [...rows]
  const first = rows[whiteRows[0]]
  const x0 = first.indexOf('w')
  const x1 = first.lastIndexOf('w')
  const px = Math.round(x0 + ((clamp(look, -1, 1) + 1) / 2) * (x1 - x0 - 1))
  const lo = whiteRows[Math.max(0, whiteRows.length - tall - (whiteRows.length > 3 ? 1 : 0))]
  return rows.map((r, j) =>
    j >= lo && j < lo + tall
      ? r
          .split('')
          .map((ch, i) => (ch === 'w' && i >= px && i < px + 2 ? 'o' : ch))
          .join('')
      : r
  )
}

const BROWS: Record<Exclude<SquirrelBrow, 'none'>, readonly [readonly string[], readonly string[]]> = {
  mean: [
    ['KKK...', '..KKKK'],
    ['..KK', 'KKK.']
  ],
  up: [
    ['..KK..', 'KK..KK'],
    ['.KK.', 'K..K']
  ]
}

const MOUTHS: Record<SquirrelMouth, readonly string[]> = {
  smirk: ['KK....', '.KKKKK', '..KwwK', '..KwwK', '...KK.'],
  chew: ['......', '.KKKKK', '..KwwK', '...KK.'],
  shut: ['.KKKKK', '..KwwK', '...KK.'],
  o: ['.LLL.', 'LKKKL', 'LKmKL', 'LKKKL', '.LLL.'],
  open: ['KKKKKK', 'KwwmwK', 'KmmmmK', '.KKKK.'],
  tongue: ['KKKKK', 'KwwmK', 'KmmmK', '.ttK.', '.tt..']
}

const NOSE = ['hnn', 'nnn', '.n.']

/** The ear tuft: three chunky locks sweeping back off the ear tip (its bottom rows sink into the ear). */
const TUFT = ['P.....', 'PP..P.', '.PPPP.', '.PPPPP', '..PPPP']

// ------------------------------------------------------------------------------------------------- drawing

/** Height of the tumble pivot above the feet (the middle of the sitting body). */
const PIV = 18

/** The skull and the round jaw: one silhouette in the head frame (origin at the skull's centre, snout to +u). */
const skullShape = () => union(squircle(0, -0.5, 10, 8.6, 2.4), oval(0.5, 3, 9.6, 5.4))

/** The cheek pouches in the head frame: the near one low and back, the far one bulging past the muzzle. */
const cheekNShape = (c: number, chew: number) => oval(-2.5 - c * 0.8, 6.2 + chew, 2.4 + c * 2.8, 2.2 + c * 2.6)
const cheekFShape = (c: number, chew: number) => oval(10.8 + c * 0.8, 6 - chew * 0.5, 2 + c * 2.2, 2 + c * 2.2)

/** The tail's bones: segment lengths and how much each one bends clockwise at curl 1 (the question mark). */
const TAIL_SEG = [6, 8, 11, 11, 7, 6, 5]
const TAIL_BEND = [15, 15, 10, 25, 60, 70, 70]
const TAIL_FLICK = [0, 0, 0, 0, 10, 22, 30]
/** Width of the tail along its length (0 root … 1 tip). */
const tailWidth = (t: number) =>
  t < 0.45 ? 5 + 7 * Math.sin((t / 0.45) * (Math.PI / 2)) : 12 - 5 * ((t - 0.45) / 0.55) ** 1.4

/** The spine of the tail on screen, from its root, starting `start` degrees on screen (0 right, 90 down). */
function tailSpine(root: Pt, start: number, curl: number, flick: number, len: number): { path: Pt[]; dirs: number[] } {
  let a = start
  const pts: Pt[] = [root]
  for (let i = 0; i < TAIL_SEG.length; i++) {
    a += TAIL_BEND[i] * curl + TAIL_FLICK[i] * flick
    const r = (a * Math.PI) / 180
    const [x, y] = pts[pts.length - 1]
    pts.push([x + Math.cos(r) * TAIL_SEG[i] * len, y + Math.sin(r) * TAIL_SEG[i] * len])
  }
  const path = spline(pts)
  const dirs = path.map((p, i) => {
    const q = path[Math.min(path.length - 1, i + 1)]
    const o = path[Math.max(0, i - 1)]
    return Math.atan2(q[1] - o[1], q[0] - o[0])
  })
  return { path, dirs }
}

/** The bushy tail: a ribbon with a toothed outer edge, a pale underside, a dark upper side and a fur-cut shadow. */
function drawTail(l: Raster, root: Pt, start: number, p: SquirrelPose) {
  const [, curl, flick, len] = p.tail
  const { path, dirs } = tailSpine(root, start, curl, flick, len)
  const n = path.length
  const lengths = [0]
  for (let i = 1; i < n; i++)
    lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  const total = lengths[n - 1] || 1
  const at = (i: number) => lengths[i] / total
  ribbon(l, path, (t) => tailWidth(t) * len ** 0.5, SQ[1])
  // fur locks on the outer edge (left of travel), sweeping toward the tip; a few smaller on the inner edge
  const id = Frame.at(0, 0)
  let next = total * 0.16
  for (let i = 0; i < n; i++) {
    if (lengths[i] < next) continue
    next += 4.6 * len
    const t = at(i)
    if (t > 0.94) break
    const w = (tailWidth(t) * len ** 0.5) / 2
    const [x, y] = path[i]
    const dx = Math.cos(dirs[i])
    const dy = Math.sin(dirs[i])
    const ox = dy
    const oy = -dx
    fill(
      l,
      id,
      polygon([
        [x + ox * (w - 1.6) - dx * 2, y + oy * (w - 1.6) - dy * 2],
        [x + ox * (w - 1.6) + dx * 1.6, y + oy * (w - 1.6) + dy * 1.6],
        [x + ox * (w + 1.1) + dx * 2.2, y + oy * (w + 1.1) + dy * 2.2]
      ]),
      SQ[1]
    )
    if (t > 0.3 && t < 0.8)
      fill(
        l,
        id,
        polygon([
          [x - ox * (w - 1.4) - dx * 1.6, y - oy * (w - 1.4) - dy * 1.6],
          [x - ox * (w - 1.4) + dx * 1.4, y - oy * (w - 1.4) + dy * 1.4],
          [x - ox * (w + 1) + dx * 2.2, y - oy * (w + 1) + dy * 2.2]
        ]),
        SQ[1]
      )
  }
  // the tip: a soft brush of fur
  const tip = path[n - 1]
  const td = dirs[n - 1]
  fill(l, id, capsule(tip, [tip[0] + Math.cos(td) * 2.5, tip[1] + Math.sin(td) * 2.5], 2.6 * len ** 0.5, 1.2), SQ[1])
  smooth(l)
  // the pale underside along the inner edge
  within(l, (m) => {
    const inner = path.map(([x, y], i): Pt => {
      const w = (tailWidth(at(i)) * len ** 0.5) / 2
      return [x - Math.sin(dirs[i]) * w * 0.95, y + Math.cos(dirs[i]) * w * 0.95]
    })
    ribbon(
      m,
      inner.slice(Math.floor(n * 0.08), Math.floor(n * 0.8)),
      (t) => 1 + tailWidth(0.08 + t * 0.72) * 0.4 * len ** 0.5,
      CREAM[1]
    )
  })
  const origin = root
  mantle(l, SQ[1], MANTLE[1], { depth: 5.5, tooth: 2.5, pitch: 4, origin })
  cel(l, { shade: 3, deep: 1.2, tooth: 2, pitch: 4, origin })
}

/** The acorn (colours of `prop:seed`): a nut under a hatched cap with a stalk, turned by `deg`. */
function drawAcorn(l: Raster, at: Pt, deg: number) {
  const f = Frame.at(at[0], at[1], deg)
  fill(l, f, egg(0, 1, 3, 1.6, 3.4), WOOD[1])
  fill(l, f, union(oval(0, -1, 3.5, 2), capsule([0.4, -2.8], [1.2, -4], 0.7)), BARK[2])
  cel(l, { shade: 1, rim: 1 })
  within(l, (m) => stampAt(m, f, ['.d.', 'd.d'], 0, -0.4, { d: BARK[3] }), true)
}

export function drawSquirrel(p: SquirrelPose): Raster {
  const g = new Painter(64, 64, { soft: true })
  const k = 1 + p.squash * 0.05
  const center = Frame.at(31 + p.x, 60 - PIV - p.y, p.spin)
  const base = p.planted && p.spin === 0 ? Frame.at(31 + p.x, 60) : center.child(0, PIV)
  const root = center.child(-1, PIV - 8)
  const torso = root.child(0, 0, p.lean, k, 1 / k)
  const [hx, hy] = torso.pt(3.5 + p.head[0], -22 - p.head[1])
  const head = Frame.at(Math.round(hx), Math.round(hy), p.spin + p.lean * 0.4 + p.nod)
  const neck = torso.child(3, -13.5, -8)
  const knot = neck.pt(...FIT.back)

  // ---- far ear
  const earF = head.child(4, -6.5, 14 + p.earF)
  g.add(-6, (l) => {
    fill(l, earF, egg(0, -3, 3, 4.8, 2.6), SQ_FAR[1])
    stampAt(l, earF, TUFT, 0.5, -8, { P: SQ_FAR[1] })
    tint(l, earF, egg(0.4, -2.4, 1.5, 3, 1.6), CREAM_FAR[1])
    smooth(l)
    cel(l, { shade: 1.4 })
  })

  // ---- the tail, rising behind him
  const tailRoot = torso.pt(-7, -3.5)
  g.add(-5, (l) => drawTail(l, tailRoot, 212 + p.spin + p.lean * 0.5 + p.tail[0], p))

  // ---- far bandana tail
  g.add(-4.5, (l) =>
    bandanaTail(l, knot, p.scarf[0] + 18 - p.spin, p.scarf[1] * 0.8, p.scarf[2], p.scarf[3] + 1.6, true)
  )

  // ---- arms
  const shoulderN: Pt = [1.5, -11.5]
  const shoulderF: Pt = [4.5, -12]
  const handAt = (s: Pt, h: Hand): Pt => [s[0] + h[0], s[1] + h[1]]
  const arm = (l: Raster, s: Pt, hand: Hand, fur: Ramp, near: boolean) => {
    const a = torso.pt(...s)
    const h = torso.pt(...handAt(s, hand))
    const { mid, end } = joint(a, h, 3.6, 3.6, 1)
    const id = Frame.at(0, 0)
    fill(l, id, union(capsule(a, mid, near ? 2.4 : 2.1, 1.9), capsule(mid, end, 1.9, 1.6)), fur[1])
    // the paw: a small mitten with a thumb
    fill(l, id, union(oval(end[0] + 0.4, end[1], 2, 1.8), oval(end[0] + 1.6, end[1] - 0.6, 1.1, 1)), fur[1])
    smooth(l)
    cel(l, { shade: 1.2 })
    if (near) {
      const [px, py] = [end[0] + 1.2, end[1] + 0.6]
      l.set(Math.round(px), Math.round(py), fur[2])
    }
  }
  g.add(-3.6, (l) => arm(l, shoulderF, p.armF, SQ_FAR, false))

  // ---- legs: big hind feet on the ground, the shank from the haunch
  const footFrame = (at: Foot, u: number) => base.child(u + at[0], -at[1], at[2])
  const foot = (l: Raster, at: Foot, u: number, fur: Ramp) => {
    const f = footFrame(at, u)
    fill(l, f, union(oval(2.6, -1.8, 5.8, 1.9), oval(-1.6, -2.2, 2.6, 2.2), oval(6.6, -1.6, 1.8, 1.6)), fur[1])
    smooth(l)
    cel(l, { shade: 1.1 })
  }
  const shank = (l: Raster, at: Foot, u: number, hip: Pt, fur: Ramp) => {
    const a = torso.pt(...hip)
    const b = footFrame(at, u).pt(-1, -2.4)
    fill(l, Frame.at(0, 0), capsule(a, b, 3.2, 2.4), fur[1])
    cel(l, { shade: 1.3 })
  }
  g.add(-3.4, (l) => foot(l, p.footF, 4.5, SQ_FAR))
  g.add(-3.3, (l) => shank(l, p.footF, 4.5, [1.5, 1], SQ_FAR))

  // ---- body: belly, chest and the near haunch under one skin
  g.add(0, (l) => {
    fill(l, torso, union(egg(1.5, -7.5, 9.4, 8.5, 7.5), oval(-1.5, -0.5, 8.6, 6), oval(1.5, -13, 6.5, 4.5)), SQ[1])
    tint(l, torso, egg(5.6, -5.5, 5.6, 8.5, 6.5), CREAM[1])
    smooth(l)
    mantle(l, SQ[1], MANTLE[1], { depth: 3, tooth: 2, pitch: 4, origin: root.pt(0, 0) })
    cel(l, { shade: 2.6, deep: 0.8, tooth: 1.5, pitch: 4, origin: root.pt(0, 0) })
    shadow(l, head.moved(0.5, 2), skullShape())
  })
  g.add(0.4, (l) => foot(l, p.footN, 0.5, SQ))
  if (p.planted && p.spin === 0)
    // sitting: the big round thigh over the heel
    g.add(0.5, (l) => {
      fill(l, torso, egg(-0.5, -2.2, 6.2, 5.6, 4.6), SQ[1])
      mantle(l, SQ[1], MANTLE[1], { depth: 1.5, tooth: 1.5, pitch: 4, origin: root.pt(0, 0) })
      cel(l, { shade: 2, tooth: 1, pitch: 4, origin: root.pt(0, 0) })
    })
  else g.add(0.5, (l) => shank(l, p.footN, 0.5, [-1, 0], SQ))

  // ---- bandana
  g.add(0.7, (l) => bandanaTail(l, knot, p.scarf[0] - p.spin, p.scarf[1], p.scarf[2], p.scarf[3]))
  g.add(1, (l) => {
    neckerchief(l, neck, FIT)
    shadow(l, head.moved(0.5, 1.5), skullShape())
  })
  g.add(1.1, (l) => bandanaKnot(l, knot))

  // ---- far cheek, near ear, head
  g.add(1.8, (l) => {
    fill(l, head, cheekFShape(p.cheekF, p.chew), CREAM[1])
    cel(l, { shade: 1.8 })
  })
  const earN = head.child(-4.5, -6.5, -4 + p.earN)
  g.add(1.9, (l) => {
    fill(l, earN, egg(0, -3.2, 3.4, 5.4, 2.8), SQ[1])
    stampAt(l, earN, TUFT, 0.5, -8.6, { P: MANTLE[1] })
    tint(l, earN, egg(0.5, -2.6, 1.8, 3.4, 1.8), CREAM[1])
    smooth(l)
    cel(l, { shade: 1.6, rim: 1 })
  })
  g.add(2, (l) => {
    fill(l, head, skullShape(), SQ[1])
    smooth(l)
    mantle(l, SQ[1], MANTLE[1], { depth: 2.5, tooth: 1.5, pitch: 4, origin: head.pt(0, 0) })
    cel(l, { shade: 2.8, deep: 1, origin: head.pt(0, 0) })
    // the pouches throw a soft shadow on the jaw
    shadow(l, head.moved(1, 1.5), union(cheekNShape(p.cheekN, p.chew), cheekFShape(p.cheekF, p.chew)))
    sheen(l, head, oval(-3, -6.5, 2.6, 1.2))
    const [nearEye, farEye] = EYES[p.eyes]
    const pupils = p.eyes !== 'hurt' && p.eyes !== 'dizzy'
    const tall = p.eyes === 'puffed' ? 1 : 2
    within(l, (m) => {
      stampAt(m, head, pupils ? withPupil(nearEye, p.look, tall) : nearEye, 1, -2.5, FACE_KEY)
      stampAt(m, head, pupils ? withPupil(farEye, p.look, tall) : farEye, 7, -3, FACE_KEY)
      if (p.brow !== 'none') {
        const [bn, bf] = BROWS[p.brow]
        stampAt(m, head, bn, 0.5, -6.5, FACE_KEY)
        stampAt(m, head, bf, 7.5, -6.5, FACE_KEY)
      }
    })
  })

  // ---- near cheek and the muzzle between the pouches
  g.add(2.3, (l) => {
    fill(l, head, cheekNShape(p.cheekN, p.chew), CREAM[1])
    cel(l, { shade: 2.2, deep: 0.8 })
    if (p.cheekN > 0.5) within(l, (m) => fill(m, head, oval(-2.5 - p.cheekN, 3.6 + p.chew, 1.6, 1), CREAM[0]), true)
  })
  const lips = p.mouth === 'o' ? 1.5 : 0
  g.add(2.5, (l) => {
    fill(l, head, oval(7.5 + lips, 2.4 + lips * 0.8, 3.2 + lips * 0.6, 2.2 + lips * 0.8), CREAM[1])
    cel(l, { shade: 1.2 })
  })
  g.add(
    2.6,
    (l) => {
      stampAt(l, head, NOSE, 10 + lips, 1, FACE_KEY)
      const m = MOUTHS[p.mouth]
      stampAt(l, head, m, p.mouth === 'o' ? 11 : 7, p.mouth === 'o' ? 4.6 : 3.8 + m.length / 2, FACE_KEY)
    },
    false
  )

  // ---- the acorn and the near arm
  if (p.acorn !== 'none') {
    const spot: Pt = p.acorn === 'paws' ? torso.pt(10, -9.5) : p.acorn === 'mouth' ? head.pt(9.5, 6) : head.pt(5, -15)
    g.add(p.acorn === 'mouth' ? 2.7 : 3.1, (l) => drawAcorn(l, spot, p.acornTurn - (p.acorn === 'flying' ? 60 : 0)))
  }
  g.add(3, (l) => arm(l, shoulderN, p.armN, SQ, true))

  // ---- the spit: a puff of breath at the lips
  if (p.puff)
    g.add(3.2, (l) => {
      const [x, y] = head.pt(14.5, 4.6)
      fill(
        l,
        Frame.at(x, y),
        union(oval(0, 0, 1.8, 1.7), oval(2.2, -1.4, 1.5, 1.4), oval(2.4, 1.4, 1.5, 1.3)),
        CREAM[1]
      )
      cel(l, { shade: 1 })
    })
  return g.render()
}

// ------------------------------------------------------------------------------------------------- clips

const sample = (keys: readonly Key<SquirrelPose>[], n: number, period?: number) => {
  const at = track(squirrelPose(), keys, period)
  return Array.from({ length: n }, (_, i) => at(i))
}

/** Chewing, smug: the pouches work in turn, the acorn turns in his paws, a glance at the hero, one flick of the tail. */
const idle = memo(() => {
  const N = 6
  const chewN = [1.05, 1.2, 1.0, 0.92, 1.15, 0.98]
  const chewF = [1.0, 0.9, 1.12, 1.05, 0.92, 1.1]
  const flick = [0, 0, 0, 1, 0.3, 0]
  const late = lag(flick, { stiffness: 0.45, damping: 0.4, loop: true })
  return Array.from({ length: N }, (_, i) =>
    drawSquirrel(
      squirrelPose({
        squash: [0, 0.4, 0.2, -0.2, 0.3, 0][i],
        head: [0, [0, 0, 1, 1, 0, 0][i]],
        cheekN: chewN[i],
        cheekF: chewF[i],
        chew: [0, 1, 0, -1, 1, 0][i] * 0.5,
        mouth: i % 2 ? 'chew' : 'smirk',
        eyes: i === 2 || i === 3 ? 'open' : 'smug',
        look: [0, 0, 1, 1, 0, -0.4][i],
        brow: i === 2 || i === 3 ? 'none' : 'mean',
        acornTurn: [0, 8, 16, 8, -8, -14][i],
        armN: [5, 5.5 - [0, 0.5, 1, 0.5, 0, 0][i]],
        armF: [6, 3.5 - [0, 0.5, 1, 0.5, 0, 0][i]],
        earN: late[i] * 10,
        earF: late[i] * 6,
        tail: [flick[i] * -4, 1 - late[i] * 0.1, flick[i] - late[i] * 0.6, 1],
        scarf: [70 + Math.sin((i / N) * Math.PI * 2) * 6, 7, 0.8, (i / N) * Math.PI * 2]
      })
    )
  )
})

/** Stuff, wind-up, snap, SPIT (frame 3), recoil, settle with a new acorn. */
const shoot = memo(() => {
  const poses = sample(
    [
      {
        at: 0,
        pose: {
          lean: -3,
          armN: [5, -3],
          armF: [5, -4],
          acorn: 'mouth',
          cheekN: 1.25,
          cheekF: 1.2,
          eyes: 'smug',
          mouth: 'shut',
          tail: [0, 1.05, 0, 1]
        }
      },
      {
        at: 1,
        pose: {
          x: -2,
          lean: -14,
          squash: -1,
          head: [-1.5, 1],
          nod: -10,
          armN: [2, 3],
          armF: [1.5, 2.5],
          acorn: 'none',
          cheekN: 1.6,
          cheekF: 1.6,
          eyes: 'puffed',
          mouth: 'shut',
          earN: 14,
          earF: 10,
          tail: [-14, 1.45, 0.3, 0.95]
        },
        ease: ease.out
      },
      {
        at: 2,
        pose: {
          x: 0,
          lean: 6,
          squash: 0.5,
          head: [2, 0],
          nod: 1,
          cheekN: 1.25,
          cheekF: 1.25,
          earN: 20,
          earF: 14,
          tail: [-6, 1.1, 0, 1]
        },
        ease: ease.in
      },
      {
        at: 3,
        pose: {
          x: 1,
          lean: 16,
          squash: 0.8,
          head: [4, 0],
          nod: -5,
          armN: [-1, 3],
          armF: [-1.5, 2.5],
          cheekN: 0.1,
          cheekF: 0.1,
          eyes: 'wide',
          brow: 'up',
          mouth: 'o',
          puff: true,
          earN: 24,
          earF: 18,
          tail: [10, 0.5, 0, 0.95]
        },
        ease: ease.snap
      },
      {
        at: 4,
        pose: {
          x: 0,
          lean: -5,
          squash: -0.4,
          head: [-1, 0],
          nod: -3,
          armN: [3, 4],
          armF: [2.5, 3.5],
          cheekN: 0.25,
          cheekF: 0.25,
          eyes: 'open',
          brow: 'none',
          mouth: 'open',
          puff: false,
          earN: -6,
          earF: -4,
          tail: [4, 1.2, 0.4, 1]
        },
        ease: ease.out
      },
      {
        at: 5,
        pose: {
          x: 0,
          lean: 0,
          squash: 0,
          head: [0, 0],
          nod: 0,
          armN: [5, 5.5],
          armF: [6, 3.5],
          acorn: 'paws',
          cheekN: 0.8,
          cheekF: 0.8,
          eyes: 'smug',
          brow: 'mean',
          mouth: 'smirk',
          earN: 2,
          earF: 1,
          tail: [2, 1.05, 0.1, 1]
        },
        ease: ease.out
      }
    ],
    6
  )
  return poses.map(drawSquirrel)
})

/** Bitten: the cheeks jolt, eyes > <, the acorn flies from his paws; then the recoil. */
const hurt = memo(() =>
  [
    squirrelPose({
      x: -2,
      lean: -14,
      squash: -1.4,
      head: [-1, 1],
      nod: -12,
      armN: [8.5, 0.5],
      armF: [9, -1],
      acorn: 'flying',
      cheekN: 1.35,
      cheekF: 1.3,
      chew: -1,
      eyes: 'hurt',
      brow: 'up',
      mouth: 'open',
      earN: 22,
      earF: 16,
      tail: [14, 0.6, 0, 0.85],
      scarf: [30, 7, 1.2, 1]
    }),
    squirrelPose({
      x: -1,
      lean: 6,
      squash: 1.2,
      head: [0, 0],
      nod: 6,
      armN: [4, 3],
      armF: [3.5, 2.5],
      acorn: 'none',
      cheekN: 0.95,
      cheekF: 0.9,
      chew: 0.5,
      eyes: 'hurt',
      brow: 'up',
      mouth: 'shut',
      earN: 6,
      earF: 4,
      tail: [2, 1.15, 0.4, 1],
      scarf: [80, 7, 1, 2]
    })
  ].map(drawSquirrel)
)

/** Knocked out: the blow, three frames flung back turning (the tail trailing), landing on his back, limp. */
const defeat = memo(() => {
  const air = (p: Partial<SquirrelPose>) =>
    squirrelPose({
      planted: false,
      eyes: 'hurt',
      brow: 'up',
      mouth: 'open',
      acorn: 'none',
      cheekN: 0.4,
      cheekF: 0.4,
      ...p
    })
  /** On his back: belly up, feet in the air, the tail flopped along the ground with its tip curling up. */
  const lie = (p: Partial<SquirrelPose>) =>
    air({
      x: -2,
      y: -7,
      spin: -90,
      eyes: 'dizzy',
      head: [-1, 0],
      cheekN: 0.1,
      cheekF: 0.1,
      ...p
    })
  return [
    // the blow: stretched, thrown back, the acorn flying, the tail flung forward
    air({
      x: -2,
      y: 3,
      lean: -18,
      squash: -1.6,
      head: [-1, 1],
      nod: -12,
      armN: [1, -7],
      armF: [3, -7],
      footN: [5, 2, -30],
      footF: [7, 3, -36],
      acorn: 'flying',
      cheekN: 0.7,
      cheekF: 0.7,
      earN: 26,
      earF: 20,
      tail: [48, 0.3, 0, 0.8],
      scarf: [20, 7, 1.2, 0]
    }),
    // flung back head over heels: the rig turns, the tail trails the turn
    air({
      x: 1,
      y: 3,
      spin: -110,
      armN: [-2, -7],
      armF: [5, -6],
      footN: [7, 5, -40],
      footF: [2, 6, 20],
      earN: 30,
      earF: 24,
      tail: [150, 0.4, 0, 0.85],
      scarf: [-20, 7, 1.4, 1]
    }),
    air({
      x: -3,
      y: 9,
      spin: -215,
      eyes: 'dizzy',
      armN: [5, -5],
      armF: [0, -7],
      footN: [-2, 6, 30],
      footF: [7, 5, -40],
      earN: 26,
      earF: 20,
      tail: [345, 0.4, 0, 0.55],
      scarf: [10, 7, 1.4, 2]
    }),
    air({
      x: -2,
      y: 2,
      spin: -305,
      eyes: 'dizzy',
      armN: [3, -7],
      armF: [6, -3],
      footN: [7, 5, -40],
      footF: [-1, 6, 20],
      earN: 30,
      earF: 24,
      tail: [5, 0.45, 0, 0.8],
      scarf: [30, 7, 1.4, 3]
    }),
    // on his back with a bounce, then limp
    lie({
      y: -6,
      squash: 1.5,
      eyes: 'hurt',
      nod: 30,
      armN: [6, -5],
      armF: [3, -6],
      footN: [8, 8, -60],
      footF: [11, 5, -50],
      earN: 20,
      earF: 16,
      tail: [-110, -0.4, 0, 0.45],
      scarf: [60, 6, 1, 4]
    }),
    lie({
      squash: 0,
      mouth: 'tongue',
      brow: 'none',
      nod: 38,
      armN: [6, 1],
      armF: [4, 0],
      footN: [8, 6, -45],
      footF: [11, 3, -60],
      earN: 34,
      earF: 30,
      tail: [-120, -0.5, 0, 0.5],
      scarf: [80, 6, 0.6, 5]
    })
  ].map(drawSquirrel)
})

export const spitterSheet = () => ({
  idle: lazyAnim(idle, 8, true),
  // the acorn leaves his mouth on frame 3 (`hit` in the spec)
  shoot: lazyAnim(shoot, 12, false),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})
