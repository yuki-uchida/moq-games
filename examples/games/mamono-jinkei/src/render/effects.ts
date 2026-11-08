/**
 * Transient visuals driven by events: pooled particles (typed arrays, no per-frame allocation), effect animations
 * from the fx sheet, damage numbers, plus the ambient meadow petals. All coordinates are world art pixels.
 */
import { canvasOf } from '../art/canvas'
import { anchorOf, duration, frameAt, textRaster, type Anim } from '../art/index'
import { blitAnim, findAnim } from './sprites'

export const PARTICLE_KINDS = [
  'dust',
  'leaf',
  'shard',
  'splash',
  'smoke',
  'spark',
  'feather',
  'rubble',
  'petal',
  'pollen',
  'drop',
  'chargeSpark',
  'mote',
  'debris'
] as const
export type ParticleKind = (typeof PARTICLE_KINDS)[number]
const KIND_INDEX = Object.fromEntries(PARTICLE_KINDS.map((k, i) => [k, i])) as Record<ParticleKind, number>

const MAX = 900
const RUBBLE = ['#8a7a68', '#6d604f', '#a89880', '#5a4e40']
const FEATHER = ['#f4f1ea', '#d9d2c4', '#bfb6a4']
const DROP = ['#9fd8f2', '#d8f2fb', '#6ab4dc']
const DEBRIS = ['#8a6a3a', '#5f7a3a', '#b89a62', '#4e3e2a']
const PETAL = ['#f7c6d9', '#fde3ec', '#fff3c4', '#f9b4c8']

export class Particles {
  readonly x = new Float32Array(MAX)
  readonly y = new Float32Array(MAX)
  readonly z = new Float32Array(MAX)
  readonly vx = new Float32Array(MAX)
  readonly vy = new Float32Array(MAX)
  readonly vz = new Float32Array(MAX)
  readonly age = new Float32Array(MAX)
  readonly life = new Float32Array(MAX)
  readonly kind = new Uint8Array(MAX)
  readonly seed = new Uint8Array(MAX)
  count = 0
  private anims: (Anim | undefined)[] = []

  constructor() {
    // Kinds with an fx-sheet animation use it; the rest (rubble, feather, drops, petals, pollen) are pixels.
    this.anims = PARTICLE_KINDS.map((k) => findAnim('fx', k === 'chargeSpark' ? 'spark' : k))
  }

  clear() {
    this.count = 0
  }

  spawn(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number) {
    let i = this.count
    if (i >= MAX) i = (Math.random() * MAX) | 0
    else this.count++
    this.x[i] = x
    this.y[i] = y
    this.z[i] = z
    this.vx[i] = vx
    this.vy[i] = vy
    this.vz[i] = vz
    this.age[i] = 0
    this.life[i] = life
    this.kind[i] = KIND_INDEX[kind]
    this.seed[i] = (Math.random() * 256) | 0
  }

  /** A burst event: n particles of a kind around (x, y). */
  burst(kind: string, x: number, y: number, n: number) {
    const k = (PARTICLE_KINDS as readonly string[]).includes(kind) ? (kind as ParticleKind) : 'dust'
    const count = Math.min(40, Math.max(1, n | 0))
    for (let j = 0; j < count; j++) {
      const a = Math.random() * Math.PI * 2
      const s = 30 + Math.random() * 90
      switch (k) {
        case 'dust':
          this.spawn(
            'dust',
            x + Math.cos(a) * 8,
            y + Math.sin(a) * 4,
            2,
            Math.cos(a) * s * 0.5,
            Math.sin(a) * s * 0.25,
            10,
            0.4 + Math.random() * 0.2
          )
          break
        case 'smoke':
          this.spawn('smoke', x + Math.cos(a) * 10, y, 4, Math.cos(a) * 20, -6, 18, 0.6 + Math.random() * 0.3)
          break
        case 'splash':
          this.spawn('drop', x, y, 4, Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.3, 90 + Math.random() * 80, 0.7)
          break
        case 'spark':
          this.spawn(
            'spark',
            x,
            y,
            10,
            Math.cos(a) * s * 1.2,
            Math.sin(a) * s * 0.7,
            40 + Math.random() * 60,
            0.35 + Math.random() * 0.25
          )
          break
        case 'feather':
          this.spawn('feather', x, y, 20, Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.2, 30 + Math.random() * 30, 1.4)
          break
        default:
          // leaf, shard, rubble: tossed up with gravity.
          this.spawn(
            k,
            x,
            y,
            6,
            Math.cos(a) * s,
            Math.sin(a) * s * 0.5,
            80 + Math.random() * 110,
            0.8 + Math.random() * 0.4
          )
      }
    }
  }

