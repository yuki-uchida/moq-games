/**
 * The terrain kit: everything a world's ground needs except its colours and its small details.
 *
 * ## How a tile is built
 *
 * 1. `exposure(q.around)` classifies the 8 neighbours: which sides touch air (`top`, `right`, `bottom`, `left`),
 *    which corners are convex (two exposed sides: `oTL`…) and which are concave (a diagonal hole between two
 *    connected sides: `cNW`…). `undefined` (outside the map), `solid` and `dirt` are ground; `platform`, `spike`
 *    and `empty` are air as far as the ground is concerned.
 * 2. `paintGround(q, style)` paints a `solid` tile: a calm soil fill (`style.fill`), then an underside band, side
 *    rims and a grass-like lip on top, plus rounded outer corners and closed inner corners. Ground tiles are fully
 *    opaque (collision is the whole cell), so a rounded corner is drawn as outline colour, never as a hole.
 * 3. `paintDirt(q, style)` paints diggable dirt: bold cracks, embedded stones, a crumbly border where it meets air.
 * 4. `paintPlatform(q, style)` and `paintSpike(q, style)` paint the one-way ledge (top 20 px) and the spikes
 *    (rows 8–63), choosing the left end, middle or right end piece from the W and E neighbours.
 * 5. `memoTile(build)` wraps a builder with a cache keyed by kind + neighbour mask + position variant.
 *
 * ## Seamlessness and repetition
 *
 * All variation is sampled in **world** coordinates (`origin(q)` + the pixel), never tile-local ones, so features
 * flow across tile borders. The world repeats every `WRAP_X × WRAP_Y` tiles (24 × 18), which keeps the tile cache
 * bounded while the repeat is 1536 px wide, far more than one screen. Every cell size passed to `scatter` or
 * `cellNoise` must divide 384 (3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192).
 *
 * ## Writing a theme
 *
 * A theme module builds a `GroundStyle` (ramps, lip thickness, hooks that paint its details), a `DirtStyle`, a
 * `PlatformStyle` and a `SpikeStyle`, calls the builders from its `tile(q)` and lists its `decor`. Hooks receive
 * a `Ctx` with the raster, the query, the exposure and the world origin and paint with `scatter`.
 */
import type { Neighbour, TileKind, TileQuery } from '../../contract'
import type { Ramp } from '../../palette'
import { Raster, ball, hash, outline, rng } from '../../raster'
import { memo } from '../../sheet'
import type { Decor } from '../types'

export const TILE = 64
/** The terrain pattern repeats every WRAP_X × WRAP_Y tiles. */
export const WRAP_X = 24
export const WRAP_Y = 18

export const wrap = (v: number, n: number) => ((v % n) + n) % n

/** Ground for the purpose of autotiling: outside the map counts as ground. */
export const isGround = (n: Neighbour) => n === undefined || n === 'solid' || n === 'dirt'
/** Dirt joins only dirt (and the map edge); beside solid ground it keeps a clean border. */
export const isDirt = (n: Neighbour) => n === undefined || n === 'dirt'
export const isPlatform = (n: Neighbour) => n === 'platform'

// -------------------------------------------------------------------------------------------- neighbourhood

export interface Exposure {
  /** The side touches air. */
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
  /** Concave corners: both adjacent sides are connected but the diagonal is open. */
  cNW: boolean
  cNE: boolean
  cSW: boolean
  cSE: boolean
  /** Convex corners: both adjacent sides are exposed. */
  oTL: boolean
  oTR: boolean
  oBL: boolean
  oBR: boolean
  /** Nothing is exposed (no concave corner either). */
  buried: boolean
  /** 8 bits, one per neighbour (N, NE, E, SE, S, SW, W, NW), set when the neighbour joins. */
  mask: number
}

export function exposure(around: readonly Neighbour[], joins: (n: Neighbour) => boolean = isGround): Exposure {
  const j = around.map(joins)
  const [n, ne, e, se, s, sw, w, nw] = j
  const top = !n
  const right = !e
  const bottom = !s
  const left = !w
  const cNW = n && w && !nw
  const cNE = n && e && !ne
  const cSW = s && w && !sw
  const cSE = s && e && !se
  return {
    top,
    right,
    bottom,
    left,
    cNW,
    cNE,
    cSW,
    cSE,
    oTL: top && left,
    oTR: top && right,
    oBL: bottom && left,
    oBR: bottom && right,
    buried: !(top || right || bottom || left || cNW || cNE || cSW || cSE),
    mask: j.reduce((m, v, i) => m | (v ? 1 << i : 0), 0)
  }
}

/** Left/right neighbours of a ledge piece. */
export function ledgeEnds(around: readonly Neighbour[]) {
  return { leftEnd: !isPlatform(around[6]), rightEnd: !isPlatform(around[2]) }
}

// ------------------------------------------------------------------------------------------------- world space

/** World pixel of the tile's top-left corner, wrapped so the pattern repeats (see the header). */
export const origin = (q: Pick<TileQuery, 'tx' | 'ty'>) => ({
  ox: wrap(q.tx, WRAP_X) * TILE,
  oy: wrap(q.ty, WRAP_Y) * TILE
})

