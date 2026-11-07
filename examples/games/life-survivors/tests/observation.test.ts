import { expect, test } from 'vitest'
import { sheet } from '../src/art/index'
import { EVENTS, MAX_WEAPON_LEVEL, WEAPON_BY_ID, WEAPON_INDEX, timeAtAge } from '../src/data'
import { Game, playerStats, weaponStats } from '../src/game'
import { SHOT_GAMBLE, readView, toView } from '../src/view'
import { OBSERVATION_FORMS, OBSERVATION_SPRITES, observationForm, weaponAppearance } from '../src/weapon-life'
import { botInput } from './bot'

function setup(age = 3, level = 1) {
  const game = new Game(42)
  const player = game.addPlayer('a', 'p_gone')!
  game.targetPopulation = () => 0
  game.state.time = timeAtAge(age) + 0.01
  game.state.eventIndex = EVENTS.length
  player.choices = []
  player.pending = 0
  player.birthPick = false
  player.talents.hobby = 1
  player.weapons = [{ id: 'w_observe', lv: level, cd: 0, held: 0, damage: 0 }]
  return { game, player, weapon: player.weapons[0] }
}

test('ordinary weapon offers unlock at age three', () => {
  const { game, player } = setup(2)
  player.weapons = []
  expect(game.options(player)).not.toContain('w:w_observe')
  game.state.time = timeAtAge(3) + 0.01
  expect(game.options(player)).toContain('w:w_observe')
})

test('only uninterrupted movement-free time summons one creature, even after moving away', () => {
  const { game, player } = setup()
  game.tick(1)
  expect(game.state.shots).toHaveLength(0)
  game.setInput(player.id, { x: 1, y: 0 })
  game.tick(0.1)
  game.setInput(player.id, { x: 0, y: 0 })
  game.tick(1.9)
  expect(game.state.shots).toHaveLength(0)
  player.choices = ['x:skip']
  game.tick(5)
  expect(game.state.shots).toHaveLength(0)
  player.choices = []
  game.tick(0.11)
  expect(game.state.shots).toHaveLength(1)
  const first = game.state.shots[0]
  game.setInput(player.id, { x: 1, y: 0 })
  game.tick(0.1)
  expect(player.still).toBe(0)
  expect(game.state.shots).toEqual([first])
  game.setInput(player.id, { x: 0, y: 0 })
  game.tick(2.1)
  expect(game.state.shots).toEqual([first])
  game.tick(10)
  expect(game.state.shots).toHaveLength(0)
  game.tick(0.01)
  expect(game.state.shots).toHaveLength(1)
  expect(Math.floor(game.state.shots[0].v / 2)).toBe(1)
})

test.each(Array.from({ length: MAX_WEAPON_LEVEL }, (_, index) => index + 1))(
  'level %i reduces the still time needed to summon',
  (level) => {
    const { game, player, weapon } = setup(3, level)
    const required = 2 - (level - 1) * 0.125
    player.still = required - 0.01
    game['fire'](player, weapon, weaponStats(player, weapon))
    expect(game.state.shots).toHaveLength(0)
    game.tick(0.005)
    expect(game.state.shots).toHaveLength(0)
    game.tick(0.01)
    expect(game.state.shots).toHaveLength(1)
  }
)

test.each(OBSERVATION_FORMS)('the creature changes to $name at age $age', (form) => {
  const { game, player, weapon } = setup(form.age)
  expect(observationForm(form.age)).toBe(form)
  if (form.age > 3) expect(observationForm(form.age - 1)).not.toBe(form)
  expect(weaponAppearance(weapon.id, form.age).name).toContain(form.name)
  player.still = 2
  game['fire'](player, weapon, weaponStats(player, weapon))
  const shot = game.state.shots[0]
  const expected = form.age === 3 ? 0 : form.age === 6 ? 2 : form.age === 12 ? 3 : form.age === 15 ? 4 : 5
  expect(Math.floor(shot.v / 2)).toBe(expected)
  game.state.time = timeAtAge(30)
  expect(Math.floor(shot.v / 2)).toBe(expected)
  const view = toView(game.state)
  expect(readView(view)).toBeDefined()
  expect(view.shots[0]).toBe(WEAPON_INDEX.get('w_observe'))
  expect(Math.floor(view.shots[7] / 2)).toBe(expected)
})

test('every creature and the weapon icon have distinct generated art', () => {
  const art = sheet('weapon:w_observe')
  const pictures = OBSERVATION_SPRITES.map((kind) => {
    expect(art[kind].frames).toHaveLength(2)
    expect(art[kind].frames[0].data.some(Boolean)).toBe(true)
    return Array.from(art[kind].frames[0].data).join(',')
  })
  expect(new Set(pictures).size).toBe(OBSERVATION_SPRITES.length)
  expect(sheet('icons').w_observe.frames[0].data.some(Boolean)).toBe(true)
})

test.each(Array.from({ length: MAX_WEAPON_LEVEL }, (_, index) => index + 1))(
  'level %i limits each field to that level plus one enemy',
  (level) => {
    const { game, player, weapon } = setup(18, level)
    const enemies = Array.from({ length: 12 }, (_, index) => {
      const enemy = game.spawnEnemy('germ', 60 + index * 7, 0)!
      enemy.hp = enemy.maxHp = 10000
      return enemy
    })
    player.still = 2
    game['buildGrid']()
    game['fire'](player, weapon, weaponStats(player, weapon))
    const shot = game.state.shots[0]
    const positions = enemies.map((enemy) => enemy.x)
    game['moveShots'](0.1)
    expect(shot.targets).toHaveLength(level + 1)
    expect(enemies.filter((enemy) => enemy.hp < enemy.maxHp)).toHaveLength(level + 1)
    expect(enemies.filter((enemy) => enemy.slow > 0)).toHaveLength(level + 1)
    expect(enemies.slice(0, level + 1).every((enemy, index) => enemy.x < positions[index])).toBe(true)
    expect(enemies.slice(level + 1).every((enemy, index) => enemy.x === positions[index + level + 1])).toBe(true)
  }
)

