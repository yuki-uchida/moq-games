/**
 * ごりら警部 (`apeBoss`): a charcoal silverback who plays police inspector for the gang. A top-heavy knuckle-walker:
 * huge shoulders as the highest point, a silver saddle sloping down to small hindquarters, short bowed legs and long
 * arms planted on leathery knuckles in front of the feet. The head sits low between the shoulders under a navy
 * police cap, with a bare warm-grey face plate, a heavy brow ridge and a stern mouth.
 *
 * One pose-parametric draw function; every clip is a list of poses (see `bossSpec('apeBoss')`). Big furry forms are
 * built as masks and shaded from their edges (light from the top-left): a highlight band along the lit rim, a base,
 * a wide shade and a deep rim, plus fur tufts that break the outline.
 */
import type { SheetModule } from '../../module'
import { bossSpec } from '../../contract'
import { C, R, ramp } from '../../palette'
import { Painter, Raster, farRamp, hash, type Pt, type Ramp } from '../../raster'
import { lazyAnim, memo } from '../../sheet'
import { puff } from './bear'

const FUR = ramp('#8f89a6', '#4b455f', '#312d42', '#1e1b2b', '#15121f')
const FAR = farRamp(FUR)
const SILVER = ramp('#d8def0', '#9ca6c0', '#6d7694', '#474c6a', '#15121f')

const LEATHER = ramp('#c0b2bc', '#94889c', '#6c6180', '#473f5a', '#15121f')
/** Lighter knuckle and toe skin, from the same colours. */
const SKIN: Ramp = [LEATHER[0], LEATHER[0], LEATHER[1], LEATHER[2], LEATHER[4]]
const NAVY = ramp('#5f78e0', '#2e429e', '#212f72', '#141c48', '#15121f')
const GOLD = R.gold
const BAND = R.bandana

type Eyes = 'stern' | 'roar' | 'closed' | 'hurt' | 'swirl' | 'tired'
type Mouth = 'closed' | 'grit' | 'roar' | 'pant' | 'gasp'

interface Fx {
  sweat?: Pt[]
  dust?: [number, number, number][]
  stars?: Pt[]
  arcs?: number
  lines?: [number, number, number, number][]
  tufts?: [number, number, number, number][]
}

export interface ApePose {
  /** Shoulder mass and rump: centre and radii. */
  S: Pt
  sr: Pt
  R: Pt
  rr: Pt
  head: Pt
  /** Head turn in radians (clockwise on screen; negative looks up). */
  tilt: number
  nearHand: Pt
  farHand: Pt
  nearBend: Pt
  farBend: Pt
  nearFoot: Pt
  farFoot: Pt
  legBend?: Pt
  soles?: boolean
  /** Lying on the back: no back ruff or saddle, chest plate on top. */
  lying?: boolean
  eyes: Eyes
  mouth: Mouth
  jaw: number
  /** Cap offset from its place on the head, and extra tilt. */
  cap: Pt
  capTilt?: number
  capAt?: Pt
  fx: Fx
}

const W = 128
const rot = (u: number, v: number, a: number): Pt => [
  u * Math.cos(a) - v * Math.sin(a),
  u * Math.sin(a) + v * Math.cos(a)
]

// -------------------------------------------------------------------------------------------- toolkit

/** Shades a mask from its edges: highlight band at the lit rim, base, shade and deep at the far rim. */
function shade(
  l: Raster,
  m: Raster,
  base: Ramp,
  o: { hi?: number; sh?: number; deep?: number; pick?: (x: number, y: number) => Ramp } = {}
) {
  const hi = o.hi ?? 3
  const sh = o.sh ?? 4
  const dp = o.deep ?? 1
  const b = m.bounds()
  if (!b) return
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if (!m.get(x, y)) continue
      let ul = 0
      while (ul < hi && m.get(x - ul - 1, y - ul - 1)) ul++
      let dr = 0
      while (dr < sh && m.get(x + dr + 1, y + dr + 1)) dr++
      const rp = o.pick ? o.pick(x, y) : base
      l.set(x, y, dr < dp ? rp[3] : dr < sh ? rp[2] : ul < hi ? rp[0] : rp[1])
    }
}

/** A fur tuft: a small triangle on the mask, base centred at (x, y), pointing along (dx, dy). */
function tuft(m: Raster, x: number, y: number, dx: number, dy: number, w = 2.6) {
  const len = Math.max(1, Math.hypot(dx, dy))
  const px = (-dy / len) * w
  const py = (dx / len) * w
  m.poly([x + px, y + py, x + dx, y + dy, x - px, y - py], 1)
}

/** Tufts around an ellipse between two angles, swept backward and down like combed fur. */
function ruff(m: Raster, c: Pt, r: Pt, a0: number, a1: number, n: number, size: number) {
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1)
    const px = c[0] + Math.cos(a) * r[0] * 0.94
    const py = c[1] + Math.sin(a) * r[1] * 0.94
    const nx = Math.cos(a) / r[0]
    const ny = Math.sin(a) / r[1]
    const nl = Math.hypot(nx, ny)
    tuft(m, px, py, (nx / nl) * size - size * 0.45, (ny / nl) * size + size * 0.3)
  }
}

