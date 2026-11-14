/**
 * `prop:pipe`, `prop:hive`, `prop:animal`, `prop:rock`: the gimmicks the hero bites.
 *
 * Each one has to say what it is and what happens when it is bitten: a pipe that drips (and sprays when bitten), a
 * hive on a rope that sways (and splits), a sleeping boar piglet (that jumps up angry), a faceted boulder (that
 * cracks). Parts are assembled with the Painter like the cast; the animated ones are pose-parametric.
 */
import type { SheetModule } from '../../module'
import { lag } from '../../motion'
import { C, R, ramp } from '../../palette'
import { Painter, Raster, ball, bar, farRamp, noiseAt, outline, rng, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  cel,
  egg,
  fill,
  joint,
  mantle,
  oval,
  polygon,
  ribbon,
  shadow,
  smooth,
  spline,
  stampAt,
  tint,
  union,
  within,
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'
import { cyl, puff } from './trees'

const PIPE = R.pipe
const WATER = R.water
const HONEY = R.honey
const WOOD = R.wood
const ROCK = R.rock
const LEAF = R.leaf
const LEAF_FAR = farRamp(R.leaf)

// ------------------------------------------------------------------------------------------------------ pipe

type PipeMode = 'idle' | 'burst' | 'done'

/** The torn hole in the pipe wall: dark inside, bright torn lip, two bent metal petals. */
function pipeHole(l: Raster, dx: number) {
  const pts = [35, 40, 40, 38, 44, 41, 46, 47, 43, 52, 45, 56, 39, 55, 36, 51, 34, 46].map((v, i) =>
    i % 2 ? v : v + dx
  )
  const hole = new Raster(64, 64).poly(pts, 1)
  const keep = l.clone()
  // lip: one pixel ring around the hole, lit on top/left, dark on bottom/right
  for (let y = 34; y < 60; y++)
    for (let x = 28; x < 56; x++) {
      if (hole.get(x, y) || !keep.get(x, y)) continue
      const touch = hole.get(x + 1, y) || hole.get(x, y + 1)
      const touchLit = hole.get(x - 1, y) || hole.get(x, y - 1)
      if (touch) l.set(x, y, PIPE[0])
      else if (touchLit) l.set(x, y, PIPE[3])
    }
  for (let y = 34; y < 60; y++)
    for (let x = 28; x < 56; x++) {
      if (!hole.get(x, y)) continue
      const deep = hole.get(x - 1, y) && hole.get(x, y - 1) && hole.get(x + 1, y + 1)
      l.set(x, y, deep ? C.black : PIPE[4])
    }
  // dark rim shadow inside the hole's lower right
  for (let y = 40; y < 56; y++) if (hole.get(41 + dx, y) && !hole.get(42 + dx, y - 1)) l.set(41 + dx, y, PIPE[3])
}

function petals(l: Raster, dx: number) {
  l.poly([44 + dx, 40, 48 + dx, 38, 48 + dx, 42, 45 + dx, 44], PIPE[1])
  l.line(44 + dx, 40, 48 + dx, 38, PIPE[0])
  l.poly([44 + dx, 52, 48 + dx, 53, 48 + dx, 57, 45 + dx, 55], PIPE[2])
  l.line(44 + dx, 52, 48 + dx, 53, PIPE[1])
}

function flange(l: Raster, x0: number, x1: number, y0: number, y1: number) {
  const h = y1 - y0 + 1
  for (let y = y0; y <= y1; y++) {
    const v = (y - y0) / (h - 1)
    const c = v < 0.2 ? PIPE[0] : v < 0.55 ? PIPE[1] : v < 0.82 ? PIPE[2] : PIPE[3]
    for (let x = x0; x <= x1; x++) {
      if ((y === y0 || y === y1) && (x === x0 || x === x1)) continue
      l.set(x, y, x === x0 && v > 0.2 ? PIPE[1] : x === x1 ? PIPE[3] : c)
    }
  }
  // bolts
  const cy = Math.floor((y0 + y1) / 2)
  for (const x of [x0 + 3, Math.round((x0 + x1) / 2) - 1, x1 - 4]) {
    l.set(x, cy - 1, PIPE[0])
    l.set(x + 1, cy - 1, PIPE[1])
    l.set(x, cy, PIPE[1])
    l.set(x + 1, cy, PIPE[3])
  }
}

function drawPipe(mode: PipeMode, dx: number, drip: 'bead' | 'fall' | 'none', spray: number): Raster {
  const g = new Painter(64, 64)
  const hole = mode !== 'idle'
  if (mode === 'burst') {
    // puddle behind the base flange, rippling
    g.add(
      -2,
      (l) => {
        l.ellipse(32, 61.5, 29, 2.6, WATER[2])
        l.ellipse(32, 61, 27, 1.8, WATER[1])
        for (let k = 0; k < 4; k++) l.rect(6 + ((k * 14 + spray * 4) % 52), 60, 5, 1, WATER[0])
      },
      false
    )
  }
  g.add(0, (l) => {
    for (let y = 6; y <= 63; y++) for (let x = 20; x < 44; x++) l.set(x + dx, y, PIPE[cyl((x + 0.5 - 32) / 12)])
    // welded seams
    for (const y of [17, 45]) {
      l.rect(20 + dx, y, 24, 1, PIPE[2])
      l.rect(20 + dx, y + 1, 24, 1, PIPE[0])
      l.rect(43 + dx, y, 1, 2, PIPE[3])
    }
    // streaks under the middle joint: a stain that says "leaks here"
    l.rect(24 + dx, 35, 2, 10, PIPE[2])
    l.rect(24 + dx, 35, 1, 8, PIPE[3])
    l.rect(31 + dx, 35, 2, 6, PIPE[2])
    if (drip !== 'none' || mode === 'idle') l.rect(38 + dx, 35, 1, 5, WATER[1])
    if (hole) {
      pipeHole(l, dx)
    }
  })
  g.add(1, (l) => flange(l, 14 + dx, 50 + dx, 5, 12))
  g.add(1, (l) => flange(l, 15 + dx, 49 + dx, 28, 34))
  g.add(1, (l) => flange(l, 13 + dx, 51 + dx, 55, 63))
  if (hole) g.add(1, (l) => petals(l, dx))
  if (mode === 'done') {
    // dry stain: rust and darkened teal running down from the hole and across the base flange
    g.add(
      2,
      (l) => {
        // wet-dark streaks running down from the hole over the wall and the base flange
        for (const [x, y0, len] of [
          [36, 56, 7],
          [39, 57, 6],
          [42, 56, 7]
        ] as const) {
          l.rect(x, y0, 2, len, PIPE[3])
          l.rect(x, y0, 1, len - 1, PIPE[4])
        }
        l.poly([33, 41, 36, 41, 35, 55, 32, 50], PIPE[3])
        l.rect(34, 44, 1, 7, PIPE[4])
        l.rect(47, 58, 3, 2, R.bark[2])
        l.rect(46, 59, 2, 1, R.bark[3])
      },
      false
    )
  }
  if (drip === 'bead') g.add(3, (l) => drop(l, 38 + dx, 40, 3))
  if (drip === 'fall') {
    g.add(3, (l) => drop(l, 38 + dx, 41, 2))
    g.add(3, (l) => drop(l, 38 + dx, 49, 3))
  }
  if (mode === 'burst') g.add(4, (l) => sprayArt(l, spray, dx), false)
  return g.render()
}

/** A teardrop of water, `h` rows tall. */
function drop(l: Raster, x: number, y: number, h: number) {
  l.rect(x, y, 2, h, WATER[1])
  l.set(x, y, WATER[0])
  l.set(x + 1, y + h - 1, WATER[2])
  l.set(x, y + h, WATER[2])
}

/** Water leaving the pipe: a jet out of the hole to the right, a fountain at the top and drops raining down. */
function sprayArt(l: Raster, phase: number, dx: number) {
  const stream = (x0: number, y0: number, dir: number, vy: number, g: number, len: number, thick: number) => {
    for (let s = 0; s < len; s++) {
      const gap = (s + phase * 3) % 8 >= 6
      const x = x0 + dir * s
      const y = Math.round(y0 + vy * s + g * s * s)
      const t = Math.max(1, Math.round(thick * (1 - (s / len) * 0.55)))
      if (gap && s > 4) continue
      l.rect(x, y - Math.floor(t / 2), 1, t, WATER[1])
      l.set(x, y - Math.floor(t / 2), WATER[0])
      if (t > 1) l.set(x, y - Math.floor(t / 2) + t - 1, WATER[2])
    }
  }
  stream(48 + dx, 46, 1, -0.4, 0.05, 17, 5)
  stream(48 + dx, 51, 1, -0.12, 0.045, 12, 3)
  stream(30 + dx, 38, -1, -0.2, 0.05, 6, 2)
  // flying drops that break off the jet
  for (let k = 0; k < 4; k++) {
    const s = (k * 5 + phase * 3) % 20
    const x = 47 + s + dx
    const y = Math.round(46 - 0.34 * s + 0.05 * s * s) + (k % 2 ? -3 : 3)
    if (x < 62) {
      l.rect(x, y, 2, 2, WATER[1])
      l.set(x, y, WATER[0])
    }
  }
  // fountain from the top flange
  const wide = phase % 2 ? 7 : 6
  l.rect(32 - Math.floor(wide / 2) + dx, 0, wide, 5, WATER[1])
  l.rect(32 - Math.floor(wide / 2) + dx, 0, 2, 5, WATER[0])
  l.rect(32 + Math.floor(wide / 2) - 1 + dx, 0, 1, 5, WATER[2])
  for (let k = 0; k < 8; k++) {
    const t = ((phase * 0.25 + k / 8) % 1) as number
    const side = k % 2 ? 1 : -1
    const x = Math.round(32 + side * (3 + 17 * t * (0.6 + (k % 3) * 0.25))) + dx
    const y = Math.round(3 + (-6 + 24 * t) * t)
    l.rect(x, y, 2, 2, t > 0.7 ? WATER[2] : WATER[1])
    l.set(x, y, WATER[0])
  }
}

const pipeClips = () => ({
  idle: () => [drawPipe('idle', 0, 'bead', 0), drawPipe('idle', 0, 'fall', 0)],
  burst: () => [0, 1, 2, 3].map((i) => drawPipe('burst', [1, -1, 1, -1][i], 'none', i)),
  done: () => [drawPipe('done', 0, 'none', 0)]
})

// ------------------------------------------------------------------------------------------------------ hive

const ROPE = [WOOD[0], WOOD[1], WOOD[2], WOOD[3]]

interface Tier {
  y: number
  rx: number
  ry: number
}
const TIERS: Tier[] = [
  { y: 19, rx: 8, ry: 5 },
  { y: 25, rx: 12, ry: 5.5 },
  { y: 32, rx: 15.5, ry: 6 },
  { y: 39, rx: 17, ry: 6 },
  { y: 46, rx: 16, ry: 6 },
  { y: 52, rx: 12, ry: 5 }
]

const lean = (y: number, amount: number) => Math.round(32 + amount * Math.min(1, y / 56))

function ropeAndKnot(l: Raster, amount: number) {
  for (let y = 0; y < 16; y++) {
    const x = lean(y, amount * 0.5)
    const c = y % 4 < 2 ? ROPE[1] : ROPE[2]
    l.set(x, y, y % 4 < 2 ? ROPE[0] : ROPE[1])
    l.set(x + 1, y, c === ROPE[1] ? ROPE[2] : ROPE[3])
  }
  // the turns wrapped round the hook
  for (const y of [2, 4]) {
    l.rect(29, y, 6, 1, ROPE[1])
    l.rect(29, y, 6, 1, ROPE[1])
    l.set(29, y, ROPE[0])
    l.set(34, y, ROPE[3])
  }
  l.rect(30, 3, 4, 1, ROPE[2])
}

function drawHive(amount: number, drip: number, falling: number): Raster {
  const g = new Painter(64, 64)
  g.add(0, (l) => ropeAndKnot(l, amount))
  TIERS.forEach((t, i) => {
    g.add(1 + (TIERS.length - i), (l) => {
      const cx = lean(t.y, amount)
      ball(l, cx, t.y, t.rx, t.ry, HONEY)
      // straw twist on the coil
      for (let x = Math.ceil(cx - t.rx + 3); x < cx + t.rx - 2; x += 5) l.paint(x, t.y + 1, HONEY[2])
    })
  })
  // entrance hole, with a lit lip
  g.add(
    9,
    (l) => {
      const cx = lean(46, amount) + 3
      l.ellipse(cx, 46, 5, 4, HONEY[3])
      l.ellipse(cx, 46.5, 4, 3.2, C.inkWarm)
      l.ellipse(cx - 0.5, 47, 2.4, 2, C.black)
      l.rect(cx - 4, 50, 8, 1, HONEY[0])
    },
    false
  )
  // honey bead on the lowest coil and a drip that grows, lets go and falls
  g.add(
    10,
    (l) => {
      const cx = lean(55, amount) - 7
      l.rect(cx, 55, 3, 1, HONEY[1])
      if (drip > 0) {
        l.rect(cx + 1, 56, 2, drip, HONEY[1])
        l.rect(cx + 1, 56, 1, drip, HONEY[0])
        l.rect(cx, 56 + drip, 3, 2, HONEY[1])
        l.set(cx, 56 + drip, HONEY[0])
        l.set(cx + 2, 57 + drip, HONEY[2])
      }
      if (falling > 0) {
        l.rect(cx + 1, 56 + falling, 2, 3, HONEY[1])
        l.set(cx + 1, 56 + falling, HONEY[0])
        l.set(cx + 2, 58 + falling, HONEY[2])
      }
    },
    false
  )
  // honey glaze on the upper left of the shell
  g.add(
    9,
    (l) => {
      const cx = lean(35, amount)
      l.rect(cx - 12, 33, 3, 1, HONEY[0])
      l.rect(cx - 13, 40, 3, 1, HONEY[0])
    },
    false
  )
  return g.render()
}

/** The split hive: top coils intact on the rope, the lower shell flopped open, honey running out. */
function drawBrokenHive(): Raster {
  const out = new Raster(64, 64)
  const top = new Painter(64, 64)
  top.add(0, (l) => ropeAndKnot(l, 0))
  TIERS.slice(0, 3)
    .reverse()
    .forEach((t) => top.add(1, (l) => ball(l, 32, t.y, t.rx, t.ry, HONEY)))
  const lower = new Painter(64, 64)
  TIERS.slice(3)
    .reverse()
    .forEach((t) => lower.add(1, (l) => ball(l, 32, t.y, t.rx, t.ry, HONEY)))
  const shell = lower.render()
  // the crack runs jaggedly down the middle
  const zig = (y: number) => [0, -2, 1, -1, 2, 0, -2, 1][(y - 30) % 8]
  const left = new Raster(64, 64)
  const right = new Raster(64, 64)
  for (let y = 30; y < 62; y++)
    for (let x = 0; x < 64; x++) {
      const c = shell.get(x, y)
      if (!c) continue
      const cut = 32 + zig(y)
      const k = (y - 30) / 24
      if (x <= cut) left.set(x - 4 - Math.round(k * 2), y + Math.round(k * 2), c)
      else right.set(x + 4 + Math.round(k * 2), y + Math.round(k * 2), c)
    }
  // dark hollow with comb between the halves
  const hollow = new Raster(64, 64)
  hollow.poly([22, 31, 42, 31, 46, 52, 40, 58, 24, 58, 18, 52], C.inkWarm)
  hollow.poly([27, 36, 38, 36, 40, 50, 36, 54, 27, 54, 24, 49], HONEY[3])
  for (const [x, y] of [
    [28, 40],
    [33, 44],
    [28, 48],
    [35, 50]
  ])
    hollow.rect(x, y, 3, 2, HONEY[2])
  outline(left)
  outline(right)
  outline(hollow)
  out.blit(hollow)
  out.blit(left)
  out.blit(right)
  out.blit(top.render())
  // honey: glaze along the crack, strands pouring out of the bottom
  for (const [x, y0, len] of [
    [27, 52, 9],
    [32, 54, 6],
    [37, 53, 10]
  ] as const) {
    out.rect(x, y0, 3, len, HONEY[1])
    out.rect(x, y0, 1, len, HONEY[0])
    out.rect(x + 2, y0 + 2, 1, len - 2, HONEY[2])
    out.rect(x - 1, y0 + len, 5, 2, HONEY[1])
    out.set(x - 1, y0 + len, HONEY[0])
    out.set(x + 3, y0 + len + 1, HONEY[2])
  }
  for (let y = 31; y < 54; y += 4) {
    out.rect(25 + zig(y), y, 2, 2, HONEY[0])
    out.rect(38 + zig(y), y + 1, 2, 2, HONEY[0])
  }
  return out
}

const POLE = [WOOD[3], WOOD[0], WOOD[0], WOOD[1], WOOD[1], WOOD[1], WOOD[2], WOOD[3], WOOD[4]]

/** The tileable pole: rows 0 and 63 are identical so poles join seamlessly. */
function drawPole(arm: boolean): Raster {
  const l = new Raster(64, 64)
  for (let y = 0; y < 64; y++) for (let i = 0; i < 9; i++) l.set(50 + i, y, POLE[i])
  // grain: darker dashes that never touch the end rows
  for (const [i, y0, len] of [
    [3, 6, 7],
    [5, 15, 5],
    [4, 24, 9],
    [6, 34, 6],
    [3, 43, 8],
    [5, 52, 6],
    [2, 58, 3]
  ] as const)
    for (let k = 0; k < len; k++) l.set(50 + i, y0 + k, i === 6 ? WOOD[3] : WOOD[2])
  // an iron nail
  l.rect(53, 29, 2, 2, R.steel[1])
  l.set(53, 29, R.steel[0])
  l.set(54, 30, R.steel[2])
  if (!arm) return l
  const g = new Painter(64, 64)
  g.add(0, (b) => {
    for (let y = 2; y <= 9; y++) {
      const c = [WOOD[3], WOOD[0], WOOD[0], WOOD[1], WOOD[1], WOOD[2], WOOD[2], WOOD[3]][y - 2]
      for (let x = 30; x <= 51; x++) b.set(x, y, c)
    }
    // rounded tip and end grain
    b.rect(29, 3, 1, 6, WOOD[1])
    b.rect(30, 2, 1, 1, 0)
    b.ellipse(31, 6, 2, 3, WOOD[0])
  })
  g.add(-1, (b) => bar(b, [51, 28], [38, 10], 4, WOOD[2]))
  g.add(2, (b) => {
    // iron eye the rope hangs from, and a strap where the beam meets the pole
    b.ring(32.5, 11.5, 2, 3.4, R.steel[1])
    b.rect(30, 9, 5, 1, R.steel[2])
    b.rect(45, 1, 4, 10, R.steel[1])
    b.rect(45, 1, 1, 10, R.steel[0])
    b.rect(48, 1, 1, 10, R.steel[2])
    b.set(46, 3, C.white)
    b.set(46, 8, C.white)
  })
  const beam = g.render()
  const out = new Raster(64, 64)
  out.blit(beam)
  // pole over the beam end, restore the pole pixels
  for (let y = 0; y < 64; y++)
    for (let i = 0; i < 9; i++) if (!(y >= 1 && y <= 10 && i < 0)) out.set(50 + i, y, l.get(50 + i, y))
  return out
}

const hiveClips = () => {
  const amounts = [1.8, 2.8, -1.8, -2.8]
  const drips = [2, 4, 1, 3]
  const falling = [0, 0, 5, 0]
  return {
    idle: () => amounts.map((a, i) => drawHive(Math.round(a), drips[i], falling[i])),
    broken: () => [drawBrokenHive()],
    post: () => [drawPole(false)],
    arm: () => [drawPole(true)]
  }
}

// ----------------------------------------------------------------------------------------------------- animal

/*
 * うりぼう: a wild boar piglet, the boar boss's baby cousin, built on the rig toolkit. A round loaf of a body with
 * the cream stripes every piglet has (bands that follow the body's curve, toothed like fur, carried by the torso
 * frame so they never crawl), a dark spine line, a big head with a pink snout disc, small pointed ears with pink
 * bowls, short tapered legs on dark trotters and a curly tail with a tuft. 64×64 on the map cell's top-left
 * (anchor [0, 0]): the ground is the bottom row, the piglet stands in the middle of the cell, facing right.
 *
 * Depth (back to front): far legs, far ear, tail, body, near legs, head, snout disc, face, near ear.
 */

/** The spine line and the tail tuft: the boar boss's bristle colours. */
const PIG_DARK = ramp('#684a32', '#503828', '#402c22', '#402c22', '#3a1a22')
/** Trotters: near-black brown. */
const TROTTER = ramp('#684a32', '#402c22', '#2e1e1c', '#2e1e1c', '#3a1a22')
const TROTTER_FAR = farRamp(TROTTER)
/** The snout disc (the boar boss's snout colours). */
const SNOUT = ramp('#ffd6dc', '#f4a6b4', '#cc7488', '#8a4456', '#3a1a22')
/** The pale stripes, cheek and muzzle: the cream ramp one step down, so the stripes read on brown. */
const STRIPE = R.cream[2]
const PIG = R.boarBrown
const PIG_FAR = farRamp(R.boarBrown)

type PigEyes = 'open' | 'wide' | 'angry' | 'squeeze' | 'shut'

/** Foot offset from its rest place: forward (+), lift (+), turn in degrees. */
type Trot = readonly [number, number, number]

export interface PigPose {
  /** The whole figure forward (+) / up (+). */
  x: number
  y: number
  /** Body tilt in degrees (front down +) and stretch (+ longer and flatter, − shorter and taller). */
  lean: number
  squash: number
  /** Flank breathing 0..1. */
  breath: number
  /** Head offset from its seat (forward, down) and nod in degrees (snout down +). */
  head: readonly [number, number]
  nod: number
  eyes: PigEyes
  /** A squeal: the mouth open under the snout. */
  squeal: boolean
  /** Ears turned back in degrees (− pricked forward). */
  earN: number
  earF: number
  /** Feet; null = legs folded under the body (asleep). */
  fN: Trot | null
  fF: Trot | null
  hN: Trot | null
  hF: Trot | null
  /** Tail: direction in degrees (0 = straight back, + up), curl in degrees along its length. */
  tail: readonly [number, number]
}

export const pigPose = (p: Partial<PigPose> = {}): PigPose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  breath: 0,
  head: [0, 0],
  nod: 0,
  eyes: 'open',
  squeal: false,
  earN: 0,
  earF: 0,
  fN: [0, 0, 0],
  fF: [0, 0, 0],
  hN: [0, 0, 0],
  hF: [0, 0, 0],
  tail: [50, 260],
  ...p
})

