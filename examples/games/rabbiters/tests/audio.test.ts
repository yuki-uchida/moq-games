import { afterEach, describe, expect, it, vi } from 'vitest'
import { Game } from '../src/game'
import { RabbitersAudio } from '../src/audio'

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
  voices: ReturnType<Context['createOscillator']>[] = []
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
  createGain() {
    return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
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
