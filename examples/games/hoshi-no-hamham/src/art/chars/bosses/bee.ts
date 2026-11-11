/**
 * ハチ女王 (`beeBoss`): a large, haughty queen bee that hovers just above the floor. Pose-parametric like the hero:
 * a round gold body with a fluffy white collar, a striped abdomen that curls forward into a stinger thrust,
 * translucent pale wings (flat shapes with a rim, doubled while they buzz), a small crown and a tiny sceptre.
 * The whole body can pitch about its middle (the dash, the spiral down) with the light kept top-left.
 */
import type { SheetModule } from '../../module'
import { C, R } from '../../palette'
import { Raster, bar, outline, shadeIndex, type Pt, type Ramp } from '../../raster'
import { lazyAnim, memo } from '../../sheet'

const GOLD = R.gold
const DARK = R.darkFur
const FAR_DARK: Ramp = [DARK[1], DARK[2], DARK[3], DARK[3], DARK[4]]
const WING = R.paper
const SKIN = R.cream
const BAND = R.bandana

export type Eyes = 'bored' | 'open' | 'happy' | 'glare' | 'closed' | 'swirl' | 'hurt' | 'dead'
export type Mouth = 'smirk' | 'laugh' | 'o' | 'flat' | 'pant' | 'tongue'

// ---------------------------------------------------------------------------------------------- rig

let lightTurn = 0

/** Shades a normal (local nx, ny, nz) with the light kept on the top-left of the screen. */
function shade(nx: number, ny: number, nz: number, ramp: Ramp, spec = true) {
  const c = Math.cos(lightTurn)
  const s = Math.sin(lightTurn)
  return ramp[shadeIndex(nx * c - ny * s, nx * s + ny * c, nz, spec)]
}

function lit(l: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, spec = true) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      l.set(x, y, shade(nx, ny, Math.sqrt(Math.max(0, 1 - q)), ramp, spec))
    }
  return l
}

/** A shaded ellipse turned by `ang`; `ramp(u)` picks the material along its long axis (u in -1..1). */
function blob(
  l: Raster,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ang: number,
  ramp: (u: number) => Ramp,
  spec = true
) {
  const ca = Math.cos(ang)
  const sa = Math.sin(ang)
  const r = Math.ceil(Math.max(rx, ry)) + 1
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const nu = (dx * ca + dy * sa) / rx
      const nv = (-dx * sa + dy * ca) / ry
      const q = nu * nu + nv * nv
      if (q > 1.0001) continue
      const nz = Math.sqrt(Math.max(0, 1 - q))
      l.set(x, y, shade(nu * ca - nv * sa, nu * sa + nv * ca, nz, ramp(nu), spec))
    }
  return l
}

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
  return new Raster(layer.w, layer.h).blit(
    turned,
    pivot[0] + dx * c - dy * sn - s / 2,
    pivot[1] + dx * sn + dy * c - s / 2
  )
}

class Rig {
  private list: { depth: number; seq: number; draw: (l: Raster) => void; line: boolean }[] = []
  constructor(
    private angle = 0,
    private pivot: Pt = [64, 88],
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

function patch(l: Raster, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1.0001) l.paint(x, y, c)
    }
}

// ---------------------------------------------------------------------------------------------- pose

export interface BeePose {
  /** Body lifted (px); the feet follow. */
  bob: number
  /** Head pushed forward (px). */
  lean: number
  /** Abdomen: 0 trailing behind and down, 1 curled forward under the body with the stinger ahead. */
  curl: number
  /** Wing direction (radians, from +x clockwise; about -2.1 is up and back), per wing. */
  wingNear: number
  wingFar: number
  /** Second, fainter wing position while buzzing (radians offset) or 0 for none. */
  blur: number
  /** Wings drooping: lengths scale and a heavier tint. */
  wingLen: number
  /** Whole-body pitch (radians, clockwise) about the middle, and a shift before it. */
  pitch: number
  shift: Pt
  eyes: Eyes
  mouth: Mouth
  /** Sceptre hand offset from the shoulder; `null` hides the sceptre. */
  sceptre: Pt | null
  /** The other hand: offset from its shoulder; `fan` shows a hand fan there. */
  farHand: Pt
  fan: boolean
  /** Crown position relative to the head top (px); `null` = it is gone (shown elsewhere). */
  crown: Pt | null
  crownTilt: number
  sweat: boolean
  stars?: number
  /** Feet dangle length; 0 tucks them. */
  legs: number
}

