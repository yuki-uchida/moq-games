/**
 * The map engine shared by the host simulation, every renderer and the minimap. It answers queries about
 * the active stage's map (`setStage`); the data exports are live bindings that follow the active stage.
 * Each stage map is built once, on first use, from constants and fixed seeds, so no map data crosses the relay.
 */
import type { FoodKind } from './food'
import type { PredatorKind } from './stealth'
import { buildMap as house } from './stages/house/map'
import { buildMap as town } from './stages/town/map'
import { buildMap as waterway } from './stages/waterway/map'
import { buildMap as forest } from './stages/forest/map'
import { inRect, segmentDistance, smoothstep, type Circle, type Point, type Rect } from './stages/kit'
import { RAISED_FOOD, TUNNEL_DEPTH, WATER_LEVEL } from './stages/kit'

export { RAISED_FOOD, TUNNEL_DEPTH, WATER_LEVEL, segmentDistance, smoothstep }
export type { Circle, PredatorKind, Point, Rect }
export const DEEP_WATER = 0.7 // rabbits and land predators cannot wade deeper than this
export const TUNNEL_RADIUS = 0.85
export const CHAMBER_RADIUS = 1.7
export const MAX_PREDATORS = 30

export type Blocker = Circle & { top: number; kind: 'tree' | 'rock' }
export type Capsule = { ax: number; az: number; bx: number; bz: number; r: number }
export type Log = Capsule & { bottom: number }
export type Cave = Circle & {
  name: string
  wall: number
  floor: number
  roof: number
  entrances: { dx: number; dz: number; width: number }[]
}
export type TunnelNode = Point & { exit: boolean }
export type FoodSpot = Point & { y: number; place: 'ground' | 'raised' | 'tunnel'; kind: FoodKind }
export type Waypoint = Point & { wait?: number }
export type PredatorStart = Point & { kind: PredatorKind; id?: string; route?: Waypoint[]; leash?: number }
/** A roof creatures can walk under (table, sofa, parked car, bench). `bottom` is its clearance above the floor. */
export type Overhang = Rect & { bottom: number }
/** A segment that blocks everyone while its bit in `GameState.open` is clear. Bit = index in `gates`. */
export type Gate = { ax: number; az: number; bx: number; bz: number }
/** A friendly character placed on the map. `kind` picks the model in models.ts. */
export type Npc = Point & { id: string; kind: string; angle: number }
/** Cars driving a polyline at constant speed; positions depend only on time. */
export type Lane = {
  points: Point[]
  /** Closed loop; otherwise a car leaving the last point re-enters at the first. */
  loop?: boolean
  speed: number
  /** Each car's head start along the lane, in metres, and its colour. */
  cars: { offset: number; color: string }[]
  length?: number
  width?: number
  height?: number
}
/** A rectangle with a light multiplier for being seen (streetlight 1.3, darkness 0.6), a region name or a trigger id. */
export type Zone = Rect & { id?: string; name?: string; light?: number }
export type Vehicle = {
  id: string
  x: number
  z: number
  angle: number
  length: number
  width: number
  height: number
  color: string
}

export interface StageMap {
  world: Rect
  /** Height-grid spacing in metres (forest 1, rooms down to 0.25). At most 250 000 vertices. */
  cell: number
  spawn: Point
  terrain: { nx: number; nz: number; heights: Float64Array }
  foods: readonly FoodSpot[]
  nests: readonly Point[]
  predatorStarts: readonly PredatorStart[]
  grass: readonly Capsule[]
  bushes: readonly Circle[]
  trees: readonly Blocker[]
  rocks: readonly Blocker[]
  logs: readonly Log[]
  shelters: readonly Circle[]
  caves: readonly Cave[]
  tunnelNodes: readonly TunnelNode[]
  tunnelEdges: readonly (readonly [number, number])[]
  overhangs?: readonly Overhang[]
  gates?: readonly Gate[]
  npcs?: readonly Npc[]
  lanes?: readonly Lane[]
  zones?: readonly Zone[]
  /** Dust-bath ground. */
  sand?(x: number, z: number): boolean
  /** Area name shown under the minimap when no named zone covers the point. */
  region?(x: number, z: number): string
}

