/** Numbers from DESIGN.md in one place. */
import { TILE, type EnemyKind, type Job, type Species } from '../vocab'
import type { TechKind } from './types'

export const DT = 1 / 60

export interface JobStats {
  hp: number
  cooldown: number
  dmg: number
}
export const JOB_STATS: Record<Job, JobStats> = {
  sword: { hp: 10, cooldown: 0.3, dmg: 2 },
  mage: { hp: 8, cooldown: 0.45, dmg: 2 },
  archer: { hp: 8, cooldown: 0.34, dmg: 2 },
  cleric: { hp: 9, cooldown: 0.38, dmg: 1 }
}

export const ATTACK = {
  sword: { r: 58, spread: Math.PI / 3 },
  cleric: { r: 46, spread: (50 * Math.PI) / 180 },
  bolt: { speed: 380, range: 7 * TILE, burst: 30 },
  arrow: { speed: 680, range: 9 * TILE, pierce: 1 }
}
export const SKILL = {
  spin: { r: 84, dmg: 4, kb: 300 },
  orb: { speed: 260, range: 8 * TILE, burst: 92, dmg: 5 },
  triple: { spread: (18 * Math.PI) / 180, dmg: 3, pierce: 2 },
  holy: { r: 100, heal: 3, dmg: 3 }
}

/** Attack (4 frames @ 18 fps) and skill (4 @ 14) animation lengths. */
export const ATTACK_TIME = 4 / 18
export const SKILL_TIME = 4 / 14
export const HURT_TIME = 2 / 12

export const CHARGE = { start: 0.2, full: 0.9, lockout: 2 }
export const CHARGE_SPEED = 0.55
export const CARRY_SPEED = 0.6

export const FORM = { link: 104, radius: 150 }
export const formAttackMul = (n: number) => (n >= 2 ? 1 + 0.3 * (n - 1) : 1)
export const formDefenseMul = (n: number) => (n >= 2 ? 1 - 0.1 * (n - 1) : 1)
export const FORM_NAMES: Record<number, string> = { 2: 'ペア陣', 3: '三角陣', 4: '四方陣' }

export const HERO_HIT = { inv: 0.8, kb: 160 }
export const DOWN = { reviveDist: 40, reviveTime: 1.5, reviveHp: 4, selfTime: 12, selfHp: 2, wipeTime: 2 }
export const FALL = { time: 0.6, dmg: 2 }

export const SPECIES_TECH: Record<Species, TechKind> = {
  slime: 'jumbo',
  rat: 'stampede',
  crow: 'tornado',
  wolf: 'pack'
}
export const TECH_NAMES: Record<TechKind, string> = {
  jumbo: 'ジャンボ・プレス',
  stampede: 'チューチュー大行進',
  tornado: '黒羽の大旋風',
  pack: '月下群狼陣'
}
export const JUMBO = {
  form: 0.25,
  jump: 0.6,
  land: 0.45,
  range: 4 * TILE,
  height: 120,
  radius: { 2: 90, 3: 120, 4: 150 } as Record<number, number>,
  dmg: { 2: 6, 3: 9, 4: 13 } as Record<number, number>,
  stun: 1
}

/** チューチュー大行進 (DESIGN §7.2). */
/** 遠吠え (DESIGN §7): stun radius/time, moonstone light radius. */
export const HOWL = { stunR: 120, stun: 0.8, lightR: 160 }

/** 月下群狼陣 (DESIGN §7.4). */
export const PACK = {
  howl: 0.6,
  lunge: 0.18,
  wave: 0.3,
  end: 0.25,
  range: 5 * TILE,
  stun: 1.2,
  lungeDmg: { 2: 5, 3: 6, 4: 8 } as Record<number, number>,
  waveDmg: { 2: 4, 3: 6, 4: 8 } as Record<number, number>,
  waveR: 170,
  waveSpread: (60 * Math.PI) / 180
}

/** 黒羽の大旋風 (DESIGN §7.3). */
export const TORNADO = {
  rise: 0.3,
  end: 0.3,
  range: 5 * TILE,
  tick: 0.2,
  dmg: 1,
  pull: 220,
  spin: { 2: 1.6, 3: 2.0, 4: 2.6 } as Record<number, number>,
  radius: { 2: 80, 3: 100, 4: 130 } as Record<number, number>
}

export const STAMPEDE = {
  form: 0.25,
  end: 0.3,
  spacing: 36,
  len: { 2: 6 * TILE, 3: 8 * TILE, 4: 10 * TILE } as Record<number, number>,
  dur: { 2: 0.7, 3: 0.9, 4: 1.1 } as Record<number, number>,
  width: { 2: 48, 3: 56, 4: 64 } as Record<number, number>,
  dmg: { 2: 4, 3: 6, 4: 9 } as Record<number, number>
}