export const beePose = (p: Partial<BeePose> = {}): BeePose => ({
  bob: 0,
  lean: 0,
  curl: 0,
  wingNear: -2.1,
  wingFar: -1.7,
  blur: 0,
  wingLen: 1,
  pitch: 0,
  shift: [0, 0],
  eyes: 'bored',
  mouth: 'smirk',
  sceptre: [15, 6],
  farHand: [-3, 12],
  fan: false,
  crown: [0, 0],
  crownTilt: 0,
  sweat: false,
  legs: 1,
  ...p
})

const KEY = {
  K: C.black,
  w: C.white,
  i: C.ink,
  y: GOLD[1],
  Y: GOLD[2],
  h: GOLD[0],
  r: BAND[1],
  g: GOLD[1],
  x: GOLD[0]
}

const EYE_SHAPES: Record<Eyes, readonly [readonly string[], readonly string[]]> = {
  open: [
    ['i.....', '.KKKK.', 'KKKKKK', 'KwKKKK', 'KKKKKK', '.KKKK.'],
    ['i....', '.KKK.', 'KKKKK', 'KwKKK', 'KKKKK', '.KKK.']
  ],
  bored: [
    ['i.....', 'iiiiii', 'KwKKKK', 'KKKKKK', '.KKKK.', '......'],
    ['i....', 'iiiii', 'KwKKK', 'KKKKK', '.KKK.', '.....']
  ],
  happy: [
    ['i.....', '.iiii.', 'i....i', '......', '......', '......'],
    ['i....', '.iii.', 'i...i', '.....', '.....', '.....']
  ],
  glare: [
    ['i.....', '.iiii.', '..KKKK', 'KwKKKK', 'KKKKKK', '.KKKK.'],
    ['i....', '.iii.', '..KKK', 'KwKKK', 'KKKKK', '.KKK.']
  ],
  closed: [
    ['i.....', '......', '......', 'iiiiii', '......', '......'],
    ['i....', '.....', '.....', 'iiiii', '.....', '.....']
  ],
  swirl: [
    ['.KKK..', 'KwwwK.', 'KwKwK.', 'KwwKK.', '.KKK..', '......'],
    ['.KK..', 'KwwK.', 'KKwK.', 'KwKK.', '.KK..', '.....']
  ],
  hurt: [
    ['i.....', '.ii...', '...ii.', '.ii...', 'i.....', '......'],
    ['...i.', '.ii..', 'i....', '.ii..', '...i.', '.....']
  ],
  dead: [
    ['K...K.', '.K.K..', '..K...', '.K.K..', 'K...K.', '......'],
    ['K..K.', '.KK..', '.KK..', '.KK..', 'K..K.', '.....']
  ]
}

function face(l: Raster, hx: number, hy: number, p: BeePose) {
  const [near, far] = EYE_SHAPES[p.eyes]
  l.stamp(near, hx - 4, hy - 4, KEY)
  l.stamp(far, hx + 6, hy - 3, KEY)
  l.ellipse(hx - 6, hy + 5, 2.6, 1.6, C.blush)
  l.ellipse(hx + 12, hy + 5, 2, 1.4, C.blush)
  const mx = hx + 5
  const my = hy + 8
  switch (p.mouth) {
    case 'smirk':
      l.line(mx - 2, my + 1, mx + 1, my + 1, C.ink)
      l.line(mx + 1, my + 1, mx + 4, my - 1, C.ink)
      break
    case 'laugh':
      l.ellipse(mx + 1, my + 1.5, 4, 3, C.mouth)
      l.rect(mx - 2, my - 1, 6, 1, C.white)
      l.rect(mx, my + 2, 3, 1, C.tongue)
      break
    case 'o':
      l.ellipse(mx + 1, my + 1.5, 2, 2.5, C.mouth)
      break
    case 'flat':
      l.rect(mx - 2, my + 1, 6, 1, C.ink)
      break
    case 'pant':
      l.ellipse(mx + 1, my + 1.5, 3, 2.5, C.mouth)
      l.rect(mx, my + 2, 3, 2, C.tongue)
      break
    case 'tongue':
      l.line(mx - 2, my, mx + 4, my, C.ink)
      l.rect(mx + 1, my + 1, 3, 3, C.tongue)
      break
  }
}

