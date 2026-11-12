/**
 * Terrain: one `tile(q)` per visible map tile, built from its 8 neighbours, baked and cached per tile. The stage's
 * warm-up has every tile of the map as it starts ready (`stageTileQueries`); a dig changes the pictures of the dug
 * tile's neighbours, and those the page does not have yet are asked from the art source while the old pictures stay
 * on screen. Decorations from `decor(theme)` are scattered over exposed tops and undersides by a position hash. The
 * query builders and the decoration choice are pure (tested in Node).
 */
import { decor, hasTile, tile, tileKey, type Decor } from '../art'
import type { Neighbour, ThemeId, TileKind, TileQuery } from '../art/contract'
import { VIEW_H, VIEW_W } from '../art/contract'
import { adopt, type ArtRequest, type ArtSource } from '../art/remote'
import { T } from '../game/sim'
import { TILE } from '../game/types'
import { blitRaster, bake } from './bake'

/** The part of `World` the terrain reads. */
export interface TileGrid {
  readonly w: number
  readonly h: number
  readonly tiles: Uint8Array
  readonly theme: ThemeId
}

const KIND: Record<number, TileKind | undefined> = {
  [T.SOLID]: 'solid',
  [T.DIRT]: 'dirt',
  [T.PLATFORM]: 'platform',
  [T.SPIKE]: 'spike'
}

/** What a cell holds: a tile kind, `empty`, `undefined` beyond the left, right and bottom edge, `empty` above. */
export function neighbourAt(grid: TileGrid, tx: number, ty: number): Neighbour {
  if (tx < 0 || tx >= grid.w || ty >= grid.h) return undefined
  if (ty < 0) return 'empty'
  return KIND[grid.tiles[ty * grid.w + tx]] ?? 'empty'
}

/** N, NE, E, SE, S, SW, W, NW. */
export const AROUND: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1]
]

/** The painter's query for a map tile, or null for an empty cell. */
export function tileQuery(grid: TileGrid, tx: number, ty: number): TileQuery | null {
  const here = neighbourAt(grid, tx, ty)
  if (here === undefined || here === 'empty') return null
  return {
    theme: grid.theme,
    kind: here,
    around: AROUND.map(([dx, dy]) => neighbourAt(grid, tx + dx, ty + dy)),
    tx,
    ty
  }
}

/**
 * One query per distinct tile picture of the map as it is now: every non-empty cell is covered, and the cells
 * nearest to column `startTx` (where the hero starts) come first.
 */
