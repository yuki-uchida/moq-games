/**
 * The contract between the simulation (host) and every client (renderer, HUD, audio, network).
 *
 * - `InputState` is what a player's devices produce each frame; `NetInput` is what a guest sends to the host.
 * - `View` is the snapshot the host broadcasts (JSON, < 64 KiB) and what solo play renders directly.
 * - `StageInfo` is the static part of a stage that every client builds locally from the stage data.
 *
 * Times are host world seconds (`View.t`). Positions are art pixels (feet of characters). Angles are radians,
 * 0 = right, y down. Adding optional fields is fine; renaming or removing fields is a contract change.
 */
import type { SfxName } from '../audio/api'
import type { BossKind, EnemyKind, Job, NpcKind, Species, StageId, TileKind } from '../vocab'

/* ------------------------------------------------------------------------------------------------- input */

/** One player's controls this frame. Press/release counters only ever increase (edge events survive merging). */
export interface InputState {
  /** Movement, length ≤ 1. */
  mx: number
  my: number
  /** Aim angle from the controlled hero toward the cursor. */
  aim: number
  /** Left button held (charging). */
  attackHeld: boolean
  /** Space held (crow flight). */
  actionHeld: boolean
  /** Left button pressed: an attack, and the start of a charge. */
  attackPresses: number
  /** Left button released: releases a full charge. */
  attackReleases: number
  /** Space pressed: species action. */
  actionPresses: number
  /** E pressed: lift / put down / grip / lever / talk. */
  interactPresses: number
  /** Tab pressed: control the next owned hero. */
  switchPresses: number
  /** Q pressed: companions follow ⇄ stay. */
  modePresses: number
  /** F pressed: せーの signal. */
  signalPresses: number
  /** Optional: E is held (valves need it held for 1 s; when omitted, standing still counts as holding). */
  interactHeld?: boolean
  /** Optional: distance from the controlled hero to the cursor (art px); the co-op technique aim point uses it
   * (clamped to the technique range; default 4 tiles). */
  aimDist?: number
}

export const NO_INPUT: InputState = {
  mx: 0,
  my: 0,
  aim: Math.PI / 2,
  attackHeld: false,
  actionHeld: false,
  attackPresses: 0,
  attackReleases: 0,
  actionPresses: 0,
  interactPresses: 0,
  switchPresses: 0,
  modePresses: 0,
  signalPresses: 0
}

/** The controlled hero as a guest predicts it (the host accepts it when plausible). */
export interface HeroReport {
  slot: number
  x: number
  y: number
  /** Height above the ground (jumping slime, flying crow). */
  z: number
  vx: number
  vy: number
  facing: number
  /** Last `HeroView.force.seq` the guest applied. */
  forceSeq: number
  /** Flight stamina, jump/dash phase etc. that the guest simulated. */
  airborne: boolean
}

/** What a guest sends to the host (~30 Hz). The host's own input never travels. */
export interface NetInput extends InputState {
  hero?: HeroReport
  /** Lobby: wanted job (granted when free). */
  job?: Job
  /** Display name, ≤ 12 characters. */
  name?: string
  /** Opening the pause menu in multiplayer does not pause; this only shows a "menu" badge to others. */
  menu?: boolean
}

/* --------------------------------------------------------------------------------------------------- view */

export type Phase = 'lobby' | 'intro' | 'play' | 'wipe' | 'clear' | 'ending'

export type HeroState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'charge'
  | 'skill'
  | 'hurt'
  | 'push'
  | 'carry'
  | 'grip'
  | 'action'
  | 'down'
  | 'revive'
  | 'fall'
  | 'victory'
  /** Inside a co-op technique (drawn by the technique, not as a hero). */
  | 'tech'

