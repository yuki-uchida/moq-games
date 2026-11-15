/**
 * Pickups and projectiles: fruit, star, twig, berry, acorn, crow feather, stinger, dark orb, shockwave and the
 * little bee. Small sprites, centred, light from the top-left, a dark outline of their own material.
 */
import type { SheetModule } from '../../module'
import { C, R } from '../../palette'
import { Raster, ball, bar, outline, shadeEdges, shadeIndex } from '../../raster'
import { lazyAnim } from '../../sheet'

const GOLD = R.gold
const LEAF = R.leaf
const BARK = R.bark
const DARK = R.dark

/** A four-point twinkle. */
function twinkle(r: Raster, x: number, y: number, core: number, arm: number) {
  r.set(x, y, core)
  r.set(x - 1, y, arm)
  r.set(x + 1, y, arm)
  r.set(x, y - 1, arm)
  r.set(x, y + 1, arm)
}

/** A pointed leaf from (x, y) toward (x + dx, y + dy), lit on one side. */
function leaf(l: Raster, x: number, y: number, dx: number, dy: number, w = 2.4) {
  const n = Math.hypot(dx, dy) || 1
  const nx = (-dy / n) * w
  const ny = (dx / n) * w
  l.poly(
    [x, y, x + dx * 0.45 + nx, y + dy * 0.45 + ny, x + dx, y + dy, x + dx * 0.45 - nx, y + dy * 0.45 - ny],
    LEAF[1]
  )
  l.poly([x, y, x + dx * 0.45 - nx, y + dy * 0.45 - ny, x + dx, y + dy, x + dx * 0.5, y + dy * 0.5], LEAF[2])
  l.line(x, y, x + dx * 0.85, y + dy * 0.85, LEAF[0])
}

/** One layer drawn, outlined, and laid on the canvas. */
function layer(out: Raster, draw: (l: Raster) => void) {
  const l = new Raster(out.w, out.h)
  draw(l)
  outline(l)
  out.blit(l)
}

// --------------------------------------------------------------------------------------------------- fruit

function drawFruit(f: number): Raster {
  const out = new Raster(32, 32)
  const bob = [0, -1, -1, 0][f]
  const cx = 16
  const cy = 19 + bob
  const rx = 10.5
  const ry = 9.6
  // stem and leaf first, so the apple overlaps their roots
  layer(out, (l) => {
    bar(l, [16, cy - ry + 1], [17.5 + (f % 2 ? 0.5 : 0), cy - ry - 4], 2, BARK[1])
    leaf(l, 18, cy - ry - 2, 8, -2 + (f % 2 ? 1 : 0), 2.6)
  })
  layer(out, (l) => {
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const nx = (x + 0.5 - cx) / rx
        const ny = (y + 0.5 - cy) / ry
        const q = nx * nx + ny * ny
        if (q > 1.0001) continue
        // the dimple at the stem and a soft pinch at the bottom
        if (Math.hypot(x + 0.5 - 16, y + 0.5 - (cy - ry + 0.5)) < 2.6) continue
        if (Math.hypot(x + 0.5 - 16, y + 0.5 - (cy + ry)) < 1.6) continue
        l.set(x, y, R.fruitRed[shadeIndex(nx, ny, Math.sqrt(Math.max(0, 1 - q)))])
      }
    // fixed soft highlight and the shine sweeping across
    for (const [x, y] of [
      [10, -3],
      [11, -3],
      [10, -2]
    ])
      l.paint(x + 0, cy + y, R.fruitRed[0])
    const pos = [11, 17, 23, -99][f]
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const u = x + y * 0.5
        if (Math.abs(u - pos - 6) < 1.1 && l.get(x, y) && y < cy + 5) l.set(x, y, R.fruitRed[0])
      }
  })
  if (f === 3) twinkle(out, 10, Math.round(cy - 4), C.white, R.fruitRed[0])
  if (f === 1) out.set(Math.round(cx + 4 - 0), Math.round(cy - 2), C.white)
  return out
}

// ---------------------------------------------------------------------------------------------------- star

const LIGHT_ANGLE = Math.atan2(-0.7, -0.55)

