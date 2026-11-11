/**
 * Tiny pixel-art toolkit. Sprites are authored on a 64×64 grid (the game's tile unit) and baked to
 * canvases with nearest-neighbour scaling, so every edge stays crisp. The simulation never touches
 * this module: it only produces RGBA buffers, which keeps the engine testable in Node.
 */

export interface Sprite {
  readonly w: number
  readonly h: number
  /** RGBA bytes, row-major, length w*h*4. */
  readonly data: Uint8ClampedArray
}

export type Rgba = readonly [number, number, number, number]

const rgbaCache = new Map<string, Rgba>()

export function rgba(hex: string, alpha = 255): Rgba {
  const key = alpha === 255 ? hex : `${hex}/${alpha}`
  const cached = rgbaCache.get(key)
  if (cached) return cached
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const value = Number.parseInt(full, 16)
  const parsed: Rgba = [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha]
  rgbaCache.set(key, parsed)
  return parsed
}

export interface Painter {
  set(x: number, y: number, color: string): void
  rect(x: number, y: number, w: number, h: number, color: string): void
  /** Filled ellipse centred on integer bounds. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void
  circle(cx: number, cy: number, r: number, color: string): void
  line(x0: number, y0: number, x1: number, y1: number, color: string): void
  /** Mirrors the sprite horizontally around its centre (used for left-facing frames). */
  mirror(color?: string): void
  shift(dx: number, dy: number, color?: string): void
  blend(x: number, y: number, color: string, alpha: number): void
  outline(color: string): void
}

export function makeSprite(w: number, h: number, draw: (p: Painter) => void): Sprite {
  const data = new Uint8ClampedArray(w * h * 4)
  const at = (x: number, y: number) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= w || py >= h) return -1
    return (py * w + px) * 4
  }
  const paint = (x: number, y: number, color: string, alpha = 255) => {
    const i = at(x, y)
    if (i < 0) return
    const [r, g, b, a] = rgba(color, alpha)
    if (a === 0) return
    if (a === 255 || data[i + 3] === 0) {
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
      return
    }
    const src = a / 255
    const dst = data[i + 3] / 255
    const out = src + dst * (1 - src)
    data[i] = Math.round((r * src + data[i] * dst * (1 - src)) / out)
    data[i + 1] = Math.round((g * src + data[i + 1] * dst * (1 - src)) / out)
    data[i + 2] = Math.round((b * src + data[i + 2] * dst * (1 - src)) / out)
    data[i + 3] = Math.round(out * 255)
  }
  const painter: Painter = {
    set: (x, y, color) => paint(x, y, color),
    rect: (x, y, rw, rh, color) => {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) paint(x + i, y + j, color)
    },
    ellipse: (cx, cy, rx, ry, color) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x + 0.5 - cx) / rx
          const ny = (y + 0.5 - cy) / ry
          if (nx * nx + ny * ny <= 1) paint(x, y, color)
        }
    },
    circle: (cx, cy, r, color) => painter.ellipse(cx, cy, r, r, color),
    line: (x0, y0, x1, y1, color) => {
      const dx = Math.abs(x1 - x0)
      const dy = -Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : x0 > x1 ? -1 : 0
      const sy = y0 < y1 ? 1 : y0 > y1 ? -1 : 0
      let err = dx + dy
      for (let guard = 0; guard < 4096; guard++) {
        paint(x0, y0, color)
        if (x0 === x1 && y0 === y1) break
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x0 += sx
        }
        if (e2 <= dx) {
          err += dx
          y0 += sy
        }
      }
    },
    mirror: () => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < Math.floor(w / 2); x++) {
          const a = (y * w + x) * 4
          const b = (y * w + (w - 1 - x)) * 4
          for (let c = 0; c < 4; c++) {
            const t = data[a + c]
            data[a + c] = data[b + c]
            data[b + c] = t
          }
        }
      }
    },
    shift: (dx, dy) => {
      const copy = data.slice()
      data.fill(0)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const sx = x - dx
          const sy = y - dy
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
          const a = (sy * w + sx) * 4
          const b = (y * w + x) * 4
          for (let c = 0; c < 4; c++) data[b + c] = copy[a + c]
        }
    },
    blend: (x, y, color, alpha) => paint(x, y, color, Math.round(alpha * 255)),
    outline: (color) => {
      const copy = data.slice()
      const opaque = (i: number) => copy[i + 3] > 0
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          if (opaque(i)) continue
          let near = false
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
          ]) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (opaque((ny * w + nx) * 4)) {
              near = true
              break
            }
          }
          if (near) paint(x, y, color)
        }
    }
  }
  draw(painter)
  return { w, h, data }
}

export function cloneSprite(sprite: Sprite): Sprite {
  return { w: sprite.w, h: sprite.h, data: sprite.data.slice() }
}

/** Copies one sprite over another with alpha, used for boss palettes and hurt flashes. */
export function blit(dst: Sprite, src: Sprite, dx = 0, dy = 0, alpha = 1) {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const sx = x + dx
      const sy = y + dy
      if (sx < 0 || sy < 0 || sx >= dst.w || sy >= dst.h) continue
      const s = (y * src.w + x) * 4
      if (src.data[s + 3] === 0) continue
      const d = (sy * dst.w + sx) * 4
      const a = (src.data[s + 3] / 255) * alpha
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(dst.data[d + c] * (1 - a) + src.data[s + c] * a)
      dst.data[d + 3] = Math.max(dst.data[d + 3], Math.round(a * 255))
    }
  return dst
}

/** Recolours every opaque pixel of a sprite; used for enemy and boss palette variants. */
export function tint(sprite: Sprite, from: string, to: string): Sprite {
  const [fr, fg, fb] = rgba(from)
  const [tr, tg, tb] = rgba(to)
  const out = cloneSprite(sprite)
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue
    const near = (a: number, b: number) => Math.abs(a - b) < 24
    if (near(out.data[i], fr) && near(out.data[i + 1], fg) && near(out.data[i + 2], fb)) {
      out.data[i] = tr
      out.data[i + 1] = tg
      out.data[i + 2] = tb
    }
  }
  return out
}

export function isBlank(sprite: Sprite): boolean {
  for (let i = 3; i < sprite.data.length; i += 4) if (sprite.data[i] > 0) return false
  return true
}

/** Bakes a sprite to a canvas at an integer scale. Browser-only; the engine bakes once at boot. */
export function bake(sprite: Sprite, scale = 2): HTMLCanvasElement {
  const base = document.createElement('canvas')
  base.width = sprite.w
  base.height = sprite.h
  const image = new ImageData(sprite.w, sprite.h)
  image.data.set(sprite.data)
  base.getContext('2d')!.putImageData(image, 0, 0)
  if (scale === 1) return base
  const out = document.createElement('canvas')
  out.width = sprite.w * scale
  out.height = sprite.h * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(base, 0, 0, out.width, out.height)
  return out
}
