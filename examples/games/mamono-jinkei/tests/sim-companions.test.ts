import { describe, expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import { T, Pad, ctrlHero, customWorld, place, run, until, walkTo } from './sim-helpers'

const big = [
  '##########################',
  '#........................#',
  '#.@......................#',
  '#........................#',
  '#........................#',
  '#........................#',
  '#........................#',
  '##########################'
]

describe('companions (DESIGN §4)', () => {
  test('follow: companions keep a formation behind the owner and mimic attacks', () => {
    const { world, W } = customWorld(big)
    const pad = new Pad(world)
    const me = ctrlHero(W)
    expect(walkTo(world, pad, me, T(20), T(4), 10)).toBe(true)
    run(world, 1.5, () => pad.move(0, 0))
    for (const h of W.heroes) expect(Math.hypot(h.body.x - me.body.x, h.body.y - me.body.y)).toBeLessThan(100)
    expect(W.formations[0]?.slots).toEqual([0, 1, 2, 3])
    // Mimic: the owner's click makes every companion attack shortly after.
    const before = W.heroes.map((h) => h.atkReady)
    pad.aim(0).tap()
    run(world, 0.25)
    W.heroes.forEach((h, i) => expect(h.atkReady).toBeGreaterThan(before[i]))
  })

  test('follow: path-finding around a wall and slime hops over a water channel', () => {
    const map = [
      '##########################',
      '#.........#....~.........#',
      '#.@.......#....~.........#',
      '#.........#....~.........#',
      '#..............~.........#',
      '#.........#....~.........#',
      '##########################'
    ]
    const { world, W } = customWorld(map)
    const pad = new Pad(world)
    const me = ctrlHero(W)
    // Owner goes through the gap and hops the channel; companions must follow without puffing.
    place(me, T(13), T(3))
    for (const h of W.heroes) if (h !== me) h.forceSeq = 0
    let hopped = false
    expect(walkTo(world, pad, me, T(14), T(3), 4)).toBe(true)
    pad.move(1, 0)
    run(world, 0.15)
    pad.jump()
    run(world, 0.8, () => pad.move(1, 0))
    expect(me.body.x).toBeGreaterThan(T(16) - 20)
    pad.move(0, 0)
    const ok = until(
      world,
      () => W.heroes.every((h) => h.body.x > T(15) + 20),
      14,
      () => {
        if (W.heroes.some((h) => h !== me && h.body.z > 4)) hopped = true
      }
    )
    expect(ok).toBe(true)
    expect(hopped).toBe(true)
    expect(W.heroes.filter((h) => h !== me).every((h) => h.state !== 'fall')).toBe(true)
  })

  test('stay holds position; せーの GO makes staying companions attack once, facing where they were left', () => {
    const { world, W } = customWorld(big)
    const pad = new Pad(world)
    const me = ctrlHero(W)
    pad.aim(-Math.PI / 2)
    run(world, 0.1)
    pad.mode()
    run(world, 0.05)
    const stay = W.heroes.filter((h) => h !== me)
    const at = stay.map((h) => [h.body.x, h.body.y])
    walkTo(world, pad, me, T(20), T(4), 8)
    pad.move(0, 0)
    stay.forEach((h, i) => expect(Math.hypot(h.body.x - at[i][0], h.body.y - at[i][1])).toBeLessThan(12))
    expect(world.view().heroes.find((h) => h.slot === stay[0].slot)?.mode).toBe('stay')
    const ready = stay.map((h) => h.atkReady)
    pad.signal()
    run(world, 0.1)
    expect(world.view().signal?.slot).toBe(me.slot)
    run(world, 2.7)
    stay.forEach((h, i) => expect(h.atkReady).toBe(ready[i]))
    run(world, 0.3)
    stay.forEach((h, i) => expect(h.atkReady).toBeGreaterThan(ready[i]))
    expect(world.view().events.some((e) => e.k === 'sfx' && e.s === 'signalGo')).toBe(true)
    expect(Math.abs(stay[0].aim + Math.PI / 2)).toBeLessThan(0.01)
  })

  test('Tab hands control over; the previous hero stays when in stay mode; far companions puff in', () => {
    const { world, W } = customWorld(big)
    const pad = new Pad(world)
    const first = ctrlHero(W)
    pad.mode()
    run(world, 0.05)
    pad.tab()
    run(world, 0.05)
    const second = ctrlHero(W)
    expect(second.slot).toBe((first.slot + 1) % 4)
    expect(world.view().players[0].slots[0]).toBe(second.slot)
    const fx = first.body.x
    walkTo(world, pad, second, T(12), T(4), 6)
    expect(Math.abs(first.body.x - fx)).toBeLessThan(12)
    // Follow, and a far owner: companions puff over when > 12 tiles away.
    pad.move(0, 0).mode()
    const wide = [
      '#' + '#'.repeat(38) + '#',
      '#.@' + '.'.repeat(36) + '#',
      '#' + '.'.repeat(38) + '#',
      '#' + '#'.repeat(38) + '#'
    ]
    const w2 = customWorld(wide)
    const p2 = new Pad(w2.world)
    const boss = ctrlHero(w2.W)
    run(w2.world, 0.2)
    place(boss, T(37), T(1))
    const seq = w2.W.heroes.map((h) => h.forceSeq)
    expect(until(w2.world, () => w2.W.heroes.every((h, i) => h === boss || h.forceSeq > seq[i]), 2)).toBe(true)
    for (const h of w2.W.heroes) expect(Math.hypot(h.body.x - boss.body.x, h.body.y - boss.body.y)).toBeLessThan(160)
    void p2
  })

  test('players: join takes over a companion, leaving hands heroes back, a fifth human spectates', () => {
    const { world, W } = customWorld(big, {}, ['a', 'b'])
    expect(W.humans.map((h) => h.ctrl)).toEqual([0, 1])
    expect(W.heroes.map((h) => h.owner)).toEqual(['a', 'b', 'a', 'b'])
    world.setPlayers(['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id })))
    const v = world.view()
    expect(v.players.filter((p) => !p.spectator).length).toBe(4)
    expect(v.players.find((p) => p.id === 'e')?.spectator).toBe(true)
    expect(new Set(W.humans.filter((h) => !h.spectator).map((h) => h.ctrl)).size).toBe(4)
    world.setPlayers(['a', 'c', 'e'].map((id) => ({ id, name: id })))
    expect(W.heroes.every((h) => ['a', 'c', 'e'].includes(h.owner))).toBe(true)
    expect(W.humans.find((h) => h.id === 'e')?.spectator).toBe(false)
  })

  test('lobby: job picks are first come, the host chooses among unlocked stages', () => {
    const world = createWorld({ seed: 1, progress: { cleared: [] } })
    world.setPlayers([
      { id: 'h', name: 'ホスト' },
      { id: 'g', name: 'ゲスト' }
    ])
    world.setInput('g', { ...pad0, job: 'archer' })
    world.setInput('h', { ...pad0, job: 'archer' })
    expect(world.view().phase).toBe('lobby')
    expect(world.view().lobby?.unlocked).toEqual(['meadow'])
    expect(world.view().players.find((p) => p.id === 'g')?.job).toBe('archer')
    expect(world.view().players.find((p) => p.id === 'h')?.job).toBeUndefined()
    world.command('g', { type: 'start' })
    expect(world.view().phase).toBe('lobby')
    world.command('h', { type: 'start' })
    expect(world.view().phase).toBe('intro')
    const v = world.view()
    expect(v.players.find((p) => p.id === 'g')?.ctrl).toBe(2)
    expect(v.players.find((p) => p.id === 'h')?.ctrl).toBe(0)
    for (let i = 0; i < 60; i++) world.step(1 / 60)
    expect(world.view().phase).toBe('intro')
    for (let i = 0; i < 100; i++) world.step(1 / 60)
    expect(world.view().phase).toBe('play')
  })
})

const pad0 = {
  mx: 0,
  my: 0,
  aim: 0,
  attackHeld: false,
  actionHeld: false,
  attackPresses: 0,
  attackReleases: 0,
  actionPresses: 0,
  interactPresses: 0,
  switchPresses: 0,
  modePresses: 0,
  signalPresses: 0
}
