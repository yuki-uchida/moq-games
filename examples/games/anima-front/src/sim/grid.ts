/**
 * Ground navigation grid shared by foe flow fields and bot A*: 2 m cells over the map bounds, blocked where a
 * solid box taller than a step stands on the ground. Built lazily once per world (static boxes only).
 */
import { FLOW_CELL } from './constants'
import type { Physics } from './physics'
import type { Sim } from './state'

export class NavGrid {
  readonly cell = FLOW_CELL
  readonly w: number
  readonly h: number
  readonly minX: number
  readonly minZ: number
  /** 1 = blocked. */
  readonly blocked: Uint8Array

  constructor(phys: Physics) {
    this.minX = phys.minX
    this.minZ = phys.minZ
    this.w = Math.max(1, Math.ceil((phys.maxX - phys.minX) / this.cell))
    this.h = Math.max(1, Math.ceil((phys.maxZ - phys.minZ) / this.cell))
    this.blocked = new Uint8Array(this.w * this.h)
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        const cx = this.minX + (x + 0.5) * this.cell
        const cz = this.minZ + (z + 0.5) * this.cell
        if (phys.blockedAt(cx, cz, this.cell * 0.35)) this.blocked[z * this.w + x] = 1
      }
    }
  }

  cx(x: number) {
    return Math.min(this.w - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)))
  }
  cz(z: number) {
    return Math.min(this.h - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)))
  }
  index(x: number, z: number) {
    return this.cz(z) * this.w + this.cx(x)
  }
  /** World x/z of a cell centre. */
  centerX(i: number) {
    return this.minX + ((i % this.w) + 0.5) * this.cell
  }
  centerZ(i: number) {
    return this.minZ + (Math.floor(i / this.w) + 0.5) * this.cell
  }
  open(i: number) {
    return i >= 0 && i < this.blocked.length && this.blocked[i] === 0
  }

  /** Nearest open cell to i (breadth-first), or i itself when nothing is open. */
  nearestOpen(i: number): number {
    if (this.open(i)) return i
    const seen = new Uint8Array(this.blocked.length)
    const q = [i]
    seen[i] = 1
    for (let k = 0; k < q.length && k < 4000; k++) {
      const c = q[k]
      if (this.blocked[c] === 0) return c
      const x = c % this.w
      const z = Math.floor(c / this.w)
      const nb = [
        x > 0 ? c - 1 : -1,
        x < this.w - 1 ? c + 1 : -1,
        z > 0 ? c - this.w : -1,
        z < this.h - 1 ? c + this.w : -1
      ]
      for (const n of nb) {
        if (n >= 0 && !seen[n]) {
          seen[n] = 1
          q.push(n)
        }
      }
    }
    return i
  }

  /** True when the straight line between two world points crosses only open cells (sampled every half cell). */
  lineOpen(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.ceil(d / (this.cell * 0.5)))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      if (!this.open(this.index(ax + (bx - ax) * t, az + (bz - az) * t))) return false
    }
    return true
  }
}

export function navGrid(sim: Sim): NavGrid {
  if (!sim.nav) sim.nav = new NavGrid(sim.phys)
  return sim.nav as NavGrid
}
