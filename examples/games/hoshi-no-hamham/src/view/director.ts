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
import { BETWEEN_WAIT_SECONDS, LAND_WAIT_SECONDS, PRIORITY, Staging } from './staging'
import { SHOT_CUE_SECONDS } from './clips'
import type { StageView } from './stage-view'
import type { PoseToken } from './actors'

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
  /** One simulation step has run and its events have been handled (a moment waiting for bodies looks here). */
  simStep?(): void
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
/** A hold's standing pose of the hero lasts at most this long (s): the hold ends it first. */
const HOLD_POSE_SECONDS = 60
/** One simulation step (s). */
const STEP = 1 / 60

const TOASTS: Partial<Record<SimEvent['type'], string>> = {
  switch: 'スイッチ！門が開いた',
  'pipe-burst': '水が噴き出した！',
  'hive-break': '蜂の巣を怒らせた！',
  'animal-wake': '動物が起きた！'
}

interface Pending {
  priority: number
  make: () => Sequence | null
  /** Called when the moment is dropped from the queue without being made. */
  drop?: () => void
}

/**
 * A moment that waits for the boss (and, with `hero`, the hero too) to land before it is requested (for at most
 * `LAND_WAIT_SECONDS`).
 */
interface Landing extends Pending {
  waited: number
  /** How long the moment has waited for the hero (his cap, from the moment's cause). */
  heroWaited: number
  hero: boolean
  /** It also waits for the boss to be between his actions (`ActorsView.bossBetweenActions`). */
  between: boolean
}