/** Short combed fur flecks on the base tone: a three-pixel stroke sweeping back and down. */
function flecks(l: Raster, m: Raster, ramp5: Ramp, seed: number, step = 8) {
  const b = m.bounds()
  if (!b) return
  for (let gy = b.y; gy < b.y + b.h; gy += step)
    for (let gx = b.x; gx < b.x + b.w; gx += step) {
      const h = hash(gx, gy, seed)
      const x = gx + (h % step)
      const y = gy + ((h >> 8) % step)
      if (l.get(x, y) !== ramp5[1] || l.get(x - 1, y + 1) !== ramp5[1] || l.get(x - 2, y + 2) !== ramp5[1]) continue
      l.set(x, y, ramp5[2])
      l.set(x - 1, y + 1, ramp5[2])
      if (l.get(x - 2, y + 2) === ramp5[1] && h & 1) l.set(x - 2, y + 2, ramp5[2])
    }
}

/** Two-bone solve: the elbow (or knee) for a root, a target and a preferred bend direction. */
function solve(s: Pt, t: Pt, bend: Pt, l1: number, l2: number): { e: Pt; h: Pt } {
  const dx = t[0] - s[0]
  const dy = t[1] - s[1]
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

/** A tapered limb segment as a polygon: width w0 at a, w1 at b, with round joints. */
function taper(m: Raster, a: Pt, b: Pt, w0: number, w1: number) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.max(1, Math.hypot(dx, dy))
  const nx = -dy / len
  const ny = dx / len
  m.poly(
    [
      a[0] + (nx * w0) / 2,
      a[1] + (ny * w0) / 2,
      b[0] + (nx * w1) / 2,
      b[1] + (ny * w1) / 2,
      b[0] - (nx * w1) / 2,
      b[1] - (ny * w1) / 2,
      a[0] - (nx * w0) / 2,
      a[1] - (ny * w0) / 2
    ],
    1
  )
  m.ellipse(a[0], a[1], w0 / 2, w0 / 2, 1)
  m.ellipse(b[0], b[1], w1 / 2, w1 / 2, 1)
}

// -------------------------------------------------------------------------------------------- head and cap

function eyeStamps(l: Raster, eyes: Eyes, ox: number, oy: number) {
  const K = { K: C.black, w: C.white, i: C.ink, s: SKIN[2] }
  const near: Record<Eyes, string[]> = {
    stern: ['wKK', 'KKK'],
    tired: ['iii', 'KwK'],
    roar: ['iii', '.K.'],
    closed: ['...', 'iii'],
    hurt: ['i.i', '.i.', 'i.i'],
    swirl: ['KKKKK', 'KwwwK', 'KwKwK', 'KwwwK', 'KKKKK']
  }
  const far: Record<Eyes, string[]> = {
    stern: ['wK', 'KK'],
    tired: ['ii', 'KK'],
    roar: ['ii', 'K.'],
    closed: ['..', 'ii'],
    hurt: ['i.i', '.i.', 'i.i'],
    swirl: ['KKKK', 'KwwK', 'KwKK', 'KKKK']
  }
  const big = eyes === 'swirl'
  l.stamp(near[eyes], ox + 7 - (big ? 1 : 0), oy - (big ? 2 : 1), K)
  l.stamp(far[eyes], ox + (big ? 14 : 15), oy - (big ? 2 : 1), K)
}

