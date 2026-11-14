/**
 * The particle pool: sprite particles from the `fx` sheet with position, velocity, gravity, drag, lifetime and
 * clip. View randomness only (never the sim's Rng). Particles keep playing while the view is frozen (hit-stop).
 */
import { FX_SPEC } from '../art/contract'
import { blit, brush, clip } from './bake'

/** Every clip of the `fx` sheet (`tests/view-fx.test.ts` checks this list against the contract). */
export const FX_NAMES = [
  'dust',
  'puff',
  'smoke',
  'spark',
  'star',
  'shine',
  'sparkle',
  'chomp',
  'ring',
  'boom',
  'glow',
  'leaf',
  'needle',
  'chip',
  'clod',
  'shard',
  'drop',
  'splash',
  'bubble',
  'gush',
  'honey',
  'feather',
  'heart',
  'confettiA',
  'confettiB',
  'confettiC',
  'zzz',
  'alert',
  'anger',
  'sweat',
  'dizzy',
  'arrow'
] as const
export type FxName = (typeof FX_NAMES)[number]

/** Where a particle is drawn: with the world (behind water) or in front of the water. */
export type FxLayer = 'world' | 'front'

export interface SpawnOptions {
  vx?: number
  vy?: number
  /** Downward acceleration in px/s². */
  gravity?: number
  /** Velocity damping per second (0 = none). */
  drag?: number
  /** Seconds; defaults to one pass of the clip (looping clips: 0.8 s). */
  life?: number
  /** Playback speed of the clip. */
  rate?: number
  flip?: boolean
  layer?: FxLayer
  /** Fade out over the last part of the life (default for looping clips). */
  fade?: boolean
  /** Delay before it appears, in seconds. */
  delay?: number
  alpha?: number
}

export interface BurstOptions extends Omit<SpawnOptions, 'vx' | 'vy' | 'life'> {
  /** Speed range in px/s. */
  speed?: [number, number]
  /** Direction range in radians (0 = right, −π/2 = up). */
  angle?: [number, number]
  life?: [number, number]
  /** Random offset of the start position, in px. */
  spread?: number
}

interface Particle {
  name: FxName
  x: number
  y: number
  vx: number
  vy: number
  gravity: number
  drag: number
  age: number
  life: number
  rate: number
  flip: boolean
  layer: FxLayer
  fade: boolean
  delay: number
  alpha: number
}

const POOL = 480

export class FxPool {
  private items: Particle[] = []
  private free: Particle[] = []
  /** View-only random stream. */
  rand: () => number

  constructor(seed = 1) {
    let state = seed >>> 0 || 1
    this.rand = () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  get count() {
    return this.items.length
  }

  spawn(name: FxName, x: number, y: number, o: SpawnOptions = {}) {
    const spec = FX_SPEC[name]
    if (!spec) return
    if (this.items.length >= POOL) this.free.push(this.items.shift()!)
    const p = this.free.pop() ?? ({} as Particle)
    const rate = o.rate ?? 1
    p.name = name
    p.x = x
    p.y = y
    p.vx = o.vx ?? 0
    p.vy = o.vy ?? 0
    p.gravity = o.gravity ?? 0
    p.drag = o.drag ?? 0
    p.rate = rate
    p.life = o.life ?? (spec.loop ? 0.8 : spec.frames / spec.fps / rate)
    p.age = 0
    p.flip = o.flip ?? false
    p.layer = o.layer ?? 'world'
    p.fade = o.fade ?? spec.loop
    p.delay = o.delay ?? 0
    p.alpha = o.alpha ?? 1
    this.items.push(p)
  }

  /** `count` particles with random speed, direction and life within the given ranges. */
  burst(name: FxName, x: number, y: number, count: number, o: BurstOptions = {}) {
    const r = this.rand
    const [s0, s1] = o.speed ?? [40, 120]
    const [a0, a1] = o.angle ?? [-Math.PI, Math.PI]
    for (let i = 0; i < count; i++) {
      const a = a0 + (a1 - a0) * r()
      const s = s0 + (s1 - s0) * r()
      const spread = o.spread ?? 0
      this.spawn(name, x + (r() * 2 - 1) * spread, y + (r() * 2 - 1) * spread, {
        ...o,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: o.life ? o.life[0] + (o.life[1] - o.life[0]) * r() : undefined,
        flip: o.flip ?? r() < 0.5
      })
    }
  }

  update(dt: number) {
    let write = 0
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i]
      if (p.delay > 0) {
        p.delay -= dt
        this.items[write++] = p
        continue
      }
      p.age += dt
      if (p.age >= p.life) {
        this.free.push(p)
        continue
      }
      p.vy += p.gravity * dt
      if (p.drag) {
        const d = Math.exp(-p.drag * dt)
        p.vx *= d
        p.vy *= d
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      this.items[write++] = p
    }
    this.items.length = write
  }

  draw(ctx: CanvasRenderingContext2D, layer: FxLayer) {
    for (const p of this.items) {
      if (p.layer !== layer || p.delay > 0) continue
      const anim = clip('fx', p.name)
      if (!anim) continue
      let alpha = p.alpha
      if (p.fade) alpha *= Math.min(1, (p.life - p.age) / Math.min(0.3, p.life * 0.5))
      blit(ctx, anim, p.age * p.rate, p.x, p.y, brush(p.flip, alpha))
    }
  }

  clear() {
    this.free.push(...this.items)
    this.items.length = 0
  }
}
