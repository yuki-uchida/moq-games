/**
 * The hero, enemies and bosses: clip selection (pure functions in clips.ts) plus the timers it needs, squash and
 * stretch, hit flashes, invulnerability flicker, ghosts that play `defeat` after the sim removed an actor, status
 * marks (dizzy, sweat) and soft ground shadows. Each actor's anchor sits on the centre-bottom of its physics box.
 *
 * The picture follows what the body does (DESIGN.md, "the picture agrees with the motion"): ground cycles play by
 * the ground covered (`Tread`), a pose with planted feet shows only on a body at rest, walkers face the way they go
 * and the others the hero (with a dead zone), and an action (a bite, a hurt, a flinch, a cast) starts from its first
 * frame only when it can play out, and never comes back once something else has been drawn in its place.
 */
import { anchorOf, type Anim } from '../art'
import type { SimEvent } from '../game/events'
import { BITE_TIME, GRAVITY, INVULN, T, type Boss, type BossState, type Enemy, type World } from '../game/sim'
import { TILE } from '../game/types'
import { blit, brush, clip, flashClip, frameIndex } from './bake'
import {
  HARD_LANDING,
  RUN_CONTACT_FRAMES,
  RUN_THRESHOLD,
  SKID_SPEED,
  WAIT_AFTER,
  WAIT_EVERY,
  BOSS_DEFEAT_GROUND_FRAME,
  DASH_REST_SPEED,
  ENEMY_AIR_GAP,
  FLINCH_MAX_SPEED,
  ENEMY_DEFEAT_GROUND_FRAME,
  bossClip,
  bossSheetSpec,
  aimClear,
  castFit,
  shotDue,
  SHOT_CUE_SECONDS,
  SHOT_CUE_SLIDE,
  castLeadTime,
  castRoom,
  clipLife,
  dieClip,
  flinchFit,
  frameStart,
  enemyClip,
  hitTime,
  shotLead,
  specDuration,
  heroClip,
  isSkidding,
  spitterHurtShows,
  summonFit,
  type BossSnapshot,
  type ClipChoice,
  type EnemySnapshot
} from './clips'
import type { Placed } from './bounds'
import type { FxPool } from './fx'
import { summonPuff } from './fx-map'
import { ENEMY_SPEC, HERO_SPEC, KING_RAGED, MOM_SPEC, bossSpec, type AnimSpec, type BossArt } from '../art/contract'
import {
  FACE_HOLD,
  drawnGain,
  FACE_DEAD_ZONE,
  forgetMotion,
  heldSideFacing,
  newTread,
  shownStanding,
  stepPicture,
  stepTread,
  treadX,
  walkFacing,
  type Tread
} from './tread'

/** Largest squash or stretch (DESIGN.md: ≤ 18 %). */
export const MAX_SQUASH = 0.18

/**
 * A knocked-out enemy's flight, worked out once against the tiles when it goes down (`knockFlight`): it leaves at
 * `vx`, up at `v0` under `gravity`; its sideways travel stops at `tStop` (a wall), and it lands at `T` on the
 * `ground` row (null over a pit: it never lands).
 */
export interface Flight {
  x0: number
  y0: number
  vx: number
  v0: number
  gravity: number
  tStop: number
  T: number | null
  ground: number | null
}

/** Where a flight is `age` seconds after the blow: centre x and feet row (still once it has landed). */
export function flightAt(f: Flight, age: number, out: { x: number; y: number }) {
  const t = f.T === null ? age : Math.min(age, f.T)
  out.x = f.x0 + f.vx * Math.min(t, f.tStop)
  if (f.T !== null && f.ground !== null && age >= f.T - 1e-9) out.y = f.ground
  else {
    const y = f.y0 - f.v0 * t + 0.5 * f.gravity * t * t
    out.y = f.ground !== null && t > f.v0 / Math.max(1e-9, f.gravity) ? Math.min(y, f.ground) : y
  }
  return out
}

interface Ghost {
  sheet: string
  x: number
  y: number
  age: number
  life: number
  flip: boolean
  /** Height of the body, for the closing puff. */
  h: number
  end: 'puff' | 'boom' | 'none'
  clip: string
  /** An enemy's flight (see `Flight`), and the time its clip reaches the first frame drawn lying on the ground. */
  flight?: Flight
  at?: number
  groundFrame?: number
  /** A squirrel knocked out on the step it spat: the release frame of its throw shows in place of the blow. */
  opening?: boolean
  /**
   * A boss's fall from feet row `y0` to the `ground` row that lands at age `at` exactly, on the ghost's own clock so
   * the body and its clip stay together (accelerating from rest, gravity 2·height/at²).
   */
  fall?: { y0: number; ground: number; at: number }
}

/** The feet row of a boss's falling ghost at `age` (exact, so the landing does not depend on the frame rate). */
function ghostFall(f: NonNullable<Ghost['fall']>, age: number) {
  if (age >= f.at - 1e-6) return f.ground
  const k = age / f.at
  return f.y0 + (f.ground - f.y0) * k * k
}

/** A knocked-out enemy's ghost travels this fast (px/s) away from the hero until it lands or meets a wall. */
export const ENEMY_KNOCK_SPEED = 90
/** Knocked out on the ground, an enemy is thrown up this high (px) before it lands on its first lying frame. */
export const ENEMY_KNOCK_HOP = 16
/** Knocked out in the air, an enemy falls from rest under this gravity (px/s²). */
export const ENEMY_KNOCK_GRAVITY = 1300
/** The flight is worked out in steps this long (s); the landing time is then solved exactly. */
const FLIGHT_STEP = 1 / 240
/** A flight is followed this long (s) at most: past it the body has fallen out of the world. */
const FLIGHT_MAX = 4

/**
 * The flight of an enemy knocked out with its feet at (`x`, `feet`), a body `w` × `h`, flung towards `dir`. From the
 * ground it hops `ENEMY_KNOCK_HOP` (less under a ceiling) with the gravity that brings it down on flat ground at
 * `at` exactly; in the air it falls from rest. A solid tile at the body's height stops its sideways travel, and it
 * lands on the first ground under where it is at that moment; over a pit it never lands.
 */
export function knockFlight(
  world: Pick<World, 'solidAt' | 'tileAt' | 'h'>,
  x: number,
  feet: number,
  w: number,
  h: number,
  dir: 1 | -1,
  at: number
): Flight {
  const below = groundBelow(world, x, feet, world.h)
  // A bite lifts its victim a few px before it goes down: that is still a blow on the ground.
  const drop = below === null ? Infinity : Math.max(0, below - feet)
  const y0 = feet
  let v0 = 0
  let gravity = ENEMY_KNOCK_GRAVITY
  if (drop <= ENEMY_KNOCK_HOP) {
    let hop = ENEMY_KNOCK_HOP
    const tx = Math.floor(x / TILE)
    for (let up = 1; up <= ENEMY_KNOCK_HOP; up++)
      if (world.solidAt(tx, Math.floor((y0 - h - up) / TILE))) {
        hop = up - 1
        break
      }
    hop = Math.max(2, hop)
    // Up `hop` px and down to the ground `drop` px below, in `at` seconds on flat ground.
    const root = (Math.sqrt(2 * hop) + Math.sqrt(2 * hop + 2 * drop)) / at
    gravity = root * root
    v0 = Math.sqrt(2 * gravity * hop)
  }
  const vx = dir * ENEMY_KNOCK_SPEED
  const yAt = (t: number) => y0 - v0 * t + 0.5 * gravity * t * t
  const flight: Flight = { x0: x, y0, vx, v0, gravity, tStop: Infinity, T: null, ground: null }
  const pos = { x, y: y0 }
  let prevFeet = y0
  for (let t = FLIGHT_STEP; t <= FLIGHT_MAX; t += FLIGHT_STEP) {
    if (flight.tStop === Infinity) {
      // The leading edge of the body against the tiles at its height.
      const front = x + vx * t + dir * (w / 2)
      const feetNow = yAt(t)
      const tx = Math.floor(front / TILE)
      for (let ty = Math.floor((feetNow - h + 1) / TILE); ty <= Math.floor((feetNow - 1) / TILE); ty++)
        if (world.solidAt(tx, ty)) {
          flight.tStop = Math.max(0, t - FLIGHT_STEP)
          break
        }
    }
    flightAt(flight, t, pos)
    const y = yAt(t)
    if (t > v0 / gravity) {
      const ground = groundBelow(world, pos.x, prevFeet, world.h)
      if (ground !== null && y >= ground) {
        // Solved exactly on the parabola, unless that moment is over another row (the edge of a ledge).
        const exact = (v0 + Math.sqrt(Math.max(0, v0 * v0 + 2 * gravity * (ground - y0)))) / gravity
        flight.ground = ground
        flight.T = Math.min(t, Math.max(t - FLIGHT_STEP, exact))
        flightAt(flight, flight.T, pos)
        if (groundBelow(world, pos.x, ground, 2) !== ground) flight.T = t
        return flight
      }
    }
    prevFeet = y
    if (y > (world.h + 4) * TILE) break
  }
  return flight
}

/**
 * The hero's knocked-out body: knocked up at once by `DIE_HOP_SPEED` (px/s) and falling under `DIE_GRAVITY`
 * (px/s²) to the ground below, where it stays (a hop of 26 px that lands after 0.4 s, the length of the hit and the
 * tumble); over a pit it falls out of the view.
 */
export const DIE_HOP_SPEED = 260
export const DIE_GRAVITY = 1300
/**
 * Knocked out in water, the body takes the water's pace: a small lift (`DIE_WATER_HOP_SPEED` px/s, about 7 px),
 * then it sinks as the simulation lets a body sink there (gravity × 0.28, no faster than `WATER_SINK_SPEED`).
 */
export const DIE_WATER_HOP_SPEED = 80
export const WATER_GRAVITY = GRAVITY * 0.28
export const WATER_SINK_SPEED = 260

/** How a knocked-out body moves: knocked up at `hop` px/s, then falling under `gravity` no faster than `cap`. */
export interface Toss {
  hop: number
  gravity: number
  cap: number
}
export const LAND_TOSS: Toss = { hop: DIE_HOP_SPEED, gravity: DIE_GRAVITY, cap: Infinity }
export const WATER_TOSS: Toss = { hop: DIE_WATER_HOP_SPEED, gravity: WATER_GRAVITY, cap: WATER_SINK_SPEED }

/** The feet row of a body tossed from feet row `y0`, `age` seconds after the blow (before it lands). */
export function tossY(toss: Toss, y0: number, age: number) {
  const capped = (toss.hop + toss.cap) / toss.gravity
  const t = Math.min(age, capped)
  const y = y0 - toss.hop * t + 0.5 * toss.gravity * t * t
  return age > capped ? y + toss.cap * (age - capped) : y
}

/** Seconds from the blow until a body tossed from feet row `y0` comes down on the ground row `ground` (exact). */
export function dieLandTime(y0: number, ground: number, toss: Toss = LAND_TOSS) {
  const { hop, gravity, cap } = toss
  const drop = Math.max(0, ground - y0)
  const free = (hop + Math.sqrt(hop * hop + 2 * gravity * drop)) / gravity
  const capped = (hop + cap) / gravity
  if (free <= capped) return free
  return capped + (ground - tossY(toss, y0, capped)) / cap
}

interface Fall {
  x: number
  /** Feet row where the body was hit, and the ground row below it (null over a pit). */
  y0: number
  ground: number | null
  /** Seconds since the hit (view time: a hit-stop holds it), and when the body touched the ground (or null). */
  age: number
  landAt: number | null
  flip: boolean
  h: number
  /** On land or in water. */
  toss: Toss
}

/** Seconds of the king's transformation (`rage`). */
const specDurationOfRage = (boss: Boss) => specDuration(bossSpec(boss.def.art as BossArt).rage)

/** A boss charging or diving faster than this (px/s) leaves speed ghosts. */
export const GHOST_SPEED = 260
/** Display frames old and opacity of the two after-images of a fast boss, oldest first. */
export const TRAIL_AGES = [4, 2] as const
export const TRAIL_ALPHAS = [0.15, 0.3] as const
/** The boss's defeat ghost lives this long (s) after its clip has played, so it can fade and burst. */
export const BOSS_DEFEAT_TAIL = 0.5
/** The skid pose ends this long (s) after the braking does. */
export const SKID_TAIL = 0.08
/** A hit (or a crash into a wall) jolts the boss's sprite this far (px), easing back over `BOSS_JOLT_SECONDS`. */
export const BOSS_JOLT_PX = 3
export const BOSS_JOLT_SECONDS = 0.12
/** A boss skidding to a stop on the ground kicks up a puff of dust this often (s). */
export const SKID_DUST_EVERY = 0.06
/** A walker that stands faces the hero when he is this close (px, the simulation's chase range). */
export const CHASE_RANGE = 260

