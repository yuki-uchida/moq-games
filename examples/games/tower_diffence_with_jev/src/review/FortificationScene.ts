import { GameEngine } from '../game/GameEngine'
import { STARTING_GOLD } from '../game/DefenderRoster'
import { FORTIFICATIONS, roadItems } from '../game/Fortifications'
import { physicalProjectionOnRoute, pointAtRoadAnchor, routeSurface } from '../game/BattlefieldRoutes'
import type { CombatSoundEvent } from '../game/CombatSoundEvents'
import {
  CONFIG,
  fieldFor,
  pathLength,
  pointOnPath,
  routePathFor,
  stageRules,
  type AllyType,
  type CombatAttack,
  type EnemyType,
  type GateShot,
  type Point,
  type RoadItem,
  type RoadItemKind,
  type RouteId,
  type Unit
} from '../game/model'
import { freshProfile, freshRunFromProfile } from '../progression/ProgressionData'
import { DRAGON_BREATH_MOUTHS } from '../rendering/DragonBreathArt'

export const FORTIFICATION_FIXTURE_CONTRACT = {
  transport: 'Scripted offline review; no Jev connection or live-session claims',
  engine: 'Real paid purchases, fixed-step movement, target selection, damage, sounds and removal',
  rendering: 'Real GameRenderer, authored whole-frame PNGs and code-native fortification art; no renderer damage',
  setup: 'Stage rewards, positions, cooldowns and speeds are scripted; exceptions are recorded in setup',
  deaths: 'Fatal target HP and explicit kill/relocation hooks are scripted; damage and cleanup remain engine-owned',
  storage: 'Fresh in-memory saves only; no localStorage reads or writes',
  scope: 'Controlled integration samples, not a ten-stage balance run or live AI test'
} as const

export interface FortificationScene {
  kind: string
  engine: GameEngine
  actors: Record<string, Unit>
  items: Map<number, RoadItem>
  shots: Map<string, GateShot>
  attacks: Map<string, CombatAttack>
  sounds: CombatSoundEvent[]
  setup: Record<string, unknown>
}

function scene(kind: string, economyVersion: 1 | 2 = 2): FortificationScene {
  const stage = 10,
    save = freshRunFromProfile(freshProfile(), economyVersion)
  save.gold =
    STARTING_GOLD +
    Array.from({ length: stage - 1 }, (_, index) => stageRules(index + 1).reward).reduce(
      (total, reward) => total + reward,
      0
    )
  save.highestStage = stage - 1
  const engine = new GameEngine(
    { decide: () => new Promise(() => {}) },
    save,
    'meadow',
    20261004,
    () => 0,
    DRAGON_BREATH_MOUTHS,
    2
  )
  engine.state.stage = engine.state.stageSummary.stage = stage
  engine.state.sandbagStock = stage
  engine.state.previousStageSummary = {
    stage: stage - 1,
    spawned: stageRules(stage - 1).enemyCount,
    resolved: stageRules(stage - 1).enemyCount,
    maxProgress: 0.5,
    baseDamage: 0,
    defenderDamage: 0
  }
  return {
    kind,
    engine,
    actors: {},
    items: new Map(),
    shots: new Map(),
    attacks: new Map(),
    sounds: [],
    setup: { stage, startingGold: save.gold }
  }
}

function defender(review: FortificationScene, role: string, type: AllyType): Unit {
  const { engine } = review,
    slot = fieldFor(engine.state).slots.find(
      (slot) => !engine.state.units.some((unit) => unit.slotId === slot.id) && engine.previewPlacement(type, slot).valid
    )
  if (!slot || !engine.place(type, slot.id)) throw new Error(`Could not buy scripted ${type}`)
  const unit = engine.state.units.at(-1)!
  review.actors[role] = unit
  return unit
}

function begin(review: FortificationScene): void {
  const unit = defender(review, 'sentinel', 'archer')
  Object.assign(unit, { x: 64, y: 140, homeX: 64, homeY: 140, speed: 0, attackCooldown: 10000 })
  if (!review.engine.startAssault()) throw new Error('Could not begin scripted fortification assault')
  review.setup.sentinel = 'A legally purchased archer is held at (64,140) with zero speed and disabled attacks'
}

function enemy(
  review: FortificationScene,
  role: string,
  type: EnemyType,
  routeId: RouteId = 'left',
  boss = false
): Unit {
  const { engine } = review
  engine.state.nextSpawnAt = engine.state.time
  engine.state.cooldowns[type] = 0
  if (boss) {
    const count = stageRules(engine.state.stage).enemyCount - 1
    engine.state.enemiesSpawned = engine.state.enemiesResolved = count
    engine.state.budgetSpent = count
    review.setup.bossWindow = 'Spawned/resolved/budget counters explicitly position the stage at its final boss window'
  }
  if (
    !engine.applyAIAction({
      type: 'spawn',
      unitType: type,
      routeId,
      boss,
      ...(type === 'bat' ? { targetId: review.actors.sentinel.id } : {})
    })
  )
    throw new Error(`Could not spawn scripted ${type}`)
  const unit = engine.state.units.at(-1)!
  review.actors[role] = unit
  return unit
}