/** Value noise in [0, 1) of a world cell of `cell` px, periodic with the world wrap. */
export function cellNoise(wx: number, wy: number, cell: number, seed: number) {
  const nx = (WRAP_X * TILE) / cell
  const ny = (WRAP_Y * TILE) / cell
  return (hash(wrap(Math.floor(wx / cell), nx), wrap(Math.floor(wy / cell), ny), seed) & 0xffff) / 0x10000
}

/** 1-D noise along x (or y with `wy` = 0 passed for the other axis). */
export const lineNoise = (v: number, cell: number, seed: number) => cellNoise(v, 0, cell, seed)

export interface ScatterOptions {
  /** Cell size in world px (must divide 384). */
  cell: number
  seed: number
  /** Probability that a cell holds a feature. */
  chance?: number
  /** How far a feature may reach beyond its cell (px); cells this close to the tile are visited. */
  margin?: number
}

/**
 * Calls `draw` for every feature whose cell is near the tile, with the feature position in **tile** coordinates.
 * Features are placed by a hash of the (wrapped) world cell, so neighbouring tiles agree on every feature that
 * crosses their border: draw the whole feature each time and let the raster clip it.
 */
export function scatter(
  r: Raster,
  q: Pick<TileQuery, 'tx' | 'ty'>,
  o: ScatterOptions,
  draw: (r: Raster, x: number, y: number, rnd: () => number) => void
) {
  const { ox, oy } = origin(q)
  const nx = (WRAP_X * TILE) / o.cell
  const ny = (WRAP_Y * TILE) / o.cell
  const m = o.margin ?? o.cell
  const chance = o.chance ?? 1
  for (let cy = Math.floor((oy - m) / o.cell); cy <= Math.floor((oy + TILE - 1 + m) / o.cell); cy++)
    for (let cx = Math.floor((ox - m) / o.cell); cx <= Math.floor((ox + TILE - 1 + m) / o.cell); cx++) {
      const rnd = rng(hash(wrap(cx, nx), wrap(cy, ny), o.seed))
      if (rnd() >= chance) continue
      draw(r, Math.round(cx * o.cell + rnd() * o.cell - ox), Math.round(cy * o.cell + rnd() * o.cell - oy), rnd)
    }
}

// ---------------------------------------------------------------------------------------------------- caching

/**
 * Caches a tile builder by kind + neighbour mask + position variant. `positional` kinds (everything painted from
 * world space) vary with `tx mod WRAP_X`, `ty mod WRAP_Y`; ledges and spikes vary with `tx mod 4`.
 */
export function memoTile(build: (q: TileQuery) => Raster) {
  const cache = new Map<string, Raster>()
  return (q: TileQuery): Raster => {
    const mask = q.around.reduce((m: number, n, i) => m | (kindBits(n) << (i * 3)), 0)
    const key =
      q.kind === 'platform' || q.kind === 'spike'
        ? `${q.kind}:${mask}:${wrap(q.tx, 4)}`
        : `${q.kind}:${mask}:${wrap(q.tx, WRAP_X)}:${wrap(q.ty, WRAP_Y)}`
    let tile = cache.get(key)
    if (!tile) {
      tile = build(q)
      cache.set(key, tile)
    }
    return tile
  }
}

const KIND_BITS: Record<TileKind | 'empty', number> = { empty: 0, solid: 1, dirt: 2, platform: 3, spike: 4 }
const kindBits = (n: Neighbour) => (n === undefined ? 5 : KIND_BITS[n])

// ------------------------------------------------------------------------------------------------ shared bits

export interface Ctx {
  r: Raster
  q: TileQuery
  ex: Exposure
  /** World pixel of the tile origin. */
  ox: number
  oy: number
}

export const makeCtx = (q: TileQuery, ex: Exposure, r = new Raster(TILE, TILE)): Ctx => ({ r, q, ex, ...origin(q) })

/** A ball-shaded pebble: lit top-left, shaded bottom-right. */
export function pebble(r: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp) {
  ball(r, cx, cy, rx, ry, ramp, false)
}

/** A hand-made ramp that is the given ramp shifted one step darker (for far or low-contrast details). */
export const dim = (r: Ramp): Ramp => [r[1], r[2], r[3], r[3], r[4]]

/** Stroke of 1 px steps through points, each segment `w` px thick. */
export function stroke(r: Raster, pts: readonly [number, number][], w: number, c: number) {
  for (let i = 0; i + 1 < pts.length; i++) r.thick(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c)
}

/** Wobbly crack/root path from (x, y) heading `angle`, `n` segments of about `len` px. */
export function wander(
  rnd: () => number,
  x: number,
  y: number,
  angle: number,
  n: number,
  len: number,
  bend = 0.7
): [number, number][] {
  const pts: [number, number][] = [[x, y]]
  for (let i = 0; i < n; i++) {
    angle += (rnd() - 0.5) * bend * 2
    x += Math.cos(angle) * len * (0.7 + rnd() * 0.6)
    y += Math.sin(angle) * len * (0.7 + rnd() * 0.6)
    pts.push([x, y])
  }
  return pts
}

// ----------------------------------------------------------------------------------------------- ground (solid)

