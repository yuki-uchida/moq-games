import { describe, it, expect } from 'vitest'
import { Transport, frameAt } from './Transport'
import type { Clock } from './contracts'

const attack: Clock = {
  durationMs: 750,
  loop: false,
  frameStartTimesMs: Array.from({ length: 50 }, (_, i) => i * 15),
  events: [{ type: 'hit', atMs: 285 }]
}
describe('deterministic source transport', () => {
  it('preserves nonuniform source boundaries and silent stepping', () => {
    // Arrange
    const clock = {
      durationMs: 250,
      loop: false,
      frameStartTimesMs: [0, 35, 100, 140, 210],
      events: []
    }
    const transport = new Transport()
    transport.configure(clock)
    // Act / Assert
    expect(frameAt(clock, 34.99)).toBe(0)
    expect(frameAt(clock, 35)).toBe(1)
    for (const expected of [35, 100, 140, 210, 250]) {
      transport.step(1)
      expect(transport.timeMs).toBe(expected)
      expect(transport.paused).toBe(true)
    }
    transport.step(-1)
    expect(transport.timeMs).toBe(210)
  })
  for (const speed of [0.25, 0.5, 1, 2])
    it(`crosses hit285 exactly once at${speed} speed`, () => {
      // Arrange
      const transport = new Transport()
      transport.configure(attack)
      transport.setSpeed(speed)
      transport.play(0)
      // Act
      const events = []
      for (let time = 10; time <= 4000; time += 10) events.push(...transport.advance(time))
      // Assert
      expect(events).toHaveLength(1)
      expect(events[0].atMs).toBe(285)
      expect(transport.timeMs).toBe(750)
      expect(transport.paused).toBe(true)
    })
  it('seek and large stalls never replay historical cues', () => {
    // Arrange
    const transport = new Transport()
    transport.configure(attack)
    // Act
    transport.seek(500)
    transport.play(0)
    const afterSeek = transport.advance(20)
    transport.seek(0)
    transport.play(0)
    const stalled = transport.advance(600)
    // Assert
    expect(afterSeek).toEqual([])
    expect(stalled).toEqual([])
    expect(transport.timeMs).toBe(600)
  })
  it('replay creates another epoch while pause/resume does not duplicate', () => {
    // Arrange
    const transport = new Transport()
    transport.configure(attack)
    transport.play(0)
    // Act
    transport.advance(200)
    const first = transport.advance(300)
    transport.pause()
    transport.play(400)
    const resumed = transport.advance(450)
    transport.seek(0)
    transport.play(500)
    transport.advance(700)
    const replay = transport.advance(800)
    // Assert
    expect(first).toHaveLength(1)
    expect(resumed).toEqual([])
    expect(replay).toHaveLength(1)
    expect(replay[0].epoch).toBeGreaterThan(first[0].epoch)
  })
  it('loops on its own clock and preserves original versus baked duration', () => {
    // Arrange
    const source = new Transport(),
      baked = new Transport()
    source.configure({
      durationMs: 300,
      loop: true,
      frameStartTimesMs: [0, 100, 200],
      events: []
    })
    baked.configure({
      durationMs: 1000,
      loop: true,
      frameStartTimesMs: [0, 500],
      events: []
    })
    source.play(0)
    baked.play(0)
    // Act
    source.advance(400)
    baked.advance(400)
    // Assert
    expect(source.timeMs).toBe(100)
    expect(baked.timeMs).toBe(400)
  })
  it('keeps explicit end sampling and rejects invalid clocks', () => {
    // Arrange
    const transport = new Transport()
    transport.configure(attack)
    // Act / Assert
    transport.seek(750)
    expect(transport.sampleTime('source-clock')).toBe(750)
    transport.seek(286)
    expect(transport.sampleTime('source-clock')).toBe(285)
    expect(transport.sampleTime('continuous')).toBe(286)
    expect(() => transport.configure({ ...attack, frameStartTimesMs: [0, 30, 20] })).toThrow()
  })
})
