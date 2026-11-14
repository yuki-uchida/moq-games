/**
 * Bot evasion and boss aim (DESIGN §13): steps out of the predicted landing zone of telegraphed foe blasts
 * (ハリガネ acid, アシナガ mortar, ゴウテツ missiles, クイツクシ acid rain) and picks the useful aim point on bosses
 * (クイツクシ's open core, ゴウテツ's legs or, while it kneels, its chest core).
 */
import type { Target } from '../actors'
import { targetCenter } from '../actors'
import { goutetsuLegs, kneeling } from '../foes/bosses'
import { FOE_SIDE, type Player, type Sim } from '../state'
import type { Vec } from '../vec'
import { dodgeChance, type Brain } from './brain'

/** Seconds ahead a landing zone is considered (later ones are ignored until they come closer). */
const LOOKAHEAD = 1.6

/**
 * Direction (world x/z) away from the nearest predicted foe blast that would catch the player, or null.
 * Each shot is judged once per bot with a skill-scaled chance of noticing it; noticed shots are avoided
 * until they land. `dash` is true when the blast is about to land.
 */
export function evadeBlasts(
  sim: Sim,
  p: Player,
  b: Brain,
  skill: number
): { dir: [number, number]; dash: boolean } | null {
  let best: { dir: [number, number]; dash: boolean; t: number } | null = null
  for (const s of sim.shots) {
    if (s.gone || s.side !== FOE_SIDE || !s.blast || s.gravity <= 0) continue
    // Landing time on the player's floor level.
    const dy = s.p[1] - p.p[1]
    const g = s.gravity
    const disc = s.v[1] * s.v[1] + 2 * g * dy
    if (disc < 0) continue
    const t = (s.v[1] + Math.sqrt(disc)) / g
    if (t > LOOKAHEAD || t < 0) continue
    const lx = s.p[0] + s.v[0] * t
    const lz = s.p[2] + s.v[2] * t
    const dx = p.p[0] - lx
    const dz = p.p[2] - lz
    const d = Math.hypot(dx, dz)
    const danger = s.blast.radius + p.r + 0.6
    if (d > danger) continue
    const key = `s${s.id}`
    let noticed = b.evade.get(key)
    if (noticed === undefined) {
      noticed = b.rng.chance(dodgeChance(skill) + 0.1)
      if (b.evade.size > 96) b.evade.clear()
      b.evade.set(key, noticed)
    }
    if (!noticed) continue
    if (best && best.t <= t) continue
    // Step straight out of the zone (sideways when standing on the centre).
    const l = d > 0.2 ? d : 1
    const dir: [number, number] = d > 0.2 ? [dx / l, dz / l] : [Math.cos(s.id), Math.sin(s.id)]
    best = { dir, dash: t < 0.55 && d < danger - 0.5, t }
  }
  return best ? { dir: best.dir, dash: best.dash } : null
}

/** Point to aim at on a target: bosses expose their weak spots, everything else is aimed at the centre. */
export function aimPoint(t: Target, from: Vec): Vec {
  if (t.k !== 'f') return targetCenter(t)
  const f = t.f
  if (f.kind === 'kuitsukushi') {
    // The core sits in the open maw at the top; while it is closed the body (centre) is the only target.
    if (f.parts?.[0] === 1) return [f.p[0], f.p[1] + f.h * 0.8, f.p[2]]
    return targetCenter(t)
  }
  if (f.kind === 'goutetsu') {
    if (kneeling(f)) return [f.p[0], f.p[1] + f.h * 0.55, f.p[2]]
    if (f.parts) {
      // The nearest intact leg, just above the knee.
      const legs = goutetsuLegs(f)
      let best = -1
      let bd = Infinity
      for (let i = 0; i < 4; i++) {
        if (f.parts[i] <= 0) continue
        const d = Math.hypot(legs[i][0] - from[0], legs[i][2] - from[2])
        if (d < bd) {
          bd = d
          best = i
        }
      }
      if (best >= 0) return [legs[best][0], f.p[1] + 3, legs[best][2]]
    }
  }
  return targetCenter(t)
}