function drawStar(f: number): Raster {
  const out = new Raster(32, 32)
  const w = 0.35 + 0.65 * Math.abs(Math.cos(((f * 60 + 15) * Math.PI) / 180))
  const rot = [0, 0.1, -0.07, 0.12, -0.1, 0.05][f]
  const ro = 13.2
  const ri = 7.4
  const cx = 16
  const cy = 16.6
  const pts: number[] = []
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2
    const rr = i % 2 ? ri : ro
    pts.push(cx + Math.cos(a) * rr * w, cy + Math.sin(a) * rr)
  }
  const mask = new Raster(32, 32)
  mask.poly(pts, 1)
  // rounded points: a plump disc under the star
  mask.ellipse(cx, cy, ri * 0.95 * w, ri * 0.95, 1)
  const l = new Raster(32, 32)
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      if (!mask.get(x, y)) continue
      const dx = (x + 0.5 - cx) / w
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy)
      // each arm is two facets: pick the nearest tip, then which side of its axis
      let ang = Math.atan2(dy, dx) + Math.PI / 2 - rot
      ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const sector = (Math.PI * 2) / 5
      const k = Math.round(ang / sector)
      const delta = ang - k * sector
      const tip = k * sector + rot - Math.PI / 2
      const facet = tip + (delta < 0 ? -0.9 : 0.9)
      const lit = Math.cos(facet - LIGHT_ANGLE)
      let step = lit > 0.55 ? 0 : lit > -0.15 ? 1 : lit > -0.7 ? 2 : 3
      if (d < ri * 0.55) step = d < 2.5 ? 0 : Math.min(step, 1)
      l.set(x, y, GOLD[step])
    }
  outline(l)
  out.blit(l)
  // the twinkle visits a different arm each frame
  const arm = [0, 2, 4, 1, 3, 0][f]
  const a = rot + (arm * (Math.PI * 2)) / 5 - Math.PI / 2
  twinkle(out, Math.round(cx + Math.cos(a) * ri * 1.05 * w), Math.round(cy + Math.sin(a) * ri * 1.05), C.white, C.glow)
  return out
}

// ---------------------------------------------------------------------------------------------------- twig

function drawTwig(f: number): Raster {
  const out = new Raster(32, 32)
  const s = f
  layer(out, (l) => {
    const stick = new Raster(32, 32)
    bar(stick, [6, 27], [20 + s, 11], 3, BARK[1])
    bar(stick, [14, 20], [26, 21 - s], 2, BARK[1])
    bar(stick, [10, 24], [7, 20], 2, BARK[1])
    shadeEdges(stick, BARK, 1, true)
    l.blit(stick)
    // knots
    l.paint(11, 22, BARK[3])
    l.paint(17, 16, BARK[3])
  })
  layer(out, (l) => {
    leaf(l, 20 + s, 11, 5 + s, -7 - s, 2.8)
    leaf(l, 21 + s, 12, 8, -3 + s, 2.6)
    leaf(l, 26, 21 - s, 4, -5 + s * 2, 2.6)
    leaf(l, 26, 21 - s, 5, 3, 2.2)
  })
  return out.shifted(-2, 0)
}

// --------------------------------------------------------------------------------------------------- berry

function drawBerry(f: number): Raster {
  const out = new Raster(32, 32)
  const dy = f
  layer(out, (l) => {
    bar(l, [16, 5], [11, 16 + dy], 1, BARK[1])
    bar(l, [16, 5], [21, 14 + dy], 1, BARK[1])
    leaf(l, 16, 6, 9, -1, 2.4)
    leaf(l, 16, 6, -7, -2, 2.2)
  })
  layer(out, (l) => {
    ball(l, 11, 21 + dy, 6.4, 6.4, R.berry)
    l.rect(10, 15 + dy, 3, 2, LEAF[2])
    l.set(11, 15 + dy, LEAF[0])
  })
  layer(out, (l) => {
    ball(l, 21, 19 + dy, 5.6, 5.6, R.berry)
    l.rect(20, 13 + dy, 3, 2, LEAF[2])
    l.set(21, 13 + dy, LEAF[0])
  })
  if (f) twinkle(out, 8, 18 + dy, C.white, R.berry[0])
  else out.set(8, 18, C.white)
  return out
}

// ---------------------------------------------------------------------------------------------- projectiles

