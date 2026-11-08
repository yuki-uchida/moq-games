/**
 * 盾騎士団長ガルド (`garud`, DESIGN §10): permanent frontal guard toward the nearest hero, shield charge, sweep,
 * slam below 60% HP, reinforcements at 50% and 25%. Any co-op technique hit breaks the guard for 5 s.
 */
import { TILE, type BossKind } from '../vocab'
import { angleDiff, banner, dist, emit, freeSpotNear, fx, newId, sfx, shake } from './core'
import { hurtHero } from './combat'
import { spawnEnemy } from './enemies'
import type { Boss, Hero, WorldState } from './state'
import { GARUD } from './tables'

/** Animation base names of BOSS_SPEC.garud that come in `<name>_<dir>` variants. */
export const BOSS_DIR_ANIMS = new Set(['idle', 'walk', 'guard', 'windup', 'charge', 'sweep', 'hurt'])

export function createBoss(W: WorldState, kind: BossKind, x: number, y: number): Boss {
  return {
    id: newId(W),
    kind,
    x,
    y,
    z: 0,
    r: GARUD.r,
    facing: Math.PI / 2,
    hp: GARUD.hp,
    maxHp: GARUD.hp,
    anim: 'idle',
    st: W.t,
    until: 0,
    phase: 1,
    active: false,
    broken: 0,
    tele: [],
    cd: 0,
    act: 'idle',
    aimA: Math.PI / 2,
    chargeLeft: 0,
    calls: 0,
    breaks: 0,
    steel: 0,
    steelNext: false,
    secondSweep: false,
    hitSet: new Set(),
    dead: false,
    homeX: x,
    homeY: y
  }
}

const targetable = (h: Hero) => h.state !== 'down' && h.state !== 'fall' && h.state !== 'tech'

function setAct(W: WorldState, b: Boss, act: Boss['act'], anim: string, dur: number): void {
  b.act = act
  if (b.anim !== anim || dur > 0) b.st = W.t
  b.anim = anim
  b.until = dur > 0 ? W.t + dur : 0
}

export function activateBoss(W: WorldState, b: Boss): void {
  if (b.active || b.dead) return
  b.active = true
  b.cd = W.t + 1.5
  banner(W, '盾騎士団長ガルド')
  sfx(W, 'bossRoar', b.x, b.y)
  shake(W, 6)
}

