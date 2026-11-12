import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lobby } from '../src/app/lobby'
import type { Session } from '../src/app/session'
import { neutralPlayerInput, type PlayerInput, type View } from '../src/sim/types'
import { validatePlayerInput } from '../src/net/validate'
import { createWorld } from '../src/sim/api'
import { choice, FakeHub, provider, run, settle } from './net-helpers'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const pve = { mode: 'pve' as const, mission: 'sakura' as const, difficulty: 'easy' as const }

interface Table {
  hub: FakeHub
  host: Lobby
  guests: Lobby[]
  hostSession: Session
  guestSessions: Session[]
  views: Map<Session, View | null>
}

/** A host and guests in a started match, every session updated once per fake frame. */
async function table(
  names: string[],
  sel: typeof pve | { mode: 'pvp' } = pve,
  teams: (0 | 1 | 2)[] = []
): Promise<Table> {
  const hub = new FakeHub()
  const host = await provider(hub).host(sel, choice('ホスト', 'shiba', 0), 'match-1234')
  const guests: Lobby[] = []
  for (let i = 0; i < names.length; i++) {
    const p = provider(hub).join('match-1234', choice(names[i], 'cat', teams[i]))
    await run(100)
    guests.push(await p)
  }
  for (const g of guests) g.setReady(true)
  await run(300)
  const start = host.start()
  const hostSession = start.connect()
  await run(100)
  const guestSessions = guests.map((g) => g.online!.takeMatch()!.start.connect())
  const views = new Map<Session, View | null>()
  return { hub, host, guests, hostSession, guestSessions, views }
}

function frame(t: Table) {
  for (const s of [t.hostSession, ...t.guestSessions]) t.views.set(s, s.update(1 / 60))
}

const walk = (yaw = 0): PlayerInput => ({ ...neutralPlayerInput(), mz: 1, yaw })

