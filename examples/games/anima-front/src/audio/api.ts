/**
 * The audio contract (DESIGN §16). The game only talks to audio through `GameAudio`; the implementation
 * synthesizes everything with Web Audio (no files) and never throws (every call is optional decoration).
 */

/** Background music. `win` / `lose` are jingles that play once and then fall silent. */
export const THEMES = [
  'title', // 「アニマフロント」 main theme: hopeful brass and strings over a marching pulse
  'menu', // base / loadout / lobby: calm, warm, a little melancholy
  'briefing', // mission briefing: tense pads, ticking percussion
  'oldtown', // mission 1: urban defence, driving and heroic
  'harbor', // mission 2: machines, metallic and syncopated
  'night', // mission 3: night raid, sneaking and dark
  'blight', // mission 4: the crystal blight, eerie and pulsing
  'boss', // ゴウテツ and big fights
  'finalBoss', // クイツクシ; layer 1 = the core exposed / last phase
  'pvp', // 三つ巴演習; layer 1 = ラストスパート
  'training', // 訓練場: light and practical
  'win', // victory jingle
  'lose', // defeat jingle
  'credits' // staff roll
] as const
export type ThemeName = (typeof THEMES)[number]

/** One-shot sound effects. */
export const SFX = [
  // antiques: melee
  'claw',
  'orca',
  'guardUp',
  'guardHit',
  'narwhal',
  'mammothWindup',
  'mammoth',
  'mantis',
  // antiques: ranged
  'bee',
  'wood',
  'humming',
  'puffer',
  'owlZoom',
  'owl',
  'swallowLock',
  'swallow',
  'pillbug',
  'pillbugBounce',
  'eelStart',
  'hippoCharge',
  'hippo',
  // antiques: armour and gadgets
  'shieldUp',
  'shieldHit',
  'shellHit',
  'quill',
  'jellyPop',
  'frogPlace',
  'frogLaunch',
  'geckoFire',
  'geckoAttach',
  'glideOpen',
  'leafOn',
  'leafOff',
  'sonar',
  'inkThrow',
  'inkBurst',
  'pigeon',
  'hermitDeploy',
  'hermitHit',
  'hermitBreak',
  'honeyPlant',
  'heal',
  // impacts
  'hitFur',
  'hitChitin',
  'hitMetal',
  'hitHead',
  'hitWeak',
  'impactConcrete',
  'impactMetal',
  'impactWood',
  'impactCrystal',
  'impactGround',
  'explosionSmall',
  'explosion',
  'explosionBig',
  // the animal
  'step',
  'jump',
  'airJump',
  'land',
  'landHard',
  'dash',
  'slide',
  'swap',
  'empty',
  'critical',
  'passivesOff',
  'passivesOn',
  'hurt',
  'armorBreak',
  'down',
  'reviveTick',
  'revive',
  'warp',
  'respawn',
  'shard',
  'hitmarker',
  'headmarker',
  'komarker',
  // foes
  'foeSpawnBurrow',
  'foeSpawnDrop',
  'foeSpawnWarp',
  'tsubuteChitter',
  'tsubuteBite',
  'tsubuteLeap',
  'hariganeSpit',
  'acidSplash',
  'oagosRoar',
  'oagosCharge',
  'kagerouDive',
  'creatureDie',
  'mitsumeLaser',
  'ashinagaStep',
  'ashinagaMortar',
  'korogashiBeep',
  'tategamiDome',
  'machineDie',
  'bossRoar',
  'bossSlam',
  'bossAcidRain',
  'bossSummon',
  'bossCoreOpen',
  'bossMissile',
  'bossLaser',
  'bossStomp',
  'bossPart',
  'bossDown',
  // match and objectives
  'countdown',
  'go',
  'waveStart',
  'waveClear',
  'objectiveProgress',
  'objectiveCaptured',
  'objectiveAlarm',
  'objectiveDestroyed',
  'cartMove',
  'koFeed',
  'scoreUp',
  'lastSpurt',
  'victory',
  'defeat',
  'radio',
  // interface
  'uiMove',
  'uiSelect',
  'uiBack',
  'uiError',
  'uiEquip',
  'uiUnequip',
  'uiTab',
  'uiReady',
  'uiStart',
  'typeBlip',
  'titleHit'
] as const
export type SfxName = (typeof SFX)[number]

/** Sustained sounds bound to a caller-chosen id (one voice per id). */
export const LOOPS = [
  'eel', // the electric beam while held
  'charge', // hippo charge / owl zoom hum (progress raises the pitch)
  'glide', // wind under a glider
  'hook', // the gecko line reeling in
  'cloak', // faint shimmer while camouflaged
  'shield', // armadillo shield hum
  'korogashi', // a rolling bomb
  'kagerou', // wings of a flyer
  'lowAnima', // heartbeat-like pulse at critical anima
  'ambCity', // ruined city ambience: wind, birds, distant creaks
  'ambHarbor', // waves and gulls
  'ambBlight', // crystal hum and wet breathing
  'ambVirtual' // the arena's soft electronic hum
] as const
export type LoopName = (typeof LOOPS)[number]

export interface SfxOptions {
  /** Stereo position −1 (left) … 1 (right). */
  pan?: number
  /** Gain multiplier 0…1 (distance attenuation). */
  volume?: number
  /** Pitch multiplier (1 = as designed); implementations add their own small variation. */
  pitch?: number
}

export interface GameAudio {
  /** Creates/resumes the AudioContext; call from a user gesture. */
  unlock(): void
  /** Repeating the same theme is a no-op; a change crossfades. `layer` raises intensity without a restart. */
  setMusic(theme: ThemeName | null, layer?: number): void
  sfx(name: SfxName, options?: SfxOptions): void
  /** Starts, updates (`progress` 0..1) or with `null` stops the sustained sound bound to `id`. */
  loop(id: string, name: LoopName | null, options?: SfxOptions & { progress?: number }): void
  setVolume(kind: 'master' | 'music' | 'sfx', value: number): void
  setMuted(muted: boolean): void
  readonly muted: boolean
  /** Lowers and muffles the music (pause, results, zoom) without stopping it; 0..1. */
  setDuck(amount: number): void
  dispose(): void
}
