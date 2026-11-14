/**
 * カエル団員 (`jumper`): a fat, smug frog thug of the ばくろ団. A wide squat body that is mostly mouth and belly;
 * the signature silhouette is two eye bulges on top of a wide flat head. Big whites with heavy lids at half-mast,
 * a long mouth line with a smug curl, a pale throat sac that pumps, strong hind legs folded in a Z with long webbed
 * feet, short arms with three-fingered hands, and the gang's red neckerchief under the throat with the knot at the
 * back. Teal wet skin with a darker mantle along the spine (not the meadow's grass green). 64×64 cell, feet on
 * (32, 60), 42×42 box.
 *
 * Depth (back to front): far bandana tail, far thigh, far foot, far shin, far arm, body + head + face, bandana,
 * throat sac, tongue, near thigh, near foot, near shin, near bandana tail, knot, near arm.
 *
 * Built on the rig toolkit (rig.ts): limbs hang in a centre frame that can turn (tumbles) or mirror top to bottom
 * (`flip`: rolled onto his back, the face stamps stay upright); knees and ankles of airborne poses are given
 * relative to the hips (`legsFromHip`) so the legs follow the tilting body.
 */
import { C, R, hexOf, ramp } from '../../palette'
import { Painter, Raster, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  carve,
  cel,
  egg,
  fill,
  joint,
  shadow,
  mantle,
  oval,
  polygon,
  ribbon,
  smooth,
  spline,
  squircle,
  stampAt,
  tint,
  union,
  within
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'
import { bandanaKnot, bandanaTail, neckerchief, type BandanaFit } from './kit'

const LINE = hexOf(C.inkGreen)
/** Teal wet skin: leans blue so the frog pops on the meadow's yellow-green grass. */
export const FROG_SKIN = ramp('#8cf2cf', '#2bb89c', '#1c8a88', '#155a6c', LINE)
const SKIN = FROG_SKIN
const SKIN_FAR = farRamp(SKIN)
/** The darker mantle along the spine and the crown. */
const MANTLE = ramp('#3fc7a6', '#1a8f82', '#146b72', '#10475c', LINE)
/** Pale yellow-cream belly, jaw and throat. */
const BELLY = ramp('#fffcea', '#f6ecb2', '#dbc887', '#a8956a', LINE)
/** Dark webbing between the toes. */
const WEB = SKIN[3]
/** The tongue. */
const PINK = R.hamEar

export type FrogEyes = 'lid' | 'closed' | 'squint' | 'bug' | 'hurt' | 'dizzy'
export type FrogMouth = 'smug' | 'grin' | 'open' | 'tongue'
/** A hind foot in the centre frame: ankle (u forward, v down), toe angle in degrees (0 = forward, 90 = down), toe spread 0..1. */
export type Foot = readonly [number, number, number, number]
/** A hand in the centre frame: wrist (u, v), finger angle in degrees (0 = forward, 90 = down), the front finger lifted 0..1. */
export type Hand = readonly [number, number, number, number]

export interface FrogPose {
  /** Whole figure forward (+) and up (+). */
  x: number
  y: number
  /** The whole rig turned clockwise around the middle of the body (tumbles). */
  spin: number
  /** Rolled over onto his back: the rig mirrored top to bottom (face stamps stay upright). */
  flip: boolean
  /** Body pitch in degrees (nose down +, nose up −), squash (+ wide and flat, − long), sink (body down, feet stay). */
  tilt: number
  squash: number
  sink: number
  /** Head offset (forward, up) and nod in degrees (snout down +). */
  head: readonly [number, number]
  nod: number
  /** Throat sac 0 (flat) … 1 (full). */
  throat: number
  /** Jaw drop 0 … 1 and the mouth drawn in it. */
  jaw: number
  mouth: FrogMouth
  eyes: FrogEyes
  /** Rows of the heavy lid over the eye (0 wide open … 4 nearly shut). */
  lid: number
  /** Pupils: x −1 back … 1 ahead, y −1 up … 1 down. */
  look: readonly [number, number]
  footN: Foot
  footF: Foot
  /** Knees in the centre frame (u, v). */
  kneeN: Pt
  kneeF: Pt
  handN: Hand
  handF: Hand
  /** Bandana tails: angle (0 = back, 90 = down), length, ripple, phase. */
  scarf: readonly [number, number, number, number]
}

/** Height of the body's middle (the tumble pivot) above the feet. */
const PIV = 13
/** The middle of the whole figure relative to the body's centre: the turning point of a tumble. */
const PIVOT: Pt = [3, -6]

export const frogPose = (p: Partial<FrogPose> = {}): FrogPose => ({
  x: 0,
  y: 0,
  spin: 0,
  flip: false,
  tilt: 0,
  squash: 0,
  sink: 0,
  head: [0, 0],
  nod: 0,
  throat: 0.2,
  jaw: 0,
  mouth: 'smug',
  eyes: 'lid',
  lid: 2,
  look: [1, 0],
  footN: [-8, PIV - 1.5, 0, 0],
  footF: [-2, PIV - 2.5, 0, 0],
  kneeN: [3, 5],
  kneeF: [8, 4],
  handN: [10, PIV - 1.5, 0, 0],
  handF: [14, PIV - 2.5, 0, 0],
  scarf: [62, 7, 0.9, 0],
  ...p
})

// ------------------------------------------------------------------------------------------------- face stamps

const FACE_KEY = { w: C.white, K: C.black, l: MANTLE[3], L: SKIN[4], m: C.mouth, t: C.tongue }

/** The eyeball, near 8×7 and far 7×7: whites, the pupil placed by `look`, the heavy lid covering the top rows. */
function eyeRows(p: FrogPose, far: boolean): string[] {
  const w = far ? 7 : 8
  const ball = far
    ? ['.wwwww.', 'wwwwwww', 'wwwwwww', 'wwwwwww', 'wwwwwww', 'wwwwwww', '.wwwww.']
    : ['.wwwwww.', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', '.wwwwww.']
  const set = (rows: string[], x: number, y: number, ch: string) => {
    if (y < 0 || y >= rows.length || x < 0 || x >= w || rows[y][x] === '.') return
    rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1)
  }
  switch (p.eyes) {
    case 'closed':
      return far
        ? ['.......', '.......', '.......', '.......', 'L.....L', '.LLLLL.', '.......']
        : ['........', '........', '........', '........', 'L......L', '.LLLLLL.', '........']
    case 'squint':
      return far
        ? ['.......', '.......', '.......', 'LL.....', '..LLL..', '.....LL', '.......']
        : ['........', '........', '........', 'LLL.....', '...LLL..', '......LL', '........']
    case 'hurt':
      return far
        ? ['.......', '.....L.', '...LL..', '.LL....', '...LL..', '.....L.', '.......']
        : ['........', '.L......', '..LL....', '....LLL.', '..LL....', '.L......', '........']
    case 'dizzy':
      return far
        ? ['.wwwww.', 'wKKKKww', 'wKwwwKw', 'wKwKwKw', 'wKwKKKw', 'wwwwwww', '.wwwww.']
        : ['.wwwwww.', 'wKKKKKww', 'wKwwwwKw', 'wKwKKwKw', 'wKwwKwKw', 'wwKKKKww', '.wwwwww.']
    case 'bug': {
      // wide open, tiny pupils
      const rows = [...ball]
      const px = Math.max(1, Math.min(w - 3, Math.round(((p.look[0] + 1) / 2) * (w - 3)) + 1))
      const py = 3 + Math.round(p.look[1])
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) set(rows, px + i, py + j, 'K')
      return rows
    }
    default: {
      const rows = [...ball]
      const px = Math.max(1, Math.min(w - 3, Math.round(((p.look[0] + 1) / 2) * (w - 4)) + 1))
      const py = Math.max(1, Math.min(4, 2 + Math.round(p.look[1] * 1.5)))
      const pw = far ? 2 : 3
      for (let j = 0; j < 3; j++) for (let i = 0; i < pw; i++) set(rows, px + i, py + j, 'K')
      const lid = Math.round(p.lid)
      for (let j = 0; j < lid; j++) rows[j] = '.'.repeat(w)
      if (lid > 0) for (let i = 0; i < w; i++) set(rows, i, lid, 'l')
      return rows
    }
  }
}

