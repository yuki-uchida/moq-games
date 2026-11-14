import { beforeEach, describe, expect, test } from 'vitest'
import { SFX, type SfxName } from '../src/audio/api'
import { SfxBank, bankPitch, probeSfx } from '../src/audio/bank'
import { AudioEngine } from '../src/audio/engine'
import { impulseSteps, makeImpulse } from '../src/audio/mixer'
import { SFX_DEFS } from '../src/audio/sfx'
import { sfxStats } from '../src/audio/stats'

/** The parts of a context the bank and the engine touch; every node is a recording stand-in. */
function fakeContext(sampleRate = 48000) {
  const created: string[] = []
  const node = (kind: string): unknown => {
    created.push(kind)
    const proxy: unknown = new Proxy(function () {}, {
      get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : proxy),
      set: () => true,
      apply: () => proxy
    })
    return proxy
  }
  const ctx = {
    sampleRate,
    currentTime: 0,
    destination: node('destination'),
    createBuffer(channels: number, length: number, rate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (c: number) => data[c]
      }
    },
    createGain: () => node('gain'),
    createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('source'),
    createStereoPanner: () => node('panner'),
    createConvolver: () => node('convolver'),
    createDynamicsCompressor: () => node('compressor'),
    createWaveShaper: () => node('shaper'),
    createDelay: () => node('delay'),
    createPeriodicWave: () => node('wave')
  }
  return { ctx: ctx as unknown as BaseAudioContext, created }
}

/** An offline context that only reports the length it was asked for. */
const offline = (frames: number, rate: number) => {
  const { ctx } = fakeContext(rate)
  const buffer = ctx.createBuffer(1, frames, rate)
  return Object.assign(ctx, { startRendering: () => Promise.resolve(buffer) }) as unknown as OfflineAudioContext
}

/** A bank whose idle moments are handed out by the test: `run(room)` gives it the next one with that much room. */
function manualBank(extra: { now?: () => number; offline?: typeof offline | (() => null) } = {}) {
  const moments: Array<{ run: (room: () => number) => void; playing: () => boolean }> = []
  /** The length in frames of every offline context the bank made. */
  const contexts: number[] = []
  const bank = new SfxBank({
    offline: ((frames: number, rate: number) => {
      contexts.push(frames)
      return (extra.offline ?? offline)(frames, rate)
    }) as never,
    now: extra.now,
    idle: (run, playing) => void moments.push({ run, playing })
  })
  /** The pieces of work the bank did, in order. */
  const pieces: string[] = []
  const inner = bank as unknown as { work(piece: string): void }
  const work = inner.work.bind(bank)
  inner.work = (piece) => {
    pieces.push(piece)
    work(piece)
  }
  const settle = () => new Promise<void>((r) => setTimeout(r, 0))
  return {
    bank,
    moments,
    contexts,
    pieces,
    /** Gives the bank its next moment and lets the renders it started finish; false when it asked for none. */
    async run(room = Infinity) {
      const m = moments.shift()
      if (!m) return false
      m.run(() => room)
      await settle()
      return true
    },
    async drain(limit = 5000) {
      for (let i = 0; i < limit && moments.length; i++) await this.run()
    },
    /** One piece of work per moment, until `until()` holds. */
    async step(until: () => boolean, limit = 5000) {
      for (let i = 0; i < limit && !until(); i++) if (!(await this.run(0))) break
    }
  }
}

beforeEach(() => {
  sfxStats.buffered = 0
  sfxStats.live = 0
  sfxStats.rendered = 0
})

