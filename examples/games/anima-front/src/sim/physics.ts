/**
 * Static collision world (DESIGN §9): axis-aligned boxes in a uniform x/z grid, the y = 0 ground plane and the map
 * bounds as walls. Provides capsule movement with wall sliding and step-up, ground detection, ray casts (with an
 * optional inflation radius for swept spheres) and a dynamic spatial hash for actor queries.
 */
import { STEP_UP } from './constants'
import type { BoxKind, MapDef, Surface } from './types'
import type { Vec } from './vec'

const CELL = 4

const KIND_SURFACE: Record<BoxKind, Surface> = {
  ground: 'ground',
  road: 'concrete',
  building: 'concrete',
  roof: 'concrete',
  wall: 'concrete',
  platform: 'concrete',
  stairs: 'concrete',
  crate: 'wood',
  container: 'metal',
  car: 'metal',
  rock: 'concrete',
  crystal: 'crystal',
  tree: 'foliage',
  fence: 'metal',
  pillar: 'concrete',
  barrier: 'virtual'
}

export interface RayHit {
  t: number
  point: Vec
  normal: Vec
  surface: Surface
  /** Box index, −1 for the ground plane, −2 for the bounds, −3 for a dynamic box. */
  box: number
  /** Dynamic box tag (prop id) when `box` is −3. */
  tag?: number
}

/** A movable body: feet position, velocity, capsule radius and height. */
export interface Mover {
  p: Vec
  v: Vec
  r: number
  h: number
  grounded: boolean
}

export interface MoveResult {
  landed: boolean
  /** Downward speed at landing. */
  impact: number
  wall: boolean
  ceiling: boolean
}

/** A temporary solid (ヤドカリ wall) that blocks one side only. */
export interface DynBox {
  min: Vec
  max: Vec
  /** Side whose bodies and shots pass through (the owner's side). */
  pass: number
  tag: number
}

export class Physics {
  readonly minX: number
  readonly minZ: number
  readonly maxX: number
  readonly maxZ: number
  readonly n: number
  private readonly b: Float64Array
  private readonly surf: Surface[]
  private readonly gw: number
  private readonly gh: number
  private readonly cellStart: Int32Array
  private readonly cellItems: Int32Array
  private readonly stamp: Uint32Array
  private stampId = 1
  readonly groundSurface: Surface
  dyn: DynBox[] = []

  constructor(map: MapDef) {
    this.minX = map.bounds.min[0]
    this.minZ = map.bounds.min[1]
    this.maxX = map.bounds.max[0]
    this.maxZ = map.bounds.max[1]
    const virtual = map.theme === 'virtual'
    this.groundSurface = virtual ? 'virtual' : 'ground'
    const solid = map.boxes.filter((bx) => bx.solid !== false)
    this.n = solid.length
    this.b = new Float64Array(this.n * 6)
    this.surf = []
    solid.forEach((bx, i) => {
      this.b.set([bx.min[0], bx.min[1], bx.min[2], bx.max[0], bx.max[1], bx.max[2]], i * 6)
      this.surf.push(bx.surface ?? (virtual && bx.kind !== 'tree' ? 'virtual' : (KIND_SURFACE[bx.kind] ?? 'concrete')))
    })
    this.gw = Math.max(1, Math.ceil((this.maxX - this.minX) / CELL))
    this.gh = Math.max(1, Math.ceil((this.maxZ - this.minZ) / CELL))
    const counts = new Int32Array(this.gw * this.gh + 1)
    const each = (i: number, fn: (c: number) => void) => {
      const o = i * 6
      const x0 = this.cx(this.b[o]),
        x1 = this.cx(this.b[o + 3])
      const z0 = this.cz(this.b[o + 2]),
        z1 = this.cz(this.b[o + 5])
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(z * this.gw + x)
    }
    for (let i = 0; i < this.n; i++) each(i, (c) => counts[c + 1]++)
    for (let c = 0; c < this.gw * this.gh; c++) counts[c + 1] += counts[c]
    this.cellStart = counts
    this.cellItems = new Int32Array(counts[this.gw * this.gh])
    const fill = new Int32Array(this.gw * this.gh)
    for (let i = 0; i < this.n; i++) each(i, (c) => (this.cellItems[counts[c] + fill[c]++] = i))
    this.stamp = new Uint32Array(this.n)
  }

