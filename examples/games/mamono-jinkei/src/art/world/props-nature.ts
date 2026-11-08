/** Meadow props, part 1: stone, pots, grass, bushes, trees, flowers, fences. */
import { C, R } from '../palette'
import { Raster, ball, outline, rng } from '../raster'
import type { Sheet } from '../sheet'
import { crack, leafy } from './gfx'
import { box, frame, mk, shadow, shard, solid } from './pp'

const G = R.grass
const GD = R.grassDark
const S = R.stone
const ROCK = R.rock
const WOOD = R.wood
const CLAY = R.roofTile

function moss(r: Raster, x: number, y: number, rx: number, ry: number, rn: () => number) {
  for (let i = 0; i < 3; i++) {
    const cx = x + (rn() - 0.5) * rx
    const cy = y + (rn() - 0.5) * ry * 0.6
    r.ellipse(cx + 0.5, cy + 0.6, rx * 0.5, ry * 0.5, GD[2])
    r.ellipse(cx, cy, rx * 0.5, ry * 0.5, GD[1])
    r.ellipse(cx - rx * 0.12, cy - ry * 0.15, rx * 0.28, ry * 0.25, GD[0])
  }
}

/** Only keeps moss where stone already is. */
function mossOn(r: Raster, x: number, y: number, rx: number, ry: number, rn: () => number) {
  const layer = new Raster(r.w, r.h)
  moss(layer, x, y, rx, ry, rn)
  for (let j = 0; j < r.h; j++)
    for (let i = 0; i < r.w; i++) {
      const c = layer.get(i, j)
      if (c && r.get(i, j)) r.set(i, j, c)
    }
}

// ------------------------------------------------------------------ block

function block() {
  const r = frame('block')
  const rn = rng(5)
  box(r, 7, 36, 50, 18, 36, [S[0], S[1], S[2], S[3]])
  // top face: inner bevel and weathering
  r.rect(10, 39, 44, 1, S[1])
  r.rect(10, 39, 1, 12, S[1])
  r.rect(11, 52, 42, 1, S[1])
  for (let i = 0; i < 10; i++) r.set(12 + Math.floor(rn() * 40), 41 + Math.floor(rn() * 9), S[1])
  // carved panel on the front
  const px = 14
  const py = 60
  r.rect(px, py, 36, 20, S[2])
  r.rect(px + 1, py + 1, 34, 18, S[1])
  r.rect(px, py + 19, 36, 1, S[0])
  r.rect(px + 35, py, 1, 20, S[0])
  // diamond rune
  r.poly([32, 63, 41, 70, 32, 77, 23, 70], S[2])
  r.poly([32, 65, 38, 70, 32, 75, 26, 70], S[1])
  r.rect(26, 70, 12, 1, S[0])
  r.set(31, 69, S[0])
  crack(r, 52, 56, -1, 1, 9, rn, S[3])
  crack(r, 10, 74, 1, 1, 7, rn, S[3])
  mossOn(r, 12, 40, 12, 6, rn)
  mossOn(r, 18, 86, 18, 6, rn)
  outline(r)
  const out = new Raster(64, 96)
  shadow(out, 34, 88, 29, 5, GD[2], GD[1])
  return out.blit(r)
}

// ------------------------------------------------------------------ boulder (2×2)

function boulderBase(r: Raster, ramp: readonly number[]) {
  solid(
    r,
    [
      [64, 90, 56, 50, 62],
      [30, 106, 30, 30, 40],
      [98, 108, 30, 28, 40],
      [70, 66, 36, 26, 44]
    ],
    ramp,
    5,
    9
  )
}

function boulder() {
  const r = frame('boulder')
  const rn = rng(17)
  boulderBase(r, ROCK)
  // facet planes and weathering
  for (let i = 0; i < 6; i++)
    crack(
      r,
      30 + Math.floor(rn() * 70),
      70 + Math.floor(rn() * 50),
      rn() < 0.5 ? 1 : -1,
      1,
      6 + Math.floor(rn() * 10),
      rn,
      ROCK[3]
    )
  for (let i = 0; i < 40; i++) {
    const x = 20 + Math.floor(rn() * 90)
    const y = 50 + Math.floor(rn() * 85)
    if (r.get(x, y) === ROCK[1]) r.set(x, y, ROCK[0])
  }
  mossOn(r, 50, 52, 40, 14, rn)
  mossOn(r, 90, 70, 22, 10, rn)
  mossOn(r, 24, 120, 20, 10, rn)
  outline(r)
  const out = frame('boulder')
  shadow(out, 66, 142, 62, 9, GD[2], GD[1])
  return out.blit(r)
}

