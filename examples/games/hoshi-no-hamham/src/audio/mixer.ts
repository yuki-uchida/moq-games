/**
 * The mixing graph. Music and SFX each have a bus with their own volume; music passes through a muffling
 * low-pass and a duck gain (menus, big SFX); a generated-impulse convolution reverb and a stereo chorus are
 * shared sends; everything ends in a compressor/limiter and a soft clipper so nothing ever clips.
 */

export interface Mixer {
  ctx: BaseAudioContext
  /** Music parts connect here (after their own pan). */
  music: GainNode
  /** SFX voices connect here. */
  sfx: GainNode
  /** Reverb send inputs (wet return is internal). */
  musicReverb: GainNode
  sfxReverb: GainNode
  /** Stereo chorus send. */
  chorus: GainNode
  master: GainNode
  musicVolume: GainNode
  sfxVolume: GainNode
  /** Automated by big SFX. */
  sfxDuck: GainNode
  /** Automated by setDuck. */
  menuDuck: GainNode
  muffle: BiquadFilterNode
  /** The two reverbs' convolvers, for a caller that hands in their impulse responses later. */
  convolvers: { music: ConvolverNode; sfx: ConvolverNode }
}

/** The settings of the two reverb impulse responses: seconds, decay exponent, darkening of the tail. */
export const MUSIC_IMPULSE = [2.6, 2.4, 0.5] as const
export const SFX_IMPULSE = [1.1, 3, 1.2] as const

/** The impulse responses `createMixer` convolves with; built ahead of time they are handed in. */
export interface Impulses {
  music: AudioBuffer
  sfx: AudioBuffer
}

/**
 * Builds a decaying stereo noise impulse response with a darkening tail, a few thousand samples per step. A step
 * yields until the whole buffer is filled and normalised, so a caller can spread the work over several tasks;
 * `makeImpulse` runs it to the end at once. The numbers do not depend on how the steps are spread.
 */
export function* impulseSteps(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
  dark: number,
  chunk = 2048
): Generator<void, AudioBuffer, void> {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  let seed = 90210
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed / 0xffffffff) * 2 - 1
  }
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      const k = Math.min(0.95, 0.12 + dark * t * 1.4)
      lp += (rnd() - lp) * (1 - k)
      const early = i < rate * 0.012 ? 0 : 1
      d[i] = lp * Math.pow(1 - t, decay) * early * (1 + 0.6 * Math.exp(-i / (rate * 0.03)))
      if ((i + 1) % chunk === 0) yield
    }
  }
  // Normalise energy so the send level is predictable.
  let sum = 0
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      sum += d[i] * d[i]
      if ((i + 1) % chunk === 0) yield
    }
  }
  const norm = 1 / Math.sqrt(sum / 2 / (rate / 4))
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      d[i] *= norm * 0.5
      if ((i + 1) % chunk === 0) yield
    }
  }
  return buf
}

/** A decaying stereo noise impulse response with a darkening tail. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number, dark: number): AudioBuffer {
  const steps = impulseSteps(ctx, seconds, decay, dark)
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
  }
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const a = Math.abs(x)
    const knee = 0.72
    curve[i] = a <= knee ? x : Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)))
  }
  return curve
}

/**
 * Builds the mixing graph. The reverbs convolve with `impulses` when given, build their own when omitted, and with
 * `null` are left without one: the caller then sets `mixer.convolvers.*.buffer` (setting one is the costly step).
 */
