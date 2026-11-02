/** Synthesized battle "game feel" cues. No audio files; routed through the player's master gain. */
export type FeelSound =
  | 'kill'
  | 'coin'
  | 'combo'
  | 'hit-heavy'
  | 'boss'
  | 'assault'
  | 'clear'
  | 'defeat'
  | 'base-hit'
  | 'deploy'
  | 'star'
  | 'cutin'
  | 'levelup'

const MIN_INTERVAL: Partial<Record<FeelSound, number>> = {
  kill: 0.045,
  coin: 0.045,
  'hit-heavy': 0.07,
  combo: 0.12,
  'base-hit': 0.12,
  deploy: 0.06,
  star: 0.06
}
const MAX_VOICES = 28

interface Tone {
  type?: OscillatorType
  from: number
  to?: number
  at?: number
  dur: number
  peak: number
  attack?: number
  lowpass?: number | [number, number]
}
interface Burst {
  at?: number
  dur: number
  peak: number
  filter: BiquadFilterType
  freq: number | [number, number]
  q?: number
}

const semis = (base: number, n: number) => base * 2 ** (n / 12)

export function createFeelPlayer() {
  const lastAt = new Map<FeelSound, number>()
  const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
  let active = 0

  /** Returns whether the cue was scheduled (false when suspended, rate-limited or over the voice cap). */
  return function play(kind: FeelSound, context: AudioContext, destination: AudioNode, param = 0): boolean {
    if (context.state !== 'running') return false
    const now = context.currentTime
    const gap = MIN_INTERVAL[kind]
    if (gap !== undefined && now - (lastAt.get(kind) ?? -Infinity) < gap) return false
    if (active >= MAX_VOICES) return false
    lastAt.set(kind, now)

    const finish = (node: AudioScheduledSourceNode, ...extra: AudioNode[]) => {
      active++
      node.onended = () => {
        active--
        node.disconnect()
        for (const item of extra) item.disconnect()
      }
    }
    const tone = ({ type = 'triangle', from, to, at = 0, dur, peak, attack = 0.006, lowpass }: Tone) => {
      const osc = context.createOscillator(),
        gain = context.createGain(),
        start = now + at,
        extra: AudioNode[] = [gain]
      osc.type = type
      osc.frequency.setValueAtTime(from, start)
      if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(peak, start + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      let node: AudioNode = osc
      if (lowpass) {
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        if (Array.isArray(lowpass)) {
          filter.frequency.setValueAtTime(lowpass[0], start)
          filter.frequency.linearRampToValueAtTime(lowpass[1], start + dur * 0.4)
        } else filter.frequency.value = lowpass
        osc.connect(filter)
        node = filter
        extra.push(filter)
      }
      node.connect(gain).connect(destination)
      finish(osc, ...extra)
      osc.start(start)
      osc.stop(start + dur + 0.02)
    }
    const burst = ({ at = 0, dur, peak, filter, freq, q = 1 }: Burst) => {
      let buffer = noiseBuffers.get(context)
      if (!buffer) {
        buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.6), context.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        noiseBuffers.set(context, buffer)
      }
      const source = context.createBufferSource(),
        biquad = context.createBiquadFilter(),
        gain = context.createGain(),
        start = now + at
      source.buffer = buffer
      biquad.type = filter
      biquad.Q.value = q
      if (Array.isArray(freq)) {
        biquad.frequency.setValueAtTime(freq[0], start)
        biquad.frequency.exponentialRampToValueAtTime(freq[1], start + dur)
      } else biquad.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(peak, start + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      source.connect(biquad).connect(gain).connect(destination)
      finish(source, biquad, gain)
      source.start(start)
      source.stop(start + dur + 0.02)
    }

    try {
      switch (kind) {
        case 'kill':
          tone({ from: 520, to: 1040, dur: 0.1, peak: 0.45 })
          tone({ type: 'sine', from: 1568, to: 2093, at: 0.03, dur: 0.1, peak: 0.2 })
          burst({ dur: 0.04, peak: 0.12, filter: 'highpass', freq: 3000 })
          break
        case 'coin':
          tone({ type: 'sine', from: 1319, dur: 0.1, peak: 0.3 })
          tone({ type: 'sine', from: 1760, at: 0.07, dur: 0.22, peak: 0.3 })
          tone({ type: 'triangle', from: 3520, at: 0.07, dur: 0.12, peak: 0.08 })
          break
        case 'combo': {
          const root = semis(523.25, Math.min(10, Math.max(0, param - 3)))
          ;[1, 1.26, 1.498].forEach((ratio, i) =>
            tone({ type: 'triangle', from: root * ratio, at: i * 0.06, dur: 0.2, peak: 0.34 })
          )
          break
        }
        case 'hit-heavy':
          tone({ type: 'sine', from: 170, to: 55, dur: 0.16, peak: 0.8 })
          burst({ dur: 0.07, peak: 0.45, filter: 'bandpass', freq: 2400, q: 0.8 })
          break
        case 'boss':
          for (const [at, note, dur] of [[0, 110, 0.3], [0.36, 92.5, 0.42]] as const) {
            tone({ type: 'sawtooth', from: note, at, dur, peak: 0.34, attack: 0.07, lowpass: [350, 1500] })
            tone({ type: 'sawtooth', from: note * 1.006, at, dur, peak: 0.3, attack: 0.07, lowpass: [350, 1500] })
            tone({ type: 'square', from: note / 2, at, dur, peak: 0.2, attack: 0.05, lowpass: 400 })
          }
          break
        case 'assault':
          for (let i = 0; i < 7; i++)
            tone({ type: 'sine', from: 150, to: 90, at: i * 0.045, dur: 0.09, peak: 0.25 + i * 0.06 })
          tone({ type: 'sawtooth', from: 261.6, to: 392, at: 0.28, dur: 0.4, peak: 0.3, attack: 0.05, lowpass: [500, 1800] })
          tone({ type: 'sawtooth', from: 392, to: 523.25, at: 0.28, dur: 0.4, peak: 0.16, attack: 0.05, lowpass: [500, 1800] })
          break
        case 'clear': {
          const notes: Array<[number, number, number]> = [
            [523.25, 0, 0.3],
            [659.25, 0.14, 0.3],
            [783.99, 0.28, 0.3],
            [1046.5, 0.44, 0.76]
          ]
          for (const [f, at, dur] of notes) {
            tone({ type: 'triangle', from: f, at, dur, peak: 0.4 })
            tone({ type: 'sine', from: f * 2, at, dur: dur * 0.8, peak: 0.1 })
          }
          for (const f of [1318.5, 1568]) tone({ type: 'triangle', from: f, at: 0.44, dur: 0.76, peak: 0.2 })
          burst({ at: 0.44, dur: 0.5, peak: 0.07, filter: 'highpass', freq: 5000 })
          break
        }
        case 'defeat':
          for (const [f, at, dur] of [[440, 0, 0.34], [349.2, 0.3, 0.34], [293.7, 0.6, 0.8]] as const) {
            tone({ type: 'triangle', from: f, at, dur, peak: 0.42, lowpass: 1400 })
            tone({ type: 'sine', from: f / 2, at, dur, peak: 0.25 })
          }
          break
        case 'base-hit':
          tone({ type: 'sine', from: 100, to: 42, dur: 0.28, peak: 0.9 })
          burst({ dur: 0.14, peak: 0.3, filter: 'lowpass', freq: 400 })
          break
        case 'deploy':
          tone({ type: 'sine', from: 210, to: 90, dur: 0.12, peak: 0.5 })
          tone({ type: 'sine', from: 1760, at: 0.05, dur: 0.12, peak: 0.12 })
          tone({ type: 'sine', from: 2349, at: 0.09, dur: 0.14, peak: 0.1 })
          break
        case 'star': {
          const f = semis(880, param)
          tone({ type: 'sine', from: f, dur: 0.4, peak: 0.4 })
          tone({ type: 'triangle', from: f * 2, dur: 0.25, peak: 0.12 })
          break
        }
        case 'cutin':
          burst({ dur: 0.34, peak: 0.28, filter: 'bandpass', freq: [300, 3200], q: 1.2 })
          tone({ type: 'sine', from: 200, to: 900, dur: 0.3, peak: 0.2 })
          break
        case 'levelup':
          ;[0, 4, 7, 12, 16, 19].forEach((n, i) =>
            tone({ type: 'triangle', from: semis(523.25, n), at: i * 0.07, dur: i === 5 ? 0.5 : 0.18, peak: 0.34 })
          )
          break
      }
    } catch {
      /* Feel sounds are optional. */
      return false
    }
    return true
  }
}