// ------------------------------------------------------------------ pot

function potBody(r: Raster, dy = 0, grow = 0) {
  const cx = 32
  ball(r, cx, 41 + dy, 13 + grow, 14 + grow, CLAY, true)
  // neck and rim
  r.rect(25, 24 + dy, 14, 7, CLAY[1])
  r.rect(25, 24 + dy, 3, 7, CLAY[0])
  r.rect(36, 24 + dy, 3, 7, CLAY[2])
  r.ellipse(32, 25 + dy, 11, 4.2, CLAY[2])
  r.ellipse(32, 24.3 + dy, 11, 4, CLAY[0])
  r.ellipse(32, 24.8 + dy, 8.2, 2.8, CLAY[3])
  r.ellipse(32.5, 25.4 + dy, 6.6, 1.8, C.inkWarm)
  // painted band
  for (let x = 20; x < 45; x++) {
    const t = (x - 20) / 25
    const y = 40 + dy + Math.round(Math.sin(t * Math.PI) * 1.5)
    r.set(x, y, R.hay[1])
    r.set(x, y + 1, CLAY[3])
    if ((x & 3) === 1) r.set(x, y - 1, CLAY[3])
  }
}

function pot() {
  const r = frame('pot')
  potBody(r)
  outline(r)
  const out = frame('pot')
  shadow(out, 34, 56, 15, 3.2, GD[2], GD[1])
  return out.blit(r)
}

function potBreak() {
  const frames: Raster[] = []
  const shards = [
    { x: 24, y: 36, vx: -7, vy: -9, s: 5, t: 0 },
    { x: 38, y: 34, vx: 7, vy: -10, s: 4, t: 1 },
    { x: 30, y: 28, vx: -3, vy: -13, s: 4, t: 2 },
    { x: 36, y: 44, vx: 9, vy: -6, s: 5, t: 0 },
    { x: 22, y: 44, vx: -9, vy: -5, s: 4, t: 1 },
    { x: 32, y: 40, vx: 1, vy: -11, s: 3, t: 2 },
    { x: 28, y: 48, vx: -5, vy: -4, s: 3, t: 0 }
  ]
  for (let k = 0; k < 5; k++) {
    const r = frame('pot_break')
    if (k === 0) {
      potBody(r, 0, 1)
      // cracks
      for (const [x, y, x2, y2] of [
        [28, 30, 32, 38],
        [32, 38, 30, 46],
        [32, 38, 38, 42],
        [38, 42, 37, 50]
      ])
        r.line(x, y, x2, y2, C.inkWarm)
      outline(r)
    } else {
      const base = frame('pot_break')
      // what remains: a jagged lower rim
      base.ellipse(32, 50, 12, 6, CLAY[1])
      base.ellipse(32, 52, 12, 5, CLAY[1])
      ball(base, 32, 51, 12.5, 6.5, CLAY, false)
      for (let y = 40; y < 50; y++)
        for (let x = 18; x < 47; x++) if ((x * 7 + (x >> 2) * 3) % 5 < 2 + (x % 3)) base.set(x, y, 0)
      base.ellipse(32, 47.5, 9, 2.2, CLAY[3])
      outline(base)
      r.blit(base)
      // puff of dust
      if (k <= 2) {
        const puff = [R.paper[2], R.paper[1]]
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + k
          r.ellipse(
            32 + Math.cos(a) * (6 + k * 5),
            46 + Math.sin(a) * (2 + k * 2),
            2.4 - k * 0.5,
            1.8 - k * 0.3,
            puff[k - 1]
          )
        }
      }
      for (const s of shards) {
        const x = s.x + s.vx * k * 0.9
        const y = Math.min(54 - s.s, s.y + s.vy * k + 2.6 * k * k)
        const sh = new Raster(64, 64)
        shard(sh, x, y, s.s, CLAY, s.t + k)
        outline(sh)
        r.blit(sh)
      }
    }
    frames.push(r)
  }
  return frames
}

// ------------------------------------------------------------------ grass tuft

interface Blade {
  bx: number
  h: number
  lean: number
  w: number
  front: boolean
}
const BLADES: Blade[] = (() => {
  const rn = rng(77)
  const out: Blade[] = []
  for (let i = 0; i < 11; i++) {
    const bx = -11 + (i / 10) * 22 + (rn() - 0.5) * 3
    const edge = Math.abs(bx) / 11
    out.push({ bx, h: 16 + (1 - edge) * 11 + rn() * 5, lean: bx * 0.06 + (rn() - 0.5) * 0.3, w: 5, front: i % 2 === 0 })
  }
  return out
})()

