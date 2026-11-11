/**
 * What the simulation reports to the view. The sim decides nothing about how things look or sound: it pushes one
 * of these for everything that happens, and the view turns them into particles, camera moves, popups, staging
 * and sound (see `src/view/fx-map.ts` and `src/view/sound-map.ts`).
 *
 * Positions are world pixels. `dir` is 1 (right) or -1 (left). Every type must have a visual and an audible
 * answer; `tests/view-events.test.ts` checks the maps against `SIM_EVENT_TYPES`.
 */
import type { BossState } from './sim'
import type { EnemyKind } from './types'

export type Dir = 1 | -1
export type PickupKind = 'fruit' | 'star' | 'twig' | 'berry'
export type HurtCause = 'enemy' | 'boss' | 'shot' | 'spike' | 'pit' | 'bee' | 'tree'
/** How a boss attack starts: a ground charge, an air dive, a dash, a leap that ends in a slam, or a volley. */
export type BossAttack = 'charge' | 'dive' | 'dash' | 'leap' | 'cast'

export type SimEvent =
  // ----- the hero
  /** Left the ground with a jump; (x, y) is the point between the feet. */
  | { type: 'jump'; x: number; y: number }
  /** Touched the ground; `speed` is the downward speed just before, in px/s. */
  | { type: 'land'; x: number; y: number; speed: number }
  /** Dropped through a one-way platform. */
  | { type: 'drop'; x: number; y: number }
  /** A bite was thrown; (x, y) is the centre of the bite box and `hit` tells whether it connected. */
  | { type: 'bite'; x: number; y: number; dir: Dir; hit: boolean }
  /** Entered or left water; (x, y) is on the surface. */
  | { type: 'splash'; x: number; y: number; enter: boolean; speed: number }
  /** Took damage; `hp` is what is left. */
  | { type: 'hurt'; x: number; y: number; dir: Dir; hp: number; cause: HurtCause }
  /** Put back on the last safe ground after falling into a pit. */
  | { type: 'respawn'; x: number; y: number }
  | { type: 'dead'; x: number; y: number }
  /** Picked something up. `hp` is the hero's health after it; `count`/`need` are set for nest materials. */
  | { type: 'pickup'; kind: PickupKind; x: number; y: number; hp: number; count?: number; need?: number }
  // ----- gimmicks
  /** A dirt tile was removed. `primary` is the bitten tile; the others crumble with it. */
  | { type: 'dig'; tx: number; ty: number; primary: boolean }
  /** A tree was bitten and is still standing; `left` bites remain. */
  | { type: 'chop'; kind: 'tree' | 'pine'; x: number; y: number; dir: Dir; left: number }
  /** A tree starts to fall toward `dir`. */
  | { type: 'tree-fall'; kind: 'tree' | 'pine'; x: number; y: number; dir: Dir }
  /** The trunk hit the ground and became a solid log of `length` tiles starting at tile `tx` on row `ty`. */
  | { type: 'tree-land'; kind: 'tree' | 'pine'; x: number; y: number; dir: Dir; tx: number; ty: number; length: number }
  | { type: 'pipe-burst'; x: number; y: number }
  | { type: 'hive-break'; x: number; y: number }
  /** A bee stung an enemy or the boss. */
  | { type: 'sting'; x: number; y: number }
  | { type: 'animal-wake'; x: number; y: number; dir: Dir }
  /** The charging animal stopped (it ran out of time or left the map). */
  | { type: 'animal-done'; x: number; y: number }
  /** A rock was bitten and still stands. */
  | { type: 'rock-crack'; x: number; y: number }
  | { type: 'rock-break'; x: number; y: number }
  /** A switch was flipped; `id` is 1 (sun) or 2 (moon). */
  | { type: 'switch'; x: number; y: number; id: number }
  /** A door opened; (x, y) is its top-left and `w`×`h` its size in tiles. */
  | { type: 'door-open'; x: number; y: number; w: number; h: number; id: number }
  /** A fruit or a nest material popped out of a rock, a dug tile or a felled tree. */
  | { type: 'spawn'; kind: PickupKind; x: number; y: number }
  /** ハム姫's cage opened. */
  | { type: 'princess-free'; x: number; y: number }
  /** The exit unlocked. */
  | { type: 'goal-open'; x: number; y: number }
  /** The hero reached the open exit. */
  | { type: 'clear'; x: number; y: number }
  // ----- enemies
  /** An enemy took a hit and survives. */
  | { type: 'enemy-hit'; id: number; kind: EnemyKind; x: number; y: number; dir: Dir }
  /** An enemy was defeated; the view plays its `defeat` clip from here. */
  | { type: 'enemy-down'; id: number; kind: EnemyKind; x: number; y: number; dir: Dir }
  /** A jumper pushed off the ground. */
  | { type: 'hop'; id: number; x: number; y: number }
  /** A spitter fired. */
  | { type: 'spit'; id: number; x: number; y: number; dir: Dir }
  /** A projectile or shockwave ended against terrain. */
  | { type: 'shot-hit'; kind: 'seed' | 'shock' | 'rock'; x: number; y: number }
  // ----- bosses
  /** The fight begins (or, for the nest stage, the boss arrives). */
  | { type: 'boss-awake'; x: number; y: number }
  /** The boss entered a new state of its pattern. */
  | { type: 'boss-state'; state: BossState; x: number; y: number; dir: Dir }
  /** The attack that follows a wind-up was launched. */
  | { type: 'boss-attack'; attack: BossAttack; x: number; y: number; dir: Dir }
  /** The boss fired `count` projectiles. */
  | { type: 'boss-shoot'; x: number; y: number; count: number }
  /** A leap ended on the ground. */
  | { type: 'boss-slam'; x: number; y: number }
  /** A ground shockwave was released. */
  | { type: 'shock'; x: number; y: number; dir: Dir }
  /** A charging boss ran into a wall and is stunned. */
  | { type: 'boss-crash'; x: number; y: number; dir: Dir }
  /** The boss took a hit; `ratio` is the health (or stamina) left, 0..1, and `weak` marks a bonus hit. */
  | { type: 'boss-hit'; x: number; y: number; ratio: number; weak: boolean }
  /** The final boss changed phase. */
  | { type: 'boss-phase'; phase: number; x: number; y: number }
  /** The chasing parent ran out of stamina. */
  | { type: 'boss-tired'; x: number; y: number }
  | { type: 'boss-down'; x: number; y: number }
  /** The boss called a helper. */
  | { type: 'minion'; kind: EnemyKind; x: number; y: number }
  /** The arena barrier rose or fell: tile column `tx`, rows `top`..`bottom`. */
  | { type: 'gate-up'; tx: number; top: number; bottom: number }
  | { type: 'gate-down'; tx: number; top: number; bottom: number }

export type SimEventType = SimEvent['type']

/** Every event type, for the tables that must cover them all. */
export const SIM_EVENT_TYPES = [
  'jump',
  'land',
  'drop',
  'bite',
  'splash',
  'hurt',
  'respawn',
  'dead',
  'pickup',
  'dig',
  'chop',
  'tree-fall',
  'tree-land',
  'pipe-burst',
  'hive-break',
  'sting',
  'animal-wake',
  'animal-done',
  'rock-crack',
  'rock-break',
  'switch',
  'door-open',
  'spawn',
  'princess-free',
  'goal-open',
  'clear',
  'enemy-hit',
  'enemy-down',
  'hop',
  'spit',
  'shot-hit',
  'boss-awake',
  'boss-state',
  'boss-attack',
  'boss-shoot',
  'boss-slam',
  'shock',
  'boss-crash',
  'boss-hit',
  'boss-phase',
  'boss-tired',
  'boss-down',
  'minion',
  'gate-up',
  'gate-down'
] as const satisfies readonly SimEventType[]

/** Compile-time proof that the list above names every event type. */
type Missing = Exclude<SimEventType, (typeof SIM_EVENT_TYPES)[number]>
export const ALL_EVENT_TYPES_LISTED: Missing extends never ? true : never = true