/** A translucent wing: pale flat fill, a darker rim and one vein, from the root along the direction. */
function wing(l: Raster, root: Pt, dir: number, len: number, w: number, tone: 'main' | 'ghost') {
  const cx = root[0] + Math.cos(dir) * len * 0.5
  const cy = root[1] + Math.sin(dir) * len * 0.5
  const ca = Math.cos(dir)
  const sa = Math.sin(dir)
  const rx = len * 0.5
  const r = Math.ceil(rx) + 2
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const u = (dx * ca + dy * sa) / rx
      const v = (-dx * sa + dy * ca) / w
      const q = u * u + v * v
      if (q > 1.0001) continue
      // tapered towards the root: a teardrop rather than an ellipse
      if (Math.abs(v) > 0.55 + 0.45 * (u + 1) * 0.5 + 0.3) continue
      const edge = q > 0.72
      const lit = (-dx + -dy) * 0.5 > 1 && q < 0.45
      if (tone === 'ghost') l.set(x, y, edge ? WING[2] : WING[1])
      else l.set(x, y, edge ? WING[2] : lit ? WING[0] : WING[1])
    }
  if (tone === 'main') {
    for (let k = 4; k < len - 4; k += 2) l.set(root[0] + ca * k, root[1] + sa * k, WING[0])
  }
}

/** The tiny crown. */
function crown(l: Raster, x: number, y: number) {
  l.stamp(['h.y.y.h', 'yyyyyyy', 'yYyryYy', 'YYYYYYY'], x, y, KEY)
}

