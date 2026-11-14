/**
 * The hero, enemies and bosses: clip selection (pure functions in clips.ts) plus the timers it needs, squash and
 * stretch, hit flashes, invulnerability flicker, ghosts that play `defeat` after the sim removed an actor, status
 * marks (dizzy, sweat) and soft ground shadows. Each actor's anchor sits on the centre-bottom of its physics box.
 */
import type { Anim } from '../art'
import type { SimEvent } from '../game/events'
import { BITE_TIME, GRAVITY, INVULN, T, type Boss, type BossState, type Enemy, type World } from '../game/sim'
import { TILE } from '../game/types'
import { blit, brush, clip, flashClip, frameIndex } from './bake'
import {
  HARD_LANDING,
  RUN_CONTACT_FRAMES,
  RUN_THRESHOLD,
  STILL_SPEED,
  BOSS_DEFEAT_GROUND_FRAME,
  ENEMY_DEFEAT_GROUND_FRAME,
  bossClip,
  stunShown,
  clipLife,
  dieClip,
  frameStart,
  enemyClip,
  specDuration,
  heroClip,
  isSkidding,
  type BossSnapshot,
  type ClipChoice,
  type EnemySnapshot
} from './clips'
import type { FxPool } from './fx'
import { ENEMY_SPEC, KING_RAGED, MOM_SPEC, bossSpec, type BossArt } from '../art/contract'

/** Largest squash or stretch (DESIGN.md: ≤ 18 %). */
export const MAX_SQUASH = 0.18

interface Ghost {
  sheet: string
  x: number
  y: number
  vx: number
  vy: number
  gravity: number
  age: number
  life: number
  flip: boolean
  /** Height of the body, for the closing puff. */
  h: number
  end: 'puff' | 'boom' | 'none'
  clip: string
  /**
   * A fall from feet row `y0` to the `ground` row that lands at age `at` exactly, on the ghost's own clock so the
   * body and its clip stay together: accelerating from rest (gravity 2·height/at²), lifted by a hop of `hop` px on
   * the way, and travelling at `vx` from `x0` until it lands.
   */
  fall?: { y0: number; ground: number; at: number; hop: number; x0: number; vx: number }
}

/** The feet row of a falling ghost at `age` (exact, so the landing does not depend on the frame rate). */
function ghostFall(f: NonNullable<Ghost['fall']>, age: number) {
  if (age >= f.at - 1e-6) return f.ground
  const k = age / f.at
  return f.y0 + (f.ground - f.y0) * k * k - 4 * f.hop * k * (1 - k)
}

/** A knocked-out enemy's ghost travels this fast (px/s) away from the hero until it lands. */
export const ENEMY_KNOCK_SPEED = 90
/** Knocked out on the ground, an enemy is thrown up this high (px) before it lands on its first lying frame. */
export const ENEMY_KNOCK_HOP = 16

/**
 * The hero's knocked-out body: knocked up at once by `DIE_HOP_SPEED` (px/s) and falling under `DIE_GRAVITY`
 * (px/s²) to the ground below, where it stays (a hop of 26 px that lands after 0.4 s, the length of the hit and the
 * tumble); over a pit it falls out of the view.
 */
export const DIE_HOP_SPEED = 260
export const DIE_GRAVITY = 1300

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
}

/** The feet row of a falling body `age` seconds after the hit (before it lands). */
const fallY = (f: Fall, age: number) => f.y0 - DIE_HOP_SPEED * age + 0.5 * DIE_GRAVITY * age * age

