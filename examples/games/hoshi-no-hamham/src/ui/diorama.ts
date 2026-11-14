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
import { anchorOf, tile, type ThemeId } from '../art'
import { whenArt } from '../app/art-fetch'
import { BackdropView } from '../view/backdrop'
import { bake, blit, brush, clip, frameIndex } from '../view/bake'
import { backingScale } from './rules'
import { CLASSIC_FRAME, frameFor, type Frame } from './story-frame'
import { groundStrip, placeFigure, placeMark, shotScroll } from './story-motion'
import { GROUND, SCENE_H, SCENE_W, shotArt, type Figure, type Shot } from './story-scenes'
import { seatHeight, SEAT_HALF } from './story-seat'

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
  /** The shot's own clock: seconds since it came up (since its art arrived, when it had to wait for it). */
  private shotTime = 0
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
    this.shotTime = 0
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
      this.shotTime += dt
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
      this.shotTime = 0
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
    const still = this.reducedMotion()
    const scroll = shotScroll(shot, this.shotTime, still)
    const dy = GROUND - BACKDROP_GROUND
    ctx.save()
    ctx.translate(0, dy)
    view.drawBack(ctx, scroll, BACKDROP_GROUND)
    ctx.restore()
    // The ground strip, under the whole width of any frame (a tracking shot cycles through the same tiles).
    for (const { tile: q, x } of groundStrip(shot, this.shotTime, still))
      ctx.drawImage(bake(tile(q)), Math.round(x), GROUND)
    const order = shot.figures.map((_, i) => i)
    for (const i of [...order.filter((i) => !shot.figures[i].front), ...order.filter((i) => shot.figures[i].front)])
      this.drawFigure(ctx, shot, i, still)
    shot.marks?.forEach((mark, i) => {
      const a = clip('fx', mark.clip)
      const at = placeMark(shot, i, this.shotTime, still)
      if (!a || !at) return
      const bob = still ? 0 : Math.round(Math.sin(this.time * 3 + mark.x) * 2)
      blit(ctx, a, this.time + mark.x * 0.01, at.x, GROUND - at.lift + bob, brush(undefined, at.alpha))
    })
    ctx.save()
    ctx.translate(0, dy)
    view.drawFront(ctx, scroll, BACKDROP_GROUND)
    ctx.restore()
  }

  /** How high a seated figure's feet are: the back of the mount's frame shown now, less how far she sits into it. */
  private seatLift(shot: Shot, rider: Figure, still: boolean) {
    const mount = shot.figures[rider.follow!]
    const at = placeFigure(shot, rider.follow!, this.shotTime, still)
    const anim = mount && at && clip(mount.sheet, mount.clip)
    if (!anim || !at) return 0
    const dx = rider.x - mount.x
    const top = seatHeight(anim.frames[frameIndex(anim, at.clipTime)], anchorOf(anim), at.flip ? -dx : dx, SEAT_HALF)
    return at.lift + (top ?? 0) - (rider.seat ?? 0)
  }

  /** Draws a figure where `placeFigure` puts it. */
  private drawFigure(ctx: CanvasRenderingContext2D, shot: Shot, index: number, still: boolean) {
    const figure = shot.figures[index]
    const a = clip(figure.sheet, figure.clip)
    const placed = placeFigure(shot, index, this.shotTime, still)
    if (!a || !placed) return
    const seated = figure.seat !== undefined && figure.follow !== undefined
    const lift = placed.lift + (seated ? this.seatLift(shot, figure, still) : 0)
    blit(ctx, a, placed.clipTime, placed.x, GROUND - lift, brush(placed.flip, placed.alpha))
  }
}
