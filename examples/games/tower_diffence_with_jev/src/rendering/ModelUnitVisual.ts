import { MODEL_BOSS_SCALE, modelGroundDepth } from './BoardCamera'
import * as THREE from 'three'
import type { CombatAttack, Unit } from '../game/model'
import { specialMotionActive } from '../game/SpecialAbilities'
import { attackAssetElapsedMs } from '../game/AttackProfiles'
import { ModelAssetCache, type ModelLease, type ModelSource } from './ModelAssetCache'

export type ModelMotion = 'idle' | 'walk' | 'attack' | 'heal' | 'breath' | 'death' | 'special'
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
  /** Simulation seconds; enables a short crossfade when the clip changes. Omitted by previews and tests. */
  readonly time?: number
}

/** Animation sampling is simulation-owned: tab freezes, pause and save resume cannot drift hits. */
export function unitModelPose(unit: Unit, time: number, action?: CombatAttack): ModelPose {
  const special = specialMotionActive(unit, time)
  const active = !special && action && action.status !== 'cancelled' && time < action.endsAt
  const motion: ModelMotion =
    unit.hp <= 0
      ? 'death'
      : special
        ? 'special'
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
    seconds: special ? time - unit.specialCast!.startedAt : active ? attackAssetElapsedMs(action, time) / 1000 : time,
    loop: motion === 'idle' || motion === 'walk',
    facingX: active ? (action.aim?.x ?? unit.facingX) : unit.facingX,
    facingY: active ? (action.aim?.y ?? unit.facingY) : unit.facingY,
    boss: unit.boss
  }
}

/** Short enough to finish long before the earliest attack cue. */
export const MODEL_CROSSFADE_SECONDS = 0.12
const ALLY_FALL_SECONDS = 0.82
type NodePose = [THREE.Vector3, THREE.Quaternion, THREE.Vector3]
/** live: may start a fade; restore: re-applies an existing fade; exact: authored pose only. */
type SampleMode = 'live' | 'restore' | 'exact'

interface MotionInstance {
  lease: ModelLease
  mixer: THREE.AnimationMixer
  action: THREE.AnimationAction
  firstPose?: ModelPose
  exactBounds?: boolean
}

/** Copy every named node's local transform; motion rigs share node names across GLB files. */
function snapshot(scene: THREE.Object3D): Map<string, NodePose> {
  const pose = new Map<string, NodePose>()
  scene.traverse((node) => {
    if (node.name) pose.set(node.name, [node.position.clone(), node.quaternion.clone(), node.scale.clone()])
  })
  return pose
}
const blendRotation = new THREE.Quaternion()
const vertex = new THREE.Vector3()
const rootInverse = new THREE.Matrix4()
const axisX = new THREE.Vector3(1, 0, 0)
const axisZ = new THREE.Vector3(0, 0, 1)
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** True polygonal actor, never a billboard or a render-to-texture sprite. */
const FLASH_WHITE = new THREE.Color(0xffffff)

