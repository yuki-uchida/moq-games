/** Procedural WebAudio sound effects and a small chiptune loop per stage theme. */

type SfxName =
  | 'jump'
  | 'land'
  | 'bite'
  | 'dig'
  | 'tree'
  | 'pipe'
  | 'hive'
  | 'animal'
  | 'rock'
  | 'switch'
  | 'fruit'
  | 'hurt'
  | 'enemy-down'
  | 'boss-hit'
  | 'boss-down'
  | 'clear'
  | 'dead'
  | 'shock'
  | 'pickup'
  | 'select'

interface MusicTheme {
  tempo: number
  melody: number[]
  bass: number[]
  wave: OscillatorType
}

const MUSIC: Record<string, MusicTheme> = {
  meadow: {
    tempo: 132,
    wave: 'square',
    melody: [523, 587, 659, 784, 659, 587, 523, 0, 587, 659, 698, 880, 784, 698, 659, 0],
    bass: [131, 131, 175, 196, 131, 131, 175, 196, 131, 131, 175, 196, 147, 147, 196, 196]
  },
  night: {
    tempo: 96,
    wave: 'triangle',
    melody: [440, 0, 523, 0, 659, 0, 523, 440, 392, 0, 440, 0, 523, 0, 0, 0],
    bass: [110, 110, 131, 131, 98, 98, 110, 110, 110, 110, 131, 131, 98, 98, 110, 110]
  },
  cave: {
    tempo: 108,
    wave: 'sawtooth',
    melody: [330, 0, 392, 330, 294, 0, 330, 0, 392, 0, 440, 392, 330, 0, 0, 0],
    bass: [82, 82, 98, 98, 73, 73, 82, 82, 82, 82, 98, 98, 73, 73, 82, 82]
  },
  forest: {
    tempo: 120,
    wave: 'square',
    melody: [392, 440, 523, 587, 523, 440, 392, 0, 330, 392, 440, 523, 440, 392, 330, 0],
    bass: [98, 98, 131, 131, 110, 110, 147, 147, 98, 98, 131, 131, 110, 110, 147, 147]
  },
  fortress: {
    tempo: 116,
    wave: 'sawtooth',
    melody: [294, 294, 349, 392, 349, 294, 262, 0, 294, 349, 392, 440, 392, 349, 294, 0],
    bass: [73, 73, 87, 87, 65, 65, 73, 73, 73, 73, 87, 87, 65, 65, 73, 73]
  },
  castle: {
    tempo: 126,
    wave: 'triangle',
    melody: [440, 523, 659, 880, 659, 523, 440, 0, 523, 659, 784, 1047, 784, 659, 523, 0],
    bass: [110, 110, 131, 131, 110, 110, 131, 131, 110, 110, 131, 131, 131, 131, 147, 147]
  },
  star: {
    tempo: 140,
    wave: 'square',
    melody: [659, 784, 880, 1047, 880, 784, 659, 0, 587, 659, 784, 880, 784, 659, 587, 0],
    bass: [131, 131, 165, 165, 147, 147, 196, 196, 131, 131, 165, 165, 147, 147, 196, 196]
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicTimer: number | null = null
  private step = 0
  private nextTime = 0
  private theme = 'meadow'
  muted = false

  /** Must be called from a user gesture before any sound plays. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.5
    this.master.connect(this.ctx.destination)
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = 0.24
    this.musicGain.connect(this.master)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02)
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume = 0.3, slide = 0, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return
    const now = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  private noise(duration: number, volume = 0.25, frequency = 1200, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return
    const now = this.ctx.currentTime + delay
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration))
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start(now)
  }

  play(name: SfxName) {
    if (!this.ctx || this.muted) return
    switch (name) {
      case 'jump':
        this.tone(380, 0.16, 'square', 0.18, 320)
        break
      case 'land':
        this.noise(0.08, 0.1, 400)
        break
      case 'bite':
        this.noise(0.06, 0.2, 2200)
        this.tone(180, 0.07, 'square', 0.14, -60)
        break
      case 'dig':
        this.noise(0.14, 0.24, 700)
        break
      case 'tree':
        this.tone(120, 0.3, 'triangle', 0.28, -60)
        this.noise(0.2, 0.18, 300)
        break
      case 'pipe':
        this.noise(0.3, 0.2, 1800)
        this.tone(520, 0.2, 'sine', 0.14, -260)
        break
      case 'hive':
        this.tone(220, 0.4, 'sawtooth', 0.16, 80)
        this.tone(330, 0.35, 'square', 0.08, -40, 0.04)
        break
      case 'animal':
        this.tone(160, 0.35, 'sawtooth', 0.22, 120)
        break
      case 'rock':
        this.noise(0.12, 0.26, 900)
        this.tone(90, 0.16, 'square', 0.16, -30)
        break
      case 'switch':
        this.tone(660, 0.1, 'square', 0.16)
        this.tone(880, 0.14, 'square', 0.16, 0, 0.09)
        break
      case 'fruit':
        this.tone(880, 0.09, 'sine', 0.2, 220)
        break
      case 'pickup':
        this.tone(784, 0.1, 'triangle', 0.2)
        this.tone(1047, 0.16, 'triangle', 0.18, 0, 0.08)
        break
      case 'hurt':
        this.tone(300, 0.24, 'sawtooth', 0.24, -180)
        break
      case 'enemy-down':
        this.noise(0.16, 0.2, 1500)
        this.tone(520, 0.18, 'square', 0.16, -260)
        break
      case 'boss-hit':
        this.tone(180, 0.14, 'square', 0.22, -60)
        this.noise(0.1, 0.16, 2600)
        break
      case 'boss-down':
        this.noise(0.7, 0.32, 600)
        this.tone(90, 0.6, 'sawtooth', 0.26, -50)
        this.tone(523, 0.4, 'square', 0.16, 0, 0.2)
        this.tone(659, 0.4, 'square', 0.16, 0, 0.3)
        this.tone(784, 0.5, 'square', 0.18, 0, 0.4)
        break
      case 'clear':
        ;[523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, 'square', 0.18, 0, i * 0.11))
        break
      case 'dead':
        ;[440, 392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, 0, i * 0.18))
        break
      case 'shock':
        this.tone(70, 0.3, 'sawtooth', 0.3, -20)
        this.noise(0.2, 0.2, 250)
        break
      case 'select':
        this.tone(700, 0.07, 'square', 0.14, 120)
        break
    }
  }

  startMusic(theme: string) {
    this.theme = theme
    this.step = 0
    if (!this.ctx || !this.musicGain) return
    if (this.musicTimer !== null) return
    this.nextTime = this.ctx.currentTime + 0.05
    this.musicTimer = window.setInterval(() => this.schedule(), 40)
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }

  private schedule() {
    if (!this.ctx || !this.musicGain) return
    const config = MUSIC[this.theme] ?? MUSIC.meadow
    const stepDuration = 60 / config.tempo / 2
    while (this.nextTime < this.ctx.currentTime + 0.16) {
      const index = this.step % config.melody.length
      const melody = config.melody[index]
      const bass = config.bass[index % config.bass.length]
      const delay = Math.max(0, this.nextTime - this.ctx.currentTime)
      if (melody) this.musicNote(melody, stepDuration * 0.92, config.wave, 0.16, delay)
      if (bass) this.musicNote(bass, stepDuration * 0.9, 'triangle', 0.13, delay)
      this.nextTime += stepDuration
      this.step += 1
    }
  }

  private musicNote(freq: number, duration: number, type: OscillatorType, volume: number, delay: number) {
    if (!this.ctx || !this.musicGain || this.muted) return
    const now = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(gain)
    gain.connect(this.musicGain)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }
}