export function createMixer(ctx: BaseAudioContext, impulses?: Impulses | null): Mixer {
  const gain = (v: number) => {
    const g = ctx.createGain()
    g.gain.value = v
    return g
  }
  const master = gain(0.9)
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -9
  limiter.knee.value = 6
  limiter.ratio.value = 10
  limiter.attack.value = 0.004
  limiter.release.value = 0.22
  const clip = ctx.createWaveShaper()
  clip.curve = softClipCurve()
  master.connect(limiter)
  limiter.connect(clip)
  clip.connect(ctx.destination)

  // Music path: parts -> music -> muffle -> menuDuck -> sfxDuck -> musicVolume -> master.
  const music = gain(1)
  const muffle = ctx.createBiquadFilter()
  muffle.type = 'lowpass'
  muffle.frequency.value = 20000
  muffle.Q.value = 0.4
  const menuDuck = gain(1)
  const sfxDuck = gain(1)
  const musicVolume = gain(0.7)
  // A gentle EQ on the whole music bus: tame the low-mid mud, add presence and air.
  const eq = (type: BiquadFilterType, f: number, q: number, g: number) => {
    const n = ctx.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = q
    n.gain.value = g
    return n
  }
  const eqLow = eq('lowshelf', 140, 0.7, -3)
  const eqPres = eq('peaking', 3000, 0.8, 2.5)
  const eqAir = eq('highshelf', 5200, 0.7, 8)
  // Offsets the level the air shelves add so the overall music level stays where it was.
  const trim = gain(0.85)
  const eqTop = eq('highshelf', 9000, 0.7, 4.5)
  music.connect(eqLow)
  eqLow.connect(eqPres)
  eqPres.connect(eqAir)
  eqAir.connect(eqTop)
  eqTop.connect(trim)
  trim.connect(muffle)
  muffle.connect(menuDuck)
  menuDuck.connect(sfxDuck)
  sfxDuck.connect(musicVolume)
  musicVolume.connect(master)

  const musicReverb = gain(1)
  const musicConv = ctx.createConvolver()
  if (impulses !== null) musicConv.buffer = impulses?.music ?? makeImpulse(ctx, ...MUSIC_IMPULSE)
  const musicWet = gain(0.62)
  musicReverb.connect(musicConv)
  musicConv.connect(musicWet)
  musicWet.connect(music)

  const chorus = gain(1)
  const dl = ctx.createDelay(0.1)
  const dr = ctx.createDelay(0.1)
  dl.delayTime.value = 0.019
  dr.delayTime.value = 0.025
  const pl = ctx.createStereoPanner()
  const pr = ctx.createStereoPanner()
  pl.pan.value = -0.85
  pr.pan.value = 0.85
  const wet = gain(0.6)
  chorus.connect(dl)
  chorus.connect(dr)
  dl.connect(pl)
  dr.connect(pr)
  pl.connect(wet)
  pr.connect(wet)
  wet.connect(music)
  for (const [d, rate, depth] of [
    [dl, 0.27, 0.0035],
    [dr, 0.21, 0.004]
  ] as const) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = rate
    const lg = gain(depth)
    lfo.connect(lg)
    lg.connect(d.delayTime)
    lfo.start()
  }

  // SFX path.
  const sfx = gain(1)
  // Keep the 2-6 kHz zone of the effects gentle (they are short and bright; this avoids harshness without dulling them).
  const sfxPres = ctx.createBiquadFilter()
  sfxPres.type = 'peaking'
  sfxPres.frequency.value = 3600
  sfxPres.Q.value = 0.8
  sfxPres.gain.value = -3
  const sfxVolume = gain(0.9)
  sfx.connect(sfxPres)
  sfxPres.connect(sfxVolume)
  sfxVolume.connect(master)
  const sfxReverb = gain(1)
  const sfxConv = ctx.createConvolver()
  if (impulses !== null) sfxConv.buffer = impulses?.sfx ?? makeImpulse(ctx, ...SFX_IMPULSE)
  const sfxWet = gain(0.5)
  sfxReverb.connect(sfxConv)
  sfxConv.connect(sfxWet)
  sfxWet.connect(sfxVolume)

  return {
    ctx,
    music,
    sfx,
    musicReverb,
    sfxReverb,
    chorus,
    master,
    musicVolume,
    sfxVolume,
    sfxDuck,
    menuDuck,
    muffle,
    convolvers: { music: musicConv, sfx: sfxConv }
  }
}
