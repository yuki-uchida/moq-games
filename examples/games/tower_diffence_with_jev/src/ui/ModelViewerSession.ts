import * as THREE from 'three'
import { ModelAssetCache } from '../rendering/ModelAssetCache'
import { ModelUnitVisual, type ModelMotion, type UnitModelDefinition } from '../rendering/ModelUnitVisual'
import { UNIT_MODEL_CATALOG } from '../rendering/models/catalog'
import { DEFINITIONS, type UnitType } from '../game/model'

const motionOrder: readonly ModelMotion[] = ['idle', 'walk', 'attack', 'heal', 'breath', 'death']
export const viewerRoles = () => Object.keys(UNIT_MODEL_CATALOG) as UnitType[]
export const viewerRoleLabel = (role: UnitType) => DEFINITIONS[role].name
export const viewerMotions = (definition: UnitModelDefinition): ModelMotion[] =>
  motionOrder.filter((motion) => !!definition.clips[motion])

/** Uses the game's actor and adapters. Only the preview clock and camera are independent. */
export class ModelViewerSession {
  readonly root = new THREE.Group()
  private visual?: ModelUnitVisual
  private definition?: UnitModelDefinition
  private cache?: ModelAssetCache
  private disposed = false
  role?: UnitType
  motion?: ModelMotion
  duration = 0
  seconds = 0
  paused = true
  speed = 1
  state: 'empty' | 'loading' | 'ready' | 'error' | 'disposed' = 'empty'
  error = ''
  constructor(private readonly createCache = () => new ModelAssetCache()) {}

  select(role: UnitType, motion: ModelMotion): void {
    if (this.disposed) return
    this.releaseActor()
    this.role = role
    this.motion = motion
    this.seconds = this.duration = 0
    this.paused = true
    this.error = ''
    this.definition = UNIT_MODEL_CATALOG[role]
    if (!this.definition?.clips[motion]) {
      this.state = 'error'
      this.error = 'この動作の3Dモデルはありません。'
      return
    }
    this.cache = this.createCache()
    this.visual = new ModelUnitVisual(this.definition, this.cache)
    // Undo only the board's presentation tilt for an upright inspection space.
    // The actor still owns normalization, facing, clip time scales and adapters.
    this.root.matrixAutoUpdate = false
    this.root.matrix.copy(this.visual.root.matrix).invert()
    this.root.matrixWorldNeedsUpdate = true
    this.root.add(this.visual.root)
    this.state = 'loading'
    this.visual.prepare([motion])
  }

  tick(delta: number): void {
    if (!this.visual || !this.cache || !this.definition || !this.motion || this.disposed) return
    if (this.state === 'loading') {
      const source = this.definition.clips[this.motion]!
      const state = this.cache.request(source.url)
      if (state === 'error') {
        this.state = 'error'
        this.error = '3Dモデルを読み込めませんでした。Retry で再試行できます。'
        return
      }
      if (state !== 'ready') return
      try {
        const lease = this.cache.acquire(source)
        if (!lease) return
        this.duration = lease.clip.duration / (this.motion === 'attack' ? (this.definition.attackTimeScale ?? 1) : 1)
        lease.release()
        if (!Number.isFinite(this.duration) || this.duration <= 0) throw new Error('Invalid animation duration')
        this.state = 'ready'
      } catch (error) {
        this.fail(error)
        return
      }
    }
    if (this.state !== 'ready') return
    if (!this.paused && Number.isFinite(delta) && delta > 0) {
      this.seconds += Math.min(delta, 0.1) * this.speed
      if (this.loop) this.seconds %= this.duration
      else if (this.seconds >= this.duration) {
        this.seconds = this.duration
        this.paused = true
      }
    }
    try {
      this.visual.sample({
        motion: this.motion,
        seconds: this.seconds,
        loop: this.loop,
        facingX: 0,
        facingY: 1,
        boss: false
      })
    } catch (error) {
      this.fail(error)
    }
  }
  private fail(error: unknown): void {
    this.state = 'error'
    this.paused = true
    this.error = `3Dモデルを再生できませんでした。${error instanceof Error ? error.message : ''}`
    if (this.visual) this.visual.root.visible = false
  }
  get loop(): boolean {
    return this.motion === 'idle' || this.motion === 'walk'
  }
  toggle(): void {
    if (this.state !== 'ready') return
    if (this.paused && this.seconds >= this.duration) this.seconds = 0
    this.paused = !this.paused
  }
  seek(seconds: number): void {
    if (this.state !== 'ready' || !Number.isFinite(seconds)) return
    this.paused = true
    this.seconds = Math.max(0, Math.min(this.duration, seconds))
    this.tick(0)
  }
  pause(): void {
    this.paused = true
  }
  diagnostics() {
    return {
      role: this.role,
      motion: this.motion,
      state: this.state,
      seconds: this.seconds,
      duration: this.duration,
      paused: this.paused,
      actor: this.visual?.diagnostics(),
      cache: this.cache?.diagnostics()
    }
  }
  private releaseActor(): void {
    this.visual?.dispose()
    this.cache?.dispose()
    this.visual = undefined
    this.cache = undefined
    this.root.clear()
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.paused = true
    this.releaseActor()
    this.state = 'disposed'
  }
}
