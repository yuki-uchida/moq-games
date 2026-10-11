import { effectiveSpeed } from './CommanderSupport'
import { nearestRoadEdge, routeFor } from './BattlefieldRoutes'
import { overlapsScenery } from './FieldScenery'
import {
  CONFIG,
  ROAD_EFFECTS,
  fieldFor,
  isAirborneEnemy,
  pathLength,
  routePathFor,
  type FortificationsState,
  type GameState,
  type Mud,
  type Point,
  type RoadItem,
  type RoadItemKind,
  type Sandbag,
  type SandbagPlacement,
  type Spike,
  type Unit
} from './model'

export const FORTIFICATIONS = {
  maxItems: 10,
  spike: { cost: 30, hp: 40, retaliation: 8 },
  mud: { cost: 20, charges: 6, radius: 24, duration: 2, speedFactor: 0.65 },
  equipmentCost: 60,
  cannon: {
    costs: [80, 120, 180],
    damage: [8, 12, 16],
    range: 210,
    interval: 3.2,
    windup: 0.3,
    flight: 0.28,
    maxShots: 4
  },
  armor: { costs: [60, 90, 135], reductionPerLevel: 0.1, maxLevel: 3 }
} as const

export interface RoadItemPlacement extends Omit<SandbagPlacement, 'reason'> {
  reason: SandbagPlacement['reason'] | 'outside' | 'obstacle' | 'funds' | 'invalid-kind'
}

export function freshFortifications(): FortificationsState {
  return {
    items: [],
    gate: { cannonLevel: 0, armorLevel: 0, cooldown: 0, sequence: 0, shots: [] },
    fortificationSpend: 0,
    gearSpend: 0
  }
}

export function roadItems(state: Readonly<GameState>): RoadItem[] {
  return state.economyVersion === 2 ? (state.fortifications?.items ?? []) : []
}

export function paidBarriers(state: Readonly<GameState>): Spike[] {
  return roadItems(state).filter((item): item is Spike => item.kind === 'spike' && item.hp > 0)
}

export function allBarriers(state: Readonly<GameState>): Sandbag[] {
  return [...state.sandbags, ...paidBarriers(state)]
}

export function gateMuzzle(state: Readonly<GameState>): Point {
  const gate = fieldFor(state).gate
  return { x: gate.x - 18, y: gate.y - 56 }
}

export function gateDamageFactor(state: Readonly<GameState>): number {
  return (
    1 -
    (state.economyVersion === 2 ? (state.fortifications?.gate.armorLevel ?? 0) : 0) *
      FORTIFICATIONS.armor.reductionPerLevel
  )
}

