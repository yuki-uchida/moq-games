/** Internal world state shared by the sim modules (never sent as is; view.ts builds the snapshot). */
import type { BossKind, EnemyKind, Job, Species, StageId } from '../vocab'
import type { Grid } from './grid'
import type { Body } from './move'
import type { Rng } from './rng'
import type { Cond, ParsedStage } from './stage-data'
import type {
  DialogView,
  EnemyState,
  EventKind,
  EventView,
  HeroReport,
  HeroState,
  InputState,
  Phase,
  PickupKind,
  PropKind,
  ShotKind,
  StageResults,
  Telegraph,
  TechKind
} from './types'

/** What a hero wants to do this tick (from a human's input or the companion AI). */
export interface Intent {
  mx: number
  my: number
  aim: number
  aimDist: number
  held: boolean
  press: boolean
  release: boolean
  action: boolean
  actionHeld: boolean
  interact: boolean
}

export const NO_INTENT: Intent = {
  mx: 0,
  my: 0,
  aim: Math.PI / 2,
  aimDist: 256,
  held: false,
  press: false,
  release: false,
  action: false,
  actionHeld: false,
  interact: false
}

export interface HeroStats {
  kos: number
  dmg: number
  heals: number
  techs: number
  formTime: number
  hurt: number
}

export interface Hero {
  slot: number
  job: Job
  body: Body
  state: HeroState
  st: number
  /** Timed states (attack, skill, hurt, revive) end at. */
  until: number
  hp: number
  maxHp: number
  owner: string
  aim: number
  atkReady: number
  /** Press time of the current hold (−1 when not holding). */
  holdAt: number
  charging: boolean
  chargeFull: boolean
  chargeLock: number
  inv: number
  stun: number
  /** Snared (mousetrap, rat-catcher snare) until: cannot move. */
  snared: number
  /** Held prop id and how. */
  hold?: number
  holdKind?: 'lift' | 'grip'
  /** Down since / revive progress (s). */
  downAt: number
  revive: number
  fallUntil: number
  safeX: number
  safeY: number
  forceSeq: number
  force?: { seq: number; kind: 'warp' | 'impulse'; x: number; y: number; vx: number; vy: number }
  clericHits: number
  intent: Intent
  stats: HeroStats
  /** Index into the formations of this tick. */
  form: number
  /** Stay-mode anchor. */
  anchor?: { x: number; y: number }
  /** Companion AI memory. */
  ai: CompanionMemory
  /** Pushing a block this tick. */
  pushing: boolean
  /** Guest report bookkeeping. */
  accepted?: { x: number; y: number; t: number }
  report?: HeroReport
  reportAirborne: boolean
}

export interface CompanionMemory {
  /** Catch-up speed multiplier (companions only; never predicted). */
  boost: number
  path?: number[]
  pathAt: number
  goalTile: number
  stuckT: number
  lastX: number
  lastY: number
  /** Pending mimic actions (time to perform). */
  queue: { at: number; kind: 'attack' | 'hold' | 'release' | 'interact' | 'howl'; aim: number }[]
  ownerHeld: boolean
  goPending: boolean
}

export interface Human {
  id: string
  name: string
  input: InputState & { aimDist?: number; interactHeld?: boolean }
  seen: {
    attackPresses: number
    attackReleases: number
    actionPresses: number
    interactPresses: number
    switchPresses: number
    modePresses: number
    signalPresses: number
  }
  ctrl: number
  mode: 'follow' | 'stay'
  job?: Job
  jobAt: number
  spectator: boolean
  menu: boolean
  /** Guests send reports; the host's own input never carries one. */
  report?: HeroReport
  reportFresh: boolean
}

export interface Prop {
  id: number
  kind: PropKind
  x: number
  y: number
  z: number
  state: string
  st: number
  part?: string
  weight: number
  strength: number
  cond?: Cond
  latch: boolean
  latched: boolean
  lock?: string
  drop: PickupKind[]
  group?: string
  accepts?: string
  /** Sluice: current channels stopped while open. */
  stops: string[]
  on: boolean
  gone: boolean
  goneAt: number
  /** Sliding block. */
  slide?: { from: [number, number]; to: [number, number]; t0: number; dur: number; sink: boolean }
  pushT: number
  pushDir: number
  strainAt: number
  /** Crystal on until. */
  onUntil: number
  /** Where it started (stuck pushables and lost heavy objects return here) and how long it has been stuck. */
  homeX: number
  homeY: number
  stuckT: number
  /** Gripping heroes (slots). */
  grips: number[]
  holder?: number
  delivered: boolean
  /** Grass/pot/crate drop roll done. */
}

export interface Enemy {
  id: number
  kind: EnemyKind
  x: number
  y: number
  vx: number
  vy: number
  kx: number
  ky: number
  r: number
  facing: number
  hp: number
  maxHp: number
  state: EnemyState
  st: number
  until: number
  alertAt?: number
  hitAt?: number
  stun: number
  guardOff: number
  cd: number
  tele?: Telegraph
  target?: number
  aimA: number
  room?: string
  wave?: number
  /** Called in by a boss (removed on a wipe). */
  summoned?: boolean
  /** Thief: gems carried (returned on KO); fleeing until. */
  carry: number
  fleeUntil: number
  /** Bell monk's ward (damage halved) until; healer timers. */
  ward: number
  healAt: number
  ringAt: number
  dead: boolean
  /** Strike point (melee) or cast point. */
  px: number
  py: number
  striking: boolean
}

