/**
 * The bank of rendered sound effects. Every effect is built once, node by node, in an `OfflineAudioContext` (which
 * renders on its own thread) and kept as a stretch of an AudioBuffer holding its bus signal: the sound before the
 * panner, at volume 1, in mono. Playing an effect is then a buffer source, a gain, a panner and (with a reverb send)
 * one more gain, which is the same graph as a live effect from its bus on. Effects without a buffer yet, and any
 * failure, play live.
 *
 * A fresh context builds the wave table of each oscillator type when the type is first used, and that costs more
 * than the nodes of a whole effect. So the effects are rendered in batches: several of them one after another in one
 * context, each starting on a render-quantum boundary, and each played later from its own stretch of the batch's
 * buffer. The main-thread work of a batch is done a piece at a time (the plan, one wave table, one effect's nodes)
 * in moments the page has nothing else to do.
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
/** Frames of a render quantum: every effect of a batch starts on a multiple of it. */
const QUANTUM = 128
/** The most sound (seconds) and the most effects one offline context renders. */
const BATCH_SECONDS = 8
const BATCH_EFFECTS = 16
/** Offline contexts that may be rendering at the same time. */
const RENDERS_AT_ONCE = 3
/** How long a piece of work waits for an idle moment: in the title and menus, and while a stage is played. */
const IDLE_TIMEOUT_MS = 60
const PLAY_TIMEOUT_MS = 500
/** While a stage is played, a piece that has fitted into no frame for this long is done anyway. */
const PLAY_PATIENCE_MS = 1500
/** The room (ms) taken to be left after a frame where the browser cannot say how much there is. */
const ASSUMED_ROOM_MS = 6
/** No estimate of a piece of work claims more than this (ms), so one slow measurement cannot hold the bank up. */
const MAX_COST_MS = 12

/** The pieces the main-thread work of a batch is made of. */
type Piece = 'plan' | 'noise' | 'wave' | 'build'
/** What a piece is taken to cost (ms) before one has been measured. */
const FIRST_COST: Record<Piece, number> = { plan: 1, noise: 2, wave: 2, build: 1 }

interface IdleDeadline {
  timeRemaining(): number
}
type RequestIdle = (run: (deadline: IdleDeadline) => void, options: { timeout: number }) => unknown

/**
 * Asks for a moment in which the page has nothing else to do; `run` is told how many milliseconds of it are left.
 * While a stage is played the wait for such a moment may be longer.
 */
export type Idle = (run: (room: () => number) => void, playing: () => boolean) => void

const whenIdle: Idle = (run, playing) => {
  const g = globalThis as {
    requestIdleCallback?: RequestIdle
    requestAnimationFrame?: (callback: () => void) => unknown
  }
  if (typeof g.requestIdleCallback === 'function') {
    g.requestIdleCallback((deadline) => run(() => deadline.timeRemaining()), {
      timeout: playing() ? PLAY_TIMEOUT_MS : IDLE_TIMEOUT_MS
    })
    return
  }
  // No idle callbacks here: the moment after a frame has been produced is the one with the most room.
  const go = () => {
    const until = performance.now() + ASSUMED_ROOM_MS
    run(() => until - performance.now())
  }
  if (typeof g.requestAnimationFrame === 'function') g.requestAnimationFrame(() => setTimeout(go, 0))
  else setTimeout(go, 16)
}

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
 * Pitches the sound board asks for (the two footstep pitches, the nest-material ladder, the boss spit). The
 * footsteps are rendered with the hero's effects and the others once every effect has its default pitch; the extra
 * takes of the varied effects come last. Any other pitch is played live once and rendered for the next time.
 */
const HERO_PITCHES: Array<[SfxName, number[]]> = [['step', [0.94, 1.07]]]
const LATER_PITCHES: Array<[SfxName, number[]]> = [
  ['pickup', [1.07, 1.14, 1.21, 1.28, 1.35, 1.42, 1.49, 1.56, 1.63, 1.7]],
  ['spit', [0.72]]
]
const KNOWN_PITCHES = [...HERO_PITCHES, ...LATER_PITCHES]

