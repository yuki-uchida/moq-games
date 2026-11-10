/**
 * A simple speedrun bot shared by the traversability and boss tests.
 *
 * It holds right, jumps over walls, pits and props, and bites whatever blocks the road. It is not
 * meant to be smart; it proves each stage's geometry can actually be traversed by a player who only
 * walks, jumps and bites.
 */
import { TILE, T, World, emptyInput, type InputState } from '../src/game/sim'

export interface BotMemory {
  x: number
  stuck: number
  reverse: number
}

export function botInput(world: World, memory: BotMemory): InputState {
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