/** Rest places of the trotters, x relative to the ground frame. */
const TROT_REST = { fN: 9, fF: 6, hN: -9, hF: -6 } as const

const PIG_FACE = { K: C.black, w: C.white, s: SNOUT[0], i: C.inkWarm, m: C.mouth }
/** Near eye 4 wide, far eye 3 wide (open, wide, angry, squeeze, shut). */
const PIG_EYES: Record<PigEyes, readonly [readonly string[], readonly string[]]> = {
  open: [
    ['.KK.', 'KwKK', 'KKKK', 'KKsK', '.KK.'],
    ['K.', 'KK', 'KK', 'K.']
  ],
  wide: [
    ['.iii.', 'iwwwi', 'iwKKi', 'iwKKi', '.iii.'],
    ['ii', 'wK', 'wK', 'ii']
  ],
  angry: [
    ['ii...', '.iiii', '.KwKK', '.KKKK', '..KK.'],
    ['i.', 'KK', 'K.']
  ],
  squeeze: [
    ['ii...', '.iiii', '..iii', '.....', '.....'],
    ['i.', 'ii', '..']
  ],
  shut: [
    ['....', '....', 'i..i', '.ii.', '....'],
    ['..', '..', '.i', 'i.']
  ]
}

const ID0 = Frame.at(0, 0)

