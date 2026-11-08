/**
 * The final boss (DESIGN §12): 勇者レオン (`leon`).
 *
 * - Phase 1: three-hit sword combos (cone telegraphs), dashes (line telegraph), a parry stance (attacks into it are
 *   blocked and the attacker is knocked back).
 * - Phase 2 (≤ 50%): 'awaken' (1.5 s, invulnerable), then holy pillars on circle telegraphs under the heroes and the
 *   holy shield bubble ('shield': immune) that only the pack technique breaks ('broken' 5 s). Summons two paladins
 *   once. Normal hits use plate armour (× LEON.armorMul; × 1.25 while broken); techniques do full damage.
 */
import { TILE } from '../vocab'
import {
  angleDiff,
  banner,
  dist,
  emit,
  freeSpotNear,
  fx,
  impulseHero,
  heroBy,
  newId,
  pop,
  r1,
  sfx,
  shake
} from './core'
import { hurtHero, type HitOpts } from './combat'
import { spawnEnemy } from './enemies'
import type { Boss, Hero, WorldState } from './state'

export const LEON = {
  hp: 640,
  r: 40,
  speed: 95,
  comboWindup: 0.35,
  comboR: 104,
  comboSpread: (60 * Math.PI) / 180,
  comboDmg: 2,
  slashTime: 5 / 16,
  slashHit: 2 / 16,
  dashWindup: 0.6,
  dashLen: 5 * TILE,
  dashSpeed: 700,
  dashDmg: 2,
  parryTime: 1.2,
  parryKb: 300,
  awakenTime: 1.5,
  pillarWindup: 0.9,
  pillarTime: 6 / 10,
  pillarR: 52,
  pillarDmg: 2,
  shieldTime: 9,
  shieldEvery: 13,
  breakTime: 5,
  armorMul: 0.25,
  brokenMul: 1.25,
  deathTime: 1
}

/** Directional animation base names (`<name>_<dir>` in BOSS_SPEC.leon). */
export const LEON_DIR_ANIMS = new Set(['idle', 'walk', 'windup', 'slash', 'dash', 'hurt'])

export function createLeon(W: WorldState, x: number, y: number): Boss {
  return {
    id: newId(W),
    kind: 'leon',
    x,
    y,
    z: 0,
    r: LEON.r,
    facing: Math.PI / 2,
    hp: LEON.hp,
    maxHp: LEON.hp,
    anim: 'idle',
    st: W.t,
    until: 0,
    phase: 1,
    active: false,
    broken: 0,
    tele: [],
    cd: 0,
    act: 'idle',
    aimA: 0,
    chargeLeft: 0,
    calls: 0,
    breaks: 0,
    secondSweep: false,
    steel: 0,
    steelNext: false,
    hitSet: new Set(),
    dead: false,
    homeX: x,
    homeY: y
  }
}

const targetable = (h: Hero) => h.state !== 'down' && h.state !== 'fall' && h.state !== 'tech'

function setAct(W: WorldState, b: Boss, act: string, anim: string, dur: number): void {
  b.act = act
  if (b.anim !== anim || dur > 0) b.st = W.t
  b.anim = anim
  b.until = dur > 0 ? W.t + dur : 0
}

/** Parry stance until (kept in `chargeLeft` as a time). */
export const leonParry = (b: Boss) => (b.act === 'parry' ? b.until : 0)

