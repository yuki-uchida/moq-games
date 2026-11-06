import { describe, expect, it, vi } from 'vitest'
import { HorrorMatch } from '../src/match'
import { RITUAL_STEPS } from '../src/ritual'
import {
  acceptRitual,
  freshSnapshot,
  receiveEffect,
  requestRitual,
  ritualForMatch,
  validEffect,
  type EffectEvent
} from '../src/sync'

describe('authoritative ritual synchronization', () => {
  it('checks actor, distance, pause, round and preserves scores', () => {
    const match = new HorrorMatch()
    match.start()
    let snapshot = match.getSnapshot()
    let state = ritualForMatch(null, snapshot)!
    const step = RITUAL_STEPS[0]
    const pose = { x: step.x, z: step.z, yaw: 0 }
    expect(requestRitual(state, snapshot, 'guest', pose, 'round1', step.id)).toBeNull()
    expect(requestRitual(state, snapshot, 'host', { ...pose, x: 0 }, 'round1', step.id)).toBeNull()
    expect(requestRitual(state, { ...snapshot, paused: true }, 'host', pose, 'round1', step.id)).toBeNull()
    state = requestRitual(state, snapshot, 'host', pose, 'round1', step.id)!
    expect(acceptRitual(state, { round: 'round1', completed: 0 }, snapshot)).toBe(false)
    expect(match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
    match.tick(900000)
    expect(ritualForMatch(state, match.getSnapshot())).toBeNull()
    match.startSecondRound()
    snapshot = match.getSnapshot()
    expect(acceptRitual(null, state, snapshot)).toBe(false)
    state = ritualForMatch(state, snapshot)!
    expect(requestRitual(state, snapshot, 'guest', pose, 'round1', step.id)).toBeNull()
    expect(requestRitual(state, snapshot, 'host', pose, 'round2', step.id)).toBeNull()
    expect(requestRitual(state, snapshot, 'guest', pose, 'round2', step.id)?.completed).toBe(1)
    expect(match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
  })

  it('rejects stale snapshots and malformed sequence', () => {
    const match = new HorrorMatch()
    match.start()
    const snapshot = match.getSnapshot()
    expect(freshSnapshot(snapshot, snapshot, 4, 4)).toBe(false)
    expect(freshSnapshot(snapshot, snapshot, 4, 5.5)).toBe(false)
    expect(freshSnapshot({ ...snapshot, elapsedMs: 2 }, snapshot, 4, 5)).toBe(false)
    expect(freshSnapshot({ ...snapshot, phase: 'round2' }, snapshot, 4, 5)).toBe(false)
  })
})

describe('monotonic effect playback', () => {
  describe.each(['lobby', 'intermission', 'finished'] as const)('outside play: %s', (phase) => {
    it.each(['apparition', 'blackout', 'rattle'] as const)(
      'rejects %s without consuming IDs or suppressing the next valid event',
      (kind) => {
        const match = new HorrorMatch()
        const snapshot = { ...match.getSnapshot(), phase }
        const invalid = { id: 99, round: phase, kind, elapsedMs: 0 }
        const stopped = { seen: 0, effect: null }
        const received = receiveEffect(stopped, invalid as unknown as EffectEvent, snapshot, 10000)
        expect(received).toEqual({ playback: stopped, playSound: false })
        expect(validEffect(invalid, snapshot)).toBe(false)
        expect(
          receiveEffect({ seen: 7, effect: { kind, startedAt: 9 } }, invalid as unknown as EffectEvent, snapshot, 10000)
        ).toEqual({ playback: { seen: 7, effect: null }, playSound: false })
        match.start()
        const next: EffectEvent = { id: 1, round: 'round1', kind, elapsedMs: 0 }
        expect(receiveEffect(received.playback, next, match.getSnapshot(), 11000)).toEqual({
          playback: {
            seen: 1,
            effect: { kind, startedAt: 11, ...(kind === 'apparition' ? { id: 1 } : {}) }
          },
          playSound: true
        })
      }
    )

    it('still accepts null and clears playback without advancing seen', () => {
      const snapshot = { ...new HorrorMatch().getSnapshot(), phase }
      expect(validEffect(null, snapshot)).toBe(true)
      expect(receiveEffect({ seen: 7, effect: { kind: 'blackout', startedAt: 9 } }, null, snapshot, 10000)).toEqual({
        playback: { seen: 7, effect: null },
        playSound: false
      })
    })
  })

  describe.each(['round1', 'round2'] as const)('during play: %s', (round) => {
    it.each(['apparition', 'blackout', 'rattle'] as const)('still accepts and plays %s', (kind) => {
      const match = new HorrorMatch()
      match.start()
      if (round === 'round2') {
        match.tick(900000)
        match.startSecondRound()
      }
      const snapshot = match.getSnapshot()
      const event: EffectEvent = { id: 1, round, kind, elapsedMs: 0 }
      expect(validEffect(event, snapshot)).toBe(true)
      expect(receiveEffect({ seen: 0, effect: null }, event, snapshot, 10000)).toEqual({
        playback: {
          seen: 1,
          effect: { kind, startedAt: 10, ...(kind === 'apparition' ? { id: 1 } : {}) }
        },
        playSound: true
      })
    })
  })

  it('carries the accepted apparition ID on both clocks without changing events or other effects', () => {
    const match = new HorrorMatch()
    match.start()
    match.tick(1500)
    const snapshot = match.getSnapshot()
    const event: EffectEvent = Object.freeze({ id: 8, round: 'round1', kind: 'apparition', elapsedMs: 1000 })
    for (const nowMs of [25000, 900000]) {
      const received = receiveEffect({ seen: 0, effect: null }, event, snapshot, nowMs)
      expect(received.playback).toEqual({
        seen: 8,
        effect: { kind: 'apparition', startedAt: (nowMs - 500) / 1000, id: 8 }
      })
      expect(nowMs / 1000 - received.playback.effect!.startedAt).toBe(0.5)
      expect(received.playSound).toBe(true)
      for (const kind of ['blackout', 'rattle'] as const) {
        const other = receiveEffect({ seen: 0, effect: null }, { ...event, kind }, snapshot, nowMs)
        expect(other).toEqual({
          playback: { seen: 8, effect: { kind, startedAt: (nowMs - 500) / 1000 } },
          playSound: true
        })
      }
    }
    expect(event).toEqual({ id: 8, round: 'round1', kind: 'apparition', elapsedMs: 1000 })
    expect(match.getSnapshot()).toEqual(snapshot)
    expect(
      receiveEffect({ seen: 0, effect: null }, { ...event, id: Number.MAX_SAFE_INTEGER }, snapshot, 10000).playback
        .effect?.id
    ).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('preserves IDs through reordering and interruption without replaying a stopped event', () => {
    const match = new HorrorMatch()
    match.start()
    match.tick(1000)
    const snapshot = match.getSnapshot()
    const event: EffectEvent = { id: 8, round: 'round1', kind: 'apparition', elapsedMs: 500 }
    const accepted = receiveEffect({ seen: 0, effect: null }, event, snapshot, 10000).playback
    for (const id of [8, 7, 1]) {
      const received = receiveEffect(accepted, { ...event, id }, { ...snapshot, elapsedMs: 1500 }, 10500)
      expect(received.playback).toBe(accepted)
      expect(received.playSound).toBe(false)
    }
    const stopped = receiveEffect(accepted, null, { ...snapshot, paused: true }, 10500).playback
    expect(stopped).toEqual({ seen: 8, effect: null })
    expect(receiveEffect(stopped, event, snapshot, 11000)).toEqual({ playback: stopped, playSound: false })
    const next = receiveEffect(stopped, { ...event, id: 9, elapsedMs: 1000 }, snapshot, 11000)
    expect(next).toEqual({
      playback: { seen: 9, effect: { kind: 'apparition', startedAt: 11, id: 9 } },
      playSound: true
    })
    for (const id of [undefined, null, '9', true, 0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = { ...event, id }
      expect(validEffect(invalid, snapshot)).toBe(false)
      expect(receiveEffect(accepted, invalid as EffectEvent, snapshot, 10000)).toEqual({
        playback: { seen: 8, effect: null },
        playSound: false
      })
    }
    expect(receiveEffect(accepted, event, { ...snapshot, paused: true }, 10000).playback).toEqual({
      seen: 8,
      effect: null
    })
    expect(receiveEffect(accepted, event, { ...snapshot, phase: 'round2' }, 10000).playback).toEqual({
      seen: 8,
      effect: null
    })
  })

  it('keeps the 3500ms lifetime and rejects nonfinite playback clocks', () => {
    const match = new HorrorMatch()
    match.start()
    const event: EffectEvent = { id: 2, round: 'round1', kind: 'apparition', elapsedMs: 1000 }
    for (const age of [0, 500, 3499, 3500, 3501]) {
      const snapshot = { ...match.getSnapshot(), elapsedMs: event.elapsedMs + age }
      const received = receiveEffect({ seen: 0, effect: null }, event, snapshot, 10000)
      expect(received).toEqual({
        playback: {
          seen: 2,
          effect: age < 3500 ? { kind: 'apparition', startedAt: (10000 - age) / 1000, id: 2 } : null
        },
        playSound: age < 3500
      })
    }
    for (const nowMs of [NaN, Infinity, -Infinity]) {
      expect(
        receiveEffect({ seen: 0, effect: null }, event, { ...match.getSnapshot(), elapsedMs: 1500 }, nowMs)
      ).toEqual({
        playback: { seen: 2, effect: null },
        playSound: false
      })
    }
  })

  it('uses elapsed time and never restarts on retransmission', () => {
    const match = new HorrorMatch()
    match.start()
    match.tick(1200)
    const snapshot = match.getSnapshot()
    const event: EffectEvent = { id: 1, round: 'round1', kind: 'blackout', elapsedMs: 1000 }
    for (const monotonicNow of [10000, 900000]) {
      const received = receiveEffect({ seen: 0, effect: null }, event, snapshot, monotonicNow)
      expect(received.playSound).toBe(true)
      expect(received.playback.effect!.startedAt).toBe((monotonicNow - 200) / 1000)
      const resent = receiveEffect(received.playback, event, { ...snapshot, elapsedMs: 2000 }, monotonicNow + 800)
      expect(resent.playSound).toBe(false)
      expect(resent.playback).toEqual(received.playback)
      expect((monotonicNow + 3300) / 1000 - received.playback.effect!.startedAt).toBeCloseTo(3.5)
      const stopped = receiveEffect(received.playback, null, { ...snapshot, paused: true }, monotonicNow)
      expect(receiveEffect(stopped.playback, event, snapshot, monotonicNow + 1000).playback.effect).toBeNull()
    }
    expect(receiveEffect({ seen: 0, effect: null }, event, { ...snapshot, elapsedMs: 4500 }, 100).playSound).toBe(false)
    expect(validEffect({ ...event, elapsedMs: 1300 }, snapshot)).toBe(false)
    expect(validEffect(event, { ...snapshot, phase: 'round2' })).toBe(false)
  })

  it('ignores wall clocks offset by minutes', () => {
    const match = new HorrorMatch()
    match.start()
    match.tick(500)
    const snapshot = match.getSnapshot()
    const event: EffectEvent = { id: 1, round: 'round1', kind: 'apparition', elapsedMs: 0 }
    const clock = vi.spyOn(Date, 'now')
    try {
      clock.mockReturnValue(1_000_000 - 300_000)
      const host = receiveEffect({ seen: 0, effect: null }, event, snapshot, 10000)
      clock.mockReturnValue(1_000_000 + 300_000)
      const guest = receiveEffect({ seen: 0, effect: null }, event, snapshot, 10000)
      expect(host).toEqual(guest)
      expect(host.playback.effect?.startedAt).toBe(9.5)
    } finally {
      clock.mockRestore()
    }
  })
})
