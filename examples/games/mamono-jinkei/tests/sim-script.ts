/** Scripted driver for end-to-end stage runs: path-following, fighting, presses and logging. */
import type { Enemy, Hero, WorldState } from '../src/sim/state'
import { DT } from '../src/sim/tables'
import { TILE } from '../src/vocab'
import type { WorldImpl } from '../src/sim/world'
import { Pad, ctrlHero } from './sim-helpers'

export class Script {
  readonly log: string[] = []
  readonly seen = new Map<string, Set<string>>()
  /** Every 'solve' banner emitted during the run, in order (scanned each step so none is evicted). */
  readonly solves: string[] = []
  private lastEvent = 0
  private lastSolve = 0
  constructor(
    readonly world: WorldImpl,
    readonly W: WorldState,
    readonly pad: Pad
  ) {}
  get me(): Hero {
    return ctrlHero(this.W)
  }
  step(): void {
    this.world.step(DT)
    const evs = this.W.events
    let i = evs.length
    while (i > 0 && evs[i - 1].id > this.lastSolve) i--
    for (; i < evs.length; i++) if (evs[i].k === 'solve') this.solves.push(evs[i].s ?? '')
    if (evs.length) this.lastSolve = evs[evs.length - 1].id
    if (this.W.seq % 20) return
    for (const e of this.world.view().events) {
      if (e.id <= this.lastEvent) continue
      this.lastEvent = e.id
      if (!this.seen.has(e.k)) this.seen.set(e.k, new Set())
      this.seen.get(e.k)!.add(e.s ?? '')
    }
  }
  wait(s: number, each?: () => void): void {
    for (let i = 0; i < Math.round(s / DT); i++) each?.(), this.step()
  }
  note(s: string): void {
    const m = this.me
    this.log.push(
      `${this.W.t.toFixed(1)}s ${s} @${Math.floor(m.body.x / TILE)},${Math.floor(m.body.y / TILE)} hp ${this.W.heroes.map((h) => h.hp).join('/')} wipes ${this.W.party.wipes}`
    )
  }
  fail(msg: string): never {
    this.note(msg)
    this.log.push(
      this.W.enemies
        .filter((e) => !e.dead)
        .map((e) => `${e.kind}@${(e.x / TILE).toFixed(1)},${(e.y / TILE).toFixed(1)} ${e.room} ${e.state} hp${e.hp}`)
        .join(' | ')
    )
    this.log.push(
      this.W.heroes
        .map((h) => `${h.slot}:${h.state}@${(h.body.x / TILE).toFixed(1)},${(h.body.y / TILE).toFixed(1)}`)
        .join(' ')
    )
    throw new Error(`${msg}\n${this.log.join('\n')}`)
  }

  nearestFoe(range: number, room?: string, sight = false): { x: number; y: number; d: number; e?: Enemy } | undefined {
    const m = this.me.body
    let best: { x: number; y: number; d: number; e?: Enemy } | undefined
    for (const e of this.W.enemies) {
      if (e.dead || e.state === 'death' || (room && e.room !== room)) continue
      if (sight && !this.W.grid!.lineClear(m.x, m.y, e.x, e.y, 4)) continue
      const d = Math.hypot(e.x - m.x, e.y - m.y)
      if (d < range && (!best || d < best.d)) best = { x: e.x, y: e.y, d, e }
    }
    return best
  }

  /** One tick of fighting the nearest enemy. */
  fightTick(foe: { x: number; y: number; d: number }): void {
    const m = this.me.body
    const a = Math.atan2(foe.y - m.y, foe.x - m.x)
    if (foe.d > 120 && !this.W.grid!.lineClear(m.x, m.y, foe.x, foe.y, 15)) {
      this.pathStep(foe.x, foe.y)
      return
    }
    this.pad.state.aim = a
    if (foe.d > 56) this.pad.move(Math.cos(a), Math.sin(a))
    else this.pad.move(0, 0)
    if (this.W.seq % 12 === 0) this.pad.tap()
  }

