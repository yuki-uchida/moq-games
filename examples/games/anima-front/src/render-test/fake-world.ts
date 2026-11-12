/**
 * A tiny scripted "world" for the render harness: players strafe and use their antiques, foes chase, wind up and
 * attack, shots fly, hits/impacts/blasts/deaths/spawns/shards are emitted as SimEvents. Not the sim: just enough
 * plausible motion and events to review and measure the renderer without it.
 */
import { FOES, FOE_KINDS, type FoeAttack, type FoeKind } from '../data/enemies'
import { ITEMS, type ItemId } from '../data/items'
import { SPECIES, type SpeciesId } from '../data/species'
import type {
  FoeView,
  HandView,
  MapDef,
  PlayerView,
  PropView,
  ShardView,
  ShotKind,
  ShotView,
  SimEvent,
  TeamId,
  V3,
  View
} from '../sim/types'

/** An event without the envelope (loosely typed: foe events reuse the `id` field, see the render report). */
export type EventBody = { type: SimEvent['type'] } & Record<string, unknown>

const NAMES = [
  'ハヤテ',
  'ミケ',
  'ユキ',
  'ゴウ',
  'コノハ',
  'ペンタ',
  'モチ',
  'ソラ',
  'アカリ',
  'ツムギ',
  'ヒビキ',
  'カエデ'
]

export function hand(items: ItemId[]): HandView {
  return { items, sel: items.length ? 0 : -1, swap: 0, act: 'idle', charge: 0, cooldown: 0, uses: 0, combo: 0 }
}

const emptyStats = () => ({
  kos: 0,
  assists: 0,
  downs: 0,
  revives: 0,
  damage: 0,
  taken: 0,
  spent: 0,
  gathered: 0,
  shots: 0,
  hits: 0,
  byItem: {}
})

export function makePlayer(
  i: number,
  species: SpeciesId,
  team: TeamId,
  p: V3,
  r: ItemId[],
  l: ItemId[],
  passives: ItemId[] = []
): PlayerView {
  const def = SPECIES[species]
  return {
    id: `p${i}`,
    name: NAMES[i % NAMES.length],
    team,
    species,
    bot: i > 0,
    p,
    v: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    shoulder: 1,
    anima: def.anima,
    maxAnima: def.anima,
    state: 'alive',
    timer: 0,
    revive: 0,
    invuln: false,
    grounded: true,
    move: 'idle',
    hands: [hand(r), hand(l)],
    passives,
    passivesOnline: true,
    cloak: 0,
    revealed: false,
    burn: 0,
    dashCooldown: 0,
    negateAt: -1,
    stats: emptyStats()
  }
}

interface Brain {
  anchor: V3
  radius: number
  phase: number
  cooldown: [number, number]
  charge: number
  target?: number
}

interface FoeBrain {
  cooldown: number
  attack?: FoeAttack
}

interface LiveShot extends ShotView {
  ttl: number
  target?: number
  item: ShotKind
  by: string
}

export class FakeWorld {
  time = 0
  tick = 0
  private eventId = 0
  phase: View['phase'] = 'play'
  mode: View['mode'] = 'pve'
  readonly players: PlayerView[] = []
  readonly foes: FoeView[] = []
  readonly props: PropView[] = []
  readonly shards: ShardView[] = []
  private readonly shots: LiveShot[] = []
  private readonly brains = new Map<string, Brain>()
  private readonly foeBrains = new Map<number, FoeBrain>()
  private events: SimEvent[] = []
  private nextFoeId = 1
  private nextShotId = 1
  private nextShardId = 1
  /** Foes to keep alive (respawned as they die). */
  foeTarget = 0
  foeKinds: FoeKind[] = [...FOE_KINDS.filter((k) => !FOES[k].boss)]
  foeArea: { centre: V3; radius: number } = { centre: [0, 0, -20], radius: 20 }
  /** Players stand still (lineups) instead of fighting. */
  passive = false
  private rnd: () => number

  constructor(
    readonly map: MapDef,
    seed = 1
  ) {
    let s = seed >>> 0 || 1
    this.rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }

