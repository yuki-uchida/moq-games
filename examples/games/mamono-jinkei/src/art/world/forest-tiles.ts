/**
 * Stage 4 terrain: 月影の森と白銀の砦. Every tile is 64×64 and periodic in 8×8 tiles so variants can be cached.
 * Ground kinds (forest, path, snow, ice, floor) blend by priority: the higher material carves an irregular edge into
 * its own tile that reveals the lower neighbour's base, with a lit / shaded lip. Masses (thicket, fortwall) are drawn
 * over the ground their neighbours share.
 */
import { TILE_FRAMES } from '../contract'
import type { TileQuery } from '../index'
import { C, DARKER, R } from '../palette'
import { Raster, bayer, rng } from '../raster'
import type { TileKind } from '../../vocab'
import { ih, mod, noisePatch, paintSlabs, slabLayout, T, vn1, vnoise } from './gfx'

const NG = R.nightGround
const NL = R.nightLeaf
const SN = R.snow
const IC = R.ice
const ST = R.steel
const WD = R.wood

const cache = new Map<string, Raster>()
const memo = (key: string, make: () => Raster) => {
  let r = cache.get(key)
  if (!r) cache.set(key, (r = make()))
  return r
}

const N = 0
const NE = 1
const E = 2
const SE = 3
const Sx = 4
const SW = 5
const Wx = 6
const NW = 7

const PRIO: Partial<Record<TileKind, number>> = { forest: 0, path: 1, snow: 2, ice: 3, floor: 4 }
const isMass = (k?: TileKind) => k === 'thicket' || k === 'fortwall'
const isWaterish = (k?: TileKind) => k === 'water' || k === 'pit' || k === undefined

const SM = Float32Array.from({ length: 65 }, (_, i) => (i / 64) * (i / 64) * (3 - (2 * i) / 64))

/** One periodic value-noise layer over the tile plus a one pixel margin (66 × 66), like gfx.noisePatch. */
function noise66(ox: number, oy: number, cell: number, seed: number) {
  const out = new Float32Array(66 * 66)
  const n = 512 / cell
  const m = Math.ceil(66 / cell) + 2
  const gx0 = Math.floor((ox - 1) / cell)
  const gy0 = Math.floor((oy - 1) / cell)
  const lat = new Float32Array(m * m)
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) lat[j * m + i] = ih(mod(gx0 + i, n), mod(gy0 + j, n), seed)
  const gis = new Int32Array(66)
  const fxs = new Float32Array(66)
  for (let x = 0; x < 66; x++) {
    const wx = ox - 1 + x
    gis[x] = Math.floor(wx / cell) - gx0
    fxs[x] = SM[Math.floor((mod(wx, cell) / cell) * 64)]
  }
  for (let y = 0; y < 66; y++) {
    const wy = oy - 1 + y
    const row = (Math.floor(wy / cell) - gy0) * m
    const fy = SM[Math.floor((mod(wy, cell) / cell) * 64)]
    for (let x = 0; x < 66; x++) {
      const gi = gis[x]
      const fx = fxs[x]
      const a = lat[row + gi]
      const c = lat[row + m + gi]
      out[y * 66 + x] =
        a + (lat[row + gi + 1] - a) * fx + (c - a) * fy + (a - lat[row + gi + 1] - c + lat[row + m + gi + 1]) * fx * fy
    }
  }
  return out
}

/** Weighted sum of noise layers, sampled with a one pixel margin: f(x, y) for x, y in -1..64. */
function field(ox: number, oy: number, layers: [number, number, number][]) {
  const g = new Float32Array(66 * 66)
  for (const [cell, seed, w] of layers) {
    const l = noise66(ox, oy, cell, seed)
    for (let i = 0; i < g.length; i++) g[i] += l[i] * w
  }
  return (x: number, y: number) => g[(y + 1) * 66 + x + 1]
}

// ---------------------------------------------------------------- forest floor

function needle(r: Raster, x: number, y: number, dir: number, c: number) {
  r.set(x, y, c)
  r.set(x + dir, y + 1, c)
  r.set(x + 2 * dir, y + 1, c)
}

/** Scatters small details on world-aligned cells so they continue across tile borders. */
function scatter(
  ox: number,
  oy: number,
  cell: number,
  seed: number,
  prob: number,
  draw: (x: number, y: number, h: number) => void
) {
  const n = 512 / cell
  for (let cy = Math.floor((oy - 10) / cell); cy <= Math.floor((oy + T + 10) / cell); cy++)
    for (let cx = Math.floor((ox - 10) / cell); cx <= Math.floor((ox + T + 10) / cell); cx++) {
      const mx = mod(cx, n)
      const my = mod(cy, n)
      if (ih(mx, my, seed) > prob) continue
      const px = cx * cell + 2 + Math.floor(ih(mx, my, seed + 1) * (cell - 4)) - ox
      const py = cy * cell + 2 + Math.floor(ih(mx, my, seed + 2) * (cell - 4)) - oy
      draw(px, py, ih(mx, my, seed + 3))
    }
}

/** A small rounded snow mound: lit crest, shaded foot. `cast` adds a ground shadow for dark floors. */
function mound(r: Raster, x: number, y: number, rx: number, ry: number, cast: number) {
  if (cast) r.ellipse(x + 1.5, y + 1.6, rx, ry, cast)
  r.ellipse(x + 0.5, y + 0.8, rx, ry, SN[2])
  r.ellipse(x, y, rx, ry, SN[1])
  r.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.5, ry * 0.45, SN[0])
  r.set(x + rx - 1, y + 1, SN[2])
}

function twig(r: Raster, x: number, y: number, h: number, snowTop: boolean) {
  const len = 5 + Math.floor(h * 4)
  const dir = h < 0.5 ? 1 : -1
  for (let i = 0; i < len; i++) {
    r.set(x + i * dir, y + (i > 2 ? 1 : 0), WD[2])
    r.set(x + i * dir, y + (i > 2 ? 2 : 1), NG[3])
  }
  r.set(x + 2 * dir, y - 1, WD[2])
  r.set(x + 3 * dir, y - 2, WD[2])
  r.set(x + 1 * dir, y, WD[2])
  if (snowTop) {
    r.set(x + 1 * dir, y - 1, SN[0])
    r.set(x + 3 * dir, y - 3, SN[1])
    r.set(x + 4 * dir, y, SN[0])
  }
}

