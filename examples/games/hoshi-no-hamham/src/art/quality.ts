/**
 * Measurements on pixel-art frames and clips: the numbers behind the character review tools and gates
 * (`tests/art-rig-quality.test.ts`, `scripts/hoshi-no-hamham-art.mjs --motion`). Pure functions over `Raster` and
 * `Anim`: no DOM, no Node APIs. Every function says what it measures and why a pixel artist cares.
 */
import type { Raster } from './raster'
import type { Anim } from './sheet'

/** A pixel position [x, y] inside a frame. */
export type Px = readonly [number, number]

/** Thresholds shared by the tests and the reports, so a number flagged in a report is a number a gate rejects. */
export const LIMITS = {
  /** A silhouette-edge pixel brighter than this reads as a missing outline. */
  lightEdge: 0.7,
  /** Most colours one frame may use. */
  colours: 28,
  /** The loop seam may be at most this many times the biggest change between neighbouring frames. */
  seamRatio: 1.6,
  /** Neighbouring frames that differ by less than this share of their silhouettes are twins. */
  twinRatio: 0.01,
  /**
   * Contour flicker (see `boil`): pixels that flip back and forth (on-off-on-off over four consecutive frames) as a
   * share of the outline, gated on clips of at least `boilFrames` frames (a shorter loop cannot show the pattern, and
   * its on-off-on-off pixels are the poses). Calibration, measured on the sheets and on synthetic 8-frame loops
   * (tests/art-quality.test.ts): hero idle/blink peaks at 0.036 (mean 0.008), wolfBoss idle 0.033 and stunned 0.034
   * (means 0.02), hero swim 0.035; a clean synthetic breathing loop (top edge rising and falling by a pixel) 0; a
   * body running across the frame 0; a synthetic loop whose contour jitters by one pixel every frame 0.31 in every
   * window (mean 0.31). Active clips (hero run 0.31, bite 0.51, cheer 1.6, defeat 2.2) are
   * all motion and measure as high as the jitter, so the gate is for quiet clips only: a window may flip up to 0.10 of the outline (about three times the cleanest
   * hand-drawn loops), and the clip's mean may not pass 0.05 (a clip that boils only at one spot still averages
   * higher than the 0.02 of the calm ones).
   */
  boil: 0.1,
  boilMean: 0.05,
  boilFrames: 6
} as const

/** True when the pixel is painted (out-of-frame counts as empty). */
const on = (f: Raster, x: number, y: number) => f.get(x, y) > 0

const NEIGHBOURS: readonly Px[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]

/** Number of painted 4-neighbours of a pixel. */
const links = (f: Raster, x: number, y: number) =>
  NEIGHBOURS.reduce((n, [dx, dy]) => n + (on(f, x + dx, y + dy) ? 1 : 0), 0)

/** Visits every painted pixel of a frame. */
function eachPainted(f: Raster, visit: (x: number, y: number, c: number) => void) {
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const c = f.data[y * f.w + x]
      if (c) visit(x, y, c)
    }
}

/**
 * Painted pixels with no painted 4-neighbour: stray dots. They shimmer on screen and are never intended on a
 * character (a sparkle belongs to an effect, not to a drawing).
 */
export function orphans(f: Raster): Px[] {
  const found: Px[] = []
  eachPainted(f, (x, y) => {
    if (!links(f, x, y)) found.push([x, y])
  })
  return found
}

/** Luminance 0..1 of an RGB pixel (Rec. 709 weights on the stored sRGB values). */
export const luma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/**
 * Painted pixels on the silhouette edge (a transparent 4-neighbour) that are lighter than `limit`: the outline is
 * missing there, so the figure dissolves into a bright background or looks cut out with scissors. Colours are read
 * through the frame's own palette (`Raster.rgba`), so the check works on rasters from any module instance.
 */
