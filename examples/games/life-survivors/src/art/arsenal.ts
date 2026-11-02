import { C, R } from './palette'
import { Raster, ball, part, shadeEdges, type Ramp } from './raster'
import type { Anim, Sheet } from './sheet'

/**
 * Sprites of the new talent weapons: `weapon:<id>` sheets (32×32 frames, centred), the effect particles merged
 * into the shared `fx` sheet and the 32×32 HUD icons. Same style as weapons.ts: palette ramps, selective
 * outline, light from the top-left. Directional things (the staple, the beam) are rasterised per direction
 * from primitives — never a rotated bitmap.
 */

const N = 32
const loop = (frames: Raster[], fps: number): Anim => ({ frames, fps, loop: true })
const many = (n: number, make: (f: number) => Raster) => Array.from({ length: n }, (_, f) => make(f))

const tiny = (w: number, h: number, draw: (l: Raster) => void, outline = true) => {
  const r = new Raster(w, h)
  part(r, draw, outline)
  return r
}

/** Icon frames: a 32×32 canvas with the sprite centred. */
const icon = (src: Raster) => new Raster(32, 32).blit(src, Math.round((32 - src.w) / 2), Math.round((32 - src.h) / 2))

/** Points of a polygon rotated by `a` around (cx, cy). */
const turn = (pts: number[], cx: number, cy: number, a: number) =>
  pts.map((v, i) => {
    const x = i % 2 ? pts[i - 1] : v
    const y = i % 2 ? v : pts[i + 1]
    const dx = x - cx
    const dy = y - cy
    return i % 2 ? cy + dx * Math.sin(a) + dy * Math.cos(a) : cx + dx * Math.cos(a) - dy * Math.sin(a)
  })

/** One point rotated by `a` around (cx, cy). */
const spin = (x: number, y: number, cx: number, cy: number, a: number): [number, number] => [
  cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
  cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)
]

/** Shiba tan: highlight, base, shade, deep, line. */
const SHIBA: Ramp = [R.yellow[1], R.brown[0], R.brown[1], R.brown[2], R.brown[3]]
const PINKY: Ramp = [R.pink[0], R.pink[1], R.pink[2], R.pink[3], R.pink[4]]

// ---------------------------------------------------------------------------------------------
// ペット: a brave shiba in a red bandana.

function dog(f: number, mode: 'run' | 'closed' | 'open') {
  const r = new Raster(N, N)
  const run = mode === 'run'
  const bob = run ? [0, -1, 0, -1][f] : mode === 'open' ? 1 : 0
  const front = run ? [4, 1, -3, 1][f] : mode === 'open' ? 3 : 2
  const rear = run ? [-4, -1, 3, -1][f] : -2
  const lift = run ? [1, 0, 1, 0][f] : 0
  const foot = 27
  // Far legs, then the tail.
  part(r, (l) => {
    l.thick(10, 20 + bob, 10 + rear + 2, foot - lift, 3, SHIBA[2])
    l.thick(21, 20 + bob, 21 + front - 2, foot - lift, 3, SHIBA[2])
  })
  part(r, (l) => {
    l.thick(8, 17 + bob, 5, 13 + bob, 3, SHIBA[1])
    l.thick(5, 13 + bob, 6, 9 + bob, 3, SHIBA[1])
    l.set(6, 8 + bob, R.paper[1])
  })
  // Body with a cream belly.
  part(r, (l) => {
    ball(l, 15, 17 + bob, 9.5, 6, SHIBA)
    l.ellipse(15, 21 + bob, 6, 1.7, R.paper[1])
  })
  // Bandana fluttering behind.
  part(r, (l) => {
    l.thick(21, 14 + bob, 15, 12 + bob + (f % 2), 2, R.red[1])
    l.thick(15, 12 + bob + (f % 2), 12, 14 + bob + (f % 2), 2, R.red[2])
  })
  // Near legs.
  part(r, (l) => {
    l.thick(11, 20 + bob, 11 + rear, foot - lift, 3, SHIBA[1])
    l.thick(22, 20 + bob, 22 + front, foot - lift, 3, SHIBA[1])
    l.rect(10 + rear, foot - lift - 1, 4, 2, R.paper[1])
    l.rect(21 + front, foot - lift - 1, 4, 2, R.paper[1])
  })
  // Head.
  const hy = 11 + bob + (mode === 'open' ? 1 : 0)
  part(r, (l) => {
    l.poly([19, hy - 3, 20, hy - 9, 24, hy - 4], SHIBA[2])
    l.poly([24, hy - 4, 27, hy - 9, 28, hy - 2], SHIBA[1])
    ball(l, 23, hy, 6.2, 5.6, SHIBA)
    l.poly([20, hy - 4, 20.5, hy - 7, 22.5, hy - 4.5], R.pink[1])
    l.ellipse(27.5, hy + 2.2, 3.6, 2.4, R.paper[1])
    if (mode === 'open') {
      l.ellipse(27, hy + 5, 3.2, 1.6, R.red[2])
      l.rect(25, hy + 4, 1, 1, C.white)
      l.rect(28, hy + 4, 1, 1, C.white)
      l.set(27, hy + 5, R.pink[1])
    }
  })
  r.set(30, hy + 1, C.inkCool)
  r.set(31, hy + 1, C.inkCool)
  r.set(24, hy - 1, C.inkCool)
  r.set(24, hy, C.inkCool)
  r.set(23, hy - 3, C.inkCool)
  r.set(24, hy - 3, C.inkCool)
  r.set(25, hy - 4, C.inkCool)
  r.set(24, hy + 4, run || mode === 'closed' ? R.red[2] : 0)
  return r
}

// ---------------------------------------------------------------------------------------------
// 読書: an open, glowing book with a page flipping across.

