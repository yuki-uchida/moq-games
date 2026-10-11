import * as THREE from 'three'
import { SPRITE_DIRECTIONS, type SpriteDirection, type SpriteMotion } from './UnitSprites'

interface Pivot {
  readonly x: number
  readonly y: number
}

export interface WholeFrame {
  readonly index: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly durationMs: number
  readonly pivot: Pivot
  readonly headState: string
  readonly emitter?: Pivot
}

export interface WholeFrameEvent {
  readonly type: 'release' | 'hit'
  readonly atMs: number
}

export interface WholeFrameManifest {
  readonly version: 1
  readonly character: string
  readonly direction: SpriteDirection
  readonly motion: SpriteMotion | 'death'
  readonly status?: string
  readonly rendering?: string
  readonly texture: string
  readonly sha256: string
  readonly textureWidth: number
  readonly textureHeight: number
  readonly frameSize: Readonly<{ width: number; height: number; pivot: Pivot }>
  readonly pivotSpace: 'unscaled-cell-pixels'
  readonly pixelsPerWorldUnit: number
  readonly fps: number
  readonly loop: boolean
  readonly durationMs: number
  readonly strideWorldUnits?: number
  readonly attackVariant?: 'primary' | 'breath' | 'heal'
  readonly emissionWindow?: Readonly<{ startMs: number; endMs: number }>
  readonly activePoseStartFrame?: number
  readonly terminalBehavior?: 'hold-final-frame-until-new-stage-or-retry'
  readonly frames: readonly WholeFrame[]
  readonly events: readonly WholeFrameEvent[]
}

export interface WholeFrameSample {
  readonly frame: WholeFrame
  readonly texture: THREE.Texture
}

export interface WholeFrameAtlas {
  readonly manifest: WholeFrameManifest
  readonly resourceKey: string
  readonly worldSize: Readonly<{ width: number; height: number }>
  /** Mesh-center offset from the ground anchor in the renderer's y-down world. */
  readonly anchorOffset: Pivot
  sample(elapsedMs: number): WholeFrameSample
  dispose(): void
}

