import { R, color, ramp } from '../../palette'
import { Raster, ball, noiseAt, rng } from '../../raster'
import type { Backdrop, BackdropLayer } from '../types'
import {
  W,
  fadeBottom,
  flameAt,
  glow,
  gradient,
  grownMask,
  lancet,
  layerImage,
  lightOn,
  pillar,
  shafts,
  skyImage,
  stampShaded,
  tiled,
  tintMap,
  type Tones
} from './kit'

/**
 * Backdrop of the `castle` world (stage 9): the dark castle of the hamster king. Ominous but elegant.
 * far  = striped wall hangings and tall pointed windows onto a violet night with a moon,
 * mid  = fluted columns with pointed arches, crimson banners with a gold star, wall candelabra,
 * near = dark pillars and tied-back drapery, front = dark curtain swags along the top edge.
 */

const wallFar = ramp('#54497c', '#4a4070', '#403762', '#352d52', '#262040')
const wallMid = ramp('#43396a', '#393060', '#302854', '#282146', '#1c1732')
const wallNear = ramp('#2a2348', '#231d3d', '#1d1832', '#171329', '#100d1e')
const stone = ramp('#7a6ea8', '#6a5f98', '#5a5084', '#483f6c', '#352e52')
const night = [color('#2a2060'), color('#362a78'), color('#46388e')]
const starDim = color('#8a7cc8')
const starBright = color('#e6dcff')
const moon = ramp('#fff6dc', '#ecdfbc', '#cdbfa0', '#a49682', '#7a6e66')
const moonSea = color('#d6c8a8')
const banner = ramp('#c05a66', '#a24454', '#843644', '#622834', '#44192a')
const gold = ramp('#e8cc80', '#cca85a', '#a8843f', '#7e602f', '#563f22')
const drape = ramp('#3a2a58', '#2e2248', '#251b3a', '#1c142c', '#130e20')
const swagTones: Tones = {
  hi: color('#2a1f42'),
  base: color('#221936'),
  shade: color('#1a122c'),
  deep: color('#120c20')
}
const flame = R.fire

const tFar: Tones = { hi: wallFar[0], base: wallFar[1], shade: wallFar[2], deep: wallFar[3] }
const tMid: Tones = { hi: wallMid[0], base: wallMid[1], shade: wallMid[2], deep: wallMid[3] }
const tNear: Tones = { hi: wallNear[0], base: wallNear[1], shade: wallNear[2], deep: wallNear[3] }
const tStone: Tones = { hi: stone[0], base: stone[1], shade: stone[2], deep: stone[3] }
const tDrape: Tones = { hi: drape[0], base: drape[1], shade: drape[2], deep: drape[3] }

function sky() {
  const r = skyImage()
  gradient(r, [
    { at: 0, c: R.castleWall[3] },
    { at: 130, c: wallFar[3] },
    { at: 260, c: wallFar[2] },
    { at: 340, c: wallFar[1] }
  ])
  return r
}

const rectMask = (w: number, h: number) => new Raster(w, h).rect(0, 0, w, h, 1)