// ------------------------------------------------------------------------------------------------- drawing

/** The neckerchief on the frog: the band around the base of the head, under the throat. */
const FIT: BandanaFit = { back: [-8.5, -1], front: [9, 0.5], sag: 2.2, width: 2.8, from: 0.5, tip: [4, 8.5] }
/** The hips in the body frame (near, far). */
const HIP_N: Pt = [-9, 5.5]
const HIP_F: Pt = [-3, 4.5]
/** The eye bulges on the head (near, far). */
const EYE_N: Pt = [-5, -10]
const EYE_F: Pt = [7, -10.5]

/** Paints the rows of a stamp only on painted, non-edge pixels of the layer. */
function stampInside(l: Raster, f: Frame, rows: readonly string[], u: number, v: number, key: Record<string, number>) {
  within(l, (m) => stampAt(m, f, rows, u, v, key), true)
}

export function drawFrog(p: FrogPose): Raster {
  const g = new Painter(64, 64, { soft: true })
  // the rig turns around the middle of the whole figure (body and head), PIVOT from the body's centre
  const center = Frame.at(32 + p.x + PIVOT[0], 60 - PIV - p.y + PIVOT[1], p.spin, 1, p.flip ? -1 : 1).child(
    -PIVOT[0],
    -PIVOT[1]
  )
  const k = 1 + p.squash * 0.06
  const body = center.child(0, p.sink, p.tilt, k, 1 / k)
  const head = body.child(7 + p.head[0], -5 - p.head[1], p.nod - p.tilt * 0.35)
  const neck = head.child(-1, 3.2, -4)
  const knot = neck.pt(...FIT.back)
  /** A point of the body (or head) frame in the centre frame's units. */
  const inCenter = (f: Frame, u: number, v: number): Pt => center.local(...f.pt(u, v))

  // ---- bandana tails: the far one behind, the near one over the back (drawn with the knot)
  g.add(-6, (l) => bandanaTail(l, knot, p.scarf[0] + 24 - p.spin, p.scarf[1] * 0.8, p.scarf[2], p.scarf[3] + 1.6, true))
  g.add(4.5, (l) => bandanaTail(l, knot, p.scarf[0] - p.spin, p.scarf[1], p.scarf[2], p.scarf[3]))

  // ---- hind legs: a fat thigh from the hip to the knee, the shin folding back to the ankle, the long webbed foot
  const thighShape = (hip: Pt, knee: Pt) => {
    const a = inCenter(body, hip[0], hip[1])
    return union(oval(a[0], a[1], 5, 4.8), capsule(a, knee, 4.4, 2.9))
  }
  const thigh = (l: Raster, hip: Pt, knee: Pt, tone: Ramp) => {
    fill(l, center, thighShape(hip, knee), tone[1])
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
  }
  const shin = (l: Raster, knee: Pt, at: Foot, tone: Ramp) => {
    fill(l, center, capsule(knee, [at[0], at[1]], 2.6, 1.6), tone[1])
    cel(l, { shade: 1.2 })
  }
  const foot = (l: Raster, at: Foot, tone: Ramp) => {
    const f = center.child(at[0], at[1], at[2])
    const s = at[3]
    const toes = [-1, 0, 1].map((n) => {
      const a = ((n * (9 + s * 22) - 3) * Math.PI) / 180
      return [5.2 + Math.cos(a) * 5.4, Math.sin(a) * 5.4] as Pt
    })
    fill(l, f, polygon([[4.8, 0.2], ...toes]), WEB)
    fill(l, f, capsule([0, 0], [5, 0], 1.9, 1.4), tone[1])
    for (const t of toes) fill(l, f, union(capsule([4.8, 0], t, 1.1, 0.8), oval(t[0], t[1], 1.25, 1.1)), tone[1])
    cel(l, { shade: 1.2 })
  }
  g.add(-4.2, (l) => thigh(l, HIP_F, p.kneeF, SKIN_FAR))
  g.add(-4.1, (l) => foot(l, p.footF, SKIN_FAR))
  g.add(-4, (l) => shin(l, p.kneeF, p.footF, SKIN_FAR))
  g.add(4, (l) => thigh(l, HIP_N, p.kneeN, SKIN))
  g.add(4.1, (l) => foot(l, p.footN, SKIN))
  g.add(4.2, (l) => shin(l, p.kneeN, p.footN, SKIN))

  // ---- arms: short, a three-fingered hand at the wrist
  const arm = (l: Raster, shoulder: Pt, at: Hand, tone: Ramp) => {
    const a = inCenter(body, shoulder[0], shoulder[1])
    const { mid, end } = joint(a, [at[0], at[1]], 4.2, 4, 1)
    fill(l, center, union(capsule(a, mid, 2.6, 2), capsule(mid, end, 2, 1.5)), tone[1])
    const h = center.child(end[0], end[1], at[2])
    fill(l, h, oval(0.6, 0, 1.7, 1.5), tone[1])
    ;[-34, 0, 34].forEach((d, i) => {
      const r = ((d - (i < 2 ? at[3] * 45 : 0)) * Math.PI) / 180
      const tip: Pt = [1 + Math.cos(r) * 3.4, Math.sin(r) * 3.4]
      fill(l, h, union(capsule([0.8, 0], tip, 0.9, 0.8), oval(tip[0], tip[1], 1.05, 1)), tone[1])
    })
    smooth(l)
    cel(l, { shade: 1.2 })
  }
  g.add(-3, (l) => arm(l, [11, 2], p.handF, SKIN_FAR))
  g.add(5, (l) => arm(l, [8, 5], p.handN, SKIN))

  // ---- body and head: one silhouette with the two eye bulges on top
  const jaw = p.jaw
  g.add(0, (l) => {
    fill(l, body, union(oval(-4, 2.5, 13, 9.5), egg(3, -1, 11.5, 9, 8)), SKIN[1])
    fill(
      l,
      head,
      union(
        squircle(1, -4, 12.5, 6.5, 2.6),
        oval(2.5, 0 + jaw * 2, 11, 3.5 + jaw * 2.4),
        oval(EYE_N[0], EYE_N[1], 5.6, 5.2),
        oval(EYE_F[0], EYE_F[1], 5, 4.9)
      ),
      SKIN[1]
    )
    // the pale belly and the jaw under the mouth line
    tint(l, body, union(oval(8, 5, 7.5, 6), oval(-2, 9.5, 13, 3.4)), BELLY[1])
    tint(l, head, oval(3, 1.8 + jaw * 2.5, 11.5, 2.6 + jaw * 2.4), BELLY[1])
    if (jaw > 0.3)
      carve(
        l,
        head,
        polygon([
          [15, -2],
          [9, -0.5 + jaw],
          [15, jaw * 4]
        ])
      )
    smooth(l)
    mantle(l, SKIN[1], MANTLE[1], { depth: 4, tooth: 2, pitch: 4, origin: body.pt(0, 0) })
    cel(l, { shade: 3, deep: 1 })
    // the mouth: a long line across the head with a smug curl at the back corner
    within(l, (m) => {
      if (jaw > 0.3) {
        const open = polygon([
          [-7, -1],
          [14, -2],
          [14, -0.5 + jaw * 4.5],
          [4, jaw * 4.4],
          [-6, 0]
        ])
        fill(m, head, open, C.mouth)
        if (p.mouth === 'tongue' || p.mouth === 'grin') fill(m, head, oval(4, jaw * 4, 6, 1.6), C.tongue)
      }
      for (let u = -7; u <= 13; u += 0.5) {
        const v = -1.2 - (u < -4 ? (u + 4) * 0.4 : 0) + (u > 8 ? -(u - 8) * 0.2 : 0)
        const [x, y] = head.pt(u, v)
        m.set(Math.floor(x), Math.floor(y), SKIN[4])
      }
      if (p.mouth === 'smug' && jaw <= 0.3) stampAt(m, head, ['L.', '.L'], -7.6, -2.4, FACE_KEY)
    })
    // nostrils, the eyes, the wet highlights
    stampInside(l, head, ['L.L'], 11.5, -6, FACE_KEY)
    stampInside(l, head, eyeRows(p, false), EYE_N[0], EYE_N[1] + 0.5, FACE_KEY)
    stampInside(l, head, eyeRows(p, true), EYE_F[0], EYE_F[1] + 0.5, FACE_KEY)
    stampInside(l, body, ['hh', 'h.'], -9, -4, { h: SKIN[0] })
    // the near thigh's soft shadow on the flank
    shadow(l, center.moved(1, 1), thighShape(HIP_N, p.kneeN))
  })

  // ---- bandana under the throat, knot at the back
  g.add(1, (l) => neckerchief(l, neck, FIT))
  g.add(4.6, (l) => bandanaKnot(l, knot))

  // ---- throat sac
  g.add(1.5, (l) => {
    const t = p.throat
    fill(l, head, oval(5 + t * 1.5, 3.4 + jaw * 3 + t * 1.6, 4 + t * 3.4, 1.8 + t * 3), BELLY[1])
    cel(l, { shade: 1 + t * 0.8 })
    stampInside(l, head, t > 0.5 ? ['hh'] : ['h'], 3 + t * 1.5, 2.6 + jaw * 3 + t * 0.4, { h: BELLY[0] })
  })

  // ---- the tongue lolling out of the front of the mouth
  if (p.mouth === 'tongue')
    g.add(2, (l) => {
      // out of the front of the mouth, then hanging with gravity
      const a = head.pt(9, p.jaw * 2.5)
      const b = head.pt(13.5, 0.5 + p.jaw * 3)
      const pts: Pt[] = [a, b, [b[0] + 2, b[1] + 3.5]]
      ribbon(l, spline(pts), (t) => 2.6 + t * 0.6, PINK[1])
      cel(l, { shade: 1 })
    })
  return g.render()
}