function position(review: FortificationScene, unit: Unit, progress: number): void {
  Object.assign(unit, pointOnPath(routePathFor(review.engine.state, unit.routeId), progress), { progress })
}

function purchase(review: FortificationScene, kind: RoadItemKind, point?: Point): RoadItem {
  const { engine } = review,
    path = routePathFor(engine.state, 'left')
  if (point) {
    if (!engine.placeRoadItem(kind, point).valid) throw new Error(`Could not buy scripted ${kind}`)
  } else {
    let placed = false
    for (let progress = 400; progress < pathLength(path) - 210; progress += 20)
      if (engine.placeRoadItem(kind, pointOnPath(path, progress)).valid) {
        placed = true
        break
      }
    if (!placed) throw new Error(`No legal scripted ${kind} location`)
  }
  const item = roadItems(engine.state).at(-1)!
  review.items.set(item.id, structuredClone(item))
  return item
}

function upgrade(review: FortificationScene, kind: 'armor' | 'cannon', level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > 3) throw new Error('Review level must be 0–3')
  for (let index = 0; index < level; index++)
    if (!review.engine.upgradeGate(kind)) throw new Error(`Could not purchase scripted ${kind} level ${index + 1}`)
}

export interface GateReviewOptions {
  level?: number
  direction?: 'north' | 'south' | 'diagonal'
  moving?: boolean
  lethal?: boolean
}

export function createFortificationGateReview(options: GateReviewOptions = {}): FortificationScene {
  const review = scene('gate'),
    { level = 1, direction, moving = false, lethal = false } = options
  upgrade(review, 'cannon', level)
  begin(review)
  const target = enemy(review, 'target', direction ? 'bat' : 'beetle'),
    field = fieldFor(review.engine.state),
    length = pathLength(routePathFor(review.engine.state, target.routeId))
  position(review, target, length - 180)
  Object.assign(target, { speed: moving ? 70 : 0, attackCooldown: 10000 })
  if (direction) {
    const offset = { north: { x: 0, y: -180 }, south: { x: 0, y: 70 }, diagonal: { x: 130, y: -130 } }[direction]
    Object.assign(target, { x: field.gate.x + offset.x, y: field.gate.y + offset.y })
  }
  if (lethal) target.hp = 4
  Object.assign(review.setup, {
    level,
    direction: direction ?? 'route',
    moving,
    lethal,
    initialTargetHp: target.hp,
    initialTarget: { x: target.x, y: target.y },
    targetSpeed: target.speed,
    directionalSetup: direction ? 'A legally targeted airborne unit is held at a scripted compass position' : null
  })
  return review
}

export function createFortificationPriorityReview(mode: 'boss' | 'nearest' | 'range'): FortificationScene {
  const review = scene(`priority-${mode}`)
  upgrade(review, 'cannon', 1)
  begin(review)
  const length = pathLength(routePathFor(review.engine.state, 'left')),
    first = enemy(review, 'first', 'slime')
  position(review, first, length - (mode === 'range' ? 211 : mode === 'nearest' ? 190 : 140))
  Object.assign(first, { speed: 0, attackCooldown: 10000 })
  if (mode !== 'range') {
    const second = enemy(review, 'second', mode === 'boss' ? 'dragon' : 'slime', 'right', mode === 'boss')
    position(review, second, pathLength(routePathFor(review.engine.state, 'right')) - (mode === 'boss' ? 190 : 140))
    Object.assign(second, { speed: 0, attackCooldown: 10000 })
    if (mode === 'nearest') {
      const third = enemy(review, 'third', 'slime')
      position(review, third, length - 140)
      Object.assign(third, { speed: 0, attackCooldown: 10000 })
    }
  }
  review.setup.priority = mode
  return review
}

export function createFortificationArmorReview(level: number): FortificationScene {
  const review = scene('armor')
  upgrade(review, 'armor', level)
  begin(review)
  const attacker = enemy(review, 'attacker', 'slime')
  position(review, attacker, pathLength(routePathFor(review.engine.state, 'left')))
  attacker.speed = 0
  Object.assign(review.setup, {
    level,
    initialBaseHp: review.engine.state.playerBaseHp,
    expectedDamage: attacker.attack * (1 - level * 0.1)
  })
  return review
}

