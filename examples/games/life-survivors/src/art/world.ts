import { MAP_GROUNDS, MAP_PROPS, mapPropSheet, mapTile } from './maps'
import { C, R } from './palette'
import { Raster, ball, part, rng, shadeEdges, type Ramp } from './raster'
import type { Anim, Sheet } from './sheet'

/** Life stages that have painted ground; others keep the old flat look. */
export const GROUNDS: Record<string, string> = { 乳児期: 'nursery', 小学生: 'school', 社会人: 'office', ...MAP_GROUNDS }
export const TILE = 64

const still = (frame: Raster): Anim => ({ frames: [frame], fps: 1, loop: true })

/** Wrapping pixel setter so scatter crosses tile edges seamlessly. */
const wrap = (r: Raster, x: number, y: number, c: number) =>
  r.set(((x % TILE) + TILE) % TILE, ((y % TILE) + TILE) % TILE, c)

/** A blob of 2–4 px placed with wrap-around. */
function speck(r: Raster, x: number, y: number, size: number, c: number) {
  wrap(r, x, y, c)
  if (size > 1) wrap(r, x + 1, y, c)
  if (size > 2) wrap(r, x, y + 1, c)
  if (size > 3) wrap(r, x + 1, y + 1, c)
}

// ---------------------------------------------------------------------------------------------
// 乳児期: interlocking foam play-mats in four clean muted pastels (dusty rose, sage, lavender, butter).

const MATS = [R.matRose, R.matSage, R.matLilac, R.matButter]
/** Mat colour by tile: neighbours to the left and above always differ, so their tabs show. */
const matOf = (tx: number, ty: number) => (((tx + 2 * ty) % 4) + 4) % 4

function mat(c: number, variant: number) {
  const a = MATS[c]
  const left = MATS[(c + 3) % 4]
  const above = MATS[(c + 2) % 4]
  const r = new Raster(TILE, TILE).rect(0, 0, TILE, TILE, a[1])
  const rand = rng(11 + variant * 7 + c * 101)
  // EVA foam grain: small soft clusters, low contrast.
  for (let i = 0; i < 40; i++)
    speck(r, Math.floor(rand() * TILE), Math.floor(rand() * TILE), 1 + Math.floor(rand() * 2), a[2])
  // The neighbours' jigsaw tabs bulge in from the left and the top.
  r.ellipse(2.5, 32, 5, 5, left[1])
  r.ellipse(32, 2.5, 5, 5, above[1])
  r.rect(0, 0, 1, TILE, a[2])
  r.rect(0, 0, TILE, 1, a[2])
  const src = r.clone()
  r.map((v, x, y) => {
    if (v === left[1] || v === above[1]) return v
    const touches = [src.get(x - 1, y), src.get(x, y - 1)].some((n) => n === left[1] || n === above[1])
    return touches ? a[2] : v
  })
  r.rect(1, 1, TILE - 1, 1, a[0])
  if (variant === 1) for (let i = 0; i < 6; i++) speck(r, 40 + i * 2, 44 + (i % 3), 2, a[0])
  if (variant === 2)
    for (const [x, y] of [
      [18, 46],
      [22, 50],
      [47, 18]
    ])
      speck(r, x, y, 3, a[2])
  return r
}

// ---------------------------------------------------------------------------------------------
// 小学生: packed schoolyard dirt with pebbles; every fifth row carries a chalk line.

function dirt(variant: number, chalk: boolean) {
  const D = R.dirt
  const r = new Raster(TILE, TILE).rect(0, 0, TILE, TILE, D[1])
  const rand = rng(31 + variant * 13)
  for (let i = 0; i < 26; i++)
    speck(r, Math.floor(rand() * TILE), Math.floor(rand() * TILE), 2 + Math.floor(rand() * 3), D[2])
  for (let i = 0; i < 14; i++)
    speck(r, Math.floor(rand() * TILE), Math.floor(rand() * TILE), 2 + Math.floor(rand() * 2), D[0])
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    speck(r, x, y, 4, D[0])
    wrap(r, x + 1, y + 1, D[2])
    wrap(r, x + 2, y + 1, D[2])
  }
  if (chalk)
    for (let x = 0; x < TILE; x++) {
      if ((x * 7 + variant * 3) % 23 === 0) continue
      r.set(x, 30, C.chalk)
      if ((x * 5) % 9 > 1) r.set(x, 31, C.chalk)
    }
  return r
}

