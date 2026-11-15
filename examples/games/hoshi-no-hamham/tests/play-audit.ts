/**
 * The play audit: the simulation runs (the bot through a stage, a boss fight, scripted overlaps of moves, hits,
 * shots and state changes) and the view is driven the way the game drives it: one display frame after another, at
 * 60 Hz or another rate with the positions interpolated between simulation steps, the simulation held during a
 * hit-stop. On every display frame the audit notes what each actor would be drawn with (sheet, clip, frame, facing,
 * where) next to what its body does (where it is, how fast it moves, whether it is on the ground). The checks at the
 * bottom read those rows. They are about a picture and a motion that contradict each other, which no clip shows on
 * its own: a standing pose that slides, a dash that faces away from where it goes, an action that is cut and comes
 * back, a body that lies in the air, a picture that is not where its body is, a shot that leaves before its throw
 * or without the light that announces it.
 *
 * Two kinds of run feed the rows. The hand-made scenarios (`playthrough`, `hitSweep`, ...) step a `World` and an
 * `ActorsView` of their own, without a director, and sweep hits and crossings in ways no player does. The session
 * scenarios (`sessionPlay` and the scripts built on it) play the real `PlaySession` with its `StageDirector`: its
 * pacing, its hit-stops, its staged moments, its slow motion and its poses, display frame by display frame.
 */
import { ENEMY_SPEC, VIEW_H, VIEW_W, allSheetSpecs, type AnimSpec, type EnemyArt } from '../src/art/contract'
import { anchorOf, frameAt, type Anim } from '../src/art/sheet'
import { Interpolator } from '../src/app/interpolate'
import { PlaySession } from '../src/app/play'
import type { SimEvent } from '../src/game/events'
import { TILE, World, emptyInput, type Boss, type Enemy, type InputState, type Prop, type Shot } from '../src/game/sim'
import { clip } from '../src/view/bake'
import { newBox, newPlaced, opaqueBounds, paintedAt, placeBox, type Box } from '../src/view/bounds'
import { STAGES } from '../src/game/stages'
import { AIR_SHORT_SECONDS, ActorsView, aloft, groundBelow } from '../src/view/actors'
import * as viewActorsModule from '../src/view/actors'
import * as viewClips from '../src/view/clips'
import {
  BOSS_DEFEAT_GROUND_FRAME,
  ENEMY_DEFEAT_GROUND_FRAME,
  LUNGE_FRAMES,
  aimClear,
  clipLife,
  type ClipChoice
} from '../src/view/clips'
import type { StageDirector } from '../src/view/director'
import { playFx, type FxApi } from '../src/view/fx-map'
import type { FxPool } from '../src/view/fx'
import { PropsView, shotClip, shotSkin, type Shooter } from '../src/view/props'
import { SILENT_AUDIO } from '../src/view/sound-map'
import { RAGE_POSE_MARGIN } from '../src/view/staging'
import * as viewStaging from '../src/view/staging'
import { botInput, type BotMemory } from './bot'

export const STEP = 1 / 60
const SPECS = allSheetSpecs()

/**
 * How long (s of simulation time) the light of a boss's coming shot gathers before the shot (the view's own
 * constant; a tree without it, as the pre-round-6 copy, is audited with the length the view was given).
 */
export const SHOT_CUE_SECONDS = (viewClips as unknown as { SHOT_CUE_SECONDS?: number }).SHOT_CUE_SECONDS ?? 0.45

/** The gathering light of a boss's next shot as the view draws it on one frame (`ActorsView.shotCue`). */
export interface CueRow {
  sheet: string
  /** 0 when it begins, 1 when it is full. */
  progress: number
  /** Where it is drawn (world px), and how far (px) that is from his shot's birth place on his drawn body. */
  x: number
  y: number
  off: number
  /** A hit's jolt may be on his drawing on this frame (the light moves with it, up to `BOSS_JOLT_PX`). */
  jolt: boolean
  /** Its centre lies on (or within `ON_BODY_PX` of) a painted pixel of the frame he is drawn with. */
  onBody: boolean
}

/** Where a new shot of a boss is drawn on the frame it is born, and whether it is drawn behind the actors. */
export interface BirthRow {
  x: number
  y: number
  behind: boolean
  vx: number
  vy: number
  /** Its centre lies on (or within `ON_BODY_PX` of) a painted pixel of his drawn frame. */
  onBody: boolean
}

/** How near (px) to a painted pixel of the boss's drawn frame his light and his new shot must be. */
export const ON_BODY_PX = 3

/** A hit jolts the boss's drawing this far (px) for this long (s): the view's constants, read defensively. */
const actorConstants = viewActorsModule as unknown as Record<string, unknown>
const JOLT_PX = (actorConstants.BOSS_JOLT_PX as number | undefined) ?? 3
const JOLT_SECONDS = (actorConstants.BOSS_JOLT_SECONDS as number | undefined) ?? 0.12
/**
 * How long (s of simulation time) the transformation waits at most for the king to be between his actions: the
 * view's backstop (round 6c: "a few seconds, never reached in practice"); a pose begun after it is a finding.
 */
export const RAGE_WAIT_SECONDS =
  ((viewStaging as unknown as Record<string, unknown>).BETWEEN_WAIT_SECONDS as number | undefined) ?? 3
/** A clip squeezed below this (s) is not played (the view's constant). */
const FIT_MIN = ((viewClips as unknown as Record<string, unknown>).FIT_MIN as number | undefined) ?? 0.1

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
  /**
   * View time: the seconds this frame advanced the clips by (`viewDt`: 0 when the simulation is held, `dt` times
   * the director's time scale in slow motion) and their sum over the run so far (`vt`). How long a body stays in a
   * pose its own motion decides is measured on this clock; what the eye sees as a flicker, on `t`.
   */
  viewDt: number
  vt: number
  /** Simulation steps this frame showed (0 in a hit-stop or a held moment, 2 on some frames at 48 Hz). */
  steps: number
  /** Simulation steps run up to and including the ones this frame showed. */
  sim: number
  /** The director's staged moment (`director.current`), or null (and always null without a director). */
  moment: string | null
  /** A hit-stop held this frame (everything stands still: not a staged hold). */
  frozen: boolean
  /** The hero and the boss: the staged pose shown on him (`ActorsView.posing`), or null. */
  posed: string | null
  /** Bosses: the gathering light of his next shot as the view draws it, or null. */
  cue: CueRow | null
  /** On a frame a shot leaves (a boss's `boss-shoot`, a squirrel's `spit`): the side it flies to; else 0. */
  shot: 1 | -1 | 0
  /** Bosses: his shots seen for the first time on this frame, where they are drawn. */
  births: BirthRow[]
  /**
   * The stage is over or the hero is down (`world.state !== 'play'`): the simulation no longer steps. (Only the
   * rules about what the simulation holds read the boss's, the enemies' and the piglet's rows of these frames.)
   */
  over: boolean
  /** Bosses and enemies: within `aimClear` of the hero, where the simulation's aim flips as they move. */
  aimZone: boolean
  /**
   * Where the body (its centre) was after each simulation step this frame showed, from the simulation itself (no
   * interpolation): what the view decides on. Empty when the frame showed no step.
   */
  path: number[]
  /** Enemies and bosses: `player.x - actor.x` on the last simulation step the frame showed (no interpolation). */
  aimDx: number
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
  /** Ghosts, the hero and bosses: there is ground exactly under the feet (whatever the simulation's flag says). */
  supported: boolean
  /** The hero: in water (`player.inWater`). */
  water: boolean
  /** Enemies: off the ground with no ground within `ENEMY_AIR_GAP` px under the feet. */
  aloft: boolean
  /** Enemies: the box (but for a pixel at its edges) overlaps a solid tile. */
  inSolid: boolean
  /** The hero: the simulation's own facing (`player.facing`); a bite on this frame: the side it bit, else 0. */
  facing: 1 | -1
  /** The hero: his facing after each simulation step this frame showed (a pivot is decided on one of them). */
  faces: number[]
  bit: 1 | -1 | 0
  /** Enemies: the `dir` of an `enemy-hit` on this frame (the way the blow pushes it), else 0. */
  hitDir: 1 | -1 | 0
  /** The hero: the time into the clip he is drawn with (an action begun again goes back to 0), else NaN. */
  clipT: number
  /** Bosses: the time in his state, and whether the view holds him between his actions (`bossBetweenActions`). */
  stateTime: number
  ready: boolean
  /** The hero: drawn on this frame (`ActorsView.heroDrawn`; a view without it: true). */
  drawn: boolean
  /**
   * Enemies: on a frame with an `enemy-hit`, whether the view's design shows that hit as a flinch (false only for a
   * squirrel the hit finds in its throw, as `spitterHurtShows` decides it at the hit); true otherwise.
   */
  hitShows: boolean
  /**
   * A session's frame (NaN without one): the spotlight's amount (0 off, 1 fully up) and its centre on the screen
   * (px), and the camera's view position (world px of the screen's top left corner).
   */
  spot: number
  spotX: number
  spotY: number
  camX: number
  camY: number
  /** Bosses, in a session: the opaque box of the frame he is drawn with (world px), or null. */
  box: Box | null
  /** Bosses: on a frame with a `minion` event, the side of him it appears on; else 0. */
  minionSide: 1 | -1 | 0
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
  /** Bosses: his kind (`def.kind`); '' for the others. */
  bossKind: string
  rows: Row[]
}

/** The bosses whose shots are thrown and announced by a light: the crow, the fox, the bee (the king gathers his). */
const THROWN_ART: readonly string[] = ['crowBoss', 'foxBoss', 'beeBoss']

/** What the driver of a session tells the recorder about one display frame. */
export interface FrameInfo {
  /** Simulation steps the frame ran. */
  steps: number
  /** The view time the frame advanced the clips by. */
  viewDt: number
  /** The director's staged moment, or null. */
  moment: string | null
  /** A hit-stop held the frame (the view was frozen as it began). */
  frozen?: boolean
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

/** The side of the boss a summoned minion of this frame appears on (as the view tells it), or 0. */
function minionSideOf(events: SimEvent[], boss: Boss): 1 | -1 | 0 {
  const event = events.find((e) => e.type === 'minion') as Extract<SimEvent, { type: 'minion' }> | undefined
  return event ? (event.x > boss.x + boss.w / 2 ? 1 : -1) : 0
}

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
  /** The views read (its own, or a session's: `views` of the constructor; scratch harnesses set them by hand). */
  view: ActorsView
  props: PropsView
  readonly tracks = new Map<string, Track>()
  /** Display frames recorded, simulation steps run, display time (s), view time (s). */
  step = 0
  steps = 0
  time = 0
  viewTime = 0
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
  protected movedNow = new Set<string>()
  private ghostIds = new WeakMap<object, number>()
  private ghostCount = 0
  private mover = new Interpolator()
  /** Hit-stop left (s), simulation time not yet shown (s), events of steps no frame has shown yet. */
  private freeze = 0
  private owed = 0
  private pending: SimEvent[] = []
  /**
   * The side the boss's latest shot really flew to (the simulation aims before it moves him), until a row has it
   * (a session's driver sets it from the `boss-shoot` event).
   */
  shotSide: 1 | -1 | 0 = 0
  private readonly fx: FxApi

