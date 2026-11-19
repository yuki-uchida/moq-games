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
  type BossSnapshot,
  type ClipChoice,
  type EnemySnapshot,
  attackRoom,
  fallLandShows,
  stillRoom,
  landImpactEnd,
  FIT_MIN
} from './clips'
import type { Placed } from './bounds'
import type { FxPool } from './fx'
import type { Sight } from './sight'
import { summonPuff } from './fx-map'
import { ENEMY_SPEC, HERO_SPEC, KING_RAGED, MOM_SPEC, bossSpec, type AnimSpec, type BossArt } from '../art/contract'
import {
  DECISIVE_PX,
  FACE_HOLD,
  drawnGain,
  motionKnown,
  FACE_DEAD_ZONE,
  forgetMotion,
  goneSince,
  noteTurn,
  sinceTurn,
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
  /** A boss's body has lain on ground (see `update`: it bursts if that ground goes). */
  lay?: boolean
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

/**
 * Half the width (px) of the knocked-out hero's drawn body, tumbling or lying (the die frames' paint reaches 30 px
 * either side of his feet's middle): no part of it goes into a wall (round 8f).
 */
export const DIE_HALF_W = 30
/** His knocked-out body is drawn this tall (px) at most above its feet, plus the 26 px of its hop. */
export const DIE_REACH_UP = 80
/** The knocked-out body moves clear of a wall over this long (s), easing out (before his hop comes back down). */
export const DIE_CLEAR_SECONDS = 0.25

/**
 * The open span (px, left and right edges) of tile row `row` around `x`, looked at 4 tiles either side (more than a
 * body needs); null when the tile at `x` is solid.
 */
function openSpan(world: Pick<World, 'solidAt'>, x: number, row: number): [number, number] | null {
  const tx = Math.floor(x / TILE)
  if (world.solidAt(tx, row)) return null
  let l = tx
  let r = tx
  while (l > tx - 4 && !world.solidAt(l - 1, row)) l--
  while (r < tx + 4 && !world.solidAt(r + 1, row)) r++
  return [l * TILE, (r + 1) * TILE]
}

/**
 * Where a knocked-out body hit at (x, feet y0) comes to rest (round 8f): its middle `x`, kept `DIE_HALF_W` clear of
 * the walls of every row it tumbles and lies in, and the ground under that middle (null over a pit). Off a ledge's
 * lip it tumbles outward, clear of the wall's face; a hole narrower than his lying body he lies across, on the ledge's
 * top; with no room (a gap narrower than his body) he lies in its middle.
 */
export function deathRestPlace(
  world: Pick<World, 'solidAt' | 'tileAt' | 'h'>,
  x: number,
  y0: number
): { x: number; ground: number | null } {
  const ground = groundBelow(world, x, y0, world.h)
  // (The row under his feet: a hole there narrower than his lying body he bridges.)
  const below = Math.floor((y0 + 1) / TILE)
  if (ground !== null && ground > y0 + 2) {
    const hole = openSpan(world, x, below)
    if (hole && hole[1] - hole[0] < 2 * DIE_HALF_W) return { x: (hole[0] + hole[1]) / 2, ground: y0 }
  }
  // The rows his body passes through, from the top of his hop to where he lies (a pit: a few rows down).
  const top = Math.max(0, Math.floor((y0 - DIE_REACH_UP) / TILE))
  const bottom = Math.min(world.h - 1, Math.floor(((ground ?? y0 + 3 * TILE) - 1) / TILE))
  let l = -Infinity
  let r = Infinity
  for (let row = top; row <= bottom; row++) {
    const span = openSpan(world, x, row)
    if (!span) continue
    l = Math.max(l, span[0])
    r = Math.min(r, span[1])
  }
  if (!Number.isFinite(l) || !Number.isFinite(r)) return { x, ground }
  const at = r - l < 2 * DIE_HALF_W ? (l + r) / 2 : Math.min(Math.max(x, l + DIE_HALF_W), r - DIE_HALF_W)
  if (at === x) return { x, ground }
  // (Moved clear, he lies on the ground under his new middle, if it is the same ground or lower.)
  const there = groundBelow(world, at, y0, world.h)
  if (ground !== null && (there === null || there < ground)) return { x, ground }
  return { x: at, ground: there }
}

/** The first die frame (the blow) paints this far (px) behind and in front of his feet's middle. */
export const DIE_HIT_BACK = 28
export const DIE_HIT_FRONT = 16

/**
 * Where the knocked-out body's middle is drawn on the blow's frame (round 8f): where he stood, unless the first die
 * frame (`DIE_HIT_BACK` behind him, `DIE_HIT_FRONT` in front) would reach into a wall beside him: then clear of it.
 */
export function deathStartX(world: Pick<World, 'solidAt'>, x: number, y0: number, flip: boolean) {
  const left = flip ? DIE_HIT_FRONT : DIE_HIT_BACK
  const right = flip ? DIE_HIT_BACK : DIE_HIT_FRONT
  let l = -Infinity
  let r = Infinity
  for (let row = Math.floor((y0 - DIE_REACH_UP) / TILE); row <= Math.floor((y0 - 1) / TILE); row++) {
    const span = openSpan(world, x, row)
    if (!span) continue
    l = Math.max(l, span[0])
    r = Math.min(r, span[1])
  }
  if (r - l < left + right) return x
  return Math.min(Math.max(x, l + left), r - right)
}

/** The tallest die frame paints this high (px) above its feet (the blow's frame). */
export const DIE_FRAME_H = 53

/**
 * Whether a knocked-out body's frame (`left` and `right` px either side of `x`, `DIE_FRAME_H` above `feet`) is clear
 * of solids.
 */
export function dieClear(world: Pick<World, 'solidAt'>, x: number, feet: number, left = DIE_HALF_W, right = left) {
  const c0 = Math.floor((x - left + 1) / TILE)
  const c1 = Math.floor((x + right - 1) / TILE)
  const r0 = Math.floor((feet - DIE_FRAME_H) / TILE)
  const r1 = Math.floor((feet - 1) / TILE)
  for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) if (world.solidAt(tx, ty)) return false
  return true
}

/**
 * Where a knocked-out body whose place the simulation left in or against a solid (a felled tree's log landing on
 * him, round 8g) is drawn from: the nearest place, up to three tiles away, where his whole die frame is clear of
 * solids, beside the solid or on top of it (feet on a tile's top). Null when his frame is clear where he is (or no
 * place near is).
 */
export function deathClearPlace(world: Pick<World, 'solidAt'>, x: number, feet: number) {
  if (dieClear(world, x, feet)) return null
  let best: { x: number; feet: number; d: number } | null = null
  const feets = [feet]
  for (let ty = Math.floor((feet - 1) / TILE); ty * TILE > feet - 3 * TILE; ty--) feets.push(ty * TILE)
  for (const f of feets)
    for (let dx = 0; dx <= 3 * TILE; dx++)
      for (const sx of dx === 0 ? [x] : [x - dx, x + dx]) {
        const d = Math.hypot(sx - x, f - feet)
        if (best && d >= best.d) continue
        if (dieClear(world, sx, f)) best = { x: sx, feet: f, d }
      }
  return best && { x: best.x, feet: best.feet }
}

/**
 * The knocked-out body's toss under a ceiling (round 8f): its hop is lowered so that no frame reaches into a solid
 * above it, over the columns its body covers between `x` and `x1` (a ceiling flush on his head: no hop at all).
 */
export function tossUnder(world: Pick<World, 'solidAt'>, toss: Toss, x: number, x1: number, y0: number): Toss {
  const rise = (toss.hop * toss.hop) / (2 * toss.gravity)
  let ceiling = -Infinity
  const c0 = Math.floor((Math.min(x, x1) - DIE_HALF_W + 1) / TILE)
  const c1 = Math.floor((Math.max(x, x1) + DIE_HALF_W - 1) / TILE)
  const r0 = Math.floor((y0 - DIE_FRAME_H - rise) / TILE)
  for (let ty = r0; (ty + 1) * TILE <= y0 - DIE_FRAME_H + 2; ty++)
    for (let tx = c0; tx <= c1; tx++) if (world.solidAt(tx, ty)) ceiling = Math.max(ceiling, (ty + 1) * TILE)
  if (ceiling === -Infinity) return toss
  const room = Math.max(0, Math.min(rise, y0 - DIE_FRAME_H - ceiling))
  return room >= rise ? toss : { ...toss, hop: Math.sqrt(2 * toss.gravity * room) }
}

interface Fall {
  /** His middle where he was hit, and where he comes to rest (`deathRestPlace`). */
  x: number
  x1: number
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
/**
 * Carried on the ground against the facing he is drawn with faster than this (px/s), the hero skids (slower, he
 * stands: the ground he slides over then stays within a planted pose's few px).
 */
export const CARRIED_SKID_SPEED = 50
/** The skid shows from this step of the simulation's braking on (a tap of fewer steps changes nothing). */
export const BRAKE_STEPS = 3
/** A pivot gives way to his run once his body has gone this far (px) the way he turned (or is over, carried back). */
export const PIVOT_RUN_PX = 6
/**
 * Carried this far (px) back the old way, a pivot is over: further than a walk's brake slides him (a turn at
 * `SKID_SPEED` slides 3.2 px against the key), so it is a slide of keys dithering, not a turn on the spot.
 */
export const PIVOT_SLIDE_PX = 4
/**
 * In water a body driven faster than this (px/s) goes the way he is driven (rule 1): the water takes 14 % of his
 * speed a step, so the first stroke from a stand goes 18.6 px/s, under the run's threshold.
 */
export const DRIVE_SPEED_WATER = 12
/**
 * Out of a stand that shows, he runs once his body goes faster than this (px/s): two steps of his run's speed-up from
 * a stand (31.7 a step), above the jitter of a body whose keys dither on the spot.
 */
export const RUN_START_SPEED = 40
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
  /**
   * The hero's pose has no face of the moment's own: `face` is the facing he was drawn with when it began (the
   * pose never turns him), and he comes out of it so (`heroKeep`).
   */
  own: boolean
  /** Taken while a step was answered: its clock starts at the next tick (the frame that first draws it). */
  fromStep: boolean
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
  /** The way the last hit throws it (the `enemy-hit` event's `dir`; 0: none yet): its hurt faces the other way. */
  hitDir: 0 | 1 | -1
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
  /** The throw begun again has not been drawn yet: its lead-in is timed from the frame that first shows it. */
  throwFresh: boolean
  /**
   * Its throw is due but the hold of a turn a moment ago keeps it from facing its aim: it stands (no lead-in shows)
   * until it may turn, and then begins its throw facing the hero, fitted to the time left.
   */
  throwHeld: boolean
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
}

/**
 * Where a boss's thrown or cast shot is born, from his centre (sim.ts: the left edge of its 14 px box on his centre,
 * its top at 0.4 of his height, 0.5 for the crow): its light gathers at that very place on his drawn body.
 */
export const SHOT_BIRTH_DX = 7
/** The states that carry a boss in a dash, or crash him out of one. */
const DASH_STATES: readonly string[] = ['charge', 'dive', 'stunned']
/** The states that are one of his attacks (a wind-up, a dash, a leap, a gathering). */
const ATTACK_STATES: readonly string[] = ['windup', 'charge', 'dive', 'slam', 'shoot']
/** A heavy boss lands (`land`) after a fall of this many px or more (a hop of a few px is no fall). */
export const FALL_LAND_PX = 12
/** The hero's clips that are actions: each keeps the facing it began with (see `decideHeroFace`). */
const HERO_ACTIONS: readonly string[] = ['bite', 'land', 'skid', 'turn', 'wait']
/** The first seconds of a wind-up count as a rest between his actions (see `bossBetweenActions`). */
export const WINDUP_REST_SECONDS = 0.1
/** ...and once his walk has slowed in it to this (px/s): his body at rest over its last steps. */
export const WINDUP_REST_SPEED = 30
/** Of a hit-stop's seconds this much is not credited to the facing holds (see `ActorsView.heldFor`). */
export const HIT_STOP_UNCREDITED = 2 * SIM_STEP
/** The boss is at rest once he has been slow for this many steps in a row. */
const REST_STEPS = 3
/** The least wind-up (s) a landing inside a wind-up leaves before the dash (else there is no landing). */
export const WINDUP_WARNING = 0.15
/** A heavy boss's landing after a fall in his walk covers no more ground than this (px): a slam landing's slide. */
export const LAND_SLIDE_PX = 20
/** A heavy boss's landing goes on through this many steps off the ground (see `ActorsView.landHolds`). */
export const LAND_HOLD_STEPS = 2
export const shotBirthY = (boss: Boss) => boss.y + boss.h * (boss.def.kind === 'flyer' ? 0.5 : 0.4) + 7

/**
 * The time (s) the last frame of a fitted clip keeps when the clip can give it: one display frame at 30 Hz (a 30 Hz
 * display shows it). A display frame longer than what it keeps may pass over it.
 */
