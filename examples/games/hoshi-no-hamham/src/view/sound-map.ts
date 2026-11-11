/**
 * What every simulation event, the footstep cue and the menu actions sound like, mapped onto the existing
 * `AudioEngine` (`src/game/audio.ts`). This file is the whole seam to the audio layer: a later task swaps in the
 * new engine by replacing this map and `SoundSink`. Events with no fitting sound in the old engine reuse the
 * closest one; `null` means deliberately silent (the old engine has no soft sound for it).
 */
import type { AudioEngine } from '../game/audio'
import type { SimEvent, SimEventType } from '../game/events'
import type { CueSink, SoundCue } from './cues'

export type { SoundCue } from './cues'

export type Sfx = Parameters<AudioEngine['play']>[0]

/** The part of the audio engine the view talks to. */
export interface SoundSink {
  play(name: Sfx): void
}

type Picker<K extends SimEventType> = (event: Extract<SimEvent, { type: K }>) => Sfx | null
export type SoundMap = { [K in SimEventType]: Picker<K> }

export const SOUND_MAP: SoundMap = {
  jump: () => 'jump',
  land: (e) => (e.speed > 260 ? 'land' : null),
  drop: () => 'land',
  bite: () => 'bite',
  splash: () => 'pipe',
  hurt: () => 'hurt',
  respawn: () => 'select',
  dead: () => 'dead',
  pickup: (e) => (e.kind === 'fruit' || e.kind === 'star' ? 'fruit' : 'pickup'),
  dig: (e) => (e.primary ? 'dig' : null),
  chop: () => 'tree',
  'tree-fall': () => 'tree',
  'tree-land': () => 'shock',
  'pipe-burst': () => 'pipe',
  'hive-break': () => 'hive',
  sting: () => 'hive',
  'animal-wake': () => 'animal',
  'animal-done': () => 'land',
  'rock-crack': () => 'rock',
  'rock-break': () => 'rock',
  switch: () => 'switch',
  'door-open': () => 'switch',
  spawn: () => 'pickup',
  'princess-free': () => 'switch',
  'goal-open': () => 'pickup',
  clear: () => 'clear',
  'enemy-hit': () => 'enemy-down',
  'enemy-down': () => 'enemy-down',
  hop: () => 'jump',
  spit: () => 'land',
  'shot-hit': () => 'rock',
  'boss-awake': () => 'shock',
  'boss-state': (e) => (e.state === 'windup' ? 'select' : null),
  'boss-attack': () => 'shock',
  'boss-shoot': () => 'land',
  'boss-slam': () => 'shock',
  shock: () => 'shock',
  'boss-crash': () => 'rock',
  'boss-hit': () => 'boss-hit',
  'boss-phase': () => 'boss-hit',
  'boss-tired': () => 'boss-hit',
  'boss-down': () => 'boss-down',
  minion: () => 'select',
  'gate-up': () => 'shock',
  'gate-down': () => 'switch'
}

export const CUE_MAP: Record<SoundCue, Sfx | null> = {
  footstep: null,
  'menu-move': null,
  'menu-select': 'select',
  'menu-back': 'select',
  pause: 'select',
  resume: 'select',
  mute: null,
  'text-blip': null,
  'page-turn': 'select',
  unlock: 'pickup',
  'tally-tick': null,
  'tally-done': 'pickup',
  'new-record': 'clear',
  'title-start': 'select',
  'stage-start': null,
  ready: null,
  'iris-out': null,
  'iris-in': null,
  'boss-roar': 'shock',
  'boss-boom': 'rock',
  'mom-yell': 'shock',
  'mom-tired': null,
  'low-hp': null,
  confetti: null
}

/** The sound for an event (null when silent). */
export const soundFor = (event: SimEvent): Sfx | null =>
  (SOUND_MAP[event.type] as (event: SimEvent) => Sfx | null)(event)

/** Plays events and cues, with a short per-sound cooldown so a burst of events does not stack one sound. */
export class SoundBoard implements CueSink {
  private last = new Map<Sfx, number>()

  constructor(
    private sink: SoundSink,
    private now: () => number = () => performance.now() / 1000,
    private cooldown = 0.045
  ) {}

  private play(name: Sfx | null) {
    if (!name) return
    const t = this.now()
    if (t - (this.last.get(name) ?? -1) < this.cooldown) return
    this.last.set(name, t)
    this.sink.play(name)
  }

  event(event: SimEvent) {
    this.play(soundFor(event))
  }

  cue(cue: SoundCue) {
    this.play(CUE_MAP[cue])
  }
}