export class StageDirector implements Director {
  outcome: Outcome | null = null
  /** Names of the moments that began, in order (tests). */
  readonly log: string[] = []
  private main: Sequence | null = null
  private queue: Pending[] = []
  private landings: Landing[] = []
  private claimed: Required<Claims> = mergeClaims([])
  private barsOn = false
  private cinematicOn = false
  private cameraHeld = false
  private irisHeld = false
  private bossBar = false
  private goalArrow = false
  private ended = false
  /** The standing pose a hold of the simulation gave the hero (see `holdHero`). */
  private heroHeld: PoseToken | null = null
  /** A step's events are being answered (`handle` until `simStep`). */
  private answering = false
  /** `simStep` drives the waits (see `simStep`). */
  private stepDriven = false
  /** A boss's shot left on the step being answered (see `backstop`). */
  private shotThisStep = false
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
    // (Driven by steps, a step's events are being answered until `simStep`: the hero's pose for a hold waits.)
    this.answering = true
    const { hud, world } = this.host
    const toast = TOASTS[event.type]
    if (toast) hud.showToast(toast)
    if (event.type === 'boss-shoot') this.shotThisStep = true
    switch (event.type) {
      case 'boss-awake':
        // The entrance waits for the hero too: he is posed standing through it, not frozen in a run or a jump. It
        // begins before the boss has begun anything: as the transformation, it waits for the hero only while the
        // boss is between his actions, and begins at the latest in the first moments of his first wind-up or on the
        // step before his first light or cast (the hero hangs where he is); never inside an action.
        if (world.boss && world.boss.def.kind !== 'chaser')
          this.whenLanded(PRIORITY.intro, () => this.staging.bossIntro(() => this.showBossBar()), true, true)
        break
      case 'boss-phase':
        // (The view leaves his transformation to the moment: it is not played on the simulation's time.) Like the
        // entrance it waits for the hero to land too: he is not held in mid-air or in the first frame of a bite.
        // It also waits for him to be between his actions: he lands with his whole landing, or fires and follows
        // through, and then roars.
        this.host.view.actors.stageRage()
        this.whenLanded(PRIORITY.phase, () => this.staging.bossPhase(), true, true)
        break
      case 'boss-down':
        this.hideBossBar()
        this.request(PRIORITY.defeat, () => this.staging.bossDefeat(event))
        break
      case 'goal-open':
        this.goalArrow = true
        this.request(PRIORITY.goal, () => this.staging.goalReveal(event))
        break
      case 'princess-free': {
        // Her cheer waits for her moment (she stands meanwhile); a moment that will not play lets her go on.
        const props = this.host.view.props
        props.holdCheer(event.x, event.y)
        const drop = () => props.dropCheer(event.x, event.y)
        this.request(
          PRIORITY.princess,
          () => {
            const seq = this.staging.princessFree(event)
            if (!seq) drop()
            return seq
          },
          drop
        )
        break
      }
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
    // (A display frame comes after the steps of its frame and their events.)
    this.answering = false
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
    // (Driven by the simulation's steps, the waits are looked at on every step: see simStep.)
    if (!this.stepDriven) this.advanceLandings(dt * this.claimed.scale)
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

  /**
   * One simulation step has run: a moment that waits for the boss and the hero is looked at on it (a hero who
   * touches the ground for one step between two hops counts at any display rate), and begun on the step its bodies
   * are ready.
   */
  simStep() {
    this.stepDriven = true
    this.answering = false
    this.advanceLandings(STEP)
    this.shotThisStep = false
    this.refresh()
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

  /** Requests a moment; `drop` is called when it is dropped without ever being made (the stage ended first). */
  private request(priority: number, make: () => Sequence | null, drop?: () => void) {
    if (this.ended) {
      drop?.()
      return
    }
    if (priority >= PRIORITY.end) {
      this.ended = true
      for (const pending of this.queue) pending.drop?.()
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
      this.queue.splice(at < 0 ? this.queue.length : at, 0, { priority, make, drop })
    }
    this.refresh()
  }

  /**
   * Requests a boss's moment once he stands on the ground: one that holds him in a planted pose (his roar, his
   * transformation) is not begun while he is in the air (the simulation runs on meanwhile). A flier hovers, and one
   * that never lands is posed after `LAND_WAIT_SECONDS`. With `hero` it also waits (in the same wait) for the hero
   * to stand on the ground (the boss's entrance poses him standing; swimming he is off the ground), and with
   * `between` for the boss to be between his actions (no leap, landing, volley or flinch showing).
   */
  private whenLanded(priority: number, make: () => Sequence | null, hero = false, between = false) {
    if (this.ended) return
    // (Never decided here, in the middle of a step's events: a hurt of the hero's may follow in the same step. The
    // wait is looked at once the whole step has been answered: `simStep`.)
    this.landings.push({ priority, make, waited: 0, heroWaited: 0, hero, between })
  }

  /**
   * Whether a waiting moment may begin: the boss's side is not negotiable (up to its backstop); the hero's is waited
   * for up to `LAND_WAIT_SECONDS` (after that a hero in the air is held there, as the simulation holds him), and,
   * for a moment that waits for the boss to be between his actions, no longer than the boss rests: once he winds up
   * for his next attack the moment begins (in the first moments of that wind-up, see
   * `ActorsView.bossBetweenActions`) wherever the hero is, so a hero who keeps hopping never makes him go through
   * another whole attack first.
   */
  private landed(hero: boolean, between = false, heroWaited = 0) {
    if (!this.bossReady(between)) return false
    if (!hero || this.heroReady() || heroWaited >= LAND_WAIT_SECONDS - 1e-9) return true
    // (Between his actions, he is waited for only while the boss stands or walks: in the first moments of a wind-up,
    // or on the step before his light or his cast, the moment begins and the hero hangs where he is.)
    return between && (this.host.world.boss?.state === 'windup' || this.host.view.actors.bossShotNext?.() === true)
  }

  /**
   * The boss is on the ground (a flier hovers), not in his slam and not landing (`ActorsView.bossSettled`); with
   * `between`, also between his actions.
   */
  private bossReady(between: boolean) {
    const { boss } = this.host.world
    const bossDown = !boss || boss.dead || boss.onGround || boss.def.kind === 'flyer'
    const actors = this.host.view.actors
    if (!bossDown || actors.bossSettled?.() === false) return false
    return !(between && actors.bossBetweenActions?.() === false)
  }

  /** The hero stands on the ground and is not being knocked back by a hit (or he is down). */
  private heroReady() {
    const { player } = this.host.world
    return player.dead || (player.onGround && !this.host.view.actors.heroKnocked?.())
  }

  /**
   * The backstop of a waiting moment: `BETWEEN_WAIT_SECONDS`, but never under a light part gathered or on the step
   * its shot leaves: a showing light's shot is waited for (`SHOT_CUE_SECONDS` at most), then the moment begins.
   */
  private backstop(waited: number) {
    if (waited < BETWEEN_WAIT_SECONDS - 1e-9) return false
    if (waited >= BETWEEN_WAIT_SECONDS + SHOT_CUE_SECONDS - 1e-9) return true
    const actors = this.host.view.actors
    return !(actors.bossLightShows?.() ?? false) && !this.shotThisStep
  }

  private advanceLandings(dt: number) {
    if (!this.landings.length) return
    for (let i = 0; i < this.landings.length; ) {
      const l = this.landings[i]
      l.waited += dt
      // (The hero's cap runs from the moment's cause: after it, a hero in the air hangs through the moment.)
      l.heroWaited += dt
      if (this.ended) this.landings.splice(i, 1)
      // (A moment waits for the hero up to `LAND_WAIT_SECONDS` of the boss being ready, for the boss to its backstop.)
      else if (this.landed(l.hero, l.between, l.heroWaited) || this.backstop(l.waited)) {
        this.landings.splice(i, 1)
        this.request(l.priority, l.make)
      } else i++
    }
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
    return (
      this.main?.name === 'boss-intro' ||
      this.queue.some((p) => p.priority === PRIORITY.intro) ||
      this.landings.some((p) => p.priority === PRIORITY.intro)
    )
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
    this.holdHero(c.scale <= 0 && Boolean(this.main?.running))
  }

  /**
   * Every moment that holds the simulation stands the hero on the ground: what he shows (a bite, a hurt) plays out on
   * real time, then he stands, until the hold ends (a moment that poses him itself keeps its own pose). In the air he
   * hangs. Slow motion is no hold.
   */
  private holdHero(held: boolean) {
    const actors = this.host.view.actors
    const { player, state } = this.host.world
    if (!actors?.standStill) return
    // (Taken once the step's events are all answered, never in the middle of them: `doBite` sends a boss's
    // `boss-down` before its own `bite`, and the bite of that step plays out under the hold, facing the side it bit.)
    if (held && this.stepDriven && this.answering) return
    if (held && !this.heroHeld && !actors.posing('hero') && state === 'play' && player.onGround && !player.dead) {
      this.heroHeld = actors.standStill(HOLD_POSE_SECONDS)
    } else if (!held && this.heroHeld) {
      actors.unposeIf('hero', this.heroHeld)
      this.heroHeld = null
    }
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
