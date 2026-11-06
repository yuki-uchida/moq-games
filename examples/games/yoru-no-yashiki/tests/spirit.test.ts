import { describe, expect, it } from 'vitest'
import { HorrorMatch } from '../src/match'
import { acceptSpirit, requestSpirit, spiritForMatch, spiritStatus } from '../src/spirit'
import { HAUNTER_START, HUMAN_START, movePose } from '../src/world'

describe('authoritative spirit', () => {
  it.each([
    ['round1', 'guest', 'host'],
    ['round2', 'host', 'guest']
  ] as const)('walks from the haunter start to use apparition in %s', (round, actor, survivor) => {
    const match = new HorrorMatch()
    match.start()
    if (round === 'round2') {
      match.tick(900000)
      match.startSecondRound()
    }
    let snapshot = match.getSnapshot()
    expect(snapshot).toMatchObject({ phase: round, survivor, elapsedMs: 0, paused: false })
    const human = movePose(HUMAN_START, 0, 0, 0)
    let haunter = movePose(HAUNTER_START, 0, 0, 0)
    expect(human).toEqual({ x: -5, z: 5, yaw: 0 })
    expect(haunter).toEqual({ x: 5, z: -5, yaw: Math.PI })
    let spirit = spiritForMatch(null, snapshot)!
    expect(spirit).toEqual({ round, energy: 100, at: 0, last: null })
    expect(Math.hypot(human.x - haunter.x, human.z - haunter.z)).toBeGreaterThan(5.5)
    expect(requestSpirit(spirit, snapshot, actor, round, 'apparition', human, haunter)).toBeNull()
    expect(requestSpirit(spirit, snapshot, actor, round, 'blackout', human, haunter)?.energy).toBe(65)
    expect(requestSpirit(spirit, snapshot, actor, round, 'rattle', human, haunter)?.energy).toBe(80)

    let steps = 0
    for (const [forward, strafe, count] of [
      [1, 0, 17],
      [0, 1, 33],
      [1, 0, 17]
    ]) {
      for (let step = 0; step < count; step++) {
        const previous = haunter
        haunter = movePose(previous, forward, strafe, 0.1)
        expect(haunter.x - previous.x).toBeCloseTo(-0.3 * strafe, 10)
        expect(haunter.z - previous.z).toBeCloseTo(0.3 * forward, 10)
        expect(Math.hypot(haunter.x - previous.x, haunter.z - previous.z)).toBeCloseTo(0.3, 10)
        expect(haunter.yaw).toBe(HAUNTER_START.yaw)
        match.tick(100)
        steps++
        snapshot = match.getSnapshot()
        expect(snapshot).toMatchObject({ phase: round, survivor, elapsedMs: steps * 100, paused: false })
        spirit = spiritForMatch(spirit, snapshot)!
      }
    }
    expect(steps).toBe(67)
    expect(snapshot.elapsedMs).toBe(6700)
    expect(haunter.x).toBeCloseTo(-4.9, 10)
    expect(haunter.z).toBeCloseTo(5.2, 10)
    expect(Math.hypot(human.x - haunter.x, human.z - haunter.z)).toBeCloseTo(Math.sqrt(0.05), 10)
    expect(requestSpirit(spirit, snapshot, actor, round, 'apparition', human, haunter)).toEqual({
      round,
      energy: 55,
      at: 6700,
      last: 6700
    })
  })

  it.each(['round1', 'round2'] as const)('applies the same limits in %s', (round) => {
    const match = new HorrorMatch()
    match.start()
    if (round === 'round2') {
      match.tick(900000)
      match.startSecondRound()
    }
    const snapshot = match.getSnapshot()
    const actor = round === 'round1' ? 'guest' : 'host'
    const human = { x: 0, z: 0, yaw: 0 },
      near = { x: 5.5, z: 0, yaw: 0 },
      far = { ...near, x: 5.5001 }
    const initial = spiritForMatch(null, snapshot)!
    expect(requestSpirit(initial, snapshot, actor, round, 'apparition', human, far)).toBeNull()
    expect(requestSpirit(initial, snapshot, actor, round, 'blackout', human, far)?.energy).toBe(65)
    expect(requestSpirit(initial, snapshot, actor, round, 'rattle', human, far)?.energy).toBe(80)
    const used = requestSpirit(initial, snapshot, actor, round, 'apparition', human, near)!
    expect(used.energy).toBe(55)
    expect(requestSpirit(used, snapshot, actor, round, 'rattle', human, near)).toBeNull()
    expect(requestSpirit(used, { ...snapshot, elapsedMs: 7999 }, actor, round, 'rattle', human, near)).toBeNull()
    expect(requestSpirit(used, { ...snapshot, elapsedMs: 8000 }, actor, round, 'rattle', human, near)?.energy).toBe(51)
    expect(spiritStatus(used, { ...snapshot, elapsedMs: 900000 }, 'rattle', human, near).energy).toBe(100)
    expect(
      requestSpirit({ ...used, energy: 0 }, { ...snapshot, elapsedMs: 8000 }, actor, round, 'rattle', human, near)
    ).toBeNull()
    expect(
      requestSpirit({ ...used, energy: 4 }, { ...snapshot, elapsedMs: 8000 }, actor, round, 'rattle', human, near)
        ?.energy
    ).toBe(0)
    expect(requestSpirit(used, { ...snapshot, paused: true }, actor, round, 'rattle', human, near)).toBeNull()
    expect(requestSpirit({ ...used, at: 1, last: 1 }, snapshot, actor, round, 'rattle', human, near)).toBeNull()
    expect(requestSpirit(initial, snapshot, snapshot.survivor, round, 'rattle', human, near)).toBeNull()
    expect(requestSpirit(initial, snapshot, actor, 'lobby', 'rattle', human, near)).toBeNull()
    expect(requestSpirit(initial, snapshot, actor, round, 'bad', human, near)).toBeNull()
    expect(requestSpirit(initial, snapshot, actor, round, 'rattle', { ...human, x: NaN }, near)).toBeNull()
    expect(acceptSpirit(null, initial, snapshot)).toBe(true)
    expect(acceptSpirit(null, { ...initial, energy: Infinity }, snapshot)).toBe(false)
    expect(acceptSpirit(null, { ...initial, at: NaN }, snapshot)).toBe(false)
    expect(acceptSpirit(null, { ...initial, round: 'lobby' }, snapshot)).toBe(false)
    expect(acceptSpirit(used, { ...used, energy: 100 }, snapshot)).toBe(false)
    expect(acceptSpirit(used, { ...used, at: 7999, last: 7999 }, { ...snapshot, elapsedMs: 7999 })).toBe(false)
  })

  it('preserves paused time and resets on role change', () => {
    const match = new HorrorMatch()
    match.start()
    const pose = { x: 0, z: 0, yaw: 0 }
    const used = requestSpirit(
      spiritForMatch(null, match.getSnapshot()),
      match.getSnapshot(),
      'guest',
      'round1',
      'blackout',
      pose,
      pose
    )!
    match.pause()
    match.tick(50000)
    expect(spiritStatus(used, match.getSnapshot(), 'rattle', pose, pose)).toMatchObject({ energy: 65, cooldown: 8000 })
    match.resume()
    match.tick(8000)
    expect(spiritStatus(used, match.getSnapshot(), 'rattle', pose, pose)).toMatchObject({ energy: 81, cooldown: 0 })
    match.tick(900000)
    expect(spiritForMatch(used, match.getSnapshot())).toBeNull()
    match.startSecondRound()
    expect(spiritForMatch(used, match.getSnapshot())).toEqual({ round: 'round2', energy: 100, at: 0, last: null })
  })
})
