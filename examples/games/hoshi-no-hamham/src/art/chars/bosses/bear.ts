/**
 * ヒョウタン熊 (`bearBoss`): the huge, sleepy-grumpy master of the forest. A violet-brown bear who walks upright,
 * with a pale muzzle and belly, small round ears, leaves stuck on his head and a gourd slung across his back on a
 * rope. One pose-parametric draw function; every clip is a list of poses (see `bossSpec('bearBoss')`).
 *
 * Drawn at 128×128 with the hero's toolkit: ball-shaded volumes lit from the top-left, parts assembled back to
 * front with the Painter (overlaps become inner contours), pale patches shaded with the same normals as the
 * body, stamped eyes with one highlight.
 */
import type { SheetModule } from '../../module'
import { C, R } from '../../palette'
import { bossSpec } from '../../contract'
import { Painter, Raster, bar, farRamp, shadeIndex, type Pt, type Ramp } from '../../raster'
import { anim } from '../../sheet'

const PELT = R.bearViolet
const FAR = farRamp(PELT)
const SNOUT = R.cream
const GOURD = R.honey
const WOOD = R.wood
const LEAF = R.leaf
const GOLD = R.gold
const WATER = R.water
const DUST = R.paper

const GROUND = 116.5

export type Eyes = 'closed' | 'sleepy' | 'open' | 'angry' | 'squint' | 'hurt' | 'swirl' | 'wide'
export type Mouth = 'frown' | 'grumble' | 'roar' | 'pant' | 'gasp' | 'yawn'

interface Torso {
  x: number
  y: number
  rx: number
  ry: number
  /** Belly patch centre offset and size as fractions of the torso. */
  belly: [number, number, number, number]
}

interface Fx {
  /** Sweat drops: [x, y] of each. */
  sweat?: Pt[]
  /** Dust puffs: [x, y, radius]. */
  dust?: [number, number, number][]
  /** Stars circling the head: [x, y]. */
  stars?: Pt[]
  /** Fur tufts blown outward from the torso edge: [x, y, dx, dy]. */
  tufts?: [number, number, number, number][]
  /** Sound arcs in front of the mouth: centre and count. */
  roar?: number
}

export interface BearPose {
  torso: Torso
  /** Head centre, and how far it is tipped back (-1 chin down … 1 face up). */
  head: { x: number; y: number; pitch: number }
  nearHand: Pt
  farHand: Pt
  /** Where the near and far elbows prefer to point. */
  nearBend: Pt
  farBend: Pt
  /** Sole centres of the feet. */
  nearFoot: Pt
  farFoot: Pt
  /** Feet seen sole-on (sitting, lying): the foot position is its centre. */
  soles?: boolean
  eyes: Eyes
  mouth: Mouth
  /** Mouth opening 0..1 for the open mouths. */
  jaw: number
  /** Gourd offset (swing). */
  gourd: Pt
  /** Ears pushed back (positive) by speed. */
  earBack: number
  fx: Fx
}

// -------------------------------------------------------------------------------------------- small tools

/** A sphere-shaded ellipse where `pick` chooses the colour for each ramp step, so patches share the light. */
export function volume(
  l: Raster,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pick: (idx: 0 | 1 | 2 | 3, x: number, y: number) => number,
  spec = true
) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      l.set(x, y, pick(shadeIndex(nx, ny, Math.sqrt(Math.max(0, 1 - q)), spec), x, y))
    }
}

export const ballOf = (l: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, spec = true) =>
  volume(l, cx, cy, rx, ry, (i) => ramp[i], spec)

/** A thick limb segment: dark body with a lit core shifted toward the light. */
export function limb(l: Raster, a: Pt, b: Pt, w: number, ramp: Ramp, lit = false) {
  bar(l, a, b, w, ramp[2])
  bar(l, [a[0] - 1, a[1] - 1], [b[0] - 1, b[1] - 1], w - 3, ramp[1])
  if (lit) bar(l, [a[0] - 2, a[1] - 2], [b[0] - 2, b[1] - 2], Math.max(2, w - 10), ramp[0])
}