/** The sideways offset (px, whole pixels) of a boss sprite `age` seconds after a hit that pushed it towards `dir`. */
export function bossJolt(age: number, dir: number) {
  if (age < 0 || age >= BOSS_JOLT_SECONDS) return 0
  const k = 1 - age / BOSS_JOLT_SECONDS
  return Math.sign(dir) * Math.round(BOSS_JOLT_PX * k * k)
}

/**
 * The last few positions of a body in a fixed ring (no allocation per frame). `at(age)` is the position `age`
 * pushes ago (0 is the latest); `has(age)` tells whether the history reaches that far.
 */
export class PositionTrail {
  private xs: Float64Array
  private ys: Float64Array
  private count = 0
  private head = 0
  constructor(readonly size = 5) {
    this.xs = new Float64Array(size)
    this.ys = new Float64Array(size)
  }
  push(x: number, y: number) {
    this.head = (this.head + 1) % this.size
    this.xs[this.head] = x
    this.ys[this.head] = y
    this.count = Math.min(this.size, this.count + 1)
  }
  clear() {
    this.count = 0
  }
  has(age: number) {
    return age < this.count
  }
  x(age: number) {
    return this.xs[(this.head - age + this.size * 2) % this.size]
  }
  y(age: number) {
    return this.ys[(this.head - age + this.size * 2) % this.size]
  }
}

/**
 * The side a boss's shot really goes: sim.ts aims it from where the boss was when it left (the `boss-shoot` event's
 * x, his centre then), against the hero's `x` (the left of his box) after the step.
 */
export const shotSide = (heroX: number, shotX: number, bossW: number): 1 | -1 => (heroX > shotX - bossW / 2 ? 1 : -1)

/** Who staging can pose. */
export type PoseTarget = 'hero' | 'boss'

/** A staged clip: shown from its first frame for a while, on real time (it plays while the simulation is held). */
interface Pose {
  clip: string
  start: number
  until: number
  /** Height of an optional hop (px) and its length (s). */
  hop: number
  hopSeconds: number
  /**
   * An update has gone by since it was set. The body the update of that same frame reads is the one the step before
   * the pose left (a moment that holds the simulation from the step that set it), so only a later one can end it.
   */
  seen: boolean
  /**
   * A clip the pose plays first, on real time from its time `from` for `seconds` (a bite under way when a moment
   * holds the simulation plays out), or null.
   */
  lead: { clip: string; from: number; seconds: number } | null
  /** The way the actor faces in the pose (0: his own). */
  face: 0 | 1 | -1
}

/** A handle on a staged pose, so the moment that set it can end it (and only it). */
export type PoseToken = object

/**
 * The hero brought down after a clear touched in the air (the simulation has stopped): he falls from where he was
 * to the ground below, then cheers.
 */
interface ClearDrop {
  x: number
  y0: number
  vy0: number
  ground: number
  age: number
  /** When he touched down (age), or null while he falls. */
  landAt: number | null
}

/** A clear touched this far (px) or less above the ground is not a fall. */
const CLEAR_DROP_MIN = 2

interface EnemyTimers {
  onGround: boolean
  landAge: number
  /** What the body does along the ground. */
  tread: Tread
  /** The drawn facing, and seconds since it last turned. */
  face: 1 | -1
  faceAge: number
  /** Ground covered the way it is drawn facing (its walk plays by it). */
  gain: number
  /** The action clip it was drawn with on the last update ('' for none). */
  action: string
  /** The last hit shows as `hurt` (else as the white flash only). */
  hurtShown: boolean
  /** The simulation time of its last spit (NaN before any). */
  spitAt: number
  /** A rat or a mole drawn in the air: from when it is `aloft` until it is back on the ground. */
  air: boolean
  /**
   * A squirrel's throw begun again facing the other side (see `EnemySnapshot.throwFrom`): the shot timer it began
   * again at, or the view time it began again at while it waits loaded; and whether its acorn left the other way
   * (its follow-through does not show).
   */
  throwFrom: number | undefined
  throwAgainAt: number | null
  throwCut: boolean
  /** In the air: the furthest point its body has reached the way it faces (it turns once it is well back from it). */
  airX: number
  /** It has turned once in this fall: it does not turn again before it lands (a body zigzagging over the hero). */
  airTurned: boolean
  /**
   * A summoned enemy is drawn only once the simulation has settled where it is (see `settleBirth`): its age
   * (`enemy.t`) and place when the view first saw it, the age at which a step put it somewhere else (NaN: none), and
   * whether it shows.
   */
  bornT: number
  bornX: number
  bornY: number
  pushedT: number
  shown: boolean
}

/**
 * A summoned enemy that a step moves further than this (px) beyond what its own speed carries it was put there (the
 * simulation pushing it out of the solid it was born in), not carried.
 */
export const BIRTH_SLACK_PX = 4
/** A rat or a mole in the air turns once its body has gone this far (px) the other way. */
export const AIR_TURN_PX = 4
/** One simulation step (s), and the steps after its birth a summoned enemy is shown at the latest. */
const SIM_STEP = 1 / 60
export const BIRTH_SETTLE_STEPS = 3
/**
 * A summoned enemy born overlapping a solid that the simulation does not push out (it stands on the floor in the
 * raised gate's column and walks out of it) is shown once it is out, or after this long (s) at the latest: the
 * slowest minion (the squirrel, 52 px/s) walking its whole width (46 px) out of it takes 0.88 s, so it never stays
 * unseen longer than a body that walks out would, even when it does not walk out at all.
 */
export const BIRTH_SOLID_SECONDS = 1

/** Whether a body's box, but for a pixel at its edges, overlaps a solid tile. */
export function boxInSolid(world: Pick<World, 'solidAt'>, body: { x: number; y: number; w: number; h: number }) {
  for (let ty = Math.floor((body.y + 1) / TILE); ty <= Math.floor((body.y + body.h - 2) / TILE); ty++)
    for (let tx = Math.floor((body.x + 1) / TILE); tx <= Math.floor((body.x + body.w - 2) / TILE); tx++)
      if (world.solidAt(tx, ty)) return true
  return false
}

/**
 * A hero within this many px of the ground under him and moving up or down no faster than this (px/s) is standing
 * (see `heroRests`): the first steps of a stage settle him by a pixel or two.
 */
export const HERO_REST_PX = 3
export const HERO_REST_SPEED = 60

/** Squash/stretch scale factors for a value s in [−MAX, MAX] (s > 0 stretches); volume preserving. */
export function squashScale(s: number, out = { sx: 1, sy: 1 }) {
  const c = Math.max(-MAX_SQUASH, Math.min(MAX_SQUASH, s))
  out.sx = 1 / (1 + c)
  out.sy = 1 + c
  return out
}

/** What the enemies' clip choice reads, refilled for each enemy drawn. */
const enemySnapshot: EnemySnapshot = {
  kind: 'walker',
  vx: 0,
  vy: 0,
  onGround: true,
  hitFlash: 0,
  shootTimer: 0,
  landAge: 99,
  gain: 0,
  standing: false,
  time: 0
}
const squash: { sx: number; sy: number } = { sx: 1, sy: 1 }
/** Where a ghost is, refilled for each ghost. */
const ghostPos = { x: 0, y: 0 }
/** What the boss's clip choice reads, refilled every frame. */
const bossSnapshot: BossSnapshot = {
  kind: 'brute',
  state: 'idle',
  prevState: null,
  stateTime: 0,
  active: false,
  vx: 0,
  vy: 0,
  speed: 100,
  phase: 1,
  rageAge: null,
  hurtAge: null,
  onGround: true,
  shotTimer: 99,
  castAge: null,
  volleyCut: false,
  dashAge: null,
  dashGain: 0,
  gain: 0,
  standing: false,
  time: 0
}

/** The clips a boss travels in (a dash, a skim, a leap): they face the way he goes. */
const isDashClip = (name: string) => name === 'attack' || name === 'sweep' || name === 'air'
/** The boss clips timed from the start of the state they show in (see `BossSnapshot.clipFrom`). */
const STATE_TIMED: readonly string[] = ['windup', 'recover', 'stunned', 'land', 'tired']
/** The boss kinds that walk at the hero in `idle`. */
const WALKERS: readonly string[] = ['tank', 'swarm', 'final']
/** Boss states whose drawn facing follows his travel. */
const TRAVEL_STATES: readonly BossState[] = ['charge', 'dive', 'slam', 'recover', 'stunned', 'tired']

/** The y of the ground under (x, feetY), looking down at most `maxTiles`; null over a pit. */
export function groundBelow(world: Pick<World, 'solidAt' | 'tileAt' | 'h'>, x: number, feetY: number, maxTiles = 6) {
  const tx = Math.floor(x / TILE)
  const start = Math.max(0, Math.floor((feetY - 2) / TILE))
  for (let ty = start; ty < Math.min(world.h, start + maxTiles); ty++) {
    if (ty * TILE < feetY - 2) continue
    if (world.solidAt(tx, ty) || world.tileAt(tx, ty) === T.PLATFORM) return ty * TILE
  }
  return null
}

/**
 * Whether no ground lies within `ENEMY_AIR_GAP` px of a body's feet: under its box (the simulation stands a body on
 * any ground under its box) or as far beside it (a walker shaken to and fro at the lip of a ledge slips off it by a
 * pixel or two for a step).
 */
export function aloft(
  world: Pick<World, 'solidAt' | 'tileAt' | 'h'>,
  body: { x: number; y: number; w: number; h: number }
) {
  const feet = body.y + body.h
  return !(
    groundNear(world, body.x - ENEMY_AIR_GAP, feet) ||
    groundNear(world, body.x + body.w / 2, feet) ||
    groundNear(world, body.x + body.w + ENEMY_AIR_GAP, feet)
  )
}

/**
 * An `air` would last no longer than this (s): a body falling (not thrown upward) on to ground this close under it
 * walks or stands on at once (a minion summoned a few px above the ground).
 */
export const AIR_SHORT_SECONDS = 5 / 60

/** Whether a body falling at `vy` (not thrown upward) comes down on ground under its box within `AIR_SHORT_SECONDS`. */
export function landsSoon(
  world: Pick<World, 'solidAt' | 'tileAt' | 'h'>,
  body: { x: number; y: number; w: number; h: number },
  vy: number
) {
  if (vy < 0) return false
  const feet = body.y + body.h
  const gap = Math.min(
    groundGap(world, body.x - ENEMY_AIR_GAP, feet),
    groundGap(world, body.x + body.w / 2, feet),
    groundGap(world, body.x + body.w + ENEMY_AIR_GAP, feet)
  )
  if (gap === Infinity) return false
  const t = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, gap))) / GRAVITY
  return t <= AIR_SHORT_SECONDS
}

function groundGap(world: Pick<World, 'solidAt' | 'tileAt' | 'h'>, x: number, feet: number) {
  const ground = groundBelow(world, x, feet, 2)
  return ground === null ? Infinity : ground - feet
}

function groundNear(world: Pick<World, 'solidAt' | 'tileAt' | 'h'>, x: number, feet: number) {
  const ground = groundBelow(world, x, feet, 2)
  return ground !== null && ground - feet <= ENEMY_AIR_GAP
}

/** The gathering light of a boss's next shot as it is drawn (see `ActorsView.shotCue`). */
export interface ShotCue {
  /** The sheet it is drawn from (`prop:orb`, `prop:stinger`, `prop:feather`); its clip is `gather`. */
  sheet: string
  /** 0 … 1 through the gathering (1: the shot is about to leave). */
  progress: number
  /** Where it is drawn (world px). */
  x: number
  y: number
  /** Where between the two edges of his body it sits: -1 his left edge … 1 his right edge. */
  side: number
}

/** The last step before a shot (s): the light is full there. */
const CUE_LAST_STEP = 1 / 60
const newShotCue = (): ShotCue => ({ sheet: '', progress: 0, x: 0, y: 0, side: 0 })
const shotCueScratch = newShotCue()
/** The sheet of the gathering light of each boss that throws or casts (sim.ts `bossSkin`; the king has none). */
const CUE_SHEETS: Record<string, string> = {
  crowBoss: 'prop:feather',
  foxBoss: 'prop:orb',
  beeBoss: 'prop:stinger'
}

