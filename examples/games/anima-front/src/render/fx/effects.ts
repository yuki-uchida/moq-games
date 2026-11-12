/**
 * The effects director: a visual answer for every SimEvent (tables.ts) plus the persistent effects driven by the
 * view each frame (eel beams with chain arcs, hook lines, wind-up telegraphs, swing trails, glide wisps, ink
 * clouds, honey glow, ambient motes and petals). Particles and ribbons only; allocation-free per frame.
 */
import * as THREE from 'three'
import { FOES, type FoeAttack } from '../../data/enemies'
import { ITEMS, type ItemId } from '../../data/items'
import { SPECIES } from '../../data/species'
import type { ActorRef, PlayerView, SimEvent, Surface, V3, View } from '../../sim/types'
import { aimDirection, type CameraRig } from '../camera'
import type { BoxGrid } from '../core/box-grid'
import type { Emitter } from '../env/ctx'
import type { ThemeDef } from '../env/themes'
import type { Markers } from '../markers'
import { LineFx } from './lines'
import { Particle, ParticleSystem, SHAPE } from './particles'
import { FIRE_LOOK, HIT_LOOK, IMPACT_LOOK, TELEGRAPH, shotColor } from './tables'

export interface FxContext {
  me?: string
  rig: CameraRig
  grid: BoxGrid | null
  markers: Markers
  position(ref: ActorRef): V3 | undefined
  player(id: string): PlayerView | undefined
  /** Model muzzle of a player's paw (world); false when unknown. */
  muzzle(id: string, hand: 0 | 1, out: THREE.Vector3): boolean
  /** White hit flash on an actor. */
  flash(ref: ActorRef, amount: number): void
  /** Hurt flinch counter on a player. */
  hurt(id: string): void
  /** Melee hit-stop for the local player (seconds). */
  hitStop(seconds: number): void
}

interface Arc {
  active: boolean
  who: string
  t: number
  color: number
  combo: number
  reach: number
  wide: number
}

interface Chain {
  active: boolean
  t: number
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
}

const VIOLET = 0xb06aff
const ICHOR = 0x7a3ad8
const CYAN = 0x7ae8ff
const ANIMA = 0xffa040

export class Effects {
  readonly group = new THREE.Group()
  readonly add: ParticleSystem
  readonly alpha: ParticleSystem
  readonly lines: LineFx
  private readonly p = new Particle()
  private readonly arcs: Arc[] = []
  private readonly chains: Chain[] = []
  private readonly hooks = new Map<string, V3>()
  private readonly lastEel = new Map<string, V3>()
  private theme: ThemeDef | null = null
  private emitters: Emitter[] = []
  private time = 0
  private moteAcc = 0
  private readonly v = new THREE.Vector3()
  private readonly w = new THREE.Vector3()
  private readonly cam = new THREE.Vector3()
  reducedMotion = false

  constructor(capacity: number) {
    this.add = new ParticleSystem(Math.round(capacity * 0.6), true)
    this.alpha = new ParticleSystem(Math.round(capacity * 0.4), false)
    this.lines = new LineFx(2500)
    this.group.add(this.alpha.mesh, this.add.mesh, this.lines.mesh)
    for (let i = 0; i < 40; i++) this.arcs.push({ active: false, who: '', t: 0, color: 0, combo: 0, reach: 2, wide: 1 })
    for (let i = 0; i < 24; i++) this.chains.push({ active: false, t: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 })
  }

  setMap(theme: ThemeDef, emitters: Emitter[]) {
    this.theme = theme
    this.emitters = emitters
    this.add.clear()
    this.alpha.clear()
    this.hooks.clear()
    for (const a of this.arcs) a.active = false
    for (const c of this.chains) c.active = false
  }

  // ------------------------------------------------------------------------------------------ primitives

  private rnd(a = 1) {
    return (Math.random() * 2 - 1) * a
  }

  /** Radial burst of particles. */
  private burst(
    sys: ParticleSystem,
    x: number,
    y: number,
    z: number,
    n: number,
    speed: number,
    hex: number,
    intensity: number,
    size: number,
    life: number,
    shape: number,
    gravity = 0,
    stretch = 0,
    up = 0
  ) {
    const p = this.p
    for (let i = 0; i < n; i++) {
      p.reset().at(x, y, z)
      const s = speed * (0.4 + Math.random() * 0.8)
      let dx = this.rnd()
      let dy = this.rnd() + up
      let dz = this.rnd()
      const l = Math.hypot(dx, dy, dz) || 1
      dx /= l
      dy /= l
      dz /= l
      p.vel(dx * s, dy * s, dz * s).color(hex, intensity)
      p.size = size * (0.6 + Math.random() * 0.8)
      p.sizeEnd = p.size * (shape === SHAPE.smoke ? 2.2 : 0.4)
      p.life = life * (0.6 + Math.random() * 0.8)
      p.shape = shape
      p.gravity = gravity
      p.drag = shape === SHAPE.smoke ? 2.5 : 1.2
      p.stretch = stretch
      p.rot = Math.random() * 6.28
      p.spin = this.rnd(3)
      sys.add(p)
    }
  }

  /** Expanding flat ring on the ground (or a billboard ring when `flat` is false). */
  private ring(
    x: number,
    y: number,
    z: number,
    from: number,
    to: number,
    hex: number,
    intensity: number,
    life: number,
    flat = true,
    shape: number = SHAPE.ring
  ) {
    const p = this.p.reset().at(x, y, z).color(hex, intensity)
    p.size = from
    p.sizeEnd = to
    p.life = life
    p.shape = shape
    p.flat = flat
    p.fadeIn = 0.02
    this.add.add(p)
  }

  private flashAt(x: number, y: number, z: number, hex: number, size: number, intensity = 5, life = 0.08) {
    const p = this.p.reset().at(x, y, z).color(hex, intensity)
    p.size = size
    p.sizeEnd = size * 1.4
    p.life = life
    p.shape = SHAPE.star
    p.rot = Math.random() * 6.28
    this.add.add(p)
    const q = this.p
      .reset()
      .at(x, y, z)
      .color(hex, intensity * 0.5)
    q.size = size * 1.6
    q.sizeEnd = size * 2.2
    q.life = life * 1.5
    q.shape = SHAPE.dot
    this.add.add(q)
  }

