import { R, color, ramp } from '../../palette'
import { Raster, noiseAt, rng } from '../../raster'
import type { Backdrop, BackdropLayer } from '../types'
import {
  W,
  fadeBottom,
  gradient,
  glow,
  layerImage,
  lightOn,
  periodic,
  pillar,
  ridgeLine,
  sagLine,
  scatter,
  skyImage,
  stampPoly,
  stampShaded,
  tiled,
  tintMap,
  wrapX,
  type Tones
} from './kit'

/**
 * Backdrop of the `cave` world (stage 4): the gang's hideout in a violet cave.
 * far  = the back wall with rock strata, a few glowing fissures and big crystal clusters,
 * mid  = stalagmites, stalactites and the hideout's wooden scaffolding with a rope bridge and hanging lanterns,
 * near = darker rock columns, front = a few stalactites hanging in front of everything.
 */

const wallFar = ramp('#4c3c6c', '#42345e', '#382c50', '#2c2240', '#1e1630')
const wallMid = ramp('#3a2c56', '#30244a', '#281e3c', '#201830', '#160f24')
const wallNear = ramp('#2a2040', '#221a36', '#1b142c', '#150f22', '#0e0918')
const timber = ramp('#6a4a58', '#563c4c', '#432e3e', '#32222f', '#221620')
const lampBody = ramp('#ffe9a0', '#f0b45a', '#c07a40', '#7a4a3a', '#3a2230')
const amethyst = ramp('#d8a8ec', '#b078d4', '#8c56b4', '#62388a', '#3a2058')
const aqua = ramp('#a4e4e4', '#62bccc', '#4590aa', '#2f6482', '#1c3c58')
const warmFrom = [wallFar[0], wallFar[1], wallFar[2], wallFar[3]]
const warmTo = [color('#6a4a66'), color('#5a3e5c'), color('#4a3250'), color('#382640')]

const tonesFar: Tones = { hi: wallFar[0], base: wallFar[1], shade: wallFar[2], deep: wallFar[3] }
const tonesMid: Tones = { hi: wallMid[0], base: wallMid[1], shade: wallMid[2], deep: wallMid[3] }
const tonesNear: Tones = { hi: wallNear[0], base: wallNear[1], shade: wallNear[2], deep: wallNear[3] }
const tonesWood: Tones = { hi: timber[0], base: timber[1], shade: timber[2], deep: timber[3] }

function sky() {
  const r = skyImage()
  gradient(r, [
    { at: 0, c: R.caveDeep[3] },
    { at: 110, c: wallFar[3] },
    { at: 210, c: wallFar[2] },
    { at: 300, c: wallFar[1] }
  ])
  // A faint warm glow low in the middle: the far end of the cavern.
  glow(r, 320, 238, 150, [color('#3e2c4c'), color('#4a3250'), color('#5a3a56'), color('#6a4660')], 1.3)
  return r
}

/** A pointed rock spike. `up` = stalagmite (base at y0, tip above), otherwise a stalactite hanging from y0. */
function spike(r: Raster, cx: number, y0: number, h: number, w: number, up: boolean, t: Tones, seed: number, lean = 0) {
  const n = 14
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const half = (w / 2) * Math.pow(1 - u, 1.35) + (i > 0 && i < n ? (noiseAt(i, seed, 3) - 0.5) * 1.6 : 0)
    const y = up ? y0 - h * u : y0 + h * u
    const x = cx + lean * u
    left.push(x - half, y)
    right.unshift(x + half, y)
  }
  stampPoly(r, [...left, ...right], t, { shade: [3, 1], hi: [1, 1] })
}

/** A cluster of one tall and a few shorter spikes sharing a base. */
function spikes(r: Raster, cx: number, y0: number, h: number, w: number, up: boolean, t: Tones, seed: number) {
  const rnd = rng(seed)
  const parts = [
    [-0.34, 0.6, 0.55],
    [0.36, 0.5, 0.5],
    [-0.08, 1, 0.7]
  ]
  for (const [ox, hh, ww] of parts) {
    spike(r, cx + ox * w, y0, h * hh * (0.9 + rnd() * 0.2), w * ww, up, t, seed + 7, (rnd() - 0.5) * 4)
  }
}