/** The pitch a buffer is kept for: the requested one rounded to two decimals; anything odd counts as 1. */
export function bankPitch(pitch: number | undefined): number {
  const p = pitch !== undefined && Number.isFinite(pitch) && pitch > 0 ? pitch : 1
  return Math.round(Math.min(4, Math.max(0.25, p)) * 100) / 100
}

const keyOf = (name: SfxName, pitch: number) => `${name}@${pitch.toFixed(2)}`

const WAVES: readonly OscillatorType[] = ['sine', 'triangle', 'square', 'sawtooth']

/**
 * A stand-in for any Web Audio object: every property is another stand-in, every call returns one. It notes the
 * oscillator types the code using it asks for.
 */
function stub(waves: Set<OscillatorType>): unknown {
  const proxy: unknown = new Proxy(function () {}, {
    get: (_t, key) => {
      // An oscillator starts out as a sine, so making one already needs that table.
      if (key === 'createOscillator') waves.add('sine')
      return key === Symbol.toPrimitive ? () => 0 : proxy
    },
    set: (_t, key, value) => {
      if (key === 'type' && WAVES.includes(value as OscillatorType)) waves.add(value as OscillatorType)
      return true
    },
    apply: () => proxy
  })
  return proxy
}

/**
 * Runs an effect's definition against a context that does nothing, to learn how long it lasts, whether it makes
 * random choices of its own (notes and timings, as opposed to where in the noise buffer a layer starts), and which
 * oscillator types it uses.
 */