export function previewRoadItemPlacement(
  state: Readonly<GameState>,
  kind: RoadItemKind,
  point: Point,
  movingId?: number
): RoadItemPlacement {
  const field = fieldFor(state),
    finite = !!point && Number.isFinite(point.x) && Number.isFinite(point.y),
    projected = nearestRoadEdge(field, finite ? point : field.entrance),
    moving = roadItems(state).find((item) => item.id === movingId),
    footprint = kind === 'mud' ? FORTIFICATIONS.mud.radius : ROAD_EFFECTS.sandbag.radius,
    reason: RoadItemPlacement['reason'] =
      state.economyVersion !== 2
        ? 'unavailable'
        : state.phase !== 'preparation'
          ? 'phase'
          : kind !== 'mud' && kind !== 'spike'
            ? 'invalid-kind'
            : !finite
              ? 'invalid-point'
              : movingId !== undefined && (!moving || moving.kind !== kind)
                ? 'missing-barrier'
                : !moving && roadItems(state).length >= FORTIFICATIONS.maxItems
                  ? 'unavailable'
                  : point.x < footprint ||
                      point.x > field.width - footprint ||
                      point.y < footprint ||
                      point.y > field.height - footprint
                    ? 'outside'
                    : projected.distance > CONFIG.roadWidth / 2
                      ? 'off-road'
                      : projected.progress < ROAD_EFFECTS.sandbag.entryClearance ||
                          Math.hypot(projected.x - field.entrance.x, projected.y - field.entrance.y) <
                            ROAD_EFFECTS.sandbag.entryClearance
                        ? 'entry-clearance'
                        : pathLength(routeFor(field, projected.routeId).path) - projected.progress <
                              ROAD_EFFECTS.sandbag.coreClearance ||
                            Math.hypot(projected.x - field.gate.x, projected.y - field.gate.y) <
                              ROAD_EFFECTS.sandbag.coreClearance
                          ? 'core-clearance'
                          : overlapsScenery(
                                field.id,
                                projected,
                                footprint,
                                state.battlefieldVersion,
                                state.layoutRevision
                              )
                            ? 'obstacle'
                            : state.units.some(
                                  (unit) =>
                                    unit.owner === 'player' &&
                                    Math.hypot(unit.homeX - projected.x, unit.homeY - projected.y) <
                                      ROAD_EFFECTS.sandbag.defenderClearance
                                )
                              ? 'defender-overlap'
                              : [...state.sandbags, ...roadItems(state)].some(
                                    (item) =>
                                      item.id !== movingId &&
                                      Math.hypot(item.x - projected.x, item.y - projected.y) <
                                        ROAD_EFFECTS.sandbag.minimumSpacing
                                  )
                                ? 'barrier-overlap'
                                : null
  return {
    valid: reason === null,
    reason,
    point: { x: projected.x, y: projected.y },
    progress: projected.progress,
    distance: projected.distance,
    edgeId: projected.edgeId,
    offset: projected.offset
  }
}

export interface MudTravel {
  progress: number
  slowUntil: number
  changes: Mud[]
}

export type MudTravelGeometry = Map<Point[], Map<string, { start: number; end: number }[]>>

function mudIntervals(path: Point[], item: Mud, geometry?: MudTravelGeometry): { start: number; end: number }[] {
  const key = `${item.id}/${item.x}/${item.y}`,
    cached = geometry?.get(path)?.get(key)
  if (cached) return cached
  const intervals: { start: number; end: number }[] = []
  let progress = 0
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1],
      end = path[index],
      dx = end.x - start.x,
      dy = end.y - start.y,
      length = Math.hypot(dx, dy),
      x = start.x - item.x,
      y = start.y - item.y,
      center = -(x * dx + y * dy) / length,
      perpendicularSquared = x * x + y * y - center * center,
      radiusSquared = FORTIFICATIONS.mud.radius ** 2
    if (perpendicularSquared < radiusSquared) {
      const half = Math.sqrt(Math.max(0, radiusSquared - perpendicularSquared)),
        low = Math.max(0, center - half),
        high = Math.min(length, center + half)
      if (high > low) {
        const previous = intervals.at(-1)
        if (previous && Math.abs(previous.end - (progress + low)) < 1e-8) previous.end = progress + high
        else intervals.push({ start: progress + low, end: progress + high })
      }
    }
    progress += length
  }
  if (geometry) {
    const byItem = geometry.get(path) ?? new Map()
    byItem.set(key, intervals)
    geometry.set(path, byItem)
  }
  return intervals
}

