/**
 * Tile collision shared by the host world and the guest predictor: terrain walk/air flags, static solid decoration,
 * dynamic solid props (rebuilt every tick from prop states), circle movement with push-out, line tests and A*.
 */
import { TILE, TILE_KINDS, type TileKind } from '../vocab'
import { SOLID_DECOR, footOf } from './stage-data'
import type { PropView, StageInfo } from './types'

export class Grid {
  readonly w: number
  readonly h: number
  readonly walk: Uint8Array
  readonly air: Uint8Array
  /** Water/pit tiles a block can sink into. */
  readonly sink: Uint8Array
  readonly staticSolid: Uint8Array
  /** Dynamic solid props (count per tile). */
  readonly solid: Uint8Array
  /** Bounce mushroom tiles. */
  readonly bounce: Uint8Array
  /** Filled water/pit tile indices (sunk blocks). */
  readonly fills = new Set<number>()
  /** Current push per tile (px/s) and its channel index (−1 = none). */
  readonly flowX: Float32Array
  readonly flowY: Float32Array
  readonly flowChan: Int16Array
  readonly channels: { channel: string; dx: number; dy: number; speed: number; tiles: number[]; strong?: boolean }[]
  /** Strong current tiles (formations do not resist them). */
  readonly flowStrong: Uint8Array
  /** Wind push per tile (px/s at full strength, for flyers). */
  readonly windX: Float32Array
  readonly windY: Float32Array
  /** Vent tiles (updrafts) and drawbridge tiles that are down (walkable). */
  readonly vent: Uint8Array
  readonly bridged: Uint8Array
  /** Ice floor (slippery; ice blocks keep sliding on it). */
  readonly ice: Uint8Array
  /**
   * Arena barrier: the ring of tiles just outside each active arena room, blocked for walkers and flyers alike
   * (shots still fly over it). Set from the arena state on the host and from View.barrier on guests.
   */
  readonly barrier: Uint8Array
  /** Rooms (tile rects) whose barrier is up, and their ids joined (change key). */
  barrierRooms: readonly { x: number; y: number; w: number; h: number }[] = []
  barrierKey = ''
  private readonly baseWalk: Uint8Array
  /** Mouse holes: hole tile → exit tile next to its partner; exit tile → direction out of the hole. */
  readonly holeExit = new Map<number, number>()
  readonly holeDir = new Map<number, [number, number]>()
  /** Entry tile (walkable, next to a hole) → [hole tile, exit tile]. */
  readonly holeEntry = new Map<number, [number, number][]>()

