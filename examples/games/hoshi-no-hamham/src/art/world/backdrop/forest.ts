import { color, R, ramp } from '../../palette'
import { Raster, noiseAt, rng } from '../../raster'
import type { Backdrop, BackdropLayer } from '../types'
import {
  W,
  blobMask,
  blurLine,
  fadeBottom,
  fillLand,
  glow,
  gradient,
  layerImage,
  liftTo,
  mist,
  plantBush,
  ridgeLine,
  scatter,
  shafts,
  skyImage,
  stampShaded,
  type Tones
} from './kit'

/** Backdrop of the `forest` world: deep woods in warm green light, trunks in depth, light shafts, hanging leaves. */

// Canopy haze, dark moss at the top to gold at the horizon (also the lift table for the sky's light shafts).
const HAZE = [
  color('#2c7048'),
  color('#38865a'),
  color('#4a9a5e'),
  color('#64ae66'),
  color('#84bf6e'),
  color('#a6cf7a'),
  color('#c6dc8a'),
  color('#dde698'),
  color('#eef0ae')
]
const GLOW = [
  color('#7cb86c'),
  color('#98c874'),
  color('#b4d680'),
  color('#d2e48e'),
  color('#ecf0ac'),
  color('#f8f6c4')
]

const farTrunk = ramp('#b4d8a0', '#9cc68e', '#86b282', '#6e9c72', '#4f7a5a')
const midTrunk = ramp('#68a874', '#4c9062', '#3a7852', '#2c6044', '#1c4630')
const midLeaf = ramp('#82bc76', '#62a468', '#4a8858', '#386f48', '#264e34')
const farLeaf = ramp('#c2e0a0', '#aed496', '#98c48a', '#86b27e', '#6a9468')
const vineColor = color('#3f8458')
const vineLeaf = color('#6cb06c')

const lift = (c: number) => {
  const i = HAZE.indexOf(c)
  return i >= 0 && i < HAZE.length - 1 ? HAZE[i + 1] : c
}

function sky() {
  const r = skyImage()
  gradient(r, [
    { at: 0, c: HAZE[0] },
    { at: 38, c: HAZE[1] },
    { at: 78, c: HAZE[2] },
    { at: 118, c: HAZE[3] },
    { at: 160, c: HAZE[4] },
    { at: 198, c: HAZE[5] },
    { at: 232, c: HAZE[6] },
    { at: 262, c: HAZE[7] }
  ])
  // Sun filtering through a gap in the canopy.
  glow(r, 452, 70, 150, GLOW, 1.5)
  // Canopy: soft dark leaf masses at the very top, low contrast with the haze.
  const rnd = rng(15)
  const canopy: Tones = { hi: HAZE[1], base: HAZE[0], shade: color('#245c3c'), deep: color('#1c4a30') }
  scatter(11, 8, 10, 0.8).forEach((x) => {
    const w = 50 + Math.round(rnd() * 40)
    const h = 20 + Math.round(rnd() * 18)
    const m = blobMask(w, h, [
      [w * 0.3, h * 0.35, w * 0.28, h * 0.4],
      [w * 0.62, h * 0.3, w * 0.3, h * 0.42],
      [w * 0.5, h * 0.55, w * 0.42, h * 0.4]
    ])
    stampSky(r, m, x - w / 2, -Math.round(h * 0.5) + Math.round(rnd() * 10), canopy)
  })
  shafts(
    r,
    [
      { x: 360, w: 70, strength: 0.34 },
      { x: 470, w: 46, strength: 0.3 },
      { x: 250, w: 38, strength: 0.22 }
    ],
    {
      slope: 0.5,
      y0: 0,
      y1: 300,
      lift
    }
  )
  return r
}

/** Shaded blob stamped onto the (non-tiling) sky. */
function stampSky(r: Raster, mask: Raster, x: number, y: number, t: Tones) {
  // The sky is not tiled, so stamp once (stampShaded would repeat it across the seam, which is harmless here too).
  return stampShaded(r, mask, Math.round(x), y, t, { shade: [3, 3], hi: [2, 2] })
}

interface TrunkOpts {
  lean?: number
  flare?: number
  flareH?: number
  streaks?: number
}

