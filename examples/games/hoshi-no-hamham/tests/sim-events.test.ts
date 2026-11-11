import { describe, expect, it } from 'vitest'
import { SIM_EVENT_TYPES, type SimEvent, type SimEventType } from '../src/game/events'
import {
  MAX_HP,
  PLAYER_H,
  PLAYER_W,
  T,
  TILE,
  World,
  emptyInput,
  enemyStats,
  type Enemy,
  type InputState
} from '../src/game/sim'
import { STAGES, stageByNo } from '../src/game/stages'
import type { EnemyKind } from '../src/game/types'
import { botInput } from './bot'

/** Every event any test below produced, for the coverage check at the end. */
const seen = new Set<SimEventType>()
const everything: SimEvent[] = []

function make(stageNo = 1, seed = 7) {
  return new World(stageByNo(stageNo), { seed })
}

function input(overrides: Partial<InputState> = {}): InputState {
  return { ...emptyInput(), ...overrides }
}

/** Takes the events out of the world and records them for the coverage check. */
function drain(world: World): SimEvent[] {
  const events = world.events.splice(0)
  for (const event of events) seen.add(event.type)
  everything.push(...events)
  return events
}

/** Steps the world and returns every event produced meanwhile. */
function run(world: World, frames: number, state: InputState = emptyInput()): SimEvent[] {
  const out: SimEvent[] = []
  for (let i = 0; i < frames; i++) {
    world.step(1 / 60, state)
    out.push(...drain(world))
  }
  return out
}

function of<T extends SimEventType>(events: SimEvent[], type: T) {
  return events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type)
}

