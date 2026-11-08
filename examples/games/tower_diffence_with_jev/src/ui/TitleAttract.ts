import {
  ATTRACT_WARMUP_SECONDS,
  createAttractBattle,
  attractUnitTypes,
  warmUpAttractBattle,
  type AttractBattle
} from '../game/AttractBattle'
import { fieldFor } from '../game/model'
import { GAME_MODEL_PRESENTATION_SCALE } from '../rendering/BattlefieldPresentation'
import { GameRenderer, type AuthoredAtlasOptions } from '../rendering/GameRenderer'

/** Wait this long on the title before fetching anything, so quick starts download nothing extra. */
export const ATTRACT_START_DELAY_MS = 1500

/** Matches the CSS opacity transition of `.title-demo`. */
const ATTRACT_FADE_MS = 700

export type TitleAttractState = 'idle' | 'waiting' | 'loading' | 'running' | 'unavailable'

export interface TitleAttractEnvironment {
  reducedMotion(): boolean
  saveData(): boolean
}

/** The demo is decoration: honour reduced motion and data saving by keeping today's still title. */
export function titleAttractAllowed(environment: TitleAttractEnvironment): boolean {
  return !environment.reducedMotion() && !environment.saveData()
}

const browserEnvironment: TitleAttractEnvironment = {
  reducedMotion: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  saveData: () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection
    return !!connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')
  }
}

/**
 * A self-playing battle behind the title. It has its own engine (local rule AI, private save, no storage)
 * and its own renderer/WebGL context, so the real game's engine, renderer and caches are never touched.
 * Audio, HUD, feedback and coach marks are simply never connected to it.
 */
