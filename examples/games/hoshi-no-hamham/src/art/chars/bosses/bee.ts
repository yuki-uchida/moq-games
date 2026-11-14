/**
 * ハチ女王 (`beeBoss`): the queen bee, the dark king's right hand. A queen first, an insect second: a big pale
 * face under a glossy dark bob, a small gold crown between two curling antennae with gold bobbles, a great white
 * fur collar hiding the thorax, the gang's red sash across the bodice, a gold sceptre with a red jewel, and the long
 * striped abdomen that sweeps back and curls forward under her into the stinger — head, collar and abdomen on one
 * S-curve. Two pairs of long narrow wings hover her on a blur. 128×128, facing right, anchor (64, 120); she hovers
 * with her lowest point a few pixels above the anchor row.
 *
 * Rendering (CHARACTERS.md): the head (skin + hair) is one silhouette shaded once (smooth, glossy hair sheen), the
 * collar is one silhouette with a toothed fur edge, the abdomen is a widening `ribbon` along a spline with stripes
 * painted `within` it and one glossy highlight band. Eyes, brows, mouths, crown and stars are stamps.
 *
 * Depth (back to front): far wings, far arm, abdomen, near wings, legs, bodice, sash, collar, antennae, head, face,
 * crown, near arm with the sceptre, loose crown and sceptre, stars.
 */
import type { SheetModule } from '../../module'
import { TAU, lag } from '../../motion'
import { OUTLINE_OF, R, ramp } from '../../palette'
import { Painter, Raster, farRamp, outlineWith, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  cel,
  fill,
  joint,
  minus,
  oval,
  overlap,
  half,
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

// ------------------------------------------------------------------------------------------------ colours

const LINE_COOL = '#1c1830'
const LINE_WARM = '#3a1a22'
/** Pale skin. */
const SKIN = ramp('#fff8f0', '#fbe1d4', '#e4b6ad', '#ad8190', LINE_WARM)
/** Near-black plum: hair, gloves, legs, bodice and the abdomen's stripes. */
const PLUM = ramp('#7d6c9c', '#3f3454', '#2b2339', '#1d1727', LINE_COOL)
/** Gold: the abdomen, the crown, the sceptre, the bobbles. */
const HONEY = R.honey
const BAND = R.bandana
/** The white fur collar. */
const FUR = ramp('#fdfcff', '#ebe9f4', '#c2c0d6', '#8987a8', LINE_COOL)
/** Pale blue-white wings. */
const WING = ramp('#f0faff', '#cde4fa', '#9cbbe4', '#6d83bd', LINE_COOL)
const WING_FAR = farRamp(WING)
const PLUM_FAR = farRamp(PLUM)

/** Her materials, for the tests. */
export const BEE_RAMPS = { SKIN, PLUM, HONEY, BAND, FUR, WING } as const

export type Eyes = 'disdain' | 'cruel' | 'wide' | 'fury' | 'shut' | 'hurt' | 'dizzy' | 'tired'
export type Brow = 'arch' | 'up' | 'fury' | 'flat'
export type Mouth = 'line' | 'smile' | 'o' | 'grit' | 'pant' | 'wave'
export type Wings = 'spread' | 'blur' | 'down' | 'back' | 'crumple'

export interface BeePose {
  /** Whole figure forward (+) / up (+). */
  x: number
  y: number
  /** Body tilt in degrees (clockwise +: the front dips) and a stretch along the body (+ longer, thinner). */
  lean: number
  squash: number
  /** Head offset from its seat on the collar and nod in degrees (chin down +). */
  head: readonly [number, number]
  nod: number
  eyes: Eyes
  brow: Brow
  mouth: Mouth
  /** Abdomen: the direction of its four segments in body degrees (0 = forward, 90 = down, 180 = back). */
  abd: readonly [number, number, number, number]
  /** Length of one abdomen segment. */
  seg: number
  /** Wing pose, an extra turn of all wings (degrees, + clockwise: down when they point back) and a length scale. */
  wings: Wings
  wingTurn: number
  wingLen: number
  /** Sceptre hand relative to its shoulder; rod angle in degrees (0 = upright, + top forward); null = no sceptre. */
  armN: readonly [number, number]
  scep: number | null
  /** The far hand relative to its shoulder. */
  armF: readonly [number, number]
  /** The sceptre is held behind the body (the dash). */
  scepBack: boolean
  /** The far hand fans her face (recover). */
  fan: boolean
  /** Crown on the head: offset and tilt in degrees; null = gone. */
  crown: readonly [number, number, number] | null
  /** Antennae trailing: degrees turned back at the root, near and far. */
  ant: readonly [number, number]
  /** Sash end: direction (0 = straight down, + streams back), ripple, phase. */
  sash: readonly [number, number, number]
  /** Legs: swing (degrees, + forward) and knee bend (degrees). */
  legs: readonly [number, number]
  /** Glints: on the jewel and on the stinger tip. */
  jewel: boolean
  sting: boolean
  /** Sparkles of the sceptre's trail (screen points); empty = none. */
  sparks: readonly Pt[]
  /** Speed streaks behind a dash (0 = none, else phase). */
  streaks: number
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
  /** A loose crown and sceptre flying off (screen x, y, degrees). */
  looseCrown: readonly [number, number, number] | null
  looseScep: readonly [number, number, number] | null
}

export const beePose = (p: Partial<BeePose> = {}): BeePose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  head: [0, 0],
  nod: 0,
  eyes: 'disdain',
  brow: 'arch',
  mouth: 'line',
  abd: [148, 110, 70, 32],
  seg: 10,
  wings: 'spread',
  wingTurn: 0,
  wingLen: 1,
  armN: [12, 5],
  scep: 8,
  scepBack: false,
  armF: [-6, 10],
  fan: false,
  crown: [0, 0, 0],
  ant: [0, 0],
  sash: [70, 1, 0],
  legs: [0, 0],
  jewel: false,
  sting: false,
  sparks: [],
  streaks: 0,
  stars: -1,
  looseCrown: null,
  looseScep: null,
  ...p
})

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = {
  K: PLUM[4],
  P: PLUM[2],
  w: FUR[0],
  y: HONEY[1],
  o: HONEY[2],
  s: SKIN[2],
  S: SKIN[3]
}
/** Near eyes (about 8×7): heavy lids, a lash flicking out at the outer corner. */
const EYES: Record<Eyes, readonly string[]> = {
  disdain: ['K.......', '.KKKKKK.', '..KKKKKK', '..wyKyw.', '...SSS..'],
  cruel: ['K.......', '.KKKKKK.', '..KKKKKK', '..wyKKw.', '..SyyS..', '........'],
  wide: ['K.KKKK..', '.K....K.', '.KwyyyKK', '.KwyKKyK', '.KwyKKyK', '..KyyyK.', '...KKK..'],
  fury: ['.......', 'KKK....', '.KKKKKK', '..KKKKK', '..wyKyw', '...SSS.'],
  shut: ['K.......', '.K......', '..KKKKK.', '.......K', '........'],
  hurt: ['K......K', '.KK...K.', '...KKK..', '..KK....', 'KK......'],
  dizzy: ['..KKKK..', '.K....K.', '.K.KK.K.', '.K.K..K.', '..K..K..', '...KK...'],
  tired: ['K.......', '.KKKKKK.', '..KKKKKK', '..PPPPPP', '..wyKyw.', '...SSS..']
}
/** The far eye: narrower, nearer the edge of the face. */
const EYES_FAR: Record<Eyes, readonly string[]> = {
  disdain: ['.KKKK', 'KKKKK', 'wyKy.', '.SS..'],
  cruel: ['.KKKK', 'KKKKK', 'wyKK.', '.yS..'],
  wide: ['.KKK.', 'KwyyK', 'KyKKK', 'KyKKK', '.KKK.'],
  fury: ['KK...', '.KKKK', 'KKKKK', 'wyKy.'],
  shut: ['.....', '.KKKK', 'K....'],
  hurt: ['K...K', '.K.K.', '..K..', '.K...'],
  dizzy: ['.KKK.', 'K.K.K', 'K..K.', '.KK..'],
  tired: ['.KKKK', 'KKKKK', 'PPPPP', 'wyKy.']
}
const BROWS: Record<Brow, readonly [readonly string[], readonly string[]]> = {
  arch: [
    ['..PPP...', '.P...PP.'],
    ['.PPP', 'P...']
  ],
  up: [
    ['...PPP..', '.PP...P.', 'P.......'],
    ['.PP.', 'P..P']
  ],
  fury: [
    ['PP......', '..PPP...', '.....PP.'],
    ['...P', '.PP.']
  ],
  flat: [['.PPPPPP.'], ['PPPP']]
}
const MOUTH_KEY = { K: SKIN[3] as number, k: PLUM[4], r: BAND[1], R: BAND[2], m: PLUM[3], t: FUR[0] }
const MOUTHS: Record<Mouth, readonly string[]> = {
  line: ['kkkk.', '.rR..'],
  smile: ['k...k', '.kkk.', '.rrR.'],
  o: ['.kk.', 'kmmk', 'kmmk', '.rR.'],
  grit: ['kkkkk', 'ktttk', 'kkkkk', '.rrR.'],
  pant: ['.kkk.', 'kmmmk', '.rrR.'],
  wave: ['k.k.k', '.k.k.']
}
/** The crown: three points with bobbles, a red stone in the band. */
const CROWN = ['h...h...h', 'y..yhy..y', 'yy.yyy.yy', 'yyyyyyyyy', 'oyyyryyyo', 'ooooooooo']
const CROWN_KEY = { h: HONEY[0], y: HONEY[1], o: HONEY[2], r: BAND[1] }
/** The gold bobble on an antenna tip. */
const BOBBLE = ['.yyy.', 'yhyyy', 'yyyyy', 'yyyyo', '.ooo.']
const BOBBLE_KEY = { y: HONEY[1], h: HONEY[0], o: HONEY[2] }
const BOBBLE_FAR = { y: HONEY[2], h: HONEY[1], o: HONEY[3] }
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']
const SPARK = ['..w..', '..w..', 'wwyww', '..w..', '..w..']
const SPARK_SMALL = ['.....', '..w..', '.wyw.', '..w..', '.....']
/** Fur locks on the collar's lower edge. */
const TUFT_DOWN = ['fffff', 'ffff.', '.fff.', '.ff..', '..f..']
const TUFT_DOWN_R = ['fffff', '.ffff', '.fff.', '..ff.', '..f..']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)
const RAD = Math.PI / 180

