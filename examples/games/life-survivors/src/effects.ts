import { ENEMIES, TAG_COLORS, WEAPONS } from './data'
import { FX, FX_STRIDE } from './fx'
import { GAMBLE_FORMS } from './weapon-life'

/**
 * The "juice" of the renderer, kept free of canvas and DOM so it can be unit tested: the exactly-once fx feed,
 * the trauma (screen shake) model, a pooled particle list and the recipes that turn fx events into particles.
 * The renderer only draws what lives here.
 */

/** Hard cap of live particles. */
export const PARTICLE_CAP = 700

/** Hands out each fx event of a snapshot sequence exactly once, by `seq`. */
export class FxFeed {
  /** Highest seq already handed out. */
  last = -1
  private lastTime = 0
  private readonly picked: number[] = []

  /** Start indices (into `fx`, stride FX_STRIDE) of the events not seen yet, oldest first. Reused array. */
  take(fx: number[], time?: number) {
    const picked = this.picked
    picked.length = 0
    // A clock that jumped back means a new game started: its seqs begin again.
    if (time !== undefined) {
      if (time < this.lastTime - 1) this.last = -1
      this.lastTime = time
    }
    const n = fx.length
    if (!n) return picked
    const newest = fx[n - FX_STRIDE]
    if (newest < this.last) this.last = -1
    for (let i = 0; i < n; i += FX_STRIDE) if (fx[i] > this.last) picked.push(i)
    if (newest > this.last) this.last = newest
    return picked
  }
}

/** Screen shake as "trauma" in 0..1: the visible shake grows with its square and trauma drains away. */
export class Trauma {
  value = 0
  constructor(private readonly drain = 1.4) {}
  /** Adds trauma (saturating at 1). */
  add(amount: number) {
    this.value = Math.min(1, this.value + amount)
  }
  /** Lifts trauma to at least `amount` without stacking (for effects that may be seen on several frames). */
  atLeast(amount: number) {
    this.value = Math.min(1, Math.max(this.value, amount))
  }
  update(dt: number) {
    this.value = Math.max(0, this.value - dt * this.drain)
  }
  /** 0..1 shake strength. */
  get shake() {
    return this.value * this.value
  }
}

/** Particle kinds (what the renderer draws). */
export const PK = { debris: 0, sprite: 1, ring: 2, glow: 3, rays: 4, pillar: 5, pop: 6, warn: 7 } as const

export interface Particle {
  kind: number
  /** 0 = on the ground (under characters), 1 = on top. */
  layer: number
  x: number
  y: number
  vx: number
  vy: number
  /** Gravity / downward acceleration. */
  ay: number
  age: number
  life: number
  /** Seconds before it starts to exist. */
  delay: number
  /** debris: px; sprite: scale; ring/glow/rays/warn: end radius; pillar: width; pop: elite scale. */
  size: number
  /** ring: start radius; glow/rays: fade shape; sprite: growth (extra scale at the end of life). */
  size2: number
  /** ring line width; rays length. */
  width: number
  rot: number
  spin: number
  alpha: number
  color: string
  /** fx sprite name (sprite) */
  spr: string
  /** ring flatten (1 = circle); pop: enemy index */
  n: number
  /** sprite plays once over its life (true) or loops (false). */
  once: boolean
  /** Fade out toward the end of life. */
  fade: boolean
  /** Additive blending. */
  add: boolean
}

const blank = (): Particle => ({
  kind: 0,
  layer: 1,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  ay: 0,
  age: 0,
  life: 1,
  delay: 0,
  size: 1,
  size2: 0,
  width: 2,
  rot: 0,
  spin: 0,
  alpha: 1,
  color: '#fff',
  spr: '',
  n: 1,
  once: false,
  fade: true,
  add: false
})

/** A capped, recycling particle list. */
export class ParticlePool {
  readonly items: Particle[] = []
  private readonly spare: Particle[] = []
  constructor(readonly cap = PARTICLE_CAP) {}

  get live() {
    return this.items.length
  }