// ---------------------------------------------------------------------------------------------
// 社会人: calm blue-grey carpet tiles, 1px seams, clustered pile texture. Three texture seeds break up
// repetition; rare variants add faint caster arcs or a replaced, slightly darker tile.

function carpet(variant: number) {
  const K = R.carpet
  const replaced = variant === 4
  const r = new Raster(TILE, TILE).rect(0, 0, TILE, TILE, replaced ? K[2] : K[1])
  const rand = rng(53 + Math.min(variant, 3) * 17)
  for (let i = 0; i < 46; i++)
    speck(
      r,
      Math.floor(rand() * TILE),
      Math.floor(rand() * TILE),
      2 + Math.floor(rand() * 3),
      i % 3 ? (replaced ? K[1] : K[2]) : K[0]
    )
  r.rect(0, TILE - 1, TILE, 1, K[2])
  r.rect(TILE - 1, 0, 1, TILE, K[2])
  if (replaced) {
    r.rect(0, 0, TILE, 1, K[2])
    r.rect(0, 0, 1, TILE, K[2])
  }
  if (variant === 3)
    for (let a = 0.3; a < 2.2; a += 0.08) {
      r.set(30 + Math.cos(a) * 16, 22 + Math.sin(a) * 10, K[2])
      r.set(34 + Math.cos(a) * 12, 26 + Math.sin(a) * 8, K[2])
    }
  return r
}

const tileCache = new Map<string, Raster>()
function cached(key: string, make: () => Raster) {
  let t = tileCache.get(key)
  if (!t) tileCache.set(key, (t = make()))
  return t
}

