import type { CombatAttack, Point } from './model'

export type HeavyImpactShape =
  | { kind: 'sector'; origin: Point; radius: number; direction: Point; halfAngle: number }
  | { kind: 'circle'; origin: Point; radius: number }

const bruteHitOffsets: readonly Point[] = [
  { x: 27.33333333333333, y: 0 },
  { x: 23.666666666666657, y: 0 },
  { x: 0, y: 0 },
  { x: -23.66666666666667, y: 0 },
  { x: -27.333333333333336, y: 0 },
  { x: -27.333333333333336, y: -5 },
  { x: 0, y: -36 },
  { x: 27.33333333333333, y: -5 }
]

export function heavyImpactGeometry(
  attack: Pick<
    CombatAttack,
    'type' | 'origin' | 'aim' | 'target' | 'range' | 'boss' | 'battlefieldVersion' | 'geometryScale'
  >
): HeavyImpactShape | null {
  if (attack.type !== 'ogre' && attack.type !== 'brute') return null
  const geometryScale = attack.geometryScale ?? 1
  const aim = attack.aim ?? { x: attack.target.x - attack.origin.x, y: attack.target.y - attack.origin.y }
  if (attack.type === 'brute') {
    const index = (Math.round(Math.atan2(aim.y, aim.x) / (Math.PI / 4)) + 8) % 8,
      offset = bruteHitOffsets[index],
      scale = attack.boss ? 1.35 : 1
    return {
      kind: 'circle',
      origin: { x: attack.origin.x + offset.x * scale, y: attack.origin.y + offset.y * scale },
      radius: (attack.boss ? 60 : 48) * (attack.battlefieldVersion === 2 ? 1.25 : 1) * geometryScale
    }
  }
  const magnitude = Math.hypot(aim.x, aim.y)
  return {
    kind: 'sector',
    origin: { ...attack.origin },
    radius: attack.range * (attack.battlefieldVersion === 2 ? 1.25 : 1) * geometryScale,
    direction: magnitude > 0 ? { x: aim.x / magnitude, y: aim.y / magnitude } : { x: 1, y: 0 },
    halfAngle: (55 * Math.PI) / 180
  }
}

export function insideHeavyImpact(shape: Readonly<HeavyImpactShape>, point: Readonly<Point>): boolean {
  const dx = point.x - shape.origin.x,
    dy = point.y - shape.origin.y,
    distance = Math.hypot(dx, dy)
  if (distance > shape.radius + 1e-9) return false
  return (
    shape.kind === 'circle' ||
    dx * shape.direction.x + dy * shape.direction.y >= distance * Math.cos(shape.halfAngle) - 1e-9
  )
}
