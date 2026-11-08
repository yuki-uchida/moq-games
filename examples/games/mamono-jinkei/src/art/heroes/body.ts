/**
 * The slime body: a glossy mochi-dome jelly built from a squashable shape, plus its face, pseudopod arms and the
 * small effect glyphs (sparkles, sweat) the poses use. Everything is drawn natively per frame (no raster scaling).
 */
import { C, R } from '../palette'
import { Raster, type Ramp } from '../raster'
import { boxOf, outlineBox as outline, part } from './layer'

export type Dir = 'down' | 'up' | 'side'

export interface BodySpec {
  cx: number
  /** Row of the ground contact; the last body row is feet - 1 and the outline sits on `feet`. */
  feet: number
  w: number
  h: number
  /** Horizontal shift of the top of the dome (px, + = right). */
  lean?: number
  /** Exponent of the right edge (side view) / bottom edge: bigger = flatter, as when pressed against a wall. */
  wall?: number
}

export interface Anchors {
  cx: number
  feet: number
  top: number
  w: number
  h: number
  /** Centre x of the head (cx + lean). */
  hx: number
  lean: number
  dir: Dir
  /** Shoulders where the pseudopods grow (right = screen right). */
  shoulderL: [number, number]
  shoulderR: [number, number]
  /** Top of the eyes. */
  eyeY: number
}

export const anchorsOf = (b: BodySpec, dir: Dir): Anchors => {
  const lean = b.lean ?? 0
  const top = b.feet - b.h
  const sy = Math.round(top + b.h * 0.58)
  const side = dir === 'side'
  return {
    cx: b.cx,
    feet: b.feet,
    top,
    w: b.w,
    h: b.h,
    hx: b.cx + lean,
    lean,
    dir,
    shoulderL: [Math.round(b.cx - b.w / 2 + 3 + lean * 0.3), sy],
    shoulderR: [Math.round(b.cx + b.w / 2 - 3 + lean * 0.3), side ? sy + 1 : sy],
    eyeY: Math.round(top + b.h * 0.34)
  }
}

/** Draws the body (shaded, outlined) into `r`. */
export function drawBody(r: Raster, b: BodySpec, ramp: Ramp, dir: Dir, bubbles = true) {
  const lean = b.lean ?? 0
  const top = b.feet - b.h
  const wallR = b.wall && dir === 'side' ? b.wall : 0
  const wallB = b.wall && dir !== 'side' ? b.wall : 0
  const layer = new Raster(r.w, r.h)
  const half = b.w / 2
  const cy = top + b.h / 2
  const pBottom = wallB || 2.7
  const norm = (x: number, y: number) => {
    const v = (y + 0.5 - cy) / (b.h / 2)
    const t = (y + 0.5 - top) / b.h
    const off = lean * Math.pow(Math.max(0, 1 - t), 1.5)
    const u = (x + 0.5 - (b.cx + off)) / half / (1 + 0.09 * v)
    return [u, v] as const
  }
  const inside = (x: number, y: number) => {
    const [u, v] = norm(x, y)
    const au = Math.abs(u)
    const av = Math.abs(v)
    const tu = u > 0 && wallR ? Math.pow(au, wallR) : au * au
    const tv = v < 0 ? av * av : Math.pow(av, pBottom)
    return tu + tv <= 1
  }
  const y0 = Math.floor(top)
  const y1 = b.feet - 1
  const x0 = Math.floor(b.cx - half - 2 + Math.min(0, lean))
  const x1 = Math.ceil(b.cx + half + 2 + Math.max(0, lean))
  const gcx = b.cx + 1 + lean * 0.25
  const gcy = b.feet - b.h * 0.3
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue
      const [u, v] = norm(x, y)
      const q = u * u + v * v
      const s = u * 0.55 + v * 0.8
      let c = ramp[1]
      if (s > 0.3 && q > 0.18) c = ramp[2]
      if (s > 0.7 && q > 0.66) c = ramp[3]
      // Inner core glow low in the body (the jelly is lit through).
      const gx = (x + 0.5 - gcx) / (b.w * 0.27)
      const gy = (y + 0.5 - gcy) / Math.max(2, b.h * 0.17)
      const g = gx * gx + gy * gy
      if (g < 1) c = g < 0.16 ? ramp[0] : ramp[1]
      // Highlight crescent along the upper left.
      if (s < -0.52 && q > 0.3 && q < 0.8) c = ramp[0]
      // Refraction rim on the bottom edge.
      if (!inside(x, y + 1) && x < b.cx + half * 0.35 && x > b.cx - half * 0.7 && c !== ramp[3]) c = ramp[0]
      layer.set(x, y, c)
    }
  // Specular cluster and bubbles.
  const hit = (x: number, y: number, c: number) => {
    if (layer.get(x, y)) layer.set(x, y, c)
  }
  const sx = Math.round(b.cx - b.w * 0.36 + lean * 0.5)
  const sy = Math.round(top + b.h * 0.34)
  if (b.h >= 12) {
    hit(sx, sy, C.white)
    hit(sx + 1, sy, C.white)
    hit(sx, sy + 1, C.white)
    if (b.h >= 18) hit(sx + 3, sy + 3, C.white)
  }
  if (bubbles && b.h >= 20) {
    const bx = Math.round(b.cx + b.w * 0.2)
    const by = Math.round(b.feet - b.h * 0.42)
    hit(bx, by, ramp[0])
    hit(bx + 1, by + 1, ramp[2])
    hit(Math.round(b.cx - b.w * 0.14), Math.round(b.feet - b.h * 0.2), ramp[0])
    if (b.w >= 33) hit(Math.round(b.cx + b.w * 0.34), Math.round(b.feet - b.h * 0.24), ramp[0])
  }
  outline(layer)
  r.blit(layer)
  return anchorsOf(b, dir)
}

