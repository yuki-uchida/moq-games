import * as THREE from 'three'
import { ALLY_TYPES, DEFINITIONS, type AllyType, type UnitType } from '../game/model'
import { ATTACK_PROFILES } from '../game/AttackProfiles'
import { STACK_DESIGNS } from '../rendering/stack/designs'
import type { StackMotion } from '../rendering/stack/StackDesign'
import { STACK_SPACING, STACK_SQUASH } from '../rendering/stack/SliceSheet'
import { StackVisual } from '../rendering/stack/StackVisual'

export const viewerRoles = () => Object.keys(STACK_DESIGNS) as UnitType[]
export const viewerRoleLabel = (role: UnitType) => DEFINITIONS[role].name
const isAlly = (role: UnitType) => ALLY_TYPES.includes(role as AllyType)

/** The motions the game actually plays for a role. */
export function viewerMotions(role: UnitType): StackMotion[] {
  if (!STACK_DESIGNS[role]) return []
  const motions: StackMotion[] = ['idle', 'walk', role === 'healer' ? 'heal' : 'attack']
  if (role === 'dragon') motions.push('breath')
  if (isAlly(role)) motions.push('special', 'death')
  return motions
}

/**
 * Plays one SpriteCook sprite-stacked figure at the origin.
 * Orbiting the viewer camera interactively turns `turn` 360° and tilts `squash` smoothly!
 */
export class StackViewerSession {
  readonly root = new THREE.Group()
  private readonly holder = new THREE.Group()
  private visual?: StackVisual
  private disposed = false
  role?: UnitType
  motion?: StackMotion
  duration = 0
  seconds = 0
  paused = true
  speed = 1
  state: 'empty' | 'ready' | 'error' | 'disposed' = 'empty'
  error = ''

  constructor() {
    // Flip local Y so board-down (+y in SpriteCook sheet) renders downward in standard +Y-up camera space.
    this.holder.scale.set(1, -1, 1)
    this.root.add(this.holder)
  }

  select(role: UnitType, motion: StackMotion): void {
    if (this.disposed) return
    this.release()
    this.role = role
    this.motion = motion
    this.seconds = 0
    this.paused = false
    this.error = ''
    const design = STACK_DESIGNS[role]
    if (!design || !viewerMotions(role).includes(motion)) {
      this.state = 'error'
      this.error = 'この動作はありません。'
      return
    }
    this.visual = new StackVisual(design, 0.3)
    this.visual.setPresentation(1, 1)
    this.visual.setPosition(0, 0)
    this.visual.setShadowVisible(false)
    this.visual.setViewOverride(-0.45, STACK_SQUASH)
    this.holder.add(this.visual.root)
    const profile = ATTACK_PROFILES[role]
    this.duration =
      motion === 'idle'
        ? 3
        : motion === 'walk'
          ? 1
          : motion === 'death'
            ? 0.82
            : motion === 'special'
              ? 1.6
              : (profile?.durationMs ?? 900) / 1000
    this.state = 'ready'
    this.tick(0)
  }

  /** Sync SpriteCook `turn` and `squash` to the orbiting camera so users can inspect every angle. */
  syncCamera(camera: THREE.Camera, target: THREE.Vector3): void {
    if (!this.visual) return
    const offset = camera.position.clone().sub(target)
    const horiz = Math.hypot(offset.x, offset.z)
    const azimuth = Math.atan2(offset.x, offset.z)
    const elevation = Math.atan2(Math.max(0, offset.y), Math.max(1e-4, horiz))
    const squash = Math.max(0.42, Math.min(1.0, Math.sin(elevation) * 0.65 + 0.5))
    this.visual.setViewOverride(-azimuth, squash)
    this.root.quaternion.copy(camera.quaternion)
    this.root.position.copy(target)
  }

  get loop(): boolean {
    return !!this.motion && this.motion !== 'death'
  }

  tick(delta: number): void {
    if (!this.visual || this.state !== 'ready' || !this.role || !this.motion || this.disposed) return
    if (!this.paused && Number.isFinite(delta) && delta > 0) {
      this.seconds += Math.min(delta, 0.1) * this.speed
      if (this.loop) this.seconds %= this.duration
      else if (this.seconds >= this.duration) {
        this.seconds = this.duration
        this.paused = true
      }
    }
    const profile = ATTACK_PROFILES[this.role]
    const death = this.motion === 'death'
    this.visual.sample({
      motion: death ? 'idle' : this.motion,
      seconds: death ? 0 : this.seconds,
      cycle: this.motion === 'walk' ? this.seconds : undefined,
      time: death ? 0 : this.seconds,
      facingX: 0,
      facingY: 1,
      boss: false,
      durationMs: profile?.durationMs,
      cueMs: profile?.cueMs
    })
    if (death) this.visual.sampleFall(this.seconds)
  }

  /** Rest-pose bounds in world units, for camera fitting. */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3()
    if (!this.visual) return box
    const { sliceWidth, sliceHeight, sliceCount, baseLift } = this.visual.atlas
    const cell = this.visual.design.voxel
    const halfW = (Math.max(sliceWidth, sliceHeight) * 0.5 + 2) * cell
    const totalH = (baseLift + sliceCount * STACK_SPACING + sliceHeight * 0.5 + 2) * cell
    box.set(new THREE.Vector3(-halfW, 0, -halfW), new THREE.Vector3(halfW, totalH, halfW))
    return box
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
      actor: this.visual?.diagnostics()
    }
  }

  private release(): void {
    this.visual?.dispose()
    this.visual = undefined
    this.holder.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.paused = true
    this.release()
    this.root.clear()
    this.state = 'disposed'
  }
}
