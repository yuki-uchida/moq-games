import { color, R, ramp } from '../../palette'
import { Raster, noiseAt, rng } from '../../raster'
import type { Backdrop, BackdropLayer } from '../types'
import {
  W,
  blurLine,
  cloud,
  fadeBottom,
  fillLand,
  glow,
  gradient,
  layerImage,
  liftTo,
  plantBush,
  plantTree,
  peakLine,
  ridgeLine,
  scatter,
  skyImage,
  stampShaded,
  tiled,
  tonesOf,
  treeLine,
  type Tones
} from './kit'

/** Backdrop of the `meadow` world: a sunny day, clouds, pale mountains, rolling hills and flower bushes. */

const SKY = [color('#62b8fa'), color('#84cdfd'), R.skyDay[1], color('#c4e8ff'), R.skyDay[0]]
const SUN_GLOW = [color('#b4e2ff'), color('#cdeeff'), color('#e6f8ff'), color('#fff6d6')]
const SUN = color('#fffbe6')
const SUN_RIM = color('#fff0b4')

const mountain = ramp('#d6ebf0', '#bcdbe4', '#a4c8d8', '#8cb4cc', '#5a7aa8')
const mountainFar = [color('#e4f2f6'), color('#d2e8ee'), color('#c4dfe8'), color('#b4d2e0')]
const SNOW = color('#f6fcff')
const SNOW_SHADE = color('#dcecf6')
const hillBack = { hi: color('#dff5d6'), base: R.farGreen[0], shade: R.farGreen[1], deep: R.farGreen[2] }
const wall = ramp('#f4f2e0', '#e2e0cc', '#c8c6b4', '#aaa898', '#8a9a88')
const roof = ramp('#d8bca4', '#c4a48c', '#a88874', '#8a6c60', '#6a5048')
const flowerYellow = color('#f6efb4')
const flowerWhite = color('#f0f8ee')
const flowerBlue = color('#bcd6f8')
const blade = ramp('#4a9a5e', '#33794d', '#27603f', '#1c4a32', '#123624')

function sky() {
  const r = skyImage()
  gradient(r, [
    { at: 0, c: SKY[0] },
    { at: 70, c: SKY[1] },
    { at: 140, c: SKY[2] },
    { at: 200, c: SKY[3] },
    { at: 262, c: SKY[4] }
  ])
  glow(r, 132, 58, 96, SUN_GLOW, 1.6)
  r.ellipse(132, 58, 14.5, 14.5, SUN_RIM)
  r.ellipse(132, 58, 12.5, 12.5, SUN)
  return r
}

function clouds(): BackdropLayer {
  const r = new Raster(W, 150)
  const t = tonesOf(R.cloud)
  // x (left), flat bottom y, width, height
  const list = [
    [214, 62, 150, 44],
    [28, 122, 118, 32],
    [398, 104, 196, 52],
    [470, 36, 92, 26],
    [312, 140, 84, 22]
  ]
  list.forEach(([x, y, w, h], i) => cloud(r, x, y, w, h, 40 + i * 7, t))
  return { image: r, parallax: 0.05, y: 0, drift: 3 }
}

function mountains(): BackdropLayer {
  const y = 60
  const r = layerImage(y)
  // A paler, lower range behind the main one.
  const back = peakLine(
    [
      [60, 70, 0.7],
      [196, 52, 0.6],
      [330, 66, 0.65],
      [452, 48, 0.55],
      [570, 64, 0.7]
    ],
    3,
    8
  )
  fillLand(r, back, {
    tones: { hi: mountainFar[0], base: mountainFar[1], shade: mountainFar[2], deep: mountainFar[3] },
    rim: 0
  })
  const top = peakLine(
    [
      [112, 40, 0.95],
      [168, 62, 1.0],
      [262, 22, 0.8],
      [352, 56, 1.05],
      [458, 36, 0.85],
      [560, 66, 1.1],
      [624, 52, 0.9]
    ],
    3,
    21
  )
  fillLand(r, top, { tones: tonesOf(mountain), rim: 1, facets: { k: 0.42, prominence: 10, window: 10 } })
  // Snow on the high tips, jagged along its lower edge.
  const snowLine = 50
  for (let x = 0; x < W; x++) {
    const t0 = Math.round(top[x])
    const depth = Math.max(0, snowLine - t0) * 0.62 + (noiseAt(x >> 1, 3, 9) * 2.2 - 0.8)
    if (depth <= 0) continue
    for (let yy = t0; yy < t0 + depth; yy++) r.set(x, yy, r.get(x, yy) === mountain[2] ? SNOW_SHADE : SNOW)
  }
  fadeBottom(r, 50, mountain[0])
  return { image: r, parallax: 0.12, y }
}