/** A polyline of `n` segments of length `len` from `from` in the directions `dirs` (degrees in frame `f`). */
function chain(f: Frame, from: Pt, dirs: readonly number[], len: number): Pt[] {
  const pts: Pt[] = [f.pt(...from)]
  let [u, v] = from
  for (const d of dirs) {
    u += Math.cos(d * RAD) * len
    v += Math.sin(d * RAD) * len
    pts.push(f.pt(u, v))
  }
  return spline(pts)
}

/** Direction of a path near its point i, in screen degrees. */
const heading = (path: readonly Pt[], i: number) => {
  const a = path[Math.max(0, i - 2)]
  const b = path[Math.min(path.length - 1, i + 2)]
  return Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD
}

/** The part of a path between t0 and t1 (fractions of its point count). */
const slice = (path: readonly Pt[], t0: number, t1: number) =>
  path.slice(Math.round(t0 * (path.length - 1)), Math.round(t1 * (path.length - 1)) + 1)

/**
 * White fur on the very edge of a part takes the base colour instead: the selout next to it is two ramp steps
 * darker, and two steps below the highlight is still light. (As in the wolf; candidate for a `cel` option.)
 */
function dimEdge(l: Raster, from: number, to: number) {
  const b = l.bounds()
  if (!b) return
  const src = l.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (src.get(x, y) === from && !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1)))
        l.set(x, y, to)
}

/**
 * A one-pixel rim round a pale effect (sparkle, streak), in the deep colour of the pixel it borders: the part's
 * default lit-side outline is only two ramp steps darker, which is still light on a pale colour.
 */
function deepRim(l: Raster, diagonal = false) {
  const src = l.clone()
  const around = diagonal
    ? [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ]
    : [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ]
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      if (src.get(x, y)) continue
      for (const [dx, dy] of around) {
        const c = src.get(x + dx, y + dy)
        if (c) {
          l.set(x, y, OUTLINE_OF[c].deep)
          break
        }
      }
    }
}

