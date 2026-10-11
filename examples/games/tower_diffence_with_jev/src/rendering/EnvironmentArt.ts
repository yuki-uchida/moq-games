import * as THREE from 'three'
import { getField, type FieldId, type LayoutRevision, type Point } from '../game/model'
import { battlefieldGeometryIdentity, type ResolvedBattlefield } from '../game/BattlefieldRoutes'

export interface EnvironmentSprite {
  readonly texture: THREE.Texture
  readonly width: number
  readonly height: number
  readonly pivot: Point
  readonly emitter?: Point
}
export interface EnvironmentArt {
  readonly fieldId: FieldId
  readonly battlefieldVersion: 2
  readonly layoutRevision: LayoutRevision
  readonly geometryIdentity: string
  readonly field: ImageBitmap
  readonly props: Readonly<Record<string, EnvironmentSprite>>
  dispose(): void
}
export interface EnvironmentArtBundle {
  readonly layoutRevision: LayoutRevision
  readonly fieldIds: readonly FieldId[]
  readonly disposed: boolean
  acquire(fieldId: FieldId): EnvironmentArt
  dispose(): void
}
export const ENVIRONMENT_FIELD_IDS: readonly FieldId[] = ['meadow', 'desert', 'frost', 'volcanic']

export function environmentMatchesField(art: EnvironmentArt, field: ResolvedBattlefield): boolean {
  return (
    field.version === 2 &&
    art.fieldId === field.id &&
    art.battlefieldVersion === field.version &&
    art.layoutRevision === field.layoutRevision &&
    art.geometryIdentity === battlefieldGeometryIdentity(field)
  )
}

/** A manifest or a partial field batch alone never enables a new campaign layout. */
export function newCampaignLayoutRevision(bundle?: EnvironmentArtBundle): LayoutRevision {
  if (
    !bundle ||
    bundle.disposed ||
    bundle.layoutRevision !== 2 ||
    !ENVIRONMENT_FIELD_IDS.every((id) => bundle.fieldIds.includes(id))
  )
    return 1
  const leases: EnvironmentArt[] = []
  try {
    for (const id of ENVIRONMENT_FIELD_IDS) {
      const art = bundle.acquire(id)
      leases.push(art)
      if (!environmentMatchesField(art, getField(id, 2, 2))) return 1
    }
    return 2
  } catch {
    return 1
  } finally {
    for (const art of leases) art.dispose()
  }
}

interface ImageSpec {
  file: string
  width: number
  height: number
  sha256: string
  pivot?: Point
  emitter?: Point
  geometryIdentity?: string
}
export const ENVIRONMENT_PROP_IDS = [
  'gate-intact',
  'gate-damaged',
  'gate-critical',
  'gate-armor',
  'mud',
  ...['sandbag-intact', 'sandbag-damaged', 'spike-intact', 'spike-damaged', 'gate-turret'].flatMap((id) =>
    Array.from({ length: 8 }, (_, index) => `${id}-${index}`)
  )
] as const

export function environmentDirection(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
}

function imageSpec(value: unknown, field: boolean): ImageSpec {
  const spec = value as ImageSpec | undefined
  if (
    !spec ||
    typeof spec.file !== 'string' ||
    !/^[a-z0-9-]+\.png$/.test(spec.file) ||
    typeof spec.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(spec.sha256) ||
    !Number.isInteger(spec.width) ||
    !Number.isInteger(spec.height) ||
    (field
      ? spec.width !== 1280 || spec.height !== 1440
      : spec.width < 1 || spec.height < 1 || spec.width > 256 || spec.height > 256)
  )
    throw new Error('Invalid environment image metadata')
  const point = (p: Point | undefined) =>
    !!p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.x <= spec.width &&
    p.y >= 0 &&
    p.y <= spec.height
  if (!field && !point(spec.pivot)) throw new Error('Invalid environment ground pivot')
  if (spec.emitter !== undefined && !point(spec.emitter)) throw new Error('Invalid environment muzzle')
  return spec
}

/** The fourth argument preserves existing single-field loader call sites. */
export async function loadEnvironmentArt(
  base: URL,
  fieldId: FieldId,
  signal?: AbortSignal,
  layoutRevision: LayoutRevision = 1
): Promise<EnvironmentArt> {
  const bundle = await loadEnvironmentBatch(base, [fieldId], signal, layoutRevision)
  const art = bundle.acquire(fieldId)
  bundle.dispose()
  return art
}

/** Resolves only after all four matching backgrounds and shared props are verified and decoded. */
export function loadEnvironmentArtBundle(
  base: URL,
  signal?: AbortSignal,
  layoutRevision: LayoutRevision = 2
): Promise<EnvironmentArtBundle> {
  return loadEnvironmentBatch(base, ENVIRONMENT_FIELD_IDS, signal, layoutRevision)
}