export interface HeroView {
  slot: number
  job: Job
  x: number
  y: number
  z: number
  facing: number
  aim: number
  state: HeroState
  /** When the state began (animation time = View.t - st). */
  st: number
  hp: number
  maxHp: number
  /** Charge progress 0..1 (1 = full, ready). */
  charge: number
  /** Invulnerable until this time (flicker). */
  inv: number
  /** Owning human's player id. */
  owner: string
  /** True for the hero its owner currently controls; false for a companion. */
  ctrl: boolean
  mode: 'follow' | 'stay'
  /** Prop id lifted, carried or gripped. */
  hold?: number
  /** Index into View.formations. */
  form?: number
  /** Stunned / snared until. */
  stun?: number
  snared?: number
  /** Revive progress 0..1 while an ally stands by a downed hero. */
  revive?: number
  /** Host-imposed movement the owner's prediction must apply (knockback, technique, respawn). */
  force?: { seq: number; kind: 'warp' | 'impulse'; x: number; y: number; vx: number; vy: number }
  /** Speed multiplier the owner's prediction must use (carrying, charging, snow). */
  speed?: number
}

/** 'dash' is the thief's hit-and-run dash (`dash_<dir>` in its sheet). */
export type EnemyState = 'idle' | 'walk' | 'windup' | 'attack' | 'hurt' | 'guard' | 'heal' | 'death' | 'dash'

/** A danger marker drawn on the ground before an attack lands. */
export interface Telegraph {
  kind: 'line' | 'circle' | 'cone'
  x: number
  y: number
  /** Circle/cone radius or line width. */
  r: number
  /** Line/cone direction. */
  a?: number
  /** Line length. */
  len?: number
  /** Cone half-angle. */
  spread?: number
  from: number
  until: number
}

export interface EnemyView {
  id: number
  kind: EnemyKind
  x: number
  y: number
  z?: number
  facing: number
  state: EnemyState
  st: number
  hp: number
  maxHp: number
  /** Last time it took damage (hit flash ~0.1 s). */
  hitAt?: number
  stun?: number
  /** When it noticed a hero (the "!" pops for 0.6 s). */
  alertAt?: number
  tele?: Telegraph
}

export interface BossView {
  id: number
  kind: BossKind
  x: number
  y: number
  z: number
  facing: number
  /** Animation base name from the boss sheet (e.g. 'walk', 'sweep', 'slam', 'broken'). */
  anim: string
  st: number
  hp: number
  maxHp: number
  /** Battle phase (1, 2 …). */
  phase: number
  guard: boolean
  /** Guard broken (vulnerable) until. */
  broken?: number
  hitAt?: number
  tele?: Telegraph[]
  /** Optional: 鉄壁 until — after a guard break the shield resists techniques for a while (draw a shield glow). */
  steel?: number
  /** Optional: the exact BOSS_SPEC animation key to draw (`anim` plus `_<dir>` for directional animations). */
  animKey?: string
}

/** Every prop kind (sheet `props:<stage>` animation base names; see art/contract.ts). */
export type PropKind =
  | 'block'
  | 'boulder'
  | 'pot'
  | 'grass'
  | 'bush'
  | 'rock'
  | 'tree'
  | 'flower'
  | 'fence_h'
  | 'fence_v'
  | 'plate'
  | 'plate2'
  | 'bigplate'
  | 'crystal'
  | 'lever'
  | 'gate'
  | 'bossdoor'
  | 'sign'
  | 'chest'
  | 'acorn'
  | 'pedestal'
  | 'crackrock'
  | 'bounce'
  | 'pillar'
  | 'torch'
  | 'altar'
  // Stage 2 (props:sewer). States: crate/bigcrate 'idle'|'sliding'; barrel 'idle'|'lifted'|'break';
  // cheese 'idle'|'gripped'|'lifted'; scale 'off'|'on'; valve 'off'|'turn'|'on'; sluice 'closed'|'opening'|'open';
  // barricade 'idle'|'break'; mousetrap 'idle'|'snap'. Decoration only: lamp, sack, grate, pipe, haybale, shelf,
  // cobweb.
  | 'crate'
  | 'bigcrate'
  | 'barrel'
  | 'cheese'
  | 'scale'
  | 'valve'
  | 'sluice'
  | 'barricade'
  | 'mousetrap'
  | 'lamp'
  | 'sack'
  | 'grate'
  | 'pipe'
  | 'haybale'
  | 'shelf'
  | 'cobweb'

