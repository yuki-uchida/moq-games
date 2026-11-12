import { describe, expect, it } from 'vitest'
import {
  adoptClip,
  backdrop,
  backdropReady,
  clearArtCache,
  clipReady,
  flashReady,
  flashSheet,
  hasTile,
  sheet,
  tile,
  tileKey
} from '../src/art'
import type { TileQuery } from '../src/art/contract'
import { Raster } from '../src/art/raster'
import {
  adopt,
  answer,
  createArtSource,
  type ArtReply,
  type ArtRequest,
  type WorkerLike,
  type WorkerReply
} from '../src/art/remote'
import { artStats } from '../src/art/stats'

/** Frame sizes, pixels and timing of a clip, for comparing a painted clip with an adopted one. */
const snapshot = (id: string, name: string, flash = false) => {
  const a = (flash ? flashSheet(id) : sheet(id))[name]
  return {
    fps: a.fps,
    loop: a.loop,
    hold: a.hold ?? null,
    anchor: a.anchor ?? null,
    frames: a.frames.map((f) => [f.w, f.h, Array.from(f.data)])
  }
}

/** What a worker would answer, made in this thread and then forgotten here, as if it came from elsewhere. */
function fromElsewhere(request: ArtRequest) {
  const { reply, transfer } = answer(request)
  clearArtCache()
  return { reply, transfer }
}

const QUERY: TileQuery = {
  theme: 'meadow',
  kind: 'dirt',
  around: ['empty', 'empty', 'dirt', 'solid', 'solid', 'solid', 'dirt', 'empty'],
  tx: 7,
  ty: 3
}

