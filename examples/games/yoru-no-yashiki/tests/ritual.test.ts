import { describe, expect, it } from 'vitest'
import { HorrorMatch } from '../src/match'
import { HUMAN_START, movePose, type Pose } from '../src/world'
import {
  createRitualState,
  interactRitual,
  isRitualState,
  isRitualStateForMatch,
  RITUAL_RADIUS,
  RITUAL_STEPS
} from '../src/ritual'

describe('ritual', () => {
  it('keeps the four story clues ordered, concise and fixed in place and time', () => {
    expect(RITUAL_STEPS.map(({ id, x, z, availableMs }) => ({ id, x, z, availableMs }))).toEqual([
      { id: 'letter', x: -5, z: 4, availableMs: 0 },
      { id: 'bell', x: -5, z: -5, availableMs: 240_000 },
      { id: 'mirror', x: 5, z: -5, availableMs: 540_000 },
      { id: 'seal', x: 5, z: 5, availableMs: 720_000 }
    ])
    expect(RITUAL_STEPS.map(({ text }) => text)).toEqual([
      expect.stringMatching(/あの子.*鈴/),
      expect.stringMatching(/鈴.*ただいま/),
      expect.stringMatching(/鏡.*子.*鈴/),
      expect.stringMatching(/あの子.*ただいま/)
    ])
    for (const { text } of RITUAL_STEPS) expect(text.length).toBeLessThanOrEqual(70)
  })

  it('places every target on a walkable route from the common human start', () => {
    const queue = [{ ...HUMAN_START, yaw: 0 }]
    const seen = new Set<string>()
    const key = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`
    seen.add(key(HUMAN_START.x, HUMAN_START.z))
    for (let index = 0; index < queue.length; index++) {
      const pose = queue[index]
      for (const [forward, strafe] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]) {
        const next = movePose(pose, forward, strafe, 1 / 6)
        const nextKey = key(next.x, next.z)
        if (Math.hypot(next.x - pose.x, next.z - pose.z) < 0.49 || seen.has(nextKey)) continue
        seen.add(nextKey)
        queue.push(next)
      }
    }
    for (const step of RITUAL_STEPS) {
      expect(queue.some((pose) => Math.hypot(pose.x - step.x, pose.z - step.z) < 0.01)).toBe(true)
      expect(movePose({ x: step.x, z: step.z, yaw: 0 }, 0, 0, 0)).toEqual({ x: step.x, z: step.z, yaw: 0 })
    }
  })

  it('completes the ordered clues by walking within each of the two rounds', () => {
    type Move = readonly [number, number]
    type SearchNode = { pose: Pose; previous: number; move: Move | null }
    const moves: Move[] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]
    const first = movePose(HUMAN_START, 1, 0, 0.1)
    const stride = Math.hypot(first.x - HUMAN_START.x, first.z - HUMAN_START.z)
    expect(stride).toBeGreaterThan(0)
    const findRoute = (start: Pose, target: { id: string; x: number; z: number }): Move[] => {
      const key = (pose: Pose) => `${Math.round(pose.x * 1000)},${Math.round(pose.z * 1000)}`
      const queue: SearchNode[] = [{ pose: start, previous: -1, move: null }]
      const seen = new Set([key(start)])
      for (let index = 0; index < queue.length && queue.length <= 10_000; index++) {
        const current = queue[index]
        if (Math.hypot(current.pose.x - target.x, current.pose.z - target.z) <= RITUAL_RADIUS - 0.1) {
          const route: Move[] = []
          for (let cursor = index; queue[cursor].previous !== -1; cursor = queue[cursor].previous)
            route.push(queue[cursor].move!)
          return route.reverse()
        }
        for (const move of moves) {
          const next = movePose(current.pose, move[0], move[1], 0.1)
          if (Math.hypot(next.x - current.pose.x, next.z - current.pose.z) < stride - 0.000001 || seen.has(key(next)))
            continue
          seen.add(key(next))
          queue.push({ pose: next, previous: index, move })
        }
      }
      throw new Error(`No walking route to ${target.id}`)
    }

    const match = new HorrorMatch()
    match.start()
    for (const round of ['round1', 'round2'] as const) {
      if (round === 'round2') match.startSecondRound()
      let pose = { ...HUMAN_START }
      let ritual = createRitualState(match.getSnapshot())!
      for (const [index, target] of RITUAL_STEPS.entries()) {
        for (const [forward, strafe] of findRoute(pose, target)) {
          pose = movePose(pose, forward, strafe, 0.1)
          match.tick(100)
        }
        match.tick(Math.max(0, target.availableMs - match.getSnapshot().elapsedMs))
        const snapshot = match.getSnapshot()
        expect(snapshot.phase).toBe(round)
        expect(snapshot.survivor).toBe(round === 'round1' ? 'host' : 'guest')
        expect(snapshot.elapsedMs).toBeLessThan(900_000)
        const next = interactRitual(ritual, snapshot, snapshot.survivor, pose, target.id)
        expect(next).toEqual({ round, completed: index + 1 })
        ritual = next!
      }
      expect(match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
      match.tick(900_000 - match.getSnapshot().elapsedMs)
    }
    expect(match.getSnapshot().phase).toBe('finished')
  })

  it('uses identical sequential content and timing in both rounds without changing the match', () => {
    const match = new HorrorMatch()
    match.start()
    for (const round of ['round1', 'round2'] as const) {
      let state = createRitualState(match.getSnapshot())!
      expect(state).toEqual({ round, completed: 0 })
      for (const [index, step] of RITUAL_STEPS.entries()) {
        const before = match.getSnapshot()
        if (before.elapsedMs < step.availableMs) {
          expect(interactRitual(state, before, before.survivor, { ...step, yaw: 0 }, step.id)).toBeNull()
          match.tick(step.availableMs - before.elapsedMs)
        }
        const snapshot = match.getSnapshot()
        const next = interactRitual(state, snapshot, snapshot.survivor, { ...step, yaw: 0 }, step.id)
        expect(next).toEqual({ round, completed: index + 1 })
        expect(match.getSnapshot()).toEqual(snapshot)
        expect(interactRitual(next, snapshot, snapshot.survivor, { ...step, yaw: 0 }, step.id)).toBeNull()
        state = next!
      }
      expect(match.getSnapshot().phase).toBe(round)
      match.tick(900_000 - match.getSnapshot().elapsedMs)
      expect(createRitualState(match.getSnapshot())).toBeNull()
      expect(isRitualStateForMatch(state, match.getSnapshot())).toBe(false)
      if (round === 'round1') {
        match.startSecondRound()
        expect(isRitualStateForMatch(state, match.getSnapshot())).toBe(false)
      }
    }
    expect(match.getSnapshot().scores).toEqual({ host: 0, guest: 0 })
  })

  it('rejects malformed state, invalid requests, distance, time and pauses', () => {
    const match = new HorrorMatch()
    expect(createRitualState(match.getSnapshot())).toBeNull()
    match.start()
    const snapshot = match.getSnapshot()
    const state = createRitualState(snapshot)!
    const step = RITUAL_STEPS[0]
    const pose = { x: step.x, z: step.z, yaw: 0 }
    for (const invalid of [
      null,
      {},
      [],
      { ...state, completed: -1 },
      { ...state, completed: 0.5 },
      { ...state, completed: Infinity },
      { ...state, extra: 1 }
    ]) {
      expect(isRitualState(invalid)).toBe(false)
      expect(interactRitual(invalid, snapshot, 'host', pose, step.id)).toBeNull()
    }
    expect(isRitualState(JSON.parse(JSON.stringify(state)))).toBe(true)
    expect(interactRitual(state, snapshot, 'guest', pose, step.id)).toBeNull()
    expect(interactRitual(state, snapshot, 'host', pose, RITUAL_STEPS[1].id)).toBeNull()
    expect(interactRitual(state, snapshot, 'host', { ...pose, x: pose.x + RITUAL_RADIUS + 0.001 }, step.id)).toBeNull()
    expect(interactRitual(state, snapshot, 'host', { ...pose, x: NaN }, step.id)).toBeNull()
    expect(interactRitual(state, snapshot, 'host', { ...pose, yaw: Infinity }, step.id)).toBeNull()
    expect(interactRitual(state, { ...snapshot, elapsedMs: NaN }, 'host', pose, step.id)).toBeNull()
    expect(interactRitual(state, { ...snapshot, elapsedMs: -1 }, 'host', pose, step.id)).toBeNull()
    expect(interactRitual(state, { ...snapshot, elapsedMs: 900_000 }, 'host', pose, step.id)).toBeNull()
    expect(isRitualStateForMatch({ ...state, completed: 2 }, snapshot)).toBe(false)
    expect(interactRitual(state, snapshot, 'host', { ...pose, x: pose.x + RITUAL_RADIUS }, step.id)).not.toBeNull()
    match.pause()
    match.tick(300_000)
    expect(match.getSnapshot().elapsedMs).toBe(0)
    expect(interactRitual(state, match.getSnapshot(), 'host', pose, step.id)).toBeNull()
    match.resume()
    expect(interactRitual(state, match.getSnapshot(), 'host', pose, step.id)).not.toBeNull()
  })
})
