/**
 * Every prop kind and state, drawn from the `prop:*` sheets: trees and the logs they become, pipes, hives on
 * their posts, うりぼう, rocks, switches, doors, the boss gate, pickups, the exit, ハム姫 in her cage, projectiles
 * and bees. Cell props sit on their cell's top-left; trees stand on the bottom centre of their cell.
 * The placement maths (`doorPieces`, `gatePieces`, `logPieces`, `hivePostRows`) is pure and tested.
 */
import type { SimEvent } from '../game/events'
import { T, type Boss, type Enemy, type Prop, type Shot, type World } from '../game/sim'
import { TILE } from '../game/types'
import { blit, brush, clip, type BlitCall } from './bake'
import { princessClip, specDuration, strideTime, type ClipChoice } from './clips'
import { PROP_SPEC, themedProp } from '../art/contract'
import type { FxPool } from './fx'
import type { Sight } from './sight'
import { groundBelow } from './actors'
import { anchorOf } from '../art'
import { clipBounds, newBox, newPlaced, opaqueBounds, overlaps, placeBox, type Box, type Placed } from './bounds'

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
/** A うりぼう that moves further than this (px) in one update was put there, not run there. */
const ANIMAL_JUMP_PX = 96
/** A woken うりぼう that has not moved for this long (s) has been stopped (by a wall, a rock): it sits dazed. */
export const ANIMAL_DAZE_AFTER = 0.1
/** A うりぼう in the air kicks between the two airborne frames of its leap this many times a second. */
export const ANIMAL_KICKS = 6
/** Whether a うりぼう has ground within 2 px under its feet (the simulation lets one off a ledge sink slowly). */
const animalOnGround = (world: World, prop: Prop) =>
  (groundBelow(world, prop.x + TILE / 2, prop.y + TILE, 2) ?? Infinity) - (prop.y + TILE) <= 2

/**
 * One awake うりぼう: where it was, the ground it has covered, how long it has not moved, when it sat dazed, and when
 * it left the ground (NaN while it is on it).
 */
interface AnimalRun {
  x: number
  distance: number
  still: number
  dazedAt: number
  airSince: number
}

/** A shockwave rolls on ground within this many px under its middle (else it flies). */
export const SHOCK_GROUND_PX = 4

/** A body a shot can be born in. */
export type Shooter = Boss | Enemy
/** The sheet (`prop:<skin>`) and the clip a shot is drawn with. */
export const shotSkin = (shot: Shot) => shot.skin ?? 'seed'
export const shotClip = (shot: Shot) => (shot.skin === 'stinger' ? 'fly' : shot.skin === 'orb' ? 'pulse' : 'spin')
/** A shockwave is looked for within this many px of the slam that bore it, on its first step. */
const SHOCK_BIRTH_PX = 64
/** A boss's shot, first drawn at his light, has joined its own path this long (s) after the frame that showed it. */
export const SHOT_JOIN_SECONDS = 0.1
/** A boss's shot is first drawn at most this far (px) from its own place (see `shotFromLight`). */
export const SHOT_LIGHT_PX = 12
/** A squirrel's acorn is within this many px of where it spat it on the step it spat (its first step's flight). */
const SPIT_BIRTH_PX = 24
/** The steps a dart is drawn at (rad). */
export const FLIGHT_ANGLE_STEP = Math.PI / 8
/**
 * The rotation a dart drawn facing right (mirrored when it flies left) is drawn with to point along its flight,
 * to the nearest `FLIGHT_ANGLE_STEP` (0: level).
 */
export function flightAngle(vx: number, vy: number) {
  const a = Math.round(Math.atan2(vy, Math.abs(vx)) / FLIGHT_ANGLE_STEP) * FLIGHT_ANGLE_STEP
  return vx < 0 ? -a : a
}
/** Whether (x, y) is inside a body's box. */
const contains = (body: Shooter, x: number, y: number) =>
  x >= body.x && x < body.x + body.w && y >= body.y && y < body.y + body.h

const sheetIds = new Map<string, string>()
/** The id of the `prop:<key>` sheet, built once per key (drawing a frame joins no strings). */
function propSheet(key: string): string {
  let id = sheetIds.get(key)
  if (id === undefined) sheetIds.set(key, (id = `prop:${key}`))
  return id
}

