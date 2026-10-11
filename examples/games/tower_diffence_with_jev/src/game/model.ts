import { observeDeploymentCombat, observeTankRoadblock } from './DeploymentCombatObservation'
import { canInitiateDamage, observeHealing } from './HealingActions'
import {
  activeSupportBuff,
  effectiveAttack,
  effectiveSpeed,
  effectiveArmor,
  type CommanderSupportState,
  type SupportBuff
} from './CommanderSupport'
import { observeFortifications } from './Fortifications'
import { physicalProjectionOnRoute, resolveBattlefield, routeFor, routeSurface } from './BattlefieldRoutes'
import type { BreathAttackState } from './BreathGeometry'
import type { TacticalHistorySummary } from './TacticalHistory'
export const ALLY_TYPES = [
  'soldier',
  'archer',
  'runner',
  'tank',
  'mage',
  'healer',
  'frost',
  'ranger',
  'cannon',
  'paladin'
] as const
export const TYPES = ALLY_TYPES
export const ENEMY_TYPES = [
  'slime',
  'goblin',
  'wolf',
  'beetle',
  'shaman',
  'brute',
  'bat',
  'wraith',
  'ogre',
  'dragon'
] as const
export type AllyType = (typeof ALLY_TYPES)[number]
export type EnemyType = (typeof ENEMY_TYPES)[number]
export const ENEMY_MELEE_TYPES: readonly EnemyType[] = ['slime', 'goblin', 'wolf', 'beetle', 'brute', 'bat', 'ogre']
export function isEnemyMelee(type: UnitType): boolean {
  return ENEMY_MELEE_TYPES.includes(type as EnemyType)
}
export type UnitType = AllyType | EnemyType
export type DamageSourceType = UnitType | 'gate' | 'spike'
export type Equipment = 'weapon' | 'armor'
export type RoadItemKind = 'spike' | 'mud'
export interface RoadItemAnchor extends Point {
  id: number
  edgeId: string
  offset: number
  progress: number
}
export interface Spike extends RoadItemAnchor {
  kind: 'spike'
  hp: number
  maxHp: number
}
export interface Mud extends RoadItemAnchor {
  kind: 'mud'
  charges: number
  insideIds: number[]
}
export type RoadItem = Spike | Mud
export interface GateShot {
  id: string
  sequence: number
  targetId: number
  power: number
  startedAt: number
  releaseAt: number
  impactAt: number
  status: 'windup' | 'released' | 'hit' | 'missed' | 'cancelled'
  origin: Point
  target: Point
}
export interface FortificationsState {
  items: RoadItem[]
  gate: { cannonLevel: number; armorLevel: number; cooldown: number; sequence: number; shots: GateShot[] }
  fortificationSpend: number
  gearSpend: number
}
export type Owner = 'player' | 'ai'
export interface Point {
  x: number
  y: number
}
export type Placement = Point | { slotId: number }
export const FORMATIONS = {
  skirmish: {
    label: '小隊の同時攻勢',
    aim: '単体迎撃に複数種で圧力をかける',
    types: ['slime', 'goblin'],
    interval: 0
  },
  rush: {
    label: '高速突破',
    aim: '速い先頭に続いて防衛線を通過する',
    types: ['wolf', 'goblin'],
    interval: 0
  },
  screen: {
    label: '装甲の前衛',
    aim: '甲虫を先行させて後衛を送り込む',
    types: ['beetle', 'shaman'],
    interval: 1
  },
  pressure: {
    label: '重装の前衛',
    aim: 'ブルートを先行させて遠距離役を支える',
    types: ['brute', 'shaman'],
    interval: 1
  },
  layered: {
    label: '三段の攻勢',
    aim: '甲虫・メイジ・レイスの順で間隔を空ける',
    types: ['beetle', 'shaman', 'wraith'],
    interval: 1
  },
  flight: {
    label: '高速の同時攻勢',
    aim: '高速二種で手薄な射程を通り抜ける',
    types: ['bat', 'wolf'],
    interval: 0
  },
  heavy: {
    label: '重装の縦隊',
    aim: 'オーガとブルートを間隔を空けて進める',
    types: ['ogre', 'brute'],
    interval: 1
  },
  escort: {
    label: 'ゴブリンの護衛',
    aim: 'ゴブリンを先行させて遠距離役を支える',
    types: ['goblin', 'shaman'],
    interval: 1,
    unlockStage: 2
  },
  barrage: {
    label: '混成の同時攻勢',
    aim: '大型・遠距離・範囲役で同時に圧力をかける',
    types: ['ogre', 'wraith', 'dragon'],
    interval: 0
  },
  breakthrough: {
    label: '装甲と高速の突破',
    aim: '甲虫を先行させてウルフを送り込む',
    types: ['beetle', 'wolf'],
    interval: 1,
    unlockStage: 3
  }
} as const satisfies Record<
  string,
  { label: string; aim: string; types: readonly EnemyType[]; interval: number; unlockStage?: number }
>
export type FormationId = keyof typeof FORMATIONS
export type BattlefieldVersion = 1 | 2
export type LayoutRevision = 1 | 2 | 3
export type RouteId = 'left' | 'right'
export const ROUTE_IDS: readonly RouteId[] = ['left', 'right']
export type AIAction =
  | { type: 'spawn'; unitType: EnemyType; boss?: boolean; routeId?: RouteId; targetId?: number }
  | { type: 'formation'; formationId: FormationId; routeId?: RouteId }
  | { type: 'wait'; unitType: EnemyType; boss?: boolean }
export interface ScheduledSpawn {
  deploymentId: number
  unitType: EnemyType
  boss: boolean
  spawnAt: number
  cost: number
  previousCooldownUntil: number
  routeId?: RouteId
  targetId?: number
  returnProgress?: number
}
export interface DeploymentOutcome {
  id: number
  stage: number
  actionKey: string
  spawned: number
  resolved: number
  maxProgress: number
  baseDamage: number
  defenderDamage: number
  cancelled: number
}
export interface StageSummary {
  stage: number
  spawned: number
  resolved: number
  maxProgress: number
  baseDamage: number
  defenderDamage: number
}
export interface TacticalPlan {
  id: number
  actionKey: string
  label: string
  reason: string
  startedAt: number
  expiresAt: number
  status: 'executing' | 'observing' | 'interrupted' | 'completed'
  reconsideration: string | null
}
export interface DefenseObservation {
  livingDefenders: number
  singleTargetDefenders: number
  areaDefenders: number
  longRangeDefenders: number
  frontConcentration: number
  frontCoverage: number
}
export interface ModelProbabilityEvidence {
  offeredActions: AIAction[]
  provided: { action: AIAction; probability: number }[]
  status: 'complete' | 'partial' | 'unavailable'
}
export type DirectorScoreSource = 'provided-scores' | 'selected-action-fallback'
export type CooldownWaitAction = Extract<AIAction, { type: 'wait' }>
export interface CooldownHold {
  action: CooldownWaitAction
  phase: 'cooling' | 'ready' | 'invalidated'
  stage: number
  fieldId: FieldId
  startedAt: number
}
export interface DeploymentRequestContext {
  cooldownReady?: CooldownWaitAction
}
export interface AIDecision {
  action: AIAction
  scores?: { action: AIAction; score: number }[]
  scoreSource?: DirectorScoreSource
  probabilityEvidence?: ModelProbabilityEvidence
  source?: string
}
export type AINoDecisionReason =
  | 'no-legal-actions'
  | 'active-plan'
  | 'backoff'
  | 'busy'
  | 'throttled'
  | 'not-configured'
  | 'timeout'
  | 'error'
  | 'unavailable'
