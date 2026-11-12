import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lobby } from '../src/app/lobby'
import { planSeats, type SeatMember } from '../src/net/seats'
import { cleanRoom, randomRoom, validRoom } from '../src/net/validate'
import { profileOf } from '../src/net/host-room'
import { choice, FakeHub, provider, run } from './net-helpers'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const member = (id: string, order: number, team: 0 | 1 | 2 = 0, name = id): SeatMember => ({
  id,
  order,
  profile: profileOf(choice(name, 'cat', team), true)
})

describe('room codes', () => {
  it('makes friendly random codes and cleans typed ones', () => {
    for (let i = 0; i < 50; i++) expect(validRoom(randomRoom())).toBe(true)
    expect(cleanRoom('  Sakura 1234 ')).toBe('sakura-1234')
    expect(cleanRoom('ｓａｋｕｒａ＿１２')).toBe('sakura-12')
    expect(validRoom(cleanRoom('<script>'))).toBe(true)
    expect(validRoom('ab')).toBe(false)
    expect(validRoom('-abc')).toBe(false)
    expect(validRoom('a'.repeat(33))).toBe(false)
  })
})

describe('seat assignment', () => {
  it('PvE seats the first four members and lets the rest spectate', () => {
    const members = ['a', 'b', 'c', 'd', 'e'].map((id, i) => member(id, i))
    const plan = planSeats({ mode: 'pve', mission: 'sakura', difficulty: 'normal' }, members)
    expect(plan.seats).toHaveLength(4)
    expect(plan.seats.every((s) => s.bot === undefined)).toBe(true)
    expect(plan.bySeat.get('a')).toBe('h0')
    expect(plan.bySeat.get('d')).toBe('h3')
    expect(plan.bySeat.get('e')).toBeNull()
  })

  it('PvE fills empty seats with bots', () => {
    const plan = planSeats({ mode: 'pve', mission: 'sakura', difficulty: 'hard' }, [member('a', 0), member('b', 5)])
    expect(plan.seats.map((s) => s.id)).toEqual(['h0', 'h5', 'bot1', 'bot2'])
    expect(plan.seats[2].bot).toBeGreaterThan(0.8)
  })

  it('PvP honours team requests, overflows to the emptiest team and spectates beyond 12', () => {
    const members = Array.from({ length: 14 }, (_, i) => member(`m${i}`, i, 1))
    const plan = planSeats({ mode: 'pvp' }, members)
    expect(plan.seats).toHaveLength(12)
    for (const t of [0, 1, 2]) expect(plan.seats.filter((s) => s.team === t && s.bot === undefined)).toHaveLength(4)
    expect(plan.seats.filter((s) => s.team === 1).map((s) => s.id)).toEqual(['h0', 'h1', 'h2', 'h3'])
    expect(plan.bySeat.get('m12')).toBeNull()
    expect(plan.bySeat.get('m13')).toBeNull()
  })

  it('PvP host moves win until the member picks a team again', () => {
    const b = member('b', 1, 0)
    b.hostTeam = { team: 2, pref: 0 }
    let plan = planSeats({ mode: 'pvp' }, [member('a', 0, 0), b])
    expect(plan.seats.find((s) => s.id === 'h1')?.team).toBe(2)
    b.profile = { ...b.profile, team: 1 }
    plan = planSeats({ mode: 'pvp' }, [member('a', 0, 0), b])
    expect(plan.seats.find((s) => s.id === 'h1')?.team).toBe(1)
    // three teams of four, bots fill
    expect(plan.seats).toHaveLength(12)
  })
})

