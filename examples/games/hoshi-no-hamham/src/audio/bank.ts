/**
 * The bank of rendered sound effects. Every effect is built once, node by node, in an `OfflineAudioContext` (which
 * renders on its own thread) and kept as an AudioBuffer of its bus signal: the sound before the panner, at volume 1,
 * in mono. Playing an effect is then a buffer source, a gain, a panner and (with a reverb send) one more gain, which
 * is the same graph as a live effect from its bus on. Effects without a buffer yet, and any failure, play live.
 */
import type { SfxName } from './api'
import { makeNoise } from './instruments'
import type { Mixer } from './mixer'
import { SFX_DEFS } from './sfx'
import { SfxBuilder } from './sfx-builder'
import { SFX_TRIM } from './sfx-trim'
import { sfxStats } from './stats'

/** Takes rendered for an effect whose definition picks notes or timings at random. */
const VARIETY_TAKES = 3
/** Seconds rendered past the end the definition computes, so the ringing of its filters is not cut off. */
const TAIL = 0.1
/** Longest effect the bank renders, in seconds (the longest designed one is under 2). */
const MAX_SECONDS = 8
/** Pitches other than the default and the known ones that the bank will keep buffers for. */
const MAX_EXTRA_PITCHES = 48
/** Wait between two renders in the title and menus, and while sound effects are being asked for. */
const IDLE_GAP_MS = 30
const BUSY_GAP_MS = 250
/** How long after the last sound effect request the game counts as being played. */
const BUSY_WINDOW_MS = 3000

/** Interface sounds first (the menus can be used at once), then the hero's, then the rest in the order of `SFX`. */
const FIRST: SfxName[] = [
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
]
const HERO: SfxName[] = [
  'jump',
  'land',
  'landHard',
  'step',
  'skid',
  'bite',
  'biteHit',
  'hurt',
  'die',
  'splashIn',
  'splashOut',
  'swim',
  'drop',
  'respawn',
  'heal',
  'starGet',
  'pickup',
  'lowHp'
]
/**
 * Pitches the sound board asks for (the nest-material ladder, the two footstep pitches, the boss spit); they are
 * rendered last. Any other pitch is played live once and rendered for the next time.
 */
const KNOWN_PITCHES: Array<[SfxName, number[]]> = [
  ['pickup', [1.07, 1.14, 1.21, 1.28, 1.35, 1.42, 1.49, 1.56, 1.63, 1.7]],
  ['step', [0.94, 1.07]],
  ['spit', [0.72]]
]

/** The pitch a buffer is kept for: the requested one rounded to two decimals; anything odd counts as 1. */
export function bankPitch(pitch: number | undefined): number {
  const p = pitch !== undefined && Number.isFinite(pitch) && pitch > 0 ? pitch : 1
  return Math.round(Math.min(4, Math.max(0.25, p)) * 100) / 100
}

const keyOf = (name: SfxName, pitch: number) => `${name}@${pitch.toFixed(2)}`

/** A stand-in for any Web Audio object: every property is another stand-in, every call returns one. */
function stub(): unknown {
  const proxy: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : proxy),
    set: () => true,
    apply: () => proxy
  })
  return proxy
}

/**
 * Runs an effect's definition against a context that does nothing, to learn how long it lasts and whether it makes
 * random choices of its own (notes and timings, as opposed to where in the noise buffer a layer starts).
 */
export function probeSfx(name: SfxName, pitch: number, seed: number): { end: number; variety: boolean } {
  const s = stub()
  const b = new SfxBuilder(s as BaseAudioContext, s as AudioBuffer, null, 0, pitch, 1, 0, 0, seed)
  SFX_DEFS[name].play(b)
  return { end: b.end, variety: b.draws > b.noiseDraws }
}

export type OfflineFactory = (frames: number, sampleRate: number) => OfflineAudioContext | null

