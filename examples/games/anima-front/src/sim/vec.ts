/** Small vector helpers on [x, y, z] tuples. */
export type Vec = [number, number, number]

export const vclone = (a: readonly number[]): Vec => [a[0], a[1], a[2]]
export const vadd = (a: readonly number[], b: readonly number[]): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vsub = (a: readonly number[], b: readonly number[]): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vscale = (a: readonly number[], s: number): Vec => [a[0] * s, a[1] * s, a[2] * s]
export const vmadd = (a: readonly number[], b: readonly number[], s: number): Vec => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s
]
export const vdot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vlen = (a: readonly number[]) => Math.hypot(a[0], a[1], a[2])
export const vdist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const vdist2 = (a: readonly number[], b: readonly number[]) => {
  const x = a[0] - b[0]
  const y = a[1] - b[1]
  const z = a[2] - b[2]
  return x * x + y * y + z * z
}
/** Horizontal (x/z) distance. */
export const hdist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[2] - b[2])
export const vnorm = (a: readonly number[]): Vec => {
  const l = Math.hypot(a[0], a[1], a[2])
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]
}
export const vlerp = (a: readonly number[], b: readonly number[], t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
]

/** DESIGN §2: yaw 0 faces +Z; forward = (sin yaw, 0, cos yaw); right = (−cos yaw, 0, sin yaw). */
export const forwardOf = (yaw: number): Vec => [Math.sin(yaw), 0, Math.cos(yaw)]
export const rightOf = (yaw: number): Vec => [-Math.cos(yaw), 0, Math.sin(yaw)]
export const aimDir = (yaw: number, pitch: number): Vec => [
  Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  Math.cos(yaw) * Math.cos(pitch)
]
/** Yaw that faces from a to b (x/z). */
export const yawTo = (a: readonly number[], b: readonly number[]) => Math.atan2(b[0] - a[0], b[2] - a[2])
export const pitchOf = (d: readonly number[]) => Math.atan2(d[1], Math.hypot(d[0], d[2]))
export const wrapAngle = (a: number) => {
  let r = a % (Math.PI * 2)
  if (r > Math.PI) r -= Math.PI * 2
  if (r < -Math.PI) r += Math.PI * 2
  return r
}
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
export const deg = (d: number) => (d * Math.PI) / 180
/** Rounds to 3 decimals for views (−0 → 0). */
export const r3 = (x: number) => {
  const r = Math.round(x * 1000) / 1000
  return r === 0 ? 0 : r
}
export const r2 = (x: number) => {
  const r = Math.round(x * 100) / 100
  return r === 0 ? 0 : r
}
export const r3v = (a: readonly number[]): [number, number, number] => [r3(a[0]), r3(a[1]), r3(a[2])]
export const r2v = (a: readonly number[]): [number, number, number] => [r2(a[0]), r2(a[1]), r2(a[2])]

/** Rotates direction `d` off its axis by (rx, ry) × spread radians (rx/ry are unit-ish random numbers). */
export function jitterDir(d: readonly number[], spreadRad: number, rx: number, ry: number): Vec {
  if (spreadRad <= 0) return [d[0], d[1], d[2]]
  const upX = Math.abs(d[1]) < 0.95 ? 0 : 1
  const upY = Math.abs(d[1]) < 0.95 ? 1 : 0
  // u = up × d, w = d × u
  let ux = upY * d[2]
  let uy = -upX * d[2]
  let uz = upX * d[1] - upY * d[0]
  const ul = Math.hypot(ux, uy, uz) || 1
  ux /= ul
  uy /= ul
  uz /= ul
  const wx = d[1] * uz - d[2] * uy
  const wy = d[2] * ux - d[0] * uz
  const wz = d[0] * uy - d[1] * ux
  const a = Math.tan(rx * spreadRad)
  const b = Math.tan(ry * spreadRad)
  return vnorm([d[0] + ux * a + wx * b, d[1] + uy * a + wy * b, d[2] + uz * a + wz * b])
}

/** Angle (radians, 0..π) between the x/z direction `yaw` and the x/z vector from a to b. */
export function angleFromYaw(yaw: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  if (dx * dx + dz * dz < 1e-9) return 0
  return Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw))
}