export interface GroundStyle {
  seed: number
  /** Top lip material and the soil beneath. */
  grass: Ramp
  soil: Ramp
  /** Average thickness of the lip in px (blades hang below it by up to `blade` px more). */
  lip: number
  blade: number
  /** Radius of rounded outer corners. */
  round: number
  /** Paints the calm buried fill over the flat soil colour (strata, pebbles, roots…), in world space. */
  fill: (c: Ctx) => void
  /** Optional extras painted after the lip: dew, moss, roots over the grass. */
  lipDetail?: (c: Ctx, lipEnd: (wx: number) => number) => void
  /** Optional extras on undersides and sides: hanging roots, stones. */
  edgeDetail?: (c: Ctx) => void
  /** Replaces the wavy grass lip thickness (px at world x). */
  lipEnd?: (wx: number) => number
  /**
   * Replaces the colour rule of the cap: called for every pixel up to `end + 2` px below the surface (`t` = distance
   * from the surface, `end` = cap thickness there). Return 0 to keep what is already painted.
   */
  capColour?: (t: number, end: number, wx: number, wy: number) => number
  /** Replaces the thickness of the shaded underside band (px at world x). */
  underDepth?: (wx: number) => number
  /** Replaces the underside colour: `b` = distance to the bottom edge. Return 0 to keep the fill. */
  underColour?: (b: number, wx: number, wy: number) => number
  /** Replaces the side rim colour: `d` = distance to the exposed side edge, `lit` = the left (lit) side. */
  sideColour?: (d: number, wy: number, lit: boolean) => number
}

/** Lip thickness at world x: gentle waves plus blades hanging down in 6 px groups. */
export function lipProfile(style: Pick<GroundStyle, 'seed' | 'lip' | 'blade'>) {
  const prof = [0.3, 0.75, 1, 1, 0.75, 0.3]
  return (wx: number) => {
    const wave = Math.round(Math.sin(wx / 23) * 1.1 + Math.sin(wx / 9.7) * 0.8)
    const k = Math.floor(wx / 6)
    const len = 1 + Math.floor(lineNoise(k * 6, 6, style.seed + 11) * (style.blade + 1))
    return style.lip + wave + Math.round(len * prof[wrap(wx, 6)])
  }
}

/** Paints soil fill shared by all grounds: strata streaks and pebbles; themes add their own on top. */
export interface SoilOptions {
  /** Chance that a 96 px cell holds a buried root (default 0.5). */
  rootChance?: number
  /** Root groove and lit lip colours (default: soil shade and highlight). */
  rootDark?: number
  rootLight?: number
}

export function soilFill(c: Ctx, soil: Ramp, seed: number, rock: Ramp = soil, o: SoilOptions = {}) {
  const { r } = c
  r.rect(0, 0, TILE, TILE, soil[1])
  // Strata: slightly darker wavy streaks.
  scatter(r, c.q, { cell: 48, seed: seed + 1, chance: 0.85, margin: 40 }, (l, x, y, rnd) => {
    const len = 16 + Math.floor(rnd() * 20)
    let yy = y
    for (let i = 0; i < len; i += 4) {
      if (rnd() < 0.3) yy += rnd() < 0.5 ? -1 : 1
      l.rect(x + i, yy, 4, 2, soil[2])
    }
    // The lit lip of the streak underneath.
    if (rnd() < 0.6) l.rect(x + 3, yy + 2, Math.max(4, len - 8), 1, soil[0])
  })
  // Buried roots / old fossils: long wavy strokes with a lit lip, two or three per ten tiles.
  scatter(r, c.q, { cell: 96, seed: seed + 3, chance: o.rootChance ?? 0.5, margin: 60 }, (l, x, y, rnd) => {
    const path = wander(rnd, x, y, (rnd() - 0.5) * 1.2 + (rnd() < 0.5 ? 0 : Math.PI), 5, 9, 0.5)
    stroke(
      l,
      path.map(([px, py]) => [px, py + 1] as [number, number]),
      2,
      o.rootLight ?? soil[0]
    )
    stroke(l, path, 2, o.rootDark ?? soil[2])
  })
  // Larger half-buried stones, one every few tiles.
  scatter(r, c.q, { cell: 96, seed: seed + 4, chance: 0.55, margin: 10 }, (l, x, y, rnd) => {
    const rx = 5 + Math.floor(rnd() * 3)
    ball(l, x, y, rx, rx - 2, [soil[0], soil[0], soil[1], soil[2], soil[4]] as Ramp, false)
    l.rect(x - 1, y - 2, 2, 1, soil[0])
  })
  // Pebbles.
  scatter(r, c.q, { cell: 32, seed: seed + 2, chance: 0.5, margin: 8 }, (l, x, y, rnd) => {
    const rx = 2 + Math.floor(rnd() * 3)
    pebble(
      l,
      x,
      y,
      rx,
      Math.max(2, rx - 1),
      rnd() < 0.25 ? rock : ([soil[0], soil[0], soil[1], soil[2], soil[4]] as Ramp)
    )
  })
}

/**
 * The finished `solid` tile: fill, then underside, side rims and the lip, with rounded outer corners and closed
 * inner corners. See the header for the structure.
 */
