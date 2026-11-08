/** Stage enemies (DESIGN §10): melee, ranged, caster and shield archetypes. */
import { TILE, type EnemyKind } from '../vocab'
import { angleDiff, dist, emit, fx, newId, pop, roomOf, sfx } from './core'
import { enemyShot, finishEnemyDeath, hurtHero } from './combat'
import type { Enemy, Hero, WorldState } from './state'
import {
  BOMB,
  DEFAULT_ENEMY,
  ENEMY_STATS,
  GUST,
  HEAVY,
  ICESPIKE,
  MONK,
  NOTICE_RANGE,
  SNARE,
  SNIPER,
  SPEAR,
  THIEF
} from './tables'
import { spawnHawk } from './minions'

export function spawnEnemy(W: WorldState, kind: EnemyKind, x: number, y: number, wave?: number): Enemy {
  const s = ENEMY_STATS[kind] ?? DEFAULT_ENEMY
  const e: Enemy = {
    id: newId(W),
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    r: s.r,
    facing: Math.PI / 2,
    hp: s.hp,
    maxHp: s.hp,
    state: 'idle',
    st: W.t,
    until: 0,
    stun: 0,
    guardOff: 0,
    cd: W.t + 0.8 + W.rng.range(0, 0.6),
    aimA: 0,
    room: roomOf(W, x, y)?.id,
    wave,
    dead: false,
    carry: 0,
    fleeUntil: 0,
    ward: 0,
    healAt: W.t + 2,
    ringAt: W.t + 4,
    px: 0,
    py: 0,
    striking: false
  }
  W.enemies.push(e)
  return e
}

const targetable = (h: Hero) => h.state !== 'down' && h.state !== 'fall' && h.state !== 'tech'

function nearestHero(W: WorldState, e: Enemy): { h: Hero; d: number } | undefined {
  let best: Hero | undefined
  let bd = Infinity
  for (const h of W.heroes) {
    if (!targetable(h)) continue
    const d = dist(h.body.x, h.body.y, e.x, e.y)
    if (d < bd) (bd = d), (best = h)
  }
  return best ? { h: best, d: bd } : undefined
}

export function updateEnemies(W: WorldState, dt: number): void {
  for (const e of W.enemies) {
    if (e.dead) continue
    if (e.state === 'death') {
      if (W.t >= e.until) finishEnemyDeath(W, e)
      continue
    }
    updateEnemy(W, e, dt)
  }
  W.enemies = W.enemies.filter((e) => !e.dead)
}

