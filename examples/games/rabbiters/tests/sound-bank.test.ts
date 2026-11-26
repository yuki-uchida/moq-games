import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CUES, SoundBank, STAGE_BEDS, type CueId } from '../src/sound-bank'
import { STAGES } from '../src/stages'

const folder = new URL('../src/sounds/', import.meta.url)

afterEach(() => vi.unstubAllGlobals())

describe('Rabbiters sound bank', () => {
  it('ships exactly the WAV files the cues name, as 16-bit PCM', () => {
    const files = readdirSync(folder).filter((name) => name.endsWith('.wav'))
    const named = Object.values(CUES).map((cue) => fileURLToPath(cue.url).split(/[\\/]/).at(-1))
    expect([...named].sort()).toEqual([...files].sort())
    for (const name of files) {
      const wav = readFileSync(new URL(name, folder))
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
      expect(wav.readUInt16LE(20)).toBe(1)
      expect(wav.readUInt16LE(34)).toBe(16)
    }
  })

  it('has a bed for every stage and keeps every cue gain finite and positive', () => {
    expect(STAGE_BEDS).toHaveLength(STAGES.length)
    for (const cue of Object.values(CUES)) {
      expect(Number.isFinite(cue.gain)).toBe(true)
      expect(cue.gain).toBeGreaterThan(0)
    }
  })

  it('fetches each file once, decodes per context and survives failures', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('query.wav')
        ? { ok: false, arrayBuffer: async () => new ArrayBuffer(0) }
        : { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }
    )
    vi.stubGlobal('fetch', fetch)
    const decoded = (cue: string) => ({ cue }) as unknown as AudioBuffer
    const context = (fail: boolean) =>
      ({
        decodeAudioData: vi.fn(async () => {
          if (fail) throw new Error('bad data')
          return decoded('x')
        })
      }) as unknown as BaseAudioContext
    const first = new SoundBank(context(false))
    const kept = decoded('kept')
    first.put('won', kept)
    await first.load()
    await first.load()
    expect(first.get('won')).toBe(kept)
    expect(first.get('chapter')).toBeDefined()
    expect(first.get('query')).toBeUndefined()
    const broken = new SoundBank(context(true))
    await broken.load()
    expect(broken.get('chapter')).toBeUndefined()
    const urls = fetch.mock.calls.map(([url]) => url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).toHaveLength((Object.keys(CUES) as CueId[]).length)
  })
})
