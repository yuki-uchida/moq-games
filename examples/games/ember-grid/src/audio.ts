/** Reuses only owner-approved public recordings; never creates or modifies assets. */
export class ExpeditionAudio {
  enabled = false
  private battle = true
  readonly music = new Audio(`${import.meta.env.BASE_URL}tower-defense-music/monster-assault.mp3`)
  private voices: HTMLAudioElement[] = []
  constructor(private report: (message: string) => void) {
    this.music.loop = true
    this.music.volume = 0.14
    this.music.preload = 'none'
    this.music.dataset.emberMusic = 'true'
    document.body.append(this.music)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop()
      else if (this.enabled) this.start()
    })
    window.addEventListener('pagehide', () => this.stop())
  }
  toggle() {
    this.enabled = !this.enabled
    if (this.enabled) this.start()
    else this.stop()
    return this.enabled
  }
  setBattle(active: boolean) {
    if (this.battle === active) return
    this.battle = active
    if (active) this.start()
    else this.stop()
  }
  start() {
    if (this.enabled && this.battle && !document.hidden)
      void this.music.play().catch((error: Error) => {
        if (error.name !== 'AbortError') this.report('音を再生できません。♫ を再度押してください')
      })
  }
  stop() {
    this.music.pause()
    this.voices.forEach((v) => {
      v.pause()
      v.remove()
    })
    this.voices = []
  }
  cue(role = 'healer') {
    if (!this.enabled || document.hidden) return
    this.voices = this.voices.filter((v) => !v.ended && !v.paused)
    if (this.voices.length >= 4) {
      const oldest = this.voices.shift()!
      oldest.pause()
      oldest.remove()
    }
    const file = ['soldier', 'archer', 'mage', 'goblin', 'wolf', 'healer'].includes(role) ? role : 'soldier'
    const voice = new Audio(`${import.meta.env.BASE_URL}tower-defense-sfx/${file}_attack.wav`)
    voice.dataset.emberVoice = 'true'
    document.body.append(voice)
    voice.addEventListener('ended', () => voice.remove(), { once: true })
    voice.volume = role === 'healer' ? 0.15 : 0.32
    this.voices.push(voice)
    void voice.play().catch(() => this.report('効果音を読み込めませんでした'))
  }
}
