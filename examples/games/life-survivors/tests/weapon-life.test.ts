import { expect, test } from 'vitest'
import { ageAt, EVENTS, MAX_WEAPON_LEVEL, PASSIVES, PASSIVE_SLOTS, timeAtAge } from '../src/data'
import { Game, choiceText, playerStats, weaponName, weaponStats } from '../src/game'
import { sheet } from '../src/art/index'
import { resultCategories } from '../src/result'
import { activeSynergies } from '../src/synergies'
import { readView, toView } from '../src/view'
import { PET_MEMORY, SPORTS_FORMS, petForm, sportsForm, weaponAppearance } from '../src/weapon-life'

function setup(age = 30) {
  const game = new Game(7)
  const player = game.addPlayer('a', 'p_over')!
  game.state.time = timeAtAge(age) + 0.001
  game.state.eventIndex = EVENTS.length
  player.weapons = []
  player.choices = []
  player.pending = 0
  player.birthPick = false
  const obtain = (id: string) => {
    player.choices = [`w:${id}`]
    game.choose(player, 0)
  }
  const at = (years: number) => {
    game.state.time = timeAtAge(years) + 0.001
    game.state.enemies = []
    game.tick(0)
  }
  return { game, player, obtain, at }
}

test.each(SPORTS_FORMS)('sports switches at age $age to $name without replacing the weapon', (form) => {
  expect(sportsForm(form.age).key).toBe(form.key)
  if (form.age > 0) expect(sportsForm(form.age - 0.001).key).not.toBe(form.key)
  const { player, obtain } = setup()
  obtain('w_sports')
  const weapon = player.weapons[0]
  weapon.lv = MAX_WEAPON_LEVEL
  weapon.damage = 123
  weapon.held = 90
  player.passives = [{ id: 'p_hot', lv: 1 }]
  const before = { ...weapon }
  const stats = weaponStats(player, weapon)
  expect(choiceText(player, 'w:w_sports', form.age).name).toContain(form.name)
  expect(choiceText(player, 's:w_sports', form.age).name).toContain(form.name)
  expect(choiceText(player, 'r:w_sports:w_pet', form.age).name).toContain(form.name)
  expect(weaponName(player, weapon, form.age)).toContain('全国制覇')
  expect(weaponName(player, weapon, form.age)).toContain(form.name)
  expect(weapon).toEqual(before)
  expect(weaponStats(player, weapon)).toEqual(stats)
  expect(weaponAppearance(weapon.id, form.age).art).toBe(`w_sports_${form.key}`)
  expect(sheet(`weapon:w_sports_${form.key}`).fly.frames).toHaveLength(4)
  expect(sheet('icons')[`w_sports_${form.key}`].frames[0].data.some(Boolean)).toBe(true)
})

test('all sports forms have distinct art and baseball starts at junior high', () => {
  expect(sportsForm(5).name).toBe('サッカー')
  expect(sportsForm(6).name).toBe('サッカー')
  expect(sportsForm(11).name).toBe('サッカー')
  expect(sportsForm(12).name).toBe('野球')
  expect(sportsForm(14).name).toBe('野球')
  expect(sportsForm(80).name).toBe('ゲートボール')
  const frames = SPORTS_FORMS.map((form) => [...sheet(`weapon:w_sports_${form.key}`).fly.frames[0].data].join(','))
  expect(new Set(frames).size).toBe(SPORTS_FORMS.length)
})

test('unrelated evolved weapon names retain their existing display', () => {
  const { player, obtain } = setup()
  obtain('w_invest')
  player.weapons[0].lv = MAX_WEAPON_LEVEL
  player.passives = [{ id: 'p_greedy', lv: 1 }]
  expect(weaponName(player, player.weapons[0], 50)).toBe('複利の魔法')
})

test.each([
  [0, '子犬'],
  [1, '子犬'],
  [2, '成犬'],
  [11, '成犬'],
  [12, '老犬'],
  [19, '老犬']
] as const)('pet appearance at %i years is %s', (years, name) => {
  expect(petForm(years).name).toBe(name)
  expect(weaponAppearance('w_pet', 30 + years, years).name).toContain(name)
})

test('a pet ages from acquisition, not firing time; upgrades do not reset its life', () => {
  const { game, player, obtain, at } = setup()
  obtain('w_pet')
  const pet = player.weapons[0]
  expect(pet.acquiredAge).toBe(30)
  game.tick(0)
  expect(toView(game.state).players[0].petAge).toBe(0)
  expect(game.state.shots.some((shot) => shot.weapon === 'w_pet')).toBe(false)
  pet.cd = 0
  game.tick(0)
  expect(game.state.shots.some((shot) => shot.weapon === 'w_pet')).toBe(true)
  at(49)
  obtain('w_pet')
  expect(pet.lv).toBe(2)
  expect(pet.acquiredAge).toBe(30)
  expect(toView(game.state).players[0].petAge).toBe(19)
  game.addPlayer('b', 'p_over')
  player.choices = ['w:w_pet', 'r:w_pet:w_sports', 'x:skip']
  const seq = player.choiceSeq
  at(50)
  expect(player.weapons).toHaveLength(0)
  expect(game.state.shots.some((shot) => shot.weapon === 'w_pet')).toBe(false)
  expect(player.choices).toEqual(['w:w_pet', 'x:skip'])
  expect(player.choiceSeq).toBeGreaterThan(seq)
  expect(player.passives).toEqual([{ id: PET_MEMORY, lv: 1 }])
  expect(toView(game.state).players[0].petAge).toBeUndefined()
  expect(game.options(player)).toContain('w:w_pet')
  expect(game.options(player)).not.toContain(`p:${PET_MEMORY}`)
  obtain('w_pet')
  expect(player.weapons[0]).toMatchObject({ lv: 1, acquiredAge: 50, held: 0, damage: 0 })
  at(69)
  expect(player.weapons).toHaveLength(1)
  at(70)
  expect(player.weapons).toHaveLength(0)
  expect(player.passives).toEqual([{ id: PET_MEMORY, lv: 1 }])
  at(71)
  expect(player.passives).toEqual([{ id: PET_MEMORY, lv: 1 }])
})

