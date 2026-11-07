import { C, R } from './palette'
import { Raster, ball, part, rng, shadeEdges, type Ramp } from './raster'
import type { Anim, Sheet } from './sheet'
import { observationIcon, observationSheet } from './observation'

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

type PetMode = 'run' | 'closed' | 'open'

/** Paints a line only where the layer already has pixels (stripes, bars). */
function paintLine(l: Raster, x0: number, y0: number, x1: number, y1: number, c: number) {
  const m = new Raster(N, N)
  m.line(x0, y0, x1, y1, 1)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m.get(x, y)) l.paint(x, y, c)
}

/** Grey tabby: a bounding gallop in which the spine stretches and compresses. */
function cat(f: number, mode: PetMode) {
  const r = new Raster(N, N)
  const run = mode === 'run'
  const open = mode === 'open'
  const M = R.metal
  const foot = 27
  const bob = run ? [-1, 0, 0, -1][f] : 0
  const sx = run ? [1.5, 0.5, -1.5, 0.5][f] : 0
  const pose = (k: number) => ({
    fx: run ? [4, 2, -1, 2][k] : open ? 2 : 1,
    rx: run ? [-4, -1, 2, -2][k] : -1,
    fl: run ? [2, 0, 0, 1][k] : 0,
    rl: run ? [1, 1, 0, 0][k] : 0
  })
  const near = pose(f)
  const farP = pose((f + 2) % 4)
  const sw = run ? [-1, 0, 1, 0][f] : 0
  const hip = 9 - Math.round(sx)
  const sh = 20
  const hy = 14 + bob + (open ? 1 : 0)
  const leg = (l: Raster, x: number, dx: number, lift: number, col: number) => {
    l.thick(x, 21 + bob, x + dx, foot - lift - 1, col === M[1] ? 3.2 : 2.8, col)
    l.ellipse(x + dx + 0.5, foot - lift - 0.5, 2.2, 1.3, R.paper[1])
  }
  // Far legs.
  part(r, (l) => {
    leg(l, hip + 1, farP.rx, farP.rl, M[2])
    leg(l, sh + 1, farP.fx, farP.fl, M[2])
  })
  // Tail: a long curve that sways, ringed with stripes.
  part(r, (l) => {
    l.thick(hip - 2, 18 + bob, 3 + sw, 14 + bob, 2.4, M[1])
    l.thick(3 + sw, 14 + bob, 5 + sw * 2, 8 + bob, 2.2, M[1])
    l.thick(5 + sw * 2, 8 + bob, 6 + sw * 2, 6 + bob, 1.6, M[1])
    for (const y of [7, 10, 13]) paintLine(l, 0, y + bob, 12, y + bob, M[2])
  })
  // Body.
  part(r, (l) => {
    ball(l, 14, 18 + bob, 8.5 + sx, 5.6, M)
    l.ellipse(15, 22 + bob, 5 + sx * 0.4, 1.4, M[0])
    l.ellipse(20, 20 + bob, 3, 3, R.paper[1])
    for (const x of [8, 11, 14, 17]) paintLine(l, x, 11 + bob, x + 1, 16 + bob, M[2])
    paintLine(l, 7, 13 + bob, 18, 12 + bob, M[2])
  })
  // Near legs.
  part(r, (l) => {
    leg(l, hip + 2, near.rx, near.rl, M[1])
    leg(l, sh + 2, near.fx, near.fl, M[1])
    if (open) {
      l.thick(sh + 3, 21 + bob, 27, 24 + bob, 3, M[1])
      l.ellipse(27.5, 24.5 + bob, 2.2, 1.5, R.paper[1])
    }
  })
  if (open)
    for (const [x0, y0, x1, y1] of [
      [30, 20, 31, 22],
      [30, 23, 31, 25],
      [29, 26, 31, 27]
    ])
      r.line(x0, y0 + bob, x1, y1 + bob, C.white)
  // Head with pointed ears.
  part(r, (l) => {
    l.poly([19.5, hy - 4, 20.5, hy - 10, 24, hy - 6], M[2])
    l.poly([24, hy - 6, 28, hy - 11, 28.8, hy - 3], M[1])
    l.poly([25.2, hy - 6, 27.4, hy - 9, 27.8, hy - 4.5], R.pink[1])
    ball(l, 24, hy, 5.6, 5, M)
    paintLine(l, 22, hy - 4, 22, hy - 3, M[3])
    paintLine(l, 24, hy - 5, 24, hy - 3, M[3])
    l.ellipse(27.5, hy + 2, 2.6, 2.1, R.paper[1])
  })
  if (open) {
    r.set(27, hy + 4, R.red[3])
    r.set(28, hy + 4, C.white)
    r.set(27, hy + 5, R.red[3])
    r.set(28, hy + 5, R.red[3])
  }
  // Almond eye with iris and pupil.
  r.set(25, hy - 2, C.inkCool)
  r.set(26, hy - 2, C.inkCool)
  r.set(27, hy - 1, C.inkCool)
  r.set(25, hy - 1, R.yellow[1])
  r.set(26, hy - 1, R.green[1])
  r.set(25, hy, R.yellow[2])
  r.set(26, hy, C.inkCool)
  r.set(29, hy + 1, R.pink[2])
  r.set(29, hy + 2, R.pink[2])
  // Whiskers.
  r.set(30, hy + 2, C.white)
  r.set(31, hy + 1, C.white)
  r.set(30, hy + 3, C.white)
  r.set(31, hy + 4, C.white)
  return r
}

/** White rabbit: crouch, push-off stretch, airborne, land. */
function rabbit(f: number, mode: PetMode) {
  const r = new Raster(N, N)
  const run = mode === 'run'
  const open = mode === 'open'
  const P = R.paper
  const dy = run ? [1, -1, -4, 0][f] : 0
  const hd = run ? [0, -1, 0, 1][f] : open ? 1 : 0
  const sx = run ? [0, 2.5, 1.5, -1.5][f] : 0
  const ry = run ? [6.5, 5.6, 5.8, 6.8][f] : 6.5
  const ear = run
    ? [
        [-1, -8],
        [-5, -6],
        [-8, -4],
        [-4, -7]
      ][f]
    : open
      ? [-3, -7]
      : [-1, -8]
  const hx = 23
  const hy = 15 + dy + hd
  // Ankle and toe of the hind foot (long, flat, white).
  const ankle = run
    ? [
        [7, 25],
        [5, 24],
        [9, 24],
        [5, 23]
      ][f]
    : [7, 25]
  const toe = run
    ? [
        [15, 26.5],
        [1, 26.5],
        [15, 25],
        [9, 26.5]
      ][f]
    : [15, 26.5]
  const paw = run
    ? [
        [22, 27],
        [24, 24],
        [25, 23],
        [24, 27]
      ][f]
    : [23, 27]
  const earPart = (l: Raster, bx: number, by: number, col: number, pink: number) => {
    const tx = bx + ear[0]
    const ty = by + ear[1]
    const mx = bx + ear[0] * 0.55
    const my = by + ear[1] * 0.55
    l.thick(bx, by, mx, my, 3.2, col)
    l.thick(mx, my, tx, ty, 2.2, col)
    l.thick(bx + ear[0] * 0.15, by + ear[1] * 0.15, bx + ear[0] * 0.85, by + ear[1] * 0.85, 1, pink)
  }
  // Far ear and far front leg (short).
  part(r, (l) => {
    earPart(l, hx + 1, hy - 4, P[2], R.pink[2])
    l.thick(21, 23 + dy, paw[0] + 1.5, paw[1] - 0.5, 2.2, P[2])
  })
  // Cotton tail.
  part(r, (l) => ball(l, 4.5, 18 + dy, 2.6, 2.6, P))
  // Body.
  part(r, (l) => ball(l, 13, 19 + dy, 8 + sx, ry, P))
  // Big round haunch with a long flat hind foot.
  part(r, (l) => {
    l.thick(ankle[0], ankle[1], toe[0], toe[1] - 0.5, 2.4, P[0])
    l.thick(10, 21 + dy, ankle[0], ankle[1], 3, P[1])
    ball(l, 10, 21 + dy, 5.2, 5.6, P)
  })
  // Near front leg.
  part(r, (l) => {
    l.thick(19.5, 23 + dy, paw[0], paw[1] - 0.5, 2.4, P[1])
    l.ellipse(paw[0] + 0.5, paw[1] - 0.5, 1.8, 1, P[1])
  })
  // Near ear, then the head.
  part(r, (l) => earPart(l, hx - 2, hy - 4, P[1], R.pink[1]))
  part(r, (l) => {
    ball(l, hx, hy, 5.6, 5, P)
    l.ellipse(26.5, hy + 2, 2.4, 1.8, P[0])
  })
  r.set(28, hy + 1, R.pink[1])
  r.set(28, hy + 2, R.pink[2])
  r.set(29, hy + 1, R.pink[2])
  r.rect(25, hy - 1, 2, 2, C.inkCool)
  r.set(25, hy - 1, C.white)
  r.set(26, hy, R.red[2])
  // Mouth with two buck teeth.
  if (open) {
    r.rect(25, hy + 3, 4, 2, R.red[3])
    r.rect(26, hy + 3, 1, 3, C.white)
    r.rect(28, hy + 3, 1, 3, C.white)
    r.set(26, hy + 6, P[3])
    r.set(28, hy + 6, P[3])
  } else {
    r.rect(25, hy + 3, 4, 1, P[3])
    r.rect(26, hy + 4, 3, 1, C.white)
    r.set(27, hy + 4, P[3])
  }
  return r
}