function glint(r: Raster, x: number, y: number, big: boolean) {
  r.set(x, y, C.white)
  if (big)
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ] as const)
      r.set(x + dx, y + dy, IC[1])
}

function pebble(r: Raster, x: number, y: number) {
  r.rect(x, y + 1, 4, 2, NG[0])
  r.rect(x, y, 3, 2, ST[2])
  r.set(x, y, ST[1])
  r.set(x + 1, y, ST[0])
  r.set(x + 3, y + 2, NG[3])
  r.set(x, y - 1, SN[0])
  r.set(x + 1, y - 1, SN[1])
  r.set(x + 2, y - 1, SN[0])
}

function print(r: Raster, x: number, y: number) {
  r.ellipse(x + 0.5, y + 0.8, 1.7, 2.3, SN[0])
  r.ellipse(x, y, 1.7, 2.3, SN[2])
  r.set(x, y - 1, SN[3])
}

function fern(r: Raster, x: number, y: number) {
  for (const [dx, dy, c] of [
    [0, 0, NL[2]],
    [1, 0, NL[1]],
    [2, 0, NL[2]],
    [-1, -1, NL[1]],
    [0, -1, NL[0]],
    [1, -1, NL[1]],
    [2, -1, NL[0]],
    [3, -1, NL[1]],
    [0, -2, NL[1]],
    [2, -2, NL[0]],
    [1, 1, NL[3]],
    [2, 1, NL[3]],
    [0, 1, NL[3]]
  ] as const)
    r.set(x + dx, y + dy, c)
}

function forestBase(tx: number, ty: number) {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  return memo(`fb${a},${b}`, () => {
    const ox = a * T
    const oy = b * T
    const r = new Raster(T, T)
    // a calm, low-contrast ground: a wide dithered drift between two close tones, and fine mottling
    const soil = field(ox, oy, [
      [64, 1, 0.25],
      [32, 3, 0.3],
      [8, 2, 0.45]
    ])
    const moss = field(ox, oy, [
      [16, 7, 0.55],
      [8, 8, 0.45]
    ])
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const s = soil(x, y) + (bayer(x, y) - 0.5) * 0.3
        let c: number = s < 0.36 ? NG[2] : NG[1]
        if (s > 0.68) c = NG[0]
        if (moss(x, y) > 0.8 && bayer(x + 1, y) < 0.6) c = NL[2]
        r.set(x, y, c)
      }
    // roots with snow lying on top
    scatter(ox, oy, 64, 31, 0.5, (px, py, h) => {
      const dir = h < 0.5 ? 1 : -1
      for (let i = 0; i < 18; i++) {
        const x = px + i * dir
        const y = py + Math.round(Math.sin(i * 0.38) * 3) + (i > 12 ? 1 : 0)
        const w = i < 3 || i > 14 ? 1 : 2
        for (let k = 0; k < w; k++) r.set(x, y + k, k === 0 ? NG[3] : NG[4])
        r.set(x, y + w, NG[0])
        if (i > 2 && i < 15 && i % 3 !== 2) r.set(x, y - 1, i % 2 ? SN[1] : SN[0])
      }
    })
    scatter(ox, oy, 64, 41, 0.45, (px, py, h) => mound(r, px, py, 2.2 + h * 2.6, 1.3 + h * 1.1, NG[3]))
    scatter(ox, oy, 32, 51, 0.34, (px, py, h) => twig(r, px, py, h, h > 0.4))
    scatter(ox, oy, 16, 61, 0.55, (px, py, h) => {
      const dir = h < 0.5 ? 1 : -1
      needle(r, px, py, dir, h < 0.4 ? NG[3] : h < 0.7 ? NL[3] : NG[0])
      needle(r, px + 3 * dir, py + 2, -dir, NG[3])
      r.set(px - dir, py + 2, NG[0])
    })
    scatter(ox, oy, 32, 71, 0.4, (px, py) => fern(r, px, py))
    scatter(ox, oy, 32, 81, 0.3, (px, py, h) => {
      if (h < 0.5) pebble(r, px, py)
      else {
        r.rect(px, py, 3, 2, WD[4])
        r.set(px, py, WD[3])
        r.set(px + 1, py + 2, NG[4])
      }
    })
    scatter(ox, oy, 16, 91, 0.5, (px, py, h) => {
      r.set(px, py, h < 0.5 ? SN[1] : SN[0])
      if (h > 0.7) r.set(px + 1, py, SN[2])
    })
    scatter(ox, oy, 64, 101, 0.45, (px, py) => {
      for (let i = 0; i < 6; i++) r.set(px + i, py + (i % 2), NL[3])
      r.set(px + 2, py - 1, NL[2])
    })
    return r
  })
}

// ---------------------------------------------------------------- snow

function snowBase(tx: number, ty: number) {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  return memo(`sb${a},${b}`, () => {
    const ox = a * T
    const oy = b * T
    const r = new Raster(T, T)
    // a gentle drift: two close tones blended by a wide dither, hollows only a hint darker
    const n = field(ox, oy, [
      [64, 21, 0.45],
      [32, 22, 0.35],
      [16, 23, 0.2]
    ])
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const v = n(x, y) + (bayer(x, y) - 0.5) * 0.2
        let c: number = SN[1]
        if (v > 0.66) c = SN[0]
        else if (v < 0.3) c = SN[2]
        r.set(x, y, c)
      }
    // wind ripples: thin curved lines with a lit edge
    scatter(ox, oy, 32, 111, 0.55, (px, py, h) => {
      const len = 8 + Math.floor(h * 10)
      for (let i = 0; i < len; i++) {
        const yy = py + Math.round(Math.sin(i * 0.45) * 1.2)
        r.set(px + i, yy, SN[2])
        if (i % 3 !== 1) r.set(px + i, yy - 1, SN[0])
      }
    })
    scatter(ox, oy, 32, 121, 0.55, (px, py, h) => mound(r, px, py, 3 + h * 4, 1.8 + h * 1.6, 0))
    scatter(ox, oy, 64, 131, 0.5, (px, py, h) => {
      const dx = h < 0.5 ? 5 : -5
      print(r, px, py)
      print(r, px + dx, py + 5)
      print(r, px + dx * 2, py + 2)
    })
    scatter(ox, oy, 64, 141, 0.4, (px, py, h) => twig(r, px, py, h, true))
    scatter(ox, oy, 32, 151, 0.4, (px, py, h) => {
      needle(r, px, py, h < 0.5 ? 1 : -1, NL[3])
      needle(r, px + 4, py + 3, h < 0.5 ? -1 : 1, NG[3])
    })
    scatter(ox, oy, 64, 161, 0.4, (px, py, h) => {
      if (h < 0.6) pebble(r, px, py)
    })
    scatter(ox, oy, 16, 171, 0.5, (px, py, h) => glint(r, px, py, h > 0.5))
    return r
  })
}

