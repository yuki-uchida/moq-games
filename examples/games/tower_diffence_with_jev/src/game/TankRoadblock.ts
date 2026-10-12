import type { ForecastQueryContext } from './ForecastQueryContext'
import { RoadGeometryCache, roadCoordinateKey, roadPathRevision, type RoadGeometrySnapshot } from './RoadGeometryCache'
import { fieldFor, isAirborneEnemy, routePathFor, type GameState, type Point, type Unit } from './model'

// The current Tank body (18px) must intersect the actual 48px-wide road.
// This is local route geometry, never a wall across a branch or a home-position flag.
export const TANK_ROADBLOCK_RADIUS = 42
const EPSILON = 1e-9
export interface TankRoadblock {
  tank: Unit
  start: number
  end: number
}
export interface NextTankRoadblock extends TankRoadblock {
  stopProgress: number
}

const circleCache = new RoadGeometryCache<{ start: number; end: number }[]>(128)
function circleIntervals(
  path: readonly Point[],
  center: Point,
  radius: number,
  snapshot?: RoadGeometrySnapshot
): { start: number; end: number }[] {
  return circleCache.get(
    path,
    roadCoordinateKey(center.x, center.y, radius),
    () => computeCircleIntervals(path, center, radius),
    snapshot
  )
}

/** Exact swept circle/polyline intervals, including bends and repeated crossings. */
function computeCircleIntervals(
  path: readonly Point[],
  center: Point,
  radius: number
): { start: number; end: number }[] {
  const intervals: { start: number; end: number }[] = []
  let accumulated = 0
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1],
      b = path[index],
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy)
    if (length <= EPSILON) continue
    const x = center.x - a.x,
      y = center.y - a.y,
      along = (x * dx + y * dy) / length,
      across = (x * dy - y * dx) / length,
      squared = radius * radius - across * across
    if (squared >= -EPSILON) {
      const half = Math.sqrt(Math.max(0, squared)),
        start = Math.max(0, along - half),
        end = Math.min(length, along + half)
      if (start <= end + EPSILON) {
        const interval = { start: accumulated + start, end: accumulated + end },
          previous = intervals.at(-1)
        if (previous && interval.start <= previous.end + EPSILON) previous.end = Math.max(previous.end, interval.end)
        else intervals.push(interval)
      }
    }
    accumulated += length
  }
  return intervals
}

export function tankRoadblocksOnPath(
  state: Readonly<GameState>,
  path: readonly Point[],
  query?: ForecastQueryContext
): TankRoadblock[] {
  return state.units
    .flatMap((tank) =>
      tank.owner === 'player' &&
      tank.type === 'tank' &&
      tank.hp > 0 &&
      Number.isFinite(tank.x) &&
      Number.isFinite(tank.y)
        ? circleIntervals(path, tank, TANK_ROADBLOCK_RADIUS, query?.roads).map((interval) => ({ tank, ...interval }))
        : []
    )
    .sort((a, b) => a.start - b.start || a.tank.id - b.tank.id || a.end - b.end)
}

/** Read-only current obstruction; no forecast of future Tank damage, movement or death. */
function roadblockCandidates(
  state: Readonly<GameState>,
  enemy: Readonly<Unit>,
  query?: ForecastQueryContext
): NextTankRoadblock[] {
  if (enemy.owner !== 'ai' || enemy.hp <= 0 || isAirborneEnemy(enemy.type)) return []
  const path = routePathFor(state, enemy.routeId)
  return tankRoadblocksOnPath(state, path, query)
    .flatMap((block) => {
      if (block.end + EPSILON < enemy.progress) return []
      // Genuine ground ranges are >=44px. Also keep old/custom shorter-range units
      // attackable without changing contact geometry or trapping them out of reach.
      const contacts =
        enemy.attackRange + EPSILON >= TANK_ROADBLOCK_RADIUS
          ? [block]
          : circleIntervals(path, block.tank, Math.max(0, enemy.attackRange), query?.roads)
      const contact = contacts.find(
        (interval) =>
          interval.end + EPSILON >= enemy.progress &&
          interval.start <= block.end + EPSILON &&
          interval.end + EPSILON >= block.start
      )
      if (!contact) return []
      return [{ ...block, stopProgress: Math.max(enemy.progress, block.start, contact.start) }]
    })
    .sort((a, b) => a.stopProgress - b.stopProgress || a.tank.id - b.tank.id || a.start - b.start)
}