/** Builders in chapter order: 0 house, 1 town, 2 waterway, 3 forest. */
const BUILDERS = [house, town, waterway, forest]
export const STAGE_COUNT = BUILDERS.length
export const FOREST = 3
const built: StageMap[] = []
export const stageMap = (index: number): StageMap => (built[index] ??= BUILDERS[index]())

export let WORLD: Rect
export let SPAWN: Point
export let TERRAIN: StageMap['terrain']
export let FOODS: readonly FoodSpot[]
export let NESTS: readonly Point[]
export let PREDATOR_STARTS: readonly PredatorStart[]
export let GRASS: readonly Capsule[]
export let BUSHES: readonly Circle[]
export let TREES: readonly Blocker[]
export let ROCKS: readonly Blocker[]
export let LOGS: readonly Log[]
export let SHELTERS: readonly Circle[]
export let CAVES: readonly Cave[]
export let TUNNEL_NODES: readonly TunnelNode[]
export let TUNNEL_EDGES: readonly (readonly [number, number])[]
export let OVERHANGS: readonly Overhang[]
export let GATES: readonly Gate[]
export let NPCS: readonly Npc[]
export let LANES: readonly Lane[]
export let ZONES: readonly Zone[]
export let CELL: number
let active: StageMap
let activeIndex = -1
let NX = 0
let NZ = 0
let INVERSE = 1
let MIN_X = 0
let MIN_Z = 0
let gateMask = 0
let blockerGrid = new Map<number, Blocker[]>()
const grids = new WeakMap<StageMap, Map<number, Blocker[]>>()

export const activeStage = () => activeIndex

/** Switches every query to stage `index`, building its map on first use. Cheap when already active. */
export function setStage(index: number) {
  if (index === activeIndex) return
  if (!Number.isInteger(index) || index < 0 || index >= BUILDERS.length) throw new Error(`Unknown stage ${index}`)
  const map = stageMap(index)
  active = map
  activeIndex = index
  WORLD = map.world
  SPAWN = map.spawn
  TERRAIN = map.terrain
  FOODS = map.foods
  NESTS = map.nests
  PREDATOR_STARTS = map.predatorStarts
  GRASS = map.grass
  BUSHES = map.bushes
  TREES = map.trees
  ROCKS = map.rocks
  LOGS = map.logs
  SHELTERS = map.shelters
  CAVES = map.caves
  TUNNEL_NODES = map.tunnelNodes
  TUNNEL_EDGES = map.tunnelEdges
  OVERHANGS = map.overhangs ?? []
  GATES = map.gates ?? []
  NPCS = map.npcs ?? []
  LANES = map.lanes ?? []
  ZONES = map.zones ?? []
  CELL = map.cell
  NX = map.terrain.nx
  NZ = map.terrain.nz
  INVERSE = 1 / map.cell
  MIN_X = map.world.minX
  MIN_Z = map.world.minZ
  gateMask = 0
  let grid = grids.get(map)
  if (!grid) grids.set(map, (grid = buildBlockerGrid(map)))
  blockerGrid = grid
}

/** Which gates are open (bit i = GATES[i]); the host syncs it as `GameState.open`. */
export function setGates(mask: number) {
  gateMask = mask
}
export const gateOpen = (index: number) => (gateMask & (1 << index)) !== 0

const length = (x: number, z: number) => Math.sqrt(x * x + z * z)

export function segment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const squared = dx * dx + dz * dz
  const t = squared > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / squared)) : 0
  const x = ax + dx * t
  const z = az + dz * t
  return { t, x, z, d: length(px - x, pz - z) }
}

