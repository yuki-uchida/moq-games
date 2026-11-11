import { C, DARKER, R, color, ramp } from '../../palette'
import { Raster, ball, bayer, noiseAt, rng } from '../../raster'
import type { Backdrop, BackdropLayer } from '../types'
import { W, gradient, layerImage, scatter, skyImage, stampPoly, stampShaded, starField, tiled, type Tones } from './kit'

/**
 * Backdrop of the `star` world (stage 10): the final battle among the stars.
 * sky   = deep space with dithered nebulae, stars of three sizes and a big ringed planet,
 * far   = distant floating islands in silhouette with tiny crystals,
 * wisps = a slow drift of thin nebula,
 * mid   = nearer floating islands carrying the towers of the king's star fortress,
 * near  = crystal spires rising from below.
 */

const planet = ramp('#cfa8e0', '#a884c8', '#8563a8', '#5c4284', '#3a2858')
const ringOuter = color('#c8a8e0')
const ringInner = color('#8f70b4')
const farRock = ramp('#4e3e86', '#463878', '#3e306c', '#34285c', '#261e46')
const midRock = ramp('#6a56a8', '#5a4894', '#4a3c80', '#3a3068', '#2a2250')
const tower = ramp('#8a78c0', '#7464ac', '#5e5094', '#483e78', '#322a58')
const roof = ramp('#a468a8', '#8a4e94', '#6e3c7c', '#522c62', '#3a1e48')
const glint = color('#f4d78a')
const glintDim = color('#c8a060')
const goldStar = ramp('#fff0a8', '#f2c85a', '#c8963a', '#8a6228', '#5a3e1c')
const spire = ramp('#c8a6ee', '#9a78d0', '#7656b0', '#563c8c', '#3a2866')
const spireDark = ramp('#6c58aa', '#5a489a', '#4a3c84', '#3a2f6c', '#2a2250')
const nebulaCols = [color('#2e1c58'), color('#3e2470'), color('#542c84'), color('#703a94')]
const nebulaPink = [color('#40205e'), color('#58286e'), color('#7a3482'), color('#a04494')]

const tFar: Tones = { hi: farRock[0], base: farRock[1], shade: farRock[2], deep: farRock[3] }
const tMid: Tones = { hi: midRock[0], base: midRock[1], shade: midRock[2], deep: midRock[3] }
const tTower: Tones = { hi: tower[0], base: tower[1], shade: tower[2], deep: tower[3] }
const tRoof: Tones = { hi: roof[0], base: roof[1], shade: roof[2], deep: roof[3] }
const tSpire: Tones = { hi: spire[0], base: spire[1], shade: spire[2], deep: spire[3] }
const tSpireDark: Tones = { hi: spireDark[0], base: spireDark[1], shade: spireDark[2], deep: spireDark[3] }

