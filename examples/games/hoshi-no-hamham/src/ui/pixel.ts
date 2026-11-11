/**
 * Sprites for the DOM: sheet frames as data URLs and <img> elements scaled by whole numbers (CSS
 * `image-rendering: pixelated`), animated sprite canvases, and the nine-slice `panel` / `paper` borders.
 */
import { anchorOf, frameAt, sheet, type Anim } from '../art'
import type { Raster } from '../art/raster'
import { bake } from '../view/bake'
import { nineSlice } from './rules'

const urls = new Map<string, string>()

function rasterUrl(key: string, r: Raster, crop?: readonly [number, number, number, number]): string {
  const cached = urls.get(key)
  if (cached) return cached
  const source = bake(r)
  let url: string
  if (crop) {
    const [x, y, w, h] = crop
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(source, x, y, w, h, 0, 0, w, h)
    url = canvas.toDataURL()
  } else url = source.toDataURL()
  urls.set(key, url)
  return url
}

export function anim(id: string, clip: string): Anim {
  const found = sheet(id)[clip]
  if (!found) throw new Error(`No clip ${id}/${clip}`)
  return found
}

/** A frame of a sheet as a PNG data URL at 1×. */
export function spriteUrl(id: string, clip: string, frame = 0): string {
  const a = anim(id, clip)
  const f = Math.max(0, Math.min(a.frames.length - 1, frame))
  return rasterUrl(`${id}/${clip}/${f}`, a.frames[f])
}

export interface SpriteOptions {
  /** Whole-number scale in CSS pixels (the stylesheet may override it with `--s`). */
  scale?: number
  frame?: number
  alt?: string
  className?: string
  /** Source rectangle [x, y, w, h] to show only part of the frame. */
  crop?: readonly [number, number, number, number]
}

/**
 * An <img> of one sheet frame. Its size is `--w × --h` art pixels times `--s` (set by the stylesheet per screen
 * and breakpoint, default `scale`), so sprites always land on whole-number scales.
 */
export function spriteImg(id: string, clip: string, options: SpriteOptions = {}): HTMLImageElement {
  const a = anim(id, clip)
  const f = Math.max(0, Math.min(a.frames.length - 1, options.frame ?? 0))
  const r = a.frames[f]
  const crop = options.crop
  const img = document.createElement('img')
  img.src = crop ? rasterUrl(`${id}/${clip}/${f}/${crop.join(',')}`, r, crop) : spriteUrl(id, clip, f)
  img.alt = options.alt ?? ''
  if (!options.alt) img.setAttribute('aria-hidden', 'true')
  img.decoding = 'sync'
  img.draggable = false
  img.className = `px ${options.className ?? ''}`.trim()
  img.style.setProperty('--w', String(crop ? crop[2] : r.w))
  img.style.setProperty('--h', String(crop ? crop[3] : r.h))
  if (options.scale) img.style.setProperty('--s', String(options.scale))
  return img
}

/** Any raster (a terrain tile, …) as an <img>, cached under `key`. */
export function rasterImg(key: string, r: Raster, options: { scale?: number; className?: string } = {}) {
  const img = document.createElement('img')
  img.src = rasterUrl(`raster/${key}`, r)
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  img.draggable = false
  img.className = `px ${options.className ?? ''}`.trim()
  img.style.setProperty('--w', String(r.w))
  img.style.setProperty('--h', String(r.h))
  if (options.scale) img.style.setProperty('--s', String(options.scale))
  return img
}

/** A `ui` sheet icon (16×16) as an <img>. */
export const icon = (name: string, options: SpriteOptions = {}) =>
  spriteImg('ui', name, { ...options, className: `icon ${options.className ?? ''}` })

// -------------------------------------------------------------------------------------- animated sprites

interface Player {
  canvas: HTMLCanvasElement
  anim: Anim
  start: number
  /** Restart the clip after it ends (for one-shot clips shown on a loop). */
  repeatEvery?: number
}

