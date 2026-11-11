import { UI_SPEC } from '../contract'
import type { SheetModule } from '../module'
import { C, R, type Ramp } from '../palette'
import { Raster, outlineWith, shadeEdges } from '../raster'
import { anim, type Anim } from '../sheet'

/**
 * `ui`: hearts, the 16×16 icons, and the nine-slice `panel` and `paper`.
 *
 * Icons share one recipe: fill shapes in the base colour of a ramp, shade them with `shadeEdges` (light from the
 * top-left), add hand-placed details, then wrap the whole thing in one plum rim so they read on the night HUD and
 * on cream cards alike. Fills stay inside columns/rows 2..13 so the rim keeps a 1-px empty margin.
 */

const make = (name: string, frames: Raster[]): Anim => anim(frames, UI_SPEC[name].fps, UI_SPEC[name].loop)
const blank = () => new Raster(16, 16)

type Draw = (r: Raster, c: number) => void

/** One material: fill, shade, optionally ring it with ink so it reads against what it overlaps. */
function mat(ramp: Ramp, draw: Draw, line = false): Raster {
  const l = blank()
  draw(l, ramp[1])
  shadeEdges(l, ramp, 1, true)
  if (line) outlineWith(l, C.ink)
  return l
}

/** Composites materials back to front and wraps the result in the plum rim. */
function finish(...layers: Raster[]): Raster {
  const r = blank()
  for (const l of layers) r.blit(l)
  return outlineWith(r, C.ink)
}

/** Paints `c` only where something already exists. */
function dots(r: Raster, c: number, pts: [number, number][]) {
  for (const [x, y] of pts) r.paint(x, y, c)
}

// ------------------------------------------------------------------------------------------------- hearts

const PINK = R.princessPink

/** Heart silhouette. `tall` is the 'pop' size (one row taller). */
function heartFill(r: Raster, c: number, tall = false) {
  const cy = tall ? 5.4 : 5.5
  const rl = tall ? 3.7 : 3.5
  r.ellipse(5.55, cy, rl, rl, c)
  r.ellipse(10.45, cy, rl, rl, c)
  r.poly([2.1, cy + 0.6, 13.9, cy + 0.6, 8, tall ? 13.9 : 13.6], c)
}

function heartMask(tall = false) {
  const m = blank()
  heartFill(m, 1, tall)
  return m
}

const HEART_HI: [number, number][] = [
  [4, 4],
  [4, 5],
  [5, 3]
]

function heartFull(tall = false, flash = false): Raster {
  const l = mat(PINK, (r, c) => heartFill(r, c, tall))
  dots(l, C.white, HEART_HI)
  if (flash)
    dots(l, C.white, [
      [5, 4],
      [6, 3],
      [4, 6]
    ])
  return finish(l)
}

/** A heart whose inside is a dark hollow with a faint lit rim, filled with pink up to row `level` (exclusive). */
function heartHollow(level = 99, tall = false): Raster {
  const mask = heartMask(tall)
  const l = blank()
  const night = [R.skyNight[0], R.skyNight[1], R.uiNight[2], R.uiNight[3], R.uiNight[4]]
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!mask.get(x, y)) continue
      const edgeTL = !mask.get(x - 1, y) || !mask.get(x, y - 1)
      const edgeBR = !mask.get(x + 1, y) || !mask.get(x, y + 1)
      const filled = y >= level
      if (filled) l.set(x, y, edgeBR ? PINK[2] : edgeTL ? PINK[0] : PINK[1])
      else l.set(x, y, edgeTL ? night[0] : edgeBR ? night[3] : night[2])
    }
  return finish(l)
}

// A fresh heart pops: hollow → half filled → full with flash → settled with a sparkle.
function sparkle(r: Raster, x: number, y: number, big = false) {
  r.set(x, y, C.white)
  r.set(x - 1, y, C.glow)
  r.set(x + 1, y, C.glow)
  r.set(x, y - 1, C.glow)
  r.set(x, y + 1, C.glow)
  if (big) {
    r.set(x, y - 2, C.glow)
    r.set(x, y + 2, C.glow)
    r.set(x - 2, y, C.glow)
    r.set(x + 2, y, C.glow)
  }
}

function heartGain(): Raster[] {
  const a = heartHollow(8)
  const b = heartFull(true, true)
  const c = heartFull(false)
  sparkle(c, 13, 2, true)
  const d = heartFull(false)
  sparkle(d, 13, 2)
  return [a, b, c, d]
}

