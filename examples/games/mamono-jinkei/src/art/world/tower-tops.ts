/** Stage 3 terrain tops (the walkable / roof surface of each kind) and the vertical faces under them. */
import { C, DARKER, R } from '../palette'
import { Raster, bayer, rng, shadeIndex } from '../raster'
import { D, G, GD, S, T, WOOD, GOLD, crack, ih, mod, tile, vn1 } from './gfx'
import { RK, RT, SK, field } from './tower-gfx'

const cache = new Map<string, Raster>()
export const memo = (key: string, make: () => Raster) => {
  let r = cache.get(key)
  if (!r) cache.set(key, (r = make()))
  return r
}

export type Fam = 'rock' | 'stone' | 'wood'
export const FAM_RAMP: Record<Fam, readonly number[]> = { rock: RK, stone: S, wood: WOOD }

/** Row where the vertical face starts, per terrain kind (a function of the world x so neighbours always meet). */
export const lipOf = (kind: string, wx: number) => {
  switch (kind) {
    case 'rock':
      return 38 + Math.floor(vn1(wx, 12, 211) * 4)
    case 'wall':
      return 48
    case 'floor':
      return 49 + Math.floor(vn1(wx, 10, 212) * 3)
    case 'planks':
      return 50
    default:
      return 45 + Math.floor(vn1(wx, 10, 211) * 5)
  }
}
export const famOf = (kind: string): Fam =>
  kind === 'floor' || kind === 'wall' ? 'stone' : kind === 'planks' ? 'wood' : 'rock'

// ---------------------------------------------------------------- faces

/**
 * One pixel of a vertical face `d` rows below its lip at world x `wx`. `fade` lets the face dissolve into the clouds
 * (returns 0 there); otherwise it runs on. Lit from the top-left, so the face is a step darker than the top.
 */
const BRICK_TONE = Float32Array.from({ length: 4096 }, (_, i) => ih(i >> 6, i & 63, 77))
/** One pixel of the stone masonry at world column wx and facade row y (8 px courses, 22 px stones). */
export function brick(wx: number, y: number): number {
  const course = Math.floor(y / 8)
  const ry = mod(y, 8)
  const bx = wx + mod(course, 2) * 11
  const rx = mod(bx, 22)
  const tone = BRICK_TONE[mod(Math.floor(bx / 22), 64) * 64 + mod(course, 64)]
  let c = tone < 0.16 ? S[1] : tone > 0.88 ? S[3] : S[2]
  if (ry === 0) c = S[1]
  else if (ry === 7 || rx === 21) c = S[3]
  else if (rx === 0) c = c === S[2] ? S[1] : c
  else if (tone > 0.5 && tone < 0.56 && ry === 3 && rx > 4 && rx < 9) c = S[3]
  return c
}

const faceCache = new Map<string, Uint8Array>()
/** Cached column lookup of faceRaw for the usual case (pattern row = depth). */
export function faceAt(fam: Fam, wx: number, d: number, fade: boolean, brass: boolean, pat = d): number {
  if (pat !== d || d < 0 || d >= 96) return faceRaw(fam, wx, d, fade, brass, pat)
  const key = `${fam}${mod(wx, 512)}${fade}${brass}`
  let col = faceCache.get(key)
  if (!col) {
    col = new Uint8Array(96)
    for (let k = 0; k < 96; k++) col[k] = faceRaw(fam, wx, k, fade, brass, k)
    faceCache.set(key, col)
  }
  return col[d]
}