  emit(e: EventBody) {
    this.events.push({ id: ++this.eventId, t: this.time, ...e } as unknown as SimEvent)
  }

  addPlayer(p: PlayerView, anchor: V3, radius = 4) {
    this.players.push(p)
    this.brains.set(p.id, { anchor, radius, phase: this.rnd() * 6, cooldown: [this.rnd(), this.rnd()], charge: 0 })
  }

  addFoe(kind: FoeKind, p: V3, state: FoeView['state'] = 'spawn'): FoeView {
    const def = FOES[kind]
    const hp = kind === 'kurozume' ? 100 : def.hp
    const f: FoeView = {
      id: this.nextFoeId++,
      kind,
      p,
      yaw: this.rnd() * 6.28,
      hp,
      maxHp: hp,
      state,
      st: 0,
      revealed: false,
      shielded: false
    }
    if (def.flying) f.p = [p[0], (def.hover?.[0] ?? 4) + this.rnd() * 2, p[2]]
    if (kind === 'kurozume') {
      const squad = [
        { species: 'fox' as const, r: ['wood' as const], l: ['frog' as const] },
        { species: 'bear' as const, r: ['mammoth' as const], l: ['armadillo' as const] },
        { species: 'cat' as const, r: ['claw' as const], l: ['bee' as const] }
      ][f.id % 3]
      f.animal = {
        species: squad.species,
        hands: [hand(squad.r), hand(squad.l)],
        pitch: 0,
        move: 'idle',
        grounded: true
      }
    }
    if (def.boss) f.parts = kind === 'goutetsu' ? [800, 800, 800, 800] : [0, 1]
    this.foes.push(f)
    this.foeBrains.set(f.id, { cooldown: 1 + this.rnd() * 2 })
    if (state === 'spawn') this.emit({ type: 'foeSpawn', foe: f.id, kind, at: [f.p[0], 0, f.p[2]] })
    return f
  }

  addProp(prop: Omit<PropView, 'id'> & { id?: number }): PropView {
    const pr = { ...prop, id: prop.id ?? 10_000 + this.props.length } as PropView
    this.props.push(pr)
    return pr
  }

  private spawnFoe() {
    const kind = this.foeKinds[Math.floor(this.rnd() * this.foeKinds.length)]
    const a = this.rnd() * 6.28
    const r = this.foeArea.radius * Math.sqrt(this.rnd())
    const c = this.foeArea.centre
    this.addFoe(kind, [c[0] + Math.cos(a) * r, 0, c[2] + Math.sin(a) * r])
  }

  private nearestFoe(p: V3): FoeView | undefined {
    let best: FoeView | undefined
    let bd = Infinity
    for (const f of this.foes) {
      if (f.state === 'dying' || f.state === 'spawn') continue
      const d = (f.p[0] - p[0]) ** 2 + (f.p[2] - p[2]) ** 2
      if (d < bd) {
        bd = d
        best = f
      }
    }
    return best
  }

  private nearestPlayer(p: V3): PlayerView | undefined {
    let best: PlayerView | undefined
    let bd = Infinity
    for (const pl of this.players) {
      if (pl.state !== 'alive') continue
      const d = (pl.p[0] - p[0]) ** 2 + (pl.p[2] - p[2]) ** 2
      if (d < bd) {
        bd = d
        best = pl
      }
    }
    return best
  }

  step(dt: number) {
    this.time += dt
    this.tick++
    for (const p of this.players) this.stepPlayer(p, dt)
    for (const f of this.foes) this.stepFoe(f, dt)
    this.stepShots(dt)
    this.stepShards(dt)
    for (const pr of this.props) {
      pr.t += dt
      if (pr.life !== undefined) pr.life = Math.max(0, pr.life - dt)
      if (pr.kind === 'zone') pr.state = ((pr.state ?? 0) + dt * 0.05) % 1
    }
    // Remove finished foes and keep the crowd size.
    for (let i = this.foes.length - 1; i >= 0; i--)
      if (this.foes[i].state === 'dying' && this.foes[i].st > 1.2) this.foes.splice(i, 1)
    let alive = 0
    for (const f of this.foes) if (!FOES[f.kind].boss) alive++
    while (alive < this.foeTarget) {
      this.spawnFoe()
      alive++
    }
  }

