/**
 * Terrain: the map is pre-rendered into 16×16-tile chunks (built lazily, one or two per frame while warming up).
 * Animated kinds (water) are drawn frame 0 into the chunk; visible animated tiles are redrawn on top from a per-tile
 * cache of their frames. Tiles in View.fills (sunk blocks) count as floor; their chunks are rebuilt on change.
 */
import { tile, tileFrames } from '../art/index'
import { TILE_FPS } from '../art/contract'
import type { StageInfo } from '../sim/types'
import { TILE, type TileKind } from '../vocab'

export const CHUNK = 16
const CHUNK_PX = CHUNK * TILE
// N, NE, E, SE, S, SW, W, NW
const AROUND: readonly [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1]
]

interface Chunk {
  canvas?: HTMLCanvasElement
  dirty: boolean
  /** Tile indices of animated kinds inside the chunk. */
  animated: number[]
}

export class Ground {
  readonly cw: number
  readonly ch: number
  private readonly chunks: Chunk[]
  private fills = new Set<number>()
  private fillsKey = ''
  private readonly frames = new Map<number, HTMLCanvasElement[]>()
  private readonly around: (TileKind | undefined)[] = new Array(8)

  constructor(readonly info: StageInfo) {
    this.cw = Math.ceil(info.w / CHUNK)
    this.ch = Math.ceil(info.h / CHUNK)
    this.chunks = Array.from({ length: this.cw * this.ch }, () => ({ dirty: true, animated: [] }))
  }

  kindAt(tx: number, ty: number): TileKind | undefined {
    const { w, h, tiles } = this.info
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return undefined
    const i = ty * w + tx
    return this.fills.has(i) ? 'floor' : tiles[i]
  }