/* ------------------------------------------------------------------ face */

export type Eyes = 'open' | 'half' | 'shut' | 'happy' | 'x' | 'angry' | 'squint' | 'wide' | 'look'
export type Mouth = 'smile' | 'o' | 'flat' | 'wavy' | 'grit' | 'open' | 'frown' | 'none' | 'cat'
export interface Face {
  eyes: Eyes
  mouth: Mouth
  blush?: boolean
  /** Eye glance in px. */
  look?: number
}

const EYE7 = ['.kkk.', 'kkkkk', 'kwwkk', 'kwwkk', 'kkkwk', 'kdddk', '.kkk.']
const EYE5 = ['.kkk.', 'kwwkk', 'kkkwk', 'kdddk', '.kkk.']
const EYE3 = ['.kkk.', 'kwkdk', '.kkk.']
const SHUT = ['kkkkk']
const HAPPY = ['.kkk.', 'k...k']
const XEYE = ['k...k', '.k.k.', '..k..', '.k.k.', 'k...k']
const GT = ['kk...', '.kkk.', '...kk', '.kkk.', 'kk...']
const LT = ['...kk', '.kkk.', 'kk...', '.kkk.', '...kk']

const MOUTH: Record<Exclude<Mouth, 'none'>, string[]> = {
  smile: ['k...k', '.kkk.'],
  cat: ['k.k', '.k.'],
  o: ['.kk.', 'k..k', '.kk.'],
  flat: ['kkk'],
  wavy: ['.k.k.', 'k.k.k'],
  grit: ['kkkkk', 'kwkwk', 'kkkkk'],
  open: ['kkkkk', 'kpppk', '.kkk.'],
  frown: ['.kkk.', 'k...k']
}

function stampFace(r: Raster, rows: string[], x: number, y: number, key: Record<string, number>) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = key[row[i]]
      if (c !== undefined && row[i] !== '.') r.set(x + i, y + j, c)
    }
  })
}