describe('bank keys', () => {
  test('a pitch is kept to two decimals, and odd values count as 1', () => {
    expect(bankPitch(undefined)).toBe(1)
    expect(bankPitch(1.0699999)).toBe(1.07)
    expect(bankPitch(0.944)).toBe(0.94)
    expect(bankPitch(Number.NaN)).toBe(1)
    expect(bankPitch(-3)).toBe(1)
    expect(bankPitch(100)).toBe(4)
  })

  test('a dry run learns how long an effect lasts and whether it makes choices of its own', () => {
    const variety = SFX.filter((name) => probeSfx(name, 1, 1).variety)
    expect(variety.length).toBeGreaterThan(0)
    expect(variety.length).toBeLessThan(SFX.length)
    for (const name of SFX) {
      const { end } = probeSfx(name, 1, 12345)
      expect(end, name).toBeGreaterThan(0.05)
      expect(end, name).toBeLessThan(3)
    }
    // The same seed gives the same effect.
    expect(probeSfx('newRecord', 1, 7)).toEqual(probeSfx('newRecord', 1, 7))
  })

  test('a dry run names the oscillator types an effect needs, the sine of a fresh oscillator included', () => {
    const all = new Set<string>()
    for (const name of SFX) {
      const { waves } = probeSfx(name, 1, 1)
      for (const wave of waves) all.add(wave)
      if (waves.length) expect(waves[0], name).toBe('sine')
      expect(new Set(waves).size, name).toBe(waves.length)
    }
    for (const wave of all) expect(['sine', 'triangle', 'square', 'sawtooth']).toContain(wave)
    expect(all.has('sine')).toBe(true)
    expect(all.size).toBeGreaterThan(1)
    // Not every effect needs every table.
    expect(SFX.some((name) => probeSfx(name, 1, 1).waves.length < 4)).toBe(true)
  })
})

const FIRST = [
  'menuMove',
  'menuSelect',
  'menuBack',
  'textBlip',
  'pageTurn',
  'pauseIn',
  'pauseOut',
  'titleStart',
  'stageStart',
  'ready'
] as const
const KNOWN = 10 + 2 + 1