/** Draws (a part of) a blade as a tapering ribbon; t0..t1 select the segment, (ox, oy) move it. */
function bladePath(r: Raster, b: Blade, sway: number, t0 = 0, t1 = 1, ox = 0, oy = 0, rot = 0, cx = 32, cy = 52) {
  const steps = Math.ceil(b.h * (t1 - t0) * 1.4)
  const pal = b.front ? G : GD
  for (let s = 0; s <= steps; s++) {
    const t = t0 + ((t1 - t0) * s) / steps
    const px = b.bx + b.lean * b.h * t * t + sway * t * t + rot * (t - t0) * 6
    const py = -b.h * t + Math.abs(rot) * (t - t0) * -2
    const wd = Math.max(1, Math.round(b.w * (1 - t * 0.85)))
    const x = Math.round(cx + px + ox)
    const y = Math.round(cy + py + oy)
    for (let k = 0; k < wd; k++) {
      let c = k === 0 ? (b.front ? pal[0] : pal[1]) : k === wd - 1 && wd > 1 ? pal[2] : pal[1]
      if (t < 0.18) c = pal[2]
      if (t > 0.88) c = pal[0]
      r.set(x + k - (wd >> 1), y, c)
    }
  }
}

function grassTuft(f: number) {
  const r = frame('grass')
  const sway = Math.sin((f / 3) * Math.PI * 2) * 2.2
  for (const b of [...BLADES].sort((p, q) => +p.front - +q.front)) bladePath(r, b, sway * (b.h / 28))
  r.ellipse(32, 52, 12, 2.2, GD[2])
  const base = frame('grass')
  for (const b of BLADES) bladePath(base, { ...b, h: 4, w: 3 }, 0, 0, 1)
  outline(r)
  const out = frame('grass')
  shadow(out, 34, 53, 13, 3, GD[2], GD[1])
  return out.blit(r)
}

function grassCut(k: number) {
  const r = frame('grass_cut')
  const cut = 0.3
  const stub = frame('grass_cut')
  for (const b of [...BLADES].sort((p, q) => +p.front - +q.front)) {
    bladePath(stub, { ...b, h: b.h * cut }, 0, 0, 1)
    // squared off cut
  }
  stub.ellipse(32, 52, 12, 2.2, GD[2])
  outline(stub)
  const rn = rng(8)
  const fly = frame('grass_cut')
  BLADES.forEach((b, i) => {
    const dir = (i - 5) / 5
    const ox = dir * (4 + k * 7)
    const oy = -(5 + k * 9) + k * k * 3.4 - (1 - Math.abs(dir)) * 2
    if (k >= 3 && i % 3) return
    const seg = frame('grass_cut')
    if (k < 3) bladePath(seg, b, 0, cut, 1, ox, oy, dir * k * 0.5)
    else {
      // leaf bits tumbling down
      const x = 32 + b.bx + ox
      const y = 52 + oy + 10 + rn() * 8
      seg.rect(Math.round(x), Math.round(y), 3, 2, b.front ? G[1] : GD[1])
      seg.set(Math.round(x), Math.round(y), G[0])
    }
    fly.blit(seg)
  })
  outline(fly)
  const out = frame('grass_cut')
  shadow(out, 34, 53, 13, 3, GD[2], GD[1])
  out.blit(stub)
  if (k < 3 || true) out.blit(fly)
  void r
  return out
}

// ------------------------------------------------------------------ bush

function bush() {
  const r = frame('bush')
  const inM = (x: number, y: number) =>
    [
      [21, 44, 13, 13],
      [43, 44, 13, 13],
      [32, 34, 16, 16],
      [32, 50, 22, 7]
    ].some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1)
  for (const [cx, cy, rx, ry] of [
    [19, 44, 11, 9],
    [45, 44, 11, 9],
    [32, 36, 15, 13],
    [32, 49, 22, 5]
  ])
    r.ellipse(cx, cy, rx, ry, GD[2])
  leafy(r, 0, 0, 64, 80, 8, 0, [GD[0], GD[1], GD[2], GD[3]], 11, 23, false, inM)
  const rn = rng(3)
  for (let i = 0; i < 5; i++) {
    const x = 14 + Math.floor(rn() * 36)
    const y = 30 + Math.floor(rn() * 18)
    if (r.get(x, y)) {
      r.set(x, y, R.jobRed[1])
      r.set(x + 1, y, R.jobRed[2])
      r.set(x, y - 1, R.jobRed[0])
    }
  }
  outline(r)
  const out = frame('bush')
  shadow(out, 34, 55, 30, 4, GD[3], GD[2])
  return out.blit(r)
}

