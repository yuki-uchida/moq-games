/** The game -> renderer / HUD / audio event channel. Everything that deserves a flash, a sound or a banner is one event. */
export const FX = {
  /** x, y, a = enemy index (ENEMIES), b = flags (1 elite) */
  KILL: 0,
  /** x, y, a = weapon index (WEAPONS), b = bits (1 strong, 2 crit) — at most ~3 per tick */
  HIT: 1,
  /** x, y = owner position, a = weapon index, b = owner index — once per weapon activation */
  FIRE: 2,
  /** x, y, a = owner index, b = damage taken (rounded, >= 1) — at most once per 0.25 s per player */
  HURT: 3,
  /** x, y = player, a = new team level, b = player index */
  LEVELUP: 4,
  /** x, y = player, a = weapon index, b = player index */
  EVOLVE: 5,
  /** x, y, a = enemy index */
  BOSS_SPAWN: 6,
  /** x, y, a = enemy index */
  BOSS_KILL: 7,
  /** x, y, a = number of turning points granted (1 or 3), b = taker index */
  CHEST: 8,
  /** x, y = collector, a = gems collected this tick, b = collector index — at most 1 per player per tick */
  GEM: 9,
  /** x, y, a = ITEM_KINDS index (meal / magnet), b = taker index */
  ITEM: 10,
  /** x, y, a = player index */
  DOWN: 11,
  /** x, y, a = player index */
  REVIVE: 12,
  /** a = STAGES index, when the age enters a new stage */
  STAGE: 13,
  /** x, y = anchor, a = EVENTS index */
  SWARM: 14,
  /** x, y, a = radius, b = weapon index (mine burst, slam) */
  BLAST: 15,
  /** x, y, a = enemy index — at most ~3 per tick */
  ENEMY_SHOT: 16,
  /** x, y, a = enemy index (charger / boss charge telegraph) */
  WINDUP: 17,
  /** x, y, a = enemy index (an elite appeared) */
  ELITE: 18
} as const

export type FxType = (typeof FX)[keyof typeof FX]
export const FX_TYPES = Object.values(FX) as number[]
/** Flat stride of View.fx: seq, type, x, y, a, b. */
export const FX_STRIDE = 6
/** Events older than this (game seconds) are pruned. */
export const FX_WINDOW = 0.3
/** Hard cap on the live event list; the oldest are dropped first. */
export const FX_CAP = 120

export interface FxEvent {
  /** Strictly increasing for the whole game. */
  seq: number
  /** Game time of emission. */
  t: number
  type: number
  x: number
  y: number
  a: number
  b: number
}