// ------------------------------------------------------------------------------------------------- clips

const TAU = Math.PI * 2

/** Where a hip sits in the centre frame for a body pose (to hang knees and feet from it in airborne poses). */
function hipAt(p: Partial<FrogPose>, near = true): Pt {
  const k = 1 + (p.squash ?? 0) * 0.06
  return Frame.at(0, 0)
    .child(0, p.sink ?? 0, p.tilt ?? 0, k, 1 / k)
    .pt(...(near ? HIP_N : HIP_F))
}
/** A point `d` away from the hip of the pose. */
const offHip = (p: Partial<FrogPose>, near: boolean, d: Pt): Pt => {
  const h = hipAt(p, near)
  return [h[0] + d[0], h[1] + d[1]]
}
/** Builds a pose whose knees and ankles are given relative to the hips: legs follow a tilting body. */
function legsFromHip(
  p: Partial<FrogPose>,
  near: { knee: Pt; ankle: Pt; toe: number; spread: number },
  far: { knee: Pt; ankle: Pt; toe: number; spread: number }
): FrogPose {
  const kn = offHip(p, true, near.knee)
  const an = offHip(p, true, near.ankle)
  const kf = offHip(p, false, far.knee)
  const af = offHip(p, false, far.ankle)
  return frogPose({
    ...p,
    kneeN: kn,
    kneeF: kf,
    footN: [an[0], an[1], near.toe, near.spread],
    footF: [af[0], af[1], far.toe, far.spread]
  })
}