/** Tile hash shared by the renderer and the review tools. */
export const tileHash = (tx: number, ty: number) => (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0

/** The ground tile at a tile coordinate for a ground key ('nursery' | 'school' | 'office'). */
export function groundTile(ground: string, tx: number, ty: number): Raster {
  const h = tileHash(tx, ty)
  if (MAP_PROPS[ground]) return mapTile(ground, tx, ty, h)
  const v = h % 7 < 4 ? 0 : h % 7 < 6 ? 1 : 2
  if (ground === 'nursery') {
    const c = matOf(tx, ty)
    return cached(`n${c}${v}`, () => mat(c, v))
  }
  if (ground === 'school') {
    const chalk = ((ty % 5) + 5) % 5 === 0
    const flip = (h >>> 4) & 1
    return cached(`s${v}${chalk}${flip}`, () => (flip ? dirt(v, chalk).flipX() : dirt(v, chalk)))
  }
  const k = h % 20
  const office = k < 6 ? 0 : k < 12 ? 1 : k < 17 ? 2 : k < 19 ? 3 : 4
  return cached(`o${office}`, () => carpet(office))
}

export function tileSheet(ground: string): Sheet {
  const frames: Raster[] = []
  const seen = new Set<Raster>()
  for (let ty = 0; ty < 10; ty++)
    for (let tx = 0; tx < 10; tx++) {
      const t = groundTile(ground, tx, ty)
      if (!seen.has(t)) seen.add(t) && frames.push(t)
    }
  return { tiles: { frames, fps: 1, loop: true } }
}

// ---------------------------------------------------------------------------------------------
// Props (decorative only, no collision): mid-value, quieter than characters. Pivot = bottom centre.

/** An oblique box: front face, lit top, shaded right side. */
function box(r: Raster, x: number, y: number, w: number, h: number, d: number, ramp: Ramp) {
  r.rect(x, y, w, h, ramp[1])
  r.poly([x, y, x + d, y - d, x + w + d, y - d, x + w, y], ramp[0])
  r.poly([x + w, y, x + w + d, y - d, x + w + d, y + h - d, x + w, y + h], ramp[2])
}

function teddy() {
  const r = new Raster(64, 64)
  const B = R.brown
  part(r, (l) => {
    ball(l, 22, 50, 4, 4, B, false)
    ball(l, 42, 50, 4, 4, B, false)
  })
  part(r, (l) => ball(l, 32, 45, 10, 11, B))
  part(r, (l) => {
    ball(l, 32, 47, 5, 6, [B[0], B[0], B[1], B[2], B[4]], false)
  })
  part(r, (l) => {
    ball(l, 23, 22, 4, 4, B, false)
    ball(l, 41, 22, 4, 4, B, false)
    l.ellipse(23, 22, 2, 2, R.pink[2])
    l.ellipse(41, 22, 2, 2, R.pink[2])
  })
  part(r, (l) => {
    ball(l, 32, 29, 10, 9, B)
    ball(l, 32, 33, 4, 3, [B[0], B[0], B[0], B[1], B[4]], false)
    l.stamp(['K.....K', 'K.....K', '...K...', '..K.K..'], 29, 28)
    l.rect(31, 31, 3, 1, C.inkWarm)
  })
  part(r, (l) => {
    l.poly([26, 37, 32, 39, 26, 41], R.red[1])
    l.poly([38, 37, 32, 39, 38, 41], R.red[1])
    l.rect(31, 38, 2, 2, R.red[2])
  })
  part(r, (l) => {
    ball(l, 20, 44, 3.5, 4.5, B, false)
    ball(l, 44, 44, 3.5, 4.5, B, false)
  })
  return r
}

function bottle() {
  const r = new Raster(64, 64)
  part(r, (l) => {
    l.rect(26, 30, 12, 26, R.paper[1])
    shadeEdges(l, R.paper, 2, true)
    l.rect(27, 40, 10, 15, R.paper[0])
    l.rect(35, 40, 2, 15, R.paper[1])
    for (let y = 33; y < 52; y += 4) l.rect(26, y, 3, 1, R.mint[2])
  })
  part(r, (l) => {
    l.rect(25, 25, 14, 5, R.pink[1])
    shadeEdges(l, R.pink, 1, true)
  })
  part(r, (l) => {
    l.rect(29, 18, 6, 7, R.yellow[1])
    l.rect(30, 15, 4, 3, R.yellow[1])
    shadeEdges(l, R.yellow, 1, true)
  })
  return r
}

const LETTERS: string[][] = [
  ['.KK..', 'K..K.', 'KKKK.', 'K..K.', 'K..K.'],
  ['KKK..', 'K..K.', 'KKK..', 'K..K.', 'KKK..'],
  ['.KKK.', 'K....', 'K....', 'K....', '.KKK.']
]

function blocks() {
  const r = new Raster(64, 64)
  const cubes: [number, number, Ramp, number][] = [
    [14, 44, R.red, 0],
    [32, 44, R.yellow, 1],
    [23, 30, R.mint, 2]
  ]
  for (const [x, y, ramp, letter] of cubes)
    part(r, (l) => {
      box(l, x, y, 13, 12, 4, ramp)
      l.stamp(LETTERS[letter], x + 4, y + 4, { K: ramp[3] })
    })
  return r
}

function rattle() {
  const r = new Raster(64, 64)
  part(r, (l) => {
    l.thick(20, 52, 33, 38, 4, R.pink[1])
    shadeEdges(l, R.pink)
    ball(l, 19, 53, 3, 3, R.pink, false)
  })
  part(r, (l) => {
    ball(l, 38, 32, 9, 9, R.yellow)
    l.set(35, 29, R.red[1])
    l.set(41, 33, R.mint[1])
    l.set(37, 37, R.red[1])
    l.rect(30, 33, 17, 1, R.yellow[2])
  })
  return r
}

/** A red playground dodgeball with its seams. */
function dodgeball() {
  const r = new Raster(64, 64)
  part(r, (l) => {
    ball(l, 32, 48, 8, 8, R.red)
    for (let t = -7; t <= 7; t++) l.paint(32 + t, 47 + Math.round((t * t) / 16), R.red[3])
    for (let t = -6; t <= 6; t++) l.paint(29 + Math.round((t * t) / 14), 48 + t, R.red[3])
  })
  return r
}

/** Half-buried playground tires: painted, with tread, a dark inner hollow and a dirt mound in front. */
function tires() {
  const r = new Raster(128, 64)
  const colors: Ramp[] = [R.red, R.yellow, R.navy, R.mint, R.red]
  const hole: Ramp = [R.hair[2], R.hair[3], C.inkCool, C.inkCool, C.inkCool]
  colors.forEach((ramp, i) => {
    const x = 18 + i * 22
    part(r, (l) => {
      l.ellipse(x, 42, 11, 13, ramp[2])
      l.ellipse(x - 1, 41, 9, 11, ramp[1])
      l.ellipse(x - 3, 37, 3, 4, ramp[0])
      // Tread blocks on the outer band.
      for (let a = -Math.PI; a < 0; a += 0.32) l.paint(x + Math.cos(a) * 10, 42 + Math.sin(a) * 12, ramp[3])
      l.ellipse(x, 43, 5, 7, hole[1])
      l.ellipse(x + 1, 44, 3.5, 5, hole[2])
      l.rect(x - 12, 50, 25, 14, 0)
    })
  })
  part(r, (l) => {
    l.ellipse(64, 51, 61, 4, R.dirt[0])
    l.rect(2, 51, 124, 6, 0)
    l.rect(4, 50, 120, 1, R.dirt[1])
    for (let x = 8; x < 120; x += 9) l.set(x, 49, R.dirt[2])
  })
  return r
}

/** Fallen cherry petals in two-tone clusters, and a small sprig with blossoms. */
function petals() {
  const r = new Raster(64, 64)
  const rand = rng(77)
  for (let i = 0; i < 7; i++) {
    const x = 6 + Math.floor(rand() * 50)
    const y = 30 + Math.floor(rand() * 26)
    r.stamp(i % 2 ? ['pp.', '.Pp'] : ['.p', 'pP', 'P.'], x, y, { p: R.pink[1], P: R.pink[2] })
  }
  part(r, (l) => {
    l.line(22, 50, 40, 44, R.brown[2])
    l.line(30, 47, 33, 42, R.brown[2])
    for (const [x, y] of [
      [40, 43],
      [33, 41],
      [25, 49]
    ]) {
      l.stamp(['.p.', 'pyp', '.p.'], x - 1, y - 1, { p: R.pink[1], y: R.yellow[1] })
      l.set(x + 1, y + 1, R.pink[2])
    }
  })
  return r
}

/** A ランドセル left on the ground, matching the kid's: deep red, rounded flap, clasp, side panel, straps. */
function randoseru() {
  const r = new Raster(64, 64)
  const D: Ramp = [R.red[1], R.red[2], R.red[3], R.red[3], R.red[4]]
  part(r, (l) => {
    box(l, 20, 37, 20, 16, 5, D)
    l.rect(20, 37, 20, 8, D[0])
    l.ellipse(30, 45, 10, 2.5, D[0])
    l.rect(21, 38, 18, 7, R.red[1])
    l.rect(28, 46, 4, 3, R.metal[1])
    l.set(28, 46, R.metal[0])
    l.rect(20, 52, 20, 1, D[2])
  })
  part(r, (l) => {
    l.line(42, 41, 49, 50, D[1])
    l.line(43, 41, 50, 50, D[2])
    l.line(42, 46, 47, 54, D[2])
  })
  return r
}

function desk() {
  const r = new Raster(128, 64)
  part(r, (l) => {
    l.rect(30, 44, 3, 16, R.metal[2])
    l.rect(96, 44, 3, 16, R.metal[2])
  })
  part(r, (l) => box(l, 24, 42, 82, 4, 8, R.brown))
  part(r, (l) => {
    box(l, 78, 46, 20, 13, 4, R.metal)
    l.rect(80, 49, 16, 1, R.metal[2])
    l.rect(80, 54, 16, 1, R.metal[2])
  })
  // Monitor and keyboard.
  part(r, (l) => {
    l.rect(52, 34, 6, 4, R.metal[2])
    l.rect(48, 37, 14, 2, R.metal[1])
    l.rect(40, 14, 30, 20, R.hair[2])
    l.rect(42, 16, 26, 16, R.navy[1])
    l.rect(43, 17, 12, 2, R.navy[0])
    l.rect(43, 21, 18, 1, R.navy[0])
    l.rect(43, 24, 15, 1, R.navy[0])
  })
  part(r, (l) => {
    l.poly([38, 41, 66, 41, 69, 38, 41, 38], R.metal[0])
    l.rect(42, 39, 24, 1, R.metal[2])
  })
  part(r, (l) => {
    l.rect(80, 34, 8, 5, R.paper[1])
    l.rect(81, 33, 8, 1, R.paper[0])
  })
  return r
}

function chair() {
  const r = new Raster(64, 64)
  part(r, (l) => {
    l.line(32, 52, 24, 56, R.metal[2])
    l.line(32, 52, 40, 56, R.metal[2])
    l.line(32, 52, 32, 57, R.metal[2])
    for (const x of [24, 32, 40]) ball(l, x, 57, 1.6, 1.6, R.hair, false)
  })
  part(r, (l) => l.rect(31, 45, 3, 7, R.metal[1]))
  part(r, (l) => {
    l.poly([23, 28, 33, 27, 34, 42, 24, 43], R.navy[1])
    shadeEdges(l, R.navy, 1, true)
  })
  part(r, (l) => box(l, 22, 42, 20, 4, 3, R.navy))
  return r
}

function plant() {
  const r = new Raster(64, 64)
  const leaves: [number, number, number, number][] = [
    [32, 36, 18, 14],
    [32, 36, 46, 12],
    [32, 36, 30, 6],
    [32, 38, 14, 28],
    [32, 38, 50, 26],
    [32, 36, 40, 4]
  ]
  part(r, (l) => {
    for (const [x0, y0, x1, y1] of leaves) {
      for (let t = 0; t <= 1; t += 0.05) {
        const w = Math.sin(t * Math.PI) * 3 + 0.6
        l.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 3, w, w, R.green[1])
      }
    }
    shadeEdges(l, R.green, 1, true)
    for (const [x0, y0, x1, y1] of leaves) l.line(x0, y0, (x0 + x1 * 2) / 3, (y0 + y1 * 2) / 3 - 2, R.green[2])
  })
  part(r, (l) => {
    l.poly([22, 40, 42, 40, 39, 57, 25, 57], R.orange[1])
    shadeEdges(l, R.orange, 2, true)
    l.rect(21, 39, 22, 3, R.orange[0])
    l.rect(21, 41, 22, 1, R.orange[2])
  })
  return r
}