export function paintGround(q: TileQuery, style: GroundStyle): Raster {
  const ex = exposure(q.around)
  const c = makeCtx(q, ex)
  const { r, ox, oy } = c
  const { grass, soil } = style
  style.fill(c)
  const lipEnd = style.lipEnd ?? lipProfile(style)
  const under = style.underDepth ?? ((wx: number) => 4 + Math.floor(lineNoise(wx, 3, style.seed + 21) * 5))
  const rimL = (wy: number) => 3 + (lineNoise(wy, 5, style.seed + 22) > 0.5 ? 1 : 0)
  const rimR = (wy: number) => 4 + Math.floor(lineNoise(wy, 5, style.seed + 23) * 3)
  const rad = style.round

  // Which pixels lie outside a rounded outer corner.
  const outside = new Uint8Array(TILE * TILE)
  const corner = (on: boolean, cx: number, cy: number, x0: number, y0: number) => {
    if (!on) return
    for (let y = y0; y < y0 + rad; y++)
      for (let x = x0; x < x0 + rad; x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > rad * rad) outside[y * TILE + x] = 1
  }
  corner(ex.oTL, rad, rad, 0, 0)
  corner(ex.oTR, TILE - rad, rad, TILE - rad, 0)
  corner(ex.oBL, rad, TILE - rad, 0, TILE - rad)
  corner(ex.oBR, TILE - rad, TILE - rad, TILE - rad, TILE - rad)

  const isOut = (x: number, y: number) => x >= 0 && y >= 0 && x < TILE && y < TILE && outside[y * TILE + x] === 1

  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = ox + x
      const wy = oy + y
      if (isOut(x, y)) {
        r.set(x, y, ex.top && y < rad ? grass[4] : soil[4])
        continue
      }
      // Distances to the exposed features (Infinity when there is none).
      let t = ex.top ? y : Infinity
      if (ex.cNW) t = Math.min(t, Math.hypot(x, y))
      if (ex.cNE) t = Math.min(t, Math.hypot(TILE - 1 - x, y))
      let b = ex.bottom ? TILE - 1 - y : Infinity
      if (ex.cSW) b = Math.min(b, Math.hypot(x, TILE - 1 - y))
      if (ex.cSE) b = Math.min(b, Math.hypot(TILE - 1 - x, TILE - 1 - y))
      const l = ex.left ? x : Infinity
      const rr = ex.right ? TILE - 1 - x : Infinity

      // Outline along exposed edges and around rounded corners.
      const rim =
        t === 0 ||
        b === 0 ||
        l === 0 ||
        rr === 0 ||
        isOut(x - 1, y) ||
        isOut(x + 1, y) ||
        isOut(x, y - 1) ||
        isOut(x, y + 1)
      if (rim) {
        r.set(x, y, t === 0 || (ex.top && y <= 1 && (l === 0 || rr === 0)) ? grass[4] : soil[4])
        continue
      }
      let col = 0
      // Underside: dark, ragged.
      const bd = under(wx)
      if (style.underColour) {
        if (b <= bd) col = style.underColour(b, wx, wy) || col
      } else if (b <= bd) col = b <= 2 || (b <= 3 && lineNoise(wx, 4, style.seed + 24) > 0.5) ? soil[3] : soil[2]
      // Sides: lit on the left, shaded on the right.
      if (style.sideColour) {
        if (l <= 8) col = style.sideColour(l, wy, true) || col
        else if (rr <= 8) col = style.sideColour(rr, wy, false) || col
      } else if (l <= rimL(wy)) col = soil[0]
      else if (rr <= rimR(wy)) col = rr <= 1 ? soil[3] : soil[2]
      // Lip on top, with a contact shadow beneath it.
      const end = lipEnd(wx)
      if (style.capColour) {
        if (t <= end + 2) col = style.capColour(t, end, wx, wy) || col
      } else if (t <= end) col = lipColour(grass, t, end, wx, style.seed)
      else if (t <= end + 2 && !ex.cNW && !ex.cNE) col = t <= end + 1 ? soil[3] : soil[2]
      if (col) r.set(x, y, col)
    }
  style.edgeDetail?.(c)
  style.lipDetail?.(c, lipEnd)
  return r
}

/** Colour of the lip at distance `t` from the surface, where the lip ends at `end` (world x for the blade rhythm). */
function lipColour(g: Ramp, t: number, end: number, wx: number, seed: number) {
  const tt = Math.round(t)
  const lit = wrap(wx, 6) < 3
  if (tt >= end) return g[3]
  if (tt >= end - 2) return g[2]
  // Gaps between blades: one darker stroke down each blade boundary.
  if (wrap(wx, 6) === 0 && tt >= 4) return g[2]
  if (tt <= 1) return g[0]
  if (tt === 2) return lit ? g[0] : g[1]
  return g[1]
}

// -------------------------------------------------------------------------------------------------- dirt

export interface DirtStyle {
  seed: number
  clay: Ramp
  /** Embedded stones. */
  rock: Ramp
  /** Radius of rounded outer corners. */
  round?: number
}

/**
 * Diggable dirt: light clay with bold cracks, embedded stones and a crumbly border where it meets air. Beside
 * solid ground the border is a clean line; beside other dirt it vanishes and the cracks flow across the join.
 */
