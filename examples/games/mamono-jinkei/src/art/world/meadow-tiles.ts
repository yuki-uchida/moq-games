/** Stage 1 terrain: ぷるぷる草原と古城跡. Every tile is 64×64, periodic in 8×8 tiles so variants can be cached. */
import { TILE_FRAMES } from '../contract'
import type { TileQuery } from '../index'
import { C, R } from '../palette'
import { Raster, bayer, rng } from '../raster'
import type { TileKind } from '../../vocab'
import {
  D,
  G,
  GD,
  S,
  T,
  W,
  WOOD,
  STEEL,
  blob,
  crack,
  ih,
  leafy,
  mod,
  noisePatch,
  paintSlabs,
  slabLayout,
  tile,
  vn1
} from './gfx'

const VARIANTS = 8
const cache = new Map<string, Raster>()
const BRICK_TONE = Array.from({ length: 256 }, (_, i) => ih(i, 3, 77))
const memo = (key: string, make: () => Raster) => {
  let r = cache.get(key)
  if (!r) cache.set(key, (r = make()))
  return r
}

// Neighbour indices in TileQuery.around.
const N = 0
const E = 2
const Sx = 4
const Wx = 6
const NE = 1
const SE = 3
const SW = 5
const NW = 7

const isWater = (k?: TileKind) => k === 'water'
const grassy = (k?: TileKind) => k === 'grass' || k === 'flowers' || k === 'fence' || k === 'hedge'

// ---------------------------------------------------------------- grass

const FLOWER_SETS = [
  { petal: R.jobRed, centre: R.jobGold[0] },
  { petal: R.paper, centre: R.jobGold[1] },
  { petal: R.jobGold, centre: R.jobRed[2] },
  { petal: R.jobBlue, centre: R.paper[0] }
]

function blade(r: Raster, x: number, y: number, h: number, lean: number, dark = false) {
  for (let i = 0; i < h; i++) {
    const top = i === h - 1
    const c = top ? (dark ? GD[0] : G[0]) : dark ? GD[2] : G[2]
    r.set(x + (i >= h - 2 ? lean : 0), y - i, c)
  }
}

function tuft(r: Raster, x: number, y: number) {
  blade(r, x, y, 2, -1)
  blade(r, x + 2, y, 3, 0)
  blade(r, x + 4, y, 2, 1)
}

function clump(r: Raster, x: number, y: number, rnd: () => number) {
  r.ellipse(x + 0.5, y + 1, 5, 1.6, GD[2])
  for (let k = -3; k <= 3; k++) {
    const h = Math.round(5 - Math.abs(k) * 0.8 + rnd() * 1.5)
    blade(r, x + k * 1.2, y, h, Math.sign(k) * (Math.abs(k) > 1 ? 1 : 0), k > 0)
  }
}

function flower(r: Raster, x: number, y: number, set: (typeof FLOWER_SETS)[number]) {
  const p = set.petal
  r.set(x, y + 2, GD[2])
  r.set(x, y + 1, GD[1])
  r.set(x, y - 1, p[0])
  r.set(x - 1, y, p[1])
  r.set(x + 1, y, p[2])
  r.set(x, y + 1, p[2])
  r.set(x, y, set.centre)
  r.set(x, y + 2, GD[2])
}

function grassTone(a: number, b: number) {
  return memo(`gt${a},${b}`, () => {
    const r = tile()
    const n1 = noisePatch(a * T, b * T, 64, 1)
    const n2 = noisePatch(a * T, b * T, 32, 2)
    const n3 = noisePatch(a * T, b * T, 16, 5)
    // One base tone with a barely lighter second tone; the soft edge is a short ordered dither.
    for (let i = 0; i < T * T; i++) {
      const n = n1[i] * 0.4 + n2[i] * 0.35 + n3[i] * 0.25 + (bayer(i % T, (i / T) | 0) - 0.5) * 0.08
      r.data[i] = n > 0.56 ? GD[0] : G[1]
    }
    return r
  })
}

/** Small ground details that break up wide meadows: pebbles, bare soil, clover, leaf piles, tiny flowers. */
function pebble(r: Raster, x: number, y: number) {
  r.rect(x, y + 2, 4, 1, GD[2])
  r.rect(x, y, 3, 2, S[1])
  r.set(x, y, S[0])
  r.set(x + 1, y, S[0])
  r.set(x + 2, y + 1, S[2])
  r.set(x + 3, y + 1, GD[2])
}

function soil(r: Raster, x: number, y: number) {
  r.rect(x, y, 4, 2, D[1])
  r.rect(x + 1, y - 1, 2, 1, D[0])
  r.rect(x + 1, y + 2, 3, 1, D[2])
  r.set(x - 1, y + 1, GD[1])
  r.set(x + 4, y, GD[1])
}

function clover(r: Raster, x: number, y: number) {
  for (const [dx, dy] of [
    [0, 0],
    [2, 0],
    [1, -1],
    [1, 1]
  ] as const)
    r.set(x + dx, y + dy, GD[1])
  r.set(x + 1, y, GD[0])
}

function leafPile(r: Raster, x: number, y: number) {
  r.ellipse(x + 3, y + 3, 4, 2, GD[2])
  r.ellipse(x + 2.5, y + 2, 3.5, 1.8, GD[1])
  r.rect(x + 1, y + 1, 2, 1, GD[0])
  r.set(x + 5, y + 2, G[0])
}

