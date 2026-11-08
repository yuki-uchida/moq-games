/**
 * Sprite lookups on top of art/: safe existence checks (sheets for later stages may not exist yet), prop/decor
 * animation name resolution, tinted copies and single frames as canvases for the DOM.
 */
import { canvasOf } from '../art/canvas'
import { anchorOf, flashSheet, frameAt, sheet, sheetIds, type Anim } from '../art/index'
import type { Raster } from '../art/raster'

let ids: Set<string> | undefined
const known = (id: string) => (ids ??= new Set(sheetIds())).has(id)

const animCache = new Map<string, Anim | null>()

/** The animation, or undefined when the sheet or name does not exist (never throws). */
export function findAnim(sheetId: string, name: string): Anim | undefined {
  const key = `${sheetId}#${name}`
  const hit = animCache.get(key)
  if (hit !== undefined) return hit ?? undefined
  let a: Anim | null = null
  if (known(sheetId)) {
    try {
      a = sheet(sheetId)[name] ?? null
    } catch {
      a = null
    }
  }
  animCache.set(key, a)
  return a ?? undefined
}

const flashCache = new Map<string, Anim | null>()

/** The white hit-flash silhouette of an animation (flashSheet), or undefined. */
export function findFlash(sheetId: string, name: string): Anim | undefined {
  const key = `${sheetId}#${name}`
  const hit = flashCache.get(key)
  if (hit !== undefined) return hit ?? undefined
  let a: Anim | null = null
  if (findAnim(sheetId, name)) {
    try {
      a = flashSheet(sheetId)[name] ?? null
    } catch {
      a = null
    }
  }
  flashCache.set(key, a)
  return a ?? undefined
}

const nameCache = new Map<string, string | null>()

/** First existing name among candidates (cached by the joined candidate list). */
export function pickName(sheetId: string, ...names: string[]): string | undefined {
  const key = `${sheetId}|${names.join('|')}`
  const hit = nameCache.get(key)
  if (hit !== undefined) return hit ?? undefined
  const found = names.find((n) => findAnim(sheetId, n)) ?? null
  nameCache.set(key, found)
  return found ?? undefined
}

/** Prop animation: `${kind}_${state}` when it exists, else `${kind}`, else a resting variant. */
export const propName = (sheetId: string, kind: string, state: string) =>
  pickName(sheetId, `${kind}_${state}`, kind, `${kind}_idle`, `${kind}_off`, `${kind}_closed`)

/** A frame at time t. */
export function frameOf(a: Anim, t: number): Raster {
  return a.frames[frameAt(a, t)]
}

/** Draws an Anim frame with its anchor at (x, y) (whole pixels), optional flip and alpha. */
export function blitAnim(
  ctx: CanvasRenderingContext2D,
  a: Anim,
  t: number,
  x: number,
  y: number,
  flip = false,
  alpha = 1,
  noLift = false
): number {
  const f = frameAt(a, t)
  const lift = noLift ? 0 : (a.lift?.[f] ?? 0)
  const al = (a.alpha?.[f] ?? 1) * alpha
  if (al <= 0) return lift
  const c = canvasOf(a.frames[f])
  const [ax, ay] = anchorOf(a)
  const px = Math.round(x)
  const py = Math.round(y - lift)
  if (al !== 1) ctx.globalAlpha = al
  if (flip) {
    ctx.setTransform(-1, 0, 0, 1, px, 0)
    ctx.drawImage(c, -ax, py - ay)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  } else ctx.drawImage(c, px - ax, py - ay)
  if (al !== 1) ctx.globalAlpha = 1
  return lift
}

const tints = new Map<string, HTMLCanvasElement>()

/** A copy of a raster's canvas recoloured (multiply-ish) toward `color`, cached. */
export function tinted(r: Raster, color: string, key: string): HTMLCanvasElement {
  let c = tints.get(key)
  if (c) return c
  const src = canvasOf(r)
  c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(src, 0, 0)
  tints.set(key, c)
  return c
}

/** Frame 0 of a sheet animation as a canvas (DOM icons), or undefined. */
export function iconCanvas(sheetId: string, name: string, frame = 0): HTMLCanvasElement | undefined {
  const a = findAnim(sheetId, name)
  if (!a) return undefined
  return canvasOf(a.frames[Math.min(frame, a.frames.length - 1)])
}

const urls = new Map<string, string>()

/** A data URL of a sprite frame scaled by an integer factor (crisp in <img> with image-rendering: pixelated). */
export function iconUrl(sheetId: string, name: string, scale = 1, frame = 0): string {
  const key = `${sheetId}#${name}#${scale}#${frame}`
  const hit = urls.get(key)
  if (hit !== undefined) return hit
  const src = iconCanvas(sheetId, name, frame)
  let url = ''
  if (src) {
    const c = document.createElement('canvas')
    c.width = src.width * scale
    c.height = src.height * scale
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(src, 0, 0, c.width, c.height)
    url = c.toDataURL()
  }
  urls.set(key, url)
  return url
}
