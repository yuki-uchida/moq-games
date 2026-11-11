/**
 * きつね旋風 (`foxBoss`): the whirlwind ninja fox, captain of the pursuers. A pose-parametric character in the
 * style of the hero (ball-shaded volumes, white patches painted onto them, stamped eyes with one highlight),
 * assembled from parts by a small rig that can also tilt the whole body (dizzy sway, the fall) with correct
 * lighting. The spin dash is a separate polar drawing: a curled fox, a spiral tail and trailing headband ends.
 */
import type { SheetModule } from '../../module'
import { C, R } from '../../palette'
import { Raster, ball, bar, farRamp, outline, shadeEdges, shadeIndex, type Pt, type Ramp } from '../../raster'
import { lazyAnim, memo } from '../../sheet'

const FOX = R.foxOrange
const FAR = farRamp(FOX)
const WHITE = R.paper
const DARK = R.darkFur
const FAR_DARK = farRamp(DARK)
const BAND = R.bandana
const GOLD = R.gold

export type Eyes = 'sly' | 'smirk' | 'glare' | 'wide' | 'swirl' | 'hurt' | 'closed' | 'dead'
export type Mouth = 'smirk' | 'grin' | 'open' | 'o' | 'flat' | 'tongue'

// ---------------------------------------------------------------------------------------------- rig

/** Light rotation of the part being drawn, so balls keep their top-left light when the body is tilted. */
let lightTurn = 0

/** Like `ball`, but the light follows the rig's tilt. */
function lit(l: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, spec = true) {
  const c = Math.cos(lightTurn)
  const s = Math.sin(lightTurn)
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      const nz = Math.sqrt(Math.max(0, 1 - q))
      l.set(x, y, ramp[shadeIndex(nx * c - ny * s, nx * s + ny * c, nz, spec)])
    }
  return l
}

/** One part turned about the pivot: rotated on its own so the outline can be drawn afterwards. */
function turn(layer: Raster, angle: number, pivot: Pt) {
  const b = layer.bounds()
  if (!b) return layer
  let s = Math.ceil(Math.hypot(b.w, b.h)) + 4
  s += s % 2
  const x0 = Math.round(b.x + b.w / 2 - s / 2)
  const y0 = Math.round(b.y + b.h / 2 - s / 2)
  const turned = layer.crop(x0, y0, s, s).rotate(angle)
  const dx = x0 + s / 2 - pivot[0]
  const dy = y0 + s / 2 - pivot[1]
  const c = Math.cos(angle)
  const sn = Math.sin(angle)
  const nx = pivot[0] + dx * c - dy * sn
  const ny = pivot[1] + dx * sn + dy * c
  return new Raster(layer.w, layer.h).blit(turned, nx - s / 2, ny - s / 2)
}

/** Depth-ordered parts with per-part outlines; the whole body may be tilted about a pivot and shifted. */
class Rig {
  private list: { depth: number; seq: number; draw: (l: Raster) => void; line: boolean }[] = []
  constructor(
    private angle = 0,
    private pivot: Pt = [64, 120],
    private shift: Pt = [0, 0]
  ) {}

  add(depth: number, draw: (l: Raster) => void, line = true) {
    this.list.push({ depth, seq: this.list.length, draw, line })
    return this
  }

  render() {
    const out = new Raster(128, 128)
    this.list.sort((a, b) => a.depth - b.depth || a.seq - b.seq)
    for (const it of this.list) {
      let layer = new Raster(128, 128)
      lightTurn = this.angle
      it.draw(layer)
      lightTurn = 0
      // shift first, so the turned body never swings out of the canvas
      if (this.shift[0] || this.shift[1]) layer = layer.shifted(this.shift[0], this.shift[1])
      if (this.angle) layer = turn(layer, this.angle, [this.pivot[0] + this.shift[0], this.pivot[1] + this.shift[1]])
      const b = layer.bounds()
      if (!b) continue
      const crop = layer.crop(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
      if (it.line) outline(crop)
      out.blit(crop, b.x - 2, b.y - 2)
    }
    return out
  }
}

/** Paints an ellipse only where the layer already has pixels. */
function patch(l: Raster, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1.0001) l.paint(x, y, c)
    }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

function bezier(p: Pt[], t: number): Pt {
  const u = 1 - t
  return [
    u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
    u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]
  ]
}

// ---------------------------------------------------------------------------------------------- pose

export interface FoxPose {
  /** Hips lowered (px). */
  crouch: number
  /** Chest and head pushed forward (px). */
  lean: number
  headDy: number
  /** Near and far foot: forward offset and lift (px). */
  nearFoot: readonly [number, number]
  farFoot: readonly [number, number]
  /** Hand positions relative to the shoulder. */
  nearHand: Pt
  farHand: Pt
  /** Tail: streaming straight back (0..1), curled round the front (0..1), swing (-1..1), fluff scale. */
  tailStream: number
  tailCurl: number
  tailSwing: number
  puff: number
  /** Headband ends: wave phase (radians), how straight they stream (0..1), droop (px per segment). */
  bandPhase: number
  bandStream: number
  bandDroop: number
  eyes: Eyes
  mouth: Mouth
  /** Ears folded back (px). */
  earBack: number
  /** Whole-body tilt (radians, clockwise) about the feet, and a shift after it. */
  angle: number
  shift: Pt
  /** Dizzy stars orbiting the head (phase, radians) or undefined. */
  stars?: number
  /** Wind arcs round the body (0..3 of them). */
  wind: number
  sweat: boolean
  /** Rotation pivot for `angle` (default the feet). */
  pivot?: Pt
  /** Tail control points relative to the root, replacing the stream/curl blend. */
  tailPts?: Pt[]
}

