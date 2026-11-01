// Pure helpers for building stage maps. Stage `map.ts` files import from here (never values from
// ../map.ts, which imports every stage map and would form an import cycle).

export type Point = { x: number; z: number }
export type Circle = Point & { r: number }
export type Rect = { minX: number; minZ: number; maxX: number; maxZ: number }

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)
export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Distance from a point to a segment, without allocating (hot path). */
export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const squared = dx * dx + dz * dz
  const t = squared > 0 ? clamp01(((px - ax) * dx + (pz - az) * dz) / squared) : 0
  const ex = px - ax - dx * t
  const ez = pz - az - dz * t
  return Math.sqrt(ex * ex + ez * ez)
}

/** Seeded uniform random in [0, 1). */
export function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const inRect = (x: number, z: number, rect: Rect, pad = 0) =>
  x > rect.minX - pad && x < rect.maxX + pad && z > rect.minZ - pad && z < rect.maxZ + pad

/**
 * A height grid for a stage: vertices every `cell` metres over `world`. Bake floors, walls and furniture
 * tops with `raise`/`set`, then hand `heights` to the StageMap. `heightAt` interpolates exactly like
 * the engine (and the rendered mesh), so builders can place things on the final surface.
 */
export function grid(world: Rect, cell: number, base = 0) {
  const nx = Math.round((world.maxX - world.minX) / cell) + 1
  const nz = Math.round((world.maxZ - world.minZ) / cell) + 1
  const heights = new Float64Array(nx * nz).fill(base)
  const inverse = 1 / cell // the engine multiplies by this too, so both agree to the last bit
  const each = (rect: Rect, apply: (index: number) => void) => {
    const i0 = Math.max(0, Math.ceil((rect.minX - world.minX) / cell - 1e-9))
    const i1 = Math.min(nx - 1, Math.floor((rect.maxX - world.minX) / cell + 1e-9))
    const j0 = Math.max(0, Math.ceil((rect.minZ - world.minZ) / cell - 1e-9))
    const j1 = Math.min(nz - 1, Math.floor((rect.maxZ - world.minZ) / cell + 1e-9))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) apply(j * nx + i)
  }
  return {
    nx,
    nz,
    heights,
    /** Lifts every vertex inside the rect (edges included) to at least `height`: walls, tables, steps. */
    raise(rect: Rect, height: number) {
      each(rect, (index) => (heights[index] = Math.max(heights[index], height)))
    },
    /** Sets every vertex inside the rect to `height`: water channels, pits, flat floors. */
    set(rect: Rect, height: number) {
      each(rect, (index) => (heights[index] = height))
    },
    heightAt(x: number, z: number) {
      const gx = Math.min(Math.max((x - world.minX) * inverse, 0), nx - 1)
      const gz = Math.min(Math.max((z - world.minZ) * inverse, 0), nz - 1)
      const i = Math.min(Math.floor(gx), nx - 2)
      const j = Math.min(Math.floor(gz), nz - 2)
      const u = gx - i
      const v = gz - j
      const h00 = heights[j * nx + i]
      const h10 = heights[j * nx + i + 1]
      const h01 = heights[(j + 1) * nx + i]
      const h11 = heights[(j + 1) * nx + i + 1]
      return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01)
    }
  }
}

export const WATER_LEVEL = -0.35
export const TUNNEL_DEPTH = 2.2 // tunnel floor below the surface
export const RAISED_FOOD = 2.2
