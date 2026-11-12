/**
 * Screen-level effects drawn over the world: text popups (`+1`, `3/8`), full-screen flashes, the hurt pulse and
 * the low-health vignette, letterbox bars and an iris wipe. Staging drives the bars and the iris, and adds speech
 * bubbles over characters, a spotlight that darkens all but one point, and an edge arrow toward an off-screen goal.
 */
import { VIEW_H, VIEW_W } from '../art/contract'
import { ZONES } from '../ui/hud-model'
import { blit, clip } from './bake'

/** The rounded system gothic stack the game uses for all text. */
export const ROUNDED_FONT =
  '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", system-ui, sans-serif'
const INK = '#2a1230'
const BAR = 34
/** How long a wordless balloon stays over a speaker. */
export const EMOTE_SECONDS = 0.55

/** A point in world pixels, fixed or followed every frame (a character's head). */
export type Anchor = { x: number; y: number } | (() => { x: number; y: number } | null)

export type BubbleTone = 'say' | 'yell'

interface Bubble {
  text: string
  anchor: Anchor
  tone: BubbleTone
  age: number
  life: number
  last: { x: number; y: number }
  /** The text's width in px at the bubble's font, measured the first time it is drawn (-1 until then). */
  textWidth: number
  /** The words are shown elsewhere (on the deck): only a small wordless balloon is drawn over the speaker. */
  wordless: boolean
  /** Where the box was last drawn, in view pixels (box and tail). */
  rect: { x: number; y: number; w: number; h: number } | null
}

/** The edge arrow: a screen point near the border and the direction it points (radians, 0 = right). */
export interface Pointer {
  x: number
  y: number
  angle: number
}

/**
 * Places the edge arrow for a world point (tx, ty) seen from the view at (viewX, viewY): on the line from the
 * screen centre toward the point, `margin` px inside the border. Null while the point is on screen.
 */
export function edgePointer(tx: number, ty: number, viewX: number, viewY: number, margin = 28): Pointer | null {
  const sx = tx - viewX
  const sy = ty - viewY
  if (sx >= 8 && sx <= VIEW_W - 8 && sy >= 8 && sy <= VIEW_H - 8) return null
  const cx = VIEW_W / 2
  const cy = VIEW_H / 2
  const dx = sx - cx
  const dy = sy - cy
  const k = Math.min((cx - margin) / Math.max(1e-6, Math.abs(dx)), (cy - margin) / Math.max(1e-6, Math.abs(dy)))
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) }
}

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

/** Removes, in place, the items for which `gone` is true; returns whether any went (no array is built). */
function dropWhere<T>(items: T[], gone: (item: T) => boolean): boolean {
  let kept = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!gone(item)) items[kept++] = item
  }
  const dropped = kept < items.length
  items.length = kept
  return dropped
}

/** The lines a stage can put in a bubble, for `warmOverlayText` (they are said in `staging.ts`). */
export const STAGED_LINES = ['こらーっ！まちなさーい！', 'ありがとう！', 'ぜぇ…ぜぇ…', 'やったね！'] as const

/** The popups a stage can show: the pickup scores, the kill call, the goal call and the digits of the counters. */
export const POPUP_TEXTS = ['+1', '+2', 'ナイス！', 'ゴール！', '0123456789/', '12/12'] as const

/**
 * Measures every string a stage can show in a popup or bubble, with the fonts and sizes the overlay uses, on a
 * scratch canvas, so that the font and its glyphs are resolved before play instead of in the frame of the first
 * hit. Returns how many strings were measured (0 when there is no canvas to measure on).
 */
export function warmOverlayText(extra: readonly string[] = []): number {
  const ctx = scratchContext()
  if (!ctx) return 0
  let measured = 0
  for (const size of [9, 10, 11, 12, 13, 14, 15]) {
    ctx.font = `800 ${size}px ${ROUNDED_FONT}`
    for (const text of [...POPUP_TEXTS, ...extra]) {
      ctx.measureText(text)
      measured += 1
    }
  }
  for (const size of [13, 15]) {
    ctx.font = `800 ${size}px ${ROUNDED_FONT}`
    for (const text of [...STAGED_LINES, ...extra]) {
      ctx.measureText(text)
      measured += 1
    }
  }
  return measured
}

function scratchContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(8, 8).getContext('2d')
    if (typeof document !== 'undefined') return document.createElement('canvas').getContext('2d')
  } catch {
    // No canvas here (tests without a DOM): nothing to warm.
  }
  return null
}

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
  private bubbles: Bubble[] = []
  private spot = 0
  private spotTarget = 0
  /** Spotlight centre in screen pixels (staging moves it with the hero). */
  spotX = VIEW_W / 2
  spotY = VIEW_H / 2
  /** The edge arrow toward an off-screen goal, or null (set every frame by staging). */
  pointer: Pointer | null = null
  private gradient: { ctx: CanvasRenderingContext2D; vignette: CanvasGradient; hurt: CanvasGradient } | null = null
  /** Flashes actually shown (none under reduced motion), for tests. */
  flashes = 0

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
    this.flashes += 1
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

  /** Sets the iris at once (no wipe), e.g. closed before an iris in. */
  irisSnap(radius: number, x = this.irisX, y = this.irisY) {
    this.irisX = x
    this.irisY = y
    this.iris = null
    this.irisRadius = Math.max(0, Math.min(1, radius))
  }

  get irisOpen() {
    return this.irisRadius
  }

  /** Where the iris is heading (its current radius when it is not moving). */
  get irisTarget() {
    return this.iris ? this.iris.to : this.irisRadius
  }

  /** Drops the popups showing `text` (the goal label when the stage is cleared). */
  clearPopups(text: string) {
    dropWhere(this.popups, (p) => p.text === text)
  }

  /**
   * A speech bubble over a world point (a character's head) for `seconds`. With `wordless` the words are shown
   * elsewhere (the deck under a portrait stage) and only a small balloon without text marks the speaker.
   */
  bubble(text: string, anchor: Anchor, seconds = 1.6, tone: BubbleTone = 'say', wordless = false) {
    const at = typeof anchor === 'function' ? anchor() : anchor
    // A wordless balloon only marks who speaks (their words and face are on the deck): it pops and goes quickly, so it
    // never lingers under the calls that follow a line.
    const life = wordless ? Math.min(seconds, EMOTE_SECONDS) : seconds
    this.bubbles.push({
      text,
      anchor,
      tone,
      age: 0,
      life,
      last: at ?? { x: 0, y: 0 },
      textWidth: -1,
      wordless,
      rect: null
    })
    if (this.bubbles.length > 4) this.bubbles.shift()
  }

  /** Where the text bubbles on screen were last drawn, in view pixels (for tests and layout checks). */
  get bubbleRects() {
    return this.bubbles.flatMap((b) => (b.rect && !b.wordless ? [{ text: b.text, ...b.rect }] : []))
  }

  /** Where the wordless balloons were last drawn, in view pixels (for tests and layout checks). */
  get emoteRects() {
    return this.bubbles.flatMap((b) => (b.rect && b.wordless ? [{ text: b.text, ...b.rect }] : []))
  }

  /** The texts of the popups on screen (for tests). */
  get popupTexts(): string[] {
    return this.popups.map((p) => p.text)
  }

  /** The texts of the bubbles on screen (for tests). */
  get bubbleTexts(): string[] {
    return this.bubbles.map((b) => b.text)
  }

  /** Darkens everything but a circle around (spotX, spotY) while on; fades in and out. */
  spotlight(on: boolean) {
    this.spotTarget = on ? 1 : 0
  }

  get spotlightAmount() {
    return this.spot
  }

  get barsAmount() {
    return this.bars
  }

  update(dt: number) {
    this.time += dt
    for (const p of this.popups) p.age += dt
    dropWhere(this.popups, (p) => p.age >= p.life)
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
    for (const b of this.bubbles) b.age += dt
    dropWhere(this.bubbles, (b) => b.age >= b.life)
    if (this.spot !== this.spotTarget) {
      const step = dt * 4
      this.spot =
        this.spot < this.spotTarget
          ? Math.min(this.spotTarget, this.spot + step)
          : Math.max(this.spotTarget, this.spot - step)
    }
    if (this.iris) {
      const iris = this.iris
      iris.t = Math.min(iris.seconds, iris.t + dt)
      this.irisRadius = iris.from + (iris.to - iris.from) * ease(iris.t / iris.seconds)
      if (iris.t >= iris.seconds) this.iris = null
    }
  }

  /** Popups and speech bubbles, drawn in screen space (k× transform) relative to the view at (viewX, viewY). */
  drawPopups(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    this.drawBubbles(ctx, viewX, viewY)
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

  private drawBubbles(ctx: CanvasRenderingContext2D, viewX: number, viewY: number) {
    if (!this.bubbles.length) return
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const b of this.bubbles) {
      const at = typeof b.anchor === 'function' ? b.anchor() : b.anchor
      if (at) b.last = at
      if (b.wordless) {
        this.drawEmote(ctx, b, viewX, viewY)
        continue
      }
      const yell = b.tone === 'yell'
      const size = yell ? 15 : 13
      ctx.font = `800 ${size}px ${ROUNDED_FONT}`
      if (b.textWidth < 0) b.textWidth = Math.ceil(ctx.measureText(b.text).width)
      const w = b.textWidth + 22
      const h = size + 14
      // Pop in with a little overshoot, fade out at the end.
      const t = b.age
      const pop = this.reducedMotion
        ? 1
        : t < 0.08
          ? 0.6 + (t / 0.08) * 0.5
          : t < 0.16
            ? 1.1 - ((t - 0.08) / 0.08) * 0.1
            : 1
      const alpha = Math.max(0, Math.min(1, (b.life - t) / 0.2))
      const shake = yell && !this.reducedMotion && t < 0.6 ? Math.round(Math.sin(t * 70) * 1.5) : 0
      const ax = Math.round(b.last.x - viewX)
      const ay = Math.round(b.last.y - viewY)
      // Keep the box on screen; the tail still points at the speaker.
      const edge = w / 2 + (yell ? 20 : 6)
      const bx = Math.round(Math.max(edge, Math.min(VIEW_W - edge, ax))) + shake
      let by = Math.round(Math.max(h / 2 + 4, ay - 12 - h / 2))
      // The upper-third slot belongs to the stage card and the calls: a bubble never sits in it.
      const slotTop = ZONES.cardTop * VIEW_H
      const slotBottom = ZONES.cardBottom * VIEW_H
      if (by - h / 2 < slotBottom && by + h / 2 + 9 > slotTop) by = Math.round(slotBottom + h / 2 + 2)
      b.rect = { x: bx - w / 2, y: by - h / 2, w, h: h + 9 }
      ctx.globalAlpha = alpha
      ctx.save()
      ctx.translate(bx, by + h / 2 + 8)
      ctx.scale(pop, pop)
      ctx.translate(0, -h / 2 - 8)
      const x0 = -w / 2
      const y0 = -h / 2
      const tail = Math.max(x0 + 12, Math.min(x0 + w - 12, ax - bx))
      ctx.beginPath()
      ctx.roundRect(x0, y0, w, h, yell ? 5 : 10)
      ctx.moveTo(tail - 6, y0 + h - 1)
      ctx.lineTo(tail + Math.max(-8, Math.min(8, (ax - bx) * 0.2)), y0 + h + 9)
      ctx.lineTo(tail + 6, y0 + h - 1)
      ctx.fillStyle = yell ? '#fff1d8' : '#fff9f4'
      ctx.strokeStyle = INK
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = yell ? '#c8283c' : INK
      ctx.fillText(b.text, 0, 1)
      ctx.restore()
      if (yell && !this.reducedMotion && t < 0.9) {
        // Shout marks either side of the box.
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        for (const side of [-1, 1]) {
          const ex = bx + side * (w / 2 + 5)
          ctx.moveTo(ex, by - 7)
          ctx.lineTo(ex + side * 7, by - 12)
          ctx.moveTo(ex + side, by)
          ctx.lineTo(ex + side * 10, by)
          ctx.moveTo(ex, by + 7)
          ctx.lineTo(ex + side * 7, by + 12)
        }
        ctx.strokeStyle = INK
        ctx.lineWidth = 4
        ctx.stroke()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  /**
   * A small balloon without words over a speaker whose line is on the deck: three dots when they talk, a red bang
   * when they yell. Drawn in whole pixels with the bubbles' ink outline; it pops in and bobs once.
   */
  private drawEmote(ctx: CanvasRenderingContext2D, b: Bubble, viewX: number, viewY: number) {
    const yell = b.tone === 'yell'
    const w = yell ? 26 : 30
    const h = 20
    const t = b.age
    const pop = this.reducedMotion
      ? 1
      : t < 0.08
        ? 0.5 + (t / 0.08) * 0.6
        : t < 0.16
          ? 1.1 - ((t - 0.08) / 0.08) * 0.1
          : 1
    const shake = yell && !this.reducedMotion && t < 0.6 ? Math.round(Math.sin(t * 70) * 1.5) : 0
    const ax = Math.round(b.last.x - viewX)
    const ay = Math.round(b.last.y - viewY)
    const bx = Math.round(Math.max(w / 2 + 4, Math.min(VIEW_W - w / 2 - 4, ax))) + shake
    const by = Math.round(Math.max(h / 2 + 4, ay - 10 - h / 2))
    b.rect = { x: bx - w / 2, y: by - h / 2, w, h: h + 7 }
    ctx.globalAlpha = Math.max(0, Math.min(1, (b.life - t) / 0.2))
    ctx.save()
    ctx.translate(bx, by + h / 2 + 6)
    ctx.scale(pop, pop)
    ctx.translate(0, -h / 2 - 6)
    const x0 = -w / 2
    const y0 = -h / 2
    const tail = Math.max(x0 + 8, Math.min(x0 + w - 8, ax - bx))
    ctx.beginPath()
    ctx.roundRect(x0, y0, w, h, yell ? 4 : 9)
    ctx.moveTo(tail - 4, y0 + h - 1)
    ctx.lineTo(tail, y0 + h + 6)
    ctx.lineTo(tail + 4, y0 + h - 1)
    ctx.fillStyle = yell ? '#fff1d8' : '#fff9f4'
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fill()
    if (yell) {
      // A bang: a tall bar and a dot, in the yell red.
      ctx.fillStyle = '#c8283c'
      ctx.fillRect(-2, -7, 4, 9)
      ctx.fillRect(-2, 4, 4, 3)
    } else {
      // Three dots that light up one after another.
      for (let i = 0; i < 3; i++) {
        const lit = this.reducedMotion || Math.floor(t * 6) % 3 >= i
        ctx.fillStyle = lit ? INK : '#c8b8d8'
        ctx.fillRect(-9 + i * 7, -1, 4, 4)
      }
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }

  private drawSpotlight(ctx: CanvasRenderingContext2D) {
    if (this.spot <= 0.001) return
    // Two rings of darkness give the edge a stepped, pixel-art softness.
    for (const [radius, alpha] of [
      [96, 0.38],
      [76, 0.4]
    ] as const) {
      ctx.fillStyle = `rgba(11,6,24,${(alpha * this.spot).toFixed(3)})`
      ctx.beginPath()
      ctx.rect(0, 0, VIEW_W, VIEW_H)
      ctx.arc(this.spotX, this.spotY, radius, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
    }
  }

  private drawPointer(ctx: CanvasRenderingContext2D) {
    const p = this.pointer
    if (!p) return
    const anim = clip('fx', 'arrow')
    if (!anim) return
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 6) * 3
    blit(ctx, anim, this.time, p.x + Math.cos(p.angle) * bob, p.y + Math.sin(p.angle) * bob, { angle: p.angle })
  }

  /** The two screen gradients, made once per context (they never change). */
  private gradients(ctx: CanvasRenderingContext2D) {
    if (this.gradient?.ctx === ctx) return this.gradient
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
    const hurt = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.92)
    hurt.addColorStop(0, 'rgba(220,30,60,0)')
    hurt.addColorStop(1, 'rgba(220,30,60,1)')
    this.gradient = { ctx, vignette, hurt }
    return this.gradient
  }

  /** Flash, vignettes, bars and iris, in screen space. */
  drawScreen(ctx: CanvasRenderingContext2D) {
    const pulse = this.lowHealth ? (this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.max(0, Math.sin(this.time * 7.5))) : 0
    const red = Math.max(this.hurtPulse * 0.75, pulse * 0.45)
    const { vignette, hurt } = this.gradients(ctx)
    // A soft frame of shadow so the world reads as a stage.
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    this.drawSpotlight(ctx)
    if (red > 0.01) {
      // One full-strength gradient; the pulse's strength goes through the alpha.
      ctx.globalAlpha = red * 0.6
      ctx.fillStyle = hurt
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      ctx.globalAlpha = 1
    }
    if (this.flashAlpha > 0) {
      ctx.globalAlpha = this.flashAlpha
      ctx.fillStyle = this.flashColor
      ctx.fillRect(0, 0, VIEW_W, VIEW_H)
      ctx.globalAlpha = 1
    }
    if (this.bars <= 0) this.drawPointer(ctx)
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