/** Every painted pixel under the strip one ramp step lighter: a glossy highlight band along a path. */
function gloss(l: Raster, path: readonly Pt[], width: (t: number) => number, lighter: Record<number, number>) {
  const m = new Raster(l.w, l.h)
  ribbon(m, path, width, 1)
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      const c = l.get(x, y)
      if (!m.get(x, y) || !c) continue
      if (!(l.get(x - 1, y) && l.get(x + 1, y) && l.get(x, y - 1) && l.get(x, y + 1))) continue
      const to = lighter[c]
      if (to) l.set(x, y, to)
    }
}

/** A path offset sideways by `d` pixels (+ = to the left of its direction on screen). */
function offset(path: readonly Pt[], d: (t: number) => number): Pt[] {
  return path.map((p, i) => {
    const a = heading(path, i) * RAD
    const t = i / Math.max(1, path.length - 1)
    return [p[0] + Math.sin(a) * d(t), p[1] - Math.cos(a) * d(t)] as Pt
  })
}

/**
 * A flat-ended band across a path between t0 and t1, reaching `reach` pixels to both sides: a stripe that crosses a
 * body square to its axis (a ribbon's round caps would swell into the neighbouring stripes).
 */
function band(path: readonly Pt[], t0: number, t1: number, reach: number): Shape {
  const part = slice(path, t0, t1)
  const left = offset(part, () => reach)
  const right = offset(part, () => -reach)
  return polygon([...part.slice(0, 1), ...left, ...part.slice(-1), ...right.reverse()])
}

/** The abdomen's dark bands (fractions of its length): the waist, three stripes, the tip. */
const STRIPES = [
  [0, 0.08],
  [0.3, 0.4],
  [0.52, 0.62],
  [0.73, 0.83],
  [0.93, 1]
] as const

/** Wing directions (degrees in the body frame) for upper and lower wing of each pose. */
const WING_DIR: Record<Wings, readonly [number, number]> = {
  spread: [-118, -152],
  blur: [-140, -170],
  down: [-166, 176],
  back: [-172, 172],
  crumple: [-150, 150]
}

/** The sceptre on its own frame (u along the rod, the jewel at u = 26): gold rod, collar, red jewel. */
function sceptre(l: Raster, rod: Frame, glint: boolean) {
  fill(l, rod, capsule([-8, 0], [21, 0], 1.3, 1.3), HONEY[1])
  fill(l, rod, union(oval(22, 0, 2.4, 2.8), oval(19.5, 0, 1.4, 2.2), oval(-8.5, 0, 1.8, 1.8)), HONEY[1])
  fill(l, rod, oval(26, 0, 3.4, 3.4), BAND[1])
  smooth(l)
  cel(l, { shade: 1.5, rim: 1 })
  // the jewel: a dark core and a hard highlight toward the light
  const [jx, jy] = rod.pt(26, 0)
  l.set(jx - 1, jy - 1, glint ? FUR[0] : BAND[0])
  l.set(jx - 1, jy - 2, BAND[0])
  l.set(jx - 2, jy - 1, BAND[0])
}

/** The crown as a drawn shape on its own frame (origin at the middle of its band): for a crown knocked askew. */
function crownShape(l: Raster, f: Frame) {
  fill(
    l,
    f,
    polygon([
      [-5, 2],
      [-5, -5],
      [-2.6, -1.8],
      [0, -6],
      [2.6, -1.8],
      [5, -5],
      [5, 2]
    ]),
    HONEY[1]
  )
  smooth(l)
  cel(l, { shade: 1.5, rim: 1 })
  const [x, y] = f.pt(0, -0.5)
  l.set(x, y, BAND[1])
}

// ------------------------------------------------------------------------------------------------ drawing

/**
 * An elbow between shoulder and hand. Limbs may cheat (CHARACTERS.md): when the hand is out of reach the bones
 * grow, up to half again as long, so a raised sceptre or a flung arm still reads.
 */
function elbow(a: Pt, b: Pt, bend: 1 | -1): Pt {
  const reach = Math.hypot(b[0] - a[0], b[1] - a[1])
  const bone = Math.min(12.8, Math.max(8.5, reach * 0.52))
  return joint(a, b, bone, bone - 0.5, bend).mid
}

/** The pose's part frames: body, head, the sceptre hand and the rod (shared by the drawing and the clips). */
function frames(p: BeePose) {
  const k = 1 + p.squash * 0.04
  const torso = Frame.at(64 + p.x, 71 - p.y, p.lean, 1 / k, k)
  const head = torso.child(4 + p.head[0], -22 + p.head[1], p.nod - p.lean * 0.4)
  const shN = torso.pt(7, -4)
  const handN: Pt = [shN[0] + p.armN[0], shN[1] + p.armN[1]]
  const rod = p.scep === null ? null : Frame.at(handN[0], handN[1], p.scep - 90 + p.lean)
  return { torso, head, shN, handN, rod }
}

/** Where the sceptre's jewel is on screen in a pose (for the sparkles that trail its sweep). */
export const jewelAt = (p: BeePose): Pt | null => frames(p).rod?.pt(26, 0) ?? null

