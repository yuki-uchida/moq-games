/** Deterministic stage simulation: physics, gimmicks, enemies and bosses. No DOM access. */
import type { ThemeId } from '../art'
import { TILE, type BossDef, type EnemyKind, type PropKind, type StageDef } from './types'

export const T = {
  EMPTY: 0,
  SOLID: 1,
  PLATFORM: 2,
  DIRT: 3,
  SPIKE: 4
} as const

export const GRAVITY = 1600
export const MAX_FALL = 900
export const RUN_SPEED = 215
export const RUN_ACCEL = 1900
export const AIR_ACCEL = 1300
export const JUMP_VELOCITY = -720
export const COYOTE = 0.09
export const JUMP_BUFFER = 0.12
export const BITE_TIME = 0.22
export const BITE_COOLDOWN = 0.36
export const BITE_W = 48
export const BITE_H = 46
export const PLAYER_W = 42
export const PLAYER_H = 46
export const MAX_HP = 6
export const INVULN = 1.3
export const MAX_WATER = 700

export interface InputState {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  jump: boolean
  jumpPressed: boolean
  bite: boolean
  bitePressed: boolean
}

export const emptyInput = (): InputState => ({
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  jumpPressed: false,
  bite: false,
  bitePressed: false
})

export type Anim = 'idle' | 'walk' | 'jump' | 'fall' | 'bite' | 'hurt' | 'happy'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Body extends Rect {
  vx: number
  vy: number
  /** While positive, one-way platforms are ignored so the player can drop through. */
  dropTimer?: number
}

export interface Player extends Body {
  facing: 1 | -1
  hp: number
  maxHp: number
  onGround: boolean
  coyote: number
  jumpBuffer: number
  biteTimer: number
  biteCooldown: number
  invuln: number
  inWater: boolean
  anim: Anim
  animTime: number
  dead: boolean
  lastSafeX: number
  lastSafeY: number
  knockX: number
  dropTimer: number
}

export interface Enemy extends Body {
  id: number
  kind: EnemyKind
  hp: number
  maxHp: number
  facing: 1 | -1
  onGround: boolean
  t: number
  shootTimer: number
  hitFlash: number
  dead: boolean
  anchor: number
  touchDamage: number
}

export type BossState = 'idle' | 'windup' | 'charge' | 'recover' | 'stunned' | 'tired' | 'shoot' | 'dive' | 'slam'

export interface Boss extends Body {
  def: BossDef
  hp: number
  maxHp: number
  facing: 1 | -1
  state: BossState
  stateTime: number
  onGround: boolean
  hitFlash: number
  stamina: number
  maxStamina: number
  phase: number
  dead: boolean
  active: boolean
  minionTimer: number
  shotTimer: number
  diveTimer: number
  targetX: number
  targetY: number
  invuln: number
}

export type PropState =
  | 'idle'
  | 'falling'
  | 'fallen'
  | 'broken'
  | 'awake'
  | 'charging'
  | 'done'
  | 'open'
  | 'closed'
  | 'collected'

export interface Prop {
  id: number
  kind: PropKind
  x: number
  y: number
  w: number
  h: number
  hp: number
  state: PropState
  timer: number
  dir: 1 | -1
  data: number
}

export interface Bee {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  t: number
  cooldown: number
}

export interface Shot extends Body {
  kind: 'seed' | 'shock' | 'rock'
  hostile: boolean
  life: number
  dead: boolean
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  gravity: number
}

export interface Floater {
  x: number
  y: number
  text: string
  life: number
  color: string
}

export interface SimEvent {
  type:
    | 'jump'
    | 'land'
    | 'bite'
    | 'dig'
    | 'tree'
    | 'pipe'
    | 'hive'
    | 'animal'
    | 'rock'
    | 'switch'
    | 'fruit'
    | 'hurt'
    | 'enemy-down'
    | 'boss-hit'
    | 'boss-down'
    | 'clear'
    | 'dead'
    | 'splash'
    | 'shock'
    | 'pickup'
  x?: number
  y?: number
}

export interface WorldOptions {
  seed?: number
}

const ENEMY_STATS: Record<
  EnemyKind,
  { w: number; h: number; hp: number; speed: number; damage: number; touch: number }
> = {
  walker: { w: 44, h: 38, hp: 2, speed: 74, damage: 1, touch: 1 },
  flyer: { w: 44, h: 34, hp: 2, speed: 96, damage: 1, touch: 1 },
  jumper: { w: 42, h: 42, hp: 3, speed: 88, damage: 1, touch: 1 },
  spitter: { w: 46, h: 42, hp: 3, speed: 52, damage: 1, touch: 1 },
  tough: { w: 52, h: 50, hp: 6, speed: 62, damage: 2, touch: 1 }
}

function enemyStats(kind: EnemyKind) {
  return ENEMY_STATS[kind]
}

/** Small deterministic PRNG (mulberry32) so tests and replays agree. */
export class Rng {
  private state: number
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(min: number, max: number) {
    return min + this.next() * (max - min)
  }
  int(min: number, max: number) {
    return Math.floor(this.range(min, max + 1))
  }
}

export class World {
  readonly stage: StageDef
  readonly theme: ThemeId
  readonly w: number
  readonly h: number
  readonly tiles: Uint8Array
  readonly dynamic: Uint8Array
  water: Uint8Array
  readonly player: Player
  enemies: Enemy[] = []
  props: Prop[] = []
  bees: Bee[] = []
  shots: Shot[] = []
  particles: Particle[] = []
  floaters: Floater[] = []
  boss: Boss | null = null
  time = 0
  state: 'play' | 'clear' | 'dead' = 'play'
  clearTimer = 0
  collected = 0
  kills = 0
  goalOpen = false
  goalX = 0
  goalY = 0
  events: SimEvent[] = []
  shake = 0
  cameraX = 0
  cameraY = 0
  private rng: Rng
  private nextId = 1
  private waterTick = 0
  private waterTotal = 0
  private dirtFall: { x: number; y: number; timer: number }[] = []