export function lightEdge(f: Raster, limit: number = LIMITS.lightEdge): Px[] {
  const found: Px[] = []
  const rgba = f.rgba()
  eachPainted(f, (x, y) => {
    const i = (y * f.w + x) * 4
    if (links(f, x, y) < 4 && luma(rgba[i], rgba[i + 1], rgba[i + 2]) > limit) found.push([x, y])
  })
  return found
}

export interface Blob {
  /** Bounding box of the connected painted shape (8-connected). */
  box: { x: number; y: number; w: number; h: number }
  /** Painted pixels in the shape. */
  size: number
  /** The pixels of `lightEdge` that belong to it. */
  light: Px[]
}

/**
 * `lightEdge` grouped by the connected painted shape (8-connected) each light pixel belongs to. Says whether "the
 * body's outline is missing here" (a big blob) or "a 5 px sparkle has no edge" (a small, detached one): effects baked
 * into a frame (stars, sweat, dust) need an edge too, but the fix is a different one.
 */
export function lightEdgeBlobs(f: Raster, limit: number = LIMITS.lightEdge): Blob[] {
  const light = lightEdge(f, limit)
  if (!light.length) return []
  const label = new Int32Array(f.w * f.h).fill(-1)
  const blobs: Blob[] = []
  eachPainted(f, (sx, sy) => {
    if (label[sy * f.w + sx] >= 0) return
    const id = blobs.length
    const stack: Px[] = [[sx, sy]]
    label[sy * f.w + sx] = id
    let x0 = sx
    let y0 = sy
    let x1 = sx
    let y1 = sy
    let size = 0
    while (stack.length) {
      const [x, y] = stack.pop()!
      size++
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h || label[ny * f.w + nx] >= 0 || !on(f, nx, ny)) continue
          label[ny * f.w + nx] = id
          stack.push([nx, ny])
        }
    }
    blobs.push({ box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, size, light: [] })
  })
  for (const p of light) blobs[label[p[1] * f.w + p[0]]].light.push(p)
  return blobs.filter((b) => b.light.length)
}

/** Number of painted pixels (the silhouette area). */
export const area = (f: Raster) => f.count()

/** Pixels whose palette index differs between two same-sized frames: how much moved or changed colour. */
export function changed(a: Raster, b: Raster): number {
  let n = 0
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++
  return n
}

/** Pixels painted in at least one of the two frames (the union of the silhouettes). */
export function union(a: Raster, b: Raster): number {
  let n = 0
  for (let i = 0; i < a.data.length; i++) if (a.data[i] || b.data[i]) n++
  return n
}

/** `changed` relative to the union of both silhouettes: 0 identical, 1 nothing in common. 0 for two empty frames. */
export function changedRatio(a: Raster, b: Raster): number {
  const u = union(a, b)
  return u ? changed(a, b) / u : 0
}

/** Changed pixels between each pair of neighbouring frames (frame i to i+1), without the loop seam. */
export const stepChanges = (anim: Anim) => anim.frames.slice(1).map((f, i) => changed(anim.frames[i], f))

