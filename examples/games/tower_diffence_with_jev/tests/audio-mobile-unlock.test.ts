import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindAudioUnlock } from '../src/audio/AudioUnlock'
import { SoundPlayer } from '../src/audio/SoundPlayer'

function gestureTarget() {
  const listeners = new Map<string, EventListener>()
  const target = {
    addEventListener: vi.fn((type: string, callback: EventListener) =>
      listeners.set(type, callback),
    ),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  } as unknown as EventTarget
  return {
    target,
    send(type: string, pointerType = '', isTrusted = true) {
      listeners.get(type)?.({ type, pointerType, isTrusted } as PointerEvent)
    },
  }
}
function audioContext() {
  let resolveBlocked!: () => void
  const blocked = new Promise<void>((resolve) => {
    resolveBlocked = resolve
  })
  const context = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    onstatechange: null,
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    resume: vi.fn(() => blocked),
    close: vi.fn(async () => {}),
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context
    }),
  )
  return { context, resolveBlocked }
}
afterEach(() => vi.unstubAllGlobals())

describe('activation-backed mobile audio', () => {
  it('unlocks synchronously on touch/pen release, mouse press and keyboard', () => {
    const { target, send } = gestureTarget()
    const unlock = vi.fn()
    const dispose = bindAudioUnlock(target, unlock)
    send('pointerdown', 'touch')
    send('pointerdown', 'pen')
    expect(unlock).not.toHaveBeenCalled()
    for (const [type, pointer] of [
      ['pointerup', 'touch'],
      ['pointerup', 'pen'],
      ['touchend', ''],
      ['pointerdown', 'mouse'],
      ['keydown', ''],
    ]) {
      const before = unlock.mock.calls.length
      send(type, pointer)
      expect(unlock).toHaveBeenCalledTimes(before + 1)
    }
    send('pointerup', 'mouse')
    send('touchend', '', false)
    expect(unlock).toHaveBeenCalledTimes(5)
    dispose()
    send('pointerup', 'touch')
    send('touchend')
    send('keydown')
    expect(unlock).toHaveBeenCalledTimes(5)
    expect(target.removeEventListener).toHaveBeenCalledTimes(4)
  })

  it('retries resume synchronously even while a pre-activation resume is pending', async () => {
    const { context, resolveBlocked } = audioContext()
    const player = new SoundPlayer([])
    const first = player.unlock()
    expect(context.resume).toHaveBeenCalledTimes(1)
    context.resume.mockImplementation(() => {
      context.state = 'running'
      return Promise.resolve()
    })
    const second = player.unlock()
    expect(context.resume).toHaveBeenCalledTimes(2)
    await second
    expect(player.status.state).toBe('ready')
    resolveBlocked()
    await first
    player.destroy()
  })

  it('recovers interrupted audio on a later touch release and never starts after disposal', async () => {
    const { context } = audioContext()
    context.resume.mockImplementation(() => {
      context.state = 'running'
      return Promise.resolve()
    })
    const player = new SoundPlayer([])
    const { target, send } = gestureTarget()
    const dispose = bindAudioUnlock(target, () => {
      void player.unlock()
    })
    send('pointerdown', 'touch')
    expect(context.resume).not.toHaveBeenCalled()
    send('pointerup', 'touch')
    expect(context.resume).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    context.state = 'interrupted'
    send('pointerup', 'touch')
    expect(context.resume).toHaveBeenCalledTimes(2)
    dispose()
    player.destroy()
    send('pointerup', 'touch')
    await player.unlock()
    expect(context.resume).toHaveBeenCalledTimes(2)
  })
  it('retries a rejected resume on the next gesture and does not resume a running context', async () => {
    const { context } = audioContext()
    context.resume.mockImplementation(() =>
      Promise.reject(new Error('not activated')),
    )
    const player = new SoundPlayer([])
    await player.unlock()
    expect(player.status.state).toBe('error')
    context.resume.mockImplementation(() => {
      context.state = 'running'
      return Promise.resolve()
    })
    await player.unlock()
    expect(player.status.state).toBe('ready')
    await player.unlock()
    expect(context.resume).toHaveBeenCalledTimes(2)
    player.destroy()
  })
})