  constructor(
    readonly world: World,
    readonly label: string,
    readonly hz = 60,
    /** A session's own views (its `StageView` already lets a shot stay behind its shooter); else the recorder's. */
    views?: { actors: ActorsView; props: PropsView }
  ) {
    const pool = { rand: () => 0.5, spawn: () => {}, burst: () => {} } as unknown as FxPool
    this.view = views?.actors ?? new ActorsView(world, pool)
    this.props = views?.props ?? new PropsView(world, pool)
    // As the stage view does: a shot stays behind its shooter while it overlaps his drawing.
    if (!views) this.props.drawnFrame = (body, out) => this.view.drawnFrame(body, out)
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

  private track(who: string, kind: ActorKind, art: string, speed = 0, bossKind = '') {
    let track = this.tracks.get(who)
    if (!track) this.tracks.set(who, (track = { who, kind, art, speed, bossKind, rows: [] }))
    return track
  }

  bot(): InputState {
    return botInput(this.world, this.memory)
  }

  /** Simulation steps run that no display frame has shown yet; the last count read from the world's clock. */
  private unshown = 0
  private simSeen = 0

  /** One display frame: the view moves on (`anim` seconds for its clips, 0 in a hit-stop) and its rows are written. */
  private show(anim: number) {
    this.view.update(anim)
    this.view.tickReal(this.frameDt)
    this.props.update(anim)
    this.props.tickReal(this.frameDt)
    this.time += this.frameDt
    this.record(this.pending, anim <= 0, { steps: this.unshown, viewDt: anim, moment: null })
    this.unshown = 0
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
    this.noteSteps()
    this.steps++
    this.unshown++
    const events = world.events.splice(0)
    // The side his shot flew to, as sim.ts decides it: the hero (already moved this step) against the boss (not yet).
    if (events.some((event) => event.type === 'boss-shoot')) this.shotSide = world.player.x > bossBefore ? 1 : -1
    for (const event of events) {
      this.noteHit(event)
      view.handle(event)
      this.props.handle(event)
      playFx(event, this.fx)
    }
    // The view decides what the bodies do once a step, from the simulation's own positions (as `PlaySession.frame`).
    ;(view as unknown as { simStep?: () => void }).simStep?.()
    ;(this.props as unknown as { simStep?: () => void }).simStep?.()
    // The king's transformation is left to a staged moment that begins once he is between his actions (as the
    // director does it: `stageRage`, then a wait).
    if (events.some((event) => event.type === 'boss-phase')) {
      ;(view as unknown as { stageRage?: () => void }).stageRage?.()
      this.rageWait = 0
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
    // (view/staging.ts), once he stands between his actions (the view's `bossBetweenActions`, on the ground), and
    // after `RAGE_WAIT_SECONDS` of simulation time whatever he does. The audit has no director, so it does the same
    // by hand.
    const boss = world.boss
    if (this.rageWait !== null && boss && !boss.dead) {
      this.rageWait += STEP
      const between = (view as unknown as { bossBetweenActions?: () => boolean }).bossBetweenActions?.() !== false
      if ((between && boss.onGround) || this.rageWait >= RAGE_WAIT_SECONDS - 1e-9) {
        this.rageWait = null
        const seconds = clipLife(SPECS[boss.def.art].rage) + RAGE_POSE_MARGIN
        view.pose('boss', 'rage', seconds)
        // (The hero on the ground finishes what he does and stands.)
        if (world.player.onGround && !world.player.dead) view.standStill(seconds)
        for (let t = 0; t < seconds - this.frameDt / 2; t += this.frameDt) this.show(0)
        view.unpose()
      }
    } else if (!boss || boss.dead) this.rageWait = null
    this.movedNow.clear()
  }

  /** Simulation time (s) the staged transformation has waited for the king to be between his actions, or null. */
  private rageWait: number | null = null

  /**
   * A row for everything the view would draw now. `held`: the clips stood still on this frame; `info`: what the
   * frame showed (a session's driver passes it; without it, a frame of one step and `1 / hz` of view time, or none
   * when held, as a run without a director has).
   */
  record(events: SimEvent[], held: boolean, info?: FrameInfo) {
    const { world, view } = this
    this.step++
    // (A driver that passes no `info`, as the scratch harnesses do, has its steps counted from the world's clock.)
    let sim = this.steps
    if (!info) {
      sim = Math.round(world.time / STEP)
      this.simSeen = Math.min(this.simSeen, sim)
    }
    const frame: FrameInfo = info ?? {
      steps: sim - this.simSeen,
      viewDt: held ? 0 : this.frameDt,
      moment: null
    }
    if (!info) this.simSeen = sim
    this.viewTime += frame.viewDt
    const types = (pick: (event: SimEvent) => boolean) => events.filter(pick).map((event) => event.type)
    const p = world.player
    const posing = (who: 'hero' | 'boss') =>
      (view as unknown as { posing?: (who: string) => string | null }).posing?.(who) ?? null
    const base = {
      step: this.step,
      t: this.time,
      dt: this.frameDt,
      held,
      viewDt: frame.viewDt,
      vt: this.viewTime,
      steps: frame.steps,
      sim,
      moment: frame.moment,
      frozen: Boolean(frame.frozen),
      posed: null,
      cue: null,
      shot: 0 as const,
      births: [],
      over: world.state !== 'play',
      aimZone: false,
      path: [] as number[],
      facing: 1 as 1 | -1,
      faces: [] as number[],
      bit: 0 as 1 | -1 | 0,
      hitDir: 0 as 1 | -1 | 0,
      clipT: NaN,
      stateTime: 0,
      ready: true,
      drawn: true,
      hitShows: true,
      spot: this.staged?.spot ?? NaN,
      spotX: this.staged?.spotX ?? NaN,
      spotY: this.staged?.spotY ?? NaN,
      camX: this.staged?.camX ?? NaN,
      camY: this.staged?.camY ?? NaN,
      box: null as Box | null,
      minionSide: 0 as 1 | -1 | 0,
      aimDx: NaN,
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
    if (hero && SPECS.hero[hero.name]) {
      // Where he is drawn: a clear touched in the air brings him down to the ground (the view's own point).
      const point = (view as unknown as { heroPoint?: () => { x: number; y: number } | null }).heroPoint?.()
      const ending = world.state !== 'play' && point
      const feet = ending ? point.y + p.h / 2 : p.y + p.h
      let onGround = p.onGround
      if (ending && !p.onGround) {
        const ground = groundBelow(world, point.x, feet, 2)
        onGround = ground !== null && Math.abs(ground - feet) <= 1
      }
      this.track('hero', 'hero', 'hero').rows.push({
        ...base,
        sheet: 'hero',
        clip: hero.name,
        frame: frameOf(SPECS.hero[hero.name], hero),
        clipT: hero.t,
        x: ending ? point.x : p.x + p.w / 2,
        body: p.x + p.w / 2,
        path: this.pathOf('hero'),
        feet,
        vx: p.vx,
        vy: p.vy,
        onGround,
        water: p.inWater,
        flip: (view as unknown as { heroFlip?: () => boolean }).heroFlip?.() ?? p.facing < 0,
        facing: p.facing,
        faces: this.heroFaces.splice(0),
        bit:
          (events.find((event) => event.type === 'bite') as Extract<SimEvent, { type: 'bite' }> | undefined)?.dir ?? 0,
        posed: posing('hero'),
        drawn: (view as unknown as { heroDrawn?: () => boolean }).heroDrawn?.() ?? true,
        supported: standsOn(world, p.x + p.w / 2, feet),
        events: types((event) => HERO_EVENTS.has(event.type)),
        // After his knock-out the view moves the body itself.
        moved: this.movedNow.has('hero') || p.dead || world.state !== 'play'
      })
    }

    // (Also once the stage is over or the hero is down: what the simulation holds there is checked too.)
    // Whether a shot is drawn behind the actors, asked of the props view once a frame (it keeps a record of it).
    const behinds = new Map<object, boolean>()
    const behindOf = (shot: Shot) => {
      let behind = behinds.get(shot)
      if (behind === undefined) behinds.set(shot, (behind = this.props.shotBehind(shot)))
      return behind
    }
    {
      for (const enemy of world.enemies) {
        // (A summoned enemy is drawn only once the simulation has settled it.)
        if (enemy.dead || !view.enemyShown(enemy)) continue
        const choice = view.selectEnemy(enemy)
        if (!ENEMY_SPEC[enemy.kind as EnemyArt][choice.name]) {
          this.missing.push(`${enemy.kind}.${choice.name} at step ${this.step}`)
          continue
        }
        const spit = events.find((event) => event.type === 'spit' && event.id === enemy.id) as
          | Extract<SimEvent, { type: 'spit' }>
          | undefined
        const hit = events.find((event) => event.type === 'enemy-hit' && event.id === enemy.id) as
          | Extract<SimEvent, { type: 'enemy-hit' }>
          | undefined
        this.track(`enemy#${enemy.id}`, 'enemy', enemy.kind).rows.push({
          ...base,
          sheet: enemy.kind,
          clip: choice.name,
          frame: frameOf(ENEMY_SPEC[enemy.kind as EnemyArt][choice.name], choice),
          x: view.enemyX(enemy),
          body: enemy.x + enemy.w / 2,
          path: this.pathOf(`enemy#${enemy.id}`),
          aimDx: this.aimOf(`enemy#${enemy.id}`, frame.steps),
          feet: enemy.y + enemy.h,
          vx: enemy.vx,
          vy: enemy.vy,
          onGround: enemy.onGround,
          aloft: !enemy.onGround && aloft(world, enemy),
          inSolid: inSolid(world, enemy),
          flip: view.enemyFlip(enemy),
          heroDx: p.x - enemy.x,
          aimZone: Math.abs(p.x - enemy.x) <= aimClear(0),
          shot: spit ? spit.dir : 0,
          hitDir: hit ? hit.dir : 0,
          hitShows: hit ? (this.hitShowsOf.get(enemy.id) ?? true) : true,
          events: types((event) => ofEnemy(event, enemy.id)),
          moved: false
        })
      }
      const boss = world.boss
      if (boss && !boss.dead) {
        const sheet = view.bossSheet(boss)
        const choice = view.selectBoss(boss)
        const spec = SPECS[sheet]?.[choice.name]
        const shoots = events.some((event) => event.type === 'boss-shoot')
        const side: 1 | -1 = shoots && this.shotSide !== 0 ? this.shotSide : p.x > boss.x ? 1 : -1
        if (events.some((event) => event.type === 'boss-hit' || event.type === 'boss-crash'))
          this.joltAt = this.viewTime - frame.viewDt
        // His shots seen for the first time on this frame (the props view's shooter, or born inside his box).
        const births: BirthRow[] = []
        for (const shot of world.shots) {
          if (shot.dead || !shot.hostile || shot.kind === 'shock' || this.shotSeen.has(shot)) continue
          // (The props view keeps who shot it from the first time it is asked whether it is drawn behind.)
          const behind = behindOf(shot)
          // (On the frame of his shot, a new shot nobody else threw is his: the props view tells a shooter by the
          // box the shot is in when it is first asked, and he may have moved off it by then.)
          const by = this.props.shooterOf(shot)
          if (by !== boss && (by !== null || !shoots)) continue
          const x = shot.x + shot.w / 2
          const y = shot.y + shot.h / 2
          // (On his body where it was born: its own flight since then taken back, and that place on his body then put on
          // the body he is drawn with now, as the light is: his own move since, and the drawing's offset from it.)
          const born = birthPlace(x, y, shot.vx, shot.vy, this.flown.get(shot) ?? 0)
          const from = this.bornFrom.get(shot) ?? { x: boss.x, y: boss.y, bornX: born.x, bornY: born.y }
          const onBody = this.onBody(
            boss,
            from.bornX - (from.x + boss.w / 2) + view.bossX(boss),
            from.bornY + (boss.y - from.y)
          )
          births.push({ x, y, behind, vx: shot.vx, vy: shot.vy, onBody })
        }
        if (!spec) this.missing.push(`${sheet}.${choice.name} at step ${this.step}`)
        if (spec)
          this.track('boss', 'boss', boss.def.art, boss.def.speed, boss.def.kind).rows.push({
            ...base,
            sheet,
            clip: choice.name,
            frame: frameOf(spec, choice),
            x: view.bossX(boss),
            body: boss.x + boss.w / 2,
            path: this.pathOf('boss'),
            aimDx: this.aimOf('boss', frame.steps),
            feet: boss.y + boss.h,
            vx: boss.vx,
            vy: boss.vy,
            onGround: boss.onGround,
            flip: view.bossFlip(boss),
            state: boss.active ? boss.state : null,
            stateTime: boss.stateTime,
            ready: (view as unknown as { bossBetweenActions?: () => boolean }).bossBetweenActions?.() !== false,
            events: types((event) => BOSS_EVENTS.has(event.type)),
            moved: this.movedNow.has('boss'),
            heroDx: p.x - boss.x,
            aimZone: Math.abs(p.x - boss.x) <= aimClear(boss.def.speed),
            heroSide: side,
            shot: shoots ? side : 0,
            births,
            posed: posing('boss'),
            supported: standsOn(world, boss.x + boss.w / 2, boss.y + boss.h),
            cue: this.cueOf(boss),
            box: this.staged ? this.boxOf(boss) : null,
            minionSide: minionSideOf(events, boss)
          })
        if (shoots) this.shotSide = 0
      }
      for (const shot of world.shots) if (!shot.dead) this.shotSeen.add(shot)
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
        const behind = behindOf(shot)
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
        flip: ghost.flip,
        heroDx: p.x + p.w / 2 - ghost.x,
        events: down ? types((event) => ofEnemy(event, down.id)) : [],
        moved: false,
        supported: ground !== null && Math.abs(ground - ghost.feet) <= 1
      })
    }
  }

  /** The bodies' places after each simulation step not yet written in a row, by track. */
  private paths = new Map<string, number[]>()

  /** Notes where every body is after a simulation step (the true places, before any interpolation). */
  protected noteSteps() {
    const { world } = this
    const add = (who: string, x: number) => {
      let list = this.paths.get(who)
      if (!list) this.paths.set(who, (list = []))
      list.push(x)
    }
    add('hero', world.player.x + world.player.w / 2)
    this.heroFaces.push(world.player.facing)
    for (const enemy of world.enemies)
      if (!enemy.dead) {
        add(`enemy#${enemy.id}`, enemy.x + enemy.w / 2)
        this.aims.set(`enemy#${enemy.id}`, world.player.x - enemy.x)
      }
    if (world.boss && !world.boss.dead) {
      add('boss', world.boss.x + world.boss.w / 2)
      this.aims.set('boss', world.player.x - world.boss.x)
    }
    // (The simulation moves a shot on the step it is born: after its first step it has flown one. It aims from his
    // body as it was before that step, and moves him after.)
    for (const shot of world.shots)
      if (!shot.dead) {
        const n = this.flown.get(shot) ?? 0
        if (n === 0) {
          // Where it was born: its place after its first step, that step taken back (at the speed it flew it with).
          const at = birthPlace(shot.x + shot.w / 2, shot.y + shot.h / 2, shot.vx, shot.vy, 1)
          if (this.bossWas) this.bornFrom.set(shot, { ...this.bossWas, bornX: at.x, bornY: at.y })
        }
        this.flown.set(shot, n + 1)
      }
    const boss = world.boss
    this.bossWas = boss && !boss.dead ? { x: boss.x, y: boss.y } : null
  }

  /** The steps each shot has flown since it was born (its birth step counted). */
  protected flown = new WeakMap<object, number>()
  /** The boss's place (his box's corner) before the step each shot was born on, and after the last step noted. */
  protected bornFrom = new WeakMap<object, { x: number; y: number; bornX: number; bornY: number }>()
  private bossWas: { x: number; y: number } | null = null

  /** The hero's facing after each step not yet written in a row. */
  private heroFaces: number[] = []
  /** The simulation's aim (`player.x - actor.x`) on the last step noted, by track. */
  private aims = new Map<string, number>()
  private aimOf(who: string, steps: number) {
    return steps > 0 ? (this.aims.get(who) ?? NaN) : NaN
  }

  /** The places noted for a track since its last row (and forgets them). */
  private pathOf(who: string) {
    const list = this.paths.get(who) ?? []
    this.paths.delete(who)
    return list
  }

  /** View time of the boss's last hit or crash (his drawing is jolted for `JOLT_SECONDS` after it). */
  private joltAt = -Infinity
  /** Shots already seen on an earlier frame. */
  private shotSeen = new WeakSet<object>()

  /**
   * The light of the boss's next shot as the view draws it now (null: none; a view without `shotCue` has none), with
   * how far it is from the place his shot will be born on his drawn body: the centre of the shot's box on its first
   * step (sim.ts puts the box's left edge, 14 px wide, on his centre, at 0.4 of his height, 0.5 for the crow).
   */
  private cueOf(boss: Boss): CueRow | null {
    type Cue = { sheet: string; progress: number; x?: number; y?: number }
    const view = this.view as unknown as { shotCue?: (boss: Boss) => Cue | null }
    const cue = view.shotCue?.(boss)
    if (!cue) return null
    const x = cue.x ?? NaN
    const y = cue.y ?? NaN
    const bx = this.view.bossX(boss) + 7
    const by = boss.y + boss.h * (boss.def.kind === 'flyer' ? 0.5 : 0.4) + 7
    const jolt = this.viewTime - this.joltAt < JOLT_SECONDS + EPS
    const onBody = this.onBody(boss, x, y)
    return {
      sheet: cue.sheet,
      progress: cue.progress,
      x,
      y,
      off: Math.hypot(x - bx, y - by),
      jolt,
      onBody
    }
  }

  /** A session's spotlight and camera on the frame being recorded (null without a session). */
  protected staged: { spot: number; spotX: number; spotY: number; camX: number; camY: number } | null = null

  /** The opaque box (world px) of the frame the boss is drawn with now, or null. */
  private boxOf(boss: Boss): Box | null {
    const placed = this.bodyPlaced
    if (!this.view.drawnFrame(boss, placed) || !placed.raster) return null
    const b = opaqueBounds(placed.raster)
    return b ? placeBox(b, placed.anchor, placed.x, placed.y, placed.flip, newBox()) : null
  }

  /**
   * Whether the view's design shows a hit on `enemy` as a flinch, asked as the view asks it when the hit comes (a
   * squirrel in its throw shows the white flash only: `spitterHurtShows`, with the view's own record of a throw it
   * cut); by enemy id, until its row has it.
   */
  protected noteHit(event: SimEvent) {
    if (event.type !== 'enemy-hit') return
    const enemy = this.world.enemies.find((e) => e.id === event.id)
    if (!enemy) return
    const shows = (
      viewClips as unknown as { spitterHurtShows?: (timer: number, spec: AnimSpec, cut: boolean) => boolean }
    ).spitterHurtShows
    if (enemy.kind !== 'spitter' || !shows) return this.hitShowsOf.set(enemy.id, true)
    const timers = (this.view as unknown as { timersOf?: (e: Enemy) => { throwCut?: boolean } }).timersOf?.(enemy)
    this.hitShowsOf.set(enemy.id, shows(enemy.shootTimer, ENEMY_SPEC.spitter.shoot, Boolean(timers?.throwCut)))
  }
  protected hitShowsOf = new Map<number, boolean>()

  /** Whether (x, y) lies on, or within `ON_BODY_PX` of, a painted pixel of the frame the boss is drawn with now. */
  private onBody(boss: Boss, x: number, y: number) {
    const placed = this.bodyPlaced
    if (Number.isNaN(x) || !this.view.drawnFrame(boss, placed)) return false
    const cx = Math.round(x)
    const cy = Math.round(y)
    for (let r = 0; r <= ON_BODY_PX; r++)
      for (let j = -r; j <= r; j++)
        for (let i = -r; i <= r; i++)
          if (Math.max(Math.abs(i), Math.abs(j)) === r && paintedAt(placed, cx + i, cy + j)) return true
    return false
  }
  private bodyPlaced = newPlaced()

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
    return this.view
      .ghostStates()
      .map((state, i) => ({ ...state, key: records[i], flip: Boolean((records[i] as { flip?: boolean }).flip) }))
  }

  /** Steps while `go` holds, at most `seconds`, keeping the hero alive. */
  run(seconds: number, go: () => boolean, input: () => InputState = () => this.bot()) {
    for (let n = Math.round(seconds / STEP); n > 0 && go() && this.world.state === 'play'; n--) {
      this.world.player.hp = this.world.player.maxHp
      this.advance(input())
    }
  }
}

// ------------------------------------------------------------------------------------------------- the session

/** What a session's scripts can reach. */
export interface SessionContext {
  readonly world: World
  readonly session: PlaySession
  readonly rec: SessionRecorder
}

export interface SessionOptions {
  /** Re-seeds the world's random numbers after it is built (the session seeds it from the stage otherwise). */
  seed?: number
  /** Display frames a second (default 60). */
  hz?: number
  /**
   * Presses the skip (bite) on every display frame while the director locks the input: in every moment, or (a list)
   * only in the moments named.
   */
  skip?: boolean | readonly string[]
  reducedMotion?: boolean
  /** The hero is kept alive (default true). */
  keepAlive?: boolean
  /** The switches are bitten and, on a stage without a boss, the twigs and berries taken (default true). */
  prep?: boolean
  /** The input of every simulation step the director does not lock (default: the bot's plan, see `stagePlan`). */
  plan?: (ctx: SessionContext) => InputState
  /** Runs before every simulation step (scripts that set the simulation up by hand). */
  beforeStep?: (ctx: SessionContext) => void
  /**
   * Steps the hero stands still at the start before the bot's plan begins: the seed alone changes little of a run
   * (the simulation draws few numbers), this shifts every meeting of the run against the rest.
   */
  wait?: number
  /** Runs once before the session starts. */
  setup?: (ctx: SessionContext) => void
  label?: string
}

/** One display frame of a session as the driver saw it. */
export interface SessionFrame {
  /** The director's time scale and whether the view held the simulation (hit-stop), as the frame began. */
  scale: number
  frozen: boolean
  locked: boolean
  steps: number
  viewDt: number
  moment: string | null
}

/** A stand-in for the HUD: every call does nothing (a line on the deck is never shown). */
const silentHud = () =>
  new Proxy({ speak: () => false } as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : () => {})
  })

/**
 * A `Recorder` that plays the real `PlaySession` with its `StageDirector`: one `PlaySession.frame(1 / hz)` per
 * display frame, its pacer and its hit-stops, the director's staged moments, poses, input lock and slow motion, the
 * rows written from the session's own `ActorsView` and `PropsView` after each frame. The hero is kept alive; the
 * director's skip is pressed when asked (`skip`); the input comes from `plan` (the bot by default).
 */
export class SessionRecorder extends Recorder implements SessionContext {
  readonly session: PlaySession
  readonly director: StageDirector
  readonly frames: SessionFrame[] = []
  /** The bot's plan: 'walk' to the boss, 'fight' him, 'rest' a moment, then 'out' to the goal. */
  phase: 'walk' | 'fight' | 'rest' | 'out' = 'walk'
  private phaseSteps = 0
  private waited = 0
  private botMemory: BotMemory
  private events: SimEvent[] = []
  private stepsNow = 0
  private animDt = 0

  constructor(
    readonly no: number,
    readonly options: SessionOptions = {}
  ) {
    const hz = options.hz ?? 60
    const input = { poll: () => emptyInput(), consumePresses() {} }
    const deps = {
      renderer: { k: 1 },
      hud: silentHud(),
      audio: SILENT_AUDIO,
      input,
      reducedMotion: Boolean(options.reducedMotion)
    } as unknown as ConstructorParameters<typeof PlaySession>[1]
    const session = new PlaySession(STAGES[no - 1], deps)
    const world = session.world
    if (options.seed !== undefined) (world as unknown as { rng: { state: number } }).rng.state = options.seed >>> 0 || 1
    const keepAlive = options.keepAlive !== false
    if (keepAlive) {
      world.player.maxHp = 999
      world.player.hp = 999
    }
    const label =
      options.label ??
      `stage ${no}, seed ${options.seed ?? 'of the stage'}: the session plays${options.skip === true ? ', skipping' : options.skip ? ` skipping ${options.skip.join(', ')}` : ''}${options.reducedMotion ? ', reduced motion' : ''}${options.wait ? `, waiting ${options.wait} steps first` : ''}${atRate(hz)}`
    super(world, label, hz, { actors: session.view.actors, props: session.view.props })
    this.session = session
    this.director = session.director as StageDirector
    this.botMemory = { x: world.player.x, stuck: 0, reverse: 0 }
    // Every simulation step: the script's hook, the boss's place (the simulation aims his shot from there), the step,
    // the hero topped up.
    const step = world.step.bind(world)
    let bossBefore = 0
    world.step = (dt: number, stepInput: InputState) => {
      options.beforeStep?.(this)
      bossBefore = world.boss ? world.boss.x : 0
      this.stepsNow++
      this.steps++
      step(dt, stepInput)
      this.noteSteps()
      if (keepAlive) world.player.hp = world.player.maxHp
    }
    const view = session.view
    const handle = view.handle.bind(view)
    view.handle = (event: SimEvent) => {
      this.events.push(event)
      if (event.type === 'boss-shoot') this.shotSide = world.player.x > bossBefore ? 1 : -1
      this.noteHit(event)
      handle(event)
    }
    const update = view.update.bind(view)
    view.update = (dt: number, animDt?: number) => {
      this.animDt = animDt ?? (view.frozen ? 0 : dt)
      update(dt, animDt)
    }
    // The director polls the same input for its skip while it locks; the session polls it once a step otherwise.
    input.poll = () => {
      if (this.director.inputLocked) {
        const moment = this.director.current ?? ''
        const skip = options.skip === true || (Array.isArray(options.skip) && options.skip.includes(moment))
        return { ...emptyInput(), bitePressed: skip }
      }
      return options.plan ? options.plan(this) : this.stagePlan()
    }
    if (options.prep !== false) {
      for (const prop of world.props) if (prop.kind === 'switch') world.biteProp(prop, 1)
      if (!world.boss)
        for (const prop of [...world.props]) if (prop.kind === 'twig' || prop.kind === 'berry') world.collect(prop)
      // (The events of the preparation are dropped, but a boss it summons, as the nest stage's: his entrance plays.)
      const awake = world.events.filter((event) => event.type === 'boss-awake')
      world.events.length = 0
      world.events.push(...awake)
    }
    options.setup?.(this)
    session.start()
  }

  get rec(): SessionRecorder {
    return this
  }

  /**
   * The bot's plan: it walks to the boss (40 s at most on a chase, 120 s otherwise), fights him once he is awake
   * (`fightInput`, 90 s at most), rests 2 s once he is down, and walks on to the goal.
   */
  stagePlan(): InputState {
    const { world } = this
    const chase = STAGES[this.no - 1].boss.kind === 'chaser'
    if (this.phase === 'walk' && (this.phaseSteps >= (chase ? 40 : 120) * 60 || (!chase && world.boss?.active))) {
      this.phase = world.boss && !chase ? 'fight' : 'out'
      this.phaseSteps = 0
    }
    if (this.phase === 'fight' && (this.phaseSteps >= 90 * 60 || !world.boss || world.boss.dead)) {
      this.phase = 'rest'
      this.phaseSteps = 0
    }
    if (this.phase === 'rest' && this.phaseSteps >= 120) {
      this.phase = 'out'
      this.phaseSteps = 0
    }
    this.phaseSteps++
    if (this.waited < (this.options.wait ?? 0)) {
      this.waited++
      return emptyInput()
    }
    if (this.phase === 'fight') return fightInput(world)
    if (this.phase === 'rest') return emptyInput()
    return botInput(world, this.botMemory)
  }

  /** One display frame: `PlaySession.frame`, then the rows of what it shows. */
  frame() {
    const { session, director } = this
    const scale = session.view.frozen ? 0 : director.timeScale
    const frozen = session.view.frozen
    const locked = director.inputLocked
    this.stepsNow = 0
    session.frame(this.frameDt)
    this.time += this.frameDt
    const events = this.events
    this.events = []
    const moment = director.current ?? null
    // What a script moved by hand stays marked as long as the picture can still show the move: the frames that
    // interpolate from before it (up to the frame that runs the next step) included.
    this.movedNow.clear()
    for (const [who, until] of this.movedUntil) {
      if (this.steps <= until) this.movedNow.add(who)
      else this.movedUntil.delete(who)
    }
    const { overlay, camera } = session.view
    this.staged = {
      spot: (overlay as unknown as { spotlightAmount?: number }).spotlightAmount ?? 0,
      spotX: (overlay as unknown as { spotX?: number }).spotX ?? NaN,
      spotY: (overlay as unknown as { spotY?: number }).spotY ?? NaN,
      camX: camera.x,
      camY: camera.y
    }
    this.record(events, this.animDt <= 0, { steps: this.stepsNow, viewDt: this.animDt, moment, frozen })
    this.frames.push({ scale, frozen, locked, steps: this.stepsNow, viewDt: this.animDt, moment })
  }

  /** Simulation step (count) up to which each actor a script moved is marked `moved`. */
  private movedUntil = new Map<string, number>()

  /**
   * The script is about to move this actor by hand: in a session that is inside the step about to run (the
   * interpolation of this step and of the frames up to the next one starts from where he was before).
   */
  override moved(who: string) {
    this.movedUntil.set(who, this.steps + 2)
  }

  /** Display frames for at most `seconds` of real time, until `until` holds (default: the session's outcome). */
  play(seconds: number, until: () => boolean = () => this.session.outcome !== null) {
    for (let n = Math.round(seconds * this.hz); n > 0; n--) {
      this.frame()
      if (until()) return true
    }
    return false
  }
}

/** Stage `no` played by the real session with its director, to its outcome (or `seconds` of real time). */
export function sessionPlay(no: number, options: SessionOptions & { seconds?: number } = {}) {
  const r = new SessionRecorder(no, options)
  r.play(options.seconds ?? 600)
  return r
}

/** The hero keeps out of the boss's way: he walks away from a boss closer than `near` px, and stands otherwise. */
const keepAway =
  (near = 150) =>
  ({ world }: SessionContext) => {
    const boss = world.boss
    const input = emptyInput()
    if (!boss || boss.dead) return input
    const dx = boss.x + boss.w / 2 - (world.player.x + world.player.w / 2)
    if (Math.abs(dx) < near) input[dx > 0 ? 'left' : 'right'] = true
    return input
  }

/** The hero cannot be hurt (the session keeps his health topped up too). */
const untouchable = ({ world }: SessionContext) => {
  world.player.invuln = 99999
}

