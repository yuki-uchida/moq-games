/**
 * Stage-2 boss (DESIGN §12): 猫使いの魔女ミルダ (`milda`, W.boss) riding her broom behind her giant cat (W.pet).
 *
 * - While the cat is awake every hit on the witch clangs (she hovers out of reach).
 * - The cat pounces (crouch + line telegraph) and swipes (cone telegraph); phase 2 (≤ 50%) pounces twice.
 * - The witch casts homing hexes (line telegraph while casting) and summons thieves at 75/50/25%.
 * - A co-op technique (the stampede) hitting the cat stuns it 5 s and knocks the witch off her broom: 'broken',
 *   vulnerable, normal hits × 1.25. Afterwards the cat is wary for a while: techniques no longer stun it.
 * - Plate-free but slippery: normal hits on the witch are reduced (× MILDA.armorMul); techniques do full damage.
 */
import { TILE } from '../vocab'
import { angleDiff, banner, dist, emit, freeSpotNear, fx, newId, pop, r1, sfx, shake } from './core'
import { hurtHero, type HitOpts } from './combat'
import { spawnEnemy } from './enemies'
import type { Boss, Hero, Pet, WorldState } from './state'

export const MILDA = {
  hp: 170,
  r: 30,
  hover: 44,
  speed: 90,
  castWindup: 0.45,
  p2CastWindup: 0.35,
  castCd: 2.6,
  p2CastCd: 1.7,
  hexSpeed: 210,
  hexRate: 2.1,
  p2HexRate: 2.6,
  hexLife: 3.4,
  hexDmg: 1,
  summonAt: [0.75, 0.5, 0.25],
  summonTime: 0.5,
  breakTime: 5,
  brokenMul: 1.25,
  armorMul: 0.25,
  /** After the cat wakes up it stays wary: techniques don't stun it again for this long. */
  waryTime: 8,
  deathTime: 1
}

export const CAT = {
  r: 44,
  speed: 115,
  crouch: 0.7,
  p2Crouch2: 0.45,
  pounceTime: 0.45,
  pounceR: 72,
  pounceDmg: 2,
  pounceMax: 6 * TILE,
  swipeWindup: 0.45,
  swipeR: 96,
  swipeSpread: (60 * Math.PI) / 180,
  swipeDmg: 2,
  stunTime: 5
}

/** Directional animation base names (`<name>_<dir>` in the art). */
export const MILDA_DIR_ANIMS = new Set(['idle', 'cast', 'hurt'])
export const CAT_DIR_ANIMS = new Set(['idle', 'walk', 'crouch', 'pounce', 'swipe', 'hurt'])

export function createMilda(W: WorldState, x: number, y: number): Boss {
  W.pet = createCat(W, x, y + 2 * TILE)
  return {
    id: newId(W),
    kind: 'milda',
    x,
    y,
    z: MILDA.hover,
    r: MILDA.r,
    facing: Math.PI / 2,
    hp: MILDA.hp,
    maxHp: MILDA.hp,
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
    secondSweep: false,
    steel: 0,
    steelNext: false,
    hitSet: new Set(),
    dead: false,
    homeX: x,
    homeY: y
  }
}

function createCat(W: WorldState, x: number, y: number): Pet {
  return {
    id: newId(W),
    kind: 'cat',
    x,
    y,
    z: 0,
    r: CAT.r,
    facing: Math.PI / 2,
    anim: 'idle',
    st: W.t,
    until: 0,
    act: 'idle',
    cd: 0,
    stun: 0,
    wary: 0,
    aimA: 0,
    px: x,
    py: y,
    sx: x,
    sy: y,
    second: false,
    hitSet: new Set(),
    tele: [],
    dead: false,
    homeX: x,
    homeY: y
  }
}

const targetable = (h: Hero) => h.state !== 'down' && h.state !== 'fall' && h.state !== 'tech'

function nearest(W: WorldState, x: number, y: number): { h: Hero; d: number } | undefined {
  let best: Hero | undefined
  let bd = Infinity
  for (const h of W.heroes) {
    if (!targetable(h)) continue
    const d = dist(h.body.x, h.body.y, x, y)
    if (d < bd) (bd = d), (best = h)
  }
  return best ? { h: best, d: bd } : undefined
}

function setBoss(W: WorldState, b: Boss, act: string, anim: string, dur: number): void {
  b.act = act
  if (b.anim !== anim || dur > 0) b.st = W.t
  b.anim = anim
  b.until = dur > 0 ? W.t + dur : 0
}

