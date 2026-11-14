/**
 * Sprites for the DOM: sheet frames as data URLs and <img> elements scaled by whole numbers (CSS
 * `image-rendering: pixelated`), animated sprite canvases, and the nine-slice `panel` / `paper` borders.
 *
 * Nothing here paints art: a sprite whose clip is not on the page yet is built as an empty frame of the right size,
 * the art is asked for (see `whenArt`) and the frame is filled in when it arrives. The app asks for every screen's
 * art ahead of time, so normally the art is already here. A data URL is a PNG encoded on the page: `prepareUrl`
 * makes them ahead, in the slices that adopt the art, and the screens only look them up.
 */
import { anchorOf, clipReady, frameAt, hasTile, sheet, tile, type Anim } from '../art'
import { allSheetSpecs, type AnimSpec, type TileQuery } from '../art/contract'
import type { Raster } from '../art/raster'
import { defaultAnchor } from '../art/sheet'
import { whenArt } from '../app/art-fetch'
import { bake } from '../view/bake'
import {
  GROUND_SPACING,
  HOP_CLIPS,
  HOP_HEIGHT,
  HOP_TOP,
  groundShift,
  hopDrawLift,
  hopPose,
  soleGap,
  type HopClip,
  type HopPose
} from './help-moves'
import { nineSlice } from './rules'

const urls = new Map<string, string>()
const rasterUrls = new WeakMap<Raster, string>()

/** The raster as a PNG data URL (made once per raster, shared with the HUD's sprites). */
export function rasterDataUrl(r: Raster): string {
  let url = rasterUrls.get(r)
  if (!url) {
    url = bake(r).toDataURL()
    rasterUrls.set(r, url)
  }
  return url
}

function rasterUrl(key: string, r: Raster, crop?: readonly [number, number, number, number]): string {
  if (!crop) return rasterDataUrl(r)
  const cached = urls.get(key)
  if (cached) return cached
  const [x, y, w, h] = crop
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bake(r), x, y, w, h, 0, 0, w, h)
  const url = canvas.toDataURL()
  urls.set(key, url)
  return url
}

export function anim(id: string, clip: string): Anim {
  const found = sheet(id)[clip]
  if (!found) throw new Error(`No clip ${id}/${clip}`)
  return found
}

let specs: Record<string, Record<string, AnimSpec>> | null = null
/** What the art contract says about a clip (its size and anchor), known before the clip is drawn. */
const specOf = (id: string, clip: string): AnimSpec | undefined => (specs ??= allSheetSpecs())[id]?.[clip]

/** Calls `fill` now when the clip is here, else once it has arrived. */
function withClip(id: string, clip: string, fill: () => void) {
  if (whenArt(`clip:${id}/${clip}`, { clips: [{ sheet: id, clip }], tiles: [], backdrops: [] }, fill)) fill()
}

const cropKey = (id: string, clip: string, f: number, crop: readonly number[]) => `${id}/${clip}/${f}/${crop.join(',')}`

/** A frame of a sheet as a PNG data URL at 1×. */
export function spriteUrl(id: string, clip: string, frame = 0): string {
  const a = anim(id, clip)
  const f = Math.max(0, Math.min(a.frames.length - 1, frame))
  return rasterDataUrl(a.frames[f])
}

/**
 * Makes the data URL of a frame (or of part of it) ahead of time, if its clip is here; false when it is not (the
 * sprite then makes it once the art has arrived).
 */
export function prepareUrl(id: string, clip: string, frame = 0, crop?: readonly [number, number, number, number]) {
  if (!clipReady(id, clip)) return false
  const a = anim(id, clip)
  const f = Math.max(0, Math.min(a.frames.length - 1, frame))
  rasterUrl(crop ? cropKey(id, clip, f, crop) : '', a.frames[f], crop)
  return true
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
  const crop = options.crop
  const img = document.createElement('img')
  img.alt = options.alt ?? ''
  if (!options.alt) img.setAttribute('aria-hidden', 'true')
  img.decoding = 'sync'
  img.draggable = false
  img.className = `px ${options.className ?? ''}`.trim()
  const size = (w: number, h: number) => {
    img.style.setProperty('--w', String(crop ? crop[2] : w))
    img.style.setProperty('--h', String(crop ? crop[3] : h))
  }
  const fill = () => {
    const a = anim(id, clip)
    const f = Math.max(0, Math.min(a.frames.length - 1, options.frame ?? 0))
    const r = a.frames[f]
    img.src = crop ? rasterUrl(cropKey(id, clip, f, crop), r, crop) : rasterDataUrl(r)
    size(r.w, r.h)
  }
  if (clipReady(id, clip)) fill()
  else {
    // An empty frame of the contract's size until the art arrives.
    const spec = specOf(id, clip)
    if (spec) size(spec.w, spec.h)
    withClip(id, clip, fill)
  }
  if (options.scale) img.style.setProperty('--s', String(options.scale))
  return img
}

