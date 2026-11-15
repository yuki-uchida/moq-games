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

/** Ticks of 1/fps the frames `from` (inclusive) to `to` (exclusive) of a clip are shown for, counting `hold`. */
function ticksOf(spec: AnimSpec, from: number, to: number) {
  const hold = spec.hold
  if (!hold) return to - from
  let ticks = 0
  for (let i = from; i < to; i++) ticks += hold[i] ?? 1
  return ticks
}

/** Seconds from the start of a clip to the start of its frame `frame` (holds included). */
export const frameStart = (spec: AnimSpec, frame: number) => ticksOf(spec, 0, frame) / spec.fps

/** Seconds of one pass of a contract clip (its holds included). */
export const specDuration = (spec: AnimSpec) => ticksOf(spec, 0, spec.frames) / spec.fps
/** Seconds from the clip start to its `hit` frame (a hair past the boundary, so rounding never lands a frame early). */
export const hitTime = (spec: AnimSpec) => (ticksOf(spec, 0, spec.hit ?? 0) + 1e-4) / spec.fps
/** Seconds of one pass over the frames a `sustain` clip keeps cycling after it has played (0 without sustain). */
export const sustainCycle = (spec: AnimSpec) =>
  spec.sustain ? ticksOf(spec, spec.frames - spec.sustain, spec.frames) / spec.fps : 0
/**
 * How long a ghost that plays `spec` must live so it is never cut early: one pass, plus `tail`, and at least one
 * pass of the sustained frames when the clip has `sustain` (so the clip's last moments animate before it ends).
 */
export const clipLife = (spec: AnimSpec, tail = 0) => specDuration(spec) + Math.max(tail, sustainCycle(spec))

/**
 * The frame of an air clip by vertical speed (px/s, negative is up). A 3-frame clip is 0 rising, 1 the top (while
 * |vy| <= `apexSpeed`), 2 falling. A 5-frame clip adds the two ends
 * of a hop, shown while |vy| > `fastSpeed`: 0 the launch, 1 rising, 2 the top, 3 falling, 4 bracing for the ground.
 */
export function airFrame(vy: number, frames: number, apexSpeed: number, fastSpeed = apexSpeed * 3) {
  if (frames < 5) {
    if (vy < -apexSpeed) return 0
    return vy > apexSpeed ? 2 : 1
  }
  if (vy < -fastSpeed) return 0
  if (vy < -apexSpeed) return 1
  if (vy <= apexSpeed) return 2
  return vy <= fastSpeed ? 3 : 4
}

/** Apex speeds (px/s) of the air clips: below these the top of the arc shows. */
export const JUMPER_APEX_SPEED = 120
/** The frog leaves the ground at 520 px/s: faster than this it is launching or about to land. */
export const JUMPER_FAST_SPEED = 380
export const BOSS_APEX_SPEED = 160

// ------------------------------------------------------------------------------------------------- hero

/** A landing faster than this (px/s) plays `land`. */
export const HARD_LANDING = 520
/** Standing still this long plays `wait`, and again every `WAIT_EVERY` seconds while he keeps standing. */
export const WAIT_AFTER = 5
export const WAIT_EVERY = 8
/**
 * The first `LUNGE_FRAMES` frames of a bite (the lunge and the chomp) are thrown forward off the feet: they show
 * anywhere, at a run and in the air. The rest (recoil, chew, settle) is a planted standing pose: it shows only on
 * the ground at rest, and otherwise the clip of his motion takes over for good.
 */
export const LUNGE_FRAMES = 2
/** Reversing faster than this (px/s) skids. */
export const SKID_SPEED = 110
/** Below this horizontal speed (px/s) the hero stands. */
export const RUN_THRESHOLD = 20
/** A blink (eyes shut over the idle poses) lasts this long, in seconds. */
export const BLINK_TIME = 0.12
/** In the air with |vy| (px/s) at or below this, the hero shows the top of the arc (`apex`). */
export const APEX_SPEED = 140

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
  /** Seconds since the facing flipped on the ground (not skidding), or null. */
  turnAge: number | null
  /** The fidget now due was cut by another clip: it does not come back (the next one plays in full). */
  waitCut?: boolean
}

export const isSkidding = (s: Pick<HeroSnapshot, 'onGround' | 'vx' | 'facing'>) =>
  s.onGround && s.vx * s.facing < 0 && Math.abs(s.vx) > SKID_SPEED

/**
 * The time into a ground cycle of `spec` after `distance` px of ground: one pass per `stride`, so a planted foot
 * stays put at any speed (a clip without a stride is timed as if covered at the hero's running speed).
 */
export const strideTime = (spec: AnimSpec, distance: number) =>
  spec.stride ? (distance / spec.stride) * specDuration(spec) : distance / RUN_SPEED

/** The hero's bite as it can be shown now, or null (its standing frames show only on the ground at rest). */
function heroBite(s: HeroSnapshot, spec: Record<string, AnimSpec>): ClipChoice | null {
  if (s.biteAge === null) return null
  const t = s.biteAge + hitTime(spec.bite)
  if (t < frameStart(spec.bite, LUNGE_FRAMES)) return { name: 'bite', t }
  return s.onGround && Math.abs(s.vx) <= RUN_THRESHOLD ? { name: 'bite', t } : null
}

/**
 * The hero's clip, in priority order: cheer, bite or hurt (the one that began later; on the same step the hurt),
 * swim (in water off the ground), jump/apex/fall, land, skid, turn, run, wait, blink, idle. The blink has the idle
 * poses with the eyes shut, so it is played on the idle time base and the breath never skips. An action the view
 * has dropped (see `ActorsView`) comes in as absent: this function only says what can show now.
 */