/** One frame of the queen. */
export function drawBee(p: BeePose): Raster {
  const g = new Rig(p.pitch, [64, 88], p.shift)
  const b = p.bob
  const torso: Pt = [63, 84 - b]
  const head: Pt = [75 + p.lean, 55 - b]
  const root: Pt = [58, 72 - b]

  // wings
  g.add(
    -4,
    (l) => {
      const len = 36 * p.wingLen
      if (p.blur) wing(l, root, p.wingFar + p.blur, len, 8, 'ghost')
      wing(l, [root[0] + 4, root[1] + 1], p.wingFar, len * 0.92, 7, 'main')
    },
    false
  )
  g.add(
    -1.6,
    (l) => {
      const len = 40 * p.wingLen
      if (p.blur) wing(l, root, p.wingNear - p.blur, len, 9, 'ghost')
      wing(l, root, p.wingNear, len, 8.5, 'main')
    },
    false
  )
  // abdomen and stinger: swings from trailing down-left to curled forward under the body
  const alpha = ((160 - p.curl * 140) * Math.PI) / 180
  const dir: Pt = [Math.cos(alpha), Math.sin(alpha)]
  const baseP: Pt = [58 + p.curl * 4, 92 - b + p.curl * 2]
  g.add(-2, (l) => {
    const tipBase: Pt = [baseP[0] + dir[0] * 30, baseP[1] + dir[1] * 30]
    const tip: Pt = [baseP[0] + dir[0] * 49, baseP[1] + dir[1] * 49]
    const nx = -dir[1]
    const ny = dir[0]
    l.poly(
      [tipBase[0] + nx * 5.5, tipBase[1] + ny * 5.5, tip[0], tip[1], tipBase[0] - nx * 5.5, tipBase[1] - ny * 5.5],
      DARK[1]
    )
    l.set(tipBase[0] + dir[0] * 4 - nx, tipBase[1] + dir[1] * 4 - ny, DARK[0])
    l.set(tipBase[0] + dir[0] * 6 - nx, tipBase[1] + dir[1] * 6 - ny, DARK[0])
    const c: Pt = [baseP[0] + dir[0] * 16, baseP[1] + dir[1] * 16]
    blob(
      l,
      c[0],
      c[1],
      18,
      14.5,
      alpha,
      (u) => (u > 0.25 && u < 0.62 ? DARK : u < -0.3 && u > -0.7 ? DARK : GOLD),
      false
    )
    if (p.curl > 0.5) {
      // the glint on the point: the telegraph
      l.set(tip[0] - dir[0] * 2, tip[1] - dir[1] * 2, C.white)
    }
  })
  // far arm and far leg
  if (!p.fan)
    g.add(-1.2, (l) => {
      const s: Pt = [torso[0] - 2, torso[1] - 5]
      const h: Pt = [s[0] + p.farHand[0], s[1] + p.farHand[1]]
      bar(l, s, h, 5, FAR_DARK[1])
      lit(l, h[0], h[1], 3.4, 3.2, SKIN, false)
    })
  else
    // the hand fan, held up in front of the face
    g.add(2.5, (l) => {
      const s: Pt = [torso[0] + 4, torso[1] - 4]
      const h: Pt = [torso[0] + 10 + p.farHand[0], torso[1] - 8 + p.farHand[1]]
      bar(l, s, [(s[0] + h[0]) / 2 + 2, (s[1] + h[1]) / 2 + 3], 5, DARK[1])
      bar(l, [(s[0] + h[0]) / 2 + 2, (s[1] + h[1]) / 2 + 3], h, 5, DARK[1])
      const fx = h[0] + 2
      const fy = h[1] - 2
      l.ellipse(fx + 3, fy - 5, 8, 6.5, WING[1])
      l.ellipse(fx + 2, fy - 7, 5, 3.5, WING[0])
      for (const k of [-4, 0, 4]) l.line(fx, fy + 1, fx + 3 + k * 1.5, fy - 10, WING[2])
      l.rect(fx - 4, fy, 14, 2, BAND[1])
      lit(l, h[0], h[1], 3.4, 3.2, SKIN, false)
    })
  if (p.legs > 0)
    g.add(-1.1, (l) => {
      const fy = 113 - b
      bar(l, [torso[0] + 6, torso[1] + 11], [torso[0] + 9, fy - 2], 5, FAR_DARK[1])
      l.ellipse(torso[0] + 11, fy, 4.5, 2.6, FAR_DARK[1])
    })
  // torso: a plump gold body with a red sash
  g.add(0, (l) => {
    lit(l, torso[0], torso[1], 15, 14.5, GOLD)
    // dark band round the belly
    for (let k = 0; k < 3; k++) {
      const y = Math.round(torso[1] + 8 + k)
      for (let x = torso[0] - 15; x <= torso[0] + 15; x++) l.paint(x, y, k === 2 ? DARK[2] : DARK[1])
    }
    // the sash from the left shoulder across to the right hip
    for (let t = 0; t <= 1; t += 0.02) {
      const x = torso[0] - 10 + t * 21
      const y = torso[1] - 8 + t * 17
      for (let k = -2; k <= 1; k++) l.paint(x, y + k, k === -2 ? BAND[0] : k === 1 ? BAND[2] : BAND[1])
    }
    lit(l, torso[0] + 10, torso[1] + 8, 2.6, 2.6, GOLD, true)
  })
  // near leg
  if (p.legs > 0)
    g.add(0.5, (l) => {
      const fy = 114 - b
      bar(l, [torso[0] - 4, torso[1] + 11], [torso[0] - 6, fy - 2], 5, DARK[1])
      l.ellipse(torso[0] - 4, fy, 5, 2.8, DARK[1])
      l.rect(torso[0] - 8, fy - 1, 5, 1, DARK[0])
    })
  // fluffy collar
  g.add(0.8, (l) => {
    const pts: [number, number, number][] = [
      [-8, 0, 5],
      [-2, 3, 5.5],
      [5, 4, 5.5],
      [12, 1, 5],
      [-5, -3, 4.6],
      [8, -2, 4.6]
    ]
    for (const [dx, dy, r] of pts) lit(l, head[0] - 6 + dx, head[1] + 16 + dy, r, r, WING, false)
  })
  // antennae
  g.add(0.9, (l) => {
    const sway = Math.sin(p.lean * 0.4 + b * 0.5)
    for (const [ox, tx] of [
      [-8, -15],
      [6, 9]
    ] as const) {
      const a: Pt = [head[0] + ox, head[1] - 10]
      const t: Pt = [head[0] + tx + sway * 2, head[1] - 27]
      bar(l, a, [(a[0] + t[0]) / 2 + (ox < 0 ? -3 : 3), (a[1] + t[1]) / 2 - 1], 2, DARK[1])
      bar(l, [(a[0] + t[0]) / 2 + (ox < 0 ? -3 : 3), (a[1] + t[1]) / 2 - 1], t, 2, DARK[1])
      lit(l, t[0], t[1], 2.8, 2.8, GOLD)
    }
  })
  // head
  g.add(1, (l) => {
    const [hx, hy] = head
    lit(l, hx, hy, 14, 13, SKIN)
    // dark hair, swept back over the top
    for (let y = hy - 14; y <= hy - 3; y++)
      for (let x = hx - 15; x <= hx + 15; x++) {
        const dy = (y - (hy - 8)) / 7
        const dx = (x - (hx - 3)) / 15
        if (dx * dx + dy * dy < 1) l.paint(x, y, y - hy < -9 ? DARK[0] : DARK[1])
      }
    l.paint(hx - 12, hy - 1, DARK[1])
    l.paint(hx - 13, hy, DARK[2])
    face(l, hx, hy, p)
  })
  // crown
  if (p.crown) g.add(1.5, (l) => crown(l, head[0] - 4 + p.crown![0], head[1] - 18 + p.crown![1]))
  // near arm with the sceptre
  if (p.sceptre)
    g.add(2, (l) => {
      const s: Pt = [torso[0] + 8, torso[1] - 6]
      const h: Pt = [s[0] + p.sceptre![0], s[1] + p.sceptre![1]]
      bar(l, s, [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2 + 3], 5, DARK[1])
      bar(l, [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2 + 3], h, 5, DARK[1])
      // rod and gem
      bar(l, [h[0] + 1, h[1] + 8], [h[0] + 3, h[1] - 19], 2, GOLD[1])
      lit(l, h[0] + 3, h[1] - 22, 3.6, 3.6, BAND)
      l.set(h[0] + 2, h[1] - 24, C.white)
      lit(l, h[0], h[1], 3.4, 3.2, SKIN, false)
    })
  else
    g.add(2, (l) => {
      const s: Pt = [torso[0] + 8, torso[1] - 6]
      bar(l, s, [s[0] + 3, s[1] + 12], 5, DARK[1])
      lit(l, s[0] + 3, s[1] + 13, 3.4, 3.2, SKIN, false)
    })
  if (p.sweat)
    g.add(3, (l) => l.stamp(['.c.', 'ccc', 'ccc', '.c.'], head[0] - 17, head[1] - 12, { c: R.water[1] }), false)
  if (p.stars !== undefined)
    g.add(
      3,
      (l) => {
        for (let k = 0; k < 3; k++) {
          const a = p.stars! + (k * Math.PI * 2) / 3
          const x = head[0] + Math.cos(a) * 18
          const y = head[1] - 20 + Math.sin(a) * 4
          l.stamp(['..x..', '.xgx.', 'xgggx', '.xgx.', '..x..'], x - 2, y - 2, KEY)
        }
      },
      false
    )
  return g.render()
}