/** Two-bone arm: returns the elbow (and clamps the hand to the reach). */
export function arm(s: Pt, target: Pt, bend: Pt, l1 = 18, l2 = 18): { e: Pt; h: Pt } {
  const dx = target[0] - s[0]
  const dy = target[1] - s[1]
  const dist = Math.max(1, Math.hypot(dx, dy))
  const reach = Math.min(dist, l1 + l2 - 0.6)
  const ux = dx / dist
  const uy = dy / dist
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach)
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const bx = s[0] + ux * a
  const by = s[1] + uy * a
  const c1: Pt = [bx - uy * hh, by + ux * hh]
  const c2: Pt = [bx + uy * hh, by - ux * hh]
  const score = (p: Pt) => (p[0] - bx) * bend[0] + (p[1] - by) * bend[1]
  return { e: score(c1) >= score(c2) ? c1 : c2, h: [s[0] + ux * reach, s[1] + uy * reach] }
}

/** A foot seen sole-on (sitting or lying): a round paw with a pale pad. */
export function sole(l: Raster, x: number, y: number, ramp: Ramp) {
  ballOf(l, x, y, 6.8, 8.6, ramp, false)
  volume(l, x + 1, y + 1, 3.6, 5, (i) => SNOUT[Math.min(3, i + 1) as 0 | 1 | 2 | 3], false)
}

/** A small cloud of dust: three overlapping puffs. */
export function puff(l: Raster, x: number, y: number, r: number) {
  ballOf(l, x, y, r, r * 0.85, DUST, false)
  ballOf(l, x + r * 0.9, y + r * 0.25, r * 0.7, r * 0.6, DUST, false)
  ballOf(l, x - r * 0.8, y + r * 0.3, r * 0.6, r * 0.55, DUST, false)
}

/** Filled pointed leaf from a base point toward a tip, shaded on the lower half. */
function leaf(l: Raster, x: number, y: number, angle: number, len: number, wid: number) {
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const at = (u: number, v: number): Pt => [x + ca * u - sa * v, y + sa * u + ca * v]
  const top: Pt[] = []
  const bot: Pt[] = []
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    const w = Math.sin(Math.PI * Math.pow(t, 0.8)) * wid
    top.push(at(t * len, -w))
    bot.push(at(t * len, w))
  }
  l.poly([...top, ...bot.reverse()].flat(), LEAF[1])
  const half: Pt[] = []
  for (let i = 0; i <= 6; i++) {
    const t = i / 6
    half.push(at(t * len, Math.sin(Math.PI * Math.pow(t, 0.8)) * wid))
  }
  l.poly([...[0, 0].map((_, k) => at(k * len, 0)), ...half.reverse()].flat(), LEAF[2])
  l.line(...at(1, 0), ...at(len * 0.85, 0), LEAF[0])
}

// -------------------------------------------------------------------------------------------- face

export const EYE_KEY = { K: C.black, w: C.white, i: C.ink, b: PELT[3], s: PELT[2] }

export const EYES: Record<Eyes, readonly [readonly string[], readonly string[]]> = {
  open: [
    ['.KKK.', 'KwwKK', 'KwwKK', 'KKKKK', 'KKKKK', '.KKK.'],
    ['.KK.', 'KwKK', 'KwKK', 'KKKK', 'KKKK', '.KK.']
  ],
  closed: [
    ['.....', '.....', '.....', 'i...i', '.iii.', '.....'],
    ['....', '....', '....', 'i..i', '.ii.', '....']
  ],
  sleepy: [
    ['.....', '.....', 'iiiii', 'KwKKK', 'KKKKK', '.KKK.'],
    ['....', '....', 'iiii', 'KwKK', 'KKKK', '.KK.']
  ],
  angry: [
    ['iii..', '.iiii', 'KKKKK', 'KwKKK', 'KKKKK', '.KKK.'],
    ['..ii', 'iiii', 'KKKK', 'KwKK', 'KKKK', '.KK.']
  ],
  squint: [
    ['i....', '.ii..', '...ii', '.ii..', 'i....', '.....'],
    ['....', '..ii', 'ii..', '..ii', '....', '....']
  ],
  hurt: [
    ['i...i', '.i.i.', '..i..', '.i.i.', 'i...i', '.....'],
    ['i..i', '.ii.', '.ii.', 'i..i', '....', '....']
  ],
  swirl: [
    [
      '..KKKKK..',
      '.KwwwwwK.',
      'KwwKKKwwK',
      'KwKwwwKwK',
      'KwKwKwKwK',
      'KwKwKKKwK',
      'KwwKwwwwK',
      '.KwwwwwK.',
      '..KKKKK..'
    ],
    ['.KKKKK.', 'KwwwwwK', 'KwKKKwK', 'KwKwKwK', 'KwKwwwK', 'KwwwwwK', '.KKKKK.']
  ],
  wide: [
    ['.KKKK.', 'KwwwwK', 'KwKKwK', 'KwKKwK', 'KwwwwK', '.KKKK.'],
    ['.KKK.', 'KwwwK', 'KwKKK', 'KwKKK', 'KwwwK', '.KKK.']
  ]
}