/** Ground height, interpolated over the same triangles (diagonal from (i, j) to (i+1, j+1)) as the mesh. */
export function heightAt(x: number, z: number): number {
  const gx = Math.min(Math.max((x - MIN_X) * INVERSE, 0), NX - 1)
  const gz = Math.min(Math.max((z - MIN_Z) * INVERSE, 0), NZ - 1)
  const i = Math.min(Math.floor(gx), NX - 2)
  const j = Math.min(Math.floor(gz), NZ - 2)
  const u = gx - i
  const v = gz - j
  const heights = TERRAIN.heights
  const h00 = heights[j * NX + i]
  const h10 = heights[j * NX + i + 1]
  const h01 = heights[(j + 1) * NX + i]
  const h11 = heights[(j + 1) * NX + i + 1]
  return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01)
}

export const waterDepth = (x: number, z: number) => WATER_LEVEL - heightAt(x, z)
export const slopeAt = (x: number, z: number) =>
  length(heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5))
export const onSand = (x: number, z: number) => !!active.sand?.(x, z)

// Uniform grid so collision and sight queries only look at nearby obstacles.
const BUCKET = 8
const cellKey = (cx: number, cz: number) => cx * 1024 + cz
function buildBlockerGrid(map: StageMap) {
  const grid = new Map<number, Blocker[]>()
  for (const blocker of [...map.trees, ...map.rocks]) {
    const reach = blocker.r + 1
    for (let cx = Math.floor((blocker.x - reach) / BUCKET); cx <= Math.floor((blocker.x + reach) / BUCKET); cx++)
      for (let cz = Math.floor((blocker.z - reach) / BUCKET); cz <= Math.floor((blocker.z + reach) / BUCKET); cz++) {
        const key = cellKey(cx, cz)
        const list = grid.get(key)
        if (list) list.push(blocker)
        else grid.set(key, [blocker])
      }
  }
  return grid
}
const none: Blocker[] = []
/** Obstacles that can overlap a body of radius ≤ 1 centred at (x, z). */
export const blockersNear = (x: number, z: number) =>
  blockerGrid.get(cellKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) ?? none

/** Trees whose trunks stand within `reach` m of (x, z); checks every grid cell the square touches. */
export function treesNear(x: number, z: number, reach: number): Blocker[] {
  const found = new Set<Blocker>()
  for (let cx = Math.floor((x - reach) / BUCKET); cx <= Math.floor((x + reach) / BUCKET); cx++)
    for (let cz = Math.floor((z - reach) / BUCKET); cz <= Math.floor((z + reach) / BUCKET); cz++)
      for (const blocker of blockerGrid.get(cellKey(cx, cz)) ?? none)
        if (blocker.kind === 'tree' && Math.hypot(blocker.x - x, blocker.z - z) < reach) found.add(blocker)
  return [...found]
}

// ---------------------------------------------------------------- spatial queries
export function hitsBlocker(x: number, z: number, radius: number): boolean {
  for (const blocker of blockersNear(x, z)) {
    const reach = blocker.r + radius
    const dx = x - blocker.x
    const dz = z - blocker.z
    if (dx * dx + dz * dz < reach * reach) return true
  }
  return false
}

const inCapsule = (x: number, z: number, capsule: Capsule, pad = 0) =>
  segmentDistance(x, z, capsule.ax, capsule.az, capsule.bx, capsule.bz) < capsule.r + pad
const inCircle = (x: number, z: number, circle: Circle, pad = 0) => {
  const dx = x - circle.x
  const dz = z - circle.z
  const reach = circle.r + pad
  return dx * dx + dz * dz < reach * reach
}
// Plain loops: these run for every creature on every tick, so they avoid per-call closures.
export function inGrass(x: number, z: number): boolean {
  for (const patch of GRASS) if (inCapsule(x, z, patch)) return true
  return false
}
export function inBush(x: number, z: number): boolean {
  for (const bush of BUSHES) if (inCircle(x, z, bush)) return true
  return false
}
export function inShelter(x: number, z: number, pad = 0): boolean {
  for (const shelter of SHELTERS) if (inCircle(x, z, shelter, pad)) return true
  return false
}
export function logOver(x: number, z: number, pad = 0): Log | undefined {
  for (const log of LOGS) if (inCapsule(x, z, log, pad)) return log
  return undefined
}
export const logTop = (log: Log) => log.bottom + log.r * 2

