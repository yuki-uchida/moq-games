import * as THREE from 'three'
import { directMotionClip } from './DirectedMotion'
import { walkGaitClip } from './WalkGait'
import { getUnitModelDefinition } from './models/catalog'
import type { UnitType } from '../game/model'
import runtimeManifest from '../../../../../public/tower-defense-art/models/runtime-manifest.json'
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
  readonly motionRole?: UnitType
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
/** Copy of `attribute` with `extra` vertices appended, each duplicating the listed source vertex. */
function appendVertices(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, extra: number[]) {
  const source = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array,
    size = attribute.itemSize,
    array = new (source.constructor as new (length: number) => typeof source)((attribute.count + extra.length) * size),
    result = new THREE.BufferAttribute(array, size, attribute.normalized)
  for (let v = 0; v < attribute.count; v++)
    for (let k = 0; k < size; k++) result.setComponent(v, k, attribute.getComponent(v, k))
  extra.forEach((from, i) => {
    for (let k = 0; k < size; k++) result.setComponent(attribute.count + i, k, attribute.getComponent(from, k))
  })
  return result
}

/** Some exports join the two lower legs: Archer's soles are welded by triangles, Frost's boot cuffs and
 * Mage's and Tank's shins by thin strips. Whenever the legs part, those stretch into a slab or spikes.
 * Once per loaded source, give every triangle that spans both lower legs its own copy of the
 * minority-side vertices, skinned to the mirrored bones of its majority side; a triangle with no
 * majority collapses. Index count is unchanged.
 */
export function separateFeet(scene: THREE.Object3D): { resided: number; split: number; collapsed: number } {
  let resided = 0,
    split = 0,
    collapsed = 0
  scene.traverse((mesh) => {
    if (!(mesh instanceof THREE.SkinnedMesh) || !mesh.geometry.index) return
    const geometry = mesh.geometry,
      { skinIndex, skinWeight } = geometry.attributes
    if (!skinIndex || !skinWeight) return
    const bones = mesh.skeleton.bones,
      mirror = new Map<number, number>()
    bones.forEach((bone, i) => {
      if (!/L$/.test(bone.name)) return
      const j = bones.findIndex((other) => other.name === bone.name.slice(0, -1) + 'R')
      if (j >= 0) mirror.set(i, j).set(j, i)
    })
    // 1 = mostly left lower leg (shin, foot, paw, toe), 2 = mostly right, 0 = anything else.
    // Thighs are excluded: crotch and skirt geometry legitimately joins them.
    const side = new Uint8Array(skinIndex.count)
    for (let v = 0; v < skinIndex.count; v++) {
      let left = 0,
        right = 0
      for (let k = 0; k < 4; k++) {
        const name = bones[skinIndex.getComponent(v, k)]?.name ?? ''
        if (!/^(shin|foot|toe|paw)/.test(name)) continue
        if (name.endsWith('L')) left += skinWeight.getComponent(v, k)
        else if (name.endsWith('R')) right += skinWeight.getComponent(v, k)
      }
      side[v] = left > 0.6 ? 1 : right > 0.6 ? 2 : 0
    }
    const index = geometry.index!,
      count = skinIndex.count,
      extra: number[] = [],
      copies = new Map<number, number>()
    // Stray pieces skinned to the other leg (Frost's inner toe and heel caps): a small same-side island
    // whose only mesh contact is the opposite lower leg belongs to that leg. Vertices are welded across
    // UV seams by position.
    const position = geometry.attributes.position,
      weld = new Map<string, number>(),
      canonical = new Int32Array(count)
    for (let v = 0; v < count; v++) {
      const key = `${position.getX(v).toFixed(5)},${position.getY(v).toFixed(5)},${position.getZ(v).toFixed(5)}`
      canonical[v] = weld.get(key) ?? (weld.set(key, v), v)
    }
    const neighbours = new Map<number, Set<number>>()
    for (let f = 0; f < index.count; f += 3)
      for (let c = 0; c < 3; c++) {
        const a = canonical[index.getX(f + c)],
          b = canonical[index.getX(f + ((c + 1) % 3))]
        if (!side[a] && !side[b]) continue
        ;(neighbours.get(a) ?? neighbours.set(a, new Set()).get(a)!).add(b)
        ;(neighbours.get(b) ?? neighbours.set(b, new Set()).get(b)!).add(a)
      }
    const island = new Map<number, number[]>(),
      islands: { side: number; members: number[]; other: boolean; neutral: boolean }[] = []
    for (const start of neighbours.keys()) {
      if (!side[start] || island.has(start)) continue
      const piece = { side: side[start], members: [start], other: false, neutral: false }
      island.set(start, piece.members)
      for (let i = 0; i < piece.members.length; i++)
        for (const n of neighbours.get(piece.members[i])!) {
          if (side[n] === piece.side) {
            if (!island.has(n)) island.set(n, piece.members), piece.members.push(n)
          } else if (side[n]) piece.other = true
          else piece.neutral = true
        }
      islands.push(piece)
    }
    const largest = [0, 0, 0]
    for (const piece of islands) largest[piece.side] = Math.max(largest[piece.side], piece.members.length)
    const flipped = new Set<number>()
    for (const piece of islands)
      if (piece.other && !piece.neutral && piece.members.length < 0.25 * largest[piece.side])
        for (const v of piece.members) flipped.add(v)
    for (let v = 0; v < count; v++) {
      if (!flipped.has(canonical[v])) continue
      side[v] = 3 - side[v]
      for (let k = 0; k < 4; k++)
        skinIndex.setComponent(v, k, mirror.get(skinIndex.getComponent(v, k)) ?? skinIndex.getComponent(v, k))
      resided++
    }
    if (flipped.size) skinIndex.needsUpdate = true
    for (let f = 0; f < index.count; f += 3) {
      const corners = [index.getX(f), index.getX(f + 1), index.getX(f + 2)],
        left = corners.filter((v) => side[v] === 1).length,
        right = corners.filter((v) => side[v] === 2).length
      if (!left || !right) continue
      if (left === right) {
        index.setX(f + 1, corners[0])
        index.setX(f + 2, corners[0])
        collapsed++
        continue
      }
      const minority = left > right ? 2 : 1
      corners.forEach((v, c) => {
        if (side[v] !== minority) return
        const key = v * 4 + minority
        let copy = copies.get(key)
        if (copy === undefined) copies.set(key, (copy = count + extra.push(v) - 1))
        index.setX(f + c, copy)
      })
      split++
    }
    if (!extra.length) {
      if (collapsed) index.needsUpdate = true
      return
    }
    for (const name of Object.keys(geometry.attributes))
      geometry.setAttribute(name, appendVertices(geometry.attributes[name], extra))
    for (const name of Object.keys(geometry.morphAttributes))
      geometry.morphAttributes[name] = geometry.morphAttributes[name].map((a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) =>
        appendVertices(a, extra)
      )
    const skin = geometry.attributes.skinIndex
    for (let v = count; v < skin.count; v++)
      for (let k = 0; k < 4; k++) skin.setComponent(v, k, mirror.get(skin.getComponent(v, k)) ?? skin.getComponent(v, k))
    const indices =
      count + extra.length > 65535 && !(index.array instanceof Uint32Array) ? Uint32Array.from(index.array) : index.array
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  })
  return { resided, split, collapsed }
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
    timer = setTimeout(() => {
      expired = true
      abort?.()
      reject(new Error('Model load timed out'))
    }, 60_000)
  })
  try {
    return await Promise.race([
      load().then((source) => {
        if (expired) {
          disposeSource(source)
          throw new Error('Expired model load')
        }
        return source
      }),
      timeout
    ])
  } finally {
    clearTimeout(timer!)
  }
}

