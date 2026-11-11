/**
 * The illustrated story panel: a small live scene on a canvas — a world backdrop, a strip of that world's
 * ground and posed, animated characters from the sheets (see story-scenes.ts). Drawn like the game itself: a
 * `SCENE_W × SCENE_H` logical picture through one whole-number transform, smoothing off.
 */
import { tile, type ThemeId } from '../art'
import type { Neighbour } from '../art/contract'
import { BackdropView } from '../view/backdrop'
import { bake, blit, clip } from '../view/bake'
import { backingScale } from './rules'
import { GROUND, SCENE_H, SCENE_W, type Figure, type Shot } from './story-scenes'

/** Where the game's backdrops expect the main ground (view pixels), lined up with the scene's ground row. */
const BACKDROP_GROUND = 296
/** Top of a solid tile with open sky above and ground on both sides. */
const TOP: readonly Neighbour[] = ['empty', 'empty', 'solid', 'solid', 'solid', 'solid', 'solid', 'empty']
/** A shot change fades through the night colour for this long. */
const CUT = 0.28

export class Diorama {
  private shot: Shot | null = null
  private previous: Shot | null = null
  private backdrops = new Map<ThemeId, BackdropView>()
  private time = 0
  /** Seconds since the shot changed. */
  private since = 99
  private frame = 0
  private last = 0
  private running = false
  private k = 1
  private observer: ResizeObserver | null = null

  constructor(
    readonly canvas: HTMLCanvasElement,
    private reducedMotion: () => boolean
  ) {
    canvas.width = SCENE_W
    canvas.height = SCENE_H
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.resize())
      this.observer.observe(canvas)
    }
  }

  private resize() {
    const css = this.canvas.clientWidth
    if (!css) return
    const k = backingScale(SCENE_W, css, window.devicePixelRatio || 1)
    if (k === this.k && this.canvas.width === SCENE_W * k) return
    this.k = k
    this.canvas.width = SCENE_W * k
    this.canvas.height = SCENE_H * k
    this.draw()
  }

  /** Shows a shot; `cut` fades from the previous one. */
  setShot(shot: Shot, cut = true) {
    if (shot === this.shot) return
    this.previous = cut ? this.shot : null
    this.shot = shot
    this.since = cut && this.previous ? 0 : 99
    this.resize()
    this.draw()
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.resize()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000))
      this.last = now
      this.time += dt
      this.since += dt
      for (const view of this.backdrops.values()) view.update(this.reducedMotion() ? 0 : dt)
      this.draw()
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  private backdrop(theme: ThemeId) {
    let view = this.backdrops.get(theme)
    if (!view) {
      view = new BackdropView(theme, BACKDROP_GROUND, this.reducedMotion())
      this.backdrops.set(theme, view)
    }
    return view
  }

  /** Draws the current picture. */
  draw() {
    const shot = this.shot
    if (!shot) return
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0)
    ctx.imageSmoothingEnabled = false
    this.paint(ctx, shot)
    if (this.since < CUT && !this.reducedMotion()) {
      // Fade in from the night colour after a cut.
      ctx.globalAlpha = 1 - this.since / CUT
      ctx.fillStyle = '#120a26'
      ctx.fillRect(0, 0, SCENE_W, SCENE_H)
      ctx.globalAlpha = 1
    }
  }

  private paint(ctx: CanvasRenderingContext2D, shot: Shot) {
    const view = this.backdrop(shot.theme)
    const scroll = shot.scroll ?? 0
    const dy = GROUND - BACKDROP_GROUND
    ctx.save()
    ctx.translate(0, dy)
    view.drawBack(ctx, scroll, BACKDROP_GROUND)
    ctx.restore()
    // The ground strip.
    for (let i = 0; i * 64 < SCENE_W + 64; i++) {
      const tx = i + Math.floor(scroll / 64)
      const image = tile({ theme: shot.theme, kind: 'solid', around: TOP, tx, ty: 9 })
      ctx.drawImage(bake(image), Math.round(i * 64 - (scroll % 64)), GROUND)
    }
    const still = this.reducedMotion()
    const figures = [...shot.figures.filter((f) => !f.front), ...shot.figures.filter((f) => f.front)]
    for (const figure of figures) this.drawFigure(ctx, figure, still)
    for (const mark of shot.marks ?? []) {
      const a = clip('fx', mark.clip)
      if (!a) continue
      const bob = still ? 0 : Math.round(Math.sin(this.time * 3 + mark.x) * 2)
      blit(ctx, a, this.time + mark.x * 0.01, mark.x, GROUND - mark.lift + bob)
    }
    ctx.save()
    ctx.translate(0, dy)
    view.drawFront(ctx, scroll, BACKDROP_GROUND)
    ctx.restore()
  }

  private drawFigure(ctx: CanvasRenderingContext2D, figure: Figure, still: boolean) {
    const a = clip(figure.sheet, figure.clip)
    if (!a) return
    const t = this.time + (figure.phase ?? 0)
    let x = figure.x
    let lift = figure.lift ?? 0
    const motion = still ? 'none' : (figure.motion ?? 'none')
    if (motion === 'hop') lift += Math.round(Math.abs(Math.sin(t * 4.2)) * 10)
    else if (motion === 'float') lift += Math.round(Math.sin(t * 2.2) * 4)
    else if (motion === 'shake') x += Math.floor(t * 18) % 2 ? 1 : -1
    else if (motion === 'pace') x += Math.round(Math.sin(t * 1.4) * 10)
    else if (motion === 'fall') {
      const drop = Math.max(0, 96 - this.since * 40)
      lift += Math.round(drop)
      x += Math.round(Math.sin(t * 2.4) * (drop > 0 ? 8 : 0))
    }
    if (still && figure.motion === 'fall') lift = figure.lift ?? 0
    blit(ctx, a, t, x, GROUND - lift, { flip: figure.flip })
  }
}