describe('the render queue', () => {
  test('the interface sounds are the first batch, built a piece at a time into one context', async () => {
    const m = manualBank()
    m.bank.start()
    expect(m.bank.size).toBe(0)
    await m.step(() => m.bank.size > 0)
    // One context, its plan, the noise, a wave table per oscillator type, and one effect per piece.
    expect(m.contexts.length).toBe(1)
    expect(m.pieces[0]).toBe('plan')
    expect(m.pieces[1]).toBe('noise')
    expect(m.pieces.filter((p) => p === 'build').length).toBe(FIRST.length)
    const waves = m.pieces.filter((p) => p === 'wave').length
    expect(waves).toBeGreaterThan(0)
    expect(waves).toBeLessThanOrEqual(4)
    expect(m.pieces.length).toBe(2 + waves + FIRST.length)
    expect(m.bank.size).toBe(FIRST.length)
    for (const name of FIRST) expect(m.bank.has(name), name).toBe(true)
    expect(m.bank.has('jump')).toBe(false)
    expect(m.bank.batches).toBe(1)
    // The hero's effects and the two footstep pitches come next.
    await m.step(() => m.bank.has('lowHp') && m.bank.has('step', 1.07))
    expect(m.bank.has('jump')).toBe(true)
    expect(m.bank.has('step', 0.94)).toBe(true)
    expect(m.bank.has('bossDown')).toBe(false)
    expect(m.bank.size).toBe(FIRST.length + 18 + 2)
    // The noise is made once.
    expect(m.pieces.filter((p) => p === 'noise').length).toBe(1)
  })

  test('a moment with room is used for as many pieces as fit, and up to three batches render at once', async () => {
    const m = manualBank()
    m.bank.start()
    expect(await m.run()).toBe(true)
    // Three contexts were filled and started in the one moment; nothing has landed before it ended.
    expect(m.contexts.length).toBe(3)
    expect(m.bank.batches).toBe(3)
    expect(m.bank.size).toBeGreaterThan(FIRST.length + 16)
    await m.drain()
    expect(m.bank.done).toBe(true)
  })

  test('while a stage is played a piece is done only where it fits, one a moment, or after a long wait', async () => {
    let now = 1000
    const m = manualBank({ now: () => now })
    m.bank.start()
    await m.step(() => m.bank.size > 0)
    m.bank.setPlaying(true)
    const before = m.pieces.length
    // No room: nothing is done, and the bank asks for the next moment.
    expect(await m.run(0)).toBe(true)
    expect(m.pieces.length).toBe(before)
    expect(m.moments.length).toBe(1)
    expect(m.moments[0].playing()).toBe(true)
    // Room for everything: still one piece a moment.
    expect(await m.run(1000)).toBe(true)
    expect(m.pieces.length).toBe(before + 1)
    expect(await m.run(1000)).toBe(true)
    expect(m.pieces.length).toBe(before + 2)
    // Nothing has fitted for a second and a half: the next piece is done anyway.
    expect(await m.run(0)).toBe(true)
    expect(m.pieces.length).toBe(before + 2)
    now += 1499
    expect(await m.run(0)).toBe(true)
    expect(m.pieces.length).toBe(before + 2)
    now += 2
    expect(await m.run(0)).toBe(true)
    expect(m.pieces.length).toBe(before + 3)
    expect(await m.run(0)).toBe(true)
    expect(m.pieces.length).toBe(before + 3)
    // Play is over: every moment does at least one piece again.
    m.bank.setPlaying(false)
    expect(await m.run(0)).toBe(true)
    expect(m.pieces.length).toBe(before + 4)
    expect(m.moments[0].playing()).toBe(false)
    await m.drain()
    expect(m.bank.done).toBe(true)
  })

  test('says when every default pitch and every known pitch has a buffer, before the extra takes', async () => {
    const m = manualBank()
    expect(m.bank.baseReady).toBe(false)
    let told = false
    const waiting = m.bank.whenBaseReady(60_000).then(() => void (told = true))
    m.bank.start()
    await m.step(() => m.bank.baseReady)
    expect(m.bank.baseReady).toBe(true)
    await waiting
    expect(told).toBe(true)
    for (const name of SFX) expect(m.bank.has(name), name).toBe(true)
    expect(m.bank.has('pickup', 1.7)).toBe(true)
    expect(m.bank.has('step', 0.94)).toBe(true)
    expect(m.bank.has('spit', 0.72)).toBe(true)
    // The extra takes are still to come.
    expect(m.bank.size).toBe(SFX.length + KNOWN)
    expect(m.bank.done).toBe(false)
  })

  test('is not ready while a buffer a stage waits for is still to come', async () => {
    const m = manualBank()
    m.bank.start()
    let sizeBefore = 0
    for (let i = 0; i < 5000 && !m.bank.baseReady; i++) {
      sizeBefore = m.bank.size
      await m.run(0)
    }
    // Until the last batch landed, something was missing.
    expect(sizeBefore).toBeLessThan(SFX.length + KNOWN)
    expect(m.bank.size).toBe(SFX.length + KNOWN)
  })

  test('a bank that cannot render, or is given too little time, does not hold a stage back', async () => {
    const none = manualBank({ offline: () => null })
    none.bank.start()
    await none.drain()
    expect(none.bank.unavailable).toBe(true)
    expect(none.bank.baseReady).toBe(true)
    await none.bank.whenBaseReady(60_000)
    const slow = manualBank()
    slow.bank.start()
    const started = Date.now()
    await slow.bank.whenBaseReady(20)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(slow.bank.baseReady).toBe(false)
  })

  test('renders every effect, three takes of those with variety, in far fewer contexts than effects', async () => {
    const m = manualBank()
    m.bank.start()
    await m.drain()
    expect(m.bank.done).toBe(true)
    for (const name of SFX) expect(m.bank.has(name), name).toBe(true)
    const varied = SFX.filter((name) => probeSfx(name, 1, 1).variety).length
    expect(m.bank.size).toBe(SFX.length + 2 * varied + KNOWN)
    expect(sfxStats.rendered).toBe(m.bank.size)
    expect(m.bank.has('pickup', 1.7)).toBe(true)
    expect(m.bank.has('step', 0.94)).toBe(true)
    expect(m.bank.has('spit', 0.72)).toBe(true)
    expect(m.bank.has('jump', 1.3)).toBe(false)
    expect(m.bank.samples).toBeGreaterThan(48000 * 20)
    expect(m.bank.batches).toBe(m.contexts.length)
    expect(m.contexts.length).toBeLessThan(m.bank.size / 4)
    // No context holds more than eight seconds of sound.
    for (const frames of m.contexts) expect(frames).toBeLessThanOrEqual(8 * 48000)
    expect(m.pieces.filter((p) => p === 'build').length).toBe(m.bank.size)
  })

  test('an effect that had to play live while it was queued is rendered next, in a batch of its own', async () => {
    const m = manualBank()
    m.bank.start()
    await m.step(() => m.bank.size > 0)
    expect(m.bank.has('bossDown')).toBe(false)
    m.bank.want('bossDown', 1)
    m.bank.want('bossDown', 1)
    await m.step(() => m.bank.has('bossDown'))
    expect(m.bank.size).toBe(FIRST.length + 1)
    expect(m.contexts.length).toBe(2)
    await m.drain()
    expect(m.bank.done).toBe(true)
    const varied = SFX.filter((name) => probeSfx(name, 1, 1).variety).length
    expect(m.bank.size).toBe(SFX.length + 2 * varied + KNOWN)
  })

  test('an explicit pitch with no buffer is wanted for next time, once', async () => {
    const m = manualBank()
    m.bank.start()
    await m.drain()
    expect(m.bank.has('jump', 1.3)).toBe(false)
    const before = m.bank.size
    m.bank.want('jump', 1.3)
    m.bank.want('jump', 1.3)
    expect(m.bank.done).toBe(false)
    await m.drain()
    expect(m.bank.has('jump', 1.3)).toBe(true)
    expect(m.bank.size).toBe(before + 1)
    expect(m.bank.done).toBe(true)
  })

  test('a browser without offline rendering leaves every effect to play live', async () => {
    const m = manualBank({ offline: () => null })
    m.bank.start()
    await m.drain()
    expect(m.bank.unavailable).toBe(true)
    expect(m.bank.size).toBe(0)
    expect(sfxStats.rendered).toBe(0)
  })
})

