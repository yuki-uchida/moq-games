/**
 * `fx` (1/3): dust, puff, smoke, spark, star, shine, sparkle, chomp, ring, boom, glow.
 *
 * Every effect is a parametric drawing: a function of the frame's progress `t` (0..1) that grows a clear shape,
 * peaks and disperses. Shapes are outlined with a dark of their own material so they read on grass, cave rock and
 * brick alike. The helpers exported here are shared with `debris.ts` and `marks.ts`.
 */
import { FX_SPEC } from '../contract'
import type { SheetModule } from '../module'
import { C, R, ramp, type Ramp } from '../palette'
import { Raster, bayer, outlineWith, part } from '../raster'
import { anim, type Anim } from '../sheet'

export const TAU = Math.PI * 2
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

/** Builds an Anim from its contract entry (fps, loop, anchor), so the sheet cannot drift from the contract. */
export function make(name: string, fr: Raster[], extra: Partial<Anim> = {}): Anim {
  const s = FX_SPEC[name]
  if (!s) throw new Error(`fx: '${name}' is not in FX_SPEC`)
  return anim(fr, s.fps, s.loop, { ...(s.anchor ? { anchor: s.anchor } : {}), ...extra })
}

/** `n` frames of a `w`×`h` canvas; `draw(raster, frameIndex, progress 0..1)`. */
export function frames(n: number, w: number, h: number, draw: (r: Raster, f: number, t: number) => void) {
  return Array.from({ length: n }, (_, f) => {
    const r = new Raster(w, h)
    draw(r, f, n === 1 ? 0 : f / (n - 1))
    return r
  })
}

/** Smoke: a cool violet-grey, darker than dust so it shows on bright ground and still lifts off dark rock. */
export const SMOKE = ramp('#a69cb8', '#7c7292', '#574d6c', '#3a334c', '#1c1830')

/** A round, light-shaded blob with its own outline (so overlapping puffs keep inner contours). */
export function blob(r: Raster, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, spec = true) {
  if (rx < 1.2 || ry < 1.2) {
    // Too small for shading: a flat dot with a highlight-free body.
    part(r, (l) => l.ellipse(cx, cy, Math.max(rx, 0.8), Math.max(ry, 0.8), ramp[1]))
    return r
  }
  return part(r, (l) => {
    l.ellipse(cx, cy, rx, ry, ramp[1])
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx
        const ny = (y + 0.5 - cy) / ry
        const q = nx * nx + ny * ny
        if (q > 1.0001) continue
        const nz = Math.sqrt(Math.max(0, 1 - q))
        // Light from the top-left: crescent shade bottom-right, highlight top-left.
        const d = -0.55 * nx - 0.7 * ny + 0.55 * nz
        l.set(x, y, d > 0.82 && spec ? ramp[0] : d > 0.12 ? ramp[1] : d > -0.45 ? ramp[2] : ramp[3])
      }
  })
}

/** Star polygon points: alternating outer/inner radii. `outer` may be a function for uneven points. */
export function starPts(
  cx: number,
  cy: number,
  outer: number | ((i: number) => number),
  inner: number,
  n: number,
  rot: number,
  squashX = 1
) {
  const pts: number[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n
    const rad = i % 2 === 0 ? (typeof outer === 'number' ? outer : outer(i / 2)) : inner
    pts.push(cx + Math.cos(a) * rad * squashX, cy + Math.sin(a) * rad)
  }
  return pts
}

/** A glint: a thin four-pointed star (`len` = tip distance, `fat` = inner radius as a fraction). */
export function glint(r: Raster, cx: number, cy: number, len: number, fat: number, rim: number, core: number, rot = 0) {
  r.poly(starPts(cx, cy, len, len * fat, 4, rot - Math.PI / 2), rim)
  r.poly(starPts(cx, cy, len * 0.62, len * fat * 0.55, 4, rot - Math.PI / 2), core)
  return r
}

// ---------------------------------------------------------------------------------------------------- dust