function drawFace(l: Raster, p: BearPose) {
  const { x, y, pitch } = p.head
  const ex = x + 7
  const ey = y - 4 - pitch * 2
  const [near, far] = EYES[p.eyes]
  const big = p.eyes === 'swirl'
  l.stamp(near, ex - (big ? 3 : 2), ey - 3, EYE_KEY)
  l.stamp(far, ex + 10 - (big ? 1 : 0), ey - 3, EYE_KEY)
  // heavy brows: grumpy, sloping down toward the nose
  if (p.eyes === 'sleepy' || p.eyes === 'angry' || p.eyes === 'open') {
    const drop = p.eyes === 'angry' ? 2 : 1
    const dy = p.eyes === 'sleepy' ? -1 : -2
    l.thick(ex - 4, ey + dy - 3 - drop, ex + 2, ey + dy - 2 + 1, 2.2, PELT[3])
    l.thick(ex + 8, ey + dy - 2 + 1, ex + 14, ey + dy - 3 - drop, 2.2, PELT[3])
  }
}

/** Mouth, nose and chin on the muzzle centred at (mx, my). */
function drawMuzzle(l: Raster, p: BearPose, mx: number, my: number) {
  const open = p.mouth === 'roar' || p.mouth === 'pant' || p.mouth === 'gasp' || p.mouth === 'yawn'
  const jaw = open ? p.jaw : 0
  // chin / lower jaw drops with the mouth
  if (open) {
    const cy = my + 7 + jaw * 7
    volume(l, mx + 1, cy, 8.5, 4.5, (i) => SNOUT[i === 0 ? 1 : i], false)
  }
  volume(l, mx, my, 11, 8, (i) => SNOUT[i], false)
  // nose
  l.ellipse(mx + 9, my - 4.5, 3.6, 2.8, C.black)
  l.set(mx + 8, my - 6, PELT[0])
  if (open) {
    const h = 3 + jaw * 6
    const cy = my + 3 + h / 2
    l.ellipse(mx + 2, cy, 8.5, h / 2 + 1, C.mouth)
    l.rect(mx - 3, Math.round(cy - h / 2), 11, 2, C.white)
    l.set(mx - 3, Math.round(cy - h / 2) + 2, C.white)
    l.set(mx + 7, Math.round(cy - h / 2) + 2, C.white)
    if (p.mouth === 'pant') {
      l.ellipse(mx + 2, cy + h / 2 - 0.5, 4.5, 3.6, C.tongue)
      l.line(mx + 2, cy, mx + 2, cy + h / 2 + 1, C.mouth)
    } else if (p.mouth !== 'gasp') {
      l.ellipse(mx + 2, cy + h / 2 - 1, 5.5, 2.4, C.tongue)
    }
    return
  }
  // philtrum and a down-turned mouth line
  l.line(mx + 9, my - 1.5, mx + 9, my + 1.5, C.ink)
  if (p.mouth === 'frown' || p.mouth === 'grumble') {
    l.line(mx + 9, my + 1.5, mx + 5, my + 3.5, C.ink)
    l.line(mx + 5, my + 3.5, mx - 1, my + 3, C.ink)
    l.line(mx - 1, my + 3, mx - 3, my + 1, C.ink)
    if (p.mouth === 'grumble') l.rect(mx + 3, my + 4, 2, 2, C.white)
  }
}

// -------------------------------------------------------------------------------------------- the bear