/** The boss's states as the session's scripts follow them: the state before the one he is in. */
function stateHistory() {
  let last = ''
  let prev = ''
  return (boss: Boss) => {
    if (boss.state !== last) {
      prev = last
      last = boss.state
    }
    return prev
  }
}

/**
 * The moments of the king's cycle at which his transformation is forced: `when` holds on the step it is forced
 * (before the step runs: his state, the time in it, the state before it, the clip the view drew him with last).
 */
export const KING_MOMENTS: readonly { name: string; when: (boss: Boss, prev: string, clip: string) => boolean }[] = [
  { name: 'idle, early', when: (b) => b.state === 'idle' && b.stateTime >= 0.1 },
  { name: 'idle, late', when: (b) => b.state === 'idle' && b.stateTime >= 0.6 },
  { name: 'windup, early', when: (b) => b.state === 'windup' && b.stateTime >= 0.05 },
  { name: 'windup, late', when: (b) => b.state === 'windup' && b.stateTime >= 0.3 },
  { name: 'charge, early', when: (b) => b.state === 'charge' && b.stateTime >= 0.1 },
  { name: 'charge, late', when: (b) => b.state === 'charge' && b.stateTime >= 0.7 },
  { name: 'shoot, early', when: (b) => b.state === 'shoot' && b.stateTime >= 0.1 },
  { name: 'shoot, late', when: (b) => b.state === 'shoot' && b.stateTime >= 0.45 },
  { name: 'slam, in the air', when: (b) => b.state === 'slam' && !b.onGround && b.stateTime >= 0.15 },
  { name: 'slam, on the ground', when: (b) => b.state === 'slam' && b.onGround },
  {
    name: 'recover after a charge, early',
    when: (b, prev) => b.state === 'recover' && prev === 'charge' && b.stateTime >= 0.05
  },
  {
    name: 'recover after a charge, late',
    when: (b, prev) => b.state === 'recover' && prev === 'charge' && b.stateTime >= 0.6
  },
  {
    name: 'recover after a slam, mid-landing',
    when: (b, prev, clip) => b.state === 'recover' && prev === 'slam' && clip === 'land' && b.stateTime >= 0.03
  },
  {
    name: 'recover after a slam, landed',
    when: (b, prev, clip) => b.state === 'recover' && prev === 'slam' && clip !== 'land' && b.stateTime >= 0.3
  },
  {
    name: 'recover after a volley, mid-follow-through',
    when: (b, prev, clip) => b.state === 'recover' && prev === 'shoot' && clip === 'shoot' && b.stateTime >= 0.03
  },
  {
    name: 'recover after a volley, done',
    when: (b, prev, clip) => b.state === 'recover' && prev === 'shoot' && clip !== 'shoot' && b.stateTime >= 0.3
  }
]

/**
 * What the hero does on the step the king's transformation is forced: stands (`ground`), has just jumped (`air`:
 * the director waits for him to land while the simulation runs on), bites, is knocked back by a hit, runs, keeps
 * hopping with the jump held from the start of the fight (`hop`: the moment must still begin on a frame he stands),
 * or is lifted by hand and kept in the air past the director's cap (`cap`: the moment begins without him, once the
 * king is between his actions, and he hangs there).
 */
export type HeroAtPhase = 'ground' | 'air' | 'bite' | 'knocked' | 'run' | 'hop' | 'cap'
export const HEROES_AT_PHASE: readonly HeroAtPhase[] = ['ground', 'air', 'bite', 'knocked', 'run', 'hop', 'cap']

/**
 * The king's transformation forced at one moment of his cycle (`KING_MOMENTS`): the session fight on stage 10, the
 * hero kept out of harm, and on the step the moment comes his health is set to half by hand (`hit`: by a last hit,
 * `world.damageBoss`), the hero doing what `hero` says (`air: true` is `hero: 'air'`). `reached` says whether the
 * moment came within the fight.
 */
export function kingTransforms(
  moment: (typeof KING_MOMENTS)[number],
  options: { hit: boolean; air?: boolean; hero?: HeroAtPhase; seed?: number; hz?: number }
) {
  const hero: HeroAtPhase = options.hero ?? (options.air ? 'air' : 'ground')
  const history = stateHistory()
  let forced = -1
  let prev = ''
  let home: { x: number; y: number } | null = null
  let runFor = 0
  let lift: number | null = null
  /** The moment has come (read before the step, by the input and by the step's hook alike). */
  const due = ({ world, rec }: SessionContext) => {
    const boss = world.boss
    if (!boss || !boss.active || boss.dead || forced >= 0 || rec.director.inputLocked) return false
    // (Not before his entrance has played: no real fight takes him to half his health while it is still due.)
    if (!rec.director.log.includes('boss-intro')) return false
    const rows = rec.tracks.get('boss')?.rows
    if (!moment.when(boss, prev, rows?.[rows.length - 1]?.clip ?? '')) return false
    const p = world.player
    return hero === 'cap' || hero === 'hop' || p.onGround
  }
  const r = new SessionRecorder(10, {
    seed: options.seed ?? 3,
    hz: options.hz,
    skip: true,
    label: `stage 10: the king transforms at ${moment.name}, ${options.hit ? 'hit' : 'not hit'}, the hero ${hero}${atRate(options.hz ?? 60)}`,
    setup: (ctx) => enterArena(ctx.rec),
    plan: (ctx) => {
      const input = emptyInput()
      const p = ctx.world.player
      if (hero === 'hop') {
        input.jump = true
        input.jumpPressed = p.onGround
      }
      if (hero === 'bite' && due(ctx)) {
        input.bite = true
        input.bitePressed = true
      }
      if (runFor > 0) {
        runFor--
        input[p.vx < 0 ? 'left' : 'right'] = true
      }
      return input
    },
    beforeStep: (ctx) => {
      untouchable(ctx)
      const { world, rec } = ctx
      const boss = world.boss
      const p = world.player
      // Kept in the air past the cap: lifted back by hand to where he was, until the moment has begun.
      if (lift !== null) {
        // (Let go once the moment has begun: this hook does not run while its pose holds the simulation.)
        if (rec.director.log.includes('boss-phase') || forced < 0) lift = null
        else {
          p.y = lift
          p.vy = 0
          p.onGround = false
          rec.moved('hero')
        }
      }
      if (!boss || boss.dead) return
      prev = history(boss)
      if (!boss.active || forced >= 0 || rec.director.inputLocked) return
      // (His charges and leaps go the open way, so that they play out instead of ending against a wall.)
      if (boss.state === 'windup' && boss.stateTime < EPS) {
        home ??= { x: boss.x, y: boss.y }
        openSide(rec, home)
      }
      if (!due(ctx)) return
      const away: 1 | -1 = p.x + p.w / 2 < boss.x + boss.w / 2 ? -1 : 1
      if (hero === 'air') {
        // A jump by hand: the body is thrown up from where it stands, the simulation carries it.
        p.vy = -560
        p.onGround = false
      } else if (hero === 'knocked') {
        p.invuln = 0
        world.hurtPlayer(1, boss.x + boss.w / 2)
      } else if (hero === 'run') {
        p.vx = away * 215
        runFor = 30
      } else if (hero === 'cap') {
        p.y -= 3 * TILE
        p.vy = 0
        p.onGround = false
        lift = p.y
        rec.moved('hero')
      }
      forced = rec.steps
      const half = Math.floor(boss.maxHp / 2)
      if (options.hit) {
        boss.hp = half + 1
        boss.invuln = 0
        world.damageBoss(1)
      } else boss.hp = half
    }
  })
  // The fight until the moment comes (60 s at most), then the transformation and 3 s of the fight after it.
  r.play(70, () => forced >= 0)
  if (forced >= 0) r.play(10, () => r.director.log.includes('boss-phase') && !r.director.current)
  if (forced >= 0) r.play(3, () => false)
  return { r, reached: forced >= 0 }
}

/**
 * The view's backstop reached: the king's transformation forced as he touches down from a leap, and the simulation
 * then kept in his slam on the ground by hand (its clock set back each step) for longer than `RAGE_WAIT_SECONDS`, so
 * that he is never between his actions; let go once the pose has begun, he lands his slam. The staged moment must
 * begin at the backstop, in his landing (both reported by name: `the backstop was reached`, `transformation begins
 * in an action`), and nothing else may follow from it: the landing the pose cut does not resume after it.
 */
export function kingPastTheBackstop(options: { hz?: number; seed?: number } = {}) {
  let forced = -1
  let held = true
  const moment = KING_MOMENTS.find((m) => m.name === 'slam, on the ground')!
  const history = stateHistory()
  let home: { x: number; y: number } | null = null
  const r = new SessionRecorder(10, {
    seed: options.seed ?? 3,
    hz: options.hz,
    skip: true,
    label: `stage 10: the king held in his slam past the backstop${atRate(options.hz ?? 60)}`,
    setup: (ctx) => enterArena(ctx.rec),
    plan: () => emptyInput(),
    beforeStep: (ctx) => {
      untouchable(ctx)
      const { world, rec } = ctx
      const boss = world.boss
      if (!boss || boss.dead) return
      const prev = history(boss)
      if (forced >= 0) {
        // (The moment began: the director's log has it. No step runs while it plays, so a pose cannot be seen here.)
        if (rec.director.log.includes('boss-phase')) held = false
        if (held && boss.state === 'slam') boss.stateTime = 0
        return
      }
      if (!boss.active || rec.director.inputLocked) return
      if (boss.state === 'windup' && boss.stateTime < EPS) {
        home ??= { x: boss.x, y: boss.y }
        openSide(rec, home)
      }
      if (!moment.when(boss, prev, '') || !world.player.onGround) return
      forced = rec.steps
      boss.hp = Math.floor(boss.maxHp / 2)
    }
  })
  r.play(70, () => forced >= 0)
  if (forced >= 0) r.play(12, () => r.director.log.includes('boss-phase') && !r.director.current)
  if (forced >= 0) r.play(3, () => false)
  return { r, reached: forced >= 0 }
}

/**
 * The steps until a shooter's next shot leaves, the coming step counted, as sim.ts counts it down (its timer less a
 * step each step, the shot on the step it reads zero or less; the crow throws only while he hovers, `idle`, which
 * he leaves after 1.4 s and comes back to 0.9 s into his recovery); null when it cannot be told from here.
 */
function shotIn(shooter: Boss | Enemy): number | null {
  if (!('def' in shooter)) {
    let t = shooter.shootTimer
    for (let n = 1; n <= 600; n++) if ((t -= STEP) <= 0) return n
    return null
  }
  let t = shooter.shotTimer
  let state = shooter.state
  let time = shooter.stateTime
  const flyer = shooter.def.kind === 'flyer'
  for (let n = 1; n <= 600; n++) {
    time += STEP
    if (flyer) {
      if (state === 'idle' && time > 1.4) return null
      if (state === 'recover' && time > 0.9) {
        state = 'idle'
        time = 0
      } else if (state !== 'idle' && state !== 'recover') return null
    }
    if ((t -= STEP) <= 0 && (!flyer || state === 'idle')) return n
  }
  return null
}

/** The shooters `crossingShots` puts the hero round: the crow, the fox, the bee (their stages) and a squirrel. */
export const CROSSING_SHOOTERS = ['crowBoss', 'foxBoss', 'beeBoss', 'spitter'] as const
export type CrossingShooter = (typeof CROSSING_SHOOTERS)[number]
const SHOOTER_STAGE: Record<Exclude<CrossingShooter, 'spitter'>, number> = { crowBoss: 2, foxBoss: 7, beeBoss: 9 }

/**
 * Shots against a crossing hero: the session on the shooter's stage, the hero standing some way off; `k` steps
 * before each shot is due (as the simulation counts it down) he is put on the other side of the shooter, the same
 * distance away (by hand: `moved`). With `k: 'aim'` he is put on the shooter's aim line instead (closer than
 * `aimClear`, where the simulation's aim flips as the shooter moves) from 8 steps before each shot until it leaves.
 * `crossed` counts the shots that left after such a move.
 */
export function crossingShots(
  shooter: CrossingShooter,
  k: number | 'aim',
  options: { hz?: number; seconds?: number } = {}
) {
  const squirrel = shooter === 'spitter'
  const no = squirrel
    ? STAGES.find((s) => new World(s, { seed: 5 }).enemies.some((e) => e.kind === 'spitter'))!.no
    : SHOOTER_STAGE[shooter]
  let crossed = 0
  let armed = false
  let enemy: Enemy | null = null
  const lead = k === 'aim' ? 8 : k
  const r = new SessionRecorder(no, {
    seed: 5,
    hz: options.hz,
    skip: true,
    label: `${shooter} on stage ${no}: the hero ${k === 'aim' ? 'on its aim line' : `crosses ${k} steps before each shot`}${atRate(options.hz ?? 60)}`,
    setup: ({ world, rec }) => {
      if (!squirrel) {
        for (const other of world.enemies) other.dead = true
        enterArena(rec)
        return
      }
      const it = (enemy = world.enemies.find((e) => e.kind === 'spitter')!)
      for (const other of world.enemies) if (other !== it) other.dead = true
      const p = world.player
      p.x = it.x + it.w / 2 + 160 - p.w / 2
      p.y = it.y + it.h - p.h
      p.vx = 0
      p.vy = 0
      rec.moved('hero')
    },
    plan: () => emptyInput(),
    beforeStep: (ctx) => {
      untouchable(ctx)
      const { world, rec } = ctx
      const boss = world.boss
      const body = squirrel ? enemy : boss
      if (!body || body.dead || rec.director.inputLocked) return
      if (!squirrel && !boss!.active) return
      const due = shotIn(squirrel ? enemy! : boss!)
      if (due === null) return
      if (due > lead + 1) {
        armed = true
        return
      }
      if (!armed) return
      const p = world.player
      if (k === 'aim') {
        // On the line the simulation aims along (its `player.x - shooter.x`): a px off it, well within `aimClear`.
        p.x = body.x + (p.x >= body.x ? 1 : -1)
        p.vx = 0
        rec.moved('hero')
        if (due <= 1) {
          armed = false
          crossed++
        }
        return
      }
      if (due !== lead + 1) return
      armed = false
      const centre = body.x + body.w / 2
      const mine = p.x + p.w / 2
      const gate = world.bossGate
      const min = gate ? (gate.x + 1) * TILE + 4 : TILE
      p.x = Math.max(min, Math.min(world.w * TILE - TILE - p.w, centre - (mine - centre) - p.w / 2))
      p.vx = 0
      rec.moved('hero')
      crossed++
    }
  })
  r.play(options.seconds ?? 9, () => false)
  return { r, crossed }
}

/**
 * As the boss settles into a wind-up: puts the hero `distance` px from him on the side with more open floor (no
 * wall or pillar at the height of his body), so that his dash goes that way and ends short of what would stun him;
 * a boss with too little room for a dash either way (down in a pit) is put back where `home` is first (by hand).
 */
function openSide(r: Recorder, home: { x: number; y: number }, distance = 170) {
  const { world } = r
  const boss = world.boss!
  const p = world.player
  const room = () => {
    const row = Math.floor((boss.y + boss.h) / TILE) - 1
    const open = (tx: number) => tx >= 0 && tx < world.w && !world.solidAt(tx, row) && !world.solidAt(tx, row - 1)
    const centre = boss.x + boss.w / 2
    let left = Math.floor(centre / TILE)
    let right = left
    while (open(left - 1)) left--
    while (open(right + 1)) right++
    return { centre, left: centre - left * TILE, right: (right + 1) * TILE - centre }
  }
  let space = room()
  if (Math.max(space.left, space.right) < 7 * TILE) {
    boss.x = home.x
    boss.y = home.y
    boss.vx = 0
    boss.vy = 0
    r.moved('boss')
    space = room()
  }
  const centre = space.centre
  const dir = space.right > space.left ? 1 : -1
  p.x = centre + dir * distance - p.w / 2
  p.y = boss.y + boss.h - p.h
  p.vx = 0
  p.vy = 0
  r.moved('hero')
}

/**
 * The fox's or the bee's shots in every state: a long session fight with the hero out of harm, standing still; as
 * the boss begins a wind-up the hero is put some way off on his more open side (by hand), so that the dash ends
 * short of the walls that would stun him. Their timer runs whatever they do, so shots leave while they walk, wind
 * up, dash and recover.
 */
export function shotsInEveryState(no: number, options: { seconds?: number; hz?: number; seed?: number } = {}) {
  let last = ''
  let home: { x: number; y: number } | null = null
  const r = new SessionRecorder(no, {
    seed: options.seed ?? 5,
    hz: options.hz,
    skip: true,
    label: `stage ${no}: the boss shoots in every state${atRate(options.hz ?? 60)}`,
    setup: ({ world, rec }) => {
      for (const enemy of world.enemies) enemy.dead = true
      enterArena(rec)
    },
    plan: () => emptyInput(),
    beforeStep: (ctx) => {
      untouchable(ctx)
      const boss = ctx.world.boss
      if (!boss || boss.dead || !boss.active) return
      if (boss.state === 'windup' && last !== 'windup') {
        home ??= { x: boss.x, y: boss.y }
        openSide(ctx.rec, home)
      }
      last = boss.state
    }
  })
  r.play(options.seconds ?? 45, () => false)
  return r
}

/** How the hero dies in `heroDies`: to the boss's dash, to a shot of his, or while his light gathers. */
export type DeathBy = 'dash' | 'shot' | 'light'

/**
 * The hero dies (no `keepAlive`): the session fight on stage `no`, the hero standing in the middle of the arena out
 * of harm until the moment comes (the boss dashing for `dash`, a shot of his just left for `shot`, his light up for
 * `light`), then with one heart left and nothing to protect him; the rows run through the death moment to its
 * outcome. `died` says whether he did, and how (the frame of his `hurt`: the boss's state then, a shot in the air).
 */
export function heroDies(no: number, by: DeathBy, options: { hz?: number; seed?: number } = {}) {
  let armed = false
  let last = ''
  let home: { x: number; y: number } | null = null
  const r = new SessionRecorder(no, {
    seed: options.seed ?? 5,
    hz: options.hz,
    skip: ['stage-start', 'boss-intro'],
    keepAlive: false,
    label: `stage ${no}: the hero dies to the boss's ${by}${atRate(options.hz ?? 60)}`,
    setup: ({ world, rec }) => {
      for (const enemy of world.enemies) enemy.dead = true
      world.player.maxHp = 6
      world.player.hp = 6
      enterArena(rec)
    },
    plan: () => emptyInput(),
    beforeStep: ({ world, rec }) => {
      const p = world.player
      const boss = world.boss
      if (p.dead) return
      if (!armed) p.invuln = 99999
      if (!boss || boss.dead || !boss.active || armed) return
      if (boss.state === 'windup' && last !== 'windup') {
        home ??= { x: boss.x, y: boss.y }
        openSide(rec, home, 120)
      }
      last = boss.state
      const rows = rec.tracks.get('boss')?.rows ?? []
      const lit = rows.length > 0 && rows[rows.length - 1].cue !== null
      const shot = world.shots.some((s) => !s.dead && s.hostile && s.kind !== 'shock')
      const now =
        by === 'dash'
          ? boss.state === 'charge' || boss.state === 'slam'
          : by === 'shot'
            ? shot && rows.some((row) => row.events.includes('boss-shoot'))
            : lit
      if (!now) return
      armed = true
      p.invuln = 0
      p.hp = 1
    }
  })
  r.play(60, () => r.session.outcome !== null)
  return { r, died: r.world.player.dead, outcome: r.session.outcome }
}

/**
 * A brute's charge ends in a wall and stuns him (stages 3, 4, 5): the hero stands out of harm just inside the arena,
 * by its gate, so that the charge at him runs into it.
 */
export function bruteCrashes(no: number, options: { hz?: number; seed?: number; seconds?: number } = {}) {
  const r = new SessionRecorder(no, {
    seed: options.seed ?? 5,
    hz: options.hz,
    skip: true,
    label: `stage ${no}: the brute charges into the wall${atRate(options.hz ?? 60)}`,
    setup: ({ world, rec }) => {
      for (const enemy of world.enemies) enemy.dead = true
      enterArena(rec)
    },
    plan: () => emptyInput(),
    beforeStep: untouchable
  })
  r.play(options.seconds ?? 20, () => false)
  return r
}

/**
 * The boss's entrance played whole (nothing skipped but the stage's start): the hero just inside his arena, or (a
 * boss summoned where the hero stands, as the nest stage's) the boss summoned by hand once the hero stands at the
 * stage's start.
 */
export function bossEntrance(no: number, options: { hz?: number; seed?: number } = {}) {
  const r = new SessionRecorder(no, {
    seed: options.seed ?? 5,
    hz: options.hz,
    skip: ['stage-start'],
    label: `stage ${no}: the boss's entrance${atRate(options.hz ?? 60)}`,
    setup: ({ world, rec }) => {
      for (const enemy of world.enemies) enemy.dead = true
      if (!world.boss?.active) enterArena(rec)
    },
    plan: () => emptyInput(),
    beforeStep: untouchable
  })
  r.play(8, () => false)
  return r
}