const sidecarModels = new Map(
  runtimeManifest.models.map((model) => [model.file, { size: model.bytes, hash: model.outputSha256 }])
)

/** Use compressed build artifacts when supported; original URLs remain the fallback. */
export function loadGLTF(url: string): Promise<GLTF> {
  const manager = new THREE.LoadingManager()
  const controller = new AbortController()
  const loader = new GLTFLoader(manager)
  return loadModelWithTimeout(
    async () => {
      const parsed = new URL(url, globalThis.location?.href ?? 'http://localhost/')
      const marker = '/tower-defense-art/models/'
      const index = parsed.pathname.lastIndexOf(marker)
      const model = index < 0 ? undefined : sidecarModels.get(parsed.pathname.slice(index + marker.length))
      if (import.meta.env.PROD && model !== undefined && typeof DecompressionStream !== 'undefined') {
        try {
          const sidecar = new URL(parsed.href)
          sidecar.pathname += `.${model.hash}.gz.bin`
          const response = await fetch(sidecar, { signal: controller.signal })
          if (!response.ok || !response.body) throw new Error('Model sidecar unavailable')
          // Fetch may already have decoded Content-Encoding, or a host may have
          // encoded the sidecar itself. Inspect the bytes rather than the header.
          const reader = response.body.getReader()
          const prefix: Uint8Array<ArrayBuffer>[] = []
          let prefixSize = 0
          while (prefixSize < 2) {
            const chunk = await reader.read()
            if (chunk.done) break
            prefix.push(chunk.value)
            prefixSize += chunk.value.byteLength
          }
          const first = prefix.flatMap((chunk) => Array.from(chunk.subarray(0, 2))).slice(0, 2)
          const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            async pull(sink) {
              if (prefix.length) sink.enqueue(prefix.shift()!)
              else {
                const chunk = await reader.read()
                if (chunk.done) sink.close()
                else sink.enqueue(chunk.value)
              }
            },
            cancel(reason) {
              return reader.cancel(reason)
            }
          })
          const decoded =
            first[0] === 0x1f && first[1] === 0x8b ? stream.pipeThrough(new DecompressionStream('gzip')) : stream
          let received = 0
          const bounded = decoded.pipeThrough(
            new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
              transform(chunk, sink) {
                received += chunk.byteLength
                if (received > model.size) throw new Error('Model sidecar exceeds expected size')
                sink.enqueue(chunk)
              }
            })
          )
          const bytes = await new Response(bounded).arrayBuffer()
          if (bytes.byteLength !== model.size) throw new Error('Model sidecar size mismatch')
          return await loader.parseAsync(bytes, new URL('.', parsed).href)
        } catch (error) {
          if (controller.signal.aborted) throw error
          // A missing, corrupt, or unsupported sidecar must not prevent use of the original.
        }
      }
      return loader.loadAsync(url)
    },
    () => {
      controller.abort()
      manager.abort()
    }
  )
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
          separateFeet(source.scene)
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
    let clip = spec.clipUrl
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
    if (spec.motionRole && !spec.clipUrl) clip = directMotionClip(scene, clip, spec.motionRole)
    const walker = spec.motionRole && clip.name === 'walk' ? getUnitModelDefinition(spec.motionRole) : undefined
    // Airborne and hopping roles have no planted stance to match.
    if (walker && !['bat', 'wraith', 'dragon', 'slime'].includes(spec.motionRole!))
      clip = walkGaitClip(scene, clip, walker.walkDistance / walker.scale, walker.origin[1])
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
