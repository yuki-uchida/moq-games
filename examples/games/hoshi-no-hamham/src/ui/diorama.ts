/**
 * The illustrated story panel: a small live scene on a canvas — a world backdrop, a strip of that world's
 * ground and posed, animated characters from the sheets (see story-scenes.ts). Drawn like the game itself: a
 * logical picture through one whole-number transform, smoothing off. The picture is the part of the scene that
 * suits the canvas box's shape (`frameFor`, story-frame.ts): the classic `SCENE_W × SCENE_H` at 2:1, taller and
 * narrower around the characters on an upright phone, so the backing store always has the box's aspect.
 *
 * A shot is drawn only once its art is here (see `shotArt`): the app asks the art workers for it ahead of time,
 * and a shot whose art is still on its way keeps the picture before it (the night colour for a first shot) and fades
 * in when it arrives. Nothing is painted on the page.
 */
import { tile, type ThemeId } from '../art'
import { whenArt } from '../app/art-fetch'
import { BackdropView } from '../view/backdrop'
import { bake, blit, clip } from '../view/bake'
import { backingScale } from './rules'
import { CLASSIC_FRAME, frameFor, type Frame } from './story-frame'
import { GROUND, groundTiles, SCENE_H, SCENE_W, shotArt, type Figure, type Shot } from './story-scenes'

/** Where the game's backdrops expect the main ground (view pixels), lined up with the scene's ground row. */
const BACKDROP_GROUND = 296
/** A shot change fades through the night colour for this long. */
const CUT = 0.28
const NIGHT = '#120a26'

/** Shots whose art has been seen to be here (it stays: the registry never drops what it adopted). */
const readyShots = new WeakSet<Shot>()
const shotKeys = new WeakMap<Shot, string>()
let shotCount = 0
const keyOf = (shot: Shot) => {
  let key = shotKeys.get(shot)
  if (!key) shotKeys.set(shot, (key = `shot:${(shotCount += 1)}`))
  return key
}

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
  /** The part of the scene on the canvas now (scene pixels). */
  private view: Frame = { ...CLASSIC_FRAME }
  private observer: ResizeObserver | null = null
  /** The shot on the canvas now (null: the canvas holds no picture yet, or was cleared by a resize). */
  private shown: Shot | null = null
  /** Shots whose art this diorama is waiting for. */
  private waiting = new WeakSet<Shot>()

  /**
   * `fit` draws the part of the scene that suits the box's shape; without it the canvas always holds the classic
   * picture (the result screen's backdrop, which CSS covers its box with).
   */
  constructor(
    readonly canvas: HTMLCanvasElement,
    private reducedMotion: () => boolean,
    private fit = true
  ) {
    canvas.width = SCENE_W
    canvas.height = SCENE_H
    canvas.dataset.frame = `0 0 ${SCENE_W} ${SCENE_H}`
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.resize())
      this.observer.observe(canvas)
    }
  }

  /** The part of the scene on the canvas now (scene pixels; for tests and tools). */
  get currentFrame(): Frame {
    return { ...this.view }
  }

  /** Matches the backing store to the box: the frame for its shape, times a whole-number scale. */
  private resize() {
    const cssW = this.canvas.clientWidth
    const cssH = this.canvas.clientHeight
    if (!cssW || !cssH) return
    const view = this.fit && this.shot ? frameFor(this.shot, cssW / cssH) : { ...CLASSIC_FRAME }
    const k = backingScale(view.w, cssW, window.devicePixelRatio || 1)
    const same = view.x === this.view.x && view.y === this.view.y && view.w === this.view.w && view.h === this.view.h
    if (same && k === this.k && this.canvas.width === view.w * k && this.canvas.height === view.h * k) return
    this.view = view
    this.k = k
    this.canvas.width = view.w * k
    this.canvas.height = view.h * k
    // Tools and browser tests read the chosen frame here.
    this.canvas.dataset.frame = `${view.x} ${view.y} ${view.w} ${view.h}`
    // A new backing store is blank.
    this.shown = null
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

  /**
   * True when the shot's art is here. Otherwise it is asked for (once per shot) and the shot fades in when it
   * arrives, as after a cut.
   */
  private ready(shot: Shot): boolean {
    if (readyShots.has(shot)) return true
    if (this.waiting.has(shot)) return false
    this.waiting.add(shot)
    const now = whenArt(keyOf(shot), shotArt(shot), () => {
      this.waiting.delete(shot)
      readyShots.add(shot)
      if (this.shot !== shot) return
      this.since = 0
      this.draw()
    })
    if (now) {
      this.waiting.delete(shot)
      readyShots.add(shot)
    }
    return now
  }

  /** Draws the current picture. */
  draw() {
    const shot = this.shot
    if (!shot) return
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const { x, y, w, h } = this.view
    ctx.setTransform(this.k, 0, 0, this.k, -x * this.k, -y * this.k)
    ctx.imageSmoothingEnabled = false
    if (!this.ready(shot)) {
      // Keep the picture before it; a blank canvas shows the night colour until the art arrives.
      if (!this.shown) {
        ctx.fillStyle = NIGHT
        ctx.fillRect(x, y, w, h)
      }
      return
    }
    this.paint(ctx, shot)
    this.shown = shot
    if (this.since < CUT && !this.reducedMotion()) {
      // Fade in from the night colour after a cut (it also hides the frame changing with the shot).
      ctx.globalAlpha = 1 - this.since / CUT
      ctx.fillStyle = NIGHT
      ctx.fillRect(x, y, w, h)
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
    // The ground strip, under the whole width of any frame.
    groundTiles(shot).forEach((q, i) => ctx.drawImage(bake(tile(q)), Math.round(i * 64 - (scroll % 64)), GROUND))
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
