import { heavyImpactGeometry } from '../game/HeavyImpact'
import { createRangedReviewScene } from './RangedScene'
import { ATTACK_PROFILES } from '../game/AttackProfiles'
import { GameEngine } from '../game/GameEngine'
import { BREATH_DIRECTIONS, type BreathDirection } from '../game/BreathGeometry'
import {
  ALLY_TYPES,
  CONFIG,
  DEFINITIONS,
  FIELDS,
  pathLength,
  pointOnPath,
  stageRules,
  type AIAction,
  type AIDecision,
  type AllyType,
  type FieldId,
  type Point,
  type Unit
} from '../game/model'
import { freshSave } from '../progression/UpgradeSystem'
import { DRAGON_BREATH_MOUTHS } from '../rendering/DragonBreathArt'

export const PRESENTATION_FIXTURE_CONTRACT = {
  transport: 'offline controlled fixtures; no Jev connection or live decision claims',
  positions: 'scripted positions, health, cooldowns and the next dragon breath sequence',
  death: 'scripted zero HP during a real active attack; GameEngine records the corpse',
  commander: 'deferred source-labelled fixture response accepted through GameEngine.decide',
  time: 'fixed-step GameEngine simulation and a separately controlled presentation clock',
  stage: 'scripted cleared phase followed by the real nextStage reset'
} as const

export type DeathReviewRole =
  | 'soldier'
  | 'archer'
  | 'ranger'
  | 'tank'
  | 'mage'
  | 'frost'
  | 'healer'
  | 'runner'
  | 'cannon'
  | 'paladin'
export type ContactReviewKind = 'near' | 'far' | 'base' | 'sandbag'

function reviewEngine(
  stage = 9,
  decide: () => Promise<AIAction | AIDecision | null> = async () => null,
  fieldId: FieldId = 'meadow'
) {
  const save = freshSave()
  save.purchased = ALLY_TYPES.filter((type) => DEFINITIONS[type].purchaseCost > 0)
  const engine = new GameEngine({ decide }, save, fieldId, 42, () => 0, DRAGON_BREATH_MOUTHS)
  engine.state.stage = stage
  return engine
}

function directionVector(direction: BreathDirection): Point {
  const index = BREATH_DIRECTIONS.indexOf(direction)
  if (index < 0) throw new Error('Unknown presentation-review direction')
  return { x: Math.cos((index * Math.PI) / 4), y: Math.sin((index * Math.PI) / 4) }
}

function freezeAt(unit: Unit, point: Point) {
  Object.assign(unit, point, {
    homeX: point.x,
    homeY: point.y,
    speed: 0,
    attackCooldown: 10000,
    hp: 10000,
    maxHp: 10000
  })
}

function placeDefender(engine: GameEngine, role: AllyType) {
  if (!FIELDS[engine.state.fieldId].slots.some((slot) => engine.place(role, slot.id)))
    throw new Error(`Could not place review ${role}`)
  return engine.state.units[0]
}

function spawnEnemy(engine: GameEngine, type: 'dragon' | 'slime', progress: number) {
  if (!engine.applyAIAction({ type: 'spawn', unitType: type })) throw new Error(`Could not spawn review ${type}`)
  const unit = engine.state.units.at(-1)!
  unit.progress = progress
  Object.assign(unit, pointOnPath(FIELDS.meadow.path, progress))
  return unit
}

export function createBreathReviewScene(direction: BreathDirection) {
  const engine = reviewEngine(10)
  const target = placeDefender(engine, 'soldier')
  engine.startAssault()
  const actor = spawnEnemy(engine, 'dragon', 1750)
  const aim = directionVector(direction)
  freezeAt(actor, actor)
  freezeAt(target, { x: actor.x + aim.x * 110, y: actor.y + aim.y * 110 })
  Object.assign(actor, { attackCooldown: 0, attackSequence: 1, attack: 16 })
  engine.update(CONFIG.step)
  const attack = engine.state.attacks.find((value) => value.attackerId === actor.id)!
  if (attack?.variant !== 'breath' || attack.breath?.direction !== direction)
    throw new Error('Review dragon did not start its authored breath')
  return { engine, actor, target, attack }
}