describe('answering and adopting', () => {
  it('sends a clip with its flash and adopts it without painting a pixel here', () => {
    const before = snapshot('walker', 'move')
    const flashBefore = snapshot('walker', 'move', true)
    clearArtCache()
    const request: ArtRequest = { kind: 'clip', sheet: 'walker', clip: 'move', flash: true }
    const { reply, transfer } = fromElsewhere(request)
    expect(reply.kind).toBe('clip')
    if (reply.kind !== 'clip') return
    expect(reply.clip.order).toHaveLength(before.frames.length)
    expect(reply.clip.flash).toHaveLength(reply.clip.rasters.length)
    // Every raster travels in a buffer of its own.
    expect(new Set(transfer).size).toBe(reply.clip.rasters.length * 2)
    expect(clipReady('walker', 'move')).toBe(false)
    expect(flashReady('walker', 'move')).toBe(false)
    adopt(request, reply)
    expect(clipReady('walker', 'move')).toBe(true)
    expect(flashReady('walker', 'move')).toBe(true)
    expect(artStats.remote).toBe(true)
    const painted = artStats.clips
    const created = Raster.created
    expect(snapshot('walker', 'move')).toEqual(before)
    expect(snapshot('walker', 'move', true)).toEqual(flashBefore)
    expect(artStats.clips).toBe(painted)
    expect(Raster.created).toBe(created)
  })

  it('copies the pixels it sends, so the answering registry keeps its own', () => {
    clearArtCache()
    const frames = sheet('prop:fruit').idle.frames
    const { reply } = answer({ kind: 'clip', sheet: 'prop:fruit', clip: 'idle', flash: false })
    if (reply.kind !== 'clip') throw new Error('expected a clip')
    expect(reply.clip.rasters[0].data).not.toBe(frames[0].data)
    expect(reply.clip.rasters[0].data.buffer).not.toBe(frames[0].data.buffer)
    expect(Array.from(reply.clip.rasters[0].data)).toEqual(Array.from(frames[0].data))
  })

  it('hands out stable clips that serve adopted frames once they arrive', () => {
    clearArtCache()
    const held = sheet('prop:berry').idle
    const request: ArtRequest = { kind: 'clip', sheet: 'prop:berry', clip: 'idle', flash: false }
    const { reply } = answer(request)
    // A fresh registry (as on the page) hands out a slot, then adopts into it.
    clearArtCache()
    const slot = sheet('prop:berry').idle
    // Identity compared as booleans: a failing or negated `toBe` deep-reads its operands, frames included.
    expect(slot === held).toBe(false)
    expect(clipReady('prop:berry', 'idle')).toBe(false)
    adopt(request, reply)
    expect(sheet('prop:berry').idle === slot).toBe(true)
    if (reply.kind !== 'clip') throw new Error('expected a clip')
    expect(slot.frames[0].data).toBe(reply.clip.rasters[reply.clip.order[0]].data)
  })

  it('keeps a clip that was already drawn here', () => {
    clearArtCache()
    const frames = sheet('prop:twig').idle.frames
    expect(clipReady('prop:twig', 'idle')).toBe(true)
    adoptClip('prop:twig', 'idle', { frames: [new Raster(1, 1)], fps: 1, loop: false })
    expect(sheet('prop:twig').idle.frames).toBe(frames)
  })

  it('reading the timing of a slot draws nothing more than the module clip would', () => {
    clearArtCache()
    const painted = artStats.clips
    // The hero's clips are `lazyAnim`s: their timing is plain data.
    const hero = sheet('hero').idle
    void hero.fps
    void hero.loop
    void hero.hold
    expect(artStats.clips).toBe(painted)
    expect(clipReady('hero', 'idle')).toBe(false)
  })

  it('sends tiles and adopts them under their painter key', () => {
    clearArtCache()
    const painted = tile(QUERY)
    const request: ArtRequest = { kind: 'tiles', queries: [QUERY] }
    const { reply } = fromElsewhere(request)
    expect(hasTile(QUERY)).toBe(false)
    adopt(request, reply)
    expect(hasTile(QUERY)).toBe(true)
    const adopted = tile(QUERY)
    expect(adopted).not.toBe(painted)
    expect(Array.from(adopted.data)).toEqual(Array.from(painted.data))
    // A query with the same key (one pattern repeat to the right) gets the same picture.
    const same = { ...QUERY, tx: QUERY.tx + 24 }
    expect(tileKey(same)).toBe(tileKey(QUERY))
    expect(tile(same)).toBe(adopted)
  })

  // A backdrop takes a few seconds to build in Node, and this builds it twice.
  it('sends a backdrop and adopts it without building it here', { timeout: 30_000 }, () => {
    clearArtCache()
    const built = backdrop('cave')
    const request: ArtRequest = { kind: 'backdrop', theme: 'cave' }
    const { reply } = fromElsewhere(request)
    expect(backdropReady('cave')).toBe(false)
    adopt(request, reply)
    expect(backdropReady('cave')).toBe(true)
    const count = artStats.backdrops
    const adopted = backdrop('cave')
    expect(artStats.backdrops).toBe(count)
    expect(adopted).not.toBe(built)
    expect(adopted.ambience).toBe(built.ambience)
    expect(adopted.layers.map(({ image, ...rest }) => [rest, image.w, image.h])).toEqual(
      built.layers.map(({ image, ...rest }) => [rest, image.w, image.h])
    )
    expect(Array.from(adopted.sky.data)).toEqual(Array.from(built.sky.data))
  })

  it('trims the answering registry', () => {
    const before = sheet('fx')
    const { reply } = answer({ kind: 'trim' })
    expect(reply.kind).toBe('trim')
    expect(sheet('fx')).not.toBe(before)
  })
})

/** A worker that answers only when the test says so, with this thread's registry. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: WorkerReply }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  inbox: { id: number; request: ArtRequest }[] = []
  terminated = false

  postMessage(message: { id: number; request: ArtRequest }) {
    this.inbox.push(message)
  }

  terminate() {
    this.terminated = true
  }

  /** Answers the oldest message. */
  reply(ok = true) {
    const { id, request } = this.inbox.shift()!
    this.onmessage?.({ data: ok ? { id, ok: true, reply: answer(request).reply } : { id, ok: false, error: 'boom' } })
  }
}

