import { describe, expect, it } from 'vitest'
import { composeMusic, musicTracks } from '../src/music'
import { campaign } from '../src/campaign'

describe('original music scores', () => {
  it('assigns three original themes without recording dependencies', () => {
    expect(campaign.map((chapter) => chapter.music)).toEqual([
      'ember-march',
      'ember-march',
      'ember-march',
      'moonlit-ward',
      'moonlit-ward',
      'crown-of-embers'
    ])
  })
  for (const track of musicTracks)
    it(`${track} has audible, unclipped A/B PCM music and a quiet loop boundary`, () => {
      const buffer = composeMusic(track)
      const view = new DataView(buffer)
      expect(new TextDecoder().decode(buffer.slice(0, 4))).toBe('RIFF')
      expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8)
      expect(view.getUint32(40, true)).toBe(buffer.byteLength - 44)
      const samples = new Int16Array(buffer, 44)
      const duration = samples.length / view.getUint32(24, true)
      expect(duration).toBeGreaterThan(28)
      expect(duration).toBeLessThan(41)
      for (let second = 0; second < Math.floor(duration); second++) {
        const window = samples.subarray(second * 22050, (second + 1) * 22050)
        const rms = Math.sqrt(window.reduce((energy, sample) => energy + (sample / 32768) ** 2, 0) / window.length)
        expect(rms).toBeGreaterThan(0.05)
      }
      expect(samples.every((sample) => Math.abs(sample) < 30000)).toBe(true)
      expect(samples[0]).toBe(0)
      expect(samples[samples.length - 1]).toBe(0)
      expect(samples.slice(0, 22050)).not.toEqual(
        samples.slice(Math.floor(samples.length / 2), Math.floor(samples.length / 2) + 22050)
      )
      expect(new Uint8Array(composeMusic(track))).toEqual(new Uint8Array(buffer))
    })
})