function tinyFlower(r: Raster, x: number, y: number, c: number) {
  r.set(x, y, c)
  r.set(x, y + 1, GD[1])
}

function grassBase(tx: number, ty: number, withFlowers: boolean): Raster {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  const v = Math.floor(ih(tx, ty, 99) * VARIANTS)
  return memo(`g${a},${b},${v},${withFlowers ? 1 : 0}`, () => {
    const r = grassTone(a, b).clone()
    const rnd = rng(v * 7919 + a * 104729 + b * 1299709 + 13)
    const pick = () => 8 + Math.floor(rnd() * 46)
    const n = withFlowers ? 5 : 10
    for (let i = 0; i < n; i++) tuft(r, pick(), pick())
    for (let i = 0; i < 2; i++) leafPile(r, pick(), pick())
    clover(r, pick(), pick())
    if (v % 3 !== 2) clover(r, pick(), pick())
    if (v % 2 === 0) pebble(r, pick(), pick())
    if (v % 3 === 1) soil(r, pick(), pick())
    if (!withFlowers) for (let i = 0; i < 2; i++) tinyFlower(r, pick(), pick(), i ? R.jobGold[1] : R.paper[0])
    if (withFlowers) {
      for (let i = 0; i < 5; i++) {
        const cx = 12 + Math.floor(rnd() * 40)
        const cy = 12 + Math.floor(rnd() * 40)
        const set = FLOWER_SETS[Math.floor(rnd() * 4)]
        for (let k = 0; k < 3 + (i % 2); k++)
          flower(r, cx + Math.round((rnd() - 0.5) * 12), cy + Math.round((rnd() - 0.5) * 8), set)
      }
    } else {
      clump(r, pick(), pick(), rnd)
      if (v % 2) clump(r, pick(), pick(), rnd)
    }
    return r
  })
}

// ---------------------------------------------------------------- shore banks (land tiles beside water)

/** Earthen bank where a land tile borders water: lips on N/W/E, a shaded earth face on the south. */
function addBank(r: Raster, q: TileQuery) {
  const ox = mod(q.tx, 8) * T
  const oy = mod(q.ty, 8) * T
  const a = q.around
  const rn = rng(q.tx * 31 + q.ty * 17 + 5)
  if (isWater(a[N]))
    for (let x = 0; x < T; x++) {
      const e = 2 + Math.floor(vn1(ox + x, 10, 41) * 3)
      for (let y = 0; y < e; y++) r.set(x, y, y === 0 ? D[2] : y === 1 ? D[1] : D[0])
      r.set(x, e, G[2])
    }
  if (isWater(a[Wx]))
    for (let y = 0; y < T; y++) {
      const e = 2 + Math.floor(vn1(oy + y, 10, 42) * 3)
      for (let x = 0; x < e; x++) r.set(x, y, x === 0 ? D[2] : x === 1 ? D[1] : D[0])
      r.set(e, y, G[2])
    }
  if (isWater(a[E]))
    for (let y = 0; y < T; y++) {
      const e = 2 + Math.floor(vn1(oy + y, 10, 43) * 3)
      for (let x = 0; x < e; x++) r.set(T - 1 - x, y, x === 0 ? D[3] : x === 1 ? D[2] : D[1])
      r.set(T - 1 - e, y, G[3])
    }
  if (isWater(a[Sx])) {
    for (let x = 0; x < T; x++) {
      const yb = 53 + Math.floor(vn1(ox + x, 8, 44) * 4)
      for (let y = yb; y < T; y++) {
        const d = y - yb
        let c = d === 0 ? G[3] : y >= T - 2 ? D[3] : d < 3 ? D[2] : D[2]
        if (d > 0 && (x + (d >> 1)) % 7 === 0 && y < T - 2) c = D[3]
        r.set(x, y, c)
      }
    }
    for (let i = 0; i < 3; i++) {
      const sx = 4 + Math.floor(rn() * 52)
      r.ellipse(sx, 61, 3, 1.6, S[2])
      r.rect(sx - 2, 59, 3, 1, S[1])
    }
  }
}

// ---------------------------------------------------------------- grass, flowers

function grassTile(q: TileQuery, flowers: boolean) {
  const wet = [N, E, Sx, Wx].map((i) => (isWater(q.around[i]) ? 1 : 0)).join('')
  return memo(`G${flowers}${mod(q.tx, 8)},${mod(q.ty, 8)},${Math.floor(ih(q.tx, q.ty, 99) * VARIANTS)},${wet}`, () => {
    const r = grassBase(q.tx, q.ty, flowers).clone()
    if (wet !== '0000') addBank(r, q)
    return r
  })
}

// ---------------------------------------------------------------- path