/** The head facing right, drawn in a 64×64 cell centred at (32, 32). */
function drawHead(p: ApePose): Raster {
  const g = new Painter(64, 64)
  const ox = 32
  const oy = 32
  const jaw = p.mouth === 'roar' || p.mouth === 'pant' || p.mouth === 'gasp' ? p.jaw : 0
  const drop = jaw * 8

  // skull with the sagittal crest
  g.add(0, (l) => {
    const m = new Raster(64, 64)
    m.ellipse(ox, oy, 15, 13.5, 1)
    m.poly([ox - 12, oy - 3, ox - 7, oy - 19, ox + 3, oy - 19, ox + 10, oy - 6], 1)
    tuft(m, ox - 11, oy - 9, -5, -3, 2.4)
    tuft(m, ox - 12, oy - 2, -5, 2, 2.4)
    tuft(m, ox - 10, oy + 6, -4, 4, 2.2)
    shade(l, m, FUR, { hi: 3, sh: 6, deep: 2 })
  })
  // far ear and near ear
  g.add(1, (l) => {
    const m = new Raster(64, 64)
    m.ellipse(ox - 3, oy + 2, 4, 5, 1)
    shade(l, m, FUR, { hi: 2, sh: 3, deep: 1 })
    l.rect(ox - 4, oy + 1, 2, 3, LEATHER[3])
  })
  // lower jaw (drops when the mouth opens)
  g.add(2, (l) => {
    const m = new Raster(64, 64)
    m.ellipse(ox + 11, oy + 12 + drop, 11, 5, 1)
    shade(l, m, farRamp(LEATHER), { hi: 2, sh: 3, deep: 1 })
  })
  // mouth interior
  if (jaw > 0)
    g.add(3, (l) => {
      const cy = oy + 10 + drop / 2
      l.ellipse(ox + 12, cy, 9, 2 + jaw * 4, C.mouth)
      l.rect(ox + 7, Math.round(cy - 2 - jaw * 3.5), 11, 2, C.white)
      if (p.mouth === 'roar') l.ellipse(ox + 12, cy + 1 + jaw * 2, 6, 1.6 + jaw, C.tongue)
      if (p.mouth === 'pant') l.ellipse(ox + 13, cy + 2 + jaw * 2, 5, 2.6, C.tongue)
    })
  // bare face plate and muzzle
  g.add(4, (l) => {
    const m = new Raster(64, 64)
    m.ellipse(ox + 8, oy + 2.5, 11.5, 10.5, 1)
    m.ellipse(ox + 14.5, oy + 7, 8.5, 6.5, 1)
    if (jaw > 0) m.rect(ox + 6, oy + 9, 20, 3, 0)
    shade(l, m, LEATHER, { hi: 2, sh: 4, deep: 1 })
  })
  // brow ridge, nose and mouth line
  g.add(
    5,
    (l) => {
      const slope = p.eyes === 'tired' || p.eyes === 'hurt' ? 1.5 : p.eyes === 'closed' ? 0 : 2.2
      const top = p.eyes === 'tired' || p.eyes === 'hurt' ? -5 : -6.5
      l.thick(ox + 1, oy + top - 0.5, ox + 18, oy + top + slope, 4, FUR[2])
      l.thick(ox + 1, oy + top - 1, ox + 17, oy + top + slope - 1.4, 2, FUR[1])
      l.thick(ox + 4, oy + top + 1.8, ox + 19, oy + top + slope + 1.8, 1.2, FUR[3])
      l.rect(ox + 6, oy - 2, 5, 4, LEATHER[3])
      l.rect(ox + 14, oy - 2, 4, 4, LEATHER[3])
      eyeStamps(l, p.eyes, ox, oy)
      // flat wide nose with two nostrils
      l.rect(ox + 16, oy + 5, 2, 2, LEATHER[3])
      l.rect(ox + 20, oy + 5, 2, 2, LEATHER[3])
      l.set(ox + 15, oy + 4, LEATHER[0])
      l.rect(ox + 16, oy + 4, 6, 1, LEATHER[2])
      if (jaw === 0) {
        // long upper lip over a wide stern mouth
        l.line(ox + 9, oy + 11, ox + 21, oy + 11, FUR[3])
        l.set(ox + 8, oy + 12, FUR[3])
        l.set(ox + 22, oy + 10, FUR[3])
        if (p.mouth === 'grit') l.rect(ox + 11, oy + 11, 8, 1, C.white)
      } else {
        l.line(ox + 8, oy + 9, ox + 22, oy + 9, FUR[3])
      }
    },
    false
  )
  const h = g.render()
  return Math.abs(p.tilt) > 0.01 ? h.rotate(p.tilt) : h
}

/** The police cap in a 40×40 cell centred at (20, 20): navy dome, band, short visor, gold badge. */
function drawCap(): Raster {
  const g = new Painter(40, 40)
  g.add(0, (l) => {
    const m = new Raster(40, 40)
    m.ellipse(31, 25.5, 8.5, 2.6, 1)
    shade(l, m, NAVY, { hi: 1, sh: 2, deep: 1 })
  })
  g.add(1, (l) => {
    const m = new Raster(40, 40)
    m.ellipse(20, 19, 13, 9, 1)
    m.rect(7, 22, 26, 4, 1)
    m.rect(7, 26, 26, 1, 0)
    shade(l, m, NAVY, { hi: 3, sh: 4, deep: 1 })
    for (let x = 7; x < 33; x++) {
      if (l.get(x, 22)) l.set(x, 22, NAVY[3])
      if (l.get(x, 23)) l.set(x, 23, NAVY[2])
    }
    l.stamp(['.y.', 'yyY', '.Y.'], 23, 17, { y: GOLD[1], Y: GOLD[2] })
    l.set(24, 17, GOLD[0])
  })
  return g.render()
}

// -------------------------------------------------------------------------------------------- the body

function limbMask(p: ApePose, which: 'near' | 'far') {
  const S = p.S
  const J: Pt = which === 'near' ? [S[0] + p.sr[0] * 0.05, S[1] + 4] : [S[0] + p.sr[0] * 0.55, S[1] - 1]
  const hand = which === 'near' ? p.nearHand : p.farHand
  const bend = which === 'near' ? p.nearBend : p.farBend
  const a = solve(J, hand, bend, 34, 34)
  return { J, ...a }
}

function drawFoot(l: Raster, f: Pt, soles: boolean, ramp5: Ramp, far: boolean) {
  const m = new Raster(W, W)
  if (soles) {
    m.ellipse(f[0], f[1], 6.5, 8.5, 1)
    shade(l, m, ramp5, { hi: 2, sh: 3, deep: 1 })
    const pad = new Raster(W, W)
    pad.ellipse(f[0] + 1, f[1] + 1, 3.6, 5.5, 1)
    shade(l, pad, far ? farRamp(SKIN) : SKIN, { hi: 1, sh: 2, deep: 1 })
  } else {
    m.ellipse(f[0] + 3, f[1] - 3.5, 10, 4.6, 1)
    shade(l, m, ramp5, { hi: 2, sh: 3, deep: 1 })
    // pale toe pad on the front of the foot
    const pad = new Raster(W, W)
    pad.ellipse(f[0] + 9, f[1] - 2.5, 3.6, 3, 1)
    shade(l, pad, far ? farRamp(SKIN) : SKIN, { hi: 1, sh: 2, deep: 1 })
  }
}