  private cx(x: number) {
    const c = Math.floor((x - this.minX) / CELL)
    return c < 0 ? 0 : c >= this.gw ? this.gw - 1 : c
  }
  private cz(z: number) {
    const c = Math.floor((z - this.minZ) / CELL)
    return c < 0 ? 0 : c >= this.gh ? this.gh - 1 : c
  }

  private nextStamp() {
    this.stampId = (this.stampId + 1) >>> 0
    if (this.stampId === 0) {
      this.stamp.fill(0)
      this.stampId = 1
    }
    return this.stampId
  }

  /** Calls fn(boxIndex) once per solid box whose x/z cell range overlaps the rectangle. */
  forBoxes(x0: number, z0: number, x1: number, z1: number, fn: (i: number) => void) {
    const s = this.nextStamp()
    const cx0 = this.cx(x0),
      cx1 = this.cx(x1),
      cz0 = this.cz(z0),
      cz1 = this.cz(z1)
    for (let z = cz0; z <= cz1; z++) {
      for (let x = cx0; x <= cx1; x++) {
        const c = z * this.gw + x
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          const i = this.cellItems[k]
          if (this.stamp[i] === s) continue
          this.stamp[i] = s
          fn(i)
        }
      }
    }
  }

  box(i: number): { min: Vec; max: Vec; surface: Surface } {
    const o = i * 6
    const b = this.b
    return { min: [b[o], b[o + 1], b[o + 2]], max: [b[o + 3], b[o + 4], b[o + 5]], surface: this.surf[i] }
  }

  inBounds(x: number, z: number, margin = 0) {
    return x >= this.minX + margin && x <= this.maxX - margin && z >= this.minZ + margin && z <= this.maxZ - margin
  }

  /**
   * Highest walkable top under a circle at (x, z) with radius r whose top is ≤ maxY (the ground plane is 0).
   */
  groundHeight(x: number, z: number, r: number, maxY: number, side = -1): number {
    let best = 0
    const b = this.b
    this.forBoxes(x - r, z - r, x + r, z + r, (i) => {
      const o = i * 6
      const top = b[o + 4]
      if (top <= best || top > maxY) return
      if (circleRect(x, z, r, b[o], b[o + 2], b[o + 3], b[o + 5]) < 0) return
      best = top
    })
    for (const d of this.dyn) {
      if (d.pass === side) continue
      const top = d.max[1]
      if (top <= best || top > maxY) continue
      if (circleRect(x, z, r, d.min[0], d.min[2], d.max[0], d.max[2]) < 0) continue
      best = top
    }
    return best
  }

  /** True when a vertical capsule at p (feet) with radius r and height h overlaps any solid. */
  overlaps(p: readonly number[], r: number, h: number, side = -1): boolean {
    let hit = false
    const b = this.b
    this.forBoxes(p[0] - r, p[2] - r, p[0] + r, p[2] + r, (i) => {
      if (hit) return
      const o = i * 6
      if (b[o + 4] <= p[1] + 0.01 || b[o + 1] >= p[1] + h) return
      if (circleRect(p[0], p[2], r, b[o], b[o + 2], b[o + 3], b[o + 5]) > 1e-4) hit = true
    })
    if (hit) return true
    for (const d of this.dyn) {
      if (d.pass === side || d.max[1] <= p[1] + 0.01 || d.min[1] >= p[1] + h) continue
      if (circleRect(p[0], p[2], r, d.min[0], d.min[2], d.max[0], d.max[2]) > 1e-4) return true
    }
    return false
  }

  /**
   * Moves a capsule by its velocity over dt: horizontal sub-steps with wall sliding (velocity into walls is
   * removed), step-up onto ledges ≤ 0.45 m while grounded, then vertical movement with landing and ceilings.
   */
  move(m: Mover, dt: number, side = -1, stepUp = STEP_UP): MoveResult {
    const res: MoveResult = { landed: false, impact: 0, wall: false, ceiling: false }
    const p = m.p
    const v = m.v
    const r = m.r
    const dx = v[0] * dt
    const dz = v[2] * dt
    const steps = Math.min(24, Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.5))))
    const allow = m.grounded ? stepUp : 0.05
    for (let s = 0; s < steps; s++) {
      p[0] += dx / steps
      p[2] += dz / steps
      if (this.pushOut(m, allow, side)) res.wall = true
      if (m.grounded) {
        const g = this.groundHeight(p[0], p[2], r * 0.7, p[1] + stepUp, side)
        if (g > p[1] && !this.overlaps([p[0], g, p[2]], r * 0.9, m.h, side)) p[1] = g
      }
    }
    // Bounds are walls.
    if (p[0] < this.minX + r) {
      p[0] = this.minX + r
      if (v[0] < 0) v[0] = 0
      res.wall = true
    } else if (p[0] > this.maxX - r) {
      p[0] = this.maxX - r
      if (v[0] > 0) v[0] = 0
      res.wall = true
    }
    if (p[2] < this.minZ + r) {
      p[2] = this.minZ + r
      if (v[2] < 0) v[2] = 0
      res.wall = true
    } else if (p[2] > this.maxZ - r) {
      p[2] = this.maxZ - r
      if (v[2] > 0) v[2] = 0
      res.wall = true
    }
    // Vertical.
    const y0 = p[1]
    const dy = v[1] * dt
    if (dy > 0) {
      const ceil = this.ceilingAbove(p[0], p[2], r * 0.8, y0 + m.h, y0 + m.h + dy, side)
      if (ceil < Infinity) {
        p[1] = ceil - m.h - 0.001
        v[1] = 0
        res.ceiling = true
      } else p[1] = y0 + dy
    } else p[1] = y0 + dy
    const g = this.groundHeight(p[0], p[2], r * 0.7, y0 + (m.grounded ? stepUp : 0.05), side)
    if (v[1] <= 0 && p[1] <= g) {
      if (!m.grounded) {
        res.landed = true
        res.impact = -v[1]
      }
      p[1] = g
      v[1] = 0
      m.grounded = true
    } else if (m.grounded && v[1] <= 0 && p[1] - g < 0.35) {
      // Walk down small steps without leaving the ground.
      p[1] = g
      v[1] = 0
    } else m.grounded = false
    return res
  }

  /** Pushes a capsule out of blocking boxes (boxes whose top is above feet + allow). Returns true on contact. */
  private pushOut(m: Mover, allow: number, side: number): boolean {
    const p = m.p
    const v = m.v
    const r = m.r
    let touched = false
    for (let it = 0; it < 3; it++) {
      let moved = false
      const b = this.b
      const resolve = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
        if (y1 <= p[1] + allow || y0 >= p[1] + m.h) return
        const qx = p[0] < x0 ? x0 : p[0] > x1 ? x1 : p[0]
        const qz = p[2] < z0 ? z0 : p[2] > z1 ? z1 : p[2]
        let nx = p[0] - qx
        let nz = p[2] - qz
        let d = Math.hypot(nx, nz)
        if (d >= r) return
        if (d < 1e-6) {
          // Centre inside the rectangle: leave along the shallowest axis.
          const pl = p[0] - x0,
            pr = x1 - p[0],
            pb = p[2] - z0,
            pf = z1 - p[2]
          const mn = Math.min(pl, pr, pb, pf)
          if (mn === pl) (nx = -1), (nz = 0), (d = -pl)
          else if (mn === pr) (nx = 1), (nz = 0), (d = -pr)
          else if (mn === pb) (nx = 0), (nz = -1), (d = -pb)
          else (nx = 0), (nz = 1), (d = -pf)
        } else {
          nx /= d
          nz /= d
        }
        const push = r - d + 1e-4
        p[0] += nx * push
        p[2] += nz * push
        const vn = v[0] * nx + v[2] * nz
        if (vn < 0) {
          v[0] -= vn * nx
          v[2] -= vn * nz
        }
        moved = true
        touched = true
      }
      this.forBoxes(p[0] - r, p[2] - r, p[0] + r, p[2] + r, (i) => {
        const o = i * 6
        resolve(b[o], b[o + 1], b[o + 2], b[o + 3], b[o + 4], b[o + 5])
      })
      for (const d of this.dyn) {
        if (d.pass !== side) resolve(d.min[0], d.min[1], d.min[2], d.max[0], d.max[1], d.max[2])
      }
      if (!moved) break
    }
    return touched
  }

  private ceilingAbove(x: number, z: number, r: number, y0: number, y1: number, side: number): number {
    let best = Infinity
    const b = this.b
    this.forBoxes(x - r, z - r, x + r, z + r, (i) => {
      const o = i * 6
      const bot = b[o + 1]
      if (bot < y0 - 0.02 || bot > y1 || bot >= best) return
      if (circleRect(x, z, r, b[o], b[o + 2], b[o + 3], b[o + 5]) < 0) return
      best = bot
    })
    for (const d of this.dyn) {
      if (d.pass === side) continue
      const bot = d.min[1]
      if (bot < y0 - 0.02 || bot > y1 || bot >= best) continue
      if (circleRect(x, z, r, d.min[0], d.min[2], d.max[0], d.max[2]) < 0) continue
      best = bot
    }
    return best
  }

  /**
   * First hit of the ray o + d·t, t ∈ [0, maxT] (d need not be normalised; t is in units of |d|) against boxes
   * inflated by `inflate`, the ground plane and the bounds. Dynamic boxes are tested unless `side` passes them.
   */
  raycast(o: readonly number[], d: readonly number[], maxT: number, inflate = 0, side = -1, dyn = true): RayHit | null {
    let bestT = maxT
    let bestBox = -4
    let bestN0 = 0,
      bestN1 = 0,
      bestN2 = 0
    let tag: number | undefined
    // Ground plane.
    if (d[1] < 0) {
      const t = (inflate - o[1]) / d[1]
      if (t >= 0 && t < bestT) {
        bestT = t
        bestBox = -1
        bestN0 = 0
        bestN1 = 1
        bestN2 = 0
      }
    }
    // Bounds (vertical walls).
    const bt = this.boundsExit(o, d)
    if (bt < bestT) {
      bestT = Math.max(0, bt)
      bestBox = -2
      const px = o[0] + d[0] * bt
      const pz = o[2] + d[2] * bt
      const ex = Math.min(Math.abs(px - this.minX), Math.abs(px - this.maxX))
      const ez = Math.min(Math.abs(pz - this.minZ), Math.abs(pz - this.maxZ))
      if (ex < ez) {
        bestN0 = d[0] > 0 ? -1 : 1
        bestN1 = 0
        bestN2 = 0
      } else {
        bestN0 = 0
        bestN1 = 0
        bestN2 = d[2] > 0 ? -1 : 1
      }
    }
    // Boxes via a 2D DDA over the x/z grid.
    const b = this.b
    const s = this.nextStamp()
    const testBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      let tmin = 0
      let tmax = bestT
      let axis = -1
      let sign = 0
      for (let a = 0; a < 3; a++) {
        const lo = (a === 0 ? x0 : a === 1 ? y0 : z0) - inflate
        const hi = (a === 0 ? x1 : a === 1 ? y1 : z1) + inflate
        const oa = o[a]
        const da = d[a]
        if (Math.abs(da) < 1e-12) {
          if (oa < lo || oa > hi) return -1
          continue
        }
        let t0 = (lo - oa) / da
        let t1 = (hi - oa) / da
        let sg = -1
        if (t0 > t1) {
          const tt = t0
          t0 = t1
          t1 = tt
          sg = 1
        }
        if (t0 > tmin) {
          tmin = t0
          axis = a
          sign = sg
        }
        if (t1 < tmax) tmax = t1
        if (tmin > tmax) return -1
      }
      if (axis < 0) return -1 // origin inside: ignore (lets shots leave a wall they start in)
      if (tmin < bestT) {
        bestT = tmin
        bestN0 = axis === 0 ? sign : 0
        bestN1 = axis === 1 ? sign : 0
        bestN2 = axis === 2 ? sign : 0
        return 1
      }
      return -1
    }
    const lenXZ = Math.hypot(d[0], d[2])
    let cx = Math.floor((o[0] - this.minX) / CELL)
    let cz = Math.floor((o[2] - this.minZ) / CELL)
    const stepX = d[0] > 0 ? 1 : -1
    const stepZ = d[2] > 0 ? 1 : -1
    const tDX = Math.abs(d[0]) > 1e-12 ? CELL / Math.abs(d[0]) : Infinity
    const tDZ = Math.abs(d[2]) > 1e-12 ? CELL / Math.abs(d[2]) : Infinity
    let tMaxX = Math.abs(d[0]) > 1e-12 ? (this.minX + (cx + (stepX > 0 ? 1 : 0)) * CELL - o[0]) / d[0] : Infinity
    let tMaxZ = Math.abs(d[2]) > 1e-12 ? (this.minZ + (cz + (stepZ > 0 ? 1 : 0)) * CELL - o[2]) / d[2] : Infinity
    const pad = inflate > 0 ? Math.ceil(inflate / CELL) : 0
    let tCell = 0
    for (let guard = 0; guard < 4096; guard++) {
      for (let zz = cz - pad; zz <= cz + pad; zz++) {
        if (zz < 0 || zz >= this.gh) continue
        for (let xx = cx - pad; xx <= cx + pad; xx++) {
          if (xx < 0 || xx >= this.gw) continue
          const c = zz * this.gw + xx
          for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
            const i = this.cellItems[k]
            if (this.stamp[i] === s) continue
            this.stamp[i] = s
            const ob = i * 6
            if (testBox(b[ob], b[ob + 1], b[ob + 2], b[ob + 3], b[ob + 4], b[ob + 5]) > 0) bestBox = i
          }
        }
      }
      // Stop once the next cell starts beyond the best hit.
      const tNext = Math.min(tMaxX, tMaxZ)
      if (tNext > bestT || lenXZ < 1e-12) break
      tCell = tNext
      if (tMaxX < tMaxZ) {
        cx += stepX
        tMaxX += tDX
      } else {
        cz += stepZ
        tMaxZ += tDZ
      }
      if (cx < -1 || cz < -1 || cx > this.gw || cz > this.gh) break
    }
    void tCell
    if (dyn) {
      for (const db of this.dyn) {
        if (db.pass === side) continue
        if (testBox(db.min[0], db.min[1], db.min[2], db.max[0], db.max[1], db.max[2]) > 0) {
          bestBox = -3
          tag = db.tag
        }
      }
    }
    if (bestBox === -4) return null
    const surface =
      bestBox >= 0 ? this.surf[bestBox] : bestBox === -1 ? this.groundSurface : bestBox === -3 ? 'wood' : 'concrete'
    const hit: RayHit = {
      t: bestT,
      point: [o[0] + d[0] * bestT, o[1] + d[1] * bestT, o[2] + d[2] * bestT],
      normal: [bestN0, bestN1, bestN2],
      surface,
      box: bestBox
    }
    if (tag !== undefined) hit.tag = tag
    return hit
  }

  private boundsExit(o: readonly number[], d: readonly number[]): number {
    let t = Infinity
    if (d[0] > 1e-12) t = Math.min(t, (this.maxX - o[0]) / d[0])
    else if (d[0] < -1e-12) t = Math.min(t, (this.minX - o[0]) / d[0])
    if (d[2] > 1e-12) t = Math.min(t, (this.maxZ - o[2]) / d[2])
    else if (d[2] < -1e-12) t = Math.min(t, (this.minZ - o[2]) / d[2])
    return t
  }

  /** Line of sight between two points (boxes and dynamic walls of other sides). */
  clear(a: readonly number[], b: readonly number[], side = -1): boolean {
    const d: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const h = this.raycast(a, d, 1, 0, side)
    return !h || h.t >= 0.999
  }

  /** True when the ground cell at (x, z) is blocked for a walker of radius r (boxes taller than a step). */
  blockedAt(x: number, z: number, r: number): boolean {
    let hit = false
    const b = this.b
    this.forBoxes(x - r, z - r, x + r, z + r, (i) => {
      if (hit) return
      const o = i * 6
      if (b[o + 4] <= STEP_UP + 0.05 || b[o + 1] > 1.2) return
      if (circleRect(x, z, r, b[o], b[o + 2], b[o + 3], b[o + 5]) > 0) hit = true
    })
    return hit
  }
}

