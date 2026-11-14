/**
 * Every prop kind and state, drawn from the `prop:*` sheets: trees and the logs they become, pipes, hives on
 * their posts, うりぼう, rocks, switches, doors, the boss gate, pickups, the exit, ハム姫 in her cage, projectiles
 * and bees. Cell props sit on their cell's top-left; trees stand on the bottom centre of their cell.
 * The placement maths (`doorPieces`, `gatePieces`, `logPieces`, `hivePostRows`) is pure and tested.
 */
import type { SimEvent } from '../game/events'
import { T, type Prop, type World } from '../game/sim'
import { TILE } from '../game/types'
import { blit, brush, clip, type BlitCall } from './bake'
import { princessClip, specDuration } from './clips'
import { PROP_SPEC, themedProp } from '../art/contract'
import type { FxPool } from './fx'

export interface Piece {
  x: number
  y: number
  clip: 'top' | 'mid' | 'bottom'
}

/** One picture per tile of a closed door: a cap, middles and a foot in every column. */
export function doorPieces(door: { x: number; y: number; w: number; h: number }): Piece[] {
  const pieces: Piece[] = []
  for (let i = 0; i < door.w; i++)
    for (let j = 0; j < door.h; j++)
      pieces.push({
        x: door.x + i * TILE,
        y: door.y + j * TILE,
        clip: j === 0 ? 'top' : j === door.h - 1 ? 'bottom' : 'mid'
      })
  return pieces
}

/** The boss gate over tile column `tx`, rows `top`..`bottom`. */
export function gatePieces(gate: { tx: number; top: number; bottom: number }): Piece[] {
  const pieces: Piece[] = []
  for (let ty = gate.top; ty <= gate.bottom; ty++)
    pieces.push({
      x: gate.tx * TILE,
      y: ty * TILE,
      clip: ty === gate.top ? 'top' : ty === gate.bottom ? 'bottom' : 'mid'
    })
  return pieces
}

export interface LogRecord {
  kind: 'tree' | 'pine'
  tx: number
  ty: number
  length: number
  dir: 1 | -1
}

/**
 * Where a felled trunk is drawn: the 4-tile log on row `ty` (its top is the walkable surface) and an `under`
 * piece in each cell of the row below that is not ground, where the log bridges a pit.
 */
export function logPieces(log: LogRecord, isGround: (tx: number, ty: number) => boolean) {
  const under: { x: number; y: number }[] = []
  for (let i = 0; i < log.length; i++) {
    const tx = log.tx + i
    if (!isGround(tx, log.ty + 1)) under.push({ x: tx * TILE, y: (log.ty + 1) * TILE })
  }
  return { x: log.tx * TILE, y: log.ty * TILE, flip: log.dir < 0, under }
}

/** Rows of the post under a hive: every empty cell below it down to the first ground or platform (at most 5). */
export function hivePostRows(isOpen: (ty: number) => boolean, ty: number, max = 5): number[] {
  const rows: number[] = []
  for (let y = ty + 1; rows.length < max && isOpen(y); y++) rows.push(y)
  return rows
}

const ease = (t: number) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3
const DOOR_OPEN = 0.5
const GATE_RISE = 0.3
const GATE_FADE = 0.4
const TREE_FALL = 0.45

const duration = (sheet: string, name: string) => specDuration(PROP_SPEC[sheet][name])

const sheetIds = new Map<string, string>()
/** The id of the `prop:<key>` sheet, built once per key (drawing a frame joins no strings). */
function propSheet(key: string): string {
  let id = sheetIds.get(key)
  if (id === undefined) sheetIds.set(key, (id = `prop:${key}`))
  return id
}

export class PropsView {
  private time = 0
  private marks = new Map<number, Record<string, number>>()
  private logs: LogRecord[] = []
  private gate: { tx: number; top: number; bottom: number; at: number; down: number | null } | null = null
  private sparkleTimer = 0
  /** The closed door's pictures, by prop id (a door never moves until it opens). */
  private doorCells = new Map<number, Piece[]>()
  private gateCells: Piece[] = []
  private gateOf: object | null = null
  private themedSheets = new Map<string, string>()

  constructor(
    private world: World,
    private fx: FxPool
  ) {}

  private mark(prop: Prop | undefined, key: string) {
    if (!prop) return
    const marks = this.marks.get(prop.id) ?? {}
    marks[key] = this.time
    this.marks.set(prop.id, marks)
  }

