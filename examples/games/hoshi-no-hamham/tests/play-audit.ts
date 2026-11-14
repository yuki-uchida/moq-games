/**
 * The play audit: the simulation runs (the bot through a stage, a boss fight, scripted overlaps of moves, hits,
 * shots and state changes) and the view is driven the way the game drives it: one display frame after another, at
 * 60 Hz or another rate with the positions interpolated between simulation steps, the simulation held during a
 * hit-stop. On every display frame the audit notes what each actor would be drawn with (sheet, clip, frame, facing,
 * where) next to what its body does (where it is, how fast it moves, whether it is on the ground). The checks at the
 * bottom read those rows. They are about a picture and a motion that contradict each other, which no clip shows on
 * its own: a standing pose that slides, a dash that faces away from where it goes, an action that is cut and comes
 * back, a body that lies in the air, a picture that is not where its body is.
 */
import { ENEMY_SPEC, allSheetSpecs, type AnimSpec, type EnemyArt } from '../src/art/contract'
import { anchorOf, frameAt, type Anim } from '../src/art/sheet'
import { Interpolator } from '../src/app/interpolate'
import type { SimEvent } from '../src/game/events'
import { TILE, World, emptyInput, type InputState, type Prop, type Shot } from '../src/game/sim'
import { clip } from '../src/view/bake'
import { newPlaced, paintedAt } from '../src/view/bounds'
import { STAGES } from '../src/game/stages'
import { AIR_SHORT_SECONDS, ActorsView, aloft, groundBelow } from '../src/view/actors'
import {
  BOSS_DEFEAT_GROUND_FRAME,
  ENEMY_DEFEAT_GROUND_FRAME,
  LUNGE_FRAMES,
  aimClear,
  clipLife,
  type ClipChoice
} from '../src/view/clips'
import { playFx, type FxApi } from '../src/view/fx-map'
import type { FxPool } from '../src/view/fx'
import { PropsView, shotClip, shotSkin, type Shooter } from '../src/view/props'
import { RAGE_POSE_MARGIN } from '../src/view/staging'
import { botInput, type BotMemory } from './bot'

export const STEP = 1 / 60
const SPECS = allSheetSpecs()

/** A stand-in Anim with a contract clip's timing and no pixels (the view's frame for a clip time). */
const standIn = (spec: AnimSpec): Anim =>
  ({
    frames: Array.from({ length: spec.frames }, () => ({})),
    fps: spec.fps,
    loop: spec.loop,
    sustain: spec.sustain,
    hold: spec.hold && [...spec.hold]
  }) as unknown as Anim
const standIns = new Map<AnimSpec, Anim>()
export function frameOf(spec: AnimSpec, choice: ClipChoice) {
  if (choice.frame !== undefined) return choice.frame
  let anim = standIns.get(spec)
  if (!anim) standIns.set(spec, (anim = standIn(spec)))
  return frameAt(anim, choice.t)
}

export type ActorKind = 'hero' | 'enemy' | 'boss' | 'ghost' | 'prop'

/** What one actor is drawn with on one display frame, and what its body does. */
export interface Row {
  /** The display frame (rows of one actor on consecutive frames have consecutive numbers). */
  step: number
  /** Display time (s), and the seconds this frame took (the view's clips stand still in a hit-stop: `held`). */
  t: number
  dt: number
  held: boolean
  sheet: string
  clip: string
  frame: number
  /** Where the body is drawn (its centre), where the body is (as the view is given it), and its feet row. */
  x: number
  body: number
  feet: number
  vx: number
  vy: number
  onGround: boolean
  /** Drawn facing left. */
  flip: boolean
  /** The boss's state (null for the others). */
  state: string | null
  /** The simulation's events of this step that concern this actor. */
  events: string[]
  /** The script moved this actor by hand on this step: no motion is read across it. */
  moved: boolean
  /**
   * Bosses: the side the hero is on (`player.x > boss.x`); on a frame a shot leaves, the side that shot really flew
   * to (the simulation aims before it moves the boss, so the two can differ when he stands on top of the hero).
   */
  heroSide: 1 | -1
  /** Enemies and bosses: `player.x - actor.x` (px), the number the simulation aims by. */
  heroDx: number
  /** Ghosts: there is ground exactly under the feet. */
  supported: boolean
  /** The hero: in water (`player.inWater`). */
  water: boolean
  /** Enemies: off the ground with no ground within `ENEMY_AIR_GAP` px under the feet. */
  aloft: boolean
  /** Enemies: the box (but for a pixel at its edges) overlaps a solid tile. */
  inSolid: boolean
}

/** A frame on which a shot born in a shooter is drawn in front of the actors. */
export interface ShotRow {
  step: number
  /** The shooter: a boss's art, or the enemy kind. */
  who: string
  /** Pixels of the shot drawn on top of its shooter's drawing. */
  overlap: number
  /** The first frame it is drawn in front. */
  first: boolean
}

export interface Track {
  who: string
  kind: ActorKind
  /** Enemy kind or boss art. */
  art: string
  /** The boss's cruising speed (px/s); 0 for the others. */
  speed: number
  rows: Row[]
}

const HERO_EVENTS = new Set(['bite', 'hurt', 'dead', 'land', 'jump', 'clear'])
const ENEMY_EVENTS = new Set(['enemy-hit', 'enemy-down', 'spit', 'hop'])
const ofEnemy = (event: SimEvent, id: number) => ENEMY_EVENTS.has(event.type) && (event as { id?: number }).id === id
const BOSS_EVENTS = new Set([
  'boss-hit',
  'boss-shoot',
  'boss-state',
  'boss-phase',
  'boss-down',
  'boss-crash',
  'boss-slam',
  'boss-attack',
  'minion'
])

/** The piglet's clip as the props view would draw it (null while it sleeps or is gone). */
type AnimalChoice = (prop: Prop) => ClipChoice | null

/**
 * Runs a world and records what the view would draw, display frame by display frame, the way `PlaySession.frame`
 * runs it (without a director): the scripts give one input per simulation step; after each step come the display
 * frames that show it (one at 60 Hz, two at 120 Hz with the first half-way, one for every two steps at 30 Hz), the
 * view updated on positions interpolated as `app/interpolate.ts` does; a hit-stop (`freeze` of the effect map)
 * holds the simulation while frames go by with no time for the clips.
 */
export class Recorder {
  readonly view: ActorsView
  readonly props: PropsView
  readonly tracks = new Map<string, Track>()
  /** Display frames recorded, simulation steps run, display time (s). */
  step = 0
  steps = 0
  time = 0
  /** Seconds per display frame. */
  readonly frameDt: number
  private memory: BotMemory
  /** Clips the view asked for that their sheet does not have (the game would draw nothing): "sheet.clip at step n". */
  readonly missing: string[] = []
  /**
   * Shots born in a shooter, drawn in front of the actors: the first such frame of each, and every frame on which
   * any of its pixels lies on its shooter's drawing (see `shotsComeOutFromBehind`).
   */
  readonly shotRows: ShotRow[] = []
  /** Every hostile shot on the first frame it is seen: in whose box it was born (a boss's art, an enemy kind, or
   * 'none') and whether it is drawn behind the actors then. */
  readonly shotBirths: { who: string; behind: boolean }[] = []
  private shotFront = new WeakMap<object, boolean>()
  private shooterPlaced = newPlaced()
  private movedNow = new Set<string>()
  private ghostIds = new WeakMap<object, number>()
  private ghostCount = 0
  private mover = new Interpolator()
  /** Hit-stop left (s), simulation time not yet shown (s), events of steps no frame has shown yet. */
  private freeze = 0
  private owed = 0
  private pending: SimEvent[] = []
  /** The side the boss's latest shot really flew to (the simulation aims before it moves him), until a row has it. */
  private shotSide: 1 | -1 | 0 = 0
  private readonly fx: FxApi

  constructor(
    readonly world: World,
    readonly label: string,
    readonly hz = 60
  ) {
    const pool = { rand: () => 0.5, spawn: () => {}, burst: () => {} } as unknown as FxPool
    this.view = new ActorsView(world, pool)
    this.props = new PropsView(world, pool)
    // As the stage view does: a shot stays behind its shooter while it overlaps his drawing.
    this.props.drawnFrame = (body, out) => this.view.drawnFrame(body, out)
    this.frameDt = 1 / hz
    this.memory = { x: world.player.x, stuck: 0, reverse: 0 }
    // The effects of an event: only the hit-stop matters here.
    this.fx = new Proxy({} as Record<string, unknown>, {
      get: (_, key) =>
        key === 'rand'
          ? () => 0.5
          : key === 'freeze'
            ? (seconds: number) => {
                this.freeze = Math.max(this.freeze, seconds)
              }
            : () => {}
    }) as unknown as FxApi
  }

  /** The script is about to move this actor by hand ('hero', 'boss'). */
  moved(who: string) {
    this.movedNow.add(who)
  }

  private track(who: string, kind: ActorKind, art: string, speed = 0) {
    let track = this.tracks.get(who)
    if (!track) this.tracks.set(who, (track = { who, kind, art, speed, rows: [] }))
    return track
  }

  bot(): InputState {
    return botInput(this.world, this.memory)
  }

  /** One display frame: the view moves on (`anim` seconds for its clips, 0 in a hit-stop) and its rows are written. */
  private show(anim: number) {
    this.view.update(anim)
    this.view.tickReal(this.frameDt)
    this.props.update(anim)
    this.props.tickReal(this.frameDt)
    this.time += this.frameDt
    this.record(this.pending, anim <= 0)
    this.pending = []
  }