export function updateBoss(W: WorldState, dt: number): void {
  const b = W.boss
  if (!b || b.dead || !b.active) return
  const t = W.t
  if (b.act === 'death') {
    if (t >= b.until) {
      b.dead = true
      fx(W, 'bigburst', b.x, b.y - 40)
      emit(W, 'notice', b.x, b.y, { s: 'ガルドをたおした！' })
    }
    return
  }
  if (b.hp <= 0) {
    setAct(W, b, 'death', 'death', GARUD.deathTime)
    b.tele = []
    banner(W, 'ガルドをたおした！')
    sfx(W, 'bossDie', b.x, b.y)
    shake(W, 12)
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
  const turn = (to: number, rate: number) => {
    const d = angleDiff(to, b.facing)
    b.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt)
  }
  const toNear = near ? Math.atan2(near.body.y - b.y, near.body.x - b.x) : b.facing
  switch (b.act) {
    case 'idle':
    case 'walk':
    case 'hurt': {
      if (!near) {
        setAct(W, b, 'idle', 'idle', 0)
        break
      }
      turn(toNear, 2.2)
      if (t >= b.cd) {
        chooseAttack(W, b, near, nd)
        break
      }
      if (nd > 130) {
        moveBoss(W, b, Math.cos(toNear) * GARUD.speed * dt, Math.sin(toNear) * GARUD.speed * dt)
        if (b.anim !== 'walk') setAct(W, b, 'walk', 'walk', 0)
      } else if (b.anim !== 'guard') setAct(W, b, 'idle', 'guard', 0)
      break
    }
    case 'windup':
      if (b.next === 'sweep') turn(toNear, 1.2)
      if (t >= b.until) {
        b.tele = []
        if (b.next === 'charge') {
          setAct(W, b, 'charge', 'charge', 0)
          b.chargeLeft = GARUD.chargeLen
          b.hitSet.clear()
          sfx(W, 'bossCharge', b.x, b.y)
        } else {
          setAct(W, b, 'sweep', 'sweep', 5 / 14)
          b.hitSet.clear()
          sfx(W, 'swing', b.x, b.y)
        }
      }
      break
    case 'charge': {
      const step = (b.phase >= 2 ? GARUD.p2ChargeSpeed : GARUD.chargeSpeed) * dt
      const dx = Math.cos(b.aimA) * step
      const dy = Math.sin(b.aimA) * step
      const before = { x: b.x, y: b.y }
      moveBoss(W, b, dx, dy)
      const moved = dist(before.x, before.y, b.x, b.y)
      b.chargeLeft -= step
      for (const h of W.heroes)
        if (targetable(h) && !b.hitSet.has(h.slot) && h.body.z < 10 && dist(h.body.x, h.body.y, b.x, b.y) < b.r + 20) {
          b.hitSet.add(h.slot)
          hurtHero(W, h, GARUD.chargeDmg, b.x, b.y, GARUD.chargeKb)
        }
      if (moved < step * 0.4) {
        // Hit a wall: stunned with the guard down.
        b.broken = t + GARUD.wallBroken
        setAct(W, b, 'broken', 'broken', GARUD.wallBroken)
        sfx(W, 'hitHeavy', b.x, b.y)
        fx(W, 'shock', b.x + Math.cos(b.aimA) * 40, b.y + Math.sin(b.aimA) * 40)
        shake(W, 10)
        emit(W, 'pop', b.x, b.y - 120, { s: 'ドカーン！', a: -1 })
      } else if (b.chargeLeft <= 0) {
        setAct(W, b, 'idle', 'guard', 0)
        b.cd = t + 1.3
      }
      break
    }
    case 'sweep':
      if (t - b.st >= 2 / 14 && !b.hitSet.has(-1)) {
        b.hitSet.add(-1)
        for (const h of W.heroes) {
          if (!targetable(h) || h.body.z > 10) continue
          const d = dist(h.body.x, h.body.y, b.x, b.y)
          const a = Math.atan2(h.body.y - b.y, h.body.x - b.x)
          if (d < GARUD.sweepR + 16 && Math.abs(angleDiff(a, b.facing)) <= GARUD.sweepSpread)
            hurtHero(W, h, GARUD.sweepDmg, b.x, b.y, 240)
        }
      }
      if (t >= b.until) {
        if (b.phase >= 2 && !b.secondSweep) {
          // Phase 2: a second, telegraphed sweep right after the first.
          b.secondSweep = true
          if (near) b.facing = toNear
          windupSweep(W, b, GARUD.p2SecondSweepWindup)
          break
        }
        b.secondSweep = false
        setAct(W, b, 'idle', 'guard', 0)
        b.cd = t + (b.phase >= 2 ? 1.0 : 1.2)
      }
      break
    case 'slam': {
      const el = t - b.st
      b.z =
        el < GARUD.slamHit
          ? 70 * Math.sin((Math.PI * el) / (GARUD.slamHit * 2))
          : Math.max(0, 70 * (1 - (el - GARUD.slamHit) / 0.1))
      if (el >= GARUD.slamHit && !b.hitSet.has(-2)) {
        b.hitSet.add(-2)
        b.z = 0
        b.tele = []
        for (const h of W.heroes)
          if (targetable(h) && h.body.z <= 4 && dist(h.body.x, h.body.y, b.x, b.y) < GARUD.slamR + 12)
            hurtHero(W, h, GARUD.slamDmg, b.x, b.y, 260)
        fx(W, 'shock', b.x, b.y)
        sfx(W, 'bossSlam', b.x, b.y)
        shake(W, 12)
        emit(W, 'burst', b.x, b.y, { s: 'rubble', a: 14 })
      }
      if (t >= b.until) {
        b.z = 0
        setAct(W, b, 'idle', 'guard', 0)
        b.cd = t + 1.4
      }
      break
    }
    case 'call':
      if (t >= b.until) {
        const spots: [number, number, 'rookie' | 'bowman'][] = [
          [-3, 1, 'rookie'],
          [3, 1, 'rookie'],
          [0, -3, 'bowman']
        ]
        for (const [dx, dy, kind] of spots) {
          const s = freeSpotNear(W, b.x + dx * TILE, b.y + dy * TILE, 3)
          const e = spawnEnemy(W, kind, s.x, s.y)
          e.alertAt = t
          e.summoned = true
          fx(W, 'smoke', s.x, s.y)
        }
        setAct(W, b, 'idle', 'guard', 0)
        b.cd = t + 1.5
      }
      break
    case 'broken':
      if (t >= b.until && t >= b.broken) {
        if (b.steelNext) {
          // Recovering from a technique guard break: 鉄壁 for a while.
          b.steelNext = false
          b.steel = t + GARUD.steelTime
          emit(W, 'pop', b.x, b.y - 120, { s: '鉄壁！', a: -1 })
          sfx(W, 'guardClang', b.x, b.y)
        }
        setAct(W, b, 'idle', 'guard', 0)
        b.cd = t + 0.8
      }
      break
  }
}

