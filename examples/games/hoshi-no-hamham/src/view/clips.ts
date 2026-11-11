/**
 * Pure clip selection: which animation of a sheet an actor shows and how far into it, from a snapshot of its
 * simulation state plus the few timers the view keeps. No DOM and no art building, so it is unit-tested against
 * the contract (`tests/view-clips.test.ts`). Clip timing comes from the contract specs.
 */
import { ENEMY_SPEC, HERO_SPEC, MOM_SPEC, bossSpec, type AnimSpec, type BossArt } from '../art/contract'
import { RUN_SPEED, type BossState } from '../game/sim'
import type { BossKind, EnemyKind } from '../game/types'

/** A chosen clip and the time into it (seconds), or a fixed frame. */
export interface ClipChoice {
  name: string
  t: number
  /** Overrides the time-based frame (air clips pick their frame by vertical speed). */
  frame?: number
}

/** Seconds of one pass of a contract clip. */
export const specDuration = (spec: AnimSpec) => spec.frames / spec.fps
/** Seconds from the clip start to its `hit` frame (a hair past the boundary, so rounding never lands a frame early). */
export const hitTime = (spec: AnimSpec) => ((spec.hit ?? 0) + 1e-4) / spec.fps

// ------------------------------------------------------------------------------------------------- hero

/** A landing faster than this (px/s) plays `land`. */
export const HARD_LANDING = 520
/** Standing still this long plays `wait`. */
export const WAIT_AFTER = 5
/** Reversing faster than this (px/s) skids. */
export const SKID_SPEED = 110
/** Below this horizontal speed (px/s) the hero stands. */
export const RUN_THRESHOLD = 20

export interface HeroSnapshot {
  /** The stage is cleared: the hero cheers. */
  cheering: boolean
  /** Time since the cheer began. */
  cheerAge: number
  /** Seconds since the current bite began, or null when not biting. */
  biteAge: number | null
  /** The hurt reaction is showing (first moments of invulnerability). */
  hurt: boolean
  hurtAge: number
  inWater: boolean
  waterTime: number
  onGround: boolean
  vx: number
  vy: number
  facing: 1 | -1
  /** Seconds in the air (since leaving the ground). */
  airTime: number
  /** Seconds since touching down, and whether that landing was hard. */
  landAge: number
  hardLanding: boolean
  /** Distance covered on the ground, in px (advances the run cycle). */
  distance: number
  /** Seconds standing still, and the time since the last blink began. */
  idleTime: number
  blinkAge: number
  /** Seconds since the skid began, or null. */
  skidAge: number | null
}

export const isSkidding = (s: Pick<HeroSnapshot, 'onGround' | 'vx' | 'facing'>) =>
  s.onGround && s.vx * s.facing < 0 && Math.abs(s.vx) > SKID_SPEED

/** The hero's clip, in priority order: cheer, bite, hurt, swim, jump/fall, land, skid, run, wait, blink, idle. */
export function heroClip(s: HeroSnapshot): ClipChoice {
  if (s.cheering) return { name: 'cheer', t: s.cheerAge }
  if (s.biteAge !== null) return { name: 'bite', t: s.biteAge + hitTime(HERO_SPEC.bite) }
  if (s.hurt) return { name: 'hurt', t: s.hurtAge }
  if (s.inWater) return { name: 'swim', t: s.waterTime }
  if (!s.onGround) return s.vy < 0 ? { name: 'jump', t: s.airTime } : { name: 'fall', t: s.airTime }
  if (s.hardLanding && s.landAge < specDuration(HERO_SPEC.land)) return { name: 'land', t: s.landAge }
  if (s.skidAge !== null && s.skidAge < specDuration(HERO_SPEC.skid) + 0.12) return { name: 'skid', t: s.skidAge }
  if (Math.abs(s.vx) > RUN_THRESHOLD) {
    // The cycle advances with distance (one pass per 8/14 s at full speed), so feet never slide.
    return { name: 'run', t: s.distance / RUN_SPEED }
  }
  if (s.idleTime >= WAIT_AFTER && s.idleTime - WAIT_AFTER < specDuration(HERO_SPEC.wait))
    return { name: 'wait', t: s.idleTime - WAIT_AFTER }
  if (s.blinkAge < specDuration(HERO_SPEC.blink)) return { name: 'blink', t: s.blinkAge }
  return { name: 'idle', t: s.idleTime }
}

/** Run frames whose foot hits the ground (dust and a footstep). */
export const RUN_CONTACT_FRAMES = [0, 4] as const

// ------------------------------------------------------------------------------------------------- enemies

export interface EnemySnapshot {
  kind: EnemyKind
  vx: number
  vy: number
  onGround: boolean
  hitFlash: number
  shootTimer: number
  /** Seconds since touching down (jumper). */
  landAge: number
  /** Seconds alive (loop clips). */
  time: number
}

/** The spitter's shot timer resets to this after a shot (sim.ts). */
export const SPIT_INTERVAL = 2.4

