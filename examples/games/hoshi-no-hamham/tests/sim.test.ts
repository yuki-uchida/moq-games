import { describe, expect, it } from 'vitest'
import { T, TILE, World, emptyInput, type InputState } from '../src/game/sim'
import { stageByNo } from '../src/game/stages'
import { MAX_HP, PLAYER_H, PLAYER_W } from '../src/game/sim'

function make(stageNo = 1, seed = 7) {
  return new World(stageByNo(stageNo), { seed })
}

function input(overrides: Partial<InputState> = {}): InputState {
  return { ...emptyInput(), ...overrides }
}

function run(world: World, frames: number, state: InputState = emptyInput()) {
  for (let i = 0; i < frames; i++) world.step(1 / 60, state)
}

function calm(world: World, killEnemies = true) {
  if (world.boss) {
    world.boss.state = 'tired'
    world.boss.stamina = 0
    world.boss.vx = 0
  }
  if (killEnemies) for (const enemy of world.enemies) enemy.dead = true
}

function standNextTo(world: World, tx: number, ty: number, fromLeft = true) {
  const p = world.player
  p.x = fromLeft ? tx * TILE - PLAYER_W - 2 : (tx + 1) * TILE + 2
  p.y = (ty + 1) * TILE - PLAYER_H
  p.vx = 0
  p.vy = 0
  p.facing = fromLeft ? 1 : -1
  p.invuln = 0
}

function tileOf(world: World, char: string): { tx: number; ty: number } {
  const row = world.stage.map.find((line) => line.includes(char))
  const ty = world.stage.map.indexOf(row!)
  const tx = row!.indexOf(char)
  return { tx, ty }
}

describe('player movement', () => {
  it('walks right and left', () => {
    const world = make()
    calm(world)
    const start = world.player.x
    run(world, 60, input({ right: true }))
    expect(world.player.x).toBeGreaterThan(start + 100)
    const peak = world.player.x
    run(world, 60, input({ left: true }))
    expect(world.player.x).toBeLessThan(peak - 100)
  })

  it('jumps and lands again', () => {
    const world = make()
    calm(world)
    run(world, 30)
    const ground = world.player.y
    world.step(1 / 60, input({ jump: true, jumpPressed: true }))
    let minY = ground
    for (let i = 0; i < 60; i++) {
      world.step(1 / 60, input({ jump: true }))
      minY = Math.min(minY, world.player.y)
    }
    expect(minY).toBeLessThan(ground - 60)
    run(world, 60)
    expect(world.player.y).toBeCloseTo(ground, 0)
  })

  it('starts with full health and dies at zero', () => {
    const world = make()
    calm(world)
    expect(world.player.hp).toBe(MAX_HP)
    world.hurtPlayer(MAX_HP, world.player.x + 100)
    expect(world.player.hp).toBe(0)
    expect(world.player.dead).toBe(true)
    expect(world.state).toBe('dead')
  })

  it('grants invulnerability after a hit', () => {
    const world = make()
    calm(world)
    world.hurtPlayer(1, world.player.x)
    expect(world.player.hp).toBe(MAX_HP - 1)
    world.hurtPlayer(1, world.player.x)
    expect(world.player.hp).toBe(MAX_HP - 1)
  })
})

