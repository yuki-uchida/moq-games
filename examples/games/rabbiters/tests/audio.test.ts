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
  audio.start()
  audio.update(game.state, 'local')
  return { audio, game, context }
}

describe('Rabbiters audio', () => {
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
    expect(context.voices).toHaveLength(10)
    audio.update(game.state, 'local')
    audio.update(JSON.parse(JSON.stringify(game.state)), 'local')
    audio.update({ ...game.state, time: 0 }, 'local')
    expect(context.voices).toHaveLength(10)
    game.state.phase = 'won'
    audio.update(game.state, 'local')
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(14)
    audio.stop()
  })

  it('throttles continuous damage and consumes muted events without replay', () => {
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
    expect(context.voices).toHaveLength(2)
    audio.stop()
    game.state.time = 0
    audio.start()
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(2)
    game.state.phase = 'lost'
    audio.update(game.state, 'local')
    expect(context.voices).toHaveLength(6)
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
