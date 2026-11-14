/**
 * The PvP information boundary (DESIGN §18): sealing round trips, team keys (rotation on leave and team change,
 * spectators), the bytes a team-1 guest can read never holding hidden team-2 players, and the snapshot size and
 * host time per snapshot with 12 players.
 */
import { deflateRawSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSeats, matchConfig } from '../src/app/match'
import type { GuestMatch } from '../src/net/guest-match'
import { GuestRoom } from '../src/net/guest-room'
import { HostRoom } from '../src/net/host-room'
import { partAad, type RoomMsg, type SnapMsg, type TransportFactory } from '../src/net/protocol'
import { fromB64, newEcdh, randomBytes, sealJson, teamKey, toB64, unsealJson, wrapKey } from '../src/net/seal'
import { Fog, FADE } from '../src/net/fog'
import { hiddenPlayer, mergeView, splitView, type TeamPart } from '../src/net/split'
import { TeamVisibility } from '../src/net/visibility'
import { createWorld, type World } from '../src/sim/api'
import type { MatchConfig, PlayerView, SimEvent, TeamId, V3, View } from '../src/sim/types'
import { simOf } from '../src/sim/world'
import { choice, FakeHub, run, settle } from './net-helpers'

afterEach(() => {
  vi.useRealTimers()
})