function dirtBase(tx: number, ty: number): Raster {
  const a = mod(tx, 8)
  const b = mod(ty, 8)
  return memo(`d${a},${b}`, () => {
    const r = tile()
    const ox = a * T
    const oy = b * T
    const n1 = noisePatch(ox, oy, 64, 21)
    const n2 = noisePatch(ox, oy, 32, 22)
    // One packed-earth tone; light and dark grains thicken gently instead of forming patches (world-hashed, so
    // they run on across tile borders).
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const i = y * T + x
        const v = n1[i] * 0.6 + n2[i] * 0.4
        const h = ih(ox + x, oy + y, 23)
        let c = D[1]
        if (v > 0.5 && h < (v - 0.5) * 0.5) c = D[0]
        else if (v < 0.5 && h < (0.5 - v) * 0.5) c = D[2]
        r.data[i] = c
      }
    const rnd = rng(a * 91 + b * 17 + 3)
    const spot = () => 6 + Math.floor(rnd() * 50)
    // pebbles with a lit top and a cast shadow
    for (let i = 0; i < 5; i++) {
      const x = spot()
      const y = spot()
      const big = i < 2
      r.rect(x, y + 1, big ? 5 : 3, 1, D[3])
      r.rect(x, y, big ? 4 : 3, big ? 3 : 2, S[1])
      r.rect(x, y, big ? 3 : 2, 1, S[0])
      r.set(x + (big ? 3 : 2), y + 1, S[2])
      if (big) r.rect(x + 1, y + 3, 4, 1, D[2])
    }
    // wheel ruts: thin broken streaks with a lit lip
    const horizontal = ih(a, b, 31) < 0.5
    for (let k = 0; k < 1 + (ih(a, b, 35) < 0.5 ? 1 : 0); k++) {
      let x = 5 + Math.floor(rnd() * 20)
      let y = 8 + Math.floor(rnd() * 44)
      const len = 14 + Math.floor(rnd() * 22)
      for (let i = 0; i < len; i++) {
        if (i % 9 === 8) {
          if (horizontal) x += 2
          else y += 2
          continue
        }
        const [px, py] = horizontal ? [x + i, y + Math.round(Math.sin(i * 0.2 + k) * 1)] : [y, x + i]
        r.set(px, py, D[2])
        if (i % 3 === 0) r.set(horizontal ? px : px + 1, horizontal ? py - 1 : py, D[0])
      }
    }
    // footprint dents
    for (let i = 0; i < 3; i++) {
      const x = spot()
      const y = spot()
      r.rect(x, y, 3, 2, D[2])
      r.set(x, y, D[3])
      r.rect(x + 1, y + 2, 3, 1, D[0])
    }
    // a dry crack or two and a tuft that pushed through
    if (ih(a, b, 33) < 0.5) crack(r, spot(), spot(), 1, 1, 6, rnd, D[3])
    if (ih(a, b, 34) < 0.35) {
      const x = spot()
      const y = spot()
      blade(r, x, y, 3, 0)
      blade(r, x + 2, y, 2, 1)
    }
    return r
  })
}

function pathTile(q: TileQuery) {
  const a = q.around
  const side = (i: number) => (grassy(a[i]) ? 1 : 0)
  const sig = [N, E, Sx, Wx].map(side).join('') + [NE, SE, SW, NW].map(side).join('')
  const wet = [N, E, Sx, Wx].map((i) => (isWater(a[i]) ? 1 : 0)).join('')
  return memo(`P${mod(q.tx, 8)},${mod(q.ty, 8)},${sig},${wet}`, () => {
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const r = dirtBase(q.tx, q.ty).clone()
    if (sig === '00000000') {
      if (wet !== '0000') addBank(r, q)
      return r
    }
    const grass = grassBase(q.tx, q.ty, false)
    const g = new Uint8Array(T * T)
    const depth = (w: number, seed: number) => 5 + Math.floor(vn1(w, 16, seed) * 7)
    const gN = side(N)
    const gE = side(E)
    const gS = side(Sx)
    const gW = side(Wx)
    const dNa = new Int16Array(T)
    const dSa = new Int16Array(T)
    const dWa = new Int16Array(T)
    const dEa = new Int16Array(T)
    for (let i = 0; i < T; i++) {
      dNa[i] = gN ? depth(ox + i, 61) : 0
      dSa[i] = gS ? depth(ox + i, 62) : 0
      dWa[i] = gW ? depth(oy + i, 63) : 0
      dEa[i] = gE ? depth(oy + i, 64) : 0
    }
    const rc = 9
    const nr = (8 + ih(q.tx, q.ty, 70) * 4) | 0
    const convex: [number, number][] = []
    if (gN && gW) convex.push([0, 0])
    if (gN && gE) convex.push([1, 0])
    if (gS && gW) convex.push([0, 1])
    if (gS && gE) convex.push([1, 1])
    const concave: [number, number][] = []
    if (!gN && !gW && side(NW)) concave.push([0, 0])
    if (!gN && !gE && side(NE)) concave.push([T - 1, 0])
    if (!gS && !gW && side(SW)) concave.push([0, T - 1])
    if (!gS && !gE && side(SE)) concave.push([T - 1, T - 1])
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const dN = dNa[x]
        const dS = dSa[x]
        const dW = dWa[y]
        const dE = dEa[y]
        let inG = y < dN || y >= T - dS || x < dW || x >= T - dE
        if (!inG)
          for (const [cx, cy] of convex) {
            const px = cx === 0 ? x - (dW + rc) : x - (T - 1 - dE - rc)
            const py = cy === 0 ? y - (dN + rc) : y - (T - 1 - dS - rc)
            if ((cx === 0 ? px < 0 : px > 0) && (cy === 0 ? py < 0 : py > 0) && px * px + py * py > rc * rc) inG = true
          }
        if (!inG) for (const [px, py] of concave) if (Math.hypot(x - px, y - py) < nr) inG = true
        if (inG) g[y * T + x] = 1
      }
    const isG = (x: number, y: number) => (x < 0 || y < 0 || x >= T || y >= T ? -1 : g[y * T + x])
    const out = r.clone()
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (g[y * T + x]) {
          let c = grass.get(x, y)
          const dirtS = isG(x, y + 1) === 0
          const dirtE = isG(x + 1, y) === 0
          const dirtN = isG(x, y - 1) === 0
          const dirtW = isG(x - 1, y) === 0
          if (dirtS) c = G[3]
          else if (dirtE) c = G[2]
          else if (dirtN || dirtW) c = G[0]
          else if (isG(x, y + 2) === 0 || isG(x + 2, y) === 0) c = c === G[0] ? G[1] : c === G[1] ? G[2] : c
          out.set(x, y, c)
        } else {
          let c = r.get(x, y)
          if (isG(x, y - 1) === 1) c = D[3]
          else if (isG(x, y - 2) === 1 || isG(x - 1, y) === 1) c = D[2]
          else if (isG(x + 1, y) === 1 || isG(x, y + 1) === 1) c = D[0]
          out.set(x, y, c)
        }
      }
    // Grass tufts hanging over the edge.
    const rn = rng(q.tx * 977 + q.ty * 131 + 9)
    for (let y = 1; y < T - 1; y++)
      for (let x = 1; x < T - 1; x++) {
        if (g[y * T + x] !== 1 || rn() > 0.07) continue
        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0]
        ] as const) {
          if (isG(x + dx, y + dy) !== 0) continue
          const len = 2 + Math.floor(rn() * 2)
          for (let i = 1; i <= len; i++)
            for (let w = 0; w < 2; w++) {
              const px = x + dx * i + (dy ? w : 0)
              const py = y + dy * i + (dx ? w : 0)
              if (isG(px, py) !== 0) continue
              out.set(px, py, i === len ? G[0] : dx + dy > 0 && i === 1 ? G[2] : G[1])
            }
          // contact shadow under the tuft
          if (dy === 1) out.set(x, y + len + 1, D[2])
          break
        }
      }
    if (wet !== '0000') addBank(out, q)
    return out
  })
}

