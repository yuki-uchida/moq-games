/**
 * The audio engine: owns the mixer, the music players, SFX voice accounting and loops. It works on any
 * BaseAudioContext, so the same code runs live (AudioContext) and in the offline render check.
 */
import type { LoopName, SfxName, SfxOptions, ThemeName } from './api'
import { makeNoise } from './instruments'
import { createMixer, type Mixer } from './mixer'
import { MusicPlayer } from './music'
import { SFX_DEFS, playSfx, startLoop, type LoopHandle } from './sfx'
import { SONGS } from './songs'
import { sfxStats } from './stats'

const MAX_SFX_VOICES = 36

export class AudioEngine {
  readonly mixer: Mixer
  readonly noise: AudioBuffer
  private player: MusicPlayer | null = null
  private theme: ThemeName | null = null
  private layer = 0
  private readonly fading = new Set<MusicPlayer>()
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly active = new Map<SfxName, number[]>()
  private readonly lastStart = new Map<SfxName, number>()
  private readonly loops = new Map<string, { name: LoopName; handle: LoopHandle }>()
  private muted = false
  private volumes = { master: 1, music: 0.7, sfx: 0.9 }
  /** Scheduling horizon; hidden tabs throttle timers so they get a longer one. */
  private lookahead = 0.3

  constructor(
    readonly ctx: BaseAudioContext,
    private readonly live = true
  ) {
    this.mixer = createMixer(ctx)
    this.noise = makeNoise(ctx)
    this.applyVolumes()
    if (live) this.timer = setInterval(() => this.tick(), 40)
  }

  private applyVolumes(): void {
    const t = this.ctx.currentTime
    const m = this.mixer
    m.master.gain.setTargetAtTime(this.muted ? 0 : 0.9 * this.volumes.master, t, 0.03)
    m.musicVolume.gain.setTargetAtTime(this.volumes.music * 0.8, t, 0.03)
    m.sfxVolume.gain.setTargetAtTime(this.volumes.sfx, t, 0.03)
  }

  setVolume(kind: 'master' | 'music' | 'sfx', value: number): void {
    this.volumes[kind] = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
    this.applyVolumes()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyVolumes()
  }

  setDuck(amount: number): void {
    const a = Math.max(0, Math.min(1, amount))
    const t = this.ctx.currentTime
    this.mixer.menuDuck.gain.setTargetAtTime(1 - 0.5 * a, t, 0.12)
    this.mixer.muffle.frequency.setTargetAtTime(20000 * Math.pow(0.05, a), t, 0.12)
  }

  private tick(): void {
    try {
      if (typeof document !== 'undefined') this.lookahead = document.hidden ? 1.6 : 0.3
      const until = this.ctx.currentTime + this.lookahead
      this.player?.pump(until)
      for (const p of this.fading) p.pump(until)
    } catch {
      // Never throw out of a timer.
    }
  }

  /** Starts, changes or stops the music. `startAt` is a context time (offline use). */
  setMusic(theme: ThemeName | null, layer = 0, startAt = this.ctx.currentTime + 0.05): void {
    const l = Math.max(0, Math.min(2, Math.floor(layer || 0)))
    if (theme === this.theme && (theme === null || this.player)) {
      if (this.player && l !== this.layer) this.player.setLayer(l)
      this.layer = l
      return
    }
    const old = this.player
    this.player = null
    this.theme = theme
    this.layer = l
    const jingle = theme === 'clear' || theme === 'gameover'
    if (old) {
      this.fading.add(old)
      const fade = jingle ? 0.25 : theme === null ? 0.8 : 1.2
      old.fadeOut(fade, () => this.fading.delete(old))
    }
    if (theme === null) return
    const song = SONGS[theme]
    if (!song) return
    const p = new MusicPlayer(this.mixer, this.noise, song, l, startAt, this.live)
    if (old) p.fadeIn(jingle ? 0.05 : 1.2)
    this.player = p
    p.pump(startAt + this.lookahead)
  }

  /** Synchronously schedules a whole stretch of the current music (offline rendering). */
  pumpMusic(until: number): void {
    this.player?.pump(until)
  }

  sfx(name: SfxName, options: SfxOptions = {}, when = this.ctx.currentTime): void {
    const def = SFX_DEFS[name]
    if (!def) return
    const list = (this.active.get(name) ?? []).filter((end) => end > when)
    if (list.length >= def.limit) {
      this.active.set(name, list)
      return
    }
    const last = this.lastStart.get(name)
    if (last !== undefined && when >= last && when - last < def.cd) return
    let total = 0
    for (const l of this.active.values()) total += l.filter((e) => e > when).length
    if (total >= MAX_SFX_VOICES) return
    const end = playSfx(this.mixer, this.noise, name, when, options)
    if (end === undefined) return
    sfxStats.live += 1
    this.lastStart.set(name, when)
    list.push(end)
    this.active.set(name, list)
    if (def.duck) this.duck(def.duck[0], def.duck[1], when)
  }

  private duck(amount: number, hold: number, when: number): void {
    const g = this.mixer.sfxDuck.gain
    g.cancelScheduledValues(when)
    g.setTargetAtTime(1 - amount, when, 0.03)
    g.setTargetAtTime(1, when + hold * 0.5, hold * 0.35)
  }

  loop(id: string, name: LoopName | null, options: SfxOptions & { progress?: number } = {}): void {
    const cur = this.loops.get(id)
    if (name === null) {
      if (cur) {
        cur.handle.stop()
        this.loops.delete(id)
      }
      return
    }
    if (cur && cur.name !== name) {
      cur.handle.stop()
      this.loops.delete(id)
    }
    let entry = this.loops.get(id)
    if (!entry) {
      if (this.loops.size >= 8) return
      entry = { name, handle: startLoop(this.mixer, this.noise, name) }
      this.loops.set(id, entry)
    }
    entry.handle.update(options)
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    for (const l of this.loops.values()) l.handle.stop()
    this.loops.clear()
    this.player = null
    this.fading.clear()
  }
}
