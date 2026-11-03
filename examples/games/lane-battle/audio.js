// All sound is synthesized locally, and the context is created only by a gesture.
export class BattleAudio {
  context = null
  muted = false
  active = new Set()
  nextBeat = 0
  beat = 0
  running = false
  unlock() {
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext
      this.context ||= new AudioContextClass()
      if (this.context.state !== 'running') this.context.resume()?.catch(() => {})
    } catch {
      /* Audio is optional. */
    }
  }
  setRunning(value) {
    this.running = value
    if (!value || this.muted) {
      for (const voice of this.active) {
        try {
          voice.stop()
        } catch {}
      }
      this.active.clear()
      this.nextBeat = 0
    }
  }
  note(frequency, duration, volume, type = 'sine', when = this.context?.currentTime, end = frequency) {
    const c = this.context
    if (!c || c.state !== 'running' || this.muted) return
    const voice = c.createOscillator(),
      gain = c.createGain()
    voice.type = type
    voice.frequency.setValueAtTime(frequency, when)
    voice.frequency.exponentialRampToValueAtTime(end, when + duration)
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(volume, when + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    voice.connect(gain).connect(c.destination)
    this.active.add(voice)
    voice.onended = () => {
      this.active.delete(voice)
      voice.disconnect()
      gain.disconnect()
    }
    voice.start(when)
    voice.stop(when + duration + 0.01)
  }
  effect(kind) {
    const notes = {
      summon: [520, 780],
      upgrade: [660, 990],
      burst: [95, 38],
      hit: [180, 80],
      shot: [900, 320],
      victory: [660, 1320],
      defeat: [220, 70]
    }
    const [a, b] = notes[kind]
    this.note(a, kind === 'burst' ? 0.35 : 0.18, 0.035, kind === 'burst' ? 'sawtooth' : 'sine', undefined, b)
  }
  tick() {
    const c = this.context
    if (!this.running || this.muted || !c || c.state !== 'running') return
    if (!this.nextBeat || this.nextBeat < c.currentTime - 0.2) this.nextBeat = c.currentTime
    // A quiet original 16-step march motif, bass on the downbeats.
    if (this.nextBeat < c.currentTime + 0.08) {
      const melody = [64, 67, 71, 74, 71, 67, 62, 67, 60, 64, 67, 72, 69, 67, 62, 59]
      this.note(440 * 2 ** ((melody[this.beat % 16] - 69) / 12), 0.38, 0.009, 'triangle', this.nextBeat)
      if (this.beat % 4 === 0) this.note(this.beat % 16 < 8 ? 164.81 : 130.81, 0.7, 0.012, 'sine', this.nextBeat)
      this.beat++
      this.nextBeat += 0.3
    }
  }
}
