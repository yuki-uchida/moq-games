import * as THREE from 'three'
import { reuseSkinnedBoundsMatrices } from './SkinnedBounds'
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
  readonly clipUrl?: string
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

/** A stalled transfer/decoder must release its queue slot; late results still have an owner. */
export async function loadModelWithTimeout(load: () => Promise<GLTF>, abort?: () => void): Promise<GLTF> {
  let expired = false
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; abort?.(); reject(new Error('Model load timed out')) }, 60_000)
  })
  try {
    return await Promise.race([load().then((source) => {
      if (expired) { disposeSource(source); throw new Error('Expired model load') }
      return source
    }), timeout])
  } finally { clearTimeout(timer!) }
}

export function loadGLTF(url: string): Promise<GLTF> {
  const manager = new THREE.LoadingManager()
  return loadModelWithTimeout(() => new GLTFLoader(manager).loadAsync(url), () => manager.abort())
}

/** Lazy, bounded shared geometry/textures; each actor owns its skeleton and materials. */
export class ModelAssetCache {
  private entries = new Map<string, Entry>()
  private clips = new Map<string, { state: 'loading' | 'ready' | 'error'; clip?: THREE.AnimationClip }>()
  private initialBounds = new Map<string, (THREE.Sphere | null)[]>()
  private inflight = 0
  private clock = 0
  private disposed = false
  private requiredUrls = new Set<string>()
  constructor(
    private readonly load?: (url: string) => Promise<GLTF>,
    readonly budgetBytes = 192 * 1024 * 1024,
    private readonly concurrency = 2,
    private readonly loadClip: (url: string) => Promise<unknown> = async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`Clip HTTP ${response.status}`)
      return response.json()
    }
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
  requestSource(spec: ModelSource): 'queued' | 'loading' | 'ready' | 'error' {
    const model = this.request(spec.url)
    if (!spec.clipUrl || model === 'error') return model
    let entry = this.clips.get(spec.clipUrl)
    if (!entry) {
      entry = { state: 'loading' }
      this.clips.set(spec.clipUrl, entry)
      const pending = entry
      void this.loadClip(spec.clipUrl)
        .then((json) => {
          if (this.disposed) return
          const clip = THREE.AnimationClip.parse(json as Parameters<typeof THREE.AnimationClip.parse>[0])
          if (
            clip.name !== spec.clip ||
            clip.duration <= 0 ||
            !clip.tracks.length ||
            clip.tracks.some((track) => track.name.endsWith('.scale'))
          )
            throw new Error('Invalid special clip')
          pending.clip = clip
          pending.state = 'ready'
        })
        .catch(() => {
          pending.state = 'error'
        })
    }
    return entry.state === 'ready' ? model : entry.state
  }
  private pump(): void {
    if (this.disposed) return
    for (const [url, entry] of this.entries) {
      if (this.inflight >= this.concurrency) break
      if (entry.state !== 'queued') continue
      entry.state = 'loading'
      entry.startedAt = performance.now()
      this.inflight++
      void (this.load ? loadModelWithTimeout(() => this.load!(url)) : loadGLTF(url))
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
    if (this.requestSource(spec) !== 'ready') return undefined
    const entry = this.entries.get(spec.url)!
    const source = entry.source!
    const clip = spec.clipUrl
      ? this.clips.get(spec.clipUrl)?.clip
      : source.animations.find((clip) => clip.name === spec.clip)
    if (!clip) throw new Error(`Missing authored ${spec.clip} clip in ${spec.url}`)
    if (
      spec.clipUrl &&
      !(clip as THREE.AnimationClip & { userData?: { blinkAmountSamples?: unknown } }).userData?.blinkAmountSamples
    ) {
      const idle = source.animations.find((value) => value.name === 'idle') as
        | (THREE.AnimationClip & { userData?: unknown })
        | undefined
      if (idle?.userData) Object.assign(clip, { userData: structuredClone(idle.userData) })
    }
    const scene = clone(source.scene)
    const materials = new Set<THREE.Material>()
    const skeletons = new Set<THREE.Skeleton>()
    let meshIndex = 0
    const bounds = this.initialBounds.get(`${spec.url}#${spec.clipUrl ?? spec.clip}`)
    scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) {
        skeletons.add(object.skeleton)
        reuseSkinnedBoundsMatrices(object)
        if (bounds?.[meshIndex]) object.boundingSphere = bounds[meshIndex]!.clone()
        meshIndex++
      }
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
  /** With frustum culling disabled, this sphere is only a stable depth-sort anchor.
   * Reuse the prepared first pose instead of scanning every vertex on each new actor.
   */
  rememberInitialBounds(spec: ModelSource, root: THREE.Object3D): void {
    const bounds: (THREE.Sphere | null)[] = []
    root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) bounds.push(object.boundingSphere?.clone() ?? null)
    })
    this.initialBounds.set(`${spec.url}#${spec.clipUrl ?? spec.clip}`, bounds)
  }
  retryFailed(): void {
    for (const [url, entry] of this.entries) if (entry.state === 'error') this.entries.delete(url)
    for (const [url, entry] of this.clips) if (entry.state === 'error') this.clips.delete(url)
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
    this.clips.clear()
    this.initialBounds.clear()
    for (const entry of this.entries.values()) if (entry.source) disposeSource(entry.source)
    this.entries.clear()
    this.requiredUrls.clear()
  }
}