/** Budgerigar: low flight, 4-frame wing flap with a body bob; on bite it pecks. */
function parakeet(f: number, mode: PetMode) {
  const r = new Raster(N, N)
  const run = mode === 'run'
  const open = mode === 'open'
  const G = R.green
  const bob = run ? [1, 0, -1, 0][f] : 0
  const lx = open ? 2 : 0
  const ly = open ? 3 : 0
  const bx = 15 + (open ? 1 : 0)
  const by = 17 + bob + (open ? 1 : 0)
  const hx = 21 + lx
  const hy = 10 + bob + ly
  const tipY = run ? [0, 2, 4, 2][f] : 1
  // Feet: tucked in flight, planted when perched.
  if (!run) {
    part(r, (l) => {
      l.thick(bx - 2, by + 5, bx - 3 - (open ? 1 : 0), 26, 1.6, R.orange[2])
      l.thick(bx + 2, by + 5, bx + 1 - (open ? 1 : 0), 26, 1.6, R.orange[2])
      l.rect(bx - 5 - (open ? 1 : 0), 26, 3, 1, R.orange[2])
      l.rect(bx - 1 - (open ? 1 : 0), 26, 3, 1, R.orange[2])
    })
  }
  // Long tapered tail.
  part(r, (l) => {
    const ty = 22 + bob + tipY + (run ? 0 : 2)
    l.poly([bx - 5, by - 1, bx - 4, by + 3, 1, ty + 1, 0, ty - 1], R.mint[2])
    paintLine(l, bx - 6, by + 1, 3, ty, R.mint[1])
    for (let y = ty - 2; y <= ty + 2; y++) for (let x = 0; x <= 2; x++) l.paint(x, y, R.navy[1])
  })
  // Body.
  part(r, (l) => {
    ball(l, bx, by, 8.5, 5.6, G)
    l.ellipse(bx + 3, by + 3, 4, 1.8, G[0])
    for (const x of [bx - 4, bx - 1]) l.paint(x, by + 4, G[2])
  })
  if (run) {
    part(r, (l) => {
      l.ellipse(bx, by + 5, 1.8, 1.2, R.orange[2])
    })
  }
  // Wing: raised, level, lowered.
  part(r, (l) => {
    const tips: number[] = run
      ? [
          [10, 3],
          [3, 21],
          [9, 26],
          [3, 11]
        ][f]
      : [4, 16]
    const [tx, ty] = tips
    const ax = tx - bx
    const ay = ty - by
    const len = Math.hypot(ax, ay) || 1
    const nx = -ay / len
    const ny = ax / len
    l.poly(
      [
        bx + 3,
        by - 3,
        tx + nx * 3.5,
        ty + ny * 3.5,
        tx + (ax / len) * 2,
        ty + (ay / len) * 2,
        tx - nx * 3.5,
        ty - ny * 3.5,
        bx - 4,
        by - 1
      ],
      G[2]
    )
    l.thick(bx + 2, by - 3, tx + nx * 3, ty + ny * 3, 1, G[1])
    for (const t of [0.55, 0.8]) {
      const cx = bx + ax * t
      const cy = by + ay * t
      paintLine(
        l,
        cx - (ay / len) * 2.5,
        cy + (ax / len) * 2.5,
        cx + (ay / len) * 2.5,
        cy - (ax / len) * 2.5,
        C.inkGreen
      )
    }
  })
  // Head: yellow face, barred green nape.
  part(r, (l) => {
    ball(l, hx, hy, 5, 5, [R.yellow[0], R.yellow[1], R.yellow[2], R.yellow[2], R.yellow[3]])
    const to = new Map([
      [R.yellow[0], G[0]],
      [R.yellow[1], G[1]],
      [R.yellow[2], G[2]]
    ])
    for (let y = 0; y < N; y++)
      for (let x = 0; x < hx - 2; x++) {
        const c = to.get(l.get(x, y))
        if (c) l.set(x, y, c)
      }
    for (let y = hy - 4; y <= hy + 3; y += 3) {
      l.paint(hx - 5, y, C.inkGreen)
      l.paint(hx - 4, y, C.inkGreen)
      l.paint(hx - 3, y + 1, C.inkGreen)
      l.paint(hx - 2, y + 1, C.inkGreen)
    }
  })
  // Cere and hooked beak.
  part(r, (l) => {
    l.poly([hx + 3.5, hy - 2, hx + 6, hy - 1, hx + 5.5, hy + 1, hx + 3.5, hy + 1], R.sky[2])
    if (open) {
      l.poly([hx + 4, hy + 1, hx + 8, hy + 1.5, hx + 6.5, hy + 3, hx + 5, hy + 2.5], R.yellow[1])
      l.poly([hx + 4, hy + 3.5, hx + 7, hy + 4, hx + 5.5, hy + 5.5, hx + 3.5, hy + 5], R.yellow[1])
    } else l.poly([hx + 4, hy + 1, hx + 7.5, hy + 2, hx + 6.5, hy + 4, hx + 4, hy + 3.5], R.yellow[1])
  })
  r.set(hx + 1, hy - 1, C.inkCool)
  r.set(hx + 1, hy - 2, C.white)
  r.set(hx, hy - 1, C.white)
  r.set(hx, hy + 2, R.purple[1])
  r.set(hx + 1, hy + 2, R.purple[1])
  return r
}

/** Golden hamster: round head over a round body, puffed cream cheeks, scurrying pink feet. */
function hamster(f: number, mode: PetMode) {
  const r = new Raster(N, N)
  const run = mode === 'run'
  const open = mode === 'open'
  const HAM: Ramp = [R.yellow[1], R.yellow[2], R.orange[2], R.brown[2], R.brown[3]]
  const bob = run ? [0, -1, 0, -1][f] : open ? 1 : 0
  const px = run ? [3, 0, -3, 0] : [0, 0, 0, 0]
  const pl = run ? [0, 0, 0, 2] : [0, 0, 0, 0]
  const hy = 16 + bob
  const foot = (l: Raster, x: number, k: number, col: number) => {
    const lift = pl[k % 4]
    l.ellipse(x + px[k % 4] + 0.5, 25.5 - lift, 2.2, 1.6, col)
  }
  part(r, (l) => {
    foot(l, 22, f + 2, R.pink[2])
    foot(l, 8, f + 3, R.pink[2])
  })
  part(r, (l) => ball(l, 3.5, 19 + bob, 2, 2, HAM))
  part(r, (l) => {
    ball(l, 11.5, 18 + bob, 9.5, 7.5, HAM)
    ball(l, 12, 23 + bob, 6, 2.6, R.paper)
    paintLine(l, 4, 14 + bob, 15, 11 + bob, HAM[2])
  })
  part(r, (l) => {
    foot(l, 22, f, R.pink[1])
    foot(l, 8, f + 1, R.pink[1])
  })
  // Ears sit on top of the head.
  part(r, (l) => {
    ball(l, 19, hy - 5, 2.8, 2.8, HAM)
    ball(l, 25, hy - 5, 2.8, 2.8, HAM)
    l.ellipse(19.5, hy - 4.3, 1.2, 1.2, R.pink[1])
    l.ellipse(24.5, hy - 4.3, 1.2, 1.2, R.pink[1])
  })
  // Round head, pointed snout and cheek pouch bulging over the neck.
  part(r, (l) => {
    ball(l, 22, hy, 6.2, 5.6, HAM)
    l.poly([26, hy - 2, 31, hy + 2, 26, hy + 4], HAM[1])
    ball(l, 22.5, hy + 4.5, open ? 4.2 : 5, open ? 3.2 : 4, R.paper)
  })
  r.rect(25, hy - 2, 2, 2, C.inkCool)
  r.set(25, hy - 2, C.white)
  r.set(26, hy - 1, C.inkCool)
  r.set(30, hy + 2, R.pink[1])
  r.set(30, hy + 3, R.pink[2])
  // Front teeth.
  if (open) {
    r.rect(27, hy + 4, 3, 1, R.red[3])
    r.rect(28, hy + 4, 2, 2, C.white)
    r.set(29, hy + 4, R.paper[3])
  } else r.rect(28, hy + 4, 2, 1, C.white)
  return r
}

