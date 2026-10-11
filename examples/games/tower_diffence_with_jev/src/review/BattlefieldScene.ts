import { GameEngine } from '../game/GameEngine'
import {
  ALLY_TYPES,
  CONFIG,
  DEFINITIONS,
  attackSplash,
  fieldFor,
  pointOnPath,
  routePathFor,
  stageRules,
  type AIAction,
  type AllyType,
  type BattlefieldVersion,
  type CombatAttack,
  type EnemyType,
  type FieldId,
  type Point,
  type RouteId,
  type Sandbag,
  type Unit
} from '../game/model'
import { edgeOffsetToRouteProgress, pointAtRoadAnchor, routeFor } from '../game/BattlefieldRoutes'
import { heavyImpactGeometry, type HeavyImpactShape } from '../game/HeavyImpact'
import { freshSave } from '../progression/UpgradeSystem'
import { DRAGON_BREATH_MOUTHS } from '../rendering/DragonBreathArt'

export const BATTLEFIELD_FIXTURE_CONTRACT = {
  transport: 'Scripted offline review; no Jev connection, live AI or live-session claims',
  engine: 'Real GameEngine actions, fixed-step travel, target selection, damage and removal',
  rendering: 'Real GameRenderer, WebGL and authored PNG assets; rendering does not apply damage',
  setup: 'Explicitly scripted stage, positions, health, speed, cooldowns and deployment intervals isolate each case',
  gate: 'Boss-window counters and next dragon breath sequence are explicit fixture setup',
  targetDeath: 'The kill hook sets the selected defender HP to zero; engine recovery and return remain authoritative',
  storage: 'Fresh in-memory saves only; no localStorage reads or writes'
} as const

export interface BattlefieldScene {
  kind: string
  engine: GameEngine
  actors: Record<string, Unit>
  bags: Sandbag[]
  attacks: Map<string, CombatAttack>
  setup: Record<string, unknown>
}

function scene(kind: string, fieldId: FieldId = 'meadow', version: BattlefieldVersion = 2): BattlefieldScene {
  const save = freshSave()
  save.purchased = ALLY_TYPES.filter((type) => DEFINITIONS[type].purchaseCost > 0)
  const engine = new GameEngine({ decide: async () => null }, save, fieldId, 42, () => 0, DRAGON_BREATH_MOUTHS, version)
  engine.state.stage = 10
  return { kind, engine, actors: {}, bags: [], attacks: new Map(), setup: {} }
}

function freeze(unit: Unit, point: Point = unit): void {
  Object.assign(unit, point, {
    homeX: point.x,
    homeY: point.y,
    hp: 10000,
    maxHp: 10000,
    speed: 0,
    attackCooldown: 10000
  })
}

function defender(review: BattlefieldScene, role: string, type: AllyType, point?: Point): Unit {
  const { engine } = review
  const slot = fieldFor(engine.state).slots.find(
    (slot) => !engine.state.units.some((unit) => unit.slotId === slot.id) && engine.previewPlacement(type, slot).valid
  )
  if (!slot || !engine.place(type, slot.id)) throw new Error(`Could not place scripted ${type}`)
  const unit = engine.state.units.at(-1)!
  freeze(unit, point)
  review.actors[role] = unit
  return unit
}

function begin(review: BattlefieldScene): void {
  if (!Object.keys(review.actors).length) defender(review, 'sentinel', 'archer', { x: 64, y: 1320 })
  if (!review.engine.startAssault()) throw new Error('Could not start scripted battlefield assault')
}

function spawn(
  review: BattlefieldScene,
  role: string,
  type: EnemyType,
  routeId: RouteId = 'left',
  targetId?: number,
  boss = false
): Unit {
  const { engine } = review
  engine.state.nextSpawnAt = engine.state.time
  engine.state.cooldowns[type] = 0
  const action: AIAction = {
    type: 'spawn',
    unitType: type,
    boss,
    ...(engine.state.battlefieldVersion === 2 ? { routeId, ...(targetId === undefined ? {} : { targetId }) } : {})
  }
  if (!engine.applyAIAction(action)) throw new Error(`Could not spawn scripted ${type}`)
  const unit = engine.state.units.at(-1)!
  unit.hp = unit.maxHp = 10000
  review.actors[role] = unit
  return unit
}

