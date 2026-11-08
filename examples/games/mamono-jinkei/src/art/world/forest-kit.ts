/** Shared helpers for the stage 4 props: contract frames, contact shadows, rune glyphs, flames, snow caps. */
import { PROPS_SPEC } from '../contract'
import { C, R } from '../palette'
import { Raster, bayer, outline } from '../raster'
import { anim, type Anim } from '../sheet'

export const NG = R.nightGround
export const NL = R.nightLeaf
export const SN = R.snow
export const IC = R.ice
export const ST = R.steel
export const WD = R.wood
export const FIRE = R.fire
export const IRON = R.clothBlack
export const ROPE = R.hay

export const SPEC = PROPS_SPEC.forest
export const frame = (name: string) => new Raster(SPEC[name].w, SPEC[name].h)

export function mk(name: string, frames: Raster[], extra: Partial<Anim> = {}): Anim {
  const s = SPEC[name]
  if (frames.length !== s.frames) throw new Error(`${name}: ${frames.length} frames, expected ${s.frames}`)
  return anim(frames, s.fps, s.loop, { ...(s.anchor ? { anchor: s.anchor } : {}), ...extra })
}

/** Soft ground shadow: a core with a dithered rim, in cold night tones. */
export function shade(r: Raster, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const q = nx * nx + ny * ny
      if (q > 1) continue
      if (q < 0.55) r.set(x, y, NG[3])
      else if (bayer(x, y) < 0.5) r.set(x, y, NG[2])
    }
}

/** A lumpy snow drift: lit crest, shaded lower right. */
export function drift(r: Raster, cx: number, cy: number, rx: number, ry: number) {
  r.ellipse(cx + 0.6, cy + 0.8, rx, ry, SN[3])
  r.ellipse(cx, cy, rx, ry, SN[2])
  r.ellipse(cx - rx * 0.1, cy - ry * 0.18, rx * 0.86, ry * 0.8, SN[1])
  r.ellipse(cx - rx * 0.32, cy - ry * 0.42, rx * 0.45, ry * 0.4, SN[0])
}

/** Rune glyphs, 7 wide and 10 tall, drawn at the top-left (x, y). */
export function glyph(r: Raster, x: number, y: number, kind: number, c: number) {
  const L = (x0: number, y0: number, x1: number, y1: number) => r.line(x + x0, y + y0, x + x1, y + y1, c)
  switch (kind % 6) {
    case 0:
      L(1, 0, 1, 9)
      L(1, 2, 5, 0)
      L(1, 5, 5, 3)
      break
    case 1:
      L(3, 0, 3, 9)
      L(0, 0, 3, 4)
      L(6, 0, 3, 4)
      break
    case 2:
      L(3, 0, 6, 4)
      L(6, 4, 3, 9)
      L(3, 9, 0, 4)
      L(0, 4, 3, 0)
      break
    case 3:
      L(1, 0, 1, 9)
      L(1, 2, 5, 4)
      L(5, 4, 1, 6)
      break
    case 4:
      L(5, 0, 1, 3)
      L(1, 3, 5, 6)
      L(5, 6, 1, 9)
      break
    default:
      L(1, 0, 1, 9)
      L(1, 0, 5, 2)
      L(5, 2, 1, 5)
      L(1, 5, 5, 9)
  }
}

/** Glowing glyph: a 1 px halo in `halo`, the strokes in `c`. */
export function glowGlyph(r: Raster, x: number, y: number, kind: number, c: number, halo: number) {
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ] as const)
    glyph(r, x + dx, y + dy, kind, halo)
  glyph(r, x, y, kind, c)
}

/** A teardrop flame rooted at (cx, base). */
export function flame(r: Raster, cx: number, base: number, h: number, w: number, lean: number) {
  const fl = new Raster(r.w, r.h)
  for (let y = 0; y <= h; y++) {
    const u = y / h
    const half = w * Math.sin(Math.pow(1 - u, 0.65) * Math.PI * 0.5) * (1 - Math.pow(u, 3) * 0.25)
    const mid = cx + lean * u * u * 3
    for (let x = Math.floor(mid - half); x <= Math.ceil(mid + half); x++) {
      const d = Math.abs(x + 0.5 - mid) / Math.max(0.5, half)
      const c = u > 0.82 ? FIRE[3] : d > 0.78 || u > 0.62 ? FIRE[2] : d > 0.46 || u > 0.34 ? FIRE[1] : FIRE[0]
      fl.set(x, base - y, c)
    }
  }
  fl.ellipse(cx - 1, base - h * 0.14, w * 0.3, h * 0.14, C.white)
  outline(fl)
  r.blit(fl)
}

/** Replaces the top surface pixels of whatever is painted with a thin snow cap (skips steep edges). */
export function snowCap(r: Raster, seedA = 3, thick = 2, chance = 0.7) {
  const src = r.clone()
  for (let y = 1; y < r.h; y++)
    for (let x = 1; x < r.w - 1; x++) {
      if (!src.get(x, y) || src.get(x, y - 1)) continue
      if (!src.get(x - 1, y) && !src.get(x + 1, y)) continue
      const h = Math.abs(Math.sin(x * 12.9898 + seedA * 78.233) * 43758.5453) % 1
      if (h > chance) continue
      for (let k = 0; k < thick; k++) if (src.get(x, y + k)) r.set(x, y + k, k === 0 ? SN[0] : SN[1])
      if (src.get(x, y + thick)) r.set(x, y + thick, SN[2])
    }
  return r
}
