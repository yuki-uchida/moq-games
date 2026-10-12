import { describe, expect, it, vi } from 'vitest'
import { approvedMazePath } from '../src/game/ApprovedMazeLayout'
import { physicalProjectionOnRoute, type ResolvedBattlefield } from '../src/game/BattlefieldRoutes'
import { RoadGeometryCache, roadCoordinateKey, roadPathRevision } from '../src/game/RoadGeometryCache'
import { getField, type Point } from '../src/game/model'

// Pre-optimization arithmetic, including strict first-segment tie selection and
// the same Math.hypot calls, accumulation order, and zero-length handling.
function baselineProjection(path: readonly Point[], point: Point) {
  let closest = { ...path[0], progress: 0, distance: Infinity },
    accumulated = 0
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1],
      end = path[index],
      dx = end.x - start.x,
      dy = end.y - start.y,
      length = Math.hypot(dx, dy)
    if (!length) continue
    const fraction = Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length))
      ),
      x = start.x + dx * fraction,
      y = start.y + dy * fraction,
      separation = Math.hypot(point.x - x, point.y - y)
    if (separation < closest.distance) {
      closest = { x, y, progress: accumulated + length * fraction, distance: separation }
    }
    accumulated += length
  }
  return closest
}

function fieldWithPath(path: Point[]): ResolvedBattlefield {
  return { routes: [{ id: 'left', path }] } as ResolvedBattlefield
}

function randomPoints(count: number): Point[] {
  let seed = 0x1a2b3c4d
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  return Array.from({ length: count }, () => ({ x: random() * 1600 - 160, y: random() * 1800 - 160 }))
}