/** One crystal prism: body with a pointed cap, left face lit, right face shaded. (x, y) = bottom centre. */
function crystal(r: Raster, x: number, y: number, h: number, w: number, tilt: number, c: typeof amethyst) {
  const t: Tones = { hi: c[0], base: c[1], shade: c[2], deep: c[3] }
  const shoulder = y - h * 0.72
  const body = [
    x - w / 2,
    y,
    x + w / 2,
    y,
    x + w / 2 + tilt * 0.6,
    shoulder,
    x + tilt,
    y - h,
    x - w / 2 + tilt * 0.6,
    shoulder
  ]
  stampPoly(r, body, t, { shade: [2, 2], hi: [1, 1] })
  // right facet
  tiled((dx) => {
    const facet = new Raster(Math.ceil(w) + 8, Math.ceil(h) + 4)
    const ox = Math.floor(x - w / 2) - 2
    const oy = Math.floor(y - h) - 1
    facet.poly(
      [
        x - ox + 0.5,
        y - oy,
        x + w / 2 - ox,
        y - oy,
        x + w / 2 + tilt * 0.6 - ox,
        shoulder - oy,
        x + tilt - ox,
        y - h - oy,
        x + tilt * 0.8 - ox,
        shoulder - oy
      ],
      1
    )
    for (let j = 0; j < facet.h; j++)
      for (let i = 0; i < facet.w; i++)
        if (facet.get(i, j) && r.get(wrapX(ox + i + dx), oy + j)) r.set(ox + i + dx, oy + j, c[2])
  })
}

function crystalCluster(r: Raster, x: number, y: number, size: number, c: typeof amethyst, seed: number) {
  const rnd = rng(seed)
  const list: [number, number, number, number][] = [
    [-0.55, 0.55, 0.3, -2],
    [0.5, 0.6, 0.3, 3],
    [-0.2, 1, 0.38, -1],
    [0.2, 0.78, 0.32, 2]
  ]
  for (const [ox, hh, ww, tilt] of list)
    crystal(r, x + ox * size * 0.5, y + 1, size * hh * (0.9 + rnd() * 0.2), Math.max(4, size * ww), tilt, c)
}

function farWall(): BackdropLayer {
  const y = 0
  const r = layerImage(y)
  r.rect(0, 0, W, r.h, wallFar[2])
  // Rock strata: wavy bands with a lit rim at the top of each ledge.
  const bands = [62, 90, 112, 140, 164, 192, 214, 246, 280, 320]
  const tops = bands.map((b, i) =>
    ridgeLine(
      b,
      [
        { cycles: 2 + (i % 3), amp: 6, kind: 'sine', phase: i * 0.31 },
        { cycles: 9 + i, amp: 2.4 }
      ],
      40 + i * 17
    ).map((v) => Math.round(v))
  )
  tops.forEach((line, i) => {
    const tone = i % 3 === 0 ? tonesFar.base : i % 3 === 1 ? tonesFar.shade : tonesFar.base
    for (let x = 0; x < W; x++) {
      const next = tops[i + 1] ? tops[i + 1][x] : r.h
      for (let yy = line[x]; yy < next; yy++)
        r.set(x, yy, yy === line[x] && tone === tonesFar.base ? tonesFar.hi : tone)
      // a dark crack line under each ledge
      if (i > 0 && next - 1 < r.h) r.set(x, next - 1 + (i < tops.length - 1 ? 0 : 0), tonesFar.deep)
    }
  })
  // Warm firelight from far down the tunnels, on the rock.
  for (const [gx, gy] of [
    [170, 236],
    [470, 244]
  ])
    lightOn(r, gx, gy, 90, 2.2, tintMap(warmFrom, warmTo), 0.7)
  // Crystal clusters, glowing softly onto the rock around them.
  const clusters: [number, number, number, typeof amethyst][] = [
    [58, 204, 52, amethyst],
    [176, 166, 34, aqua],
    [262, 226, 40, amethyst],
    [384, 208, 58, amethyst],
    [470, 150, 30, aqua],
    [556, 200, 48, aqua],
    [612, 120, 26, amethyst]
  ]
  for (const [cx, cy, size] of clusters) lightOn(r, cx, cy - size * 0.5, size * 1.7, 2.2, undefined, 0.8)
  for (const [cx, cy, size, c] of clusters) {
    // ledge of rock under the cluster
    stampPoly(
      r,
      [cx - size * 0.8, cy + 8, cx - size * 0.5, cy - 2, cx + size * 0.5, cy - 2, cx + size * 0.8, cy + 8],
      tonesFar,
      { shade: [3, 2], hi: [1, 1] }
    )
    crystalCluster(r, cx, cy, size, c, cx)
  }
  fadeBottom(r, 40, wallFar[3])
  return { image: r, parallax: 0.06, y }
}