function openBook(f: number) {
  const r = new Raster(N, N)
  // Glow rays above the book.
  part(
    r,
    (l) => {
      const rays = [
        [16, 4, 16, 8],
        [8, 6, 10, 9],
        [24, 6, 22, 9],
        [3, 12, 7, 13],
        [29, 12, 25, 13]
      ]
      rays.forEach(([x0, y0, x1, y1], k) => l.line(x0, y0, x1, y1, (k + f) % 2 ? R.yellow[0] : C.white))
    },
    false
  )
  part(r, (l) => {
    l.poly([2, 17, 16, 22, 16, 29, 2, 24], R.navy[2])
    l.poly([30, 17, 16, 22, 16, 29, 30, 24], R.navy[2])
    l.poly([3, 13, 16, 18, 16, 27, 3, 22], R.paper[1])
    l.poly([29, 13, 16, 18, 16, 27, 29, 22], R.paper[0])
    for (let k = 0; k < 3; k++) {
      l.line(5, 16 + k * 2, 13, 19 + k * 2, R.paper[3])
      l.line(19, 19 + k * 2, 27, 16 + k * 2, R.paper[2])
    }
    l.line(16, 18, 16, 27, R.paper[2])
  })
  // The flipping page: from the right (f 0) up over the spine to the left (f 3).
  const tips = [
    [27, 13],
    [22, 8],
    [10, 8],
    [5, 13]
  ][f]
  part(r, (l) => {
    l.poly([16, 18, tips[0], tips[1], tips[0], tips[1] + 8, 16, 26], R.yellow[0])
    l.line(16, 18, tips[0], tips[1], C.white)
  })
  // Floating letters.
  for (const [x, y] of [
    [8 + f, 5 - (f % 2)],
    [24 - f, 3 + (f % 2)]
  ])
    r.rect(x, y, 2, 2, R.mint[0])
  r.set(16, 2 + (f % 2), C.white)
  return r
}

// ---------------------------------------------------------------------------------------------
// 残業: a stapler staple with a motion streak, in one of 16 directions.

export const STAPLE_DIRS = 16

