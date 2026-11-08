/** Hero attacks and skills, damage to heroes/enemies/boss, guards and projectiles (DESIGN §4, §10, §11). */
/** Thrown props travel as shots of these kinds. */
const THROWN = new Set(['pot', 'barrel'])
import { TILE } from '../vocab'
import {
  angleDiff,
  burst,
  dist,
  emit,
  formSize,
  fx,
  heroBy,
  impulseHero,
  newId,
  pop,
  r1,
  sfx,
  shake,
  stop,
  turnOf
} from './core'
import { dropItems, rollDrop } from './items'
import { hitSnares } from './enemies'
import { hitMilda, hitPet } from './boss2'
import { hitValk } from './boss3'
import { hitLeon } from './boss4'
import { hitMinion, hitMinions } from './minions'
import { hitProp } from './props'
import type { Boss, Enemy, Hero, Shot, WorldState } from './state'
import {
  ATTACK,
  ATTACK_TIME,
  ENEMY_DEATH,
  ENEMY_HURT,
  GARUD,
  GUARDED,
  GUST,
  HERO_HIT,
  HURT_TIME,
  JOB_STATS,
  SKILL,
  SKILL_TIME,
  formAttackMul,
  formDefenseMul
} from './tables'
import type { ShotKind } from './types'

/* ---------------------------------------------------------------------------------------------- heroes */

export function heroInvulnerable(W: WorldState, h: Hero): boolean {
  return (
    h.inv > W.t ||
    h.state === 'tech' ||
    h.state === 'down' ||
    h.state === 'fall' ||
    (h.body.dashT >= 0 && h.body.dashT <= 0.22)
  )
}

/** Damage to a hero (half-hearts). Returns true when it landed. */
export function hurtHero(W: WorldState, h: Hero, dmg: number, sx: number, sy: number, kb = HERO_HIT.kb): boolean {
  if (heroInvulnerable(W, h)) return false
  const d = Math.max(1, Math.round(dmg * formDefenseMul(formSize(W, h))))
  h.hp -= d
  h.stats.hurt += d
  h.inv = W.t + HERO_HIT.inv
  const a = Math.atan2(h.body.y - sy, h.body.x - sx)
  if (kb > 0) impulseHero(h, Math.cos(a) * kb, Math.sin(a) * kb)
  emit(W, 'hit', h.body.x, h.body.y - 20, { a: d, s: 'hero' })
  sfx(W, 'heroHurt', h.body.x, h.body.y)
  if (h.hp <= 0) heroDown(W, h)
  else if (h.state !== 'grip' && h.state !== 'carry') setState(W, h, 'hurt', HURT_TIME)
  return true
}

export function setState(W: WorldState, h: Hero, state: Hero['state'], dur = 0): void {
  if (h.state !== state) h.st = W.t
  h.state = state
  h.until = dur > 0 ? W.t + dur : 0
}

export function heroDown(W: WorldState, h: Hero): void {
  h.hp = 0
  releaseHold(W, h)
  h.holdAt = -1
  h.charging = h.chargeFull = false
  setState(W, h, 'down')
  h.downAt = W.t
  h.revive = 0
  h.body.vx = h.body.vy = 0
  sfx(W, 'heroDown', h.body.x, h.body.y)
  emit(W, 'notice', h.body.x, h.body.y, { s: `${jobName(h)}がたおれた！` })
}

const JOB_JA = { sword: '剣士', mage: '魔法使い', archer: '弓使い', cleric: '僧侶' } as const
export const jobName = (h: Hero) => JOB_JA[h.job]

export function healHero(W: WorldState, h: Hero, n: number, by?: Hero): void {
  if (h.state === 'down' || h.hp >= h.maxHp) return
  const before = h.hp
  h.hp = Math.min(h.maxHp, h.hp + n)
  if (by) by.stats.heals += h.hp - before
  emit(W, 'heal', h.body.x, h.body.y, { a: h.hp - before })
  fx(W, 'heal', h.body.x, h.body.y)
}

/** Drops whatever the hero holds (set by props.ts; avoids an import cycle at module evaluation). */
export let releaseHold: (W: WorldState, h: Hero) => void = () => {}
export function setReleaseHold(fn: (W: WorldState, h: Hero) => void): void {
  releaseHold = fn
}

