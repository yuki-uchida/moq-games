import type { Point } from './model'

// Centerline traced from the user-approved 1478x1064 image, scaled to
// 1280x920. Source SHA256 and exact original bytes are preserved with the art.
export const APPROVED_MAZE_SOURCE_SIZE = { width: 1478, height: 1064 } as const
export const APPROVED_MAZE_CORNERS: readonly (readonly [number, number])[] = [
  [104, 68],
  [148, 128],
  [530, 128],
  [530, 276],
  [210, 276],
  [210, 634],
  [421, 634],
  [421, 501],
  [675, 501],
  [675, 786],
  [725, 786],
  [792, 739],
  [802, 653],
  [866, 633],
  [866, 521],
  [792, 511],
  [792, 432],
  [866, 422],
  [866, 342],
  [768, 339],
  [768, 128],
  [863, 128],
  [863, 181],
  [1248, 181],
  [1248, 454],
  [1344, 454],
  [1344, 549],
  [945, 549],
  [945, 697],
  [1201, 697],
  [1201, 879],
  [1127, 879],
  [1127, 965],
  [1315, 965],
  [1360, 940]
]

/** Rounded corners follow the painted road without introducing graph junctions. */
export function approvedMazeSourcePath(): Point[] {
  const corners = APPROVED_MAZE_CORNERS.map(([x, y]) => ({ x, y }))
  const path: Point[] = [corners[0]]
  for (let i = 1; i < corners.length - 1; i++) {
    const a = corners[i - 1],
      b = corners[i],
      c = corners[i + 1]
    const incoming = Math.hypot(b.x - a.x, b.y - a.y)
    const outgoing = Math.hypot(c.x - b.x, c.y - b.y)
    const radius = Math.min(23, incoming / 3, outgoing / 3)
    const start = { x: b.x + ((a.x - b.x) * radius) / incoming, y: b.y + ((a.y - b.y) * radius) / incoming }
    const end = { x: b.x + ((c.x - b.x) * radius) / outgoing, y: b.y + ((c.y - b.y) * radius) / outgoing }
    path.push(start)
    for (let step = 1; step <= 8; step++) {
      const t = step / 8,
        u = 1 - t
      path.push({
        x: u * u * start.x + 2 * u * t * b.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * b.y + t * t * end.y
      })
    }
  }
  path.push(corners[corners.length - 1])
  return path
}

export function approvedMazePath(): Point[] {
  return approvedMazeSourcePath().map(({ x, y }) => ({
    x: (x * 1280) / APPROVED_MAZE_SOURCE_SIZE.width,
    y: (y * 920) / APPROVED_MAZE_SOURCE_SIZE.height
  }))
}
