/**
 * Rastering the HUD ahead of its first use. The browser compiles a shader program the first time a kind of content
 * (a rounded plate, a gradient under a clip, a filtered canvas) is drawn, and the GPU process stands still while it
 * does. When that is the first frame of a stage the player sees it. Here, once the title is up and the page is idle,
 * the HUD is laid out and walked through its states for a few seconds where nobody can see it (nearly transparent,
 * not clickable, not focusable, out of the accessibility tree and not "visible" to `visibility` checks), then put
 * away again. It does this once for each of the two layouts (landscape and portrait with the deck).
 */
import { STAGES } from '../game/stages'
import { TILE, type StageDef } from '../game/types'
import type { World } from '../game/sim'
import type { HudApi } from './hud'

/** What the walk needs of the HUD. */
export interface PrimeTarget extends HudApi {
  readonly root: HTMLElement
  setStage(stage: StageDef): void
  /** The HUD's own per-frame update, bypassing anything that wraps `update` from outside. */
  step(world: World, dt: number): void
  /** Puts the HUD on screen without ending a walk. */
  reveal(): void
  /** Takes the HUD off screen and clears what the staging left on it. */
  hide(): void
  /** True while the stage's own HUD is on screen. */
  readonly shown: boolean
}

/** How long after the title's first picture the walk may start (its enter animations are over by then). */
const START_DELAY_MS = 1200

const layout = () =>
  typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'

/** Thrown inside a walk that the stage's own HUD has cut short. */
class Ended extends Error {}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** A world with only the fields the HUD reads. */
function rehearsalWorld(stage: StageDef) {
  return {
    w: 100,
    goalX: 90 * TILE,
    time: 0,
    collected: 0,
    kills: 0,
    goalOpen: false,
    state: 'play',
    player: { hp: 5, maxHp: 5, x: 0, w: 12, biteCooldown: 0 },
    boss: null as null | {
      def: { art: string; name: string; stamina?: boolean }
      hp: number
      maxHp: number
      stamina: number
      maxStamina: number
      dead: boolean
      active: boolean
      x: number
      w: number
    },
    stage
  }
}

/** A boss of the stage as the HUD reads it. */
function rehearsalBoss(stage: StageDef) {
  return {
    def: { art: stage.boss.art, name: stage.boss.name, stamina: Boolean(stage.boss.stamina) },
    hp: 5,
    maxHp: 5,
    stamina: 100,
    maxStamina: 100,
    dead: false,
    active: false,
    x: 60 * TILE,
    w: 40
  }
}

export class HudPrimer {
  private done = new Set<string>()
  private token = 0
  private running = false
  /** True while the walk itself calls into the HUD (those calls must not end it). */
  private acting = false
  private timer = 0

  constructor(private hud: PrimeTarget) {}

  /** Starts a walk when the page is idle, if this layout has not had one. Called when the title is up. */
  whenIdle() {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      const start = () => void this.run()
      if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 2000 })
      else start()
    }, START_DELAY_MS)
  }

  /** The stage's own HUD takes over: a walk in progress ends now and leaves nothing behind. */
  stop() {
    clearTimeout(this.timer)
    if (!this.running) return
    this.token += 1
    this.running = false
    this.restore()
  }

  /** True while a walk is in progress and the caller is not the walk itself. */
  get busy() {
    return this.running && !this.acting
  }

  /** Called at the start of every other use of the HUD: a walk in progress ends before the stage's own HUD is touched. */
  interrupt() {
    if (this.busy) this.stop()
  }

  /** The layout changed: if the HUD is not in use, walk it through the new one. */
  layoutChanged() {
    if (this.running) this.stop()
    if (!this.hud.shown) this.whenIdle()
  }

  private restore() {
    const root = this.hud.root
    root.classList.remove('is-priming')
    root.removeAttribute('inert')
    root.removeAttribute('aria-hidden')
    this.hud.hide()
  }

  private async run() {
    const hud = this.hud
    const key = layout()
    if (this.running || this.done.has(key) || hud.shown || document.hidden) return
    this.running = true
    const token = ++this.token
    const alive = () => token === this.token
    const root = hud.root
    root.classList.add('is-priming')
    root.setAttribute('inert', '')
    root.setAttribute('aria-hidden', 'true')
    try {
      const collect = STAGES.find((stage) => stage.objective === 'collect') ?? STAGES[0]
      const chase = STAGES.find((stage) => stage.boss.stamina) ?? STAGES[0]
      const world = rehearsalWorld(collect)
      // Once the stage's own HUD has taken over, the walk must not touch it again: it ends at the next frame boundary.
      const act = (call: () => void) => {
        this.acting = true
        try {
          call()
        } finally {
          this.acting = false
        }
      }
      // Runs the HUD's frames for `ms` milliseconds (animations take their time whatever the frame rate).
      const phase = async (ms: number) => {
        const until = performance.now() + ms
        let last = performance.now()
        do {
          if (!alive()) throw new Ended()
          await nextFrame()
          // The stage's own HUD may have taken over while this waited for the frame: not one more step then.
          if (!alive()) throw new Ended()
          const now = performance.now()
          const dt = Math.min(0.05, (now - last) / 1000)
          last = now
          world.time += dt
          act(() => hud.step(world as unknown as World, dt))
        } while (performance.now() < until)
        if (!alive()) throw new Ended()
      }
      act(() => {
        hud.setStage(collect)
        hud.reveal()
      })
      await phase(150)
      // A heart lost and low health; the bite gauge empties; hearts and counters change in turn.
      world.player.hp = 4
      world.player.biteCooldown = 0.36
      await phase(200)
      world.player.hp = 2
      world.player.biteCooldown = 0.18
      await phase(150)
      world.player.hp = 5
      world.player.biteCooldown = 0
      world.kills = 1
      world.collected = 1
      await phase(150)
      world.goalOpen = true
      // A boss with hit points and one with stamina: asleep, awake, hit.
      let boss = rehearsalBoss(collect)
      for (const stage of [collect, chase]) {
        boss = rehearsalBoss(stage)
        world.boss = boss
        act(() => hud.showBoss(stage.boss.name, stage.boss.title))
        await phase(150)
        boss.active = true
        boss.hp = 3
        boss.stamina = 60
        await phase(200)
        if (stage === collect) world.boss = null
      }
      // The boss bar breaks away while the staging pieces, the deck's lines, the letterbox and the lights play.
      act(() => {
        hud.hideBoss()
        hud.showBanner(collect.name, collect.subtitle, 0.6)
        hud.showToast('かじってみよう')
        hud.showNameplate(chase.boss.name, chase.boss.title, `face_${chase.boss.art}`, 1)
        hud.speak('まって！', collect.boss.name, `face_${chase.boss.art}`, 0.5, 'yell')
        hud.cinematic(true)
        hud.lights(false)
      })
      boss.dead = true
      await phase(950)
      act(() => {
        world.boss = null
        hud.cinematic(false)
        hud.lights(true)
        hud.showCall('スタート！')
      })
      await phase(300)
      if (alive()) this.done.add(key)
    } catch (error) {
      if (!(error instanceof Ended)) throw error
    } finally {
      if (alive()) {
        this.running = false
        this.restore()
      }
      this.acting = false
    }
  }
}