/** An acorn turned by `theta`: the cap sits behind the nut's point. */
function drawSeed(f: number): Raster {
  const out = new Raster(16, 16)
  const theta = (f * Math.PI) / 2 + 0.5
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const l = new Raster(16, 16)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8
      const dy = y + 0.5 - 8
      const u = dx * c + dy * s // along the nut, point at +u
      const v = -dx * s + dy * c
      const nut = ((u - 1.2) / 4.2) ** 2 + (v / 3.3) ** 2 <= 1 && u > -1.6
      const cap = ((u + 2.2) / 3) ** 2 + (v / 3.9) ** 2 <= 1 && u < -0.4
      const nub = u < -4 && u > -5.4 && Math.abs(v) < 0.8
      if (!nut && !cap && !nub) continue
      const shade = shadeIndex(dx / 5, dy / 5, 0.6, false)
      if (cap || nub) {
        const hatch = (Math.round(u * 0.9) + Math.round(v * 0.9)) & 1
        l.set(x, y, nub ? BARK[3] : hatch ? BARK[3] : BARK[2])
      } else l.set(x, y, R.wood[Math.min(2, Math.max(0, shade - 1) + (u > 4 ? 1 : 0))])
    }
  outline(l)
  return out.blit(l)
}

function drawFeather(f: number): Raster {
  const out = new Raster(24, 24)
  const theta = (f * Math.PI) / 2 + 0.45
  const wf = [1, 0.62, 1, 0.62][f]
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const cr = R.crowBlue
  const l = new Raster(24, 24)
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const dx = x + 0.5 - 12
      const dy = y + 0.5 - 12
      const u = dx * c + dy * s
      const v0 = -dx * s + dy * c
      if (u < -10 || u > 10) continue
      const v = v0 - 0.02 * u * u
      const t = (u + 10) / 20
      const half = u < -6.5 ? 0.9 : 4.2 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.17) / 0.83)), 0.65) * wf
      if (Math.abs(v) > Math.max(0.9, half)) continue
      let col: number = cr[1]
      const side = shadeIndex(-s * Math.sign(v), c * Math.sign(v), 0.3, false)
      if (Math.abs(v) < 0.7) col = u < -6 ? cr[0] : cr[0]
      else if (side >= 2) col = cr[2]
      else if (Math.abs(v) < 1.6) col = cr[1]
      // barbs: little notches on the trailing edge
      if (Math.abs(v) > half - 0.9 && Math.round(u) % 3 === 0 && u > -3) col = cr[3]
      l.set(x, y, col)
    }
  outline(l)
  return out.blit(l)
}

function drawStinger(f: number): Raster {
  const out = new Raster(24, 24)
  const wob = f === 0 ? -1 : 1
  const cy = 12 + wob
  // thin motion streaks trailing behind, a different length on each frame
  out.rect(f === 0 ? 2 : 1, cy - 3, f === 0 ? 4 : 6, 1, R.honey[0])
  out.rect(f === 0 ? 1 : 3, cy, f === 0 ? 6 : 3, 1, R.honey[1])
  out.rect(f === 0 ? 3 : 2, cy + 3, f === 0 ? 3 : 5, 1, R.honey[2])
  const l = new Raster(24, 24)
  // barb: a short yellow-and-black banded body with a rounded back end
  for (let x = 7; x <= 14; x++) {
    const round = x === 7 ? 1 : 0
    for (let y = cy - 3 + round; y <= cy + 2 - round; y++) {
      const band = (x >= 9 && x <= 10) || x >= 13
      const base = y === cy - 3 + round ? R.honey[0] : y >= cy + 1 ? R.honey[2] : R.honey[1]
      l.set(x, y, band ? (y === cy - 3 + round ? C.inkWarm : C.black) : base)
    }
  }
  outline(l)
  // needle: tapers to a single dark point (no outline of its own, so it stays sharp)
  l.rect(15, cy - 1, 2, 3, C.black)
  l.rect(17, cy - 1, 3, 2, C.black)
  l.rect(20, cy - 1 + (wob < 0 ? 0 : 1), 2, 1, C.black)
  l.set(22, cy - 1 + (wob < 0 ? 0 : 1), C.black)
  l.set(16, cy - 1, R.dark[1])
  l.set(17, cy - 1, R.dark[1])
  l.set(18, cy - 1, R.dark[2])
  return out.blit(l)
}