export function drawBear(p: BearPose): Raster {
  const g = new Painter(128, 128)
  const t = p.torso
  const hd = p.head
  const near: Pt = [t.x + 2, t.y - t.ry * 0.55]
  const farS: Pt = [t.x + t.rx * 0.6, t.y - t.ry * 0.62]
  const nearArm = arm(near, [near[0] + p.nearHand[0], near[1] + p.nearHand[1]], p.nearBend)
  const farArm = arm(farS, [farS[0] + p.farHand[0], farS[1] + p.farHand[1]], p.farBend)
  const [gx, gy] = p.gourd
  const mx = hd.x + 16
  const my = hd.y + 7 - hd.pitch * 5

  // gourd on the back, behind the body
  g.add(-5, (l) => {
    // a tilted gourd: big lower belly, small upper one, a pinched waist, a cork on the neck
    const cx = Math.max(t.x - t.rx - 5 + gx, 20)
    const cy = Math.min(t.y + 10 + gy, 95)
    ballOf(l, cx + 4, cy + 10, 14, 13.5, GOURD)
    ballOf(l, cx - 3, cy - 7, 9.5, 9.5, GOURD)
    ballOf(l, cx, cy + 1, 8, 6, GOURD)
    // the waist rope and its knot
    l.thick(cx - 9, cy + 1, cx + 11, cy + 4, 3, WOOD[2])
    l.thick(cx - 9, cy, cx + 11, cy + 3, 1.5, WOOD[1])
    // cork
    l.thick(cx - 7, cy - 16, cx - 9, cy - 20, 5, WOOD[2])
    l.thick(cx - 7.5, cy - 16.5, cx - 9.5, cy - 20.5, 2.5, WOOD[1])
  })

  // far arm and far foot behind the body
  g.add(-4, (l) => {
    limb(l, farS, farArm.e, 12, FAR)
    limb(l, farArm.e, farArm.h, 11, FAR)
    ballOf(l, farArm.h[0], farArm.h[1], 6.5, 6.2, FAR, false)
  })
  g.add(-3, (l) => {
    const [fx, fy] = p.farFoot
    limb(l, [t.x + 12, t.y + t.ry * 0.5], [fx, p.soles ? fy : fy - 3], 15, FAR)
    if (p.soles) sole(l, fx, fy, FAR)
    else ballOf(l, fx + 3, fy, 10.5, 4.6, FAR, false)
  })
  g.add(-2, (l) => {
    const [fx, fy] = p.nearFoot
    limb(l, [t.x - 8, t.y + t.ry * 0.5], [fx, p.soles ? fy : fy - 3], 15, PELT)
  })

  // ears behind the skull
  g.add(-1, (l) => {
    const bk = p.earBack
    ballOf(l, hd.x - 13 - bk, hd.y - 16 + bk * 0.4, 7.5, 7.5, PELT)
    l.ellipse(hd.x - 13 - bk + 1, hd.y - 15 + bk * 0.4, 3.6, 3.6, SNOUT[2])
    ballOf(l, hd.x + 9 - bk * 0.5, hd.y - 18, 6.8, 6.8, FAR)
    l.ellipse(hd.x + 9.5 - bk * 0.5, hd.y - 17.5, 3, 3, SNOUT[3])
  })

  // torso with belly patch, rope across the chest
  g.add(0, (l) => {
    const [bx, by, brx, bry] = t.belly
    const cx = t.x + bx * t.rx
    const cy = t.y + by * t.ry
    volume(l, t.x, t.y, t.rx, t.ry, (i, x, y) => {
      const nx = (x + 0.5 - cx) / (brx * t.rx)
      const ny = (y + 0.5 - cy) / (bry * t.ry)
      return nx * nx + ny * ny <= 1 ? SNOUT[i] : PELT[i]
    })
    // the rope runs from the near shoulder down to the gourd
    const sx = t.x + t.rx * 0.5
    const sy = t.y - t.ry * 0.78
    const ex = t.x - t.rx - 2 + gx
    const ey = t.y + 8 + gy
    const rope = new Raster(l.w, l.h)
    rope.thick(sx, sy, ex, ey, 4, WOOD[2])
    rope.thick(sx - 0.5, sy - 1, ex - 0.5, ey - 1, 2, WOOD[1])
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) {
        const c = rope.get(x, y)
        if (c && l.get(x, y)) l.set(x, y, c)
      }
  })

  // head, muzzle, face
  g.add(1, (l) => {
    volume(l, hd.x, hd.y, 25.5, 21.5, (i) => PELT[i])
  })
  g.add(2, (l) => drawMuzzle(l, p, mx, my))
  g.add(3, (l) => drawFace(l, p), false)

  // leaves on top of the head
  g.add(3, (l) => {
    leaf(l, hd.x - 5, hd.y - 15, -1.9, 10, 3.2)
    leaf(l, hd.x - 2, hd.y - 16, -1.0, 11, 3.4)
    leaf(l, hd.x + 1, hd.y - 16, -0.2, 8, 2.8)
  })

  // near foot and arm in front
  g.add(4, (l) => {
    const [fx, fy] = p.nearFoot
    if (p.soles) return sole(l, fx, fy, PELT)
    ballOf(l, fx + 3, fy, 10.5, 4.8, PELT, false)
    l.set(fx + 12, fy - 1, SNOUT[1])
    l.set(fx + 13, fy + 1, SNOUT[1])
  })
  g.add(5, (l) => {
    limb(l, near, nearArm.e, 15, PELT)
    limb(l, nearArm.e, nearArm.h, 14, PELT)
    ballOf(l, nearArm.h[0], nearArm.h[1], 6.8, 6.4, PELT, false)
  })

  // effects
  const fx = p.fx
  fx.tufts?.forEach(([x, y, dx, dy]) =>
    g.add(-6, (l) => {
      l.poly([x - dy * 0.5, y + dx * 0.5, x + dx, y + dy, x + dy * 0.5, y - dx * 0.5], PELT[2])
    })
  )
  fx.dust?.forEach(([x, y, r]) => g.add(6, (l) => puff(l, x, y, r)))
  fx.sweat?.forEach(([x, y]) =>
    g.add(7, (l) => l.stamp(['..b..', '.bbb.', 'hbbbb', 'bbbbb', '.bbb.'], x - 2, y - 2, { b: WATER[1], h: WATER[0] }))
  )
  fx.stars?.forEach(([x, y]) =>
    g.add(
      7,
      (l) => {
        l.stamp(['..y..', 'yyyyy', '.yYy.', '.Y.Y.'], x - 2, y - 2, { y: GOLD[1], Y: GOLD[2] })
        l.set(x, y - 2, GOLD[0])
      },
      true
    )
  )
  if (fx.roar) {
    for (let i = 0; i < fx.roar; i++)
      g.add(7, (l) => l.ring(mx + 4, my + 5, 12 + i * 6, 14 + i * 6, C.white, -0.6, 0.6), false)
  }
  return g.render()
}

