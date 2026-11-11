/**
 * `prop:pipe`, `prop:hive`, `prop:animal`, `prop:rock`: the gimmicks the hero bites.
 *
 * Each one has to say what it is and what happens when it is bitten: a pipe that drips (and sprays when bitten), a
 * hive on a rope that sways (and splits), a sleeping boar piglet (that jumps up angry), a faceted boulder (that
 * cracks). Parts are assembled with the Painter like the cast; the animated ones are pose-parametric.
 */
import type { SheetModule } from '../../module'
import { C, R } from '../../palette'
import {
  Painter,
  Raster,
  ball,
  bar,
  farRamp,
  noiseAt,
  outline,
  rng,
  shadeEdges,
  shadeIndex,
  type Pt,
  type Ramp
} from '../../raster'
import { anim } from '../../sheet'
import { cyl, puff } from './trees'

const PIPE = R.pipe
const WATER = R.water
const HONEY = R.honey
const WOOD = R.wood
const BOAR = R.boarBrown
const BOAR_FAR = farRamp(R.boarBrown)
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
  idle: [drawPipe('idle', 0, 'bead', 0), drawPipe('idle', 0, 'fall', 0)],
  burst: [0, 1, 2, 3].map((i) => drawPipe('burst', [1, -1, 1, -1][i], 'none', i)),
  done: [drawPipe('done', 0, 'none', 0)]
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
    idle: amounts.map((a, i) => drawHive(Math.round(a), drips[i], falling[i])),
    broken: [drawBrokenHive()],
    post: [drawPole(false)],
    arm: [drawPole(true)]
  }
}

// ----------------------------------------------------------------------------------------------------- animal

type Face = 'closed' | 'wide' | 'angry'

/** One leg: hip, foot (hoof bottom centre) and which way the middle joint bends (+1 forward, -1 back). */
type Leg = readonly [foot: Pt, bend: 1 | -1]

interface BoarPose {
  /** Body centre and radii. */
  body: readonly [number, number, number, number]
  /** Back arch in pixels: positive hunches the back and tucks the belly, negative sags. */
  arch?: number
  /** Head centre. */
  head: readonly [number, number]
  /** Near front, far front, near hind, far hind; null when the legs are tucked away (sleeping). */
  legs: readonly [Leg, Leg, Leg, Leg] | null
  face: Face
  /** How far the ear tips stream back (negative: pricked forward). */
  earBack: number
  /** Ear tip offset in y (twitch). */
  twitch?: number
  /** Tail curl height above the rump and how far it streams back. */
  tail: number
  tailBack?: number
  /** Snout drop in pixels (head carried low). */
  snoutDy?: number
}

const HOOF = C.inkWarm
const FAR_HOOF = BOAR[3]
const SEG = 7.5

/** Two-segment leg: knee found from the hip and foot by inverse kinematics. */
function legKnee(hip: Pt, foot: Pt, bend: 1 | -1): Pt {
  const dx = foot[0] - hip[0]
  const dy = foot[1] - hip[1]
  const d = Math.min(Math.hypot(dx, dy), SEG * 2 - 0.5)
  const a = Math.atan2(dy, dx)
  const h = Math.sqrt(Math.max(0, SEG * SEG - (d / 2) ** 2))
  // perpendicular, flipped so `bend` +1 always points to the right (forward) on screen
  let px = -Math.sin(a)
  let py = Math.cos(a)
  if (px * bend < 0) {
    px = -px
    py = -py
  }
  return [hip[0] + Math.cos(a) * (d / 2) + px * h, hip[1] + Math.sin(a) * (d / 2) + py * h]
}

function boarLeg(l: Raster, hip: Pt, leg: Leg, far: boolean) {
  const [foot, bend] = leg
  const ramp = far ? BOAR_FAR : BOAR
  const knee = legKnee(hip, foot, bend)
  const part = new Raster(64, 64)
  bar(part, hip, knee, 6, ramp[1])
  bar(part, knee, [foot[0], foot[1] - 2], 5, ramp[1])
  part.ellipse(knee[0], knee[1], 2.5, 2.5, ramp[1])
  shadeEdges(part, ramp, 1, !far)
  l.blit(part)
  const fx = Math.round(foot[0])
  const fy = Math.round(foot[1])
  l.rect(fx - 2, fy - 1, 5, 2, far ? FAR_HOOF : HOOF)
  l.rect(fx - 2, fy - 2, 4, 1, ramp[2])
}