export function advanceMudTravel(
  state: Readonly<GameState>,
  enemy: Unit,
  dt: number,
  limit: number,
  surface: { startProgress: number; endProgress: number; speedFactor: number },
  geometry?: MudTravelGeometry
): MudTravel {
  const path = routePathFor(state, enemy.routeId),
    mud = roadItems(state)
      .filter((item): item is Mud => item.kind === 'mud' && item.charges > 0)
      .map((item) => ({
        item: { ...item, insideIds: [...item.insideIds] },
        intervals: mudIntervals(path, item, geometry)
      }))
  let progress = enemy.progress,
    time = state.time - dt,
    remaining = dt,
    slowUntil = enemy.mudSlowUntil ?? 0
  for (let event = 0; event < 128 && remaining > 1e-10; event++) {
    for (const { item, intervals } of mud) {
      const inside = intervals.some((span) => progress >= span.start - 1e-8 && progress < span.end - 1e-8),
        wasInside = item.insideIds.includes(enemy.id)
      if (!inside && wasInside) item.insideIds = item.insideIds.filter((id) => id !== enemy.id)
      if (inside && !wasInside && item.charges > 0) {
        item.charges--
        item.insideIds.push(enemy.id)
        slowUntil = time + FORTIFICATIONS.mud.duration
      }
    }
    if (progress >= limit - 1e-9) break
    const terrain =
        progress >= surface.startProgress - 1e-8 && progress < surface.endProgress - 1e-8 ? surface.speedFactor : 1,
      mudFactor = time < slowUntil - 1e-9 ? FORTIFICATIONS.mud.speedFactor : 1,
      frost = time < enemy.slowUntil - 1e-9 ? enemy.slowFactor : 1,
      speed = effectiveSpeed(enemy, time) * Math.min(terrain, mudFactor) * frost
    if (speed <= 0) break
    const boundaries = [
        limit,
        surface.startProgress,
        surface.endProgress,
        ...mud.flatMap(({ intervals }) => intervals.flatMap((span) => [span.start, span.end]))
      ].filter((value) => value > progress + 1e-8),
      nextProgress = Math.min(...boundaries),
      expiries = [
        slowUntil,
        enemy.slowUntil,
        enemy.supportBuff?.startedAt ?? 0,
        enemy.supportBuff?.expiresAt ?? 0
      ].filter((value) => value > time + 1e-9),
      step = Math.min(remaining, (nextProgress - progress) / speed, ...expiries.map((value) => value - time))
    progress = Math.min(limit, progress + speed * step)
    time += step
    remaining -= step
  }
  for (const { item, intervals } of mud) {
    if (!intervals.some((span) => progress >= span.start - 1e-8 && progress < span.end - 1e-8))
      item.insideIds = item.insideIds.filter((id) => id !== enemy.id)
  }
  return { progress, slowUntil, changes: mud.map(({ item }) => item) }
}

export function applyMudTravel(state: Readonly<GameState>, enemy: Unit, travel: MudTravel): void {
  if (travel.slowUntil > 0) enemy.mudSlowUntil = travel.slowUntil
  if (!state.fortifications) return
  const changes = new Map(travel.changes.map((item) => [item.id, item]))
  state.fortifications.items = state.fortifications.items.flatMap((item) => {
    const changed = changes.get(item.id)
    return changed ? (changed.charges > 0 ? [changed] : []) : [item]
  })
}

export function pruneMudOccupants(state: Readonly<GameState>): void {
  for (const item of roadItems(state)) {
    if (item.kind !== 'mud') continue
    item.insideIds = item.insideIds.filter((id) =>
      state.units.some(
        (unit) =>
          unit.id === id &&
          unit.owner === 'ai' &&
          unit.hp > 0 &&
          !isAirborneEnemy(unit.type) &&
          Math.hypot(unit.x - item.x, unit.y - item.y) <= FORTIFICATIONS.mud.radius + 1e-7
      )
    )
  }
}

export function observeFortifications(state: Readonly<GameState>) {
  const fortifications = state.economyVersion === 2 ? state.fortifications : undefined
  if (!fortifications) return undefined
  return {
    items: fortifications.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      x: item.x,
      y: item.y,
      edgeId: item.edgeId,
      offset: item.offset,
      ...(item.kind === 'spike' ? { hp: item.hp, maxHp: item.maxHp } : { charges: item.charges })
    })),
    gate: {
      cannonLevel: fortifications.gate.cannonLevel,
      armorLevel: fortifications.gate.armorLevel,
      range: FORTIFICATIONS.cannon.range,
      damage: fortifications.gate.cannonLevel ? FORTIFICATIONS.cannon.damage[fortifications.gate.cannonLevel - 1] : 0,
      nextShotIn: fortifications.gate.cooldown
    }
  }
}