// -------------------------------------------------------------------------------------------- pose builders

interface StandOpts {
  sink: number
  squash: number
  bob: number
  lean: number
  head: [number, number]
  pitch: number
  nearHand: Pt
  farHand: Pt
  nearBend: Pt
  farBend: Pt
  nearFoot: [number, number]
  farFoot: [number, number]
  splay: number
  eyes: Eyes
  mouth: Mouth
  jaw: number
  gourd: Pt
  earBack: number
  fx: Fx
}

/** An upright pose: the torso bottom rides `sink` px under its rest height, the feet stay on the ground. */
export function stand(o: Partial<StandOpts> = {}): BearPose {
  const s: StandOpts = {
    sink: 0,
    squash: 0,
    bob: 0,
    lean: 0,
    head: [0, 0],
    pitch: 0,
    nearHand: [-2, 31],
    farHand: [5, 30],
    nearBend: [-1, 0.6],
    farBend: [-1, 0.6],
    nearFoot: [0, 0],
    farFoot: [0, 0],
    splay: 0,
    eyes: 'sleepy',
    mouth: 'frown',
    jaw: 0,
    gourd: [0, 0],
    earBack: 0,
    fx: {},
    ...o
  }
  const ry = 34 - s.squash
  const rx = 36 + s.squash * 0.9
  const bottom = 111 + s.sink - s.bob
  const torso: Torso = { x: 64 + s.lean * 0.5, y: bottom - ry, rx, ry, belly: [0.3, 0.18, 0.62, 0.72] }
  return {
    torso,
    head: { x: torso.x + 15 + s.head[0] + s.lean * 0.5, y: torso.y - ry + 6 + s.head[1], pitch: s.pitch },
    nearHand: s.nearHand,
    farHand: s.farHand,
    nearBend: s.nearBend,
    farBend: s.farBend,
    nearFoot: [torso.x - 8 - s.splay + s.nearFoot[0], GROUND - s.nearFoot[1]],
    farFoot: [torso.x + 14 + s.splay + s.farFoot[0], GROUND - s.farFoot[1]],
    eyes: s.eyes,
    mouth: s.mouth,
    jaw: s.jaw,
    gourd: s.gourd,
    earBack: s.earBack,
    fx: s.fx
  }
}

