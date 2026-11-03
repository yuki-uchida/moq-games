export type MusicTrack = 'ember-march' | 'moonlit-ward' | 'crown-of-embers'

const scores = {
  'ember-march': {
    bpm: 112,
    roots: [48, 44, 51, 46],
    melody: [72, 75, 79, 77, 75, 72, 70, 67, 72, 75, 82, 79, 77, 75, 74, 70],
    answer: [79, 82, 84, 82, 79, 77, 75, 74, 75, 79, 77, 74, 72, 70, 67, 70]
  },
  'moonlit-ward': {
    bpm: 96,
    roots: [45, 41, 48, 43],
    melody: [76, 0, 72, 74, 76, 79, 77, 76, 74, 0, 71, 72, 74, 77, 76, 72],
    answer: [81, 79, 76, 72, 77, 76, 74, 0, 79, 77, 74, 71, 76, 74, 72, 71]
  },
  'crown-of-embers': {
    bpm: 132,
    roots: [38, 34, 41, 33],
    melody: [74, 77, 81, 86, 85, 81, 77, 73, 74, 81, 79, 77, 76, 73, 69, 73],
    answer: [86, 85, 81, 77, 82, 81, 79, 76, 81, 79, 77, 73, 76, 73, 69, 73]
  }
} as const

export const musicTracks = Object.keys(scores) as MusicTrack[]
const sampleRate = 22050

export function composeMusic(track: MusicTrack): ArrayBuffer {
  const score = scores[track]
  const beat = 60 / score.bpm
  const samples = new Float32Array(Math.ceil(64 * beat * sampleRate))
  const tone = (note: number, start: number, duration: number, level: number, bright = false) => {
    if (!note) return
    const frequency = 440 * 2 ** ((note - 69) / 12)
    const length = Math.floor(duration * sampleRate)
    const offset = Math.floor(start * sampleRate)
    for (let index = 0; index < length && offset + index < samples.length; index++) {
      const time = index / sampleRate
      const phase = 2 * Math.PI * frequency * time
      const envelope = Math.min(1, time / 0.012) * Math.min(1, (duration - time) / 0.06)
      const wave = Math.sin(phase) + (bright ? 0.25 * Math.sin(phase * 2) + 0.1 * Math.sin(phase * 3) : 0)
      samples[offset + index] += wave * envelope * level
    }
  }
  for (let bar = 0; bar < 16; bar++) {
    const root = score.roots[bar % 4]
    const start = bar * 4 * beat
    const melody = bar < 8 ? score.melody : score.answer
    for (let step = 0; step < 4; step++) {
      tone(melody[(bar % 4) * 4 + step], start + step * beat, beat * 0.85, 0.22, true)
      tone(root - 12, start + step * beat, beat * 0.65, 0.18)
    }
    for (let step = 0; step < 8; step++) {
      const interval = [0, 7, 12, 15, 7, 12, 19, 15][step]
      tone(root + interval, start + (step * beat) / 2, beat * 0.4, 0.07, true)
    }
    for (let step = 0; step < 4; step++) {
      const offset = Math.floor((start + step * beat) * sampleRate)
      const length = Math.floor(0.12 * sampleRate)
      for (let index = 0; index < length && offset + index < samples.length; index++) {
        const time = index / sampleRate
        const kick = Math.sin(2 * Math.PI * (65 * time + 5 * (1 - Math.exp(-30 * time))))
        const snare = Math.sin(index * 17.13) * Math.sin(index * 3.71)
        samples[offset + index] += (step % 2 ? snare * 0.09 : kick * 0.22) * Math.exp(-35 * time)
      }
    }
  }
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
  }
  text(0, 'RIFF')
  view.setUint32(4, buffer.byteLength - 8, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index++) {
    const fade = Math.min(1, index / 220, (samples.length - 1 - index) / 220)
    view.setInt16(44 + index * 2, Math.round(samples[index] * fade * 32767), true)
  }
  return buffer
}