export interface AINoDecision {
  type: 'unavailable'
  reason: AINoDecisionReason
  source?: string
}
export type AIResult = AIAction | AIDecision | AINoDecision | null
export interface CommanderOrderEvidence {
  readonly revision: number
  readonly acceptedAt: number
  readonly stage: number
  readonly fieldId: FieldId
  readonly source: string
  readonly requested: Readonly<AIAction>
  readonly applied: Readonly<AIAction>
}
export interface DirectorSelection {
  readonly requested: Readonly<AIAction>
  readonly applied: Readonly<AIAction>
  readonly probabilityEvidence: {
    readonly offeredActions: readonly Readonly<AIAction>[]
    readonly provided: readonly { readonly action: Readonly<AIAction>; readonly probability: number }[]
    readonly status: ModelProbabilityEvidence['status']
  }
  readonly scoreSource: DirectorScoreSource
  readonly selectionMixture: {
    readonly scoreWeight: number
    readonly explorationWeight: number
  }
  readonly explorationMethod?: 'deployment-route-mode-target'
  readonly explorationDistribution?: readonly {
    readonly action: Readonly<AIAction>
    readonly probability: number
  }[]
  readonly selectionScores: readonly { readonly action: Readonly<AIAction>; readonly score: number }[]
  readonly finalDistribution: readonly { readonly action: Readonly<AIAction>; readonly probability: number }[]
  readonly selectionReason: 'explicit-wait' | 'weighted-draw'
}
export interface DirectorDecisionTrace extends CommanderOrderEvidence, DirectorSelection {
  readonly request: {
    /** Assigned by the request-owning controller, never read from a model action. */
    readonly jevRequestId?: string
    readonly at: number
    readonly stage: number
    readonly fieldId: FieldId
    readonly revision: number
    readonly legalActions: readonly Readonly<AIAction>[]
    readonly cooldowns: Readonly<Record<EnemyType, number>>
    readonly flightTargets?: readonly { readonly id: number; readonly type: AllyType }[]
  }
}
export const CONFIG = {
  baseHp: 100,
  step: 1 / 60,
  decisionInterval: 1,
  maxUnits: 48,
  stages: 10,
  roadWidth: 48,
  maxSnapshotUnits: 48,
  maxLegalActions: 100,
  maxBattlefieldActions: 100,
  maxAICandidateDiagnostics: 110,
  planLifetime: 4,
  waitPlanLifetime: 1,
  maxDecisionAgeMs: 2500
}
export const ROAD_EFFECTS = {
  surface: { length: 140, startRatio: 0.38, speedFactor: 0.8 },
  sandbag: {
    hp: 60,
    radius: 18,
    minimumSpacing: 56,
    entryClearance: 180,
    coreClearance: 180,
    defenderClearance: 42
  }
}
export const AIRBORNE_ENEMIES: readonly EnemyType[] = ['bat', 'wraith', 'dragon']
export function isAirborneEnemy(type: UnitType): boolean {
  return AIRBORNE_ENEMIES.includes(type as EnemyType)
}
export const RANGED_ALLY_TYPES: readonly AllyType[] = ['archer', 'mage', 'healer', 'frost', 'ranger', 'cannon']
const WRAITH_MELEE_TARGETERS: readonly AllyType[] = ['soldier', 'runner', 'tank', 'paladin']
/** Historical target geometry, also used by already accepted legacy projectiles.
 * New offensive actions and capability displays must additionally use canInitiateDamage. */