function setCat(W: WorldState, c: Pet, act: string, anim: string, dur: number): void {
  c.act = act
  if (c.anim !== anim || dur > 0) c.st = W.t
  c.anim = anim
  c.until = dur > 0 ? W.t + dur : 0
}

/** Damage to the witch: protected while the cat is awake. */
export function hitMilda(W: WorldState, b: Boss, o: HitOpts): 'hit' | 'blocked' | 'none' {
  if (b.dead || !b.active || b.act === 'death') return 'none'
  const broken = b.broken > W.t
  if (!broken) {
    emit(W, 'clang', b.x, b.y - 40 - b.z)
    fx(W, 'clang', b.x, b.y - 40 - b.z)
    sfx(W, 'guardClang', b.x, b.y)
    return 'blocked'
  }
  const dmg = o.tech ? o.dmg : o.dmg * MILDA.armorMul * MILDA.brokenMul
  b.hp = Math.max(0, b.hp - dmg)
  b.hitAt = W.t
  emit(W, 'hit', b.x, b.y - 40, { a: r1(dmg), b: o.tech || o.heavy ? 1 : 0, s: 'boss' })
  fx(W, 'hit', b.x, b.y - 40)
  sfx(W, o.tech || o.heavy ? 'hitHeavy' : 'hit', b.x, b.y)
  return 'hit'
}

/** Hits on the cat: it cannot be hurt, but a technique (the stampede) stuns it and grounds the witch. */
export function hitPet(W: WorldState, c: Pet, o: HitOpts): 'hit' | 'blocked' | 'none' {
  const b = W.boss
  if (c.dead || !b || !b.active || b.dead) return 'none'
  c.hitAt = W.t
  if (!o.tech || c.stun > W.t) {
    fx(W, 'clang', c.x, c.y - 40)
    sfx(W, 'guardClang', c.x, c.y)
    return 'blocked'
  }
  if (c.wary > W.t) {
    // Wary: it leaps aside.
    pop(W, 'ヒラリ！', c.x, c.y - 110, -1)
    fx(W, 'dust', c.x, c.y)
    return 'blocked'
  }
  c.stun = W.t + CAT.stunTime
  c.tele = []
  c.z = 0
  setCat(W, c, 'stunned', 'stunned', CAT.stunTime)
  b.broken = W.t + MILDA.breakTime
  b.breaks++
  b.tele = []
  b.z = 0
  setBoss(W, b, 'broken', 'broken', MILDA.breakTime)
  W.shots = W.shots.filter((s) => !s.homing)
  banner(W, 'ほうきから落ちた！')
  sfx(W, 'guardBreak', b.x, b.y)
  sfx(W, 'stun', c.x, c.y)
  shake(W, 10)
  return 'hit'
}