export function drawBee(p: BeePose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const { torso, head, shN, handN, rod } = frames(p)

  // ---- wings: two pairs from the back of the thorax
  const wing = (far: boolean) => (l: Raster) => {
    const tone = far ? WING_FAR : WING
    const [du, dl] = WING_DIR[p.wings]
    const turn = p.wingTurn + (far ? 9 : 0)
    const root = torso.child(far ? -4 : -7, far ? -13 : -11)
    // swept down and back the wings turn edge-on: shorter on screen
    const fore = (far ? 0.92 : 1) * (p.wings === 'down' ? 0.72 : 1) * p.wingLen
    const lens = [38 * fore, 27 * fore]
    const widths = [6.5, 5.2]
    if (p.wings === 'blur') {
      // the beat as a fan: a pale wedge from the root with bright streaks
      for (let i = 0; i < 2; i++) {
        const a0 = (i ? dl : du) + turn - 30
        const a1 = (i ? dl : du) + turn + 30
        const r = lens[i]
        const pts: Pt[] = [[0, 0]]
        for (let s = 0; s <= 8; s++) {
          const a = (a0 + ((a1 - a0) * s) / 8) * RAD
          const rr = r * (0.86 + 0.14 * Math.sin((s / 8) * Math.PI))
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
        }
        fill(l, root, polygon(pts), tone[1])
      }
      smooth(l)
      // streaks: the wing caught at three places in its beat
      within(l, (m) => {
        for (const [i, s] of [
          [0, -0.75],
          [0, 0.15],
          [0, 0.8],
          [1, -0.5],
          [1, 0.6]
        ] as const) {
          const a = ((i ? dl : du) + turn + s * 26) * RAD
          const r = lens[i]
          ribbon(
            m,
            [root.pt(Math.cos(a) * 5, Math.sin(a) * 5), root.pt(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82)],
            (t) => 2.2 - t * 0.8,
            tone[0]
          )
        }
      })
      outlineWith(l, tone[3])
      return
    }
    for (let i = 0; i < 2; i++) {
      const a = (i ? dl : du) + turn + (p.wings === 'crumple' ? (i ? 25 : -10) : 0)
      const f = root.child(0, 0, a)
      const len = lens[i] * (p.wings === 'crumple' ? 0.8 : 1)
      const w = widths[i]
      fill(l, f, union(capsule([1, 0], [len - w, 0.8], 2, w), oval(len * 0.55, 0.6, len * 0.36, w * 0.92)), tone[1])
      if (p.wings === 'crumple') {
        // a bent tip
        fill(l, f, capsule([len - w, 0.8], [len - w + 5, 6], w * 0.6, 2.4), tone[1])
      }
    }
    smooth(l)
    cel(l, { shade: 2, rim: 1.2 })
    // the vein along each wing, nearer its leading edge
    within(
      l,
      (m) => {
        for (let i = 0; i < 2; i++) {
          const a = (i ? dl : du) + turn + (p.wings === 'crumple' ? (i ? 25 : -10) : 0)
          const f = root.child(0, 0, a)
          const len = lens[i] * (p.wings === 'crumple' ? 0.8 : 1)
          ribbon(m, spline([f.pt(3, 0), f.pt(len * 0.45, -1.4), f.pt(len * 0.8, -0.6)]), () => 1, tone[2])
        }
      },
      true
    )
    // a rim in the wing's own mid blue-grey: the lit-side selout of a pale wing is still too light
    outlineWith(l, tone[3])
  }
  g.add(-6, wing(true), p.wings === 'blur')

  // ---- far arm: hand on the hip, elbow out behind
  const shF = torso.pt(-6, -6)
  const handF: Pt = p.fan ? head.pt(21 + p.armF[0], 3 + p.armF[1]) : [shF[0] + p.armF[0], shF[1] + p.armF[1]]
  const elbF = elbow(shF, handF, p.fan && p.armF[1] > -10 ? 1 : -1)
  if (!p.fan)
    g.add(-5, (l) => {
      fill(l, ID, union(capsule(shF, elbF, 2.8, 2.3), capsule(elbF, handF, 2.3, 1.9)), PLUM_FAR[1])
      fill(l, Frame.at(handF[0], handF[1]), oval(0.5, 0.5, 2.6, 2.3), PLUM_FAR[1])
      smooth(l)
      cel(l, { shade: 1.4, rim: 1 })
    })

  // ---- abdomen: one long striped body on the S-curve, ending in the stinger
  const base: Pt = [-6, 5]
  const path = chain(torso, base, p.abd, p.seg * (1 + p.squash * 0.03))
  const n = path.length - 1
  const width = (t: number) => 7 + 15 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)) ** 0.75 - t * 3
  const tipDir = heading(path, n) * RAD
  const tip = path[n]
  const stingEnd: Pt = [tip[0] + Math.cos(tipDir) * 9, tip[1] + Math.sin(tipDir) * 9]
  g.add(-3, (l) => {
    ribbon(l, path, width, HONEY[1])
    // the stinger, a dark tapered point
    ribbon(
      l,
      [tip, [tip[0] + Math.cos(tipDir) * 4, tip[1] + Math.sin(tipDir) * 4], stingEnd],
      (t) => 4.4 - t * 3.4,
      PLUM[1]
    )
    // stripes: the narrow waist, three bands, the dark tip
    within(l, (m) => {
      for (const [t0, t1] of STRIPES) fill(m, ID, band(path, t0, t1, 16), PLUM[1])
    })
    smooth(l)
    cel(l, { shade: 4.5, deep: 1.6, rim: 1.6 })
    // the glossy band along the lit side
    gloss(
      l,
      slice(
        offset(path, (t) => width(t) * 0.26),
        0.12,
        0.8
      ),
      () => 2,
      {
        [HONEY[1]]: HONEY[0],
        [HONEY[2]]: HONEY[1],
        [PLUM[1]]: PLUM[0],
        [PLUM[2]]: PLUM[1]
      }
    )
    if (p.sting) {
      const gx = tip[0] + Math.cos(tipDir) * 6
      const gy = tip[1] + Math.sin(tipDir) * 6
      l.set(gx, gy, FUR[0])
      l.set(gx - Math.cos(tipDir) * 1.2, gy - Math.sin(tipDir) * 1.2, PLUM[0])
    }
  })

  g.add(-1, wing(false), p.wings === 'blur')

  // ---- legs: thin, pointed, held together like a dancer
  const leg = (far: boolean) => (l: Raster) => {
    const tone = far ? PLUM_FAR : PLUM
    const hip = torso.child(far ? 0 : 3, 7, 90 - p.legs[0] - (far ? 6 : 0))
    const knee = hip.pt(10, far ? -1 : 0)
    const shin = Frame.at(knee[0], knee[1], hip.angle - p.legs[1] - 8)
    const ankle = shin.pt(10, 0)
    fill(l, ID, union(capsule(hip.pt(0, 0), knee, 2.4, 1.7), capsule(knee, ankle, 1.7, 1.3)), tone[1])
    // pointed foot
    fill(
      l,
      shin.child(10, 0, 8),
      polygon([
        [-1.5, -1.6],
        [5, 0],
        [-1.5, 1.6]
      ]),
      tone[1]
    )
    smooth(l)
    cel(l, { shade: 1.2, rim: 1 })
  }
  g.add(-0.6, leg(true))
  g.add(0.4, leg(false))

  // ---- bodice: the thorax under the collar
  g.add(0, (l) => {
    fill(l, torso, union(oval(0, 0, 10, 10.5), oval(-4, 4, 6, 5)), PLUM[1])
    smooth(l)
    cel(l, { shade: 3, rim: 1.4 })
  })

  // ---- sash: across the bodice from the far shoulder to the near hip, its end hanging from a knot
  const knot = torso.pt(-7, 6)
  g.add(1, (l) => {
    ribbon(l, spline([torso.pt(9, -6), torso.pt(2, 2), knot]), (t) => 4.6 + t * 0.6, BAND[1])
    const d = (p.sash[0] + 90) * RAD
    const wave = (s: number) => Math.sin(p.sash[2] - s * 4) * p.sash[1] * s * 1.5
    const end: Pt[] = [knot]
    for (let i = 1; i <= 4; i++) {
      const s = i / 4
      const a = d + s * 0.25 * Math.sign(p.sash[0] || 1)
      end.push([
        knot[0] + Math.cos(a) * 15 * s - Math.sin(a) * wave(s),
        knot[1] + Math.sin(a) * 15 * s + Math.cos(a) * wave(s)
      ])
    }
    const sp = spline(end)
    ribbon(l, sp, (t) => 3.4 + t * 2.6, BAND[1])
    // the swallowtail cut
    const m = sp.length - 1
    const a = heading(sp, m)
    fill(
      l,
      Frame.at(sp[m][0], sp[m][1], a),
      polygon([
        [3.5, -3.6],
        [-2, 0],
        [3.5, 3.6]
      ]),
      0
    )
    fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 3, 2.7), BAND[1])
    smooth(l)
    cel(l, { shade: 1.6, rim: 1.2 })
    // the fold line on the hanging end, and a gold clasp on the knot
    within(
      l,
      (mm) =>
        ribbon(
          mm,
          slice(
            offset(sp, () => -0.6),
            0.35,
            0.65
          ),
          () => 1,
          BAND[2]
        ),
      true
    )
    l.stamp(['.y.', 'yhy', '.y.'], Math.round(knot[0]) - 1, Math.round(knot[1]) - 1, { y: HONEY[1], h: HONEY[0] })
  })

  // ---- collar: the great white fur ruff round the neck, the brightest mass of the figure
  const collarAt = torso.pt(1, -10)
  g.add(2, (l) => {
    fill(l, torso, union(oval(1, -11, 16, 8.5), oval(-8, -8, 9, 7.5), oval(10, -8, 9, 7.5)), FUR[1])
    for (const [u, v, rows] of [
      [-13, -2, TUFT_DOWN],
      [-6.5, 0, TUFT_DOWN],
      [0, 0.5, TUFT_DOWN_R],
      [6.5, 0, TUFT_DOWN_R],
      [13, -1.5, TUFT_DOWN_R],
      [18, -5, TUFT_DOWN_R]
    ] as const)
      stampAt(l, torso, rows, u, v, { f: FUR[1] })
    smooth(l)
    cel(l, { shade: 4, deep: 1.4, rim: 1.6, tooth: 2.5, pitch: 4, origin: collarAt })
    dimEdge(l, FUR[0], FUR[1])
    shadow(l, head.moved(0, 2.5), oval(3, 3, 11, 9))
  })

  // ---- antennae: they curl up from the hair, gold bobbles at the tips
  const antenna = (far: boolean) => (l: Raster) => {
    const tone = far ? PLUM_FAR : PLUM
    const root = head.child(far ? -5 : 2, -11, far ? -18 - p.ant[1] : 12 - p.ant[0])
    const pts = far
      ? [root.pt(0, 0), root.pt(-1, -7), root.pt(-4, -13), root.pt(-8, -15)]
      : [root.pt(0, 0), root.pt(1, -7), root.pt(4, -13), root.pt(8, -15)]
    ribbon(l, spline(pts), (t) => 2.4 - t * 0.6, tone[1])
    const [bx, by] = pts[3]
    smooth(l)
    cel(l, { shade: 1.4, rim: 1 })
    l.stamp(BOBBLE, Math.round(bx) - 2, Math.round(by) - 2, far ? BOBBLE_FAR : BOBBLE_KEY)
  }
  g.add(2.6, antenna(true))
  g.add(2.7, antenna(false))

  // ---- head: pale face under a dark glossy bob, one silhouette
  const face = union(oval(1, 1, 11.5, 11), oval(5.5, 5, 8, 6.5))
  const hairShape = union(oval(-1.5, -2.5, 13.5, 12), capsule([-8, -1], [-8, 9], 6.5, 5.2), oval(6, -8, 8, 5))
  const window = union(overlap(oval(5, 3.5, 10.5, 10), half([0, -3.2], 0, 1)), oval(9, 6, 6, 5.5))
  g.add(3, (l) => {
    fill(l, head, union(face, hairShape), SKIN[1])
    tint(l, head, minus(hairShape, window), PLUM[1])
    smooth(l)
    cel(l, { shade: 3, deep: 1, rim: 1.4 })
    // the sheen on the bob: a bright arc across the crown of the head
    within(
      l,
      (m) => {
        ribbon(m, spline([head.pt(-10, -4), head.pt(-6, -9), head.pt(1, -11.2)]), () => 1.6, PLUM[0])
      },
      true
    )
    // a cheek blush and the shadow of the fringe on the brow
    within(l, (m) => fill(m, head, oval(1, 6, 2.6, 1.4), BAND[0]), true)
  })
  // ---- face: stamps kept on the head (nothing may leave its silhouette)
  g.add(
    3.2,
    (l) => {
      // a mask of the head, so the stamps can be clipped to it
      fill(l, head, union(face, hairShape), SKIN[1])
      const mask = l.clone()
      l.data.fill(0)
      const d = new Raster(l.w, l.h)
      stampAt(d, head, EYES[p.eyes], 2.5, 1.5, EYE_KEY)
      stampAt(d, head, EYES_FAR[p.eyes], 11, 1.5, EYE_KEY)
      const [bn, bf] = BROWS[p.brow]
      stampAt(d, head, bn, 2.5, -3, EYE_KEY)
      stampAt(d, head, bf, 11.5, -2.5, EYE_KEY)
      stampAt(d, head, MOUTHS[p.mouth], 9, 9, MOUTH_KEY)
      // the nose and a beauty mark
      stampAt(d, head, ['K', 'K'], 14, 4.5, MOUTH_KEY)
      stampAt(d, head, ['k'], 12.5, 11.5, MOUTH_KEY)
      for (let i = 0; i < d.data.length; i++) if (d.data[i] && mask.data[i]) l.data[i] = d.data[i]
    },
    false
  )

  // ---- crown: a crisp stamp while it sits straight, a drawn shape when it is knocked askew
  if (p.crown)
    g.add(3.5, (l) => {
      const [cu, cv, tilt] = p.crown!
      if (Math.abs(tilt) < 4) stampAt(l, head, CROWN, cu - 1, -14 + cv, CROWN_KEY)
      else crownShape(l, head.child(cu - 1, -12.5 + cv, tilt))
    })

  // ---- the far hand fanning her face (recover)
  if (p.fan)
    g.add(2.9, (l) => {
      fill(l, ID, union(capsule(shF, elbF, 2.8, 2.3), capsule(elbF, handF, 2.3, 1.9)), PLUM[1])
      const hand = Frame.at(handF[0], handF[1], -70 + p.armF[0] * 4)
      fill(
        l,
        hand,
        union(oval(2.5, 0, 3.6, 2.6), capsule([3, -1], [7.5, -2.4], 1.1, 1), capsule([3, 1], [7.5, 1.6], 1.1, 1)),
        PLUM[1]
      )
      smooth(l)
      cel(l, { shade: 1.4, rim: 1 })
    })

  // ---- near arm with the sceptre
  const elbN = elbow(shN, handN, 1)
  if (rod) g.add(p.scepBack ? -5.5 : 4, (l) => sceptre(l, rod, p.jewel))
  g.add(4.5, (l) => {
    fill(l, ID, union(capsule(shN, elbN, 2.9, 2.4), capsule(elbN, handN, 2.4, 2)), PLUM[1])
    fill(l, Frame.at(handN[0], handN[1]), oval(0.4, 0, 2.7, 2.5), PLUM[1])
    smooth(l)
    cel(l, { shade: 1.4, rim: 1 })
  })
  // the glint on the jewel and the sparkles of the sceptre's trail (outlined, so they read on any ground)
  const sparks: Pt[] = [...p.sparks]
  if (p.jewel && rod) sparks.push(rod.pt(27, -1))
  if (sparks.length)
    g.add(
      6,
      (l) => {
        for (const [i, [x, y]] of sparks.entries())
          l.stamp(i === sparks.length - 1 && p.jewel ? SPARK : SPARK_SMALL, Math.round(x) - 2, Math.round(y) - 2, {
            w: FUR[0],
            y: HONEY[0]
          })
        deepRim(l, true)
      },
      false
    )

  // ---- the crown and the sceptre knocked loose
  if (p.looseScep) g.add(5, (l) => sceptre(l, Frame.at(p.looseScep![0], p.looseScep![1], p.looseScep![2]), false))
  if (p.looseCrown) g.add(5.5, (l) => crownShape(l, Frame.at(p.looseCrown![0], p.looseCrown![1], p.looseCrown![2])))

  // ---- speed streaks behind the dash, in her own colours
  if (p.streaks > 0)
    g.add(
      5.8,
      (l) => {
        // behind the head (the rear of the dash), above, through and below it
        const [hx, hy] = head.pt(0, 0)
        const rows: [number, number, number, number, number][] = [
          [-9, -15, 14, 1.6, HONEY[1]],
          [2, -16, 18, 2, WING[1]],
          [12, -12, 12, 1.6, HONEY[1]]
        ]
        for (const [i, [dy, dx, len, w, c]] of rows.entries()) {
          const sx = Math.round(hx + dx - ((p.streaks * 3 + i * 2) % 4))
          const y = Math.round(hy + dy)
          ribbon(
            l,
            [
              [sx, y],
              [Math.max(3, sx - len), y]
            ],
            (t) => w * (1 - t * 0.7),
            c
          )
        }
        cel(l, { shade: 1, rim: 0.8 })
        deepRim(l)
      },
      false
    )

  // ---- stars over a knocked-out head
  if (p.stars >= 0)
    g.add(7, (l) => {
      const [cx, cy] = head.pt(0, -20)
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 12) - 2,
          Math.round(cy + Math.sin(a) * 3.5) - 2,
          {
            y: HONEY[1],
            Y: HONEY[0]
          }
        )
      }
    })

  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const P = beePose