  constructor(info: StageInfo) {
    this.w = info.w
    this.h = info.h
    const n = info.w * info.h
    this.walk = new Uint8Array(n)
    this.air = new Uint8Array(n)
    this.sink = new Uint8Array(n)
    this.ice = new Uint8Array(n)
    this.staticSolid = new Uint8Array(n)
    this.solid = new Uint8Array(n)
    this.bounce = new Uint8Array(n)
    this.barrier = new Uint8Array(n)
    info.tiles.forEach((k: TileKind, i) => {
      this.walk[i] = TILE_KINDS[k].walk ? 1 : 0
      this.air[i] = TILE_KINDS[k].air ? 1 : 0
      this.sink[i] = k === 'water' || k === 'pit' || k === 'sludge' ? 1 : 0
      this.ice[i] = k === 'ice' ? 1 : 0
    })
    this.flowX = new Float32Array(n)
    this.flowY = new Float32Array(n)
    this.flowChan = new Int16Array(n).fill(-1)
    this.flowStrong = new Uint8Array(n)
    this.windX = new Float32Array(n)
    this.windY = new Float32Array(n)
    for (const wz of info.winds ?? [])
      for (let y = wz.y; y < wz.y + wz.h; y++)
        for (let x = wz.x; x < wz.x + wz.w; x++)
          if (this.inside(x, y)) {
            this.windX[this.idx(x, y)] = wz.dx * wz.strength
            this.windY[this.idx(x, y)] = wz.dy * wz.strength
          }
    this.vent = new Uint8Array(n)
    this.bridged = new Uint8Array(n)
    this.baseWalk = this.walk.slice()
    this.channels = info.currents ?? []
    this.setStopped([])
    for (const [a, b] of info.holes ?? []) {
      for (const [from, to] of [
        [a, b],
        [b, a]
      ]) {
        const out = this.holeOut(to)
        const inn = this.holeOut(from)
        if (!out || !inn) continue
        this.holeExit.set(from, out[0])
        this.holeDir.set(out[0], [out[1], out[2]])
        const list = this.holeEntry.get(inn[0]) ?? []
        list.push([from, out[0]])
        this.holeEntry.set(inn[0], list)
      }
    }
    const mark = (kind: string, x: number, y: number) => {
      const [fw, fh] = footOf(kind)
      const tx0 = Math.round((x - (fw * TILE) / 2) / TILE)
      const ty0 = Math.round((y - (fh * TILE) / 2) / TILE)
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) this.staticSolid[this.idx(tx0 + i, ty0 + j)] = 1
    }
    for (const d of info.decor) if (SOLID_DECOR.has(d.kind)) mark(d.kind, d.x, d.y)
    for (const npc of info.npcs) mark('npc', npc.x, npc.y)
  }

  /** The walkable 4-neighbour of a hole tile and the direction out of it. */
  private holeOut(hole: number): [number, number, number] | undefined {
    const hx = hole % this.w
    const hy = Math.floor(hole / this.w)
    for (const [dx, dy] of DIR8.slice(0, 4))
      if (this.inside(hx + dx, hy + dy) && this.walk[this.idx(hx + dx, hy + dy)])
        return [this.idx(hx + dx, hy + dy), dx, dy]
    return undefined
  }

  /** Stops the listed current channels (sluices); the others push again. */
  setStopped(ids: readonly string[]): void {
    this.flowX.fill(0)
    this.flowY.fill(0)
    this.channels.forEach((c, ci) => {
      for (const i of c.tiles) {
        this.flowChan[i] = ci
        this.flowStrong[i] = c.strong ? 1 : 0
        if (ids.includes(c.channel)) continue
        this.flowX[i] = c.dx * c.speed
        this.flowY[i] = c.dy * c.speed
      }
    })
  }

  /** Raises the barrier around these rooms (ids from `rooms`; empty lowers it). */
  setBarrier(
    ids: readonly string[],
    rooms: readonly { id: string; x: number; y: number; w: number; h: number }[]
  ): void {
    const key = ids.join()
    if (key === this.barrierKey) return
    this.barrierKey = key
    this.barrier.fill(0)
    this.barrierRooms = ids.flatMap((id) => rooms.filter((r) => r.id === id))
    for (const r of this.barrierRooms)
      for (const [tx, ty] of ringOf(r)) if (this.inside(tx, ty)) this.barrier[this.idx(tx, ty)] = 1
  }

  /** Whether (x, y) and (x2, y2) lie on opposite sides of a raised barrier. */
  crossesBarrier(x: number, y: number, x2: number, y2: number): boolean {
    return this.barrierRooms.some((r) => inRoom(r, x, y) !== inRoom(r, x2, y2))
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx
  }
  inside(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h
  }

  fill(i: number): void {
    this.baseWalk[i] = 1
    this.fills.add(i)
    this.walk[i] = 1
    this.sink[i] = 0
  }

  /** Terrain walkable (ignoring props). */
  walkable(tx: number, ty: number): boolean {
    return this.inside(tx, ty) && this.walk[this.idx(tx, ty)] === 1
  }

  /** Blocked for a circle at this height (airborne passes over `air` terrain but never over solids). */
  blocked(tx: number, ty: number, airborne: boolean): boolean {
    if (!this.inside(tx, ty)) return true
    const i = this.idx(tx, ty)
    if (this.staticSolid[i] || this.solid[i] || this.barrier[i]) return true
    if (this.walk[i]) return false
    return !(airborne && this.air[i])
  }

  /** Free ground tile: walkable terrain without solids. */
  free(tx: number, ty: number): boolean {
    return !this.blocked(tx, ty, false)
  }

  /** Projectiles fly over air tiles and stop at walls and solids. */
  shotBlocked(x: number, y: number): boolean {
    const tx = Math.floor(x / TILE)
    const ty = Math.floor(y / TILE)
    if (!this.inside(tx, ty)) return true
    const i = this.idx(tx, ty)
    return !!(this.staticSolid[i] || this.solid[i]) || (!this.walk[i] && !this.air[i])
  }

  /** Rebuilds the dynamic solid layer from prop views (host: its own props; guest: the latest snapshot). */
  setSolidProps(props: readonly Pick<PropView, 'kind' | 'state' | 'x' | 'y' | 'from' | 'to'>[]): void {
    this.solid.fill(0)
    this.bounce.fill(0)
    this.vent.fill(0)
    this.bridged.fill(0)
    this.walk.set(this.baseWalk)
    for (const p of props) {
      if (p.kind === 'vent' || p.kind === 'drawbridge') {
        const tx = Math.floor(p.x / TILE)
        const ty = Math.floor(p.y / TILE)
        if (!this.inside(tx, ty)) continue
        const i = this.idx(tx, ty)
        if (p.kind === 'vent') this.vent[i] = 1
        else if (p.state === 'down') (this.bridged[i] = 1), (this.walk[i] = 1)
        continue
      }
      if (p.kind === 'bounce') {
        const tx = Math.floor(p.x / TILE)
        const ty = Math.floor(p.y / TILE)
        if (this.inside(tx, ty)) this.bounce[this.idx(tx, ty)] = 1
        continue
      }
      if (!propSolid(p.kind, p.state)) continue
      const [fw, fh] = footOf(p.kind)
      const centres = p.from && p.to ? [p.from, p.to] : [[p.x, p.y] as [number, number]]
      for (const [cx, cy] of centres) {
        const tx0 = Math.round((cx - (fw * TILE) / 2) / TILE)
        const ty0 = Math.round((cy - (fh * TILE) / 2) / TILE)
        for (let j = 0; j < fh; j++)
          for (let i = 0; i < fw; i++) if (this.inside(tx0 + i, ty0 + j)) this.solid[this.idx(tx0 + i, ty0 + j)]++
      }
    }
  }

  /** True when a circle overlaps any blocked tile. */
  overlaps(x: number, y: number, r: number, airborne: boolean): boolean {
    const x0 = Math.floor((x - r) / TILE)
    const x1 = Math.floor((x + r - 0.001) / TILE)
    const y0 = Math.floor((y - r) / TILE)
    const y1 = Math.floor((y + r - 0.001) / TILE)
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.blocked(tx, ty, airborne)) continue
        const nx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE))
        const ny = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE))
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r - 0.01) return true
      }
    return false
  }

  /**
   * Moves a circle by (dx, dy) in sub-steps, pushing it out of blocked tiles (slides along walls and corners).
   * Returns the new position and whether the movement was obstructed.
   */
  move(
    x: number,
    y: number,
    dx: number,
    dy: number,
    r: number,
    airborne: boolean
  ): { x: number; y: number; hit: boolean } {
    const dist = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.ceil(dist / 8))
    let hit = false
    for (let s = 0; s < steps; s++) {
      const tx = x + dx / steps
      const ty = y + dy / steps
      const out = this.pushOut(tx, ty, r, airborne)
      if (out.moved) hit = true
      x = out.x
      y = out.y
    }
    return { x, y, hit }
  }

  pushOut(x: number, y: number, r: number, airborne: boolean): { x: number; y: number; moved: boolean } {
    let moved = false
    for (let iter = 0; iter < 3; iter++) {
      let any = false
      const x0 = Math.floor((x - r) / TILE)
      const x1 = Math.floor((x + r) / TILE)
      const y0 = Math.floor((y - r) / TILE)
      const y1 = Math.floor((y + r) / TILE)
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.blocked(tx, ty, airborne)) continue
          const left = tx * TILE
          const top = ty * TILE
          const nx = Math.max(left, Math.min(x, left + TILE))
          const ny = Math.max(top, Math.min(y, top + TILE))
          let ddx = x - nx
          let ddy = y - ny
          const d2 = ddx * ddx + ddy * ddy
          if (d2 >= r * r) continue
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2)
            x += (ddx / d) * (r - d)
            y += (ddy / d) * (r - d)
          } else {
            // Centre inside the tile: leave through the nearest free side.
            const opts: [number, number, number][] = [
              [x - left + r, -1, 0],
              [left + TILE - x + r, 1, 0],
              [y - top + r, 0, -1],
              [top + TILE - y + r, 0, 1]
            ]
            opts.sort((a, b) => a[0] - b[0])
            const pick = opts.find(([, ox, oy]) => !this.blocked(tx + ox, ty + oy, airborne)) ?? opts[0]
            ddx = pick[1] * pick[0]
            ddy = pick[2] * pick[0]
            x += ddx
            y += ddy
          }
          any = true
          moved = true
        }
      if (!any) break
    }
    return { x, y, moved }
  }

  /** Clear straight line for walking (sampled every 16 px with a radius). */
  lineClear(x0: number, y0: number, x1: number, y1: number, r = 14): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(d / 16))
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n
      const y = y0 + ((y1 - y0) * i) / n
      if (this.overlaps(x, y, r, false)) return false
    }
    return true
  }

  /**
   * A* on the tile grid (4-neighbour, plus diagonals without corner cutting). `jump` adds slime hops over one
   * air tile (water, pit, fence, spikes). Returns tile indices from start (exclusive) to goal, with jump hops
   * marked negative (−(index + 1)). `holes` adds rat dashes through mouse holes, marked ≤ HOLE_STEP
   * (HOLE_STEP − exit index). Undefined when unreachable within `limit` expansions.
   */
  path(
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    jump: boolean,
    limit = 4000,
    holes = false,
    fly = false
  ): number[] | undefined {
    if (!this.inside(sx, sy) || !this.inside(gx, gy)) return undefined
    const start = this.idx(sx, sy)
    const goal = this.idx(gx, gy)
    if (start === goal) return []
    const g = new Map<number, number>([[start, 0]])
    const came = new Map<number, number>()
    const hop = new Map<number, 'hop' | 'hole' | 'fly'>()
    const open: [number, number][] = [[0, start]]
    const hcost = (i: number) => Math.hypot((i % this.w) - gx, Math.floor(i / this.w) - gy)
    let expanded = 0
    while (open.length && expanded++ < limit) {
      let bi = 0
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i
      const [, cur] = open[bi]
      open[bi] = open[open.length - 1]
      open.pop()
      if (cur === goal) {
        const out: number[] = []
        let c = goal
        while (c !== start) {
          const k = hop.get(c)
          out.push(k === 'hop' ? -(c + 1) : k === 'hole' ? HOLE_STEP - c : k === 'fly' ? FLY_STEP - c : c)
          c = came.get(c)!
        }
        return out.reverse()
      }
      const cx = cur % this.w
      const cy = Math.floor(cur / this.w)
      const gc = g.get(cur)!
      const tryNode = (nx: number, ny: number, cost: number, isHop: false | 'hop' | 'hole' | 'fly') => {
        const ni = this.idx(nx, ny)
        const ng = gc + cost
        if (ng >= (g.get(ni) ?? Infinity)) return
        g.set(ni, ng)
        came.set(ni, cur)
        if (isHop) hop.set(ni, isHop)
        else hop.delete(ni)
        open.push([ng + hcost(ni), ni])
      }
      for (const [dx, dy] of DIR8) {
        const nx = cx + dx
        const ny = cy + dy
        const goalTile = nx === gx && ny === gy
        if (!this.free(nx, ny) && !goalTile) {
          // Slime hop over a single air tile.
          if (jump && dx * dy === 0 && this.inside(nx, ny)) {
            const mid = this.idx(nx, ny)
            const hx = cx + 2 * dx
            const hy = cy + 2 * dy
            if (
              !this.walk[mid] &&
              this.air[mid] &&
              !this.staticSolid[mid] &&
              !this.solid[mid] &&
              !this.barrier[mid] &&
              this.free(hx, hy)
            )
              tryNode(hx, hy, 3, 'hop')
          }
          continue
        }
        if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue
        tryNode(nx, ny, dx && dy ? 1.414 : 1, false)
      }
      if (holes)
        for (const [, exit] of this.holeEntry.get(cur) ?? [])
          if (this.free(exit % this.w, Math.floor(exit / this.w)))
            tryNode(exit % this.w, Math.floor(exit / this.w), 3, 'hole')
      // Crow flight: straight hops of up to FLY_TILES over air tiles, landing on ground or on a vent (which refills).
      if (fly && (this.free(cx, cy) || this.vent[cur]))
        for (const [dx, dy] of DIR8)
          for (let k = 2; k <= FLY_TILES; k++) {
            const mx = cx + dx * (k - 1)
            const my = cy + dy * (k - 1)
            if (this.blocked(mx, my, true)) break
            const nx = cx + dx * k
            const ny = cy + dy * k
            if (!this.inside(nx, ny) || this.blocked(nx, ny, true)) break
            let gap = false
            for (let j = 1; j < k; j++) if (!this.walk[this.idx(cx + dx * j, cy + dy * j)]) gap = true
            if (!gap) continue
            if (this.free(nx, ny) || this.vent[this.idx(nx, ny)]) tryNode(nx, ny, k * (dx && dy ? 1.7 : 1.2) + 1, 'fly')
          }
    }
    return undefined
  }
}

