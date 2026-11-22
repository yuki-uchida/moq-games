import * as THREE from 'three'
import { ALLY_TYPES, DEFINITIONS, type AllyType, type UnitType } from '../game/model'
import { ATTACK_PROFILES } from '../game/AttackProfiles'
import { STACK_DESIGNS } from '../rendering/stack/designs'
import type { StackMotion } from '../rendering/stack/StackDesign'
import { MAX_STACK_PARTS } from '../rendering/stack/StackModel'
import { poseMatrices } from '../rendering/stack/StackRig'
import { StackVisual, stackBoardMatrix } from '../rendering/stack/StackVisual'

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

/** Plays one sprite-stacked figure upright at the origin, with the game's own poses. */
export class StackViewerSession {
  readonly root = new THREE.Group()
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
    this.visual.setPosition(0, 0)
    // Undo the board projection so the figure stands upright in cell units.
    this.root.matrixAutoUpdate = false
    this.root.matrix.copy(stackBoardMatrix(new THREE.Matrix4(), 0, 0, 0, 1)).invert()
    this.root.matrixWorldNeedsUpdate = true
    this.root.add(this.visual.root)
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
  /** Rest-pose bounds in cells, for camera fitting (parts move in the shader). */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3()
    if (!this.visual) return box
    const model = this.visual.model
    const matrices = poseMatrices(model, this.visual.lastPose, new Float32Array(MAX_STACK_PARTS * 16))
    const m = new THREE.Matrix4()
    model.parts.forEach((part, i) => {
      if (part.max[0] < part.min[0]) return
      m.fromArray(matrices, i * 16)
      for (const x of [part.min[0], part.max[0] + 1])
        for (const y of [part.min[1], part.max[1] + 1])
          for (const z of [part.min[2], part.max[2] + 1]) box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(m))
    })
    const cell = this.visual.design.voxel
    box.min.multiplyScalar(cell)
    box.max.multiplyScalar(cell)
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
    this.root.clear()
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.paused = true
    this.release()
    this.state = 'disposed'
  }
}