  /** One simulation step with `input`, then the display frames that show it. */
  advance(input: InputState) {
    const { world, view, mover } = this
    // A hit-stop holds the simulation: display frames go by until it is over.
    while (this.freeze > 1e-9) {
      this.freeze -= this.frameDt
      this.show(0)
    }
    mover.restore()
    mover.remember(world)
    // Where the boss stands before the step: the simulation aims a shot from there, then moves him.
    const bossBefore = world.boss ? world.boss.x : 0
    world.step(STEP, input)
    this.steps++
    const events = world.events.splice(0)
    // The side his shot flew to, as sim.ts decides it: the hero (already moved this step) against the boss (not yet).
    if (events.some((event) => event.type === 'boss-shoot')) this.shotSide = world.player.x > bossBefore ? 1 : -1
    for (const event of events) {
      view.handle(event)
      this.props.handle(event)
      playFx(event, this.fx)
    }
    this.pending.push(...events)
    mover.settle()
    if (this.freeze > 0) {
      // The frame a hit lands on already stands still: the true positions, no time for the clips.
      this.owed = 0
      this.freeze -= this.frameDt
      this.show(0)
    } else {
      this.owed += STEP
      while (this.owed >= this.frameDt - 1e-9) {
        this.owed -= this.frameDt
        const alpha = 1 - Math.max(0, this.owed) / STEP
        if (alpha < 1 - 1e-9) mover.apply(alpha)
        this.show(this.frameDt)
        mover.restore()
      }
    }
    // The king's transformation is staged: the director poses him and holds the simulation while it plays
    // (view/staging.ts). The audit has no director, so it does the same by hand.
    if (events.some((event) => event.type === 'boss-phase') && world.boss) {
      const seconds = clipLife(SPECS[world.boss.def.art].rage) + RAGE_POSE_MARGIN
      view.pose('boss', 'rage', seconds)
      // (The hero on the ground finishes what he does and stands; the director would also wait for him to land.)
      if (world.player.onGround && !world.player.dead) view.standStill(seconds)
      for (let t = 0; t < seconds - this.frameDt / 2; t += this.frameDt) this.show(0)
      view.unpose()
    }
    this.movedNow.clear()
  }

  /** A row for everything the view would draw now. */
  private record(events: SimEvent[], held: boolean) {
    const { world, view } = this
    this.step++
    const types = (pick: (event: SimEvent) => boolean) => events.filter(pick).map((event) => event.type)
    const p = world.player
    const base = {
      step: this.step,
      t: this.time,
      dt: this.frameDt,
      held,
      state: null,
      heroSide: 1 as 1 | -1,
      heroDx: 0,
      supported: true,
      water: false,
      aloft: false,
      inSolid: false
    }

    const hero = view.selectHero()
    if (hero && !SPECS.hero[hero.name]) this.missing.push(`hero.${hero.name} at step ${this.step}`)
    if (hero && SPECS.hero[hero.name])
      this.track('hero', 'hero', 'hero').rows.push({
        ...base,
        sheet: 'hero',
        clip: hero.name,
        frame: frameOf(SPECS.hero[hero.name], hero),
        x: p.x + p.w / 2,
        body: p.x + p.w / 2,
        feet: p.y + p.h,
        vx: p.vx,
        vy: p.vy,
        onGround: p.onGround,
        water: p.inWater,
        flip: (view as unknown as { heroFlip?: () => boolean }).heroFlip?.() ?? p.facing < 0,
        events: types((event) => HERO_EVENTS.has(event.type)),
        // After his knock-out the view moves the body itself.
        moved: this.movedNow.has('hero') || p.dead || world.state !== 'play'
      })

    if (world.state === 'play') {
      for (const enemy of world.enemies) {
        // (A summoned enemy is drawn only once the simulation has settled it.)
        if (enemy.dead || !view.enemyShown(enemy)) continue
        const choice = view.selectEnemy(enemy)
        if (!ENEMY_SPEC[enemy.kind as EnemyArt][choice.name]) {
          this.missing.push(`${enemy.kind}.${choice.name} at step ${this.step}`)
          continue
        }
        this.track(`enemy#${enemy.id}`, 'enemy', enemy.kind).rows.push({
          ...base,
          sheet: enemy.kind,
          clip: choice.name,
          frame: frameOf(ENEMY_SPEC[enemy.kind as EnemyArt][choice.name], choice),
          x: view.enemyX(enemy),
          body: enemy.x + enemy.w / 2,
          feet: enemy.y + enemy.h,
          vx: enemy.vx,
          vy: enemy.vy,
          onGround: enemy.onGround,
          aloft: !enemy.onGround && aloft(world, enemy),
          inSolid: inSolid(world, enemy),
          flip: view.enemyFlip(enemy),
          heroDx: p.x - enemy.x,
          events: types((event) => ofEnemy(event, enemy.id)),
          moved: false
        })
      }
      const boss = world.boss
      if (boss && !boss.dead) {
        const sheet = view.bossSheet(boss)
        const choice = view.selectBoss(boss)
        const spec = SPECS[sheet]?.[choice.name]
        if (!spec) this.missing.push(`${sheet}.${choice.name} at step ${this.step}`)
        if (spec)
          this.track('boss', 'boss', boss.def.art, boss.def.speed).rows.push({
            ...base,
            sheet,
            clip: choice.name,
            frame: frameOf(spec, choice),
            x: view.bossX(boss),
            body: boss.x + boss.w / 2,
            feet: boss.y + boss.h,
            vx: boss.vx,
            vy: boss.vy,
            onGround: boss.onGround,
            flip: view.bossFlip(boss),
            state: boss.active ? boss.state : null,
            events: types((event) => BOSS_EVENTS.has(event.type)),
            moved: this.movedNow.has('boss'),
            heroDx: p.x - boss.x,
            heroSide:
              events.some((event) => event.type === 'boss-shoot') && this.shotSide !== 0
                ? this.shotSide
                : p.x > boss.x
                  ? 1
                  : -1
          })
        if (events.some((event) => event.type === 'boss-shoot')) this.shotSide = 0
      }
      // The piglet, awake: the props view draws it where its body is.
      const animalChoice = (this.props as unknown as { selectAnimal?: AnimalChoice }).selectAnimal?.bind(this.props)
      if (animalChoice)
        for (const prop of world.props) {
          if (prop.kind !== 'animal') continue
          const choice = animalChoice(prop)
          if (!choice) continue
          const spec = SPECS['prop:animal'][choice.name]
          if (!spec) {
            this.missing.push(`prop:animal.${choice.name} at step ${this.step}`)
            continue
          }
          this.track(`piglet#${prop.id}`, 'prop', 'prop:animal').rows.push({
            ...base,
            sheet: 'prop:animal',
            clip: choice.name,
            frame: frameOf(spec, choice),
            x: prop.x + TILE / 2,
            body: prop.x + TILE / 2,
            feet: prop.y + TILE,
            vx: prop.dir * 300,
            vy: 0,
            // (The simulation lets a piglet that leaves a ledge sink slowly: it is in the air until ground is under it.)
            onGround: (groundBelow(world, prop.x + TILE / 2, prop.y + TILE, 2) ?? Infinity) - (prop.y + TILE) <= 2,
            flip: prop.dir < 0,
            events: [],
            moved: false
          })
        }
      // Shots born in a shooter, once they are drawn in front of the actors.
      for (const shot of world.shots) {
        if (shot.dead) continue
        const born = !this.shotFront.has(shot)
        const behind = this.props.shotBehind(shot)
        const shooter = this.props.shooterOf(shot)
        if (born && shot.hostile && shot.kind !== 'shock') {
          const cx = shot.x + shot.w / 2
          const cy = shot.y + shot.h / 2
          const inside = (b: { x: number; y: number; w: number; h: number }) =>
            cx >= b.x && cx < b.x + b.w && cy >= b.y && cy < b.y + b.h
          const who = shooter
            ? 'def' in shooter
              ? shooter.def.art
              : shooter.kind
            : boss && !boss.dead && inside(boss)
              ? boss.def.art
              : 'none'
          this.shotBirths.push({ who, behind })
        }
        if (!this.shotFront.has(shot)) this.shotFront.set(shot, false)
        if (!shooter || shooter.dead) continue
        if (behind) {
          this.shotFront.set(shot, false)
          continue
        }
        const first = this.shotFront.get(shot) !== true
        this.shotFront.set(shot, true)
        // On its shooter, or on the live boss (a squirrel minion may throw from in front of him).
        const onBoss = boss && boss !== shooter && !boss.dead ? this.shotOverlap(shot, boss) : 0
        const overlap = this.shotOverlap(shot, shooter) + onBoss
        if (first || overlap > 0)
          this.shotRows.push({
            step: this.step,
            who: 'def' in shooter ? shooter.def.art : shooter.kind,
            overlap,
            first
          })
      }
    }
    // Enemies that went down on this step: their events land on the ghost that replaces them.
    const downs = events.filter((event) => event.type === 'enemy-down') as Extract<SimEvent, { type: 'enemy-down' }>[]
    for (const ghost of this.ghosts()) {
      let id = this.ghostIds.get(ghost.key)
      const born = id === undefined
      if (id === undefined) this.ghostIds.set(ghost.key, (id = this.ghostCount++))
      const spec = SPECS[ghost.sheet]?.[ghost.clip]
      if (!spec) continue
      const ground = groundBelow(world, ghost.x, ghost.feet, 2)
      const down = born ? downs.find((event) => event.kind === ghost.sheet) : undefined
      this.track(`ghost#${id}`, 'ghost', ghost.sheet).rows.push({
        ...base,
        sheet: ghost.sheet,
        clip: ghost.clip,
        frame: frameOf(spec, ghost.choice),
        x: ghost.x,
        body: ghost.x,
        feet: ghost.feet,
        vx: 0,
        vy: 0,
        onGround: false,
        flip: false,
        events: down ? types((event) => ofEnemy(event, down.id)) : [],
        moved: false,
        supported: ground !== null && Math.abs(ground - ghost.feet) <= 1
      })
    }
  }