/** Sitting heavily on the ground, legs stretched out in front, sole-on. */
function sit(
  o: {
    lean?: number
    breath?: number
    head?: Pt
    nearHand?: Pt
    farHand?: Pt
    eyes?: Eyes
    mouth?: Mouth
    jaw?: number
    fx?: Fx
    gourd?: Pt
  } = {}
): BearPose {
  const breath = o.breath ?? 0
  const lean = o.lean ?? 0
  const ry = 31 + breath * 0.8
  const torso: Torso = { x: 56 + lean * 0.4, y: 118 - ry, rx: 30 - breath * 0.4, ry, belly: [0.35, 0.2, 0.6, 0.7] }
  const h = o.head ?? [0, 0]
  return {
    torso,
    head: { x: torso.x + 15 + h[0] + lean * 0.4, y: torso.y - ry + 12 + h[1], pitch: -0.3 },
    nearHand: o.nearHand ?? [20, 34],
    farHand: o.farHand ?? [16, 34],
    nearBend: [-0.3, 1],
    farBend: [-0.3, 1],
    nearFoot: [91, 110.5],
    farFoot: [104, 108.5],
    soles: true,
    eyes: o.eyes ?? 'swirl',
    mouth: o.mouth ?? 'pant',
    jaw: o.jaw ?? 0.5,
    gourd: o.gourd ?? [0, 0],
    earBack: 0,
    fx: o.fx ?? {}
  }
}

/** Lying on his back, head to the right, feet in the air on the left. */
function lie(
  o: { lift?: number; legs?: number; eyes?: Eyes; mouth?: Mouth; fx?: Fx; head?: Pt; arms?: number } = {}
): BearPose {
  const lift = o.lift ?? 0
  const legs = o.legs ?? 0
  const arms = o.arms ?? 0
  const h = o.head ?? [0, 0]
  const torso: Torso = { x: 60, y: 99 - lift, rx: 35, ry: 23, belly: [0.05, -0.28, 0.72, 0.5] }
  return {
    torso,
    head: { x: 94 + h[0], y: 102 - lift * 0.6 + h[1], pitch: 0.4 },
    nearHand: [16 + arms * 2, 30 - arms * 3],
    farHand: [10, 28 + arms],
    nearBend: [-0.3, 1],
    farBend: [-0.3, 1],
    nearFoot: [24 - legs, 84 + legs * 2 - lift],
    farFoot: [14 - legs, 98 + legs * 1.5 - lift],
    soles: true,
    eyes: o.eyes ?? 'swirl',
    mouth: o.mouth ?? 'pant',
    jaw: 0.6,
    gourd: [-2, 0],
    earBack: 3,
    fx: o.fx ?? {}
  }
}

// -------------------------------------------------------------------------------------------- clips

const TAU = Math.PI * 2

const idle = [0, 1, 2, 1].map((k, i) =>
  drawBear(
    stand({
      squash: -k * 0.8,
      head: [0, k * 0.8],
      nearHand: [
        [12, 24],
        [9, 26],
        [14, 23],
        [10, 25]
      ][i] as Pt,
      nearBend: [-0.3, 1],
      eyes: i === 2 ? 'closed' : 'sleepy',
      gourd: [0, k * 0.5]
    })
  )
)

const intro = [
  stand({
    sink: 3,
    squash: 4,
    head: [-2, 3],
    pitch: -0.4,
    nearHand: [-14, 22],
    farHand: [2, 26],
    eyes: 'angry',
    mouth: 'grumble'
  }),
  stand({
    squash: -1,
    pitch: 0.6,
    nearHand: [-14, -14],
    farHand: [20, -10],
    nearBend: [-1, -0.2],
    farBend: [1, 0.4],
    eyes: 'squint',
    mouth: 'roar',
    jaw: 0.5,
    earBack: 2
  }),
  stand({
    squash: -3,
    bob: 1,
    head: [-1, -2],
    pitch: 1,
    nearHand: [-14, -31],
    farHand: [24, -22],
    nearBend: [-1, -0.2],
    farBend: [1, 0.4],
    eyes: 'squint',
    mouth: 'roar',
    jaw: 1,
    earBack: 3,
    fx: { roar: 2 }
  }),
  stand({
    squash: -2.4,
    head: [0, -1],
    pitch: 0.9,
    nearHand: [-16, -29],
    farHand: [26, -20],
    nearBend: [-1, -0.2],
    farBend: [1, 0.4],
    eyes: 'squint',
    mouth: 'roar',
    jaw: 0.85,
    earBack: 3,
    gourd: [0, 1],
    fx: { roar: 3 }
  })
].map(drawBear)