export function canTargetUnit(
  attacker: Pick<Unit, 'owner' | 'type'>,
  target: Pick<Unit, 'owner' | 'type'>,
  battlefieldVersion: BattlefieldVersion = 1
): boolean {
  return (
    battlefieldVersion === 1 ||
    attacker.owner !== 'player' ||
    target.owner !== 'ai' ||
    !isAirborneEnemy(target.type) ||
    (target.type === 'wraith' && WRAITH_MELEE_TARGETERS.includes(attacker.type as AllyType)) ||
    RANGED_ALLY_TYPES.includes(attacker.type as AllyType)
  )
}
export interface SlowSurface {
  kind: 'mud' | 'soft-sand' | 'slush' | 'ash'
  startProgress: number
  endProgress: number
  speedFactor: number
}
export interface Sandbag extends Point {
  edgeId?: string
  offset?: number
  id: number
  progress: number
  hp: number
  maxHp: number
}
export interface SandbagPlacement {
  edgeId?: string
  offset?: number
  valid: boolean
  reason:
    | 'phase'
    | 'invalid-point'
    | 'off-road'
    | 'entry-clearance'
    | 'core-clearance'
    | 'defender-overlap'
    | 'barrier-overlap'
    | 'missing-barrier'
    | 'unavailable'
    | null
  point: Point
  progress: number
  distance: number
}
export const DEFENDER_ROAD_CLEARANCE = CONFIG.roadWidth / 2 + 12
export const ANIMATION = { attack: 0.3, hit: 0.24 }
export const DEBUG = true
export interface UnitDefinition {
  name: string
  role: string
  hp: number
  attack: number
  speed: number
  range: number
  attackSpeed: number
  cooldown: number
  cost: number
  unlockStage: number
  purchaseCost: number
  color: string
  armor: number
  splash: number
  slow: number
  heal: number
  leash: number
}
function definition(
  name: string,
  role: string,
  hp: number,
  attack: number,
  speed: number,
  range: number,
  attackSpeed: number,
  color: string,
  extra: Partial<UnitDefinition> = {}
): UnitDefinition {
  return {
    name,
    role,
    hp,
    attack,
    speed,
    range,
    attackSpeed,
    color,
    cooldown: 2,
    cost: 1,
    unlockStage: 1,
    purchaseCost: 0,
    armor: 0,
    splash: 0,
    slow: 0,
    heal: 0,
    leash: speed === 0 ? (range > 170 ? 14 : 26) : 0,
    ...extra
  }
}
export const DEFINITIONS: Record<UnitType, UnitDefinition> = {
  soldier: definition('小さな剣士', '近距離の連撃', 210, 34, 0, 66, 1.4, '#75b6d5', { leash: 96 }),
  archer: definition('森の射手', '長射程の単体攻撃', 130, 25, 0, 205, 1.1, '#8fb85b'),
  runner: definition('槍の斥候', '素早い槍の迎撃', 165, 25, 0, 78, 1.8, '#f0be72', {
    unlockStage: 1,
    leash: 128
  }),
  tank: definition('盾の騎士', '敵1体を拘束・矢30%減・魔法30%増', 270, 26, 0, 88, 0.9, '#9faec6', {
    unlockStage: 1,
    leash: 24,
    armor: 0.45
  }),
  mage: definition('星の魔法使い', '小範囲の魔法攻撃', 145, 39, 0, 185, 0.8, '#be91d8', {
    purchaseCost: 100,
    splash: 60
  }),
  healer: definition('花の癒やし手', '近くの仲間を回復', 170, 8, 0, 175, 0.8, '#f1a6b8', {
    purchaseCost: 80,
    heal: 18
  }),
  frost: definition('霜の術師', '敵の移動を短時間遅くする', 155, 22, 0, 180, 1, '#8ddbe4', {
    purchaseCost: 80,
    slow: 0.55
  }),
  ranger: definition('鷹の狩人', '最長射程・強力な一撃', 150, 62, 0, 265, 0.65, '#67b38d', {
    purchaseCost: 80
  }),
  cannon: definition('火薬の工兵', '広範囲の砲撃', 220, 62, 0, 190, 0.55, '#e9a65f', {
    purchaseCost: 140,
    splash: 85,
    leash: 0
  }),
  paladin: definition('光の守護者', '装甲を持つ近接範囲攻撃', 330, 38, 0, 88, 1, '#edda8c', {
    purchaseCost: 180,
    leash: 48,
    armor: 0.25,
    splash: 48
  }),
  slime: definition('ぷるぷるスライム', 'ゆっくり進む小さな敵', 96, 5, 64, 44, 0.7, '#83ceae', {
    cooldown: 2
  }),
  goblin: definition('いたずらゴブリン', '前衛に阻まれながら後衛を狙う歩兵', 156, 8, 78, 48, 0.8, '#a8bb69', {
    cooldown: 3,
    cost: 2
  }),
  wolf: definition('夕焼けウルフ', '速く駆け抜ける', 130, 8, 130, 52, 1.1, '#c79478', {
    unlockStage: 2,
    cost: 2,
    cooldown: 4
  }),
  beetle: definition('鉄甲ビートル', '装甲・矢30%減・魔法30%増', 135, 9, 60, 48, 0.7, '#8a8ec7', {
    unlockStage: 3,
    cost: 3,
    cooldown: 5,
    armor: 0.3
  }),
  shaman: definition('きのこメイジ', '離れた仲間にも反撃', 90, 12, 66, 185, 0.8, '#ca83bd', {
    unlockStage: 1,
    cost: 3,
    cooldown: 5
  }),
  brute: definition('岩のブルート', '両拳で着弾点の周囲を攻撃', 230, 16, 52, 48, 0.65, '#b39e7a', {
    unlockStage: 5,
    cost: 4,
    cooldown: 6
  }),
  bat: definition('夜のコウモリ', '道路沿いを高速で飛ぶ', 65, 8, 155, 44, 1.3, '#a594d6', {
    unlockStage: 6,
    cost: 3,
    cooldown: 4
  }),
  wraith: definition('霧のレイス', '装甲を持つ遠距離の敵', 145, 14, 86, 165, 0.8, '#88ceda', {
    unlockStage: 3,
    cost: 4,
    cooldown: 6,
    armor: 0.15
  }),
  ogre: definition('おなかオーガ', '棍棒で前方を薙ぎ払う', 310, 22, 48, 64, 0.65, '#ca9b83', {
    unlockStage: 8,
    cost: 5,
    cooldown: 8
  }),
  dragon: definition('小さなドラゴン', '範囲攻撃の最上位敵', 261, 18, 74, 170, 0.8, '#d28d70', {
    unlockStage: 9,
    cost: 5,
    cooldown: 8,
    splash: 70
  })
}
export type FieldId = 'meadow' | 'desert' | 'frost' | 'volcanic'
export interface Field {
  id: FieldId
  name: string
  description: string
  width: number
  height: number
  path: Point[]
  slowSurface: SlowSurface
  slots: (Point & { id: number })[]
  weights: Record<EnemyType, number>
  theme: {
    ground: string
    grass: string
    road: string
    edge: string
    water: string
    accent: string
    foliage: string
  }
}
export function pathLength(path: readonly Point[]): number {
  return path.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0)
}
export function pointOnPath(path: readonly Point[], distance: number): Point {
  let remaining = Math.max(0, distance)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining <= length)
      return { x: a.x + ((b.x - a.x) * remaining) / length, y: a.y + ((b.y - a.y) * remaining) / length }
    remaining -= length
  }
  return { ...path[path.length - 1] }
}
export function projectToPath(path: readonly Point[], p: Point): Point & { progress: number; distance: number } {
  let nearest = { ...path[0], progress: 0, distance: Infinity },
    accumulated = 0
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1],
      b = path[index],
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy)
    if (!length) continue
    const fraction = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length))),
      x = a.x + dx * fraction,
      y = a.y + dy * fraction,
      distance = Math.hypot(p.x - x, p.y - y)
    if (distance < nearest.distance) nearest = { x, y, progress: accumulated + length * fraction, distance }
    accumulated += length
  }
  return nearest
}
export function distanceToPath(path: readonly Point[], p: Point): number {
  return projectToPath(path, p).distance
}
export function entranceFacing(
  fieldId: FieldId,
  point: Point,
  battlefieldVersion: BattlefieldVersion = 1,
  layoutRevision: LayoutRevision = 1
): Point {
  const entry = getField(fieldId, battlefieldVersion, layoutRevision).entrance
  return { x: entry.x - point.x, y: entry.y - point.y }
}
export function advanceRoadProgress(progress: number, speed: number, dt: number, surface?: SlowSurface): number {
  if (speed <= 0 || dt <= 0) return progress
  let remaining = dt
  if (surface && progress < surface.startProgress) {
    const timeToSurface = (surface.startProgress - progress) / speed
    if (remaining <= timeToSurface) return progress + speed * remaining
    progress = surface.startProgress
    remaining -= timeToSurface
  }
  if (surface && progress < surface.endProgress) {
    const slowedSpeed = speed * surface.speedFactor,
      timeToExit = (surface.endProgress - progress) / slowedSpeed
    if (remaining <= timeToExit) return progress + slowedSpeed * remaining
    progress = surface.endProgress
    remaining -= timeToExit
  }
  return progress + speed * remaining
}
function field(
  id: FieldId,
  name: string,
  description: string,
  coords: number[][],
  theme: Field['theme'],
  bias: Partial<Record<EnemyType, number>>
): Field {
  const path = coords.map(([x, y]) => ({ x, y })),
    slots: Field['slots'] = []
  for (let distance = 180; distance < pathLength(path) - 100; distance += 145) {
    const p = pointOnPath(path, distance),
      q = pointOnPath(path, distance + 1),
      dx = q.x - p.x,
      dy = q.y - p.y,
      size = Math.hypot(dx, dy)
    for (const side of [-1, 1]) {
      const point = { x: p.x - (dy / size) * 66 * side, y: p.y + (dx / size) * 66 * side }
      if (
        point.x < 50 ||
        point.x > 1230 ||
        point.y < 50 ||
        point.y > 910 ||
        distanceToPath(path, point) < 52 ||
        slots.some((s) => Math.hypot(s.x - point.x, s.y - point.y) < 90)
      )
        continue
      slots.push({ id: slots.length, ...point })
    }
  }
  return {
    id,
    name,
    description,
    width: 1280,
    height: 960,
    path,
    slowSurface: {
      kind: ({ meadow: 'mud', desert: 'soft-sand', frost: 'slush', volcanic: 'ash' } as const)[id],
      startProgress: Math.round(pathLength(path) * ROAD_EFFECTS.surface.startRatio),
      endProgress: Math.round(pathLength(path) * ROAD_EFFECTS.surface.startRatio) + ROAD_EFFECTS.surface.length,
      speedFactor: ROAD_EFFECTS.surface.speedFactor
    },
    slots,
    theme,
    weights: Object.fromEntries(ENEMY_TYPES.map((t) => [t, 1 + 0.7 * ((bias[t] ?? 1) - 1)])) as Record<
      EnemyType,
      number
    >
  }
}
export const FIELDS: Record<FieldId, Field> = {
  meadow: field(
    'meadow',
    '苔むす森',
    '曲がりくねった林道 · スライムとゴブリンが多い',
    [
      [60, 160],
      [420, 160],
      [420, 380],
      [180, 380],
      [180, 660],
      [690, 660],
      [690, 300],
      [1090, 300],
      [1090, 820],
      [1220, 820]
    ],
    {
      ground: '#729c67',
      grass: '#8cb878',
      road: '#ccb789',
      edge: '#82785a',
      water: '#639da1',
      accent: '#e1d59c',
      foliage: '#426e50'
    },
    { slime: 1.8, goblin: 1.5, dragon: 0.7 }
  ),
  desert: field(
    'desert',
    '琥珀の峡谷',
    '長い折り返しの砂道 · ウルフと甲虫が多い',
    [
      [60, 160],
      [1060, 160],
      [1060, 370],
      [200, 370],
      [200, 590],
      [1060, 590],
      [1060, 820],
      [1220, 820]
    ],
    {
      ground: '#c39765',
      grass: '#d7ae77',
      road: '#e5ca92',
      edge: '#9f7652',
      water: '#87aeaa',
      accent: '#f3dda1',
      foliage: '#827c51'
    },
    { wolf: 1.8, beetle: 1.6, slime: 0.6 }
  ),
  frost: field(
    'frost',
    '月白の雪原',
    '氷の階段を巡る道 · レイスとコウモリが多い',
    [
      [60, 140],
      [340, 140],
      [340, 340],
      [620, 340],
      [620, 140],
      [1030, 140],
      [1030, 530],
      [790, 530],
      [790, 790],
      [1220, 790]
    ],
    {
      ground: '#bed5d9',
      grass: '#dce9e4',
      road: '#9ebcc6',
      edge: '#7f9ead',
      water: '#6e9db7',
      accent: '#f4e7b1',
      foliage: '#759b9c'
    },
    { wraith: 1.8, bat: 1.5, shaman: 1.3, wolf: 0.7 }
  ),
  volcanic: field(
    'volcanic',
    '熾火の砦',
    '溶岩を囲む渦巻き道 · 大型の敵が多い',
    [
      [60, 140],
      [1110, 140],
      [1110, 820],
      [220, 820],
      [220, 360],
      [800, 360],
      [800, 630],
      [510, 630]
    ],
    {
      ground: '#625b69',
      grass: '#7c6975',
      road: '#aa9290',
      edge: '#494552',
      water: '#ce7452',
      accent: '#f3b471',
      foliage: '#855e66'
    },
    { brute: 1.6, ogre: 1.7, dragon: 1.8, slime: 0.7 }
  )
}
export function getField(
  fieldId: FieldId,
  battlefieldVersion: BattlefieldVersion = 1,
  layoutRevision: LayoutRevision = 1
) {
  // Do not let arrays, boxed strings or prototype keys alias a supported field/cache seed.
  if (typeof fieldId !== 'string' || !Object.hasOwn(FIELDS, fieldId)) throw new RangeError('Unknown battlefield field')
  return resolveBattlefield(FIELDS[fieldId], battlefieldVersion, layoutRevision)
}
export function fieldFor(
  state: Pick<GameState, 'fieldId' | 'battlefieldVersion'> & Partial<Pick<GameState, 'layoutRevision'>>
) {
  return getField(
    state.fieldId,
    state.battlefieldVersion,
    state.layoutRevision === undefined ? 1 : state.layoutRevision
  )
}
export function routePathFor(
  state: Pick<GameState, 'fieldId' | 'battlefieldVersion'> & Partial<Pick<GameState, 'layoutRevision'>>,
  routeId?: RouteId
): Point[] {
  return routeFor(fieldFor(state), routeId).path
}
export type WaveBossPolicy = 1 | 2
const WAVE_BOSSES: Record<WaveBossPolicy, Partial<Record<number, EnemyType>>> = {
  1: { 3: 'ogre', 6: 'ogre', 9: 'ogre', 10: 'dragon' },
  2: { 3: 'ogre', 5: 'wolf', 7: 'beetle', 8: 'brute', 9: 'ogre', 10: 'dragon' }
}
export function stageRules(stage: number, waveBossPolicy: WaveBossPolicy = 2) {
  const level = Math.max(1, Math.min(CONFIG.stages, stage)),
    enemyCount = 3 + level * 2,
    bossType = WAVE_BOSSES[waveBossPolicy][level] ?? null
  return {
    enemyCount,
    strength: 1 + (level - 1) * 0.1,
    spawnInterval: Math.max(1, 2.8 - level * 0.14),
    reward: 65 + level * 15,
    enemyTypes: ENEMY_TYPES.filter((t) => DEFINITIONS[t].unlockStage <= level),
    spawnBudget: enemyCount * (2 + Math.floor(level / 3)) + (bossType ? 5 : 0),
    bossType
  }
}
export const REGULAR_ENEMY_ATTACK_MULTIPLIER = 1.3
export const unitLevelMultiplier = (level: number): number => 1.12 ** (level - 1)
export function combatStats(
  unit: Pick<Unit, 'owner' | 'type' | 'boss'> & Partial<Pick<Unit, 'equipment'>>,
  stage: number,
  allyLevel = 1
) {
  const definition = DEFINITIONS[unit.type],
    scale = unit.owner === 'player' ? unitLevelMultiplier(allyLevel) : stageRules(stage).strength
  return {
    maxHp:
      (definition.hp *
        scale *
        (unit.owner === 'player'
          ? 0.75 *
            (RANGED_ALLY_TYPES.includes(unit.type as AllyType) ? 0.5 : 1) *
            (unit.equipment === 'armor' ? 1.3 : 1)
          : unit.boss
            ? 2.6
            : 1)) /
      (unit.owner === 'ai' && unit.boss ? 3 : 1),
    attack:
      definition.attack *
      scale *
      (unit.boss ? 1.95 : unit.owner === 'ai' ? REGULAR_ENEMY_ATTACK_MULTIPLIER : 1) *
      (unit.owner === 'player' && unit.equipment === 'weapon' ? 1.2 : 1),
    range: definition.range * (unit.boss ? 1.25 : 1)
  }
}
export function deploymentCooldown(type: EnemyType, stage: number): number {
  return DEFINITIONS[type].cooldown * (stage === 1 ? 1.5 : 1)
}
export function attackSplash(
  type: UnitType,
  boss = false,
  battlefieldVersion: BattlefieldVersion = 1,
  geometryScale: 1 | 2 = 2
): number {
  return (
    DEFINITIONS[type].splash *
    (boss ? 1.25 : 1) *
    (battlefieldVersion === 2 && ENEMY_TYPES.includes(type as EnemyType) ? 1.25 : 1) *
    (ENEMY_TYPES.includes(type as EnemyType) ? geometryScale : 1)
  )
}
export const TANK_GUARD = { moveSpeed: 32, returnDelay: 1.5 } as const