/** Penetration depth of a circle into a rectangle (> 0 overlapping, < 0 separated by that distance). */
export function circleRect(x: number, z: number, r: number, x0: number, z0: number, x1: number, z1: number): number {
  const qx = x < x0 ? x0 : x > x1 ? x1 : x
  const qz = z < z0 ? z0 : z > z1 ? z1 : z
  return r - Math.hypot(x - qx, z - qz)
}

/**
 * Ray (o + d·t, t ∈ [0, maxT]) against a vertical cylinder (centre x/z, radius r, y ∈ [y0, y1]).
 * Returns t of entry or −1.
 */
export function rayCylinder(
  o: readonly number[],
  d: readonly number[],
  maxT: number,
  cx: number,
  cz: number,
  r: number,
  y0: number,
  y1: number
): number {
  const ox = o[0] - cx
  const oz = o[2] - cz
  const a = d[0] * d[0] + d[2] * d[2]
  const c = ox * ox + oz * oz - r * r
  let t: number
  if (c <= 0) {
    // Starts inside the infinite cylinder: hit if inside the y range now, else check the caps.
    if (o[1] >= y0 && o[1] <= y1) return 0
    t = -1
  } else {
    if (a < 1e-12) return -1
    const bq = ox * d[0] + oz * d[2]
    const disc = bq * bq - a * c
    if (disc < 0) return -1
    t = (-bq - Math.sqrt(disc)) / a
    if (t >= 0 && t <= maxT) {
      const y = o[1] + d[1] * t
      if (y >= y0 && y <= y1) return t
    }
  }
  // Caps.
  if (Math.abs(d[1]) > 1e-12) {
    for (const yc of [y0, y1]) {
      const tc = (yc - o[1]) / d[1]
      if (tc < 0 || tc > maxT) continue
      const x = ox + d[0] * tc
      const z = oz + d[2] * tc
      if (x * x + z * z <= r * r) {
        if (t < 0 || tc < t) t = tc
      }
    }
    if (t >= 0 && t <= maxT) {
      const y = o[1] + d[1] * t
      if (y >= y0 - 1e-6 && y <= y1 + 1e-6) return t
    }
  }
  return -1
}

