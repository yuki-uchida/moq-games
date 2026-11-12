/**
 * Internal (host-side) simulation state. Nothing here is part of the public contract: views are built from it by
 * view.ts. Every module receives the `Sim` and mutates it; ordering is deterministic (arrays, insertion order).
 */
import type { DIFFICULTIES, FoeAttack, FoeAttackDef, FoeDef, FoeKind } from '../data/enemies'
import type { ItemId } from '../data/items'
import type { Hand, Loadout } from '../data/loadout'
import type { SpeciesDef } from '../data/species'
import type { Physics, SpatialHash } from './physics'
import type { Rng } from './rng'
import type {
  ActorRef,
  FoeState,
  HandAct,
  MapDef,
  MatchConfig,
  MoveState,
  Phase,
  PlayerInput,
  PlayerStats,
  PropKind,
  PveView,
  PvpView,
  ShotKind,
  SimEvent,
  TeamId,
  TrainingView
} from './types'
import type { Vec } from './vec'

/** Side ids: PvP/PvE teams 0..2; every foe (and クロヅメ animal) is side 3. */
export type Side = number
export const FOE_SIDE = 3

export const sideTeam = (side: Side): TeamId | 'foe' => (side === FOE_SIDE ? 'foe' : (side as TeamId))

export interface Mods {
  meleeDamage: number
  meleeCost: number
  rangedDamage: number
  rangedCost: number
  spread: number
  armorEffect: number
  armorUpkeep: number
  cost: number
  rate: number
  regen: number
  regenDelay: number
  speed: number
  dashCooldown: number
  maxAnima: number
}

/** Everything derived once from a loadout + species. */
export interface Build {
  R: ItemId[]
  L: ItemId[]
  passives: ItemId[]
  mods: Mods
  /** Damage reduction of passive armour (already × armour effect, capped). */
  armorReduce: number
  /** Move speed change from passive armour (negative). */
  armorSpeed: number
  /** ハリネズミ: share of melee damage returned, contact dps. */
  reflect: number
  contactDps: number
  /** クラゲヴェール: seconds between negates (0 = none). */
  negateEvery: number
  /** モモンガ equipped. */
  glider: boolean
  /** Anima/s drained by online passives. */
  upkeep: number
  maxAnima: number
}

export type HandMode = 'idle' | 'zoom' | 'lock' | 'charge' | 'guard' | 'shield' | 'beam' | 'slam' | 'lunge'

export interface HandSt {
  hand: Hand
  items: ItemId[]
  sel: number
  /** Index being switched to while `swap` > 0. */
  want: number
  /** Seconds left of the current switch. */
  swap: number
  /** Last seen value of the paw's press counter. */
  seen: number
  /** Presses waiting to be used. */
  queue: number
  held: boolean
  /** Seconds the button has been held (since the press that started it). */
  holdT: number
  /** A press arrived and was released before any sample saw it held (tap between samples). */
  tapRelease: boolean
  act: HandAct
  charge: number
  /** Time at which the active antique can be used again. */
  readyAt: number
  uses: number
  combo: number
  comboAt: number
  mode: HandMode
  modeT: number
  locks: { ref: ActorRef; at: number }[]
  lockRef: ActorRef | null
  lockT: number
  /** Extra spread (degrees) of automatic weapons. */
  bloom: number
  emptyAt: number
  /** Slam/lunge in progress: direction and progress. */
  dir: Vec
  hitSet: Set<ActorRef> | null
  /** The paw's last beam targets (chain). */
  beam: ActorRef[]
  /** The activation of a hold-type antique (zoom, lock, charge) still has its button down. */
  armed: boolean
  /** Minimum end time of a tapped hold action (beam, shield). */
  until: number
  /** Ticks since the last beam damage application. */
  beamTick: number
}

