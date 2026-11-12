/**
 * Art from another thread. A worker runs the same registry as the page; `answer` paints what a request asks for
 * there and packs the pixels for `postMessage`, `adopt` hands them to the page's registry, which then serves them
 * without painting. `createArtSource` is what the page talks to: a small pool of workers fed from one queue, and an
 * in-page fallback that answers the same requests by painting here when workers are missing or fail.
 *
 * Nothing here touches the DOM at import time, so the worker bundle and Node (tests, tools) can load it.
 */
import type { Ambience, ThemeId, TileQuery } from './contract'
import {
  adoptBackdrop,
  adoptClip,
  adoptFlashClip,
  adoptTile,
  backdrop,
  clearArtCache,
  flashSheet,
  sheet,
  tile,
  type Anim,
  type Backdrop
} from './index'
import { Raster } from './raster'

/** Palette indices of one raster, as in `Raster`. */
export interface RasterData {
  w: number
  h: number
  data: Uint16Array
}

/** One clip: each distinct raster once, `order` lists the frames as indices into `rasters`. */
export interface ClipData {
  rasters: RasterData[]
  order: number[]
  fps: number
  loop: boolean
  hold?: number[]
  anchor?: readonly [number, number]
  /** Hit-flash silhouettes: `flash[i]` belongs to `rasters[i]`. */
  flash?: RasterData[]
}

export interface BackdropData {
  sky: RasterData
  layers: { image: RasterData; parallax: number; y: number; drift?: number; front?: boolean }[]
  ambience: Ambience
}

export type ArtRequest =
  | { kind: 'clip'; sheet: string; clip: string; flash: boolean }
  | { kind: 'tiles'; queries: TileQuery[] }
  | { kind: 'backdrop'; theme: ThemeId }
  | { kind: 'trim' }

/**
 * The answer to a request. `local` replies were answered by painting on the page itself: the registry already
 * holds the result and there is nothing to adopt.
 */
export type ArtReply =
  | { kind: 'clip'; clip: ClipData }
  | { kind: 'tiles'; tiles: RasterData[] }
  | { kind: 'backdrop'; backdrop: BackdropData }
  | { kind: 'trim' }
  | { kind: 'local' }

/** A copy of the raster's pixels: the answering registry keeps its own raster, and the copy can be transferred. */
const pack = (r: Raster, transfer: ArrayBuffer[]): RasterData => {
  const data = r.data.slice()
  transfer.push(data.buffer as ArrayBuffer)
  return { w: r.w, h: r.h, data }
}

const unpack = (d: RasterData) => new Raster(d.w, d.h, d.data)

function packClip(anim: Anim, flash: Anim | undefined, transfer: ArrayBuffer[]): ClipData {
  const frames = anim.frames
  const index = new Map<Raster, number>()
  const first: number[] = []
  const order = frames.map((frame, i) => {
    let at = index.get(frame)
    if (at === undefined) {
      at = first.length
      index.set(frame, at)
      first.push(i)
    }
    return at
  })
  const clip: ClipData = {
    rasters: first.map((i) => pack(frames[i], transfer)),
    order,
    fps: anim.fps,
    loop: anim.loop
  }
  if (anim.hold) clip.hold = [...anim.hold]
  if (anim.anchor) clip.anchor = [anim.anchor[0], anim.anchor[1]]
  if (flash) {
    const white = flash.frames
    clip.flash = first.map((i) => pack(white[i], transfer))
  }
  return clip
}

/** Paints what the request asks for in this thread's registry and packs it; `transfer` lists the pixel buffers. */
export function answer(request: ArtRequest): { reply: ArtReply; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = []
  switch (request.kind) {
    case 'clip': {
      const anim = sheet(request.sheet)[request.clip]
      if (!anim) throw new Error(`Sheet "${request.sheet}" has no clip "${request.clip}"`)
      const flash = request.flash ? flashSheet(request.sheet)[request.clip] : undefined
      return { reply: { kind: 'clip', clip: packClip(anim, flash, transfer) }, transfer }
    }
    case 'tiles':
      return { reply: { kind: 'tiles', tiles: request.queries.map((q) => pack(tile(q), transfer)) }, transfer }
    case 'backdrop': {
      const art = backdrop(request.theme)
      const data: BackdropData = {
        sky: pack(art.sky, transfer),
        layers: art.layers.map((layer) => ({ ...layer, image: pack(layer.image, transfer) })),
        ambience: art.ambience
      }
      return { reply: { kind: 'backdrop', backdrop: data }, transfer }
    }
    case 'trim':
      clearArtCache()
      return { reply: { kind: 'trim' }, transfer }
  }
}