// ---------------------------------------------------------------- path

function pathBase(tx: number, ty: number) {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  return memo(`pb${a},${b}`, () => {
    const ox = a * T
    const oy = b * T
    const r = new Raster(T, T)
    const n = field(ox, oy, [
      [32, 41, 0.6],
      [16, 42, 0.4]
    ])
    const mud = field(ox, oy, [
      [32, 43, 0.6],
      [8, 44, 0.4]
    ])
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const v = n(x, y) + (bayer(x, y) - 0.5) * 0.05
        let c = SN[2]
        if (v > 0.5) c = SN[1]
        else if (v < 0.24) c = SN[3]
        const m = mud(x, y)
        if (m > 0.8) c = SN[3]
        r.set(x, y, c)
      }
    // footprints: paired oval dents with a lit lower rim
    for (let cy = Math.floor((oy - 6) / 32); cy <= Math.floor((oy + T + 6) / 32); cy++)
      for (let cx = Math.floor((ox - 6) / 32); cx <= Math.floor((ox + T + 6) / 32); cx++) {
        const mx = mod(cx, 16)
        const my = mod(cy, 16)
        if (ih(mx, my, 51) > 0.38) continue
        const px = cx * 32 + 6 + Math.floor(ih(mx, my, 52) * 18) - ox
        const py = cy * 32 + 6 + Math.floor(ih(mx, my, 53) * 18) - oy
        const step = (x: number, y: number) => {
          r.ellipse(x + 0.5, y + 1.5, 2.6, 3.4, SN[1])
          r.ellipse(x, y + 0.6, 2.6, 3.4, SN[3])
          r.ellipse(x - 0.3, y - 0.2, 1.7, 2.6, SN[2])
        }
        step(px, py)
        step(px + 7, py + 4)
      }
    // sticks and bare earth flecks
    const rn = rng(a * 37 + b * 11 + 9)
    for (let i = 0; i < 5; i++) {
      const x = 4 + Math.floor(rn() * 54)
      const y = 4 + Math.floor(rn() * 54)
      r.rect(x, y, 3, 1, NG[2])
      r.set(x + 1, y + 1, NG[3])
    }
    return r
  })
}

// ---------------------------------------------------------------- ice

function iceBase(tx: number, ty: number) {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  return memo(`ib${a},${b}`, () => {
    const ox = a * T
    const oy = b * T
    const r = new Raster(T, T)
    const n = field(ox, oy, [
      [64, 61, 0.55],
      [32, 62, 0.45]
    ])
    const fade = field(ox, oy, [[64, 63, 1]])
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const v = n(x, y) + (bayer(x, y) - 0.5) * 0.05
        let c = IC[1]
        if (v < 0.36) c = IC[2]
        else if (v > 0.66) c = IC[0]
        // glossy diagonal reflections that fade in and out
        const u = mod(ox + x + oy + y, 128)
        if (fade(x, y) > 0.42) {
          if (u >= 30 && u < 37) c = u < 35 ? IC[0] : c
          else if (u >= 41 && u < 43) c = IC[0]
          else if (u >= 90 && u < 93) c = IC[0]
        }
        r.set(x, y, c)
      }
    // cracks: jagged dark lines with a pale underside
    for (let cy = Math.floor((oy - 40) / 128); cy <= Math.floor((oy + T) / 128); cy++)
      for (let cx = Math.floor((ox - 40) / 128); cx <= Math.floor((ox + T) / 128); cx++) {
        const mx = mod(cx, 4)
        const my = mod(cy, 4)
        if (ih(mx, my, 71) > 0.8) continue
        const rn = rng(mx * 97 + my * 13 + 1)
        let x = cx * 128 + 20 + Math.floor(rn() * 88)
        let y = cy * 128 + 20 + Math.floor(rn() * 88)
        let dx = rn() < 0.5 ? 1 : -1
        const dy = 1
        const len = 30 + Math.floor(rn() * 30)
        const branch = Math.floor(len * (0.3 + rn() * 0.4))
        const walk = (sx: number, sy: number, sdx: number, n: number) => {
          let px = sx
          let py = sy
          for (let i = 0; i < n; i++) {
            r.set(px - ox, py - oy, IC[3])
            r.set(px - ox + 1, py - oy + 1, IC[0])
            const t = rn()
            if (t < 0.45) px += sdx
            else if (t < 0.8) py += dy
            else {
              px += sdx
              py += dy
            }
          }
          return [px, py]
        }
        const main = walk(x, y, dx, branch)
        x = main[0]
        y = main[1]
        walk(x, y, dx, len - branch)
        dx = -dx
        walk(x, y, dx, Math.floor(len * 0.4))
      }
    // trapped air bubbles
    const rn = rng(a * 53 + b * 29 + 3)
    for (let i = 0; i < 6; i++) {
      const x = 3 + Math.floor(rn() * 58)
      const y = 3 + Math.floor(rn() * 58)
      r.set(x, y, IC[0])
      if (rn() < 0.5) r.set(x + 1, y, IC[0])
      r.set(x, y + 1, IC[3])
    }
    return r
  })
}

// ---------------------------------------------------------------- floor (courtyard flagstones)

const FLAG = [ST[1], ST[2], NG[0], NG[3]] as const