/** The two halves of a heart split along a zig-zag, each shaded on its own. */
function heartHalves(): [Raster, Raster] {
  const mask = heartMask()
  const left = blank()
  const right = blank()
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!mask.get(x, y)) continue
      const cut = 8 + (y % 4 === 1 ? 1 : y % 4 === 3 ? -1 : 0)
      ;(x < cut ? left : right).set(x, y, 1)
    }
  const paint = (m: Raster) => {
    const l = blank()
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (m.get(x, y)) l.set(x, y, PINK[1])
    return shadeEdges(l, PINK, 1, true)
  }
  return [paint(left), paint(right)]
}

/** The pixels of `src` on rows [y0, y1), as a layer of their own. */
function band(src: Raster, y0: number, y1: number) {
  const o = blank()
  for (let y = y0; y < y1; y++) for (let x = 0; x < 16; x++) o.set(x, y, src.get(x, y))
  return o
}

function heartLose(): Raster[] {
  const [L, Rr] = heartHalves()
  const crack = heartFull()
  const zig: [number, number][] = [
    [8, 3],
    [8, 4],
    [7, 5],
    [8, 6],
    [7, 7],
    [8, 8],
    [7, 9],
    [8, 10],
    [8, 11]
  ]
  for (const [x, y] of zig) crack.set(x, y, C.ink)
  const wrap = (parts: [Raster, number, number][]) => {
    const r = blank()
    for (const [p, dx, dy] of parts) r.blit(p, dx, dy)
    return outlineWith(r, C.ink)
  }
  return [
    crack,
    wrap([
      [L, -1, 0],
      [Rr, 1, 0]
    ]),
    wrap([
      [L, -2, 1],
      [Rr, 2, 1]
    ]),
    wrap([
      [band(L, 0, 8), -2, 3],
      [band(L, 8, 16), -1, 4],
      [band(Rr, 0, 8), 2, 3],
      [band(Rr, 8, 16), 1, 4]
    ])
  ]
}

// -------------------------------------------------------------------------------------------- the glyphs

const arrowRight = (r: Raster, c: number) => r.poly([2, 6, 8, 6, 8, 2, 14, 8, 8, 14, 8, 10, 2, 10], c)
const turn =
  (draw: Draw, k: 'right' | 'left' | 'up' | 'down'): Draw =>
  (r, c) => {
    const t = blank()
    draw(t, c)
    const o = k === 'right' ? t : k === 'left' ? t.flipX() : k === 'up' ? t.rot90(-1) : t.rot90(1)
    r.blit(o)
  }

