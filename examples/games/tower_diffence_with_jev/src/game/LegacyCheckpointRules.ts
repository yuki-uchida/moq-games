import {
  CONFIG,
  DEFINITIONS,
  ENEMY_TYPES,
  isEnemyMelee,
  stageRules,
  type AllyType,
  type AIAction,
  type FormationId,
  type EnemyType,
  type Unit
} from './model'

export type LegacyCheckpointAction =
  | { type: 'spawn'; unitType: EnemyType; boss?: boolean }
  | { type: 'formation'; formationId: FormationId }
  | { type: 'wait' }
// Accepted pre-v12 heal outcomes must not follow later balance changes.
export const LEGACY_CHECKPOINT_HEAL_AMOUNT = { healer: 18, paladin: 8 } as const
export const LEGACY_PLAN_LIFETIME = 4
export const LEGACY_WAIT_LIFETIMES = [1, LEGACY_PLAN_LIFETIME] as const

export const LEGACY_STARTING_GOLD = 80
export const LEGACY_TANK_BASE_HP = 450
export const LEGACY_BASE_HP: Partial<Record<Unit['type'], number>> = {
  tank: LEGACY_TANK_BASE_HP,
  dragon: 290,
  slime: 48,
  goblin: 78,
  wolf: 65
}

function legacyBaseHp(type: Unit['type']): number {
  return LEGACY_BASE_HP[type] ?? DEFINITIONS[type].hp
}
export const LEGACY_ALLY_UNLOCK_STAGES: Readonly<Record<AllyType, number>> = {
  soldier: 1,
  archer: 1,
  runner: 2,
  tank: 3,
  mage: 1,
  healer: 1,
  frost: 5,
  ranger: 7,
  cannon: 1,
  paladin: 1
}
export const LEGACY_PURCHASED_ALLIES: readonly AllyType[] = ['mage', 'healer', 'cannon', 'paladin']
export function legacyCheckpointAllyAvailable(type: AllyType, stage: number, purchased: readonly AllyType[]): boolean {
  return LEGACY_PURCHASED_ALLIES.includes(type) ? purchased.includes(type) : LEGACY_ALLY_UNLOCK_STAGES[type] <= stage
}
const legacyAllyRanges: Partial<Record<AllyType, number>> = { soldier: 44, runner: 52, tank: 44, paladin: 46 }
function legacyRange(unit: Pick<Unit, 'owner' | 'type'>): number {
  return unit.owner === 'player'
    ? (legacyAllyRanges[unit.type as AllyType] ?? DEFINITIONS[unit.type].range)
    : DEFINITIONS[unit.type].range
}
export function preBalanceCheckpointCombatStats(
  unit: Pick<Unit, 'owner' | 'type' | 'boss'> & Partial<Pick<Unit, 'equipment'>>,
  stage: number,
  allyLevel = 1
) {
  const definition = DEFINITIONS[unit.type],
    scale = unit.owner === 'player' ? 1.12 ** (allyLevel - 1) : stageRules(stage).strength
  return {
    maxHp:
      legacyBaseHp(unit.type) *
      scale *
      (unit.owner === 'player' ? 0.75 * (unit.equipment === 'armor' ? 1.3 : 1) : unit.boss ? 2.6 : 1),
    attack:
      definition.attack *
      scale *
      (unit.boss ? 1.95 : 1) *
      (unit.owner === 'player' && unit.equipment === 'weapon' ? 1.2 : 1),
    range: legacyRange(unit) * (unit.boss ? 1.25 : 1)
  }
}

export function versionEightCheckpointCombatStats(
  unit: Pick<Unit, 'owner' | 'type' | 'boss'> & Partial<Pick<Unit, 'equipment'>>,
  stage: number,
  allyLevel = 1
) {
  const stats = preBalanceCheckpointCombatStats(unit, stage, allyLevel)
  return {
    ...stats,
    maxHp: stats.maxHp / (unit.owner === 'ai' && unit.boss ? 3 : 1),
    range: (unit.type === 'paladin' ? 46 : DEFINITIONS[unit.type].range) * (unit.boss ? 1.25 : 1)
  }
}

const unlockStages: Record<EnemyType, number> = {
  slime: 1,
  goblin: 1,
  wolf: 2,
  beetle: 3,
  shaman: 4,
  brute: 5,
  bat: 6,
  wraith: 7,
  ogre: 8,
  dragon: 10
}