describe('the layout of a batch', () => {
  test('each effect starts on a render quantum, after the tail of the one before it', async () => {
    const bank = new SfxBank({ offline: offline as never })
    const jobs = (['jump', 'bite', 'hurt', 'bossDown'] as const).map((name, i) => ({ name, pitch: 1, seed: i + 1 }))
    const takes = await bank.renderTogether(jobs)
    expect(takes.length).toBe(jobs.length)
    let from = 0
    for (const [i, take] of takes.entries()) {
      expect(take, jobs[i].name).not.toBeNull()
      const start = Math.round(take!.start! * 48000)
      expect(start % 128).toBe(0)
      expect(start).toBe(from)
      expect(take!.end).toBeCloseTo(probeSfx(jobs[i].name, 1, i + 1).end, 9)
      // Its own stretch holds the effect and a tenth of a second of tail.
      expect(take!.length!).toBeGreaterThanOrEqual(take!.end + 0.1)
      expect(take!.length!).toBeLessThan(take!.end + 0.1 + 1 / 48000 + 1e-9)
      from = start + Math.ceil(((take!.end + 0.1) * 48000) / 128) * 128
      expect(take!.buffer).toBe(takes[0]!.buffer)
    }
    expect(takes[0]!.buffer.length).toBe(from)
  })

  test('an effect rendered alone is its whole buffer, or starts after the silence asked for', async () => {
    const bank = new SfxBank({ offline: offline as never })
    const alone = await bank.render('jump', 1, 5)
    expect(alone?.start).toBeUndefined()
    expect(alone?.length).toBeUndefined()
    expect(alone!.buffer.length).toBe(Math.ceil(((alone!.end + 0.1) * 48000) / 128) * 128)
    const later = await bank.render('jump', 1, 5, 1000)
    expect(Math.round(later!.start! * 48000)).toBe(1024)
    expect(later!.end).toBe(alone!.end)
  })
})

