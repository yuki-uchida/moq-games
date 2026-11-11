/**
 * Sky and parallax layers from `backdrop(theme)`, plus the theme's ambience particles and night twinkles.
 */
import { backdrop, type Backdrop, type BackdropLayer } from '../art'
import { VIEW_H, VIEW_W, type Ambience, type ThemeId } from '../art/contract'
import { bake, blit, clip } from './bake'

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  size: number
}

const AMBIENCE_COUNT: Record<Ambience, number> = {
  none: 0,
  pollen: 14,
  fireflies: 12,
  dust: 16,
  leaves: 9,
  embers: 14,
  stardust: 18
}

const NIGHT_SKIES = new Set<ThemeId>(['night', 'castle', 'star'])

/** Layer offset: horizontal scroll (wrapped to the 640 px tile) and vertical position in view pixels. */
export function layerOffset(layer: BackdropLayer, viewX: number, viewY: number, groundViewY: number, time: number) {
  const scroll = viewX * layer.parallax + (layer.drift ?? 0) * time
  const x = -(((scroll % VIEW_W) + VIEW_W) % VIEW_W)
  const y = Math.round(layer.y - (viewY - groundViewY) * layer.parallax)
  return { x: Math.round(x), y }
}

export class BackdropView {
  private art: Backdrop
  private motes: Mote[] = []
  private twinkles: { x: number; y: number; phase: number }[] = []
  private time = 0

  constructor(
    readonly theme: ThemeId,
    /** The view y while the hero stands on the stage's main ground. */
    private groundViewY: number,
    private reducedMotion: boolean
  ) {
    this.art = backdrop(theme)
    let seed = theme.length * 977 + 13
    const r = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const ambience = this.art.ambience
    for (let i = 0; i < AMBIENCE_COUNT[ambience]; i++)
      this.motes.push({
        x: r() * VIEW_W,
        y: r() * VIEW_H,
        vx: (r() - 0.5) * 10,
        vy: (r() - 0.5) * 6,
        phase: r() * Math.PI * 2,
        size: r() < 0.3 ? 2 : 1
      })
    if (NIGHT_SKIES.has(theme))
      for (let i = 0; i < 7; i++) this.twinkles.push({ x: r() * VIEW_W, y: r() * VIEW_H * 0.42, phase: r() * 10 })
  }

  update(dt: number) {
    this.time += dt
    const ambience = this.art.ambience
    for (const m of this.motes) {
      let vx = m.vx
      let vy = m.vy
      if (ambience === 'leaves') {
        vy = 16 + m.size * 6
        vx = Math.sin(this.time * 1.3 + m.phase) * 18 - 6
      } else if (ambience === 'embers') vy = -14 - m.size * 4
      else if (ambience === 'pollen') vy = Math.sin(this.time * 0.8 + m.phase) * 4 - 2
      m.x += vx * dt
      m.y += vy * dt
      if (m.x < -10) m.x += VIEW_W + 20
      if (m.x > VIEW_W + 10) m.x -= VIEW_W + 20
      if (m.y < -10) m.y += VIEW_H + 20
      if (m.y > VIEW_H + 10) m.y -= VIEW_H + 20
    }
  }

  private drawLayer(ctx: CanvasRenderingContext2D, layer: BackdropLayer, viewX: number, viewY: number) {
    const image = bake(layer.image)
    const drift = this.reducedMotion ? 0 : this.time
    const { x, y } = layerOffset(layer, viewX, viewY, this.groundViewY, drift)
    const h = layer.image.h
    for (let i = 0; i < 2; i++) {
      const lx = x + i * VIEW_W
      ctx.drawImage(image, lx, y)
      // Extend the last row down to the bottom of the view.
      if (y + h < VIEW_H) ctx.drawImage(image, 0, h - 1, VIEW_W, 1, lx, y + h, VIEW_W, VIEW_H - (y + h))
    }
  }

  /** Sky and back layers (screen space). */
  drawBack(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    ctx.drawImage(bake(this.art.sky), 0, 0)
    for (const t of this.twinkles) {
      const a = Math.max(0, Math.sin(this.time * 2.2 + t.phase))
      if (a < 0.2) continue
      ctx.globalAlpha = a
      ctx.fillStyle = '#fff3b8'
      const x = Math.round(t.x)
      const y = Math.round(t.y)
      ctx.fillRect(x, y - 1, 1, 3)
      ctx.fillRect(x - 1, y, 3, 1)
      ctx.globalAlpha = 1
    }
    for (const layer of this.art.layers) if (!layer.front) this.drawLayer(ctx, layer, viewX, viewY)
    this.drawAmbience(ctx)
  }

  /** Foreground layers drawn after the world (screen space). */
  drawFront(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    for (const layer of this.art.layers) if (layer.front) this.drawLayer(ctx, layer, viewX, viewY)
  }

  private drawAmbience(ctx: CanvasRenderingContext2D) {
    const ambience = this.art.ambience
    if (ambience === 'none') return
    const leaf = ambience === 'leaves' ? clip('fx', 'leaf') : undefined
    for (const m of this.motes) {
      const x = Math.round(m.x)
      const y = Math.round(m.y)
      if (leaf) {
        blit(ctx, leaf, this.time + m.phase, x, y, { alpha: 0.75, flip: m.phase > Math.PI })
        continue
      }
      let color = '#fff3b8'
      let alpha = 0.6
      if (ambience === 'fireflies') {
        color = '#d8ff7a'
        alpha = 0.25 + 0.75 * Math.max(0, Math.sin(this.time * 2 + m.phase))
      } else if (ambience === 'dust') {
        color = '#d8c8e8'
        alpha = 0.35
      } else if (ambience === 'embers') {
        color = m.size > 1 ? '#ffb347' : '#ff7a3c'
        alpha = 0.4 + 0.4 * Math.sin(this.time * 5 + m.phase)
      } else if (ambience === 'stardust') {
        color = m.phase > 3 ? '#bfe6ff' : '#fff3b8'
        alpha = 0.3 + 0.6 * Math.abs(Math.sin(this.time * 1.5 + m.phase))
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
      ctx.fillStyle = color
      ctx.fillRect(x, y, m.size, m.size)
      if (ambience === 'fireflies' && alpha > 0.7) {
        ctx.globalAlpha = (alpha - 0.7) * 0.8
        ctx.fillRect(x - 1, y - 1, m.size + 2, m.size + 2)
      }
    }
    ctx.globalAlpha = 1
  }
}
