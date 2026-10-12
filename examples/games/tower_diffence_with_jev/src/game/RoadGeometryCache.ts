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
export function roadPathRevision(path: readonly Point[], snapshot?: RoadGeometrySnapshot): object {
  const captured = snapshot?.revisionFor(path)
  if (captured) return captured
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

  get(path: readonly Point[], key: string, compute: () => T, snapshot?: RoadGeometrySnapshot): T {
    const revision = roadPathRevision(path, snapshot)
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

/**
 * Call-local road identity capture. Only use while the captured roads remain
 * unchanged during one synchronous forecast. Never store in game state, save,
 * interception caches, or across await/callback boundaries. Each new forecast
 * captures fresh content revisions, including equal-length in-place edits.
 * There is no ambient/global scope, so exceptions and nested forecasts cannot
 * leak an active snapshot. Uncaptured paths retain normal mutation validation.
 */
export class RoadGeometrySnapshot {
  private readonly revisions: ReadonlyMap<readonly Point[], object>

  constructor(paths: readonly (readonly Point[])[]) {
    this.revisions = new Map(paths.map((path) => [path, roadPathRevision(path)]))
  }

  revisionFor(path: readonly Point[]): object | undefined {
    return this.revisions.get(path)
  }
}

interface SegmentMetrics {
  readonly lengths: readonly number[]
  readonly total: number
}
const segmentMetrics = new WeakMap<object, SegmentMetrics>()

/** Keep the original hypot, addition, and interpolation subtraction order. */
export function exactSegmentMetrics(path: readonly Point[], snapshot?: RoadGeometrySnapshot): SegmentMetrics {
  const revision = roadPathRevision(path, snapshot)
  let metrics = segmentMetrics.get(revision)
  if (!metrics) {
    const lengths: number[] = []
    let total = 0
    for (let index = 1; index < path.length; index++) {
      const length = Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y)
      lengths.push(length)
      total += length
    }
    metrics = { lengths, total }
    segmentMetrics.set(revision, metrics)
  }
  return metrics
}
