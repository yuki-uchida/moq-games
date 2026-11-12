/**
 * Walkability analysis of a MapDef on a ground grid, used by the map tests and the map review tool.
 *
 * Model: an agent of radius `radius` and height `height` stands on box tops; it can step up ≤ `step`, drop any
 * height, walk to the 4 neighbouring cells, and ride fixed frog pads (launch 13 m up and ~6 m forward; it may land
 * on any surface ≤ 12.5 m above the pad within 4 m of the landing point). Jumps are ignored on purpose, so every
 * reachable place is also reachable by a bot that only walks and uses pads.
 */
import type { MapBox, MapDef, V3 } from '../types'

export interface ReachOptions {
  res?: number
  radius?: number
  /** Horizontal distance over which a box edge still supports the agent. */
  support?: number
  step?: number
  height?: number
}

export interface ReachGrid {
  res: number
  x0: number
  z0: number
  nx: number
  nz: number
  /** Nodes of cell i are cellStart[i] … cellStart[i + 1] − 1 (heights ascending). */
  cellStart: Int32Array
  nodeH: Float32Array
  reached: Uint8Array
  /** Index of the node an arbitrary point stands on, or −1. */
  nodeAt(p: V3, tol?: number): number
  isReached(p: V3, tol?: number): boolean
}

const EPS = 1e-4

export function solidBoxes(map: MapDef): MapBox[] {
  return map.boxes.filter((b) => b.solid !== false)
}

/** Builds the node grid and flood-fills it from `starts` (default: the map's player spawns). */
export function reach(map: MapDef, opts: ReachOptions = {}, starts?: V3[]): ReachGrid {
  const res = opts.res ?? 0.5
  const radius = opts.radius ?? 0.4
  const support = opts.support ?? 0.2
  const step = opts.step ?? 0.45
  const height = opts.height ?? 1.7
  const x0 = map.bounds.min[0]
  const z0 = map.bounds.min[1]
  const nx = Math.ceil((map.bounds.max[0] - x0) / res)
  const nz = Math.ceil((map.bounds.max[1] - z0) / res)
  const ncell = nx * nz
  const boxes = solidBoxes(map)

  // Bin every box into the cells its radius-expanded footprint covers (CSR layout).
  const range = (b: MapBox): [number, number, number, number] => [
    Math.max(0, Math.ceil((b.min[0] - radius - x0) / res - 0.5)),
    Math.min(nx - 1, Math.floor((b.max[0] + radius - x0) / res - 0.5)),
    Math.max(0, Math.ceil((b.min[2] - radius - z0) / res - 0.5)),
    Math.min(nz - 1, Math.floor((b.max[2] + radius - z0) / res - 0.5))
  ]
  const count = new Int32Array(ncell + 1)
  const ranges = boxes.map(range)
  for (const [i0, i1, k0, k1] of ranges)
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) count[k * nx + i]++
  const binStart = new Int32Array(ncell + 1)
  for (let c = 0; c < ncell; c++) binStart[c + 1] = binStart[c] + count[c]
  const bins = new Int32Array(binStart[ncell])
  const fill = binStart.slice(0, ncell)
  ranges.forEach(([i0, i1, k0, k1], bi) => {
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) bins[fill[k * nx + i]++] = bi
  })

  const cx = (i: number): number => x0 + (i + 0.5) * res
  const cz = (k: number): number => z0 + (k + 0.5) * res
  const inside = (b: MapBox, x: number, z: number, e: number): boolean =>
    x >= b.min[0] - e && x <= b.max[0] + e && z >= b.min[2] - e && z <= b.max[2] + e
  /** True when a blocking box near the cell centre overlaps the vertical span (lo, hi). */
  const blocked = (c: number, lo: number, hi: number): boolean => {
    const x = cx(c % nx)
    const z = cz(Math.floor(c / nx))
    for (let j = binStart[c]; j < binStart[c + 1]; j++) {
      const b = boxes[bins[j]]
      if (b.min[1] < hi && b.max[1] > lo && inside(b, x, z, radius)) return true
    }
    return false
  }

  // Nodes: supported box tops with head room.
  const cellStart = new Int32Array(ncell + 1)
  const hs: number[] = []
  for (let c = 0; c < ncell; c++) {
    cellStart[c] = hs.length
    const x = cx(c % nx)
    const z = cz(Math.floor(c / nx))
    const tops: number[] = []
    for (let j = binStart[c]; j < binStart[c + 1]; j++) {
      const b = boxes[bins[j]]
      if (b.kind !== 'barrier' && inside(b, x, z, support)) tops.push(b.max[1])
    }
    tops.sort((a, b) => a - b)
    let last = -Infinity
    for (const h of tops) {
      if (h - last < 0.02) continue
      if (!blocked(c, h + step + EPS, h + height)) {
        hs.push(h)
        last = h
      }
    }
  }
  cellStart[ncell] = hs.length
  const nodeH = Float32Array.from(hs)
  const nodeCell = new Int32Array(hs.length)
  for (let c = 0; c < ncell; c++) for (let n = cellStart[c]; n < cellStart[c + 1]; n++) nodeCell[n] = c

  /** Highest node of cell c at or below y (−1 if none). */
  const landing = (c: number, y: number): number => {
    for (let n = cellStart[c + 1] - 1; n >= cellStart[c]; n--) if (nodeH[n] <= y + EPS) return n
    return -1
  }
  const cellOf = (x: number, z: number): number => {
    const i = Math.floor((x - x0) / res)
    const k = Math.floor((z - z0) / res)
    return i < 0 || k < 0 || i >= nx || k >= nz ? -1 : k * nx + i
  }
  const nodeAt = (p: V3, tol = 0.3): number => {
    const c = cellOf(p[0], p[2])
    if (c < 0) return -1
    let best = -1
    let bd = tol
    for (let n = cellStart[c]; n < cellStart[c + 1]; n++) {
      const d = Math.abs(nodeH[n] - p[1])
      if (d <= bd) {
        bd = d
        best = n
      }
    }
    return best
  }

  // Pad links.
  const padLinks = new Map<number, number[]>()
  for (const pad of map.pads) {
    const from = nodeAt(pad.p)
    if (from < 0) continue
    const tx = pad.p[0] + Math.sin(pad.yaw) * 6
    const tz = pad.p[2] + Math.cos(pad.yaw) * 6
    const out: number[] = []
    const rr = 4
    for (let k = Math.floor((tz - rr - z0) / res); k <= Math.ceil((tz + rr - z0) / res); k++) {
      for (let i = Math.floor((tx - rr - x0) / res); i <= Math.ceil((tx + rr - x0) / res); i++) {
        if (i < 0 || k < 0 || i >= nx || k >= nz) continue
        if ((cx(i) - tx) ** 2 + (cz(k) - tz) ** 2 > rr * rr) continue
        const n = landing(k * nx + i, pad.p[1] + 12.5)
        if (n >= 0) out.push(n)
      }
    }
    padLinks.set(from, [...(padLinks.get(from) ?? []), ...out])
  }

  // Flood fill.
  const reached = new Uint8Array(hs.length)
  const queue = new Int32Array(hs.length)
  let qh = 0
  let qt = 0
  const push = (n: number): void => {
    if (n >= 0 && !reached[n]) {
      reached[n] = 1
      queue[qt++] = n
    }
  }
  for (const s of starts ?? map.spawns.map((sp) => sp.p)) push(nodeAt(s))
  const nb = [1, -1, nx, -nx]
  while (qh < qt) {
    const n = queue[qh++]
    const c = nodeCell[n]
    const h = nodeH[n]
    const i = c % nx
    for (let d = 0; d < 4; d++) {
      if ((d === 0 && i === nx - 1) || (d === 1 && i === 0)) continue
      const c2 = c + nb[d]
      if (c2 < 0 || c2 >= ncell) continue
      const n2 = landing(c2, h + step)
      if (n2 < 0 || reached[n2]) continue
      const top = Math.max(h, nodeH[n2])
      if (blocked(c2, top + step + EPS, top + height)) continue
      push(n2)
    }
    const links = padLinks.get(n)
    if (links) for (const l of links) push(l)
  }

  return {
    res,
    x0,
    z0,
    nx,
    nz,
    cellStart,
    nodeH,
    reached,
    nodeAt,
    isReached: (p, tol) => {
      const n = nodeAt(p, tol)
      return n >= 0 && reached[n] === 1
    }
  }
}

