import { describe, expect, it } from 'vitest'
import { HorrorMatch } from '../src/match'
import { RITUAL_RADIUS, RITUAL_STEPS, RITUAL_WARD_DELAY_MS, RITUAL_WARD_MS, ritualWard } from '../src/ritual'
import { COST, requestSpirit, spiritForMatch, spiritStatus } from '../src/spirit'
import { requestRitual, ritualForMatch } from '../src/sync'
import { HAUNTER_START, HUMAN_START, movePose, type Pose } from '../src/world'

const step = (index: number) => RITUAL_STEPS[index]
const site = (index: number): Pose => ({ x: step(index).x, z: step(index).z, yaw: 0 })

function matchAt(round: 'round1' | 'round2', elapsedMs = 0) {
  const match = new HorrorMatch()
  match.start()
  if (round === 'round2') {
    match.tick(900_000)
    match.startSecondRound()
  }
  if (elapsedMs) match.tick(elapsedMs)
  return match
}

describe.each(['round1', 'round2'] as const)('one fixed ward window per site (%s)', (round) => {
  it.each([0, 1, 2, 3])('opens exactly 60s after unlock and lasts 30s at site %i', (index) => {
    const snapshot = matchAt(round).getSnapshot()
    const start = step(index).availableMs + RITUAL_WARD_DELAY_MS
    const end = start + RITUAL_WARD_MS
    const state = { round, completed: index + 1 }
    for (const elapsedMs of [start - 1, start - 0.001, end, end + 0.001, end + 1, 899_999])
      expect(ritualWard(state, { ...snapshot, elapsedMs })).toBeNull()
    for (const elapsedMs of [start, start + 0.001, end - 1, end - 0.001])
      expect(ritualWard(state, { ...snapshot, elapsedMs })).toBe(step(index))
    expect(ritualWard({ round, completed: index }, { ...snapshot, elapsedMs: start })).toBeNull()
    expect(ritualWard({ ...state, extra: true }, { ...snapshot, elapsedMs: start })).toBeNull()
  })

  it.each([0, 1, 2, 3])('does not extend the window for a late investigation at site %i', (index) => {
    const snapshot = matchAt(round).getSnapshot()
    const start = step(index).availableMs + RITUAL_WARD_DELAY_MS
    const end = start + RITUAL_WARD_MS
    const at = { ...snapshot, elapsedMs: start + 15_000 }
    const state = requestRitual({ round, completed: index }, at, snapshot.survivor, site(index), round, step(index).id)
    expect(state).toEqual({ round, completed: index + 1 })
    expect(ritualWard(state, at)).toBe(step(index))
    expect(ritualWard(state, { ...snapshot, elapsedMs: end })).toBeNull()
    expect(ritualWard(state, { ...snapshot, elapsedMs: end + 120_000 })).toBeNull()
    expect(requestRitual(state, at, snapshot.survivor, site(index), round, step(index).id)).toBeNull()
  })

  it('blocks only a new nearby apparition while leaving other effects and costs unchanged', () => {
    const snapshot = { ...matchAt(round).getSnapshot(), elapsedMs: 60_000 }
    const actor = snapshot.survivor === 'host' ? 'guest' : 'host'
    const spirit = spiritForMatch(null, snapshot)!
    const state = { round, completed: 1 }
    for (const offset of [0, RITUAL_RADIUS - 0.0001, RITUAL_RADIUS]) {
      const human = { ...site(0), x: site(0).x + offset }
      expect(requestSpirit(spirit, snapshot, actor, round, 'apparition', human, human, state)).toBeNull()
    }
    const outside = { ...site(0), x: site(0).x + RITUAL_RADIUS + 0.0001 }
    expect(requestSpirit(spirit, snapshot, actor, round, 'apparition', outside, outside, state)?.energy).toBe(
      100 - COST.apparition
    )
    for (const kind of ['blackout', 'rattle'] as const)
      expect(requestSpirit(spirit, snapshot, actor, round, kind, site(0), site(0), state)?.energy).toBe(
        100 - COST[kind]
      )
    expect(spiritStatus(spirit, snapshot, 'apparition', site(0), site(0), state).reason).toContain('出現止め')
    expect(spiritStatus(spirit, snapshot, 'blackout', site(0), site(0), state).reason).toBe('')
  })

  it('freezes the window during pause and resumes with the unused portion', () => {
    const match = matchAt(round, 60_000)
    const state = { round, completed: 1 }
    match.pause()
    match.tick(120_000)
    const paused = match.getSnapshot()
    expect(paused.elapsedMs).toBe(60_000)
    expect(ritualWard(state, paused)).toBeNull()
    expect(
      requestSpirit(
        spiritForMatch(null, paused),
        paused,
        paused.survivor === 'host' ? 'guest' : 'host',
        round,
        'apparition',
        site(0),
        site(0),
        state
      )
    ).toBeNull()
    match.resume()
    match.tick(29_999)
    expect(ritualWard(state, match.getSnapshot())).toBe(step(0))
    match.tick(1)
    expect(ritualWard(state, match.getSnapshot())).toBeNull()
    expect(match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
  })

  it('reduces stationary camping from 240s to one 30s window and keeps 900s of other effects', () => {
    const snapshot = matchAt(round).getSnapshot()
    const spirit = spiritForMatch(null, snapshot)!
    const state = requestRitual(
      ritualForMatch(null, snapshot),
      snapshot,
      snapshot.survivor,
      HUMAN_START,
      round,
      'letter'
    )!
    expect(Math.hypot(HUMAN_START.x - step(0).x, HUMAN_START.z - step(0).z)).toBe(RITUAL_RADIUS)
    const counts = { blocked: 0, available: 0, blackout: 0, rattle: 0 }
    const blockedSeconds: number[] = []
    for (let seconds = 0; seconds < 900; seconds++) {
      const at = { ...snapshot, elapsedMs: seconds * 1000 }
      if (spiritStatus(spirit, at, 'apparition', HUMAN_START, HUMAN_START, state).reason) {
        counts.blocked++
        blockedSeconds.push(seconds)
      } else counts.available++
      if (!spiritStatus(spirit, at, 'blackout', HUMAN_START, HUMAN_START, state).reason) counts.blackout++
      if (!spiritStatus(spirit, at, 'rattle', HUMAN_START, HUMAN_START, state).reason) counts.rattle++
    }
    expect(counts).toEqual({ blocked: 30, available: 870, blackout: 900, rattle: 900 })
    expect(blockedSeconds).toEqual(Array.from({ length: 30 }, (_, index) => index + 60))
    expect(spiritStatus(spirit, snapshot, 'apparition', HUMAN_START, HUMAN_START, null).reason).toBe('')
  })

  it('lets the haunter reach the human by a collision-checked route before the first window', () => {
    let pose = { ...HAUNTER_START }
    const waypoints = [
      { x: 5, z: 0 },
      { x: -5, z: 0 },
      { x: HUMAN_START.x, z: HUMAN_START.z }
    ]
    let seconds = 0
    let length = 0
    for (const goal of waypoints) {
      for (let frames = 0; Math.hypot(pose.x - goal.x, pose.z - goal.z) > 1e-8 && frames < 10_000; frames++) {
        const distance = Math.hypot(pose.x - goal.x, pose.z - goal.z)
        const dt = Math.min(1 / 60, distance / 3)
        const before = pose
        pose = movePose({ ...pose, yaw: Math.atan2(goal.x - pose.x, -(goal.z - pose.z)) }, 1, 0, dt)
        length += Math.hypot(pose.x - before.x, pose.z - before.z)
        seconds += dt
        expect(Math.hypot(pose.x - before.x, pose.z - before.z)).toBeGreaterThan(0)
      }
      expect(Math.hypot(pose.x - goal.x, pose.z - goal.z)).toBeLessThan(1e-8)
    }
    expect(length).toBeCloseTo(20, 6)
    expect(seconds * 1000).toBeLessThan(RITUAL_WARD_DELAY_MS)
    const snapshot = { ...matchAt(round).getSnapshot(), elapsedMs: Math.ceil(seconds * 1000) }
    const actor = snapshot.survivor === 'host' ? 'guest' : 'host'
    expect(
      requestSpirit(spiritForMatch(null, snapshot), snapshot, actor, round, 'apparition', HUMAN_START, pose, {
        round,
        completed: 1
      })
    ).not.toBeNull()
  })

  it('preserves two 15-minute rounds and resets the ward between nights', () => {
    const match = matchAt('round1', 60_000)
    expect(ritualWard({ round: 'round1', completed: 1 }, match.getSnapshot())).toBe(step(0))
    match.tick(840_000)
    expect(match.getSnapshot()).toMatchObject({ phase: 'intermission', elapsedMs: 900_000, survivor: 'host' })
    expect(ritualWard({ round: 'round1', completed: 1 }, match.getSnapshot())).toBeNull()
    match.startSecondRound()
    expect(ritualForMatch({ round: 'round1', completed: 1 }, match.getSnapshot())).toEqual({
      round: 'round2',
      completed: 0
    })
    match.tick(900_000)
    expect(match.getSnapshot()).toMatchObject({
      phase: 'finished',
      elapsedMs: 900_000,
      survivor: 'guest',
      scores: { host: 0, guest: 0 }
    })
    expect(ritualWard({ round: 'round2', completed: 4 }, match.getSnapshot())).toBeNull()
  })
})

it('rejects malformed ritual states and out-of-round snapshots', () => {
  const snapshot = matchAt('round1', 60_000).getSnapshot()
  for (const value of [
    null,
    [],
    {},
    { round: 'round1', completed: -1 },
    { round: 'round1', completed: 0.5 },
    { round: 'round1', completed: NaN },
    { round: 'round1', completed: Infinity },
    { round: 'round1', completed: 5 },
    { round: 'round1', completed: 2 },
    { round: 'round2', completed: 1 },
    { round: 'round1', completed: 1, extra: true }
  ])
    expect(ritualWard(value, snapshot)).toBeNull()
  for (const elapsedMs of [-1, NaN, Infinity, 900_000])
    expect(ritualWard({ round: 'round1', completed: 1 }, { ...snapshot, elapsedMs })).toBeNull()
  for (const phase of ['lobby', 'intermission', 'finished'] as const)
    expect(ritualWard({ round: 'round1', completed: 1 }, { ...snapshot, phase })).toBeNull()
  expect(
    ritualWard(
      { round: 'round1', completed: 1 },
      { ...snapshot, survivor: snapshot.survivor === 'host' ? 'guest' : 'host' }
    )
  ).toBeNull()
})
