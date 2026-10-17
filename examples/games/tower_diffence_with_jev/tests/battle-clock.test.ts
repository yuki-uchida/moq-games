import { afterEach, describe, expect, it, vi } from 'vitest'
import { BattleClock } from '../src/clock/BattleClock'
import { WorkerPulse } from '../src/clock/WorkerPulse'
import type { ClockPulse } from '../src/clock/protocol'

function battleClock(step = vi.fn(() => true)) {
  const worker = Object.assign(new EventTarget(), { postMessage: vi.fn(), terminate: vi.fn() })
  const callbacks = { step, discarded: vi.fn(), failed: vi.fn() }
  const clock = new BattleClock(worker, callbacks, () => 1000)
  const tick = (generation: number, sequence: number, nowMs: number) =>
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'tick', generation, sequence, nowMs } }))
  return { clock, worker, callbacks, tick }
}

function workerPulse() {
  vi.useFakeTimers()
  const pulses: ClockPulse[] = []
  const pulse = new WorkerPulse({
    now: () => Date.now(),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    send: (value) => pulses.push(value)
  })
  return { pulse, pulses }
}

afterEach(() => vi.useRealTimers())

describe('battle clock boundaries', () => {
  it('bounds catch-up to two seconds and discards excess instead of replaying it later', () => {
    const { clock, callbacks, tick, worker } = battleClock()
    clock.start()
    tick(1, 1, 6000)
    expect(callbacks.step).toHaveBeenCalledTimes(120)
    expect(callbacks.step).toHaveBeenLastCalledWith(1 / 60)
    expect(callbacks.discarded).toHaveBeenCalledExactlyOnceWith(3000)
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'ack', generation: 1, sequence: 1 })
    tick(1, 2, 6020)
    expect(callbacks.step).toHaveBeenCalledTimes(121)
    clock.dispose()
  })

  it('ignores stopped, old-generation, duplicate and out-of-order pulses after restart', () => {
    const { clock, callbacks, tick } = battleClock()
    clock.start()
    clock.stop()
    tick(1, 1, 1020)
    clock.start()
    tick(1, 1, 1020)
    tick(3, 2, 1020)
    expect(callbacks.step).not.toHaveBeenCalled()
    tick(3, 1, 1020)
    tick(3, 1, 1040)
    expect(callbacks.step).toHaveBeenCalledTimes(1)
    tick(3, 2, 1040)
    expect(callbacks.step).toHaveBeenCalledTimes(2)
    clock.dispose()
  })

  it('stops the catch-up batch when gameplay stops, and disposes on errors', () => {
    const stopped = battleClock(vi.fn(() => false))
    stopped.clock.start()
    stopped.tick(1, 1, 3000)
    expect(stopped.callbacks.step).toHaveBeenCalledTimes(1)
    stopped.tick(1, 2, 3020)
    expect(stopped.callbacks.step).toHaveBeenCalledTimes(1)
    stopped.clock.dispose()
    for (const event of ['error', 'messageerror']) {
      const { clock, callbacks, tick, worker } = battleClock()
      clock.start()
      worker.dispatchEvent(new Event(event))
      clock.start()
      tick(1, 1, 1020)
      worker.dispatchEvent(new Event(event))
      expect(callbacks.step).not.toHaveBeenCalled()
      expect(callbacks.failed).toHaveBeenCalledTimes(1)
      expect(worker.terminate).toHaveBeenCalledTimes(1)
    }
    const disposed = battleClock()
    disposed.clock.start()
    disposed.clock.dispose()
    disposed.tick(1, 1, 1020)
    expect(disposed.callbacks.step).not.toHaveBeenCalled()
    expect(disposed.callbacks.failed).not.toHaveBeenCalled()
  })

  it('keeps one pulse in flight until its matching ack and ignores stale acks', () => {
    const { pulse, pulses } = workerPulse()
    pulse.receive({ type: 'start', generation: 1 })
    vi.advanceTimersByTime(1000)
    expect(pulses.map(({ generation, sequence }) => [generation, sequence])).toEqual([[1, 1]])
    pulse.receive({ type: 'ack', generation: 0, sequence: 1 })
    pulse.receive({ type: 'ack', generation: 1, sequence: 2 })
    vi.advanceTimersByTime(1000)
    expect(pulses).toHaveLength(1)
    pulse.receive({ type: 'ack', generation: 1, sequence: 1 })
    pulse.receive({ type: 'ack', generation: 1, sequence: 1 })
    vi.advanceTimersByTime(1000)
    expect(pulses.map(({ generation, sequence }) => [generation, sequence])).toEqual([
      [1, 1],
      [1, 2]
    ])
    pulse.dispose()
  })

  it('cancels scheduled pulses on stop and dispose, preserving generation isolation', () => {
    const { pulse, pulses } = workerPulse()
    pulse.receive({ type: 'start', generation: 1 })
    pulse.receive({ type: 'stop', generation: 2 })
    vi.advanceTimersByTime(100)
    expect(pulses).toHaveLength(0)
    pulse.receive({ type: 'start', generation: 3 })
    pulse.receive({ type: 'stop', generation: 2 })
    vi.advanceTimersByTime(100)
    expect(pulses).toHaveLength(1)
    pulse.receive({ type: 'ack', generation: 1, sequence: 1 })
    vi.advanceTimersByTime(100)
    expect(pulses).toHaveLength(1)
    pulse.receive({ type: 'ack', generation: 3, sequence: 1 })
    pulse.dispose()
    pulse.receive({ type: 'start', generation: 4 })
    vi.advanceTimersByTime(100)
    expect(pulses).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