  /** How many pixels of a shot, drawn as the props view draws it now, lie on its shooter's drawing. */
  private shotOverlap(shot: Shot, shooter: Shooter) {
    const body = this.shooterPlaced
    if (!this.view.drawnFrame(shooter, body)) return 0
    const anim = clip(`prop:${shotSkin(shot)}`, shotClip(shot))
    if (!anim) return 0
    const r = anim.frames[frameAt(anim, (this.props as unknown as { time: number }).time)]
    const [ax, ay] = anchorOf(anim)
    const x = Math.round(shot.x + shot.w / 2)
    const y = Math.round(shot.y + shot.h / 2)
    const flip = shot.vx < 0
    let count = 0
    for (let j = 0; j < r.h; j++)
      for (let i = 0; i < r.w; i++) {
        if (!r.get(i, j)) continue
        if (paintedAt(body, flip ? x + ax - i - 1 : x - ax + i, y - ay + j)) count++
      }
    return count
  }

  /** The knocked-out bodies as the view draws them, each with the view's own record of it as its identity. */
  private ghosts() {
    const records = (this.view as unknown as { ghosts: object[] }).ghosts
    return this.view.ghostStates().map((state, i) => ({ ...state, key: records[i] }))
  }

  /** Steps while `go` holds, at most `seconds`, keeping the hero alive. */
  run(seconds: number, go: () => boolean, input: () => InputState = () => this.bot()) {
    for (let n = Math.round(seconds / STEP); n > 0 && go() && this.world.state === 'play'; n--) {
      this.world.player.hp = this.world.player.maxHp
      this.advance(input())
    }
  }
}

// ------------------------------------------------------------------------------------------------- scenarios

export const hold = (keys: Partial<InputState>) => () => ({ ...emptyInput(), ...keys })

/** Chases the boss on foot, bites whenever it is close enough, and jumps a charge (as tests/bosses.test.ts). */
export function fightInput(world: World): InputState {
  const p = world.player
  const boss = world.boss!
  const input = emptyInput()
  const dx = boss.x + boss.w / 2 - (p.x + p.w / 2)
  const bossMid = boss.y + boss.h / 2
  const playerMid = p.y + p.h / 2
  if (Math.abs(dx) > 26) input[dx > 0 ? 'right' : 'left'] = true
  const ahead = Math.floor((p.x + p.w / 2 + Math.sign(dx) * (p.w / 2 + 10)) / TILE)
  const foot = Math.floor((p.y + p.h - 4) / TILE)
  const wall = world.solidAt(ahead, foot) || world.solidAt(ahead, foot - 1)
  const below = boss.y + boss.h > p.y + p.h + 40
  const pit = !below && !world.solidAt(ahead, Math.floor((p.y + p.h + 12) / TILE))
  if ((bossMid < playerMid - 60 || wall || pit) && p.onGround) {
    input.jump = true
    input.jumpPressed = true
  }
  if (Math.abs(dx) < 84 && Math.abs(bossMid - playerMid) < 120) {
    input.bite = true
    input.bitePressed = true
  }
  if (boss.state === 'charge' && Math.abs(dx) < 160 && p.onGround) {
    input.jump = true
    input.jumpPressed = true
  }
  return input
}

/** Whether a body's box, but for a pixel at its edges, overlaps a solid tile. */
function inSolid(world: World, body: { x: number; y: number; w: number; h: number }) {
  for (let ty = Math.floor((body.y + 1) / TILE); ty <= Math.floor((body.y + body.h - 2) / TILE); ty++)
    for (let tx = Math.floor((body.x + 1) / TILE); tx <= Math.floor((body.x + body.w - 2) / TILE); tx++)
      if (world.solidAt(tx, ty)) return true
  return false
}

function openWorld(no: number, seed: number) {
  const world = new World(STAGES[no - 1], { seed })
  world.player.maxHp = 999
  world.player.hp = 999
  for (const prop of world.props) if (prop.kind === 'switch') world.biteProp(prop, 1)
  if (!world.boss)
    for (const prop of [...world.props]) if (prop.kind === 'twig' || prop.kind === 'berry') world.collect(prop)
  return world
}

/** Puts the hero just inside the boss's arena, on the boss's floor. */
function enterArena(r: Recorder) {
  const { world } = r
  if (!world.boss) (world as unknown as { spawnBoss(): void }).spawnBoss()
  const boss = world.boss!
  const p = world.player
  p.x = boss.arenaX + 4
  p.y = boss.y + boss.h - p.h
  p.vx = 0
  p.vy = 0
  r.moved('hero')
}

const atRate = (hz: number) => (hz === 60 ? '' : ` at ${hz} Hz`)

/**
 * The bot through a stage to its boss, then the fight to the boss's fall (or `fightSeconds`), then on to the goal,
 * shown at `hz` display frames a second.
 */
export function playthrough(no: number, seed: number, fightSeconds = 60, hz = 60) {
  const stage = STAGES[no - 1]
  const world = openWorld(no, seed)
  const r = new Recorder(world, `stage ${no}, seed ${seed}: the bot plays${atRate(hz)}`, hz)
  const chase = stage.boss.kind === 'chaser'
  r.run(chase ? 25 : 100, () => chase || !world.boss?.active)
  const boss = world.boss
  if (boss && !chase) {
    r.run(
      fightSeconds,
      () => !boss.dead,
      () => fightInput(world)
    )
    r.run(3, () => true, hold({}))
  }
  r.run(20, () => true)
  return r
}

/**
 * A boss fight under hits at every moment of the boss's cycle: the hero keeps his distance and the boss is hit by
 * hand every `every` seconds (a length no state cycle divides), his health topped up, so the hits land in every
 * state and at every point of every action. With `cross` the hero changes sides during every second wind-up, as a
 * player who jumps over the boss does.
 */
export function hitSweep(
  no: number,
  seed: number,
  options: { seconds?: number; every?: number; cross?: boolean; phase2?: boolean; hz?: number } = {}
) {
  const seconds = options.seconds ?? 45
  const every = options.every ?? 0.83
  const world = openWorld(no, seed)
  const r = new Recorder(
    world,
    `stage ${no}, seed ${seed}: hits every ${every} s${options.cross ? ', crossing sides' : ''}${options.phase2 ? ', phase 2' : ''}${atRate(options.hz ?? 60)}`,
    options.hz ?? 60
  )
  enterArena(r)
  const boss = world.boss!
  const p = world.player
  p.invuln = 99999
  r.run(1, () => true, hold({}))
  if (options.phase2) boss.hp = Math.floor(boss.maxHp / 2) - 1
  let next = every
  let windups = 0
  let crossed = false
  let last = boss.state
  for (let t = 0; t < seconds && !boss.dead; t += STEP) {
    p.invuln = 99999
    if (boss.state !== last) {
      if (boss.state === 'windup') windups++
      crossed = false
      last = boss.state
    }
    if (options.cross && boss.state === 'windup' && windups % 2 === 0 && !crossed && boss.stateTime > 0.12) {
      // To the other side of the boss, the same distance away, on the boss's floor.
      const centre = boss.x + boss.w / 2
      const mine = p.x + p.w / 2
      const target = centre - (mine - centre)
      const gate = world.bossGate
      const min = gate ? (gate.x + 1) * TILE + 4 : 0
      p.x = Math.max(min, Math.min(world.w * TILE - TILE - p.w, target - p.w / 2))
      p.y = boss.y + boss.h - p.h
      p.vy = 0
      r.moved('hero')
      crossed = true
    }
    if (t >= next) {
      next += every
      boss.hp = Math.max(boss.hp, options.phase2 ? 3 : Math.ceil(boss.maxHp / 2) + 2)
      if (options.phase2) boss.hp = Math.min(boss.hp, Math.floor(boss.maxHp / 2) - 1)
      boss.invuln = 0
      world.damageBoss(1)
    }
    // He walks away from a boss that comes too close, and stands otherwise.
    const dx = boss.x + boss.w / 2 - (p.x + p.w / 2)
    const input = emptyInput()
    if (Math.abs(dx) < 150) input[dx > 0 ? 'left' : 'right'] = true
    r.advance(input)
  }
  return r
}

/**
 * A boss fight with his minions. The simulation summons only while fewer than 3 enemies live in the whole stage, so
 * the stage's own enemies are removed; the hero, out of harm, keeps his distance and the boss is hit by hand every
 * 0.83 s (his health topped up), as in `hitSweep`. A minion is knocked out by hand once it has lived 3 s (as a bite
 * would), so that more are summoned.
 */