const formations: Record<string, { types: EnemyType[]; interval: number }> = {
  skirmish: { types: ['slime', 'goblin'], interval: 0 },
  rush: { types: ['wolf', 'goblin'], interval: 0 },
  screen: { types: ['beetle', 'shaman'], interval: 1 },
  pressure: { types: ['brute', 'shaman'], interval: 1 },
  layered: { types: ['beetle', 'shaman', 'wraith'], interval: 1 },
  flight: { types: ['bat', 'wolf'], interval: 0 },
  heavy: { types: ['ogre', 'brute'], interval: 1 },
  barrage: { types: ['ogre', 'wraith', 'dragon'], interval: 0 }
}

const versionTwoFormations: Record<string, { types: EnemyType[]; interval: number }> = {
  ...formations,
  escort: { types: ['goblin', 'shaman'] as EnemyType[], interval: 1 }
}

export function isLegacyCheckpointAction(value: unknown, version: 1 | 2): value is LegacyCheckpointAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const action = value as Record<string, unknown>,
    knownFormations = version === 1 ? formations : versionTwoFormations
  return (
    (action.type === 'wait' && Object.keys(action).length === 1) ||
    (action.type === 'formation' &&
      Object.keys(action).length === 2 &&
      typeof action.formationId === 'string' &&
      Object.hasOwn(knownFormations, action.formationId)) ||
    (action.type === 'spawn' &&
      Object.keys(action).every((key) => ['type', 'unitType', 'boss'].includes(key)) &&
      ENEMY_TYPES.includes(action.unitType as EnemyType) &&
      (action.boss === undefined || typeof action.boss === 'boolean'))
  )
}

export function legacyCheckpointActionFromKey(key: string, version: 1 | 2): LegacyCheckpointAction | null {
  if (key === 'wait') return { type: 'wait' }
  const knownFormations = version === 1 ? formations : versionTwoFormations
  for (const formationId of Object.keys(knownFormations))
    if (key === `formation:${formationId}`) return { type: 'formation', formationId } as LegacyCheckpointAction
  for (const unitType of ENEMY_TYPES)
    for (const boss of [false, true])
      if (key === `spawn:${unitType}:${boss ? 1 : 0}`) return { type: 'spawn', unitType, boss }
  return null
}

export function legacyCheckpointRules(stage: number) {
  const level = Math.max(1, Math.min(CONFIG.stages, stage)),
    enemyCount = 3 + level * 2,
    bossType: EnemyType | null = level === 10 ? 'dragon' : level === 3 || level === 6 || level === 9 ? 'ogre' : null
  return {
    enemyCount,
    strength: 1 + (level - 1) * 0.09,
    spawnInterval: Math.max(1, 2.8 - level * 0.14),
    reward: 65 + level * 15,
    enemyTypes: ENEMY_TYPES.filter((type) => unlockStages[type] <= level),
    spawnBudget: enemyCount * (2 + Math.floor(level / 3)) + (bossType ? 5 : 0),
    bossType
  }
}

export function legacyCheckpointCombatStats(unit: Pick<Unit, 'owner' | 'type' | 'boss'>, stage: number, allyLevel = 1) {
  const definition = DEFINITIONS[unit.type],
    scale =
      unit.owner === 'player' ? 1.12 ** (allyLevel - 1) : legacyCheckpointRules(stage).strength * (unit.boss ? 2.6 : 1)
  return {
    maxHp: legacyBaseHp(unit.type) * scale,
    attack: definition.attack * scale * (unit.boss ? 0.75 : 1),
    range: unit.boss && isEnemyMelee(unit.type) ? (definition.range - 18) * 1.35 + 18 : legacyRange(unit)
  }
}

export function legacyCheckpointMembers(action: LegacyCheckpointAction, version: 1 | 2 = 1) {
  if (action.type === 'wait') return []
  if (action.type === 'spawn') return [{ unitType: action.unitType, delay: 0, boss: !!action.boss }]
  const knownFormations = version === 1 ? formations : versionTwoFormations,
    formation = Object.hasOwn(knownFormations, action.formationId) ? knownFormations[action.formationId] : undefined
  return formation
    ? formation.types.map((unitType, index) => ({ unitType, delay: index * formation.interval, boss: false }))
    : null
}

export function isVersionThreeCheckpointAction(value: unknown): value is AIAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const action = value as Record<string, unknown>
  return (
    (action.type === 'formation' &&
      Object.keys(action).length === 2 &&
      typeof action.formationId === 'string' &&
      Object.hasOwn(versionTwoFormations, action.formationId)) ||
    (Object.keys(action).every((key) => ['type', 'unitType', 'boss'].includes(key)) &&
      (action.type === 'spawn' || action.type === 'wait') &&
      ENEMY_TYPES.includes(action.unitType as EnemyType) &&
      (action.boss === undefined || typeof action.boss === 'boolean'))
  )
}
