/** Summoned minions (stage 3: the falconer's hawk, sheet `minion:hawk`). */
import { dist, emit, fx, newId, pop, r1, sfx } from './core'
import { hurtHero, type HitOpts } from './combat'
import type { Hero, Minion, WorldState } from './state'

export const HAWK = {
  hp: 2,
  r: 14,
  z: 40,
  speed: 170,
  windup: 0.5,
  swoop: 0.35,
  swoopSpeed: 420,
  dmg: 1,
  cd: 2.2,
  death: 4 / 10
}

export function spawnHawk(W: WorldState, owner: number, x: number, y: number): Minion {
  const m: Minion = {
    id: newId(W),
    kind: 'hawk',
    owner,
    x,
    y,
    z: HAWK.z,
    facing: 0,
    state: 'fly',
    st: W.t,
    until: 0,
    hp: HAWK.hp,
    maxHp: HAWK.hp,
    aimA: 0,
    cd: W.t + 1,
    struck: false,
    dead: false
  }
  W.minions.push(m)
  sfx(W, 'crowCaw', x, y)
  return m
}

const targetable = (h: Hero) => h.state !== 'down' && h.state !== 'fall' && h.state !== 'tech'

export function updateMinions(W: WorldState, dt: number): void {
  const t = W.t
  for (const m of W.minions) {
    if (m.dead) continue
    if (m.state === 'death') {
      m.z = Math.max(0, m.z - 120 * dt)
      if (t >= m.until) {
        m.dead = true
        fx(W, 'smoke', m.x, m.y)
      }
      continue
    }
    if (m.state === 'hurt' && t >= m.until) m.state = 'fly'
    let best: Hero | undefined
    let bd = Infinity
    for (const h of W.heroes) {
      if (!targetable(h)) continue
      const d = dist(h.body.x, h.body.y, m.x, m.y)
      if (d < bd) (bd = d), (best = h)
    }
    if (m.state === 'swoop') {
      const k = Math.min(1, (t - m.st) / HAWK.swoop)
      m.x += Math.cos(m.aimA) * HAWK.swoopSpeed * dt
      m.y += Math.sin(m.aimA) * HAWK.swoopSpeed * dt
      m.z = HAWK.z * (1 - Math.sin(Math.PI * k) * 0.8)
      if (!m.struck)
        for (const h of W.heroes)
          if (targetable(h) && dist(h.body.x, h.body.y, m.x, m.y) < 26 && hurtHero(W, h, HAWK.dmg, m.x, m.y, 140)) {
            m.struck = true
            break
          }
      if (k >= 1) {
        m.state = 'fly'
        m.st = t
        m.z = HAWK.z
        m.cd = t + HAWK.cd
      }
      continue
    }
    if (!best) continue
    const a = Math.atan2(best.body.y - m.y, best.body.x - m.x)
    m.facing = a
    if (m.tele) {
      // Swoop windup: hover and aim along the telegraph.
      if (t >= m.until) {
        m.tele = undefined
        m.state = 'swoop'
        m.st = t
        m.struck = false
        sfx(W, 'lunge', m.x, m.y)
      }
      continue
    }
    if (t >= m.cd && bd < 130) {
      m.aimA = a
      m.until = t + HAWK.windup
      m.tele = {
        kind: 'line',
        x: Math.round(m.x),
        y: Math.round(m.y),
        r: 20,
        a: Math.round(a * 100) / 100,
        len: Math.round(HAWK.swoopSpeed * HAWK.swoop),
        from: t,
        until: m.until
      }
      sfx(W, 'enemyWindup', m.x, m.y)
      continue
    }
    if (bd > 90) {
      m.x += Math.cos(a) * HAWK.speed * dt
      m.y += Math.sin(a) * HAWK.speed * dt
    } else {
      // Circle around the target.
      m.x += Math.cos(a + Math.PI / 2) * HAWK.speed * 0.6 * dt
      m.y += Math.sin(a + Math.PI / 2) * HAWK.speed * 0.6 * dt
    }
  }
  W.minions = W.minions.filter((m) => !m.dead)
}

export function hitMinion(W: WorldState, m: Minion, o: HitOpts): boolean {
  if (m.dead || m.state === 'death') return false
  m.hp -= o.dmg
  m.hitAt = W.t
  emit(W, 'hit', m.x, m.y - m.z, { a: r1(o.dmg), s: 'enemy' })
  pop(W, `${Math.round(o.dmg * 10) / 10}`, m.x, m.y - m.z - 30, o.slot)
  fx(W, 'hit', m.x, m.y - m.z)
  sfx(W, 'hit', m.x, m.y)
  m.tele = undefined
  if (m.hp <= 0) {
    m.hp = 0
    m.state = 'death'
    m.st = W.t
    m.until = W.t + HAWK.death
    emit(W, 'kill', m.x, m.y, { s: 'hawk' })
    emit(W, 'burst', m.x, m.y - m.z, { s: 'feather', a: 8 })
  } else if (m.state !== 'swoop') {
    m.state = 'hurt'
    m.st = W.t
    m.until = W.t + 2 / 12
  }
  return true
}

/** Hits every minion within r of (x, y). */
export function hitMinions(W: WorldState, x: number, y: number, r: number, o: HitOpts): number {
  let n = 0
  for (const m of W.minions) if (!m.dead && dist(m.x, m.y, x, y) <= r + HAWK.r && hitMinion(W, m, o)) n++
  return n
}
