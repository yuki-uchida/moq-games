import { C, R } from './palette'
import { Raster, ball, part, shadeEdges, type Ramp } from './raster'
import type { Sheet } from './sheet'

/** New regular enemies, part 2 (64×64, 4–6 frames, feet on row ≤ 58). Keys are `enemy:<id>`. */

const INK = C.inkCool
const cycle = (n: number, f: (i: number, t: number) => Raster, fps: number): Sheet => ({
  move: {
    frames: Array.from({ length: n }, (_, i) => f(i, (i / n) * Math.PI * 2)),
    fps,
    loop: true
  }
})

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
/** Ordered-dither erase: removes pixels whose threshold is below `level(x, y)` (0–16). */
const dither = (r: Raster, level: number | ((x: number, y: number) => number)) =>
  r.map((c, x, y) => (BAYER[(y & 3) * 4 + (x & 3)] < (typeof level === 'number' ? level : level(x, y)) ? 0 : c))

/** Oblique box: front face, lit top, shaded right side. */
function box(r: Raster, x: number, y: number, w: number, h: number, d: number, ramp: Ramp) {
  r.rect(x, y, w, h, ramp[1])
  r.poly([x, y, x + d, y - d, x + w + d, y - d, x + w, y], ramp[0])
  r.poly([x + w, y, x + w + d, y - d, x + w + d, y + h - d, x + w, y + h], ramp[2])
}

/** A white eye with a brow slammed down toward the middle (`inner` = +1 when the nose is on its right). */
function angryEye(l: Raster, ex: number, ey: number, inner: 1 | -1, w = 6, h = 4) {
  l.rect(ex, ey, w, h, C.white)
  l.rect(ex + (inner > 0 ? w - 3 : 1), ey + h - 2, 2, 2, INK)
  for (let k = 0; k < w; k++) {
    const drop = inner > 0 ? Math.floor((k * 3) / w) : Math.floor(((w - 1 - k) * 3) / w)
    l.rect(ex + k, ey - 1 + drop, 1, 2, INK)
  }
}

/** A slanted wedge-shaped eye (angry slit) with an optional pupil dot. */
function slitEye(l: Raster, ex: number, ey: number, inner: 1 | -1, col: number, pupil?: number) {
  for (let k = 0; k < 5; k++) {
    const t = inner > 0 ? Math.floor(k / 2) : Math.floor((4 - k) / 2)
    l.rect(ex + k, ey + t, 1, 3 - t + 1, col)
  }
  if (pupil) l.set(ex + (inner > 0 ? 3 : 1), ey + 3, pupil)
}

/** A grin of white teeth in a dark mouth. */
function teeth(l: Raster, x: number, y: number, w: number, h: number) {
  l.rect(x, y, w, h, INK)
  for (let k = 1; k < w - 1; k += 2) {
    l.rect(x + k, y, 1, 1, C.white)
    l.rect(x + k, y + h - 1, 1, 1, C.white)
  }
}

const BLACK: Ramp = [R.hair[0], R.hair[1], R.hair[2], R.hair[3], R.hair[4]]
const FOG: Ramp = [R.paper[0], R.paper[1], R.paper[2], R.paper[3], INK]

// ---------------------------------------------------------------------------------------------
// 締め切り: a furious red alarm clock, bells rattling, shaking on its stubby legs.

function deadline(i: number) {
  const r = new Raster(64, 64)
  const dx = [-1, 1, -2, 2, -1, 1][i]
  const rat = i % 2 ? 1 : -1
  const cx = 32 + dx
  const cy = 36
  for (const s of [-1, 1])
    part(r, (l) => {
      l.thick(cx + s * 9, 47, cx + s * 12, 55, 3, R.metal[2])
      l.rect(cx + s * 12 - 2, 55, 5, 2, R.metal[3])
    })
  // Ringing arcs.
  part(
    r,
    (l) => {
      const k = i % 3
      for (const s of [-1, 1]) {
        l.line(cx + s * (21 + k), cy - 20, cx + s * (24 + k), cy - 16, R.yellow[0])
        l.line(cx + s * (24 + k), cy - 14, cx + s * (27 + k), cy - 11, R.yellow[0])
        l.line(cx + s * (22 + k), cy - 8, cx + s * (25 + k), cy - 7, R.yellow[1])
      }
    },
    false
  )
  part(r, (l) => {
    ball(l, cx, cy, 16, 16, R.red)
    l.rect(cx - 2, cy + 13, 5, 2, R.red[3])
  })
  // Hammer and bells.
  part(r, (l) => {
    l.line(cx, cy - 17, cx + rat * 2, cy - 21, R.metal[2])
    l.rect(cx + rat * 2 - 1, cy - 23, 3, 2, R.metal[1])
    for (const s of [-1, 1]) {
      const bx = cx + s * 10 + s * rat
      const by = cy - 14 - (s * rat > 0 ? 1 : 0)
      ball(l, bx, by, 6, 4.5, R.yellow)
      l.rect(bx - 6, by + 3, 12, 1, R.yellow[2])
    }
  })
  // Clock face with angry eyes and a clenched grin.
  part(
    r,
    (l) => {
      ball(l, cx, cy + 1, 11.5, 11.5, R.paper, false)
      for (const [tx, ty] of [
        [0, -10],
        [10, 1],
        [-10, 1],
        [0, 12]
      ])
        l.rect(cx + tx, cy + 1 + ty, 1, 2, R.red[2])
      angryEye(l, cx - 8, cy - 5, 1)
      angryEye(l, cx + 3, cy - 5, -1)
      teeth(l, cx - 4, cy + 5, 9, 4)
    },
    false
  )
  return r
}