function drawOrb(f: number): Raster {
  const out = new Raster(24, 24)
  const r = [5.4, 6.4, 7.4, 6.4][f]
  const cx = 12
  const cy = 12
  const l = new Raster(24, 24)
  // flame wisps lick off the ball and turn a little each frame
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + f * 0.28
    const a0 = a - 0.32
    const a1 = a + 0.32
    const len = r + 2.6 + (i % 2) * 0.8
    l.poly(
      [
        cx + Math.cos(a0) * r * 0.8,
        cy + Math.sin(a0) * r * 0.8,
        cx + Math.cos(a + 0.25) * len,
        cy + Math.sin(a + 0.25) * len,
        cx + Math.cos(a1) * r * 0.8,
        cy + Math.sin(a1) * r * 0.8
      ],
      DARK[2]
    )
  }
  ball(l, cx, cy, r, r, DARK, false)
  l.ellipse(cx, cy, r * 0.62, r * 0.62, DARK[0])
  l.ellipse(cx, cy, r * 0.42, r * 0.42, C.glow)
  l.ellipse(cx - 0.4, cy - 0.4, r * 0.24, r * 0.24, C.white)
  outline(l)
  return out.blit(l)
}

// ------------------------------------------------------------------------------------------ gathering light

/**
 * `gather`: the warning light that forms in front of a boss in the 0.45 s before his shot leaves (to the right). Six
 * frames, each louder than the one before: a bright core with a broken ring of the shot's own light round it from the
 * first frame; the ring closes in and thickens while the core takes the shot's own shape; the last frame (held until
 * the shot leaves) flashes: the shot as good as formed, at the size of its flying sprite, hugged by the ring as a
 * bright aura, a long four-point glint across it. The whole sign is about 24–26 px across from frame 3 on.
 */
const GATHER = 32
const GC = 16

/** The ring per frame: radius, thickness and the share of each arc's slot that is lit (it fills in as it closes). */
const RING_R = [13, 12, 11, 10, 9.5, 9]
const RING_W = [1, 1.2, 1.4, 1.6, 1.8, 2.2]
const RING_FILL = [0.42, 0.47, 0.52, 0.58, 0.66, 0.76]

/**
 * The closing ring: `n` arcs of `light`, each led by a hot head of `hot` (a mote riding in on it), turning a little
 * each frame, with the material's dark outline round them. On frame 5 the arcs burn hot along half their length.
 */
function ring(out: Raster, f: number, n: number, light: number, hot: number) {
  const r = RING_R[f]
  const w = RING_W[f] / 2 + 0.25
  const fill = RING_FILL[f]
  const slot = (Math.PI * 2) / n
  const turn = 0.3 + f * 0.42
  layer(out, (l) => {
    for (let y = 0; y < GATHER; y++)
      for (let x = 0; x < GATHER; x++) {
        const dx = x + 0.5 - GC
        const dy = y + 0.5 - GC
        const off = Math.abs(Math.hypot(dx, dy) - r)
        const a = Math.atan2(dy, dx) - turn
        const pos = (((a % slot) + slot) % slot) / slot
        if (pos > fill) continue
        const head = pos > fill - 0.1
        // the head is a fatter mote; the tail a line of light
        if (off > (head && f < 5 ? w + 0.6 : w)) continue
        l.set(x, y, head || (f === 5 && pos > fill * 0.4) ? hot : light)
      }
  })
}

/** The core of the first two frames: a white plus with arms of `light` (frame 0), a 3x3 white heart (frame 1). */
function core(out: Raster, f: number, light: number) {
  layer(out, (l) => {
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ])
      l.set(GC + dx, GC - 1 + dy, C.white)
    if (f === 1)
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ])
        l.set(GC + dx, GC - 1 + dy, C.white)
    for (const [dx, dy] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2]
    ])
      l.set(GC + dx, GC - 1 + dy, light)
    if (f === 1)
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ])
        l.set(GC + dx * 2, GC - 1 + dy * 2, light)
  })
}

/**
 * The "ready" flash: a four-point glint laid across the shot, arms of `len` px (white, their last pixels `tip`), with
 * no outline of its own so the shot shows through between its arms.
 */