function star(r: Raster, c: number, cx = 8, cy = 8.4, ro = 6.4, ri = 3) {
  const pts: number[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rad = i % 2 ? ri : ro
    pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  r.poly(pts, c)
}

function speakerBody(r: Raster, c: number, shift = 0) {
  r.rect(2 + shift, 6, 3, 5, c)
  r.poly([4.5 + shift, 6, 9 + shift, 2.5, 9 + shift, 14, 4.5 + shift, 11], c)
}

const ICONS: Record<string, () => Raster> = {
  soundOn: () =>
    finish(
      mat(R.paper, (r, c) => speakerBody(r, c)),
      mat(R.paper, (r, c) => {
        r.ring(8.5, 8, 2.3, 3.5, c, -0.9, 0.9)
        r.ring(8.5, 8, 4.3, 5.4, c, -1.0, 1.0)
      })
    ),
  soundOff: () =>
    finish(
      mat(R.paper, (r, c) => {
        r.rect(2, 6, 2, 5, c)
        r.poly([3.5, 6, 7.5, 3, 7.5, 13.5, 3.5, 11], c)
      }),
      mat(R.bandana, (r, c) => {
        r.thick(9.8, 5.4, 12.8, 10.6, 2, c)
        r.thick(12.8, 5.4, 9.8, 10.6, 2, c)
      })
    ),
  pause: () =>
    finish(
      mat(R.paper, (r, c) => {
        r.rect(3, 3, 4, 10, c)
        r.rect(9, 3, 4, 10, c)
      })
    ),
  play: () => finish(mat(R.paper, (r, c) => r.poly([4, 2, 13, 8, 4, 14], c))),
  lock: () =>
    finish(
      mat(R.steel, (r, c) => {
        r.ring(8, 6.2, 2.2, 4.2, c)
      }),
      mat(
        R.gold,
        (r, c) => {
          r.rect(3, 6, 10, 7, c)
          r.set(3, 6, 0)
          r.set(12, 6, 0)
          r.set(3, 12, 0)
          r.set(12, 12, 0)
        },
        true
      ),
      (() => {
        const k = blank()
        k.ellipse(8, 8.6, 1.4, 1.4, C.ink)
        k.rect(7, 9, 2, 3, C.ink)
        return k
      })()
    ),
  starOn: () => {
    const l = mat(R.gold, (r, c) => star(r, c))
    dots(l, C.white, [
      [7, 5],
      [6, 7]
    ])
    return finish(l)
  },
  starOff: () => {
    const mask = blank()
    star(mask, 1)
    const l = blank()
    const n = [R.skyNight[0], R.skyNight[1], R.uiNight[2], R.uiNight[3], R.uiNight[4]]
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (!mask.get(x, y)) continue
        const tl = !mask.get(x - 1, y) || !mask.get(x, y - 1)
        const br = !mask.get(x + 1, y) || !mask.get(x, y + 1)
        l.set(x, y, tl ? n[0] : br ? n[3] : n[2])
      }
    return finish(l)
  },
  arrowLeft: () => finish(mat(R.paper, turn(arrowRight, 'left'))),
  arrowRight: () => finish(mat(R.paper, turn(arrowRight, 'right'))),
  arrowUp: () => finish(mat(R.paper, turn(arrowRight, 'up'))),
  arrowDown: () => finish(mat(R.paper, turn(arrowRight, 'down'))),
  tooth: () => {
    const rows = [
      '.TTTT..TTTT.',
      'TTTTT..TTTTT',
      'TTTTT..TTTTT',
      'TTTTT..TTTTT',
      'TTTTT..TTTTT',
      '.TTTT..TTTT.',
      '.TTTT..TTTT.',
      '..TTT..TTT..'
    ]
    const teeth = mat(R.hamCream, (r, c) => r.stamp(rows, 2, 6, { T: c }))
    const gum = mat(R.hamEar, (r, c) => r.stamp(['.GGGGGGGG.', 'GGGGGGGGGG', 'GGGGGGGGGG'], 3, 3, { G: c }), true)
    return finish(teeth, gum)
  },
  jump: () =>
    finish(
      mat(R.leaf, (r, c) => r.poly([8, 2, 13, 7.5, 10, 7.5, 10, 10.5, 6, 10.5, 6, 7.5, 3, 7.5], c)),
      mat(R.paper, (r, c) => r.rect(3, 12, 10, 2, c))
    ),
  home: () =>
    finish(
      mat(R.cream, (r, c) => r.rect(4, 8, 8, 6, c)),
      mat(R.bandana, (r, c) => r.poly([8, 2, 14, 8.5, 2, 8.5], c), true),
      (() => {
        const d = blank()
        d.rect(7, 10, 2, 4, C.ink)
        return d
      })()
    ),
  retry: () =>
    finish(
      mat(R.paper, (r, c) => {
        const cx = 7.6
        const cy = 8.6
        r.ring(cx, cy, 3.4, 5.5, c, 0.45, Math.PI * 2 - 0.9)
        const th = -0.9
        const px = cx + Math.cos(th) * 4.45
        const py = cy + Math.sin(th) * 4.45
        const n = [Math.cos(th), Math.sin(th)]
        const t = [-Math.sin(th), Math.cos(th)]
        r.poly(
          [px + n[0] * 3.3, py + n[1] * 3.3, px - n[0] * 3.3, py - n[1] * 3.3, px + t[0] * 3.4, py + t[1] * 3.4],
          c
        )
      })
    ),
  next: () =>
    finish(
      mat(R.gold, (r, c) => {
        r.thick(4.5, 3.5, 8.5, 8, 3, c)
        r.thick(8.5, 8, 4.5, 12.5, 3, c)
        r.thick(9.5, 3.5, 13, 8, 3, c)
        r.thick(13, 8, 9.5, 12.5, 3, c)
      })
    ),
  clock: () => {
    const rim = mat(R.gold, (r, c) => r.ellipse(8, 8, 6, 6, c))
    const face = blank()
    face.ellipse(8, 8, 4.1, 4.1, R.cream[1])
    face.line(8, 8, 8, 5, C.ink)
    face.line(8, 8, 10, 9, C.ink)
    return finish(rim, face)
  },
  check: () =>
    finish(
      mat(R.leaf, (r, c) => {
        r.thick(3.5, 8.5, 6.5, 11.5, 3, c)
        r.thick(6.5, 11.5, 12.5, 4.5, 3, c)
      })
    ),
  sun: () =>
    finish(
      mat(R.sun, (r, c) => {
        r.ellipse(8, 8, 3.2, 3.2, c)
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4
          r.thick(8 + Math.cos(a) * 4.6, 8 + Math.sin(a) * 4.6, 8 + Math.cos(a) * 5.4, 8 + Math.sin(a) * 5.4, 1.5, c)
        }
      })
    ),
  moon: () =>
    finish(
      mat(R.moon, (r, c) => {
        r.ellipse(7.5, 8, 6, 6, c)
        r.ellipse(11.5, 6, 4.8, 4.8, 0)
      })
    ),
  paw: () => {
    const l = mat(R.hamPink, (r, c) => {
      r.ellipse(8, 10.6, 3.9, 3.1, c)
      r.ellipse(3.2, 7.6, 1.4, 1.9, c)
      r.ellipse(5.5, 4.2, 1.4, 1.9, c)
      r.ellipse(10.5, 4.2, 1.4, 1.9, c)
      r.ellipse(12.8, 7.6, 1.4, 1.9, c)
    })
    return finish(l)
  }
}