/** Ray against a sphere; returns entry t or −1 (0 when starting inside). */
export function raySphere(
  o: readonly number[],
  d: readonly number[],
  maxT: number,
  c: readonly number[],
  r: number
): number {
  const ox = o[0] - c[0]
  const oy = o[1] - c[1]
  const oz = o[2] - c[2]
  const cc = ox * ox + oy * oy + oz * oz - r * r
  if (cc <= 0) return 0
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  const b = ox * d[0] + oy * d[1] + oz * d[2]
  const disc = b * b - a * cc
  if (disc < 0 || a < 1e-12) return -1
  const t = (-b - Math.sqrt(disc)) / a
  return t >= 0 && t <= maxT ? t : -1
}

/** Uniform 2D hash for dynamic actor queries (rebuilt every tick). */
export class SpatialHash<T> {
  private readonly cells = new Map<number, T[]>()
  constructor(private readonly size: number) {}

  clear() {
    this.cells.clear()
  }

  private key(cx: number, cz: number) {
    return (cx + 32768) * 65536 + (cz + 32768)
  }

  insert(item: T, x: number, z: number) {
    const k = this.key(Math.floor(x / this.size), Math.floor(z / this.size))
    let list = this.cells.get(k)
    if (!list) {
      list = []
      this.cells.set(k, list)
    }
    list.push(item)
  }

  /** Items in cells overlapping the square (x ± r, z ± r) (callers filter exact distance). */
  query(x: number, z: number, r: number, out: T[] = []): T[] {
    const x0 = Math.floor((x - r) / this.size),
      x1 = Math.floor((x + r) / this.size)
    const z0 = Math.floor((z - r) / this.size),
      z1 = Math.floor((z + r) / this.size)
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells.get(this.key(cx, cz))
        if (list) for (const it of list) out.push(it)
      }
    }
    return out
  }
}
