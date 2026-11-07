import { expect, test } from 'vitest'
import { sheet } from '../src/art/index'
import { TALENT_CATEGORIES, WEAPON_BY_ID, WEAPON_INDEX, timeAtAge } from '../src/data'
import { Game, weaponStats } from '../src/game'
import { SHOT_GAMBLE, readView, toView } from '../src/view'

function garden(passives: string[] = []) {
  const game = new Game(31)
  const player = game.addPlayer('gardener', 'p_gone')!
  for (const category of TALENT_CATEGORIES) player.talents[category] = 1
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.fx = 1
  player.fy = 0
  player.weapons = [{ id: 'w_garden', lv: 1, cd: 0, held: 0, damage: 0 }]
  player.passives = passives.map((id) => ({ id, lv: 1 }))
  game['buildGrid']()
  game['fireWeapons'](0)
  return { game, player, weapon: player.weapons[0], shot: game.state.shots[0] }
}

test('gardening is normally offered from age six and can be equipped', () => {
  const game = new Game(41)
  const player = game.addPlayer('gardener', 'p_gone')!
  player.weapons = []
  game.state.time = timeAtAge(5) + 0.01
  expect(game.options(player)).not.toContain('w:w_garden')
  game.state.time = timeAtAge(6) + 0.01
  expect(game.options(player)).toContain('w:w_garden')
  player.choices = ['w:w_garden']
  game.choose(player, 0)
  expect(player.weapons.map((weapon) => weapon.id)).toContain('w_garden')
})

test('the absent-parent birth hand can offer gardening earlier', () => {
  const game = new Game(41)
  const player = game.addPlayer('gardener', 'p_gone')!
  Object.defineProperty(game, 'rng', { value: () => 0.9999, configurable: true })
  game['offer'](player)
  expect(player.choices).toContain('w:w_garden')
})

test('all five upgrades affect garden seeds or flowers', () => {
  const base = garden()
  const curious = garden(['p_curious'])
  const kind = garden(['p_kind'])
  const clever = garden(['p_clever'])
  const diligent = garden(['p_diligent'])
  expect(Math.hypot(curious.shot.vx, curious.shot.vy)).toBeCloseTo(Math.hypot(base.shot.vx, base.shot.vy) * 1.1)
  expect(kind.shot.r).toBeCloseTo(base.shot.r * 1.08)
  expect(clever.game.state.shots).toHaveLength(2)
  expect(diligent.weapon.cd).toBeCloseTo(base.weapon.cd * 0.93)

  for (const arena of [base, curious, kind]) arena.game['moveShots'](0.8)
  expect(base.shot.v).toBe(1)
  expect(base.shot.x - base.player.x).toBeCloseTo(320 * 0.8)
  expect(curious.shot.x - curious.player.x).toBeGreaterThan(base.shot.x - base.player.x)
  expect(curious.shot.life).toBeCloseTo(base.shot.life * 1.1)
  expect(kind.shot.r).toBeCloseTo(base.shot.r * 1.08)
})

test('a seed plants on impact, then damages repeatedly and expires', () => {
  const { game, player, shot } = garden()
  const enemy = game.spawnEnemy('germ', player.x + 50, player.y)!
  enemy.hp = enemy.maxHp = 10000
  game['buildGrid']()
  game['moveShots'](0.1)
  expect(shot.v).toBe(1)
  expect(shot.x - player.x).toBeLessThan(320 * 0.8)
  expect(shot.life).toBeCloseTo(WEAPON_BY_ID.get('w_garden')!.duration)
  expect(enemy.hp).toBeLessThan(enemy.maxHp)
  const afterImpact = enemy.hp
  game.state.time = 0.49
  game['moveShots'](0.49)
  expect(enemy.hp).toBe(afterImpact)
  game.state.time = 0.51
  game['moveShots'](0.02)
  expect(enemy.hp).toBeLessThan(afterImpact)
  game['moveShots'](shot.maxLife)
  expect(game.state.shots).not.toContain(shot)
})

test('longer flower duration can produce an additional hit', () => {
  const hits = (passives: string[]) => {
    const { game, player } = garden(passives)
    const enemy = game.spawnEnemy('germ', player.x + 50, player.y)!
    enemy.hp = enemy.maxHp = 10000
    game['buildGrid']()
    game['moveShots'](0.1)
    for (let step = 1; step <= 7; step++) {
      game.state.time = step * 0.5
      game['moveShots'](0.5)
    }
    return game.state.popups.length
  }
  expect(hits(['p_curious'])).toBeGreaterThan(hits([]))
})

test('evolution and gambling preserve garden ownership, stages and snapshots', () => {
  const { game, player } = garden(['p_curious'])
  const weapon = player.weapons[0]
  weapon.lv = 8
  game.state.shots = []
  game['fire'](player, weapon, weaponStats(player, weapon))
  expect(game.state.shots).toHaveLength(weaponStats(player, weapon).amount)
  expect(game.state.shots[0].maxLife).toBeCloseTo(3.2 * 1.3 * 1.1)
  expect(sheet('icons').w_garden.frames[0].data.some(Boolean)).toBe(true)
  expect(sheet('weapon:w_garden').bloom.frames[0].data.some(Boolean)).toBe(true)

  player.weapons = [{ id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_garden', gambleUntil: 12 }]
  const gamble = player.weapons[0]
  game.state.shots = []
  game['fire'](player, gamble, weaponStats(player, gamble))
  const seedView = toView(game.state)
  expect(readView(JSON.parse(JSON.stringify(seedView)))).toBeDefined()
  expect(seedView.shots[0]).toBe(WEAPON_INDEX.get('w_garden'))
  expect(seedView.shots[7]).toBe(SHOT_GAMBLE)
  game['moveShots'](0.8)
  const flowerView = toView(game.state)
  expect(readView(JSON.parse(JSON.stringify(flowerView)))).toBeDefined()
  expect(flowerView.shots[7]).toBe(SHOT_GAMBLE + 1)
  expect(game.state.shots[0].sourceWeapon).toBe('w_gamble')
})