function position(review: BattlefieldScene, unit: Unit, progress: number): void {
  Object.assign(unit, pointOnPath(routePathFor(review.engine.state, unit.routeId), progress), { progress })
}

export function captureBattlefieldAttacks(review: BattlefieldScene): void {
  for (const attack of review.engine.state.attacks) review.attacks.set(attack.id, attack)
}

export function advanceBattlefieldScene(review: BattlefieldScene, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30) throw new Error('Invalid fixture duration')
  const goal = review.engine.state.time + seconds
  while (review.engine.state.time + CONFIG.step <= goal + 1e-9) {
    const before = review.engine.state.time
    review.engine.update(CONFIG.step)
    if (review.engine.state.time === before) throw new Error('Scripted battlefield stopped before sample')
    captureBattlefieldAttacks(review)
  }
}

export function createBattlefieldOverview(
  fieldId: FieldId = 'meadow',
  version: BattlefieldVersion = 2
): BattlefieldScene {
  const review = scene('overview', fieldId, version)
  defender(review, 'archer', 'archer')
  return review
}

export function createJunctionReview(fieldId: FieldId, junction: 'split' | 'merge'): BattlefieldScene {
  const review = scene(`junction-${junction}`, fieldId)
  begin(review)
  const field = fieldFor(review.engine.state)
  for (const routeId of ['left', 'right'] as const) {
    const actor = spawn(review, routeId, routeId === 'left' ? 'slime' : 'goblin', routeId)
    const boundary = edgeOffsetToRouteProgress(field, routeId, {
      edgeId: junction === 'split' ? routeId : 'gate',
      offset: 0
    })!
    position(review, actor, boundary - 30)
    Object.assign(actor, { speed: 120, attackCooldown: 10000 })
  }
  review.setup = { junction, beforeBoundary: 30, speed: 120 }
  return review
}

export function createBagReview(kind: 'shared' | 'exclusive'): BattlefieldScene {
  const review = scene(`bags-${kind}`),
    field = fieldFor(review.engine.state)
  const anchor = { edgeId: kind === 'shared' ? 'gate' : 'left', offset: kind === 'shared' ? 140 : 400 }
  const point = pointAtRoadAnchor(field, anchor)!
  if (!review.engine.placeSandbag(point).valid) throw new Error('Could not place scripted physical bag')
  const bag = review.engine.state.sandbags[0]
  bag.hp = bag.maxHp = 10000
  review.bags = [bag]
  begin(review)
  for (const routeId of ['left', 'right'] as const) {
    const actor = spawn(review, routeId, routeId === 'left' ? 'slime' : 'goblin', routeId)
    const progress = edgeOffsetToRouteProgress(field, routeId, {
      ...anchor,
      edgeId: kind === 'shared' ? 'gate' : routeId
    })!
    position(review, actor, progress - 65)
    actor.speed = 80
  }
  review.setup = { anchor, initialBagHp: bag.hp }
  return review
}

export function createFormationReview(): BattlefieldScene {
  const review = scene('formation')
  begin(review)
  const action: AIAction = { type: 'formation', formationId: 'escort', routeId: 'right' }
  if (!review.engine.applyAIAction(action)) throw new Error('Could not accept scripted formation')
  action.routeId = 'left'
  review.setup = { mutatedCallerAction: action, acceptedPending: structuredClone(review.engine.state.pendingSpawns) }
  return review
}

export function createFlightReview(type: 'bat' | 'wraith' | 'dragon' = 'bat', engaged = false): BattlefieldScene {
  const review = scene('flight')
  const target = defender(review, 'target', 'archer', { x: 900, y: 600 })
  defender(review, 'tank', 'tank', { x: 650, y: 90 })
  begin(review)
  const actor = spawn(review, 'flyer', type, 'right', target.id)
  actor.speed = 180
  if (engaged) Object.assign(actor, { x: target.x, y: target.y - 24 })
  review.setup = {
    type,
    engaged,
    acceptedTargetId: target.id,
    acceptedReturnProgress: actor.flight!.returnProgress,
    fallback: pointOnPath(routePathFor(review.engine.state, actor.routeId), actor.flight!.returnProgress)
  }
  return review
}