/** A tall tapering trunk lit from the left, with bark streaks and root flare. */
function trunk(
  r: Raster,
  cx: number,
  top: number,
  bottom: number,
  wTop: number,
  wBot: number,
  t: Tones,
  seed: number,
  o: TrunkOpts = {}
) {
  const rnd = rng(seed)
  const tr = new Raster(r.w, r.h)
  const flare = o.flare ?? wBot * 0.5
  const flareH = o.flareH ?? 50
  for (let y = top; y <= bottom; y++) {
    const u = (y - top) / Math.max(1, bottom - top)
    const fy = Math.max(0, (y - (bottom - flareH)) / flareH)
    const w = wTop + (wBot - wTop) * u + flare * fy * fy
    const c = cx + (o.lean ?? 0) * u + Math.sin(y * 0.05 + seed) * 1.1
    const x0 = Math.round(c - w / 2)
    const x1 = Math.round(c + w / 2)
    const litW = Math.max(1, Math.round(w * 0.12))
    const shadeW = Math.max(2, Math.round(w * 0.24))
    for (let x = x0; x < x1; x++) {
      const kr = x1 - 1 - x
      tr.set(x, y, kr === 0 ? t.deep : kr < shadeW ? t.shade : x - x0 < litW ? t.hi : t.base)
    }
  }
  // Bark: vertical streaks and the odd knot, only on the base colour.
  for (let i = 0; i < (o.streaks ?? 26); i++) {
    const y = top + Math.floor(rnd() * (bottom - top))
    const len = 6 + Math.floor(rnd() * 16)
    const x = Math.round(cx - wBot * 0.3 + rnd() * wBot * 0.6)
    for (let k = 0; k < len; k++) if (tr.get(x, y + k) === t.base) tr.set(x, y + k, rnd() < 0.5 ? t.shade : t.base)
  }
  r.blit(tr)
}

/** A branch from (x, y) rising to (x + dx, y - dy), tapering, lit on top. */
function branch(r: Raster, x: number, y: number, dx: number, dy: number, w: number, t: Tones) {
  r.thick(x, y, x + dx, y - dy, w, t.base)
  r.thick(x, y, x + dx * 0.55, y - dy * 0.55, w + 1, t.base)
  r.line(x, y - w / 2, x + dx, y - dy - w / 2, t.hi)
  r.line(x, y + w / 2, x + dx, y - dy + w / 2, t.shade)
}

/** A rounded clump of foliage centred on (cx, cy): six overlapping lobes, shaded from the top-left. */
function clump(r: Raster, cx: number, cy: number, w: number, h: number, seed: number, t: Tones) {
  const rnd = rng(seed)
  const m = new Raster(w + 4, h + 4)
  const parts: [number, number, number, number][] = [[w / 2 + 2, h / 2 + 2, w * 0.3, h * 0.38]]
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5
    parts.push([
      w / 2 + 2 + Math.cos(a) * w * 0.28,
      h / 2 + 2 + Math.sin(a) * h * 0.24,
      w * (0.2 + rnd() * 0.06),
      h * (0.26 + rnd() * 0.08)
    ])
  }
  for (const [x, y, rx, ry] of parts) m.ellipse(x, y, rx, ry, 1)
  stampShaded(r, m, Math.round(cx - w / 2 - 2), Math.round(cy - h / 2 - 2), t, {
    shade: [3, 4],
    hi: [2, 2],
    deep: [5, 6]
  })
}

/** A hanging vine from (x, y), `len` px long, with leaves. */
function vine(r: Raster, x: number, y: number, len: number, seed: number) {
  const rnd = rng(seed)
  const ph = rnd() * 6
  for (let k = 0; k < len; k++) {
    const vx = Math.round(x + Math.sin(k * 0.12 + ph) * 2.2)
    r.set(vx, y + k, vineColor)
    if (k % 7 === 3) {
      const s = rnd() < 0.5 ? -1 : 1
      r.set(vx + s, y + k, vineLeaf)
      r.set(vx + s * 2, y + k + 1, vineLeaf)
    }
  }
  r.set(x + Math.round(Math.sin((len - 1) * 0.12 + ph) * 2.2), y + len, vineLeaf)
}

/** A fern frond fan whose root is (x, y). */
function fern(r: Raster, x: number, y: number, size: number, t: Tones, seed: number) {
  const rnd = rng(seed)
  const fronds = 6 + Math.round(rnd() * 2)
  for (let f = 0; f < fronds; f++) {
    const a = ((f / (fronds - 1)) * 2 - 1) * 1.25 + (rnd() - 0.5) * 0.15
    const len = size * (0.7 + 0.3 * Math.cos(a)) * (0.9 + rnd() * 0.2)
    for (let s = 0; s <= len; s++) {
      const u = s / len
      const px = x + Math.sin(a) * len * u * 1.1
      const py = y - Math.cos(a) * len * u + 0.55 * len * u * u
      r.set(px, py, t.shade)
      if (s % 2 === 0 && u > 0.15) {
        const ll = (1 - u) * 4 + 1.5
        const lit = a <= 0
        // Leaflets sweep back toward the tip.
        r.line(px, py, px - ll, py + ll * 0.5, lit ? t.hi : t.base)
        r.line(px, py, px + ll, py + ll * 0.5, lit ? t.base : t.shade)
      }
    }
  }
}