/** A tall pointed window onto the night, with a stone surround, a mullion and a rose at the top. */
function gothicWindow(r: Raster, cx: number, top: number, w: number, h: number, withMoon: boolean) {
  const half = w / 2
  const spring = top + 46
  const inside = (x: number, y: number) => y < top + h && Math.abs(x + 0.5 - cx) <= lancet(y + 0.5, top, spring, half)
  const g = grownMask(inside, cx - half - 1, top - 1, cx + half + 1, top + h, 4)
  stampShaded(r, g.mask, g.ox, g.oy, tStone, { shade: [2, 2], hi: [1, 1] })
  stampShaded(r, rectMask(w + 14, 5), cx - half - 7, top + h, tStone, { shade: [0, 2], hi: [0, 1], deep: [0, 1] })
  // the night, dithered from deep violet at the top to lighter below
  for (let y = top; y < top + h; y++)
    for (let x = Math.floor(cx - half) - 1; x <= Math.ceil(cx + half) + 1; x++) {
      if (!inside(x, y)) continue
      const t = ((y - top) / h) * 2
      const i = Math.min(1, Math.floor(t))
      const f = t - i
      const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16
      r.set(x, y, night[m < f ? i + 1 : i])
    }
  // stars
  const rnd = rng(Math.round(cx))
  for (let i = 0; i < 9; i++) {
    const sx = Math.round(cx - half + 4 + rnd() * (w - 8))
    const sy = Math.round(top + 8 + rnd() * (h - 22))
    if (inside(sx, sy) && (!withMoon || Math.hypot(sx - cx, sy - (top + 54)) > 16))
      r.set(sx, sy, rnd() < 0.5 ? starDim : starBright)
  }
  if (withMoon) {
    glow(r, cx + 2, top + 54, 17, [night[2], color('#56489c'), color('#6a5cae')], 1.2)
    ball(r, cx + 2, top + 54, 9, 9, moon)
    r.ellipse(cx - 1, top + 51, 3, 2, moonSea)
    r.ellipse(cx + 5, top + 58, 2, 2, moonSea)
  }
  // mullion, a small rose circle and a cross bar
  tiled((dx) => {
    for (let y = top + 8; y < top + h; y++)
      if (inside(cx, y) && !(withMoon && y > top + 40 && y < top + 68)) r.rect(cx - 1 + dx, y, 2, 1, stone[2])
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++)
      for (const by of [top + 62, top + 92]) if (inside(x, by)) r.rect(x + dx, by, 1, 2, stone[2])
  })
  r.ring(cx, top + 30, 3, 5, stone[2])
}

function farWall(): BackdropLayer {
  const r = layerImage(0)
  // wall hangings: soft vertical stripes
  for (let s = 0; s < 40; s++) {
    const light = s % 2 === 0
    r.rect(s * 16, 0, 16, r.h, light ? tFar.base : tFar.shade)
    r.rect(s * 16, 0, 1, r.h, light ? tFar.hi : tFar.base)
  }
  // a frieze of diamonds just above the floor, and a plain stone band under it
  const fy = 196
  r.rect(0, fy, W, 2, tFar.deep)
  for (let x = 0; x < W; x += 16) {
    r.poly([x + 8, fy + 3, x + 14, fy + 9, x + 8, fy + 15, x + 2, fy + 9], tFar.deep)
    r.poly([x + 8, fy + 6, x + 11, fy + 9, x + 8, fy + 12, x + 5, fy + 9], wallFar[4])
  }
  r.rect(0, fy + 17, W, 2, tFar.deep)
  r.rect(0, fy + 19, W, r.h - fy - 19, tFar.shade)
  const xs = [120, 280, 440, 600]
  xs.forEach((cx, i) => gothicWindow(r, cx, 66, 40, 120, i === 1))
  // a little moonlight spilling down the wall under the window with the moon
  shafts(r, [{ x: 290, w: 40, strength: 0.4 }], { slope: 0.4, y0: 194, y1: 330 })
  fadeBottom(r, 40, tFar.shade)
  return { image: r, parallax: 0.07, y: 0 }
}

/** Five-point star of radius `rad`, painted flat in one colour. */
function starAt(r: Raster, x: number, y: number, rad: number, c: number) {
  const pts: number[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const d = i % 2 ? rad * 0.45 : rad
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d)
  }
  tiled((dx) =>
    r.poly(
      pts.map((v, i) => (i % 2 ? v : v + dx)),
      c
    )
  )
}

function banner2(r: Raster, cx: number, y: number, w: number, h: number) {
  const m = new Raster(w, h)
  m.rect(0, 0, w, h - 8, 1)
  m.poly([0, h - 9, w / 2, h, w, h - 9], 1)
  m.poly([w / 2 - 3, h, w / 2, h - 7, w / 2 + 3, h], 0)
  stampShaded(
    r,
    m,
    cx - w / 2,
    y,
    { hi: banner[0], base: banner[1], shade: banner[2], deep: banner[3] },
    { shade: [3, 2], hi: [1, 1], deep: [1, 0] }
  )
  tiled((dx) => {
    r.rect(cx - w / 2 - 2 + dx, y - 3, w + 4, 3, gold[2])
    r.rect(cx - w / 2 - 3 + dx, y - 4, 2, 5, gold[1])
    r.rect(cx + w / 2 + 1 + dx, y - 4, 2, 5, gold[1])
  })
  starAt(r, cx, y + 20, 7, gold[1])
  starAt(r, cx + 1, y + 21, 4, gold[2])
}

