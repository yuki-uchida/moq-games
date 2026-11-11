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
        ctx.globalAlpha = fade
        if (this.wet(tx, ty - 1)) {
          ctx.fillStyle = BODY[depth]
          ctx.fillRect(x, y, TILE, TILE)
        } else {
          // Surface cell: the body below a wave line, with a bright crest.
          ctx.fillStyle = BODY[0]
          for (let px = 0; px < TILE; px += 2) {
            const wx = x + px
            const wave = Math.round(Math.sin(wx * 0.07 + t * 2.6) * 1.6 + Math.sin(wx * 0.19 - t * 1.7) * 1.1) + 5
            ctx.fillRect(wx, y + wave, 2, TILE - wave)
            ctx.fillStyle = SURFACE
            ctx.fillRect(wx, y + wave, 2, 2)
            ctx.fillStyle = SURFACE_DARK
            ctx.fillRect(wx, y + wave + 2, 2, 1)
            ctx.fillStyle = BODY[0]
          }
        }
        // A few glints drifting slowly sideways.
        const h = cellHash(tx, ty, 11)
        if (h % 2 === 0) {
          const gx = x + ((h >>> 3) % 48) + ((t * 6 + (h % 17)) % 12)
          const gy = y + 14 + ((h >>> 9) % 40)
          ctx.globalAlpha = fade * (0.35 + 0.35 * Math.sin(t * 3 + (h % 13)))
          ctx.fillStyle = SURFACE
          ctx.fillRect(Math.round(gx), gy, 4, 1)
        }
      }
    ctx.globalAlpha = 1
  }
}