function smallPet(kind: 'cat' | 'rabbit' | 'parakeet' | 'hamster', frame: number, mode: PetMode) {
  return { cat, rabbit, parakeet, hamster }[kind](frame, mode)
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

type OutdoorVehicle = 'tricycle' | 'bicycle' | 'motorcycle' | 'car' | 'plane'

const dim = (ramp: Ramp): Ramp => [ramp[1], ramp[2], ramp[3], ramp[3], ramp[4]]

/**
 * One vehicle wheel standing on y = 28: a dark tyre, a metal rim and `rays` spokes that turn a quarter of
 * their symmetry per frame (so the 4-frame loop closes without flicker).
 */
function vehicleWheel(
  r: Raster,
  cx: number,
  rad: number,
  f: number,
  opts: { rays: number; tyre?: number; dish?: boolean; far?: boolean }
) {
  const { rays, tyre = 2, dish = true, far = false } = opts
  const cy = 28 - rad
  const e = rad + 0.4
  const tyreRamp: Ramp = far ? dim(dim(R.hair)) : [R.hair[2], R.hair[2], R.hair[3], R.hair[3], R.hair[4]]
  const metal = far ? dim(R.metal) : R.metal
  const a0 = (f * Math.PI * 2) / (rays * 4)
  const ri = rad - tyre + 0.4
  // A thin tyre and rim ring; open wheels show the ground between the spokes, capped ones are solid metal.
  const t = new Raster(N, N)
  const tyreTones = far ? [R.hair[3], R.hair[3], R.hair[3]] : [R.hair[2], R.hair[3], R.hair[3]]
  const rimTones = far ? [metal[1], metal[2], metal[2]] : [metal[0], metal[1], metal[1]]
  part(t, (l) => {
    for (let y = Math.floor(cy - e); y <= Math.ceil(cy + e); y++)
      for (let x = Math.floor(cx - e); x <= Math.ceil(cx + e); x++) {
        const d = Math.hypot(x - cx, y - cy)
        if (d > e) continue
        const lit = d ? (-(x - cx) * 0.6 - (y - cy) * 0.8) / d : 0
        const tones = d > e - tyre ? tyreTones : d > ri - 1 || !dish ? rimTones : [metal[1], metal[2], metal[2]]
        l.set(x, y, lit > 0.35 ? tones[0] : lit > -0.35 ? tones[1] : tones[2])
      }
  })
  const inner = ri - 1
  if (dish)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - cx, y - cy) <= inner) t.set(x, y, 0)
  for (let k = 0; k < rays; k++) {
    const a = a0 + (k * Math.PI * 2) / rays
    t.line(
      cx,
      cy,
      cx + Math.cos(a) * (dish ? inner : ri - 0.5),
      cy + Math.sin(a) * (dish ? inner : ri - 0.5),
      dish ? (far ? metal[1] : metal[0]) : metal[3]
    )
  }
  if (dish) {
    t.rect(cx - 1, cy, 3, 1, metal[1])
    t.rect(cx, cy - 1, 1, 3, metal[1])
    t.set(cx, cy, R.hair[3])
  } else t.set(cx, cy, metal[0])
  r.blit(t)
}

/** A 1 px arc (a mudguard) over a wheel between two angles (radians, 0 = right, clockwise). */
const arc = (l: Raster, cx: number, cy: number, rad: number, a0: number, a1: number, c: number) => {
  for (let a = a0; a <= a1; a += 0.04) l.set(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, c)
}

/** Horizontal band shading of a lengthwise silhouette (light on top, shade underneath). */
function bandShade(l: Raster, ramp: Ramp) {
  const src = l.clone()
  for (let x = 0; x < l.w; x++) {
    let top = -1
    let bottom = -1
    for (let y = 0; y < l.h; y++)
      if (src.get(x, y) === ramp[1]) {
        if (top < 0) top = y
        bottom = y
      }
    if (top < 0) continue
    const h = bottom - top + 1
    for (let y = top; y <= bottom; y++) {
      const t = (y - top + 0.5) / h
      l.set(x, y, t < 0.2 ? ramp[0] : t < 0.58 ? ramp[1] : t < 0.84 ? ramp[2] : ramp[3])
    }
  }
}