function updateEnemy(W: WorldState, e: Enemy, dt: number): void {
  const t = W.t
  const s = ENEMY_STATS[e.kind] ?? DEFAULT_ENEMY
  const near = nearestHero(W, e)
  // Notice.
  if (e.alertAt === undefined && near && near.d < NOTICE_RANGE) {
    e.alertAt = t
    sfx(W, 'enemyAlert', e.x, e.y)
    fx(W, 'alert', e.x, e.y - 60)
    // A beat after the "!" before the first attack (no surprise hits out of the dark).
    e.cd = Math.max(e.cd, t + 0.6)
  }
  let mx = 0
  let my = 0
  const stunned = e.stun > t
  if (e.state === 'hurt' && t >= e.until) setEnemy(e, 'idle', t)
  if (!stunned && e.state !== 'hurt' && e.alertAt !== undefined && near) {
    const h = near.h
    const a = Math.atan2(h.body.y - e.y, h.body.x - e.x)
    // Shield bearers turn slowly; others face their target at once.
    if (s.type === 'shield' || s.type === 'spear' || s.type === 'paladin' || s.type === 'heavy') {
      const d = angleDiff(a, e.facing)
      e.facing += Math.sign(d) * Math.min(Math.abs(d), 2.4 * dt)
    } else if (e.state !== 'windup' && e.state !== 'attack') e.facing = a
    switch (s.type) {
      case 'melee':
      case 'shield':
        ;[mx, my] = melee(W, e, h, near.d, a)
        break
      case 'ranged':
        ;[mx, my] = ranged(W, e, h, near.d, a)
        break
      case 'caster':
        ;[mx, my] = caster(W, e, h, near.d, a)
        break
      case 'dasher':
        ;[mx, my] = dasher(W, e, h, near.d, a)
        break
      case 'thrower':
        ;[mx, my] = thrower(W, e, h, near.d, a)
        break
      case 'trapper':
        ;[mx, my] = trapper(W, e, h, near.d, a)
        break
      case 'spear':
        ;[mx, my] = spear(W, e, h, near.d, a)
        break
      case 'summoner':
        ;[mx, my] = summoner(W, e, h, near.d, a)
        break
      case 'sniper':
        ;[mx, my] = sniper(W, e, h, near.d, a)
        break
      case 'gust':
        ;[mx, my] = gustMage(W, e, h, near.d, a)
        break
      case 'healer':
        ;[mx, my] = healer(W, e, h, near.d, a)
        break
      case 'hunter':
        ;[mx, my] = hunter(W, e, h, near.d, a)
        break
      case 'paladin':
        ;[mx, my] = paladin(W, e, h, near.d, a)
        break
      case 'icewitch':
        ;[mx, my] = caster(W, e, h, near.d, a)
        break
      case 'heavy':
        ;[mx, my] = heavy(W, e, h, near.d, a)
        break
    }
  }
  // Movement with tile collision, knockback and separation.
  const sp = s.speed
  const k = 1 - Math.exp(-8 * dt)
  if (e.state === 'dash') {
    e.vx = Math.cos(e.aimA) * THIEF.speed
    e.vy = Math.sin(e.aimA) * THIEF.speed
  } else {
    e.vx += (mx * sp - e.vx) * k
    e.vy += (my * sp - e.vy) * k
  }
  e.kx *= Math.exp(-9 * dt)
  e.ky *= Math.exp(-9 * dt)
  for (const o of W.enemies)
    if (o !== e && !o.dead) {
      const d = dist(o.x, o.y, e.x, e.y)
      if (d < e.r + o.r && d > 0.01) {
        e.kx += ((e.x - o.x) / d) * 8
        e.ky += ((e.y - o.y) / d) * 8
      }
    }
  for (const h of W.heroes) {
    if (!targetable(h) || h.body.z > 4) continue
    const d = dist(h.body.x, h.body.y, e.x, e.y)
    if (d < e.r + 16 && d > 0.01) {
      e.kx += ((e.x - h.body.x) / d) * 6
      e.ky += ((e.y - h.body.y) / d) * 6
    }
  }
  const out = W.grid!.move(e.x, e.y, (e.vx + e.kx) * dt, (e.vy + e.ky) * dt, e.r, false)
  e.x = out.x
  e.y = out.y
  // Stay inside the home room.
  const room = e.room ? W.parsed!.info.rooms.find((r) => r.id === e.room) : undefined
  if (room) {
    e.x = Math.max(room.x * TILE + e.r, Math.min((room.x + room.w) * TILE - e.r, e.x))
    e.y = Math.max(room.y * TILE + e.r, Math.min((room.y + room.h) * TILE - e.r, e.y))
  }
  if (e.state === 'idle' && Math.hypot(e.vx, e.vy) > 15) setEnemy(e, 'walk', t)
  if (e.state === 'walk' && Math.hypot(e.vx, e.vy) < 8) setEnemy(e, 'idle', t)
}

function setEnemy(e: Enemy, state: Enemy['state'], t: number, until = 0): void {
  if (e.state !== state) e.st = t
  e.state = state
  e.until = until
}