// ---------------------------------------------------------------------------------------------- clips

const TAU = Math.PI * 2

/** Lowers a lying frame onto the floor and keeps it inside the frame. */
function settle(r: Raster, bottom = 120) {
  const b = r.bounds()!
  const dx = Math.max(2 - b.x, Math.min(0, 125 - (b.x + b.w - 1)))
  return r.shifted(dx, bottom - (b.y + b.h - 1))
}

/** Streak trail behind a dashing frame: the silhouette smeared left in pale lines. */
function streak(r: Raster, shifts: number[]) {
  const out = new Raster(128, 128)
  for (const [k, dx] of shifts.entries())
    for (let y = 0; y < 128; y++) {
      if ((y + k) % 3) continue
      for (let x = 0; x < 128; x++) {
        if (!r.get(x, y)) continue
        const nx = x - dx
        if (nx >= 2 && nx < 126 && !out.get(nx, y)) out.set(nx, y, k === 0 ? WING[1] : WING[2])
      }
    }
  return out.blit(r)
}

const idle = memo(() =>
  [0, 1, 2, 3].map((i) => {
    const t = i / 4
    const s = Math.sin(t * TAU)
    return drawBee(
      beePose({
        bob: 1.4 + s * 1.2,
        lean: -s * 0.8,
        wingNear: -2.1 + (i % 2 ? -0.28 : 0.2),
        wingFar: -1.7 + (i % 2 ? 0.22 : -0.2),
        blur: i % 2 ? 0.22 : 0,
        sceptre: [15, 6 + s],
        farHand: [-3, 12 - s],
        curl: 0.04 + Math.max(0, s) * 0.06
      })
    )
  })
)