/** The overhang whose footprint (grown by `pad`) covers (x, z). */
export function overhangAt(x: number, z: number, pad = 0): Overhang | undefined {
  for (const roof of OVERHANGS) if (inRect(x, z, roof, pad)) return roof
  return undefined
}

/** True when a body of `radius` stepping from (ax, az) to (bx, bz) would cross or press into a closed gate. */
export function gateBlocks(ax: number, az: number, bx: number, bz: number, radius: number): boolean {
  for (let index = 0; index < GATES.length; index++) {
    if (gateMask & (1 << index)) continue
    const gate = GATES[index]
    const after = segmentDistance(bx, bz, gate.ax, gate.az, gate.bx, gate.bz)
    if (after < radius && after < segmentDistance(ax, az, gate.ax, gate.az, gate.bx, gate.bz)) return true
    // Proper crossing, for steps longer than the body.
    const side = (x: number, z: number) => (gate.bx - gate.ax) * (z - gate.az) - (gate.bz - gate.az) * (x - gate.ax)
    const cross = (x: number, z: number) => (bx - ax) * (z - az) - (bz - az) * (x - ax)
    if (side(ax, az) * side(bx, bz) < 0 && cross(gate.ax, gate.az) * cross(gate.bx, gate.bz) < 0) return true
  }
  return false
}

export function caveAt(x: number, z: number): Cave | undefined {
  for (const cave of CAVES) if (inCircle(x, z, cave, -cave.wall / 2)) return cave
  return undefined
}

/** True when a body of the given radius would overlap a cave wall outside its entrances. */
export function caveWallBlocks(x: number, z: number, radius: number): boolean {
  for (const cave of CAVES) {
    const dx = x - cave.x
    const dz = z - cave.z
    if (Math.abs(length(dx, dz) - cave.r) >= cave.wall / 2 + radius) continue
    let passable = false
    for (const entrance of cave.entrances)
      passable ||=
        dx * entrance.dx + dz * entrance.dz > 0 &&
        Math.abs(dx * entrance.dz - dz * entrance.dx) < entrance.width / 2 - radius
    if (!passable) return true
  }
  return false
}

/** Nearest point on the tunnel network's centreline, with that corridor's unit direction. */
export function tunnelNearest(x: number, z: number) {
  let best = { x, z, d: Infinity, ux: 1, uz: 0 }
  for (const [first, second] of TUNNEL_EDGES) {
    const a = TUNNEL_NODES[first]
    const b = TUNNEL_NODES[second]
    const hit = segment(x, z, a.x, a.z, b.x, b.z)
    const span = length(b.x - a.x, b.z - a.z)
    if (hit.d < best.d) best = { ...hit, ux: (b.x - a.x) / span, uz: (b.z - a.z) / span }
  }
  return best
}

/** Moves a point back inside the tunnels (corridors plus wider chambers at junctions). */
export function clampToTunnel(x: number, z: number, margin: number): Point {
  for (const node of TUNNEL_NODES)
    if (!node.exit && length(x - node.x, z - node.z) <= CHAMBER_RADIUS - margin) return { x, z }
  const nearest = tunnelNearest(x, z)
  const limit = TUNNEL_RADIUS - margin
  if (nearest.d <= limit) return { x, z }
  const scale = limit / nearest.d
  return { x: nearest.x + (x - nearest.x) * scale, z: nearest.z + (z - nearest.z) * scale }
}

export const tunnelExitNear = (x: number, z: number, reach: number) =>
  TUNNEL_NODES.find((node) => node.exit && length(x - node.x, z - node.z) < reach)
export const isUnderground = (x: number, y: number, z: number) => y < heightAt(x, z) - 1
/** Height an entity stands on: the tunnel floor underground, otherwise the terrain. */
export const floorAt = (x: number, y: number, z: number) =>
  isUnderground(x, y, z) ? heightAt(x, z) - TUNNEL_DEPTH : heightAt(x, z)