const clipRequest = (name: string): ArtRequest => ({ kind: 'clip', sheet: 'fx', clip: name, flash: false })
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the art source', () => {
  it('feeds a pool from one queue, one request per worker at a time, urgent ones first', async () => {
    const workers = [new FakeWorker(), new FakeWorker()]
    let made = 0
    const source = createArtSource({ workers: 2, makeWorker: () => workers[made++] })
    expect(source.remote).toBe(true)
    const names = Object.keys(sheet('fx')).slice(0, 4)
    const replies = names.map((name) => source.request(clipRequest(name)))
    expect(workers.map((w) => w.inbox.length)).toEqual([1, 1])
    const urgent = source.request({ kind: 'tiles', queries: [QUERY] }, true)
    workers[0].reply()
    // The urgent request overtook the two that were waiting.
    expect(workers[0].inbox[0].request.kind).toBe('tiles')
    workers[0].reply()
    expect((await urgent).kind).toBe('tiles')
    expect((await replies[0]).kind).toBe('clip')
    workers[1].reply()
    workers[0].reply()
    workers[1].reply()
    const answered = await Promise.all(replies)
    expect(answered.map((r) => r.kind)).toEqual(['clip', 'clip', 'clip', 'clip'])
  })

  it('answers on the page when there are no workers', async () => {
    clearArtCache()
    const source = createArtSource({ makeWorker: () => null, yielder: tick })
    expect(source.remote).toBe(false)
    const reply = await source.request({ kind: 'tiles', queries: [QUERY] })
    expect(reply.kind).toBe('local')
    expect(hasTile(QUERY)).toBe(true)
    const thrown = createArtSource({
      makeWorker: () => {
        throw new Error('no workers here')
      },
      yielder: tick
    })
    expect(thrown.remote).toBe(false)
    expect((await thrown.request(clipRequest('spark'))).kind).toBe('local')
    expect(clipReady('fx', 'spark')).toBe(true)
  })

  it('moves a dead worker’s request and the waiting ones to the page, losing none', async () => {
    const worker = new FakeWorker()
    const source = createArtSource({ workers: 1, makeWorker: () => worker, yielder: tick })
    const names = Object.keys(sheet('fx')).slice(0, 3)
    const replies = names.map((name) => source.request(clipRequest(name)))
    expect(worker.inbox).toHaveLength(1)
    worker.onerror?.(new Event('error'))
    expect(worker.terminated).toBe(true)
    expect(source.remote).toBe(false)
    const answered = await Promise.all(replies)
    expect(answered.map((r) => r.kind)).toEqual(['local', 'local', 'local'])
  })

  it('tries a request here when the worker could not paint it', async () => {
    const worker = new FakeWorker()
    const source = createArtSource({ workers: 1, makeWorker: () => worker, yielder: tick })
    const reply = source.request(clipRequest('dust'))
    worker.reply(false)
    expect((await reply).kind).toBe('local')
    expect(source.remote).toBe(true)
    const broken = source.request({ kind: 'clip', sheet: 'fx', clip: 'no-such-clip', flash: false })
    worker.reply(false)
    await expect(broken).rejects.toThrow(/no clip/)
  })

  it('tells every worker to trim, past the queue', async () => {
    const workers = [new FakeWorker(), new FakeWorker()]
    let made = 0
    const source = createArtSource({ workers: 2, makeWorker: () => workers[made++] })
    const busy = [source.request(clipRequest('spark')), source.request(clipRequest('dust'))]
    const trimmed = source.request({ kind: 'trim' })
    expect(workers.map((w) => w.inbox.map((m) => m.request.kind))).toEqual([
      ['clip', 'trim'],
      ['clip', 'trim']
    ])
    for (const w of workers) {
      w.reply()
      w.reply()
    }
    expect((await trimmed).kind).toBe('trim')
    const replies: ArtReply[] = await Promise.all(busy)
    expect(replies.map((r) => r.kind)).toEqual(['clip', 'clip'])
  })
})
