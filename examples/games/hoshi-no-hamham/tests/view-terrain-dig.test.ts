import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTile, tileKey } from '../src/art'
import { answer, createArtSource, type ArtReply, type ArtRequest, type ArtSource } from '../src/art/remote'
import { artStats } from '../src/art/stats'
import { T, TILE, World } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import { stageTileQueries, TerrainView, tileQuery, type TileGrid } from '../src/view/terrain'

describe('the tiles a stage starts with', () => {
  for (const stage of STAGES) {
    it(`stage ${stage.no}: one query per distinct picture, every non-empty cell covered, nearest first`, () => {
      const world = new World(stage, { seed: 1 })
      const start = Math.floor(world.player.x / TILE)
      const queries = stageTileQueries(world, start)
      const keys = queries.map(tileKey)
      expect(new Set(keys).size).toBe(keys.length)
      const covered = new Set(keys)
      let cells = 0
      for (let ty = 0; ty < world.h; ty++)
        for (let tx = 0; tx < world.w; tx++) {
          const q = tileQuery(world, tx, ty)
          if (!q) continue
          cells += 1
          expect(covered.has(tileKey(q))).toBe(true)
        }
      expect(queries.length).toBeGreaterThan(0)
      expect(queries.length).toBeLessThanOrEqual(cells)
      const distance = queries.map((q) => Math.abs(q.tx - start))
      expect(distance).toEqual([...distance].sort((a, b) => a - b))
    })
  }
})

/** A canvas stand-in: the view only bakes rasters into canvases and draws them. */
interface FakeCanvas {
  width: number
  height: number
  pixels?: Uint8ClampedArray
}

const globals = globalThis as unknown as Record<string, unknown>
let savedDocument: unknown
beforeAll(() => {
  savedDocument = globals.document
  globals.document = {
    hidden: true,
    createElement: (): FakeCanvas & { getContext: () => object } => {
      const canvas: FakeCanvas & { getContext: () => object } = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: (image: { data: Uint8ClampedArray }) => (canvas.pixels = image.data)
        })
      }
      return canvas
    }
  }
})
afterAll(() => {
  globals.document = savedDocument
})

/** A grid from rows of '#' (solid), 'D' (dirt) and '.' (empty), in a theme no other test here uses. */
function grid(rows: string[]): TileGrid & { tiles: Uint8Array } {
  const h = rows.length
  const w = rows[0].length
  const tiles = new Uint8Array(w * h)
  const code: Record<string, number> = { '#': T.SOLID, D: T.DIRT, '.': T.EMPTY }
  rows.forEach((row, y) => [...row].forEach((ch, x) => (tiles[y * w + x] = code[ch])))
  return { w, h, tiles, theme: 'forest' }
}

/** What the view draws: the canvas object per cell. */
function drawn(view: TerrainView) {
  const at = new Map<string, FakeCanvas>()
  const ctx = {
    drawImage: (canvas: FakeCanvas, x: number, y: number) => at.set(`${x / TILE},${y / TILE}`, canvas)
  }
  view.drawTiles(ctx as unknown as CanvasRenderingContext2D, 0, 0)
  return at
}

