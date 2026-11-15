/**
 * The free shoulder (DESIGN §9): the aim pivot sits `shoulderOffset` to the side of the body axis at eye height, but
 * never inside a map box, a ヤドカリ wall or a solid 灯台 / 巣核 — the offset is pulled in toward the body axis (the
 * axis itself is always free: bodies are pushed out of every solid) until the pivot keeps SHOULDER_PAD clear of
 * them. The sim (pivotOf: aim and muzzles) and the shoulder camera (src/render/camera.ts) run the same rule on the
 * same geometry: the fraction shrinks at once when cover closes in and grows back at SHOULDER_REGROW per second, so
 * it never jitters and the crosshair stays on the sim's aim ray.
 */

import { eyeHeight, shoulderOffset, type SpeciesDef } from '../data/species'
import type { Physics } from './physics'
import { rightOf, type Vec } from './vec'

/** Clearance the pivot keeps from any obstacle (m), larger than the camera's near plane. */
export const SHOULDER_PAD = 0.15
/** Fraction of the full offset regained per second once there is room again. */
export const SHOULDER_REGROW = 3

/**
 * Free fraction (0..1) of a shoulder offset of length `len` from the body axis, given the distance `hit` along the
 * offset to the first obstacle grown by SHOULDER_PAD (Infinity / ≥ len when clear).
 */
export const freeShoulder = (len: number, hit: number) => (len < 1e-6 ? 1 : Math.max(0, Math.min(1, hit / len)))

/**
 * The free fraction for a body with feet at `feet`, facing `yaw`, on `shoulder`: the offset from the body axis at eye
 * height cast against the physics (map boxes, every ヤドカリ wall, the solid props) grown by SHOULDER_PAD.
 */
export function shoulderFree(
  phys: Physics,
  feet: readonly number[],
  yaw: number,
  def: SpeciesDef,
  shoulder: 1 | -1
): number {
  const r = rightOf(yaw)
  const len = shoulderOffset(def)
  const off = len * shoulder
  const axis: Vec = [feet[0], feet[1] + eyeHeight(def), feet[2]]
  const hit = phys.raycast(axis, [r[0] * off, 0, r[2] * off], 1, SHOULDER_PAD, -1)
  return freeShoulder(len, hit ? hit.t * len : Infinity)
}

/** The aim pivot for that body with a shoulder fraction `k`. */
export function pivotAt(feet: readonly number[], yaw: number, def: SpeciesDef, shoulder: 1 | -1, k: number): Vec {
  const r = rightOf(yaw)
  const off = shoulderOffset(def) * shoulder * k
  return [feet[0] + r[0] * off, feet[1] + eyeHeight(def), feet[2] + r[2] * off]
}

/** Eases the current fraction `k` toward `free`: down at once (never inside cover), up at SHOULDER_REGROW/s. */
export const easeShoulder = (k: number, free: number, dt: number) =>
  free <= k ? free : Math.min(free, k + dt * SHOULDER_REGROW)
