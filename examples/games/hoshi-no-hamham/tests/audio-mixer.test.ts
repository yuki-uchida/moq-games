import { describe, expect, test } from 'vitest'
import { makeImpulse } from '../src/audio/mixer'

/** The few parts of an AudioBuffer and a context that the impulse builder touches. */
function fakeContext(sampleRate: number) {
  return {
    sampleRate,
    createBuffer(channels: number, length: number, rate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (c: number) => data[c] }
    }
  } as unknown as BaseAudioContext
}

/** FNV-1a over the raw float bits of every channel. */
function hashOf(buf: AudioBuffer): string {
  let h = 0x811c9dc5
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const bytes = new Uint8Array(buf.getChannelData(c).buffer)
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i]
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0')
}

describe('reverb impulse responses', () => {
  test('the numbers that come out of makeImpulse are pinned', () => {
    const hashes = [44100, 48000].map((rate) => {
      const ctx = fakeContext(rate)
      return [hashOf(makeImpulse(ctx, 2.6, 2.4, 0.5)), hashOf(makeImpulse(ctx, 1.1, 3, 1.2))]
    })
    expect(hashes).toEqual([
      ['d4618224', '2e9bd6af'],
      ['4fabb919', 'd636ae60']
    ])
  })
})