export function minionFight(
  no: number,
  seed: number,
  options: { seconds?: number; hz?: number; force?: boolean } = {}
) {
  const { seconds = 30, hz = 60, force = false } = options
  const world = openWorld(no, seed)
  for (const enemy of world.enemies) enemy.dead = true
  const r = new Recorder(
    world,
    `stage ${no}, seed ${seed}: the boss and his minions${force ? ' (summoned by hand)' : ''}${atRate(hz)}`,
    hz
  )
  enterArena(r)
  const boss = world.boss!
  const p = world.player
  // The brutes' own summons hardly ever come (sim.ts counts their timer down only on the first steps of an idle):
  // with `force` the simulation's own summon is called every 2.5 s, from wherever he is.
  const summon = () => (world as unknown as { spawnMinion(boss: unknown): void }).spawnMinion(boss)
  let next = 0.83
  let nextSummon = 2.5
  for (let t = 0; t < seconds && !boss.dead; t += STEP) {
    p.invuln = 99999
    p.hp = p.maxHp
    if (force && boss.active && t >= nextSummon) {
      nextSummon += 2.5
      summon()
    }
    if (t >= next) {
      next += 0.83
      boss.hp = Math.max(boss.hp, Math.ceil(boss.maxHp / 2) + 2)
      boss.invuln = 0
      world.damageBoss(1)
    }
    for (const enemy of world.enemies) if (!enemy.dead && enemy.t > 3) enemy.dead = true
    const dx = boss.x + boss.w / 2 - (p.x + p.w / 2)
    const input = emptyInput()
    if (Math.abs(dx) < 150) input[dx > 0 ? 'left' : 'right'] = true
    r.advance(input)
  }
  return r
}

/** A flat stretch of stage 2 the hero can run on: he starts there and the script drives him. */
function heroWorld(seed = 5) {
  const world = openWorld(2, seed)
  for (const enemy of world.enemies) enemy.dead = true
  return world
}

/**
 * The hero's own overlaps: a bite at every phase of the run, a bite in the air that lands, a hard landing at a run,
 * a turn and a skid, and a hit `offset` steps after a bite (negative: before it), on the ground and in the air.
 */
export function heroOverlaps() {
  const runs: Recorder[] = []
  for (let phase = 0; phase < 8; phase++) {
    const r = new Recorder(heroWorld(), `the hero bites at a run (phase ${phase})`)
    r.run(0.6 + phase * 0.03, () => true, hold({ right: true }))
    r.advance({ ...emptyInput(), right: true, bite: true, bitePressed: true })
    r.run(0.6, () => true, hold({ right: true }))
    r.run(0.3, () => true, hold({}))
    runs.push(r)
  }
  {
    const r = new Recorder(heroWorld(), 'the hero drops from a height at a run and lands hard')
    r.run(0.5, () => true, hold({ right: true }))
    r.world.player.y -= 5 * TILE
    r.world.player.vy = 0
    r.moved('hero')
    r.run(1.5, () => true, hold({ right: true }))
    r.run(0.4, () => true, hold({}))
    runs.push(r)
  }
  {
    const r = new Recorder(heroWorld(), 'the hero turns on the spot, runs, reverses and stops')
    r.run(0.3, () => true, hold({}))
    r.run(1 / 60, () => true, hold({ left: true }))
    r.run(0.4, () => true, hold({}))
    r.run(0.8, () => true, hold({ right: true }))
    r.run(0.5, () => true, hold({ left: true }))
    r.run(0.4, () => true, hold({}))
    runs.push(r)
  }
  for (const air of [false, true])
    for (let offset = -6; offset <= 16; offset += 2) {
      const r = new Recorder(heroWorld(), `a hit ${offset} steps after a bite ${air ? 'in the air' : 'on the ground'}`)
      const p = r.world.player
      r.run(0.3, () => true, hold({}))
      if (air) {
        r.advance({ ...emptyInput(), jump: true, jumpPressed: true })
        r.run(0.12, () => true, hold({ jump: true }))
      }
      const hit = () => {
        p.invuln = 0
        r.world.hurtPlayer(1, p.x + p.w / 2 + 30)
      }
      const start = r.steps
      const biteAt = start + Math.max(0, -offset)
      const hitAt = start + Math.max(0, offset)
      for (let n = 0; n < 90; n++) {
        p.hp = p.maxHp
        if (r.steps === hitAt) hit()
        const bite = r.steps === biteAt
        r.advance({ ...emptyInput(), jump: air, bite, bitePressed: bite })
      }
      runs.push(r)
    }
  return runs
}

/**
 * The hero hit from the front and from behind, facing either way, standing and at a run, and pushed the way the
 * spikes push him (towards the side he faces): his `hurt` is a body thrown back, so it must face the blow.
 */
export function heroBlows() {
  const runs: Recorder[] = []
  for (const facing of [1, -1] as const)
    for (const from of ['the front', 'behind', 'spikes'] as const)
      for (const running of [false, true]) {
        const r = new Recorder(
          heroWorld(),
          `the hero facing ${facing > 0 ? 'right' : 'left'}, ${running ? 'running' : 'standing'}, hit from ${from}`
        )
        const p = r.world.player
        const key = facing > 0 ? { right: true } : { left: true }
        r.run(0.05, () => true, hold(key))
        r.run(running ? 0.5 : 0.3, () => true, hold(running ? key : {}))
        p.invuln = 0
        const centre = p.x + p.w / 2
        if (from === 'spikes') r.world.hurtPlayer(1, p.x + (p.facing > 0 ? -40 : 40), 'spike')
        else r.world.hurtPlayer(1, centre + (from === 'the front' ? facing : -facing) * 30)
        for (let n = 0; n < 60; n++) {
          p.hp = p.maxHp
          r.advance(running ? hold(key)() : emptyInput())
        }
        runs.push(r)
      }
  return runs
}

/** The first water cell of a world at its start, by rows from the top (null when it has none). */
function firstWater(world: World) {
  for (let ty = 0; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) if (world.waterAt(tx, ty)) return { tx, ty }
  return null
}

/**
 * The hero through the pool of stage 4 (two tiles wide and two deep, its surface level with the bank): he walks in
 * from the bank, stands on its floor, walks along it, swims up, comes down again, bites on the floor and climbs out.
 * On the floor the simulation walks him as on land: his ground clips show there, and `swim` only off the ground.
 */
export function heroInWater() {
  const world = openWorld(4, 5)
  for (const enemy of world.enemies) enemy.dead = true
  const pool = firstWater(world)
  if (!pool) throw new Error('stage 4 has no water')
  const r = new Recorder(
    world,
    'the hero wades into a pool, walks its floor, swims up, sinks, bites there and climbs out'
  )
  const p = world.player
  p.x = (pool.tx - 3) * TILE + TILE / 2 - p.w / 2
  p.y = pool.ty * TILE - p.h
  p.vx = 0
  p.vy = 0
  p.facing = 1
  p.invuln = 99999
  r.moved('hero')
  const centre = () => p.x + p.w / 2
  r.run(0.3, () => true, hold({}))
  // In from the bank, stopping over the middle of the pool's left column.
  const middle = (pool.tx + 0.5) * TILE
  r.run(
    1.2,
    () => true,
    () => hold(centre() < middle ? { right: true } : {})()
  )
  r.run(1, () => true, hold({}))
  // Along the floor, both ways.
  r.run(0.3, () => true, hold({ right: true }))
  r.run(0.4, () => true, hold({}))
  r.run(0.3, () => true, hold({ left: true }))
  r.run(0.6, () => true, hold({}))
  // Up (holding jump paddles) and back down.
  r.run(0.4, () => true, hold({ jump: true }))
  r.run(1.6, () => true, hold({}))
  // A bite on the floor.
  r.advance({ ...emptyInput(), bite: true, bitePressed: true })
  r.run(0.8, () => true, hold({}))
  // Out to the right.
  r.run(1.5, () => true, hold({ right: true, jump: true }))
  r.run(1, () => true, hold({ right: true }))
  r.run(0.5, () => true, hold({}))
  return r
}

/** A squirrel throwing at the hero standing 200 px away on either side, for eight seconds (three acorns). */
export function squirrelVolleys(hz = 60) {
  const runs: Recorder[] = []
  const stage = STAGES.find((s) => new World(s, { seed: 5 }).enemies.some((e) => e.kind === 'spitter'))
  if (!stage) throw new Error('no stage has a squirrel')
  for (const side of [-1, 1] as const) {
    const world = openWorld(stage.no, 5)
    const squirrel = world.enemies.find((e) => e.kind === 'spitter')!
    for (const enemy of world.enemies) if (enemy !== squirrel) enemy.dead = true
    const r = new Recorder(
      world,
      `a squirrel throws at the hero on its ${side > 0 ? 'right' : 'left'}${atRate(hz)}`,
      hz
    )
    const p = world.player
    p.x = squirrel.x + squirrel.w / 2 + side * 200 - p.w / 2
    p.y = squirrel.y + squirrel.h - p.h
    r.moved('hero')
    for (let n = 0; n < 8 / STEP; n++) {
      p.invuln = 99999
      r.advance(emptyInput())
    }
    runs.push(r)
  }
  return runs
}

/**
 * A squirrel bitten `offset` steps before its acorn leaves (0: on the very step), with a bite that it survives and
 * with one that knocks it out.
 */
export function spitterOverlaps() {
  const runs: Recorder[] = []
  const stage = STAGES.find((s) => new World(s, { seed: 5 }).enemies.some((e) => e.kind === 'spitter'))
  if (!stage) throw new Error('no stage has a squirrel')
  for (const lethal of [false, true])
    for (let offset = 0; offset <= 16; offset++) {
      const world = openWorld(stage.no, 5)
      const squirrel = world.enemies.find((e) => e.kind === 'spitter')!
      for (const enemy of world.enemies) if (enemy !== squirrel) enemy.dead = true
      const r = new Recorder(
        world,
        `a squirrel bitten ${offset} steps before it spits${lethal ? ' (knocked out)' : ''}`
      )
      const p = world.player
      // The hero stands next to it, facing it; it settles for a moment, then its timer is set.
      p.x = squirrel.x - p.w - 2
      p.y = squirrel.y + squirrel.h - p.h
      p.facing = 1
      p.invuln = 99999
      r.moved('hero')
      squirrel.shootTimer = 1.2
      r.run(0.5, () => true, hold({}))
      squirrel.hp = lethal ? 1 : 9
      // The acorn leaves on the step the timer first reads zero or less.
      const stepsLeft = () => Math.ceil(squirrel.shootTimer / STEP - 1e-6)
      r.run(2, () => stepsLeft() > offset + 1, hold({}))
      r.advance({ ...emptyInput(), bite: true, bitePressed: true })
      for (let n = 0; n < 80; n++) {
        p.invuln = 99999
        r.advance(emptyInput())
      }
      runs.push(r)
    }
  return runs
}

