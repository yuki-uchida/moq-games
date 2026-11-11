/**
 * Shared helpers for the parallax backdrops (meadow, night, forest, and the themes drawn after them).
 *
 * Everything here is deterministic and **seam-safe**: a layer is 640 px wide and the view repeats it, so every
 * generator works on a circle of 640 columns.
 *
 *  - Ridge lines (`ridgeLine`) are sums of *periodic* waves, so column 639 flows into column 0 by construction.
 *  - Anything stamped with `stampShaded` / `tiled` is painted three times (-640, 0, +640): a shape that crosses
 *    the seam is whole on both edges. `scatter` keeps element centres away from the seam anyway, so no silhouette
 *    edge ever lands exactly on it (the tests compare columns 0 and 639).
 *  - Dithering (`gradient`, `glow`, `shafts`, `mist`, `fadeBottom`) is for skies, mist and light shafts only.
 *    Shapes are clean clusters shaded with `shadeMask` (light from the top-left, like the sprites).
 *
 * Typical layer:
 *
 *   const r = layerImage(120)                                   // 640 × (360 − 120), y of the layer = 120
 *   const top = ridgeLine(40, [{ cycles: 3, amp: 18 }, { cycles: 7, amp: 6 }], 11)
 *   fillLand(r, top, { tones: tonesOf(R.farGreen), facets: { k: 0.8 } })
 *   treeLine(r, top, { seed: 5, count: 24, kind: 'round', height: [8, 14], tones: tonesOf(R.farGreen, 1) })
 *   fadeBottom(r, 40, R.farGreen[2])
 *   return { image: r, parallax: 0.25, y: 120 }
 *
 * A layer's last pixel row is repeated down to the bottom of the view (pits), so the last row must be what
 * you want to see down there: `fadeBottom` ends in a solid colour.
 */
import { VIEW_H, VIEW_W } from '../../contract'
import { LIGHTER, type Ramp } from '../../palette'
import { Raster, bayer, noiseAt, rng } from '../../raster'

export const W = VIEW_W
export const H = VIEW_H

/** Column index folded into [0, 640). */
export const wrapX = (x: number) => ((Math.round(x) % W) + W) % W

/** Runs `draw(dx)` for the copies at -640, 0 and +640 so shapes crossing the seam are painted whole on both edges. */
export function tiled(draw: (dx: number) => void) {
  for (const dx of [-W, 0, W]) draw(dx)
}

/** A transparent layer image that starts at view row `y` and runs to the bottom of the view. */
export const layerImage = (y: number) => new Raster(W, H - y)

/** An opaque sky-sized raster (fill it with `gradient`). */
export const skyImage = () => new Raster(W, H)

const smoothstep = (f: number) => f * f * (3 - 2 * f)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Smooth value noise in [0, 1) that repeats every 640 px with `cycles` lattice cells across the width. */
export function periodic(x: number, cycles: number, seed = 0) {
  const p = (wrapX(x) / W) * cycles
  const i = Math.floor(p)
  const f = smoothstep(p - i)
  const a = noiseAt(i % cycles, 7, seed)
  const b = noiseAt((i + 1) % cycles, 7, seed)
  return a + (b - a) * f
}

export interface Wave {
  /** Whole number of repeats across the 640 px (keeps the seam closed). */
  cycles: number
  /** Height contribution in px. */
  amp: number
  /** `noise` = soft bumps, `ridged` = pointed peaks and round valleys (mountains), `sine` = regular rolling hills. */
  kind?: 'noise' | 'ridged' | 'sine'
  /** Sine phase in cycles. */
  phase?: number
}

/** Top edge (y per column, smaller = higher) of a seamless landform: `base` minus the sum of the waves. */
export function ridgeLine(base: number, waves: readonly Wave[], seed = 0): number[] {
  const out: number[] = []
  for (let x = 0; x < W; x++) {
    let v = 0
    waves.forEach((w, i) => {
      const kind = w.kind ?? 'noise'
      let n: number
      if (kind === 'sine') n = Math.sin(((x / W) * w.cycles + (w.phase ?? 0)) * Math.PI * 2)
      else {
        const u = periodic(x, w.cycles, seed + i * 101)
        n = kind === 'ridged' ? (1 - Math.abs(2 * u - 1)) * 2 - 1 : 2 * u - 1
      }
      v += n * w.amp
    })
    out.push(base - v)
  }
  return out
}

