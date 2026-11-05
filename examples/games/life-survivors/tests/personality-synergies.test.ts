import { expect, test } from 'vitest'
import { bodyScale } from '../src/body-size'
import { PASSIVES, TALENT_CATEGORIES } from '../src/data'
import { Game, choiceText, playerRadius, playerStats, weaponStats } from '../src/game'
import { activePersonalitySynergies } from '../src/synergies'
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
  ['w_sports', 'p_clever', 'cooldown', 0.9],
  ['w_karaoke', 'p_clever', 'cooldown', 0.9],
  ['w_muscle', 'p_large', 'area', 1.1],
  ['w_perfume', 'p_small', 'duration', 1.2],
  ['w_friend', 'p_kind', 'area', 1.16],
  ['w_reading', 'p_curious', 'duration', 1.2],
  ['w_savings', 'p_greedy', 'area', 1.2]
] as const)('%s and %s apply and remove their bonus with the weapon', (id, passive, property, multiplier) => {
  const { player, weapon } = setup(id)
  player.passives = [{ id: passive, lv: 2 }]
  const boosted = weaponStats(player, weapon)
  player.weapons = []
  const base = weaponStats(player, weapon)
  expect(boosted[property]).toBeCloseTo(base[property] * multiplier)
  expect(activePersonalitySynergies([], [[passive, 2]], player.maxHp)).toHaveLength(0)
})

test('health adds overtime shots, cooking gains pellets, and the status reports the same effects', () => {
  const { game, player, weapon } = setup('w_overtime')
  player.passives = [{ id: 'p_large', lv: 3 }]
  const boosted = weaponStats(player, weapon)
  player.weapons = []
  const base = weaponStats(player, weapon)
  expect(boosted.amount).toBe(base.amount + 2)
  player.weapons = [weapon]
  game['fire'](player, weapon, boosted)
  expect(game.state.shots).toHaveLength(boosted.amount * 3)
  player.weapons = [{ id: 'w_cooking', lv: 1, cd: 0, held: 0, damage: 0 }]
  player.passives = [{ id: 'p_healthy', lv: 4 }]
  const cooking = weaponStats(player, player.weapons[0])
  expect(cooking.amount).toBe(3)
  game.state.shots = []
  game['fire'](player, player.weapons[0], cooking)
  expect(game.state.shots).toHaveLength(5)
  const view = readView(JSON.parse(JSON.stringify(toView(game.state))))!
  expect(statusModel(view.players[0], 20).personalitySynergies[0].text).toContain('攻撃数 +2')
  expect(statusModel(view.players[0], 20).weapons[0].detail).toContain('発動中：健康志向 × 料理')
  expect(choiceText(player, 'p:p_healthy').text).toContain('発動中：健康志向 × 料理')
  expect(choiceText(player, 's:w_sports').text).toContain('器用 × スポーツ')
  expect(view.players[0].talents).toBeUndefined()
})

test('luck raises low dice damage without changing a six', () => {
  const { game, player, weapon } = setup('w_gamble')
  Object.defineProperty(game, 'rng', { value: () => 0, configurable: true })
  game['fire'](player, weapon, weaponStats(player, weapon))
  const base = game.state.shots[0]
  expect(base.v).toBe(1)
  expect(base.damage / weaponStats(player, weapon).damage).toBeCloseTo(0.3)
  game.state.shots = []
  player.passives = [{ id: 'p_lucky', lv: 5 }]
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(game.state.shots[0].damage / weaponStats(player, weapon).damage).toBeCloseTo(0.8)
  Object.defineProperty(game, 'rng', { value: () => 0.9999, configurable: true })
  game.state.shots = []
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(game.state.shots[0].v).toBe(6)
  expect(game.state.shots[0].damage / weaponStats(player, weapon).damage).toBeCloseTo(5)
  expect(game.state.shots[0].crit).toBe(true)
})
