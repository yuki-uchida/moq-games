/**
 * ミルダの大猫 (boss:cat): a huge chubby grey tabby with a bell collar and a smug face, drawn natively at 128×128.
 * Poses are parameters (crouch, butt wiggle, tail lash, stretch, paw swipe, eyes) rendered per view.
 */
import { BOSS_EXTRA_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, ball, despeckle, shadeEdges, type Ramp } from '../raster'
import { anim, type Anim, type Sheet } from '../sheet'
import { Painter, bar, type View } from './rig'

const FUR = R.wolfFur
const CREAM = R.wolfCream
const PINK = R.ratPink

type Eyes = 'smug' | 'wide' | 'swirl' | 'closed' | 'hurt' | 'glare'

interface CP {
  /** Body sinks (0..1). */
  crouch: number
  /** Hindquarters raised and wiggling (px). */
  butt: number
  wiggle: number
  tail: number
  /** Tail raised high (0..1). */
  tailUp: number
  bob: number
  /** Body stretch (pounce). */
  stretch: number
  /** Paw reach 0..1 for the near front paw, and the smear. */
  paw: number
  smear: boolean
  /** Rear up on hind legs (swipe). */
  rise: number
  eyes: Eyes
  mouth: number
  headTilt: number
  /** Gallop / walk phase 0..1 (or -1 for standing). */
  gait: number
  dust: boolean
  sweat: boolean
  tongue: boolean
  air: boolean
}

const cp = (p: Partial<CP> = {}): CP => ({
  crouch: 0,
  butt: 0,
  wiggle: 0,
  tail: 0,
  tailUp: 0.3,
  bob: 0,
  stretch: 0,
  paw: 0,
  smear: false,
  rise: 0,
  eyes: 'smug',
  mouth: 0,
  headTilt: 0,
  gait: -1,
  dust: false,
  sweat: false,
  tongue: false,
  air: false,
  ...p
})

/** Tabby stripes drawn only on already-painted fur pixels of `ramp`. */
function stripes(l: Raster, ramp: Ramp, x0: number, x1: number, y0: number, y1: number, slant = 0.9, period = 10) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (l.get(x, y) !== ramp[1] && l.get(x, y) !== ramp[2]) continue
      const v = (((x * 0.7 + y * slant) % period) + period) % period
      if (v < 2.2) l.set(x, y, ramp[3])
    }
}

function eyesSide(l: Raster, x: number, y: number, e: Eyes) {
  if (e === 'closed' || e === 'hurt') {
    l.rect(x - 3, y + 1, 7, 2, R.clothBlack[1])
    if (e === 'hurt') {
      l.line(x - 3, y - 2, x + 3, y + 1, C.black)
      l.line(x - 3, y + 4, x + 3, y + 1, C.black)
    }
    return
  }
  if (e === 'swirl') {
    l.ring(x, y + 1, 1, 4.6, R.beak[0])
    l.ring(x, y + 1, 2.2, 3, C.black)
    l.set(x, y + 1, C.black)
    return
  }
  l.ellipse(x, y + 1, 4.6, e === 'wide' ? 5 : 4.2, R.paper[1])
  l.ellipse(x + 0.5, y + 1, 3.6, e === 'wide' ? 4.4 : 3.6, R.poison[1])
  l.rect(x + 1, y - 2, 2, e === 'wide' ? 7 : 6, C.black)
  l.set(x - 1, y - 1, R.poison[0])
  if (e === 'smug' || e === 'glare') {
    // heavy half-closed lid for the smug look
    l.rect(x - 5, y - 4, 11, 4, FUR[2])
    l.rect(x - 5, y - 1, 11, 1, C.black)
  }
}

