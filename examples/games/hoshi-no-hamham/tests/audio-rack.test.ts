import { describe, expect, test } from 'vitest'
import { LEGATO, RANGES, Rack, VOICES, type VoiceEnv } from '../src/audio/instruments'
import { MusicPlayer } from '../src/audio/music'
import type { InstName } from '../src/audio/notation'
import { SONGS } from '../src/audio/songs'

/** The drums the kit knows. */
const DRUMS = [36, 37, 38, 39, 41, 42, 43, 45, 46, 49, 50, 51, 54, 70, 81]
const SOURCES = new Set(['osc', 'noise'])

interface FakeNode {
  id: string
  kind: string
}

/**
 * A context that writes down what is done to it: every node made, every connection, every `disconnect()` and every
 * `cancelScheduledValues`. Its clock is moved by the test.
 */
function recorder() {
  const log: string[] = []
  let ids = 0
  let time = 0
  const param = (owner: string, name: string) => ({
    value: 0,
    id: `${owner}.${name}`,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
    cancelScheduledValues: () => void log.push(`cancel ${owner}.${name}`)
  })
  const node = (kind: string, params: string[]): FakeNode => {
    const id = `${kind}${++ids}`
    log.push(`make ${id}`)
    const n: Record<string, unknown> = {
      id,
      kind,
      connect: (to: { id: string }) => void log.push(`connect ${id}>${to.id}`),
      disconnect: () => void log.push(`disconnect ${id}`),
      start: () => undefined,
      stop: (at: number) => void log.push(`stop ${id} ${at.toFixed(4)}`),
      setPeriodicWave: () => undefined
    }
    for (const p of params) n[p] = param(id, p)
    return n as unknown as FakeNode
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
  const out = { id: 'out' }
  const env = (rack?: Rack): VoiceEnv => ({
    ctx: ctx as unknown as BaseAudioContext,
    out: out as unknown as AudioNode,
    noise: { duration: 2 } as AudioBuffer,
    rack
  })
  return {
    ctx: ctx as unknown as BaseAudioContext,
    log,
    env,
    out: out as unknown as AudioNode,
    /** Moves the clock, and says so in the log. */
    at: (seconds: number) => {
      time = seconds
      log.push(`clock ${seconds.toFixed(4)}`)
    },
    /** The entries written since `from`, and the kinds of the nodes made among them. */
    since: (from: number) => log.slice(from),
    made: (from = 0) =>
      log.slice(from).flatMap((line) => (line.startsWith('make ') ? [line.slice(5).replace(/\d+$/, '')] : []))
  }
}

/** The connections of one note, with its sources named by the order they were made in. */
function wiring(lines: string[]): string[] {
  const names = new Map<string, string>()
  for (const line of lines) {
    const made = /^make ((?:osc|noise)\d+)$/.exec(line)
    if (made) names.set(made[1], `source${names.size + 1}`)
  }
  const name = (id: string) => {
    const [node, param] = id.split('.')
    const known = names.get(node) ?? node
    return param ? `${known}.${param}` : known
  }
  return lines.flatMap((line) => {
    const c = /^connect (\S+)>(\S+)$/.exec(line)
    return c ? [`${name(c[1])}>${name(c[2])}`] : []
  })
}

/** Every graph the music can build: each instrument, and each drum of the kit. */
const GRAPHS: Array<{
  inst: InstName
  label: string
  notes: Array<[midi: number, dur: number, vel: number, glide?: number]>
}> = [
  ...(Object.keys(VOICES) as InstName[])
    .filter((inst) => inst !== 'kit')
    .map((inst) => {
      const [low, high] = RANGES[inst]
      const mid = Math.round((low + high) / 2)
      return {
        inst,
        label: inst,
        notes: [
          [mid, 0.4, 0.6],
          [low, 0.05, 0.2],
          [high, 2.5, 1],
          // Both sides of the choir's change of formants, and a glide for the instruments that have one.
          [Math.min(high, 60), 0.8, 0.5, LEGATO.has(inst) ? mid : undefined],
          [Math.max(low, 55), 1.2, 0.9]
        ] as Array<[number, number, number, number?]>
      }
    }),
  ...DRUMS.map((midi) => ({
    inst: 'kit' as InstName,
    label: `kit ${midi}`,
    notes: [
      [midi, 0.1, 0.5],
      [midi, 0.3, 1],
      [midi, 0.02, 0.25]
    ] as Array<[number, number, number, number?]>
  }))
]

describe('a rack', () => {
  test('is free a rest after the last source of its note stops, and not while a note is built on it', () => {
    const rack = new Rack()
    expect(rack.freeAt).toBe(0)
    rack.begin()
    expect(rack.freeAt).toBe(Infinity)
    rack.busy(3)
    rack.busy(5.5)
    rack.busy(4)
    rack.end(0.05)
    expect(rack.freeAt).toBeCloseTo(5.55, 9)
    // A note without any source leaves it free at once.
    rack.begin()
    rack.end(0.05)
    expect(rack.freeAt).toBeCloseTo(0.05, 9)
  })

  test('hands the same nodes out again in the order they were first asked for', () => {
    const r = recorder()
    const rack = new Rack()
    rack.begin()
    const first = [rack.gain(r.ctx), rack.filter(r.ctx), rack.gain(r.ctx), rack.pan(r.ctx), rack.mod(r.ctx)]
    expect(rack.size).toBe(5)
    rack.begin()
    const again = [rack.gain(r.ctx), rack.filter(r.ctx), rack.gain(r.ctx), rack.pan(r.ctx), rack.mod(r.ctx)]
    for (const [i, node] of again.entries()) expect(node).toBe(first[i])
    expect(r.made()).toEqual(['gain', 'filter', 'gain', 'pan', 'gain'])
    // A note that needs one more gets a new one.
    expect(first).not.toContain(rack.gain(r.ctx))
    expect(rack.size).toBe(6)
  })

  test('clears the automation of every parameter of a node before it hands it out again', () => {
    const r = recorder()
    const rack = new Rack()
    rack.begin()
    const filter = rack.filter(r.ctx)
    rack.gain(r.ctx)
    rack.pan(r.ctx)
    rack.mod(r.ctx)
    filter.gain.value = 9
    filter.detune.value = 30
    const from = r.log.length
    rack.begin()
    rack.filter(r.ctx)
    rack.gain(r.ctx)
    rack.pan(r.ctx)
    rack.mod(r.ctx)
    expect(r.since(from)).toEqual([
      'cancel filter1.frequency',
      'cancel filter1.Q',
      'cancel filter1.gain',
      'cancel filter1.detune',
      'cancel gain2.gain',
      'cancel pan3.pan',
      'cancel gain4.gain',
      'disconnect gain4'
    ])
    // What only some voices set on a filter is back at its default for the next.
    expect(filter.gain.value).toBe(0)
    expect(filter.detune.value).toBe(0)
  })
})

describe('the voices on a rack', () => {
  test.each(GRAPHS)('$label: a later note makes only its sources and is wired like the first', ({ inst, notes }) => {
    const r = recorder()
    const rack = new Rack()
    const build = ([midi, dur, vel, glide]: [number, number, number, number?]) => {
      const from = r.log.length
      rack.begin()
      VOICES[inst](r.env(rack), 1, dur, midi, vel, glide)
      rack.end(0.05)
      return r.since(from)
    }
    const first = build(notes[0])
    const kept = rack.size
    expect(first.filter((line) => line.startsWith('make ')).length).toBeGreaterThan(kept)
    for (const note of notes.slice(1)) {
      const lines = build(note)
      const made = lines.flatMap((line) => (line.startsWith('make ') ? [line.slice(5).replace(/\d+$/, '')] : []))
      expect(made.length).toBeGreaterThan(0)
      for (const kind of made) expect(SOURCES.has(kind), `${inst} made a ${kind}`).toBe(true)
      expect(rack.size).toBe(kept)
      expect(wiring(lines)).toEqual(wiring(first))
    }
  })

  test.each(GRAPHS)('$label: built without a rack it is the same graph, every node new', ({ inst, notes }) => {
    const [midi, dur, vel, glide] = notes[0]
    const plain = recorder()
    VOICES[inst](plain.env(), 1, dur, midi, vel, glide)
    const kept = recorder()
    const rack = new Rack()
    rack.begin()
    VOICES[inst](kept.env(rack), 1, dur, midi, vel, glide)
    // The first note on a rack makes its nodes at the same points as a note without one.
    expect(kept.log).toEqual(plain.log)
    expect(plain.log.some((line) => line.startsWith('cancel') || line.startsWith('disconnect'))).toBe(false)
  })

  test('a rack is busy until the last source of the note has stopped', () => {
    const r = recorder()
    for (const { inst, notes } of GRAPHS) {
      const rack = new Rack()
      const from = r.log.length
      rack.begin()
      const [midi, dur, vel] = notes[0]
      VOICES[inst](r.env(rack), 1, dur, midi, vel)
      rack.end(0)
      const stops = r.since(from).flatMap((line) => (line.startsWith('stop ') ? [Number(line.split(' ')[2])] : []))
      expect(stops.length, inst).toBeGreaterThan(0)
      expect(rack.freeAt, inst).toBeCloseTo(Math.max(...stops), 3)
    }
  })

  test('the gain of a vibrato or a frequency modulation lets go of the last note before it takes the next', () => {
    for (const inst of ['strings', 'flute', 'brass', 'celesta', 'bell'] as InstName[]) {
      const r = recorder()
      const rack = new Rack()
      rack.begin()
      VOICES[inst](r.env(rack), 1, 0.5, 72, 0.6)
      rack.end(0.05)
      const from = r.log.length
      rack.begin()
      VOICES[inst](r.env(rack), 4, 0.5, 74, 0.6)
      const lines = r.since(from)
      // Every connection to a parameter comes from a gain that was disconnected earlier in this note.
      const toParam = lines.filter((line) => /^connect gain\d+>osc\d+\.(detune|frequency)$/.test(line))
      expect(toParam.length, inst).toBeGreaterThan(0)
      for (const line of toParam) {
        const gain = /^connect (gain\d+)>/.exec(line)![1]
        const cut = lines.indexOf(`disconnect ${gain}`)
        expect(cut, `${inst} ${gain}`).toBeGreaterThanOrEqual(0)
        expect(cut, `${inst} ${gain}`).toBeLessThan(lines.indexOf(line))
      }
      // And nothing else is ever disconnected: the rest of the rack stays wired.
      expect(lines.filter((line) => line.startsWith('disconnect')).length, inst).toBe(toParam.length)
    }
  })
})

describe('a player that keeps its racks', () => {
  /** Plays `seconds` of a theme the way the live engine does: a pass every 40 ms, half a second ahead. */
  function play(theme: keyof typeof SONGS, seconds: number, kept: boolean, layer = 2) {
    const r = recorder()
    const mixer = { ctx: r.ctx, music: { id: 'music' }, musicReverb: { id: 'reverb' }, chorus: { id: 'chorus' } }
    const player = new MusicPlayer(
      mixer as never,
      { duration: 2 } as AudioBuffer,
      SONGS[theme],
      layer,
      0.05,
      false,
      kept
    )
    const from = r.log.length
    for (let t = 0; t < seconds; t += 0.04) {
      r.at(t)
      player.pump(t + 0.5)
    }
    const made = r.made(from)
    const sources = made.filter((kind) => SOURCES.has(kind)).length
    return { player, r, from, sources, others: made.length - sources }
  }

  test('makes the sources of every note and few other nodes', () => {
    for (const theme of ['meadow', 'night', 'boss', 'finalBoss', 'castle'] as const) {
      const plain = play(theme, 40, false)
      const kept = play(theme, 40, true)
      // The same notes: the same sources.
      expect(kept.sources, theme).toBe(plain.sources)
      expect(plain.others, theme).toBeGreaterThan(plain.sources)
      // What else it makes is what its racks hold, a small part of what the notes would have made.
      expect(kept.others, theme).toBe(kept.player.keptNodes)
      expect(kept.others, theme).toBeLessThan(plain.others * 0.2)
      expect(plain.player.keptNodes, theme).toBe(0)
    }
  })

  test('stops making nodes other than sources once the song has been through its busiest bars', () => {
    const kept = play('meadow', 80, true)
    const first = kept.r.since(kept.from)
    const mark = first.length
    for (let t = 80; t < 160; t += 0.04) {
      kept.r.at(t)
      kept.player.pump(t + 0.5)
    }
    const later = kept.r.made(kept.from + mark)
    expect(later.length).toBeGreaterThan(1000)
    expect(later.filter((kind) => !SOURCES.has(kind)).length).toBeLessThan(later.length * 0.01)
  })

  test('never builds a note on a rack whose sources are still to stop', () => {
    for (const theme of ['boss', 'forest'] as const) {
      const kept = play(theme, 30, true)
      let clock = 0
      const stopOf = new Map<string, number>()
      /** By kept node: when its last sources were connected, and when the last of them stops. */
      const fed = new Map<string, { at: number; until: number }>()
      let reused = 0
      for (const line of kept.r.since(kept.from)) {
        const moved = /^clock (\S+)$/.exec(line)
        if (moved) clock = Number(moved[1])
        const stop = /^stop (\S+) (\S+)$/.exec(line)
        if (stop) stopOf.set(stop[1], Number(stop[2]))
        const c = /^connect ((?:osc|noise)\d+)>((?:gain|filter|pan)\d+)$/.exec(line)
        if (!c) continue
        const until = stopOf.get(c[1])!
        const last = fed.get(c[2])
        if (last && last.at !== clock) {
          // Sources of an earlier note fed this node: they have stopped, and the rest after them is over.
          expect(last.until + 0.05, `${theme} ${c[2]}`).toBeLessThanOrEqual(clock + 1e-9)
          reused += 1
          fed.set(c[2], { at: clock, until })
        } else fed.set(c[2], { at: clock, until: Math.max(until, last?.until ?? 0) })
      }
      expect(reused, theme).toBeGreaterThan(300)
    }
  })

  test('a clock that never moves gives every note a rack of its own: the graph of a player without racks', () => {
    const build = (kept: boolean) => {
      const r = recorder()
      const mixer = { ctx: r.ctx, music: { id: 'music' }, musicReverb: { id: 'reverb' }, chorus: { id: 'chorus' } }
      const player = new MusicPlayer(mixer as never, { duration: 2 } as AudioBuffer, SONGS.night, 2, 0.05, false, kept)
      player.pump(20)
      return r.log
    }
    expect(build(true)).toEqual(build(false))
  })

  test('a voice that fails takes its rack out of use', () => {
    const r = recorder()
    const mixer = { ctx: r.ctx, music: { id: 'music' }, musicReverb: { id: 'reverb' }, chorus: { id: 'chorus' } }
    const player = new MusicPlayer(mixer as never, { duration: 2 } as AudioBuffer, SONGS.select, 2, 0.05, false, true)
    const real = VOICES.pizz
    let calls = 0
    let broken = ''
    VOICES.pizz = (c, t, dur, midi, vel) => {
      calls += 1
      if (calls === 1) {
        // Takes a node of the rack, then fails.
        broken = (c.rack!.gain(c.ctx) as unknown as FakeNode).id
        throw new Error('broken voice')
      }
      real(c, t, dur, midi, vel)
    }
    try {
      for (let t = 0; t < 30; t += 0.04) {
        r.at(t)
        player.pump(t + 0.5)
      }
    } finally {
      VOICES.pizz = real
    }
    expect(calls).toBeGreaterThan(20)
    expect(broken).toMatch(/^gain\d+$/)
    // No later note was built on the rack of the failed one: its node was never handed out again.
    const uses = r.log.filter(
      (line) => line.includes(`${broken}.`) || line.endsWith(`>${broken}`) || line.includes(` ${broken}>`)
    )
    expect(uses).toEqual([])
  })
})