function floorBase(tx: number, ty: number) {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  return memo(`fl${a},${b}`, () => {
    const r = new Raster(T, T)
    const slabs = slabLayout(tx, ty, T, 5)
    paintSlabs(r, slabs, FLAG)
    const rn = rng(a * 53 + b * 7 + 1)
    for (const s of slabs) {
      for (let i = 0; i < 4; i++) {
        const x = s.x0 + 3 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 6))
        const y = s.y0 + 3 + Math.floor(rn() * Math.max(1, s.y1 - s.y0 - 6))
        if (r.get(x, y) === ST[2]) {
          r.set(x, y, rn() < 0.5 ? NG[0] : ST[1])
          r.set(x + 1, y, r.get(x + 1, y) === ST[2] ? NG[0] : r.get(x + 1, y))
        }
      }
      if (rn() < 0.3) {
        const x = s.x0 + 5 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 10))
        const y = s.y0 + 4 + Math.floor(rn() * Math.max(1, s.y1 - s.y0 - 8))
        let cx = x
        let cy = y
        for (let i = 0; i < 7 + Math.floor(rn() * 7); i++) {
          r.set(cx, cy, NG[3])
          const t = rn()
          if (t < 0.5) cx += 1
          else if (t < 0.8) cy += 1
          else {
            cx += 1
            cy += 1
          }
        }
      }
      // snow dusting piled in the joints and corners
      if (rn() < 0.55) {
        const cx = rn() < 0.5 ? s.x1 - 3 : s.x0 + 3
        const cy = rn() < 0.5 ? s.y1 - 3 : s.y0 + 3
        const rx = 3 + rn() * 4
        r.ellipse(cx + 0.5, cy + 1, rx, 2.2, SN[2])
        r.ellipse(cx, cy + 0.2, rx, 2, SN[1])
        r.ellipse(cx - 1, cy - 0.5, rx * 0.55, 1, SN[0])
      }
    }
    return r
  })
}

// ---------------------------------------------------------------- ground blending

const bases: Record<string, (tx: number, ty: number) => Raster> = {
  forest: forestBase,
  snow: snowBase,
  path: pathBase,
  ice: iceBase,
  floor: floorBase
}

const RIM: Record<string, [number, number]> = {
  forest: [NG[2], NG[4]],
  snow: [SN[0], SN[2]],
  path: [SN[1], SN[3]],
  ice: [IC[0], IC[3]],
  floor: [ST[0], NG[3]]
}

/** Ground tile of `kind`: higher-priority neighbours bleed in with an irregular edge and a lit / shaded lip. */
function groundTile(q: TileQuery) {
  const kind = q.kind
  const a = q.around
  const higher = (i: number): TileKind | undefined => {
    const k = a[i]
    return k && PRIO[k] !== undefined && PRIO[k]! > PRIO[kind]! ? k : undefined
  }
  const sides = [N, E, Sx, Wx].map(higher)
  const diag = [NE, SE, SW, NW].map((d, i) => {
    const k = higher(d)
    const s1 = sides[i]
    const s2 = sides[(i + 1) % 4]
    return k && !s1 && !s2 ? k : undefined
  })
  const m = [a[N], a[Wx]].map((k) => (isMass(k) ? 1 : 0)).join('')
  const sig = [...sides, ...diag].map((k) => k?.[0] ?? '-').join('') + m
  const tx = mod(q.tx, 8)
  const ty = mod(q.ty, 8)
  return memo(`g${kind}${tx},${ty},${sig}`, () => {
    const own = bases[kind](q.tx, q.ty)
    if (sig === '--------00') return own
    const r = own.clone()
    const ox = tx * T
    const oy = ty * T
    const depthOf = (k: TileKind, w: number, seed: number) =>
      k === 'floor' ? 1 + (vn1(w, 8, seed) > 0.6 ? 1 : 0) : 5 + Math.floor(vn1(w, 14, seed) * 9)
    const rad = [0, 1, 2, 3].map((i) => 9 + Math.floor(ih(q.tx, q.ty, 90 + i) * 7))
    const rises = new Map<TileKind, Raster>()
    const baseOf = (k: TileKind) => {
      let b = rises.get(k)
      if (!b) rises.set(k, (b = bases[k](q.tx, q.ty)))
      return b
    }
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        let best = 1e9
        let k: TileKind | undefined
        let side = -1
        const test = (kk: TileKind | undefined, d: number, dep: number, sd: number) => {
          if (!kk) return
          const t = d - dep
          if (t < best) {
            best = t
            k = kk
            side = sd
          }
        }
        if (sides[0]) test(sides[0], y, depthOf(sides[0], ox + x, 81), 0)
        if (sides[1]) test(sides[1], T - 1 - x, depthOf(sides[1], oy + y, 82), 1)
        if (sides[2]) test(sides[2], T - 1 - y, depthOf(sides[2], ox + x, 83), 2)
        if (sides[3]) test(sides[3], x, depthOf(sides[3], oy + y, 84), 3)
        const corner = (kk: TileKind | undefined, cx: number, cy: number, rr: number, sd: number) =>
          kk && test(kk, Math.hypot(x + 0.5 - cx, y + 0.5 - cy), kk === 'floor' ? 2 : rr, sd)
        corner(diag[0], T, 0, rad[0], 0)
        corner(diag[1], T, T, rad[1], 1)
        corner(diag[2], 0, T, rad[2], 2)
        corner(diag[3], 0, 0, rad[3], 3)
        if (!k) continue
        if (best < 0) r.set(x, y, baseOf(k).get(x, y))
        else if (best < 1) {
          // the neighbour's lip: its south and east faces are shaded, its north and west faces lit
          const [lit, dark] = RIM[k]
          r.set(x, y, side === 0 || side === 3 ? dark : lit)
        } else if (best < 2.2 && (side === 0 || side === 3)) r.set(x, y, DARKER[own.get(x, y)])
      }
    // walls throw their shadow onto the ground south and east of them
    if (m[0] === '1')
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < T; x++) if (bayer(x, y) < (1 - y / 9) * 0.95) r.set(x, y, DARKER[r.get(x, y)])
    if (m[1] === '1')
      for (let y = 0; y < T; y++)
        for (let x = 0; x < 5; x++) if (bayer(x, y) < (1 - x / 5) * 0.8) r.set(x, y, DARKER[r.get(x, y)])
    return r
  })
}

// ---------------------------------------------------------------- masses

function groundOf(q: TileQuery, fallback: TileKind): TileKind {
  const count: Partial<Record<TileKind, number>> = {}
  for (const k of q.around) if (k && PRIO[k] !== undefined && k !== 'floor') count[k] = (count[k] ?? 0) + 1
  let best = fallback
  let n = 0
  for (const [k, c] of Object.entries(count) as [TileKind, number][])
    if (c > n || (c === n && PRIO[k]! > PRIO[best]!)) {
      best = k
      n = c
    }
  return best
}