describe('host / guest match', () => {
  it('guests receive snapshots and the host moves their players from their inputs', async () => {
    const t = await table(['ゲストA', 'ゲストB'])
    const gA = t.guestSessions[0]
    expect(gA.kind).toBe('guest')
    expect(gA.canPause).toBe(false)
    await run(6000, () => frame(t))
    const v = t.views.get(gA)!
    expect(v).not.toBeNull()
    expect(v.players.map((p) => p.id).sort()).toEqual(['bot1', 'h0', 'h1', 'h2'])
    expect(v.phase).toBe('play')
    const start = t.views.get(t.hostSession)!.players.find((p) => p.id === gA.me)!.p
    gA.setInput(walk(start ? 0 : 0))
    await run(1500, () => frame(t))
    const hostView = t.views.get(t.hostSession)!
    const moved = hostView.players.find((p) => p.id === gA.me)!.p
    expect(Math.hypot(moved[0] - start[0], moved[2] - start[2])).toBeGreaterThan(5)
    // the guest's own drawn position (predicted) is close to the host's
    const mine = t.views.get(gA)!.players.find((p) => p.id === gA.me)!.p
    expect(Math.hypot(mine[0] - moved[0], mine[2] - moved[2])).toBeLessThan(1.5)
    // the other guest sees A moving too (interpolated)
    const seenByB = t.views.get(t.guestSessions[1])!.players.find((p) => p.id === gA.me)!.p
    expect(Math.hypot(seenByB[0] - moved[0], seenByB[2] - moved[2])).toBeLessThan(2.5)
    expect(t.hub.stats.snapshots).toBeGreaterThan(100)
    expect(t.hub.stats.maxGuestInFlight).toBe(1)
    t.host.leave()
  }, 60_000)

  it('events reach guests exactly once', async () => {
    const t = await table(['ゲスト'])
    const seen: number[] = []
    await run(5000, () => {
      frame(t)
      for (const e of t.views.get(t.guestSessions[0])?.events ?? []) seen.push(e.id)
    })
    expect(seen.length).toBeGreaterThan(3)
    expect(new Set(seen).size).toBe(seen.length)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    t.host.leave()
  }, 60_000)

  it("a silent guest's controls are let go after 0.5 s", async () => {
    const t = await table(['ゲスト'])
    const g = t.guestSessions[0]
    await run(5500, () => frame(t))
    g.setInput(walk())
    await run(500, () => frame(t))
    t.hub.muted.add(t.guests[0].state().online!.members.find((m) => m.me)!.id)
    await run(800, () => frame(t))
    const a = t.views.get(t.hostSession)!.players.find((p) => p.id === g.me)!.p
    await run(1000, () => frame(t))
    const b = t.views.get(t.hostSession)!.players.find((p) => p.id === g.me)!.p
    expect(Math.hypot(b[0] - a[0], b[2] - a[2])).toBeLessThan(0.05)
    t.host.leave()
  }, 60_000)

  it('a guest leaving mid-match is replaced by a bot', async () => {
    const t = await table(['ゲストA', 'ゲストB'])
    await run(2000, () => frame(t))
    const id = t.guestSessions[1].me
    expect(t.views.get(t.hostSession)!.players.find((p) => p.id === id)!.bot).toBe(false)
    t.guestSessions[1].dispose()
    t.guests[1].leave()
    t.guestSessions.pop()
    await run(500, () => frame(t))
    expect(t.views.get(t.hostSession)!.players.find((p) => p.id === id)!.bot).toBe(true)
    expect(t.host.state().online?.members.map((m) => m.name)).toEqual(['ホスト', 'ゲストA'])
    t.host.leave()
  }, 60_000)

  it('a guest that leaves the match screen hands its seat to a bot and takes it back', async () => {
    const t = await table(['ゲスト'])
    await run(1000, () => frame(t))
    const id = t.guestSessions[0].me
    t.guestSessions[0].dispose()
    t.guestSessions.pop()
    await run(13_000, () => frame(t), 50)
    expect(t.views.get(t.hostSession)!.players.find((p) => p.id === id)!.bot).toBe(true)
    // ロビーへ → 任務に合流
    const again = t.guests[0].start().connect()
    t.guestSessions.push(again)
    await run(500, () => frame(t))
    expect(t.views.get(t.hostSession)!.players.find((p) => p.id === id)!.bot).toBe(false)
    t.host.leave()
  }, 60_000)

  it('the host leaving ends the match for guests with a Japanese error', async () => {
    const t = await table(['ゲスト'])
    await run(1000, () => frame(t))
    t.host.leave()
    await run(200)
    expect(() => t.guestSessions[0].update(1 / 60)).toThrow('ホストがルームを閉じました。')
  }, 60_000)

  it('the host aborting returns guests to the lobby with a message', async () => {
    const t = await table(['ゲスト'])
    await run(1000, () => frame(t))
    t.hostSession.dispose()
    await run(200)
    expect(() => t.guestSessions[0].update(1 / 60)).toThrow('ホストが任務を中断しました。')
    expect(t.guests[0].state().online?.phase).toBe('lobby')
    t.host.leave()
  }, 60_000)

  it('PvP: three humans on three teams; a late joiner takes over a bot', async () => {
    const t = await table(['アオ', 'キイ'], { mode: 'pvp' }, [1, 2])
    await run(1000, () => frame(t))
    const v = t.views.get(t.hostSession)!
    const team = (id: string) => v.players.find((p) => p.id === id)!.team
    expect([team('h0'), team(t.guestSessions[0].me), team(t.guestSessions[1].me)]).toEqual([0, 1, 2])
    expect(v.players).toHaveLength(12)
    // late joiner asks for team 1
    const late = await (async () => {
      const p = provider(t.hub).join('match-1234', choice('オソイ', 'owl', 1))
      await run(300, () => frame(t))
      return p
    })()
    await run(300, () => frame(t))
    const follow = late.online!.takeMatch()
    expect(follow?.phase).toBe('match')
    const s = follow!.start.connect()
    t.guestSessions.push(s)
    await run(600, () => frame(t))
    const now = t.views.get(t.hostSession)!.players.find((p) => p.id === s.me)!
    expect(now.bot).toBe(false)
    expect(now.team).toBe(1)
    expect(now.name).toBe('オソイ')
    t.host.leave()
  }, 60_000)

  it('the match ends for everyone with the results', async () => {
    const hub = new FakeHub()
    const host = await provider(hub, { makeWorld: (c) => createWorld({ ...c, duration: 4 }) }).host(
      { mode: 'pvp' },
      choice('ホスト'),
      'end-1234'
    )
    const guest = await settle(provider(hub).join('end-1234', choice('ゲスト', 'cat', 1)))
    guest.setReady(true)
    await run(300)
    const hs = host.start().connect()
    await run(100)
    const gs = guest.online!.takeMatch()!.start.connect()
    let gv: View | null = null
    for (let i = 0; i < 120 && !hs.over; i++) {
      await run(
        1000,
        () => {
          hs.update(1 / 60)
          gv = gs.update(1 / 60)
        },
        50
      )
    }
    expect(hs.over).toBe(true)
    await run(500, () => {
      gv = gs.update(1 / 60)
    })
    expect(gs.over).toBe(true)
    expect(['victory', 'defeat', 'draw']).toContain((gv as View | null)?.phase)
    // the host goes to its results: the guest stays on its results, no error
    hs.dispose()
    await run(300)
    expect(() => gs.update(1 / 60)).not.toThrow()
    expect(guest.state().online?.phase).toBe('lobby')
    host.leave()
  }, 120_000)
})

