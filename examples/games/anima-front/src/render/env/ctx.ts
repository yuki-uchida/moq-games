/**
 * Shared planning context for the environment builders (boxes.ts, decor.ts). Pure.
 */
import type { V3 } from '../../sim/types'
import type { GeoBuilder } from './geo'
import type { ThemeDef } from './themes'

/** Environment materials: one merged batch per material per chunk. */
export const ENV_MATERIALS = ['atlas', 'foliage', 'cutout', 'glow', 'water', 'pool'] as const
export type EnvMat = (typeof ENV_MATERIALS)[number]

/** Materials whose batches cast shadows. */
export const SHADOW_CASTERS: ReadonlySet<EnvMat> = new Set<EnvMat>(['atlas', 'foliage'])

export type EmitterKind = 'petals' | 'spores' | 'embers' | 'steam'

export interface Emitter {
  kind: EmitterKind
  p: V3
  /** Spread radius (m). */
  r: number
  rate: number
}

export interface EnvCtx {
  theme: ThemeDef
  /** Deterministic 0..1. */
  rand(): number
  /** Builder of the chunk containing world (x, z) for a material; its matrix is identity. */
  at(mat: EnvMat, x: number, z: number): GeoBuilder
  /** Decor density multiplier (quality). */
  density: number
  /** Night-only emissive strength (windows, lamps). */
  night: number
  /** Always-on accent strength (crystals, virtual seams). */
  accent: number
  /** Plants and moss (everything but the virtual arena). */
  overgrowth: boolean
  emit(e: Emitter): void
  /** True when another box covers (x, z) above height y (no grass through plazas, roads or buildings). */
  covered(x: number, z: number, y: number): boolean
}

/** Stable hash of a box/decor position for variation (0..1). */
export function hash01(x: number, y: number, z: number, k = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453123
  return s - Math.floor(s)
}

/** sRGB hex helpers. */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255
  const br = (b >> 16) & 255
  const bg = (b >> 8) & 255
  const bb = b & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | bl
}

/** Multiplies an sRGB hex colour's brightness (clamped). */
export function shade(c: number, k: number): number {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255)
}