function flash(out: Raster, x: number, y: number, len: number, tip: number) {
  out.set(x, y, C.white)
  for (let k = 1; k <= len; k++) {
    const col = k <= len - 2 ? C.white : tip
    out.set(x - k, y, col)
    out.set(x + k, y, col)
    out.set(x, y - k, col)
    out.set(x, y + k, col)
  }
  // a small heart of light round the crossing
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ])
    out.set(x + dx, y + dy, tip)
}

/** The dark-fire ball of `drawOrb` at radius `r`, centred in the gather cell, its tongues `tongues` long (0..1). */
function orbBall(out: Raster, r: number, tongues: number, turn: number) {
  const l = new Raster(GATHER, GATHER)
  const c = GC
  if (tongues > 0)
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + turn
      const len = r + (2.6 + (i % 2) * 0.8) * tongues
      l.poly(
        [
          c + Math.cos(a - 0.32) * r * 0.8,
          c + Math.sin(a - 0.32) * r * 0.8,
          c + Math.cos(a + 0.25) * len,
          c + Math.sin(a + 0.25) * len,
          c + Math.cos(a + 0.32) * r * 0.8,
          c + Math.sin(a + 0.32) * r * 0.8
        ],
        DARK[2]
      )
    }
  ball(l, c, c, r, r, DARK, false)
  l.ellipse(c, c, r * 0.62, r * 0.62, DARK[0])
  l.ellipse(c, c, r * 0.42, r * 0.42, C.glow)
  l.ellipse(c - 0.4, c - 0.4, Math.max(0.6, r * 0.24), Math.max(0.6, r * 0.24), C.white)
  outline(l)
  out.blit(l)
}

/** きつね旋風 / 黒ハム王: a violet ring closes on a white-hot core that swells into the ball of dark fire. */
function drawOrbGather(f: number): Raster {
  const out = new Raster(GATHER, GATHER)
  ring(out, f, 5, DARK[0], C.white)
  if (f < 2) core(out, f, DARK[0])
  else orbBall(out, [0, 0, 3.4, 4.2, 4.8, 5.4][f], [0, 0, 0.2, 0.5, 0.8, 1][f], f * 0.28)
  if (f === 5) flash(out, GC, GC - 1, 7, DARK[0])
  return out
}

/**
 * The bee's barb of `drawStinger` in the gather cell, its body grown to `cols` columns from the back (1..8) and its
 * needle to `needle` pixels (0..8), at rest (no wobble, no motion streaks).
 */
function stingerBarb(out: Raster, cols: number, needle: number) {
  const ox = 2
  const cy = 16
  const l = new Raster(GATHER, GATHER)
  for (let x = 7; x < 7 + cols; x++) {
    const round = x === 7 ? 1 : 0
    for (let y = cy - 3 + round; y <= cy + 2 - round; y++) {
      const band = (x >= 9 && x <= 10) || x >= 13
      const base = y === cy - 3 + round ? R.honey[0] : y >= cy + 1 ? R.honey[2] : R.honey[1]
      l.set(x + ox, y, band ? (y === cy - 3 + round ? C.inkWarm : C.black) : base)
    }
  }
  outline(l)
  if (needle > 0) {
    l.rect(15 + ox, cy - 1, Math.min(2, needle), 3, C.black)
    if (needle > 2) l.rect(17 + ox, cy - 1, Math.min(3, needle - 2), 2, C.black)
    if (needle > 5) l.rect(20 + ox, cy, Math.min(2, needle - 5), 1, C.black)
    if (needle > 7) l.set(22 + ox, cy, C.black)
    l.set(16 + ox, cy - 1, R.dark[1])
    if (needle > 2) l.set(17 + ox, cy - 1, R.dark[1])
    if (needle > 3) l.set(18 + ox, cy - 1, R.dark[2])
  }
  out.blit(l)
}

