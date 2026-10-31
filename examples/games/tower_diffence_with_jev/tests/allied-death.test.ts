import { expect, it } from 'vitest'
import { GameEngine } from '../src/game/GameEngine'
import { ALLY_TYPES, FIELDS } from '../src/game/model'
import { freshSave } from '../src/progression/UpgradeSystem'

for (const type of ALLY_TYPES)
  it(`retains dead ${type} in state without new attacks, targeting, blocking or casts`, () => {
    const save = freshSave()
    if (!['soldier', 'archer', 'runner', 'tank'].includes(type)) save.purchased.push(type)
    const engine = new GameEngine({ decide: async () => null }, save)
    expect(engine.place(type, FIELDS.meadow.slots.at(-1)!.id)).toBe(true)
    expect(engine.startAssault()).toBe(true)
    expect(engine.applyAIAction({ type: 'spawn', unitType: 'slime' })).toBe(true)
    for (let tick = 0; tick < 120; tick++) engine.update(1 / 60)
    const ally = engine.state.units.find((unit) => unit.owner === 'player')!
    const enemy = engine.state.units.find((unit) => unit.owner === 'ai')!
    ally.hp = 0
    ally.x = ally.homeX = enemy.x
    ally.y = ally.homeY = enemy.y
    const progress = enemy.progress,
      health = enemy.hp,
      actions = engine.state.attacks.length
    expect(engine.castSpecial(ally.id, FIELDS.meadow.path[0])).toBe(false)
    for (let tick = 0; tick < 180; tick++) engine.update(1 / 60)
    expect(engine.state.units).toContain(ally)
    expect(ally.hp).toBe(0)
    expect(enemy.progress).toBeGreaterThan(progress)
    expect(enemy.hp).toBe(health)
    expect(
      engine.state.attacks.slice(actions).some((action) => action.attackerId === ally.id || action.targetId === ally.id)
    ).toBe(false)
  })