export class ActorsView {
  private time = 0
  // hero timers
  private squash = 0
  private airTime = 0
  private landAge = 99
  private hardLanding = false
  private distance = 0
  private idleTime = 0
  private blinkAge = 99
  private nextBlink = 2.5
  private skidAge: number | null = null
  /** Whether the hero was braking on the last update (a new skid starts from frame 0). */
  private skidding = false
  private skidTail = 0
  private clearDrop: ClearDrop | null = null
  private turnAge: number | null = null
  private lastFacing: 1 | -1 = 1
  private cheerAt: number | null = null
  private waterTime = 0
  private lastRunFrame = -1
  private wasGround = true
  private death: Fall | null = null
  /**
   * The hero's actions that something else has replaced: they do not come back (the bite and the hurt until the
   * next one begins, the landing until the next landing, the fidget until the next one is due).
   */
  private biteGone = false
  private hurtGone = false
  /** The way the hero's last hurt faced (towards the blow: he is thrown back, away from it). */
  private hurtFace: 1 | -1 = 1
  private landGone = false
  private waitCut = -1
  /** The first update has run: an enemy seen from then on was summoned during play. */
  private started = false
  // enemies and bosses
  private enemyTimers = new Map<number, EnemyTimers>()
  private ghosts: Ghost[] = []
  private bossPrev: BossState | null = null
  private bossLast: BossState | null = null
  private rageAt: number | null = null
  /**
   * View time the boss's flinch began (a hit-stop holds it), or null when none is playing, and the seconds it is
   * played over (its whole clip, faster when it has less time).
   */
  private flinchAt: number | null = null
  private flinchSeconds = 0
  /** View time and direction of the last jolt (a hit, away from the hero; a crash, away from the wall). */
  private joltAt: number | null = null
  private joltDir: 1 | -1 = 1
  /**
   * The boss's throw, cast or summon gesture: `lead` while its lead-in runs up to the shot (played over `castFrom`
   * seconds, the time there was when it began), `release` from the shot (view time `castAt`) to the end of the
   * follow-through (played over `castTail` seconds). `castRefused`: the coming shot leaves without a pose (the
   * transformation cut its pose).
   */
  private cast: 'none' | 'lead' | 'release' = 'none'
  private castAt = 0
  /** The shot (or summon) has just left: its follow-through is timed from the first frame that shows it. */
  private castFresh = false
  /** The length of the last display frame with time passing (s). */
  private frameDt = 1 / 60
  private castFrom = 0
  private castTail = 0
  private castRefused = false
  /** The side the shot went (the facing is kept there while the cast plays out), or 0. */
  private castSide: 0 | 1 | -1 = 0
  /** The side the lead-in of the cast faces (its aim), and how often it began again for this shot (once at most). */
  private castAim: 1 | -1 = 1
  private castRestarts = 0
  /** Counts for tests and the review kit: lead-ins given up, and lead-ins begun again. */
  readonly castStats = { givenUp: 0, begunAgain: 0 }
  /** A landing a cut ended (the phase change, a staged pose) is over for good until he touches down again. */
  private landCut = false
  /** The gathering light is drawn mirrored (it last sat to the left of his middle). */
  private cueMirror = false
  /** The transformation cut the king's volley: its follow-through does not come back. */
  private volleyCut = false
  /** View time his last dash began, and his tread's gain then. */
  private dashAt: number | null = null
  private dashGain = 0
  private bossTread = newTread(-1)
  private bossFace: 1 | -1 = -1
  /** The boss's drawn facing has been set from where the hero is (he starts out facing him). */
  private bossFaced = false
  /** Ground the boss has covered the way he is drawn facing (his walk and his gallop play by it). */
  private bossGain = 0
  private bossFaceAge = 99
  /** The action clip the boss was drawn with on the last update ('' for none). */
  private bossAction = ''
  /** The boss turned to his shot on this step: the step's own facing rule does not undo it. */
  private faceSnapped = false
  private dustTimer = 0
  /** The state time the clip timed from the state's start took over at, and the clip of the last update. */
  private clipFrom = 0
  private clipLast = ''
  /**
   * The time on his state's own clock (`ownTime`) at which the boss's landing began inside his state (0 with the
   * state; in his slam, the step after he touched down; before 0: it began before the state did, and plays on), and
   * whether he was grounded.
   */
  private bossLandedAt = 0
  /**
   * The simulation time his state began at, and whether the phase change has restarted the state's clock since: a
   * landing and a volley's follow-through then run on in their own time from their own cause (`ownTime`).
   */
  private stateStart = 0
  private stateReset = false
  /**
   * How far the king's gathering had come (0–1 of its frames before the release) when the phase change restarted his
   * `shoot` (it goes on from there, its frames left sharing the time up to the volley), and the frame it last showed.
   */
  private gatherFrom = 0
  private gatherFrame = 0
  /** The simulation time the landing of the last slam began (the step after he touched down), when it is known. */
  private slamLandWorld: number | null = null
  private bossGrounded = true
  /** The king has transformed: once his `rage` is over he is drawn from his raged sheet. */
  private phased = false
  /** The transformation is left to a staged pose that has not begun yet (see `stageRage`). */
  private ragePending = false
  /** Where the boss was over the last display frames, while it charges or dives fast (speed ghosts). */
  private trail = new PositionTrail(TRAIL_AGES[0] + 1)
  /** The last update was a hit-stop (no time passed): the speed ghosts are skipped. */
  private held = false
  /** Real seconds (advances while the simulation is held or slowed; staged poses run on it). */
  private realTime = 0
  private poses: Partial<Record<PoseTarget, Pose>> = {}
  /** What `poseClip` hands back (filled for each call). */
  private poseNow = { name: '', t: 0 }
  /** The last hero clip, for tests and debugging. */
  heroChoice: ClipChoice = { name: 'idle', t: 0 }

  constructor(
    private world: World,
    private fx: FxPool,
    /** Called once per pass of the run cycle, on its first contact frame (footstep sound). */
    private onFootstep: () => void = () => {},
    /** Reduced motion: no speed ghosts, no hit jolt, no skid dust. */
    private reducedMotion = false
  ) {}

  // ------------------------------------------------------------------------------------------- staging hooks

  /**
   * Staging: `who` shows `clip` from its first frame for `seconds` of real time (a clip that does not loop holds
   * its last frame, or keeps cycling its last `sustain` frames). `hop` lifts the actor on a parabola of that height
   * over `hopSeconds`. A clip the actor's sheet does not have is ignored when drawing. A staged pose that shows a
   * clip should last at least `clipLife` of it, so none of its frames is cut.
   */
  pose(
    who: PoseTarget,
    clip: string,
    seconds: number,
    options: { hop?: number; hopSeconds?: number; face?: 1 | -1 } = {}
  ): PoseToken {
    const pose: Pose = {
      clip,
      start: this.realTime,
      until: this.realTime + Math.max(0, seconds),
      hop: options.hop ?? 0,
      hopSeconds: options.hopSeconds ?? 0.35,
      seen: false,
      lead: null,
      face: options.face ?? 0
    }
    this.poses[who] = pose
    if (who === 'boss' && clip === 'rage') {
      this.ragePending = false
      // The phase-2 transformation is staged: the sim-time rage clip must not play a second time afterwards, and
      // nothing of a flinch, a cast or a volley that it cut shows after it.
      this.rageAt = null
      this.flinchAt = null
      this.dropCast()
      this.castRefused = true
      const boss = this.world.boss
      if (boss && boss.state === 'recover' && this.bossPrev === 'shoot') this.volleyCut = true
    }
    return pose
  }

  /**
   * Staging: the phase-2 transformation that just began will be staged (a `rage` pose, maybe after a wait for him to
   * land): until then he goes on with his fight on his plain sheet, and the transformation is not played on the
   * simulation's time.
   */
  stageRage() {
    this.rageAt = null
    this.ragePending = true
  }

  /** Ends the pose `token` stands for, if it is still up (a later pose is left alone). */
  unposeIf(who: PoseTarget, token: PoseToken) {
    if (this.poses[who] === token) this.endPose(who)
  }

  /** Ends a staged pose early (or every pose). */
  unpose(who?: PoseTarget) {
    if (who) this.endPose(who)
    else {
      this.endPose('hero')
      this.endPose('boss')
    }
  }

  /**
   * Ends `who`'s pose. A hero posed facing the other way than his own (turned to ハム姫 for his cheer) turns back
   * as he does when the player turns him on the spot (`turn`), not in one frame.
   */
  private endPose(who: PoseTarget) {
    const pose = this.poses[who]
    if (!pose) return
    delete this.poses[who]
    if (who === 'hero' && pose.face !== 0 && pose.face !== this.world.player.facing) this.turnAge = 0
    // The state's clock stood still while the pose played: what shows next begins, it does not resume.
    const boss = this.world.boss
    if (who === 'boss' && boss && !boss.dead) this.cutState(boss.stateTime)
  }

  /**
   * Whether a landing cut on the ground in his slam (he touched down while a moment held him, or on the step of the
   * phase change) stays cut into the recovery that follows: there is no new touchdown to land on.
   */
  private carriesCut(state: BossState, before: BossState | null) {
    return this.landCut && state === 'recover' && before === 'slam'
  }

  /**
   * A cut in the boss's state (the phase change restarts its clock; a staged pose held it): a landing or a
   * follow-through that was showing or over is over for good, and the clips timed from the state's start (a wind-up,
   * a recovery, the king's gathering) begin again from their first frame at state time `from`.
   */
  private cutState(from: number) {
    this.landCut = true
    // (A volley still gathering in `shoot` is not over: its release and follow-through come with it.)
    if (this.world.boss?.state !== 'shoot') this.volleyCut = true
    this.clipFrom = from
    this.clipLast = ''
    this.bossLandedAt = from
    this.gatherFrom = 0
  }

  /**
   * Staging: the hero stands (`idle`) for `seconds` of real time while a moment holds the simulation, facing
   * `face` (0: his own way), but finishes what he is doing first: a bite that shows plays out from the frame it is
   * on, at its own speed (the simulation is held: the view carries it). Anything else gives way at once.
   */
  standStill(seconds: number, face: 0 | 1 | -1 = 0): PoseToken {
    const live = this.death || this.world.player.dead || this.dropping() ? null : this.heroSnapshot()
    const pose = this.pose('hero', 'idle', seconds, face ? { face } : {}) as Pose
    if (live?.name === 'bite') {
      const rest = specDuration(HERO_SPEC.bite) - live.t
      if (rest > 0) pose.lead = { clip: 'bite', from: live.t, seconds: rest }
    }
    return pose
  }

  /** The clip a pose shows now and the time into it (a lead clip first, then its own from its first frame). */
  private poseClip(pose: Pose) {
    const age = this.realTime - pose.start
    const lead = pose.lead
    const now = this.poseNow
    if (lead && age < lead.seconds) {
      now.name = lead.clip
      now.t = lead.from + age
    } else {
      now.name = pose.clip
      now.t = lead ? age - lead.seconds : age
    }
    return now
  }

  /** The clip `who` is posed in right now, or null. */
  posing(who: PoseTarget): string | null {
    const pose = this.poses[who]
    return pose && this.realTime < pose.until ? this.poseClip(pose).name : null
  }

  /** Advances real time (the stage view calls this with the frame's real dt). */
  tickReal(dt: number) {
    this.realTime += dt
    // The time since a body last turned runs on real time: a turn twice in a moment is a flicker on the screen,
    // whether or not a hit-stop holds the simulation in between.
    this.bossFaceAge += dt
    for (const timers of this.enemyTimers.values()) timers.faceAge += dt
    // A staged hero pose plays on real time, and so does the squash it is drawn with: a moment that holds the
    // simulation from the step he landed on would otherwise keep him flattened until it ends.
    if (this.poses.hero) this.relaxSquash(dt)
    for (const who of ['hero', 'boss'] as const) {
      const pose = this.poses[who]
      if (pose && this.realTime >= pose.until) this.endPose(who)
    }
  }

  /** The hero's squash and stretch eases back to none over `dt` seconds. */
  private relaxSquash(dt: number) {
    this.squash *= Math.exp(-dt * 12)
    if (Math.abs(this.squash) < 0.004) this.squash = 0
  }

  /** The centre of the hero's knocked-out body (null while he lives). */
  deathPoint(): { x: number; y: number } | null {
    const d = this.death
    return d ? { x: d.x, y: this.deathFeet(d) - d.h / 2 } : null
  }