// ------------------------------------------------------------------------------------------ nine-slice

/** Distance (4-neighbour steps) from the transparent area, 1 = outermost painted pixel. */
function depthMap(shape: Raster): number[] {
  const d = new Array<number>(shape.w * shape.h).fill(99)
  const queue: number[] = []
  for (let y = 0; y < shape.h; y++)
    for (let x = 0; x < shape.w; x++) {
      if (!shape.get(x, y)) {
        d[y * shape.w + x] = 0
        queue.push(y * shape.w + x)
      }
    }
  for (let y = 0; y < shape.h; y++)
    for (let x = 0; x < shape.w; x++)
      if (shape.get(x, y) && (x === 0 || y === 0 || x === shape.w - 1 || y === shape.h - 1)) {
        d[y * shape.w + x] = 1
        queue.push(y * shape.w + x)
      }
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]
    const x = p % shape.w
    const y = (p / shape.w) | 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= shape.w || ny >= shape.h) continue
      if (d[ny * shape.w + nx] <= d[p] + 1) continue
      d[ny * shape.w + nx] = d[p] + 1
      queue.push(ny * shape.w + nx)
    }
  }
  return d
}

/** A 24×24 rounded square (corner radius 4) with the four corner pixels trimmed. */
function roundedShape(): Raster {
  const r = new Raster(24, 24)
  r.rect(0, 0, 24, 24, 1)
  const cut = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [0, 2],
    [1, 1]
  ]
  for (const [x, y] of cut) {
    r.set(x, y, 0)
    r.set(23 - x, y, 0)
    r.set(x, 23 - y, 0)
    r.set(23 - x, 23 - y, 0)
  }
  return r
}

type Skin = (depth: number, lit: boolean, dark: boolean) => number

function nineSlice(skin: Skin): Raster {
  const shape = roundedShape()
  const d = depthMap(shape)
  const out = new Raster(24, 24)
  const dep = (x: number, y: number) => (x < 0 || y < 0 || x > 23 || y > 23 ? 0 : d[y * 24 + x])
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const k = dep(x, y)
      if (!k) continue
      // A pixel is "lit" when the ring it belongs to is reached from above or from the left, dark from below/right.
      const lit = dep(x - 1, y) < k || dep(x, y - 1) < k
      const dark = !lit && (dep(x + 1, y) < k || dep(x, y + 1) < k)
      out.set(x, y, skin(k, lit, dark))
    }
  return out
}

const panel = () => {
  const N = R.uiNight
  const G = R.gold
  return nineSlice((k, lit, dark) => {
    if (k === 1) return dark ? G[3] : G[2]
    if (k === 2) return dark ? G[2] : lit ? G[0] : G[1]
    if (k === 3) return dark ? N[3] : lit ? N[0] : N[1]
    return N[1]
  })
}

const paper = () => {
  const P = R.cream
  return nineSlice((k, lit, dark) => {
    if (k === 1) return C.ink
    if (k === 2) return dark ? C.ink : C.inkWarm
    if (k === 3) return dark ? P[2] : lit ? P[0] : P[1]
    if (k === 4) return dark ? P[1] : P[1]
    return P[1]
  })
}

export const sheets: SheetModule = {
  ui: () => {
    const out: Record<string, Anim> = {
      heartFull: make('heartFull', [heartFull()]),
      heartEmpty: make('heartEmpty', [heartHollow()]),
      heartGain: make('heartGain', heartGain()),
      heartLose: make('heartLose', heartLose()),
      panel: make('panel', [panel()]),
      paper: make('paper', [paper()])
    }
    for (const [name, draw] of Object.entries(ICONS)) out[name] = make(name, [draw()])
    return out
  }
}