/** A source whose answers the test releases; each answer is painted in this thread, as a worker would. */
function heldSource() {
  const asked: { request: ArtRequest; urgent: boolean; release: () => void; fail: () => void }[] = []
  const source: ArtSource = {
    remote: true,
    request: (request, urgent = false) =>
      new Promise<ArtReply>((resolve, reject) =>
        asked.push({
          request,
          urgent,
          release: () => resolve(answer(request).reply),
          fail: () => reject(new Error('worker gone'))
        })
      )
  }
  return { source, asked }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Digs (tx, ty) out of the grid and tells the view, as a dig event would. */
function dig(g: TileGrid & { tiles: Uint8Array }, view: TerrainView, tx: number, ty: number) {
  g.tiles[ty * g.w + tx] = T.EMPTY
  view.invalidate(tx, ty)
}

const ROWS = ['..........', '.DDDDDDDD.', '.DDDDDDDD.', '##########']

describe('a dig', () => {
  it('keeps the old pictures until the source answers, then swaps the new ones in', async () => {
    const g = grid(ROWS)
    const { source, asked } = heldSource()
    const view = new TerrainView(g, new Set(), source)
    const before = drawn(view)
    const painted = artStats.tiles
    dig(g, view, 3, 1)
    // Nothing is painted in the frame of the bite.
    expect(artStats.tiles).toBe(painted)
    const during = drawn(view)
    expect(during.has('3,1')).toBe(false)
    expect(during.get('4,1')).toBe(before.get('4,1'))
    expect(view.pending(4, 1)).toBe(true)
    await settle()
    // One urgent request for the whole frame, and only for pictures the page does not have.
    expect(asked).toHaveLength(1)
    expect(asked[0].urgent).toBe(true)
    const queries = asked[0].request.kind === 'tiles' ? asked[0].request.queries : []
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) expect(hasTile(q)).toBe(false)
    asked[0].release()
    await settle()
    const after = drawn(view)
    expect(view.pending(4, 1)).toBe(false)
    expect(after.get('4,1')).not.toBe(before.get('4,1'))
    expect(after.get('4,1')?.pixels).not.toEqual(before.get('4,1')?.pixels)
  })

  it('ignores an answer that a newer dig of the same cells has overtaken, and asks again', async () => {
    const g = grid(ROWS)
    const { source, asked } = heldSource()
    const view = new TerrainView(g, new Set(), source)
    const before = drawn(view)
    dig(g, view, 5, 1)
    await settle()
    // A second dig next to the first changes (6, 1) and (6, 2) again.
    dig(g, view, 7, 1)
    await settle()
    expect(asked).toHaveLength(2)
    const second = asked[1].request.kind === 'tiles' ? asked[1].request.queries : []
    expect(second.some((q) => q.tx === 6 && q.ty === 1)).toBe(true)
    // The first answer arrives late: (6, 1) keeps waiting for the newer one.
    asked[0].release()
    await settle()
    expect(view.pending(6, 1)).toBe(true)
    expect(drawn(view).get('6,1')).toBe(before.get('6,1'))
    asked[1].release()
    await settle()
    expect(view.pending(6, 1)).toBe(false)
    const now = tileQuery(g, 6, 1)!
    expect(hasTile(now)).toBe(true)
    expect(drawn(view).get('6,1')).not.toBe(before.get('6,1'))
  })

  it('switches at once to pictures that are already here', async () => {
    const g = grid(ROWS)
    const { source, asked } = heldSource()
    const first = new TerrainView(g, new Set(), source)
    drawn(first)
    dig(g, first, 2, 2)
    await settle()
    asked[0].release()
    await settle()
    // The same dig on a fresh copy of the map needs nothing new.
    const again = grid(ROWS)
    const view = new TerrainView(again, new Set(), source)
    const before = drawn(view)
    dig(again, view, 2, 2)
    await settle()
    expect(asked).toHaveLength(1)
    expect(view.pending(3, 2)).toBe(false)
    expect(drawn(view).get('3,2')).not.toBe(before.get('3,2'))
  })

  it('leaves the pictures to be painted here when the source fails, and without a source', async () => {
    const g = grid(ROWS)
    const { source, asked } = heldSource()
    const view = new TerrainView(g, new Set(), source)
    const before = drawn(view)
    dig(g, view, 4, 2)
    await settle()
    asked[0].fail()
    await settle()
    expect(view.pending(5, 2)).toBe(false)
    const painted = artStats.tiles
    const after = drawn(view)
    expect(artStats.tiles).toBeGreaterThan(painted)
    expect(after.get('5,2')).not.toBe(before.get('5,2'))

    const plain = grid(['..........', '.DDDDDDDD.', '.D#DDDDDD.', '##########'])
    const local = new TerrainView(plain, new Set())
    const old = drawn(local)
    dig(plain, local, 6, 2)
    expect(local.pending(5, 2)).toBe(false)
    expect(drawn(local).get('5,2')).not.toBe(old.get('5,2'))
  })

  it('works with the page fallback of a real source', async () => {
    const g = grid(['..........', '.DD#DDDDD.', '.DDDDDD#D.', '##########'])
    const source = createArtSource({ makeWorker: () => null, yielder: settle })
    const view = new TerrainView(g, new Set(), source)
    const before = drawn(view)
    dig(g, view, 5, 2)
    expect(view.pending(4, 2)).toBe(true)
    for (let i = 0; i < 5 && view.pending(4, 2); i++) await settle()
    expect(view.pending(4, 2)).toBe(false)
    expect(drawn(view).get('4,2')).not.toBe(before.get('4,2'))
  })
})