  /** Where the hero's knocked-out body comes to lie (its centre): null while he lives, and over a pit. */
  deathRest(): { x: number; y: number } | null {
    const d = this.death
    return d && d.ground !== null ? { x: d.x, y: d.ground - d.h / 2 } : null
  }

  /**
   * The centre of the hero's body: where he stands, or where a clear touched in the air brings him down to (null
   * after his knock-out: see `deathPoint`).
   */
  heroPoint(): { x: number; y: number } | null {
    const p = this.world.player
    if (this.death) return null
    const drop = this.clearDrop
    return drop ? { x: drop.x, y: this.dropFeet(drop) - p.h / 2 } : { x: p.x + p.w / 2, y: p.y + p.h / 2 }
  }

  /** Where the hero comes to stand after a clear (his centre): on the ground below a clear touched in the air. */
  heroRest(): { x: number; y: number } {
    const p = this.world.player
    const drop = this.clearDrop
    return drop ? { x: drop.x, y: drop.ground - p.h / 2 } : { x: p.x + p.w / 2, y: p.y + p.h / 2 }
  }

  private dropFeet(d: ClearDrop) {
    if (d.landAt !== null) return d.ground
    return Math.min(d.ground, d.y0 + d.vy0 * d.age + 0.5 * GRAVITY * d.age * d.age)
  }

  /** The centre of the knocked-out boss's body as it falls and lies (null when there is none). */
  bossBodyPoint(): { x: number; y: number } | null {
    for (const g of this.ghosts) if (g.end === 'boom') return { x: g.x, y: g.y - g.h / 2 }
    return null
  }

  /** The feet row of the knocked-out body: on its parabola, then on the ground it landed on. */
  private deathFeet(d: Fall) {
    if (d.landAt !== null && d.ground !== null) return d.ground
    const y = tossY(d.toss, d.y0, d.age)
    // A body knocked up from just above its ground row never dips below it on the way down.
    return d.ground !== null ? Math.min(y, Math.max(d.ground, d.y0)) : y
  }

  private activePose(who: PoseTarget, sheet: string) {
    const pose = this.poses[who]
    if (!pose || this.realTime >= pose.until) return null
    const { name, t } = this.poseClip(pose)
    const anim = clip(sheet, name)
    if (!anim) return null
    const age = this.realTime - pose.start
    const k = pose.hop > 0 && age < pose.hopSeconds ? age / pose.hopSeconds : -1
    const lift = k >= 0 ? Math.round(4 * pose.hop * k * (1 - k)) : 0
    return { anim, age: t, lift, name, face: pose.face }
  }

  handle(event: SimEvent) {
    const p = this.world.player
    switch (event.type) {
      case 'jump':
        this.squash = 0.16
        break
      case 'land': {
        const k = Math.min(1, event.speed / 900)
        this.squash = -MAX_SQUASH * Math.max(0.35, k)
        this.landAge = 0
        this.hardLanding = event.speed > HARD_LANDING
        this.landGone = false
        break
      }
      case 'bite':
        this.squash = -0.1
        this.biteGone = false
        break
      case 'clear': {
        this.cheerAt = this.time
        // Touched in the air: he comes down first (the simulation has stopped), then cheers.
        const x = p.x + p.w / 2
        const feet = p.y + p.h
        const ground = groundBelow(this.world, x, feet, this.world.h)
        if (ground !== null && ground - feet > CLEAR_DROP_MIN)
          this.clearDrop = { x, y0: feet, vy0: Math.max(0, p.vy), ground, age: 0, landAt: null }
        break
      }
      case 'hurt':
        this.hurtGone = false
        this.hurtFace = event.dir > 0 ? -1 : 1
        // The player's own body takes over from a staged pose (see `update`).
        if (this.world.state === 'play') delete this.poses.hero
        break
      case 'dead': {
        const x = p.x + p.w / 2
        const y0 = p.y + p.h
        this.death = {
          x,
          y0,
          // Standing on the ground (his box on it, though his centre may be past the edge of a ledge) he comes to lie
          // on that ground; in the air, on whatever is below him.
          ground: p.onGround ? y0 : groundBelow(this.world, x, y0, this.world.h),
          age: 0,
          landAt: null,
          flip: p.facing < 0,
          h: p.h,
          toss: p.inWater ? WATER_TOSS : LAND_TOSS
        }
        break
      }
      case 'enemy-hit': {
        const enemy = this.world.enemies.find((e) => e.id === event.id)
        if (!enemy) break
        // A bite a squirrel survives during its throw (or just before it) is the white flash over the throw.
        const timers = this.timersOf(enemy)
        timers.hurtShown =
          enemy.kind !== 'spitter' || spitterHurtShows(enemy.shootTimer, ENEMY_SPEC.spitter.shoot, timers.throwCut)
        break
      }
      case 'spit': {
        const enemy = this.world.enemies.find((e) => e.id === event.id)
        if (!enemy) break
        const timers = this.timersOf(enemy)
        timers.spitAt = this.world.time
        if (timers.face === event.dir) {
          // Its release, facing the shot.
          timers.action = 'shoot'
          break
        }
        // The hero crossed on the very step of the spit: no release frame turned round, no follow-through; it stands,
        // turned to the acorn's side (not straight after another turn).
        timers.throwCut = true
        timers.action = ''
        if (timers.faceAge >= FACE_HOLD) {
          timers.face = event.dir
          timers.faceAge = 0
        }
        break
      }
      case 'enemy-down':
        this.knockOut(event)
        break
      case 'boss-down': {
        const boss = this.world.boss
        if (!boss) break
        const spec = boss.def.kind === 'chaser' ? MOM_SPEC : bossSpec(boss.def.art as BossArt)
        const x = boss.x + boss.w / 2
        const y = boss.y + boss.h
        // A boss knocked out in the air falls to the ground below and lands on the first frame drawn lying there
        // (over a pit he stays where he is; he bursts at the end anyway).
        const ground = groundBelow(this.world, x, y, this.world.h)
        const groundFrame = BOSS_DEFEAT_GROUND_FRAME[boss.def.art as BossArt]
        const fall =
          ground !== null && ground > y + 0.5 && spec.defeat && groundFrame !== undefined
            ? { y0: y, ground, at: frameStart(spec.defeat, groundFrame) }
            : undefined
        this.ghosts.push({
          sheet: boss.def.art,
          clip: 'defeat',
          x,
          y,
          age: 0,
          life: clipLife(spec.defeat ?? spec.hurt, BOSS_DEFEAT_TAIL),
          flip: this.bossFace < 0,
          h: boss.h,
          end: 'boom',
          fall
        })
        break
      }
      case 'boss-hit': {
        const boss = this.world.boss
        this.joltAt = this.time
        if (boss) {
          this.joltDir = boss.x + boss.w / 2 >= p.x + p.w / 2 ? 1 : -1
          // The flinch is decided now: it starts (again from its first frame), fitted to the time there is.
          const seconds = flinchFit(this.fillBoss(boss), bossSheetSpec(boss.def.kind, boss.def.art))
          if (seconds > 0) {
            this.flinchAt = this.time
            this.flinchSeconds = seconds
            this.dropCast()
          }
        }
        break
      }
      case 'boss-crash':
        // The body answers the crash, stunned or not: a jolt back from the wall it ran into.
        this.joltAt = this.time
        this.joltDir = event.dir > 0 ? -1 : 1
        break
      case 'boss-shoot': {
        const boss = this.world.boss
        if (!boss) break
        const side = shotSide(p.x, event.x, boss.w)
        if (this.cast === 'lead') {
          if (side === this.castAim) {
            this.cast = 'release'
            this.castFresh = true
            this.castSide = side
          } else {
            // The hero crossed on the very step of the shot: no release frame turned round, no follow-through.
            this.dropCast()
            this.castStats.givenUp++
          }
        }
        // A shot that leaves without a pose: the next shot is decided afresh.
        this.castRefused = false
        this.castRestarts = 0
        // His light was on the shot's side: his body turns to it only where that is a clean turn (never the
        // king's, whose fan goes both ways; not in a dash, not in an action, the hero clearly on that side, and not
        // straight after another turn). Otherwise he keeps his facing.
        if (this.cast === 'release') this.faceSnapped = true
        else if (boss.def.kind !== 'final' && side !== this.bossFace && this.bossFaceAge >= FACE_HOLD) {
          const name = this.bossChoice(boss).name
          const action = name === 'hurt' || name === 'shoot' || name === 'land' || name === 'rage'
          const clear = Math.abs(event.x - boss.w / 2 - p.x) > aimClear(boss.def.speed)
          if (!isDashClip(name) && !action && clear) {
            this.bossFace = side
            this.bossFaceAge = 0
            this.faceSnapped = true
          }
        }
        break
      }
      case 'minion': {
        const boss = this.world.boss
        // The summon is the cast gesture from its release on: where he can show it and it fits (as a cast).
        if (boss && this.cast === 'none' && !this.flinching()) {
          const tail = summonFit(this.fillBoss(boss), bossSheetSpec(boss.def.kind, boss.def.art))
          if (tail > 0) {
            this.cast = 'release'
            this.castFresh = true
            this.castTail = tail
            this.castSide = 0
          }
        }
        break
      }
      case 'boss-phase':
        this.rageAt = this.time
        this.phased = true
        // sim.ts restarts his state's clock on this step, whatever the state. A landing and a follow-through run on
        // their own clock (`ownTime`) and play out through it; what is timed from the state's start (a wind-up, a
        // recovery, his gathering) begins again from its first frame, as his body does.
        this.stateReset = true
        this.clipFrom = 0
        this.clipLast = ''
        // (His gathering never goes back: it goes on from the frame it showed.)
        if (this.world.boss?.state === 'shoot') {
          const hit = bossSheetSpec(this.world.boss.def.kind, this.world.boss.def.art).shoot?.hit ?? 0
          this.gatherFrom = hit > 0 ? Math.min(1, this.gatherFrame / hit) : 0
        }
        break
      default:
        break
    }
  }

  /** The record of a live enemy (made on first sight). */
  private timersOf(enemy: Enemy): EnemyTimers {
    let timers = this.enemyTimers.get(enemy.id)
    if (!timers) {
      // Summoned during play (seen after the view's first update, a few steps old at most), or there from the start.
      const born = this.started && typeof enemy.t === 'number' && enemy.t < BIRTH_SETTLE_STEPS * SIM_STEP
      this.enemyTimers.set(
        enemy.id,
        (timers = {
          onGround: enemy.onGround,
          landAge: enemy.onGround ? 0 : 99,
          tread: newTread(enemy.facing),
          face: enemy.facing,
          faceAge: 99,
          gain: 0,
          action: '',
          hurtShown: true,
          spitAt: NaN,
          throwFrom: undefined,
          throwAgainAt: null,
          throwCut: false,
          air: false,
          airX: enemy.x + enemy.w / 2,
          airTurned: false,
          bornT: born ? enemy.t : NaN,
          bornX: enemy.x,
          bornY: enemy.y,
          pushedT: NaN,
          shown: !born
        })
      )
    }
    return timers
  }

  /**
   * A summoned enemy is born where `spawnMinion` puts it, which may be inside a solid (the raised gate, a rock): the
   * next step pushes it out. It is shown from the first frame after a whole step has passed since its birth when
   * that step carried it no further than its own speed does (born in the open: at once, one step on); a step that
   * put it elsewhere is waited out, so it shows once a further step has run from where it was put (never in the
   * solid, never smeared through it between steps); at most `BIRTH_SETTLE_STEPS` steps after its birth. One that
   * still overlaps a solid then (the simulation leaves it standing in the gate's column, and it walks out) waits on:
   * it is shown on the first frame its box is out of the solid, or after `BIRTH_SOLID_SECONDS`. It comes with its
   * summon's puff, where it shows; once shown it is never hidden again.
   */
  private settleBirth(enemy: Enemy, timers: EnemyTimers) {
    const age = enemy.t - timers.bornT
    if (age < SIM_STEP / 2) return
    let show = age > BIRTH_SETTLE_STEPS * SIM_STEP - SIM_STEP / 2
    if (Number.isNaN(timers.pushedT)) {
      const carriedX = BIRTH_SLACK_PX + Math.abs(enemy.vx) * age
      const carriedY = BIRTH_SLACK_PX + Math.abs(enemy.vy) * age + 0.5 * GRAVITY * age * age
      const put = Math.abs(enemy.x - timers.bornX) > carriedX || Math.abs(enemy.y - timers.bornY) > carriedY
      if (put) timers.pushedT = enemy.t
      else show = true
    } else if (enemy.t - timers.pushedT > SIM_STEP / 2) show = true
    if (show && age < BIRTH_SOLID_SECONDS - SIM_STEP / 2 && boxInSolid(this.world, enemy)) show = false
    if (!show) return
    timers.shown = true
    // Whether it shows in the air is decided afresh where it shows (a short drop to the ground is no fall).
    timers.air = this.goesAloft(enemy, false)
    summonPuff(this.fx, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2)
  }