/** Terrain (and baked walls), tall rocks and cave walls block sight; samples every grid cell along the line. */
export function lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const steps = Math.ceil(length(bx - ax, bz - az) * INVERSE)
  for (let step = 1; step < steps; step++) {
    const t = step / steps
    const x = ax + (bx - ax) * t
    const z = az + (bz - az) * t
    const y = ay + (by - ay) * t
    if (heightAt(x, z) > y) return false
    for (const blocker of blockersNear(x, z)) {
      if (blocker.kind !== 'rock' || blocker.top < y) continue
      const dx = x - blocker.x
      const dz = z - blocker.z
      if (dx * dx + dz * dz < blocker.r * blocker.r) return false
    }
    if (caveWallBlocks(x, z, 0) && CAVES.some((cave) => y < cave.floor + cave.roof)) return false
  }
  return true
}

// ---------------------------------------------------------------- story-stage elements
/** Zones covering a point, in map order. */
export const zonesAt = (x: number, z: number) => ZONES.filter((zone) => inRect(x, z, zone))
export const inZone = (id: string, x: number, z: number) => ZONES.some((zone) => zone.id === id && inRect(x, z, zone))
/** How visible a rabbit standing here is: the product of the light of every zone covering it. */
export function lightAt(x: number, z: number): number {
  let light = 1
  for (const zone of ZONES) if (zone.light !== undefined && inRect(x, z, zone)) light *= zone.light
  return light
}
export const npcNear = (x: number, z: number, reach: number) => {
  let best: Npc | undefined
  for (const npc of NPCS)
    if (
      length(npc.x - x, npc.z - z) < reach &&
      (!best || length(npc.x - x, npc.z - z) < length(best.x - x, best.z - z))
    )
      best = npc
  return best
}

/** Every car on the active map at `time`. Pure: host collisions and every renderer use the same result. */
export function vehiclesAt(time: number): Vehicle[] {
  const vehicles: Vehicle[] = []
  LANES.forEach((lane, laneIndex) => {
    const points = lane.loop ? [...lane.points, lane.points[0]] : lane.points
    const spans = points.slice(1).map((point, index) => length(point.x - points[index].x, point.z - points[index].z))
    const total = spans.reduce((sum, span) => sum + span, 0)
    if (!(total > 0)) return
    lane.cars.forEach((car, carIndex) => {
      let along = (((time * lane.speed + car.offset) % total) + total) % total
      let index = 0
      while (index < spans.length - 1 && along > spans[index]) along -= spans[index++]
      const a = points[index]
      const b = points[index + 1]
      const t = spans[index] ? along / spans[index] : 0
      vehicles.push({
        id: `car-${laneIndex}-${carIndex}`,
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        angle: Math.atan2(b.x - a.x, b.z - a.z),
        length: lane.length ?? 16,
        width: lane.width ?? 6.5,
        height: lane.height ?? 5.5,
        color: car.color
      })
    })
  })
  return vehicles
}

/** True when a body of `radius` at (x, z) overlaps the car's footprint. */
export function underWheels(vehicle: Vehicle, x: number, z: number, radius: number) {
  const dx = x - vehicle.x
  const dz = z - vehicle.z
  const along = dx * Math.sin(vehicle.angle) + dz * Math.cos(vehicle.angle)
  const across = dx * Math.cos(vehicle.angle) - dz * Math.sin(vehicle.angle)
  return Math.abs(along) < vehicle.length / 2 + radius && Math.abs(across) < vehicle.width / 2 + radius
}

export function regionName(x: number, y: number, z: number): string {
  if (isUnderground(x, y, z)) return 'モグラのトンネル'
  const cave = caveAt(x, z)
  if (cave) return cave.name
  for (const zone of ZONES) if (zone.name && inRect(x, z, zone)) return zone.name
  return active.region?.(x, z) ?? ''
}

setStage(FOREST) // until a game says otherwise