/** A mountain: summit column, summit row and how many px the flanks fall per px sideways. */
export type Peak = readonly [x: number, y: number, slope: number]

/**
 * Top edge of a mountain range: the lowest of several pointed cones (distance measured round the 640 px circle,
 * so ranges tile), roughened by `jag` px of fine noise. Gives clear summits and V-shaped valleys.
 */
export function peakLine(peaks: readonly Peak[], jag = 2, seed = 0): number[] {
  const out: number[] = []
  for (let x = 0; x < W; x++) {
    let y = Infinity
    for (const [px, py, slope] of peaks) {
      const d = Math.abs(x - px)
      y = Math.min(y, py + slope * Math.min(d, W - d))
    }
    out.push(y + (periodic(x, 53, seed) - 0.5) * jag + (periodic(x, 17, seed + 5) - 0.5) * jag)
  }
  return out
}

/** Moves a ridge line so its highest point (smallest y) is `y`. */
export function liftTo(line: readonly number[], y: number) {
  const d = y - Math.min(...line)
  return line.map((v) => v + d)
}

/** Averages a ridge line over ±`radius` columns (wrapping). */
export function blurLine(line: readonly number[], radius: number) {
  return line.map((_, x) => {
    let s = 0
    for (let d = -radius; d <= radius; d++) s += line[wrapX(x + d)]
    return s / (radius * 2 + 1)
  })
}

// --- tones ---------------------------------------------------------------------------------------------------

/** Four values of one material: highlight, base, shade, deep. */
export interface Tones {
  hi: number
  base: number
  shade: number
  deep: number
}

/** Tones taken from a ramp starting at step `from` (0 = highlight as `hi`; 1 = base as `hi`, …). */
export function tonesOf(ramp: Ramp, from = 0): Tones {
  const at = (i: number) => ramp[Math.min(3, from + i)]
  return { hi: at(0), base: at(1), shade: at(2), deep: at(3) }
}

// --- sky -------------------------------------------------------------------------------------------------------

export interface Stop {
  /** Row (0 = top of the raster). */
  at: number
  c: number
}

/** Vertical gradient through the stops, dithered with the Bayer matrix so no colour is invented. */
export function gradient(r: Raster, stops: readonly Stop[], x0 = 0, x1 = r.w) {
  for (let y = 0; y < r.h; y++) {
    let i = 0
    while (i < stops.length - 2 && y >= stops[i + 1].at) i++
    const a = stops[i]
    const b = stops[Math.min(i + 1, stops.length - 1)]
    const f = b.at === a.at ? 0 : clamp01((y - a.at) / (b.at - a.at))
    for (let x = x0; x < x1; x++) r.set(x, y, bayer(x, y) < f ? b.c : a.c)
  }
  return r
}

/**
 * Radial glow (sun, moon halo, canopy light): `colors` run from the outside in, blended by dithering. Paints over
 * whatever is there, so call it right after the gradient.
 */
export function glow(r: Raster, cx: number, cy: number, radius: number, colors: readonly number[], power = 1.4) {
  const n = colors.length
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(r.h - 1, Math.ceil(cy + radius)); y++)
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(r.w - 1, Math.ceil(cx + radius)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius
      if (d >= 1) continue
      const t = Math.pow(1 - d, power) * n
      const i = Math.floor(t)
      const level = i + (bayer(x, y) < t - i ? 1 : 0)
      if (level >= 1) r.set(x, y, colors[Math.min(level, n) - 1])
    }
  return r
}

export interface StarStyle {
  seed: number
  count: number
  /** Sky area stars may appear in. */
  area: { x0: number; y0: number; x1: number; y1: number }
  /** Circles (cx, cy, r) kept free of stars (the moon). */
  avoid?: readonly (readonly [number, number, number])[]
  /** Dim dot, normal star, bright star. */
  colors: { dim: number; mid: number; bright: number }
  /** Share of stars that are plus-shaped (`plus`) and four-point sparkles (`spark`); the rest are dots. */
  plus?: number
  spark?: number
  /** Pushes stars up the sky: 1 = even, larger = fewer near the horizon. */
  bias?: number
}