/** One drooping pine bough: snow cap on top, needle body, jagged dark underside. */
function bough(
  r: Raster,
  cx: number,
  cy: number,
  rad: number,
  ramp: readonly number[],
  snow: number,
  clip: [number, number, number, number]
) {
  const top = Math.round(cy - rad * 0.9)
  const bot = Math.round(cy + rad * 0.62)
  const hgt = bot - top
  for (let y = top; y <= bot + 2; y++) {
    const u = Math.max(0, (y - top) / hgt)
    const hw = rad * (0.3 + 0.78 * Math.min(1, u))
    for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
      const dx = x - cx
      const tooth = (mod(x, 6) < 3 ? mod(x, 3) : 2 - mod(x, 3)) * 1.1
      const yb = cy + rad * 0.5 + tooth - (Math.abs(dx) > hw * 0.8 ? 1 : 0)
      if (y > yb) continue
      if (x < clip[0] || y < clip[1] || x >= clip[2] || y >= clip[3]) continue
      const e = y > yb - 1 ? 4 : y > yb - 2.2 ? 3 : -1
      let c: number
      const capEdge = snow * (0.3 + 0.07 * Math.sin(dx * 0.9 + cy)) + 0.04 * ((x + y) % 3)
      if (e >= 0) c = ramp[e]
      else if (u < capEdge) {
        c = SN[1]
        if (dx > hw * 0.4 || u > capEdge - 0.08) c = SN[2]
        else if (dx < -hw * 0.1 && u < capEdge * 0.6) c = SN[0]
      } else {
        c = ramp[1]
        if (dx > hw * 0.35) c = ramp[2]
        else if ((x + y * 2) % 5 === 0 && dx < hw * 0.1) c = ramp[0]
        else if ((x * 2 + y) % 6 === 1) c = ramp[2]
        if (y > yb - 4.2 && c === ramp[1]) c = ramp[2]
      }
      r.set(x, y, c)
    }
  }
}

const boughSprites = new Map<string, { img: Raster; cx: number; cy: number }>()
function boughSprite(rad: number, back: boolean, phase: number) {
  const key = `${rad},${back},${phase}`
  let s = boughSprites.get(key)
  if (!s) {
    const w = rad * 2 + 8
    const cy = Math.ceil(rad * 0.95) + 1
    const img = new Raster(w, cy + Math.ceil(rad * 0.7) + 4)
    const ramp = back ? [NL[2], NL[3], NL[4], NL[4], NL[4]] : [NL[0], NL[1], NL[2], NL[3], NL[4]]
    bough(img, w / 2, cy + phase, rad, ramp, back ? 0.2 : 0.9, [0, 0, w, img.h])
    boughSprites.set(key, (s = { img, cx: w / 2, cy }))
  }
  return s
}

function canopy(m: Raster, ox: number, oy: number, y1: number) {
  m.rect(0, 0, T, y1, NL[4])
  const layer = (cell: number, seed: number, back: boolean, dy: number) => {
    const n = 512 / cell
    for (let cy = Math.floor((oy - dy) / cell) - 1; cy <= Math.floor((oy + y1 + 8 - dy) / cell) + 1; cy++)
      for (let cx = Math.floor(ox / cell) - 1; cx <= Math.floor((ox + T + 8) / cell) + 1; cx++) {
        const mx = mod(cx, n)
        const my = mod(cy, n)
        const px = Math.round((cx + 0.1 + 0.8 * ih(mx, my, seed)) * cell - ox)
        const py = Math.round((cy + 0.1 + 0.8 * ih(mx, my, seed + 1)) * cell - oy + dy)
        const sp = boughSprite(11 + Math.floor(ih(mx, my, seed + 2) * 3), back, Math.floor(ih(mx, my, seed + 3) * 3))
        const x0 = px - sp.cx
        const y0 = py - sp.cy
        for (let j = 0; j < sp.img.h; j++) {
          const y = y0 + j
          if (y < 0 || y >= y1) continue
          for (let i = 0; i < sp.img.w; i++) {
            const c = sp.img.data[j * sp.img.w + i]
            const x = x0 + i
            if (c && x >= 0 && x < T) m.data[y * T + x] = c
          }
        }
      }
  }
  layer(16, 101, true, 8)
  layer(16, 111, false, 0)
}

function compose(q: TileQuery, m: Raster, ground: Raster, line: number, same: (i: number) => boolean, front: boolean) {
  const ox = mod(q.tx, 8) * T
  const oy = mod(q.ty, 8) * T
  const insetN = (x: number) => (same(N) ? 0 : 1 + Math.floor(vn1(ox + x, 8, 151) * 2.6))
  const insetW = (y: number) => (same(Wx) ? 0 : 1 + Math.floor(vn1(oy + y, 8, 152) * 2.6))
  const insetE = (y: number) => (same(E) ? 0 : 1 + Math.floor(vn1(oy + y, 8, 153) * 2.6))
  const shape = new Raster(T, T)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++)
      if (y >= insetN(x) && x >= insetW(y) && x < T - insetE(y)) shape.set(x, y, m.get(x, y) || line)
  const out = ground.clone()
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let c = shape.get(x, y)
      if (!c) continue
      const open = (dx: number, dy: number) => {
        const nx = x + dx
        const ny = y + dy
        return nx >= 0 && ny >= 0 && nx < T && ny < T && !shape.get(nx, ny)
      }
      if (open(0, -1) || open(-1, 0) || open(1, 0)) c = line
      else if (front && y === T - 1) c = line
      out.set(x, y, c)
    }
  return out
}

