/**
 * Raster → canvas cache and frame lookup. Every picture the view draws goes through the art registry
 * (`sheet`, `flashSheet`, `tile`, `decor`, `backdrop`) and is baked here once per raster.
 */
import { anchorOf, flashSheet, frameAt, sheet, type Anim, type Backdrop } from '../art'
import type { Raster } from '../art/raster'

const baked = new WeakMap<Raster, HTMLCanvasElement>()

/** The raster as a canvas, baked on first use (palette colours resolved at bake time). */
export function bake(r: Raster): HTMLCanvasElement {
  let canvas = baked.get(r)
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.width = r.w
  canvas.height = r.h
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(r.w, r.h)
  image.data.set(r.rgba())
  ctx.putImageData(image, 0, 0)
  baked.set(r, canvas)
  return canvas
}

/** Bakes every frame of every clip, so the first frame that draws them does not pay for it. */
export function bakeAnims(anims: Record<string, Anim | undefined>): number {
  let count = 0
  for (const anim of Object.values(anims))
    for (const frame of anim?.frames ?? []) {
      bake(frame)
      count += 1
    }
  return count
}

/** Bakes the sky and every layer of a backdrop. */
export function bakeBackdrop(art: Backdrop | undefined): number {
  if (!art) return 0
  bake(art.sky)
  for (const layer of art.layers) bake(layer.image)
  return art.layers.length + 1
}

/** Builds a registered sheet (and optionally its hit-flash silhouettes) and bakes its frames. */
export function warmSheet(id: string, flash = false): number {
  let count = bakeAnims(sheet(id))
  if (flash) count += bakeAnims(flashSheet(id))
  return count
}

/** Builds one clip of a registered sheet (and optionally its hit-flash silhouette) and bakes its frames. */
export function warmClip(id: string, name: string, flash = false): number {
  const anims = { [name]: sheet(id)[name] }
  let count = bakeAnims(anims)
  if (flash) count += bakeAnims({ [name]: flashSheet(id)[name] })
  return count
}

/** One clip of a registered sheet (undefined when the sheet has no such clip). */
export const clip = (id: string, name: string): Anim | undefined => sheet(id)[name]
/** The white-silhouette version of a clip (hit flash). */
export const flashClip = (id: string, name: string): Anim | undefined => flashSheet(id)[name]

/** Frame index at `t` seconds, or the given frame clamped to the clip. */
export function frameIndex(anim: Anim, t: number, frame?: number) {
  if (frame !== undefined) return Math.max(0, Math.min(anim.frames.length - 1, frame))
  return frameAt(anim, t)
}

export interface BlitOptions {
  /** Mirror horizontally (art faces right). */
  flip?: boolean
  /** Mirror axis in frame pixels (default: the anchor column; cell props mirror around their centre). */
  pivotX?: number
  alpha?: number
  /** Scale around the anchor (squash and stretch). */
  sx?: number
  sy?: number
  /** Rotation around the anchor, in radians. */
  angle?: number
}

/** Draws a raster with its anchor pixel on (x, y), placed on whole art pixels. */
export function blitRaster(
  ctx: CanvasRenderingContext2D,
  r: Raster,
  anchor: readonly [number, number],
  x: number,
  y: number,
  o: BlitOptions = {}
) {
  const image = bake(r)
  const [ax, ay] = anchor
  x = Math.round(x)
  y = Math.round(y)
  const alpha = o.alpha ?? 1
  if (alpha <= 0) return
  if (alpha < 1) ctx.globalAlpha = alpha
  if (!o.flip && !o.angle && (o.sx ?? 1) === 1 && (o.sy ?? 1) === 1) ctx.drawImage(image, x - ax, y - ay)
  else {
    const pivot = o.flip ? (o.pivotX ?? ax) : ax
    ctx.save()
    ctx.translate(x - ax + pivot, y)
    if (o.angle) ctx.rotate(o.angle)
    ctx.scale((o.flip ? -1 : 1) * (o.sx ?? 1), o.sy ?? 1)
    ctx.drawImage(image, -pivot, -ay)
    ctx.restore()
  }
  if (alpha < 1) ctx.globalAlpha = 1
}

/** Draws frame `t` (or `frame`) of a clip with its anchor on (x, y). */
export function blit(
  ctx: CanvasRenderingContext2D,
  anim: Anim,
  t: number,
  x: number,
  y: number,
  o: BlitOptions & { frame?: number } = {}
) {
  blitRaster(ctx, anim.frames[frameIndex(anim, t, o.frame)], anchorOf(anim), x, y, o)
}
