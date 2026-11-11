/**
 * Screen-level effects drawn over the world: text popups (`+1`, `3/8`), full-screen flashes, the hurt pulse and
 * the low-health vignette, letterbox bars and an iris wipe. Staging drives the bars and the iris.
 */
import { VIEW_H, VIEW_W } from '../art/contract'

/** The rounded system gothic stack the game uses for all text. */
export const ROUNDED_FONT =
  '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", system-ui, sans-serif'
const INK = '#2a1230'
const BAR = 34

interface Popup {
  text: string
  x: number
  y: number
  color: string
  age: number
  life: number
  size: number
}

const ease = (t: number) => 1 - (1 - t) ** 3

export class Overlay {
  reducedMotion: boolean
  /** Set every frame by the stage view: health is low (pulsing vignette). */
  lowHealth = false
  private popups: Popup[] = []
  private flashColor = '#ffffff'
  private flashAlpha = 0
  private flashPeak = 0
  private flashTime = 0
  private flashLength = 0
  private hurtPulse = 0
  private time = 0
  private bars = 0
  private barsTarget = 0
  private barsSpeed = 4
  private iris: { from: number; to: number; t: number; seconds: number } | null = null
  private irisRadius = 1
  /** Iris centre in screen pixels. */
  irisX = VIEW_W / 2
  irisY = VIEW_H / 2

  constructor(reducedMotion = false) {
    this.reducedMotion = reducedMotion
  }

  /** A short rising text at a world position. */
  popup(text: string, x: number, y: number, color = '#fff9f4', size = 13) {
    this.popups.push({ text, x, y, color, age: 0, life: 0.95, size })
    if (this.popups.length > 24) this.popups.shift()
  }

  /** A full-screen flash that fades out (off under reduced motion). */
  flash(color = '#ffffff', alpha = 0.55, seconds = 0.22) {
    if (this.reducedMotion) return
    this.flashColor = color
    this.flashPeak = alpha
    this.flashAlpha = alpha
    this.flashLength = seconds
    this.flashTime = 0
  }

  /** The red pulse when the hero is hurt. */
  hurt() {
    this.hurtPulse = 1
  }

  /** Letterbox bars slide in (on) or out over `seconds`. */
  letterbox(on: boolean, seconds = 0.35) {
    this.barsTarget = on ? 1 : 0
    this.barsSpeed = 1 / Math.max(0.01, seconds)
  }

  /** Iris to `radius` (1 = fully open, 0 = closed) around a screen point over `seconds`. */
  irisTo(radius: number, seconds: number, x = VIEW_W / 2, y = VIEW_H / 2) {
    this.irisX = x
    this.irisY = y
    this.iris = { from: this.irisRadius, to: radius, t: 0, seconds: Math.max(0.01, seconds) }
  }

  get irisOpen() {
    return this.irisRadius
  }

  get barsAmount() {
    return this.bars
  }

  update(dt: number) {
    this.time += dt
    for (const p of this.popups) p.age += dt
    this.popups = this.popups.filter((p) => p.age < p.life)
    if (this.flashAlpha > 0) {
      this.flashTime += dt
      this.flashAlpha = Math.max(0, this.flashPeak * (1 - this.flashTime / this.flashLength))
    }
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 2.2)
    if (this.bars !== this.barsTarget) {
      const step = dt * this.barsSpeed
      this.bars =
        this.bars < this.barsTarget
          ? Math.min(this.barsTarget, this.bars + step)
          : Math.max(this.barsTarget, this.bars - step)
    }
    if (this.iris) {
      const iris = this.iris
      iris.t = Math.min(iris.seconds, iris.t + dt)
      this.irisRadius = iris.from + (iris.to - iris.from) * ease(iris.t / iris.seconds)
      if (iris.t >= iris.seconds) this.iris = null
    }
  }

  /** Popups, drawn in screen space (k× transform) relative to the view at (viewX, viewY). */
  drawPopups(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    if (!this.popups.length) return
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const p of this.popups) {
      const t = p.age / p.life
      const rise = ease(Math.min(1, t * 1.6)) * 22
      const pop = t < 0.12 ? 0.7 + (t / 0.12) * 0.3 : 1
      ctx.globalAlpha = t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1
      ctx.font = `800 ${Math.round(p.size * pop)}px ${ROUNDED_FONT}`
      const x = p.x - viewX
      const y = p.y - viewY - rise
      ctx.lineWidth = 3.5
      ctx.strokeStyle = INK
      ctx.strokeText(p.text, x, y)
      ctx.fillStyle = p.color
      ctx.fillText(p.text, x, y)
    }
    ctx.restore()
  }

  /** Flash, vignettes, bars and iris, in screen space. */
  drawScreen(ctx: CanvasRenderingContext2D) {
    const pulse = this.lowHealth ? (this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.max(0, Math.sin(this.time * 7.5))) : 0
    const red = Math.max(this.hurtPulse * 0.75, pulse * 0.45)
    // A soft frame of shadow so the world reads as a stage.
    const vignette = ctx.createRadialGradient(
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.45,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_H * 0.98
    )
    vignette.addColorStop(0, 'rgba(20,8,40,0)')
    vignette.addColorStop(1, 'rgba(20,8,40,0.26)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    if (red > 0.01) {
      const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.92)
      g.addColorStop(0, 'rgba(220,30,60,0)')
      g.addColorStop(1, `rgba(220,30,60,${(red * 0.6).toFixed(3)})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    }
    if (this.flashAlpha > 0) {
      ctx.globalAlpha = this.flashAlpha
      ctx.fillStyle = this.flashColor
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      ctx.globalAlpha = 1
    }
    if (this.bars > 0) {
      const h = Math.round(BAR * ease(this.bars))
      ctx.fillStyle = '#0b0618'
      ctx.fillRect(0, 0, VIEW_W, h)
      ctx.fillRect(0, VIEW_H - h, VIEW_W, h)
    }
    if (this.irisRadius < 1) {
      const max = Math.hypot(VIEW_W, VIEW_H)
      ctx.fillStyle = '#0b0618'
      ctx.beginPath()
      ctx.rect(0, 0, VIEW_W, VIEW_H)
      if (this.irisRadius > 0) ctx.arc(this.irisX, this.irisY, this.irisRadius * max, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
    }
  }
}