export interface Unit {
  supportBuff?: SupportBuff
  equipment?: Equipment
  mudSlowUntil?: number
  level?: number
  hasFought?: boolean
  redeployAnchor?: Point
  battleRelocation?: { anchor: Point; usedStage?: number; destination?: Point; waypoints?: Point[] }
  routeId?: RouteId
  flight?: { targetId: number; returnProgress: number; phase: 'approach' | 'engage' | 'return' }
  gateExit?: { attackId: string; exitAt: number }
  id: number
  owner: Owner
  type: UnitType
  slotId?: number
  x: number
  y: number
  homeX: number
  homeY: number
  progress: number
  travelled: number
  hp: number
  maxHp: number
  attack: number
  speed: number
  attackRange: number
  attackSpeed: number
  attackCooldown: number
  /** Independent support clock. Absent only on historical/non-healing units. */
  healCooldown?: number
  returnHomeAt?: number
  attackAnimation: number
  attackSequence: number
  attackStartedAt: number
  hitAnimation: number
  attackTargetX: number
  attackTargetY: number
  moving: boolean
  facingX: number
  facingY: number
  boss: boolean
  slowUntil: number
  slowFactor: number
}
export interface Corpse {
  readonly id: number
  readonly key: string
  readonly owner: Owner
  readonly type: UnitType
  readonly boss: boolean
  readonly x: number
  readonly y: number
  readonly facingX: number
  readonly facingY: number
  readonly diedAt: number
  readonly activePose: boolean
  readonly fieldId: FieldId
  readonly stage: number
}
export type Cooldowns = Record<EnemyType, number>
export const emptyCooldowns = (): Cooldowns => Object.fromEntries(ENEMY_TYPES.map((t) => [t, 0])) as Cooldowns
export interface CombatAttack {
  damageType?: 'melee' | 'arrow' | 'magic' | 'physical'
  /** Captured on acceptance. Missing means a committed historical 1.0x action. */
  timeScale?: 0.8
  /** Preserves the accepted 46-unit range across the v15 Paladin migration. */
  legacyPaladinRange?: true
  /** Undefined identifies an already committed historical coupled action. */
  kind?: 'attack' | 'heal'
  geometryScale?: 1 | 2
  legacyRegularAttack?: true
  supportAttack?: Omit<SupportBuff, 'effect'>
  battlefieldVersion?: BattlefieldVersion
  variant?: 'breath'
  breath?: BreathAttackState
  id: string
  attackerId: number
  sequence: number
  owner: Owner
  type: UnitType
  targetId?: number
  barrierId?: number
  healing?: { targetId: number; target: Point; active: boolean; hit: boolean; amount?: number }
  damageActive: boolean
  damageHit: boolean
  base: boolean
  power: number
  range: number
  startedAt: number
  releaseAt: number
  impactAt: number
  endsAt: number
  projectile: boolean
  status: 'windup' | 'released' | 'hit' | 'missed' | 'cancelled'
  origin: Point
  target: Point
  aim?: Point
  targetVelocity?: Point
  boss?: boolean
}
export interface GameState {
  cooldownHold?: CooldownHold
  commanderSupportVersion?: 1
  commanderSupport?: CommanderSupportState
  fortifications?: FortificationsState
  economyVersion?: 2
  reserveUnits?: Unit[]
  readonly battleId: number
  corpses: readonly Corpse[]
  commanderOrder: CommanderOrderEvidence | null
  decisionTrace: DirectorDecisionTrace | null
  historyEnabled: boolean
  tacticalHistory: TacticalHistorySummary | null
  time: number
  stage: number
  waveBossPolicy: WaveBossPolicy
  battlefieldVersion: BattlefieldVersion
  layoutRevision: LayoutRevision
  phase: 'preparation' | 'assault' | 'cleared' | 'defeat' | 'victory'
  fieldId: FieldId
  seed: number
  playerBaseHp: number
  enemiesSpawned: number
  enemiesResolved: number
  budgetSpent: number
  nextSpawnAt: number
  units: Unit[]
  attacks: CombatAttack[]
  sandbags: Sandbag[]
  sandbagStock: number
  cooldowns: Cooldowns
  pendingSpawns: ScheduledSpawn[]
  reservedBudget: number
  strategy: TacticalPlan | null
  recentOutcomes: DeploymentOutcome[]
  stageSummary: StageSummary
  previousStageSummary: StageSummary | null
  result: 'win' | 'lose' | null
  lastAction: AIAction | null
  requestedAction: AIAction | null
  decisionTime: number
  decisionStatus: string
}
let nextBattleId = 0
export function initialState(
  fieldId: FieldId = 'meadow',
  seed = 20261003,
  battlefieldVersion: BattlefieldVersion = 1,
  layoutRevision: LayoutRevision = 1
): GameState {
  getField(fieldId, battlefieldVersion, layoutRevision)
  return {
    battleId: ++nextBattleId,
    corpses: [],
    commanderOrder: null,
    decisionTrace: null,
    historyEnabled: true,
    tacticalHistory: null,
    time: 0,
    stage: 1,
    waveBossPolicy: 2,
    battlefieldVersion,
    layoutRevision,
    phase: 'preparation',
    fieldId,
    seed,
    playerBaseHp: CONFIG.baseHp,
    enemiesSpawned: 0,
    enemiesResolved: 0,
    budgetSpent: 0,
    nextSpawnAt: 0,
    units: [],
    attacks: [],
    sandbags: [],
    sandbagStock: 1,
    cooldowns: emptyCooldowns(),
    pendingSpawns: [],
    reservedBudget: 0,
    strategy: null,
    recentOutcomes: [],
    stageSummary: { stage: 1, spawned: 0, resolved: 0, maxProgress: 0, baseDamage: 0, defenderDamage: 0 },
    previousStageSummary: null,
    result: null,
    lastAction: null,
    requestedAction: null,
    decisionTime: 0,
    decisionStatus: '準備中'
  }
}
export function isAction(value: unknown): value is AIAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const action = value as Record<string, unknown>,
    routeValid = action.routeId === undefined || ROUTE_IDS.includes(action.routeId as RouteId)
  if (action.type === 'formation')
    return (
      Object.keys(action).every((key) => ['type', 'formationId', 'routeId'].includes(key)) &&
      typeof action.formationId === 'string' &&
      Object.hasOwn(FORMATIONS, action.formationId) &&
      routeValid
    )
  if (action.type !== 'spawn' && action.type !== 'wait') return false
  const allowed =
    action.type === 'wait' ? ['type', 'unitType', 'boss'] : ['type', 'unitType', 'boss', 'routeId', 'targetId']
  return (
    Object.keys(action).every((key) => allowed.includes(key)) &&
    ENEMY_TYPES.includes(action.unitType as EnemyType) &&
    (action.boss === undefined || typeof action.boss === 'boolean') &&
    routeValid &&
    (action.targetId === undefined || (Number.isSafeInteger(action.targetId) && (action.targetId as number) > 0))
  )
}
const NO_DECISION_STATUSES: Record<AINoDecisionReason, string> = {
  'no-legal-actions': '出撃・CD待ちの候補なし',
  'active-plan': '作戦を実行中',
  backoff: 'API 混雑の再試行待ち',
  busy: '通信の受付待ち',
  throttled: '次の判断時刻を待機',
  'not-configured': 'Jev が未設定',
  timeout: '応答が時間切れ · 次回に再試行',
  error: '判断エラー · 次回に再試行',
  unavailable: '応答なし · 次回に再試行'
}
export function isNoDecision(value: unknown): value is AINoDecision {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return (
    Object.keys(result).every((key) => ['type', 'reason', 'source'].includes(key)) &&
    result.type === 'unavailable' &&
    typeof result.reason === 'string' &&
    Object.hasOwn(NO_DECISION_STATUSES, result.reason) &&
    (result.source === undefined || (typeof result.source === 'string' && result.source.length <= 80))
  )
}
export function noDecisionStatus(reason: AINoDecisionReason): string {
  return NO_DECISION_STATUSES[reason]
}
export function baseActionKey(action: AIAction): string {
  return action.type === 'formation'
    ? `formation:${action.formationId}`
    : `${action.type}:${action.unitType}:${action.boss ? 1 : 0}`
}
export function actionKey(action: AIAction): string {
  const route = action.type !== 'wait' && action.routeId ? `:route:${action.routeId}` : '',
    target = action.type === 'spawn' && action.targetId !== undefined ? `:target:${action.targetId}` : ''
  return `${baseActionKey(action)}${route}${target}`
}
export function actionLabel(action: AIAction): string {
  const label =
      action.type === 'formation'
        ? FORMATIONS[action.formationId].label
        : `${DEFINITIONS[action.unitType].name}${action.boss ? ' · BOSS' : ''}${action.type === 'wait' ? 'の出撃CD待ち' : ''}`,
    route = action.type !== 'wait' && action.routeId ? ` · ${action.routeId === 'left' ? '左' : '右'}ルート` : '',
    target = action.type === 'spawn' && action.targetId !== undefined ? ` · 防衛兵 #${action.targetId} へ直行` : ''
  return `${label}${route}${target}`
}
export function actionExplorationPrior(
  actions: readonly Readonly<AIAction>[],
  battlefieldVersion: BattlefieldVersion = 1
) {
  if (battlefieldVersion === 1) return actions.map((action) => ({ action, probability: 1 / actions.length }))
  const bases = new Map<string, Map<string, Map<string, Readonly<AIAction>[]>>>()
  for (const action of actions) {
    const base = baseActionKey(action),
      route = action.type === 'wait' ? '' : (action.routeId ?? ''),
      mode = action.type === 'spawn' && action.targetId !== undefined ? 'direct' : 'road',
      routes = bases.get(base) ?? new Map<string, Map<string, Readonly<AIAction>[]>>(),
      modes = routes.get(route) ?? new Map<string, Readonly<AIAction>[]>(),
      targets = modes.get(mode) ?? []
    targets.push(action)
    modes.set(mode, targets)
    routes.set(route, modes)
    bases.set(base, routes)
  }
  const probabilities = new Map<string, number>()
  for (const routes of bases.values())
    for (const modes of routes.values())
      for (const targets of modes.values())
        for (const action of targets)
          probabilities.set(actionKey(action), 1 / bases.size / routes.size / modes.size / targets.length)
  return actions.map((action) => ({ action, probability: probabilities.get(actionKey(action))! }))
}
export function actionMembers(action: AIAction): { unitType: EnemyType; delay: number; boss: boolean }[] {
  if (action.type === 'wait') return []
  if (action.type === 'spawn') return [{ unitType: action.unitType, delay: 0, boss: !!action.boss }]
  const formation = FORMATIONS[action.formationId]
  return formation.types.map((unitType, index) => ({
    unitType,
    delay: index * formation.interval,
    boss: false
  }))
}
export type DeploymentBlockReason =
  | { code: 'invalid-action' }
  | { code: 'legacy-route' }
  | { code: 'route-required' }
  | { code: 'invalid-target'; targetId: number }
  | { code: 'phase'; phase: GameState['phase'] }
  | { code: 'result'; result: 'win' | 'lose' }
  | { code: 'pending-formation'; count: number }
  | { code: 'spawn-interval'; remaining: number }
  | { code: 'unit-capacity'; required: number; available: number }
  | { code: 'invalid-formation' }
  | { code: 'formation-unlock'; formationId: FormationId; stage: number; unlockStage: number }
  | { code: 'boss-only'; bossType: EnemyType }
  | { code: 'boss-window'; bossType: EnemyType | null; remainingCount: number }
  | { code: 'unlock'; unitType: EnemyType; stage: number; unlockStage: number }
  | { code: 'remaining-count'; required: number; available: number; bossReserve: number }
  | { code: 'cooldown'; unitType: EnemyType; remaining: number; deployDelay: number }
  | { code: 'cooldown-ready'; unitType: EnemyType }
  | { code: 'budget'; cost: number; available: number; reserve: number; bossReserve: number }