export function createDeathReviewScene(role: DeathReviewRole, direction: BreathDirection) {
  if (!['soldier', 'archer', 'ranger', 'tank', 'mage', 'frost', 'healer', 'runner', 'cannon', 'paladin'].includes(role))
    throw new Error('Unknown death-review role')
  if (role === 'healer') return createRangedReviewScene(role, direction)
  const engine = reviewEngine()
  const actor = placeDefender(engine, role)
  engine.startAssault()
  const target = spawnEnemy(engine, 'slime', 1750)
  const aim = directionVector(direction)
  const distance = ATTACK_PROFILES[role].flightMs ? 110 : 35
  freezeAt(target, target)
  freezeAt(actor, { x: target.x - aim.x * distance, y: target.y - aim.y * distance })
  actor.attackCooldown = 0
  engine.update(CONFIG.step)
  const attack = engine.state.attacks.find((value) => value.attackerId === actor.id)!
  if (!attack) throw new Error('Death-review actor did not enter a real attack')
  return { engine, actor, target, attack }
}

export type HealingReviewKind = 'injured' | 'near-full' | 'full' | 'self'

export function createHealingReviewScene(kind: HealingReviewKind, direction: BreathDirection) {
  if (!['injured', 'near-full', 'full', 'self'].includes(kind)) throw new Error('Unknown healing-review condition')
  const engine = reviewEngine(10),
    actor = placeDefender(engine, 'healer')
  if (!engine.place('soldier', 1)) throw new Error('Could not place healing-review ally')
  const ally = engine.state.units.at(-1)!,
    aim = directionVector(direction)
  engine.startAssault()
  freezeAt(actor, { x: 500, y: 550 })
  freezeAt(ally, { x: actor.x + aim.x * 110, y: actor.y + aim.y * 110 })
  const target = kind === 'self' ? actor : ally
  target.hp = kind === 'full' ? target.maxHp : kind === 'near-full' ? target.maxHp - 3 : target.maxHp - 1000
  actor.attackCooldown = 0
  actor.facingX = aim.x
  actor.facingY = aim.y
  engine.update(CONFIG.step)
  const attack = engine.state.attacks.find((value) => value.attackerId === actor.id)
  if ((kind === 'full') !== !attack) throw new Error('Healing-review start did not match health eligibility')
  return { engine, actor, ally, target, attack, healingKind: kind }
}

export function createCommanderReviewScene(fieldId: FieldId = 'meadow') {
  if (!Object.hasOwn(FIELDS, fieldId)) throw new Error('Unknown commander review field')
  let resolveDecision: ((decision: AIAction | AIDecision | null) => void) | undefined
  let requestCount = 0
  const engine = reviewEngine(
    4,
    () => {
      requestCount++
      return new Promise((resolve) => {
        resolveDecision = resolve
      })
    },
    fieldId
  )
  const actor = placeDefender(engine, 'soldier')
  actor.attackCooldown = 10000
  engine.startAssault()
  engine.state.cooldowns.goblin = 3
  return {
    engine,
    actor,
    requestCount: () => requestCount,
    resolve(source: string, stale = false) {
      if (!resolveDecision) throw new Error('Commander fixture has no pending decision')
      if (stale) engine.invalidateAI()
      resolveDecision({ action: { type: 'wait', unitType: 'goblin' }, source })
    }
  }
}

export function createContactReviewScene(kind: ContactReviewKind) {
  if (!['near', 'far', 'base', 'sandbag'].includes(kind)) throw new Error('Unknown contact-review kind')
  const engine = reviewEngine()
  const target = placeDefender(engine, 'archer')
  freezeAt(target, { x: 240, y: kind === 'near' ? 196 : 226 })
  if (kind === 'base' || kind === 'sandbag') freezeAt(target, { x: 96, y: 720 })
  if (kind === 'sandbag' && !engine.placeSandbag(pointOnPath(FIELDS.meadow.path, 400)).valid)
    throw new Error('Contact-review sandbag placement failed')
  engine.startAssault()
  const progress = kind === 'base' ? pathLength(FIELDS.meadow.path) - 100 : kind === 'sandbag' ? 315 : 130
  const actor = spawnEnemy(engine, 'slime', progress)
  actor.hp = actor.maxHp = 10000
  return { engine, actor, target, contactKind: kind }
}

export function advanceReviewSimulation(engine: GameEngine, time: number, canAdvance?: () => boolean): void {
  if (!Number.isFinite(time) || time < engine.state.time - 1e-8 || time > 120)
    throw new Error('Review time must be finite, monotonic and within 120 seconds')
  while (engine.state.time + CONFIG.step <= time + 1e-9) {
    const before = engine.state.time
    engine.update(CONFIG.step, canAdvance)
    if (engine.state.time === before) throw new Error('Review simulation is waiting for assets or no longer active')
  }
}

