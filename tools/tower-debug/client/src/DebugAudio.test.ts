import { it, expect, vi } from 'vitest'
import { DebugAudio } from './DebugAudio'
import type { AssetRef } from './contracts'

const reference: AssetRef = {
  assetId: 'synthetic-audio',
  revision: 'synthetic',
  sha256: '0'.repeat(64),
  bytes: 4,
  mimeType: 'audio/wav'
}
function fixture(load = async () => new ArrayBuffer(4)) {
  const voices: {
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    onended: (() => void) | null
    playbackRate: { value: number }
    buffer?: unknown
    connect: ReturnType<typeof vi.fn>
  }[] = []
  const context = {
    state: 'running',
    destination: {},
    currentTime: 0,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({})),
    createGain: () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { setValueAtTime: vi.fn() }
    }),
    createBufferSource: () => {
      const voice = {
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
        onended: null,
        playbackRate: { value: 0 }
      }
      voices.push(voice)
      return voice
    }
  }
  const create = vi.fn(() => context as unknown as AudioContext)
  return {
    audio: new DebugAudio(vi.fn(), create, load),
    create,
    context,
    voices
  }
}
it('does not construct audio until gesture; individual audition has pitch1 and stops', async () => {
  // Arrange
  const fixtureData = fixture()
  // Act / Assert
  expect(fixtureData.create).not.toHaveBeenCalled()
  expect(fixtureData.audio.playReady(reference)).toBe(false)
  await fixtureData.audio.auditionFromGesture(reference)
  expect(fixtureData.create).toHaveBeenCalledTimes(1)
  expect(fixtureData.voices[0].start).toHaveBeenCalledOnce()
  expect(fixtureData.voices[0].playbackRate.value).toBe(1)
  fixtureData.audio.stop()
  expect(fixtureData.voices[0].stop).toHaveBeenCalledOnce()
  await fixtureData.audio.dispose()
  expect(fixtureData.context.close).toHaveBeenCalledOnce()
})
it('stopping while bytes are pending prevents late autoplay', async () => {
  // Arrange
  let resolve!: (value: ArrayBuffer) => void
  const data = fixture(
    () =>
      new Promise<ArrayBuffer>((done) => {
        resolve = done
      })
  )
  const audition = data.audio.auditionFromGesture(reference)
  await Promise.resolve()
  await Promise.resolve()
  // Act
  data.audio.stop()
  resolve(new ArrayBuffer(4))
  await audition
  // Assert
  expect(data.voices).toHaveLength(0)
  await data.audio.dispose()
})
it('a missing or muted candidate is dropped without delayed event replay', async () => {
  // Arrange
  const data = fixture()
  await data.audio.unlockFromGesture()
  // Act / Assert
  expect(data.audio.playReady(reference)).toBe(false)
  await data.audio.prepare(reference)
  data.audio.setMuted(true)
  expect(data.audio.playReady(reference)).toBe(false)
  data.audio.setMuted(false)
  expect(data.voices).toHaveLength(0)
  expect(data.audio.playReady({ ...reference, assetId: 'unknown' })).toBe(false)
  data.audio.cancelSelection()
  expect(data.audio.playReady(reference)).toBe(false)
  await data.audio.dispose()
})
it('explicit BGM loop audition keeps pitch 1 and stops on disposal', async () => {
  const data = fixture()
  await data.audio.auditionFromGesture(reference, true)
  expect((data.voices[0] as unknown as { loop: boolean }).loop).toBe(true)
  expect(data.voices[0].playbackRate.value).toBe(1)
  await data.audio.dispose()
  expect(data.voices[0].stop).toHaveBeenCalledOnce()
  await expect(data.audio.auditionFromGesture(reference)).rejects.toThrow('disposed')
})
it('stop during context unlock prevents a late audition from starting', async () => {
  const data = fixture()
  data.context.state = 'suspended'
  let finish!: () => void
  data.context.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const pending = data.audio.auditionFromGesture(reference)
  data.audio.stop()
  data.context.state = 'running'
  finish()
  await pending
  expect(data.voices).toHaveLength(0)
  await data.audio.dispose()
})
