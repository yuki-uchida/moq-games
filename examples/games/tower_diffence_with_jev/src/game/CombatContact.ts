import { isEnemyMelee, ROAD_EFFECTS, type Point, type Unit } from './model'

export const BASE_WALL_FOOTPRINT = { halfWidth: 41, halfDepth: 8 * 1.12 }
export const MELEE_TARGET_BODY_RADIUS = 18
export type ContactTarget = 'unit' | 'base' | 'sandbag'

export function attackContact(
  attacker: Point & Pick<Unit, 'owner' | 'type'>,
  target: Point,
  range: number,
  kind: ContactTarget = 'unit'
): { point: Point; inRange: boolean } {
  const meleeBuilding = attacker.owner === 'ai' && isEnemyMelee(attacker.type) && kind !== 'unit'
  let point = { x: target.x, y: target.y }
  if (meleeBuilding && kind === 'base') {
    point = {
      x: Math.max(
        target.x - BASE_WALL_FOOTPRINT.halfWidth,
        Math.min(target.x + BASE_WALL_FOOTPRINT.halfWidth, attacker.x)
      ),
      y: Math.max(
        target.y - BASE_WALL_FOOTPRINT.halfDepth,
        Math.min(target.y + BASE_WALL_FOOTPRINT.halfDepth, attacker.y)
      )
    }
  } else if (meleeBuilding && kind === 'sandbag') {
    const dx = attacker.x - target.x,
      dy = attacker.y - target.y,
      distance = Math.hypot(dx, dy),
      radius = Math.min(distance, ROAD_EFFECTS.sandbag.radius)
    if (distance > 0) point = { x: target.x + (dx * radius) / distance, y: target.y + (dy * radius) / distance }
  }
  const reach = meleeBuilding ? Math.max(0, range - MELEE_TARGET_BODY_RADIUS) : range
  return { point, inRange: Math.hypot(point.x - attacker.x, point.y - attacker.y) <= reach + 1e-9 }
}

export function sandbagStandOff(unit: Pick<Unit, 'type' | 'attackRange'>): number {
  return (
    ROAD_EFFECTS.sandbag.radius +
    (isEnemyMelee(unit.type) ? Math.max(0, unit.attackRange - MELEE_TARGET_BODY_RADIUS) : 0)
  )
}
