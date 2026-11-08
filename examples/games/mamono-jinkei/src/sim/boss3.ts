/**
 * Stage-3 boss (DESIGN §12): 竜騎士ヴァルク (`valk`) on his wyvern.
 *
 * - Flies out of reach (z ≈ 80): only arrows, bolts and orbs hit (× VALK.flyMul); melee clangs off.
 * - Dives along a line telegraph (2 dmg), sweeps fire breath (cone telegraph, then `fire_breath` puff shots).
 * - Now and then lands for 3 s ('ground'): normal hits with plate armour (× VALK.armorMul).
 * - The tornado pulls him down ('downed' 5 s): armour × VALK.downMul. Afterwards he is wary for a while (the
 *   tornado no longer pulls him). Phase 2 (≤ 50%): double dives and longer breath.
 */
import { TILE } from '../vocab'
import { angleDiff, banner, dist, emit, freeSpotNear, fx, newId, pop, r1, sfx, shake } from './core'
import { hurtHero, type HitOpts } from './combat'
import type { Boss, Hero, WorldState } from './state'

export const VALK = {
  hp: 290,
  r: 48,
  flyZ: 80,
  speed: 140,
  diveWindup: 0.8,
  p2DiveWindup2: 0.55,
  diveSpeed: 640,
  diveLen: 7 * TILE,
  diveDmg: 2,
  breathWindup: 0.8,
  breathTime: 1.2,
  p2BreathTime: 1.8,
  breathR: 220,
  breathSpread: (40 * Math.PI) / 180,
  puffSpeed: 320,
  puffDmg: 1,
  groundTime: 3,
  downTime: 5,
  armorMul: 0.25,
  flyMul: 0.5,
  downMul: 1.25,
  waryTime: 8,
  deathTime: 1
}

/** Directional animation base names (`<name>_<dir>` in BOSS_SPEC.valk). */
export const VALK_DIR_ANIMS = new Set(['fly', 'dive', 'breath', 'ground', 'hurt'])

