import {
  distanceToPath,
  FIELDS,
  getField,
  type BattlefieldVersion,
  type LayoutRevision,
  type FieldId,
  type Point
} from './model'
import { distanceToRoadUnion } from './BattlefieldRoutes'

export interface SceneryItem extends Point {
  scale: number
  kind: 'tree' | 'cactus' | 'rock' | 'sprig'
  radius: number
}

const cache = new Map<string, readonly SceneryItem[]>()
export function fieldScenery(
  id: FieldId,
  version: BattlefieldVersion = 1,
  layoutRevision: LayoutRevision = 1
): readonly SceneryItem[] {
  // Validate strict scalar identity before a stringified cache key can alias it.
  const field = getField(id, version, layoutRevision),
    key = `${id}:${version}:${layoutRevision}`,
    cached = cache.get(key)
  if (cached) return cached
  // Revision 4 uses the painted perimeter and a fully open grass interior.
  // Do not introduce invisible randomly generated blockers over that artwork.
  if (layoutRevision === 4) {
    cache.set(key, [])
    return []
  }
  const items: SceneryItem[] = []
  let seed = 547 + Object.keys(FIELDS).indexOf(id) * 997
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < 810; i++) {
    const point = { x: 18 + random() * (field.width - 36), y: 36 + random() * (field.height - 50) }
    const roll = random(),
      scale = i < 580 ? 0.65 + random() * 0.48 : 0.65
    const kind =
      i >= 580
        ? id === 'volcanic'
          ? 'rock'
          : 'sprig'
        : roll < 0.52 && (id === 'meadow' || id === 'frost')
          ? 'tree'
          : roll < 0.36 && id === 'desert'
            ? 'cactus'
            : roll < 0.76 || id === 'volcanic'
              ? 'rock'
              : 'sprig'
    const radius = (kind === 'tree' ? 90 : kind === 'cactus' ? 55 : kind === 'rock' ? 36 : 14) * scale
    if (
      (version === 1 ? distanceToPath(field.path, point) : distanceToRoadUnion(field, point)) < 94 + radius ||
      field.slots.some((slot) => Math.hypot(point.x - slot.x, point.y - slot.y) < 66 + radius) ||
      items.some((other) => Math.hypot(point.x - other.x, point.y - other.y) < (radius + other.radius) * 0.5)
    )
      continue
    items.push({ ...point, scale, kind, radius })
  }
  items.sort((a, b) => a.y - b.y)
  cache.set(key, items)
  return items
}

export function overlapsScenery(
  id: FieldId,
  point: Point,
  clearance: number,
  version: BattlefieldVersion = 1,
  layoutRevision: LayoutRevision = 1
): boolean {
  return fieldScenery(id, version, layoutRevision).some(
    (item) => item.kind !== 'sprig' && Math.hypot(point.x - item.x, point.y - item.y) < item.radius + clearance
  )
}
