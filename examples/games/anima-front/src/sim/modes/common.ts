/** Helpers shared by the modes: phase changes, anchors with fallbacks, spawn points, MVP. */
import { emit, type Player, type Sim } from '../state'
import type { Phase, V3 } from '../types'
import type { Vec } from '../vec'

export function setPhase(sim: Sim, phase: Phase) {
  if (sim.phase === phase) return
  sim.phase = phase
  sim.phaseAt = sim.time
  emit(sim, { type: 'phase', phase })
}

/** Named anchor of the map, or a deterministic fallback inside the bounds (ring around the centre). */
export function anchor(sim: Sim, name: string, fallbackIndex = 0, fallbackCount = 1): Vec {
  const a = sim.map.anchors[name]
  if (a) return [a[0], a[1], a[2]]
  const b = sim.map.bounds
  const cx = (b.min[0] + b.max[0]) / 2
  const cz = (b.min[1] + b.max[1]) / 2
  if (fallbackCount <= 1) return [cx, 0, cz]
  const rad = Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) * 0.3
  const ang = (fallbackIndex / fallbackCount) * Math.PI * 2
  return [cx + Math.sin(ang) * rad, 0, cz + Math.cos(ang) * rad]
}

/** Foe spawn points with a tag (any spawn when the tag is missing or unknown; bounds edge as last resort). */
export function foeSpawnPoints(sim: Sim, tag?: string, air = false): { p: V3; air: boolean }[] {
  const all = sim.map.foeSpawns
  let list = tag ? all.filter((s) => s.tags?.includes(tag)) : []
  if (!list.length && air) list = all.filter((s) => s.air || s.tags?.includes('air'))
  if (!list.length) list = all.filter((s) => !s.air)
  if (!list.length) list = all
  if (list.length) return list.map((s) => ({ p: s.p, air: !!s.air }))
  const b = sim.map.bounds
  return [
    { p: [(b.min[0] + b.max[0]) / 2, 0, b.max[1] - 4], air: false },
    { p: [b.min[0] + 4, 0, (b.min[1] + b.max[1]) / 2], air: false },
    { p: [b.max[0] - 4, 0, (b.min[1] + b.max[1]) / 2], air: false }
  ]
}

/** MVP score: KOs, assists, revives and damage, minus downs. */
export function mvpOf(players: Player[]): string | undefined {
  let best: Player | undefined
  let bs = -Infinity
  for (const p of players) {
    const s = p.stats
    const score = s.kos * 10 + s.assists * 4 + s.revives * 25 + s.damage / 50 - s.downs * 10
    if (score > bs) {
      bs = score
      best = p
    }
  }
  return best?.id
}
