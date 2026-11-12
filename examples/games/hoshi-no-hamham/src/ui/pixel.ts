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
  /** Show these frames in turn instead of playing the clip: [frames, seconds per frame]. */
  cycle?: { frames: readonly number[]; every: number }
  /** On screen, as far as the observer knows (true until it has reported). */
  visible: boolean
}

const players = new Set<Player>()
const byCanvas = new WeakMap<Element, Player>()
let ticking = false

/**
 * Tells which sprites are on screen without asking the layout every frame. While none is (a stage is being played,
 * every menu is hidden) the frame loop below stops; the observer starts it again.
 */
const watcher =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const player = byCanvas.get(entry.target)
          if (player) player.visible = entry.isIntersecting
        }
        wake()
      })
    : null

function wake() {
  if (ticking || !players.size) return
  ticking = true
  requestAnimationFrame(tick)
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function drawPlayer(player: Player, now: number) {
  const { canvas, anim: a } = player
  // A frame callback's timestamp can precede the moment a player restarted, hence the clamp.
  let t = Math.max(0, now - player.start) / 1000
  if (player.repeatEvery) t %= player.repeatEvery
  const { cycle } = player
  const frame = cycle
    ? a.frames[cycle.frames[Math.floor(t / cycle.every) % cycle.frames.length]]
    : a.frames[frameAt(a, t)]
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const [ax, ay] = anchorOf(a)
  const [cx, cy] = [Number(canvas.dataset.ax), Number(canvas.dataset.ay)]
  ctx.drawImage(bake(frame), cx - ax, cy - ay)
}

function tick(now: number) {
  let showing = false
  for (const player of players) {
    if (!player.canvas.isConnected) {
      players.delete(player)
      watcher?.unobserve(player.canvas)
      continue
    }
    // Only visible sprites are redrawn. Without an observer the layout is asked, as it always was.
    if (watcher ? !player.visible : player.canvas.offsetParent === null) continue
    showing = true
    drawPlayer(player, now)
  }
  if (showing || (!watcher && players.size)) requestAnimationFrame(tick)
  else ticking = false
}

/**
 * A canvas that plays a clip. The canvas is the clip's frame size; the stylesheet scales it by `--s`.
 * Under reduced motion it shows `stillFrame` (default: the middle frame) instead.
 */
export function spritePlayer(
  id: string,
  clip: string,
  options: {
    scale?: number
    className?: string
    repeatEvery?: number
    stillFrame?: number
    label?: string
    /** Hold a pose by alternating between these frames, `every` seconds each. */
    cycle?: { frames: readonly number[]; every: number }
  } = {}
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
  const player: Player = {
    canvas,
    anim: a,
    start: performance.now(),
    repeatEvery: options.repeatEvery,
    cycle: options.cycle,
    visible: true
  }
  if (reduced()) {
    const still = options.stillFrame ?? Math.floor(a.frames.length / 2)
    const frame = a.frames[Math.min(a.frames.length - 1, still)]
    canvas.getContext('2d')!.drawImage(bake(frame), 0, 0)
    return canvas
  }
  drawPlayer(player, player.start)
  players.add(player)
  byCanvas.set(canvas, player)
  watcher?.observe(canvas)
  wake()
  return canvas
}

/** Restarts every animated sprite inside `root` from its first frame (a screen that opens again). */
export function restartPlayers(root: ParentNode) {
  const now = performance.now()
  for (const player of players) if (root.contains(player.canvas)) player.start = now
  wake()
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

// ------------------------------------------------------------------------------------------- night scene

/**
 * Pixel pieces of the night that the title (under the stage on upright phones) and the game over share with the
 * control deck: a star tile in two layers (layer 1 holds the stars that twinkle), rolling hills and a crescent
 * moon. Drawn once into small canvases and handed out as data URLs; the stylesheet shows them at 2×.
 */
function painted(key: string, w: number, h: number, paint: (dot: (x: number, y: number, c: string) => void) => void) {
  const cached = urls.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  paint((x, y, c) => {
    ctx.fillStyle = c
    ctx.fillRect(x, y, 1, 1)
  })
  const url = canvas.toDataURL()
  urls.set(key, url)
  return url
}

/** A 64×56 tile of scattered stars. */
export function nightSkyUrl(layer: 0 | 1): string {
  return painted(`night/sky/${layer}`, 64, 56, (dot) => {
    if (layer === 0) {
      const quiet: [number, number, number][] = [
        [3, 4, 0],
        [17, 2, 1],
        [29, 9, 0],
        [11, 17, 1],
        [41, 5, 1],
        [52, 14, 0],
        [36, 22, 0],
        [60, 27, 1],
        [22, 29, 1],
        [6, 36, 0],
        [47, 38, 1],
        [15, 47, 1],
        [33, 44, 0],
        [56, 51, 0],
        [27, 53, 1]
      ]
      for (const [x, y, c] of quiet) dot(x, y, c ? '#5d4aa8' : '#8a7ad8')
      return
    }
    // Two four-point sparkles and a few bright dots.
    for (const [cx, cy] of [
      [26, 13],
      [50, 40]
    ]) {
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ])
        dot(cx + dx, cy + dy, '#ffd45e')
      dot(cx, cy, '#fff6b0')
    }
    dot(8, 25, '#ffffff')
    dot(42, 30, '#fff6b0')
    dot(19, 42, '#ffd9ea')
    dot(58, 8, '#ffffff')
  })
}

/** Two rows of rolling hills (a far, lighter one and a near, darker one) on a 128×32 tile repeated sideways. */
export function nightHillsUrl(): string {
  return painted('night/hills', 128, 32, (dot) => {
    const w = 128
    const h = 32
    for (let x = 0; x < w; x++) {
      const a = (x / w) * Math.PI * 2
      const far = Math.round(9 - 4 * Math.sin(a * 2 + 0.6) - 2 * Math.sin(a * 3))
      const near = Math.round(19 - 4 * Math.sin(a * 3 + 2) - 2 * Math.sin(a * 5 + 1))
      for (let y = far; y < h; y++) dot(x, y, y === far ? '#4a3a80' : '#2f2460')
      for (let y = near; y < h; y++) dot(x, y, y === near ? '#3a2a78' : '#1b1035')
      // A few grass tufts on the near hills.
      if (x % 23 === 5 || x % 37 === 11) dot(x, near - 1, '#3a2a78')
    }
  })
}

/** A 24-px crescent moon, lit from the top left like every other sprite. */
export function nightMoonUrl(): string {
  return painted('night/moon', 24, 24, (dot) => {
    const n = 24
    const c = (n - 1) / 2
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - c, y - c)
        if (d > n / 2 - 0.3) continue
        // The bite of the crescent: a second disc offset to the lower right.
        if (Math.hypot(x - c - 7, y - c + 3) < n / 2 - 2) continue
        const rim = d > n / 2 - 1.6
        dot(x, y, rim ? '#e0a428' : x + y < n - 4 ? '#fff6b0' : '#ffd45e')
      }
    // Two craters on the lit side.
    dot(5, 10, '#ffd45e')
    dot(6, 15, '#ffd45e')
    dot(7, 15, '#ffd45e')
  })
}