  private since(prop: Prop, key: string): number | null {
    const at = this.marks.get(prop.id)?.[key]
    return at === undefined ? null : this.time - at
  }

  /** The prop of one of `kinds` whose cell holds (x, y). */
  private find(kinds: Prop['kind'][], x: number, y: number) {
    return this.world.props.find(
      (p) => kinds.includes(p.kind) && x >= p.x && x < p.x + p.w * TILE && y >= p.y && y < p.y + p.h * TILE
    )
  }

  get logList(): readonly LogRecord[] {
    return this.logs
  }

  handle(event: SimEvent) {
    switch (event.type) {
      case 'chop':
        this.mark(this.find([event.kind], event.x, event.y), 'shake')
        break
      case 'tree-fall':
        this.mark(this.find([event.kind], event.x, event.y), 'fall')
        break
      case 'tree-land':
        this.logs.push({ kind: event.kind, tx: event.tx, ty: event.ty, length: event.length, dir: event.dir })
        break
      case 'switch':
        this.mark(this.find(['switch'], event.x, event.y), 'flip')
        break
      case 'door-open':
        this.mark(this.find(['door'], event.x + 1, event.y + 1), 'open')
        break
      case 'animal-wake':
        this.mark(this.find(['animal'], event.x, event.y), 'wake')
        break
      case 'princess-free':
        this.mark(this.find(['princess'], event.x, event.y), 'free')
        break
      case 'gate-up':
        this.gate = { tx: event.tx, top: event.top, bottom: event.bottom, at: this.time, down: null }
        break
      case 'gate-down':
        if (this.gate) this.gate.down = this.time
        else this.gate = { tx: event.tx, top: event.top, bottom: event.bottom, at: -9, down: this.time }
        break
      default:
        break
    }
  }

  update(dt: number) {
    this.time += dt
    if (this.gate?.down !== null && this.gate && this.time - this.gate.down! > GATE_FADE) this.gate = null
    // The open exit glitters.
    if (this.world.goalOpen) {
      this.sparkleTimer -= dt
      if (this.sparkleTimer <= 0) {
        this.sparkleTimer = 0.22
        const goal = this.world.props.find((p) => p.kind === 'goal' || p.kind === 'nest')
        if (goal) {
          const r = this.fx.rand
          this.fx.spawn('sparkle', goal.x + 8 + r() * 48, goal.y - 40 + r() * 90, { vy: -12, layer: 'front' })
        }
      }
    }
  }

  private isGround = (tx: number, ty: number) => {
    const t = this.world.tileAt(tx, ty)
    return t === T.SOLID || t === T.DIRT
  }

  private draw(
    ctx: CanvasRenderingContext2D,
    sheet: string,
    name: string,
    t: number,
    x: number,
    y: number,
    o?: BlitCall
  ) {
    const anim = clip(sheet, name)
    if (anim) blit(ctx, anim, t, x, y, o)
  }

  /** The sheet a prop kind uses in this world's theme. */
  private themed(id: string) {
    let sheet = this.themedSheets.get(id)
    if (sheet === undefined) this.themedSheets.set(id, (sheet = themedProp(id, this.world.theme)))
    return sheet
  }