const median = (values: number[]) => {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface Seam {
  /** Changed pixels from the last frame back to the first. */
  seam: number
  /** Median and maximum of the changes between neighbouring frames inside the clip. */
  median: number
  max: number
  /** `seam / max`; above `LIMITS.seamRatio` the loop pops. 0 for clips with no inside pair. */
  ratio: number
}

/**
 * Loop seam: how far the last frame is from the first, compared with how far neighbouring frames are from each
 * other. A loop that jumps at the seam shows as a visible hitch every cycle.
 */
export function loopSeam(anim: Anim): Seam {
  const steps = stepChanges(anim)
  const max = steps.length ? Math.max(...steps) : 0
  const n = anim.frames.length
  const seam = n > 1 ? changed(anim.frames[n - 1], anim.frames[0]) : 0
  return { seam, median: median(steps), max, ratio: max ? seam / max : seam ? Infinity : 0 }
}

/** Frame index pairs [i, j] that follow each other in play (`wrap` adds last to first, for loops). */
function pairs(anim: Anim, wrap: boolean): [number, number][] {
  const n = anim.frames.length
  const out: [number, number][] = []
  for (let i = 0; i + 1 < n; i++) out.push([i, i + 1])
  if (wrap && n > 2) out.push([n - 1, 0])
  return out
}

/**
 * Near-duplicate neighbours: pairs of frames in play order that differ in under `LIMITS.twinRatio` of their
 * silhouettes. Twins waste a frame (the clip stutters instead of moving). Loops include the last-to-first pair.
 */
export function stillness(anim: Anim, wrap: boolean = anim.loop): [number, number][] {
  return pairs(anim, wrap).filter(([i, j]) => changedRatio(anim.frames[i], anim.frames[j]) < LIMITS.twinRatio)
}

/**
 * Pixels whose painted/unpainted state in b differs from both a and c while a and c agree: a pixel that is different
 * for one frame only. Information only (the `--motion` report prints it as "pixels that change for one frame"): in a
 * short loop of real poses a one-frame pixel is simply motion, so it is not a gate. See `boil` for the gated number.
 */
export function boilAt(a: Raster, b: Raster, c: Raster): Px[] {
  const found: Px[] = []
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const pa = on(a, x, y)
      if (pa === on(c, x, y) && pa !== on(b, x, y)) found.push([x, y])
    }
  return found
}

export interface Toggles {
  /** One-frame-toggle pixel count for the triple centred on each frame (loops wrap; non-loops skip first and last). */
  perFrame: number[]
  max: number
  /** Mean of `perFrame`. */
  mean: number
  /** Frame with the maximum and its pixels, to find it. */
  worst: { frame: number; pixels: Px[] }
}

/** Number of painted pixels on the silhouette edge (a transparent 4-neighbour): the length of the outline. */
export function outlineLength(f: Raster): number {
  let n = 0
  eachPainted(f, (x, y) => {
    if (links(f, x, y) < 4) n++
  })
  return n
}

/**
 * Pixels that flip back and forth over four consecutive frames a, b, c, d: painted state on-off-on-off or
 * off-on-off-on. A part that moves changes a pixel once and the pixel stays; a pixel that alternates every frame is
 * an edge that should be still and is not: the contour "boils" (an unrounded part position, or a polygon
 * re-rasterised differently each frame).
 */
export function flipFlop(a: Raster, b: Raster, c: Raster, d: Raster): Px[] {
  const found: Px[] = []
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const pa = on(a, x, y)
      if (pa !== on(b, x, y) && pa === on(c, x, y) && on(b, x, y) === on(d, x, y)) found.push([x, y])
    }
  return found
}

export interface Boil {
  /**
   * For the window of four frames starting at each frame (loops wrap round; non-loops stop at the last full window):
   * flip-flopping pixels as a share of the mean outline length of those frames.
   */
  perWindow: number[]
  /** The same windows as pixel counts. */
  counts: number[]
  /** Largest and mean share. */
  max: number
  mean: number
  /** First frame of the worst window and its pixels, to find it. */
  worst: { frame: number; pixels: Px[]; count: number; outline: number }
  /** False for clips with fewer than `LIMITS.boilFrames` frames: the pattern cannot show, nothing is measured. */
  measured: boolean
}

/**
 * Contour flicker (boiling): `flipFlop` over every window of four consecutive frames, as a share of the outline, so
 * a 128 px boss and a 64 px hero are held to the same standard. Only clips of `LIMITS.boilFrames` frames or more are
 * measured: in a shorter loop on-off-on-off is just the poses of the clip.
 */
