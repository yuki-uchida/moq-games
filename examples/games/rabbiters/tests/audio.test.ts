import { afterEach, describe, expect, it, vi } from 'vitest'
import { Game } from '../src/game'
import { RabbitersAudio } from '../src/audio'
import { JuiceDetector } from '../src/juice'
import { newMind, updatePredator } from '../src/stealth'

const parameter = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn()
})
class Context {
  state = 'running'
  currentTime = 0
  destination = {}
  gains: {
    gain: ReturnType<typeof parameter>
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }[] = []
  voices: ReturnType<Context['createOscillator']>[] = []
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  createGain() {
    const gain = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
    this.gains.push(gain)
    return gain
  }
  createOscillator() {
    const voice = {
      type: 'sine',
      frequency: parameter(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null
    }
    this.voices.push(voice)
    return voice
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const setup = () => {
  vi.useFakeTimers()
  const context = new Context()
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context
    })
  )
  const audio = new RabbitersAudio()
  const game = new Game()
  game.addPlayer('local', 'Rabbit')
  for (const predator of game.state.predators) predator.targetId = 'local'
  audio.start()
  audio.update(game.state, 'local')
  return { audio, game, context }
}

describe('Rabbiters audio', () => {
  it('gives discovery a sustained impact and chase a syncopated bass without raising master gain', () => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    context.currentTime = 1
    audio.update(game.state, 'local')
    expect(context.gains[0].gain.value).toBe(0.12)
    expect(context.gains[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.36, 1.01)
    expect(context.gains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.36, 1 + 0.28 * 0.15)
    expect(context.voices[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(45, 1.28)
    context.currentTime = 1.6
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(7)
    expect(context.voices[4].frequency.setValueAtTime).toHaveBeenCalledWith(98, 1.6)
    expect(context.voices[5].start).toHaveBeenCalledWith(1.725)
    expect(context.gains[5].gain.setValueAtTime).toHaveBeenCalledWith(0.28, 1.6 + 0.22 * 0.6)
    audio.stop()
  })

  it('bounds scheduled polyphony and signal peaks, then frees voices on mute and end', () => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    audio.update(game.state, 'local')
    context.currentTime = 1
    vi.advanceTimersByTime(4000)
    expect(context.voices).toHaveLength(16)
    const peaks = context.gains.slice(1).map((gain) => gain.gain.linearRampToValueAtTime.mock.calls[0][0] as number)
    expect(Math.max(...peaks)).toBeLessThanOrEqual(0.36)
    expect(peaks.reduce((sum, peak) => sum + peak, 0) * context.gains[0].gain.value).toBeLessThan(1)
    const ended = context.voices[0]
    ;(ended.onended as (() => void) | null)?.()
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(17)
    audio.setMuted(true)
    vi.advanceTimersByTime(1000)
    expect(context.voices).toHaveLength(17)
    audio.setMuted(false)
    vi.advanceTimersByTime(250)
    expect(context.voices.length).toBeGreaterThan(17)
    audio.stop()
    expect(context.voices.every((voice) => voice.disconnect.mock.calls.length > 0)).toBe(true)
  })

  it('replaces cheerful music with suspicion and chase pulses, then restores it on escape', () => {
    const { audio, game, context } = setup()
    const predator = game.state.predators[0]
    const update = (time: number) => {
      game.state.time = time
      context.currentTime = time
      audio.update(game.state, 'local')
    }
    predator.state = 'suspicious'
    update(1)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-1)?.frequency.setValueAtTime).toHaveBeenCalledWith(196, 1)
    const warning = context.voices.at(-1)!
    predator.state = 'chase'
    update(2)
    expect(warning.stop).toHaveBeenCalledTimes(2)
    const stingCount = context.voices.length
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(stingCount)
    context.currentTime = 2.6
    vi.advanceTimersByTime(250)
    expect(context.voices[stingCount].frequency.setValueAtTime).toHaveBeenCalledWith(98, 2.6)
    const pulse = context.voices[stingCount]
    predator.state = 'patrol'
    update(3)
    expect(pulse.stop).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 3)
    predator.state = 'chase'
    update(4)
    expect(context.voices.at(-1)?.type).toBe('sine')
    audio.stop()
  })

  it('does not stack discovery stings as more predators join an ongoing team chase', () => {
    const { audio, game, context } = setup()
    game.state.predators[0].state = 'chase'
    game.state.time = 1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    game.state.predators[1].state = 'chase'
    game.state.time = 4
    audio.update(game.state, 'local')
    audio.update({ ...game.state, time: 2 }, 'local')
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it('interrupts chase music when a different rabbit is discovered', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const [first, second] = game.state.predators
    Object.assign(first, { state: 'chase', targetId: 'friend' })
    game.state.time = context.currentTime = 1
    audio.update(game.state, 'local')
    for (const voice of context.voices) (voice.onended as (() => void) | null)?.()
    context.currentTime = 1.6
    vi.advanceTimersByTime(250)
    const music = context.voices.slice(4)
    expect(music).toHaveLength(3)
    Object.assign(second, { state: 'chase', targetId: 'local' })
    game.state.time = context.currentTime = 1.61
    audio.update(game.state, 'local')
    expect(music.every((voice) => voice.stop.mock.calls.length === 2)).toBe(true)
    expect(context.voices.slice(-4).map((voice) => voice.frequency.setValueAtTime.mock.calls[0][0])).toEqual([
      160, 830, 1245, 466
    ])
    const count = context.voices.length
    vi.advanceTimersByTime(250)
    expect(context.voices).toHaveLength(count)
    context.currentTime = 2.2
    vi.advanceTimersByTime(250)
    expect(context.voices.length).toBeGreaterThan(count)
    audio.stop()
  })

  it('keeps a new discovery audible when several rabbits are spotted in quick succession', () => {
    const { audio, game, context } = setup()
    const template = game.state.predators[0]
    game.state.predators = Array.from({ length: 5 }, (_, index) => ({
      ...template,
      id: `predator-${index}`,
      state: 'patrol',
      targetId: null
    }))
    for (let index = 0; index < 5; index++) {
      const targetId = index === 4 ? 'local' : `friend-${index}`
      if (index < 4) game.addPlayer(targetId, targetId)
      Object.assign(game.state.predators[index], { state: 'chase', targetId })
      game.state.time = context.currentTime = 1 + index * 0.01
      audio.update(game.state, 'local')
    }
    expect(context.voices).toHaveLength(20)
    expect(context.voices.slice(-4).map((voice) => voice.frequency.setValueAtTime.mock.calls[0][0])).toEqual([
      160, 830, 1245, 466
    ])
    audio.stop()
  })

  it('initializes and resumes synchronously, with one music timer', () => {
    const { audio, context } = setup()
    expect(context.resume).toHaveBeenCalledOnce()
    audio.start()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(context.voices.length).toBeGreaterThan(0)
    audio.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(context.voices.every((voice) => voice.stop.mock.calls.length >= 2)).toBe(true)
  })

  it('detects all effects without replaying mutable frames or duplicate/stale snapshots', () => {
    const { audio, game, context } = setup()
    const player = game.state.players[0]
    player.y = 0.2
    player.foodEaten++
    player.health--
    player.pregnant = true
    game.state.nests[0].active = false
    game.state.time = 1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(6)
    audio.update(game.state, 'local')
    audio.update(JSON.parse(JSON.stringify(game.state)), 'local')
    audio.update({ ...game.state, time: 0 }, 'local')
    expect(context.voices).toHaveLength(6)
    game.state.phase = 'won'
    audio.update(game.state, 'local')
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(10)
    audio.stop()
  })

  it('leaves local action sounds to sfx and consumes muted events without replay', () => {
    const { audio, game, context } = setup()
    audio.setMuted(true)
    game.state.players[0].foodEaten++
    audio.update(game.state, 'local')
    audio.setMuted(false)
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    for (const time of [1, 1.1, 1.7]) {
      game.state.time = time
      game.state.players[0].health--
      audio.update(game.state, 'local')
    }
    expect(context.voices).toHaveLength(0)
    audio.stop()
    game.state.time = 0
    audio.start()
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    game.state.phase = 'lost'
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it('plays a team-wide sting when any rabbit is spotted and a soft "?" only for local suspicion', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const [first, second] = game.state.predators
    const at = (time: number) => {
      game.state.time = time
      audio.update(JSON.parse(JSON.stringify(game.state)), 'local')
    }
    Object.assign(first, { state: 'suspicious', targetId: 'friend' })
    at(1)
    expect(context.voices).toHaveLength(0)
    Object.assign(first, { state: 'suspicious', targetId: 'local' })
    first.state = 'patrol'
    at(1.1)
    first.state = 'suspicious'
    at(1.2)
    expect(context.voices).toHaveLength(2)
    Object.assign(second, { state: 'chase', targetId: 'friend' })
    at(1.3)
    expect(context.voices).toHaveLength(6)
    expect(context.voices.some((voice) => voice.type === 'square')).toBe(true)
    first.state = 'chase'
    at(1.4)
    expect(context.voices).toHaveLength(10)
    audio.setMuted(true)
    Object.assign(first, { state: 'patrol' })
    at(5)
    first.state = 'chase'
    at(5.1)
    expect(context.voices).toHaveLength(10)
    audio.stop()
  })

  it('warns when a suspicious predator switches from a teammate to the local rabbit', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const predator = game.state.predators[0]
    const update = (time: number) => {
      game.state.time = time
      audio.update(game.state, 'local')
    }
    Object.assign(predator, { state: 'suspicious', targetId: 'friend' })
    update(1)
    expect(context.voices).toHaveLength(0)
    predator.targetId = 'local'
    update(1.1)
    expect(context.voices).toHaveLength(2)
    update(1.2)
    expect(context.voices).toHaveLength(2)
    predator.targetId = 'friend'
    update(1.3)
    predator.targetId = 'local'
    update(1.4)
    expect(context.voices).toHaveLength(2)
    predator.targetId = 'friend'
    update(4)
    predator.targetId = 'local'
    update(4.1)
    expect(context.voices).toHaveLength(4)
    audio.stop()
  })

  it('warns when the real predator AI retargets during suspicion', () => {
    const { audio, game, context } = setup()
    game.addPlayer('friend', 'Friend')
    const predator = game.state.predators[0]
    Object.assign(predator, { kind: 'fox', x: 0, y: 0, z: 0, angle: 0, state: 'patrol', targetId: null, suspicion: 0 })
    game.state.predators = [predator]
    audio.update(game.state, 'local')
    const detector = new JuiceDetector()
    detector.update(game.state, 'local')
    const mind = newMind()
    const targets = [
      { id: 'friend', x: 0, y: 0, z: 9, visibility: 1 },
      { id: 'local', x: 0, y: 0, z: 10, visibility: 1 }
    ]
    const tick = () => {
      game.state.time += 1 / 60
      updatePredator(predator, mind, targets, {
        dt: 1 / 60,
        time: game.state.time,
        droppings: [],
        scents: new Map(),
        terrain: { heightAt: () => 0, sightLine: () => 1 },
        random: () => 0.5
      })
      audio.update(game.state, 'local')
      return detector.update(game.state, 'local')
    }
    expect(tick()).toEqual([])
    expect(predator).toMatchObject({ state: 'suspicious', targetId: 'friend' })
    expect(context.voices).toHaveLength(0)
    targets[0].z = 20
    expect(tick()).toEqual([expect.objectContaining({ type: 'suspicious' })])
    expect(predator).toMatchObject({ state: 'suspicious', targetId: 'local' })
    expect(context.voices).toHaveLength(2)
    audio.stop()
  })

  it('keeps search music until the last related enemy stops, without adopting unrelated searches', () => {
    const { audio, game, context } = setup()
    const [first, second] = game.state.predators
    const update = (time: number) => {
      game.state.time = time
      context.currentTime = time
      audio.update(game.state, 'local')
    }
    first.state = 'chase'
    update(1)
    Object.assign(first, { state: 'search', targetId: null })
    Object.assign(second, { state: 'search', targetId: null })
    update(2)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-1)?.frequency.setValueAtTime).toHaveBeenCalledWith(196, 2)
    update(6)
    first.state = 'patrol'
    update(6.5)
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 6.5)
    audio.stop()
  })

  it('consumes muted discoveries, supports rediscovery and clears search history on stop and phase end', () => {
    const { audio, game, context } = setup()
    const predator = game.state.predators[0]
    predator.state = 'chase'
    game.state.time = 1
    audio.setMuted(true)
    audio.update(game.state, 'local')
    audio.setMuted(false)
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(0)
    Object.assign(predator, { state: 'search', targetId: null })
    game.state.time = 2
    audio.update(game.state, 'local')
    Object.assign(predator, { state: 'chase', targetId: 'local' })
    game.state.time = 2.1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(4)
    game.state.phase = 'lost'
    audio.update(game.state, 'local')
    game.state.phase = 'playing'
    Object.assign(predator, { state: 'search', targetId: null })
    game.state.time = 3
    context.currentTime = 3
    audio.update(game.state, 'local')
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 3)
    audio.stop()
    audio.start()
    game.state.time = 0
    context.currentTime = 0
    audio.update(game.state, 'local')
    vi.advanceTimersByTime(250)
    expect(context.voices.at(-2)?.frequency.setValueAtTime).toHaveBeenCalledWith(440 * 2 ** ((72 - 69) / 12), 0)
    audio.stop()
  })

  it('marks bedding deliveries, new seasons and lost kits once each', () => {
    const { audio, game, context } = setup()
    game.state.bedding = 1
    game.state.time = 1
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(2)
    Object.assign(game.state, { time: 2, bedding: 6, chapter: 2 })
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(7)
    game.state.kits = [{ id: 'kit-0', x: 0, y: 0, z: 0, angle: 0, hidden: false, status: 'lost' }]
    game.state.time = 3
    audio.update(game.state, 'local')
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(10)
    audio.stop()
  })

  it('tolerates missing, throwing and rejected audio support', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const audio = new RabbitersAudio()
    expect(() => audio.start()).not.toThrow()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('denied')
      })
    )
    expect(() => audio.start()).not.toThrow()
    const { audio: rejected, context } = setup()
    context.resume.mockImplementation(() => Promise.reject(new Error('denied')))
    rejected.start()
    await Promise.resolve()
    rejected.stop()
    rejected.stop()
  })
})
