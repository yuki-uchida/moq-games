import { expect, test } from 'vitest'
import { PASSIVES, TALENT_CATEGORIES, WEAPONS } from '../src/data'
import { Game, GIFTED, POOR, isEvolved, passiveLevel, playerStats, weaponStats, type Player } from '../src/game'
import { readView, toView } from '../src/view'

test('six categories classify every weapon and passive in ring order', () => {
  expect(TALENT_CATEGORIES).toEqual(['friend', 'love', 'sports', 'hobby', 'study', 'invest'])
  for (const def of [...WEAPONS, ...PASSIVES]) expect(TALENT_CATEGORIES).toContain(def.category)
})

test('seeded lives are diverse, bounded and more similar to neighbors than opposites', () => {
  let adjacent = 0
  let opposite = 0
  const lives = new Set<string>()
  for (let seed = 1; seed <= 2000; seed++) {
    const game = new Game(seed)
    const first = game.addPlayer('a', 'p_gone')!
    const second = game.addPlayer('b', 'p_gone')!
    const replay = new Game(seed)
    expect(replay.addPlayer('a', 'p_gone')!.talents).toEqual(first.talents)
    expect(replay.addPlayer('b', 'p_gone')!.talents).toEqual(second.talents)
    expect(second.talents).not.toEqual(first.talents)
    const values = TALENT_CATEGORIES.map((category) => first.talents[category])
    lives.add(JSON.stringify(values))
    for (let index = 0; index < 6; index++) {
      expect(values[index]).toBeGreaterThanOrEqual(POOR)
      expect(values[index]).toBeLessThanOrEqual(GIFTED)
      adjacent += (values[index] - values[(index + 1) % 6]) ** 2
      opposite += (values[index] - values[(index + 3) % 6]) ** 2
    }
  }
  expect(lives.size).toBe(2000)
  expect(adjacent / opposite).toBeLessThan(0.45)
})

test('every passive responds to talent without changing integer levels or evolution', () => {
  const effect: Record<string, (player: Player) => number> = {
    p_diligent: (player) => playerStats(player).cooldown,
    p_stubborn: (player) => playerStats(player).armor,
    p_hot: (player) => playerStats(player).might,
    p_kind: (player) => playerStats(player).area,
    p_greedy: (player) => playerStats(player).xpGain,
    p_bold: (player) => playerStats(player).maxHp,
    p_optimist: (player) => playerStats(player).regen,
    p_healthy: (player) => playerStats(player).speed,
    p_lucky: (player) => playerStats(player).crit,
    p_clever: (player) => playerStats(player).might,
    p_curious: (player) => playerStats(player).shotSpeed,
    p_savvy: (player) => playerStats(player).strong
  }
  for (const def of PASSIVES) {
    const player = new Game(1).addPlayer('a', 'p_gone')!
    player.passives = [{ id: def.id, lv: 4 }]
    player.weapons = [{ id: 'w_friend', lv: 8, cd: 0, held: 0, damage: 0 }]
    player.talents[def.category] = POOR
    const low = effect[def.id](player)
    const evolved = isEvolved(player, player.weapons[0])
    player.talents[def.category] = GIFTED
    expect(effect[def.id](player), def.id).not.toBe(low)
    expect(passiveLevel(player, def.id)).toBe(4)
    expect(isEvolved(player, player.weapons[0])).toBe(evolved)
    expect(Number.isInteger(playerStats(player).amount)).toBe(true)
  }
})

test('every weapon uses its category and extreme passive builds stay finite', () => {
  const player = new Game(3).addPlayer('a', 'p_gone')!
  player.passives = PASSIVES.map((def) => ({ id: def.id, lv: 5 }))
  for (const def of WEAPONS) {
    const weapon = { id: def.id, lv: 8, cd: 0, held: 0, damage: 0 }
    player.talents[def.category] = POOR
    const low = weaponStats(player, weapon).damage
    player.talents[def.category] = GIFTED
    const high = weaponStats(player, weapon).damage
    if (def.damage) expect(high).toBeGreaterThan(low)
    else expect(high).toBe(0)
  }
  for (const value of [POOR, GIFTED]) {
    for (const category of TALENT_CATEGORIES) player.talents[category] = value
    const stats = playerStats(player)
    expect(Object.values(stats).every(Number.isFinite)).toBe(true)
    expect(stats.cooldown).toBeGreaterThan(0)
    expect(stats.crit).toBeLessThan(1)
    for (const level of [1, 3, 4, 5]) {
      player.passives.find((passive) => passive.id === 'p_clever')!.lv = level
      expect(playerStats(player).amount).toBe(level >= 4 ? 2 : 1)
    }
  }
})

test('serialized public views hide all live talents and reveal all six only at the end', () => {
  const game = new Game(2)
  game.addPlayer('a')
  game.addPlayer('b')
  for (const phase of ['playing', 'reaper', 'won', 'lost'] as const) {
    game.state.phase = phase
    const view = JSON.parse(JSON.stringify(toView(game.state)))
    expect(readView(view)).toBeDefined()
    for (const player of view.players) {
      if (phase === 'won' || phase === 'lost') expect(Object.keys(player.talents)).toEqual(TALENT_CATEGORIES)
      else expect(player).not.toHaveProperty('talents')
    }
    if (phase === 'playing' || phase === 'reaper') {
      view.players[0].talents = game.state.players[0].talents
      expect(readView(view)).toBeUndefined()
    }
  }
})
