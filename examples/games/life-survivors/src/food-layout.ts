/** Where dropped foods are drawn: stacked foods fan out in rows, yet stay within pickup reach of their real spot. */
export interface FoodPoint {
  x: number
  y: number
}

const JOIN = 22
const ROW = 3
const SPREAD_X = 15
const SPREAD_Y = 10
const MAX_SHIFT = 16

export interface FoodLayout {
  /** Drawn position of each food, in input order. */
  drawn: FoodPoint[]
  /** Cluster index of each food, in input order. */
  cluster: number[]
}

export function layoutFoodClusters(points: readonly FoodPoint[]): FoodLayout {
  const cluster: number[] = []
  const anchors: FoodPoint[] = []
  const members: number[][] = []
  for (let i = 0; i < points.length; i++) {
    let found = -1
    for (let c = 0; c < anchors.length; c++) {
      if (Math.hypot(anchors[c].x - points[i].x, anchors[c].y - points[i].y) <= JOIN) {
        found = c
        break
      }
    }
    if (found < 0) {
      found = anchors.length
      anchors.push(points[i])
      members.push([])
    }
    members[found].push(i)
    cluster.push(found)
  }
  const drawn: FoodPoint[] = new Array(points.length)
  for (const list of members) {
    const n = list.length
    if (n === 1) {
      drawn[list[0]] = { x: points[list[0]].x, y: points[list[0]].y }
      continue
    }
    let cx = 0
    let cy = 0
    for (const m of list) {
      cx += points[m].x
      cy += points[m].y
    }
    cx /= n
    cy /= n
    list.forEach((m, j) => {
      const r = Math.floor(j / ROW)
      const c = j % ROW
      const k = Math.min(ROW, n - r * ROW)
      let x = cx + (c - (k - 1) / 2) * SPREAD_X
      let y = cy - r * SPREAD_Y
      const dx = x - points[m].x
      const dy = y - points[m].y
      const d = Math.hypot(dx, dy)
      if (d > MAX_SHIFT) {
        x = points[m].x + (dx / d) * MAX_SHIFT
        y = points[m].y + (dy / d) * MAX_SHIFT
      }
      drawn[m] = { x, y }
    })
  }
  return { drawn, cluster }
}

export function layoutFoods(points: readonly FoodPoint[]): FoodPoint[] {
  return layoutFoodClusters(points).drawn
}