/** [dx, dy, radius] of the clouds, relative to the point on the ground the puff was kicked up from. */
const DUST: readonly (readonly [number, number, number])[][] = [
  [
    [-4, 0, 3],
    [0, -1, 4],
    [4, 0, 3]
  ],
  [
    [-8, 0, 4],
    [0, -3, 5.5],
    [8, 0, 4]
  ],
  [
    [-10, -1, 4.5],
    [-1, -5, 6],
    [10, -2, 4.5],
    [0, 1, 3]
  ],
  [
    [-11, -3, 3.5],
    [-3, -9, 4],
    [11, -5, 3.5],
    [4, -1, 2]
  ],
  [
    [-12, -6, 2],
    [-2, -12, 2],
    [12, -8, 2]
  ]
]

function dust(): Anim {
  return make(
    'dust',
    frames(5, 32, 32, (r, f) => {
      for (const [dx, dy, rad] of [...DUST[f]].sort((a, b) => a[1] - b[1]))
        blob(r, 16 + dx, 24 + dy, rad, rad * 0.88, R.dust)
    })
  )
}

// ---------------------------------------------------------------------------------------------------- puff

/** The cartoon poof: round white clouds burst outward from a core, with gold star points between them. */
function puff(): Anim {
  // [ring radius, cloud radius, core radius, star distance, star size]
  const P = [
    [6, 6.2, 8, 17, 3],
    [11, 6.6, 5, 18, 4.2],
    [15, 5.6, 0, 18, 3.6],
    [16.5, 4, 0, 18, 3],
    [19, 3, 0, 0, 0],
    [21, 1.6, 0, 0, 0]
  ] as const
  const size = [1, 0.8, 1.1, 0.85, 1, 0.75]
  return make(
    'puff',
    frames(6, 48, 48, (r, f) => {
      const [ringR, cr, core, starD, starS] = P[f]
      const items: { x: number; y: number; rad: number }[] = []
      for (let k = 0; k < 6; k++) {
        const a = k * (TAU / 6) + 0.25 + f * 0.22
        const s = f === 5 ? (k % 2 ? 0.6 : 1) : size[k]
        items.push({ x: 24 + Math.cos(a) * ringR, y: 24 + Math.sin(a) * ringR * 0.92, rad: cr * s })
      }
      if (core) items.push({ x: 24, y: 24, rad: core })
      items.sort((a, b) => a.y - b.y)
      for (const it of items) blob(r, it.x, it.y, it.rad, it.rad * 0.94, R.cloud)
      // Gold star points burst between the clouds.
      for (let k = 0; k < 4 && starS; k++) {
        const a = k * (TAU / 4) + Math.PI / 4 + 0.25 + f * 0.22
        const x = 24 + Math.cos(a) * starD
        const y = 24 + Math.sin(a) * starD
        const g = new Raster(r.w, r.h)
        glint(g, x, y, starS, 0.3, R.gold[1], C.white, 0)
        r.blit(outlineWith(g, R.gold[3]))
      }
    })
  )
}

// ---------------------------------------------------------------------------------------------------- smoke

const SMOKE_CLOUDS: readonly (readonly [number, number, number])[][] = [
  [
    [16, 25, 5],
    [10.5, 26, 3.5],
    [21.5, 26, 3.5]
  ],
  [
    [16, 21, 6],
    [10, 24, 4],
    [22, 24, 4],
    [15, 27, 3]
  ],
  [
    [15, 16, 6],
    [21.5, 20, 5],
    [10, 21, 4.5],
    [17, 25, 3.5]
  ],
  [
    [16, 10.5, 5.5],
    [10, 17, 4],
    [22, 15, 4.5],
    [15, 22, 3]
  ],
  [
    [14, 6.5, 4],
    [21, 10, 3.5],
    [9, 14, 3],
    [20, 17, 2.8],
    [15, 23, 2]
  ],
  [
    [13, 4.5, 2.5],
    [20, 6, 2.2],
    [9, 10, 1.8],
    [22, 12.5, 1.6],
    [17, 16, 1.3]
  ]
]

function smoke(): Anim {
  return make(
    'smoke',
    frames(6, 32, 32, (r, f) => {
      for (const [x, y, rad] of [...SMOKE_CLOUDS[f]].sort((a, b) => a[1] - b[1])) blob(r, x, y, rad, rad * 0.92, SMOKE)
    })
  )
}

// ---------------------------------------------------------------------------------------------------- spark