export function deploymentBlockReasons(s: Readonly<GameState>, action: AIAction): DeploymentBlockReason[] {
  if (!isAction(action)) return [{ code: 'invalid-action' }]
  if (action.type === 'wait') {
    if (!Number.isFinite(s.cooldowns[action.unitType]) || s.cooldowns[action.unitType] < 0)
      return [{ code: 'invalid-action' }]
    const variants: AIAction[] =
        s.battlefieldVersion === 2
          ? ROUTE_IDS.map((routeId) => ({ ...action, type: 'spawn', routeId }))
          : [{ ...action, type: 'spawn' }],
      variantsReasons = variants.map((spawn) => deploymentBlockReasons(s, spawn))
    if (variantsReasons.some((reasons) => reasons.length > 0 && reasons.every((reason) => reason.code === 'cooldown')))
      return []
    const spawnReasons = variantsReasons[0],
      reasons = spawnReasons.filter((reason) => reason.code !== 'cooldown')
    if (!spawnReasons.some((reason) => reason.code === 'cooldown'))
      reasons.push({ code: 'cooldown-ready', unitType: action.unitType })
    return reasons
  }
  const reasons: DeploymentBlockReason[] = []
  if (s.battlefieldVersion === 2) {
    if (!action.routeId) reasons.push({ code: 'route-required' })
    if (
      action.type === 'spawn' &&
      action.targetId !== undefined &&
      (action.boss ||
        !isAirborneEnemy(action.unitType) ||
        !s.units.some((unit) => unit.id === action.targetId && isDirectFlightTarget(unit)))
    )
      reasons.push({ code: 'invalid-target', targetId: action.targetId })
  } else if (action.routeId !== undefined || (action.type === 'spawn' && action.targetId !== undefined)) {
    reasons.push({ code: 'legacy-route' })
  }
  if (s.phase !== 'assault') reasons.push({ code: 'phase', phase: s.phase })
  if (s.result) reasons.push({ code: 'result', result: s.result })
  const rules = stageRules(s.stage, s.waveBossPolicy),
    members = actionMembers(action)
  if (action.type === 'formation') {
    const formation = FORMATIONS[action.formationId]
    if ('unlockStage' in formation && s.stage < formation.unlockStage)
      reasons.push({
        code: 'formation-unlock',
        formationId: action.formationId,
        stage: s.stage,
        unlockStage: formation.unlockStage
      })
  }
  if (s.pendingSpawns.length) reasons.push({ code: 'pending-formation', count: s.pendingSpawns.length })
  if (s.time + 1e-9 < s.nextSpawnAt) reasons.push({ code: 'spawn-interval', remaining: s.nextSpawnAt - s.time })
  if (s.units.length + members.length > CONFIG.maxUnits)
    reasons.push({
      code: 'unit-capacity',
      required: members.length,
      available: Math.max(0, CONFIG.maxUnits - s.units.length)
    })
  const remainingCount = rules.enemyCount - s.enemiesSpawned
  const isBoss = !!rules.bossType && remainingCount === 1
  if (!members.length || members.length > 3 || new Set(members.map((m) => m.unitType)).size !== members.length)
    reasons.push({ code: 'invalid-formation' })
  if (isBoss) {
    if (action.type !== 'spawn' || !action.boss || action.unitType !== rules.bossType)
      reasons.push({ code: 'boss-only', bossType: rules.bossType! })
  } else {
    if (members.some((member) => member.boss))
      reasons.push({ code: 'boss-window', bossType: rules.bossType, remainingCount })
    for (const member of members)
      if (!member.boss && !rules.enemyTypes.includes(member.unitType))
        reasons.push({
          code: 'unlock',
          unitType: member.unitType,
          stage: s.stage,
          unlockStage: DEFINITIONS[member.unitType].unlockStage
        })
  }
  const bossReserve = rules.bossType && !isBoss ? 1 : 0
  if (members.length > remainingCount - bossReserve)
    reasons.push({
      code: 'remaining-count',
      required: members.length,
      available: Math.max(0, remainingCount - bossReserve),
      bossReserve
    })
  for (const member of members)
    if (s.cooldowns[member.unitType] > member.delay + 1e-9)
      reasons.push({
        code: 'cooldown',
        unitType: member.unitType,
        remaining: s.cooldowns[member.unitType],
        deployDelay: member.delay
      })
  const cost = members.reduce((sum, m) => sum + (m.boss ? 5 : DEFINITIONS[m.unitType].cost), 0)
  const minimumRemainingCost = Math.max(0, remainingCount - members.length - bossReserve) + bossReserve * 5
  if (cost + minimumRemainingCost > rules.spawnBudget - s.budgetSpent)
    reasons.push({
      code: 'budget',
      cost,
      available: rules.spawnBudget - s.budgetSpent,
      reserve: minimumRemainingCost,
      bossReserve: bossReserve * 5
    })
  return reasons
}
export function isLegalDeployment(s: Readonly<GameState>, action: AIAction): boolean {
  return deploymentBlockReasons(s, action).length === 0
}
function deploymentCandidates(stage: number, waveBossPolicy: WaveBossPolicy): AIAction[] {
  const candidates: AIAction[] = [
    ...ENEMY_TYPES.map((unitType) => ({ type: 'spawn' as const, unitType })),
    ...Object.keys(FORMATIONS).map((formationId) => ({
      type: 'formation' as const,
      formationId: formationId as FormationId
    }))
  ]
  const bossType = stageRules(stage, waveBossPolicy).bossType
  if (bossType) candidates.push({ type: 'spawn', unitType: bossType, boss: true })
  return candidates
}
export function getLegalAIActions(s: Readonly<GameState>): AIAction[] {
  return aiCandidates(s).filter((action) => isLegalDeployment(s, action))
}
export function isDirectFlightTarget(unit: Pick<Unit, 'owner' | 'type' | 'hp'>): boolean {
  return unit.owner === 'player' && unit.hp > 0 && RANGED_ALLY_TYPES.includes(unit.type as AllyType)
}
function rangedCover(unit: Readonly<Unit>, defenders: readonly Readonly<Unit>[]): number {
  return defenders.filter(
    (other) =>
      canInitiateDamage(other) &&
      other.id !== unit.id &&
      Math.hypot(other.x - unit.x, other.y - unit.y) <= other.attackRange
  ).length
}
export function directFlightTargets(s: Readonly<GameState>): readonly Readonly<Unit>[] {
  if (s.battlefieldVersion !== 2) return []
  // Identity order makes the wire contract stable without selecting or weighting
  // individuals by HP, cover, role, or whichever defender was placed first.
  return s.units.filter(isDirectFlightTarget).sort((a, b) => a.id - b.id)
}
function aiCandidates(s: Readonly<GameState>): AIAction[] {
  const rules = stageRules(s.stage, s.waveBossPolicy),
    bossWindow = !!rules.bossType && rules.enemyCount - s.enemiesSpawned === 1,
    deployments = deploymentCandidates(s.stage, s.waveBossPolicy).filter(
      (action) => s.battlefieldVersion !== 2 || (action.type === 'spawn' && !!action.boss) === bossWindow
    ),
    waits = deployments.flatMap((action): AIAction[] => (action.type === 'spawn' ? [{ ...action, type: 'wait' }] : []))
  if (s.battlefieldVersion !== 2) return [...deployments, ...waits]
  const targets = directFlightTargets(s)
  return [
    ...deployments.flatMap((action): AIAction[] =>
      ROUTE_IDS.flatMap((routeId): AIAction[] => [
        { ...action, routeId } as AIAction,
        ...(action.type === 'spawn' && !action.boss && isAirborneEnemy(action.unitType)
          ? targets.map((target) => ({ ...action, routeId, targetId: target.id }))
          : [])
      ])
    ),
    ...waits
  ]
}
export function getAICandidateDiagnostics(s: Readonly<GameState>) {
  return aiCandidates(s).map((action) => {
    const reasons = deploymentBlockReasons(s, action)
    return { action, legal: reasons.length === 0, reasons }
  })
}
export function observeDefense(s: Readonly<GameState>): DefenseObservation {
  const defenders = s.units.filter((u) => u.owner === 'player' && u.hp > 0),
    paths = fieldFor(s).routes.map((route) => route.path)
  let covered = 0
  for (const path of paths) {
    const frontLength = pathLength(path) / 3
    for (let i = 0; i < 16; i++) {
      const p = pointOnPath(path, (frontLength * (i + 0.5)) / 16)
      if (
        defenders.some(
          (u) =>
            canInitiateDamage(u) &&
            Math.hypot(p.x - u.homeX, p.y - u.homeY) <= u.attackRange + DEFINITIONS[u.type].leash
        )
      )
        covered++
    }
  }
  return {
    livingDefenders: defenders.length,
    singleTargetDefenders: defenders.filter((u) => canInitiateDamage(u) && !DEFINITIONS[u.type].splash).length,
    areaDefenders: defenders.filter((u) => DEFINITIONS[u.type].splash > 0).length,
    longRangeDefenders: defenders.filter((u) => u.attackRange >= 200).length,
    frontConcentration: defenders.length
      ? defenders.filter((u) =>
          paths.some((path) => projectToPath(path, { x: u.homeX, y: u.homeY }).progress <= pathLength(path) / 3)
        ).length / defenders.length
      : 0,
    frontCoverage: covered / (16 * paths.length)
  }
}
export function observeBattlefield(s: Readonly<GameState>) {
  const field = fieldFor(s),
    defenders = s.units.slice(0, CONFIG.maxSnapshotUnits).filter((unit) => unit.owner === 'player' && unit.hp > 0),
    ranged = defenders.filter((unit) => isDirectFlightTarget(unit) && canInitiateDamage(unit))
  return Object.freeze({
    routes: Object.freeze(
      field.routes.map((route) => {
        const samples = Object.freeze(
            Array.from({ length: 16 }, (_, index) => {
              const progress = (route.length * (index + 0.5)) / 16,
                point = pointOnPath(route.path, progress),
                covers = (unit: Unit) =>
                  Math.hypot(point.x - unit.homeX, point.y - unit.homeY) <=
                  unit.attackRange + DEFINITIONS[unit.type].leash
              return Object.freeze({
                progress,
                ...point,
                rangeCoverage: defenders.filter((unit) => canInitiateDamage(unit) && covers(unit)).length,
                antiAirCoverage: ranged.filter(covers).length
              })
            })
          ),
          barriers = Object.freeze(
            s.sandbags
              .filter((bag) => bag.hp > 0)
              .map((bag) => ({ bag, projection: physicalProjectionOnRoute(field, route.id, bag) }))
              .filter(({ projection }) => projection.distance <= ROAD_EFFECTS.sandbag.radius)
              .sort((a, b) => a.projection.progress - b.projection.progress || a.bag.id - b.bag.id)
              .slice(0, CONFIG.stages)
              .map(({ bag, projection }) =>
                Object.freeze({ id: bag.id, progress: projection.progress, hp: bag.hp, maxHp: bag.maxHp })
              )
          )
        return Object.freeze({
          routeId: route.id,
          label: route.label,
          length: route.length,
          path: Object.freeze(route.path.map((point) => Object.freeze({ ...point }))),
          samples,
          rangeCoverage: samples.filter((sample) => sample.rangeCoverage > 0).length / samples.length,
          antiAirCoverage: samples.filter((sample) => sample.antiAirCoverage > 0).length / samples.length,
          barriers,
          surface: Object.freeze({ ...routeSurface(field, route.id) })
        })
      })
    ),
    flightTargets: Object.freeze(
      directFlightTargets(s).map((unit) =>
        Object.freeze({
          id: unit.id,
          type: unit.type,
          x: unit.x,
          y: unit.y,
          hp: unit.hp,
          maxHp: unit.maxHp,
          nearbyRangedCover: rangedCover(unit, ranged)
        })
      )
    )
  })
}
export function tacticalOption(s: Readonly<GameState>, action: AIAction) {
  const defense = observeDefense(s)
  const observation = defense.areaDefenders
    ? `範囲迎撃 ${defense.areaDefenders} 体`
    : `単体迎撃 ${defense.singleTargetDefenders} 体`
  const aim =
    action.type === 'formation'
      ? FORMATIONS[action.formationId].aim
      : action.type === 'wait'
        ? `${DEFINITIONS[action.unitType].name}${action.boss ? ' BOSS' : ''}の出撃CD回復を待つ`
        : action.boss
          ? '最後の大型敵で拠点を狙う'
          : `${DEFINITIONS[action.unitType].role}を生かす`
  return {
    key: actionKey(action),
    label: actionLabel(action),
    reason: `${observation}・前方集中 ${Math.round(defense.frontConcentration * 100)}%：${aim}`,
    lifetime: action.type === 'wait' ? Math.max(0, s.cooldowns[action.unitType]) : CONFIG.planLifetime
  }
}
export function observeRoadEffects(s: Readonly<GameState>) {
  return {
    surface: { ...fieldFor(s).slowSurface },
    airborneTypes: [...AIRBORNE_ENEMIES],
    stock: s.sandbagStock,
    sandbags: s.sandbags
      .filter((bag) => bag.hp > 0)
      .sort((a, b) => a.progress - b.progress)
      .slice(0, CONFIG.stages)
      .map((bag) => ({
        id: bag.id,
        x: bag.x,
        y: bag.y,
        progress: bag.progress,
        hp: bag.hp,
        maxHp: bag.maxHp
      }))
  }
}
export function serializeStateForAI(s: Readonly<GameState>) {
  const field = fieldFor(s),
    rules = stageRules(s.stage, s.waveBossPolicy)
  const summarize = (u: Unit) => {
    const roadblockTank = observeTankRoadblock(s, u)
    return {
      id: u.id,
      type: u.type,
      ...(s.economyVersion === 2 && u.owner === 'player'
        ? { level: u.level, maxHp: u.maxHp, ...(u.equipment ? { equipment: u.equipment } : {}) }
        : {}),
      ...(s.economyVersion === 2 && u.owner === 'ai' && (u.mudSlowUntil ?? 0) > s.time
        ? { mudSlowRemaining: Math.round(((u.mudSlowUntil ?? 0) - s.time) * 100) / 100 }
        : {}),
      hp: Math.round(u.hp),
      combat: observeDeploymentCombat(s, u),
      ...(roadblockTank ? { roadblockTank } : {}),
      attack: canInitiateDamage(u) ? effectiveAttack(u, s.time) : 0,
      ...(observeHealing(u) ? { healing: observeHealing(u) } : {}),
      ...(s.commanderSupportVersion === 1
        ? {
            speed: effectiveSpeed(u, s.time),
            armor: effectiveArmor(u, s.time),
            maxHp: u.maxHp,
            supportBuff: activeSupportBuff(u, s.time) ? { ...u.supportBuff! } : undefined
          }
        : {}),
      x: Math.round(u.x),
      y: Math.round(u.y),
      progress: Math.round(u.progress),
      stationary: u.owner === 'player' && DEFINITIONS[u.type].leash === 0,
      homeX: Math.round(u.homeX),
      homeY: Math.round(u.homeY),
      leash: DEFINITIONS[u.type].leash,
      range: u.attackRange,
      boss: u.boss,
      splash: attackSplash(u.type, u.boss, s.battlefieldVersion),
      ...(s.battlefieldVersion === 2 ? { routeId: u.routeId, flight: u.flight ? { ...u.flight } : undefined } : {}),
      role:
        DEFINITIONS[u.type].splash || u.type === 'brute' || u.type === 'ogre'
          ? 'area'
          : DEFINITIONS[u.type].heal
            ? 'support'
            : 'single'
    }
  }
  const units = s.units.slice(0, CONFIG.maxSnapshotUnits),
    legalActions = getLegalAIActions(s)
  return {
    ...(s.commanderSupportVersion === 1 ? { commanderSupportVersion: 1 as const } : {}),
    ...(s.battlefieldVersion === 2 ? { battlefieldVersion: 2 as const, battlefield: observeBattlefield(s) } : {}),
    ...(s.economyVersion === 2 && s.fortifications ? { fortifications: observeFortifications(s) } : {}),
    time: Math.round(s.time * 10) / 10,
    combatObservation: { version: 1 as const, at: s.time },
    enemyActionTimeScale: 0.8 as const,
    stage: s.stage,
    phase: s.phase,
    result: s.result,
    playerBaseHp: s.playerBaseHp,
    field: {
      id: s.fieldId,
      pathLength: pathLength(field.path),
      weights: field.weights,
      ...(s.battlefieldVersion === 2
        ? {
            width: field.width,
            height: field.height,
            entrance: { ...field.entrance },
            gate: { ...field.gate }
          }
        : {})
    },
    wave: {
      ...rules,
      spawned: s.enemiesSpawned,
      resolved: s.enemiesResolved,
      budgetRemaining: rules.spawnBudget - s.budgetSpent,
      reservedCount: s.pendingSpawns.length,
      reservedBudget: s.reservedBudget,
      nextSpawnIn: Math.max(0, s.nextSpawnAt - s.time)
    },
    defenders: units.filter((u) => u.owner === 'player').map(summarize),
    enemies: units.filter((u) => u.owner === 'ai').map(summarize),
    cooldowns: { ...s.cooldowns },
    defense: observeDefense(s),
    roadEffects: observeRoadEffects(s),
    pendingSpawns: s.pendingSpawns.map((m) => ({
      unitType: m.unitType,
      inSeconds: Math.max(0, m.spawnAt - s.time),
      ...(s.battlefieldVersion === 2
        ? { routeId: m.routeId, targetId: m.targetId, returnProgress: m.returnProgress }
        : {})
    })),
    strategy: s.strategy ? { ...s.strategy } : null,
    historyEnabled: s.historyEnabled,
    tacticalHistory: s.historyEnabled && s.tacticalHistory ? structuredClone(s.tacticalHistory) : null,
    recentOutcomes: s.historyEnabled ? s.recentOutcomes.slice(-4).map((outcome) => ({ ...outcome })) : [],
    previousStageSummary: s.historyEnabled && s.previousStageSummary ? { ...s.previousStageSummary } : null,
    legalActions,
    tacticalOptions: legalActions.map((action) => tacticalOption(s, action))
  }
}

export function compareHistorySnapshots(s: Readonly<GameState>) {
  const board = structuredClone(s)
  return {
    enabled: serializeStateForAI({ ...board, historyEnabled: true }),
    disabled: serializeStateForAI({ ...board, historyEnabled: false })
  }
}