export class TitleAttract {
  private state: TitleAttractState = 'idle'
  private host?: HTMLElement
  private renderer?: GameRenderer
  private battle?: AttractBattle
  private request?: AbortController
  private timer = 0
  private idle = 0
  private frameId = 0
  private lastFrame = 0
  private frames = 0
  private loops = 0
  private failure = ''
  private readonly onVisibility = () => this.requestFrame()
  private readonly onResize = () => this.layout()

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly artBase: URL,
    private readonly rendererOptions: () => AuthoredAtlasOptions,
    private readonly environment: TitleAttractEnvironment = browserEnvironment
  ) {}

  /** Schedule the demo while the title is open; repeated calls are harmless. */
  start(): void {
    if (this.state !== 'idle' || !this.dialog.open || !titleAttractAllowed(this.environment)) return
    this.state = 'waiting'
    this.timer = window.setTimeout(() => {
      this.timer = 0
      const begin = () => {
        this.idle = 0
        if (this.state === 'waiting') void this.load()
      }
      if (typeof requestIdleCallback === 'function') this.idle = requestIdleCallback(begin, { timeout: 1000 })
      else begin()
    }, ATTRACT_START_DELAY_MS)
  }

  /** Stop at once and release the demo's GPU context; the title returns to its still artwork. */
  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(this.idle)
    this.timer = this.idle = 0
    if (this.frameId) cancelAnimationFrame(this.frameId)
    this.frameId = 0
    this.request?.abort()
    this.request = undefined
    this.release()
    // A failure keeps today's still title for the rest of this page.
    if (this.state !== 'unavailable') this.state = 'idle'
  }

  diagnostics() {
    const engine = this.battle?.engine.state
    return {
      state: this.state,
      frames: this.frames,
      loops: this.loops,
      loop: this.battle?.loop ?? null,
      stage: engine?.stage ?? null,
      phase: engine?.phase ?? null,
      time: engine?.time ?? 0,
      enemiesResolved: engine?.stageSummary.resolved ?? 0,
      units: engine?.units.filter((unit) => unit.hp > 0).length ?? 0,
      specialsCast: this.battle?.specialsCast ?? 0,
      failure: this.failure
    }
  }

  private async load(): Promise<void> {
    const request = new AbortController()
    this.request = request
    this.state = 'loading'
    try {
      const host = document.createElement('div')
      host.className = 'title-demo'
      host.setAttribute('aria-hidden', 'true')
      host.inert = true
      const field = document.createElement('div')
      field.className = 'title-demo-field'
      host.append(field)
      this.dialog.prepend(host)
      this.host = host
      this.renderer = new GameRenderer(field, this.rendererOptions())
      this.renderer.onContextLost = () => this.fail('context lost')
      await this.nextBattle(request.signal)
      if (request.signal.aborted) return
      window.addEventListener('resize', this.onResize)
      document.addEventListener('visibilitychange', this.onVisibility)
      this.state = 'running'
      this.dialog.dataset.attract = 'running'
      host.dataset.state = 'running'
      this.lastFrame = performance.now()
      this.requestFrame()
    } catch (error) {
      if (!request.signal.aborted) this.fail(error instanceof Error ? error.message : String(error))
    }
  }

  /** Build the next battle and prepare exactly its roles on the demo renderer. */
  private async nextBattle(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const renderer = this.renderer
    if (!renderer) throw new Error('demo renderer released')
    const battle = createAttractBattle(this.loops, {
      specialReady: (type) => renderer.specialAbilityStatus(type) === 'ready'
    })
    const state = battle.engine.state
    await renderer.prepareCampaign(this.artBase, state, signal, () => {}, attractUnitTypes(state))
    await warmUpAttractBattle(battle, ATTRACT_WARMUP_SECONDS, signal)
    signal.throwIfAborted()
    this.battle = battle
    this.loops++
    this.layout()
  }

  private layout(): void {
    const host = this.host,
      renderer = this.renderer,
      battle = this.battle
    if (!host || !renderer || !battle) return
    // Fill the whole title like the battlefield fills the game screen: the projected map widens or
    // narrows with the viewport while actors keep their proportions (same rule as battlefieldPresentation).
    const field = fieldFor(battle.engine.state),
      scaleX = window.innerWidth / field.width,
      scaleY = window.innerHeight / field.height,
      element = host.firstElementChild as HTMLElement
    renderer.setPresentation(GAME_MODEL_PRESENTATION_SCALE, scaleX / scaleY)
    element.style.width = `${field.width}px`
    element.style.height = `${field.height}px`
    element.style.transform = `scale(${scaleX}, ${scaleY})`
  }

  private requestFrame(): void {
    if (this.frameId || this.state !== 'running' || document.visibilityState === 'hidden') return
    this.frameId = requestAnimationFrame((now) => this.frame(now))
  }

  private frame(now: number): void {
    this.frameId = 0
    const battle = this.battle,
      renderer = this.renderer
    if (this.state !== 'running' || !battle || !renderer || !this.dialog.open) return
    // A hidden tab or a long stall never replays: one capped step per frame.
    const dt = Math.max(0, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    try {
      battle.advance(dt)
      renderer.render(battle.engine.state, null, true, 'soldier')
      this.frames++
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
      return
    }
    if (battle.finished) {
      const request = this.request,
        host = this.host
      if (!request || !host) return
      // Fade the finished field out, then prepare the next battle's roles while nothing is shown.
      this.state = 'loading'
      host.dataset.state = 'changing'
      void new Promise((resolve) => setTimeout(resolve, ATTRACT_FADE_MS))
        .then(() => this.nextBattle(request.signal))
        .then(() => {
          if (request.signal.aborted || this.request !== request) return
          this.state = 'running'
          host.dataset.state = 'running'
          this.lastFrame = performance.now()
          this.requestFrame()
        })
        .catch((error: unknown) => {
          if (!request.signal.aborted) this.fail(error instanceof Error ? error.message : String(error))
        })
      return
    }
    this.requestFrame()
  }

  private fail(reason: string): void {
    this.failure = reason
    this.request?.abort()
    this.request = undefined
    if (this.frameId) cancelAnimationFrame(this.frameId)
    this.frameId = 0
    this.release()
    this.state = 'unavailable'
  }

  private release(): void {
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    delete this.dialog.dataset.attract
    const renderer = this.renderer,
      canvas = this.host?.querySelector('canvas')
    this.renderer = undefined
    this.battle = undefined
    if (renderer) {
      renderer.onContextLost = undefined
      try {
        renderer.dispose()
      } catch {
        // Disposal of decoration must never block leaving the title.
      }
      // Free the GPU context now instead of waiting for garbage collection, so repeated
      // title visits can never push the real game's context over the browser's limit.
      try {
        canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
      } catch {
        // Already lost or unsupported.
      }
    }
    this.host?.remove()
    this.host = undefined
  }
}