/**
 * Every sleeping piglet of a stage woken towards `dir` (one run each): it leaps up, charges, and is stopped by
 * whatever stands in its way, where the simulation keeps it for the rest of its three seconds.
 */
export function pigletCharges(no: number, dir: 1 | -1, hz = 60) {
  const runs: Recorder[] = []
  const count = openWorld(no, 5).props.filter((prop) => prop.kind === 'animal').length
  for (let k = 0; k < count; k++) {
    const world = openWorld(no, 5)
    for (const enemy of world.enemies) enemy.dead = true
    const piglet = world.props.filter((prop) => prop.kind === 'animal')[k]
    const r = new Recorder(
      world,
      `stage ${no}: piglet ${k} woken to the ${dir > 0 ? 'right' : 'left'}${atRate(hz)}`,
      hz
    )
    world.player.invuln = 99999
    r.run(0.2, () => true, hold({}))
    world.biteProp(piglet, dir)
    for (let n = 0; n < 220; n++) {
      world.player.invuln = 99999
      r.advance(emptyInput())
    }
    runs.push(r)
  }
  return runs
}

// ------------------------------------------------------------------------------------------------- checks

export interface Finding {
  rule: string
  run: string
  who: string
  sheet: string
  clip: string
  step: number
  detail: string
}

/**
 * A planted pose may carry its picture this far (px) while the body settles: a boss crouching into a wind-up still
 * has some of his walk in him (the simulation brakes him by 0.7 a step: the transformed king, the fastest, slides
 * 13.6 px), and a picture that was held still up to 6 px from a shaken body eases back to it at the same time.
 */
export const PLANTED_LIMIT = { small: 8, boss: 20 }
/** Faster than this many times his cruising speed, a boss is dashing. */
export const DASH_FACTOR = 1.5
/**
 * A travelling clip faces where its body has gone: more than `FACE_NET` px over the last `FACE_SECONDS`. A
 * walker that steps back for a moment and comes on again (the hero hopped over it), or sets off again from a
 * stand, may take a moment to turn: less than `FACE_WRONG_SECONDS` of it in a stretch passes (turning twice in
 * `FLICKER_SECONDS` would be a flicker, and its picture eases back to its body as it sets off).
 */
export const FACE_SECONDS = 8 * STEP
export const FACE_NET = 6
export const FACE_WRONG_SECONDS = 12 * STEP
/** A dash, a skim or a leap has no such grace: two frames facing away from where it goes are a finding. */
export const DASH_WRONG_SECONDS = 2 * STEP
/** Two turns of the drawn facing closer together than this are a flicker. */
export const FLICKER_SECONDS = 9 * STEP
/**
 * The picture of a body is never further than `DRAWN_OFFSET` px from the body, and from one frame to the next it
 * moves as the body does, to within `DRAWN_STEP` px (`DRAWN_SLEW` px/s at low frame rates): the view may hold a
 * shaken body still and ease it back, it may not leave the body behind or jump to it.
 */
export const DRAWN_OFFSET = 8
export const DRAWN_STEP = 3
export const DRAWN_SLEW = 180
/**
 * A ground cycle shown this long (s) on a body that stays where it is, is a run on the spot. (The view needs 0.15 s
 * to see that a body has stopped and shows its standing pose 0.15 s later; the stride is frozen meanwhile.)
 */
export const ON_THE_SPOT_SECONDS = 0.4

const EPS = 1e-6

const specOf = (row: Row): AnimSpec | undefined => SPECS[row.sheet]?.[row.clip]
/** Drawn to travel at any speed: a ground cycle, a clip off the ground, a slide. */
const travels = (row: Row) => {
  const spec = specOf(row)
  return Boolean(spec && (spec.stride || spec.travel === 'air' || spec.travel === 'slide'))
}
/** Drawn with planted feet (a flier's hover is neither planted nor a dash). */
const planted = (row: Row) => {
  const spec = specOf(row)
  if (!spec || spec.stride || spec.travel) return false
  return !(row.sheet === 'hero' && row.clip === 'bite' && row.frame < LUNGE_FRAMES)
}

function finding(rule: string, r: Recorder, track: Track, row: Row, detail: string): Finding {
  return { rule, run: r.label, who: track.who, sheet: row.sheet, clip: row.clip, step: row.step, detail }
}

/** Whether `b` is the frame after `a` and the body got there by its own motion (not a respawn, not the script's hand). */
const continuous = (a: Row, b: Row) =>
  !b.moved && b.step === a.step + 1 && Math.abs(b.body - a.body) <= Math.max(Math.abs(a.vx), Math.abs(b.vx)) * b.dt + 6

/** The drawn body's speed along the ground from one frame to the next (px/s). */
const moved = (a: Row, b: Row) => (b.x - a.x) / b.dt

/** Maximal stretches of rows drawn with the same clip on consecutive frames. */
function* stretches(rows: Row[]) {
  let from = 0
  for (let i = 1; i <= rows.length; i++) {
    if (
      i < rows.length &&
      rows[i].clip === rows[from].clip &&
      rows[i].sheet === rows[from].sheet &&
      rows[i].step === rows[i - 1].step + 1
    )
      continue
    yield rows.slice(from, i)
    from = i
  }
}

/** I0: the view asks only for clips the sheet it draws from has (a missing clip draws nothing at all). */
export function everyClipExists(r: Recorder): Finding[] {
  return r.missing.slice(0, 5).map((what) => ({
    rule: 'clip is not in its sheet',
    run: r.label,
    who: what.split('.')[0],
    sheet: what.split('.')[0],
    clip: what.split('.')[1].split(' ')[0],
    step: Number(what.split(' ').at(-1)),
    detail: `${what} (${r.missing.length} in all)`
  }))
}

/**
 * I1: a pose drawn with its feet planted is not carried along the ground: over a stretch of it the picture ends up
 * no further than a few px from where the pose began.
 */
export function plantedPosesStay(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind === 'ghost') continue
    const limit = track.kind === 'boss' ? PLANTED_LIMIT.boss : PLANTED_LIMIT.small
    for (const stretch of stretches(track.rows)) {
      let travel = 0
      let top = 0
      let first: Row | null = null
      const flush = () => {
        if (first && travel > limit)
          out.push(
            finding(
              'planted pose travels',
              r,
              track,
              first,
              `carried ${travel.toFixed(0)} px along the ground, at up to ${top.toFixed(0)} px/s`
            )
          )
        travel = 0
        top = 0
        first = null
      }
      for (let i = 1; i < stretch.length; i++) {
        const a = stretch[i - 1]
        const b = stretch[i]
        if (!planted(b) || !planted(a) || !a.onGround || !b.onGround || !continuous(a, b)) {
          flush()
          continue
        }
        first ??= a
        travel = Math.max(travel, Math.abs(b.x - first.x))
        top = Math.max(top, Math.abs(moved(a, b)))
      }
      flush()
    }
  }
  return out
}

/**
 * I1b: a boss that moves at dash speed is drawn with a clip that travels (a dash, a skim, a leap, a slide), not
 * with a standing pose or a flier's hover.
 */
export function dashesAreDrawnAsDashes(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  for (const stretch of stretches(track.rows)) {
    const fast = stretch.filter(
      (row) =>
        row.state !== null && !row.moved && !row.held && Math.abs(row.vx) > DASH_FACTOR * track.speed && !travels(row)
    )
    // A single step is the simulation changing its mind (a crash into a wall); longer is seen.
    if (fast.length && fast[fast.length - 1].t - fast[0].t >= STEP - EPS)
      out.push(
        finding(
          'dash speed in a pose that does not travel',
          r,
          track,
          fast[0],
          `${fast.length} frames, up to ${Math.max(...fast.map((row) => Math.abs(row.vx))).toFixed(0)} px/s (state ${fast[0].state})`
        )
      )
  }
  return out
}

/**
 * How closely `cyclesFollowTheGround` holds a cycle to the ground. The view plays a cycle exactly by distance; the
 * two frames are the counting's own noise (a stretch starts and ends part-way through a frame, and at 30 Hz a
 * display frame spans two steps), and the 1 % lets a long walk's held-and-eased picture (`Tread`) through.
 */
export const CYCLE_CHECK = {
  /** Pieces shorter than this many steps are not checked. */
  minSteps: 5,
  /** The frames shown may differ from the ground covered by this many frames plus this share of them. */
  frames: 2,
  slack: 0.01,
  /** Split a stretch where the body jumps and check each piece (else a jump would exempt the whole stretch). */
  split: true
}

/** The pieces of a stretch between the frames where the body did not get there by its own motion. */
function pieces(rows: Row[]): Row[][] {
  const out: Row[][] = []
  let from = 0
  for (let i = 1; i <= rows.length; i++)
    if (i === rows.length || !continuous(rows[i - 1], rows[i])) {
      out.push(rows.slice(from, i))
      from = i
    }
  return out
}

/**
 * I2: a ground cycle advances with the ground covered: over a stretch of it, the frames shown match the distance
 * the picture travelled the way it faces, at stride/frames px a frame (so a planted foot stays put at any speed).
 */