  private stepPath: number[] = []
  private stepAt = -100
  /** Moves one tick along an A* path toward (x, y). */
  pathStep(x: number, y: number): void {
    const g = this.W.grid!
    const m = this.me.body
    if (this.W.seq - this.stepAt > 20) {
      this.stepPath =
        g.path(
          Math.floor(m.x / TILE),
          Math.floor(m.y / TILE),
          Math.floor(x / TILE),
          Math.floor(y / TILE),
          false,
          20000
        ) ?? []
      this.stepAt = this.W.seq
    }
    const n = this.stepPath.find(
      (i) => Math.hypot((i % g.w) * TILE + 32 - m.x, Math.floor(i / g.w) * TILE + 32 - m.y) > 20
    )
    const tx = n === undefined ? x : (n % g.w) * TILE + 32
    const ty = n === undefined ? y : Math.floor(n / g.w) * TILE + 32
    const d = Math.hypot(tx - m.x, ty - m.y) || 1
    this.pad.move((tx - m.x) / d, (ty - m.y) / d)
  }

  /** Walks the controlled hero to (x, y) along an A* path, fighting enemies that come close. */
  go(x: number, y: number, opts: { tol?: number; time?: number; fight?: boolean } = {}): void {
    const tol = opts.tol ?? 12
    const limit = Math.round((opts.time ?? 40) / DT)
    let path: number[] = []
    let at = -100
    const g = this.W.grid!
    for (let i = 0; i < limit; i++) {
      const m = this.me.body
      if (Math.hypot(m.x - x, m.y - y) < tol) {
        this.pad.move(0, 0)
        return
      }
      const foe = opts.fight === false ? undefined : this.nearestFoe(200, undefined, true)
      if (foe && this.W.phase === 'play') {
        this.fightTick(foe)
        this.step()
        continue
      }
      if (i - at > 20) {
        path =
          g.path(
            Math.floor(m.x / TILE),
            Math.floor(m.y / TILE),
            Math.floor(x / TILE),
            Math.floor(y / TILE),
            false,
            20000
          ) ?? []
        at = i
      }
      let tx = x
      let ty = y
      while (path.length) {
        const n = path[0] < 0 ? -path[0] - 1 : path[0]
        const cx = (n % g.w) * TILE + 32
        const cy = Math.floor(n / g.w) * TILE + 32
        if (Math.hypot(cx - m.x, cy - m.y) < 20 && path.length > 1) {
          path.shift()
          continue
        }
        if (path.length > 1) (tx = cx), (ty = cy)
        break
      }
      const d = Math.hypot(tx - m.x, ty - m.y)
      const k = Math.min(1, d / 24)
      this.pad.move(((tx - m.x) / d) * k, ((ty - m.y) / d) * k)
      this.step()
    }
    this.fail(`could not reach ${Math.floor(x / TILE)},${Math.floor(y / TILE)}`)
  }

  /** Steps until cond, with an optional per-tick action; fails after the limit. */
  until(cond: () => boolean, s: number, what: string, each?: () => void): void {
    for (let i = 0; i < Math.round(s / DT); i++) {
      if (cond()) return
      each?.()
      this.step()
    }
    if (!cond()) this.fail(`timeout: ${what}`)
  }

  clearEnemies(room: string, s = 60): void {
    this.until(
      () => !this.W.enemies.some((e) => e.room === room && !e.dead),
      s,
      `enemies in ${room}`,
      () => {
        const foe = this.nearestFoe(4000, room)
        if (foe) this.fightTick(foe)
      }
    )
    this.pad.move(0, 0)
  }

  /** Charge with the whole formation and release toward (x, y): ジャンボ・プレス. */
  press(x: number, y: number): void {
    const m = this.me.body
    this.wait(Math.max(0, this.me.chargeLock - this.W.t) + 0.1, () => this.pad.move(0, 0))
    const a = Math.atan2(y - m.y, x - m.x)
    this.pad.aim(a, Math.hypot(x - m.x, y - m.y))
    this.pad.attack()
    this.wait(1.0)
    if (!this.me.chargeFull) this.fail('not fully charged')
    if (this.me.form < 0) this.fail('not in formation for the press')
    this.pad.release()
    this.wait(0.05)
    if (!this.W.techs.length) this.fail('no technique started')
    this.until(() => !this.W.techs.length, 4, 'technique end')
  }

  /** Gathers the party around the controlled hero (follow mode) before a press. */
  regroup(s = 6): void {
    this.until(
      () => this.me.form >= 0 && this.W.formations[this.me.form].slots.length === 4,
      s,
      'regroup',
      () => this.pad.move(0, 0)
    )
  }
}