function chooseAttack(W: WorldState, b: Boss, near: Hero, d: number): void {
  const t = W.t
  const hpk = b.hp / b.maxHp
  if ((hpk <= 0.5 && b.calls === 0) || (hpk <= 0.25 && b.calls === 1)) {
    b.calls++
    setAct(W, b, 'call', 'call', GARUD.callTime)
    banner(W, '援軍だ！')
    sfx(W, 'bossRoar', b.x, b.y)
    return
  }
  const a = Math.atan2(near.body.y - b.y, near.body.x - b.x)
  if (hpk < 0.6 && W.rng.chance(b.phase >= 2 ? GARUD.p2SlamChance : GARUD.slamChance)) {
    setAct(W, b, 'slam', 'slam', GARUD.slamTime)
    b.hitSet.clear()
    b.tele = [
      { kind: 'circle', x: Math.round(b.x), y: Math.round(b.y), r: GARUD.slamR, from: t, until: t + GARUD.slamHit }
    ]
    sfx(W, 'enemyWindup', b.x, b.y)
    return
  }
  if (d > 190) {
    b.next = 'charge'
    b.aimA = a
    b.facing = a
    const wind = b.phase >= 2 ? GARUD.p2ChargeWindup : GARUD.chargeWindup
    setAct(W, b, 'windup', 'windup', wind)
    b.tele = [
      {
        kind: 'line',
        x: Math.round(b.x),
        y: Math.round(b.y),
        r: 80,
        a: Math.round(a * 100) / 100,
        len: GARUD.chargeLen,
        from: t,
        until: t + wind
      }
    ]
    sfx(W, 'enemyWindup', b.x, b.y)
  } else {
    b.secondSweep = false
    windupSweep(W, b, GARUD.sweepWindup)
  }
}

function windupSweep(W: WorldState, b: Boss, wind: number): void {
  const t = W.t
  b.next = 'sweep'
  {
    setAct(W, b, 'windup', 'windup', wind)
    b.tele = [
      {
        kind: 'cone',
        x: Math.round(b.x),
        y: Math.round(b.y),
        r: GARUD.sweepR,
        a: Math.round(b.facing * 100) / 100,
        spread: Math.round(GARUD.sweepSpread * 100) / 100,
        from: t,
        until: t + wind
      }
    ]
  }
  sfx(W, 'enemyWindup', b.x, b.y)
}

function moveBoss(W: WorldState, b: Boss, dx: number, dy: number): void {
  const out = W.grid!.move(b.x, b.y, dx, dy, b.r, false)
  b.x = out.x
  b.y = out.y
}

/** Resets the fight (wipe). */
export function resetBoss(W: WorldState): void {
  const b = W.boss
  if (!b || b.dead) return
  Object.assign(b, createBoss(W, b.kind, b.homeX, b.homeY), { id: b.id })
}