export function cyclesFollowTheGround(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind === 'ghost') continue
    for (const whole of stretches(track.rows)) {
      const spec = specOf(whole[0])
      if (!spec?.stride) continue
      const per = spec.stride / spec.frames
      // A jump in the body (a respawn, the script's hand) ends a piece: each piece is checked on its own.
      for (const stretch of CYCLE_CHECK.split ? pieces(whole) : [whole]) {
        if (stretch[stretch.length - 1].t - stretch[0].t < CYCLE_CHECK.minSteps * STEP - EPS) continue
        let distance = 0
        let frames = 0
        let ok = true
        for (let i = 1; i < stretch.length; i++) {
          const a = stretch[i - 1]
          const b = stretch[i]
          if (!continuous(a, b)) {
            ok = false
            break
          }
          // In the air the legs may go as they like (ハム代 hops with hers still running).
          if (!a.onGround || !b.onGround) continue
          distance += Math.max(0, (b.x - a.x) * (b.flip ? -1 : 1))
          frames += (b.frame - a.frame + spec.frames) % spec.frames
        }
        if (!ok) continue
        const expected = distance / per
        if (Math.abs(frames - expected) > CYCLE_CHECK.frames + expected * CYCLE_CHECK.slack)
          out.push(
            finding(
              'cycle does not follow the ground',
              r,
              track,
              stretch[0],
              `${frames} frames over ${distance.toFixed(0)} px (${expected.toFixed(1)} expected at ${per} px a frame)`
            )
          )
      }
    }
  }
  return out
}

/**
 * I2b: a ground cycle is not shown on a body that stays where it is: a run on the spot, a gallop frozen in
 * mid-stride against a wall.
 */
export function cyclesNeedGround(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind === 'ghost') continue
    for (const stretch of stretches(track.rows)) {
      if (!specOf(stretch[0])?.stride) continue
      let anchor = stretch[0]
      let still = 0
      let worst = 0
      let first: Row | null = null
      for (let i = 1; i < stretch.length; i++) {
        const b = stretch[i]
        if (!b.onGround || !continuous(stretch[i - 1], b) || Math.abs(b.x - anchor.x) > 2) {
          anchor = b
          still = 0
          continue
        }
        if (!b.held) still += b.dt
        if (still >= ON_THE_SPOT_SECONDS - EPS && still > worst) {
          worst = still
          first ??= anchor
        }
      }
      if (first)
        out.push(finding('ground cycle on a body at rest', r, track, first, `${worst.toFixed(2)} s without moving`))
    }
  }
  return out
}

/** I3: a clip that travels along the ground (a walk, a run, a charge, a dash, a leap) faces where it goes. */
export function travelFacesItsWay(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind === 'ghost') continue
    for (const stretch of stretches(track.rows)) {
      const spec = specOf(stretch[0])
      if (!spec) continue
      const clip = stretch[0].clip
      // (A leap is a dash while it is his attack; the same clip on a boss that merely falls need not face its drift.)
      const dash =
        track.kind === 'boss' &&
        (clip === 'attack' || clip === 'sweep' || (clip === 'air' && stretch[0].state === 'slam'))
      if (!spec.stride && !dash) continue
      // Net motion over a moment: a body the simulation shakes on the spot goes nowhere, and a turn at a wall may
      // lag the body by a step or two.
      let first: Row | null = null
      let speed = 0
      let wrong = 0
      let from = 0
      for (let i = 1; i < stretch.length; i++) {
        if (!continuous(stretch[i - 1], stretch[i])) {
          from = i
          continue
        }
        const b = stretch[i]
        let j = i
        while (j > from && b.t - stretch[j].t < FACE_SECONDS - EPS) j--
        if (b.t - stretch[j].t < FACE_SECONDS - EPS) continue
        const net = b.x - stretch[j].x
        if (Math.abs(net) > FACE_NET && b.flip !== net < 0) {
          if (!first) {
            first = b
            speed = net / (b.t - stretch[j].t)
          }
          wrong += b.dt
        }
      }
      if (first && wrong >= (dash ? DASH_WRONG_SECONDS : FACE_WRONG_SECONDS) - EPS)
        out.push(
          finding(
            'travels backwards',
            r,
            track,
            first,
            `${wrong.toFixed(2)} s facing ${first.flip ? 'left' : 'right'} while moving at ${speed.toFixed(0)} px/s`
          )
        )
    }
  }
  return out
}

/** I7: a shot leaves from the frame that releases it, towards the side the shooter faces. */
export function shotsLeaveFromTheirPose(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    for (const row of track.rows) {
      if (track.kind === 'boss' && row.events.includes('boss-shoot')) {
        const dashing = row.clip === 'attack' || row.clip === 'sweep' || row.clip === 'air'
        if (!dashing && row.flip !== row.heroSide < 0)
          out.push(
            finding(
              'shot leaves behind the shooter',
              r,
              track,
              row,
              `drawn facing ${row.flip ? 'left' : 'right'}, the shot goes ${row.heroSide < 0 ? 'left' : 'right'}`
            )
          )
        const hit = specOf(row)?.hit
        if (row.clip === 'shoot' && hit !== undefined && row.frame !== hit)
          out.push(
            finding(
              'shot leaves off its release frame',
              r,
              track,
              row,
              `frame ${row.frame}, the release is frame ${hit}`
            )
          )
      }
      if (row.events.includes('spit')) {
        const hit = ENEMY_SPEC.spitter.shoot.hit!
        if (row.clip !== 'shoot' || row.frame !== hit)
          out.push(
            finding(
              'acorn leaves off its release frame',
              r,
              track,
              row,
              `${row.clip} frame ${row.frame} on the step of the spit${row.events.includes('enemy-down') ? ' (knocked out on the same step)' : row.events.includes('enemy-hit') ? ' (bitten on the same step)' : ''}`
            )
          )
      }
    }
  }
  return out
}

/**
 * I7b: a shot comes out from behind its shooter. A shot born in a shooter (sim.ts spawns it at his centre) does not
 * come in front of the actors while a pixel of it lies on its shooter's drawing: on the frame it comes in front it
 * is clear of him. (Once in front it stays there: a shooter whose next frame reaches further, or who overtakes his
 * own shot in a dash, can be drawn under it later. The king's volley is born in nobody: it bursts out of his chest
 * in front of him.)
 */
export function shotsComeOutFromBehind(r: Recorder): Finding[] {
  const rows = r.shotRows.filter((row) => row.first && row.overlap > 0)
  if (!rows.length) return []
  const first = rows[0]
  return [
    {
      rule: 'shot drawn on top of its shooter',
      run: r.label,
      who: first.who,
      sheet: first.who,
      clip: 'shot',
      step: first.step,
      detail: `${first.overlap} px on him${first.first ? ' on the frame it comes in front' : ''} (${rows.length} frames in all)`
    }
  ]
}

/** Clips that are one action from start to end, by who plays them. */
const ACTIONS: Record<'hero' | 'enemy' | 'boss', readonly string[]> = {
  hero: ['bite', 'hurt', 'land', 'turn', 'wait'],
  enemy: ['hurt', 'shoot', 'land'],
  boss: ['hurt', 'shoot', 'land', 'rage']
}

/** The runs of an action clip in a track: a new one begins when the clip comes up, or its frame goes back to 0. */
function* actionRuns(track: Track) {
  if (track.kind !== 'hero' && track.kind !== 'enemy' && track.kind !== 'boss') return
  const actions = ACTIONS[track.kind]
  for (const stretch of stretches(track.rows)) {
    if (!actions.includes(stretch[0].clip)) continue
    let from = 0
    for (let i = 1; i <= stretch.length; i++) {
      // The squirrel pulses between two frames while it waits for the hero to come into range.
      const restart = i < stretch.length && stretch[i].frame === 0 && stretch[i - 1].frame > 0
      if (i < stretch.length && !restart) continue
      const rows = stretch.slice(from, i)
      const index = track.rows.indexOf(rows[0])
      yield { rows, before: track.rows[index - 1], after: track.rows[index + rows.length] }
      from = i
    }
  }
}

/**
 * I4: an action starts on its first frame. A later frame without the frames before it is an action that was cut
 * and has come back (a bite after the hurt that interrupted it), or one that could not start when its cause came.
 */
export function actionsStartAtTheirStart(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values())
    for (const { rows, before } of actionRuns(track)) {
      const first = rows[0]
      if (first.frame === 0 || !before) continue
      // A summon is the cast from its release on (the contract says so).
      if (track.kind === 'boss' && first.clip === 'shoot' && first.events.includes('minion')) continue
      out.push(
        finding(
          'action starts in its middle',
          r,
          track,
          first,
          `frame ${first.frame} after ${before.clip} frame ${before.frame}`
        )
      )
    }
  return out
}

/**
 * What may cut an action of an enemy or a boss short: a hit, the transformation, a stun (the track ends on a fall),
 * and the ground giving way under him (a slam landing that slides off a ledge falls).
 */
const MAY_CUT = ['hurt', 'rage', 'stunned', 'air']

/**
 * I5: an enemy's or a boss's action plays to its last frame. (The hero's are cut by the player's next input, which
 * is his to give.) A state of the simulation changing under it is not a reason: the view starts an action only
 * when it fits.
 */