/**
 * A tree felled on to the hero: stage 7, the fox awake, the hero stood (by hand) under where the tree in the arena
 * will lie, the tree chopped through by hand; its trunk lands across him and the simulation pushes him out from
 * under it in one step. With `slow` the fox is knocked out by hand as the tree falls, so that it lands in the slow
 * motion of his fall. `pushed`: how far (px) the landing step put the hero; `slowed`: the time scale then.
 */
export function treeFalls(options: { hz?: number; slow?: boolean; seed?: number; at?: 'end' | 'middle' } = {}) {
  let tree: Prop | null = null
  let chopped = -1
  let pushed = 0
  let before = 0
  let slowed = 1
  const r = new SessionRecorder(7, {
    seed: options.seed ?? 5,
    hz: options.hz,
    skip: ['stage-start', 'boss-intro'],
    label: `stage 7: a tree falls on the hero${options.at === 'middle' ? ' (under its middle)' : ''}${options.slow ? " in the slow motion of the fox's fall" : ''}${atRate(options.hz ?? 60)}`,
    setup: ({ world, rec }) => {
      for (const enemy of world.enemies) enemy.dead = true
      enterArena(rec)
    },
    plan: () => emptyInput(),
    beforeStep: (ctx) => {
      untouchable(ctx)
      const { world, rec } = ctx
      const boss = world.boss
      const p = world.player
      if (pushed === 0 && chopped >= 0) {
        const now = p.x + p.w / 2
        if (Math.abs(now - before) > 20) {
          pushed = now - before
          slowed = rec.director.timeScale
        }
        before = now
      }
      if (chopped >= 0 || !boss?.active || rec.director.inputLocked || !p.onGround) return
      tree = world.props.find((prop) => prop.kind === 'tree' && prop.state === 'idle' && prop.x > boss.arenaX) ?? null
      if (!tree) return
      // Under where its trunk will lie, on the floor it stands on: 42 px in from its far end (the simulation slides
      // him out 43 px, a push the interpolation could smear: under `JUMP_PX`), or under its middle (118 px).
      const dir: 1 | -1 = 1
      const base = Math.floor((tree.x + TILE / 2) / TILE)
      p.x = options.at === 'middle' ? tree.x + TILE / 2 + dir * 2 * TILE - p.w / 2 : (base + 4) * TILE - 42
      p.y = tree.y + TILE - p.h
      p.vx = 0
      p.vy = 0
      rec.moved('hero')
      tree.hp = 1
      world.biteProp(tree, dir)
      chopped = rec.steps
      before = p.x + p.w / 2
      if (options.slow) {
        boss.hp = 1
        boss.invuln = 0
        world.damageBoss(1)
      }
    }
  })
  r.play(12, () => false)
  return { r, chopped: chopped >= 0, pushed, slowed }
}

/** The hero's input of a `heroHolds` case, by plan step: [from, to, keys]. */
type HoldScript = [number, number, Partial<InputState>][]
const R_KEY: Partial<InputState> = { right: true }
const L_KEY: Partial<InputState> = { left: true }
const biteKey = (keys: Partial<InputState> = {}): Partial<InputState> => ({ ...keys, bite: true, bitePressed: true })
/**
 * The hero's input around a hold, by name (after the second outside audit of round 6p): his script, the plan step a
 * far goal opens on (the director's `goal-reveal` holds the simulation), and his input after it.
 */
export const HOLD_CASES: Record<string, { script: HoldScript; hold: number; after: [number, Partial<InputState>][] }> =
  {
    run: { script: [[60, 200, R_KEY]], hold: 120, after: [[30, R_KEY]] },
    runAfterL: { script: [[60, 200, R_KEY]], hold: 120, after: [[30, L_KEY]] },
    skid: {
      script: [
        [60, 120, R_KEY],
        [120, 200, L_KEY]
      ],
      hold: 123,
      after: [[30, L_KEY]]
    },
    skidStop: {
      script: [
        [60, 120, R_KEY],
        [120, 123, L_KEY]
      ],
      hold: 123,
      after: [[30, {}]]
    },
    pivot: {
      script: [
        [60, 62, R_KEY],
        [100, 101, L_KEY]
      ],
      hold: 101,
      after: [[30, {}]]
    },
    bite: {
      script: [
        [60, 62, R_KEY],
        [100, 101, biteKey()]
      ],
      hold: 102,
      after: [[30, {}]]
    },
    biteOnHold: {
      script: [
        [60, 62, R_KEY],
        [100, 101, biteKey(L_KEY)]
      ],
      hold: 100,
      after: [[30, {}]]
    },
    biteAfterHold: {
      script: [[60, 62, R_KEY]],
      hold: 100,
      after: [
        [1, biteKey(L_KEY)],
        [30, {}]
      ]
    },
    turnAfterHold: {
      script: [[60, 62, R_KEY]],
      hold: 100,
      after: [
        [1, L_KEY],
        [30, {}]
      ]
    }
  }

/**
 * A hold begun on the hero's command: stage `no` (2 by default) with its enemies gone, his input scripted
 * (`HOLD_CASES`), a far goal opened on a chosen plan step (the director's `goal-reveal` holds the simulation while
 * he is running, braking, pivoting or biting), then his input after it.
 */
export function heroHolds(name: string, options: { hz?: number; no?: number; seed?: number } = {}) {
  const c = HOLD_CASES[name]
  let n = 0
  let holdAt = -1
  let queue: Partial<InputState>[] | null = null
  const r = new SessionRecorder(options.no ?? 2, {
    seed: options.seed ?? 23,
    hz: options.hz,
    skip: ['stage-start'],
    label: `stage ${options.no ?? 2}: a hold begun as the hero does "${name}"${atRate(options.hz ?? 60)}`,
    setup: ({ world }) => {
      for (const enemy of world.enemies) enemy.dead = true
    },
    beforeStep: ({ world }) => {
      const p = world.player
      p.invuln = 0
      if (n - 1 === c.hold && holdAt < 0) {
        holdAt = n - 1
        world.events.push({ type: 'goal-open', x: p.x + 2000, y: p.y } as SimEvent)
      }
    },
    plan: () => {
      const k = n++
      const input = emptyInput()
      if (holdAt >= 0 && k > holdAt && !queue) queue = c.after.flatMap(([count, keys]) => Array(count).fill(keys))
      if (queue) return Object.assign(input, queue.shift() ?? {})
      for (const [from, to, keys] of c.script) if (k >= from && k < to) Object.assign(input, keys)
      return input
    }
  })
  r.play(12, () => n > 260)
  return r
}

/**
 * The same play at another display rate: the hand-made recorder (no director: the simulation runs exactly the same
 * steps at every rate) on stage `no` with the bot's input for `seconds`, and for every simulation step the clip and
 * facing each body was drawn with on the last frame that showed it, by track.
 */
export function drawnBySimStep(no: number, hz: number, seconds = 20, seed = 5) {
  const world = openWorld(no, seed)
  const r = new Recorder(world, `stage ${no}, seed ${seed}: the bot plays${atRate(hz)}`, hz)
  r.run(seconds, () => true)
  const drawn = new Map<string, Map<number, string>>()
  for (const [who, track] of r.tracks) {
    if (track.kind !== 'hero' && track.kind !== 'enemy') continue
    const steps = new Map<number, string>()
    for (const row of track.rows) if (row.steps > 0) steps.set(row.sim, `${row.clip}${row.flip ? '<' : '>'}`)
    drawn.set(who, steps)
  }
  return drawn
}

/** Where two `drawnBySimStep` runs differ: "who: step s: a / b", one line for each body's first difference. */
export function drawnDifferences(a: Map<string, Map<number, string>>, b: Map<string, Map<number, string>>) {
  const out: string[] = []
  for (const [who, steps] of a) {
    const other = b.get(who)
    if (!other) continue
    for (const [sim, what] of steps) {
      const there = other.get(sim)
      if (there !== undefined && there !== what) {
        out.push(`${who}: step ${sim}: ${what} / ${there}`)
        break
      }
    }
  }
  return out
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

/** Whether there is ground exactly (within a pixel) under a body's feet at `x`. */
function standsOn(world: World, x: number, feet: number) {
  const ground = groundBelow(world, x, feet, 2)
  return ground !== null && Math.abs(ground - feet) <= 1
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
 * A boss's dash faces where its body has gone: more than `FACE_NET` px over the last `FACE_SECONDS`, and no more
 * than `DASH_WRONG_SECONDS` of it facing away (walks and runs: `BACKWARDS_PX`).
 */
export const FACE_SECONDS = 8 * STEP
export const FACE_NET = 6
export const DASH_WRONG_SECONDS = 2 * STEP
/** Two turns of the drawn facing closer together than this (real time) are a flicker. */
export const FLICKER_SECONDS = 9 * STEP
/**
 * The picture of a body is never further than `DRAWN_OFFSET` px from the body, and from one frame to the next it
 * moves as the body does, to within `DRAWN_SLEW` px/s of the simulation time the frame shows and `DRAWN_ROUND` px:
 * the view may hold a shaken body still and ease it back, it may not leave the body behind or jump to it.
 */
export const DRAWN_OFFSET = 8
export const DRAWN_SLEW = 180
/** A pixel of rounding between the picture and the body. */
export const DRAWN_ROUND = 1
/**
 * A ground cycle shown this long (s) on a body that stays where it is, is a run on the spot. (The view needs 0.15 s
 * to see that a body has stopped and shows its standing pose 0.15 s later, its `STAND_AFTER`; the stride is frozen
 * meanwhile. Not read from the view: a broken view's copy of it would move the rule with it.)
 */
export const ON_THE_SPOT_SECONDS = 0.35

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

/**
 * The simulation time a frame carried the bodies by (s): its view time, or the steps it showed when they are more
 * (the frame a hit-stop begins on shows a whole step and no view time; at 30 Hz a frame shows two steps; in slow
 * motion a step lands on one frame out of three).
 */
const span = (row: Row) => Math.max(row.viewDt, row.steps * STEP)

/**
 * The body's places on the simulation steps a frame showed (what the view decides on); a driver that does not note
 * them gives the frame's own place for a frame that showed a step.
 */
const stepsOf = (row: Row): readonly number[] => (row.path?.length ? row.path : row.steps > 0 ? [row.body] : [])

/** Whether `b` is the frame after `a` and the body got there by its own motion (not a respawn, not the script's hand). */
const continuous = (a: Row, b: Row) =>
  !b.moved &&
  b.step === a.step + 1 &&
  Math.abs(b.body - a.body) <= Math.max(Math.abs(a.vx), Math.abs(b.vx)) * span(b) + 6

/** The drawn body's speed along the ground from one frame to the next (px/s of simulation time; for the details). */
const moved = (a: Row, b: Row) => (b.x - a.x) / (span(b) || b.dt)

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
    // A single step is the simulation changing its mind (a crash into a wall); longer is seen. (View time: in slow
    // motion one step is shown over several frames.)
    if (fast.length && fast[fast.length - 1].vt - fast[0].vt >= STEP - EPS)
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
        // (View time: the steps of motion the piece covers.)
        if (stretch[stretch.length - 1].vt - stretch[0].vt < CYCLE_CHECK.minSteps * STEP - EPS) continue
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
        // View time: a rat walking through the slow motion of a boss's fall is not standing still.
        still += b.viewDt
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

/** In one go a travelling clip with a stride is never carried further than this (px) against its facing. */
export const BACKWARDS_PX = 8
/** A go against the facing ends once the body has come back this far (px) the way it is drawn facing. */
export const BACKWARDS_END_PX = 2

/**
 * I3: a clip that travels along the ground faces where it goes. A walk, a run, a gallop (a clip with a stride) is
 * never carried more than `BACKWARDS_PX` against the way it is drawn facing in one go: measured on the body, from
 * the frame before it first moves against the facing; a go ends when the body has come back `BACKWARDS_END_PX` the
 * way it faces, when the facing or the clip changes, or where the body did not get there by its own motion (a frame a
 * script moved it, a respawn). (Distance, no clock: the same
 * at every display rate and in slow motion.) A dash, a skim or a leap of a boss has no such allowance: two frames of
 * view time facing away from where it goes over the last `FACE_SECONDS` are a finding.
 */
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
      if (dash) {
        const found = dashBackwards(r, track, stretch)
        if (found) out.push(found)
        continue
      }
      if (!spec.stride) continue
      // Measured on the simulation's steps (the places the view decides on), not on the frames that show them.
      let prev: number | null = null
      let origin: number | null = null
      let originRow: Row | null = null
      let extreme = 0
      let worst = 0
      let worstAt: Row | null = null
      for (let i = 0; i < stretch.length; i++) {
        const b = stretch[i]
        const a = stretch[i - 1]
        if (a && (!continuous(a, b) || b.flip !== a.flip)) {
          origin = null
          prev = null
        }
        const dir = b.flip ? -1 : 1
        const speed = Math.max(Math.abs(a?.vx ?? b.vx), Math.abs(b.vx))
        for (const p of stepsOf(b)) {
          // (Its own motion only: a body put back by the simulation is not walking.)
          if (prev !== null && Math.abs(p - prev) > speed * STEP + 1) {
            origin = null
            prev = p
            continue
          }
          if (prev !== null && origin === null && (p - prev) * dir < -EPS) {
            origin = prev
            originRow = a ?? b
            extreme = p
          }
          if (origin !== null) {
            if ((p - extreme) * dir < 0) extreme = p
            const carried = (origin - extreme) * dir
            if (carried > worst) {
              worst = carried
              worstAt = originRow
            }
            if ((p - extreme) * dir >= BACKWARDS_END_PX) origin = null
          }
          prev = p
        }
      }
      if (worstAt && worst > BACKWARDS_PX + EPS)
        out.push(
          finding(
            'travels backwards',
            r,
            track,
            worstAt,
            `carried ${worst.toFixed(1)} px to the ${side(worstAt.flip ? 1 : -1)} in ${clip} drawn facing ${side(worstAt.flip ? -1 : 1)}`
          )
        )
    }
  }
  return out
}

/** A boss's dash facing away from where it goes, two frames of view time over the last `FACE_SECONDS` of it. */
function dashBackwards(r: Recorder, track: Track, stretch: Row[]): Finding | null {
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
    while (j > from && b.vt - stretch[j].vt < FACE_SECONDS - EPS) j--
    if (b.vt - stretch[j].vt < FACE_SECONDS - EPS) continue
    const net = b.x - stretch[j].x
    if (Math.abs(net) > FACE_NET && b.flip !== net < 0) {
      if (!first) {
        first = b
        speed = net / (b.vt - stretch[j].vt)
      }
      wrong += b.viewDt
    }
  }
  if (!first || wrong < DASH_WRONG_SECONDS - EPS) return null
  return finding(
    'travels backwards',
    r,
    track,
    first,
    `${wrong.toFixed(2)} s facing ${first.flip ? 'left' : 'right'} while dashing at ${speed.toFixed(0)} px/s`
  )
}

const side = (s: number) => (s < 0 ? 'left' : 'right')
/** The shot events: a boss's throw or volley, a squirrel's acorn, a summon (whose gesture starts at its release). */
const SHOT_EVENTS: readonly string[] = ['boss-shoot', 'spit', 'minion']
const leaves = (row: Row) => row.events.some((event) => SHOT_EVENTS.includes(event))

/**
 * I7: a shot that leaves from a pose leaves the way the pose faces. On the frame a boss's shot leaves while he is
 * drawn throwing (`shoot`), the frame is the release and he faces the side the shot flies to (the king's volley is
 * a fan to both sides: his facing is not compared, see `actionsKeepTheirFacing` for his turning). A shot that leaves
 * without a pose (in a dash, a hover) leaves from its light (`shotsAreAnnounced`), not from his facing.
 *
 * The squirrel's acorn leaves from its release frame facing the acorn's way, with one exception: the hero changing
 * sides on the very step of the spit (the frame before faces the other way and shows the lead-in), when it leaves
 * without the pose and no follow-through comes after it.
 */
export function shotsLeaveFromTheirPose(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' && track.kind !== 'enemy') continue
    const rows = track.rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.shot === 0) continue
      if (track.kind === 'boss') {
        if (row.clip !== 'shoot') continue
        const hit = specOf(row)?.hit
        if (hit !== undefined && row.frame !== hit)
          out.push(
            finding(
              'shot leaves off its release frame',
              r,
              track,
              row,
              `frame ${row.frame}, the release is frame ${hit}`
            )
          )
        if (track.bossKind !== 'final' && row.flip !== row.shot < 0)
          out.push(
            finding(
              'shot leaves against its pose',
              r,
              track,
              row,
              `drawn facing ${side(row.flip ? -1 : 1)} on frame ${row.frame}, the shot goes ${side(row.shot)}`
            )
          )
        continue
      }
      const hit = ENEMY_SPEC.spitter.shoot.hit!
      if (row.clip === 'shoot' && row.frame === hit) {
        if (row.flip !== row.shot < 0)
          out.push(
            finding(
              'shot leaves against its pose',
              r,
              track,
              row,
              `drawn facing ${side(row.flip ? -1 : 1)} on its release, the acorn goes ${side(row.shot)}`
            )
          )
        continue
      }
      const before = rows[i - 1]
      const turned =
        before &&
        before.step === row.step - 1 &&
        before.clip === 'shoot' &&
        before.frame < hit &&
        before.flip !== row.shot < 0
      if (!turned) {
        out.push(
          finding(
            'acorn leaves off its release frame',
            r,
            track,
            row,
            `${row.clip} frame ${row.frame} on the step of the spit${row.events.includes('enemy-down') ? ' (knocked out on the same step)' : row.events.includes('enemy-hit') ? ' (bitten on the same step)' : ''}`
          )
        )
        continue
      }
      // It left without its pose: nothing of the throw's follow-through comes after it.
      for (let j = i + 1; j < rows.length && rows[j].step === rows[j - 1].step + 1 && rows[j].clip === 'shoot'; j++)
        if (rows[j].frame > hit) {
          out.push(
            finding(
              'follow-through of an acorn that left without its pose',
              r,
              track,
              rows[j],
              `frame ${rows[j].frame} ${rows[j].step - row.step} frames after the acorn left (the hero crossed on its step)`
            )
          )
          break
        }
    }
  }
  return out
}

/**
 * I7c: a release waits for its shot. In every run of a throw or a cast (`shoot`), the first frame at or past its
 * release frame (`hit`) is the frame its shot leaves on (`boss-shoot`, `spit`): never a display frame earlier, at any
 * display rate, and never without a shot (a follow-through that replays where nothing is thrown, as at the
 * transformation). A summon has no gesture of the boss's (round 6p): every `shoot` run of a boss is a cast and
 * its release has a shot.
 */
export function releasesWaitForTheirShots(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values())
    for (const { rows } of actionRuns(track)) {
      if (rows[0].clip !== 'shoot') continue
      const hit = specOf(rows[0])?.hit
      if (hit === undefined) continue
      const at = rows.find((row) => row.frame >= hit)
      if (!at || leaves(at)) continue
      const all = track.rows
      const from = all.indexOf(at)
      let later = -1
      for (let j = from + 1; j < all.length && j <= from + 60 && all[j].step === all[j - 1].step + 1; j++)
        if (leaves(all[j])) {
          later = j
          break
        }
      const there = `frame ${at.frame} (the release is ${hit})`
      if (later >= 0 && all.slice(from, later).every((row) => row.clip === 'shoot'))
        out.push(
          finding(
            'release shown before its shot',
            r,
            track,
            at,
            `${there} shows ${all[later].step - at.step} frames (${all[later].sim - at.sim} steps) before the shot leaves`
          )
        )
      else
        out.push(
          finding(
            'release without its shot',
            r,
            track,
            at,
            `${there} with no shot${at.events.length ? ` (${at.events.join(', ')})` : ''}${at.state ? `, state ${at.state}` : ''}`
          )
        )
    }
  return out
}

/** The steps of slack at the start of a shot's announcement (the light may begin a step late). */
export const CUE_SLACK_STEPS = 1

/**
 * I7d: every shot of the crow, the fox and the bee is announced. For the `SHOT_CUE_SECONDS` of simulation time
 * before the frame a shot leaves on (counted in simulation steps, not in frames: a hit-stop or a staged moment holds
 * it, slow motion stretches it), every frame of the boss shows the gathering light, its progress never goes down,
 * it is full on the last frame before the shot, and on the frame of the shot itself it is gone (where it is and how it
 * grows: `shotsAreBornFromTheirLight`). (A light that begins with his fight, less than that before his first
 * shot, is held to the frames since he woke.)
 */