function thicketTile(q: TileQuery) {
  const a = q.around
  const same = (i: number) => a[i] === 'thicket'
  const gk = groundOf(q, 'forest')
  const sig = [N, E, Sx, Wx].map((i) => (same(i) ? 1 : 0)).join('')
  return memo(`th${mod(q.tx, 8)},${mod(q.ty, 8)},${sig},${gk}`, () => {
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const front = !same(Sx)
    const TH = front ? 38 : T
    const m = new Raster(T, T)
    if (front) {
      // dark understorey with trunks and snow drifted against them
      for (let y = TH - 8; y < T; y++)
        for (let x = 0; x < T; x++) m.set(x, y, y > T - 7 ? NL[4] : bayer(x, y) < 0.4 ? NL[4] : NL[3])
      for (let cx = Math.floor((ox - 10) / 32); cx <= Math.floor((ox + T + 10) / 32); cx++) {
        const mx = mod(cx, 16)
        const tx0 = Math.round(cx * 32 + 2 + ih(mx, 4, 161) * 22 - ox)
        const w = 7 + Math.floor(ih(mx, 5, 162) * 5)
        if (ih(mx, 6, 163) < 0.22) continue
        for (let y = TH - 10; y < T; y++)
          for (let x = 0; x < w; x++) {
            let c = x === 0 ? WD[1] : x < 3 ? WD[2] : x < w - 2 ? WD[3] : WD[3]
            if (x === 1 || (x === 3 && (y + mx) % 5 < 2)) c = x === 1 ? WD[1] : WD[2]
            if ((y * 3 + x * 7 + mx) % 11 === 0 && x > 2) c = WD[4]
            if (x === w - 1) c = WD[4]
            m.set(tx0 + x, y, c)
          }
        // flared root foot
        m.rect(tx0 - 2, T - 6, w + 4, 6, WD[3])
        m.rect(tx0 - 2, T - 6, 2, 2, WD[2])
        m.rect(tx0 - 2, T - 1, w + 4, 1, WD[4])
        // snow drift at the foot
        for (let k = -4; k < w + 5; k++) {
          const h = 3 - Math.min(3, Math.abs(k - w / 2) / 3) + (k % 3 === 0 ? 0 : 0.6)
          for (let j = 0; j < h; j++) m.set(tx0 + k, T - 2 - j, j >= h - 1 ? SN[0] : j === 0 ? SN[2] : SN[1])
        }
      }
    }
    canopy(m, ox, oy, TH + 4)
    if (front) for (let x = 0; x < T; x++) m.set(x, T - 1, NL[4])
    return compose(
      q,
      m,
      groundTile({ ...q, kind: gk, around: a.map((k) => (k === 'thicket' ? gk : k)) }),
      NL[4],
      same,
      front
    )
  })
}

const MERLON = 32
const MW = 20

function fortwallTile(q: TileQuery) {
  const a = q.around
  const same = (i: number) => a[i] === 'fortwall'
  const gk = groundOf(q, 'snow')
  const sig = [N, E, Sx, Wx, NE, SE, SW, NW].map((i) => (same(i) ? 1 : 0)).join('')
  return memo(`fw${mod(q.tx, 8)},${mod(q.ty, 8)},${sig},${gk}`, () => {
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const front = !same(Sx)
    const TH = front ? 34 : T
    const m = new Raster(T, T)
    // walkway on top: pale flagstones with snow in the corners
    const slabs = slabLayout(q.tx, q.ty, TH, 31)
    paintSlabs(m, slabs, [ST[0], ST[1], ST[2], ST[3]])
    const rn = rng(mod(q.tx, 8) * 131 + mod(q.ty, 8) * 17 + 4)
    for (const s of slabs) {
      if (rn() < 0.5) {
        const cx = s.x0 + 4 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 8))
        const cy = rn() < 0.5 ? s.y0 + 3 : s.y1 - 4
        const rx = 3 + rn() * 4
        m.ellipse(cx + 0.5, cy + 1, rx, 2, SN[2])
        m.ellipse(cx, cy + 0.2, rx, 1.8, SN[1])
        m.ellipse(cx - 1, cy - 0.5, rx * 0.5, 0.9, SN[0])
      }
    }
    if (!same(N)) {
      // raised back parapet seen from the front
      m.rect(0, 0, T, 5, ST[0])
      m.rect(0, 3, T, 1, ST[1])
      m.rect(0, 4, T, 1, ST[2])
      for (let x = 0; x < T; x++) if (vn1(ox + x, 10, 171) > 0.5) m.set(x, 0, SN[0])
      for (let x = 0; x < T; x++) if (vn1(ox + x, 14, 172) > 0.55) m.set(x, 1, SN[1])
    }
    if (front) {
      // brick face
      for (let y = TH; y < T; y++)
        for (let x = 0; x < T; x++) {
          const course = Math.floor((y - TH) / 8)
          const ry = (y - TH) % 8
          const wx = ox + x + (course % 2) * 8
          const rx = mod(wx, 16)
          const bid = Math.floor(wx / 16) * 5 + course
          const tone = ih(mod(bid, 128), 3, 77)
          let c: number = ST[1]
          if (tone < 0.2) c = ST[0]
          else if (tone > 0.8) c = ST[2]
          if (ry === 0) c = course === 0 ? ST[1] : ST[0]
          if (ry === 7) c = ST[3]
          else if (rx === 15) c = ST[3]
          else if (rx === 0 && ry > 0) c = c === ST[1] ? ST[0] : c
          if (y === T - 1) c = ST[4]
          m.set(x, y, c)
        }
      // frost creeping up the foot and icicles under the lip
      for (let x = 0; x < T; x++) {
        const v = vn1(ox + x, 8, 173)
        if (v > 0.45) {
          const len = 1 + Math.floor((v - 0.45) * 8)
          for (let i = 0; i < len; i++) m.set(x, T - 2 - i, i === len - 1 ? SN[0] : SN[1])
        }
        const w = vn1(ox + x, 6, 174)
        if (w > 0.66) {
          const len = 2 + Math.floor((w - 0.66) * 22)
          for (let i = 0; i < len; i++) m.set(x, TH + 1 + i, i > len - 3 ? IC[1] : i === len - 1 ? IC[0] : SN[1])
        }
      }
      // merlons along the front edge with open embrasures between them
      for (let x = 0; x < T; x++) {
        const u = mod(ox + x, MERLON)
        const on = u < MW
        // embrasure: the walkway behind, in shade, plus the wall lip
        if (!on) {
          for (let y = 14; y < TH; y++) m.set(x, y, y < 18 ? ST[2] : bayer(x, y) < 0.5 ? ST[2] : ST[1])
          m.set(x, TH - 1, ST[2])
          m.set(x, TH, ST[0])
        } else {
          for (let y = 12; y < TH; y++) {
            let c = y === 12 ? SN[0] : y < 15 ? SN[1] : y === 15 ? SN[2] : ST[1]
            if (y >= 16 && u === 0) c = ST[0]
            else if (y >= 16 && u >= MW - 2) c = ST[2]
            if (y >= 16 && y < TH && (y - 16) % 8 === 7) c = ST[3]
            if (y >= 16 && u === MW - 1) c = ST[3]
            m.set(x, y, c)
          }
        }
      }
      // loop slit in alternating merlons
      for (const mm of [-1, 0, 1, 2]) {
        const x0 = mm * MERLON + 8 - ox
        if (mod(mm, 2) === 0) {
          m.rect(x0 + 1, 21, 3, 11, NG[4])
          m.rect(x0, 21, 1, 11, ST[2])
          m.rect(x0 + 1, 22, 1, 9, NG[3])
        }
      }
    }
    const line = ST[4]
    return compose(
      q,
      m,
      groundTile({ ...q, kind: gk, around: a.map((k) => (k === 'fortwall' ? gk : k)) }),
      line,
      same,
      front
    )
  })
}