export function enemyClip(s: EnemySnapshot): ClipChoice {
  if (s.hitFlash > 0) return { name: 'hurt', t: 0.16 - s.hitFlash }
  switch (s.kind) {
    case 'flyer':
      return { name: 'move', t: s.time }
    case 'jumper':
      if (!s.onGround) return { name: 'air', t: 0, frame: s.vy < 0 ? 0 : 1 }
      if (s.landAge < specDuration(ENEMY_SPEC.jumper.land)) return { name: 'land', t: s.landAge }
      return { name: 'idle', t: s.time }
    case 'spitter': {
      const spec = ENEMY_SPEC.spitter.shoot
      const lead = hitTime(spec)
      // Wind up so the `hit` frame shows the moment the acorn leaves, then finish the follow-through.
      if (s.shootTimer > 0 && s.shootTimer <= lead) return { name: 'shoot', t: lead - s.shootTimer }
      const since = SPIT_INTERVAL - s.shootTimer
      if (since >= 0 && since < specDuration(spec) - lead) return { name: 'shoot', t: lead + since }
      return { name: 'idle', t: s.time }
    }
    default:
      return Math.abs(s.vx) > 8 ? { name: 'move', t: s.time } : { name: 'idle', t: s.time }
  }
}

// ------------------------------------------------------------------------------------------------- bosses

export interface BossSnapshot {
  kind: BossKind
  state: BossState
  /** The state before the current one. */
  prevState: BossState | null
  stateTime: number
  active: boolean
  vx: number
  vy: number
  /** Seconds since the phase-2 transformation began, or null. */
  rageAge: number | null
  time: number
}

/** The sheet a boss is drawn from: the chasing parent uses ハム代's sheet. */
export const bossSheetSpec = (kind: BossKind, art: string) => (kind === 'chaser' ? MOM_SPEC : bossSpec(art as BossArt))

/** Seconds into the final boss's `shoot` state when the volley leaves (sim.ts). */
export const FINAL_VOLLEY_AT = 0.5

/** The boss's clip; a state its kind never reaches falls back to a clip its sheet has. */
export function bossClip(s: BossSnapshot, art: string): ClipChoice {
  const spec = bossSheetSpec(s.kind, art)
  const choice = pickBossClip(s, spec)
  if (spec[choice.name]) return choice
  const fallback = Math.abs(s.vx) > 10 && spec.move ? 'move' : 'idle'
  return { name: fallback, t: s.time }
}

function pickBossClip(s: BossSnapshot, spec: Record<string, AnimSpec>): ClipChoice {
  if (!s.active) return { name: 'idle', t: s.time }
  if (s.kind === 'chaser') {
    if (s.state === 'tired') return { name: 'tired', t: s.stateTime }
    if (s.state === 'stunned') return { name: 'stunned', t: s.stateTime }
    return { name: 'move', t: s.time }
  }
  if (s.kind === 'final' && s.rageAge !== null && s.rageAge < specDuration(spec.rage))
    return { name: 'rage', t: s.rageAge }
  const leapsAndSlams = s.kind === 'tank' || s.kind === 'final'
  switch (s.state) {
    case 'windup':
      return { name: 'windup', t: s.stateTime }
    case 'charge':
    case 'dive':
      return { name: 'attack', t: s.stateTime }
    case 'stunned':
      return { name: s.kind === 'brute' ? 'stunned' : 'recover', t: s.stateTime }
    case 'slam':
      return leapsAndSlams ? { name: 'air', t: 0, frame: s.vy < 0 ? 0 : 1 } : { name: 'idle', t: s.time }
    case 'shoot': {
      if (s.kind !== 'final') return { name: 'idle', t: s.time }
      const lead = hitTime(spec.shoot)
      return { name: 'shoot', t: Math.max(0, s.stateTime - (FINAL_VOLLEY_AT - lead)) }
    }
    case 'recover': {
      if (leapsAndSlams && s.prevState === 'slam' && s.stateTime < specDuration(spec.land))
        return { name: 'land', t: s.stateTime }
      if (s.kind === 'final' && s.prevState === 'shoot') {
        const lead = hitTime(spec.shoot)
        if (s.stateTime < specDuration(spec.shoot) - lead) return { name: 'shoot', t: lead + s.stateTime }
      }
      return { name: 'recover', t: s.stateTime }
    }
    case 'idle':
    default:
      if ((s.kind === 'tank' || s.kind === 'swarm' || s.kind === 'final') && Math.abs(s.vx) > 10)
        return { name: 'move', t: s.time }
      return { name: 'idle', t: s.time }
  }
}

// ------------------------------------------------------------------------------------------------- props

/** ハム姫: sad while caged, cheering for two seconds when freed, waving once the exit is open. */
export function princessClip(caged: boolean, freedAge: number | null, goalOpen: boolean, time: number): ClipChoice {
  if (caged) return { name: 'sad', t: time }
  if (freedAge !== null && freedAge < 2) return { name: 'cheer', t: freedAge }
  if (goalOpen) return { name: 'wave', t: time }
  return { name: 'idle', t: time }
}