const intro = memo(() =>
  [
    beePose({ bob: 1, wingNear: -2.3, wingFar: -1.9, sceptre: [12, 2], eyes: 'bored', mouth: 'flat' }),
    beePose({
      bob: 3,
      lean: -1,
      wingNear: -2.7,
      wingFar: -2.3,
      blur: 0.3,
      sceptre: [13, -14],
      eyes: 'open',
      mouth: 'smirk',
      curl: 0.1
    }),
    beePose({
      bob: 5,
      lean: -2,
      wingNear: -1.7,
      wingFar: -1.3,
      blur: -0.35,
      sceptre: [14, -18],
      eyes: 'happy',
      mouth: 'laugh',
      curl: 0.15
    }),
    beePose({
      bob: 4,
      lean: -1,
      wingNear: -2.6,
      wingFar: -2.2,
      blur: 0.3,
      sceptre: [14, -17],
      eyes: 'happy',
      mouth: 'laugh',
      curl: 0.1
    })
  ].map(drawBee)
)

const move = memo(() =>
  Array.from({ length: 6 }, (_, i) => {
    const t = i / 6
    const s = Math.sin(t * TAU)
    return drawBee(
      beePose({
        bob: 3 + s * 1.8,
        lean: 3,
        pitch: 0.12,
        curl: 0.3 + 0.05 * s,
        wingNear: -2.3 + (i % 2 ? -0.5 : 0.35),
        wingFar: -1.9 + (i % 2 ? 0.4 : -0.35),
        blur: i % 2 ? 0.3 : -0.3,
        sceptre: [14, 8 + s],
        farHand: [-4, 11],
        eyes: 'open',
        mouth: 'smirk',
        legs: 0.5
      })
    )
  })
)

const windup = memo(() =>
  [
    beePose({
      bob: 3,
      lean: -2,
      pitch: -0.05,
      curl: 0.45,
      wingNear: -2.6,
      wingFar: -2.3,
      sceptre: [10, 8],
      eyes: 'glare',
      mouth: 'flat'
    }),
    beePose({
      bob: 2,
      lean: -3,
      pitch: -0.12,
      curl: 0.8,
      wingNear: -2.9,
      wingFar: -2.6,
      sceptre: [8, 10],
      eyes: 'glare',
      mouth: 'flat',
      legs: 0
    }),
    beePose({
      bob: 1,
      lean: -4,
      pitch: -0.2,
      curl: 1,
      wingNear: -3.05,
      wingFar: -2.85,
      sceptre: [6, 11],
      eyes: 'glare',
      mouth: 'flat',
      legs: 0
    })
  ].map(drawBee)
)

const attack = memo(() =>
  [0, 1, 2, 3].map((i) =>
    streak(
      drawBee(
        beePose({
          bob: 4 + (i % 2),
          lean: 4,
          pitch: -0.36,
          curl: 1,
          wingNear: -2.95 + (i % 2 ? -0.18 : 0.15),
          wingFar: -2.7 + (i % 2 ? 0.2 : -0.12),
          blur: i % 2 ? 0.3 : -0.28,
          sceptre: [4, 12],
          eyes: 'glare',
          mouth: 'laugh',
          legs: 0,
          shift: [-8, 4 - (i % 2)]
        })
      ),
      [12 + i]
    )
  )
)

const recover = memo(() =>
  [
    beePose({
      bob: 1,
      lean: -3,
      wingNear: 2.5,
      wingFar: 2.2,
      wingLen: 0.8,
      sceptre: [-2, 14],
      farHand: [8, -4],
      fan: true,
      eyes: 'closed',
      mouth: 'pant',
      sweat: true,
      curl: 0.15
    }),
    beePose({
      bob: 0,
      lean: -2,
      wingNear: 2.65,
      wingFar: 2.35,
      wingLen: 0.8,
      sceptre: [-2, 14],
      farHand: [10, -9],
      fan: true,
      eyes: 'bored',
      mouth: 'pant',
      sweat: true,
      curl: 0.2
    })
  ].map(drawBee)
)

