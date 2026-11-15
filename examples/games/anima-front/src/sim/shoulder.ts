/**
 * The free shoulder (DESIGN §9): the aim pivot sits `shoulderOffset` to the side of the body axis at eye height, but
 * never inside a map box, a ヤドカリ wall or a solid 灯台 / 巣核 — the offset is pulled in toward the body axis (the
 * axis itself is always free: bodies are pushed out of every solid) until the pivot keeps SHOULDER_PAD clear of
 * them. The sim (pivotOf: aim and muzzles) and the shoulder camera (src/render/camera.ts) run the same rule on the
 * same geometry: the fraction shrinks at once when cover closes in and grows back at SHOULDER_REGROW per second, so
 * it never jitters and the crosshair stays on the sim's aim ray.
 */

/** Clearance the pivot keeps from any obstacle (m), larger than the camera's near plane. */
export const SHOULDER_PAD = 0.15
/** Fraction of the full offset regained per second once there is room again. */
export const SHOULDER_REGROW = 3

/**
 * Free fraction (0..1) of a shoulder offset of length `len` from the body axis, given the distance `hit` along the
 * offset to the first obstacle grown by SHOULDER_PAD (Infinity / ≥ len when clear).
 */
export const freeShoulder = (len: number, hit: number) => (len < 1e-6 ? 1 : Math.max(0, Math.min(1, hit / len)))

/** Eases the current fraction `k` toward `free`: down at once (never inside cover), up at SHOULDER_REGROW/s. */
export const easeShoulder = (k: number, free: number, dt: number) =>
  free <= k ? free : Math.min(free, k + dt * SHOULDER_REGROW)