export function paintDirt(q: TileQuery, style: DirtStyle): Raster {
  const ex = exposure(q.around, isDirt)
  const c = makeCtx(q, ex)
  const { r, ox, oy } = c
  const { clay, rock } = style
  const rad = style.round ?? 5
  r.rect(0, 0, TILE, TILE, clay[1])

  // Cracked slabs: a jittered Voronoi pattern in world space. Pixels near a seam become a dark groove, the slab
  // edge on its lit (upper-left) side gets a highlight and the other side a shade, so slabs look bevelled.
  const CELL = 32
  const nx = (WRAP_X * TILE) / CELL
  const ny = (WRAP_Y * TILE) / CELL
  const seeds = new Map<string, [number, number, number]>()
  const seedAt = (cx: number, cy: number): [number, number, number] => {
    const key = `${cx},${cy}`
    let s = seeds.get(key)
    if (!s) {
      const h = hash(wrap(cx, nx), wrap(cy, ny), style.seed + 5)
      const a = rng(h)
      s = [cx * CELL + CELL * (0.2 + a() * 0.6), cy * CELL + CELL * (0.2 + a() * 0.6), a()]
      seeds.set(key, s)
    }
    return s
  }
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = ox + x + 0.5
      const wy = oy + y + 0.5
      const cx0 = Math.floor(wx / CELL)
      const cy0 = Math.floor(wy / CELL)
      let d1 = Infinity
      let d2 = Infinity
      let best: [number, number, number] = [0, 0, 0]
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const s = seedAt(cx0 + i, cy0 + j)
          const d = Math.hypot(wx - s[0], wy - s[1])
          if (d < d1) {
            d2 = d1
            d1 = d
            best = s
          } else if (d < d2) d2 = d
        }
      const e = (d2 - d1) / 2
      let col = best[2] < 0.3 ? clay[0] : clay[1]
      if (e < 1.4) col = clay[3]
      else if (e < 2.4 && wx + wy < best[0] + best[1]) col = clay[0]
      r.set(x, y, col)
    }
  // Embedded stones with their own outline.
  scatter(r, q, { cell: 32, seed: style.seed + 4, chance: 0.45, margin: 8 }, (l, x, y, rnd) => {
    const rx = 3 + Math.floor(rnd() * 2)
    const stone = new Raster(16, 16)
    ball(stone, 8, 8, rx, rx - 1, rock, false)
    outline(stone)
    l.blit(stone, x - 8, y - 8)
  })

  // Edges.
  const air = (side: number) => q.around[side] !== 'solid' && q.around[side] !== 'dirt' && q.around[side] !== undefined
  const airT = ex.top && air(0)
  const airR = ex.right && air(2)
  const airB = ex.bottom && air(4)
  const airL = ex.left && air(6)
  const outside = new Uint8Array(TILE * TILE)
  const corner = (on: boolean, cx: number, cy: number, x0: number, y0: number) => {
    if (!on) return
    for (let y = y0; y < y0 + rad; y++)
      for (let x = x0; x < x0 + rad; x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > rad * rad) outside[y * TILE + x] = 1
  }
  corner(airT && airL, rad, rad, 0, 0)
  corner(airT && airR, TILE - rad, rad, TILE - rad, 0)
  corner(airB && airL, rad, TILE - rad, 0, TILE - rad)
  corner(airB && airR, TILE - rad, TILE - rad, TILE - rad, TILE - rad)
  const isOut = (x: number, y: number) => x >= 0 && y >= 0 && x < TILE && y < TILE && outside[y * TILE + x] === 1
  // Crumble: the dark border is 1–3 px thick on air sides, ragged in clumps of 3 px.
  const crumble = (v: number, salt: number) => 1 + Math.floor(lineNoise(v, 3, style.seed + salt) * 3)
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wx = ox + x
      const wy = oy + y
      const dT = ex.top ? y : Infinity
      const dB = ex.bottom ? TILE - 1 - y : Infinity
      const dL = ex.left ? x : Infinity
      const dR = ex.right ? TILE - 1 - x : Infinity
      if (isOut(x, y)) {
        r.set(x, y, clay[4])
        continue
      }
      if (
        dT === 0 ||
        dB === 0 ||
        dL === 0 ||
        dR === 0 ||
        isOut(x - 1, y) ||
        isOut(x + 1, y) ||
        isOut(x, y - 1) ||
        isOut(x, y + 1)
      ) {
        r.set(x, y, clay[4])
        continue
      }
      let col = 0
      // Lit left/top rims, shaded right/bottom rims, each also a little ragged on air sides.
      if (dL <= (airL ? crumble(wy, 31) : 1)) col = airL ? clay[3] : clay[0]
      else if (dL <= (airL ? crumble(wy, 31) + 2 : 2)) col = clay[0]
      if (dT <= (airT ? crumble(wx, 32) : 1)) col = airT ? clay[3] : clay[0]
      else if (dT <= (airT ? crumble(wx, 32) + 2 : 2)) col = clay[0]
      if (dR <= (airR ? crumble(wy, 33) : 1)) col = clay[3]
      else if (dR <= (airR ? crumble(wy, 33) + 3 : 3) && col === 0) col = clay[2]
      if (dB <= (airB ? crumble(wx, 34) + 1 : 1)) col = clay[3]
      else if (dB <= (airB ? crumble(wx, 34) + 4 : 3) && col === 0) col = clay[2]
      if (col) r.set(x, y, col)
    }
  return r
}

// ----------------------------------------------------------------------------------------------- platform

export interface PlatformStyle {
  seed: number
  wood: Ramp
  /** Rope that lashes the ends. */
  rope: Ramp
  /** Paints extras (moss, drips) over the finished ledge. `ends` tells which end pieces this tile is. */
  detail?: (c: Ctx, ends: { leftEnd: boolean; rightEnd: boolean }) => void
}

