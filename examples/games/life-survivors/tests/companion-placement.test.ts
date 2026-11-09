import { expect, test } from 'vitest'
import { EVENTS, timeAtAge } from '../src/data'
import { Game, weaponStats } from '../src/game'

/** The fan straight above the owner (up ± 35°), where a companion would sit on their head, hat or name tag. */
const overHead = (dx: number, dy: number) => dy < 0 && Math.abs(Math.atan2(dx, -dy)) < (35 * Math.PI) / 180

test('idle pets rest beside and below their owner, never in the fan above the head', () => {
  const game = new Game(3)
  game.targetPopulation = () => 0
  const player = game.addPlayer('a', 'p_gone')!
  player.birthPick = false
  player.pending = 0
  player.choices = []
  player.weapons = [{ id: 'w_pet', lv: 1, cd: 0, held: 0, damage: 0 }]
  const weapon = player.weapons[0]
  for (let i = 0; i < 9; i++) game['fire'](player, weapon, { ...weaponStats(player, weapon), amount: 1 })
  const pets = game.state.shots.filter((shot) => shot.weapon === 'w_pet')
  pets.forEach((pet, i) => (pet.orbit = i * 2.4))
  expect(pets).toHaveLength(9)
  for (let frame = 0; frame < 600; frame++) for (const pet of pets) game['movePet'](pet, player, 1 / 60)
  for (const pet of pets) {
    expect(pet.target).toBeUndefined()
    // Pets settle within a few pixels of their 34 px resting spot.
    expect(Math.abs(Math.hypot(pet.x - player.x, pet.y - player.y) - 34)).toBeLessThan(5)
    expect(overHead(pet.x - player.x, pet.y - player.y)).toBe(false)
  }
})

test('a lone 過保護親 walking up steps aside instead of standing on the child; other directions are unchanged', () => {
  const game = new Game(71)
  game.targetPopulation = () => 0
  const player = game.addPlayer('a', 'p_over')!
  player.weapons[0].lv = 1
  player.weapons[0].cd = 0
  game.tick(1 / 60)
  const guard = game.state.shots.find((shot) => shot.owner === player.id && shot.weapon === 'p_over')!
  expect(guard.h).toBe(0)
  for (const [x, y] of [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0]
  ]) {
    game.setInput(player.id, { x, y })
    for (let frame = 0; frame < 60; frame++) game.tick(1 / 60)
    expect(guard.guardianStill).toBe(0)
    if (y < 0) {
      expect(Math.abs(guard.x - player.x)).toBeGreaterThanOrEqual(12)
      expect(guard.y).toBeLessThan(player.y)
    } else {
      expect(guard.x - player.x).toBeCloseTo(x * guard.orbit * 0.65, 1)
      expect(guard.y - player.y).toBeCloseTo(y * guard.orbit * 0.65, 1)
    }
  }
})

test('生き物観察 facing up summons its creature above the name tag; other directions stay 50 px out', () => {
  for (const [fx, fy] of [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0]
  ]) {
    const game = new Game(42)
    const player = game.addPlayer('a', 'p_gone')!
    game.targetPopulation = () => 0
    game.state.time = timeAtAge(3) + 0.01
    game.state.eventIndex = EVENTS.length
    player.choices = []
    player.pending = 0
    player.birthPick = false
    player.weapons = [{ id: 'w_observe', lv: 1, cd: 0, held: 0, damage: 0 }]
    const weapon = player.weapons[0]
    player.fx = fx
    player.fy = fy
    player.still = 2
    game['fire'](player, weapon, weaponStats(player, weapon))
    const [creature] = game.state.shots
    if (fy < 0) {
      expect(player.y - creature.y).toBeGreaterThanOrEqual(76)
      expect(creature.x).toBeCloseTo(player.x)
    } else expect(Math.hypot(creature.x - player.x, creature.y - player.y)).toBeCloseTo(50)
  }
})