function outdoorVehicle(vehicle: OutdoorVehicle, f: number) {
  const r = new Raster(N, N)
  const turnA = (f * Math.PI) / 4
  if (vehicle === 'tricycle') {
    const b = [0, -1, -1, 0][f]
    vehicleWheel(r, 5, 3, f, { rays: 2, tyre: 1, dish: false, far: true })
    // Low step deck, frame tube and a small seat.
    part(r, (l) => {
      l.poly([4, 20, 16, 19, 18, 21, 5, 22], R.red[1])
      l.thick(14, 20, 21, 14 + b, 1.6, R.red[1])
      shadeEdges(l, R.red, 1, true)
    })
    part(r, (l) => {
      l.line(9, 16 + b, 9, 19, R.metal[2])
      l.rect(7, 14 + b, 5, 2, R.yellow[1])
      l.line(7, 14 + b, 11, 14 + b, R.yellow[0])
    })
    vehicleWheel(r, 9, 3, f, { rays: 2, tyre: 1, dish: false })
    // Front wheel with the crank and pedals on its hub.
    vehicleWheel(r, 23, 6, f, { rays: 2, tyre: 1.4 })
    const px = 23 + Math.cos(turnA) * 3.4
    const py = 22 + Math.sin(turnA) * 3.4
    const qx = 23 - Math.cos(turnA) * 3.4
    const qy = 22 - Math.sin(turnA) * 3.4
    part(r, (l) => {
      l.line(23, 22, qx, qy, R.metal[3])
      l.rect(Math.round(qx) - 1, Math.round(qy), 3, 2, R.yellow[2])
    })
    part(r, (l) => {
      l.thick(23, 22, 21, 14 + b, 1.6, R.metal[1])
      l.line(21, 14 + b, 21, 11 + b, R.metal[1])
    })
    part(r, (l) => {
      l.line(23, 22, px, py, R.metal[2])
      l.rect(Math.round(px) - 1, Math.round(py), 3, 2, R.yellow[1])
    })
    // Thin handlebar with small grips.
    part(r, (l) => {
      l.line(18, 10 + b, 24, 10 + b, R.metal[2])
      l.rect(17, 9 + b, 2, 2, R.red[1])
      l.rect(24, 9 + b, 2, 2, R.red[1])
    })
    // Streamers fluttering back.
    const ribbons = [R.pink[1], R.mint[1], R.yellow[0]]
    ribbons.forEach((c, k) => {
      for (let i = 1; i <= 8; i++) {
        const wave = Math.sin(i * 0.85 - f * Math.PI * 0.5 + k * 1.3) * (0.4 + i * 0.12)
        r.set(16 - i, 10 + b + (k - 1) * i * 0.45 + wave, c)
      }
    })
    return r
  }

  if (vehicle === 'bicycle') {
    const b = [0, -1, 0, -1][f]
    const MINT = R.mint
    const cxr = 7
    const cxf = 24
    vehicleWheel(r, cxr, 6, f, { rays: 3, tyre: 1 })
    vehicleWheel(r, cxf, 6, f, { rays: 3, tyre: 1 })
    const bbx = 15
    const bby = 23
    const fx = Math.cos(turnA) * 3
    const fy = Math.sin(turnA) * 3
    // Far pedal.
    part(r, (l) => {
      l.line(bbx, bby, bbx - fx, bby - fy, R.metal[3])
      l.rect(Math.round(bbx - fx) - 1, Math.round(bby - fy), 3, 2, R.hair[2])
    })
    // Step-through frame.
    part(r, (l) => {
      l.thick(cxr, 22, bbx, bby, 2, MINT[1])
      l.thick(bbx, bby, 11, 13 + b, 2, MINT[1])
      l.thick(bbx, bby, 21, 14 + b, 2, MINT[1])
      shadeEdges(l, MINT, 1, true)
    })
    // Fork, stem, handlebar and basket.
    part(r, (l) => {
      l.thick(cxf, 22, 22, 13 + b, 1.6, R.metal[1])
      l.thick(22, 13 + b, 21, 10 + b, 1.6, R.metal[1])
      l.thick(21, 10 + b, 17, 9 + b, 1.6, R.metal[1])
      l.rect(15, 8 + b, 3, 2, R.hair[2])
    })
    part(r, (l) => {
      l.poly([22, 6 + b, 30, 6 + b, 29, 13 + b, 23, 13 + b], R.hair[3])
      for (const x of [24, 26, 28]) l.line(x, 7 + b, x, 12 + b, R.metal[2])
      l.line(23, 10 + b, 29, 10 + b, R.metal[2])
      l.line(22, 6 + b, 30, 6 + b, R.metal[0])
    })
    // Saddle.
    part(r, (l) => {
      l.line(11, 14 + b, 11, 12 + b, R.metal[2])
      l.rect(8, 11 + b, 5, 2, R.brown[1])
      l.line(8, 11 + b, 12, 11 + b, R.brown[0])
    })
    // Chainring and near pedal.
    part(r, (l) => {
      l.ellipse(bbx + 0.5, bby + 0.5, 2.4, 2.4, R.metal[1])
      l.line(bbx, bby, bbx + fx, bby + fy, R.metal[2])
    })
    part(r, (l) => {
      l.rect(Math.round(bbx + fx) - 1, Math.round(bby + fy), 3, 2, R.hair[1])
    })
    return r
  }

  if (vehicle === 'motorcycle') {
    const b = [0, -1, 0, -1][f]
    const RD = R.red
    vehicleWheel(r, 8, 5, f, { rays: 3, tyre: 1.7 })
    vehicleWheel(r, 25, 5, f, { rays: 3, tyre: 1.7 })
    // Rear shock with a spring.
    part(r, (l) => {
      for (let i = 0; i <= 6; i++) l.rect(10, 15 + i, 2, 1, i % 2 ? R.yellow[1] : R.metal[1])
    })
    // Exhaust running under the body to the rear wheel, then the engine block with fins.
    part(r, (l) => {
      l.thick(15, 22, 10, 25, 2, R.metal[2])
      l.ellipse(7.5, 25.5, 3.2, 1.4, R.metal[1])
      l.line(5, 25, 9, 25, R.metal[0])
    })
    part(r, (l) => {
      l.rect(13, 16, 7, 7, R.metal[1])
      shadeEdges(l, R.metal, 1, true)
      for (const y of [18, 20]) l.line(13, y, 19, y, R.metal[2])
    })
    // One flowing body: tail, seat and tank.
    part(r, (l) => {
      l.poly(
        [
          3,
          13.5 + b,
          5,
          12 + b,
          13,
          12 + b,
          15,
          10 + b,
          21,
          9.5 + b,
          23,
          12 + b,
          21,
          15.5 + b,
          14,
          16 + b,
          4,
          15.5 + b
        ],
        RD[1]
      )
      shadeEdges(l, RD, 1, true)
      l.line(15, 11 + b, 19, 10.5 + b, C.white)
      l.poly([6, 11 + b, 13, 11 + b, 14, 13 + b, 6, 13 + b], R.hair[2])
      l.line(7, 11 + b, 12, 11 + b, R.hair[0])
    })
    // Raked fork, handlebar, mirror and round headlight.
    part(r, (l) => {
      l.thick(25, 23, 22.5, 12 + b, 1.8, R.metal[1])
      l.line(22, 11 + b, 19, 10 + b, R.hair[2])
      l.line(19, 10 + b, 19, 7 + b, R.metal[2])
      l.rect(18, 6 + b, 3, 1, R.metal[0])
    })
    part(r, (l) => {
      ball(l, 25.5, 13.5 + b, 2.4, 2.4, R.yellow)
    })
    // Smoke puffs drifting back from the muffler.
    for (const k of [0, 2]) {
      const p = ((f + k) % 4) / 4
      r.ellipse(2 - p * 2, 26 - p * 3, 0.9 + p * 0.9, 0.9 + p * 0.9, p < 0.5 ? R.paper[1] : R.paper[2])
    }
    return r
  }

  if (vehicle === 'car') {
    const b = [0, -1, -1, 0][f]
    const S = R.sky
    part(r, (l) => {
      l.poly([3, 25 + b, 3, 19 + b, 6, 17 + b, 26, 17 + b, 29, 18 + b, 30, 21 + b, 30, 25 + b], S[1])
      l.poly([8, 17 + b, 11, 10 + b, 21, 10 + b, 25, 17 + b], S[1])
      // Windows.
      l.poly([10, 16 + b, 12.5, 11.5 + b, 15, 11.5 + b, 15, 16 + b], R.navy[1])
      l.poly([17, 16 + b, 17, 11.5 + b, 20.5, 11.5 + b, 23.5, 16 + b], R.navy[1])
      l.line(12, 15 + b, 14, 12 + b, R.sky[0])
      l.line(19, 15 + b, 20, 12 + b, R.sky[0])
      shadeEdges(l, S, 1, true)
      l.line(5, 18 + b, 25, 18 + b, S[0])
      l.line(4, 23 + b, 29, 23 + b, S[2])
      l.line(16, 17 + b, 16, 24 + b, S[3])
      l.rect(13, 19 + b, 2, 1, R.metal[0])
      l.rect(28, 19 + b, 2, 2, R.yellow[0])
      l.rect(3, 19 + b, 2, 2, R.red[1])
      l.rect(29, 23 + b, 1, 2, R.metal[1])
      l.rect(3, 24 + b, 1, 1, R.metal[1])
      // Wheel arches.
      for (const cx of [9, 23])
        for (let y = 18; y < 27; y++)
          for (let x = cx - 6; x <= cx + 6; x++) if ((x - cx) ** 2 + (y - 24) ** 2 <= 5.4 ** 2) l.paint(x, y, R.hair[3])
    })
    part(r, (l) => {
      l.rect(24, 16 + b, 3, 2, S[2])
    })
    vehicleWheel(r, 9, 4, f, { rays: 5, tyre: 1, dish: false })
    vehicleWheel(r, 23, 4, f, { rays: 5, tyre: 1, dish: false })
    for (const k of [0, 2]) {
      const p = ((f + k) % 4) / 4
      r.ellipse(2 - p * 2, 26 - p * 3, 0.9 + p * 0.8, 0.9 + p * 0.8, p < 0.5 ? R.paper[1] : R.paper[2])
    }
    return r
  }

  // Plane.
  const b = [1, 0, 1, 2][f]
  const tip = [0, -1, 0, 1][f]
  const P = R.paper
  // Contrail.
  for (const [y, len] of [
    [16, 5],
    [18, 4]
  ])
    for (let x = 0; x < len; x++) if ((x + f) % 4 < 3) r.set(x, y + b, x < 2 ? P[2] : P[1])
  // Far wing and far tail plane.
  part(r, (l) => {
    l.poly([21, 13 + b, 15, 5 + b + tip, 11, 5 + b + tip, 14, 13 + b], P[3])
    l.poly([5, 12 + b, 1.5, 8 + b, 3, 8 + b, 8, 12 + b], P[3])
  })
  // Fuselage.
  part(r, (l) => {
    l.poly(
      [
        30,
        17 + b,
        28,
        13.5 + b,
        24,
        12 + b,
        10,
        12 + b,
        5,
        10 + b,
        5,
        13.5 + b,
        10,
        19.5 + b,
        24,
        20.5 + b,
        28,
        19.5 + b
      ],
      P[1]
    )
    bandShade(l, P)
    l.poly([25, 13.8 + b, 28, 15 + b, 28, 16.6 + b, 25, 16.6 + b], R.navy[1])
    l.line(26, 14 + b, 27, 14.6 + b, R.sky[0])
    for (const x of [9, 12, 15, 18, 21]) {
      l.rect(x, 15 + b, 2, 2, R.navy[1])
      l.set(x, 15 + b, R.sky[1])
    }
  })
  // Tail fin with a stripe.
  part(r, (l) => {
    l.poly([5, 11 + b, 4, 4.5 + b, 8, 4.5 + b, 13, 12 + b], R.sky[1])
    l.poly([4.4, 7.6 + b, 4.1, 5.5 + b, 7.4, 5.5 + b, 8.8, 7.6 + b], R.red[1])
    shadeEdges(l, R.sky, 1, true)
  })
  // Near wing and engine pod.
  part(r, (l) => {
    l.poly([22, 17.5 + b, 14, 17.5 + b, 8, 25.5 + b + tip, 13, 25.5 + b + tip], P[1])
    shadeEdges(l, P, 1, true)
  })
  part(r, (l) => {
    ball(l, 19.5, 22 + b, 3.4, 2.2, R.metal)
    l.rect(22, 21 + b, 1, 2, R.hair[3])
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

/** A four-point glint: a cross of `size` arms with a bright core. */
function glint(r: Raster, cx: number, cy: number, size: number, arm: number, core: number) {
  for (let i = 1; i <= size; i++) {
    const c = i === size ? arm : core
    r.set(cx - i, cy, c)
    r.set(cx + i, cy, c)
    r.set(cx, cy - i, c)
    r.set(cx, cy + i, c)
  }
  r.set(cx, cy, core)
  return r
}

/** A two-tone capsule: coloured top half, pale bottom half; `gap` pulls the halves apart (popped open). */
function capsule(l: Raster, cx: number, cy: number, rad: number, ramp: Ramp, gap = 0) {
  const top = new Raster(l.w, l.h)
  const bottom = new Raster(l.w, l.h)
  ball(top, cx - gap, cy - gap, rad, rad, ramp)
  ball(bottom, cx + gap, cy + gap, rad, rad, R.paper)
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) {
      const t = y + 0.5 <= cy - gap + 0.5 ? top.get(x, y) : 0
      const b = y + 0.5 > cy + gap - 0.5 ? bottom.get(x, y) : 0
      if (t) l.set(x, y, t)
      else if (b) l.set(x, y, b)
    }
}

/** A card suit centred on (cx, cy), turned by `a`. */
function suit(
  l: Raster,
  kind: 'heart' | 'spade' | 'diamond' | 'club',
  cx: number,
  cy: number,
  a: number,
  c: number,
  k = 1
) {
  const P = (x: number, y: number) => spin(cx + x * k, cy + y * k, cx, cy, a)
  const dot = (x: number, y: number, rad: number) => {
    const [px, py] = P(x, y)
    l.ellipse(px, py, rad * k, rad * k, c)
  }
  const tri = (...p: number[]) =>
    l.poly(
      p.flatMap((v, i) => (i % 2 ? [] : P(v, p[i + 1]))),
      c
    )
  if (kind === 'heart') {
    dot(-1.5, -1.1, 1.9)
    dot(1.5, -1.1, 1.9)
    tri(-3.3, -0.3, 3.3, -0.3, 0, 3.4)
  } else if (kind === 'spade') {
    dot(-1.5, 0.7, 1.9)
    dot(1.5, 0.7, 1.9)
    tri(-3.3, 0.2, 3.3, 0.2, 0, -3.6)
    tri(0, 0.5, -1.4, 3.6, 1.4, 3.6)
  } else if (kind === 'diamond') {
    tri(0, -3.6, 2.7, 0, 0, 3.6)
    tri(0, -3.6, 0, 3.6, -2.7, 0)
  } else {
    dot(0, -1.9, 1.8)
    dot(-1.9, 0.9, 1.8)
    dot(1.9, 0.9, 1.8)
    tri(0, 0.3, -1.4, 3.6, 1.4, 3.6)
  }
}

const GLASS: Ramp = [C.white, R.sky[0], R.sky[1], R.sky[2], R.sky[4]]

function gachaArt(frame: number) {
  const r = new Raster(N, N)
  const jostle = frame < 4 ? [0, 1, 0, -1][frame] : 0
  // Base plinth.
  part(r, (l) => {
    l.rect(4, 27, 24, 3, R.navy[1])
    shadeEdges(l, R.navy, 1, true)
  })
  // Glass dome with the capsules inside.
  part(r, (l) => ball(l, 16, 9, 10, 8.6, GLASS))
  const inside: [number, number, Ramp][] = [
    [10.5, 10, R.pink],
    [16, 12.2, R.red],
    [21.5, 10, R.green],
    [13, 5.6, R.yellow],
    [19.5, 6, R.purple],
    [16, 8, R.orange]
  ]
  inside.forEach(([x, y, ramp], i) =>
    part(r, (l) => capsule(l, x, y + (i % 2 ? jostle : -jostle) * (i < 3 ? 1 : 0), 2.7, ramp))
  )
  // Glass glints over everything inside.
  r.line(8, 6, 10, 3, C.white).line(11, 2, 13, 2, C.white)
  r.set(7, 8, C.white)
  r.line(24, 12, 25, 9, R.sky[0])
  // Brass collar and the red body.
  part(r, (l) => {
    l.rect(7, 15, 18, 3, R.yellow[1])
    shadeEdges(l, R.yellow, 1, true)
  })
  part(r, (l) => {
    l.rect(5, 18, 22, 9, R.red[1])
    shadeEdges(l, R.red, 1, true)
    // Coin slot plate.
    l.rect(8, 19, 5, 3, R.paper[1])
    l.rect(8, 21, 5, 1, R.paper[2])
    l.rect(10, 20, 1, 1, C.inkCool)
    // Dispensing hatch.
    l.rect(8, 23, 8, 4, R.hair[3])
    l.rect(8, 23, 8, 1, C.inkCool)
    l.rect(8, 26, 8, 1, R.hair[2])
  })
  // Crank: a gold wheel with a handle that turns a full circle over frames 0-3.
  const angle = -Math.PI / 2 + (Math.min(frame, 4) * Math.PI) / 2
  const [hx, hy] = [22 + Math.cos(angle) * 3.4, 22.5 + Math.sin(angle) * 3.4]
  part(r, (l) => {
    ball(l, 22, 22.5, 3.8, 3.8, R.yellow)
    l.thick(22, 22.5, hx, hy, 1.4, R.metal[1])
    ball(l, hx, hy, 1.5, 1.5, R.metal)
  })
  // The prize: drops through the hatch, lands, pops open with a sparkle.
  if (frame === 3) part(r, (l) => capsule(l, 12, 24.5, 2.5, R.pink))
  if (frame === 4) part(r, (l) => capsule(l, 13, 28, 2.7, R.pink))
  if (frame === 5) {
    part(r, (l) => capsule(l, 13, 27.6, 2.8, R.pink, 1.4))
    r.rect(12, 26, 2, 2, R.yellow[0])
    glint(r, 3, 22, 2, R.yellow[1], C.white)
    glint(r, 29, 19, 2, R.yellow[1], C.white)
    r.set(10, 25, R.yellow[0])
    r.set(17, 26, R.yellow[0])
  }
  return r
}

const CARD_PIPS = {
  heart: ['r.r', 'rrr', '.r.'],
  diamond: ['.r.', 'rrr', '.r.'],
  spade: ['.k.', 'kkk', 'k.k'],
  club: ['.k.', 'kkk', '.k.']
} as const

const ACE = ['.r.', 'r.r', 'rrr', 'r.r', 'r.r']

/** One 11×15 card centred on (cx, cy), tilted by `a`; `ws` squeezes its width for the flip. */
function pokerCard(r: Raster, cx: number, cy: number, a: number, ws: number, face: 'back' | 'spade' | 'heart') {
  const hw = Math.max(0.8, 5.5 * ws)
  const outline = (inset: number) => {
    const [x0, x1, y0, y1] = [cx - hw + inset, cx + hw - inset, cy - 7.5 + inset, cy + 7.5 - inset]
    const c = hw > 3 ? 1 : 0
    return turn(
      [x0 + c, y0, x1 - c, y0, x1, y0 + c, x1, y1 - c, x1 - c, y1, x0 + c, y1, x0, y1 - c, x0, y0 + c],
      cx,
      cy,
      a
    )
  }
  part(
    r,
    (l) => {
      l.poly(outline(0), C.inkCool)
      l.poly(outline(1), R.paper[0])
      if (ws < 0.5) {
        for (let y = 0; y < l.h; y++)
          for (let x = 0; x < l.w; x++) if (l.get(x, y) === R.paper[0] && x > cx) l.set(x, y, R.paper[2])
        return
      }
      if (face === 'back') {
        l.poly(outline(2), R.navy[1])
        for (let y = 0; y < l.h; y++)
          for (let x = 0; x < l.w; x++)
            if (l.get(x, y) === R.navy[1] && ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0)) l.set(x, y, R.red[1])
        return
      }
      const red = face === 'heart'
      const colour = red ? R.red[1] : C.inkCool
      const [ix, iy] = spin(cx - 1.5, cy - 3.5, cx, cy, a)
      l.stamp(ACE, ix - 1, iy - 2, { r: colour })
      const [sx, sy] = spin(cx + 0.5, cy + 2.5, cx, cy, a)
      suit(l, face, sx, sy, a, colour, 0.9)
    },
    false
  )
}

function chips(r: Raster, n: number) {
  const ramps = [R.red, R.navy, R.yellow, R.red]
  for (let i = 0; i < n; i++) {
    const y = 26 - i * 3
    const ramp = ramps[i]
    part(r, (l) => {
      l.ellipse(26, y + 2, 4.5, 2, ramp[2])
      l.rect(22, y, 9, 2, ramp[2])
      l.ellipse(26, y, 4.5, 2, ramp[1])
      l.ellipse(26, y, 2.4, 0.9, ramp[0])
    })
    for (const x of [23, 26, 29]) {
      r.set(x, y + 1, R.paper[0])
      r.set(x, y + 2, R.paper[0])
    }
  }
}

function pokerArt(frame: number) {
  const r = new Raster(N, N)
  const f = Math.min(frame, 5)
  const dealt = f === 0 ? { dy: -5, dx: -3 } : { dy: 0, dx: 0 }
  const left = [1, 1, 0.3, 1, 1, 1][f]
  const right = [1, 1, 1, 0.3, 1, 1][f]
  const leftFace = f >= 3 ? 'spade' : 'back'
  const rightFace = f >= 4 ? 'heart' : 'back'
  pokerCard(r, 8 + dealt.dx, 14 + dealt.dy, (-8 * Math.PI) / 180, left, leftFace)
  pokerCard(r, 17.5 - dealt.dx, 14 + dealt.dy, (8 * Math.PI) / 180, right, rightFace)
  if (f >= 4) chips(r, f === 4 ? 3 : 4)
  if (f === 5) {
    glint(r, 3, 4, 3, R.yellow[1], C.white)
    glint(r, 20, 4, 2, R.yellow[1], R.yellow[0])
    r.set(30, 12, R.yellow[0])
  }
  return r
}

const DIGITS: Record<string, readonly string[]> = {
  '7': ['rrrr', '...r', '..r.', '..r.', '.r..', '.r..', '.r..'],
  '0': ['.rr.', 'r..r', 'r..r', 'r..r', 'r..r', 'r..r', '.rr.'],
  '3': ['rrr.', '...r', '...r', '.rr.', '...r', '...r', 'rrr.'],
  '8': ['.rr.', 'r..r', 'r..r', '.rr.', 'r..r', 'r..r', '.rr.'],
  '1': ['.r..', 'rr..', '.r..', '.r..', '.r..', '.r..', 'rrr.'],
  '5': ['rrrr', 'r...', 'rrr.', '...r', '...r', 'r..r', '.rr.'],
  '2': ['.rr.', 'r..r', '...r', '..r.', '.r..', 'r...', 'rrrr'],
  '6': ['.rr.', 'r...', 'rrr.', 'r..r', 'r..r', 'r..r', '.rr.']
}
const STRIP = ['3', '8', '1', '5', '0', '2', '6']

function pachinkoArt(frame: number) {
  const r = new Raster(N, N)
  const win = frame >= 5
  // Gold cabinet.
  part(r, (l) => {
    l.rect(2, 1, 28, 29, R.yellow[1])
    shadeEdges(l, R.yellow, 1, true)
  })
  // Red display housing with its lamp row.
  part(r, (l) => {
    l.rect(4, 3, 24, 14, R.red[1])
    shadeEdges(l, R.red, 1, true)
  })
  for (let i = 0; i < 5; i++) {
    const lit = frame >= 5 ? 2 : frame === 4 ? 1 : (i + frame) % 2
    r.rect(7 + i * 4, 4, 2, 2, lit === 2 ? C.white : lit ? R.yellow[0] : R.red[3])
    if (lit) r.rect(7 + i * 4, 6, 2, 1, R.yellow[2])
  }
  // Reel window: three reels that stop one after another on 7-7-7.
  part(r, (l) => l.rect(7, 7, 18, 9, R.hair[3]))
  for (let reel = 0; reel < 3; reel++) {
    const x = 7 + reel * 6
    const stopped = frame >= 3 + reel
    const strip = new Raster(N, N)
    if (stopped) strip.stamp(DIGITS['7'], x + 1, 8, { r: R.red[1] })
    else {
      const off = (frame * 5 + reel * 4) % 9
      for (let g = -1; g < 3; g++) {
        const key = STRIP[(g + reel * 2 + frame * 2 + 14) % STRIP.length]
        strip.stamp(DIGITS[key], x + 1, 8 + g * 9 + off, { r: R.red[2] })
      }
    }
    r.rect(x, 7, 6, 9, win && stopped ? R.yellow[0] : stopped ? R.paper[0] : R.paper[1])
    r.rect(x + 5, 7, 1, 9, R.paper[2])
    for (let y = 7; y < 16; y++) for (let xx = x; xx < x + 6; xx++) if (strip.get(xx, y)) r.set(xx, y, strip.get(xx, y))
  }
  // Pin glass.
  part(r, (l) => l.rect(5, 18, 22, 8, R.navy[2]))
  for (const [y, xs] of [
    [20, [8, 12, 16, 20, 24]],
    [23, [10, 14, 18, 22]]
  ] as const)
    for (const x of xs) r.set(x, y, R.navy[0])
  for (let k = 0; k < 3; k++) {
    const y = 19 + ((frame * 3 + k * 3) % 7)
    const x = 9 + k * 6 + (y % 2 ? 1 : -1) * (k % 2 ? 1 : 2)
    ball(r, x, y, 1.5, 1.5, R.metal)
  }
  // Payout tray filling up with balls.
  part(r, (l) => {
    l.rect(5, 26, 22, 3, R.metal[1])
    shadeEdges(l, R.metal, 1, true)
  })
  for (let k = 0; k < Math.min(frame, 5); k++) ball(r, 8 + k * 4, 27, 1.5, 1.5, R.metal)
  if (win) {
    glint(r, 3, 2, 2, C.white, R.yellow[0])
    glint(r, 28, 2, 2, C.white, R.yellow[0])
  }
  return r
}

const BAY: Ramp = [R.brown[0], R.brown[1], R.brown[2], R.brown[3], R.brown[4]]

/** Gallop poses: [knee x, knee y, hoof x, hoof y] of the front and hind leg relative to the body centre. */
const GALLOP = [
  { bob: -1, front: [9, 22, 13, 22], hind: [-9, 22, -13, 23] },
  { bob: 0, front: [9, 24, 11, 28], hind: [-7, 25, -10, 27] },
  { bob: 1, front: [6, 25, 4, 28], hind: [-2, 25, 2, 28] },
  { bob: 0, front: [6, 24, 9, 24], hind: [-7, 26, -11, 28] }
] as const

function horseArt(frame: number, w: number) {
  const r = new Raster(w, N)
  const f = Math.min(frame, 5)
  const cx = 13 + Math.round(((w - 32) * f) / 5)
  const pose = GALLOP[f % 4]
  const far = GALLOP[(f + 2) % 4]
  const cy = 18 + pose.bob
  const hipY = cy + 3
  const leg = (l: Raster, p: readonly number[], hipX: number, color: number, hoof: number) => {
    l.thick(hipX, hipY, cx + p[0], p[1], 2.4, color)
    l.thick(cx + p[0], p[1], cx + p[2], p[3], 2, color)
    l.rect(cx + p[2] - 1, p[3] - (p[3] > 26 ? 0 : 1), 2, 1, hoof)
  }
  // Track and finish post.
  part(r, (l) => {
    l.rect(2, 29, w - 4, 1, R.green[1])
  })
  part(r, (l) => {
    l.rect(w - 8, 5, 2, 24, R.paper[1])
    for (let y = 7; y < 28; y += 4) l.rect(w - 8, y, 2, 2, R.hair[2])
    l.poly([w - 6, 2, w - 2, 4, w - 6, 6], R.red[1])
    l.rect(w - 8, 2, 2, 3, R.yellow[1])
  })
  // Tail streaming behind, then the far legs.
  part(r, (l) => {
    l.thick(cx - 6, cy - 1, cx - 11, cy - 1 + (f % 2), 2.4, R.hair[2])
    l.thick(cx - 11, cy - 1 + (f % 2), cx - 14, cy + 1 + (f % 2), 2, R.hair[2])
  })
  part(r, (l) => {
    leg(l, far.front, cx + 4, BAY[2], R.hair[3])
    leg(l, far.hind, cx - 5, BAY[2], R.hair[3])
  })
  // Neck and head, then the body over the shoulder.
  part(r, (l) => {
    l.thick(cx + 5, cy - 1, cx + 10, cy - 6, 5, BAY[1])
    l.thick(cx + 10, cy - 6, cx + 14, cy - 3, 3.6, BAY[1])
    l.poly([cx + 8, cy - 8, cx + 9, cy - 11, cx + 11, cy - 8], BAY[1])
    shadeEdges(l, BAY, 1, true)
    l.set(cx + 13, cy - 4, C.inkCool)
    l.set(cx + 14, cy - 3, R.paper[1])
  })
  part(r, (l) => ball(l, cx, cy, 7.4, 4.8, BAY))
  // Near legs.
  part(r, (l) => {
    leg(l, pose.hind, cx - 5, BAY[1], R.hair[3])
    leg(l, pose.front, cx + 5, BAY[1], R.hair[3])
  })
  // Mane along the neck.
  part(r, (l) => {
    l.thick(cx + 4, cy - 3, cx + 8, cy - 8, 1.6, R.hair[2])
    l.set(cx + 3, cy - 2 + (f % 2), R.hair[2])
  })
  // Jockey in purple silks crouched over the withers.
  part(r, (l) => {
    l.thick(cx - 1, cy - 3, cx + 2, cy + 2, 2.2, R.paper[1])
    l.thick(cx - 2, cy - 4, cx + 4, cy - 8, 4, R.purple[1])
    l.thick(cx + 4, cy - 8, cx + 8, cy - 6, 1.6, R.purple[2])
    shadeEdges(l, R.purple, 1, true)
  })
  part(r, (l) => {
    ball(l, cx + 5, cy - 10, 2.5, 2.5, R.yellow)
    l.rect(cx + 7, cy - 9, 2, 1, R.skin[1])
  })
  r.set(cx + 7, cy - 6, R.skin[1])
  // Saddle cloth.
  r.rect(cx - 2, cy - 2, 3, 2, R.paper[1])
  // Dust at the hooves.
  for (const p of [pose.front, pose.hind]) if (p[3] >= 27) r.set(cx + p[2] - 3, 28, R.paper[2])
  // Finish: rosette and glints.
  if (f >= 4) {
    const big = f >= 5
    const [rx, ry] = [7, 7]
    part(r, (l) => {
      l.poly([rx - 2, ry + 1, rx - 4, ry + 8, rx - 1, ry + 6, rx, ry + 8], R.red[2])
      l.poly([rx + 1, ry + 1, rx + 4, ry + 8, rx + 1, ry + 6, rx, ry + 8], R.red[2])
      ball(l, rx, ry, big ? 4.4 : 3.2, big ? 4.4 : 3.2, R.red)
    })
    r.ellipse(rx, ry, big ? 2 : 1.2, big ? 2 : 1.2, R.yellow[1])
    r.set(rx - 1, ry - 1, R.yellow[0])
    if (big) {
      glint(r, 20, 5, 3, R.yellow[1], C.white)
      glint(r, 4, 20, 2, R.yellow[1], R.yellow[0])
    } else r.set(20, 5, R.yellow[0])
  }
  return r
}

function gambleArt(kind: 'gacha' | 'poker' | 'pachinko' | 'horse', frame: number, w = 32) {
  if (kind === 'gacha') return gachaArt(frame)
  if (kind === 'poker') return pokerArt(frame)
  if (kind === 'pachinko') return pachinkoArt(frame)
  return horseArt(frame, w)
}

/** A sphere-shaded ellipse turned by `a` (the light stays top-left). */
function turnedBall(l: Raster, cx: number, cy: number, rx: number, ry: number, a: number, ramp: Ramp) {
  const cs = Math.cos(a)
  const sn = Math.sin(a)
  const reach = Math.ceil(Math.max(rx, ry)) + 1
  for (let y = Math.floor(cy) - reach; y <= Math.ceil(cy) + reach; y++)
    for (let x = Math.floor(cx) - reach; x <= Math.ceil(cx) + reach; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const lx = (dx * cs + dy * sn) / rx
      const ly = (-dx * sn + dy * cs) / ry
      const q = lx * lx + ly * ly
      if (q > 1.0001) continue
      const nz = Math.sqrt(Math.max(0, 1 - q))
      // Normal back in screen space: turning the surface does not move the light.
      const wx = lx * cs - ly * sn
      const wy = lx * sn + ly * cs
      const d = wx * -0.55 + wy * -0.7 + nz * 0.55
      l.set(x, y, d > 0.8 ? ramp[0] : d > 0.25 ? ramp[1] : d > -0.12 ? ramp[2] : ramp[3])
    }
}

/** A plump seed pod tumbling in the air: four quarter turns, each drawn from primitives. */
function gardenSeed(frame: number) {
  const r = new Raster(N, N)
  const a = 0.5 + (frame * Math.PI) / 2
  const cx = 16
  const cy = 16
  // Local axes: u across the seed, v along it (tip towards -v).
  const at = (u: number, v: number): [number, number] => spin(cx + u, cy + v, cx, cy, a)
  part(r, (l) => {
    const [tx, ty] = at(0, -10)
    const [bx, by] = at(0, -6)
    l.thick(bx, by, tx, ty, 2, R.green[2])
    const [lx, ly] = at(3.5, -10)
    const [mx, my] = at(-3.5, -11)
    l.ellipse(lx, ly, 3.4, 1.9, R.green[1])
    l.ellipse(mx, my, 3.2, 1.8, R.green[0])
  })
  part(r, (l) => {
    turnedBall(l, cx, cy + 1, 6.5, 8.5, a, R.brown)
    // Seed-coat stripes follow the long axis.
    for (const u of [-2.5, 0.5, 3]) {
      const [x0, y0] = at(u, -3)
      const [x1, y1] = at(u, 6)
      l.line(x0, y0, x1, y1, u < 0 ? R.brown[1] : R.brown[2])
    }
  })
  return r
}

/** A ring of `n` petals (round-brush strokes from `r0` to `r1`), lit from the top-left by their direction. */
function petals(
  l: Raster,
  cx: number,
  cy: number,
  n: number,
  r0: number,
  r1: number,
  width: number,
  ramp: Ramp,
  turn0: number
) {
  l.ellipse(cx, cy, r0 + 0.5, r0 + 0.5, ramp[1])
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + turn0
    const lit = -Math.cos(a) * 0.55 - Math.sin(a) * 0.7
    const col = lit > 0.55 ? ramp[0] : lit < -0.35 ? ramp[2] : ramp[1]
    l.thick(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, width, col)
  }
}