/** Solid box containing the point strictly (with a small margin), if any. */
export function boxAt(map: MapDef, p: V3, margin = 0.05): MapBox | undefined {
  return solidBoxes(map).find(
    (b) =>
      p[0] > b.min[0] + margin &&
      p[0] < b.max[0] - margin &&
      p[1] > b.min[1] + margin &&
      p[1] < b.max[1] - margin &&
      p[2] > b.min[2] + margin &&
      p[2] < b.max[2] - margin
  )
}

/** True when a solid box top lies at p.y (± tol) under p. */
export function standsOnSomething(map: MapDef, p: V3, tol = 0.05): boolean {
  return solidBoxes(map).some(
    (b) =>
      b.kind !== 'barrier' &&
      Math.abs(b.max[1] - p[1]) <= tol &&
      p[0] >= b.min[0] &&
      p[0] <= b.max[0] &&
      p[2] >= b.min[2] &&
      p[2] <= b.max[2]
  )
}

/**
 * Sweeps a cart footprint (square of half-size `half`, from 0.15 m to `h` above the path) along the path in steps
 * of 0.25 m. Returns the first blocked sample, or undefined when the route is clear.
 */
export function pathBlocked(map: MapDef, pts: V3[], half = 0.8, h = 1.5): { at: V3; box: MapBox } | undefined {
  const boxes = solidBoxes(map)
  for (let s = 0; s + 1 < pts.length; s++) {
    const a = pts[s]
    const b = pts[s + 1]
    const len = Math.hypot(b[0] - a[0], b[2] - a[2])
    const n = Math.max(1, Math.ceil(len / 0.25))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
      for (const bx of boxes) {
        if (
          bx.min[0] < p[0] + half &&
          bx.max[0] > p[0] - half &&
          bx.min[2] < p[2] + half &&
          bx.max[2] > p[2] - half &&
          bx.min[1] < p[1] + h &&
          bx.max[1] > p[1] + 0.15
        )
          return { at: p, box: bx }
      }
    }
  }
  return undefined
}
