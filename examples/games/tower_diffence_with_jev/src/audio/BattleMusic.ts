/** One streamed track for assaults. No decoded-audio buffer or extra AudioContext. */
export interface MusicPreferences {
  enabled: boolean
  volume: number
}
export const MUSIC_SELECTION_KEY = 'tower-defense-music-selection-v1'
export const MUSIC_PREFERENCES_KEY = 'tower-defense-music-v1'
export function loadMusicPreferences(): MusicPreferences {
  const defaults = { enabled: true, volume: 0.2 }
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(MUSIC_PREFERENCES_KEY) ?? 'null')
    return value &&
      typeof value.enabled === 'boolean' &&
      Number.isFinite(value.volume) &&
      value.volume >= 0 &&
      value.volume <= 1
      ? { enabled: value.enabled, volume: value.volume }
      : defaults
  } catch {
    return defaults
  }
}
export function saveMusicPreferences(value: MusicPreferences): void {
  try {
    globalThis.localStorage?.setItem(MUSIC_PREFERENCES_KEY, JSON.stringify(value))
  } catch {
    /* Storage is optional. */
  }
}

type MusicMedia = Pick<
  HTMLAudioElement,
  'loop' | 'preload' | 'volume' | 'currentTime' | 'play' | 'pause' | 'src' | 'load'
>
export class BattleMusic {
  private active = false
  private enabled = true
  private unlocked = false
  private visible = true
  private playing = false
  private destroyed = false
  private battle = ''
  private attempt = 0
  private readonly normalSource: string
  private track: 'normal' | 'boss' = 'normal'
  private selectionBattle = ''
  private selection = 0
  private status = '襲撃中だけ再生します。'
  constructor(
    private readonly media: MusicMedia,
    private readonly changed: (status: string) => void = () => {},
    private readonly bossSource: string = media.src,
    private readonly alternateSource: string = media.src,
    private readonly random: () => number = Math.random
  ) {
    this.normalSource = media.src
    media.preload = 'none'
    media.loop = true
    media.volume = 0.2
  }
  get diagnostics() {
    return {
      active: this.active,
      track: this.track,
      selection: this.selection,
      enabled: this.enabled,
      playing: this.playing,
      volume: this.media.volume,
      status: this.status
    }
  }
  configure(preferences: MusicPreferences): void {
    this.media.volume = Math.max(0, Math.min(1, preferences.volume))
    const changed = this.enabled !== preferences.enabled
    this.enabled = preferences.enabled
    if (changed) this.reconcile()
  }
  /** Call synchronously from a trusted user gesture. Failed autoplay is retried only on another gesture or state change. */
  unlock(): void {
    this.unlocked = true
    this.reconcile()
  }
  resetSelection(): void {
    this.selectionBattle = ''
    try {
      globalThis.localStorage?.removeItem(MUSIC_SELECTION_KEY)
    } catch {
      /* Optional persistence. */
    }
  }
  private chooseNormal(battle: string): void {
    if (this.selectionBattle === battle) return
    let saved: { battle?: string; selection?: number } | null = null
    try {
      saved = JSON.parse(globalThis.localStorage?.getItem(MUSIC_SELECTION_KEY) ?? 'null')
    } catch {
      /* Optional persistence. */
    }
    this.selection =
      saved?.battle === battle && (saved.selection === 0 || saved.selection === 1)
        ? saved.selection
        : this.random() < 0.5
          ? 0
          : 1
    this.selectionBattle = battle
    try {
      globalThis.localStorage?.setItem(MUSIC_SELECTION_KEY, JSON.stringify({ battle, selection: this.selection }))
    } catch {
      /* Optional persistence. */
    }
  }
  setBattle(active: boolean, battle = '', stage = 1): void {
    const track = stage === 10 ? 'boss' : 'normal'
    if (this.destroyed || (this.active === active && this.battle === battle && this.track === track)) return
    if (active && track === 'normal') this.chooseNormal(battle)
    const source = track === 'boss' ? this.bossSource : this.selection === 0 ? this.normalSource : this.alternateSource
    const switched = this.media.src !== source
    const newBattle = this.battle !== battle
    this.battle = battle
    this.active = active
    this.track = track
    if (!active || newBattle || switched) this.stop(true)
    if (switched) {
      this.media.src = source
      this.media.load()
    }
    this.reconcile()
  }
  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    this.reconcile()
  }
  destroy(): void {
    this.destroyed = true
    this.stop(true)
    this.media.src = ''
    this.media.load()
  }
  private stop(reset: boolean): void {
    ++this.attempt
    this.playing = false
    this.media.pause()
    if (reset) {
      try {
        this.media.currentTime = 0
      } catch {
        /* Metadata may not be loaded yet. */
      }
    }
  }
  private report(status: string): void {
    this.status = status
    this.changed(status)
  }
  private reconcile(): void {
    if (this.destroyed) return
    if (!this.active || !this.enabled || !this.visible || !this.unlocked) {
      this.stop(!this.active)
      this.report(!this.enabled ? 'BGMはミュート中' : '襲撃中だけ再生します。')
      return
    }
    if (this.playing) return
    this.playing = true
    const attempt = ++this.attempt
    try {
      void this.media
        .play()
        .then(() => {
          if (attempt === this.attempt) this.report('襲撃のBGMを再生中')
        })
        .catch(() => {
          if (attempt !== this.attempt) return
          this.playing = false
          this.report('BGMを再生できませんでした。次の操作で再試行します。')
        })
    } catch {
      this.playing = false
      this.report('BGMを再生できませんでした。次の操作で再試行します。')
    }
  }
}
