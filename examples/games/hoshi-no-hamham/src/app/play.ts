/**
 * PlaySession: one stage being played. Owns the World, its StageView, the Director and the sound board; steps the
 * simulation at a fixed rate (unless the view is frozen for hit-stop or staging holds it), feeds every event to
 * the view, the sound map and the director, and reports the outcome.
 *
 * A session can also be the title screen's demo (`demo: true`): the bot plays, nothing sounds, the HUD is left
 * alone, and a plain director ends it after a while so the app can start the next one.
 */
import type { GameAudio } from '../audio/api'
import { botInput, type BotMemory } from '../game/bot'
import type { Input } from '../game/input'
import { World, emptyInput } from '../game/sim'
import type { StageDef } from '../game/types'
import type { Hud, HudApi } from '../ui/hud'
import { VIEW_W } from '../art/contract'
import { StageDirector, type Director, type DirectorHost, type Outcome } from '../view/director'
import type { Renderer } from '../view/renderer'
import { SILENT_AUDIO, SoundBoard } from '../view/sound-map'
import { StageView } from '../view/stage-view'

export const STEP = 1 / 60
const MAX_STEPS = 4
/** A demo that neither clears nor dies moves on after this many seconds. */
export const DEMO_SECONDS = 40

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
  private sounds: SoundBoard
  private accumulator = 0
  private bot: BotMemory = { x: 0, stuck: 0, reverse: 0 }

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
    audio.unlock()
    this.sounds.start(this.world)
  }

  get outcome(): Outcome | null {
    return this.director.outcome
  }

  /** One display frame of `dt` real seconds. */
  frame(dt: number) {
    const { view, director, world } = this
    const scale = Math.max(0, director.timeScale)
    if (!view.frozen) {
      this.accumulator += dt * scale
      let steps = 0
      while (this.accumulator >= STEP && steps < MAX_STEPS && !view.frozen) {
        const locked = director.inputLocked
        if (this.demo) world.step(STEP, locked ? emptyInput() : botInput(world, this.bot))
        else {
          world.step(STEP, locked ? emptyInput() : this.deps.input.poll())
          if (!locked) this.deps.input.consumePresses()
        }
        this.accumulator -= STEP
        steps += 1
        this.drain()
      }
      if (steps === MAX_STEPS || view.frozen) this.accumulator = Math.min(this.accumulator, STEP)
    }
    view.update(dt, view.frozen ? 0 : dt * scale)
    if (!this.demo) this.deps.hud.update(world, dt)
    director.update(dt)
    if (!this.demo) this.sounds.update(world, dt, view.camera.x + VIEW_W / 2)
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
    for (const event of events) {
      if (event.type === 'hurt') this.damage += 1
      this.view.handle(event)
      this.sounds.event(event)
      this.director.handle(event)
    }
    events.length = 0
  }

  draw() {
    this.view.draw()
  }
}