/** ハチ女王: a ring of gold dust closes on a glowing grain, then the banded barb forms and grows its needle. */
function drawStingerGather(f: number): Raster {
  const out = new Raster(GATHER, GATHER)
  ring(out, f, 6, R.honey[0], C.white)
  if (f < 2) core(out, f, R.honey[0])
  else if (f === 2)
    layer(out, (l) => {
      // a grain of gold the size of the barb's back end, hot in the middle
      l.ellipse(GC, GC - 0.5, 3.2, 2.6, R.honey[1])
      l.ellipse(GC - 0.5, GC - 1, 2, 1.5, R.honey[0])
      l.rect(GC - 1, GC - 2, 2, 2, C.white)
    })
  else stingerBarb(out, [0, 0, 0, 7, 8, 8][f], [0, 0, 0, 0, 5, 8][f])
  if (f === 3) out.set(GC - 3, GC - 2, C.white)
  if (f === 5) flash(out, GC - 1, GC - 1, 7, R.honey[0])
  return out
}

/** The crow's feather of `drawFeather`, held upright-forward (its tip up and to the right), `k` times its length. */
function featherAt(out: Raster, k: number) {
  const theta = -1.05
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const cr = R.crowBlue
  const l = new Raster(GATHER, GATHER)
  for (let y = 0; y < GATHER; y++)
    for (let x = 0; x < GATHER; x++) {
      const dx = x + 0.5 - GC
      const dy = y + 0.5 - GC
      const u = (dx * c + dy * s) / k
      const v0 = (-dx * s + dy * c) / Math.max(0.7, k)
      if (u < -10 || u > 10) continue
      const v = v0 - 0.02 * u * u
      const t = (u + 10) / 20
      const half = u < -6.5 ? 0.9 : 4.2 * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.17) / 0.83)), 0.65)
      if (Math.abs(v) > Math.max(0.9, half)) continue
      let col: number = cr[1]
      const side = shadeIndex(-s * Math.sign(v), c * Math.sign(v), 0.3, false)
      if (Math.abs(v) < 0.7) col = cr[0]
      else if (side >= 2) col = cr[2]
      if (Math.abs(v) > half - 0.9 && Math.round(u) % 3 === 0 && u > -3 && k > 0.7) col = cr[3]
      l.set(x, y, col)
    }
  outline(l)
  out.blit(l)
}

/** カラス助: a ring of pale wind closes round a white core, and the dark feather forms upright inside it. */
function drawFeatherGather(f: number): Raster {
  const out = new Raster(GATHER, GATHER)
  ring(out, f, 4, R.cloud[2], C.white)
  if (f < 2) core(out, f, R.cloud[2])
  else featherAt(out, [0, 0, 0.5, 0.7, 0.85, 1][f])
  if (f === 5) flash(out, GC, GC - 1, 7, R.cloud[2])
  return out
}

function drawShock(f: number): Raster {
  const out = new Raster(48, 32)
  // The crest rolls forward: the curl tip travels over the top while the whole wave creeps right.
  const cx = 21 + f * 1.5
  const ry = [16, 18, 19, 17][f]
  const rx = [12.5, 13.5, 14, 13][f]
  const ox = [6, 5, 4, 5][f]
  const iy = [-1, -1, 0, -1][f]
  const l = new Raster(48, 32)
  const crest = (x: number, y: number) => {
    const nx = (x + 0.5 - cx) / rx
    const ny = (y + 0.5 - 30) / ry
    return nx * nx + ny * ny
  }
  const hollow = (x: number, y: number) => {
    const nx = (x + 0.5 - (cx + ox)) / (rx - 4.5)
    const ny = (y + 0.5 - (31 + iy)) / (ry - 7)
    return nx * nx + ny * ny
  }
  // dust slope trailing behind the crest, low and long
  const slope = (x: number) => 29 - 10 * Math.min(1, Math.exp(-(cx - rx * 0.6 - x) / 9)) - ((f + (x >> 2)) % 2)
  for (let y = 0; y <= 29; y++)
    for (let x = 0; x < 48; x++) {
      const q = crest(x, y)
      const inCrest = q <= 1 && hollow(x, y) > 1
      const inSlope = x < cx && y >= slope(x) && x >= 2
      if (!inCrest && !inSlope) continue
      let col: number = R.dust[1]
      const depth = inCrest ? 1 - Math.sqrt(q) : 0.3
      const rim = inCrest ? Math.sqrt(hollow(x, y)) - 1 : 1
      if (inCrest && rim < 0.07) col = C.white
      else if (inCrest && rim < 0.16) col = R.gold[1]
      else if (depth < 0.1) col = y < 21 ? R.dust[0] : R.dust[2]
      else if (y > 27) col = R.dust[3]
      else if (depth < 0.2 || y > 23) col = R.dust[2]
      l.set(x, y, col)
    }
  outline(l)
  out.blit(l)
  // stones thrown up ahead of the crest, tumbling along an arc as the frames roll
  const stones: [number, number, number][] = [
    [0, 4, 3],
    [3, 7, 2],
    [6, 2, 2]
  ]
  stones.forEach(([dx, dy, s], i) => {
    const ph = (f + i) % 4
    const sx = Math.min(42, Math.round(cx + rx + 1 + dx + ph * 1.5))
    const sy = 22 - dy - [0, 3, 4, 2][ph]
    out.rect(sx, sy, s, s, R.rock[1])
    out.set(sx, sy, R.rock[0])
    out.rect(sx, sy + s, s, 1, R.rock[3])
    out.set(sx + s, sy + s - 1, R.rock[3])
  })
  // dust blown off the top of the crest
  twinkle(out, Math.round(cx + 2 + f), 9 + ((f * 2) % 3), C.white, R.dust[0])
  return out
}