const PLUS = ['.a.', 'aBa', '.a.']
const SPARK = ['...a...', '...a...', '..aBa..', 'aaBBBaa', '..aBa..', '...a...', '...a...']

/** Scatters stars of two or three sizes by hash. The view adds the twinkle; this only paints them. */
export function starField(r: Raster, s: StarStyle) {
  const rnd = rng(s.seed)
  const { x0, y0, x1, y1 } = s.area
  let placed = 0
  for (let tries = 0; placed < s.count && tries < s.count * 40; tries++) {
    const x = Math.floor(x0 + rnd() * (x1 - x0))
    const y = Math.floor(y0 + Math.pow(rnd(), s.bias ?? 1.5) * (y1 - y0))
    if (s.avoid?.some(([cx, cy, cr]) => Math.hypot(x - cx, y - cy) < cr)) continue
    placed++
    const roll = rnd()
    const key = { a: s.colors.dim, B: s.colors.bright }
    if (roll < (s.spark ?? 0.06)) r.stamp(SPARK, x - 3, y - 3, key)
    else if (roll < (s.spark ?? 0.06) + (s.plus ?? 0.16)) r.stamp(PLUS, x - 1, y - 1, key)
    else r.set(x, y, rnd() < 0.35 ? s.colors.mid : s.colors.dim)
  }
  return r
}

// --- placement -------------------------------------------------------------------------------------------------

/**
 * `count` x positions spread round the 640 px circle with jitter, at least `clear` px away from the seam.
 * Same seed, same positions.
 */
export function scatter(count: number, seed: number, clear = 16, jitter = 0.7): number[] {
  const rnd = rng(seed)
  const step = (W - clear * 2) / count
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(Math.round(clear + (i + 0.5 + (rnd() - 0.5) * jitter) * step))
  return out
}

// --- shaded shapes -----------------------------------------------------------------------------------------------

/** Where to look for "outside" when shading a mask: a pixel whose probe neighbour is empty gets that tone. */
export interface Probe {
  /** Offsets toward the lower right: shade (and deep, a second probe further out). */
  shade?: readonly [number, number]
  deep?: readonly [number, number]
  /** Offset toward the upper left: highlight. */
  hi?: readonly [number, number]
}

/**
 * Paints a filled mask (any non-zero cell) with four tones lit from the top-left: crescents of shade at the
 * lower right, a rim of highlight at the upper left, `base` between. Returns a new raster of the same size.
 */
export function shadeMask(m: Raster, t: Tones, p: Probe = {}) {
  const out = new Raster(m.w, m.h)
  const [sx, sy] = p.shade ?? [2, 2]
  const [hx, hy] = p.hi ?? [1, 1]
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!m.get(x, y)) continue
      let c = t.base
      if (p.deep && !m.get(x + p.deep[0], y + p.deep[1])) c = t.deep
      else if (!m.get(x + sx, y + sy)) c = t.shade
      else if (!m.get(x - hx, y - hy)) c = t.hi
      out.set(x, y, c)
    }
  return out
}

/** Shades `mask` and stamps it with its top-left at (x, y), repeated across the seam. */
export function stampShaded(dst: Raster, mask: Raster, x: number, y: number, t: Tones, p?: Probe) {
  const painted = shadeMask(mask, t, p)
  tiled((dx) => dst.blit(painted, x + dx, y))
  return dst
}

/** A round blob (cluster of ellipses) mask: `parts` are [cx, cy, rx, ry]. */
export function blobMask(w: number, h: number, parts: readonly (readonly [number, number, number, number])[]) {
  const m = new Raster(w, h)
  for (const [cx, cy, rx, ry] of parts) m.ellipse(cx, cy, rx, ry, 1)
  return m
}

/** Puffy mound: a row of overlapping circles with a flat bottom on the last row of the mask. */
export function moundMask(w: number, h: number, seed: number, bumps = 3) {
  const rnd = rng(seed)
  const m = new Raster(w, h)
  for (let i = 0; i < bumps; i++) {
    const u = bumps === 1 ? 0.5 : i / (bumps - 1)
    const hump = Math.sin(Math.PI * (0.1 + 0.8 * u))
    const rad = Math.max(2, Math.min(h * 0.5, h * (0.3 + 0.24 * hump) * (0.85 + rnd() * 0.3)))
    m.ellipse(w * (0.22 + 0.56 * u) + (rnd() - 0.5) * 2, h - rad * 0.9, Math.min(w * 0.3, rad * 1.2), rad, 1)
  }
  m.ellipse(w / 2, h - h * 0.16, w * 0.44, h * 0.18, 1)
  for (let x = 0; x < w; x++) m.set(x, h, 0)
  return m
}