/** A hit spark: a white-yellow star burst that flashes large and collapses to dots. */
function spark(): Anim {
  const star = (r: Raster, n: number, long: number, short: number, inner: number, rot: number) => {
    const outer = (i: number) => (i % 2 === 0 ? long : short)
    r.poly(starPts(16, 16, outer, inner, n, rot), R.gold[0])
    r.poly(
      starPts(16, 16, (i) => outer(i) * 0.55, inner * 0.5, n, rot),
      C.white
    )
    outlineWith(r, R.fire[2])
  }
  return make(
    'spark',
    frames(4, 32, 32, (r, f) => {
      if (f === 0) star(r, 8, 8.5, 6, 3.2, -Math.PI / 2)
      else if (f === 1) {
        star(r, 8, 14, 9, 4.2, -Math.PI / 2 + 0.2)
        // A small bright core on top of the burst keeps it a flash rather than a flat star.
        r.ellipse(16, 16, 2.6, 2.6, C.white)
      } else if (f === 2) {
        star(r, 6, 9.5, 9.5, 2.2, -Math.PI / 2 + 0.5)
        for (const [x, y] of [
          [3, 5],
          [28, 7],
          [27, 26],
          [5, 27]
        ])
          r.rect(x, y, 2, 2, R.gold[0])
      } else {
        for (let k = 0; k < 8; k++) {
          const a = k * (TAU / 8) + 0.4
          const d = k % 2 ? 11 : 13
          const x = 16 + Math.cos(a) * d
          const y = 16 + Math.sin(a) * d
          if (k % 2) r.set(x, y, R.gold[0])
          else r.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, R.gold[1])
        }
        r.set(16, 16, C.white)
      }
    })
  )
}

// ----------------------------------------------------------------------------------- star, shine, sparkle

/** A small gold five-pointed star that spins (width squeezes as it turns, rocking left and right). */
function star(): Anim {
  const spec = [
    [1, 0],
    [0.7, 0.18],
    [0.9, 0],
    [0.7, -0.18]
  ] as const
  return make(
    'star',
    frames(4, 16, 16, (r, f) => {
      const [sx, rot] = spec[f]
      r.poly(starPts(8, 8.4, 6.6, 3, 5, -Math.PI / 2 + rot, sx), R.gold[1])
      // Diagonal bands give the faceted look: light top-left, shade bottom-right.
      r.map((c, x, y) => {
        const d = x + 0.5 - 8 + (y + 0.5 - 8.4)
        return d > 1.5 ? R.gold[2] : d < -2.5 ? R.gold[0] : c
      })
      outlineWith(r, R.gold[4])
    })
  )
}

/** A cold four-pointed glint for steel and gems: it flares open and shrinks away. */
function shine(): Anim {
  const spec = [
    [4.2, 0.3, 0],
    [7, 0.2, 0],
    [5, 0.25, Math.PI / 4],
    [2.4, 0.4, 0]
  ] as const
  return make(
    'shine',
    frames(4, 16, 16, (r, f) => {
      const [len, fat, rot] = spec[f]
      glint(r, 8, 8, len, fat, C.spark, C.white, rot)
      if (f === 3) {
        r.set(3, 4, C.white)
        r.set(12, 12, C.spark)
      }
      if (f === 2) {
        r.set(3, 3, C.spark)
        r.set(13, 12, C.white)
      }
    })
  )
}

/** A soft gold-white twinkle for pickups and the goal: rounder than the glint, with orbiting dots. */
function sparkle(): Anim {
  const spec = [
    [3, 0.42, 0],
    [6.5, 0.34, 0],
    [4.6, 0.42, Math.PI / 4],
    [2.2, 0.5, 0]
  ] as const
  return make(
    'sparkle',
    frames(4, 16, 16, (r, f) => {
      const [len, fat, rot] = spec[f]
      glint(r, 8, 8, len, fat, R.gold[1], C.glow, rot)
      r.set(8, 8, C.white)
      if (f === 1) {
        r.set(2, 3, R.gold[0])
        r.set(13, 12, R.gold[0])
        r.set(13, 3, C.white)
      }
      if (f === 2) {
        r.set(3, 11, R.gold[0])
        r.set(12, 4, C.white)
      }
      if (f === 3) r.set(4, 4, R.gold[0])
    })
  )
}