export function hitLeon(W: WorldState, b: Boss, o: HitOpts): 'hit' | 'blocked' | 'none' {
  if (b.dead || !b.active || b.act === 'death') return 'none'
  const clang = () => {
    emit(W, 'clang', b.x, b.y - 50)
    fx(W, 'clang', b.x + Math.cos(b.facing) * 30, b.y - 50)
    sfx(W, 'guardClang', b.x, b.y)
  }
  if (b.act === 'awaken' || b.act === 'shield') {
    clang()
    if (W.t - (b.hitAt ?? -9) > 0.8) pop(W, b.act === 'shield' ? '聖なる盾！' : '……', b.x, b.y - 130, -1)
    b.hitAt = W.t
    return 'blocked'
  }
  if (b.act === 'parry' && !o.tech) {
    clang()
    const h = heroBy(W, o.slot)
    if (h && dist(h.body.x, h.body.y, b.x, b.y) < 220) {
      const a = Math.atan2(h.body.y - b.y, h.body.x - b.x)
      impulseHero(h, Math.cos(a) * LEON.parryKb, Math.sin(a) * LEON.parryKb)
    }
    if (W.t - (b.hitAt ?? -9) > 0.6) pop(W, 'パリィ！', b.x, b.y - 130, -1)
    b.hitAt = W.t
    return 'blocked'
  }
  const broken = b.broken > W.t
  const dmg = o.tech ? o.dmg : o.dmg * LEON.armorMul * (broken ? LEON.brokenMul : 1)
  b.hp = Math.max(0, b.hp - dmg)
  b.hitAt = W.t
  emit(W, 'hit', b.x, b.y - 50, { a: r1(dmg), b: o.tech || o.heavy ? 1 : 0, s: 'boss' })
  fx(W, 'hit', b.x, b.y - 50)
  sfx(W, o.tech || o.heavy ? 'hitHeavy' : 'hit', b.x, b.y)
  return 'hit'
}

/** The pack technique's howl at (x, y) breaks the holy shield. */
export function packBoss(W: WorldState, x: number, y: number): void {
  const b = W.boss
  if (!b || b.kind !== 'leon' || !b.active || b.dead || b.act !== 'shield') return
  if (dist(b.x, b.y, x, y) > 6 * TILE) return
  b.breaks++
  b.broken = W.t + LEON.breakTime
  b.tele = []
  setAct(W, b, 'broken', 'broken', LEON.breakTime)
  banner(W, '聖なる盾をくだいた！')
  sfx(W, 'guardBreak', b.x, b.y)
  shake(W, 10)
}

