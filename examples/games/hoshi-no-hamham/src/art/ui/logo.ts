import { UI_SPEC } from '../contract'
import type { SheetModule } from '../module'
import { C, R, color } from '../palette'
import { Raster } from '../raster'
import { lazyAnim } from '../sheet'

/**
 * `ui#logo`: the pixel logotype 「星のハムハム」, 384×128.
 *
 * Every letter is built by hand from round-brush strokes laid out in a 0..100 glyph box (no font is rendered).
 * Each pixel of a stroke knows its nearest centre line, so the letters get flat, banded "tube" shading that follows
 * the stroke direction: a white highlight line and a light band on the side facing the top-left light, the base
 * colour, and a darker band on the far side. Each glyph is ringed with a 3-px plum outline (later glyphs cut their
 * outline into earlier ones), and a dark offset drop shadow sits under everything.
 */

const W = 384
const H = 128

type Pt = [number, number]

/** Light direction (towards the light): mostly from above, a little from the left. */
const LIGHT: Pt = [-0.6, -0.8]

/** A glyph's place on the canvas: its 0..100 box, stroke width in pixels and tilt in degrees. */
interface Place {
  x: number
  y: number
  w: number
  h: number
  sw: number
  tilt: number
}

/** One stroke in glyph units; `curve` passes it through a Catmull-Rom spline. */
interface Stroke {
  pts: Pt[]
  curve?: boolean
  /** Stroke width relative to the glyph's (default 1). */
  weight?: number
}

/** Catmull-Rom through the points, sampled densely. */
function spline(pts: Pt[], steps = 8): Pt[] {
  const p = [pts[0], ...pts, pts[pts.length - 1]]
  const out: Pt[] = []
  for (let i = 1; i + 2 < p.length; i++)
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const f = (k: number) =>
        0.5 *
        (2 * p[i][k] +
          (-p[i - 1][k] + p[i + 1][k]) * t +
          (2 * p[i - 1][k] - 5 * p[i][k] + 4 * p[i + 1][k] - p[i + 2][k]) * t * t +
          (-p[i - 1][k] + 3 * p[i][k] - 3 * p[i + 1][k] + p[i + 2][k]) * t * t * t)
      out.push([f(0), f(1)])
    }
  out.push(pts[pts.length - 1])
  return out
}