function drawSide(p: CP): Raster {
  const g = new Painter(128, 128)
  const ox = -6 + p.stretch * 6
  const sink = p.crouch * 10
  const bodyY = 88 + sink - p.rise * 2 - p.bob
  const body = { x: 56 + ox - p.stretch * 6, y: bodyY, rx: 32 + p.stretch * 4, ry: 22 - p.crouch * 4 - p.stretch * 3 }
  const gait = p.gait
  const sw = (ph: number) => (gait < 0 ? 0 : Math.sin((gait + ph) * Math.PI * 2))
  const lf = (ph: number) => (gait < 0 ? 0 : Math.max(0, Math.cos((gait + ph) * Math.PI * 2)) * 8)
  const raiseButt = p.butt

  // tail
  g.add(-4, (l) => {
    const sway = p.tail
    const up = p.tailUp
    const pts: [number, number][] = [
      [body.x - body.rx + 6, bodyY - 2 - raiseButt],
      [body.x - body.rx - 8, bodyY - 8 - up * 18 - raiseButt],
      [body.x - body.rx - 12 + sway * 2, bodyY - 26 - up * 34],
      [body.x - body.rx - 3 + sway * 6, bodyY - 42 - up * 36]
    ]
    for (let i = 1; i < pts.length; i++) bar(l, pts[i - 1], pts[i], i === pts.length - 1 ? 7 : 9, FUR[1])
    shadeEdges(l, FUR, 1, true)
    const end = pts[pts.length - 1]
    l.ellipse(end[0], end[1], 4, 4, FUR[3])
  })
  // far legs
  for (const ph of [0.5, 0.25]) {
    g.add(-2, (l) => {
      const front = ph === 0.25
      const x = (front ? body.x + 28 : body.x - 18) + sw(ph) * 9
      const lift = p.air ? 0 : lf(ph)
      const top = bodyY + 8
      l.rect(x - 6, top, 12, 116 - top - lift, FUR[2])
      l.ellipse(x + 1, 114 - lift, 8, 4, CREAM[2])
      shadeEdges(l, FUR, 1, false)
    })
  }
  // body and haunch
  g.add(0, (l) => {
    ball(l, body.x, body.y - raiseButt * 0.6, body.rx, body.ry, FUR, false)
    // belly
    for (let y = Math.round(body.y + body.ry * 0.35); y < body.y + body.ry; y++)
      for (let x = body.x - body.rx; x < body.x + body.rx; x++) {
        const dx = (x + 0.5 - body.x) / body.rx
        if (l.get(x, y) && dx * dx * 0.7 + ((y - body.y) / body.ry) ** 2 > 0.6 && y > body.y + body.ry * 0.5)
          l.set(x, y, CREAM[1])
      }
    stripes(l, FUR, body.x - body.rx, body.x + body.rx, body.y - body.ry, body.y + body.ry * 0.55)
    // belly shade
    l.rect(body.x - 8, Math.round(body.y + body.ry) - 1, 20, 1, CREAM[2])
  })
  g.add(0.1, (l) => {
    // near hind leg: a big haunch and a cream paw
    const hx = body.x - 16 + sw(0) * 9 - p.stretch * 14
    const lift = p.air ? 4 : lf(0)
    ball(l, hx, bodyY + 8 - raiseButt * 0.8, 15, 14 - p.crouch * 2, FUR, false)
    stripes(l, FUR, hx - 14, hx + 14, bodyY - 8, bodyY + 20, -0.8, 8)
    const px = hx + 2 + p.stretch * 4
    l.ellipse(px + 3, 113 - lift, 10, 4.5, CREAM[1])
    l.rect(px - 7, bodyY + 18 - raiseButt * 0.5, 14, Math.max(0, 108 - lift - (bodyY + 18 - raiseButt * 0.5)), FUR[1])
    shadeEdges(l, FUR, 1, false)
  })
  g.add(0.12, (l) => {
    // near front leg (and the swiping paw)
    const fx = body.x + 26 + sw(0.25) * 9 + p.stretch * 8
    const lift = p.air ? 2 : lf(0.25)
    const reach = p.paw
    if (reach > 0) {
      const sx = body.x + 28
      const sy = bodyY + 2
      const ex = sx + 12 + reach * 12
      const ey = sy - 6 - reach * 6 + (p.smear ? 10 : 0)
      bar(l, [sx, sy], [ex, ey], 13, FUR[1])
      ball(l, ex + 4, ey, 9, 8, CREAM, false)
      for (let k = -1; k <= 1; k++) l.rect(ex + 11, ey + k * 4 - 1, 5, 2, C.white)
      if (p.smear) {
        for (let a = -0.9; a <= 0.9; a += 0.15) {
          l.set(ex + 16 + Math.cos(a) * 12, ey + Math.sin(a) * 20, C.white)
          l.set(ex + 17 + Math.cos(a) * 13, ey + Math.sin(a) * 20, R.steel[0])
        }
      }
      shadeEdges(l, FUR, 1, false)
    } else {
      l.rect(fx - 6, bodyY + 4, 13, Math.max(2, 110 - lift - bodyY - 4), FUR[1])
      l.ellipse(fx + 2, 113 - lift, 9, 4.5, CREAM[1])
      stripes(l, FUR, fx - 7, fx + 7, bodyY + 4, 100, 0.2, 8)
      shadeEdges(l, FUR, 1, false)
    }
  })
  // head
  const hx = body.x + body.rx + 8 - p.crouch * 3 + p.stretch * 5 + p.rise * 4
  const hy = bodyY - 18 + p.crouch * 5 + p.headTilt - p.rise * 4
  g.add(0.5, (l) => {
    // ears
    l.poly([hx - 14, hy - 12, hx - 12, hy - 30, hx - 1, hy - 17], FUR[1])
    l.poly([hx + 5, hy - 17, hx + 15, hy - 29, hx + 18, hy - 11], FUR[1])
    l.poly([hx - 11, hy - 15, hx - 11, hy - 25, hx - 4, hy - 17], PINK[1])
    l.poly([hx + 7, hy - 17, hx + 13, hy - 24, hx + 14, hy - 14], PINK[1])
    ball(l, hx, hy, 24, 19, FUR, false)
    // cheek fluff
    l.poly([hx - 8, hy + 12, hx + 6, hy + 19, hx + 12, hy + 14, hx + 2, hy + 8], FUR[1])
    // muzzle
    ball(l, hx + 14, hy + 7, 11, 8, CREAM, false)
    // forehead stripes
    for (const k of [-5, 0, 5]) l.rect(hx - 2 + k, hy - 18, 2, 7 - Math.abs(k) * 0.4, FUR[3])
    stripes(l, FUR, hx - 24, hx + 2, hy - 8, hy + 18, 0.4, 7)
    shadeEdges(l, FUR, 1, true)
  })
  g.add(
    0.55,
    (l) => {
      eyesSide(l, hx + 8, hy - 4, p.eyes)
      // nose, mouth, whiskers
      l.poly([hx + 22, hy + 3, hx + 27, hy + 3, hx + 24, hy + 7], PINK[2])
      l.set(hx + 23, hy + 3, PINK[0])
      const m = p.mouth
      l.line(hx + 24, hy + 7, hx + 24, hy + 9 + m, FUR[3])
      if (m) l.rect(hx + 15, hy + 10, 9, m + 1, C.black)
      l.line(hx + 24, hy + 9 + m, hx + 17, hy + 11 + m, FUR[3])
      if (p.tongue) l.rect(hx + 17, hy + 11, 5, 4, PINK[1])
      for (const k of [-1, 0, 1]) {
        l.line(hx + 22, hy + 6 + k * 2, hx + 34, hy + 3 + k * 4, CREAM[0])
      }
    },
    false
  )
  // bell collar
  g.add(0.6, (l) => {
    const cx = hx - 6
    const cy = hy + 14
    l.poly([cx - 12, cy - 6, cx - 4, cy - 10, cx + 8, cy + 8, cx - 4, cy + 10], R.jobRed[1])
    l.poly([cx - 12, cy - 6, cx - 4, cy - 10, cx - 2, cy - 7, cx - 11, cy - 3], R.jobRed[0])
    shadeEdges(l, R.jobRed, 1, false)
    l.ellipse(cx + 3, cy + 11, 5, 5, R.gold[1])
    l.set(cx + 1, cy + 9, R.gold[0])
    l.rect(cx, cy + 12, 6, 1, R.gold[3])
    l.rect(cx + 3, cy + 13, 1, 2, C.black)
  })
  if (p.dust) {
    g.add(
      -5,
      (l) => {
        for (const [x, y, r] of [
          [8, 112, 4],
          [20, 108, 3],
          [2, 104, 2]
        ])
          l.ellipse(x, y, r, r * 0.8, R.dirt[1])
      },
      false
    )
  }
  if (p.sweat)
    g.add(
      1,
      (l) => {
        l.rect(hx - 20, hy - 22, 2, 3, R.water[1])
        l.set(hx - 20, hy - 22, R.water[0])
      },
      false
    )
  return g.render()
}