export function shotsAreAnnounced(r: Recorder): Finding[] {
  const out: Finding[] = []
  const need = Math.round(SHOT_CUE_SECONDS / STEP)
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' || !THROWN_ART.includes(track.art)) continue
    const rows = track.rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row.events.includes('boss-shoot')) continue
      if (row.cue)
        out.push(
          finding(
            'light outlives its shot',
            r,
            track,
            row,
            `progress ${row.cue.progress.toFixed(2)} on the frame the shot leaves`
          )
        )
      // The frames that show the steps before the shot (back to the previous shot, and while he is awake).
      const window: Row[] = []
      for (let j = i - 1; j >= 0; j--) {
        const a = rows[j]
        if (a.step !== rows[j + 1].step - 1 || a.state === null || a.events.includes('boss-shoot')) break
        if (a.sim < row.sim - need + CUE_SLACK_STEPS) break
        window.unshift(a)
      }
      if (!window.length) continue
      const dark = window.filter((a) => !a.cue)
      if (dark.length) {
        out.push(
          finding(
            'shot is not announced',
            r,
            track,
            row,
            `no light on ${dark.length} of the ${window.length} frames before the shot (from ${row.sim - dark[0].sim} steps before it), drawn ${row.clip} frame ${row.frame} facing ${side(row.flip ? -1 : 1)}, the shot goes ${side(row.shot)}`
          )
        )
        continue
      }
      const fades = window.findIndex((a, k) => k > 0 && a.cue!.progress < window[k - 1].cue!.progress - EPS)
      if (fades > 0)
        out.push(
          finding(
            'light fades before its shot',
            r,
            track,
            window[fades],
            `progress ${window[fades - 1].cue!.progress.toFixed(2)} then ${window[fades].cue!.progress.toFixed(2)}, ${row.sim - window[fades].sim} steps before the shot`
          )
        )
      const last = window[window.length - 1]
      if (last.cue!.progress < 1 - EPS)
        out.push(
          finding(
            'light is not full before its shot',
            r,
            track,
            last,
            `progress ${last.cue!.progress.toFixed(2)} on the frame before the shot`
          )
        )
    }
  }
  return out
}

/**
 * Where a shot was born: its centre `x`, `y` with the `steps` it has flown since (its birth step counted: the
 * simulation moves a shot on the step it is born) taken back at its speed.
 */
export const birthPlace = (x: number, y: number, vx: number, vy: number, steps: number) => ({
  x: x - vx * STEP * steps,
  y: y - vy * STEP * steps
})

/** How far (px) the light may be from his shot's birth place: a pixel, and the hit's jolt while it is on him. */
export const CUE_PLACE_PX = 1
/** The steps of tolerance on the light's progress against the steps left to its shot. */
export const CUE_PROGRESS_STEPS = 2
/** How far (px) a new shot may be drawn from where its light was, besides what both travel in the frame. */
export const BIRTH_PX = 2
/** Half the hero's box (sim.ts), and how far a shot's box reaches past its centre in its first step (px). */
const PLAYER_HALF = { w: 21, h: 23 }
const BIRTH_REACH = 16

/**
 * I7g: a shot is born from its light. The crow's, the fox's and the bee's light is drawn at the place his shot will
 * be born on his drawn body (the centre of its box on its first step; within `CUE_PLACE_PX`, and the hit's jolt
 * while one is on him), on his painted body (within `ON_BODY_PX` of a pixel of the frame he is drawn with), and it
 * grows steadily: on every lit frame its progress is what the steps left to the shot say (`(SHOT_CUE_SECONDS -
 * left) / (SHOT_CUE_SECONDS - a frame)`, as the view counts it, to within `CUE_PROGRESS_STEPS` steps). It has no side
 * (round 6l: it promises a shot, not a side; the simulation's aim is known on the shot's step only). On the frame the shot leaves, every new shot of his is
 * drawn in front of the actors, on his painted body, where the light was on the frame before (give or take what it
 * and he travel in the frame, `BIRTH_PX`, and the jolt the light carried).
 */
export function shotsAreBornFromTheirLight(r: Recorder): Finding[] {
  const out: Finding[] = []
  const hero = new Map((r.tracks.get('hero')?.rows ?? []).map((row) => [row.step, row]))
  const lastStep = Math.ceil(r.frameDt / STEP - 1e-6) * STEP
  const tolerance = (CUE_PROGRESS_STEPS * STEP) / (SHOT_CUE_SECONDS - lastStep)
  const expected = (left: number) =>
    Math.max(0, Math.min(1, (SHOT_CUE_SECONDS - left * STEP) / (SHOT_CUE_SECONDS - lastStep)))
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' || !THROWN_ART.includes(track.art)) continue
    const rows = track.rows
    let placed = false
    let aired = false
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].cue) continue
      let end = i
      while (end + 1 < rows.length && rows[end + 1].cue && rows[end + 1].step === rows[end].step + 1) end++
      const lit = rows.slice(i, end + 1)
      i = end
      const next = rows[end + 1]
      const shotRow = next && next.step === rows[end].step + 1 && next.events.includes('boss-shoot') ? next : undefined
      // Its place, on every lit frame.
      const away = lit.find((row) => !(row.cue!.off <= CUE_PLACE_PX + (row.cue!.jolt ? JOLT_PX : 0) + EPS))
      if (away && !placed) {
        placed = true
        out.push(
          finding(
            'light is not where its shot is born',
            r,
            track,
            away,
            `${away.cue!.off.toFixed(1)} px from the birth place on his drawn body${away.cue!.jolt ? ' (a hit jolts him)' : ''}`
          )
        )
      }
      // On his painted body, on every lit frame.
      const air = lit.find((row) => !row.cue!.onBody)
      if (air && !aired) {
        aired = true
        out.push(
          finding(
            'light in empty air',
            r,
            track,
            air,
            `its centre (${air.cue!.x.toFixed(0)}, ${air.cue!.y.toFixed(0)}) is more than ${ON_BODY_PX} px from any pixel of ${air.clip} frame ${air.frame}`
          )
        )
      }
      if (!shotRow) continue
      // Its progress against the steps left (the shot's step is one of those its frame showed).
      const firstStep = shotRow.sim - Math.max(1, shotRow.steps) + 1
      const off = lit.find((row) => {
        const low = expected(shotRow.sim - row.sim)
        const high = expected(firstStep - row.sim)
        return row.cue!.progress < low - tolerance - EPS || row.cue!.progress > high + tolerance + EPS
      })
      if (off)
        out.push(
          finding(
            'light does not grow with its shot',
            r,
            track,
            off,
            `progress ${off.cue!.progress.toFixed(2)} ${shotRow.sim - off.sim} steps before the shot (${expected(shotRow.sim - off.sim).toFixed(2)} expected)`
          )
        )
      const last = lit[lit.length - 1]
      // The shot itself, on its frame.
      // (A shot born on the hero ends on its first step, before any frame: the simulation drops it on a hero who
      // cannot be hurt just then. Nothing of it is drawn but its burst.)
      const on = hero.get(shotRow.step)
      const struck =
        on !== undefined &&
        Math.abs(on.body - last.cue!.x) <= PLAYER_HALF.w + BIRTH_REACH &&
        last.cue!.y >= on.feet - 2 * PLAYER_HALF.h - BIRTH_REACH &&
        last.cue!.y <= on.feet + BIRTH_REACH
      if (!shotRow.births.length && struck) continue
      if (!shotRow.births.length) {
        out.push(finding('shot is not born from its light', r, track, shotRow, 'no shot of his is drawn on its frame'))
        continue
      }
      const travel = span(shotRow)
      for (const birth of shotRow.births) {
        const reach =
          (Math.abs(birth.vx) + Math.abs(shotRow.vx)) * travel +
          (Math.abs(birth.vy) + Math.abs(shotRow.vy)) * travel +
          BIRTH_PX +
          (last.cue!.jolt ? JOLT_PX : 0)
        const far = Math.hypot(birth.x - last.cue!.x, birth.y - last.cue!.y)
        if (birth.behind || !(far <= reach + EPS)) {
          out.push(
            finding(
              'shot is not born from its light',
              r,
              track,
              shotRow,
              `${birth.behind ? 'drawn behind the actors, ' : ''}${far.toFixed(1)} px from where the light was (${reach.toFixed(1)} allowed)`
            )
          )
          break
        }
        if (!birth.onBody && !aired) {
          aired = true
          out.push(
            finding(
              'light in empty air',
              r,
              track,
              shotRow,
              `his shot is born (its flight taken back) more than ${ON_BODY_PX} px from any pixel of ${shotRow.clip} frame ${shotRow.frame}`
            )
          )
        }
      }
    }
  }
  return out
}

/**
 * I7e: a light keeps its promise. A run of frames with a boss's light ends with his shot (on the frame after its
 * last, or within it), unless he went down; no light shows on a boss that is asleep, and none ever on a boss whose
 * shots are not thrown (the simulation never throws for him).
 */
export function lightsKeepTheirPromise(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss') continue
    const throws = THROWN_ART.includes(track.art) || track.bossKind === 'final'
    const rows = track.rows
    let reported = false
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].cue) continue
      let end = i
      while (end + 1 < rows.length && rows[end + 1].cue && rows[end + 1].step === rows[end].step + 1) end++
      const run = rows.slice(i, end + 1)
      const lit = run[0]
      if (!throws && !reported) {
        reported = true
        out.push(
          finding('light on a boss that never throws', r, track, lit, `${run.length} frames of ${lit.cue!.sheet}`)
        )
      }
      const asleep = run.find((row) => row.state === null)
      if (asleep) out.push(finding('light on a sleeping boss', r, track, asleep, `${lit.cue!.sheet} before he woke`))
      const next = rows[end + 1]
      const kept =
        run.some((row) => row.events.includes('boss-shoot')) ||
        !next ||
        next.step !== rows[end].step + 1 ||
        next.events.includes('boss-shoot')
      if (!kept)
        out.push(
          finding(
            'light without its shot',
            r,
            track,
            next,
            `lit ${run.length} frames to progress ${rows[end].cue!.progress.toFixed(2)}, then gone with no shot: ${next.clip} frame ${next.frame}${next.state ? `, state ${next.state}` : ''}${next.moment ? `, moment ${next.moment}` : ''}`
          )
        )
      i = end
    }
  }
  return out
}

/**
 * I7f: the king gathers before he fires. Before each of his volleys, the frames of that `shoot` state show his
 * `shoot` clip below its release frame, never going back, from its first frame up to the last frame before the
 * release on the frame before the volley. Where a staged moment cut the cast, the gather begins again on its first
 * frame after the moment. And the volley itself leaves from his release frame (he has no light to leave from).
 */
export function kingGathersBeforeHeFires(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' || track.bossKind !== 'final') continue
    const rows = track.rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row.events.includes('boss-shoot')) continue
      let from = i
      while (from > 0 && rows[from - 1].state === 'shoot' && rows[from - 1].step === rows[from].step - 1) from--
      let posedAt = -1
      for (let j = from; j < i; j++) if (rows[j].posed !== null) posedAt = j - from
      const gather = rows.slice(posedAt >= 0 ? from + posedAt + 1 : from, i)
      const hit = SPECS[row.sheet]?.shoot?.hit ?? 0
      // He has no light: his volley leaves from his release, or from nothing at all.
      if (row.clip !== 'shoot' || row.frame < hit)
        out.push(
          finding(
            'volley leaves without its release',
            r,
            track,
            row,
            `${row.clip} frame ${row.frame} on the frame the volley leaves (after ${rows[i - 1].clip} frame ${rows[i - 1].frame})`
          )
        )
      // (A release shown before the volley is `releasesWaitForTheirShots`'s finding; the gather is what came before.)
      while (gather.length > 1 && gather[gather.length - 1].clip === 'shoot' && gather[gather.length - 1].frame >= hit)
        gather.pop()
      const fail = (at: Row, detail: string) =>
        out.push(
          finding(
            'volley without its gather',
            r,
            track,
            at,
            `${detail}${posedAt >= 0 ? ' (after a staged moment)' : ''}`
          )
        )
      if (!gather.length) {
        fail(row, 'no frame of his shoot state before the volley')
        continue
      }
      const wrong = gather.find((a) => a.clip !== 'shoot' || a.frame >= hit)
      if (wrong) {
        fail(wrong, `${wrong.clip} frame ${wrong.frame} ${row.sim - wrong.sim} steps before the volley`)
        continue
      }
      const back = gather.findIndex((a, k) => k > 0 && a.frame < gather[k - 1].frame)
      if (back > 0) {
        fail(gather[back], `frame ${gather[back].frame} after frame ${gather[back - 1].frame}`)
        continue
      }
      // (A gather from the start of the state, or begun again after a moment, starts on its first frame.)
      const first = gather[0]
      if (first.frame !== 0 && (posedAt >= 0 || from > 0)) fail(first, `the gather begins on frame ${first.frame}`)
      else if (gather[gather.length - 1].frame !== hit - 1)
        fail(gather[gather.length - 1], `the gather reaches frame ${gather[gather.length - 1].frame} of ${hit - 1}`)
    }
  }
  return out
}

/**
 * I4d: a landing needs a touchdown. A run of a boss's `land` begins on the frame he comes down: the frame before
 * shows him in the air, or is the first frame of his `slam` on the ground (the step he touches down on), or he is at rest
 * on the ground in his slam (a wall stopped him, a pose holds him: there he shows its squash; carried along it he
 * rolls, round 6r). A landing that begins anywhere else (after a staged pose, on the step of his transformation, after a flinch) is a landing
 * with nothing to land from.
 */
export function landingsNeedATouchdown(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  const rows = track.rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const a = rows[i - 1]
    if (row.clip !== 'land' || a.step !== row.step - 1 || (a.clip === 'land' && a.sheet === row.sheet)) continue
    if (!a.onGround) continue
    // (The frame of a slam's shockwaves is its impact: its landing begins there, whatever a pose had cut.)
    if (row.events.includes('boss-slam')) continue
    const b = rows[i - 2]
    const touchdown = a.state === 'slam' && (!b || b.step !== a.step - 1 || !b.onGround || b.state !== 'slam')
    if (touchdown) continue
    // (Round 6r: a king at rest on the ground in his slam shows its squash, a king still carried along it rolls: the
    // squash before the impact is allowed once his body is at rest there, a wall stopped him or a pose holds him.)
    if (row.state === 'slam' && row.onGround && atRest(rows, i)) continue
    out.push(
      finding(
        'landing without a touchdown',
        r,
        track,
        row,
        `land frame ${row.frame} after ${a.clip} frame ${a.frame}${a.posed ? ` (staged ${a.posed})` : ''} on the ground${row.state ? `, state ${row.state}` : ''}`
      )
    )
  }
  return out
}

/**
 * I4e: a staged moment hands over cleanly. On the first frame after a staged pose on the hero or the boss ends, an
 * action, or a boss's clip timed from his state's start (a wind-up, a recovery, a landing, the king's gather), is on
 * its first frame, whether or not the state is the one it was before the moment (the pose's own clip carrying on
 * is not a new one); and nothing that the pose cut resumes in its middle: the clip drawn before the pose began,
 * if it is an action, a clip that does not loop or a boss's dash or leap (`air`, `attack`, `sweep`), is not drawn
 * again past its first frame.
 */
export function stagedMomentsHandOverCleanly(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'hero' && track.kind !== 'boss') continue
    const actions = ACTIONS[track.kind]
    const rows = track.rows
    let before: Row | null = null
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]
      const b = rows[i]
      if (a.posed === null && b.posed !== null) before = b.step === a.step + 1 ? a : null
      if (a.posed === null || b.posed !== null || b.step !== a.step + 1) continue
      const timed = actions.includes(b.clip) || (track.kind === 'boss' && STATE_TIMED_CLIPS.includes(b.clip))
      const cut =
        before !== null &&
        b.clip === before.clip &&
        b.sheet === before.sheet &&
        (actions.includes(b.clip) ||
          !specOf(b)?.loop ||
          (track.kind === 'boss' && ['air', 'attack', 'sweep'].includes(b.clip)))
      if ((!timed && !cut) || b.frame === 0) continue
      if (b.clip === a.posed && b.clip === a.clip && b.frame >= a.frame) continue
      out.push(
        finding(
          'staged moment hands over in the middle',
          r,
          track,
          b,
          `${b.clip} frame ${b.frame} after the staged ${a.posed}${a.moment ? ` (${a.moment})` : ''}${cut ? `, resuming the ${before!.clip} it cut (frame ${before!.frame})` : ''}${b.state ? `, state ${b.state}` : ''}`
        )
      )
    }
  }
  return out
}

/**
 * I11e: a staged pose stands where it is drawn standing. A posed clip with planted feet (an `idle`, a `rage`, a roar)
 * is shown only on a body that is on the ground, on every frame it shows: held frames too, for a staged moment holds
 * the simulation while the player looks at it (a roar held 120 px up in a leap is the same pose in the air).
 */
export function stagedPosesStandOnTheGround(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'hero' && track.kind !== 'boss') continue
    const row = track.rows.find(
      (row) => row.posed !== null && row.posed === row.clip && planted(row) && !row.onGround && !row.supported
    )
    if (row)
      out.push(
        finding(
          'staged pose in the air',
          r,
          track,
          row,
          `posed ${row.clip} frame ${row.frame} with no ground under it (feet row ${row.feet.toFixed(0)})${row.held ? ', the simulation held' : ''}${row.moment ? ` (${row.moment})` : ''}`
        )
      )
  }
  return out
}

/**
 * I12b: a lead-in follows its aim. A throw's lead-in (a `shoot` run before its release frame) is not shown facing
 * away from where the simulation aims (the hero's side, beyond the aim zone) for more than one display frame (two
 * at rates above 60 Hz, where a frame may still show the step before): it is given up, or begun again facing him.
 * (The king's volley is a fan: not his.)
 */
export function leadInsFollowTheirAim(r: Recorder): Finding[] {
  const out: Finding[] = []
  const allowed = r.hz > 60 ? 2 : 1
  for (const track of r.tracks.values()) {
    if ((track.kind !== 'boss' && track.kind !== 'enemy') || track.bossKind === 'final') continue
    for (const { rows } of actionRuns(track)) {
      if (rows[0].clip !== 'shoot') continue
      const hit = specOf(rows[0])?.hit
      if (hit === undefined) continue
      let away = 0
      for (const row of rows) {
        if (row.frame >= hit) break
        away = !row.aimZone && row.flip !== row.heroDx < 0 ? away + 1 : 0
        if (away > allowed) {
          out.push(
            finding(
              'lead-in faces away from its aim',
              r,
              track,
              row,
              `frame ${row.frame} drawn facing ${side(row.flip ? -1 : 1)} for ${away} frames, the hero ${Math.abs(row.heroDx).toFixed(0)} px to the ${side(row.heroDx)}`
            )
          )
          break
        }
      }
    }
  }
  return out
}

/**
 * Whether the body of row `i` is at rest: the simulation no longer carries it (its speed after the frame's last step no
 * more than `WINDUP_REST_SPEED`; the step a wall stops him on counts).
 */
function atRest(rows: Row[], i: number) {
  return Math.abs(rows[i].vx) <= WINDUP_REST_SPEED + EPS
}

/** Whether the boss's `slam` under way at row `i` had the phase step in it (the simulation restarted its clock). */
function restartedSlam(rows: Row[], i: number) {
  for (let k = i; k >= 0 && rows[k].state === 'slam' && (k === i || rows[k].step === rows[k + 1].step - 1); k--)
    if (rows[k].events.includes('boss-phase')) return true
  return false
}

/** The steps a boss is shown out of his dash (in another clip, his walk too) before the roar may begin. */
export const SEEN_OUT_STEPS = 3
/** A boss's dash clips (a charge, a whirl, a skim; his slam's leap is his `air` in a `slam`). */
const DASH_CLIPS: readonly string[] = ['attack', 'sweep']
/** The clips a boss attacks with, and those an action is still playing in. */
const ATTACK_CLIPS: readonly string[] = ['attack', 'air', 'shoot', 'sweep']
const BUSY_CLIPS: readonly string[] = ['attack', 'air', 'land', 'shoot', 'hurt', 'windup', 'sweep']
const BUSY_STATES: readonly string[] = ['windup', 'charge', 'slam', 'shoot', 'dive']
/** A wind-up this young (s) is still a rest: the roar may begin there (the view's promise, round 6f). */
export const WINDUP_REST_SECONDS = 0.1
/** The steps a boss must have stood on the ground for when his staged rage begins. */
export const GROUNDED_STEPS = 3
/** Below this speed (px/s, on the last step) a boss is at rest for the transformation (the view's constant). */
const WINDUP_REST_SPEED = (actorConstants.WINDUP_REST_SPEED as number | undefined) ?? 30