function drawLeg(l: Raster, hip: Pt, f: Pt, soles: boolean, bend: Pt, ramp5: Ramp, far: boolean) {
  const k = solve(hip, [f[0], f[1] - (soles ? 6 : 6)], bend, 17, 17)
  const m = new Raster(W, W)
  taper(m, hip, k.e, 17, 13)
  taper(m, k.e, k.h, 13, 11)
  m.ellipse(k.e[0], k.e[1], 7, 7, 1)
  shade(l, m, ramp5, { hi: 3, sh: 4, deep: 1 })
  drawFoot(l, f, soles, ramp5, far)
}

function drawArmLayers(g: Painter, p: ApePose, which: 'near' | 'far', depth: number) {
  const a = limbMask(p, which)
  const far = which === 'far'
  const rp = far ? FAR : FUR
  const lower = new Raster(W, W)
  taper(lower, a.e, a.h, 15, 19)
  lower.ellipse(a.h[0] + 0.5, a.h[1] + 0.5, 8.8, 8.2, 1)

  g.add(depth, (l) => {
    const m = new Raster(W, W)
    taper(m, a.J, a.e, 20, 17)
    m.ellipse(a.J[0], a.J[1], 11.5, 11, 1)
    // shoulder and elbow fur
    const sdx = a.e[0] - a.J[0]
    const sdy = a.e[1] - a.J[1]
    tuft(m, a.J[0] - 3, a.J[1] - 8, -5, -4, 2.6)
    tuft(m, a.J[0] + 3, a.J[1] - 9, -2, -6, 2.4)
    shade(l, m, rp, { hi: 4, sh: 5, deep: 1 })
    flecks(l, m, rp, far ? 3 : 7, 7)
    if (!far) {
      // red gang armband around the upper arm
      const len = Math.max(1, Math.hypot(sdx, sdy))
      const ux = sdx / len
      const uy = sdy / len
      const px = a.J[0] + sdx * 0.5
      const py = a.J[1] + sdy * 0.5
      for (let y = Math.floor(py - 12); y <= Math.ceil(py + 12); y++)
        for (let x = Math.floor(px - 12); x <= Math.ceil(px + 12); x++) {
          if (!l.get(x, y)) continue
          const along = (x - px) * ux + (y - py) * uy
          const across = -(x - px) * uy + (y - py) * ux
          if (Math.abs(along) <= 2.4 && Math.abs(across) <= 9.5)
            l.set(x, y, across > 3 ? BAND[2] : along < -0.8 ? BAND[0] : BAND[1])
        }
    }
  })
  g.add(depth + 0.1, (l) => {
    // forearm widening to the wrist, with a visible elbow tuft
    const m = lower.clone()
    const bdx = a.e[0] - a.J[0]
    tuft(m, a.e[0] - 2, a.e[1] - 1, Math.sign(bdx || -1) * 6 - 5, 1, 3.2)
    tuft(m, a.e[0], a.e[1] + 2, -6, 3, 2.6)
    shade(l, m, rp, { hi: 3, sh: 4, deep: 1 })
    flecks(l, m, rp, far ? 5 : 11, 7)
    // fist with lighter knuckle skin: three or four bumps along the front and bottom
    const kp = far ? farRamp(SKIN) : SKIN
    const plate = new Raster(W, W)
    plate.ellipse(a.h[0] + 1.5, a.h[1] + 3.5, 8, 5.2, 1)
    shade(l, plate, kp, { hi: 2, sh: 3, deep: 1 })
    for (let i = -1; i <= 2; i++) {
      const bx = Math.round(a.h[0] + 1.5 + i * 3.6 - 1)
      for (let y = Math.round(a.h[1] + 1); y <= Math.round(a.h[1] + 5); y++)
        if (l.get(bx + 1, y) && l.get(bx + 2, y)) l.set(bx + 2, y, kp[3])
    }
  })
}

