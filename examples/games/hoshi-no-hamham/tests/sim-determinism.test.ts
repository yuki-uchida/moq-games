import { describe, expect, it } from 'vitest'
import { TILE, World, emptyInput, propRect, type InputState } from '../src/game/sim'
import { stageByNo } from '../src/game/stages'

/** A fixed pattern of presses that walks, jumps, bites and drops through platforms. It depends on the step only. */
function pressFor(step: number, input: InputState): InputState {
  const phase = Math.floor(step / 45)
  const turn = (phase * 2654435761) >>> 0
  const right = turn % 7 !== 0 && turn % 5 !== 1
  input.right = right
  input.left = !right && turn % 3 !== 0
  input.up = false
  input.down = step % 211 < 6
  input.jump = step % 53 < 26
  input.jumpPressed = step % 53 === 0
  input.bitePressed = step % 17 === 3
  input.bite = input.bitePressed
  return input
}

const FNV_PRIME = 0x01000193
const view = new DataView(new ArrayBuffer(8))

/** Folds every number, boolean and string of an object (its own fields, in order) into a running FNV-1a hash. */
function fold(hash: number, value: unknown): number {
  let h = hash
  const byte = (b: number) => {
    h = Math.imul(h ^ b, FNV_PRIME) >>> 0
  }
  if (typeof value === 'number') {
    view.setFloat64(0, value)
    for (let i = 0; i < 8; i++) byte(view.getUint8(i))
  } else if (typeof value === 'boolean') byte(value ? 1 : 0)
  else if (typeof value === 'string') for (let i = 0; i < value.length; i++) byte(value.charCodeAt(i))
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (typeof inner === 'function') continue
      for (let i = 0; i < key.length; i++) byte(key.charCodeAt(i))
      h = fold(h, inner)
    }
  } else byte(value === undefined ? 2 : 3)
  return h
}

function foldBytes(hash: number, bytes: Uint8Array): number {
  let h = hash
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], FNV_PRIME) >>> 0
  return h
}

/** Everything the step can change, plus the events it produced. */
function digest(world: World, events: readonly unknown[], hash: number): number {
  let h = fold(hash, world.player)
  h = fold(h, world.enemies)
  h = fold(h, world.boss ? { ...world.boss, def: world.boss.def.name } : null)
  h = fold(h, world.props)
  h = fold(h, world.bees)
  h = fold(h, world.shots)
  h = fold(h, world.bossGate)
  h = fold(h, [world.time, world.state, world.clearTimer, world.collected, world.kills, world.goalOpen])
  h = fold(h, events)
  h = foldBytes(h, world.tiles)
  h = foldBytes(h, world.dynamic)
  return foldBytes(h, world.water)
}

class Run {
  readonly world: World
  readonly input = emptyInput()
  hash = 0x811c9dc5
  events = 0
  step = 0

  constructor(stageNo: number, seed: number) {
    this.world = new World(stageByNo(stageNo), { seed })
    // Survival is not what is measured: keep the hero alive so that the run reaches enemies, props and water.
    this.world.player.hp = this.world.player.maxHp = 999
  }

  advance() {
    this.world.step(1 / 60, pressFor(this.step++, this.input))
    const events = this.world.events.splice(0)
    this.events += events.length
    this.hash = digest(this.world, events, this.hash)
  }
}

const STEPS = 20 * 60

function play(stageNo: number, seed: number) {
  const run = new Run(stageNo, seed)
  for (let i = 0; i < STEPS && run.world.state === 'play'; i++) run.advance()
  return run
}

describe('simulation determinism', () => {
  for (const stageNo of [1, 2]) {
    it(`stage ${stageNo}: two runs of 20 simulated seconds give the same hash`, () => {
      const a = play(stageNo, 5)
      const b = play(stageNo, 5)
      expect(a.step).toBeGreaterThan(600)
      expect(a.events).toBeGreaterThan(20)
      expect(b.hash).toBe(a.hash)
      expect(b.events).toBe(a.events)
    })
  }

  it('worlds that are stepped alternately do not share scratch state', () => {
    const alone = [play(1, 5), play(2, 9)]
    const first = new Run(1, 5)
    const second = new Run(2, 9)
    for (let i = 0; i < STEPS; i++) {
      if (first.world.state === 'play') first.advance()
      if (second.world.state === 'play') second.advance()
    }
    expect(first.hash).toBe(alone[0].hash)
    expect(second.hash).toBe(alone[1].hash)
  })

  it('a different seed gives a different run', () => {
    expect(play(2, 5).hash).not.toBe(play(2, 6).hash)
  })

  it('propRect hands out a new rectangle each call', () => {
    const world = new World(stageByNo(1), { seed: 1 })
    const prop = world.props.find((p) => p.kind === 'tree') ?? world.props[0]
    const one = propRect(prop)
    const two = propRect(prop)
    expect(one).not.toBe(two)
    expect(one).toEqual({ x: prop.x, y: prop.y, w: prop.w * TILE, h: prop.h * TILE })
    one.x += 100
    expect(propRect(prop)).toEqual(two)
  })

  it('the world arrays keep their order while things die and are added', () => {
    const run = new Run(2, 5)
    const seen: number[] = []
    for (let i = 0; i < STEPS && run.world.state === 'play'; i++) {
      run.advance()
      const ids = run.world.enemies.map((enemy) => enemy.id)
      expect(ids).toEqual([...ids].sort((x, y) => x - y))
      seen.push(ids.length)
    }
    expect(Math.max(...seen)).toBeGreaterThan(0)
  })
})