const phase = (i: number, n: number) => (i / n) * TAU
/** The flutter: spread, blur, down — three beats, so the loop never flips one pixel back and forth. */
const BEAT: readonly Wings[] = ['spread', 'blur', 'down']

/** idle: hovering on a blur, the body bobbing slowly on its S-curve, the abdomen swinging a beat late. */
const idle = memo(() => {
  const N = 6
  const bob = Array.from({ length: N }, (_, i) => Math.sin(phase(i, N)))
  const swing = lag(bob, { stiffness: 0.35, damping: 0.5, loop: true })
  const antLag = lag(bob, { stiffness: 0.5, damping: 0.4, loop: true })
  return Array.from({ length: N }, (_, i) =>
    P({
      y: Math.round(bob[i] * 1.5),
      lean: bob[i] * 1.5,
      head: [0, 0],
      nod: -4 + bob[i] * 1.5,
      abd: [148 + swing[i] * 6, 110 + swing[i] * 8, 70 + swing[i] * 10, 32 + swing[i] * 12],
      wings: BEAT[i % 3],
      armN: [12, 5 - bob[i] * 0.5],
      scep: 8 + bob[i] * 3,
      ant: [antLag[i] * 12, antLag[i] * 10],
      sash: [70 + swing[i] * 12, 1, phase(i, N)],
      legs: [swing[i] * 6, 6]
    })
  )
})

