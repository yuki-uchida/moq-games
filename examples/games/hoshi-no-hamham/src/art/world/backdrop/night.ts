import { C, R, color, ramp } from '../../palette'
import { Raster, bayer, ball, rng } from '../../raster'
import type { Backdrop, BackdropLayer } from '../types'
import {
  W,
  blurLine,
  fadeBottom,
  fillLand,
  glow,
  gradient,
  layerImage,
  liftTo,
  mist,
  peakLine,
  plantBush,
  plantTree,
  ridgeLine,
  scatter,
  skyImage,
  starField,
  stampShaded,
  tiled,
  tonesOf,
  treeLine,
  type Tones
} from './kit'

/** Backdrop of the `night` world: a moonlit chase through dark woods, a distant hideout glowing between the trees. */

const moon = ramp('#fffbe8', '#f2eedc', '#d4cfe8', '#b4aed4', '#8a82b8')
const moonMaria = color('#dcd6ea')
const mountainTones: Tones = {
  hi: color('#6a5aa8'),
  base: color('#54448f'),
  shade: color('#46377c'),
  deep: R.nightFar[1]
}
const midHill: Tones = { hi: color('#4a3a80'), base: R.nightFar[1], shade: R.nightFar[2], deep: R.nightFar[3] }
const midTree: Tones = { hi: R.nightFar[1], base: R.nightFar[2], shade: R.nightFar[3], deep: R.nightFar[3] }
const windowGlow = color('#f2c76a')
const windowDim = color('#8a5f6c')
const haze = color('#5a4a98')
const wall = ramp('#3a2e68', '#2e2358', '#241a48', '#1a1236', '#0e0a24')

function sky() {
  const r = skyImage()
  gradient(r, [
    { at: 0, c: R.skyNight[3] },
    { at: 80, c: R.skyNight[2] },
    { at: 170, c: R.skyNight[1] },
    { at: 250, c: R.skyNight[0] }
  ])
  // Moon halo first, then the disc on top.
  const mx = 530
  const my = 74
  glow(
    r,
    mx,
    my,
    130,
    [color('#3a2c70'), color('#4a3a86'), color('#5e4e9c'), color('#7c6eb8'), color('#a49ad4'), color('#c8c2ea')],
    1.5
  )
  starField(r, {
    seed: 11,
    count: 78,
    area: { x0: 4, y0: 4, x1: 636, y1: 205 },
    avoid: [[mx, my, 46]],
    colors: { dim: color('#9a8ed0'), mid: color('#d8d0f4'), bright: C.glow },
    plus: 0.14,
    spark: 0.04,
    bias: 1.35
  })
  ball(r, mx, my, 26, 26, moon)
  // Seas and a few craters: flat, low contrast.
  r.ellipse(mx - 6, my - 8, 8, 6, moonMaria)
  r.ellipse(mx + 7, my + 4, 9, 7, moonMaria)
  r.ellipse(mx - 10, my + 11, 5, 4, moonMaria)
  r.ellipse(mx + 12, my - 13, 4, 3, moon[2])
  r.ellipse(mx - 15, my + 1, 3, 3, moon[2])
  r.ellipse(mx + 1, my + 17, 3, 2, moon[3])
  return r
}

function farMountains(): BackdropLayer {
  const y = 96
  const r = layerImage(y)
  const top = peakLine(
    [
      [70, 60, 0.7],
      [172, 36, 0.8],
      [286, 72, 0.7],
      [388, 30, 0.75],
      [492, 66, 0.8],
      [580, 44, 0.7]
    ],
    3,
    4
  )
  fillLand(r, top, { tones: mountainTones, rim: 1, facets: { k: 0.4, prominence: 10, window: 10 } })
  mist(r, 118, 26, haze, 0.5)
  fadeBottom(r, 50, mountainTones.shade)
  return { image: r, parallax: 0.1, y }
}

/** Distant hideout: a cabin and a shed with a few tiny lit windows. (x, baseY) = bottom centre of the cabin. */
function hideout(r: Raster, x: number, baseY: number) {
  const t = tonesOf(wall, 1)
  const body = new Raster(30, 14)
  body.rect(0, 0, 30, 14, 1)
  stampShaded(r, body, x - 15, baseY - 13, t, { shade: [3, 2], hi: [1, 1] })
  const roof = new Raster(36, 11)
  roof.poly([18, 0, 35, 10, 1, 10], 1)
  stampShaded(r, roof, x - 18, baseY - 23, tonesOf(wall, 2), { shade: [4, 3], hi: [1, 1] })
  const shed = new Raster(14, 9)
  shed.rect(0, 0, 14, 9, 1)
  stampShaded(r, shed, x + 17, baseY - 8, t, { shade: [2, 2], hi: [1, 1] })
  tiled((o) => {
    r.rect(x + o + 11, baseY - 28, 3, 6, wall[3])
    for (const wx of [-9, -2, 6]) {
      r.rect(x + o + wx, baseY - 9, 3, 3, windowGlow)
      r.set(x + o + wx - 1, baseY - 9, windowDim)
      r.set(x + o + wx + 3, baseY - 9, windowDim)
    }
    r.rect(x + o + 21, baseY - 5, 2, 2, windowGlow)
  })
}

