import { MODEL_BOSS_SCALE, modelGroundDepth } from './BoardCamera'
import * as THREE from 'three'
import type { CombatAttack, Unit } from '../game/model'
import { attackAssetElapsedMs } from '../game/AttackProfiles'
import { ModelAssetCache, type ModelLease, type ModelSource } from './ModelAssetCache'

export type ModelMotion = 'idle' | 'walk' | 'attack' | 'heal' | 'breath' | 'death'
export interface UnitModelDefinition {
  /** Measured against the accepted imported bind pose, shared across motion rigs. */
  readonly scale: number
  readonly origin: readonly [number, number, number]
  readonly yaw: number
  readonly viewElevation?: number
  readonly clips: Readonly<Partial<Record<ModelMotion, ModelSource>>>
  readonly walkDistance: number
  readonly attackTimeScale?: number
  readonly provenance: string
  readonly emitter?: { readonly node: string; readonly local?: readonly [number, number, number] }
}
export interface ModelPose {
  readonly motion: ModelMotion
  readonly seconds: number
  readonly cycle?: number
  readonly loop: boolean
  readonly facingX: number
  readonly facingY: number
  readonly boss: boolean
}

/** Animation sampling is simulation-owned: tab freezes, pause and save resume cannot drift hits. */
export function unitModelPose(unit: Unit, time: number, action?: CombatAttack): ModelPose {
  const active = action && action.status !== 'cancelled' && time < action.endsAt
  const motion: ModelMotion =
    unit.hp <= 0
      ? 'death'
      : active
        ? action.variant === 'breath' || !!action.breath
          ? 'breath'
          : action.kind === 'heal' || unit.type === 'healer'
            ? 'heal'
            : 'attack'
        : unit.moving
          ? 'walk'
          : 'idle'
  return {
    motion,
    seconds: active ? attackAssetElapsedMs(action, time) / 1000 : time,
    loop: motion === 'idle' || motion === 'walk',
    facingX: active ? (action.aim?.x ?? unit.facingX) : unit.facingX,
    facingY: active ? (action.aim?.y ?? unit.facingY) : unit.facingY,
    boss: unit.boss
  }
}

