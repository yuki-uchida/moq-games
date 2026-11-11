/**
 * Staging (演出) for one stage. The director decides *when* the simulation runs (time scale, input lock) and what
 * the camera, overlay, actors and HUD show around the key moments of a stage; it never changes the rules.
 *
 * Every moment is a `Sequence` (sequence.ts) built by `staging.ts`. One *main* sequence holds the stage at a time;
 * a more important one interrupts it (death or the clear interrupt everything, a falling boss interrupts his
 * intro) and a less important one waits in a queue (the goal reveal waits for the boss's fall). What a sequence
 * holds — sim time, input, bars, cinematic HUD, camera, iris, spotlight — is a *claim* that the director reads
 * every frame, so a sequence that ends, is skipped or is cancelled can never leave anything stuck.
 */
import type { SimEvent } from '../game/events'
import type { World } from '../game/sim'
import type { StageDef } from '../game/types'
import type { HudApi } from '../ui/hud'
import type { Camera } from './camera'
import type { CueSink } from './cues'
import { edgePointer, type Overlay } from './overlay'
import { mergeClaims, type Claims, type Sequence } from './sequence'
import { PRIORITY, Staging } from './staging'
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
  /** The staged moment playing now (for tests and debugging), or null. */
  readonly current?: string | null
  /** Skips the moment playing now, when it can be skipped. */
  skip?(): boolean
}

/** Where skip presses come from: the game's `Input` (jump or bite pressed while the input is locked). */
export interface SkipSource {
  poll(): { jumpPressed: boolean; bitePressed: boolean }
  consumePresses(): void
}

/** A press this soon after a moment begins is not taken as a skip (it was meant for the game). */
const SKIP_GRACE = 0.15

const TOASTS: Partial<Record<SimEvent['type'], string>> = {
  switch: 'スイッチ！門が開いた',
  'pipe-burst': '水が噴き出した！',
  'hive-break': '蜂の巣を怒らせた！',
  'animal-wake': '動物が起きた！'
}

interface Pending {
  priority: number
  make: () => Sequence | null
}

export class StageDirector implements Director {
  outcome: Outcome | null = null
  /** Names of the moments that began, in order (tests). */
  readonly log: string[] = []
  private main: Sequence | null = null
  private queue: Pending[] = []
  private claimed: Required<Claims> = mergeClaims([])
  private barsOn = false
  private cinematicOn = false
  private cameraHeld = false
  private irisHeld = false
  private bossBar = false
  private goalArrow = false
  private ended = false
  private staging: Staging

  constructor(
    private host: DirectorHost,
    private skipSource: SkipSource | null = null
  ) {
    this.staging = new Staging(host, (outcome) => {
      this.outcome ??= outcome
    })
  }

  get timeScale() {
    return this.claimed.scale
  }

  get inputLocked() {
    return this.claimed.lock
  }

  get current() {
    return this.main?.running ? this.main.name : null
  }

  /** The claims in force (tests). */
  get claims(): Readonly<Required<Claims>> {
    return this.claimed
  }

  start() {
    const { hud, world } = this.host
    hud.hideBoss()
    const chase = world.boss?.def.kind === 'chaser' && world.boss.active
    this.request(PRIORITY.start, () =>
      chase ? this.staging.chaseStart(() => this.showBossBar()) : this.staging.stageStart()
    )
  }

  handle(event: SimEvent) {
    const { hud, world } = this.host
    const toast = TOASTS[event.type]
    if (toast) hud.showToast(toast)
    switch (event.type) {
      case 'boss-awake':
        if (world.boss && world.boss.def.kind !== 'chaser')
          this.request(PRIORITY.intro, () => this.staging.bossIntro(() => this.showBossBar()))
        break
      case 'boss-phase':
        this.request(PRIORITY.phase, () => this.staging.bossPhase())
        break
      case 'boss-down':
        this.hideBossBar()
        this.request(PRIORITY.defeat, () => this.staging.bossDefeat(event))
        break
      case 'goal-open':
        this.goalArrow = true
        this.request(PRIORITY.goal, () => this.staging.goalReveal(event))
        break
      case 'princess-free':
        this.request(PRIORITY.princess, () => this.staging.princessFree(event))
        break
      case 'boss-tired':
        this.staging.momTired()
        break
      case 'clear':
        this.request(PRIORITY.end, () => this.staging.clear(event))
        break
      case 'dead':
        this.request(PRIORITY.end, () => this.staging.death(event))
        break
      default:
        break
    }
  }