function staple(d: number) {
  const r = new Raster(N, N)
  const a = (d / STAPLE_DIRS) * Math.PI * 2
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const pt = (u: number, v: number): [number, number] => [16 + u * ca - v * sa, 16 + u * sa + v * ca]
  const line = (u0: number, v0: number, u1: number, v1: number, w: number, c: number, l: Raster) => {
    const [x0, y0] = pt(u0, v0)
    const [x1, y1] = pt(u1, v1)
    l.thick(x0, y0, x1, y1, w, c)
  }
  // Motion streak behind (no outline).
  part(
    r,
    (l) => {
      line(-4, -4.5, -14, -4.5, 1.6, R.sky[0], l)
      line(-5, 0, -15, 0, 1.6, C.white, l)
      line(-4, 4.5, -13, 4.5, 1.6, R.sky[0], l)
      line(-9, -2.2, -14, -2.2, 1, R.sky[1], l)
    },
    false
  )
  part(r, (l) => {
    // Two sharp legs forward, bridged by the crown bar.
    line(-2, -5, 8, -5, 2.2, R.metal[1], l)
    line(-2, 5, 8, 5, 2.2, R.metal[1], l)
    line(-3, -5, -3, 5, 3.4, R.metal[1], l)
    line(-3.5, -5, -3.5, 5, 1.2, R.metal[0], l)
    line(0, -5.5, 7, -5.5, 0.8, R.metal[0], l)
    line(0, 5.5, 7, 5.5, 0.8, R.metal[2], l)
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 結婚指輪: a gold ring turning on its axis with a diamond glint.

function ring(f: number) {
  const r = new Raster(N, N)
  const rx = [9.5, 6.5, 2.2, 6.5][f]
  const hole = [6, 3.4, 0, 3.4][f]
  part(r, (l) => {
    l.ellipse(16, 18, rx, 9.5, R.yellow[2])
    l.ellipse(15.5, 17.5, rx - 0.7, 9, R.yellow[1])
    if (hole > 0) {
      l.ellipse(16, 18.5, hole, 6.2, 0)
      // Inner rim catches the light.
      l.ellipse(16, 18.5, hole + 1, 7, R.yellow[2])
      l.ellipse(16, 18.5, hole, 6.2, 0)
    }
    for (let y = 8; y < 12; y++) l.set(f === 0 ? 11 : 14 - f, y, R.yellow[0])
  })
  // Diamond on the crown (turns with the ring).
  const dx = [0, 2.5, 4, -2.5][f]
  part(r, (l) => {
    l.poly([16 + dx, 2, 20 + dx * 0.4, 6, 16 + dx, 11, 12 + dx * 0.4, 6], R.sky[0])
    l.poly([16 + dx, 2, 20 + dx * 0.4, 6, 16 + dx, 6], C.white)
    l.poly([16 + dx, 6, 20 + dx * 0.4, 6, 16 + dx, 11], R.sky[1])
  })
  const g = [
    [13, 3],
    [20, 2],
    [12, 4],
    [19, 3]
  ][f]
  r.line(g[0] - 2, g[1], g[0] + 2, g[1], C.white)
  r.line(g[0], g[1] - 2, g[0], g[1] + 2, C.white)
  return r
}

// ---------------------------------------------------------------------------------------------
// 旅行: a paper airplane flying right with a little wobble.

function plane(f: number) {
  const r = new Raster(N, N)
  const a = [-0.1, 0, 0.1, 0][f]
  const bob = [0, -1, 0, 1][f]
  part(
    r,
    (l) => {
      l.line(0, 12 + bob, 6, 12 + bob, R.paper[2])
      l.line(1, 16 + bob, 8, 16 + bob, C.white)
      l.line(0, 20 + bob, 5, 20 + bob, R.paper[2])
    },
    false
  )
  const P = (pts: number[]) =>
    turn(
      pts.map((v, i) => (i % 2 ? v + bob : v)),
      18,
      16,
      a
    )
  part(r, (l) => {
    l.poly(P([8, 20, 30, 16, 6, 24]), R.sky[1])
    l.poly(P([9, 9, 30, 16, 12, 18]), C.white)
    l.poly(P([12, 18, 30, 16, 8, 20]), R.paper[2])
    l.poly(P([9, 9, 30, 16, 20, 15]), R.paper[1])
    l.line(...(P([12, 18]) as [number, number]), ...(P([30, 16]) as [number, number]), R.sky[2])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 貯金: a pink piggy bank (idle wobble, armed with a glowing coin slot).

function pig(f: number, armed: boolean) {
  const r = new Raster(N, N)
  const y = f ? 1 : 0
  const squash = f ? 0.6 : 0
  part(r, (l) => {
    for (const x of [9, 13, 19, 22]) l.rect(x, 23 + y, 3, 5 - y - (x < 15 ? 0 : 0), PINKY[2])
  })
  part(r, (l) => {
    l.thick(6, 16 + y, 3, 14 + y, 2, PINKY[2])
    l.set(3, 12 + y, PINKY[2])
    l.poly([20, 10 + y, 23, 5 + y, 26, 11 + y], PINKY[2])
    ball(l, 15, 17 + y, 11, 8.5 - squash, PINKY)
    ball(l, 26.5, 18 + y, 3.4, 3.8, [PINKY[0], PINKY[0], PINKY[1], PINKY[2], PINKY[3]], false)
  })
  r.set(26, 17 + y, PINKY[3])
  r.set(26, 19 + y, PINKY[3])
  r.rect(22, 14 + y, 1, 2, C.inkWarm)
  r.rect(18, 20 + y, 3, 1, PINKY[2])
  // Coin slot on the back.
  if (armed) {
    r.rect(11, 8 + y, 8, 2, f ? R.yellow[1] : R.yellow[0])
    r.rect(12, 9 + y, 6, 1, C.white)
    if (!f) {
      r.line(15, 3, 15, 6, R.yellow[0])
      r.line(9, 5, 11, 7, R.yellow[0])
      r.line(21, 5, 19, 7, R.yellow[0])
    }
    // A blinking red fuse light on the rump.
    r.rect(7, 12 + y, 2, 2, f ? R.red[2] : R.red[0])
  } else {
    r.rect(12, 9 + y, 6, 1, C.inkWarm)
  }
  return r
}

// ---------------------------------------------------------------------------------------------
// ギャンブル: a tumbling die and its six faces.

/** A die as an isometric cube turned by `a`; pips on three faces. */
function cube(a: number, s: number, cy = 16) {
  const r = new Raster(N, N)
  const cx = 16
  const k = 0.866
  const O: [number, number] = [0, 0]
  const T: [number, number] = [0, -s]
  const UR: [number, number] = [k * s, -0.5 * s]
  const LR: [number, number] = [k * s, 0.5 * s]
  const B: [number, number] = [0, s]
  const LL: [number, number] = [-k * s, 0.5 * s]
  const UL: [number, number] = [-k * s, -0.5 * s]
  const P = (p: [number, number]) => spin(cx + p[0], cy + p[1], cx, cy, a)
  const quad = (pts: [number, number][]) => pts.flatMap((p) => P(p))
  const faceAt = (o: [number, number], e1: [number, number], e2: [number, number], p: number, q: number) =>
    P([o[0] + e1[0] * p + e2[0] * q, o[1] + e1[1] * p + e2[1] * q])
  const e = (p: [number, number], q: [number, number]): [number, number] => [p[0] - q[0], p[1] - q[1]]
  part(r, (l) => {
    l.poly(quad([O, UL, T, UR]), R.paper[0])
    l.poly(quad([O, UL, LL, B]), R.paper[2])
    l.poly(quad([O, UR, LR, B]), R.paper[1])
  })
  const pip = (pos: [number, number], c: number, rad: number) => r.ellipse(pos[0], pos[1], rad, rad, c)
  const top = [e(UL, O), e(UR, O)] as const
  for (const [p, q] of [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75]
  ])
    pip(faceAt(O, top[0], top[1], p, q), C.inkCool, 1.3)
  const left = [e(UL, O), e(B, O)] as const
  for (const [p, q] of [
    [0.3, 0.7],
    [0.7, 0.3]
  ])
    pip(faceAt(O, left[0], left[1], p, q), C.inkCool, 1.3)
  const right = [e(UR, O), e(B, O)] as const
  pip(faceAt(O, right[0], right[1], 0.5, 0.5), R.red[1], s * 0.2)
  return r
}

const PIPS: [number, number][][] = [
  [[1, 1]],
  [
    [0, 0],
    [2, 2]
  ],
  [
    [0, 0],
    [1, 1],
    [2, 2]
  ],
  [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2]
  ],
  [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2]
  ],
  [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2]
  ]
]

/** Face `n` (1–6) seen from above; the 6 is the jackpot and gets a golden, glinting trim. */
function dieFace(n: number) {
  const r = new Raster(N, N)
  const gold = n === 6
  part(r, (l) => {
    l.rect(4, 4, 24, 24, gold ? R.yellow[1] : R.paper[1])
    l.rect(5, 5, 22, 22, gold ? R.yellow[0] : R.paper[0])
    for (const [x, y] of [
      [4, 4],
      [27, 4],
      [4, 27],
      [27, 27]
    ])
      l.set(x, y, 0)
    if (gold) {
      l.rect(5, 26, 22, 1, R.yellow[2])
      l.rect(26, 5, 1, 22, R.yellow[2])
    } else {
      l.rect(5, 26, 22, 1, R.paper[2])
      l.rect(26, 5, 1, 22, R.paper[2])
    }
  })
  if (gold) {
    r.rect(6, 6, 20, 1, R.yellow[1])
    r.rect(6, 25, 20, 1, R.yellow[1])
    r.rect(6, 6, 1, 20, R.yellow[1])
    r.rect(25, 6, 1, 20, R.yellow[1])
  }
  for (const [i, j] of PIPS[n - 1]) {
    const x = 10 + i * 6
    const y = 10 + j * 6
    if (n === 1) {
      r.ellipse(16, 16, 4.5, 4.5, R.red[2])
      r.ellipse(15.5, 15.5, 4, 4, R.red[1])
      r.set(13, 13, R.red[0])
    } else {
      r.ellipse(x + 0.5, y + 0.5 + 1, 2.1, 2.1, gold ? R.red[2] : C.inkCool)
      r.ellipse(x + 0.5, y + 0.5, 2.1, 2.1, gold ? R.red[1] : C.inkCool)
    }
  }
  if (gold) {
    r.line(21, 5, 25, 9, C.white)
    r.line(7, 22, 10, 25, C.white)
    r.set(26, 3, C.white)
    r.set(25, 4, C.white)
    r.set(27, 4, C.white)
    r.set(26, 5, C.white)
  }
  return r
}

// ---------------------------------------------------------------------------------------------
// 料理: onigiri, a fried egg and an octopus sausage — each spinning.

const RICE: Ramp = [R.paper[0], C.white, R.paper[2], R.paper[3], R.paper[4]]

function onigiriSpin(f: number, s = 1) {
  const r = new Raster(N, N)
  const a = (f / 4) * Math.PI * 2 * 0.5
  const P = (pts: number[]) =>
    turn(
      pts.map((v) => 16 + (v - 16) * s),
      16,
      16,
      a
    )
  part(r, (l) => {
    const tri = [16, 4, 28, 25, 4, 25]
    l.poly(P(tri), C.white)
    for (let k = 0; k < 6; k += 2) {
      const [x, y] = P([tri[k], tri[k + 1]]) as [number, number]
      const [nx, ny] = P([tri[(k + 2) % 6], tri[(k + 3) % 6]]) as [number, number]
      l.thick(x, y, nx, ny, 3, C.white)
    }
    shadeEdges(l, RICE, 1)
    l.poly(P([9, 19, 23, 19, 25.5, 25.5, 6.5, 25.5]), R.hair[3])
    l.poly(P([9, 19, 12, 19, 10, 25.5, 6.5, 25.5]), R.hair[2])
    l.ellipse(...(P([16, 12]) as [number, number]), 1.6 * s, 1.6 * s, R.red[1])
  })
  return r
}

function friedEgg(f: number) {
  const r = new Raster(N, N)
  const a = [0, 0.5, 1, 1.5][f]
  const at = (x: number, y: number) => spin(16 + x, 16 + y, 16, 16, a)
  part(r, (l) => {
    for (const [x, y, rad] of [
      [-6, 0, 7],
      [3, -5, 7],
      [6, 4, 6.5],
      [-2, 6, 6],
      [0, 0, 8]
    ]) {
      const [px, py] = at(x, y)
      l.ellipse(px, py, rad, rad, C.white)
    }
    shadeEdges(l, RICE, 1)
    const [yx, yy] = at(0.5, 0)
    ball(l, yx, yy, 5, 5, [R.yellow[0], R.yellow[1], R.orange[1], R.orange[2], R.orange[3]])
  })
  return r
}

function sausage(f: number) {
  const r = new Raster(N, N)
  const a = (f / 4) * Math.PI * 2
  const at = (x: number, y: number) => spin(16 + x, 16 + y, 16, 16, a)
  // Curly legs first (behind the head), then the dome and its face.
  part(r, (l) => {
    for (let k = 0; k < 4; k++) {
      const x0 = -6 + k * 4
      const [sx, sy] = at(x0 * 0.7, 3)
      const [mx, my] = at(x0 * 1.1, 9)
      const [ex, ey] = at(x0 * 1.55 + (k % 2 ? -2 : 2), 12 + (k % 2))
      l.thick(sx, sy, mx, my, 2, R.red[1])
      l.thick(mx, my, ex, ey, 2, R.red[1])
    }
  })
  part(r, (l) => {
    const [hx, hy] = at(0, -3)
    ball(l, hx, hy, 8.5, 8.5, R.red)
  })
  for (const [x, y, c] of [
    [-3, -5, C.white],
    [3, -5, C.white],
    [-3, -4, C.inkWarm],
    [3, -4, C.inkWarm],
    [-1, -1.5, C.inkWarm],
    [0, -1, C.inkWarm],
    [1, -1.5, C.inkWarm]
  ] as [number, number, number][]) {
    const [px, py] = at(x, y)
    r.set(px, py, c)
  }
  return r
}

// ---------------------------------------------------------------------------------------------
// カラオケ / 筋トレ: a microphone and a dumbbell.

function mic(f: number) {
  const r = new Raster(N, N)
  part(r, (l) => {
    l.thick(11, 23, 20, 14, 5, R.hair[2])
    l.thick(12, 22, 17, 17, 1.4, R.hair[0])
    l.rect(13, 21, 2, 2, R.red[1])
    ball(l, 22, 10, 7.5, 7.5, R.metal)
    for (let k = -1; k <= 1; k++) l.line(17, 10 + k * 3 + 3, 27, 10 + k * 3 - 3, R.metal[2])
    l.thick(15, 17, 18, 14, 4.5, R.metal[0])
  })
  // Sound waves.
  const w = f ? 1 : 0
  r.line(4, 5 + w, 7, 3 + w, R.pink[1])
  r.line(2, 9 + w, 5, 8 + w, R.pink[1])
  r.line(27 - w * 2, 25, 30 - w * 2, 23, R.mint[1])
  r.set(5, 12 - w, R.yellow[0])
  return r
}

function dumbbell(f: number) {
  const r = new Raster(N, N)
  const y = f ? -1 : 0
  part(r, (l) => {
    l.rect(8, 15 + y, 16, 3, R.metal[1])
    l.rect(8, 15 + y, 16, 1, R.metal[0])
    for (const x of [2, 24]) {
      l.rect(x, 7 + y, 6, 19, R.hair[2])
      l.rect(x + (x < 10 ? 1 : 0), 7 + y, 5, 2, R.hair[0])
      l.rect(x < 10 ? 7 : 22, 10 + y, 3, 13, R.hair[1])
    }
  })
  r.rect(3, 9 + y, 1, 5, R.paper[3])
  r.rect(25, 9 + y, 1, 5, R.paper[3])
  r.set(f ? 12 : 18, 15 + y, C.white)
  r.set(f ? 13 : 19, 15 + y, C.white)
  if (f) {
    r.set(15, 3, C.white)
    r.line(14, 4, 16, 4, C.white)
  }
  return r
}

// ---------------------------------------------------------------------------------------------
// The reading beam: a straight stream of warm knowledge-light, one of 32 directions, cached.

export const BEAM_DIRS = 32
const beams = new Map<string, Raster>()

/**
 * Beam of light centred on the raster: it spans ±`length` along the direction `dir`/32·2π (0 = right, y down),
 * half-width about 9 px, with a white core, pale-yellow body, mint/sky edges and small floating letter/page bits.
 */
export function beam(length: number, dir: number) {
  const L = Math.max(16, Math.round(length / 8) * 8)
  const dd = ((Math.round(dir) % BEAM_DIRS) + BEAM_DIRS) % BEAM_DIRS
  const key = `${L}:${dd}`
  let r = beams.get(key)
  if (r) return r
  const pad = 14
  const size = (L + pad) * 2
  const c = size / 2
  const a = (dd / BEAM_DIRS) * Math.PI * 2
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  r = new Raster(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - c
      const py = y + 0.5 - c
      const u = px * ca + py * sa
      const v = -px * sa + py * ca
      if (Math.abs(u) > L) continue
      // Narrower toward the far tip, both ends rounded.
      let hw = 9.4 - (1.6 * (u + L)) / (2 * L)
      const cap = Math.max(0, Math.abs(u) - (L - 9))
      hw *= Math.sqrt(Math.max(0, 1 - (cap / 9) * (cap / 9)))
      const av = Math.abs(v)
      if (av > hw) continue
      let col: number
      if (av >= hw - 1.3) col = R.sky[1]
      else if (av >= hw - 3.2) col = R.mint[0]
      else if (av < 2.2) col = C.white
      else col = R.yellow[0]
      // Light streaming along the beam: diagonal glints in the core and pale bands in the body.
      const wave = (u * 0.5 + av * 1.2 + 1000) % 14
      if (col === R.yellow[0] && wave < 1.6) col = C.white
      else if (col === C.white && wave > 9 && wave < 11) col = R.yellow[0]
      r.set(x, y, col)
    }
  // Floating pages and letters along the beam (forward-mapped 3×3 blocks).
  const bit = (u: number, v: number, kind: number) => {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const lu = u + i - 1
        const lv = v + j - 1
        const colour =
          kind % 3 === 0 ? (i === 1 && j === 1 ? R.navy[1] : C.white) : kind % 3 === 1 ? R.pink[1] : R.sky[0]
        for (const s of [0, 0.5]) r.set(c + (lu + s) * ca - lv * sa, c + (lu + s) * sa + lv * ca, colour)
      }
  }
  for (let k = 0, u = -L + 12; u < L - 8; k++, u += 15 + (k % 3) * 4) {
    const side = k % 2 ? -1 : 1
    bit(u, side * (4 + ((k * 5) % 6)), k)
    if (k % 3 === 0) bit(u + 7, -side * (8 + (k % 4)), k + 1)
  }
  beams.set(key, r)
  return r
}

// ---------------------------------------------------------------------------------------------
// Effect particles (shared `fx` sheet).

/** SNS notification: a red bubble with a white heart popping up. */
const like = (f: number) =>
  tiny(16, 16, (l) => {
    const w = [10, 14, 13][f]
    const h = [8, 11, 10][f]
    const x = Math.round((16 - w) / 2)
    const y = [4, 1, 2][f]
    l.rect(x + 1, y, w - 2, h, R.red[1])
    l.rect(x, y + 1, w, h - 2, R.red[1])
    l.poly([x + 2, y + h - 1, x + 6, y + h - 1, x + 3, y + h + 3], R.red[2])
    l.rect(x + 1, y, w - 2, 1, R.red[0])
    if (f > 0) {
      const hx = 8 - 3
      const hy = y + 2
      l.stamp(['.ww.ww.', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..', '...w...'], hx, hy, { w: C.white })
    } else l.stamp(['w.w', 'www', '.w.'], 6, y + 2, { w: C.white })
  })

/** Music notes in three shapes and colours: ♪ pink, ♫ mint, ♩ yellow. */
const note = (f: number) =>
  tiny(12, 14, (l) => {
    const c = [R.pink, R.mint, R.yellow][f]
    if (f === 0) {
      l.ellipse(4, 11, 2.6, 2, c[1])
      l.rect(6, 2, 2, 9, c[1])
      l.poly([8, 2, 11, 5, 11, 8, 8, 6], c[1])
    } else if (f === 1) {
      l.ellipse(3, 11, 2.3, 1.8, c[1])
      l.ellipse(9, 9, 2.3, 1.8, c[1])
      l.rect(4, 3, 1, 8, c[1])
      l.rect(10, 1, 1, 8, c[1])
      l.rect(4, 2, 7, 2, c[0])
      l.rect(4, 4, 7, 1, c[1])
    } else {
      l.ellipse(5, 11, 2.7, 2.1, c[1])
      l.rect(7, 2, 2, 9, c[1])
      l.set(5, 10, c[0])
    }
  })

/** Ground dust puff (grows and thins out). */
const dust = (f: number) =>
  tiny(
    16,
    16,
    (l) => {
      const puffs = [
        [[8, 11, 3.6]],
        [
          [5, 10, 3.4],
          [10, 9, 4],
          [8, 12, 3.2]
        ],
        [
          [3, 12, 2.4],
          [8, 8, 2.6],
          [13, 11, 2.4],
          [8, 13, 2]
        ]
      ][f]
      for (const [x, y, rad] of puffs)
        ball(l, x, y, rad, rad, [C.white, R.paper[1], R.paper[2], R.paper[3], R.paper[4]], false)
    },
    false
  )

/** Ground crack / impact ring in perspective. */
const crack = (f: number) =>
  tiny(
    48,
    24,
    (l) => {
      const rx = [15, 22][f]
      const ry = [6, 9][f]
      for (let a = 0; a < Math.PI * 2; a += 0.04) {
        l.set(24 + Math.cos(a) * rx, 12 + Math.sin(a) * ry, f ? R.paper[2] : R.paper[1])
        l.set(24 + Math.cos(a) * (rx - 1.2), 12 + Math.sin(a) * (ry - 0.8), f ? R.paper[1] : C.white)
      }
      // Jagged cracks radiating from the centre.
      const reach = [10, 18][f]
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.3
        let x = 24
        let y = 12
        for (let s = 0; s < 3; s++) {
          const wob = ((k * 7 + s * 5) % 5) - 2
          const nx = x + (Math.cos(a) * reach) / 3 + wob * 0.4
          const ny = y + (Math.sin(a) * reach * 0.42) / 3 + wob * 0.3
          l.line(x, y, nx, ny, C.inkWarm)
          x = nx
          y = ny
        }
      }
      l.set(24, 12, C.inkWarm)
      if (f)
        for (const [x, y] of [
          [8, 5],
          [40, 18],
          [14, 20],
          [36, 4]
        ])
          l.rect(x, y, 2, 2, R.brown[1])
    },
    false
  )

/** Fragrance cloud: lilac-pink puffs with sparkles. */
const perfume = (f: number) =>
  tiny(
    32,
    32,
    (l) => {
      const cloud: Ramp = [R.pink[0], R.pink[1], R.purple[0], R.purple[1], R.purple[2]]
      const sw = [0, 1, 0][f]
      for (const [x, y, rad] of [
        [10 + sw, 20, 7],
        [22 - sw, 20, 7],
        [16, 15 - sw, 8],
        [8, 14 + sw, 4.5],
        [24, 13 - sw, 4.5],
        [16, 24, 6]
      ])
        ball(l, x, y, rad, rad * 0.9, cloud, false)
      const sp = [
        [6, 5],
        [25, 6],
        [16, 3],
        [27, 25],
        [5, 26]
      ]
      sp.forEach(([x, y], k) => {
        if ((k + f) % 3 === 0) return
        l.line(x - 2, y, x + 2, y, C.white)
        l.line(x, y - 2, x, y + 2, C.white)
      })
    },
    false
  )

/** Cartoon explosion: flash, fireball, bigger fireball with smoke, smoke ring, thin fading ring. */
const boom = (f: number) =>
  tiny(
    48,
    48,
    (l) => {
      const star = (rad: number, inner: number, n: number, a0: number, c: number) => {
        const pts: number[] = []
        for (let k = 0; k < n * 2; k++) {
          const rr = k % 2 ? inner : rad
          const a = a0 + (k / (n * 2)) * Math.PI * 2
          pts.push(24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr)
        }
        l.poly(pts, c)
      }
      if (f === 0) {
        star(20, 7, 8, 0.2, C.white)
        star(13, 6, 8, 0.6, R.yellow[0])
        l.ellipse(24, 24, 6, 6, C.white)
      } else if (f === 1) {
        star(22, 13, 10, 0, R.orange[1])
        star(18, 11, 10, 0.3, R.yellow[1])
        ball(l, 24, 24, 11, 11, [C.white, R.yellow[0], R.yellow[1], R.orange[1], R.orange[2]])
      } else if (f === 2) {
        ball(l, 24, 25, 20, 19, [R.yellow[1], R.orange[1], R.red[1], R.red[2], R.red[3]])
        ball(l, 24, 25, 12, 11, [C.white, R.yellow[0], R.yellow[1], R.orange[1], R.orange[2]], false)
        for (const [x, y] of [
          [8, 12],
          [40, 14],
          [10, 38],
          [38, 38],
          [24, 5]
        ])
          ball(l, x, y, 3.5, 3.5, R.metal, false)
      } else if (f === 3) {
        for (let a = 0; a < Math.PI * 2; a += 0.55) {
          const rad = 3.5 + ((a * 5) % 2)
          ball(l, 24 + Math.cos(a) * 17, 24 + Math.sin(a) * 16, rad, rad, R.metal, false)
        }
        ball(l, 24, 24, 11, 10, [R.orange[0], R.orange[1], R.red[1], R.red[2], R.red[3]], false)
      } else {
        for (let a = 0; a < Math.PI * 2; a += 0.7) {
          const rad = 2.4 + ((a * 3) % 1.5)
          ball(l, 24 + Math.cos(a) * 21, 24 + Math.sin(a) * 20, rad, rad, R.paper, false)
        }
        for (const [x, y] of [
          [24, 24],
          [20, 28],
          [28, 20]
        ])
          l.rect(x, y, 2, 2, R.metal[2])
      }
    },
    f >= 2
  )

/** Hit spark: a small white/yellow star that shrinks. */
const spark = (f: number) =>
  tiny(
    12,
    12,
    (l) => {
      const s = [5, 4, 2][f]
      l.line(6 - s, 6, 6 + s, 6, f === 2 ? R.yellow[0] : C.white)
      l.line(6, 6 - s, 6, 6 + s, f === 2 ? R.yellow[0] : C.white)
      if (f < 2) {
        l.line(6 - 3, 6 - 3, 6 + 3, 6 + 3, R.yellow[0])
        l.line(6 - 3, 6 + 3, 6 + 3, 6 - 3, R.yellow[0])
      }
      l.set(6, 6, C.white)
    },
    false
  )

/** Critical hit: a big orange-red star burst with a yellow heart. */
const crit = (f: number) =>
  tiny(20, 20, (l) => {
    const pts: number[] = []
    for (let k = 0; k < 16; k++) {
      const rr = k % 2 ? 5.2 : 9.6
      const a = (k / 16) * Math.PI * 2 + f * 0.2
      pts.push(10 + Math.cos(a) * rr, 10 + Math.sin(a) * rr)
    }
    l.poly(pts, R.red[1])
    const inner: number[] = []
    for (let k = 0; k < 16; k++) {
      const rr = k % 2 ? 3 : 6.2
      const a = (k / 16) * Math.PI * 2 + f * 0.2
      inner.push(10 + Math.cos(a) * rr, 10 + Math.sin(a) * rr)
    }
    l.poly(inner, R.orange[0])
    l.ellipse(10, 10, 2.6, 2.6, R.yellow[0])
    l.set(9, 9, C.white)
  })

/** Enemy death poof: a white-grey smoke puff that swells and breaks into a ring. */
const poof = (f: number) =>
  tiny(
    24,
    24,
    (l) => {
      const smoke: Ramp = [C.white, R.paper[1], R.paper[2], R.paper[3], R.paper[4]]
      if (f === 0) ball(l, 12, 13, 6, 6, smoke, false)
      else if (f === 1) {
        ball(l, 8, 14, 5, 5, smoke, false)
        ball(l, 16, 14, 5, 5, smoke, false)
        ball(l, 12, 9, 6, 6, smoke, false)
      } else if (f === 2) {
        for (const [x, y] of [
          [5, 15],
          [19, 15],
          [12, 5],
          [7, 8],
          [17, 8]
        ])
          ball(l, x, y, 4, 4, smoke, false)
        ball(l, 12, 13, 5, 4, smoke, false)
        l.ellipse(12, 12, 3, 3, 0)
      } else {
        for (const [x, y] of [
          [3, 16],
          [21, 16],
          [12, 3],
          [4, 6],
          [20, 6],
          [12, 21]
        ])
          ball(l, x, y, 2.4, 2.4, smoke, false)
      }
    },
    false
  )

/** Gem sparkle. */
const shine = (f: number) =>
  tiny(
    8,
    8,
    (l) => {
      const s = f ? 2 : 3
      l.line(4 - s, 4, 4 + s, 4, f ? R.yellow[0] : C.white)
      l.line(4, 4 - s, 4, 4 + s, f ? R.yellow[0] : C.white)
      l.set(4, 4, C.white)
      if (!f) {
        l.set(2, 2, R.yellow[0])
        l.set(6, 6, R.yellow[0])
      }
    },
    false
  )

/** Healing: a small green plus. */
const heal = (f: number) =>
  tiny(12, 12, (l) => {
    l.rect(4, 2 + f, 4, 8, R.green[1])
    l.rect(2, 4 + f, 8, 4, R.green[1])
    l.rect(4, 3 + f, 4, 1, R.green[0])
    l.set(5, 5 + f, C.white)
    l.set(6, 5 + f, C.white)
  })

// ---------------------------------------------------------------------------------------------
// Icons (32×32).

const heart = (c1: number, c2: number) => (l: Raster, x: number, y: number) =>
  l.stamp(['.hh.hh.', 'hhhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'], x, y, { h: c1, H: c2 })

const ICONS: Record<string, () => Raster> = {
  // SNS: a smartphone with a heart notification badge.
  w_sns: () =>
    tiny(32, 32, (l) => {
      l.rect(8, 2, 16, 28, R.hair[2])
      l.rect(9, 1, 14, 30, R.hair[2])
      l.rect(10, 5, 12, 21, R.sky[0])
      l.rect(10, 5, 12, 3, R.sky[1])
      l.rect(14, 3, 4, 1, R.hair[0])
      l.ellipse(16, 28, 1.5, 1.2, R.hair[0])
      heart(R.red[1], R.red[0])(l, 12.5, 12)
      l.rect(13, 13, 2, 1, R.red[0])
      l.rect(11, 22, 10, 1, R.sky[2])
    })
      .blit(
        tiny(11, 11, (l) => ball(l, 5.5, 5.5, 5, 5, R.red), true),
        19,
        1
      )
      .blit(new Raster(3, 5).rect(1, 0, 1, 4, C.white), 23, 3),
  w_pet: () =>
    tiny(32, 32, (l) => {
      l.poly([4, 14, 6, 2, 14, 8], SHIBA[2])
      l.poly([28, 14, 26, 2, 18, 8], SHIBA[2])
      ball(l, 16, 17, 12, 10.5, SHIBA)
      l.poly([7, 12, 7.5, 6, 11.5, 9], R.pink[1])
      l.poly([25, 12, 24.5, 6, 20.5, 9], R.pink[1])
      l.ellipse(16, 21.5, 7, 5.2, R.paper[1])
      l.ellipse(9.5, 17, 3.2, 3, R.paper[1])
      l.ellipse(22.5, 17, 3.2, 3, R.paper[1])
      l.ellipse(16, 26.5, 2.4, 2.4, R.red[1])
    }),
  w_muscle: () => dumbbell(0),
  w_reading: () => openBook(0),
  // 残業: a red stapler with a staple in its jaws.
  w_overtime: () =>
    tiny(32, 32, (l) => {
      l.rect(3, 21, 26, 6, R.hair[2])
      l.rect(3, 21, 26, 1, R.hair[0])
      l.poly([3, 15, 24, 8, 29, 13, 29, 21, 3, 21], R.red[1])
      l.poly([3, 15, 24, 8, 25, 10, 3, 17], R.red[0])
      l.rect(3, 19, 26, 2, R.red[2])
      l.rect(22, 18, 7, 3, R.metal[1])
      l.rect(9, 12, 7, 2, R.red[2])
    }),
  w_ring: () => ring(0),
  w_karaoke: () => mic(0),
  w_travel: () => plane(1),
  w_savings: () => pig(0, false),
  w_gamble: () => cube(0.25, 13, 17),
  // 香水: a pink-lilac perfume bottle with a golden cap and a spritz.
  w_perfume: () =>
    tiny(32, 32, (l) => {
      l.rect(14, 8, 6, 5, R.yellow[2])
      l.rect(12, 2, 10, 7, R.yellow[1])
      l.rect(12, 2, 10, 2, R.yellow[0])
      l.rect(5, 12, 22, 17, R.purple[0])
      l.rect(5, 12, 22, 3, C.white)
      l.rect(8, 15, 16, 12, R.pink[1])
      l.rect(8, 15, 16, 3, R.pink[0])
      l.rect(8, 25, 16, 2, R.pink[2])
      l.rect(22, 12, 5, 17, R.purple[1])
      l.rect(10, 17, 2, 7, C.white)
      l.stamp(['.p.', 'ppp', '.p.'], 14, 20, { p: R.pink[0] })
    }),
  // 料理: a frying pan with a fried egg.
  w_cooking: () =>
    tiny(32, 32, (l) => {
      l.thick(21, 21, 30, 29, 4, R.brown[1])
      l.thick(21, 21, 30, 29, 1.4, R.brown[0])
      ball(l, 14, 17, 13, 10, R.hair)
      l.ellipse(14, 16, 10.5, 7.5, R.metal[2])
      l.ellipse(13, 15, 9, 6, R.metal[1])
      for (const [x, y, rad] of [
        [9, 14, 5],
        [16, 12, 5],
        [18, 17, 4.5],
        [11, 18, 4]
      ])
        l.ellipse(x, y, rad, rad, C.white)
      ball(l, 13.5, 15, 3.6, 3.6, [R.yellow[0], R.yellow[1], R.orange[1], R.orange[2], R.orange[3]])
      l.set(11, 7, R.paper[2])
      l.set(16, 5, R.paper[2])
    }),
  // 運がいい: a four-leaf clover.
  p_lucky: () =>
    tiny(32, 32, (l) => {
      l.thick(16, 17, 12, 30, 2.4, R.green[2])
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ]) {
        const ux = dx * 0.707
        const uy = dy * 0.707
        const cx = 16 + ux * 7.5
        const cy = 15 + uy * 7.5
        l.poly([16, 15, cx - uy * 5, cy + ux * 5, cx + ux * 5, cy + uy * 5, cx + uy * 5, cy - ux * 5], R.green[1])
        ball(l, cx - uy * 3, cy + ux * 3, 4.6, 4.6, R.green, false)
        ball(l, cx + uy * 3, cy - ux * 3, 4.6, 4.6, R.green, false)
        l.line(16, 15, cx + ux * 2, cy + uy * 2, R.green[0])
      }
      l.ellipse(16, 15, 2, 2, R.green[1])
    }),
  // 器用: a ball of yarn with knitting needles.
  p_clever: () =>
    tiny(32, 32, (l) => {
      ball(l, 14, 18, 11, 10.5, R.pink)
      for (const k of [-6, -2, 2, 6]) {
        for (let a = -0.9; a <= 0.9; a += 0.05)
          l.set(14 + Math.sin(a * 1.4) * 10 + k * 0.4, 18 + k + Math.cos(a) * 2 - 2, R.pink[2])
      }
      l.line(7, 14, 21, 25, R.pink[2])
      l.line(9, 11, 23, 22, R.pink[2])
      l.thick(21, 25, 28, 29, 1.6, R.pink[1])
      l.thick(28, 29, 29, 25, 1.6, R.pink[1])
      l.thick(15, 27, 28, 3, 1.8, R.metal[1])
      l.thick(8, 23, 26, 3, 1.8, R.metal[0])
      l.ellipse(28, 3, 2, 2, R.yellow[1])
      l.ellipse(26.5, 2.5, 2, 2, R.yellow[1])
    }),
  // 好奇心: a telescope on a tripod.
  p_curious: () =>
    tiny(32, 32, (l) => {
      l.line(14, 20, 8, 30, R.brown[2])
      l.line(16, 20, 17, 30, R.brown[2])
      l.line(18, 20, 25, 30, R.brown[2])
      l.thick(5, 17, 12, 13, 6, R.navy[1])
      l.thick(11, 14, 19, 9, 8, R.navy[0])
      l.thick(19, 9, 26, 5, 10, R.navy[1])
      l.thick(10, 14.5, 11, 14, 8, R.yellow[1])
      l.thick(19, 9.5, 20, 9, 10.5, R.yellow[1])
      l.thick(5, 17, 12, 13, 2, R.navy[0])
      l.ellipse(27, 4.5, 3.2, 4.4, R.sky[0])
      l.set(26, 3, C.white)
      l.set(26, 4, C.white)
    }),
  // 空気が読める: eyes glancing sideways.
  p_savvy: () =>
    tiny(32, 32, (l) => {
      for (const cx of [9, 23]) {
        l.ellipse(cx, 19, 6.5, 7.5, C.white)
        l.rect(cx - 6, 11, 13, 1, R.paper[2])
        l.ellipse(cx + 2.6, 20, 3, 4, C.inkCool)
        l.set(cx + 3, 18, C.white)
        l.set(cx + 4, 18, C.white)
      }
      l.line(3, 8, 12, 6, R.hair[2])
      l.line(19, 7, 28, 9, R.hair[2])
      l.thick(3, 8, 12, 6, 2, R.hair[2])
      l.thick(19, 7, 28, 9, 2, R.hair[2])
      l.set(28, 15, R.mint[0])
      l.set(28, 16, R.mint[0])
      l.set(29, 17, R.mint[0])
    })
}

