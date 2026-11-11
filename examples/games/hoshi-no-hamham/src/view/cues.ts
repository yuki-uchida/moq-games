/**
 * Sound cues: the moments that have a sound but are not simulation events (staging and the interface). Staging
 * and the screens only ever name a cue; what it sounds like is decided in `sound-map.ts`.
 */
export const SOUND_CUES = [
  'footstep',
  // Interface.
  'menu-move',
  'menu-select',
  'menu-back',
  'pause',
  'resume',
  'mute',
  'text-blip',
  'page-turn',
  'unlock',
  'tally-tick',
  'tally-done',
  'new-record',
  'title-start',
  // Staging.
  'stage-start',
  'ready',
  'iris-out',
  'iris-in',
  'boss-roar',
  'boss-boom',
  'mom-yell',
  'mom-tired',
  'low-hp',
  'confetti'
] as const
export type SoundCue = (typeof SOUND_CUES)[number]

/** Anything that can play a cue: the sound board in the game, a recorder or a no-op in tests. */
export interface CueSink {
  cue(cue: SoundCue): void
}

export const SILENT_CUES: CueSink = { cue() {} }
