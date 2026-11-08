/** Stage 2 terrain: 地下水路と穀物庫. Lit by lamps ('dim'), so values stay on the bright side. */
import type { TileKind } from '../../vocab'
import type { TileQuery } from '../index'
import { C, R } from '../palette'
import { Raster, bayer, rng } from '../raster'
import { crack, ih, mod, noisePatch, paintSlabs, slabLayout, tile, vn1 } from './gfx'
import { floorTile, massTile, pitTile } from './meadow-tiles'

const SS = R.sewerStone
const BR = R.brick
const SL = R.sludge
const W = R.water
const WOOD = R.wood
const HAY = R.hay
const MOSS = R.sludge

const cache = new Map<string, Raster>()
const memo = (key: string, make: () => Raster) => {
  let r = cache.get(key)
  if (!r) cache.set(key, (r = make()))
  return r
}

// Neighbour indices: N, NE, E, SE, S, SW, W, NW.
const N = 0
const E = 2
const S4 = 4
const W6 = 6

const liquid = (k?: TileKind) => k === 'current' || k === 'sludge'
const wallLike = (k?: TileKind) => k === 'wall' || k === 'brick' || k === 'hole'

/** Recolours through ramp pairs in one pass (never chained). */
export function recolour(r: Raster, pairs: readonly (readonly [readonly number[], readonly number[]])[]) {
  const table = new Map<number, number>()
  for (const [from, to] of pairs) for (let i = 0; i < 4; i++) table.set(from[i], to[i])
  return r.map((c) => table.get(c) ?? c)
}

// ---------------------------------------------------------------- stone floors

function puddle(r: Raster, cx: number, cy: number, rx: number, ry: number) {
  r.ellipse(cx, cy + 0.6, rx + 1, ry + 0.8, SS[3])
  r.ellipse(cx, cy, rx, ry, W[2])
  r.ellipse(cx - 0.5, cy - 0.5, rx - 1.2, ry - 0.9, W[1])
  r.rect(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.5), Math.max(2, Math.round(rx * 0.7)), 1, W[0])
}

function mossPatch(r: Raster, x: number, y: number, rn: () => number) {
  for (let i = 0; i < 3; i++) {
    const cx = x + (rn() - 0.5) * 7
    const cy = y + (rn() - 0.5) * 3
    r.ellipse(cx + 0.4, cy + 0.6, 2.8, 1.8, MOSS[2])
    r.ellipse(cx, cy, 2.6, 1.6, MOSS[1])
    r.set(cx - 1, cy - 1, MOSS[0])
  }
}

function sewerFloor(q: TileQuery) {
  const a = mod(q.tx, 8)
  const b = mod(q.ty, 8)
  return memo(`s${a},${b}`, () => {
    const r = tile()
    const slabs = slabLayout(q.tx, q.ty, 64, 23)
    paintSlabs(r, slabs, [SS[0], SS[1], SS[2], SS[3]])
    const rn = rng(a * 71 + b * 13 + 5)
    for (const s of slabs) {
      if (rn() < 0.3)
        crack(
          r,
          s.x0 + 5 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 10)),
          s.y0 + 3,
          rn() < 0.5 ? 1 : -1,
          1,
          6 + Math.floor(rn() * 8),
          rn,
          SS[3]
        )
      if (rn() < 0.4) mossPatch(r, rn() < 0.5 ? s.x1 - 3 : s.x0 + 3, s.y1 - 3, rn)
      for (let i = 0; i < 2; i++) {
        const x = s.x0 + 3 + Math.floor(rn() * Math.max(1, s.x1 - s.x0 - 6))
        const y = s.y0 + 3 + Math.floor(rn() * Math.max(1, s.y1 - s.y0 - 6))
        if (r.get(x, y) === SS[1]) {
          r.set(x, y, SS[2])
          r.set(x + 1, y, SS[2])
        }
      }
    }
    if (ih(a, b, 9) < 0.3)
      puddle(r, 16 + Math.floor(rn() * 32), 18 + Math.floor(rn() * 28), 7 + rn() * 5, 3.4 + rn() * 2)
    return r
  })
}

// ---------------------------------------------------------------- wooden floors