/**
 * Sitting between hops, bored and mean: the throat sac pumps out and in, the lids sink and the eyes slide to the
 * side, a slow blink, the front fingers drum once.
 */
const idle = memo(() => {
  const throat = [0.15, 0.7, 1, 0.6, 0.2, 0.05]
  const lid = [2, 2, 3, 3, 3, 2]
  const look: Pt[] = [
    [1, 0],
    [1, 0],
    [0.2, 0.3],
    [0.2, 0.3],
    [-0.8, 0.3],
    [0.4, 0]
  ]
  return throat.map((t, i) =>
    drawFrog(
      frogPose({
        throat: t,
        lid: lid[i],
        eyes: i === 3 ? 'closed' : 'lid',
        look: look[i],
        handN: [11, PIV - 1.5, 0, [0, 0, 1, 0, 1, 0][i]],
        scarf: [62 + Math.sin((i / 6) * TAU) * 6, 7, 0.9, (i / 6) * TAU]
      })
    )
  )
})

/** The hop, one frame per phase (the view picks it by vertical speed). */
const air = memo(() => {
  const launch: Partial<FrogPose> = {
    y: 16,
    tilt: -44,
    squash: 2,
    head: [1, 0],
    nod: 22,
    handN: [-3, 2, 140, 0],
    handF: [0, 0, 140, 0],
    throat: 0,
    lid: 0,
    look: [1, -1],
    scarf: [55, 8, 0.6, 0]
  }
  const rising: Partial<FrogPose> = {
    y: 14,
    tilt: -30,
    squash: 1.2,
    handN: [11, 3, 30, 0],
    handF: [14, 1, 30, 0],
    throat: 0,
    lid: 1,
    look: [1, -0.6],
    scarf: [40, 8, 1.2, 1.2]
  }
  const top: Partial<FrogPose> = {
    y: 14,
    tilt: -6,
    squash: 0.4,
    handN: [16, 6, -10, 0],
    handF: [19, 2, -30, 0],
    throat: 0.3,
    jaw: 0.8,
    mouth: 'grin',
    lid: 0,
    look: [1, 0],
    scarf: [5, 8, 1.6, 2.4]
  }
  const falling: Partial<FrogPose> = {
    y: 12,
    tilt: 12,
    handN: [15, 8, 40, 0],
    handF: [20, 0, -30, 0],
    throat: 0.5,
    jaw: 0.6,
    mouth: 'open',
    lid: 0,
    look: [0.6, 1],
    scarf: [-30, 8, 1.6, 3.6]
  }
  const bracing: Partial<FrogPose> = {
    y: 7,
    tilt: 2,
    squash: 1,
    handN: [13, 11, 50, 0],
    handF: [17, 10, 50, 0],
    throat: 0.6,
    jaw: 0.55,
    mouth: 'open',
    eyes: 'bug',
    lid: 0,
    look: [0, 1],
    scarf: [-55, 8, 1.2, 4.8]
  }
  return [
    // launch: stretched long and steep, legs straight down behind, toes pointed, arms pressed back
    legsFromHip(
      launch,
      { knee: [-2.5, 4.5], ankle: [-5.5, 8.5], toe: 116, spread: 0 },
      { knee: [-2.5, 4], ankle: [-5.5, 8], toe: 116, spread: 0 }
    ),
    // rising: legs trailing and folding, arms coming forward
    legsFromHip(
      rising,
      { knee: [-4, 5], ankle: [-10, 3], toe: 165, spread: 0.2 },
      { knee: [-4, 4.5], ankle: [-10, 2.5], toe: 165, spread: 0.2 }
    ),
    // the top: tucked into a ball, knees up beside the body, arms out, a grin
    legsFromHip(
      top,
      { knee: [11, -2], ankle: [2, 4], toe: 15, spread: 0.4 },
      { knee: [11, -2], ankle: [3, 4], toe: 15, spread: 0.4 }
    ),
    // falling: the legs swing forward under him, arms spread, belly first, eyes on the ground
    legsFromHip(
      falling,
      { knee: [10, 3], ankle: [6, 9], toe: 70, spread: 0.6 },
      { knee: [10, 3], ankle: [7, 8.5], toe: 70, spread: 0.6 }
    ),
    // bracing: legs reaching down, feet flat and spread, the body starting to give
    legsFromHip(
      bracing,
      { knee: [-1, 6], ankle: [-6, 11], toe: 0, spread: 1 },
      { knee: [9, 5], ankle: [11, 11], toe: 0, spread: 1 }
    )
  ].map(drawFrog)
})