export const foxPose = (p: Partial<FoxPose> = {}): FoxPose => ({
  crouch: 0,
  lean: 0,
  headDy: 0,
  nearFoot: [0, 0],
  farFoot: [0, 0],
  nearHand: [12, 7],
  farHand: [10, 4],
  tailStream: 0,
  tailCurl: 0,
  tailSwing: 0,
  puff: 1,
  bandPhase: 0,
  bandStream: 0,
  bandDroop: 0,
  eyes: 'sly',
  mouth: 'smirk',
  earBack: 0,
  angle: 0,
  shift: [0, 0],
  wind: 0,
  sweat: false,
  ...p
})

const EYE_KEY = { K: C.black, w: C.white, i: C.ink, s: FOX[0], b: FOX[3], g: GOLD[1], x: GOLD[0] }

/** Hand-placed eye shapes: [near eye, far eye]. */
const EYE_SHAPES: Record<Eyes, readonly [readonly string[], readonly string[]]> = {
  sly: [
    ['ii....', 'iKKKK.', 'KwKKKK', '.KKKK.'],
    ['i....', 'iKKK.', 'KwKKK', '.KKK.']
  ],
  smirk: [
    ['iiiiii', 'KwKKKK', '.KKKK.', '......'],
    ['iiiii', 'KwKKK', '.KKK.', '.....']
  ],
  glare: [
    ['ii....', '.iiii.', 'KwKKKi', '.KKKK.'],
    ['i....', '.iiii', 'KwKKi', '.KKK.']
  ],
  wide: [
    ['.KKK.', 'KwwwK', 'KwKwK', 'KwwwK', '.KKK.'],
    ['.KK.', 'KwwK', 'KKwK', 'KwwK', '.KK.']
  ],
  swirl: [
    ['.KKK.', 'KwwwK', 'KwKwK', 'KwwKK', '.KKK.'],
    ['.KK.', 'KwwK', 'KKwK', 'KwKK', '.KK.']
  ],
  hurt: [
    ['i....', '.ii..', '...ii', '.ii..', 'i....'],
    ['...i', '.ii.', 'i...', '.ii.', '...i']
  ],
  closed: [
    ['......', '......', 'i....i', '.iiii.', '......'],
    ['.....', '.....', 'i...i', '.iii.', '.....']
  ],
  dead: [
    ['K...K', '.K.K.', '..K..', '.K.K.', 'K...K'],
    ['K..K', '.KK.', '.KK.', '.KK.', 'K..K']
  ]
}

function eyes(l: Raster, x: number, y: number, kind: Eyes) {
  const [near, far] = EYE_SHAPES[kind]
  l.stamp(near, x, y, EYE_KEY)
  l.stamp(far, x + 9, y + 1, EYE_KEY)
}

/** The mouth on the underside of the snout; (x, y) is the snout's lower rim. */
function mouth(l: Raster, x: number, y: number, kind: Mouth) {
  switch (kind) {
    case 'smirk':
      l.line(x - 2, y, x + 3, y + 1, C.ink)
      l.line(x + 3, y + 1, x + 5, y - 1, C.ink)
      break
    case 'grin':
      l.line(x - 3, y - 1, x + 2, y + 1, C.ink)
      l.line(x + 2, y + 1, x + 6, y - 2, C.ink)
      l.rect(x - 1, y + 1, 4, 1, C.white)
      break
    case 'flat':
      l.rect(x - 2, y, 7, 1, C.ink)
      break
    case 'o':
      l.ellipse(x + 3, y + 1.5, 2.5, 3, C.mouth)
      l.rect(x + 2, y + 3, 2, 1, C.tongue)
      break
    case 'open':
      l.ellipse(x + 2.5, y + 1.5, 4.5, 3.5, C.mouth)
      l.rect(x, y - 2, 2, 2, C.white)
      l.rect(x + 4, y - 2, 2, 2, C.white)
      l.rect(x + 1, y + 2, 4, 1, C.tongue)
      break
    case 'tongue':
      l.line(x - 2, y, x + 4, y, C.ink)
      l.rect(x + 1, y + 1, 3, 3, C.tongue)
      l.rect(x + 1, y + 3, 3, 1, C.mouth)
      break
  }
}

const REST_TAIL: Pt[] = [
  [0, 0],
  [-17, 7],
  [-36, -2],
  [-30, -36]
]
const STREAM_TAIL: Pt[] = [
  [0, 0],
  [-18, 1],
  [-37, -1],
  [-56, -8]
]
const CURL_TAIL: Pt[] = [
  [0, 4],
  [-10, 18],
  [14, 20],
  [36, 2]
]

