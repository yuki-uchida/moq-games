import { describe, expect, it } from 'vitest'
import { World, emptyInput } from '../src/game/sim'
import { STAGES } from '../src/game/stages'

/** Drives the player into the boss and bites until it falls, refilling health so the fight is about the boss. */
function fightBoss(stageId: string, seed = 5) {
  const stage = STAGES.find((entry) => entry.id === stageId)!
  const world = new World(stage, { seed })
  for (const enemy of world.enemies) enemy.dead = true
  if (!world.boss) {
    // The nest stage summons its boss once the materials are gathered.
    for (const prop of world.props) if (prop.kind === 'twig' || prop.kind === 'berry') world.collect(prop)
  }
  const boss = world.boss!
  let frames = 0
  while (!boss.dead && frames++ < 60 * 180) {
    const p = world.player
    p.x = boss.x - p.w - 2
    p.y = boss.y + boss.h - p.h
    p.vx = 0
    p.vy = 0
    p.facing = 1
    p.biteCooldown = 0
    p.hp = p.maxHp
    world.step(1 / 60, { ...emptyInput(), bitePressed: true })
  }
  return { world, boss, frames }
}

describe('stage bosses', () => {
  for (const stage of STAGES) {
    it(`${stage.id}: ${stage.boss.name} can be defeated and opens the exit`, () => {
      const { world, boss, frames } = fightBoss(stage.id)
      if (boss.def.stamina) {
        // The chasing parent is never defeated; she runs out of stamina instead.
        expect(boss.dead, `${stage.boss.name} should not die`).toBe(false)
        expect(boss.state).toBe('tired')
        return
      }
      expect(boss.dead, `${stage.boss.name} survived ${frames} frames`).toBe(true)
      if (stage.objective !== 'reach') expect(world.goalOpen).toBe(true)
    })
  }

  it('the chasing parent tires out instead of dying', () => {
    const world = new World(STAGES[0], { seed: 5 })
    const boss = world.boss!
    expect(boss.def.stamina).toBe(true)
    let frames = 0
    while (boss.state !== 'tired' && frames++ < 60 * 90) {
      world.player.hp = 999
      world.player.x = boss.x + 400
      world.step(1 / 60, emptyInput())
    }
    expect(boss.state).toBe('tired')
    expect(boss.dead).toBe(false)
    expect(boss.stamina).toBe(0)
  })

  it('defeating a boss clears the enemies it leaves behind only through the exit', () => {
    const { world } = fightBoss('stage-2')
    expect(world.boss!.dead).toBe(true)
    expect(world.state).toBe('play')
    expect(world.goalOpen).toBe(true)
  })
})