function faceRaw(fam: Fam, wx: number, d: number, fade: boolean, brass: boolean, pat = d): number {
  const FH = fade ? 48 + Math.floor(vn1(wx, 16, 201) * 14) : 999
  if (d >= FH) return 0
  let c: number
  if (fam === 'rock') {
    const col = vn1(wx, 3, 202)
    const v = d / (fade ? 56 : 40)
    let idx = v < 0.2 ? 1 : v < 0.62 ? 2 : 3
    if (col > 0.7) idx = Math.min(3, idx + 1)
    else if (col < 0.2 && idx > 1) idx--
    for (let k = 0; k < 5; k++) {
      const pos = 8 + 11 * k + Math.floor(vn1(wx, 24, 210 + k) * 7)
      if (d === pos) idx = Math.max(1, idx - 1)
      else if (d === pos + 1) idx = Math.min(3, idx + 1)
    }
    if (vn1(wx, 6, 203) > 0.84 && d > 3 && vn1(wx, 32, 204) * 40 > d - 4) idx = 3
    c = d === 0 ? RK[0] : d === 1 ? RK[1] : RK[idx]
  } else if (fam === 'stone') {
    c = d === 0 ? S[0] : brick(wx, pat)
  } else {
    // wooden scaffold: a front beam, then posts with an X brace, fading into the clouds
    if (d < 8) {
      c = d === 0 ? WOOD[0] : d < 5 ? WOOD[1] : d < 7 ? WOOD[2] : WOOD[3]
      if (d >= 1 && d < 5 && mod(wx * 7 + d * 13, 23) === 0) c = WOOD[2]
      return c
    }
    const px = mod(wx, 32)
    const post = px < 7
    const dd = d - 8
    if (post) {
      c = px === 0 ? WOOD[0] : px < 4 ? WOOD[1] : px < 6 ? WOOD[2] : WOOD[3]
      if (dd % 24 >= 21 && dd % 24 < 23) c = D[1 + (dd % 2)] // rope lashing
    } else {
      const t = px - 7
      const y1 = (t * 22) / 24
      const y2 = 22 - y1
      const base = Math.floor(dd / 24) * 24
      const l = dd - base
      const hit = (y: number) => Math.abs(l - y) <= 1.5
      if (hit(y1) || hit(y2)) c = Math.abs(l - y1) < 0.8 || Math.abs(l - y2) < 0.8 ? WOOD[1] : WOOD[3]
      else return 0
    }
  }
  if (fade && d > FH - 9) {
    const t = (FH - d) / 9
    if (bayer(wx, d) > t) return 0
    return d > FH - 4 ? (fam === 'wood' ? WOOD[3] : fam === 'stone' ? S[3] : RK[3]) : c
  }
  return c
}

// ---------------------------------------------------------------- tops

const pointTables = new Map<string, Float32Array>()
const pointsOf = (cell: number, seed: number) => {
  const key = `${cell},${seed}`
  let t = pointTables.get(key)
  if (!t) {
    const n = 512 / cell
    t = new Float32Array(n * n * 2)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        t[(j * n + i) * 2] = 0.15 + 0.7 * ih(i, j, seed)
        t[(j * n + i) * 2 + 1] = 0.15 + 0.7 * ih(i, j, seed + 1)
      }
    pointTables.set(key, t)
  }
  return t
}

const voronoi = (ox: number, oy: number, cell: number, seed: number) => {
  const n = 512 / cell
  const pts = pointsOf(cell, seed)
  const id = new Int32Array(T * T)
  const d1 = new Float32Array(T * T)
  const d2 = new Float32Array(T * T)
  const cx = new Float32Array(T * T)
  const cy = new Float32Array(T * T)
  const gi0 = Math.floor(ox / cell) - 1
  const gj0 = Math.floor(oy / cell) - 1
  const nw = Math.floor((ox + T) / cell) + 2 - gi0 + 1
  const nh = Math.floor((oy + T) / cell) + 2 - gj0 + 1
  const lx = new Float32Array(nw * nh)
  const ly = new Float32Array(nw * nh)
  const lid = new Int32Array(nw * nh)
  for (let j = 0; j < nh; j++)
    for (let i = 0; i < nw; i++) {
      const gi = gi0 + i
      const gj = gj0 + j
      const pi = (mod(gj, n) * n + mod(gi, n)) * 2
      lx[j * nw + i] = (gi + pts[pi]) * cell
      ly[j * nw + i] = (gj + pts[pi + 1]) * cell
      lid[j * nw + i] = mod(gi, n) * n + mod(gj, n)
    }
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const wx = ox + x + 0.5
      const wy = oy + y + 0.5
      const gi = Math.floor(wx / cell) - gi0
      const gj = Math.floor(wy / cell) - gj0
      let b1 = 1e9
      let b2 = 1e9
      let bi = 0
      let bx = 0
      let by = 0
      for (let j = gj - 1; j <= gj + 1; j++)
        for (let i = gi - 1; i <= gi + 1; i++) {
          const li = j * nw + i
          const px = lx[li]
          const py = ly[li]
          const d = Math.sqrt((wx - px) * (wx - px) + (wy - py) * (wy - py))
          if (d < b1) {
            b2 = b1
            b1 = d
            bi = lid[li]
            bx = px
            by = py
          } else if (d < b2) b2 = d
        }
      const k = y * T + x
      id[k] = bi
      d1[k] = b1
      d2[k] = b2
      cx[k] = bx - ox
      cy[k] = by - oy
    }
  return { id, d1, d2, cx, cy }
}