export function stageTileQueries(grid: TileGrid, startTx: number): TileQuery[] {
  const all: TileQuery[] = []
  for (let ty = 0; ty < grid.h; ty++)
    for (let tx = 0; tx < grid.w; tx++) {
      const q = tileQuery(grid, tx, ty)
      if (q) all.push(q)
    }
  all.sort((a, b) => Math.abs(a.tx - startTx) - Math.abs(b.tx - startTx) || a.ty - b.ty || a.tx - b.tx)
  const seen = new Set<string>()
  return all.filter((q) => {
    const key = tileKey(q)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The tiles whose picture depends on (tx, ty): itself and its 8 neighbours. */
export function affectedBy(tx: number, ty: number): [number, number][] {
  return [[tx, ty], ...AROUND.map(([dx, dy]) => [tx + dx, ty + dy] as [number, number])]
}

/** A small integer hash of a map position (view-only variation). */
export function cellHash(tx: number, ty: number, salt = 0) {
  let h = (tx * 374761393 + ty * 668265263 + salt * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

export interface DecorPick {
  /** Index into the theme's decorations. */
  index: number
  where: 'top' | 'under'
}

/**
 * The decoration on an exposed edge of tile (tx, ty), if any: about one tile in three, never on dirt, never on
 * an edge whose open neighbour holds a prop (`blocked` holds cell indices).
 */
export function decorAt(
  grid: TileGrid,
  list: readonly { where: 'top' | 'under'; weight: number }[],
  tx: number,
  ty: number,
  where: 'top' | 'under',
  blocked: ReadonlySet<number>
): DecorPick | null {
  if (!list.length) return null
  if (neighbourAt(grid, tx, ty) !== 'solid') return null
  const oy = where === 'top' ? ty - 1 : ty + 1
  if (neighbourAt(grid, tx, oy) !== 'empty') return null
  if (oy >= 0 && blocked.has(oy * grid.w + tx)) return null
  if (cellHash(tx, ty, where === 'top' ? 1 : 2) % 3 !== 0) return null
  const options = list.map((d, index) => ({ d, index })).filter(({ d }) => d.where === where && d.weight > 0)
  const total = options.reduce((sum, { d }) => sum + d.weight, 0)
  if (!total) return null
  let roll = ((cellHash(tx, ty, 7) % 10000) / 10000) * total
  for (const { d, index } of options) {
    roll -= d.weight
    if (roll < 0) return { index, where }
  }
  return { index: options[options.length - 1].index, where }
}

export class TerrainView {
  private cache = new Map<number, HTMLCanvasElement | null>()
  private decorList: Decor[]
  private decorCache = new Map<number, DecorPick[]>()
  /** Cells waiting for a new picture from the source, with the ticket of the newest request for each. */
  private waiting = new Map<number, number>()
  /** Cells of the current frame's digs, asked for together once the frame's events are handled. */
  private batch = new Map<number, TileQuery>()
  private ticket = 0

  /**
   * `blocked`: cells that hold a prop (no decoration grows into them). `source`: where a dig's new pictures come
   * from; without one they are painted here when next drawn.
   */
  constructor(
    private grid: TileGrid,
    private blocked: ReadonlySet<number>,
    private source?: ArtSource
  ) {
    this.decorList = decor(grid.theme)
  }

  /**
   * A dig at (tx, ty): the dug cell stops being drawn; a neighbour whose new picture is here switches to it at once,
   * any other one keeps its old picture until the source has painted the new one. Nothing is painted here.
   */
  invalidate(tx: number, ty: number) {
    for (const [x, y] of affectedBy(tx, ty)) {
      if (x < 0 || y < 0 || x >= this.grid.w || y >= this.grid.h) continue
      const i = y * this.grid.w + x
      this.decorCache.delete(i)
      this.waiting.delete(i)
      this.batch.delete(i)
      const q = tileQuery(this.grid, x, y)
      // Empty now, or never drawn (looked up when it comes into view): nothing to keep.
      if (!q || !this.cache.has(i)) {
        this.cache.delete(i)
        continue
      }
      if (hasTile(q)) this.cache.set(i, bake(tile(q)))
      else if (!this.source) this.cache.delete(i)
      else {
        if (!this.batch.size) queueMicrotask(() => this.ask())
        this.batch.set(i, q)
        this.waiting.set(i, ++this.ticket)
      }
    }
  }

  /** Asks for every picture the frame's digs need in one urgent request, and swaps each in when it arrives. */
  private ask() {
    const source = this.source
    if (!source || !this.batch.size) return
    const cells = [...this.batch.entries()].map(([i, q]) => ({ i, q, ticket: this.waiting.get(i) }))
    this.batch.clear()
    const request: ArtRequest = { kind: 'tiles', queries: cells.map((cell) => cell.q) }
    // A cell dug again meanwhile has lost its ticket or holds a newer one: the newer request wins.
    source.request(request, true).then(
      (reply) => {
        adopt(request, reply)
        for (const { i, q, ticket } of cells) {
          if (this.waiting.get(i) !== ticket) continue
          this.waiting.delete(i)
          this.cache.set(i, bake(tile(q)))
        }
      },
      () => {
        // The source could not paint them: they are painted here when next drawn.
        for (const { i, ticket } of cells) {
          if (this.waiting.get(i) !== ticket) continue
          this.waiting.delete(i)
          this.cache.delete(i)
        }
      }
    )
  }

  /** True while a dug cell still shows its old picture (for tests). */
  pending(tx: number, ty: number) {
    return this.waiting.has(ty * this.grid.w + tx)
  }

  private picture(tx: number, ty: number) {
    const i = ty * this.grid.w + tx
    let canvas = this.cache.get(i)
    if (canvas === undefined) {
      const q = tileQuery(this.grid, tx, ty)
      canvas = q ? bake(tile(q)) : null
      this.cache.set(i, canvas)
    }
    return canvas
  }

  private decorations(tx: number, ty: number) {
    const i = ty * this.grid.w + tx
    let picks = this.decorCache.get(i)
    if (!picks) {
      picks = []
      for (const where of ['top', 'under'] as const) {
        const pick = decorAt(this.grid, this.decorList, tx, ty, where, this.blocked)
        if (pick) picks.push(pick)
      }
      this.decorCache.set(i, picks)
    }
    return picks
  }

  private range(viewX: number, viewY: number) {
    return {
      x0: Math.max(0, Math.floor(viewX / TILE)),
      x1: Math.min(this.grid.w - 1, Math.floor((viewX + VIEW_W) / TILE)),
      y0: Math.max(0, Math.floor(viewY / TILE)),
      y1: Math.min(this.grid.h - 1, Math.floor((viewY + VIEW_H) / TILE))
    }
  }

  drawTiles(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    const { x0, x1, y0, y1 } = this.range(viewX, viewY)
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (this.grid.tiles[ty * this.grid.w + tx] === T.EMPTY) continue
        const picture = this.picture(tx, ty)
        if (picture) ctx.drawImage(picture, tx * TILE, ty * TILE)
      }
  }

  drawDecor(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    if (!this.decorList.length) return
    const { x0, x1, y0, y1 } = this.range(viewX, viewY - TILE)
    for (let ty = y0; ty <= Math.min(this.grid.h - 1, y1 + 1); ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (this.grid.tiles[ty * this.grid.w + tx] !== T.SOLID) continue
        for (const pick of this.decorations(tx, ty)) {
          const d = this.decorList[pick.index]
          // Shift by the hash so neighbours do not line up.
          const dx = (cellHash(tx, ty, 3) % 33) - 16
          const x = tx * TILE + TILE / 2 + dx
          const y = pick.where === 'top' ? ty * TILE : (ty + 1) * TILE
          blitRaster(ctx, d.image, d.anchor, x, y, { flip: cellHash(tx, ty, 5) % 2 === 1 })
        }
      }
  }
}