export interface Boss {
  id: number
  kind: BossKind
  x: number
  y: number
  z: number
  r: number
  facing: number
  hp: number
  maxHp: number
  anim: string
  st: number
  until: number
  phase: number
  active: boolean
  broken: number
  hitAt?: number
  tele: Telegraph[]
  cd: number
  /** Current action (garud: idle/walk/windup/charge/sweep/slam/call/broken/death; milda: idle/cast/summon/broken/death). */
  act: string
  next?: 'charge' | 'sweep' | 'slam'
  aimA: number
  chargeLeft: number
  calls: number
  /** Technique guard breaks so far; second sweep of the phase-2 double sweep pending. */
  breaks: number
  secondSweep: boolean
  /** 鉄壁 (technique-proof guard) until; set when a technique guard break ends. */
  steel: number
  steelNext: boolean
  hitSet: Set<number>
  dead: boolean
  homeX: number
  homeY: number
  /** Valk: landing spot. */
  px?: number
  py?: number
}

/** The boss's companion (stage 2: milda's giant cat). It is never damaged; techniques stun it. */
export interface Pet {
  id: number
  kind: 'cat'
  x: number
  y: number
  z: number
  r: number
  facing: number
  anim: string
  st: number
  until: number
  act: string
  cd: number
  /** Stunned until; wary (techniques don't stun) until. */
  stun: number
  wary: number
  aimA: number
  /** Pounce target and start. */
  px: number
  py: number
  sx: number
  sy: number
  second: boolean
  hitAt?: number
  hitSet: Set<number>
  tele: Telegraph[]
  dead: boolean
  homeX: number
  homeY: number
}

export interface Shot {
  id: number
  kind: ShotKind
  x: number
  y: number
  z: number
  vx: number
  vy: number
  range: number
  dmg: number
  pierce: number
  hits: Set<number>
  from: 'hero' | 'enemy'
  slot: number
  /** Burst radius on impact (mage). */
  burst: number
  burstDmg: number
  prop?: number
  burstAtEnd?: boolean
  /** Lobbed shot (alchemist bomb): from, target, start time and flight time. */
  lob?: { x0: number; y0: number; tx: number; ty: number; t0: number; dur: number }
  /** Homing shot (hex): turn rate (rad/s) and life end. */
  homing?: { rate: number; until: number }
  z0: number
  dist: number
  dead: boolean
}

export interface Pickup {
  id: number
  kind: PickupKind
  x: number
  y: number
  st: number
  vx: number
  vy: number
  taken: boolean
}

export interface Tech {
  id: number
  kind: TechKind
  tier: 2 | 3 | 4
  slots: number[]
  /** jumbo: form → jump → land; stampede: form → run → end. */
  stage: string
  st: number
  x: number
  y: number
  z: number
  cx: number
  cy: number
  tx: number
  ty: number
  a: number
  starts: { slot: number; x: number; y: number }[]
  landed: boolean
  /** Stampede: run order (releaser first), run time and the ids already hit. */
  line?: number[]
  dur?: number
  /** Pack: lunge targets (enemy or boss ids) and their points. */
  targets?: number[]
  points?: [number, number][]
  index?: number
  hit?: Set<number>
}

/** A summoned minion (stage 3: the falconer's hawk). */
export interface Minion {
  id: number
  kind: 'hawk'
  owner: number
  x: number
  y: number
  z: number
  facing: number
  state: string
  st: number
  until: number
  hp: number
  maxHp: number
  hitAt?: number
  tele?: Telegraph
  aimA: number
  cd: number
  struck: boolean
  dead: boolean
}

export interface Snare {
  id: number
  x: number
  y: number
  st: number
  owner: number
  /** Slot held and until when. */
  slot?: number
  until: number
}

export interface Formation {
  slots: number[]
  x: number
  y: number
}

export interface Dialog extends DialogView {
  key: string
  page: number
  pages: string[]
}

export interface ArenaState {
  state: 'idle' | 'active' | 'cleared'
  wave: number
}

export interface WorldState {
  seed: number
  rng: Rng
  t: number
  seq: number
  phase: Phase
  phaseAt: number
  stage: StageId
  species: Species
  lobbyStage: StageId
  parsed?: ParsedStage
  grid?: Grid
  humans: Human[]
  heroes: Hero[]
  enemies: Enemy[]
  boss?: Boss
  pet?: Pet
  props: Prop[]
  shots: Shot[]
  pickups: Pickup[]
  techs: Tech[]
  formations: Formation[]
  prevForms: Map<string, number>
  events: EventView[]
  nextEvent: number
  nextId: number
  party: { gems: number; keys: number; techs: number; kos: number; time: number; wipes: number }
  signal?: { at: number; slot: number; ticks: number }
  dialogs: Dialog[]
  flags: Set<string>
  arenas: Map<string, ArenaState>
  checkpoint: string
  checkpointsReached: Set<string>
  roomsSeen: Set<string>
  bigFormRooms: Set<string>
  results?: StageResults
  cleared: StageId[]
  leaderRoom?: string
  orb?: number
  orbTaken: boolean
  /** Current channels stopped by open sluices. */
  currentsOff: string[]
  snares: Snare[]
  minions: Minion[]
  /** Recent howls (for moonstone resonance). */
  howls: { t: number; x: number; y: number; slot: number }[]
}

export type Emit = (k: EventKind, x: number, y: number, extra?: { a?: number; b?: number; s?: string }) => void