/** An <img> of `w × h` art pixels without a picture yet. */
function bareImg(w: number, h: number, options: { scale?: number; className?: string }) {
  const img = document.createElement('img')
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  img.draggable = false
  img.className = `px ${options.className ?? ''}`.trim()
  img.style.setProperty('--w', String(w))
  img.style.setProperty('--h', String(h))
  if (options.scale) img.style.setProperty('--s', String(options.scale))
  return img
}

/** A terrain tile as an <img>: an empty 64×64 frame until the tile has arrived (see `spriteImg`). */
export function tileImg(q: TileQuery, options: { scale?: number; className?: string } = {}) {
  const img = bareImg(64, 64, options)
  const fill = () => void (img.src = rasterDataUrl(tile(q)))
  const list = { clips: [], tiles: [q], backdrops: [] }
  if (whenArt(`tile:${q.theme}/${q.kind}/${q.tx},${q.ty}`, list, fill)) fill()
  return img
}

/** Makes a terrain tile's data URL ahead of time, if the tile is here. */
export function prepareTileUrl(q: TileQuery) {
  if (!hasTile(q)) return false
  rasterDataUrl(tile(q))
  return true
}

/** A `ui` sheet icon (16×16) as an <img>. */
export const icon = (name: string, options: SpriteOptions = {}) =>
  spriteImg('ui', name, { ...options, className: `icon ${options.className ?? ''}` })

// -------------------------------------------------------------------------------------- animated sprites

interface Player {
  canvas: HTMLCanvasElement
  /** The clip, once it is here (the canvas stays empty until then). */
  anim: Anim | null
  start: number
  /** Restart the clip after it ends (for one-shot clips shown on a loop). */
  repeatEvery?: number
  /** Show these frames in turn instead of playing the clip: [frames, seconds per frame]. */
  cycle?: { frames: readonly number[]; every: number }
  /** On screen, as far as the observer knows (true until it has reported). */
  visible: boolean
  /** Marks on the ground band that go back with the clip's frames: the px of ground one pass of the clip covers. */
  ground?: { stride: number }
  /** A whole hop instead of one clip: every clip it draws and the height it rises. */
  hop?: { anims: Record<HopClip, Anim>; height: number; pose: HopPose }
}

/** The ground marks of a walking sprite: small dark dashes on the band under the feet. */
const GROUND_MARK = 'rgba(14, 40, 30, 0.7)'
const GROUND_MARK_W = 8

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

/** Draws frame `index` of `a` on the canvas, lifted `lift` px, over the ground marks of a walk (if it has any). */
function paintFrame(canvas: HTMLCanvasElement, a: Anim, index: number, ground: Player['ground'], lift = 0) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const [ax, ay] = anchorOf(a)
  const [cx, cy] = [Number(canvas.dataset.ax), Number(canvas.dataset.ay)]
  if (ground) {
    // The marks are where the ground is: each frame of the cycle they are one step further back.
    ctx.fillStyle = GROUND_MARK
    const shift = groundShift(index, a.frames.length, ground.stride)
    for (let x = -shift; x < canvas.width; x += GROUND_SPACING) ctx.fillRect(x, cy + 1, GROUND_MARK_W, 2)
  }
  ctx.drawImage(bake(a.frames[index]), cx - ax, cy - ay - lift)
}

const soleGaps = new WeakMap<Raster, number>()

/** A frame of the hop: on the hop's curve, its soles brought down to the line near the ground. */
function paintHop(canvas: HTMLCanvasElement, a: Anim, pose: HopPose) {
  const index = frameAt(a, pose.t)
  const frame = a.frames[index]
  let gap = soleGaps.get(frame)
  if (gap === undefined) soleGaps.set(frame, (gap = soleGap(frame, anchorOf(a)[1])))
  paintFrame(canvas, a, index, undefined, hopDrawLift(pose.lift, gap))
}