test('fields remain active and replace defeated targets throughout their lifetime', () => {
  const { game, player, weapon } = setup()
  const enemies = Array.from({ length: 3 }, (_, index) => {
    const enemy = game.spawnEnemy('germ', 70 + index * 10, 0)!
    enemy.hp = enemy.maxHp = 10000
    return enemy
  })
  player.still = 2
  game['buildGrid']()
  game['fire'](player, weapon, weaponStats(player, weapon))
  const shot = game.state.shots[0]
  game['moveShots'](0.1)
  expect(shot.v % 2).toBe(1)
  expect(shot.targets).toEqual(enemies.slice(0, 2))
  const initialHp = enemies.map((enemy) => enemy.hp)
  enemies[0].hp = 0
  game.state.time += 0.6
  game['moveShots'](0.5)
  expect(shot.targets).toEqual(enemies.slice(1))
  expect(enemies[1].hp).toBeLessThan(initialHp[1])
  expect(enemies[2].hp).toBeLessThan(initialHp[2])
  game['moveShots'](0.5)
  expect(shot.v % 2).toBe(1)
  const duringPause = enemies[1].hp
  game.state.time += 1
  game['moveShots'](0.3)
  expect(enemies[1].hp).toBeLessThan(duringPause)
  game['moveShots'](0.7)
  expect(shot.v % 2).toBe(1)
  expect(shot.targets).toEqual(enemies.slice(1))
  expect(enemies[2].hp).toBeLessThan(initialHp[2])
})

test('bonus projectiles do not increase creatures or targets, while duration extends their lifetime', () => {
  const { game, player, weapon } = setup()
  const base = weaponStats(player, weapon)
  expect(base.duration).toBe(12)
  player.passives = [
    { id: 'p_clever', lv: 4 },
    { id: 'p_grand', lv: 2 },
    { id: 'p_curious', lv: 3 }
  ]
  const boosted = weaponStats(player, weapon)
  expect(playerStats(player).amount).toBeGreaterThan(0)
  expect(boosted.amount).toBe(base.amount)
  expect(boosted.duration).toBeGreaterThan(base.duration)
  player.still = 2
  game['fire'](player, weapon, boosted)
  expect(game.state.shots).toHaveLength(1)
  expect(game.state.shots[0].w).toBe(2)
  expect(game.state.shots[0].maxLife).toBe(boosted.duration)
  game['moveShots'](base.duration + 0.01)
  expect(game.state.shots).toHaveLength(1)
  game['moveShots'](boosted.duration - base.duration)
  expect(game.state.shots).toHaveLength(0)
  weapon.lv = MAX_WEAPON_LEVEL
  expect(weaponStats(player, weapon).amount).toBe(1)
})

test('cooldown does not affect observation resummoning', () => {
  const nextSummon = (passives: string[]) => {
    const { game, player } = setup()
    player.talents.study = 1
    player.talents.sports = 1
    player.passives = passives.map((id) => ({ id, lv: 1 }))
    player.still = 2
    game['fireWeapons'](0)
    const firstId = game.state.shots[0].id
    for (let step = 1; step <= 300; step++) {
      game['fireWeapons'](0.1)
      game['moveShots'](0.1)
      if (game.state.shots.some((shot) => shot.id !== firstId)) return step
    }
    throw new Error('The next creature was not summoned')
  }
  expect(nextSummon(['p_diligent'])).toBe(nextSummon([]))
  expect(nextSummon(['p_grand', 'p_diligent'])).toBe(nextSummon(['p_grand']))
})

test('a gambling copy also requires stillness and keeps its own field and snapshot', () => {
  const { game, player } = setup(18)
  const gamble = { id: 'w_gamble', lv: 3, cd: 0, held: 0, damage: 0 }
  player.weapons.push(gamble)
  const def = WEAPON_BY_ID.get('w_observe')!
  const stats = weaponStats(player, gamble, playerStats(player), def)
  game['fire'](player, gamble, stats, def)
  expect(game.state.shots).toHaveLength(0)
  player.still = 2
  game['fire'](player, gamble, stats, def)
  game['fire'](player, gamble, stats, def)
  expect(game.state.shots).toHaveLength(1)
  expect(game.state.shots[0]).toMatchObject({ sourceWeapon: 'w_gamble', w: 4 })
  const view = toView(game.state)
  expect(view.shots[7]).toBeGreaterThanOrEqual(SHOT_GAMBLE)
  expect(readView(view)).toBeDefined()
})

test('the smart bot stops to summon when safe and keeps moving when threatened', () => {
  const { game, player } = setup()
  expect(botInput(game, player, 'smart')).toMatchObject({ x: 0, y: 0 })
  game.spawnEnemy('germ', player.x + 40, player.y)
  expect(botInput(game, player, 'smart').x).toBeLessThan(0)
})

test('the smart bot prefers an active first weapon when another option is available', () => {
  const { game, player } = setup()
  player.weapons = []
  player.choices = ['w:w_observe', 'w:w_friend']
  expect(botInput(game, player, 'smart').pick).toBe(1)
})