/** Draws the big brush: a bezier spine with a fluffy radius profile and a white tip. */
function drawTail(l: Raster, root: Pt, p: FoxPose) {
  let ctl = REST_TAIL.map((q, i) => lerpPt(q, STREAM_TAIL[i], p.tailStream))
  ctl = ctl.map((q, i) => lerpPt(q, CURL_TAIL[i], p.tailCurl))
  if (p.tailPts) ctl = p.tailPts.map((q): Pt => [q[0], q[1]])
  ctl[3] = [ctl[3][0] + p.tailSwing * 8 * (1 - p.tailCurl), ctl[3][1] + Math.abs(p.tailSwing) * 3 * (1 - p.tailCurl)]
  ctl[2] = [ctl[2][0], ctl[2][1] + p.tailSwing * 4 * (1 - p.tailCurl)]
  const pts = ctl.map((q): Pt => [root[0] + q[0], root[1] + q[1]])
  const N = 34
  const radius = (t: number) => (3 + 9.5 * Math.sin(Math.PI * Math.min(1, t * 1.08) ** 0.8)) * p.puff
  const body: { c: Pt; r: number; t: number }[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    body.push({ c: bezier(pts, t), r: radius(t), t })
  }
  // fur tufts jut out of the outline
  for (const t of [0.34, 0.52, 0.68, 0.84]) {
    const a = bezier(pts, t - 0.02)
    const b = bezier(pts, t + 0.02)
    const m = bezier(pts, t)
    const nx = -(b[1] - a[1])
    const ny = b[0] - a[0]
    const k = Math.hypot(nx, ny) || 1
    const side = t > 0.5 ? 1 : -1
    const r = radius(t)
    body.push({ c: [m[0] + (nx / k) * (r - 0.5) * side, m[1] + (ny / k) * (r - 0.5) * side], r: 3.4 * p.puff, t })
  }
  body.sort((a, b) => a.t - b.t)
  for (const s of body) l.ellipse(s.c[0], s.c[1], s.r, s.r, s.t > 0.8 ? WHITE[1] : FOX[1])
  shadeEdges(l, FOX, 2, true)
  shadeEdges(l, WHITE, 2, true)
  // a few strands of grain along the brush
  for (let i = 3; i < N - 8; i += 3) {
    const a = bezier(pts, i / N)
    const b = bezier(pts, (i + 2) / N)
    const off = radius(i / N) * 0.45
    l.paint(a[0] + 1, a[1] + off, FOX[2])
    l.paint(b[0] + 2, b[1] + off, FOX[2])
  }
  return pts
}

function leg(l: Raster, hip: Pt, foot: Pt, ramp: Ramp, sock: Ramp, w: number) {
  const dist = Math.hypot(foot[0] - hip[0], foot[1] - hip[1])
  const k = Math.max(2, Math.min(10, (21 - dist) * 0.9 + 3))
  const knee: Pt = [(hip[0] + foot[0]) / 2 + k, (hip[1] + foot[1]) / 2]
  const ankle: Pt = [foot[0], foot[1] - 2]
  bar(l, hip, knee, w + 1, ramp[1])
  bar(l, knee, ankle, w, sock[1])
  l.ellipse(foot[0] + 2.5, foot[1] - 0.5, 6, 3, sock[1])
  shadeEdges(l, ramp, 1, false)
  shadeEdges(l, sock, 1, false)
}

function arm(l: Raster, shoulder: Pt, hand: Pt, ramp: Ramp, sock: Ramp) {
  const mid: Pt = [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2]
  const dx = hand[0] - shoulder[0]
  const dy = hand[1] - shoulder[1]
  const len = Math.hypot(dx, dy) || 1
  let nx = -dy / len
  let ny = dx / len
  if (ny < 0) {
    nx = -nx
    ny = -ny
  }
  const bend = Math.max(1, 6 - len * 0.12)
  const elbow: Pt = [mid[0] + nx * bend, mid[1] + ny * bend]
  bar(l, shoulder, elbow, 6, ramp[1])
  bar(l, elbow, hand, 5, ramp[1])
  shadeEdges(l, ramp, 1, false)
  lit(l, hand[0], hand[1], 3.6, 3.4, sock, false)
}

/** One headband streamer from the knot. */
function streamer(l: Raster, knot: Pt, p: FoxPose, i: number) {
  const segs = i === 0 ? 6 : 5
  const pts: Pt[] = []
  for (let j = 0; j <= segs; j++) {
    const run = lerp(4.6, 5.8, p.bandStream)
    const amp = lerp(1, 0.45, p.bandStream)
    pts.push([
      knot[0] - j * run,
      knot[1] +
        i * 3 +
        Math.sin(p.bandPhase + j * 0.9 + i * 1.7) * (0.8 + j * 0.55) * amp +
        p.bandDroop * j * j * 0.18 -
        (i === 0 ? 1 : 0)
    ])
  }
  // a ribbon drawn column by column: smooth, tapering, light on top and dark underneath
  const x0 = pts[0][0]
  const x1 = pts[segs][0]
  for (let x = Math.round(x0); x >= Math.round(x1); x--) {
    const f = Math.max(0, Math.min(1, (x0 - x) / (x0 - x1 || 1)))
    const j = Math.min(segs - 1, Math.floor(f * segs))
    const u = f * segs - j
    const y = lerp(pts[j][1], pts[j + 1][1], u)
    const th = f < 0.4 ? 5 : f < 0.75 ? 4 : 3
    const top = Math.round(y - th / 2)
    for (let k = 0; k < th; k++) l.set(x, top + k, k === 0 ? BAND[0] : k === th - 1 && th > 2 ? BAND[2] : BAND[1])
    // swallow-tail notch at the very end
    if (f > 0.93) l.set(x, top + 1, 0)
  }
}