const smooth = (f: number) => f * f * (3 - 2 * f)
function vnoise(x: number, y: number, seed: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const a = noiseAt(ix, iy, seed)
  const b = noiseAt(ix + 1, iy, seed)
  const c = noiseAt(ix, iy + 1, seed)
  const d = noiseAt(ix + 1, iy + 1, seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
function fbm(x: number, y: number, seed: number) {
  let v = 0
  let a = 0.5
  let f = 1 / 70
  for (let o = 0; o < 4; o++) {
    v += a * vnoise(x * f, y * f, seed + o * 13)
    f *= 2
    a *= 0.5
  }
  return v
}

/** Dithered nebula clouds painted over the gradient. */
function nebulae(r: Raster) {
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const band = Math.exp(-(((y - (210 - x * 0.16)) / 95) ** 2))
      const n = fbm(x, y, 5)
      const d = Math.max(0, Math.min(1, (n - 0.44) * 3.4)) * band
      if (d <= 0) continue
      const t = d * 4
      const lvl = Math.floor(t) + (bayer(x, y) < t - Math.floor(t) ? 1 : 0)
      if (lvl < 1) continue
      const pink = fbm(x + 300, y + 90, 21) > 0.56
      r.set(x, y, (pink ? nebulaPink : nebulaCols)[Math.min(4, lvl) - 1])
    }
}

function ringedPlanet(r: Raster, cx: number, cy: number, rad: number) {
  const tilt = -0.36
  const rx = rad * 1.95
  const ry = rad * 0.4
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  const ringAt = (x: number, y: number) => {
    const dx = x + 0.5 - cx
    const dy = y + 0.5 - cy
    const px = dx * cos + dy * sin
    const py = -dx * sin + dy * cos
    const q = (px / rx) ** 2 + (py / ry) ** 2
    if (q > 1 || q < 0.5 || (q > 0.72 && q < 0.78)) return { c: 0, front: false }
    return { c: q > 0.78 ? ringOuter : ringInner, front: py > 0 }
  }
  const box = (fn: (x: number, y: number) => void) => {
    for (let y = Math.floor(cy - rx); y <= Math.ceil(cy + rx); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) fn(x, y)
  }
  box((x, y) => {
    const q = ringAt(x, y)
    if (q.c && !q.front) r.set(x, y, q.c)
  })
  ball(r, cx, cy, rad, rad, planet, false)
  // two soft bands across the globe
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rad - 1) continue
      const band = Math.round((y - cy + (x - cx) * 0.12) / 1)
      if ((band > -rad * 0.45 && band < -rad * 0.3) || (band > rad * 0.15 && band < rad * 0.3)) {
        const c = r.get(x, y)
        r.set(x, y, DARKER[c])
      }
    }
  box((x, y) => {
    const q = ringAt(x, y)
    if (q.c && q.front) r.set(x, y, q.c)
  })
}

function sky() {
  const r = skyImage()
  gradient(r, [
    { at: 0, c: R.cosmos[4] },
    { at: 70, c: R.cosmos[3] },
    { at: 210, c: R.cosmos[3] },
    { at: 300, c: R.cosmos[2] },
    { at: 360, c: R.cosmos[1] }
  ])
  nebulae(r)
  starField(r, {
    seed: 7,
    count: 170,
    area: { x0: 3, y0: 3, x1: 637, y1: 330 },
    avoid: [[470, 130, 46]],
    colors: { dim: color('#6a5aa8'), mid: color('#b4a8e4'), bright: C.glow },
    plus: 0.1,
    spark: 0.035,
    bias: 1
  })
  ringedPlanet(r, 468, 128, 38)
  return r
}

/** A floating rock: flat-ish top, a long tapering underside with a few chunks hanging below. (cx, topY) = top centre. */
function islandMask(w: number, depth: number, seed: number) {
  const pad = 6
  const m = new Raster(w + pad * 2, depth + 18 + pad)
  for (let x = 0; x < w; x++) {
    const u = (x - w / 2) / (w / 2)
    const top = pad + 6 + Math.round(noiseAt(x >> 2, 1, seed) * 3) + Math.round(Math.pow(Math.abs(u), 3) * 4)
    const under =
      pad + 6 + 6 + Math.round(Math.pow(Math.max(0, 1 - u * u), 0.85) * depth * (0.8 + noiseAt(x >> 3, 2, seed) * 0.3))
    for (let y = top; y <= under; y++) m.set(pad + x, y, 1)
  }
  return { mask: m, pad }
}