export function drawApe(p: ApePose): Raster {
  const g = new Painter(W, W)
  const { S, sr, R: H, rr } = p
  const legBend = p.legBend ?? [1, -0.15]

  // far limbs behind the torso
  drawArmLayers(g, p, 'far', -6)
  g.add(-5, (l) => drawLeg(l, [H[0] + 9, H[1] + 6], p.farFoot, !!p.soles, legBend, FAR, true))

  // torso: shoulder mass, belly and rump with a silver saddle and a bare chest plate
  const torso = new Raster(W, W)
  torso.ellipse(S[0], S[1], sr[0], sr[1], 1)
  torso.ellipse(H[0], H[1], rr[0], rr[1], 1)
  torso.thick(S[0] - 3, S[1] + 9, H[0] + 3, H[1] - 1, (sr[1] + rr[1]) * 0.9, 1)
  if (!p.lying) {
    torso.ellipse((S[0] + H[0]) / 2 + 9, (S[1] + H[1]) / 2 + 10, (sr[0] + rr[0]) * 0.5, (sr[1] + rr[1]) * 0.52, 1)
    ruff(torso, S, sr, Math.PI * 1.05, Math.PI * 1.6, 5, 6)
    ruff(torso, H, rr, Math.PI * 1.15, Math.PI * 1.6, 3, 5)
    ruff(torso, H, rr, Math.PI * 0.45, Math.PI * 0.8, 3, 5)
  } else {
    ruff(torso, S, sr, Math.PI * 0.55, Math.PI * 0.95, 3, 5)
    ruff(torso, H, rr, Math.PI * 0.3, Math.PI * 0.7, 3, 5)
  }
  const saddle = (x: number, y: number) => {
    if (p.lying || x < H[0] - 6 || x > S[0] + 8) return false
    let u = 0
    while (u < 16 && torso.get(x, y - u - 1)) u++
    return u >= 2 && u < 12 + ((x >> 1) & 1) * 2
  }
  g.add(-2, (l) => {
    shade(l, torso, FUR, {
      hi: 4,
      sh: p.lying ? 5 : 9,
      deep: p.lying ? 1 : 2,
      pick: (x, y) => (saddle(x, y) ? SILVER : FUR)
    })
    flecks(l, torso, FUR, 1, 8)
    // fur flecks in the silver
    const b = torso.bounds()!
    for (let y = b.y; y < b.y + b.h; y += 5)
      for (let x = b.x; x < b.x + b.w; x += 6) {
        const h = hash(x, y, 4)
        const px = x + (h % 6)
        const py = y + ((h >> 8) % 5)
        if (l.get(px, py) === SILVER[1] && l.get(px - 1, py + 1) === SILVER[1]) {
          l.set(px, py, SILVER[2])
          l.set(px - 1, py + 1, SILVER[2])
        }
      }
  })
  // chest plate and star badge
  g.add(
    -1,
    (l) => {
      const cx = p.lying ? S[0] + 8 : S[0] + sr[0] * 0.62
      const cy = p.lying ? S[1] - 7 : S[1] + sr[1] * 0.55
      const m = new Raster(W, W)
      if (p.lying) m.ellipse(cx, cy, 18, 8, 1)
      else m.ellipse(cx, cy, 11, 16, 1)
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m.get(x, y) && !torso.get(x, y)) m.set(x, y, 0)
      shade(l, m, LEATHER, { hi: 2, sh: 5, deep: 1 })
      l.stamp(['..y..', 'yyyyy', '.yYy.', '.Y.Y.'], Math.round(cx - 1), Math.round(cy - 2), { y: GOLD[1], Y: GOLD[2] })
      l.set(Math.round(cx + 1), Math.round(cy - 2), GOLD[0])
    },
    true
  )

  // near hind leg in front of the rump
  g.add(0, (l) => drawLeg(l, [H[0] - 4, H[1] + 6], p.nearFoot, !!p.soles, legBend, FUR, false))

  // head and cap
  const head = drawHead(p)
  g.add(1, (l) => l.blit(head, Math.round(p.head[0] - 32), Math.round(p.head[1] - 32)), false)
  g.add(
    2,
    (l) => {
      const [cu, cv] = rot(-1 + p.cap[0], -13 + p.cap[1], p.tilt)
      const [cx, cy] = p.capAt ?? [p.head[0] + cu, p.head[1] + cv]
      const cap = drawCap()
      const t = (p.capAt ? 0 : p.tilt) + (p.capTilt ?? 0)
      l.blit(Math.abs(t) > 0.01 ? cap.rotate(t) : cap, Math.round(cx - 20), Math.round(cy - 20))
    },
    false
  )

  // near arm in front of everything
  drawArmLayers(g, p, 'near', 3)

  // effects
  const fx = p.fx
  fx.tufts?.forEach(([x, y, dx, dy]) =>
    g.add(-7, (l) => l.poly([x - dy * 0.4, y + dx * 0.4, x + dx, y + dy, x + dy * 0.4, y - dx * 0.4], FUR[2]))
  )
  fx.dust?.forEach(([x, y, r]) => g.add(7, (l) => puff(l, x, y, r)))
  fx.sweat?.forEach(([x, y]) =>
    g.add(8, (l) => l.stamp(['..b..', '.bbb.', 'hbbbb', 'bbbbb', '.bbb.'], x - 2, y - 2, { b: R.water[1], h: C.white }))
  )
  fx.stars?.forEach(([x, y]) =>
    g.add(8, (l) => {
      l.stamp(['..y..', 'yyyyy', '.yYy.', '.Y.Y.'], x - 2, y - 2, { y: GOLD[1], Y: GOLD[2] })
      l.set(x, y - 2, GOLD[0])
    })
  )
  fx.lines?.forEach(([x, y, dx, dy]) => g.add(8, (l) => l.line(x, y, x + dx, y + dy, C.white), false))
  if (fx.arcs) {
    const [mu, mv] = rot(17, 9, p.tilt)
    const mx = p.head[0] + mu
    const my = p.head[1] + mv
    for (let i = 0; i < fx.arcs; i++)
      g.add(8, (l) => l.ring(mx + 3, my, 9 + i * 6, 11 + i * 6, C.white, -0.7 + p.tilt, 0.7 + p.tilt), false)
  }
  return g.render()
}

// -------------------------------------------------------------------------------------------- pose builders

interface WalkOpts {
  sink: number
  bob: number
  lean: number
  head: Pt
  tilt: number
  near: Pt
  far: Pt
  nearAt?: Pt
  farAt?: Pt
  nearBend: Pt
  farBend: Pt
  nearFoot: Pt
  farFoot: Pt
  eyes: Eyes
  mouth: Mouth
  jaw: number
  cap: Pt
  capTilt?: number
  capAt?: Pt
  rump: Pt
  sr: Pt
  rr: Pt
  legBend?: Pt
  fx: Fx
}