function ear(l: Raster, x: number, y: number, tipDx: number, tipDy: number, far: boolean) {
  const base = far ? FAR : FOX
  const sock = far ? FAR_DARK : DARK
  const tip: Pt = [x + tipDx, y - 18 + tipDy]
  l.poly([x - 7, y + 3, tip[0], tip[1], x + 7, y + 3], base[1])
  l.poly([x - 3.5, y + 2, lerp(x, tip[0], 0.55), lerp(y + 2, tip[1], 0.55) + 2, x + 3.5, y + 2], WHITE[far ? 2 : 1])
  for (let yy = tip[1] - 1; yy < tip[1] + 7; yy++)
    for (let xx = x - 10 + tipDx; xx < x + 12 + tipDx; xx++) {
      const c = l.get(xx, yy)
      if (c === base[1] || c === WHITE[1] || c === WHITE[2]) l.set(xx, yy, sock[1])
    }
  shadeEdges(l, base, 1, !far)
  shadeEdges(l, sock, 1, false)
}

function stars(l: Raster, hx: number, hy: number, phase: number) {
  for (let k = 0; k < 3; k++) {
    const a = phase + (k * Math.PI * 2) / 3
    const x = hx + 3 + Math.cos(a) * 17
    const y = hy - 17 + Math.sin(a) * 4
    l.stamp(['..x..', '.xgx.', 'xgggx', '.xgx.', '..x..'], x - 2, y - 2, EYE_KEY)
  }
}

/** One frame of the standing fox. */
export function drawFox(p: FoxPose, only?: string): Raster {
  const rig = new Rig(p.angle, p.pivot ?? [64, 120], p.shift)
  const g = {
    add(depth: number, draw: (l: Raster) => void, line = true) {
      if (!only || only === tag) rig.add(depth, draw, line)
    },
    render: () => rig.render()
  }
  let tag = ''
  const hipY = 102 + p.crouch
  const hip: Pt = [58, hipY]
  const chest: Pt = [61 + p.lean * 0.55, hipY - 16 + p.crouch * 0.25]
  const head: Pt = [64 + p.lean, hipY - 38 + p.headDy + p.crouch * 0.4]
  const shoulder: Pt = [chest[0] + 4, chest[1] - 7]
  const nearFoot: Pt = [54 + p.nearFoot[0], 119 - p.nearFoot[1]]
  const farFoot: Pt = [66 + p.farFoot[0], 119 - p.farFoot[1]]
  const root: Pt = [hip[0] - 7, hipY - 4]

  tag = 'tail'
  // tail: behind the body, or curled round the front
  const curled = p.tailCurl > 0.45 && !p.tailPts
  g.add(curled ? 5 : -4, (l) => {
    drawTail(l, root, p)
  })
  tag = 'head'
  // far ear and far limbs
  g.add(-3, (l) => ear(l, head[0] + 6, head[1] - 7, 3 - p.earBack, p.earBack * 0.8, true))
  tag = 'farleg'
  g.add(-1.5, (l) => leg(l, [hip[0] + 5, hipY - 1], farFoot, FAR, FAR_DARK, 6))
  tag = 'fararm'
  g.add(-1.4, (l) =>
    arm(
      l,
      [shoulder[0] + 2, shoulder[1] + 1],
      [shoulder[0] + 2 + p.farHand[0], shoulder[1] + p.farHand[1]],
      FAR,
      FAR_DARK
    )
  )
  // headband streamers, trailing behind the head
  tag = 'band'
  g.add(-0.5, (l) => {
    const knot: Pt = [head[0] - 12, head[1] - 7]
    streamer(l, knot, p, 0)
    streamer(l, knot, p, 1)
  })
  // hips and torso
  tag = 'torso'
  g.add(0, (l) => {
    lit(l, hip[0], hipY - 4, 11, 9, FOX)
    lit(l, chest[0], chest[1], 13, 15, FOX)
    patch(l, chest[0] + 6, chest[1] + 2, 7.5, 11, WHITE[1])
    patch(l, chest[0] + 8, chest[1] + 10, 6, 3, WHITE[2])
    patch(l, chest[0] + 4, chest[1] - 5, 3, 3, WHITE[0])
    // the dark obi at the waist
    for (let y = hipY - 13; y < hipY - 9; y++)
      for (let x = hip[0] - 13; x < hip[0] + 16; x++)
        l.paint(x, y, y === hipY - 13 ? DARK[0] : y === hipY - 10 ? DARK[2] : DARK[1])
    l.paint(hip[0] + 11, hipY - 12, GOLD[1])
    l.paint(hip[0] + 12, hipY - 12, GOLD[0])
    l.paint(hip[0] + 11, hipY - 11, GOLD[2])
    l.paint(hip[0] + 12, hipY - 11, GOLD[2])
  })
  // near leg
  tag = 'nearleg'
  g.add(0.8, (l) => leg(l, [hip[0] - 3, hipY - 1], nearFoot, FOX, DARK, 7))
  // near ear behind the head, then head and snout
  tag = 'head'
  g.add(0.4, (l) => ear(l, head[0] - 6, head[1] - 7, -3 - p.earBack, p.earBack * 0.8, false))
  g.add(0.5, (l) => {
    const [hx, hy] = head
    // snout first, so the skull's shaded rim reads as a cheek contour
    lit(l, hx + 11, hy + 3, 9, 5.5, FOX)
    patch(l, hx + 12, hy + 6.5, 8, 3, WHITE[1])
    lit(l, hx, hy, 14, 12.5, FOX)
    // white cheek fluff flaring back
    l.poly([hx - 7, hy + 4, hx - 19, hy + 7, hx - 12, hy + 10, hx - 15, hy + 14, hx - 4, hy + 11], WHITE[1])
    shadeEdges(l, WHITE, 1, true)
    patch(l, hx + 14, hy + 5.5, 6, 2.5, WHITE[1])
    // headband across the forehead
    for (let x = hx - 14; x <= hx + 10; x++) {
      const y0 = Math.round(hy - 9 + (x - (hx - 14)) * 0.1)
      l.paint(x, y0, BAND[0])
      l.paint(x, y0 + 1, BAND[1])
      l.paint(x, y0 + 2, BAND[1])
      l.paint(x, y0 + 3, BAND[2])
    }
    l.rect(hx + 1, hy - 8, 6, 4, GOLD[1])
    l.rect(hx + 1, hy - 8, 6, 1, GOLD[0])
    l.rect(hx + 1, hy - 5, 6, 1, GOLD[2])
    l.set(hx + 3, hy - 7, C.ink)
    l.set(hx + 4, hy - 6, C.ink)
    // the knot
    l.ellipse(hx - 13, hy - 6.5, 3, 3, BAND[1])
    l.rect(hx - 15, hy - 5, 3, 1, BAND[2])
    // face
    eyes(l, hx - 1, hy - 3, p.eyes)
    l.ellipse(hx + 19.5, hy + 1, 2.5, 2, C.black)
    l.set(hx + 19, hy, WHITE[0])
    mouth(l, hx + 10, hy + 7, p.mouth)
    l.ellipse(hx - 4, hy + 5, 2.6, 1.6, C.blush)
    if (p.sweat) {
      l.stamp(['.c.', 'ccc', 'ccc', '.c.'], hx - 15, hy - 12, { c: R.water[1] })
    }
  })
  // near arm
  tag = 'neararm'
  g.add(1, (l) => arm(l, shoulder, [shoulder[0] + p.nearHand[0], shoulder[1] + p.nearHand[1]], FOX, DARK))
  // dizzy stars and wind arcs
  tag = 'fx'
  if (p.stars !== undefined) g.add(2, (l) => stars(l, head[0], head[1], p.stars!), false)
  if (p.wind > 0)
    g.add(
      6,
      (l) => {
        for (let k = 0; k < p.wind; k++) {
          const r = 26 + k * 4
          const a0 = Math.PI * (0.75 + k * 0.2)
          l.ring(chest[0] - 2, 100, r, r + 1.6, WHITE[k === 0 ? 0 : 1], a0, a0 + 1.1)
          l.ring(chest[0] - 2, 100, r, r + 1.6, WHITE[1], a0 + 3.3, a0 + 4.2)
        }
      },
      false
    )
  return g.render()
}