/** Wooden scaffold: posts and cross beams hanging in the mid distance. (x, y) = top-left of the frame. */
function scaffold(r: Raster, x: number, y: number, w: number, h: number) {
  // two posts, a top beam, a mid beam and diagonal braces
  const post = (px: number) =>
    stampShaded(r, rectMask(4, h), px, y, tonesWood, { shade: [3, 0], hi: [1, 0], deep: [1, 0] })
  post(x)
  post(x + w - 4)
  const beam = (by: number, bw = w + 6) =>
    stampShaded(r, rectMask(bw, 4), x - 3, by, tonesWood, { shade: [0, 3], hi: [0, 1], deep: [0, 1] })
  beam(y)
  beam(y + Math.round(h * 0.55))
  tiled((dx) => {
    r.line(x + 3 + dx, y + 3, x + w - 4 + dx, y + Math.round(h * 0.55), timber[3])
    r.line(x + w - 4 + dx, y + 3, x + 3 + dx, y + Math.round(h * 0.55), timber[3])
  })
}

const rectMask = (w: number, h: number) => new Raster(w, h).rect(0, 0, w, h, 1)

/** A small hanging lantern with a dithered warm halo. (x, y) = top of its rope. */
function lantern(r: Raster, x: number, y: number, rope: number) {
  const ly = y + rope
  glow(r, x, ly + 4, 20, [color('#40304c'), color('#5c3c52'), color('#80505a'), color('#a2685c')], 1.1)
  tiled((dx) => {
    r.line(x + dx, y, x + dx, ly, timber[3])
    r.rect(x - 2 + dx, ly, 5, 1, timber[2])
    r.rect(x - 2 + dx, ly + 1, 5, 5, lampBody[2])
    r.rect(x - 1 + dx, ly + 2, 3, 3, lampBody[1])
    r.set(x + dx, ly + 3, lampBody[0])
    r.rect(x - 2 + dx, ly + 6, 5, 1, timber[2])
  })
}