describe('sealing', () => {
  it('team parts round-trip and fail with another key or another slot', async () => {
    const k1 = await teamKey(randomBytes(32))
    const k2 = await teamKey(randomBytes(32))
    const part = { p: [{ id: 'x', p: [1, 2, 3] }], e: [], a: {} }
    const sealed = await sealJson(k1, part, partAad(1, 1, 0, 10))
    expect(sealed).not.toContain('"x"')
    expect(await unsealJson(k1, sealed, partAad(1, 1, 0, 10))).toEqual(part)
    await expect(unsealJson(k2, sealed, partAad(1, 1, 0, 10))).rejects.toThrow()
    await expect(unsealJson(k1, sealed, partAad(1, 1, 0, 11))).rejects.toThrow()
    await expect(unsealJson(k1, sealed, partAad(1, 1, 1, 10))).rejects.toThrow()
    expect(toB64(fromB64(sealed))).toBe(sealed)
  })

  it('host and guest derive the same wrapping key from ECDH; a third party does not', async () => {
    const host = await newEcdh()
    const guest = await newEcdh()
    const other = await newEcdh()
    const a = await wrapKey(host.priv, guest.pub, 'room-1', 'g1')
    const b = await wrapKey(guest.priv, host.pub, 'room-1', 'g1')
    const c = await wrapKey(other.priv, host.pub, 'room-1', 'g1')
    const sealed = await sealJson(a, { ok: 1 }, 'x')
    expect(await unsealJson(b, sealed, 'x')).toEqual({ ok: 1 })
    await expect(unsealJson(c, sealed, 'x')).rejects.toThrow()
    // bound to the member id
    const d = await wrapKey(guest.priv, host.pub, 'room-1', 'g2')
    await expect(unsealJson(d, sealed, 'x')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------------------------------------------
// A PvP room with real HostRoom / GuestRoom objects on the in-memory hub

const now = () => performance.now() / 1000

/** Records every raw host message each guest receives (what the guest's machine can read). */
function recording(hub: FakeHub, log: Map<string, unknown[]>): TransportFactory {
  return (o) =>
    hub.transport({
      ...o,
      onSnapshot: (raw) => {
        if (!log.has(o.playerId)) log.set(o.playerId, [])
        log.get(o.playerId)!.push(raw)
        o.onSnapshot(raw)
      }
    })
}

interface Pins {
  /** Player id → where the world keeps it (feet), or undefined to let it roam. */
  at: Map<string, V3>
}

/** A world whose players stay where the test pins them (bots keep aiming and shooting from there). */
function pinnedWorld(pins: Pins) {
  return (c: MatchConfig): World => {
    const world = createWorld(c)
    const sim = simOf(world)
    const pin = () => {
      for (const p of sim.players) {
        const at = pins.at.get(p.id)
        if (!at) continue
        p.p = [at[0], at[1], at[2]]
        p.v = [0, 0, 0]
      }
    }
    pin()
    const step = world.step.bind(world)
    world.step = (inputs) => {
      step(inputs)
      pin()
    }
    return world
  }
}

async function pvpRoom(code: string, pins: Pins, guests: { name: string; team: TeamId }[]) {
  const hub = new FakeHub()
  const log = new Map<string, unknown[]>()
  const transport = recording(hub, log)
  const host = new HostRoom({
    code,
    relayUrl: 'https://relay.test/anon',
    selection: { mode: 'pvp' },
    me: choice('ホスト', 'shiba', 0),
    transport,
    peerId: 'hostpeer',
    now,
    makeWorld: pinnedWorld(pins)
  })
  await settle(host.open())
  const rooms: GuestRoom[] = []
  for (const [i, g] of guests.entries()) {
    const room = new GuestRoom({
      code,
      relayUrl: 'https://relay.test/anon',
      me: choice(g.name, 'cat', g.team),
      transport,
      peerId: `guest${i}`,
      now
    })
    await settle(room.open())
    room.setReady(true)
    rooms.push(room)
  }
  await run(1500)
  return { hub, log, host, rooms }
}

const keysOf = (room: GuestRoom) =>
  (room as unknown as { teamKeys: Map<number, { team: TeamId; key: CryptoKey }> }).teamKeys

/** Everything this guest can read in one host message: the public part and its own team's part. */
async function readable(room: GuestRoom, raw: unknown): Promise<{ pub: SnapMsg; part: TeamPart } | null> {
  const msg = raw as SnapMsg
  if (msg.k !== 'snap' || !msg.s) return null
  const k = keysOf(room).get(msg.g!)
  if (!k) return null
  const part = (await unsealJson(k.key, msg.s[k.team]!, partAad(msg.m, msg.g!, k.team, msg.view.tick))) as TeamPart
  // The other teams' parts are unreadable with this guest's key.
  for (const [team, sealed] of Object.entries(msg.s))
    if (Number(team) !== k.team)
      await expect(
        unsealJson(k.key, sealed!, partAad(msg.m, msg.g!, Number(team) as TeamId, msg.view.tick))
      ).rejects.toThrow()
  return { pub: msg, part }
}

/** Every [x, y, z] number triple in a JSON value. */
function triples(value: unknown, out: number[][] = []): number[][] {
  if (Array.isArray(value)) {
    if (value.length === 3 && value.every((n) => typeof n === 'number')) out.push(value as number[])
    for (const x of value) triples(x, out)
  } else if (value && typeof value === 'object') for (const x of Object.values(value)) triples(x, out)
  return out
}

describe('snapshot split', () => {
  const cfg = (id: string, team: TeamId) => ({ id, name: id, team, species: 'cat' as const, loadout: [] as never })
  const config = { mode: 'pvp', map: 'arena', seed: 1, players: [cfg('a', 0), cfg('e', 1), cfg('f', 1)] } as MatchConfig
  const pv = (id: string, team: TeamId, p: V3, extra: Partial<PlayerView> = {}): PlayerView => ({
    ...hiddenPlayer(cfg(id, team), undefined, undefined),
    state: 'alive',
    p,
    ...extra
  })
  const ev = (e: Record<string, unknown>, id: number) => ({ id, t: 1, ...e }) as unknown as SimEvent
  const base: View = {
    tick: 60,
    time: 1,
    mode: 'pvp',
    map: 'arena',
    phase: 'play',
    clock: 300,
    players: [
      pv('a', 0, [0, 0, 0], { revealedTo: [0, 2], revealed: true }),
      pv('e', 1, [50, 0, 50], { revealedTo: [2], revealed: true }),
      pv('f', 1, [3, 0, 3])
    ],
    foes: [],
    shots: [
      { id: 1, kind: 'bee', team: 1, p: [49, 1, 49], v: [0, 0, -40], owner: 'e' },
      { id: 2, kind: 'bee', team: 1, p: [5, 1, 5], v: [0, 0, -40], owner: 'e' },
      { id: 3, kind: 'bee', team: 1, p: [3, 1, 4], v: [0, 0, -40], owner: 'f' }
    ],
    props: [{ id: 9, kind: 'hermit', p: [10, 0, 10], yaw: 0, team: 1, t: 1, owner: 'e' }],
    shards: [
      { id: 4, p: [49, 1, 49], amount: 1, to: 'e' },
      { id: 5, p: [20, 0, 20], amount: 1 }
    ],
    events: [
      ev({ type: 'fire', who: 'e', item: 'bee', from: [50, 1, 50], dir: [0, 0, 1] }, 1),
      ev({ type: 'hit', target: 'a', targetKind: 'player', by: 'e', amount: 5, at: [0, 1, 0], surface: 'fur' }, 2),
      ev({ type: 'ko', who: 'a', by: 'e', assists: [] }, 3),
      ev({ type: 'impact', at: [1, 1, 1], normal: [0, 1, 0], surface: 'concrete', item: 'bee' }, 4),
      ev({ type: 'jump', who: 'f', air: false }, 5)
    ]
  }

  it('keeps unseen enemies, their shots, shards and events out of a team part and the public part', () => {
    const sets = new Map<TeamId, Set<string>>([
      [0, new Set(['a', 'f'])],
      [1, new Set(['e', 'f'])],
      [2, new Set(['e'])]
    ])
    const { pub, roster, parts } = splitView(base, sets, { a: [1, 2], e: [3, 4] }, config)
    expect(pub.players).toEqual([])
    expect(pub.shots).toEqual([])
    expect(pub.props[0].owner).toBeUndefined()
    expect(pub.shards.map((s) => s.id)).toEqual([5])
    expect(pub.events.map((e) => e.type)).toEqual(['ko', 'impact'])
    expect(roster.map((r) => r[0])).toEqual(['a', 'e', 'f'])
    const red = parts.get(0)!
    expect(red.p.map((p) => p.id)).toEqual(['a', 'f'])
    expect(red.a).toEqual({ a: [1, 2] })
    // e's far shot is gone; the one near a arrives without its owner; f's keeps it
    expect(red.s!.map((s) => [s.id, s.owner])).toEqual([
      [2, undefined],
      [3, 'f']
    ])
    expect(red.d).toBeUndefined()
    // the hit on a stays (without the hidden shooter); e's fire is dropped
    expect(red.e.map((e) => e.type)).toEqual(['hit', 'jump'])
    expect('by' in red.e[0]).toBe(false)
    // sonar: a is revealed to team 0's view only as far as team 0 made it; no one learns who else did
    expect(red.p[0].revealed).toBe(true)
    expect(red.p[0].revealedTo).toBeUndefined()
    expect(parts.get(2)!.p.find((p) => p.id === 'e')!.revealed).toBe(true)
    expect(parts.get(1)!.p.find((p) => p.id === 'e')!.revealed).toBe(false)
    expect(JSON.stringify(red)).not.toMatch(/"(id|owner|by|to|who|target|reviving)":"e"/)
  })

  it('a guest merges the parts; unseen enemies are off the field and fade instead of popping', () => {
    const sets = new Map<TeamId, Set<string>>([[0, new Set(['a', 'e', 'f'])]])
    const fog = new Fog(0)
    const first = splitView(base, sets, {}, config)
    const m1 = mergeView(first.pub, first.roster, first.parts.get(0)!, config, (id) => fog.lastOf(id))
    fog.observe(m1.view, m1.hidden)
    expect(m1.view.players.map((p) => p.state)).toEqual(['alive', 'alive', 'alive'])
    // 50 ms later e is out of sight
    const later = { ...base, time: 1.05, tick: 63, events: [] }
    const second = splitView(later, new Map([[0, new Set(['a', 'f'])]]), {}, config)
    const m2 = mergeView(second.pub, second.roster, second.parts.get(0)!, config, (id) => fog.lastOf(id))
    fog.observe(m2.view, m2.hidden)
    const e2 = m2.view.players.find((p) => p.id === 'e')!
    expect(e2.state).toBe('away')
    expect(e2.p).toEqual([50, 0, 50]) // where the team last saw it, nothing newer
    const at = (t: number) => fog.present(m2.view, m2.hidden, t).players.find((p) => p.id === 'e')!
    expect(at(1.1).state).toBe('alive')
    expect(at(1.1).cloak).toBeGreaterThan(0)
    expect(at(1 + FADE * 0.9).cloak).toBeGreaterThan(0.8)
    expect(at(1 + FADE + 0.01).state).toBe('away')
    // back in sight: fades in where it is now
    const back = {
      ...base,
      time: 2,
      tick: 120,
      events: [],
      players: base.players.map((p) => (p.id === 'e' ? { ...p, p: [30, 0, 30] as V3 } : p))
    }
    const third = splitView(back, sets, {}, config)
    const m3 = mergeView(third.pub, third.roster, third.parts.get(0)!, config, (id) => fog.lastOf(id))
    fog.observe(m3.view, m3.hidden)
    const e3 = fog.present(m3.view, m3.hidden, 1.99).players.find((p) => p.id === 'e')!
    expect(e3.p).toEqual([30, 0, 30])
    expect(e3.cloak).toBeGreaterThan(0.5)
    expect(fog.present(m3.view, m3.hidden, 2.5).players.find((p) => p.id === 'e')!.cloak).toBe(0)
  })
})

describe('PvP snapshots between teams', () => {
  it('a team-1 guest never receives hidden team-2 players, and receives them once in sight', async () => {
    vi.useFakeTimers()
    const config = matchConfig(
      { mode: 'pvp' },
      buildSeats({ mode: 'pvp' }, { id: 'h0', ...choice('ホスト', 'shiba', 0) }),
      1
    )
    const map = createWorld(config).map
    const base = (t: TeamId) => map.bases.find((b) => b.team === t)!.p
    // Everyone stands in their own base (spread a little); team 2's base is out of team 1's sight.
    const pins: Pins = { at: new Map() }
    const { host, rooms, log } = await pvpRoom('secret-1234', pins, [
      { name: 'アオ', team: 1 },
      { name: 'キイ', team: 2 }
    ])
    const start = host.start()
    for (const p of start.config.players) {
      const b = base(p.team)
      const i = start.config.players.filter((q) => q.team === p.team).indexOf(p)
      pins.at.set(p.id, [b[0] + (i - 1.5) * 1.5, b[1], b[2]])
    }
    await run(1500)
    const hs = start.connect()
    const [blue, yellow] = rooms
    const blueStart = blue.matchStart()!
    const gs = blueStart.connect()
    const ys = yellow.matchStart()!.connect()
    const blueSeat = (gs as unknown as GuestMatch).seat!
    const team2 = start.config.players.filter((p) => p.team === 2).map((p) => p.id)
    await run(8000, () => {
      hs.update(1 / 60)
      gs.update(1 / 60)
      ys.update(1 / 60)
    })
    expect(blue.keyTeam).toBe(1)
    expect(yellow.keyTeam).toBe(2)

    // Phase 1: team 2 hidden. Check every message the blue guest got.
    const raws = log.get(blue.myId)!.splice(0)
    let snaps = 0
    for (const raw of raws) {
      const r = await readable(blue, raw)
      if (!r) {
        // lobby state: no positions at all
        if ((raw as RoomMsg).k === 'room') expect(triples(raw)).toEqual([])
        continue
      }
      snaps++
      expect(r.pub.view.players).toEqual([])
      const ids = r.part.p.map((p) => p.id)
      for (const id of team2) expect(ids).not.toContain(id)
      expect(ids).toContain(blueSeat)
      // no id of a hidden player outside the kill feed, no point near where they stand
      // (map fixtures such as the bases and pads are public and fixed)
      const noFeed = {
        ...r.pub,
        view: {
          ...r.pub.view,
          props: r.pub.view.props.filter((x) => x.kind !== 'base' && x.kind !== 'pad'),
          events: r.pub.view.events.filter((e) => e.type !== 'ko')
        }
      }
      const text = JSON.stringify([noFeed, r.part])
      for (const id of team2) expect(text).not.toContain(`"${id}"`)
      for (const id of team2) {
        const at = pins.at.get(id)!
        for (const t of triples([noFeed, r.part]))
          expect(Math.hypot(t[0] - at[0], t[2] - at[2]) < 2 && Math.abs(t[1] - at[1]) < 3).toBe(false)
      }
    }
    expect(snaps).toBeGreaterThan(50)
    // the blue guest's screen: team 2 off the field
    const bv = gs.update(1 / 60)!
    for (const id of team2) expect(bv.players.find((p) => p.id === id)!.state).toBe('away')
    expect(bv.players).toHaveLength(12)

    // Phase 2: one team-2 player walks out in front of team 1's base.
    const walker = team2[team2.length - 1]
    const b1 = base(1)
    const out: V3 = [b1[0] * 0.85, 0, b1[2] * 0.85]
    pins.at.set(walker, out)
    // (team 1 shoots it down soon after: it only has to show up on the blue screen, where it stands)
    let seen: PlayerView | undefined
    let fading = 0
    await run(2000, () => {
      hs.update(1 / 60)
      const p = gs.update(1 / 60)!.players.find((q) => q.id === walker)
      if (!seen && p?.state === 'alive') seen = p
      if (p?.state === 'alive' && p.cloak > 0.05 && p.cloak < 0.95) fading++
      ys.update(1 / 60)
    })
    expect(seen?.state).toBe('alive')
    expect(Math.hypot(seen!.p[0] - out[0], seen!.p[2] - out[2])).toBeLessThan(0.5)
    // it fades in instead of popping
    expect(fading).toBeGreaterThan(5)
    const later = log.get(blue.myId)!.splice(0)
    let found = false
    for (const raw of later) {
      const r = await readable(blue, raw)
      if (r?.part.p.some((p) => p.id === walker)) found = true
    }
    expect(found).toBe(true)
    // the other hidden team-2 players are still not in the bytes
    for (const raw of later) {
      const r = await readable(blue, raw)
      if (!r) continue
      for (const id of team2) if (id !== walker) expect(r.part.p.map((p) => p.id)).not.toContain(id)
    }
    hs.dispose()
    host.close()
    for (const r of rooms) r.close()
  }, 120_000)

  it('team keys rotate per match, when a holder leaves and when a spectator changes team', async () => {
    vi.useFakeTimers()
    const { host, rooms } = await pvpRoom('rotate-1234', { at: new Map() }, [
      { name: 'アオ', team: 1 },
      { name: 'キイ', team: 2 },
      { name: 'ミル', team: 0 }
    ])
    const [blue, yellow, watcher] = rooms
    const gen = () => host.roomMsg().keys?.g
    expect(gen()).toBeUndefined()
    const start = host.start()
    await run(1500)
    const g1 = gen()!
    expect(g1).toBeGreaterThan(0)
    expect(blue.keyTeam).toBe(1)
    expect(yellow.keyTeam).toBe(2)
    expect(watcher.keyTeam).toBe(0)
    // every member's wrapped key is different and only its own
    const w = host.roomMsg().keys!.w
    expect(Object.keys(w).sort()).toEqual([blue.myId, yellow.myId, watcher.myId].sort())

    // the third guest becomes a spectator (all seats taken): it follows team 0 by default, then team 2
    host.matchSeatOf.set(watcher.myId, null)
    host.changed()
    await run(1000)
    expect(watcher.keyTeam).toBe(0)
    const before = gen()!
    watcher.setFollowTeam(2)
    await run(1500)
    expect(gen()).toBeGreaterThan(before)
    expect(watcher.keyTeam).toBe(2)
    expect(blue.keyTeam).toBe(1)

    // a holder leaves: new keys that the leaver never gets
    const beforeLeave = gen()!
    yellow.close()
    await run(1500)
    expect(gen()).toBeGreaterThan(beforeLeave)
    expect(Object.keys(host.roomMsg().keys!.w)).not.toContain(yellow.myId)
    expect(keysOf(yellow).has(gen()!)).toBe(false)
    expect(blue.keyTeam).toBe(1)

    // a new match: new keys again
    const hs = start.connect()
    hs.dispose()
    await run(500)
    expect(host.roomMsg().keys).toBeUndefined()
    const last = gen() ?? beforeLeave
    host.start()
    await run(1500)
    expect(gen()).toBeGreaterThan(last)
    host.close()
    for (const r of rooms) r.close()
  }, 60_000)
})

describe('PvP snapshot cost with 12 players', () => {
  it('stays under the 64 KiB compressed limit; host time per snapshot', async () => {
    const config = matchConfig(
      { mode: 'pvp' },
      buildSeats({ mode: 'pvp' }, { id: 'h0', ...choice('ホスト', 'shiba', 0) }),
      7
    )
    // every seat a strong bot; a short match so the results are included
    for (const p of config.players) p.bot = 0.9
    const world = createWorld({ ...config, duration: 70, countdown: 0 })
    const vis = new TeamVisibility(world.map)
    const keys = await Promise.all([0, 1, 2].map(() => teamKey(randomBytes(32))))
    let events: View['events'] = []
    const sizes: number[] = []
    const syncMs: number[] = []
    const sealMs: number[] = []
    const rays: number[] = []
    let results = 0
    for (let tick = 1; tick <= 60 * 80; tick++) {
      world.step(new Map())
      const v = world.view()
      events.push(...v.events)
      if (tick % 3) continue
      const t0 = performance.now()
      const sets = vis.update(v, events)
      const split = splitView({ ...v, events }, sets, {}, config)
      const t1 = performance.now()
      const s: Partial<Record<TeamId, string>> = {}
      for (const [team, part] of split.parts) s[team] = await sealJson(keys[team], part, partAad(1, 1, team, v.tick))
      const t2 = performance.now()
      syncMs.push(t1 - t0)
      sealMs.push(t2 - t1)
      rays.push(vis.rays)
      const msg: SnapMsg = { v: 1, k: 'snap', m: 1, over: false, ack: {}, view: split.pub, r: split.roster, g: 1, s }
      const text = JSON.stringify({ v: 2, type: 'snapshot', sequence: 0, playerId: 'host', data: msg })
      sizes.push(deflateRawSync(Buffer.from(text)).length)
      if (['victory', 'defeat', 'draw'].includes(v.phase)) results++
      events = []
    }
    const q = (a: number[], k: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * k)]
    const report = {
      snapshots: sizes.length,
      results,
      bytesMedian: q(sizes, 0.5),
      bytesMax: Math.max(...sizes),
      visSplitMsMedian: +q(syncMs, 0.5).toFixed(3),
      visSplitMsP99: +q(syncMs, 0.99).toFixed(3),
      sealMsMedian: +q(sealMs, 0.5).toFixed(3),
      sealMsP99: +q(sealMs, 0.99).toFixed(3),
      raysMedian: q(rays, 0.5),
      raysMax: Math.max(...rays)
    }
    console.log('pvp snapshot cost', report)
    expect(results).toBeGreaterThan(0)
    expect(report.bytesMax).toBeLessThan(64 * 1024)
  }, 300_000)
})