export function probeSfx(
  name: SfxName,
  pitch: number,
  seed: number
): { end: number; variety: boolean; waves: OscillatorType[] } {
  const waves = new Set<OscillatorType>()
  const s = stub(waves)
  const b = new SfxBuilder(s as BaseAudioContext, s as AudioBuffer, null, 0, pitch, 1, 0, 0, seed)
  SFX_DEFS[name].play(b)
  return { end: b.end, variety: b.draws > b.noiseDraws, waves: WAVES.filter((w) => waves.has(w)) }
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

/**
 * A rendered effect: the buffer it lies in, where it starts there and how much of the buffer is its own (seconds;
 * absent when the buffer holds this effect alone), and the seconds that count as the effect's length (no tail).
 */
export interface Take {
  buffer: AudioBuffer
  start?: number
  length?: number
  end: number
}

/** One effect to render: a name, a pitch and the seed of its random choices. */
export interface BankJob {
  name: SfxName
  pitch: number
  seed: number
}

interface Job {
  name: SfxName
  pitch: number
  /** Set for the extra takes of an effect with variety. */
  seed?: number
  /** One of the buffers a stage waits for: a default pitch or a known pitch. */
  base?: boolean
  /** The batch this job is in ends with it. */
  last?: boolean
}

/** An effect that can be rendered: its seed, and what a dry run of it found. */
interface Probed {
  job: Job
  seed: number
  end: number
  variety: boolean
  waves: OscillatorType[]
}

/** An effect's place in a batch: frames from the start of the context, and the frames kept for it. */
interface Slot {
  job: Job
  key: string
  seed: number
  end: number
  variety: boolean
  offset: number
  frames: number
  failed?: boolean
}

interface Batch {
  ctx: OfflineAudioContext
  slots: Slot[]
  /** Oscillator types whose wave table the context has still to build. */
  waves: OscillatorType[]
  /** Effects built into the context so far. */
  built: number
}

export interface BankOptions {
  sampleRate?: number
  offline?: OfflineFactory
  /** Milliseconds, for the start and finish times and for measuring the pieces of work. */
  now?: () => number
  /** Asks for the next moment to work in; tests replace it. */
  idle?: Idle
}

export class SfxBank {
  private readonly takes = new Map<string, Take[]>()
  private readonly failed = new Set<string>()
  private readonly queued = new Set<string>()
  private readonly extended = new Set<string>()
  private queue: Job[] = []
  /** Effects that had to play live just now: rendered before the rest of the queue, in a batch of their own. */
  private urgent: Job[] = []
  private playing = false
  private extraPitches = 0
  private noise: AudioBuffer | null = null
  /** The batch being built, and the number of batches rendering. */
  private building: Batch | null = null
  private rendering = 0
  private running = false
  private timer = false
  /** What the next piece of each kind is expected to take (ms): the largest of the recent ones. */
  private readonly cost: Record<Piece, number> = { ...FIRST_COST }
  private workedAt = 0
  private readonly offline: OfflineFactory
  private readonly now: () => number
  private readonly idle: Idle
  private readonly isPlaying = () => this.playing
  readonly sampleRate: number
  /** Nothing more is queued: every effect has been rendered or has failed. */
  done = false
  /** Buffers a stage waits for that are still to come (the extra takes come after them). */
  private baseLeft = 0
  private baseWaiters: Array<() => void> = []
  /** The browser has no offline context or refuses to render; every effect plays live. */
  unavailable = false
  stopped = false
  startedAt = 0
  finishedAt = 0
  /** Samples held (four bytes each), for the size in memory. */
  samples = 0
  /** Offline contexts rendered so far. */
  batches = 0

  constructor(options: BankOptions = {}) {
    this.sampleRate = options.sampleRate ?? 48000
    this.offline = options.offline ?? browserOffline
    this.now = options.now ?? (() => performance.now())
    this.idle = options.idle ?? whenIdle
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
    for (const t of takes) this.samples += Math.round((t.length ?? t.buffer.duration) * t.buffer.sampleRate)
  }

  /**
   * Queues every effect at its default pitch and the known pitches, in the order the game needs them, and starts
   * rendering.
   */
  start(): void {
    if (this.running || this.done || this.stopped) return
    this.running = true
    this.startedAt = this.now()
    const add = (name: SfxName, pitch: number) => {
      if (this.enqueue({ name, pitch, base: true })) this.baseLeft += 1
    }
    const close = () => {
      const tail = this.queue.at(-1)
      if (tail) tail.last = true
    }
    // The interface sounds are a batch of their own, so the first taps find them.
    for (const name of FIRST) add(name, 1)
    close()
    for (const name of HERO) add(name, 1)
    for (const [name, pitches] of HERO_PITCHES) for (const pitch of pitches) add(name, pitch)
    close()
    const early = new Set<SfxName>([...FIRST, ...HERO])
    for (const name of Object.keys(SFX_DEFS) as SfxName[]) if (!early.has(name)) add(name, 1)
    for (const [name, pitches] of LATER_PITCHES) for (const pitch of pitches) add(name, pitch)
    close()
    this.kick()
  }

  /**
   * Every effect has a buffer at its default pitch and at the known pitches (or never will: no offline rendering
   * here, or stopped).
   */
  get baseReady(): boolean {
    return this.unavailable || this.stopped || this.done || (this.startedAt > 0 && this.baseLeft <= 0)
  }

  /** Resolves when `baseReady` is true, or after `timeoutMs`. */
  whenBaseReady(timeoutMs: number): Promise<void> {
    if (this.baseReady) return Promise.resolve()
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      this.baseWaiters.push(finish)
      setTimeout(finish, Math.max(0, timeoutMs))
    })
  }

  private settleBase() {
    if (!this.baseReady || !this.baseWaiters.length) return
    for (const finish of this.baseWaiters.splice(0)) finish()
  }

  stop(): void {
    this.stopped = true
    this.queue = []
    this.urgent = []
    this.building = null
    this.settleBase()
  }

  private enqueue(job: Job, where: 'last' | 'urgent' = 'last'): boolean {
    const base = keyOf(job.name, job.pitch)
    const key = job.seed === undefined ? base : `${base}#${job.seed}`
    if (this.queued.has(key) || this.failed.has(base)) return false
    if (job.seed === undefined && this.takes.has(base)) return false
    this.queued.add(key)
    if (where === 'urgent') this.urgent.unshift(job)
    else this.queue.push(job)
    return true
  }

  /**
   * A stage is being played (or no longer is). While it is, a piece of work is done only in a frame that leaves
   * room for it, one piece a frame, so the rendering takes nothing from the frames.
   */
  setPlaying(playing: boolean): void {
    if (playing && !this.playing) this.workedAt = this.now()
    this.playing = playing
  }

  /** An effect that had to play live: render it for the next time (an explicit pitch, or one the queue has not reached). */
  want(name: SfxName, pitch: number | undefined): void {
    if (!this.running && !this.done) return
    if (this.stopped || this.unavailable) return
    const p = bankPitch(pitch)
    if (this.has(name, p)) return
    const waiting = this.queue.findIndex((job) => job.seed === undefined && job.name === name && job.pitch === p)
    if (waiting >= 0) {
      // Already in the queue: bring it forward.
      const [job] = this.queue.splice(waiting, 1)
      // The batch it would have ended now ends with the job before it.
      if (job.last && waiting > 0) this.queue[waiting - 1].last = true
      job.last = false
      this.urgent.unshift(job)
    } else {
      const extra = p !== 1 && !KNOWN_PITCHES.some(([n, ps]) => n === name && ps.includes(p))
      if (extra && this.extraPitches >= MAX_EXTRA_PITCHES) return
      // In a batch already, or failed: nothing to add.
      if (!this.enqueue({ name, pitch: p }, 'urgent')) return
      if (extra) this.extraPitches += 1
    }
    this.running = true
    this.done = false
    this.kick()
  }

  /** The piece of work that comes next, or null while there is none (nothing queued, or enough is rendering). */
  private nextPiece(): Piece | null {
    const batch = this.building
    if (!batch) {
      if (this.rendering >= RENDERS_AT_ONCE) return null
      return this.urgent.length || this.queue.length ? 'plan' : null
    }
    if (!this.noise) return 'noise'
    return batch.waves.length ? 'wave' : 'build'
  }

  private kick(): void {
    if (this.timer || this.stopped || this.unavailable || !this.nextPiece()) return
    this.timer = true
    this.idle((room) => this.pump(room), this.isPlaying)
  }

  /**
   * Works for as long as the moment has room. In the title and menus at least one piece is done, and more while the
   * next one fits. While a stage is played it is one piece at most, and only if it fits; one that has fitted nowhere
   * for a while is done anyway, because an effect that keeps playing live costs more than its render.
   */
  private pump(room: () => number): void {
    this.timer = false
    let pieces = 0
    while (!this.stopped && !this.unavailable) {
      const piece = this.nextPiece()
      if (!piece) break
      const fits = room() >= this.cost[piece]
      if (this.playing) {
        if (pieces > 0) break
        if (!fits && this.now() - this.workedAt < PLAY_PATIENCE_MS) break
      } else if (pieces > 0 && !fits) break
      this.work(piece)
      pieces += 1
    }
    this.settle()
    this.kick()
  }

  private work(piece: Piece): void {
    const started = this.now()
    try {
      if (piece === 'plan') this.plan()
      else if (piece === 'noise') this.noise = makeNoise(this.building!.ctx)
      else if (piece === 'wave') this.building!.ctx.createOscillator().type = this.building!.waves.shift()!
      else this.build()
    } catch {
      // The context cannot be used: its effects play live.
      const batch = this.building
      this.building = null
      if (batch) this.lose(batch)
      else this.giveUp()
    }
    this.workedAt = this.now()
    // Remember the largest of the recent ones, so a piece is only started where it is likely to fit.
    this.cost[piece] = Math.min(MAX_COST_MS, Math.max(this.workedAt - started, this.cost[piece] * 0.9))
  }

  /** Marks the bank finished once nothing is queued, built or rendering. */
  private settle(): void {
    this.settleBase()
    if (this.stopped || this.unavailable || this.done) return
    if (this.urgent.length || this.queue.length || this.building || this.rendering) return
    this.done = true
    this.running = false
    this.finishedAt = this.now()
    this.settleBase()
  }

  /** A job is over (rendered, or it never will be): a stage no longer waits for it. */
  private over(job: Job): void {
    if (job.base) this.baseLeft -= 1
  }

  /** A dry run of an effect, or null when it cannot be rendered (no length, or far too long). */
  private probe(job: Job, seed: number): Probed | null {
    const found = probeSfx(job.name, job.pitch, seed)
    return found.end > 0 && found.end <= MAX_SECONDS ? { job, seed, ...found } : null
  }

  /** The frames kept for an effect of this length: the tail included, up to the next render quantum. */
  private framesOf(end: number): number {
    return Math.ceil(((end + TAIL) * this.sampleRate) / QUANTUM) * QUANTUM
  }

  /**
   * Lays effects out one after another from frame `lead` on, each starting on a render-quantum boundary, with the
   * tail kept after each.
   */
  private lay(list: Probed[], lead = 0): { slots: Slot[]; frames: number; waves: OscillatorType[] } {
    const slots: Slot[] = []
    const waves = new Set<OscillatorType>()
    let frames = lead
    for (const { job, seed, end, variety, waves: own } of list) {
      slots.push({
        job,
        key: keyOf(job.name, job.pitch),
        seed,
        end,
        variety,
        offset: frames,
        frames: this.framesOf(end)
      })
      for (const wave of own) waves.add(wave)
      frames += this.framesOf(end)
    }
    return { slots, frames, waves: WAVES.filter((w) => waves.has(w)) }
  }

  /** Takes the next jobs for a batch (the urgent ones alone, if there are any) and makes its context. */
  private plan(): void {
    const from = this.urgent.length ? this.urgent : this.queue
    const list: Probed[] = []
    const most = BATCH_SECONDS * this.sampleRate
    let frames = 0
    while (from.length && list.length < BATCH_EFFECTS) {
      const job = from[0]
      const probed = this.probe(job, job.seed ?? Math.floor(Math.random() * 2 ** 31))
      if (probed && list.length && frames + this.framesOf(probed.end) > most) break
      from.shift()
      if (probed) {
        list.push(probed)
        frames += this.framesOf(probed.end)
      } else {
        this.failed.add(keyOf(job.name, job.pitch))
        this.over(job)
      }
      if (job.last) break
    }
    if (!list.length) return
    const { slots, waves } = this.lay(list)
    const ctx = this.offline(frames, this.sampleRate)
    if (!ctx) {
      for (const slot of slots) this.over(slot.job)
      this.giveUp()
      return
    }
    this.building = { ctx, slots, waves, built: 0 }
  }

  /** Builds the next effect of the batch into its context, and starts the render after the last one. */
  private build(): void {
    const batch = this.building!
    const slot = batch.slots[batch.built]
    batch.built += 1
    try {
      const at = slot.offset / this.sampleRate
      SFX_DEFS[slot.job.name].play(new SfxBuilder(batch.ctx, this.noise!, null, at, slot.job.pitch, 1, 0, 0, slot.seed))
    } catch {
      slot.failed = true
    }
    if (batch.built < batch.slots.length) return
    this.building = null
    const pending = batch.ctx.startRendering() as Promise<AudioBuffer> | undefined
    if (!pending || typeof pending.then !== 'function') {
      this.lose(batch)
      this.giveUp()
      return
    }
    this.rendering += 1
    pending.then(
      (buffer) => {
        this.rendering -= 1
        this.land(batch, buffer)
      },
      () => {
        this.rendering -= 1
        this.lose(batch)
      }
    )
  }

  /** A batch has been rendered: every effect of it is a take from now on. */
  private land(batch: Batch, buffer: AudioBuffer): void {
    this.batches += 1
    for (const slot of batch.slots) {
      this.over(slot.job)
      if (slot.failed) {
        this.failed.add(slot.key)
        continue
      }
      const take = this.takeOf(slot, buffer)
      const list = this.takes.get(slot.key)
      if (list) list.push(take)
      else this.takes.set(slot.key, [take])
      this.samples += slot.frames
      sfxStats.rendered += 1
      if (slot.variety && slot.job.seed === undefined && !this.extended.has(slot.key)) {
        this.extended.add(slot.key)
        for (let i = 1; i < VARIETY_TAKES; i++)
          // The other takes go to the end of the queue: one take of every effect matters more than variety.
          this.enqueue({ name: slot.job.name, pitch: slot.job.pitch, seed: Math.floor(Math.random() * 2 ** 31) })
      }
    }
    this.settle()
    this.kick()
  }

  private takeOf(slot: Slot, buffer: AudioBuffer): Take {
    return {
      buffer,
      start: slot.offset / this.sampleRate,
      length: Math.ceil((slot.end + TAIL) * this.sampleRate) / this.sampleRate,
      end: slot.end
    }
  }

  /** A batch could not be built or rendered: its effects play live from now on. */
  private lose(batch: Batch): void {
    for (const slot of batch.slots) {
      this.over(slot.job)
      this.failed.add(slot.key)
    }
    this.settle()
    this.kick()
  }

  /**
   * Renders one take of an effect alone: its bus signal at volume 1 with the given pitch and seed, in mono, with a
   * short tail for the filters to ring out, built `at` frames into its context. Resolves to null when the effect
   * cannot be rendered here. The audio tool and the tests compare the batches with this.
   */
  async render(name: SfxName, pitch: number, seed: number, at = 0): Promise<(Take & { variety: boolean }) | null> {
    try {
      if (!SFX_DEFS[name]) return null
      const [take] = await this.renderTogether([{ name, pitch, seed }], at)
      if (!take) return null
      // A take that starts its buffer is the buffer itself.
      return at === 0 ? { buffer: take.buffer, end: take.end, variety: take.variety } : take
    } catch {
      return null
    }
  }

  /**
   * Renders effects as one batch, all at once: the layout, the build and the takes are the ones the queue uses
   * piece by piece. `lead` frames of silence (rounded up to a render quantum) come first. Null stands for an
   * effect that could not be rendered.
   */
  async renderTogether(jobs: BankJob[], lead = 0): Promise<Array<(Take & { variety: boolean }) | null>> {
    const list = jobs.map((job) => this.probe(job, job.seed)).filter((p): p is Probed => p !== null)
    if (!list.length) return jobs.map(() => null)
    const { slots, frames } = this.lay(list, Math.ceil(Math.max(0, lead) / QUANTUM) * QUANTUM)
    const ctx = this.offline(frames, this.sampleRate)
    if (!ctx) {
      this.giveUp()
      return jobs.map(() => null)
    }
    this.noise ??= makeNoise(ctx)
    for (const slot of slots) {
      const at = slot.offset / this.sampleRate
      SFX_DEFS[slot.job.name].play(new SfxBuilder(ctx, this.noise, null, at, slot.job.pitch, 1, 0, 0, slot.seed))
    }
    const pending = ctx.startRendering() as Promise<AudioBuffer> | undefined
    if (!pending || typeof pending.then !== 'function') {
      this.giveUp()
      return jobs.map(() => null)
    }
    const buffer = await pending
    return jobs.map((job) => {
      const slot = slots.find((s) => s.job === job)
      return slot ? { ...this.takeOf(slot, buffer), variety: slot.variety } : null
    })
  }

  private giveUp(): null {
    this.unavailable = true
    this.queue = []
    this.urgent = []
    this.building = null
    this.settleBase()
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
    // Its own stretch of a batch's buffer, or a buffer of its own from the start.
    if (take.start === undefined) src.start(when)
    else src.start(when, take.start, take.length)
    return when + take.end / rate
  }
}