/** A big fluffy cloud with a flat shaded bottom. (x, baseY) = left edge and the flat bottom row. */
export function cloud(r: Raster, x: number, baseY: number, w: number, h: number, seed: number, t: Tones) {
  const rnd = rng(seed)
  const pad = 6
  const m = new Raster(w + pad * 2, h + pad * 2)
  const by = pad + h
  const n = Math.max(3, Math.round(w / (h * 0.5)))
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const hump = Math.sin(Math.PI * (0.1 + 0.8 * u))
    const rad = h * (0.2 + 0.32 * hump) * (0.85 + rnd() * 0.3)
    m.ellipse(pad + w * (0.1 + 0.8 * u) + (rnd() - 0.5) * h * 0.18, by - rad * 0.85, rad * 1.05, rad, 1)
  }
  m.ellipse(pad + w / 2, by - h * 0.1, w * 0.46, h * 0.18, 1)
  for (let yy = by; yy < m.h; yy++) for (let xx = 0; xx < m.w; xx++) m.set(xx, yy, 0)
  stampShaded(r, m, x - pad, baseY - by, t, { shade: [3, 6], hi: [2, 2] })
}

// --- landforms ---------------------------------------------------------------------------------------------------

export interface Facets {
  /** Horizontal px per vertical px of the shadow line dropping from each crest: small = steep line. */
  k: number
  /** Crest must stand this much above the valley to its right (px). */
  prominence?: number
  /** Valley search distance (px). */
  reach?: number
  /** Window for crest detection (px). */
  window?: number
  /** Rows (below the valley floor) over which the shaded face dithers back into the base. */
  blend?: number
}

export interface LandStyle {
  tones: Tones
  /** Rows of highlight along the top where the surface faces the light (default 1). */
  rim?: number
  /** Shaded faces on the side of each crest that faces away from the light. */
  facets?: Facets
}

/** Fills a seamless landform below `top` (y per column) down to the last row of `r`. */
export function fillLand(r: Raster, top: readonly number[], st: LandStyle) {
  const t = st.tones
  const rim = st.rim ?? 1
  const ys = top.map((v) => Math.round(v))
  const slopeAt = (x: number) => (ys[wrapX(x + 3)] - ys[wrapX(x - 3)]) / 6
  for (let x = 0; x < W; x++) {
    const s = slopeAt(x)
    for (let y = Math.max(0, ys[x]); y < r.h; y++) r.set(x, y, y - ys[x] < rim && s < 0.45 ? t.hi : t.base)
  }
  const f = st.facets
  if (!f) return r
  const win = f.window ?? 9
  const reach = f.reach ?? 220
  const prom = f.prominence ?? 6
  const blend = f.blend ?? 5
  for (let p = 0; p < W; p++) {
    const y0 = ys[p]
    let crest = true
    for (let d = 1; d <= win && crest; d++) if (ys[wrapX(p - d)] < y0 || ys[wrapX(p + d)] <= y0) crest = false
    if (!crest) continue
    // The valley to the right: the lowest point before a taller crest.
    let v = p
    let vy = y0
    for (let d = 1; d <= reach; d++) {
      const yy = ys[wrapX(p + d)]
      if (yy < y0) break
      if (yy >= vy) {
        vy = yy
        v = p + d
      }
    }
    if (vy - y0 < prom) continue
    for (let x = p + 1; x <= v; x++) {
      const X = wrapX(x)
      const lineY = y0 + (x - p) / f.k
      const floor = vy + blend
      for (let y = Math.max(0, ys[X]); y <= Math.min(r.h - 1, lineY, floor); y++) {
        if (y > vy && bayer(X, y) < (y - vy) / blend) continue
        r.set(X, y, t.shade)
      }
    }
  }
  return r
}

