import { C, DARKER, OUTLINE_OF, PALETTE_RGBA, R } from './palette'

/** Palette indices [highlight, base, shade, deep, line]. */
export type Ramp = readonly [number, number, number, number, number]

/** An indexed pixel buffer: each byte is a palette index, 0 = transparent. Works the same in Node and browsers. */
export class Raster {
  readonly data: Uint8Array
  constructor(
    readonly w: number,
    readonly h: number,
    data?: Uint8Array
  ) {
    this.data = data ?? new Uint8Array(w * h)
  }

  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : 0
  }

  set(x: number, y: number, c: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c
  }

  /** Sets a pixel only where something is already painted. */
  paint(x: number, y: number, c: number) {
    if (this.get(Math.round(x), Math.round(y))) this.set(x, y, c)
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
    return this
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    x0 = Math.round(x0)
    y0 = Math.round(y0)
    x1 = Math.round(x1)
    y1 = Math.round(y1)
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
    return this
  }

  /** A line drawn with a round brush `width` pixels across (centre at the given points). */
  thick(x0: number, y0: number, x1: number, y1: number, width: number, c: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2))
    const r = width / 2
    for (let s = 0; s <= steps; s++) {
      const cx = x0 + ((x1 - x0) * s) / steps
      const cy = y0 + ((y1 - y0) * s) / steps
      this.ellipse(cx, cy, r, r, c)
    }
    return this
  }

  /** Filled ellipse sampled at pixel centres; (cx, cy) may be fractional (x.5 gives even widths). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx
        const ny = (y + 0.5 - cy) / ry
        if (nx * nx + ny * ny <= 1.0001) this.set(x, y, c)
      }
    return this
  }

  /** Scanline polygon fill sampled at pixel centres. pts = [x0, y0, x1, y1, ...]. */
  poly(pts: number[], c: number) {
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 1; i < pts.length; i += 2) {
      minY = Math.min(minY, pts[i])
      maxY = Math.max(maxY, pts[i])
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5
      const xs: number[] = []
      for (let i = 0; i < pts.length; i += 2) {
        const ax = pts[i]
        const ay = pts[i + 1]
        const bx = pts[(i + 2) % pts.length]
        const by = pts[(i + 3) % pts.length]
        if (ay <= sy === by <= sy) continue
        xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c)
    }
    return this
  }

  /** Paints a hand-authored string grid; '.' and ' ' are transparent. */
  stamp(rows: readonly string[], x: number, y: number, key: Record<string, number> = KEY, flip = false) {
    x = Math.round(x)
    y = Math.round(y)
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]
        if (ch === '.' || ch === ' ') continue
        const c = key[ch]
        if (c === undefined) throw new Error(`stamp: no colour for '${ch}'`)
        this.set(flip ? x + row.length - 1 - i : x + i, y + j, c)
      }
    })
    return this
  }

  /** Composites another raster (transparent pixels skipped). */
  blit(src: Raster, x = 0, y = 0, flip = false) {
    x = Math.round(x)
    y = Math.round(y)
    for (let j = 0; j < src.h; j++)
      for (let i = 0; i < src.w; i++) {
        const c = src.data[j * src.w + i]
        if (c) this.set(flip ? x + src.w - 1 - i : x + i, y + j, c)
      }
    return this
  }

  clone() {
    return new Raster(this.w, this.h, this.data.slice())
  }

  flipX() {
    return new Raster(this.w, this.h).blit(this, 0, 0, true)
  }

  /** Quarter turn: dir 1 = clockwise, -1 = counter-clockwise. */
  rot90(dir: 1 | -1) {
    const out = new Raster(this.h, this.w)
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = this.data[y * this.w + x]
        if (!c) continue
        if (dir === 1) out.set(this.h - 1 - y, x, c)
        else out.set(y, this.w - 1 - x, c)
      }
    return out
  }

  map(fn: (c: number, x: number, y: number) => number) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x
        if (this.data[i]) this.data[i] = fn(this.data[i], x, y)
      }
    return this
  }

  /** RGBA bytes via the master palette. */
  rgba() {
    const out = new Uint8Array(this.w * this.h * 4)
    for (let i = 0; i < this.data.length; i++)
      out.set(PALETTE_RGBA.subarray(this.data[i] * 4, this.data[i] * 4 + 4), i * 4)
    return out
  }
}