  constructor(stage: StageDef, options: WorldOptions = {}) {
    this.stage = stage
    this.theme = stage.theme
    this.rng = new Rng(options.seed ?? stage.no * 7919 + 13)
    const rows = stage.map.length
    const cols = Math.max(...stage.map.map((row) => row.length))
    this.w = cols
    this.h = rows
    this.tiles = new Uint8Array(cols * rows)
    this.dynamic = new Uint8Array(cols * rows)
    this.water = new Uint8Array(cols * rows)
    let startX = TILE * 2
    let startY = TILE * 2
    const doors: { ch: string; cells: { x: number; y: number }[] }[] = []
    for (let y = 0; y < rows; y++) {
      const row = stage.map[y]
      for (let x = 0; x < cols; x++) {
        const ch = row[x] ?? '.'
        const px = x * TILE
        const py = y * TILE
        if (ch === '#') this.tiles[y * cols + x] = T.SOLID
        else if (ch === 'D') this.tiles[y * cols + x] = T.DIRT
        else if (ch === '=') this.tiles[y * cols + x] = T.PLATFORM
        else if (ch === '^') this.tiles[y * cols + x] = T.SPIKE
        else if (ch === '@') {
          startX = px + 10
          startY = py + TILE - PLAYER_H
        } else if (ch === 'x' || ch === 'y') {
          const run = doors.find(
            (door) => door.ch === ch && door.cells.at(-1)?.x === x && door.cells.at(-1)?.y === y - 1
          )
          if (run) run.cells.push({ x, y })
          else doors.push({ ch, cells: [{ x, y }] })
        } else this.spawnChar(ch, px, py, cols, rows)
      }
    }
    for (const run of doors) {
      const id = this.nextId++
      const xs = run.cells.map((c) => c.x)
      const ys = run.cells.map((c) => c.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      this.props.push({
        id,
        kind: 'door',
        x: minX * TILE,
        y: minY * TILE,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        hp: 1,
        state: 'closed',
        timer: 0,
        dir: 1,
        data: run.ch === 'x' ? 1 : 2
      })
      for (const cell of run.cells) this.dynamic[cell.y * cols + cell.x] = 1
    }
    this.player = {
      x: startX,
      y: startY,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: 0,
      vy: 0,
      facing: 1,
      hp: MAX_HP,
      maxHp: MAX_HP,
      onGround: false,
      coyote: 0,
      jumpBuffer: 0,
      biteTimer: 0,
      biteCooldown: 0,
      invuln: 0,
      inWater: false,
      anim: 'idle',
      animTime: 0,
      dead: false,
      lastSafeX: startX,
      lastSafeY: startY,
      knockX: 0,
      dropTimer: 0
    }
    this.goalOpen = stage.objective === 'reach'
    if (stage.objective === 'collect') this.goalOpen = false
  }

  private spawnChar(ch: string, px: number, py: number, cols: number, rows: number) {
    const id = this.nextId++
    const center = (w: number) => px + (TILE - w) / 2
    switch (ch) {
      case 'E':
      case 'F':
      case 'J':
      case 'K':
      case 'U': {
        const kind: EnemyKind =
          ch === 'E' ? 'walker' : ch === 'F' ? 'flyer' : ch === 'J' ? 'jumper' : ch === 'K' ? 'spitter' : 'tough'
        const stats = enemyStats(kind)
        const flying = kind === 'flyer'
        this.enemies.push({
          id,
          kind,
          x: center(stats.w),
          y: flying ? py - 20 : py + TILE - stats.h,
          w: stats.w,
          h: stats.h,
          vx: 0,
          vy: 0,
          hp: stats.hp,
          maxHp: stats.hp,
          facing: -1,
          onGround: false,
          t: this.rng.range(0, 1),
          shootTimer: this.rng.range(0.6, 2),
          hitFlash: 0,
          dead: false,
          anchor: px,
          touchDamage: stats.touch
        })
        break
      }
      case 'B': {
        const def = this.stage.boss
        const w = 64 * def.scale * 0.72
        const h = 64 * def.scale * 0.72
        this.boss = {
          def,
          x: center(w),
          y: py + TILE - h,
          w,
          h,
          vx: 0,
          vy: 0,
          hp: def.hp,
          maxHp: def.hp,
          facing: -1,
          state: 'idle',
          stateTime: 0,
          onGround: false,
          hitFlash: 0,
          stamina: 100,
          maxStamina: 100,
          phase: 1,
          dead: false,
          active: true,
          minionTimer: 4,
          shotTimer: 2,
          diveTimer: 3,
          targetX: 0,
          targetY: 0,
          invuln: 0
        }
        break
      }
      case 'T':
      case 'N':
        this.props.push({
          id,
          kind: ch === 'T' ? 'tree' : 'pine',
          x: px,
          y: py,
          w: 1,
          h: 1,
          hp: 2,
          state: 'idle',
          timer: 0,
          dir: 1,
          data: 0
        })
        break
      case 'P':
        this.props.push({ id, kind: 'pipe', x: px, y: py, w: 1, h: 1, hp: 1, state: 'idle', timer: 0, dir: 1, data: 0 })
        break
      case 'H':
        this.props.push({ id, kind: 'hive', x: px, y: py, w: 1, h: 1, hp: 1, state: 'idle', timer: 0, dir: 1, data: 0 })
        break
      case 'A':
        this.props.push({
          id,
          kind: 'animal',
          x: px,
          y: py,
          w: 1,
          h: 1,
          hp: 1,
          state: 'idle',
          timer: 0,
          dir: 1,
          data: 0
        })
        break
      case 'R': {
        this.props.push({ id, kind: 'rock', x: px, y: py, w: 1, h: 1, hp: 2, state: 'idle', timer: 0, dir: 1, data: 0 })
        // A rock is a real obstacle: it blocks the path until it is broken.
        this.dynamic[(py / TILE) * cols + px / TILE] = 1
        break
      }
      case '1':
      case '2':
        this.props.push({
          id,
          kind: 'switch',
          x: px,
          y: py,
          w: 1,
          h: 1,
          hp: 1,
          state: 'idle',
          timer: 0,
          dir: 1,
          data: Number(ch)
        })
        break
      case '*':
        this.props.push({
          id,
          kind: 'fruit',
          x: px,
          y: py,
          w: 1,
          h: 1,
          hp: 1,
          state: 'idle',
          timer: 0,
          dir: 1,
          data: 0
        })
        break
      case 't':
        this.props.push({ id, kind: 'twig', x: px, y: py, w: 1, h: 1, hp: 1, state: 'idle', timer: 0, dir: 1, data: 0 })
        break
      case 'b':
        this.props.push({
          id,
          kind: 'berry',
          x: px,
          y: py,
          w: 1,
          h: 1,
          hp: 1,
          state: 'idle',
          timer: 0,
          dir: 1,
          data: 0
        })
        break
      case 's':
        this.props.push({ id, kind: 'star', x: px, y: py, w: 1, h: 1, hp: 1, state: 'idle', timer: 0, dir: 1, data: 0 })
        break
      case 'G':
      case 'n':
        this.props.push({
          id,
          kind: ch === 'G' ? 'goal' : 'nest',
          x: px,
          y: py,
          w: 1,
          h: 1,
          hp: 1,
          state: 'idle',
          timer: 0,
          dir: 1,
          data: 0
        })
        this.goalX = px
        this.goalY = py
        break
      case 'h':
      case 'c':
        // ハム姫。'c'（data=1）は囚われの身で檻を描く。
        this.props.push({
          id,
          kind: 'princess',
          x: px,
          y: py,
          w: 1,
          h: 1,
          hp: 1,
          state: 'idle',
          timer: 0,
          dir: 1,
          data: ch === 'c' ? 1 : 0
        })
        break
      default:
        break
    }
    void cols
    void rows
  }

  // ------------------------------------------------------------------ geometry

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w || ty >= this.h) return T.SOLID
    if (ty < 0) return T.EMPTY
    return this.tiles[ty * this.w + tx]
  }

  solidAt(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.w || ty >= this.h) return true
    if (ty < 0) return false
    const i = ty * this.w + tx
    return this.tiles[i] === T.SOLID || this.tiles[i] === T.DIRT || this.dynamic[i] === 1
  }

  waterAt(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return false
    return this.water[ty * this.w + tx] === 1
  }

  propAt(tx: number, ty: number): Prop | null {
    for (const prop of this.props) {
      if (prop.state === 'broken' || prop.state === 'collected' || prop.state === 'done' || prop.state === 'open')
        continue
      if (
        tx >= prop.x / TILE &&
        tx < (prop.x + prop.w * TILE) / TILE &&
        ty >= prop.y / TILE &&
        ty < (prop.y + prop.h * TILE) / TILE
      )
        return prop
    }
    return null
  }

  body(): Body {
    return this.player
  }

  // ------------------------------------------------------------------ main step

  step(dt: number, input: InputState) {
    if (this.state !== 'play') {
      this.clearTimer += dt
      this.updateParticles(dt)
      return
    }
    this.time += dt
    this.shake = Math.max(0, this.shake - dt * 3)
    this.updatePlayer(dt, input)
    this.updateEnemies(dt)
    if (this.boss) this.updateBoss(dt)
    this.updateProps(dt)
    this.updateBees(dt)
    this.updateShots(dt)
    this.updateWater(dt)
    this.updateParticles(dt)
    this.updateFloaters(dt)
    this.updateCamera(dt)
    this.checkGoal()
  }

  private updatePlayer(dt: number, input: InputState) {
    const p = this.player
    if (p.dead) return
    p.animTime += dt
    p.biteCooldown = Math.max(0, p.biteCooldown - dt)
    p.biteTimer = Math.max(0, p.biteTimer - dt)
    p.invuln = Math.max(0, p.invuln - dt)
    p.dropTimer = Math.max(0, p.dropTimer - dt)

    // Press down on a one-way platform to drop through it.
    if (input.down && p.onGround) {
      const belowTy = Math.floor((p.y + p.h + 2) / TILE)
      const tx = Math.floor((p.x + p.w / 2) / TILE)
      if (this.tileAt(tx, belowTy) === T.PLATFORM) {
        p.dropTimer = 0.28
        p.y += 4
        p.onGround = false
      }
    }
    p.coyote = Math.max(0, p.coyote - dt)
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt)

    // water state
    const feetTy = Math.floor((p.y + p.h * 0.6) / TILE)
    const midTx = Math.floor((p.x + p.w / 2) / TILE)
    p.inWater = this.waterAt(midTx, feetTy) || this.waterAt(midTx, feetTy + 1)

    // horizontal
    const accel = p.onGround ? RUN_ACCEL : AIR_ACCEL
    const target = (input.right ? RUN_SPEED : 0) - (input.left ? RUN_SPEED : 0)
    if (p.knockX !== 0) {
      p.vx = p.knockX
      p.knockX *= 0.86
      if (Math.abs(p.knockX) < 8) p.knockX = 0
    } else if (target !== 0) {
      p.vx += Math.sign(target - p.vx) * accel * dt
      if (Math.sign(target - p.vx) !== Math.sign(target)) p.vx = target
      p.facing = target > 0 ? 1 : -1
    } else {
      const decel = (p.onGround ? 2400 : 700) * dt
      if (Math.abs(p.vx) <= decel) p.vx = 0
      else p.vx -= Math.sign(p.vx) * decel
    }
    if (p.inWater) p.vx *= 0.86

    // jump
    if (input.jumpPressed) p.jumpBuffer = JUMP_BUFFER
    if (p.inWater) {
      if (input.jump && p.vy > -240) p.vy -= 1500 * dt
      p.vy += GRAVITY * 0.28 * dt
      if (p.vy > 260) p.vy = 260
    } else {
      p.vy += GRAVITY * dt
      if (!input.jump && p.vy < 0) p.vy += GRAVITY * 1.5 * dt
      if (p.vy > MAX_FALL) p.vy = MAX_FALL
    }
    if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
      p.vy = JUMP_VELOCITY
      p.onGround = false
      p.coyote = 0
      p.jumpBuffer = 0
      this.events.push({ type: 'jump', x: p.x, y: p.y })
      this.burst(p.x + p.w / 2, p.y + p.h, 5, '#ffffff', 60, 0.3)
    }

    const wasGround = p.onGround
    const move = this.moveBody(p, dt)
    p.onGround = move.grounded
    if (p.onGround) {
      p.coyote = COYOTE
      p.lastSafeX = p.x
      p.lastSafeY = p.y
      if (!wasGround) {
        this.events.push({ type: 'land', x: p.x, y: p.y })
        this.burst(p.x + p.w / 2, p.y + p.h, 4, '#ffffff', 40, 0.25)
      }
    }

    // bite
    if (input.bitePressed && p.biteCooldown <= 0) {
      p.biteTimer = BITE_TIME
      p.biteCooldown = BITE_COOLDOWN
      this.doBite()
    }

    // spikes
    if (this.touchingTile(p, T.SPIKE)) this.hurtPlayer(1, p.x + (p.facing > 0 ? -40 : 40))

    // pit fall
    if (p.y > this.h * TILE + 80) {
      this.hurtPlayer(1, p.x)
      if (!p.dead) {
        p.x = p.lastSafeX
        p.y = p.lastSafeY - 4
        p.vx = 0
        p.vy = 0
      }
    }

    // pickups
    for (const prop of this.props) {
      if (prop.state !== 'idle') continue
      if (!this.overlaps(p, propRect(prop))) continue
      if (prop.kind === 'fruit' || prop.kind === 'twig' || prop.kind === 'berry' || prop.kind === 'star') {
        this.collect(prop)
      }
    }

    // animation
    if (p.biteTimer > 0) p.anim = 'bite'
    else if (p.invuln > INVULN - 0.3) p.anim = 'hurt'
    else if (!p.onGround) p.anim = p.vy < 0 ? 'jump' : 'fall'
    else if (Math.abs(p.vx) > 20) p.anim = 'walk'
    else p.anim = 'idle'
  }

  private touchingTile(b: Body, tile: number): boolean {
    const x0 = Math.floor(b.x / TILE)
    const x1 = Math.floor((b.x + b.w - 0.01) / TILE)
    const y0 = Math.floor(b.y / TILE)
    const y1 = Math.floor((b.y + b.h - 0.01) / TILE)
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.tileAt(tx, ty) === tile) return true
    return false
  }

  /** Moves a body through the tile grid. Returns whether it touched the ground and whether a wall stopped it. */
  private moveBody(b: Body, dt: number): { grounded: boolean; hitWall: boolean } {
    // Safety net: a body must never rest inside terrain (guards against respawns and falling props).
    const midTx = Math.floor((b.x + b.w / 2) / TILE)
    const midTy = Math.floor((b.y + b.h / 2) / TILE)
    if (this.solidAt(midTx, midTy)) {
      let row = midTy
      while (row > 0 && this.solidAt(midTx, row - 1)) row--
      b.y = row * TILE - b.h - 0.01
      if (b.vy > 0) b.vy = 0
    }
    let hitWall = false
    // X axis
    b.x += b.vx * dt
    const top = Math.floor(b.y / TILE)
    const bottom = Math.floor((b.y + b.h - 0.01) / TILE)
    if (b.vx > 0) {
      const tx = Math.floor((b.x + b.w) / TILE)
      for (let ty = top; ty <= bottom; ty++)
        if (this.solidAt(tx, ty)) {
          b.x = tx * TILE - b.w - 0.01
          b.vx = 0
          hitWall = true
          break
        }
    } else if (b.vx < 0) {
      const tx = Math.floor(b.x / TILE)
      for (let ty = top; ty <= bottom; ty++)
        if (this.solidAt(tx, ty)) {
          b.x = (tx + 1) * TILE + 0.01
          b.vx = 0
          hitWall = true
          break
        }
    }
    // Y axis
    const prevBottom = b.y + b.h
    b.y += b.vy * dt
    const left = Math.floor((b.x + 1) / TILE)
    const right = Math.floor((b.x + b.w - 1) / TILE)
    let grounded = false
    if (b.vy >= 0) {
      const ty = Math.floor((b.y + b.h) / TILE)
      for (let tx = left; tx <= right; tx++) {
        const solid = this.solidAt(tx, ty)
        const platform =
          this.tileAt(tx, ty) === T.PLATFORM && prevBottom <= ty * TILE + 1 && (b.dropTimer ?? 0) <= 0
        if (solid || platform) {
          b.y = ty * TILE - b.h
          b.vy = 0
          grounded = true
          break
        }
      }
    } else {
      const ty = Math.floor(b.y / TILE)
      for (let tx = left; tx <= right; tx++)
        if (this.solidAt(tx, ty)) {
          b.y = (ty + 1) * TILE + 0.01
          b.vy = 0
          break
        }
    }
    return { grounded, hitWall }
  }

  private doBite() {
    const p = this.player
    this.events.push({ type: 'bite', x: p.x, y: p.y })
    const box: Rect = {
      x: p.facing > 0 ? p.x + p.w - 4 : p.x - BITE_W + 4,
      y: p.y + 2,
      w: BITE_W,
      h: BITE_H
    }
    let hit = false
    for (const enemy of this.enemies) {
      if (enemy.dead) continue
      if (this.overlaps(box, enemy)) {
        this.damageEnemy(enemy, 1, p.facing)
        hit = true
      }
    }
    if (this.boss && !this.boss.dead && this.overlaps(box, this.boss)) {
      this.damageBoss(1)
      hit = true
    }
    for (const prop of [...this.props]) {
      if (prop.state !== 'idle') continue
      if (!this.overlaps(box, propRect(prop))) continue
      this.biteProp(prop, p.facing)
      hit = true
    }
    // dig dirt tiles in the bite box
    const x0 = Math.floor(box.x / TILE)
    const x1 = Math.floor((box.x + box.w) / TILE)
    const y0 = Math.floor(box.y / TILE)
    const y1 = Math.floor((box.y + box.h) / TILE)
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (this.tileAt(tx, ty) === T.DIRT) {
          this.digTile(tx, ty)
          hit = true
        }
      }
    if (hit) this.shake = Math.max(this.shake, 0.12)
  }

  private digTile(tx: number, ty: number) {
    if (this.tileAt(tx, ty) !== T.DIRT) return
    this.tiles[ty * this.w + tx] = T.EMPTY
    this.events.push({ type: 'dig', x: tx * TILE, y: ty * TILE })
    this.burst(tx * TILE + 32, ty * TILE + 32, 8, '#c98b4b', 130, 0.5)
    // Open the tile above too, so a dug tunnel is tall enough to jump out of.
    if (ty > 0 && this.tileAt(tx, ty - 1) === T.DIRT) {
      this.tiles[(ty - 1) * this.w + tx] = T.EMPTY
      this.burst(tx * TILE + 32, (ty - 1) * TILE + 32, 6, '#c98b4b', 110, 0.45)
      if (this.rng.next() > 0.5) this.dropMaterial(tx * TILE, (ty - 1) * TILE)
    }
    // collapse dirt directly below, up to a few tiles
    let below = ty + 1
    let count = 0
    while (below < this.h && count < 4 && this.tileAt(tx, below) === T.DIRT) {
      this.tiles[below * this.w + tx] = T.EMPTY
      this.burst(tx * TILE + 32, below * TILE + 32, 5, '#c98b4b', 110, 0.45)
      below++
      count++
    }
  }

  biteProp(prop: Prop, dir: 1 | -1) {
    const px = prop.x + (prop.w * TILE) / 2
    const py = prop.y + (prop.h * TILE) / 2
    switch (prop.kind) {
      case 'tree':
      case 'pine': {
        prop.hp -= 1
        this.events.push({ type: 'tree', x: px, y: py })
        this.burst(px, py, 6, '#4fbf67', 110, 0.4)
        if (prop.hp <= 0) this.fallTree(prop, dir)
        break
      }
      case 'pipe': {
        prop.state = 'broken'
        prop.timer = 6
        this.events.push({ type: 'pipe', x: px, y: py })
        this.burst(px, py, 10, '#57b8ff', 150, 0.5)
        break
      }
      case 'hive': {
        prop.state = 'broken'
        this.events.push({ type: 'hive', x: px, y: py })
        this.releaseBees(px, py)
        break
      }
      case 'animal': {
        prop.state = 'awake'
        prop.dir = dir
        prop.timer = 3
        this.events.push({ type: 'animal', x: px, y: py })
        break
      }
      case 'rock': {
        prop.hp -= 1
        this.events.push({ type: 'rock', x: px, y: py })
        this.burst(px, py, 6, '#a8a0b8', 110, 0.4)
        if (prop.hp <= 0) {
          prop.state = 'broken'
          this.dynamic[(prop.y / TILE) * this.w + prop.x / TILE] = 0
          this.burst(px, py, 14, '#a8a0b8', 190, 0.6)
          if (this.rng.next() > 0.55) this.dropFruit(prop.x, prop.y)
        }
        break
      }
      case 'switch': {
        prop.state = 'done'
        this.events.push({ type: 'switch', x: px, y: py })
        this.openDoors(prop.data)
        this.burst(px, py, 8, '#ffd45e', 130, 0.4)
        break
      }
      case 'fruit':
      case 'twig':
      case 'berry':
      case 'star':
        this.collect(prop)
        break
      default:
        break
    }
  }

  private fallTree(prop: Prop, dir: 1 | -1) {
    prop.state = 'falling'
    prop.dir = dir
    prop.timer = 0.45
    this.events.push({ type: 'tree', x: prop.x, y: prop.y })
  }

  private dropFruit(x: number, y: number) {
    this.props.push({
      id: this.nextId++,
      kind: 'fruit',
      x: x + 16,
      y: y + 16,
      w: 0.5,
      h: 0.5,
      hp: 1,
      state: 'idle',
      timer: 0,
      dir: 1,
      data: 0
    })
  }

  /** On the nest stage, digging and felled trees also yield building material. */
  private dropMaterial(x: number, y: number) {
    if (this.stage.objective !== 'collect') return
    this.props.push({
      id: this.nextId++,
      kind: this.rng.next() > 0.5 ? 'twig' : 'berry',
      x: x + 16,
      y: y + 16,
      w: 0.5,
      h: 0.5,
      hp: 1,
      state: 'idle',
      timer: 0,
      dir: 1,
      data: 0
    })
  }

  private releaseBees(x: number, y: number) {
    const count = 7
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      this.bees.push({
        x,
        y,
        vx: Math.cos(a) * 140,
        vy: Math.sin(a) * 140 - 60,
        life: 7,
        t: this.rng.range(0, 1),
        cooldown: 0
      })
    }
    this.burst(x, y, 10, '#ffd45e', 150, 0.4)
  }

  private openDoors(id: number) {
    for (const prop of this.props) {
      if (prop.kind === 'door' && prop.data === id && prop.state === 'closed') {
        prop.state = 'open'
        for (let ty = 0; ty < prop.h; ty++)
          for (let tx = 0; tx < prop.w; tx++) this.dynamic[(prop.y / TILE + ty) * this.w + (prop.x / TILE + tx)] = 0
        this.events.push({ type: 'switch', x: prop.x, y: prop.y })
        this.burst(prop.x + (prop.w * TILE) / 2, prop.y + (prop.h * TILE) / 2, 16, '#ffd45e', 200, 0.6)
      }
    }
  }

  collect(prop: Prop) {
    prop.state = 'collected'
    const x = prop.x + 32
    const y = prop.y + 32
    if (prop.kind === 'fruit') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1)
      this.floaters.push({ x, y, text: 'たいりょく+1', life: 1, color: '#ff9aa4' })
      this.events.push({ type: 'fruit', x, y })
    } else if (prop.kind === 'star') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2)
      this.floaters.push({ x, y, text: 'きらきら+2', life: 1.1, color: '#ffd45e' })
      this.events.push({ type: 'pickup', x, y })
    } else {
      this.collected += 1
      this.floaters.push({ x, y, text: `${this.collected}/${this.stage.collect ?? 0}`, life: 1, color: '#a4f29a' })
      this.events.push({ type: 'pickup', x, y })
    }
    this.burst(x, y, 8, prop.kind === 'berry' ? '#d06ae8' : '#ffd45e', 120, 0.4)
    if (this.stage.objective === 'collect' && this.collected >= (this.stage.collect ?? 0) && !this.bossSpawned()) {
      this.spawnBoss()
    }
  }

  private bossSpawned() {
    return this.boss !== null && this.boss.active
  }

  private spawnBoss() {
    // The stage-6 nest stage spawns its boss when the materials are complete.
    if (this.boss) return
    const def = this.stage.boss
    const w = 64 * def.scale * 0.72
    const h = 64 * def.scale * 0.72
    const x = Math.min(this.w * TILE - w - 20, this.player.x + 420)
    const y = this.player.y - 100
    this.boss = {
      def,
      x,
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      hp: def.hp,
      maxHp: def.hp,
      facing: -1,
      state: 'idle',
      stateTime: 0,
      onGround: false,
      hitFlash: 0,
      stamina: 100,
      maxStamina: 100,
      phase: 1,
      dead: false,
      active: true,
      minionTimer: 3,
      shotTimer: 2,
      diveTimer: 3,
      targetX: 0,
      targetY: 0,
      invuln: 0
    }
    this.shake = 0.8
  }

  // ------------------------------------------------------------------ enemies

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue
      enemy.t += dt
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
      const stats = enemyStats(enemy.kind)
      const dx = this.player.x - enemy.x
      const dir = dx > 0 ? 1 : -1
      if (enemy.kind === 'walker' || enemy.kind === 'tough') {
        const chase = Math.abs(dx) < 260
        const speed = chase ? stats.speed * 1.35 : stats.speed
        if (chase) enemy.facing = dir
        enemy.vx = enemy.facing * speed
        enemy.vy = Math.min(MAX_FALL, enemy.vy + GRAVITY * dt)
        const hitWall = this.moveEnemy(enemy, dt)
        if (hitWall) enemy.facing = (enemy.facing * -1) as 1 | -1
        if (enemy.onGround && this.aheadIsPit(enemy)) enemy.facing = (enemy.facing * -1) as 1 | -1
      } else if (enemy.kind === 'jumper') {
        enemy.vx = Math.abs(dx) > 40 ? dir * stats.speed : 0
        enemy.facing = dir
        enemy.vy = Math.min(MAX_FALL, enemy.vy + GRAVITY * dt)
        if (enemy.onGround) {
          enemy.vy = -520
          enemy.vx = dir * stats.speed
          this.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h, 3, '#ffffff', 40, 0.25)
        }
        this.moveEnemy(enemy, dt)
      } else if (enemy.kind === 'flyer') {
        const targetY = this.player.y - 70 + Math.sin(enemy.t * 2.2) * 26
        enemy.vx += (dir * stats.speed - enemy.vx) * Math.min(1, dt * 3)
        enemy.vy += (targetY - enemy.y) * dt * 3
        enemy.vy = Math.max(-170, Math.min(170, enemy.vy))
        enemy.facing = dir
        this.moveEnemy(enemy, dt)
      } else if (enemy.kind === 'spitter') {
        enemy.facing = dir
        enemy.vx = 0
        enemy.vy = Math.min(MAX_FALL, enemy.vy + GRAVITY * dt)
        this.moveEnemy(enemy, dt)
        enemy.shootTimer -= dt
        if (enemy.shootTimer <= 0 && Math.abs(dx) < 420) {
          enemy.shootTimer = 2.4
          this.shots.push({
            kind: 'seed',
            x: enemy.x + enemy.w / 2,
            y: enemy.y + enemy.h * 0.4,
            w: 14,
            h: 14,
            vx: dir * 260,
            vy: -40,
            hostile: true,
            life: 4,
            dead: false
          })
          this.events.push({ type: 'bite', x: enemy.x, y: enemy.y })
        }
      }
      if (enemy.y > this.h * TILE + 120) enemy.dead = true
      if (this.overlaps(this.player, enemy) && !this.player.dead) {
        this.hurtPlayer(enemy.touchDamage, enemy.x + enemy.w / 2)
      }
      if (enemy.hp <= 0 && !enemy.dead) this.killEnemy(enemy)
    }
    this.enemies = this.enemies.filter((enemy) => !enemy.dead || enemy.hitFlash > 0)
  }

  private moveEnemy(enemy: Enemy, dt: number): boolean {
    const result = this.moveBody(enemy, dt)
    enemy.onGround = result.grounded
    return result.hitWall
  }

  private aheadIsPit(enemy: Enemy): boolean {
    const tx = Math.floor((enemy.x + (enemy.facing > 0 ? enemy.w + 6 : -6)) / TILE)
    const ty = Math.floor((enemy.y + enemy.h + 12) / TILE)
    return !this.solidAt(tx, ty) && !this.waterAt(tx, ty)
  }

  private damageEnemy(enemy: Enemy, amount: number, dir: 1 | -1) {
    enemy.hp -= amount
    enemy.hitFlash = 0.16
    enemy.vx = dir * 220
    enemy.vy = -180
    this.events.push({ type: 'enemy-down', x: enemy.x, y: enemy.y })
    this.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 7, '#ffffff', 150, 0.4)
    this.shake = Math.max(this.shake, 0.14)
  }

  private killEnemy(enemy: Enemy) {
    enemy.dead = true
    enemy.hitFlash = 0.2
    this.kills += 1
    this.burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 14, '#ffd45e', 200, 0.6)
    this.floaters.push({ x: enemy.x + enemy.w / 2, y: enemy.y, text: '100', life: 0.8, color: '#fff3b8' })
  }

  // ------------------------------------------------------------------ boss

  private updateBoss(dt: number) {
    const boss = this.boss!
    if (boss.dead) return
    boss.stateTime += dt
    boss.hitFlash = Math.max(0, boss.hitFlash - dt)
    boss.invuln = Math.max(0, boss.invuln - dt)
    const p = this.player
    const dx = p.x - boss.x
    const dir: 1 | -1 = dx > 0 ? 1 : -1
    const distance = Math.abs(dx)

    if (boss.def.stamina) {
      this.updateChaserBoss(boss, dt, dir, distance)
    } else if (boss.def.kind === 'flyer') {
      this.updateFlyerBoss(boss, dt, dir, distance)
    } else if (boss.def.kind === 'tank') {
      this.updateTankBoss(boss, dt, dir, distance)
    } else if (boss.def.kind === 'swarm') {
      this.updateSwarmBoss(boss, dt, dir, distance)
    } else if (boss.def.kind === 'final') {
      this.updateFinalBoss(boss, dt, dir, distance)
    } else {
      this.updateBruteBoss(boss, dt, dir, distance)
    }

    boss.vy = Math.min(MAX_FALL, boss.vy + GRAVITY * dt)
    const move = this.moveBody(boss, dt)
    boss.onGround = move.grounded
    if (move.hitWall && boss.state === 'charge') {
      this.setBossState(boss, 'stunned')
      this.shake = 0.5
      this.burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 16, '#ffffff', 220, 0.6)
    }
    if (boss.y > this.h * TILE + 200) {
      boss.y = 0
      boss.vy = 0
    }
    if (this.overlaps(p, boss) && !p.dead && boss.state !== 'stunned' && boss.state !== 'tired') {
      this.hurtPlayer(1, boss.x + boss.w / 2)
    }
    if (boss.hp <= 0 && !boss.dead) this.defeatBoss()
  }

  private updateChaserBoss(boss: Boss, dt: number, dir: 1 | -1, distance: number) {
    const p = this.player
    if (boss.state === 'tired') {
      boss.vx *= 0.9
      return
    }
    boss.stamina -= dt * 4
    if (boss.stamina <= 0) {
      boss.stamina = 0
      boss.state = 'tired'
      this.floaters.push({ x: boss.x, y: boss.y, text: 'ハム代はつかれた…', life: 1.6, color: '#ffd45e' })
      return
    }
    // She starts fast and visibly fades as her stamina runs out.
    const speed = boss.def.speed * (1.06 - 0.42 * (1 - boss.stamina / 100))
    boss.facing = dir
    boss.vx = dir * speed
    // hop over obstacles
    if (boss.onGround) {
      const aheadTx = Math.floor((boss.x + (dir > 0 ? boss.w + 8 : -8)) / TILE)
      const footTy = Math.floor((boss.y + boss.h - 4) / TILE)
      if (this.solidAt(aheadTx, footTy)) boss.vy = -560
      if (this.solidAt(aheadTx, footTy - 1)) boss.vy = -620
    }
    // smash through props
    for (const prop of this.props) {
      if (prop.state !== 'idle') continue
      if (!this.overlaps(boss, propRect(prop))) continue
      if (prop.kind === 'tree' || prop.kind === 'pine' || prop.kind === 'rock') {
        this.biteProp(prop, dir)
      }
    }
    // dig through dirt
    const tx = Math.floor((boss.x + boss.w / 2) / TILE)
    const ty = Math.floor((boss.y + boss.h - 6) / TILE)
    if (this.tileAt(tx, ty) === T.DIRT || this.tileAt(tx + dir, ty) === T.DIRT) this.digTile(tx + dir, ty)
    if (distance < 120 && boss.stamina > 0) boss.stamina -= dt * 3
    void p
  }

  private updateBruteBoss(boss: Boss, dt: number, dir: 1 | -1, distance: number) {
    const speed = boss.def.speed
    switch (boss.state) {
      case 'idle':
        boss.vx *= 0.8
        boss.facing = dir
        if (boss.stateTime > 0.7) this.setBossState(boss, 'windup')
        break
      case 'windup':
        boss.vx = 0
        boss.facing = dir
        if (boss.stateTime > 0.45) {
          this.setBossState(boss, 'charge')
          boss.vx = dir * speed * 2.1
          this.events.push({ type: 'shock', x: boss.x, y: boss.y })
        }
        break
      case 'charge': {
        boss.vx = boss.facing * speed * 2.1
        if (boss.stateTime > 1.1) this.setBossState(boss, 'recover')
        break
      }
      case 'stunned':
        boss.vx *= 0.8
        if (boss.stateTime > 1.1) this.setBossState(boss, 'recover')
        break
      case 'recover':
        boss.vx *= 0.86
        if (boss.stateTime > 0.6) this.setBossState(boss, 'idle')
        break
      default:
        this.setBossState(boss, 'idle')
        break
    }
    if (boss.def.shockwave && boss.state === 'charge' && boss.onGround && this.rng.next() > 0.7) {
      this.spawnShock(boss.x + boss.w / 2, boss.y + boss.h, boss.facing)
    }
    if (boss.def.minions.length && boss.state === 'idle' && boss.stateTime < dt * 2) {
      boss.minionTimer -= dt
      if (boss.minionTimer <= 0) {
        boss.minionTimer = 5
        this.spawnMinion(boss)
      }
    }
    void distance
  }

  private updateFlyerBoss(boss: Boss, dt: number, dir: 1 | -1, distance: number) {
    // Cruise low enough that a jump and a bite can reach it; the dive is the bigger opening.
    const targetY = this.player.y - 78 + Math.sin(this.time * 2) * 22
    switch (boss.state) {
      case 'idle':
        boss.vx += (dir * boss.def.speed - boss.vx) * Math.min(1, dt * 2)
        boss.vy += (targetY - boss.y) * dt * 2
        boss.facing = dir
        if (boss.stateTime > 1.4) this.setBossState(boss, 'windup')
        break
      case 'windup':
        boss.vx *= 0.8
        boss.vy *= 0.8
        if (boss.stateTime > 0.4) {
          this.setBossState(boss, 'dive')
          boss.vx = dir * boss.def.speed * 2.4
          boss.vy = 260
          this.events.push({ type: 'shock', x: boss.x, y: boss.y })
        }
        break
      case 'dive':
        if (boss.y > this.player.y + 40 || boss.stateTime > 1.4) this.setBossState(boss, 'recover')
        break
      case 'recover':
        boss.vy -= 120 * dt
        if (boss.stateTime > 0.9) this.setBossState(boss, 'idle')
        break
      default:
        this.setBossState(boss, 'idle')
        break
    }
    boss.vy = Math.max(-220, Math.min(420, boss.vy))
    boss.shotTimer -= dt
    if (boss.def.projectiles && boss.shotTimer <= 0 && boss.state === 'idle') {
      boss.shotTimer = 1.7
      for (let i = 0; i < boss.def.projectiles; i++) {
        const spread = (i - (boss.def.projectiles - 1) / 2) * 0.35
        this.shots.push({
          kind: 'seed',
          x: boss.x + boss.w / 2,
          y: boss.y + boss.h * 0.5,
          w: 14,
          h: 14,
          vx: Math.cos(spread) * 240 * (this.player.x > boss.x ? 1 : -1),
          vy: Math.sin(spread) * 240 + 60,
          hostile: true,
          life: 4,
          dead: false
        })
      }
    }
    if (boss.def.minions.length && this.rng.next() > 0.995) this.spawnMinion(boss)
    void distance
  }

  private updateTankBoss(boss: Boss, dt: number, dir: 1 | -1, distance: number) {
    switch (boss.state) {
      case 'idle':
        boss.vx = dir * boss.def.speed
        boss.facing = dir
        if (boss.stateTime > 1.2) this.setBossState(boss, 'windup')
        break
      case 'windup':
        boss.vx *= 0.7
        if (boss.stateTime > 0.5) {
          this.setBossState(boss, 'slam')
          boss.vy = -620
          boss.vx = dir * boss.def.speed * 1.6
        }
        break
      case 'slam':
        if (boss.onGround && boss.stateTime > 0.2) {
          this.setBossState(boss, 'recover')
          this.shake = 0.7
          this.events.push({ type: 'shock', x: boss.x, y: boss.y })
          this.spawnShock(boss.x + boss.w / 2, boss.y + boss.h, -1)
          this.spawnShock(boss.x + boss.w / 2, boss.y + boss.h, 1)
          this.burst(boss.x + boss.w / 2, boss.y + boss.h, 18, '#a8a0b8', 240, 0.7)
        }
        break
      case 'recover':
        boss.vx *= 0.85
        if (boss.stateTime > 1) this.setBossState(boss, 'idle')
        break
      default:
        this.setBossState(boss, 'idle')
        break
    }
    boss.minionTimer -= dt
    if (boss.def.minions.length && boss.minionTimer <= 0) {
      boss.minionTimer = 6
      this.spawnMinion(boss)
    }
    void distance
  }

  private updateSwarmBoss(boss: Boss, dt: number, dir: 1 | -1, distance: number) {
    switch (boss.state) {
      case 'idle':
        boss.vx = dir * boss.def.speed
        boss.facing = dir
        if (boss.stateTime > 0.9) this.setBossState(boss, 'windup')
        break
      case 'windup':
        boss.vx *= 0.7
        if (boss.stateTime > 0.35) {
          this.setBossState(boss, 'charge')
          boss.vx = dir * boss.def.speed * 2.6
          this.events.push({ type: 'shock', x: boss.x, y: boss.y })
        }
        break
      case 'charge':
        if (boss.stateTime > 0.8) this.setBossState(boss, 'recover')
        break
      case 'recover':
        boss.vx *= 0.86
        if (boss.stateTime > 0.7) this.setBossState(boss, 'idle')
        break
      default:
        this.setBossState(boss, 'idle')
        break
    }
    boss.minionTimer -= dt
    if (boss.def.minions.length && boss.minionTimer <= 0) {
      boss.minionTimer = 3.4
      this.spawnMinion(boss)
      this.spawnMinion(boss)
    }
    boss.shotTimer -= dt
    if (boss.def.projectiles && boss.shotTimer <= 0) {
      boss.shotTimer = 2.1
      for (let i = 0; i < boss.def.projectiles; i++) {
        const spread = (i - (boss.def.projectiles - 1) / 2) * 0.4
        this.shots.push({
          kind: 'seed',
          x: boss.x + boss.w / 2,
          y: boss.y + boss.h * 0.4,
          w: 14,
          h: 14,
          vx: (this.player.x > boss.x ? 1 : -1) * Math.cos(spread) * 220,
          vy: Math.sin(spread) * 220,
          hostile: true,
          life: 4,
          dead: false
        })
      }
    }
    void distance
  }

  private updateFinalBoss(boss: Boss, dt: number, dir: 1 | -1, distance: number) {
    if (boss.phase === 1 && boss.hp <= boss.maxHp / 2) {
      boss.phase = 2
      boss.stateTime = 0
      this.shake = 0.6
      this.floaters.push({ x: boss.x, y: boss.y, text: '黒ハム王 第二形態！', life: 1.6, color: '#ff5f8f' })
      this.events.push({ type: 'boss-hit', x: boss.x, y: boss.y })
    }
    const speed = boss.def.speed * (boss.phase === 2 ? 1.25 : 1)
    switch (boss.state) {
      case 'idle':
        boss.vx = dir * speed
        boss.facing = dir
        if (boss.stateTime > (boss.phase === 2 ? 0.6 : 0.9)) this.setBossState(boss, 'windup')
        break
      case 'windup':
        boss.vx *= 0.7
        if (boss.stateTime > 0.35) {
          const roll = this.rng.next()
          if (roll > 0.66 && boss.def.shockwave) {
            this.setBossState(boss, 'slam')
            boss.vy = -640
            boss.vx = dir * speed * 1.5
          } else if (roll > 0.33 && boss.def.projectiles) {
            this.setBossState(boss, 'shoot')
          } else {
            this.setBossState(boss, 'charge')
            boss.vx = dir * speed * 2.4
          }
          this.events.push({ type: 'shock', x: boss.x, y: boss.y })
        }
        break
      case 'charge':
        if (boss.stateTime > (boss.phase === 2 ? 1 : 0.85)) this.setBossState(boss, 'recover')
        break
      case 'shoot':
        boss.vx *= 0.6
        if (boss.stateTime > 0.5) {
          const count = boss.def.projectiles + boss.phase - 1
          for (let i = 0; i < count; i++) {
            const a = Math.PI * (0.15 + (i / Math.max(1, count - 1)) * 0.7)
            const dirX = this.player.x > boss.x ? 1 : -1
            this.shots.push({
              kind: 'seed',
              x: boss.x + boss.w / 2,
              y: boss.y + boss.h * 0.4,
              w: 14,
              h: 14,
              vx: Math.cos(a) * 250 * dirX,
              vy: -Math.sin(a) * 250,
              hostile: true,
              life: 5,
              dead: false
            })
          }
          this.setBossState(boss, 'recover')
        }
        break
      case 'slam':
        if (boss.onGround && boss.stateTime > 0.2) {
          this.setBossState(boss, 'recover')
          this.shake = 0.8
          this.spawnShock(boss.x + boss.w / 2, boss.y + boss.h, -1)
          this.spawnShock(boss.x + boss.w / 2, boss.y + boss.h, 1)
        }
        break
      case 'recover':
        boss.vx *= 0.86
        if (boss.stateTime > (boss.phase === 2 ? 0.5 : 0.8)) this.setBossState(boss, 'idle')
        break
      default:
        this.setBossState(boss, 'idle')
        break
    }
    boss.minionTimer -= dt
    if (boss.def.minions.length && boss.minionTimer <= 0) {
      boss.minionTimer = boss.phase === 2 ? 4 : 6
      this.spawnMinion(boss)
    }
    void distance
  }

  private setBossState(boss: Boss, state: Boss['state']) {
    boss.state = state
    boss.stateTime = 0
  }

  private spawnShock(x: number, y: number, dir: 1 | -1) {
    this.shots.push({
      kind: 'shock',
      x,
      y: y - 22,
      w: 30,
      h: 22,
      vx: dir * 260,
      vy: 0,
      hostile: true,
      life: 1.6,
      dead: false
    })
    this.events.push({ type: 'shock', x, y })
  }

  private spawnMinion(boss: Boss) {
    const alive = this.enemies.filter((enemy) => !enemy.dead).length
    if (alive >= 3) return
    const kind = boss.def.minions[this.rng.int(0, boss.def.minions.length - 1)]
    const stats = enemyStats(kind)
    const dir: 1 | -1 = this.player.x > boss.x ? 1 : -1
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: boss.x + boss.w / 2 - stats.w / 2 + dir * 40,
      y: boss.y + boss.h - stats.h,
      w: stats.w,
      h: stats.h,
      vx: 0,
      vy: 0,
      hp: stats.hp,
      maxHp: stats.hp,
      facing: dir,
      onGround: false,
      t: 0,
      shootTimer: 2,
      hitFlash: 0,
      dead: false,
      anchor: boss.x,
      touchDamage: stats.touch
    })
    this.burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 10, '#c9b8ff', 160, 0.5)
  }

  damageBoss(amount: number) {
    const boss = this.boss
    if (!boss || boss.dead || boss.invuln > 0) return
    if (boss.def.stamina) {
      // A chasing parent is never defeated: hits only tire her out faster.
      boss.stamina = Math.max(0, boss.stamina - amount * 9)
      boss.hitFlash = 0.18
      this.events.push({ type: 'boss-hit', x: boss.x, y: boss.y })
      this.burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 8, '#ffd45e', 170, 0.45)
      this.shake = Math.max(this.shake, 0.16)
      if (boss.stamina <= 0 && boss.state !== 'tired') {
        boss.state = 'tired'
        this.floaters.push({ x: boss.x, y: boss.y, text: 'ハム代はつかれた…', life: 1.6, color: '#ffd45e' })
      }
      return
    }
    const bonus = boss.state === 'stunned' || boss.state === 'recover' ? 1 : 0
    boss.hp -= amount + bonus
    boss.hitFlash = 0.18
    boss.invuln = 0.12
    this.events.push({ type: 'boss-hit', x: boss.x, y: boss.y })
    this.burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 10, '#ffd45e', 190, 0.5)
    this.shake = Math.max(this.shake, 0.2)
    if (boss.hp <= 0 && !boss.dead) this.defeatBoss()
  }

  private defeatBoss() {
    const boss = this.boss!
    boss.dead = true
    this.kills += 1
    this.shake = 1
    this.burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 40, '#ffd45e', 320, 1)
    this.burst(boss.x + boss.w / 2, boss.y + boss.h / 2, 24, '#ff9ecb', 260, 0.9)
    this.floaters.push({ x: boss.x + boss.w / 2, y: boss.y, text: 'ボス撃破！', life: 1.6, color: '#ffd45e' })
    this.events.push({ type: 'boss-down', x: boss.x, y: boss.y })
    if (this.stage.objective === 'boss' || this.stage.objective === 'collect') this.goalOpen = true
  }

  // ------------------------------------------------------------------ props

  private updateProps(dt: number) {
    for (const prop of this.props) {
      switch (prop.kind) {
        case 'tree':
        case 'pine':
          if (prop.state === 'falling') {
            prop.timer -= dt
            if (prop.timer <= 0) this.landTree(prop)
          }
          break
        case 'pipe':
          if (prop.state === 'broken') {
            prop.timer -= dt
            this.addWater(prop.x / TILE + 0.5, prop.y / TILE - 0.5)
            if (prop.timer <= 0) prop.state = 'done'
          }
          break
        case 'animal':
          if (prop.state === 'awake' || prop.state === 'charging') {
            prop.timer -= dt
            const body: Body = { x: prop.x, y: prop.y + TILE - 40, w: 48, h: 40, vx: prop.dir * 300, vy: 0 }
            body.vy = Math.min(MAX_FALL, body.vy + GRAVITY * dt)
            this.moveBody(body, dt)
            prop.x = body.x
            prop.y = body.y - (TILE - 40)
            for (const enemy of this.enemies) {
              if (!enemy.dead && this.overlaps(body, enemy)) this.damageEnemy(enemy, 2, prop.dir)
            }
            if (this.boss && !this.boss.dead && this.overlaps(body, this.boss)) this.damageBoss(2)
            if (prop.timer <= 0 || prop.x < -200 || prop.x > this.w * TILE + 200) prop.state = 'done'
          }
          break
        default:
          break
      }
    }
    this.props = this.props.filter(
      (prop) => prop.state !== 'broken' || prop.kind === 'pipe' || prop.kind === 'hive' || prop.kind === 'rock'
    )
  }

  private landTree(prop: Prop) {
    prop.state = 'fallen'
    const baseTx = Math.floor((prop.x + TILE / 2) / TILE)
    const baseTy = Math.floor((prop.y + TILE) / TILE) - 1
    for (let i = 0; i < 3; i++) {
      const tx = baseTx + prop.dir * i
      for (let j = 0; j < 2; j++) {
        const ty = baseTy + j
        if (tx >= 0 && tx < this.w && ty >= 0 && ty < this.h) this.dynamic[ty * this.w + tx] = 1
      }
    }
    const cx = prop.x + TILE / 2 + prop.dir * TILE
    const cy = prop.y + TILE - 40
    for (const enemy of this.enemies) {
      if (!enemy.dead && Math.abs(enemy.x + enemy.w / 2 - cx) < 100 && Math.abs(enemy.y + enemy.h - (cy + 40)) < 80)
        this.damageEnemy(enemy, 2, prop.dir)
    }
    if (this.boss && !this.boss.dead && Math.abs(this.boss.x + this.boss.w / 2 - cx) < 110) this.damageBoss(2)
    if (
      Math.abs(this.player.x + this.player.w / 2 - cx) < 100 &&
      Math.abs(this.player.y + this.player.h - (cy + 40)) < 70
    )
      this.hurtPlayer(1, cx)
    this.events.push({ type: 'tree', x: cx, y: cy })
    this.shake = Math.max(this.shake, 0.4)
    this.burst(cx, cy + 40, 14, '#c98b4b', 220, 0.6)
    if (this.rng.next() > 0.35) this.dropMaterial(prop.x * 1, prop.y)
    // Never leave the player buried under the fallen trunk: slide them out to the nearer side.
    const startTx = Math.min(baseTx, baseTx + prop.dir * 2)
    const endTx = Math.max(baseTx, baseTx + prop.dir * 2)
    const logRect: Rect = { x: startTx * TILE, y: baseTy * TILE, w: (endTx - startTx + 1) * TILE, h: 2 * TILE }
    if (this.overlaps(this.player, logRect)) {
      const leftDist = this.player.x + this.player.w - logRect.x
      const rightDist = logRect.x + logRect.w - this.player.x
      this.player.x = leftDist < rightDist ? logRect.x - this.player.w - 1 : logRect.x + logRect.w + 1
    }
  }

  // ------------------------------------------------------------------ bees & shots

  private updateBees(dt: number) {
    for (const bee of this.bees) {
      bee.life -= dt
      bee.t += dt
      bee.cooldown = Math.max(0, bee.cooldown - dt)
      const target = this.nearestHostile(bee.x, bee.y)
      if (target) {
        const tx = target.x + target.w / 2
        const ty = target.y + target.h / 2
        const dx = tx - bee.x
        const dy = ty - bee.y
        const len = Math.hypot(dx, dy) || 1
        bee.vx += (dx / len) * 900 * dt
        bee.vy += (dy / len) * 900 * dt
      }
      bee.vx *= 0.94
      bee.vy *= 0.94
      bee.vy += Math.sin(bee.t * 12) * 40 * dt
      bee.x += bee.vx * dt
      bee.y += bee.vy * dt
      if (target && bee.cooldown <= 0 && this.overlaps({ x: bee.x - 8, y: bee.y - 8, w: 16, h: 16 }, target)) {
        bee.cooldown = 0.5
        if ('def' in target) this.damageBoss(1)
        else this.damageEnemy(target as Enemy, 1, bee.vx > 0 ? 1 : -1)
      }
      if (bee.life <= 0) continue
      const p = this.player
      if (!p.dead && this.overlaps({ x: bee.x - 8, y: bee.y - 8, w: 16, h: 16 }, p)) {
        this.hurtPlayer(1, bee.x)
        bee.life = 0
      }
    }
    this.bees = this.bees.filter((bee) => bee.life > 0)
  }

  private nearestHostile(x: number, y: number): Body | null {
    let best: Body | null = null
    let bestDist = 420
    for (const enemy of this.enemies) {
      if (enemy.dead) continue
      const d = Math.hypot(enemy.x - x, enemy.y - y)
      if (d < bestDist) {
        bestDist = d
        best = enemy
      }
    }
    if (this.boss && !this.boss.dead && this.boss.active) {
      const d = Math.hypot(this.boss.x - x, this.boss.y - y)
      if (d < bestDist) {
        bestDist = d
        best = this.boss
      }
    }
    return best
  }

  private updateShots(dt: number) {
    for (const shot of this.shots) {
      if (shot.dead) continue
      shot.life -= dt
      if (shot.kind === 'seed') shot.vy += 500 * dt
      shot.x += shot.vx * dt
      shot.y += shot.vy * dt
      const tx = Math.floor((shot.x + shot.w / 2) / TILE)
      const ty = Math.floor((shot.y + shot.h / 2) / TILE)
      if (this.solidAt(tx, ty)) {
        shot.dead = true
        this.burst(shot.x, shot.y, 5, shot.kind === 'shock' ? '#ffd45e' : '#c9b8ff', 120, 0.35)
        continue
      }
      if (shot.hostile && !this.player.dead && this.overlaps(shot, this.player)) {
        this.hurtPlayer(1, shot.x)
        shot.dead = true
      }
      if (shot.life <= 0) shot.dead = true
    }
    this.shots = this.shots.filter((shot) => !shot.dead)
  }

  // ------------------------------------------------------------------ water

  private addWater(x: number, y: number) {
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return
    if (this.solidAt(tx, ty)) return
    if (this.waterTotal >= MAX_WATER) return
    const i = ty * this.w + tx
    if (this.water[i]) return
    this.water[i] = 1
    this.waterTotal += 1
  }

  private waterCount() {
    return this.waterTotal
  }

  private updateWater(dt: number) {
    this.waterTick -= dt
    if (this.waterTick > 0) return
    this.waterTick = 0.07
    const flow: { x: number; y: number }[] = []
    for (let y = this.h - 1; y >= 0; y--) {
      for (let x = 0; x < this.w; x++) {
        if (this.water[y * this.w + x] !== 1) continue
        if (y + 1 < this.h && !this.solidAt(x, y + 1) && !this.water[(y + 1) * this.w + x]) {
          flow.push({ x, y: y + 1 })
          continue
        }
        const dir = this.rng.next() > 0.5 ? 1 : -1
        for (const dx of [dir, -dir]) {
          const nx = x + dx
          if (nx < 0 || nx >= this.w) continue
          if (!this.solidAt(nx, y) && !this.water[y * this.w + nx] && !this.solidAt(nx, y + 1)) {
            flow.push({ x: nx, y })
            break
          }
        }
      }
    }
    let count = this.waterTotal
    for (const cell of flow) {
      if (count >= MAX_WATER) break
      const i = cell.y * this.w + cell.x
      if (!this.water[i]) {
        this.water[i] = 1
        count += 1
      }
    }
    this.waterTotal = count
    // standing in water slows and floats
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.kind === 'flyer') continue
      const tx = Math.floor((enemy.x + enemy.w / 2) / TILE)
      const ty = Math.floor((enemy.y + enemy.h / 2) / TILE)
      if (this.waterAt(tx, ty)) enemy.vx *= 0.82
    }
    if (this.boss && !this.boss.dead && this.boss.def.stamina) {
      const tx = Math.floor((this.boss.x + this.boss.w / 2) / TILE)
      const ty = Math.floor((this.boss.y + this.boss.h / 2) / TILE)
      if (this.waterAt(tx, ty)) {
        this.boss.vx *= 0.7
        this.boss.stamina = Math.max(0, this.boss.stamina - 0.35)
      }
    }
  }

  // ------------------------------------------------------------------ effects

  burst(x: number, y: number, count: number, color: string, speed = 120, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2)
      const v = this.rng.range(speed * 0.3, speed)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: this.rng.range(life * 0.5, life),
        maxLife: life,
        color,
        size: this.rng.range(2, 5),
        gravity: 500
      })
    }
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) {
      particle.life -= dt
      particle.vy += particle.gravity * dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
  }

  private updateFloaters(dt: number) {
    for (const floater of this.floaters) {
      floater.life -= dt
      floater.y -= 34 * dt
    }
    this.floaters = this.floaters.filter((floater) => floater.life > 0)
  }

  private updateCamera(dt: number) {
    const targetX = this.player.x + this.player.w / 2 - 320 + this.player.facing * 40
    const targetY = this.player.y + this.player.h / 2 - 200
    this.cameraX += (targetX - this.cameraX) * Math.min(1, dt * 6)
    this.cameraY += (targetY - this.cameraY) * Math.min(1, dt * 5)
    this.cameraX = Math.max(0, Math.min(this.w * TILE - 640, this.cameraX))
    this.cameraY = Math.max(-40, Math.min(this.h * TILE - 360, this.cameraY))
  }

  private checkGoal() {
    if (this.state !== 'play') return
    const goal = this.props.find((prop) => (prop.kind === 'goal' || prop.kind === 'nest') && prop.state === 'idle')
    if (!goal) return
    if (!this.overlaps(this.player, propRect(goal))) return
    if (!this.goalOpen) return
    this.state = 'clear'
    this.clearTimer = 0
    this.events.push({ type: 'clear', x: goal.x, y: goal.y })
    this.burst(goal.x + 32, goal.y + 32, 30, '#ffd45e', 260, 0.9)
  }

  // ------------------------------------------------------------------ damage

  hurtPlayer(amount: number, sourceX: number) {
    const p = this.player
    if (p.dead || p.invuln > 0) return
    p.hp -= amount
    p.invuln = INVULN
    p.knockX = (p.x + p.w / 2 < sourceX ? -1 : 1) * 260
    p.vy = -260
    this.events.push({ type: 'hurt', x: p.x, y: p.y })
    this.burst(p.x + p.w / 2, p.y + p.h / 2, 12, '#ff5f6d', 200, 0.6)
    this.shake = Math.max(this.shake, 0.4)
    if (p.hp <= 0) {
      p.hp = 0
      p.dead = true
      this.state = 'dead'
      this.events.push({ type: 'dead', x: p.x, y: p.y })
    }
  }

  // ------------------------------------------------------------------ helpers

  private overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }
}

export function propRect(prop: Prop): Rect {
  return { x: prop.x, y: prop.y, w: prop.w * TILE, h: prop.h * TILE }
}

export { enemyStats, ENEMY_STATS, TILE }