  /** Gimmicks, logs, doors and the gate (everything but pickups, ハム姫 and projectiles). */
  drawProps(ctx: CanvasRenderingContext2D) {
    const time = this.time
    const logSheet = this.themed('prop:log')
    for (const log of this.logs) {
      // The trunk, and a post piece in each cell of the row below it that is not ground (see `logPieces`).
      for (let i = 0; i < log.length; i++)
        if (!this.isGround(log.tx + i, log.ty + 1))
          this.draw(ctx, logSheet, 'under', 0, (log.tx + i) * TILE, (log.ty + 1) * TILE)
      this.draw(
        ctx,
        logSheet,
        log.kind,
        0,
        log.tx * TILE,
        log.ty * TILE,
        brush(log.dir < 0, undefined, undefined, undefined, undefined, undefined, (log.length * TILE) / 2)
      )
    }
    for (const prop of this.world.props) {
      switch (prop.kind) {
        case 'tree':
        case 'pine':
          this.drawTree(ctx, prop)
          break
        case 'pipe': {
          const name = prop.state === 'idle' ? 'idle' : prop.state === 'broken' ? 'burst' : 'done'
          this.draw(ctx, 'prop:pipe', name, time, prop.x, prop.y)
          if (prop.state === 'broken') this.draw(ctx, 'fx', 'gush', time, prop.x, prop.y - TILE)
          break
        }
        case 'hive': {
          const tx = prop.x / TILE
          // The post: every empty cell below the hive down to the first ground or platform (see `hivePostRows`).
          for (
            let ty = prop.y / TILE + 1, n = 0;
            n < 5 && ty < this.world.h && this.world.tileAt(tx, ty) === T.EMPTY;
            ty++, n++
          )
            this.draw(ctx, 'prop:hive', 'post', 0, prop.x, ty * TILE)
          this.draw(ctx, 'prop:hive', 'arm', 0, prop.x, prop.y)
          this.draw(ctx, 'prop:hive', prop.state === 'broken' ? 'broken' : 'idle', time + prop.id * 0.3, prop.x, prop.y)
          break
        }
        case 'animal':
          this.drawAnimal(ctx, prop)
          break
        case 'rock':
          if (prop.state !== 'broken') this.draw(ctx, 'prop:rock', prop.hp >= 2 ? 'idle' : 'cracked', 0, prop.x, prop.y)
          break
        case 'switch': {
          const sheet = propSheet(prop.data === 2 ? 'switch2' : 'switch1')
          const flipped = this.since(prop, 'flip')
          if (prop.state !== 'done') this.draw(ctx, sheet, 'off', time, prop.x, prop.y)
          else if (flipped !== null && flipped < duration(sheet, 'flip'))
            this.draw(ctx, sheet, 'flip', flipped, prop.x, prop.y)
          else this.draw(ctx, sheet, 'on', time, prop.x, prop.y)
          break
        }
        case 'door':
          this.drawDoor(ctx, prop)
          break
        case 'goal':
        case 'nest':
          this.drawGoal(ctx, prop)
          break
        default:
          break
      }
    }
    this.drawGate(ctx)
  }

  private drawTree(ctx: CanvasRenderingContext2D, prop: Prop) {
    if (prop.state === 'fallen') return
    const sheet = this.themed(propSheet(prop.kind))
    const x = prop.x + TILE / 2
    const y = prop.y + TILE
    if (prop.state === 'falling') {
      const age = this.since(prop, 'fall') ?? TREE_FALL - prop.timer
      const k = Math.min(1, age / TREE_FALL)
      this.draw(
        ctx,
        sheet,
        'cut',
        0,
        x,
        y,
        brush(undefined, undefined, 0, undefined, undefined, prop.dir * (Math.PI / 2) * k * k)
      )
      return
    }
    const shaking = this.since(prop, 'shake')
    if (shaking !== null && shaking < duration(sheet, 'shake')) this.draw(ctx, sheet, 'shake', shaking, x, y)
    else this.draw(ctx, sheet, prop.hp >= 2 ? 'idle' : 'cut', this.time + prop.id * 0.37, x, y)
  }

  private drawAnimal(ctx: CanvasRenderingContext2D, prop: Prop) {
    if (prop.state === 'idle') {
      this.draw(ctx, 'prop:animal', 'sleep', this.time, prop.x, prop.y)
      const bob = Math.round(Math.sin(this.time * 1.6 + prop.id) * 3)
      this.draw(ctx, 'fx', 'zzz', this.time, prop.x + 46, prop.y + 6 + bob)
      return
    }
    if (prop.state !== 'awake' && prop.state !== 'charging') return
    const woke = this.since(prop, 'wake') ?? 99
    const flip = prop.dir < 0
    const name = woke < duration('prop:animal', 'wake') ? 'wake' : 'run'
    this.draw(
      ctx,
      'prop:animal',
      name,
      woke,
      prop.x,
      prop.y,
      brush(flip, undefined, undefined, undefined, undefined, undefined, TILE / 2)
    )
  }

  private drawDoor(ctx: CanvasRenderingContext2D, prop: Prop) {
    const sheet = propSheet(prop.data === 2 ? 'door2' : 'door1')
    let lift = 0
    if (prop.state !== 'closed') {
      const opened = this.since(prop, 'open')
      if (opened === null || opened >= DOOR_OPEN) return
      lift = Math.round(ease(opened / DOOR_OPEN) * prop.h * TILE)
    }
    if (lift) {
      // Slide up into the ceiling: only the door's own cells show it.
      ctx.save()
      ctx.beginPath()
      ctx.rect(prop.x, prop.y, prop.w * TILE, prop.h * TILE)
      ctx.clip()
    }
    let pieces = this.doorCells.get(prop.id)
    if (!pieces) this.doorCells.set(prop.id, (pieces = doorPieces(prop)))
    for (const piece of pieces) this.draw(ctx, sheet, piece.clip, 0, piece.x, piece.y - lift)
    if (lift) ctx.restore()
  }