  /**
   * Whether a live enemy is drawn: a summoned one only once the simulation has settled it (`settleBirth`); every
   * other enemy always, where it is (one caught in the column of the arena gate as it rises is drawn there for as
   * long as the simulation has it there, rather than blinking out).
   */
  enemyShown(enemy: Enemy): boolean {
    return this.enemyTimers.get(enemy.id)?.shown ?? true
  }

  /** An enemy knocked out: its ghost flies away from the hero, against the tiles, and lies where it comes down. */
  private knockOut(event: Extract<SimEvent, { type: 'enemy-down' }>) {
    const p = this.world.player
    const enemy = this.world.enemies.find((e) => e.id === event.id)
    const w = enemy?.w ?? 44
    const h = enemy?.h ?? 40
    const x = enemy ? enemy.x + w / 2 : event.x
    const y = enemy ? enemy.y + h : event.y + h / 2
    // Flung away from the hero (from the two centres; the event's `dir` is the enemy's own walking direction),
    // facing him, so the clip's "flung backwards" is backwards.
    const dir = x >= p.x + p.w / 2 ? 1 : -1
    const spec = ENEMY_SPEC[event.kind].defeat
    const groundFrame = ENEMY_DEFEAT_GROUND_FRAME[event.kind]
    const at = frameStart(spec, groundFrame)
    const flight = knockFlight(this.world, x, y, w, h, dir, at)
    const timers = this.enemyTimers.get(event.id)
    this.ghosts.push({
      sheet: event.kind,
      clip: 'defeat',
      x,
      y,
      age: 0,
      // It lives until its clip has played after landing.
      life: flight.T === null ? clipLife(spec) : flight.T + clipLife(spec) - at,
      flip: dir > 0,
      h,
      end: 'puff',
      flight,
      at,
      groundFrame,
      // Knocked out on the very step it spat (compared on the simulation's clock).
      // (Not when the acorn left the other way: it showed no release.)
      opening: event.kind === 'spitter' && timers !== undefined && timers.spitAt === this.world.time && !timers.throwCut
    })
    this.enemyTimers.delete(event.id)
  }

  update(dt: number) {
    this.time += dt
    if (dt > 0) this.frameDt = dt
    const world = this.world
    const p = world.player
    // hero timers (under a staged pose his squash settles on real time: see `tickReal`)
    if (!this.poses.hero) this.relaxSquash(dt)
    if (p.onGround) {
      this.airTime = 0
      this.landAge += dt
    } else {
      this.airTime += this.wasGround ? 0 : dt
    }
    this.wasGround = p.onGround
    if (p.onGround) this.distance += Math.abs(p.vx) * dt
    const still = p.onGround && Math.abs(p.vx) <= RUN_THRESHOLD && p.biteTimer <= 0
    this.idleTime = still ? this.idleTime + dt : 0
    if (!still) this.waitCut = -1
    this.blinkAge += dt
    this.nextBlink -= dt
    if (this.nextBlink <= 0) {
      this.blinkAge = 0
      this.nextBlink = 2 + this.fx.rand() * 2
    }
    // The skid lasts as long as the braking, plus a short tail; a new braking starts it again from frame 0.
    const skidding = isSkidding(p)
    if (skidding) this.skidAge = this.skidding && this.skidAge !== null ? this.skidAge + dt : 0
    else if (this.skidAge !== null) {
      this.skidTail += dt
      this.skidAge += dt
      if (this.skidTail > SKID_TAIL) this.skidAge = null
    }
    if (skidding) this.skidTail = 0
    this.skidding = skidding
    // The hero pivots on the spot when his facing flips on the ground at a walking pace or less.
    if (p.facing !== this.lastFacing) {
      if (p.onGround && Math.abs(p.vx) <= SKID_SPEED) this.turnAge = 0
      this.lastFacing = p.facing
    } else if (this.turnAge !== null) {
      this.turnAge += dt
      if (!p.onGround || this.turnAge > 0.5) this.turnAge = null
    }
    this.waterTime = p.inWater ? this.waterTime + dt : 0
    // While the simulation runs, a staged hero pose ends as soon as his own body does something else (not on the
    // frame that set it: see `Pose.seen`).
    const pose = this.poses.hero
    const moves = Math.abs(p.vx) > RUN_THRESHOLD || !p.onGround || p.biteTimer > 0
    if (pose && !pose.seen) pose.seen = true
    else if (pose && dt > 0 && world.state === 'play' && moves) delete this.poses.hero
    if (this.clearDrop) this.updateDrop(this.clearDrop, dt)
    this.settleHero()
    // enemies
    for (const enemy of world.enemies) {
      if (enemy.dead) continue
      const timers = this.timersOf(enemy)
      if (enemy.onGround && !timers.onGround) timers.landAge = 0
      else timers.landAge += dt
      timers.onGround = enemy.onGround
      const wasAir = timers.air
      timers.air = this.goesAloft(enemy, timers.air)
      // In the air its facing follows where its body has gone, measured from here (see `AIR_TURN_PX`).
      if (timers.air && !wasAir) {
        timers.airX = enemy.x + enemy.w / 2
        timers.airTurned = false
      }
      if (!timers.shown) this.settleBirth(enemy, timers)
      stepTread(timers.tread, enemy.x + enemy.w / 2, dt, enemy.onGround)
      // Only the walkers' picture is ever held still (they walk on the ground).
      stepPicture(timers.tread, enemy.x + enemy.w / 2, dt, enemy.kind === 'walker' || enemy.kind === 'tough')
      if (dt > 0) {
        // An action (a hurt, a throw, a landing) keeps the facing it began with; a throw begins facing where the
        // simulation aims (`enemy.facing`), and its release turns it to the shot's side (`spit`).
        const clipName = this.selectEnemy(enemy).name
        const action = clipName === 'hurt' || clipName === 'shoot' || clipName === 'land'
        const began = action && clipName !== timers.action
        timers.action = action ? clipName : ''
        let face = timers.face
        if (enemy.kind === 'spitter') this.settleThrow(enemy, timers)
        if (action) {
          if (began && clipName === 'shoot') face = enemy.facing
          // A throw whose target has gone to the other side begins again from its first frame, facing it.
          else if (clipName === 'shoot' && enemy.kind === 'spitter') face = this.throwAgain(enemy, timers, face)
          if (enemy.kind === 'walker' || enemy.kind === 'tough') forgetMotion(timers.tread)
        } else if (timers.air) {
          // In the air a rat or a mole faces the way its body has really gone: once it is `AIR_TURN_PX` past the
          // furthest point it reached the way it faces, it turns (the simulation flips its speed on every step while
          // it is over the hero or pinned against a wall: a body that goes nowhere sideways keeps its facing), once in a
          // fall at most (one that zigzags over the hero keeps the way it turned to).
          const x = enemy.x + enemy.w / 2
          if ((x - timers.airX) * face > 0) timers.airX = x
          else if (!timers.airTurned && Math.abs(x - timers.airX) > AIR_TURN_PX) {
            timers.airTurned = true
            face = x > timers.airX ? 1 : -1
            timers.airX = x
          }
        } else face = this.enemyFace(enemy, timers)
        if (face !== timers.face) {
          timers.face = face
          timers.faceAge = 0
        }
        timers.gain += drawnGain(timers.tread, timers.face)
      }
    }
    this.started = true
    this.updateBoss(dt)
    this.updateTrail(dt)
    // ghosts
    for (const g of this.ghosts) {
      g.age += dt
      if (g.flight) {
        flightAt(g.flight, g.age, ghostPos)
        g.x = ghostPos.x
        g.y = ghostPos.y
        // The ground it lies on dug away from under it: it goes (it never lies in the air).
        const landed = g.flight.T
        if (landed !== null && g.age >= landed && groundBelow(world, g.x, g.y, 2) !== g.y)
          g.life = Math.min(g.life, g.age)
      } else if (g.fall) g.y = ghostFall(g.fall, g.age)
      if (g.age >= g.life) {
        if (g.end === 'puff') this.fx.spawn('puff', g.x, g.y - g.h / 2, { layer: 'front' })
        if (g.end === 'boom') {
          this.fx.spawn('boom', g.x, g.y - g.h / 2, { layer: 'front' })
          this.fx.burst('star', g.x, g.y - g.h / 2, 6, { speed: [80, 200], gravity: 300, life: [0.5, 0.9] })
        }
      }
    }
    let kept = 0
    for (const g of this.ghosts) if (g.age < g.life) this.ghosts[kept++] = g
    this.ghosts.length = kept
    if (this.death) {
      const d = this.death
      d.age += dt
      // The body flies on its parabola (exact, so the landing does not depend on the frame rate) until it reaches
      // the ground below, and stays there.
      if (d.landAt === null && d.ground !== null) {
        const at = dieLandTime(d.y0, d.ground, d.toss)
        // (A hair of tolerance: a sum of frame times that should reach the landing time must not miss it.)
        if (d.age >= at - 1e-6) d.landAt = Math.min(at, d.age)
      }
    }
  }

  /**
   * The hero's actions that are due but not drawn now (another clip has taken their place) are dropped for good:
   * a bite that gave way to the run, the air or a hurt does not come back on landing or when the hurt ends, and
   * neither does a landing after a bite or a turn after a landing.
   */
  private settleHero() {
    const p = this.world.player
    if (this.death || p.dead) return
    const name = this.selectHero()?.name
    if (p.biteTimer > 0 && name !== 'bite') this.biteGone = true
    if (this.hurtLive() && name !== 'hurt') this.hurtGone = true
    if (this.hardLanding && this.landAge < specDuration(HERO_SPEC.land) && name !== 'land') this.landGone = true
    if (this.turnAge !== null && name !== 'turn') this.turnAge = null
    if (this.idleTime >= WAIT_AFTER && name !== 'wait') {
      const cycle = Math.floor((this.idleTime - WAIT_AFTER) / WAIT_EVERY)
      if ((this.idleTime - WAIT_AFTER) % WAIT_EVERY < specDuration(HERO_SPEC.wait)) this.waitCut = cycle
    }
  }

  /** The hero's hurt reaction is due (the first moments of invulnerability). */
  private hurtLive() {
    const p = this.world.player
    const hurtFor = INVULN - p.invuln
    return p.invuln > 0 && hurtFor >= 0 && hurtFor < 0.3
  }

  /** The drawn facing of a live enemy (see `enemyFlip`). */
  private enemyFace(enemy: Enemy, timers: EnemyTimers): 1 | -1 {
    const d = this.world.player.x - enemy.x
    // A walker faces the way it goes; once it stands, the hero if he is in its chase range.
    if (enemy.kind === 'walker' || enemy.kind === 'tough')
      return walkFacing(timers.tread, timers.face, d, Math.abs(d) < CHASE_RANGE, timers.faceAge)
    return heldSideFacing(timers.face, d, timers.faceAge)
  }

  /** Brings the hero down after a clear touched in the air; the cheer starts from its first frame on the ground. */
  private updateDrop(d: ClearDrop, dt: number) {
    d.age += dt
    if (d.landAt !== null) return
    if (d.y0 + d.vy0 * d.age + 0.5 * GRAVITY * d.age * d.age < d.ground) return
    d.landAt = d.age
    const speed = d.vy0 + GRAVITY * d.age
    this.squash = -MAX_SQUASH * Math.max(0.35, Math.min(1, speed / 900))
    this.cheerAt = this.time
    const pose = this.poses.hero
    if (pose?.clip === 'cheer') {
      pose.until += this.realTime - pose.start
      pose.start = this.realTime
    }
  }

  /** Whether the hero is still coming down after a clear touched in the air. */
  private dropping() {
    return this.clearDrop !== null && this.clearDrop.landAt === null
  }

  /** The hero's death clip for the body as it is now. */
  private deathChoice(d: Fall): ClipChoice {
    return dieClip(d.age, d.landAt === null ? null : d.age - d.landAt)
  }