/** A cloven trotter on its own frame (origin under its sole, toes to +u): 5 px long, 3 tall. */
const TROT_SHAPE: Shape = polygon([
  [-2.2, -2.8],
  [1.2, -2.8],
  [3, 0.2],
  [-2.4, 0.2]
])

/** 0..1 sawtooth: the teeth on the stripes' edges. */
const saw = (v: number) => v - Math.floor(v)

/**
 * One cream stripe in torso units: a band that follows the back's curve (a ring of the body's ellipse at
 * `level`, 0 = the centre line … 1 = the top edge), `w` thick, tapering out toward both ends, its edges toothed.
 */
function stripe(cv: number, droop: number, w: number, u0: number, u1: number): Shape {
  const mid = (u0 + u1) / 2
  const span = (u1 - u0) / 2
  return {
    box: [u0, cv - w - 1, u1, cv + droop + w + 1],
    has(u, v) {
      const s = (u - mid) / span
      const taper = 1 - s ** 4
      if (taper <= 0) return false
      // the band sags toward both ends, following the back; its upper edge is toothed like fur
      const c = cv + droop * s * s
      const d = v - c
      const tooth = d < 0 ? saw(u / 2.5) * 0.8 : 0
      return Math.abs(d) + tooth < (w / 2) * Math.sqrt(taper)
    }
  }
}

