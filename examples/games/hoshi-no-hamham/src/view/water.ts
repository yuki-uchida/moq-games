/**
 * The water grid: a translucent body that darkens with depth, an animated wavy surface line where the cell above
 * is dry, a few drifting glints, and new cells fading in over 0.15 s. Drawn in front of the actors so swimmers
 * look submerged.
 */
import { VIEW_H, VIEW_W } from '../art/contract'
import { TILE } from '../game/types'
import { cellHash } from './terrain'

/** The part of `World` the water reads. */
export interface WaterGrid {
  readonly w: number
  readonly h: number
  water: Uint8Array
}

export const FILL_FADE = 0.15

const BODY = ['rgba(86,170,232,0.50)', 'rgba(60,128,206,0.58)', 'rgba(44,92,176,0.64)', 'rgba(34,66,140,0.70)']
const SURFACE = '#bfeaff'
const SURFACE_DARK = 'rgba(40,96,170,0.8)'

/** Rectangles of one colour, as x, y, w, h and alpha in a reused buffer, filled by a pass of `WaterView.draw`. */
class RectList {
  private data = new Float64Array(5 * 64)
  count = 0

  push(x: number, y: number, w: number, h: number, alpha: number) {
    const at = this.count * 5
    if (at + 5 > this.data.length) {
      const grown = new Float64Array(this.data.length * 2)
      grown.set(this.data)
      this.data = grown
    }
    this.data[at] = x
    this.data[at + 1] = y
    this.data[at + 2] = w
    this.data[at + 3] = h
    this.data[at + 4] = alpha
    this.count += 1
  }

  /** Fills every rectangle in `color`; the alpha is only set when it changes. */
  flush(ctx: CanvasRenderingContext2D, color: string) {
    if (!this.count) return
    ctx.fillStyle = color
    let alpha = -1
    for (let i = 0; i < this.count; i++) {
      const at = i * 5
      if (this.data[at + 4] !== alpha) {
        alpha = this.data[at + 4]
        ctx.globalAlpha = alpha
      }
      ctx.fillRect(this.data[at], this.data[at + 1], this.data[at + 2], this.data[at + 3])
    }
    this.count = 0
  }
}

export class WaterView {
  /** Seconds since each cell filled (large = settled). */
  private age: Float32Array
  private seen: Uint8Array
  private time = 0

  constructor(private grid: WaterGrid) {
    this.age = new Float32Array(grid.w * grid.h).fill(99)
    this.seen = grid.water.slice()
  }

  update(dt: number) {
    this.time += dt
    const { water } = this.grid
    for (let i = 0; i < water.length; i++) {
      if (water[i] && !this.seen[i]) this.age[i] = 0
      else if (this.age[i] < 99) this.age[i] += dt
      this.seen[i] = water[i]
    }
  }

  private wet(tx: number, ty: number) {
    if (tx < 0 || tx >= this.grid.w || ty < 0 || ty >= this.grid.h) return false
    return this.grid.water[ty * this.grid.w + tx] === 1
  }

  private bodies = [new RectList(), new RectList(), new RectList(), new RectList()]
  private crests = new RectList()
  private lines = new RectList()
  private glints = new RectList()

  /**
   * Draws the water in one pass per colour (the bodies, the crests, the dark lines under them, the glints) so the
   * fill style changes a handful of times per frame, not several times per column of every surface cell. The
   * rectangles of different cells never overlap and the passes keep the order within a cell, so the picture is
   * the same as drawing cell by cell.
   */
  draw(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    const x0 = Math.max(0, Math.floor(viewX / TILE))
    const x1 = Math.min(this.grid.w - 1, Math.floor((viewX + VIEW_W) / TILE))
    const y0 = Math.max(0, Math.floor(viewY / TILE))
    const y1 = Math.min(this.grid.h - 1, Math.floor((viewY + VIEW_H) / TILE))
    const t = this.time
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.wet(tx, ty)) continue
        const i = ty * this.grid.w + tx
        const fade = Math.min(1, this.age[i] / FILL_FADE)
        let depth = 0
        while (depth < 3 && this.wet(tx, ty - depth - 1)) depth++
        const x = tx * TILE
        const y = ty * TILE
        if (this.wet(tx, ty - 1)) this.bodies[depth].push(x, y, TILE, TILE, fade)
        else {
          // Surface cell: the body below a wave line, with a bright crest.
          for (let px = 0; px < TILE; px += 2) {
            const wx = x + px
            const wave = Math.round(Math.sin(wx * 0.07 + t * 2.6) * 1.6 + Math.sin(wx * 0.19 - t * 1.7) * 1.1) + 5
            this.bodies[0].push(wx, y + wave, 2, TILE - wave, fade)
            this.crests.push(wx, y + wave, 2, 2, fade)
            this.lines.push(wx, y + wave + 2, 2, 1, fade)
          }
        }
        // A few glints drifting slowly sideways.
        const h = cellHash(tx, ty, 11)
        if (h % 2 === 0) {
          const gx = x + ((h >>> 3) % 48) + ((t * 6 + (h % 17)) % 12)
          const gy = y + 14 + ((h >>> 9) % 40)
          this.glints.push(Math.round(gx), gy, 4, 1, fade * (0.35 + 0.35 * Math.sin(t * 3 + (h % 13))))
        }
      }
    for (let d = 0; d < BODY.length; d++) this.bodies[d].flush(ctx, BODY[d])
    this.crests.flush(ctx, SURFACE)
    this.lines.flush(ctx, SURFACE_DARK)
    this.glints.flush(ctx, SURFACE)
    ctx.globalAlpha = 1
  }
}