// ---------------------------------------------------------------- water

function waterBase(ox: number, oy: number) {
  return memo(`wb${ox},${oy}`, () => {
    const r = new Raster(T, T)
    const n1 = noisePatch(ox, oy, 32, 131)
    const n2 = noisePatch(ox, oy, 16, 132)
    for (let i = 0; i < T * T; i++) {
      const v = n1[i] * 0.6 + n2[i] * 0.4
      const x = i % T
      const y = (i / T) | 0
      r.data[i] = v < 0.3 ? NG[3] : v > 0.74 && bayer(x, y) < 0.5 ? NG[1] : NG[2]
    }
    return r
  })
}

function waterTile(q: TileQuery) {
  const a = q.around
  const type = (i: number): number => {
    const k = a[i]
    if (isWaterish(k)) return 0
    return k === 'bridge' ? 2 : 1
  }
  const ts = [N, NE, E, SE, Sx, SW, Wx, NW].map(type)
  const sig = ts.join('')
  const PER = 512
  return memo(`w${mod(q.tx, 8)},${mod(q.ty, 8)},${q.frame},${sig}`, () => {
    const f = q.frame
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const r = waterBase(ox, oy).clone()
    const cw = 32
    const ch = 16
    for (let cy = Math.floor((oy - 4) / ch); cy <= Math.floor((oy + T + 4) / ch); cy++)
      for (let cx = Math.floor((ox - 14) / cw); cx <= Math.floor((ox + T + 14) / cw); cx++) {
        const mx = mod(cx, PER / cw)
        const my = mod(cy, PER / ch)
        if (ih(mx, my, 181) > 0.7) continue
        const px = cx * cw + Math.floor(ih(mx, my, 182) * 24) - ox
        const py = cy * ch + 2 + Math.floor(ih(mx, my, 183) * 11) - oy
        const ph = Math.floor(ih(mx, my, 184) * 4)
        const len = [3, 7, 10, 5][(f + ph) & 3]
        const half = len >> 1
        for (let i = -half; i <= half; i++) {
          r.set(px + i, py, IC[3])
          if (Math.abs(i) < half - 1) r.set(px + i + 1, py + 1, NG[4])
        }
        if (len > 6) {
          r.set(px - half - 1, py + 1, IC[3])
          r.set(px + half + 1, py + 1, IC[3])
          r.set(px, py - 1, IC[2])
        }
      }
    // moon glints
    for (let cy = Math.floor((oy - 4) / 32); cy <= Math.floor((oy + T + 4) / 32); cy++)
      for (let cx = Math.floor((ox - 4) / 32); cx <= Math.floor((ox + T + 4) / 32); cx++) {
        const mx = mod(cx, PER / 32)
        const my = mod(cy, PER / 32)
        if (ih(mx, my, 191) > 0.5) continue
        if (((f + Math.floor(ih(mx, my, 192) * 4)) & 3) > 1) continue
        const px = cx * 32 + 3 + Math.floor(ih(mx, my, 193) * 26) - ox
        const py = cy * 32 + 3 + Math.floor(ih(mx, my, 194) * 26) - oy
        r.set(px, py, IC[0])
        r.set(px - 1, py, IC[2])
        r.set(px + 1, py, IC[2])
      }
    if (!ts.some((t) => t)) return r
    const out = r.clone()
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const wx = ox + x
        const wy = oy + y
        let shelf = 99
        let shadow = 99
        const consider = (d: number, t: number) => {
          if (!t) return
          if (t === 2) shadow = Math.min(shadow, d)
          else shelf = Math.min(shelf, d)
        }
        const wob = (w: number, s: number) => (vn1(w, 12, s) - 0.5) * 4
        consider(y + wob(wx, 201), ts[0])
        consider(x + wob(wy, 202), ts[6])
        consider(T - 1 - x + wob(wy, 203), ts[2])
        consider(T - 1 - y + wob(wx, 204), ts[4])
        if (!ts[0] && !ts[6] && ts[7]) consider(Math.hypot(x, y) - 4 + wob(wx + wy, 205), ts[7])
        if (!ts[0] && !ts[2] && ts[1]) consider(Math.hypot(T - 1 - x, y) - 4 + wob(wx + wy, 206), ts[1])
        if (!ts[4] && !ts[6] && ts[5]) consider(Math.hypot(x, T - 1 - y) - 4 + wob(wx + wy, 207), ts[5])
        if (!ts[4] && !ts[2] && ts[3]) consider(Math.hypot(T - 1 - x, T - 1 - y) - 4 + wob(wx + wy, 208), ts[3])
        let c = r.get(x, y)
        if (shelf < 8) {
          if (shelf < 1.6) c = SN[0]
          else if (shelf < 3.2) c = SN[1]
          else if (shelf < 4.6) c = bayer(x, y) < 0.7 ? IC[1] : IC[0]
          else if (shelf < 6) c = bayer(x, y) < 0.5 ? IC[2] : IC[1]
          else if (bayer(x, y) < 0.4) c = IC[3]
          if (shelf >= 1.6 && shelf < 3.2 && (((wx >> 1) + f) & 3) === 0) c = SN[2]
        }
        if (shadow < 4) c = shadow < 1.5 ? NG[4] : shadow < 3 ? NG[3] : bayer(x, y) < 0.5 ? NG[3] : c
        out.set(x, y, c)
      }
    return out
  })
}

// ---------------------------------------------------------------- bridge