/* ---------------------------------------------------------------------------------------------- damage */

export interface HitOpts {
  slot: number
  dmg: number
  kb: number
  sx: number
  sy: number
  /** A co-op technique hit (breaks guards). */
  tech?: boolean
  heavy?: boolean
  stun?: number
  /** From a projectile (reaches a flying boss). */
  ranged?: boolean
}

/** Damage to an enemy; returns 'blocked' when the shield caught it. */
export function hitEnemy(W: WorldState, e: Enemy, o: HitOpts): 'hit' | 'blocked' | 'none' {
  if (e.dead || e.state === 'death') return 'none'
  // A spear guard's guard is down while it recovers from a thrust.
  const open = (e.kind === 'spearguard' || e.kind === 'heavy') && e.state === 'attack'
  if (GUARDED.has(e.kind) && !open && !o.tech && e.guardOff <= W.t && e.stun <= W.t) {
    const from = Math.atan2(o.sy - e.y, o.sx - e.x)
    if (Math.abs(angleDiff(from, e.facing)) <= Math.PI / 3) {
      emit(W, 'clang', e.x, e.y - 24)
      fx(W, 'clang', e.x + Math.cos(e.facing) * 18, e.y - 20)
      sfx(W, 'guardClang', e.x, e.y)
      return 'blocked'
    }
  }
  if (o.tech && GUARDED.has(e.kind)) {
    e.guardOff = W.t + 3
    pop(W, 'ガードブレイク！', e.x, e.y - 60, -1)
  }
  const dmg = o.dmg * (e.ward > W.t ? 0.5 : 1)
  e.hp -= dmg
  e.hitAt = W.t
  e.alertAt ??= W.t
  const hero = heroBy(W, o.slot)
  if (hero) hero.stats.dmg += dmg
  const a = Math.atan2(e.y - o.sy, e.x - o.sx)
  const kbMul = GUARDED.has(e.kind) ? 0.4 : 1
  e.kx += Math.cos(a) * o.kb * kbMul
  e.ky += Math.sin(a) * o.kb * kbMul
  if (o.stun) e.stun = Math.max(e.stun, W.t + o.stun)
  emit(W, 'hit', e.x, e.y - 24, { a: r1(dmg), b: o.heavy ? 1 : 0, s: 'enemy' })
  fx(W, 'hit', e.x, e.y - 24)
  sfx(W, o.heavy ? 'hitHeavy' : 'hit', e.x, e.y)
  if (o.heavy) stop(W, 70)
  if (e.hp <= 0) {
    e.hp = 0
    e.state = 'death'
    e.st = W.t
    e.until = W.t + ENEMY_DEATH
    e.tele = undefined
    W.party.kos++
    if (hero) hero.stats.kos++
    emit(W, 'kill', e.x, e.y, { s: e.kind })
    sfx(W, 'enemyDie', e.x, e.y)
  } else if (e.state !== 'windup' || o.heavy || o.tech) {
    e.state = 'hurt'
    e.st = W.t
    e.until = W.t + ENEMY_HURT
    e.tele = undefined
    e.striking = false
  }
  return 'hit'
}

export function finishEnemyDeath(W: WorldState, e: Enemy): void {
  e.dead = true
  // A thief returns what it stole.
  if (e.carry > 0) {
    dropItems(
      W,
      e.x,
      e.y,
      Array.from({ length: e.carry }, () => 'gem' as const)
    )
    pop(W, 'ジェムをとりかえした！', e.x, e.y - 60, -1)
    e.carry = 0
  }
  fx(W, 'smoke', e.x, e.y)
  burst(W, 'smoke', e.x, e.y, 6)
  rollDrop(W, e.x, e.y, 'enemy')
}