  private stepPlayer(p: PlayerView, dt: number) {
    const b = this.brains.get(p.id)!
    const def = SPECIES[p.species]
    if (this.passive) {
      p.v = [0, 0, 0]
      p.move = 'idle'
      return
    }
    // Strafe around the anchor.
    b.phase += dt * (0.35 + (p.id.charCodeAt(1) % 3) * 0.1)
    const speed = 5.5 * def.speed
    const tx = b.anchor[0] + Math.cos(b.phase) * b.radius
    const tz = b.anchor[2] + Math.sin(b.phase) * b.radius
    const dx = tx - p.p[0]
    const dz = tz - p.p[2]
    const d = Math.hypot(dx, dz)
    const v = d > 0.05 ? Math.min(speed, d * 4) : 0
    p.v = d > 0.05 ? [(dx / d) * v, 0, (dz / d) * v] : [0, 0, 0]
    // Occasional hops.
    const jump = Math.sin(b.phase * 3.1 + p.id.length) > 0.985
    let y = p.p[1]
    let vy = p.v[1]
    if (jump && p.grounded) {
      vy = 9
      this.emit({ type: 'jump', who: p.id, air: false })
    }
    const ground = 0
    vy = p.grounded && !jump ? 0 : ((p as unknown as { _vy?: number })._vy ?? vy)
    vy -= 26 * dt
    y += vy * dt
    const wasGrounded = p.grounded
    if (y <= ground) {
      y = ground
      if (!wasGrounded) this.emit({ type: 'land', who: p.id, hard: vy < -12 })
      p.grounded = true
      vy = 0
    } else p.grounded = false
    ;(p as unknown as { _vy?: number })._vy = vy
    p.p = [p.p[0] + p.v[0] * dt, y, p.p[2] + p.v[2] * dt]
    p.v = [p.v[0], vy, p.v[2]]
    p.move = !p.grounded ? 'air' : v > 0.5 ? 'run' : 'idle'
    // Aim at the nearest foe.
    const f = this.nearestFoe(p.p)
    if (f) {
      const ax = f.p[0] - p.p[0]
      const az = f.p[2] - p.p[2]
      p.yaw = Math.atan2(ax, az)
      const h = FOES[f.kind].height * 0.5 + f.p[1] - (p.p[1] + def.height * 0.8)
      p.pitch = Math.atan2(h, Math.hypot(ax, az))
    }
    // Use antiques.
    for (let h = 0 as 0 | 1; h < 2; h = (h + 1) as 0 | 1) this.useHand(p, h, f, dt)
    // Anima ebb and flow.
    p.anima = Math.max(8, Math.min(p.maxAnima, p.anima + Math.sin(this.time * 0.3 + b.phase) * dt * 3))
  }