export function updateMilda(W: WorldState, dt: number): void {
  const b = W.boss!
  const c = W.pet
  const t = W.t
  if (b.act === 'death') {
    if (t >= b.until) {
      b.dead = true
      if (c && !c.dead) {
        c.dead = true
        fx(W, 'smoke', c.x, c.y)
      }
      fx(W, 'bigburst', b.x, b.y - 40)
      emit(W, 'notice', b.x, b.y, { s: 'ミルダをたおした！' })
    }
    if (c && !c.dead) updateCatFlee(W, c, dt)
    return
  }
  if (b.hp <= 0) {
    setBoss(W, b, 'death', 'death', MILDA.deathTime)
    b.tele = []
    b.z = 0
    banner(W, 'ミルダをたおした！')
    sfx(W, 'bossDie', b.x, b.y)
    shake(W, 12)
    if (c) setCat(W, c, 'flee', 'flee', 2)
    for (const e of W.enemies) if (e.state !== 'death') (e.hp = 0), (e.state = 'death'), (e.st = t), (e.until = t + 0.5)
    W.shots = W.shots.filter((s) => !s.homing)
    return
  }
  b.phase = b.hp <= b.maxHp * 0.5 ? 2 : 1
  const near = nearest(W, b.x, b.y)
  if (c) updateCat(W, c, b, dt)
  // Broken: on the floor, dizzy.
  if (b.act === 'broken') {
    b.z = 0
    if (t >= b.until) {
      if (c) c.wary = t + MILDA.waryTime
      setBoss(W, b, 'idle', 'idle', 0)
      b.cd = t + 1
      sfx(W, 'bossRoar', b.x, b.y)
    }
    return
  }
  b.z = MILDA.hover + Math.sin(t * 2.4) * 6
  // Hover behind the cat, away from the party.
  if (near && c) {
    let px = 0
    let py = 0
    let n = 0
    for (const h of W.heroes) if (targetable(h)) (px += h.body.x), (py += h.body.y), n++
    if (n) {
      px /= n
      py /= n
      const a = Math.atan2(c.y - py, c.x - px)
      const tx = c.x + Math.cos(a) * 170
      const ty = c.y + Math.sin(a) * 170
      const d = dist(tx, ty, b.x, b.y)
      if (d > 8) {
        const step = Math.min(d, MILDA.speed * dt)
        const out = W.grid!.move(b.x, b.y, ((tx - b.x) / d) * step, ((ty - b.y) / d) * step, b.r, true)
        b.x = out.x
        b.y = out.y
      }
    }
    b.facing = Math.atan2(near.h.body.y - b.y, near.h.body.x - b.x)
  }
  switch (b.act) {
    case 'idle': {
      if (!near) break
      const hpk = b.hp / b.maxHp
      if (b.calls < MILDA.summonAt.length && hpk <= MILDA.summonAt[b.calls]) {
        b.calls++
        setBoss(W, b, 'summon', 'summon', MILDA.summonTime)
        b.tele = [
          { kind: 'circle', x: Math.round(b.x), y: Math.round(b.y), r: 60, from: t, until: t + MILDA.summonTime }
        ]
        banner(W, 'ねこの手もかりたい！')
        sfx(W, 'bossRoar', b.x, b.y)
        break
      }
      if (t >= b.cd) {
        const wind = b.phase >= 2 ? MILDA.p2CastWindup : MILDA.castWindup
        b.aimA = b.facing
        setBoss(W, b, 'cast', 'cast', wind)
        b.tele = [
          {
            kind: 'line',
            x: Math.round(b.x),
            y: Math.round(b.y),
            r: 14,
            a: Math.round(b.aimA * 100) / 100,
            len: 180,
            from: t,
            until: t + wind
          }
        ]
        sfx(W, 'enemyCast', b.x, b.y)
      }
      break
    }
    case 'cast':
      if (t >= b.until) {
        const n = b.phase >= 2 ? 2 : 1
        for (let i = 0; i < n; i++) {
          const a = b.facing + (n > 1 ? (i - 0.5) * 0.8 : 0)
          W.shots.push({
            id: newId(W),
            kind: 'hex',
            x: b.x + Math.cos(a) * 20,
            y: b.y + Math.sin(a) * 20,
            z: b.z,
            z0: b.z,
            vx: Math.cos(a) * MILDA.hexSpeed,
            vy: Math.sin(a) * MILDA.hexSpeed,
            range: 1e9,
            dmg: MILDA.hexDmg,
            pierce: 0,
            hits: new Set(),
            from: 'enemy',
            slot: -1,
            burst: 0,
            burstDmg: 0,
            dist: 0,
            dead: false,
            homing: { rate: b.phase >= 2 ? MILDA.p2HexRate : MILDA.hexRate, until: t + MILDA.hexLife }
          })
        }
        b.tele = []
        sfx(W, 'magicCast', b.x, b.y)
        setBoss(W, b, 'idle', 'idle', 0)
        b.cd = t + (b.phase >= 2 ? MILDA.p2CastCd : MILDA.castCd)
      }
      break
    case 'summon':
      if (t >= b.until) {
        b.tele = []
        for (const dx of [-2, 2]) {
          const s = freeSpotNear(W, b.x + dx * TILE, b.y + TILE, 3)
          const e = spawnEnemy(W, 'thief', s.x, s.y)
          e.alertAt = t
          e.summoned = true
          fx(W, 'smoke', s.x, s.y)
        }
        setBoss(W, b, 'idle', 'idle', 0)
        b.cd = t + 1.2
      }
      break
  }
}

