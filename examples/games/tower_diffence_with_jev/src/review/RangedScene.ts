import { GameEngine } from '../game/GameEngine'
import {
  ALLY_TYPES,
  CONFIG,
  DEFINITIONS,
  FIELDS,
  pointOnPath,
  type AllyType,
  type EnemyType,
  type UnitType
} from '../game/model'
import { freshSave } from '../progression/UpgradeSystem'
import { AUTHORED_ROSTER } from '../rendering/AuthoredRoster'
import type { SpriteDirection } from '../rendering/UnitSprites'

export function createRangedReviewScene(
  role: UnitType,
  direction: SpriteDirection,
  options: { distance?: number; roadProgress?: number; opponent?: EnemyType; actorMissingHp?: number } = {}
) {
  const owner = AUTHORED_ROSTER[role].owner
  const save = freshSave()
  save.purchased = ALLY_TYPES.filter((type) => DEFINITIONS[type].purchaseCost > 0)
  const engine = new GameEngine({ decide: async () => null }, save, 'meadow', 42, () => 0)
  engine.state.stage = 10
  const playerRole = owner === 'player' ? (role as AllyType) : 'soldier'
  if (!engine.place(playerRole, 0)) throw new Error('Review player setup failed')
  if (role === 'healer' && !engine.place('soldier', 1)) throw new Error('Review heal target setup failed')
  engine.startAssault()
  if (
    role !== 'healer' &&
    !engine.applyAIAction({
      type: 'spawn',
      unitType: owner === 'ai' ? (role as EnemyType) : (options.opponent ?? 'slime')
    })
  )
    throw new Error('Review enemy setup failed')
  const actor = engine.state.units.find((unit) => unit.type === role && unit.owner === owner)!
  const target = engine.state.units.find((unit) => unit.id !== actor.id)!
  const index = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'].indexOf(direction)
  const aim = { x: Math.cos((index * Math.PI) / 4), y: Math.sin((index * Math.PI) / 4) }
  const roadProgress = options.roadProgress ?? 1750
  const distance = options.distance ?? 120
  const roadPoint = pointOnPath(FIELDS.meadow.path, roadProgress)
  const origin = owner === 'ai' ? roadPoint : { x: roadPoint.x - aim.x * distance, y: roadPoint.y - aim.y * distance }
  const destination = owner === 'ai' ? { x: origin.x + aim.x * distance, y: origin.y + aim.y * distance } : roadPoint
  Object.assign(actor, origin, {
    homeX: origin.x,
    homeY: origin.y,
    progress: owner === 'ai' ? roadProgress : 0,
    speed: 0,
    attackCooldown: 0,
    hp: 10000 - (options.actorMissingHp ?? 0),
    maxHp: 10000
  })
  Object.assign(target, destination, {
    homeX: destination.x,
    homeY: destination.y,
    progress: target.owner === 'ai' ? roadProgress : 0,
    speed: 0,
    attackCooldown: 100000,
    hp: role === 'healer' ? 9000 : 10000,
    maxHp: 10000
  })
  engine.update(CONFIG.step)
  const attack = engine.state.attacks.find((value) => value.attackerId === actor.id)!
  if (!attack) throw new Error('Review attack did not start')
  return { engine, actor, target, attack }
}