describe('online lobby over the in-memory network', () => {
  const pve = { mode: 'pve' as const, mission: 'sakura' as const, difficulty: 'normal' as const }

  async function room(hub: FakeHub, guests: string[], sel: typeof pve | { mode: 'pvp' } = pve) {
    const p = provider(hub)
    const host = await p.host(sel, choice('ホスト'), 'kujira-1234')
    const joined: Lobby[] = []
    for (const name of guests) {
      const pending = provider(hub).join('kujira-1234', choice(name, 'rabbit'))
      await run(200)
      joined.push(await pending)
    }
    await run(300)
    return { host, guests: joined }
  }

  it('host + 2 guests: presence, profiles, ready and start', async () => {
    const hub = new FakeHub()
    const { host, guests } = await room(hub, ['ゲストA', 'ゲストB'])
    expect(host.state().code).toBe('kujira-1234')
    expect(host.state().online?.members.map((m) => m.name)).toEqual(['ホスト', 'ゲストA', 'ゲストB'])
    expect(
      guests[0]
        .state()
        .seats.map((s) => s.name)
        .slice(0, 3)
    ).toEqual(['ホスト', 'ゲストA', 'ゲストB'])
    expect(guests[0].state().seats.find((s) => s.local)?.name).toBe('ゲストA')
    expect(guests[1].state().selection).toEqual(pve)
    // not ready yet
    expect(() => host.start()).toThrow(/準備ができていない仲間/)
    guests[0].setReady(true)
    guests[1].setReady(true)
    await run(200)
    expect(host.state().online?.notReady).toEqual([])
    const start = host.start()
    expect(start.config.players.filter((p) => p.bot === undefined)).toHaveLength(3)
    expect(start.config.players).toHaveLength(4)
    await run(200)
    const follow = guests[0].online!.takeMatch()
    expect(follow?.phase).toBe('briefing')
    expect(follow?.start.me).toBe(start.config.players[1].id)
    expect(guests[0].online!.takeMatch()).toBeNull()
    host.leave()
    for (const g of guests) g.leave()
  })

  it('the host picks the mission and difficulty; guests follow', async () => {
    const hub = new FakeHub()
    const { host, guests } = await room(hub, ['ゲスト'])
    host.online!.setSelection({ mode: 'pve', mission: 'harbor', difficulty: 'hard' })
    await run(200)
    expect(guests[0].state().selection).toEqual({ mode: 'pve', mission: 'harbor', difficulty: 'hard' })
    host.leave()
    guests[0].leave()
  })

  it('PvP: three humans on three teams, the host can move people and kick', async () => {
    const hub = new FakeHub()
    const p = provider(hub)
    const host = await p.host({ mode: 'pvp' }, choice('ホスト', 'shiba', 0), 'arena-1111')
    const a = provider(hub).join('arena-1111', choice('アオ', 'cat', 1))
    const b = provider(hub).join('arena-1111', choice('キイ', 'fox', 2))
    await run(300)
    const [ga, gb] = [await a, await b]
    await run(300)
    const teamOf = (name: string) => host.state().seats.find((s) => s.name === name)?.team
    expect([teamOf('ホスト'), teamOf('アオ'), teamOf('キイ')]).toEqual([0, 1, 2])
    expect(host.state().seats).toHaveLength(12)
    const ao = host.state().online!.members.find((m) => m.name === 'アオ')!
    host.online!.moveTeam(ao.id, 0)
    await run(200)
    expect(teamOf('アオ')).toBe(0)
    expect(ga.state().seats.find((s) => s.local)?.team).toBe(0)
    const kii = host.state().online!.members.find((m) => m.name === 'キイ')!
    host.online!.kick(kii.id)
    await run(200)
    expect(gb.state().online?.connection).toBe('closed')
    expect(gb.state().status).toBe('ホストによってルームから外されました。')
    expect(host.state().seats.some((s) => s.name === 'キイ')).toBe(false)
    host.leave()
    ga.leave()
  })

  it('a guest whose admission never arrives reconnects and keeps its seat', async () => {
    const hub = new FakeHub()
    const p = provider(hub)
    const host = await p.host(pve, choice('ホスト'), 'kujira-3333')
    hub.loseNextAdmission = true
    const pending = provider(hub).join('kujira-3333', choice('A'))
    await run(300)
    const guest = await pending
    guest.setReady(true)
    const seatBefore = host.state().seats.find((s) => s.name === 'A')!.id
    const idBefore = guest.state().online!.members.find((m) => m.me)!.id
    await run(18_000, undefined, 100)
    const idAfter = guest.state().online!.members.find((m) => m.me)?.id
    expect(idAfter).toBeDefined()
    expect(idAfter).not.toBe(idBefore)
    expect(guest.state().online?.connection).toBe('online')
    expect(host.state().seats.find((s) => s.name === 'A')!.id).toBe(seatBefore)
    expect(host.state().online?.members.map((m) => m.name)).toEqual(['ホスト', 'A'])
    expect(host.state().online?.notReady).toEqual([])
    host.leave()
    guest.leave()
  })

  it('a guest leaving the lobby frees the seat for a bot', async () => {
    const hub = new FakeHub()
    const { host, guests } = await room(hub, ['ゲストA', 'ゲストB'])
    guests[0].leave()
    await run(200)
    expect(host.state().seats.map((s) => s.name)).not.toContain('ゲストA')
    expect(host.state().seats.filter((s) => s.bot != null)).toHaveLength(2)
    host.leave()
    guests[1].leave()
  })

  it('late joiners spectate once the PvE seats are full', async () => {
    const hub = new FakeHub()
    const { host, guests } = await room(hub, ['B', 'C', 'D', 'E'])
    const e = guests[3].state()
    expect(e.online?.spectating).toBe(true)
    expect(e.status).toMatch(/観戦/)
    host.leave()
    for (const g of guests) g.leave()
  })

  it('the host leaving closes the room for the guests with a Japanese message', async () => {
    const hub = new FakeHub()
    const { host, guests } = await room(hub, ['ゲスト'])
    host.leave()
    await run(200)
    expect(guests[0].state().online?.connection).toBe('closed')
    expect(guests[0].state().status).toBe('ホストがルームを閉じました。')
  })

  it('reports a room that does not exist after the search time', async () => {
    const hub = new FakeHub()
    const pending = provider(hub).join('nobody-0000', choice('ゲスト'))
    const result = pending.then(
      () => 'joined',
      (e: Error) => e.message
    )
    await run(14_000, undefined, 250)
    expect(await result).toBe('ルームが見つかりませんでした。ルームコードを確かめてください。')
  })

  it('reports an unreachable relay', async () => {
    const hub = new FakeHub()
    hub.unreachable = true
    await expect(provider(hub).host(pve, choice('ホスト'), 'kujira-2222')).rejects.toThrow(
      'リレーに接続できませんでした。通信環境を確かめてください。'
    )
  })

  it('rejects bad room codes and training rooms', async () => {
    const hub = new FakeHub()
    const p = provider(hub)
    await expect(p.join('x', choice('ゲスト'))).rejects.toThrow(/3〜32/)
    expect(p.canHost({ mode: 'training' }).ok).toBe(false)
    expect(p.canHost(pve).ok).toBe(true)
  })
})