// ---------------------------------------------------------------------------------------------
// 会議: a whiteboard golem on table legs with a single projector eye, stomping slowly.

function meeting(i: number) {
  const r = new Raster(64, 64)
  const liftL = [0, 2, 3, 0, 0, 0][i]
  const liftR = [0, 0, 0, 0, 2, 3][i]
  const yb = [1, -1, -1, 1, -1, -1][i]
  const sway = [0, 1, 1, 0, -1, -1][i]
  for (const [x, lift] of [
    [13, liftL],
    [41, liftR]
  ] as const)
    part(r, (l) => {
      l.rect(x, 38, 7, 18 - lift, R.brown[1])
      l.rect(x + 5, 38, 2, 18 - lift, R.brown[2])
      l.rect(x - 1, 54 - lift, 9, 3, R.metal[2])
      l.rect(x - 1, 54 - lift, 9, 1, R.metal[1])
    })
  // Arms with metal fists.
  for (const [ax, fx] of [
    [11, 5],
    [57, 60]
  ])
    part(r, (l) => {
      l.thick(ax, 24 + yb, fx, 32 + sway + yb, 3, R.metal[2])
      ball(l, fx, 34 + sway + yb, 3.5, 3.5, R.metal)
    })
  part(r, (l) => {
    box(l, 9, 8 + yb, 46, 35, 4, R.metal)
    l.rect(11, 10 + yb, 42, 28, R.paper[1])
    l.rect(11, 10 + yb, 42, 1, R.paper[0])
    l.rect(11, 37 + yb, 42, 1, R.paper[2])
    // Marker tray and markers.
    l.rect(11, 38 + yb, 42, 3, R.metal[2])
    l.rect(15, 38 + yb, 4, 2, R.red[1])
    l.rect(21, 38 + yb, 4, 2, R.navy[1])
    l.rect(27, 38 + yb, 4, 2, R.green[1])
    // Bar chart on the left, falling line graph on the right.
    l.rect(13, 25 + yb, 3, 9, R.red[1])
    l.rect(17, 20 + yb, 3, 14, R.navy[1])
    l.rect(13, 34 + yb, 7, 1, R.paper[3])
    l.line(42, 15 + yb, 46, 20 + yb, R.red[1])
    l.line(46, 20 + yb, 48, 18 + yb, R.red[1])
    l.line(48, 18 + yb, 51, 27 + yb, R.red[1])
    l.rect(49, 27 + yb, 4, 1, R.red[1])
    l.rect(41, 34 + yb, 11, 1, R.paper[3])
  })
  // Projector eye with slammed brows and a jagged marker mouth.
  part(
    r,
    (l) => {
      const ex = 32
      const ey = 22 + yb
      l.ellipse(ex, ey, 8, 8, R.metal[2])
      l.ellipse(ex - 0.5, ey - 0.5, 7, 7, R.metal[1])
      l.ellipse(ex, ey, 5, 5, R.navy[3])
      l.ellipse(ex, ey, 3, 3, i % 2 ? R.red[1] : R.red[0])
      l.set(ex - 1, ey - 1, C.white)
      l.thick(21, 11 + yb, 29, 14 + yb, 2, INK)
      l.thick(43, 11 + yb, 35, 14 + yb, 2, INK)
      for (let x = 22; x < 42; x += 2) l.rect(x, 33 + yb + ((x >> 1) % 2), 2, 1, INK)
    },
    false
  )
  return r
}

// ---------------------------------------------------------------------------------------------
// 迷惑メール: an envelope with bat wings and a red "!" badge, flapping fast.

function wing(l: Raster, x0: number, y0: number, dir: number, f: number) {
  l.poly(
    [
      x0,
      y0 - 4,
      x0 + dir * 9,
      y0 - f * 0.8 - 5,
      x0 + dir * 19,
      y0 - f,
      x0 + dir * 17,
      y0 - f * 0.5 + 3,
      x0 + dir * 13,
      y0 - f * 0.3 + 6,
      x0 + dir * 8,
      y0 - f * 0.1 + 7,
      x0 + dir * 4,
      y0 + 6,
      x0,
      y0 + 5
    ],
    R.purple[1]
  )
  l.line(x0, y0, x0 + dir * 19, y0 - f, R.purple[3])
  l.line(x0, y0 + 1, x0 + dir * 13, y0 - f * 0.3 + 6, R.purple[3])
}