describe('exact road geometry result cache', () => {
  it('matches the baseline bit-for-bit on every battlefield revision and the full rounded maze', () => {
    for (const fieldId of ['meadow', 'desert', 'frost', 'volcanic'] as const) {
      const fields = [
        getField(fieldId, 1, 1),
        ...([1, 2, 3, 4] as const).map((revision) => getField(fieldId, 2, revision))
      ]
      for (const source of fields) {
        for (const route of source.routes) {
          const path = route.path.map((point) => ({ ...point })),
            field = fieldWithPath(path),
            queries = [...path, ...randomPoints(80)]
          for (const point of queries) {
            const expected = baselineProjection(path, point)
            expect(physicalProjectionOnRoute(field, 'left', point)).toEqual(expected)
            // A new object at exactly the same coordinates must reuse the query.
            expect(physicalProjectionOnRoute(field, 'left', { ...point })).toEqual(expected)
          }
        }
      }
    }
  })

  it('preserves first-segment ties, nearly adjacent roads, signed zero, and degenerate segments', () => {
    const paths: Point[][] = [
      [],
      [{ x: -0, y: 0 }],
      [
        { x: -0, y: 0 },
        { x: -0, y: 0 },
        { x: -0, y: 0 }
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 2 },
        { x: 0, y: 2 },
        { x: 0, y: 2 },
        { x: 0, y: 2 + Number.EPSILON * 8 },
        { x: 100, y: 2 + Number.EPSILON * 8 }
      ],
      [
        { x: 3, y: 4 },
        { x: 3, y: 4 },
        { x: 6, y: 8 },
        { x: 6, y: 8 }
      ]
    ]
    const queries: Point[] = [
      { x: 50, y: 1 },
      { x: 50, y: 1 + Number.EPSILON },
      { x: 50, y: 1 - Number.EPSILON },
      { x: 50, y: 2 + Number.EPSILON * 4 },
      { x: 0, y: -0 },
      { x: -0, y: 0 },
      { x: Infinity, y: 0 },
      { x: NaN, y: 0 },
      { x: 6, y: 8 }
    ]
    for (const path of paths) {
      const field = fieldWithPath(path)
      for (const point of queries) {
        expect(physicalProjectionOnRoute(field, 'left', point)).toEqual(baselineProjection(path, point))
        expect(physicalProjectionOnRoute(field, 'left', point)).toEqual(baselineProjection(path, point))
      }
    }
    expect(physicalProjectionOnRoute(fieldWithPath(paths[3]), 'left', { x: 50, y: 1 }).progress).toBe(50)
  })

  it('invalidates exact results on coordinate, point, path-size, and route-path changes', () => {
    const path = approvedMazePath(),
      field = fieldWithPath(path),
      point = { x: 420, y: 350 }
    const check = () =>
      expect(physicalProjectionOnRoute(field, 'left', point)).toEqual(baselineProjection(field.routes[0].path, point))
    check()
    path[3].x += 0.000001
    check()
    path[4] = { x: -0, y: 125 }
    check()
    path.splice(5, 3, { x: 10, y: 20 }, { x: 10, y: 20 })
    check()
    path.push({ x: 50, y: 60 })
    check()
    path.reverse()
    check()
    point.x += Number.EPSILON * 512
    check()
    field.routes[0].path = [
      { x: 0, y: 0 },
      { x: 100, y: 100 }
    ]
    check()
  })

  it('does not let caller mutations poison the next projection', () => {
    const path = approvedMazePath(),
      field = fieldWithPath(path),
      point = { x: 500, y: 500 },
      expected = baselineProjection(path, point),
      projection = physicalProjectionOnRoute(field, 'left', point)
    projection.x = -100
    projection.progress = Infinity
    projection.distance = -1
    expect(physicalProjectionOnRoute(field, 'left', point)).toEqual(expected)
  })

  it('avoids repeating all segment hypot calls for unchanged forecast coordinates', () => {
    const path = approvedMazePath(),
      field = fieldWithPath(path),
      point = { x: 401.234, y: 456.789 },
      hypot = vi.spyOn(Math, 'hypot')
    try {
      const result = physicalProjectionOnRoute(field, 'left', point),
        firstCalls = hypot.mock.calls.length
      expect(firstCalls).toBe((path.length - 1) * 2)
      for (let subtick = 0; subtick < 100; subtick++) {
        expect(physicalProjectionOnRoute(field, 'left', { ...point })).toEqual(result)
      }
      expect(hypot.mock.calls.length).toBe(firstCalls)
      path[0].x += 1
      physicalProjectionOnRoute(field, 'left', point)
      expect(hypot.mock.calls.length).toBe(firstCalls * 2)
    } finally {
      hypot.mockRestore()
    }
  })

  it('matches Object.is revision identity for every finite and exceptional number pair', () => {
    const values = [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, 1, -1]
    for (const before of values) {
      for (const after of values) {
        const path = [{ x: before, y: before }],
          revision = roadPathRevision(path)
        expect(roadPathRevision(path)).toBe(revision)
        path[0].x = after
        path[0].y = after
        expect(roadPathRevision(path) === revision).toBe(Object.is(before, after))
      }
    }
  })

  it('bounds per-path entries and shares exact mutation revisions across query types', () => {
    const path = [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ],
      cache = new RoadGeometryCache<number | undefined>(2),
      compute = vi.fn(() => 1),
      revision = roadPathRevision(path)
    cache.get(path, 'first', compute)
    cache.get(path, 'second', compute)
    cache.get(path, 'first', compute)
    expect(compute).toHaveBeenCalledTimes(2)
    cache.get(path, 'third', compute)
    cache.get(path, 'first', compute)
    expect(compute).toHaveBeenCalledTimes(4) // The oldest insertion is evicted.
    expect(roadPathRevision(path)).toBe(revision)
    path[0] = { x: 0, y: 0 }
    expect(roadPathRevision(path)).toBe(revision)
    path[0].x = -0
    expect(roadPathRevision(path)).not.toBe(revision)
    cache.get(path, 'first', compute)
    expect(compute).toHaveBeenCalledTimes(5)
    const undefinedValue = vi.fn(() => undefined)
    cache.get(path, 'undefined', undefinedValue)
    cache.get(path, 'undefined', undefinedValue)
    expect(undefinedValue).toHaveBeenCalledTimes(1)
    expect(roadCoordinateKey(0, -0, NaN, Infinity, -Infinity)).toBe('0:-0:NaN:Infinity:-Infinity')
    expect(roadCoordinateKey(1, 2, 3)).not.toBe(roadCoordinateKey(1, 23))
  })
})
