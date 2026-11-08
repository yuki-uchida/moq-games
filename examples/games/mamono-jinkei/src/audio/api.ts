/**
 * The audio contract. The game only talks to audio through `GameAudio`; implementations synthesize everything
 * with Web Audio (no files) and must never throw (every call is optional decoration).
 */

/** Background music. Jingles (`clear`, `gameover`) play once and then fall silent. */
export const THEMES = [
  'title',
  'lobby',
  'meadow',
  'sewer',
  'tower',
  'forest',
  'boss',
  'finalBoss',
  'clear',
  'gameover',
  'ending'
] as const
export type ThemeName = (typeof THEMES)[number]

/** One-shot sound effects. */
export const SFX = [
  // Hero attacks and skills.
  'swing',
  'magicCast',
  'magicHit',
  'arrowShot',
  'arrowHit',
  'staffBonk',
  'spinSlash',
  'orbCast',
  'orbBurst',
  'tripleShot',
  'holyRing',
  'heal',
  'chargeStart',
  'chargeFull',
  'chargeCancel',
  // Hits and defeats.
  'hit',
  'hitHeavy',
  'crit',
  'guardClang',
  'enemyDie',
  'enemyAlert',
  'enemyWindup',
  'enemyShot',
  'enemyCast',
  'fireballHit',
  'heroHurt',
  'heroDown',
  'revive',
  'stun',
  // Formation and co-op techniques.
  'formLink',
  'formBreak',
  'coopStart',
  'coopFinish',
  // Species actions and techniques.
  'slimeJump',
  'slimeLand',
  'jumboForm',
  'jumboSlam',
  'ratDash',
  'ratSqueak',
  'stampede',
  'gnaw',
  'crowFlap',
  'crowCaw',
  'tornado',
  'wolfHowl',
  'packHowl',
  'lunge',
  'crescent',
  // World and puzzles.
  'step',
  'pushStrain',
  'blockSlide',
  'blockSink',
  'lift',
  'putDown',
  'throw',
  'potBreak',
  'grassCut',
  'plateOn',
  'plateOff',
  'crystalOn',
  'crystalOff',
  'lever',
  'gateOpen',
  'gateClose',
  'bell',
  'bossDoor',
  'chestOpen',
  'gem',
  'gemBig',
  'heart',
  'key',
  'unlock',
  'bounce',
  'splash',
  'fall',
  'rockBreak',
  'secret',
  'checkpoint',
  'orbGet',
  // Bosses.
  'bossRoar',
  'bossCharge',
  'bossSlam',
  'guardBreak',
  'bossDie',
  // Interface and multiplayer.
  'menuMove',
  'menuSelect',
  'menuBack',
  'dialogBlip',
  'signalTick',
  'signalGo',
  'join',
  'leave'
] as const
export type SfxName = (typeof SFX)[number]

/** Sustained sounds bound to a caller-chosen id (one voice per id). */
export const LOOPS = ['charge', 'tornado', 'wind', 'water'] as const
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
  /** Creates/resumes the AudioContext; call from a user gesture (click/keydown). */
  unlock(): void
  /**
   * What music should play. Repeating the same theme is a no-op; a change crossfades. `layer` 0..2 raises the
   * arrangement's intensity (e.g. 1 in an arena fight) without restarting the song.
   */
  setMusic(theme: ThemeName | null, layer?: number): void
  sfx(name: SfxName, options?: SfxOptions): void
  /** Starts, updates (pitch 0..1 = progress) or with `null` stops the sustained sound for `id`. */
  loop(id: string, name: LoopName | null, options?: SfxOptions & { progress?: number }): void
  setVolume(kind: 'master' | 'music' | 'sfx', value: number): void
  setMuted(muted: boolean): void
  readonly muted: boolean
  /** Lowers the music (pause menu, dialogue) without stopping it; 0 = normal, 1 = strongly muffled. */
  setDuck(amount: number): void
  dispose(): void
}
