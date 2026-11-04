import { describe, expect, test } from 'vitest'
import { ENEMY_BY_ID, EVENTS } from '../src/data'
import { Game } from '../src/game'
import { readView, toView } from '../src/view'
import { SHEETS } from '../src/art/index'

describe('personal relationships', () => {
  test('the rival has distinct artwork with a hit-flash animation', () => {
    expect(ENEMY_BY_ID.get('temptation')?.name).toBe('浮気相手のイケメン店長')
    const rival = SHEETS['enemy:temptation']()
    const former = SHEETS['enemy:girlfriend']()
    expect(rival.move.frames[0].rgba()).not.toEqual(former.move.frames[0].rgba())
    expect(rival.flash.frames).toHaveLength(rival.move.frames.length)
  })

  test('a late joining player gets their own relationship choice', () => {
    const game = new Game(41)
    game.state.time = 900
    const player = game.addPlayer('late', 'p_free')!
    expect(player.choices).toEqual(['d:yes', 'd:no'])
    expect(readView(toView(game.state))).toBeDefined()
    game.setInput(player.id, { pick: 0, pickSeq: player.choiceSeq })
    expect(player.dating).toBe(true)
  })
  test('the relationship choice is personal, independent of weapons, and survives snapshot validation', () => {
    const game = new Game(42)
    const first = game.addPlayer('first', 'p_free')!
    const second = game.addPlayer('second', 'p_free')!
    const event = EVENTS.findIndex((entry) => entry.swarm === 'car')
    game.state.eventIndex = event
    game.state.time = EVENTS[event].at - 0.01
    game.tick(0.02)
    expect(first.choices).toEqual(['d:yes', 'd:no'])
    expect(readView(toView(game.state))).toBeDefined()
    game.setInput(first.id, { pick: 0, pickSeq: first.choiceSeq })
    game.setInput(second.id, { pick: 1, pickSeq: second.choiceSeq })
    expect(first.dating).toBe(true)
    expect(second.dating).toBe(false)
    expect(readView(toView(game.state))?.players[0].dating).toBe(true)
    expect(game.spawnEnemy('temptation')?.targetPlayer).toBe(first.id)
  })

  test.each(['down', 'leave'] as const)('only the owner is attacked and the enemy retires on %s', (reason) => {
    const game = new Game(43)
    const owner = game.addPlayer('owner', 'p_free')!
    const other = game.addPlayer('other', 'p_free')!
    owner.dating = true
    owner.x = 100
    other.x = 0
    const enemy = game.spawnEnemy('temptation', 0, 0)!
    const hp = other.hp
    game.tick(0.1)
    expect(other.hp).toBe(hp)
    expect(enemy.x).toBeGreaterThan(0)
    enemy.x = owner.x
    enemy.y = owner.y
    const ownerHp = owner.hp
    game.tick(0.1)
    expect(owner.hp).toBeLessThan(ownerHp)
    expect(other.hp).toBe(hp)
    if (reason === 'down') owner.downed = true
    else game.removePlayer(owner.id)
    game.tick(0.1)
    expect(game.state.enemies).not.toContain(enemy)
    expect(other.hp).toBe(hp)
  })
})