/** Layer of the flower stem and its two leaves; the head sways by `hx`. */
function stemLayer(l: Raster, hx: number, hy: number, frame: number) {
  const bob = [0, -1, 0, 0][frame]
  l.thick(16, 30, 16 + hx * 0.4, 21, 2, R.green[1])
  l.thick(16 + hx * 0.4, 21, 16 + hx, hy + 3, 2, R.green[1])
  l.poly([16, 27, 10, 24 + bob, 7, 25 + bob, 10, 28, 16, 29], R.green[1])
  l.poly([16, 25, 22, 22 - bob, 25, 23 - bob, 22, 26, 16, 27], R.green[1])
  shadeEdges(l, R.green, 1, true)
}

type FlowerKind = 'sunflower' | 'tulip' | 'daisy'

/** One bedding flower (32×32, base at y=30, head swaying over 4 frames). */
function flower(kind: FlowerKind, frame: number) {
  const r = new Raster(N, N)
  const hx = [-1, 0, 1, 0][frame]
  const hy = kind === 'sunflower' ? 11 : kind === 'tulip' ? 12 : 13
  part(r, (l) => stemLayer(l, hx, hy, frame))
  const cx = 16 + hx
  if (kind === 'sunflower') {
    part(r, (l) => {
      petals(l, cx, hy, 9, 4, 7.4, 3.2, R.yellow, 0.2)
    })
    part(r, (l) => {
      ball(l, cx, hy, 4.6, 4.6, R.brown)
    })
  } else if (kind === 'tulip') {
    part(r, (l) => {
      l.poly(
        [cx - 5, hy - 1, cx - 5, hy - 7, cx - 2, hy - 3, cx, hy - 8, cx + 2, hy - 3, cx + 5, hy - 7, cx + 5, hy - 1],
        R.red[1]
      )
      ball(l, cx, hy + 1, 5.2, 6, R.red)
      l.line(cx - 1, hy - 4, cx - 1, hy, R.red[2])
      l.line(cx + 2, hy - 3, cx + 2, hy + 1, R.red[2])
    })
  } else {
    part(r, (l) => {
      petals(l, cx, hy, 10, 3, 7.4, 2.3, R.paper, 0.3)
    })
    part(r, (l) => {
      ball(l, cx, hy, 3, 3, R.yellow)
    })
  }
  return r
}

