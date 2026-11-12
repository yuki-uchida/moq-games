/**
 * Audio entry point: `createAudio()` returns the Web Audio implementation of GameAudio. `prepare()` builds the
 * context, the reverb impulses, the mixer and the engine in small slices before any gesture (the context starts
 * suspended); `unlock()` (a user gesture) then only resumes it, or builds whatever is still missing at once. In
 * environments without Web Audio every call is a harmless no-op. Nothing here ever throws.
 */
import type { GameAudio, LoopName, SfxName, SfxOptions, ThemeName } from './api'
import { SfxBank } from './bank'
import { AudioEngine } from './engine'
import { makeNoise } from './instruments'
import { createMixer, impulseSteps, MUSIC_IMPULSE, SFX_IMPULSE } from './mixer'

export * from './api'

/** The most main-thread time one slice of the preparation may take, in milliseconds. */
const PREPARE_SLICE_MS = 4

class WebAudio implements GameAudio {
  muted = false
  private engine: AudioEngine | null = null
  private ctx: AudioContext | null = null
  /** Sound effects rendered ahead of time; exists as soon as the context does. */
  bank: SfxBank | null = null
  /** What is left of building the engine in slices, and the timer that runs the next slice. */
  private steps: Generator<void, void, void> | null = null
  private prepTimer: ReturnType<typeof setTimeout> | undefined
  private theme: ThemeName | null = null
  private layer = 0
  private duck = 0
  private readonly volumes = { master: 1, music: 0.7, sfx: 0.9 }
  private disposed = false

  private safe(fn: () => void): void {
    try {
      fn()
    } catch {
      // Audio is decoration: swallow everything.
    }
  }

  prepare(): void {
    if (this.disposed || this.ctx || this.prepTimer !== undefined) return
    this.prepTimer = setTimeout(() => {
      this.prepTimer = undefined
      this.safe(() => {
        if (this.disposed || this.ctx || !this.createContext()) return
        // Making the context is a task of its own.
        this.prepTimer = setTimeout(() => this.safe(() => this.runSlice()), 0)
      })
    }, 0)
  }

  /** Creates the context (suspended without a gesture) and plans the engine; false when there is none. */
  private createContext(): boolean {
    const Ctor: typeof AudioContext | undefined =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!Ctor) return false
    const ctx = new Ctor({ latencyHint: 'interactive' })
    this.ctx = ctx
    this.bank = new SfxBank({ sampleRate: ctx.sampleRate })
    this.steps = this.construct(ctx)
    return true
  }

  /** The engine, built piece by piece: each yield is a point where the work may pause for a task. */
  private *construct(ctx: AudioContext): Generator<void, void, void> {
    const music = yield* impulseSteps(ctx, ...MUSIC_IMPULSE)
    yield
    const sfx = yield* impulseSteps(ctx, ...SFX_IMPULSE)
    yield
    const mixer = createMixer(ctx, null)
    yield
    mixer.convolvers.music.buffer = music
    yield
    mixer.convolvers.sfx.buffer = sfx
    yield
    const noise = makeNoise(ctx)
    const engine = new AudioEngine(ctx, true, this.bank, { mixer, noise })
    yield
    this.adopt(engine)
  }

  /** Runs steps of the preparation for a few milliseconds, then continues in the next task. */
  private runSlice(): void {
    this.prepTimer = undefined
    const steps = this.steps
    if (!steps || this.disposed) return
    try {
      const start = performance.now()
      do {
        if (steps.next().done) {
          this.steps = null
          return
        }
      } while (performance.now() - start < PREPARE_SLICE_MS)
    } catch {
      // The rest is built when the first gesture comes.
      this.steps = null
      return
    }
    this.prepTimer = setTimeout(() => this.safe(() => this.runSlice()), 0)
  }

  /** Builds whatever the preparation has not got to yet, all at once. */
  private finish(): void {
    if (this.prepTimer !== undefined) clearTimeout(this.prepTimer)
    this.prepTimer = undefined
    const steps = this.steps
    this.steps = null
    if (steps) {
      try {
        while (!steps.next().done);
      } catch {
        // Fall through to the plain build below.
      }
    }
    if (!this.engine && this.ctx) this.adopt(new AudioEngine(this.ctx, true, this.bank))
  }

  /** Brings a new engine up to date with everything asked of the audio so far, and starts rendering effects. */
  private adopt(engine: AudioEngine): void {
    this.engine = engine
    for (const k of ['master', 'music', 'sfx'] as const) engine.setVolume(k, this.volumes[k])
    engine.setMuted(this.muted)
    engine.setDuck(this.duck)
    if (this.theme) engine.setMusic(this.theme, this.layer)
    this.bank?.start()
  }

  unlock(): void {
    this.safe(() => {
      if (this.disposed) return
      if (!this.ctx && !this.createContext()) return
      if (!this.engine) this.finish()
      if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined)
    })
  }

  setMusic(theme: ThemeName | null, layer = 0): void {
    this.theme = theme
    this.layer = layer
    this.safe(() => this.engine?.setMusic(theme, layer))
  }

  sfx(name: SfxName, options?: SfxOptions): void {
    this.safe(() => {
      if (this.muted || !this.engine || this.ctx?.state !== 'running') return
      this.engine.sfx(name, options)
    })
  }

  loop(id: string, name: LoopName | null, options?: SfxOptions & { progress?: number }): void {
    this.safe(() => {
      if (!this.engine || this.ctx?.state !== 'running') return
      this.engine.loop(id, this.muted && name ? null : name, options)
    })
  }

  setVolume(kind: 'master' | 'music' | 'sfx', value: number): void {
    this.volumes[kind] = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
    this.safe(() => this.engine?.setVolume(kind, value))
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.safe(() => this.engine?.setMuted(muted))
  }

  setDuck(amount: number): void {
    this.duck = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0))
    this.safe(() => this.engine?.setDuck(this.duck))
  }

  dispose(): void {
    this.disposed = true
    if (this.prepTimer !== undefined) clearTimeout(this.prepTimer)
    this.prepTimer = undefined
    this.steps = null
    this.bank?.stop()
    this.safe(() => {
      this.engine?.dispose()
      void this.ctx?.close().catch(() => undefined)
    })
    this.engine = null
    this.ctx = null
  }
}

export function createAudio(): GameAudio {
  return new WebAudio()
}
