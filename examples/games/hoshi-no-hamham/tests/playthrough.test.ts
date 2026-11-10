import { describe, expect, it } from 'vitest'
import { TILE, World } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import { botInput } from './bot'

function playWithBot(stageId: string, seed = 11, maxSeconds = 150) {
  const stage = STAGES.find((entry) => entry.id === stageId)!
  const world = new World(stage, { seed })
  // The bot is a geometry check, not a boss fight: clear the boss and open the exit.
  if (world.boss) world.boss.dead = true
  world.goalOpen = true
  // Survival is not what this test measures; keep the runner alive to test the terrain.
  world.player.maxHp = 999
  world.player.hp = 999
  for (const enemy of world.enemies) enemy.dead = true
  // Doors and switches have their own unit coverage; open them here so this test measures terrain.
  for (const prop of world.props) if (prop.kind === 'switch') world.biteProp(prop, 1)
  let frames = maxSeconds * 60
  const memory = { x: world.player.x, stuck: 0, reverse: 0 }
  while (frames-- > 0 && world.state === 'play') world.step(1 / 60, botInput(world, memory))
  return world
}

describe('stage traversability', () => {
  for (const stage of STAGES) {
    it(`a simple bot can reach the exit of ${stage.id}`, () => {
      const world = playWithBot(stage.id)
      if (world.state !== 'clear') {
        const p = world.player
        const tx = Math.floor((p.x + p.w / 2) / TILE)
        const ty = Math.floor((p.y + p.h / 2) / TILE)
        const window: string[] = []
        for (let y = ty - 4; y <= ty + 4; y++) {
          const row: string[] = []
          for (let x = tx - 12; x <= tx + 12; x++) {
            row.push(x === tx && y === ty ? '@' : world.solidAt(x, y) ? '#' : world.waterAt(x, y) ? '~' : '.')
          }
          window.push(row.join(''))
        }
        const charWindow: string[] = []
        for (let y = Math.max(0, ty - 4); y <= Math.min(world.h - 1, ty + 4); y++) {
          charWindow.push(
            [...world.stage.map[y]]
              .slice(Math.max(0, tx - 14), tx + 15)
              .join('')
          )
        }
        throw new Error(
          `bot stuck at ${p.x.toFixed(1)},${p.y.toFixed(1)} box=${p.w}x${p.h} tile=${world.tileAt(tx, ty)} solid=${world.solidAt(tx, ty)} state=${world.state} hp=${p.hp} ground=${p.onGround}\n${window.join('\n')}\n${charWindow.join('\n')}`
        )
      }
      expect(world.state).toBe('clear')
    })
  }
})

describe('biting is required', () => {
  /** The same bot with biting disabled: it may still jump and walk, but never use a gimmick. */
  function playWithoutBiting(stageId: string, seed = 11) {
    const stage = STAGES.find((entry) => entry.id === stageId)!
    const world = new World(stage, { seed })
    for (const enemy of world.enemies) enemy.dead = true
    if (world.boss) world.boss.dead = true
    // A collect stage only opens its nest once the materials are gathered, which needs a bite.
    if (stage.objective !== 'collect') world.goalOpen = true
    const memory = { x: world.player.x, stuck: 0, reverse: 0 }
    let frames = 0
    while (frames++ < 60 * 120 && world.state === 'play') {
      const input = botInput(world, memory)
      input.bite = false
      input.bitePressed = false
      world.step(1 / 60, input)
    }
    return world
  }

  for (const stageId of ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7', 'stage-8', 'stage-9', 'stage-10']) {
    it(`${stageId} cannot be cleared without biting`, () => {
      const world = playWithoutBiting(stageId)
      expect(world.state, `${stageId} was cleared without a single bite`).not.toBe('clear')
    })
  }
})