/** Hands a reply to this thread's registry (nothing to do for a local reply or a trim). */
export function adopt(request: ArtRequest, reply: ArtReply) {
  if (reply.kind === 'local') return
  if (request.kind === 'clip' && reply.kind === 'clip') {
    const { clip } = reply
    const rasters = clip.rasters.map(unpack)
    const timing = { fps: clip.fps, loop: clip.loop, hold: clip.hold, anchor: clip.anchor }
    adoptClip(request.sheet, request.clip, { frames: clip.order.map((i) => rasters[i]), ...timing })
    if (clip.flash) {
      const white = clip.flash.map(unpack)
      adoptFlashClip(request.sheet, request.clip, { frames: clip.order.map((i) => white[i]), ...timing })
    }
  } else if (request.kind === 'tiles' && reply.kind === 'tiles') {
    request.queries.forEach((q, i) => adoptTile(q, unpack(reply.tiles[i])))
  } else if (request.kind === 'backdrop' && reply.kind === 'backdrop') {
    const { backdrop: data } = reply
    const art: Backdrop = {
      sky: unpack(data.sky),
      layers: data.layers.map((layer) => ({ ...layer, image: unpack(layer.image) })),
      ambience: data.ambience
    }
    adoptBackdrop(request.theme, art)
  }
}

// ---------------------------------------------------------------------------------------------------- the source

/**
 * How much of a hurry a request is in. `urgent` (also written `true`): before everything that waits (a dig).
 * `background`: after everything else (art for something the player has not asked for yet). `group` names what
 * the request belongs to, so that `promote` can find it later.
 */
export type ArtHurry = boolean | { urgent?: boolean; background?: boolean; group?: string }

/** What the page talks to for art. */
export interface ArtSource {
  /** Answers a request; urgent ones overtake the queue, background ones wait for the rest, the others run in order. */
  request(request: ArtRequest, hurry?: ArtHurry): Promise<ArtReply>
  /** The background requests of a group are wanted now: they move in line with the ordinary ones. */
  promote?(group: string): void
  /** True while workers do the painting. */
  readonly remote: boolean
}

/** What a worker posts back for the request with the same id. */
export type WorkerReply = { id: number; ok: true; reply: ArtReply } | { id: number; ok: false; error: string }

/** The part of `Worker` the source uses (tests pass fakes). */
export interface WorkerLike {
  postMessage(message: { id: number; request: ArtRequest }): void
  onmessage: ((event: { data: WorkerReply }) => void) | null
  onerror: ((event: unknown) => void) | null
  terminate(): void
}

