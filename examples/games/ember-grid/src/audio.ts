/** Reuses only owner-approved public recordings; never creates or modifies assets. */
const storageKey = 'ember-grid:sound'
import { bgmVolume, sfxVolume } from './settings'
export const jingleNotes = {
  defeat: [392, 330, 262],
  victory: [523, 659, 784],
  final: [523, 659, 784, 1047]
} as const
function storedEnabled() {
  try {
    return localStorage.getItem(storageKey) !== 'off'
  } catch {
    return true
  }
}
export class ExpeditionAudio {
  enabled = storedEnabled()
  private battle = true
  private unlocked = false
  private context?: AudioContext
  private jingleGain?: GainNode
  private title = true
  readonly music = new Audio(`${import.meta.env.BASE_URL}tower-defense-music/monster-assault.mp3`)
  private sounds = new Map<string, string>()
  private preparedVoices = new Map<string, HTMLAudioElement>()
  private voices: HTMLAudioElement[] = []
  constructor(private report: (message: string) => void) {
    this.music.loop = true
    this.music.volume = 0.07
    this.music.preload = 'none'
    this.music.dataset.emberMusic = 'true'
    document.body.append(this.music)
    // Music is on by default; autoplay policy allows it from the first user gesture.
    const unlock = () => {
      removeEventListener('pointerdown', unlock, true)
      removeEventListener('keydown', unlock, true)
      this.unlocked = true
      this.start()
    }
    addEventListener('pointerdown', unlock, true)
    addEventListener('keydown', unlock, true)
    // The battle keeps running while hidden, so music and voices keep playing too.
    window.addEventListener('pagehide', () => this.stop())
  }
  async prepare(roles: string[]) {
    // Small, existing action cues only; music streams separately. The healer cue doubles as quiet potion feedback.
    for (const role of new Set([...roles, 'healer'])) {
      if (this.sounds.has(role)) continue
      const response = await fetch(`${import.meta.env.BASE_URL}tower-defense-sfx/${role}_attack.wav`, {
        signal: AbortSignal.timeout(15000)
      })
      if (!response.ok) throw new Error(`Sound ${response.status}: ${role}`)
      const url = URL.createObjectURL(await response.blob())
      const voice = new Audio(url)
      voice.preload = 'auto'
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => finish(new Error(`Sound timeout: ${role}`)), 15000)
          const finish = (error?: Error) => {
            clearTimeout(timer)
            voice.oncanplaythrough = null
            voice.onerror = null
            error ? reject(error) : resolve()
          }
          voice.oncanplaythrough = () => finish()
          voice.onerror = () => finish(new Error(`Sound decode: ${role}`))
          voice.load()
        })
        this.sounds.set(role, url)
        this.preparedVoices.set(role, voice)
      } catch (error) {
        voice.removeAttribute('src')
        voice.load()
        URL.revokeObjectURL(url)
        throw error
      }
    }
  }
  setMusic(name: string) {
    const source = `${import.meta.env.BASE_URL}tower-defense-music/${name}.mp3`
    if (this.music.getAttribute('src') === source) return
    this.music.pause()
    this.music.src = source
    this.start()
  }
  toggle() {
    this.enabled = !this.enabled
    try {
      localStorage.setItem(storageKey, this.enabled ? 'on' : 'off')
    } catch {
      // Preference just won't persist.
    }
    if (this.enabled) this.start()
    else this.stop()
    return this.enabled
  }
  applySettings() {
    this.music.volume = (this.title ? 0.025 : 0.07) * bgmVolume()
    if (this.jingleGain) this.jingleGain.gain.value = this.enabled ? sfxVolume() : 0
    this.voices.forEach((voice) => {
      voice.volume = Number(voice.dataset.baseVolume) * sfxVolume()
    })
  }
  setTitle(title: boolean) {
    this.title = title
    this.applySettings()
  }
  setBattle(active: boolean) {
    if (this.battle === active) return
    this.battle = active
    if (active) this.start()
    else this.stop()
  }
  start() {
    if (this.unlocked && this.enabled && this.battle && this.music.paused)
      void this.music.play().catch((error: Error) => {
        if (error.name !== 'AbortError') this.report('音を再生できません。♫ を再度押してください')
      })
  }
  jingle(kind: 'victory' | 'defeat' | 'final') {
    if (!this.enabled || !this.unlocked || !sfxVolume()) return
    this.context ??= new AudioContext()
    void this.context.resume()
    this.jingleGain?.disconnect()
    this.jingleGain = this.context.createGain()
    this.jingleGain.gain.value = sfxVolume()
    this.jingleGain.connect(this.context.destination)
    const notes = jingleNotes[kind]
    const now = this.context.currentTime
    notes.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator()
      const gain = this.context!.createGain()
      const start = now + index * 0.13
      oscillator.type = 'triangle'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24)
      oscillator.connect(gain).connect(this.jingleGain!)
      oscillator.start(start)
      oscillator.stop(start + 0.25)
    })
    this.music.dataset.jingle = kind
  }
  stop() {
    this.music.pause()
    if (this.jingleGain) this.jingleGain.gain.value = 0
    this.voices.forEach((v) => {
      v.pause()
      v.remove()
    })
    this.voices = []
  }
  cue(role = 'healer') {
    if (!this.enabled) return
    this.voices = this.voices.filter((v) => !v.ended && !v.paused)
    if (this.voices.length >= 4) {
      const oldest = this.voices.shift()!
      oldest.pause()
      oldest.remove()
    }
    const file = role
    const prepared = this.preparedVoices.get(file)
    const voice = prepared && (prepared.paused || prepared.ended) ? prepared : new Audio(this.sounds.get(file))
    voice.currentTime = 0
    voice.dataset.emberVoice = 'true'
    document.body.append(voice)
    voice.addEventListener('ended', () => voice.remove(), { once: true })
    voice.dataset.baseVolume = String(role === 'healer' ? 0.15 : 0.32)
    voice.volume = Number(voice.dataset.baseVolume) * sfxVolume()
    this.voices.push(voice)
    void voice.play().catch(() => this.report('効果音を読み込めませんでした'))
  }
}