/** Low undergrowth that closes the bottom of a layer: a soft ridge with bushes. */
function undergrowth(r: Raster, base: number, amp: number, seed: number, tones: Tones, bush: Tones) {
  const top = liftTo(
    blurLine(
      ridgeLine(
        base + amp * 2,
        [
          { cycles: 5, amp, kind: 'noise' },
          { cycles: 12, amp: amp * 0.3 }
        ],
        seed
      ),
      2
    ),
    base
  )
  fillLand(r, top, { tones, rim: 1 })
  const rnd = rng(seed)
  scatter(14, seed + 1, 22, 1).forEach((x, i) => {
    plantBush(r, x, Math.round(top[x]) + 5, 22 + Math.round(rnd() * 18), 10 + Math.round(rnd() * 6), bush, seed + i)
  })
  return top
}

function farLayer(): BackdropLayer {
  const r = layerImage(0)
  const tones: Tones = { hi: farTrunk[0], base: farTrunk[1], shade: farTrunk[2], deep: farTrunk[3] }
  const xs = [58, 150, 254, 330, 436, 520, 590]
  xs.forEach((x, i) =>
    trunk(r, x, 0, r.h - 1, 12 + (i % 3) * 3, 18 + (i % 3) * 4, tones, 100 + i, {
      flare: 10,
      flareH: 40,
      streaks: 10,
      lean: ((i % 2) * 2 - 1) * 3
    })
  )
  // A few pale branches with leaf clumps, lost in the mist.
  const rnd = rng(7)
  const leaf: Tones = { hi: farLeaf[0], base: farLeaf[1], shade: farLeaf[2], deep: farLeaf[3] }
  xs.forEach((x, i) => {
    const side = i % 2 ? 1 : -1
    const by = 90 + Math.round(rnd() * 90)
    const dx = side * (24 + Math.round(rnd() * 16))
    branch(r, x + side * 5, by, dx, 10 + Math.round(rnd() * 8), 3, tones)
    clump(r, x + side * 5 + dx, by - 12, 30 + Math.round(rnd() * 12), 20, 200 + i, leaf)
  })
  undergrowth(
    r,
    236,
    10,
    31,
    { hi: farLeaf[1], base: farLeaf[2], shade: farLeaf[3], deep: farLeaf[3] },
    { hi: farLeaf[2], base: farLeaf[3], shade: farLeaf[4], deep: farLeaf[4] }
  )
  mist(r, 30, 50, HAZE[1], 0.75)
  mist(r, 150, 70, HAZE[4], 0.3)
  mist(r, 250, 60, HAZE[6], 0.45)
  shafts(
    r,
    [
      { x: 330, w: 80, strength: 0.34 },
      { x: 160, w: 50, strength: 0.26 },
      { x: 520, w: 56, strength: 0.28 }
    ],
    { slope: 0.5, y0: 0, y1: 330, lift }
  )
  fadeBottom(r, 40, farLeaf[3])
  return { image: r, parallax: 0.15, y: 0 }
}

