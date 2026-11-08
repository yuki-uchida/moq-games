import { describe, expect, it } from 'vitest'
import {
  allyPlan,
  allyStep,
  attractGame,
  attractStage,
  attractTurns,
  playAttract,
  type AttractHost
} from '../src/attract'
import { campaign } from '../src/campaign'
import { createGame, distance, reachable, key, seeded, type Game } from '../src/game'
import { freshSave, snapshotGame, type Save } from '../src/save'

/** Runs a whole demo battle instantly, recording every presented action. */
async function play(game: Game, noise?: () => number) {
  const presented: string[] = []
  let shown = 0
  const host: AttractHost = {
    live: () => true,
    show: () => void shown++,
    present: async (_game, before, unit, action) => {
      const from = before.find((u) => u.id === unit.id)!
      presented.push(
        `${unit.side}:${unit.id}:${from.x},${from.y}>${unit.x},${unit.y}${action ? `:${action.kind}` : ''}`
      )
    },
    rest: async () => {}
  }
  await playAttract(game, host, noise)
  return { presented, shown }
}

describe('title demo', () => {
  it('follows the save to the chapter the title leads to, without changing it', () => {
    expect(attractStage(undefined)).toBe(0)
    const save: Save = { ...freshSave('classic'), furthest: 3 }
    expect(attractStage(save)).toBe(3)
    save.suspend = snapshotGame(createGame(5, 'balanced'))
    expect(attractStage(save)).toBe(5)
    const before = JSON.stringify(save)
    const game = attractGame(save, 0)
    game.units[0].hp = 1
    expect(game.stage).toBe(5)
    expect(JSON.stringify(save)).toBe(before)
  })

  it('plays the first loop identically every time', async () => {
    const a = await play(attractGame(undefined, 0))
    const b = await play(attractGame(undefined, 0))
    expect(a.presented).toEqual(b.presented)
    expect(a.presented.length).toBeGreaterThan(6)
  })

  it('only takes legal moves and finishes chapter one with a victory', async () => {
    const game = attractGame(undefined, 0)
    const { presented } = await play(game)
    expect(game.phase).toBe('won')
    expect(game.turn).toBeLessThanOrEqual(6)
    // Both sides moved and fought.
    expect(presented.some((p) => p.startsWith('ally:') && p.endsWith(':attack'))).toBe(true)
    expect(presented.some((p) => p.startsWith('enemy:'))).toBe(true)
  })

  it('heals with the staff when the healer is deployed', async () => {
    const game = createGame(3, 'balanced', undefined, seeded(3))
    const { presented } = await play(game)
    expect(presented.some((p) => p.endsWith(':heal'))).toBe(true)
  })

  it('ends every chapter within the turn cap, and later loops vary', async () => {
    for (let stage = 0; stage < campaign.length; stage++) {
      const game = createGame(stage, 'balanced', undefined, seeded(stage))
      await play(game)
      expect(game.phase === 'won' || game.phase === 'lost' || game.turn > attractTurns).toBe(true)
    }
    const first = await play(attractGame(undefined, 0))
    const varied = []
    for (let loop = 1; loop <= 4; loop++) {
      const noise = seeded(loop)
      varied.push((await play(attractGame(undefined, loop), () => noise() * 12)).presented.join())
    }
    expect(varied.some((run) => run !== first.presented.join())).toBe(true)
  })

  it('plans reachable squares and in-range targets', () => {
    const game = createGame(0, 'balanced')
    for (const unit of game.units.filter((u) => u.side === 'ally')) {
      const plan = allyPlan(game, unit)
      expect(reachable(game, unit).has(key(plan.to.x, plan.to.y))).toBe(true)
      if (plan.target) expect(distance(plan.to, plan.target)).toBeLessThanOrEqual(unit.range)
    }
  })

  it('finishes a foe it can defeat rather than chipping a sturdier one', () => {
    const game = createGame(0, 'balanced')
    const archer = game.units.find((u) => u.role === 'archer')!
    const [wolf, goblin] = ['wolf', 'goblin'].map((role) => game.units.find((u) => u.role === role)!)
    Object.assign(archer, { x: 5, y: 4 })
    Object.assign(wolf, { x: 7, y: 3, hp: 3 })
    Object.assign(goblin, { x: 7, y: 5, hp: 10 })
    const { action } = allyStep(game, archer)
    expect(action?.target.id).toBe(wolf.id)
    expect(wolf.hp).toBe(0)
  })

  it('drinks a potion from a safe square when badly hurt', () => {
    const game = createGame(0, 'balanced')
    const soldier = game.units.find((u) => u.role === 'soldier')!
    soldier.hp = 3
    const { action } = allyStep(game, soldier)
    expect(action).toBeUndefined()
    expect(soldier.hp).toBe(11)
    expect(game.potions).toBe(1)
    expect(soldier.done).toBe(true)
  })

  it('stops as soon as the host does', async () => {
    const game = attractGame(undefined, 0)
    let budget = 3
    const host: AttractHost = {
      live: () => budget > 0,
      show: () => {},
      present: async () => void budget--,
      rest: async () => {}
    }
    await playAttract(game, host)
    expect(budget).toBe(0)
    expect(game.turn).toBe(1)
  })
})