function farIsland(r: Raster, cx: number, topY: number, w: number, depth: number, seed: number) {
  const { mask, pad } = islandMask(w, depth, seed)
  stampShaded(r, mask, cx - w / 2 - pad, topY - pad - 6, tFar, { shade: [3, 3], hi: [1, 1] })
  // tiny crystals on top
  const rnd = rng(seed)
  const n = 2 + Math.round(rnd() * 2)
  for (let i = 0; i < n; i++) {
    const x = cx - w / 3 + rnd() * ((w * 2) / 3)
    const h = 5 + Math.round(rnd() * 5)
    const y = topY + 1
    stampPoly(
      r,
      [x - 1.5, y, x + 1.5, y, x + 1.5, y - h + 2, x, y - h, x - 1.5, y - h + 2],
      { hi: spire[0], base: spire[1], shade: spire[2], deep: spire[3] },
      { shade: [1, 1], hi: [1, 1] }
    )
  }
  // a couple of drifting chunks
  const dep = topY + 12 + depth
  tiled((dx) => {
    r.rect(cx - 6 + dx, dep + 6, 3, 2, farRock[2])
    r.rect(cx + 9 + dx, dep + 12, 2, 2, farRock[2])
  })
}

function farLayer(): BackdropLayer {
  const y = 50
  const r = layerImage(y)
  const list: [number, number, number, number][] = [
    [64, 70, 82, 44],
    [176, 110, 56, 30],
    [276, 56, 70, 40],
    [388, 132, 84, 40],
    [536, 62, 62, 34],
    [606, 120, 46, 28]
  ]
  list.forEach(([cx, ty, w, d], i) => farIsland(r, cx, ty, w, d, 10 + i))
  return { image: r, parallax: 0.07, y }
}

/** A tower of the king's star fortress: stone body, a cone roof, a lit window and a star on a pole. (x, y) = base centre. */
function fortTower(r: Raster, x: number, y: number, w: number, h: number, roofH: number) {
  const body = new Raster(w, h).rect(0, 0, w, h, 1)
  stampShaded(r, body, x - Math.floor(w / 2), y - h, tTower, {
    shade: [Math.max(2, Math.round(w / 3)), 0],
    hi: [1, 0],
    deep: [1, 0]
  })
  // battlement ring under the roof
  stampShaded(r, new Raster(w + 4, 3).rect(0, 0, w + 4, 3, 1), x - Math.floor(w / 2) - 2, y - h - 2, tTower, {
    shade: [0, 2],
    hi: [0, 1]
  })
  stampPoly(r, [x - w / 2 - 3, y - h - 2, x, y - h - 2 - roofH, x + w / 2 + 3, y - h - 2], tRoof, {
    shade: [3, 1],
    hi: [1, 1]
  })
  tiled((dx) => {
    r.rect(x + dx, y - h - 2 - roofH - 6, 1, 6, goldStar[3])
    r.rect(x - 1 + dx, y - h - 2 - roofH - 9, 3, 3, goldStar[1])
    r.set(x + dx, y - h - 2 - roofH - 10, goldStar[0])
    r.set(x + dx, y - h - 2 - roofH - 7, goldStar[0])
    // windows
    for (let wy = y - h + 6; wy < y - 8; wy += 12) {
      r.rect(x - 1 + dx, wy, 3, 4, glint)
      r.set(x - 1 + dx, wy + 3, glintDim)
      r.set(x + 1 + dx, wy + 3, glintDim)
    }
  })
}

function wall(r: Raster, x0: number, x1: number, y: number, h: number) {
  const m = new Raster(x1 - x0, h).rect(0, 0, x1 - x0, h, 1)
  stampShaded(r, m, x0, y - h, tTower, { shade: [0, 3], hi: [0, 1] })
  tiled((dx) => {
    for (let x = x0; x < x1; x += 6) r.rect(x + dx, y - h - 3, 3, 3, tower[1])
    for (let x = x0 + 5; x < x1 - 5; x += 14) r.rect(x + dx, y - h + 5, 2, 4, glint)
  })
}

