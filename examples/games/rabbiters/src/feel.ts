import type { GameState } from './game'
import { JuiceDetector } from './juice'
import type { JuiceEvent, JuicePoint } from './juice-events'
import { RabbitersSfx, type UiSound } from './sfx'
import { HudFx, attachButtonJuice, threatFor } from './hud-fx'
import type { WorldFx } from './fx'
import { ThreatTracker } from './audio'

/** What the feel layer needs from the 3D scene: its particles and a way to put a world point on screen. */
export interface FeelScene {
  readonly fx: WorldFx
  screenPoint(point: JuicePoint): { x: number; y: number } | null
}

/**
 * Game feel: turns snapshot changes into sounds (sfx), particles and camera shake (scene.fx) and screen effects
 * (HudFx). Purely client-side — derived from the same snapshots every client already has.
 */
export class GameFeel {
  private readonly detector = new JuiceDetector()
  private readonly sfx = new RabbitersSfx()
  private readonly hud: HudFx
  private readonly detach: () => void
  private chasing = false
  private hidden = false
  private readonly threats = new ThreatTracker()
  private time = -Infinity
  private stage: number | undefined
  private playerId = ''
  private escaped: JuiceEvent | null = null
  private hudAvailable = false
  private retryPending = false

  constructor(
    private readonly scene: FeelScene,
    root: HTMLElement,
    private readonly onSpotted?: () => void
  ) {
    this.hud = new HudFx(root)
    // A button press is a user gesture, so menus can wake the audio before play starts.
    this.detach = attachButtonJuice(root, () => {
      this.sfx.start()
      this.sfx.ui('tap')
    })
  }

  start(): void {
    this.sfx.start()
  }

  stop(): void {
    this.sfx.stop()
    this.reset()
  }

  setMuted(muted: boolean): void {
    this.sfx.setMuted(muted)
  }

  ui(kind: UiSound): void {
    this.sfx.ui(kind)
  }

  get isChasing(): boolean {
    return this.chasing
  }

  /** Forget the last snapshot (new run, retry, back to title) so nothing fires for the jump between them. */
  reset(state?: GameState, localPlayerId = ''): void {
    this.threats.reset()
    this.time = -Infinity
    this.stage = undefined
    this.playerId = ''
    this.escaped = null
    this.hudAvailable = false
    this.retryPending = !!state
    this.detector.reset()
    this.hud.reset()
    this.setChase(false)
    this.setHidden(false)
    if (state) {
      this.time = state.time
      this.playerId = localPlayerId
      this.stage = state.stage
      this.detector.update(state, localPlayerId)
    }
  }

  /** Call once per frame with the live snapshot, or undefined when not playing. */
  update(state: GameState | undefined, localPlayerId: string): void {
    if (state && state.time < this.time) return
    if (!state || this.playerId !== localPlayerId) this.reset()
    this.playerId = localPlayerId
    if (state) {
      if (this.stage !== undefined && this.stage !== state.stage) {
        this.hud.reset()
        this.threats.reset()
        this.escaped = null
      }
      this.stage = state.stage
      this.time = state.time
      this.threats.update(state)
    }
    const localPlayer = state?.players.find((entry) => entry.id === localPlayerId)
    const hudAvailable = state?.phase === 'playing' && !!localPlayer
    if (this.hudAvailable && !hudAvailable) this.hud.reset(state?.phase === 'lost')
    this.hudAvailable = hudAvailable
    const threat = threatFor(state, localPlayerId, this.threats)
    this.hud.setThreat(threat, state?.phase === 'playing' && !!localPlayer && !localPlayer.downed)
    if (!state) {
      this.setChase(false)
      this.setHidden(false)
      return
    }
    const active = state.phase === 'playing' && !!localPlayer && !localPlayer.downed
    if (!active || threat.mode === 'chase') this.escaped = null
    const events = this.detector.update(state, localPlayerId)
    if (this.retryPending) {
      this.retryPending = false
      const predator = state.predators.find((entry) => entry.state === 'suspicious' && entry.targetId === localPlayerId)
      if (
        threat.mode === 'suspicious' &&
        predator &&
        !events.some((event) => event.type === 'suspicious' || (event.type === 'spotted' && event.you))
      )
        this.emit({ type: 'suspicious', at: { x: predator.x, y: predator.y, z: predator.z } })
    }
    for (const event of events) {
      if (event.type === 'escaped') {
        if (active) this.escaped = event
      } else this.emit(event, state.phase === 'lost')
    }
    if (this.escaped && threat.mode === 'clear' && active) {
      this.emit(this.escaped)
      this.escaped = null
    }
    const player = state.players.find((entry) => entry.id === localPlayerId)
    const playing = state.phase === 'playing' && !!player && !player.downed
    this.setChase(playing && threat.mode === 'chase')
    this.setHidden(playing && player.hidden && !this.chasing)
  }

  dispose(): void {
    this.sfx.stop()
    this.detach()
    this.hud.dispose()
  }

  private emit(event: JuiceEvent, aboveResult = false): void {
    if (event.type === 'spotted' && event.you) this.onSpotted?.()
    this.sfx.play(event)
    this.scene.fx.emit(event)
    const at = 'at' in event ? event.at : undefined
    this.hud.emit(event, at ? this.scene.screenPoint(at) : null, aboveResult)
  }

  private setChase(active: boolean): void {
    if (active === this.chasing) return
    this.chasing = active
    this.sfx.setChase(active)
    this.hud.setChase(active)
  }

  private setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return
    this.hidden = hidden
    this.hud.setHidden(hidden)
  }
}