export class PropsView {
  private time = 0
  /** The clock shots, shockwaves and bees spin on: held once the stage is over or the hero is down. */
  private shotTime = 0
  private marks = new Map<number, Record<string, number>>()
  private logs: LogRecord[] = []
  private gate: { tx: number; top: number; bottom: number; at: number; down: number | null } | null = null
  private sparkleTimer = 0
  /** The closed door's pictures, by prop id (a door never moves until it opens). */
  private doorCells = new Map<number, Piece[]>()
  private gateCells: Piece[] = []
  private gateOf: object | null = null
  private themedSheets = new Map<string, string>()
  /** Each awake うりぼう's ground covered since it woke (its run plays by it) and where it was last. */
  private runs = new Map<number, AnimalRun>()
  /** Each shot the view has seen: the body it was born in, and whether it is still behind it (see `shotBehind`). */
  private shooters = new WeakMap<Shot, { shooter: Shooter | null; behind: boolean }>()
  /**
   * The frame a shooter is drawn with now (the stage view hands in `ActorsView.drawnFrame`); without it a shot is
   * behind while it overlaps the shooter's physics box.
   */
  drawnFrame: ((body: Shooter, out: Placed) => boolean) | null = null
  /** The stretch of the stage the frame draws (the stage view's); without one every prop is drawn. */
  sight: Sight | null = null
  /**
   * The boss's shots of this step leave from his light (the stage view hands in, on his `boss-shoot`, how far his
   * light on his drawn body was from where the simulation lets them go: his picture may be held off his body, or
   * jolted by a hit).
   */
  private shotLight: { dx: number; dy: number } | null = null
  /** The boss's shots drawn from his light while they join their own paths (see `shotJoin`). */
  private joining: { shot: Shot; dx: number; dy: number; age: number | null }[] = []
  private joinScratch = { x: 0, y: 0 }
  /** The squirrels that spat on this step (see `simStep`). */
  private spits: { id: number; x: number; y: number }[] = []
  /** Real seconds (they run while the simulation is held or slowed). */
  private realTime = 0
  /** Each freed ハム姫's cheer: the real time it began, null while it waits for her moment, -Infinity: given up. */
  private cheers = new Map<number, { at: number | null }>()
  private placed = newPlaced()
  private shooterBox = newBox()
  private shotBox = newBox()

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
      case 'spit':
        // (Its acorn is the squirrel's whatever box it is born in: see `simStep`.)
        this.spits.push({ id: event.id, x: event.x, y: event.y })
        break
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
      case 'animal-wake': {
        const animal = this.find(['animal'], event.x, event.y)
        this.mark(animal, 'wake')
        if (animal) this.runs.set(animal.id, { x: animal.x, distance: 0, still: 0, dazedAt: NaN, airSince: NaN })
        break
      }
      case 'princess-free':
        this.mark(this.find(['princess'], event.x, event.y), 'free')
        // Without a director she cheers at once (a director holds it for her moment: `holdCheer`).
        this.startCheer(event.x, event.y)
        break
      case 'gate-up':
        this.gate = { tx: event.tx, top: event.top, bottom: event.bottom, at: this.time, down: null }
        break
      case 'shot-hit':
        for (const shot of this.flying) if (shot.x === event.x && shot.y === event.y) this.hitShots.add(shot)
        if (event.kind === 'shock') this.shockHits.push({ x: event.x })
        break
      case 'boss-slam':
        this.slams.push({ x: event.x, y: event.y })
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
    if (this.world.state === 'play') this.shotTime += dt
    // (A boss's shot joins its path on the time it is shown: from the frame that first shows it, age 0.)
    let kept = 0
    for (const j of this.joining) {
      if (j.age === null) j.age = 0
      else j.age += dt
      if (!j.shot.dead && j.age < SHOT_JOIN_SECONDS) this.joining[kept++] = j
    }
    this.joining.length = kept
    // The ground each awake うりぼう covers (a jump of more than a few tiles is not running), and whether it has
    // been stopped: then it sits dazed from the moment it stopped (after its leap) while it stays there. In the air
    // (off a ledge) it neither runs nor sits: it kicks as it sinks, and what it does there counts for neither.
    for (const prop of this.world.props) {
      if (prop.kind !== 'animal' || (prop.state !== 'awake' && prop.state !== 'charging')) continue
      let run = this.runs.get(prop.id)
      if (!run) this.runs.set(prop.id, (run = { x: prop.x, distance: 0, still: 0, dazedAt: NaN, airSince: NaN }))
      if (!(dt > 0)) continue
      if (!animalOnGround(this.world, prop)) {
        if (Number.isNaN(run.airSince)) run.airSince = this.time - dt
        run.x = prop.x
        run.still = 0
        run.dazedAt = NaN
        continue
      }
      run.airSince = NaN
      const step = Math.abs(prop.x - run.x)
      if (step <= ANIMAL_JUMP_PX) run.distance += step
      run.x = prop.x
      run.still = step > 1e-6 ? 0 : run.still + dt
      // (Something it was stopped by can give way, a rock it breaks: then it runs on.)
      if (step > 1e-6) run.dazedAt = NaN
      const leaping = (this.since(prop, 'wake') ?? 99) < duration('prop:animal', 'wake')
      if (Number.isNaN(run.dazedAt) && !leaping && run.still >= ANIMAL_DAZE_AFTER) run.dazedAt = this.time - run.still
    }
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
    const sight = this.sight
    for (const log of this.logs) {
      if (sight && !sight.sees(log.tx * TILE, (log.tx + log.length) * TILE)) continue
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
      if (sight && !sight.sees(prop.x, prop.x + Math.max(1, prop.w) * TILE)) continue
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
    const choice = this.selectAnimal(prop)
    if (!choice) return
    this.draw(
      ctx,
      'prop:animal',
      choice.name,
      choice.t,
      prop.x,
      prop.y,
      brush(prop.dir < 0, undefined, choice.frame, undefined, undefined, undefined, TILE / 2)
    )
    // Dazed, stars circle over its head (as over a stunned boss).
    if (choice.name === 'daze') this.draw(ctx, 'fx', 'dizzy', this.time, prop.x + TILE / 2, prop.y + 8)
  }

