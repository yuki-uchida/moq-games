/** The app: the frame loop, save data and switching between the screens and play. */
import { createAudio } from '../audio'
import { Input } from '../game/input'
import type { World } from '../game/sim'
import { ENDING_PAGES, OPENING_PAGES, STAGES, stageByNo } from '../game/stages'
import { loadSave, storeSave, TILE, type SaveData, type StageDef, type VolumeKind } from '../game/types'
import { Hud } from '../ui/hud'
import { trackRatio } from '../ui/hud-model'
import { spriteImg } from '../ui/pixel'
import { DomScreens, type Screens } from '../ui/screens'
import { installZoomGuard } from '../ui/zoom-guard'
import { Renderer } from '../view/renderer'
import { SoundBoard, type SoundCue } from '../view/sound-map'
import type { StageView } from '../view/stage-view'
import { PlaySession, STEP } from './play'
import { isWarm, warmStage } from './warm'

type ScreenName = 'title' | 'select' | 'story' | 'play' | 'result' | 'dead' | 'ending'

export interface LoadingIndicator {
  show(): void
  hide(): void
  progress(fraction: number): void
}

/** The small 「よみこみちゅう…」 card shown when play has to wait for the stage's art (night panel, star, bar). */
class LoadingNote implements LoadingIndicator {
  private root: HTMLElement | null = null
  private fill: HTMLElement | null = null

  constructor(private parent: HTMLElement) {}

  private build() {
    const root = document.createElement('div')
    root.className = 'warm-note night-panel'
    root.setAttribute('role', 'status')
    root.hidden = true
    const star = spriteImg('ui', 'starOn', { className: 'warm-note-star', scale: 2 })
    const text = document.createElement('span')
    text.textContent = 'よみこみちゅう…'
    const bar = document.createElement('div')
    bar.className = 'warm-note-bar'
    const fill = document.createElement('i')
    bar.append(fill)
    root.append(star, text, bar)
    this.parent.append(root)
    this.root = root
    this.fill = fill
  }

  show() {
    if (!this.root) this.build()
    this.progress(0)
    this.root!.hidden = false
  }

  hide() {
    if (this.root) this.root.hidden = true
  }

