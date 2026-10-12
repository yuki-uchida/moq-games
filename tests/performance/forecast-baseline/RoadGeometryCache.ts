import type { Point } from './model'

interface PathRevision {
  coordinates: number[]
}

const pathRevisions = new WeakMap<readonly Point[], PathRevision>()

function sameCoordinate(a: number, b: number): boolean {
  // Keep the common finite/nonzero comparison cheap while matching Object.is
  // for signed zero and NaN, which can also appear in degenerate test paths.
  return a === b ? a !== 0 || 1 / a === 1 / b : Number.isNaN(a) && Number.isNaN(b)
}

/** An exact content revision, including in-place point and array mutations. */
export function roadPathRevision(path: readonly Point[]): object {
  const previous = pathRevisions.get(path)
  if (previous && previous.coordinates.length === path.length * 2) {
    let unchanged = true
    for (let index = 0; index < path.length; index++) {
      if (
        !sameCoordinate(previous.coordinates[index * 2], path[index].x) ||
        !sameCoordinate(previous.coordinates[index * 2 + 1], path[index].y)
      ) {
        unchanged = false
        break
      }
    }
    if (unchanged) return previous
  }
  const revision = { coordinates: path.flatMap(({ x, y }) => [x, y]) }
  pathRevisions.set(path, revision)
  return revision
}

/** Number strings are round-trip exact; distinguish +0 and -0 as well. */
export function roadCoordinateKey(...coordinates: number[]): string {
  return coordinates.map((value) => (Object.is(value, -0) ? '-0' : String(value))).join(':')
}

/**
 * Memoize exact queries against mutable road paths. The weak revision keys do
 * not retain paths or obsolete geometry, and each live revision has a fixed
 * FIFO entry limit. Cached values must be treated as immutable by callers.
 */
export class RoadGeometryCache<T> {
  private readonly queries = new WeakMap<object, Map<string, T>>()

  constructor(private readonly maxEntries = 256) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError('Invalid road geometry cache limit')
  }

  get(path: readonly Point[], key: string, compute: () => T): T {
    const revision = roadPathRevision(path)
    let entries = this.queries.get(revision)
    if (!entries) {
      entries = new Map<string, T>()
      this.queries.set(revision, entries)
    }
    const cached = entries.get(key)
    if (cached !== undefined || entries.has(key)) return cached!
    const value = compute()
    if (entries.size >= this.maxEntries) entries.delete(entries.keys().next().value!)
    entries.set(key, value)
    return value
  }
}