// ------------------------------------------------------------------ rock

function rock() {
  const r = frame('rock')
  const rn = rng(29)
  const small = (cx: number, cy: number, k: number) => {
    const l = new Raster(64, 64)
    const p = (a: number[]) => a.map((v, i) => (i % 2 ? cy + (v - 32) * k : cx + (v - 32) * k))
    l.poly(p([10, 42, 13, 30, 24, 22, 40, 23, 50, 32, 54, 44, 44, 50, 18, 50]), ROCK[1])
    l.poly(p([13, 30, 24, 22, 40, 23, 34, 32, 20, 36]), ROCK[0])
    l.poly(p([54, 44, 50, 32, 38, 34, 40, 46, 44, 50]), ROCK[2])
    l.poly(p([18, 50, 40, 46, 44, 50]), ROCK[3])
    l.line(p([24, 36])[0], p([24, 36])[1], p([30, 44])[0], p([30, 44])[1], ROCK[2])
    outline(l)
    r.blit(l)
  }
  shadow(r, 34, 50, 26, 5, GD[2], GD[1])
  small(30, 34, 1)
  small(50, 46, 0.42)
  mossOn(r, 26, 24, 16, 8, rn)
  return r
}

// ------------------------------------------------------------------ tree

function canopy(f: number) {
  const lumps = [
    [64, 62, 36, 32],
    [34, 76, 22, 20],
    [94, 76, 22, 20],
    [46, 42, 22, 20],
    [82, 42, 22, 20],
    [64, 92, 34, 12],
    [64, 32, 18, 16]
  ]
  const inM = (x: number, y: number) =>
    lumps.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1)
  const c = new Raster(128, 192)
  for (const [cx, cy, rx, ry] of lumps) c.ellipse(cx, cy, rx - 2, ry - 2, GD[2])
  leafy(c, 0, 0, 128, 192, 0, 0, [GD[0], GD[1], GD[2], GD[3]], 14, 41, false, inM)
  // sun-bleached tips on the upper-left clusters
  const rn = rng(11)
  for (let i = 0; i < 16; i++) {
    const x = 24 + Math.floor(rn() * 60)
    const y = 20 + Math.floor(rn() * 46)
    if (c.get(x, y) === GD[0]) {
      c.set(x, y, G[0])
      c.set(x + 1, y, G[0])
    }
  }
  outline(c)
  // sway: the crown shears gently, the lower rim stays put
  const out = new Raster(128, 192)
  for (let y = 0; y < 192; y++) {
    const shift = f === 0 ? 0 : y < 50 ? 2 : y < 74 ? 1 : 0
    for (let x = 0; x < 128; x++) {
      const v = c.get(x, y)
      if (v) out.set(x + shift, y, v)
    }
  }
  return out
}

function tree(f: number) {
  const r = frame('tree')
  shadow(r, 70, 162, 52, 10, GD[2], GD[1])
  // trunk with flared roots
  const trunk = new Raster(128, 192)
  for (let y = 86; y <= 162; y++) {
    const t = (y - 86) / 76
    const half = 11 + Math.pow(t, 3) * 12
    for (let x = Math.round(64 - half); x <= Math.round(64 + half); x++) {
      const u = (x - (64 - half)) / (half * 2)
      let c = u < 0.2 ? WOOD[0] : u < 0.58 ? WOOD[1] : u < 0.85 ? WOOD[2] : WOOD[3]
      if (u > 0.2 && u < 0.85 && (x * 5 + (y >> 3) * 3) % 7 === 0) c = c === WOOD[1] ? WOOD[2] : WOOD[3]
      trunk.set(x, y, c)
    }
  }
  // roots
  for (const [x0, dir] of [
    [40, -1],
    [88, 1]
  ] as const)
    for (let i = 0; i < 12; i++)
      trunk.ellipse(
        x0 + dir * -i * 0.3 + (dir < 0 ? -i * 0.8 + 10 : i * 0.8 - 10),
        158 + i * 0.3,
        7 - i * 0.4,
        3,
        i < 5 ? WOOD[2] : WOOD[1]
      )
  trunk.ellipse(64, 160, 14, 3.5, WOOD[3])
  trunk.rect(52, 100, 3, 40, WOOD[0])
  outline(trunk)
  // knot
  trunk.ellipse(70, 124, 3, 4, WOOD[3])
  trunk.set(69, 122, WOOD[2])
  r.blit(trunk)
  // shade the canopy casts on the trunk
  for (let y = 100; y < 124; y++)
    for (let x = 40; x < 90; x++) {
      const c = r.get(x, y)
      if (c && c !== GD[2] && y < 100 + 14 - Math.abs(x - 64) * 0.2)
        r.set(x, y, c === WOOD[0] ? WOOD[1] : c === WOOD[1] ? WOOD[2] : WOOD[3])
    }
  r.blit(canopy(f))
  return r
}