function drawPlayer(player: Player, now: number) {
  const { canvas, anim: a, hop } = player
  if (!a) return
  // A frame callback's timestamp can precede the moment a player restarted, hence the clamp.
  let t = Math.max(0, now - player.start) / 1000
  if (player.repeatEvery) t %= player.repeatEvery
  if (hop) {
    const pose = hopPose(t, hop.height, hop.pose)
    paintHop(canvas, hop.anims[pose.clip], pose)
    return
  }
  const { cycle } = player
  const index = cycle ? cycle.frames[Math.floor(t / cycle.every) % cycle.frames.length] : frameAt(a, t)
  paintFrame(canvas, a, index, player.ground)
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

/** Gives the canvas the clip's frame size and anchor. */
function shape(canvas: HTMLCanvasElement, w: number, h: number, anchor: readonly [number, number], headroom = 0) {
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h + headroom) canvas.height = h + headroom
  canvas.dataset.ax = String(anchor[0])
  canvas.dataset.ay = String(anchor[1] + headroom)
  canvas.style.setProperty('--w', String(w))
  canvas.style.setProperty('--h', String(h + headroom))
}

/** A frame number, or one worked out from the clip's frame count. */
type ByCount<T> = T | ((count: number) => T)
const byCount = <T>(value: ByCount<T>, count: number): T =>
  typeof value === 'function' ? (value as (count: number) => T)(count) : value

/**
 * A canvas that plays a clip. The canvas is the clip's frame size; the stylesheet scales it by `--s`.
 * Under reduced motion it shows `stillFrame` (default: the middle frame) instead. `stillFrame` and `cycle` may
 * be worked out from the clip's frame count, which is known once the clip is here.
 */
export function spritePlayer(
  id: string,
  clip: string,
  options: {
    scale?: number
    className?: string
    repeatEvery?: number
    stillFrame?: ByCount<number>
    label?: string
    /** Hold a pose by alternating between these frames, `every` seconds each. */
    cycle?: ByCount<{ frames: readonly number[]; every: number }>
    /**
     * A walk over the ground: marks on the ground band under the feet go back with the clip's frames (`stride` of the
     * contract, per pass), so a foot that is down stays over the same mark. Needs a clip with a stride.
     */
    groundMarks?: boolean
    /**
     * Plays a whole hop instead of the clip (`hopPose`, help-moves.ts): the canvas gets `HOP_HEIGHT` rows of headroom
     * above the clip's frame for the leap. Under reduced motion it shows one frame at the top of the hop.
     */
    hop?: boolean
  } = {}
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.className = `px ${options.className ?? ''}`.trim()
  const spec = specOf(id, clip)
  const headroom = options.hop ? HOP_HEIGHT : 0
  if (spec) shape(canvas, spec.w, spec.h, spec.anchor ?? defaultAnchor(spec.w, spec.h), headroom)
  if (options.scale) canvas.style.setProperty('--s', String(options.scale))
  if (options.label) {
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', options.label)
  } else canvas.setAttribute('aria-hidden', 'true')
  const still = reduced()
  const player: Player = {
    canvas,
    anim: null,
    start: performance.now(),
    repeatEvery: options.repeatEvery,
    visible: true
  }
  const fill = () => {
    if (options.hop) {
      if (player.hop || !HOP_CLIPS.every((name) => clipReady(id, name))) return
      const anims = Object.fromEntries(HOP_CLIPS.map((name) => [name, anim(id, name)])) as Record<HopClip, Anim>
      const { w, h } = anims.idle.frames[0]
      shape(canvas, w, h, anchorOf(anims.idle), headroom)
      player.hop = { anims, height: HOP_HEIGHT, pose: { clip: 'idle', t: 0, lift: 0 } }
      player.anim = anims.idle
      if (still) {
        const pose = hopPose(HOP_TOP, HOP_HEIGHT, player.hop.pose)
        paintHop(canvas, anims[pose.clip], pose)
        return
      }
      drawPlayer(player, performance.now())
      return
    }
    const a = anim(id, clip)
    const { w, h } = a.frames[0]
    shape(canvas, w, h, anchorOf(a))
    const count = a.frames.length
    const stride = options.groundMarks ? specOf(id, clip)?.stride : undefined
    if (stride) player.ground = { stride }
    if (still) {
      const index = Math.min(count - 1, byCount(options.stillFrame ?? Math.floor(count / 2), count))
      paintFrame(canvas, a, index, player.ground)
      return
    }
    player.anim = a
    if (options.cycle) player.cycle = byCount(options.cycle, count)
    drawPlayer(player, performance.now())
  }
  if (options.hop) for (const name of HOP_CLIPS) withClip(id, name, fill)
  else withClip(id, clip, fill)
  if (still) return canvas
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