/** True polygonal actor, never a billboard or a render-to-texture sprite. */
export class ModelUnitVisual {
  readonly root = new THREE.Group()
  private turn = new THREE.Group()
  private normalized = new THREE.Group()
  private leases = new Map<string, { lease: ModelLease; mixer: THREE.AnimationMixer; action: THREE.AnimationAction }>()
  private active?: { lease: ModelLease; mixer: THREE.AnimationMixer; action: THREE.AnimationAction }
  private disposed = false
  private presentationAspect = 1
  private lastMotion?: ModelMotion
  private lastSample = 0
  private lastPose?: ModelPose
  private appearance = { opacity: 1, tint: new THREE.Color(0xffffff) }
  private materialBases = new Map<
    THREE.Material,
    { color?: THREE.Color; opacity: number; transparent: boolean; depthWrite: boolean }
  >()
  constructor(
    readonly definition: UnitModelDefinition,
    private readonly cache: ModelAssetCache
  ) {
    this.root.name = 'real3d-unit'
    // Keep game ground coordinates unchanged. The imported Y-up mesh is tilted into
    // the board's orthographic XY view; model depth stays real and depth-tested.
    const tilt = definition.viewElevation ?? Math.atan2(2, 5)
    this.root.matrixAutoUpdate = false
    this.root.matrix.set(
      1,
      0,
      0,
      0,
      0,
      -Math.cos(tilt),
      Math.sin(tilt),
      0,
      0,
      Math.sin(tilt),
      Math.cos(tilt),
      0,
      0,
      0,
      0,
      1
    )
    this.root.add(this.turn)
    this.turn.add(this.normalized)
    this.normalized.scale.setScalar(definition.scale)
    this.normalized.position.fromArray(definition.origin).multiplyScalar(-definition.scale)
    this.root.visible = false
  }
  setPosition(x: number, y: number): void {
    this.root.matrix.setPosition(x, y, modelGroundDepth(y))
    this.root.matrixWorldNeedsUpdate = true
  }
  /** Counter the wider board presentation so meshes keep their authored proportions. */
  setPresentation(scale: number, aspect: number): void {
    this.presentationAspect = aspect
    const tilt = this.definition.viewElevation ?? Math.atan2(2, 5)
    const position = new THREE.Vector3().setFromMatrixPosition(this.root.matrix)
    this.root.matrix.set(
      scale / aspect,
      0,
      0,
      position.x,
      0,
      -Math.cos(tilt) * scale,
      Math.sin(tilt) * scale,
      position.y,
      0,
      Math.sin(tilt) * scale,
      Math.cos(tilt) * scale,
      position.z,
      0,
      0,
      0,
      1
    )
    this.root.matrixWorldNeedsUpdate = true
  }
  prepare(motions: readonly ModelMotion[] = ['idle', 'walk', 'attack']): boolean {
    let ready = true
    for (const motion of motions) {
      const spec = this.definition.clips[motion]
      if (!spec) {
        ready = false
        continue
      }
      if (this.cache.request(spec.url) !== 'ready') ready = false
    }
    return ready
  }
  sample(pose: ModelPose): boolean {
    if (this.disposed) return false
    const spec = this.definition.clips[pose.motion]
    if (!spec)
      throw new Error(`Missing required ${pose.motion} model; refusing a different animation or sprite fallback`)
    const key = `${spec.url}#${spec.clip}`
    let instance = this.leases.get(key)
    if (!instance) {
      const lease = this.cache.acquire(spec)
      if (!lease) return false
      const mixer = new THREE.AnimationMixer(lease.scene)
      const action = mixer.clipAction(lease.clip)
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      instance = { lease, mixer, action }
      this.leases.set(key, instance)
      this.normalized.add(lease.scene)
      this.applyAppearance(lease.scene)
    }
    if (this.active !== instance) {
      if (this.active) this.active.lease.scene.visible = false
      this.active = instance
      instance.lease.scene.visible = true
    }
    const duration = instance.lease.clip.duration
    const sampleTime =
      pose.cycle === undefined
        ? pose.seconds * (pose.motion === 'attack' ? (this.definition.attackTimeScale ?? 1) : 1)
        : pose.cycle * duration
    const seconds = pose.loop
      ? ((sampleTime % duration) + duration) % duration
      : Math.max(0, Math.min(sampleTime, duration))
    const elevation = this.definition.viewElevation ?? Math.atan2(2, 5)
    this.turn.rotation.y =
      Math.atan2(pose.facingX * this.presentationAspect * Math.sin(elevation), pose.facingY) + this.definition.yaw
    this.turn.scale.setScalar(pose.boss ? MODEL_BOSS_SCALE : 1)
    instance.action.enabled = true
    instance.action.paused = false
    instance.mixer.setTime(seconds)
    this.root.updateWorldMatrix(true, true)
    for (const adapter of instance.lease.adapters) adapter.update(seconds)
    this.root.visible = true
    this.lastMotion = pose.motion
    this.lastSample = seconds
    this.lastPose = pose
    return true
  }
  emitterAt(pose: ModelPose): THREE.Vector3 | undefined {
    const contract = this.definition.emitter
    if (!contract) return undefined
    const previous = this.lastPose
    if (!this.sample(pose)) return undefined
    const node =
      this.active?.lease.scene.getObjectByName(contract.node) ??
      this.active?.lease.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(contract.node))
    const point = node?.localToWorld(new THREE.Vector3(...(contract.local ?? [0, 0, 0])))
    if (previous) this.sample(previous)
    return point
  }
  get motion(): ModelMotion | undefined {
    return this.lastMotion
  }
  setAppearance(opacity = 1, tint = 0xffffff): void {
    if (this.appearance.opacity === opacity && this.appearance.tint.getHex() === tint) return
    this.appearance.opacity = opacity
    this.appearance.tint.setHex(tint)
    for (const { lease } of this.leases.values()) this.applyAppearance(lease.scene)
  }
  private applyAppearance(scene: THREE.Object3D): void {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        let base = this.materialBases.get(material)
        if (!base) {
          base = {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
            color: material instanceof THREE.MeshStandardMaterial ? material.color.clone() : undefined
          }
          this.materialBases.set(material, base)
        }
        const transparent = base.transparent || this.appearance.opacity < 1
        if (material.transparent !== transparent) {
          material.transparent = transparent
          material.needsUpdate = true
        }
        material.opacity = base.opacity * this.appearance.opacity
        material.depthWrite = this.appearance.opacity < 1 ? false : base.depthWrite
        if (base.color && material instanceof THREE.MeshStandardMaterial)
          material.color.copy(base.color).multiply(this.appearance.tint)
      }
    })
  }
  diagnostics() {
    let meshes = 0,
      triangles = 0
    this.active?.lease.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      meshes++
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position')?.count ?? 0) / 3
    })
    return {
      renderer: 'gltf-mesh',
      visible: this.root.visible,
      motion: this.lastMotion,
      seconds: this.lastSample,
      meshes,
      triangles,
      rigs: this.leases.size
    }
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const { mixer, lease } of this.leases.values()) {
      mixer.stopAllAction()
      mixer.uncacheRoot(lease.scene)
      lease.release()
    }
    this.leases.clear()
    this.materialBases.clear()
    this.root.removeFromParent()
  }
}