// ---------------------------------------------------------------------------------------------- spin

/** The 旋風 spin dash: a curled fox turned by `theta` inside a spiral tail and trailing headband ends. */
export function drawSpin(theta: number, wobble: number): Raster {
  const g = new Rig()
  const cx = 64
  const cy = 90 - wobble
  const rot = (px: number, py: number, extra = 0): Pt => {
    const a = theta + extra
    return [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)]
  }
  // the brush: a spiral around the curled body, white tip last
  g.add(-2, (l) => {
    const N = 30
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const r = lerp(15, 24, t)
      const a = theta + 0.5 + t * 5
      const c: Pt = [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
      const rad = 4.5 + 5 * Math.sin(Math.PI * Math.min(1, t * 1.05) ** 0.8)
      l.ellipse(c[0], c[1], rad, rad, t > 0.78 ? WHITE[1] : FOX[1])
    }
    shadeEdges(l, FOX, 2, true)
    shadeEdges(l, WHITE, 2, true)
  })
  // the curled body
  g.add(0, (l) => {
    ball(l, cx, cy, 16, 16, FOX)
    const belly = rot(5, 4)
    patch(l, belly[0], belly[1], 8, 9, WHITE[1])
    for (const [px, py, r] of [
      [-9, 12, 4.4],
      [8, 13, 4.4]
    ] as const) {
      const f = rot(px, py)
      ball(l, f[0], f[1], r, r, DARK, false)
    }
    // the dark obi
    const o0 = rot(-15, 3)
    const o1 = rot(15, 3)
    bar(l, o0, o1, 4, DARK[1])
  })
  // head, ears and face turn with the body
  g.add(0.5, (l) => {
    const h = rot(10, -9)
    for (const s of [-1, 1]) {
      const e0 = rot(10 + s * 6 - 3, -16)
      const tip = rot(10 + s * 8 - 5, -27)
      const e1 = rot(10 + s * 6 + 5, -15)
      l.poly([e0[0], e0[1], tip[0], tip[1], e1[0], e1[1]], FOX[1])
    }
    ball(l, h[0], h[1], 10, 9.5, FOX)
    const sn = rot(18, -7)
    ball(l, sn[0], sn[1], 6.5, 4.5, FOX, false)
    const mz = rot(19, -4)
    patch(l, mz[0], mz[1], 5, 2.6, WHITE[1])
    const nose = rot(23, -9)
    l.ellipse(nose[0], nose[1], 1.8, 1.6, C.black)
    // glaring slit eyes
    for (const [ex, ey] of [
      [9, -11],
      [15, -10]
    ] as const) {
      const a = rot(ex - 2, ey - 1)
      const b = rot(ex + 2, ey + 1)
      l.line(a[0], a[1], b[0], b[1], C.black)
      const w = rot(ex, ey - 1)
      l.set(w[0], w[1], C.white)
    }
    // headband
    for (let k = -9; k <= 9; k++) {
      const a = rot(10 + k * 0.4, -14 + k * 0.1)
      l.paint(a[0], a[1], BAND[1])
      l.paint(a[0], a[1] + 1, BAND[2])
    }
    shadeEdges(l, FOX, 1, true)
  })
  // headband ends tracing the circle
  g.add(1, (l) => {
    const knot = rot(1, -14)
    const a0 = Math.atan2(knot[1] - cy, knot[0] - cx)
    for (const [k, r0, len] of [
      [0, 27, 1.5],
      [1, 22, 1.1]
    ] as const) {
      const pts: Pt[] = []
      for (let j = 0; j <= 7; j++) {
        const a = a0 - (j / 7) * len
        const r = r0 - j * 0.3
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
      }
      for (let j = 1; j < pts.length; j++)
        bar(l, pts[j - 1], pts[j], j < 4 ? 4 : j < 6 ? 3 : 2, k === 0 ? BAND[1] : BAND[0])
    }
    shadeEdges(l, BAND, 1, true)
  })
  // a wind ring
  g.add(
    2,
    (l) => {
      l.ring(cx, cy, 30, 31.4, WHITE[1], theta + 0.4, theta + 1.4)
      l.ring(cx, cy, 30, 31.4, WHITE[1], theta + 3.6, theta + 4.4)
    },
    false
  )
  return g.render()
}