  /** A fresh particle, or undefined when the cap is reached (`important` evicts the oldest debris instead). */
  spawn(kind: number, x: number, y: number, life: number, important = false) {
    if (this.items.length >= this.cap) {
      if (!important) return undefined
      const victim = this.items.findIndex((p) => p.kind === PK.debris)
      if (victim < 0) return undefined
      this.recycle(victim)
    }
    const p = this.spare.pop() ?? blank()
    p.kind = kind
    p.layer = 1
    p.x = x
    p.y = y
    p.vx = p.vy = p.ay = 0
    p.age = 0
    p.life = life
    p.delay = 0
    p.size = 1
    p.size2 = 0
    p.width = 2
    p.rot = p.spin = 0
    p.alpha = 1
    p.color = '#fff'
    p.spr = ''
    p.n = 1
    p.once = false
    p.fade = true
    p.add = false
    this.items.push(p)
    return p
  }

  private recycle(i: number) {
    const items = this.items
    const p = items[i]
    items[i] = items[items.length - 1]
    items.pop()
    this.spare.push(p)
  }

  update(dt: number) {
    const items = this.items
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i]
      if (p.delay > 0) {
        p.delay -= dt
        continue
      }
      p.age += dt
      if (p.age >= p.life) {
        this.recycle(i)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.ay * dt
      p.rot += p.spin * dt
    }
  }

  clear() {
    while (this.items.length) this.recycle(this.items.length - 1)
  }
}

/** A screen-wide flash: `full` tints everything, `edge` only the borders (a hit). */
export interface Flash {
  kind: 'full' | 'edge'
  rgb: string
  alpha: number
  decay: number
}

/** What the recipes need to know about the viewer. */
export interface FxView {
  /** Index of the local player in view.players, or -1. */
  local: number
  /** Local player position (for distance based shake). */
  px: number
  py: number
  /** Camera centre and half extents of what is on screen. */
  cx: number
  cy: number
  hw: number
  hh: number
}

/** "#rrggbb" lightened (amount > 0, toward white) or darkened (amount < 0, toward black). */
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

const GOLD = '#ffd75e'
const PALE_GOLD = '#fff2b0'

/** Particles, shake and flashes driven by fx events. */
export class Effects {
  readonly feed = new FxFeed()
  readonly pool = new ParticlePool()
  readonly trauma = new Trauma()
  readonly flashes: Flash[] = []
  /** Multiplier on shake and flashes (prefers-reduced-motion). */
  motion = 1

  constructor(private readonly rand: () => number = Math.random) {}

  /** Processes the events of a snapshot that were not seen yet. Returns how many were new. */
  consume(fx: number[], time: number, view: FxView) {
    const fresh = this.feed.take(fx, time)
    for (const i of fresh) this.handle(fx[i + 1], fx[i + 2], fx[i + 3], fx[i + 4], fx[i + 5], view)
    return fresh.length
  }