function midRock(): BackdropLayer {
  const y = 40
  const r = layerImage(y)
  // floor line behind the ground (seen in pits) with stalagmites rising from it
  const floor = ridgeLine(
    228,
    [
      { cycles: 5, amp: 8, kind: 'sine', phase: 0.1 },
      { cycles: 12, amp: 3 }
    ],
    17
  )
  for (let x = 0; x < W; x++) for (let yy = Math.round(floor[x]); yy < r.h; yy++) r.set(x, yy, tonesMid.shade)
  const slots = scatter(9, 21, 28, 0.8)
  slots.forEach((x, i) => {
    const h = 54 + Math.round(noiseAt(i, 3, 9) * 56)
    spikes(r, x, Math.round(floor[x]) + 6, h, 30 + Math.round(noiseAt(i, 4, 9) * 22), true, tonesMid, 50 + i)
  })
  // stalactites from the top, a few long enough to meet a stalagmite and form a column
  const hang = scatter(11, 33, 20, 0.8)
  hang.forEach((x, i) => {
    const h = 34 + Math.round(noiseAt(i, 5, 9) * 56)
    spikes(r, x, -4, h, 26 + Math.round(noiseAt(i, 6, 9) * 18), false, tonesMid, 80 + i)
  })
  // Rock columns that join floor and ceiling at two spots.
  for (const x of [118, 438]) {
    pillar(r, x - 13, 0, 26, r.h, tonesMid)
    spikes(r, x, 0, 46, 54, false, tonesMid, x)
    spikes(r, x, Math.round(floor[x]) + 4, 56, 56, true, tonesMid, x + 1)
  }
  // Scaffolding, a rope bridge and lanterns on the hideout side.
  scaffold(r, 190, 50, 60, 96)
  scaffold(r, 350, 36, 46, 70)
  scaffold(r, 560, 46, 52, 84)
  // rope bridge between two scaffolds: two ropes and planks
  const bx0 = 250
  const bx1 = 352
  const by = 60
  sagLine(r, bx0, by, bx1, by, 9, timber[2])
  sagLine(r, bx0, by - 8, bx1, by - 8, 5, timber[1])
  for (let x = bx0 + 3; x < bx1 - 2; x += 4) {
    const u = (x - bx0) / (bx1 - bx0)
    const yy = by + Math.sin(u * Math.PI) * 9
    r.rect(x, Math.round(yy), 3, 1, timber[1])
    r.line(x + 1, Math.round(yy) - 1, x + 1, Math.round(by - 8 + Math.sin(u * Math.PI) * 5), timber[3])
  }
  // lanterns
  lantern(r, 222, 56, 16)
  lantern(r, 372, 44, 12)
  lantern(r, 588, 52, 20)
  lantern(r, 300, 70, 10)
  lantern(r, 60, 4, 38)
  lantern(r, 520, 4, 30)
  fadeBottom(r, 40, tonesMid.deep)
  return { image: r, parallax: 0.25, y }
}

function nearColumns(): BackdropLayer {
  const y = 20
  const r = layerImage(y)
  const xs = scatter(4, 14, 60, 0.5)
  xs.forEach((cx, i) => {
    const w = 20 + Math.round(noiseAt(i, 2, 4) * 14)
    const m = new Raster(w + 24, r.h)
    const mid = r.h * 0.48
    for (let yy = 0; yy < r.h; yy++) {
      const u = Math.abs(yy - mid) / mid
      const half = (w / 2) * (0.62 + 0.55 * Math.pow(u, 2.2)) + (periodic(yy * 3, 24, i * 7) - 0.5) * 3
      const off = (periodic(yy * 3, 8, i * 5) - 0.5) * 6
      for (let xx = Math.round(m.w / 2 + off - half); xx <= Math.round(m.w / 2 + off + half); xx++) m.set(xx, yy, 1)
    }
    stampShaded(r, m, cx - Math.floor(m.w / 2), 0, tonesNear, { shade: [4, 0], hi: [2, 0], deep: [1, 0] })
  })
  fadeBottom(r, 36, tonesNear.deep)
  return { image: r, parallax: 0.5, y }
}

function frontSpikes(): BackdropLayer {
  const h = 84
  const r = new Raster(W, h)
  const dark: Tones = { hi: color('#1a1326'), base: color('#140e1e'), shade: color('#100a18'), deep: color('#0c0712') }
  scatter(7, 8, 40, 0.9).forEach((x, i) => {
    spike(r, x, 0, 26 + Math.round(noiseAt(i, 8, 2) * 50), 16 + Math.round(noiseAt(i, 9, 2) * 14), false, dark, 120 + i)
  })
  scatter(10, 19, 24, 1).forEach((x, i) =>
    spike(r, x, 0, 10 + Math.round(noiseAt(i, 1, 6) * 14), 10, false, dark, 150 + i)
  )
  // a solid dark rim along the very top edge
  r.rect(0, 0, W, 6, dark.deep)
  return { image: r, parallax: 1.2, y: 0, front: true }
}

export const backdrop: (() => Backdrop) | undefined = () => ({
  sky: sky(),
  layers: [farWall(), midRock(), nearColumns(), frontSpikes()],
  ambience: 'dust'
})
