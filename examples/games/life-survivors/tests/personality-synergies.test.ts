import { expect, test } from 'vitest'
import { bodyScale } from '../src/body-size'
import { PASSIVES, TALENT_CATEGORIES } from '../src/data'
import { Game, choiceText, playerRadius, playerStats, weaponStats } from '../src/game'
import { statusModel } from '../src/status'
import { readView, toView } from '../src/view'

function setup(weapon = 'w_sports') {
  const game = new Game(123)
  const player = game.addPlayer('player', 'p_gone')!
  for (const category of TALENT_CATEGORIES) player.talents[category] = 1
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = [{ id: weapon, lv: 1, cd: 0, held: 0, damage: 0 }]
  return { game, player, weapon: player.weapons[0] }
}

test('adding personalities preserves the initial total personality draw weight', () => {
  const { game, player } = setup()
  const total = PASSIVES.filter((passive) => passive.id !== 'p_petmemory').reduce(
    (sum, passive) => sum + game['cardWeight'](player, `p:${passive.id}`),
    0
  )
  expect(total).toBeCloseTo(12)
  expect(game['cardWeight'](player, 'w:w_study')).toBe(1)
})

test('six new personalities change their documented stats and preserve the size limits', () => {
  const { player } = setup()
  const base = playerStats(player)
  player.passives = [{ id: 'p_grand', lv: 2 }]
  expect(playerStats(player).amount).toBe(2)
  expect(playerStats(player).cooldown).toBeCloseTo(base.cooldown + 0.2)
  player.passives = [{ id: 'p_large', lv: 2 }]
  expect(playerStats(player).maxHp).toBe(base.maxHp + 30)
  expect(playerRadius(player)).toBeCloseTo(14 * 1.1)
  player.passives = [{ id: 'p_small', lv: 2 }]
  expect(playerStats(player).maxHp).toBe(base.maxHp - 20)
  expect(playerStats(player).speed).toBeCloseTo(base.speed * 1.06)
  expect(playerRadius(player)).toBeCloseTo(14 * 0.9)
  expect(bodyScale(5, 0)).toBe(1.25)
  expect(bodyScale(0, 5)).toBe(0.75)
  expect(bodyScale(5, 5)).toBe(1)
  player.passives = [{ id: 'p_hasty', lv: 2 }]
  expect(playerStats(player).cooldown).toBeCloseTo(0.9)
  expect(playerStats(player).duration).toBeCloseTo(0.9)
  player.passives = [{ id: 'p_cautious', lv: 2 }]
  expect(playerStats(player).shotSpeed).toBeCloseTo(0.9)
  expect(playerStats(player).area).toBeCloseTo(1.1)
  player.passives = [{ id: 'p_competitive', lv: 2 }]
  expect(playerStats(player).might).toBe(base.might)
  player.hp = player.maxHp / 2
  expect(playerStats(player).might).toBeCloseTo(base.might * 1.2)
})

test('size changes enemy projectile collision, and reducing maximum HP clamps current HP', () => {
  for (const [id, distance, hit] of [
    ['p_large', 16, true],
    ['p_small', 12, false]
  ] as const) {
    const { game, player } = setup()
    player.passives = [{ id, lv: 5 }]
    const before = player.hp
    game.state.bullets.push({
      x: player.x + distance,
      y: player.y,
      vx: 0,
      vy: 0,
      r: 3,
      damage: 10,
      life: 1,
      kind: 0,
      src: 'bully'
    })
    game['moveBullets'](0)
    expect(player.hp < before).toBe(hit)
  }
  const { game, player } = setup()
  player.choices = ['p:p_small']
  game.choose(player, 0)
  expect(player.maxHp).toBe(150)
  expect(player.hp).toBe(150)
})

test.each([
  ['w_sports', 'p_clever'],
  ['w_karaoke', 'p_clever'],
  ['w_muscle', 'p_large'],
  ['w_perfume', 'p_small'],
  ['w_friend', 'p_kind'],
  ['w_reading', 'p_curious'],
  ['w_savings', 'p_greedy'],
  ['w_invest', 'p_greedy'],
  ['w_cooking', 'p_healthy'],
  ['w_overtime', 'p_large']
])('%s and %s have no weapon-specific bonus', (id, passive) => {
  const { player, weapon } = setup(id)
  const stats = playerStats(player)
  const base = weaponStats(player, weapon, stats)
  for (const lv of [1, 4, 5]) {
    player.passives = [{ id: passive, lv }]
    expect(weaponStats(player, weapon, stats)).toEqual(base)
  }
})

test('high maximum health does not add overtime shots and cards show no synergy hints', () => {
  const { game, player, weapon } = setup('w_overtime')
  const base = weaponStats(player, weapon)
  player.passives = [{ id: 'p_large', lv: 5 }]
  expect(weaponStats(player, weapon).amount).toBe(base.amount)
  const view = readView(JSON.parse(JSON.stringify(toView(game.state))))!
  const model = statusModel(view.players[0], 20)
  expect(model).not.toHaveProperty('personalitySynergies')
  for (const id of ['p:p_healthy', 'p:p_clever', 'p:p_greedy', 'w:w_overtime', 's:w_sports']) {
    expect(choiceText(player, id).text).not.toMatch(/発動中|連携条件|投資 \+15%/)
  }
  expect(view.players[0].talents).toBeUndefined()
})

test('luck does not bias which weapon gambling activates', () => {
  const { game, player, weapon } = setup('w_gamble')
  for (const [roll, expected] of [
    [0, 'p_toxic'],
    [0.9999, 'w_cooking']
  ] as const) {
    Object.defineProperty(game, 'rng', { value: () => roll, configurable: true })
    for (const lv of [0, 1, 5]) {
      game.state.shots = []
      player.passives = lv ? [{ id: 'p_lucky', lv }] : []
      game['fire'](player, weapon, weaponStats(player, weapon))
      expect(game.state.shots[0].weapon).toBe(expected)
      expect(game.state.shots[0].sourceWeapon).toBe('w_gamble')
    }
  }
})
