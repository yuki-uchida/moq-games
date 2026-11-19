/**
 * PlaySession: one stage being played. Owns the World, its StageView, the Director and the sound board; steps the
 * simulation at a fixed rate (unless the view is frozen for hit-stop or staging holds it), feeds every event to
 * the view, the sound map and the director, and reports the outcome.
 *
 * The steps follow the display (`Pacer`), and the picture is drawn between the last two simulation states
 * (`Interpolator`): the positions are the interpolated ones only while a frame is being updated and drawn.
 *
 * A session can also be the title screen's demo (`demo: true`): the bot plays, nothing sounds, the HUD is left
 * alone, and a plain director ends it after a while so the app can start the next one.
 *
 * The step in which a boss falls also lowers his gate and opens the goal. The view, the sounds and the director
 * answer the fall in its frame, and the gate and the goal in the two frames after it (`AFTER_A_FALL`): the
 * simulation stands still through them anyway (the fall's hit-stop), and the frame of the fall is the fullest of a
 * stage.
 */
import type { GameAudio } from '../audio/api'
import { botInput, type BotMemory } from '../game/bot'
import type { SimEvent, SimEventType } from '../game/events'
import type { Input } from '../game/input'
import { World, emptyInput } from '../game/sim'
import type { StageDef } from '../game/types'
import type { Hud, HudApi } from '../ui/hud'
import { VIEW_W } from '../art/contract'
import { StageDirector, type Director, type DirectorHost, type Outcome } from '../view/director'
import type { Renderer } from '../view/renderer'
import { SILENT_AUDIO, SoundBoard } from '../view/sound-map'
import { StageView } from '../view/stage-view'
import { Interpolator } from './interpolate'
import { Pacer, STEP } from './pacer'

export { STEP }
/** A demo that neither clears nor dies moves on after this many seconds. */
export const DEMO_SECONDS = 40

/**
 * The events of a boss's fall that are answered after its frame, one display frame each, in the order they came:
 * his gate going down and the goal opening. Each is particles, a sound and a staged moment of its own, and none of
 * them changes what the fall's own frame shows.
 */
export const AFTER_A_FALL: ReadonlySet<SimEventType> = new Set<SimEventType>(['gate-down', 'goal-open'])

/**
 * The events in whose frame the HUD writes nothing (`Hud.rest`): a boss's fall and the hero's. What the HUD shows of
 * them (the last heart, the boss's bar breaking away, its pieces stepping aside for the staged moment) is written
 * in the frame after, when the picture already stands still.
 */
export const RESTS_THE_HUD: ReadonlySet<SimEventType> = new Set<SimEventType>(['boss-down', 'dead'])

/** Asks a HUD to let the frame pass; one that cannot (a stand-in without `rest`) writes in the frame, as before. */
const rest = (hud: { rest?: () => void }) => hud.rest?.()

/**
 * The events that are always a judgement of damage: the hero is hurt or falls, an enemy or a boss is hit or falls,
 * a boss crashes into a wall, a rock breaks. (A bite is one when it landed on something: see `judges`.)
 */
export const JUDGEMENTS: ReadonlySet<SimEventType> = new Set<SimEventType>([
  'hurt',
  'dead',
  'enemy-hit',
  'enemy-down',
  'boss-hit',
  'boss-crash',
  'boss-down',
  'rock-break'
])

/**
 * True for an event that judges damage: one of `JUDGEMENTS`, or a bite that landed (on an enemy, a boss, a tree, a
 * rock, the ground). The session counts them, and the check on the device in hand counts the long waits right
 * after them (`perf-readout.ts`).
 */
export const judges = (event: SimEvent) => JUDGEMENTS.has(event.type) || (event.type === 'bite' && event.hit)

export interface PlayDeps {
  renderer: Renderer
  hud: Hud
  audio: GameAudio
  input: Input
  reducedMotion: boolean
}

export type DirectorFactory = (host: DirectorHost) => Director

export interface PlayOptions {
  /** The title screen's demo: the bot plays, silently, without the HUD. */
  demo?: boolean
  makeDirector?: DirectorFactory
}

const SILENT_HUD: HudApi = {
  showBanner() {},
  showToast() {},
  showCall() {},
  showNameplate() {},
  showBoss() {},
  hideBoss() {},
  cinematic() {},
  speak: () => false,
  lights() {}
}

/** The director of a demo: no staging, and an outcome once the bot clears, dies or runs out of time. */
export class DemoDirector implements Director {
  readonly timeScale = 1
  readonly inputLocked = false
  outcome: Outcome | null = null
  private time = 0
  private endTimer = 0

  constructor(private host: DirectorHost) {}

  start() {}

  handle() {}

  update(dt: number) {
    if (this.outcome) return
    const { world } = this.host
    this.time += dt
    if (world.state === 'clear' || world.state === 'dead') {
      this.endTimer += dt
      if (this.endTimer > 1.2) this.outcome = world.state
    } else if (this.time > DEMO_SECONDS) this.outcome = 'dead'
  }
}

export class PlaySession {
  readonly world: World
  readonly view: StageView
  readonly director: Director
  readonly demo: boolean
  /** How many hits the hero has taken. */
  damage = 0
  /** How many judgements of damage have been answered (`judges`): the hero's hurts and the hits he deals. */
  judged = 0
  /** The bot plays instead of the player, with sound and the HUD as in real play (performance checks). */
  autopilot = false
  /** Where between the last two simulation states the frame's picture is: 1 shows the current state. */
  alpha = 1
  /** The simulation time the last frame showed (see `frame`). */
  private shownTime: number | null = null
  private sounds: SoundBoard
  private pacer = new Pacer()
  private mover = new Interpolator()
  private bot: BotMemory = { x: 0, stuck: 0, reverse: 0 }
  /** The events of a boss's fall that are still to be answered (see `AFTER_A_FALL`). */
  private later: SimEvent[] = []