/** Approach → 0.4 s flashing windup → lunge strike → 0.6 s recover. Shield bearers bash. */
function melee(W: WorldState, e: Enemy, _h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  const shield = e.kind === 'shieldman'
  if (e.state === 'windup') {
    if (t >= e.until) {
      setEnemy(e, 'attack', t, t + 0.25)
      e.striking = true
      e.kx += Math.cos(e.aimA) * 220
      e.ky += Math.sin(e.aimA) * 220
      sfx(W, 'swing', e.x, e.y)
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (e.striking) {
      const px = e.x + Math.cos(e.aimA) * 30
      const py = e.y + Math.sin(e.aimA) * 30
      for (const m of W.heroes)
        if (targetable(m) && m.body.z < 10 && dist(m.body.x, m.body.y, px, py) < 34) {
          if (hurtHero(W, m, shield ? 2 : 1, e.x, e.y, shield ? 260 : 160)) e.striking = false
        }
    }
    if (t >= e.until) {
      e.striking = false
      e.tele = undefined
      setEnemy(e, 'idle', t)
      e.cd = t + 0.6 + W.rng.range(0, 0.4)
    }
    return [0, 0]
  }
  if (d < (shield ? 64 : 84) && t >= e.cd) {
    e.aimA = a
    e.facing = a
    const wind = shield ? 0.5 : 0.4
    setEnemy(e, 'windup', t, t + wind)
    e.tele = {
      kind: 'cone',
      x: Math.round(e.x),
      y: Math.round(e.y),
      r: 56,
      a: Math.round(a * 100) / 100,
      spread: 0.7,
      from: t,
      until: t + wind
    }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  if (d < 40) return [0, 0]
  return [Math.cos(a), Math.sin(a)]
}

/** Keeps 4–6 tiles, 0.5 s aim line, shoots. */
function ranged(W: WorldState, e: Enemy, _h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      enemyShot(W, e.x + Math.cos(e.aimA) * 16, e.y - 4 + Math.sin(e.aimA) * 16, e.aimA, 'enemy_arrow', 420, 1)
      sfx(W, 'enemyShot', e.x, e.y)
      setEnemy(e, 'attack', t, t + 0.2)
      e.tele = undefined
      e.cd = t + 1.6 + W.rng.range(0, 0.6)
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  if (t >= e.cd && d < 7 * TILE) {
    e.aimA = a
    setEnemy(e, 'windup', t, t + 0.5)
    e.tele = {
      kind: 'line',
      x: Math.round(e.x),
      y: Math.round(e.y),
      r: 8,
      a: Math.round(a * 100) / 100,
      len: 420,
      from: t,
      until: t + 0.5
    }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  if (d < 4 * TILE) return [-Math.cos(a), -Math.sin(a)]
  if (d > 6 * TILE) return [Math.cos(a), Math.sin(a)]
  return [0, 0]
}

/** 1.0 s ground circle at a hero, then a fire burst there. */
function caster(W: WorldState, e: Enemy, h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      const ice = e.kind === 'icewitch'
      const r = ice ? ICESPIKE.r : 48
      for (const m of W.heroes)
        if (targetable(m) && m.body.z < 10 && dist(m.body.x, m.body.y, e.px, e.py) < r + 8)
          hurtHero(W, m, ice ? ICESPIKE.dmg : 2, e.px, e.py)
      fx(W, ice ? 'icespike' : 'burst', e.px, e.py - 10)
      emit(W, 'burst', e.px, e.py, { s: 'spark', a: 10 })
      sfx(W, 'fireballHit', e.px, e.py)
      setEnemy(e, 'attack', t, t + 0.25)
      e.tele = undefined
      e.cd = t + 2.4 + W.rng.range(0, 0.8)
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  if (t >= e.cd && d < 6 * TILE) {
    e.px = h.body.x
    e.py = h.body.y
    setEnemy(e, 'windup', t, t + 1.0)
    e.tele = {
      kind: 'circle',
      x: Math.round(e.px),
      y: Math.round(e.py),
      r: e.kind === 'icewitch' ? ICESPIKE.r : 48,
      from: t,
      until: t + 1.0
    }
    sfx(W, 'enemyCast', e.x, e.y)
    return [0, 0]
  }
  if (d < 3 * TILE) return [-Math.cos(a), -Math.sin(a)]
  if (d > 5 * TILE) return [Math.cos(a), Math.sin(a)]
  return [0, 0]
}

/* ------------------------------------------------------------------------------------------- stage 2 */

/** Thief: dashes in (short line telegraph), steals 1–3 gems on a hit, flees, comes back. */
function dasher(W: WorldState, e: Enemy, h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.fleeUntil > t) return [-Math.cos(a), -Math.sin(a)]
  if (e.state === 'windup') {
    if (t >= e.until) {
      setEnemy(e, 'dash', t, t + THIEF.dash)
      e.striking = true
      e.tele = undefined
      sfx(W, 'ratDash', e.x, e.y)
    }
    return [0, 0]
  }
  if (e.state === 'dash') {
    if (e.striking)
      for (const m of W.heroes) {
        if (!targetable(m) || m.body.z > 10 || dist(m.body.x, m.body.y, e.x, e.y) > e.r + 18) continue
        if (!hurtHero(W, m, 1, e.x, e.y, 180)) continue
        e.striking = false
        const n = Math.min(W.party.gems, 1 + Math.floor(W.rng.next() * 3))
        if (n > 0) {
          W.party.gems -= n
          e.carry += n
          pop(W, `ジェムを${n}こ とられた！`, m.body.x, m.body.y - 70, -1)
          sfx(W, 'gem', e.x, e.y)
        }
        e.fleeUntil = t + THIEF.flee
        break
      }
    if (t >= e.until) {
      setEnemy(e, 'idle', t)
      e.cd = t + 1.4 + W.rng.range(0, 0.6)
      if (e.striking) e.fleeUntil = t + 0.8
      e.striking = false
    }
    return [0, 0]
  }
  if (d < THIEF.range && t >= e.cd) {
    e.aimA = a
    e.facing = a
    setEnemy(e, 'windup', t, t + THIEF.windup)
    e.tele = {
      kind: 'line',
      x: Math.round(e.x),
      y: Math.round(e.y),
      r: 26,
      a: Math.round(a * 100) / 100,
      len: THIEF.speed * THIEF.dash,
      from: t,
      until: t + THIEF.windup
    }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  return d > 110 ? [Math.cos(a), Math.sin(a)] : [Math.cos(a + 1.3) * 0.7, Math.sin(a + 1.3) * 0.7]
}

/** Alchemist: keeps 3–5 tiles away, lobs a flask onto a ground marker; it bursts on landing. */
function thrower(W: WorldState, e: Enemy, h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      setEnemy(e, 'attack', t, t + 0.25)
      W.shots.push({
        id: newId(W),
        kind: 'bomb',
        x: e.x,
        y: e.y,
        z: 30,
        z0: 30,
        vx: (e.px - e.x) / BOMB.flight,
        vy: (e.py - e.y) / BOMB.flight,
        range: 1e9,
        dmg: BOMB.dmg,
        pierce: 0,
        hits: new Set(),
        from: 'enemy',
        slot: -1,
        burst: BOMB.r,
        burstDmg: BOMB.dmg,
        dist: 0,
        dead: false,
        lob: { x0: e.x, y0: e.y, tx: e.px, ty: e.py, t0: t, dur: BOMB.flight }
      })
      e.tele = {
        kind: 'circle',
        x: Math.round(e.px),
        y: Math.round(e.py),
        r: BOMB.r,
        from: e.st,
        until: t + BOMB.flight
      }
      sfx(W, 'throw', e.x, e.y)
      e.cd = t + 2.6 + W.rng.range(0, 0.8)
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  if (e.tele && t > e.tele.until) e.tele = undefined
  if (t >= e.cd && d < 6 * TILE) {
    e.px = h.body.x + h.body.vx * 0.4
    e.py = h.body.y + h.body.vy * 0.4
    setEnemy(e, 'windup', t, t + BOMB.windup)
    e.tele = {
      kind: 'circle',
      x: Math.round(e.px),
      y: Math.round(e.py),
      r: BOMB.r,
      from: t,
      until: t + BOMB.windup + BOMB.flight
    }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  if (d < 3 * TILE) return [-Math.cos(a), -Math.sin(a)]
  if (d > 5 * TILE) return [Math.cos(a), Math.sin(a)]
  return [0, 0]
}

/** Lobbed bombs fly along an arc and burst on their marker. */
export function updateBombs(W: WorldState): void {
  for (const s of W.shots) {
    if (!s.lob || s.dead) continue
    const k = Math.min(1, (W.t - s.lob.t0) / s.lob.dur)
    s.x = s.lob.x0 + (s.lob.tx - s.lob.x0) * k
    s.y = s.lob.y0 + (s.lob.ty - s.lob.y0) * k
    s.z = 30 * (1 - k) + 4 * BOMB.height * k * (1 - k)
    if (k < 1) continue
    s.dead = true
    for (const m of W.heroes)
      if (targetable(m) && m.body.z < 10 && dist(m.body.x, m.body.y, s.x, s.y) < s.burst + 10)
        hurtHero(W, m, s.burstDmg, s.x, s.y)
    fx(W, 'bomb_burst', s.x, s.y - 10)
    emit(W, 'burst', s.x, s.y, { s: 'smoke', a: 10 })
    sfx(W, 'fireballHit', s.x, s.y)
  }
}

/** Rat-catcher: keeps its distance and sets snares where heroes walk. */
function trapper(W: WorldState, e: Enemy, h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      W.snares.push({ id: newId(W), x: e.px, y: e.py, st: t, owner: e.id, until: t + SNARE.life })
      setEnemy(e, 'attack', t, t + 0.25)
      e.tele = undefined
      e.cd = t + 3.2 + W.rng.range(0, 0.8)
      sfx(W, 'putDown', e.px, e.py)
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  const mine = W.snares.filter((q) => q.owner === e.id).length
  if (t >= e.cd && d < 6 * TILE && mine < SNARE.perCatcher) {
    const g = W.grid!
    const px = h.body.x + h.body.vx * 0.6
    const py = h.body.y + h.body.vy * 0.6
    const ok = g.free(Math.floor(px / TILE), Math.floor(py / TILE))
    e.px = ok ? px : h.body.x
    e.py = ok ? py : h.body.y
    setEnemy(e, 'windup', t, t + SNARE.windup)
    e.tele = { kind: 'circle', x: Math.round(e.px), y: Math.round(e.py), r: 24, from: t, until: t + SNARE.windup }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  if (d < 3 * TILE) return [-Math.cos(a), -Math.sin(a)]
  if (d > 5 * TILE) return [Math.cos(a), Math.sin(a)]
  return [0, 0]
}

/** Snares hold the hero who steps on them 1.5 s; an ally's hit on the snare frees them sooner. */
export function updateSnares(W: WorldState): void {
  const t = W.t
  for (const sn of W.snares) {
    if (sn.slot !== undefined) {
      if (t >= sn.until) {
        const h = W.heroes.find((m) => m.slot === sn.slot)
        if (h) h.snared = 0
        sn.until = -1
      }
      continue
    }
    if (t >= sn.until) {
      sn.until = -1
      continue
    }
    for (const h of W.heroes) {
      if (!targetable(h) || h.body.z > 0.01 || (h.body.dashT >= 0 && h.body.dashT <= 0.22)) continue
      if (dist(h.body.x, h.body.y, sn.x, sn.y) > 20) continue
      sn.slot = h.slot
      sn.st = t
      sn.until = t + SNARE.hold
      h.snared = sn.until
      h.body.vx = h.body.vy = 0
      fx(W, 'snare_snap', sn.x, sn.y)
      sfx(W, 'stun', sn.x, sn.y)
      pop(W, 'つかまった！', h.body.x, h.body.y - 70, -1)
      break
    }
  }
  W.snares = W.snares.filter((q) => q.until >= 0)
}

/** A hero's attack reaches snares at (x, y) within r: an ally frees a held hero; empty snares break. */
export function hitSnares(W: WorldState, x: number, y: number, r: number, slot: number): void {
  for (const sn of W.snares) {
    if (dist(sn.x, sn.y, x, y) > r + 16 || sn.slot === slot) continue
    if (sn.slot !== undefined) {
      const h = W.heroes.find((m) => m.slot === sn.slot)
      if (h) {
        h.snared = 0
        pop(W, 'たすかった！', h.body.x, h.body.y - 70, slot)
      }
    }
    sn.until = -1
    fx(W, 'hit', sn.x, sn.y)
    sfx(W, 'hit', sn.x, sn.y)
  }
  W.snares = W.snares.filter((q) => q.until >= 0)
}

/** Spear guard: guarded front, slow turn, long-reach thrust after a line telegraph. */
function spear(W: WorldState, e: Enemy, h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      // The thrust, then a long recovery with the guard down (the opening).
      setEnemy(e, 'attack', t, t + SPEAR.recover)
      e.tele = undefined
      sfx(W, 'swing', e.x, e.y)
      for (const m of W.heroes) {
        if (!targetable(m) || m.body.z > 10) continue
        const dx = m.body.x - e.x
        const dy = m.body.y - e.y
        const along = dx * Math.cos(e.aimA) + dy * Math.sin(e.aimA)
        const side = Math.abs(-dx * Math.sin(e.aimA) + dy * Math.cos(e.aimA))
        if (along > 0 && along < SPEAR.reach + e.r + 16 && side < SPEAR.width / 2 + 16)
          hurtHero(W, m, SPEAR.dmg, e.x, e.y, 220)
      }
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) {
      setEnemy(e, 'idle', t)
      e.cd = t + 1.2 + W.rng.range(0, 0.6)
    }
    return [0, 0]
  }
  if (d < SPEAR.reach + 30 && t >= e.cd) {
    e.aimA = e.facing
    setEnemy(e, 'windup', t, t + SPEAR.windup)
    e.tele = {
      kind: 'line',
      x: Math.round(e.x),
      y: Math.round(e.y),
      r: SPEAR.width,
      a: Math.round(e.aimA * 100) / 100,
      len: SPEAR.reach + e.r,
      from: t,
      until: t + SPEAR.windup
    }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  if (d < SPEAR.reach - 10) return [-Math.cos(a) * 0.5, -Math.sin(a) * 0.5]
  return [Math.cos(a), Math.sin(a)]
}

/* ------------------------------------------------------------------------------------------- stage 3 */

/** Keeps its distance: [mx, my] for a preferred band (tiles). */
const keepBand = (d: number, a: number, near: number, far: number): [number, number] =>
  d < near * TILE ? [-Math.cos(a), -Math.sin(a)] : d > far * TILE ? [Math.cos(a), Math.sin(a)] : [0, 0]

/** Falconer: sends its hawk (one at a time) and keeps 4–6 tiles away. */
function summoner(W: WorldState, e: Enemy, _h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      spawnHawk(W, e.id, e.x, e.y - 10)
      setEnemy(e, 'attack', t, t + 0.3)
      e.cd = t + 4
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  if (t >= e.cd && d < 7 * TILE && !W.minions.some((m) => m.owner === e.id && !m.dead)) {
    setEnemy(e, 'windup', t, t + 0.6)
    sfx(W, 'crowCaw', e.x, e.y)
    return [0, 0]
  }
  return keepBand(d, a, 4, 6)
}

/** Crossbowman: a long 0.8 s aim line, then a fast bolt that pierces two heroes. */
function sniper(W: WorldState, e: Enemy, _h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      enemyShot(
        W,
        e.x + Math.cos(e.aimA) * 16,
        e.y - 4 + Math.sin(e.aimA) * 16,
        e.aimA,
        'enemy_arrow',
        SNIPER.speed,
        SNIPER.dmg,
        SNIPER.len
      )
      const shot = W.shots[W.shots.length - 1]
      shot.pierce = SNIPER.pierce
      sfx(W, 'enemyShot', e.x, e.y)
      setEnemy(e, 'attack', t, t + 0.3)
      e.tele = undefined
      e.cd = t + 2.4 + W.rng.range(0, 0.8)
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  if (t >= e.cd && d < 9 * TILE) {
    e.aimA = a
    setEnemy(e, 'windup', t, t + SNIPER.aim)
    e.tele = {
      kind: 'line',
      x: Math.round(e.x),
      y: Math.round(e.y),
      r: 10,
      a: Math.round(a * 100) / 100,
      len: SNIPER.len,
      from: t,
      until: t + SNIPER.aim
    }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  return keepBand(d, a, 5, 8)
}

/** Wind mage: a telegraphed gust that shoves heroes (toward the edges is the danger). */
function gustMage(W: WorldState, e: Enemy, _h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      enemyShot(
        W,
        e.x + Math.cos(e.aimA) * 20,
        e.y + Math.sin(e.aimA) * 20,
        e.aimA,
        'gust',
        GUST.speed,
        GUST.dmg,
        GUST.range
      )
      sfx(W, 'tornado', e.x, e.y)
      setEnemy(e, 'attack', t, t + 0.3)
      e.tele = undefined
      e.cd = t + 2.8 + W.rng.range(0, 0.8)
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  if (t >= e.cd && d < 6 * TILE) {
    e.aimA = a
    setEnemy(e, 'windup', t, t + GUST.windup)
    e.tele = {
      kind: 'line',
      x: Math.round(e.x),
      y: Math.round(e.y),
      r: GUST.width,
      a: Math.round(a * 100) / 100,
      len: GUST.range,
      from: t,
      until: t + GUST.windup
    }
    sfx(W, 'enemyCast', e.x, e.y)
    return [0, 0]
  }
  return keepBand(d, a, 3, 5)
}

/** Bell monk: heals the most hurt ally every 3 s; rings its bell to ward nearby allies (damage halved, 4 s). */
function healer(W: WorldState, e: Enemy, _h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'heal') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  const allies = W.enemies.filter((o) => !o.dead && o.state !== 'death' && dist(o.x, o.y, e.x, e.y) < 6 * TILE)
  if (t >= e.healAt) {
    e.healAt = t + MONK.healEvery
    const hurt = allies.filter((o) => o.hp < o.maxHp).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0]
    if (hurt) {
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + MONK.heal)
      setEnemy(e, 'heal', t, t + 0.4)
      emit(W, 'heal', hurt.x, hurt.y, { a: MONK.heal })
      fx(W, 'heal', hurt.x, hurt.y)
      sfx(W, 'heal', e.x, e.y)
      return [0, 0]
    }
  }
  if (t >= e.ringAt) {
    e.ringAt = t + MONK.ringEvery
    for (const o of allies) if (dist(o.x, o.y, e.x, e.y) < MONK.wardR) o.ward = t + MONK.ward
    setEnemy(e, 'heal', t, t + 0.4)
    fx(W, 'holy', e.x, e.y - 16)
    sfx(W, 'bell', e.x, e.y)
    emit(W, 'notice', e.x, e.y, { s: '鐘の守り：まわりの敵のダメージ半減' })
    return [0, 0]
  }
  return keepBand(d, a, 4, 6)
}

/* ------------------------------------------------------------------------------------------- stage 4 */

/** Hunter: sets up to two snares now and then; otherwise shoots arrows after an aim line. */
function hunter(W: WorldState, e: Enemy, h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  // target: 1 = about to set a snare, 2 = setting it.
  if (e.target === 1) {
    const r = trapper(W, e, h, d, a)
    if (e.state === 'windup' || e.state === 'attack') e.target = 2
    return r
  }
  if (e.target === 2) {
    const r = trapper(W, e, h, d, a)
    if (e.state === 'idle' || e.state === 'walk') e.target = 0
    return r
  }
  const mine = W.snares.filter((q) => q.owner === e.id).length
  if ((e.state === 'idle' || e.state === 'walk') && t >= e.healAt && mine < 2 && d < 6 * TILE) {
    e.target = 1
    e.healAt = t + 6
    e.cd = t
    const r = trapper(W, e, h, d, a)
    if ((e.state as string) === 'windup') e.target = 2
    return r
  }
  return ranged(W, e, h, d, a)
}

/** Paladin: a guarded shield bearer that heals the most hurt ally every 3 s. */
function paladin(W: WorldState, e: Enemy, h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'heal') {
    if (t >= e.until) setEnemy(e, 'idle', t)
    return [0, 0]
  }
  if ((e.state === 'idle' || e.state === 'walk') && t >= e.healAt) {
    e.healAt = t + MONK.healEvery
    const hurt = W.enemies
      .filter((o) => !o.dead && o.state !== 'death' && o.hp < o.maxHp && dist(o.x, o.y, e.x, e.y) < 6 * TILE)
      .sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0]
    if (hurt) {
      hurt.hp = Math.min(hurt.maxHp, hurt.hp + MONK.heal)
      setEnemy(e, 'heal', t, t + 0.4)
      emit(W, 'heal', hurt.x, hurt.y, { a: MONK.heal })
      fx(W, 'heal', hurt.x, hurt.y)
      sfx(W, 'heal', e.x, e.y)
      return [0, 0]
    }
  }
  return melee(W, e, h, d, a)
}