  /**
   * The clip an awake うりぼう is drawn with (null while it sleeps or once it is gone): its leap on its own time, then
   * its run by the ground covered since it woke (one pass per stride), and once something has stopped it, sitting
   * dazed (from the moment it stopped) for as long as it stays there. Off the ground it shows its leap in the air:
   * the airborne frames of `wake` (1 and 2), in turn, `ANIMAL_KICKS` times a second.
   */
  selectAnimal(prop: Prop): ClipChoice | null {
    if (prop.state !== 'awake' && prop.state !== 'charging') return null
    const woke = this.since(prop, 'wake') ?? 99
    if (woke < duration('prop:animal', 'wake')) return { name: 'wake', t: woke }
    const run = this.runs.get(prop.id)
    if (run && !Number.isNaN(run.airSince)) {
      const air = this.time - run.airSince
      return { name: 'wake', t: woke, frame: 1 + (Math.floor(air * ANIMAL_KICKS) % 2) }
    }
    if (run && !Number.isNaN(run.dazedAt)) return { name: 'daze', t: this.time - run.dazedAt }
    return { name: 'run', t: strideTime(PROP_SPEC['prop:animal'].run, run?.distance ?? 0) }
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
      if (this.sight && !this.sight.sees(prop.x, prop.x + Math.max(1, prop.w) * TILE)) continue
      const x = prop.x + (prop.w * TILE) / 2
      const y = prop.y + (prop.h * TILE) / 2 + Math.round(Math.sin(this.time * 3 + prop.id) * 3)
      if (prop.kind === 'star') {
        const glow = clip('fx', 'glow')
        if (glow) blit(ctx, glow, 0, x, y, brush(undefined, 0.4 + 0.15 * Math.sin(this.time * 4 + prop.id)))
      }
      this.draw(ctx, propSheet(prop.kind), 'idle', this.time + prop.id * 0.21, x, y)
    }
  }

  /**
   * ハム姫's clip: sad in her cage; freed, her cheer on real time from when it began (`cheerAt`), standing while it
   * waits for her moment, then waving once the exit is open (see `princessClip`).
   */
  selectPrincess(prop: Prop): ClipChoice {
    const time = this.time + prop.id * 0.4
    const caged = prop.data === 1
    const cheer = this.cheers.get(prop.id)
    if (!caged && cheer?.at === null) return { name: 'idle', t: time }
    return princessClip(caged, cheer && cheer.at !== null ? this.realTime - cheer.at : null, this.world.goalOpen, time)
  }

  /**
   * Staging: the director will stage her rescue, so the cheer of the ハム姫 freed at (x, y) waits for it (she stands);
   * `startCheer` begins it, `dropCheer` gives it up (the moment will not play: she goes on as after a cheer).
   */
  holdCheer(x: number, y: number) {
    this.setCheer(x, y, null)
  }

  startCheer(x: number, y: number) {
    this.setCheer(x, y, this.realTime)
  }

  dropCheer(x: number, y: number) {
    this.setCheer(x, y, -Infinity)
  }

  private setCheer(x: number, y: number, at: number | null) {
    const princess = this.find(['princess'], x, y)
    if (princess) this.cheers.set(princess.id, { at })
  }

  /** Advances real time (the stage view calls this with the frame's real dt): ハム姫's cheer runs on it. */
  tickReal(dt: number) {
    this.realTime += dt
  }

  /** ハム姫 and her cage. */
  drawPrincess(ctx: CanvasRenderingContext2D) {
    const hero = this.world.player
    for (const prop of this.world.props) {
      if (prop.kind !== 'princess') continue
      if (this.sight && !this.sight.sees(prop.x, prop.x + Math.max(1, prop.w) * TILE)) continue
      const caged = prop.data === 1
      const freed = this.since(prop, 'free')
      const cageBreak = freed !== null && freed < duration('prop:cage', 'break')
      if (caged) this.draw(ctx, 'prop:cage', 'back', 0, prop.x, prop.y)
      const choice = this.selectPrincess(prop)
      const anim = clip('princess', choice.name)
      const flip = hero.x + hero.w / 2 < prop.x + TILE / 2
      if (anim) blit(ctx, anim, choice.t, prop.x + TILE / 2, prop.y + TILE, brush(flip))
      if (caged) this.draw(ctx, 'prop:cage', 'front', 0, prop.x, prop.y)
      else if (cageBreak) this.draw(ctx, 'prop:cage', 'break', freed, prop.x, prop.y)
    }
  }

  /** A squirrel's acorn emerges from behind its shooter and any overlapping boss. Boss shots start in front. */
  shotBehind(shot: Shot): boolean {
    let record = this.shooters.get(shot)
    if (record === undefined) {
      const shooter = this.bornIn(shot)
      // (A boss's shot is born from its light, in front of him: only a squirrel's acorn comes out from behind it.)
      const behind = shooter !== null && shooter !== this.world.boss
      this.shooters.set(shot, (record = { shooter, behind }))
    }
    if (!record.behind) return false
    const shooter = record.shooter!
    const extent = this.shotExtent(shot)
    if (!shooter.dead && overlaps(extent, this.shooterExtent(shooter))) return true
    // A squirrel minion standing in the boss's drawing throws from behind him: its acorn comes out past him too.
    const boss = this.world.boss
    if (boss && !boss.dead && overlaps(extent, this.shooterExtent(boss))) return true
    record.behind = false
    return false
  }

  /**
   * One simulation step has run: a hostile shot (not a shockwave) that is gone without having hit a wall (a
   * `shot-hit`) and before its time ran out ended on a body (the simulation drops a shot that touches a hero who
   * cannot be hurt just then, with no event): it ends with a small burst where it was.
   */
  simStep() {
    if (this.world.state !== 'play') return
    // A shockwave that died on the step it was born (against a hero who cannot be hurt) was never drawn: it
    // bursts where it would have rolled out, as a shot does.
    for (const slam of this.slams) {
      for (const dir of [-1, 1] as const) {
        const alive = this.world.shots.some(
          (s) => s.kind === 'shock' && !s.dead && Math.sign(s.vx) === dir && Math.abs(s.x - slam.x) < SHOCK_BIRTH_PX
        )
        const hitWall = this.shockHits.some((h) => Math.abs(h.x - slam.x) < SHOCK_BIRTH_PX)
        if (!alive && !hitWall) this.fx.spawn('spark', slam.x + dir * 12, slam.y - 12, { rate: 1.4 })
      }
    }
    this.slams.length = 0
    this.shockHits.length = 0
    for (const shot of this.flying) {
      if (!shot.dead || this.hitShots.has(shot)) continue
      if (shot.life > 0) this.fx.spawn('spark', shot.x + shot.w / 2, shot.y + shot.h / 2, { rate: 1.4 })
    }
    // A squirrel's acorn comes out from behind the squirrel that spat it (the step's `spit`), whatever box it is born
    // in (a charging boar's around it, say).
    for (const spit of this.spits) {
      let best: Shot | null = null
      let near = SPIT_BIRTH_PX
      for (const shot of this.world.shots) {
        if (shot.dead || !shot.hostile || shot.kind === 'shock' || shotSkin(shot) !== 'seed') continue
        if (this.flying.includes(shot) || this.shooters.has(shot)) continue
        const d = Math.hypot(shot.x - spit.x, shot.y - spit.y)
        if (d < near) {
          near = d
          best = shot
        }
      }
      const spitter = this.world.enemies.find((e) => e.id === spit.id && !e.dead) ?? null
      if (best && spitter) this.shooters.set(best, { shooter: spitter, behind: true })
    }
    this.spits.length = 0
    // The boss's shots born on this step are first drawn at his light (plus their own flight since), then join their
    // own paths (`SHOT_JOIN_SECONDS`).
    const light = this.shotLight
    this.shotLight = null
    const boss = this.world.boss
    if (light && boss)
      for (const shot of this.world.shots)
        if (!shot.dead && !this.flying.includes(shot) && !this.shooters.has(shot) && this.bornIn(shot) === boss)
          this.joining.push({ shot, ...light, age: null })
    this.flying.length = 0
    this.hitShots.clear()
    for (const shot of this.world.shots) if (shot.hostile && shot.kind !== 'shock' && !shot.dead) this.flying.push(shot)
  }

  /**
   * The boss's `boss-shoot` of this step: his new shots are drawn `dx`, `dy` off their own place (what his picture
   * was off his body where and when he fired), easing out over `SHOT_JOIN_SECONDS`.
   */
  shotFromLight(dx: number, dy: number) {
    const scale = SHOT_LIGHT_PX / Math.max(SHOT_LIGHT_PX, Math.hypot(dx, dy))
    this.shotLight = { dx: dx * scale, dy: dy * scale }
  }

  /**
   * How far from its own position a shot is drawn now (into `out`): a boss's shot leaves from his light, where it
   * was drawn on his body, and joins its own path within `SHOT_JOIN_SECONDS` of the frame that first shows it,
   * smoothly (no jump); every other shot, 0.
   */
  shotJoin(shot: Shot, out: { x: number; y: number }) {
    out.x = 0
    out.y = 0
    for (const j of this.joining) {
      if (j.shot !== shot) continue
      const u = Math.min(1, (j.age ?? 0) / SHOT_JOIN_SECONDS)
      const k = 1 - u * u * (3 - 2 * u)
      out.x = j.dx * k
      out.y = j.dy * k
    }
    return out
  }

  /** The hostile shots alive after the last step, and those a `shot-hit` ended since (see `simStep`). */
  private flying: Shot[] = []
  /** The slams of this step (their shockwaves are born on it) and the shockwaves a wall stopped on it. */
  private slams: { x: number; y: number }[] = []
  private shockHits: { x: number }[] = []
  private hitShots = new Set<Shot>()

  /**
   * The clip a shockwave is drawn with: `roll` while there is ground (a solid or a one-way platform) within
   * `SHOCK_GROUND_PX` under its middle, `fly` (the crest torn free of the ground) when there is none: the simulation
   * keeps a wave level whatever is under it. Decided by its middle only, so it changes once as it crosses an edge.
   */
  shockClip(shot: Shot): 'roll' | 'fly' {
    const feet = shot.y + shot.h
    const ground = groundBelow(this.world, shot.x + shot.w / 2, feet, 2)
    return ground !== null && ground - feet <= SHOCK_GROUND_PX ? 'roll' : 'fly'
  }

  /** The body a shot was born in (null: none, or the view has not seen the shot yet). */
  shooterOf(shot: Shot): Shooter | null {
    return this.shooters.get(shot)?.shooter ?? null
  }

  /** The live boss (not the king) or squirrel whose box holds the shot's centre, or null (never a shockwave). */
  private bornIn(shot: Shot): Shooter | null {
    if (!shot.hostile || shot.kind === 'shock') return null
    const x = shot.x + shot.w / 2
    const y = shot.y + shot.h / 2
    const boss = this.world.boss
    if (boss && !boss.dead && contains(boss, x, y)) return boss.def.kind === 'final' ? null : boss
    for (const enemy of this.world.enemies)
      if (enemy.kind === 'spitter' && !enemy.dead && contains(enemy, x, y)) return enemy
    return null
  }

  /** The shooter's drawing now (its physics box when the view cannot say), in the scratch box. */
  private shooterExtent(shooter: Shooter): Box {
    const out = this.shooterBox
    const placed = this.placed
    const b = this.drawnFrame?.(shooter, placed) && placed.raster ? opaqueBounds(placed.raster) : null
    if (b) return placeBox(b, placed.anchor, placed.x, placed.y, placed.flip, out)
    out.x = shooter.x
    out.y = shooter.y
    out.w = shooter.w
    out.h = shooter.h
    return out
  }

  /** The pixels a shot can cover now: its box and its sprite (every frame of its spin), in the scratch box. */
  private shotExtent(shot: Shot): Box {
    const out = this.shotBox
    const anim = clip(propSheet(shotSkin(shot)), shotClip(shot))
    const b = anim?.frames ? clipBounds(anim) : null
    if (b) placeBox(b, anchorOf(anim!), shot.x + shot.w / 2, shot.y + shot.h / 2, shot.vx < 0, out)
    else {
      out.x = shot.x
      out.y = shot.y
      out.w = 0
      out.h = 0
    }
    const x1 = Math.max(out.x + out.w, shot.x + shot.w)
    const y1 = Math.max(out.y + out.h, shot.y + shot.h)
    out.x = Math.min(out.x, shot.x)
    out.y = Math.min(out.y, shot.y)
    out.w = x1 - out.x
    out.h = y1 - out.y
    return out
  }

  /**
   * Projectiles, shockwaves and bees, in two passes: `behind` (before the actors: the shots still inside their
   * shooter) and `front` (after them: every other shot, the shockwaves and the bees). Each live shot is drawn in
   * exactly one of the two passes of a frame.
   */
  drawProjectiles(ctx: CanvasRenderingContext2D, layer: 'behind' | 'front') {
    // (Held with the simulation once the stage is over or the hero is down.)
    const time = this.shotTime
    const behind = layer === 'behind'
    for (const shot of this.world.shots) {
      if (shot.dead) continue
      if (this.shotBehind(shot) !== behind) continue
      const flip = shot.vx < 0
      if (shot.kind === 'shock') {
        this.draw(ctx, 'prop:shock', this.shockClip(shot), time, shot.x + shot.w / 2, shot.y + shot.h, brush(flip))
        continue
      }
      const join = this.shotJoin(shot, this.joinScratch)
      const x = shot.x + shot.w / 2 + join.x
      const y = shot.y + shot.h / 2 + join.y
      // A stinger is a dart: drawn along its flight (falling, it points down), at a few fixed angles.
      const angle = shot.skin === 'stinger' ? flightAngle(shot.vx, shot.vy) : 0
      if (angle === 0) {
        this.draw(ctx, propSheet(shotSkin(shot)), shotClip(shot), time, x, y, brush(flip))
        continue
      }
      ctx.translate(x, y)
      ctx.rotate(angle)
      this.draw(ctx, propSheet(shotSkin(shot)), shotClip(shot), time, 0, 0, brush(flip))
      ctx.rotate(-angle)
      ctx.translate(-x, -y)
    }
    if (behind) return
    for (const bee of this.world.bees) this.draw(ctx, 'prop:bee', 'fly', time + bee.t, bee.x, bee.y, brush(bee.vx < 0))
  }
}
