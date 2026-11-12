/**
 * Small 2D canvas painting kit for the procedural atlas: seeded randomness, tile-wrapping draws (so repeating
 * tiles are seamless), speckle noise, grime and cracks. DOM only (used by paint.ts in the browser).
 */

export type C2D = CanvasRenderingContext2D

export const FONT = "'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo','Noto Sans JP',sans-serif"

export class Brush {
  private s: number
  constructor(
    readonly c: C2D,
    readonly S: number,
    seed: number
  ) {
    this.s = seed >>> 0 || 1
  }

  r(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(a: number, b: number) {
    return a + (b - a) * this.r()
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.r() * list.length)]
  }

  /** Runs `draw` at (x, y) and at the wrapped copies when within `reach` of an edge. */
  wrap(x: number, y: number, reach: number, draw: (x: number, y: number) => void) {
    const S = this.S
    for (const dx of [-S, 0, S]) {
      if (dx < 0 && x + reach < S) continue
      if (dx > 0 && x - reach > 0) continue
      for (const dy of [-S, 0, S]) {
        if (dy < 0 && y + reach < S) continue
        if (dy > 0 && y - reach > 0) continue
        draw(x + dx, y + dy)
      }
    }
  }

  fill(color: string) {
    this.c.fillStyle = color
    this.c.fillRect(0, 0, this.S, this.S)
  }

  /** Fine speckle noise for material grain. */
  speckle(count: number, colors: readonly string[], size: [number, number] = [1, 2.5], alpha = 0.25) {
    const c = this.c
    c.save()
    c.globalAlpha = alpha
    for (let i = 0; i < count; i++) {
      c.fillStyle = this.pick(colors)
      const s = this.range(size[0], size[1])
      c.fillRect(this.r() * this.S, this.r() * this.S, s, s)
    }
    c.restore()
  }

  /** Soft blotches (dirt, damp, colour variation), wrapped. */
  blotch(count: number, colors: readonly string[], radius: [number, number], alpha = 0.12) {
    const c = this.c
    for (let i = 0; i < count; i++) {
      const x = this.r() * this.S
      const y = this.r() * this.S
      const r = this.range(radius[0], radius[1])
      const color = this.pick(colors)
      this.wrap(x, y, r, (px, py) => {
        const g = c.createRadialGradient(px, py, 0, px, py, r)
        g.addColorStop(0, withAlpha(color, alpha))
        g.addColorStop(1, withAlpha(color, 0))
        c.fillStyle = g
        c.fillRect(px - r, py - r, r * 2, r * 2)
      })
    }
  }

  /** Vertical grime streaks running down from y. */
  streaks(x0: number, x1: number, y: number, len: number, color: string, alpha = 0.18, count = 4) {
    const c = this.c
    for (let i = 0; i < count; i++) {
      const x = this.range(x0, x1)
      const l = len * this.range(0.4, 1)
      const w = this.range(1.5, 5)
      const g = c.createLinearGradient(0, y, 0, y + l)
      g.addColorStop(0, withAlpha(color, alpha))
      g.addColorStop(1, withAlpha(color, 0))
      c.fillStyle = g
      c.fillRect(x, y, w, l)
    }
  }

  /** Branching hairline crack. */
  crack(x: number, y: number, len: number, color = 'rgba(30,30,30,0.55)', width = 1.2) {
    const c = this.c
    c.save()
    c.strokeStyle = color
    c.lineCap = 'round'
    let a = this.r() * Math.PI * 2
    let px = x
    let py = y
    for (let i = 0; i < len; i++) {
      a += this.range(-0.6, 0.6)
      const nx = px + Math.cos(a) * 6
      const ny = py + Math.sin(a) * 6
      c.lineWidth = width * (1 - i / (len + 2))
      this.wrap(px, py, 10, (ax, ay) => {
        c.beginPath()
        c.moveTo(ax, ay)
        c.lineTo(ax + (nx - px), ay + (ny - py))
        c.stroke()
      })
      if (this.r() < 0.18 && i < len - 2) {
        const save = this.s
        this.crack(px, py, Math.floor(len / 3), color, width * 0.6)
        this.s = save + 1
      }
      px = ((nx % this.S) + this.S) % this.S
      py = ((ny % this.S) + this.S) % this.S
    }
    c.restore()
  }

  /** Rounded rectangle path. */
  rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.c
    c.beginPath()
    c.moveTo(x + r, y)
    c.arcTo(x + w, y, x + w, y + h, r)
    c.arcTo(x + w, y + h, x, y + h, r)
    c.arcTo(x, y + h, x, y, r)
    c.arcTo(x, y, x + w, y, r)
    c.closePath()
  }

  /** Vertical gradient fill of a rect. */
  vgrad(x: number, y: number, w: number, h: number, top: string, bottom: string) {
    const g = this.c.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, top)
    g.addColorStop(1, bottom)
    this.c.fillStyle = g
    this.c.fillRect(x, y, w, h)
  }

  /** Paw print (ARK motif). */
  paw(x: number, y: number, s: number, color: string) {
    const c = this.c
    c.fillStyle = color
    c.beginPath()
    c.ellipse(x, y + s * 0.25, s * 0.42, s * 0.34, 0, 0, Math.PI * 2)
    c.fill()
    for (const [dx, dy] of [
      [-0.42, -0.2],
      [-0.15, -0.45],
      [0.15, -0.45],
      [0.42, -0.2]
    ]) {
      c.beginPath()
      c.ellipse(x + dx * s, y + dy * s, s * 0.14, s * 0.18, 0, 0, Math.PI * 2)
      c.fill()
    }
  }
}

export function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`)
  return color
}

/** Draws text squeezed into a box (wide signs are painted at their aspect and scaled into the square tile). */
export function fitText(c: C2D, text: string, x: number, y: number, w: number, h: number, color: string, weight = 800) {
  c.save()
  c.fillStyle = color
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  let size = h
  c.font = `${weight} ${size}px ${FONT}`
  const m = c.measureText(text).width
  if (m > w) size = (size * w) / m
  c.font = `${weight} ${size}px ${FONT}`
  c.fillText(text, x + w / 2, y + h / 2 + size * 0.05)
  c.restore()
}