// ---------------------------------------------------------------------------------------------------- chomp

interface JawShape {
  hingeX: number
  hingeY: number
  length: number
  height: number
  open: number
  /** Marks mode: teeth are moved away from the seam by this much and every other tooth is skipped. */
  lift?: number
}

/** Which tooth row a jaw uses: the upper and lower rows are offset by half a pitch so they interlock. */
const TOOTH_PITCH = 8
const TOOTH_H = 5.5

/**
 * One jaw in the hinge's local frame: `u` along the jaw, `v` outward from the seam. The gum is a half ellipse,
 * the teeth are triangles that hang from the seam into the opposite jaw.
 */
function jawLayer(w: number, h: number, sign: -1 | 1, s: JawShape, teethOnly = false) {
  const l = new Raster(w, h)
  const a = sign * s.open
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const uc = s.length / 2 + 1
  const half = s.length / 2 + 2
  const phase = sign === -1 ? 0 : TOOTH_PITCH / 2
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - s.hingeX
      const dy = y + 0.5 - s.hingeY
      const u = dx * ca + dy * sa
      const v = sign * (-dx * sa + dy * ca)
      const tv = v + (s.lift ?? 0)
      let c = 0
      const eu = (u - uc) / half
      const ev = v / s.height
      if (!teethOnly && v >= 0 && eu * eu + ev * ev <= 1) {
        const q = v / s.height
        c = q < 0.2 ? R.crimson[3] : R.crimson[1]
        if (sign === -1 && q > 0.62 && u < s.length * 0.62) c = R.crimson[0]
        else if (sign === 1 && q > 0.6) c = R.crimson[2]
        else if (sign === -1 && q > 0.82) c = R.crimson[2]
      }
      // Teeth: root inside the gum, tip reaching toward the other jaw.
      const k = Math.round((u - 7 - phase) / TOOTH_PITCH)
      const tu = u - (7 + phase + k * TOOTH_PITCH)
      const skip = s.lift !== undefined && k % 2 === 0
      if (!skip && k >= 0 && 7 + phase + k * TOOTH_PITCH < s.length - 4 && tv >= -TOOTH_H && tv <= 1.6) {
        const widthHere = 3.1 * clamp01(1 + Math.min(0, tv) / TOOTH_H)
        if (Math.abs(tu) <= widthHere) c = tu > widthHere - 1.3 && tv > -TOOTH_H + 1 ? R.paper[2] : C.white
      }
      if (c) l.data[y * w + x] = c
    }
  return l
}

function jaws(r: Raster, s: JawShape, teethOnly = false) {
  for (const sign of [1, -1] as const) {
    const layer = jawLayer(r.w, r.h, sign, s, teethOnly)
    if (!teethOnly) outlineWith(layer, C.ink)
    r.blit(layer)
  }
}

/** The jaws that snap shut in front of the hero (facing right): open, closing, SNAP with a flash, marks, sparks. */
function chomp(): Anim {
  const fr = frames(5, 64, 64, (r, f) => {
    const base = { hingeX: 6, hingeY: 32, length: 40 }
    if (f === 0) jaws(r, { ...base, height: 10, open: 0.62 })
    else if (f === 1) {
      // Closing fast: the jaws stretch a little along the swing.
      jaws(r, { ...base, hingeX: 7, height: 10.5, open: 0.26 })
      for (const [x, y, len] of [
        [44, 14, 8],
        [47, 50, 8],
        [51, 19, 5]
      ]) {
        r.rect(x, y, len, 1, C.white)
      }
    } else if (f === 2) {
      jaws(r, { ...base, hingeX: 8, height: 11.5, open: 0.02 })
      // The impact flash at the bite point.
      const flash = new Raster(64, 64)
      flash.poly(
        starPts(50, 32, (i) => (i % 2 ? 7 : 12), 4.4, 8, -Math.PI / 2),
        R.gold[0]
      )
      flash.poly(
        starPts(50, 32, (i) => (i % 2 ? 3.6 : 7), 2.4, 8, -Math.PI / 2),
        C.white
      )
      outlineWith(flash, R.fire[2])
      r.blit(flash)
    } else if (f === 3) {
      // Teeth marks left in the air, thinning out.
      const marks = new Raster(64, 64)
      jaws(marks, { ...base, hingeX: 9, height: 11, open: 0.07, lift: -3.5 }, true)
      marks.map((c) => (c === R.paper[2] ? R.dust[2] : R.dust[1]))
      r.blit(outlineWith(marks, R.dust[3]))
    } else {
      for (const [x, y, len] of [
        [47, 20, 4.2],
        [53, 33, 5],
        [45, 45, 3.6],
        [34, 29, 2.6]
      ])
        glint(r, x, y, len, 0.3, R.gold[1], C.white)
      for (const [x, y] of [
        [41, 14],
        [57, 24],
        [58, 42],
        [38, 49],
        [50, 52],
        [30, 18]
      ])
        r.rect(x, y, 1, 1, R.gold[0])
    }
  })
  return make('chomp', fr, { anchor: [32, 32] })
}