describe('playing from the bank', () => {
  async function ready() {
    const m = manualBank()
    m.bank.start()
    await m.drain()
    const { ctx, created } = fakeContext()
    const engine = new AudioEngine(ctx, false, m.bank)
    return { bank: m.bank, engine, created }
  }

  test('a buffered effect costs a source, a gain, a panner and a send', async () => {
    const { engine, created } = await ready()
    const before = created.length
    engine.sfx('bite', { pan: 0.4 }, 0)
    expect(created.slice(before)).toEqual(['source', 'gain', 'panner', 'gain'])
    expect(sfxStats.buffered).toBe(1)
    expect(sfxStats.live).toBe(0)
  })

  test('limits, cooldowns and the voice budget still apply', async () => {
    const { engine } = await ready()
    const def = SFX_DEFS.confetti
    const gap = def.cd + 0.001
    expect(gap * 3).toBeLessThan(0.9)
    for (let i = 0; i < 3; i++) engine.sfx('confetti', {}, i * gap)
    expect(sfxStats.buffered).toBe(def.limit)
    engine.sfx('confetti', {}, 100)
    engine.sfx('confetti', {}, 100)
    expect(sfxStats.buffered).toBe(def.limit + 1)
  })

  test('a take from a batch plays its own stretch of the buffer, a take of its own plays from the start', () => {
    const started: unknown[][] = []
    const node = (): unknown =>
      new Proxy(function () {}, {
        get: (_t, key) => (key === 'start' ? (...args: unknown[]) => void started.push(args) : node()),
        set: () => true,
        apply: () => node()
      })
    const mixer = { ctx: node(), sfx: node(), sfxReverb: node() } as never
    const bank = new SfxBank({ offline: offline as never })
    const buffer = { length: 96000, sampleRate: 48000, duration: 2 } as unknown as AudioBuffer
    bank.add('bite', 1, [{ buffer, start: 1.5, length: 0.4, end: 0.3 }])
    bank.add('jump', 1, [{ buffer, end: 0.3 }])
    const end = bank.play(mixer, 'bite', 2, {})
    expect(started).toEqual([[2, 1.5, 0.4]])
    expect(end).toBeGreaterThan(2.25)
    expect(end).toBeLessThan(2.35)
    bank.play(mixer, 'jump', 3, {})
    expect(started[1]).toEqual([3])
    // A stretch counts for its own length in memory, a whole buffer for all of it.
    expect(bank.samples).toBe(0.4 * 48000 + 96000)
  })

  test('an effect with no buffer for its pitch plays live', async () => {
    const { engine } = await ready()
    engine.sfx('jump', { pitch: 1.33 }, 0)
    expect(sfxStats.live).toBe(1)
    expect(sfxStats.buffered).toBe(0)
  })

  test('an engine without a bank builds every effect live', () => {
    const { ctx } = fakeContext()
    const engine = new AudioEngine(ctx, false)
    engine.sfx('jump', {}, 0)
    expect(sfxStats.live).toBe(1)
  })

  test('every effect can be played from the bank', async () => {
    const { engine } = await ready()
    for (const name of SFX as readonly SfxName[])
      engine.sfx(name, { pan: -2, volume: 3 }, 1000 + SFX.indexOf(name) * 10)
    expect(sfxStats.buffered).toBeGreaterThan(SFX.length - 5)
  })
})

describe('the reverb impulses, built in slices', () => {
  test('stepping through the slices gives the same numbers as building at once', () => {
    const { ctx } = fakeContext(44100)
    const whole = makeImpulse(ctx, 1.1, 3, 1.2)
    const steps = impulseSteps(ctx, 1.1, 3, 1.2, 4096)
    let slices = 0
    let r = steps.next()
    while (!r.done) {
      slices += 1
      r = steps.next()
    }
    expect(slices).toBeGreaterThan(20)
    for (let c = 0; c < 2; c++)
      expect(Array.from(r.value.getChannelData(c))).toEqual(Array.from(whole.getChannelData(c)))
  })
})