/** Dithers the last `rows` of every painted column into the solid colour `c` (the layer's footing in pits). */
export function fadeBottom(r: Raster, rows: number, c: number) {
  for (let y = Math.max(0, r.h - rows); y < r.h; y++) {
    const f = (y - (r.h - rows) + 1) / rows
    for (let x = 0; x < r.w; x++) if (r.get(x, y) && (f >= 1 || bayer(x, y) < f)) r.set(x, y, c)
  }
  return r
}

/**
 * A horizontal band of mist: painted pixels near row `y` (±`half`) are pulled toward `color` by dithering.
 * `strength` 0..1 is the density at the middle of the band.
 */
export function mist(r: Raster, y: number, half: number, color: number, strength: number) {
  for (let yy = Math.max(0, y - half); yy <= Math.min(r.h - 1, y + half); yy++) {
    const f = strength * (1 - Math.abs(yy - y) / (half + 1))
    for (let x = 0; x < r.w; x++) if (r.get(x, yy) && bayer(x, yy) < f) r.set(x, yy, color)
  }
  return r
}

// --- trees and bushes ----------------------------------------------------------------------------------------------

export type TreeKind = 'round' | 'pine' | 'poplar'

/** A tree mask of height `h`; the base sits on the mask's last row, centred. Trunk is returned separately. */
export function treeMask(kind: TreeKind, h: number, seed: number) {
  const rnd = rng(seed)
  if (kind === 'pine') {
    const w = Math.max(5, Math.round(h * 0.55))
    const m = new Raster(w + 2, h + 1)
    const tiers = h > 18 ? 4 : 3
    const trunk = Math.max(1, Math.round(h * 0.12))
    const cx = (w + 2) / 2
    for (let i = 0; i < tiers; i++) {
      const top = (i * (h - trunk)) / (tiers + 0.7)
      const bottom = top + ((h - trunk) * 1.55) / (tiers + 0.7)
      const half = (w / 2) * (0.5 + (0.5 * (i + 1)) / tiers)
      m.poly([cx, top, cx + half, bottom, cx - half, bottom], 1)
    }
    return { mask: m, trunk, trunkW: Math.max(1, Math.round(w / 6)) }
  }
  if (kind === 'poplar') {
    const w = Math.max(4, Math.round(h * 0.28))
    const m = new Raster(w + 2, h + 1)
    const trunk = Math.max(1, Math.round(h * 0.1))
    m.ellipse((w + 2) / 2, (h - trunk) / 2, w / 2, (h - trunk) / 2, 1)
    return { mask: m, trunk, trunkW: 1 }
  }
  const w = Math.max(6, Math.round(h * 0.85))
  const m = new Raster(w + 2, h + 1)
  const trunk = Math.max(2, Math.round(h * 0.28))
  const cy = (h - trunk) * 0.55
  const parts: [number, number, number, number][] = [[(w + 2) / 2, cy, w * 0.34, (h - trunk) * 0.46]]
  const side = 2 + Math.round(rnd())
  for (let i = 0; i < side; i++) {
    const u = (i + 0.5) / side
    parts.push([
      (w + 2) * (0.22 + 0.56 * u),
      cy + ((h - trunk) * (0.12 + rnd() * 0.12) * (u > 0.5 ? 1 : 1.2)) / 1.2,
      w * 0.26,
      (h - trunk) * 0.32
    ])
  }
  for (const [cx2, cy2, rx, ry] of parts) m.ellipse(cx2, cy2, rx, ry, 1)
  return { mask: m, trunk, trunkW: Math.max(1, Math.round(w / 8)) }
}

export interface TreeStyle {
  seed: number
  count: number
  kind: TreeKind | readonly TreeKind[]
  /** Height range in px. */
  height: readonly [number, number]
  /** Crown tones (usually a step darker than the land the trees stand on). */
  tones: Tones
  /** Trunk colour (defaults to the crown's deep tone). */
  trunk?: number
  /** px the base sinks into the land. */
  sink?: number
  clear?: number
  /** Skip positions closer than this to any x in `skip` (a house or windmill). */
  skip?: readonly (readonly [number, number])[]
}

