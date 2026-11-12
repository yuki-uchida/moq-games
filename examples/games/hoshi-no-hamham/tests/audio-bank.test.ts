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

/** A bank whose timers are driven by hand: `run()` fires the next one and reports the wait it asked for. */
function manualBank(extra: { now?: () => number; offline?: typeof offline | (() => null) } = {}) {
  const timers: Array<{ fn: () => void; ms: number }> = []
  const bank = new SfxBank({
    offline: (extra.offline ?? offline) as never,
    now: extra.now,
    wait: (fn, ms) => void timers.push({ fn, ms })
  })
  const settle = () => new Promise<void>((r) => setTimeout(r, 0))
  return {
    bank,
    timers,
    /** Fires the pending timer and lets the render it started finish. */
    async run() {
      const t = timers.shift()
      if (!t) return undefined
      t.fn()
      await settle()
      return t.ms
    },
    async drain(limit = 2000) {
      const waits: number[] = []
      for (let i = 0; i < limit && timers.length; i++) waits.push((await this.run()) as number)
      return waits
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
})

describe('the render queue', () => {
  test('renders one effect per task, interface sounds first, and rests while a stage is played', async () => {
    const m = manualBank()
    const order: string[] = []
    const render = m.bank.render.bind(m.bank)
    m.bank.render = (name, pitch, seed) => {
      if (order.at(-1) !== name) order.push(name)
      return render(name, pitch, seed)
    }
    m.bank.start()
    expect(m.bank.size).toBe(0)
    expect(await m.run()).toBe(0)
    const waits: number[] = []
    for (let i = 0; i < 40; i++) {
      const before = m.bank.size
      waits.push((await m.run()) as number)
      expect(m.bank.size).toBe(before + 1)
    }
    expect(order.slice(0, 10)).toEqual([
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
    ])
    expect(order[10]).toBe('jump')
    expect(new Set(waits)).toEqual(new Set([30]))
    // While a stage is played the queue rests: the pending timer finds nothing it may render.
    m.bank.setPlaying(true)
    const held = m.bank.size
    await m.run()
    expect(m.bank.size).toBe(held)
    expect(m.timers.length).toBe(0)
    expect(m.bank.done).toBe(false)
    // An effect that had to play live is still rendered, with the longer gap after it.
    expect(m.bank.has('bossDown')).toBe(false)
    m.bank.want('bossDown', 1)
    expect(await m.run()).toBe(0)
    expect(m.bank.has('bossDown')).toBe(true)
    expect(m.timers.at(-1)?.ms).toBe(250)
    // Play is over: the queue carries on where it stopped, at the short gap.
    m.bank.setPlaying(false)
    await m.drain()
    expect(m.bank.done).toBe(true)
  })

  test('renders every effect, three takes of those with variety, and counts the buffers', async () => {
    const m = manualBank()
    m.bank.start()
    await m.drain()
    expect(m.bank.done).toBe(true)
    for (const name of SFX) expect(m.bank.has(name), name).toBe(true)
    const varied = SFX.filter((name) => probeSfx(name, 1, 1).variety).length
    const known = 10 + 2 + 1
    expect(m.bank.size).toBe(SFX.length + 2 * varied + known)
    expect(sfxStats.rendered).toBe(m.bank.size)
    expect(m.bank.has('pickup', 1.7)).toBe(true)
    expect(m.bank.has('step', 0.94)).toBe(true)
    expect(m.bank.has('spit', 0.72)).toBe(true)
    expect(m.bank.has('jump', 1.3)).toBe(false)
    expect(m.bank.samples).toBeGreaterThan(48000 * 20)
  })

  test('an explicit pitch with no buffer is wanted for next time, once', async () => {
    const m = manualBank()
    m.bank.start()
    await m.drain()
    expect(m.bank.has('jump', 1.3)).toBe(false)
    m.bank.want('jump', 1.3)
    m.bank.want('jump', 1.3)
    await m.drain()
    expect(m.bank.has('jump', 1.3)).toBe(true)
    expect(m.bank.size).toBeGreaterThan(0)
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