function boarFace(l: Raster, hx: number, hy: number, face: Face) {
  const x = hx + 3
  const y = hy - 3
  if (face === 'closed') {
    l.rect(x - 1, y + 3, 5, 1, C.black)
    l.set(x - 2, y + 2, C.black)
    l.set(x + 4, y + 2, C.black)
    return
  }
  // tall dark oval, one white highlight; wide-open eyes get a ring of white
  const wide = face === 'wide'
  if (wide) {
    l.rect(x - 1, y - 1, 5, 7, C.white)
    l.rect(x, y - 2, 3, 9, C.white)
  }
  l.rect(x, y, 3, 5, C.black)
  l.rect(x - (wide ? 0 : 1), y + 1, wide ? 3 : 5, 3, C.black)
  l.set(x, y + 1, C.white)
  l.set(x + 1, y + 1, C.white)
  if (face === 'angry') {
    // brow cuts down toward the snout
    l.rect(x - 3, y - 3, 3, 1, C.black)
    l.rect(x - 1, y - 2, 3, 1, C.black)
    l.rect(x + 1, y - 1, 3, 1, C.black)
    l.rect(x + 3, y, 2, 1, C.black)
  }
}

/** Bean-shaped body with three cream stripes running along the back and flank. */
function boarBody(l: Raster, bx: number, by: number, rx: number, ry: number, arch: number) {
  const BANDS: [number, number][] = [
    [-0.92, -0.7],
    [-0.52, -0.3],
    [-0.12, 0.1]
  ]
  for (let y = Math.floor(by - ry - arch - 1); y <= Math.ceil(by + ry + 1); y++)
    for (let x = Math.floor(bx - rx); x <= Math.ceil(bx + rx); x++) {
      const nx = (x + 0.5 - bx) / rx
      if (Math.abs(nx) > 1) continue
      const cy = by - arch * (1 - nx * nx)
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      const nz = Math.sqrt(Math.max(0, 1 - q))
      const step = shadeIndex(nx, ny, nz, false)
      let c: number = BOAR[step]
      const t = ny / Math.sqrt(Math.max(0.0001, 1 - nx * nx))
      if (nx > -0.88 && nx < 0.62 && BANDS.some(([a, b]) => t >= a && t <= b)) c = R.cream[Math.min(3, step + 1)]
      l.set(x, y, c)
    }
}

