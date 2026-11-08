/**
 * Lighting for 'dim' (stage 2 sewers) and 'night' (stage 4 forest): a quarter-resolution light map is filled with
 * the ambient colour, light pools are added on top ('lighter'), and the map is multiplied over the world (smoothly
 * upscaled, so pools are soft). Warm lights also get a faint 'screen' halo so lamps glow. One fill, a few dozen small
 * drawImage calls and two full-view composites per frame: cheap at 1920×1080.
 */

export type LightColor = 'hero' | 'warm' | 'cool' | 'fire' | 'violet' | 'white' | 'faint'

const RGB: Record<LightColor, [number, number, number]> = {
  hero: [255, 236, 206],
  warm: [255, 196, 120],
  cool: [150, 210, 255],
  fire: [255, 150, 70],
  violet: [205, 140, 255],
  white: [255, 255, 255],
  faint: [150, 150, 165]
}

/** Ambient light multiplied over the world: dim ≈ 50 % with a cool tint, night ≈ 30 % and blue. */
const AMBIENT: Record<'dim' | 'night', string> = { dim: 'rgb(112, 112, 146)', night: 'rgb(56, 66, 116)' }

export const LIGHT_SCALE = 4

interface Light {
  x: number
  y: number
  r: number
  c: LightColor
  a: number
}

interface Flash {
  x: number
  y: number
  r: number
  c: LightColor
  t0: number
  dur: number
}

export class Lighting {
  private readonly canvas = document.createElement('canvas')
  private readonly ctx = this.canvas.getContext('2d')!
  private readonly sprites = new Map<LightColor, HTMLCanvasElement>()
  private lights: Light[] = []
  private count = 0
  private flashes: Flash[] = []

  private sprite(c: LightColor): HTMLCanvasElement {
    let s = this.sprites.get(c)
    if (s) return s
    s = document.createElement('canvas')
    s.width = s.height = 64
    const g = s.getContext('2d')!
    const [r, gr, b] = RGB[c]
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    // A smooth, roughly gaussian falloff so pools never read as discs.
    for (const [k, a] of [
      [0, 1],
      [0.15, 0.9],
      [0.3, 0.68],
      [0.45, 0.45],
      [0.6, 0.26],
      [0.75, 0.12],
      [0.88, 0.04],
      [1, 0]
    ])
      grad.addColorStop(k, `rgba(${r},${gr},${b},${a})`)
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    this.sprites.set(c, s)
    return s
  }

  clear() {
    this.flashes.length = 0
  }

  /** Starts a frame's light list. */
  begin() {
    this.count = 0
  }

  add(x: number, y: number, r: number, c: LightColor, a = 1) {
    let l = this.lights[this.count]
    if (!l) this.lights[this.count] = l = { x, y, r, c, a }
    else (l.x = x), (l.y = y), (l.r = r), (l.c = c), (l.a = a)
    this.count++
  }

  /** A short burst of light (howls, explosions) that fades out over `dur` seconds. */
  flash(x: number, y: number, r: number, c: LightColor, t0: number, dur: number) {
    if (this.flashes.length > 24) this.flashes.shift()
    this.flashes.push({ x, y, r, c, t0, dur })
  }

  /** Multiplies the light map over `target` (the art-resolution world canvas whose top-left is ox, oy). */
  apply(
    target: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    mode: 'dim' | 'night',
    t: number
  ) {
    const k = LIGHT_SCALE
    const lw = Math.ceil(w / k) + 2
    const lh = Math.ceil(h / k) + 2
    if (this.canvas.width < lw || this.canvas.height < lh) {
      this.canvas.width = Math.max(this.canvas.width, lw)
      this.canvas.height = Math.max(this.canvas.height, lh)
    }
    const g = this.ctx
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.fillStyle = AMBIENT[mode]
    g.fillRect(0, 0, lw, lh)
    g.globalCompositeOperation = 'lighter'
    const put = (x: number, y: number, r: number, c: LightColor, a: number) => {
      const sx = (x - ox) / k
      const sy = (y - oy) / k
      const sr = r / k
      if (sx + sr < 0 || sy + sr < 0 || sx - sr > lw || sy - sr > lh || a <= 0.01) return
      g.globalAlpha = Math.min(1, a)
      g.drawImage(this.sprite(c), sx - sr, sy - sr, sr * 2, sr * 2)
    }
    for (let i = 0; i < this.count; i++) {
      const l = this.lights[i]
      put(l.x, l.y, l.r, l.c, l.a)
    }
    let keep = 0
    for (const f of this.flashes) {
      const p = (t - f.t0) / f.dur
      if (p >= 1 || p < -1) continue
      this.flashes[keep++] = f
      if (p >= 0) put(f.x, f.y, f.r * (0.7 + 0.3 * p), f.c, (1 - p) * (1 - p) * 1.2)
    }
    this.flashes.length = keep
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    // Multiply the (smoothly upscaled) light map over the world.
    const prevSmooth = target.imageSmoothingEnabled
    target.imageSmoothingEnabled = true
    target.globalCompositeOperation = 'multiply'
    target.drawImage(this.canvas, 0, 0, lw, lh, 0, 0, lw * k, lh * k)
    // Halos: warm sources bloom a little ('screen' never darkens).
    target.globalCompositeOperation = 'screen'
    for (let i = 0; i < this.count; i++) {
      const l = this.lights[i]
      if (l.c !== 'warm' && l.c !== 'fire' && l.c !== 'cool' && l.c !== 'violet') continue
      const r = l.r * (l.c === 'warm' ? 0.6 : 0.42)
      target.globalAlpha = (l.c === 'warm' ? 0.3 : 0.22) * l.a
      target.drawImage(this.sprite(l.c), l.x - ox - r, l.y - oy - r, r * 2, r * 2)
    }
    target.globalAlpha = 1
    target.globalCompositeOperation = 'source-over'
    target.imageSmoothingEnabled = prevSmooth
  }
}

/** A gentle, deterministic flame flicker factor around 1 for a light with a seed. */
export function flicker(t: number, seed: number, amount = 1): number {
  return (
    1 +
    amount *
      (0.045 * Math.sin(t * 13.1 + seed) + 0.03 * Math.sin(t * 7.7 + seed * 1.7) + 0.02 * Math.sin(t * 23 + seed * 0.3))
  )
}
