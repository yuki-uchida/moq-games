/**
 * Browser side of the art: rasters become canvases once (cached per raster) and are drawn whole-pixel aligned.
 * Only this file touches the DOM; everything else in art/ runs in Node too.
 */
import { anchorOf, flashSheet, frameAt, sheet, type Anim } from './index'
import type { Raster } from './raster'

const canvases = new WeakMap<Raster, HTMLCanvasElement>()

/** The raster as a canvas (created once per raster). */
export function canvasOf(r: Raster): HTMLCanvasElement {
  let c = canvases.get(r)
  if (c) return c
  c = document.createElement('canvas')
  c.width = r.w
  c.height = r.h
  const ctx = c.getContext('2d')!
  const image = ctx.createImageData(r.w, r.h)
  image.data.set(r.rgba())
  ctx.putImageData(image, 0, 0)
  canvases.set(r, c)
  return c
}

export interface DrawOptions {
  /** Mirror horizontally around the anchor (left-facing side frames). */
  flip?: boolean
  /** Draw the white hit-flash silhouette instead. */
  flash?: boolean
  /** Extra opacity multiplied with the animation's own alpha. */
  alpha?: number
  /** Ignore the animation's lift (e.g. when the caller applies its own height). */
  noLift?: boolean
}

/** Resolves an animation by sheet id and name; throws for missing names so contract drift fails loudly. */
export function animOf(sheetId: string, name: string, flashed = false): Anim {
  const a = (flashed ? flashSheet(sheetId) : sheet(sheetId))[name]
  if (!a) throw new Error(`Missing animation ${sheetId}#${name}`)
  return a
}

/**
 * Draws the frame of `name` at time `t` so its anchor lands on (x, y) in the current transform (art pixels).
 * Returns the frame index and the lift used (for shadows).
 */
export function drawAnim(
  ctx: CanvasRenderingContext2D,
  sheetId: string,
  name: string,
  t: number,
  x: number,
  y: number,
  options: DrawOptions = {}
): { frame: number; lift: number } {
  const a = animOf(sheetId, name, options.flash)
  const frame = frameAt(a, t)
  const lift = options.noLift ? 0 : (a.lift?.[frame] ?? 0)
  drawRaster(
    ctx,
    a.frames[frame],
    anchorOf(a),
    x,
    y - lift,
    options.flip,
    (a.alpha?.[frame] ?? 1) * (options.alpha ?? 1)
  )
  return { frame, lift }
}

/** Draws one raster with its anchor on (x, y), whole-pixel aligned. */
export function drawRaster(
  ctx: CanvasRenderingContext2D,
  r: Raster,
  anchor: readonly [number, number],
  x: number,
  y: number,
  flip = false,
  alpha = 1
) {
  if (alpha <= 0) return
  const c = canvasOf(r)
  const px = Math.round(x)
  const py = Math.round(y)
  const previous = ctx.globalAlpha
  if (alpha !== 1) ctx.globalAlpha = previous * alpha
  if (flip) {
    ctx.save()
    ctx.translate(px, 0)
    ctx.scale(-1, 1)
    // Mirror around the anchor column, so asymmetric anchors stay on (x, y).
    ctx.drawImage(c, -anchor[0], py - anchor[1])
    ctx.restore()
  } else ctx.drawImage(c, px - anchor[0], py - anchor[1])
  if (alpha !== 1) ctx.globalAlpha = previous
}