/** Seconds from the hit until a body knocked up from feet row `y0` comes down on the ground row `ground`. */
export function dieLandTime(y0: number, ground: number) {
  const drop = Math.max(0, ground - y0)
  return (DIE_HOP_SPEED + Math.sqrt(DIE_HOP_SPEED * DIE_HOP_SPEED + 2 * DIE_GRAVITY * drop)) / DIE_GRAVITY
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
  /** Seconds standing still (see `STILL_SPEED`). */
  stillTime: number
}

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
  stillTime: 0,
  time: 0
}
const squash: { sx: number; sy: number } = { sx: 1, sy: 1 }
/** What the boss's clip choice reads, refilled every frame. */
const bossSnapshot: BossSnapshot = {
  kind: 'brute',
  state: 'idle',
  prevState: null,
  stateTime: 0,
  active: false,
  vx: 0,
  vy: 0,
  rageAge: null,
  hurtAge: null,
  onGround: true,
  shotTimer: 99,
  shotAge: null,
  summonAge: null,
  time: 0
}

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
  // enemies and bosses
  private enemyTimers = new Map<number, EnemyTimers>()
  private ghosts: Ghost[] = []
  private bossPrev: BossState | null = null
  private bossLast: BossState | null = null
  private rageAt: number | null = null
  /** View time of the last hit on the boss (a hit-stop holds the flinch). */
  private bossHitAt: number | null = null
  /** View time and direction of the last jolt (a hit, away from the hero; a crash, away from the wall). */
  private joltAt: number | null = null
  private joltDir: 1 | -1 = 1
  /** View time of the last throw or cast the boss could show (idle or recovering), and of the last summon. */
  private shotAt: number | null = null
  private summonAt: number | null = null
  /** The king has transformed: once his `rage` is over he is drawn from his raged sheet. */
  private phased = false
  /** Where the boss was over the last display frames, while it charges or dives fast (speed ghosts). */
  private trail = new PositionTrail(TRAIL_AGES[0] + 1)
  /** The last update was a hit-stop (no time passed): the speed ghosts are skipped. */
  private held = false
  /** Real seconds (advances while the simulation is held or slowed; staged poses run on it). */
  private realTime = 0
  private poses: Partial<Record<PoseTarget, Pose>> = {}
  /** The last hero clip, for tests and debugging. */
  heroChoice: ClipChoice = { name: 'idle', t: 0 }

  constructor(
    private world: World,
    private fx: FxPool,
    /** Called on the run cycle's contact frames (footstep sound). */
    private onFootstep: () => void = () => {},
    /** Reduced motion: no speed ghosts, no hit jolt. */
    private reducedMotion = false
  ) {}

  // ------------------------------------------------------------------------------------------- staging hooks

  /**
   * Staging: `who` shows `clip` from its first frame for `seconds` of real time (a clip that does not loop holds
   * its last frame, or keeps cycling its last `sustain` frames). `hop` lifts the actor on a parabola of that height
   * over `hopSeconds`. A clip the actor's sheet does not have is ignored when drawing. A staged pose that shows a
   * clip should last at least `clipLife` of it, so none of its frames is cut.
   */
  pose(who: PoseTarget, clip: string, seconds: number, options: { hop?: number; hopSeconds?: number } = {}): PoseToken {
    const pose: Pose = {
      clip,
      start: this.realTime,
      until: this.realTime + Math.max(0, seconds),
      hop: options.hop ?? 0,
      hopSeconds: options.hopSeconds ?? 0.35
    }
    this.poses[who] = pose
    // The phase-2 transformation is staged: the sim-time rage clip must not play a second time afterwards.
    if (who === 'boss' && clip === 'rage') this.rageAt = null
    return pose
  }

  /** Ends the pose `token` stands for, if it is still up (a later pose is left alone). */
  unposeIf(who: PoseTarget, token: PoseToken) {
    if (this.poses[who] === token) delete this.poses[who]
  }

  /** Ends a staged pose early (or every pose). */
  unpose(who?: PoseTarget) {
    if (who) delete this.poses[who]
    else this.poses = {}
  }

  /** The clip `who` is posed in right now, or null. */
  posing(who: PoseTarget): string | null {
    const pose = this.poses[who]
    return pose && this.realTime < pose.until ? pose.clip : null
  }

  /** Advances real time (the stage view calls this with the frame's real dt). */
  tickReal(dt: number) {
    this.realTime += dt
    for (const who of ['hero', 'boss'] as const) {
      const pose = this.poses[who]
      if (pose && this.realTime >= pose.until) delete this.poses[who]
    }
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
    const y = fallY(d, d.age)
    // A body knocked up from just above its ground row never dips below it on the way down.
    return d.ground !== null ? Math.min(y, Math.max(d.ground, d.y0)) : y
  }

  private activePose(who: PoseTarget, sheet: string) {
    const pose = this.poses[who]
    if (!pose || this.realTime >= pose.until) return null
    const anim = clip(sheet, pose.clip)
    if (!anim) return null
    const age = this.realTime - pose.start
    const k = pose.hop > 0 && age < pose.hopSeconds ? age / pose.hopSeconds : -1
    const lift = k >= 0 ? Math.round(4 * pose.hop * k * (1 - k)) : 0
    return { anim, age, lift }
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
        break
      }
      case 'bite':
        this.squash = -0.1
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
        // The player's own body takes over from a staged pose (see `update`).
        if (this.world.state === 'play') delete this.poses.hero
        break
      case 'dead': {
        const x = p.x + p.w / 2
        const y0 = p.y + p.h
        this.death = {
          x,
          y0,
          ground: groundBelow(this.world, x, y0, this.world.h),
          age: 0,
          landAt: null,
          flip: p.facing < 0,
          h: p.h
        }
        break
      }
      case 'enemy-down': {
        const enemy = this.world.enemies.find((e) => e.id === event.id)
        const w = enemy?.w ?? 44
        const h = enemy?.h ?? 40
        const x = enemy ? enemy.x + w / 2 : event.x
        const y = enemy ? enemy.y + h : event.y + h / 2
        // Flung away from the hero (from the two centres; the event's `dir` is the enemy's own walking direction),
        // facing him, so the clip's "flung backwards" is backwards.
        const dir = x >= p.x + p.w / 2 ? 1 : -1
        const spec = ENEMY_SPEC[event.kind].defeat
        // It lands on the first frame drawn lying on the ground and stays there; over a pit, the old arc.
        const ground = groundBelow(this.world, x, y, this.world.h)
        const fall =
          ground !== null
            ? {
                y0: y,
                ground,
                at: frameStart(spec, ENEMY_DEFEAT_GROUND_FRAME[event.kind]),
                hop: ground - y <= CLEAR_DROP_MIN ? ENEMY_KNOCK_HOP : 0,
                x0: x,
                vx: dir * ENEMY_KNOCK_SPEED
              }
            : undefined
        this.ghosts.push({
          sheet: event.kind,
          clip: 'defeat',
          x,
          y,
          vx: dir * ENEMY_KNOCK_SPEED,
          vy: -170,
          gravity: 700,
          age: 0,
          life: clipLife(spec),
          flip: dir > 0,
          h,
          end: 'puff',
          fall
        })
        this.enemyTimers.delete(event.id)
        break
      }
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
            ? { y0: y, ground, at: frameStart(spec.defeat, groundFrame), hop: 0, x0: x, vx: 0 }
            : undefined
        this.ghosts.push({
          sheet: boss.def.art,
          clip: 'defeat',
          x,
          y,
          vx: 0,
          vy: 0,
          gravity: 0,
          age: 0,
          life: clipLife(spec.defeat ?? spec.hurt, BOSS_DEFEAT_TAIL),
          flip: boss.facing < 0,
          h: boss.h,
          end: 'boom',
          fall
        })
        break
      }
      case 'boss-hit': {
        const boss = this.world.boss
        this.bossHitAt = this.time
        this.joltAt = this.time
        if (boss) this.joltDir = boss.x + boss.w / 2 >= p.x + p.w / 2 ? 1 : -1
        break
      }
      case 'boss-crash':
        // The body answers the crash, stunned or not: a jolt back from the wall it ran into.
        this.joltAt = this.time
        this.joltDir = event.dir > 0 ? -1 : 1
        break
      case 'boss-shoot': {
        const boss = this.world.boss
        // Shown only where the boss can show it; a shot in a wind-up or an attack leaves without a pose.
        this.shotAt = boss && (boss.state === 'idle' || boss.state === 'recover') ? this.time : null
        break
      }
      case 'minion': {
        const boss = this.world.boss
        // As for a shot: a summon in a wind-up or an attack leaves without a gesture (its tail must not pop in
        // when that state ends).
        this.summonAt = boss && (boss.state === 'idle' || boss.state === 'recover') ? this.time : null
        break
      }
      case 'boss-phase':
        this.rageAt = this.time
        this.phased = true
        break
      default:
        break
    }
  }

  update(dt: number) {
    this.time += dt
    const world = this.world
    const p = world.player
    // hero timers
    this.squash *= Math.exp(-dt * 12)
    if (Math.abs(this.squash) < 0.004) this.squash = 0
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
    // The hero turns on the spot when his facing flips on the ground without a skid.
    if (p.facing !== this.lastFacing) {
      if (p.onGround && !isSkidding({ onGround: true, vx: p.vx, facing: p.facing })) this.turnAge = 0
      this.lastFacing = p.facing
    } else if (this.turnAge !== null) {
      this.turnAge += dt
      if (!p.onGround || this.turnAge > 0.5) this.turnAge = null
    }
    this.waterTime = p.inWater ? this.waterTime + dt : 0
    // While the simulation runs, a staged hero pose ends as soon as his own body does something else.
    const pose = this.poses.hero
    if (pose && dt > 0 && world.state === 'play' && (Math.abs(p.vx) > RUN_THRESHOLD || !p.onGround || p.biteTimer > 0))
      delete this.poses.hero
    if (this.clearDrop) this.updateDrop(this.clearDrop, dt)
    // enemies
    for (const enemy of world.enemies) {
      if (enemy.dead) continue
      let timers = this.enemyTimers.get(enemy.id)
      if (!timers)
        this.enemyTimers.set(
          enemy.id,
          (timers = { onGround: enemy.onGround, landAge: enemy.onGround ? 0 : 99, stillTime: 0 })
        )
      if (enemy.onGround && !timers.onGround) timers.landAge = 0
      else timers.landAge += dt
      timers.onGround = enemy.onGround
      timers.stillTime = Math.abs(enemy.vx) <= STILL_SPEED ? timers.stillTime + dt : 0
    }
    // boss state history
    const boss = world.boss
    if (boss && boss.state !== this.bossLast) {
      this.bossPrev = this.bossLast
      this.bossLast = boss.state
    }
    this.updateTrail(dt)
    // ghosts
    for (const g of this.ghosts) {
      g.age += dt
      if (g.fall) {
        g.y = ghostFall(g.fall, g.age)
        g.x = g.fall.x0 + g.fall.vx * Math.min(g.age, g.fall.at)
      } else {
        g.vy += g.gravity * dt
        g.x += g.vx * dt
        g.y += g.vy * dt
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
        const at = dieLandTime(d.y0, d.ground)
        // (A hair of tolerance: a sum of frame times that should reach the landing time must not miss it.)
        if (d.age >= at - 1e-6) d.landAt = Math.min(at, d.age)
      }
    }
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
    return heroClip({
      cheering: this.world.state === 'clear',
      cheerAge: this.cheerAt === null ? 0 : this.time - this.cheerAt,
      biteAge: p.biteTimer > 0 ? BITE_TIME - p.biteTimer : null,
      hurt: p.invuln > 0 && hurtFor >= 0 && hurtFor < 0.3,
      hurtAge: hurtFor,
      inWater: p.inWater,
      waterTime: this.waterTime,
      onGround: p.onGround,
      vx: p.vx,
      vy: p.vy,
      facing: p.facing,
      airTime: this.airTime,
      landAge: this.landAge,
      hardLanding: this.hardLanding,
      distance: this.distance,
      idleTime: this.idleTime,
      blinkAge: this.blinkAge,
      skidAge: this.skidAge,
      turnAge: this.turnAge
    })
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
      const pose = this.posing('hero')
      choice = pose ? { name: pose, t: this.realTime - this.poses.hero!.start } : this.heroSnapshot()
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
      this.heroChoice = { name: this.poses.hero!.clip, t: staged.age }
      this.lastRunFrame = -1
      this.drawShadow(ctx, x, y, p.w)
      const { sx, sy } = squashScale(this.squash, squash)
      blit(ctx, staged.anim, staged.age, x, y - staged.lift, brush(p.facing < 0, undefined, undefined, sx, sy))
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
    blit(ctx, anim, choice.t, x, y, brush(p.facing < 0, undefined, choice.frame, sx, sy))
  }

  private runContact(anim: Anim, choice: ClipChoice, x: number, y: number) {
    const frame = frameIndex(anim, choice.t)
    if (frame !== this.lastRunFrame && (RUN_CONTACT_FRAMES as readonly number[]).includes(frame)) {
      const facing = this.world.player.facing
      this.fx.spawn('dust', x - facing * 10, y - 6, { vx: -facing * 24, vy: -8, rate: 1.2 })
      this.onFootstep()
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
      const anim = clip(g.sheet, g.clip)
      if (anim) blit(ctx, anim, g.age, g.x, g.y, brush(g.flip, Math.min(1, (g.life - g.age) * 8 + 0.2)))
    }
  }

  /** The clip a live enemy is drawn with now (without drawing). */
  selectEnemy(enemy: Enemy): ClipChoice {
    const timers = this.enemyTimers.get(enemy.id)
    const snapshot = enemySnapshot
    snapshot.kind = enemy.kind
    snapshot.vx = enemy.vx
    snapshot.vy = enemy.vy
    snapshot.onGround = enemy.onGround
    snapshot.hitFlash = enemy.hitFlash
    snapshot.shootTimer = enemy.shootTimer
    snapshot.landAge = timers?.landAge ?? 99
    snapshot.stillTime = timers?.stillTime ?? 0
    snapshot.time = this.time + enemy.id * 0.13
    return enemyClip(snapshot)
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
    const choice = this.selectEnemy(enemy)
    const anim = clip(enemy.kind, choice.name)
    if (!anim) return
    const x = enemy.x + enemy.w / 2
    const y = enemy.y + enemy.h
    this.drawShadow(ctx, x, y, enemy.w)
    const flip = enemy.facing < 0
    blit(ctx, anim, choice.t, x, y, brush(flip, undefined, choice.frame))
    if (enemy.hitFlash > 0) {
      const white = flashClip(enemy.kind, choice.name)
      if (white) blit(ctx, white, choice.t, x, y, brush(flip, Math.min(1, enemy.hitFlash * 7), choice.frame))
    }
  }

  // ------------------------------------------------------------------------------------------- bosses

  drawBoss(ctx: CanvasRenderingContext2D) {
    const boss = this.world.boss
    if (boss && !boss.dead) this.drawLiveBoss(ctx, boss)
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

  /**
   * The sheet the live boss is drawn from: the king's raged sheet once his transformation (the staged pose or the
   * sim-time `rage`) is over, else his art.
   */
  bossSheet(boss: Boss): string {
    if (!this.phased || boss.def.kind !== 'final') return boss.def.art
    if (this.posing('boss') === 'rage') return boss.def.art
    if (this.rageAt !== null && this.time - this.rageAt < specDurationOfRage(boss)) return boss.def.art
    return KING_RAGED
  }

  private bossChoice(boss: Boss): ClipChoice {
    const s = bossSnapshot
    s.kind = boss.def.kind
    s.state = boss.state
    s.prevState = this.bossPrev
    s.stateTime = boss.stateTime
    s.active = boss.active
    s.vx = boss.vx
    s.vy = boss.vy
    s.rageAge = this.rageAt === null ? null : this.time - this.rageAt
    s.hurtAge = this.bossHitAt === null ? null : this.time - this.bossHitAt
    s.onGround = boss.onGround
    s.shotTimer = boss.shotTimer
    s.shotAge = this.shotAt === null ? null : this.time - this.shotAt
    s.summonAge = this.summonAt === null ? null : this.time - this.summonAt
    s.time = this.time
    return bossClip(s, boss.def.art)
  }

  private drawLiveBoss(ctx: CanvasRenderingContext2D, boss: Boss) {
    const choice = this.bossChoice(boss)
    const sheet = this.bossSheet(boss)
    const centre = boss.x + boss.w / 2
    const y = boss.y + boss.h
    const flip = boss.facing < 0
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
    if (stunShown(boss.state, boss.stateTime) || boss.state === 'tired') {
      const dizzy = clip('fx', 'dizzy')
      if (dizzy) blit(ctx, dizzy, this.time, centre, boss.y - 8)
    }
    if (boss.state === 'recover') {
      const sweat = clip('fx', 'sweat')
      if (sweat) blit(ctx, sweat, this.time, centre + boss.facing * boss.w * 0.45, boss.y + 2)
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
