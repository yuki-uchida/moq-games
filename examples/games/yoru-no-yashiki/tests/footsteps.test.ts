import { describe, expect, it } from 'vitest'
import { footstepSurface, HumanFootsteps } from '../src/footsteps'
import type { MatchSnapshot, PlayerId } from '../src/match'
import { HUMAN_START, movePose, type Pose } from '../src/world'

function setup(player: PlayerId = 'host', pose: Pose = { ...HUMAN_START }) {
  const footsteps = new HumanFootsteps()
  const state: MatchSnapshot = {
    phase: player === 'host' ? 'round1' : 'round2',
    survivor: player,
    elapsedMs: 0,
    paused: false,
    scores: { host: 0, guest: 0 }
  }
  let now = 1000
  const sample = (next = pose, delta = 100) => {
    pose = next
    now += delta
    state.elapsedMs += delta
    return footsteps.sample(pose, state, player, now)
  }
  sample()
  return { footsteps, state, sample }
}

describe('human footsteps', () => {
  it.each(['host', 'guest'] as const)('%s uses travelled distance, not yaw or stationary time', (player) => {
    const { sample } = setup(player)
    for (let index = 0; index < 20; index++) expect(sample({ ...HUMAN_START, yaw: index })).toBeNull()
    expect(sample({ x: -5, z: 4.7, yaw: 0 })).toBeNull()
    expect(sample({ x: -5, z: 4.4, yaw: 0 })).toBeNull()
    expect(sample({ x: -5, z: 4.1, yaw: 0 })).toBe('tatami')
    for (let index = 0; index < 20; index++) expect(sample()).toBeNull()
  })

  it('uses actual wall-clipped movement and never repeats steps while pushing a wall', () => {
    let pose = { x: -5, z: 0, yaw: 0 }
    const { sample } = setup('host', pose)
    const steps: string[] = []
    for (let index = 0; index < 50; index++) {
      pose = movePose(pose, 0, -1, 0.1)
      const surface = sample(pose)
      if (surface) steps.push(surface)
    }
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.every((surface) => surface === 'wood')).toBe(true)
    for (let index = 0; index < 50; index++) {
      pose = movePose(pose, 0, -1, 0.1)
      expect(sample(pose)).toBeNull()
    }
  })

  it('caps cadence even with fast, individually plausible snapshots', () => {
    const { footsteps, state } = setup('host', { x: -5, z: 0, yaw: 0 })
    let previousStep = -Infinity
    let count = 0
    for (let index = 1; index <= 100; index++) {
      state.elapsedMs = 100 + index * 100
      if (footsteps.sample({ x: -5 + index * 0.3, z: 0, yaw: 0 }, state, 'host', 1100 + index)) {
        expect(index - previousStep).toBeGreaterThanOrEqual(300)
        previousStep = index
        count++
      }
    }
    expect(count).toBe(1)
  })

  it.each(['paused', 'intermission', 'finished', 'haunter', 'reset'])(
    'discards partial distance across %s and rebaselines on return',
    (action) => {
      const { footsteps, state, sample } = setup()
      expect(sample({ x: -5, z: 4.4, yaw: 0 }, 200)).toBeNull()
      if (action === 'paused') state.paused = true
      else if (action === 'haunter') state.survivor = 'guest'
      else if (action === 'reset') footsteps.reset()
      else state.phase = action as 'intermission' | 'finished'
      expect(sample({ x: 5, z: -5, yaw: 0 })).toBeNull()
      state.paused = false
      state.phase = 'round1'
      state.survivor = 'host'
      expect(sample({ x: -5, z: 5, yaw: 0 })).toBeNull()
      expect(sample({ x: -5, z: 4.7, yaw: 0 })).toBeNull()
      expect(sample({ x: -5, z: 4.4, yaw: 0 })).toBeNull()
      expect(sample({ x: -5, z: 4.1, yaw: 0 })).toBe('tatami')
    }
  )

  it.each(['warp', 'gap', 'invalid', 'clock'])('discards %s without catching up discarded distance', (action) => {
    const { sample } = setup()
    expect(sample({ x: -5, z: 4.4, yaw: 0 }, 200)).toBeNull()
    const pose = { x: -5, z: action === 'warp' ? -5 : action === 'invalid' ? NaN : 4.1, yaw: 0 }
    expect(sample(pose, action === 'gap' ? 600 : action === 'clock' ? 0 : 100)).toBeNull()
    expect(sample({ x: -5, z: 5, yaw: 0 }, 600)).toBeNull()
    expect(sample({ x: -5, z: 4.7, yaw: 0 })).toBeNull()
    expect(sample({ x: -5, z: 4.4, yaw: 0 })).toBeNull()
    expect(sample({ x: -5, z: 4.1, yaw: 0 })).toBe('tatami')
  })

  it('rebaselines a direct round/role change without an intermediate pause sample', () => {
    const { footsteps, state, sample } = setup()
    sample({ x: -5, z: 4.4, yaw: 0 }, 200)
    state.phase = 'round2'
    state.survivor = 'guest'
    state.elapsedMs = 0
    expect(footsteps.sample({ x: 5, z: -5, yaw: 0 }, state, 'guest', 1400)).toBeNull()
    expect(footsteps.sample({ x: 5, z: -4.7, yaw: 0 }, { ...state, elapsedMs: 100 }, 'guest', 1500)).toBeNull()
  })
})

describe('existing tatami geometry', () => {
  it.each([-1, 1])('matches both ends and all tile rotations on side %s', (side) => {
    for (const end of [-1, 1]) {
      for (let column = 0; column < 4; column++) {
        for (let pair = 0; pair < 3; pair++) {
          const turned = (column + pair + (side === end ? 1 : 0)) % 2 === 0
          for (const offset of [-0.55, 0.55]) {
            expect(
              footstepSurface({
                x: side * (1.15 + column * 2.16) + (turned ? offset : 0),
                z: end * (3.2 + pair * 2.2) + (turned ? 0 : offset)
              })
            ).toBe('tatami')
          }
        }
      }
    }
  })

  it.each([
    { x: -5, z: 0 },
    { x: 5, z: 1.99 },
    { x: -5, z: -2.04 },
    { x: -1.15, z: 3.2 },
    { x: 0, z: 5 },
    { x: -8.5, z: 8.8 }
  ])('keeps corridor, timber edges and gaps wooden at %o', (pose) => {
    expect(footstepSurface(pose)).toBe('wood')
  })
})