export type LockedHitReviewRole = 'soldier' | 'archer' | 'wolf' | 'runner' | 'ranger' | 'cannon' | 'paladin'
export function createLockedHitReviewScene(role: LockedHitReviewRole) {
  if (!['soldier', 'archer', 'wolf', 'runner', 'ranger', 'cannon', 'paladin'].includes(role))
    throw new Error('Unknown lock review role')
  const scene = createRangedReviewScene(role, role === 'wolf' ? 's' : 'n', {
    distance: DEFINITIONS[role].range - 3,
    roadProgress: 100,
    opponent: 'wolf'
  })
  if (scene.target.owner === 'ai') scene.target.speed = DEFINITIONS.wolf.speed
  else {
    scene.target.homeY += 60
    scene.target.speed = 52
  }
  return scene
}

export type InterceptionReviewKind = 'tank-slime' | 'tank-wolf' | 'approaching' | 'departing'
export function createInterceptionReviewScene(kind: InterceptionReviewKind) {
  if (!['tank-slime', 'tank-wolf', 'approaching', 'departing'].includes(kind))
    throw new Error('Unknown interception review')
  const engine = reviewEngine(3)
  const tank = kind.startsWith('tank-')
  const home = tank ? { x: 300, y: 205 } : { x: 240, y: kind === 'departing' ? 94 : 226 }
  if (!engine.place(tank ? 'tank' : 'soldier', home)) throw new Error('Invalid interception fixture home')
  const actor = engine.state.units[0]
  const type = kind === 'tank-slime' ? 'slime' : 'wolf'
  engine.startAssault()
  if (!engine.applyAIAction({ type: 'spawn', unitType: type })) throw new Error('Invalid interception fixture spawn')
  const target = engine.state.units.at(-1)!
  const progress = tank ? 0 : kind === 'approaching' ? 70 : 260
  Object.assign(target, pointOnPath(FIELDS.meadow.path, progress), { progress, hp: 10000, maxHp: 10000 })
  actor.hp = actor.maxHp = 10000
  return { engine, actor, target, interceptionKind: kind }
}

export function createHeavyImpactReviewScene(type: 'brute' | 'ogre', direction: BreathDirection, boss = false) {
  if (type !== 'brute' && type !== 'ogre') throw new Error('Unknown heavy impact role')
  const engine = reviewEngine(type === 'brute' && boss ? 8 : 9)
  for (let slot = 0; slot < 3; slot++)
    if (!engine.place('archer', slot)) throw new Error('Could not place area review defenders')
  const [target, inside, outside] = engine.state.units
  const origin = pointOnPath(FIELDS.meadow.path, 1750),
    aim = directionVector(direction)
  freezeAt(target, { x: origin.x + aim.x * 35, y: origin.y + aim.y * 35 })
  freezeAt(inside, { x: origin.x + 200, y: origin.y + 200 })
  freezeAt(outside, { x: origin.x + 230, y: origin.y + 230 })
  engine.startAssault()
  if (boss) {
    const rules = stageRules(engine.state.stage)
    engine.state.enemiesSpawned = engine.state.enemiesResolved = rules.enemyCount - 1
    engine.state.budgetSpent = rules.enemyCount - 1
  }
  if (!engine.applyAIAction({ type: 'spawn', unitType: type, boss }))
    throw new Error('Could not spawn heavy review actor')
  const actor = engine.state.units.at(-1)!
  freezeAt(actor, origin)
  actor.progress = 1750
  actor.attackCooldown = 0
  engine.update(CONFIG.step)
  const attack = engine.state.attacks.find((value) => value.attackerId === actor.id)
  if (!attack || attack.targetId !== target.id) throw new Error('Heavy review did not lock its primary')
  const shape = heavyImpactGeometry(attack)!
  freezeAt(inside, { x: shape.origin.x + aim.x * shape.radius * 0.55, y: shape.origin.y + aim.y * shape.radius * 0.55 })
  freezeAt(outside, {
    x: shape.origin.x + aim.x * (shape.radius + 25),
    y: shape.origin.y + aim.y * (shape.radius + 25)
  })
  return { engine, actor, target, inside, outside, attack }
}