export interface EnemyStats {
  hp: number
  r: number
  speed: number
  /** Archetype (DESIGN §10). */
  type:
    | 'melee'
    | 'ranged'
    | 'caster'
    | 'shield'
    | 'dasher'
    | 'thrower'
    | 'trapper'
    | 'spear'
    | 'summoner'
    | 'sniper'
    | 'gust'
    | 'healer'
    | 'hunter'
    | 'paladin'
    | 'icewitch'
    | 'heavy'
}
export const ENEMY_STATS: Partial<Record<EnemyKind, EnemyStats>> = {
  rookie: { hp: 4, r: 14, speed: 100, type: 'melee' },
  bowman: { hp: 3, r: 13, speed: 70, type: 'ranged' },
  apprentice: { hp: 3, r: 13, speed: 60, type: 'caster' },
  shieldman: { hp: 6, r: 16, speed: 65, type: 'shield' },
  thief: { hp: 4, r: 13, speed: 120, type: 'dasher' },
  alchemist: { hp: 4, r: 13, speed: 60, type: 'thrower' },
  ratcatcher: { hp: 5, r: 14, speed: 70, type: 'trapper' },
  spearguard: { hp: 6, r: 16, speed: 60, type: 'spear' },
  falconer: { hp: 4, r: 13, speed: 65, type: 'summoner' },
  crossbow: { hp: 4, r: 13, speed: 55, type: 'sniper' },
  windmage: { hp: 4, r: 13, speed: 60, type: 'gust' },
  bellmonk: { hp: 5, r: 14, speed: 55, type: 'healer' },
  hunter: { hp: 5, r: 14, speed: 70, type: 'hunter' },
  paladin: { hp: 8, r: 16, speed: 60, type: 'paladin' },
  icewitch: { hp: 5, r: 13, speed: 60, type: 'icewitch' },
  heavy: { hp: 9, r: 18, speed: 42, type: 'heavy' }
}
export const HEAVY = { windup: 1.0, r: 92, spread: (50 * Math.PI) / 180, dmg: 3, kb: 320, recover: 1.2 }
export const ICESPIKE = { windup: 1.0, r: 56, dmg: 2 }
export const SNIPER = { aim: 0.8, speed: 720, dmg: 2, pierce: 2, len: 11 * TILE }
export const GUST = { windup: 0.7, speed: 300, range: 6 * TILE, dmg: 1, push: 1300, blown: 0.35, width: 48 }
export const MONK = { healEvery: 3, heal: 2, ringEvery: 7, ward: 4, wardR: 160 }
/** Enemies with a frontal guard (120°): only flanks and techniques get through. */
export const GUARDED = new Set<string>(['shieldman', 'spearguard', 'paladin', 'heavy'])
export const THIEF = { windup: 0.35, dash: 0.3, speed: 430, flee: 3, range: 170 }
export const BOMB = { windup: 0.4, flight: 0.8, r: 56, dmg: 2, height: 70 }
export const SNARE = { windup: 0.5, hold: 1.5, life: 20, perCatcher: 3 }
export const SPEAR = { windup: 0.55, reach: 80, width: 26, dmg: 2, recover: 0.8 }
export const DEFAULT_ENEMY: EnemyStats = { hp: 4, r: 14, speed: 70, type: 'melee' }

/** Enemy animation timings matching the art (hurt 2 @ 12 fps, death 5 @ 10 fps). */
export const ENEMY_HURT = 2 / 12
export const ENEMY_DEATH = 5 / 10
export const NOTICE_RANGE = 5 * TILE

export const GARUD = {
  hp: 260,
  r: 40,
  speed: 62,
  /** Frontal guard half-angle (140° total): blocks everything but techniques. */
  guard: (70 * Math.PI) / 180,
  /** Side hits (70°–120° off the facing) do half damage; only back hits and techniques do full damage. */
  side: (120 * Math.PI) / 180,
  sideMul: 0.5,
  chargeWindup: 0.8,
  chargeLen: 6 * TILE,
  chargeSpeed: 520,
  /** Phase 2 (≤ 50% HP): faster shield charges with a shorter (still telegraphed) windup, a double sweep and more slams. */
  p2ChargeWindup: 0.65,
  p2ChargeSpeed: 650,
  p2SecondSweepWindup: 0.45,
  slamChance: 0.3,
  p2SlamChance: 0.5,
  chargeDmg: 2,
  chargeKb: 420,
  wallBroken: 2,
  sweepWindup: 0.6,
  sweepR: 110,
  sweepSpread: (75 * Math.PI) / 180,
  sweepDmg: 2,
  slamTime: 6 / 10,
  slamHit: 3 / 10,
  slamR: 150,
  slamDmg: 2,
  callTime: 4 / 6,
  breakTime: 4,
  brokenMul: 1.25,
  /** Plate armour: every normal hit × 0.25 (techniques do full damage). */
  armorMul: 0.25,
  /** 鉄壁 after a technique guard break: techniques do × 0.25 and cannot break the guard. */
  steelTime: 14,
  steelTechMul: 0.25,
  deathTime: 8 / 8
}