/** Joint x positions (world, periodic 512) of every 8 px board row. */
const BOARD_JOINTS: number[][] = Array.from({ length: 64 }, (_, row) => {
  const rn = rng(row * 977 + 3)
  const out: number[] = []
  let x = Math.floor(rn() * 90)
  while (x < 512) {
    out.push(x)
    x += 56 + Math.floor(rn() * 56)
  }
  return out
})

function boardsOnto(r: Raster, a: number, b: number, vertical: boolean, only?: [number, number]) {
  const [lo, hi] = only ?? [0, 64]
  for (let y = 0; y < 64; y++)
    for (let x = lo; x < hi; x++) {
      // vertical planks are the same pattern turned a quarter: pattern (u along the board, v across)
      const u = vertical ? y : x
      const v = vertical ? x : y
      const row = b * 8 + (v >> 3)
      const ry = v & 7
      const wu = (vertical ? b : a) * 64 + u
      const joints = BOARD_JOINTS[mod(vertical ? a * 8 + (v >> 3) : row, 64)]
      let jd = 99
      for (const j of joints) jd = Math.min(jd, Math.abs(wu - j), Math.abs(wu - j - 512))
      const tone = ih(mod(row + Math.floor(wu / 52), 64), 5, 81)
      let c = WOOD[1]
      if (tone > 0.9) c = WOOD[2]
      if (ry === 0) c = WOOD[0]
      else if (ry === 7) c = WOOD[3]
      else if (ry === 6) c = WOOD[2]
      else if (ry === 3 && Math.floor((wu + row * 17) / 14) % 4 === 0) c = WOOD[2]
      if (jd === 0) c = WOOD[3]
      else if (jd === 1) c = WOOD[2]
      r.set(x, y, c)
      // nails beside the joints
      if (jd === 3 && (ry === 2 || ry === 5)) r.set(x, y, WOOD[3])
    }
}

function planksTile(q: TileQuery) {
  const a = mod(q.tx, 8)
  const b = mod(q.ty, 8)
  return memo(`p${a},${b}`, () => {
    const r = tile()
    boardsOnto(r, a, b, false)
    // loose straw caught between the boards
    const rn = rng(a * 31 + b * 101 + 7)
    for (let i = 0; i < 5; i++) {
      const x = 4 + Math.floor(rn() * 52)
      const y = 3 + Math.floor(rn() * 56)
      const len = 4 + Math.floor(rn() * 5)
      for (let k = 0; k < len; k++) r.set(x + k, y + (k >> 2), k % 3 === 0 ? HAY[2] : HAY[1])
      r.set(x, y, HAY[0])
    }
    if (rn() < 0.3) {
      const x = 8 + Math.floor(rn() * 40)
      const y = 8 + Math.floor(rn() * 40)
      r.ellipse(x, y, 4, 2.4, WOOD[3])
      r.ellipse(x - 0.3, y - 0.3, 3.2, 1.8, WOOD[2])
    }
    return r
  })
}

function bridgeTile(q: TileQuery) {
  const aa = q.around
  const wet = (k?: TileKind) => liquid(k) || k === 'pit' || k === 'hole'
  const wH = wet(aa[W6]) || wet(aa[E])
  const wV = wet(aa[N]) || wet(aa[S4])
  let vertical = wH && !wV
  if (!wH && !wV) vertical = aa[N] === 'bridge' || aa[S4] === 'bridge'
  const edgeA = vertical ? wet(aa[W6]) : wet(aa[N])
  const edgeB = vertical ? wet(aa[E]) : wet(aa[S4])
  return memo(`b${mod(q.tx, 8)},${mod(q.ty, 8)},${vertical},${edgeA},${edgeB}`, () => {
    const r = tile()
    boardsOnto(r, mod(q.tx, 8), mod(q.ty, 8), vertical)
    const beam = (atStart: boolean) => {
      for (let u = 0; u < 64; u++)
        for (let k = 0; k < 8; k++) {
          const d = atStart ? k : 63 - k
          const [x, y] = vertical ? [d, u] : [u, d]
          let c = WOOD[1]
          if (atStart) c = k === 0 ? WOOD[3] : k === 1 ? WOOD[0] : k < 5 ? WOOD[1] : k === 5 ? WOOD[2] : WOOD[3]
          else c = k < 2 ? WOOD[3] : k < 4 ? WOOD[2] : k === 4 ? WOOD[1] : k === 5 ? WOOD[0] : WOOD[1]
          if (u % 16 < 2) c = R.clothBlack[1]
          r.set(x, y, c)
        }
    }
    if (edgeA) beam(true)
    if (edgeB) beam(false)
    return r
  })
}