const browserOffline: OfflineFactory = (frames, sampleRate) => {
  try {
    const Ctor: typeof OfflineAudioContext | undefined =
      typeof OfflineAudioContext !== 'undefined'
        ? OfflineAudioContext
        : (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
            .webkitOfflineAudioContext
    return Ctor ? new Ctor(1, frames, sampleRate) : null
  } catch {
    return null
  }
}

/** A rendered effect: the buffer, and the seconds of it that count as the effect's length (without the tail). */
export interface Take {
  buffer: AudioBuffer
  end: number
}

interface Job {
  name: SfxName
  pitch: number
  /** Set for the extra takes of an effect with variety. */
  seed?: number
}

export interface BankOptions {
  sampleRate?: number
  offline?: OfflineFactory
  /** Milliseconds, for pacing and for the "game is being played" test. */
  now?: () => number
  /** Schedules the next step; tests replace it. */
  wait?: (fn: () => void, ms: number) => void
}

export class SfxBank {
  private readonly takes = new Map<string, Take[]>()
  private readonly failed = new Set<string>()
  private readonly queued = new Set<string>()
  private readonly extended = new Set<string>()
  private queue: Job[] = []
  private extraPitches = 0
  private noise: AudioBuffer | null = null
  private running = false
  private timer = false
  private lastRequest = -Infinity
  private readonly offline: OfflineFactory
  private readonly now: () => number
  private readonly wait: (fn: () => void, ms: number) => void
  readonly sampleRate: number
  /** Nothing more is queued: every effect has been rendered or has failed. */
  done = false
  /** The browser has no offline context or refuses to render; every effect plays live. */
  unavailable = false
  stopped = false
  startedAt = 0
  finishedAt = 0
  /** Samples held (four bytes each), for the size in memory. */
  samples = 0

  constructor(options: BankOptions = {}) {
    this.sampleRate = options.sampleRate ?? 48000
    this.offline = options.offline ?? browserOffline
    this.now = options.now ?? (() => performance.now())
    this.wait = options.wait ?? ((fn, ms) => void setTimeout(fn, ms))
  }

  /** Buffers held (every take counts). */
  get size(): number {
    let n = 0
    for (const t of this.takes.values()) n += t.length
    return n
  }

  has(name: SfxName, pitch?: number): boolean {
    return this.takes.has(keyOf(name, bankPitch(pitch)))
  }

  /** Puts rendered takes in the bank (the tests and the proof pass hand theirs in). */
  add(name: SfxName, pitch: number, takes: Take[]): void {
    this.takes.set(keyOf(name, pitch), takes)
    for (const t of takes) this.samples += t.buffer.length
  }

  /** Queues every effect at its default pitch, in the order the game needs them, and starts rendering. */
  start(): void {
    if (this.running || this.done || this.stopped) return
    this.running = true
    this.startedAt = this.now()
    const order: SfxName[] = [...FIRST, ...HERO]
    for (const name of Object.keys(SFX_DEFS) as SfxName[]) if (!order.includes(name)) order.push(name)
    for (const name of order) this.enqueue({ name, pitch: 1 })
    for (const [name, pitches] of KNOWN_PITCHES) for (const pitch of pitches) this.enqueue({ name, pitch })
    this.kick()
  }

  stop(): void {
    this.stopped = true
    this.queue = []
  }

  private enqueue(job: Job, front = false): boolean {
    const base = keyOf(job.name, job.pitch)
    const key = job.seed === undefined ? base : `${base}#${job.seed}`
    if (this.queued.has(key) || this.failed.has(base)) return false
    if (job.seed === undefined && this.takes.has(base)) return false
    this.queued.add(key)
    if (front) this.queue.unshift(job)
    else this.queue.push(job)
    return true
  }

  /** Noted by the engine when an effect is asked for: the game is being played, so renders keep a longer gap. */
  touch(): void {
    this.lastRequest = this.now()
  }

  /** An effect that had to play live: render it for the next time (an explicit pitch, or one the queue has not reached). */
  want(name: SfxName, pitch: number | undefined): void {
    if (!this.running && !this.done) return
    if (this.stopped || this.unavailable) return
    const p = bankPitch(pitch)
    if (this.has(name, p)) return
    if (!KNOWN_PITCHES.some(([n, ps]) => n === name && ps.includes(p)) && p !== 1) {
      if (this.extraPitches >= MAX_EXTRA_PITCHES) return
      this.extraPitches += 1
    }
    if (!this.enqueue({ name, pitch: p }, true)) return
    this.running = true
    this.done = false
    this.kick()
  }

  private kick(): void {
    if (this.timer || this.stopped || this.unavailable) return
    this.timer = true
    this.wait(() => {
      this.timer = false
      this.step()
    }, 0)
  }

  private step(): void {
    if (this.stopped) return
    const job = this.queue.shift()
    if (!job) {
      this.done = true
      this.running = false
      this.finishedAt = this.now()
      return
    }
    // One build per task, and a pause before the next so a frame is never squeezed between two of them.
    const next = () => {
      if (this.stopped) return
      this.timer = true
      const busy = this.now() - this.lastRequest < BUSY_WINDOW_MS
      this.wait(
        () => {
          this.timer = false
          this.step()
        },
        busy ? BUSY_GAP_MS : IDLE_GAP_MS
      )
    }
    this.timer = true
    this.renderJob(job).then(next, next)
  }

  private async renderJob(job: Job): Promise<void> {
    const key = keyOf(job.name, job.pitch)
    const seed = job.seed ?? Math.floor(Math.random() * 2 ** 31)
    const made = await this.render(job.name, job.pitch, seed)
    if (!made) {
      this.failed.add(key)
      return
    }
    const list = this.takes.get(key)
    const take = { buffer: made.buffer, end: made.end }
    if (list) list.push(take)
    else this.takes.set(key, [take])
    this.samples += made.buffer.length
    sfxStats.rendered += 1
    if (made.variety && job.seed === undefined && !this.extended.has(key)) {
      this.extended.add(key)
      for (let i = 1; i < VARIETY_TAKES; i++)
        this.enqueue({ name: job.name, pitch: job.pitch, seed: Math.floor(Math.random() * 2 ** 31) }, true)
    }
  }

  /**
   * Renders one take of an effect: its bus signal at volume 1 with the given pitch and seed, in mono, with a short
   * tail for the filters to ring out. Resolves to null when the effect cannot be rendered here.
   */
  async render(name: SfxName, pitch: number, seed: number): Promise<(Take & { variety: boolean }) | null> {
    try {
      const def = SFX_DEFS[name]
      if (!def) return null
      const probe = probeSfx(name, pitch, seed)
      if (!(probe.end > 0) || probe.end > MAX_SECONDS) return null
      const ctx = this.offline(Math.ceil((probe.end + TAIL) * this.sampleRate), this.sampleRate)
      if (!ctx) return this.giveUp()
      this.noise ??= makeNoise(ctx)
      def.play(new SfxBuilder(ctx, this.noise, null, 0, pitch, 1, 0, 0, seed))
      const pending = ctx.startRendering() as Promise<AudioBuffer> | undefined
      if (!pending || typeof pending.then !== 'function') return this.giveUp()
      return { buffer: await pending, end: probe.end, variety: probe.variety }
    } catch {
      return null
    }
  }

  private giveUp(): null {
    this.unavailable = true
    this.queue = []
    return null
  }

  /**
   * Starts a buffered effect: source -> gain -> panner -> mixer.sfx, and panner -> send -> mixer.sfxReverb. Returns
   * the context time it ends, or undefined when the bank has no buffer for it (the caller plays it live).
   */
  play(
    mixer: Mixer,
    name: SfxName,
    when: number,
    opts: { pan?: number; volume?: number; pitch?: number }
  ): number | undefined {
    const takes = this.takes.get(keyOf(name, bankPitch(opts.pitch)))
    if (!takes || takes.length === 0) return undefined
    const def = SFX_DEFS[name]
    const take = takes.length === 1 ? takes[0] : takes[Math.floor(Math.random() * takes.length)]
    // The live effect scales every frequency by 1 +- vary; playing the buffer faster or slower does the same.
    const rate = 1 + (Math.random() * 2 - 1) * (def.vary ?? 0.05)
    const ctx = mixer.ctx
    const src = ctx.createBufferSource()
    src.buffer = take.buffer
    src.playbackRate.value = rate
    const gain = ctx.createGain()
    gain.gain.value = def.g * (SFX_TRIM[name] ?? 1) * Math.max(0, Math.min(1, opts.volume ?? 1))
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0))
    src.connect(gain)
    gain.connect(pan)
    pan.connect(mixer.sfx)
    const rev = def.rev ?? 0.12
    if (rev > 0) {
      const send = ctx.createGain()
      send.gain.value = rev
      pan.connect(send)
      send.connect(mixer.sfxReverb)
    }
    src.start(when)
    return when + take.end / rate
  }
}