  private drawGate(ctx: CanvasRenderingContext2D) {
    const gate = this.gate
    if (!gate) return
    const height = (gate.bottom - gate.top + 1) * TILE
    if (gate !== this.gateOf) {
      this.gateOf = gate
      this.gateCells = gatePieces(gate)
    }
    const sink = Math.round((1 - ease((this.time - gate.at) / GATE_RISE)) * height)
    const alpha = gate.down === null ? 1 : Math.max(0, 1 - (this.time - gate.down) / GATE_FADE)
    ctx.save()
    ctx.beginPath()
    ctx.rect(gate.tx * TILE, gate.top * TILE, TILE, height)
    ctx.clip()
    for (const piece of this.gateCells)
      this.draw(ctx, 'prop:gate', piece.clip, this.time, piece.x, piece.y + sink, brush(undefined, alpha))
    ctx.restore()
  }

  private drawGoal(ctx: CanvasRenderingContext2D, prop: Prop) {
    const sheet = propSheet(prop.kind)
    const open = this.world.goalOpen
    if (open) {
      const glow = clip('fx', 'glow')
      if (glow)
        blit(ctx, glow, 0, prop.x + TILE / 2, prop.y + 8, brush(undefined, 0.45 + 0.2 * Math.sin(this.time * 3)))
    }
    this.draw(ctx, sheet, open ? 'open' : 'locked', this.time, prop.x, prop.y)
  }

  /** Fruit, stars and nest materials, bobbing. */
  drawPickups(ctx: CanvasRenderingContext2D) {
    for (const prop of this.world.props) {
      if (prop.state !== 'idle') continue
      if (prop.kind !== 'fruit' && prop.kind !== 'star' && prop.kind !== 'twig' && prop.kind !== 'berry') continue
      const x = prop.x + (prop.w * TILE) / 2
      const y = prop.y + (prop.h * TILE) / 2 + Math.round(Math.sin(this.time * 3 + prop.id) * 3)
      if (prop.kind === 'star') {
        const glow = clip('fx', 'glow')
        if (glow) blit(ctx, glow, 0, x, y, brush(undefined, 0.4 + 0.15 * Math.sin(this.time * 4 + prop.id)))
      }
      this.draw(ctx, propSheet(prop.kind), 'idle', this.time + prop.id * 0.21, x, y)
    }
  }

  /** ハム姫 and her cage. */
  drawPrincess(ctx: CanvasRenderingContext2D) {
    const hero = this.world.player
    for (const prop of this.world.props) {
      if (prop.kind !== 'princess') continue
      const caged = prop.data === 1
      const freed = this.since(prop, 'free')
      const cageBreak = freed !== null && freed < duration('prop:cage', 'break')
      if (caged) this.draw(ctx, 'prop:cage', 'back', 0, prop.x, prop.y)
      const choice = princessClip(caged, freed, this.world.goalOpen, this.time + prop.id * 0.4)
      const anim = clip('princess', choice.name)
      const flip = hero.x + hero.w / 2 < prop.x + TILE / 2
      if (anim) blit(ctx, anim, choice.t, prop.x + TILE / 2, prop.y + TILE, brush(flip))
      if (caged) this.draw(ctx, 'prop:cage', 'front', 0, prop.x, prop.y)
      else if (cageBreak) this.draw(ctx, 'prop:cage', 'break', freed, prop.x, prop.y)
    }
  }

  /** Projectiles, shockwaves and bees. */
  drawProjectiles(ctx: CanvasRenderingContext2D) {
    const time = this.time
    for (const shot of this.world.shots) {
      if (shot.dead) continue
      const flip = shot.vx < 0
      if (shot.kind === 'shock') {
        this.draw(ctx, 'prop:shock', 'roll', time, shot.x + shot.w / 2, shot.y + shot.h, brush(flip))
        continue
      }
      const skin = shot.skin ?? 'seed'
      const name = skin === 'stinger' ? 'fly' : skin === 'orb' ? 'pulse' : 'spin'
      this.draw(ctx, propSheet(skin), name, time, shot.x + shot.w / 2, shot.y + shot.h / 2, brush(flip))
    }
    for (const bee of this.world.bees) this.draw(ctx, 'prop:bee', 'fly', time + bee.t, bee.x, bee.y, brush(bee.vx < 0))
  }
}