function spam(i: number) {
  const r = new Raster(64, 64)
  const f = [8, 3, -4, -8, -4, 3][i]
  const by = [0, 1, 2, 1, 0, -1][i]
  const cx = 32
  const cy = 36 + by
  part(r, (l) => {
    wing(l, cx - 11, cy - 1, -1, f)
    wing(l, cx + 11, cy - 1, 1, f)
  })
  part(r, (l) => {
    l.rect(cx - 12, cy - 8, 24, 17, R.paper[1])
    shadeEdges(l, R.paper, 2, true)
    // Flap.
    l.poly([cx - 12, cy - 8, cx + 12, cy - 8, cx, cy + 3], R.paper[0])
    l.line(cx - 12, cy - 8, cx, cy + 3, R.paper[3])
    l.line(cx + 12, cy - 8, cx, cy + 3, R.paper[3])
    // Fangs below the angry eyes.
    slitEye(l, cx - 9, cy - 7, 1, INK, R.red[0])
    slitEye(l, cx + 4, cy - 7, -1, INK, R.red[0])
    l.rect(cx - 5, cy + 5, 11, 3, INK)
    for (const x of [cx - 4, cx - 1, cx + 2, cx + 5]) l.rect(x, cy + 5, 1, 2, C.white)
  })
  // The red "!" badge.
  part(r, (l) => {
    ball(l, cx + 11, cy - 10, 5, 5, R.red)
    l.rect(cx + 11, cy - 13, 1, 4, C.white)
    l.rect(cx + 11, cy - 8, 1, 1, C.white)
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// パワハラ: a vein-popping manager screaming, fist raised, lunging forward with every shout.

function powerhara(i: number) {
  const r = new Raster(64, 64)
  const L = [-2, -3, 2, 4, 3, 0][i]
  const mouth = [0, 0, 3, 3, 3, 1][i]
  const waves = [0, 0, 1, 2, 3, 1][i]
  const shake = [0, -1, -3, 0, -2, -1][i]
  const hx = 33 + Math.round(L * 1.1)
  const hy = 15
  // Back arm, hand on hip.
  part(r, (l) => {
    l.thick(22 + L, 29, 18, 36, 5, R.navy[2])
    l.thick(18, 36, 23, 41, 5, R.navy[2])
    ball(l, 24, 41, 2.5, 2.5, R.skin, false)
  })
  for (const [x, k] of [
    [24, 0],
    [34, 1]
  ])
    part(r, (l) => {
      const fwd = L > 1 && k ? 2 : 0
      l.rect(x + fwd, 45, 6, 10, R.navy[k ? 1 : 2])
      l.rect(x - 1 + fwd, 54, 9, 3, R.brown[3])
      l.rect(x - 1 + fwd, 54, 9, 1, R.brown[2])
    })
  part(r, (l) => {
    l.poly([21 + L, 26, 44 + L, 26, 43, 49, 23, 49], R.navy[1])
    shadeEdges(l, R.navy, 2, true)
    l.poly([29 + L, 26, 37 + L, 26, 33 + L, 38], R.paper[1])
    l.poly([32 + L, 28, 35 + L, 28, 36 + L, 42, 33 + L, 45, 31 + L, 42], R.red[1])
    l.rect(33 + L, 28, 2, 3, R.red[2])
  })
  // Raised, shaking fist.
  part(r, (l) => {
    l.thick(42 + L, 29, 49 + L, 26, 6, R.navy[1])
    l.thick(49 + L, 26, 51 + L, 17 + shake, 5, R.navy[1])
    l.rect(49 + L, 17 + shake, 4, 2, C.white)
    ball(l, 51 + L, 13 + shake, 3.8, 3.8, R.skin)
    l.rect(49 + L, 14 + shake, 4, 1, R.skin[2])
  })
  part(r, (l) => {
    ball(l, hx, hy, 10, 9.5, R.skin)
    // Receding hair at the back, ear.
    l.ellipse(hx - 8, hy - 2, 3, 5.5, R.hair[1])
    l.rect(hx - 6, hy - 9, 5, 2, R.hair[1])
    l.rect(hx - 9, hy + 2, 2, 3, R.skin[2])
    // Popping vein.
    for (const [vx, vy] of [
      [0, 0],
      [2, 0],
      [1, 1],
      [0, 2],
      [2, 2]
    ])
      l.set(hx + 2 + vx, hy - 8 + vy, R.red[1])
    angryEye(l, hx - 5, hy - 4, 1, 5, 4)
    angryEye(l, hx + 3, hy - 4, -1, 5, 4)
    l.rect(hx + 1, hy + 1, 2, 1, R.skin[2])
    // Wide-open yelling mouth with teeth and tongue.
    l.rect(hx - 3, hy + 3, 10, 3 + mouth, INK)
    l.rect(hx - 2, hy + 3, 8, 1, C.white)
    l.rect(hx - 1, hy + 5 + mouth, 5, 1, R.red[1])
  })
  // Shout waves.
  part(
    r,
    (l) => {
      for (let k = 0; k < waves; k++) {
        const wx = 56 + k * 3
        for (let a = -50; a <= 50; a += 14) {
          const rad = (a * Math.PI) / 180
          l.set(wx + Math.cos(rad) * (1.5 + k), hy + 8 + Math.sin(rad) * (3 + k * 2), k ? R.orange[1] : R.red[0])
        }
      }
    },
    false
  )
  return r
}

// ---------------------------------------------------------------------------------------------
// 満員電車: the side of a packed commuter car, squashed faces at every window, an angry cab; rumbling.

function squashed(l: Raster, wx: number, wy: number, k: number, i: number) {
  const j = (i + k) % 2
  l.rect(wx, wy, 11, 13, R.navy[3])
  l.ellipse(wx + 2.5, wy + 4 + j, 2.5, 2.5, R.skin[2])
  l.ellipse(wx + 6, wy + 7 - j, 5, 5, R.skin[1])
  l.rect(wx + 3, wy + 6 - j, 2, 1, INK)
  l.rect(wx + 7, wy + 6 - j, 2, 1, INK)
  l.rect(wx + 4, wy + 10 - j, 4, 1, INK)
  l.rect(wx + 5, wy + 9 - j, 2, 1, R.skin[3])
  ball(l, wx + 9, wy + 11, 2, 2, R.skin, false)
  l.rect(wx, wy + 12, 11, 1, R.navy[2])
}

function train(i: number) {
  const r = new Raster(64, 64)
  const b = [0, 1, 0, 1, 0, 1][i]
  const sx = [0, 1, 0, -1, 0, 1][i]
  part(
    r,
    (l) => {
      for (const [y, w] of [
        [18, 6],
        [26, 4],
        [33, 7],
        [41, 5],
        [49, 6]
      ])
        l.rect(((i * 3 + y) % 5) - 1, y, w, 1, R.paper[2])
    },
    false
  )
  for (const x of [15, 31, 48])
    part(r, (l) => {
      ball(l, x + sx, 52, 5, 5, [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]], false)
      l.ellipse(x + sx, 52, 2, 2, R.metal[1])
    })
  part(r, (l) => {
    // Pantograph.
    l.line(22, 12 + b, 28, 8 + b, R.metal[3])
    l.line(28, 8 + b, 34, 12 + b, R.metal[3])
    l.rect(24, 7 + b, 8, 1, R.metal[3])
    l.poly([6, 14 + b, 49, 14 + b, 61, 25 + b, 61, 48 + b, 6, 48 + b], R.metal[1])
    shadeEdges(l, R.metal, 2, true)
    l.rect(6, 14 + b, 43, 2, R.metal[0])
    l.rect(6, 46 + b, 55, 2, R.metal[3])
    l.rect(6, 41 + b, 43, 3, R.orange[1])
    l.rect(6, 43 + b, 43, 1, R.orange[2])
    squashed(l, 8, 19 + b, 0, i)
    squashed(l, 22, 19 + b, 1, i)
    squashed(l, 36, 19 + b, 2, i)
    for (const x of [20, 34, 48]) l.rect(x, 17 + b, 1, 24, R.metal[2])
    // Cab: dark windshield with huge furious eyes, headlight and a toothy grille.
    l.rect(50, 19 + b, 10, 11, R.navy[3])
    slitEye(l, 51, 21 + b, 1, R.yellow[0])
    slitEye(l, 55, 21 + b, -1, R.yellow[0])
    l.rect(57, 33 + b, 4, 3, R.yellow[0])
    teeth(l, 50, 37 + b, 10, 6)
    l.rect(50, 40 + b, 10, 1, R.metal[3])
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 税金: a manila tax notice with a red 税 seal on its flap, grinning, bulging until it bursts into coins.

const ZEI = ['.K...K.K.', 'KKKK.KKKK', '.KK..K..K', 'KKKK.KKKK', '.KK..K.K.', 'K..K.K..K', 'K..K.K..K']

function tax(i: number) {
  const r = new Raster(64, 64)
  const b = [0, 2, 4, 2, 0, -1][i]
  const w = 30 + b * 2
  const h = 26 + b
  const x0 = 32 - w / 2
  const y0 = 49 - h
  const step = i % 2
  for (const [x, k] of [
    [25, 0],
    [36, 1]
  ])
    part(r, (l) => {
      const lift = step === k ? 2 : 0
      l.rect(x, 46, 3, 9 - lift, R.brown[2])
      l.rect(x - 1, 54 - lift, 6, 3, R.brown[3])
    })
  part(r, (l) => {
    l.rect(x0, y0, w, h, R.yellow[1])
    shadeEdges(l, R.yellow, 2, true)
    const tip = y0 + Math.round(h * 0.48)
    l.poly([x0 + 1, y0 + 1, x0 + w - 2, y0 + 1, 32, tip], R.yellow[0])
    l.line(x0 + 1, y0 + 1, 32, tip, R.yellow[3])
    l.line(x0 + w - 2, y0 + 1, 32, tip, R.yellow[3])
    slitEye(l, 32 - 11, y0 + 3, 1, INK, R.red[1])
    slitEye(l, 32 + 6, y0 + 3, -1, INK, R.red[1])
    // Grin; coins glint inside when it bulges.
    const mw = 16 + b
    l.rect(32 - mw / 2, y0 + h - 8, mw, 4, INK)
    for (let x = 32 - mw / 2 + 1; x < 32 + mw / 2 - 1; x += 2) l.rect(x, y0 + h - 8, 1, 1, C.white)
    if (b >= 2) for (let x = 32 - mw / 2 + 2; x < 32 + mw / 2 - 2; x += 4) l.rect(x, y0 + h - 6, 2, 2, R.yellow[1])
    // Paper lines.
    l.rect(x0 + 3, y0 + h - 3, 6, 1, R.yellow[2])
    l.rect(x0 + w - 9, y0 + h - 3, 6, 1, R.yellow[2])
  })
  part(r, (l) => {
    const tip = y0 + Math.round(h * 0.48)
    ball(l, 32, tip + 1, 6.5, 6.5, R.red)
    l.stamp(ZEI, 28, tip - 2, { K: C.white })
  })
  return r
}

// ---------------------------------------------------------------------------------------------
// 小銭: a small ¥ coin with a smirk, spinning as it rolls (width squashes through the turn).

const YEN = ['K.....K', '.K...K.', '..K.K..', 'KKKKKKK', '...K...', 'KKKKKKK', '...K...']

function coinFace(side: 'smirk' | 'yen') {
  const c = new Raster(22, 22)
  c.ellipse(11, 11, 10.5, 10.5, R.yellow[2])
  ball(c, 10.5, 10.5, 9, 9, R.yellow, false)
  c.ellipse(11, 11, 7, 7, R.yellow[1])
  c.ellipse(9.5, 9.5, 5, 5, R.yellow[1])
  for (let a = 0; a < 7; a++) c.set(3 + a * 0.4 + (a > 3 ? 0 : 0), 7 - a * 0.9, R.yellow[0])
  if (side === 'yen') {
    c.stamp(YEN, 8, 7, { K: R.yellow[3] })
    c.stamp(YEN, 7, 6, { K: R.yellow[0] })
    c.stamp(YEN, 8, 7, { K: R.yellow[3] })
  } else {
    // Half-lidded eyes and a lopsided smirk.
    c.rect(5, 7, 4, 1, INK)
    c.rect(13, 7, 4, 1, INK)
    c.rect(6, 8, 2, 2, INK)
    c.rect(14, 8, 2, 2, INK)
    c.rect(6, 8, 1, 1, C.white)
    c.rect(14, 8, 1, 1, C.white)
    c.rect(7, 14, 6, 1, INK)
    c.rect(13, 13, 2, 1, INK)
    c.rect(15, 12, 1, 1, INK)
    c.rect(12, 15, 2, 1, R.yellow[3])
  }
  return c
}

function coin(i: number) {
  const r = new Raster(64, 64)
  const spec = [
    ['smirk', 1],
    ['smirk', 0.66],
    ['yen', 0.66],
    ['yen', 1],
    ['yen', 0.66],
    ['smirk', 0.66]
  ] as const
  const [side, k] = spec[i]
  const face = coinFace(side)
  const hop = [0, 1, 3, 2, 1, 0][i]
  const w = Math.round(22 * k)
  const sq = new Raster(22, 22)
  for (let x = 0; x < w; x++) {
    const sxp = Math.min(21, Math.floor(((x + 0.5) / w) * 22))
    for (let y = 0; y < 22; y++) sq.set(x + Math.floor((22 - w) / 2), y, face.get(sxp, y))
  }
  part(r, (l) => l.blit(sq, 21, 35 - hop))
  return r
}

// ---------------------------------------------------------------------------------------------
// 夜泣き: a swaddled baby wailing under a crescent moon, tears flying, head thrown back.

function nightcry(i: number) {
  const r = new Raster(64, 64)
  const wail = [0, 1, 2, 2, 1, 0][i]
  const dx = [0, 1, -1, 1, -1, 0][i]
  const hy = 27 - (wail > 0 ? 1 : 0)
  const cx = 32 + dx
  // Crescent moon.
  part(r, (l) => {
    const my = 12 + Math.round(Math.sin((i / 6) * Math.PI * 2) * 1.5)
    l.ellipse(49, my, 7, 7, R.yellow[1])
    l.ellipse(52, my - 1, 6, 6, 0)
    l.set(44, my - 3, R.yellow[0])
    l.set(44, my - 2, R.yellow[0])
    l.set(45, my - 5, R.yellow[0])
  })
  // Blanket bundle with stripes and a tucked knot.
  part(r, (l) => {
    ball(l, cx, 46, 15, 11, R.mint)
    l.rect(cx - 14, 52, 29, 2, R.mint[2])
    for (const y of [43, 48]) l.line(cx - 12, y, cx + 12, y + 1, R.mint[0])
    l.rect(cx - 9, 40, 6, 2, R.mint[0])
    l.poly([cx - 14, 52, cx - 9, 56, cx + 8, 56, cx + 14, 52], R.mint[2])
  })
  part(r, (l) => {
    ball(l, cx, hy, 10.5, 9.5, R.skin)
    // Hair curl and ear.
    l.rect(cx - 1, hy - 11, 2, 3, R.hair[1])
    l.set(cx + 1, hy - 12, R.hair[1])
    l.set(cx - 2, hy - 10, R.hair[1])
    l.rect(cx - 10, hy, 2, 4, R.skin[2])
    // Rosy cheeks, scrunched wet eyes, a huge wailing mouth.
    l.rect(cx - 7, hy + 2, 3, 2, R.pink[1])
    l.rect(cx + 4, hy + 2, 3, 2, R.pink[1])
    for (const [ex, dir] of [
      [cx - 6, 1],
      [cx + 3, -1]
    ] as const) {
      l.line(ex, hy - 4, ex + 3 * dir, hy - 2, INK)
      l.line(ex, hy, ex + 3 * dir, hy - 2, INK)
    }
    l.thick(cx - 7, hy - 7, cx - 3, hy - 6, 1, R.hair[1])
    const mh = 4 + wail * 2
    l.rect(cx - 4, hy + 2, 9, mh, INK)
    l.rect(cx - 3, hy + 2, 7, 1, C.white)
    l.rect(cx - 2, hy + 1 + mh, 5, 2, R.red[1])
    l.rect(cx - 1, hy + 1 + mh, 3, 1, R.red[2])
  })
  // Tears streaming and flying out.
  part(
    r,
    (l) => {
      const f = i % 3
      for (const s of [-1, 1]) {
        l.rect(cx + s * 7 - (s > 0 ? 0 : 1), hy - 1 + f, 1, 4, R.mint[0])
        l.rect(cx + s * (12 + f * 2), hy - 6 + f * 2, 2, 2, R.mint[0])
        l.set(cx + s * (15 + f), hy - 3 + f * 3, R.sky[0])
      }
    },
    false
  )
  return r
}

// ---------------------------------------------------------------------------------------------
// 腰痛: a hunched red mass of pain: lightning cracks across the hump, a cold patch, a fist on the lower back.

function bolt(l: Raster, x: number, y: number, s: number, c: number) {
  const p = [0, 0, 9, 0, 5, 8, 12, 8, 2, 22, 5, 11, -2, 11]
  l.poly(
    p.map((v, k) => (k % 2 ? y + v * s : x + v * s)),
    c
  )
}

function backpain(i: number) {
  const r = new Raster(64, 64)
  const yb = [1, 0, -1, 0, 1, 0][i]
  const liftL = [0, 2, 3, 1, 0, 0][i]
  const liftR = [0, 0, 0, 1, 2, 3][i]
  const hot = i % 2
  for (const [x, lift] of [
    [22, liftL],
    [37, liftR]
  ] as const)
    part(r, (l) => {
      l.thick(x, 46, x + 1, 53 - lift, 8, R.red[2])
      l.rect(x - 5, 53 - lift, 12, 4, R.brown[3])
      l.rect(x - 5, 53 - lift, 12, 1, R.brown[2])
    })
  // Hand pressed on the lower back.
  part(r, (l) => {
    l.thick(14, 34 + yb, 9, 41 + yb, 5, R.red[2])
    ball(l, 9, 43 + yb, 3.5, 3.5, R.skin)
  })
  part(r, (l) => {
    ball(l, 29, 33 + yb, 22, 19, R.red)
    ball(l, 47, 40 + yb, 9, 8, R.orange)
    // Cold patch (a perforated mint poultice).
    l.rect(15, 22 + yb, 12, 10, R.mint[1])
    l.rect(15, 22 + yb, 12, 1, R.mint[0])
    l.rect(15, 31 + yb, 12, 1, R.mint[2])
    for (const [px, py] of [
      [18, 25],
      [22, 25],
      [20, 28],
      [24, 28]
    ])
      l.set(px, py + yb, R.mint[2])
    // Pained face: squeezed eyes, gritted teeth.
    l.line(41, 36 + yb, 44, 38 + yb, INK)
    l.line(41, 40 + yb, 44, 38 + yb, INK)
    l.line(53, 36 + yb, 50, 38 + yb, INK)
    l.line(53, 40 + yb, 50, 38 + yb, INK)
    l.thick(40, 33 + yb, 45, 35 + yb, 1, INK)
    l.thick(54, 33 + yb, 49, 35 + yb, 1, INK)
    teeth(l, 43, 43 + yb, 9, 4)
  })
  // The ズキッ bolts.
  part(r, (l) => {
    bolt(l, 29, 14 + yb, hot ? 1.3 : 1.1, hot ? R.yellow[0] : R.yellow[1])
    bolt(l, 12, 36 + yb, 0.6, hot ? R.yellow[1] : R.yellow[0])
    if (hot) bolt(l, 44, 18 + yb, 0.55, R.yellow[0])
  })
  if (i % 3 === 0)
    part(
      r,
      (l) => {
        l.rect(56, 30 + yb, 2, 3, R.sky[0])
        l.set(57, 29 + yb, R.sky[0])
      },
      false
    )
  return r
}

// ---------------------------------------------------------------------------------------------
// 詐欺電話: a black rotary phone with a dial-face and sly grin, a gold ¥ tucked at its base; ringing, then blinking away.

function scam(i: number) {
  const r = new Raster(64, 64)
  const hop = [0, -2, 0, -2, 0, -1][i]
  part(r, (l) => {
    l.poly([11, 55, 15, 31, 49, 31, 53, 55], BLACK[1])
    shadeEdges(l, BLACK, 2, true)
    l.rect(11, 53, 42, 2, BLACK[3])
    // Dial plate with finger holes and the grinning hub.
    ball(l, 32, 43, 11, 11, R.metal, false)
    l.ellipse(32, 43, 10, 10, R.metal[1])
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.4
      l.rect(32 + Math.cos(a) * 8.4 - 0.5, 43 + Math.sin(a) * 8.4 - 0.5, 2, 2, BLACK[3])
    }
    l.ellipse(32, 43, 6, 6, R.paper[1])
    // Sly slit eyes and a gold-toothed grin.
    l.rect(27, 40, 3, 1, INK)
    l.rect(34, 40, 3, 1, INK)
    l.rect(29, 41, 1, 1, R.red[1])
    l.rect(34, 41, 1, 1, R.red[1])
    l.rect(27, 39, 2, 1, INK)
    l.rect(35, 39, 2, 1, INK)
    l.rect(28, 45, 9, 1, INK)
    l.rect(27, 44, 1, 1, INK)
    l.rect(37, 44, 1, 1, INK)
    l.rect(29, 46, 7, 1, C.white)
    l.rect(32, 46, 2, 1, R.yellow[1])
    // Hidden ¥ coin.
    l.ellipse(19, 50, 3.5, 3.5, R.yellow[1])
    l.stamp(['K.K', '.K.', 'KKK'], 18, 48, { K: R.yellow[3] })
    l.stamp(['K.K', '.K.', 'KKK'], 18, 48, { K: R.yellow[3] })
  })
  // Handset on top, hopping as it rings.
  part(r, (l) => {
    l.thick(15, 26 + hop, 49, 26 + hop, 5, BLACK[1])
    l.rect(15, 23 + hop, 34, 1, BLACK[0])
    for (const x of [13, 51]) {
      ball(l, x, 28 + hop, 5, 6, BLACK, true)
    }
    l.rect(12, 30 + hop, 3, 2, BLACK[2])
  })
  if (i % 2 === 0)
    part(
      r,
      (l) => {
        for (const s of [-1, 1]) {
          l.line(32 + s * 24, 19, 32 + s * 27, 16, R.yellow[0])
          l.line(32 + s * 26, 24, 32 + s * 30, 23, R.yellow[0])
        }
      },
      false
    )
  // Blink: dither away and back.
  const fade = [0, 0, 0, 5, 11, 5][i]
  if (fade) dither(r, fade)
  return r
}

// ---------------------------------------------------------------------------------------------
// 物忘れ: a foggy cloud with a confused face, keys and glasses lost inside, a "?" drifting above.

const QMARK = ['.KKKKK.', 'KK...KK', '.....KK', '....KK.', '...KK..', '...K...', '.......', '...K...']

function forget(i: number) {
  const r = new Raster(64, 64)
  const bob = [0, -1, -2, -1, 0, 1][i]
  const dr = [0, 1, 2, 1, 0, -1][i]
  part(r, (l) => {
    for (const [x, y, rx, ry] of [
      [21, 36, 9, 8],
      [32, 30, 11, 10],
      [44, 35, 9, 8],
      [32, 41, 15, 8],
      [18, 43, 7, 6],
      [47, 43, 7, 6]
    ])
      l.ellipse(x, y + bob, rx, ry, FOG[1])
    shadeEdges(l, FOG, 2, true)
  })
  // Face: one wide eye, one narrowed, a wobbly mouth.
  part(
    r,
    (l) => {
      l.ellipse(26, 33 + bob, 3.4, 3.4, C.white)
      l.ellipse(27 + dr * 0.5, 33 + bob, 1.4, 1.4, INK)
      l.ellipse(37, 34 + bob, 2.6, 2.6, C.white)
      l.set(36 - dr * 0.5, 34 + bob, INK)
      l.set(37 - dr * 0.5, 34 + bob, INK)
      l.line(22, 30 + bob, 28, 28 + bob, INK)
      l.line(35, 30 + bob, 40, 32 + bob, INK)
      for (let x = 28; x < 37; x++) l.set(x, 40 + bob + (x % 2), INK)
      // Lost keys and glasses.
      l.ellipse(21, 45 + bob, 3, 3, R.yellow[1])
      l.ellipse(21, 45 + bob, 1.2, 1.2, FOG[2])
      l.line(24, 46 + bob, 31, 46 + bob, R.yellow[1])
      l.rect(28, 47 + bob, 1, 2, R.yellow[1])
      l.rect(30, 47 + bob, 1, 2, R.yellow[1])
      for (const gx of [38, 45]) {
        l.ellipse(gx, 46 + bob, 3, 3, R.metal[2])
        l.ellipse(gx, 46 + bob, 1.8, 1.8, R.sky[0])
      }
      l.line(41, 46 + bob, 42, 46 + bob, R.metal[2])
    },
    false
  )
  part(
    r,
    (l) => {
      l.stamp(QMARK, 47, 6 - bob, { K: R.purple[1] })
      l.stamp(QMARK, 48, 7 - bob, { K: R.purple[3] })
      l.stamp(QMARK, 47, 6 - bob, { K: R.purple[1] })
      l.rect(14 + dr, 52 + bob, 3, 1, FOG[2])
      l.rect(40 - dr, 54 + bob, 4, 1, FOG[2])
      l.rect(28 + dr, 55 + bob, 2, 1, FOG[2])
    },
    false
  )
  dither(r, [0, 0, 0, 5, 11, 5][i])
  return r
}

// ---------------------------------------------------------------------------------------------
// 孤独: a pale hollow-eyed shadow, head bowed, hem trailing; flat colours with sparse dithering (renderer adds alpha).

function loneliness(i: number, t: number) {
  const r = new Raster(64, 64)
  const sway = Math.round(Math.sin(t) * 1.5)
  const br = [0, 0, 1, 1, 0, 0][i]
  const cx = 31 + sway
  const hx = cx + 2
  const hy = 17 + br
  // Limp hair behind.
  r.rect(hx - 9, hy - 3, 3, 17, FOG[2])
  r.rect(hx + 7, hy - 3, 3, 14, FOG[3])
  // Robe: widening to a ragged, rippling hem.
  r.poly([cx - 9, 24, cx + 9, 24, cx + 19, 50, cx - 19, 50], FOG[2])
  for (let x = cx - 19; x <= cx + 19; x++) {
    const edge = 1 - Math.abs(x - cx) / 21
    const bottom = 52 + Math.round(Math.sin(x * 0.55 + t * 2) * 2) + (x % 6 === 0 ? 2 : 0) - Math.round((1 - edge) * 2)
    r.rect(x, 50, 1, bottom - 50, FOG[2])
  }
  // Shading: lit left, dark right and long vertical folds.
  r.map((c, x, y) => {
    if (c !== FOG[2]) return c
    if (x > cx + 7 + (y - 24) * 0.45) return FOG[3]
    if (x < cx - 8 - (y - 24) * 0.35) return FOG[1]
    if ((x - cx + y * 0) % 9 === 0 && y > 30) return FOG[3]
    return c
  })
  // Limp arms.
  for (const s of [-1, 1]) {
    r.thick(cx + s * 8, 26, cx + s * 11 + sway, 42, 4, s < 0 ? FOG[1] : FOG[3])
    r.ellipse(cx + s * 11 + sway, 44, 2.2, 2.8, FOG[1])
  }
  // Bowed head with hollow eyes.
  r.ellipse(hx, hy, 8.5, 9.5, FOG[1])
  r.ellipse(hx + 2, hy + 1, 6, 8, FOG[2])
  r.ellipse(hx - 1.5, hy - 1.5, 6.5, 7.5, FOG[1])
  r.ellipse(hx - 3, hy, 1.8, 3, INK)
  r.ellipse(hx + 3.5, hy, 1.8, 3, INK)
  r.rect(hx - 2, hy + 6, 5, 1, FOG[3])
  r.set(hx + 5, hy + 3 + (i % 3), R.sky[0])
  r.set(hx + 5, hy + 4 + (i % 3), R.sky[0])
  // Sparse dithering: the body thins away toward the hem.
  dither(r, (_x, y) => (y > 34 ? Math.min(11, (y - 34) * 0.7) : 0))
  return r
}

export const roster3Sheets: Record<string, () => Sheet> = {
  'enemy:deadline': () => cycle(6, (i) => deadline(i), 14),
  'enemy:meeting': () => cycle(6, (i) => meeting(i), 6),
  'enemy:spam': () => cycle(6, (i) => spam(i), 14),
  'enemy:powerhara': () => cycle(6, (i) => powerhara(i), 8),
  'enemy:train': () => cycle(6, (i) => train(i), 14),
  'enemy:tax': () => cycle(6, (i) => tax(i), 8),
  'enemy:coin': () => cycle(6, (i) => coin(i), 12),
  'enemy:nightcry': () => cycle(6, (i) => nightcry(i), 8),
  'enemy:backpain': () => cycle(6, (i) => backpain(i), 6),
  'enemy:scam': () => cycle(6, (i) => scam(i), 8),
  'enemy:forget': () => cycle(6, (i) => forget(i), 7),
  'enemy:loneliness': () => cycle(6, loneliness, 6)
}
/** Enemy ids (without `enemy:`) whose sprites carry lettering and must never mirror. */
export const ROSTER3_NO_FLIP: string[] = ['tax', 'coin', 'scam', 'forget']