/** Draws eyes, mouth and blush onto the body (down and side views only). */
export function drawFace(r: Raster, a: Anchors, face: Face, ramp: Ramp) {
  if (a.dir === 'up') return
  const key = { k: C.black, w: C.white, d: ramp[3], p: R.ratPink[2] }
  const side = a.dir === 'side'
  const eh = a.h >= 22 ? 7 : a.h >= 15 ? 5 : 3
  const look = face.look ?? 0
  const base = side ? a.hx + 4 : a.hx
  // Left x of each eye.
  const gap = side ? 3 : 7
  const exs = side
    ? [base - 1, base - 1 + 5 + gap - 2]
    : [Math.round(base - 4 - gap / 2 - 1 + look), Math.round(base + gap / 2 + 0 + look)]
  if (side) {
    exs[0] += look
    exs[1] += look
  }
  const ey = Math.round(a.eyeY + (a.h >= 22 ? 0 : -1))
  const bottom = ey + eh - 1
  const draw = (x: number, i: number) => {
    const e = face.eyes
    if (e === 'open' || e === 'wide' || e === 'look' || e === 'angry') {
      const rows = eh === 7 ? EYE7 : eh === 5 ? EYE5 : EYE3
      stampFace(r, rows, x, ey, key)
      if (e === 'angry')
        for (let k = 0; k < 5; k++) r.set(x + k, ey - 3 + Math.floor((i === 0 ? k : 4 - k) * 0.6), key.k)
    } else if (e === 'half') stampFace(r, ['kkkkk', 'kdddk'], x, bottom - 3, key)
    else if (e === 'shut') stampFace(r, SHUT, x, bottom - 1, key)
    else if (e === 'happy') stampFace(r, HAPPY, x, bottom - 4, key)
    else if (e === 'x') stampFace(r, XEYE, x, bottom - 5 + (eh === 7 ? 1 : 1), key)
    else if (e === 'squint') stampFace(r, i === 0 ? GT : LT, x, bottom - 5, key)
  }
  draw(exs[0], 0)
  draw(exs[1], 1)
  if (face.blush !== false && a.h >= 18) {
    const by = bottom + 1
    if (side) r.paint(exs[1] + 5, by, C.blush)
    r.paint(exs[0] - 2, by, C.blush)
    r.paint(exs[0] - 1, by, C.blush)
    if (!side) {
      r.paint(exs[1] + 5, by, C.blush)
      r.paint(exs[1] + 6, by, C.blush)
    } else r.paint(exs[1] + 6, by, C.blush)
  }
  if (face.mouth !== 'none') {
    const rows = MOUTH[face.mouth]
    const mw = rows[0].length
    const mx = side ? Math.round((exs[0] + exs[1] + 5) / 2 - mw / 2 + 1) : Math.round(a.hx - mw / 2 + look * 0.5)
    const my = bottom + (eh === 3 ? 2 : 3) - (face.mouth === 'o' ? 0 : 0)
    stampFace(r, rows, mx, my, key)
  }
}

/* ------------------------------------------------------------------ limbs */

/** A pseudopod from (x0, y0) to (x1, y1) in body colour, with a rounded hand; outlined unless `line` is false. */
export function arm(r: Raster, x0: number, y0: number, x1: number, y1: number, ramp: Ramp, width = 3) {
  return part(r, (l) => {
    l.thick(x0, y0, x1, y1, width, ramp[1])
    l.ellipse(x1, y1, width / 2 + 0.4, width / 2 + 0.4, ramp[1])
    // Shade the lower right and light the upper left, like the body.
    const bb = boxOf(l)
    if (!bb) return
    const src = l.clone()
    for (let y = bb.y; y < bb.y + bb.h; y++)
      for (let x = bb.x; x < bb.x + bb.w; x++) {
        if (!src.get(x, y)) continue
        if (!src.get(x + 1, y) || !src.get(x, y + 1)) l.set(x, y, ramp[2])
        else if (!src.get(x - 1, y - 1) && !src.get(x, y - 1)) l.set(x, y, ramp[0])
      }
  })
}

/* ------------------------------------------------------------------ small glyphs */

/** A little four point sparkle (size 1 = plus, 2 = bigger). */
export function sparkle(r: Raster, x: number, y: number, ramp: Ramp, size = 1) {
  r.set(x, y, C.white)
  r.set(x - 1, y, ramp[0])
  r.set(x + 1, y, ramp[0])
  r.set(x, y - 1, ramp[0])
  r.set(x, y + 1, ramp[0])
  if (size > 1) {
    r.set(x, y - 2, ramp[1])
    r.set(x, y + 2, ramp[1])
    r.set(x - 2, y, ramp[1])
    r.set(x + 2, y, ramp[1])
  }
}

/** A single dot glint. */
export function glint(r: Raster, x: number, y: number, ramp: Ramp) {
  r.set(x, y, ramp[0])
}

/** A sweat drop (3×4) with its top at (x, y). */
export function sweat(r: Raster, x: number, y: number) {
  const key = { h: R.water[0], b: R.water[1], s: R.water[2], k: R.water[3] }
  const rows = ['.h.', 'hbb', 'bbs', '.s.']
  stampFace(r, rows, x - 1, y, key)
}
