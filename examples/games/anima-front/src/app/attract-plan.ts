/**
 * The title's attract demo, the pure part: which silent all-bot matches it plays and whether this device
 * should run it at all (DESIGN §17.2). No DOM, so the rules are unit-tested.
 */
import { presetById } from '../data/loadout'
import { SPECIES, SPECIES_IDS } from '../data/species'
import type { MatchConfig, View } from '../sim/types'
import { buildSeats, matchConfig, type MatchSelection } from './match'
import { hashString } from './roster'

/** The demo alternates between a 防衛任務 wave and an all-bot 三つ巴演習. */
export const ATTRACT_SCENES: readonly MatchSelection[] = [
  { mode: 'pve', mission: 'sakura', difficulty: 'normal' },
  { mode: 'pvp' }
]

/** Sim seconds skipped before the first frame (the countdown and the empty start of the wave). */
export const ATTRACT_WARMUP: Record<'pve' | 'pvp', number> = { pve: 12, pvp: 14 }
/** A scene is cut after this many sim seconds even if its match is still running. */
export const ATTRACT_SCENE_SECONDS = 95

export function attractConfig(index: number, seed: number): MatchConfig {
  const sel = ATTRACT_SCENES[((index % ATTRACT_SCENES.length) + ATTRACT_SCENES.length) % ATTRACT_SCENES.length]
  const lead = SPECIES_IDS[hashString(`lead${seed}`) % SPECIES_IDS.length]
  const preset = presetById(SPECIES[lead].preset)
  const seats = buildSeats(
    sel,
    { id: 'demo0', name: SPECIES[lead].name, species: lead, loadout: preset.loadout, loadoutName: preset.name },
    [],
    seed
  )
  // every seat is a bot: nobody is local in the demo
  for (const s of seats) {
    s.bot = s.bot ?? 0.7
    s.local = false
  }
  return matchConfig(sel, seats, seed)
}

export interface DeviceHints {
  saveData?: boolean
  cores?: number
  memoryGb?: number
  /** The player chose 低 quality. */
  lowQuality?: boolean
  webgl2?: boolean
  /** ?attract=0 (tests, debugging). */
  disabled?: boolean
}

export type AttractLevel = 'live' | 'still' | 'static'

/**
 * live: the running demo. still: one rendered frame (reduced motion). static: the light plaza backdrop
 * (Save-Data, slow devices, no WebGL2, 低 quality).
 */
export function attractLevel(h: DeviceHints, reducedMotion: boolean): AttractLevel {
  if (h.disabled || h.saveData || h.webgl2 === false || h.lowQuality) return 'static'
  if ((h.cores != null && h.cores < 4) || (h.memoryGb != null && h.memoryGb < 4)) return 'static'
  return reducedMotion ? 'still' : 'live'
}

/** Rolling frame-time watchdog: true once the demo has been too slow for long enough to give up. */
export class SlowWatch {
  private samples: number[] = []
  constructor(
    readonly limitMs = 45,
    readonly window = 90
  ) {}
  push(ms: number): boolean {
    this.samples.push(ms)
    if (this.samples.length > this.window) this.samples.shift()
    if (this.samples.length < this.window) return false
    const sorted = [...this.samples].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] > this.limitMs
  }
  reset() {
    this.samples = []
  }
}

/** Seconds the demo camera stays on one fighter before cutting to another. */
export const FOLLOW_SHOT_SECONDS = 9

/**
 * The fighter the demo camera follows: an alive player with the most opponents (foes, or players of other
 * teams) within 22 m, preferring a different one than the previous shot. Null when nobody is alive.
 */
export function pickFollow(view: View, previous: string | null): string | null {
  let best: string | null = null
  let bestScore = -Infinity
  for (const p of view.players) {
    if (p.state !== 'alive') continue
    let score = 0
    const near = (q: readonly number[]) => Math.hypot(q[0] - p.p[0], q[2] - p.p[2]) < 22
    for (const f of view.foes) if (f.state !== 'dying' && near(f.p)) score++
    for (const o of view.players) if (o.team !== p.team && o.state === 'alive' && near(o.p)) score++
    if (p.id === previous) score -= 2.5
    // stable tie-break: id order
    if (score > bestScore) {
      bestScore = score
      best = p.id
    }
  }
  return best
}

/**
 * Where the demo camera looks from behind its subject: toward the nearest opponents (so the fight is in frame),
 * or the subject's own heading when nobody is near. Yaw convention of DESIGN §2: direction (sin yaw, cos yaw).
 */
export function shotYaw(view: View, id: string): number | null {
  const me = view.players.find((p) => p.id === id)
  if (!me) return null
  let x = 0
  let z = 0
  let n = 0
  const add = (q: readonly number[]) => {
    const dx = q[0] - me.p[0]
    const dz = q[2] - me.p[2]
    const d = Math.hypot(dx, dz)
    if (d < 1 || d > 30) return
    x += dx / d
    z += dz / d
    n++
  }
  for (const f of view.foes) if (f.state !== 'dying') add(f.p)
  for (const o of view.players) if (o.team !== me.team && o.state === 'alive') add(o.p)
  return n && Math.hypot(x, z) > 0.2 ? Math.atan2(x, z) : me.yaw
}