test('bonus is outside normal slots, is never offered, and respects toxic-parent regeneration', () => {
  const { game, player, obtain, at } = setup()
  expect(game.options(player)).not.toContain(`p:${PET_MEMORY}`)
  player.passives = PASSIVES.filter((def) => def.id !== PET_MEMORY)
    .slice(0, PASSIVE_SLOTS)
    .map((def) => ({ id: def.id, lv: 1 }))
  const regen = playerStats(player).regen
  obtain('w_pet')
  at(50)
  expect(player.passives).toHaveLength(PASSIVE_SLOTS + 1)
  expect(playerStats(player).regen).toBeCloseTo(regen + 0.4 * player.talents.friend)
  player.passives = player.passives.filter((passive) => passive.id !== 'p_diligent')
  expect(game.options(player)).toContain('p:p_diligent')
  expect(game.options(player)).not.toContain(`p:${PET_MEMORY}`)
  player.parent = 'p_toxic'
  expect(playerStats(player).regen).toBe(0)
  game.state.phase = 'lost'
  const view = toView(game.state)
  expect(readView(view)).toBeDefined()
  const group = resultCategories(view.players[0]).find((group) => group.category === 'friend')!
  expect(group.weapons).toHaveLength(0)
  expect(group.passives).toContainEqual([PET_MEMORY, 1])
  expect(sheet('icons')[PET_MEMORY].frames[0].data.some(Boolean)).toBe(true)
})

test('pet death removes only its owner’s shots and synergy, including while downed', () => {
  const { game, player, obtain, at } = setup()
  obtain('w_pet')
  obtain('w_love')
  player.weapons[0].cd = 0
  game.state.time = timeAtAge(40) + 0.001
  const other = game.addPlayer('b', 'p_over')!
  other.weapons = [{ id: 'w_pet', lv: 1, held: 0, damage: 0, cd: 0, acquiredAge: 40 }]
  game.tick(0)
  expect(game.state.shots.filter((shot) => shot.weapon === 'w_pet')).toHaveLength(2)
  expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(1)
  player.downed = true
  at(50)
  expect(player.weapons.map((weapon) => weapon.id)).toEqual(['w_love'])
  expect(activeSynergies(player.weapons.map((weapon) => weapon.id))).toHaveLength(0)
  expect(game.state.shots.filter((shot) => shot.weapon === 'w_pet').every((shot) => shot.owner === other.id)).toBe(true)
  expect(other.weapons[0].acquiredAge).toBe(40)
  expect(other.passives).not.toContainEqual({ id: PET_MEMORY, lv: 1 })
})

test('a family choice preserves a skip when an expiring pet was the only saved exchange', () => {
  const { game, player, obtain, at } = setup()
  obtain('w_pet')
  game.addPlayer('b', 'p_over')
  const hands = (game as unknown as { familyHands: Map<string, string[]> }).familyHands
  hands.set(player.id, ['r:w_pet:w_sports'])
  player.choices = ['f:yes', 'f:no']
  at(50)
  expect(player.choices).toEqual(['f:yes', 'f:no'])
  game.choose(player, 1)
  expect(player.choices).toEqual(['x:skip'])
})

test('exchanging away a pet is not death, and a replacement pet starts at acquisition age', () => {
  const { game, player, obtain, at } = setup()
  obtain('w_pet')
  player.weapons[0].cd = 0
  game.tick(0)
  player.choices = ['r:w_pet:w_sports']
  game.choose(player, 0)
  expect(game.state.shots.some((shot) => shot.weapon === 'w_pet')).toBe(false)
  at(35)
  expect(player.passives).toHaveLength(0)
  player.choices = ['r:w_sports:w_pet']
  game.choose(player, 0)
  expect(player.weapons[0].acquiredAge).toBe(35)
  at(54)
  expect(player.weapons[0].id).toBe('w_pet')
  at(55)
  expect(player.passives).toContainEqual({ id: PET_MEMORY, lv: 1 })
})

test('pause does not age a pet and snapshots reject malformed pet ages', () => {
  const { game, player, obtain } = setup()
  obtain('w_pet')
  player.choices = ['w:w_pet']
  expect(game.paused).toBe(true)
  const time = game.state.time
  game.tick(200)
  expect(game.state.time).toBe(time)
  expect(ageAt(time)).toBe(30)
  const view = toView(game.state)
  expect(readView(view)).toBeDefined()
  expect(readView({ ...view, v: 8 })).toBeUndefined()
  for (const age of [-1, 21, NaN, Infinity, 'puppy']) {
    expect(readView({ ...view, players: [{ ...view.players[0], petAge: age }] })).toBeUndefined()
  }
  expect(readView({ ...view, players: [{ ...view.players[0], weapons: [], petAge: 1 }] })).toBeUndefined()
  expect(player.weapons[0].acquiredAge).toBe(30)
})