  update(dt: number) {
    const { world } = this.host
    // Jump or bite skips a moment that holds the input.
    const main = this.main
    if (main?.running && main.skippable && main.time >= SKIP_GRACE && this.claimed.lock && this.skipSource) {
      const pressed = this.skipSource.poll()
      if (pressed.jumpPressed || pressed.bitePressed) {
        this.skipSource.consumePresses()
        main.skip()
      }
    }
    this.main?.update(dt)
    this.advanceQueue()
    // The stage ended without its event reaching the director: still play the ending.
    if (!this.ended && world.state !== 'play') {
      const p = world.player
      const at = { x: p.x + p.w / 2, y: p.y + p.h / 2 }
      if (world.state === 'clear') this.request(PRIORITY.end, () => this.staging.clear({ type: 'clear', ...at }))
      else this.request(PRIORITY.end, () => this.staging.death({ type: 'dead', ...at }))
    }
    // The boss bar follows the fight (shown by the intro, or here when a boss is active without one).
    const boss = world.boss
    if (boss && boss.active && !boss.dead && !this.bossBar && !this.introPending()) this.showBossBar()
    if ((!boss || boss.dead) && this.bossBar) this.hideBossBar()
    this.refresh()
    this.updatePointer()
  }

  /** Skips the moment playing now (jump or bite does the same in the game). */
  skip(): boolean {
    const done = this.main?.skip() ?? false
    this.main?.update(0)
    this.advanceQueue()
    this.refresh()
    return done
  }

  // ------------------------------------------------------------------------------------------- moments

  private request(priority: number, make: () => Sequence | null) {
    if (this.ended) return
    if (priority >= PRIORITY.end) {
      this.ended = true
      this.queue = []
    }
    const main = this.main?.running ? this.main : null
    if (!main) this.begin(make)
    else if (priority > main.priority) {
      // A moment with nothing to show (an off-screen princess) never interrupts.
      const seq = make()
      if (seq) {
        main.cancel()
        this.begin(() => seq)
      }
    } else {
      // Stable: equal priorities keep their order.
      const at = this.queue.findIndex((p) => p.priority < priority)
      this.queue.splice(at < 0 ? this.queue.length : at, 0, { priority, make })
    }
    this.refresh()
  }

  private begin(make: () => Sequence | null) {
    const seq = make()
    this.main = seq
    if (!seq) return
    this.log.push(seq.name)
    // Presses made before the moment began were meant for the game, not for skipping.
    if (seq.claims().lock) this.skipSource?.consumePresses()
    seq.update(0)
  }

  private advanceQueue() {
    while (!this.main?.running && this.queue.length) this.begin(this.queue.shift()!.make)
    if (this.main && !this.main.running) this.main = null
  }

  private introPending() {
    return this.main?.name === 'boss-intro' || this.queue.some((p) => p.priority === PRIORITY.intro)
  }

  private showBossBar() {
    const boss = this.host.world.boss
    if (!boss || boss.dead || this.bossBar) return
    this.bossBar = true
    this.host.hud.showBoss(boss.def.name, boss.def.title)
  }

  private hideBossBar() {
    if (!this.bossBar) return
    this.bossBar = false
    this.host.hud.hideBoss()
  }

  /** Applies the claims of the moment playing now; whatever nobody claims goes back to normal play. */
  private refresh() {
    const { overlay, camera, hud } = this.host
    const c = mergeClaims(this.main?.running ? [this.main.claims()] : [])
    this.claimed = c
    if (c.bars !== this.barsOn) {
      this.barsOn = c.bars
      overlay.letterbox(c.bars, 0.3)
    }
    if (c.cinematic !== this.cinematicOn) {
      this.cinematicOn = c.cinematic
      hud.cinematic(c.cinematic)
    }
    if (c.camera) this.cameraHeld = true
    else if (this.cameraHeld) {
      this.cameraHeld = false
      camera.release()
    }
    if (c.iris) this.irisHeld = true
    else if (this.irisHeld) {
      this.irisHeld = false
      if (!this.ended && overlay.irisTarget < 1) overlay.irisTo(1, 0.25, overlay.irisX, overlay.irisY)
    }
    overlay.spotlight(c.spotlight)
  }

  /** After the goal opened: an arrow at the screen edge points to it while it is off screen. */
  private updatePointer() {
    const { overlay, camera, world } = this.host
    if (!this.goalArrow || world.state !== 'play' || this.cameraHeld) {
      overlay.pointer = null
      return
    }
    overlay.pointer = edgePointer(world.goalX + 32, world.goalY + 32, camera.x, camera.y)
  }
}