export function boil(anim: Anim, wrap: boolean = anim.loop): Boil {
  const f = anim.frames
  const n = f.length
  const none: Boil = {
    perWindow: [],
    counts: [],
    max: 0,
    mean: 0,
    worst: { frame: 0, pixels: [], count: 0, outline: 0 },
    measured: false
  }
  if (n < LIMITS.boilFrames) return none
  const outlines = f.map(outlineLength)
  const windows = wrap ? n : n - 3
  const perWindow: number[] = []
  const counts: number[] = []
  let worst = none.worst
  let max = 0
  for (let i = 0; i < windows; i++) {
    const idx = [0, 1, 2, 3].map((k) => (i + k) % n)
    const pixels = flipFlop(f[idx[0]], f[idx[1]], f[idx[2]], f[idx[3]])
    const outline = idx.reduce((s, k) => s + outlines[k], 0) / 4
    const share = outline ? pixels.length / outline : 0
    perWindow.push(share)
    counts.push(pixels.length)
    if (share > max) {
      max = share
      worst = { frame: i, pixels, count: pixels.length, outline }
    }
  }
  const mean = perWindow.length ? perWindow.reduce((a, b) => a + b, 0) / perWindow.length : 0
  return { perWindow, counts, max, mean, worst, measured: true }
}

/** `boilAt` over every consecutive triple of a clip (information: pixels that change for one frame). */
export function oneFrameToggles(anim: Anim, wrap: boolean = anim.loop): Toggles {
  const f = anim.frames
  const n = f.length
  const perFrame: number[] = []
  let worst: Toggles['worst'] = { frame: 0, pixels: [] }
  let max = 0
  for (let i = 0; i < n; i++) {
    const edge = i === 0 || i === n - 1
    if (edge && !wrap) {
      perFrame.push(0)
      continue
    }
    if (n < 3) {
      perFrame.push(0)
      continue
    }
    const pixels = boilAt(f[(i + n - 1) % n], f[i], f[(i + 1) % n])
    perFrame.push(pixels.length)
    if (pixels.length > max) {
      max = pixels.length
      worst = { frame: i, pixels }
    }
  }
  return { perFrame, max, mean: perFrame.length ? perFrame.reduce((a, b) => a + b, 0) / perFrame.length : 0, worst }
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Bounding box of the painted pixels, or undefined for an empty frame. */
export const bounds = (f: Raster): Box | undefined => f.bounds()

/** Mean position of the painted pixels (the visual centre of mass), or undefined for an empty frame. */
export function centroid(f: Raster): Px | undefined {
  let sx = 0
  let sy = 0
  let n = 0
  eachPainted(f, (x, y) => {
    sx += x
    sy += y
    n++
  })
  return n ? [sx / n, sy / n] : undefined
}

export interface CentroidPath {
  points: (Px | undefined)[]
  /** Distance in px from each frame's centroid to the previous one (0 for the first; wrap closes loops). */
  steps: number[]
  /** Largest step: a sudden jump of the body's centre. */
  max: number
}

/** The path of the centroid through a clip, with the per-frame step in px. */
export function centroidPath(anim: Anim, wrap: boolean = false): CentroidPath {
  const points = anim.frames.map(centroid)
  const steps = points.map((p, i) => {
    const q = i === 0 ? (wrap ? points[points.length - 1] : undefined) : points[i - 1]
    return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : 0
  })
  return { points, steps, max: steps.length ? Math.max(...steps) : 0 }
}

/**
 * Lowest painted row of each frame (-1 for an empty frame). A standing clip should rest on the anchor row, and a
 * planted foot must neither sink nor float between frames.
 */
export const groundRow = (anim: Anim): number[] =>
  anim.frames.map((f) => (f.bounds() ? f.bounds()!.y + f.bounds()!.h - 1 : -1))

/** Number of distinct colours in a frame (transparent excluded). */
export const colours = (f: Raster): number => f.colors().size

/**
 * Painted pixels that touch the outermost `margin` pixels of the cell. A figure that reaches the cell edge is cut
 * off by the frame (or will be when the sprite is moved by a pixel).
 */
export function edgeTouch(f: Raster, margin = 1): Px[] {
  const found: Px[] = []
  eachPainted(f, (x, y) => {
    if (x < margin || y < margin || x >= f.w - margin || y >= f.h - margin) found.push([x, y])
  })
  return found
}

/** The wall-clock length in seconds of one frame of the clip (its hold times its tick). */
export const frameSeconds = (anim: Anim, i: number) => (anim.hold?.[i] ?? 1) / anim.fps