  private useHand(p: PlayerView, h: 0 | 1, target: FoeView | undefined, dt: number) {
    const hv = p.hands[h]
    const item = hv.items[hv.sel]
    const b = this.brains.get(p.id)!
    if (!item) return
    const def = ITEMS[item]
    b.cooldown[h] -= dt
    hv.act = 'idle'
    if (!target) return
    const dist = Math.hypot(target.p[0] - p.p[0], target.p[2] - p.p[2])
    const use = def.use
    if (!use) return
    if (use.kind === 'beam') {
      if (dist < 30) {
        hv.act = 'beam'
        if (b.cooldown[h] <= 0) {
          b.cooldown[h] = 0.12
          this.hit(target, 6, p.id, 'eel')
          const other = this.foes.find(
            (o) => o !== target && o.state !== 'dying' && Math.hypot(o.p[0] - target.p[0], o.p[2] - target.p[2]) < 4
          )
          if (other) this.hit(other, 3, p.id, 'eel')
        }
      }
      return
    }
    if (use.kind === 'shield') {
      hv.act = 'guard'
      hv.charge = 1
      return
    }
    if (b.cooldown[h] > 0) {
      if (use.kind === 'charge' || use.kind === 'zoom') {
        hv.act = 'charge'
        hv.charge = Math.min(1, hv.charge + dt / 0.8)
      }
      return
    }
    const melee = def.category === 'melee'
    if (melee && dist > 3.5) return
    if (!melee && dist > 50) return
    hv.uses++
    hv.charge = 0
    const muzzle: V3 = [
      p.p[0] + Math.sin(p.yaw) * 0.5,
      p.p[1] + SPECIES[p.species].height * 0.6,
      p.p[2] + Math.cos(p.yaw) * 0.5
    ]
    const dir: V3 = [Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.cos(p.yaw) * Math.cos(p.pitch)]
    if (melee) {
      hv.act = 'swing'
      hv.combo = (hv.combo + 1) % 3
      b.cooldown[h] = 'interval' in use ? use.interval + 0.15 : 0.9
      this.emit({ type: 'swing', who: p.id, item, hand: h === 0 ? 'R' : 'L', combo: hv.combo })
      this.hit(target, 'damage' in use ? use.damage : 20, p.id, item)
      if (item === 'mammoth')
        this.emit({ type: 'blast', at: [target.p[0], 0, target.p[2]], radius: 3.5, item, team: p.team })
      return
    }
    if (def.category !== 'ranged' && def.category !== 'gadget') return
    hv.act = 'fire'
    const interval = 'interval' in use ? use.interval : 'rate' in use ? 1 / use.rate : 1
    b.cooldown[h] = Math.max(0.12, interval) * (def.category === 'gadget' ? 8 : 1.6)
    this.emit({ type: 'fire', who: p.id, item, hand: h === 0 ? 'R' : 'L', from: muzzle, dir })
    if (def.category === 'gadget') {
      if (item === 'frog' || item === 'hermit' || item === 'honeyant') {
        const at: V3 = [p.p[0] + dir[0] * 4, 0, p.p[2] + dir[2] * 4]
        const kind = item === 'frog' ? 'frog' : item === 'hermit' ? 'hermit' : 'honey'
        const pr = this.addProp({
          kind,
          p: at,
          yaw: p.yaw,
          team: p.team,
          t: 0,
          life: 6,
          r: kind === 'honey' ? 4.5 : undefined
        })
        this.emit({ type: 'deploy', who: p.id, item, prop: pr.id, at })
      }
      return
    }
    const speed = 'speed' in use ? Math.min(use.speed, 120) : 60
    const pellets = use.kind === 'spread' ? 4 : 1
    for (let k = 0; k < pellets; k++) {
      const s = pellets > 1 ? 0.05 : 0
      const dv: V3 = [dir[0] + (this.rnd() - 0.5) * s, dir[1] + (this.rnd() - 0.5) * s, dir[2] + (this.rnd() - 0.5) * s]
      this.shots.push({
        id: this.nextShotId++,
        kind: item,
        team: p.team,
        p: [...muzzle],
        v: [dv[0] * speed, dv[1] * speed + (use.kind === 'lob' ? 6 : 0), dv[2] * speed],
        owner: p.id,
        ttl: Math.min(1.2, dist / speed + 0.02),
        target: target.id,
        item,
        by: p.id
      })
    }
  }

  private hit(f: FoeView, amount: number, by: string, item: ShotKind) {
    if (f.state === 'dying') return
    const def = FOES[f.kind]
    const head = this.rnd() < 0.15
    const surface = def.faction === 'machine' ? 'metal' : def.faction === 'animal' ? 'fur' : 'chitin'
    const at: V3 = [
      f.p[0] + (this.rnd() - 0.5) * def.radius,
      f.p[1] + def.height * (0.4 + this.rnd() * 0.4),
      f.p[2] + (this.rnd() - 0.5) * def.radius
    ]
    this.emit({ type: 'hit', target: f.id, targetKind: 'foe', by, item, amount, at, head, surface })
    f.hp -= amount * (def.boss ? 0.2 : 1)
    if (f.hp <= 0 && !def.boss) {
      f.state = 'dying'
      f.st = 0
      this.emit({ type: 'foeDie', foe: f.id, kind: f.kind, at: [f.p[0], f.p[1], f.p[2]], by })
      const p = this.players.find((x) => x.id === by)
      for (let i = 0; i < 2; i++)
        this.shards.push({
          id: this.nextShardId++,
          p: [f.p[0] + this.rnd() - 0.5, 0.3, f.p[2] + this.rnd() - 0.5],
          amount: 3,
          to: p && this.rnd() < 0.5 ? p.id : undefined
        })
    }
  }