  update(dt: number) {
    let n = this.count
    for (let i = 0; i < n; i++) {
      this.age[i] += dt
      if (this.age[i] >= this.life[i]) {
        n--
        this.copy(n, i)
        i--
        continue
      }
      const k = PARTICLE_KINDS[this.kind[i]]
      const grav =
        k === 'feather' || k === 'petal'
          ? 30
          : k === 'pollen' || k === 'smoke' || k === 'chargeSpark'
            ? -8
            : k === 'dust' || k === 'mote' || k === 'debris'
              ? 0
              : 380
      this.vz[i] -= grav * dt
      if (k === 'mote') this.vx[i] += Math.sin(this.age[i] * 1.3 + this.seed[i]) * 6 * dt
      if (k === 'feather' || k === 'petal') {
        this.vz[i] = Math.max(this.vz[i], -18)
        this.vx[i] += Math.sin(this.age[i] * 4 + this.seed[i]) * 30 * dt
      }
      const drag = k === 'dust' || k === 'smoke' ? 3 : k === 'spark' ? 2 : k === 'debris' || k === 'mote' ? 0 : 0.6
      this.vx[i] -= this.vx[i] * drag * dt
      this.vy[i] -= this.vy[i] * drag * dt
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt
      this.z[i] += this.vz[i] * dt
      if (this.z[i] < 0) {
        this.z[i] = 0
        if (k === 'rubble' || k === 'shard' || k === 'leaf') {
          this.vz[i] = -this.vz[i] * 0.35
          this.vx[i] *= 0.6
          this.vy[i] *= 0.6
        } else this.vz[i] = 0
      }
    }
    this.count = n
  }

  private copy(from: number, to: number) {
    this.x[to] = this.x[from]
    this.y[to] = this.y[from]
    this.z[to] = this.z[from]
    this.vx[to] = this.vx[from]
    this.vy[to] = this.vy[from]
    this.vz[to] = this.vz[from]
    this.age[to] = this.age[from]
    this.life[to] = this.life[from]
    this.kind[to] = this.kind[from]
    this.seed[to] = this.seed[from]
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
    for (let i = 0; i < this.count; i++) {
      const x = Math.round(this.x[i] - ox)
      const y = Math.round(this.y[i] - this.z[i] - oy)
      if (x < -24 || y < -24 || x > w + 24 || y > h + 24) continue
      const k = this.kind[i]
      const kind = PARTICLE_KINDS[k]
      const p = this.age[i] / this.life[i]
      const anim = this.anims[k]
      const fade = p > 0.7 ? (1 - p) / 0.3 : 1
      if (anim) {
        // One-shot anims (dust, smoke) play over the life; loops spin at their own fps.
        const t = anim.loop ? this.age[i] + this.seed[i] / 40 : p * duration(anim)
        const f = frameAt(anim, t)
        const c = canvasOf(anim.frames[f])
        const [ax, ay] = anchorOf(anim)
        ctx.globalAlpha = anim.loop ? fade : 1
        ctx.drawImage(c, x - ax, y - ay)
        continue
      }
      const s = this.seed[i]
      ctx.globalAlpha = fade
      if (kind === 'rubble') {
        ctx.fillStyle = RUBBLE[s & 3]
        const size = 2 + (s & 3)
        ctx.fillRect(x - 1, y - 1, size, size - 1)
      } else if (kind === 'feather') {
        ctx.fillStyle = FEATHER[s % 3]
        ctx.fillRect(x - 2, y, 5, 2)
        ctx.fillRect(x - 1, y - 1, 3, 1)
      } else if (kind === 'drop') {
        ctx.fillStyle = DROP[s % 3]
        ctx.fillRect(x, y, 2, 2)
      } else if (kind === 'petal') {
        ctx.fillStyle = PETAL[s & 3]
        const flip = Math.sin(this.age[i] * 5 + s) > 0
        ctx.fillRect(x, y, flip ? 3 : 2, flip ? 2 : 3)
      } else if (kind === 'mote') {
        // Dust motes twinkle as they drift through lamp light.
        ctx.globalAlpha = fade * Math.min(1, p * 4) * (0.35 + 0.35 * Math.sin(this.age[i] * 2.3 + s))
        ctx.fillStyle = '#fff2d0'
        ctx.fillRect(x, y, 1, 1)
      } else if (kind === 'debris') {
        // Half foam streaks along the flow, half floating bits of straw and leaf.
        ctx.globalAlpha = fade * Math.min(1, p * 5)
        const along = Math.abs(this.vx[i]) >= Math.abs(this.vy[i])
        if (s & 1) {
          ctx.globalAlpha *= 0.75
          ctx.fillStyle = '#e8fbff'
          if (along) ctx.fillRect(x - 2, y, 5, 1)
          else ctx.fillRect(x, y - 2, 1, 5)
        } else {
          ctx.fillStyle = DEBRIS[(s >> 1) & 3]
          if (along) ctx.fillRect(x - 1, y, 4, 2)
          else ctx.fillRect(x, y - 1, 2, 4)
        }
      } else if (kind === 'pollen') {
        ctx.globalAlpha = fade * (0.5 + 0.5 * Math.sin(this.age[i] * 3 + s))
        ctx.fillStyle = '#fff6c8'
        ctx.fillRect(x, y, 1, 1)
      } else {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x, y, 2, 2)
      }
    }
    ctx.globalAlpha = 1
  }
}

