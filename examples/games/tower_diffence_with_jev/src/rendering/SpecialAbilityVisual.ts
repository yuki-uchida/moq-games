import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ALLY_TYPES, type AllyType, type GameState, type Point } from '../game/model'
import { SPECIALS, specialReady } from '../game/SpecialAbilities'

const WORLD_UP = new THREE.Vector3(0, 0, 1)

/** Instances own materials; immutable GLB geometry belongs to this renderer cache. */
export class SpecialAbilityVisual {
  private sources = new Map<AllyType, THREE.Group>()
  private active = new Map<string, THREE.Group>()
  private errors: string[] = []
  private disposed = false
  private loading?: Promise<void>
  private preview = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0x99ffce,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  private reach = new THREE.Mesh(
    new THREE.RingGeometry(0.995, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  private invalid = new THREE.Group()
  private aim: { id: number; point: Point } | null = null
  constructor(private scene: THREE.Scene) {
    this.preview.visible = false
    this.preview.renderOrder = 100
    this.reach.visible = false
    this.reach.renderOrder = 99
    for (const angle of [-Math.PI / 4, Math.PI / 4]) {
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 3),
        new THREE.MeshBasicMaterial({ color: 0xff5966, depthTest: false, depthWrite: false })
      )
      bar.rotation.z = angle
      bar.renderOrder = 101
      this.invalid.add(bar)
    }
    this.invalid.visible = false
    scene.add(this.preview, this.reach, this.invalid)
  }
  preload(base: URL): Promise<void> {
    return (this.loading ??= this.load(base))
  }
  private async load(base: URL): Promise<void> {
    const loader = new GLTFLoader()
    await Promise.all(
      ALLY_TYPES.map(async (type) => {
        try {
          const gltf = await loader.loadAsync(new URL(`effects/special/${type}.glb`, base).href)
          if (this.disposed) this.release(gltf.scene, true)
          else this.sources.set(type, gltf.scene)
        } catch {
          this.errors.push(type)
        }
      })
    )
  }
  setPreview(aim: { id: number; point: Point } | null): void {
    this.aim = aim
  }
  ready(type: AllyType): boolean {
    return this.sources.has(type)
  }
  failed(type: AllyType): boolean {
    return this.errors.includes(type)
  }
  diagnostics() {
    return { loaded: this.sources.size, active: this.active.size, errors: [...this.errors] }
  }
  render(state: Readonly<GameState>): void {
    const aimUnit = this.aim && state.units.find((u) => u.id === this.aim!.id && u.hp > 0)
    this.preview.visible = !!aimUnit && state.phase === 'assault'
    this.reach.visible = this.preview.visible
    this.invalid.visible = false
    if (aimUnit && this.aim) {
      const radius = SPECIALS[aimUnit.type as AllyType].radius
      this.preview.scale.set(radius, radius, 1)
      this.preview.position.set(this.aim.point.x, this.aim.point.y, 2)
      const valid = specialReady(state, aimUnit.id, this.aim.point)
      this.preview.material.color.set(valid ? 0x99ffce : 0xff5966)
      this.reach.scale.setScalar(SPECIALS[aimUnit.type as AllyType].range)
      this.reach.position.set(aimUnit.x, aimUnit.y, 2)
      this.invalid.visible = !valid
      this.invalid.position.copy(this.preview.position)
    }
    const effects =
      state.phase === 'assault'
        ? (state.specialEffects ?? []).filter((effect) => state.time >= effect.releaseAt).slice(-16)
        : []
    const ids = new Set(effects.map((effect) => `${state.battleId}:${effect.id}`))
    for (const [id, group] of this.active)
      if (!ids.has(id)) {
        this.release(group)
        this.active.delete(id)
      }
    for (const effect of effects) {
      const source = this.sources.get(effect.type)
      if (!source) continue
      const key = `${state.battleId}:${effect.id}`
      let group = this.active.get(key)
      if (!group) {
        group = source.clone(true)
        group.matrixAutoUpdate = false
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          object.material = (object.material as THREE.Material).clone()
          object.material.transparent = true
          object.material.depthWrite = false
          object.material.toneMapped = false
          object.material.depthTest = false
          object.renderOrder = 50
        })
        this.scene.add(group)
        this.active.set(key, group)
      }
      const progress = THREE.MathUtils.clamp((state.time - effect.releaseAt) / (effect.endsAt - effect.releaseAt), 0, 1)
      const radius = SPECIALS[effect.type].radius
      const field = ['healer', 'frost', 'ranger'].includes(effect.type)
      const scale = radius
      group.position.set(effect.x, effect.y, 1)
      // GLB XZ ground / Y up -> board XY ground / Z up.
      group.rotation.set(Math.PI / 2, 0, 0)
      group.rotateOnWorldAxis(WORLD_UP, field ? state.time * 0.15 : progress * 0.6)
      group.scale.setScalar(scale)
      if (effect.type === 'archer') group.position.z += radius * 0.35 * (1 - progress)
      if (effect.type === 'paladin') group.scale.y *= Math.min(1, progress * 5)
      if (effect.type === 'mage') group.position.z += radius * progress * 0.1
      group.updateMatrix()
      // Project real height upward on the board while retaining the exact XY ground circle.
      for (const column of [0, 4, 8]) group.matrix.elements[column + 1] -= 0.65 * group.matrix.elements[column + 2]

      group.traverse((object) => {
        if (object instanceof THREE.Mesh)
          (object.material as THREE.Material).opacity = field
            ? (0.38 + 0.1 * Math.sin(state.time * 3)) * Math.min(1, (1 - progress) * 5)
            : Math.min(1, (1 - progress) * 2) * 0.8
      })
    }
  }
  private release(group: THREE.Object3D, geometry = false): void {
    group.removeFromParent()
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (geometry) object.geometry.dispose()
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
      }
    })
  }
  dispose(): void {
    this.disposed = true
    for (const group of this.active.values()) this.release(group)
    for (const group of this.sources.values()) this.release(group, true)
    this.active.clear()
    this.sources.clear()
    this.reach.removeFromParent()
    this.reach.geometry.dispose()
    this.reach.material.dispose()
    this.release(this.invalid, true)
    this.preview.removeFromParent()
    this.preview.geometry.dispose()
    this.preview.material.dispose()
  }
}
