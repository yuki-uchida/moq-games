/**
 * Crowd flow fields (DESIGN §11): one integration field per target (Dijkstra over the ground NavGrid with
 * 8-neighbour moves and no corner cutting), cached per target key and recomputed when older than FLOW_REFRESH.
 * Every foe chasing the same target shares the field; a foe reads the steepest-descent neighbour of its cell.
 */
import { FLOW_REFRESH } from '../constants'
import { navGrid, type NavGrid } from '../grid'
import type { Sim } from '../state'
import type { Vec } from '../vec'

const INF = 0xffffffff
const ORTHO = 10
const DIAG = 14

interface Field {
  goal: number
  at: number
  used: number
  dist: Uint32Array
}

interface FlowCache {
  fields: Map<string, Field>
  heapCell: Int32Array
  heapDist: Uint32Array
  lastSweep: number
}

function cache(sim: Sim, g: NavGrid): FlowCache {
  let c = sim.flow as FlowCache | null
  if (!c) {
    const n = g.w * g.h * 8 + 16
    c = { fields: new Map(), heapCell: new Int32Array(n), heapDist: new Uint32Array(n), lastSweep: 0 }
    sim.flow = c
  }
  return c
}

/** Dijkstra from the goal cell over open cells (binary heap with lazy deletion). */
function build(g: NavGrid, c: FlowCache, goal: number, out: Uint32Array) {
  out.fill(INF)
  const hc = c.heapCell
  const hd = c.heapDist
  let size = 0
  const push = (cell: number, d: number) => {
    let i = size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (hd[p] <= d) break
      hc[i] = hc[p]
      hd[i] = hd[p]
      i = p
    }
    hc[i] = cell
    hd[i] = d
  }
  const pop = () => {
    const cell = hc[0]
    const lc = hc[--size]
    const ld = hd[size]
    let i = 0
    for (;;) {
      let m = i * 2 + 1
      if (m >= size) break
      if (m + 1 < size && hd[m + 1] < hd[m]) m++
      if (hd[m] >= ld) break
      hc[i] = hc[m]
      hd[i] = hd[m]
      i = m
    }
    hc[i] = lc
    hd[i] = ld
    return cell
  }
  out[goal] = 0
  push(goal, 0)
  const w = g.w
  const h = g.h
  const bl = g.blocked
  while (size > 0) {
    const d0 = hd[0]
    const cell = pop()
    if (d0 > out[cell]) continue
    const x = cell % w
    const z = (cell - x) / w
    for (let dz = -1; dz <= 1; dz++) {
      const nz = z + dz
      if (nz < 0 || nz >= h) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue
        const nx = x + dx
        if (nx < 0 || nx >= w) continue
        const n = nz * w + nx
        if (bl[n]) continue
        let cost = ORTHO
        if (dx !== 0 && dz !== 0) {
          if (bl[z * w + nx] || bl[nz * w + x]) continue
          cost = DIAG
        }
        const nd = d0 + cost
        if (nd < out[n] && size < hc.length) {
          out[n] = nd
          push(n, nd)
        }
      }
    }
  }
}

/**
 * Horizontal unit direction for a walker at `from` heading for the target `key` at `goalPos`, or null when the
 * walker should steer straight (same cell, unreachable or no field).
 */
export function flowDir(sim: Sim, key: string, goalPos: Vec, from: Vec): [number, number] | null {
  const g = navGrid(sim)
  const c = cache(sim, g)
  let f = c.fields.get(key)
  if (!f || sim.time - f.at >= FLOW_REFRESH) {
    const goal = g.nearestOpen(g.index(goalPos[0], goalPos[2]))
    if (!f) {
      f = { goal, at: sim.time, used: sim.time, dist: new Uint32Array(g.w * g.h) }
      c.fields.set(key, f)
      build(g, c, goal, f.dist)
    } else {
      if (goal !== f.goal) build(g, c, goal, f.dist)
      f.goal = goal
      f.at = sim.time
    }
  }
  f.used = sim.time
  // Drop fields nobody used for a while.
  if (sim.time - c.lastSweep > 2) {
    c.lastSweep = sim.time
    for (const [k, v] of c.fields) if (sim.time - v.used > 2) c.fields.delete(k)
  }
  let cell = g.index(from[0], from[2])
  if (!g.open(cell)) cell = g.nearestOpen(cell)
  const dist = f.dist
  if (cell === f.goal || dist[cell] === INF) return null
  const w = g.w
  const x = cell % w
  const z = (cell - x) / w
  let best = -1
  let bd = dist[cell]
  for (let dz = -1; dz <= 1; dz++) {
    const nz = z + dz
    if (nz < 0 || nz >= g.h) continue
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue
      const nx = x + dx
      if (nx < 0 || nx >= w) continue
      const n = nz * w + nx
      if (g.blocked[n]) continue
      if (dx !== 0 && dz !== 0 && (g.blocked[z * w + nx] || g.blocked[nz * w + x])) continue
      if (dist[n] < bd) {
        bd = dist[n]
        best = n
      }
    }
  }
  if (best < 0) return null
  const tx = g.centerX(best) - from[0]
  const tz = g.centerZ(best) - from[2]
  const l = Math.hypot(tx, tz)
  return l > 1e-6 ? [tx / l, tz / l] : null
}

/** Integration distance of a cell in the cached field for a target key (Infinity when unknown or unreachable). */
export function flowDist(sim: Sim, key: string, cell: number): number {
  const c = sim.flow as { fields?: Map<string, { dist: Uint32Array }> } | null
  const fld = c?.fields?.get(key)
  if (!fld || cell < 0 || cell >= fld.dist.length) return Infinity
  const d = fld.dist[cell]
  return d === INF ? Infinity : d
}