/** Ledge thickness: the tile is transparent below this row. */
export const LEDGE_H = 20

/**
 * A one-way ledge in the top 20 px: planks with a lit top, a dark underside, knee braces or a hanging rope below,
 * and end pieces with visible end grain and lashing.
 */
export function paintPlatform(q: TileQuery, style: PlatformStyle): Raster {
  const ends = ledgeEnds(q.around)
  const ex = exposure(q.around, isPlatform)
  const c = makeCtx(q, ex)
  const { r } = c
  const { wood, rope } = style
  const body = 13 // plank rows 0..12, outline on row 13, braces below
  const h = hash(q.tx, 7, style.seed)
  // Plank block, rounded where the ledge stops.
  for (let y = 0; y < body; y++)
    for (let x = 0; x < TILE; x++) {
      const e = Math.min(ends.leftEnd ? x : 99, ends.rightEnd ? TILE - 1 - x : 99)
      if (e < 3 && (y < 3 - e || y > body - 1 - (3 - e))) continue
      r.set(x, y, y === 0 ? wood[4] : y <= 2 ? wood[0] : y >= 11 ? wood[3] : y >= 9 ? wood[2] : wood[1])
    }
  // Plank seams (a groove with a lit lip) and grain strokes.
  for (const sx of [16, 48]) {
    r.rect(sx, 3, 1, 8, wood[3])
    r.rect(sx + 1, 3, 1, 5, wood[0])
  }
  r.rect(22 + (h % 5), 5, 8, 1, wood[2])
  r.rect(4 + ((h >> 3) % 5), 7, 7, 1, wood[2])
  r.rect(36 + ((h >> 6) % 5), 6, 9, 1, wood[2])
  if (h % 3 === 0) r.ellipse(31, 6, 2, 1.5, wood[3])
  for (let x = 0; x < TILE; x++) if (r.get(x, body - 1)) r.set(x, body, wood[4])
  // Knee braces (little triangular gussets) hanging from the underside, or a rope with a knot.
  const gusset = (cx: number) => {
    for (let k = 0; k < 6; k++) {
      const half = 3 - Math.floor(k / 2)
      for (let x = cx - half; x <= cx + half; x++)
        r.set(x, body + 1 + k, x === cx - half ? wood[4] : x === cx + half ? wood[4] : k < 3 ? wood[2] : wood[3])
    }
    r.set(cx, body + 6, wood[4])
  }
  const variant = h % 3
  if (variant !== 2) {
    gusset(11 + (h % 3))
    gusset(51 - (h % 3))
  } else {
    gusset(11)
    // A hanging rope with a knot.
    r.rect(40, body + 1, 2, 3, rope[1])
    r.rect(39, body + 3, 4, 3, rope[2])
    r.rect(39, body + 3, 2, 1, rope[0])
    r.rect(39, body + 6, 4, 1, rope[4])
  }
  // Lashing and end grain on the end pieces.
  const lash = (x0: number) => {
    for (let y = 1; y < body - 1; y++) {
      r.rect(x0, y, 3, 1, (y + x0) % 4 < 2 ? rope[1] : rope[2])
    }
    r.rect(x0, 1, 1, body - 2, rope[0])
    r.rect(x0 + 2, 1, 1, body - 2, rope[3])
  }
  if (ends.leftEnd) {
    r.ellipse(5.5, 6.5, 3, 4.6, wood[0])
    r.ellipse(5.5, 6.5, 2, 3.4, wood[1])
    r.ellipse(5.5, 6.5, 1, 1.6, wood[2])
    lash(11)
  }
  if (ends.rightEnd) {
    r.ellipse(58, 6.5, 3, 4.6, wood[1])
    r.ellipse(58, 6.5, 2, 3.4, wood[2])
    r.ellipse(58, 6.5, 1, 1.6, wood[3])
    lash(50)
  }
  style.detail?.(c, ends)
  // Nothing below the ledge.
  for (let y = LEDGE_H; y < TILE; y++) for (let x = 0; x < TILE; x++) r.data[y * TILE + x] = 0
  return r
}

// -------------------------------------------------------------------------------------------------- spikes

export interface SpikeStyle {
  seed: number
  steel: Ramp
  /** The base the spikes rise from: the theme's ground ramps. */
  base: Ramp
  /** Optional lip colour for the base's top edge (grass for open ground). */
  lip?: Ramp
  /** Paints extra detail on the finished base (rows `baseTop`…63), e.g. brick joints. */
  baseDetail?: (r: Raster, baseTop: number, tx: number) => void
}

/**
 * Four steel spikes on a base filling the bottom 16 px. Where a neighbour is ground (the wall of a pit) the base
 * merges with it: no rim on that side.
 */