/** The landing: the deep squash with the eyes squeezed, the rebound, the settle into the sit. */
const land = memo(() =>
  [
    frogPose({
      squash: 3.5,
      sink: 3,
      kneeN: [8, 8],
      kneeF: [13, 7],
      footN: [-11, PIV - 1.5, 0, 1],
      footF: [2, PIV - 2.5, 0, 1],
      handN: [15, PIV - 1.5, 0, 0],
      handF: [19, PIV - 2.5, 0, 0],
      throat: 1,
      eyes: 'squint',
      scarf: [80, 6, 1, 0]
    }),
    frogPose({
      squash: -1.4,
      sink: -1.5,
      kneeN: [3, 3],
      kneeF: [8, 2],
      throat: 0.2,
      lid: 0,
      look: [1, -0.5],
      scarf: [45, 7, 1.2, 1]
    }),
    frogPose({ squash: 0.5, sink: 0.5, throat: 0.4, lid: 1, scarf: [25, 7, 1, 2] })
  ].map(drawFrog)
)

/** Bitten: bug-eyed, tongue out, limbs splayed; then the recoil. */
const hurt = memo(() => {
  const jolt: Partial<FrogPose> = {
    x: 0,
    y: 6,
    tilt: -16,
    squash: -1,
    handN: [15, 4, -30, 0],
    handF: [19, -1, -50, 0],
    eyes: 'bug',
    look: [0, 0],
    jaw: 1,
    mouth: 'tongue',
    throat: 0,
    scarf: [-20, 8, 1.6, 0]
  }
  return [
    legsFromHip(
      jolt,
      { knee: [-6, 3], ankle: [-11, 4], toe: 150, spread: 1 },
      { knee: [8, 3], ankle: [12, 6], toe: 30, spread: 1 }
    ),
    frogPose({
      x: -1,
      squash: 1.4,
      sink: 1.5,
      kneeN: [5, 6],
      kneeF: [10, 5],
      footN: [-9, PIV - 1.5, 0, 0.6],
      footF: [-1, PIV - 2.5, 0, 0.6],
      handN: [13, PIV - 1.5, 0, 0],
      eyes: 'squint',
      jaw: 0.5,
      mouth: 'open',
      throat: 0.6,
      scarf: [35, 7, 1.4, 2]
    })
  ].map(drawFrog)
})