describe('biting', () => {
  it('damages an enemy in front of the player', () => {
    const world = make(2)
    calm(world, false)
    const enemy = world.enemies.find((e) => !e.dead)!
    enemy.x = world.player.x + 60
    enemy.y = world.player.y + 10
    enemy.vx = 0
    enemy.vy = 0
    const hp = enemy.hp
    world.player.facing = 1
    world.step(1 / 60, input({ bitePressed: true }))
    expect(enemy.hp).toBeLessThan(hp)
  })

  it('digs through dirt tiles', () => {
    const world = make(1)
    calm(world)
    const { tx, ty } = tileOf(world, 'D')
    expect(world.tileAt(tx, ty)).toBe(T.DIRT)
    standNextTo(world, tx, ty)
    world.step(1 / 60, input({ bitePressed: true }))
    expect(world.tileAt(tx, ty)).toBe(T.EMPTY)
  })

  it('fells a tree after two bites and makes it solid', () => {
    const world = make(1)
    calm(world)
    const tree = world.props.find((prop) => prop.kind === 'tree')!
    const tx = Math.floor(tree.x / TILE)
    const ty = Math.floor(tree.y / TILE)
    standNextTo(world, tx, ty)
    world.step(1 / 60, input({ bitePressed: true }))
    expect(tree.state).toBe('idle')
    world.player.biteCooldown = 0
    world.step(1 / 60, input({ bitePressed: true }))
    expect(tree.state).toBe('falling')
    run(world, 60)
    expect(tree.state).toBe('fallen')
    let solid = 0
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) solid += world.dynamic[y * world.w + x]
    expect(solid).toBeGreaterThan(0)
  })

  it('opens a pipe and floods the stage with water', () => {
    const world = make(1)
    calm(world)
    const pipe = world.props.find((prop) => prop.kind === 'pipe')!
    const tx = Math.floor(pipe.x / TILE)
    const ty = Math.floor(pipe.y / TILE)
    standNextTo(world, tx, ty)
    world.step(1 / 60, input({ bitePressed: true }))
    expect(pipe.state).toBe('broken')
    run(world, 120)
    let water = 0
    for (const cell of world.water) water += cell
    expect(water).toBeGreaterThan(0)
  })

  it('angers a beehive and sends bees after enemies', () => {
    const world = make(1)
    calm(world, false)
    const hive = world.props.find((prop) => prop.kind === 'hive')!
    const enemy = world.enemies.find((e) => !e.dead)!
    enemy.x = hive.x + 100
    enemy.y = hive.y
    enemy.vx = 0
    enemy.vy = 0
    const hp = enemy.hp
    world.player.x = hive.x - 60
    world.player.y = hive.y
    world.player.vx = 0
    world.player.vy = 0
    world.player.facing = 1
    world.step(1 / 60, input({ bitePressed: true }))
    expect(world.bees.length).toBeGreaterThan(0)
    run(world, 180)
    expect(enemy.hp).toBeLessThan(hp)
  })

  it('wakes a sleeping animal so it charges', () => {
    const world = make(1)
    calm(world)
    const animal = world.props.find((prop) => prop.kind === 'animal')!
    const tx = Math.floor(animal.x / TILE)
    const ty = Math.floor(animal.y / TILE)
    standNextTo(world, tx, ty)
    world.step(1 / 60, input({ bitePressed: true }))
    expect(['awake', 'charging', 'done']).toContain(animal.state)
  })

  it('breaks a rock after two bites', () => {
    const world = make(1)
    calm(world)
    const rock = world.props.find((prop) => prop.kind === 'rock')!
    const tx = Math.floor(rock.x / TILE)
    const ty = Math.floor(rock.y / TILE)
    standNextTo(world, tx, ty)
    world.step(1 / 60, input({ bitePressed: true }))
    expect(rock.state).toBe('idle')
    world.player.biteCooldown = 0
    world.step(1 / 60, input({ bitePressed: true }))
    expect(rock.state).toBe('broken')
  })

  it('flips a switch and opens its door', () => {
    const world = make(4)
    calm(world)
    const door = world.props.find((prop) => prop.kind === 'door')!
    const sw = world.props.find((prop) => prop.kind === 'switch' && prop.data === door.data)!
    const tx = Math.floor(sw.x / TILE)
    const ty = Math.floor(sw.y / TILE)
    standNextTo(world, tx, ty)
    expect(door.state).toBe('closed')
    world.step(1 / 60, input({ bitePressed: true }))
    expect(sw.state).toBe('done')
    expect(door.state).toBe('open')
  })

  it('collects fruit and restores health', () => {
    const world = make(1)
    calm(world)
    world.player.hp = 2
    const fruit = world.props.find((prop) => prop.kind === 'fruit')!
    world.player.x = fruit.x
    world.player.y = fruit.y
    world.step(1 / 60, emptyInput())
    expect(fruit.state).toBe('collected')
    expect(world.player.hp).toBe(3)
  })
})

describe('objectives', () => {
  it('clears a reach stage at the goal', () => {
    const world = make(1)
    calm(world)
    const goal = world.props.find((prop) => prop.kind === 'goal')!
    world.player.x = goal.x
    world.player.y = goal.y
    world.step(1 / 60, emptyInput())
    expect(world.state).toBe('clear')
  })

  it('locks the goal until the boss falls on boss stages', () => {
    const world = make(2)
    calm(world)
    expect(world.goalOpen).toBe(false)
    const goal = world.props.find((prop) => prop.kind === 'goal')!
    world.player.x = goal.x
    world.player.y = goal.y
    world.step(1 / 60, emptyInput())
    expect(world.state).toBe('play')
    world.boss!.hp = 1
    world.boss!.invuln = 0
    world.damageBoss(1)
    expect(world.boss!.dead).toBe(true)
    expect(world.goalOpen).toBe(true)
    world.step(1 / 60, emptyInput())
    expect(world.state).toBe('clear')
  })

  it('spawns the nest-stage boss once the materials are gathered', () => {
    const world = make(6)
    calm(world)
    expect(world.boss).toBeNull()
    const materials = world.props.filter((prop) => prop.kind === 'twig' || prop.kind === 'berry')
    for (const material of materials.slice(0, 8)) world.collect(material)
    expect(world.boss).not.toBeNull()
    expect(world.boss!.active).toBe(true)
    world.boss!.hp = 1
    world.damageBoss(1)
    expect(world.goalOpen).toBe(true)
  })

  it('tires the chasing parent so the escape can succeed', () => {
    const world = make(1)
    expect(world.boss).not.toBeNull()
    expect(world.boss!.def.stamina).toBe(true)
    // Keep the runner alive: the point is the parent's stamina, not the fall damage.
    world.player.maxHp = 999
    world.player.hp = 999
    run(world, 60 * 40, input({ right: true }))
    expect(world.boss!.state).toBe('tired')
    expect(world.boss!.stamina).toBe(0)
  })
})

describe('determinism', () => {
  it('produces identical worlds for the same seed and inputs', () => {
    const a = make(2, 99)
    const b = make(2, 99)
    for (let i = 0; i < 240; i++) {
      const state = input({ right: i > 60, jumpPressed: i === 30, bitePressed: i === 90 })
      a.step(1 / 60, state)
      b.step(1 / 60, state)
    }
    expect(a.player.x).toBe(b.player.x)
    expect(a.player.y).toBe(b.player.y)
    expect(a.enemies.length).toBe(b.enemies.length)
    expect(a.water.join('')).toBe(b.water.join(''))
  })
})