/** Nudges a frame so it keeps one empty pixel to every edge. */
function fit(r: Raster) {
  const b = r.bounds()!
  const dx = Math.max(2 - b.x, Math.min(0, 125 - (b.x + b.w - 1)))
  const dy = Math.max(2 - b.y, Math.min(0, 125 - (b.y + b.h - 1)))
  return dx || dy ? r.shifted(dx, dy) : r
}

const hurt = memo(() =>
  [
    beePose({
      bob: 4,
      lean: -5,
      pitch: -0.18,
      wingNear: -2.7,
      wingFar: -2.4,
      blur: 0.3,
      sceptre: [8, -2],
      eyes: 'hurt',
      mouth: 'o',
      sweat: true,
      curl: 0.3
    }),
    beePose({
      bob: 2,
      lean: -3,
      pitch: -0.08,
      wingNear: -2.4,
      wingFar: -2.1,
      blur: -0.3,
      sceptre: [10, 4],
      eyes: 'hurt',
      mouth: 'o',
      sweat: true,
      curl: 0.2,
      crown: [-1, 1]
    })
  ].map((p) => fit(drawBee(p)))
)

/** The fallen crown, dropped onto the finished frame so it stays whole. */
function dropCrown(r: Raster, x: number, y: number) {
  const layer = new Raster(128, 128)
  crown(layer, x, y)
  outline(layer)
  return r.blit(layer)
}

const defeat = memo(() =>
  [
    beePose({
      bob: 3,
      lean: -3,
      pitch: -0.15,
      wingNear: -2.7,
      wingFar: -2.4,
      blur: 0.4,
      sceptre: [8, 2],
      eyes: 'swirl',
      mouth: 'o',
      crown: [-1, -3],
      crownTilt: 0.3,
      stars: 0.4,
      curl: 0.3
    }),
    beePose({
      bob: 1,
      lean: -2,
      pitch: 0.45,
      wingNear: -2.9,
      wingFar: -2.5,
      blur: -0.5,
      sceptre: [8, 6],
      eyes: 'swirl',
      mouth: 'o',
      crown: null,
      stars: 2.3,
      curl: 0.4,
      shift: [0, -4]
    }),
    beePose({
      bob: 0,
      lean: 0,
      pitch: 1.1,
      wingNear: -3.0,
      wingFar: -2.7,
      blur: 0.5,
      wingLen: 0.8,
      sceptre: null,
      eyes: 'dead',
      mouth: 'o',
      crown: null,
      curl: 0.5,
      shift: [0, -6]
    }),
    beePose({
      bob: 0,
      lean: 0,
      pitch: 1.85,
      wingNear: -3.1,
      wingFar: -2.9,
      wingLen: 0.75,
      sceptre: null,
      eyes: 'dead',
      mouth: 'tongue',
      crown: null,
      curl: 0.4,
      shift: [4, -6]
    }),
    beePose({
      bob: 0,
      lean: 0,
      pitch: 2.3,
      wingNear: -3.0,
      wingFar: -2.9,
      wingLen: 0.7,
      sceptre: null,
      eyes: 'swirl',
      mouth: 'tongue',
      crown: null,
      curl: 0.4,
      legs: 0,
      shift: [8, -6]
    }),
    beePose({
      bob: 0,
      lean: 0,
      pitch: Math.PI / 2 + 0.05,
      wingNear: -2.8,
      wingFar: -2.6,
      wingLen: 0.7,
      sceptre: null,
      eyes: 'swirl',
      mouth: 'tongue',
      crown: null,
      curl: 0.3,
      legs: 0,
      shift: [14, -6]
    })
  ].map((p, i) => {
    const fx = [-1, 74, 88, 100, 100, 100][i]
    const fy = [-1, 24, 62, 108, 114, 115][i]
    const frame = i >= 3 ? settle(drawBee(p)) : drawBee(p)
    return fx < 0 ? frame : dropCrown(frame, fx, fy)
  })
)

export const sheets: SheetModule = {
  beeBoss: () => ({
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