export function actionsPlayOut(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' && track.kind !== 'enemy') continue
    for (const { rows, after } of actionRuns(track)) {
      const spec = specOf(rows[0])
      if (!spec || !after) continue
      const last = Math.max(...rows.map((row) => row.frame))
      if (last >= spec.frames - 1) continue
      // The same action again from its start is a new cause (a second hit).
      if (after.clip === rows[0].clip && after.frame === 0) continue
      if (MAY_CUT.includes(after.clip)) continue
      out.push(
        finding(
          'action is cut short',
          r,
          track,
          rows[rows.length - 1],
          `frame ${last} of ${spec.frames - 1}, then ${after.clip} frame ${after.frame}${after.state ? ` (state ${after.state})` : ''}`
        )
      )
    }
  }
  return out
}

/** I6: a knocked-out body lies only on ground, and lies still. */
export function bodiesLieOnTheGround(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'ghost') continue
    const lying = (row: Row) => {
      if (row.clip !== 'defeat') return false
      const from =
        (ENEMY_DEFEAT_GROUND_FRAME as Record<string, number>)[row.sheet] ??
        (BOSS_DEFEAT_GROUND_FRAME as Record<string, number>)[row.sheet]
      return from !== undefined && row.frame >= from
    }
    const floating = track.rows.find((row) => lying(row) && !row.supported)
    if (floating)
      out.push(
        finding(
          'body lies in the air',
          r,
          track,
          floating,
          `frame ${floating.frame} at feet row ${floating.feet.toFixed(0)}, x ${floating.x.toFixed(0)}`
        )
      )
    for (let i = 1; i < track.rows.length; i++) {
      const a = track.rows[i - 1]
      const b = track.rows[i]
      if (lying(a) && lying(b) && (Math.abs(b.x - a.x) > 0.01 || Math.abs(b.feet - a.feet) > 0.01)) {
        out.push(
          finding(
            'lying body moves',
            r,
            track,
            b,
            `${(b.x - a.x).toFixed(1)} px, ${(b.feet - a.feet).toFixed(1)} px down`
          )
        )
        break
      }
    }
  }
  return out
}

/**
 * I8: an enemy or a boss does not flicker between left and right. (The simulation turns a walker round on every
 * step while a wall or a ledge stands between it and the hero; the view must not draw that.)
 */
export function facingDoesNotFlicker(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' && track.kind !== 'boss') continue
    let last = -Infinity
    let count = 0
    let first: Row | null = null
    for (let i = 1; i < track.rows.length; i++) {
      const a = track.rows[i - 1]
      const b = track.rows[i]
      if (b.step !== a.step + 1 || a.flip === b.flip) continue
      if (b.t - last < FLICKER_SECONDS - EPS) {
        count++
        first ??= b
      }
      last = b.t
    }
    if (first)
      out.push(
        finding(
          'facing flickers',
          r,
          track,
          first,
          `${count} turns within ${FLICKER_SECONDS.toFixed(2)} s of the turn before`
        )
      )
  }
  return out
}

/**
 * I9: the picture is where the body is. The view may hold a body the simulation shakes on the spot still (within
 * `DRAWN_OFFSET`), but it never leaves a body that walks on behind, and it never jumps: from one frame to the next
 * the picture moves as the body does, to within `DRAWN_STEP` px.
 */
export function pictureStaysWithTheBody(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' && track.kind !== 'boss') continue
    let far: Row | null = null
    let offset = 0
    let jump: Row | null = null
    let by = 0
    for (let i = 0; i < track.rows.length; i++) {
      const row = track.rows[i]
      const away = Math.abs(row.x - row.body)
      if (away > DRAWN_OFFSET + EPS && away > offset) {
        offset = away
        far = row
      }
      if (i === 0 || !continuous(track.rows[i - 1], row)) continue
      const a = track.rows[i - 1]
      const slip = Math.abs(row.x - a.x - (row.body - a.body))
      if (slip > Math.max(DRAWN_STEP, DRAWN_SLEW * row.dt) + EPS && slip > by) {
        by = slip
        jump = row
      }
    }
    if (far) out.push(finding('picture is away from its body', r, track, far, `${offset.toFixed(1)} px away`))
    if (jump)
      out.push(finding('picture jumps', r, track, jump, `${by.toFixed(1)} px more than the body moved in one frame`))
  }
  return out
}

/** A pose that stands on the ground may show this long (s) on a body in the air (a bite knocks an enemy up for less). */
export const AIRBORNE_SECONDS = 0.25
/** A body settles where the stage put it for this long (s) before the audit holds it to the ground. */
export const SETTLE_SECONDS = 0.5

/**
 * I11: a body in the air is not drawn standing on the ground. A pose with planted feet (an `idle`, a `recover`,
 * the piglet's `daze`) does not show for more than `AIRBORNE_SECONDS` on a body that has no ground under it. A
 * ground cycle may (legs that keep going through a hop), except on the piglet, which the simulation lets sink
 * slowly off a ledge for seconds: it has a leap for that.
 */
export function groundPosesNeedGround(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind === 'ghost') continue
    const start = track.rows[0]?.t ?? 0
    for (const stretch of stretches(track.rows)) {
      const spec = specOf(stretch[0])
      if (!spec) continue
      // A boss's slam landing is drawn sliding (`travel: 'slide'`) but with his feet on the ground: a few frames at most.
      const landing = track.kind === 'boss' && stretch[0].clip === 'land'
      const grounded = landing || planted(stretch[0]) || (track.kind === 'prop' && Boolean(spec.stride))
      if (!grounded) continue
      const limit = landing ? GROUNDED_SECONDS : AIRBORNE_SECONDS
      let air = 0
      let worst = 0
      let first: Row | null = null
      let from: Row | null = null
      for (const row of stretch) {
        // An inactive boss waits where the stage put him; a lunge frame of the bite is thrown off the feet.
        const counts =
          !row.onGround &&
          row.t - start > SETTLE_SECONDS &&
          !(track.kind === 'boss' && row.state === null) &&
          planted(row) === planted(stretch[0])
        if (!counts) {
          air = 0
          from = null
          continue
        }
        from ??= row
        if (!row.held) air += row.dt
        if (air > limit + EPS && air > worst) {
          worst = air
          first ??= from
        }
      }
      if (first)
        out.push(finding('ground pose on a body in the air', r, track, first, `${worst.toFixed(2)} s in the air`))
    }
  }
  return out
}

/** A boss's clips timed from the start of the state they show in. */
const STATE_TIMED_CLIPS: readonly string[] = ['windup', 'recover', 'stunned', 'land', 'tired']

/**
 * I4b: a boss's clip timed from his state's start (a wind-up, a recovery, a stun, a landing) that takes over from
 * another clip inside one state (after a landing, a follow-through, a dash, a flinch, a fall) begins on its first
 * frame.
 */
export function takeOversStartAtTheirStart(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  for (let i = 1; i < track.rows.length; i++) {
    const a = track.rows[i - 1]
    const b = track.rows[i]
    if (b.step !== a.step + 1 || b.state === null || b.state !== a.state || b.clip === a.clip) continue
    if (!STATE_TIMED_CLIPS.includes(b.clip) || b.frame === 0) continue
    const detail = `frame ${b.frame} after ${a.clip} frame ${a.frame} (state ${b.state})`
    out.push(finding('clip takes over in its middle', r, track, b, detail))
  }
  return out
}

/**
 * I4c: a boss's leap comes down into its landing. The display frame after the last one of his slam's `air` on which
 * he is on the ground shows the first frame of `land` (the simulation keeps him in `slam` for the step he touches
 * down: nothing else, a stand least of all, is drawn in between).
 */
export function leapsLandOnTheirLanding(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  for (let i = 1; i < track.rows.length; i++) {
    const a = track.rows[i - 1]
    const b = track.rows[i]
    if (a.clip !== 'air' || a.state !== 'slam' || a.onGround || !b.onGround || b.state === null) continue
    if (b.step - a.step > 1 || !continuous(a, b) || !specOf({ ...b, clip: 'land' })) continue
    if (b.clip === 'land' && b.frame === 0) continue
    out.push(finding('leap does not land on its landing', r, track, b, `${b.clip} frame ${b.frame} on touchdown`))
  }
  return out
}

/** The first frames of a body the view draws, over which it must not jump. */
export const FIRST_FRAMES = 6
/** A body may move this far (px) beyond what its speed carries it between two frames and still not be jumping. */
export const STEP_SLACK = 4

/**
 * I11d: a rat or a mole in the air turns round at most once in a fall, and only towards where its body has gone
 * since the fall began (the simulation flips its speed on every step while it is over the hero or against a wall).
 */
export function airTurnsFollowTheBody(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' || (track.art !== 'walker' && track.art !== 'tough')) continue
    for (const stretch of stretches(track.rows)) {
      if (stretch[0].clip !== 'air') continue
      let turns = 0
      let min = stretch[0].body
      let max = stretch[0].body
      for (let i = 1; i < stretch.length; i++) {
        const a = stretch[i - 1]
        const b = stretch[i]
        min = Math.min(min, b.body)
        max = Math.max(max, b.body)
        if (a.flip === b.flip) continue
        turns++
        // How far its body has come back the new way from the furthest point it reached the other way.
        const gone = b.flip ? max - b.body : b.body - min
        if (turns > 1 || gone < 1) {
          const detail = `turn ${turns} of the fall, its body ${gone.toFixed(1)} px back the way it turns to`
          out.push(finding('turns in the air', r, track, b, detail))
          break
        }
      }
    }
  }
  return out
}

/**
 * I14b: a live enemy that was drawn is drawn on every later frame until it is knocked out (or the stage ends): it
 * never blinks out.
 */
export function enemiesDoNotBlink(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy') continue
    for (let i = 1; i < track.rows.length; i++) {
      const a = track.rows[i - 1]
      const b = track.rows[i]
      if (b.step === a.step + 1) continue
      out.push(finding('blinks out', r, track, b, `not drawn for ${b.step - a.step - 1} frames while alive`))
      break
    }
  }
  return out
}