/**
 * The same wave torn free of the ground (it has run off a ledge): the crest and its bright rim fly on as a crescent,
 * the base and the dust slope are gone, and the lower edge frays into streaks and crumbs of grit that trail back and
 * fall away. The crest keeps the shape, place and breathing of `roll`; nothing is painted on rows 30 and 31.
 */
function drawShockFly(f: number): Raster {
  const out = new Raster(48, 32)
  const cx = 21 + f * 1.5
  const ry = [16, 18, 19, 17][f]
  const rx = [12.5, 13.5, 14, 13][f]
  const ox = [6, 5, 4, 5][f]
  const iy = [-1, -1, 0, -1][f]
  const crest = (x: number, y: number) => {
    const nx = (x + 0.5 - cx) / rx
    const ny = (y + 0.5 - 30) / ry
    return nx * nx + ny * ny
  }
  const hollow = (x: number, y: number) => {
    const nx = (x + 0.5 - (cx + ox)) / (rx - 4.5)
    const ny = (y + 0.5 - (31 + iy)) / (ry - 7)
    return nx * nx + ny * ny
  }
  // the torn underside: high at the back of the crest, sloping down to the curl, ragged in steps that move back
  const back = cx - rx
  const tear = (x: number) => Math.min(27, 18 + (x - back) * 0.6) + [0, 1.5, 0.5, 2][(x + f * 2 + 64) % 4]
  const l = new Raster(48, 32)
  for (let y = 0; y <= 27; y++)
    for (let x = 0; x < 48; x++) {
      const q = crest(x, y)
      if (q > 1 || hollow(x, y) <= 1 || y >= tear(x)) continue
      let col: number = R.dust[1]
      const depth = 1 - Math.sqrt(q)
      const rim = Math.sqrt(hollow(x, y)) - 1
      if (rim < 0.07) col = C.white
      else if (rim < 0.16) col = R.gold[1]
      else if (depth < 0.1) col = y < 21 ? R.dust[0] : R.dust[2]
      else if (depth < 0.2 || y > 23) col = R.dust[2]
      l.set(x, y, col)
    }
  // streaks of dust peeling off the underside and trailing back and down (a slant, never a level line), each a beat
  // apart so the loop has no seam
  const streaks: [number, number, number][] = [
    [1, 19, 7],
    [4, 21, 6],
    [7, 23, 5]
  ]
  streaks.forEach(([dx, y0, len], i) => {
    const ph = (f + i) % 4
    const x1 = Math.round(back + dx - ph * 2)
    const n = len - ph
    for (let k = 0; k < n; k++) l.set(x1 - k, Math.min(27, y0 + ph + (k >> 1)), k < 2 ? R.dust[1] : R.dust[2])
  })
  outline(l)
  out.blit(l)
  // crumbs of grit dropping out of the torn edge, back and down
  const crumbs: [number, number][] = [
    [-1, 23],
    [4, 24]
  ]
  crumbs.forEach(([dx, y0], i) => {
    const ph = (f + i * 2) % 4
    const sx = Math.max(1, Math.round(back + dx - ph * 2))
    const sy = Math.min(28, y0 + Math.round(ph * 1.5))
    out.rect(sx, sy, 2, 2, R.rock[1])
    out.set(sx, sy, R.rock[0])
    out.set(sx + 1, sy + 1, R.rock[3])
  })
  // dust blown off the top of the crest, as in `roll`
  twinkle(out, Math.round(cx + 2 + f), 9 + ((f * 2) % 3), C.white, R.dust[0])
  return out
}

