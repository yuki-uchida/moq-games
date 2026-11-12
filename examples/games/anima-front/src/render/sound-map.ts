/**
 * SimEvent → sound tables (DESIGN §16). Pure data so coverage is unit-tested: every ShotKind fires a sound,
 * every melee antique swings one, every FoeAttack winds up and attacks with one, every Surface/HitSurface
 * answers an impact.
 */
import type { LoopName, SfxName } from '../audio/api'
import { FOES, type FoeAttack, type FoeKind } from '../data/enemies'
import type { ItemId } from '../data/items'
import type { HitSurface, PropKind, ShotKind, SimEventType, Surface } from '../sim/types'

export const FIRE_SFX: Record<ShotKind, SfxName> = {
  claw: 'claw',
  orca: 'orca',
  narwhal: 'narwhal',
  mammoth: 'mammoth',
  mantis: 'mantis',
  bee: 'bee',
  wood: 'wood',
  humming: 'humming',
  puffer: 'puffer',
  owl: 'owl',
  swallow: 'swallow',
  pillbug: 'pillbug',
  eel: 'eelStart',
  hippo: 'hippo',
  turtle: 'shellHit',
  armadillo: 'shieldUp',
  hedgehog: 'quill',
  jelly: 'jellyPop',
  fang: 'claw',
  hawk: 'bee',
  rhino: 'shieldUp',
  sloth: 'swap',
  koala: 'heal',
  cheetah: 'dash',
  camel: 'heal',
  frog: 'frogPlace',
  gecko: 'geckoFire',
  momonga: 'glideOpen',
  leaf: 'leafOn',
  bat: 'sonar',
  octopus: 'inkThrow',
  pigeon: 'pigeon',
  hermit: 'hermitDeploy',
  honeyant: 'honeyPlant',
  acid: 'hariganeSpit',
  laser: 'mitsumeLaser',
  plasma: 'ashinagaMortar',
  missile: 'bossMissile',
  acidRain: 'bossAcidRain'
}

/** Melee swing sound per antique (swing events). */
export const SWING_SFX: Partial<Record<ItemId, SfxName>> = {
  claw: 'claw',
  orca: 'orca',
  narwhal: 'narwhal',
  mammoth: 'mammoth',
  mantis: 'mantis'
}

export const IMPACT_SFX: Record<Surface, SfxName> = {
  concrete: 'impactConcrete',
  metal: 'impactMetal',
  wood: 'impactWood',
  crystal: 'impactCrystal',
  ground: 'impactGround',
  foliage: 'impactGround',
  glass: 'impactCrystal',
  virtual: 'impactMetal'
}

export const HIT_SFX: Record<HitSurface, SfxName> = {
  fur: 'hitFur',
  chitin: 'hitChitin',
  metal: 'hitMetal',
  shield: 'shieldHit',
  guard: 'guardHit',
  shell: 'shellHit',
  prop: 'hermitHit'
}

export const WINDUP_SFX: Record<FoeAttack, SfxName> = {
  bite: 'tsubuteChitter',
  leap: 'tsubuteChitter',
  acid: 'hariganeSpit',
  charge: 'oagosRoar',
  dive: 'kagerouDive',
  laser: 'mitsumeLaser',
  mortar: 'ashinagaStep',
  explode: 'korogashiBeep',
  shieldDome: 'tategamiDome',
  slam: 'bossRoar',
  acidRain: 'bossRoar',
  summon: 'bossRoar',
  missile: 'bossLaser',
  sweep: 'bossLaser',
  stomp: 'bossStomp'
}

export const ATTACK_SFX: Record<FoeAttack, SfxName> = {
  bite: 'tsubuteBite',
  leap: 'tsubuteLeap',
  acid: 'hariganeSpit',
  charge: 'oagosCharge',
  dive: 'kagerouDive',
  laser: 'mitsumeLaser',
  mortar: 'ashinagaMortar',
  explode: 'explosion',
  shieldDome: 'tategamiDome',
  slam: 'bossSlam',
  acidRain: 'bossAcidRain',
  summon: 'bossSummon',
  missile: 'bossMissile',
  sweep: 'bossLaser',
  stomp: 'bossStomp'
}