/** Glyph units → canvas pixels (scaled into the box, then tilted about the box centre). */
function mapper(pl: Place) {
  const cx = pl.x + pl.w / 2
  const cy = pl.y + pl.h / 2
  const a = (pl.tilt * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  return (p: Pt): Pt => {
    const x = pl.x + (p[0] * pl.w) / 100 - cx
    const y = pl.y + (p[1] * pl.h) / 100 - cy
    return [cx + x * ca - y * sa, cy + x * sa + y * ca]
  }
}

// ----------------------------------------------------------------------------------------------- glyphs

/** 星: 日 (a box with one bar through its middle) above 生 (a falling tick, three bars, one vertical). */
const SEI: Stroke[] = [
  // 日
  {
    pts: [
      [22, 5],
      [22, 39]
    ]
  },
  {
    pts: [
      [22, 5],
      [70, 5],
      [70, 39]
    ]
  },
  {
    pts: [
      [22, 22],
      [70, 22]
    ]
  },
  {
    pts: [
      [22, 39],
      [70, 39]
    ]
  },
  // 生
  {
    pts: [
      [36, 48],
      [29, 60],
      [18, 69]
    ],
    curve: true
  },
  {
    pts: [
      [29, 60],
      [80, 60]
    ]
  },
  {
    pts: [
      [50, 47],
      [50, 95]
    ]
  },
  {
    pts: [
      [24, 78],
      [78, 78]
    ]
  },
  {
    pts: [
      [7, 95],
      [93, 95]
    ]
  }
]

/** の: one stroke — the diagonal down to the lower left, then clockwise round the loop, curling in at the end. */
const NO: Stroke[] = [
  {
    pts: [
      [54, 12],
      [47, 46],
      [34, 82],
      [22, 86],
      [12, 66],
      [14, 36],
      [30, 15],
      [54, 9],
      [78, 15],
      [93, 38],
      [91, 66],
      [80, 82],
      [66, 90]
    ],
    curve: true
  }
]

/** ハ: two separate strokes, the left one falling to the left, the right one starting higher and falling right. */
const HA: Stroke[] = [
  {
    pts: [
      [32, 14],
      [28, 46],
      [8, 90]
    ],
    curve: true
  },
  {
    pts: [
      [64, 8],
      [72, 42],
      [93, 88]
    ],
    curve: true
  }
]

/** ム: the open angle (upper middle → lower left → along the bottom) and the tick crossing its right end. */
const MU: Stroke[] = [
  {
    pts: [
      [50, 6],
      [12, 82],
      [80, 76]
    ]
  },
  {
    pts: [
      [64, 48],
      [90, 92]
    ]
  }
]

/** The last ム: its tick starts higher, so the bite can take the top off it and the tick still crosses the bar. */
const MU_BITTEN: Stroke[] = [
  MU[0],
  {
    pts: [
      [68, 40],
      [92, 92]
    ]
  }
]

// ------------------------------------------------------------------------------------------ rasterising

interface Seg {
  a: Pt
  b: Pt
  r: number
}

/** A glyph rasterised: its mask and, per pixel, the shading band index (0 white … 3 shade). */
interface Glyph {
  mask: Raster
  band: Uint8Array
}

function segments(strokes: Stroke[], pl: Place): Seg[] {
  const map = mapper(pl)
  const out: Seg[] = []
  for (const s of strokes) {
    const pts = (s.curve ? spline(s.pts) : s.pts).map(map)
    const r = (pl.sw * (s.weight ?? 1)) / 2
    for (let i = 0; i + 1 < pts.length; i++) out.push({ a: pts[i], b: pts[i + 1], r })
  }
  return out
}

/**
 * Rasterises round-brush segments. Each covered pixel is banded by its offset from the nearest centre line along
 * the stroke normal that faces the light: `e` pixels from the lit edge, `f` from the far edge.
 */
function rasterise(segs: Seg[], bites: (x: number, y: number) => boolean = () => false): Glyph {
  const mask = new Raster(W, H)
  const band = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let best = Infinity
      let bandHere = 2
      for (const s of segs) {
        const dx = s.b[0] - s.a[0]
        const dy = s.b[1] - s.a[1]
        const len2 = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((px - s.a[0]) * dx + (py - s.a[1]) * dy) / len2))
        const qx = s.a[0] + dx * t
        const qy = s.a[1] + dy * t
        const ox = px - qx
        const oy = py - qy
        const d = Math.hypot(ox, oy)
        if (d > s.r || d - s.r >= best) continue
        // Normal of the segment, turned to face the light.
        const l = Math.sqrt(len2)
        let nx = -dy / l
        let ny = dx / l
        if (nx * LIGHT[0] + ny * LIGHT[1] < 0) {
          nx = -nx
          ny = -ny
        }
        const along = ox * nx + oy * ny
        const e = s.r - along
        const f = s.r + along
        best = d - s.r
        bandHere = e < 1.3 ? 0 : e < s.r * 0.62 ? 1 : f < s.r * 0.7 ? 3 : 2
      }
      if (best === Infinity || bites(px, py)) continue
      mask.set(x, y, 1)
      band[y * W + x] = bandHere
    }
  return { mask, band }
}

function disc(r: number): Pt[] {
  const o: Pt[] = []
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++)
    for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) if (x * x + y * y <= r * r + 0.5) o.push([x, y])
  return o
}

function dilate(src: Raster, r: number, dx = 0, dy = 0): Raster {
  const out = new Raster(src.w, src.h)
  const d = disc(r)
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      if (!src.get(x, y)) continue
      for (const [ox, oy] of d) out.set(x + ox + dx, y + oy + dy, 1)
    }
  return out
}

// ---------------------------------------------------------------------------------------------- colours

/** Band colours: [highlight line, light band, base, shade band]. */
type Bands = readonly [number, number, number, number]