interface FxInstance {
  anim: Anim
  x: number
  y: number
  t0: number
  flip: boolean
  alpha: number
}

/** One-shot effect animations from the fx sheet. */
export class FxAnims {
  private list: FxInstance[] = []

  clear() {
    this.list.length = 0
  }

  add(anim: Anim, x: number, y: number, now: number, flip = false, alpha = 1) {
    if (this.list.length > 120) this.list.shift()
    this.list.push({ anim, x, y, t0: now, flip, alpha })
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, now: number) {
    let keep = 0
    for (const f of this.list) {
      const t = now - f.t0
      if (t > duration(f.anim) + 0.02 || t < -1) continue
      this.list[keep++] = f
      blitAnim(ctx, f.anim, t, f.x - ox, f.y - oy, f.flip, f.alpha)
    }
    this.list.length = keep
  }
}

interface Num {
  canvas: HTMLCanvasElement
  x: number
  y: number
  t0: number
  vx: number
  big: boolean
}

/** Rising damage / heal numbers in the bitmap font. */
export class Numbers {
  private list: Num[] = []

  clear() {
    this.list.length = 0
  }

  add(text: string, style: 'damage' | 'crit' | 'heal' | 'warn', x: number, y: number, now: number) {
    const r = textRaster(text, style)
    if (!r) return false
    if (this.list.length > 60) this.list.shift()
    this.list.push({ canvas: canvasOf(r), x, y, t0: now, vx: (Math.random() - 0.5) * 24, big: style === 'crit' })
    return true
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, now: number) {
    let keep = 0
    for (const n of this.list) {
      const t = now - n.t0
      if (t > 0.9 || t < -1) continue
      this.list[keep++] = n
      // Pop up fast, hang, then fade.
      const rise = t < 0.18 ? (t / 0.18) * 16 : 16 + (t - 0.18) * 10
      const k = n.big ? 2 : 1
      const pop = t < 0.08 ? 1.4 : 1
      const w = n.canvas.width * k * pop
      const h = n.canvas.height * k * pop
      ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.3 : 1
      ctx.drawImage(
        n.canvas,
        Math.round(n.x + n.vx * t - ox - w / 2),
        Math.round(n.y - rise - oy - h),
        Math.round(w),
        Math.round(h)
      )
    }
    ctx.globalAlpha = 1
    this.list.length = keep
  }
}
