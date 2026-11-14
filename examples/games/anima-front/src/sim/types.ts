/**
 * The sim's contract with every other layer (DESIGN §1–§2). render, ui, audio and net only see these shapes.
 * Views are plain JSON (no classes, no typed arrays) so they can be deflated and sent as snapshots.
 */
import type { Difficulty, FoeAttack, FoeKind } from '../data/enemies'
import type { ItemId } from '../data/items'
import type { Hand, Loadout } from '../data/loadout'
import type { MissionId, Speaker } from '../data/missions'
import type { SpeciesId } from '../data/species'

export type { Hand, Loadout, LoadoutSlot } from '../data/loadout'

/** [x, y, z] in metres; positions of actors are their feet. */
export type V3 = [number, number, number]

export type ModeId = 'pve' | 'pvp' | 'training'
export type MapId = 'oldtown' | 'harbor' | 'blight' | 'arena' | 'range'
export type MapTheme = 'day' | 'sunset' | 'night' | 'blight' | 'virtual'
export type TeamId = 0 | 1 | 2
/** Anything that can own damage: a player id (string) or a foe id (number). */
export type ActorRef = string | number

// ---------------------------------------------------------------------------------------------------------------
// Match setup

export interface PlayerConfig {
  /** Stable id: [a-zA-Z0-9_-]{1,64}. */
  id: string
  name: string
  species: SpeciesId
  loadout: Loadout
  team: TeamId
  /** Bot skill 0..1; undefined for a human. */
  bot?: number
}

export interface MatchConfig {
  mode: ModeId
  map: MapId
  /** PvE only. */
  mission?: MissionId
  difficulty?: Difficulty
  /** oldtown at night (黒爪の夜襲) or the blight's crater (喰らう柱). */
  variant?: 'night' | 'crater'
  seed: number
  players: PlayerConfig[]
  training?: { infiniteAnima?: boolean; tutorial?: boolean }
  /** PvP length in seconds (default 360). */
  duration?: number
  /** Seconds of the pre-match countdown (default 3). */
  countdown?: number
}

// ---------------------------------------------------------------------------------------------------------------
// Input

/** Held-button bits of `PlayerInput.held`. */
export const BTN = {
  R: 1,
  L: 2,
  JUMP: 4,
  DASH: 8,
  INTERACT: 16
} as const

/**
 * One player's control state. Humans send it at 30 Hz; bots produce it every tick. Edge actions use monotonic
 * counters so a press is never lost or doubled between samples; paw selection is an absolute index (idempotent).
 */
export interface PlayerInput {
  /** Strafe right (+) / left (−) and forward (+) / back (−), relative to `yaw`; length ≤ 1. */
  mx: number
  mz: number
  yaw: number
  pitch: number
  /** BTN bits currently held. */
  held: number
  /** Monotonic press counters (never decrease). */
  presses: { r: number; l: number; jump: number; dash: number }
  /** Desired active index in each paw's list. */
  selR: number
  selL: number
  /** Camera shoulder: 1 = right (default), −1 = left. */
  shoulder: 1 | -1
}

export const neutralPlayerInput = (): PlayerInput => ({
  mx: 0,
  mz: 0,
  yaw: 0,
  pitch: 0,
  held: 0,
  presses: { r: 0, l: 0, jump: 0, dash: 0 },
  selR: 0,
  selL: 0,
  shoulder: 1
})

// ---------------------------------------------------------------------------------------------------------------
// View (snapshot)

export type Phase = 'countdown' | 'play' | 'victory' | 'defeat' | 'draw'
export type MoveState = 'idle' | 'run' | 'air' | 'dash' | 'slide' | 'glide' | 'hook' | 'launch'
export type HandAct = 'idle' | 'fire' | 'charge' | 'guard' | 'swing' | 'beam' | 'cooldown'

export interface HandView {
  /** This paw's active antiques in slot order. */
  items: ItemId[]
  /** Index of the active antique (or −1 when the paw is empty). */
  sel: number
  /** 0 = ready; 0..1 while the antique dissolves/re-forms after a switch. */
  swap: number
  act: HandAct
  /** 0..1: charge (hippo), zoom steadiness (owl), lock progress (swallow), guard/shield raise. */
  charge: number
  /** Seconds left before the active antique can be used again. */
  cooldown: number
  /** Increments on every shot/swing/use (drives one-shot animations on the client). */
  uses: number
  /** Combo step of the last swing (0-based). */
  combo: number
  /** Foes/players currently locked by ツバメ. */
  locks?: ActorRef[]
}

