import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Direction, ModelConfig, Motion } from './contracts'
import { verifiedBytes } from './api'
import { applyWolfLidMaterial } from './WolfLidMaterial'

export function inspectGlb(bytes: ArrayBuffer): void {
  const view = new DataView(bytes)
  if (
    bytes.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  )
    throw new Error('Invalid GLB container')
  const length = view.getUint32(12, true)
  if (length > 2 * 1024 * 1024 || length + 20 > bytes.byteLength || view.getUint32(16, true) !== 0x4e4f534a)
    throw new Error('Invalid GLB JSON')
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)).trim())
  if (
    (data.accessors?.length ?? 0) > 512 ||
    (data.bufferViews?.length ?? 0) > 512 ||
    (data.nodes?.length ?? 0) > 256 ||
    data.skins?.some((skin: { joints: number[] }) => skin.joints.length > 128)
  )
    throw new Error('GLB exceeds structural budget')
  if (
    data.images?.some(
      (image: { mimeType: string }) => !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)
    )
  )
    throw new Error('Unsupported embedded image type')
  if (
    data.buffers?.some((buffer: { uri?: string }) => buffer.uri) ||
    data.images?.some((image: { uri?: string }) => image.uri)
  )
    throw new Error('GLB external resources are forbidden')
  if (
    data.extensionsRequired?.some(
      (name: string) =>
        !['KHR_materials_unlit', 'KHR_materials_specular', 'KHR_texture_transform', 'KHR_materials_ior'].includes(name)
    )
  )
    throw new Error('Unsupported required GLB extension')
  if (
    !data.skins?.length ||
    data.skins.length > 8 ||
    !data.animations?.length ||
    data.animations.length > 8 ||
    (data.meshes?.length ?? 0) > 128 ||
    (data.images?.length ?? 0) > 16
  )
    throw new Error('Expected a bounded rigged character GLB')
  if (
    data.accessors?.some(
      (accessor: { count: number }) =>
        !Number.isSafeInteger(accessor.count) || accessor.count < 0 || accessor.count > 2_000_000
    )
  )
    throw new Error('GLB accessor exceeds pilot budget')
}
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>(),
    geometries = new Set<THREE.BufferGeometry>(),
    skeletons = new Set<THREE.Skeleton>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  for (const skeleton of skeletons) skeleton.dispose()
  for (const texture of textures) {
    const source = texture.source?.data
    if (typeof source?.close === 'function') source.close()
    texture.dispose()
  }
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}
export interface ModelAdapter {
  sample(motion: Motion, timeMs: number): void
  dispose(): void
}
export type ModelAdapterFactory = (root: THREE.Object3D, metadata: unknown) => ModelAdapter | readonly ModelAdapter[]
export function combineModelAdapters(adapters: readonly ModelAdapter[]): ModelAdapter {
  let disposed = false
  return {
    sample(motion, timeMs) {
      if (!disposed) for (const adapter of adapters) adapter.sample(motion, timeMs)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const adapter of [...adapters].reverse()) adapter.dispose()
    }
  }
}
export class Actual3DView {
  private loadGeneration = 0
  private disposed = false
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-2.12, 2.12, 1.855, -1.855, 0.001, 1000)
  private verticalSpan = 3.71
  private controls: OrbitControls
  private root: THREE.Object3D | null = null
  private mixer: THREE.AnimationMixer | null = null
  private clips: THREE.AnimationClip[] = []
  private action: THREE.AnimationAction | null = null
  private lid: ModelAdapter | null = null
  private config: ModelConfig | null = null
  private motion: Motion = 'idle'
  constructor(
    canvas: HTMLCanvasElement,
    private readonly adapterFactories: Readonly<Record<string, ModelAdapterFactory>> = {
      'wolf-lid-color-v1': applyWolfLidMaterial
    }
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = false
    this.controls.minZoom = 0.25
    this.controls.maxZoom = 8
    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x403624, 2.3))
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(3, 6, 4)
    this.scene.add(key)
  }
  async load(config: ModelConfig, signal: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error('Viewer is disposed')
    const generation = ++this.loadGeneration
    const [bytes, adapterBytes] = await Promise.all([
      verifiedBytes(config.file, signal),
      verifiedBytes(config.adapter, signal)
    ])
    if (signal.aborted || this.disposed || generation !== this.loadGeneration)
      throw new DOMException('Cancelled', 'AbortError')
    inspectGlb(bytes)
    const loader = new GLTFLoader()
    const gltf = await loader.parseAsync(bytes, '')
    if (signal.aborted || this.disposed || generation !== this.loadGeneration) {
      disposeObject(gltf.scene)
      throw new DOMException('Cancelled', 'AbortError')
    }
    try {
      const motions: Motion[] = ['idle', 'walk', 'attack']
      for (const motion of motions)
        if (!gltf.animations.some((clip) => clip.name === motion)) throw new Error(`Missing ${motion} clip`)
      let skins = 0
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) skins++
      })
      if (!skins) throw new Error('No real skin in imported character')
      const textures = new Set<THREE.Texture>()
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.Mesh)
          for (const material of Array.isArray(object.material) ? object.material : [object.material])
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
      })
      let textureBytes = 0
      for (const texture of textures) {
        const source = texture.source.data
        if (source.width > 4096 || source.height > 4096) throw new Error('Decoded texture exceeds pilot dimensions')
        textureBytes += source.width * source.height * 4
      }
      if (textureBytes > 128 * 1024 * 1024) throw new Error('Decoded textures exceed pilot budget')
      const bounds = new THREE.Box3().setFromObject(gltf.scene),
        center = bounds.getCenter(new THREE.Vector3()),
        size = bounds.getSize(new THREE.Vector3()).length()
      const metadata = JSON.parse(new TextDecoder().decode(adapterBytes))
      const factory = Object.hasOwn(this.adapterFactories, metadata.adapterId)
        ? this.adapterFactories[metadata.adapterId]
        : undefined
      if (!factory) throw new Error('Unsupported character adapter')
      const installed = factory(gltf.scene, metadata)
      const adapter = combineModelAdapters(Array.isArray(installed) ? installed : [installed as ModelAdapter])
      this.releaseModel()
      this.lid = adapter
      this.root = gltf.scene
      this.config = config
      this.clips = gltf.animations
      this.scene.add(this.root)
      this.mixer = new THREE.AnimationMixer(this.root)
      this.controls.target.copy(center)
      this.camera.position.copy(center).add(new THREE.Vector3(size, size * 0.6, size * 1.4))
      this.camera.lookAt(center)
      this.setMotion('idle')
      this.setDirection('se')
    } catch (error) {
      if (this.root === gltf.scene) this.releaseModel()
      else disposeObject(gltf.scene)
      throw error
    }
  }
  setMotion(motion: Motion): void {
    this.motion = motion
    if (!this.mixer) return
    this.mixer.stopAllAction()
    this.action = this.mixer.clipAction(this.clips.find((clip) => clip.name === motion)!)
    this.action.setLoop(THREE.LoopOnce, 1)
    this.action.clampWhenFinished = true
    this.action.play()
  }
  setDirection(direction: Direction): void {
    const preset = this.config?.cameraPresets[direction]
    if (!preset) return
    this.verticalSpan = preset.verticalSpan ?? 3.71
    this.camera.zoom = 1
    this.camera.position.fromArray(preset.position)
    this.controls.target.fromArray(preset.target)
    if (preset.up) this.camera.up.fromArray(preset.up)
    this.camera.lookAt(this.controls.target)
    this.controls.update()
  }
  render(timeMs: number): void {
    const canvas = this.renderer.domElement,
      width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.top = this.verticalSpan / 2
    this.camera.bottom = -this.verticalSpan / 2
    this.camera.left = (-this.verticalSpan * width) / height / 2
    this.camera.right = -this.camera.left
    this.camera.updateProjectionMatrix()
    if (this.action) {
      this.action.enabled = true
      this.action.paused = false
    }
    this.mixer?.setTime(timeMs / 1000)
    this.lid?.sample(this.motion, timeMs)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
  private releaseModel(): void {
    this.lid?.dispose()
    this.mixer?.stopAllAction()
    if (this.root) {
      this.mixer?.uncacheRoot(this.root)
      disposeObject(this.root)
      this.scene.remove(this.root)
    }
    this.root = null
    this.mixer = null
    this.action = null
    this.lid = null
    this.config = null
    this.clips = []
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.loadGeneration++
    this.controls.dispose()
    this.releaseModel()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