// ---------------------------------------------------------------------------------------------- clips

const TAU = Math.PI * 2

/** Nudges a frame so it keeps one empty pixel to every edge. */
function fit(r: Raster) {
  const b = r.bounds()!
  const dx = Math.max(2 - b.x, Math.min(0, 125 - (b.x + b.w - 1)))
  const dy = Math.max(2 - b.y, Math.min(0, 125 - (b.y + b.h - 1)))
  return dx || dy ? r.shifted(dx, dy) : r
}

const idle = memo(() =>
  [0, 1, 2, 3].map((i) => {
    const t = i / 4
    const s = Math.sin(t * TAU)
    const c = Math.cos(t * TAU)
    return drawFox(
      foxPose({
        crouch: 1.2 - c * 1.2,
        lean: s * 1.4,
        nearFoot: [s * 0.6, 0],
        farFoot: [-s * 0.6, 0],
        nearHand: [13 + s * 1.5, 6 - c * 1.5],
        farHand: [10 - s, 5 + c],
        tailSwing: s,
        bandPhase: t * TAU,
        earBack: c > 0.5 ? 1 : 0
      })
    )
  })
)

const intro = memo(() =>
  [
    foxPose({
      crouch: 5,
      lean: -3,
      nearHand: [4, 9],
      farHand: [2, 10],
      tailCurl: 0.25,
      eyes: 'glare',
      mouth: 'flat',
      bandPhase: 0.4
    }),
    foxPose({ crouch: 2, lean: 2, nearHand: [14, -3], farHand: [13, -1], eyes: 'sly', mouth: 'smirk', bandPhase: 1.6 }),
    foxPose({
      crouch: 0,
      lean: 1,
      nearHand: [15, -4],
      farHand: [13, -2],
      puff: 1.28,
      tailSwing: 0.8,
      eyes: 'smirk',
      mouth: 'grin',
      bandPhase: 2.8
    }),
    foxPose({
      crouch: 0,
      lean: -1,
      headDy: -1,
      nearHand: [7, 8],
      farHand: [9, 3],
      puff: 1.28,
      tailSwing: -0.4,
      eyes: 'smirk',
      mouth: 'grin',
      bandPhase: 4
    })
  ].map((p) => drawFox(p))
)

const move = memo(() =>
  Array.from({ length: 6 }, (_, i) => {
    const t = i / 6
    const s = Math.sin(t * TAU)
    const c = Math.cos(t * TAU)
    return drawFox(
      foxPose({
        crouch: 6 + Math.abs(s) * -2,
        lean: 15,
        headDy: 4,
        nearFoot: [s * 15 - 2, Math.max(0, -c) * 8],
        farFoot: [-s * 15, Math.max(0, c) * 8],
        nearHand: [-10 - s * 4, -2 + c * 3],
        farHand: [-8 + s * 4, -1 - c * 3],
        tailStream: 1,
        tailSwing: c * 0.5,
        bandPhase: t * TAU * 2,
        bandStream: 1,
        earBack: 5,
        eyes: 'sly',
        mouth: 'grin'
      })
    )
  })
)

const windup = memo(() =>
  [
    foxPose({
      crouch: 7,
      lean: -5,
      nearHand: [-4, 9],
      farHand: [-6, 8],
      tailPts: [
        [0, 0],
        [-22, 2],
        [-30, -14],
        [-16, -30]
      ],
      puff: 0.8,
      earBack: 2,
      eyes: 'glare',
      mouth: 'flat',
      bandPhase: 0.5,
      nearFoot: [-3, 0],
      farFoot: [4, 0]
    }),
    foxPose({
      crouch: 12,
      lean: -7,
      headDy: 2,
      nearHand: [-6, 12],
      farHand: [-4, 11],
      tailPts: [
        [0, 0],
        [-24, 2],
        [-34, -20],
        [-18, -40]
      ],
      puff: 0.75,
      earBack: 3,
      eyes: 'glare',
      mouth: 'grin',
      bandPhase: 1.5,
      wind: 1,
      nearFoot: [-4, 0],
      farFoot: [6, 0]
    }),
    foxPose({
      crouch: 15,
      lean: 4,
      headDy: 4,
      nearHand: [-9, 14],
      farHand: [-7, 13],
      tailPts: [
        [0, 0],
        [-24, 3],
        [-36, -20],
        [-22, -42]
      ],
      puff: 0.75,
      earBack: 5,
      eyes: 'glare',
      mouth: 'grin',
      bandPhase: 2.4,
      bandStream: 0.5,
      wind: 2,
      nearFoot: [-5, 0],
      farFoot: [7, 0]
    })
  ].map((p) => drawFox(p))
)