/** A knuckle-walking pose: fists on the ground, small feet, the big shoulders riding high in front. */
export function knuckle(o: Partial<WalkOpts> = {}): ApePose {
  const s: WalkOpts = {
    sink: 0,
    bob: 0,
    lean: 0,
    head: [0, 0],
    tilt: 0,
    near: [0, 0],
    far: [0, 0],
    nearBend: [-1, 0.15],
    farBend: [-1, 0.15],
    nearFoot: [0, 0],
    farFoot: [0, 0],
    eyes: 'stern',
    mouth: 'closed',
    jaw: 0,
    cap: [0, 0],
    rump: [0, 0],
    sr: [25, 23],
    rr: [16, 15],
    fx: {},
    ...o
  }
  const S: Pt = [56 + s.lean, 52 + s.sink - s.bob]
  return {
    S,
    sr: s.sr,
    R: [30 + s.lean * 0.4 + s.rump[0], 90 + s.sink * 0.55 - s.bob * 0.6 + s.rump[1]],
    rr: s.rr,
    head: [S[0] + 28 + s.head[0], S[1] + 12 + s.head[1]],
    tilt: s.tilt,
    nearHand: s.nearAt ?? [92 + s.near[0] + s.lean * 0.3, 108 - s.near[1]],
    farHand: s.farAt ?? [106 + s.far[0] + s.lean * 0.3, 107 - s.far[1]],
    nearBend: s.nearBend,
    farBend: s.farBend,
    nearFoot: [24 + s.nearFoot[0] + s.lean * 0.3, 117 - s.nearFoot[1]],
    farFoot: [40 + s.farFoot[0] + s.lean * 0.3, 117 - s.farFoot[1]],
    legBend: s.legBend,
    eyes: s.eyes,
    mouth: s.mouth,
    jaw: s.jaw,
    cap: s.cap,
    capTilt: s.capTilt,
    capAt: s.capAt,
    fx: s.fx
  }
}

/** Slumped on his back, head to the left with the face turned up, limbs sprawled. */
function lie(
  o: {
    lift?: number
    arms?: number
    legs?: number
    eyes?: Eyes
    capAt?: Pt
    fx?: Fx
  } = {}
): ApePose {
  const lift = o.lift ?? 0
  const legs = o.legs ?? 0
  const arms = o.arms ?? 0
  return {
    S: [52, 98 - lift],
    sr: [22, 19],
    R: [78, 101 - lift],
    rr: [15, 13],
    head: [27, 97 - lift * 0.6],
    tilt: -1.45,
    nearHand: [86 + arms, 56 + arms],
    farHand: [15 - arms, 113],
    nearBend: [-0.4, -1],
    farBend: [0, -1],
    nearFoot: [98 + legs, 82 - legs * 2 - lift],
    farFoot: [110, 100 - legs],
    legBend: [0.3, -1],
    soles: true,
    lying: true,
    eyes: o.eyes ?? 'swirl',
    mouth: 'pant',
    jaw: 0.4,
    cap: [0, 0],
    capAt: o.capAt ?? [108, 116],
    capTilt: 0.5,
    fx: o.fx ?? {}
  }
}

// -------------------------------------------------------------------------------------------- clips

const TAU = Math.PI * 2

// breathing, with a knuckle tapping the ground
const idle = memo(() =>
  [0, 1, 2, 1].map((k, i) =>
    drawApe(
      knuckle({
        sr: [25 + k * 0.4, 23 + k * 0.8],
        sink: -k * 0.5,
        head: [0, -k],
        near: [0, [0, 0, 5, 0][i]],
        cap: [0, -k * 0.6],
        mouth: i === 2 ? 'grit' : 'closed'
      })
    )
  )
)

// rears up, drums the chest with alternating fists, roars
const intro = memo(() =>
  [
    knuckle({
      sink: -8,
      lean: -3,
      rump: [3, 0],
      head: [1, -3],
      tilt: -0.1,
      nearAt: [86, 90],
      farAt: [102, 92],
      sr: [24, 22],
      nearFoot: [2, 0],
      farFoot: [2, 0],
      eyes: 'stern',
      mouth: 'grit'
    }),
    {
      S: [52, 42],
      sr: [24, 22],
      R: [34, 82],
      rr: [16, 15],
      head: [76, 36],
      tilt: -0.3,
      nearHand: [72, 62],
      farHand: [92, 54],
      nearBend: [0.3, 1],
      farBend: [0.6, 0.6],
      nearFoot: [28, 117],
      farFoot: [46, 117],
      eyes: 'roar' as Eyes,
      mouth: 'roar' as Mouth,
      jaw: 0.8,
      cap: [0, 0],
      fx: { arcs: 2 }
    },
    {
      S: [52, 41],
      sr: [24, 22],
      R: [34, 82],
      rr: [16, 15],
      head: [76, 34],
      tilt: -0.4,
      nearHand: [88, 52],
      farHand: [76, 64],
      nearBend: [0.6, 0.6],
      farBend: [0.3, 1],
      nearFoot: [28, 117],
      farFoot: [46, 117],
      eyes: 'roar' as Eyes,
      mouth: 'roar' as Mouth,
      jaw: 1,
      cap: [0, -1],
      fx: { arcs: 3 }
    },
    {
      S: [52, 40],
      sr: [25, 23],
      R: [34, 82],
      rr: [16, 15],
      head: [76, 32],
      tilt: -0.55,
      nearHand: [44, 62],
      farHand: [100, 62],
      nearBend: [-0.8, 0.8],
      farBend: [0.8, 0.8],
      nearFoot: [28, 117],
      farFoot: [46, 117],
      eyes: 'roar' as Eyes,
      mouth: 'roar' as Mouth,
      jaw: 1,
      cap: [0, -2],
      fx: { arcs: 3 }
    }
  ].map((p) => drawApe(p as ApePose))
)