  /** Applies View.fills; chunks touching a changed tile (and its neighbours) are rebuilt. */
  setFills(fills: readonly number[] | undefined) {
    const key = fills?.length ? fills.join(',') : ''
    if (key === this.fillsKey) return
    const next = new Set(fills ?? [])
    const changed = [...next].filter((i) => !this.fills.has(i)).concat([...this.fills].filter((i) => !next.has(i)))
    this.fills = next
    this.fillsKey = key
    const { w } = this.info
    for (const i of changed) {
      this.frames.delete(i)
      const tx = i % w
      const ty = Math.floor(i / w)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = Math.floor((tx + dx) / CHUNK)
          const cy = Math.floor((ty + dy) / CHUNK)
          if (cx >= 0 && cy >= 0 && cx < this.cw && cy < this.ch) this.chunks[cy * this.cw + cx].dirty = true
          this.frames.delete((ty + dy) * w + tx + dx)
        }
    }
  }

  private queryAround(tx: number, ty: number) {
    for (let k = 0; k < 8; k++) this.around[k] = this.kindAt(tx + AROUND[k][0], ty + AROUND[k][1])
    return this.around
  }

  private build(ci: number) {
    const c = this.chunks[ci]
    const cx = ci % this.cw
    const cy = Math.floor(ci / this.cw)
    const tw = Math.min(CHUNK, this.info.w - cx * CHUNK)
    const th = Math.min(CHUNK, this.info.h - cy * CHUNK)
    const canvas = c.canvas ?? document.createElement('canvas')
    canvas.width = tw * TILE
    canvas.height = th * TILE
    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(tw * TILE, th * TILE)
    const data = image.data
    const rowBytes = tw * TILE * 4
    c.animated = []
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const tx = cx * CHUNK + x
        const ty = cy * CHUNK + y
        const kind = this.kindAt(tx, ty)!
        if (tileFrames(kind) > 1) c.animated.push(ty * this.info.w + tx)
        const r = tile({ stage: this.info.id, kind, around: this.queryAround(tx, ty), tx, ty, frame: 0 })
        const rgba = r.rgba()
        if (kind === 'sky') shadeSky(rgba, this.kindAt(tx, ty - 1), this.kindAt(tx, ty - 2))
        for (let row = 0; row < TILE; row++)
          data.set(rgba.subarray(row * TILE * 4, (row + 1) * TILE * 4), (y * TILE + row) * rowBytes + x * TILE * 4)
      }
    ctx.putImageData(image, 0, 0)
    c.canvas = canvas
    c.dirty = false
  }

  private tileFrame(i: number, frame: number): HTMLCanvasElement {
    let list = this.frames.get(i)
    if (!list) this.frames.set(i, (list = []))
    let c = list[frame]
    if (c) return c
    const { w } = this.info
    const tx = i % w
    const ty = Math.floor(i / w)
    const kind = this.kindAt(tx, ty)!
    const r = tile({ stage: this.info.id, kind, around: this.queryAround(tx, ty), tx, ty, frame })
    c = document.createElement('canvas')
    c.width = c.height = TILE
    const ctx = c.getContext('2d')!
    const image = ctx.createImageData(TILE, TILE)
    image.data.set(r.rgba())
    ctx.putImageData(image, 0, 0)
    list[frame] = c
    return c
  }

  /** Builds up to `n` unbuilt chunks (call when the frame has spare time). */
  warm(n = 1): boolean {
    for (let i = 0; i < this.chunks.length && n > 0; i++)
      if (this.chunks[i].dirty) {
        this.build(i)
        n--
      }
    return this.chunks.every((c) => !c.dirty)
  }

  /** Draws the terrain under the view whose top-left art pixel is (x0, y0). */
  draw(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, t: number) {
    const ax = Math.max(0, Math.floor(x0 / CHUNK_PX))
    const ay = Math.max(0, Math.floor(y0 / CHUNK_PX))
    const bx = Math.min(this.cw - 1, Math.floor((x0 + w) / CHUNK_PX))
    const by = Math.min(this.ch - 1, Math.floor((y0 + h) / CHUNK_PX))
    const tick = Math.floor(t * TILE_FPS)
    const { w: mw } = this.info
    for (let cy = ay; cy <= by; cy++)
      for (let cx = ax; cx <= bx; cx++) {
        const ci = cy * this.cw + cx
        const c = this.chunks[ci]
        if (c.dirty) this.build(ci)
        ctx.drawImage(c.canvas!, cx * CHUNK_PX - x0, cy * CHUNK_PX - y0)
        for (const i of c.animated) {
          const tx = (i % mw) * TILE
          const ty = Math.floor(i / mw) * TILE
          if (tx + TILE < x0 || ty + TILE < y0 || tx > x0 + w || ty > y0 + h) continue
          const kind = this.info.tiles[i]
          const frames = tileFrames(kind)
          ctx.drawImage(this.tileFrame(i, tick % frames), tx - x0, ty - y0)
        }
      }
  }
}

const OPEN_SKY = new Set<TileKind | undefined>(['sky', undefined])

/**
 * Platforms cast a soft shadow onto the cloud sea below them, so the drop reads as height: the top rows of a sky
 * tile under solid ground are darkened (stronger right under the edge, fading over ~1.3 tiles).
 */
function shadeSky(rgba: Uint8Array, north: TileKind | undefined, north2: TileKind | undefined) {
  const start = OPEN_SKY.has(north) ? (OPEN_SKY.has(north2) ? -1 : -TILE) : 0
  if (start === -1) return
  const reach = 84
  for (let row = 0; row < TILE; row++) {
    const d = row - start
    if (d >= reach) break
    // Ease-out darkening with a dithered edge (keeps the pixel-art feel).
    const k = 1 - d / reach
    const dark = 0.5 * k * k
    for (let col = 0; col < TILE; col++) {
      const dither = ((row + col) & 1) * 0.04 * k
      const f = 1 - dark - dither
      const i = (row * TILE + col) * 4
      rgba[i] = rgba[i] * f
      rgba[i + 1] = rgba[i + 1] * f
      rgba[i + 2] = rgba[i + 2] * (f * 0.92 + 0.08)
    }
  }
}