const LAST_FRAME_SECONDS = 1 / 30
/** One display frame at 60 Hz: what every frame of a fitted clip keeps first, when its time allows it. */
const FRAME_FLOOR_SECONDS = 1 / 60
/** The boss's clips fitted to the time there is: stepped by display frames (`ActorsView.stepFitted`). */
const FITTED_CLIPS: readonly string[] = ['hurt', 'shoot', 'land', 'windup']

/** The frame of `spec` at clip time `t` (a `sustain` tail keeps cycling past the clip's end). */
function specFrameAt(spec: AnimSpec, t: number) {
  const whole = specDuration(spec)
  const last = spec.frames - 1
  if (t >= whole - 1e-9) {
    const tail = spec.sustain ?? 0
    if (tail < 2) return last
    const from = spec.frames - tail
    const cycle = whole - frameStart(spec, from)
    t = frameStart(spec, from) + ((t - whole) % cycle)
  }
  let k = 0
  while (k < last && frameStart(spec, k + 1) <= t + 1e-9) k++
  return k
}

/** A frame's natural length (s). */
const frameSeconds = (spec: AnimSpec, frame: number) => (spec.hold?.[frame] ?? 1) / spec.fps

/**
 * The time into a clip of `spec` fitted to `seconds`, `elapsed` seconds after the frame that first shows it, played
 * from clip time `from` (a follow-through from its release frame). With the time for it, it plays at its own pace
 * and its last frame shows until `seconds`. Fitted into less, its last frame keeps `LAST_FRAME_SECONDS` but never
 * more than is left once every frame before it has had `FRAME_FLOOR_SECONDS` (so a display with as many frames as
 * the clip passes over none of them); the frames before share the rest, each at least one frame of a 30 Hz display
 * when the rest allows it, else equal shares, and what is over by their own lengths. Past `seconds` it is over (the
 * clip's whole length). Within a frame the time is kept clear of its edges, so rounding never shows a neighbour.
 */
export function fittedTime(spec: AnimSpec, elapsed: number, seconds: number, from = 0) {
  const whole = specDuration(spec)
  if (elapsed >= seconds - 1e-9) return whole
  const last = spec.frames - 1
  let first = 0
  while (first < last && frameStart(spec, first + 1) <= from + 1e-9) first++
  const pre = last - first
  // (The natural time the frames before the last take, from `from`.)
  const preNatural = Math.max(0, frameStart(spec, last) - from)
  let keep = Math.min(LAST_FRAME_SECONDS, Math.max(FRAME_FLOOR_SECONDS, seconds - pre * FRAME_FLOOR_SECONDS))
  if (pre > 0) keep = Math.min(keep, seconds / 2)
  const room = Math.max(0, seconds - keep)
  const inFrame = (k: number, fraction: number) =>
    frameStart(spec, k) + (0.001 + 0.998 * Math.max(0, Math.min(1, fraction))) * frameSeconds(spec, k)
  if (room + 1e-9 >= preNatural) {
    // Its own pace (a time on a frame's edge is the later frame's).
    const t = from + elapsed
    let k = first
    while (k < last && frameStart(spec, k + 1) <= t + 1e-6) k++
    if (k === first) return Math.max(from, Math.min(t, frameStart(spec, first) + 0.999 * frameSeconds(spec, first)))
    return inFrame(k, (t - frameStart(spec, k)) / frameSeconds(spec, k))
  }
  if (elapsed + 1e-6 >= room) return inFrame(last, (elapsed - room) / Math.max(1e-6, seconds - room))
  const floor = Math.min(LAST_FRAME_SECONDS, room / pre)
  const extra = Math.max(0, room - pre * floor)
  let at = 0
  for (let k = first; k < last; k++) {
    const natural = k === first ? frameStart(spec, k + 1) - from : frameSeconds(spec, k)
    const span = floor + (extra * natural) / Math.max(1e-9, preNatural)
    if (elapsed + 1e-6 < at + span || k === last - 1) {
      if (k === first) {
        const t = from + Math.max(0, Math.min(0.999, (elapsed - at) / span)) * natural
        return Math.max(t, frameStart(spec, k) + 0.001 * frameSeconds(spec, k))
      }
      return inFrame(k, (elapsed - at) / span)
    }
    at += span
  }
  return inFrame(last, 0)
}

/** The last step before a shot (s): the light is full there. */
const CUE_LAST_STEP = 1 / 60
export const newShotCue = (): ShotCue => ({ sheet: '', progress: 0, x: 0, y: 0 })
const shotCueScratch = newShotCue()
/** The sheet of the gathering light of each boss that throws or casts (sim.ts `bossSkin`; the king has none). */
const CUE_SHEETS: Record<string, string> = {
  crowBoss: 'prop:feather',
  foxBoss: 'prop:orb',
  beeBoss: 'prop:stinger'
}