  private stepFoe(f: FoeView, dt: number) {
    f.st += dt
    const def = FOES[f.kind]
    const brain = this.foeBrains.get(f.id)!
    if (f.state === 'dying') return
    if (f.state === 'spawn') {
      if (f.st > 0.8) {
        f.state = 'move'
        f.st = 0
      }
      return
    }
    if (def.boss) {
      f.yaw += dt * 0.1
      brain.cooldown -= dt
      if (f.state === 'windup' && f.st > 1.2) {
        this.emit({ type: 'foeAttack', foe: f.id, attack: f.attack!, at: f.p, aim: f.aim })
        f.state = 'recover'
        f.st = 0
      } else if (f.state === 'recover' && f.st > 1) {
        f.state = 'idle'
        f.st = 0
      } else if (brain.cooldown <= 0 && f.state === 'idle') {
        const atk = def.attacks[Math.floor(this.rnd() * def.attacks.length)]
        f.attack = atk.id
        f.aim = [f.p[0] + (this.rnd() - 0.5) * 16, 0, f.p[2] + 10 + this.rnd() * 6]
        f.state = 'windup'
        f.st = 0
        brain.cooldown = 4
        this.emit({ type: 'foeWindup', foe: f.id, attack: atk.id, at: f.p, aim: f.aim })
      }
      return
    }
    const target = this.nearestPlayer(f.p)
    if (!target) return
    const dx = target.p[0] - f.p[0]
    const dz = target.p[2] - f.p[2]
    const d = Math.hypot(dx, dz)
    f.yaw = Math.atan2(dx, dz)
    const atk = def.attacks[0]
    if (f.state === 'windup') {
      if (f.st >= (atk?.windup ?? 0.5)) {
        this.emit({ type: 'foeAttack', foe: f.id, attack: f.attack!, at: [...f.p], aim: f.aim })
        if (f.attack === 'acid' || f.attack === 'mortar' || f.attack === 'laser') {
          const kind: ShotKind = f.attack === 'acid' ? 'acid' : f.attack === 'mortar' ? 'plasma' : 'laser'
          const from: V3 = [f.p[0], f.p[1] + def.height * 0.7, f.p[2]]
          const aim = f.aim ?? target.p
          const sp = kind === 'laser' ? 70 : 20
          const ddx = aim[0] - from[0]
          const ddz = aim[2] - from[2]
          const dd = Math.hypot(ddx, ddz) || 1
          this.emit({ type: 'fire', who: f.id, item: kind, from, dir: [ddx / dd, 0, ddz / dd] })
          this.shots.push({
            id: this.nextShotId++,
            kind,
            team: 'foe',
            p: from,
            v: [(ddx / dd) * sp, kind === 'laser' ? 0 : 8, (ddz / dd) * sp],
            ttl: Math.min(1.6, dd / sp),
            item: kind,
            by: ''
          })
        }
        if (f.attack === 'explode') {
          this.emit({ type: 'blast', at: [...f.p], radius: 3, item: 'explode', team: 'foe' })
          f.state = 'dying'
          f.st = 0
          this.emit({ type: 'foeDie', foe: f.id, kind: f.kind, at: [...f.p] })
          return
        }
        f.state = 'recover'
        f.st = 0
      }
      return
    }
    if (f.state === 'recover') {
      if (f.st > 0.6) {
        f.state = 'move'
        f.st = 0
      }
      return
    }
    brain.cooldown -= dt
    if (atk && d < Math.max(atk.range, 3) && brain.cooldown <= 0) {
      f.state = 'windup'
      f.st = 0
      f.attack = atk.id
      f.aim = [target.p[0], 0, target.p[2]]
      brain.cooldown = atk.cooldown + 1 + this.rnd() * 2
      this.emit({ type: 'foeWindup', foe: f.id, attack: atk.id, at: [...f.p], aim: f.aim })
      return
    }
    const keep = atk ? Math.min(atk.range * 0.7, 14) : 2
    const sp = def.speed * (d > keep ? 0.7 : 0)
    f.state = sp > 0 ? 'move' : 'idle'
    if (sp > 0) {
      const ang = Math.sin(this.time * 1.3 + f.id) * 0.4
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      const ux = (dx / d) * c - (dz / d) * s
      const uz = (dx / d) * s + (dz / d) * c
      f.p = [
        f.p[0] + ux * sp * dt,
        def.flying ? (def.hover?.[0] ?? 4) + Math.sin(this.time * 2 + f.id) : 0,
        f.p[2] + uz * sp * dt
      ]
    }
    if (f.animal) {
      f.animal.move = sp > 0 ? 'run' : 'idle'
      f.animal.hands[0].act = d < 20 ? 'fire' : 'idle'
    }
  }

