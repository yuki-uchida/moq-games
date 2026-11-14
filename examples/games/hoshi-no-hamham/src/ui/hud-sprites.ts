/**
 * Pixel sprites for the DOM HUD: registry rasters drawn into canvases or turned into image URLs, plus the few
 * button plates the HUD paints itself (the registry has icons, faces and nine-slices but no button bodies).
 */
import { frameAt, sheet } from '../art'
import type { Raster } from '../art/raster'
import { bake } from '../view/bake'
import { rasterDataUrl } from './pixel'

const urls = new WeakMap<Raster, string>()

/** The raster as a `url(...)` value for CSS (the PNG is made once per raster, shared with the screens' sprites). */
export function rasterUrl(raster: Raster): string {
  let url = urls.get(raster)
  if (!url) {
    url = `url(${rasterDataUrl(raster)})`
    urls.set(raster, url)
  }
  return url
}

/** First frame (or frame at `t`) of a registry clip. */
export function clipRaster(id: string, name: string, t = 0): Raster {
  const anim = sheet(id)[name]
  return anim.frames[frameAt(anim, t)]
}

/** Every pixel is `scale` CSS px square: the canvas keeps its art size and CSS scales it up unsmoothed. */
export function makeSprite(className: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.className = className
  canvas.setAttribute('aria-hidden', 'true')
  return canvas
}

/** Replaces the canvas content with the raster (resizing the backing store to the art size). */
export function drawRaster(canvas: HTMLCanvasElement, raster: Raster) {
  if (canvas.width !== raster.w) canvas.width = raster.w
  if (canvas.height !== raster.h) canvas.height = raster.h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, raster.w, raster.h)
  ctx.drawImage(bake(raster), 0, 0)
  canvas.style.setProperty('--w', String(raster.w))
  canvas.style.setProperty('--h', String(raster.h))
}

// ---------------------------------------------------------------------------------------------- button plates

const INK = '#2a1230'

interface Plate {
  base: string
  light: string
  dark: string
  rim: string
}

const PLATES = {
  /** Square menu button: night plate with a gold rim. */
  night: { base: '#2c1b56', light: '#4b3590', dark: '#1b1035', rim: '#ffd45e' },
  nightDown: { base: '#1b1035', light: '#1b1035', dark: '#120a26', rim: '#e0a428' },
  pad: { base: '#5d4aa8', light: '#9a86e8', dark: '#3a2a78', rim: '#d8ccff' },
  padDown: { base: '#3a2a78', light: '#3a2a78', dark: '#2a1c5a', rim: '#a99ae0' },
  bite: { base: '#f2639f', light: '#ffb3cf', dark: '#b84f80', rim: '#fff3b8' },
  biteDown: { base: '#b84f80', light: '#b84f80', dark: '#8a3a62', rim: '#ffd0e2' },
  jump: { base: '#4aa8e8', light: '#a8e0ff', dark: '#2a6aa8', rim: '#e8faff' },
  jumpDown: { base: '#2a6aa8', light: '#2a6aa8', dark: '#1e4c80', rim: '#a8d8f0' }
} satisfies Record<string, Plate>

export type PlateName = keyof typeof PLATES

const plateUrls = new Map<string, string>()

/**
 * The plates the HUD and the touch controls draw (`hud.ts`, `touch.ts`): made ahead by the boot, one per slice,
 * so that building the HUD only looks them up. A plate missing here is still made when it is first asked for.
 */
export const HUD_PLATES: readonly (readonly [PlateName, number, 'disc' | 'square'])[] = [
  ['night', 22, 'square'],
  ['nightDown', 22, 'square'],
  ['pad', 22, 'disc'],
  ['padDown', 22, 'disc'],
  ['jump', 22, 'disc'],
  ['jumpDown', 22, 'disc'],
  ['bite', 26, 'disc'],
  ['biteDown', 26, 'disc']
]

/** A pixel plate (rounded square or disc) of `n`×`n` art pixels as a CSS `url(...)`. */
export function plateUrl(name: PlateName, n: number, shape: 'disc' | 'square'): string {
  const key = `${name}:${n}:${shape}`
  const cached = plateUrls.get(key)
  if (cached) return cached
  const p = PLATES[name]
  const canvas = document.createElement('canvas')
  canvas.width = n
  canvas.height = n
  const ctx = canvas.getContext('2d')!
  const c = (n - 1) / 2
  const down = name.endsWith('Down')
  // 0 outside, 1 outline, 2 rim, 3 body
  const depth = (x: number, y: number) => {
    let d: number
    if (shape === 'disc') d = n / 2 - Math.hypot(x - c, y - c)
    else {
      const corner = 4
      const dx = Math.max(0, Math.abs(x - c) - (n / 2 - corner))
      const dy = Math.max(0, Math.abs(y - c) - (n / 2 - corner))
      d = n / 2 - Math.max(Math.abs(x - c), Math.abs(y - c))
      if (dx > 0 && dy > 0) d = Math.min(d, corner - Math.hypot(dx, dy) + 0.5)
    }
    return d
  }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = depth(x, y)
      let color: string | null = null
      if (d > 0) {
        if (d < 1) color = INK
        else if (d < 2) color = p.rim
        else {
          color = p.base
          const lit = x - c + (y - c)
          if (!down && d < 4 && lit < 0) color = p.light
          else if (d < 3.5 && lit > 0) color = p.dark
          else if (down && d < 4 && lit < 0) color = p.dark
        }
      }
      if (color) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, 1, 1)
      }
    }
  const url = `url(${canvas.toDataURL()})`
  plateUrls.set(key, url)
  return url
}