const players = new Set<Player>()
let ticking = false

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function drawPlayer(player: Player, now: number) {
  const { canvas, anim: a } = player
  let t = (now - player.start) / 1000
  if (player.repeatEvery) t %= player.repeatEvery
  const frame = a.frames[frameAt(a, t)]
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const [ax, ay] = anchorOf(a)
  const [cx, cy] = [Number(canvas.dataset.ax), Number(canvas.dataset.ay)]
  ctx.drawImage(bake(frame), cx - ax, cy - ay)
}

function tick(now: number) {
  for (const player of players) {
    if (!player.canvas.isConnected) {
      players.delete(player)
      continue
    }
    // Only visible sprites are redrawn.
    if (player.canvas.offsetParent !== null) drawPlayer(player, now)
  }
  if (players.size) requestAnimationFrame(tick)
  else ticking = false
}

/**
 * A canvas that plays a clip. The canvas is the clip's frame size; the stylesheet scales it by `--s`.
 * Under reduced motion it shows `stillFrame` (default: the middle frame) instead.
 */
export function spritePlayer(
  id: string,
  clip: string,
  options: { scale?: number; className?: string; repeatEvery?: number; stillFrame?: number; label?: string } = {}
): HTMLCanvasElement {
  const a = anim(id, clip)
  const { w, h } = a.frames[0]
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const [ax, ay] = anchorOf(a)
  canvas.dataset.ax = String(ax)
  canvas.dataset.ay = String(ay)
  canvas.className = `px ${options.className ?? ''}`.trim()
  canvas.style.setProperty('--w', String(w))
  canvas.style.setProperty('--h', String(h))
  if (options.scale) canvas.style.setProperty('--s', String(options.scale))
  if (options.label) {
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', options.label)
  } else canvas.setAttribute('aria-hidden', 'true')
  const player: Player = { canvas, anim: a, start: performance.now(), repeatEvery: options.repeatEvery }
  if (reduced()) {
    const still = options.stillFrame ?? Math.floor(a.frames.length / 2)
    const frame = a.frames[Math.min(a.frames.length - 1, still)]
    canvas.getContext('2d')!.drawImage(bake(frame), 0, 0)
    return canvas
  }
  drawPlayer(player, player.start)
  players.add(player)
  if (!ticking) {
    ticking = true
    requestAnimationFrame(tick)
  }
  return canvas
}

/** Restarts every animated sprite inside `root` from its first frame (a screen that opens again). */
export function restartPlayers(root: ParentNode) {
  const now = performance.now()
  for (const player of players) if (root.contains(player.canvas)) player.start = now
}

// ------------------------------------------------------------------------------------------- nine-slices

/**
 * Publishes the nine-slice and icon sources as CSS custom properties on <html>:
 * `--np-panel` / `--np-paper` (border-image sources) and `--np-border-2` / `--np-border-3` (border widths for
 * scale 2 and 3), plus a few icons the stylesheet uses in pseudo-elements (`--ic-cursor`, `--ic-star`, …).
 */
export function installPixelStyles(root: HTMLElement = document.documentElement) {
  root.style.setProperty('--np-panel', `url("${spriteUrl('ui', 'panel')}")`)
  root.style.setProperty('--np-paper', `url("${spriteUrl('ui', 'paper')}")`)
  root.style.setProperty('--np-slice', String(nineSlice(1).slice))
  for (const s of [1, 2, 3]) root.style.setProperty(`--np-border-${s}`, `${nineSlice(s).border}px`)
  const icons: Record<string, string> = {
    cursor: 'arrowRight',
    more: 'arrowDown',
    star: 'starOn',
    'star-off': 'starOff',
    lock: 'lock',
    paw: 'paw',
    clock: 'clock',
    check: 'check'
  }
  for (const [name, iconName] of Object.entries(icons))
    root.style.setProperty(`--ic-${name}`, `url("${spriteUrl('ui', iconName)}")`)
  root.style.setProperty('--logo', `url("${spriteUrl('ui', 'logo')}")`)
}