  constructor(
    readonly stage: StageDef,
    private deps: PlayDeps,
    options: PlayOptions = {}
  ) {
    this.demo = Boolean(options.demo)
    this.world = new World(stage, { seed: stage.no * 7919 + 101 })
    this.sounds = new SoundBoard(this.demo ? SILENT_AUDIO : deps.audio, { music: !this.demo })
    this.view = new StageView(this.world, deps.renderer, {
      reducedMotion: deps.reducedMotion,
      onFootstep: () => this.sounds.cue('footstep')
    })
    const makeDirector =
      options.makeDirector ??
      ((host: DirectorHost) => (this.demo ? new DemoDirector(host) : new StageDirector(host, this.deps.input)))
    this.director = makeDirector({
      world: this.world,
      stage,
      hud: this.demo ? SILENT_HUD : deps.hud,
      view: this.view,
      camera: this.view.camera,
      overlay: this.view.overlay,
      sound: this.sounds,
      reducedMotion: deps.reducedMotion
    })
  }

  start() {
    const { hud, audio, input } = this.deps
    this.director.start()
    if (this.demo) return
    input.consumePresses()
    hud.show()
    hud.setStage(this.stage)
    hud.settle(this.world)
    audio.unlock()
    this.sounds.start(this.world)
  }

  get outcome(): Outcome | null {
    return this.director.outcome
  }

  /** One display frame of `dt` real seconds. */
  frame(dt: number) {
    const { view, director, world, pacer, mover } = this
    mover.restore()
    view.beginFrame()
    // What came with a boss's fall, one event a frame (before this frame's steps: the order of the events holds).
    if (this.later.length) this.answer(this.later.shift()!)
    const scale = view.frozen ? 0 : Math.max(0, director.timeScale)
    pacer.begin(dt, scale)
    if (scale > 0) {
      // (A moment that holds the simulation, begun on a step, runs no further step in this frame.)
      while (pacer.due() && !view.frozen && director.timeScale > 0) {
        mover.remember(world)
        const locked = director.inputLocked
        if (this.demo || this.autopilot) world.step(STEP, locked ? emptyInput() : botInput(world, this.bot))
        else {
          world.step(STEP, locked ? emptyInput() : this.deps.input.poll())
          if (!locked) this.deps.input.consumePresses()
        }
        pacer.stepped()
        this.drain()
        // What the bodies do is decided on the step, from the simulation's own positions.
        view.simStep()
        director.simStep?.()
      }
      if (pacer.steps > 0) mover.settle()
    }
    const alpha = pacer.finish(view.frozen || scale <= 0)
    this.alpha = alpha
    if (alpha < 1) mover.apply(alpha)
    // The bodies' clocks run on the simulation time this frame put on the screen (its steps and the change of the
    // interpolation between them), whatever the frame's real length, a hit-stop or a hold beginning in it.
    // (A frame that began held, by a hit-stop or a moment, shows no time passing: the picture it shows in full is the
    // state the last steps left.)
    // Once the stage is over the simulation's time stands still but its steps go on (`clearTimer`): the ending's
    // bodies (the knocked-out hero, his drop to the ground and his cheer) run on those steps; what the simulation
    // stopped stays stopped (`ActorsView.update` holds it).
    const shown = world.time + world.clearTimer - (1 - alpha) * STEP
    const animDt =
      this.shownTime === null || scale <= 0 ? (scale <= 0 ? 0 : dt * scale) : Math.max(0, shown - this.shownTime)
    this.shownTime = shown
    view.update(dt, animDt)
    if (!this.demo) this.deps.hud.update(world, dt)
    director.update(dt)
    // (The skid's squeal begins on the frame that first draws his skid.)
    if (!this.demo) this.sounds.update(world, dt, view.camera.x + VIEW_W / 2, view.actors.heroBrakeSkids())
  }

  /** The pause menu is open: duck the music and hush the loops. */
  setPaused(paused: boolean) {
    this.sounds.setPaused(paused)
  }

  /** The session is over: stop its loops and duck (the music carries on into the next screen). */
  stopAudio() {
    this.sounds.stop()
  }

  private drain() {
    const events = this.world.events
    if (!events.length) return
    // Events still waiting from a fall come before anything newer.
    while (this.later.length) this.answer(this.later.shift()!)
    // A stage that ended in the step of the fall (the hero stood on the goal) is answered whole, at once.
    let fell = false
    if (this.world.state === 'play') for (const event of events) if (event.type === 'boss-down') fell = true
    for (const event of events) {
      if (fell && AFTER_A_FALL.has(event.type)) this.later.push(event)
      else this.answer(event)
    }
    events.length = 0
  }

  /** The view, the sounds and the director answer one event. */
  private answer(event: SimEvent) {
    if (event.type === 'hurt') this.damage += 1
    if (judges(event)) this.judged += 1
    this.view.handle(event)
    this.sounds.event(event)
    // (Before the director stages the moment: what it asks of the HUD is kept for the next frame too.)
    if (!this.demo && RESTS_THE_HUD.has(event.type)) rest(this.deps.hud)
    this.director.handle(event)
  }

  /** Draws the frame, then puts the simulation's own positions back. */
  draw() {
    try {
      this.view.draw()
    } finally {
      this.mover.restore()
    }
  }
}
