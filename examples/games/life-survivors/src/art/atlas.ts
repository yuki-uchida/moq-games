import { PALETTE_RGBA } from './palette'
import type { Raster } from './raster'

/**
 * Browser side of the art: every frame becomes a canvas pre-upscaled by an integer k with nearest
 * neighbour, created on first use and cached. Drawing it at the final (fractional) size with smoothing
 * on gives "sharp bilinear" — crisp pixels without shimmering at any device scale.
 */
const cache = new WeakMap<Raster, Map<number, HTMLCanvasElement>>()
const PALETTE32 = new Uint32Array(PALETTE_RGBA.buffer.slice(0))

export function canvasOf(r: Raster, k: number) {
  let byK = cache.get(r)
  if (!byK) cache.set(r, (byK = new Map()))
  let canvas = byK.get(k)
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.width = r.w * k
  canvas.height = r.h * k
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(canvas.width, canvas.height)
  const out = new Uint32Array(img.data.buffer)
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const c = r.data[y * r.w + x]
      if (!c) continue
      const px = PALETTE32[c]
      for (let j = 0; j < k; j++)
        out.fill(px, (y * k + j) * canvas.width + x * k, (y * k + j) * canvas.width + x * k + k)
    }
  ctx.putImageData(img, 0, 0)
  byK.set(k, canvas)
  return canvas
}