export function updateLeon(W: WorldState, dt: number): void {
  const b = W.boss!
  const t = W.t
  if (b.act === 'death') {
    if (t >= b.until) {
      b.dead = true
      fx(W, 'bigburst', b.x, b.y - 50)
      emit(W, 'notice', b.x, b.y, { s: 'レオンをたおした！' })
    }
    return
  }
  if (b.hp <= 0) {
    setAct(W, b, 'death', 'death', LEON.deathTime)
    b.tele = []
    banner(W, '勇者レオンをたおした！')
    sfx(W, 'bossDie', b.x, b.y)
    shake(W, 14)
    for (const e of W.enemies) if (e.state !== 'death') (e.hp = 0), (e.state = 'death'), (e.st = t), (e.until = t + 0.5)
    return
  }
  // Phase 2 begins with the awakening.
  if (b.phase === 1 && b.hp <= b.maxHp * 0.5 && b.act !== 'awaken') {
    b.phase = 2
    b.tele = []
    setAct(W, b, 'awaken', 'awaken', LEON.awakenTime)
    banner(W, '勇者レオン、覚醒！')
    sfx(W, 'bossRoar', b.x, b.y)
    shake(W, 10)
    return
  }
  let near: Hero | undefined
  let nd = Infinity
  for (const h of W.heroes) {
    if (!targetable(h)) continue
    const d = dist(h.body.x, h.body.y, b.x, b.y)
    if (d < nd) (nd = d), (near = h)
  }
  const toNear = near ? Math.atan2(near.body.y - b.y, near.body.x - b.x) : b.facing
  const move = (dx: number, dy: number) => {
    const out = W.grid!.move(b.x, b.y, dx, dy, b.r, false)
    b.x = out.x
    b.y = out.y
  }
  switch (b.act) {
    case 'idle':
    case 'walk': {
      if (!near) break
      b.facing = toNear
      if (b.phase >= 2 && t >= b.steel) {
        startShield(W, b)
        break
      }
      if (t >= b.cd) {
        choose(W, b, near, nd)
        break
      }
      if (nd > 90) {
        move(Math.cos(toNear) * LEON.speed * dt, Math.sin(toNear) * LEON.speed * dt)
        if (b.anim !== 'walk') setAct(W, b, 'walk', 'walk', 0)
      } else if (b.anim !== 'idle') setAct(W, b, 'idle', 'idle', 0)
      break
    }
    case 'combowind':
      if (t >= b.until) {
        setAct(W, b, 'slash', 'slash', LEON.slashTime)
        b.hitSet.clear()
        b.tele = []
        sfx(W, 'swing', b.x, b.y)
      }
      break
    case 'slash':
      if (t - b.st >= LEON.slashHit && !b.hitSet.has(-1)) {
        b.hitSet.add(-1)
        move(Math.cos(b.aimA) * 24, Math.sin(b.aimA) * 24)
        for (const h of W.heroes) {
          if (!targetable(h)) continue
          const d = dist(h.body.x, h.body.y, b.x, b.y)
          const a = Math.atan2(h.body.y - b.y, h.body.x - b.x)
          if (d < LEON.comboR + 16 && Math.abs(angleDiff(a, b.aimA)) <= LEON.comboSpread)
            hurtHero(W, h, LEON.comboDmg, b.x, b.y, 220)
        }
      }
      if (t >= b.until) {
        b.calls++
        if (b.calls % 3 !== 0 && near) startCombo(W, b, toNear)
        else {
          setAct(W, b, 'idle', 'idle', 0)
          b.cd = t + 1.1
        }
      }
      break
    case 'dashwind':
      if (t >= b.until) {
        setAct(W, b, 'dash', 'dash', LEON.dashLen / LEON.dashSpeed)
        b.hitSet.clear()
        b.tele = []
        sfx(W, 'bossCharge', b.x, b.y)
      }
      break
    case 'dash':
      move(Math.cos(b.aimA) * LEON.dashSpeed * dt, Math.sin(b.aimA) * LEON.dashSpeed * dt)
      for (const h of W.heroes)
        if (targetable(h) && !b.hitSet.has(h.slot) && dist(h.body.x, h.body.y, b.x, b.y) < b.r + 20) {
          b.hitSet.add(h.slot)
          hurtHero(W, h, LEON.dashDmg, b.x, b.y, 300)
        }
      if (t >= b.until) {
        setAct(W, b, 'idle', 'idle', 0)
        b.cd = t + 1.0
      }
      break
    case 'parry':
      b.facing = toNear
      if (t >= b.until) {
        setAct(W, b, 'idle', 'idle', 0)
        b.cd = t + 0.4
      }
      break
    case 'awaken':
      if (t >= b.until) {
        // Two paladins answer the call (once).
        if (!b.secondSweep) {
          b.secondSweep = true
          for (const dx of [-2, 2]) {
            const s = freeSpotNear(W, b.x + dx * TILE, b.y + TILE, 3)
            const e = spawnEnemy(W, 'paladin', s.x, s.y)
            e.alertAt = t
            e.summoned = true
            fx(W, 'smoke', s.x, s.y)
          }
        }
        startShield(W, b)
      }
      break
    case 'shield':
      // Inside the bubble: holy pillars every 2 s.
      if (t >= b.cd) pillars(W, b)
      resolvePillars(W, b)
      if (t >= b.until) {
        b.tele = []
        setAct(W, b, 'idle', 'idle', 0)
        b.cd = t + 0.8
        b.steel = t + LEON.shieldEvery - LEON.shieldTime
      }
      break
    case 'pillar':
      resolvePillars(W, b)
      if (t >= b.until) {
        setAct(W, b, 'idle', 'idle', 0)
        b.cd = t + 1.2
      }
      break
    case 'broken':
      resolvePillars(W, b)
      if (t >= b.until) {
        b.tele = []
        setAct(W, b, 'idle', 'idle', 0)
        b.cd = t + 0.6
        b.steel = t + LEON.shieldEvery - LEON.shieldTime
        sfx(W, 'bossRoar', b.x, b.y)
      }
      break
  }
}

