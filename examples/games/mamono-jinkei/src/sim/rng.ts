/** Seeded deterministic RNG (mulberry32). The simulation never uses Math.random. */
export interface Rng {
  next(): number
  range(a: number, b: number): number
  chance(p: number): boolean
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, range: (a, b) => a + (b - a) * next(), chance: (p) => next() < p }
}
