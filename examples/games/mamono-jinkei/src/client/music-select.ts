/**
 * Adaptive music: which intensity layer (0..2) a theme plays. Pure and deterministic so it can be tested.
 *
 * Boss fights: layer 1 while the fight lasts, layer 2 from the boss's second phase (or at half HP) onward.
 * Stage themes: 0 exploring, 1 enemies alerted nearby or an arena fight, 2 on an arena's last wave or while the
 * party is in danger. Rising is immediate; falling waits for a hold time so the layers never flicker.
 */

export interface MusicHero {
  hp: number
  maxHp: number
  down: boolean
}

export interface MusicInput {
  /** View time in seconds. */
  t: number
  /** The boss when the party is fighting it (boss theme), otherwise undefined. */
  boss?: { phase: number; hp: number; maxHp: number }
  /** An enemy has noticed the party nearby. */
  alerted: boolean
  /** The active arena fight, if any: room id, enemies left, and the number of waves it has. */
  arena?: { id: string; remaining: number; waves: number }
  heroes: readonly MusicHero[]
}

export interface MusicState {
  layer: number
  /** Since when the target has been below the current layer (-1 = not falling). */
  lowSince: number
  arenaId: string
  /** Wave number (1-based) of the active arena as observed from the enemy count. */
  wave: number
  lastRemaining: number
  bossLatched: boolean
}

/** Seconds a lower target must hold before the layer falls, by the layer being left. */
export const HOLD: readonly number[] = [0, 4, 6]

export function createMusicState(): MusicState {
  return { layer: 0, lowSince: -1, arenaId: '', wave: 0, lastRemaining: 0, bossLatched: false }
}

/** True when the party is in danger: several downed or low on hearts. */
export function partyInDanger(heroes: readonly MusicHero[]): boolean {
  if (!heroes.length) return false
  let down = 0
  let low = 0
  let hp = 0
  let max = 0
  for (const h of heroes) {
    max += h.maxHp
    if (h.down || h.hp <= 0) down++
    else {
      hp += h.hp
      if (h.hp <= h.maxHp * 0.3) low++
    }
  }
  return down + low >= 2 || (max > 0 && hp < max * 0.3)
}

/** Advances the state and returns the layer to play. */
export function selectMusicLayer(s: MusicState, i: MusicInput): number {
  if (i.boss) {
    const b = i.boss
    s.arenaId = ''
    s.wave = 0
    s.lowSince = -1
    if (b.phase < 2 && b.hp > b.maxHp * 0.75) s.bossLatched = false // a retry resets the fight
    if (b.phase >= 2 || b.hp <= b.maxHp * 0.5) s.bossLatched = true
    s.layer = s.bossLatched ? 2 : 1
    return s.layer
  }
  s.bossLatched = false

  let lastWave = false
  if (i.arena) {
    if (s.arenaId !== i.arena.id) {
      s.arenaId = i.arena.id
      s.wave = 1
    } else if (i.arena.remaining > s.lastRemaining) s.wave++
    s.lastRemaining = i.arena.remaining
    lastWave = i.arena.waves >= 2 && s.wave >= i.arena.waves
  } else {
    s.arenaId = ''
    s.wave = 0
    s.lastRemaining = 0
  }

  const engaged = i.alerted || !!i.arena
  const target = engaged && (lastWave || partyInDanger(i.heroes)) ? 2 : engaged ? 1 : 0
  if (target >= s.layer) {
    s.layer = target
    s.lowSince = -1
  } else {
    if (s.lowSince < 0) s.lowSince = i.t
    if (i.t - s.lowSince >= HOLD[s.layer] || i.t < s.lowSince) {
      s.layer = target
      s.lowSince = -1
    }
  }
  return s.layer
}

/** Resets the state (no stage music playing). */
export function resetMusicState(s: MusicState): void {
  Object.assign(s, createMusicState())
}

/** Enemies left in an arena fight, read from its objective 「敵をぜんぶたおせ！ のこり N」 (0 when absent). */
export function arenaRemaining(objective: string): number {
  return Number(/のこり\s*(\d+)/.exec(objective)?.[1] ?? 0)
}