export function hitBoss(W: WorldState, b: Boss, o: HitOpts): 'hit' | 'blocked' | 'none' {
  if (b.kind === 'milda') return hitMilda(W, b, o)
  if (b.kind === 'valk') return hitValk(W, b, o)
  if (b.kind === 'leon') return hitLeon(W, b, o)
  if (b.dead || !b.active || b.act === 'death') return 'none'
  const broken = b.broken > W.t
  // Heavy plate: normal hits are reduced; techniques are what really hurts him.
  let dmg = o.dmg * GARUD.armorMul * (broken ? GARUD.brokenMul : 1)
  if (!broken && !o.tech) {
    const off = Math.abs(angleDiff(Math.atan2(o.sy - b.y, o.sx - b.x), b.facing))
    if (off <= GARUD.guard) {
      emit(W, 'clang', b.x, b.y - 40)
      fx(W, 'clang', b.x + Math.cos(b.facing) * 34, b.y - 36)
      sfx(W, 'guardClang', b.x, b.y)
      return 'blocked'
    }
    if (off <= GARUD.side) dmg *= GARUD.sideMul
  }
  const steeled = b.steel > W.t
  if (o.tech && steeled) {
    // 鉄壁: right after a guard break the shield holds against techniques (reduced damage, no break).
    dmg = o.dmg * GARUD.steelTechMul
    emit(W, 'clang', b.x, b.y - 40)
    fx(W, 'clang', b.x + Math.cos(b.facing) * 34, b.y - 36)
    sfx(W, 'guardClang', b.x, b.y)
  } else if (o.tech) {
    dmg = o.dmg
    // A new guard break (also during a short wall stun); follow-up hits of the same technique don't extend it.
    if (b.broken < W.t + GARUD.breakTime - 1) {
      b.steelNext = true
      b.breaks++
      emit(W, 'banner', b.x, b.y, { s: 'ガードブレイク！' })
      sfx(W, 'guardBreak', b.x, b.y)
      shake(W, 10)
      b.broken = W.t + GARUD.breakTime
      b.act = 'broken'
      b.anim = 'broken'
      b.st = W.t
      b.until = b.broken
      b.tele = []
    }
  }
  b.hp = Math.max(0, b.hp - dmg)
  b.hitAt = W.t
  const hero = heroBy(W, o.slot)
  if (hero) hero.stats.dmg += dmg
  emit(W, 'hit', b.x, b.y - 50, { a: r1(dmg), b: o.heavy || o.tech ? 1 : 0, s: 'boss' })
  fx(W, 'hit', b.x, b.y - 50)
  sfx(W, o.tech || o.heavy ? 'hitHeavy' : 'hit', b.x, b.y)
  return 'hit'
}

/** Hits everything in an arc (spread = half-angle; ≥ π = full circle). Returns the number of enemy hits. */
export function hitArc(W: WorldState, x: number, y: number, r: number, a: number, spread: number, o: HitOpts): number {
  let n = 0
  const inArc = (tx: number, ty: number, tr: number) => {
    const d = dist(x, y, tx, ty)
    if (d > r + tr) return false
    if (spread >= Math.PI || d < tr + 6) return true
    return Math.abs(angleDiff(Math.atan2(ty - y, tx - x), a)) <= spread
  }
  for (const e of W.enemies)
    if (!e.dead && e.state !== 'death' && inArc(e.x, e.y, e.r)) hitEnemy(W, e, o) === 'hit' && n++
  const b = W.boss
  if (b && !b.dead && inArc(b.x, b.y, b.r)) hitBoss(W, b, o) === 'hit' && n++
  for (const p of W.props)
    if (
      !p.gone &&
      (p.kind === 'grass' || p.kind === 'crystal' || p.kind === 'bell' || p.kind === 'snowpile') &&
      inArc(p.x, p.y, 20)
    )
      hitProp(W, p, o.slot, !!o.tech)
  if (o.slot >= 0 && W.snares.length) hitSnares(W, x, y, Math.min(r, 120), o.slot)
  if (o.slot >= 0 && W.minions.length) n += hitMinions(W, x, y, r, o)
  if (W.pet) hitPetArc(W, inArc, o)
  return n
}

/* --------------------------------------------------------------------------------------------- attacks */

