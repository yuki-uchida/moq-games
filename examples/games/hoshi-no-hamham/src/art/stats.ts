/**
 * Counts the art that is painted in this thread. The page and the art worker each have their own copy of this
 * module, so the page's counters say how much drawing the main thread did: the performance checks read them
 * through `window.__hamham.stats` and expect them to stand still while a stage is played.
 */
export const artStats = {
  /** Animation clips drawn (hit-flash silhouettes included). */
  clips: 0,
  /** Terrain tiles painted. */
  tiles: 0,
  /** Backdrops (sky and parallax layers) built. */
  backdrops: 0,
  /** Terrain decorations drawn. */
  decor: 0,
  /** Milliseconds spent painting, nested paints counted once. */
  ms: 0,
  /** True once a worker has delivered art to this thread. */
  remote: false
}

export type ArtKind = 'clips' | 'tiles' | 'backdrops' | 'decor'

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
let depth = 0

/** Runs a painter and counts it. A painter that calls other painters is timed once, from the outside. */
export function counted<T>(kind: ArtKind, paint: () => T): T {
  const start = depth === 0 ? now() : 0
  depth += 1
  try {
    return paint()
  } finally {
    depth -= 1
    artStats[kind] += 1
    if (depth === 0) artStats.ms += now() - start
  }
}
