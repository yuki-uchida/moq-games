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
 * swim, jump/apex/fall, land, skid, turn, run, wait, blink, idle. The blink has the idle poses with the eyes shut,
 * so it is played on the idle time base and the breath never skips. An action the view has dropped (see
 * `ActorsView`) comes in as absent: this function only says what can show now.
 */
export function heroClip(s: HeroSnapshot, spec: Record<string, AnimSpec> = HERO_SPEC): ClipChoice {
  if (s.cheering) return { name: 'cheer', t: s.cheerAge }
  const bite = heroBite(s, spec)
  if (bite && !(s.hurt && s.hurtAge <= s.biteAge!)) return bite
  if (s.hurt) return { name: 'hurt', t: s.hurtAge }
  if (s.inWater) return { name: 'swim', t: s.waterTime }
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
}

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
export function spitThrowing(shootTimer: number, spec: AnimSpec = ENEMY_SPEC.spitter.shoot) {
  return shootTimer <= hitTime(spec) || spitFollowing(shootTimer, spec)
}

/** Whether a squirrel with this shot timer is following its throw through (the acorn has just left). */
export function spitFollowing(shootTimer: number, spec: AnimSpec = ENEMY_SPEC.spitter.shoot) {
  const since = SPIT_INTERVAL - shootTimer
  return since >= 0 && since < specDuration(spec) - hitTime(spec)
}

/**
 * Whether a bite a squirrel survives shows `hurt`: not during its throw (the hit is the white flash over the throw),
 * and not when the wind-up would have to begin before the hurt is over.
 */
export function spitterHurtShows(shootTimer: number, spec: AnimSpec = ENEMY_SPEC.spitter.shoot) {
  return !spitThrowing(shootTimer, spec) && shootTimer - hitTime(spec) >= ENEMY_HURT_SECONDS
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
      if (s.shootTimer > 0 && s.shootTimer <= lead) return { name: 'shoot', t: lead - s.shootTimer }
      // Loaded with nobody in range (the timer runs on below zero): stay at the end of the wind-up, pulsing.
      if (s.shootTimer <= 0) {
        const ready = Math.max(0, (spec.hit ?? 0) - 1)
        const waited = -s.shootTimer % (SPIT_READY_HOLD + SPIT_READY_DIP)
        return { name: 'shoot', t: lead, frame: waited < SPIT_READY_HOLD ? ready : Math.max(0, ready - 1) }
      }
      const since = SPIT_INTERVAL - s.shootTimer
      if (since >= 0 && since < specDuration(spec) - lead) return { name: 'shoot', t: lead + since }
      return { name: 'idle', t: s.time }
    }
    default:
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
   * (`castFit`, `summonFit`), or null when none is playing.
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

