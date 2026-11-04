import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ExpeditionAudio } from '../src/audio'

vi.mock('../src/music', () => ({ composeMusic: () => new Uint8Array() }))
vi.mock('../src/settings', () => ({ bgmVolume: () => 0, sfxVolume: () => 1 }))

let events: EventTarget
class FakeAudio {
  paused = true
  dataset: Record<string, string> = {}
  volume = 1
  src = ''
  currentTime = 12
  play = vi.fn(async () => {
    this.paused = false
  })
  pause() {
    this.paused = true
  }
}
function show(persisted = true) {
  events.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }))
}
function unlock() {
  events.dispatchEvent(new Event('pointerdown'))
}
beforeEach(() => {
  events = new EventTarget()
  vi.stubGlobal('window', events)
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events))
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events))
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('document', { body: { append: vi.fn() } })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

it('resumes the selected track and position only after cached restoration', () => {
  const audio = new ExpeditionAudio(vi.fn())
  unlock()
  audio.setMusic('moonlit-ward')
  const source = audio.music.src
  events.dispatchEvent(new Event('pagehide'))
  expect(audio.music.paused).toBe(true)
  show(false)
  expect(audio.music.paused).toBe(true)
  show()
  expect(audio.music.paused).toBe(false)
  expect(audio.music.currentTime).toBe(12)
  expect(audio.music.volume).toBe(0)
  expect(audio.music.dataset.track).toBe('moonlit-ward')
  show()
  expect(audio.music.src).toBe(source)
  expect(audio.music.play).toHaveBeenCalledTimes(3)
})

it('does not unlock, unmute, or restart inactive battle music', () => {
  const audio = new ExpeditionAudio(vi.fn())
  show()
  expect(audio.music.play).not.toHaveBeenCalled()
  unlock()
  audio.toggle()
  show()
  expect(audio.music.paused).toBe(true)
  audio.toggle()
  audio.setBattle(false)
  show()
  expect(audio.music.paused).toBe(true)
  audio.setBattle(true)
  expect(audio.music.paused).toBe(false)
})

it.each(['AbortError', 'NotAllowedError'])('keeps existing %s handling on restore', async (name) => {
  const report = vi.fn()
  const audio = new ExpeditionAudio(report)
  unlock()
  audio.stop()
  vi.mocked(audio.music.play).mockRejectedValueOnce(Object.assign(new Error(), { name }))
  show()
  await Promise.resolve()
  expect(report).toHaveBeenCalledTimes(name === 'AbortError' ? 0 : 1)
})