function drawFront(p: CP, back: boolean): Raster {
  const g = new Painter(128, 128)
  const sink = p.crouch * 8
  const by = 94 + sink - p.bob
  const wig = p.wiggle
  // tail
  g.add(back ? 0.7 : -4, (l) => {
    const sway = p.tail * 5
    if (back) {
      const pts: [number, number][] = [
        [64 + wig, by + 6 - p.butt],
        [72 + wig + sway, by - 8 - p.butt],
        [86 + sway * 1.4, by - 18 - p.tailUp * 4]
      ]
      for (let i = 1; i < pts.length; i++) bar(l, pts[i - 1], pts[i], 11 - i * 2, FUR[1])
      for (const [x, y] of pts.slice(0, 2)) l.rect(x - 5, y, 11, 2, FUR[3])
      l.ellipse(pts[2][0], pts[2][1], 5, 5, FUR[3])
      shadeEdges(l, FUR, 1, true)
    } else {
      const pts: [number, number][] = [
        [88, by + 10],
        [102 + sway, by + 6],
        [108 + sway, by - 12 - p.tailUp * 14],
        [100 + sway * 1.5, by - 30 - p.tailUp * 14]
      ]
      for (let i = 1; i < pts.length; i++) bar(l, pts[i - 1], pts[i], 8, FUR[1])
      l.ellipse(pts[3][0], pts[3][1], 4.5, 4.5, FUR[3])
      shadeEdges(l, FUR, 1, true)
    }
  })
  // body
  g.add(back ? 0.1 : 0, (l) => {
    const wx = back ? wig : 0
    ball(l, 64 + wx, by - (back ? p.butt : 0), 31 + p.stretch * 3, 23 - p.crouch * 3, FUR, false)
    if (!back) ball(l, 64, by + 4, 17, 15, CREAM, false)
    stripes(l, FUR, 30, 98, by - 24, by + 8, 0.2, 9)
    shadeEdges(l, FUR, 1, true)
  })
  // legs / feet
  g.add(0.2, (l) => {
    if (back) {
      for (const s of [-1, 1]) {
        const x = 64 + s * 24 + (s * wig) / 2
        ball(l, x, 102 - p.butt * 0.6, 13, 14, FUR, false)
        l.ellipse(x + s * 2, 113, 10, 4.5, CREAM[1])
      }
    } else {
      for (const s of [-1, 1]) {
        const lift = p.air ? 3 : p.gait < 0 ? 0 : Math.max(0, Math.sin((p.gait + (s > 0 ? 0 : 0.5)) * 6.283)) * 6
        const x = 64 + s * 17
        l.rect(x - 8, by + 6, 16, 116 - by - 6 - 6 - lift, FUR[1])
        l.ellipse(x, 113 - lift, 11, 5, CREAM[1])
        l.rect(x - 4, 110 - lift, 1, 3, FUR[2])
        l.rect(x + 3, 110 - lift, 1, 3, FUR[2])
      }
    }
    shadeEdges(l, FUR, 1, true)
  })
  // head
  const hy = back ? 62 + p.crouch * 6 : 64 + p.crouch * 6 + p.headTilt - p.bob
  const hxx = 64 + p.headTilt * 0.6
  g.add(0.5, (l) => {
    l.poly([hxx - 28, hy - 12, hxx - 24, hy - 34, hxx - 7, hy - 20], FUR[1])
    l.poly([hxx + 28, hy - 12, hxx + 24, hy - 34, hxx + 7, hy - 20], FUR[1])
    if (!back) {
      l.poly([hxx - 24, hy - 17, hxx - 22, hy - 28, hxx - 12, hy - 20], PINK[1])
      l.poly([hxx + 24, hy - 17, hxx + 22, hy - 28, hxx + 12, hy - 20], PINK[1])
    }
    ball(l, hxx, hy, 29, 22, FUR, false)
    for (const k of [-6, 0, 6]) l.rect(hxx - 1 + k, hy - 22, 2, 8 - Math.abs(k) * 0.3, FUR[3])
    stripes(l, FUR, hxx - 29, hxx + 29, hy - 8, hy + 22, 0.1, 8)
    shadeEdges(l, FUR, 1, true)
    if (back) for (let y = hy - 12; y < hy + 6; y += 4) l.rect(hxx - 3, y, 6, 2, FUR[3])
  })
  if (!back) {
    g.add(
      0.55,
      (l) => {
        // cheek fluff and muzzle
        ball(l, hxx, hy + 10, 12, 8, CREAM, false)
        for (const s of [-1, 1]) {
          const ex = hxx + s * 13
          if (p.eyes === 'closed' || p.eyes === 'hurt') {
            l.rect(ex - 5, hy - 1, 10, 2, R.clothBlack[1])
            if (p.eyes === 'hurt') {
              l.line(ex - 5, hy - 4, ex + 5, hy, C.black)
              l.line(ex - 5, hy + 4, ex + 5, hy, C.black)
            }
          } else if (p.eyes === 'swirl') {
            l.ring(ex, hy, 1, 6.5, R.beak[0])
            l.ring(ex, hy, 3, 4, C.black)
            l.set(ex, hy, C.black)
          } else {
            l.ellipse(ex, hy, 6.4, p.eyes === 'wide' ? 7 : 6, R.paper[1])
            l.ellipse(ex, hy, 5.4, p.eyes === 'wide' ? 6 : 5, R.poison[1])
            l.rect(ex - 1, hy - 5, 3, 10, C.black)
            l.set(ex - 3, hy - 3, R.poison[0])
            l.set(ex - 2, hy - 3, C.white)
            if (p.eyes === 'smug' || p.eyes === 'glare') {
              l.rect(ex - 7, hy - 7, 14, 6, FUR[2])
              l.rect(ex - 7, hy - 2, 14, 1, C.black)
              l.set(ex + s * 7, hy - 7, FUR[2])
            }
          }
        }
        l.poly([hxx - 3, hy + 6, hxx + 3, hy + 6, hxx, hy + 10], PINK[2])
        l.set(hxx - 1, hy + 6, PINK[0])
        const m = p.mouth
        l.line(hxx, hy + 10, hxx, hy + 12, FUR[3])
        l.line(hxx, hy + 12, hxx - 5, hy + 14 + m, FUR[3])
        l.line(hxx, hy + 12, hxx + 5, hy + 14 + m, FUR[3])
        if (m) l.rect(hxx - 4, hy + 13, 9, m + 1, C.black)
        if (p.tongue) l.rect(hxx - 2, hy + 14, 5, 5, PINK[1])
        for (const s of [-1, 1])
          for (const k of [-1, 0, 1]) l.line(hxx + s * 9, hy + 10 + k * 2, hxx + s * 24, hy + 8 + k * 5, CREAM[0])
      },
      false
    )
  }
  // bell collar (a red band with a golden bell)
  g.add(0.6, (l) => {
    const cy = hy + 21
    l.rect(hxx - 20, cy, 40, 4, R.jobRed[1])
    l.rect(hxx - 20, cy, 40, 1, R.jobRed[0])
    l.rect(hxx - 20, cy + 3, 40, 1, R.jobRed[2])
    if (!back) {
      l.ellipse(hxx, cy + 8, 5.5, 5.5, R.gold[1])
      l.set(hxx - 2, cy + 6, R.gold[0])
      l.rect(hxx - 1, cy + 10, 3, 1, R.gold[3])
      l.rect(hxx, cy + 11, 1, 2, C.black)
    }
  })
  return g.render()
}