const warmLift = tintMap([wallMid[0], wallMid[1], wallMid[2]], [color('#76608e'), color('#5e4c82'), color('#4a3e72')])

function candelabra(r: Raster, x: number, y: number) {
  glow(r, x, y - 6, 22, [color('#4a3e72'), color('#5e4c82'), color('#76608e'), color('#92728f')], 1.1)
  tiled((dx) => {
    r.rect(x - 1 + dx, y, 3, 12, gold[2])
    r.rect(x - 4 + dx, y + 10, 9, 2, gold[2])
    r.set(x - 5 + dx, y + 11, gold[3])
    r.set(x + 5 + dx, y + 11, gold[3])
    // arms
    for (const s of [-1, 1]) {
      r.line(x + dx, y + 6, x + s * 6 + dx, y + 3, gold[1])
      r.line(x + s * 6 + dx, y + 3, x + s * 6 + dx, y, gold[1])
      r.rect(x + s * 6 - 1 + dx, y - 3, 2, 3, moon[1])
    }
    r.rect(x - 1 + dx, y - 3, 2, 3, moon[1])
  })
  for (const s of [-6, 0, 6]) flameAt(r, x + s, y - 4, flame[2], flame[1], flame[0])
}

function midHall(): BackdropLayer {
  const y = 40
  const r = layerImage(y)
  const cols = [40, 200, 360, 520]
  // pointed arches joining the columns, with a keystone
  for (const px of cols) {
    const cx = px + 80
    const arch = new Raster(150, 100)
    for (let yy = 0; yy < 100; yy++)
      for (let xx = 0; xx < 150; xx++) {
        const dx = Math.abs(xx + 0.5 - 75)
        const out = lancet(yy + 0.5, 4, 90, 69)
        const inn = lancet(yy + 0.5, 15, 90, 59)
        if (out >= 0 && dx <= out && (inn < 0 || dx > inn) && yy < 92) arch.set(xx, yy, 1)
      }
    stampShaded(r, arch, cx - 75, 30, tMid, { shade: [3, 3], hi: [2, 2] })
  }
  for (const px of cols) {
    pillar(r, px - 11, 0, 22, r.h, tMid)
    // flutes
    tiled((dx) => {
      for (const o of [-4, 1, 6]) for (let yy = 38; yy < 192; yy++) if (yy % 9 !== 0) r.set(px + o + dx, yy, wallMid[3])
    })
    stampShaded(r, rectMask(36, 8), px - 18, 24, tMid, { shade: [0, 3], hi: [0, 1], deep: [0, 1] })
    stampShaded(r, rectMask(30, 6), px - 15, 32, tMid, { shade: [0, 2], hi: [0, 1] })
    stampShaded(r, rectMask(34, 10), px - 17, 196, tMid, { shade: [0, 3], hi: [0, 1], deep: [0, 1] })
  }
  // banners between the columns' feet of two arches, candelabra on the two others
  banner2(r, 40, 44, 24, 78)
  banner2(r, 360, 48, 24, 70)
  candelabra(r, 200, 96)
  candelabra(r, 520, 100)
  lightOn(r, 200, 96, 28, 1.4, warmLift)
  lightOn(r, 520, 100, 28, 1.4, warmLift)
  fadeBottom(r, 40, tMid.deep)
  return { image: r, parallax: 0.28, y }
}