function midLayer(): BackdropLayer {
  const r = layerImage(0)
  const tones: Tones = { hi: midTrunk[0], base: midTrunk[1], shade: midTrunk[2], deep: midTrunk[3] }
  const leaf: Tones = { hi: midLeaf[0], base: midLeaf[1], shade: midLeaf[2], deep: midLeaf[3] }
  const rnd = rng(3)
  const spec: [number, number, number, number][] = [
    // x, top width, bottom width, lean
    [120, 20, 28, 3],
    [300, 22, 32, -4],
    [470, 18, 26, 3],
    [580, 20, 28, -2]
  ]
  spec.forEach(([x, wt, wb, lean], i) => {
    trunk(r, x, 0, r.h - 1, wt, wb, tones, 40 + i, { lean, flare: 14, flareH: 56, streaks: 24 })
    // Two or three branches with leaf tufts, and hanging vines under them.
    for (let b = 0; b < 3; b++) {
      const side = (b + i) % 2 ? 1 : -1
      const by = 70 + b * 62 + Math.round(rnd() * 24)
      const dx = side * (28 + Math.round(rnd() * 22))
      const dy = 12 + Math.round(rnd() * 14)
      const sx = x + side * (wt / 2 - 1) + (lean * by) / r.h
      branch(r, sx, by, dx, dy, 4, tones)
      clump(r, sx + dx, by - dy - 8, 36 + Math.round(rnd() * 14), 24 + Math.round(rnd() * 6), 500 + i * 7 + b, leaf)
      for (let v = 0; v < 2; v++)
        vine(
          r,
          sx + dx * (0.45 + v * 0.45) + (rnd() - 0.5) * 4,
          by - dy * (0.45 + v * 0.45) + 3,
          24 + Math.round(rnd() * 44),
          900 + i * 17 + b * 3 + v
        )
    }
  })
  undergrowth(
    r,
    250,
    10,
    52,
    { hi: midLeaf[1], base: midLeaf[2], shade: midLeaf[3], deep: midLeaf[3] },
    { hi: midLeaf[2], base: midLeaf[3], shade: midLeaf[4], deep: midLeaf[4] }
  )
  mist(r, 36, 44, HAZE[2], 0.45)
  mist(r, 262, 40, HAZE[5], 0.35)
  fadeBottom(r, 40, midLeaf[3])
  return { image: r, parallax: 0.3, y: 0 }
}

function nearLayer(): BackdropLayer {
  const r = layerImage(0)
  const tones: Tones = { hi: R.forestDeep[0], base: R.forestDeep[1], shade: R.forestDeep[2], deep: R.forestDeep[3] }
  const spec: [number, number, number, number][] = [
    [86, 30, 38, 2],
    [258, 28, 36, -3],
    [424, 32, 40, 3],
    [566, 26, 34, -2]
  ]
  spec.forEach(([x, wt, wb, lean], i) =>
    trunk(r, x, 0, r.h - 1, wt, wb, tones, 70 + i, { lean, flare: 22, flareH: 64, streaks: 36 })
  )
  const ground = undergrowth(
    r,
    262,
    9,
    75,
    { hi: R.forestDeep[1], base: R.forestDeep[2], shade: R.forestDeep[3], deep: R.forestDeep[3] },
    { hi: R.forestDeep[2], base: R.forestDeep[3], shade: R.forestDeep[4], deep: R.forestDeep[4] }
  )
  const fernTones: Tones = { hi: R.forestDeep[0], base: R.forestDeep[1], shade: R.forestDeep[2], deep: R.forestDeep[3] }
  scatter(10, 5, 40, 0.9).forEach((x, i) => fern(r, x, Math.round(ground[x]) + 8, 24 + (i % 3) * 5, fernTones, 400 + i))
  fadeBottom(r, 60, R.forestDeep[4])
  return { image: r, parallax: 0.55, y: 0 }
}

/** Dark leaves hanging from the top edge, in front of everything. */
function leavesFront(): BackdropLayer {
  const h = 64
  const r = new Raster(W, h)
  const rnd = rng(12)
  const dark = R.forestDeep
  scatter(10, 6, 40, 0.9).forEach((x) => {
    const stems = 3 + Math.round(rnd() * 2)
    for (let s = 0; s < stems; s++) {
      const sx = x + (s - stems / 2) * 9 + Math.round((rnd() - 0.5) * 6)
      const len = 10 + Math.round(rnd() * 30)
      r.line(sx, 0, sx + (rnd() - 0.5) * 6, len, dark[3])
      const lw = 3 + Math.round(rnd() * 2)
      const lx = sx + (rnd() - 0.5) * 6
      // hanging leaf: a pointed ellipse
      r.poly([lx, len + 14, lx - lw, len + 4, lx, len - 2, lx + lw, len + 4], dark[3])
      r.poly([lx, len + 12, lx - lw + 1, len + 5, lx, len, lx, len + 4], dark[2])
    }
  })
  // A band of dark foliage along the very top.
  for (let x = 0; x < W; x++) {
    const d = 3 + Math.round(noiseAt(x >> 2, 1, 5) * 7) + Math.round(Math.sin((x / W) * Math.PI * 12) * 2)
    for (let y = 0; y < d; y++) r.set(x, y, y === d - 1 ? dark[2] : dark[3])
  }
  return { image: r, parallax: 1.2, y: 0, front: true }
}

export const backdrop: (() => Backdrop) | undefined = () => ({
  sky: sky(),
  layers: [farLayer(), midLayer(), nearLayer(), leavesFront()],
  ambience: 'leaves'
})
