/**
 * The audio contract. The game only talks to audio through `GameAudio`; implementations synthesize everything
 * with Web Audio (no files) and must never throw (every call is optional decoration).
 */

/** Background music. Jingles (`clear`, `gameover`) play once and then fall silent. */
export const THEMES = [
  'title', // 「星のハムハム」: the main theme, bright and bouncy
  'select', // stage select: a light, strolling variation of the main theme
  'story', // story panels: gentle, a music box and soft strings
  'meadow', // stages 1–2: sunny, running
  'night', // stage 3: a tense night chase
  'cave', // stage 4: sneaking into the hideout
  'forest', // stages 5–6: deep woods, mysterious but warm
  'fortress', // stages 7–8: stone halls, marching
  'castle', // stage 9: the dark castle, baroque and ominous
  'star', // stage 10: the way to the final battle, cosmic and resolute
  'boss', // every boss fight but the last
  'finalBoss', // 黒ハム王; layer 2 is his second phase
  'clear', // stage clear jingle
  'gameover', // game over jingle
  'ending' // ending and credits
] as const
export type ThemeName = (typeof THEMES)[number]

/** One-shot sound effects. */
export const SFX = [
  // The hero.
  'jump',
  'land',
  'landHard',
  'step',
  'skid',
  'bite', // the snap of a bite in the air
  'biteHit', // a bite that connects: crunch
  'hurt',
  'die',
  'splashIn',
  'splashOut',
  'swim',
  'drop', // dropping through a platform
  'respawn',
  'heal', // fruit
  'starGet',
  'pickup', // nest material
  'lowHp', // heartbeat tick at two hearts or fewer
  // Gimmicks.
  'dig',
  'crumble', // dirt above or below a dug tile giving way
  'chop',
  'treeCreak',
  'treeCrash',
  'pipeBurst',
  'hiveBreak',
  'sting',
  'animalWake',
  'animalCharge',
  'animalPoof',
  'rockCrack',
  'rockBreak',
  'switchOn',
  'doorOpen',
  'spawnItem',
  'cageBreak',
  'goalOpen',
  'gateUp',
  'gateDown',
  // Enemies.
  'enemyHit',
  'enemyDown',
  'hop',
  'spit',
  'shotHit',
  // Bosses.
  'bossRoar',
  'bossWindup',
  'bossCharge',
  'bossDive',
  'bossLeap',
  'bossSlam',
  'bossCast',
  'shockwave',
  'bossCrash',
  'bossHit',
  'bossHitWeak', // a bonus hit on a stunned or recovering boss
  'bossPhase',
  'bossDown',
  'bossBoom', // one explosion of the defeat chain
  'minion',
  'momYell',
  'momTired',
  // Interface and staging.
  'menuMove',
  'menuSelect',
  'menuBack',
  'pauseIn',
  'pauseOut',
  'textBlip',
  'pageTurn',
  'stageStart',
  'ready',
  'unlock',
  'tallyTick',
  'tallyDone',
  'newRecord',
  'irisOut',
  'irisIn',
  'titleStart',
  'confetti'
] as const
export type SfxName = (typeof SFX)[number]

/** Sustained sounds bound to a caller-chosen id (one voice per id). */
export const LOOPS = ['water', 'bees', 'wind'] as const
export type LoopName = (typeof LOOPS)[number]

export interface SfxOptions {
  /** Stereo position -1 (left) … 1 (right); callers derive it from the screen position. */
  pan?: number
  /** Gain multiplier 0…1 (e.g. distance attenuation). */
  volume?: number
  /** Playback-rate style pitch multiplier (1 = as designed); implementations add their own small variation. */
  pitch?: number
}

export interface GameAudio {
  /**
   * Builds the audio engine in small slices ahead of the first gesture (the context starts suspended) and starts
   * rendering the sound effects. Optional to call; `unlock()` finishes whatever is missing.
   */
  prepare(): void
  /** Resumes the AudioContext (creating it if `prepare()` has not); call from a user gesture (click/keydown). */
  unlock(): void
  /**
   * A stage is being played (true) or no longer is (false). While it is, the audio keeps its background work
   * (rendering sound effects ahead of time) away from the frames.
   */
  playing(on: boolean): void
  /**
   * What music should play. Repeating the same theme is a no-op; a change crossfades. `layer` 0..2 raises the
   * arrangement's intensity (e.g. 1 when the boss gate closes) without restarting the song.
   */
  setMusic(theme: ThemeName | null, layer?: number): void
  sfx(name: SfxName, options?: SfxOptions): void
  /** Starts, updates (pitch 0..1 = progress) or with `null` stops the sustained sound for `id`. */
  loop(id: string, name: LoopName | null, options?: SfxOptions & { progress?: number }): void
  setVolume(kind: 'master' | 'music' | 'sfx', value: number): void
  setMuted(muted: boolean): void
  readonly muted: boolean
  /** Lowers and muffles the music (pause menu, under water) without stopping it; 0 = normal, 1 = strongest. */
  setDuck(amount: number): void
  dispose(): void
}
