/**
 * Small authoring kit for the map data: a seeded RNG, box/decor helpers (ground tiles, buildings, stairs made of
 * stacked boxes, crates, cars, containers…) and a MapDef assembler. Everything is deterministic for a given seed.
 *
 * Conventions: x/z are the ground plane, y is up, ground tops are at y = 0. Cardinal names used in the map files:
 * north = +z, south = −z, east = +x, west = −x. Yaw 0 faces +z (north), yaw π/2 faces +x (east).
 */
import type { DecorKind } from '../../data/map-vocab'
import type { BoxKind, FoeSpawnPoint, MapBox, MapDecor, MapDef, MapId, MapTheme, Surface, TeamId, V3 } from '../types'

/** Maximum rise of one stair step (physics steps up ≤ 0.45 m). */
export const STEP = 0.4
/** Depth of one stair step. */
export const STEP_DEPTH = 0.7

export type Dir = 'n' | 's' | 'e' | 'w'
/** Unit vector per direction on the ground plane. */
export const DIR: Record<Dir, [number, number]> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }
/** Yaw that faces a direction. */
export const YAW: Record<Dir, number> = { n: 0, s: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r2 = (v: number): number => Math.round(v * 100) / 100

/** Yaw facing from a point toward another (ground plane). */
export function yawTo(fx: number, fz: number, tx: number, tz: number): number {
  return r2(Math.atan2(tx - fx, tz - fz))
}

export interface BoxOpts {
  style?: number
  solid?: boolean
  surface?: Surface
}

export class MapBuilder {
  readonly boxes: MapBox[] = []
  readonly decor: MapDecor[] = []
  readonly spawns: MapDef['spawns'] = []
  readonly bases: MapDef['bases'] = []
  readonly foeSpawns: FoeSpawnPoint[] = []
  readonly pads: MapDef['pads'] = []
  readonly anchors: Record<string, V3> = {}
  readonly paths: Record<string, V3[]> = {}
  readonly rand: () => number
  private foeCount = 0

  constructor(
    readonly id: MapId,
    readonly name: string,
    readonly theme: MapTheme,
    readonly bounds: { min: [number, number]; max: [number, number] },
    seed: number
  ) {
    this.rand = rng(seed)
  }

  /** Uniform float in [a, b). */
  r(a: number, b: number): number {
    return a + (b - a) * this.rand()
  }
  /** Uniform integer in [a, b]. */
  ri(a: number, b: number): number {
    return Math.floor(this.r(a, b + 1))
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)]
  }
  chance(p: number): boolean {
    return this.rand() < p
  }

  /** Raw box from two corners (any order). */
  box(kind: BoxKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BoxOpts = {}): MapBox {
    const b: MapBox = {
      min: [r2(Math.min(x0, x1)), r2(Math.min(y0, y1)), r2(Math.min(z0, z1))],
      max: [r2(Math.max(x0, x1)), r2(Math.max(y0, y1)), r2(Math.max(z0, z1))],
      kind
    }
    if (o.style !== undefined && o.style !== 0) b.style = o.style
    if (o.solid === false) b.solid = false
    if (o.surface) b.surface = o.surface
    this.boxes.push(b)
    return b
  }

  /** Box centred on (cx, cz) with footprint w (x) × d (z), from y0 up to y0 + h. */
  boxC(kind: BoxKind, cx: number, cz: number, w: number, d: number, y0: number, h: number, o: BoxOpts = {}): MapBox {
    return this.box(kind, cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, o)
  }

  /** Thin floor tile with its top at `top` (default 0). */
  ground(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    style = 0,
    kind: 'ground' | 'road' = 'ground',
    top = 0
  ): MapBox {
    return this.box(kind, x0, top - 0.3, z0, x1, top, z1, { style })
  }

  /** Base layer under everything else, 2 cm lower so the tiles laid on it never z-fight. */
  baseGround(style: number, x1 = this.bounds.max[0]): MapBox {
    const { min, max } = this.bounds
    return this.box('ground', min[0], -0.32, min[1], x1, -0.02, max[1], { style })
  }

  /** Water surface (not solid) at `top` over [x0,x1]×[z0,z1], with a solid sea bed `depth` below it. */
  water(x0: number, z0: number, x1: number, z1: number, top = -0.15, bed = -0.9): void {
    this.box('ground', x0, bed - 0.3, z0, x1, bed, z1, { style: 2 })
    this.box('ground', x0, bed, z0, x1, top, z1, { style: 7, solid: false })
  }

  /** Invisible walls that close the map on all four sides. */
  closeBounds(height = 60): void {
    const { min, max } = this.bounds
    const t = 2
    this.box('barrier', min[0] - t, -5, min[1] - t, min[0], height, max[1] + t)
    this.box('barrier', max[0], -5, min[1] - t, max[0] + t, height, max[1] + t)
    this.box('barrier', min[0], -5, min[1] - t, max[0], height, min[1])
    this.box('barrier', min[0], -5, max[1], max[0], height, max[1] + t)
  }

  /**
   * Building block with its roof at `h`. Adds rooftop dressing (AC units, water tanks, antennas) for tall flat
   * roofs. Returns the box.
   */
  building(cx: number, cz: number, w: number, d: number, h: number, style: number, y0 = 0, dress = true): MapBox {
    const b = this.boxC('building', cx, cz, w, d, y0, h, { style })
    if (dress && h >= 6 && style !== 3 && style !== 6 && style !== 7) {
      const top = y0 + h
      const n = w * d > 200 ? 2 : 1
      for (let i = 0; i < n; i++) {
        const kind: DecorKind = this.pick(['acunit', 'acunit', 'watertank', 'antenna'] as const)
        this.deco(kind, cx + this.r(-w / 2 + 1.5, w / 2 - 1.5), top, cz + this.r(-d / 2 + 1.5, d / 2 - 1.5), {
          yaw: this.pick([0, Math.PI / 2])
        })
      }
    }
    return b
  }

  /**
   * Straight flight of stairs made of stacked boxes, climbing from y0 to y1 in direction `dir`, starting with its
   * bottom edge centred on (x, z). Every step rises ≤ STEP. Returns the top edge centre (where the flight ends).
   */
  stairs(x: number, z: number, dir: Dir, y0: number, y1: number, width = 2.6, style = 0, base = y0): [number, number] {
    const n = Math.max(1, Math.ceil((y1 - y0) / STEP - 1e-6))
    const rise = (y1 - y0) / n
    const [dx, dz] = DIR[dir]
    const px = -dz
    const pz = dx
    for (let i = 0; i < n; i++) {
      const a = i * STEP_DEPTH
      const b = (i + 1) * STEP_DEPTH
      const ax = x + dx * a + (px * width) / 2
      const az = z + dz * a + (pz * width) / 2
      const bx = x + dx * b - (px * width) / 2
      const bz = z + dz * b - (pz * width) / 2
      this.box('stairs', ax, base, az, bx, y0 + rise * (i + 1), bz, { style })
    }
    return [x + dx * n * STEP_DEPTH, z + dz * n * STEP_DEPTH]
  }

  /** Horizontal length a flight from y0 to y1 needs. */
  static run(y0: number, y1: number): number {
    return Math.max(1, Math.ceil((y1 - y0) / STEP - 1e-6)) * STEP_DEPTH
  }

  /** Box resting on the ground at (cx, cz). */
  crate(cx: number, cz: number, s = 1.2, style = 0, y0 = 0): MapBox {
    return this.boxC('crate', cx, cz, s, s, y0, s, { style })
  }

  /** Car oriented along x (`alongX`) or z. */
  car(cx: number, cz: number, alongX: boolean, style = 0): MapBox {
    const dims: Record<number, [number, number, number]> = {
      0: [1.8, 4.3, 1.4],
      1: [2.0, 4.9, 2.1],
      2: [2.6, 10.5, 3.1],
      3: [2.1, 6.2, 2.6]
    }
    const [w, l, h] = dims[style] ?? dims[0]
    return this.boxC('car', cx, cz, alongX ? l : w, alongX ? w : l, 0, h, { style })
  }

  /** One container (20 ft or 40 ft) lying along x or z, at tier `tier` (0 = on the ground). */
  container(cx: number, cz: number, alongX: boolean, long: boolean, tier: number, style: number, y0 = 0): MapBox {
    const l = long ? 12.2 : 6.1
    const w = 2.44
    const h = 2.6
    return this.boxC('container', cx, cz, alongX ? l : w, alongX ? w : l, y0 + tier * h, h, { style })
  }

  /** Low wall segment between two points on a line along x or z. */
  wallLine(x0: number, z0: number, x1: number, z1: number, h: number, t: number, style: number, y0 = 0): MapBox {
    if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) {
      const z = (z0 + z1) / 2
      return this.box('wall', x0, y0, z - t / 2, x1, y0 + h, z + t / 2, { style })
    }
    const x = (x0 + x1) / 2
    return this.box('wall', x - t / 2, y0, z0, x + t / 2, y0 + h, z1, { style })
  }

  /** Tree trunk + canopy as one solid trunk box (the renderer draws the canopy from the style). */
  tree(cx: number, cz: number, style: number, s = 1): MapBox {
    const w = 0.6 * s
    return this.boxC('tree', cx, cz, w, w, 0, 4.5 * s, { style })
  }

  /** Adds decor unless its anchor point would be buried in a solid box (then it is silently skipped). */
  deco(kind: DecorKind, x: number, y: number, z: number, o: { yaw?: number; s?: number; style?: number } = {}): void {
    if (this.buried(x, y + 0.3, z)) return
    const d: MapDecor = { kind, p: [r2(x), r2(y), r2(z)] }
    if (o.yaw !== undefined && o.yaw !== 0) d.yaw = r2(o.yaw)
    if (o.s !== undefined && o.s !== 1) d.s = r2(o.s)
    if (o.style !== undefined && o.style !== 0) d.style = o.style
    this.decor.push(d)
  }

  /** True when (x, y, z) lies strictly inside a solid, non-floor box. */
  buried(x: number, y: number, z: number): boolean {
    return this.boxes.some(
      (b) =>
        b.solid !== false &&
        b.kind !== 'barrier' &&
        x > b.min[0] + 0.02 &&
        x < b.max[0] - 0.02 &&
        y > b.min[1] &&
        y < b.max[1] &&
        z > b.min[2] + 0.02 &&
        z < b.max[2] - 0.02
    )
  }

  /** Scatter `n` decor items of the given kinds in a rectangle at height y. */
  scatter(kinds: readonly DecorKind[], n: number, x0: number, z0: number, x1: number, z1: number, y = 0): void {
    for (let i = 0; i < n; i++) {
      this.deco(this.pick(kinds), this.r(x0, x1), y, this.r(z0, z1), {
        yaw: this.r(-Math.PI, Math.PI),
        s: this.r(0.8, 1.3)
      })
    }
  }

  /** True when no solid box (other than floors) intrudes the column of radius r from y0 to y0 + h at (x, z). */
  clear(x: number, z: number, r: number, y0 = 0, h = 2.5): boolean {
    return !this.boxes.some(
      (b) =>
        b.solid !== false &&
        b.max[1] > y0 + 0.05 &&
        b.min[1] < y0 + h &&
        b.min[0] < x + r &&
        b.max[0] > x - r &&
        b.min[2] < z + r &&
        b.max[2] > z - r
    )
  }

  /** Nearest point to (x, z) (spiral search up to 12 m) whose column is clear; falls back to (x, z). */
  findFree(x: number, z: number, r = 1.2, y0 = 0): [number, number] {
    const { min, max } = this.bounds
    for (let d = 0; d <= 12; d += 0.75) {
      const n = d === 0 ? 1 : Math.ceil((d * Math.PI * 2) / 1.5)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const px = x + Math.sin(a) * d
        const pz = z + Math.cos(a) * d
        if (px < min[0] + 2 || px > max[0] - 2 || pz < min[1] + 2 || pz > max[1] - 2) continue
        if (this.clear(px, pz, r, y0)) return [r2(px), r2(pz)]
      }
    }
    return [x, z]
  }

  spawn(team: TeamId | 'squad', x: number, y: number, z: number, yaw: number): void {
    this.spawns.push({ team, p: [r2(x), r2(y), r2(z)], yaw: r2(yaw) })
  }

  /** Squad/team base with `n` spawns on a ring of radius `ring`, facing `face`. */
  base(
    team: TeamId | 'squad',
    x: number,
    y: number,
    z: number,
    r: number,
    n: number,
    ring: number,
    face: number
  ): void {
    this.bases.push({ team, p: [r2(x), r2(y), r2(z)], r })
    for (let i = 0; i < n; i++) {
      const a = face + Math.PI / 2 + (Math.PI * (i + 0.5)) / n
      this.spawn(team, x + Math.sin(a) * ring, y, z + Math.cos(a) * ring, face)
    }
  }

  foe(tags: string[], x: number, y: number, z: number, air = false): void {
    const f: FoeSpawnPoint = { id: `${tags[0]}${++this.foeCount}`, p: [r2(x), r2(y), r2(z)], tags }
    if (air) f.air = true
    this.foeSpawns.push(f)
  }

  pad(x: number, y: number, z: number, yaw: number): void {
    this.pads.push({ p: [r2(x), r2(y), r2(z)], yaw: r2(yaw) })
  }

  anchor(name: string, x: number, y: number, z: number): void {
    this.anchors[name] = [r2(x), r2(y), r2(z)]
  }

  path(name: string, pts: [number, number, number][]): void {
    this.paths[name] = pts.map(([x, y, z]) => [r2(x), r2(y), r2(z)])
  }

  build(): MapDef {
    // Drop dressing that ended up outside the map or inside geometry added after it.
    const { min, max } = this.bounds
    const decor = this.decor.filter(
      (d) =>
        d.p[0] > min[0] &&
        d.p[0] < max[0] &&
        d.p[2] > min[1] &&
        d.p[2] < max[1] &&
        !this.buried(d.p[0], d.p[1] + 0.3, d.p[2])
    )
    return {
      id: this.id,
      name: this.name,
      theme: this.theme,
      bounds: this.bounds,
      boxes: this.boxes,
      spawns: this.spawns,
      bases: this.bases,
      foeSpawns: this.foeSpawns,
      pads: this.pads,
      anchors: this.anchors,
      paths: this.paths,
      decor
    }
  }
}

/** Deep-freezes a built map so callers can share one cached instance. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
  }
  return o
}