/** Knocked out: the blow, flung back turning (the rig turns, limbs flail), on his back with a bounce, limp. */
const defeat = memo(() => {
  const flung = (o: Partial<FrogPose>) =>
    frogPose({ eyes: 'hurt', jaw: 0.8, mouth: 'open', throat: 0, lid: 0, scarf: [20, 8, 1.4, 0], ...o })
  return [
    // the blow: thrown back, stretched, tongue out, legs kicked out behind
    legsFromHip(
      flung({
        x: -1,
        y: 5,
        tilt: -20,
        squash: -1.2,
        handN: [15, 3, -40, 0],
        handF: [18, -2, -60, 0],
        mouth: 'tongue',
        jaw: 1
      }),
      { knee: [-6, 3], ankle: [-11, 3], toe: 170, spread: 1 },
      { knee: [8, 3], ankle: [12, 6], toe: 30, spread: 1 }
    ),
    // head over heels: the rig turns, curled up, the limbs flailing on their own
    legsFromHip(
      flung({
        x: -5,
        y: 3,
        spin: -100,
        eyes: 'bug',
        look: [0, 0],
        handN: [17, 6, 20, 0],
        handF: [18, -2, -40, 0],
        scarf: [-20, 8, 1.6, 1]
      }),
      { knee: [-3, 6], ankle: [3, 8], toe: -10, spread: 0.8 },
      { knee: [-6, 2], ankle: [-9, -2], toe: 230, spread: 0.6 }
    ),
    legsFromHip(
      flung({
        x: -4,
        y: 2,
        spin: -190,
        handN: [17, 3, 0, 0],
        handF: [16, -5, -60, 0],
        eyes: 'dizzy',
        scarf: [10, 8, 1.6, 2]
      }),
      { knee: [-6, 3], ankle: [-9, -2], toe: 230, spread: 0.8 },
      { knee: [-2, 6], ankle: [4, 8], toe: 0, spread: 0.6 }
    ),
    legsFromHip(
      flung({
        x: 0,
        y: 1,
        spin: -280,
        handN: [16, 8, 40, 0],
        handF: [18, 1, -10, 0],
        eyes: 'dizzy',
        scarf: [40, 8, 1.6, 3]
      }),
      { knee: [-2, 7], ankle: [4, 9], toe: 10, spread: 0.8 },
      { knee: [-6, 4], ankle: [-9, 0], toe: 220, spread: 0.6 }
    ),
    // rolled onto his back with a bounce: squashed flat, the legs flung up
    legsFromHip(
      flung({
        x: 1,
        y: -6,
        flip: true,
        squash: 1.6,
        nod: 30,
        head: [3, 0],
        handN: [6, 14, 60, 0],
        handF: [10, 14, 40, 0],
        eyes: 'dizzy',
        mouth: 'tongue',
        jaw: 1,
        scarf: [70, 6, 1, 4]
      }),
      { knee: [-2, 9], ankle: [-8, 15], toe: 120, spread: 1 },
      { knee: [6, 9], ankle: [6, 16], toe: 80, spread: 1 }
    ),
    // limp: belly up, legs spread in the air, tongue lolling, eyes dizzy
    legsFromHip(
      flung({
        x: 2,
        y: -5,
        flip: true,
        squash: 0.4,
        nod: 36,
        head: [3, 0],
        handN: [5, 13, 100, 0],
        handF: [9, 14, 70, 0],
        eyes: 'dizzy',
        mouth: 'tongue',
        jaw: 1,
        scarf: [90, 6, 0.6, 5]
      }),
      { knee: [-5, 7], ankle: [-10, 10], toe: 150, spread: 1 },
      { knee: [8, 7], ankle: [13, 11], toe: 40, spread: 1 }
    )
  ].map(drawFrog)
})

export const jumperSheet = () => ({
  idle: lazyAnim(idle, 8, true),
  air: lazyAnim(air, 8, false),
  land: lazyAnim(land, 14, false),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})
