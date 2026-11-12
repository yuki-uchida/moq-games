/**
 * Bot navigation (DESIGN §13): 8-neighbour A* on the shared ground grid (no corner cutting) with string-pulling
 * smoothing over open cells. Search buffers are reused between calls (stamped) so replans do not allocate.
 */
import type { NavGrid } from '../grid'

let gBuf = new Float64Array(0)
let fromBuf = new Int32Array(0)
let stampBuf = new Uint32Array(0)
let closedBuf = new Uint32Array(0)
let stamp = 0
const heap: number[] = []
const heapF: number[] = []

function ensure(n: number) {
  if (gBuf.length >= n) return
  gBuf = new Float64Array(n)
  fromBuf = new Int32Array(n)
  stampBuf = new Uint32Array(n)
  closedBuf = new Uint32Array(n)
  stamp = 0
}

function push(i: number, f: number) {
  heap.push(i)
  heapF.push(f)
  let k = heap.length - 1
  while (k > 0) {
    const pk = (k - 1) >> 1
    if (heapF[pk] <= heapF[k]) break
    ;[heap[pk], heap[k]] = [heap[k], heap[pk]]
    ;[heapF[pk], heapF[k]] = [heapF[k], heapF[pk]]
    k = pk
  }
}

function pop(): number {
  const top = heap[0]
  const li = heap.pop()!
  const lf = heapF.pop()!
  if (heap.length) {
    heap[0] = li
    heapF[0] = lf
    let k = 0
    const n = heap.length
    for (;;) {
      const a = 2 * k + 1
      const b = a + 1
      let m = k
      if (a < n && heapF[a] < heapF[m]) m = a
      if (b < n && heapF[b] < heapF[m]) m = b
      if (m === k) break
      ;[heap[m], heap[k]] = [heap[k], heap[m]]
      ;[heapF[m], heapF[k]] = [heapF[k], heapF[m]]
      k = m
    }
  }
  return top
}

const SQ2 = Math.SQRT2

/**
 * Path of world x/z points from (sx, sz) to (gx, gz), smoothed; the last point is the goal itself.
 * Returns null when no path exists within the expansion budget (the caller then walks straight).
 */
export function findPath(
  g: NavGrid,
  sx: number,
  sz: number,
  gx: number,
  gz: number,
  budget = 8000
): [number, number][] | null {
  if (g.lineOpen(sx, sz, gx, gz)) return [[gx, gz]]
  const n = g.w * g.h
  ensure(n)
  stamp = (stamp + 1) >>> 0
  if (stamp === 0) {
    stampBuf.fill(0)
    closedBuf.fill(0)
    stamp = 1
  }
  const start = g.nearestOpen(g.index(sx, sz))
  const goal = g.nearestOpen(g.index(gx, gz))
  if (!g.open(start) || !g.open(goal)) return null
  heap.length = 0
  heapF.length = 0
  const gxC = goal % g.w
  const gzC = Math.floor(goal / g.w)
  const h = (i: number) => {
    const dx = Math.abs((i % g.w) - gxC)
    const dz = Math.abs(Math.floor(i / g.w) - gzC)
    return Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)
  }
  stampBuf[start] = stamp
  gBuf[start] = 0
  fromBuf[start] = -1
  push(start, h(start))
  let found = false
  let expanded = 0
  while (heap.length && expanded < budget) {
    const c = pop()
    if (closedBuf[c] === stamp) continue
    closedBuf[c] = stamp
    expanded++
    if (c === goal) {
      found = true
      break
    }
    const x = c % g.w
    const z = Math.floor(c / g.w)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue
        const ni = nz * g.w + nx
        if (g.blocked[ni]) continue
        if (dx && dz && (g.blocked[z * g.w + nx] || g.blocked[nz * g.w + x])) continue
        if (closedBuf[ni] === stamp) continue
        const ng = gBuf[c] + (dx && dz ? SQ2 : 1)
        if (stampBuf[ni] === stamp && gBuf[ni] <= ng) continue
        stampBuf[ni] = stamp
        gBuf[ni] = ng
        fromBuf[ni] = c
        push(ni, ng + h(ni))
      }
    }
  }
  if (!found) return null
  const cells: number[] = []
  for (let c = goal; c !== -1; c = fromBuf[c]) cells.push(c)
  cells.reverse()
  const pts: [number, number][] = cells.map((c) => [g.centerX(c), g.centerZ(c)])
  if (g.open(g.index(gx, gz))) pts[pts.length - 1] = [gx, gz]
  // String pulling: from each anchor jump to the farthest visible point.
  const out: [number, number][] = []
  let ax = sx
  let az = sz
  let i = 0
  while (i < pts.length) {
    let j = pts.length - 1
    while (j > i && !g.lineOpen(ax, az, pts[j][0], pts[j][1])) j--
    out.push(pts[j])
    ax = pts[j][0]
    az = pts[j][1]
    i = j + 1
  }
  return out
}
