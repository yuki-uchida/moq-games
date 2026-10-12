import type { ForecastQueryContext } from './ForecastQueryContext'
import { physicalProjectionOnRoute } from './BattlefieldRoutes'
import { tankAvailableToEnemy } from './TankRoadblock'
import { RANGED_ALLY_TYPES, fieldFor, type AllyType, type GameState, type Unit } from './model'

export function goblinPursuitTarget(
  state: Readonly<GameState>,
  enemy: Unit,
  query?: ForecastQueryContext
): Unit | undefined {
  if (enemy.owner !== 'ai' || enemy.type !== 'goblin' || enemy.hp <= 0) return undefined
  const allies = state.units.filter(
    (unit) =>
      unit.owner === 'player' &&
      unit.hp > 0 &&
      (unit.type !== 'tank' || tankAvailableToEnemy(state, unit, enemy, query))
  )
  const ranged = allies
    .filter((unit) => RANGED_ALLY_TYPES.includes(unit.type as AllyType))
    .sort(
      (a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y) || a.id - b.id
    )[0]
  if (!ranged) return undefined
  const field = fieldFor(state),
    destination = physicalProjectionOnRoute(field, enemy.routeId, ranged, query?.roads)
  const dx = ranged.x - enemy.x,
    dy = ranged.y - enemy.y,
    length = Math.hypot(dx, dy)
  const blockers = allies
    .filter((unit) => {
      if (unit.id === ranged.id || length === 0) return false
      const along = ((unit.x - enemy.x) * dx + (unit.y - enemy.y) * dy) / length
      const across = Math.abs((unit.x - enemy.x) * dy - (unit.y - enemy.y) * dx) / length
      const projection = physicalProjectionOnRoute(field, enemy.routeId, unit, query?.roads)
      const blocksRoad =
        projection.distance <= 24 &&
        projection.progress >= enemy.progress - 1e-9 &&
        projection.progress < destination.progress
      return blocksRoad || (along >= -1e-9 && along < length && across <= 24)
    })
    .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y) || a.id - b.id)
  return blockers[0] ?? ranged
}