// ---------------------------------------------------------------- floor (worn ruins flagstones)

function mossAt(r: Raster, x: number, y: number, rn: () => number, size = 1) {
  const n = 2 + Math.floor(rn() * 3)
  for (let i = 0; i < n; i++)
    blob(
      r,
      x + Math.round((rn() - 0.5) * 6 * size),
      y + Math.round((rn() - 0.5) * 3 * size),
      2 + rn() * 2 * size,
      1.5 + rn() * 1.2 * size,
      GD
    )
}

export function floorTile(q: TileQuery) {
  const wet = [N, E, Sx, Wx].map((i) => (isWater(q.around[i]) ? 1 : 0)).join('')
  return memo(`F${mod(q.tx, 8)},${mod(q.ty, 8)},${wet}`, () => {
    const r = tile()
    const slabs = slabLayout(q.tx, q.ty, T, 5)
    paintSlabs(r, slabs, [S[0], S[1], S[2], S[3]])
    const rn = rng(mod(q.tx, 8) * 53 + mod(q.ty, 8) * 7 + 1)
    for (const s of slabs) {
      // wear specks
      for (let i = 0; i < 3; i++) {
        const x = s.x0 + 3 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 6))
        const y = s.y0 + 3 + Math.floor(rn() * Math.max(1, s.y1 - s.y0 - 6))
        if (r.get(x, y) === S[1]) {
          r.set(x, y, S[2])
          r.set(x + 1, y, S[2])
        }
      }
      if (rn() < 0.35) {
        const x = s.x0 + 5 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 10))
        const y = s.y0 + 4 + Math.floor(rn() * Math.max(1, s.y1 - s.y0 - 8))
        crack(r, x, y, rn() < 0.5 ? 1 : -1, 1, 6 + Math.floor(rn() * 8), rn, S[3])
      }
      // moss creeping from the joints
      if (rn() < 0.4) mossAt(r, rn() < 0.5 ? s.x1 - 3 : s.x0 + 3, s.y1 - 3, rn)
    }
    if (wet !== '0000') addBank(r, q)
    return r
  })
}

// ---------------------------------------------------------------- bridge