/**
 * I4f: the transformation begins between his actions. On the first frame of the staged `rage` the king stands on the
 * ground and has stood there for `GROUNDED_STEPS` steps (not on the step he comes down from a fall), his body at
 * rest on the last step (`WINDUP_REST_SPEED`, as the view measures it) unless he is in `idle` (his own walk is not
 * an action: walking at the hero or shaking on top of him he stops, roars and walks on), in none of the states of an
 * attack (charge, leap, gather; a wind-up only if it has been shown for no longer than `WINDUP_REST_SECONDS` and a
 * step of simulation time, counted from the row it began on: the state's clock restarts on the phase step), and the
 * frame before shows none of his actions (a dash, a leap or a wind-up still in its state, a landing, a gather or
 * follow-through, a flinch) unless it had reached its last frame (a wind-up has no such exemption). A plain fall's landing is rest once its impact has
 * shown: the rage may begin from its second frame on (the frame before shows `land` on the ground; never on the
 * touchdown frame, never inside the landing of a slam, which begins on `boss-slam`). The attack that follows the moment begins with its
 * wind-up (a `windup` from its first frame before the first dash, leap or gather of a new state). A pose begun after
 * the view's backstop (`RAGE_WAIT_SECONDS` after the transformation was due) is reported as such: seen, not excused.
 */
export function transformationBeginsBetweenActions(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  const rows = track.rows
  let due: Row | null = rows[0]?.events.includes('boss-phase') ? rows[0] : null
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.events.includes('boss-phase')) due = row
    const a = rows[i - 1]
    if (row.posed !== 'rage' || a.posed === 'rage') continue
    const spec = specOf(a)
    // (A dash, a leap or a wind-up the simulation itself has ended, as a charge stopped by a wall, is over whatever
    // frame its picture was left on: it is busy only while his state still is the attack's. A gather's
    // follow-through, a landing and a flinch play in his recovery: those count on their own frames.)
    // (Round 6p: a dash or a leap is no longer over by its state alone: he must have been seen out of it, below.)
    const ended = a.clip === 'windup' && !BUSY_STATES.includes(a.state ?? '')
    // (The first `WINDUP_REST_SECONDS` of a wind-up are still a rest, counted on the wind-up he has shown: from the
    // row it began on, in simulation time, a step of slack. Not on the state's clock, which the phase step restarts.)
    let w = i - 1
    while (w > 0 && rows[w].clip === 'windup' && rows[w - 1].clip === 'windup' && rows[w - 1].step === rows[w].step - 1)
      w--
    const shown = a.clip === 'windup' ? (row.sim - rows[w].sim) * STEP : 0
    const early = (b: Row) => b.state === 'windup' && shown <= WINDUP_REST_SECONDS + STEP + EPS
    // (A plain fall's landing is rest once its impact has shown: the roar may begin from its second frame on, never
    // on the touchdown frame itself, never inside a slam's landing.)
    let s = i - 1
    while (
      s > 0 &&
      rows[s - 1].clip === 'land' &&
      rows[s - 1].step === rows[s].step - 1 &&
      rows[s - 1].frame <= rows[s].frame
    )
      s--
    const slammed = rows[s].events.includes('boss-slam') || (s > 0 && rows[s - 1].state === 'slam')
    const settling = a.clip === 'land' && a.onGround && row.onGround && !slammed
    // (A wind-up has no last-frame exemption: one shown longer than its first moments is an action to its end.)
    const busy =
      !settling &&
      BUSY_CLIPS.includes(a.clip) &&
      spec !== undefined &&
      (a.frame < spec.frames - 1 || a.clip === 'windup') &&
      !ended &&
      !(a.clip === 'windup' && early(a))
    // He has stood on the ground for `GROUNDED_STEPS` steps (a body that has just come down from a fall is landing).
    let g = i - 1
    let aloft: Row | null = null
    while (g >= 0 && rows[g].sim > row.sim - GROUNDED_STEPS && rows[g].step === rows[g + 1].step - 1) {
      if (!rows[g].onGround) aloft = rows[g]
      g--
    }
    // How fast his body went on the last step before the pose (its places on the steps, as the view measures it).
    const places: number[] = []
    for (let c = i; c >= 0 && places.length < 2; c--) {
      places.unshift(...stepsOf(rows[c]).slice(-(2 - places.length)))
      if (c > 0 && rows[c - 1].step !== rows[c].step - 1) break
    }
    const went = places.length === 2 ? Math.abs(places[1] - places[0]) / STEP : 0
    // Out of a dash or a leap he is seen first: since it (or its crash) he was shown for `SEEN_OUT_STEPS` steps in a
    // clip that is not his dash (his walk counts, as it counts as between actions everywhere else; a hit-stop's
    // frames show no step).
    let dashed: Row | null = null
    let seen = 0
    for (let c = i - 1; c >= 0 && rows[c].step === rows[c + 1].step - 1 && rows[c].posed === null; c--) {
      const b = rows[c]
      if (DASH_CLIPS.includes(b.clip) || (b.clip === 'air' && b.state === 'slam')) {
        dashed = b
        break
      }
      seen += b.steps
      if (seen >= SEEN_OUT_STEPS) break
    }
    const why = [
      dashed &&
        `straight out of his ${dashed.clip} (frame ${dashed.frame}, state ${dashed.state}), seen out of it for ${seen} of ${SEEN_OUT_STEPS} steps`,
      !row.onGround && 'in the air',
      row.onGround &&
        aloft &&
        !settling &&
        `${row.sim - aloft.sim} steps after he was in the air (${aloft.clip} frame ${aloft.frame})`,
      // (His own walk is not an action: in `idle` he stops, roars and walks on, at any speed.)
      row.state !== 'idle' && went > WINDUP_REST_SPEED + EPS && `his body moving at ${went.toFixed(0)} px/s`,
      row.state !== null && BUSY_STATES.includes(row.state) && !early(row) && `in his ${row.state}`,
      busy && `after ${a.clip} frame ${a.frame} of ${(spec?.frames ?? 1) - 1}`
    ].filter(Boolean)
    if (why.length)
      out.push(finding('transformation begins in an action', r, track, row, `the staged rage begins ${why.join(', ')}`))
    if (due && (row.sim - due.sim) * STEP >= RAGE_WAIT_SECONDS - 3 * STEP)
      out.push(
        finding(
          'the backstop was reached',
          r,
          track,
          row,
          `the staged rage begins ${((row.sim - due.sim) * STEP).toFixed(2)} s after the transformation was due`
        )
      )
    due = null
    // After the moment: the next attack begins with its wind-up.
    let end = i
    while (end < rows.length && rows[end].posed === 'rage') end++
    const settled = rows[end]?.state ?? null
    let wound = false
    for (let j = end; j < rows.length && rows[j].step === rows[j - 1].step + 1; j++) {
      const b = rows[j]
      if (b.clip === 'windup' && b.frame === 0) wound = true
      if (b.state !== null && b.state !== settled && BUSY_STATES.includes(b.state) && b.state !== 'windup') {
        if (!wound && ATTACK_CLIPS.includes(b.clip))
          out.push(
            finding(
              'attack after the transformation without its wind-up',
              r,
              track,
              b,
              `${b.clip} frame ${b.frame} (state ${b.state}) with no wind-up since the staged rage`
            )
          )
        break
      }
    }
  }
  return out
}

/**
 * I4g: a slam lands on its impact. The frame its shockwaves leave on (`boss-slam`) shows the first frame of his
 * landing with him on the ground (where a frame shows two steps, as at 30 Hz, the first frame of the landing may be
 * the frame after; a slam that slid him off a ledge falls from its impact).
 */
export function slamsLandOnTheirImpact(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  const rows = track.rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.events.includes('boss-slam')) continue
    const ok = (b: Row | undefined) => b && b.clip === 'land' && b.frame === 0 && b.onGround
    const next = rows[i + 1]
    if (ok(row) || (row.steps >= 2 && next?.step === row.step + 1 && ok(next))) continue
    // (Slid off a ledge in the steps the simulation kept him on the ground in his slam, he falls from the impact.)
    if (!row.onGround && row.clip === 'air') continue
    out.push(
      finding(
        'slam does not land on its impact',
        r,
        track,
        row,
        `${row.clip} frame ${row.frame}${row.onGround ? '' : ' in the air'} on the frame its shockwaves leave`
      )
    )
  }
  return out
}

/**
 * I15: what the simulation holds, the picture holds. Once the stage is over or the hero is down (`world.state` is
 * not `'play'`: the simulation no longer steps), nothing it holds changes: a boss and every enemy keep the clip,
 * the frame and the facing they had, and a boss's light does not change. (The hero's fall or cheer, knocked-out
 * bodies, ハム姫 and the effects play on.)
 */
export function heldWorldsHoldStill(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' && track.kind !== 'enemy') continue
    const rows = track.rows
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]
      const b = rows[i]
      if (!a.over || !b.over || b.step !== a.step + 1) continue
      if (b.clip !== a.clip || b.sheet !== a.sheet || b.frame !== a.frame || b.flip !== a.flip) {
        const what =
          b.flip !== a.flip
            ? `turns to face ${side(b.flip ? -1 : 1)}`
            : `${a.clip} frame ${a.frame} then ${b.clip} frame ${b.frame}`
        out.push(
          finding(
            'held body changes',
            r,
            track,
            b,
            `${what} while the simulation holds him (${(b.t - firstOver(rows, i)).toFixed(2)} s into the end)`
          )
        )
        break
      }
      if (
        (a.cue === null) !== (b.cue === null) ||
        (a.cue && b.cue && Math.abs(b.cue.progress - a.cue.progress) > EPS)
      ) {
        out.push(
          finding(
            'held light changes',
            r,
            track,
            b,
            `progress ${a.cue?.progress.toFixed(2) ?? 'none'} then ${b.cue?.progress.toFixed(2) ?? 'none'} while the simulation holds`
          )
        )
        break
      }
    }
  }
  return out
}
const firstOver = (rows: Row[], i: number) => {
  let j = i
  while (j > 0 && rows[j - 1].over) j--
  return rows[j].t
}

/** The hero's actions whose facing is theirs to keep, and the clips he is never held in through a staged moment. */
const HERO_FACED: readonly string[] = ['bite', 'land', 'skid', 'turn', 'wait']

/**
 * I12c: the hero's actions keep their facing. A bite, a landing, a skid, a pivot (`turn`) or a fidget (`wait`) does
 * not change its drawn facing within a run of it (a new run begins with the clip, or its first frame or its clock
 * again). A
 * bite begins facing the side it bit (the `bite` event's `dir`), and a pivot begins on a frame on which his drawn
 * facing changed (the pivot is the picture of a drawn turn: never shown without one). Nothing compares an action's
 * facing with the simulation's `facing` (round 6g: his drawn facing is held as a walker's is, so a skid, a landing
 * or a fidget begins with the facing he is drawn with). (A staged pose sets its own face: not his.)
 */
export function heroActionsKeepTheirFacing(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('hero')
  if (!track) return out
  const rows = track.rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!HERO_FACED.includes(row.clip) || row.posed) continue
    const a = rows[i - 1]
    // (A skid begun again on its first frame shows frame 0 still: its clock going back says so.)
    const again = a !== undefined && row.clipT < a.clipT - EPS
    const begins =
      !a || a.step !== row.step - 1 || a.clip !== row.clip || row.frame < a.frame || again || a.posed !== null
    if (begins) {
      if (row.moved) continue
      if (row.clip === 'bite') {
        const want = row.bit || (a && a.step === row.step - 1 ? a.bit : 0)
        if (want !== 0 && row.flip !== want < 0)
          out.push(
            finding(
              'hero action faces the wrong way',
              r,
              track,
              row,
              `bite begins facing ${side(row.flip ? -1 : 1)}; it bit ${side(want)}`
            )
          )
      } else if (row.clip === 'turn' && a && a.step === row.step - 1 && a.posed === null && a.flip === row.flip)
        out.push(
          finding(
            'hero action faces the wrong way',
            r,
            track,
            row,
            `turn begins facing ${side(row.flip ? -1 : 1)}, as he was drawn on the frame before: a pivot without a turn`
          )
        )
      continue
    }
    if (row.flip !== a.flip && !row.moved)
      out.push(
        finding(
          'hero action turns round',
          r,
          track,
          row,
          `${row.clip} frame ${row.frame} turns to face ${side(row.flip ? -1 : 1)}`
        )
      )
  }
  return out
}

/**
 * I6b: a knocked-out body keeps the facing it had. An enemy's body is flung away from the hero facing him (the
 * view turns it to the blow, so a body knocked out from behind turns once, on its first frame, and its "flung
 * backwards" is backwards); a boss's body begins facing as he was drawn on his last frame. Neither turns after.
 */
export function bodiesKeepTheirFacing(r: Recorder): Finding[] {
  const out: Finding[] = []
  const boss = r.tracks.get('boss')
  for (const track of r.tracks.values()) {
    if (track.kind !== 'ghost') continue
    const first = track.rows[0]
    if (!first) continue
    const isBoss = boss !== undefined && (first.sheet === boss.art || first.sheet === 'king:raged')
    if (isBoss) {
      const last = [...boss.rows].reverse().find((row) => row.step < first.step)
      if (last && last.flip !== first.flip)
        out.push(
          finding(
            'knocked-out body turns',
            r,
            track,
            first,
            `his body begins facing ${side(first.flip ? -1 : 1)}; he was drawn facing ${side(last.flip ? -1 : 1)}`
          )
        )
    } else if (Math.abs(first.heroDx) > 1 && first.flip !== first.heroDx < 0)
      out.push(
        finding(
          'knocked-out body turns',
          r,
          track,
          first,
          `flung facing ${side(first.flip ? -1 : 1)}, the hero ${Math.abs(first.heroDx).toFixed(0)} px to the ${side(first.heroDx)}`
        )
      )
    const turn = track.rows.find((row, i) => i > 0 && row.flip !== track.rows[i - 1].flip)
    if (turn)
      out.push(finding('knocked-out body turns', r, track, turn, `it turns to face ${side(turn.flip ? -1 : 1)}`))
  }
  return out
}

/**
 * How far over (px) the hero must be before a standing rat or mole turns to him (the view's `FACE_DEAD_ZONE`, as
 * agreed; not read from the view, whose copy a broken view may have changed).
 */
export const FACE_DEAD_ZONE = 12

/**
 * I8b: a standing rat or mole turns to the hero only once he is over its dead zone: a turn while it stands (`idle`
 * before and after) with the hero within `FACE_DEAD_ZONE` px of where the simulation aims from is a turn at its feet
 * that the eye reads as a twitch.
 */
export function standingTurnsNeedTheHero(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' || (track.art !== 'walker' && track.art !== 'tough')) continue
    const rows = track.rows
    const turn = rows.find((b, i) => {
      const a = rows[i - 1]
      if (!a || a.step !== b.step - 1 || a.flip === b.flip || a.clip !== 'idle' || b.clip !== 'idle') return false
      const d = Number.isNaN(b.aimDx) ? b.heroDx : b.aimDx
      return Math.abs(d) <= FACE_DEAD_ZONE + EPS
    })
    if (turn)
      out.push(
        finding(
          'standing turn inside the dead zone',
          r,
          track,
          turn,
          `turns to face ${side(turn.flip ? -1 : 1)} with the hero ${(Number.isNaN(turn.aimDx) ? turn.heroDx : turn.aimDx).toFixed(1)} px away`
        )
      )
  }
  return out
}

/**
 * I4h: through a staged moment the hero stands or hangs. While a moment holds the simulation, the hero on the
 * ground plays out what he shows on real time and then stands: a hurt or a bite that advances through the held
 * frames and ends in `idle` is right; one stuck on a frame of it (or of any action of his) for `STUCK_SECONDS` (a
 * hurt's first frame, a bite's, a landing's middle) is the finding (the hold's own pose that plays it out, posed
 * `hurt` / `bite`, included). A bite or a hurt he showed when the hold began plays on from the frame it had, on
 * real time, every frame of it, to its last, and then he stands (`held action does not play out`). In the air he
 * hangs where he was; slow motion plays his clips slowly and is not a hold.
 */
export function heroStandsThroughMoments(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('hero')
  if (!track) return out
  const rows = track.rows
  let stuck = 0
  for (let i = 0; i < rows.length; i++) {
    const b = rows[i]
    // (A pose of the moment's own, as the hero's fright at the chase's start, is the moment's: not his. The hold's
    // own pose plays a hurt or a bite under way out first, posed as `hurt` / `bite`: that is his, and held to it.)
    // (A hit-stop holds everything, the hero too: not a staged hold.)
    // (Slow motion plays the clips slowly: only a moment that gives them no time at all holds him.)
    const his = b.posed === null || ((b.posed === 'hurt' || b.posed === 'bite') && b.posed === b.clip)
    const held =
      b.moment !== null && b.viewDt === 0 && b.steps === 0 && b.onGround && !b.over && !b.moved && his && !b.frozen
    if (!held) {
      stuck = 0
      continue
    }
    const a = rows[i - 1]
    if ([...HERO_FACED, 'hurt'].includes(b.clip) && a && a.clip === b.clip && a.frame === b.frame) stuck += b.dt
    else stuck = 0
    if (stuck >= STUCK_SECONDS - EPS) {
      out.push(
        finding(
          'hero held in an action through a moment',
          r,
          track,
          b,
          `${b.clip} frame ${b.frame} held for ${stuck.toFixed(2)} s on the ground (${b.moment})`
        )
      )
      return out
    }
  }
  // The lead: a bite or a hurt he showed on the ground when a hold began (on the frame before its moment, or a bite
  // of the moment's own first step) plays on from the frame it had, every frame of it (one frame a display frame at
  // most, never back), to its last, and then he stands (`idle`).
  const holds = (b: Row) =>
    b.moment !== null && b.viewDt === 0 && b.steps === 0 && !b.frozen && !b.over && b.onGround && !b.moved
  for (let i = 1; i < rows.length; i++) {
    if (!holds(rows[i]) || holds(rows[i - 1]) || rows[i].step !== rows[i - 1].step + 1) continue
    let end = i
    while (end + 1 < rows.length && holds(rows[end + 1]) && rows[end + 1].step === rows[end].step + 1) end++
    // (The moment's first frame still shows the step that began it: what he showed is read on the frame before
    // the moment, and a bite of that very step is the lead from its first frame.)
    let from = i
    while (from > 1 && rows[from - 1].moment === rows[i].moment && rows[from - 1].step === rows[from].step - 1) from--
    i = end
    const before = rows[from - 1]
    if (!before || before.over || before.moved) continue
    const bit = rows[from].bit !== 0 && rows[from].onGround && !rows[from].events.includes('hurt')
    const a: Pick<Row, 'clip' | 'frame' | 'sheet'> = bit ? { clip: 'bite', frame: -1, sheet: 'hero' } : before
    if (!bit && !before.onGround) continue
    const spec = SPECS[a.sheet]?.[a.clip]
    if ((a.clip !== 'bite' && a.clip !== 'hurt') || !spec) continue
    let prev: Pick<Row, 'clip' | 'frame'> = a
    let done = a.frame >= spec.frames - 1
    let stood = false
    for (let j = from; j <= end; j++) {
      const c = rows[j]
      let why = ''
      if (!done) {
        if (c.clip !== a.clip)
          why = `${c.clip} frame ${c.frame} after ${a.clip} frame ${prev.frame} of ${spec.frames - 1}`
        else if (c.frame < prev.frame || c.frame > prev.frame + 1)
          why = `${a.clip} frame ${c.frame} after frame ${prev.frame}`
        else done = c.frame >= spec.frames - 1
      } else if (c.clip === 'idle') stood = true
      else if (stood || c.clip !== a.clip || c.frame !== spec.frames - 1)
        why = `${c.clip} frame ${c.frame} after the ${a.clip} played out${stood ? ' and he stood' : ''}`
      if (why) {
        out.push(
          finding(
            'held action does not play out',
            r,
            track,
            c,
            `${why} (${c.moment}; the hold began on ${bit ? 'the step of a bite' : `${a.clip} frame ${a.frame}`})`
          )
        )
        break
      }
      prev = c
    }
  }
  return out
}
/** Longer than this (s of real time) on one frame of an action, through a moment, is being held in it. */
export const STUCK_SECONDS = 0.2

/** A landing inside a wind-up is shown only with this much (s) of the wind-up left after it (the view's design). */
export const WARNING_LEFT_SECONDS = 0.15
/** The heavy bosses, whose falls end in a landing. */
const HEAVY: readonly string[] = ['bearBoss', 'apeBoss', 'king']
/** A fall of at least this many steps in the air, coming down this far (px), is a real fall (not a hop). */
export const REAL_FALL = { steps: 8, px: 16 }

/**
 * I4i: a heavy boss lands. The bear, the ape and the king, coming down from a real fall (`REAL_FALL`: not a hop of a
 * few pixels) in whatever state, show `land` frame 0 on the frame they touch down (or the frame after, where a frame
 * shows two steps), unless an attack begins (a state of one, `BUSY_STATES`) within `FIT_MIN` of simulation time of
 * the touchdown: the view fits a landing to the time before his next attack, and with less than `FIT_MIN` shows
 * none; a charge or a dive under way at the touchdown carries him on with none; and a touchdown inside his wind-up
 * shows one only if `FIT_MIN` of it (or (frames + 1) display frames, where that is more) and `WARNING_LEFT_SECONDS`
 * of warning are left before the dash. (A fitted landing plays every frame, faster: `action is cut short` holds it to its last frame.)
 */