export interface PlayerStats {
  kos: number
  assists: number
  /** Times this player's armour broke. */
  downs: number
  revives: number
  damage: number
  taken: number
  /** Anima spent on antiques and upkeep. */
  spent: number
  /** Anima regained (regen, shards, honey). */
  gathered: number
  shots: number
  hits: number
  /** Anima spent per antique (for "most used"). */
  byItem: Partial<Record<ItemId, number>>
}

export interface PlayerView {
  id: string
  name: string
  team: TeamId
  species: SpeciesId
  bot: boolean
  p: V3
  v: V3
  yaw: number
  pitch: number
  shoulder: 1 | -1
  anima: number
  maxAnima: number
  state: 'alive' | 'down' | 'away'
  /** down: seconds until warp-out; away: seconds until respawn, or −1 when no tickets are left (stays away). */
  timer: number
  /** 0..1 while an ally revives this player. */
  revive: number
  /** Id of the player this one is reviving. */
  reviving?: string
  invuln: boolean
  grounded: boolean
  move: MoveState
  /** [right paw, left paw]. */
  hands: [HandView, HandView]
  /** Equipped passive antiques in slot order (duplicates kept). */
  passives: ItemId[]
  passivesOnline: boolean
  /** 0..1 camouflage. */
  cloak: number
  /**
   * Revealed by sonar: in a world's own view, to any other side (see revealedTo); in a view made for one team
   * (online snapshots, the local PvP screen), to that team.
   */
  revealed: boolean
  /** Teams sonar currently reveals this player to (omitted when none; never sent to guests). */
  revealedTo?: TeamId[]
  /** Anima lost or spent during the last 3 s (the gauge's burn ghost). */
  burn: number
  /** Seconds until the dash is ready. */
  dashCooldown: number
  /** Time of the last jelly negate (for the bubble), −1 if never. */
  negateAt: number
  stats: PlayerStats
}

export type FoeState = 'spawn' | 'idle' | 'move' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dying'

export interface FoeView {
  id: number
  kind: FoeKind
  p: V3
  yaw: number
  hp: number
  maxHp: number
  state: FoeState
  /** Seconds spent in `state`. */
  st: number
  /** Attack being wound up / performed. */
  attack?: FoeAttack
  /** Aimed point of the current attack (telegraph markers). */
  aim?: V3
  revealed: boolean
  /** Inside a タテガミ dome. */
  shielded: boolean
  /** Boss parts: ゴウテツ legs hp (4), クイツクシ [coreOpen 0/1, phase]. */
  parts?: number[]
  /** クロヅメ animals are drawn like players. */
  animal?: { species: SpeciesId; hands: [HandView, HandView]; pitch: number; move: MoveState; grounded: boolean }
}

export type ShotKind = ItemId | 'acid' | 'laser' | 'plasma' | 'missile' | 'acidRain'

export interface ShotView {
  id: number
  kind: ShotKind
  /** Team of the shooter, or 'foe'. */
  team: TeamId | 'foe'
  p: V3
  v: V3
  owner?: ActorRef
}

export type PropKind =
  | 'frog'
  | 'hermit'
  | 'honey'
  | 'decoy'
  | 'leafDecoy'
  | 'ink'
  | 'lighthouse'
  | 'zone'
  | 'cart'
  | 'node'
  | 'target'
  | 'pad'
  | 'base'
  | 'tutorial'
  /** Acid left by ハリガネ / クイツクシ: damages players standing in it (`r`, `life`). */
  | 'puddle'