function midIsland(
  r: Raster,
  cx: number,
  topY: number,
  w: number,
  depth: number,
  seed: number,
  towers: [number, number, number][]
) {
  const { mask, pad } = islandMask(w, depth, seed)
  stampShaded(r, mask, cx - w / 2 - pad, topY - pad - 6, tMid, { shade: [3, 4], hi: [1, 1] })
  // hanging crystals under the island
  const rnd = rng(seed + 9)
  for (let i = 0; i < 3; i++) {
    const bx = cx - w * 0.25 + i * w * 0.25 + (rnd() - 0.5) * 8
    const h = 8 + Math.round(rnd() * 10)
    const by = topY + 6 + Math.round(depth * (0.55 + 0.35 * (1 - Math.abs(bx - cx) / (w / 2))))
    stampPoly(r, [bx - 2, by, bx + 2, by, bx + 1.5, by + h - 2, bx, by + h, bx - 1.5, by + h - 2], tSpire, {
      shade: [1, 1],
      hi: [1, 1]
    })
  }
  // castle on top
  towers.forEach(([dx, h, roofH]) => fortTower(r, cx + dx, topY + 1, h > 38 ? 13 : 10, h, roofH))
}

function midLayer(): BackdropLayer {
  const y = 60
  const r = layerImage(y)
  // main fortress island with a wall joining two towers
  const cx1 = 150
  wall(r, cx1 - 38, cx1 + 38, 98 + 2, 14)
  midIsland(r, cx1, 98, 116, 52, 31, [
    [-36, 34, 14],
    [0, 52, 18],
    [34, 30, 12]
  ])
  const cx2 = 392
  wall(r, cx2 - 30, cx2 + 30, 128 + 2, 12)
  midIsland(r, cx2, 128, 100, 46, 41, [
    [-26, 28, 12],
    [22, 40, 15]
  ])
  midIsland(r, 556, 150, 66, 34, 51, [[2, 24, 11]])
  midIsland(r, 276, 174, 40, 24, 61, [])
  return { image: r, parallax: 0.28, y }
}

function spires(r: Raster, x: number, baseY: number, size: number, t: Tones, seed: number) {
  const rnd = rng(seed)
  const parts: [number, number, number, number][] = [
    [-0.5, 0.5, 0.26, -5],
    [0.55, 0.62, 0.28, 6],
    [-0.18, 1, 0.34, -2],
    [0.2, 0.78, 0.3, 3],
    [0.85, 0.34, 0.2, 5],
    [-0.9, 0.38, 0.2, -4]
  ]
  for (const [ox, hh, ww, lean] of parts) {
    const h = size * hh * (0.9 + rnd() * 0.2)
    const w = Math.max(6, size * ww)
    const cx = x + ox * size * 0.45
    const shoulder = baseY - h * 0.8
    stampPoly(
      r,
      [
        cx - w / 2,
        baseY + 6,
        cx + w / 2,
        baseY + 6,
        cx + w / 2 + lean * 0.5,
        shoulder,
        cx + lean,
        baseY - h,
        cx - w / 2 + lean * 0.5,
        shoulder
      ],
      t,
      { shade: [3, 2], hi: [1, 1] }
    )
  }
}

function nearLayer(): BackdropLayer {
  const y = 186
  const r = layerImage(y)
  const xs = scatter(5, 5, 50, 0.6)
  xs.forEach((x, i) =>
    spires(
      r,
      x,
      r.h - 16 - Math.round(noiseAt(i, 3, 3) * 12),
      70 + Math.round(noiseAt(i, 4, 3) * 40),
      i === 2 ? tSpire : tSpireDark,
      70 + i
    )
  )
  // a solid crystal bed so the last row repeats cleanly down the pits
  for (let x = 0; x < W; x++) {
    const top = r.h - 10 - Math.round(noiseAt(x >> 3, 5, 3) * 5)
    for (let yy = top; yy < r.h; yy++) r.set(x, yy, tSpireDark.shade)
  }
  return { image: r, parallax: 0.5, y }
}

export const backdrop: (() => Backdrop) | undefined = () => ({
  sky: sky(),
  layers: [farLayer(), midLayer(), nearLayer()],
  ambience: 'stardust'
})
