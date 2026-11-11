/**
 * Sky and parallax layers from `backdrop(theme)`, plus the theme's ambience particles and night twinkles.
 * While a theme has no backdrop yet, `drawFallbackSky` paints the first version's procedural sky and hills.
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
  private art: Backdrop | undefined
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
    const ambience = this.art?.ambience ?? 'none'
    for (let i = 0; i < AMBIENCE_COUNT[ambience]; i++)
      this.motes.push({
        x: r() * VIEW_W,
        y: r() * VIEW_H,
        vx: (r() - 0.5) * 10,
        vy: (r() - 0.5) * 6,
        phase: r() * Math.PI * 2,
        size: r() < 0.3 ? 2 : 1
      })
    if (this.art && NIGHT_SKIES.has(theme))
      for (let i = 0; i < 7; i++) this.twinkles.push({ x: r() * VIEW_W, y: r() * VIEW_H * 0.42, phase: r() * 10 })
  }

  get hasArt() {
    return Boolean(this.art)
  }

  update(dt: number) {
    this.time += dt
    const ambience = this.art?.ambience ?? 'none'
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
    if (!this.art) {
      drawFallbackSky(ctx, this.theme, viewX, this.time)
      return
    }
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
    if (!this.art) return
    for (const layer of this.art.layers) if (layer.front) this.drawLayer(ctx, layer, viewX, viewY)
  }

  private drawAmbience(ctx: CanvasRenderingContext2D) {
    const ambience = this.art?.ambience ?? 'none'
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

// ---------------------------------------------------------------------------------------------------------
// FALLBACK — the first version's procedural sky and hills, used only while `hasBackdrop(theme)` is false.
// Delete this block once every theme has a backdrop.
// ---------------------------------------------------------------------------------------------------------

const FALLBACK: Record<ThemeId, { top: string; bottom: string; hills: [string, string, string]; stars: boolean }> = {
  meadow: { top: '#6ec3ff', bottom: '#e6f8ff', hills: ['#a8d8a0', '#6fbf72', '#3f9450'], stars: false },
  night: { top: '#150d38', bottom: '#4a3580', hills: ['#3a2a68', '#2a1f52', '#1b1440'], stars: true },
  cave: { top: '#241a3d', bottom: '#5a4470', hills: ['#463560', '#352849', '#241a33'], stars: false },
  forest: { top: '#2f7a52', bottom: '#b8e8c0', hills: ['#2a6b46', '#1f5236', '#123a26'], stars: false },
  fortress: { top: '#3a3e52', bottom: '#9aa0b8', hills: ['#565b74', '#42465e', '#2c3042'], stars: false },
  castle: { top: '#4a3f6a', bottom: '#b0a4d8', hills: ['#5d5486', '#463d68', '#2f2849'], stars: true },
  star: { top: '#0d0722', bottom: '#4a2a7a', hills: ['#3a2566', '#2a1a50', '#1a1038'], stars: true }
}

export function drawFallbackSky(ctx: CanvasRenderingContext2D, theme: ThemeId, viewX: number, time: number) {
  const bg = FALLBACK[theme]
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H)
  gradient.addColorStop(0, bg.top)
  gradient.addColorStop(1, bg.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  if (bg.stars) {
    for (let i = 0; i < 48; i++) {
      const x = ((i * 137.5) % (VIEW_W + 80)) - 40
      const y = (i * 89.3) % (VIEW_H * 0.7)
      ctx.globalAlpha = 0.35 + 0.3 * (1 + Math.sin(time * 2 + i))
      ctx.fillStyle = i % 5 === 0 ? '#ffd45e' : '#ffffff'
      const size = i % 7 === 0 ? 2 : 1
      ctx.fillRect(Math.round(x), Math.round(y), size, size)
    }
    ctx.globalAlpha = 1
  }
  const hills = (color: string, offset: number, base: number, amp: number, step: number) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, VIEW_H)
    for (let x = 0; x <= VIEW_W; x += 4) {
      const t = (x + offset) / step
      ctx.lineTo(x, Math.round(base - Math.abs(Math.sin(t) * amp)))
    }
    ctx.lineTo(VIEW_W, VIEW_H)
    ctx.closePath()
    ctx.fill()
  }
  hills(bg.hills[0], viewX * 0.15, VIEW_H * 0.62, 90, 26)
  hills(bg.hills[1], viewX * 0.3, VIEW_H * 0.74, 120, 34)
  hills(bg.hills[2], viewX * 0.5, VIEW_H * 0.9, 150, 40)
}