export interface PropView {
  id: number
  kind: PropKind
  p: V3
  yaw: number
  team: TeamId | 'foe' | -1
  hp?: number
  maxHp?: number
  /** Radius for zones, ink, honey, bases. */
  r?: number
  /** Seconds since it appeared. */
  t: number
  /** Seconds left (deployables). */
  life?: number
  owner?: string
  /** zone: capture progress 0..1; node: 1 = exposed; cart: path progress 0..1; target: 1 = moving; tutorial: step. */
  state?: number
  /** Zone letter / label. */
  label?: string
  /** Decoys look like their owner. */
  species?: SpeciesId
}

export interface ShardView {
  id: number
  p: V3
  amount: number
  /** Collector the shard is flying to. */
  to?: string
}

export interface PveView {
  mission: MissionId
  difficulty: Difficulty
  /** 1-based wave / phase. */
  wave: number
  waves: number
  /** Seconds until the next wave starts (0 while a wave runs). */
  next: number
  foesLeft: number
  tickets: number
  objective: { label: string; progress?: number; hp?: number; maxHp?: number; step?: number; steps?: number }
  boss?: { kind: FoeKind; name: string; hp: number; maxHp: number; phase: number }
  /** Final mission score and rank once the mission ended. */
  result?: { score: number; rank: 'S' | 'A' | 'B' | 'C'; time: number; mvp?: string }
}

export interface PvpView {
  scores: [number, number, number]
  lastSpurt: boolean
  suddenDeath: boolean
  winner?: TeamId | -1
  mvp?: string
}

export interface TrainingView {
  infinite: boolean
  /** Tutorial step index (−1 when free). */
  step: number
  steps: number
  /** Japanese instruction for the current step. */
  hint?: string
}

export interface View {
  tick: number
  /** Sim seconds since the match was created. */
  time: number
  mode: ModeId
  map: MapId
  variant?: 'night' | 'crater'
  phase: Phase
  /** countdown: seconds to start; pvp: seconds left; pve/training: seconds elapsed. */
  clock: number
  players: PlayerView[]
  foes: FoeView[]
  shots: ShotView[]
  props: PropView[]
  shards: ShardView[]
  pve?: PveView
  pvp?: PvpView
  training?: TrainingView
  /** Events since the previous view() (ids are increasing; guests de-duplicate by id). */
  events: SimEvent[]
}

// ---------------------------------------------------------------------------------------------------------------
// Events

export type Surface = 'concrete' | 'metal' | 'wood' | 'crystal' | 'ground' | 'foliage' | 'glass' | 'virtual'
export type HitSurface = 'fur' | 'chitin' | 'metal' | 'shield' | 'guard' | 'shell' | 'prop'

