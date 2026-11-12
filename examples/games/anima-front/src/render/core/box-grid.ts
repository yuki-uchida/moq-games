/**
 * A uniform grid over the map's solid boxes for render-side ray queries (camera spring arm, beam ends, sonar
 * occlusion). Pure (no three.js objects): rays are plain numbers so the hot path never allocates.
 */
import type { MapBox, MapDef } from '../../sim/types'

const CELL = 8

export class BoxGrid {
  readonly boxes: MapBox[]
  private readonly cells = new Map<number, number[]>()
  private readonly minX: number
  private readonly minZ: number
  private readonly cols: number
  private readonly rows: number
  /** Per-box query stamp so a box spanning several cells is tested once per ray. */
  private readonly stamp: Uint32Array
  private query = 0

  constructor(map: MapDef) {
    this.boxes = map.boxes.filter((b) => b.solid !== false && b.kind !== 'barrier')
    this.minX = map.bounds.min[0] - CELL
    this.minZ = map.bounds.min[1] - CELL
    this.cols = Math.max(1, Math.ceil((map.bounds.max[0] - this.minX + CELL) / CELL))
    this.rows = Math.max(1, Math.ceil((map.bounds.max[1] - this.minZ + CELL) / CELL))
    this.stamp = new Uint32Array(this.boxes.length)
    this.boxes.forEach((b, i) => {
      const [c0, r0] = this.cell(b.min[0], b.min[2])
      const [c1, r1] = this.cell(b.max[0], b.max[2])
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const key = r * this.cols + c
          let list = this.cells.get(key)
          if (!list) this.cells.set(key, (list = []))
          list.push(i)
        }
    })
  }

  private cell(x: number, z: number): [number, number] {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / CELL)))
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / CELL)))
    return [c, r]
  }

  /**
   * Distance along the ray (origin o, unit direction d) to the first solid box within `maxDist`, inflated by
   * `pad` metres on every side; returns `maxDist` when nothing is hit. Walks the grid cells along the ray (DDA).
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, pad = 0): number {
    if (!this.boxes.length) return maxDist
    this.query = (this.query + 1) >>> 0
    if (this.query === 0) {
      this.stamp.fill(0)
      this.query = 1
    }
    let best = maxDist
    let cx = Math.floor((ox - this.minX) / CELL)
    let cz = Math.floor((oz - this.minZ) / CELL)
    const stepX = dx > 0 ? 1 : -1
    const stepZ = dz > 0 ? 1 : -1
    const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity
    const tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity
    const nextX = this.minX + (cx + (dx > 0 ? 1 : 0)) * CELL
    const nextZ = this.minZ + (cz + (dz > 0 ? 1 : 0)) * CELL
    let tMaxX = dx !== 0 ? (nextX - ox) / dx : Infinity
    let tMaxZ = dz !== 0 ? (nextZ - oz) / dz : Infinity
    let t = 0
    // Padding can reach one neighbouring cell; test a 3×3 block around each visited cell.
    const reach = pad > 0 ? 1 : 0
    for (let guard = 0; guard < 256 && t <= best; guard++) {
      for (let rz = -reach; rz <= reach; rz++)
        for (let rx = -reach; rx <= reach; rx++) {
          const c = cx + rx
          const r = cz + rz
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue
          const list = this.cells.get(r * this.cols + c)
          if (!list) continue
          for (let k = 0; k < list.length; k++) {
            const i = list[k]
            if (this.stamp[i] === this.query) continue
            this.stamp[i] = this.query
            const hit = rayBox(this.boxes[i], ox, oy, oz, dx, dy, dz, pad)
            if (hit >= 0 && hit < best) best = hit
          }
        }
      if (tMaxX < tMaxZ) {
        t = tMaxX
        tMaxX += tDeltaX
        cx += stepX
      } else {
        t = tMaxZ
        tMaxZ += tDeltaZ
        cz += stepZ
      }
    }
    return best
  }

  /** Height of the highest solid top under (x, z) at or below `y + step` (ground = 0). */
  groundAt(x: number, z: number, y = 1e9): number {
    const [c, r] = this.cell(x, z)
    const list = this.cells.get(r * this.cols + c)
    let top = 0
    if (!list) return top
    for (const i of list) {
      const b = this.boxes[i]
      if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue
      if (b.max[1] <= y + 0.5 && b.max[1] > top) top = b.max[1]
    }
    return top
  }
}

/** Slab test; returns the entry distance (0 when starting inside) or −1. Allocation-free. */
export function rayBox(
  b: MapBox,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  pad = 0
): number {
  slab.min = -Infinity
  slab.max = Infinity
  if (!axis(ox, dx, b.min[0] - pad, b.max[0] + pad)) return -1
  if (!axis(oy, dy, b.min[1] - pad, b.max[1] + pad)) return -1
  if (!axis(oz, dz, b.min[2] - pad, b.max[2] + pad)) return -1
  if (slab.max < 0) return -1
  return Math.max(0, slab.min)
}

const slab = { min: 0, max: 0 }

function axis(o: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi
  let t1 = (lo - o) / d
  let t2 = (hi - o) / d
  if (t1 > t2) {
    const s = t1
    t1 = t2
    t2 = s
  }
  if (t1 > slab.min) slab.min = t1
  if (t2 < slab.max) slab.max = t2
  return slab.min <= slab.max
}