function lichen(r: Raster, x: number, y: number, rn: () => number) {
  const n = 3 + Math.floor(rn() * 4)
  for (let i = 0; i < n; i++) {
    const px = x + Math.round((rn() - 0.5) * 7)
    const py = y + Math.round((rn() - 0.5) * 4)
    const w = 1 + Math.floor(rn() * 3)
    for (let k = 0; k < w; k++) {
      r.set(px + k, py, R.sludge[0])
      r.set(px + k, py + 1, rn() < 0.5 ? R.sludge[1] : R.grass[2])
    }
    r.set(px, py - 1, R.grass[0])
  }
}

function tuft(r: Raster, x: number, y: number, lean: number) {
  const blade = (bx: number, h: number, l: number) => {
    for (let i = 0; i < h; i++) r.set(bx + (i >= h - 2 ? l : 0), y - i, i === h - 1 ? G[0] : i > h - 3 ? G[1] : G[2])
  }
  r.rect(x - 1, y + 1, 5, 1, GD[2])
  blade(x, 3, lean - 1)
  blade(x + 1, 5, lean)
  blade(x + 2, 4, lean)
  blade(x + 3, 3, lean + 1)
}

/** Weathered cracked rock plateau: broad plates, a few hairline cracks, lichen, pebbles, a tuft or two. */
export function cliffTop(a: number, b: number): Raster {
  return memo(`ct${a},${b}`, () => {
    const r = tile()
    const ox = a * T
    const oy = b * T
    const v = voronoi(ox, oy, 64, 321)
    const w = voronoi(ox, oy, 32, 325)
    const speck = field(ox, oy, 32, 32, 322)
    const crk = new Uint8Array(T * T)
    for (let i = 0; i < T * T; i++) {
      const sh = ih(v.id[i], 9, 323)
      const sub = ih(w.id[i], 10, 326)
      let c = sh < 0.1 ? RK[0] : sh > 0.92 ? RK[2] : RK[1]
      if (c === RK[1] && sub < 0.05) c = RK[0]
      if (c === RK[1] && speck[i] < 0.2 && bayer(i % T, (i / T) | 0) < 0.3) c = RK[2]
      r.data[i] = c
      if (v.d2[i] - v.d1[i] < 1.6) crk[i] = 1
      else if (w.d2[i] - w.d1[i] < 1.2 && ih(w.id[i], 11, 327) < 0.35) crk[i] = 2
    }
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const i = y * T + x
        if (crk[i]) {
          r.data[i] = crk[i] === 1 ? RK[3] : RK[2]
          continue
        }
        if ((x > 0 && crk[i - 1] === 1) || (y > 0 && crk[i - T] === 1)) r.data[i] = r.data[i] === RK[2] ? RK[1] : RK[0]
        else if ((x < T - 1 && crk[i + 1] === 1) || (y < T - 1 && crk[i + T] === 1))
          r.data[i] = r.data[i] === RK[0] ? RK[1] : RK[2]
      }
    const rn = rng(a * 97 + b * 13 + 5)
    for (let i = 0; i < 3; i++) if (rn() < 0.4) lichen(r, 6 + Math.floor(rn() * 52), 6 + Math.floor(rn() * 52), rn)
    for (let i = 0; i < 2; i++) if (rn() < 0.3) tuft(r, 6 + Math.floor(rn() * 50), 8 + Math.floor(rn() * 50), 1)
    for (let i = 0; i < 5; i++) {
      const x = 4 + Math.floor(rn() * 56)
      const y = 4 + Math.floor(rn() * 56)
      if (rn() < 0.6) {
        r.set(x, y, RK[0])
        r.set(x + 1, y, RK[1])
        r.set(x + 1, y + 1, RK[3])
        r.set(x, y + 1, RK[2])
      }
    }
    return r
  })
}