// Forecast substeps repeatedly ask about the same real-unit snapshot. Cache only
// exact restraint inputs, rather than time or a frame number: sequential movement,
// damage, removal, placement and route/layout changes invalidate immediately.
const restraintKeys = ['id', 'owner', 'type', 'hp', 'x', 'y', 'progress', 'attackRange', 'routeId'] as const
const restraintCache = new WeakMap<
  readonly Unit[],
  {
    field: ReturnType<typeof fieldFor>
    inputs: unknown[][]
    paths: object[]
    routeIds: (string | undefined)[]
    assignments: Map<number, number>
  }
>()
function currentTankRestraints(state: Readonly<GameState>, query?: ForecastQueryContext): ReadonlyMap<number, number> {
  if (query?.restraints?.units === state.units && query.restraints.field === fieldFor(state))
    return query.restraints.assignments
  if (
    !state.units.some(
      (unit) =>
        unit.owner === 'player' &&
        unit.type === 'tank' &&
        unit.hp > 0 &&
        Number.isFinite(unit.x) &&
        Number.isFinite(unit.y)
    )
  )
    return new Map()
  const field = fieldFor(state)
  const paths = field.routes.map((route) => roadPathRevision(route.path, query?.roads))
  const cached = restraintCache.get(state.units)
  if (
    cached?.field === field &&
    field.routes.every((route, index) => route.id === cached.routeIds[index]) &&
    paths.length === cached.paths.length &&
    paths.every((path, index) => path === cached.paths[index]) &&
    state.units.length === cached.inputs.length &&
    state.units.every((unit, index) =>
      restraintKeys.every((key, part) => Object.is(unit[key], cached.inputs[index][part]))
    )
  )
    return cached.assignments
  const assignments = computeTankRestraints(state, query)
  const inputs = state.units.map((unit) => restraintKeys.map((key) => unit[key]))
  restraintCache.set(state.units, {
    field,
    inputs,
    paths,
    routeIds: field.routes.map((route) => route.id),
    assignments
  })
  return assignments
}

export function tankRestraints(state: Readonly<GameState>): Map<number, number> {
  // A caller can modify the returned map without corrupting later decisions.
  return new Map(currentTankRestraints(state))
}

function computeTankRestraints(state: Readonly<GameState>, query?: ForecastQueryContext): Map<number, number> {
  const pairs = state.units
    .flatMap((enemy) =>
      roadblockCandidates(state, enemy, query).map((block) => ({
        enemy,
        block,
        held:
          enemy.progress + EPSILON >= block.stopProgress &&
          Math.hypot(enemy.x - block.tank.x, enemy.y - block.tank.y) <= enemy.attackRange + EPSILON
      }))
    )
    .sort(
      (a, b) =>
        Number(b.held) - Number(a.held) ||
        a.block.stopProgress - a.enemy.progress - (b.block.stopProgress - b.enemy.progress) ||
        a.enemy.id - b.enemy.id ||
        a.block.tank.id - b.block.tank.id
    )
  const assignments = new Map<number, number>(),
    enemies = new Set<number>()
  for (const { enemy, block } of pairs) {
    if (assignments.has(block.tank.id) || enemies.has(enemy.id)) continue
    assignments.set(block.tank.id, enemy.id)
    enemies.add(enemy.id)
  }
  return assignments
}

export function nextTankRoadblock(
  state: Readonly<GameState>,
  enemy: Readonly<Unit>,
  query?: ForecastQueryContext
): NextTankRoadblock | undefined {
  const assignments = currentTankRestraints(state, query)
  if (!assignments.size) return undefined
  return roadblockCandidates(state, enemy, query).find((block) => assignments.get(block.tank.id) === enemy.id)
}

export function tankAvailableToEnemy(
  state: Readonly<GameState>,
  tank: Readonly<Unit>,
  enemy: Readonly<Unit>,
  query?: ForecastQueryContext
): boolean {
  const restrained = currentTankRestraints(state, query).get(tank.id)
  return restrained === undefined || restrained === enemy.id
}