// knuckle-walk: arms swing forward, hind legs follow
const move = memo(() =>
  Array.from({ length: 6 }, (_, i) => {
    const t = i / 6
    const sw = Math.sin(t * TAU)
    const cw = Math.cos(t * TAU)
    const bob = ((1 + Math.cos(t * TAU * 2)) / 2) * 2
    return drawApe(
      knuckle({
        bob,
        lean: 3 + sw * 2,
        head: [1, 1 - bob * 0.3],
        near: [sw * 9, Math.max(0, cw) * 8],
        far: [-sw * 9, Math.max(0, -cw) * 8],
        nearFoot: [-sw * 7, Math.max(0, -cw) * 5],
        farFoot: [sw * 7, Math.max(0, cw) * 5],
        cap: [0, bob * 0.4],
        mouth: 'grit'
      })
    )
  })
)

// crouches low, coiled to leap
const windup = memo(() =>
  [0, 1, 2].map((i) =>
    drawApe(
      knuckle({
        sink: [6, 13, 20][i],
        lean: [-2, -5, -8][i],
        rump: [
          [0, 1],
          [3, 3],
          [6, 5]
        ][i] as Pt,
        head: [
          [0, 2],
          [-1, 4],
          [-2, 6]
        ][i] as Pt,
        tilt: [0.05, 0.1, 0.15][i],
        sr: [
          [26, 22],
          [27, 21],
          [28, 20]
        ][i] as Pt,
        rr: [
          [16, 14],
          [17, 13],
          [18, 12]
        ][i] as Pt,
        near: [
          [-4, 0],
          [-8, 0],
          [-12, 0]
        ][i] as Pt,
        far: [
          [-4, 0],
          [-8, 0],
          [-12, 0]
        ][i] as Pt,
        nearBend: [-1, -0.3],
        farBend: [-1, -0.3],
        nearFoot: [i * 2, 0],
        farFoot: [i * 2, 0],
        legBend: [1, -0.5],
        eyes: 'stern',
        mouth: 'grit',
        cap: [0, [0, 1, 2][i]]
      })
    )
  )
)

// the leap: arms bent, both fists together above and behind the head
const air = memo(() =>
  [
    {
      S: [54, 50],
      sr: [25, 22],
      R: [30, 76],
      rr: [15, 14],
      head: [80, 52],
      tilt: -0.2,
      nearHand: [66, 14],
      farHand: [80, 12],
      nearBend: [-1, 0.2],
      farBend: [0.4, -1],
      nearFoot: [30, 100],
      farFoot: [44, 96],
      legBend: [1, 0.3],
      eyes: 'roar' as Eyes,
      mouth: 'roar' as Mouth,
      jaw: 0.5,
      cap: [0, -2],
      fx: {}
    },
    {
      S: [60, 56],
      sr: [25, 23],
      R: [32, 80],
      rr: [15, 14],
      head: [88, 62],
      tilt: 0.25,
      nearHand: [90, 50],
      farHand: [104, 54],
      nearBend: [-0.6, -1],
      farBend: [0.4, -1],
      nearFoot: [32, 104],
      farFoot: [48, 100],
      legBend: [1, 0.2],
      eyes: 'stern' as Eyes,
      mouth: 'grit' as Mouth,
      jaw: 0,
      cap: [0, -3],
      fx: {}
    }
  ].map((p) => drawApe(p as ApePose))
)

// the fists slam the ground: dust, recoil
const land = memo(() =>
  [
    knuckle({
      sink: 12,
      lean: 5,
      rump: [0, 2],
      head: [2, 6],
      tilt: 0.15,
      sr: [27, 21],
      rr: [17, 13],
      nearAt: [97, 108],
      farAt: [111, 107],
      nearBend: [-0.3, 1],
      farBend: [-0.3, 1],
      nearFoot: [0, 0],
      farFoot: [0, 0],
      legBend: [1, -0.5],
      eyes: 'roar',
      mouth: 'gasp',
      jaw: 0.4,
      cap: [0, -5],
      fx: {
        dust: [
          [18, 115, 8],
          [112, 116, 7]
        ],
        lines: [
          [116, 98, 6, -6],
          [118, 104, 6, -1],
          [10, 104, -6, -5]
        ],
        tufts: [[22, 92, -9, -3]]
      }
    }),
    knuckle({
      sink: 8,
      lean: 3,
      head: [1, 4],
      sr: [26, 22],
      rr: [16, 14],
      nearAt: [95, 108],
      farAt: [109, 107],
      nearBend: [-0.3, 1],
      farBend: [-0.3, 1],
      legBend: [1, -0.4],
      eyes: 'stern',
      mouth: 'grit',
      cap: [0, -1],
      fx: {
        dust: [
          [16, 114, 8],
          [112, 115, 8]
        ]
      }
    }),
    knuckle({
      sink: 2,
      lean: 1,
      head: [1, 0],
      nearAt: [93, 108],
      farAt: [107, 107],
      nearBend: [-0.3, 1],
      farBend: [-0.3, 1],
      eyes: 'stern',
      mouth: 'closed',
      cap: [0, 1],
      fx: {
        dust: [
          [18, 118, 5],
          [110, 118, 5]
        ]
      }
    })
  ].map(drawApe)
)