  /** Records the boss's position while it charges or dives fast; clears it otherwise. */
  private updateTrail(dt: number) {
    const boss = this.world.boss
    this.held = dt <= 0
    if (this.held) return
    const fast =
      !this.reducedMotion &&
      boss !== null &&
      !boss.dead &&
      (boss.state === 'charge' || boss.state === 'dive') &&
      Math.hypot(boss.vx, boss.vy) > GHOST_SPEED
    if (fast) this.trail.push(boss.x + boss.w / 2, boss.y + boss.h)
    else this.trail.clear()
  }

  // ------------------------------------------------------------------------------------------- hero

  private heroSnapshot() {
    const p = this.world.player
    const hurtFor = INVULN - p.invuln
    const since = this.idleTime - WAIT_AFTER
    return heroClip({
      cheering: this.world.state === 'clear',
      cheerAge: this.cheerAt === null ? 0 : this.time - this.cheerAt,
      biteAge: p.biteTimer > 0 && !this.biteGone ? BITE_TIME - p.biteTimer : null,
      hurt: this.hurtLive() && !this.hurtGone,
      hurtAge: hurtFor,
      inWater: p.inWater,
      waterTime: this.waterTime,
      onGround: p.onGround || this.heroRests(),
      vx: p.vx,
      vy: p.vy,
      facing: p.facing,
      airTime: this.airTime,
      landAge: this.landAge,
      hardLanding: this.hardLanding && !this.landGone,
      distance: this.distance,
      idleTime: this.idleTime,
      blinkAge: this.blinkAge,
      skidAge: this.skidAge,
      turnAge: this.turnAge,
      waitCut: since >= 0 && Math.floor(since / WAIT_EVERY) === this.waitCut
    })
  }

  /**
   * The hero stands on the ground although the simulation has not said so yet: a stage puts him a hair above the
   * ground and calls him grounded only after its first steps, and a stage that opens with a staged moment shows him
   * before any step has run. Not moving up or down and with ground right under his feet, he is standing.
   */
  private heroRests() {
    const p = this.world.player
    if (Math.abs(p.vy) > HERO_REST_SPEED) return false
    const feet = p.y + p.h
    const ground = groundBelow(this.world, p.x + p.w / 2, feet, 2)
    return ground !== null && ground - feet <= HERO_REST_PX
  }

  /**
   * The hero's clip as it would be drawn now (the knock-out, a staged pose or the live clip), without drawing; null
   * when nothing is shown. Also kept in `heroChoice`.
   */
  selectHero(): ClipChoice | null {
    const p = this.world.player
    let choice: ClipChoice | null
    if (this.death) choice = this.deathChoice(this.death)
    else if (p.dead) choice = null
    else if (this.dropping()) choice = { name: 'fall', t: this.clearDrop!.age }
    else {
      const pose = this.poses.hero
      if (pose && this.realTime < pose.until) {
        const now = this.poseClip(pose)
        choice = { name: now.name, t: now.t }
      } else choice = this.heroSnapshot()
    }
    if (choice) this.heroChoice = choice
    return choice
  }

  drawHero(ctx: CanvasRenderingContext2D) {
    const p = this.world.player
    if (this.death) {
      const d = this.death
      const choice = this.selectHero()!
      const anim = clip('hero', 'die')
      if (anim) blit(ctx, anim, choice.t, d.x, this.deathFeet(d), brush(d.flip, undefined, choice.frame))
      return
    }
    if (p.dead) return
    const x = this.clearDrop ? this.clearDrop.x : p.x + p.w / 2
    const y = this.clearDrop ? this.dropFeet(this.clearDrop) : p.y + p.h
    const staged = this.dropping() ? null : this.activePose('hero', 'hero')
    if (staged) {
      this.heroChoice = { name: staged.name, t: staged.age }
      this.lastRunFrame = -1
      this.drawShadow(ctx, x, y, p.w)
      const { sx, sy } = squashScale(this.squash, squash)
      const flip = staged.face ? staged.face < 0 : p.facing < 0
      blit(ctx, staged.anim, staged.age, x, y - staged.lift, brush(flip, undefined, undefined, sx, sy))
      return
    }
    const choice = this.selectHero()!
    const anim = clip('hero', choice.name)
    if (!anim) return
    if (choice.name === 'run') this.runContact(anim, choice, x, y)
    else this.lastRunFrame = -1
    this.drawShadow(ctx, x, y, p.w)
    // Flicker while invulnerable, after the hurt reaction.
    if (p.invuln > 0 && choice.name !== 'hurt' && Math.floor(this.time * 20) % 2 === 0) return
    const { sx, sy } = squashScale(this.squash, squash)
    blit(ctx, anim, choice.t, x, y, brush(this.flipFor(choice), undefined, choice.frame, sx, sy))
  }

  /** The hero's drawn facing (true: left) with `choice`: his own, but his hurt faces the blow (he is thrown back). */
  private flipFor(choice: ClipChoice) {
    return choice.name === 'hurt' ? this.hurtFace < 0 : this.world.player.facing < 0
  }

  /** The hero's drawn facing while he plays (true: left). */
  heroFlip(): boolean {
    const staged = this.dropping() ? null : this.activePose('hero', 'hero')
    if (staged?.face) return staged.face < 0
    const choice = this.dropping() ? null : staged ? null : this.selectHero()
    return choice ? this.flipFor(choice) : this.world.player.facing < 0
  }

  /**
   * Dust on each contact frame of the run; the footstep once a pass (a pass is one stride of 64 px). Wading on the
   * floor of a pool raises neither: the water makes its own sound (sound-map.ts).
   */
  private runContact(anim: Anim, choice: ClipChoice, x: number, y: number) {
    const frame = frameIndex(anim, choice.t)
    const p = this.world.player
    if (frame !== this.lastRunFrame && !p.inWater && (RUN_CONTACT_FRAMES as readonly number[]).includes(frame)) {
      const facing = p.facing
      this.fx.spawn('dust', x - facing * 10, y - 6, { vx: -facing * 24, vy: -8, rate: 1.2 })
      if (frame === RUN_CONTACT_FRAMES[0]) this.onFootstep()
    }
    this.lastRunFrame = frame
  }

  // ------------------------------------------------------------------------------------------- enemies

  drawEnemies(ctx: CanvasRenderingContext2D) {
    for (const enemy of this.world.enemies) {
      if (enemy.dead) continue
      this.drawEnemy(ctx, enemy)
    }
    for (const g of this.ghosts) {
      if (g.end === 'boom') continue
      const choice = this.ghostChoice(g)
      const sheetClip = g.opening && choice.name === 'shoot' ? 'shoot' : g.clip
      const anim = clip(g.sheet, sheetClip)
      if (!anim) continue
      const alpha = Math.min(1, (g.life - g.age) * 8 + 0.2)
      blit(ctx, anim, choice.t, g.x, g.y, brush(g.flip, alpha, choice.frame))
      if (sheetClip === 'shoot') {
        // The release frame of the throw, white-flashed like a hit.
        const white = flashClip(g.sheet, 'shoot')
        if (white) blit(ctx, white, choice.t, g.x, g.y, brush(g.flip, alpha, choice.frame))
      }
    }
  }

  /**
   * The clip and time an enemy's ghost is drawn with: until it lands, the frames before its first lying frame, the
   * clip's time stretched or squeezed so that frame begins the moment it touches down; from then on the clip's own
   * time. Over a pit it keeps tumbling. A squirrel knocked out on its spit shows its release frame first.
   */
  private ghostChoice(g: Ghost): ClipChoice {
    const f = g.flight
    if (!f || g.at === undefined || g.groundFrame === undefined) return { name: g.clip, t: g.age }
    const spec = ENEMY_SPEC[g.sheet as keyof typeof ENEMY_SPEC]?.[g.clip]
    if (!spec) return { name: g.clip, t: g.age }
    let choice: ClipChoice
    if (f.T !== null)
      choice = { name: g.clip, t: g.age < f.T ? (g.age * g.at) / Math.max(1e-6, f.T) : g.at + g.age - f.T }
    else {
      const blow = frameStart(spec, 1)
      if (g.age < blow) choice = { name: g.clip, t: g.age }
      else {
        const tumble = Math.max(1, g.groundFrame - 1)
        choice = { name: g.clip, t: g.age, frame: 1 + (Math.floor((g.age - blow) * spec.fps + 1e-6) % tumble) }
      }
    }
    if (g.opening && choice.frame === undefined && choice.t < frameStart(spec, 1)) {
      const shoot = ENEMY_SPEC.spitter.shoot
      return { name: 'shoot', t: hitTime(shoot), frame: shoot.hit ?? 0 }
    }
    return choice
  }

  /** Every knocked-out body with the clip and time or frame it is drawn with now (tests; it allocates). */
  ghostStates(): { sheet: string; clip: string; x: number; feet: number; choice: ClipChoice }[] {
    return this.ghosts.map((g) => {
      const choice = g.end === 'boom' ? { name: g.clip, t: g.age } : this.ghostChoice(g)
      return { sheet: g.sheet, clip: choice.name, x: g.x, feet: g.y, choice }
    })
  }

  /** A squirrel's records of its throw: cleared once the throw is over, its cut cleared when a new one begins. */
  private settleThrow(enemy: Enemy, timers: EnemyTimers) {
    if (enemy.shootTimer > hitTime(ENEMY_SPEC.spitter.shoot)) {
      timers.throwFrom = undefined
      timers.throwAgainAt = null
    } else timers.throwCut = false
  }

  /**
   * A squirrel in its lead-in (or waiting loaded) whose target is now on the other side (the sign the simulation aims
   * by) begins its throw again from its first frame, facing it: its frames before the release squeezed into the time
   * left, or played over `FIT_MIN` while it waits. Not straight after another turn. The facing it throws with.
   */
  private throwAgain(enemy: Enemy, timers: EnemyTimers, face: 1 | -1): 1 | -1 {
    if (enemy.shootTimer > hitTime(ENEMY_SPEC.spitter.shoot)) return face
    const d = this.world.player.x - enemy.x
    const aim: 1 | -1 = d > 0 ? 1 : -1
    if (d === 0 || aim === face || timers.faceAge < FACE_HOLD) return face
    if (enemy.shootTimer > 0) timers.throwFrom = enemy.shootTimer
    else timers.throwAgainAt = this.time
    this.throwStats.begunAgain++
    return aim
  }

  /** Counts for tests and the review kit: squirrels' throws begun again. */
  readonly throwStats = { begunAgain: 0 }

  /** The clip a live enemy is drawn with now (without drawing). */
  selectEnemy(enemy: Enemy): ClipChoice {
    const timers = this.enemyTimers.get(enemy.id)
    const snapshot = enemySnapshot
    snapshot.kind = enemy.kind
    snapshot.vx = enemy.vx
    snapshot.vy = enemy.vy
    snapshot.onGround = enemy.onGround
    snapshot.hitFlash = timers && !timers.hurtShown ? 0 : enemy.hitFlash
    snapshot.shootTimer = enemy.shootTimer
    snapshot.landAge = timers?.landAge ?? 99
    snapshot.gain = timers?.gain ?? 0
    snapshot.standing = timers ? shownStanding(timers.tread) : false
    snapshot.time = this.time + enemy.id * 0.13
    snapshot.airborne = timers ? timers.air : this.goesAloft(enemy, false)
    snapshot.throwFrom = timers?.throwFrom
    snapshot.throwAgainAge = timers?.throwAgainAt == null ? null : this.time - timers.throwAgainAt
    snapshot.throwCut = timers?.throwCut ?? false
    return enemyClip(snapshot)
  }

  /**
   * Whether a rat or a mole is drawn in the air: once it is `aloft` (no ground within a few px), until it is back on
   * the ground (so a body that comes down near the ground keeps its fall to the landing, and never flickers). A fall
   * that would end within `AIR_SHORT_SECONDS` is not shown at all (`landsSoon`).
   */
  private goesAloft(enemy: Enemy, was: boolean) {
    if (enemy.onGround || (enemy.kind !== 'walker' && enemy.kind !== 'tough')) return false
    return was || (aloft(this.world, enemy) && !landsSoon(this.world, enemy, enemy.vy))
  }

  /** The drawn facing of a live enemy (true: left). */
  enemyFlip(enemy: Enemy): boolean {
    const timers = this.enemyTimers.get(enemy.id)
    return (timers ? timers.face : enemy.facing) < 0
  }