// ----------------------------------------------------------------------------------------------------- ring

/** A shock ring: a thin bright ring that grows from a small circle to the frame edge and breaks into arcs. */
function ring(): Anim {
  const arcRing = (r: Raster, rad: number, thick: number, gaps: readonly (readonly [number, number])[]) => {
    const spans: [number, number][] = []
    if (!gaps.length) spans.push([-Math.PI, Math.PI])
    else {
      const sorted = [...gaps].sort((a, b) => a[0] - b[0])
      let start = sorted[sorted.length - 1][1] - TAU
      for (const [g0, g1] of sorted) {
        spans.push([start, g0])
        start = g1
      }
    }
    for (const [a0, a1] of spans) {
      // Cool rim first, then the bright band inside it: the arc ends are covered by the rim.
      const pad = 0.04
      r.ring(32, 32, rad - thick - 1, rad + 1, R.magic[2], a0 + pad, a1 - pad)
      r.ring(32, 32, rad - thick, rad, C.white, a0 + pad * 2, a1 - pad * 2)
    }
  }
  return make(
    'ring',
    frames(5, 64, 64, (r, f) => {
      if (f === 0) {
        r.ellipse(32, 32, 7, 7, R.magic[2])
        r.ellipse(32, 32, 5.5, 5.5, C.white)
        r.ellipse(32, 32, 2.4, 2.4, R.magic[0])
      } else if (f === 1) {
        arcRing(r, 14, 3, [])
        for (let k = 0; k < 8; k++) {
          const a = k * (TAU / 8) + 0.2
          r.thick(
            32 + Math.cos(a) * 18,
            32 + Math.sin(a) * 18,
            32 + Math.cos(a) * 22,
            32 + Math.sin(a) * 22,
            1.6,
            C.white
          )
        }
      } else if (f === 2) {
        arcRing(r, 22, 3, [[0.9, 1.15]])
        for (let k = 0; k < 8; k++) {
          const a = k * (TAU / 8) + 0.55
          r.thick(
            32 + Math.cos(a) * 25,
            32 + Math.sin(a) * 25,
            32 + Math.cos(a) * 28,
            32 + Math.sin(a) * 28,
            1.2,
            R.magic[1]
          )
        }
      } else if (f === 3) {
        arcRing(r, 28, 2, [
          [-2.6, -2.15],
          [-0.95, -0.55],
          [0.5, 0.95],
          [2.0, 2.45]
        ])
      } else {
        arcRing(r, 30.5, 1, [
          [-2.8, -2.0],
          [-1.5, -0.2],
          [0.3, 1.1],
          [1.8, 3.0]
        ])
      }
    })
  )
}

// ----------------------------------------------------------------------------------------------------- boom

/**
 * A lobed fireball: a union of circles, banded by depth (deep orange rim, yellow body, pale core), lit from the
 * top-left, with a warm dark outline.
 */
