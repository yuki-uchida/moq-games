/**
 * Bosses (DESIGN §11): クイツクシ (rooted maw: slam, acid rain, summons, periodic open core, phases at 66 %/33 %)
 * and ゴウテツ (walking fortress: four breakable legs, kneels with its core exposed, missiles, sweeping laser,
 * stomp). bossHitModifier applies their weak points / armour to incoming hits.
 */
import { blast, damagePlayer, type DamageInfo } from '../combat'
import {
  DT,
  GOUTETSU_ARMOR,
  GOUTETSU_ENRAGED_CD,
  GOUTETSU_KNEEL,
  GOUTETSU_KNEEL_CAP,
  GOUTETSU_LEG_HP,
  MAW_CLOSED,
  MAW_PHASE_GUARD,
  MAW_WINDOW_CAP
} from '../constants'
import { ballistic, spawnShot } from '../projectiles'
import { emit, FOE_SIDE, type Foe, type Player, type Sim } from '../state'
import type { Vec } from '../vec'
import {
  attackDef,
  faceTo,
  hDist,
  isReady,
  launchAttack,
  lobGravity,
  recover,
  setState,
  startWindup,
  windupDone
} from './common'
import { bossDifficultyHp, liveFoes, spawnFoe } from './index'

const nearestPlayer = (sim: Sim, f: Foe, max = Infinity): Player | null => {
  let best: Player | null = null
  let bd = max
  for (const p of sim.players) {
    if (p.state !== 'alive') continue
    const d = hDist(f.p, p.p)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}

const PHASE_CD = [1, 1, 0.8, 0.65]

// ---------------------------------------------------------------------------------------------------------------
// クイツクシ

export function kuitsukushi(sim: Sim, f: Foe) {
  if (!f.parts) {
    f.parts = [0, 1]
    f.mem.phase = 1
    f.mem.coreNext = sim.time + 8
    f.mem.nextAct = sim.time + 1.5
  }
  const parts = f.parts
  // Core opens ~5 s every ~12 s.
  if (parts[0] === 0 && sim.time >= f.mem.coreNext) {
    parts[0] = 1
    f.mem.coreClose = sim.time + 5
    f.mem.openHp = f.hp
    emit(sim, { type: 'bossPart', foe: f.id, kind: f.kind, part: 0 })
  } else if (parts[0] === 1 && (sim.time >= f.mem.coreClose || f.mem.openHp - f.hp >= f.maxHp * MAW_WINDOW_CAP)) {
    // Closes on time, or early once the exposed core has taken MAW_WINDOW_CAP of its health (it flinches shut).
    parts[0] = 0
    f.mem.coreNext = sim.time + 12 * PHASE_CD[f.mem.phase]
  }
  // Phases.
  const frac = f.hp / f.maxHp
  const phase = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1
  if (phase > f.mem.phase) {
    f.mem.phase = phase
    f.mem.cdScale = PHASE_CD[phase]
    parts[1] = phase
    // Phase change: the maw snaps shut and the body hardens for a moment (no damage), then the core reopens.
    parts[0] = 0
    f.mem.guardUntil = sim.time + MAW_PHASE_GUARD
    f.mem.coreNext = sim.time + MAW_PHASE_GUARD + 2
    emit(sim, { type: 'bossPhase', foe: f.id, kind: f.kind, phase })
  }
  const target = nearestPlayer(sim, f)
  if (target) faceTo(f, target.p, 0.6)
  if (f.state === 'windup') {
    if (!windupDone(f)) return
    const atk = f.attack!
    launchAttack(sim, f)
    if (atk.id === 'slam') {
      const aim = f.aim ?? f.p
      blast(sim, [aim[0], aim[1] + 0.3, aim[2]], atk.radius ?? 3.5, atk.damage * f.dmgMul, FOE_SIDE, f.id, 'slam', {
        knock: 6,
        knockUp: 5
      })
    } else if (atk.id === 'acidRain') {
      const n = (atk.count ?? 8) + 3 * (f.mem.phase - 1)
      const victims = sim.players.filter((p) => p.state === 'alive' && hDist(p.p, f.p) <= atk.range)
      for (let i = 0; i < n && victims.length; i++) {
        const v = victims[i % victims.length]
        const a = sim.rng.next() * Math.PI * 2
        const r = sim.rng.next() * 6
        const at: Vec = [v.p[0] + Math.sin(a) * r, sim.rng.range(16, 26), v.p[2] + Math.cos(a) * r]
        const dmg = atk.damage * f.dmgMul
        spawnShot(sim, {
          kind: 'acidRain',
          foeAttack: 'acidRain',
          side: FOE_SIDE,
          owner: f.id,
          p: at,
          v: [0, -14, 0],
          dmg,
          gravity: 10,
          life: 6,
          r: 0.3,
          blast: { radius: atk.radius ?? 2.5, damage: dmg }
        })
      }
    } else if (atk.id === 'summon') {
      const n = Math.min((atk.count ?? 10) + 4 * (f.mem.phase - 1), Math.max(0, sim.diff.peak - liveFoes(sim)))
      for (let i = 0; i < n; i++) {
        const a = (i / Math.max(1, n)) * Math.PI * 2 + sim.rng.next()
        const r = f.r + 2 + sim.rng.next() * 3
        spawnFoe(sim, 'tsubute', [f.p[0] + Math.sin(a) * r, f.p[1], f.p[2] + Math.cos(a) * r], {
          wave: f.wave,
          yaw: a
        })
      }
    }
    recover(f)
    return
  }
  if (f.state === 'recover' || f.state === 'attack') {
    if (f.st >= 0.8) {
      f.attack = null
      f.aim = null
      setState(f, 'idle')
      f.mem.nextAct = sim.time + 1.2 * (f.mem.cdScale ?? 1)
    }
    return
  }
  if (sim.time < f.mem.nextAct || !target) return
  const slam = attackDef(f, 'slam')!
  const rain = attackDef(f, 'acidRain')!
  const summon = attackDef(f, 'summon')!
  const d = hDist(f.p, target.p) - f.r
  if (isReady(sim, f, 'slam') && d <= slam.range) startWindup(sim, f, slam, [target.p[0], target.p[1], target.p[2]])
  else if (isReady(sim, f, 'acidRain') && d <= rain.range) startWindup(sim, f, rain, null)
  else if (isReady(sim, f, 'summon') && liveFoes(sim) < sim.diff.peak) startWindup(sim, f, summon, null)
}

// ---------------------------------------------------------------------------------------------------------------
// ゴウテツ

/** World x/z of each leg column. */
export function goutetsuLegs(f: Foe): Vec[] {
  const s = Math.sin(f.yaw)
  const c = Math.cos(f.yaw)
  const out: Vec[] = []
  for (let i = 0; i < 4; i++) {
    const lx = i & 1 ? 3 : -3
    const lz = i & 2 ? 3 : -3
    // right = (−cos, 0, sin), forward = (sin, 0, cos)
    out.push([f.p[0] - c * lx + s * lz, f.p[1], f.p[2] + s * lx + c * lz])
  }
  return out
}

const legMax = (sim: Sim, f: Foe) => {
  if (f.mem.legMax === undefined)
    f.mem.legMax = GOUTETSU_LEG_HP * bossDifficultyHp(sim) * (0.55 + 0.15 * Math.max(1, sim.humans))
  return f.mem.legMax
}

export const kneeling = (f: Foe) => f.kind === 'goutetsu' && f.state === 'stagger'

const sweepHits = new WeakMap<Foe, Set<string>>()

export function goutetsu(sim: Sim, f: Foe) {
  const lm = legMax(sim, f)
  if (!f.parts) {
    f.parts = [lm, lm, lm, lm]
    f.mem.nextAct = sim.time + 3
  }
  // Half health: it rises at once (even from a kneel), enraged, with faster attacks.
  if (f.mem.half !== 1 && f.hp < f.maxHp * 0.5) {
    f.mem.half = 1
    f.mem.cdScale = GOUTETSU_ENRAGED_CD
    if (f.state === 'stagger') f.mem.kneelUntil = sim.time
    emit(sim, { type: 'bossPhase', foe: f.id, kind: f.kind, phase: 2 })
  }
  if (f.state === 'stagger') {
    // The exposed core can take GOUTETSU_KNEEL_CAP of its health per kneel; then it staggers up at once.
    if (f.mem.kneelHp - f.hp >= f.maxHp * GOUTETSU_KNEEL_CAP) f.mem.kneelUntil = sim.time
    if (sim.time >= f.mem.kneelUntil) {
      for (let i = 0; i < 4; i++) if (f.parts[i] <= 0) f.parts[i] = lm
      setState(f, 'move')
      f.mem.nextAct = sim.time + 1.5
    }
    return
  }
  const target = nearestPlayer(sim, f)
  if (f.state === 'windup') {
    if (target) faceTo(f, target.p, 0.4)
    if (!windupDone(f)) return
    const atk = f.attack!
    launchAttack(sim, f)
    if (atk.id === 'stomp') {
      blast(sim, [f.p[0], f.p[1] + 0.5, f.p[2]], atk.radius ?? 6, atk.damage * f.dmgMul, FOE_SIDE, f.id, 'stomp', {
        knock: 8
      })
      recover(f)
    } else if (atk.id === 'missile') {
      const from: Vec = [f.p[0], f.p[1] + f.h * 0.9, f.p[2]]
      const aim = f.aim ?? f.p
      const n = atk.count ?? 8
      const dmg = atk.damage * f.dmgMul
      for (let i = 0; i < n; i++) {
        const a = sim.rng.next() * Math.PI * 2
        const r = sim.rng.next() * 6
        const to: Vec = [aim[0] + Math.sin(a) * r, aim[1], aim[2] + Math.cos(a) * r]
        const sp = (atk.speed ?? 24) * sim.rng.range(0.9, 1.1)
        const g = lobGravity(sp, hDist(from, to), 16)
        spawnShot(sim, {
          kind: 'missile',
          foeAttack: 'missile',
          side: FOE_SIDE,
          owner: f.id,
          p: from,
          v: ballistic(from, to, sp, g, true),
          dmg,
          gravity: g,
          life: 10,
          r: 0.3,
          blast: { radius: atk.radius ?? 3, damage: dmg },
          knock: 5
        })
      }
      recover(f)
    } else {
      // Sweep: a beam turning across ~70° over 1.5 s.
      f.mem.sweepYaw = f.aim ? Math.atan2(f.aim[0] - f.p[0], f.aim[2] - f.p[2]) - (35 * Math.PI) / 180 : f.yaw
      sweepHits.set(f, new Set())
    }
    return
  }
  if (f.state === 'attack' && f.attack?.id === 'sweep') {
    const k = Math.min(1, f.st / 1.5)
    const yaw = f.mem.sweepYaw + ((70 * Math.PI) / 180) * k
    f.yaw = yaw
    const eye: Vec = [f.p[0], f.p[1] + f.h * 0.75, f.p[2]]
    const hit = sweepHits.get(f) ?? new Set<string>()
    for (const p of sim.players) {
      if (p.state !== 'alive' || hit.has(p.id)) continue
      const d = hDist(f.p, p.p)
      if (d > (f.attack.range ?? 45)) continue
      const py = Math.atan2(p.p[0] - f.p[0], p.p[2] - f.p[2])
      let da = py - yaw
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      if (Math.abs(Math.sin(da) * d) > 1.2 || Math.cos(da) < 0) continue
      const c: Vec = [p.p[0], p.p[1] + p.h * 0.5, p.p[2]]
      if (!sim.phys.clear(eye, c, FOE_SIDE)) continue
      hit.add(p.id)
      damagePlayer(sim, p, {
        amount: f.attack.damage * f.dmgMul,
        kind: 'ranged',
        side: FOE_SIDE,
        by: f.id,
        item: 'sweep',
        at: c,
        from: eye
      })
    }
    if (f.st >= 1.5) recover(f)
    return
  }
  if (f.state === 'recover') {
    if (f.st >= 1) {
      f.attack = null
      f.aim = null
      setState(f, 'move')
      f.mem.nextAct = sim.time + 1.5
    }
    return
  }
  if (!target) return
  if (f.state !== 'move') setState(f, 'move')
  const d = hDist(f.p, target.p)
  faceTo(f, target.p, 0.5)
  if (d > 20) {
    const sp = f.def.speed
    f.p[0] += Math.sin(f.yaw) * sp * DT
    f.p[2] += Math.cos(f.yaw) * sp * DT
    const b = sim.map.bounds
    f.p[0] = Math.max(b.min[0] + 2, Math.min(b.max[0] - 2, f.p[0]))
    f.p[2] = Math.max(b.min[1] + 2, Math.min(b.max[1] - 2, f.p[2]))
  }
  if (sim.time < f.mem.nextAct) return
  const stomp = attackDef(f, 'stomp')!
  const missile = attackDef(f, 'missile')!
  const sweep = attackDef(f, 'sweep')!
  const near = sim.players.some((p) => p.state === 'alive' && hDist(p.p, f.p) <= stomp.range)
  const at: Vec = [target.p[0], target.p[1], target.p[2]]
  if (near && isReady(sim, f, 'stomp')) startWindup(sim, f, stomp, [f.p[0], f.p[1], f.p[2]])
  else if (isReady(sim, f, 'missile') && d <= missile.range) startWindup(sim, f, missile, at)
  else if (
    isReady(sim, f, 'sweep') &&
    d <= sweep.range &&
    sim.phys.clear([f.p[0], f.p[1] + f.h * 0.75, f.p[2]], [at[0], at[1] + 0.6, at[2]], FOE_SIDE)
  )
    startWindup(sim, f, sweep, at)
}

// ---------------------------------------------------------------------------------------------------------------
// Hit modifiers

export function bossHitModifier(sim: Sim, f: Foe, d: DamageInfo): { mult: number; weak: boolean; absorbed?: boolean } {
  const at = d.at
  if (f.kind === 'kuitsukushi') {
    if (sim.time < (f.mem.guardUntil ?? 0)) return { mult: 0, weak: false }
    // Damage stops at the next phase threshold: every phase change plays out (no skipping a phase in one window).
    const floor = f.maxHp * (f.hp > f.maxHp * 0.66 ? 0.66 : f.hp > f.maxHp * 0.33 ? 0.33 : 0) - 1
    if (f.parts?.[0] === 1 && at[1] >= f.p[1] + f.h * 0.6)
      return { mult: capTo(f, d, f.def.weak ?? 2.5, floor), weak: true }
    return { mult: capTo(f, d, f.parts?.[0] === 1 ? 1 : MAW_CLOSED, floor), weak: false }
  }
  if (f.kind === 'goutetsu') {
    const y = at[1] - f.p[1]
    // Until it has risen enraged, damage stops at half health.
    const floor = f.mem.half === 1 ? 0 : f.maxHp * 0.5 - 1
    if (kneeling(f)) {
      if (y >= f.h * 0.3 && y <= f.h * 0.8) return { mult: capTo(f, d, f.def.weak ?? 2.5, floor), weak: true }
      return { mult: capTo(f, d, GOUTETSU_ARMOR, floor), weak: false }
    }
    if (!f.parts) return { mult: capTo(f, d, GOUTETSU_ARMOR, floor), weak: false }
    if (y <= 6.5) {
      const legs = goutetsuLegs(f)
      let best = -1
      let bd = 2.5
      for (let i = 0; i < 4; i++) {
        if (f.parts[i] <= 0) continue
        const dd = Math.hypot(at[0] - legs[i][0], at[2] - legs[i][2])
        if (dd <= bd) {
          bd = dd
          best = i
        }
      }
      if (best >= 0) {
        const amount = d.amount * (d.head ? (d.headMult ?? 1) : 1)
        f.parts[best] = Math.max(0, f.parts[best] - amount)
        if (f.parts[best] <= 0) {
          emit(sim, { type: 'bossPart', foe: f.id, kind: f.kind, part: best })
          const broken = f.parts.filter((x) => x <= 0).length
          if (broken >= 2) {
            setState(f, 'stagger')
            f.attack = null
            f.aim = null
            f.mem.kneelUntil = sim.time + GOUTETSU_KNEEL
            f.mem.kneelHp = f.hp
          }
        }
        return { mult: 1, weak: false, absorbed: true }
      }
    }
    return { mult: capTo(f, d, GOUTETSU_ARMOR, floor), weak: false }
  }
  return { mult: 1, weak: false }
}

/** Multiplier that keeps the boss's health at or above `floor` after this hit. */
function capTo(f: Foe, d: DamageInfo, mult: number, floor: number): number {
  const raw = d.amount * (d.head ? (d.headMult ?? 1) : 1)
  if (raw <= 0 || f.hp - raw * mult >= floor) return mult
  return Math.max(0, (f.hp - floor) / raw)
}