const move = Array.from({ length: 6 }, (_, i) => {
  const t = i / 6
  const sw = Math.sin(t * TAU)
  const cw = Math.cos(t * TAU)
  const bob = ((1 + Math.cos(t * TAU * 2)) / 2) * 3
  return drawBear(
    stand({
      bob,
      lean: 5,
      head: [2, bob * 0.3 + 1],
      pitch: -0.1,
      nearFoot: [sw * 10, Math.max(0, cw) * 7],
      farFoot: [-sw * 10, Math.max(0, -cw) * 7],
      nearHand: [-2 - sw * 13, 30 - Math.abs(sw) * 4],
      farHand: [5 + sw * 13, 29 - Math.abs(sw) * 4],
      gourd: [-sw * 2, ((1 - Math.cos(t * TAU * 2 - 1.2)) / 2) * 4],
      earBack: 1
    })
  )
})

const windup = [0, 1, 2].map((i) =>
  drawBear(
    stand({
      sink: [2, 5, 6][i],
      squash: [3, 7, 10][i],
      lean: [-1, -2, -3][i],
      head: [
        [0, 2],
        [-1, 4],
        [-2, 5]
      ][i] as Pt,
      pitch: -0.4,
      splay: [3, 6, 8][i],
      nearHand: [
        [-20, 6],
        [-22, -8],
        [-23, -20]
      ][i] as Pt,
      farHand: [
        [-10, 8],
        [-16, -4],
        [-20, -14]
      ][i] as Pt,
      nearBend: [-0.6, 0.5],
      farBend: [-0.6, 0.5],
      eyes: 'angry',
      mouth: 'grumble',
      gourd: [0, [1, 2, 3][i]],
      earBack: 2
    })
  )
)

const air = [
  stand({
    bob: 12,
    squash: -3,
    head: [0, -1],
    pitch: 0.5,
    nearHand: [-14, -26],
    farHand: [22, -20],
    nearBend: [-1, -0.2],
    farBend: [1, 0.4],
    nearFoot: [-3, 12],
    farFoot: [3, 10],
    eyes: 'angry',
    mouth: 'roar',
    jaw: 0.4,
    gourd: [0, 3],
    earBack: 3
  }),
  stand({
    bob: 24,
    squash: 5,
    head: [0, 1],
    pitch: -0.2,
    nearHand: [-30, -12],
    farHand: [30, -12],
    nearBend: [-0.4, 1],
    farBend: [0.4, 1],
    nearFoot: [-8, 20],
    farFoot: [8, 18],
    splay: 6,
    eyes: 'wide',
    mouth: 'gasp',
    jaw: 0.6,
    gourd: [0, -3],
    earBack: 4
  })
].map(drawBear)

const land = [
  stand({
    sink: 6,
    squash: 10,
    lean: 4,
    head: [2, 6],
    pitch: -0.2,
    splay: 10,
    nearHand: [-30, 26],
    farHand: [28, 24],
    nearBend: [-0.6, 1],
    farBend: [0.6, 1],
    eyes: 'squint',
    mouth: 'gasp',
    jaw: 0.4,
    earBack: 3,
    gourd: [0, 4],
    fx: {
      dust: [
        [26, 114, 7],
        [110, 114, 7]
      ],
      tufts: [
        [101, 100, 13, -4],
        [97, 92, 12, -9],
        [93, 85, 8, -12]
      ]
    }
  }),
  stand({
    sink: 5,
    squash: 9,
    lean: 2,
    head: [1, 4],
    splay: 8,
    nearHand: [-26, 26],
    farHand: [24, 25],
    nearBend: [-0.6, 1],
    farBend: [0.6, 1],
    eyes: 'angry',
    mouth: 'grumble',
    earBack: 2,
    gourd: [0, -2],
    fx: {
      dust: [
        [22, 113, 8],
        [112, 113, 8]
      ]
    }
  }),
  stand({
    sink: 1,
    squash: -1,
    head: [0, -1],
    splay: 2,
    nearHand: [-10, 30],
    farHand: [14, 29],
    nearBend: [-0.6, 1],
    farBend: [0.6, 1],
    eyes: 'angry',
    mouth: 'frown',
    gourd: [0, 2],
    earBack: 1,
    fx: {
      dust: [
        [22, 118, 5],
        [108, 118, 5]
      ]
    }
  })
].map(drawBear)