function fireball(r: Raster, cx: number, cy: number, rad: number, lobes: number, rot: number, hole = 0) {
  const circles: [number, number, number][] = [[cx, cy, rad * 0.62]]
  for (let k = 0; k < lobes; k++) {
    const a = rot + (k * TAU) / lobes
    const sz = rad * (0.4 + 0.1 * Math.sin(k * 2.7 + rot * 3))
    circles.push([cx + Math.cos(a) * rad * 0.58, cy + Math.sin(a) * rad * 0.58, sz])
  }
  const layer = new Raster(r.w, r.h)
  for (let y = Math.floor(cy - rad * 1.2); y <= Math.ceil(cy + rad * 1.2); y++)
    for (let x = Math.floor(cx - rad * 1.2); x <= Math.ceil(cx + rad * 1.2); x++) {
      let depth = -Infinity
      for (const [ox, oy, rr] of circles) depth = Math.max(depth, rr - Math.hypot(x + 0.5 - ox, y + 0.5 - oy))
      if (depth <= 0) continue
      if (hole && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < hole) continue
      depth += -(x - cx + (y - cy)) * 0.05
      const k = rad / 20
      layer.set(x, y, depth < 1.6 ? R.fire[3] : depth < 4.2 * k ? R.fire[2] : depth < 8.5 * k ? R.fire[1] : R.fire[0])
    }
  outlineWith(layer, R.fire[4])
  r.blit(layer)
}

/** The cartoon explosion: white flash, orange-yellow fireball with lobes, then rings of smoke. */
function boom(): Anim {
  return make(
    'boom',
    frames(6, 64, 64, (r, f) => {
      if (f === 0) {
        r.poly(
          starPts(32, 32, (i) => (i % 2 ? 11 : 18), 8, 10, -Math.PI / 2),
          R.gold[0]
        )
        r.poly(
          starPts(32, 32, (i) => (i % 2 ? 6 : 11), 4.5, 10, -Math.PI / 2),
          C.white
        )
        outlineWith(r, R.fire[2])
      } else if (f === 1) {
        fireball(r, 32, 32, 17, 7, 0.3)
        r.ellipse(30.5, 30.5, 5.5, 5, C.white)
      } else if (f === 2) {
        fireball(r, 32, 32, 25, 8, 0.7)
        r.ellipse(31, 31, 6.5, 6, R.fire[0])
        r.ellipse(30, 30, 3.4, 3, C.white)
      } else if (f === 3) {
        fireball(r, 32, 32, 25, 8, 1.2, 12)
        for (const [x, y, rad] of [
          [32, 32, 9],
          [14, 22, 5],
          [50, 40, 5.5]
        ])
          blob(r, x, y, rad, rad * 0.92, SMOKE)
      } else if (f === 4) {
        const items: [number, number, number][] = []
        for (let k = 0; k < 8; k++) {
          const a = k * (TAU / 8) + 0.3
          items.push([32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21, k % 2 ? 6 : 7.5])
        }
        items.sort((a, b) => a[1] - b[1])
        for (const [x, y, rad] of items) blob(r, x, y, rad, rad * 0.92, SMOKE)
        for (const [x, y] of [
          [32, 24],
          [25, 36],
          [38, 38]
        ]) {
          r.rect(x, y, 2, 2, R.fire[1])
          r.set(x, y, R.fire[0])
        }
      } else {
        for (let k = 0; k < 8; k++) {
          const a = k * (TAU / 8) + 0.5
          const d = 26 + (k % 2) * 2
          blob(r, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, k % 2 ? 1.8 : 2.8, k % 2 ? 1.6 : 2.5, SMOKE)
        }
        r.rect(32, 30, 1, 1, SMOKE[0])
        r.rect(27, 35, 1, 1, SMOKE[0])
      }
    }),
    { anchor: [32, 32] }
  )
}

// ----------------------------------------------------------------------------------------------------- glow

/** A soft light disc: gold-white, densest at the centre, Bayer-dithered to nothing at the edge. */
function glow(): Anim {
  const r = new Raster(64, 64)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 31.5
      if (d >= 1) continue
      const density = 1.25 * (1 - d) ** 1.45
      if (bayer(x, y) >= density) continue
      r.set(x, y, d < 0.3 ? C.glow : d < 0.62 ? R.gold[0] : R.gold[1])
    }
  return make('glow', [r], { anchor: [32, 32] })
}

export const sheets: SheetModule = {
  fx: () => ({
    dust: dust(),
    puff: puff(),
    smoke: smoke(),
    spark: spark(),
    star: star(),
    shine: shine(),
    sparkle: sparkle(),
    chomp: chomp(),
    ring: ring(),
    boom: boom(),
    glow: glow()
  })
}