/** Whether the landing of a slam shows: for its length, and on while he slides (it is drawn sliding). */
function landShows(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  if (!spec.land || s.state !== 'recover' || s.prevState !== 'slam') return false
  return s.stateTime < specDuration(spec.land) || Math.abs(s.vx) > DASH_REST_SPEED
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
 * follow-through; and it ends before he next walks or winds up (`flinchRoom`): the whole clip when it has the time,
 * faster when it has less, not at all under `FIT_MIN`.
 */
export function flinchFit(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  if (!spec.hurt || !s.active) return 0
  if (Math.abs(s.vx) > FLINCH_MAX_SPEED) return 0
  if (s.kind !== 'chaser') {
    if (s.state !== 'idle' && s.state !== 'recover' && s.state !== 'stunned') return 0
    if (landShows(s, spec)) return 0
    if (s.kind === 'final' && s.state === 'recover' && s.prevState === 'shoot' && !s.volleyCut)
      if (s.stateTime < specDuration(spec.shoot) - hitTime(spec.shoot)) return 0
  }
  const room = flinchRoom(s)
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

/** The seconds a summon's gesture (the cast from its release) is played over, fitted as a cast's; 0: not shown. */
export function summonFit(s: BossSnapshot, spec: Record<string, AnimSpec>) {
  const shoot = spec.shoot
  if (!shoot || s.kind !== 'swarm' || !s.active) return 0
  if (s.state !== 'idle' && s.state !== 'recover') return 0
  if (!canShow(s, spec, 'shoot')) return 0
  const room = castRoom(s)
  return room + 1e-9 < FIT_MIN ? 0 : Math.min(specDuration(shoot) - hitTime(shoot), room)
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
  const fast = Math.abs(s.vx) > DASH_REST_SPEED
  if (s.kind === 'chaser') {
    // She keeps running into a stop: her standing poses show once she has nearly stopped.
    // Her run plays by the ground she covers; off the ground (a hop) her legs go on, on time.
    const running = s.onGround ? { name: 'move', t: strideTime(spec.move, s.gain) } : { name: 'move', t: s.time }
    // (Both stand on the ground: worn out in the middle of a hop, she comes down first.)
    if (s.state === 'tired') return fast || !s.onGround ? running : { name: 'tired', t: s.stateTime }
    if (stunShown(s.state, s.stateTime) && !fast && s.onGround) return { name: 'stunned', t: s.stateTime }
    // Standing over the hero (she gains no ground) she stands.
    if (s.state === 'idle' && s.standing) return { name: 'idle', t: s.time }
    return running
  }
  const leapsAndSlams = s.kind === 'tank' || s.kind === 'final'
  const dash = dashName(s, spec)
  // Falling (put down above the ground, or off a ledge), the bear, the ape and the king show their leap's fall
  // whatever they were about to do: a crouch or a slump is not drawn in the air.
  const falling: ClipChoice | null =
    leapsAndSlams && !s.onGround && spec.air && s.vy > 0
      ? { name: 'air', t: 0, frame: airFrame(s.vy, spec.air.frames, BOSS_APEX_SPEED) }
      : null
  // The first moments of a stun keep the clip of the state before it (a stun of a single step is never shown).
  if (s.state === 'stunned' && !stunShown(s.state, s.stateTime)) {
    if ((s.prevState === 'charge' || s.prevState === 'dive') && dash) return dashClip(s, spec, dash)
    return { name: 'idle', t: s.time }
  }
  switch (s.state) {
    case 'windup':
      return falling ?? { name: 'windup', t: s.stateTime }
    case 'charge':
      return spec.attack ? dashClip(s, spec, 'attack') : { name: 'idle', t: s.time }
    case 'dive':
      // Steep while he comes down; once he travels level (on the ground, or his fall has gone) he skims, and
      // pinned against a wall (the dive runs on, he goes nowhere) he flaps on the spot.
      if (s.kind === 'flyer' && spec.sweep && (s.onGround || Math.abs(s.vy) <= DIVE_LEVEL_SPEED))
        return Math.abs(s.vx) > DIVE_PINNED_SPEED ? dashClip(s, spec, 'sweep') : { name: 'recover', t: s.time }
      return dashClip(s, spec, 'attack')
    case 'stunned':
      if (fast && dash) return dashClip(s, spec, dash)
      return { name: s.kind === 'brute' ? 'stunned' : 'recover', t: s.stateTime }
    case 'slam':
      return leapsAndSlams
        ? { name: 'air', t: 0, frame: airFrame(s.vy, spec.air.frames, BOSS_APEX_SPEED) }
        : { name: 'idle', t: s.time }
    case 'shoot': {
      if (s.kind !== 'final') return walkClip(s, spec)
      const lead = hitTime(spec.shoot)
      return { name: 'shoot', t: Math.max(0, s.stateTime - (FINAL_VOLLEY_AT - lead)) }
    }
    case 'recover': {
      if (leapsAndSlams && landShows(s, spec)) return { name: 'land', t: s.stateTime }
      if (s.kind === 'final' && s.prevState === 'shoot' && !s.volleyCut) {
        const lead = hitTime(spec.shoot)
        if (s.stateTime < specDuration(spec.shoot) - lead) return { name: 'shoot', t: lead + s.stateTime }
      }
      // After a dash he keeps its clip until he has nearly stopped.
      if (fast && dash) return dashClip(s, spec, dash)
      return falling ?? { name: 'recover', t: s.stateTime }
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