/** A curly tail: a short ribbon from `base` heading back at `deg` (+ up), curling by `curl` degrees. */
function tailPath(base: Pt, deg: number, curl: number, len: number): Pt[] {
  const pts: Pt[] = [base]
  let [x, y] = base
  const n = 6
  for (let i = 1; i <= n; i++) {
    const a = ((deg + (curl * i) / n) * Math.PI) / 180
    x -= Math.cos(a) * (len / n)
    y -= Math.sin(a) * (len / n)
    pts.push([x, y])
  }
  return spline(pts)
}

export function drawPiglet(p: PigPose): Raster {
  const g = new Painter(64, 64, { soft: true })
  const k = 1 + p.squash * 0.05
  const asleep = !p.fN
  const ground = Frame.at(29 + p.x, 62.5)
  const root = ground.child(0, -p.y)
  const torso = root.child(0, asleep ? -9 : -16, p.lean, k, 1 / k)
  const head = torso.child(12 + p.head[0], -3 + p.head[1], p.nod - p.lean * 0.5)
  const br = p.breath

  // ---- body silhouette in torso units: the loaf, the chest under the head, the haunch
  const bodyShape = union(egg(-1, 0 - br * 0.5, 13.5, 10.5 + br * 0.8, 8.5), oval(6.5, 1.5, 8, 8), oval(-8, 2, 7, 7.5))
  const origin = torso.pt(0, -6)

  // ---- legs: hip → knee → ankle, a trotter at the end
  const legGeo = (front: boolean, t: Trot, rest: number, near: boolean) => {
    const f = ground.child(rest + t[0], -t[1], t[2])
    const s = torso.pt(front ? (near ? 7 : 5) : near ? -8.5 : -6.5, 4)
    const end = f.pt(-0.4, -2.4)
    const { mid } = joint(s, end, front ? 5 : 5.5, 5, front ? 1 : -1)
    return { f, s, mid, end }
  }
  type LegGeo = ReturnType<typeof legGeo>
  /** The leg's fur: thigh to ankle, tapering. */
  const legFur = (l: Raster, leg: LegGeo, c: number) => {
    fill(l, ID0, capsule(leg.s, leg.mid, 3.2, 2.4), c)
    fill(l, ID0, capsule(leg.mid, leg.end, 2.4, 1.9), c)
  }
  /** The trotter with its cleft. */
  const trotter = (l: Raster, leg: LegGeo, trot: Ramp) => {
    fill(l, leg.f, TROT_SHAPE, trot[1])
    cel(l, { shade: 1, rim: 1 })
    if (Math.abs(leg.f.angle) < 50) stampAt(l, leg.f, ['k'], 0.9, -1, { k: trot[3] })
  }
  const paintLeg = (l: Raster, leg: LegGeo, fur: Ramp, trot: Ramp) => {
    legFur(l, leg, fur[1])
    smooth(l)
    cel(l, { shade: 1.6, rim: 1 })
    trotter(l, leg, trot)
  }
  const legs = asleep
    ? null
    : {
        fN: legGeo(true, p.fN!, TROT_REST.fN, true),
        fF: legGeo(true, p.fF!, TROT_REST.fF, false),
        hN: legGeo(false, p.hN!, TROT_REST.hN, true),
        hF: legGeo(false, p.hF!, TROT_REST.hF, false)
      }
  if (legs) {
    g.add(-4, (l) => paintLeg(l, legs.hF, PIG_FAR, TROTTER_FAR))
    g.add(-4, (l) => paintLeg(l, legs.fF, PIG_FAR, TROTTER_FAR))
  }

  // ---- far ear, behind the skull
  const earF = head.child(2.5, -6, 10 - p.earF)
  g.add(-3, (l) => {
    fill(
      l,
      earF,
      polygon([
        [-2.6, 0.5],
        [0.4, -6.2],
        [2.8, 0.5]
      ]),
      PIG_FAR[1]
    )
    cel(l, { shade: 1.2 })
  })

  // ---- tail: a short curl with a dark tuft
  g.add(-2, (l) => {
    const path = tailPath(torso.pt(-13.5, -2.5), p.tail[0] + p.lean, p.tail[1], 9)
    ribbon(l, path, (t) => 2.6 - t * 0.9, PIG[1])
    const end = path[path.length - 1]
    fill(l, Frame.at(end[0], end[1]), oval(0, 0, 1.6, 1.6), PIG_DARK[1])
    smooth(l)
    cel(l, { shade: 1, rim: 1 })
  })

  // ---- the body, shaded once; the stripes are part of the coat
  g.add(0, (l) => {
    fill(l, torso, bodyShape, PIG[1])
    // the near legs belong to the body: one silhouette, one light
    if (legs) for (const leg of [legs.hN, legs.fN]) legFur(l, leg, PIG[1])
    tint(
      l,
      torso,
      union(stripe(-7.2, 2.6, 2.2, -12.5, 8), stripe(-3, 2.2, 2.2, -13, 9), stripe(1.2, 1.8, 2, -11.5, 7)),
      STRIPE
    )
    smooth(l)
    mantle(l, PIG[1], PIG_DARK[1], { depth: 1.6, tooth: 1.5, pitch: 3, origin })
    cel(l, { shade: 3.2, deep: 1, rim: 1, tooth: 1.5, pitch: 3, origin })
    // the head's shadow on the chest
    shadow(l, head.moved(-0.5, 1.5), oval(-1, 2, 7.5, 6.5))
  })

  // ---- near legs (or, asleep, the folded fore-leg under the chin and the hind trotter)
  if (legs) {
    g.add(1, (l) => trotter(l, legs.hN, TROTTER))
    g.add(1, (l) => trotter(l, legs.fN, TROTTER))
  } else {
    // the fore-leg folded under the chin, its trotter peeking out in front of the cheek
    g.add(2.5, (l) => {
      fill(l, torso.child(15, 9, 0), TROT_SHAPE, TROTTER[1])
      cel(l, { shade: 1, rim: 1 })
    })
    g.add(1, (l) => {
      fill(l, torso.child(-12.5, 8.6, 0), TROT_SHAPE, TROTTER[1])
      cel(l, { shade: 1 })
    })
  }

  // ---- head: skull, cheek and the short snout as one silhouette
  const headShape = union(oval(0, -0.5, 9, 8), oval(-0.5, 3, 8.5, 5.5), capsule([4.5, 1.5], [10.5, 2.2], 4.8, 3.8))
  const headAt = head.pt(0, -3)
  g.add(2, (l) => {
    fill(l, head, headShape, PIG[1])
    // a pale cheek and muzzle, and one short stripe over the brow
    tint(l, head, union(oval(1.5, 6, 6.5, 2.8), capsule([5, 5], [11, 4.8], 1.6, 1.6)), STRIPE)
    smooth(l)
    mantle(l, PIG[1], PIG_DARK[1], { depth: 1.2, tooth: 1, pitch: 3, origin: headAt })
    cel(l, { shade: 2.6, deep: 0.8, rim: 1, tooth: 1, pitch: 3, origin: headAt })
  })

  // ---- the snout disc with two nostrils
  g.add(2.2, (l) => {
    fill(l, head, oval(12, 2.2, 2.2, 3.8), SNOUT[1])
    cel(l, { shade: 1.4 })
    within(l, (m) => stampAt(m, head, ['k', '.', 'k'], 12.5, 2.4, { k: SNOUT[3] }), true)
  })

  // ---- face
  g.add(
    2.4,
    (l) => {
      const [near, far] = PIG_EYES[p.eyes]
      stampAt(l, head, near, 3.5, -1, PIG_FACE)
      stampAt(l, head, far, 7.5, -2.2, PIG_FACE)
      if (p.squeal) stampAt(l, head, ['iiii', 'immi', '.ii.'], 9.5, 6.6, PIG_FACE)
    },
    false
  )

  // ---- near ear: small and pointed, a pink bowl inside
  const earN = head.child(-3, -5.5, -8 - p.earN)
  g.add(3, (l) => {
    const ear = polygon([
      [-3, 0.5],
      [0, -7.2],
      [3.2, 0.5]
    ])
    fill(l, earN, ear, PIG[1])
    tint(
      l,
      earN,
      polygon([
        [-1.2, 0],
        [0.2, -4.8],
        [1.6, 0]
      ]),
      R.hamEar[2]
    )
    cel(l, { shade: 1.2, rim: 1 })
  })

  return g.render()
}