export class ActorsView {
  /** The stretch of the stage the frame draws (the stage view's); without one every live enemy is drawn. */
  sight: Sight | null = null
  private time = 0
  /**
   * The clock the boss's and the enemies' clips run on: view time while the stage is in play; held once it is over
   * or the hero is down (the simulation holds them: a dash, a walk or a hover stands on the frame it had).
   */
  private bodyTime = 0
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
  /** Steps in a row the simulation has braked (`isSkidding`), and driven his body against his drawn facing. */
  private brakeSteps = 0
  private driveSteps = 0
  private driveWay: 1 | -1 = 1
  /**
   * His body's centre after this step and on the step before (rule 1), and where his pivot began (`PIVOT_RUN_PX`:
   * where he stood before the step it began on).
   */
  private stepX = NaN
  private lastX = NaN
  private pivotX = 0
  /** Steps in a row the picture decided on the steps has been a stand, and whether a run came before them (rule 5). */
  private standShown = 0
  private standFromRun = false
  /** Rule 1 was put off a step for the stand's second step: it is due on this one (`decideHeroFace`). */
  private ruleOneDue = false
  /** The skid under way is a brake's (not a carried slide's): its sound begins with its picture (`heroBrakeSkids`). */
  private skidBrake = false
  /** Steps the skid under way has shown on (a slide's skid out of a pose shows two before rule 1 turns him). */
  private skidSteps = 0
  /** Coasting to a stop after a hold, his speed falling every step: he stands (round 8d, rule 6). */
  private coasting = false
  /** The hit whose hurt a hold's pose played out (its invulnerability then: see `standStill` and `hurt`). */
  private hurtLed: number | null = null
  /** Steps in a row his live clip has been a stand, and the run's time he stood out of (rule 5). */
  private idleSteps = 2
  private runHold: number | null = null
  private coastSpeed = 0
  private skidTail = 0
  /** The braking under way is over for good as a skid (a pose or a bite covered it): it shows no more until it ends. */
  private skidGone = false
  /**
   * The simulation's facing he did not turn to because a moment's pose showed him as he was drawn (0: none): he keeps
   * the drawn facing until the player turns him or he moves that way (`decideHeroFace`).
   */
  private heroKeep: 0 | 1 | -1 = 0
  /** The hero's facing as the last display frame (`update`) shows it (0: none yet). */
  private heroShownFace: 0 | 1 | -1 = 0
  /**
   * The hero's facing as the display frame before shows it: a moment begun after this frame's update (a staged
   * moment queued behind another) is taken before this frame is drawn.
   */
  private heroDrawnFace: 0 | 1 | -1 = 0
  /** This display frame's `update` has run (it is not drawn yet): see `beginFrame`. */
  private frameUpdated = false
  /** The display frames are announced (`beginFrame`, by `PlaySession`). */
  private framed = false
  /** The hero's clip as the last display frame shows it. */
  private heroShownClip = ''
  /** The hero's blink has its own random numbers (the particles' depend on how the frames fell). */
  private blinkSeed = 0x2f6b1e9d
  /** Out of a pose, still carried against the facing it showed him with: drawn standing (see `endPose`). */
  private heroDrift = false
  /** The facing a skid began with (a turn of his ends it). */
  private skidFace: 1 | -1 = 1
  private heroShownT = 0
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
  /** The side his last bite bit (`bite`'s `dir`): the bite is drawn facing it to its end. */
  private biteDir: 1 | -1 = 1
  /**
   * The hero's drawn facing (see `decideHeroFace`), how long since it turned (the simulation's time and the
   * hit-stops), the furthest his body went the way he faces since, the action whose facing it keeps, and that facing.
   */
  private heroFace: 1 | -1 = 1
  private heroFaced = false
  private heroFaceAge = 99
  private heroFurthest = 0
  private heroAction = ''
  private heroActionFace: 1 | -1 = 1
  /** An action of his began again (a new bite, landing, pivot or skid) since his facing was last decided. */
  private heroFresh = ''
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
  /**
   * The flinch's simulation seconds left (counted on the steps: what he does and which way he faces never wait for
   * a frame), and whether no display frame has shown it yet (its clock starts on the first that does).
   */
  private flinchLeft = 0
  private flinchFresh = false
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
  private castFrom = 0
  private castTail = 0
  /** The seconds the cast's follow-through is played over (decided when the release begins). */
  /** The follow-through's simulation seconds left (counted on the steps). */
  private castLeft = 0
  /** The simulation's time as the view counts its steps, and when a flinch and a follow-through began on it. */
  private stepClock = 0
  private flinchStepAt = 0
  private castStepAt = 0
  /** A fresh flinch or release that a display frame has drawn once (see `firstFrame`). */
  private freshDrawn = { flinch: false, cast: false }
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
  /** The transformation cut the king's volley: its follow-through does not come back. */
  private volleyCut = false
  /** View time his last dash began, and his tread's gain then. */
  private dashAt: number | null = null
  /** A dash begun on a step that no display frame has shown yet (its clock starts on the first). */
  private dashFresh = false
  /** The state the last display frame drew him in (a clip that takes over inside it: `clipFrom`). */
  private clipState: BossState | null = null
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
  /** `simStep` drives the view: its decisions are made on the simulation's steps (see `simStep`). */
  private stepDriven = false
  /** `boss-slam` came: the recovery it begins shows its landing (a cut does not carry over the impact). */
  private slamImpact = false
  /**
   * A heavy boss (the bear, the ape, the king) that came down from a real fall (`FALL_LAND_PX` or more) in any
   * state but his slam: when he touched down (view time), and the top of the fall while he is in the air.
   */
  private fallLandAt: number | null = null
  private fallLandSeconds = 1
  /** The frame a fitted clip of the boss's has been stepped to (see `stepFitted`). */
  private fitShown = { name: '', key: '' as string, frame: 0, t: 0, paced: null as boolean | null }
  /** A fall's landing has begun in his state (see `BossSnapshot.dashOver`). */
  private dashLanded = false
  /** The `fallLandAt` of the landing a display frame has drawn (its touchdown has been seen). */
  private fallLandSeen: number | null = null
  /** A landing begun on a step that no display frame has shown yet (its clock starts on the first). */
  private fallLandFresh = false
  /** Hit-stop seconds to credit to the facing holds after this step's decisions (see `heldFor`). */
  private heldCredit = 0
  /** The steps in a row he has been off the ground (see `landHolds`). */
  private bossAirSteps = 0
  private bossAirTop = 0
  private fallGrounded = true
  /** He falls out of his walk or wind-up (see `decideBossFace`): the furthest point his body reached the way he faces, and whether he turned in this fall. */
  private bossFalling = false
  private bossAirX = 0
  private bossAirTurned = false
  /** The steps in a row he has moved no faster than `DASH_REST_SPEED` (see `bossBetweenActions`). */
  private bossSlowSteps = 0
  /** He has just begun to walk (his `idle` after another state): his first step sets his facing. */
  private bossSetOff = false
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
  /**
   * A simulation step has been answered since the last display frame's tick. A pose taken on a step is first drawn
   * after the tick of its own frame: its clock starts at that tick (`Pose.fromStep`, `tickReal`), so that the frame
   * which first shows the pose shows the clip it leads with where the step left it, whatever the frame's length.
   */
  private stepPhase = false
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
      face: options.face ?? 0,
      own: false,
      fromStep: this.stepPhase
    }
    if (who === 'hero' && !options.face) {
      pose.face = this.liveHeroFace()
      pose.own = true
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
   * Ends `who`'s pose. The hero comes out of it facing as it showed him (turned to ハム姫 for his cheer, he keeps
   * facing her until he really turns).
   */
  private endPose(who: PoseTarget, bodyTakesOver = false) {
    const pose = this.poses[who]
    if (!pose) return
    delete this.poses[who]
    // What of his own the pose covered (a bite, a hurt, a landing still due, a skid, a pivot) does not come back
    // after it. A pose with no face of its own showed him as he was drawn: he comes out of it so, and keeps that
    // facing until he really turns (`heroKeep`).
    if (who === 'hero') {
      const p = this.world.player
      // (When his own body takes over, what it does now is new and shows.)
      if (!bodyTakesOver) {
        if (p.biteTimer > 0) this.biteGone = true
        if (this.hurtLive()) this.hurtGone = true
        if (this.hardLanding) this.landGone = true
      }
      // Carried against the facing the pose showed him with (out of a skid, a knock, a bite's lunge), he is never
      // drawn running: faster than a walk he skids, from its first frame, facing as the pose showed him; slower, he
      // stands while he drifts (`heroDrift`).
      this.skidGone = false
      const shown = pose.face !== 0 ? pose.face : this.heroFace
      const carried = p.onGround && p.vx * shown < 0 && Math.abs(p.vx) > RUN_THRESHOLD
      const skids = carried && Math.abs(p.vx) > SKID_SPEED
      this.skidAge = skids ? 0 : null
      this.skidSteps = 0
      this.skidTail = 0
      this.heroDrift = carried
      // (Running on the same way when it ends, he only coasts to a stop unless the player runs him: rule 6.)
      this.coasting = p.onGround && !carried && Math.abs(p.vx) > RUN_THRESHOLD
      this.coastSpeed = Math.abs(p.vx)
      // (The pose stood him: no run's frame is held over into a stand.)
      this.runHold = null
      this.idleSteps = 2
      if (skids) {
        this.heroFresh = 'skid'
        this.skidFace = p.facing
        this.skidBrake = false
      }
      this.turnAge = null
      if (this.heroAction === 'skid' || this.heroAction === 'turn') this.heroAction = ''
      // He comes out of any pose as it showed him (his own facing, or the way a moment turned him, to ハム姫 for
      // his cheer), and keeps it until he really turns.
      if (pose.face !== 0) {
        this.heroFace = pose.face
        this.heroFaced = true
        this.heroKeep = p.facing !== this.heroFace ? p.facing : 0
      }
    }
    // The state's clock stood still while the pose played: what shows next begins, it does not resume.
    const boss = this.world.boss
    if (who === 'boss' && boss && !boss.dead) this.cutState(boss.stateTime)
  }

  /**
   * Whether a landing cut on the ground in his slam (he touched down while a moment held him, or on the step of the
   * phase change) stays cut into the recovery that follows: there is no new touchdown to land on.
   */
  private carriesCut(state: BossState, before: BossState | null) {
    return this.landCut && !this.slamImpact && state === 'recover' && before === 'slam'
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
    const p = this.world.player
    let live = this.death || p.dead || this.dropping() ? null : this.heroSnapshot()
    // (A bite the last frame showed, which gave way to his run on this very step, plays out under the hold: the
    // hold stops him.)
    if (live && live.name !== 'bite' && live.name !== 'hurt' && this.heroShownClip === 'bite' && p.biteTimer > 0) {
      this.biteGone = false
      live = { name: 'bite', t: this.heroShownT }
    }
    const pose = this.pose('hero', 'idle', seconds, face ? { face } : {}) as Pose
    if (live?.name === 'hurt') this.hurtLed = p.invuln
    if (live?.name === 'bite' || live?.name === 'hurt') {
      // (A bite or a hurt under way plays out on real time first, from where the step left it.)
      const rest = specDuration(HERO_SPEC[live.name]) - live.t
      if (rest > 0) pose.lead = { clip: live.name, from: live.t, seconds: rest }
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
    // A hero hit on the step a hold began flinches under it, on real time, from its first frame (round 8d).
    const held = this.poses.hero
    const p = this.world.player
    if (held && held.clip === 'idle' && !held.lead && this.hurtLed === null && this.hurtLive() && !this.hurtGone) {
      const age = this.realTime - held.start
      held.lead = { clip: 'hurt', from: -age, seconds: age + specDuration(HERO_SPEC.hurt) }
      this.hurtLed = p.invuln
    }
    this.stepPhase = false
    // A pose taken on a step starts its clock at the tick of the frame that first draws it, whatever its length.
    for (const who of ['hero', 'boss'] as const) {
      const pose = this.poses[who]
      if (!pose?.fromStep) continue
      pose.fromStep = false
      pose.until += this.realTime - pose.start
      pose.start = this.realTime
    }
    // The time since a body last turned runs on real time: a turn twice in a moment is a flicker on the screen,
    // whether or not a hit-stop holds the simulation in between.
    if (!this.stepDriven) {
      this.bossFaceAge += dt
      this.heroFaceAge += dt
      for (const timers of this.enemyTimers.values()) timers.faceAge += dt
    }
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
    return d ? { x: this.deathX(d), y: this.deathFeet(d) - d.h / 2 } : null
  }

  /** Where the hero's knocked-out body comes to lie (its centre): null while he lives, and over a pit. */
  deathRest(): { x: number; y: number } | null {
    const d = this.death
    return d && d.ground !== null ? { x: d.x1, y: d.ground - d.h / 2 } : null
  }

  /** The knocked-out body's middle now: moving clear of a wall over `DIE_CLEAR_SECONDS`, easing out (round 8f). */
  private deathX(d: Fall) {
    const k = Math.min(1, Math.max(0, d.age / DIE_CLEAR_SECONDS))
    return d.x + (d.x1 - d.x) * (1 - (1 - k) * (1 - k))
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
        this.heroFresh = 'land'
        break
      }
      case 'bite':
        this.squash = -0.1
        this.biteGone = false
        this.biteDir = event.dir
        this.heroFresh = 'bite'
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
        // (A hurt a hold's pose already played out, answered only when the simulation runs again, is over.)
        this.hurtGone = this.hurtLed !== null && p.invuln === this.hurtLed
        this.hurtLed = null
        if (this.hurtGone) break
        this.hurtFace = event.dir > 0 ? -1 : 1
        // The player's own body takes over from a staged pose (see `update`).
        if (this.world.state === 'play') delete this.poses.hero
        break
      case 'dead': {
        const x = p.x + p.w / 2
        const y0 = p.y + p.h
        // He comes to lie on the ground under his middle, his body clear of every wall (round 8f): past a ledge's
        // edge he tumbles outward as he falls on to the ground below; a hole narrower than his lying body he lies
        // across; over a pit he keeps tumbling.
        // (His first frame is drawn clear of a wall beside him; he then eases to where he will lie. Under a ceiling
        // his hop is lower: no frame reaches into it.)
        // (A body the simulation left in or against a solid on this step, a felled log landing on him, is drawn from
        // the nearest place clear of it, round 8g: from there he tumbles and lies by the same rules.)
        const flip = p.facing < 0
        let start = deathStartX(this.world, x, y0, flip)
        let feet = y0
        let rest = deathRestPlace(this.world, x, y0)
        if (
          !dieClear(this.world, start, y0, flip ? DIE_HIT_FRONT : DIE_HIT_BACK, flip ? DIE_HIT_BACK : DIE_HIT_FRONT)
        ) {
          const out = deathClearPlace(this.world, x, y0)
          if (out) {
            start = out.x
            feet = out.feet
            rest = deathRestPlace(this.world, out.x, out.feet)
          }
        }
        this.death = {
          x: start,
          x1: rest.x,
          y0: feet,
          ground: rest.ground,
          age: 0,
          landAt: null,
          flip: p.facing < 0,
          h: p.h,
          toss: tossUnder(this.world, p.inWater ? WATER_TOSS : LAND_TOSS, start, rest.x, feet)
        }
        break
      }
      case 'enemy-hit': {
        const enemy = this.world.enemies.find((e) => e.id === event.id)
        if (!enemy) break
        // A bite a squirrel survives during its throw (or just before it) is the white flash over the throw.
        const timers = this.timersOf(enemy)
        timers.hitDir = event.dir
        timers.hurtShown =
          enemy.kind !== 'spitter' || spitterHurtShows(enemy.shootTimer, ENEMY_SPEC.spitter.shoot, timers.throwCut)
        break
      }
      case 'spit': {
        const enemy = this.world.enemies.find((e) => e.id === event.id)
        if (!enemy) break
        const timers = this.timersOf(enemy)
        timers.spitAt = this.world.time
        // (A throw begun again that no frame has shown yet, or one held back, shows no release: it is given up.)
        const unseen = timers.throwFresh || timers.throwHeld
        timers.throwFresh = false
        timers.throwHeld = false
        if (timers.face === event.dir && !unseen) {
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
          noteTurn(timers.tread)
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
        this.joltAt = this.bodyTime
        if (boss) {
          this.joltDir = boss.x + boss.w / 2 >= p.x + p.w / 2 ? 1 : -1
          // The flinch is decided now: it starts (again from its first frame), fitted to the time there is.
          const seconds = flinchFit(this.fillBoss(boss), bossSheetSpec(boss.def.kind, boss.def.art))
          if (seconds > 0) {
            this.flinchAt = this.bodyTime
            this.flinchSeconds = seconds
            // (Counted from the step after the hit's: its picture's clock starts on the frame after that step.)
            this.flinchLeft = seconds + SIM_STEP
            this.flinchStepAt = this.stepClock
            this.flinchFresh = true
            this.dropCast()
          }
        }
        break
      }
      case 'boss-slam':
        // The impact always begins a landing, whatever a staged pose cut before it.
        this.slamImpact = true
        this.landCut = false
        break
      case 'boss-crash':
        // The body answers the crash, stunned or not: a jolt back from the wall it ran into.
        this.joltAt = this.bodyTime
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
            this.fitRelease(boss)
          } else {
            // The hero crossed on the very step of the shot: no release frame turned round, no follow-through.
            this.dropCast()
            this.castStats.givenUp++
          }
        }
        // A shot that leaves without a pose: the next shot is decided afresh.
        this.castRefused = false
        this.castRestarts = 0
        // (His shot never turns his body: its light showed where it goes.)
        break
      }
      case 'minion': {
        const boss = this.world.boss
        break
      }
      case 'boss-phase':
        this.rageAt = this.bodyTime
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
          hitDir: 0,
          spitAt: NaN,
          throwFrom: undefined,
          throwFresh: false,
          throwHeld: false,
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

  /** A display frame begins (before its steps): what the last one showed is on the screen. */
  beginFrame() {
    this.framed = true
    this.frameUpdated = false
  }

  update(dt: number) {
    this.time += dt
    this.frameUpdated = true
    const world = this.world
    // (What the simulation holds once the stage is over or the hero is down stands still in the picture too.)
    const held = world.state !== 'play'
    const bodyDt = held ? 0 : dt
    this.bodyTime += bodyDt
    const p = world.player
    // hero timers (under a staged pose his squash settles on real time: see `tickReal`)
    if (!this.poses.hero) this.relaxSquash(dt)
    // (What his body does, his blinks too, is decided on the simulation's steps: `stepHero`; without them, on the
    // display frame.)
    if (!this.stepDriven) this.stepHero(dt)
    // While the simulation runs, a staged hero pose ends as soon as his own body does something else (not on the
    // frame that set it: see `Pose.seen`).
    const pose = this.poses.hero
    const moves = Math.abs(p.vx) > RUN_THRESHOLD || !p.onGround || p.biteTimer > 0
    if (pose && !pose.seen) pose.seen = true
    else if (pose && dt > 0 && world.state === 'play' && moves) this.endPose('hero', true)
    if (this.clearDrop) this.updateDrop(this.clearDrop, dt)
    // (While a staged pose covers him, what of his own it covers is over for good: no step runs then.)
    if (this.poses.hero) this.settleHero()
    // enemies
    for (const enemy of world.enemies) {
      if (enemy.dead) continue
      const timers = this.timersOf(enemy)
      if (enemy.onGround && !timers.onGround) timers.landAge = 0
      else timers.landAge += bodyDt
      timers.onGround = enemy.onGround
      // (Whether it is in the air is decided on the simulation's steps, `simStep`; without them, here.)
      if (!this.stepDriven) this.stepAloft(enemy, timers)
      if (!timers.shown) this.settleBirth(enemy, timers)
      // What it does (walks or marks time, which way it faces) is decided on the simulation's steps (`simStep`);
      // without them (a view driven on its own) on the display frame.
      if (!this.stepDriven) {
        stepTread(timers.tread, enemy.x + enemy.w / 2, bodyDt, enemy.onGround)
        if (bodyDt > 0) this.decideEnemy(enemy, timers)
      }
      // Only the walkers' picture is ever held still (they walk on the ground).
      stepPicture(timers.tread, enemy.x + enemy.w / 2, bodyDt, enemy.kind === 'walker' || enemy.kind === 'tough')
      if (bodyDt > 0) timers.gain += drawnGain(timers.tread, timers.face, enemy.x + enemy.w / 2)
      // A throw begun again on a step is drawn from its first frame on the frame that first shows it.
      if (timers.throwFresh) {
        timers.throwFresh = false
        if (enemy.shootTimer > 0) timers.throwFrom = enemy.shootTimer
      }
    }
    this.started = true
    this.updateBoss(bodyDt)
    this.updateTrail(bodyDt)
    if (!this.death && !this.world.player.dead) {
      this.heroDrawnFace = this.heroShownFace
      this.heroShownFace = this.heroFlip() ? -1 : 1
      const shown = this.selectHero()
      this.heroShownClip = shown?.name ?? ''
      this.heroShownT = shown?.t ?? 0
    }
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
      // A boss lying on ground that went from under him (the arena's gate lowered under him) goes at once, in his
      // burst, as an enemy's body does (he never lies in the air).
      if (g.end === 'boom' && !g.flight && (!g.fall || g.age >= g.fall.at - 1e-6)) {
        const under = groundBelow(world, g.x, g.y, 2)
        const lies = under !== null && under <= g.y + 1
        if (lies) g.lay = true
        else if (g.lay) g.life = Math.min(g.life, g.age)
      }
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
   * One step (or frame, without `simStep`) of the hero's own records: on the ground or in the air and for how long,
   * the ground his run covers, how long he has stood, his skid and his pivot, what of his actions is over for good
   * (`settleHero`), and his drawn facing (`decideHeroFace`).
   */
  private stepHero(dt: number) {
    const p = this.world.player
    this.blinkAge += dt
    this.nextBlink -= dt
    if (this.nextBlink <= 0) {
      this.blinkAge = 0
      this.nextBlink = 2 + this.blinkRand() * 2
    }
    if (p.onGround) {
      this.airTime = 0
      this.landAge += dt
    } else {
      this.airTime += this.wasGround ? 0 : dt
    }
    this.wasGround = p.onGround
    if (p.onGround) this.distance += Math.abs(p.vx) * dt
    // (Standing out of a stand until his body goes faster than `RUN_START_SPEED`: his breath goes on, see `standOrRun`.)
    const still =
      p.onGround &&
      p.biteTimer <= 0 &&
      (Math.abs(p.vx) <= RUN_THRESHOLD || (this.standShown > 0 && Math.abs(p.vx) < RUN_START_SPEED))
    this.idleTime = still ? this.idleTime + dt : 0
    if (!still) this.waitCut = -1
    // The skid is a brake at speed that has taken hold (round 8d): drawn from the third step of the simulation's own
    // braking (`isSkidding`), turned to the key's side whatever the hold says, for as long as he brakes and its short
    // tail (two steps at least); a tap of one or two steps against a run changes nothing. Carried against the facing
    // he is drawn with with no turn asked (a knock-back's slide) faster than `CARRIED_SKID_SPEED`, he skids too,
    // facing as he is drawn. A turn of his to his travel ends a skid (rule 1, `decideHeroFace`).
    // (Driven against his drawn facing: the simulation faces the other way and his body has gone that way.)
    // (A swimming body is slower: the water takes 14 % of his speed a step, so his first stroke from a stand goes
    // 18.6 px/s; `DRIVE_SPEED_WATER`.)
    const bodyX = p.x + p.w / 2
    // (A body a knock still carries, `knockX`, is not driven by the player: its drift turns nothing, round 8f.)
    const driven =
      !p.knockX &&
      p.facing !== this.heroFace &&
      p.vx * p.facing > (p.inWater ? DRIVE_SPEED_WATER : RUN_THRESHOLD) &&
      !Number.isNaN(this.stepX) &&
      (bodyX - this.stepX) * p.facing > 0
    // (Two steps running the same way: a drive one way, then the other, as the keys dither, is no drive, round 8e.)
    this.driveSteps = !driven ? 0 : p.facing === this.driveWay ? this.driveSteps + 1 : 1
    this.driveWay = p.facing
    this.lastX = this.stepX
    this.stepX = bodyX
    const travel: 1 | -1 = p.vx > 0 ? 1 : -1
    this.brakeSteps = isSkidding(p) ? this.brakeSteps + 1 : 0
    // (No turn asked: not within the hold of a turn of his, a pivot's remainder included: rule 3.)
    const carried =
      p.onGround &&
      p.facing === this.heroFace &&
      p.vx * this.heroFace < 0 &&
      Math.abs(p.vx) > CARRIED_SKID_SPEED &&
      this.turnAge === null &&
      this.heroFaceAge >= FACE_HOLD
    // (Already drawn facing the key's side, a turn shown in the air before he lands into his brake: there is no tap
    // to wait out; the brake shows from its first step on the ground, round 8e.)
    const turnedBrake = isSkidding(p) && p.facing === this.heroFace
    const skidding = this.brakeSteps >= BRAKE_STEPS || turnedBrake || carried
    if (!skidding) this.skidGone = false
    if (skidding && this.skidGone && !carried) {
      // (Over for good: no skid until this braking ends.)
      this.skidAge = null
    } else if (skidding) {
      const fresh = !(this.skidding && this.skidAge !== null)
      this.skidAge = fresh ? 0 : this.skidAge! + dt
      if (fresh) {
        this.heroFresh = 'skid'
        this.skidFace = p.facing
        this.skidBrake = this.brakeSteps >= BRAKE_STEPS || turnedBrake
      }
      this.skidGone = false
    } else if (this.skidAge !== null) {
      this.skidTail += dt
      this.skidAge += dt
      // (Its tail runs on into a reversal while his body is driven the new way, until rule 1 turns him: rule 5.)
      if (this.skidTail > SKID_TAIL && this.skidAge >= 2 * SIM_STEP - 1e-9 && this.driveSteps === 0) this.skidAge = null
    }
    void travel
    this.skidSteps = this.skidAge === null ? 0 : this.skidSteps + 1
    if (skidding) this.skidTail = 0
    this.skidding = skidding
    if (this.heroDrift && !(p.onGround && p.vx * this.heroFace < 0 && Math.abs(p.vx) > RUN_THRESHOLD))
      this.heroDrift = false
    // The hero's pivot is the picture of a turn of his drawn facing: it begins where that turns (`decideHeroFace`); it
    // gives way to his run once his body has gone `PIVOT_RUN_PX` the way he turned, and it never slides: carried
    // `PIVOT_SLIDE_PX` back the old way (the player's keys dither while he slides) it is over too, and he stands until
    // rule 1 turns him to his travel (round 8e).
    if (p.facing !== this.lastFacing) this.lastFacing = p.facing
    const x = p.x + p.w / 2
    if (this.turnAge !== null) {
      this.turnAge += dt
      const way = (x - this.pivotX) * this.heroFace
      const gone = way > PIVOT_RUN_PX || -way > PIVOT_SLIDE_PX
      if (!p.onGround || this.turnAge > 0.5 || gone) this.turnAge = null
    }
    // After a hold he only coasts to a stop: he stands (the moment showed him standing).
    if (this.coasting && !(p.onGround && Math.abs(p.vx) < this.coastSpeed - 1e-6 && Math.abs(p.vx) > 0))
      this.coasting = false
    this.coastSpeed = Math.abs(p.vx)
    this.waterTime = p.inWater ? this.waterTime + dt : 0
    // (The hit a hold played out is over once its hurt is: every blow sets the same invulnerability, so a later
    // blow would read as the one already played and never flinch, round 8e.)
    if (!this.hurtLive()) this.hurtLed = null
    this.settleHero()
    this.decideHeroFace()
    this.noteStand()
  }

  private blinkRand() {
    let t = (this.blinkSeed = (this.blinkSeed + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Whether the hold lets the hero's drawn facing turn to `way` now (an action is begun turned only by the hold). */
  private heroMayHold(way: 1 | -1) {
    return way === this.heroFace || this.heroFaceAge >= FACE_HOLD
  }

  /**
   * Whether the hero's drawn facing may turn to `way` now, his body at `x`: not within the hold, unless his body has
   * gone the decisive distance on the ground (in the air a turn has the hold alone).
   */
  private heroMayTurn(way: 1 | -1, x: number) {
    if (this.heroMayHold(way)) return true
    return this.world.player.onGround && way * (x - this.heroFurthest) >= DECISIVE_PX - 1e-6
  }

  /**
   * The hero's drawn facing. An action of his keeps the facing it began with to its end (the bite the side it bit,
   * the landing, the skid, the pivot, the fidget) and gives way when another clip takes its place; otherwise he
   * faces his own way, by the walkers' rule: a turn is drawn at once, a second one within `FACE_HOLD` only once his
   * body has gone `DECISIVE_PX` the new way.
   */
  private decideHeroFace() {
    const p = this.world.player
    if (this.death || p.dead) return
    const x = p.x + p.w / 2
    if (!this.heroFaced) {
      this.heroFaced = true
      this.heroFace = p.facing
      this.heroFurthest = x
    }
    // (The decisive distance is gone on the ground: in the air he is measured from where he comes down.)
    if (this.heroFace * (x - this.heroFurthest) > 0 || !p.onGround) this.heroFurthest = x
    // (An action is begun turned only by the hold, `heroMayHold`: the distance his body went turns his run,
    // `heroMayTurn`, not a pose.)
    // An action begins facing its own way: a bite the side it bit, at once, whatever the hold says (the player
    // commanded it; it is a cause of its own, as a blow is); a landing, a skid or a fidget his way then, or the
    // facing he is drawn with when the hold does not yet let him turn the way it leans.
    const name = this.selectHero()?.name ?? ''
    const fresh = this.heroFresh === name
    this.heroFresh = ''
    // His hurt faces the blow (he is thrown back), from its first frame; what follows keeps that facing for the hold.
    if (name === 'hurt') {
      this.heroAction = name
      this.heroKeep = 0
      if (this.hurtFace !== this.heroFace) {
        this.heroFace = this.hurtFace
        this.heroFaceAge = 0
        this.heroFurthest = x
      }
      return
    }
    // Out of a moment's pose he keeps the facing it showed until the player turns him or he moves the way the
    // simulation faces (`heroKeep`); a bite turns him as it always does.
    if (this.heroKeep !== 0) {
      const moves = Math.abs(p.vx) > RUN_THRESHOLD && (p.vx > 0 ? 1 : -1) === this.heroKeep
      if (p.facing !== this.heroKeep || moves || name === 'bite') this.heroKeep = 0
    }
    // While a knock still carries him (`knockX`) the simulation's facing is the one from before the blow (a knock
    // takes no key): his body is not driven and nothing turns him but a bite of his (round 8f). After it he keeps his
    // facing until the player turns him or runs him that way (`heroKeep`), as out of a pose.
    if (p.knockX && name !== 'bite') {
      if (p.facing !== this.heroFace) this.heroKeep = p.facing
      return
    }
    // Rule 1 (round 8d): a turn toward the way his body goes is never held. The simulation faces the other way and
    // his body has gone that way for two steps running: he turns, on the ground or in the air, and runs (a skid or a
    // pivot of the other way is over).
    // (A turn rule 1 put off a step, below, is due on the next while his body still goes that way, slowing or not.)
    const due = this.ruleOneDue && p.facing !== this.heroFace && (x - this.lastX) * p.facing > 0.01
    this.ruleOneDue = false
    if ((this.driveSteps >= 2 || due) && p.facing !== this.heroFace && name !== 'bite' && name !== 'land') {
      // (Rule 5 first: out of a run he has stood one step only, the run's frame held on the first: he stands this
      // step too, and turns on the next. A stand of one step between two runs is no picture.)
      if (p.onGround && this.standShown === 1 && this.standFromRun && !due) {
        this.ruleOneDue = true
        return
      }
      // (Nor a slide's skid of one step: out of a pose that showed him facing back, carried on by his run, he skids
      // two steps, then turns, round 8e.)
      // (`skidSteps` counts this step: it has shown on `skidSteps - 1` steps before.)
      if (this.skidAge !== null && !this.skidBrake && this.skidSteps < 3) return
      this.heroFace = p.facing
      this.heroFaceAge = 0
      this.heroFurthest = x
      this.heroKeep = 0
      this.heroDrift = false
      this.turnAge = null
      if (this.skidAge !== null) {
        this.skidAge = null
        this.skidGone = this.skidding
      }
      this.heroAction = ''
      return
    }
    const own: 1 | -1 = this.heroKeep !== 0 ? this.heroFace : p.facing
    let want: 1 | -1 = own
    if (HERO_ACTIONS.includes(name)) {
      if (name !== this.heroAction || fresh) {
        this.heroAction = name
        // (A skid is a brake: it turns him to the key's side whatever the hold says.)
        this.heroActionFace =
          name === 'bite'
            ? this.biteDir
            : name === 'skid'
              ? isSkidding(p)
                ? own
                : this.heroFace
              : name === 'wait' || name === 'turn' || !this.heroMayHold(own)
                ? this.heroFace
                : own
      }
      want = this.heroActionFace
    } else this.heroAction = ''
    if (want === this.heroFace) return
    // (Braking at speed before the brake has taken hold: nothing changes in the picture.)
    if (!HERO_ACTIONS.includes(name) && isSkidding(p)) return
    if (HERO_ACTIONS.includes(name) || this.heroMayTurn(want, x)) {
      const held = this.heroFaceAge < FACE_HOLD
      this.heroFace = want
      this.heroDrift = false
      this.heroFaceAge = 0
      this.heroFurthest = x
      // A drawn turn on the ground at a walking pace or less is a pivot on the spot: it begins on this step (not a
      // turn the distance his body went made within the hold: that one he runs into).
      if (!HERO_ACTIONS.includes(name) && !held && p.onGround && Math.abs(p.vx) <= SKID_SPEED) {
        this.turnAge = 0
        // (Measured from where he stood before this step, unless this step's move was not his own: put back, pushed.)
        const own = !Number.isNaN(this.lastX) && Math.abs(x - this.lastX) <= Math.abs(p.vx) * SIM_STEP + 1
        this.pivotX = own ? this.lastX : x
        this.heroAction = 'turn'
        this.heroActionFace = want
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
    // A skid a bite or a hurt covers is over for good: it does not take over in its middle when they end.
    if (this.skidAge !== null && (name === 'bite' || name === 'hurt')) {
      this.skidAge = null
      this.skidGone = this.skidding
    }
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

  /**
   * The hero's live clip. Nothing of his walk shows for a single step between two runs (rule 5): his first step
   * standing out of a run holds the run's frame.
   */
  private heroSnapshot() {
    const c = this.standOrRun()
    // (Nor while his body is already driven the other way, rule 1 about to turn him into his run.)
    if (
      c &&
      (c.name === 'idle' || c.name === 'blink') &&
      this.runHold !== null &&
      // (A stop leaves his speed a hair under zero, -1e-14: that is a stop, not a move back.)
      this.world.player.vx * this.heroFace > -1e-6 &&
      (this.idleSteps < 2 || this.driveSteps >= 1)
    )
      return { name: 'run', t: this.runHold }
    return c
  }

  /** Records, on a step, how long he has stood and the run's frame he stood out of (see `heroSnapshot`). */
  private noteStand() {
    const raw = this.standOrRun()
    const stands = raw !== null && (raw.name === 'idle' || raw.name === 'blink')
    if (stands && this.driveSteps === 0) this.idleSteps++
    else if (stands) this.idleSteps = Math.min(this.idleSteps, 1)
    else {
      this.idleSteps = 0
      this.runHold = raw?.name === 'run' ? raw.t : null
    }
    // (What the step shows: a stand of how many steps, and whether a run came before it; see rule 1's wait.)
    const shown = this.heroSnapshot()?.name
    if (shown === 'idle' || shown === 'blink') this.standShown++
    else {
      this.standShown = 0
      this.standFromRun = shown === 'run'
    }
  }

  /**
   * Whether the hero is drawn in a brake's skid now (a carried slide's is not one): the skid's sound begins with
   * its picture, on the display frame that first shows it (`SoundBoard.update`).
   */
  heroBrakeSkids(): boolean {
    return this.heroShownClip === 'skid' && this.skidBrake && this.skidAge !== null
  }

  /**
   * His clip as his body decides it, but out of a stand that shows he runs only once his body goes faster than
   * `RUN_START_SPEED` (round 8e): a body that jitters on the spot as the keys dither (25 px/s one step, 7 back the
   * next) stands, rather than a run's frame and a stand taking turns on every step.
   */
  private standOrRun() {
    const c = this.rawHeroSnapshot()
    if (c?.name === 'run' && this.standShown > 0 && Math.abs(this.world.player.vx) < RUN_START_SPEED)
      return this.rawHeroSnapshot(true)
    return c
  }

  private rawHeroSnapshot(stands = false) {
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
      // (Drifting against the facing a pose left him with, he stands: see `heroDrift`.)
      vx: stands || ((this.heroDrift || this.coasting) && this.skidAge === null) ? 0 : p.vx,
      // (Carried against the facing he is drawn with, he is never drawn running: he stands, or skids.)
      carriedBack: p.onGround && p.vx * this.heroFace < 0,
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
      if (anim) blit(ctx, anim, choice.t, this.deathX(d), this.deathFeet(d), brush(d.flip, undefined, choice.frame))
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
      // (With no face of the moment's own he keeps the facing he is drawn with: a hold does not turn him.)
      const flip = staged.face ? staged.face < 0 : this.drawnFace() < 0
      blit(ctx, staged.anim, staged.age, x, y - staged.lift, brush(flip, undefined, undefined, sx, sy))
      return
    }
    const choice = this.selectHero()!
    const anim = clip('hero', choice.name)
    if (!anim) return
    if (choice.name === 'run') this.runContact(anim, choice, x, y)
    else this.lastRunFrame = -1
    this.drawShadow(ctx, x, y, p.w)
    if (this.heroBlinkedOut(choice)) return
    const { sx, sy } = squashScale(this.squash, squash)
    blit(ctx, anim, choice.t, x, y, brush(this.flipFor(choice), undefined, choice.frame, sx, sy))
  }

  /**
   * He flickers while invulnerable, after the hurt reaction: hidden on every other twentieth of a second of time that
   * runs. While the simulation is held (a moment's hold, a hit-stop) he is on the screen.
   */
  private heroBlinkedOut(choice: ClipChoice) {
    const p = this.world.player
    if (p.invuln <= 0 || choice.name === 'hurt' || this.held) return false
    return Math.floor(this.realTime * 20) % 2 === 0
  }

  /**
   * Whether the hero is drawn on this frame (`drawHero` draws him): false while he is knocked out of the stage, and
   * on the hidden phase of his invulnerability's flicker (which never hides him while the simulation is held).
   */
  heroDrawn(): boolean {
    const p = this.world.player
    if (this.death) return true
    if (p.dead) return false
    if (!this.dropping() && this.activePose('hero', 'hero')) return true
    const choice = this.selectHero()
    if (!choice || !clip('hero', choice.name)) return false
    return !this.heroBlinkedOut(choice)
  }

  /**
   * The facing the hero's live clip is drawn with now: a hurt the blow's, a bite the side it bit (also on the step
   * they begin, before the step's decisions), else his drawn facing.
   */
  private liveHeroFace(): 1 | -1 {
    const live = this.death || this.world.player.dead || this.dropping() ? null : this.heroSnapshot()
    if (live?.name === 'hurt') return this.hurtFace
    if (live?.name === 'bite') return this.biteDir
    // (The facing the last display frame showed: a turn decided on the step the moment begins is not drawn. Taken
    // after this frame's update, before it is drawn, the last frame drawn is the one before.)
    const shown = this.framed && this.frameUpdated ? this.heroDrawnFace : this.heroShownFace
    return shown || this.drawnFace()
  }

  /** The facing the hero is drawn with in play (before any step: the simulation's). */
  private drawnFace(): 1 | -1 {
    return this.heroFaced ? this.heroFace : this.world.player.facing
  }

  /** The hero's drawn facing (true: left) with `choice`: his own, but his hurt faces the blow (he is thrown back). */
  private flipFor(choice: ClipChoice) {
    if (choice.name === 'hurt' && !this.heroFaced) return this.hurtFace < 0
    return (this.heroFaced ? this.heroFace : this.world.player.facing) < 0
  }

  /** The hero's drawn facing while he plays (true: left). */
  heroFlip(): boolean {
    const staged = this.dropping() ? null : this.activePose('hero', 'hero')
    if (staged) return (staged.face || this.drawnFace()) < 0
    const choice = this.dropping() ? null : this.selectHero()
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
    const sight = this.sight
    for (const enemy of this.world.enemies) {
      if (enemy.dead) continue
      if (sight && !sight.sees(enemy.x, enemy.x + enemy.w)) continue
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

  /**
   * Decides what a live enemy does on one step (or frame, see `simStep`): an action (a hurt, a throw, a landing)
   * keeps the facing it began with; a throw begins facing where the simulation aims (`enemy.facing`) unless it
   * turned a moment ago, and its release turns it to the shot's side (`spit`); in the air it faces the way its body
   * has gone; on the ground it faces as it walks (`enemyFace`).
   */
  private decideEnemy(enemy: Enemy, timers: EnemyTimers) {
    const clipName = this.selectEnemy(enemy).name
    const action = clipName === 'hurt' || clipName === 'shoot' || clipName === 'land'
    const began = action && clipName !== timers.action
    timers.action = action ? clipName : ''
    let face = timers.face
    if (enemy.kind === 'spitter') this.settleThrow(enemy, timers)
    if (timers.throwHeld) {
      // Held from its throw by its turn's hold: once it may turn, it turns to its aim and begins the throw from its
      // first frame, its lead-in squeezed into the time left.
      if (timers.faceAge >= FACE_HOLD && enemy.shootTimer > 0) {
        timers.throwHeld = false
        face = this.world.player.x > enemy.x ? 1 : -1
        timers.throwFrom = enemy.shootTimer
        timers.throwFresh = true
      }
    } else if (action) {
      // A hurt is thrown back: it begins facing the blow, against the way the hit throws it (the hit's own side; its
      // speed may not carry it yet on this step).
      if (began && clipName === 'hurt' && timers.hitDir !== 0) face = timers.hitDir > 0 ? -1 : 1
      else if (began && clipName === 'hurt' && Math.abs(enemy.vx) > 1) face = enemy.vx > 0 ? -1 : 1
      else if (began && clipName === 'shoot') {
        const aim: 1 | -1 = this.world.player.x > enemy.x ? 1 : -1
        if (timers.faceAge >= FACE_HOLD) face = enemy.kind === 'spitter' ? aim : enemy.facing
        // (A throw that would begin facing away from its aim does not begin yet: it stands.)
        else if (enemy.kind === 'spitter' && aim !== face && enemy.shootTimer > 0) {
          timers.throwHeld = true
          timers.action = ''
        }
      }
      // A throw whose target has gone to the other side begins again from its first frame, facing it.
      else if (clipName === 'shoot' && enemy.kind === 'spitter') face = this.throwAgain(enemy, timers, face)
      if (enemy.kind === 'walker' || enemy.kind === 'tough') forgetMotion(timers.tread)
      // (In the air its facing goes by where its body goes from the end of the action, not from before it.)
      if (timers.air) timers.airX = enemy.x + enemy.w / 2
    } else if (timers.air) {
      // In the air a rat or a mole faces the way its body has really gone: once it is `AIR_TURN_PX` past the
      // furthest point it reached the way it faces, it turns (the simulation flips its speed on every step while it
      // is over the hero or pinned against a wall: a body that goes nowhere sideways keeps its facing), once in a
      // fall at most (one that zigzags over the hero keeps the way it turned to), and not straight after a turn.
      const x = enemy.x + enemy.w / 2
      if ((x - timers.airX) * face > 0) timers.airX = x
      else if (!timers.airTurned && Math.abs(x - timers.airX) > AIR_TURN_PX) {
        if (timers.faceAge >= FACE_HOLD) {
          timers.airTurned = true
          face = x > timers.airX ? 1 : -1
          timers.airX = x
        }
      }
    } else face = this.enemyFace(enemy, timers)
    if (face !== timers.face) {
      timers.face = face
      timers.faceAge = 0
      noteTurn(timers.tread)
    }
  }

  /**
   * One simulation step has run (its events answered; the world holds the simulation's own positions, before any
   * drawing between steps): what each body does is decided here, on the same numbers at every display rate. The
   * display frames (`update`) only draw it. Once this has been called the view decides on steps alone, and the
   * facing holds run on the simulation's time and the hit-stops (`heldFor`; slow motion only lengthens them on
   * the screen).
   */
  simStep() {
    this.stepDriven = true
    this.stepPhase = true
    this.frameUpdated = false
    // (A stage that is over is held by the simulation: nothing steps, so nothing is decided, and the clocks counted
    // on the steps, a flinch's or a follow-through's, stand still with it.)
    if (this.world.state !== 'play') return this.creditHeld()
    this.stepClock += SIM_STEP
    this.heroFaceAge += SIM_STEP
    this.stepHero(SIM_STEP)
    for (const enemy of this.world.enemies) {
      if (enemy.dead) continue
      const timers = this.timersOf(enemy)
      timers.faceAge += SIM_STEP
      if (timers.shown) this.stepAloft(enemy, timers)
      stepTread(timers.tread, enemy.x + enemy.w / 2, SIM_STEP, enemy.onGround)
      this.decideEnemy(enemy, timers)
    }
    const boss = this.world.boss
    if (boss && !boss.dead) {
      this.bossFaceAge += SIM_STEP
      this.stepBoss(boss, SIM_STEP)
    }
    this.creditHeld()
  }

  /**
   * The hit-stops begun on this step count for the holds from the next step on: what was decided on this step is
   * drawn on the frame the hit-stop begins with, before its time on the screen.
   */
  private creditHeld() {
    const added = this.heldCredit
    if (!(added > 0)) return
    this.heldCredit = 0
    this.bossFaceAge += added
    this.heroFaceAge += added
    for (const timers of this.enemyTimers.values()) timers.faceAge += added
  }

  /**
   * A hit-stop of `seconds` begins (`StageView.freeze`): driven by steps, the facing holds (on the simulation's time)
   * count it too, as the time it is on the screen.
   */
  heldFor(seconds: number, moment = false) {
    // A frame a moment holds the simulation on (`StageView.update`): its time has been on the screen, after every
    // decision drawn before it.
    if (moment) {
      if (!this.stepDriven || !(seconds > 0)) return
      this.heldCredit += seconds
      return this.creditHeld()
    }
    // What it adds to the screen's time between two steps is the hit-stop less the frame that shows the step it
    // began on and the gap the steps had anyway (at most two steps' worth at 30 Hz and above): credited that much,
    // a hold is never shorter on the screen than it promises.
    const added = seconds - HIT_STOP_UNCREDITED
    if (!this.stepDriven || !(added > 0)) return
    // (Credited once this step's decisions are made: `creditHeld`.)
    this.heldCredit += added
  }

  /** A squirrel's records of its throw: cleared once the throw is over, its cut cleared when a new one begins. */
  private settleThrow(enemy: Enemy, timers: EnemyTimers) {
    if (enemy.shootTimer > hitTime(ENEMY_SPEC.spitter.shoot)) {
      timers.throwFrom = undefined
      timers.throwHeld = false
      timers.throwAgainAt = null
    } else timers.throwCut = false
  }

  /**
   * A squirrel in its lead-in (or waiting loaded) whose target is now on the other side (the sign the simulation aims
   * by) begins its throw again from its first frame, facing it: its frames before the release squeezed into the time
   * left, or played over `FIT_MIN` while it waits (drawn from its first frame on the frame that first shows it:
   * `throwFresh`). Not straight after another turn. The facing it throws with.
   */
  private throwAgain(enemy: Enemy, timers: EnemyTimers, face: 1 | -1): 1 | -1 {
    if (enemy.shootTimer > hitTime(ENEMY_SPEC.spitter.shoot)) return face
    const d = this.world.player.x - enemy.x
    const aim: 1 | -1 = d > 0 ? 1 : -1
    if (d === 0 || aim === face) return face
    // (Its turn's hold keeps it from facing its aim: the lead-in does not show meanwhile; it stands.)
    if (timers.faceAge < FACE_HOLD) {
      if (enemy.shootTimer > 0) timers.throwHeld = true
      return face
    }
    if (enemy.shootTimer > 0) {
      timers.throwFrom = enemy.shootTimer
      timers.throwFresh = true
    } else timers.throwAgainAt = this.bodyTime
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
    snapshot.time = this.bodyTime + enemy.id * 0.13
    snapshot.airborne = timers ? timers.air : this.goesAloft(enemy, false)
    snapshot.throwFrom = timers?.throwFrom
    snapshot.throwAgainAge = timers?.throwAgainAt == null ? null : this.bodyTime - timers.throwAgainAt
    snapshot.throwCut = timers?.throwCut ?? false
    snapshot.throwHeld = timers?.throwHeld ?? false

    return enemyClip(snapshot)
  }

  /**
   * Whether a rat or a mole is drawn in the air: once it is `aloft` (no ground within a few px), until it is back on
   * the ground (so a body that comes down near the ground keeps its fall to the landing, and never flickers). A fall
   * that would end within `AIR_SHORT_SECONDS` is not shown at all (`landsSoon`).
   */
  private stepAloft(enemy: Enemy, timers: EnemyTimers) {
    const wasAir = timers.air
    timers.air = this.goesAloft(enemy, timers.air)
    // In the air its facing follows where its body has gone, measured from here (see `AIR_TURN_PX`).
    if (timers.air && !wasAir) {
      timers.airX = enemy.x + enemy.w / 2
      timers.airTurned = false
    }
  }

  private goesAloft(enemy: Enemy, was: boolean) {
    if (enemy.onGround || (enemy.kind !== 'walker' && enemy.kind !== 'tough')) return false
    return was || (aloft(this.world, enemy) && !landsSoon(this.world, enemy, enemy.vy))
  }

  /** The drawn facing of a live enemy (true: left). */
  enemyFlip(enemy: Enemy): boolean {
    const timers = this.enemyTimers.get(enemy.id)
    if (!timers) return enemy.facing < 0
    return timers.face < 0
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

  /** Whether the live boss's gathering light shows (see `shotCue`). */
  bossLightShows(): boolean {
    const boss = this.world.boss
    return boss !== null && !boss.dead && this.shotCue(boss, shotCueScratch) !== null
  }

  /** Whether the live boss's picture is held still while his body shakes or walks under it (see `stepPicture`). */
  bossPictureHeld(boss: Boss): boolean {
    const walking = boss.state === 'idle' && (WALKERS.includes(boss.def.kind) || boss.def.kind === 'chaser')
    return walking && boss.active && !this.posing('boss') && this.bossTread.standing
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
    if (this.rageAt !== null && this.bodyTime - this.rageAt < specDurationOfRage(boss)) return boss.def.art
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
   * Whether the live boss is between his actions: not in a wind-up, a charge or a dive, a leap (in the air, or in
   * his slam) or the king's gathering; on the ground (a flier hovers); no landing (but a plain fall's whose impact
   * has shown, `landImpactShown`), no follow-through of a throw or a
   * volley, no flinch showing. His own walk is not an action: in `idle` (walking at the hero or standing over him)
   * he is between actions whatever his speed; in any other state (a recovery, a stun) only once he no longer slides
   * (slow for a few steps: not still carried out of a dash, a crash or a landing). The staged transformation waits
   * for it (see `StageDirector`).
   */
  bossBetweenActions(): boolean {
    const boss = this.world.boss
    if (!boss || boss.dead || !boss.active) return true
    const s = boss.state
    // Straight out of a dash or a crash (the king's stun lasts a step) he is first seen out of it, at rest for
    // `REST_STEPS` steps, in his walk too (also when the crash put him off a ledge and he lands).
    const before = s === this.bossLast ? this.bossPrev : this.bossLast
    if (DASH_STATES.includes(before ?? '') && this.bossSlowSteps < REST_STEPS) return false
    // A plain fall's landing whose impact has shown is a rest, in whatever state it plays (also into his wind-up,
    // whose clip it holds back): he roars out of its crouch. (Out of his walk, once he no longer slides.)
    if (this.landImpactShown(boss) && (s === 'idle' || Math.abs(boss.vx) <= WINDUP_REST_SPEED)) return true
    // (The first moments of a wind-up are still a rest, once his walk has slowed in it: after the moment it plays
    // from its first frame, a fair warning of what comes. Judged on the wind-up's own age, `ownTime`: the phase step
    // restarts his state's clock, not the crouch he has shown.)
    // (A flier brakes in his wind-up as he hovers: his speed is no slide.)
    const early =
      s === 'windup' &&
      this.ownTime(boss) < WINDUP_REST_SECONDS + 1e-9 &&
      (Math.abs(boss.vx) <= WINDUP_REST_SPEED || boss.def.kind === 'flyer')
    if ((s === 'windup' && !early) || s === 'charge' || s === 'dive' || s === 'slam' || s === 'shoot') return false
    if (!boss.onGround && boss.def.kind !== 'flyer') return false
    if (s !== 'idle' && !early && (Math.abs(boss.vx) > DASH_REST_SPEED || this.bossSlowSteps < REST_STEPS)) return false
    // (A light of his gathering is the beginning of his shot: no moment holds it half gathered.)
    if (this.shotCue(boss, shotCueScratch) !== null) return false
    const name = this.bossChoice(boss).name
    return name !== 'land' && name !== 'shoot' && name !== 'hurt' && !isDashClip(name)
  }

  /**
   * Whether the live boss's next step begins his shot: its light shows from it (`shotCue`), or a cast's lead-in may
   * begin on it (`shotLead` within the cast's lead), while neither has begun yet. A moment that waits for him to be
   * between his actions begins here at the latest, wherever the hero is (the step before his light or his cast, as
   * the first moments of a wind-up).
   */
  bossShotNext(): boolean {
    const boss = this.world.boss
    if (!boss || boss.dead || !boss.active) return false
    const s = this.fillBoss(boss)
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    const due = CUE_SHEETS[boss.def.art] ? shotDue(s) : null
    if (due !== null && due - SIM_STEP <= SHOT_CUE_SECONDS + 1e-9) return true
    const until = spec.shoot ? shotLead(s) : null
    return until !== null && until - SIM_STEP <= hitTime(spec.shoot!) + 1e-9
  }

  /**
   * Whether the landing he shows is a plain fall's (not a slam's) whose impact has shown: a display frame has drawn
   * it and its first frame is over. From there it gives way to a staged moment (he comes down, takes the impact,
   * and roars out of the crouch); a slam's landing is his attack's and plays whole.
   */
  private landImpactShown(boss: Boss) {
    if (!boss.onGround) return false
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    const s = this.fillBoss(boss)
    if (!spec.land || !fallLandShows(s, spec) || this.fallLandSeen !== this.fallLandAt) return false
    if (s.fallLandAge! + 1e-9 < landImpactEnd(spec.land)) return false
    // (Not under a flinch or a cast, which come before it.)
    return bossClip(s, boss.def.art, spec).name === 'land'
  }

  /**
   * Off the ground for no more than `LAND_HOLD_STEPS` steps and coming down again within `AIR_SHORT_SECONDS`: his
   * `air` would not show it, and a landing goes on through it.
   */
  private landHolds(boss: Boss) {
    if (boss.onGround || this.bossAirSteps > LAND_HOLD_STEPS) return false
    return landsSoon(this.world, boss, boss.vy)
  }

  /**
   * Whether the live boss can be posed in a planted pose at all (his entrance): on the ground (a flier hovers), not
   * in his slam, no landing showing but a plain fall's whose impact has shown (`landImpactShown`).
   */
  bossSettled(): boolean {
    const boss = this.world.boss
    if (!boss || boss.dead || !boss.active) return true
    if (boss.state === 'slam' || (!boss.onGround && boss.def.kind !== 'flyer')) return false
    return this.bossChoice(boss).name !== 'land' || this.landImpactShown(boss)
  }

  /**
   * A heavy body (the bear, the ape, the king) that comes down from a real fall lands, in whatever state (after a
   * slam his landing is the slam's): its touchdown is recorded on the step it happens (`simStep`), so that a moment
   * waiting for him sees the landing on that very step.
   */
  private trackFall(boss: Boss) {
    // (Asleep he lands on nothing: his waking shows no landing of a fall he made before.)
    if (!boss.active) {
      this.fallGrounded = boss.onGround
      this.bossAirSteps = 0
      this.fallLandAt = null
      return
    }
    const heavy = boss.def.kind === 'tank' || boss.def.kind === 'final'
    this.bossAirSteps = boss.onGround ? 0 : this.bossAirSteps + 1
    // A landing goes on through a step or two off the ground (`landHolds`); a real fall ends it.
    if (!boss.onGround && this.fallLandAt !== null && !this.landHolds(boss)) this.fallLandAt = null
    if (!boss.onGround) this.bossAirTop = this.fallGrounded ? boss.y : Math.min(this.bossAirTop, boss.y)
    else if (!this.fallGrounded && heavy && boss.y - this.bossAirTop >= FALL_LAND_PX) {
      // (A slam's own touchdown is its impact's landing; a slide off a ledge after it lands again.)
      const slams = boss.state === 'slam'
      // (Not in his gathering: that is the state's own clip.)
      if (!slams && boss.state !== 'shoot') {
        // Fitted to the time before his next attack (every frame still shown, faster); with less than `FIT_MIN`
        // he comes down without one.
        const spec = bossSheetSpec(boss.def.kind, boss.def.art)
        // (In his wind-up the warning comes first: a landing takes its time only if `WINDUP_WARNING` is left after it.)
        const room = attackRoom(this.fillBoss(boss)) - (boss.state === 'windup' ? WINDUP_WARNING : 0)
        // (Its clock starts on the display frame that first shows it, `fallLandFresh`: its first frame is never
        // passed over, whatever the display frames' lengths.)
        if (spec.land && room + 1e-9 >= FIT_MIN) {
          this.fallLandAt = this.bodyTime
          this.fallLandFresh = true
          this.dashLanded = true
          // Walking on (off a ledge in his walk) he takes the impact in a moment: over no more ground than a slam's
          // landing slides (`LAND_SLIDE_PX`), every frame still shown.
          const speed = Math.abs(boss.vx)
          // (A landing lasts no longer than he stays put: once his walk carries him, over no more ground than that.)
          const s = this.fillBoss(boss)
          const walk = boss.def.speed * (boss.def.kind === 'final' && (boss.phase ?? 1) >= 2 ? 1.25 : 1)
          const still = stillRoom(s)
          const ground =
            still === Infinity ? Infinity : Math.max(FIT_MIN, still + LAND_SLIDE_PX / Math.max(speed, walk))
          this.fallLandSeconds = Math.min(specDuration(spec.land), room, ground)
        }
      }
    }
    this.fallGrounded = boss.onGround
  }

  /** The steps in a row he has been slow out of his attacks (an attack, however slow, counts none). */
  private restStep(boss: Boss) {
    // (Rest is counted on the ground only.)
    const attack = ATTACK_STATES.includes(boss.state)
    const ground = boss.onGround || boss.def.kind === 'flyer'
    return !attack && ground && Math.abs(boss.vx) <= DASH_REST_SPEED ? this.bossSlowSteps + 1 : 0
  }

  /** Whether the hero is being knocked back by a hit (his `hurt` shows). */
  heroKnocked(): boolean {
    return !this.world.player.dead && this.heroSnapshotName() === 'hurt'
  }

  private heroSnapshotName() {
    return this.death || this.dropping() ? '' : (this.heroSnapshot()?.name ?? '')
  }

  /** Whether a flinch is playing. */
  private flinching() {
    const boss = this.world.boss
    return this.flinchAt !== null && boss !== null
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
      noteTurn(this.bossTread)
    }
    return true
  }

  /**
   * The gathering light of the live boss's next shot as it is drawn on this frame, or null when none shows: from
   * `SHOT_CUE_SECONDS` before a shot of the crow, the fox or the bee leaves (`shotDue`), whatever his body does,
   * held on its last frame until the shot leaves, gone on the frame that shows it. It gathers at the very place the
   * shot is born (`SHOT_BIRTH_DX`, `shotBirthY`) on his drawn body (with the hit's jolt). It promises a shot, not a
   * side (the side is known only on the shot's own step): it is drawn as it is, never mirrored.
   */
  shotCue(boss: Boss, out: ShotCue = newShotCue()): ShotCue | null {
    const sheet = CUE_SHEETS[boss.def.art]
    if (!sheet || boss.dead || !boss.active) return null
    const due = shotDue(this.fillBoss(boss))
    if (due === null || due > SHOT_CUE_SECONDS + 1e-9) return null
    const jolt = this.reducedMotion || this.joltAt === null ? 0 : bossJolt(this.bodyTime - this.joltAt, this.joltDir)
    out.sheet = sheet
    // (By the simulation's time alone, never going back: full on the last step before the shot. The last frame of
    // `gather` covers the last sixth by itself, so the frame before the one that shows the shot shows it whole,
    // whatever the display frames' lengths.)
    out.progress = Math.max(0, Math.min(1, (SHOT_CUE_SECONDS - due) / (SHOT_CUE_SECONDS - CUE_LAST_STEP)))
    out.x = this.bossX(boss) + jolt + SHOT_BIRTH_DX
    out.y = shotBirthY(boss)
    return out
  }

  /**
   * Where the live boss's thrown or cast shot leaves from on the screen: where its light was (his drawn body, with
   * the jolt), for the effects of the shot (`fx-map`'s `shotEdge`).
   */
  shotBirth(boss: Boss, out: { x: number; y: number }) {
    const jolt = this.reducedMotion || this.joltAt === null ? 0 : bossJolt(this.bodyTime - this.joltAt, this.joltDir)
    out.x = this.bossX(boss) + jolt + SHOT_BIRTH_DX
    out.y = shotBirthY(boss)
    return out
  }

  /**
   * Draws the live boss's gathering light (`shotCue`), unmirrored: `gather` of the shot's sheet, played by
   * progress. It is a warning for the player: the stage draws it in front of the boss and the hero.
   */
  drawShotCue(ctx: CanvasRenderingContext2D) {
    const boss = this.world.boss
    if (!boss || boss.dead) return
    const cue = this.shotCue(boss, shotCueScratch)
    if (!cue) return
    const anim = clip(cue.sheet, 'gather')
    // (Not drawn before its art is there.)
    if (!anim?.frames?.length) return
    const frame = Math.min(anim.frames.length - 1, Math.floor(cue.progress * anim.frames.length))
    blit(ctx, anim, 0, cue.x, cue.y, brush(false, undefined, frame))
  }

  /**
   * The time into a fall's landing, played over `fallLandSeconds`: squeezed into less than its own length, it
   * reaches its last frame `LAST_FRAME_SECONDS` before its time is up (as a cast's follow-through), so that frame
   * shows at 30 Hz and above, whatever the display frames' lengths; past its time it is over.
   */
  private fallLandTime(land: AnimSpec) {
    return fittedTime(land, this.bodyTime - this.fallLandAt!, this.fallLandSeconds)
  }

  /**
   * The release begins on the shot's step: its follow-through is fitted to the time left before his next attack
   * less a step (it reaches its last frame before that attack begins, and is neither cut by it nor runs into it);
   * with less than `FIT_MIN` it shows none. Squeezed into less than its own length it reaches its last frame
   * `LAST_FRAME_SECONDS` before its time is up.
   */
  private fitRelease(boss: Boss) {
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    if (!spec.shoot) return
    const room = castRoom(this.fillBoss(boss)) - SIM_STEP
    // (A shot that left a step later than its lead-in foresaw keeps the follow-through it began with, up to the
    // attack itself.)
    let tail = Math.min(this.castTail, room)
    if (tail + 1e-9 < FIT_MIN) tail = Math.min(this.castTail, room + SIM_STEP)
    this.castTail = tail + 1e-9 >= FIT_MIN ? tail : 0
    this.castLeft = this.castTail
    this.castStepAt = this.stepClock
  }

  /**
   * The time into a boss's action that is counted on the steps (a flinch, a follow-through): its first frame shows on
   * the frame that first draws it (its `Fresh` flag), and from there it runs on the steps from the one that began it,
   * as its end is counted, so its last frame keeps its time before that end whatever the frames' lengths. (A view
   * driven without steps: the frame clock from its first frame.)
   */
  private actionAge(frameAt: number | null, stepAt: number) {
    if (!this.stepDriven) return this.bodyTime - (frameAt ?? this.bodyTime)
    return Math.max(0, this.stepClock - stepAt - SIM_STEP)
  }

  /**
   * Where an action counted on the steps (`seconds` of them, ending on the step its time is up, `early` steps before
   * the clock of `actionAge` has them) ends on that clock: its picture is fitted to the frames it really has. (A view
   * driven without steps: `seconds`.)
   */
  private countedEnd(seconds: number, early: number) {
    if (!this.stepDriven) return seconds
    return Math.max(0, Math.ceil(seconds / SIM_STEP - 1e-6) - early) * SIM_STEP
  }

  /**
   * Whether an action begun on a step, shown fresh on the frame that first drew it, now goes on: at once without
   * steps (its frame clock starts here), else on the frame after the one that drew it (its time then comes from the
   * steps, `actionAge`).
   */
  private firstFrame(fresh: boolean, which: 'flinch' | 'cast') {
    if (!this.stepDriven || !fresh) return true
    if (this.freshDrawn[which]) {
      this.freshDrawn[which] = false
      return true
    }
    this.freshDrawn[which] = true
    return false
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
    s.rageAge = this.rageAt === null ? null : this.bodyTime - this.rageAt
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    // The flinch and the cast play their whole clips over the seconds they were given.
    s.hurtAge =
      this.flinchAt === null || !spec.hurt
        ? null
        : this.flinchFresh
          ? 0
          : fittedTime(
              spec.hurt,
              this.actionAge(this.flinchAt, this.flinchStepAt),
              this.countedEnd(this.flinchSeconds, 0)
            )
    s.onGround = boss.onGround
    s.shotTimer = boss.shotTimer
    s.volleyCut = this.volleyCut
    s.dashAge = this.dashFresh ? 0 : this.dashAt === null ? null : this.bodyTime - this.dashAt
    s.dashGain = this.bossGain - this.dashGain
    s.gain = this.bossGain
    s.standing = shownStanding(this.bossTread)
    s.time = this.bodyTime
    // (Before `update` has seen a new state, what it recorded belongs to the state before: the new one starts clean.)
    const fresh = boss.state !== this.bossLast
    s.clipFrom = fresh ? 0 : this.clipFrom
    s.landedAt = fresh ? 0 : this.bossLandedAt
    s.ownTime = this.ownTime(boss)
    s.stateReset = !fresh && this.stateReset
    s.gatherFrom = fresh ? 0 : this.gatherFrom
    s.landCut = fresh ? this.carriesCut(boss.state, this.bossLast) : this.landCut
    s.fallLandAge =
      this.fallLandAt === null || !spec.land ? null : this.fallLandFresh ? 0 : this.fallLandTime(spec.land)
    s.landHolds = this.fallLandAt !== null && this.landHolds(boss)
    s.airShort = !boss.onGround && this.bossAirSteps <= LAND_HOLD_STEPS && landsSoon(this.world, boss, boss.vy)
    s.dashOver = !fresh && this.dashLanded
    s.projectiles = boss.def.projectiles
    s.castAge = null
    if (this.cast === 'lead' && spec.shoot) s.castAge = castLeadTime(s, spec, this.castFrom)
    else if (this.cast === 'release' && spec.shoot) {
      const lead = hitTime(spec.shoot)
      s.castAge = this.castFresh
        ? lead
        : fittedTime(spec.shoot, this.actionAge(this.castAt, this.castStepAt), this.countedEnd(this.castTail, 1), lead)
    }
    return s
  }

  /**
   * The boss's drawn facing, decided on a step (or a frame, see `simStep`). An action (a flinch, a throw or cast, a
   * landing) keeps the facing it began with; his shot never turns him (its light shows where it goes). A dash faces
   * the way it goes; a walk the way his body goes, from the first step he moves; in his wind-up he turns only once
   * the hero is clearly on the other side, and not twice in a moment.
   */
  private decideBossFace(boss: Boss, choice: ClipChoice = this.bossChoice(boss)) {
    const d = this.world.player.x - boss.x
    const age = this.bossFaceAge
    const action = choice.name === 'hurt' || choice.name === 'shoot' || choice.name === 'land'
    const walker = boss.state === 'idle' && WALKERS.includes(boss.def.kind)
    // A walk is read from its own steps: out of one (another state, or standing over the hero) it starts anew.
    if (boss.state !== 'idle') forgetMotion(this.bossTread)
    let face = this.bossFace
    // Falling out of his walk or his wind-up (not leaping, not dashing): as a rat in the air.
    const leaps = boss.def.kind === 'tank' || boss.def.kind === 'final'
    // (The fox, who walks off ledges, too, while his `air` shows.)
    const falls = (leaps || choice.name === 'air') && !boss.onGround && !TRAVEL_STATES.includes(boss.state)
    const x = boss.x + boss.w / 2
    if (falls && !this.bossFalling) {
      this.bossAirX = x
      this.bossAirTurned = false
    }
    this.bossFalling = falls
    if (action) {
      // (It keeps its facing.)
    } else if (falls) {
      // He faces the way his body has really gone: once it is `AIR_TURN_PX` back from the furthest point it reached
      // the way he faces, he turns (the simulation flips his speed on every step over the hero), once in a fall at
      // most, and not straight after a turn.
      if ((x - this.bossAirX) * face > 0) this.bossAirX = x
      else if (!this.bossAirTurned && Math.abs(x - this.bossAirX) > AIR_TURN_PX && age >= FACE_HOLD) {
        this.bossAirTurned = true
        face = x > this.bossAirX ? 1 : -1
        this.bossAirX = x
      }
    } else if (boss.def.kind === 'chaser') {
      // ハム代 runs as the walkers walk: shaking on the spot over the hero (the simulation flips her speed on every
      // step) she keeps her facing and her picture stands; once her body has gone the decisive distance one way, by
      // the net travel over her shake, she faces that way.
      face = walkFacing(this.bossTread, face, d, true, age)
      // (Her run goes on in the air, off a ledge or a hop: there too, her body gone the decisive distance turns her.)
      const back: 1 | -1 = face > 0 ? -1 : 1
      if (!boss.onGround && goneSince(this.bossTread, sinceTurn(this.bossTread), back) >= DECISIVE_PX - 1e-6)
        face = back
    }
    // Through a cast he keeps the facing he aimed with (a flier's hover and the fox's leap need not face their drift).
    else if (this.cast !== 'none') face = this.bossFace
    // (Falling in his walk, the bear's and the king's `air` is no dash: he faces as he walks.)
    else if (
      TRAVEL_STATES.includes(boss.state) ||
      (isDashClip(choice.name) && !(choice.name === 'air' && boss.state === 'idle'))
    ) {
      if (Math.abs(boss.vx) > DASH_REST_SPEED) face = boss.vx > 0 ? 1 : -1
    } else if (walker) {
      // Setting off (his walk not yet long enough to read) he faces the way the simulation walks him, from his first
      // step; then the way his walk goes, and standing over the hero, the hero's side.
      if (this.bossSetOff && motionKnown(this.bossTread)) this.bossSetOff = false
      // (A walk drawn with a stride may turn within the hold once his body has gone a decisive distance; a hover,
      // whose picture carries no feet, has the hold alone.)
      const stride = Boolean(bossSheetSpec(boss.def.kind, boss.def.art).move?.stride)
      if (this.bossSetOff) {
        // (Once: on top of the hero the simulation flips his speed every step.)
        const way: 1 | -1 = boss.vx > 0 ? 1 : -1
        if (
          Math.abs(boss.vx) > DASH_REST_SPEED &&
          (way === face ||
            age >= FACE_HOLD ||
            (stride && boss.onGround && goneSince(this.bossTread, sinceTurn(this.bossTread), way) >= DECISIVE_PX))
        ) {
          face = way
          this.bossSetOff = false
        }
      } else {
        face = walkFacing(this.bossTread, face, d, true, age)
        if ((!stride || !boss.onGround) && age < FACE_HOLD) face = this.bossFace
      }
    }
    // In his wind-up, too, he turns only once the hero is clearly on the other side (on top of him the sign of
    // `player.x - boss.x` changes every few steps), and not twice in a moment.
    else face = heldSideFacing(face, d, age)
    if (face !== this.bossFace) {
      this.bossFace = face
      this.bossFaceAge = 0
      noteTurn(this.bossTread)
    }
  }

  /**
   * The boss's clip from his state and the view's records (no staged pose). A fitted clip (`FITTED_CLIPS`) shows the
   * frame its display frames have stepped it to (see `stepFitted`).
   */
  private bossChoice(boss: Boss): ClipChoice {
    const choice = bossClip(this.fillBoss(boss), boss.def.art)
    const fit = this.fitShown
    if (fit.name !== choice.name || fit.key !== this.fitKey(choice) || choice.frame !== undefined) return choice
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)[choice.name]
    // (A clip begun again since, its time gone back, shows as its time says.)
    if (!spec || choice.t < fit.t - 1e-9) return choice
    const start = frameStart(spec, fit.frame)
    const length = frameSeconds(spec, fit.frame)
    // (Its own frame: its time kept clear of the frame's edges, so rounding never shows a neighbour; past the clip's
    // end a trembling tail cycles on its own time.)
    if (specFrameAt(spec, choice.t) === fit.frame && choice.t >= specDuration(spec)) return choice
    if (choice.t >= start && choice.t < start + length) return choice
    return { name: choice.name, t: start + Math.max(1e-7, Math.min(0.999 * length, choice.t - start)) }
  }

  /** What tells one run of a fitted clip from the next: a cast's lead-in from its release. */
  private fitKey(choice: ClipChoice) {
    return choice.name === 'shoot' ? this.cast : ''
  }

  /**
   * A boss's fitted clip (a flinch, a cast, a landing, a wind-up taken over late) goes forward by display frames:
   * on a display frame that advances the clips no more than one frame past the one the last showed, whatever its
   * time says, but into its last frame once its time is well into it. A short landing reserves its remaining
   * poses at the first frame's pace, so an intervening hit-stop cannot cost it its final pose.
   */
  private stepFitted(boss: Boss, dt: number) {
    const choice = bossClip(this.fillBoss(boss), boss.def.art)
    const fit = this.fitShown
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)[choice.name]
    if (!FITTED_CLIPS.includes(choice.name) || !spec || choice.frame !== undefined) {
      fit.name = ''
      return
    }
    const key = this.fitKey(choice)
    const again = choice.t < fit.t - 1e-9
    fit.t = choice.t
    const target = specFrameAt(spec, choice.t)
    const last = spec.frames - 1
    const fresh = fit.name !== choice.name || fit.key !== key || again
    if (fresh) {
      fit.name = choice.name
      fit.key = key
      // (A run begins on its first frame on the frame that first shows it, however far a long display frame took its
      // time: a cast's lead-in from frame 0, its release from the release frame.)
      const release = spec.hit ?? 0
      const first = choice.name === 'shoot' && target >= release ? release : 0
      fit.frame = Math.min(target, first)
      // A short landing needs every advancing display frame. Its second frame may be shortened by a hit-stop.
      fit.paced =
        choice.name === 'land' && this.fallLandAt !== null && this.fallLandSeconds <= last * dt + 1e-9 ? true : null
      return
    }
    // (Decided once, on the run's second display frame that advances the clips: a display no faster than the clip's
    // own pace, its time already past its first frame, paces the run one frame a display frame up to its last.)
    // (Not a cast's lead-in: its release must show on the frame that shows the shot.)
    const paceable = choice.name !== 'shoot' || this.cast === 'release'
    // (A display frame that does not advance the clips changes nothing.)
    if (!(dt > 0)) return
    // A flinch ends on a simulation step. The next display interval can include a partial step carried from this one.
    if (
      choice.name === 'hurt' &&
      this.stepDriven &&
      fit.frame >= last - 1 &&
      (fit.frame === last || this.flinchLeft <= Math.ceil(dt / SIM_STEP - 1e-6) * SIM_STEP + 1e-9)
    ) {
      fit.frame = last
      return
    }
    if (fit.paced === null) fit.paced = paceable && target > fit.frame
    if (fit.paced) {
      fit.frame = Math.min(last, fit.frame + 1)
      return
    }
    if (target <= fit.frame) {
      fit.frame = target
      return
    }
    const deep = target === last && choice.t >= frameStart(spec, last) + 0.5 * frameSeconds(spec, last)
    fit.frame = deep ? last : Math.min(fit.frame + 1, target)
  }

  /**
   * The boss's records: his state history, his tread, his dash, the cast he shows (started on the step its lead-in
   * must begin, if it fits), his drawn facing and the dust of a skid.
   */
  private updateBoss(dt: number) {
    const boss = this.world.boss
    if (!boss || boss.dead) return
    // A landing begun on a step starts its clock on the display frame that first shows it, and so does a dash.
    if (dt > 0 && this.fallLandFresh) {
      this.fallLandFresh = false
      if (this.fallLandAt !== null) {
        // (Fitted to the time before his next attack from its step: what the frame's clock has run since comes off.)
        this.fallLandSeconds = Math.max(1e-3, this.fallLandSeconds - (this.bodyTime - this.fallLandAt))
        this.fallLandAt = this.bodyTime
      }
    }
    if (dt > 0 && this.dashFresh) {
      this.dashFresh = false
      this.dashAt = this.bodyTime
    }
    // (What he does is decided on the simulation's steps, `stepBoss`; without them, here.)
    if (!this.stepDriven) this.stepBoss(boss, dt)
    // Only a boss walking on the ground (and ハム代 running) is ever held still; elsewhere the picture is the body.
    const walking = boss.state === 'idle' && (WALKERS.includes(boss.def.kind) || boss.def.kind === 'chaser')
    stepPicture(this.bossTread, boss.x + boss.w / 2, dt, walking && boss.active && !this.posing('boss'))
    // A flinch begun on a step starts its clock on the display frame that first shows it.
    // (A frame held by the hit-stop that came with it shows it too.)
    // (Driven by steps, the frame after the one that first drew it goes on from the step that began it.)
    if (this.flinchFresh && this.firstFrame(this.flinchFresh, 'flinch')) {
      this.flinchFresh = false
      if (this.flinchAt !== null) this.flinchAt = this.bodyTime
    }
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    // The frame that shows the shot shows its release; the follow-through runs from here, fitted to the time left
    // before his wind-up (at any display rate the release frame lands on the shot).
    if (spec.shoot && this.cast === 'release' && this.castFresh && dt > 0 && this.firstFrame(this.castFresh, 'cast')) {
      this.castFresh = false
      this.castAt = this.bodyTime
    }
    const s = this.fillBoss(boss)
    const choice = bossClip(s, boss.def.art, spec)
    if (fallLandShows(s, spec) && choice.name === 'land') {
      // A staged pose that takes him over ends a plain fall's landing (it gives way: after the pose he does not
      // crouch again).
      if (this.posing('boss')) this.fallLandAt = null
      else if (dt > 0) this.fallLandSeen = this.fallLandAt
    }
    // (What is drawn: the ground his drawn body covers, and where a clip timed from the state's start takes over.)
    if (dt > 0 && boss.active) this.bossGain += drawnGain(this.bossTread, this.bossFace, boss.x + boss.w / 2)
    // A clip timed from the state's start that takes over from another clip inside the state begins on its first
    // frame: it is timed from there (`BossSnapshot.clipFrom`).
    const shown = this.bossChoice(boss)
    const name = shown.name
    if (boss.state === 'shoot' && name === 'shoot') this.gatherFrame = shown.frame ?? 0
    if (boss.state !== this.clipState) this.clipState = boss.state
    else if (name !== this.clipLast && STATE_TIMED.includes(name)) this.clipFrom = boss.stateTime
    this.clipLast = name
    // (After `clipFrom`: a clip taken over here is stepped from where it begins.)
    this.stepFitted(boss, dt)
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
  }

  /**
   * One step of the boss's records (or a display frame, for a view driven without steps): his state history (which
   * state, the one before, when it began, his dash, his setting off; every step, the steps a state changes on
   * included), his landings, his tread, the cast he shows (started on the step its lead-in must begin, if it fits),
   * his drawn facing, and where a clip timed from the state's start takes over. What is drawn for him on a step is
   * then the same at every display schedule: a state that fell inside one long frame is simply not drawn.
   */
  private stepBoss(boss: Boss, dt: number) {
    // He starts out facing the hero, before any step has run (a stage that opens on him poses him at once).
    if (!this.bossFaced) {
      this.bossFaced = true
      this.bossFace = this.world.player.x > boss.x ? 1 : -1
    }
    const newState = boss.state !== this.bossLast
    if (newState) {
      // (A landing begins with his recovery after a slam: its impact.)
      this.bossLandedAt = 0
      this.dashLanded = false
      this.bossPrev = this.bossLast
      this.bossLast = boss.state
      this.stateStart = this.world.time - boss.stateTime
      this.stateReset = false
      this.gatherFrom = 0
      this.gatherFrame = 0
      this.clipFrom = 0
      this.landCut = this.carriesCut(boss.state, this.bossPrev)
      if (boss.state === 'charge' || boss.state === 'dive') {
        this.dashFresh = true
        this.dashGain = this.bossGain
      }
      if (boss.state === 'shoot') this.volleyCut = false
      this.bossSetOff = boss.state === 'idle'
    } else if (boss.onGround && !this.bossGrounded) {
      // In his slam the landing begins on the step after the touchdown (the step the simulation ends the slam on).
      const slam = boss.state === 'slam'
      this.bossLandedAt = this.ownTime(boss) + (slam ? SIM_STEP : 0)
      this.landCut = false
    }
    this.trackFall(boss)
    // (A flinch ends on the step its time is up.)
    if (this.flinchAt !== null && dt > 0) {
      this.flinchLeft -= dt
      if (this.flinchLeft <= 1e-9) {
        this.flinchAt = null
        this.flinchFresh = false
      }
    }
    // (An attack that begins ends the landing: its own clip takes over.)
    if (newState && (boss.state === 'slam' || boss.state === 'shoot')) this.fallLandAt = null
    if (newState) this.slamImpact = false
    this.bossGrounded = boss.onGround
    stepTread(this.bossTread, boss.x + boss.w / 2, dt, boss.onGround)
    if (dt > 0) this.bossSlowSteps = this.restStep(boss)
    const spec = bossSheetSpec(boss.def.kind, boss.def.art)
    let s = this.fillBoss(boss)
    // The cast: started when its lead-in must begin, ended when it has played.
    if (spec.shoot) {
      const lead = hitTime(spec.shoot)
      const until = shotLead(s)
      const across = (this.world.player.x - boss.x) * this.castAim
      if (this.cast === 'lead' && until !== null && across < 0 && -across > aimClear(boss.def.speed)) {
        // The hero has gone clearly to the other side before the release (inside the aim zone, where the sign the
        // simulation aims by flips every few steps, the lead-in goes on: the shot's own step decides): the lead-in is
        // given up on this step (it never carries on to a release that would have to turn), and begins again facing
        // the new side where it can.
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
      else if (this.cast === 'release') {
        // Its time is counted on the steps (its picture's clock starts on the frame that shows the release:
        // `updateBoss`); it ends on the step its time is up, or his next attack begins.
        this.castLeft -= dt
        // (The release frame itself shows on the frame that shows the shot, also with no follow-through after it.)
        if ((this.castLeft <= 1e-9 && !this.castFresh) || ATTACK_STATES.includes(boss.state)) {
          this.cast = 'none'
          this.castSide = 0
          this.castFresh = false
        }
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
        noteTurn(this.bossTread)
      }
    }
    if (dt > 0 && boss.active) this.decideBossFace(boss, choice)
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
        const jolt =
          this.reducedMotion || this.joltAt === null ? 0 : bossJolt(this.bodyTime - this.joltAt, this.joltDir)
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
    const jolt = this.reducedMotion || this.joltAt === null ? 0 : bossJolt(this.bodyTime - this.joltAt, this.joltDir)
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
      if (dizzy) blit(ctx, dizzy, this.bodyTime, centre, boss.y - 8)
    }
    if (choice.name === 'recover') {
      const sweat = clip('fx', 'sweat')
      if (sweat) blit(ctx, sweat, this.bodyTime, centre + (flip ? -1 : 1) * boss.w * 0.45, boss.y + 2)
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