// ---------------------------------------------------------------------------------------------
// Public entry points.

export function arsenalSheets(): Record<string, () => Sheet> {
  return {
    'weapon:w_pet': () => ({
      fly: loop(
        many(4, (f) => dog(f, 'run')),
        12
      ),
      bite: loop([dog(0, 'closed'), dog(0, 'open')], 6)
    }),
    'weapon:w_reading': () => ({ fly: loop(many(4, openBook), 6) }),
    'weapon:w_overtime': () => ({ fly: loop(many(STAPLE_DIRS, staple), 1) }),
    'weapon:w_ring': () => ({ fly: loop(many(4, ring), 12) }),
    'weapon:w_travel': () => ({ fly: loop(many(4, plane), 8) }),
    'weapon:w_savings': () => ({
      fly: loop([pig(0, false), pig(1, false)], 3),
      armed: loop([pig(0, true), pig(1, true)], 4)
    }),
    'weapon:w_gamble': () => ({
      fly: loop(
        many(4, (f) => cube((f * Math.PI) / 8, 11)),
        12
      ),
      faces: loop(
        many(6, (f) => dieFace(f + 1)),
        1
      )
    }),
    'weapon:w_cooking': () => ({
      fly: loop(
        many(4, (f) => onigiriSpin(f)),
        12
      ),
      alt: loop(many(4, friedEgg), 12),
      alt2: loop(many(4, sausage), 12)
    }),
    'weapon:w_karaoke': () => ({ fly: loop(many(2, mic), 4) }),
    'weapon:w_muscle': () => ({ fly: loop(many(2, dumbbell), 4) })
  }
}

/** Extra effect sprites merged into the shared `fx` sheet. */
export function arsenalFx(): Record<string, Anim> {
  return {
    like: loop(many(3, like), 10),
    note: loop(many(3, note), 1),
    dust: loop(many(3, dust), 10),
    crack: loop(many(2, crack), 12),
    perfume: loop(many(3, perfume), 4),
    boom: { frames: many(5, boom), fps: 16, loop: false },
    spark: loop(many(3, spark), 20),
    crit: loop(many(2, crit), 12),
    poof: { frames: many(4, poof), fps: 14, loop: false },
    shine: loop(many(2, shine), 6),
    heal: loop(many(2, heal), 6)
  }
}

/** 32×32 HUD icons for the new weapons and passives, merged into the `icons` sheet. */
export function arsenalIcons(): Record<string, Raster> {
  return Object.fromEntries(Object.entries(ICONS).map(([id, make]) => [id, icon(make())]))
}