function bridgeTile(q: TileQuery) {
  const a = q.around
  const wH = isWater(a[Wx]) || isWater(a[E])
  const wV = isWater(a[N]) || isWater(a[Sx])
  // Travel direction: true = vertical (planks lie across, horizontally).
  let vertical = wH && !wV
  if (!wH && !wV) vertical = a[N] === 'bridge' || a[Sx] === 'bridge'
  const sidesA = vertical ? isWater(a[Wx]) : isWater(a[N])
  const sidesB = vertical ? isWater(a[E]) : isWater(a[Sx])
  return memo(`B${mod(q.tx, 8)},${mod(q.ty, 8)},${vertical},${sidesA},${sidesB}`, () => {
    const r = tile()
    const rn = rng(mod(q.tx, 8) * 19 + mod(q.ty, 8) * 5 + 2)
    // Plank layout along the travel direction; horizontal planks are 13 px tall (joined at tile borders).
    const pw = 13
    const plank = (i: number, len: number) => {
      const p0 = i * pw
      const p1 = Math.min(T, p0 + pw)
      const tone = Math.floor(ih(q.tx + i, q.ty, 8) * 3)
      for (let u = p0; u < p1; u++)
        for (let v = 0; v < len; v++) {
          let c = tone === 1 ? WOOD[0] : WOOD[1]
          if (tone === 0 && (v + u * 3) % 17 === 0) c = WOOD[2]
          if (u === p0) c = WOOD[0]
          else if (u === p1 - 1) c = WOOD[3]
          else if (u === p1 - 2) c = WOOD[2]
          const [x, y] = vertical ? [v, u] : [u, v]
          r.set(x, y, c)
        }
      // grain streaks
      for (let k = 0; k < 2; k++) {
        const u = p0 + 3 + Math.floor(rn() * (pw - 6))
        const v0 = Math.floor(rn() * (len - 14))
        for (let v = v0; v < v0 + 7 + Math.floor(rn() * 6); v++) {
          const [x, y] = vertical ? [v, u] : [u, v]
          if (r.get(x, y) !== WOOD[3]) r.set(x, y, WOOD[2])
        }
      }
    }
    for (let i = 0; i < 5; i++) plank(i, T)
    // Nails.
    for (let i = 0; i < 5; i++) {
      const u = i * pw + 4 + (i % 2)
      for (const v of [8, T - 9]) {
        const [x, y] = vertical ? [v, u] : [u, v]
        r.set(x, y, WOOD[3])
        const [x2, y2] = vertical ? [v - 1, u - 1] : [u - 1, v - 1]
        r.set(x2, y2, WOOD[0])
      }
    }
    // Edge beams over open water; the near (south / east) beam shows its front face.
    const edgeBeam = (atStart: boolean) => {
      for (let u = 0; u < T; u++)
        for (let k = 0; k < 8; k++) {
          const dist = atStart ? k : T - 1 - k
          const [x, y] = vertical ? [dist, u] : [u, dist]
          let c: number
          if (atStart) c = k === 0 ? WOOD[3] : k === 1 ? WOOD[0] : k < 5 ? WOOD[1] : k === 5 ? WOOD[2] : WOOD[3]
          else if (vertical) c = k === 0 ? WOOD[3] : k < 3 ? WOOD[3] : k === 3 ? WOOD[2] : k === 4 ? WOOD[2] : WOOD[1]
          else c = k < 2 ? WOOD[3] : k < 4 ? WOOD[2] : k === 4 ? WOOD[1] : k === 5 ? WOOD[0] : WOOD[1]
          r.set(x, y, c)
        }
    }
    if (sidesA) edgeBeam(true)
    if (sidesB) edgeBeam(false)
    // Posts where rails would be: short stubs at the beam ends.
    for (const [on, atStart] of [
      [sidesA, true],
      [sidesB, false]
    ] as const) {
      if (!on) continue
      for (const u of [0, T - 7]) {
        for (let k = 0; k < 7; k++)
          for (let m = 0; m < 7; m++) {
            const dist = atStart ? k : T - 1 - k
            const [x, y] = vertical ? [dist, u + m] : [u + m, dist]
            r.set(x, y, k === 0 || m === 6 ? WOOD[3] : k === 1 || m === 0 ? WOOD[0] : k > 4 ? WOOD[2] : WOOD[1])
          }
      }
    }
    return r
  })
}

// ---------------------------------------------------------------- wall and hedge