// sits panting, cap askew, sweat
const recover = memo(() =>
  [0, 1].map((i) =>
    drawApe({
      S: [50, 66 + i],
      sr: [25, 22],
      R: [34, 98],
      rr: [17, 14],
      head: [74, 76 + i * 2],
      tilt: 0.2,
      nearHand: [76, 108],
      farHand: [92, 108],
      nearBend: [-0.8, 0.6],
      farBend: [-0.8, 0.6],
      nearFoot: [54, 117],
      farFoot: [68, 117],
      legBend: [0.5, -1],
      eyes: 'tired',
      mouth: 'pant',
      jaw: 0.4 + i * 0.3,
      cap: [-5, 3 + i],
      capTilt: 0.45,
      fx: {
        sweat: [
          [
            [92, 54],
            [104, 64]
          ],
          [
            [94, 60],
            [106, 68]
          ]
        ][i] as Pt[]
      }
    } as ApePose)
  )
)

const hurt = memo(() =>
  [
    knuckle({
      lean: -9,
      bob: 6,
      head: [-3, -2],
      tilt: -0.4,
      nearAt: [78, 84],
      farAt: [100, 80],
      nearBend: [-0.4, 1],
      farBend: [0.4, 1],
      nearFoot: [-2, 0],
      farFoot: [0, 3],
      eyes: 'hurt',
      mouth: 'gasp',
      jaw: 0.7,
      cap: [-6, -10],
      capTilt: -0.5
    }),
    knuckle({
      lean: -5,
      bob: 2,
      head: [-1, 1],
      tilt: -0.15,
      near: [-3, 3],
      far: [-3, 3],
      eyes: 'tired',
      mouth: 'grit',
      cap: [-3, -3],
      capTilt: -0.2
    })
  ].map(drawApe)
)

// the cap flies off, he topples onto his back, the cap lands beside him
const defeat = memo(() =>
  [
    knuckle({
      lean: -10,
      bob: 8,
      head: [-3, -3],
      tilt: -0.55,
      nearAt: [74, 70],
      farAt: [96, 62],
      nearBend: [-0.3, 1],
      farBend: [0.5, 0.8],
      nearFoot: [-2, 0],
      farFoot: [0, 0],
      eyes: 'hurt',
      mouth: 'gasp',
      jaw: 0.8,
      capAt: [36, 22],
      capTilt: -0.9,
      fx: { lines: [[40, 16, -6, -4]] }
    }),
    {
      S: [46, 64],
      sr: [25, 22],
      R: [28, 92],
      rr: [15, 14],
      head: [58, 50],
      tilt: -0.95,
      nearHand: [76, 44],
      farHand: [92, 66],
      nearBend: [0.2, -1],
      farBend: [0.4, 1],
      nearFoot: [26, 117],
      farFoot: [40, 108],
      legBend: [1, -0.3],
      eyes: 'swirl' as Eyes,
      mouth: 'gasp' as Mouth,
      jaw: 0.6,
      cap: [0, 0],
      capAt: [24, 30],
      capTilt: -0.4,
      fx: {
        stars: [
          [44, 22],
          [76, 20]
        ]
      }
    },
    {
      S: [46, 82],
      sr: [24, 21],
      R: [62, 99],
      rr: [15, 13],
      head: [24, 70],
      tilt: -1.1,
      nearHand: [74, 54],
      farHand: [14, 104],
      nearBend: [-1, 0.3],
      farBend: [0.3, -1],
      nearFoot: [84, 100],
      farFoot: [96, 108],
      legBend: [0.4, -1],
      soles: true,
      lying: true,
      eyes: 'swirl' as Eyes,
      mouth: 'pant' as Mouth,
      jaw: 0.5,
      cap: [0, 0],
      capAt: [100, 110],
      capTilt: 0.3,
      fx: {
        stars: [
          [44, 36],
          [86, 46]
        ]
      }
    },
    lie({
      lift: 4,
      arms: 2,
      legs: 3,
      capAt: [100, 110],
      fx: {
        dust: [
          [20, 118, 6],
          [116, 118, 3]
        ]
      }
    }),
    lie({
      lift: 1,
      arms: 1,
      legs: 1,
      capAt: [108, 111],
      fx: {
        stars: [
          [20, 66],
          [48, 58]
        ]
      }
    }),
    lie({
      capAt: [108, 111],
      fx: {
        stars: [
          [18, 62],
          [44, 56],
          [64, 66]
        ]
      }
    })
  ].map((p) => drawApe(p as ApePose))
)

const spec = bossSpec('apeBoss')
const clip = (name: keyof typeof spec, frames: () => Raster[]) => lazyAnim(frames, spec[name].fps, spec[name].loop)

export const sheets: SheetModule = {
  apeBoss: () => ({
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
