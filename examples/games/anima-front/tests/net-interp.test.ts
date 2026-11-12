import { describe, expect, it } from 'vitest'
import { LOCAL_PLAYER_ID } from '../src/app/lobby'
import { buildSeats, matchConfig } from '../src/app/match'
import { createLocalSession } from '../src/app/session'
import { makeLoadout } from '../src/data/loadout'
import { EventQueue, interpolateView, lerpAngle, SnapshotBuffer } from '../src/net/interp'
import { INPUT_BUFFER, InputBuffer } from '../src/net/input-buffer'
import { neutralPlayerInput, type PlayerView, type SimEvent, type View } from '../src/sim/types'

const player = (id: string, x: number, yaw = 0): PlayerView =>
  ({
    id,
    name: id,
    team: 0,
    species: 'shiba',
    bot: false,
    p: [x, 0, 0],
    v: [0, 0, 0],
    yaw,
    pitch: 0,
    shoulder: 1,
    anima: 100,
    maxAnima: 100,
    state: 'alive',
    timer: 0,
    revive: 0,
    invuln: false,
    grounded: true,
    move: 'run',
    hands: [],
    passives: [],
    passivesOnline: true,
    cloak: 0,
    revealed: false,
    burn: 0,
    dashCooldown: 0,
    negateAt: -1,
    stats: {}
  }) as unknown as PlayerView

const view = (tick: number, x: number, events: SimEvent[] = [], extra: Partial<View> = {}): View => ({
  tick,
  time: tick / 60,
  mode: 'pvp',
  map: 'arena',
  phase: 'play',
  clock: 100 - tick / 60,
  players: [player('a', x, x / 10)],
  foes: [],
  shots: [],
  props: [],
  shards: [],
  events,
  ...extra
})

const ev = (id: number, t: number): SimEvent => ({ id, t, type: 'lastSpurt' })

describe('interpolation', () => {
  it('blends positions and angles along the short arc and keeps discrete state from the newer view', () => {
    const a = view(0, 0)
    const b = view(3, 2, [], { phase: 'victory' })
    const m = interpolateView(a, b, 0.25)
    expect(m.players[0].p[0]).toBeCloseTo(0.5)
    expect(m.phase).toBe('victory')
    expect(m.events).toEqual([])
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1)
  })

  it('does not blend teleports', () => {
    const m = interpolateView(view(0, 0), view(3, 40), 0.5)
    expect(m.players[0].p[0]).toBe(40)
  })

  it('samples a snapshot buffer 100 ms behind the estimated host clock', () => {
    const buf = new SnapshotBuffer()
    for (let i = 0; i <= 10; i++) buf.push(view(i * 3, i), i * 0.05 + 0.03)
    expect(buf.push(view(15, 99), 1)).toBe(false)
    const now = 10 * 0.05 + 0.03
    const t = buf.hostTime(now) - 0.1
    const v = buf.sample(t)!
    expect(v.players[0].p[0]).toBeGreaterThan(7.5)
    expect(v.players[0].p[0]).toBeLessThan(8.5)
  })

  it('hands every event out once, in order, when the drawn time reaches it', () => {
    const q = new EventQueue(1)
    q.add([ev(1, 0.1), ev(2, 0.2), ev(3, 0.3)])
    q.add([ev(2, 0.2), ev(3, 0.3), ev(4, 0.4)])
    expect(q.take(0.25).map((e) => e.id)).toEqual([1, 2])
    q.add([ev(1, 0.1), ev(2, 0.2)])
    expect(q.take(1).map((e) => e.id)).toEqual([3, 4])
    q.add([ev(5, 1), ev(6, 3)], 3)
    expect(q.take(5).map((e) => e.id)).toEqual([6])
  })
})

describe('local smoothing', () => {
  it('presents between the last two steps at render rate, events exactly once', () => {
    const sel = { mode: 'pvp' as const }
    const me = {
      id: LOCAL_PLAYER_ID,
      name: 'ハヤテ',
      species: 'shiba' as const,
      loadout: makeLoadout(['bee'], ['orca'], ['koala']),
      loadoutName: 'テスト'
    }
    const s = createLocalSession(matchConfig(sel, buildSeats(sel, me), 3), LOCAL_PLAYER_ID)
    const first = s.update(0)!
    const yaw = first.players.find((q) => q.id === LOCAL_PLAYER_ID)!.yaw
    const ids: number[] = first.events.map((e) => e.id)
    const xs: number[] = []
    for (let i = 0; i < 144 * 6; i++) {
      // run straight toward the plaza
      s.setInput({ ...neutralPlayerInput(), mz: 1, yaw })
      const v = s.update(1 / 144)!
      for (const e of v.events) ids.push(e.id)
      const p = v.players.find((q) => q.id === LOCAL_PLAYER_ID)!.p
      xs.push(Math.hypot(p[0], p[2]))
    }
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(5)
    // at 144 Hz the drawn position moves on every frame by an even amount (not in 60 Hz jumps)
    const tail = xs.slice(-200)
    const deltas = tail.slice(1).map((x, i) => tail[i] - x)
    expect(Math.min(...deltas)).toBeGreaterThan(0.03)
    expect(Math.max(...deltas)).toBeLessThan(0.065)
  }, 30_000)
})

describe('host input buffer', () => {
  const input = (mz: number) => ({ ...neutralPlayerInput(), mz })

  it('replays each input for exactly the ticks the guest predicted, whatever the arrival jitter', () => {
    const buf = new InputBuffer(1, 1, input(0.1), 0)
    const used: number[] = []
    const ticks: number[] = []
    let next = 3
    // arrivals in bursts: 0, 2 or 1 messages per host step
    const pattern = [1, 0, 0, 2, 0, 1, 0, 0, 0, 2, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0]
    for (let step = 0; step < 60; step++) {
      for (let k = 0; k < pattern[step % pattern.length]; k++) {
        buf.push(next, input(next / 10), step)
        next += 2
      }
      used.push(buf.next(false, input(0)).mz)
      ticks.push(buf.cursor)
    }
    // the cursor starts INPUT_BUFFER ticks behind and then follows the guest's ticks one by one
    expect(ticks[0]).toBe(1 - INPUT_BUFFER)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeLessThanOrEqual(1)
    // every tick c uses the input sent for it (inputs start at odd ticks and last two ticks)
    for (let i = 0; i < ticks.length; i++) {
      const c = ticks[i]
      if (c < 1) continue
      const g = c % 2 === 1 ? c : c - 1
      expect(used[i]).toBeCloseTo(g === 1 ? 0.1 : g / 10)
    }
  })

  it('jumps ahead when inputs pile up (a host stepping slower than real time)', () => {
    const buf = new InputBuffer(1, 1, input(0), 0)
    for (let g = 3; g < 200; g += 2) buf.push(g, input(g), 0)
    buf.next(false, input(0))
    expect(buf.newestTick + 1 - buf.cursor).toBe(INPUT_BUFFER)
    expect(buf.next(false, input(0)).mz).toBe(199)
  })

  it('lets go of the controls when expired, keeping the counters', () => {
    const buf = new InputBuffer(1, 1, { ...input(1), held: 5, presses: { r: 2, l: 0, jump: 3, dash: 1 } }, 0)
    for (let i = 0; i < 4; i++) buf.next(false, input(0))
    const out = buf.next(true, input(0))
    expect(out.mz).toBe(0)
    expect(out.held).toBe(0)
    expect(out.presses).toEqual({ r: 2, l: 0, jump: 3, dash: 1 })
  })
})