export interface Player {
  id: string
  name: string
  team: TeamId
  side: Side
  species: SpeciesDef
  loadout: Loadout
  build: Build
  /** Bot skill 0..1, undefined for humans. */
  bot: number | undefined
  brain: unknown
  input: PlayerInput
  /** Consumed edge counters for jump/dash. */
  seenJump: number
  seenDash: number
  p: Vec
  v: Vec
  yaw: number
  pitch: number
  shoulder: 1 | -1
  r: number
  h: number
  grounded: boolean
  anima: number
  maxAnima: number
  online: boolean
  infinite: boolean
  state: 'alive' | 'down' | 'away'
  timer: number
  revive: number
  revivedBy: string | undefined
  reviving: string | undefined
  invulnUntil: number
  move: MoveState
  coyote: number
  jumpBuf: number
  airJumps: number
  airDash: boolean
  dashT: number
  dashReadyAt: number
  dashDir: Vec
  slide: boolean
  landSlowUntil: number
  gliding: boolean
  hook: { to: Vec; t: number } | null
  launched: boolean
  padLockUntil: number
  hands: [HandSt, HandSt]
  cloakOn: boolean
  cloak: number
  attackRevealUntil: number
  revealedUntil: number
  negateAt: number
  lastSpend: number
  lastHurt: number
  /** (time, amount) of anima lost or spent, pruned to the burn window. */
  burnLog: number[]
  stats: PlayerStats
  damagers: Map<ActorRef, number>
  /** Set for クロヅメ avatars (not in `sim.players`). */
  foe: Foe | null
  spawnP: Vec
  spawnYaw: number
  /** Training: metres walked and radians turned (tutorial). */
  walked: number
  turned: number
  /** Accumulators for once-per-second heal events. */
  healAcc: { honey: number; base: number; at: number }
  /** Contact damage accumulator (ハリネズミ). */
  removed: boolean
}

export type TargetRef = { k: 'p'; id: string } | { k: 'f'; id: number } | { k: 'r'; id: number }

export interface Foe {
  id: number
  kind: FoeKind
  def: FoeDef
  p: Vec
  v: Vec
  yaw: number
  hp: number
  maxHp: number
  state: FoeState
  st: number
  attack: FoeAttackDef | null
  aim: Vec | null
  /** Ready time per attack id. */
  cds: Partial<Record<FoeAttack, number>>
  target: TargetRef | null
  retargetAt: number
  damagers: Map<ActorRef, number>
  revealedUntil: number
  shielded: boolean
  parts: number[] | undefined
  grounded: boolean
  r: number
  h: number
  dmgMul: number
  avatar: Player | null
  /** Per-kind scratch memory. */
  mem: Record<string, number>
  memV: Vec
  /** PvE wave index (−1 none) and spawn tag. */
  wave: number
  /** Training dummy: never attacks. */
  passive: boolean
  dead: boolean
}

export interface Shot {
  id: number
  kind: ShotKind
  item: ItemId | undefined
  foeAttack: FoeAttack | undefined
  side: Side
  owner: ActorRef | undefined
  hand: Hand | undefined
  p: Vec
  v: Vec
  origin: Vec
  r: number
  dmg: number
  headMult: number
  gravity: number
  /** Seconds left. */
  life: number
  travelled: number
  range: number
  blast: { radius: number; damage: number } | null
  bounce: number
  fuse: number
  homing: { ref: ActorRef; turn: number } | null
  falloff: number
  /** Leaves an acid puddle where it lands. */
  puddle: boolean
  /** Explodes on touching an actor even while bouncing. */
  explodeOnActor: boolean
  knock: number
  gone: boolean
}

export interface Prop {
  id: number
  kind: PropKind
  p: Vec
  yaw: number
  side: Side | -1
  hp: number | undefined
  maxHp: number | undefined
  r: number | undefined
  born: number
  until: number | undefined
  owner: string | undefined
  state: number | undefined
  label: string | undefined
  species: SpeciesDef['id'] | undefined
  /** Pads: launch numbers. */
  launchUp: number
  launchForward: number
  /** Kind-specific numbers (cart distance, heal rate, decoy velocity…). */
  data: Record<string, number>
  dir: Vec
  gone: boolean
}

export interface Shard {
  id: number
  p: Vec
  v: Vec
  amount: number
  to: string | undefined
  born: number
}