export function massTile(q: TileQuery, kind: 'wall' | 'hedge') {
  const a = q.around
  const same = (i: number) => a[i] === kind
  const sig = [N, E, Sx, Wx, NE, SE, SW, NW].map((i) => (same(i) ? 1 : 0)).join('')
  return memo(`${kind[0]}${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const front = !same(Sx)
    const TH = front ? 40 : T
    const isWall = kind === 'wall'
    const line = isWall ? S[3] : GD[4]
    // Silhouette insets (irregular on open sides).
    const insetN = (x: number) =>
      same(N) ? 0 : isWall ? 1 + Math.floor(vn1(ox + x, 6, 51) * 2.4) : 1 + Math.floor(vn1(ox + x, 8, 51) * 3.2)
    const insetW = (y: number) => (same(Wx) ? 0 : 1 + Math.floor(vn1(oy + y, 8, 52) * (isWall ? 2.4 : 3.2)))
    const insetE = (y: number) => (same(E) ? 0 : 1 + Math.floor(vn1(oy + y, 8, 53) * (isWall ? 2.4 : 3.2)))
    const m = new Raster(T, T)
    const inside = (x: number, y: number) => y >= insetN(x) && x >= insetW(y) && x < T - insetE(y)
    if (isWall) {
      const capRamp = [R.paper[1], S[0], S[1], S[2], S[3]] as const
      const slabs = slabLayout(q.tx, q.ty, TH, 31)
      paintSlabs(m, slabs, [capRamp[0], capRamp[1], capRamp[2], capRamp[3]])
      const rn = rng(mod(q.tx, 8) * 131 + mod(q.ty, 8) * 17 + 4)
      for (const s of slabs) {
        if (rn() < 0.45) {
          const x = s.x0 + 4 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 8))
          mossAt(m, x, rn() < 0.5 ? s.y0 + 4 : s.y1 - 4, rn)
        }
        if (rn() < 0.25) {
          crack(
            m,
            s.x0 + 6 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 12)),
            s.y0 + 3,
            1,
            1,
            6 + Math.floor(rn() * 6),
            rn,
            S[3]
          )
        }
      }
      // Moss on exposed back / side edges.
      for (let x = 0; x < T; x++)
        if (!same(N) && vn1(ox + x, 12, 55) > 0.62) for (let y = 1; y < 4; y++) m.set(x, y, y === 3 ? GD[2] : GD[1])
      if (front) {
        for (let y = TH; y < T; y++)
          for (let x = 0; x < T; x++) {
            const course = Math.floor((y - TH) / 8)
            const ry = (y - TH) % 8
            const wx = ox + x + (course % 2) * 11
            const bw = 22
            const rx = mod(wx, bw)
            const bid = Math.floor(wx / bw) * 3 + course
            let c = S[2]
            const tone = BRICK_TONE[mod(bid, 256)]
            if (tone < 0.18) c = S[1]
            else if (tone > 0.88) c = S[3]
            if (ry === 0) c = course === 0 ? S[0] : S[1]
            else if (ry === 1 && course === 0) c = S[3]
            if (ry === 7) c = S[3]
            else if (rx === bw - 1) c = S[3]
            else if (rx === 0 && ry > 0) c = c === S[2] ? S[1] : c
            if (y === T - 1) c = S[3]
            m.set(x, y, c)
          }
        // chips and moss dripping from the lip
        for (let x = 0; x < T; x++) {
          const v = vn1(ox + x, 8, 56)
          if (v > 0.7) {
            const len = 3 + Math.floor((v - 0.7) * 30)
            for (let i = 0; i < len; i++) m.set(x, TH + 2 + i, i > len - 3 ? GD[2] : GD[1])
            m.set(x, TH + 2, GD[0])
          }
        }
        // cap lip highlight
        for (let x = 0; x < T; x++) m.set(x, TH - 1, S[1])
      }
    } else {
      const top = [GD[0], GD[1], GD[2], GD[3], GD[4]] as const
      const dark = [GD[1], GD[2], GD[3], GD[4], GD[4]] as const
      leafy(m, 0, 0, T, T, ox, oy, top, 14, 61)
      if (front) {
        const lip = (x: number) => TH - 2 + Math.floor(vn1(ox + x, 10, 57) * 5)
        const tmp = new Raster(T, T)
        leafy(tmp, 0, 0, T, T, ox, oy + 8, dark, 14, 67)
        for (let x = 0; x < T; x++)
          for (let y = lip(x); y < T; y++) {
            let c = tmp.get(x, y)
            if (y === lip(x)) c = GD[3]
            m.set(x, y, c)
          }
        for (let x = 0; x < T; x++) m.set(x, T - 1, GD[4])
      }
    }
    // Compose over grass with silhouette + selective contour.
    const out = grassBase(q.tx, q.ty, false).clone()
    const shape = new Raster(T, T)
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (inside(x, y)) shape.set(x, y, m.get(x, y) || line)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (!shape.get(x, y)) continue
        let c = shape.get(x, y)
        const open = (dx: number, dy: number) => {
          const nx = x + dx
          const ny = y + dy
          return nx >= 0 && ny >= 0 && nx < T && ny < T && !shape.get(nx, ny)
        }
        if (open(0, -1) || open(-1, 0) || open(1, 0)) c = line
        else if (front && y === T - 1) c = line
        out.set(x, y, c)
      }
    // contact shadow under the front face on the ground to the side
    return out
  })
}

// ---------------------------------------------------------------- fence

function fenceTile(q: TileQuery) {
  const a = q.around
  const l = a[Wx] === 'fence'
  const rr = a[E] === 'fence'
  const u = a[N] === 'fence'
  const d = a[Sx] === 'fence'
  const wet = [N, E, Sx, Wx].map((i) => (isWater(a[i]) ? 1 : 0)).join('')
  return memo(`f${mod(q.tx, 8)},${mod(q.ty, 8)},${+l}${+rr}${+u}${+d},${wet}`, () => {
    const r = grassBase(q.tx, q.ty, false).clone()
    if (wet !== '0000') addBank(r, q)
    const gy = 46 // ground line of the post
    const shadow = (x0: number, x1: number, y: number, h = 1) => {
      for (let x = x0; x < x1; x++)
        for (let i = 0; i < h; i++) r.paint(x, y + i, r.get(x, y + i) === G[0] ? G[1] : G[2])
    }
    // vertical rails first (behind the post): they lie in the depth direction.
    if (u || d) {
      const y0 = u ? 0 : 18
      const y1 = d ? T : gy - 22
      shadow(34, 40, y0 + 14, y1 - y0)
      for (let y = y0; y < y1; y++) {
        r.set(28, y, WOOD[0])
        r.rect(29, y, 4, 1, WOOD[1])
        r.set(33, y, WOOD[2])
        r.set(34, y, WOOD[3])
      }
    }
    // horizontal rails
    const hx0 = l ? 0 : 29
    const hx1 = rr ? T : 35
    if (l || rr) {
      shadow(hx0 + 2, hx1 + 2, gy - 3, 3)
      for (const ry of [gy - 25, gy - 14]) {
        for (let x = hx0; x < hx1; x++) {
          r.set(x, ry, WOOD[0])
          r.set(x, ry + 1, WOOD[1])
          r.set(x, ry + 2, WOOD[1])
          r.set(x, ry + 3, WOOD[2])
          r.set(x, ry + 4, WOOD[3])
        }
      }
    }
    // post (3/4 view: lit top cap + front face)
    r.ellipse(33.5, gy + 1, 6, 2.2, G[2])
    r.ellipse(34, gy + 1.4, 5, 1.6, GD[2])
    for (let y = gy - 30; y <= gy; y++)
      for (let x = 28; x < 36; x++) {
        let c = WOOD[1]
        if (x === 28) c = WOOD[0]
        else if (x >= 34) c = WOOD[2]
        if (x === 35) c = WOOD[3]
        if (y === gy) c = WOOD[3]
        r.set(x, y, c)
      }
    r.rect(28, gy - 32, 8, 3, WOOD[0])
    r.rect(28, gy - 30, 8, 1, WOOD[1])
    r.rect(29, gy - 33, 6, 1, WOOD[0])
    r.set(35, gy - 32, WOOD[2])
    r.set(35, gy - 31, WOOD[2])
    // outline of the cap
    r.rect(28, gy - 34, 8, 1, WOOD[3])
    return r
  })
}

// ---------------------------------------------------------------- water

function waterBase(ox: number, oy: number) {
  return memo(`wb${ox},${oy}`, () => {
    const r = tile()
    const n1 = noisePatch(ox, oy, 32, 31)
    const n2 = noisePatch(ox, oy, 16, 32)
    for (let i = 0; i < T * T; i++) r.data[i] = n1[i] * 0.65 + n2[i] * 0.35 < 0.27 ? W[2] : W[1]
    return r
  })
}

function waterTile(q: TileQuery) {
  const a = q.around
  const type = (i: number): number => {
    const k = a[i]
    if (k === undefined || k === 'water' || k === 'pit') return 0
    return k === 'bridge' ? 2 : 1
  }
  const ts = [N, NE, E, SE, Sx, SW, Wx, NW].map(type)
  const sig = ts.join('')
  return memo(`w${mod(q.tx, 8)},${mod(q.ty, 8)},${q.frame},${sig}`, () => {
    const f = q.frame
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const r = waterBase(ox, oy).clone()
    // ripples: short dashes that swell and fade in place
    const cw = 32
    const ch = 16
    for (let cy = Math.floor((oy - 4) / ch); cy <= Math.floor((oy + T + 4) / ch); cy++)
      for (let cx = Math.floor((ox - 14) / cw); cx <= Math.floor((ox + T + 14) / cw); cx++) {
        const mx = mod(cx, PER / cw)
        const my = mod(cy, PER / ch)
        if (ih(mx, my, 81) > 0.72) continue
        const px = cx * cw + Math.floor(ih(mx, my, 82) * 24) - ox
        const py = cy * ch + 2 + Math.floor(ih(mx, my, 83) * 11) - oy
        const ph = Math.floor(ih(mx, my, 84) * 4)
        const len = [3, 7, 10, 5][(f + ph) & 3]
        const half = len >> 1
        for (let i = -half; i <= half; i++) {
          r.set(px + i, py, W[0])
          if (Math.abs(i) < half - 1) r.set(px + i + 1, py + 1, W[2])
        }
        if (len > 6) {
          r.set(px - half - 1, py + 1, W[0])
          r.set(px + half + 1, py + 1, W[0])
        }
      }
    // sparkles
    for (let cy = Math.floor((oy - 4) / 32); cy <= Math.floor((oy + T + 4) / 32); cy++)
      for (let cx = Math.floor((ox - 4) / 32); cx <= Math.floor((ox + T + 4) / 32); cx++) {
        const mx = mod(cx, PER / 32)
        const my = mod(cy, PER / 32)
        if (ih(mx, my, 91) > 0.55) continue
        if (((f + Math.floor(ih(mx, my, 92) * 4)) & 3) > 0) continue
        const px = cx * 32 + 3 + Math.floor(ih(mx, my, 93) * 26) - ox
        const py = cy * 32 + 3 + Math.floor(ih(mx, my, 94) * 26) - oy
        r.set(px, py, C.white)
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1]
        ] as const)
          r.set(px + dx, py + dy, W[0])
      }
    // shore: bank shadow, shallows and foam
    const hasLand = ts.some((t) => t)
    if (hasLand) {
      const out = r.clone()
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const wx = ox + x
          const wy = oy + y
          // distance to each land source with its type
          let shallow = 99
          let shadow = 99
          let foamD = 99
          const consider = (d: number, t: number, lit: boolean) => {
            if (!t) return
            if (t === 2) {
              if (d < (lit ? 4 : 5)) shadow = Math.min(shadow, d)
              return
            }
            if (lit) shadow = Math.min(shadow, d)
            else foamD = Math.min(foamD, d)
            shallow = Math.min(shallow, d)
          }
          const wob = (w: number, s: number) => (vn1(w, 12, s) - 0.5) * 4
          consider(y + wob(wx, 71), ts[0], true)
          consider(x + wob(wy, 72), ts[6], true)
          consider(T - 1 - x + wob(wy, 73), ts[2], false)
          consider(T - 1 - y + wob(wx, 74), ts[4], false)
          if (!ts[0] && !ts[6] && ts[7]) consider(Math.hypot(x, y) - 4 + wob(wx + wy, 75), ts[7], true)
          if (!ts[0] && !ts[2] && ts[1]) consider(Math.hypot(T - 1 - x, y) - 4 + wob(wx + wy, 76), ts[1], false)
          if (!ts[4] && !ts[6] && ts[5]) consider(Math.hypot(x, T - 1 - y) - 4 + wob(wx + wy, 77), ts[5], false)
          if (!ts[4] && !ts[2] && ts[3]) consider(Math.hypot(T - 1 - x, T - 1 - y) - 4 + wob(wx + wy, 78), ts[3], false)
          const sh = 7
          let c = r.get(x, y)
          if (shallow < sh) {
            const t = shallow / sh
            c = t < 0.55 ? W[0] : bayer(x, y) < 0.5 ? W[0] : W[1]
            if (t >= 0.8 && bayer(x + 1, y) > 0.5) c = W[1]
          }
          if (foamD < 2.2 && (((wx >> 1) + (wy >> 1) + f) & 3) !== 0) c = C.white
          else if (foamD < 3.2 && (((wx >> 1) + f) & 1) === 0 && shallow < sh) c = W[0]
          if (shadow < 3) c = shadow < 1.4 ? W[3] : W[2]
          else if (shadow < 4.5 && bayer(x, y) < 0.5) c = W[2]
          out.set(x, y, c)
        }
      return out
    }
    return r
  })
}
const PER = 512

// ---------------------------------------------------------------- pit and spikes

export function pitTile(q: TileQuery) {
  const a = q.around
  const pit = (i: number) => a[i] === 'pit'
  const sig = [N, E, Sx, Wx, NE, NW].map((i) => (pit(i) ? 1 : 0)).join('')
  return memo(`p${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const r = new Raster(T, T)
    r.rect(0, 0, T, T, C.black)
    if (!pit(N)) {
      for (let x = 0; x < T; x++) {
        const L = 4 + Math.floor(vn1(ox + x, 8, 101) * 4)
        const F = L + 15 + Math.floor(vn1(ox + x, 16, 102) * 5)
        for (let y = 0; y < F; y++) {
          let c: number
          if (y < L) c = y === 0 ? D[0] : y === L - 1 ? D[2] : D[1]
          else {
            const t = (y - L) / (F - L)
            const stripe = (mod(ox + x, 9) === 0 || ih(ox + x, 3, 104) < 0.12) && y > L + 1
            c = t < 0.3 ? D[1] : t < 0.55 ? D[2] : t < 0.8 ? D[3] : bayer(x, y) < 0.5 ? D[3] : C.black
            if (stripe && c !== C.black) c = c === D[1] ? D[2] : c === D[2] ? D[3] : C.black
            if (t < 0.12) c = D[0] === c ? c : D[1]
          }
          r.set(x, y, c)
        }
        // crumbling lip
        if (ih(ox + x, 5, 105) < 0.1) r.set(x, L, D[3])
      }
    }
    if (!pit(Wx))
      for (let y = 0; y < T; y++) {
        const e = 3 + Math.floor(vn1(oy + y, 8, 106) * 3)
        for (let x = 0; x < e; x++) r.set(x, y, x === e - 1 ? D[3] : x < 1 ? D[2] : D[1])
      }
    if (!pit(E))
      for (let y = 0; y < T; y++) {
        const e = 3 + Math.floor(vn1(oy + y, 8, 107) * 3)
        for (let x = 0; x < e; x++) r.set(T - 1 - x, y, x === e - 1 ? D[3] : x < 1 ? D[2] : D[2])
      }
    if (!pit(Sx))
      for (let x = 0; x < T; x++) {
        const e = 4 + Math.floor(vn1(ox + x, 8, 108) * 4)
        for (let k = 0; k < e; k++) r.set(x, T - 1 - k, k === e - 1 ? D[0] : k === e - 2 ? D[1] : D[2])
        r.set(x, T - 1 - e, D[3])
      }
    // vignette: a few dithered darker pixels near the edges inside
    return r
  })
}