  private stepShots(dt: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]
      s.ttl -= dt
      const g = s.kind === 'pillbug' || s.kind === 'acid' || s.kind === 'plasma' || s.kind === 'hippo' ? 14 : 0
      s.v = [s.v[0], s.v[1] - g * dt, s.v[2]]
      s.p = [s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt]
      if (s.ttl > 0 && s.p[1] > 0) continue
      this.shots.splice(i, 1)
      const target = this.foes.find((f) => f.id === s.target)
      const at: V3 = [s.p[0], Math.max(0.05, s.p[1]), s.p[2]]
      if (s.kind === 'hippo' || s.kind === 'pillbug' || s.kind === 'plasma' || s.kind === 'acid') {
        const radius = s.kind === 'hippo' ? 5 : s.kind === 'pillbug' ? 4 : s.kind === 'plasma' ? 3 : 2
        this.emit({ type: 'blast', at: [at[0], 0, at[2]], radius, item: s.kind, team: s.team })
        if (target) this.hit(target, 40, s.by, s.kind)
      } else if (target && target.state !== 'dying' && this.rnd() < 0.85)
        this.hit(target, ITEMS[s.kind as ItemId]?.use && 'damage' in ITEMS[s.kind as ItemId].use! ? 8 : 6, s.by, s.kind)
      else {
        const surfaces = ['concrete', 'metal', 'ground', 'wood', 'crystal'] as const
        this.emit({
          type: 'impact',
          at,
          normal: [0, 1, 0],
          surface: surfaces[Math.floor(this.rnd() * surfaces.length)],
          item: s.kind
        })
      }
    }
  }

  private stepShards(dt: number) {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i]
      if (!sh.to) {
        if (this.rnd() < dt * 0.3) this.shards.splice(i, 1)
        continue
      }
      const p = this.players.find((x) => x.id === sh.to)
      if (!p) {
        this.shards.splice(i, 1)
        continue
      }
      const tx = p.p[0] - sh.p[0]
      const ty = p.p[1] + 0.6 - sh.p[1]
      const tz = p.p[2] - sh.p[2]
      const d = Math.hypot(tx, ty, tz)
      if (d < 0.4) {
        this.emit({ type: 'shard', who: p.id, amount: sh.amount, at: sh.p })
        this.shards.splice(i, 1)
        continue
      }
      const sp = Math.min(d, 14 * dt)
      sh.p = [
        sh.p[0] + (tx / d) * sp,
        sh.p[1] + (ty / d) * sp + Math.sin(this.time * 9 + sh.id) * 0.02,
        sh.p[2] + (tz / d) * sp
      ]
    }
  }

  view(): View {
    const events = this.events
    this.events = []
    return {
      tick: this.tick,
      time: this.time,
      mode: this.mode,
      map: this.map.id,
      phase: this.phase,
      clock: this.time,
      players: this.players,
      foes: this.foes,
      shots: this.shots,
      props: this.props,
      shards: this.shards,
      events
    }
  }
}