export interface Hazard {
  /** Shares the prop id space (shown as a 'puddle' PropView). */
  id: number
  /** Sim time it appeared. */
  at: number
  p: Vec
  r: number
  dps: number
  until: number
  side: Side
  owner: ActorRef | undefined
  kind: FoeAttack
}

/**
 * An event without its sequence id/time. Foe events (foeSpawn, foeWindup, foeAttack, foeDie, bossPhase, bossPart)
 * carry the foe id in `id` here; in types.ts that field collides with the event's sequence id, so emit() moves it
 * to an extra `foe` field and keeps `id` as the increasing sequence id (contract issue reported to the lead).
 */
export type EventBody = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, 'id' | 't'> : never) : never

/** Mode controller (pve / pvp / training). */
export interface ModeCtl {
  start(sim: Sim): void
  update(sim: Sim): void
  /** Called when a player's armour breaks (anima reached 0). */
  onBroken(
    sim: Sim,
    p: Player,
    by: ActorRef | undefined,
    assists: ActorRef[],
    item: ShotKind | FoeAttack | undefined
  ): void
  onFoeKilled(sim: Sim, f: Foe, by: ActorRef | undefined): void
  onPropDamaged?(sim: Sim, prop: Prop, amount: number, by: ActorRef | undefined): void
  onPropDestroyed?(sim: Sim, prop: Prop, by: ActorRef | undefined): void
  /** Where crowd foes go when no player is close (objective), or null. */
  goal(sim: Sim, f: Foe): TargetRef | null
  /** Seconds for the view clock. */
  clock(sim: Sim): number
  pve?(sim: Sim): PveView
  pvp?(sim: Sim): PvpView
  training?(sim: Sim): TrainingView
  /** Respawn point for a player. */
  spawnFor(sim: Sim, p: Player): { p: Vec; yaw: number }
  /**
   * Where a side should be (bots): PvE squad → the objective (lighthouse, current zone, cart, nearest node, boss);
   * foes → the objective they attack; PvP → the plaza. Null when there is none.
   */
  focus(sim: Sim, side: Side): Vec | null
}

export interface Sim {
  cfg: MatchConfig
  map: MapDef
  phys: Physics
  rng: Rng
  tick: number
  time: number
  phase: Phase
  phaseAt: number
  events: SimEvent[]
  nextEvent: number
  players: Player[]
  foes: Foe[]
  shots: Shot[]
  props: Prop[]
  shards: Shard[]
  hazards: Hazard[]
  nextFoe: number
  nextShot: number
  nextProp: number
  nextShard: number
  diff: (typeof DIFFICULTIES)[keyof typeof DIFFICULTIES]
  mode: ModeCtl
  foeHash: SpatialHash<Foe>
  /** Lazily built navigation helpers (flow fields / A*). */
  nav: unknown
  flow: unknown
  /** Map variant in use (config or the mission's). */
  variant: 'night' | 'crater' | undefined
  /** Number of human players (boss HP scaling). */
  humans: number
}

export function emit(sim: Sim, e: EventBody) {
  sim.events.push({ ...e, id: sim.nextEvent++, t: Math.round(sim.time * 1000) / 1000 } as SimEvent)
}

/** The foe named by a foe event, if any. */
export const eventFoe = (e: SimEvent): number | undefined => ('foe' in e ? e.foe : undefined)

export const findPlayer = (sim: Sim, id: string) => sim.players.find((p) => p.id === id)
export const findFoe = (sim: Sim, id: number) => sim.foes.find((f) => f.id === id)
export const findProp = (sim: Sim, id: number) => sim.props.find((r) => r.id === id)

/** True once the match is in a result phase (no more scoring). */
export const isOver = (sim: Sim) => sim.phase === 'victory' || sim.phase === 'defeat' || sim.phase === 'draw'
export const isPlaying = (sim: Sim) => sim.phase === 'play'

export function makeStats(): PlayerStats {
  return {
    kos: 0,
    assists: 0,
    downs: 0,
    revives: 0,
    damage: 0,
    taken: 0,
    spent: 0,
    gathered: 0,
    shots: 0,
    hits: 0,
    byItem: {}
  }
}