  /**
   * Where a live enemy is drawn (its centre): where its body is, except that a walker the simulation shakes on the
   * spot stands still in the middle of its shaking.
   */
  enemyX(enemy: Enemy): number {
    const centre = enemy.x + enemy.w / 2
    if (enemy.kind !== 'walker' && enemy.kind !== 'tough') return centre
    const timers = this.enemyTimers.get(enemy.id)
    return timers ? treadX(timers.tread, centre) : centre
  }

  /** Where the live boss is drawn (his centre): a boss shaken on the spot (on top of the hero) stands still. */
  bossX(boss: Boss): number {
    return treadX(this.bossTread, boss.x + boss.w / 2)
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
    if (!this.enemyShown(enemy)) return
    const choice = this.selectEnemy(enemy)
    const anim = clip(enemy.kind, choice.name)
    if (!anim) return
    const x = this.enemyX(enemy)
    const y = enemy.y + enemy.h
    this.drawShadow(ctx, x, y, enemy.w)
    const flip = this.enemyFlip(enemy)
    blit(ctx, anim, choice.t, x, y, brush(flip, undefined, choice.frame))
    if (enemy.hitFlash > 0) {
      const white = flashClip(enemy.kind, choice.name)
      if (white) blit(ctx, white, choice.t, x, y, brush(flip, Math.min(1, enemy.hitFlash * 7), choice.frame))
    }
  }

  // ------------------------------------------------------------------------------------------- bosses

  drawBoss(ctx: CanvasRenderingContext2D) {
    const boss = this.world.boss
    if (boss && !boss.dead) {
      this.drawLiveBoss(ctx, boss)
      this.drawShotCue(ctx, boss)
    }
    for (const g of this.ghosts) {
      if (g.end !== 'boom') continue
      const anim = clip(g.sheet, g.clip)
      if (anim) blit(ctx, anim, g.age, g.x, g.y, brush(g.flip))
    }
  }

  /** The live boss's clip as it would be drawn now: a staged pose, else the state's clip (without drawing). */
  selectBoss(boss: Boss): ClipChoice {
    const pose = this.posing('boss')
    if (pose && clip(boss.def.art, pose)) return { name: pose, t: this.realTime - this.poses.boss!.start }
    return this.bossChoice(boss)
  }

  /** The drawn facing of the live boss (true: left). */
  bossFlip(boss: Boss): boolean {
    // (Before the first update the simulation's own facing stands in.)
    if (!this.bossFaced) return boss.facing < 0
    return this.bossFace < 0
  }

  /**
   * The sheet the live boss is drawn from: the king's raged sheet once his transformation (the staged pose or the
   * sim-time `rage`) is over, else his art (also while a staged transformation is still to come).
   */
  bossSheet(boss: Boss): string {
    if (!this.phased || boss.def.kind !== 'final') return boss.def.art
    if (this.ragePending || this.posing('boss') === 'rage') return boss.def.art
    if (this.rageAt !== null && this.time - this.rageAt < specDurationOfRage(boss)) return boss.def.art
    return KING_RAGED
  }

  /**
   * The time into the boss's state on its own clock: his state time, or, once the phase change has restarted it, the
   * simulation time since the state began (a landing and a follow-through are timed on it, from their own cause).
   */
  private ownTime(boss: Boss) {
    if (boss.state !== this.bossLast || !this.stateReset) return boss.stateTime
    return this.world.time - this.stateStart
  }

  /**
   * Whether the live boss is between his actions: not in a leap (in the air, or in his slam), no landing, no gathering
   * or follow-through of a volley, no flinch showing. The staged transformation waits for it (see `StageDirector`).
   */
  bossBetweenActions(): boolean {
    const boss = this.world.boss
    if (!boss || boss.dead || !boss.active) return true
    const leaps = boss.def.kind === 'tank' || boss.def.kind === 'final'
    if (leaps && (boss.state === 'slam' || !boss.onGround)) return false
    if (boss.def.kind === 'final' && boss.state === 'shoot') return false
    const name = this.bossChoice(boss).name
    return name !== 'land' && name !== 'shoot' && name !== 'hurt'
  }

  /** Whether a flinch is playing. */
  private flinching() {
    const boss = this.world.boss
    if (this.flinchAt === null || !boss) return false
    return this.time - this.flinchAt < this.flinchSeconds
  }

  /** Ends a cast in progress (a flinch cut it; its shot may still get a fresh pose if one fits after the flinch). */
  private dropCast() {
    this.cast = 'none'
    this.castSide = 0
  }

  /**
   * Begins the lead-in of a cast for the shot due in `until` seconds, if it fits (`castFit`) and its aim is settled:
   * the hero clearly to one side now (`aimClear`) and still on that side when the shot leaves, going by how the two
   * bodies move now; and not straight after a turn (it begins facing that side). Whether it began.
   */
  private beginCast(boss: Boss, s: BossSnapshot, spec: Record<string, AnimSpec>, until: number) {
    const p = this.world.player
    const dx = p.x - boss.x
    const clear = aimClear(boss.def.speed)
    if (Math.abs(dx) <= clear) return false
    // (Walking at the hero in his `idle`, he goes at his own speed towards him whatever he does on this step.)
    const walks = boss.state === 'idle' && WALKERS.includes(boss.def.kind)
    const bossVx = walks ? Math.sign(dx) * boss.def.speed : boss.vx
    const later = dx + (p.vx - bossVx) * until
    if (later * dx <= 0 || Math.abs(later) <= clear) return false
    const aim: 1 | -1 = dx > 0 ? 1 : -1
    if (aim !== this.bossFace && this.bossFaceAge < FACE_HOLD) return false
    const tail = castFit(s, spec)
    if (tail <= 0) return false
    this.cast = 'lead'
    this.castFrom = until
    this.castTail = tail
    this.castAim = aim
    if (aim !== this.bossFace) {
      this.bossFace = aim
      this.bossFaceAge = 0
    }
    return true
  }

  /**
   * The gathering light of the live boss's next shot as it is drawn on this frame, or null when none shows: from
   * `SHOT_CUE_SECONDS` before a shot of the crow, the fox or the bee leaves (`shotDue`), whatever his body does,
   * held on its last frame until the shot leaves, gone on the frame that shows it. It sits at the height the shot is
   * born, between the edges of his body by where the hero is (`SHOT_CUE_SLIDE`), so the side it will leave on is read
   * from the picture, and while the hero passes over him it slides across his body.
   */
  shotCue(boss: Boss, out: ShotCue = newShotCue()): ShotCue | null {
    const sheet = CUE_SHEETS[boss.def.art]
    if (!sheet || boss.dead || !boss.active) return null
    const due = shotDue(this.fillBoss(boss))
    if (due === null || due > SHOT_CUE_SECONDS + 1e-9) return null
    const side = Math.max(-1, Math.min(1, (this.world.player.x - boss.x) / SHOT_CUE_SLIDE))
    const jolt = this.reducedMotion || this.joltAt === null ? 0 : bossJolt(this.time - this.joltAt, this.joltDir)
    out.sheet = sheet
    // (Full on the last frame before the shot: the frame before the one that shows it shows the light whole, also
    // when a display frame spans more than a step.)
    const last = Math.ceil(this.frameDt / CUE_LAST_STEP - 1e-6) * CUE_LAST_STEP
    out.progress = Math.max(0, Math.min(1, (SHOT_CUE_SECONDS - due) / (SHOT_CUE_SECONDS - last)))
    out.x = this.bossX(boss) + jolt + (side * boss.w) / 2
    out.y = boss.y + boss.h * (boss.def.kind === 'flyer' ? 0.5 : 0.4) + 7
    out.side = side
    return out
  }

  /** Draws the gathering light (`shotCue`) in front of the boss: `gather` of the shot's sheet, played by progress. */
  private drawShotCue(ctx: CanvasRenderingContext2D, boss: Boss) {
    const cue = this.shotCue(boss, shotCueScratch)
    if (!cue) return
    if (cue.side < 0) this.cueMirror = true
    else if (cue.side > 0) this.cueMirror = false
    const anim = clip(cue.sheet, 'gather')
    // (Not drawn before its art is there.)
    if (!anim?.frames?.length) return
    const frame = Math.min(anim.frames.length - 1, Math.floor(cue.progress * anim.frames.length))
    blit(ctx, anim, 0, cue.x, cue.y, brush(this.cueMirror, undefined, frame))
  }

  /** The boss snapshot, refilled from the body and the view's records. */
  private fillBoss(boss: Boss): BossSnapshot {
    const s = bossSnapshot
    s.kind = boss.def.kind
    s.state = boss.state
    // (Before `update` has seen a new state, the state it has seen last is the one before.)
    s.prevState = boss.state !== this.bossLast ? this.bossLast : this.bossPrev
    s.stateTime = boss.stateTime
    s.active = boss.active
    s.vx = boss.vx
    s.vy = boss.vy
    s.speed = boss.def.speed
    s.phase = boss.phase ?? 1
    s.rageAge = this.rageAt === null ? null : this.time - this.rageAt
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    // The flinch and the cast play their whole clips over the seconds they were given.
    s.hurtAge =
      this.flinchAt === null || !spec.hurt
        ? null
        : ((this.time - this.flinchAt) * specDuration(spec.hurt)) / this.flinchSeconds
    s.onGround = boss.onGround
    s.shotTimer = boss.shotTimer
    s.volleyCut = this.volleyCut
    s.dashAge = this.dashAt === null ? null : this.time - this.dashAt
    s.dashGain = this.bossGain - this.dashGain
    s.gain = this.bossGain
    s.standing = shownStanding(this.bossTread)
    s.time = this.time
    // (Before `update` has seen a new state, what it recorded belongs to the state before: the new one starts clean.)
    const fresh = boss.state !== this.bossLast
    s.clipFrom = fresh ? 0 : this.clipFrom
    s.landedAt = fresh ? this.freshLandedAt(boss) : this.bossLandedAt
    s.ownTime = this.ownTime(boss)
    s.stateReset = !fresh && this.stateReset
    s.gatherFrom = fresh ? 0 : this.gatherFrom
    s.landCut = fresh ? this.carriesCut(boss.state, this.bossLast) : this.landCut
    s.projectiles = boss.def.projectiles
    s.castAge = null
    if (this.cast === 'lead' && spec.shoot) s.castAge = castLeadTime(s, spec, this.castFrom)
    else if (this.cast === 'release' && spec.shoot) {
      const lead = hitTime(spec.shoot)
      const natural = specDuration(spec.shoot) - lead
      // Squeezed into less than its own length, the follow-through reaches its last frame a display frame before
      // its time is up, so that frame shows at any display rate.
      const seconds =
        this.castTail < natural - 1e-9 ? Math.max(this.castTail / 2, this.castTail - this.frameDt) : this.castTail
      s.castAge = this.castFresh
        ? lead
        : lead + Math.min(natural - 1e-6, ((this.time - this.castAt) * natural) / seconds)
    }
    return s
  }

  /**
   * Where the landing begins on the clock of a state the view has not recorded yet: a recovery after a slam whose
   * landing began before it (in his slam, held there by the phase change) carries it on; else with the state.
   */
  private freshLandedAt(boss: Boss) {
    if (boss.state !== 'recover' || this.bossLast !== 'slam' || this.slamLandWorld === null) return 0
    return Math.min(0, this.slamLandWorld - (this.world.time - boss.stateTime))
  }

  /** The boss's clip from his state and the view's records (no staged pose). */
  private bossChoice(boss: Boss): ClipChoice {
    return bossClip(this.fillBoss(boss), boss.def.art)
  }