export function heroClip(s: HeroSnapshot, spec: Record<string, AnimSpec> = HERO_SPEC): ClipChoice {
  if (s.cheering) return { name: 'cheer', t: s.cheerAge }
  const bite = heroBite(s, spec)
  if (bite && !(s.hurt && s.hurtAge <= s.biteAge!)) return bite
  if (s.hurt) return { name: 'hurt', t: s.hurtAge }
  // On the floor of a pool he stands and walks as on land (the simulation walks and jumps him there as on land).
  if (s.inWater && !s.onGround) return { name: 'swim', t: s.waterTime }
  if (!s.onGround) {
    if (Math.abs(s.vy) <= APEX_SPEED) return { name: 'apex', t: s.airTime, frame: s.vy < 0 ? 0 : 1 }
    return s.vy < 0 ? { name: 'jump', t: s.airTime } : { name: 'fall', t: s.airTime }
  }
  // A landing at a run goes straight on into the run (the squash carries it).
  if (s.hardLanding && s.landAge < specDuration(spec.land) && Math.abs(s.vx) <= RUN_THRESHOLD)
    return { name: 'land', t: s.landAge }
  // The skid keeps cycling (`sustain`) for as long as the view's skid timer runs.
  if (s.skidAge !== null) return { name: 'skid', t: s.skidAge }
  if (s.turnAge !== null && s.turnAge < specDuration(spec.turn)) return { name: 'turn', t: s.turnAge }
  // The cycle advances with the ground covered, one pass per stride, so feet never slide.
  if (Math.abs(s.vx) > RUN_THRESHOLD) return { name: 'run', t: strideTime(spec.run, s.distance) }
  if (s.idleTime >= WAIT_AFTER && !s.waitCut) {
    const since = (s.idleTime - WAIT_AFTER) % WAIT_EVERY
    if (since < specDuration(spec.wait)) return { name: 'wait', t: since }
  }
  // The blink shares idle's time base (no pop).
  if (s.blinkAge < BLINK_TIME) return { name: 'blink', t: s.idleTime }
  return { name: 'idle', t: s.idleTime }
}

/** Frames of the hero's `die`: 0 the hit, 1–3 the tumble in the air, 4 the bounce on the ground, then lying, dazed. */
export const DIE_TUMBLE_FIRST = 1
export const DIE_TUMBLE_FRAMES = 3
export const DIE_BOUNCE = 4

/**
 * The hero's knock-out follows his body: the hit for one frame, the tumble while he is in the air (cycling for a
 * long fall), and from touching the ground (`landedFor` seconds ago) the bounce, the lying pose and the dazed
 * stars (sustained). Knocked down where he stood, it plays 0→7 at the clip's own speed.
 */
export function dieClip(age: number, landedFor: number | null, spec: AnimSpec = HERO_SPEC.die): ClipChoice {
  if (landedFor !== null) return { name: 'die', t: (DIE_BOUNCE + 1e-4) / spec.fps + landedFor }
  const tick = 1 / spec.fps
  if (age < tick - 1e-6) return { name: 'die', t: age, frame: 0 }
  const tumble = Math.max(0, Math.floor((age - tick) * spec.fps + 1e-6)) % DIE_TUMBLE_FRAMES
  return { name: 'die', t: age, frame: DIE_TUMBLE_FIRST + tumble }
}

/** Run frames whose foot hits the ground (dust and a footstep). */
export const RUN_CONTACT_FRAMES = [0, 4] as const

// ------------------------------------------------------------------------------------------------- enemies

export interface EnemySnapshot {
  kind: EnemyKind
  vx: number
  vy: number
  onGround: boolean
  /** The hit flash of a hit shown as `hurt` (0 when the hit shows as the white flash only). */
  hitFlash: number
  shootTimer: number
  /** Seconds since touching down (jumper). */
  landAge: number
  /** Ground its drawn body has covered the way it faces (px), and whether it stands (walker, tough: see `Tread`). */
  gain: number
  standing: boolean
  /** Seconds alive (loop clips). */
  time: number
  /**
   * Off the ground with no ground within `ENEMY_AIR_GAP` px under its feet (a rat or a mole that fell off a ledge,
   * was summoned in the air, or had the ground dug away): its walk and its stand are not drawn there.
   */
  airborne?: boolean
  /**
   * A squirrel's throw begun again facing the other side (the hero crossed before the acorn left): the shot timer it
   * began again at (its frames before the release squeezed into the time left), or the seconds since it began again
   * while it waits loaded (its frames up to the loaded pose played over `FIT_MIN`). Unset: its own lead-in.
   */
  throwFrom?: number
  throwAgainAge?: number | null
  /** The acorn left the other way from its throw (the hero crossed on the very step): no follow-through shows. */
  throwCut?: boolean
  /** Its throw is held back by the hold of a turn (it stands until it may face its aim). */
  throwHeld?: boolean
}

/** A body off the ground with ground this close (px) under its feet is still drawn on it (a minion's first step). */
export const ENEMY_AIR_GAP = 4
/** The rat's and the mole's `air` shows the top of the arc while |vy| (px/s) is at or below this. */
export const WALKER_APEX_SPEED = 90

/** A hit enemy flashes for this long (s, sim.ts `damageEnemy`): its `hurt` plays over it. */
export const ENEMY_HURT_SECONDS = 0.16

/** The spitter's shot timer resets to this after a shot (sim.ts). */
export const SPIT_INTERVAL = 2.4
/**
 * A loaded spitter waiting for the hero to come into range holds the frame before `hit` (cheeks full, leaning in)
 * for this long (s), then dips to the frame before that for `SPIT_READY_DIP` (s): a pulse of tension.
 */
export const SPIT_READY_HOLD = 0.6
export const SPIT_READY_DIP = 0.15

/**
 * The first frame of each enemy's `defeat` in which it lies on the ground: a knocked-out enemy lands on it. The rat,
 * the crow, the frog and the squirrel tumble through frames 1–3 (the crow's beak and the frog's hands only touch
 * down on 3) and lie from frame 4; the mole is already flat on his back on frame 3.
 */
