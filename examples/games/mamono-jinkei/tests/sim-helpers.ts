/** Test helpers for the simulation: worlds from the real or a custom stage, scripted inputs and stepping. */
import { createWorld } from '../src/sim/api'
import type { StageData } from '../src/sim/stage-data'
import type { Hero, WorldState } from '../src/sim/state'
import { DT } from '../src/sim/tables'
import { NO_INPUT, type InputState, type NetInput } from '../src/sim/types'
import { WorldImpl } from '../src/sim/world'
import { TILE } from '../src/vocab'

export const T = (n: number) => n * TILE + TILE / 2

export function meadowWorld(players = ['host']): { world: WorldImpl; W: WorldState } {
  const world = createWorld({ seed: 7, progress: { cleared: [] }, stage: 'meadow', skipIntro: true }) as WorldImpl
  world.setPlayers(players.map((id) => ({ id, name: id })))
  return { world, W: world.W }
}

/** A world on a small custom map (legend chars as in the meadow plus test markers). */
export function customWorld(
  map: string[],
  extra: Partial<StageData> = {},
  players = ['host']
): { world: WorldImpl; W: WorldState } {
  const data: StageData = {
    id: 'meadow',
    map,
    light: 'day',
    legend: {
      '.': { tile: 'grass' },
      '#': { tile: 'wall' },
      '~': { tile: 'water' },
      '@': { tile: 'grass', ent: { type: 'spawn' } },
      ...extra.legend
    },
    rooms: extra.rooms ?? [{ id: 'A', name: 'A', x: 0, y: 0, w: map[0].length, h: map.length, objective: '' }],
    signs: extra.signs ?? []
  }
  const world = new WorldImpl(
    { seed: 3, progress: { cleared: [] }, stage: 'meadow', skipIntro: true },
    { meadow: data }
  )
  world.setPlayers(players.map((id) => ({ id, name: id })))
  return { world, W: world.W }
}

/** A scripted controller keeping press counters for one player. */
export class Pad {
  state: InputState & { aimDist?: number } = { ...NO_INPUT }
  constructor(
    readonly world: WorldImpl,
    readonly id = 'host'
  ) {}
  send(extra: Partial<NetInput> = {}): void {
    this.world.setInput(this.id, { ...this.state, ...extra })
  }
  move(mx: number, my: number): this {
    this.state.mx = mx
    this.state.my = my
    this.send()
    return this
  }
  aim(a: number, d?: number): this {
    this.state.aim = a
    if (d !== undefined) this.state.aimDist = d
    this.send()
    return this
  }
  attack(): this {
    this.state.attackPresses++
    this.state.attackHeld = true
    this.send()
    return this
  }
  release(): this {
    this.state.attackReleases++
    this.state.attackHeld = false
    this.send()
    return this
  }
  tap(): this {
    this.attack()
    this.release()
    return this
  }
  jump(): this {
    this.state.actionPresses++
    this.send()
    return this
  }
  interact(): this {
    this.state.interactPresses++
    this.send()
    return this
  }
  tab(): this {
    this.state.switchPresses++
    this.send()
    return this
  }
  mode(): this {
    this.state.modePresses++
    this.send()
    return this
  }
  signal(): this {
    this.state.signalPresses++
    this.send()
    return this
  }
}

export function run(world: WorldImpl, seconds: number, each?: () => void): void {
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) {
    each?.()
    world.step(DT)
  }
}

/** Steps until `cond` or the time limit; returns whether cond became true. */
export function until(world: WorldImpl, cond: () => boolean, seconds = 10, each?: () => void): boolean {
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) {
    if (cond()) return true
    each?.()
    world.step(DT)
  }
  return cond()
}

export const hero = (W: WorldState, slot: number): Hero => W.heroes.find((h) => h.slot === slot)!
export const ctrlHero = (W: WorldState, id = 'host'): Hero => hero(W, W.humans.find((h) => h.id === id)!.ctrl)
export const part = (W: WorldState, id: string) => W.props.find((p) => p.part === id)!

/** Puts a hero at a position (host-side teleport for test setup). */
export function place(h: Hero, x: number, y: number): void {
  h.body.x = x
  h.body.y = y
  h.body.vx = h.body.vy = h.body.kx = h.body.ky = 0
  h.safeX = x
  h.safeY = y
  h.ai.lastX = x
  h.ai.lastY = y
  h.accepted = undefined
}

/** Steers the controlled hero toward a point with the pad (simple straight steering). */
export function walkTo(world: WorldImpl, pad: Pad, h: Hero, x: number, y: number, seconds = 15, tol = 10): boolean {
  return until(
    world,
    () => Math.hypot(h.body.x - x, h.body.y - y) < tol,
    seconds,
    () => {
      const d = Math.hypot(x - h.body.x, y - h.body.y)
      const k = Math.min(1, d / 30)
      pad.move(((x - h.body.x) / d) * k, ((y - h.body.y) / d) * k)
    }
  )
}

/** A world on a small custom sewer map (rat species): `.` sewer, `#` brick, `~` sludge, `@` spawn. */
export function customSewer(
  map: string[],
  extra: Partial<StageData> = {},
  players = ['host']
): { world: WorldImpl; W: WorldState } {
  const data: StageData = {
    id: 'sewer',
    map,
    light: 'dim',
    legend: {
      '.': { tile: 'sewer' },
      '#': { tile: 'brick' },
      '~': { tile: 'sludge' },
      '@': { tile: 'sewer', ent: { type: 'spawn' } },
      ...extra.legend
    },
    rooms: extra.rooms ?? [{ id: 'A', name: 'A', x: 0, y: 0, w: map[0].length, h: map.length, objective: '' }],
    signs: extra.signs ?? []
  }
  const world = new WorldImpl({ seed: 5, progress: { cleared: [] }, stage: 'sewer', skipIntro: true }, { sewer: data })
  world.setPlayers(players.map((id) => ({ id, name: id })))
  return { world, W: world.W }
}

/** Puts the human's companions in stay mode, parked at the given tiles (default: far corner row 1). */
export function parkCompanions(world: WorldImpl, W: WorldState, pad: Pad, spots?: [number, number][]): void {
  pad.mode()
  run(world, 1 / 60)
  const me = ctrlHero(W, pad.id)
  W.heroes
    .filter((h) => h !== me && h.owner === pad.id)
    .forEach((h, i) => {
      const [tx, ty] = spots?.[i] ?? [1 + i, 1]
      place(h, T(tx), T(ty))
      h.anchor = { x: T(tx), y: T(ty) }
    })
}