/** A windmill whose tower base is (x, baseY). */
function windmill(r: Raster, x: number, baseY: number) {
  const t = tonesOf(wall)
  const h = 30
  const tower = new Raster(20, h)
  tower.poly([4, 0, 15, 0, 18, h, 1, h], 1)
  stampShaded(r, tower, x - 10, baseY - h, t, { shade: [4, 0], hi: [1, 1] })
  const cap = new Raster(20, 11)
  cap.poly([10, 0, 17, 10, 3, 10], 1)
  stampShaded(r, cap, x - 10, baseY - h - 9, tonesOf(roof, 0), { shade: [3, 2], hi: [1, 1] })
  // sails
  const hx = x
  const hy = baseY - h - 1
  const a0 = -0.42
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i * Math.PI) / 2
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const nx = -dy
    const ny = dx
    tiled((o) => {
      r.line(hx + o, hy, hx + o + dx * 20, hy + dy * 20, wall[3])
      r.poly(
        [
          hx + o + dx * 6 + nx * 0.5,
          hy + dy * 6 + ny * 0.5,
          hx + o + dx * 20 + nx * 0.5,
          hy + dy * 20 + ny * 0.5,
          hx + o + dx * 20 + nx * 5,
          hy + dy * 20 + ny * 5,
          hx + o + dx * 6 + nx * 5,
          hy + dy * 6 + ny * 5
        ],
        wall[2]
      )
      r.line(hx + o + dx * 6, hy + dy * 6, hx + o + dx * 20, hy + dy * 20, wall[3])
    })
  }
  tiled((o) => r.ellipse(hx + o, hy, 1.8, 1.8, roof[3]))
}

/** A farmhouse with a gable roof; (x, baseY) = bottom centre. */
function farmhouse(r: Raster, x: number, baseY: number) {
  const body = new Raster(26, 13)
  body.rect(0, 0, 26, 13, 1)
  stampShaded(r, body, x - 13, baseY - 12, tonesOf(wall), { shade: [3, 2], hi: [1, 1] })
  const top = new Raster(32, 11)
  top.poly([16, 0, 31, 10, 1, 10], 1)
  stampShaded(r, top, x - 16, baseY - 22, tonesOf(roof), { shade: [3, 3], hi: [1, 1] })
  tiled((o) => {
    r.rect(x + o - 8, baseY - 8, 3, 3, wall[3])
    r.rect(x + o + 4, baseY - 8, 3, 3, wall[3])
    r.rect(x + o + 8, baseY - 26, 2, 5, roof[2])
  })
}

function farHills(): BackdropLayer {
  const y = 112
  const r = layerImage(y)
  // Pale back ridge first, then the front ridge with the buildings.
  const back = liftTo(
    ridgeLine(
      56,
      [
        { cycles: 2, amp: 12, kind: 'sine', phase: 0.15 },
        { cycles: 5, amp: 9 },
        { cycles: 11, amp: 3 }
      ],
      33
    ),
    34
  )
  fillLand(r, back, { tones: hillBack, rim: 1 })
  treeLine(r, back, {
    seed: 7,
    count: 22,
    kind: ['round', 'poplar', 'round', 'pine'],
    height: [7, 12],
    tones: { hi: R.farGreen[0], base: R.farGreen[1], shade: R.farGreen[2], deep: R.farGreen[3] },
    sink: 2
  })
  const front = liftTo(
    blurLine(
      ridgeLine(
        70,
        [
          { cycles: 3, amp: 12, kind: 'sine', phase: 0.55 },
          { cycles: 6, amp: 8 },
          { cycles: 13, amp: 2 }
        ],
        44
      ),
      3
    ),
    50
  )
  fillLand(r, front, { tones: tonesOf(R.farGreen), rim: 1, facets: { k: 1.2, prominence: 5, window: 8, reach: 120 } })
  const mills = [372]
  const houses = [118, 538]
  treeLine(r, front, {
    seed: 12,
    count: 20,
    kind: ['round', 'pine', 'round', 'poplar'],
    height: [9, 16],
    tones: tonesOf(R.farGreen, 1),
    sink: 2,
    skip: [...mills.map((m) => [m - 22, m + 22] as const), ...houses.map((m) => [m - 22, m + 22] as const)]
  })
  windmill(r, 372, Math.round(front[372]) + 3)
  houses.forEach((hx) => farmhouse(r, hx, Math.round(front[hx]) + 2))
  // a couple of trees beside the house
  plantTree(r, 'round', 142, Math.round(front[142]) + 2, 15, tonesOf(R.farGreen, 1), R.farGreen[3], 91)
  plantTree(r, 'round', 560, Math.round(front[560]) + 2, 13, tonesOf(R.farGreen, 1), R.farGreen[3], 92)
  fadeBottom(r, 60, R.farGreen[2])
  return { image: r, parallax: 0.25, y }
}