  private smoke(x: number, y: number, z: number, n: number, size: number, hex: number, life: number, rise = 1) {
    const p = this.p
    for (let i = 0; i < n; i++) {
      p.reset()
        .at(x + this.rnd(size * 0.3), y + this.rnd(size * 0.2), z + this.rnd(size * 0.3))
        .color(hex, 1)
      p.vel(this.rnd(1.2), rise * (0.6 + Math.random()), this.rnd(1.2))
      p.size = size * (0.6 + Math.random() * 0.5)
      p.sizeEnd = p.size * 2.4
      p.life = life * (0.7 + Math.random() * 0.6)
      p.alpha = 0.55
      p.fadeIn = 0.12
      p.shape = SHAPE.smoke
      p.drag = 1.5
      p.rot = Math.random() * 6.28
      p.spin = this.rnd(0.6)
      this.alpha.add(p)
    }
  }

  private decal(
    x: number,
    y: number,
    z: number,
    size: number,
    hex: number,
    alpha: number,
    life: number,
    shape: number
  ) {
    const p = this.p
      .reset()
      .at(x, y + 0.04, z)
      .color(hex, 1)
    p.size = size
    p.sizeEnd = size * 1.05
    p.life = life
    p.alpha = alpha
    p.fadeIn = 0.01
    p.flat = true
    p.shape = shape
    p.rot = Math.random() * 6.28
    this.alpha.add(p)
  }