function spikesTile(q: TileQuery) {
  return memo(`s${mod(q.tx, 8)},${mod(q.ty, 8)}`, () => {
    const r = tile()
    paintSlabs(r, [{ x0: 0, y0: 0, x1: T, y1: T, openL: true, openR: true, tone: 1 }], [S[0], S[1], S[2], S[3]])
    for (let x = 0; x < T; x++) if (ih(x, 1, 113) < 0.2) r.set(x, 30 + (x % 3), S[2])
    for (const by of [17, 37, 57])
      for (const bx of [13, 32, 51]) {
        // socket
        r.ellipse(bx + 0.5, by - 1, 6.5, 3, S[3])
        r.ellipse(bx + 0.5, by - 1.5, 5.5, 2.4, C.inkCool)
        // spike
        for (let i = 0; i < 13; i++) {
          const w = Math.max(1, Math.round(3.6 - i * 0.3))
          const y = by - 2 - i
          for (let k = -w; k <= w - 1; k++) {
            const c = k === -w ? STEEL[0] : k >= w - 1 ? STEEL[2] : STEEL[1]
            r.set(bx + k, y, i > 11 ? STEEL[0] : c)
          }
        }
        r.set(bx + 3, by - 2, STEEL[3])
        r.set(bx + 3, by - 3, STEEL[3])
        r.set(bx, by - 15, C.white)
      }
    return r
  })
}

// ---------------------------------------------------------------- provider

export function meadowTile(q: TileQuery): Raster | undefined {
  switch (q.kind) {
    case 'grass':
      return grassTile(q, false)
    case 'flowers':
      return grassTile(q, true)
    case 'path':
      return pathTile(q)
    case 'floor':
      return floorTile(q)
    case 'bridge':
      return bridgeTile(q)
    case 'wall':
      return massTile(q, 'wall')
    case 'hedge':
      return massTile(q, 'hedge')
    case 'fence':
      return fenceTile(q)
    case 'water':
      return waterTile({ ...q, frame: mod(q.frame, TILE_FRAMES.water ?? 4) })
    case 'pit':
      return pitTile(q)
    case 'spikes':
      return spikesTile(q)
    default:
      return undefined
  }
}