function midTrees(): BackdropLayer {
  const y = 138
  const r = layerImage(y)
  const top = liftTo(
    blurLine(
      ridgeLine(
        66,
        [
          { cycles: 3, amp: 12, kind: 'sine', phase: 0.2 },
          { cycles: 7, amp: 7 },
          { cycles: 15, amp: 2 }
        ],
        14
      ),
      3
    ),
    40
  )
  fillLand(r, top, { tones: midHill, rim: 1 })
  // Level the ground under the hideout so it sits flat.
  const hx = 402
  treeLine(r, top, {
    seed: 31,
    count: 46,
    kind: ['pine', 'pine', 'round', 'pine'],
    height: [13, 26],
    tones: midTree,
    trunk: R.nightFar[3],
    sink: 2,
    skip: [[hx - 30, hx + 36]]
  })
  hideout(r, hx, Math.round(top[hx]) + 2)
  // a pair of pines that frame the hideout
  plantTree(r, 'pine', hx - 33, Math.round(top[hx - 33]) + 2, 26, midTree, R.nightFar[3], 5)
  plantTree(r, 'pine', hx + 41, Math.round(top[hx + 41]) + 2, 22, midTree, R.nightFar[3], 6)
  mist(r, 20, 14, haze, 0.3)
  fadeBottom(r, 60, R.nightFar[3])
  return { image: r, parallax: 0.25, y }
}

function nearTrees(): BackdropLayer {
  const y = 170
  const r = layerImage(y)
  const top = liftTo(
    blurLine(
      ridgeLine(
        90,
        [
          { cycles: 4, amp: 10, kind: 'sine', phase: 0.6 },
          { cycles: 9, amp: 6 }
        ],
        62
      ),
      2
    ),
    58
  )
  fillLand(r, top, {
    tones: { hi: R.nightFar[3], base: R.nightFar[3], shade: R.nightFar[4], deep: R.nightFar[4] },
    rim: 0
  })
  const t: Tones = { hi: R.nightFar[2], base: R.nightFar[3], shade: R.nightFar[4], deep: R.nightFar[4] }
  // A lighter back row of pines, then a darker front row, so the trees read as a mass with depth.
  treeLine(r, top, {
    seed: 78,
    count: 26,
    kind: ['pine', 'pine', 'pine', 'round'],
    height: [28, 46],
    tones: t,
    trunk: R.nightFar[4],
    sink: 4
  })
  treeLine(r, top, {
    seed: 77,
    count: 15,
    kind: ['pine', 'pine', 'pine', 'round'],
    height: [38, 60],
    tones: { hi: R.nightFar[3], base: R.nightFar[4], shade: R.nightFar[4], deep: R.nightFar[4] },
    trunk: R.nightFar[4],
    sink: 5
  })
  const rnd = rng(9)
  scatter(18, 91, 20, 1).forEach((x, i) => {
    plantBush(r, x, Math.round(top[x]) + 6, 22 + Math.round(rnd() * 14), 10 + Math.round(rnd() * 6), t, 300 + i)
  })
  fadeBottom(r, 70, R.nightFar[4])
  return { image: r, parallax: 0.5, y }
}

/** A few low wisps of mist drifting between the tree lines. */
function wisps(): BackdropLayer {
  const h = 70
  const y = 180
  const r = new Raster(W, h)
  const rnd = rng(21)
  const c = color('#5a4a98')
  scatter(5, 3, 90, 0.6).forEach((x, i) => {
    const w = 90 + Math.round(rnd() * 70)
    const yy = 14 + Math.round(rnd() * 40)
    const m = new Raster(w, 9)
    m.ellipse(w / 2, 4.5, w / 2, 3.2, 1)
    for (let j = 0; j < m.h; j++)
      for (let k = 0; k < m.w; k++) if (m.get(k, j) && bayer(k + x + i, j + yy) < 0.5) r.set(x - w / 2 + k, yy + j, c)
  })
  return { image: r, parallax: 0.35, y, drift: 5 }
}

export const backdrop: (() => Backdrop) | undefined = () => ({
  sky: sky(),
  layers: [farMountains(), midTrees(), wisps(), nearTrees()],
  ambience: 'fireflies'
})