const GOLD: Bands = [color('#fffbe0'), R.gold[0], R.gold[1], R.gold[2]]
/** ハ in the hero's soft pink, ム a step deeper (his ears), so the word alternates. */
const PINK_HA: Bands = [C.white, R.princessPink[0], R.princessPink[1], R.princessPink[2]]
const PINK_MU: Bands = [C.white, R.hamEar[0], R.hamEar[1], R.hamEar[2]]
const SHADOW = C.black

// ---------------------------------------------------------------------------------------------- layout

/** Where each glyph sits. 「星の」 small and gold on the upper left; 「ハムハム」 big, bouncing up to the right. */
const SMALL_SW = 6.5
const BIG_SW = 11
const PLACES: { char: string; place: Place; strokes: Stroke[]; bands: Bands }[] = [
  { char: '星', place: { x: 8, y: 10, w: 50, h: 54, sw: SMALL_SW, tilt: 0 }, strokes: SEI, bands: GOLD },
  { char: 'の', place: { x: 60, y: 14, w: 44, h: 44, sw: SMALL_SW, tilt: 0 }, strokes: NO, bands: GOLD },
  { char: 'ハ', place: { x: 90, y: 46, w: 64, h: 70, sw: BIG_SW, tilt: -4 }, strokes: HA, bands: PINK_HA },
  { char: 'ム', place: { x: 158, y: 38, w: 66, h: 70, sw: BIG_SW, tilt: 4 }, strokes: MU, bands: PINK_MU },
  { char: 'ハ', place: { x: 227, y: 44, w: 64, h: 70, sw: BIG_SW, tilt: -4 }, strokes: HA, bands: PINK_HA },
  { char: 'ム', place: { x: 294, y: 34, w: 66, h: 70, sw: BIG_SW, tilt: 4 }, strokes: MU_BITTEN, bands: PINK_MU }
]

/** Canvas boxes of the six glyphs (untilted), plus for ム its apex and the top of its tick (for tests and reviews). */
export const LOGO_GLYPHS: readonly {
  char: string
  x: number
  y: number
  w: number
  h: number
  apex?: Pt
  tick?: Pt
}[] = PLACES.map(({ char, place, strokes }) => {
  const box = { char, x: place.x, y: place.y, w: place.w, h: place.h }
  if (char !== 'ム') return box
  const map = mapper(place)
  // The upper end of the tick that remains (the bitten one loses its top).
  const tick: Pt = strokes === MU_BITTEN ? [73, 51] : MU[1].pts[0]
  return { ...box, apex: map(MU[0].pts[0]), tick: map(tick) }
})

/**
 * The bite out of the last ム: a round bite taken out of the top of its tick (its upper right corner), its rim scalloped by
 * tooth marks. Returns the bite centre and a hit test in canvas pixels.
 */
function biteOf(pl: Place) {
  const map = mapper(pl)
  const [t0, t1] = MU_BITTEN[1].pts.map(map)
  const len = Math.hypot(t1[0] - t0[0], t1[1] - t0[1])
  const dir: Pt = [(t1[0] - t0[0]) / len, (t1[1] - t0[1]) / len]
  // The side of the tick facing up and right.
  const out: Pt = [dir[1], -dir[0]]
  const at = -1
  const R0 = 9
  const cx = t0[0] + dir[0] * at + out[0] * 5
  const cy = t0[1] + dir[1] * at + out[1] * 5
  const teeth: Pt[] = []
  const face = Math.atan2(-out[1], -out[0])
  for (let i = 0; i < 5; i++) {
    const a = face + ((i - 2) / 2) * 1.25
    teeth.push([cx + Math.cos(a) * R0, cy + Math.sin(a) * R0])
  }
  return {
    cx,
    cy,
    hit: (x: number, y: number) =>
      Math.hypot(x - cx, y - cy) < R0 || teeth.some(([tx, ty]) => Math.hypot(x - tx, y - ty) < 3)
  }
}

// ---------------------------------------------------------------------------------------------- ornaments