/** Windswept cliff-top grass: two greens, leaning blades and long light streaks all pointing east. */
export function grassTop(a: number, b: number): Raster {
  return memo(`gtop${a},${b}`, () => {
    const r = tile()
    const ox = a * T
    const oy = b * T
    const n1 = field(ox, oy, 64, 32, 331)
    const n2 = field(ox, oy, 32, 16, 332)
    const n3 = field(ox, oy, 16, 8, 333)
    for (let i = 0; i < T * T; i++) {
      const n = n1[i] * 0.45 + n2[i] * 0.35 + n3[i] * 0.2 + (bayer(i % T, (i / T) | 0) - 0.5) * 0.07
      r.data[i] = n > 0.6 ? G[0] : n < 0.34 ? GD[0] : G[1]
    }
    const rn = rng(a * 71 + b * 29 + 9)
    // wind streaks
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(rn() * 52)
      const y = 2 + Math.floor(rn() * 60)
      const len = 6 + Math.floor(rn() * 8)
      for (let k = 0; k < len; k++) {
        const yy = y - (k > len * 0.6 ? 1 : 0)
        r.set((x + k) % T, yy, k < 2 || k > len - 3 ? G[1] : G[0])
        if (k > 1 && k < len - 2) r.set((x + k) % T, yy + 1, GD[1])
      }
    }
    // leaning blades
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rn() * T)
      const y = 4 + Math.floor(rn() * 58)
      const h = 3 + Math.floor(rn() * 3)
      for (let k = 0; k < h; k++)
        r.set(x + (k > 0 ? 1 : 0) + (k > 2 ? 1 : 0), y - k, k === h - 1 ? G[0] : k === 0 ? GD[3] : GD[2])
    }
    for (let i = 0; i < 3; i++) tuft(r, 6 + Math.floor(rn() * 52), 10 + Math.floor(rn() * 48), 1)
    // wildflowers bent by the wind
    for (let i = 0; i < 2; i++)
      if (rn() < 0.5) {
        const x = 6 + Math.floor(rn() * 50)
        const y = 8 + Math.floor(rn() * 50)
        const p = [R.paper[0], R.jobGold[0], R.jobBlue[0]][Math.floor(rn() * 3)]
        r.set(x, y, p)
        r.set(x + 1, y, R.jobGold[1])
        r.set(x, y + 1, GD[1])
        r.set(x, y + 2, GD[2])
      }
    return r
  })
}

/** Craggy rock outcrop top: domed boulders with cracks between them. */
export function rockTop(a: number, b: number): Raster {
  return memo(`rt${a},${b}`, () => {
    const r = tile()
    const ox = a * T
    const oy = b * T
    const v = voronoi(ox, oy, 32, 341)
    const speck = field(ox, oy, 16, 16, 342)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const i = y * T + x
        if (v.d2[i] - v.d1[i] < 1.7) {
          r.data[i] = RK[3]
          continue
        }
        const rad = 21 + ih(v.id[i], 4, 343) * 5
        const dx = (x + 0.5 - v.cx[i]) / rad + (ih(v.id[i], 5, 344) - 0.5) * 0.5
        const dy = (y + 0.5 - v.cy[i]) / rad + (ih(v.id[i], 6, 345) - 0.5) * 0.5
        const q = Math.min(0.98, dx * dx + dy * dy)
        let k = shadeIndex(dx * 0.9, dy * 0.9, Math.sqrt(1 - q), false)
        if (k === 3 && bayer(x, y) < 0.5) k = 2
        if (k === 0 && speck[i] < 0.5) k = 1
        r.data[i] = RK[k]
      }
    const rn = rng(a * 31 + b * 7 + 3)
    for (let i = 0; i < 2; i++) if (rn() < 0.5) lichen(r, 6 + Math.floor(rn() * 52), 6 + Math.floor(rn() * 52), rn)
    return r
  })
}