export type SimEvent = { id: number; t: number } & (
  | { type: 'phase'; phase: Phase }
  | { type: 'countdown'; n: number }
  | { type: 'fire'; who: ActorRef; item: ShotKind; hand?: Hand; from: V3; dir: V3 }
  | { type: 'swing'; who: string; item: ItemId; hand: Hand; combo: number }
  | {
      type: 'hit'
      target: ActorRef
      targetKind: 'player' | 'foe' | 'prop'
      by?: ActorRef
      item?: ShotKind | FoeAttack
      amount: number
      at: V3
      head?: boolean
      weak?: boolean
      blocked?: boolean
      negated?: boolean
      surface: HitSurface
    }
  | { type: 'impact'; at: V3; normal: V3; surface: Surface; item: ShotKind }
  | { type: 'blast'; at: V3; radius: number; item: ShotKind | FoeAttack; team: TeamId | 'foe' }
  | { type: 'empty'; who: string; hand: Hand }
  | { type: 'swap'; who: string; hand: Hand; item: ItemId }
  | { type: 'jump'; who: string; air: boolean }
  | { type: 'land'; who: string; hard: boolean }
  | { type: 'dash'; who: string; slide: boolean }
  | { type: 'launch'; who: string; pad: number }
  | { type: 'hook'; who: string; to: V3; done?: boolean }
  | { type: 'glide'; who: string; on: boolean }
  | { type: 'cloak'; who: string; on: boolean }
  | { type: 'deploy'; who: string; item: ItemId; prop: number; at: V3 }
  | { type: 'propHit'; prop: number; amount: number; at: V3 }
  | { type: 'propBreak'; prop: number; kind: PropKind; at: V3 }
  | { type: 'passives'; who: string; online: boolean }
  | { type: 'critical'; who: string }
  | { type: 'armorBreak'; who: ActorRef; at: V3; by?: ActorRef }
  | { type: 'down'; who: string }
  | { type: 'reviveStart'; who: string; by: string }
  | { type: 'revive'; who: string; by: string }
  | { type: 'warp'; who: string; at: V3 }
  | { type: 'respawn'; who: string; at: V3 }
  | {
      type: 'ko'
      who: ActorRef
      by?: ActorRef
      assists: ActorRef[]
      item?: ShotKind | FoeAttack
      /** PvP: scoring team and points. */
      team?: TeamId
      points?: number
    }
  | { type: 'shard'; who: string; amount: number; at: V3 }
  | { type: 'heal'; who: string; amount: number; source: 'honey' | 'base' }
  | { type: 'reveal'; who: string; at: V3; radius: number }
  /** Foe events name the foe in `foe` (the event's own `id` is the sequence number). */
  | { type: 'foeSpawn'; foe: number; kind: FoeKind; at: V3 }
  | { type: 'foeWindup'; foe: number; attack: FoeAttack; at: V3; aim?: V3 }
  | { type: 'foeAttack'; foe: number; attack: FoeAttack; at: V3; aim?: V3 }
  | { type: 'foeDie'; foe: number; kind: FoeKind; at: V3; by?: ActorRef; weak?: boolean }
  | { type: 'bossPhase'; foe: number; kind: FoeKind; phase: number }
  | { type: 'bossPart'; foe: number; kind: FoeKind; part: number }
  | { type: 'wave'; wave: number; waves: number; boss?: boolean }
  | { type: 'waveClear'; wave: number }
  | {
      type: 'objective'
      what: 'progress' | 'captured' | 'contested' | 'damaged' | 'destroyed' | 'arrived' | 'lost' | 'complete'
      prop?: number
      label?: string
    }
  | { type: 'radio'; who: Speaker; text: string }
  | { type: 'lastSpurt' }
  | { type: 'suddenDeath' }
  | { type: 'tutorial'; step: number; hint: string }
)

export type SimEventType = SimEvent['type']

// ---------------------------------------------------------------------------------------------------------------
// Maps (static data; built by src/sim/maps, read by the renderer)

export type BoxKind =
  | 'ground'
  | 'road'
  | 'building'
  | 'roof'
  | 'wall'
  | 'platform'
  | 'stairs'
  | 'crate'
  | 'container'
  | 'car'
  | 'rock'
  | 'crystal'
  | 'tree'
  | 'fence'
  | 'pillar'
  | 'barrier'

export interface MapBox {
  min: V3
  max: V3
  kind: BoxKind
  /** Visual variant chosen by the map (colour scheme, facade type…). */
  style?: number
  /** false: visual only (no collision). Default true. */
  solid?: boolean
  /** Surface for impacts (default from kind). */
  surface?: Surface
}

export interface MapSpawn {
  /** PvP team or 'squad' (PvE / training). */
  team: TeamId | 'squad'
  p: V3
  yaw: number
}

export interface FoeSpawnPoint {
  id: string
  p: V3
  air?: boolean
  tags?: string[]
}

export interface MapDecor {
  /** Visual-only dressing the renderer knows: 'lamp', 'lantern', 'sign', 'bush', 'grass', 'cherry', 'vending', … */
  kind: string
  p: V3
  yaw?: number
  s?: number
  style?: number
}

export interface MapDef {
  id: MapId
  name: string
  theme: MapTheme
  /** Playable area (x/z); edges are walls. */
  bounds: { min: [number, number]; max: [number, number] }
  boxes: MapBox[]
  spawns: MapSpawn[]
  /** PvP team bases / PvE squad base (regen zone, respawn point). */
  bases: { team: TeamId | 'squad'; p: V3; r: number }[]
  foeSpawns: FoeSpawnPoint[]
  /** Fixed frog pads (launch like the gadget, never expire). */
  pads: { p: V3; yaw: number }[]
  /** Named points: lighthouse, zoneA…, node1…, crater, gate… */
  anchors: Record<string, V3>
  /** Named paths: the escort cart route… */
  paths: Record<string, V3[]>
  decor: MapDecor[]
}