// ------------------------------------------------------------------------------------------------- clips

const PP = pigPose

/** sleep: curled on the ground, chin on the earth; the flank breathes, an ear twitches once, the tail tip curls. */
const pigSleep = memo(() => {
  const breath = [0, 0.55, 1, 0.45]
  return breath.map((b, i) =>
    PP({
      squash: 1,
      breath: b,
      head: [-0.5, 5],
      nod: 10,
      eyes: 'shut',
      earN: i === 2 ? -18 : 24,
      earF: 20,
      fN: null,
      fF: null,
      hN: null,
      hF: null,
      tail: [45, i === 3 ? 330 : 260]
    })
  )
})

/** wake: bitten, it jolts into the air stiff-legged and wide-eyed, lands head down scowling, scrapes a trotter. */
const pigWake = memo(() => [
  PP({
    y: 9,
    squash: -1.5,
    lean: -6,
    head: [0, -2],
    nod: -10,
    eyes: 'wide',
    squeal: true,
    earN: -20,
    earF: -20,
    fN: [5, 7, -25],
    fF: [3, 8, -20],
    hN: [-5, 7, 25],
    hF: [-3, 8, 20],
    tail: [90, 120]
  }),
  PP({
    y: -1,
    squash: 1.8,
    lean: 6,
    head: [1, 2],
    nod: 12,
    eyes: 'angry',
    earN: 30,
    earF: 25,
    fN: [1, 0, 0],
    fF: [0, 0, 0],
    hN: [-1, 0, 0],
    hF: [0, 0, 0],
    tail: [60, 250]
  }),
  PP({
    y: 0,
    squash: 0.6,
    lean: 9,
    head: [1.5, 2.5],
    nod: 16,
    eyes: 'angry',
    earN: 40,
    earF: 35,
    fN: [-7, 3.5, 35],
    fF: [0, 0, 0],
    hN: [0, 0, 0],
    hF: [1, 0, 0],
    tail: [40, 270]
  })
])