/** Plants a line of tiny trees along a ridge line (bases on `top`), seamlessly. */
export function treeLine(r: Raster, top: readonly number[], s: TreeStyle) {
  const rnd = rng(s.seed + 3)
  const kinds = Array.isArray(s.kind) ? (s.kind as TreeKind[]) : [s.kind as TreeKind]
  scatter(s.count, s.seed, s.clear ?? 16).forEach((x, i) => {
    if (s.skip?.some(([a, b]) => x >= a && x <= b)) return
    const kind = kinds[Math.floor(rnd() * kinds.length)]
    const h = Math.round(s.height[0] + rnd() * (s.height[1] - s.height[0]))
    plantTree(r, kind, x, Math.round(top[x]) + (s.sink ?? 2), h, s.tones, s.trunk ?? s.tones.deep, s.seed * 31 + i)
  })
  return r
}

/** One tree whose base centre is (x, baseY). */
export function plantTree(
  r: Raster,
  kind: TreeKind,
  x: number,
  baseY: number,
  h: number,
  t: Tones,
  trunkColor: number,
  seed: number
) {
  const { mask, trunk, trunkW } = treeMask(kind, h, seed)
  tiled((dx) => r.rect(x + dx - Math.floor(trunkW / 2), baseY - trunk, trunkW, trunk + 1, trunkColor))
  stampShaded(r, mask, x - Math.floor(mask.w / 2), baseY - mask.h + 1, t, kind === 'pine' ? { shade: [1, 1] } : {})
  return r
}

/** A low flat-bottomed bush/mound with its base on `baseY`. */
export function plantBush(r: Raster, x: number, baseY: number, w: number, h: number, t: Tones, seed: number) {
  const m = moundMask(w, h, seed, w > h * 2.4 ? 4 : 3)
  stampShaded(r, m, x - Math.floor(w / 2), baseY - h + 1, t, { shade: [2, 3], hi: [1, 1] })
  return r
}

// --- light -------------------------------------------------------------------------------------------------------------

export interface Shaft {
  /** Where the shaft's centre crosses the row `y0`. */
  x: number
  /** Width in px. */
  w: number
  /** Dither density at the heart of the shaft (0..1; 0.2–0.45 is "low contrast"). */
  strength: number
}

export interface ShaftStyle {
  /** px the shaft moves right per px down (positive = leaning down to the right). */
  slope: number
  y0?: number
  y1?: number
  /** Colour a painted pixel becomes inside a shaft; default = the next lighter step of its own ramp. */
  lift?: (c: number) => number
}

/** Dithered diagonal light shafts painted onto what is already there (painted pixels only), seamlessly. */
export function shafts(r: Raster, list: readonly Shaft[], st: ShaftStyle) {
  const y0 = st.y0 ?? 0
  const y1 = st.y1 ?? r.h - 1
  const lift = st.lift ?? ((c: number) => LIGHTER[c])
  for (let y = y0; y <= Math.min(y1, r.h - 1); y++) {
    const u = (y - y0) / Math.max(1, y1 - y0)
    const fade = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.88)), 0.8)
    for (const s of list) {
      const cx = s.x + st.slope * (y - y0)
      for (let x = Math.floor(cx - s.w / 2); x <= Math.ceil(cx + s.w / 2); x++) {
        const d = Math.abs(x + 0.5 - cx) / (s.w / 2)
        if (d > 1) continue
        const X = wrapX(x)
        const inten = s.strength * (1 - d * d) * fade
        const c = r.get(X, y)
        if (c && bayer(X, y) < inten) r.set(X, y, lift(c))
      }
    }
  }
  return r
}

// --- additions for the interiors (cave, fortress, castle) and the star sky -------------------------------------------

/** A polygon (flat x, y list) as a mask raster plus the offset of its top-left corner. */
export function polyMask(pts: readonly number[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i])
    x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1])
    y1 = Math.max(y1, pts[i + 1])
  }
  const ox = Math.floor(x0) - 1
  const oy = Math.floor(y0) - 1
  const m = new Raster(Math.ceil(x1) - ox + 2, Math.ceil(y1) - oy + 2)
  m.poly(
    pts.map((v, i) => v - (i % 2 ? oy : ox)),
    1
  )
  return { mask: m, ox, oy }
}

/** Fills a polygon with four shaded tones (see `shadeMask`), repeated across the seam. */
export function stampPoly(dst: Raster, pts: readonly number[], t: Tones, p?: Probe) {
  const { mask, ox, oy } = polyMask(pts)
  return stampShaded(dst, mask, ox, oy, t, p)
}