export function createFortificationSpikeReview(
  mode: 'melee' | 'break' | 'ranged' | 'flying' | 'shared' | 'exclusive'
): FortificationScene {
  const review = scene(`spike-${mode}`),
    shared = mode === 'shared',
    item = purchase(
      review,
      'spike',
      shared ? pointAtRoadAnchor(fieldFor(review.engine.state), { edgeId: 'gate', offset: 140 })! : undefined
    )
  if (item.kind !== 'spike') throw new Error('Expected spike')
  if (mode === 'break' || mode === 'ranged') item.hp = 1
  begin(review)
  const branches = shared || mode === 'exclusive' ? (['left', 'right'] as const) : (['left'] as const)
  for (const route of branches) {
    const actor = enemy(
      review,
      route,
      mode === 'ranged'
        ? 'shaman'
        : mode === 'flying'
          ? 'bat'
          : mode === 'melee' || mode === 'break'
            ? 'beetle'
            : 'slime',
      route
    )
    const projection = physicalProjectionOnRoute(fieldFor(review.engine.state), route, item)
    position(review, actor, projection.progress - 45)
    actor.speed = 80
    if (mode === 'flying') actor.flight = undefined
  }
  Object.assign(review.setup, {
    mode,
    itemId: item.id,
    initialDurability: item.hp,
    scriptedDurability: item.hp !== item.maxHp,
    initialHp: Object.fromEntries(branches.map((role) => [role, review.actors[role].hp]))
  })
  captureFortificationScene(review)
  return review
}

export function createFortificationMudReview(
  mode: 'waiting' | 'last-charge' | 'frost' = 'waiting'
): FortificationScene {
  const review = scene(`mud-${mode}`),
    surface = routeSurface(fieldFor(review.engine.state), 'left'),
    point =
      mode === 'frost' ? pointOnPath(routePathFor(review.engine.state, 'left'), surface.startProgress + 30) : undefined,
    item = purchase(review, 'mud', point)
  begin(review)
  for (let index = 0; index < (mode === 'last-charge' ? FORTIFICATIONS.mud.charges : 1); index++) {
    const actor = enemy(review, `entrant${index + 1}`, 'slime')
    position(review, actor, item.progress)
    Object.assign(actor, { speed: mode === 'frost' ? 10 : 0, attackCooldown: 10000 })
    if (mode === 'frost') Object.assign(actor, { slowUntil: 5, slowFactor: 0.55 })
  }
  Object.assign(review.setup, {
    mode,
    itemId: item.id,
    initialProgress: item.progress,
    initialCharges: FORTIFICATIONS.mud.charges,
    terrainFactor: surface.speedFactor,
    frostSetup:
      mode === 'frost' ? 'An explicit five-second frost debuff combines with real mud and terrain travel' : null,
    entrySetup: 'Entrants are spawned through public commands, positioned inside the puddle and held by zero speed'
  })
  return review
}

export function createFortificationGearReview(): FortificationScene {
  const review = scene('gear'),
    weapon = defender(review, 'weapon', 'soldier'),
    armor = defender(review, 'armor', 'archer')
  const baseline = { weaponAttack: weapon.attack, armorMaxHp: armor.maxHp }
  if (!review.engine.equipDefender(weapon.id, 'weapon') || !review.engine.equipDefender(armor.id, 'armor'))
    throw new Error('Could not buy review equipment')
  Object.assign(review.setup, { baseline, checkpointValid: review.engine.exportCheckpoint() !== null })
  return review
}

export function createFortificationLegacyReview(): FortificationScene {
  const review = scene('legacy', 1),
    actor = defender(review, 'defender', 'soldier')
  Object.assign(review.setup, {
    roadResult: review.engine.previewRoadItem('spike', pointOnPath(routePathFor(review.engine.state, 'left'), 400)),
    cannonPurchase: review.engine.upgradeGate('cannon'),
    armorPurchase: review.engine.upgradeGate('armor'),
    equipmentPurchase: review.engine.equipDefender(actor.id, 'weapon')
  })
  return review
}

export function killFortificationTarget(review: FortificationScene): void {
  if (review.kind !== 'gate') throw new Error('Prepare a gate case before the scripted kill hook')
  review.actors.target.hp = 0
  review.setup.scriptedKillAt = review.engine.state.time
}

export function relocateMudEntrant(review: FortificationScene, inside: boolean): void {
  if (review.kind !== 'mud-waiting') throw new Error('Prepare the waiting mud case before relocation')
  const item = review.items.get(Number(review.setup.itemId))!
  position(review, review.actors.entrant1, item.progress - (inside ? 0 : 60))
  review.setup.scriptedRelocation = { at: review.engine.state.time, inside }
}

export function captureFortificationScene(review: FortificationScene): void {
  for (const item of roadItems(review.engine.state)) review.items.set(item.id, structuredClone(item))
  for (const shot of review.engine.state.fortifications?.gate.shots ?? [])
    review.shots.set(shot.id, structuredClone(shot))
  for (const attack of review.engine.state.attacks) review.attacks.set(attack.id, structuredClone(attack))
  review.sounds.push(...review.engine.takeCombatSounds())
}

export function advanceFortificationScene(review: FortificationScene, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 20) throw new Error('Invalid scripted duration')
  const goal = review.engine.state.time + seconds
  while (review.engine.state.time + CONFIG.step <= goal + 1e-9) {
    const before = review.engine.state.time
    review.engine.update(CONFIG.step)
    if (before === review.engine.state.time) throw new Error('Scripted fortification simulation stopped')
    captureFortificationScene(review)
  }
}