// ---------------------------------------------------------------- walls

const WALL_SWAP = {
  wall: [
    [R.stone, SS],
    [R.grass, [SS[1], SS[2], SS[3], SS[3]]],
    [R.grassDark, MOSS]
  ],
  brick: [
    [R.stone, [BR[1], BR[1], BR[2], BR[3]]],
    [R.grass, [BR[1], BR[2], BR[3], BR[3]]],
    [R.grassDark, MOSS]
  ]
} as const

function wallBody(q: TileQuery, style: 'wall' | 'brick') {
  const mapped: TileQuery = { ...q, kind: 'wall', around: q.around.map((k) => (wallLike(k) ? 'wall' : 'grass')) }
  const sig = mapped.around.map((k) => (k === 'wall' ? 1 : 0)).join('')
  return memo(`w${style}${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const src = massTile(mapped, 'wall').clone()
    // the cap ramp's cool white highlight becomes the top step of the stage's stone
    const hi = style === 'wall' ? SS[0] : BR[0]
    src.map((c) => (c === R.paper[1] ? hi : c))
    return recolour(src, WALL_SWAP[style])
  })
}

/** The wall's front face starts 40 px down when the tile below is not a wall; the rat hole is cut into it. */
function holeTile(q: TileQuery) {
  const front = !wallLike(q.around[S4])
  const style = q.around[W6] === 'brick' || q.around[E] === 'brick' ? 1 : 0
  return memo(
    `h${style}${mod(q.tx, 8)},${mod(q.ty, 8)},${front},${q.around.map((k) => (wallLike(k) ? 1 : 0)).join('')}`,
    () => {
      const r = wallBody(q, q.around[W6] === 'brick' || q.around[E] === 'brick' ? 'brick' : 'wall').clone()
      const y1 = front ? 63 : 46
      const cx = 32
      const w = 12
      const top = front ? 44 : 26
      // stones around the arch
      for (let y = top - 3; y <= y1; y++)
        for (let x = cx - w - 3; x <= cx + w + 3; x++) {
          const dx = x - cx
          const arch = y < top + w ? Math.hypot(dx, y - (top + w)) : Math.abs(dx)
          if (arch <= w + 3 && arch > w) r.set(x, y, dx < 0 || y < top + 4 ? BR[0] : BR[2])
          if (arch > w + 2.2 && arch <= w + 3 && ((x + y) & 1) === 0) r.set(x, y, BR[3])
        }
      for (let y = top; y <= y1; y++)
        for (let x = cx - w; x <= cx + w; x++) {
          const dx = x - cx
          const inside = y < top + w ? Math.hypot(dx, y - (top + w)) <= w : Math.abs(dx) <= w
          if (!inside) continue
          const depth = Math.hypot(dx / w, (y - top) / (y1 - top + 1))
          r.set(x, y, depth > 0.82 ? C.inkCool : C.black)
        }
      // lit lip on the left, a chewed edge and a few crumbs of straw on the sill
      if (front) {
        r.rect(cx - w - 1, y1 - 2, 2 * w + 3, 1, BR[0])
        for (let i = 0; i < 6; i++) r.set(cx - 8 + i * 3, y1 - 1, i % 2 ? HAY[1] : HAY[2])
        r.set(cx - 4, y1 - 2, HAY[0])
        r.set(cx + 5, y1 - 2, R.cheese[1])
        r.set(cx + 6, y1 - 2, R.cheese[2])
        r.set(cx - 6, top + 6, BR[0])
        for (const dx of [-3, 3]) r.set(cx + dx, top + w + 2, C.inkWarm)
      }
      return r
    }
  )
}

// ---------------------------------------------------------------- channels (current, sludge)

function shoreOnto(r: Raster, q: TileQuery, frame: number) {
  const a = q.around
  const type = (i: number) => (a[i] === undefined || liquid(a[i]) || a[i] === 'pit' ? 0 : a[i] === 'bridge' ? 2 : 1)
  const ox = mod(q.tx, 8) * 64
  const oy = mod(q.ty, 8) * 64
  const tN = type(N)
  const tW = type(W6)
  const tE = type(E)
  const tS = type(S4)
  if (!tN && !tW && !tE && !tS) return r
  const src = r.clone()
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      let c = src.get(x, y)
      const wobN = vn1(ox + x, 10, 61) * 2
      const wobW = vn1(oy + y, 10, 62) * 2
      if (tN === 1) {
        const d = y - wobN
        if (d < 2.4) c = W[3]
        else if (d < 5) c = bayer(x, y) < 0.7 ? W[2] : c === W[1] ? W[2] : c
      }
      if (tW === 1) {
        const d = x - wobW
        if (d < 2) c = W[3]
        else if (d < 4) c = bayer(x, y) < 0.5 ? W[2] : c
      }
      if (tN === 2 && y < 4) c = y < 2 ? W[3] : W[2]
      if (tW === 2 && x < 4) c = x < 2 ? W[3] : W[2]
      if (tE >= 1) {
        const d = 63 - x - vn1(oy + y, 10, 63) * 2
        if (d < 1.2) c = W[3]
        else if (d < 2.4 && ((y + frame * 3) & 3) !== 0) c = W[0]
      }
      if (tS >= 1) {
        const d = 63 - y - vn1(ox + x, 10, 64) * 2
        if (d < 1.4) c = tS === 2 ? W[3] : C.white
        else if (d < 3 && ((x + frame * 2) & 3) !== 0) c = W[0]
      }
      r.set(x, y, c)
    }
  return r
}

function currentTile(q: TileQuery) {
  const a = q.around
  const sig = [N, W6, E, S4, 1, 3, 5, 7]
    .map((i) => (a[i] === undefined || liquid(a[i]) || a[i] === 'pit' ? 0 : a[i] === 'bridge' ? 2 : 1))
    .join('')
  return memo(`c${mod(q.tx, 8)},${mod(q.ty, 8)},${q.frame},${sig}`, () => {
    const ox = mod(q.tx, 8) * 64
    const oy = mod(q.ty, 8) * 64
    const f = q.frame
    const r = tile()
    // base: bands of two blues so the flow reads even when the streaks are far apart
    for (let y = 0; y < 64; y++) {
      const lane = vn1(oy + y, 16, 51) > 0.62
      for (let x = 0; x < 64; x++) r.set(x, y, lane && bayer(x, y) < 0.9 ? W[2] : W[1])
    }
    // streaks sliding from right to left: bright long ones at 128 px/s, dark short ones slower
    const streak = (
      rowH: number,
      period: number,
      shiftPerFrame: number,
      seed: number,
      minLen: number,
      span: number,
      draw: (x: number, y: number, i: number) => void
    ) => {
      for (let wy = oy; wy < oy + 64; wy++) {
        if (wy % rowH !== 0) continue
        const cy = Math.floor(wy / rowH)
        for (let k = 0; k < 2; k++) {
          const sx = Math.floor(ih(mod(cy, 512 / rowH), k, seed) * period)
          const len = minLen + Math.floor(ih(mod(cy, 512 / rowH), k, seed + 1) * span)
          for (let i = 0; i < len; i++) {
            const wx = mod(sx + i - f * shiftPerFrame, period)
            // draw this streak copy at every repeat inside the tile
            for (let px = ox - mod(ox, period) + wx - period; px < ox + 64 + period; px += period)
              if (px >= ox && px < ox + 64) draw(px - ox, wy - oy, i / len)
          }
        }
      }
    }
    streak(6, 128, 32, 71, 14, 22, (x, y, t) => {
      r.set(x, y, t < 0.15 || t > 0.85 ? W[1] : W[0])
      if (t > 0.3 && t < 0.7) r.set(x, y + 1, W[2])
    })
    streak(10, 64, 16, 73, 6, 12, (x, y) => {
      r.set(x, y, W[3])
    })
    // little foam knots riding the water
    for (let i = 0; i < 3; i++) {
      const cx = mod(Math.floor(ih(mod(q.tx, 8), mod(q.ty, 8), 90 + i) * 64) - f * 16, 64)
      const cy = 8 + Math.floor(ih(mod(q.tx, 8), mod(q.ty, 8), 95 + i) * 48)
      r.set(cx, cy, C.white)
      r.set(cx + 1, cy, W[0])
    }
    return shoreOnto(r, q, f)
  })
}

function sludgeTile(q: TileQuery) {
  const a = q.around
  const sig = [N, W6, E, S4]
    .map((i) => (a[i] === undefined || liquid(a[i]) || a[i] === 'pit' ? 0 : a[i] === 'bridge' ? 2 : 1))
    .join('')
  return memo(`u${mod(q.tx, 8)},${mod(q.ty, 8)},${q.frame},${sig}`, () => {
    const ox = mod(q.tx, 8) * 64
    const oy = mod(q.ty, 8) * 64
    const f = q.frame
    const r = tile()
    const n1 = noisePatch(ox, oy, 32, 53)
    const n2 = noisePatch(ox, oy, 16, 54)
    for (let i = 0; i < 4096; i++) {
      const v = n1[i] * 0.65 + n2[i] * 0.35
      r.data[i] = v < 0.34 ? SL[2] : SL[1]
    }
    // slow oily swirls drifting left
    for (let y = 0; y < 64; y += 7) {
      const cy = Math.floor((oy + y) / 7)
      const sx = Math.floor(ih(mod(cy, 73), 1, 77) * 64)
      for (let i = 0; i < 18; i++) {
        const x = mod(sx + i - f * 4 + ox, 64)
        r.set(x, y + Math.round(Math.sin((i + f) * 0.5)), SL[0])
      }
    }
    // bubbles swell and pop
    for (let cy = Math.floor(oy / 32); cy <= Math.floor((oy + 63) / 32); cy++)
      for (let cx = Math.floor(ox / 32); cx <= Math.floor((ox + 63) / 32); cx++) {
        const mx = mod(cx, 16)
        const my = mod(cy, 16)
        if (ih(mx, my, 55) > 0.6) continue
        const phase = (f + Math.floor(ih(mx, my, 56) * 4)) & 3
        const px = cx * 32 + 5 + Math.floor(ih(mx, my, 57) * 22) - ox
        const py = cy * 32 + 5 + Math.floor(ih(mx, my, 58) * 22) - oy
        if (phase === 0) r.set(px, py, SL[0])
        else if (phase === 1) {
          r.ellipse(px + 0.5, py + 0.5, 2.2, 1.6, SL[0])
          r.set(px, py, C.white)
        } else if (phase === 2) {
          r.ring(px + 0.5, py + 0.5, 2, 3.4, SL[0])
          r.set(px, py - 1, C.white)
        } else r.ring(px + 0.5, py + 0.5, 3.4, 4.6, SL[3])
      }
    return shoreOnto(r, q, f)
  })
}

// ---------------------------------------------------------------- provider

function swapped(key: string, src: () => Raster, pairs: readonly (readonly [readonly number[], readonly number[]])[]) {
  return memo(key, () => recolour(src().clone(), pairs))
}

export function sewerTile(q: TileQuery): Raster | undefined {
  switch (q.kind) {
    case 'sewer':
      return sewerFloor(q)
    case 'planks':
      return planksTile(q)
    case 'bridge':
      return bridgeTile(q)
    case 'wall':
      return wallBody(q, 'wall')
    case 'brick':
      return wallBody(q, 'brick')
    case 'hole':
      return holeTile(q)
    case 'current':
      return currentTile(q)
    case 'sludge':
      return sludgeTile(q)
    case 'floor':
      return swapped(`f${mod(q.tx, 8)},${mod(q.ty, 8)}`, () => floorTile({ ...q, around: Array(8).fill('floor') }), [
        [R.stone, SS],
        [R.grassDark, MOSS]
      ])
    case 'pit':
      return swapped(
        `i${mod(q.tx, 8)},${mod(q.ty, 8)},${q.around.map((k) => (k === 'pit' ? 1 : 0)).join('')}`,
        () => pitTile(q),
        [[R.dirt, SS]]
      )
    default:
      return undefined
  }
}
