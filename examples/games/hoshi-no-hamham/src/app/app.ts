/** The app: the frame loop, save data and switching between the screens and play. */
import { createAudio } from '../audio'
import { Input } from '../game/input'
import type { World } from '../game/sim'
import { ENDING_PAGES, OPENING_PAGES, STAGES, stageByNo } from '../game/stages'
import { loadSave, storeSave, type SaveData, type StageDef, type VolumeKind } from '../game/types'
import { Hud } from '../ui/hud'
import { DomScreens, type Screens } from '../ui/screens'
import { Renderer } from '../view/renderer'
import { SoundBoard, type SoundCue } from '../view/sound-map'
import type { StageView } from '../view/stage-view'
import { PlaySession, STEP } from './play'

type ScreenName = 'title' | 'select' | 'story' | 'play' | 'result' | 'dead' | 'ending'

const MAX_FRAME = 0.25
/** The stages the title screen's demo cycles through. */
const DEMO_STAGES = [1, 5, 3, 7, 9, 4]
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
  private demoTurn = 0
  private stage: StageDef = STAGES[0]
  /** The stage whose story is showing (null for the opening). */
  private storyStage: StageDef | null = null
  private screen: ScreenName = 'title'
  private paused = false
  private touch = false
  private lastTime = performance.now() / 1000

  constructor(
    canvas: HTMLCanvasElement,
    private screens: Screens = new DomScreens()
  ) {
    this.renderer = new Renderer(canvas)
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
      menuSound: () => this.cue('menu-select'),
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

  private leavePlay() {
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

  /** Starts the next self-playing stage behind the title. */
  private startDemo() {
    const stage = stageByNo(DEMO_STAGES[this.demoTurn % DEMO_STAGES.length])
    this.demoTurn += 1
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
  }

  private openStory(stage: StageDef) {
    this.leavePlay()
    this.screen = 'story'
    this.stage = stage
    this.storyStage = stage
    this.audio.setMusic('story')
    this.screens.showStory({ kicker: `第${stage.no}話`, title: stage.name, pages: stage.intro, scene: stage.no })
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

  private startStage(stage: StageDef) {
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
    this.session.start()
  }

  private togglePause() {
    if (this.screen !== 'play') return
    this.paused = !this.paused
    this.screens.setPaused(this.paused)
    this.session?.setPaused(this.paused)
    this.cue(this.paused ? 'pause' : 'resume')
  }

  private cue(cue: SoundCue) {
    this.audio.unlock()
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

  private openDead() {
    this.leavePlay()
    this.screen = 'dead'
    this.audio.setMusic('gameover')
    this.screens.showDead()
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
        if (session.outcome === 'clear') this.finishStage(session)
        else if (session.outcome === 'dead') this.openDead()
      }
    }
    input.endFrame()
  }
}
