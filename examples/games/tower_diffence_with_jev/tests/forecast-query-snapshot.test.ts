import { describe, expect, it, vi } from 'vitest'
import { RoadGeometrySnapshot, roadPathRevision } from '../src/game/RoadGeometryCache'
import { pathLength, pointOnPath, type Point } from '../src/game/model'

function originalLength(path: readonly Point[]) {
  return path
    .slice(1)
    .reduce((total, point, index) => total + Math.hypot(point.x - path[index].x, point.y - path[index].y), 0)
}
function originalPoint(path: readonly Point[], distance: number): Point {
  let remaining = Math.max(0, distance)
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1],
      b = path[index],
      length = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining <= length)
      return { x: a.x + ((b.x - a.x) * remaining) / length, y: a.y + ((b.y - a.y) * remaining) / length }
    remaining -= length
  }
  return { ...path[path.length - 1] }
}

describe('call-local exact forecast geometry', () => {
  it('preserves arithmetic on random, degenerate and mutated paths', () => {
    let seed = 72314
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
    const paths: Point[][] = [
      [],
      [{ x: 0, y: -0 }],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ],
      [
        { x: NaN, y: 1 },
        { x: 2, y: 3 }
      ],
      [
        { x: Infinity, y: 1 },
        { x: 2, y: 3 }
      ]
    ]
    for (let run = 0; run < 120; run++) {
      const path: Point[] = []
      for (let index = 0; index < 2 + (run % 300); index++)
        path.push(
          index && index % 13 === 0
            ? { ...path[index - 1] }
            : { x: (random() - 0.5) * 2000, y: (random() - 0.5) * 2000 }
        )
      paths.push(path)
    }
    for (const path of paths)
      for (let mutation = 0; mutation < 4; mutation++) {
        if (mutation === 1 && path.length) path[0].x += 0.125
        if (mutation === 2) path.push({ x: -0, y: 0 })
        if (mutation === 3 && path.length > 1) path[1] = { x: 33, y: 44 }
        const snapshot = new RoadGeometrySnapshot([path]),
          total = originalLength(path)
        expect(Object.is(pathLength(path), total)).toBe(true)
        expect(Object.is(pathLength(path, snapshot), total)).toBe(true)
        for (const distance of [
          -Infinity,
          -1,
          -0,
          0,
          Number.MIN_VALUE,
          0.1,
          total / 3,
          total,
          total + 1,
          Infinity,
          NaN,
          ...Array.from({ length: 20 }, () => total * random())
        ]) {
          expect(pointOnPath(path, distance)).toEqual(originalPoint(path, distance))
          expect(pointOnPath(path, distance, snapshot)).toEqual(originalPoint(path, distance))
        }
      }
  })

  it('does not install ambient state on exceptions or nested captures', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 3, y: 4 }
    ]
    const first = new RoadGeometrySnapshot([path]),
      firstRevision = roadPathRevision(path, first)
    expect(() => {
      path[1] = { x: 6, y: 8 }
      throw new Error('forecast failed')
    }).toThrow('forecast failed')
    const second = new RoadGeometrySnapshot([path])
    expect(roadPathRevision(path, second)).not.toBe(firstRevision)
    expect(pathLength(path)).toBe(10)
    expect(pathLength(path, second)).toBe(10)
    // Existing capture remains isolated; callers must discard it after the call.
    expect(roadPathRevision(path, first)).toBe(firstRevision)
    expect(roadPathRevision(path)).toBe(roadPathRevision(path, second))
  })

  it('validates uncaptured paths and recomputes segment metrics after equal-length edits', () => {
    const path = [
        { x: 0, y: 0 },
        { x: 3, y: 4 }
      ],
      other = [
        { x: 0, y: 0 },
        { x: 1, y: 0 }
      ]
    const snapshot = new RoadGeometrySnapshot([other])
    expect(pathLength(path, snapshot)).toBe(5)
    path[1].x = 6
    path[1].y = 8
    expect(pathLength(path, snapshot)).toBe(10)
    const hypot = vi.spyOn(Math, 'hypot')
    const captured = new RoadGeometrySnapshot([path])
    for (let count = 0; count < 20; count++) {
      pathLength(path, captured)
      pointOnPath(path, 2.5, captured)
    }
    expect(hypot).not.toHaveBeenCalled()
    hypot.mockRestore()
  })
})