/** A tied-back drape hanging from the top: folds, a gold cord at the pinch and a scalloped hem. (cx, top) = top centre. */
function drapery(r: Raster, cx: number, top: number, len: number, side: 1 | -1) {
  const m = new Raster(60, len)
  const pinch = Math.round(len * 0.5)
  for (let y = 0; y < len; y++) {
    const half =
      y < pinch ? 17 - 8 * Math.sin((y / pinch) * Math.PI * 0.5) : 9 + 13 * Math.pow((y - pinch) / (len - pinch), 0.9)
    const sway = side * Math.round(Math.sin((y / len) * Math.PI) * 3)
    for (let x = Math.round(30 + sway - half); x < Math.round(30 + sway + half); x++) m.set(x, y, 1)
  }
  for (let x = 0; x < 60; x++) {
    const cut = Math.round(Math.abs(Math.sin((x / 7) * Math.PI)) * 4)
    for (let y = len - 5 + (4 - cut); y < len; y++) m.set(x, y, 0)
  }
  stampShaded(r, m, cx - 30, top, tDrape, { shade: [3, 2], hi: [1, 1], deep: [1, 0] })
  tiled((dx) => {
    for (let y = 3; y < len - 6; y++)
      for (let x = 0; x < 60; x++)
        if (m.get(x, y) && m.get(x + 1, y) && x % 6 === 3) r.set(cx - 30 + x + dx, top + y, drape[2])
    const sway = side * Math.round(Math.sin((pinch / len) * Math.PI) * 3)
    r.rect(cx - 10 + sway + dx, top + pinch - 1, 20, 4, gold[2])
    r.rect(cx - 10 + sway + dx, top + pinch - 1, 20, 1, gold[1])
    r.rect(cx + 6 + sway + dx, top + pinch + 2, 2, 12, gold[2])
    r.rect(cx + 5 + sway + dx, top + pinch + 14, 4, 5, gold[1])
  })
}

function nearPillars(): BackdropLayer {
  const y = 20
  const r = layerImage(y)
  drapery(r, 134, 0, 132, 1)
  drapery(r, 556, 0, 116, -1)
  const xs = [108, 300, 452, 580]
  for (const px of xs) {
    pillar(r, px - 13, 0, 26, r.h, tNear)
    stampShaded(r, rectMask(38, 10), px - 19, 6, tNear, { shade: [0, 3], hi: [0, 1], deep: [0, 1] })
    stampShaded(r, rectMask(36, 12), px - 18, 200, tNear, { shade: [0, 4], hi: [0, 1], deep: [0, 1] })
  }
  fadeBottom(r, 36, tNear.deep)
  return { image: r, parallax: 0.52, y }
}

function frontSwags(): BackdropLayer {
  const h = 78
  const r = new Raster(W, h)
  const n = 8
  const span = W / n
  for (let s = 0; s < n; s++) {
    const x0 = s * span
    const depth = 18 + Math.round(noiseAt(s, 2, 5) * 14)
    for (let x = 0; x < span; x++) {
      const u = x / span
      const bottom = 6 + Math.round(Math.sin(u * Math.PI) * depth)
      const fold = Math.floor((x + s * 3) / 4) % 2
      for (let yy = 0; yy <= bottom; yy++) {
        let c = fold ? swagTones.base : swagTones.shade
        if (yy === bottom) c = swagTones.deep
        else if (yy < 2) c = swagTones.hi
        r.set(x0 + x, yy, c)
      }
    }
  }
  // knots of gold cord where the swags meet, with a tassel
  for (let s = 0; s < n; s++) {
    const kx = s * span
    tiled((dx) => {
      r.rect(kx - 3 + dx, 3, 6, 6, gold[2])
      r.rect(kx - 2 + dx, 4, 4, 4, gold[1])
      r.rect(kx - 1 + dx, 9, 2, 14 + (s % 3) * 6, gold[2])
      r.rect(kx - 2 + dx, 23 + (s % 3) * 6, 4, 6, gold[1])
      r.rect(kx - 2 + dx, 27 + (s % 3) * 6, 4, 2, gold[2])
    })
  }
  return { image: r, parallax: 1.15, y: 0, front: true }
}

export const backdrop: (() => Backdrop) | undefined = () => ({
  sky: sky(),
  layers: [farWall(), midHall(), nearPillars(), frontSwags()],
  ambience: 'embers'
})