function bridgeTile(q: TileQuery) {
  const a = q.around
  const wet = (k?: TileKind) => k === 'water' || k === 'pit'
  const wH = wet(a[Wx]) || wet(a[E])
  const wV = wet(a[N]) || wet(a[Sx])
  let vertical = wH && !wV
  if (!wH && !wV) vertical = a[N] === 'bridge' || a[Sx] === 'bridge'
  const sidesA = vertical ? wet(a[Wx]) : wet(a[N])
  const sidesB = vertical ? wet(a[E]) : wet(a[Sx])
  return memo(`B${mod(q.tx, 8)},${mod(q.ty, 8)},${vertical},${sidesA},${sidesB}`, () => {
    const r = new Raster(T, T)
    const rn = rng(mod(q.tx, 8) * 19 + mod(q.ty, 8) * 5 + 2)
    const pw = 13
    const put = (u: number, v: number, c: number) => (vertical ? r.set(v, u, c) : r.set(u, v, c))
    for (let i = 0; i < 5; i++) {
      const p0 = i * pw
      const p1 = Math.min(T, p0 + pw)
      const tone = Math.floor(ih(q.tx + i, q.ty, 8) * 3)
      for (let u = p0; u < p1; u++)
        for (let v = 0; v < T; v++) {
          let c: number = tone === 1 ? WD[0] : WD[1]
          if (tone === 0 && (v + u * 3) % 17 === 0) c = WD[2]
          if (u === p0) c = WD[0]
          else if (u === p1 - 1) c = WD[3]
          else if (u === p1 - 2) c = WD[2]
          put(u, v, c)
        }
      for (let k = 0; k < 2; k++) {
        const u = p0 + 3 + Math.floor(rn() * (pw - 6))
        const v0 = Math.floor(rn() * (T - 14))
        for (let v = v0; v < v0 + 7 + Math.floor(rn() * 6); v++) put(u, v, WD[2])
      }
      // snow lying along the plank and in the gap
      if (rn() < 0.7) {
        const v0 = Math.floor(rn() * 40)
        const len = 8 + Math.floor(rn() * 14)
        for (let v = v0; v < Math.min(T, v0 + len); v++) {
          const k = Math.min(v - v0, v0 + len - v - 1)
          put(p0 + 2, v, k > 0 ? SN[1] : SN[2])
          put(p0 + 3, v, k > 1 ? SN[0] : SN[1])
          if (k > 1) put(p0 + 4, v, SN[2])
        }
      }
    }
    for (let i = 0; i < 5; i++) {
      const u = i * pw + 4 + (i % 2)
      for (const v of [8, T - 9]) {
        put(u, v, WD[3])
        put(u - 1, v - 1, WD[0])
      }
    }
    const edgeBeam = (atStart: boolean) => {
      for (let u = 0; u < T; u++)
        for (let k = 0; k < 8; k++) {
          const dist = atStart ? k : T - 1 - k
          let c: number
          if (atStart) c = k === 0 ? WD[3] : k === 1 ? WD[0] : k < 5 ? WD[1] : k === 5 ? WD[2] : WD[3]
          else if (vertical) c = k < 3 ? WD[3] : k < 5 ? WD[2] : WD[1]
          else c = k < 2 ? WD[3] : k < 4 ? WD[2] : k === 4 ? WD[1] : k === 5 ? WD[0] : WD[1]
          if (vertical) r.set(dist, u, c)
          else r.set(u, dist, c)
        }
    }
    if (sidesA) edgeBeam(true)
    if (sidesB) edgeBeam(false)
    for (const [on, atStart] of [
      [sidesA, true],
      [sidesB, false]
    ] as const) {
      if (!on) continue
      for (const u of [0, T - 7]) {
        for (let k = 0; k < 7; k++)
          for (let mm = 0; mm < 7; mm++) {
            const dist = atStart ? k : T - 1 - k
            const c = k === 0 || mm === 6 ? WD[3] : k === 1 || mm === 0 ? WD[0] : k > 4 ? WD[2] : WD[1]
            if (vertical) r.set(dist, u + mm, c)
            else r.set(u + mm, dist, c)
          }
        // snow cap on the post
        if (vertical) r.rect(atStart ? 1 : T - 6, u + 1, 4, 5, SN[1])
        else r.rect(u + 1, atStart ? 1 : T - 6, 5, 4, SN[1])
      }
    }
    return r
  })
}

// ---------------------------------------------------------------- pit

function pitTile(q: TileQuery) {
  const a = q.around
  const pit = (i: number) => a[i] === 'pit'
  const sig = [N, E, Sx, Wx, NE, NW].map((i) => (pit(i) ? 1 : 0)).join('')
  return memo(`p${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const r = new Raster(T, T)
    r.rect(0, 0, T, T, C.black)
    if (!pit(N))
      for (let x = 0; x < T; x++) {
        const L = 4 + Math.floor(vn1(ox + x, 8, 211) * 4)
        const F = L + 14 + Math.floor(vn1(ox + x, 16, 212) * 6)
        for (let y = 0; y < F; y++) {
          let c: number
          if (y < L) c = y === 0 ? SN[0] : y < L - 1 ? SN[1] : SN[2]
          else {
            const t = (y - L) / (F - L)
            c = t < 0.3 ? NG[1] : t < 0.55 ? NG[2] : t < 0.8 ? NG[3] : bayer(x, y) < 0.5 ? NG[4] : C.black
            const streak = mod(ox + x, 9) === 0 || ih(ox + x, 3, 214) < 0.12
            if (streak && y > L + 1 && t < 0.75) c = t < 0.4 ? IC[2] : IC[3]
          }
          r.set(x, y, c)
        }
        if (ih(ox + x, 5, 215) < 0.12) r.set(x, L, NG[3])
      }
    if (!pit(Wx))
      for (let y = 0; y < T; y++) {
        const e = 3 + Math.floor(vn1(oy + y, 8, 216) * 3)
        for (let x = 0; x < e; x++) r.set(x, y, x === 0 ? SN[0] : x === e - 1 ? NG[3] : SN[1])
      }
    if (!pit(E))
      for (let y = 0; y < T; y++) {
        const e = 3 + Math.floor(vn1(oy + y, 8, 217) * 3)
        for (let x = 0; x < e; x++) r.set(T - 1 - x, y, x === e - 1 ? NG[3] : x === 0 ? SN[2] : SN[1])
      }
    if (!pit(Sx))
      for (let x = 0; x < T; x++) {
        const e = 4 + Math.floor(vn1(ox + x, 8, 218) * 4)
        for (let k = 0; k < e; k++) r.set(x, T - 1 - k, k === e - 1 ? SN[0] : k === e - 2 ? SN[1] : SN[2])
        r.set(x, T - 1 - e, NG[3])
      }
    return r
  })
}

// ---------------------------------------------------------------- provider

export function forestTile(q: TileQuery): ReturnType<typeof groundTile> | undefined {
  switch (q.kind) {
    case 'forest':
    case 'snow':
    case 'path':
    case 'ice':
    case 'floor':
      return groundTile(q)
    case 'thicket':
      return thicketTile(q)
    case 'fortwall':
      return fortwallTile(q)
    case 'water':
      return waterTile({ ...q, frame: mod(q.frame, TILE_FRAMES.water ?? 4) })
    case 'bridge':
      return bridgeTile(q)
    case 'pit':
      return pitTile(q)
    default:
      return undefined
  }
}
