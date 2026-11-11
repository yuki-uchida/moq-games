/**
 * Audio entry point: `createAudio()` returns the Web Audio implementation of GameAudio. The context is only
 * created by `unlock()` (a user gesture); before that and in environments without Web Audio every call is a
 * harmless no-op. Nothing here ever throws.
 */
import type { GameAudio, LoopName, SfxName, SfxOptions, ThemeName } from './api'
import { AudioEngine } from './engine'

export * from './api'

class WebAudio implements GameAudio {
  muted = false
  private engine: AudioEngine | null = null
  private ctx: AudioContext | null = null
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

  unlock(): void {
    this.safe(() => {
      if (this.disposed) return
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          typeof window === 'undefined'
            ? undefined
            : (window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        if (!Ctor) return
        this.ctx = new Ctor({ latencyHint: 'interactive' })
        this.engine = new AudioEngine(this.ctx)
        for (const k of ['master', 'music', 'sfx'] as const) this.engine.setVolume(k, this.volumes[k])
        this.engine.setMuted(this.muted)
        this.engine.setDuck(this.duck)
        if (this.theme) this.engine.setMusic(this.theme, this.layer)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
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
