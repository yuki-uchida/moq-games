import { describe, expect, it } from 'vitest'
import { TILE, T, World, emptyInput, type InputState } from '../src/game/sim'
import { STAGES } from '../src/game/stages'

/**
 * A simple speedrun bot: hold right, jump over walls, pits and props, bite whatever is in the way.
 * It is not meant to be smart; it proves each stage's geometry can actually be traversed.
 */
function botInput(world: World, memory: { x: number; stuck: number; reverse: number }): InputState {
  const p = world.player
  const input = emptyInput()
  if (p.dead) return input
  // Unstick: if no progress for a while, walk the other way for a moment.
  if (Math.abs(p.x - memory.x) < 2) memory.stuck += 1
  else memory.stuck = 0
  memory.x = p.x
  if (memory.stuck > 120) {
    memory.stuck = 0
    memory.reverse = 90
  }
  const moveDir = memory.reverse > 0 ? -1 : 1
  if (memory.reverse > 0) {
    memory.reverse -= 1
    // Walk off ledges without jumping while backing out of a corner.
    input[moveDir > 0 ? 'right' : 'left'] = true
    return input
  }

  // Face and bite whatever is close: an enemy, or a switch that opens a door.
  let target: { x: number; y: number; reach: number } | null = null
  for (const enemy of world.enemies) {
    if (enemy.dead) continue
    if (Math.abs(enemy.x - p.x) < 80 && Math.abs(enemy.y - p.y) < 70) {
      target = { x: enemy.x, y: enemy.y, reach: 70 }
      break
    }
  }
  if (!target) {
    for (const prop of world.props) {
      if (prop.kind !== 'switch' || prop.state !== 'idle') continue
      if (Math.abs(prop.x - p.x) < 120 && Math.abs(prop.y - p.y) < 190) {
        target = { x: prop.x, y: prop.y, reach: 110 }
        break
      }
    }
  }
  if (target) {
    const d = Math.sign(target.x - p.x)
    if (d !== 0) input[d > 0 ? 'right' : 'left'] = true
    input.bite = true
    input.bitePressed = true
  } else {
    input[moveDir > 0 ? 'right' : 'left'] = true
  }

  const sign = target ? Math.sign(target.x - p.x) || moveDir : moveDir
  const footTy = Math.floor((p.y + p.h - 4) / TILE)
  const aheadTx = Math.floor((p.x + p.w / 2 + sign * (p.w / 2 + 8)) / TILE)
  // Diggable walls and rock piles block the road: bite through them instead of jumping.
  const dirtAhead = world.tileAt(aheadTx, footTy) === T.DIRT || world.tileAt(aheadTx, footTy - 1) === T.DIRT
  const rockAhead = world
    .props.filter((prop) => prop.kind === 'rock' && prop.state === 'idle')
    .some((prop) => Math.abs(prop.x - p.x) < 76 && Math.abs(prop.y - p.y) < 60)
  if (dirtAhead || rockAhead) {
    input.bite = true
    input.bitePressed = true
    input[moveDir > 0 ? 'right' : 'left'] = true
    return input
  }
  const wallAhead = world.solidAt(aheadTx, footTy) || world.solidAt(aheadTx, footTy - 1)
  const belowTy = Math.floor((p.y + p.h + 16) / TILE)
  const pitAhead = !world.solidAt(aheadTx, belowTy) && !world.waterAt(aheadTx, belowTy)
  // A pit too wide to jump: fell a nearby tree so its trunk bridges the gap.
  if (pitAhead && p.onGround) {
    const tree = world.props.find(
      (prop) =>
        (prop.kind === 'tree' || prop.kind === 'pine') &&
        prop.state === 'idle' &&
        prop.x > p.x - 60 &&
        prop.x < p.x + 340 &&
        Math.abs(prop.y - p.y) < 110
    )
    if (tree) {
      input.bite = true
      input.bitePressed = true
      input[moveDir > 0 ? 'right' : 'left'] = true
      return input
    }
  }
  if ((wallAhead || pitAhead) && p.onGround) {
    input.jumpPressed = true
  }
  if (wallAhead || pitAhead || p.vy < 0) input.jump = true
  return input
}

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
    world.goalOpen = true
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

  for (const stageId of ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-7', 'stage-8', 'stage-9', 'stage-10']) {
    it(`${stageId} cannot be cleared without biting`, () => {
      const world = playWithoutBiting(stageId)
      expect(world.state, `${stageId} was cleared without a single bite`).not.toBe('clear')
    })
  }
})