export function spawnSfx(kind: FoeKind): SfxName {
  const f = FOES[kind].faction
  return f === 'machine' ? 'foeSpawnDrop' : f === 'animal' ? 'foeSpawnWarp' : 'foeSpawnBurrow'
}

export function dieSfx(kind: FoeKind): SfxName {
  if (FOES[kind].boss) return 'bossDown'
  const f = FOES[kind].faction
  return f === 'machine'
    ? kind === 'korogashi'
      ? 'explosion'
      : 'machineDie'
    : f === 'animal'
      ? 'armorBreak'
      : 'creatureDie'
}

export function blastSfx(radius: number): SfxName {
  return radius >= 5 ? 'explosionBig' : radius >= 3 ? 'explosion' : 'explosionSmall'
}

export const PROP_BREAK_SFX: Record<PropKind, SfxName> = {
  frog: 'impactWood',
  hermit: 'hermitBreak',
  honey: 'jellyPop',
  decoy: 'jellyPop',
  leafDecoy: 'leafOff',
  ink: 'inkBurst',
  lighthouse: 'objectiveDestroyed',
  zone: 'objectiveCaptured',
  cart: 'objectiveDestroyed',
  node: 'objectiveDestroyed',
  target: 'impactWood',
  pad: 'impactWood',
  base: 'objectiveDestroyed',
  tutorial: 'uiSelect',
  puddle: 'acidSplash'
}

/**
 * The primary sound of each event type (some depend on fields; see SoundDirector). `null` = silent on purpose
 * (the UI or music answers it).
 */
export const EVENT_SFX: Record<SimEventType, SfxName | 'byItem' | 'bySurface' | 'byKind' | null> = {
  phase: 'go',
  countdown: 'countdown',
  fire: 'byItem',
  swing: 'byItem',
  hit: 'bySurface',
  impact: 'bySurface',
  blast: 'byKind',
  empty: 'empty',
  swap: 'swap',
  jump: 'jump',
  land: 'land',
  dash: 'dash',
  launch: 'frogLaunch',
  hook: 'geckoAttach',
  glide: 'glideOpen',
  cloak: 'leafOn',
  deploy: 'byItem',
  propHit: 'hermitHit',
  propBreak: 'byKind',
  passives: 'passivesOn',
  critical: 'critical',
  armorBreak: 'armorBreak',
  down: 'down',
  reviveStart: 'reviveTick',
  revive: 'revive',
  warp: 'warp',
  respawn: 'respawn',
  ko: 'koFeed',
  shard: 'shard',
  heal: 'heal',
  reveal: 'sonar',
  foeSpawn: 'byKind',
  foeWindup: 'byKind',
  foeAttack: 'byKind',
  foeDie: 'byKind',
  bossPhase: 'bossRoar',
  bossPart: 'bossPart',
  wave: 'waveStart',
  waveClear: 'waveClear',
  objective: 'byKind',
  radio: 'radio',
  lastSpurt: 'lastSpurt',
  suddenDeath: 'lastSpurt',
  tutorial: 'uiSelect'
}

export const OBJECTIVE_SFX: Record<string, SfxName> = {
  progress: 'objectiveProgress',
  captured: 'objectiveCaptured',
  contested: 'objectiveAlarm',
  damaged: 'objectiveAlarm',
  destroyed: 'objectiveDestroyed',
  arrived: 'objectiveCaptured',
  lost: 'objectiveAlarm',
  complete: 'objectiveCaptured'
}

/** Ambience loop per theme comes from ThemeDef.ambience; these are the actor loops. */
export const ACTOR_LOOPS: Record<
  'eel' | 'charge' | 'glide' | 'hook' | 'cloak' | 'shield' | 'korogashi' | 'kagerou' | 'lowAnima',
  LoopName
> = {
  eel: 'eel',
  charge: 'charge',
  glide: 'glide',
  hook: 'hook',
  cloak: 'cloak',
  shield: 'shield',
  korogashi: 'korogashi',
  kagerou: 'kagerou',
  lowAnima: 'lowAnima'
}