/**
 * run: a piglet's bounding gallop — gather (feet under the body, back arched), push-off, full extension with all
 * four trotters off the ground, the front pair lands, the hind pair swings under, gather again. Ears pressed back,
 * tail streaming, eyes squeezed into a scowl.
 */
const pigRun = memo(() => {
  // fN, fF, hN, hF, y, lean, squash
  const keys: [Trot, Trot, Trot, Trot, number, number, number][] = [
    [[-3, 0, 0], [-1, 1.5, 10], [4, 0, 0], [2, 1.5, -10], 0, 2, -2],
    [[3, 4, -30], [5, 3, -25], [-4, 0, 30], [-2, 0, 20], 2, -7, 0],
    [[7, 5, -50], [9, 4, -45], [-8, 6, 50], [-6, 5, 45], 6, -2, 2.4],
    [[5, 0, 0], [7, 1.5, -15], [-7, 5, 40], [-5, 5, 35], 3, 6, 1.4],
    [[-1, 0, 0], [1, 0, 0], [-2, 5, 10], [0, 5, 0], 1, 7, -0.6],
    [[-4, 3, 30], [-2, 2, 20], [3, 0, 0], [5, 1.5, -10], 2, 3, -1.8]
  ]
  const bob = keys.map((k) => k[4])
  const earLag = lag(bob, { stiffness: 0.4, damping: 0.5, loop: true })
  return keys.map(([fN, fF, hN, hF, y, lean, squash], i) =>
    PP({
      y,
      lean,
      squash,
      fN,
      fF,
      hN,
      hF,
      head: [0.5, 0.5 - earLag[i] * 0.3],
      nod: 4,
      eyes: 'angry',
      earN: 60 + earLag[i] * 6,
      earF: 55 + earLag[i] * 6,
      tail: [10 - earLag[i] * 8, 140 + i * 0]
    })
  )
})

