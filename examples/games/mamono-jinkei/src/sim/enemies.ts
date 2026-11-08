/** Stage enemies (DESIGN §10): melee, ranged, caster and shield archetypes. */
import { TILE, type EnemyKind } from '../vocab'
import { angleDiff, dist, emit, fx, newId, roomOf, sfx } from './core'
import { enemyShot, finishEnemyDeath, hurtHero } from './combat'
import type { Enemy, Hero, WorldState } from './state'
import { DEFAULT_ENEMY, ENEMY_STATS, NOTICE_RANGE } from './tables'

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
  }
  let mx = 0
  let my = 0
  const stunned = e.stun > t
  if (e.state === 'hurt' && t >= e.until) setEnemy(e, 'idle', t)
  if (!stunned && e.state !== 'hurt' && e.alertAt !== undefined && near) {
    const h = near.h
    const a = Math.atan2(h.body.y - e.y, h.body.x - e.x)
    // Shield bearers turn slowly; others face their target at once.
    if (s.type === 'shield') {
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
    }
  }
  // Movement with tile collision, knockback and separation.
  const sp = s.speed
  const k = 1 - Math.exp(-8 * dt)
  e.vx += (mx * sp - e.vx) * k
  e.vy += (my * sp - e.vy) * k
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
      const r = 48
      for (const m of W.heroes)
        if (targetable(m) && m.body.z < 10 && dist(m.body.x, m.body.y, e.px, e.py) < r + 8)
          hurtHero(W, m, 2, e.px, e.py)
      fx(W, 'burst', e.px, e.py - 10)
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
    e.tele = { kind: 'circle', x: Math.round(e.px), y: Math.round(e.py), r: 48, from: t, until: t + 1.0 }
    sfx(W, 'enemyCast', e.x, e.y)
    return [0, 0]
  }
  if (d < 3 * TILE) return [-Math.cos(a), -Math.sin(a)]
  if (d > 5 * TILE) return [Math.cos(a), Math.sin(a)]
  return [0, 0]
}