export function heavyFallsLand(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track || !HEAVY.includes(track.art)) return out
  const rows = track.rows
  let from: Row | null = null
  let top = Infinity
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    if (b.step !== a.step + 1 || b.moved || b.posed) {
      from = null
      continue
    }
    if (!a.onGround) {
      from ??= a
      top = Math.min(top, a.feet)
    }
    if (a.onGround || b.onGround === false) {
      if (a.onGround) {
        from = null
        top = Infinity
      }
      continue
    }
    // b touches down after a fall from `from`.
    const real = from && b.sim - from.sim >= REAL_FALL.steps && b.feet - top >= REAL_FALL.px
    const ok = (c: Row | undefined) => c && c.clip === 'land' && c.frame === 0
    // (The view fits a landing to the time before his next attack; with less than `FIT_MIN` of it there is none.)
    const room = Math.round(FIT_MIN / STEP)
    // (A dash under way, a charge or a dive, carries him on: its attack has no time before it.)
    let attack: Row | null = b.state === 'charge' || b.state === 'dive' ? b : null
    for (
      let j = i;
      !attack && j < rows.length && rows[j].sim - b.sim <= room && rows[j].step === rows[j - 1].step + 1;
      j++
    )
      if (BUSY_STATES.includes(rows[j].state ?? '') && rows[j].state !== rows[j - 1].state) {
        attack = rows[j]
        break
      }
    // (A landing inside a wind-up is shown only if `WARNING_LEFT_SECONDS` of warning are left after it.)
    if (!attack && b.state === 'windup') {
      let j = i
      while (j < rows.length && rows[j].state === 'windup' && (j === i || rows[j].step === rows[j - 1].step + 1)) j++
      const dash = rows[j]
      // (A landing too short to show each of its frames on a display frame of its own is not shown either.)
      const least = Math.max(FIT_MIN, ((specOf({ ...b, clip: 'land' })?.frames ?? 1) + 1) * r.frameDt)
      // (The wind-up's end is the attack's beginning, whatever its first frame shows: at 30 Hz one may show a charge
      // and its crash.)
      if (dash && (dash.sim - b.sim) * STEP < least + WARNING_LEFT_SECONDS - EPS) attack = dash
    }
    // (A slam the phase step restarted rolls on to its impact: its squash comes with `boss-slam`.)
    if (b.state === 'slam' && DASH_CLIPS.includes(b.clip) && restartedSlam(rows, i)) attack = b
    if (real && b.state !== null && !attack && !ok(b) && !(b.steps >= 2 && ok(rows[i + 1])))
      out.push(
        finding(
          'heavy fall without its landing',
          r,
          track,
          b,
          `${b.clip} frame ${b.frame} on touchdown after ${b.sim - from!.sim} steps and ${(b.feet - top).toFixed(0)} px in the air (state ${b.state})`
        )
      )
    from = null
    top = Infinity
  }
  return out
}

/**
 * I7h: a flinch does not cover a shot. A boss's flinch (`hurt`) is over before his shot leaves: the frame of a
 * crow's, a fox's or a bee's shot does not show `hurt`, and no flinch begins within the last `FIT_MIN` of simulation
 * time before it (the view fits a flinch to the time before he next acts; with less than `FIT_MIN` left the hit is
 * the white flash and the jolt). A flinch begun earlier may run up to the frame before the shot.
 */