  update(dt: number) {
    this.pool.update(dt)
    this.trauma.update(dt)
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]
      f.alpha -= f.decay * dt
      if (f.alpha <= 0) this.flashes.splice(i, 1)
    }
  }

  /** Shake offset in world px for this frame. */
  shakeOffset(out: { x: number; y: number }) {
    const s = this.trauma.shake * 14 * this.motion
    out.x = s ? (this.rand() * 2 - 1) * s : 0
    out.y = s ? (this.rand() * 2 - 1) * s : 0
    return out
  }

  flash(kind: Flash['kind'], rgb: string, alpha: number, decay: number) {
    if (this.flashes.length > 5) this.flashes.shift()
    this.flashes.push({ kind, rgb, alpha: alpha * (this.motion < 1 ? 0.4 : 1), decay })
  }

  reset() {
    this.pool.clear()
    this.flashes.length = 0
    this.trauma.value = 0
    this.feed.last = -1
  }

  // -------------------------------------------------------------------------------------------
  // Recipes.

  private r(lo: number, hi: number) {
    return lo + (hi - lo) * this.rand()
  }

  private onScreen(x: number, y: number, v: FxView, margin = 100) {
    return Math.abs(x - v.cx) < v.hw + margin && Math.abs(y - v.cy) < v.hh + margin
  }

  /** A burst of pixel chunks. */
  debris(
    x: number,
    y: number,
    count: number,
    colors: string[],
    o: {
      speed?: number
      up?: number
      gravity?: number
      life?: number
      size?: number
      spread?: number
      delay?: number
    } = {}
  ) {
    const load = this.pool.live / this.pool.cap
    if (load > 0.8) return
    if (load > 0.6) count = Math.ceil(count / 2)
    const speed = o.speed ?? 140
    for (let i = 0; i < count; i++) {
      const p = this.pool.spawn(PK.debris, x + this.r(-3, 3), y + this.r(-3, 3), this.r(0.45, 0.85) * (o.life ?? 1))
      if (!p) return
      const a = this.r(0, Math.PI * 2)
      const s = this.r(0.35, 1) * speed
      p.vx = Math.cos(a) * s * (o.spread ?? 1)
      p.vy = Math.sin(a) * s * 0.7 - (o.up ?? 70) * this.r(0.5, 1)
      p.ay = o.gravity ?? 520
      p.size = (o.size ?? 3) + (this.rand() < 0.3 ? 1 : 0)
      p.color = colors[Math.floor(this.rand() * colors.length)]
      p.delay = o.delay ?? 0
    }
  }

  sprite(
    name: string,
    x: number,
    y: number,
    o: {
      life?: number
      scale?: number
      grow?: number
      vx?: number
      vy?: number
      ay?: number
      once?: boolean
      delay?: number
      layer?: number
      alpha?: number
      fade?: boolean
      important?: boolean
    } = {}
  ) {
    const p = this.pool.spawn(PK.sprite, x, y, o.life ?? 0.4, o.important)
    if (!p) return undefined
    p.spr = name
    p.size = o.scale ?? 1
    p.size2 = o.grow ?? 0
    p.vx = o.vx ?? 0
    p.vy = o.vy ?? 0
    p.ay = o.ay ?? 0
    p.once = o.once ?? true
    p.delay = o.delay ?? 0
    p.layer = o.layer ?? 1
    p.alpha = o.alpha ?? 1
    p.fade = o.fade ?? true
    return p
  }

  ring(
    x: number,
    y: number,
    r0: number,
    r1: number,
    life: number,
    color: string,
    o: { width?: number; flat?: number; layer?: number; delay?: number; alpha?: number } = {}
  ) {
    const p = this.pool.spawn(PK.ring, x, y, life, true)
    if (!p) return
    p.size2 = r0
    p.size = r1
    p.color = color
    p.width = o.width ?? 3
    p.n = o.flat ?? 1
    p.layer = o.layer ?? 1
    p.delay = o.delay ?? 0
    p.alpha = o.alpha ?? 1
  }

  glow(
    x: number,
    y: number,
    radius: number,
    life: number,
    color: string,
    o: { alpha?: number; delay?: number; layer?: number } = {}
  ) {
    const p = this.pool.spawn(PK.glow, x, y, life, true)
    if (!p) return
    p.size = radius
    p.color = color
    p.alpha = o.alpha ?? 0.8
    p.delay = o.delay ?? 0
    p.layer = o.layer ?? 1
    p.add = true
  }

  rays(x: number, y: number, count: number, length: number, life: number, color: string, alpha = 0.5) {
    const p = this.pool.spawn(PK.rays, x, y, life, true)
    if (!p) return
    p.n = count
    p.size = length
    p.color = color
    p.alpha = alpha
    p.rot = this.r(0, Math.PI)
    p.spin = this.r(-0.8, 0.8)
    p.add = true
  }

  /** An enemy's flash frame squashing out of existence. */
  pop(x: number, y: number, enemy: number, elite: boolean, life: number) {
    const p = this.pool.spawn(PK.pop, x, y, life, true)
    if (!p) return
    p.n = enemy
    p.size = elite ? 1.25 : 1
  }

  private addTrauma(amount: number) {
    this.trauma.add(amount)
  }

  handle(type: number, x: number, y: number, a: number, b: number, v: FxView) {
    switch (type) {
      case FX.GAMBLE:
        if (GAMBLE_FORMS[a] && this.onScreen(x, y, v))
          this.sprite(`gamble_${GAMBLE_FORMS[a].key}`, x + 60, y - 55, { life: 1.2, scale: 1.5, important: true })
        break
      case FX.KILL: {
        const def = ENEMIES[a]
        if (!def || !this.onScreen(x, y, v)) break
        const elite = (b & 1) === 1
        const r = def.radius * (elite ? 1.25 : 1)
        const base = TAG_COLORS[def.tag]
        this.pop(x, y, a, elite, 0.18)
        this.sprite('poof', x, y - r * 0.1, { life: 0.3, scale: Math.max(1, Math.round((r / 9) * 2) / 2), fade: false })
        const colors = [base, base, shade(base, 0.35), shade(base, -0.3), '#ffffff']
        this.debris(x, y, elite ? 16 : 6 + (r >= 17 ? 2 : 0) + (r >= 20 ? 2 : 0), colors, {
          speed: elite ? 200 : 150,
          size: elite ? 4 : 3
        })
        if (elite) {
          this.sprite('boom', x, y, { life: 0.34, scale: 1, important: true })
          this.ring(x, y, r * 0.5, r * 3, 0.4, GOLD, { width: 3 })
          for (let i = 0; i < 4; i++)
            this.sprite('shine', x + this.r(-r, r), y + this.r(-r, r * 0.4), {
              life: 0.6,
              scale: 1.5,
              vy: -this.r(20, 50),
              once: false
            })
        }
        break
      }
      case FX.HIT: {
        if (!this.onScreen(x, y, v, 40)) break
        if (b & 2) {
          this.sprite('crit', x, y, { life: 0.22, scale: 1.4 })
          this.debris(x, y, 3, ['#fff', GOLD, '#ff9a4a'], { speed: 120, size: 2, life: 0.6 })
        } else this.sprite('spark', x, y, { life: 0.15, scale: b & 1 ? 1.35 : 1 })
        break
      }
      case FX.BLAST: {
        if (!this.onScreen(x, y, v, a)) break
        const weapon = WEAPONS[b]
        const color = weapon?.color ?? GOLD
        const slam = weapon?.behavior === 'slam'
        if (!slam) {
          // Never blow one boom up past 2× (chunky pixels): wider blasts are a cluster of booms instead.
          const scale = Math.min(2, Math.max(1, Math.round(((a * 2 * 0.6) / 48) * 2) / 2))
          this.sprite('boom', x, y, { life: 0.34, scale, important: true })
          const extra = a > 70 ? Math.min(5, Math.round(a / 28)) : 0
          for (let i = 0; i < extra; i++) {
            const ang = (i / extra) * Math.PI * 2 + this.r(0, 1)
            const d = a * this.r(0.35, 0.65)
            this.sprite('boom', x + Math.cos(ang) * d, y + Math.sin(ang) * d, {
              life: 0.32,
              scale: this.r(1, 1.5),
              delay: 0.04 + i * 0.03,
              important: true
            })
          }
        }
        this.ring(x, y, a * 0.25, a * 1.05, 0.38, '#ffffff', { width: 4 })
        this.ring(x, y, a * 0.1, a * 0.9, 0.5, color, { width: 3, delay: 0.04 })
        this.debris(x, y, slam ? 12 : 10, [color, shade(color, 0.4), shade(color, -0.3), '#fff'], {
          speed: 70 + a * 1.6,
          size: 3,
          up: 120
        })
        const puffs = slam ? 10 : 5
        for (let i = 0; i < puffs; i++) {
          const ang = (i / puffs) * Math.PI * 2 + this.r(-0.2, 0.2)
          this.sprite('dust', x + Math.cos(ang) * a * 0.6, y + Math.sin(ang) * a * 0.6, {
            life: 0.5,
            scale: 1.4,
            vx: Math.cos(ang) * 60,
            vy: Math.sin(ang) * 60 - 14,
            delay: 0.03
          })
        }
        const d = Math.hypot(x - v.px, y - v.py)
        if (v.local >= 0 && d < 420) this.addTrauma((slam ? 0.3 : 0.22) * (1 - d / 520))
        break
      }
      case FX.HURT: {
        this.sprite('spark', x, y - 10, { life: 0.16, scale: 1.4 })
        this.debris(x, y - 8, 5, ['#ff5d73', '#ff9aa6', '#ffffff'], { speed: 120, size: 3, life: 0.7 })
        if (a === v.local) {
          this.addTrauma(0.22 + Math.min(0.18, b / 120))
          this.flash('edge', '255,40,60', 0.6, 2.2)
        }
        break
      }
      case FX.LEVELUP: {
        // The gameplay shockwave (radius 190) as a golden ring, with a light pillar and sparkles.
        this.ring(x, y + 6, 14, 190, 0.6, GOLD, { width: 5, flat: 0.8 })
        this.ring(x, y + 6, 8, 160, 0.5, '#ffffff', { width: 2, flat: 0.8, delay: 0.05 })
        this.glow(x, y, 70, 0.6, GOLD, { layer: 0 })
        const pillar = this.pool.spawn(PK.pillar, x, y + 14, 1, true)
        if (pillar) {
          pillar.layer = 0
          pillar.size = 30
          pillar.color = GOLD
          pillar.width = 300
          pillar.add = true
        }
        for (let i = 0; i < 10; i++)
          this.sprite('shine', x + this.r(-22, 22), y + this.r(-6, 18), {
            life: this.r(0.6, 1),
            scale: 1.5,
            vy: -this.r(50, 120),
            once: false,
            delay: this.r(0, 0.3)
          })
        if (b === v.local) this.addTrauma(0.12)
        break
      }
      case FX.EVOLVE: {
        this.glow(x, y, 110, 0.7, GOLD, { alpha: 1 })
        this.ring(x, y, 10, 130, 0.6, GOLD, { width: 4 })
        this.ring(x, y, 6, 90, 0.5, '#ffffff', { width: 2, delay: 0.06 })
        this.rays(x, y, 12, 120, 0.7, PALE_GOLD)
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2 + this.r(-0.15, 0.15)
          const s = this.r(80, 190)
          this.sprite('star', x, y - 6, {
            life: this.r(0.6, 0.95),
            scale: 1.8,
            vx: Math.cos(ang) * s,
            vy: Math.sin(ang) * s * 0.8,
            ay: 90,
            once: false
          })
        }
        if (b === v.local) {
          this.addTrauma(0.45)
          this.flash('full', '255,214,100', 0.32, 1.6)
        }
        break
      }
      case FX.CHEST: {
        const big = a >= 3
        this.glow(x, y, big ? 120 : 80, 0.8, GOLD)
        this.rays(x, y, big ? 16 : 10, big ? 130 : 90, 0.9, PALE_GOLD)
        this.ring(x, y, 8, big ? 100 : 70, 0.5, GOLD, { width: 3 })
        const n = big ? 12 : 8
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2
          const s = this.r(60, 150)
          this.sprite('shine', x, y - 4, {
            life: this.r(0.5, 0.9),
            scale: 1.7,
            vx: Math.cos(ang) * s,
            vy: Math.sin(ang) * s * 0.8 - 30,
            ay: 60,
            once: false
          })
        }
        break
      }
      case FX.GEM: {
        if (this.pool.live > this.pool.cap * 0.7) break
        const n = 1 + (a > 6 ? 1 : 0) + (a > 14 ? 1 : 0)
        for (let i = 0; i < n; i++)
          this.sprite('shine', x + this.r(-12, 12), y + this.r(-16, 0), {
            life: 0.45,
            scale: 1.3,
            vy: -this.r(30, 60),
            once: false
          })
        break
      }
      case FX.ITEM: {
        if (a === 0) {
          this.glow(x, y, 50, 0.6, '#7be495', { alpha: 0.6 })
          for (let i = 0; i < 5; i++)
            this.sprite('heal', x + this.r(-14, 14), y + this.r(-6, 10), {
              life: this.r(0.7, 1.1),
              scale: 1.6,
              vy: -this.r(35, 60),
              once: false,
              delay: i * 0.06
            })
        } else if (a === 2) {
          this.ring(x, y, 12, 340, 0.7, '#6fd6ff', { width: 5, flat: 0.8 })
          this.ring(x, y, 8, 300, 0.6, '#ffffff', { width: 2, flat: 0.8, delay: 0.1 })
          this.glow(x, y, 90, 0.5, '#6fd6ff')
        }
        break
      }
      case FX.BOSS_SPAWN: {
        const def = ENEMIES[a]
        const radius = def?.radius ?? 36
        const warn = this.pool.spawn(PK.warn, x, y + radius * 0.8, 1.7, true)
        if (warn) {
          warn.size = radius * 2.4
          warn.layer = 0
          warn.color = '#ff3b4a'
        }
        this.ring(x, y + radius * 0.8, 20, 240, 0.8, '#ff5d73', { width: 4, flat: 0.55, layer: 0 })
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2
          this.sprite('dust', x + Math.cos(ang) * radius, y + radius * 0.7 + Math.sin(ang) * radius * 0.4, {
            life: 0.7,
            scale: 1.5,
            vx: Math.cos(ang) * 50,
            vy: -this.r(10, 30),
            delay: this.r(0, 0.2)
          })
        }
        this.addTrauma(0.5)
        break
      }
      case FX.BOSS_KILL: {
        const def = ENEMIES[a]
        const radius = def?.radius ?? 36
        const base = def ? TAG_COLORS[def.tag] : GOLD
        this.pop(x, y, a, false, 0.5)
        for (let i = 0; i < 9; i++) {
          const ang = this.r(0, Math.PI * 2)
          const d = this.r(0, radius * 1.3)
          this.sprite('boom', x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.8 - radius * 0.4, {
            life: 0.38,
            scale: this.r(1.2, 2),
            delay: (i / 9) * 0.7,
            important: true
          })
        }
        this.debris(x, y, 40, [base, shade(base, 0.4), shade(base, -0.3), '#ffffff', GOLD], {
          speed: 300,
          up: 150,
          size: 3,
          life: 1.2
        })
        this.rays(x, y, 14, 170, 1, '#ffffff', 0.6)
        this.ring(x, y, 20, 320, 0.75, '#ffffff', { width: 5 })
        this.ring(x, y, 10, 240, 0.7, GOLD, { width: 3, delay: 0.1 })
        this.glow(x, y, 150, 0.9, '#ffffff', { alpha: 1 })
        for (let i = 0; i < 10; i++)
          this.sprite('shine', x + this.r(-radius, radius), y + this.r(-radius, radius * 0.4), {
            life: this.r(0.7, 1.2),
            scale: 2,
            vy: -this.r(20, 70),
            once: false,
            delay: this.r(0.1, 0.7)
          })
        this.addTrauma(1)
        this.flash('full', '255,255,255', 0.6, 1.5)
        break
      }
      case FX.DOWN: {
        this.sprite('poof', x, y, { life: 0.3, scale: 1.5, fade: false })
        this.ring(x, y, 8, 80, 0.5, '#b8b4c4', { width: 3 })
        this.debris(x, y, 14, ['#9a96a8', '#c9c5d6', '#6f6b7e', '#ffffff'], { speed: 140, size: 3, life: 1.1 })
        if (a === v.local) this.addTrauma(0.3)
        break
      }
      case FX.PARENT_DEATH: {
        this.ring(x, y, 12, 90, 1.8, '#c7d9ef', { width: 2 })
        for (let i = 0; i < 8; i++)
          this.sprite('shine', x + this.r(-24, 24), y - 10, {
            life: 2.4,
            scale: 1.2,
            vy: -24,
            delay: i * 0.12,
            once: false
          })
        break
      }
      case FX.REVIVE: {
        this.ring(x, y, 10, 100, 0.65, '#7be495', { width: 4 })
        this.glow(x, y, 70, 0.6, '#7be495')
        for (let i = 0; i < 6; i++)
          this.sprite(i % 2 ? 'shine' : 'heal', x + this.r(-18, 18), y + this.r(-8, 14), {
            life: this.r(0.7, 1.1),
            scale: 1.6,
            vy: -this.r(40, 80),
            once: false,
            delay: i * 0.05
          })
        break
      }
      case FX.ENEMY_SHOT: {
        if (!this.onScreen(x, y, v, 40)) break
        const def = ENEMIES[a]
        this.sprite('poof', x, y, { life: 0.25, scale: 0.55, fade: false })
        this.debris(x, y, 3, [def ? TAG_COLORS[def.tag] : '#fff', '#fff'], { speed: 80, size: 2, life: 0.5, up: 20 })
        break
      }
      case FX.WINDUP: {
        if (!this.onScreen(x, y, v, 40)) break
        const def = ENEMIES[a]
        const r = def?.radius ?? 14
        this.ring(x, y + r * 0.6, r * 0.6, r * 2.4, 0.32, '#ff5d4a', { width: 3, flat: 0.6 })
        break
      }
      case FX.ELITE: {
        if (!this.onScreen(x, y, v, 60)) break
        this.ring(x, y, 10, 80, 0.6, GOLD, { width: 3 })
        for (let i = 0; i < 6; i++)
          this.sprite('shine', x + this.r(-18, 18), y + this.r(-18, 8), {
            life: this.r(0.6, 1),
            scale: 1.5,
            vy: -this.r(20, 50),
            once: false,
            delay: this.r(0, 0.2)
          })
        break
      }
      default:
        break
    }
  }
}