const recover = [0, 1].map((i) =>
  drawBear(
    sit({
      breath: i,
      lean: -3,
      head: [0, i * 1.5],
      jaw: 0.5 + i * 0.3,
      nearHand: [
        [20, 34],
        [18, 35]
      ][i] as Pt,
      fx: {
        sweat: [
          [
            [46, 70],
            [92, 54]
          ],
          [
            [44, 78],
            [94, 60]
          ]
        ][i] as Pt[]
      }
    })
  )
)

const hurt = [
  stand({
    lean: -8,
    head: [-3, -1],
    pitch: 0.8,
    nearHand: [-26, -12],
    farHand: [22, -10],
    nearBend: [-1, 0],
    farBend: [1, 0.2],
    eyes: 'hurt',
    mouth: 'gasp',
    jaw: 0.7,
    earBack: 4,
    gourd: [-2, 3],
    nearFoot: [-3, 0],
    farFoot: [3, 3]
  }),
  stand({
    lean: -4,
    head: [-1, 1],
    pitch: 0.3,
    nearHand: [-20, 10],
    farHand: [16, 12],
    nearBend: [-1, 0.4],
    farBend: [1, 0.4],
    eyes: 'squint',
    mouth: 'grumble',
    earBack: 2,
    gourd: [1, 1]
  })
].map(drawBear)

const defeat = [
  stand({
    lean: -9,
    head: [-3, 0],
    pitch: 0.9,
    nearHand: [-28, -8],
    farHand: [24, -10],
    nearBend: [-1, 0],
    farBend: [1, 0.2],
    eyes: 'hurt',
    mouth: 'gasp',
    jaw: 0.8,
    earBack: 4,
    nearFoot: [-4, 0],
    farFoot: [4, 4],
    gourd: [-3, 3]
  }),
  stand({
    lean: 6,
    head: [3, 2],
    pitch: -0.2,
    nearHand: [-8, 28],
    farHand: [12, 27],
    eyes: 'swirl',
    mouth: 'pant',
    jaw: 0.4,
    nearFoot: [5, 0],
    farFoot: [-3, 3],
    gourd: [2, 2],
    fx: {
      stars: [
        [52, 18],
        [96, 14]
      ]
    }
  }),
  stand({
    sink: 4,
    squash: 7,
    lean: -3,
    head: [0, 6],
    pitch: -0.3,
    nearHand: [-8, 29],
    farHand: [10, 28],
    splay: 5,
    eyes: 'swirl',
    mouth: 'pant',
    jaw: 0.5,
    gourd: [0, 3],
    fx: {
      stars: [
        [50, 54],
        [92, 50],
        [70, 38]
      ]
    }
  }),
  sit({
    lean: -10,
    head: [-4, 2],
    nearHand: [8, 36],
    farHand: [2, 36],
    jaw: 0.6,
    fx: {
      stars: [
        [40, 52],
        [86, 46]
      ]
    }
  }),
  lie({
    lift: 5,
    legs: 4,
    arms: 3,
    fx: {
      dust: [
        [18, 117, 8],
        [112, 117, 7]
      ]
    }
  }),
  lie({
    fx: {
      stars: [
        [96, 70],
        [116, 78],
        [78, 66]
      ]
    }
  })
].map(drawBear)

const spec = bossSpec('bearBoss')
const clip = (name: keyof typeof spec, frames: Raster[]) => anim(frames, spec[name].fps, spec[name].loop)

export const sheets: SheetModule = {
  bearBoss: () => ({
    idle: clip('idle', idle),
    intro: clip('intro', intro),
    move: clip('move', move),
    windup: clip('windup', windup),
    air: clip('air', air),
    land: clip('land', land),
    recover: clip('recover', recover),
    hurt: clip('hurt', hurt),
    defeat: clip('defeat', defeat)
  })
}