/** Landed seed: a soil mound with crumbs, a sprout popping up and wiggling (4 frames). */
function gardenSprout(frame: number) {
  const r = new Raster(N, N)
  const lean = [-1, 0, 1, 0][frame]
  const grow = [0, 1, 2, 1][frame]
  part(r, (l) => {
    l.thick(16, 24, 16 + lean * 0.5, 17 - grow, 2, R.green[1])
    l.thick(16 + lean * 0.5, 17 - grow, 16 + lean, 13 - grow, 2, R.green[1])
    l.ellipse(11 + lean * 0.5, 13 - grow + (frame === 2 ? -1 : 0), 4.2, 2.2, R.green[1])
    l.ellipse(21 + lean, 12 - grow + (frame === 0 ? 1 : 0), 4.2, 2.2, R.green[1])
    shadeEdges(l, R.green, 1, true)
  })
  part(r, (l) => {
    ball(l, 16, 27, 9, 5.5, R.brown)
  })
  // Crumbs hopping around the mound.
  const hop = [
    [8, 22, 22, 21],
    [7, 20, 23, 19],
    [6, 22, 24, 21],
    [7, 24, 23, 23]
  ][frame]
  part(r, (l) => l.rect(hop[0], hop[1], 2, 2, R.brown[1]))
  part(r, (l) => l.rect(hop[2], hop[3], 2, 2, R.brown[2]))
  return r
}