/** Default stamp colours. */
export const KEY: Record<string, number> = {
  K: C.inkCool,
  k: C.inkWarm,
  '1': R.skin[0],
  '2': R.skin[1],
  '3': R.skin[2],
  '4': R.skin[3],
  h: R.hair[0],
  H: R.hair[1],
  J: R.hair[2],
  j: R.hair[3],
  w: C.white,
  W: R.paper[1],
  g: R.paper[2],
  r: R.red[1],
  R: R.red[2],
  p: R.pink[1],
  P: R.pink[2],
  y: R.yellow[1],
  Y: R.yellow[2],
  b: R.brown[1],
  B: R.brown[2],
  m: R.metal[1],
  M: R.metal[2]
}

const LIGHT = (() => {
  const v = [-0.55, -0.7, 0.55]
  const l = Math.hypot(...v)
  return v.map((n) => n / l)
})()

/** A sphere-shaded ellipse lit from the top-left: 3–4 values in clean crescents. */
export function ball(r: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, spec = true) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1.0001) continue
      const nz = Math.sqrt(Math.max(0, 1 - q))
      const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
      r.set(x, y, d > 0.9 && spec ? ramp[0] : d > 0.3 ? ramp[1] : d > -0.12 ? ramp[2] : ramp[3])
    }
  return r
}

const neighbours = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1]
] as const

/**
 * Directional form shading on a single-material layer: pixels whose right/bottom side faces away from
 * the light get the shade colour (`depth` px deep), and top/left rims get a highlight when `rim` is set.
 */
export function shadeEdges(r: Raster, ramp: Ramp, depth = 1, rim = false) {
  const src = r.clone()
  const inside = (x: number, y: number) => src.get(x, y) === ramp[1]
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      if (!inside(x, y)) continue
      let dark = false
      for (let d = 1; d <= depth; d++) if (!src.get(x + d, y) || !src.get(x, y + d)) dark = true
      if (dark) r.set(x, y, ramp[2])
      else if (rim && (!src.get(x - 1, y) || !src.get(x, y - 1))) r.set(x, y, ramp[0])
    }
  return r
}

/**
 * Selective outline: every empty pixel touching the sprite becomes a dark of the material it borders —
 * the material's deep shade on lit (top/left) sides, its darkest line colour on bottom/right sides.
 */
export function outline(r: Raster) {
  const src = r.clone()
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      if (src.get(x, y)) continue
      const left = src.get(x - 1, y) || src.get(x, y - 1)
      const right = src.get(x + 1, y) || src.get(x, y + 1)
      if (left) r.set(x, y, OUTLINE_OF[left].line)
      else if (right) r.set(x, y, litOutline(right))
    }
  return r
}

/** Lit-side selout: two ramp steps darker than the pixel it borders (never lighter than the ramp's shade). */
function litOutline(c: number) {
  const two = DARKER[DARKER[c]]
  return two === c ? OUTLINE_OF[c].deep : two
}

/** Removes orphan pixels and single off-colour shading specks inside one material. */
export function despeckle(r: Raster) {
  const src = r.clone()
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const c = src.get(x, y)
      if (!c) continue
      const around = neighbours.map(([dx, dy]) => src.get(x + dx, y + dy))
      if (around.every((n) => !n)) r.set(x, y, 0)
      else if (
        around.every((n) => n === around[0]) &&
        around[0] !== c &&
        OUTLINE_OF[around[0]].deep === OUTLINE_OF[c].deep
      )
        r.set(x, y, around[0])
    }
  return r
}

/** Draws one body part on its own layer, outlines it, then composites it — overlaps become inner contours. */
export function part(target: Raster, draw: (layer: Raster) => void, line = true) {
  const layer = new Raster(target.w, target.h)
  draw(layer)
  if (line) outline(layer)
  return target.blit(layer)
}

/** Recolours every pixel through `table` (e.g. a darker ramp step for far limbs). */
export const remap = (r: Raster, table: readonly number[]) => r.map((c) => table[c])

/** Seeded PRNG for deterministic scatter (the game's own). */
export { mulberry32 as rng } from '../game'