export function paintSpike(q: TileQuery, style: SpikeStyle): Raster {
  const r = new Raster(TILE, TILE)
  const { steel, base } = style
  const joinsL = isGround(q.around[6]) || q.around[6] === 'spike'
  const joinsR = isGround(q.around[2]) || q.around[2] === 'spike'
  const baseTop = 48
  // Spikes first (the base overlaps their feet).
  for (let i = 0; i < 4; i++) {
    const cx = 8 + i * 16
    const tip = 9
    for (let y = tip; y < baseTop + 2; y++) {
      const f = (y - tip) / (baseTop - tip) // 0 at the tip, 1 at the foot
      const half = Math.max(0.5, f * 6.6)
      const x0 = Math.round(cx - half)
      const x1 = Math.round(cx + half) - 1
      for (let x = x0; x <= x1; x++) {
        let col = steel[1]
        const rel = (x - x0) / Math.max(1, x1 - x0)
        if (x === x0 && f > 0.05) col = steel[0]
        else if (x === x0 + 1 && f > 0.3 && x1 - x0 > 3) col = steel[0]
        else if (x === x1) col = steel[3]
        else if (rel > 0.62) col = steel[2]
        r.set(x, y, col)
      }
    }
    // Bright glint just below the tip on the lit edge.
    r.rect(cx - 1, tip + 4, 1, 3, steel[0])
  }
  // Dark outline of the spikes (selective, only above the base).
  const spikes = r.clone()
  outline(spikes)
  for (let y = 8; y < baseTop; y++) for (let x = 0; x < TILE; x++) if (!r.get(x, y)) r.set(x, y, spikes.get(x, y))
  // The base.
  for (let y = baseTop; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      let col = base[1]
      const yy = y - baseTop
      if (yy === 0) col = base[4]
      else if (yy <= 2) col = base[0]
      else if (yy >= 12) col = base[2]
      if (!joinsL && x === 0) col = base[4]
      else if (!joinsL && x <= 2) col = base[0]
      if (!joinsR && x === TILE - 1) col = base[4]
      else if (!joinsR && x >= TILE - 3) col = base[3]
      if (y === TILE - 1) col = base[4]
      r.set(x, y, col)
    }
  // Round the exposed lower corners of the base (opaque neighbours keep them square).
  // A few stones in the base so it is not a flat slab.
  const rnd = rng(hash(q.tx, style.seed, 5))
  for (let k = 0; k < 2; k++) {
    const px = 6 + Math.floor(rnd() * 50)
    r.ellipse(px, baseTop + 8 + k * 3, 2.5, 1.6, base[2])
  }
  style.baseDetail?.(r, baseTop, q.tx)
  return r
}

// ----------------------------------------------------------------------------------------------- decorations

/**
 * Paints a decoration into a fresh raster and crops it. `sink` is how many rows of the sprite overlap the tile
 * edge it stands on (so tufts root into the lip instead of hovering).
 */
export function decor(
  where: 'top' | 'under',
  weight: number,
  w: number,
  h: number,
  draw: (r: Raster) => void,
  options: { outline?: boolean; sink?: number } = {}
): Decor {
  const built = memo(() => {
    const pad = 2
    const canvas = new Raster(w + pad * 2, h + pad * 2)
    draw(canvas)
    if (options.outline !== false) outline(canvas)
    const b = canvas.bounds()
    if (!b) throw new Error('decoration is empty')
    const image = canvas.crop(b.x, b.y, b.w, b.h)
    if (image.w > 32) throw new Error(`decoration is ${image.w}px wide`)
    const sink = options.sink ?? 1
    // Anchor: horizontal centre of the painted pixels; vertical is the standing edge.
    const ax = Math.floor(image.w / 2)
    const anchor: readonly [number, number] = where === 'top' ? [ax, image.h - sink] : [ax, sink - 1]
    return { image, anchor }
  })
  // Drawn when the view first reads the picture, not when the world's module is imported.
  return {
    where,
    weight,
    get image() {
      return built().image
    },
    get anchor() {
      return built().anchor
    }
  }
}

// ------------------------------------------------------------------------------------- decoration pieces

/** One grass blade rising from (x, y) and leaning by `lean` px at the tip; two pixels wide at the foot. */
export function blade(r: Raster, x: number, y: number, lean: number, h: number, g: Ramp) {
  for (let i = 0; i < h; i++) {
    const t = h <= 1 ? 0 : i / (h - 1)
    const cx = Math.round(x + lean * t * t)
    const yy = y - i
    if (t < 0.6) {
      r.set(cx, yy, g[1])
      r.set(cx + 1, yy, g[2])
    } else r.set(cx, yy, g[1])
  }
}

/** A tuft: several blades fanned out from the same foot. */
export function tuft(r: Raster, x: number, y: number, blades: readonly [number, number][], g: Ramp) {
  for (const [lean, h] of blades) blade(r, x, y, lean, h, g)
}

/** A round-capped mushroom with optional dots. The cap is lit top-left. */
export function mushroom(
  r: Raster,
  x: number,
  y: number,
  o: { cap: Ramp; stem: Ramp; capW: number; capH: number; stemH: number; dots?: number; stemW?: number }
) {
  const sw = o.stemW ?? 3
  r.rect(x - Math.floor(sw / 2), y - o.stemH, sw, o.stemH, o.stem[1])
  r.rect(x - Math.floor(sw / 2) + sw - 1, y - o.stemH, 1, o.stemH, o.stem[2])
  const layer = new Raster(r.w, r.h)
  const cy = y - o.stemH
  ball(layer, x, cy, o.capW / 2, o.capH, o.cap)
  for (let yy = cy + Math.ceil(o.capH * 0.3); yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) layer.set(xx, yy, 0)
  r.blit(layer)
  if (o.dots) {
    r.rect(x - 2, cy - Math.floor(o.capH * 0.6), 2, 2, o.stem[0])
    if (o.dots > 1) r.rect(x + 2, cy - Math.floor(o.capH * 0.3), 2, 2, o.stem[0])
  }
}