/** Cached tilled flower-bed soil at world scale: dark disc, furrows, crumbs, pebbles and a soft edge. */
const beds = new Map<number, Raster>()
export function flowerBed(radius: number) {
  const rr = Math.max(16, Math.round(radius / 4) * 4)
  let r = beds.get(rr)
  if (r) return r
  r = new Raster(rr * 2 + 2, rr * 2 + 2)
  const rand = rng(rr * 31 + 7)
  const c = rr + 1
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const d = Math.hypot(dx, dy)
      if (d > rr) continue
      // Soft edge: a dithered crumbly rim over the last 3 px.
      if (d > rr - 3 && (x + y + (d > rr - 1.5 ? 1 : 0)) % 2) continue
      const row = (y + Math.floor(Math.sin(x / 9) * 1.5) + 80) % 7
      let col: number = R.brown[2]
      if (row === 0) col = R.brown[3]
      else if (row === 1 && (x * 5 + y * 3) % 9 > 3) col = R.brown[1]
      if (d > rr - 3) col = dx + dy < -rr * 0.3 ? R.brown[1] : R.brown[3]
      r.set(x, y, col)
    }
  // Soil clumps and pebbles.
  const n = Math.round(rr / 6)
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * (rr - 8)
    const x = Math.round(c + Math.cos(a) * d)
    const y = Math.round(c + Math.sin(a) * d)
    if (i % 3 === 0) {
      r.rect(x, y, 2, 2, R.metal[1])
      r.set(x + 1, y + 1, R.metal[2])
      r.set(x, y, R.metal[0])
    } else {
      r.rect(x, y, 2, 1, R.brown[1])
      r.set(x + 1, y + 1, R.brown[3])
    }
  }
  beds.set(rr, r)
  return r
}