export const ENEMY_DEFEAT_GROUND_FRAME: Record<EnemyKind, number> = {
  walker: 4,
  flyer: 4,
  jumper: 4,
  spitter: 4,
  tough: 3
}

/**
 * Whether a squirrel with this shot timer is in its throw: from the first frame of the wind-up (loaded and waiting
 * included) to the last frame of the follow-through.
 */
export function spitThrowing(shootTimer: number, spec: AnimSpec = ENEMY_SPEC.spitter.shoot, cut = false) {
  return shootTimer <= hitTime(spec) || spitFollowing(shootTimer, spec, cut)
}

/**
 * Whether a squirrel with this shot timer is following its throw through (the acorn has just left); never after a
 * throw that was `cut` (the acorn left the other way: it stands).
 */
export function spitFollowing(shootTimer: number, spec: AnimSpec = ENEMY_SPEC.spitter.shoot, cut = false) {
  const since = SPIT_INTERVAL - shootTimer
  return !cut && since >= 0 && since < specDuration(spec) - hitTime(spec)
}

/**
 * Whether a bite a squirrel survives shows `hurt`: not during its throw (the hit is the white flash over the throw),
 * and not when the wind-up would have to begin before the hurt is over.
 */
export function spitterHurtShows(shootTimer: number, spec: AnimSpec = ENEMY_SPEC.spitter.shoot, cut = false) {
  return !spitThrowing(shootTimer, spec, cut) && shootTimer - hitTime(spec) >= ENEMY_HURT_SECONDS
}