/** A flower head: `n` petals round a centre. */
export function flowerHead(
  r: Raster,
  x: number,
  y: number,
  petal: Ramp,
  centre: number,
  o: { n?: number; rad?: number; pr?: number } = {}
) {
  const n = o.n ?? 5
  const rad = o.rad ?? 3
  const pr = o.pr ?? 1.6
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    ball(r, x + Math.cos(a) * rad, y + Math.sin(a) * rad, pr, pr, petal, false)
  }
  r.ellipse(x, y, 1.6, 1.6, centre)
}

/** A cluster of small stones. */
export function stones(r: Raster, x: number, y: number, list: readonly [number, number, number][], rock: Ramp) {
  for (const [dx, rx, ry] of list) ball(r, x + dx, y - ry, rx, ry, rock, false)
}

/** A leaf: a pointed ellipse of half-length `rx` and half-width `ry` turned by `angle` (radians), with a midrib. */
export function leafShape(r: Raster, cx: number, cy: number, rx: number, ry: number, angle: number, g: Ramp) {
  const pts: number[] = []
  const n = 10
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const px = Math.cos(a) * rx
    const py = Math.sin(a) * ry * (1 - 0.35 * Math.max(0, Math.cos(a)))
    pts.push(cx + px * Math.cos(angle) - py * Math.sin(angle), cy + px * Math.sin(angle) + py * Math.cos(angle))
  }
  r.poly(pts, g[1])
  r.line(
    cx - Math.cos(angle) * rx * 0.8,
    cy - Math.sin(angle) * rx * 0.8,
    cx + Math.cos(angle) * rx * 0.8,
    cy + Math.sin(angle) * rx * 0.8,
    g[2]
  )
  r.set(cx - Math.cos(angle) * rx * 0.3 - 1, cy - Math.sin(angle) * rx * 0.3 - 1, g[0])
}

// ------------------------------------------------------------------------------------------- masonry & spires

export interface Brick {
  /** World pixel bounds of the block: x0..x1 and y0..y1 exclusive on the far side. */
  x0: number
  x1: number
  y0: number
  y1: number
  /** Stable per-block value in [0, 1) for tone and detail. */
  id: number
  /** Course index. */
  row: number
}

export interface CourseOptions {
  seed: number
  /** Course height in px (must divide 1152). */
  h: number
  /**
   * Block width patterns: each pattern is a list of widths that sums to the same `period` (must divide 1536). A
   * course picks a pattern and a starting offset by hash, so joints are offset from course to course.
   */
  patterns: readonly (readonly number[])[]
  /** Joint offsets of a course are multiples of this many px (default 8; 12 gives half-brick staggering). */
  snap?: number
}

/** The block of a course-laid wall (ashlar, brick) at a world pixel; periodic with the world wrap. */
export function brickAt(wx: number, wy: number, o: CourseOptions): Brick {
  const rows = (WRAP_Y * TILE) / o.h
  const row = wrap(Math.floor(wy / o.h), rows)
  const h = hash(row, 17, o.seed)
  const pattern = o.patterns[h % o.patterns.length]
  const period = pattern.reduce((s, v) => s + v, 0)
  const snap = o.snap ?? 8
  const start = ((h >> 8) % period) - (((h >> 8) % period) % snap)
  const x = wrap(wx - start, WRAP_X * TILE)
  // Walk the pattern inside the period the pixel falls in.
  const cycle = Math.floor(x / period)
  let acc = cycle * period
  for (let i = 0; ; i++) {
    const w = pattern[i % pattern.length]
    if (x < acc + w) {
      const x0 = wrap(acc + start, WRAP_X * TILE)
      return {
        x0: wx - (x - acc),
        x1: wx - (x - acc) + w,
        y0: Math.floor(wy / o.h) * o.h,
        y1: Math.floor(wy / o.h) * o.h + o.h,
        id: (hash(Math.floor(x0 / 8), row, o.seed + 1) & 0xffff) / 0x10000,
        row
      }
    }
    acc += w
  }
}

/**
 * A pointed spire (stalagmite, crystal, shard) standing on `y` (or hanging from it when `down`): lit left half,
 * shaded right half, deepest edge on the far right. `lean` shifts the tip sideways in px.
 */
export function spire(r: Raster, x: number, y: number, halfW: number, h: number, g: Ramp, down = false, lean = 0) {
  for (let i = 0; i < h; i++) {
    const f = i / h
    const half = Math.max(0.5, halfW * (1 - f) ** 0.85)
    const cx = x + lean * f * f
    const x0 = Math.round(cx - half)
    const x1 = Math.round(cx + half) - 1
    const yy = down ? y + i : y - i
    for (let xx = x0; xx <= x1; xx++) {
      const rel = (xx - x0) / Math.max(1, x1 - x0)
      r.set(xx, yy, xx === x1 && x1 - x0 > 1 ? g[3] : rel > 0.5 ? g[2] : xx === x0 && x1 - x0 > 1 ? g[0] : g[1])
    }
  }
}