export type BedSpot = { x: number; y: number; kind: 0 | 1 | 2; phase: number }
const spotCache = new Map<string, BedSpot[]>()
/** Deterministic flower positions for a bed (the flower base relative to the bed centre), back to front. */
export function flowerSpots(radius: number, variant: number): BedSpot[] {
  const rr = Math.max(16, Math.round(radius / 4) * 4)
  const key = `${rr}:${variant & 3}`
  let spots = spotCache.get(key)
  if (spots) return spots
  const n = Math.max(4, Math.round(rr / 7))
  const rand = rng(rr * 17 + (variant & 3) * 101 + 5)
  spots = []
  for (let k = 0; k < n; k++) {
    const a = k * 2.39996 + (variant & 3) * 1.3
    const d = (rr - 10) * Math.sqrt((k + 0.5) / n)
    spots.push({
      x: Math.round(Math.cos(a) * d),
      y: Math.round(Math.sin(a) * d * 0.9 + 4),
      kind: ((k + (variant & 3)) % 3) as 0 | 1 | 2,
      phase: rand() * 1.2
    })
  }
  spots.sort((p, q) => p.y - q.y)
  spotCache.set(key, spots)
  return spots
}

/** HUD icon: a sunflower with a little watering can. */
function gardenIcon() {
  const r = new Raster(32, 32)
  part(r, (l) => {
    l.thick(22, 29, 22, 15, 2, R.green[1])
    l.poly([22, 26, 28, 22, 31, 23, 28, 27, 22, 28], R.green[1])
    shadeEdges(l, R.green, 1, true)
  })
  part(r, (l) => {
    petals(l, 22, 10, 9, 3.5, 7, 3.2, R.yellow, 0.2)
  })
  part(r, (l) => ball(l, 22, 10, 4.3, 4.3, R.brown))
  // Watering can: handle, spout with a rose, body.
  part(r, (l) => {
    l.thick(4, 19, 2, 21, 2, R.metal[2])
    l.thick(2, 21, 2, 25, 2, R.metal[2])
    l.thick(2, 25, 4, 27, 2, R.metal[2])
  })
  part(r, (l) => {
    l.thick(13, 25, 17, 21, 2, R.mint[1])
    l.ellipse(18, 20, 1.6, 2.4, R.mint[2])
  })
  part(r, (l) => {
    l.rect(4, 17, 10, 12, R.mint[1])
    shadeEdges(l, R.mint, 1, true)
    l.rect(4, 17, 10, 2, R.mint[0])
    l.rect(5, 22, 8, 1, R.mint[2])
    l.rect(5, 26, 8, 1, R.mint[2])
  })
  return r
}

const ICONS: Record<string, () => Raster> = {
  w_observe: observationIcon,
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
  w_travel: () => outdoorVehicle('tricycle', 0),
  w_travel_tricycle: () => outdoorVehicle('tricycle', 0),
  w_travel_bicycle: () => outdoorVehicle('bicycle', 0),
  w_travel_motorcycle: () => outdoorVehicle('motorcycle', 0),
  w_travel_car: () => outdoorVehicle('car', 0),
  w_travel_plane: () => outdoorVehicle('plane', 0),
  w_savings: () => pig(0, false),
  w_garden: gardenIcon,
  w_gamble: () => gambleArt('gacha', 5),
  w_gamble_gacha: () => gambleArt('gacha', 5),
  w_gamble_poker: () => gambleArt('poker', 5),
  w_gamble_pachinko: () => gambleArt('pachinko', 5),
  w_gamble_horse: () => gambleArt('horse', 5, 32),
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
    'weapon:w_observe': observationSheet,
    'weapon:w_pet': () => ({
      fly: loop(
        many(4, (f) => dog(f, 'run')),
        12
      ),
      bite: loop([dog(0, 'closed'), dog(0, 'open')], 6)
    }),
    ...Object.fromEntries(
      (['cat', 'rabbit', 'parakeet', 'hamster'] as const).map((kind) => [
        `weapon:w_pet_${kind}`,
        () => ({
          fly: loop(
            many(4, (frame) => smallPet(kind, frame, 'run')),
            12
          ),
          bite: loop([smallPet(kind, 0, 'closed'), smallPet(kind, 0, 'open')], 6)
        })
      ])
    ),
    'weapon:w_reading': () => ({ fly: loop(many(4, openBook), 6) }),
    'weapon:w_overtime': () => ({ fly: loop(many(STAPLE_DIRS, staple), 1) }),
    'weapon:w_ring': () => ({ fly: loop(many(4, ring), 12) }),
    'weapon:w_travel': () => ({
      fly: loop(
        many(4, (f) => outdoorVehicle('tricycle', f)),
        8
      )
    }),
    'weapon:w_travel_tricycle': () => ({
      fly: loop(
        many(4, (f) => outdoorVehicle('tricycle', f)),
        8
      )
    }),
    'weapon:w_travel_bicycle': () => ({
      fly: loop(
        many(4, (f) => outdoorVehicle('bicycle', f)),
        8
      )
    }),
    'weapon:w_travel_motorcycle': () => ({
      fly: loop(
        many(4, (f) => outdoorVehicle('motorcycle', f)),
        8
      )
    }),
    'weapon:w_travel_car': () => ({
      fly: loop(
        many(4, (f) => outdoorVehicle('car', f)),
        8
      )
    }),
    'weapon:w_travel_plane': () => ({
      fly: loop(
        many(4, (f) => outdoorVehicle('plane', f)),
        8
      )
    }),
    'weapon:w_garden': () => ({
      fly: loop(many(4, gardenSeed), 10),
      sprout: loop(many(4, gardenSprout), 6),
      bloom: loop(
        many(4, (f) => flower('sunflower', f)),
        4
      ),
      tulip: loop(
        many(4, (f) => flower('tulip', f)),
        4
      ),
      daisy: loop(
        many(4, (f) => flower('daisy', f)),
        4
      )
    }),
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
    heal: loop(many(2, heal), 6),
    gamble_gacha: { frames: many(6, (frame) => gambleArt('gacha', frame)), fps: 6, loop: false },
    gamble_poker: { frames: many(6, (frame) => gambleArt('poker', frame)), fps: 6, loop: false },
    gamble_pachinko: { frames: many(6, (frame) => gambleArt('pachinko', frame)), fps: 6, loop: false },
    gamble_horse: { frames: many(6, (frame) => gambleArt('horse', frame, 40)), fps: 6, loop: false }
  }
}

/** 32×32 HUD icons for the new weapons and passives, merged into the `icons` sheet. */
export function arsenalIcons(): Record<string, Raster> {
  return Object.fromEntries(Object.entries(ICONS).map(([id, make]) => [id, icon(make())]))
}