/** A prop whose state can change (static decoration lives in StageInfo.decor). */
export interface PropView {
  id: number
  kind: PropKind
  x: number
  y: number
  z?: number
  /**
   * Kind-specific state: 'idle' | 'on' | 'off' | 'open' | 'opening' | 'closed' | 'lifted' | 'gripped' | 'sliding'
   * | 'broken' | 'cut' | 'hit' | 'pull' | 'boing'.
   */
  state: string
  st: number
  /** Heavy objects and blocks: required strength and current strength (strain meter). */
  weight?: number
  strength?: number
  /** Sliding block: from → to (tile centres) over [st, st + dur]. */
  from?: [number, number]
  to?: [number, number]
  dur?: number
}

/**
 * Shots. Stage 2 adds 'bomb' (the alchemist's lobbed flask: z arc, lands on its circle telegraph and bursts),
 * 'hex' (the cat witch's homing bolt; fx sheet 'hex') and 'barrel' (a thrown barrel, `prop: 'barrel'`).
 */
export type ShotKind = 'arrow' | 'bolt' | 'orb' | 'enemy_arrow' | 'fireball' | 'pot' | 'bomb' | 'hex' | 'barrel'

export interface ShotView {
  id: number
  kind: ShotKind
  x: number
  y: number
  z: number
  vx: number
  vy: number
  /** Thrown props carry their kind for drawing. */
  prop?: PropKind
}

export type PickupKind = 'heart' | 'bigheart' | 'gem' | 'gem_big' | 'key' | 'orb'

export interface PickupView {
  id: number
  kind: PickupKind
  x: number
  y: number
  /** Spawn time (bounce-in animation). */
  st: number
}

export type TechKind = 'jumbo' | 'stampede' | 'tornado' | 'pack'

export interface TechView {
  id: number
  kind: TechKind
  tier: 2 | 3 | 4
  /** Member slots. */
  slots: number[]
  /** Technique stage ('form' | 'jump' | 'land' | 'run' | 'spin' | 'howl' | 'lunge' | 'wave' | 'end'). */
  stage: string
  st: number
  x: number
  y: number
  z: number
  /** Target point and direction. */
  tx: number
  ty: number
  a: number
}

export interface FormationView {
  slots: number[]
  x: number
  y: number
  /** Any member fully charged (ring pulses). */
  ready: boolean
}

/** Visual/audio-only happenings. Each client plays each id once. */
export type EventKind =
  /** Damage dealt: a = amount, b = 1 when critical/heavy; s = 'enemy' | 'hero' | 'boss' | 'prop'. */
  | 'hit'
  /** Blocked by a guard. */
  | 'clang'
  | 'heal'
  | 'kill'
  /** A sound: s = SfxName. */
  | 'sfx'
  /** Floating text: s = text (Japanese allowed), a = colour index (job slot or -1). */
  | 'pop'
  /** Screen shake: a = strength in px. */
  | 'shake'
  /** Hit-stop: a = milliseconds. */
  | 'stop'
  /** Big centred banner: s = text. */
  | 'banner'
  /** Particle bursts: s = 'dust' | 'leaf' | 'shard' | 'splash' | 'smoke' | 'spark' | 'feather' | 'rubble'. */
  | 'burst'
  /** Effect animation from the fx sheet at x, y: s = animation name, a = angle. */
  | 'fx'
  /** Formation formed/changed: a = size. */
  | 'form'
  /** Co-op technique started: a = tier, s = technique name. */
  | 'tech'
  /** A puzzle solved / gate opened (chime + camera nudge): s = message. */
  | 'solve'
  /** Party-wide notice in the log: s = text. */
  | 'notice'

export interface EventView {
  id: number
  t: number
  k: EventKind
  x: number
  y: number
  a?: number
  b?: number
  s?: string
}

export interface PlayerView {
  id: string
  name: string
  /** Slots this human owns (controlled one first). */
  slots: number[]
  /** Slot currently controlled (-1 for spectators). */
  ctrl: number
  spectator?: boolean
  menu?: boolean
  /** Optional: job picked in the lobby. */
  job?: Job
}