function invalid(message: string): never {
  throw new Error(`Invalid whole-frame manifest: ${message}`)
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${field} must be an object`)
  return value as Record<string, unknown>
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(`${field} must be a nonempty string`)
  return value
}

function number(value: unknown, field: string, minimum: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) invalid(`${field} is out of range`)
  if (integer && !Number.isSafeInteger(value)) invalid(`${field} must be a safe integer`)
  return value
}

function positive(value: unknown, field: string): number {
  const result = number(value, field, 0)
  if (result === 0) invalid(`${field} must be positive`)
  return result
}

function pivot(value: unknown, field: string, width: number, height: number): Pivot {
  const point = record(value, field)
  const x = number(point.x, `${field}.x`, 0)
  const y = number(point.y, `${field}.y`, 0)
  if (x > width || y > height) invalid(`${field} is outside its cell`)
  return Object.freeze({ x, y })
}

export function parseWholeFrameManifest(value: unknown): WholeFrameManifest {
  const data = record(value, 'manifest')
  if (data.version !== 1) invalid('version must be 1')
  const character = string(data.character, 'character')
  const direction = string(data.direction, 'direction') as SpriteDirection
  if (!SPRITE_DIRECTIONS.includes(direction)) invalid('direction must be one of the eight authored directions')
  const motion = string(data.motion, 'motion') as WholeFrameManifest['motion']
  if (!['idle', 'walk', 'attack', 'hit', 'death'].includes(motion)) invalid('motion is unsupported')
  const status = data.status === undefined ? undefined : string(data.status, 'status')
  const rendering = data.rendering === undefined ? undefined : string(data.rendering, 'rendering')
  const texture = string(data.texture, 'texture')
  const sha256 = string(data.sha256, 'sha256').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(sha256)) invalid('sha256 must contain 64 hexadecimal digits')
  const textureWidth = number(data.textureWidth, 'textureWidth', 1, true)
  const textureHeight = number(data.textureHeight, 'textureHeight', 1, true)
  const size = record(data.frameSize, 'frameSize')
  const width = number(size.width, 'frameSize.width', 1, true)
  const height = number(size.height, 'frameSize.height', 1, true)
  const commonPivot = pivot(size.pivot, 'frameSize.pivot', width, height)
  const pixelsPerWorldUnit =
    data.pixelsPerWorldUnit === undefined ? 3 : positive(data.pixelsPerWorldUnit, 'pixelsPerWorldUnit')
  if (!Number.isFinite(width / pixelsPerWorldUnit) || !Number.isFinite(height / pixelsPerWorldUnit)) {
    invalid('pixelsPerWorldUnit must produce finite world dimensions')
  }
  if (data.pivotSpace !== 'unscaled-cell-pixels') invalid('pivotSpace must be unscaled-cell-pixels')
  const fps = positive(data.fps, 'fps')
  if (typeof data.loop !== 'boolean') invalid('loop must be a boolean')
  const durationMs = positive(data.durationMs, 'durationMs')
  const attackVariant = data.attackVariant
  if (
    attackVariant !== undefined &&
    (motion !== 'attack' ||
      data.loop ||
      (attackVariant !== 'primary' && attackVariant !== 'breath' && attackVariant !== 'heal'))
  )
    invalid('attackVariant requires a nonlooping primary, breath or heal attack')
  let emissionWindow: Readonly<{ startMs: number; endMs: number }> | undefined
  if (data.emissionWindow !== undefined) {
    const window = record(data.emissionWindow, 'emissionWindow')
    if (Object.keys(window).some((key) => !['startMs', 'endMs'].includes(key)))
      invalid('emissionWindow contains unsupported fields')
    const startMs = number(window.startMs, 'emissionWindow.startMs', 0)
    const endMs = positive(window.endMs, 'emissionWindow.endMs')
    if (attackVariant !== 'breath' || startMs >= endMs || endMs > durationMs)
      invalid('emissionWindow must be inside a breath attack')
    emissionWindow = Object.freeze({ startMs, endMs })
  }
  if (attackVariant === 'breath' && !emissionWindow) invalid('breath attack requires an emissionWindow')
  const strideWorldUnits =
    data.strideWorldUnits === undefined ? undefined : positive(data.strideWorldUnits, 'strideWorldUnits')
  if (strideWorldUnits !== undefined && (motion !== 'walk' || !data.loop || strideWorldUnits > 128))
    invalid('strideWorldUnits requires a looping walk and must not exceed 128')
  if (!Array.isArray(data.frames) || !data.frames.length) invalid('frames must be a nonempty array')
  // The frozen Shaman candidate records passive staff positions as source metadata.
  // Accept only its exact eventless locomotion envelope, validate every coordinate,
  // and omit these positions from runtime emitters so they cannot become launch anchors.
  const passiveShamanStaff =
    character === 'mushroom-mage-3d' &&
    data.visualCharacterId === character &&
    data.runtimeType === 'shaman' &&
    (motion === 'idle' || motion === 'walk') &&
    attackVariant === undefined &&
    data.emissionWindow === undefined &&
    data.activePoseStartFrame === undefined &&
    data.terminalBehavior === undefined &&
    texture === `mushroom-mage-3d-${motion}-${direction}.png` &&
    width === 128 &&
    height === 112 &&
    commonPivot.x === 64 &&
    commonPivot.y === 94 &&
    pixelsPerWorldUnit === 1 &&
    textureWidth === 1536 &&
    textureHeight === (motion === 'idle' ? 672 : 224) &&
    fps === 24 &&
    data.loop &&
    durationMs === (motion === 'idle' ? 3000 : 1000) &&
    data.frames.length === (motion === 'idle' ? 72 : 24) &&
    strideWorldUnits === (motion === 'idle' ? undefined : 30) &&
    Array.isArray(data.events) &&
    data.events.length === 0 &&
    data.frames.every((value, index) => {
      const frame = record(value, `frames[${index}]`)
      return (
        frame.emitter !== undefined &&
        frame.x === (index % 12) * 128 &&
        frame.y === Math.floor(index / 12) * 112 &&
        frame.durationMs === [42, 41, 42][index % 3]
      )
    })
  const frames: WholeFrame[] = []
  let totalDurationMs = 0
  for (const [index, value] of data.frames.entries()) {
    const frame = record(value, `frames[${index}]`)
    if (frame.index !== index) invalid(`frames[${index}].index must be ${index}`)
    const x = number(frame.x, `frames[${index}].x`, 0, true)
    const y = number(frame.y, `frames[${index}].y`, 0, true)
    if (frame.width !== width || frame.height !== height) invalid(`frames[${index}] must match frameSize`)
    if (x > textureWidth - width || y > textureHeight - height) invalid(`frames[${index}] exceeds texture bounds`)
    const previous = frames[index - 1]
    if (previous && !(y === previous.y ? x >= previous.x + width : y >= previous.y + height)) {
      invalid(`frames[${index}] must follow nonoverlapping row-major order`)
    }
    const framePivot = pivot(frame.pivot, `frames[${index}].pivot`, width, height)
    if (framePivot.x !== commonPivot.x || framePivot.y !== commonPivot.y) {
      invalid(`frames[${index}].pivot must match the common ground pivot`)
    }
    const frameDurationMs = positive(frame.durationMs, `frames[${index}].durationMs`)
    const headState = string(frame.headState, `frames[${index}].headState`)
    const sourceEmitter =
      frame.emitter === undefined ? undefined : pivot(frame.emitter, `frames[${index}].emitter`, width, height)
    const emitter = passiveShamanStaff ? undefined : sourceEmitter
    if (emitter && (motion !== 'attack' || data.loop)) invalid('emitter requires a nonlooping attack')
    totalDurationMs += frameDurationMs
    frames.push(
      Object.freeze({ index, x, y, width, height, durationMs: frameDurationMs, pivot: commonPivot, headState, emitter })
    )
  }
  if (motion === 'death' && data.loop) invalid('death clips must not loop')
  const activePoseStartFrame =
    data.activePoseStartFrame === undefined
      ? undefined
      : number(data.activePoseStartFrame, 'activePoseStartFrame', 1, true)
  if (activePoseStartFrame !== undefined && (motion !== 'death' || activePoseStartFrame >= frames.length))
    invalid('activePoseStartFrame must select a non-neutral death frame')
  const terminalBehavior = data.terminalBehavior
  if (
    terminalBehavior !== undefined &&
    (motion !== 'death' || terminalBehavior !== 'hold-final-frame-until-new-stage-or-retry')
  )
    invalid('terminalBehavior must retain the final death frame')
  const tolerance = Number.EPSILON * Math.max(totalDurationMs, durationMs) * frames.length
  if (!Number.isFinite(totalDurationMs) || Math.abs(totalDurationMs - durationMs) > tolerance) {
    invalid('durationMs must equal the sum of frame durations')
  }
  const events: WholeFrameEvent[] = []
  const hasEmitter = frames.some((frame) => frame.emitter)
  if ((hasEmitter || attackVariant === 'breath') && frames.some((frame) => !frame.emitter))
    invalid('emitter must be supplied on every attack frame')
  if (attackVariant === 'heal' && hasEmitter) invalid('heal clips cannot have a projectile emitter')
  if (data.events !== undefined) {
    if (!Array.isArray(data.events) || data.events.length > 2) invalid('events must contain at most two entries')
    if (data.events.length && (motion !== 'attack' || data.loop)) invalid('events require a nonlooping attack')
    for (const value of data.events) {
      const event = record(value, 'event')
      if (Object.keys(event).some((key) => !['type', 'atMs'].includes(key)))
        invalid('event contains unsupported fields')
      if (event.type !== 'release' && event.type !== 'hit') invalid('event type is unsupported')
      const atMs = number(event.atMs, 'event.atMs', 0)
      if (atMs >= durationMs) invalid('event must be inside the clip duration')
      if (events.some((item) => item.type === event.type)) invalid('event types must be unique')
      if (events.length && atMs < events[events.length - 1].atMs) invalid('events must be time ordered')
      events.push(Object.freeze({ type: event.type, atMs }))
    }
  }
  if (emissionWindow && !events.some((event) => event.type === 'release' && event.atMs === emissionWindow.startMs))
    invalid('breath release must match emissionWindow.startMs')
  return Object.freeze({
    version: 1,
    character,
    direction,
    motion,
    status,
    rendering,
    texture,
    sha256,
    textureWidth,
    textureHeight,
    frameSize: Object.freeze({ width, height, pivot: commonPivot }),
    pivotSpace: 'unscaled-cell-pixels',
    pixelsPerWorldUnit,
    fps,
    loop: data.loop,
    durationMs: totalDurationMs,
    strideWorldUnits,
    attackVariant: attackVariant as WholeFrameManifest['attackVariant'],
    emissionWindow,
    activePoseStartFrame,
    terminalBehavior: terminalBehavior as WholeFrameManifest['terminalBehavior'],
    frames: Object.freeze(frames),
    events: Object.freeze(events)
  })
}

export function sampleWholeFrame(manifest: WholeFrameManifest, elapsedMs: number): WholeFrame {
  if (!Number.isFinite(elapsedMs)) throw new Error('Whole-frame elapsedMs must be finite')
  const time = Math.max(0, elapsedMs)
  let remaining = manifest.loop ? time % manifest.durationMs : Math.min(time, manifest.durationMs)
  let boundaryToleranceMs = 1e-6
  for (const frame of manifest.frames) boundaryToleranceMs = Math.min(boundaryToleranceMs, frame.durationMs / 1024)
  if (manifest.loop && manifest.durationMs - remaining <= boundaryToleranceMs) remaining = 0
  for (const frame of manifest.frames) {
    if (remaining < frame.durationMs - boundaryToleranceMs) return frame
    remaining = Math.max(0, remaining - frame.durationMs)
  }
  return manifest.frames[manifest.frames.length - 1]
}

function sameOriginUrl(value: string | URL, base: URL, origin: string): URL {
  const url = new URL(value, base)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
    throw new Error('Whole-frame artifacts must use same-origin HTTP(S) URLs without credentials')
  }
  return url
}

async function fetchArtifact(url: URL, signal?: AbortSignal): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url.href, { mode: 'same-origin', credentials: 'same-origin', redirect: 'error', signal })
  } catch (cause) {
    throw new Error(`Whole-frame artifact fetch failed: ${url.pathname}`, { cause })
  }
  if (!response.ok) throw new Error(`Whole-frame artifact fetch failed (${response.status}): ${url.pathname}`)
  if (response.url) sameOriginUrl(response.url, url, url.origin)
  return response
}

interface SourceResource {
  image: ImageBitmap
  texture: THREE.Texture
}
interface SharedSource {
  users: number
  promise: Promise<SourceResource>
  resource?: SourceResource
}
const runtimeSources = new Map<string, SharedSource>()

function sourceTexture(image: ImageBitmap): THREE.Texture {
  const source = new THREE.Texture(image)
  source.magFilter = THREE.NearestFilter
  source.minFilter = THREE.NearestFilter
  source.wrapS = THREE.ClampToEdgeWrapping
  source.wrapT = THREE.ClampToEdgeWrapping
  source.generateMipmaps = false
  source.flipY = false
  source.colorSpace = THREE.SRGBColorSpace
  source.needsUpdate = true
  return source
}

function createAtlas(
  manifest: WholeFrameManifest,
  resource: SourceResource,
  resourceKey: string,
  release: () => void
): WholeFrameAtlas {
  const source = resource.texture
  const samples = manifest.frames.map((frame) => {
    const texture = source.clone()
    texture.name = `${manifest.character}/${manifest.direction}/${manifest.motion}/${frame.index}`
    texture.repeat.set((frame.width - 1) / manifest.textureWidth, (frame.height - 1) / manifest.textureHeight)
    texture.offset.set(
      (frame.x + 0.5) / manifest.textureWidth,
      1 - (frame.y + frame.height - 0.5) / manifest.textureHeight
    )
    texture.updateMatrix()
    return Object.freeze({ frame, texture })
  })
  const { width, height, pivot } = manifest.frameSize
  const worldSize = Object.freeze({
    width: width / manifest.pixelsPerWorldUnit,
    height: height / manifest.pixelsPerWorldUnit
  })
  const anchorOffset = Object.freeze({
    x: (width / 2 - pivot.x) / manifest.pixelsPerWorldUnit,
    y: (height / 2 - pivot.y) / manifest.pixelsPerWorldUnit
  })
  let disposed = false
  return Object.freeze({
    manifest,
    resourceKey,
    worldSize,
    anchorOffset,
    sample(elapsedMs: number) {
      if (disposed) throw new Error('Whole-frame atlas has been disposed')
      return samples[sampleWholeFrame(manifest, elapsedMs).index]
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const { texture } of samples) texture.dispose()
      release()
    }
  })
}

export const RUNTIME_ATLAS_MAX_BYTES = 4 * 1024 * 1024

/** The frozen Soldier v2 attack alone needs four extra pixels below its unchanged ground pivot. */
export function isSoldierAttackOverscan(manifest: WholeFrameManifest): boolean {
  return (
    manifest.character === 'leaf-squire-3d' &&
    manifest.motion === 'attack' &&
    manifest.attackVariant === 'primary' &&
    !manifest.loop &&
    manifest.texture === `leaf-squire-3d-attack-${manifest.direction}.png` &&
    manifest.frameSize.width === 128 &&
    manifest.frameSize.height === 116 &&
    manifest.frameSize.pivot.x === 64 &&
    manifest.frameSize.pivot.y === 94 &&
    manifest.pixelsPerWorldUnit === 1 &&
    manifest.textureWidth === 768 &&
    manifest.textureHeight === 696 &&
    manifest.frames.length === 36 &&
    manifest.fps === 60 &&
    Math.abs(manifest.durationMs - 600) < 1e-9 &&
    manifest.events.length === 1 &&
    manifest.events[0].type === 'hit' &&
    manifest.events[0].atMs === 315 &&
    manifest.frames.every((frame) => frame.emitter === undefined)
  )
}

export function loadWholeFrameAtlas(manifestUrl: string | URL, signal?: AbortSignal): Promise<WholeFrameAtlas> {
  return loadAtlas(manifestUrl, signal, 'review')
}

export function loadRuntimeWholeFrameAtlas(manifestUrl: string | URL, signal?: AbortSignal): Promise<WholeFrameAtlas> {
  return loadAtlas(manifestUrl, signal, 'character')
}

export function loadEffectWholeFrameAtlas(manifestUrl: string | URL, signal?: AbortSignal): Promise<WholeFrameAtlas> {
  return loadAtlas(manifestUrl, signal, 'effect')
}

async function loadAtlas(
  manifestUrl: string | URL,
  signal: AbortSignal | undefined,
  usage: 'review' | 'character' | 'effect'
): Promise<WholeFrameAtlas> {
  const page = new URL(globalThis.location.href)
  const url = sameOriginUrl(manifestUrl, page, page.origin)
  const response = await fetchArtifact(url, signal)
  let data: unknown
  try {
    data = await response.json()
  } catch (cause) {
    throw new Error(`Whole-frame manifest is not valid JSON: ${url.pathname}`, { cause })
  }
  const manifest = parseWholeFrameManifest(data)
  if (
    usage === 'character' &&
    (((manifest.frameSize.width !== 128 || manifest.frameSize.height !== 112) && !isSoldierAttackOverscan(manifest)) ||
      manifest.pixelsPerWorldUnit !== 1 ||
      manifest.textureWidth * manifest.textureHeight * 4 > RUNTIME_ATLAS_MAX_BYTES)
  ) {
    throw new Error(
      'Runtime atlas requires 128×112 cells (or the exact Soldier v2 attack 128×116 contract) at density 1 and at most 4 MiB decoded RGBA'
    )
  }
  if (
    usage === 'effect' &&
    (manifest.frameSize.width > 128 ||
      manifest.frameSize.height > 128 ||
      manifest.pixelsPerWorldUnit !== 1 ||
      manifest.textureWidth * manifest.textureHeight * 4 > 1024 * 1024 ||
      manifest.frames.length > 64 ||
      manifest.motion !== 'idle' ||
      manifest.direction !== 'e' ||
      manifest.events.length > 0)
  )
    throw new Error('Effect atlas requires +X idle frames up to 128×128 at density 1, 64 frames and 1 MiB decoded RGBA')
  const textureUrl = sameOriginUrl(manifest.texture, url, page.origin)
  const resourceKey = `${textureUrl.href}#${manifest.sha256}`
  let resource: SourceResource
  let release: () => void
  if (usage !== 'review') {
    let shared = runtimeSources.get(resourceKey)
    if (!shared) {
      shared = { users: 0, promise: decodeSource(textureUrl, manifest) }
      const captured = shared
      shared.promise = shared.promise.then((value) => {
        captured.resource = value
        return value
      })
      runtimeSources.set(resourceKey, shared)
    }
    const lease = shared
    lease.users++
    let released = false
    release = () => {
      if (released) return
      released = true
      if (--lease.users === 0) {
        runtimeSources.delete(resourceKey)
        lease.resource?.texture.dispose()
        lease.resource?.image.close()
      }
    }
    try {
      resource = await lease.promise
    } catch (error) {
      release()
      throw error
    }
  } else {
    resource = await decodeSource(textureUrl, manifest, signal)
    release = () => {
      resource.texture.dispose()
      resource.image.close()
    }
  }
  try {
    signal?.throwIfAborted()
    if (resource.image.width !== manifest.textureWidth || resource.image.height !== manifest.textureHeight)
      throw new Error('Whole-frame decoded texture dimensions do not match the manifest')
    return createAtlas(manifest, resource, resourceKey, release)
  } catch (error) {
    release()
    throw error
  }
}

async function decodeSource(
  textureUrl: URL,
  manifest: WholeFrameManifest,
  signal?: AbortSignal
): Promise<SourceResource> {
  const textureResponse = await fetchArtifact(textureUrl, signal)
  const bytes = await textureResponse.arrayBuffer()
  if (!globalThis.crypto?.subtle) throw new Error('Whole-frame SHA-256 verification requires Web Crypto')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (sha256 !== manifest.sha256) throw new Error(`Whole-frame texture SHA-256 mismatch: ${textureUrl.pathname}`)
  signal?.throwIfAborted()
  let image: ImageBitmap
  try {
    image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
      imageOrientation: 'flipY',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none'
    })
  } catch (cause) {
    throw new Error(`Whole-frame texture decode failed: ${textureUrl.pathname}`, { cause })
  }
  try {
    signal?.throwIfAborted()
    if (image.width !== manifest.textureWidth || image.height !== manifest.textureHeight)
      throw new Error('Whole-frame decoded texture dimensions do not match the manifest')
    return { image, texture: sourceTexture(image) }
  } catch (cause) {
    image.close()
    throw cause
  }
}
