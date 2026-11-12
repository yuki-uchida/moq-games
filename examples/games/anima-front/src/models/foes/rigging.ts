/**
 * Allocation-free helpers for posing rigid foe parts. Part geometry is baked in foe space at its rest place;
 * a part turns about its pivot with `pivotMatrix` and follows a parent with `chain`.
 */
import * as THREE from 'three'
import type { FoeAnim } from '../api'

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _m = new THREE.Matrix4()

export const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b)
export const clamp01 = (x: number) => clamp(x, 0, 1)
export const smooth = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
/** 0 → 1 → 0 bump over [a, b]. */
export const bump = (x: number, a: number, b: number) =>
  x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI)
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const TAU = Math.PI * 2

/**
 * out = T(pivot + t) · R(rx, ry, rz, 'YXZ') · S(s) · T(−pivot): turns a part about its own pivot and moves it.
 * Euler order YXZ: yaw first, then pitch, then roll (natural for heads and bodies).
 */
export function pivotMatrix(
  out: THREE.Matrix4,
  px: number,
  py: number,
  pz: number,
  tx: number,
  ty: number,
  tz: number,
  rx: number,
  ry: number,
  rz: number,
  sx = 1,
  sy = 1,
  sz = 1
): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'))
  out.compose(_p.set(px + tx, py + ty, pz + tz), _q, _s.set(sx, sy, sz))
  // Append T(−pivot): only the translation column changes.
  const e = out.elements
  e[12] -= e[0] * px + e[4] * py + e[8] * pz
  e[13] -= e[1] * px + e[5] * py + e[9] * pz
  e[14] -= e[2] * px + e[6] * py + e[10] * pz
  return out
}

/** out = parent · out (a child part follows its parent). */
export function chain(out: THREE.Matrix4, parent: THREE.Matrix4): THREE.Matrix4 {
  _m.copy(out)
  return out.multiplyMatrices(parent, _m)
}

/** Deterministic hash of a seed and a salt → 0..1. */
export function hash(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Per-foe size jitter (±4 %). */
export const sizeJitter = (a: FoeAnim) => 1 + (hash(a.seed, 3) - 0.5) * 0.08

/** Progress 0..1 of the current wind-up (needs the attack's wind-up time). */
export const windupT = (a: FoeAnim, windup: number) => clamp01(a.st / Math.max(windup, 1e-3))