function startShield(W: WorldState, b: Boss): void {
  setAct(W, b, 'shield', 'shield', LEON.shieldTime)
  b.cd = W.t + 0.8
  b.tele = []
  sfx(W, 'holyRing', b.x, b.y)
  emit(W, 'notice', b.x, b.y, { s: '聖なる盾：月下群狼陣でくだこう！' })
}

function startCombo(W: WorldState, b: Boss, a: number): void {
  const t = W.t
  b.aimA = a
  b.facing = a
  setAct(W, b, 'combowind', 'windup', LEON.comboWindup)
  b.tele = [
    {
      kind: 'cone',
      x: Math.round(b.x),
      y: Math.round(b.y),
      r: LEON.comboR,
      a: Math.round(a * 100) / 100,
      spread: Math.round(LEON.comboSpread * 100) / 100,
      from: t,
      until: t + LEON.comboWindup
    }
  ]
  sfx(W, 'enemyWindup', b.x, b.y)
}

function choose(W: WorldState, b: Boss, near: Hero, d: number): void {
  const t = W.t
  const a = Math.atan2(near.body.y - b.y, near.body.x - b.x)
  if (b.phase >= 2 && W.rng.chance(0.4)) {
    setAct(W, b, 'pillar', 'pillar', LEON.pillarTime + LEON.pillarWindup)
    pillars(W, b)
    return
  }
  if (d > 220) {
    b.aimA = a
    b.facing = a
    setAct(W, b, 'dashwind', 'windup', LEON.dashWindup)
    b.tele = [
      {
        kind: 'line',
        x: Math.round(b.x),
        y: Math.round(b.y),
        r: 80,
        a: Math.round(a * 100) / 100,
        len: LEON.dashLen,
        from: t,
        until: t + LEON.dashWindup
      }
    ]
    sfx(W, 'enemyWindup', b.x, b.y)
    return
  }
  if (W.rng.chance(0.35)) {
    setAct(W, b, 'parry', 'windup', LEON.parryTime)
    pop(W, '構え…', b.x, b.y - 130, -1)
    sfx(W, 'guardClang', b.x, b.y)
    return
  }
  b.calls = 0
  startCombo(W, b, a)
}

/** Circle telegraphs under (up to four) heroes; they erupt after the windup. */
function pillars(W: WorldState, b: Boss): void {
  const t = W.t
  b.cd = t + 2
  const teles = W.heroes
    .filter(targetable)
    .slice(0, 4)
    .map((h) => ({
      kind: 'circle' as const,
      x: Math.round(h.body.x),
      y: Math.round(h.body.y),
      r: LEON.pillarR,
      from: t,
      until: t + LEON.pillarWindup
    }))
  b.tele = [...b.tele.filter((q) => q.until > t), ...teles]
  sfx(W, 'enemyCast', b.x, b.y)
}

function resolvePillars(W: WorldState, b: Boss): void {
  const t = W.t
  const due = b.tele.filter((q) => q.kind === 'circle' && q.until <= t)
  if (!due.length) return
  b.tele = b.tele.filter((q) => !(q.kind === 'circle' && q.until <= t))
  for (const q of due) {
    fx(W, 'pillar', q.x, q.y)
    for (const h of W.heroes)
      if (targetable(h) && dist(h.body.x, h.body.y, q.x, q.y) < q.r + 12)
        hurtHero(W, h, LEON.pillarDmg, q.x, q.y - 10, 200)
  }
  sfx(W, 'bossSlam', b.x, b.y)
}

export function resetLeon(W: WorldState): void {
  const b = W.boss!
  Object.assign(b, createLeon(W, b.homeX, b.homeY), { id: b.id })
}