const attack = memo(() => [0, 1, 2, 3].map((i) => drawSpin(i * 1.4 + 0.3, i % 2)))

const recover = memo(() =>
  [
    foxPose({
      crouch: 7,
      lean: -3,
      headDy: 3,
      nearHand: [3, 15],
      farHand: [-1, 14],
      tailSwing: -0.7,
      earBack: 4,
      eyes: 'swirl',
      mouth: 'tongue',
      stars: 0.3,
      bandPhase: 0.2,
      bandDroop: 1.2,
      angle: -0.07,
      nearFoot: [-4, 0],
      farFoot: [3, 0]
    }),
    foxPose({
      crouch: 7,
      lean: 3,
      headDy: 3,
      nearHand: [5, 15],
      farHand: [1, 14],
      tailSwing: 0.7,
      earBack: 4,
      eyes: 'swirl',
      mouth: 'tongue',
      stars: 2.4,
      bandPhase: 2.2,
      bandDroop: 1.2,
      angle: 0.07,
      nearFoot: [-2, 0],
      farFoot: [5, 0]
    })
  ].map((p) => drawFox(p))
)

const hurt = memo(() =>
  [
    foxPose({
      crouch: 3,
      lean: -8,
      headDy: -2,
      nearHand: [-6, -2],
      farHand: [-4, -4],
      puff: 1.15,
      earBack: 5,
      eyes: 'hurt',
      mouth: 'o',
      tailSwing: 1,
      bandPhase: 1,
      bandStream: 0.7,
      angle: -0.12,
      sweat: true
    }),
    foxPose({
      crouch: 5,
      lean: -5,
      headDy: 0,
      nearHand: [-2, 6],
      farHand: [-3, 5],
      puff: 1.1,
      earBack: 4,
      eyes: 'hurt',
      mouth: 'o',
      tailSwing: 0.5,
      bandPhase: 2,
      bandStream: 0.5,
      angle: -0.05,
      sweat: true
    })
  ].map((p) => drawFox(p))
)

/** Lowers a lying frame onto the floor and keeps it inside the frame. */
function settle(r: Raster) {
  const b = r.bounds()!
  const dy = 121 - (b.y + b.h - 1)
  const dx = Math.max(2 - b.x, Math.min(0, 125 - (b.x + b.w - 1)))
  return r.shifted(dx, dy)
}

/** A rigid frame: the standing point `ref` lands on `at`, turned by `a` (radians, clockwise). */
interface Frame {
  ref: Pt
  at: Pt
  a: number
}

function mapPt(f: Frame, q: Pt): Pt {
  const dx = q[0] - f.ref[0]
  const dy = q[1] - f.ref[1]
  const c = Math.cos(f.a)
  const sn = Math.sin(f.a)
  return [f.at[0] + dx * c - dy * sn, f.at[1] + dx * sn + dy * c]
}

/** One part of the fox in standing coordinates, carried by a frame and turned a little more on its own. */
function put(only: string, pose: Partial<FoxPose>, pivot: Pt, f: Frame, extra = 0, off: Pt = [0, 0]): Raster {
  const at = mapPt(f, pivot)
  at[0] += off[0]
  at[1] += off[1]
  return drawFox(foxPose({ ...pose, angle: f.a + extra, shift: [at[0] - pivot[0], at[1] - pivot[1]], pivot }), only)
}

const HIP0: Pt = [58, 102]
const HEAD0: Pt = [64, 64]
const SHOULDER0: Pt = [65, 79]

interface Down {
  /** Where the hips land and how the body is turned. */
  hip: Pt
  a: number
  /** Head turn and offset on top of the body's. */
  headTurn: number
  headOff?: Pt
  /** Extra turn of the legs about the hips and of the arms about the shoulder. */
  nearLeg: number
  farLeg: number
  nearArm: number
  farArm: number
  /** Where the thighs leave the body (screen offset from the hips). */
  legOff?: Pt
  face: Partial<FoxPose>
  tail: Pt[]
  band: Partial<FoxPose>
  bandTurn?: number
}

