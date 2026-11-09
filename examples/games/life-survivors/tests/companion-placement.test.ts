import { expect, test } from 'vitest'
import { EVENTS, timeAtAge } from '../src/data'
import { Game, petRestRadius, weaponStats } from '../src/game'

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
    // Pets settle within a few pixels of their resting spot: 34 px out, or 56 px on the outer ring a pet takes while
    // an earlier one of its number is still out.
    expect(Math.abs(Math.hypot(pet.x - player.x, pet.y - player.y) - petRestRadius(pet.petRing))).toBeLessThan(5)
    expect(overHead(pet.x - player.x, pet.y - player.y)).toBe(false)
  }
})

/** A walking Lv1 過保護親 (a lone parent) and her child, with no enemies about. */
function loneGuardian() {
  const game = new Game(71)
  game.targetPopulation = () => 0
  const player = game.addPlayer('a', 'p_over')!
  player.weapons[0].lv = 1
  player.weapons[0].cd = 0
  game.tick(1 / 60)
  const guard = game.state.shots.find((shot) => shot.owner === player.id && shot.weapon === 'p_over')!
  expect(guard.h).toBe(0)
  return { game, player, guard }
}

const degrees = (angle: number) => (angle * Math.PI) / 180

test('a lone 過保護親 walking up steps beside the child instead of standing on her; other directions are unchanged', () => {
  const { game, player, guard } = loneGuardian()
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
      expect(Math.abs(guard.x - player.x)).toBeGreaterThanOrEqual(16)
      expect(guard.y).toBeLessThan(player.y)
    } else {
      expect(guard.x - player.x).toBeCloseTo(x * guard.orbit * 0.65, 1)
      expect(guard.y - player.y).toBeCloseTo(y * guard.orbit * 0.65, 1)
    }
  }
})

test('a lone 過保護親 keeps off the hat for every heading from 60° to 120° above the horizon', () => {
  for (const order of [1, -1]) {
    const { game, player, guard } = loneGuardian()
    for (let step = 0; step <= 12; step++) {
      const angle = degrees(order > 0 ? -60 - step * 5 : -120 + step * 5)
      game.setInput(player.id, { x: Math.cos(angle), y: Math.sin(angle) })
      for (let frame = 0; frame < 120; frame++) game.tick(1 / 60)
      expect(guard.guardianStill).toBe(0)
      expect(Math.abs(guard.x - player.x), `heading ${Math.round((angle * 180) / Math.PI)}°`).toBeGreaterThanOrEqual(16)
    }
  }
})

test('a lone 過保護親 turning round passes beside or below the head, never over the hat', () => {
  const turns: [string, number[]][] = [
    ['down to up', [90, -90]],
    ['up-right to up-left', [-45, -135]],
    ['right through up to left', [0, -90, 180]]
  ]
  for (const [name, headings] of turns) {
    const { game, player, guard } = loneGuardian()
    game.setInput(player.id, { x: Math.cos(degrees(headings[0])), y: Math.sin(degrees(headings[0])) })
    for (let frame = 0; frame < 120; frame++) game.tick(1 / 60)
    for (const heading of headings.slice(1)) {
      game.setInput(player.id, { x: Math.cos(degrees(heading)), y: Math.sin(degrees(heading)) })
      for (let frame = 0; frame < 90; frame++) {
        game.tick(1 / 60)
        const dx = guard.x - player.x
        const dy = guard.y - player.y
        expect(Math.abs(dx) >= 16 || dy >= -14, `${name}, frame ${frame}: (${dx.toFixed(1)}, ${dy.toFixed(1)})`).toBe(
          true
        )
      }
    }
  }
})

test('生き物観察 facing up summons its creature at most 20° above the horizon; other directions stay 50 px out', () => {
  const headings: number[] = []
  for (let angle = -180; angle <= 180; angle += 5) headings.push(angle)
  headings.push(-91, -89, -101, -79, -169, -11)
  for (const angle of headings) {
    const fx = Math.cos(degrees(angle))
    const fy = Math.sin(degrees(angle))
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
    const dx = creature.x - player.x
    const dy = creature.y - player.y
    expect(Math.hypot(dx, dy), `heading ${angle}°`).toBeCloseTo(50)
    if (fy < -1e-9) {
      expect(dy, `heading ${angle}°`).toBeGreaterThanOrEqual(-17.5)
      expect(Math.abs(dx), `heading ${angle}°`).toBeGreaterThanOrEqual(40)
      expect(Math.sign(dx), `heading ${angle}°`).toBe(Math.abs(fx) >= 0.2 ? Math.sign(fx) : 1)
    } else {
      expect(dx, `heading ${angle}°`).toBeCloseTo(fx * 50)
      expect(dy, `heading ${angle}°`).toBeCloseTo(fy * 50)
    }
  }
})