  /**
   * The boss's records: his state history, his tread, his dash, the cast he shows (started on the step its lead-in
   * must begin, if it fits), his drawn facing and the dust of a skid.
   */
  private updateBoss(dt: number) {
    const boss = this.world.boss
    if (!boss || boss.dead) return
    // He starts out facing the hero, before any step has run (a stage that opens on him poses him at once).
    if (!this.bossFaced) {
      this.bossFaced = true
      this.bossFace = this.world.player.x > boss.x ? 1 : -1
    }
    const newState = boss.state !== this.bossLast
    if (newState) {
      this.bossLandedAt = this.freshLandedAt(boss)
      // (Only a slam the phase change held on the ground carries its landing over: see `freshLandedAt`.)
      if (boss.state !== 'recover') this.slamLandWorld = null
      this.bossPrev = this.bossLast
      this.bossLast = boss.state
      this.stateStart = this.world.time - boss.stateTime
      this.stateReset = false
      this.gatherFrom = 0
      this.gatherFrame = 0
      this.clipFrom = 0
      this.landCut = this.carriesCut(boss.state, this.bossPrev)
      if (boss.state === 'charge' || boss.state === 'dive') {
        this.dashAt = this.time
        this.dashGain = this.bossGain
      }
      if (boss.state === 'shoot') this.volleyCut = false
    } else if (boss.onGround && !this.bossGrounded) {
      // In his slam the landing begins on the step after the touchdown (the step the simulation ends the slam on).
      const slam = boss.state === 'slam'
      this.bossLandedAt = this.ownTime(boss) + (slam ? SIM_STEP : 0)
      if (slam) this.slamLandWorld = this.stateReset ? this.world.time + SIM_STEP : null
      this.landCut = false
    }
    // The phase change restarting his slam's clock on the ground: the landing that began goes on into the recovery.
    if (boss.state === 'slam' && this.stateReset && boss.onGround && this.slamLandWorld === null)
      this.slamLandWorld = this.stateStart + this.bossLandedAt
    this.bossGrounded = boss.onGround
    stepTread(this.bossTread, boss.x + boss.w / 2, dt, boss.onGround)
    // Only a boss walking on the ground (and ハム代 running) is ever held still; elsewhere the picture is the body.
    const walking = boss.state === 'idle' && (WALKERS.includes(boss.def.kind) || boss.def.kind === 'chaser')
    stepPicture(this.bossTread, boss.x + boss.w / 2, dt, walking && boss.active && !this.posing('boss'))
    if (this.flinchAt !== null && !this.flinching()) this.flinchAt = null
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    let s = this.fillBoss(boss)
    // The cast: started when its lead-in must begin, ended when it has played.
    if (spec.shoot) {
      const lead = hitTime(spec.shoot)
      const until = shotLead(s)
      if (this.cast === 'lead' && until !== null && (this.world.player.x - boss.x) * this.castAim < 0) {
        // The hero has gone to the other side before the release: the lead-in is given up on this frame (it never
        // carries on to a release that would have to turn), and begins again facing the new side where it can.
        this.dropCast()
        this.castStats.givenUp++
        if (this.castRestarts === 0 && this.beginCast(boss, s, spec, until)) {
          this.castRestarts++
          this.castStats.begunAgain++
        } else this.castRefused = true
      }
      if (this.cast === 'none') {
        if (until === null || until > lead) {
          this.castRefused = false
          this.castRestarts = 0
        } else if (!this.castRefused && !this.flinching()) this.beginCast(boss, s, spec, until)
      } else if (this.cast === 'lead' && until === null) this.dropCast()
      else if (this.cast === 'release' && this.castFresh) {
        // The frame that shows the shot shows its release; the follow-through runs from here, fitted to the time
        // left before his wind-up (at any display rate the release frame lands on the shot).
        if (dt > 0) {
          this.castFresh = false
          this.castAt = this.time
          this.castTail = Math.min(this.castTail, Math.max(1e-3, castRoom(s)))
        }
      } else if (this.cast === 'release' && this.time - this.castAt >= this.castTail - 1e-9) {
        this.cast = 'none'
        this.castSide = 0
      }
      s = this.fillBoss(boss)
    }
    const choice = bossClip(s, boss.def.art, spec)
    // The drawn facing. An action (a flinch, a throw or cast, a landing) keeps the facing it began with to its last
    // frame. The king's volley begins facing the hero when he is clearly on one side (on its first frame, also when a
    // hit-stop holds it, and not straight after another turn); a cast of the others begins facing its aim (`beginCast`).
    const action = choice.name === 'hurt' || choice.name === 'shoot' || choice.name === 'land'
    const began = action && choice.name !== this.bossAction
    this.bossAction = action ? choice.name : ''
    if (boss.active && began && choice.name === 'shoot' && this.cast === 'none' && this.bossFaceAge >= FACE_HOLD) {
      const d = this.world.player.x - boss.x
      const aim: 1 | -1 = d > 0 ? 1 : -1
      if (Math.abs(d) > aimClear(boss.def.speed) && aim !== this.bossFace) {
        this.bossFace = aim
        this.bossFaceAge = 0
      }
    }
    if (dt > 0 && boss.active) {
      const d = this.world.player.x - boss.x
      const age = this.bossFaceAge
      // A walk is read from its own steps: out of one (another state, or standing over the hero) it starts anew.
      if (boss.state !== 'idle') forgetMotion(this.bossTread)
      let face = this.bossFace
      if (this.faceSnapped) this.faceSnapped = false
      else if (action) {
        // (It keeps its facing.)
      } else if (boss.def.kind === 'chaser') face = heldSideFacing(face, d, age)
      else if (this.cast === 'release' && this.castSide !== 0) face = this.castSide
      // Through a cast he keeps the facing he aimed with (the shot turns him to its side if the hero has crossed;
      // a flier's hover and the fox's leap need not face their drift).
      else if (this.cast !== 'none') face = this.bossFace
      // (Falling in his walk, the bear's and the king's `air` is no dash: he faces as he walks.)
      else if (
        TRAVEL_STATES.includes(boss.state) ||
        (isDashClip(choice.name) && !(choice.name === 'air' && boss.state === 'idle'))
      ) {
        if (Math.abs(boss.vx) > DASH_REST_SPEED) face = boss.vx > 0 ? 1 : -1
      } else if (boss.state === 'idle' && WALKERS.includes(boss.def.kind)) {
        // Walking at the hero he faces the way he walks; standing over him, the hero's side. About to shoot, he
        // does not turn away first: the shot turns him to its side (and he is not turned twice in a moment).
        const aiming = boss.def.projectiles > 0 && boss.shotTimer > 0 && boss.shotTimer < FACE_HOLD
        if (!aiming) face = walkFacing(this.bossTread, face, d, true, age)
      }
      // In his wind-up, too, he turns only once the hero is clearly on the other side (on top of him the sign of
      // `player.x - boss.x` changes every few steps), and not twice in a moment.
      else face = heldSideFacing(face, d, age)
      if (face !== this.bossFace) {
        this.bossFace = face
        this.bossFaceAge = 0
      }
      this.bossGain += drawnGain(this.bossTread, this.bossFace)
    }
    // A boss on the ground skidding to a stop kicks up dust.
    const art = boss.def.art
    const skids =
      !this.reducedMotion &&
      art !== 'crowBoss' &&
      art !== 'beeBoss' &&
      boss.onGround &&
      Math.abs(boss.vx) > DASH_REST_SPEED &&
      (choice.name === 'land' || (boss.state === 'recover' && isDashClip(choice.name)))
    if (!skids) this.dustTimer = 0
    else if (dt > 0) {
      this.dustTimer -= dt
      if (this.dustTimer <= 0) {
        this.dustTimer = SKID_DUST_EVERY
        const dir = boss.vx > 0 ? 1 : -1
        this.fx.spawn('dust', boss.x + boss.w / 2 - dir * boss.w * 0.3, boss.y + boss.h - 6, {
          vx: -dir * 30,
          vy: -10,
          rate: 1.2
        })
      }
    }
    // A clip timed from the state's start that takes over from another clip inside the state begins on its first
    // frame: it is timed from there (`BossSnapshot.clipFrom`).
    const shown = this.bossChoice(boss)
    const name = shown.name
    if (boss.state === 'shoot' && name === 'shoot') this.gatherFrame = shown.frame ?? 0
    if (!newState && name !== this.clipLast && STATE_TIMED.includes(name)) this.clipFrom = boss.stateTime
    this.clipLast = name
  }

  /**
   * The frame the live boss or a live enemy is drawn with now, placed as `drawLiveBoss` and `drawEnemy` place it (a
   * staged pose with its lift, the hit jolt), into `out`; false when it is not drawn. (Shots read it: they stay
   * behind their shooter while they overlap his drawing.)
   */
  drawnFrame(body: Boss | Enemy, out: Placed): boolean {
    let anim: Anim | undefined
    let index: number
    if (body === this.world.boss) {
      const boss = body as Boss
      if (boss.dead) return false
      out.y = boss.y + boss.h
      out.flip = this.bossFlip(boss)
      const pose = this.poses.boss
      anim = pose && this.realTime < pose.until ? clip(boss.def.art, pose.clip) : undefined
      if (anim && pose) {
        const age = this.realTime - pose.start
        const k = pose.hop > 0 && age < pose.hopSeconds ? age / pose.hopSeconds : -1
        out.y -= k >= 0 ? Math.round(4 * pose.hop * k * (1 - k)) : 0
        out.x = this.bossX(boss)
        index = frameIndex(anim, age)
      } else {
        const choice = this.bossChoice(boss)
        anim = clip(this.bossSheet(boss), choice.name)
        if (!anim) return false
        const jolt = this.reducedMotion || this.joltAt === null ? 0 : bossJolt(this.time - this.joltAt, this.joltDir)
        out.x = this.bossX(boss) + jolt
        index = frameIndex(anim, choice.t, choice.frame)
      }
    } else {
      const enemy = body as Enemy
      if (enemy.dead) return false
      const choice = this.selectEnemy(enemy)
      anim = clip(enemy.kind, choice.name)
      if (!anim) return false
      out.x = this.enemyX(enemy)
      out.y = enemy.y + enemy.h
      out.flip = this.enemyFlip(enemy)
      index = frameIndex(anim, choice.t, choice.frame)
    }
    out.raster = anim.frames[index] ?? null
    out.anchor = anchorOf(anim)
    return out.raster !== null
  }

  private drawLiveBoss(ctx: CanvasRenderingContext2D, boss: Boss) {
    const choice = this.bossChoice(boss)
    const sheet = this.bossSheet(boss)
    const centre = this.bossX(boss)
    const y = boss.y + boss.h
    const flip = this.bossFlip(boss)
    const staged = this.activePose('boss', boss.def.art)
    if (staged) {
      this.drawShadow(ctx, centre, y, boss.w * 1.1)
      blit(ctx, staged.anim, staged.age, centre, y - staged.lift, brush(flip))
      return
    }
    const anim = clip(sheet, choice.name)
    if (!anim) return
    this.drawShadow(ctx, centre, y, boss.w * 1.1)
    // A hit jolts the sprite (and its flash) away from the hero, a crash away from the wall; the shadow stays put.
    const jolt = this.reducedMotion || this.joltAt === null ? 0 : bossJolt(this.time - this.joltAt, this.joltDir)
    const x = centre + jolt
    if (!this.held && !this.reducedMotion)
      for (let i = 0; i < TRAIL_AGES.length; i++) {
        const age = TRAIL_AGES[i]
        if (this.trail.has(age))
          blit(ctx, anim, choice.t, this.trail.x(age), this.trail.y(age), brush(flip, TRAIL_ALPHAS[i], choice.frame))
      }
    blit(ctx, anim, choice.t, x, y, brush(flip, undefined, choice.frame))
    if (boss.hitFlash > 0) {
      const white = flashClip(sheet, choice.name)
      if (white) blit(ctx, white, choice.t, x, y, brush(flip, Math.min(1, boss.hitFlash * 7), choice.frame))
    }
    // The marks follow the clip shown: dizzy over a stun or a rest, sweat over a recovery.
    if (choice.name === 'stunned' || choice.name === 'tired') {
      const dizzy = clip('fx', 'dizzy')
      if (dizzy) blit(ctx, dizzy, this.time, centre, boss.y - 8)
    }
    if (choice.name === 'recover') {
      const sweat = clip('fx', 'sweat')
      if (sweat) blit(ctx, sweat, this.time, centre + (flip ? -1 : 1) * boss.w * 0.45, boss.y + 2)
    }
  }

  // ------------------------------------------------------------------------------------------- shadows

  private drawShadow(ctx: CanvasRenderingContext2D, x: number, feetY: number, width: number) {
    const ground = groundBelow(this.world, x, feetY)
    if (ground === null) return
    const height = Math.max(0, ground - feetY)
    const k = Math.min(0.65, height / 240)
    const rx = Math.round((width / 2) * (1 - k))
    if (rx < 3) return
    ctx.globalAlpha = 0.3 * (1 - k)
    ctx.fillStyle = '#1a0c2c'
    // A pixel ellipse: three stacked rows.
    ctx.fillRect(Math.round(x - rx), ground - 2, rx * 2, 3)
    ctx.fillRect(Math.round(x - rx + 3), ground - 3, rx * 2 - 6, 1)
    ctx.fillRect(Math.round(x - rx + 3), ground + 1, rx * 2 - 6, 1)
    ctx.globalAlpha = 1
  }
}
