import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BattleMusic,
  loadMusicPreferences,
  saveMusicPreferences,
  MUSIC_PREFERENCES_KEY
} from '../src/audio/BattleMusic'

function setup(play = vi.fn(() => Promise.resolve())) {
  const media = {
    loop: false,
    preload: '',
    volume: 1,
    currentTime: 13,
    src: 'battle.mp3',
    play,
    pause: vi.fn(),
    load: vi.fn()
  }
  const music = new BattleMusic(media, undefined, 'boss.mp3')
  return { music, media }
}
afterEach(() => vi.unstubAllGlobals())
describe('battle-only streamed music', () => {
  it('waits for an assault and a gesture; loops one low-volume element', async () => {
    const { music, media } = setup()
    music.unlock()
    expect(media.play).not.toHaveBeenCalled()
    music.setBattle(true, 'run:1')
    music.setBattle(true, 'run:1')
    music.unlock()
    await Promise.resolve()
    expect(media.play).toHaveBeenCalledTimes(1)
    expect(media.loop).toBe(true)
    expect(media.preload).toBe('none')
    expect(media.volume).toBeCloseTo(0.16)
    music.setBattle(false, 'run:1')
    expect(media.currentTime).toBe(0)
    expect(music.diagnostics.playing).toBe(false)
  })
  it('supports muted and hidden states independently of SFX, and resets a new battle', () => {
    const { music, media } = setup()
    music.setBattle(true, 'run:1')
    expect(media.play).not.toHaveBeenCalled()
    music.unlock()
    music.configure({ enabled: false, volume: 0.1 })
    expect(music.diagnostics.playing).toBe(false)
    music.configure({ enabled: true, volume: 0.1 })
    music.setVisible(false)
    expect(music.diagnostics.playing).toBe(false)
    music.setVisible(true)
    media.currentTime = 42
    music.setBattle(true, 'run:2')
    expect(media.currentTime).toBe(0)
    expect(media.volume).toBeCloseTo(0.08)
    music.destroy()
    music.unlock()
    expect(music.diagnostics.playing).toBe(false)
    expect(media.src).toBe('')
  })
  it('handles autoplay rejection without per-frame retries; a gesture can retry', async () => {
    const play = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(undefined)
    const { music } = setup(play)
    music.unlock()
    music.setBattle(true, 'run:1')
    await Promise.resolve()
    await Promise.resolve()
    expect(music.diagnostics.playing).toBe(false)
    music.setBattle(true, 'run:1')
    expect(play).toHaveBeenCalledTimes(1)
    music.unlock()
    await Promise.resolve()
    expect(play).toHaveBeenCalledTimes(2)
    expect(music.diagnostics.playing).toBe(true)
  })
  it('does not let a late play completion revive stopped music', async () => {
    let resolve!: () => void
    const { music } = setup(
      vi.fn(
        () =>
          new Promise<void>((done) => {
            resolve = done
          })
      )
    )
    music.unlock()
    music.setBattle(true, 'run:1')
    music.setBattle(false)
    resolve()
    await Promise.resolve()
    expect(music.diagnostics.playing).toBe(false)
  })
  it('uses normal music for stages 1–9, switches to boss only at 10, then resets on retry/new run', async () => {
    const { music, media } = setup()
    music.unlock()
    for (let stage = 1; stage <= 9; stage++) {
      music.setBattle(true, `run:${stage}`, stage)
      expect(media.src).toBe('battle.mp3')
      expect(music.diagnostics.track).toBe('normal')
    }
    music.setBattle(true, 'run:10', 10)
    expect(media.src).toBe('boss.mp3')
    expect(media.currentTime).toBe(0)
    expect(music.diagnostics.track).toBe('boss')
    expect(media.play).toHaveBeenCalledTimes(10)
    music.setBattle(false, 'run:10', 10)
    music.setBattle(true, 'retry:10', 10)
    expect(media.src).toBe('boss.mp3')
    music.setBattle(false)
    music.setBattle(true, 'new:1', 1)
    expect(media.src).toBe('battle.mp3')
    const resumed = setup()
    resumed.music.unlock()
    resumed.music.setBattle(true, 'continued:10', 10)
    expect(resumed.media.src).toBe('boss.mp3')
    expect(resumed.media.play).toHaveBeenCalledTimes(1)
  })
  it('chooses each normal track with equal RNG ranges, never rerolls the same battle, and keeps Continue selection', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key)
    })
    const { media } = setup()
    const random = vi.fn().mockReturnValueOnce(0.49).mockReturnValueOnce(0.5).mockReturnValue(0)
    const music = new BattleMusic(media, undefined, 'boss.mp3', 'normal-2.mp3', random)
    music.unlock()
    music.setBattle(true, 'seed:field:1', 1)
    expect(media.src).toBe('battle.mp3')
    music.setBattle(true, 'seed:field:1', 1)
    music.configure({ enabled: false, volume: 0.1 })
    music.configure({ enabled: true, volume: 0.1 })
    music.unlock()
    music.setVisible(false)
    music.setVisible(true)
    expect(random).toHaveBeenCalledTimes(1)
    music.setBattle(true, 'seed:field:9', 9)
    expect(media.src).toBe('normal-2.mp3')
    const resumed = setup()
    const continued = new BattleMusic(resumed.media, undefined, 'boss.mp3', 'normal-2.mp3', random)
    continued.unlock()
    continued.setBattle(true, 'seed:field:9', 9)
    expect(resumed.media.src).toBe('normal-2.mp3')
    expect(random).toHaveBeenCalledTimes(2)
    music.setBattle(true, 'seed:field:10', 10)
    expect(media.src).toBe('boss.mp3')
    expect(random).toHaveBeenCalledTimes(2)
    music.resetSelection()
    music.setBattle(false)
    music.setBattle(true, 'seed:field:1', 1)
    expect(random).toHaveBeenCalledTimes(3)
  })
  it('scales defaults and saved preferences once without changing storage across reloads', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value)
    })
    const first = setup()
    first.music.configure(loadMusicPreferences())
    expect(first.media.volume).toBeCloseTo(0.16)
    saveMusicPreferences({ enabled: true, volume: 0.75 })
    for (let reload = 0; reload < 3; reload++) {
      const resumed = setup()
      const preferences = loadMusicPreferences()
      resumed.music.configure(preferences)
      expect(preferences.volume).toBe(0.75)
      expect(resumed.media.volume).toBeCloseTo(0.6)
      saveMusicPreferences(preferences)
    }
    expect(JSON.parse(data.get(MUSIC_PREFERENCES_KEY)!)).toEqual({ enabled: true, volume: 0.75 })
  })
  it('applies slider changes immediately, clamps extremes, and preserves mute behavior', () => {
    const { music, media } = setup()
    music.unlock()
    music.setBattle(true, 'volume:1')
    for (const [input, output] of [
      [0.5, 0.4],
      [0, 0],
      [1, 0.8],
      [-1, 0],
      [2, 0.8]
    ]) {
      music.configure({ enabled: true, volume: input })
      expect(media.volume).toBeCloseTo(output)
    }
    music.configure({ enabled: false, volume: 0.5 })
    expect(music.diagnostics.playing).toBe(false)
    expect(media.volume).toBeCloseTo(0.4)
    music.configure({ enabled: true, volume: 0.5 })
    expect(music.diagnostics.playing).toBe(true)
    expect(media.volume).toBeCloseTo(0.4)
  })
  it('persists music preferences and tolerates missing or corrupt storage', () => {
    const getItem = vi.fn(() => '{bad')
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem, setItem })
    expect(loadMusicPreferences()).toEqual({ enabled: true, volume: 0.2 })
    getItem.mockReturnValue('{"enabled":false,"volume":0.35}')
    expect(loadMusicPreferences()).toEqual({ enabled: false, volume: 0.35 })
    saveMusicPreferences({ enabled: false, volume: 0.35 })
    expect(setItem).toHaveBeenCalledWith(MUSIC_PREFERENCES_KEY, '{"enabled":false,"volume":0.35}')
  })
})
