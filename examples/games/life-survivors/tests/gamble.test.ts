import { expect, test } from 'vitest'
import { sheet } from '../src/art/index'
import { ENEMY_BY_ID, EVENTS, TALENT_CATEGORIES, WEAPONS, WEAPON_BY_ID, WEAPON_INDEX, timeAtAge } from '../src/data'
import { Effects, PK, type FxView } from '../src/effects'
import { FX } from '../src/fx'
import { Game, playerStats, weaponStats } from '../src/game'
import { SHOT_GAMBLE, readView, toView } from '../src/view'
import { GAMBLE_FORMS, gambleForm, weaponAppearance } from '../src/weapon-life'

const copiedWeapons = WEAPONS.filter((def) => def.id !== 'w_gamble' && def.behavior !== 'none')
const fxView: FxView = { local: 0, px: 0, py: 0, cx: 0, cy: 0, hw: 640, hh: 360 }

function setup() {
  const game = new Game(17)
  const player = game.addPlayer('player', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = [{ id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0 }]
  for (const category of TALENT_CATEGORIES) player.talents[category] = 1
  game.targetPopulation = () => 0
  game.state.eventIndex = EVENTS.length
  return { game, player, weapon: player.weapons[0] }
}

function choose(game: Game, id: string) {
  const index = copiedWeapons.findIndex((def) => def.id === id)
  expect(index).toBeGreaterThanOrEqual(0)
  Object.defineProperty(game, 'rng', { value: () => (index + 0.5) / copiedWeapons.length, configurable: true })
}

test('gambling repeats the selected weapon before drawing again', () => {
  const { game, weapon } = setup()
  choose(game, 'w_cooking')
  game['fireWeapons'](0)
  expect(weapon.gambleWeapon).toBe('w_cooking')
  expect(game.state.fx.find((event) => event.type === FX.GAMBLE)?.b).toBe(WEAPON_INDEX.get('w_cooking'))
  choose(game, 'w_sns')
  game['fireWeapons'](2)
  game['fireWeapons'](2)
  expect(weapon.gambleWeapon).toBe('w_cooking')
  expect(game.state.fx.filter((event) => event.type === FX.GAMBLE)).toHaveLength(1)
  game['fireWeapons'](8)
  expect(weapon.gambleWeapon).toBe('w_sns')
  expect(game.state.fx.filter((event) => event.type === FX.GAMBLE)).toHaveLength(2)
})

test.each(copiedWeapons)('gambling can activate $id with its own behavior and statistics', (def) => {
  const { game, player, weapon } = setup()
  const enemy = game.spawnEnemy('germ', player.x + 10, player.y)!
  enemy.hp = enemy.maxHp = 1_000_000
  game['buildGrid']()
  choose(game, def.id)
  game['fire'](player, weapon, weaponStats(player, weapon))
  const shot = game.state.shots.find((entry) => entry.weapon === def.id)!
  expect(shot).toBeDefined()
  expect(shot).toMatchObject({ weapon: def.id, sourceWeapon: 'w_gamble', kind: def.behavior })
  const stats = weaponStats(player, weapon, playerStats(player), def)
  expect(shot.damage).toBeCloseTo(stats.damage)
  expect(shot.maxLife).toBeCloseTo(stats.duration)
})

test('copied immediate damage belongs to gambling, including when the copied weapon is owned', () => {
  const { game, player, weapon } = setup()
  const actual = { id: 'w_sns', lv: 1, cd: 100, held: 0, damage: 0 }
  player.weapons.push(actual)
  player.talents.invest = 1.5
  player.talents.friend = 0.55
  const enemy = game.spawnEnemy('germ', player.x + 10, player.y)!
  enemy.hp = enemy.maxHp = 10_000
  game['buildGrid']()
  choose(game, 'w_sns')
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(weapon.damage).toBeGreaterThan(0)
  expect(weapon.damage).toBeCloseTo(enemy.maxHp - enemy.hp)
  expect(actual.damage).toBe(0)
  expect(game.state.shots[0].damage).toBeCloseTo(WEAPON_BY_ID.get('w_sns')!.damage * 1.5)
  expect(ENEMY_BY_ID.get(enemy.kind)).toBeDefined()
})

test('a real pet leaving does not remove a copied pet', () => {
  const { game, player, weapon } = setup()
  const pet = { id: 'w_pet', lv: 1, cd: 0, held: 0, damage: 0, acquiredAge: 0 }
  player.weapons.push(pet)
  choose(game, 'w_pet')
  game['fire'](player, weapon, weaponStats(player, weapon))
  game['fire'](player, pet, weaponStats(player, pet))
  expect(game.state.shots.map((shot) => shot.sourceWeapon)).toEqual(['w_gamble', 'w_pet'])
  game.state.time = timeAtAge(20) + 0.01
  game['ageWeapons']()
  expect(game.state.shots.map((shot) => shot.sourceWeapon)).toEqual(['w_gamble'])
})

test.each(GAMBLE_FORMS)('gambling becomes $name at age $age', (form) => {
  expect(gambleForm(form.age)).toBe(form)
  if (form.age > 12) expect(gambleForm(form.age - 1).key).not.toBe(form.key)
  expect(weaponAppearance('w_gamble', form.age)).toMatchObject({
    name: `ギャンブル（${form.name}）`,
    art: `w_gamble_${form.key}`
  })
  expect(sheet('icons')[`w_gamble_${form.key}`].frames[0].data.some(Boolean)).toBe(true)
  const frames = sheet('fx')[`gamble_${form.key}`].frames
  expect(frames).toHaveLength(6)
  expect(new Set(frames.map((frame) => Array.from(frame.data).join(','))).size).toBeGreaterThan(2)
  const effects = new Effects()
  const event = [1, FX.GAMBLE, 0, 0, GAMBLE_FORMS.indexOf(form), 0]
  effects.consume(event, timeAtAge(form.age) + 0.01, fxView)
  expect(effects.pool.items).toEqual([expect.objectContaining({ kind: PK.sprite, spr: `gamble_${form.key}` })])
  effects.update(0.6)
  expect(effects.pool.items[0].age).toBeGreaterThan(0)
  effects.update(1)
  expect(effects.pool.items).toHaveLength(0)
})

test('a delayed snapshot preserves the age of the gambling activation', () => {
  const { game } = setup()
  game.state.time = timeAtAge(18) - 0.01
  choose(game, 'w_cooking')
  game['fireWeapons'](0)
  const view = toView(game.state)
  const effects = new Effects()
  effects.consume(view.fx, timeAtAge(18) + 0.01, fxView)
  expect(effects.pool.items.some((particle) => particle.spr === 'gamble_gacha')).toBe(true)
})

test('copied shots and gambling fire events survive a multiplayer snapshot', () => {
  const { game, player } = setup()
  game.state.time = timeAtAge(18) + 0.01
  choose(game, 'w_cooking')
  game['fireWeapons'](0)
  const view = toView(game.state)
  expect(readView(JSON.parse(JSON.stringify(view)))).toBeDefined()
  expect(view.shots[0]).toBe(WEAPON_INDEX.get('w_cooking'))
  expect(view.shots[7]).toBeGreaterThanOrEqual(SHOT_GAMBLE)
  expect(view.fx).toContain(WEAPON_INDEX.get('w_gamble'))
  expect(view.fx).toContain(FX.GAMBLE)
  expect(game.state.shots.every((shot) => shot.owner === player.id && shot.sourceWeapon === 'w_gamble')).toBe(true)
})