export interface DialogView {
  /** Who speaks (NPC name or sign). */
  speaker: string
  text: string
  /** Where the bubble points. */
  x: number
  y: number
  until: number
}

export interface View {
  v: 1
  t: number
  seq: number
  stage: StageId
  species: Species
  phase: Phase
  heroes: HeroView[]
  enemies: EnemyView[]
  boss?: BossView
  props: PropView[]
  /** Prop ids from the stage data that are gone (cut grass, broken pots and rocks). */
  gone: number[]
  shots: ShotView[]
  pickups: PickupView[]
  techs: TechView[]
  formations: FormationView[]
  events: EventView[]
  players: PlayerView[]
  party: { gems: number; keys: number; techs: number; kos: number; time: number; wipes: number }
  /** せーの countdown started at (GO at +3 s). */
  signal?: { at: number; slot: number }
  dialogs: DialogView[]
  /** Current objective line for the HUD. */
  objective: string
  /** Camera hint: the room the party leader is in (boss arena zooms out). */
  room?: string
  /** Lobby state (phase 'lobby'). */
  lobby?: { stage: StageId; unlocked: StageId[] }
  /** Stage results (phase 'clear'). */
  results?: StageResults
  /** Optional: water/pit tile indices (ty * w + tx) filled by sunk blocks; draw and walk them as 'floor'. */
  fills?: number[]
  /** Optional: current channels stopped by an open sluice (StageInfo.currents channel ids). */
  currentsOff?: string[]
  /** Optional: snares set by rat-catchers (fx 'snare'; 'snare_snap' when one catches a hero). */
  snares?: SnareView[]
  /**
   * Optional: the boss's companion drawn as its own entity (stage 2: milda's giant cat, sheet `boss:cat`). `anim`
   * uses BOSS_EXTRA_SPEC.cat base names, `animKey` the exact key; `broken` = stunned until.
   */
  bossPet?: PetView
}

export interface StageResults {
  stage: StageId
  time: number
  gems: number
  techs: number
  kos: number
  wipes: number
  rank: 'S' | 'A' | 'B' | 'C'
  /** Badges per slot, e.g. 'KO王', '陣形の要', '回復役'. */
  badges: { slot: number; title: string }[]
}

/* ------------------------------------------------------------------------------------------------- static */

/** The static part of a stage, built identically on every client from the stage data. */
export interface SnareView {
  id: number
  x: number
  y: number
  st: number
  /** Slot of the hero it holds, while it holds one. */
  slot?: number
}

/** A boss companion (same fields as BossView with its own kind). */
export interface PetView extends Omit<BossView, 'kind'> {
  kind: 'cat'
}

export interface StageInfo {
  id: StageId
  /** Size in tiles. */
  w: number
  h: number
  /** Row-major terrain kinds. */
  tiles: TileKind[]
  /** Static decoration (never in the View): props-sheet animation base name, anchor position, mirror. */
  decor: { kind: PropKind | string; x: number; y: number; flip?: boolean }[]
  /** NPCs (static, talk with E). */
  npcs: { kind: NpcKind; x: number; y: number; name: string }[]
  /** Camera rooms in tiles; `zoom` = view height in art px inside (boss arenas 720). */
  rooms: { id: string; x: number; y: number; w: number; h: number; zoom?: number; name?: string }[]
  /** Lighting: 'day' | 'dim' | 'night' (stage 4 darkness). */
  light: 'day' | 'dim' | 'night'
  /**
   * Optional: water currents. Each channel pushes walking heroes on its tiles (indices ty * w + tx) along (dx, dy)
   * at `speed` px/s unless it is listed in View.currentsOff. A formation of 3+ walks against normal currents;
   * `strong` ones push everyone (until a sluice stops them).
   */
  currents?: { channel: string; dx: number; dy: number; speed: number; tiles: number[]; strong?: boolean }[]
  /** Optional: mouse-hole pairs (tile indices of two `hole` tiles); a dashing rat goes in one and out the other. */
  holes?: [number, number][]
}

/** Sound helper type for events whose s is a sound name. */
export type SfxEventName = SfxName