function nearHills(): BackdropLayer {
  const y = 152
  const r = layerImage(y)
  const top = liftTo(
    blurLine(
      ridgeLine(
        60,
        [
          { cycles: 4, amp: 12, kind: 'sine', phase: 0.3 },
          { cycles: 9, amp: 6 },
          { cycles: 21, amp: 2 }
        ],
        55
      ),
      2
    ),
    36
  )
  fillLand(r, top, { tones: tonesOf(R.midGreen), rim: 1 })
  const bush: Tones = { hi: R.midGreen[1], base: R.midGreen[2], shade: R.midGreen[3], deep: R.midGreen[3] }
  const rnd = rng(77)
  scatter(14, 19, 22).forEach((x, i) => {
    const w = 16 + Math.round(rnd() * 14)
    const h = 8 + Math.round(rnd() * 5)
    plantBush(r, x, Math.round(top[x]) + 5, w, h, bush, 200 + i)
  })
  // Flower dots: small clumps on the slopes, pale and few, never pink.
  const flowers = [flowerYellow, flowerWhite, flowerBlue, flowerYellow]
  scatter(34, 61, 14, 1.0).forEach((x) => {
    const yy = Math.round(top[x]) + 7 + Math.floor(rnd() * 26)
    const c = flowers[Math.floor(rnd() * flowers.length)]
    r.set(x, yy, c)
    r.set(x + 2, yy + 1, c)
    if (rnd() < 0.5) r.set(x - 1, yy + 2, c)
  })
  // A darker fold in front, so the lower part (seen through pits) is not one flat colour.
  const fold = liftTo(
    blurLine(
      ridgeLine(
        90,
        [
          { cycles: 3, amp: 8, kind: 'sine', phase: 0.1 },
          { cycles: 8, amp: 4 }
        ],
        88
      ),
      2
    ),
    78
  )
  fillLand(r, fold, {
    tones: { hi: R.midGreen[1], base: R.midGreen[2], shade: R.midGreen[3], deep: R.midGreen[3] },
    rim: 1,
    facets: { k: 1.0, prominence: 4, window: 8, reach: 100 }
  })
  fadeBottom(r, 60, R.midGreen[3])
  return { image: r, parallax: 0.45, y }
}

function grassFront(): BackdropLayer {
  const h = 34
  const y = 360 - h
  const r = new Raster(W, h)
  const rnd = rng(5)
  scatter(9, 14, 24, 0.9).forEach((x) => {
    const n = 5 + Math.round(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const lean = (rnd() - 0.5) * 12
      const bh = 10 + Math.round(rnd() * 16)
      const bx = x + (i - n / 2) * 2.2
      r.poly([bx - 1.6, h, bx + lean, h - bh, bx + 1.6, h], blade[2])
      r.line(bx - 1, h - 1, bx + lean * 0.9, h - bh + 1, blade[1])
    }
  })
  return { image: r, parallax: 1.3, y, front: true }
}

export const backdrop: (() => Backdrop) | undefined = () => ({
  sky: sky(),
  layers: [clouds(), mountains(), farHills(), nearHills(), grassFront()],
  ambience: 'pollen'
})