function wing(l: Raster, x: number, y: number, dx: number, dy: number, w: number) {
  const n = Math.hypot(dx, dy) || 1
  const nx = (-dy / n) * w
  const ny = (dx / n) * w
  const pts = [x, y, x + dx * 0.5 + nx, y + dy * 0.5 + ny, x + dx, y + dy, x + dx * 0.5 - nx, y + dy * 0.5 - ny]
  l.poly(pts, R.cloud[2])
  l.poly(
    [x + dx * 0.1, y + dy * 0.1, x + dx * 0.5 + nx * 0.6, y + dy * 0.5 + ny * 0.6, x + dx * 0.85, y + dy * 0.85],
    R.cloud[0]
  )
}

function drawBee(f: number): Raster {
  const out = new Raster(24, 24)
  const wings = new Raster(24, 24)
  // blurred wings: up on one frame, flat and wide on the next
  if (f === 0) {
    wing(wings, 10, 10, -5, -7, 2.4)
    wing(wings, 14, 10, 3, -8, 2.4)
  } else {
    wing(wings, 9, 11, -7, -2, 2)
    wing(wings, 14, 11, 7, -3, 2)
  }
  out.blit(wings)
  layer(out, (l) => {
    l.poly([3, 14, 6.5, 12.5, 6.5, 15.5], DARK[3])
    ball(l, 12, 14, 7, 5.6, R.honey)
    for (const x0 of [9, 13]) for (let y = 8; y < 21; y++) for (let x = x0; x < x0 + 2; x++) l.paint(x, y, C.inkWarm)
    l.rect(17, 11, 2, 3, C.black)
    l.set(17, 11, C.white)
    l.set(15, 16, C.blush)
    l.set(16, 16, C.blush)
  })
  out.set(18, 8, C.inkWarm)
  out.set(19, 7, C.inkWarm)
  return out
}

export const sheets: SheetModule = {
  'prop:fruit': () => ({ idle: lazyAnim(() => [0, 1, 2, 3].map(drawFruit), 8, true) }),
  'prop:star': () => ({ idle: lazyAnim(() => [0, 1, 2, 3, 4, 5].map(drawStar), 10, true) }),
  'prop:twig': () => ({ idle: lazyAnim(() => [drawTwig(0), drawTwig(1)], 3, true) }),
  'prop:berry': () => ({ idle: lazyAnim(() => [drawBerry(0), drawBerry(1)], 3, true) }),
  'prop:seed': () => ({ spin: lazyAnim(() => [0, 1, 2, 3].map(drawSeed), 14, true) }),
  'prop:feather': () => ({
    spin: lazyAnim(() => [0, 1, 2, 3].map(drawFeather), 14, true),
    gather: lazyAnim(() => [0, 1, 2, 3, 4, 5].map(drawFeatherGather), 14, false)
  }),
  'prop:stinger': () => ({
    fly: lazyAnim(() => [drawStinger(0), drawStinger(1)], 14, true),
    gather: lazyAnim(() => [0, 1, 2, 3, 4, 5].map(drawStingerGather), 14, false)
  }),
  'prop:orb': () => ({
    pulse: lazyAnim(() => [0, 1, 2, 3].map(drawOrb), 12, true),
    gather: lazyAnim(() => [0, 1, 2, 3, 4, 5].map(drawOrbGather), 14, false)
  }),
  'prop:shock': () => ({
    roll: lazyAnim(() => [0, 1, 2, 3].map(drawShock), 14, true, { anchor: [24, 30] }),
    fly: lazyAnim(() => [0, 1, 2, 3].map(drawShockFly), 14, true, { anchor: [24, 30] })
  }),
  'prop:bee': () => ({ fly: lazyAnim(() => [drawBee(0), drawBee(1)], 24, true) })
}