/**
 * intro: she draws herself up, sweeps the sceptre over her head in an arc (a trail of sparkles), points it at the
 * hero with a cruel smile (held, the jewel glinting) while the abdomen curls forward to show the stinger.
 */
const intro = memo(() => {
  const point: Partial<BeePose> = {
    y: 2,
    lean: -4,
    nod: -6,
    eyes: 'cruel',
    brow: 'arch',
    mouth: 'smile',
    armN: [17, -3],
    scep: 82,
    abd: [128, 88, 44, 6],
    legs: [10, 10],
    ant: [-6, -4],
    jewel: true,
    sting: true
  }
  const poses = [
    P({ eyes: 'disdain', armN: [10, 8], scep: 18, wings: 'spread' }),
    P({
      y: 3,
      lean: -7,
      nod: -10,
      eyes: 'shut',
      brow: 'up',
      mouth: 'line',
      armN: [14, 3],
      scep: 157,
      wings: 'blur',
      abd: [152, 118, 78, 42],
      ant: [10, 8],
      sash: [80, 1.4, 1]
    }),
    P({
      y: 5,
      lean: -9,
      nod: -12,
      eyes: 'cruel',
      brow: 'up',
      mouth: 'line',
      armN: [17, -23],
      scep: -8,
      wings: 'down',
      abd: [150, 112, 70, 32],
      ant: [14, 12],
      sash: [86, 1.4, 2]
    }),
    P({
      y: 4,
      lean: -6,
      nod: -8,
      eyes: 'cruel',
      brow: 'arch',
      mouth: 'smile',
      armN: [18, -14],
      scep: 40,
      wings: 'spread',
      abd: [140, 100, 58, 20],
      ant: [4, 4],
      sash: [74, 1.4, 3]
    }),
    P({ ...point, wings: 'blur', sash: [62, 1.2, 4] }),
    P({ ...point, y: 1.5, wings: 'down', sash: [66, 1.2, 5], jewel: false, sting: false }),
    P({ ...point, wings: 'spread', sash: [70, 1, 6] }),
    P({ ...point, y: 1, wings: 'blur', sash: [64, 1, 7], jewel: false })
  ]
  // the sweep leaves sparkles where the jewel was on the two frames before (frames 2..4)
  return poses.map((pose, i) => {
    if (i < 2 || i > 4) return pose
    const trail = [jewelAt(poses[i - 1])]
    if (i > 2) trail.unshift(jewelAt(poses[i - 2]))
    return { ...pose, sparks: trail.filter((q): q is Pt => q !== null) }
  })
})