export function killFlightReviewTarget(review: BattlefieldScene): void {
  if (review.kind !== 'flight') throw new Error('Prepare direct-flight review first')
  review.actors.target.hp = 0
}

export function createAntiAirReview(type: AllyType, targetType: 'bat' | 'wraith' | 'dragon' = 'bat'): BattlefieldScene {
  const review = scene('anti-air')
  const actor = defender(review, 'defender', type)
  begin(review)
  const flyer = spawn(review, 'flyer', targetType, 'left')
  position(review, flyer, 420)
  freeze(flyer)
  freeze(actor, { x: flyer.x, y: flyer.y + 20 })
  actor.attackCooldown = 0
  review.setup = { type, targetType, initialTargetHp: flyer.hp }
  return review
}

export function createGateReview(
  type: 'slime' | 'dragon' = 'slime',
  boss = false,
  version: BattlefieldVersion = 2
): BattlefieldScene {
  const review = scene('gate', 'meadow', version)
  begin(review)
  if (boss) {
    review.engine.state.stage = 10
    const rules = stageRules(10, review.engine.state.waveBossPolicy)
    review.engine.state.enemiesSpawned = review.engine.state.enemiesResolved = rules.enemyCount - 1
    review.engine.state.budgetSpent = rules.enemyCount - 1
    type = 'dragon'
  }
  const actor = spawn(review, 'attacker', type, 'right', undefined, boss)
  const route = routeFor(fieldFor(review.engine.state), actor.routeId)
  position(review, actor, route.length - (type === 'dragon' ? 80 : 24))
  Object.assign(actor, { speed: 0, attack: type === 'dragon' ? 16 : 7, attackSequence: type === 'dragon' ? 1 : 0 })
  review.setup = { type, boss, initialBaseHp: review.engine.state.playerBaseHp }
  return review
}

export function reviewAreaGeometry(attack: CombatAttack): HeavyImpactShape {
  const heavy = heavyImpactGeometry(attack)
  if (heavy) return heavy
  if (attack.type !== 'dragon' || attack.breath) throw new Error('Unsupported review area')
  return {
    kind: 'circle',
    origin: { ...attack.target },
    radius: attackSplash(attack.type, !!attack.boss, attack.battlefieldVersion, attack.geometryScale ?? 1)
  }
}

export function createAreaReview(
  type: 'brute' | 'ogre' | 'dragon' = 'brute',
  version: BattlefieldVersion = 2
): BattlefieldScene {
  const review = scene('area', 'meadow', version)
  const primary = defender(review, 'primary', 'archer')
  const annulus = defender(review, 'annulus', 'archer')
  const outside = defender(review, 'outside', 'archer')
  begin(review)
  const actor = spawn(review, 'attacker', type, 'left')
  position(review, actor, 1000)
  freeze(actor)
  actor.attackCooldown = 0
  freeze(primary, { x: actor.x + 30, y: actor.y })
  freeze(annulus, { x: actor.x + 200, y: actor.y + 200 })
  freeze(outside, { x: actor.x + 250, y: actor.y + 250 })
  advanceBattlefieldScene(review, CONFIG.step)
  const attack = [...review.attacks.values()].find((attack) => attack.attackerId === actor.id)!
  if (!attack || attack.targetId !== primary.id) throw new Error('Area fixture failed to lock primary')
  const shape = reviewAreaGeometry(attack),
    legacyRadius = reviewAreaGeometry({ ...attack, battlefieldVersion: 1 }).radius
  const direction = shape.kind === 'sector' ? shape.direction : { x: 1, y: 0 }
  freeze(annulus, {
    x: shape.origin.x + direction.x * legacyRadius * 1.125,
    y: shape.origin.y + direction.y * legacyRadius * 1.125
  })
  freeze(outside, {
    x: shape.origin.x + direction.x * legacyRadius * 1.35,
    y: shape.origin.y + direction.y * legacyRadius * 1.35
  })
  review.setup = { type, attackId: attack.id, legacyRadius, initialTargetHp: 10000 }
  return review
}