export class ModelUnitVisual {
  readonly root = new THREE.Group()
  private turn = new THREE.Group()
  private normalized = new THREE.Group()
  private fall = new THREE.Group()
  private fallLift?: number
  private fade?: {
    from: Map<string, NodePose>
    to: MotionInstance
    start: number
    /** Mixer-written values under the blend; the mixer skips unchanged writes, so these are restored before resampling. */
    authored: Map<THREE.Object3D, NodePose>
  }
  private lastTime?: number
  private leases = new Map<string, MotionInstance>()
  private preparationFailures = new Set<string>()
  private fadePrepared = new WeakSet<ModelLease>()
  private preparing?: { lease: ModelLease }
  private active?: MotionInstance
  private disposed = false
  private presentationScale = 1
  private presentationAspect = 1
  private lastMotion?: ModelMotion
  private lastSample = 0
  private lastPose?: ModelPose
  private appearance = { opacity: 1, tint: new THREE.Color(0xffffff), flash: 0 }
  private materialBases = new Map<
    THREE.Material,
    {
      color?: THREE.Color
      emissive?: THREE.Color
      emissiveIntensity: number
      opacity: number
      transparent: boolean
      depthWrite: boolean
    }
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
    this.turn.add(this.fall)
    this.fall.add(this.normalized)
    this.normalized.scale.setScalar(definition.scale)
    this.normalized.position.fromArray(definition.origin).multiplyScalar(-definition.scale)
    this.root.visible = false
  }
  setPosition(x: number, y: number): void {
    this.root.matrix.setPosition(x, y, modelGroundDepth(y))
    this.root.matrixWorldNeedsUpdate = true
  }
  /** Native +Z projects along the game aim, also on a horizontally widened board. */
  private headingYaw(facingX: number, facingY: number): number {
    const elevation = this.definition.viewElevation ?? Math.atan2(2, 5)
    return Math.atan2(facingX * this.presentationAspect * Math.sin(elevation), facingY)
  }
  /** Walk cycles per distance unit, relative to 1 / walkDistance. walkDistance plants the stride
   * in model pixels, but the board is drawn flat and widened while the tilted model is scaled and
   * foreshortened toward the camera; this retimes the stride so the planted foot keeps pace with
   * the body on screen. The cap keeps camera-facing walks from turning frantic.
   */
  walkRate(facingX: number, facingY: number, boss: boolean): number {
    const elevation = this.definition.viewElevation ?? Math.atan2(2, 5),
      yaw = this.headingYaw(facingX, facingY),
      body = Math.hypot(facingX * this.presentationAspect, facingY) / (Math.hypot(facingX, facingY) || 1),
      foot =
        this.presentationScale *
        (boss ? MODEL_BOSS_SCALE : 1) *
        Math.hypot(Math.sin(yaw), Math.sin(elevation) * Math.cos(yaw))
    return Math.max(0.6, Math.min(1.35, body / foot))
  }
  /** Counter the wider board presentation so meshes keep their authored proportions. */
  setPresentation(scale: number, aspect: number): void {
    this.presentationScale = scale
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
      if (this.cache.requestSource(spec) !== 'ready') ready = false
    }
    return ready
  }
  private instance(spec: ModelSource) {
    const key = `${spec.url}#${spec.clipUrl ?? spec.clip}`
    let instance = this.leases.get(key)
    if (!instance) {
      const lease = this.cache.acquire(spec)
      if (!lease) return undefined
      const mixer = new THREE.AnimationMixer(lease.scene)
      const action = mixer.clipAction(lease.clip)
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.play()
      instance = { lease, mixer, action }
      this.leases.set(key, instance)
      this.applyAppearance(lease.scene)
    }
    return instance
  }
  /** Prepare one existing fade or needed action rig without sampling a different pose. */
  prepareNextMotion(
    compile: (scene: THREE.Object3D) => Promise<unknown>,
    prepareFade?: (scene: THREE.Object3D) => Promise<unknown>
  ): Promise<void> | undefined {
    if (this.disposed || this.preparing) return
    if (prepareFade) {
      for (const { lease } of this.leases.values()) {
        if (this.fadePrepared.has(lease)) continue
        this.fadePrepared.add(lease)
        this.preparing = { lease }
        return Promise.resolve()
          .then(() => {
            if (!this.disposed) return prepareFade(lease.scene)
          })
          .then(() => undefined)
          .finally(() => {
            if (this.disposed) lease.release()
            this.preparing = undefined
          })
      }
    }
    for (const motion of [
      'walk',
      'attack',
      'heal',
      'breath',
      'special',
      ...(prepareFade ? ['death' as const] : [])
    ] as const) {
      const spec = this.definition.clips[motion]
      if (!spec) continue
      const key = `${spec.url}#${spec.clipUrl ?? spec.clip}`
      if (this.leases.has(key) || this.preparationFailures.has(key)) continue
      let instance
      try {
        instance = this.instance(spec)
      } catch {
        this.preparationFailures.add(key)
        continue
      }
      if (!instance) continue
      const done = Promise.resolve()
        .then(() => {
          if (!this.disposed) return compile(instance.lease.scene)
        })
        .then(() => undefined)
        .finally(() => {
          if (this.disposed) instance.lease.release()
          this.preparing = undefined
        })
      this.preparing = { lease: instance.lease }
      return done
    }
  }
  sample(pose: ModelPose): boolean {
    return this.apply(pose, 'live')
  }
  private apply(pose: ModelPose, mode: SampleMode): boolean {
    if (this.disposed) return false
    this.fall.position.set(0, 0, 0)
    this.fall.quaternion.identity()
    this.fall.scale.set(1, 1, 1)
    this.fallLift = undefined
    const live = mode === 'live'
    // Simulation time only: absent or rewound time (preview, reset, restore) never blends.
    const forward = pose.time !== undefined && this.lastTime !== undefined && pose.time >= this.lastTime
    const spec = this.definition.clips[pose.motion]
    if (!spec)
      throw new Error(`Missing required ${pose.motion} model; refusing a different animation or sprite fallback`)
    const instance = this.instance(spec)
    if (!instance) return false
    const switching = this.active !== instance
    // Snapshot the visible (possibly blended) outgoing pose before restoring authored values.
    const from = live && forward && switching && this.active ? snapshot(this.active.lease.scene) : undefined
    if (this.fade)
      for (const [node, [p, q, s]] of this.fade.authored) {
        node.position.copy(p)
        node.quaternion.copy(q)
        node.scale.copy(s)
      }
    this.fade?.authored.clear()
    if (live && (!forward || switching))
      this.fade = from && { from, to: instance, start: this.lastTime!, authored: new Map() }
    if (switching) {
      if (this.active) {
        this.active.lease.scene.visible = false
        // Invisible descendants still receive Three.js world-matrix updates.
        this.active.lease.scene.removeFromParent()
      }
      this.active = instance
      this.normalized.add(instance.lease.scene)
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
    this.turn.rotation.y = this.headingYaw(pose.facingX, pose.facingY) + this.definition.yaw
    this.turn.scale.setScalar(pose.boss ? MODEL_BOSS_SCALE : 1)
    instance.action.enabled = true
    instance.action.paused = false
    instance.mixer.setTime(seconds)
    if (mode !== 'exact') this.blend(instance, pose.time, live)
    this.root.updateWorldMatrix(true, true)
    for (const adapter of instance.lease.adapters) adapter.update(seconds)
    this.root.visible = true
    this.lastMotion = pose.motion
    this.lastSample = seconds
    this.lastPose = pose
    if (live) this.lastTime = pose.time
    instance.firstPose ??= { ...pose }
    if (this.appearance.opacity < 1 && !instance.exactBounds) this.computeInitialBounds(instance)
    return true
  }
  /** Blend the incoming clip from the outgoing visible pose, bones and rigid controls alike. */
  private blend(instance: MotionInstance, time: number | undefined, live: boolean): void {
    const fade = this.fade
    if (!fade || fade.to !== instance || time === undefined) return
    const weight = (time - fade.start) / MODEL_CROSSFADE_SECONDS
    if (weight >= 1 || weight < 0) {
      if (live) this.fade = undefined
      return
    }
    instance.lease.scene.traverse((node) => {
      const from = fade.from.get(node.name)
      if (!from) return
      fade.authored.set(node, [node.position.clone(), node.quaternion.clone(), node.scale.clone()])
      node.position.lerpVectors(from[0], node.position, weight)
      blendRotation.copy(node.quaternion)
      node.quaternion.copy(from[1]).slerp(blendRotation, weight)
      node.scale.lerpVectors(from[2], node.scale, weight)
    })
  }
  /** A rig-wide collapse preserves the exact held anatomy/weapon for roles without a death clip:
   * buckle and pitch forward, topple toward screen right about the outer foot edge, rest on the ground, settle.
   */
  sampleAllyDeath(seconds: number, facing: Pick<ModelPose, 'facingX' | 'facingY' | 'boss'>): boolean {
    if (this.disposed) return false
    if (!this.active && !this.sample({ ...facing, motion: 'idle', seconds: 0, loop: false })) return false
    const t = Math.max(0, Math.min(seconds, ALLY_FALL_SECONDS))
    if (this.fallLift === undefined) {
      // Standing extent toward the fall side, measured once per death on the held pose.
      this.fall.position.set(0, 0, 0)
      this.fall.quaternion.identity()
      this.fall.scale.set(1, 1, 1)
      this.root.updateWorldMatrix(true, true)
      rootInverse.copy(this.root.matrixWorld).invert()
      let lift = 0
      this.active!.lease.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.visible) return
        const count = object.geometry.getAttribute('position')?.count ?? 0
        for (let i = 0; i < count; i += 3) {
          object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld).applyMatrix4(rootInverse)
          if (vertex.x > lift) lift = vertex.x
        }
      })
      this.fallLift = lift
    }
    const buckle = smooth(t / 0.16) * (1 - smooth((t - 0.2) / 0.3))
    const topple = smooth((t - 0.12) / 0.5) ** 1.6
    const settle = t > 0.6 ? Math.sin((Math.PI * (t - 0.6)) / 0.22) * (1 - (t - 0.6) / 0.22) : 0
    const roll = -(Math.PI / 2) * topple + 0.1 * settle
    const pitch = 0.2 * smooth(t / 0.16) - 0.12 * topple
    // Roll about the screen-facing axis (root space), pitch about the actor's own side axis.
    blendRotation.setFromAxisAngle(axisZ, roll)
    this.fall.quaternion
      .copy(this.turn.quaternion)
      .invert()
      .multiply(blendRotation)
      .multiply(this.turn.quaternion)
      .multiply(blendRotation.setFromAxisAngle(axisX, pitch))
    this.fall.position.set(0, (this.fallLift * Math.sin(-roll)) / this.turn.scale.y, 0)
    this.fall.scale.set(1, 1 - 0.08 * buckle, 1)
    this.lastMotion = 'death'
    this.lastSample = t
    this.root.visible = true
    this.root.updateWorldMatrix(true, true)
    return true
  }
  /** Opaque draws can use the shared anchor; preserve the original first-pose
   * transparent ordering before a fade. Run one rig per background preparation job.
   */
  prepareInitialBounds(): boolean {
    for (const instance of this.leases.values())
      if (instance.firstPose && !instance.exactBounds) {
        this.computeInitialBounds(instance)
        return true
      }
    return false
  }
  private computeInitialBounds(instance: MotionInstance): void {
    if (!instance.firstPose || instance.exactBounds) return
    instance.exactBounds = true
    const previous = this.lastPose
    this.apply(instance.firstPose, 'exact')
    this.root.updateMatrixWorld(true)
    instance.lease.scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.computeBoundingSphere()
    })
    if (previous) this.apply(previous, 'restore')
  }
  rememberInitialBounds(motion: ModelMotion): void {
    if (this.active) this.cache.rememberInitialBounds(this.definition.clips[motion]!, this.active.lease.scene)
  }
  emitterAt(pose: ModelPose): THREE.Vector3 | undefined {
    const contract = this.definition.emitter
    if (!contract) return undefined
    const previous = this.lastPose
    if (!this.apply(pose, 'exact')) return undefined
    const node =
      this.active?.lease.scene.getObjectByName(contract.node) ??
      this.active?.lease.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(contract.node))
    const point = node?.localToWorld(new THREE.Vector3(...(contract.local ?? [0, 0, 0])))
    if (previous) this.apply(previous, 'restore')
    return point
  }
  get motion(): ModelMotion | undefined {
    return this.lastMotion
  }
  /** `flash` (0..1) adds a white emissive hit flash on top of the material's own emissive. */
  setAppearance(opacity = 1, tint = 0xffffff, flash = 0): void {
    if (
      this.appearance.opacity === opacity &&
      this.appearance.tint.getHex() === tint &&
      this.appearance.flash === flash
    )
      return
    this.appearance.opacity = opacity
    this.appearance.flash = flash
    this.appearance.tint.setHex(tint)
    if (opacity < 1) for (const instance of this.leases.values()) this.computeInitialBounds(instance)
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
            emissiveIntensity: material instanceof THREE.MeshStandardMaterial ? material.emissiveIntensity : 1,
            emissive: material instanceof THREE.MeshStandardMaterial ? material.emissive.clone() : undefined,
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
        if (base.emissive && material instanceof THREE.MeshStandardMaterial) {
          const f = this.appearance.flash
          // flash 0 restores the exact base values
          material.emissive.copy(base.emissive).lerp(FLASH_WHITE, f)
          material.emissiveIntensity = base.emissiveIntensity + (f > 0 ? f * 1.2 : 0)
        }
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
      opacity: this.appearance.opacity,
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
      if (lease !== this.preparing?.lease) lease.release()
    }
    this.fade = undefined
    this.leases.clear()
    this.active = undefined
    this.root.visible = false
    this.materialBases.clear()
    this.preparationFailures.clear()
    this.root.removeFromParent()
  }
}