/** hurt: shock — crown askew, eyes wide, arms thrown up, wings stalling; the recoil; she straightens the crown, furious. */
const hurt = memo(() => [
  P({
    x: -3,
    y: 3,
    lean: -12,
    nod: -14,
    head: [-1, -1],
    eyes: 'wide',
    brow: 'up',
    mouth: 'o',
    crown: [-2, -3, -24],
    armN: [15, -15],
    scep: -6,
    armF: [-6, -14],
    wings: 'crumple',
    abd: [160, 130, 96, 62],
    ant: [30, 26],
    legs: [-20, 20],
    sash: [100, 1.8, 0]
  }),
  P({
    x: -7,
    y: -1,
    lean: 10,
    nod: 10,
    eyes: 'hurt',
    brow: 'flat',
    mouth: 'o',
    crown: [1, -1, 26],
    armN: [8, 4],
    scep: 40,
    armF: [-3, 8],
    wings: 'down',
    abd: [130, 96, 58, 22],
    ant: [-16, -14],
    legs: [18, 30],
    sash: [40, 1.4, 1.5]
  }),
  P({
    x: -4,
    y: 1,
    lean: -3,
    nod: -2,
    eyes: 'fury',
    brow: 'fury',
    mouth: 'grit',
    crown: [0, -1, 9],
    armN: [13, 7],
    scep: 34,
    fan: true,
    armF: [-15, -16],
    wings: 'blur',
    abd: [145, 106, 66, 28],
    ant: [6, 4],
    legs: [4, 8],
    sash: [64, 1, 3]
  })
])

/** move: flying forward — leaning into it, abdomen streaming behind, a fast flutter, the sceptre held like a lance. */
const move = memo(() => {
  const N = 8
  const bob = Array.from({ length: N }, (_, i) => Math.sin(phase(i, N)))
  const trail = lag(bob, { stiffness: 0.35, damping: 0.5, loop: true })
  return Array.from({ length: N }, (_, i) =>
    P({
      y: 1 + bob[i] * 1.5,
      lean: 16 + bob[i],
      nod: -16,
      eyes: i === 5 ? 'cruel' : 'disdain',
      brow: 'arch',
      mouth: i === 5 || i === 6 ? 'smile' : 'line',
      abd: [172 + trail[i] * 6, 166 + trail[i] * 9, 156 + trail[i] * 12, 140 + trail[i] * 16],
      wings: (['spread', 'blur', 'down', 'blur'] as const)[i % 4],
      wingTurn: i % 4 === 3 ? 10 : 0,
      armN: [15, 1 + bob[i] * 0.5],
      scep: 62,
      armF: [-7, 9],
      ant: [22 + trail[i] * 8, 20 + trail[i] * 8],
      legs: [-30 + trail[i] * 6, 20],
      sash: [118 + trail[i] * 10, 1.6, phase(i, N) * 2]
    })
  )
})

/** windup: she rears back and curls up, the abdomen swinging under and forward until the stinger points at the hero. */
const windup = memo(() => {
  const set: Partial<BeePose> = {
    x: -3,
    y: 4,
    lean: -16,
    nod: -2,
    head: [-1, 1],
    eyes: 'fury',
    brow: 'fury',
    mouth: 'grit',
    abd: [96, 52, 10, -4],
    armN: [9, 9],
    scep: -64,
    scepBack: true,
    armF: [-8, 6],
    legs: [40, 50],
    ant: [16, 14],
    sash: [60, 1.2, 0],
    sting: true,
    wings: 'spread',
    wingTurn: -12
  }
  return [
    P({
      x: -2,
      y: 3,
      lean: -9,
      eyes: 'disdain',
      brow: 'flat',
      mouth: 'line',
      abd: [120, 80, 38, 10],
      armN: [12, 8],
      scep: 12,
      legs: [20, 30],
      ant: [8, 8],
      wings: 'blur',
      sash: [70, 1, 1]
    }),
    P({ ...set, sting: false }),
    P({ ...set, x: -2, y: 4.5, wings: 'blur', wingTurn: -6, sash: [62, 1.2, 1.5] }),
    P({ ...set, x: -3.5, y: 3.5, abd: [98, 54, 12, -2], wings: 'spread', wingTurn: -14, sash: [58, 1.2, 3] })
  ]
})

