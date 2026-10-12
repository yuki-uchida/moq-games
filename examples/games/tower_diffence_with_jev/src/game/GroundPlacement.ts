import { roadItems } from './Fortifications'
import {
  ALLY_TYPES,
  DEFINITIONS,
  fieldFor,
  ROAD_EFFECTS,
  distanceToPath,
  type AllyType,
  type GameState,
  type Point
} from './model'
import { overlapsScenery } from './FieldScenery'
import { distanceToRoadUnion } from './BattlefieldRoutes'

export const DEFENDER_FOOTPRINT = 18
export interface GroundPlacement {
  point: Point
  valid: boolean
  reason:
    | 'phase'
    | 'invalid-point'
    | 'outside'
    | 'base'
    | 'entry'
    | 'obstacle'
    | 'overlap'
    | 'sandbag'
    | 'capacity'
    | 'locked'
    | 'funds'
    | 'duplicate'
    | 'battle-used'
    | 'battle-range'
    | 'no-route'
    | 'same-home'
    | 'redeploy-range'
    | 'dead'
    | null
  reachesRoad: boolean
}
export function previewGroundPlacement(
  state: Readonly<GameState>,
  type: AllyType,
  point: Point,
  replaceSlotId?: number
): GroundPlacement {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return { point: { x: 0, y: 0 }, valid: false, reason: 'invalid-point', reachesRoad: false }
  if (!ALLY_TYPES.includes(type)) return { point, valid: false, reason: 'locked', reachesRoad: false }
  const field = fieldFor(state),
    definition = DEFINITIONS[type]
  const roadDistance =
    state.battlefieldVersion === 2 ? distanceToRoadUnion(field, point) : distanceToPath(field.path, point)
  const defenders = state.units.filter(
    (unit) => unit.owner === 'player' && (replaceSlotId === undefined || unit.slotId !== replaceSlotId)
  )
  const base = field.path.at(-1)!,
    entry = field.path[0]
  const reason: GroundPlacement['reason'] =
    state.phase !== 'preparation'
      ? 'phase'
      : !Number.isFinite(point.x) || !Number.isFinite(point.y)
        ? 'invalid-point'
        : point.x < 48 || point.x > field.width - 48 || point.y < 94 || point.y > field.height - DEFENDER_FOOTPRINT
          ? 'outside'
          : Math.abs(point.x - base.x) < 82 + DEFENDER_FOOTPRINT &&
              point.y > base.y - 150 - DEFENDER_FOOTPRINT &&
              point.y < base.y + 40 + DEFENDER_FOOTPRINT
            ? 'base'
            : Math.abs(point.x - entry.x) < 40 + DEFENDER_FOOTPRINT &&
                point.y > entry.y - 75 - DEFENDER_FOOTPRINT &&
                point.y < entry.y + 18 + DEFENDER_FOOTPRINT
              ? 'entry'
              : overlapsScenery(field.id, point, DEFENDER_FOOTPRINT, state.battlefieldVersion, state.layoutRevision)
                ? 'obstacle'
                : defenders.some(
                      (unit) =>
                        Math.hypot(unit.homeX - point.x, unit.homeY - point.y) < DEFENDER_FOOTPRINT * 2 ||
                        (!!unit.battleRelocation?.destination &&
                          Math.hypot(
                            unit.battleRelocation.destination.x - point.x,
                            unit.battleRelocation.destination.y - point.y
                          ) <
                            DEFENDER_FOOTPRINT * 2)
                    )
                  ? 'overlap'
                  : [...state.sandbags, ...roadItems(state)].some(
                        (bag) => Math.hypot(bag.x - point.x, bag.y - point.y) < ROAD_EFFECTS.sandbag.defenderClearance
                      )
                    ? 'sandbag'
                    : state.economyVersion !== 2 && defenders.length >= state.stage
                      ? 'capacity'
                      : null
  return { point, valid: reason === null, reason, reachesRoad: roadDistance <= definition.range + definition.leash }
}
export function groundPlacementLabel(result: GroundPlacement): string {
  const reasons: Record<NonNullable<GroundPlacement['reason']>, string> = {
    phase: '仲間は準備中だけ配置できます。',
    'invalid-point': '戦場の地面を選んでください。',
    outside: '戦場の端から少し離してください。',
    base: '王国の門から離してください。',
    entry: '敵の入口から離してください。',
    obstacle: '木・岩などの障害物から離してください。',
    overlap: 'ほかの仲間から少し離してください。',
    sandbag: '土のうから少し離してください。',
    capacity: '配置上限です。仲間を選んで入れ替えるか、撤去してください。',
    locked: 'この仲間はまだ配置できません。',
    funds: '配置には40G必要です。',
    duplicate: '同じ種類の仲間は1体までです。配置中の仲間を移動してください。',
    'battle-used': 'このステージの移動は使用済みです。',
    'battle-range': '戦闘開始位置の移動範囲内へ。',
    'no-route': 'この位置へ歩いて移動できません。',
    'same-home': '別の位置へドラッグしてください。',
    'redeploy-range': 'このステージの移動範囲を超えています。',
    dead: '倒れた仲間は次のステージで回復します。'
  }
  return result.reason
    ? reasons[result.reason]
    : result.reachesRoad
      ? 'ここに配置できます。'
      : '配置できますが、移動しても道に攻撃が届きません。'
}