export interface ArtSourceOptions {
  /** How many workers (default: 2 with four or more cores, else 1; 0 answers everything on the page). */
  workers?: number
  /** Makes one worker; throwing or returning null means there are none. */
  makeWorker?: () => WorkerLike | null
  /** Hands the browser a turn between two requests answered on the page. */
  yielder?: () => Promise<void>
  /** How long the page may paint tiles of one request before it yields. */
  budgetMs?: number
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** A macrotask, and a rendering opportunity about every 50 ms when the page is visible. */
let lastFrameYield = 0
function yieldToBrowser(): Promise<void> {
  const now = clock()
  if (typeof document !== 'undefined' && typeof requestAnimationFrame === 'function' && !document.hidden) {
    if (now - lastFrameYield > 50) {
      lastFrameYield = now
      return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    }
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function defaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
}

const defaultPoolSize = () => (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 0) >= 4 ? 2 : 1)

interface Job {
  request: ArtRequest
  resolve: (reply: ArtReply) => void
  reject: (error: unknown) => void
  group?: string
}

interface Slot {
  worker: WorkerLike
  job: Job | null
  id: number
  /** Trims sent to this worker past the queue, by message id. */
  trims: Map<number, () => void>
}

/**
 * The page's art source: workers paint, the page adopts. When no worker can be made, or a worker dies, every
 * request (including those that were waiting on the dead worker) is answered on the page, one per macrotask.
 */
export function createArtSource(options: ArtSourceOptions = {}): ArtSource {
  const yielder = options.yielder ?? yieldToBrowser
  const budget = options.budgetMs ?? 8
  const make = options.makeWorker ?? defaultWorker
  const queue: Job[] = []
  /** Background requests: taken only when `queue` is empty. */
  const later: Job[] = []
  const local: Job[] = []
  const localLater: Job[] = []
  const slots: Slot[] = []
  let nextId = 1
  let localRunning = false

  /** Answers one request by painting on the page; tiles yield whenever the budget is used up. */
  async function answerHere(request: ArtRequest): Promise<ArtReply> {
    switch (request.kind) {
      case 'clip': {
        const anim = sheet(request.sheet)[request.clip]
        if (!anim) throw new Error(`Sheet "${request.sheet}" has no clip "${request.clip}"`)
        void anim.frames
        if (request.flash) void flashSheet(request.sheet)[request.clip]?.frames
        break
      }
      case 'tiles': {
        let start = clock()
        for (const q of request.queries) {
          if (clock() - start >= budget) {
            await yielder()
            start = clock()
          }
          tile(q)
        }
        break
      }
      case 'backdrop':
        backdrop(request.theme)
        break
      case 'trim':
        break
    }
    return { kind: 'local' }
  }

  async function runLocal() {
    if (localRunning) return
    localRunning = true
    try {
      while (local.length || localLater.length) {
        await yielder()
        const job = (local.shift() ?? localLater.shift())!
        try {
          job.resolve(await answerHere(job.request))
        } catch (error) {
          job.reject(error)
        }
      }
    } finally {
      localRunning = false
    }
  }

  const answerLocally = (job: Job, urgent = false, background = false) => {
    if (urgent) local.unshift(job)
    else if (background) localLater.push(job)
    else local.push(job)
    void runLocal()
  }

  /** A worker that failed: its job and everything still queued go to the page if it was the last one. */
  function retire(slot: Slot) {
    const at = slots.indexOf(slot)
    if (at < 0) return
    slots.splice(at, 1)
    slot.worker.onmessage = null
    slot.worker.onerror = null
    try {
      slot.worker.terminate()
    } catch {
      // Already gone.
    }
    for (const done of slot.trims.values()) done()
    slot.trims.clear()
    const job = slot.job
    slot.job = null
    if (job) queue.unshift(job)
    if (!slots.length) {
      while (queue.length) answerLocally(queue.shift()!)
      while (later.length) answerLocally(later.shift()!, false, true)
    } else pump()
  }

  function pump() {
    for (const slot of slots) {
      if (slot.job) continue
      const job = queue.shift() ?? later.shift()
      if (!job) return
      slot.job = job
      slot.id = nextId++
      try {
        slot.worker.postMessage({ id: slot.id, request: job.request })
      } catch {
        retire(slot)
        return
      }
    }
  }

  function attach(worker: WorkerLike) {
    const slot: Slot = { worker, job: null, id: 0, trims: new Map() }
    worker.onmessage = (event) => {
      const message = event.data
      const trimmed = slot.trims.get(message.id)
      if (trimmed) {
        slot.trims.delete(message.id)
        trimmed()
        return
      }
      const job = slot.job
      if (!job || message.id !== slot.id) return
      slot.job = null
      if (message.ok) job.resolve(message.reply)
      // Painting threw over there: try it here, where a failure at least reaches the caller.
      else answerLocally(job, true)
      pump()
    }
    worker.onerror = () => retire(slot)
    slots.push(slot)
  }

  const size = options.workers ?? defaultPoolSize()
  for (let i = 0; i < size; i++) {
    let worker: WorkerLike | null = null
    try {
      worker = make()
    } catch {
      worker = null
    }
    if (!worker) break
    attach(worker)
  }

  return {
    get remote() {
      return slots.length > 0
    },
    promote(group) {
      const move = (from: Job[], to: Job[]) => {
        for (let i = 0; i < from.length; ) {
          if (from[i].group === group) to.push(...from.splice(i, 1))
          else i += 1
        }
      }
      move(later, queue)
      move(localLater, local)
    },
    request(request, hurry = false) {
      const urgent = hurry === true || (typeof hurry === 'object' && Boolean(hurry.urgent))
      const background = typeof hurry === 'object' && Boolean(hurry.background) && !urgent
      const group = typeof hurry === 'object' ? hurry.group : undefined
      return new Promise<ArtReply>((resolve, reject) => {
        if (request.kind === 'trim' && slots.length) {
          // Every worker keeps its own caches: each one is told past the queue (a worker reads its messages in
          // order, so a trim never cuts into a painting), and the answer comes once all of them have trimmed.
          const all = [...slots].map(
            (slot) =>
              new Promise<void>((done) => {
                const id = nextId++
                slot.trims.set(id, done)
                try {
                  slot.worker.postMessage({ id, request })
                } catch {
                  retire(slot)
                }
              })
          )
          void Promise.all(all).then(() => resolve({ kind: 'trim' }))
          return
        }
        const job: Job = { request, resolve, reject, group }
        if (!slots.length) {
          answerLocally(job, urgent, background)
          return
        }
        if (urgent) queue.unshift(job)
        else if (background) later.push(job)
        else queue.push(job)
        pump()
      })
    }
  }
}

let shared: ArtSource | undefined
/** The app's one art source, made on first use (the boot makes it). */
export function artSource(): ArtSource {
  return (shared ??= createArtSource())
}

/**
 * The app's art source once the boot has made it, else undefined: unit tests and tools that never boot the app
 * paint everything in place, as they always did.
 */
export const sharedArtSource = (): ArtSource | undefined => shared
