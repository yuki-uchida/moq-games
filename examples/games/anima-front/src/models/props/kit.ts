/**
 * Shared pieces of the prop recipes: the recipe types, mask channels, palette and small sculpt helpers (bead
 * eyes, the ARK paw emblem, stitched sandbags) plus the time helpers every deployable uses (pop-in, end blink).
 *
 * Conventions: metres, feet at the origin, +Z is the prop's front (yaw 0 faces +Z), +Y up.
 */
import type * as THREE from 'three'
import type { AnimaUniforms } from '../materials'
import type { FoeLook, FoeUniforms } from '../foes/material'
import { ellipsoid, type Mask, type Sculpt, sphere, type Vec3 } from '../sdf/sculpt'

/** Toon mask channels: anima glow (uGlowColor), cracks (darkened by uArmorTint), animated glow (uGlow2Color). */
export const GLOW: Mask = [0, 1, 0, 0]
export const GLOW2: Mask = [0, 0, 0, 1]
/** Mask-only paint: invisible until damage darkens uArmorTint and lights uGlow2 (anima leaking out). */
export const CRACK: Mask = [0, 0, 1, 1]

export const INK = 0x2a2230
export const WHITE = 0xfff8ef
export const ANIMA = 0xff9a3c
export const ARK_RED = 0xe0574a
export const ARK_CREAM = 0xfff1d6

/**
 * Part materials: `toon` (kit toon + ink outline mesh), `glow` (toon without outline or shadow: lamps, rings),
 * `holo` (hologram scanlines, translucent), `foe` (invader material with the single-draw hull outline).
 */
export type PartMat = 'toon' | 'glow' | 'holo' | 'foe'

export interface PropPart {
  name: string
  sculpt: Sculpt
  /** Grid cell at medium (m). */
  cell: number
  /** Triangle budget at medium. */
  tris: number
  /** The part's group sits at the pivot; the geometry stays in prop space. */
  pivot?: Vec3
  mat?: PartMat
  /** Uniform set: 0 = main, 1 = second (an independently glowing lamp). */
  set?: 0 | 1
  /** Instances of this geometry (named `name`, `name1`, `name2`…); default 1. */
  copies?: number
  aoReach?: number
  aoMin?: number
}

export interface PropLook {
  glowColor: number
  glow: number
  glow2Color: number
  glow2?: number
  /** Second uniform set (lamps). */
  lampColor?: number
  lamp?: number
  rim?: number
  /** Outline width (m) at close range. */
  outline: number
  foe?: FoeLook
}

export interface PropCtx {
  /** Pivot groups by part name (copies: name, name1, name2…). */
  parts: Record<string, THREE.Group>
  /** Holder of every part (scaled for pop-in / expiry). */
  body: THREE.Group
  /** Render-side extras made by the recipe (glow cards, beams). */
  extra: Record<string, THREE.Object3D>
  u: AnimaUniforms
  u2: AnimaUniforms
  fu: FoeUniforms | null
  dt: number
  /** Seconds since the prop appeared. */
  t: number
  state: number
  life: number | undefined
  /** 0..1 health (1 unless the renderer calls setHealth). */
  health: number
  /** Own clock (seconds since the model was created; never jumps back). */
  clock: number
  /** Per-instance scratch values kept between updates (previous state, smoothed speed…). */
  mem: Record<string, number>
}

export interface PropExtra {
  name: string
  make(): { object: THREE.Object3D; dispose(): void }
}

export interface PropRecipe {
  parts: PropPart[]
  look: PropLook
  extras?: PropExtra[]
  animate(c: PropCtx): void
}

// ------------------------------------------------------------------------------------------------- helpers

/** Glossy bead eyes with a highlight at ±spread around `c`, looking along +Z. */
export function beadEyes(s: Sculpt, c: Vec3, spread: number, r: number, color = INK): void {
  for (const side of [1, -1]) {
    const p: Vec3 = [c[0] + spread * side, c[1], c[2]]
    s.add(sphere(p, r), { color, k: r * 0.25 })
    s.paint(sphere([p[0] - r * 0.28, p[1] + r * 0.38, p[2] + r * 0.82], r * 0.32), { color: WHITE })
    s.paint(sphere([p[0] + r * 0.3, p[1] - r * 0.3, p[2] + r * 0.88], r * 0.15), { color: WHITE })
  }
}

/**
 * The ARK paw emblem painted on a surface facing `axis` (+Z or ±X) around `c`: a main pad and four toe beans.
 * `size` is the overall height (m); `depth` how far the paint reaches into the surface along the axis.
 */
export function pawEmblem(
  s: Sculpt,
  c: Vec3,
  size: number,
  color: number,
  mask?: Mask,
  depth = size * 0.4,
  axis: 'x' | 'z' = 'z'
): void {
  const k = size / 1
  const at = (u: number, v: number): Vec3 => (axis === 'z' ? [c[0] + u, c[1] + v, c[2]] : [c[0], c[1] + v, c[2] + u])
  const rad = (u: number, v: number): Vec3 => (axis === 'z' ? [u, v, depth] : [depth, v, u])
  const main = ellipsoid(at(0, -0.16 * k), rad(0.3 * k, 0.24 * k))
  const toes: [number, number][] = [
    [-0.33, 0.12],
    [-0.12, 0.3],
    [0.12, 0.3],
    [0.33, 0.12]
  ]
  const beans = toes.map(([x, y]) => ellipsoid(at(x * k, y * k), rad(0.11 * k, 0.13 * k)))
  s.paint(main, { color, mask, union: beans.slice(0, 3) })
  s.paint(beans[3], { color, mask })
}

/** 0 → 1 with a springy overshoot over `dur` seconds (deployables popping in). */
export function popIn(t: number, dur = 0.45): number {
  if (t >= dur) return 1
  const x = Math.max(0, t / dur)
  return 1 - Math.cos(x * Math.PI * 2.4) * Math.exp(-x * 5.5) * (1 - x)
}

/** End of life: blink amount 0..1 (faster near the end) and a 1 → 0 shrink over the last `out` seconds. */
export function expiry(life: number | undefined, t: number, warn = 3, out = 0.35): { blink: number; scale: number } {
  if (life === undefined || life > warn) return { blink: 0, scale: 1 }
  const urgency = 1 - life / warn
  const freq = 2.2 + urgency * 7
  const blink = Math.sin(t * freq * Math.PI * 2) > 0.2 ? 0.25 + urgency * 0.35 : 0
  const x = Math.min(1, Math.max(0, life / out))
  const scale = life < out ? x * x * (3 - 2 * x) : 1
  return { blink, scale }
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