/** attack: the stinger dash — the whole body a spear, stinger first, head behind, wings swept back in a blur. */
const attack = memo(() => {
  const N = 6
  return Array.from({ length: N }, (_, i) => {
    const w = Math.sin(phase(i, N))
    return P({
      x: -6,
      y: 8 + w * 0.8,
      lean: -76,
      squash: -1.5,
      nod: 40,
      head: [0, 1],
      eyes: 'fury',
      brow: 'fury',
      mouth: i % 3 === 1 ? 'grit' : 'smile',
      abd: [92 + w * 2, 90, 88 - w * 2, 86],
      seg: 10.5,
      wings: i % 2 ? 'blur' : 'back',
      wingTurn: i % 2 ? 50 : 70,
      armN: [9, 7],
      scep: 30,
      scepBack: true,
      armF: [-10, 2],
      ant: [86 + w * 6, 36 + w * 6],
      legs: [-20, 110],
      sash: [130 + w * 8, 1.6, phase(i, N) * 2],
      sting: i % 2 === 0,
      streaks: i + 1
    })
  })
})

/** recover: out of breath — drooping in the air, fanning herself with a hand, wings beating slowly. */
const recover = memo(() =>
  [0, 1, 2, 3].map((i) => {
    const s = Math.sin(phase(i, 4))
    return P({
      y: 0.5 + s * 0.8,
      lean: 8,
      nod: 12,
      head: [0, 1.5],
      eyes: 'tired',
      brow: 'flat',
      mouth: 'pant',
      abd: [128, 100, 82, 66],
      armN: [9, 11],
      scep: 46,
      fan: true,
      armF: [s * 2.5, 2 + s],
      wings: i % 2 ? 'down' : 'spread',
      wingTurn: i % 2 ? 8 : 18,
      wingLen: 0.94,
      ant: [-14 + s * 4, -12 + s * 4],
      legs: [6, 4],
      sash: [24 + s * 4, 0.6, i]
    })
  })
)

/**
 * defeat: hit — the crown and the sceptre fly off, the wings crumple, she spirals down, lands on her back with a
 * bounce, the abdomen curled and the legs in the air; stars circle over her head on the last two frames.
 */
const defeat = memo(() => {
  const lying: Partial<BeePose> = {
    x: 0,
    y: -29,
    lean: -96,
    nod: 28,
    head: [0, 0],
    eyes: 'dizzy',
    brow: 'flat',
    mouth: 'wave',
    crown: null,
    scep: null,
    abd: [70, 34, 0, -34],
    seg: 9.5,
    wings: 'crumple',
    wingTurn: 80,
    wingLen: 0.85,
    armN: [8, -8],
    armF: [-3, -9],
    legs: [70, 30],
    ant: [-30, -40],
    sash: [-80, 0.6, 0],
    looseCrown: [17, 115, 18],
    looseScep: [89, 116, -18]
  }
  return [
    P({
      x: -3,
      y: 4,
      lean: -16,
      nod: -10,
      eyes: 'hurt',
      brow: 'up',
      mouth: 'o',
      crown: null,
      scep: null,
      looseCrown: [60, 18, -30],
      looseScep: [90, 30, -60],
      armN: [6, -12],
      armF: [-6, -12],
      wings: 'crumple',
      abd: [160, 130, 96, 62],
      ant: [30, 26],
      legs: [-20, 20],
      sash: [100, 1.8, 0]
    }),
    P({
      x: -2,
      y: 0,
      lean: 40,
      nod: -16,
      eyes: 'dizzy',
      brow: 'flat',
      mouth: 'o',
      crown: null,
      scep: null,
      looseCrown: [48, 14, -100],
      looseScep: [98, 31, -140],
      wings: 'crumple',
      abd: [140, 110, 80, 50],
      armN: [9, -6],
      armF: [-8, -4],
      ant: [-20, -20],
      legs: [-30, 40],
      sash: [140, 1.6, 1]
    }),
    P({
      x: 2,
      y: -14,
      lean: 150,
      nod: -60,
      eyes: 'dizzy',
      brow: 'flat',
      mouth: 'o',
      crown: null,
      scep: null,
      looseCrown: [36, 40, -200],
      looseScep: [108, 60, -230],
      wings: 'crumple',
      abd: [140, 110, 80, 50],
      armN: [8, 6],
      armF: [-8, 6],
      ant: [20, 20],
      legs: [-20, 40],
      sash: [-120, 1.6, 2]
    }),
    P({
      x: 2,
      y: -8,
      lean: 240,
      nod: -96,
      eyes: 'hurt',
      brow: 'flat',
      mouth: 'o',
      crown: null,
      scep: null,
      looseCrown: [26, 86, -290],
      looseScep: [96, 100, -330],
      wings: 'crumple',
      abd: [120, 80, 40, 0],
      armN: [8, 6],
      armF: [-8, 6],
      ant: [-20, -20],
      legs: [40, 40],
      sash: [-60, 1.6, 3]
    }),
    P({ ...lying, y: -31, squash: 1.6, eyes: 'hurt', mouth: 'o', looseCrown: [19, 112, -350], sash: [-60, 1.4, 4] }),
    P({ ...lying, y: -26, squash: -0.6, eyes: 'shut', legs: [80, 20], abd: [74, 40, 8, -26], sash: [-100, 1, 5] }),
    P({ ...lying, stars: 0, sash: [-84, 0.6, 6] }),
    P({ ...lying, stars: 1 / 6, abd: [70, 34, 2, -30], ant: [-26, -44], sash: [-80, 0.6, 7] })
  ]
})

const draw = (poses: BeePose[]) => poses.map(drawBee)

export const sheets: SheetModule = {
  beeBoss: () => ({
    idle: lazyAnim(() => draw(idle()), 8, true),
    intro: lazyAnim(() => draw(intro()), 10, false, { sustain: 2 }),
    hurt: lazyAnim(() => draw(hurt()), 12, false),
    defeat: lazyAnim(() => draw(defeat()), 10, false, { sustain: 2 }),
    move: lazyAnim(() => draw(move()), 12, true),
    windup: lazyAnim(() => draw(windup()), 12, false, { sustain: 2 }),
    attack: lazyAnim(() => draw(attack()), 16, true),
    recover: lazyAnim(() => draw(recover()), 8, true)
  })
}
