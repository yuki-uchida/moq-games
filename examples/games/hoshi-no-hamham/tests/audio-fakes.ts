/**
 * A Web Audio context for tests that writes down what is done to it: every node made, every connection and every
 * `disconnect()`. Its clock is moved by the test. With `mixer()` it also hands out the few nodes of the game's mixer
 * that the music and the engine touch.
 */
import type { Mixer } from '../src/audio/mixer'

const SOURCES = new Set(['osc', 'noise'])

export function recordingContext() {
  const log: string[] = []
  let ids = 0
  let time = 0
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
    cancelScheduledValues: () => undefined
  })
  const node = (kind: string, params: string[], id = `${kind}${++ids}`) => {
    log.push(`make ${id}`)
    const n: Record<string, unknown> = {
      id,
      kind,
      connect: (to: { id?: string }) => void log.push(`connect ${id}>${to.id ?? 'param'}`),
      disconnect: () => void log.push(`disconnect ${id}`),
      start: () => undefined,
      stop: () => undefined,
      setPeriodicWave: () => undefined
    }
    for (const p of params) n[p] = param()
    return n
  }
  const ctx = {
    sampleRate: 48000,
    get currentTime() {
      return time
    },
    createGain: () => node('gain', ['gain']),
    createBiquadFilter: () => node('filter', ['frequency', 'Q', 'gain', 'detune']),
    createStereoPanner: () => node('pan', ['pan']),
    createOscillator: () => node('osc', ['frequency', 'detune']),
    createBufferSource: () => node('noise', ['playbackRate', 'detune']),
    createPeriodicWave: () => ({})
  }
  /** The kinds of the nodes made since entry `from` of the log. */
  const made = (from = 0) =>
    log.slice(from).flatMap((line) => (line.startsWith('make ') ? [line.slice(5).replace(/\d+$/, '')] : []))
  return {
    ctx: ctx as unknown as BaseAudioContext,
    log,
    /** Moves the clock. */
    at: (seconds: number) => void (time = seconds),
    made,
    /** The nodes made since `from` that are not sources of a note: gains, filters and panners. */
    kept: (from = 0) => made(from).filter((kind) => !SOURCES.has(kind)),
    /** The sources of notes made since `from`. */
    sources: (from = 0) => made(from).filter((kind) => SOURCES.has(kind)),
    /**
     * The connections into the mixer's three inputs for music since `from`, and the disconnections of the nodes that
     * were ever connected to one of them (a player's outputs; the gains inside a rack disconnect too, and are not
     * meant).
     */
    wiring: (from = 0) => {
      const outputs = new Set<string>()
      for (const line of log) {
        const into = /^connect (\S+)>(music|musicReverb|chorus)$/.exec(line)
        if (into) outputs.add(into[1])
      }
      return log.slice(from).filter((line) => {
        if (/^connect \S+>(music|musicReverb|chorus)$/.test(line)) return true
        return line.startsWith('disconnect ') && outputs.has(line.slice('disconnect '.length))
      })
    },
    /** The mixer as far as the music and the engine use it. */
    mixer: (): Mixer => {
      const named = (id: string, params: string[] = ['gain']) => node(id, params, id)
      return {
        ctx: ctx as unknown as BaseAudioContext,
        music: named('music'),
        musicReverb: named('musicReverb'),
        chorus: named('chorus'),
        master: named('master'),
        musicVolume: named('musicVolume'),
        sfxVolume: named('sfxVolume'),
        menuDuck: named('menuDuck'),
        sfxDuck: named('sfxDuck'),
        muffle: named('muffle', ['frequency'])
      } as unknown as Mixer
    }
  }
}

export type RecordingContext = ReturnType<typeof recordingContext>