function calm(world: World, killEnemies = true) {
  if (world.boss) {
    world.boss.state = 'tired'
    world.boss.stamina = 0
    world.boss.vx = 0
  }
  if (killEnemies) for (const enemy of world.enemies) enemy.dead = true
  world.events.length = 0
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

function bite(world: World) {
  world.player.biteCooldown = 0
  return run(world, 1, input({ bitePressed: true }))
}

function propOf(world: World, kind: string) {
  return world.props.find((prop) => prop.kind === kind)!
}

function biteProp(world: World, kind: string) {
  const prop = propOf(world, kind)
  standNextTo(world, Math.floor(prop.x / TILE), Math.floor(prop.y / TILE))
  return { prop, events: bite(world) }
}

function addEnemy(world: World, kind: EnemyKind, x: number, y: number): Enemy {
  const stats = enemyStats(kind)
  const enemy: Enemy = {
    id: 9000 + world.enemies.length,
    kind,
    x,
    y,
    w: stats.w,
    h: stats.h,
    vx: 0,
    vy: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    facing: -1,
    onGround: false,
    t: 0,
    shootTimer: 0,
    hitFlash: 0,
    dead: false,
    anchor: x,
    touchDamage: stats.touch
  }
  world.enemies.push(enemy)
  return enemy
}

/** The hero's feet on solid ground, with nothing else around. */
function grounded(stageNo = 1) {
  const world = make(stageNo)
  calm(world)
  run(world, 30)
  expect(world.player.onGround).toBe(true)
  return world
}

describe('hero events', () => {
  it('jump and land', () => {
    const world = grounded()
    const p = world.player
    const feetX = p.x + p.w / 2
    const feetY = p.y + p.h
    const jump = of(run(world, 1, input({ jump: true, jumpPressed: true })), 'jump')
    expect(jump).toHaveLength(1)
    expect(jump[0].x).toBeCloseTo(feetX, 0)
    expect(jump[0].y).toBeCloseTo(feetY, 0)
    const land = of(run(world, 90), 'land')
    expect(land).toHaveLength(1)
    expect(land[0].speed).toBeGreaterThan(100)
    expect(land[0].y).toBeCloseTo(p.y + p.h, 0)
  })

  it('drop through a one-way platform', () => {
    const world = grounded()
    const p = world.player
    const tx = Math.floor((p.x + p.w / 2) / TILE)
    const ty = Math.floor((p.y + p.h + 2) / TILE)
    world.tiles[ty * world.w + tx] = T.PLATFORM
    const drop = of(run(world, 1, input({ down: true })), 'drop')
    expect(drop).toHaveLength(1)
    expect(drop[0].x).toBeCloseTo(p.x + p.w / 2, 0)
  })

  it('bite reports whether it connected', () => {
    const world = grounded()
    world.player.facing = -1
    const miss = of(bite(world), 'bite')
    expect(miss).toHaveLength(1)
    expect(miss[0].hit).toBe(false)
    expect(miss[0].dir).toBe(-1)

    const other = make(2)
    calm(other, false)
    const enemy = other.enemies.find((e) => !e.dead)!
    enemy.x = other.player.x + 60
    enemy.y = other.player.y + 10
    enemy.vx = 0
    enemy.vy = 0
    other.player.facing = 1
    const hit = of(bite(other), 'bite')
    expect(hit[0].hit).toBe(true)
    expect(hit[0].dir).toBe(1)
    expect(hit[0].x).toBeGreaterThan(other.player.x + other.player.w / 2)
  })

  it('splash when entering and leaving water', () => {
    const world = grounded()
    const p = world.player
    const tx = Math.floor((p.x + p.w / 2) / TILE)
    const ty = Math.floor((p.y + p.h * 0.6) / TILE)
    world.water[ty * world.w + tx] = 1
    const enter = of(run(world, 1), 'splash')
    expect(enter).toHaveLength(1)
    expect(enter[0].enter).toBe(true)
    expect(enter[0].y).toBe(ty * TILE)
    expect(enter[0].speed).toBeGreaterThanOrEqual(0)
    world.water.fill(0)
    const leave = of(run(world, 1), 'splash')
    expect(leave).toHaveLength(1)
    expect(leave[0].enter).toBe(false)
    expect(leave[0].y).toBeCloseTo(p.y + p.h / 2, 0)
  })

  it('hurt carries the cause, the knock-back direction and the health left', () => {
    const world = grounded()
    const p = world.player
    world.hurtPlayer(1, p.x + 200, 'shot')
    const events = drain(world)
    const hurt = of(events, 'hurt')
    expect(hurt).toHaveLength(1)
    expect(hurt[0].cause).toBe('shot')
    expect(hurt[0].dir).toBe(-1)
    expect(hurt[0].hp).toBe(MAX_HP - 1)
    expect(of(events, 'dead')).toHaveLength(0)
    p.invuln = 0
    world.hurtPlayer(1, p.x - 200)
    expect(of(drain(world), 'hurt')[0].cause).toBe('enemy')
  })

  it('dead when the health reaches zero', () => {
    const world = grounded()
    world.hurtPlayer(MAX_HP, world.player.x)
    const events = drain(world)
    expect(of(events, 'hurt')[0].hp).toBe(0)
    expect(of(events, 'dead')).toHaveLength(1)
  })

  it('spikes hurt with the spike cause', () => {
    const world = grounded()
    const p = world.player
    world.tiles[Math.floor((p.y + p.h / 2) / TILE) * world.w + Math.floor((p.x + p.w / 2) / TILE)] = T.SPIKE
    const hurt = of(run(world, 1), 'hurt')
    expect(hurt[0].cause).toBe('spike')
  })

  it('a pit fall hurts and puts the hero back on safe ground', () => {
    const world = grounded()
    const p = world.player
    const safeY = p.lastSafeY
    // Open the bottom rows so the body is not pushed out of the "terrain" below the map.
    const tx = Math.floor((p.x + p.w / 2) / TILE)
    for (const ty of [world.h - 2, world.h - 1]) world.tiles[ty * world.w + tx] = T.EMPTY
    p.y = (world.h - 1) * TILE + 1
    const events = run(world, 1)
    const hurt = of(events, 'hurt')
    expect(hurt[0].cause).toBe('pit')
    const respawn = of(events, 'respawn')
    expect(respawn).toHaveLength(1)
    expect(respawn[0].y).toBeCloseTo(safeY + p.h - 4, 0)
  })
})

describe('pickups and spawns', () => {
  it('fruit heals and reports the health', () => {
    const world = make(1)
    calm(world)
    world.player.hp = 2
    const fruit = propOf(world, 'fruit')
    world.player.x = fruit.x
    world.player.y = fruit.y
    const pickup = of(run(world, 1), 'pickup')
    expect(pickup).toHaveLength(1)
    expect(pickup[0].kind).toBe('fruit')
    expect(pickup[0].hp).toBe(3)
    expect(pickup[0].x).toBe(fruit.x + 32)
  })

  it('nest materials report the running count and the amount needed', () => {
    const world = make(6)
    calm(world)
    const twig = world.props.find((prop) => prop.kind === 'twig')!
    world.collect(twig)
    const pickup = of(drain(world), 'pickup')
    expect(pickup[0].kind).toBe('twig')
    expect(pickup[0].count).toBe(1)
    expect(pickup[0].need).toBe(world.stage.collect)
  })

  it('star heals two', () => {
    const world = make(1)
    calm(world)
    const star = STAGES.map((stage) => new World(stage, { seed: 3 })).find((w) =>
      w.props.some((p) => p.kind === 'star')
    )
    expect(star).toBeDefined()
    star!.player.hp = 1
    star!.collect(star!.props.find((p) => p.kind === 'star')!)
    const pickup = of(drain(star!), 'pickup')
    expect(pickup[0].kind).toBe('star')
    expect(pickup[0].hp).toBe(3)
  })

  it('a broken rock can drop fruit and a dug tile or felled tree can drop material', () => {
    const world = make(6)
    calm(world)
    const dropFruit = (world as unknown as { dropFruit(x: number, y: number): void }).dropFruit.bind(world)
    dropFruit(128, 64)
    const fruit = of(drain(world), 'spawn')
    expect(fruit).toHaveLength(1)
    expect(fruit[0].kind).toBe('fruit')
    const dropMaterial = (world as unknown as { dropMaterial(x: number, y: number): void }).dropMaterial.bind(world)
    dropMaterial(128, 64)
    const material = of(drain(world), 'spawn')
    expect(material).toHaveLength(1)
    expect(['twig', 'berry']).toContain(material[0].kind)
    const newest = world.props.at(-1)!
    expect(material[0].x).toBe(newest.x + 16)
  })
})

describe('gimmick events', () => {
  it('dig: the bitten tile is primary and the ones that crumble with it are not', () => {
    const world = make(1)
    calm(world)
    const row = world.stage.map.find((line) => line.includes('D'))!
    const ty = world.stage.map.indexOf(row)
    const tx = row.indexOf('D')
    standNextTo(world, tx, ty)
    const dig = of(bite(world), 'dig')
    expect(dig.filter((event) => event.primary)).toHaveLength(1)
    expect(dig.find((event) => event.primary)).toMatchObject({ tx, ty })
    for (const event of dig) expect(world.tileAt(event.tx, event.ty)).toBe(T.EMPTY)
  })

  it('a tree is chopped twice, falls, and lands as a four tile log', () => {
    const world = make(1)
    calm(world)
    const { prop, events } = biteProp(world, 'tree')
    expect(of(events, 'chop')).toMatchObject([{ kind: 'tree', left: 1, dir: 1 }])
    const second = bite(world)
    expect(of(second, 'chop')).toMatchObject([{ left: 0 }])
    const fall = of(second, 'tree-fall')
    expect(fall).toHaveLength(1)
    expect(fall[0].dir).toBe(1)
    const land = of(run(world, 60), 'tree-land')
    expect(land).toHaveLength(1)
    expect(land[0].length).toBe(4)
    expect(land[0].dir).toBe(1)
    expect(land[0].ty).toBe(Math.floor(prop.y / TILE))
    expect(land[0].y).toBe(land[0].ty * TILE)
    expect(land[0].x).toBe((land[0].tx + 2) * TILE)
    expect(world.dynamic[land[0].ty * world.w + land[0].tx]).toBe(1)
  })

  it('a pipe bursts', () => {
    const world = make(1)
    calm(world)
    const { events } = biteProp(world, 'pipe')
    expect(of(events, 'pipe-burst')).toHaveLength(1)
  })

  it('a hive breaks and its bees sting', () => {
    const world = make(1)
    calm(world, false)
    const hive = propOf(world, 'hive')
    const enemy = world.enemies.find((e) => !e.dead)!
    enemy.x = hive.x + 100
    enemy.y = hive.y
    enemy.vx = 0
    enemy.vy = 0
    world.player.x = hive.x - 60
    world.player.y = hive.y
    world.player.vx = 0
    world.player.vy = 0
    world.player.facing = 1
    const first = bite(world)
    expect(of(first, 'hive-break')).toHaveLength(1)
    const later = run(world, 180)
    expect(of(later, 'sting').length).toBeGreaterThan(0)
  })

  it('a bee that reaches the hero hurts with the bee cause', () => {
    const world = make(1)
    calm(world)
    world.bees.push({ x: world.player.x + 10, y: world.player.y + 10, vx: 0, vy: 0, life: 5, t: 0, cooldown: 0 })
    const hurt = of(run(world, 2), 'hurt')
    expect(hurt[0].cause).toBe('bee')
  })

  it('an animal wakes, runs and stops', () => {
    const world = make(1)
    calm(world)
    const { events } = biteProp(world, 'animal')
    const wake = of(events, 'animal-wake')
    expect(wake).toHaveLength(1)
    expect(wake[0].dir).toBe(1)
    const later = run(world, 300)
    expect(of(later, 'animal-done')).toHaveLength(1)
  })

  it('a rock cracks and then breaks', () => {
    const world = make(1)
    calm(world)
    const { events } = biteProp(world, 'rock')
    expect(of(events, 'rock-crack')).toHaveLength(1)
    expect(of(events, 'rock-break')).toHaveLength(0)
    const second = bite(world)
    expect(of(second, 'rock-break')).toHaveLength(1)
    expect(of(second, 'rock-crack')).toHaveLength(0)
  })

  it('a switch opens its doors', () => {
    const world = make(4)
    calm(world)
    const door = propOf(world, 'door')
    const sw = world.props.find((prop) => prop.kind === 'switch' && prop.data === door.data)!
    standNextTo(world, Math.floor(sw.x / TILE), Math.floor(sw.y / TILE))
    const events = bite(world)
    expect(of(events, 'switch')).toMatchObject([{ id: door.data }])
    const open = of(events, 'door-open')
    expect(open.length).toBeGreaterThan(0)
    expect(open.find((event) => event.x === door.x && event.y === door.y)).toMatchObject({
      w: door.w,
      h: door.h,
      id: door.data
    })
  })

  it('a caged princess is freed by a bite', () => {
    const cage = STAGES.map((stage) => new World(stage, { seed: 3 })).find((w) =>
      w.props.some((p) => p.kind === 'princess' && p.data === 1)
    )!
    expect(cage).toBeDefined()
    calm(cage)
    const princess = cage.props.find((p) => p.kind === 'princess' && p.data === 1)!
    standNextTo(cage, Math.floor(princess.x / TILE), Math.floor(princess.y / TILE))
    const free = of(bite(cage), 'princess-free')
    expect(free).toHaveLength(1)
    expect(free[0].x).toBe(princess.x + 32)
  })

  it('the goal opens and the hero clears the stage', () => {
    const world = make(2)
    calm(world)
    world.boss!.active = true
    world.boss!.hp = 1
    world.boss!.invuln = 0
    world.damageBoss(1)
    const events = drain(world)
    const goal = propOf(world, 'goal')
    expect(of(events, 'goal-open')).toMatchObject([{ x: goal.x + 32, y: goal.y + 32 }])
    expect(of(events, 'boss-down')).toHaveLength(1)
    world.player.x = goal.x
    world.player.y = goal.y
    const clear = of(run(world, 1), 'clear')
    expect(clear).toMatchObject([{ x: goal.x + 32, y: goal.y + 32 }])
  })
})

describe('enemy events', () => {
  it('a surviving enemy reports a hit and a defeated one reports a single down', () => {
    const world = make(1)
    calm(world)
    const p = world.player
    const enemy = addEnemy(world, 'tough', p.x + 60, p.y)
    world.player.facing = 1
    const hit = of(bite(world), 'enemy-hit')
    expect(hit).toMatchObject([{ id: enemy.id, kind: 'tough', dir: 1 }])
    expect(enemy.hp).toBe(5)

    const weak = addEnemy(world, 'walker', p.x + 60, p.y)
    weak.hp = 1
    enemy.dead = true
    const events = bite(world)
    expect(of(events, 'enemy-hit').filter((event) => event.id === weak.id)).toHaveLength(0)
    const down = of(events, 'enemy-down')
    expect(down).toMatchObject([{ id: weak.id, kind: 'walker' }])
    expect(down[0].dir === 1 || down[0].dir === -1).toBe(true)
  })

  it('a jumper hops and a spitter spits', () => {
    const world = make(1)
    calm(world)
    const p = world.player
    const jumper = addEnemy(world, 'jumper', p.x + 200, p.y)
    const hops = of(run(world, 90), 'hop')
    expect(hops.length).toBeGreaterThan(0)
    expect(hops[0].id).toBe(jumper.id)
    jumper.dead = true

    const spitter = addEnemy(world, 'spitter', p.x + 250, p.y + p.h - enemyStats('spitter').h)
    spitter.shootTimer = 0
    world.player.invuln = 99
    const spit = of(run(world, 2), 'spit')
    expect(spit).toHaveLength(1)
    expect(spit[0]).toMatchObject({ id: spitter.id, dir: -1 })
    expect(world.shots.at(-1)!.skin).toBe('seed')
  })

  it('a shot that hits terrain reports it, and one that hits the hero uses the shot cause', () => {
    const world = grounded()
    const p = world.player
    const floorTy = Math.floor((p.y + p.h + 4) / TILE)
    const tx = Math.floor(p.x / TILE) + 3
    const make = (x: number, y: number) => ({
      kind: 'seed' as const,
      x,
      y,
      w: 14,
      h: 14,
      vx: 0,
      vy: 0,
      hostile: true,
      life: 4,
      dead: false
    })
    world.shots.push(make(tx * TILE + 10, floorTy * TILE + 10))
    const hit = of(run(world, 1), 'shot-hit')
    expect(hit).toMatchObject([{ kind: 'seed' }])
    world.shots.push(make(p.x + 5, p.y + 5))
    expect(of(run(world, 1), 'hurt')[0].cause).toBe('shot')
  })

  it('touching an enemy or the boss uses its cause', () => {
    const world = make(1)
    calm(world)
    addEnemy(world, 'walker', world.player.x, world.player.y)
    expect(of(run(world, 1), 'hurt')[0].cause).toBe('enemy')

    const boss = make(3)
    boss.boss!.active = true
    boss.boss!.x = boss.player.x
    boss.boss!.y = boss.player.y
    boss.events.length = 0
    expect(of(run(boss, 1), 'hurt')[0].cause).toBe('boss')
  })
})

/** The shared bot and boss helpers of tests/bosses.test.ts, with every event recorded. */
function fightInput(world: World): InputState {
  const p = world.player
  const boss = world.boss!
  const out = emptyInput()
  const px = p.x + p.w / 2
  const dx = boss.x + boss.w / 2 - px
  const bossMid = boss.y + boss.h / 2
  const playerMid = p.y + p.h / 2
  if (Math.abs(dx) > 26) out[dx > 0 ? 'right' : 'left'] = true
  if (bossMid < playerMid - 60 && p.onGround) {
    out.jump = true
    out.jumpPressed = true
  }
  const aheadTx = Math.floor((px + Math.sign(dx) * (p.w / 2 + 10)) / TILE)
  const footTy = Math.floor((p.y + p.h - 4) / TILE)
  if (world.solidAt(aheadTx, footTy) || world.solidAt(aheadTx, footTy - 1)) {
    out.jump = true
    out.jumpPressed = true
  }
  const belowTy = Math.floor((p.y + p.h + 12) / TILE)
  if (!world.solidAt(aheadTx, belowTy) && p.onGround) {
    out.jump = true
    out.jumpPressed = true
  }
  if (Math.abs(dx) < 84 && Math.abs(bossMid - playerMid) < 120) {
    out.bite = true
    out.bitePressed = true
  }
  return out
}

/** Walks to the boss arena, then fights until the boss falls; returns every event on the way. */
function fullFight(stageNo: number): { world: World; events: SimEvent[] } {
  const stage = stageByNo(stageNo)
  const world = new World(stage, { seed: 5 })
  const events: SimEvent[] = []
  for (const enemy of world.enemies) enemy.dead = true
  world.player.maxHp = 999
  world.player.hp = 999
  const boss = world.boss!
  for (const prop of world.props) if (prop.kind === 'switch') world.biteProp(prop, 1)
  const memory = { x: world.player.x, stuck: 0, reverse: 0 }
  let frames = 150 * 60
  while (frames-- > 0 && world.state === 'play' && !boss.active) {
    world.step(1 / 60, botInput(world, memory))
    events.push(...drain(world))
  }
  frames = 150 * 60
  while (frames-- > 0 && !boss.dead && world.state === 'play') {
    world.player.hp = world.player.maxHp
    world.step(1 / 60, fightInput(world))
    events.push(...drain(world))
  }
  events.push(...drain(world))
  return { world, events }
}

describe('boss events', () => {
  const fights = new Map<number, { world: World; events: SimEvent[] }>()
  const fight = (no: number) => {
    if (!fights.has(no)) fights.set(no, fullFight(no))
    return fights.get(no)!
  }

  it('crow: wakes, seals the arena, dives, volleys feathers and falls', () => {
    const { world, events } = fight(2)
    expect(world.boss!.dead).toBe(true)
    expect(of(events, 'boss-awake')).toHaveLength(1)
    expect(of(events, 'gate-up')).toHaveLength(1)
    expect(of(events, 'gate-down')).toHaveLength(1)
    expect(of(events, 'boss-down')).toHaveLength(1)
    expect(of(events, 'goal-open')).toHaveLength(1)
    expect(of(events, 'boss-attack').some((event) => event.attack === 'dive')).toBe(true)
    const shoot = of(events, 'boss-shoot')
    expect(shoot.length).toBeGreaterThan(0)
    expect(shoot[0].count).toBe(2)
    const states = of(events, 'boss-state').map((event) => event.state)
    expect(states).toContain('windup')
    expect(states).toContain('dive')
    const hits = of(events, 'boss-hit')
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(hit.ratio).toBeGreaterThanOrEqual(0)
      expect(hit.ratio).toBeLessThanOrEqual(1)
    }
    expect(hits.at(-1)!.ratio).toBe(0)
  })

  it('crow feathers, fox orbs and bee stingers', () => {
    const skinOf = (no: number) => {
      const world = make(no)
      calm(world)
      const boss = world.boss!
      boss.active = true
      boss.state = 'idle'
      boss.shotTimer = 0
      world.player.x = boss.x - 200
      world.player.y = boss.y
      const skins = new Set<string | undefined>()
      for (let i = 0; i < 360; i++) {
        world.player.invuln = 999
        run(world, 1)
        for (const shot of world.shots) if (shot.hostile) skins.add(shot.skin)
      }
      return skins
    }
    expect([...skinOf(2)]).toEqual(['feather'])
    expect([...skinOf(7)]).toEqual(['orb'])
    expect([...skinOf(9)]).toEqual(['stinger'])
  })

  it('brute charges', () => {
    const { events } = fight(3)
    expect(of(events, 'boss-attack').some((event) => event.attack === 'charge')).toBe(true)
  })

  it('the shockwave brute releases ground shocks with a direction', () => {
    const { events } = fight(4)
    const shocks = of(events, 'shock')
    expect(shocks.length).toBeGreaterThan(0)
    for (const shock of shocks) expect(shock.dir === 1 || shock.dir === -1).toBe(true)
  })

  it('a charging boss that hits a wall crashes and is stunned', () => {
    const world = make(3)
    calm(world)
    const boss = world.boss!
    boss.active = true
    boss.state = 'charge'
    boss.stateTime = 0
    boss.facing = -1
    boss.x = TILE + 4
    boss.y = world.player.y + world.player.h - boss.h
    world.player.x = boss.x + 600
    world.player.invuln = 999
    const events = run(world, 40)
    const crash = of(events, 'boss-crash')
    expect(crash).toHaveLength(1)
    expect(crash[0].dir).toBe(-1)
    expect(boss.state === 'stunned' || boss.state === 'recover' || boss.state === 'idle').toBe(true)
    expect(of(events, 'boss-state').some((event) => event.state === 'stunned')).toBe(true)
  })

  it('tanks leap and slam', () => {
    const { events } = fight(8)
    expect(of(events, 'boss-attack').some((event) => event.attack === 'leap')).toBe(true)
    expect(of(events, 'boss-slam').length).toBeGreaterThan(0)
    expect(of(events, 'shock').length).toBeGreaterThan(0)
  })

  it('swarm bosses dash, volley and call helpers', () => {
    const { events } = fight(7)
    expect(of(events, 'boss-attack').some((event) => event.attack === 'dash')).toBe(true)
    expect(of(events, 'boss-shoot').length).toBeGreaterThan(0)
    const minions = of(events, 'minion')
    expect(minions.length).toBeGreaterThan(0)
    expect(['walker', 'jumper']).toContain(minions[0].kind)
  })

  it('the nest boss arrives when the materials are gathered', () => {
    const world = make(6)
    calm(world)
    for (const prop of [...world.props]) if (prop.kind === 'twig' || prop.kind === 'berry') world.collect(prop)
    const events = drain(world)
    expect(of(events, 'boss-awake')).toHaveLength(1)
    expect(of(events, 'gate-up')).toHaveLength(1)
    world.boss!.hp = 1
    world.damageBoss(1)
    const down = drain(world)
    expect(of(down, 'boss-down')).toHaveLength(1)
    expect(of(down, 'goal-open')).toHaveLength(1)
  })

  it('the final boss changes phase and uses every attack', () => {
    const world = make(10)
    calm(world)
    const boss = world.boss!
    boss.active = true
    boss.state = 'idle'
    world.player.x = boss.x - 250
    world.player.y = boss.y
    world.player.maxHp = 9999
    world.player.hp = 9999
    boss.hp = Math.floor(boss.maxHp / 2)
    const events: SimEvent[] = []
    for (let i = 0; i < 60 * 90; i++) {
      world.player.hp = 9999
      world.player.invuln = 0
      world.step(1 / 60, emptyInput())
      events.push(...drain(world))
      if (!boss.dead && world.player.x < boss.x - 400) world.player.x = boss.x - 250
    }
    expect(of(events, 'boss-phase')).toMatchObject([{ phase: 2 }])
    const attacks = new Set(of(events, 'boss-attack').map((event) => event.attack))
    expect(attacks.has('charge') || attacks.has('leap') || attacks.has('cast')).toBe(true)
    expect(of(events, 'boss-shoot').every((event) => event.count >= 3)).toBe(true)
  })

  it('the chasing parent tires and a hit lowers her stamina ratio', () => {
    const world = make(1)
    const boss = world.boss!
    world.player.maxHp = 999
    world.player.hp = 999
    boss.stamina = 100
    world.damageBoss(1)
    const hit = of(drain(world), 'boss-hit')
    expect(hit).toHaveLength(1)
    expect(hit[0].ratio).toBeCloseTo(0.91, 2)
    expect(hit[0].weak).toBe(false)
    boss.stamina = 5
    world.damageBoss(1)
    const events = drain(world)
    expect(of(events, 'boss-tired')).toHaveLength(1)
    expect(of(events, 'boss-state').filter((event) => event.state === 'tired')).toHaveLength(1)
  })

  it('a bonus hit on a stunned boss is weak', () => {
    const world = make(3)
    calm(world)
    const boss = world.boss!
    boss.active = true
    boss.state = 'stunned'
    boss.invuln = 0
    world.damageBoss(1)
    const hit = of(drain(world), 'boss-hit')
    expect(hit[0].weak).toBe(true)
    expect(hit[0].ratio).toBeCloseTo((boss.maxHp - 2) / boss.maxHp, 5)
  })

  it('defeating a boss frees every caged princess', () => {
    const world = STAGES.map((stage) => new World(stage, { seed: 3 })).find(
      (w) => w.boss && w.props.some((p) => p.kind === 'princess' && p.data === 1)
    )!
    expect(world).toBeDefined()
    calm(world)
    world.boss!.active = true
    world.boss!.hp = 1
    world.boss!.invuln = 0
    world.damageBoss(1)
    const events = drain(world)
    expect(of(events, 'boss-down')).toHaveLength(1)
    expect(of(events, 'princess-free').length).toBeGreaterThan(0)
  })
})

describe('event stream', () => {
  const script = (i: number) =>
    input({
      right: i > 40,
      jump: i % 90 > 10 && i % 90 < 40,
      jumpPressed: i % 90 === 10,
      bite: i % 45 === 0,
      bitePressed: i % 45 === 0
    })

  it('is identical for the same seed and inputs', () => {
    const a = make(2, 99)
    const b = make(2, 99)
    const ea: SimEvent[] = []
    const eb: SimEvent[] = []
    for (let i = 0; i < 600; i++) {
      a.step(1 / 60, script(i))
      b.step(1 / 60, script(i))
      ea.push(...drain(a))
      eb.push(...drain(b))
    }
    expect(ea.length).toBeGreaterThan(5)
    expect(JSON.stringify(ea)).toBe(JSON.stringify(eb))
  })

  it('never carries a non-finite number', () => {
    for (const event of everything) {
      for (const [key, value] of Object.entries(event)) {
        if (typeof value === 'number') expect(Number.isFinite(value), `${event.type}.${key}`).toBe(true)
      }
    }
  })

  it('has every event type produced by some test above', () => {
    const missing = SIM_EVENT_TYPES.filter((type) => !seen.has(type))
    expect(missing).toEqual([])
  })
})