const animalClips = () => ({
  sleep: () => pigSleep().map(drawPiglet),
  wake: () => pigWake().map(drawPiglet),
  run: () => pigRun().map(drawPiglet)
})

// ------------------------------------------------------------------------------------------------------ rock

const ROCK_OUTLINE = [4, 19, 10, 12, 22, 8, 34, 9, 45, 12, 54, 19, 60, 31, 61, 63, 2, 63, 1, 44]

/** Facet seeds on a jittered grid. Each pixel takes the facet of its nearest seed, so creases are straight. */
const FACETS: [number, number, number][] = (() => {
  const rnd = rng(77)
  const seeds: [number, number, number][] = []
  for (let j = 0; j < 6; j++)
    for (let i = 0; i < 7; i++) {
      const x = 5 + i * 9 + (rnd() - 0.5) * 7 + (j % 2) * 4
      const y = 12 + j * 9.5 + (rnd() - 0.5) * 6
      const lit = ((x - 8) / 50) * 1.2 + ((y - 8) / 55) * 1.7 - 0.15 + (rnd() - 0.5) * 2.3
      seeds.push([x, y, Math.max(0, Math.min(3, Math.round(lit)))])
    }
  return seeds
})()

function drawRock(cracked: boolean): Raster {
  const mask = new Raster(64, 64).poly(ROCK_OUTLINE, 1)
  const l = new Raster(64, 64)
  const facetMap = new Int16Array(64 * 64).fill(-1)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      if (!mask.get(x, y)) continue
      let best = 0
      let bd = Infinity
      FACETS.forEach(([fx, fy], i) => {
        const d = (x - fx) ** 2 + ((y - fy) * 1.15) ** 2
        if (d < bd) [best, bd] = [i, d]
      })
      facetMap[y * 64 + x] = best
      l.set(x, y, ROCK[FACETS[best][2]])
    }
  const fAt = (x: number, y: number) => (x < 0 || y < 0 || x > 63 || y > 63 ? -1 : facetMap[y * 64 + x])
  const stepAt = (x: number, y: number) => (fAt(x, y) < 0 ? -1 : FACETS[fAt(x, y)][2])
  // creases: the shaded side of a crease gets the next darker step, the lit side of a lit plane a light edge
  const base = l.clone()
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const f = fAt(x, y)
      if (f < 0) continue
      const a = FACETS[f][2]
      const left = stepAt(x - 1, y)
      const up = stepAt(x, y - 1)
      if (left >= 0 && fAt(x - 1, y) !== f && left > a && a <= 1) l.set(x, y, ROCK[0])
      else if (up >= 0 && fAt(x, y - 1) !== f && up > a && a <= 1) l.set(x, y, ROCK[0])
      else if (left >= 0 && fAt(x - 1, y) !== f && left < a) l.set(x, y, ROCK[Math.min(3, a + 1)])
      else if (up >= 0 && fAt(x, y - 1) !== f && up < a) l.set(x, y, ROCK[Math.min(3, a + 1)])
    }
  void base
  // weathering: short horizontal scratches and pits in the planes
  const rnd = rng(5)
  for (let k = 0; k < 14; k++) {
    const x = 6 + Math.floor(rnd() * 48)
    const y = 14 + Math.floor(rnd() * 44)
    const i = ROCK.indexOf(l.get(x, y))
    if (i < 1 || i > 2 || l.get(x + 3, y) !== ROCK[i] || l.get(x + 1, y + 1) !== ROCK[i]) continue
    l.rect(x, y, 3, 1, ROCK[i + 1])
    l.rect(x + 1, y + 1, 2, 1, ROCK[i + 1])
  }
  // moss over the top-left planes, hanging in tufts
  for (let x = 10; x < 48; x++) {
    let top = 0
    while (top < 30 && !mask.get(x, top)) top++
    const n = noiseAt(x >> 1, 4, 8)
    if (n < 0.28 || x % 13 > 10) continue
    const thick = 2 + Math.floor(n * 3.5) + (x > 24 ? -1 : 0)
    for (let d = 0; d < thick; d++) {
      if (ROCK.indexOf(l.get(x, top + d)) < 0 && LEAF.indexOf(l.get(x, top + d)) < 0) continue
      l.set(x, top + d, d === 0 ? LEAF[0] : d === thick - 1 ? LEAF[2] : LEAF[1])
    }
  }
  if (cracked) {
    // two chips knocked out of the edge, the fresh stone inside pale
    const chip = new Raster(64, 64).poly([44, 12, 54, 19, 58, 28, 52, 26, 48, 19], 1)
    const chip2 = new Raster(64, 64).poly([2, 48, 8, 50, 7, 56, 2, 57], 1)
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        if (chip.get(x, y) || chip2.get(x, y)) l.set(x, y, 0)
        else if (l.get(x, y) && (chip.get(x + 1, y + 1) || chip.get(x + 2, y + 1) || chip2.get(x + 1, y)))
          l.set(x, y, ROCK[0])
      }
    const crack = (pts: number[], w: number) => {
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const line = new Raster(64, 64).line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], 1)
        for (let y = 0; y < 64; y++)
          for (let x = 0; x < 64; x++)
            if (line.get(x, y)) {
              l.paint(x - 1, y, ROCK[0])
              for (let k = 0; k < w; k++) l.paint(x + k, y, k === 0 ? C.black : C.inkCool)
              l.paint(x + w, y, ROCK[3])
            }
      }
    }
    crack([30, 10, 28, 19, 33, 27, 29, 37, 34, 47, 32, 57], 2)
    crack([33, 27, 41, 31, 45, 39], 1)
    crack([29, 37, 22, 43, 19, 53], 1)
    crack([28, 19, 21, 21, 16, 27], 1)
    crack([34, 47, 41, 52, 44, 59], 1)
  }
  return outline(l)
}