describe('hostile guest inputs', () => {
  it('are rebuilt field by field with clamps and monotonic counters', () => {
    const prev = { ...neutralPlayerInput(), presses: { r: 5, l: 2, jump: 9, dash: 1 } }
    const v = validatePlayerInput(
      {
        mx: 50,
        mz: NaN,
        yaw: 1e99,
        pitch: -9,
        held: 0xffff,
        presses: { r: 3, l: 1e12, jump: 10.5, dash: '7' },
        selR: -4,
        selL: 99,
        shoulder: 7,
        extra: { evil: true }
      },
      prev
    )!
    expect(v.mx).toBe(1)
    expect(v.mz).toBe(0)
    expect(Math.abs(v.yaw)).toBeLessThanOrEqual(Math.PI * 4)
    expect(v.pitch).toBeCloseTo(-1.35)
    expect(v.held).toBe(31)
    expect(v.presses).toEqual({ r: 5, l: 2, jump: 9, dash: 1 })
    expect(v.selR).toBe(0)
    expect(v.selL).toBe(15)
    expect(v.shoulder).toBe(1)
    expect('extra' in v).toBe(false)
    expect(validatePlayerInput(null)).toBeUndefined()
    expect(validatePlayerInput([1, 2])).toBeUndefined()
    const diag = validatePlayerInput({ mx: 1, mz: 1 })!
    expect(Math.hypot(diag.mx, diag.mz)).toBeCloseTo(1)
  })

  it('the host ignores inputs for another match, unknown peers and malformed messages', async () => {
    const t = await table(['ゲスト'])
    await run(5500, () => frame(t))
    const id = t.guestSessions[0].me
    const before = t.views.get(t.hostSession)!.players.find((p) => p.id === id)!.p
    // forge messages through the hub straight to the host
    const room = t.hub.rooms.get('match-1234')!
    const hostOpts = room.host!.o
    const guestId = [...room.admitted][0]
    hostOpts.onInput(guestId, { v: 1, k: 'input', m: 999, n: 1, g: 1, i: { mz: 1 } })
    hostOpts.onInput('stranger', { v: 1, k: 'input', m: 1, n: 1, g: 1, i: { mz: 1 } })
    hostOpts.onInput(guestId, { v: 1, k: 'input', m: 1, n: 'x', g: 1, i: { mz: 1 } })
    hostOpts.onInput(guestId, { v: 1, k: 'profile', p: { species: 'dragon' } })
    hostOpts.onInput(guestId, 'garbage')
    await run(500, () => frame(t))
    const after = t.views.get(t.hostSession)!.players.find((p) => p.id === id)!.p
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeLessThan(0.05)
    expect(t.host.state().online?.members.map((m) => m.name)).toEqual(['ホスト', 'ゲスト'])
    t.host.leave()
  }, 60_000)
})
