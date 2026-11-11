/**
 * Staging (演出) for one stage. The director decides *when* the simulation runs and what the HUD and overlays
 * say; it never changes the rules. This first version reproduces the game's existing behaviour: a stage banner
 * and the first hint on start, toasts for notable events, the boss bar when a fight starts, and short delays
 * before the result and game-over screens. A later task replaces `BasicDirector` with full sequences (iris,
 * letterbox, boss intros, slow motion) through the same interface.
 */
import type { SimEvent } from '../game/events'
import type { World } from '../game/sim'
import type { StageDef } from '../game/types'
import type { HudApi } from '../ui/hud'
import type { Camera } from './camera'
import type { CueSink } from './cues'
import type { Overlay } from './overlay'
import type { StageView } from './stage-view'

/** What a director can reach. */
export interface DirectorHost {
  readonly world: World
  readonly stage: StageDef
  readonly hud: HudApi
  /** The whole stage view: particles, hit-stop, actors and props (its camera and overlay are also given below). */
  readonly view: StageView
  readonly camera: Camera
  readonly overlay: Overlay
  /** Staging sounds (see `SOUND_CUES`); the music and the event sounds follow the simulation by themselves. */
  readonly sound: CueSink
  readonly reducedMotion: boolean
}

export type Outcome = 'clear' | 'dead'

export interface Director {
  /** Play begins (after the stage view is built). */
  start(): void
  /** Every simulation event, after the view has answered it. */
  handle(event: SimEvent): void
  /** Every frame, with real time (also while the view is frozen; not while paused). */
  update(dt: number): void
  /** Multiplier on simulation time: 1 normal, below 1 slow motion, 0 holds the simulation. */
  readonly timeScale: number
  /** While true the simulation gets empty input. */
  readonly inputLocked: boolean
  /** Set when play should end and the app should show the result or game-over screen. */
  readonly outcome: Outcome | null
}

export const RESULT_DELAY = 1.4
export const GAME_OVER_DELAY = 1.2

const TOASTS: Partial<Record<SimEvent['type'], string>> = {
  'boss-down': 'ボスを倒した！ゴールが開くよ',
  hurt: 'いたい！',
  switch: 'スイッチ！門が開いた',
  'pipe-burst': '水が噴き出した！',
  'hive-break': '蜂の巣を怒らせた！',
  'animal-wake': '動物が起きた！'
}

export class BasicDirector implements Director {
  timeScale = 1
  inputLocked = false
  outcome: Outcome | null = null
  private bossBarShown = false
  private endTimer = 0

  constructor(private host: DirectorHost) {}

  start() {
    const { hud, stage } = this.host
    hud.hideBoss()
    hud.showBanner(`${stage.no}. ${stage.name}`, stage.subtitle)
    if (stage.hints[0]) hud.showToast(stage.hints[0])
  }

  handle(event: SimEvent) {
    const { hud, stage } = this.host
    const toast = TOASTS[event.type]
    if (toast) hud.showToast(toast)
    if (event.type === 'clear') hud.showBanner('クリア！', stage.name)
    if (event.type === 'dead') hud.showBanner('ゲームオーバー', '')
  }

  update(dt: number) {
    const { world, hud } = this.host
    const boss = world.boss
    if (boss && !boss.dead && boss.active && !this.bossBarShown) {
      this.bossBarShown = true
      hud.showBoss(boss.def.name, boss.def.title)
      if (boss.state !== 'tired') hud.showToast(`${boss.def.name} が現れた！`)
    }
    if (boss?.dead && this.bossBarShown) {
      this.bossBarShown = false
      hud.hideBoss()
    }
    if (this.outcome) return
    if (world.state === 'clear') {
      this.endTimer += dt
      if (this.endTimer > RESULT_DELAY) this.outcome = 'clear'
    } else if (world.state === 'dead') {
      this.endTimer += dt
      if (this.endTimer > GAME_OVER_DELAY) this.outcome = 'dead'
    }
  }
}