  progress(fraction: number) {
    if (this.fill) this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`
  }
}

const MAX_FRAME = 0.25
/** How long a stage's start may wait for the sound effects to be rendered ahead once its art is ready (ms). */
const SOUND_WAIT_MS = 3000
/** The stages the title screen's demo cycles through. */
export const DEMO_STAGES = [1, 5, 3, 7, 9, 4]
/** Under reduced motion the demo is one still frame, taken after this many simulated seconds. */
const DEMO_STILL_SECONDS = 2.5

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export class App {
  private renderer: Renderer
  private input = new Input()
  private hud = new Hud()
  private audio = createAudio()
  /** Interface cues outside play (menus, results). */
  private sounds = new SoundBoard(this.audio)
  private save: SaveData = loadSave()
  private session: PlaySession | null = null
  /** The self-playing stage behind the title screen. */
  private demo: PlaySession | null = null
  /** The stage the demo plays now (played again while the next one is not warm yet). */
  private demoStage: StageDef | null = null
  private demoTurn = 0
  private stage: StageDef = STAGES[0]
  /** The stage whose story is showing (null for the opening). */
  private storyStage: StageDef | null = null
  private screen: ScreenName = 'title'
  private paused = false
  private touch = false
  private lastTime = performance.now() / 1000
  private loading: LoadingIndicator
  /** Bumped whenever play is left or restarted, so a stage waiting for its art can tell it was overtaken. */
  private startToken = 0
  /** The bot plays the stages instead of the player (test hook for the performance checks). */
  private autopilot = false
  private frames = 0
  private resolveFirstFrame: () => void = () => {}
  /** Resolves once the first frame of the loop (the title's first picture) has been drawn. */
  readonly firstFrame = new Promise<void>((resolve) => (this.resolveFirstFrame = resolve))

  constructor(
    canvas: HTMLCanvasElement,
    private screens: Screens = new DomScreens()
  ) {
    this.renderer = new Renderer(canvas)
    this.loading = new LoadingNote(canvas.parentElement ?? document.body)
    this.audio.setMuted(this.save.muted)
    for (const kind of ['master', 'music', 'sfx'] as const) this.audio.setVolume(kind, this.save.volume[kind])
    // Any first gesture unlocks the audio context, not only the menu buttons.
    for (const type of ['pointerdown', 'keydown'] as const)
      window.addEventListener(type, () => this.audio.unlock(), { capture: true })
    this.screens.bind({
      newGame: () => {
        this.save.seenOpening = false
        this.openOpening()
      },
      openSelect: () => this.openSelect(),
      openTitle: () => this.openTitle(),
      pickStage: (stage) => this.openStory(stage),
      storyDone: () => (this.storyStage ? this.startStage(this.storyStage) : this.openSelect()),
      next: () => (this.stage.no >= STAGES.length ? this.openEnding() : this.openStory(stageByNo(this.stage.no + 1))),
      retry: () => this.startStage(this.stage),
      resume: () => this.togglePause(),
      togglePause: () => this.togglePause(),
      toggleMute: () => this.toggleMute(),
      // Only the audio unlock: the screens name the sound of each action with `cue`.
      menuSound: () => this.audio.unlock(),
      cue: (cue) => this.cue(cue),
      setVolume: (kind, value) => this.setVolume(kind, value)
    })
    this.screens.setMuted(this.save.muted)
    this.screens.setVolumes(this.save.volume)
    // Touch controls appear only after a real touch, so mouse and keyboard play stays clean.
    window.addEventListener('touchstart', () => {
      this.touch = true
      if (this.screen === 'play') this.screens.setTouch(true)
    })
    this.input.bindTouch(document)
    installZoomGuard()
    this.openTitle()
    requestAnimationFrame(this.loop)
  }

  /** The live world, or null outside play (test hook). */
  get world(): World | null {
    return this.session?.world ?? null
  }

  /** The live stage view, or null outside play (test hook). */
  get view(): StageView | null {
    return this.session?.view ?? null
  }

  /** The world of the title screen's demo, or null when no demo runs (test hook). */
  get demoWorld(): World | null {
    return this.demo?.world ?? null
  }

  /** Lets the bot play the stage that runs now and every stage started later (test hook). */
  setAutopilot(on: boolean) {
    this.autopilot = on
    if (this.session) this.session.autopilot = on
  }

  private leavePlay() {
    this.startToken += 1
    this.loading.hide()
    this.session?.stopAudio()
    this.session = null
    this.demo = null
    this.paused = false
    this.screens.setPaused(false)
    this.screens.setTouch(false)
    this.hud.hide()
    this.hud.hideBoss()
  }

  openTitle() {
    this.leavePlay()
    this.screen = 'title'
    this.audio.setMusic('title')
    const hasSave = this.save.cleared.length > 0 || this.save.unlocked > 1
    this.screens.showTitle(hasSave, this.save.cleared.length, STAGES.length)
    this.startDemo()
  }

  /**
   * Starts the next self-playing stage behind the title, if its art is ready; otherwise the current one plays again
   * and the next one is tried when that ends. Meanwhile the stage after it is warmed in the background, so the demo
   * never starts a stage cold.
   */
  private startDemo() {
    const next = stageByNo(DEMO_STAGES[this.demoTurn % DEMO_STAGES.length])
    let stage = next
    if (this.demoStage && !isWarm(next)) stage = this.demoStage
    else this.demoTurn += 1
    this.demoStage = stage
    const upcoming = stageByNo(DEMO_STAGES[this.demoTurn % DEMO_STAGES.length])
    if (!isWarm(upcoming)) void warmStage(upcoming, undefined, true).catch(() => {})
    const reduced = reducedMotion()
    const demo = new PlaySession(
      stage,
      { renderer: this.renderer, hud: this.hud, audio: this.audio, input: this.input, reducedMotion: reduced },
      { demo: true }
    )
    demo.start()
    this.demo = demo
    if (reduced) {
      // One still picture instead of a moving demo.
      for (let t = 0; t < DEMO_STILL_SECONDS; t += STEP) demo.frame(STEP)
      demo.draw()
    }
  }

  openSelect() {
    this.leavePlay()
    this.screen = 'select'
    this.audio.setMusic('select')
    this.screens.showSelect(STAGES, this.save)
  }

  private openOpening() {
    this.screen = 'story'
    this.storyStage = null
    this.demo = null
    this.audio.setMusic('story')
    this.renderer.clear()
    this.screens.showStory({ kicker: 'プロローグ', title: '星のハムハム', pages: OPENING_PAGES, scene: 'opening' })
    // The first stage is next in line; build its art while the prologue is read.
    void warmStage(STAGES[0]).catch(() => {})
  }

  private openStory(stage: StageDef) {
    this.leavePlay()
    this.screen = 'story'
    this.stage = stage
    this.storyStage = stage
    this.audio.setMusic('story')
    this.screens.showStory({ kicker: `第${stage.no}話`, title: stage.name, pages: stage.intro, scene: stage.no })
    // The player reads for a few seconds anyway: build the stage's art meanwhile.
    void warmStage(stage).catch(() => {})
  }

  openEnding() {
    this.leavePlay()
    this.screen = 'ending'
    this.audio.setMusic('ending')
    const total = Object.values(this.save.best).reduce((sum, value) => sum + value, 0)
    this.screens.showEnding(ENDING_PAGES, [
      `クリア ${this.save.cleared.length}/${STAGES.length}`,
      `合計タイム ${formatTime(total)}`,
      '★ ありがとう！'
    ])
  }

  /**
   * Starts play once the stage's art is built. Normally it already is (the story screen warmed it, or the stage
   * was played before); otherwise the screen the player came from stays up with a loading card until it is.
   */
  private startStage(stage: StageDef) {
    this.leavePlay()
    this.stage = stage
    if (isWarm(stage) && this.audio.ahead) {
      this.beginStage(stage)
      return
    }
    const token = this.startToken
    this.loading.show()
    const done = () => {
      if (token !== this.startToken) return
      this.loading.hide()
      this.beginStage(stage)
    }
    // The art must be there; the sound effects rendered ahead are worth a short wait, no more.
    const art = warmStage(stage, (fraction) => token === this.startToken && this.loading.progress(fraction))
    const settled = art.then(
      () => this.audio.whenAhead(SOUND_WAIT_MS),
      () => this.audio.whenAhead(SOUND_WAIT_MS)
    )
    settled.then(done, done)
  }

  private beginStage(stage: StageDef) {
    this.leavePlay()
    this.stage = stage
    this.screen = 'play'
    this.screens.showPlay()
    if (this.touch) this.screens.setTouch(true)
    this.session = new PlaySession(stage, {
      renderer: this.renderer,
      hud: this.hud,
      audio: this.audio,
      input: this.input,
      reducedMotion: reducedMotion()
    })
    this.session.autopilot = this.autopilot
    this.session.start()
    this.renderer.resetSampling()
  }

  private togglePause() {
    if (this.screen !== 'play') return
    this.paused = !this.paused
    this.screens.setPaused(this.paused)
    this.session?.setPaused(this.paused)
    this.cue(this.paused ? 'pause' : 'resume')
  }

  // No unlock here: only a gesture may create or resume the audio context (see the listeners in the constructor).
  // A cue before the first gesture, such as the title's own, is simply not heard.
  private cue(cue: SoundCue) {
    this.sounds.cue(cue)
  }

  private setVolume(kind: VolumeKind, value: number) {
    this.save.volume[kind] = Math.max(0, Math.min(1, value))
    storeSave(this.save)
    this.audio.setVolume(kind, this.save.volume[kind])
  }

  private toggleMute() {
    this.save.muted = !this.save.muted
    storeSave(this.save)
    this.audio.setMuted(this.save.muted)
    this.screens.setMuted(this.save.muted)
  }

  private finishStage(session: PlaySession) {
    const { stage, world } = session
    this.leavePlay()
    this.screen = 'result'
    this.audio.setMusic('clear')
    if (!this.save.cleared.includes(stage.no)) this.save.cleared.push(stage.no)
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(STAGES.length, stage.no + 1))
    const best = this.save.best[stage.id]
    const seconds = Math.round(world.time * 10) / 10
    const newRecord = !best || seconds < best
    if (newRecord) this.save.best[stage.id] = seconds
    storeSave(this.save)
    this.screens.showResult({
      stage,
      last: stage.no >= STAGES.length,
      time: formatTime(world.time),
      seconds,
      previousBest: best ?? null,
      newRecord,
      kills: world.kills,
      damage: session.damage,
      collected: stage.objective === 'collect' ? world.collected : null
    })
  }

  private openDead(session: PlaySession) {
    // Where the hero fell, on the same track the deck shows during play.
    const { stage, world } = session
    const width = world.w * TILE
    const hero = trackRatio(world.player.x + world.player.w / 2, width)
    const goal = trackRatio(world.goalX + TILE / 2, width)
    this.leavePlay()
    this.screen = 'dead'
    this.audio.setMusic('gameover')
    this.screens.showDead({ stage, hero, goal })
  }

  /** Feeds the frame to the adaptive backing scale; a staged sequence that holds the simulation never rescales. */
  private watchFrameRate(time: number, session: PlaySession) {
    const { director, view } = session
    const held = director.timeScale !== 1 || director.inputLocked || view.frozen
    this.renderer.observeFrame(time, true, held)
  }

  private loop = (time: number) => {
    requestAnimationFrame(this.loop)
    const now = time / 1000
    const dt = Math.min(MAX_FRAME, Math.max(0, now - this.lastTime))
    this.lastTime = now
    const input = this.input
    if (input.mutePressed) this.toggleMute()
    if (input.confirmPressed && this.screen !== 'play') this.screens.confirm()
    const session = this.session
    const demo = this.demo
    if (this.screen === 'title' && demo && !reducedMotion()) {
      demo.frame(dt)
      demo.draw()
      if (demo.outcome) this.startDemo()
    }
    if (this.screen === 'play' && session) {
      if (input.pausePressed && !this.paused) this.togglePause()
      if (!this.paused) {
        session.frame(dt)
        session.draw()
        this.watchFrameRate(time, session)
        if (session.outcome === 'clear') this.finishStage(session)
        else if (session.outcome === 'dead') this.openDead(session)
      }
    }
    if (this.screen !== 'play' || this.paused) this.renderer.observeFrame(time, false, false)
    input.endFrame()
    if (++this.frames === 1) {
      this.resolveFirstFrame()
      // The title is on screen: build the audio engine and render the sound effects before the first tap asks.
      this.audio.prepare()
    }
  }
}
