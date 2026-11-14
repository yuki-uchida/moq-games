/**
 * The audio engine: owns the mixer, the music players, SFX voice accounting and loops. It works on any
 * BaseAudioContext, so the same code runs live (AudioContext) and in the offline render check.
 */
import type { LoopName, SfxName, SfxOptions, ThemeName } from './api'
import type { SfxBank } from './bank'
import { makeNoise } from './instruments'
import { createMixer, type Mixer } from './mixer'
import { MusicPlayer } from './music'
import { SFX_DEFS, playSfx, startLoop, type LoopHandle } from './sfx'
import { SONGS } from './songs'
import { sfxStats } from './stats'

const MAX_SFX_VOICES = 36
/** Seconds of music scheduled ahead of the clock; a budgeted pump may finish a bar a little after it began. */
const LOOKAHEAD = 0.5
/** Hidden tabs throttle timers, so they look further ahead. */
const LOOKAHEAD_HIDDEN = 1.6
/** The most main-thread time one scheduling pass may spend on the music, in milliseconds. */
const TICK_BUDGET_MS = 3

export class AudioEngine {
  readonly mixer: Mixer
  readonly noise: AudioBuffer
  private player: MusicPlayer | null = null
  private theme: ThemeName | null = null
  private layer = 0
  private readonly fading = new Set<MusicPlayer>()
  private timer: ReturnType<typeof setInterval> | undefined
  /** The pending continuation of a pass that ran out of budget. */
  private soon: ReturnType<typeof setTimeout> | undefined
  private readonly active = new Map<SfxName, number[]>()
  private readonly lastStart = new Map<SfxName, number>()
  private readonly loops = new Map<string, { name: LoopName; handle: LoopHandle }>()
  private muted = false
  private volumes = { master: 1, music: 0.7, sfx: 0.9 }
  /** Scheduling horizon; hidden tabs throttle timers so they get a longer one. */
  private lookahead = LOOKAHEAD

  /**
   * `live` engines run the music timer; offline ones (the audio tool) are driven by `pumpMusic`. `bank` plays
   * effects from rendered buffers; without one every effect is built live. `parts` hands in a mixer and a noise
   * buffer that were built ahead of time.
   */
  constructor(
    readonly ctx: BaseAudioContext,
    private readonly live = true,
    private readonly bank: SfxBank | null = null,
    parts: { mixer?: Mixer; noise?: AudioBuffer } = {}
  ) {
    this.mixer = parts.mixer ?? createMixer(ctx)
    this.noise = parts.noise ?? makeNoise(ctx)
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

  /** Whether any of the music can be heard; when not, the players walk through their notes without building them. */
  private audible(): boolean {
    return !this.muted && this.volumes.master > 0 && this.volumes.music > 0
  }

  private tick(): void {
    try {
      if (typeof document !== 'undefined') this.lookahead = document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD
      const now = this.ctx.currentTime
      const silent = !this.audible()
      // Silent players only keep pace with the clock, so that when sound comes back the song is where it should be.
      const until = silent ? now : now + this.lookahead
      const start = performance.now()
      let more = false
      if (this.player?.pump(until, TICK_BUDGET_MS, silent)) more = true
      for (const p of this.fading)
        if (p.pump(until, Math.max(0, TICK_BUDGET_MS - (performance.now() - start)), silent)) more = true
      if (more) this.continueSoon()
    } catch {
      // Never throw out of a timer.
    }
  }

  /** A pass that ran out of budget goes on in the next task instead of waiting for the next timer tick. */
  private continueSoon(): void {
    if (!this.live || this.soon !== undefined) return
    this.soon = setTimeout(() => {
      this.soon = undefined
      this.tick()
    }, 0)
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
    // Building the player was this task's work; its first notes are scheduled by the next one, a pass at a time.
    if (this.live) this.continueSoon()
    else p.pump(startAt + this.lookahead)
  }

  /** Synchronously schedules a whole stretch of the current music (offline rendering). */
  pumpMusic(until: number): void {
    this.player?.pump(until)
  }

  sfx(name: SfxName, options: SfxOptions = {}, when = this.ctx.currentTime): void {
    const def = SFX_DEFS[name]
    if (!def) return
    let list = this.active.get(name)
    if (!list) this.active.set(name, (list = []))
    // Forget the voices that have ended (in place: this runs for every effect the game asks for).
    let kept = 0
    for (let i = 0; i < list.length; i++) if (list[i] > when) list[kept++] = list[i]
    list.length = kept
    if (kept >= def.limit) return
    const last = this.lastStart.get(name)
    if (last !== undefined && when >= last && when - last < def.cd) return
    let total = 0
    for (const l of this.active.values()) {
      if (l === list) total += kept
      else for (let i = 0; i < l.length; i++) if (l[i] > when) total += 1
    }
    if (total >= MAX_SFX_VOICES) return
    const bank = this.bank
    let end = bank?.play(this.mixer, name, when, options)
    if (end !== undefined) sfxStats.buffered += 1
    else {
      end = playSfx(this.mixer, this.noise, name, when, options)
      if (end === undefined) return
      sfxStats.live += 1
      bank?.want(name, options.pitch)
    }
    this.lastStart.set(name, when)
    list.push(end)
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
    if (this.soon !== undefined) clearTimeout(this.soon)
    this.soon = undefined
    for (const l of this.loops.values()) l.handle.stop()
    this.loops.clear()
    this.player = null
    this.fading.clear()
  }
}