export function createValk(W: WorldState, x: number, y: number): Boss {
  return {
    id: newId(W),
    kind: 'valk',
    x,
    y,
    z: VALK.flyZ,
    r: VALK.r,
    facing: Math.PI / 2,
    hp: VALK.hp,
    maxHp: VALK.hp,
    anim: 'fly',
    st: W.t,
    until: 0,
    phase: 1,
    active: false,
    broken: 0,
    tele: [],
    cd: 0,
    act: 'fly',
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

export const valkFlying = (b: Boss) => b.act !== 'ground' && b.act !== 'downed' && b.act !== 'death' && b.act !== 'land'

export function hitValk(W: WorldState, b: Boss, o: HitOpts): 'hit' | 'blocked' | 'none' {
  if (b.dead || !b.active || b.act === 'death') return 'none'
  let dmg = o.dmg
  if (valkFlying(b)) {
    if (!o.ranged && !o.tech) {
      if (W.t - (b.hitAt ?? -9) > 0.6) pop(W, 'とどかない！', b.x, b.y - 150, -1)
      fx(W, 'clang', b.x, b.y - b.z)
      return 'blocked'
    }
    if (!o.tech) dmg *= VALK.flyMul * VALK.armorMul
  } else if (!o.tech) dmg *= VALK.armorMul * (b.act === 'downed' ? VALK.downMul : 1)
  b.hp = Math.max(0, b.hp - dmg)
  b.hitAt = W.t
  emit(W, 'hit', b.x, b.y - 60, { a: r1(dmg), b: o.tech || o.heavy ? 1 : 0, s: 'boss' })
  pop(W, `${Math.round(dmg * 10) / 10}`, b.x, b.y - 120, o.slot)
  fx(W, 'hit', b.x, b.y - 60 - (valkFlying(b) ? b.z : 0))
  sfx(W, o.tech || o.heavy ? 'hitHeavy' : 'hit', b.x, b.y)
  return 'hit'
}

/** The tornado at (x, y) with radius r pulls a flying wyvern down. */
export function pullDown(W: WorldState, x: number, y: number, r: number): void {
  const b = W.boss
  if (!b || b.kind !== 'valk' || !b.active || b.dead || !valkFlying(b) || b.steel > W.t) return
  if (dist(b.x, b.y, x, y) > r + 80) return
  const spot = freeSpotNear(W, (b.x + x) / 2, (b.y + y) / 2, 6)
  b.x = spot.x
  b.y = spot.y
  b.z = 0
  b.tele = []
  b.breaks++
  b.broken = W.t + VALK.downTime
  setAct(W, b, 'downed', 'downed', VALK.downTime)
  W.shots = W.shots.filter((s) => s.kind !== 'fire_breath')
  banner(W, '竜騎士を引きずりおろした！')
  sfx(W, 'guardBreak', b.x, b.y)
  shake(W, 10)
}

export function updateValk(W: WorldState, dt: number): void {
  const b = W.boss!
  const t = W.t
  if (b.act === 'death') {
    if (t >= b.until) {
      b.dead = true
      fx(W, 'bigburst', b.x, b.y - 60)
      emit(W, 'notice', b.x, b.y, { s: 'ヴァルクをたおした！' })
    }
    return
  }
  if (b.hp <= 0) {
    setAct(W, b, 'death', 'death', VALK.deathTime)
    b.tele = []
    b.z = 0
    banner(W, 'ヴァルクをたおした！')
    sfx(W, 'bossDie', b.x, b.y)
    shake(W, 12)
    W.shots = W.shots.filter((s) => s.kind !== 'fire_breath')
    for (const e of W.enemies) if (e.state !== 'death') (e.hp = 0), (e.state = 'death'), (e.st = t), (e.until = t + 0.5)
    return
  }
  b.phase = b.hp <= b.maxHp * 0.5 ? 2 : 1
  let near: Hero | undefined
  let nd = Infinity
  for (const h of W.heroes) {
    if (!targetable(h)) continue
    const d = dist(h.body.x, h.body.y, b.x, b.y)
    if (d < nd) (nd = d), (near = h)
  }
  const room = W.parsed!.info.rooms.find((r) => r.id === W.parsed!.data.rooms.find((q) => q.boss)?.id)
  const cx = room ? (room.x + room.w / 2) * TILE : b.homeX
  const cy = room ? (room.y + room.h / 2) * TILE : b.homeY
  const fly = (tx: number, ty: number, sp: number) => {
    const d = dist(tx, ty, b.x, b.y)
    if (d < 2) return
    const step = Math.min(d, sp * dt)
    const out = W.grid!.move(b.x, b.y, ((tx - b.x) / d) * step, ((ty - b.y) / d) * step, 20, true)
    b.x = out.x
    b.y = out.y
  }
  switch (b.act) {
    case 'fly': {
      b.z += (VALK.flyZ - b.z) * Math.min(1, dt * 3)
      // Circle the arena.
      const a = Math.atan2(b.y - cy, b.x - cx) + 0.6 * dt
      fly(cx + Math.cos(a) * 4 * TILE, cy + Math.sin(a) * 3.5 * TILE, VALK.speed)
      if (near) b.facing = Math.atan2(near.body.y - b.y, near.body.x - b.x)
      if (near && t >= b.cd) chooseAttack(W, b, near)
      break
    }
    case 'divewind':
      if (t >= b.until) {
        setAct(W, b, 'dive', 'dive', VALK.diveLen / VALK.diveSpeed)
        b.hitSet.clear()
        sfx(W, 'bossCharge', b.x, b.y)
        b.tele = []
      }
      break
    case 'dive': {
      const k = Math.min(1, (t - b.st) / (b.until - b.st))
      fly(
        b.x + Math.cos(b.aimA) * VALK.diveSpeed * dt * 2,
        b.y + Math.sin(b.aimA) * VALK.diveSpeed * dt * 2,
        VALK.diveSpeed
      )
      b.z = VALK.flyZ * (1 - Math.sin(Math.PI * k) * 0.85)
      for (const h of W.heroes)
        if (targetable(h) && !b.hitSet.has(h.slot) && h.body.z < 40 && dist(h.body.x, h.body.y, b.x, b.y) < b.r + 20) {
          b.hitSet.add(h.slot)
          hurtHero(W, h, VALK.diveDmg, b.x, b.y, 320)
        }
      if (k >= 1) {
        if (b.phase >= 2 && !b.secondSweep && near) {
          b.secondSweep = true
          startDive(W, b, near, VALK.p2DiveWindup2)
        } else {
          b.secondSweep = false
          setAct(W, b, 'fly', 'fly', 0)
          b.cd = t + 1.4
        }
      }
      break
    }
    case 'breathwind':
      if (near)
        b.facing +=
          Math.sign(angleDiff(Math.atan2(near.body.y - b.y, near.body.x - b.x), b.facing)) * Math.min(0.6 * dt, 1)
      if (t >= b.until) {
        setAct(W, b, 'breath', 'breath', b.phase >= 2 ? VALK.p2BreathTime : VALK.breathTime)
        b.aimA = b.facing - VALK.breathSpread
        b.tele = [cone(b, t, b.until)]
        sfx(W, 'fireballHit', b.x, b.y)
      }
      break
    case 'breath': {
      // Sweep the cone with puffs.
      const k = Math.min(1, (t - b.st) / (b.until - b.st))
      const a = b.facing - VALK.breathSpread + 2 * VALK.breathSpread * k
      if (W.seq % 5 === 0)
        W.shots.push({
          id: newId(W),
          kind: 'fire_breath',
          x: b.x + Math.cos(a) * 40,
          y: b.y + Math.sin(a) * 40,
          z: 30,
          z0: 30,
          vx: Math.cos(a) * VALK.puffSpeed,
          vy: Math.sin(a) * VALK.puffSpeed,
          range: VALK.breathR,
          dmg: VALK.puffDmg,
          pierce: 0,
          hits: new Set(),
          from: 'enemy',
          slot: -1,
          burst: 0,
          burstDmg: 0,
          dist: 0,
          dead: false
        })
      if (t >= b.until) {
        b.tele = []
        setAct(W, b, 'fly', 'fly', 0)
        b.cd = t + 1.2
      }
      break
    }
    case 'land': {
      // Descend onto the roof.
      const lx = b.px ?? b.x
      const ly = b.py ?? b.y
      fly(lx, ly, VALK.speed * 1.5)
      b.z = Math.max(0, b.z - 160 * dt)
      if (b.z <= 0 && dist(b.x, b.y, lx, ly) < 8) setAct(W, b, 'ground', 'ground', VALK.groundTime)
      break
    }
    case 'ground':
      if (near) b.facing = Math.atan2(near.body.y - b.y, near.body.x - b.x)
      if (t >= b.until) takeOff(W, b)
      break
    case 'downed':
      if (t >= b.until) {
        b.steel = t + VALK.waryTime
        takeOff(W, b)
        sfx(W, 'bossRoar', b.x, b.y)
      }
      break
  }
}

function takeOff(W: WorldState, b: Boss): void {
  setAct(W, b, 'fly', 'fly', 0)
  b.cd = W.t + 1.2
}

const cone = (b: Boss, from: number, until: number) => ({
  kind: 'cone' as const,
  x: Math.round(b.x),
  y: Math.round(b.y),
  r: VALK.breathR,
  a: Math.round(b.facing * 100) / 100,
  spread: Math.round(VALK.breathSpread * 100) / 100,
  from,
  until
})

function startDive(W: WorldState, b: Boss, h: Hero, wind: number): void {
  const t = W.t
  const a = Math.atan2(h.body.y - b.y, h.body.x - b.x)
  b.aimA = a
  b.facing = a
  setAct(W, b, 'divewind', 'fly', wind)
  b.tele = [
    {
      kind: 'line',
      x: Math.round(b.x),
      y: Math.round(b.y),
      r: 96,
      a: Math.round(a * 100) / 100,
      len: VALK.diveLen,
      from: t,
      until: t + wind
    }
  ]
  sfx(W, 'enemyWindup', b.x, b.y)
}

function chooseAttack(W: WorldState, b: Boss, near: Hero): void {
  const t = W.t
  b.calls++
  if (b.calls % 4 === 0) {
    // Land on the roof for a moment.
    const spot = freeSpotNear(W, near.body.x + (b.x > near.body.x ? 2 : -2) * TILE, near.body.y, 5)
    b.px = spot.x
    b.py = spot.y
    setAct(W, b, 'land', 'fly', 0)
    return
  }
  if (W.rng.chance(0.5)) {
    b.secondSweep = false
    startDive(W, b, near, VALK.diveWindup)
  } else {
    b.facing = Math.atan2(near.body.y - b.y, near.body.x - b.x)
    setAct(W, b, 'breathwind', 'breath', VALK.breathWindup)
    b.tele = [cone(b, t, t + VALK.breathWindup)]
    sfx(W, 'enemyWindup', b.x, b.y)
  }
}

export function resetValk(W: WorldState): void {
  const b = W.boss!
  Object.assign(b, createValk(W, b.homeX, b.homeY), { id: b.id })
}