/**
 * I14: a body appears where it is. An enemy that appears during the run (a summoned minion) is not drawn inside a
 * solid tile over its first frames (one summoned into the raised gate or a rock is pushed out by the simulation's
 * next step: the view waits for that), and over them its picture moves no further than its own speed carries it.
 * (An enemy there from the start is drawn wherever the simulation has it: see `enemiesDoNotBlink`.)
 */
export function bodiesAppearInPlace(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' || track.rows[0].step <= 1) continue
    const rows = track.rows
    const solid = rows.slice(0, FIRST_FRAMES).find((row) => row.inSolid)
    if (solid)
      out.push(
        finding('drawn inside a solid', r, track, solid, `x ${solid.x.toFixed(0)}, feet ${solid.feet.toFixed(0)}`)
      )
    for (let i = 1; i < Math.min(FIRST_FRAMES, rows.length); i++) {
      const a = rows[i - 1]
      const b = rows[i]
      if (b.step !== a.step + 1 || b.moved) continue
      // (A frame may show a whole step at once: the frame a hit-stop begins shows the true positions.)
      const dt = Math.max(b.dt, STEP)
      const dx = Math.abs(b.x - a.x) - Math.max(Math.abs(a.vx), Math.abs(b.vx)) * dt
      const dy = Math.abs(b.feet - a.feet) - Math.max(Math.abs(a.vy), Math.abs(b.vy)) * dt
      if (dx > STEP_SLACK || dy > STEP_SLACK) {
        out.push(
          finding(
            'appears and jumps',
            r,
            track,
            b,
            `frame ${i} of its life: ${(b.x - a.x).toFixed(0)} px across, ${(b.feet - a.feet).toFixed(0)} px down`
          )
        )
        break
      }
    }
  }
  return out
}

/** A pose drawn in the air may show this long (s) on a body that stands on the ground. */
export const GROUNDED_SECONDS = 0.1

/** The clips drawn in the air (or in water, off the ground): the hero's, the frog's and the bosses' leaps. */
const HERO_AIR_CLIPS: readonly string[] = ['jump', 'apex', 'fall', 'swim']
const airPose = (track: Track, row: Row) =>
  track.kind === 'hero'
    ? HERO_AIR_CLIPS.includes(row.clip)
    : row.clip === 'air' && (track.kind === 'boss' || (track.kind === 'enemy' && ENEMY_AIR_SHEETS.includes(row.sheet)))
/** The enemies with an `air` clip: the frog, the rat and the mole. */
const ENEMY_AIR_SHEETS: readonly string[] = ['jumper', 'walker', 'tough']

/**
 * A rat or a mole in the air may be drawn walking or standing this long (s): a fall on to ground close under it that
 * lasts no longer than `AIR_SHORT_SECONDS` is not drawn as a fall (and a step of rounding).
 */
export const WALK_ON_AIR_SECONDS = AIR_SHORT_SECONDS + STEP

/**
 * I11c: a rat or a mole does not walk on air. Off the ground with no ground within a few px under its feet (it fell
 * off a ledge, was summoned in the air, had the ground dug away), it is not drawn in `move` or `idle` for more than
 * `WALK_ON_AIR_SECONDS`.
 */
export function walkersDoNotWalkOnAir(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' || (track.art !== 'walker' && track.art !== 'tough')) continue
    for (const stretch of stretches(track.rows)) {
      if (stretch[0].clip !== 'move' && stretch[0].clip !== 'idle') continue
      let air = 0
      let worst = 0
      let first: Row | null = null
      let from: Row | null = null
      for (const row of stretch) {
        if (!row.aloft) {
          air = 0
          from = null
          continue
        }
        from ??= row
        if (!row.held) air += row.dt
        if (air > WALK_ON_AIR_SECONDS + EPS && air > worst) {
          worst = air
          first ??= from
        }
      }
      if (first) out.push(finding('walks on air', r, track, first, `${worst.toFixed(2)} s with no ground under it`))
    }
  }
  return out
}

/**
 * I11b: a body that stands on the ground is not drawn in the air. The hero's `jump`, `apex`, `fall` and `swim`, the
 * frog's `air` and a boss's `air` do not show for more than `GROUNDED_SECONDS` while the simulation has the body on
 * the ground (the hero on the floor of a pool walks and stands there as on land).
 */
export function airPosesNeedAir(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'hero' && track.kind !== 'enemy' && track.kind !== 'boss') continue
    for (const stretch of stretches(track.rows)) {
      if (!airPose(track, stretch[0])) continue
      let ground = 0
      let worst = 0
      let first: Row | null = null
      let from: Row | null = null
      for (const row of stretch) {
        if (!row.onGround || row.moved) {
          ground = 0
          from = null
          continue
        }
        from ??= row
        if (!row.held) ground += row.dt
        if (ground > GROUNDED_SECONDS + EPS && ground > worst) {
          worst = ground
          first ??= from
        }
      }
      if (first)
        out.push(
          finding(
            'air pose on a body on the ground',
            r,
            track,
            first,
            `${worst.toFixed(2)} s on the ground${first.water ? ' (in water)' : ''}`
          )
        )
    }
  }
  return out
}

/**
 * A cast is held to its aim only when the hero is clearly on one side (px, as the simulation measures it): further
 * over than one step of the shooter's own travel and a margin (`aimClear`; a squirrel stands, a boss walks).
 */
export const AIM_CLEAR = aimClear

/**
 * I12: an action does not turn round. While an enemy's or a boss's action plays (a flinch, a throw, a landing) the
 * picture keeps its facing; the one exception is a throw or a cast on the very frame its shot leaves, when the hero
 * has changed sides since it began. And a throw or a cast begins facing where the simulation aims: the hero's side.
 */
export function actionsKeepTheirFacing(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' && track.kind !== 'enemy') continue
    for (const { rows } of actionRuns(track)) {
      const first = rows[0]
      if (first.clip === 'shoot' && first.frame === 0 && Math.abs(first.heroDx) > AIM_CLEAR(track.speed)) {
        if (first.flip !== first.heroDx < 0)
          out.push(
            finding(
              'cast begins facing away from its aim',
              r,
              track,
              first,
              `drawn facing ${first.flip ? 'left' : 'right'}, the hero is ${Math.abs(first.heroDx).toFixed(0)} px to the ${first.heroDx < 0 ? 'left' : 'right'}`
            )
          )
      }
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].flip === rows[i - 1].flip) continue
        const leaves = rows[i].events.includes('boss-shoot') || rows[i].events.includes('spit')
        if (rows[i].clip === 'shoot' && leaves) continue
        out.push(
          finding(
            'action turns round',
            r,
            track,
            rows[i],
            `frame ${rows[i].frame} turns to face ${rows[i].flip ? 'left' : 'right'}`
          )
        )
        break
      }
    }
  }
  return out
}

/**
 * I13: the hero's `hurt` is a body thrown back: it faces the blow, so whichever way the knock carries him he is
 * drawn travelling backwards, never leaning back while he slides forwards.
 */
export function hurtFacesTheBlow(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('hero')
  if (!track) return out
  for (const stretch of stretches(track.rows)) {
    if (stretch[0].clip !== 'hurt') continue
    // Only what the blow itself carries him: a frame on which the simulation puts him somewhere else (a respawn,
    // being pushed out of a wall) is not his travel.
    let net = 0
    let last: Row | null = null
    for (let i = 1; i < stretch.length; i++) {
      if (!continuous(stretch[i - 1], stretch[i])) continue
      net += stretch[i].x - stretch[i - 1].x
      last = stretch[i]
    }
    if (!last) continue
    if (Math.abs(net) > FACE_NET && last.flip !== net > 0)
      out.push(
        finding(
          'hurt is carried forwards',
          r,
          track,
          stretch[0],
          `drawn facing ${last.flip ? 'left' : 'right'} while the blow carries him ${Math.abs(net).toFixed(0)} px to the ${net > 0 ? 'right' : 'left'}`
        )
      )
  }
  return out
}

export const CHECKS = [
  everyClipExists,
  plantedPosesStay,
  dashesAreDrawnAsDashes,
  cyclesFollowTheGround,
  cyclesNeedGround,
  travelFacesItsWay,
  shotsLeaveFromTheirPose,
  shotsComeOutFromBehind,
  actionsStartAtTheirStart,
  actionsPlayOut,
  bodiesLieOnTheGround,
  facingDoesNotFlicker,
  pictureStaysWithTheBody,
  groundPosesNeedGround,
  airPosesNeedAir,
  walkersDoNotWalkOnAir,
  bodiesAppearInPlace,
  enemiesDoNotBlink,
  airTurnsFollowTheBody,
  takeOversStartAtTheirStart,
  leapsLandOnTheirLanding,
  actionsKeepTheirFacing,
  hurtFacesTheBlow
] as const

export const audit = (r: Recorder): Finding[] => CHECKS.flatMap((check) => check(r))

/** Findings by rule, sheet and clip with a count and the first case of each (for a readable failure). */
export function summarise(findings: Finding[]) {
  const groups = new Map<string, { count: number; first: Finding }>()
  for (const f of findings) {
    const key = `${f.rule} | ${f.sheet}.${f.clip}`
    const group = groups.get(key)
    if (group) group.count++
    else groups.set(key, { count: 1, first: f })
  }
  return [...groups.entries()].map(
    ([key, { count, first }]) => `${key} ×${count} — ${first.detail} [${first.run}, ${first.who}, step ${first.step}]`
  )
}