function copier() {
  const r = new Raster(64, 64)
  part(r, (l) => {
    box(l, 12, 24, 36, 32, 6, R.metal)
    l.rect(14, 38, 32, 1, R.metal[2])
    l.rect(14, 46, 32, 1, R.metal[2])
    l.rect(28, 41, 6, 2, R.metal[3])
    l.rect(28, 49, 6, 2, R.metal[3])
  })
  part(r, (l) => {
    box(l, 14, 20, 30, 4, 6, R.paper)
    l.rect(36, 16, 6, 2, R.green[1])
    l.set(20, 16, R.red[1])
  })
  part(r, (l) => {
    l.poly([48, 30, 58, 28, 58, 31, 48, 33], R.paper[0])
  })
  return r
}

export function propSheet(ground: string): Sheet {
  if (MAP_PROPS[ground]) return mapPropSheet(ground)
  if (ground === 'nursery')
    return { teddy: still(teddy()), bottle: still(bottle()), blocks: still(blocks()), rattle: still(rattle()) }
  if (ground === 'school')
    return { ball: still(dodgeball()), petals: still(petals()), randoseru: still(randoseru()), tires: still(tires()) }
  return { chair: still(chair()), plant: still(plant()), copier: still(copier()), desk: still(desk()) }
}

/** Flat ground decals cast no contact shadow. */
export const FLAT_PROPS = new Set(['petals'])

export const PROP_NAMES: Record<string, string[]> = {
  nursery: ['teddy', 'bottle', 'blocks', 'rattle'],
  school: ['ball', 'petals', 'randoseru', 'tires'],
  office: ['chair', 'plant', 'copier', 'desk'],
  ...MAP_PROPS
}

/** Which prop (if any) decorates a 192-unit cell; props never block movement. */
export const PROP_CELL = 192
/** The props (if any) decorating a 192-unit cell: two cells in three get one, often with a small cluster. */
export function propsAt(ground: string, cx: number, cy: number) {
  const h = tileHash(cx * 31 + 7, cy * 17 + 3)
  if (h % 3 === 2) return []
  const names = PROP_NAMES[ground]
  const x = cx * PROP_CELL + 40 + ((h >>> 6) % 112)
  const y = cy * PROP_CELL + 60 + ((h >>> 12) % 100)
  const out = [{ name: names[(h >>> 3) % names.length], x, y }]
  const extra = (h >>> 18) % 5
  for (let k = 0; k < (extra > 2 ? extra - 2 : 0); k++)
    out.push({ name: names[(h >>> (21 + k * 2)) % names.length], x: x + (k ? -34 : 38), y: y + (k ? 18 : 10) })
  return out
}