function updateCat(W: WorldState, c: Pet, b: Boss, dt: number): void {
  const t = W.t
  if (c.act === 'stunned') {
    if (t >= c.until) setCat(W, c, 'idle', 'idle', 0), (c.cd = t + 0.8)
    return
  }
  const near = nearest(W, c.x, c.y)
  const p2 = b.phase >= 2
  switch (c.act) {
    case 'idle':
    case 'walk':
    case 'hurt': {
      if (!near) {
        setCat(W, c, 'idle', 'idle', 0)
        break
      }
      const a = Math.atan2(near.h.body.y - c.y, near.h.body.x - c.x)
      c.facing = a
      if (t >= c.cd && near.d < CAT.swipeR + 10) {
        c.aimA = a
        setCat(W, c, 'swipewind', 'idle', CAT.swipeWindup)
        c.tele = [
          {
            kind: 'cone',
            x: Math.round(c.x),
            y: Math.round(c.y),
            r: CAT.swipeR,
            a: Math.round(a * 100) / 100,
            spread: Math.round(CAT.swipeSpread * 100) / 100,
            from: t,
            until: t + CAT.swipeWindup
          }
        ]
        sfx(W, 'enemyWindup', c.x, c.y)
        break
      }
      if (t >= c.cd && near.d > 130 && near.d < 7 * TILE) {
        startCrouch(W, c, near.h, CAT.crouch)
        break
      }
      if (near.d > 90) {
        const out = W.grid!.move(c.x, c.y, Math.cos(a) * CAT.speed * dt, Math.sin(a) * CAT.speed * dt, c.r, false)
        c.x = out.x
        c.y = out.y
        if (c.anim !== 'walk') setCat(W, c, 'walk', 'walk', 0)
      } else if (c.anim !== 'idle') setCat(W, c, 'idle', 'idle', 0)
      break
    }
    case 'swipewind':
      if (t >= c.until) {
        setCat(W, c, 'swipe', 'swipe', 4 / 14)
        c.tele = []
        c.hitSet.clear()
        sfx(W, 'swing', c.x, c.y)
        for (const h of W.heroes) {
          if (!targetable(h) || h.body.z > 10) continue
          const d = dist(h.body.x, h.body.y, c.x, c.y)
          const a = Math.atan2(h.body.y - c.y, h.body.x - c.x)
          if (d < CAT.swipeR + 16 && Math.abs(angleDiff(a, c.aimA)) <= CAT.swipeSpread)
            hurtHero(W, h, CAT.swipeDmg, c.x, c.y, 260)
        }
      }
      break
    case 'swipe':
      if (t >= c.until) setCat(W, c, 'idle', 'idle', 0), (c.cd = t + (p2 ? 0.9 : 1.2))
      break
    case 'crouch':
      if (t >= c.until) {
        setCat(W, c, 'pounce', 'pounce', CAT.pounceTime)
        c.sx = c.x
        c.sy = c.y
        c.hitSet.clear()
        c.tele = []
        sfx(W, 'lunge', c.x, c.y)
      }
      break
    case 'pounce': {
      const k = Math.min(1, (t - c.st) / CAT.pounceTime)
      const tx = c.sx + (c.px - c.sx) * k
      const ty = c.sy + (c.py - c.sy) * k
      const out = W.grid!.move(c.x, c.y, tx - c.x, ty - c.y, c.r, false)
      c.x = out.x
      c.y = out.y
      c.z = 4 * 50 * k * (1 - k)
      if (k >= 1) {
        c.z = 0
        for (const h of W.heroes)
          if (targetable(h) && h.body.z < 10 && dist(h.body.x, h.body.y, c.x, c.y) < CAT.pounceR + 16)
            hurtHero(W, h, CAT.pounceDmg, c.x, c.y, 300)
        fx(W, 'shock', c.x, c.y)
        sfx(W, 'bossSlam', c.x, c.y)
        shake(W, 6)
        if (p2 && !c.second && near) {
          c.second = true
          startCrouch(W, c, near.h, CAT.p2Crouch2)
        } else {
          c.second = false
          setCat(W, c, 'idle', 'idle', 0)
          c.cd = t + (p2 ? 1.1 : 1.5)
        }
      }
      break
    }
  }
}

function startCrouch(W: WorldState, c: Pet, h: Hero, wind: number): void {
  const t = W.t
  const a = Math.atan2(h.body.y - c.y, h.body.x - c.x)
  const d = Math.min(CAT.pounceMax, dist(h.body.x, h.body.y, c.x, c.y))
  c.aimA = a
  c.facing = a
  c.px = c.x + Math.cos(a) * d
  c.py = c.y + Math.sin(a) * d
  setCat(W, c, 'crouch', 'crouch', wind)
  c.tele = [
    {
      kind: 'line',
      x: Math.round(c.x),
      y: Math.round(c.y),
      r: 90,
      a: Math.round(a * 100) / 100,
      len: Math.round(d + CAT.pounceR),
      from: t,
      until: t + wind
    }
  ]
  sfx(W, 'enemyWindup', c.x, c.y)
}

function updateCatFlee(W: WorldState, c: Pet, dt: number): void {
  c.tele = []
  const out = W.grid!.move(c.x, c.y, 0, -260 * dt, c.r, false)
  c.x = out.x
  c.y = out.y
  if (W.t >= c.until) {
    c.dead = true
    fx(W, 'smoke', c.x, c.y)
  }
}

/** Wipe: the fight starts over. */
export function resetMilda(W: WorldState): void {
  const b = W.boss!
  Object.assign(b, createMilda(W, b.homeX, b.homeY), { id: b.id })
}