export function flinchesDoNotCoverShots(r: Recorder): Finding[] {
  const out: Finding[] = []
  const last = Math.round(FIT_MIN / STEP)
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' || !THROWN_ART.includes(track.art)) continue
    const rows = track.rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.events.includes('boss-shoot')) continue
      if (row.clip === 'hurt') {
        out.push(finding('flinch covers a shot', r, track, row, `hurt frame ${row.frame} on the frame the shot leaves`))
        continue
      }
      for (let j = i - 1; j > 0 && rows[j].sim >= row.sim - last; j--) {
        const b = rows[j]
        if (b.clip === 'hurt' && rows[j - 1].clip !== 'hurt' && b.sim > row.sim - last) {
          out.push(
            finding(
              'flinch covers a shot',
              r,
              track,
              b,
              `a flinch begins ${row.sim - b.sim} steps before the shot${b.cue ? ', under its light' : ''}`
            )
          )
          break
        }
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
 * in front of him; the crow's, the fox's and the bee's are born in front from their light: `shotsAreBornFromTheirLight`.
 * This is the squirrel's rule.)
 */
export function shotsComeOutFromBehind(r: Recorder): Finding[] {
  const rows = r.shotRows.filter((row) => row.first && row.overlap > 0 && !THROWN_ART.includes(row.who))
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
 * when it fits. A throw's lead-in (no release frame shown yet) may be given up when, and only when, the hero is no
 * longer on the side it faces (on the frame it is given up, or the frame before).
 */
export function actionsPlayOut(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'boss' && track.kind !== 'enemy') continue
    for (const { rows, before, after } of actionRuns(track)) {
      const spec = specOf(rows[0])
      if (!spec || !after) continue
      const last = Math.max(...rows.map((row) => row.frame))
      if (last >= spec.frames - 1) continue
      // The same action again from its start is a new cause (a second hit).
      if (after.clip === rows[0].clip && after.frame === 0) continue
      if (MAY_CUT.includes(after.clip)) continue
      // (A plain fall's landing is rest once its impact has shown: a staged moment may take him over from its second
      // frame on. Not a slam's landing, which begins on its shockwaves.)
      const plain =
        track.kind === 'boss' &&
        rows[0].clip === 'land' &&
        !rows[0].events.includes('boss-slam') &&
        before?.state !== 'slam'
      if (plain && after.posed !== null) continue
      // (A slam's touchdown a step before the phase step shows that one step of `land/0`: the roll the phase step
      // starts cannot be told beforehand.)
      if (
        track.kind === 'boss' &&
        rows[0].clip === 'land' &&
        rows[0].state === 'slam' &&
        (rows.length === 1 || rows.reduce((n, row) => n + row.steps, 0) <= 1) &&
        DASH_CLIPS.includes(after.clip) &&
        after.events.includes('boss-phase')
      )
        continue
      const end = rows[rows.length - 1]
      // (Where a shot leaves, its side is where the simulation saw the hero; the frame's own positions may be
      // interpolated half a step behind it.)
      const away = (row: Row) =>
        row.shot !== 0 ? row.shot !== (end.flip ? -1 : 1) : end.flip ? row.heroDx >= 0 : row.heroDx <= 0
      if (rows[0].clip === 'shoot' && spec.hit !== undefined && last < spec.hit && (away(end) || away(after))) continue
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
 * I8: an enemy, a boss or the hero does not flicker between left and right. (The simulation turns a walker round on every
 * step while a wall or a ledge stands between it and the hero; the view must not draw that.) Two turns within
 * `FLICKER_SECONDS` of real time are a flicker, unless the second is a walk's (a clip with a stride, on the ground)
 * and since the first the body has come `BACKWARDS_PX` or more the way it turns to face, from the furthest it went
 * the other way (it really went there and back); a turn standing, in the air, at the start of a throw or in a fall
 * has the time alone. The turn on a hurt's first frame is the blow's, the hero's on a bite's first frame the bite's:
 * neither is the second turn of a flicker. The hero's staged poses are passed over (their own facing is
 * `heroPosesKeepHim`'s): the frame after one is held against the frame before it, the clock running through.
 */
export function facingDoesNotFlicker(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' && track.kind !== 'boss' && track.kind !== 'hero') continue
    let last: Row | null = null
    let count = 0
    let first: Row | null = null
    // The furthest the body went either way since the last turn, and where it is now: on the simulation's steps (the
    // places the view decides on; at 30 Hz a frame shows every second one).
    let min = Infinity
    let max = -Infinity
    let now = track.rows[0]?.body ?? 0
    const hero = track.kind === 'hero'
    // (The hero: a staged pose is passed over: his facing on the first frame after it is held against the frame
    // before it, and the turns of the time before the moment still count. Not where a script or the end moves him.)
    let a: Row | undefined = track.rows[0]
    for (let i = 1; i < track.rows.length; i++) {
      const b = track.rows[i]
      for (const p of stepsOf(b)) {
        min = Math.min(min, p)
        max = Math.max(max, p)
        now = p
      }
      if (b.step !== track.rows[i - 1].step + 1) {
        a = b
        continue
      }
      if (hero && b.posed !== null) continue
      const before = a
      a = b
      if (!before || before.flip === b.flip || (hero && (b.moved || before.posed !== null))) continue
      // Real (display) time: two turns close together flicker on the screen, held simulation or not.
      // (A hit turns a body to face the blow on its flinch's first frame, and a bite the hero's to the side it bit
      // on its own: that turn is the hit's or the bite's, not a flicker's. The turn back after it is ordinary.)
      const struck =
        (b.clip === 'hurt' && before.clip !== 'hurt') ||
        (hero && b.clip === 'bite' && b.bit !== 0 && (before.clip !== 'bite' || b.clipT < before.clipT - EPS))
      if (last && !struck && b.t - last.t < FLICKER_SECONDS - EPS) {
        const walk = Boolean(specOf(b)?.stride) && b.onGround
        // How far it came back the way it now faces, from the furthest it went the other way, on the step of this
        // frame it went furthest the new way (the step the view may have turned it on).
        const here = stepsOf(b)
        const went = b.flip ? max - Math.min(now, ...here) : Math.max(now, ...here) - min
        if (!walk || went < BACKWARDS_PX - EPS) {
          count++
          first ??= b
        }
      }
      last = b
      // (The turn was decided on one of the steps this frame showed: from there on, every one of them counts.)
      const shown = stepsOf(b)
      min = shown.length ? Math.min(...shown) : now
      max = shown.length ? Math.max(...shown) : now
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
 * the picture moves as the body does, to within what the view's easing allows (`DRAWN_SLEW` px/s of the simulation
 * time the frame shows) and `DRAWN_ROUND` of rounding: a speed, the same at every display rate.
 */
export function pictureStaysWithTheBody(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy' && track.kind !== 'boss') continue
    let far: Row | null = null
    let offset = 0
    let jump: Row | null = null
    let by = 0
    // A hit (or a crash) jolts the drawing by up to `JOLT_PX` for `JOLT_SECONDS` of view time.
    let joltFrom = -Infinity
    for (let i = 0; i < track.rows.length; i++) {
      const row = track.rows[i]
      if (row.events.some((event) => event === 'boss-hit' || event === 'boss-crash' || event === 'enemy-hit'))
        joltFrom = row.vt - row.viewDt
      const jolt = row.vt - joltFrom < JOLT_SECONDS + span(row) + EPS ? JOLT_PX : 0
      const away = Math.abs(row.x - row.body)
      if (away > DRAWN_OFFSET + EPS && away > offset) {
        offset = away
        far = row
      }
      if (i === 0 || !continuous(track.rows[i - 1], row)) continue
      const a = track.rows[i - 1]
      const slip = Math.abs(row.x - a.x - (row.body - a.body))
      // (The view eases a held picture back on view time; a frame that shows two steps may slip by two.)
      if (slip > DRAWN_SLEW * span(row) + DRAWN_ROUND + jolt + EPS && slip > by) {
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
    // View time: the settling is the simulation's, and the time in the air is the body's own fall.
    const start = track.rows[0]?.vt ?? 0
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
          row.vt - start > SETTLE_SECONDS &&
          !(track.kind === 'boss' && row.state === null) &&
          planted(row) === planted(stretch[0])
        if (!counts) {
          air = 0
          from = null
          continue
        }
        from ??= row
        air += row.viewDt
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
    // (A slam whose clock the phase step restarted carries him along the ground rolling, his dash's clip, until its
    // impact: round 6p.)
    if (DASH_CLIPS.includes(b.clip) && restartedSlam(track.rows, i)) continue
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
      // The simulation time the frame carried it by (`span`), a step at least: a frame may show a whole step at once
      // (the frame a hit-stop begins on shows the true positions).
      const dt = Math.max(span(b), STEP)
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
        // View time: how long it walks off its ledge is its own motion.
        air += row.viewDt
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
 * frog's, the rat's and the mole's `air` and a boss's `air` do not show for more than `GROUNDED_SECONDS` while the
 * simulation has the body on the ground (in a pool too: the hero on its floor walks and stands there as on land, so
 * his `swim` there is the finding). (Not on a frame a script moved him.)
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
        // View time: how long it stays on the ground is its own motion.
        ground += row.viewDt
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
 * I12: an action does not turn round. While an enemy's or a boss's action plays (a flinch, a throw, a cast, a
 * landing, the transformation) the picture keeps its facing, on the frame its shot leaves too: a release never
 * turns. The one turn that is not inside an action is a throw still on its first frame turning with its target (a
 * new beginning: frame 0 before and after; a lead-in whose target has gone to the other side is given up or begun
 * again from its first frame). And a throw or a cast begins facing where the simulation aims: the hero's side.
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
        const a = rows[i - 1]
        const b = rows[i]
        if (b.flip === a.flip) continue
        // A throw on its first frame, turning to where its target now is, begins anew (inside the aim zone the
        // simulation, a step ahead of an interpolated frame, may already see him on the new side).
        if (b.clip === 'shoot' && a.frame === 0 && b.frame === 0 && (b.flip === b.heroDx < 0 || b.aimZone)) continue
        out.push(
          finding(
            'action turns round',
            r,
            track,
            b,
            `frame ${b.frame} turns to face ${side(b.flip ? -1 : 1)} (after frame ${a.frame})${leaves(b) ? ' on the frame its shot leaves' : ''}`
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
 * drawn travelling backwards, never leaning back while he slides forwards. (The hero's alone, round 6i: the
 * simulation throws him back; a bitten rat or mole it does not, its walk overwrites the knock on every step, so the
 * enemies are held to the blow's side instead: `enemyHurtsFaceTheBlow`.)
 */
export function hurtFacesTheBlow(r: Recorder): Finding[] {
  const track = r.tracks.get('hero')
  return track ? hurtsOf(r, track) : []
}

/**
 * I13b: an enemy's `hurt` faces the blow. A run of `hurt` that an `enemy-hit` began (on its first frame, or the
 * frame before) begins facing against the hit's `dir` (towards whoever hit it) and keeps that facing to its end.
 */
export function enemyHurtsFaceTheBlow(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy') continue
    const rows = track.rows
    for (let i = 0; i < rows.length; i++) {
      const first = rows[i]
      if (first.clip !== 'hurt') continue
      const a = rows[i - 1]
      const fresh = !a || a.step !== first.step - 1 || a.clip !== 'hurt' || first.frame < a.frame
      if (!fresh) continue
      const dir = first.hitDir || (a && a.step === first.step - 1 ? a.hitDir : 0)
      let end = i
      while (
        end + 1 < rows.length &&
        rows[end + 1].clip === 'hurt' &&
        rows[end + 1].step === rows[end].step + 1 &&
        rows[end + 1].frame >= rows[end].frame
      )
        end++
      if (dir === 0) continue
      // Facing against `dir`: drawn mirrored (facing left) when the blow pushes right.
      const wrong = rows.slice(i, end + 1).find((row) => row.flip !== dir > 0)
      if (wrong)
        out.push(
          finding(
            'hurt turns its back on the blow',
            r,
            track,
            wrong,
            `hurt frame ${wrong.frame} drawn facing ${side(wrong.flip ? -1 : 1)}; the blow came from the ${side(-dir)}`
          )
        )
      i = end
    }
  }
  return out
}

function hurtsOf(r: Recorder, track: Track): Finding[] {
  const out: Finding[] = []
  for (const stretch of stretches(track.rows)) {
    if (stretch[0].clip !== 'hurt') continue
    // Only what the blow itself carries him: a frame on which the simulation puts him somewhere else (a respawn,
    // being pushed out of a wall) is not his travel.
    let net = 0
    let last: Row | null = null
    for (let i = 1; i < stretch.length; i++) {
      // (A staged pose that takes his hurt over sets its own face: what it shows is the moment's, not his.)
      if (stretch[i].posed !== null) break
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

/**
 * The moments that pose the hero in a clip of their own (his stand at the stage's start, his fright at a chase's
 * start, his cheer for ハム姫 and at the clear, his fall): not the standing pose of a hold, which plays out what he does.
 */
export const OWN_POSE_MOMENTS: readonly string[] = ['stage-start', 'chase-start', 'princess-free', 'clear', 'death']
/** The moments that pose the hero facing a named way (ハム姫's rescue, the clear's cheer): they may turn him. */
export const FACING_MOMENTS: readonly string[] = ['princess-free', 'clear']
/** The hero's actions a staged pose covers for good, and the events that begin each of them anew. */
const COVERED: readonly string[] = ['bite', 'hurt', 'land', 'turn']
const CAUSE: Readonly<Record<string, string>> = { bite: 'bite', hurt: 'hurt', land: 'land' }
/** After a pose, the real time (s) over which what it covered must not come back (a skid or a pivot has no event). */
export const COVER_SECONDS = 0.3
/** A stride clip held on one frame this many display frames running while he moves is drawn frozen. */
export const FROZEN_FRAMES = 2

/**
 * I4j: a staged pose keeps the hero. A moment does not turn him: his first posed frame faces as the frame before it
 * (unless the moment poses him facing a named way, `FACING_MOMENTS`), and no posed frame turns (the bite or the hurt
 * it plays out keeps its facing, the standing pose after it keeps his); the first frame after the pose faces as its
 * last posed frame did; and what the pose covered is over for good: a bite, a hurt, a landing or a pivot shown on
 * the frame before the pose does not show again within `COVER_SECONDS` after it, unless its event begins it anew (a
 * pivot has none). (A skid is what his body does: after a pose one may begin when he brakes, round 6p.) After a
 * hold no run is drawn frozen while his body slides the other way: a stride clip on one frame for `FROZEN_FRAMES`
 * display frames running while he moves more than a pixel against its facing is `run frozen after a pose`. (Not where a script moves him by hand.)
 */
export function heroPosesKeepHim(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('hero')
  if (!track) return out
  const rows = track.rows
  const facing = (row: Row) => side(row.flip ? -1 : 1)
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    if (a.posed !== null || b.posed === null || b.step !== a.step + 1) continue
    let end = i
    while (end + 1 < rows.length && rows[end + 1].posed !== null && rows[end + 1].step === rows[end].step + 1) end++
    const run = rows.slice(i, end + 1)
    i = end
    if (a.moved || run.some((row) => row.moved)) continue
    const named = run.some((row) => row.moment !== null && FACING_MOMENTS.includes(row.moment))
    // (A bite on the step the moment begins turns him to the side it bit: that turn is the bite's.)
    const bitten = b.bit !== 0 && b.clip === 'bite' && b.flip === b.bit < 0
    if (!named && !bitten && b.flip !== a.flip)
      out.push(
        finding(
          'staged pose turns the hero',
          r,
          track,
          b,
          `posed ${b.posed} (${b.moment ?? 'no moment'}) drawn facing ${facing(b)}; ${a.clip} frame ${a.frame} on the frame before faced ${facing(a)}`
        )
      )
    else {
      // (A moment that poses him facing a named way may turn him on its first frame, as one pose hands over to it.)
      const turn = run.find(
        (row, k) =>
          k > 0 &&
          row.flip !== run[k - 1].flip &&
          !(row.moment !== null && FACING_MOMENTS.includes(row.moment) && run[k - 1].moment !== row.moment)
      )
      if (turn)
        out.push(
          finding(
            'staged pose turns the hero',
            r,
            track,
            turn,
            `posed ${turn.posed} ${turn.clip} frame ${turn.frame} turns to face ${facing(turn)} inside the pose (${turn.moment ?? 'no moment'})`
          )
        )
    }
    const last = rows[end]
    const after = rows[end + 1]
    if (!after || after.step !== last.step + 1 || after.moved) continue
    if (after.flip !== last.flip)
      out.push(
        finding(
          'hero turns as a pose ends',
          r,
          track,
          after,
          `${after.clip} frame ${after.frame} facing ${facing(after)} on the first frame after the staged ${last.posed} (${last.moment ?? 'no moment'}), which showed him facing ${facing(last)}`
        )
      )
    // A run frozen on one frame while his body goes on (`FROZEN_FRAMES` frames running, within `COVER_SECONDS`).
    {
      let k = end + 1
      while (
        k < rows.length &&
        rows[k].step === rows[k - 1].step + 1 &&
        rows[k].posed === null &&
        rows[k].t - last.t <= COVER_SECONDS + EPS
      ) {
        let n = k
        while (
          n + 1 < rows.length &&
          rows[n + 1].step === rows[n].step + 1 &&
          rows[n + 1].clip === rows[k].clip &&
          rows[n + 1].frame === rows[k].frame &&
          rows[n + 1].posed === null
        )
          n++
        const run = rows.slice(k, n + 1)
        // (Backwards: a frozen stride while he slows down the way he faces is the view's stop, `ON_THE_SPOT_SECONDS`.)
        const went = -(rows[n].x - rows[k].x) * (rows[k].flip ? -1 : 1)
        if (specOf(rows[k])?.stride && run.length >= FROZEN_FRAMES && went > 1 + EPS) {
          out.push(
            finding(
              'run frozen after a pose',
              r,
              track,
              rows[k],
              `${rows[k].clip} frame ${rows[k].frame} for ${run.length} frames facing ${facing(rows[k])} while he slides ${went.toFixed(1)} px ${side(rows[n].x - rows[k].x)}, after the staged ${last.posed} (${last.moment ?? 'no moment'})`
            )
          )
          break
        }
        k = n + 1
      }
    }
    if (!COVERED.includes(a.clip)) continue
    const cause = CAUSE[a.clip]
    for (let j = end + 1; j < rows.length && rows[j].step === rows[j - 1].step + 1 && rows[j].posed === null; j++) {
      const c = rows[j]
      if (c.t - last.t > COVER_SECONDS + EPS || (cause && c.events.includes(cause))) break
      if (c.clip !== a.clip) continue
      out.push(
        finding(
          'what a pose covered comes back',
          r,
          track,
          c,
          `${c.clip} frame ${c.frame}, ${(c.t - last.t).toFixed(2)} s after the staged ${last.posed} (${last.moment ?? 'no moment'}) that covered it (${a.clip} frame ${a.frame} before it)`
        )
      )
      break
    }
  }
  return out
}

/**
 * I4k: a bite the player commands is drawn. The frame that shows the step of the hero's `bite` event shows `bite` on
 * its first frame (where the frame shows two steps, its first or second), facing the side it bit (the event's
 * `dir`), unless a hurt of his begins on that same step (the hurt shows) or a moment that poses him in a clip of
 * its own holds him (`OWN_POSE_MOMENTS`); on the step a hold begins on too (its pose plays the bite out, posed
 * `bite`). (The turn it makes is the bite's: `facingDoesNotFlicker`, `heroPosesKeepHim`.)
 */
export function bitesAreDrawn(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('hero')
  if (!track) return out
  for (const row of track.rows) {
    if (row.bit === 0 || row.moved || row.over || row.events.includes('hurt')) continue
    // (A moment that poses him in a clip of its own holds him; a hold's standing pose does not: the bite of the
    // step it begins on is drawn and plays out under it, posed as `bite`.)
    if (row.posed !== null && row.posed !== 'bite' && row.moment !== null && OWN_POSE_MOMENTS.includes(row.moment))
      continue
    const first = row.frame === 0 || (row.steps >= 2 && row.frame <= 1)
    if (row.clip === 'bite' && first && row.flip === row.bit < 0) continue
    out.push(
      finding(
        'bite is not drawn',
        r,
        track,
        row,
        `${row.clip} frame ${row.frame} facing ${side(row.flip ? -1 : 1)} on the frame of a bite to the ${side(row.bit)}`
      )
    )
  }
  return out
}

/**
 * I13c: a hit shows its flinch. The frame that shows the step of an `enemy-hit` shows that enemy's `hurt` on its
 * first frame (or its second, where the frame shows two steps), unless the view's design makes that hit the white
 * flash only: a squirrel in its throw (`spitterHurtShows` at the hit, as the view asks it: `Row.hitShows`).
 */
export function hitsShowTheirFlinch(r: Recorder): Finding[] {
  const out: Finding[] = []
  for (const track of r.tracks.values()) {
    if (track.kind !== 'enemy') continue
    for (const row of track.rows) {
      if (!row.events.includes('enemy-hit') || !row.hitShows || row.over) continue
      if (row.clip === 'hurt' && (row.frame === 0 || (row.steps >= 2 && row.frame <= 1))) continue
      out.push(
        finding('hit without its flinch', r, track, row, `${row.clip} frame ${row.frame} on the frame of the hit`)
      )
    }
  }
  return out
}

/** The hero's invulnerability flicker: hidden for at most this long (s of real time) at a time (every other 1/20 s). */
export const BLINK_HALF_SECONDS = 1 / 20

/**
 * I15b: the hero is drawn. On a frame the simulation is held (a moment's hold, a hit-stop) he is on the screen; in
 * play the invulnerability flicker hides him for no longer than its own half period (`BLINK_HALF_SECONDS`, and a
 * display frame) at a time. (Not once he is down or the stage is over: the view moves his body itself.)
 */
export function heroIsDrawn(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('hero')
  if (!track) return out
  const rows = track.rows
  let hidden = 0
  let since: Row | null = null
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.drawn || row.moved || row.over) {
      hidden = 0
      since = null
      continue
    }
    if (row.frozen || (row.moment !== null && row.viewDt === 0 && row.steps === 0)) {
      out.push(
        finding(
          'hero not drawn',
          r,
          track,
          row,
          `hidden on a frame the simulation is held (${row.frozen ? 'a hit-stop' : row.moment}), ${row.clip} frame ${row.frame}`
        )
      )
      return out
    }
    if (i > 0 && rows[i - 1].step !== row.step - 1) hidden = 0
    since ??= row
    hidden += row.dt
    if (hidden > BLINK_HALF_SECONDS + r.frameDt + EPS) {
      out.push(
        finding('hero not drawn', r, track, since, `hidden for ${hidden.toFixed(3)} s on end in play (${since.clip})`)
      )
      return out
    }
  }
  return out
}

/** How far (px) a heavy boss's landing may carry him outside a slam's recovery (a slam's landing slides as far). */
export const LAND_SLIDE_PX = 20

/**
 * I1c: a landing does not skate. A heavy boss's (the bear's, the ape's, the king's) `land` carries his drawn body,
 * up to a slam's impact (`boss-slam`: after it the slam's landing slides), no further than
 * `LAND_SLIDE_PX` from where it began, or the ground his speed covers in (frames + 1) display frames where that is
 * more (every frame of it shows on a display frame of its own: at 30 Hz that is more ground) or in `FIT_MIN` (no clip
 * is squeezed below it: the raged king at 244 px/s covers 24 px in it), and a step of his
 * travel (the view fits the landing to that ground in whole steps): dropped off a ledge in his walk he takes the
 * impact and walks on.
 */
export function landingsDoNotSkate(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track || !HEAVY.includes(track.art)) return out
  for (const stretch of stretches(track.rows)) {
    const first = stretch[0]
    if (first.clip !== 'land' || stretch.some((row) => row.moved || row.posed !== null)) continue
    const before = track.rows[track.rows.indexOf(first) - 1]
    // (After a slam's impact its landing slides: from `boss-slam` on it is not measured. Before it, a squash
    // carried along the ground in his slam is: the squash shows on the impact's step, not before.)
    if (first.events.includes('boss-slam')) continue
    const impact = stretch.findIndex((row) => row.events.includes('boss-slam'))
    const slammed = before?.state === 'slam' || first.state === 'slam'
    if (slammed && impact < 0 && stretch.length <= 1) continue
    const measured = impact >= 0 ? stretch.slice(0, impact + 1) : stretch
    const far = measured.reduce((m, row) => Math.max(m, Math.abs(row.x - first.x)), 0)
    // (Every frame of it is shown on a display frame of its own: at a slow display that takes the ground his speed
    // covers in (frames + 1) display frames, if that is more; and no clip is squeezed below `FIT_MIN`. Its time is counted in whole steps: the step that ends
    // it may carry him a step's travel past.)
    const speed = Math.max(...stretch.map((row) => Math.abs(row.vx)))
    const frames = specOf(first)?.frames ?? 1
    const bound = Math.max(LAND_SLIDE_PX, speed * FIT_MIN, speed * (frames + 1) * r.frameDt) + speed * STEP
    if (far > bound + EPS)
      out.push(
        finding(
          'landing skates',
          r,
          track,
          stretch[stretch.length - 1],
          `${far.toFixed(0)} px over ${stretch.length} frames of his landing (${bound.toFixed(0)} allowed; state ${first.state})`
        )
      )
  }
  return out
}

/**
 * I5b: a dash is one picture. Within one dash of a boss and its slide (a run of his rows in the state of the dash and
 * then his recovery or his stun, on consecutive frames), once his dash clip has shown, no other clip takes its place and gives it back (no `attack`, `air`,
 * `attack`): a flinch excepted (a hit shows its `hurt` and the dash goes on).
 */
export function dashesStayWhole(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  const rows = track.rows
  for (let i = 0; i < rows.length; i++) {
    if (!DASH_CLIPS.includes(rows[i].clip) || rows[i].state === null) continue
    const state = rows[i].state
    let gap: Row | null = null
    let j = i + 1
    for (
      ;
      j < rows.length &&
      rows[j].step === rows[j - 1].step + 1 &&
      (rows[j].state === state || SLIDE_STATES.includes(rows[j].state ?? '')) &&
      rows[j].posed === null;
      j++
    ) {
      const b = rows[j]
      if (b.clip === rows[i].clip) {
        if (gap) {
          out.push(
            finding(
              'dash taken up again',
              r,
              track,
              b,
              `${b.clip} frame ${b.frame} again after ${gap.clip} frame ${gap.frame} in one ${state}`
            )
          )
          break
        }
      } else if (b.clip !== 'hurt') gap ??= b
    }
    i = j - 1
  }
  return out
}

/** The states a dash slides on in (his recovery, his stun). */
const SLIDE_STATES: readonly string[] = ['recover', 'stunned']

/** A dash is warned by a wind-up shown for at least this long (s of simulation time) before it. */
export const WARNING_SECONDS = 0.1
/** The states of a boss's dash or leap, which his wind-up warns of. */
const DASH_STATES: readonly string[] = ['charge', 'slam', 'dive']

/**
 * I5c: a dash is always preceded by its warning. On the frame before a boss's dash or leap begins (his state turning
 * from `windup` to `charge`, `slam` or `dive`) he shows a frame of his `windup` clip's sustained tail (any of its
 * last `sustain` frames, which tremble in turn until the dash; for a clip with no tail its last frame), and that
 * clip was on
 * the screen for at least `WARNING_SECONDS` of simulation time before the dash. The exceptions the simulation
 * forces: a staged moment in between (the wind-up begins again after it) and the phase step (the simulation
 * restarts his wind-up there), from which the time is counted; and a wind-up whose state he spent partly in the air
 * (fallen off a ledge, the simulation running its clock while he fell: the warning is what is left after the
 * touchdown); nothing else.
 */
export function dashesAreWarned(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  const rows = track.rows
  for (let i = 1; i < rows.length; i++) {
    const b = rows[i]
    const a = rows[i - 1]
    if (b.step !== a.step + 1 || !DASH_STATES.includes(b.state ?? '') || a.state !== 'windup' || a.moved || b.moved)
      continue
    const spec = specOf({ ...a, clip: 'windup' })
    if (!spec) continue
    let w = i - 1
    while (
      w > 0 &&
      rows[w - 1].step === rows[w].step - 1 &&
      rows[w - 1].clip === 'windup' &&
      rows[w - 1].posed === null &&
      !rows[w].events.includes('boss-phase')
    )
      w--
    const shown = a.clip === 'windup' ? (b.sim - rows[w].sim) * STEP : 0
    // (A wind-up with a sustained tail trembles between its last `sustain` frames until the dash: any of them is its
    // "now"; with no tail, its last frame.)
    const last = a.clip === 'windup' && a.frame >= spec.frames - Math.max(1, spec.sustain ?? 0)
    // (A wind-up the simulation ran partly while he fell off a ledge: its warning is what is left after the
    // touchdown. Where that leaves time for every frame of the clip on a display frame of its own, it is fitted to it
    // and ends on its tail; with less, it shows what it can.)
    let touchdown: Row | null = null
    for (
      let k = i - 1;
      k >= 0 && rows[k].state === 'windup' && (k === i - 1 || rows[k].step === rows[k + 1].step - 1);
      k--
    )
      if (!rows[k].onGround) {
        touchdown = rows[k + 1]
        break
      }
    if (touchdown) {
      const left = (b.sim - touchdown.sim) * STEP
      if (last || left < spec.frames * Math.max(r.frameDt, STEP) - EPS) continue
    } else if (last && shown >= WARNING_SECONDS - STEP - EPS) continue
    out.push(
      finding(
        'dash without its warning',
        r,
        track,
        b,
        `${b.clip} frame ${b.frame} (${b.state}) after ${a.clip} frame ${a.frame}${a.clip === 'windup' ? ` of ${spec.frames - 1}, its wind-up shown ${shown.toFixed(2)} s` : ''}`
      )
    )
  }
  return out
}

/** The transformation's staging (the view's constants, read defensively). */
const stagingConstants = viewStaging as unknown as Record<string, unknown>
const SPOT_RISE = (stagingConstants.RAGE_SPOT_RISE as number | undefined) ?? 56
const PAN_SECONDS = (stagingConstants.RAGE_PAN_SECONDS as number | undefined) ?? 0.2
/** (Round 6p: the king stays framed to the moment's last frame; a view that still pans home inside it says so.) */
const HOME_SECONDS = (stagingConstants.RAGE_HOME_SECONDS as number | undefined) ?? 0
/** How far (px, on the screen) the spot's centre may be from its point on the king; how soon (s) it is fully up. */
export const SPOT_PX = 3
export const SPOT_UP_SECONDS = 0.35
/** Below this the spotlight is down. */
export const SPOT_DOWN = 0.1

/**
 * I4l: the transformation is seen. In a session, through the staged `boss-phase` the spotlight is on the king (its
 * centre within `SPOT_PX` on the screen of the point `RAGE_SPOT_RISE` above his feet under his drawn body) while it
 * is up, fully up within `SPOT_UP_SECONDS` of the moment's first frame; it is down (`SPOT_DOWN`) on every frame the
 * simulation runs; and from `RAGE_PAN_SECONDS` into the moment until `RAGE_HOME_SECONDS` before its end his whole
 * drawn frame is inside the view.
 */
export function transformationIsSeen(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('boss')
  if (!track) return out
  const rows = track.rows.filter((row) => !Number.isNaN(row.spot))
  const running = rows.find((row) => row.steps > 0 && row.spot >= SPOT_DOWN - EPS)
  if (running)
    out.push(
      finding(
        'spotlight on a running fight',
        r,
        track,
        running,
        `the spotlight at ${running.spot.toFixed(2)} on a frame the simulation runs (${running.moment ?? 'no moment'})`
      )
    )
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].moment !== 'boss-phase' || (i > 0 && rows[i - 1].moment === 'boss-phase')) continue
    let end = i
    while (end + 1 < rows.length && rows[end + 1].moment === 'boss-phase') end++
    const run = rows.slice(i, end + 1)
    i = end
    const t0 = run[0].t
    const t1 = run[run.length - 1].t
    const off = run.find(
      (row) =>
        row.spot > SPOT_DOWN &&
        (Math.abs(row.spotX - (row.x - row.camX)) > SPOT_PX + EPS ||
          Math.abs(row.spotY - (row.feet - SPOT_RISE - row.camY)) > SPOT_PX + EPS)
    )
    if (off)
      out.push(
        finding(
          'spotlight is not on the king',
          r,
          track,
          off,
          `its centre (${off.spotX.toFixed(0)}, ${off.spotY.toFixed(0)}) on the screen; his point is (${(off.x - off.camX).toFixed(0)}, ${(off.feet - SPOT_RISE - off.camY).toFixed(0)})`
        )
      )
    const up = run.find((row) => row.spot >= 1 - 1e-3)
    if (!up || up.t - t0 > SPOT_UP_SECONDS + r.frameDt + EPS)
      out.push(
        finding(
          'spotlight is slow',
          r,
          track,
          up ?? run[run.length - 1],
          up
            ? `fully up ${(up.t - t0).toFixed(2)} s into the moment`
            : `never fully up (at most ${Math.max(...run.map((row) => row.spot)).toFixed(2)})`
        )
      )
    const out1 = run.find(
      (row) =>
        row.t - t0 >= PAN_SECONDS - EPS &&
        t1 - row.t >= HOME_SECONDS + EPS &&
        row.box !== null &&
        (row.box.x < row.camX - EPS ||
          row.box.y < row.camY - EPS ||
          row.box.x + row.box.w > row.camX + VIEW_W + EPS ||
          row.box.y + row.box.h > row.camY + VIEW_H + EPS)
    )
    if (out1)
      out.push(
        finding(
          'king out of the view while he transforms',
          r,
          track,
          out1,
          `his drawn frame (${out1.box!.x.toFixed(0)}..${(out1.box!.x + out1.box!.w).toFixed(0)}, ${out1.box!.y.toFixed(0)}..${(out1.box!.y + out1.box!.h).toFixed(0)}) against the view (${out1.camX.toFixed(0)}..${(out1.camX + VIEW_W).toFixed(0)}, ${out1.camY.toFixed(0)}..${(out1.camY + VIEW_H).toFixed(0)}), ${(out1.t - t0).toFixed(2)} s in`
        )
      )
  }
  return out
}

/**
 * How far (px) past what his speeds carry in a step a move of the hero is still his own: the view's slack (2 px) and
 * 2 px more, since a frame that shows two steps gives the audit its speeds after them, not the ones between.
 */
export const PUSH_PX = 4

/**
 * I10b: a push is drawn at once. A move of the hero's body in a step that his speed (after the step or before it)
 * cannot carry, by more than `PUSH_PX` (a falling tree sliding him out from under its trunk, a stage's shove), is
 * not interpolated: on the first frame that shows the step he is drawn where the simulation put him (to a pixel).
 * (Not where a script moves him by hand, nor through a staged pose, nor at the end: those set his place.)
 */
export function pushesShowAtOnce(r: Recorder): Finding[] {
  const out: Finding[] = []
  const track = r.tracks.get('hero')
  if (!track) return out
  const rows = track.rows
  let truth = rows[0]?.body ?? 0
  let was = rows[0]?.vx ?? 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const places = stepsOf(row)
    if (!places.length) continue
    const before = places.length >= 2 ? places[places.length - 2] : truth
    const to = places[places.length - 1]
    const d = to - before
    const carried = Math.max(Math.abs(row.vx), Math.abs(was)) * STEP + PUSH_PX
    truth = to
    was = row.vx
    if (row.moved || rows[i - 1].moved || row.posed !== null || row.over || Math.abs(d) <= carried + EPS) continue
    if (Math.abs(row.x - to) > 1 + EPS) {
      out.push(
        finding(
          'push is drawn as a glide',
          r,
          track,
          row,
          `pushed ${d.toFixed(0)} px in a step (his speeds carry ${carried.toFixed(1)}); drawn ${(row.x - to).toFixed(1)} px from where he was put`
        )
      )
      return out
    }
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
  releasesWaitForTheirShots,
  shotsAreAnnounced,
  shotsAreBornFromTheirLight,
  lightsKeepTheirPromise,
  flinchesDoNotCoverShots,
  kingGathersBeforeHeFires,
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
  landingsNeedATouchdown,
  stagedMomentsHandOverCleanly,
  stagedPosesStandOnTheGround,
  transformationBeginsBetweenActions,
  slamsLandOnTheirImpact,
  heldWorldsHoldStill,
  heroStandsThroughMoments,
  heavyFallsLand,
  actionsKeepTheirFacing,
  heroActionsKeepTheirFacing,
  bodiesKeepTheirFacing,
  standingTurnsNeedTheHero,
  leadInsFollowTheirAim,
  hurtFacesTheBlow,
  enemyHurtsFaceTheBlow,
  pushesShowAtOnce,
  heroPosesKeepHim,
  bitesAreDrawn,
  hitsShowTheirFlinch,
  heroIsDrawn,
  landingsDoNotSkate,
  transformationIsSeen,
  dashesStayWhole,
  dashesAreWarned
] as const

/** The checks that read the frames after the stage is over or the hero is down (the others see play only). */
const OVER_CHECKS: ReadonlySet<(r: Recorder) => Finding[]> = new Set([heldWorldsHoldStill, everyClipExists])

/**
 * The rows of play: a recorder whose boss, enemy and piglet tracks end where the stage ended or the hero went down
 * (the hero's own rows, and the knocked-out bodies, are kept: they play on there).
 */
export function inPlay(r: Recorder): Recorder {
  const tracks = new Map<string, Track>()
  for (const [who, track] of r.tracks)
    tracks.set(
      who,
      track.kind === 'hero' || track.kind === 'ghost'
        ? track
        : { ...track, rows: track.rows.filter((row) => !row.over) }
    )
  return Object.assign(Object.create(Object.getPrototypeOf(r) as object) as Recorder, r, { tracks })
}

export const audit = (r: Recorder): Finding[] => {
  const play = inPlay(r)
  return CHECKS.flatMap((check) => check(OVER_CHECKS.has(check) ? r : play))
}

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