export function normalAttack(W: WorldState, h: Hero, aim: number): void {
  const n = formSize(W, h)
  const mul = formAttackMul(n)
  const { x, y } = h.body
  const base = JOB_STATS[h.job].dmg * mul
  h.atkReady = W.t + JOB_STATS[h.job].cooldown
  h.aim = aim
  h.body.facing = aim
  setState(W, h, 'attack', ATTACK_TIME)
  const o: HitOpts = { slot: h.slot, dmg: base, kb: 140, sx: x, sy: y }
  switch (h.job) {
    case 'sword':
      hitArc(W, x, y - 8, ATTACK.sword.r, aim, ATTACK.sword.spread, o)
      fx(W, `slash_${turnOf(aim)}`, x + Math.cos(aim) * 26, y - 20 + Math.sin(aim) * 26, aim)
      sfx(W, 'swing', x, y)
      break
    case 'cleric': {
      const hits = hitArc(W, x, y - 8, ATTACK.cleric.r, aim, ATTACK.cleric.spread, { ...o, kb: 110 })
      fx(W, 'bonk', x + Math.cos(aim) * 32, y - 16 + Math.sin(aim) * 32)
      sfx(W, 'staffBonk', x, y)
      if (hits > 0) {
        h.clericHits += hits
        if (h.clericHits >= 4) {
          h.clericHits -= 4
          const f = h.form >= 0 ? W.formations[h.form] : undefined
          for (const s of f?.slots ?? [h.slot]) {
            const m = heroBy(W, s)
            if (m) healHero(W, m, 1, h)
          }
          sfx(W, 'heal', x, y)
        }
      }
      break
    }
    case 'mage':
      fireShot(W, h, 'bolt', aim, ATTACK.bolt.speed, ATTACK.bolt.range, 0, 1, {
        burst: ATTACK.bolt.burst,
        burstDmg: base
      })
      sfx(W, 'magicCast', x, y)
      break
    case 'archer':
      fireShot(W, h, 'arrow', aim, ATTACK.arrow.speed, ATTACK.arrow.range, base, ATTACK.arrow.pierce)
      sfx(W, 'arrowShot', x, y)
      break
  }
}

export function jobSkill(W: WorldState, h: Hero, aim: number): void {
  const { x, y } = h.body
  h.aim = aim
  h.body.facing = aim
  h.atkReady = W.t + JOB_STATS[h.job].cooldown
  setState(W, h, 'skill', SKILL_TIME)
  const o: HitOpts = { slot: h.slot, dmg: 0, kb: 160, sx: x, sy: y, heavy: true }
  switch (h.job) {
    case 'sword':
      hitArc(W, x, y - 8, SKILL.spin.r, 0, Math.PI, { ...o, dmg: SKILL.spin.dmg, kb: SKILL.spin.kb })
      fx(W, 'spin', x, y - 16)
      sfx(W, 'spinSlash', x, y)
      shake(W, 4)
      break
    case 'mage':
      fireShot(W, h, 'orb', aim, SKILL.orb.speed, SKILL.orb.range, 0, 0, {
        burst: SKILL.orb.burst,
        burstDmg: SKILL.orb.dmg,
        burstAtEnd: true
      })
      sfx(W, 'orbCast', x, y)
      break
    case 'archer':
      for (const d of [-1, 0, 1])
        fireShot(
          W,
          h,
          'arrow',
          aim + d * SKILL.triple.spread,
          ATTACK.arrow.speed,
          ATTACK.arrow.range,
          SKILL.triple.dmg,
          SKILL.triple.pierce
        )
      sfx(W, 'tripleShot', x, y)
      break
    case 'cleric':
      hitArc(W, x, y, SKILL.holy.r, 0, Math.PI, { ...o, dmg: SKILL.holy.dmg })
      for (const m of W.heroes) if (dist(m.body.x, m.body.y, x, y) <= SKILL.holy.r) healHero(W, m, SKILL.holy.heal, h)
      fx(W, 'holy', x, y - 16)
      sfx(W, 'holyRing', x, y)
      break
  }
}

/* ----------------------------------------------------------------------------------------------- shots */

