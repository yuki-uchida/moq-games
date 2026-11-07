import { expect, test } from 'vitest'
import { COOKING_ITEMS, EVENTS, ITEM_KINDS } from '../src/data'
import { Game, choiceText, playerStats, weaponStats } from '../src/game'
import { readView, toView } from '../src/view'

function setup() {
  const game = new Game(42)
  const player = game.addPlayer('cook', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.weapons = [{ id: 'w_cooking', lv: 1, cd: 0, held: 0, damage: 0 }]
  game.targetPopulation = () => 0
  game.state.eventIndex = EVENTS.length
  return { game, player, weapon: player.weapons[0] }
}

test('cooking places one item every 60 seconds, without projectiles or cooldown modifiers', () => {
  const { game, player, weapon } = setup()
  weapon.lv = 8
  player.passives = [
    { id: 'p_healthy', lv: 1 },
    { id: 'p_diligent', lv: 5 },
    { id: 'p_grand', lv: 5 }
  ]
  expect(weaponStats(player, weapon).cooldown).toBe(60)
  for (let tick = 0; tick < 3599; tick++) game.tick(1 / 60)
  expect(game.state.items).toHaveLength(0)
  game.tick(1 / 60)
  expect(game.state.items).toHaveLength(1)
  expect(game.state.items[0]).toMatchObject({ owner: player.id, power: 2 })
  expect(game.state.shots).toHaveLength(0)
  for (let tick = 0; tick < 3599; tick++) game.tick(1 / 60)
  expect(game.state.items).toHaveLength(1)
  game.tick(1 / 60)
  expect(game.state.items).toHaveLength(2)
  expect(choiceText(player, 'w:w_cooking').text).toContain('料理の効果 +10%')
})

test.each(COOKING_ITEMS)('%s affects only its owner when picked up', (kind) => {
  const { game, player } = setup()
  const other = game.addPlayer('other', 'p_gone')!
  other.birthPick = false
  other.pending = 0
  player.hp = 50
  const original = playerStats(player)
  const otherOriginal = playerStats(other)
  Object.defineProperty(game, 'rng', { value: () => (COOKING_ITEMS.indexOf(kind) + 0.5) / COOKING_ITEMS.length })
  game['fireWeapons'](60)
  const item = game.state.items[0]
  expect(item.kind).toBe(kind)
  other.x = item.x
  other.y = item.y
  game['collectGems'](0)
  expect(game.state.items).toHaveLength(1)
  player.x = item.x
  player.y = item.y
  game['collectGems'](0)
  expect(game.state.items).toHaveLength(0)
  expect(playerStats(other)).toEqual(otherOriginal)
  const stats = playerStats(player)
  if (kind === 'food_damage') expect(stats.might).toBeCloseTo(original.might * 1.25)
  if (kind === 'food_defense') expect(stats.armor).toBeCloseTo(original.armor + 2)
  if (kind === 'food_speed') expect(stats.speed).toBeCloseTo(original.speed * 1.2)
  if (kind === 'food_heal') expect(player.hp).toBe(90)
  else {
    game['movePlayers'](59.99)
    expect(playerStats(player)).toEqual(stats)
    game['movePlayers'](0.02)
    expect(playerStats(player)).toEqual(original)
  }
})

test('damage, movement and healing use the cooking effects and respect maximum HP', () => {
  const { game, player } = setup()
  const attack = { id: 'w_love', lv: 1, cd: 0, held: 0, damage: 0 }
  const damage = weaponStats(player, attack).damage
  const speed = playerStats(player).speed
  for (const kind of ['food_damage', 'food_speed', 'food_heal'] as const)
    game.state.items.push({ kind, owner: player.id, power: 1, x: player.x, y: player.y })
  player.hp = player.maxHp - 5
  game['collectGems'](0)
  expect(player.hp).toBe(player.maxHp)
  expect(weaponStats(player, attack).damage).toBeCloseTo(damage * 1.25)
  game.setInput(player.id, { x: 1, y: 0, pick: -1, pickSeq: -1 })
  game['movePlayers'](1)
  expect(player.x).toBeCloseTo(speed * 1.2)
})

test('defense reduces incoming damage and expires after exactly 60 seconds of play', () => {
  const { game, player } = setup()
  game.state.items.push({ kind: 'food_defense', owner: player.id, power: 1, x: player.x, y: player.y })
  game['collectGems'](0)
  game.state.bullets.push({
    x: player.x,
    y: player.y,
    vx: 0,
    vy: 0,
    r: 7,
    damage: 10,
    life: 1,
    kind: 0,
    src: 'germ'
  })
  game['moveBullets'](0)
  expect(player.hp).toBe(player.maxHp - 8)
  for (let tick = 0; tick < 3599; tick++) game['movePlayers'](1 / 60)
  expect(playerStats(player).armor).toBe(2)
  game['movePlayers'](1 / 60)
  expect(playerStats(player).armor).toBe(0)
  expect(player.cookingBuffs).toBeUndefined()
})

test('cooking ownership survives snapshots and disappears with its owner', () => {
  const { game, player } = setup()
  const other = game.addPlayer('other', 'p_gone')!
  game.state.items.push({ kind: 'food_damage', owner: player.id, power: 1, x: 20, y: 30 })
  const view = toView(game.state)
  expect(view.items).toEqual([ITEM_KINDS.indexOf('food_damage'), 20, 30, 0])
  expect(readView(JSON.parse(JSON.stringify(view)))).toBeDefined()
  expect(readView({ ...view, items: [view.items[0], 20, 30, -1] })).toBeUndefined()
  expect(readView({ ...view, items: [view.items[0], 20, 30, 2] })).toBeUndefined()
  expect(readView({ ...view, items: [ITEM_KINDS.indexOf('meal'), 20, 30, 0] })).toBeUndefined()
  game.removePlayer(player.id)
  expect(game.state.players).toContain(other)
  expect(game.state.items).toHaveLength(0)
})

test('active cooking effects survive snapshots independently and disappear when their time expires', () => {
  const { game, player } = setup()
  expect(toView(game.state).players[0].cookingBuffs).toBeUndefined()
  player.weapons.push(
    { id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0, gambleWeapon: 'w_love' },
    { id: 'w_love', lv: 1, cd: 0, held: 0, damage: 0 }
  )
  player.cookingBuffs = {
    food_damage: { time: 59.1, power: 1.4 },
    food_speed: { time: 0.01, power: 2 }
  }
  const view = toView(game.state)
  expect(view.players[0].cookingBuffs).toEqual({
    food_damage: { time: 60, power: 1.4 },
    food_speed: { time: 1, power: 2 }
  })
  expect(readView(JSON.parse(JSON.stringify(view)))?.players[0].cookingBuffs).toEqual(view.players[0].cookingBuffs)
  expect(readView(JSON.parse(JSON.stringify(view)))?.players[0].gambleWeapon).toBe('w_love')
  game['movePlayers'](0.02)
  expect(view.players[0].cookingBuffs?.food_speed?.time).toBe(1)
  expect(toView(game.state).players[0].cookingBuffs).toEqual({ food_damage: { time: 60, power: 1.4 } })
  game['movePlayers'](60)
  expect(toView(game.state).players[0].cookingBuffs).toBeUndefined()
})

test('snapshots reject malformed or unknown cooking effects', () => {
  const { game } = setup()
  const view = toView(game.state)
  const withBuffs = (cookingBuffs: unknown) => ({
    ...view,
    players: [{ ...view.players[0], cookingBuffs }]
  })
  for (const bad of [
    null,
    {},
    [],
    { food_heal: { time: 1, power: 1 } },
    { food_damage: { time: 0, power: 1 } },
    { food_damage: { time: 61, power: 1 } },
    { food_damage: { time: 1.5, power: 1 } },
    { food_damage: { time: 1, power: -1 } },
    { food_damage: { time: 1, power: 1, extra: true } }
  ])
    expect(readView(withBuffs(bad))).toBeUndefined()
  expect(readView({ ...view, v: 14 })).toBeUndefined()
})

test('gambling does not copy non-attacking cooking', () => {
  const { game, player } = setup()
  const gamble = { id: 'w_gamble', lv: 1, cd: 0, held: 0, damage: 0 }
  player.weapons.push(gamble)
  game['fire'](player, gamble, weaponStats(player, gamble))
  expect(gamble).toHaveProperty('gambleWeapon', undefined)
  expect(game.state.items).toHaveLength(0)
  expect(game.state.shots).toHaveLength(0)
})