function drawBoar(p: BoarPose): Raster {
  const g = new Painter(64, 64)
  const [bx, by, rx, ry] = p.body
  const [hx, hy] = p.head
  const arch = p.arch ?? 0
  const sy = hy + 3 + (p.snoutDy ?? 0)
  const tw = p.twitch ?? 0
  const hips: Pt[] = [
    [bx + rx * 0.5, by + ry * 0.4 - arch * 0.4],
    [bx + rx * 0.3, by + ry * 0.4 - arch * 0.4],
    [bx - rx * 0.55, by + ry * 0.4 - arch * 0.4],
    [bx - rx * 0.35, by + ry * 0.4 - arch * 0.4]
  ]
  // curly tail on the rump
  g.add(-3, (l) => {
    const tx = bx - rx + 2 - (p.tailBack ?? 0)
    const ty = by - ry * 0.5 - p.tail - arch
    bar(l, [bx - rx + 3, by - ry * 0.4 - arch * 0.5], [tx, ty + 1], 2, BOAR[2])
    l.ring(tx - 1.5, ty - 1.5, 0.8, 2.7, BOAR[1], -0.4, 4.9)
    l.set(tx - 1, ty - 1, 0)
  })
  if (p.legs) {
    g.add(-2, (l) => boarLeg(l, hips[1], p.legs![1], true))
    g.add(-2, (l) => boarLeg(l, hips[3], p.legs![3], true))
  }
  // far ear
  g.add(-1, (l) => {
    l.poly([hx - 7, hy - 7, hx - 6 - p.earBack * 0.7, hy - 14 + tw, hx - 1, hy - 8], BOAR_FAR[1])
  })
  g.add(0, (l) => boarBody(l, bx, by, rx, ry, arch))
  // big head, round snout disc with nostrils, tusk nubs
  g.add(1, (l) => {
    ball(l, hx, hy, 10, 9, BOAR)
    ball(l, hx + 9, sy, 4.4, 5, R.hamPink)
    l.rect(hx + 11, sy - 2, 2, 2, R.hamEar[3])
    l.rect(hx + 11, sy + 1, 2, 2, R.hamEar[3])
    l.set(hx + 8, sy - 3, R.hamPink[0])
    l.rect(hx + 5, sy + 4, 2, 2, R.cream[0])
    l.set(hx + 5, sy + 5, R.cream[2])
    // pale cheek patch under the eye
    l.rect(hx - 1, hy + 2, 5, 2, R.cream[1])
    l.rect(hx, hy + 4, 3, 1, R.cream[2])
  })
  g.add(2, (l) => boarFace(l, hx, hy, p.face), false)
  // near ear in front of the head: small, pointed, streaming back
  g.add(3, (l) => {
    const e = p.earBack
    l.poly([hx - 5, hy - 6, hx - 3 - e, hy - 14 + tw, hx + 3, hy - 7], BOAR[1])
    l.poly([hx - 3, hy - 7, hx - 3 - e * 0.8, hy - 12 + tw, hx + 1, hy - 7], R.hamEar[1])
  })
  if (p.legs) {
    g.add(4, (l) => boarLeg(l, hips[0], p.legs![0], false))
    g.add(4, (l) => boarLeg(l, hips[2], p.legs![2], false))
  }
  return g.render()
}

const F = (x: number, y: number, bend: 1 | -1): Leg => [[x, y], bend]

/** Curled on its belly: the snout rests on the ground, eyes shut, a back leg tucked, breathing. */
function drawSleep(breath: number, twitch: number): Raster {
  const g = new Painter(64, 64)
  const by = 50 - breath * 0.5
  const ry = 11 + breath * 0.9
  const r = drawBoar({
    body: [27, by, 20, ry],
    arch: -0.4,
    head: [46, 53],
    legs: null,
    face: 'closed',
    earBack: -1,
    twitch,
    tail: 1,
    tailBack: 0,
    snoutDy: 2
  })
  g.add(0, (l) => l.blit(r), false)
  g.add(5, (l) => {
    // folded fore-paws under the chin and the hind leg tucked along the belly
    const fore = new Raster(64, 64)
    fore.ellipse(40.5, 60, 5.5, 2.5, BOAR[1])
    shadeEdges(fore, BOAR, 1, true)
    l.blit(fore)
    l.rect(37, 60, 3, 2, HOOF)
    const hind = new Raster(64, 64)
    hind.ellipse(17, 58.5, 7, 3.5, BOAR[1])
    shadeEdges(hind, BOAR, 1, true)
    l.blit(hind)
    l.rect(11, 60, 3, 2, HOOF)
  })
  return g.render()
}

const wakePoses: BoarPose[] = [
  // eyes snap open and it springs into the air, legs tucked, ears pricked
  {
    body: [26, 30, 17, 13],
    arch: 2,
    head: [45, 24],
    legs: [F(38, 51, -1), F(33, 49, -1), F(14, 50, 1), F(19, 52, 1)],
    face: 'wide',
    earBack: -2,
    tail: 5,
    tailBack: 0
  },
  // lands on its feet with a thump: squashed
  {
    body: [27, 44, 19, 11],
    arch: -0.5,
    head: [47, 42],
    legs: [F(41, 61, -1), F(35, 61, -1), F(14, 61, 1), F(20, 61, 1)],
    face: 'angry',
    earBack: 2,
    tail: 3
  },
  // head down, one front hoof scraping back across the ground
  {
    body: [27, 41, 18, 12],
    arch: 0.5,
    head: [47, 44],
    legs: [F(33, 54, -1), F(36, 61, -1), F(14, 61, 1), F(20, 61, 1)],
    face: 'angry',
    earBack: 4,
    tail: 5,
    snoutDy: 2
  }
]