async function loadEnvironmentBatch(
  base: URL,
  fieldIds: readonly FieldId[],
  signal: AbortSignal | undefined,
  layoutRevision: LayoutRevision
): Promise<EnvironmentArtBundle> {
  if (layoutRevision !== 1 && layoutRevision !== 2) throw new Error('Invalid environment layout revision')
  const root = new URL('environment-3d-trial/', base)
  if (!['https:', 'http:'].includes(root.protocol) || root.username || root.password)
    throw new Error('Environment art requires an HTTP(S) asset URL')
  const controller = new AbortController(),
    images: ImageBitmap[] = [],
    textures: THREE.Texture[] = []
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const texture of textures) texture.dispose()
    for (const image of images) image.close()
  }
  const fetchBytes = async (file: string, maximum: number) => {
    controller.signal.throwIfAborted()
    const response = await fetch(new URL(file, root), {
      mode: 'same-origin',
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Environment image request failed (${response.status})`)
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > maximum) throw new Error('Environment image exceeds the supported size')
    return bytes
  }
  try {
    const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('runtime-manifest.json', 65536)))
    if (!manifest || !manifest.props || (manifest.version !== 1 && manifest.version !== 2))
      throw new Error('Invalid environment manifest')
    if (manifest.version === 1 && layoutRevision !== 1)
      throw new Error('Original environment art cannot be used with this layout revision')
    if (manifest.version === 2) {
      for (const id of ENVIRONMENT_FIELD_IDS) {
        const original = imageSpec(manifest.layoutRevisions?.['1']?.fields?.[id], true),
          revised = imageSpec(manifest.layoutRevisions?.['2']?.fields?.[id], true)
        if (typeof original.geometryIdentity !== 'string' || typeof revised.geometryIdentity !== 'string')
          throw new Error('Environment manifest is missing a geometry identity')
        if (revised.file === original.file || revised.sha256 === original.sha256)
          throw new Error(`Revised environment must not reuse original field artwork: ${id}`)
      }
    }
    const fields = manifest.version === 1 ? manifest.fields : manifest.layoutRevisions?.[String(layoutRevision)]?.fields
    if (!fields) throw new Error('Environment manifest is missing the requested layout revision')
    const identities = new Map<FieldId, string>(),
      fieldEntries: [string, ImageSpec][] = fieldIds.map((fieldId) => {
        const spec = imageSpec(fields[fieldId], true),
          identity = battlefieldGeometryIdentity(getField(fieldId, 2, layoutRevision))
        if (manifest.version === 2 && spec.geometryIdentity !== identity)
          throw new Error(`Environment geometry identity mismatch: ${fieldId}, layout ${layoutRevision}`)
        identities.set(fieldId, identity)
        return [`field:${fieldId}`, spec]
      }),
      entries: [string, ImageSpec][] = ENVIRONMENT_PROP_IDS.map((id) => [id, imageSpec(manifest.props[id], false)])
    if (entries.some(([id, spec]) => id.startsWith('gate-turret-') && !spec.emitter))
      throw new Error('Environment turret is missing its muzzle')
    const props: Record<string, EnvironmentSprite> = {}
    const backgrounds = new Map<FieldId, ImageBitmap>()
    let next = 0
    const jobs: [string, ImageSpec][] = [...fieldEntries, ...entries]
    const workers = Array.from({ length: 4 }, async () => {
      while (next < jobs.length) {
        const [id, spec] = jobs[next++]
        try {
          const bytes = await fetchBytes(spec.file, id.startsWith('field:') ? 8 * 1024 * 1024 : 1024 * 1024),
            digest = await crypto.subtle.digest('SHA-256', bytes),
            hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
          if (hash !== spec.sha256) throw new Error(`Environment image hash mismatch: ${spec.file}`)
          controller.signal.throwIfAborted()
          const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
            imageOrientation: id.startsWith('field:') ? 'none' : 'flipY',
            premultiplyAlpha: 'none',
            colorSpaceConversion: 'none'
          })
          images.push(image)
          controller.signal.throwIfAborted()
          if (image.width !== spec.width || image.height !== spec.height)
            throw new Error(`Environment image dimensions mismatch: ${spec.file}`)
          if (id.startsWith('field:')) backgrounds.set(id.slice(6) as FieldId, image)
          else {
            const texture = new THREE.Texture(image)
            texture.name = `environment:${id}`
            texture.colorSpace = THREE.SRGBColorSpace
            texture.minFilter = texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = false
            texture.flipY = false
            texture.needsUpdate = true
            textures.push(texture)
            props[id] = { texture, width: spec.width, height: spec.height, pivot: spec.pivot!, emitter: spec.emitter }
          }
        } catch (error) {
          controller.abort(error)
          throw error
        }
      }
    })
    const results = await Promise.allSettled(workers),
      failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    controller.signal.throwIfAborted()
    // The bundle owns one reference; each renderer/bulk transaction gets its own lease.
    // Releasing the bundle never destroys an image still displayed by a renderer.
    let references = 1,
      bundleDisposed = false
    const release = () => {
      if (--references === 0) dispose()
    }
    return {
      layoutRevision,
      fieldIds: Object.freeze([...fieldIds]),
      get disposed() {
        return bundleDisposed
      },
      acquire(fieldId) {
        const field = backgrounds.get(fieldId),
          geometryIdentity = identities.get(fieldId)
        if (bundleDisposed || !field || !geometryIdentity) throw new Error('Environment bundle is unavailable')
        references++
        let released = false
        return {
          fieldId,
          battlefieldVersion: 2,
          layoutRevision,
          geometryIdentity,
          field,
          props,
          dispose() {
            if (released) return
            released = true
            release()
          }
        }
      },
      dispose() {
        if (bundleDisposed) return
        bundleDisposed = true
        release()
      }
    }
  } catch (error) {
    dispose()
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}
