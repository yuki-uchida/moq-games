import { GameEngine } from '../game/GameEngine'
import { CONFIG, FIELDS, pointOnPath, type Unit } from '../game/model'
import { freshSave } from '../progression/UpgradeSystem'
import type { SpriteDirection } from '../rendering/UnitSprites'
import { createEnemyTrialScene } from './EnemyTrialScene'
import { createRangedReviewScene } from './RangedScene'

export type MotionReviewRole = 'wolf' | 'runner'
export type MotionReviewAction = 'idle' | 'walk' | 'attack' | 'route'
export interface MotionReviewOptions {
  role: MotionReviewRole
  action: MotionReviewAction
  direction: SpriteDirection
  realBoss?: boolean
}

/** Offline review only. The game entry point never imports this fixture. */
export function createMotionComparisonScene(options: MotionReviewOptions) {
  if (options.role === 'runner' && options.realBoss) throw new Error('Runner is a real player ally, never a boss')
  const { role, action, direction } = options
  let engine: GameEngine, actor: Unit, target: Unit
  let fixture = ''
  if (role === 'wolf') {
    const scene = createEnemyTrialScene('wolf', direction, { realBoss: options.realBoss, route: action === 'route' })
    ;({ engine, actor, target } = scene)
    fixture = `${scene.fixture.setup}; ${scene.fixture.boss}`
  } else if (action === 'route') {
    engine = new GameEngine({ decide: async () => null }, freshSave(), 'meadow', 42, () => 0)
    engine.state.stage = 3
    if (!engine.place('runner', { x: 240, y: 226 })) throw new Error('Runner legal placement failed')
    actor = engine.state.units[0]
    engine.startAssault()
    if (!engine.applyAIAction({ type: 'spawn', unitType: 'wolf' })) throw new Error('Runner opponent spawn failed')
    target = engine.state.units.at(-1)!
    Object.assign(target, pointOnPath(FIELDS.meadow.path, 70), { progress: 70, hp: 10000, maxHp: 10000 })
    actor.hp = actor.maxHp = 10000
    fixture =
      'Real player Runner, legally placed; real engine pursuit/contact/return; scripted durable health and opponent road progress. Natural speeds and combat profiles. No Jev connection.'
  } else {
    const scene = createRangedReviewScene('runner', direction, { distance: 35 })
    ;({ engine, actor, target } = scene)
    const speedReference = new GameEngine({ decide: async () => null }, freshSave(), 'meadow', 42, () => 0)
    if (!speedReference.place('runner', 0)) throw new Error('Runner speed reference placement failed')
    actor.speed = speedReference.state.units[0].speed
    fixture =
      'Real player Runner and real engine attack; scripted close target, health and defender cooldown. Natural Runner speed restored after fixture setup. No Jev connection.'
  }
  const angle = (['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'].indexOf(direction) * Math.PI) / 4
  const aim = { x: Math.cos(angle), y: Math.sin(angle) }
  const diagnostic = action === 'idle' || action === 'walk'
  if (diagnostic) {
    engine.state.attacks = []
    engine.state.units = [actor]
    engine.state.phase = action === 'walk' ? 'assault' : 'preparation'
    Object.assign(actor, {
      x: 640,
      y: 540,
      homeX: 640,
      homeY: 540,
      attackSequence: 0,
      moving: action === 'walk',
      travelled: 0,
      facingX: aim.x,
      facingY: aim.y
    })
    fixture +=
      '; DIRECTIONAL DIAGNOSTIC: scripted straight ground travel at actual actor speed; not a claim of engine route or foot planting.'
  }
  const startTime = engine.state.time
  const startHp = target.hp
  let diagnosticElapsedMs = 0
  return {
    engine,
    actor,
    target,
    options,
    fixture,
    startTime,
    startHp,
    get elapsedMs() {
      return diagnostic ? diagnosticElapsedMs : (engine.state.time - startTime) * 1000
    },
    step(ready: () => boolean = () => true) {
      if (diagnostic) {
        if (!ready()) return
        diagnosticElapsedMs += CONFIG.step * 1000
        if (action === 'walk') {
          engine.state.time += CONFIG.step
          const distance = actor.speed * CONFIG.step
          actor.x += aim.x * distance
          actor.y += aim.y * distance
          actor.travelled += distance
        }
      } else engine.update(CONFIG.step, ready)
    },
    moveWolfTarget(contact: boolean) {
      if (role !== 'wolf' || action !== 'route') throw new Error('Only the Wolf route fixture supports this cue')
      const distance = contact ? 30 : 400
      Object.assign(target, { x: actor.x + distance, y: actor.y, homeX: actor.x + distance, homeY: actor.y })
    }
  }
}