/** Tiles of the ring just outside a room rect (clockwise from the north-west corner). */
export function ringOf(r: { x: number; y: number; w: number; h: number }): [number, number][] {
  const out: [number, number][] = []
  for (let x = r.x - 1; x <= r.x + r.w; x++) out.push([x, r.y - 1])
  for (let y = r.y; y < r.y + r.h; y++) out.push([r.x + r.w, y])
  for (let x = r.x + r.w; x >= r.x - 1; x--) out.push([x, r.y + r.h])
  for (let y = r.y + r.h - 1; y >= r.y; y--) out.push([r.x - 1, y])
  return out
}

/** Whether a world position (px) lies inside a room's tile rect. */
export function inRoom(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  const tx = Math.floor(x / TILE)
  const ty = Math.floor(y / TILE)
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h
}

/** Path steps at or below this value are mouse-hole dashes (see Grid.path). */
export const HOLE_STEP = -10_000_000
/** Path steps at or below this value are crow flights (FLY_STEP − landing index). */
export const FLY_STEP = -20_000_000
/** Longest crow flight edge for path-finding (tiles, centre to centre). */
export const FLY_TILES = 5

const DIR8: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
]

/** Whether a prop in this state blocks movement (shared by host and predictor). */
export function propSolid(kind: string, state: string): boolean {
  switch (kind) {
    case 'block':
    case 'boulder':
    case 'iceblock':
    case 'log':
    case 'crate':
    case 'bigcrate':
    case 'acorn':
    case 'cheese':
      return state === 'idle' || state === 'sliding' || state === 'gripped'
    case 'pot':
    case 'barrel':
      return state === 'idle'
    case 'barricade':
      return state === 'idle'
    case 'sluice':
    case 'valve':
    case 'scale':
    case 'windmill':
    case 'bell':
    case 'hook':
      return true
    case 'goldbell':
      return state === 'idle' || state === 'gripped'
    case 'lockdoor':
      return state !== 'open'
    case 'icewall':
      return state === 'idle'
    case 'moonstone':
    case 'bigmoon':
    case 'ramslot':
    case 'snowpile':
      return kind !== 'snowpile' || state === 'idle'
    case 'gate':
    case 'bossdoor':
      return state !== 'open'
    case 'crackrock':
      return state === 'idle'
    case 'chest':
    case 'crystal':
    case 'lever':
    case 'pedestal':
      return true
    default:
      return false
  }
}