/** Tower interior floor: 32 px flagstones with brass inlay lines and the odd brass clock dial. */
export function floorTop(a: number, b: number): Raster {
  return memo(`ft${a},${b}`, () => {
    const r = tile()
    const rn = rng(a * 53 + b * 11 + 7)
    for (let sj = 0; sj < 2; sj++)
      for (let si = 0; si < 2; si++) {
        const id = (b * 2 + sj) * 16 + a * 2 + si
        const tone = ih(id, 3, 351)
        for (let v = 0; v < 32; v++)
          for (let u = 0; u < 32; u++) {
            let c = S[1]
            if (ih(id * 31 + u, v, 354) < 0.012 && u > 1 && v > 1 && u < 29 && v < 29) c = S[0]
            if (ih(id * 17 + u, v, 355) < 0.012 && u > 1 && v > 1 && u < 29 && v < 29) c = S[2]
            if (u === 31 || v === 31) c = S[3]
            else if (u === 0 || v === 0) c = S[0]
            else if (u === 30 || v === 30) c = S[2]
            r.set(si * 32 + u, sj * 32 + v, c)
          }
        // brass inlay square
        if (ih(id, 8, 352) < 0.24) {
          const x0 = si * 32 + 5
          const y0 = sj * 32 + 5
          for (let k = 0; k < 21; k++) {
            r.set(x0 + k, y0, GOLD[1])
            r.set(x0 + k, y0 + 20, GOLD[2])
            r.set(x0, y0 + k, GOLD[1])
            r.set(x0 + 20, y0 + k, GOLD[2])
          }
          for (const [dx, dy] of [
            [0, 0],
            [20, 0],
            [0, 20],
            [20, 20]
          ])
            r.rect(x0 + dx - 1, y0 + dy - 1, 3, 3, GOLD[1]),
              r.set(x0 + dx - 1, y0 + dy - 1, GOLD[0]),
              r.set(x0 + dx, y0 + dy, GOLD[3])
        }
        for (let i = 0; i < 2; i++) {
          const x = si * 32 + 4 + Math.floor(rn() * 22)
          const y = sj * 32 + 4 + Math.floor(rn() * 22)
          if (r.get(x, y) === S[1]) {
            r.set(x, y, S[2])
            r.set(x + 1, y, S[2])
          }
        }
        if (rn() < 0.22)
          crack(r, si * 32 + 6 + Math.floor(rn() * 18), sj * 32 + 5, 1, 1, 7 + Math.floor(rn() * 8), rn, S[3])
      }
    // clock dial
    if (ih(a, b, 353) > 0.88) {
      const cx = 32
      const cy = 32
      r.ring(cx, cy, 21, 23, GOLD[2])
      r.ring(cx, cy, 22, 23, GOLD[3])
      r.ring(cx, cy, 21, 22, GOLD[1])
      r.ring(cx, cy, 9, 10.5, GOLD[2])
      for (let k = 0; k < 12; k++) {
        const an = (k / 12) * Math.PI * 2
        const r0 = k % 3 === 0 ? 14 : 17
        r.line(
          cx + Math.cos(an) * r0,
          cy + Math.sin(an) * r0,
          cx + Math.cos(an) * 20,
          cy + Math.sin(an) * 20,
          k % 3 === 0 ? GOLD[0] : GOLD[1]
        )
      }
      r.ellipse(cx, cy, 2.5, 2.5, GOLD[1])
      r.set(cx - 1, cy - 1, GOLD[0])
    }
    return r
  })
}

/** Overlapping clay shingles in world alignment: 16 px wide, 8 px rows, upper tails over lower rows. */
export function shingles(a: number, b: number): Raster {
  return memo(`sh${a},${b}`, () => {
    const r = tile()
    for (let row = 8; row >= -1; row--) {
      const wrow = b * 8 + row
      const off = (mod(wrow, 2) === 1 ? 8 : 0) - 16
      for (let j = 0; j < 6; j++) {
        const x0 = off + j * 16
        const wj = a * 4 + j + (mod(wrow, 2) === 1 ? -1 : 0)
        const tone = ih(mod(wj, 32), mod(wrow, 64), 371)
        const y0 = row * 8
        const base = tone < 0.16 ? RT[0] : tone > 0.82 ? RT[2] : RT[1]
        for (let u = 0; u < 16; u++) {
          const s = Math.abs(u - 7.5) / 7.5
          const bottom = 9 - Math.round(2.6 * s * s * s)
          for (let k = -3; k < bottom; k++) {
            let c = base
            if (k < 0) c = base
            else if (k === 0) c = base === RT[2] ? RT[1] : RT[0]
            else if (k >= bottom - 2) c = k === bottom - 1 ? RT[3] : RT[2]
            else if (k >= bottom - 4 && base !== RT[0]) c = bayer(x0 + u, y0 + k) < 0.4 ? RT[2] : base
            if (u === 0 && k > 0 && k < bottom - 1) c = k < 3 ? RT[0] : base === RT[0] ? RT[1] : base
            if (u === 15 && k > 0) c = RT[2]
            if (u === 15 && k === bottom - 1) c = RT[3]
            r.set(x0 + u, y0 + k, c)
          }
        }
      }
    }
    return r
  })
}

export { DARKER, C, RT, SK }
