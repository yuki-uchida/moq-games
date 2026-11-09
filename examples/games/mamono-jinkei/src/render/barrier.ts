/**
 * Arena barrier (View.barrier): a shimmering wind wall along the open edges of each active arena room — where sky,
 * bridges and doorways meet the room — so the blocked ring reads as a wall, not as invisible collision. Heroes
 * touching it kick up a small puff. Edge runs are laid out once per barrier key and drawn only where on screen.
 */
import type { HeroView, StageInfo, View } from '../sim/types'
import { TILE, TILE_KINDS } from '../vocab'
import type { Particles } from './effects'

/** One straight open stretch of a room's boundary: from (x0, y0) to (x1, y1) in world px; (nx, ny) points out. */
interface Run {
  x0: number
  y0: number
  x1: number
  y1: number
  nx: number
  ny: number
}

/** Touch distance from the boundary line (hero radius 16 plus a little). */
const TOUCH = 19
/** Depth of the glowing band outside the boundary (art px). */
const BAND = 40

export class BarrierWalls {
  private key = ''
  private runs: Run[] = []
  /** Heroes against a wall now, and when each last puffed. */
  private touching = new Set<number>()
  private puffed = new Map<number, number>()

  /** Recomputes the open edge runs when the barrier rooms change. */
  private layout(view: View, info: StageInfo) {
    const key = `${info.id}:${(view.barrier ?? []).join()}`
    if (key === this.key) return
    this.key = key
    this.runs = []
    this.touching.clear()
    const open = (tx: number, ty: number) => {
      if (tx < 0 || ty < 0 || tx >= info.w || ty >= info.h) return false
      const k = TILE_KINDS[info.tiles[ty * info.w + tx]]
      return k.walk || k.air
    }
    for (const id of view.barrier ?? []) {
      const r = info.rooms.find((q) => q.id === id)
      if (!r) continue
      // Each side: walk along it, merging tiles whose inside and outside are both open terrain.
      const sides: [number, number, number, number, number][] = [
        // [start tx, start ty, step dx, step dy, length], outward normal follows from the side index
        [r.x, r.y, 1, 0, r.w],
        [r.x + r.w - 1, r.y, 0, 1, r.h],
        [r.x, r.y + r.h - 1, 1, 0, r.w],
        [r.x, r.y, 0, 1, r.h]
      ]
      const normals: [number, number][] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0]
      ]
      sides.forEach(([sx, sy, dx, dy, n], si) => {
        const [nx, ny] = normals[si]
        let start = -1
        for (let i = 0; i <= n; i++) {
          const tx = sx + dx * i
          const ty = sy + dy * i
          const ok = i < n && open(tx, ty) && open(tx + nx, ty + ny)
          if (ok && start < 0) start = i
          if (!ok && start >= 0) {
            // The boundary line is the room-side edge of the outer tiles.
            const ex = nx > 0 ? (sx + 1) * TILE : nx < 0 ? sx * TILE : 0
            const ey = ny > 0 ? (sy + 1) * TILE : ny < 0 ? sy * TILE : 0
            this.runs.push(
              dx
                ? { x0: (sx + start) * TILE, y0: ey, x1: (sx + i) * TILE, y1: ey, nx, ny }
                : { x0: ex, y0: (sy + start) * TILE, x1: ex, y1: (sy + i) * TILE, nx, ny }
            )
            start = -1
          }
        }
      })
    }
  }

  /** Draws the walls on screen and puffs where a hero has just come up against one. */
  draw(
    ctx: CanvasRenderingContext2D,
    view: View,
    info: StageInfo,
    ox: number,
    oy: number,
    w: number,
    h: number,
    t: number,
    particles: Particles
  ) {
    if (!view.barrier?.length) {
      if (this.key) (this.key = ''), (this.runs = [])
      return
    }
    this.layout(view, info)
    ctx.save()
    ctx.lineCap = 'round'
    for (const r of this.runs) {
      // Clip the run to the screen (plus a margin for the outward band).
      const horiz = r.y0 === r.y1
      const a0 = horiz ? Math.max(r.x0, ox - 16) : Math.max(r.y0, oy - 16)
      const a1 = horiz ? Math.min(r.x1, ox + w + 16) : Math.min(r.y1, oy + h + 16)
      const across = horiz ? r.y0 - oy : r.x0 - ox
      if (a1 <= a0 || across < -40 || across > (horiz ? h : w) + 40) continue
      const at = (along: number, out: number): [number, number] =>
        horiz ? [along - ox, across + r.ny * out] : [across + r.nx * out, along - oy]
      // A soft cyan band fading outward from the boundary.
      const pulse = 0.42 + 0.08 * Math.sin(t * 2.4)
      const [gx0, gy0] = at(a0, 0)
      const [gx1, gy1] = at(a0, BAND)
      const band = ctx.createLinearGradient(gx0, gy0, gx1, gy1)
      band.addColorStop(0, `rgba(104, 176, 244, ${pulse})`)
      band.addColorStop(0.5, `rgba(140, 200, 250, ${pulse * 0.4})`)
      band.addColorStop(1, 'rgba(140, 200, 250, 0)')
      ctx.fillStyle = band
      const [bx1, by1] = at(a1, BAND)
      ctx.fillRect(Math.min(gx0, bx1), Math.min(gy0, by1), Math.abs(bx1 - gx0) || 1, Math.abs(by1 - gy0) || 1)
      // The wall's edge: a bright line over a thin blue one so it reads on pale clouds and dark cliffs alike.
      this.line(ctx, at, a0, a1, 2.5, 'rgba(46, 104, 178, 0.6)', 1.5)
      this.line(ctx, at, a0, a1, 0.5, `rgba(255, 255, 255, ${0.55 + pulse * 0.5})`, 2)
      // Wind streaks gliding along the wall at a few depths and speeds (each with a faint blue shadow).
      for (let k = 0; k < 3; k++) {
        const out = 6 + k * 10 + Math.sin(t * 1.7 + k * 2.1) * 2
        ctx.setLineDash([22 + k * 10, 34 + k * 14])
        ctx.lineDashOffset = -t * (70 + k * 28) * (k % 2 ? -1 : 1)
        this.line(ctx, at, a0, a1, out + 2, `rgba(46, 104, 178, ${0.5 - k * 0.12})`, 2.5)
        this.line(ctx, at, a0, a1, out, `rgba(255, 255, 255, ${0.95 - k * 0.2})`, k === 0 ? 3 : 2.5)
      }
      ctx.setLineDash([])
    }
    ctx.restore()
    for (const hv of view.heroes) this.bump(hv, t, particles)
  }

  private line(
    ctx: CanvasRenderingContext2D,
    at: (along: number, out: number) => [number, number],
    a0: number,
    a1: number,
    out: number,
    color: string,
    width: number
  ) {
    const [x0, y0] = at(a0, out)
    const [x1, y1] = at(a1, out)
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(Math.round(x0), Math.round(y0))
    ctx.lineTo(Math.round(x1), Math.round(y1))
    ctx.stroke()
  }

  /** A small puff where a hero comes up against a wall (at most every 0.5 s per hero). */
  private bump(hv: HeroView, t: number, particles: Particles) {
    let near: Run | undefined
    for (const r of this.runs) {
      const horiz = r.y0 === r.y1
      const along = horiz ? hv.x : hv.y
      if (along < (horiz ? r.x0 : r.y0) || along > (horiz ? r.x1 : r.y1)) continue
      const gap = horiz ? (r.y0 - hv.y) * r.ny : (r.x0 - hv.x) * r.nx
      if (gap >= 0 && gap < TOUCH) near = r
    }
    const was = this.touching.has(hv.slot)
    if (!near) {
      this.touching.delete(hv.slot)
      return
    }
    this.touching.add(hv.slot)
    if (was || t - (this.puffed.get(hv.slot) ?? -9) < 0.5) return
    this.puffed.set(hv.slot, t)
    const horiz = near.y0 === near.y1
    particles.burst('smoke', horiz ? hv.x : near.x0, horiz ? near.y0 : hv.y, 4)
  }
}