const rockClips = () => ({ idle: () => [drawRock(false)], cracked: () => [drawRock(true)] })

// -------------------------------------------------------------------------------------------------- registry

export const sheets: SheetModule = {
  'prop:pipe': () => {
    const c = pipeClips()
    return {
      idle: lazyAnim(c.idle, 2, true, { anchor: [0, 0] }),
      burst: lazyAnim(c.burst, 12, true, { anchor: [0, 0] }),
      done: lazyAnim(c.done, 1, false, { anchor: [0, 0] })
    }
  },
  'prop:hive': () => {
    const c = hiveClips()
    return {
      idle: lazyAnim(c.idle, 5, true, { anchor: [0, 0] }),
      broken: lazyAnim(c.broken, 1, false, { anchor: [0, 0] }),
      post: lazyAnim(c.post, 1, false, { anchor: [0, 0] }),
      arm: lazyAnim(c.arm, 1, false, { anchor: [0, 0] })
    }
  },
  'prop:animal': () => {
    const c = animalClips()
    return {
      sleep: lazyAnim(c.sleep, 3, true, { anchor: [0, 0] }),
      wake: lazyAnim(c.wake, 12, false, { anchor: [0, 0] }),
      run: lazyAnim(c.run, 14, true, { anchor: [0, 0] })
    }
  },
  'prop:rock': () => {
    const c = rockClips()
    return {
      idle: lazyAnim(c.idle, 1, false, { anchor: [0, 0] }),
      cracked: lazyAnim(c.cracked, 1, false, { anchor: [0, 0] })
    }
  }
}

// `puff` is shared with the trees; kept imported for hive foliage experiments
void puff
void LEAF_FAR
