import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { DISABLED_ENEMIES, ENEMIES, ENEMY_INDEX, EVENTS, POOLS, timeAtAge } from '../src/data'
import { Game } from '../src/game'
import { LIFE_OUTCOMES } from '../src/history'
import { flash } from '../src/art/enemies'
import { SHEETS } from '../src/art/index'
import { readView, STRIDE, toView } from '../src/view'

const setup = () => {
  const game = new Game(73)
  game.state.time = timeAtAge(30)
  game.state.eventIndex = EVENTS.length
  const owner = game.addPlayer('owner', 'p_free')!
  const single = game.addPlayer('single', 'p_free')!
  for (const player of game.state.players) {
    player.weapons = []
    player.choices = []
    player.pending = 0
  }
  return { game, owner, single }
}

test('the new partner occupies exactly the retired worry slot and retains both old definitions and sprites', () => {
  expect(ENEMIES.filter((def) => def.behavior !== 'boss')).toHaveLength(41)
  expect(ENEMIES.filter((def) => def.behavior === 'boss')).toHaveLength(12)
  const partner = ENEMIES[ENEMY_INDEX.get('controlling_partner')!]
  expect(partner).toMatchObject({ name: '束縛するパートナー', behavior: 'circler', tag: 'love' })
  const sheet = SHEETS['enemy:controlling_partner']()
  expect(sheet.move.frames).toHaveLength(6)
  expect(new Set(sheet.move.frames.map((frame) => createHash('sha256').update(frame.data).digest('hex'))).size).toBe(6)
  for (const id of ['crush', 'unrequited_worry']) {
    expect(DISABLED_ENEMIES.find((def) => def.id === id)).toMatchObject({ hp: 34, behavior: 'circler' })
    expect(ENEMY_INDEX.has(id)).toBe(false)
    for (const frame of sheet.move.frames) {
      for (const old of SHEETS['enemy:' + id]().move.frames) expect(frame.data).not.toEqual(old.data)
    }
  }
  for (const [index, frame] of sheet.move.frames.entries()) {
    expect([frame.w, frame.h]).toEqual([64, 64])
    expect(sheet.flash.frames[index].data).toEqual(flash(frame).data)
  }
  for (const age of [6, 11, 12, 18, 34, 35, 70]) {
    const pool = POOLS.find((entry) => age < entry.untilAge)!
    expect(pool.enemies.some(([id]) => id === 'controlling_partner')).toBe(age >= 12)
  }
})

test.each(['dating', 'married'] as const)(
  'the partner attacks only its %s owner and never a single teammate',
  (relationship) => {
    const { game, owner, single } = setup()
    single.weapons = [{ id: 'w_love', lv: 8, cd: 100, held: 0, damage: 0 }]
    expect(game.spawnEnemy('controlling_partner')).toBeUndefined()
    owner[relationship] = true
    if (relationship === 'married') {
      const wedding = EVENTS.findIndex((event) => event.boss === 'b_wedding')
      game.state.time = EVENTS[wedding].at + 0.01
      owner.history.push({ event: wedding, outcome: LIFE_OUTCOMES.b_wedding[0] })
    }
    owner.x = 600
    single.x = 0
    const enemy = game.spawnEnemy('controlling_partner', single.x, single.y)!
    expect(enemy.targetPlayer).toBe(owner.id)
    const health = single.hp
    game.tick(0.01)
    expect(enemy.x).toBeGreaterThan(0)
    expect(single.hp).toBe(health)
    enemy.x = owner.x
    enemy.y = owner.y
    const ownerHealth = owner.hp
    game.tick(0.01)
    expect(owner.hp).toBeLessThan(ownerHealth)
    expect(single.hp).toBe(health)
    const view = readView(toView(game.state))!
    expect(view.v).toBe(20)
    expect(view.enemies.filter((_, index) => index % STRIDE.enemies === 1)).toContain(ENEMY_INDEX.get(enemy.kind))
  }
)

test.each(['down', 'leave', 'single'] as const)(
  'the partner retires on owner %s instead of switching to another eligible player',
  (reason) => {
    const { game, owner, single } = setup()
    owner.dating = true
    const enemy = game.spawnEnemy('controlling_partner')!
    single.married = true
    if (reason === 'down') owner.downed = true
    else if (reason === 'leave') game.removePlayer(owner.id)
    else owner.dating = false
    game.tick(0.01)
    expect(game.state.enemies).not.toContain(enemy)
    expect(enemy.hp).toBe(0)
  }
)

test('a late joiner opts in personally without taking over an existing partner', () => {
  const { game, owner } = setup()
  owner.dating = true
  const original = game.spawnEnemy('controlling_partner')!
  const late = game.addPlayer('late', 'p_free')!
  expect(late.choices).toEqual(['d:yes', 'd:no'])
  expect(late.dating).toBe(false)
  game.setInput(late.id, { pick: 0, pickSeq: late.choiceSeq })
  expect(late.dating).toBe(true)
  const owners = new Set(Array.from({ length: 40 }, () => game.spawnEnemy('controlling_partner')!.targetPlayer))
  expect(owners).toEqual(new Set([owner.id, late.id]))
  expect(original.targetPlayer).toBe(owner.id)
  expect(readView(toView(game.state))).toBeDefined()
})

test('normal age-pool spawning excludes singles and assigns relationship enemies to the eligible participant', () => {
  for (const relationship of ['single', 'dating', 'married'] as const) {
    const { game, owner } = setup()
    const eligible = relationship !== 'single'
    if (relationship !== 'single') owner[relationship] = true
    if (relationship === 'married') game.state.time = timeAtAge(40)
    const seen = new Set<string>()
    for (let tick = 0; tick < 200; tick++) {
      game.state.enemies = []
      game.tick(0.1)
      for (const enemy of game.state.enemies) {
        if (enemy.kind !== 'controlling_partner' && enemy.kind !== 'temptation') continue
        expect(eligible).toBe(true)
        expect(enemy.targetPlayer).toBe(owner.id)
        seen.add(enemy.kind)
      }
    }
    expect(seen.has('controlling_partner')).toBe(eligible)
    expect(seen.has('temptation')).toBe(eligible)
  }
})
