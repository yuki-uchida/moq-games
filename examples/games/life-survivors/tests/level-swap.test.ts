import { describe, expect, test } from 'vitest'
import { EVENTS, MAX_WEAPON_LEVEL, TALENT_WEAPONS, timeAtAge, WEAPON_BY_ID } from '../src/data'
import { choiceText, Game, weaponSlots, xpForLevel } from '../src/game'

const setup = (age: number, parent = 'p_edu') => {
  const game = new Game(2)
  const player = game.addPlayer('first', parent)!
  game.state.time = timeAtAge(age) + 0.01
  game.state.eventIndex = EVENTS.findIndex((event) => event.at > game.state.time)
  player.weapons.push(
    ...TALENT_WEAPONS.filter((def) => def.minAge <= 6 || def.id === 'w_hobby')
      .slice(0, weaponSlots(player))
      .map(({ id }) => ({ id, lv: MAX_WEAPON_LEVEL, cd: 100, held: 0, damage: 0 }))
  )
  player.weapons[0].lv = MAX_WEAPON_LEVEL
  game.state.level = 4
  return { game, player }
}

const finishGrowth = (game: Game, player: ReturnType<typeof setup>['player']) => {
  game.tick(0.01)
  expect(player.choices.length).toBeGreaterThan(0)
  expect(player.choices.every((choice) => /^[wp]:/.test(choice))).toBe(true)
  game.choose(player, 0)
  game.tick(0.01)
  expect(player.choices[0]).toMatch(/^s:/)
}

test('exchange candidates describe each weapon without changing replacement and cancellation text', () => {
  const { player } = setup(30)
  for (const weapon of TALENT_WEAPONS) {
    expect(choiceText(player, `s:${weapon.id}`)).toEqual({
      icon: weapon.icon,
      name: weapon.name,
      text: expect.stringContaining(weapon.desc),
      tag: 'NEW'
    })
  }
  expect(choiceText(player, 'r:w_friend:w_invest').text).toContain('この武器と入れ替える')
  expect(choiceText(player, 'x:skip').text).toBe('今の武器をそのまま使う')
})

describe('full talent slots with ordinary growth remaining', () => {
  test.each([11, 12, 15, 16, 22])('offers normal growth then age-limited cancellable swaps at age %i', (age) => {
    const { game, player } = setup(age)
    expect(game.options(player).length).toBeGreaterThan(0)
    const weapons = player.weapons.map(({ id, lv }) => ({ id, lv }))
    game.gainXp(game.state.xpNext)
    expect([player.pending, player.swapPending]).toEqual([1, 1])
    finishGrowth(game, player)
    for (const choice of player.choices.filter((choice) => choice.startsWith('s:'))) {
      const def = WEAPON_BY_ID.get(choice.split(':')[1])!
      expect(def.minAge).toBeLessThanOrEqual(age)
      expect(def.id).not.toBe('w_ring')
    }
    game.choose(player, player.choices.indexOf('x:skip'))
    game.tick(0.01)
    expect(player.choices).toEqual([])
    expect(player.weapons.map(({ id, lv }) => ({ id, lv }))).toEqual(weapons)
    expect([player.pending, player.swapPending]).toEqual([0, 0])
  })

  test.each([
    [12, 'w_love'],
    [16, 'w_work']
  ] as const)('can acquire %s-year unlock %s after ordinary growth', (age, target) => {
    let acquired = false
    for (let seed = 1; seed <= 200 && !acquired; seed++) {
      const { game, player } = setup(age)
      for (let roll = 0; roll < seed; roll++) game.random()
      game.gainXp(game.state.xpNext)
      finishGrowth(game, player)
      const targetIndex = player.choices.indexOf(`s:${target}`)
      if (targetIndex < 0) continue
      const before = structuredClone(player.weapons)
      game.choose(player, targetIndex)
      expect(player.choices).not.toContain(`r:p_edu:${target}`)
      game.choose(player, player.choices.indexOf('x:skip'))
      expect(player.weapons).toEqual(before)
      expect(player.swapPending).toBe(0)
      game.state.level = 9
      game.gainXp(game.state.xpNext)
      finishGrowth(game, player)
      const nextTargetIndex = player.choices.indexOf(`s:${target}`)
      if (nextTargetIndex < 0) continue
      game.choose(player, nextTargetIndex)
      game.choose(player, 0)
      expect(player.weapons.find((weapon) => weapon.id === target)?.lv).toBe(1)
      expect(player.weapons).toHaveLength(before.length)
      acquired = true
    }
    expect(acquired).toBe(true)
  })

  test.each(['p_edu', 'p_free'])('does not add exchanges below the %s slot limit or off fifth levels', (parent) => {
    const { game, player } = setup(16, parent)
    const weapon = player.weapons.pop()!
    game.gainXp(game.state.xpNext)
    expect([player.pending, player.swapPending]).toEqual([1, 0])
    player.weapons.push(weapon)
    game.gainXp(game.state.xpNext)
    expect([player.pending, player.swapPending]).toEqual([2, 0])
  })

  test('queues each fifth level per alive full player without taking ordinary or career rewards', () => {
    const { game, player } = setup(16, 'p_free')
    const other = game.addPlayer('other', 'p_edu')!
    const downed = game.addPlayer('downed', 'p_edu')!
    downed.downed = true
    player.careerPending = 1
    game.gainXp(
      game.state.xpNext +
        Array.from({ length: 5 }, (_, offset) => Math.round(xpForLevel(5 + offset) * 2)).reduce(
          (sum, value) => sum + value,
          0
        )
    )
    expect(game.state.level).toBe(10)
    expect([player.pending, player.swapPending, player.careerPending]).toEqual([6, 2, 1])
    expect([other.pending, other.swapPending]).toEqual([6, 0])
    expect([downed.pending, downed.swapPending]).toEqual([0, 0])
    for (let growth = 0; growth < 6; growth++) {
      game.tick(0.01)
      expect(player.choices[0]).toMatch(/^[wp]:/)
      game.choose(player, 0)
    }
    for (let swap = 0; swap < 2; swap++) {
      game.tick(0.01)
      expect(player.choices[0]).toMatch(/^s:/)
      game.choose(player, player.choices.indexOf('x:skip'))
    }
    expect(player.careerPending).toBe(1)
    game.tick(0.01)
    expect(player.choices[0]).toMatch(/^[wp]:/)
    expect(player.careerPending).toBe(0)
  })
})