  private pillar(x: number, y: number, z: number, hex: number, height: number, down: boolean) {
    const p = this.p
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28
      const r = Math.random() * 0.6
      p.reset()
        .at(x + Math.cos(a) * r, y + (down ? height : Math.random() * 1.5), z + Math.sin(a) * r)
        .vel(0, down ? -30 - Math.random() * 20 : 12 + Math.random() * 18, 0)
        .color(hex, 4)
      p.size = 0.12 + Math.random() * 0.1
      p.sizeEnd = 0.05
      p.life = 0.35 + Math.random() * 0.3
      p.shape = SHAPE.spark
      p.stretch = 0.05
      this.add.add(p)
    }
    const q = p
      .reset()
      .at(x, y + height * 0.5, z)
      .vel(0, 0.01, 0)
      .color(hex, 3)
    q.size = 1.1
    q.sizeEnd = 0.2
    q.life = 0.5
    q.shape = SHAPE.spark
    q.stretch = height * 2
    this.add.add(q)
    this.ring(x, y + 0.05, z, 0.5, 4, hex, 3, 0.6)
  }

  // ------------------------------------------------------------------------------------------ events

  event(e: SimEvent, ctx: FxContext) {
    const me = ctx.me
    switch (e.type) {
      case 'fire': {
        const look = FIRE_LOOK[e.item]
        const color = shotColor(e.item)
        const [x, y, z] = e.from
        const [dx, dy, dz] = e.dir
        if (look.muzzle === 'flash') {
          this.flashAt(
            x + dx * 0.15,
            y + dy * 0.15,
            z + dz * 0.15,
            color,
            e.item === 'hippo' || e.item === 'owl' ? 0.5 : 0.28,
            6
          )
          this.burst(this.add, x, y, z, 3, 6, color, 3, 0.05, 0.12, SHAPE.spark, 0, 0.02)
        } else if (look.muzzle === 'puff') {
          this.smoke(x, y, z, 2, 0.25, 0xeeeeee, 0.4, 0.4)
          this.flashAt(x, y, z, color, 0.18, 3)
        } else if (look.muzzle === 'spark')
          this.burst(this.add, x, y, z, 4, 3, color, 3, 0.06, 0.2, SHAPE.spark, 0, 0.03)
        else if (look.muzzle === 'leaf') this.burst(this.alpha, x, y, z, 6, 2, 0x9ccc65, 1, 0.12, 0.6, SHAPE.petal, 2)
        if (look.tracer) {
          const p = this.p
            .reset()
            .at(x, y, z)
            .vel(dx * 140, dy * 140, dz * 140)
            .color(color, 5)
          p.size = e.item === 'owl' ? 0.07 : 0.045
          p.sizeEnd = p.size
          p.life = e.item === 'owl' ? 0.12 : 0.07
          p.shape = SHAPE.spark
          p.stretch = 0.035
          p.fadeIn = 0
          this.add.add(p)
        }
        if (e.who === me) {
          ctx.rig.recoilKick(look.recoil)
          if (look.shake) ctx.rig.addTrauma(look.shake)
        }
        return
      }
      case 'swing': {
        const def = ITEMS[e.item]
        const use = def.use
        const reach = use && 'reach' in use ? use.reach : 2
        const arc = use && 'arc' in use ? use.arc : 120
        const slot = this.arcs.find((a) => !a.active)
        if (slot) {
          slot.active = true
          slot.who = e.who
          slot.t = 0
          slot.color = def.color
          slot.combo = e.combo
          slot.reach = reach
          slot.wide = (arc / 180) * Math.PI
        }
        if (e.item === 'narwhal') {
          const pv = ctx.player(e.who)
          if (pv) this.dashStreaks(pv, def.color)
        }
        return
      }
      case 'hit': {
        const look = HIT_LOOK[e.blocked ? 'guard' : e.surface]
        const [x, y, z] = e.at
        if (e.negated) {
          this.ring(x, y, z, 0.3, 2.2, 0xf48fb1, 3, 0.35, false, SHAPE.hex)
          this.burst(this.add, x, y, z, 10, 4, 0xf8b8d8, 2, 0.12, 0.5, SHAPE.dot, 1)
        } else if (look.kind === 'ichor') {
          this.burst(this.alpha, x, y, z, 7, 5, ICHOR, 1, 0.18, 0.55, SHAPE.splat, 14)
          this.burst(this.add, x, y, z, 4, 3, VIOLET, 2, 0.1, 0.25, SHAPE.dot)
        } else if (look.kind === 'sparks') {
          this.burst(this.add, x, y, z, 9, 9, look.color, 4, 0.05, 0.3, SHAPE.spark, 12, 0.025)
        } else if (look.kind === 'fluff') {
          this.burst(this.alpha, x, y, z, 6, 2.5, look.color, 1, 0.1, 0.6, SHAPE.dot, -0.5)
          this.burst(this.add, x, y, z, 3, 2, ANIMA, 2.5, 0.1, 0.25, SHAPE.star)
        } else if (look.kind === 'ripple') {
          this.ring(x, y, z, 0.2, 1.6, look.color, 3, 0.3, false, SHAPE.hex)
          this.burst(this.add, x, y, z, 6, 5, look.color, 3, 0.05, 0.25, SHAPE.spark, 4, 0.02)
        } else this.burst(this.alpha, x, y, z, 6, 4, look.color, 1, 0.08, 0.5, SHAPE.shard, 14)
        if (e.by === me && !e.negated) {
          ctx.markers.damage(e.at, e.amount, e.blocked ? 3 : e.head ? 1 : e.weak ? 2 : 0)
          const item = e.item
          if (item && item in ITEMS && ITEMS[item as ItemId].category === 'melee') ctx.hitStop(0.05)
        }
        if (!e.negated) ctx.flash(e.target, e.blocked ? 0.3 : 0.8)
        if (e.targetKind === 'player' && typeof e.target === 'string') {
          ctx.hurt(e.target)
          if (e.target === me) ctx.rig.addTrauma(Math.min(0.35, 0.05 + e.amount * 0.012))
        }
        if (e.item === 'eel' && e.by !== undefined) this.eelHit(String(e.by), e.at)
        return
      }
      case 'impact': {
        this.impact(e.at, e.normal, e.surface, shotColor(e.item))
        return
      }
      case 'blast': {
        const color =
          typeof e.item === 'string' && e.item in ITEMS
            ? shotColor(e.item as ItemId)
            : e.team === 'foe'
              ? VIOLET
              : ANIMA
        this.blast(e.at, e.radius, color, ctx)
        return
      }
      case 'empty': {
        const pos = ctx.position(e.who)
        if (pos) this.burst(this.alpha, pos[0], pos[1] + 0.7, pos[2], 4, 1, 0x9a9aa0, 1, 0.1, 0.4, SHAPE.smoke, -1)
        return
      }
      case 'swap': {
        if (ctx.muzzle(e.who, e.hand === 'R' ? 0 : 1, this.v))
          this.burst(this.add, this.v.x, this.v.y, this.v.z, 8, 1.5, ITEMS[e.item].color, 3, 0.07, 0.4, SHAPE.star, -1)
        return
      }
      case 'jump': {
        const pos = ctx.position(e.who)
        if (!pos) return
        if (e.air) this.ring(pos[0], pos[1] + 0.05, pos[2], 0.3, 1.6, ANIMA, 2.5, 0.35)
        else this.smoke(pos[0], pos[1] + 0.1, pos[2], 3, 0.3, 0xd8d0c0, 0.5, 0.3)
        return
      }
      case 'land': {
        const pos = ctx.position(e.who)
        if (!pos) return
        this.smoke(pos[0], pos[1] + 0.1, pos[2], e.hard ? 7 : 3, e.hard ? 0.45 : 0.3, 0xd8d0c0, 0.6, 0.25)
        if (e.hard) {
          this.ring(pos[0], pos[1] + 0.05, pos[2], 0.4, 3, 0xffffff, 1.2, 0.3)
          if (e.who === me) ctx.rig.addTrauma(0.15)
        }
        return
      }
      case 'dash': {
        const pv = ctx.player(e.who)
        if (pv) this.dashStreaks(pv, e.slide ? 0xbfe8ff : ANIMA)
        if (e.who === me) ctx.rig.dashKick()
        return
      }
      case 'launch': {
        const pos = ctx.position(e.who)
        if (!pos) return
        this.ring(pos[0], pos[1] + 0.05, pos[2], 0.5, 3, 0x7bd84a, 3, 0.4)
        this.ring(pos[0], pos[1] + 0.05, pos[2], 0.3, 2, 0xffffff, 2, 0.3)
        this.burst(this.add, pos[0], pos[1] + 0.2, pos[2], 12, 8, 0x7bd84a, 3, 0.06, 0.4, SHAPE.spark, 6, 0.03, 2)
        return
      }
      case 'hook': {
        if (e.done) this.hooks.delete(e.who)
        else {
          this.hooks.set(e.who, e.to)
          this.burst(this.add, e.to[0], e.to[1], e.to[2], 8, 4, 0x80deea, 3, 0.05, 0.3, SHAPE.spark, 4, 0.02)
        }
        return
      }
      case 'glide':
        return
      case 'cloak': {
        const pos = ctx.position(e.who)
        if (pos) this.burst(this.alpha, pos[0], pos[1] + 0.7, pos[2], 14, 2.5, 0xaed581, 1, 0.14, 0.8, SHAPE.petal, 1)
        return
      }
      case 'deploy': {
        const c = ITEMS[e.item].color
        this.smoke(e.at[0], e.at[1] + 0.2, e.at[2], 4, 0.4, 0xf0f0f0, 0.6, 0.6)
        this.burst(this.add, e.at[0], e.at[1] + 0.3, e.at[2], 10, 3, c, 3, 0.07, 0.5, SHAPE.star, 1, 0, 1)
        this.ring(e.at[0], e.at[1] + 0.05, e.at[2], 0.4, 2.4, c, 2.5, 0.4)
        return
      }
      case 'propHit':
        this.burst(this.alpha, e.at[0], e.at[1], e.at[2], 4, 3, 0xffb08a, 1, 0.08, 0.4, SHAPE.shard, 12)
        return
      case 'propBreak':
        this.burst(this.alpha, e.at[0], e.at[1] + 0.8, e.at[2], 18, 6, 0xffb08a, 1, 0.16, 0.9, SHAPE.shard, 14)
        this.smoke(e.at[0], e.at[1] + 0.5, e.at[2], 5, 0.6, 0xe0d8d0, 0.8)
        return
      case 'passives': {
        const pos = ctx.position(e.who)
        if (pos)
          this.burst(
            this.add,
            pos[0],
            pos[1] + 0.8,
            pos[2],
            e.online ? 10 : 6,
            2,
            e.online ? ANIMA : 0x888888,
            2,
            0.06,
            0.5,
            SHAPE.spark,
            0,
            0.02
          )
        return
      }
      case 'critical': {
        const pos = ctx.position(e.who)
        if (pos)
          this.burst(this.add, pos[0], pos[1] + 0.8, pos[2], 10, 3, 0xff4a3a, 3, 0.07, 0.5, SHAPE.spark, 0, 0.03, 0.5)
        return
      }
      case 'armorBreak': {
        const [x, y, z] = e.at
        this.flashAt(x, y + 0.6, z, 0xffffff, 1.2, 8, 0.15)
        this.burst(this.alpha, x, y + 0.7, z, 22, 7, 0xffc070, 2, 0.16, 0.9, SHAPE.shard, 12, 0, 0.6)
        this.burst(this.add, x, y + 0.7, z, 16, 6, ANIMA, 4, 0.08, 0.6, SHAPE.spark, 4, 0.03)
        this.ring(x, y + 0.05, z, 0.5, 5, ANIMA, 3, 0.5)
        this.ring(x, y + 0.7, z, 0.4, 3.5, 0xffffff, 2, 0.3, false)
        if (e.who === me) ctx.rig.addTrauma(0.6)
        return
      }
      case 'down': {
        const pos = ctx.position(e.who)
        if (pos) this.ring(pos[0], pos[1] + 0.05, pos[2], 0.5, 3, 0xff6a5a, 2.5, 0.6)
        return
      }
      case 'reviveStart': {
        const pos = ctx.position(e.who)
        if (pos) this.burst(this.add, pos[0], pos[1] + 0.3, pos[2], 10, 1, 0x8af07a, 2.5, 0.08, 0.9, SHAPE.star, -2)
        return
      }
      case 'revive': {
        const pos = ctx.position(e.who)
        if (!pos) return
        this.ring(pos[0], pos[1] + 0.05, pos[2], 0.5, 4, 0x8af07a, 3, 0.5)
        this.burst(this.add, pos[0], pos[1] + 0.5, pos[2], 20, 4, 0x8af07a, 3, 0.08, 0.8, SHAPE.star, -3, 0, 1)
        return
      }
      case 'warp':
        this.pillar(e.at[0], e.at[1], e.at[2], 0x9fe7ff, 14, false)
        return
      case 'respawn':
        this.pillar(e.at[0], e.at[1], e.at[2], 0xffd27a, 14, true)
        return
      case 'ko':
        return
      case 'shard':
        this.burst(this.add, e.at[0], e.at[1], e.at[2], 6, 2, 0xffb45c, 4, 0.08, 0.3, SHAPE.star)
        return
      case 'heal': {
        const pos = ctx.position(e.who)
        if (pos && Math.random() < 0.5)
          this.burst(
            this.add,
            pos[0],
            pos[1] + 0.2,
            pos[2],
            2,
            0.6,
            e.source === 'honey' ? 0xffc04a : 0x8af0ff,
            2.5,
            0.07,
            1.1,
            SHAPE.dot,
            -1.5
          )
        return
      }
      case 'reveal':
        this.ring(e.at[0], e.at[1] + 0.1, e.at[2], 1, e.radius * 2, 0x9a7aff, 3, 1.1)
        this.ring(e.at[0], e.at[1] + 0.1, e.at[2], 1, e.radius * 1.4, 0xc0a8ff, 2, 0.8)
        this.ring(e.at[0], e.at[1] + 1, e.at[2], 0.5, 6, 0xc0a8ff, 2.5, 0.4, false)
        return
      case 'foeSpawn':
        this.spawnTelegraph(e.kind, e.at)
        return
      case 'foeWindup': {
        const def = FOES[FOES_BY_ATTACK.get(e.attack) ?? 'tsubute']
        if (TELEGRAPH[e.attack] === 'self' || e.attack === 'summon')
          this.ring(
            e.at[0],
            e.at[1] + 0.05,
            e.at[2],
            0.5,
            def.radius * 4,
            e.attack === 'explode' ? 0xff4a2a : VIOLET,
            3,
            0.4
          )
        return
      }
      case 'foeAttack':
        this.foeAttack(e.attack, e.at, e.aim, ctx)
        return
      case 'foeDie':
        this.foeDie(e.kind, e.at, e.weak === true)
        return
      case 'bossPhase': {
        const pos = ctx.position(e.foe)
        if (pos) {
          this.ring(pos[0], pos[1] + 0.1, pos[2], 2, 30, VIOLET, 3, 0.9)
          this.flashAt(pos[0], pos[1] + 6, pos[2], 0xffffff, 4, 4, 0.2)
        }
        ctx.rig.addTrauma(0.5)
        return
      }
      case 'bossPart': {
        const pos = ctx.position(e.foe)
        if (!pos) return
        const a = (e.part / 4) * Math.PI * 2 + 0.78
        const x = pos[0] + Math.sin(a) * 4
        const z = pos[2] + Math.cos(a) * 4
        this.blast([x, pos[1] + 2, z], 4, CYAN, ctx)
        this.burst(this.alpha, x, pos[1] + 3, z, 20, 9, 0xe8edf2, 1, 0.3, 1.4, SHAPE.shard, 16)
        return
      }
      case 'objective': {
        if (e.prop === undefined) return
        const pos = ctx.position(e.prop)
        if (!pos) return
        const c =
          e.what === 'captured' || e.what === 'complete' || e.what === 'arrived'
            ? 0x7af0a0
            : e.what === 'progress'
              ? 0xffd36a
              : 0xff5a4a
        this.ring(pos[0], pos[1] + 0.1, pos[2], 1, e.what === 'captured' ? 22 : 10, c, 3, 0.8)
        if (e.what === 'destroyed') this.blast([pos[0], pos[1] + 2, pos[2]], 6, VIOLET, ctx)
        return
      }
      case 'phase': {
        if (e.phase !== 'victory' || !me) return
        const pos = ctx.position(me)
        if (pos) this.confetti(pos)
        return
      }
      default:
        return
    }
  }

  private dashStreaks(pv: PlayerView, color: number) {
    const sp = Math.hypot(pv.v[0], pv.v[2])
    if (sp < 0.5) return
    const dx = pv.v[0] / sp
    const dz = pv.v[2] / sp
    const h = SPECIES[pv.species].height
    const p = this.p
    for (let i = 0; i < 8; i++) {
      p.reset()
        .at(pv.p[0] + this.rnd(0.35), pv.p[1] + 0.2 + Math.random() * h * 0.8, pv.p[2] + this.rnd(0.35))
        .vel(-dx * 22, 0, -dz * 22)
        .color(color, 2.5)
      p.size = 0.04
      p.sizeEnd = 0.02
      p.life = 0.22
      p.shape = SHAPE.spark
      p.stretch = 0.06
      p.drag = 6
      this.add.add(p)
    }
    this.smoke(pv.p[0], pv.p[1] + 0.15, pv.p[2], 2, 0.3, 0xe0d8c8, 0.4, 0.2)
  }

  private impact(at: V3, n: V3, surface: Surface, color: number) {
    const look = IMPACT_LOOK[surface]
    const [x, y, z] = at
    const p = this.p
    for (let i = 0; i < 3; i++) {
      p.reset()
        .at(x, y, z)
        .vel(n[0] * 1.5 + this.rnd(0.6), n[1] * 1.5 + this.rnd(0.6) + 0.4, n[2] * 1.5 + this.rnd(0.6))
        .color(look.dust, 1)
      p.size = 0.14
      p.sizeEnd = 0.5
      p.life = 0.55
      p.alpha = 0.6
      p.shape = SHAPE.smoke
      p.drag = 3
      p.rot = Math.random() * 6
      this.alpha.add(p)
    }
    for (let i = 0; i < 4; i++) {
      p.reset()
        .at(x, y, z)
        .vel(n[0] * 4 + this.rnd(2.5), n[1] * 4 + this.rnd(2.5) + 1.5, n[2] * 4 + this.rnd(2.5))
        .color(look.chip, 1)
      p.size = 0.045
      p.sizeEnd = 0.035
      p.life = 0.5
      p.shape = SHAPE.shard
      p.gravity = 14
      p.spin = this.rnd(10)
      this.alpha.add(p)
    }
    if (look.sparks) this.burst(this.add, x, y, z, look.sparks, 8, 0xffd27a, 4, 0.03, 0.22, SHAPE.spark, 10, 0.02)
    this.flashAt(x, y, z, color, 0.16, 3, 0.06)
  }

  private blast(at: V3, radius: number, color: number, ctx: FxContext) {
    const [x, y, z] = at
    const r = Math.max(1, radius)
    const p = this.p
    // Toon fireball: bright core and orange flame puffs.
    this.flashAt(x, y + 0.3, z, 0xfff2c0, r * 0.6, 4, 0.12)
    for (let i = 0; i < 10; i++) {
      p.reset()
        .at(x + this.rnd(r * 0.25), y + 0.3 + Math.random() * r * 0.3, z + this.rnd(r * 0.25))
        .vel(this.rnd(r * 1.6), r * (0.4 + Math.random() * 1.1), this.rnd(r * 1.6))
        .color(i % 3 === 0 ? 0xffe08a : 0xff8a3a, 3.5)
      p.endR = 0.6
      p.endG = 0.35
      p.endB = 0.3
      p.size = r * 0.35
      p.sizeEnd = r * 0.55
      p.life = 0.35 + Math.random() * 0.2
      p.shape = SHAPE.smoke
      p.drag = 4
      p.rot = Math.random() * 6
      this.add.add(p)
    }
    // Accent in the antique colour.
    this.burst(this.add, x, y + 0.4, z, 10, r * 3.5, color, 4, 0.08, 0.5, SHAPE.spark, 6, 0.03, 0.5)
    // Dark smoke ring rising.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      p.reset()
        .at(x + Math.cos(a) * r * 0.4, y + 0.4, z + Math.sin(a) * r * 0.4)
        .vel(Math.cos(a) * r * 1.6, 1 + Math.random(), Math.sin(a) * r * 1.6)
        .color(0x5a5560, 1)
      p.size = r * 0.3
      p.sizeEnd = r * 0.7
      p.life = 1.1 + Math.random() * 0.5
      p.alpha = 0.6
      p.fadeIn = 0.15
      p.shape = SHAPE.smoke
      p.drag = 2.2
      p.rot = Math.random() * 6
      p.spin = this.rnd(0.5)
      this.alpha.add(p)
    }
    // Debris.
    this.burst(this.alpha, x, y + 0.3, z, 10, r * 3, 0x4a4440, 1, 0.08, 0.9, SHAPE.shard, 18, 0, 1)
    // Shockwave and scorch.
    this.ring(x, y + 0.08, z, r * 0.4, r * 2.4, 0xffd8a0, 2.5, 0.35)
    this.ring(x, y + r * 0.4, z, r * 0.3, r * 2.0, 0xffffff, 1.5, 0.22, false)
    this.decal(x, y, z, r * 0.9, 0x1e1a1c, 0.6, 8, SHAPE.splat)
    // Shake by distance.
    this.cam.copy(ctx.rig.camera.position)
    const d = Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z)
    const k = Math.max(0, 1 - d / (r * 6))
    if (k > 0) ctx.rig.addTrauma(0.15 + k * 0.45 * Math.min(1, r / 4))
  }

  private spawnTelegraph(kind: keyof typeof FOES, at: V3) {
    const f = FOES[kind]
    const [x, y, z] = at
    if (f.faction === 'creature') {
      this.decal(x, y, z, f.radius * 3 + 1.2, 0x2a1838, 0.75, 2.5, SHAPE.crack)
      const p = this.p
        .reset()
        .at(x, y + 0.06, z)
        .color(VIOLET, 3)
      p.size = f.radius * 3 + 1
      p.sizeEnd = p.size * 1.15
      p.life = 0.9
      p.flat = true
      p.shape = SHAPE.crack
      p.rot = Math.random() * 6
      this.add.add(p)
      this.burst(this.alpha, x, y + 0.2, z, 8, 4, 0x6a5040, 1, 0.1, 0.7, SHAPE.shard, 14, 0, 1.5)
      this.smoke(x, y + 0.2, z, 3, 0.5, 0x6a5a6a, 0.8, 0.5)
    } else if (f.faction === 'machine') {
      this.pillar(x, y, z, CYAN, 18, true)
    } else {
      this.flashAt(x, y + 0.8, z, 0xff4a5a, 1.4, 5, 0.18)
      this.ring(x, y + 0.05, z, 0.4, 3, 0xff4a5a, 3, 0.4)
      this.burst(this.add, x, y + 0.8, z, 14, 4, 0xff6a7a, 3, 0.06, 0.4, SHAPE.spark, 0, 0.03)
    }
  }

  private foeAttack(attack: FoeAttack, at: V3, aim: V3 | undefined, ctx: FxContext) {
    const [x, y, z] = at
    switch (attack) {
      case 'bite':
        this.burst(this.add, x, y + 0.5, z, 5, 3, 0xffa04a, 3, 0.06, 0.15, SHAPE.spark, 0, 0.02)
        return
      case 'leap':
      case 'dive':
      case 'charge':
        this.smoke(x, y + 0.2, z, attack === 'charge' ? 6 : 3, 0.5, 0xb0a8a0, 0.6, 0.3)
        return
      case 'laser':
        this.flashAt(x, y + 0.4, z, 0xff3a6a, 0.4, 5)
        return
      case 'acid':
      case 'mortar':
        this.flashAt(x, y + 1.5, z, attack === 'acid' ? 0xb6ff3a : CYAN, 0.6, 4)
        return
      case 'explode':
        return
      case 'shieldDome':
        this.ring(x, y + 0.1, z, 1, 12, CYAN, 2.5, 0.6)
        this.ring(x, y + 1.5, z, 1, 12, CYAN, 1.5, 0.5, false, SHAPE.hex)
        return
      case 'slam':
      case 'stomp': {
        const tx = aim?.[0] ?? x
        const ty = aim?.[1] ?? y
        const tz = aim?.[2] ?? z
        this.ring(tx, ty + 0.08, tz, 1, 9, attack === 'slam' ? VIOLET : CYAN, 3, 0.45)
        this.smoke(tx, ty + 0.3, tz, 10, 1, 0x8a8078, 1.2, 0.6)
        this.burst(this.alpha, tx, ty + 0.3, tz, 14, 7, 0x6a5a50, 1, 0.15, 0.9, SHAPE.shard, 16, 0, 1)
        this.decal(tx, ty, tz, 3.2, 0x2a1e24, 0.55, 6, SHAPE.crack)
        ctx.rig.addTrauma(0.35)
        return
      }
      case 'acidRain':
      case 'missile':
      case 'summon':
        this.flashAt(x, y + 6, z, attack === 'missile' ? 0xffa040 : VIOLET, 2.5, 4, 0.2)
        return
      case 'sweep':
        return
    }
  }

  private foeDie(kind: keyof typeof FOES, at: V3, weak: boolean) {
    const f = FOES[kind]
    const [x, y, z] = at
    const s = Math.max(0.6, f.radius)
    const h = y + f.height * 0.5
    if (f.faction === 'creature') {
      this.burst(this.alpha, x, h, z, Math.round(10 * s) + 4, 6 * s, ICHOR, 1, 0.24 * s, 0.8, SHAPE.splat, 14, 0, 0.8)
      this.burst(this.add, x, h, z, 10, 4 * s, VIOLET, 3, 0.1 * s, 0.5, SHAPE.dot, 2)
      this.decal(x, at[1], z, 1.2 * s + 0.6, 0x4a1e7a, 0.7, 7, SHAPE.splat)
      if (weak) this.flashAt(x, h, z, 0xffb04a, 0.8 * s, 3, 0.12)
      this.smoke(x, h, z, 3, 0.5 * s, 0x5a4a6a, 0.7, 0.4)
    } else if (f.faction === 'machine') {
      this.flashAt(x, h, z, 0xffffff, 0.7 * s, 3, 0.1)
      this.burst(this.add, x, h, z, 16, 8 * s, 0xffd27a, 4, 0.05, 0.5, SHAPE.spark, 12, 0.03, 0.5)
      this.burst(this.alpha, x, h, z, Math.round(8 * s) + 4, 6 * s, 0xe8edf2, 1, 0.16 * s, 1, SHAPE.shard, 16, 0, 1)
      this.burst(this.add, x, h, z, 6, 3, CYAN, 3, 0.1, 0.4, SHAPE.square, 2)
      this.smoke(x, h, z, 4, 0.6 * s, 0x4a4a52, 1, 0.8)
      if (kind === 'korogashi') this.ring(x, at[1] + 0.08, z, 0.5, 6, 0xff8a3a, 3, 0.35)
    } else {
      this.flashAt(x, h, z, 0xff5a6a, 0.8, 3, 0.12)
      this.burst(this.alpha, x, h, z, 16, 6, 0x3a3a44, 1, 0.14, 0.9, SHAPE.shard, 12, 0, 0.5)
      this.burst(this.add, x, h, z, 10, 4, 0xff4a5a, 3, 0.06, 0.5, SHAPE.spark, 4, 0.03)
      this.pillar(x, at[1], z, 0xff6a7a, 10, false)
    }
  }

  private confetti(pos: V3) {
    const colors = [0xff8fb1, 0xffd54f, 0x4fc3f7, 0x9ccc65, 0xffffff]
    const p = this.p
    for (let i = 0; i < 80; i++) {
      p.reset()
        .at(pos[0] + this.rnd(6), pos[1] + 6 + Math.random() * 4, pos[2] + this.rnd(6))
        .vel(this.rnd(2), Math.random() * 2, this.rnd(2))
        .color(colors[i % colors.length], 1.2)
      p.size = 0.09
      p.sizeEnd = 0.09
      p.life = 3 + Math.random() * 2
      p.shape = SHAPE.square
      p.gravity = 2
      p.drag = 1.2
      p.spin = this.rnd(8)
      this.alpha.add(p)
    }
  }

  /** Records an eel hit; consecutive hits of the same shooter within a frame become chain arcs. */
  private eelHit(by: string, at: V3) {
    const prev = this.lastEel.get(by)
    if (prev && Math.hypot(prev[0] - at[0], prev[1] - at[1], prev[2] - at[2]) < 6) {
      const c = this.chains.find((k) => !k.active)
      if (c) {
        c.active = true
        c.t = 0
        c.ax = prev[0]
        c.ay = prev[1]
        c.az = prev[2]
        c.bx = at[0]
        c.by = at[1]
        c.bz = at[2]
      }
    }
    this.lastEel.set(by, at)
  }

  // ------------------------------------------------------------------------------------------ per frame

  /** Advances the particle pools; immediate draws are accepted until `endFrame`. */
  beginFrame(camera: THREE.Camera, dt: number) {
    this.time += dt
    this.add.update(dt)
    this.alpha.update(dt)
    this.lines.begin(camera)
    this.cam.setFromMatrixPosition(camera.matrixWorld)
  }

  /** Uploads this frame's particles and ribbons. */
  endFrame() {
    this.lines.end()
    this.add.flush()
    this.alpha.flush()
    this.lastEel.clear()
  }

  /** Persistent, view-driven effects (between beginFrame and endFrame). */
  frame(view: View, ctx: FxContext, dt: number) {
    for (const pv of view.players) {
      if (pv.state !== 'alive') continue
      for (let h = 0 as 0 | 1; h < 2; h = (h + 1) as 0 | 1) {
        const hand = pv.hands[h]
        if (hand.act !== 'beam') continue
        this.beam(pv, h, ctx)
      }
      if (pv.move === 'hook') {
        const to = this.hooks.get(pv.id)
        if (to && ctx.muzzle(pv.id, 1, this.v)) {
          this.lines.segment(this.v.x, this.v.y, this.v.z, to[0], to[1], to[2], 0.025, 0.025, 0x80deea, 2.5, 1, 1)
          this.lines.segment(this.v.x, this.v.y, this.v.z, to[0], to[1], to[2], 0.08, 0.08, 0x80deea, 0.8, 0.5, 0.5)
        }
      } else if (this.hooks.has(pv.id)) this.hooks.delete(pv.id)
      if (pv.move === 'glide' && Math.random() < 0.7) {
        const r = SPECIES[pv.species].radius + 0.5
        const cy = Math.cos(pv.yaw)
        const sy = Math.sin(pv.yaw)
        for (const s of [-1, 1]) {
          const p = this.p
            .reset()
            .at(pv.p[0] - cy * r * s, pv.p[1] + 0.7, pv.p[2] + sy * r * s)
            .color(0xffffff, 1)
          p.size = 0.05
          p.sizeEnd = 0.02
          p.life = 0.5
          p.alpha = 0.6
          p.shape = SHAPE.dot
          this.alpha.add(p)
        }
      }
    }

    // Wind-up telegraphs (immediate draws with progress).
    for (const f of view.foes) {
      if (f.state !== 'windup' || !f.attack) continue
      this.telegraph(f.attack, f.p, f.aim, f.st, f.kind)
    }

    // Persistent prop effects.
    for (const pr of view.props) {
      if (pr.kind === 'ink') {
        const r = pr.r ?? 6
        if (Math.random() < dt * 10) {
          const a = Math.random() * 6.28
          const d = Math.sqrt(Math.random()) * r * 0.8
          const p = this.p
            .reset()
            .at(pr.p[0] + Math.cos(a) * d, pr.p[1] + 0.5 + Math.random() * r * 0.4, pr.p[2] + Math.sin(a) * d)
          p.vel(this.rnd(0.3), 0.2, this.rnd(0.3)).color(0x2a2236, 1)
          p.size = r * 0.35
          p.sizeEnd = r * 0.55
          p.life = 2.4
          p.alpha = (pr.life ?? 8) < 1.5 ? 0.35 : 0.85
          p.fadeIn = 0.3
          p.shape = SHAPE.smoke
          p.rot = Math.random() * 6
          p.spin = this.rnd(0.3)
          this.alpha.add(p)
        }
      } else if (pr.kind === 'puddle') {
        // Acid left on the ground: a sizzling violet-green pool that fades out with its life.
        const r = pr.r ?? 2
        const fade = Math.min(1, (pr.life ?? 4) / 1.2) * Math.min(1, pr.t / 0.25)
        const pool = this.p
          .reset()
          .at(pr.p[0], pr.p[1] + 0.04, pr.p[2])
          .color(0x7dff6a, 1.1)
        pool.size = r * 2
        pool.alpha = 0.55 * fade
        pool.flat = true
        pool.shape = SHAPE.splat
        pool.rot = (pr.id % 7) * 0.9
        this.alpha.draw(pool)
        const rim = this.p
          .reset()
          .at(pr.p[0], pr.p[1] + 0.05, pr.p[2])
          .color(0xb46bff, 1.6)
        rim.size = r * 2.05
        rim.alpha = (0.35 + 0.15 * Math.sin(this.time * 5 + pr.id)) * fade
        rim.flat = true
        rim.shape = SHAPE.ring
        this.add.draw(rim)
        if (Math.random() < dt * 6 * r) {
          const a = Math.random() * 6.28
          const d = Math.sqrt(Math.random()) * r * 0.85
          const bub = this.p.reset().at(pr.p[0] + Math.cos(a) * d, pr.p[1] + 0.06, pr.p[2] + Math.sin(a) * d)
          bub.vel(0, 0.5 + Math.random() * 0.6, 0).color(0xa8ff7a, 2)
          bub.size = 0.08 + Math.random() * 0.06
          bub.sizeEnd = 0.02
          bub.life = 0.7
          bub.alpha = fade
          bub.shape = SHAPE.dot
          this.add.add(bub)
        }
      } else if (pr.kind === 'honey') {
        if (Math.random() < dt * 8) {
          const a = Math.random() * 6.28
          const d = Math.random() * (pr.r ?? 4.5)
          const p = this.p.reset().at(pr.p[0] + Math.cos(a) * d, pr.p[1] + 0.1, pr.p[2] + Math.sin(a) * d)
          p.vel(0, 0.8 + Math.random(), 0).color(0xffc04a, 2.5)
          p.size = 0.07
          p.sizeEnd = 0.02
          p.life = 1.4
          p.shape = SHAPE.dot
          this.add.add(p)
        }
        const q = this.p
          .reset()
          .at(pr.p[0], pr.p[1] + 0.06, pr.p[2])
          .color(0xffb040, 1.4)
        q.size = pr.r ?? 4.5
        q.alpha = 0.5 + 0.15 * Math.sin(this.time * 3)
        q.flat = true
        q.shape = SHAPE.ring
        this.add.draw(q)
      }
    }

    // Swing trails.
    for (const a of this.arcs) {
      if (!a.active) continue
      a.t += dt
      if (a.t > 0.2) {
        a.active = false
        continue
      }
      const pv = ctx.player(a.who)
      if (!pv) continue
      this.swingArc(pv, a)
    }
    for (const c of this.chains) {
      if (!c.active) continue
      c.t += dt
      if (c.t > 0.12) {
        c.active = false
        continue
      }
      this.lines.bolt(c.ax, c.ay, c.az, c.bx, c.by, c.bz, 6, 0.6, 0.05, 0x9fffff, 4, 1)
    }

    this.ambient(dt)
  }

  private beam(pv: PlayerView, h: 0 | 1, ctx: FxContext) {
    if (!ctx.muzzle(pv.id, h, this.v)) return
    aimDirection(pv.yaw, pv.pitch, this.w)
    const range = 35
    const hit = ctx.grid ? ctx.grid.raycast(this.v.x, this.v.y, this.v.z, this.w.x, this.w.y, this.w.z, range) : range
    const ex = this.v.x + this.w.x * hit
    const ey = this.v.y + this.w.y * hit
    const ez = this.v.z + this.w.z * hit
    const color = ITEMS.eel.color
    this.lines.bolt(this.v.x, this.v.y, this.v.z, ex, ey, ez, 14, 0.5, 0.06, 0xe8ffff, 5, 1)
    this.lines.bolt(this.v.x, this.v.y, this.v.z, ex, ey, ez, 10, 1.1, 0.03, color, 4, 0.8)
    this.lines.segment(this.v.x, this.v.y, this.v.z, ex, ey, ez, 0.22, 0.3, color, 1.2, 0.35, 0.25)
    if (Math.random() < 0.6) this.burst(this.add, ex, ey, ez, 2, 5, color, 4, 0.04, 0.2, SHAPE.spark, 6, 0.02)
    const p = this.p.reset().at(this.v.x, this.v.y, this.v.z).color(color, 4)
    p.size = 0.25 + Math.random() * 0.1
    p.shape = SHAPE.star
    p.rot = Math.random() * 6
    this.add.draw(p)
  }

  private swingArc(pv: PlayerView, a: Arc) {
    const def = SPECIES[pv.species]
    const u = a.t / 0.2
    const alpha = 1 - u
    const segs = 9
    const span = a.wide * Math.min(1, u * 3 + 0.3)
    const dir = a.combo % 2 === 0 ? 1 : -1
    const cy = pv.p[1] + def.height * 0.55
    const tilt = (a.combo % 3) * 0.25 - 0.25
    let px = 0
    let py = 0
    let pz = 0
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const ang = pv.yaw + dir * (t - 0.5) * span
      const r = a.reach * 0.85
      const x = pv.p[0] + Math.sin(ang) * r
      const z = pv.p[2] + Math.cos(ang) * r
      const y = cy + (t - 0.5) * tilt * 2
      if (i > 0) {
        const fade = alpha * t
        this.lines.segment(px, py, pz, x, y, z, 0.05 + 0.12 * fade, 0.05 + 0.14 * fade, a.color, 3, fade, fade)
      }
      px = x
      py = y
      pz = z
    }
  }

  private telegraph(attack: FoeAttack, p: V3, aim: V3 | undefined, st: number, kind: keyof typeof FOES) {
    const f = FOES[kind]
    const def = f.attacks.find((a) => a.id === attack)
    const windup = def?.windup ?? 0.6
    const prog = Math.min(1, st / Math.max(0.05, windup))
    const machine = f.faction === 'machine'
    const color = machine ? 0xff4a6a : 0xc070ff
    const type = TELEGRAPH[attack]
    const tx = aim?.[0] ?? p[0]
    const ty = aim?.[1] ?? p[1]
    const tz = aim?.[2] ?? p[2]
    const pulse = 0.75 + 0.25 * Math.sin(this.time * 18)
    if (type === 'ring' || type === 'rain') {
      const r = (def?.radius ?? 2.5) * (type === 'rain' ? 2.2 : 1)
      const q = this.p
        .reset()
        .at(tx, ty + 0.07, tz)
        .color(color, 2.5 * pulse)
      q.size = r
      q.flat = true
      q.shape = SHAPE.ring
      q.alpha = 0.9
      this.add.draw(q)
      const fill = this.p
        .reset()
        .at(tx, ty + 0.06, tz)
        .color(color, 1.4)
      fill.size = r * prog
      fill.flat = true
      fill.shape = SHAPE.disc
      fill.alpha = 0.35
      this.add.draw(fill)
    } else if (type === 'line') {
      const y0 = p[1] + 0.1
      this.lines.segment(p[0], y0, p[2], tx, ty + 0.1, tz, 0.35, 0.35 + prog * 0.3, color, 1.5 * pulse, 0.6, 0.9)
      const q = this.p
        .reset()
        .at(tx, ty + 0.07, tz)
        .color(color, 2.5 * pulse)
      q.size = 1.4
      q.flat = true
      q.shape = SHAPE.ring
      this.add.draw(q)
    } else if (type === 'sight') {
      const y0 = p[1] + f.height * 0.6
      const w = 0.02 + prog * 0.04
      this.lines.segment(p[0], y0, p[2], tx, ty + 0.6, tz, w, w, color, 3 * pulse, 0.9, 0.5)
    } else if (type === 'dome') {
      const q = this.p
        .reset()
        .at(p[0], p[1] + 0.07, p[2])
        .color(0x7ae8ff, 2)
      q.size = (def?.radius ?? 6) * prog
      q.flat = true
      q.shape = SHAPE.hex
      this.add.draw(q)
    } else {
      const q = this.p
        .reset()
        .at(p[0], p[1] + 0.07, p[2])
        .color(attack === 'explode' ? 0xff3a2a : color, 3 * pulse)
      q.size = (def?.radius ?? f.radius * 2) * (0.6 + prog * 0.4)
      q.flat = true
      q.shape = SHAPE.ring
      this.add.draw(q)
    }
  }

  /** Theme motes around the camera and petals from emitters. */
  private ambient(dt: number) {
    const t = this.theme
    if (!t) return
    const m = t.motes
    const target = this.reducedMotion ? m.count * 0.4 : m.count
    this.moteAcc += dt * (target / 6)
    const p = this.p
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1
      const a = Math.random() * 6.28
      const d = 3 + Math.random() * 22
      const x = this.cam.x + Math.cos(a) * d
      const z = this.cam.z + Math.sin(a) * d
      const y = Math.max(0.3, this.cam.y - 2 + Math.random() * 7)
      p.reset().at(x, y, z)
      if (m.kind === 'petals') {
        p.vel(0.8 + this.rnd(0.4), -0.5, 0.3 + this.rnd(0.4)).color(m.color, 1.1)
        p.shape = SHAPE.petal
        p.size = p.sizeEnd = 0.06
        p.spin = this.rnd(3)
        p.life = 6
        p.fadeIn = 0.1
        this.alpha.add(p)
      } else if (m.kind === 'spores') {
        p.vel(this.rnd(0.2), 0.15 + Math.random() * 0.2, this.rnd(0.2)).color(m.color, 2.2)
        p.shape = SHAPE.dot
        p.size = p.sizeEnd = 0.05 + Math.random() * 0.05
        p.life = 6
        p.fadeIn = 0.3
        p.alpha = 0.8
        this.add.add(p)
      } else if (m.kind === 'fireflies') {
        p.vel(this.rnd(0.3), this.rnd(0.15), this.rnd(0.3)).color(m.color, 4)
        p.y = 0.4 + Math.random() * 2.5
        p.shape = SHAPE.dot
        p.size = p.sizeEnd = 0.05
        p.life = 4
        p.fadeIn = 0.4
        this.add.add(p)
      } else if (m.kind === 'data') {
        p.vel(0, 0.3 + Math.random() * 0.3, 0).color(m.color, 2)
        p.shape = SHAPE.square
        p.size = p.sizeEnd = 0.04
        p.life = 4
        p.fadeIn = 0.3
        p.alpha = 0.7
        this.add.add(p)
      } else {
        p.vel(0.4 + this.rnd(0.2), this.rnd(0.05), this.rnd(0.2)).color(m.color, 1.6)
        p.shape = SHAPE.dot
        p.size = p.sizeEnd = 0.03
        p.life = 6
        p.fadeIn = 0.3
        p.alpha = 0.5
        this.add.add(p)
      }
    }
    // Petal emitters near the camera.
    for (const e of this.emitters) {
      const d = Math.hypot(e.p[0] - this.cam.x, e.p[2] - this.cam.z)
      if (d > 60 || Math.random() > e.rate * dt) continue
      p.reset()
        .at(e.p[0] + this.rnd(e.r), e.p[1] + this.rnd(1), e.p[2] + this.rnd(e.r))
        .vel(0.6 + this.rnd(0.3), -0.6, 0.2 + this.rnd(0.3))
        .color(0xffc4d6, 1.15)
      p.shape = SHAPE.petal
      p.size = p.sizeEnd = 0.07
      p.spin = this.rnd(3)
      p.life = 5
      p.fadeIn = 0.1
      this.alpha.add(p)
    }
  }

  dispose() {
    this.add.dispose()
    this.alpha.dispose()
    this.lines.dispose()
  }
}

/** Which foe kind owns an attack (for sizes of generic telegraphs). */
const FOES_BY_ATTACK = new Map<FoeAttack, keyof typeof FOES>()
for (const f of Object.values(FOES))
  for (const a of f.attacks) if (!FOES_BY_ATTACK.has(a.id)) FOES_BY_ATTACK.set(a.id, f.id)