const render = (view: View, p: CP) => despeckle(view === 'side' ? drawSide(p) : drawFront(p, view === 'up'))

type Maker = (i: number) => CP
const MOVES: Record<string, Maker> = {
  idle: (i) =>
    cp({
      bob: [0, 1, 1.5, 0.5][i],
      tail: [0, 1, 0, -1][i],
      eyes: i === 3 ? 'closed' : 'smug',
      headTilt: [0, 0, 1, 0][i]
    }),
  walk: (i) =>
    cp({
      gait: i / 6,
      bob: Math.abs(Math.sin((i / 6) * Math.PI * 2)) * 1.5,
      tail: Math.sin((i / 6) * 6.283),
      headTilt: [0, 1, 0, 0, 1, 0][i]
    }),
  crouch: (i) =>
    cp({
      crouch: 1,
      butt: 5,
      wiggle: i ? 3 : -3,
      tail: i ? 1 : -1,
      tailUp: 0.9,
      eyes: 'wide',
      mouth: 0,
      headTilt: 3,
      bob: -1
    }),
  pounce: (i) =>
    [
      cp({ crouch: 1, butt: 6, tailUp: 0.7, eyes: 'wide', headTilt: 3 }),
      cp({ stretch: 1, air: true, eyes: 'glare', mouth: 3, tailUp: 0.2, tail: 1, headTilt: -2, paw: 0 }),
      cp({ stretch: 1, air: true, eyes: 'glare', mouth: 4, tailUp: 0.4, paw: 0.9, headTilt: -3 }),
      cp({ crouch: 0.8, eyes: 'wide', mouth: 1, tailUp: 0.5, bob: -2 })
    ][i],
  swipe: (i) =>
    [
      cp({ rise: 0.4, paw: 0.2, eyes: 'wide', tailUp: 0.5 }),
      cp({ rise: 0.8, paw: 1, smear: true, eyes: 'glare', mouth: 3, tailUp: 0.7, tail: 1 }),
      cp({ rise: 0.7, paw: 0.7, eyes: 'glare', mouth: 2, tail: -1 }),
      cp({ rise: 0.2, paw: 0.1, eyes: 'smug' })
    ][i],
  stunned: (i) =>
    cp({
      crouch: 0.6,
      eyes: 'swirl',
      headTilt: [-3, 0, 3, 0][i],
      mouth: 1,
      tongue: true,
      tailUp: 0.1,
      tail: [-1, 0, 1, 0][i],
      wiggle: [-2, 0, 2, 0][i]
    }),
  hurt: (i) => cp({ crouch: 0.4 + i * 0.2, eyes: 'hurt', mouth: 2, headTilt: 2, tailUp: 0.9, bob: -1 }),
  flee: (i) =>
    cp({
      gait: i / 4,
      eyes: 'wide',
      sweat: true,
      dust: true,
      tailUp: 1,
      tail: [1, 0, -1, 0][i],
      stretch: 0.5,
      bob: [0, 2, 0, 2][i],
      mouth: 2
    })
}

const LIFT: Record<string, number[]> = { pounce: [0, 18, 26, 6] }

export function buildCatSheet(): Sheet {
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(BOSS_EXTRA_SPEC.cat)) {
    const [base, dir] = name.split('_') as [string, View | undefined]
    const view: View = dir ?? (base === 'flee' ? 'side' : 'down')
    const make = MOVES[base]
    const frames = Array.from({ length: want.frames }, (_, i) => render(view, make(i)))
    const a: Anim = anim(frames, want.fps, want.loop)
    if (want.lift) a.lift = LIFT[base]
    sheet[name] = a
  }
  return sheet
}

export type { Raster }
