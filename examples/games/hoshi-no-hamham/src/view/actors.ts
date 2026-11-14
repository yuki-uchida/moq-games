/**
 * The hero, enemies and bosses: clip selection (pure functions in clips.ts) plus the timers it needs, squash and
 * stretch, hit flashes, invulnerability flicker, ghosts that play `defeat` after the sim removed an actor, status
 * marks (dizzy, sweat) and soft ground shadows. Each actor's anchor sits on the centre-bottom of its physics box.
 */
import type { Anim } from '../art'
import type { SimEvent } from '../game/events'
import { BITE_TIME, INVULN, T, type Boss, type BossState, type Enemy, type World } from '../game/sim'
import { TILE } from '../game/types'
import { blit, brush, clip, flashClip, frameIndex } from './bake'
import {
  HARD_LANDING,
  RUN_CONTACT_FRAMES,
  RUN_THRESHOLD,
  bossClip,
  clipLife,
  enemyClip,
  heroClip,
  isSkidding,
  type ClipChoice,
  type EnemySnapshot
} from './clips'
import type { FxPool } from './fx'
import { ENEMY_SPEC, MOM_SPEC, bossSpec, type BossArt } from '../art/contract'

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
}

/** A boss charging or diving faster than this (px/s) leaves speed ghosts. */
export const GHOST_SPEED = 260
/** Display frames old and opacity of the two after-images of a fast boss, oldest first. */
export const TRAIL_AGES = [4, 2] as const
export const TRAIL_ALPHAS = [0.15, 0.3] as const
/** The boss's defeat ghost lives this long (s) after its clip has played, so it can fade and burst. */
export const BOSS_DEFEAT_TAIL = 0.5

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