export function enemyClip(s: EnemySnapshot, specs: Record<string, AnimSpec> = ENEMY_SPEC[s.kind]): ClipChoice {
  if (s.hitFlash > 0) return { name: 'hurt', t: ENEMY_HURT_SECONDS - s.hitFlash }
  switch (s.kind) {
    case 'flyer':
      return { name: 'move', t: s.time }
    case 'jumper':
      if (!s.onGround)
        return { name: 'air', t: 0, frame: airFrame(s.vy, specs.air.frames, JUMPER_APEX_SPEED, JUMPER_FAST_SPEED) }
      if (s.landAge < specDuration(specs.land)) return { name: 'land', t: s.landAge }
      return { name: 'idle', t: s.time }
    case 'spitter': {
      const spec = specs.shoot
      const lead = hitTime(spec)
      // Wind up so the `hit` frame shows the moment the acorn leaves, then finish the follow-through.
      // (Up to the frame before the release: a timer that runs out to a hair above zero throws a step later, and
      // the release frame waits for the step the acorn leaves.)
      // Begun again facing the other side, its lead-in is squeezed into the time left (`throwFrom`).
      const release = frameStart(spec, spec.hit ?? 0) - 1e-6
      const from = s.throwFrom ?? lead
      if (s.throwHeld) return { name: 'idle', t: s.time }
      if (s.shootTimer > 0 && s.shootTimer <= lead) {
        const t = from < lead ? lead * (1 - s.shootTimer / from) : lead - s.shootTimer
        return { name: 'shoot', t: Math.min(Math.max(0, t), release) }
      }
      // Loaded with nobody in range (the timer runs on below zero): stay at the end of the wind-up, pulsing.
      if (s.shootTimer <= 0) {
        const ready = Math.max(0, (spec.hit ?? 0) - 1)
        // (Begun again while it waits: its frames up to the loaded pose first.)
        const again = s.throwAgainAge ?? null
        if (again !== null && again < FIT_MIN)
          return { name: 'shoot', t: Math.min(frameStart(spec, ready), (again / FIT_MIN) * frameStart(spec, ready)) }
        const waited = -s.shootTimer % (SPIT_READY_HOLD + SPIT_READY_DIP)
        return { name: 'shoot', t: lead, frame: waited < SPIT_READY_HOLD ? ready : Math.max(0, ready - 1) }
      }
      if (spitFollowing(s.shootTimer, spec, s.throwCut))
        return { name: 'shoot', t: lead + SPIT_INTERVAL - s.shootTimer }
      return { name: 'idle', t: s.time }
    }
    default:
      // In the air it is thrown up, at the top, or falling (by its vertical speed), never walking on nothing.
      if (s.airborne && specs.air)
        return { name: 'air', t: 0, frame: airFrame(s.vy, specs.air.frames, WALKER_APEX_SPEED) }
      // The walk advances with the ground gained; a body that marks time on the spot stands.
      return s.standing ? { name: 'idle', t: s.time } : { name: 'move', t: strideTime(specs.move, s.gain) }
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
  /** His cruising speed (`def.speed`, px/s): a flier's hover gives way to his dash clip well above it. */
  speed: number
  /** The fight's phase (the king's states are shorter in phase 2). */
  phase: number
  /** Seconds since the phase-2 transformation began, or null. */
  rageAge: number | null
  /**
   * The time into the `hurt` clip of the flinch the view started for a hit (view time scaled to the seconds it was
   * given, so a hit-stop holds it; see `flinchFit`), or null when none is playing.
   */
  hurtAge: number | null
  onGround: boolean
  /** The simulation's shot timer (`boss.shotTimer`): the throw or cast leaves when it has run out. */
  shotTimer: number
  /**
   * The time into the `shoot` clip of the throw, cast or summon gesture the view started, fitted to its time
   * (`castFit`), or null when none is playing.
   */
  castAge: number | null
  /** The king's transformation cut his volley: its follow-through does not come back. */
  volleyCut: boolean
  /** Seconds since his last dash (charge or dive) began, and the ground he has gained since (null: no dash yet). */
  dashAge: number | null
  dashGain: number
  /** What his body does (`Tread`): ground his drawn body has covered the way he faces, and whether he stands. */
  gain: number
  standing: boolean
  time: number
  /**
   * The state time at which the clip timed from the state's start took over from another clip inside the state (a
   * recovery after a landing, a follow-through or a dash; a wind-up after a fall), so it begins on its first frame.
   */
  clipFrom?: number
  /**
   * The state time at which he last touched down from the air inside the state (0: he came into the state on the
   * ground, or lands with it): a landing after a fall is timed from there.
   */
  landedAt?: number
  /** A landing that a cut ended (a staged pose that had to wait no longer) is over for good until he lands again. */
  landCut?: boolean
  /**
   * The time into his state on its own clock: `stateTime`, or, once the phase change has restarted the state's
   * clock, the time since the state began. A landing and a volley's follow-through are timed on it.
   */
  ownTime?: number
  /** The phase change has restarted his state's clock since the state began. */
  stateReset?: boolean
  /** How far the king's gathering had come (0–1) where it took over at `clipFrom` (the phase change: it goes on). */
  gatherFrom?: number
  /** View time since a heavy boss touched down from a real fall outside his slam (null: none). */
  fallLandAge?: number | null
  /**
   * Off the ground, he comes down again within `AIR_SHORT_SECONDS` (a step or two over a seam): a landing goes on
   * through it.
   */
  landHolds?: boolean
  /**
   * Off the ground for a step or two over a seam (he comes down again within `AIR_SHORT_SECONDS`: the shake at a
   * ledge's lip): not a fall.
   */
  airShort?: boolean
  /** How many shots he fires at once (`def.projectiles`; 0: he throws nothing). */
  projectiles?: number
}

/** The sheet a boss is drawn from: the chasing parent uses ハム代's sheet. */
export const bossSheetSpec = (kind: BossKind, art: string) => (kind === 'chaser' ? MOM_SPEC : bossSpec(art as BossArt))

/**
 * The first frame of each boss's `defeat` in which he lies on the ground: a boss knocked out in the air lands on
 * it. The two fliers and the weasel tumble for three frames (1–3) and come down on frame 4; the others hit the
 * ground already on frame 3 (the boar, the wolf and the fox slump, the bear rolls onto his back, the ape plants
 * his face, the king falls flat on his cape) and bounce on frame 4.
 */
export const BOSS_DEFEAT_GROUND_FRAME: Record<BossArt, number> = {
  crowBoss: 4,
  beeBoss: 4,
  weaselBoss: 4,
  boarBoss: 3,
  wolfBoss: 3,
  bearBoss: 3,
  foxBoss: 3,
  apeBoss: 3,
  king: 3
}

/**
 * The hero is clearly to one side of a boss for his aim when he is further over than one step of the boss's own
 * travel and `AIM_MARGIN_PX` (sim.ts aims by the sign of `player.x - boss.x`, which flips only while the boss, walking
 * at him, overshoots him by a step).
 */
export const AIM_MARGIN_PX = 2
export const aimClear = (speed: number) => speed / 60 + AIM_MARGIN_PX

/** Seconds into the final boss's `shoot` state when the volley leaves (sim.ts). */
export const FINAL_VOLLEY_AT = 0.5

/**
 * The thrown and cast shots of the crow (`updateFlyerBoss` in sim.ts: only while `idle`, the timer then reset to
 * 1.7 s) and of the fox and the bee (`updateSwarmBoss`: in any state, reset to 2.1 s).
 */
export const FLYER_SHOT_INTERVAL = 1.7
export const SWARM_SHOT_INTERVAL = 2.1
/**
 * How long each boss kind stays in a state before the next (sim.ts `updateBruteBoss`, `updateTankBoss`,
 * `updateSwarmBoss`, `updateFinalBoss`, `updateFlyerBoss`; `tests/view-boss-timing.test.ts` measures them in the
 * simulation). The view starts a flinch or a cast only when it fits before he next walks or winds up.
 */
export const BRUTE_IDLE_SECONDS = 0.7
export const BRUTE_RECOVER_SECONDS = 0.6
export const BRUTE_STUN_SECONDS = 1.1
export const TANK_IDLE_SECONDS = 1.2
export const TANK_RECOVER_SECONDS = 1.0
export const SWARM_IDLE_SECONDS = 0.9
export const SWARM_RECOVER_SECONDS = 0.7
/** The king's, in phase 1 and phase 2. */
export const FINAL_IDLE_SECONDS = [0.9, 0.6] as const
export const FINAL_RECOVER_SECONDS = [0.8, 0.5] as const
/** The wind-ups of the bear and the ape, and of the king (sim.ts): his attack begins when they end. */
export const TANK_WINDUP_SECONDS = 0.5
export const FINAL_WINDUP_SECONDS = 0.35
export const FLYER_IDLE_SECONDS = 1.4
export const FLYER_RECOVER_SECONDS = 0.9
/** A boss flinches (`hurt`) only when he is nearly still (|vx| in px/s at or below this). */
export const FLINCH_MAX_SPEED = 20
/** A `stunned` state shows its clip and the dizzy mark only once it has lasted this long (s). */
export const STUN_SHOW_AFTER = 0.05
/** The crow's dive has levelled out once its vertical speed (px/s) is at or below this, or it is on the ground. */
export const DIVE_LEVEL_SPEED = 40
/** A levelled-out dive that travels no faster than this (px/s) is pinned against a wall: he flaps on the spot. */
export const DIVE_PINNED_SPEED = 40
/**
 * After a dash a boss keeps its clip while he still travels faster than this (px/s): his standing poses show only
 * once he has nearly stopped. A slam landing (`land`) keeps showing while he slides faster than this.
 */
export const DASH_REST_SPEED = 40
/** A flier's hover shows only up to this many times his cruising speed; faster, his dash clip shows. */
export const DASH_FACTOR = 1.5

/** Whether a `stunned` state is shown (its clip, the dizzy mark): only once it has lasted `STUN_SHOW_AFTER`. */
export const stunShown = (state: BossState, stateTime: number) => state === 'stunned' && stateTime >= STUN_SHOW_AFTER

const rest = (s: BossSnapshot, length: number) => Math.max(0, length - s.stateTime)
const finalLength = (lengths: readonly [number, number], phase: number) => lengths[phase >= 2 ? 1 : 0]

/**
 * Seconds a heavy boss (the bear, the ape, the king) stays put before his walk carries him (0 in his walk; Infinity
 * where no walk comes before an attack): a landing is fitted to it.
 */
export function stillRoom(s: BossSnapshot): number {
  const final = s.kind === 'final'
  if (s.kind !== 'tank' && !final) return Infinity
  if (s.state === 'idle') return 0
  if (s.state === 'recover')
    return rest(s, final ? finalLength(FINAL_RECOVER_SECONDS, s.phase ?? 1) : TANK_RECOVER_SECONDS)
  return Infinity
}

/**
 * Seconds until the boss next walks or winds up from where he is (0 in a state he walks or attacks in): a flinch
 * starts only if it is over by then. ハム代 has no wind-up: hers always fit.
 */
export function flinchRoom(s: BossSnapshot): number {
  switch (s.kind) {
    case 'chaser':
      return Infinity
    case 'brute':
      if (s.state === 'idle') return rest(s, BRUTE_IDLE_SECONDS)
      if (s.state === 'recover') return rest(s, BRUTE_RECOVER_SECONDS) + BRUTE_IDLE_SECONDS
      if (s.state === 'stunned') return rest(s, BRUTE_STUN_SECONDS) + BRUTE_RECOVER_SECONDS + BRUTE_IDLE_SECONDS
      return 0
    case 'tank':
      return s.state === 'recover' ? rest(s, TANK_RECOVER_SECONDS) : 0
    case 'swarm':
      return s.state === 'recover' ? rest(s, SWARM_RECOVER_SECONDS) : 0
    case 'final':
      return s.state === 'recover' ? rest(s, finalLength(FINAL_RECOVER_SECONDS, s.phase)) : 0
    case 'flyer':
      if (s.state === 'idle') return rest(s, FLYER_IDLE_SECONDS)
      if (s.state === 'recover') return rest(s, FLYER_RECOVER_SECONDS) + FLYER_IDLE_SECONDS
      return 0
    default:
      return 0
  }
}

/** Seconds until the next wind-up of a crow or a swarm boss (0 outside `idle` and `recover`): a cast must end by then. */
export function castRoom(s: BossSnapshot): number {
  if (s.kind === 'swarm') {
    if (s.state === 'idle') return rest(s, SWARM_IDLE_SECONDS)
    if (s.state === 'recover') return rest(s, SWARM_RECOVER_SECONDS) + SWARM_IDLE_SECONDS
  }
  if (s.kind === 'flyer') {
    if (s.state === 'idle') return rest(s, FLYER_IDLE_SECONDS)
    if (s.state === 'recover') return rest(s, FLYER_RECOVER_SECONDS) + FLYER_IDLE_SECONDS
  }
  return 0
}

/**
 * The seconds until the next throw or cast of a crow or a swarm boss, when the boss will show it from the state
 * he is in (null when the shot will leave in a state that keeps its own clip, or no shot is coming).
 */
export function shotLead(s: BossSnapshot): number | null {
  if (s.kind === 'flyer') {
    // Thrown only from the hover: a timer that ran out elsewhere fires on the step the crow hovers again.
    if (s.state === 'recover') return Math.max(s.shotTimer, FLYER_RECOVER_SECONDS - s.stateTime)
    if (s.state === 'idle') return s.shotTimer < FLYER_IDLE_SECONDS - s.stateTime ? s.shotTimer : null
    return null
  }
  if (s.kind === 'swarm') {
    if (s.state === 'recover') return s.shotTimer
    if (s.state === 'idle') return s.shotTimer < SWARM_IDLE_SECONDS - s.stateTime ? s.shotTimer : null
  }
  return null
}

/**
 * A thrown or cast shot of a crow, a fox or a bee is announced by a gathering light (`ActorsView.shotCue`) for this
 * long (s of simulation time) before it leaves, at the place the shot is born.
 */
export const SHOT_CUE_SECONDS = 0.45
/** One simulation step (s): `shotDue` steps the boss's timers as sim.ts does. */
const SIM_STEP = 1 / 60
/** `shotDue` looks this many steps ahead at most (longer than any wait for a shot that is known to come). */
const SHOT_DUE_STEPS = 240

/**
 * Seconds until the next thrown or cast shot of a crow, a fox or a bee leaves; null when none is coming. It steps the
 * simulation's own arithmetic in its own order (`updateBoss`: the state time, the state switch, the shot timer, the
 * shot when the timer has run out, the crow's only in his hover), so a light never promises a shot that does not
 * come and never misses one at the edge of a state. The crow's dive ends when it ends (it is not predicted): from a
 * dive or the wind-up before it the next shot is further away than any light.
 */
export function shotDue(s: BossSnapshot): number | null {
  if (!s.active || (s.kind !== 'flyer' && s.kind !== 'swarm') || s.projectiles === 0) return null
  let timer = s.shotTimer
  let state = s.state
  let stateTime = s.stateTime
  for (let n = 1; n <= SHOT_DUE_STEPS; n++) {
    stateTime += SIM_STEP
    if (s.kind === 'flyer') {
      if (state === 'idle') {
        if (stateTime > FLYER_IDLE_SECONDS) return null
      } else if (state === 'recover') {
        if (stateTime > FLYER_RECOVER_SECONDS) {
          state = 'idle'
          stateTime = 0
        }
      } else if (state === 'windup' || state === 'dive') return null
      else {
        state = 'idle'
        stateTime = 0
      }
    }
    timer -= SIM_STEP
    if (timer <= 0 && (s.kind === 'swarm' || state === 'idle')) return n * SIM_STEP
  }
  return null
}

/**
 * Whether the clip `name` can show on the body as it moves now: a flier's hover up to `DASH_FACTOR` times his
 * cruising speed, a planted pose only on a body that has (nearly) stopped, anything drawn to travel at any speed.
 */
export function canShow(s: BossSnapshot, spec: Record<string, AnimSpec>, name: string) {
  const clip = spec[name]
  if (!clip) return false
  if (clip.travel === 'hover') return Math.abs(s.vx) <= DASH_FACTOR * s.speed
  if (clip.stride || clip.travel) return true
  return Math.abs(s.vx) <= DASH_REST_SPEED
}

/**
 * Whether the landing of a slam shows: for its length from the step he touched down (the state's first, or later
 * when his slide took him off a ledge and he fell: he lands again, whole), and on while he slides (it is drawn
 * sliding). A second landing that could not play out before he stands up again is not begun: he goes on with his
 * recovery.
 */
function landShows(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  if (!spec.land || s.state !== 'recover' || s.prevState !== 'slam' || s.landCut) return false
  if (Math.abs(s.vx) > DASH_REST_SPEED) return true
  const landed = s.landedAt ?? 0
  const length = specDuration(spec.land)
  const recover = s.kind === 'final' ? finalLength(FINAL_RECOVER_SECONDS, s.phase) : TANK_RECOVER_SECONDS
  if (landed > 0 && landed + length > recover + 1e-9) return false
  return landAge(s) < length
}

/** The time into his landing, on his state's own clock from where it began (`landedAt`). */
const landAge = (s: BossSnapshot) => (s.ownTime ?? s.stateTime) - (s.landedAt ?? 0)

/** The time since the king's volley left, on his recovery's own clock (the step it left begins the recovery). */
const followAge = (s: BossSnapshot) => s.ownTime ?? s.stateTime

/**
 * Seconds until a heavy boss's next attack begins (his wind-up ends), from the state he is in: a landing after a
 * fall is fitted to it.
 */
export function attackRoom(s: BossSnapshot): number {
  const final = s.kind === 'final'
  const windup = final ? FINAL_WINDUP_SECONDS : TANK_WINDUP_SECONDS
  const idle = final ? finalLength(FINAL_IDLE_SECONDS, s.phase) : TANK_IDLE_SECONDS
  const recover = final ? finalLength(FINAL_RECOVER_SECONDS, s.phase) : TANK_RECOVER_SECONDS
  switch (s.state) {
    case 'windup':
      return rest(s, windup)
    case 'idle':
      return rest(s, idle) + windup
    case 'recover':
      return rest(s, recover) + idle + windup
    // (In an attack there is no time before it: his dash or his leap carries him on.)
    case 'shoot':
    case 'slam':
    case 'charge':
    case 'dive':
      return 0
    default:
      return idle + windup
  }
}

/**
 * Whether a heavy boss's landing after a plain fall shows now: on the ground (or off it for no longer than his
 * `air` would show, `landHolds`), until it has played.
 */
export function fallLandShows(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  if (s.fallLandAge == null || !spec.land || !(s.onGround || s.landHolds)) return false
  return s.fallLandAge < specDuration(spec.land) - 1e-9
}

/**
 * The clip time at which a plain fall's landing has shown its impact (its first frame is over): from here a staged
 * moment may take him over (see `ActorsView.bossBetweenActions`).
 */
export function landImpactEnd(land: AnimSpec) {
  return (land.hold?.[0] ?? 1) / land.fps
}

/**
 * The least time (s) an action is shown in: a flinch or a cast is fitted to the time there is (its frames played
 * faster, every one of them still shown), and with less than this it is not shown at all.
 */
export const FIT_MIN = 0.1

/**
 * The seconds a hit's `hurt` flinch is played over, decided once when the hit lands; 0 when it is not shown. Not in
 * states that carry a warning or an attack (windup, charge, dive, slam, shoot: there the hit is the white flash and
 * the jolt), not on a moving body (a planted flinch would slide), not during a slam landing or a volley's
 * follow-through; and it ends before he next walks or winds up (`flinchRoom`), and before the step his next shot
 * leaves (`shotDue`: a flinch never covers a shot, nor its light's last moments): the whole clip when it has the
 * time, faster when it has less, not at all under `FIT_MIN`.
 */
export function flinchFit(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  if (!spec.hurt || !s.active) return 0
  if (Math.abs(s.vx) > FLINCH_MAX_SPEED) return 0
  if (s.kind !== 'chaser') {
    if (s.state !== 'idle' && s.state !== 'recover' && s.state !== 'stunned') return 0
    if (landShows(s, spec)) return 0
    if (s.kind === 'final' && s.state === 'recover' && s.prevState === 'shoot' && !s.volleyCut)
      if (followAge(s) < specDuration(spec.shoot) - hitTime(spec.shoot)) return 0
  }
  let room = flinchRoom(s)
  const due = shotDue(s)
  if (due !== null) room = Math.min(room, due - SIM_STEP)
  return room + 1e-9 < FIT_MIN ? 0 : Math.min(specDuration(spec.hurt), room)
}

/**
 * The seconds the follow-through of a throw or cast of a crow, a fox or a bee would be played over if its pose
 * started now; 0 when it does not start. It starts while the shot is due within the natural lead-in (`hitTime`) and
 * he can show it, with at least `FIT_MIN` before the shot (its lead-in is played over that time, the release frame
 * landing on the step the shot leaves) and at least `FIT_MIN` after it before his next wind-up (the follow-through
 * is played over its natural length, or that time when it is shorter). Otherwise that shot leaves without a pose.
 */
export function castFit(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  const shoot = spec.shoot
  if (!shoot || (s.kind !== 'flyer' && s.kind !== 'swarm') || !s.active) return 0
  const lead = hitTime(shoot)
  const until = shotLead(s)
  if (until === null || until > lead + 1e-9 || until + 1e-9 < FIT_MIN) return 0
  if (!canShow(s, spec, 'shoot')) return 0
  const after = castRoom(s) - until
  return after + 1e-9 < FIT_MIN ? 0 : Math.min(specDuration(shoot) - lead, after)
}

/**
 * Seconds into the cast clip while its lead-in runs, for a lead-in that began with the shot `from` seconds away:
 * the frames before the release played over that time, so the release frame shows the moment the shot leaves.
 */
export function castLeadTime(s: BossSnapshot, spec: Record<string, AnimSpec>, from: number) {
  const lead = hitTime(spec.shoot)
  const until = Math.max(0, Math.min(from, shotLead(s) ?? 0))
  // Up to the frame before the release: the release frame waits for the step the shot leaves (a timer that runs out
  // to a hair above zero leaves its shot a step later).
  return Math.min(from > 0 ? lead * (1 - until / from) : lead, frameStart(spec.shoot, spec.shoot.hit ?? 0) - 1e-6)
}

/** The clip of his dash a boss shows (the crow skims in `sweep` once level), or null when he has none. */
function dashName(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  if (s.kind === 'flyer' && spec.sweep) return 'sweep'
  return spec.attack ? 'attack' : null
}

/** A dash clip on a time base that does not jump when the state changes: by ground gained when it has a stride. */
function dashClip(s: BossSnapshot, spec: Record<string, AnimSpec>, name: string): ClipChoice {
  const clip = spec[name]
  if (clip?.stride) return { name, t: strideTime(clip, s.dashGain) }
  return { name, t: s.dashAge ?? s.stateTime }
}

/**
 * The time into a clip that is timed from the state's start (a wind-up, a recovery, a stun, a landing, the rest):
 * from where it took over inside the state (`clipFrom`), so it begins on its first frame after another clip.
 */
const clipTime = (s: BossSnapshot) => s.stateTime - (s.clipFrom ?? 0)

/** How long (s) the simulation keeps each kind of boss in his wind-up (sim.ts: the dash begins once past it). */
export const WINDUP_SECONDS: Record<string, number> = {
  brute: 0.45,
  flyer: 0.4,
  tank: 0.5,
  swarm: 0.35,
  final: 0.35
}
/** sim.ts: a slam ends on the ground once its state is this old (the phase change can restart that clock). */
export const SLAM_GROUND_SECONDS = 0.2

/**
 * The time into his wind-up clip. Begun with the state, on its own clock (its tail trembles until the dash). Taken
 * over inside the state (after a landing or a fall) with less time left than the clip, it is fitted to that time:
 * every frame, faster, so that it has reached its tail when the dash begins.
 */
function windupTime(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  const from = s.clipFrom ?? 0
  const t = s.stateTime - from
  const windup = spec.windup
  const length = WINDUP_SECONDS[s.kind]
  if (from <= 0 || !windup || length === undefined) return t
  const whole = specDuration(windup)
  if (length - from >= whole) return t
  return Math.min(whole - 1e-6, (t * whole) / Math.max(1e-3, length - from))
}

/** The boss's clip; a state its kind never reaches falls back to a clip its sheet has. */
export function bossClip(
  s: BossSnapshot,
  art: string,
  spec: Record<string, AnimSpec> = bossSheetSpec(s.kind, art)
): ClipChoice {
  let choice = pickBossClip(s, spec)
  if (!spec[choice.name]) {
    const fallback = Math.abs(s.vx) > 10 && spec.move ? 'move' : 'idle'
    choice = { name: fallback, t: s.time }
  }
  // A flier's hover shows only at about his cruising speed: faster, in any state, his dash clip carries him.
  if (s.active && spec[choice.name].travel === 'hover' && Math.abs(s.vx) > DASH_FACTOR * s.speed) {
    const dash = dashName(s, spec)
    if (dash) return dashClip(s, spec, dash)
  }
  return choice
}

/** Whether the boss walks now (a walking kind in `idle` that gains ground), else he stands. */
function walkClip(s: BossSnapshot, spec: Record<string, AnimSpec>): ClipChoice {
  const walks = s.kind === 'tank' || s.kind === 'swarm' || s.kind === 'final'
  if (!walks || !spec.move || s.standing) return { name: 'idle', t: s.time }
  return spec.move.stride ? { name: 'move', t: strideTime(spec.move, s.gain) } : { name: 'move', t: s.time }
}

function pickBossClip(s: BossSnapshot, spec: Record<string, AnimSpec>): ClipChoice {
  if (!s.active) return { name: 'idle', t: s.time }
  // The transformation comes first, then a flinch or a cast the view has started (each plays out).
  if (s.kind === 'final' && s.rageAge !== null && s.rageAge < specDuration(spec.rage))
    return { name: 'rage', t: s.rageAge }
  if (s.hurtAge !== null && spec.hurt && s.hurtAge < specDuration(spec.hurt)) return { name: 'hurt', t: s.hurtAge }
  if (s.castAge !== null && spec.shoot && s.castAge < specDuration(spec.shoot)) return { name: 'shoot', t: s.castAge }
  // A heavy boss come down from a real fall (out of his walk, his wind-up, a stun) shows his whole landing.
  if (fallLandShows(s, spec)) return { name: 'land', t: s.fallLandAge! }
  const fast = Math.abs(s.vx) > DASH_REST_SPEED
  if (s.kind === 'chaser') {
    // She keeps running into a stop: her standing poses show once she has nearly stopped.
    // Her run plays by the ground she covers; off the ground (a hop) her legs go on, on time.
    const running = s.onGround ? { name: 'move', t: strideTime(spec.move, s.gain) } : { name: 'move', t: s.time }
    // (Both stand on the ground: worn out in the middle of a hop, she comes down first.)
    if (s.state === 'tired') return fast || !s.onGround ? running : { name: 'tired', t: clipTime(s) }
    if (stunShown(s.state, s.stateTime) && !fast && s.onGround) return { name: 'stunned', t: clipTime(s) }
    // Standing over the hero (she gains no ground) she stands.
    if (s.state === 'idle' && s.standing) return { name: 'idle', t: s.time }
    return running
  }
  const leapsAndSlams = s.kind === 'tank' || s.kind === 'final'
  const dash = dashName(s, spec)
  // Falling (put down above the ground, or off a ledge), the bear, the ape and the king show their leap's fall
  // whatever they were about to do: a crouch or a slump is not drawn in the air. So does the fox, who walks the
  // ledges (his `air`; outside his whirl and his cast's leap), but not for the shake at a ledge's lip.
  const walksOff = s.kind === 'swarm' && Boolean(spec.air) && !s.airShort
  const falling: ClipChoice | null =
    (leapsAndSlams || walksOff) && !s.onGround && spec.air && s.vy > 0
      ? { name: 'air', t: 0, frame: airFrame(s.vy, spec.air.frames, BOSS_APEX_SPEED) }
      : null
  // The first moments of a stun keep the clip of the state before it (a stun of a single step is never shown).
  if (s.state === 'stunned' && !stunShown(s.state, s.stateTime)) {
    if ((s.prevState === 'charge' || s.prevState === 'dive') && dash) return dashClip(s, spec, dash)
    return { name: 'idle', t: s.time }
  }
  switch (s.state) {
    case 'windup':
      return falling ?? { name: 'windup', t: windupTime(s, spec) }
    case 'charge':
      return spec.attack ? dashClip(s, spec, 'attack') : { name: 'idle', t: s.time }
    case 'dive':
      // Steep while he comes down; once he travels level (on the ground, or his fall has gone) he skims, and
      // pinned against a wall (the dive runs on, he goes nowhere) he flaps on the spot.
      if (s.kind === 'flyer' && spec.sweep && (s.onGround || Math.abs(s.vy) <= DIVE_LEVEL_SPEED))
        return Math.abs(s.vx) > DIVE_PINNED_SPEED ? dashClip(s, spec, 'sweep') : { name: 'recover', t: clipTime(s) }
      return dashClip(s, spec, 'attack')
    case 'stunned':
      if (fast && dash) return dashClip(s, spec, dash)
      return { name: s.kind === 'brute' ? 'stunned' : 'recover', t: clipTime(s) }
    case 'slam':
      // (Rolling in a restarted slam, carried off a ledge, he rolls on in the air: a dash that carries him.)
      if (leapsAndSlams && !s.onGround && s.stateReset && (s.landedAt ?? 0) > 0 && fast && dash)
        return dashClip(s, spec, dash)
      if (leapsAndSlams && !s.onGround)
        return { name: 'air', t: 0, frame: airFrame(s.vy, spec.air.frames, BOSS_APEX_SPEED) }
      // The phase change restarted his slam's clock as he touched down: the simulation carries him along the ground
      // at his leap's speed until it ends the slam. He hits the ground rolling (his dash's clip) until the impact's
      // step (`boss-slam`, his recovery begins), whatever the state's clock says; the squash comes with it.
      if (leapsAndSlams && s.stateReset && fast && dash) return dashClip(s, spec, dash)
      // On the ground in his slam he has touched down and the impact is still to come (the simulation ends the slam
      // on its next step, or 0.2 s on when the phase change restarted its clock; a staged pose may hold him there):
      // he skids in the first frame of his landing, and the landing plays from the impact (`boss-slam`, the step
      // his recovery begins). (After a cut there is no touchdown to land on: he recovers.)
      if (leapsAndSlams && s.landCut && spec.recover)
        return fast && dash ? dashClip(s, spec, dash) : { name: 'recover', t: clipTime(s) }
      if (!leapsAndSlams || !spec.land) return { name: 'idle', t: s.time }
      return { name: 'land', t: 0, frame: 0 }
    case 'shoot': {
      if (s.kind !== 'final') return falling ?? walkClip(s, spec)
      // In `shoot` he only gathers: the frames before the release share the time up to the volley evenly (from
      // where the gathering began: the state's start, or the end of a staged moment that held it). The release
      // frame begins in `recover`, on the step the orbs leave (the volley and the change of state are one step).
      const shoot = spec.shoot
      const hit = shoot.hit ?? 0
      const from = Math.min(s.clipFrom ?? 0, FINAL_VOLLEY_AT - 1e-3)
      const k0 = s.gatherFrom ?? 0
      const k = k0 + ((1 - k0) * Math.max(0, s.stateTime - from)) / (FINAL_VOLLEY_AT - from)
      const frame = Math.max(0, Math.min(hit - 1, Math.floor(k * hit)))
      return { name: 'shoot', t: frameStart(shoot, frame), frame }
    }
    case 'recover': {
      // A dash that still carries him is drawn as his dash, on the ground and in the air alike, until it has let him
      // go (the fox's whirl, the king's roll off a ledge). (A slam's recovery slides in its landing.)
      const dashed = s.prevState === 'charge' || s.prevState === 'dive' || s.prevState === 'stunned'
      if (fast && dash && (!leapsAndSlams || dashed)) return dashClip(s, spec, dash)
      // Slid off a ledge after his slam he falls first (his landing is drawn with planted feet); touching down again
      // he lands again, from its first frame to its last, and then goes on with his recovery from its first frame.
      if (falling) return falling
      if (leapsAndSlams && landShows(s, spec)) return { name: 'land', t: Math.max(0, landAge(s)) }
      if (s.kind === 'final' && s.prevState === 'shoot' && !s.volleyCut) {
        const lead = hitTime(spec.shoot)
        if (followAge(s) < specDuration(spec.shoot) - lead) return { name: 'shoot', t: lead + followAge(s) }
      }
      // After a dash he keeps its clip until he has nearly stopped.
      if (fast && dash) return dashClip(s, spec, dash)
      return falling ?? { name: 'recover', t: clipTime(s) }
    }
    case 'idle':
    default:
      return falling ?? walkClip(s, spec)
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
