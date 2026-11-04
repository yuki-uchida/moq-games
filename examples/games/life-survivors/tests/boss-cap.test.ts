import { expect, test } from 'vitest'
import { ENEMY_BY_ID, EVENTS, RUN_SECONDS } from '../src/data'
import { FX } from '../src/fx'
import { Game, REAPER_SECONDS } from '../src/game'
import { readView, STRIDE, toView, VIEW_CAPS } from '../src/view'
import { MAX_PAYLOAD_BYTES } from '../../rabbiters/src/network'

const eventIndex = EVENTS.findIndex((event) => event.boss === 'b_vaccine')

function arena(players: number) {
  const game = new Game(42)
  for (let index = 0; index < players; index++) {
    const player = game.addPlayer(`player-${index}`, 'p_gone')!
    player.birthPick = false
    player.pending = 0
    player.choices = []
    player.weapons = []
  }
  game.state.eventIndex = eventIndex
  game.state.time = EVENTS[eventIndex].at
  return game
}

function expectView(game: Game) {
  const view = toView(game.state)
  expect(view.enemies.length / STRIDE.enemies).toBe(game.state.enemies.length)
  expect(game.state.enemies.length).toBeLessThanOrEqual(VIEW_CAPS.enemies)
  expect(new TextEncoder().encode(JSON.stringify(view)).length).toBeLessThan(MAX_PAYLOAD_BYTES)
  expect(readView(JSON.parse(JSON.stringify(view)))).toBeDefined()
}

test.each([
  [1, 579],
  [1, 580],
  [4, 579],
  [4, 580]
])('age boss at %i players / %i enemies', (players, count) => {
  const game = arena(players)
  const protectedBoss = game.spawnEnemy('b_hs', 800, 0)!
  for (let index = 1; index < count; index++) game.spawnEnemy('exam', 800, 0)
  const retired = game.state.enemies[1]
  const kills = game.state.kills
  game.tick(0)
  expect(game.state.enemies).toContain(protectedBoss)
  expect(game.state.enemies.includes(retired)).toBe(count === 579)
  expect(retired.hp > 0).toBe(count === 579)
  expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_vaccine')).toHaveLength(1)
  expect(game.state.enemies).toHaveLength(580)
  expect(game.state.kills).toBe(kills)
  expect(game.state.gems).toHaveLength(0)
  game.tick(0)
  expect(game.state.fx.filter((event) => event.type === FX.BOSS_SPAWN)).toHaveLength(2)
  expectView(game)
})

test('all-boss capacity defers the boss without replaying its event', () => {
  const game = arena(2)
  for (let index = 0; index < 580; index++) game.spawnEnemy('b_hs', 800, 0)
  const original = [...game.state.enemies]
  game.tick(0)
  const log = [...game.state.log]
  expect(game.state.eventIndex).toBe(eventIndex + 1)
  expect(game.state.enemies).toEqual(original)
  game.tick(0)
  expect(game.state.log).toEqual(log)
  expectView(game)
  original[0].hp = 0
  game.tick(0)
  game.tick(0)
  expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_vaccine')).toHaveLength(1)
  expect(game.state.enemies.every((enemy) => ENEMY_BY_ID.get(enemy.kind)!.behavior === 'boss')).toBe(true)
  game.tick(0)
  expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_vaccine')).toHaveLength(1)
  expect(game.state.log).toEqual(log)
  expectView(game)
})

test('replacing an enemy invalidates pet references without a kill reward', () => {
  const game = arena(1)
  const player = game.state.players[0]
  player.weapons = [{ id: 'w_pet', lv: 1, cd: 0, held: 0, damage: 0 }]
  game.state.time = 0
  game.tick(0.01)
  const pet = game.state.shots.find((shot) => shot.weapon === 'w_pet')!
  expect(pet).toBeDefined()
  while (game.state.enemies.length < 580) game.spawnEnemy('exam', 800, 0)
  const retired = game.state.enemies[0]
  pet.target = retired
  const kills = game.state.kills
  expect(game.spawnEnemy('b_vaccine', 800, 0)).toBeDefined()
  expect(pet.target).toBeUndefined()
  expect(retired.hp).toBe(0)
  expect(game.state.kills).toBe(kills)
  expectView(game)
})

test('multiple deferred bosses appear once in event order as capacity opens', () => {
  const game = arena(2)
  for (let index = 0; index < 580; index++) game.spawnEnemy('b_care', 800, 0)
  game.tick(0)
  const nextBoss = EVENTS.find((event) => event.boss === 'b_hs')!
  game.state.time = nextBoss.at
  game.tick(0)
  const log = [...game.state.log]

  for (const kind of ['b_vaccine', 'b_hs']) {
    game.state.enemies.find((enemy) => enemy.kind === 'b_care')!.hp = 0
    game.tick(0)
    game.tick(0)
    expect(game.state.enemies.filter((enemy) => enemy.kind === kind)).toHaveLength(1)
  }
  game.tick(0)
  expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_vaccine')).toHaveLength(1)
  expect(game.state.enemies.filter((enemy) => enemy.kind === 'b_hs')).toHaveLength(1)
  expect(game.state.log).toEqual(log)
  expectView(game)
})

test('a pending boss cannot appear after the last player is downed', () => {
  const game = arena(1)
  for (let index = 0; index < 580; index++) game.spawnEnemy('b_care', 800, 0)
  game.tick(0)
  game.state.players[0].downed = true
  game.tick(0)
  expect(game.state.phase).toBe('lost')
  game.state.enemies = []
  game.tick(0)
  expect(game.state.enemies).toHaveLength(0)
})

test('a pending boss cannot appear during or after the reaper ending', () => {
  const game = arena(1)
  for (let index = 0; index < 580; index++) game.spawnEnemy('b_care', 800, 0)
  game.tick(0)
  game.state.time = RUN_SECONDS
  game.tick(0)
  expect(game.state.phase).toBe('reaper')
  expect(game.state.enemies).toHaveLength(0)
  game.tick(REAPER_SECONDS)
  expect(game.state.phase).toBe('won')
  game.tick(0)
  expect(game.state.enemies).toHaveLength(0)
})