export function fireShot(
  W: WorldState,
  h: Hero,
  kind: ShotKind,
  a: number,
  speed: number,
  range: number,
  dmg: number,
  pierce: number,
  extra: { burst?: number; burstDmg?: number; burstAtEnd?: boolean } = {}
): Shot {
  const s: Shot = {
    id: newId(W),
    kind,
    x: h.body.x + Math.cos(a) * 14,
    y: h.body.y + Math.sin(a) * 14,
    z: 20,
    z0: 20,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    range,
    dmg,
    pierce,
    hits: new Set(),
    from: 'hero',
    slot: h.slot,
    burst: extra.burst ?? 0,
    burstDmg: extra.burstDmg ?? 0,
    dist: 0,
    dead: false
  }
  if (extra.burstAtEnd) s.burstAtEnd = true
  W.shots.push(s)
  return s
}

export function enemyShot(
  W: WorldState,
  x: number,
  y: number,
  a: number,
  kind: ShotKind,
  speed: number,
  dmg: number,
  range = 8 * TILE
): void {
  W.shots.push({
    id: newId(W),
    kind,
    x,
    y,
    z: 20,
    z0: 20,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    range,
    dmg,
    pierce: 0,
    hits: new Set(),
    from: 'enemy',
    slot: -1,
    burst: 0,
    burstDmg: 0,
    dist: 0,
    dead: false
  })
}

function shotBurst(W: WorldState, s: Shot): void {
  const big = s.kind === 'orb'
  hitArc(W, s.x, s.y, s.burst, 0, Math.PI, {
    slot: s.slot,
    dmg: s.burstDmg,
    kb: big ? 220 : 120,
    sx: s.x,
    sy: s.y,
    heavy: big,
    ranged: true
  })
  fx(W, big ? 'bigburst' : 'burst', s.x, s.y - 12)
  sfx(W, big ? 'orbBurst' : 'magicHit', s.x, s.y)
  if (big) shake(W, 5)
}

export function updateShots(W: WorldState, dt: number, onPotBreak: (W: WorldState, s: Shot) => void): void {
  const g = W.grid!
  for (const s of W.shots) {
    if (s.dead || s.lob) continue
    if (s.homing) {
      // Homing hex: turns toward the nearest hero, fades after its life.
      if (W.t > s.homing.until) {
        s.dead = true
        fx(W, 'hit', s.x, s.y)
        continue
      }
      let best: Hero | undefined
      let bd = Infinity
      for (const h of W.heroes) {
        if (h.state === 'down' || h.state === 'fall' || h.state === 'tech') continue
        const d = dist(h.body.x, h.body.y, s.x, s.y)
        if (d < bd) (bd = d), (best = h)
      }
      if (best) {
        const sp = Math.hypot(s.vx, s.vy)
        const cur = Math.atan2(s.vy, s.vx)
        const want = Math.atan2(best.body.y - 8 - s.y, best.body.x - s.x)
        const turn = Math.max(-s.homing.rate * dt, Math.min(s.homing.rate * dt, angleDiff(want, cur)))
        s.vx = Math.cos(cur + turn) * sp
        s.vy = Math.sin(cur + turn) * sp
      }
    }
    const step = Math.hypot(s.vx, s.vy) * dt
    const n = Math.max(1, Math.ceil(step / 12))
    for (let i = 0; i < n && !s.dead; i++) {
      s.x += (s.vx * dt) / n
      s.y += (s.vy * dt) / n
      s.dist += step / n
      if (THROWN.has(s.kind)) s.z = s.z0 * (1 - s.dist / s.range) + 30 * Math.sin((Math.PI * s.dist) / s.range)
      if (s.from === 'hero') shotVsTargets(W, s)
      else shotVsHeroes(W, s)
      if (s.dead) break
      if (g.shotBlocked(s.x, s.y) || s.dist >= s.range) {
        s.dead = true
        if (THROWN.has(s.kind)) onPotBreak(W, s)
        else if (s.burst && (s.burstAtEnd || g.shotBlocked(s.x, s.y))) shotBurst(W, s)
        else if (s.kind === 'arrow' || s.kind === 'enemy_arrow') fx(W, 'dust', s.x, s.y)
      }
    }
  }
  W.shots = W.shots.filter((s) => !s.dead)
}