/** A plump five-pointed star mask. */
function starMask(cx: number, cy: number, ro: number, ri: number, rot = 0): Raster {
  const m = new Raster(W, H)
  const pts: number[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5
    const rad = i % 2 ? ri : ro
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  m.poly(pts, 1)
  return m
}

/** Shades a filled shape like a lit blob: light towards the top-left, shade towards the bottom-right. */
function blobBands(m: Raster, cx: number, cy: number, r: number): Uint8Array {
  const band = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!m.get(x, y)) continue
      const v = ((x + 0.5 - cx) * LIGHT[0] + (y + 0.5 - cy) * LIGHT[1]) / r
      const edgeLit = !m.get(x + Math.round(LIGHT[0] * 1.5), y - 1)
      band[y * W + x] = v > 0.15 && edgeLit ? 0 : v > 0.05 ? 1 : v < -0.3 ? 3 : 2
    }
  return band
}

/** A four-pointed sparkle mask. */
function sparkleMask(cx: number, cy: number, n: number): Raster {
  const m = new Raster(W, H)
  for (let i = -n; i <= n; i++) {
    const t = Math.abs(i) <= n / 3 ? 1 : 0
    for (let k = -t; k <= t; k++) {
      m.set(cx + i, cy + k, 1)
      m.set(cx + k, cy + i, 1)
    }
  }
  return m
}

// ---------------------------------------------------------------------------------------------- compose

interface Layer {
  mask: Raster
  band: Uint8Array
  bands: Bands
  line: number
}

function paint(out: Raster, l: Layer) {
  const ring = dilate(l.mask, l.line)
  for (let i = 0; i < out.data.length; i++) if (ring.data[i]) out.data[i] = C.ink
  for (let i = 0; i < out.data.length; i++) if (l.mask.data[i]) out.data[i] = l.bands[l.band[i]]
}

function drawLogo(): Raster {
  const out = new Raster(W, H)
  const last = PLACES.length - 1
  const bite = biteOf(PLACES[last].place)
  const layers: Layer[] = PLACES.map(({ place, strokes, bands }, i) => ({
    ...rasterise(segments(strokes, place), i === last ? bite.hit : undefined),
    bands,
    line: 3
  }))

  // The gold star sitting on the upper right of 星.
  const sei = mapper(PLACES[0].place)
  const [sx, sy] = sei([92, 12])
  const star = starMask(sx, sy, 10, 5.4, -0.1)
  layers.splice(1, 0, { mask: star, band: blobBands(star, sx, sy, 10), bands: GOLD, line: 2 })

  // One clean gold star flung out sideways from the bite, level with it (a pile of small crumbs read as a smudge).
  const cx = bite.cx + 23
  const cy = bite.cy + 12
  const crumb = starMask(cx, cy, 8, 3.9, 0)
  layers.push({ mask: crumb, band: blobBands(crumb, cx, cy, 8), bands: GOLD, line: 2 })

  // Sparkles.
  for (const [x, y, n] of [
    [126, 18, 6],
    [196, 24, 3],
    [262, 18, 4],
    [20, 84, 3]
  ] as const) {
    const m = sparkleMask(x, y, n)
    const band = new Uint8Array(W * H)
    for (let i = 0; i < band.length; i++) if (m.data[i]) band[i] = 1
    band[y * W + x] = 0
    layers.push({ mask: m, band, bands: [C.white, C.glow, C.glow, C.glow], line: 1 })
  }

  // Drop shadow under everything: the outlined shape, pushed down and right.
  const union = new Raster(W, H)
  for (const l of layers) {
    const ring = dilate(l.mask, l.line)
    for (let i = 0; i < union.data.length; i++) if (ring.data[i]) union.data[i] = 1
  }
  const shadow = dilate(union, 0, 2, 3)
  for (let i = 0; i < out.data.length; i++) if (shadow.data[i]) out.data[i] = SHADOW

  for (const l of layers) paint(out, l)
  return out
}

export const sheets: SheetModule = {
  ui: () => ({ logo: lazyAnim(() => [drawLogo()], UI_SPEC.logo.fps, UI_SPEC.logo.loop) })
}
