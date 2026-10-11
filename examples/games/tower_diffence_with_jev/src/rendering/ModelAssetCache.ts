import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

/** Adapters run in declared order after the mixer, and dispose in reverse order. */
export interface ModelAdapter {
  update(timeSeconds: number): void
  dispose(): void
}
export type ModelAdapterFactory = (scene: THREE.Object3D, clip: THREE.AnimationClip) => ModelAdapter
export interface ModelSource {
  readonly url: string
  readonly clip: string
  readonly adapters?: readonly ModelAdapterFactory[]
}
export interface ModelLease {
  readonly scene: THREE.Object3D
  readonly clip: THREE.AnimationClip
  readonly adapters: readonly ModelAdapter[]
  release(): void
}
interface Entry {
  state: 'queued' | 'loading' | 'ready' | 'error'
  source?: GLTF
  error?: string
  references: number
  touched: number
  bytes: number
  queuedAt: number
  startedAt?: number
  completedAt?: number
}

function resources(scene: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  return { geometries, materials, textures }
}
function residentSize(scene: THREE.Object3D): number {
  const { geometries, textures } = resources(scene)
  const arrays = new Set<ArrayBufferLike>()
  for (const geometry of geometries) {
    for (const attribute of [
      ...Object.values(geometry.attributes),
      ...Object.values(geometry.morphAttributes).flat(),
      ...(geometry.index ? [geometry.index] : [])
    ]) {
      arrays.add(
        attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array.buffer : attribute.array.buffer
      )
    }
  }
  return (
    [...arrays].reduce((sum, array) => sum + array.byteLength, 0) +
    [...textures].reduce((sum, texture) => {
      const image = texture.image as { width?: number; height?: number } | undefined
      return sum + ((image?.width ?? 0) * (image?.height ?? 0) * 4 * 4) / 3
    }, 0)
  )
}
function disposeSource(source: GLTF): void {
  const { geometries, materials, textures } = resources(source.scene)
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) {
    texture.dispose()
    const image = texture.image
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close()
  }
}

/** Lazy, bounded shared geometry/textures; each actor owns its skeleton and materials. */
export class ModelAssetCache {
  private entries = new Map<string, Entry>()
  private inflight = 0
  private clock = 0
  private disposed = false
  private requiredUrls = new Set<string>()
  constructor(
    private readonly load: (url: string) => Promise<GLTF> = (url) => new GLTFLoader().loadAsync(url),
    readonly budgetBytes = 192 * 1024 * 1024,
    private readonly concurrency = 2
  ) {}

  request(url: string): 'queued' | 'loading' | 'ready' | 'error' {
    if (this.disposed) return 'error'
    let entry = this.entries.get(url)
    if (!entry) {
      entry = { state: 'queued', references: 0, touched: ++this.clock, bytes: 0, queuedAt: performance.now() }
      this.entries.set(url, entry)
    }
    entry.touched = ++this.clock
    this.pump()
    return entry.state
  }
  private pump(): void {
    if (this.disposed) return
    for (const [url, entry] of this.entries) {
      if (this.inflight >= this.concurrency) break
      if (entry.state !== 'queued') continue
      entry.state = 'loading'
      entry.startedAt = performance.now()
      this.inflight++
      void this.load(url)
        .then((source) => {
          if (this.disposed || this.entries.get(url) !== entry) {
            disposeSource(source)
            return
          }
          let meshes = 0
          source.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) meshes++
          })
          if (!meshes || !source.animations.length) {
            disposeSource(source)
            throw new Error('Model needs actual mesh geometry and authored animation clips')
          }
          // GLTFLoader preserves node extras but AnimationClip extras need explicit transfer.
          for (const [index, clip] of source.animations.entries()) {
            const authored = source.parser?.json.animations?.[index]
            if (authored?.extras) Object.assign(clip, { userData: structuredClone(authored.extras) })
          }
          entry.source = source
          entry.bytes = residentSize(source.scene)
          entry.state = 'ready'
          entry.completedAt = performance.now()
        })
        .catch((error) => {
          entry.error = error instanceof Error ? error.message : String(error)
          entry.state = 'error'
        })
        .finally(() => {
          this.inflight--
          this.pump()
        })
    }
  }
  acquire(spec: ModelSource): ModelLease | undefined {
    if (this.request(spec.url) !== 'ready') return undefined
    const entry = this.entries.get(spec.url)!
    const source = entry.source!
    const clip = source.animations.find((clip) => clip.name === spec.clip)
    if (!clip) throw new Error(`Missing authored ${spec.clip} clip in ${spec.url}`)
    const scene = clone(source.scene)
    const materials = new Set<THREE.Material>()
    const skeletons = new Set<THREE.Skeleton>()
    scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
      if (!(object instanceof THREE.Mesh)) return
      object.frustumCulled = false // Imported bounds often describe only the rest pose.
      const own = (material: THREE.Material) => {
        const copy = material.clone()
        materials.add(copy)
        return copy
      }
      object.material = Array.isArray(object.material) ? object.material.map(own) : own(object.material)
    })
    const adapters: ModelAdapter[] = []
    try {
      for (const install of spec.adapters ?? []) adapters.push(install(scene, clip))
    } catch (error) {
      for (const adapter of adapters.reverse()) adapter.dispose()
      for (const material of materials) material.dispose()
      for (const skeleton of skeletons) skeleton.dispose()
      throw error
    }
    entry.references++
    let released = false
    return {
      scene,
      clip,
      adapters,
      release: () => {
        if (released) return
        released = true
        for (const adapter of [...adapters].reverse()) adapter.dispose()
        scene.removeFromParent()
        for (const material of materials) material.dispose()
        for (const skeleton of skeletons) skeleton.dispose()
        entry.references--
        this.evict()
      }
    }
  }
  error(url: string): string | undefined {
    return this.entries.get(url)?.error
  }
  retry(url: string): void {
    const entry = this.entries.get(url)
    if (entry?.state === 'error') {
      this.entries.delete(url)
      this.request(url)
    }
  }
  get residentBytes(): number {
    return [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0)
  }
  /** Protect the active wave's motion set, including clips not sampled yet. */
  setRequiredUrls(urls: Iterable<string>): void {
    this.requiredUrls = new Set(urls)
  }
  evict(): void {
    for (const [url, entry] of [...this.entries].sort((a, b) => a[1].touched - b[1].touched)) {
      if (this.residentBytes <= this.budgetBytes) break
      if (entry.references || this.requiredUrls.has(url) || entry.state !== 'ready') continue
      disposeSource(entry.source!)
      this.entries.delete(url)
    }
  }
  diagnostics() {
    return {
      residentBytes: this.residentBytes,
      budgetBytes: this.budgetBytes,
      inflight: this.inflight,
      entries: [...this.entries].map(([url, entry]) => ({
        url,
        state: entry.state,
        references: entry.references,
        required: this.requiredUrls.has(url),
        bytes: entry.bytes,
        queueMs: entry.startedAt === undefined ? undefined : entry.startedAt - entry.queuedAt,
        loadMs:
          entry.completedAt === undefined || entry.startedAt === undefined
            ? undefined
            : entry.completedAt - entry.startedAt,
        error: entry.error
      }))
    }
  }
  dispose(): void {
    this.disposed = true
    for (const entry of this.entries.values()) if (entry.source) disposeSource(entry.source)
    this.entries.clear()
    this.requiredUrls.clear()
  }
}