/** A round pillar `w` px wide: highlight column on the left, shade and deep columns on the right. Repeated across the seam. */
export function pillar(dst: Raster, x: number, y: number, w: number, h: number, t: Tones) {
  const m = new Raster(w, h)
  m.rect(0, 0, w, h, 1)
  const wide = w >= 12
  return stampShaded(dst, m, x, y, t, { shade: [wide ? 4 : 3, 0], hi: [wide ? 2 : 1, 0], deep: [1, 0] })
}

/**
 * Soft light on what is already painted: inside `radius` of (cx, cy) every painted pixel is moved `strength` steps
 * (0..3, fractions dither) through `lift`, falling off toward the edge. `lift` defaults to the next lighter step of the
 * pixel's own ramp; pass a table lookup to warm or cool it. Dithered, so no colour is invented.
 */
export function lightOn(
  r: Raster,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  lift: (c: number) => number = (c) => LIGHTER[c],
  squash = 1
) {
  for (
    let y = Math.max(0, Math.floor(cy - radius * squash));
    y <= Math.min(r.h - 1, Math.ceil(cy + radius * squash));
    y++
  )
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot((x + 0.5 - cx) / radius, (y + 0.5 - cy) / (radius * squash))
      if (d >= 1) continue
      const X = wrapX(x)
      let c = r.get(X, y)
      if (!c) continue
      const t = Math.pow(1 - d, 1.5) * strength
      const n = Math.floor(t) + (bayer(X, y) < t - Math.floor(t) ? 1 : 0)
      for (let i = 0; i < n; i++) c = lift(c)
      r.set(X, y, c)
    }
  return r
}

/** Maps colours of `from` to the same step of `to` (everything else stays): a ready-made `lift` that tints. */
export function tintMap(from: readonly number[], to: readonly number[]) {
  const m = new Map<number, number>()
  from.forEach((c, i) => m.set(c, to[i]))
  return (c: number) => m.get(c) ?? c
}

/** A hanging rope or chain: sagging between (x0, y0) and (x1, y1) by `sag` px, one colour, 1 px wide. */
export function sagLine(r: Raster, x0: number, y0: number, x1: number, y1: number, sag: number, c: number) {
  const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) + Math.abs(y1 - y0)))
  let px = x0
  let py = y0
  for (let i = 1; i <= n; i++) {
    const u = i / n
    const x = x0 + (x1 - x0) * u
    const y = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag
    r.line(px, py, x, y, c)
    px = x
    py = y
  }
  return r
}

/** A mask of every cell within `grow` px of a shape given as a point test, over the box (x0, y0)–(x1, y1). */
export function grownMask(
  inside: (x: number, y: number) => boolean,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  grow: number
) {
  const m = new Raster(x1 - x0 + 1 + grow * 2, y1 - y0 + 1 + grow * 2)
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const gx = x + x0 - grow
      const gy = y + y0 - grow
      let hit = false
      for (let oy = -grow; oy <= grow && !hit; oy++)
        for (let ox = -grow; ox <= grow; ox++)
          if (ox * ox + oy * oy <= grow * grow + 1 && inside(gx + ox, gy + oy)) {
            hit = true
            break
          }
      if (hit) m.set(x, y, 1)
    }
  return { mask: m, ox: x0 - grow, oy: y0 - grow }
}

/** Half width of a pointed (lancet) arch at row `y`: `half` at the spring line, 0 at the crown. */
export function lancet(y: number, crown: number, spring: number, half: number) {
  if (y >= spring) return half
  if (y < crown) return -1
  return half * (1 - Math.pow((spring - y) / (spring - crown), 1.7))
}

/** A tiny candle flame (3 wide, 5 tall) with its base at (x, y), repeated across the seam. */
export function flameAt(r: Raster, x: number, y: number, outer: number, mid: number, core: number) {
  tiled((dx) => {
    r.rect(x - 1 + dx, y - 3, 3, 3, outer)
    r.set(x + dx, y - 5, outer)
    r.set(x + dx, y - 4, outer)
    r.rect(x + dx, y - 3, 1, 3, mid)
    r.set(x + dx, y - 1, core)
  })
}