function shotVsTargets(W: WorldState, s: Shot): void {
  const o = (): HitOpts => ({
    slot: s.slot,
    dmg: s.dmg,
    kb: 120,
    sx: s.x - s.vx * 0.05,
    sy: s.y - s.vy * 0.05,
    ranged: true
  })
  for (const m of W.minions) {
    if (m.dead || m.state === 'death' || s.hits.has(m.id)) continue
    if (dist(s.x, s.y, m.x, m.y) > 26) continue
    s.hits.add(m.id)
    if (s.burst) return void ((s.dead = true), shotBurst(W, s))
    hitMinion(W, m, o())
    if (s.pierce-- <= 0) return impact(W, s)
  }
  for (const p of W.props) {
    if (p.gone || (p.kind !== 'crystal' && p.kind !== 'bell') || s.hits.has(-p.id)) continue
    if (dist(s.x, s.y, p.x, p.y) < 36 || dist(s.x, s.y, p.x, p.y - 24) < 26) {
      s.hits.add(-p.id)
      hitProp(W, p, s.slot, false)
      impact(W, s)
      return
    }
  }
  for (const e of W.enemies) {
    if (e.dead || e.state === 'death' || s.hits.has(e.id)) continue
    if (dist(s.x, s.y, e.x, e.y - 12) > e.r + 10) continue
    s.hits.add(e.id)
    if (THROWN.has(s.kind)) return void ((s.dead = true), potHit(W, s, e))
    const res = s.burst ? 'hit' : hitEnemy(W, e, o())
    if (s.burst) return void ((s.dead = true), shotBurst(W, s))
    if (res === 'blocked' || s.pierce-- <= 0) return impact(W, s)
    if (s.kind === 'arrow') sfx(W, 'arrowHit', s.x, s.y)
  }
  const c = W.pet
  if (c && !c.dead && !s.hits.has(c.id) && dist(s.x, s.y, c.x, c.y - 30) < c.r + 10) {
    s.hits.add(c.id)
    if (THROWN.has(s.kind)) return void ((s.dead = true), potHit(W, s, undefined))
    hitPet(W, c, o())
    return impact(W, s)
  }
  const b = W.boss
  if (b && !b.dead && b.active && !s.hits.has(b.id) && dist(s.x, s.y, b.x, b.y - 30) < b.r + 10) {
    s.hits.add(b.id)
    if (THROWN.has(s.kind)) return void ((s.dead = true), potHit(W, s, undefined))
    if (s.burst) return void ((s.dead = true), shotBurst(W, s))
    hitBoss(W, b, o())
    impact(W, s)
  }
}

let potHit: (W: WorldState, s: Shot, e: Enemy | undefined) => void = () => {}
export function setPotHit(fn: typeof potHit): void {
  potHit = fn
}

function impact(W: WorldState, s: Shot): void {
  s.dead = true
  if (s.kind === 'arrow') sfx(W, 'arrowHit', s.x, s.y)
}

function shotVsHeroes(W: WorldState, s: Shot): void {
  for (const h of W.heroes) {
    if (h.state === 'down' || h.state === 'fall' || h.state === 'tech') continue
    if (h.body.z > 14 && s.kind !== 'gust') continue
    if (s.hits.has(-1000 - h.slot)) continue
    if (dist(s.x, s.y, h.body.x, h.body.y - 8) > (s.kind === 'gust' ? 30 : 22)) continue
    s.hits.add(-1000 - h.slot)
    if (s.kind === 'gust') {
      // The gust shoves even through invulnerability; walkers can be blown off a cliff.
      const sp = Math.hypot(s.vx, s.vy) || 1
      impulseHero(h, (s.vx / sp) * GUST.push, (s.vy / sp) * GUST.push)
      h.body.blown = GUST.blown
      hurtHero(W, h, s.dmg, s.x - s.vx * 0.05, s.y - s.vy * 0.05, 0)
      s.dead = true
      fx(W, 'gust', h.body.x, h.body.y)
      return
    }
    if (hurtHero(W, h, s.dmg, s.x - s.vx * 0.05, s.y - s.vy * 0.05)) {
      fx(W, 'hit', s.x, s.y)
      if (s.pierce-- > 0) continue
      s.dead = true
      return
    }
  }
}

function hitPetArc(W: WorldState, inArc: (x: number, y: number, r: number) => boolean, o: HitOpts): void {
  const p = W.pet!
  if (!p.dead && inArc(p.x, p.y, p.r)) hitPet(W, p, o)
}