interface EnemyTimers {
  onGround: boolean
  landAge: number
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
  time: 0
}
const squash: { sx: number; sy: number } = { sx: 1, sy: 1 }

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
  private turnAge: number | null = null
  private lastFacing: 1 | -1 = 1
  private cheerAt: number | null = null
  private waterTime = 0
  private lastRunFrame = -1
  private wasGround = true
  private death: Ghost | null = null
  // enemies and bosses
  private enemyTimers = new Map<number, EnemyTimers>()
  private ghosts: Ghost[] = []
  private bossPrev: BossState | null = null
  private bossLast: BossState | null = null
  private rageAt: number | null = null
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
    /** Reduced motion: no speed ghosts. */
    private reducedMotion = false
  ) {}

  // ------------------------------------------------------------------------------------------- staging hooks

  /**
   * Staging: `who` shows `clip` from its first frame for `seconds` of real time (a clip that does not loop holds
   * its last frame, or keeps cycling its last `sustain` frames). `hop` lifts the actor on a parabola of that height over `hopSeconds`. A clip the actor's
   * sheet does not have is ignored when drawing.
   */
  pose(who: PoseTarget, clip: string, seconds: number, options: { hop?: number; hopSeconds?: number } = {}) {
    this.poses[who] = {
      clip,
      start: this.realTime,
      until: this.realTime + Math.max(0, seconds),
      hop: options.hop ?? 0,
      hopSeconds: options.hopSeconds ?? 0.35
    }
    // The phase-2 transformation is staged: the sim-time rage clip must not play a second time afterwards.
    if (who === 'boss' && clip === 'rage') this.rageAt = null
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

  /** The centre of the hero's falling body after death (null while he lives). */
  deathPoint(): { x: number; y: number } | null {
    const d = this.death
    return d ? { x: d.x, y: d.y - d.h / 2 } : null
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
      case 'clear':
        this.cheerAt = this.time
        break
      case 'dead':
        this.death = {
          sheet: 'hero',
          clip: 'die',
          x: p.x + p.w / 2,
          y: p.y + p.h,
          vx: 0,
          vy: 0,
          gravity: 0,
          age: 0,
          life: 2.4,
          flip: p.facing < 0,
          h: p.h,
          end: 'none'
        }
        break
      case 'enemy-down': {
        const enemy = this.world.enemies.find((e) => e.id === event.id)
        const w = enemy?.w ?? 44
        const h = enemy?.h ?? 40
        this.ghosts.push({
          sheet: event.kind,
          clip: 'defeat',
          x: enemy ? enemy.x + w / 2 : event.x,
          y: enemy ? enemy.y + h : event.y + h / 2,
          vx: event.dir * 90,
          vy: -170,
          gravity: 700,
          age: 0,
          life: clipLife(ENEMY_SPEC[event.kind].defeat),
          flip: enemy ? enemy.facing < 0 : event.dir > 0,
          h,
          end: 'puff'
        })
        this.enemyTimers.delete(event.id)
        break
      }
      case 'boss-down': {
        const boss = this.world.boss
        if (!boss) break
        const spec = boss.def.kind === 'chaser' ? MOM_SPEC : bossSpec(boss.def.art as BossArt)
        this.ghosts.push({
          sheet: boss.def.art,
          clip: 'defeat',
          x: boss.x + boss.w / 2,
          y: boss.y + boss.h,
          vx: 0,
          vy: 0,
          gravity: 0,
          age: 0,
          life: clipLife(spec.defeat ?? spec.hurt, BOSS_DEFEAT_TAIL),
          flip: boss.facing < 0,
          h: boss.h,
          end: 'boom'
        })
        break
      }
      case 'boss-phase':
        this.rageAt = this.time
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
    if (isSkidding({ onGround: p.onGround, vx: p.vx, facing: p.facing })) this.skidAge = (this.skidAge ?? -dt) + dt
    else if (this.skidAge !== null) {
      this.skidAge += dt
      if (this.skidAge > 0.3) this.skidAge = null
    }
    // The hero turns on the spot when his facing flips on the ground without a skid.
    if (p.facing !== this.lastFacing) {
      if (p.onGround && !isSkidding({ onGround: true, vx: p.vx, facing: p.facing })) this.turnAge = 0
      this.lastFacing = p.facing
    } else if (this.turnAge !== null) {
      this.turnAge += dt
      if (!p.onGround || this.turnAge > 0.5) this.turnAge = null
    }
    this.waterTime = p.inWater ? this.waterTime + dt : 0
    // enemies
    for (const enemy of world.enemies) {
      if (enemy.dead) continue
      let timers = this.enemyTimers.get(enemy.id)
      if (!timers) this.enemyTimers.set(enemy.id, (timers = { onGround: enemy.onGround, landAge: 99 }))
      if (enemy.onGround && !timers.onGround) timers.landAge = 0
      else timers.landAge += dt
      timers.onGround = enemy.onGround
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
      g.vy += g.gravity * dt
      g.x += g.vx * dt
      g.y += g.vy * dt
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
      // The hero tumbles, then pops up and falls out of the view.
      if (d.age > 0.6 && d.gravity === 0) {
        d.vy = -420
        d.gravity = 1300
      }
      d.vy += d.gravity * dt
      d.y += d.vy * dt
    }
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

  drawHero(ctx: CanvasRenderingContext2D) {
    const p = this.world.player
    if (this.death) {
      const d = this.death
      const anim = clip('hero', 'die')
      if (anim) blit(ctx, anim, d.age, d.x, d.y, brush(d.flip))
      return
    }
    if (p.dead) return
    const x = p.x + p.w / 2
    const y = p.y + p.h
    const staged = this.activePose('hero', 'hero')
    if (staged) {
      this.heroChoice = { name: this.poses.hero!.clip, t: staged.age }
      this.lastRunFrame = -1
      this.drawShadow(ctx, x, y, p.w)
      const { sx, sy } = squashScale(this.squash, squash)
      blit(ctx, staged.anim, staged.age, x, y - staged.lift, brush(p.facing < 0, undefined, undefined, sx, sy))
      return
    }
    const choice = this.heroSnapshot()
    this.heroChoice = choice
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

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
    const timers = this.enemyTimers.get(enemy.id)
    const snapshot = enemySnapshot
    snapshot.kind = enemy.kind
    snapshot.vx = enemy.vx
    snapshot.vy = enemy.vy
    snapshot.onGround = enemy.onGround
    snapshot.hitFlash = enemy.hitFlash
    snapshot.shootTimer = enemy.shootTimer
    snapshot.landAge = timers?.landAge ?? 99
    snapshot.time = this.time + enemy.id * 0.13
    const choice = enemyClip(snapshot)
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

  private drawLiveBoss(ctx: CanvasRenderingContext2D, boss: Boss) {
    const choice = bossClip(
      {
        kind: boss.def.kind,
        state: boss.state,
        prevState: this.bossPrev,
        stateTime: boss.stateTime,
        active: boss.active,
        vx: boss.vx,
        vy: boss.vy,
        rageAge: this.rageAt === null ? null : this.time - this.rageAt,
        time: this.time
      },
      boss.def.art
    )
    const sheet = boss.def.art
    const x = boss.x + boss.w / 2
    const y = boss.y + boss.h
    const flip = boss.facing < 0
    const staged = this.activePose('boss', sheet)
    if (staged) {
      this.drawShadow(ctx, x, y, boss.w * 1.1)
      blit(ctx, staged.anim, staged.age, x, y - staged.lift, brush(flip))
      return
    }
    const anim = clip(sheet, choice.name)
    if (!anim) return
    this.drawShadow(ctx, x, y, boss.w * 1.1)
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
    if (boss.state === 'stunned' || boss.state === 'tired') {
      const dizzy = clip('fx', 'dizzy')
      if (dizzy) blit(ctx, dizzy, this.time, x, boss.y - 8)
    }
    if (boss.state === 'recover') {
      const sweat = clip('fx', 'sweat')
      if (sweat) blit(ctx, sweat, this.time, x + boss.facing * boss.w * 0.45, boss.y + 2)
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