/**
 * A gallop: gather, push-off, flight (extended, long and low), reach, landing, bunch up again. The legs always have
 * two segments; the front pair reaches, the hind pair kicks back.
 */
const runPoses: BoarPose[] = [
  // gather: legs bunched under the body, back arched, down on the ground
  {
    body: [25, 42, 15, 13],
    arch: 3,
    head: [42, 43],
    legs: [F(33, 61, -1), F(28, 61, -1), F(20, 61, 1), F(15, 61, 1)],
    face: 'angry',
    earBack: 4,
    tail: 4,
    tailBack: 1,
    snoutDy: 1
  },
  // push-off: the hind legs drive, the front lift and swing forward
  {
    body: [24, 40, 18, 12],
    arch: 1,
    head: [43, 38],
    legs: [F(44, 53, 1), F(39, 55, 1), F(7, 59, 1), F(2, 57, 1)],
    face: 'angry',
    earBack: 6,
    tail: 3,
    tailBack: 3
  },
  // full extension: airborne, long and low, front reaching, hind stretched back
  {
    body: [25, 38, 20, 10],
    arch: -1,
    head: [46, 36],
    legs: [F(53, 47, 1), F(49, 51, 1), F(0, 49, 1), F(6, 53, 1)],
    face: 'angry',
    earBack: 6,
    tail: 1,
    tailBack: 5
  },
  // descending: the front legs reach for the ground, hind still trailing
  {
    body: [25, 41, 19, 11],
    arch: 0,
    head: [46, 41],
    legs: [F(51, 59, 1), F(46, 61, 1), F(5, 52, 1), F(10, 55, 1)],
    face: 'angry',
    earBack: 7,
    tail: 2,
    tailBack: 4
  },
  // landing on the front legs, the hind legs swinging forward under the body
  {
    body: [25, 44, 17, 12],
    arch: 2,
    head: [44, 44],
    legs: [F(42, 61, -1), F(37, 61, -1), F(17, 55, 1), F(12, 57, 1)],
    face: 'angry',
    earBack: 6,
    tail: 3,
    tailBack: 2,
    snoutDy: 1
  },
  // bunching: hind feet come under, the back arches up, about to touch down
  {
    body: [25, 40, 15, 13],
    arch: 4,
    head: [42, 41],
    legs: [F(34, 58, -1), F(29, 57, -1), F(22, 59, 1), F(17, 57, 1)],
    face: 'angry',
    earBack: 5,
    tail: 5,
    tailBack: 1
  }
]

const animalClips = () => ({
  sleep: [drawSleep(0, 0), drawSleep(0.5, 0), drawSleep(1, -2), drawSleep(0.5, -1)],
  wake: wakePoses.map(drawBoar),
  run: runPoses.map(drawBoar)
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

const rockClips = () => ({ idle: [drawRock(false)], cracked: [drawRock(true)] })

// -------------------------------------------------------------------------------------------------- registry

export const sheets: SheetModule = {
  'prop:pipe': () => {
    const c = pipeClips()
    return {
      idle: anim(c.idle, 2, true, { anchor: [0, 0] }),
      burst: anim(c.burst, 12, true, { anchor: [0, 0] }),
      done: anim(c.done, 1, false, { anchor: [0, 0] })
    }
  },
  'prop:hive': () => {
    const c = hiveClips()
    return {
      idle: anim(c.idle, 5, true, { anchor: [0, 0] }),
      broken: anim(c.broken, 1, false, { anchor: [0, 0] }),
      post: anim(c.post, 1, false, { anchor: [0, 0] }),
      arm: anim(c.arm, 1, false, { anchor: [0, 0] })
    }
  },
  'prop:animal': () => {
    const c = animalClips()
    return {
      sleep: anim(c.sleep, 3, true, { anchor: [0, 0] }),
      wake: anim(c.wake, 12, false, { anchor: [0, 0] }),
      run: anim(c.run, 14, true, { anchor: [0, 0] })
    }
  },
  'prop:rock': () => {
    const c = rockClips()
    return { idle: anim(c.idle, 1, false, { anchor: [0, 0] }), cracked: anim(c.cracked, 1, false, { anchor: [0, 0] }) }
  }
}

// `puff` is shared with the trees; kept imported for hive foliage experiments
void puff
void LEAF_FAR