/** Heavy: slow and guarded; a long-windup overhead smash (3 dmg), then a long recovery with the guard open. */
function heavy(W: WorldState, e: Enemy, _h: Hero, d: number, a: number): [number, number] {
  const t = W.t
  if (e.state === 'windup') {
    if (t >= e.until) {
      setEnemy(e, 'attack', t, t + HEAVY.recover)
      e.tele = undefined
      sfx(W, 'bossSlam', e.x, e.y)
      fx(W, 'shock', e.x + Math.cos(e.aimA) * 50, e.y + Math.sin(e.aimA) * 50)
      for (const m of W.heroes) {
        if (!targetable(m) || m.body.z > 10) continue
        const dd = dist(m.body.x, m.body.y, e.x, e.y)
        const aa = Math.atan2(m.body.y - e.y, m.body.x - e.x)
        if (dd < HEAVY.r + 16 && Math.abs(angleDiff(aa, e.aimA)) <= HEAVY.spread)
          hurtHero(W, m, HEAVY.dmg, e.x, e.y, HEAVY.kb)
      }
    }
    return [0, 0]
  }
  if (e.state === 'attack') {
    if (t >= e.until) {
      setEnemy(e, 'idle', t)
      e.cd = t + 1.4 + W.rng.range(0, 0.6)
    }
    return [0, 0]
  }
  if (d < HEAVY.r && t >= e.cd) {
    e.aimA = e.facing
    setEnemy(e, 'windup', t, t + HEAVY.windup)
    e.tele = {
      kind: 'cone',
      x: Math.round(e.x),
      y: Math.round(e.y),
      r: HEAVY.r,
      a: Math.round(e.aimA * 100) / 100,
      spread: Math.round(HEAVY.spread * 100) / 100,
      from: t,
      until: t + HEAVY.windup
    }
    sfx(W, 'enemyWindup', e.x, e.y)
    return [0, 0]
  }
  return d > 60 ? [Math.cos(a), Math.sin(a)] : [0, 0]
}