/** A fox on the floor, assembled part by part so nothing is tilted into a flat cut. */
function drawDown(d: Down): Raster {
  const body: Frame = { ref: HIP0, at: d.hip, a: d.a }
  const headAt = mapPt(body, HEAD0)
  const head: Frame = {
    ref: HEAD0,
    at: [headAt[0] + (d.headOff?.[0] ?? 0), headAt[1] + (d.headOff?.[1] ?? 0)],
    a: d.a + d.headTurn
  }
  const out = new Raster(128, 128)
  const tailRoot = mapPt(body, [51, 98])
  out.blit(
    drawFox(
      foxPose({ puff: 0.9, tailPts: d.tail, pivot: [51, 98], shift: [tailRoot[0] - 51, tailRoot[1] - 98] }),
      'tail'
    ),
    0,
    0
  )
  out.blit(put('farleg', LONG, [63, 101], body, d.farLeg, d.legOff), 0, 0)
  out.blit(put('fararm', {}, [SHOULDER0[0] + 2, SHOULDER0[1] + 1], body, d.farArm), 0, 0)
  const knot: Pt = [HEAD0[0] - 12, HEAD0[1] - 7]
  out.blit(put('band', d.band, knot, { ref: knot, at: mapPt(head, knot), a: d.bandTurn ?? 0 }), 0, 0)
  out.blit(put('torso', {}, HIP0, body), 0, 0)
  out.blit(put('nearleg', LONG, [55, 101], body, d.nearLeg, d.legOff), 0, 0)
  out.blit(put('head', d.face, HEAD0, head), 0, 0)
  out.blit(put('neararm', {}, SHOULDER0, body, d.nearArm), 0, 0)
  if (d.face.stars !== undefined) out.blit(put('fx', d.face, HEAD0, { ...head, a: 0 }), 0, 0)
  return out
}

const LONG: Partial<FoxPose> = { nearFoot: [0, -8], farFoot: [0, -8] }
const downBase = { headTurn: 0.1, legOff: [-5, -8] as Pt }

const defeatLate = memo(() =>
  [
    // knocked back: thrown backwards, tail whipping behind, feet kicking up
    drawDown({
      ...downBase,
      hip: [70, 98],
      a: -0.75,
      headTurn: -0.2,
      nearLeg: -1.25,
      farLeg: -1.65,
      nearArm: -1.75,
      farArm: -2.15,
      face: { eyes: 'hurt', mouth: 'o', earBack: 6 },
      tail: [
        [0, 0],
        [14, 4],
        [30, -6],
        [40, -26]
      ],
      band: { bandPhase: 1, bandStream: 1, bandDroop: 0 },
      bandTurn: 0.5
    }),
    // lands on its back with a bounce
    drawDown({
      ...downBase,
      hip: [70, 106],
      a: -1.3,
      headTurn: -0.1,
      headOff: [-2, 4],
      nearLeg: -1.2,
      farLeg: -1.7,
      nearArm: -0.3,
      farArm: 0.5,
      face: { eyes: 'dead', mouth: 'tongue', earBack: 6 },
      tail: [
        [4, 2],
        [20, 6],
        [40, 0],
        [36, -20]
      ],
      band: { bandPhase: 2, bandStream: 0.8, bandDroop: 0.6 },
      bandTurn: 0.3
    }),
    // settles on its back, legs up
    drawDown({
      ...downBase,
      hip: [70, 108],
      a: -1.5,
      headTurn: -0.1,
      headOff: [-2, 6],
      nearLeg: -1.25,
      farLeg: -1.7,
      nearArm: 0.2,
      farArm: 1.0,
      face: { eyes: 'dead', mouth: 'tongue', earBack: 6 },
      tail: [
        [4, 2],
        [20, 6],
        [40, 0],
        [36, -20]
      ],
      band: { bandPhase: 3, bandStream: 0.7, bandDroop: 1 },
      bandTurn: 0.1
    }),
    // lies still, feet up, headband loose, dizzy
    drawDown({
      ...downBase,
      hip: [70, 108],
      a: -1.5,
      headTurn: 0.05,
      headOff: [-3, 7],
      nearLeg: -1.45,
      farLeg: -1.9,
      nearArm: 0.3,
      farArm: 1.1,
      face: { eyes: 'swirl', mouth: 'tongue', earBack: 7, stars: 0.6 },
      tail: [
        [4, 2],
        [20, 6],
        [40, 0],
        [36, -20]
      ],
      band: { bandPhase: 4, bandStream: 0.6, bandDroop: 1.6 },
      bandTurn: 0
    })
  ].map(settle)
)

const defeat = memo(() =>
  [
    foxPose({
      crouch: 6,
      lean: -6,
      nearHand: [-3, 6],
      farHand: [-4, 5],
      earBack: 4,
      eyes: 'swirl',
      mouth: 'o',
      tailSwing: 1,
      angle: -0.1,
      stars: 0.5,
      nearFoot: [-4, 0],
      farFoot: [4, 0]
    }),
    foxPose({
      crouch: 9,
      lean: -2,
      headDy: 3,
      nearHand: [2, 13],
      farHand: [0, 12],
      earBack: 5,
      eyes: 'swirl',
      mouth: 'tongue',
      tailSwing: -1,
      angle: 0.08,
      stars: 2.5,
      nearFoot: [-3, 0],
      farFoot: [5, 0],
      bandDroop: 1
    })
  ]
    .map((p) => drawFox(p))
    .concat(defeatLate())
)

export const sheets: SheetModule = {
  foxBoss: () => ({
    idle: lazyAnim(() => idle().map(fit), 6, true),
    intro: lazyAnim(() => intro().map(fit), 8, false),
    move: lazyAnim(() => move().map(fit), 12, true),
    windup: lazyAnim(() => windup().map(fit), 12, false),
    attack: lazyAnim(() => attack().map(fit), 16, true),
    recover: lazyAnim(() => recover().map(fit), 8, true),
    hurt: lazyAnim(() => hurt().map(fit), 12, false),
    defeat: lazyAnim(() => defeat().map(fit), 8, false)
  })
}
