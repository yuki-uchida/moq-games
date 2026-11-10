import { describe, expect, it } from 'vitest'
import { TILE, World, emptyInput, type InputState } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import { botInput } from './bot'

/** Survival is not what these tests measure; the runner is healed every frame. */
function prepare(stageId: string, seed = 5) {
  const stage = STAGES.find((entry) => entry.id === stageId)!
  const world = new World(stage, { seed })
  for (const enemy of world.enemies) enemy.dead = true
  world.player.maxHp = 999
  world.player.hp = 999
  return world
}

/** Runs the player through the level with the shared bot until the boss arena wakes up. */
function approachBoss(world: World, maxSeconds = 150) {
  const boss = world.boss!
  // Doors and switches have their own coverage; open them here so this test measures the boss arena.
  for (const prop of world.props) if (prop.kind === 'switch') world.biteProp(prop, 1)
  const memory = { x: world.player.x, stuck: 0, reverse: 0 }
  let frames = maxSeconds * 60
  while (frames-- > 0 && world.state === 'play' && !boss.active) world.step(1 / 60, botInput(world, memory))
  return boss.active
}

/** Chases the boss on foot and bites whenever it is close enough. */
function fightInput(world: World): InputState {
  const p = world.player
  const boss = world.boss!
  const input = emptyInput()
  const px = p.x + p.w / 2
  const bx = boss.x + boss.w / 2
  const dx = bx - px
  const bossMid = boss.y + boss.h / 2
  const playerMid = p.y + p.h / 2
  if (Math.abs(dx) > 26) input[dx > 0 ? 'right' : 'left'] = true
  if (bossMid < playerMid - 60 && p.onGround) {
    input.jump = true
    input.jumpPressed = true
  }
  const aheadTx = Math.floor((px + Math.sign(dx) * (p.w / 2 + 10)) / TILE)
  const footTy = Math.floor((p.y + p.h - 4) / TILE)
  if (world.solidAt(aheadTx, footTy) || world.solidAt(aheadTx, footTy - 1)) {
    input.jump = true
    input.jumpPressed = true
  }
  const belowTy = Math.floor((p.y + p.h + 12) / TILE)
  if (!world.solidAt(aheadTx, belowTy) && p.onGround) {
    input.jump = true
    input.jumpPressed = true
  }
  if (Math.abs(dx) < 84 && Math.abs(bossMid - playerMid) < 120) {
    input.bite = true
    input.bitePressed = true
  }
  return input
}

function fightBoss(world: World, maxSeconds = 150) {
  const boss = world.boss!
  let frames = maxSeconds * 60
  while (frames-- > 0 && !boss.dead && world.state === 'play') {
    world.player.hp = world.player.maxHp
    world.step(1 / 60, fightInput(world))
  }
  return world
}

describe('stage bosses', () => {
  for (const stage of STAGES.filter((entry) => entry.objective === 'boss')) {
    it(`${stage.id}: ${stage.boss.name} can be defeated and opens the exit`, () => {
      const world = prepare(stage.id)
      const boss = world.boss!
      expect(boss.active, `${stage.boss.name} should wait in its arena`).toBe(false)
      expect(approachBoss(world), `${stage.boss.name} never woke up`).toBe(true)
      expect(world.bossGate, 'the arena should seal behind the player').not.toBeNull()
      const gateX = world.bossGate!.x
      // The barrier cannot be walked through: holding left must not get the player past it.
      const p = world.player
      for (let i = 0; i < 60 && world.state === 'play'; i++) world.step(1 / 60, { ...emptyInput(), left: true })
      expect(p.x + p.w, 'the player slipped back through the arena door').toBeGreaterThan(gateX * TILE)
      fightBoss(world)
      expect(boss.dead, `${stage.boss.name} survived the fight`).toBe(true)
      expect(world.goalOpen).toBe(true)
      expect(world.bossGate, 'the arena door should open again').toBeNull()
    })
  }

  it('stage-6: gathering the nest materials summons the forest boss', () => {
    const world = prepare('stage-6')
    expect(world.boss).toBeNull()
    for (const prop of [...world.props]) {
      if (prop.kind === 'twig' || prop.kind === 'berry') world.collect(prop)
    }
    const boss = world.boss!
    expect(boss.active).toBe(true)
    expect(world.bossGate).not.toBeNull()
    fightBoss(world)
    expect(boss.dead).toBe(true)
    expect(world.goalOpen).toBe(true)
  })

  it('a boss does not move or take damage before the player reaches its arena', () => {
    const world = prepare('stage-2')
    const boss = world.boss!
    const startX = boss.x
    const startY = boss.y
    for (let i = 0; i < 120; i++) world.step(1 / 60, emptyInput())
    expect(boss.active).toBe(false)
    world.damageBoss(2)
    expect(boss.hp).toBe(boss.maxHp)
    expect(boss.x).toBe(startX)
    expect(boss.y).toBe(startY)
    expect(world.bossGate).toBeNull()
  })

  it('the chasing parent tires out instead of dying', () => {
    const world = prepare('stage-1')
    const boss = world.boss!
    expect(boss.def.stamina).toBe(true)
    let frames = 0
    while (boss.state !== 'tired' && frames++ < 60 * 90) {
      world.player.hp = world.player.maxHp
      world.player.x = boss.x + 400
      world.step(1 / 60, emptyInput())
    }
    expect(boss.state).toBe('tired')
    expect(boss.dead).toBe(false)
    expect(boss.stamina).toBe(0)
  })

  it('defeating a boss clears the enemies it leaves behind only through the exit', () => {
    const world = prepare('stage-2')
    approachBoss(world)
    fightBoss(world)
    expect(world.boss!.dead).toBe(true)
    expect(world.state).not.toBe('dead')
    expect(world.goalOpen).toBe(true)
  })
})
