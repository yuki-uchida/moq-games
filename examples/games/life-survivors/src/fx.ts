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
  /** x, y, a = ITEM_KINDS index (meal / magnet / cooking), b = taker index */
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
  ELITE: 18,
  PARENT_DEATH: 19,
  GAMBLE: 20,
  /**
   * x, y = the enemy 過保護親 bashed within her all-round reach of her child, a = the child (owner index), b = bits:
   * 1 when her shield itself strikes it (the renderer thrusts it then), her bash's length in hundredths of a second
   * (at most 127) times 2, and her shield's radius (r, rounded) times 256 (see guardBits)
   */
  GUARD: 21
} as const

/** FX.GUARD's b: whether her shield strikes the enemy itself, how long her bash lasts (s), her shield's radius. */
export const guardBits = (shield: boolean, seconds: number, radius: number) =>
  (shield ? 1 : 0) + 2 * Math.min(127, Math.round(seconds * 100)) + 256 * Math.round(radius)
/** FX.GUARD's b, read back (see guardBits). */
export const readGuardBits = (b: number) => ({ shield: (b & 1) === 1, seconds: ((b >> 1) & 127) / 100, radius: b >> 8 })

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
