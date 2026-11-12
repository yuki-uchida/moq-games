/**
 * Review viewpoints computed from a real MapDef (spawns, bases, anchors, rooftops, edges): player-height shots
 * that never start inside a box, so every map and variant can be captured the same way (scripts/
 * anima-front-render.mjs --only maps).
 */
import type { MapDef, V3 } from '../sim/types'

export interface TourView {
  name: string
  pos: V3
  target: V3
}

const EYE = 2.3

/** True when (x, y, z) is inside a drawn box (camera would show its inside). */
function inside(map: MapDef, x: number, y: number, z: number, pad = 0.6): boolean {
  for (const b of map.boxes) {
    if (b.kind === 'barrier' || b.kind === 'ground' || b.kind === 'road') continue
    if (
      x > b.min[0] - pad &&
      x < b.max[0] + pad &&
      z > b.min[2] - pad &&
      z < b.max[2] + pad &&
      y > b.min[1] - 0.2 &&
      y < b.max[1] + 0.4
    )
      return true
  }
  return false
}

/** Height of the walkable top under (x, z) at or below `below`. */
export function groundAt(map: MapDef, x: number, z: number, below = 1e9): number {
  let y = 0
  for (const b of map.boxes) {
    if (b.kind === 'barrier' || b.solid === false) continue
    if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue
    if (b.max[1] <= below && b.max[1] > y) y = b.max[1]
  }
  return y
}

/** Walks from `from` towards `away` until the camera point is free (max `maxSteps` metres). */
function freeFrom(map: MapDef, at: V3, dir: [number, number], dist: number, height: number): V3 {
  const l = Math.hypot(dir[0], dir[1]) || 1
  const dx = dir[0] / l
  const dz = dir[1] / l
  for (let d = dist; d >= 2; d -= 1) {
    const x = at[0] + dx * d
    const z = at[2] + dz * d
    const y = Math.max(at[1], groundAt(map, x, z, at[1] + 1.5)) + height
    if (!inside(map, x, y, z) && !inside(map, x, y - height + 0.6, z, 0.1)) return [x, y, z]
  }
  for (let d = dist + 1; d <= dist + 20; d++) {
    const x = at[0] + dx * d
    const z = at[2] + dz * d
    const y = Math.max(at[1], groundAt(map, x, z, at[1] + 1.5)) + height
    if (!inside(map, x, y, z)) return [x, y, z]
  }
  return [at[0] + dx * dist, at[1] + height + 6, at[2] + dz * dist]
}

export function tourViews(map: MapDef): TourView[] {
  const [bx0, bz0] = map.bounds.min
  const [bx1, bz1] = map.bounds.max
  const cx = (bx0 + bx1) / 2
  const cz = (bz0 + bz1) / 2
  const centre: V3 = [cx, 1.5, cz]
  const views: TourView[] = []

  // Spawns: behind the first spawn of each team/base, looking the way the spawn faces.
  const seen = new Set<string>()
  for (const s of map.spawns) {
    const key = String(s.team)
    if (seen.has(key)) continue
    seen.add(key)
    const fx = Math.sin(s.yaw)
    const fz = Math.cos(s.yaw)
    let pos = freeFrom(map, s.p, [-fx, -fz], 4, EYE)
    // A wall right in front of the camera makes a useless review shot: stand on the spawn instead.
    for (let k = 1; k <= 6; k++)
      if (inside(map, pos[0] + fx * k, pos[1], pos[2] + fz * k, 0.1)) {
        pos = [s.p[0], s.p[1] + EYE, s.p[2]]
        break
      }
    views.push({ name: `spawn-${key}`, pos, target: [s.p[0] + fx * 30, s.p[1] + 2, s.p[2] + fz * 30] })
    if (seen.size >= 3) break
  }

  // Anchors (objectives): from 14 m towards the first base.
  const base = map.bases[0]?.p ?? centre
  const anchorNames = Object.keys(map.anchors).filter((n) => !/^(target[2-8]|tutorial[2-8])$/.test(n))
  for (const name of anchorNames.slice(0, 6)) {
    const a = map.anchors[name]
    const dir: [number, number] = [base[0] - a[0], base[2] - a[2]]
    if (Math.hypot(dir[0], dir[1]) < 4) dir.splice(0, 2, cx - a[0] || 1, cz - a[2])
    const pos = freeFrom(map, a, dir, 14, 3.2)
    views.push({ name: `anchor-${name}`, pos, target: [a[0], a[1] + 1.8, a[2]] })
  }

  // Rooftop: stand on the tallest reachable building and look over the map.
  let roof: { p: V3; h: number } | null = null
  for (const b of map.boxes) {
    if (b.kind !== 'building' && b.kind !== 'roof') continue
    const h = b.max[1]
    if (h > 22) continue
    if (!roof || h > roof.h) roof = { p: [(b.min[0] + b.max[0]) / 2, h, (b.min[2] + b.max[2]) / 2], h }
  }
  if (roof) {
    const d: [number, number] = [roof.p[0] - cx, roof.p[2] - cz]
    const l = Math.hypot(d[0], d[1]) || 1
    views.push({
      name: 'rooftop',
      pos: [roof.p[0] + (d[0] / l) * 3, roof.h + EYE, roof.p[2] + (d[1] / l) * 3],
      target: [cx, 2, cz]
    })
  }

  // Edges: from inside the bounds looking out over the wall at the backdrop.
  for (const [name, ex, ez, dx, dz] of [
    ['edge-north', cx, bz1 - 10, 0, 1],
    ['edge-west', bx0 + 10, cz, -1, 0]
  ] as const) {
    let pos: V3 | null = null
    for (let o = 0; o <= 60 && !pos; o += 4)
      for (const s of [1, -1]) {
        const x = ex + (dz !== 0 ? o * s : 0)
        const z = ez + (dx !== 0 ? o * s : 0)
        const y = groundAt(map, x, z, 2) + EYE
        if (!inside(map, x, y, z) && !inside(map, x, y - 1.6, z, 0.1)) {
          pos = [x, y, z]
          break
        }
      }
    if (pos) views.push({ name, pos, target: [pos[0] + dx * 40, pos[1] + 3, pos[2] + dz * 40] })
  }

  // Overview.
  views.push({
    name: 'overview',
    pos: [cx + (bx1 - bx0) * 0.45, Math.max(45, (bx1 - bx0) * 0.35), cz + (bz1 - bz0) * 0.55],
    target: [cx, 0, cz]
  })
  return views
}

/** Fast `groundAt` over an 8 m bucket grid (the harness world calls it for every actor every step). */
export function groundSampler(map: MapDef): (x: number, z: number, below: number) => number {
  const CELL = 8
  const cells = new Map<string, MapDef['boxes'][number][]>()
  for (const b of map.boxes) {
    if (b.kind === 'barrier' || b.solid === false) continue
    for (let x = Math.floor(b.min[0] / CELL); x <= Math.floor(b.max[0] / CELL); x++)
      for (let z = Math.floor(b.min[2] / CELL); z <= Math.floor(b.max[2] / CELL); z++) {
        const k = `${x},${z}`
        let l = cells.get(k)
        if (!l) cells.set(k, (l = []))
        l.push(b)
      }
  }
  return (x, z, below) => {
    const l = cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`)
    let y = 0
    if (!l) return y
    for (const b of l)
      if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= below && b.max[1] > y)
        y = b.max[1]
    return y
  }
}