// ------------------------------------------------------------------ flower

function flowerSprite(f: number) {
  const r = frame('flower')
  const sw = f ? 1 : -1
  const hx = 16 + sw
  const hy = 9
  for (let y = 24; y > hy; y--) r.set(16 + Math.round(sw * ((24 - y) / 15) ** 2), y, GD[1])
  r.set(16, 24, GD[2])
  // leaves
  r.poly([16, 20, 10, 15, 13, 21], GD[1])
  r.poly([16.5, 17, 22, 13, 20, 19], GD[0])
  // petals
  const P = R.jobRed
  for (const [dx, dy, c] of [
    [0, -4, P[0]],
    [-4, -1, P[1]],
    [4, -1, P[2]],
    [-2, 3, P[1]],
    [2, 3, P[2]]
  ] as const)
    r.ellipse(hx + dx, hy + dy, 2.6, 2.6, c)
  r.ellipse(hx, hy, 2.4, 2.4, R.gold[1])
  r.set(hx - 1, hy - 1, R.gold[0])
  outline(r)
  return r
}

// ------------------------------------------------------------------ fences

function fence(horizontal: boolean) {
  const name = horizontal ? 'fence_h' : 'fence_v'
  const r = frame(name)
  const gy = 46
  shadow(r, 33, gy + 1, horizontal ? 31 : 9, 2.6, GD[2], GD[1])
  if (horizontal) {
    for (const ry of [gy - 25, gy - 14]) {
      for (let x = 0; x < 64; x++) {
        r.set(x, ry, WOOD[0])
        r.rect(x, ry + 1, 1, 2, WOOD[1])
        r.set(x, ry + 3, WOOD[2])
        r.set(x, ry + 4, WOOD[3])
      }
      r.set(10, ry + 1, WOOD[2])
      r.set(52, ry + 1, WOOD[2])
    }
  } else {
    for (let y = 0; y < 64; y++) {
      r.set(28, y, WOOD[0])
      r.rect(29, y, 4, 1, WOOD[1])
      r.set(33, y, WOOD[2])
      r.set(34, y, WOOD[3])
    }
  }
  const post = (x: number) => {
    for (let y = gy - 30; y <= gy; y++)
      for (let k = 0; k < 8; k++)
        r.set(x + k, y, y === gy ? WOOD[3] : k === 0 ? WOOD[0] : k >= 6 ? (k === 7 ? WOOD[3] : WOOD[2]) : WOOD[1])
    r.rect(x, gy - 32, 8, 3, WOOD[0])
    r.rect(x, gy - 30, 8, 1, WOOD[1])
    r.rect(x + 1, gy - 33, 6, 1, WOOD[0])
    r.set(x + 7, gy - 32, WOOD[2])
    r.rect(x, gy - 34, 8, 1, WOOD[3])
    r.set(x + 3, gy - 20, WOOD[2])
    r.set(x + 3, gy - 19, WOOD[2])
  }
  post(28)
  return r
}

export const natureSheet = (): Sheet => ({
  block: mk('block', [block()]),
  boulder: mk('boulder', [boulder()]),
  pot: mk('pot', [pot()]),
  pot_break: mk('pot_break', potBreak()),
  grass: mk('grass', [0, 1, 2].map(grassTuft)),
  grass_cut: mk('grass_cut', [0, 1, 2, 3].map(grassCut)),
  bush: mk('bush', [bush()]),
  rock: mk('rock', [rock()]),
  tree: mk('tree', [tree(0), tree(1)]),
  flower: mk('flower', [flowerSprite(0), flowerSprite(1)]),
  fence_h: mk('fence_h', [fence(true)]),
  fence_v: mk('fence_v', [fence(false)])
})
