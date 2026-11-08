/**
 * End-to-end scripted run of stage 1 with one human (all four heroes, Tab/Q/F): every puzzle is solved and the
 * boss is defeated through the normal input path, until the phase is 'clear'.
 */
import { expect, test } from 'vitest'
import { FX_SPEC } from '../src/art/contract'
import { SFX } from '../src/audio/api'
import type { Enemy, Hero, WorldState } from '../src/sim/state'
import { DT } from '../src/sim/tables'
import { TILE } from '../src/vocab'
import { T, Pad, ctrlHero, meadowWorld, part } from './sim-helpers'
import type { WorldImpl } from '../src/sim/world'

class Script {
  readonly log: string[] = []
  readonly seen = new Map<string, Set<string>>()
  private lastEvent = 0
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
    this.until(() => !this.W.techs.length, 2, 'technique end')
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

test('stage 1 end to end: every puzzle and the boss to the results screen', () => {
  const { world, W } = meadowWorld()
  const pad = new Pad(world)
  const s = new Script(world, W, pad)
  expect(W.phase).toBe('play')
  expect(world.view().objective).toContain('ジャンプ')

  // A: talk to the elder, cut grass, jump the channel from the broken bridge.
  s.go(T(8), T(57))
  pad.interact()
  s.wait(0.1)
  expect(world.view().dialogs[0]?.speaker).toBe('長老スライム')
  pad.interact()
  s.wait(0.1)
  expect(world.view().dialogs[0]?.text).toContain('WASD')
  s.go(T(15), T(55))
  pad.aim(-Math.PI / 2).tap()
  s.wait(0.4)
  expect(W.props.some((p) => p.kind === 'grass' && p.state !== 'idle')).toBe(true)
  s.go(T(26), T(57))
  s.go(T(27) + 10, T(57), { tol: 6 })
  s.wait(0.3, () => pad.move(1, 0))
  pad.jump()
  s.wait(0.6, () => pad.move(1, 0))
  if (Math.floor(s.me.body.x / TILE) < 29) s.fail('jump across the channel')
  s.note('channel jumped')
  s.go(T(33), T(57))
  s.regroup(8)

  // B: the stone block (weight 2) along the hedge corridor.
  const block = part(W, 'blockB')
  s.go(T(40), T(57))
  s.regroup()
  s.go(T(42) - 50, T(57), { tol: 4 })
  s.until(
    () => block.x >= T(48) && block.state === 'idle',
    20,
    'push the block',
    () => pad.move(1, 0)
  )
  s.note('block pushed')
  // The boulder (weight 4) needs all four.
  const boulder = part(W, 'boulderB')
  s.go(T(53), T(57))
  s.regroup()
  s.go(55 * TILE - 20, 57 * TILE, { tol: 4 })
  s.until(
    () => boulder.x >= 59 * TILE && boulder.state === 'idle',
    20,
    'push the boulder',
    () => pad.move(1, 0)
  )
  s.note('boulder pushed')
  // The chest behind it.
  const chest = W.props.find((p) => p.kind === 'chest' && !p.cond)!
  s.go(chest.x, chest.y + 60)
  pad.interact()
  s.until(() => chest.state === 'open', 1, 'chest B')

  // C: the arena: gates lock, two waves.
  s.go(T(62), T(52))
  s.regroup()
  s.go(T(62), T(48))
  expect(W.arenas.get('C')?.state).toBe('active')
  s.until(() => part(W, 'gateCin').state === 'closed', 2, 'arena gate closes')
  s.clearEnemies('C', 90)
  s.until(
    () => W.arenas.get('C')?.state === 'cleared',
    30,
    'arena cleared',
    () => {
      const foe = s.nearestFoe(3000)
      if (foe) s.fightTick(foe)
    }
  )
  expect(W.checkpoint).toBe('C')
  s.until(() => part(W, 'gateCout').state === 'open', 2, 'arena exit')
  s.note('arena cleared')

  // D: split puzzle with Q (stay) and Tab.
  s.go(T(5), T(45), { tol: 8 })
  s.wait(0.3)
  expect(part(W, 'plateD1').on).toBe(true)
  pad.mode() // stay
  pad.tab()
  s.wait(0.1)
  const second = s.me
  s.go(T(42), T(48), { tol: 8 })
  s.wait(0.3)
  expect(part(W, 'plateD2').on).toBe(true)
  s.until(() => part(W, 'gateD').state === 'open', 2, 'maze gate opens')
  pad.tab()
  s.wait(0.1)
  expect(s.me).not.toBe(second)
  s.go(T(24), T(38))
  s.go(T(25) + 6, T(38), { tol: 8 })
  pad.state.aim = 0
  pad.interact()
  s.until(() => part(W, 'leverD').state === 'on', 1, 'lever')
  pad.mode() // follow
  s.until(
    () => W.heroes.every((h) => Math.floor(h.body.y / TILE) <= 39),
    20,
    'party through the maze gate',
    () => pad.move(0, 0)
  )
  expect(part(W, 'gateD').state).toBe('open')
  s.note('maze solved')

  // E: carry the giant acorn to the pedestal.
  s.clearEnemies('E', 60)
  const acorn = part(W, 'acorn')
  const ped = part(W, 'pedestalE')
  s.go(acorn.x - 60, acorn.y)
  s.regroup()
  pad.state.aim = 0
  pad.move(0, 0).interact()
  s.until(
    () => acorn.state === 'lifted',
    6,
    'acorn lifted',
    () => pad.move(0, 0)
  )
  s.until(
    () => ped.on,
    25,
    'acorn on the pedestal',
    () => {
      if (acorn.state !== 'lifted' && !ped.on) {
        // Dropped (a carrier strayed): grip again.
        if (s.me.hold === undefined && W.seq % 30 === 0) {
          if (Math.hypot(acorn.x - s.me.body.x, acorn.y - s.me.body.y) < 90) pad.interact()
          else pad.move(Math.sign(acorn.x - s.me.body.x), Math.sign(acorn.y - s.me.body.y))
        }
        return
      }
      const dx = ped.x - acorn.x
      const dy = ped.y - acorn.y
      const d = Math.hypot(dx, dy)
      pad.move(dx / d, dy / d)
    }
  )
  s.until(() => part(W, 'gateE').state === 'open', 2, 'ruins gate')
  s.note('acorn delivered')

  // F: big plate (optional chest), the bounce ledge, then the cracked rock.
  s.go(T(41), T(34))
  s.regroup()
  const big = part(W, 'bigplateF')
  s.go(big.x, T(29), { tol: 10 })
  s.regroup()
  s.press(big.x, big.y)
  expect(big.on).toBe(true)
  s.until(() => part(W, 'chestF').state === 'open', 2, 'big plate chest')
  s.clearEnemies('F', 40)
  s.go(T(59), T(32))
  s.go(T(60), T(32), { tol: 6 })
  s.until(
    () => s.me.body.x > T(64) - 20 && s.me.body.jt < 0,
    3,
    'bounce to the ledge',
    () => pad.move(1, 0)
  )
  const gems = W.party.gems
  s.go(T(67), T(32), { time: 6 })
  s.go(T(66), T(31), { time: 6 })
  expect(W.party.gems).toBeGreaterThan(gems)
  s.go(T(65), T(33), { tol: 8 })
  s.until(
    () => s.me.body.x < T(62) && s.me.body.jt < 0,
    3,
    'bounce back',
    () => pad.move(-1, 0)
  )
  s.note('ledge visited')
  const rock = part(W, 'crackF')
  s.go(rock.x, T(31), { tol: 10 })
  s.regroup(12)
  s.press(rock.x, rock.y)
  s.until(() => rock.gone, 2, 'cracked rock gone')
  s.note('rock broken')

  // G: four crystals in four alcoves, one hero each, せーの.
  s.go(T(55) + 32, T(26))
  s.go(T(52), T(24))
  s.regroup(12)
  s.clearEnemies('G', 60)
  expect(W.checkpoint).toBe('G')
  pad.mode() // stay
  const spots: [number, number, number][] = [
    [T(49), 17 * TILE + 18, -Math.PI / 2],
    [T(23), 17 * TILE + 18, -Math.PI / 2],
    [20 * TILE + 18, T(22), Math.PI],
    [T(31), 27 * TILE - 18, Math.PI / 2]
  ]
  spots.forEach(([x, y, a], i) => {
    if (i > 0) {
      pad.tab()
      s.wait(0.1)
    }
    s.go(x, y, { tol: 5 })
    pad.move(0, 0).aim(a)
    s.wait(0.2)
  })
  pad.signal()
  s.wait(0.05)
  const sig = W.signal!
  s.until(() => W.t >= sig.at + 3, 4, 'GO')
  pad.tap()
  s.wait(0.1)
  s.log.push(
    W.props
      .filter((p) => p.kind === 'crystal')
      .map((p) => `${p.part}:${p.state}:${p.on}`)
      .join(' ') +
      ' ' +
      W.heroes.map((h) => `${h.slot}:${h.state}:${h.aim.toFixed(2)}:${h.atkReady.toFixed(1)}`).join(' ')
  )
  s.until(() => W.flags.has('crystals:G'), 1, 'crystals solved')
  s.until(() => part(W, 'bossdoor').state === 'open', 2, 'boss door')
  pad.mode() // follow
  s.note('crystals solved')

  // H: ガルド.
  s.go(T(36), T(16))
  s.regroup(15)
  s.go(T(36), T(13), { fight: false })
  const boss = W.boss!
  expect(boss.active).toBe(true)
  expect(world.view().room).toBe('H')
  let techs = 0
  const fightStart = W.t
  s.until(
    () => boss.dead,
    240,
    'boss defeated',
    () => {
      const m = s.me.body
      const d = Math.hypot(boss.x - m.x, boss.y - m.y)
      const a = Math.atan2(boss.y - m.y, boss.x - m.x)
      pad.state.aim = a
      pad.state.aimDist = d
      const inForm = s.me.form >= 0 && W.formations[s.me.form].slots.length >= 3
      if (s.me.charging) {
        pad.move(0, 0)
        if (s.me.chargeFull && inForm) {
          pad.release()
          techs++
        } else if (s.me.chargeFull) pad.release()
        return
      }
      if (W.techs.length) return
      if (boss.broken > W.t) {
        // Hit it while the guard is down.
        if (d > 90) pad.move(Math.cos(a), Math.sin(a))
        else pad.move(0, 0)
        if (W.seq % 10 === 0) pad.tap()
        return
      }
      // Keep some distance and press whenever possible.
      if (d < 200) pad.move(-Math.cos(a), -Math.sin(a))
      else if (d > 260) pad.move(Math.cos(a), Math.sin(a))
      else pad.move(0, 0)
      if (s.me.chargeLock <= W.t && inForm && !pad.state.attackHeld) pad.attack()
    }
  )
  const fight = W.t - fightStart
  s.note(`boss defeated in ${fight.toFixed(1)} s, ${boss.breaks} guard breaks, ${techs} presses`)
  if (fight < 60 || fight > 100 || boss.breaks < 2) s.fail(`boss fight ${fight.toFixed(1)} s, ${boss.breaks} breaks`)
  // A real fight for the full party: 60–100 s and at least two guard breaks.
  expect(fight).toBeGreaterThanOrEqual(60)
  expect(fight).toBeLessThanOrEqual(100)
  expect(boss.breaks).toBeGreaterThanOrEqual(2)
  pad.state.attackHeld = false
  pad.send()

  // I: the orb on the altar.
  s.until(() => W.pickups.some((p) => p.kind === 'orb'), 3, 'orb appears')
  const orb = W.pickups.find((p) => p.kind === 'orb')!
  s.until(
    () => W.phase === 'clear',
    20,
    'clear',
    () => s.pathStep(orb.x, orb.y)
  )
  const v = world.view()
  expect(v.phase).toBe('clear')
  expect(v.results?.stage).toBe('meadow')
  expect(v.results?.badges.length).toBe(4)
  expect(['S', 'A', 'B', 'C']).toContain(v.results?.rank)
  expect(world.progress().cleared).toContain('meadow')
  console.log(s.log.join('\n'), `\nresults ${JSON.stringify(v.results)}`)
  // Every effect and sound the run produced exists in the art and audio contracts.
  for (const name of s.seen.get('fx') ?? []) expect(FX_SPEC[name], `fx ${name}`).toBeDefined()
  for (const name of s.seen.get('sfx') ?? [])
    expect((SFX as readonly string[]).includes(name), `sfx ${name}`).toBe(true)
  const burstKinds = ['dust', 'leaf', 'shard', 'splash', 'smoke', 'spark', 'feather', 'rubble']
  for (const name of s.seen.get('burst') ?? []) expect(burstKinds).toContain(name)
  for (const k of [
    'sfx',
    'fx',
    'hit',
    'pop',
    'shake',
    'stop',
    'banner',
    'form',
    'tech',
    'solve',
    'notice',
    'clang',
    'kill'
  ])
    expect(s.seen.has(k), `event kind ${k}`).toBe(true)
  // Results → next: stage 2 has no data yet, back to the lobby with stage 1 cleared.
  world.command('host', { type: 'next' })
  expect(world.view().phase).toBe('lobby')
})
