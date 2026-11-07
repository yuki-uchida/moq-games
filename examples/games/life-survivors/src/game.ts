import {
  BULLET_INDEX,
  COOKING_ITEMS,
  ENEMY_BY_ID,
  ENEMY_INDEX,
  EVENTS,
  ITEM_KINDS,
  WEAPON_LEVELS,
  MAX_GAME_PLAYERS,
  MAX_PASSIVE_LEVEL,
  MAX_WEAPON_LEVEL,
  PARENTS,
  PARENT_LEGACIES,
  PASSIVES,
  PASSIVE_BY_ID,
  PASSIVE_SLOTS,
  PLAYER_COLORS,
  POOLS,
  RUN_SECONDS,
  STAGES,
  TALENT_CATEGORIES,
  TALENT_WEAPONS,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_INDEX,
  WEAPON_SLOTS,
  isRelationshipEnemy,
  ageAt,
  stageAt,
  type BossPattern,
  type EnemyDef,
  type TalentCategory,
  type Tag,
  type WeaponDef
} from './data'
import { FX, FX_CAP, FX_WINDOW, type FxEvent } from './fx'
import { bodyScale } from './body-size'
import { LIFE_OUTCOMES, parentFarewell, type LifeDecision, type ParentReward } from './history'
import { rankedCareer, type Career } from './careers'
import {
  GAMBLE_FORMS,
  PET_LIFESPAN,
  PET_MEMORY,
  PET_TYPES,
  gambleForm,
  observationSprite,
  weaponAppearance
} from './weapon-life'

export const STRONG_MULTIPLIER = 2.5
export const GIFTED = 1.7
export const POOR = 0.55
export const SPAWN_RADIUS = 780
export const VIEW_HALF = { x: 640, y: 360 }
export const REAPER_SECONDS = 4
export const MAX_BULLETS = 140
const hasFixedInterval = (id: string) =>
  id === 'p_toxic' || id === 'w_perfume' || id === 'w_observe' || id === 'w_cooking'
/** A critical hit hits this much harder. */
export const CRIT_MULTIPLIER = 2
/**
 * ヤンキー親's raid as shares of its life: storming out until `kick`, the flying kick until `back`, then the
 * swagger home. The renderer reads the same timeline from the shot's age.
 */
export const RAID = { kick: 0.3, back: 0.46 } as const
/** How far out a raid is, as a share of its reach, after `t` (0..1) of its life; it ends back at the owner. */
export function raidReach(t: number) {
  if (t < RAID.kick) {
    const k = t / RAID.kick
    return 0.8 * k * (0.6 + 0.4 * k)
  }
  if (t < RAID.back) return 0.8 + 0.2 * Math.sin(((t - RAID.kick) / (RAID.back - RAID.kick)) * (Math.PI / 2))
  return 1 - (t - RAID.back) / (1 - RAID.back)
}
const PLAYER_RADIUS = 14
const BASE_PASSIVE_COUNT = 12
const BASE_SPEED = 135
const STEP = 1 / 60
const MAX_ENEMIES = 560
const MAX_GEMS = 320
const MAX_SHOTS = 420
const MAX_ITEMS = 36
const CELL = 80
const ELITE_FROM = 120
const ELITE_CHANCE = 0.018
const SLOWMO_SECONDS = 1.4
const SLOWMO_SCALE = 0.3
const BULLET_IFRAMES = 0.5
const BOSS_IFRAMES = 0.6
const SHIELD_RECOVERY = 1.5
const OBSERVATION_STILL_SECONDS = 2
/** Share of max HP a level-up restores. */
const LEVEL_HEAL = 0.06
/** Crowd shooters hold their fire while this many bullets are already in the air (bosses ignore it). */
const SHOOTER_BULLET_LIMIT = 40
/** Pattern cooldowns of bosses (seconds). */
const PATTERN_COOLDOWN: Record<BossPattern, number> = { ring: 3.5, spiral: 6, summon: 7, charge: 6 }

export interface Input {
  x: number
  y: number
  /** Index of the chosen level-up card, valid only for the matching choiceSeq. */
  pick: number
  pickSeq: number
}

export interface OwnedWeapon {
  id: string
  gambleWeapon?: string
  gambleUntil?: number
  acquiredAge?: number
  observationCount?: number
  lv: number
  cd: number
  /** Seconds held; investments compound with it. */
  held: number
  damage: number
}

export interface Player {
  id: string
  name: string
  color: string
  x: number
  y: number
  still: number
  fx: number
  fy: number
  hp: number
  maxHp: number
  downed: boolean
  revive: number
  joinedAt: number
  history: LifeDecision[]
  dating: boolean
  married: boolean
  hasChild: boolean
  parent: string
  parentDeath?: { at: number; x: number; y: number; reward: ParentReward }
  talents: Record<TalentCategory, number>
  weapons: OwnedWeapon[]
  passives: { id: string; lv: number }[]
  cookingBuffs?: Partial<Record<Exclude<CookingItemKind, 'food_heal'>, { time: number; power: number }>>
  choices: string[]
  choiceSeq: number
  pending: number
  parentRewardPending: number
  swapPending: number
  careerPending: number
  /** 蒸発済み's free birth hand is still waiting to be dealt (consumed by the first offer). */
  birthPick?: boolean
  hurt: number
  /** Seconds of grace after an enemy bullet hit. */
  invuln: number
  shieldGrace: number
  shieldRecovery: number
  /** Cooldown of the HURT fx and the damage gathered for it. */
  hurtFx: number
  hurtAcc: number
  /** Enemy id that dealt the final blow while downed (picks the death animation and the result text). */
  killer?: string
}

export interface Enemy {
  id: number
  kind: string
  targetPlayer?: string
  x: number
  y: number
  hp: number
  maxHp: number
  kx: number
  ky: number
  vx: number
  vy: number
  slow: number
  life: number
  flash: number
  /** A tougher variant that appeared at random. */
  elite: boolean
  /** Collision radius multiplier (elites are bigger). */
  scale: number
  /** AI state (charger: 0 approach, 1 windup, 2 dash, 3 recover; circler: 0 orbit, 1 dive; boss charge likewise). */
  mode: number
  /** Seconds left in the current mode (or until the next blink). */
  timer: number
  /** Locked target of a windup. */
  tx: number
  ty: number
  /** > 0 while telegraphing an attack. */
  windup: number
  /** > 0 while fading out before a teleport. */
  blink: number
  shotCd: number
  /** Boss pattern cooldowns, parallel to the def's patterns. */
  pcd: number[]
  /** Seconds of spiral fire left. */
  burst: number
  spin: number
}

export interface Shot {
  id: number
  owner: string
  weapon: string
  sourceWeapon: string
  kind: WeaponDef['behavior']
  x: number
  y: number
  vx: number
  vy: number
  r: number
  angle: number
  orbit: number
  spin: number
  life: number
  maxLife: number
  damage: number
  pierce: number
  tick: number
  knockback: number
  strong: Tag[]
  hits: Map<number, number>
  /** Whip half-extents (x along facing); the full radius of a nova or mine; a raid's hit radius on foot. */
  w: number
  h: number
  /** Variant for the renderer: chain link, biting, armed, pellet kind. */
  v: number
  petType?: number
  /** Seconds before the shot exists (staples fired one after another). */
  delay: number
  /** Per-behaviour scratch: elapsed time, arming time, retarget timer. */
  aux: number
  /** Every hit crits. */
  crit: boolean
  critChance: number
  strongMult: number
  /** What a pet is chasing. */
  target?: Enemy
  targets?: Enemy[]
}

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  damage: number
  life: number
  /** Index into BULLET_KINDS. */
  kind: number
  /** Enemy def id of the shooter (the killer when it downs someone). */
  src: string
}

export interface Gem {
  x: number
  y: number
  v: number
  pull: boolean
}

type CookingItemKind = (typeof COOKING_ITEMS)[number]
export type Item =
  | { kind: 'meal' | 'chest' | 'magnet'; x: number; y: number }
  | { kind: CookingItemKind; x: number; y: number; owner: string; power: number }

export interface Popup {
  x: number
  y: number
  v: number
  strong: boolean
  crit: boolean
  owner: string
  life: number
}

export interface LogEntry {
  t: number
  text: string
  to?: string
}

export interface GameState {
  time: number
  phase: 'playing' | 'reaper' | 'won' | 'lost'
  level: number
  xp: number
  xpNext: number
  kills: number
  players: Player[]
  enemies: Enemy[]
  shots: Shot[]
  bullets: Bullet[]
  gems: Gem[]
  items: Item[]
  popups: Popup[]
  log: LogEntry[]
  /** Recent events for renderer / HUD / audio, oldest first. */
  fx: FxEvent[]
  /** Real seconds of slow motion left (after a boss falls); `Game.step` slows time while it lasts. */
  slowmo: number
  eventIndex: number
  reaper?: { x: number; y: number }
  nextId: number
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const xpForLevel = (level: number) =>
  Math.round(((5 + level * 6 + level * level * 0.3) * 1.3 * (1 + Math.min(20, Math.max(0, level - 10)) * 0.0125)) / 0.8)

export const passiveLevel = (player: Player, id: string) => player.passives.find((p) => p.id === id)?.lv ?? 0
export const passivePower = (player: Player, id: string) =>
  passiveLevel(player, id) * player.talents[PASSIVE_BY_ID.get(id)!.category]
export const playerRadius = (player: Player) =>
  PLAYER_RADIUS * bodyScale(passiveLevel(player, 'p_large'), passiveLevel(player, 'p_small'))

export function generateTalents(rng: () => number): Record<TalentCategory, number> {
  const anchors = TALENT_CATEGORIES.map(() => rng())
  return Object.fromEntries(
    TALENT_CATEGORIES.map((category, index) => {
      const value = (anchors[index] * 2 + anchors[(index + 5) % 6] + anchors[(index + 1) % 6]) / 4
      return [category, POOR + value * (GIFTED - POOR)]
    })
  ) as Record<TalentCategory, number>
}
export const weaponSlots = (player: Player, age = 18) =>
  player.parent === 'p_toxic' && age < 18 ? 2 : WEAPON_SLOTS + (player.parent === 'p_free' ? 1 : 0)
const talentWeaponCount = (player: Player) => player.weapons.filter((w) => !WEAPON_BY_ID.get(w.id)?.parent).length
const canObtainWeapon = (player: Player, def: WeaponDef, age: number) =>
  age >= def.minAge && (def.id !== 'w_ring' || player.married) && !player.weapons.some((weapon) => weapon.id === def.id)

export function isEvolved(player: Player, weapon: OwnedWeapon) {
  const def = WEAPON_BY_ID.get(weapon.id)
  return Boolean(def?.evolve && weapon.lv >= MAX_WEAPON_LEVEL && passiveLevel(player, def.evolve.passive) > 0)
}

export function weaponName(player: Player, weapon: OwnedWeapon, age?: number) {
  const def = WEAPON_BY_ID.get(weapon.id)!
  const name = age === undefined ? def.name : weaponAppearance(weapon.id, age, age - (weapon.acquiredAge ?? age)).name
  return isEvolved(player, weapon) ? `${def.evolve!.name}${name === def.name ? '' : `／${name}`}` : name
}

export interface PlayerStats {
  maxHp: number
  armor: number
  regen: number
  speed: number
  magnet: number
  xpGain: number
  might: number
  cooldown: number
  area: number
  /** Chance of a critical hit. */
  crit: number
  /** Bonus weapon count from 器用. */
  amount: number
  /** Projectile speed multiplier. */
  shotSpeed: number
  /** Effect duration multiplier. */
  duration: number
  /** Damage multiplier against a card's 特攻 tags. */
  strong: number
}

export function playerStats(player: Player): PlayerStats {
  const p = (id: string) => passivePower(player, id)
  return {
    maxHp: Math.max(
      25,
      100 +
        (p('p_bold') + p('p_acceptance')) * 20 +
        p('p_large') * 15 -
        p('p_small') * 10 +
        (player.parent === 'p_gone' ? 60 : 0) +
        (player.parent === 'p_toxic' ? -10 : 0)
    ),
    armor:
      p('p_stubborn') +
      p('p_patience') +
      (player.parent === 'p_over' || player.parent === 'p_weak' ? 1 : 0) +
      2 * (player.cookingBuffs?.food_defense?.power ?? 0),
    regen:
      player.parent === 'p_toxic'
        ? 0
        : (p('p_optimist') + p('p_affection') + p(PET_MEMORY)) * 0.4 +
          p('p_kind') * 0.2 +
          (player.parent === 'p_gone' ? 1 : 0),
    speed:
      BASE_SPEED *
      (1 + p('p_healthy') * 0.08 + p('p_small') * 0.03) *
      (1 + 0.2 * (player.cookingBuffs?.food_speed?.power ?? 0)),
    magnet: 64 * (1 + p('p_greedy') * 0.25),
    xpGain: (1 + p('p_greedy') * 0.1) * (player.parent === 'p_weak' ? 1.25 : 1),
    might:
      (1 +
        (p('p_hot') + p('p_courage')) * 0.1 +
        p('p_clever') * 0.03 +
        (player.hp <= player.maxHp / 2 ? p('p_competitive') * 0.1 : 0)) *
      (player.parent === 'p_toxic' ? 1.05 : 1) *
      (1 + 0.25 * (player.cookingBuffs?.food_damage?.power ?? 0)),
    cooldown: Math.max(0.5, 1 - p('p_diligent') * 0.07 - p('p_hasty') * 0.05 + p('p_grand') * 0.1),
    area: 1 + p('p_kind') * 0.08 + p('p_cautious') * 0.05,
    crit: 0.05 + p('p_lucky') * 0.05,
    amount:
      (passiveLevel(player, 'p_clever') >= 4 ? 2 : passiveLevel(player, 'p_clever') >= 1 ? 1 : 0) +
      passiveLevel(player, 'p_grand'),
    shotSpeed: Math.max(0.5, 1 + p('p_curious') * 0.1 - p('p_cautious') * 0.05),
    duration: Math.max(0.5, 1 + p('p_curious') * 0.1 - p('p_hasty') * 0.05),
    strong: STRONG_MULTIPLIER + p('p_savvy') * 0.25
  }
}

export interface WeaponStats {
  damage: number
  cooldown: number
  amount: number
  area: number
  duration: number
  speed: number
  crit: number
  strong: number
}

/** Everything that multiplies a weapon, including the hidden talent. */
export function weaponStats(
  player: Player,
  weapon: OwnedWeapon,
  stats = playerStats(player),
  def = WEAPON_BY_ID.get(weapon.id)!
): WeaponStats {
  const source = WEAPON_BY_ID.get(weapon.id)!
  const lv = weapon.lv
  const evolved = isEvolved(player, weapon)
  const upgrades = WEAPON_LEVELS[def.id].slice(0, lv - 1)
  const sourceUpgrades = WEAPON_LEVELS[source.id].slice(0, lv - 1)
  let damage = def.damage * sourceUpgrades.reduce((value, upgrade) => value * (upgrade.damage ?? 1), 1) * stats.might
  if (source.category) damage *= player.talents[source.category]
  if (evolved) damage *= 1.6
  if (def.id === 'w_study' && player.parent === 'p_edu') damage *= 1.3
  if (def.id === 'w_invest') {
    if (player.parent === 'p_rich') damage *= 1.3
    damage *= 1 + weapon.held / 150
  }
  return {
    damage,
    cooldown: hasFixedInterval(source.id)
      ? def.cooldown
      : def.cooldown *
        sourceUpgrades.reduce((value, upgrade) => value * (upgrade.cooldown ?? 1), 1) *
        stats.cooldown *
        (evolved ? 0.8 : 1),
    amount: Math.min(
      def.id === 'p_monster' ? 2 : Infinity,
      def.behavior === 'observe' || def.behavior === 'raid' || def.id === 'p_toxic'
        ? 1
        : def.amount +
            upgrades.reduce((value, upgrade) => value + (upgrade.amount ?? 0), 0) +
            (evolved && def.id !== 'w_sports' ? 1 : 0) +
            (def.behavior === 'none' || def.behavior === 'chain' ? 0 : stats.amount)
    ),
    area: upgrades.reduce((value, upgrade) => value * (upgrade.area ?? 1), 1) * stats.area * (evolved ? 1.2 : 1),
    duration:
      def.duration *
      (1 + upgrades.reduce((value, upgrade) => value + (upgrade.duration ?? 0), 0)) *
      (evolved ? 1.3 : 1) *
      stats.duration,
    speed: stats.shotSpeed,
    crit: stats.crit,
    strong: stats.strong
  }
}

export function choiceText(
  player: Player,
  choice: string,
  age?: number
): { icon: string; name: string; text: string; tag: string } {
  if (choice === 'd:yes')
    return {
      icon: '💞',
      name: '交際する',
      text: 'パートナーと交際を始める。浮気相手や束縛するパートナーが現れる',
      tag: ''
    }
  if (choice === 'd:no') return { icon: '🌿', name: '交際しない', text: '今は一人で歩む', tag: '' }
  if (choice === 'f:yes')
    return { icon: '🧒', name: '迎える', text: '本人の回復が毎秒HP2→3。子育ての試練が加わる', tag: '' }
  if (choice === 'f:no')
    return { icon: '🤝', name: '迎えない', text: '本人の回復は毎秒HP2のまま。今の家族で歩む', tag: '' }
  const [kind, id] = choice.split(':')
  if (kind === 's' || kind === 'r') {
    const def = WEAPON_BY_ID.get(id)!
    const appearance =
      age === undefined
        ? def
        : weaponAppearance(id, age, age - (player.weapons.find((w) => w.id === id)?.acquiredAge ?? age))
    return {
      icon: appearance.icon,
      name: appearance.name,
      text: kind === 's' ? def.desc : 'この武器と入れ替える',
      tag: kind === 's' ? 'NEW' : '交換'
    }
  }
  if (choice === 'x:skip') return { icon: '↩', name: '交換しない', text: '今の武器をそのまま使う', tag: '' }
  if (kind === 'w') {
    const def = WEAPON_BY_ID.get(id)!
    const owned = player.weapons.find((w) => w.id === id)
    const appearance = age === undefined ? def : weaponAppearance(id, age, age - (owned?.acquiredAge ?? age))
    if (!owned) return { icon: appearance.icon, name: appearance.name, text: def.desc, tag: 'NEW' }
    const next = owned.lv + 1
    const evolves =
      next === MAX_WEAPON_LEVEL && def.evolve && passiveLevel(player, def.evolve.passive)
        ? `・${def.evolve.name}に進化！`
        : ''
    return {
      icon: appearance.icon,
      name: appearance.name,
      text: `${WEAPON_LEVELS[id][Math.min(next - 2, MAX_WEAPON_LEVEL - 2)].text}${evolves}`,
      tag: `Lv ${next}`
    }
  }
  if (kind === 'p') {
    const def = PASSIVE_BY_ID.get(id)!
    const lv = passiveLevel(player, id)
    return { icon: def.icon, name: def.name, text: def.desc, tag: lv ? `Lv ${lv + 1}` : '性格' }
  }
  return choice === 'x:meal'
    ? { icon: '🍙', name: 'ごはん', text: '精神力を 40 回復', tag: '' }
    : { icon: '💴', name: 'お小遣い', text: '経験値を少しもらう', tag: '' }
}

/** Chance that a chest holds three turning points instead of one. */
export const CHEST_TRIPLE = 0.2

export class Game {
  state: GameState
  private readonly rng: () => number
  private readonly feelRng: () => number
  private grid = new Map<number, Enemy[]>()
  private spawnDebt = 0
  private inputs = new Map<string, Input>()
  private familyHands = new Map<string, string[]>()
  private nightcryStarted = false
  private pendingBosses: string[] = []
  private careers = new Map<
    string,
    { studied?: boolean; employed?: boolean; path?: 'sports' | 'assets' | 'creative' | 'social'; settled?: boolean }
  >()
  private accumulator = 0
  private fxSeq = 0
  private stageIndex = -1
  private tickHits = 0
  private tickShots = 0
  private tickKills = 0

  constructor(seed = Date.now()) {
    this.rng = mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b))
    this.feelRng = mulberry32(Math.imul(seed ^ 0x243f6a88, 0x85ebca6b))
    this.state = {
      time: 0,
      phase: 'playing',
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      kills: 0,
      players: [],
      enemies: [],
      shots: [],
      bullets: [],
      gems: [],
      items: [],
      popups: [],
      log: [],
      fx: [],
      slowmo: 0,
      eventIndex: 0,
      nextId: 1
    }
  }

  random() {
    return this.rng()
  }

  /** Records an event for the renderer / HUD / audio. */
  private emit(type: number, x = 0, y = 0, a = 0, b = 0) {
    const fx = this.state.fx
    fx.push({ seq: ++this.fxSeq, t: this.state.time, type, x: Math.round(x), y: Math.round(y), a: Math.round(a), b })
    if (fx.length > FX_CAP) fx.shift()
  }

  private playerIndex(player: Player) {
    return Math.max(0, this.state.players.indexOf(player))
  }

  addPlayer(id: string, parentId?: string): Player | undefined {
    const state = this.state
    const existing = state.players.find((player) => player.id === id)
    if (existing) return existing
    if (state.players.length >= MAX_GAME_PLAYERS) return undefined
    const index = PLAYER_COLORS.findIndex((color) => !state.players.some((player) => player.color === color))
    const parent = parentId ?? PARENTS[Math.floor(this.rng() * PARENTS.length)].id
    const talents = generateTalents(this.rng)
    const anchor = state.players.find((p) => !p.downed)
    const player: Player = {
      id,
      name: `P${index + 1}`,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      x: (anchor?.x ?? 0) + (index ? Math.cos(index) * 40 : 0),
      y: (anchor?.y ?? 0) + (index ? Math.sin(index) * 40 : 0),
      still: 0,
      fx: 1,
      fy: 0,
      hp: 0,
      maxHp: 0,
      downed: false,
      revive: 0,
      joinedAt: state.time,
      history: [],
      dating: false,
      married: false,
      hasChild: false,
      parent,
      talents,
      weapons: parent === 'p_gone' ? [] : [{ id: parent, lv: 1, cd: 0.5, held: 0, damage: 0 }],
      passives: [],
      choices: [],
      choiceSeq: 0,
      pending: parent === 'p_gone' ? 1 : 0,
      parentRewardPending: 0,
      swapPending: 0,
      careerPending: 0,
      birthPick: parent === 'p_gone',
      hurt: 0,
      invuln: 0,
      shieldGrace: 0,
      shieldRecovery: 0,
      hurtFx: 0,
      hurtAcc: 0
    }
    player.maxHp = player.hp = playerStats(player).maxHp
    state.players.push(player)
    if (state.time >= EVENTS.find((event) => event.swarm === 'car')!.at) {
      this.familyHands.set(player.id, player.choices)
      player.choices = ['d:yes', 'd:no']
      player.choiceSeq++
    }
    this.careers.set(id, {})
    const parentDef = WEAPON_BY_ID.get(parent)!
    this.log(`${player.name}が生まれた。親は「${parentDef.name}」。`)
    return player
  }

  removePlayer(id: string) {
    this.state.players = this.state.players.filter((player) => player.id !== id)
    this.inputs.delete(id)
    this.familyHands.delete(id)
    this.careers.delete(id)
    this.state.shots = this.state.shots.filter((shot) => shot.owner !== id)
    this.state.items = this.state.items.filter((item) => !('owner' in item) || item.owner !== id)
  }

  setInput(id: string, raw: unknown) {
    if (!raw || typeof raw !== 'object') return
    const value = raw as Record<string, unknown>
    const num = (v: unknown, lo: number, hi: number, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
    let x = num(value.x, -1, 1, 0)
    let y = num(value.y, -1, 1, 0)
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    const pick = Number.isSafeInteger(value.pick) ? (value.pick as number) : -1
    const pickSeq = Number.isSafeInteger(value.pickSeq) ? (value.pickSeq as number) : -1
    this.inputs.set(id, { x, y, pick, pickSeq })
    const player = this.state.players.find((p) => p.id === id)
    if (
      this.state.phase === 'playing' &&
      player &&
      pick >= 0 &&
      pickSeq === player.choiceSeq &&
      pick < player.choices.length
    )
      this.choose(player, pick)
  }

  /** Solo play pauses on a level-up, like a board game turn; co-op keeps running. */
  get paused() {
    const players = this.state.players
    return (
      this.state.phase === 'playing' &&
      this.state.time < RUN_SECONDS &&
      players.length === 1 &&
      !players[0].downed &&
      players[0].choices.length > 0
    )
  }

  /** Advances by real time. Slow motion (after a boss falls) stretches it; `tick` itself is never scaled. */
  step(dt: number) {
    const state = this.state
    const scale = state.slowmo > 0 ? SLOWMO_SCALE : 1
    state.slowmo = Math.max(0, state.slowmo - dt)
    this.accumulator = Math.min(this.accumulator + dt * scale, 0.25)
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP
      this.tick(STEP)
    }
  }

  private log(text: string, to?: string) {
    this.state.log.push({ t: this.state.time, text, to })
    if (this.state.log.length > 12) this.state.log.shift()
  }

  tick(dt: number) {
    const state = this.state
    this.tickHits = 0
    this.tickShots = 0
    this.tickKills = 0
    for (const popup of state.popups) popup.life -= dt
    state.popups = state.popups.filter((popup) => popup.life > 0)
    while (state.fx.length && state.fx[0].t < state.time - FX_WINDOW) state.fx.shift()
    if (state.phase === 'won' || state.phase === 'lost' || this.paused || !state.players.length) return
    if (state.phase === 'reaper') return this.reaperTick(dt)
    state.time += dt
    this.ageWeapons()
    if (state.time >= RUN_SECONDS) return this.summonReaper()
    this.stageTick()
    this.movePlayers(dt)
    this.runEvents()
    this.spawn(dt)
    this.buildGrid()
    this.moveEnemies(dt)
    this.fireWeapons(dt)
    this.moveShots(dt)
    this.moveBullets(dt)
    for (const player of state.players) {
      if (!player.downed && player.married && player.parent !== 'p_toxic')
        player.hp = Math.min(player.maxHp, player.hp + (2 + (player.hasChild ? 1 : 0)) * dt)
    }
    this.collectGems(dt)
    this.revivePlayers(dt)
    if (state.players.every((player) => player.downed)) {
      state.phase = 'lost'
      this.log(`心が折れた… 享年${ageAt(state.time)}歳`)
    }
  }

  /** Announces each life stage once, when the age enters it. */
  private stageTick() {
    const stage = stageAt(this.state.time)
    const index = STAGES.indexOf(stage)
    if (index > this.stageIndex) {
      this.stageIndex = index
      this.emit(FX.STAGE, 0, 0, index)
    }
  }

  private summonReaper() {
    const state = this.state
    state.time = RUN_SECONDS
    state.phase = 'reaper'
    state.enemies = []
    state.shots = []
    state.bullets = []
    const anchor = state.players[0]
    state.reaper = { x: anchor.x + 420, y: anchor.y - 260 }
    this.log('死神が迎えに来た。寿命が尽きる——')
  }

  private reaperTick(dt: number) {
    const state = this.state
    state.time = Math.min(RUN_SECONDS + REAPER_SECONDS, state.time + dt)
    const target = state.players[0]
    const reaper = state.reaper!
    reaper.x += (target.x + 40 - reaper.x) * Math.min(1, dt * 1.2)
    reaper.y += (target.y - 30 - reaper.y) * Math.min(1, dt * 1.2)
    if (state.time >= RUN_SECONDS + REAPER_SECONDS) {
      state.phase = 'won'
      this.log(`大往生。享年${ageAt(RUN_SECONDS)}歳、人生をまっとうした。`)
    }
  }

  private movePlayers(dt: number) {
    for (const player of this.state.players) {
      const buffs = player.cookingBuffs
      if (buffs) {
        for (const kind of COOKING_ITEMS) {
          if (kind === 'food_heal') continue
          const buff = buffs[kind]
          if (buff && (buff.time -= dt) <= 1e-9) delete buffs[kind]
        }
        if (!buffs.food_damage && !buffs.food_defense && !buffs.food_speed) delete player.cookingBuffs
      }
      const stats = playerStats(player)
      player.maxHp = stats.maxHp
      player.hurt = Math.max(0, player.hurt - dt)
      player.invuln = Math.max(0, player.invuln - dt)
      player.shieldGrace = Math.max(0, player.shieldGrace - dt)
      player.shieldRecovery = Math.max(0, player.shieldRecovery - dt)
      player.hurtFx = Math.max(0, player.hurtFx - dt)
      if (player.downed) {
        player.still = 0
        continue
      }
      const input = this.inputs.get(player.id) ?? { x: 0, y: 0, pick: -1, pickSeq: -1 }
      player.still = input.x || input.y ? 0 : player.still + dt
      // Level-up choices slow you down in co-op so picking is not a death sentence.
      const speed = stats.speed * (player.choices.length ? 0.6 : 1)
      player.x += input.x * speed * dt
      player.y += input.y * speed * dt
      if (input.x || input.y) {
        const l = Math.hypot(input.x, input.y)
        player.fx = input.x / l
        player.fy = input.y / l
      }
      player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt)
      const kind = passivePower(player, 'p_kind')
      if (kind)
        for (const friend of this.state.players)
          if (
            friend !== player &&
            !friend.downed &&
            friend.parent !== 'p_toxic' &&
            Math.hypot(friend.x - player.x, friend.y - player.y) < 140
          )
            friend.hp = Math.min(friend.maxHp, friend.hp + kind * 0.5 * dt)
      if (
        !player.choices.length &&
        (player.pending > 0 || player.parentRewardPending > 0 || player.swapPending > 0 || player.careerPending > 0)
      )
        this.offer(player)
    }
  }

  private runEvents() {
    const state = this.state
    this.pendingBosses = this.pendingBosses.filter((kind) => !this.spawnEnemy(kind))
    while (state.eventIndex < EVENTS.length && state.time >= EVENTS[state.eventIndex].at) {
      const index = state.eventIndex++
      const event = EVENTS[index]
      if (event.boss === 'b_univ' || event.boss === 'b_shukatsu' || event.boss === 'b_layoff') {
        for (const player of state.players) {
          if (player.joinedAt >= event.at) continue
          const career = this.careers.get(player.id)!
          const level = (id: string) => player.weapons.find((weapon) => weapon.id === id)?.lv ?? 0
          const sports = Math.max(level('w_sports'), level('w_muscle'))
          const assets = Math.max(level('w_invest'), level('w_savings'))
          const creative = Math.max(level('w_hobby'), level('w_karaoke'), level('w_travel'), level('w_cooking'))
          const social = Math.max(level('w_friend'), level('w_sns'), level('w_pet'))
          let reward = 0
          let text: string
          if (event.boss === 'b_univ') {
            if (career.studied !== undefined) continue
            career.studied = level('w_study') >= 3
            reward = career.studied ? 1 : 0
            text = LIFE_OUTCOMES.b_univ[career.studied ? 0 : 1]
          } else if (event.boss === 'b_shukatsu') {
            if (career.employed !== undefined) continue
            const work = level('w_work') >= 2
            const eligible: Career[] = []
            if (work) eligible.push('bureaucrat')
            if (sports >= 4) eligible.push('soccer')
            if (assets >= 4) eligible.push('entrepreneur')
            if (creative >= 4) eligible.push('creative')
            if (social >= 4) eligible.push('social')
            const selected =
              rankedCareer(
                player.weapons.map(({ id, lv }) => [id, lv]),
                player.passives.map(({ id, lv }) => [id, lv]),
                eligible
              ) ?? (work ? 'bureaucrat' : undefined)
            career.employed = selected === 'bureaucrat'
            reward = career.employed ? (career.studied ? 2 : 1) : 0
            text = LIFE_OUTCOMES.b_shukatsu[career.employed ? (career.studied ? 0 : 1) : 2]
            if (
              selected === 'soccer' ||
              selected === 'entrepreneur' ||
              selected === 'creative' ||
              selected === 'social'
            ) {
              career.path = selected === 'soccer' ? 'sports' : selected === 'entrepreneur' ? 'assets' : selected
              reward = 1
              text =
                LIFE_OUTCOMES.b_shukatsu[
                  career.path === 'sports' ? 3 : career.path === 'assets' ? 4 : career.path === 'creative' ? 5 : 6
                ]
            }
          } else {
            if (career.settled !== undefined) continue
            career.settled = true
            reward = career.employed ? (level('w_work') >= 4 ? 2 : 1) : 0
            text = LIFE_OUTCOMES.b_layoff[reward === 2 ? 0 : reward === 1 ? 1 : 2]
            if (career.path) {
              reward =
                (career.path === 'sports'
                  ? sports
                  : career.path === 'assets'
                    ? assets
                    : career.path === 'creative'
                      ? creative
                      : social) >= 4
                  ? 2
                  : 1
              text =
                LIFE_OUTCOMES.b_layoff[
                  (career.path === 'sports' ? 3 : career.path === 'assets' ? 5 : career.path === 'creative' ? 7 : 15) +
                    (reward === 2 ? 0 : 1)
                ]
            }
            const eligible: Career[] = []
            if (level('w_work') >= 4) eligible.push('bureaucrat')
            if (sports >= 4) eligible.push('soccer')
            if (assets >= 4) eligible.push('entrepreneur')
            if (creative >= 4) eligible.push('creative')
            if (social >= 4) eligible.push('social')
            const selected = rankedCareer(
              player.weapons.map(({ id, lv }) => [id, lv]),
              player.passives.map(({ id, lv }) => [id, lv]),
              eligible
            )
            const previous = career.employed
              ? 'bureaucrat'
              : career.path === 'sports'
                ? 'soccer'
                : career.path === 'assets'
                  ? 'entrepreneur'
                  : career.path
            if (selected && selected !== previous) {
              reward = 2
              const outcome =
                selected === 'bureaucrat'
                  ? previous
                    ? 14
                    : career.employed === false
                      ? 13
                      : 9
                  : selected === 'social'
                    ? 17
                    : 9 + ['bureaucrat', 'soccer', 'entrepreneur', 'creative'].indexOf(selected)
              text = LIFE_OUTCOMES.b_layoff[outcome]
            }
          }
          player.careerPending += reward
          player.history.push({ event: index, outcome: text })
          this.log(text, player.id)
        }
      }
      const wedding = event.boss === 'b_wedding'
      if (event.swarm === 'car') {
        for (const player of state.players) {
          if (player.joinedAt >= event.at) continue
          this.familyHands.set(player.id, player.choices)
          player.choices = ['d:yes', 'd:no']
          player.choiceSeq++
        }
      }
      const birth = event.swarm === 'nightcry'
      const childEvent = birth || event.boss === 'b_rebel' || event.swarm === 'mischief'
      if (wedding || birth) {
        for (const player of state.players) {
          if (player.joinedAt >= event.at) continue
          if (player.history.some((decision) => decision.event === index)) continue
          if (wedding) {
            if (player.choices[0] === 'd:yes') {
              player.choices = this.familyHands.get(player.id) ?? []
              this.familyHands.delete(player.id)
              player.choiceSeq++
            }
            player.married = player.weapons.some((weapon) => weapon.id === 'w_love' && weapon.lv >= 2)
            this.log(LIFE_OUTCOMES.b_wedding[player.married ? 0 : 1], player.id)
          } else if (player.married) {
            this.familyHands.set(player.id, player.choices)
            player.choices = ['f:yes', 'f:no']
            player.choiceSeq++
            player.history.push({ event: index, outcome: LIFE_OUTCOMES.nightcry[3] })
            continue
          }
          const outcome = wedding ? LIFE_OUTCOMES.b_wedding[player.married ? 0 : 1] : LIFE_OUTCOMES.nightcry[2]
          player.history.push({ event: index, outcome })
        }
      }
      if (birth) continue
      if (event.boss === 'b_layoff' || event.swarm === 'endless_meeting') {
        const employed = state.players.filter(
          (player) =>
            this.careers.get(player.id)?.employed && (event.swarm !== 'endless_meeting' || player.joinedAt < event.at)
        )
        if (!employed.length) continue
        this.log(`${employed.map((player) => player.name).join('・')}の仕事の試練：${event.text}`)
      } else if (event.boss === 'b_care') {
        const families = state.players.filter((player) => player.joinedAt < event.at && player.parent !== 'p_gone')
        if (!families.length) continue
        this.log(`${families.map((player) => player.name).join('・')}の家族の試練：${event.text}`)
        for (const player of families) this.loseParent(player, index)
      } else if (wedding || childEvent) {
        const families = state.players.filter((player) => (wedding ? player.married : player.hasChild))
        if (!families.length) continue
        this.log(`${families.map((player) => player.name).join('・')}の家族の試練：${event.text}`)
      } else this.log(event.text)
      if (event.boss && !this.spawnEnemy(event.boss)) this.pendingBosses.push(event.boss)
      if (event.swarm) this.spawnSwarm(index)
    }
  }

  private spawnSwarm(index: number, anchor = this.randomAlive()) {
    const event = EVENTS[index]
    if (event.swarm && anchor) {
      const count = Math.round((event.count ?? 20) * this.playerFactor())
      this.emit(FX.SWARM, anchor.x, anchor.y, index)
      const formation = event.formation ?? 'ring'
      const side = this.rng() * Math.PI * 2
      const px = -Math.sin(side)
      const py = Math.cos(side)
      const cx = anchor.x + Math.cos(side) * SPAWN_RADIUS
      const cy = anchor.y + Math.sin(side) * SPAWN_RADIUS
      const spacing = Math.min(34, 1500 / count)
      const clump = 36 + count * 2.2
      for (let i = 0; i < count; i++) {
        if (formation === 'wall') {
          const offset = (i - (count - 1) / 2) * spacing
          this.spawnEnemy(event.swarm, cx + px * offset, cy + py * offset)
        } else if (formation === 'cluster') {
          const angle = this.rng() * Math.PI * 2
          const radius = Math.sqrt(this.rng()) * clump
          this.spawnEnemy(event.swarm, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
        } else {
          const angle = (i / count) * Math.PI * 2
          this.spawnEnemy(
            event.swarm,
            anchor.x + Math.cos(angle) * SPAWN_RADIUS,
            anchor.y + Math.sin(angle) * SPAWN_RADIUS
          )
        }
      }
    }
  }

  playerFactor() {
    return 1 + (this.state.players.length - 1) * 0.6
  }

  hpScale() {
    const progress = this.state.time / RUN_SECONDS
    const minutes = progress * 30
    return (
      (1 + minutes * 0.14 + minutes * minutes * 0.004) *
      (1 + 0.2 * progress ** 2) *
      (1 + (this.state.players.length - 1) * 0.45)
    )
  }

  targetPopulation() {
    const progress = this.state.time / RUN_SECONDS
    return Math.min(MAX_ENEMIES, Math.round((14 + progress * 300) * this.playerFactor()))
  }

  private randomAlive() {
    const alive = this.state.players.filter((player) => !player.downed)
    return alive[Math.floor(this.rng() * alive.length)]
  }

  private spawn(dt: number) {
    const state = this.state
    const deficit = this.targetPopulation() - state.enemies.length
    if (deficit <= 0) return
    this.spawnDebt += Math.min(deficit, 6 + state.time / 30) * dt * 2
    const age = ageAt(state.time)
    const pool = POOLS.find((entry) => age < entry.untilAge)!.enemies.filter(
      ([id]) =>
        (ENEMY_BY_ID.get(id)!.tag !== 'child' || state.players.some((player) => player.hasChild)) &&
        (!isRelationshipEnemy(id) ||
          state.players.some((player) => !player.downed && (player.dating || player.married)))
    )
    const total = pool.reduce((sum, [, weight]) => sum + weight, 0)
    while (this.spawnDebt >= 1) {
      this.spawnDebt--
      let roll = this.rng() * total
      let kind = pool[0][0]
      for (const [id, weight] of pool) {
        roll -= weight
        if (roll <= 0) {
          kind = id
          break
        }
      }
      const def = ENEMY_BY_ID.get(kind)!
      if (def.behavior === 'swarm') {
        // Swarmers come in clumps of five to eight from one direction.
        const anchor = this.randomAlive()
        if (!anchor) return
        const count = 5 + Math.floor(this.rng() * 4)
        const side = this.rng() * Math.PI * 2
        for (let i = 0; i < count; i++) {
          const angle = this.rng() * Math.PI * 2
          const radius = Math.sqrt(this.rng()) * 60
          this.spawnEnemy(
            kind,
            anchor.x + Math.cos(side) * SPAWN_RADIUS + Math.cos(angle) * radius,
            anchor.y + Math.sin(side) * SPAWN_RADIUS + Math.sin(angle) * radius
          )
        }
        this.spawnDebt -= count - 1
        continue
      }
      const elite = state.time >= ELITE_FROM && def.behavior !== 'dash' && this.rng() < ELITE_CHANCE
      this.spawnEnemy(kind, undefined, undefined, { elite })
    }
  }

  spawnEnemy(kind: string, x?: number, y?: number, options: { elite?: boolean } = {}) {
    const state = this.state
    const def = ENEMY_BY_ID.get(kind)
    if (!def) return
    const eligible = isRelationshipEnemy(kind) ? state.players.filter((p) => !p.downed && (p.dating || p.married)) : []
    const anchor = isRelationshipEnemy(kind) ? eligible[Math.floor(this.rng() * eligible.length)] : this.randomAlive()
    if (!anchor) return
    if (state.enemies.length >= MAX_ENEMIES + 20) {
      if (def.behavior !== 'boss') return
      const index = state.enemies.findIndex((enemy) => ENEMY_BY_ID.get(enemy.kind)!.behavior !== 'boss')
      if (index < 0) return
      const [retired] = state.enemies.splice(index, 1)
      retired.hp = 0
      for (const shot of state.shots) if (shot.target === retired) shot.target = undefined
    }
    if (x === undefined || y === undefined) {
      const angle = this.rng() * Math.PI * 2
      x = anchor.x + Math.cos(angle) * SPAWN_RADIUS
      y = anchor.y + Math.sin(angle) * SPAWN_RADIUS
    }
    const elite = Boolean(options.elite) && def.behavior !== 'boss'
    const hp =
      def.behavior === 'boss'
        ? def.hp * (1 + (state.players.length - 1) * 0.6)
        : def.hp * this.hpScale() * (elite ? 5 : 1)
    let vx = 0
    let vy = 0
    if (def.behavior === 'dash') {
      const l = Math.hypot(anchor.x - x, anchor.y - y) || 1
      vx = ((anchor.x - x) / l) * def.speed
      vy = ((anchor.y - y) / l) * def.speed
    }
    const enemy: Enemy = {
      id: state.nextId++,
      kind,
      ...(isRelationshipEnemy(kind) ? { targetPlayer: anchor.id } : {}),
      x,
      y,
      hp,
      maxHp: hp,
      kx: 0,
      ky: 0,
      vx,
      vy,
      slow: 0,
      life: 0,
      flash: 0,
      elite,
      scale: elite ? 1.25 : 1,
      mode: 0,
      timer: 0,
      tx: 0,
      ty: 0,
      windup: 0,
      blink: 0,
      shotCd: 0,
      pcd: [],
      burst: 0,
      spin: 0
    }
    if (def.shot) enemy.shotCd = 0.6 + this.rng() * def.shot.cooldown
    if (def.behavior === 'blink') enemy.timer = 1.5 + this.rng() * 1.5
    if (def.behavior === 'circler') enemy.timer = 2 + this.rng()
    if (def.behavior === 'boss') enemy.pcd = (def.patterns ?? []).map((_, i) => 2 + i * 2.5)
    state.enemies.push(enemy)
    if (def.behavior === 'boss') this.emit(FX.BOSS_SPAWN, x, y, ENEMY_INDEX.get(kind)!)
    if (elite) {
      this.emit(FX.ELITE, x, y, ENEMY_INDEX.get(kind)!)
      this.log(`手ごわい「${def.name}」が現れた！`)
    }
    return enemy
  }

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768)
  }

  private buildGrid() {
    this.grid.clear()
    for (const enemy of this.state.enemies) {
      const k = this.key(Math.floor(enemy.x / CELL), Math.floor(enemy.y / CELL))
      const cell = this.grid.get(k)
      if (cell) cell.push(enemy)
      else this.grid.set(k, [enemy])
    }
  }

  /** Enemies whose cell overlaps the circle; callers do the exact test. */
  private near(x: number, y: number, r: number, visit: (enemy: Enemy) => boolean | void) {
    const x0 = Math.floor((x - r - 50) / CELL)
    const x1 = Math.floor((x + r + 50) / CELL)
    const y0 = Math.floor((y - r - 50) / CELL)
    const y1 = Math.floor((y + r + 50) / CELL)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.grid.get(this.key(cx, cy))
        if (cell) for (const enemy of cell) if (enemy.hp > 0 && visit(enemy) === false) return
      }
  }

  private nearestPlayer(x: number, y: number) {
    let best: Player | undefined
    let distance = Infinity
    for (const player of this.state.players) {
      if (player.downed) continue
      const d = (player.x - x) ** 2 + (player.y - y) ** 2
      if (d < distance) {
        distance = d
        best = player
      }
    }
    return best ? { player: best, distance: Math.sqrt(distance) } : undefined
  }

  /** Nearest living enemy to a point within `range`, skipping the given ids. */
  private nearestEnemy(x: number, y: number, range: number, skip?: Set<number>) {
    let best: Enemy | undefined
    let distance = range * range
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0 || skip?.has(enemy.id)) continue
      const d = (enemy.x - x) ** 2 + (enemy.y - y) ** 2
      if (d <= distance) {
        distance = d
        best = enemy
      }
    }
    return best
  }

  /** How much of a knockback this enemy feels. */
  private knockScale(enemy: Enemy, def: EnemyDef) {
    if (def.behavior === 'boss') return 0
    return (def.behavior === 'tank' ? 0.15 : 1) * (enemy.elite ? 0.3 : 1)
  }

  private moveEnemies(dt: number) {
    const state = this.state
    const list = state.enemies
    const count = list.length
    const remaining: Enemy[] = []
    for (let i = 0; i < count; i++) {
      const enemy = list[i]
      if (enemy.hp <= 0) continue
      const def = ENEMY_BY_ID.get(enemy.kind)!
      enemy.life += dt
      enemy.flash = Math.max(0, enemy.flash - dt)
      enemy.slow = Math.max(0, enemy.slow - dt)
      const owner = isRelationshipEnemy(enemy.kind) ? state.players.find((p) => p.id === enemy.targetPlayer) : undefined
      if (isRelationshipEnemy(enemy.kind) && (!owner || owner.downed || (!owner.dating && !owner.married))) {
        enemy.hp = 0
        for (const shot of state.shots) if (shot.target === enemy) shot.target = undefined
        continue
      }
      const target = owner
        ? { player: owner, distance: Math.hypot(owner.x - enemy.x, owner.y - enemy.y) }
        : this.nearestPlayer(enemy.x, enemy.y)
      if (!target) {
        remaining.push(enemy)
        continue
      }
      const radius = def.radius * enemy.scale
      // Life speeds up as you age.
      const speed = def.speed * (enemy.slow > 0 ? 0.45 : 1) * (1 + (state.time / RUN_SECONDS) * 0.35)
      const l = target.distance || 1
      const ux = (target.player.x - enemy.x) / l
      const uy = (target.player.y - enemy.y) / l
      // Velocity this tick; behaviours below fill it in.
      let mx = ux * speed
      let my = uy * speed
      let separate = true
      switch (def.behavior) {
        case 'dash':
          if (enemy.life > 5) continue
          mx = enemy.vx
          my = enemy.vy
          separate = false
          break
        case 'swarm': {
          const weave = Math.sin(enemy.life * 4 + enemy.id * 1.7) * 0.9
          mx = (ux - uy * weave) * speed
          my = (uy + ux * weave) * speed
          break
        }
        case 'charger': {
          const burst = this.chargeAi(enemy, def, target, ux, uy, def.dash ?? 340, 0.7, 0.6, 0.8, 220, dt)
          mx = burst.x
          my = burst.y
          separate = burst.separate
          break
        }
        case 'shooter': {
          const spec = def.shot!
          if (l > 300) {
            mx = ux * speed
            my = uy * speed
          } else if (l < 210) {
            mx = -ux * speed * 0.8
            my = -uy * speed * 0.8
          } else {
            const sign = enemy.id % 2 ? 1 : -1
            mx = -uy * sign * speed * 0.7
            my = ux * sign * speed * 0.7
          }
          enemy.shotCd -= dt
          if (enemy.shotCd <= 0 && l < 500 && state.bullets.length < SHOOTER_BULLET_LIMIT) {
            enemy.shotCd = spec.cooldown * (0.9 + this.rng() * 0.2)
            this.shoot(enemy, def, target.player)
          }
          break
        }
        case 'circler':
          if (enemy.mode === 0) {
            if (l > 320) {
              mx = ux * speed
              my = uy * speed
            } else {
              const sign = enemy.id % 2 ? 1 : -1
              const radial = Math.max(-1, Math.min(1, (l - 180) / 120))
              mx = (-uy * sign * 1.2 + ux * radial) * speed
              my = (ux * sign * 1.2 + uy * radial) * speed
              enemy.timer -= dt
              if (enemy.timer <= 0) {
                enemy.mode = 1
                enemy.timer = 0.9
                enemy.vx = ux * speed * 3.2
                enemy.vy = uy * speed * 3.2
              }
            }
          } else {
            mx = enemy.vx
            my = enemy.vy
            separate = false
            enemy.timer -= dt
            if (enemy.timer <= 0) {
              enemy.mode = 0
              enemy.timer = 2 + this.rng()
            }
          }
          break
        case 'blink':
          if (enemy.blink > 0) {
            mx = 0
            my = 0
            enemy.blink -= dt
            if (enemy.blink <= 0) {
              enemy.blink = 0
              const angle = this.rng() * Math.PI * 2
              enemy.x = target.player.x + Math.cos(angle) * 120
              enemy.y = target.player.y + Math.sin(angle) * 120
              enemy.timer = 2.6 + this.rng() * 0.8
            }
          } else {
            enemy.timer -= dt
            if (enemy.timer <= 0) enemy.blink = 0.35
          }
          break
        case 'ghost': {
          const wave = Math.sin(enemy.life * 1.5 + enemy.id) * 0.9
          mx = (ux - uy * wave) * speed
          my = (uy + ux * wave) * speed
          separate = false
          break
        }
        case 'boss': {
          const move = this.bossAi(enemy, def, target, ux, uy, speed, dt)
          mx = move.x
          my = move.y
          separate = move.separate
          break
        }
        default:
      }
      enemy.x += mx * dt
      enemy.y += my * dt
      if (separate)
        // Light separation so crowds read as a crowd, not a single blob.
        this.near(enemy.x, enemy.y, radius, (other) => {
          if (other === enemy) return
          const ox = enemy.x - other.x
          const oy = enemy.y - other.y
          const min = radius + ENEMY_BY_ID.get(other.kind)!.radius * other.scale * 0.8
          const d2 = ox * ox + oy * oy
          if (d2 > 0.01 && d2 < min * min) {
            const d = Math.sqrt(d2)
            const push = Math.min(((min - d) / d) * 0.35, 3)
            enemy.x += ox * push
            enemy.y += oy * push
          }
        })
      // Too far from everyone: re-enter from the edge instead of trailing forever.
      if (def.behavior !== 'dash' && def.behavior !== 'boss' && target.distance > SPAWN_RADIUS * 1.45) {
        const angle = this.rng() * Math.PI * 2
        enemy.x = target.player.x + Math.cos(angle) * SPAWN_RADIUS
        enemy.y = target.player.y + Math.sin(angle) * SPAWN_RADIUS
      }
      enemy.x += enemy.kx * dt
      enemy.y += enemy.ky * dt
      enemy.kx *= Math.exp(-dt * 8)
      enemy.ky *= Math.exp(-dt * 8)
      for (const player of state.players) {
        if (isRelationshipEnemy(enemy.kind) && player.id !== enemy.targetPlayer) continue
        if (player.downed) continue
        const reach = radius + playerRadius(player)
        if ((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2 >= reach * reach) continue
        if (enemy.mode === 2 && (def.behavior === 'charger' || def.behavior === 'boss')) {
          // A charge lands as one blow (then the attacker is spent), not as a grinding touch.
          if (player.invuln > 0) continue
          const armor = playerStats(player).armor
          this.damagePlayer(
            player,
            Math.max(def.damage * 0.25, def.damage * 0.8 - armor) * (enemy.elite ? 1.5 : 1),
            def.id
          )
          player.invuln = BULLET_IFRAMES
          enemy.mode = 3
          enemy.timer = 0.8
        } else if (def.behavior === 'boss') {
          // A life event hits in blows with a moment's grace between, so one clumsy touch is not the end.
          if (player.invuln > 0) continue
          const armor = playerStats(player).armor
          this.damagePlayer(player, Math.max(def.damage * 0.2, def.damage * 0.6 - armor), def.id)
          if (player.invuln <= 0) player.invuln = BOSS_IFRAMES
        } else this.hurt(player, def, dt, enemy.elite ? 1.5 : 1)
      }
      remaining.push(enemy)
    }
    // Anything born during the pass (summons) joins next tick.
    for (let i = count; i < list.length; i++) remaining.push(list[i])
    state.enemies = remaining
  }

  /**
   * Approach, telegraph, dash at the spot locked at the start of the telegraph, recover.
   * Used by chargers and by bosses' `charge` pattern (which enters through mode 1).
   */
  private chargeAi(
    enemy: Enemy,
    def: EnemyDef,
    target: { player: Player; distance: number },
    ux: number,
    uy: number,
    dash: number,
    windup: number,
    dashTime: number,
    recover: number,
    range: number,
    dt: number
  ) {
    let x = 0
    let y = 0
    let separate = true
    const speed = def.speed * (enemy.slow > 0 ? 0.45 : 1) * (1 + (this.state.time / RUN_SECONDS) * 0.35)
    if (enemy.mode === 0) {
      if (target.distance <= range && def.behavior === 'charger') this.beginWindup(enemy, def, target.player, windup)
      else {
        x = ux * speed
        y = uy * speed
      }
    } else if (enemy.mode === 1) {
      enemy.timer -= dt
      enemy.windup = Math.max(0, enemy.timer)
      if (enemy.timer <= 0) {
        enemy.mode = 2
        enemy.timer = dashTime
        enemy.windup = 0
        const dx = enemy.tx - enemy.x
        const dy = enemy.ty - enemy.y
        const l = Math.hypot(dx, dy)
        const dirx = l > 1 ? dx / l : ux
        const diry = l > 1 ? dy / l : uy
        enemy.vx = dirx * dash
        enemy.vy = diry * dash
      }
    } else if (enemy.mode === 2) {
      x = enemy.vx
      y = enemy.vy
      separate = false
      enemy.timer -= dt
      if (enemy.timer <= 0) {
        enemy.mode = 3
        enemy.timer = recover
      }
    } else {
      enemy.timer -= dt
      if (enemy.timer <= 0) enemy.mode = 0
    }
    return { x, y, separate }
  }

  private beginWindup(enemy: Enemy, def: EnemyDef, player: Player, windup: number) {
    enemy.mode = 1
    enemy.timer = windup
    enemy.windup = windup
    enemy.tx = player.x
    enemy.ty = player.y
    this.emit(FX.WINDUP, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
  }

  /** Boss movement plus its attack patterns. */
  private bossAi(
    enemy: Enemy,
    def: EnemyDef,
    target: { player: Player; distance: number },
    ux: number,
    uy: number,
    speed: number,
    dt: number
  ) {
    const patterns = def.patterns ?? []
    for (let i = 0; i < enemy.pcd.length; i++) enemy.pcd[i] -= dt
    if (enemy.burst > 0) this.spiralFire(enemy, def, dt)
    if (enemy.mode === 0 && enemy.burst <= 0 && target.distance < 640) {
      for (let i = 0; i < patterns.length; i++) {
        if (enemy.pcd[i] > 0) continue
        enemy.pcd[i] = PATTERN_COOLDOWN[patterns[i]]
        this.startPattern(enemy, def, patterns[i], target.player)
        break
      }
    }
    if (enemy.mode === 0) return { x: ux * speed, y: uy * speed, separate: true }
    return this.chargeAi(enemy, def, target, ux, uy, def.dash ?? 380, 0.9, 0.55, 0.8, 0, dt)
  }

  private startPattern(enemy: Enemy, def: EnemyDef, pattern: BossPattern, player: Player) {
    const bullet = BULLET_INDEX.get(def.id) ?? 0
    const damage = Math.max(4, Math.round(def.damage * 0.3))
    if (pattern === 'ring') {
      const count = 10 + Math.min(6, Math.floor(def.hp / 6000))
      const offset = this.rng() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        const angle = offset + (i / count) * Math.PI * 2
        this.addBullet(enemy.x, enemy.y, angle, 150, 8, damage, bullet, def.id)
      }
      this.emit(FX.ENEMY_SHOT, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
    } else if (pattern === 'spiral') {
      enemy.burst = 2
      enemy.shotCd = 0
      enemy.spin = this.rng() * Math.PI * 2
    } else if (pattern === 'summon') {
      const count = 4 + (def.hp > 20000 ? 2 : def.hp > 5000 ? 1 : 0)
      const alive = this.state.enemies.reduce((n, e) => n + (e.kind === def.minion ? 1 : 0), 0)
      if (def.minion && alive < 12 && this.state.enemies.length + count < MAX_ENEMIES)
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + this.rng() * 0.4
          this.spawnEnemy(
            def.minion,
            enemy.x + Math.cos(angle) * (def.radius + 50),
            enemy.y + Math.sin(angle) * (def.radius + 50)
          )
        }
      this.emit(FX.ENEMY_SHOT, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
    } else this.beginWindup(enemy, def, player, 0.9)
  }

  private spiralFire(enemy: Enemy, def: EnemyDef, dt: number) {
    enemy.burst -= dt
    enemy.shotCd -= dt
    const bullet = BULLET_INDEX.get(def.id) ?? 0
    const damage = Math.max(4, Math.round(def.damage * 0.3))
    while (enemy.shotCd <= 0 && enemy.burst > -0.1) {
      enemy.shotCd += 0.12
      enemy.spin += 0.5
      this.addBullet(enemy.x, enemy.y, enemy.spin, 170, 8, damage, bullet, def.id)
      this.addBullet(enemy.x, enemy.y, enemy.spin + Math.PI, 170, 8, damage, bullet, def.id)
    }
  }

  private addBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    r: number,
    damage: number,
    kind: number,
    src: string
  ) {
    if (this.state.bullets.length >= MAX_BULLETS) return
    this.state.bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      damage,
      life: 3.6,
      kind,
      src
    })
  }

  /** A shooter's volley at a player. */
  private shoot(enemy: Enemy, def: EnemyDef, player: Player) {
    const spec = def.shot!
    const kind = BULLET_INDEX.get(spec.bullet) ?? 0
    const count = spec.count ?? 1
    const damage = spec.damage * (enemy.elite ? 1.5 : 1)
    const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x)
    if (spec.ring) {
      const offset = this.rng() * Math.PI * 2
      for (let i = 0; i < count; i++)
        this.addBullet(enemy.x, enemy.y, offset + (i / count) * Math.PI * 2, spec.speed, 7, damage, kind, def.id)
    } else
      for (let i = 0; i < count; i++) {
        const angle = aim + (count > 1 ? (i / (count - 1) - 0.5) * (spec.spread ?? 0.5) : 0)
        this.addBullet(enemy.x, enemy.y, angle, spec.speed, 7, damage, kind, def.id)
      }
    if (this.tickShots++ < 3) this.emit(FX.ENEMY_SHOT, enemy.x, enemy.y, ENEMY_INDEX.get(def.id)!)
  }

  private moveBullets(dt: number) {
    const state = this.state
    if (!state.bullets.length) return
    const alive = state.players.filter((player) => !player.downed)
    const blockers = state.shots.filter(
      (shot) => (shot.sourceWeapon === 'w_friend' || shot.sourceWeapon === 'w_pet') && shot.delay <= 0
    )
    const kept: Bullet[] = []
    for (const bullet of state.bullets) {
      bullet.life -= dt
      if (bullet.life <= 0) continue
      bullet.x += bullet.vx * dt
      bullet.y += bullet.vy * dt
      if (
        blockers.some((shot) => {
          const reach = shot.r + bullet.r
          return (shot.x - bullet.x) ** 2 + (shot.y - bullet.y) ** 2 <= reach * reach
        })
      )
        continue
      let spent = false
      for (const player of alive) {
        if (player.invuln > 0) continue
        const reach = bullet.r + playerRadius(player) - 3
        if ((player.x - bullet.x) ** 2 + (player.y - bullet.y) ** 2 < reach * reach) {
          const armor = playerStats(player).armor
          this.damagePlayer(player, Math.max(bullet.damage * 0.25, bullet.damage - armor), bullet.src)
          player.invuln = BULLET_IFRAMES
          spent = true
          break
        }
      }
      if (!spent) kept.push(bullet)
    }
    state.bullets = kept
  }

  /** Contact damage, applied continuously while touching. */
  private hurt(player: Player, def: EnemyDef, dt: number, mult = 1) {
    const armor = playerStats(player).armor
    this.damagePlayer(player, Math.max(def.damage * 0.25, def.damage - armor) * dt * 2.2 * mult, def.id)
  }

  private damagePlayer(player: Player, amount: number, killer: string) {
    if (player.shieldGrace > 0) return
    if (player.parent === 'p_over' && player.shieldRecovery <= 0) {
      const shield = this.state.shots.find(
        (shot) =>
          shot.owner === player.id && shot.weapon === 'p_over' && shot.life > 0 && shot.delay <= 0 && shot.v === 0
      )
      if (shield) {
        shield.v = 1
        player.invuln = BULLET_IFRAMES
        player.shieldGrace = BULLET_IFRAMES
        player.shieldRecovery = SHIELD_RECOVERY
        return
      }
    }
    player.hp -= amount
    player.hurt = 0.2
    player.hurtAcc += amount
    if (player.hurtFx <= 0) {
      player.hurtFx = 0.25
      this.emit(FX.HURT, player.x, player.y, this.playerIndex(player), Math.max(1, Math.round(player.hurtAcc)))
      player.hurtAcc = 0
    }
    if (player.hp <= 0) {
      player.hp = 0
      player.downed = true
      player.revive = 0
      player.killer = killer
      this.emit(FX.DOWN, player.x, player.y, this.playerIndex(player))
      this.log(`${player.name}の心が折れた…（仲間がそばにいると立ち直る）`)
    }
  }

  private revivePlayers(dt: number) {
    for (const player of this.state.players) {
      if (!player.downed) continue
      const helper = this.state.players.some(
        (other) => !other.downed && Math.hypot(other.x - player.x, other.y - player.y) < 70
      )
      player.revive = helper ? player.revive + dt / 3 : Math.max(0, player.revive - dt / 6)
      if (player.revive >= 1) {
        player.downed = false
        player.revive = 0
        player.killer = undefined
        player.hp = player.maxHp * 0.5
        player.hurtAcc = 0
        this.emit(FX.REVIVE, player.x, player.y, this.playerIndex(player))
        this.log(`${player.name}が立ち直った！`)
      }
    }
  }

  private fireWeapons(dt: number) {
    for (const player of this.state.players) {
      if (player.downed) continue
      const stats = playerStats(player)
      for (const weapon of player.weapons) {
        if (weapon.id === 'w_cooking' && weapon.held === 0) weapon.cd = WEAPON_BY_ID.get(weapon.id)!.cooldown
        weapon.held += dt
        if (
          weapon.id === 'w_travel' &&
          this.state.shots.some((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id)
        )
          continue
        weapon.cd -= dt
        if (weapon.id === 'p_toxic') {
          const aura = this.state.shots.find((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id)
          if (aura) {
            const ws = weaponStats(player, weapon, stats)
            aura.r = WEAPON_BY_ID.get(weapon.id)!.area * ws.area
            aura.damage = ws.damage
            aura.critChance = ws.crit
            aura.strongMult = ws.strong
            continue
          }
        }
        if (
          weapon.id === 'w_observe' &&
          (player.still < OBSERVATION_STILL_SECONDS ||
            this.state.shots.some((shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id))
        )
          continue
        if (weapon.cd > (weapon.id === 'w_cooking' ? 1e-9 : 0) && weapon.id !== 'w_observe') continue
        const ws = weaponStats(player, weapon, stats)
        weapon.cd += ws.cooldown
        if (weapon.cd < 0) weapon.cd = ws.cooldown
        this.emit(FX.FIRE, player.x, player.y, WEAPON_INDEX.get(weapon.id)!, this.playerIndex(player))
        this.fire(player, weapon, ws)
      }
    }
  }

  private ageWeapons() {
    const age = ageAt(this.state.time)
    for (const player of this.state.players) {
      const pet = player.weapons.find((weapon) => weapon.id === 'w_pet')
      if (!pet) continue
      pet.acquiredAge ??= age
      if (age - pet.acquiredAge < PET_LIFESPAN) continue
      player.weapons = player.weapons.filter((weapon) => weapon !== pet)
      this.state.shots = this.state.shots.filter((shot) => shot.owner !== player.id || shot.sourceWeapon !== pet.id)
      const refresh = (hand: string[]) => hand.filter((choice) => !choice.startsWith('r:w_pet:'))
      if (player.choices.some((choice) => choice === 'w:w_pet' || choice.startsWith('r:w_pet:'))) {
        player.choices = refresh(player.choices)
        if (!player.choices.length) player.choices = ['x:skip']
        player.choiceSeq++
      }
      const familyHand = this.familyHands.get(player.id)
      if (familyHand?.length) {
        const remaining = refresh(familyHand)
        this.familyHands.set(player.id, remaining.length ? remaining : ['x:skip'])
      }
      if (pet.lv >= MAX_WEAPON_LEVEL && !passiveLevel(player, PET_MEMORY)) {
        player.passives.push({ id: PET_MEMORY, lv: 1 })
        this.log(`${player.name}の愛犬が旅立った。「愛犬との思い出」は心に残る。`)
      } else this.log(`${player.name}の愛犬が旅立った。`)
    }
  }

  private targets(player: Player, count: number, range: number) {
    const found: { enemy: Enemy; d: number }[] = []
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue
      const d = Math.hypot(enemy.x - player.x, enemy.y - player.y)
      if (d <= range) found.push({ enemy, d })
    }
    found.sort((a, b) => a.d - b.d)
    return found.slice(0, count).map((entry) => entry.enemy)
  }

  private shot(player: Player, weapon: OwnedWeapon, def: WeaponDef, ws: WeaponStats, extra: Partial<Shot>) {
    const life = extra.life ?? ws.duration
    const shot: Shot = {
      id: this.state.nextId++,
      owner: player.id,
      weapon: def.id,
      sourceWeapon: weapon.id,
      kind: def.behavior,
      x: player.x,
      y: player.y,
      vx: 0,
      vy: 0,
      r: def.area * ws.area,
      angle: 0,
      orbit: 0,
      spin: 0,
      maxLife: life,
      damage: ws.damage,
      pierce: def.pierce,
      tick: def.pierce === Infinity ? 0.5 : Infinity,
      knockback: def.knockback,
      strong: def.strong,
      hits: new Map(),
      w: 0,
      h: 0,
      v: 0,
      delay: 0,
      aux: 0,
      crit: false,
      critChance: ws.crit,
      strongMult: ws.strong,
      ...extra,
      life
    }
    if (this.state.shots.length < MAX_SHOTS) this.state.shots.push(shot)
    return shot
  }

  private fire(player: Player, weapon: OwnedWeapon, ws: WeaponStats, def = WEAPON_BY_ID.get(weapon.id)!) {
    const n =
      def.id === 'p_monster'
        ? Math.max(
            0,
            Math.min(
              ws.amount,
              2 - this.state.shots.filter((shot) => shot.owner === player.id && shot.weapon === 'p_monster').length
            )
          )
        : ws.amount
    const rng = this.rng
    const speed = def.speed * ws.speed
    switch (def.behavior) {
      case 'orbit':
        for (let i = 0; i < n; i++)
          this.shot(player, weapon, def, ws, {
            angle: (i / n) * Math.PI * 2,
            orbit: def.area * ws.area,
            spin: def.id === 'p_monster' || def.id === 'p_over' ? 240 * ws.speed : speed,
            r: 20 * Math.sqrt(ws.area),
            h: def.id === 'p_over' ? (i / n) * Math.PI * 2 : 0,
            tick: 0.45
          })
        break
      case 'aura':
        this.shot(player, weapon, def, ws, { r: def.area * ws.area, tick: 0.45 })
        break
      case 'aim':
      case 'homing':
      case 'bounce': {
        const found = this.targets(player, n, 700)
        for (let i = 0; i < n; i++) {
          const target = found[i % Math.max(1, found.length)]
          let angle = target
            ? Math.atan2(target.y - player.y, target.x - player.x)
            : Math.atan2(player.fy, player.fx) + (i - (n - 1) / 2) * 0.25
          if (def.behavior === 'bounce') angle += (rng() - 0.5) * 0.6
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            pierce:
              def.pierce +
              WEAPON_LEVELS[def.id].slice(0, weapon.lv - 1).reduce((value, upgrade) => value + (upgrade.pierce ?? 0), 0)
          })
        }
        break
      }
      case 'wander':
        for (let i = 0; i < n; i++) {
          this.shot(player, weapon, def, ws, {
            x: player.x + (i - (n - 1) / 2) * def.area * ws.area * 2,
            vy: -speed,
            angle: -Math.PI / 2
          })
        }
        break
      case 'arc':
        for (let i = 0; i < n; i++) {
          const side = (i % 2 ? -1 : 1) * (player.fx < 0 ? -1 : 1)
          this.shot(player, weapon, def, ws, { vx: side * (90 + rng() * 140 + i * 30), vy: -speed - rng() * 80 })
        }
        break
      case 'zone':
        for (let i = 0; i < n; i++) {
          const found = this.targets(player, 8, 360)
          const target = found[Math.floor(rng() * found.length)]
          const angle = rng() * Math.PI * 2
          this.shot(player, weapon, def, ws, {
            x: target?.x ?? player.x + Math.cos(angle) * 120,
            y: target?.y ?? player.y + Math.sin(angle) * 120,
            tick: 0.5
          })
        }
        break
      case 'strike':
      case 'rain': {
        const found = this.targets(player, 24, 520)
        for (let i = 0; i < n; i++) {
          const target = found.splice(Math.floor(rng() * found.length), 1)[0]
          if (!target) break
          this.shot(player, weapon, def, ws, { x: target.x, y: target.y, tick: Infinity })
        }
        break
      }
      case 'whip':
      case 'flail':
      case 'beam':
        for (let i = 0; i < n; i++) {
          let angle =
            def.behavior === 'flail' ? rng() * Math.PI * 2 : Math.atan2(player.fy, player.fx) + (i % 2 ? Math.PI : 0)
          if (def.behavior !== 'flail' && i >= 2) angle += (i % 2 ? -1 : 1) * 0.6
          const length = def.area * ws.area
          if (def.behavior === 'beam')
            this.shot(player, weapon, def, ws, {
              angle,
              w: length / 2,
              h: 9 * ws.area,
              r: length / 2,
              x: player.x + Math.cos(angle) * length * 0.5,
              y: player.y + Math.sin(angle) * length * 0.5,
              tick: 0.2
            })
          else
            this.shot(player, weapon, def, ws, {
              angle,
              w: length / 2,
              h: def.behavior === 'flail' ? 22 : 22 * ws.area,
              r: length / 2,
              x: player.x + Math.cos(angle) * length * 0.5,
              y: player.y + Math.sin(angle) * length * 0.5,
              tick: Infinity
            })
        }
        break
      case 'chain': {
        // SNS: instant. Each link is a short-lived visual segment that ends on its victim.
        const hit = new Set<number>()
        let fromX = player.x
        let fromY = player.y
        const jump = 170 * ws.area
        const links = Math.round((2 + n) * (ws.duration / def.duration))
        for (let i = 0; i < links; i++) {
          const target = this.nearestEnemy(fromX, fromY, i === 0 ? 420 * ws.area : jump, hit)
          if (!target) break
          hit.add(target.id)
          const dx = target.x - fromX
          const dy = target.y - fromY
          const link = this.shot(player, weapon, def, ws, {
            x: target.x,
            y: target.y,
            angle: Math.atan2(dy, dx),
            r: Math.hypot(dx, dy),
            v: i,
            pierce: 1,
            tick: Infinity
          })
          this.damage(target, ENEMY_BY_ID.get(target.kind)!, link, player)
          fromX = target.x
          fromY = target.y
        }
        break
      }
      case 'pet': {
        for (let i = 0; i < n; i++)
          this.shot(player, weapon, def, ws, {
            x: player.x + Math.cos(i * 2.4) * 24,
            y: player.y + Math.sin(i * 2.4) * 24,
            orbit: i * 2.4,
            petType: i % PET_TYPES.length,
            spin: speed,
            tick: 0.4
          })
        break
      }
      case 'observe': {
        if (
          player.still < OBSERVATION_STILL_SECONDS ||
          this.state.shots.some(
            (shot) => shot.owner === player.id && shot.sourceWeapon === weapon.id && shot.weapon === def.id
          ) ||
          this.state.shots.length >= MAX_SHOTS
        )
          break
        const form = observationSprite(ageAt(this.state.time), weapon.observationCount ?? 0)
        weapon.observationCount = (weapon.observationCount ?? 0) + 1
        this.shot(player, weapon, def, ws, {
          x: player.x + player.fx * 50,
          y: player.y + player.fy * 50,
          w:
            2 +
            WEAPON_LEVELS[def.id].slice(0, weapon.lv - 1).reduce((value, upgrade) => value + (upgrade.targets ?? 0), 0),
          v: form * 2 + 1,
          tick: 0.5
        })
        break
      }
      case 'slam': {
        const radius = def.area * ws.area
        const slam = this.shot(player, weapon, def, ws, { r: radius, tick: Infinity })
        this.near(player.x, player.y, radius, (enemy) => {
          const edef = ENEMY_BY_ID.get(enemy.kind)!
          const reach = radius + edef.radius * enemy.scale
          if ((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2 <= reach * reach)
            this.damage(enemy, edef, slam, player)
        })
        this.emit(FX.BLAST, player.x, player.y, radius, WEAPON_INDEX.get(def.id)!)
        break
      }
      case 'barrage': {
        const target = this.nearestEnemy(player.x, player.y, 700)
        const base = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(player.fy, player.fx)
        for (let i = 0; i < n * 3; i++) {
          const angle = base + (rng() - 0.5) * 0.08
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            delay: i * 0.06
          })
        }
        break
      }
      case 'boomerang': {
        const target = this.nearestEnemy(player.x, player.y, 700)
        const base = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(player.fy, player.fx)
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * 0.45
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            tick: 0.35
          })
        }
        break
      }
      case 'nova':
        for (let i = 0; i < n; i++)
          this.shot(player, weapon, def, ws, {
            r: 10,
            angle: Math.atan2(player.fy, player.fx),
            w: def.area * ws.area,
            tick: Infinity,
            delay: i * 0.22
          })
        break
      case 'sweep':
        for (let i = 0; i < n; i++) {
          const side = rng() < 0.5 ? -1 : 1
          this.shot(player, weapon, def, ws, {
            x: player.x - side * (VIEW_HALF.x + 40),
            y: player.y + (rng() * 2 - 1) * 220,
            vx: side * speed,
            ...(weapon.id === 'w_travel'
              ? { aux: player.x + side * (VIEW_HALF.x + 40), life: (2 * (VIEW_HALF.x + 40)) / speed + 1 }
              : {}),
            angle: side > 0 ? 0 : Math.PI,
            tick: 5
          })
        }
        break
      case 'mine': {
        let planted = 0
        for (const shot of this.state.shots)
          if (shot.owner === player.id && shot.sourceWeapon === weapon.id && shot.weapon === def.id) planted++
        for (let i = 0; i < n && planted + i < 5 + n * 2; i++) {
          const angle = rng() * Math.PI * 2
          this.shot(player, weapon, def, ws, {
            x: player.x + (i ? Math.cos(angle) * 28 : 0),
            y: player.y + (i ? Math.sin(angle) * 28 : 0),
            r: 16,
            w: def.area * ws.area,
            aux: 0.4,
            tick: Infinity
          })
        }
        break
      }
      case 'gamble': {
        const candidates = player.weapons.filter((owned) => {
          const def = WEAPON_BY_ID.get(owned.id)
          return def && def.id !== 'w_gamble' && def.behavior !== 'none' && def.behavior !== 'food'
        })
        if (!candidates.length) {
          weapon.gambleWeapon = undefined
          break
        }
        if (!candidates.some((owned) => owned.id === weapon.gambleWeapon) || weapon.held >= (weapon.gambleUntil ?? 0)) {
          weapon.gambleWeapon = candidates[Math.floor(rng() * candidates.length)].id
          weapon.gambleUntil = weapon.held + 12
          this.emit(
            FX.GAMBLE,
            player.x,
            player.y,
            GAMBLE_FORMS.indexOf(gambleForm(ageAt(this.state.time))),
            WEAPON_INDEX.get(weapon.gambleWeapon)!
          )
        }
        const copied = WEAPON_BY_ID.get(weapon.gambleWeapon!)!
        this.fire(player, weapon, weaponStats(player, weapon, playerStats(player), copied), copied)
        break
      }
      case 'trail':
        for (let i = 0; i < n; i++) {
          const jitter = i ? 30 : 0
          this.shot(player, weapon, def, ws, {
            x: player.x + (rng() * 2 - 1) * jitter,
            y: player.y + (rng() * 2 - 1) * jitter,
            tick: 0.5
          })
        }
        break
      case 'food': {
        const kind = COOKING_ITEMS[Math.floor(rng() * COOKING_ITEMS.length)]
        this.drop({
          kind,
          x: player.x + player.fx * 60,
          y: player.y + player.fy * 60,
          owner: player.id,
          power:
            1 +
            WEAPON_LEVELS[def.id]
              .slice(0, weapon.lv - 1)
              .reduce((value, upgrade) => value + (upgrade.foodPower ?? 0), 0) +
            (isEvolved(player, weapon) ? 0.3 : 0)
        })
        break
      }
      case 'garden': {
        const target = this.nearestEnemy(player.x, player.y, 700)
        const base = target ? Math.atan2(target.y - player.y, target.x - player.x) : Math.atan2(player.fy, player.fx)
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * 0.35
          this.shot(player, weapon, def, ws, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            angle,
            r: 10 * ws.area,
            w: def.area * ws.area,
            aux: (def.speed * 0.8) / speed,
            orbit: (def.speed * 0.8) / speed,
            pierce: 1,
            tick: 0.5
          })
        }
        break
      }
      case 'raid': {
        // ヤンキー親 storms out at the nearest enemies, one each, stopping a stride short so the sole lands on
        // them; with nobody near it swaggers out ahead.
        const reach = def.area * ws.area
        const found = this.targets(player, n, reach * 2)
        const r = 18 * Math.sqrt(ws.area)
        for (let i = 0; i < n; i++) {
          const target = found[i]
          const angle = target
            ? Math.atan2(target.y - player.y, target.x - player.x)
            : Math.atan2(player.fy, player.fx) + (i - (n - 1) / 2) * 0.7
          const d = target ? Math.hypot(target.x - player.x, target.y - player.y) - 14 : reach * 0.6
          this.shot(player, weapon, def, ws, { angle, orbit: Math.max(48, Math.min(reach, d)), r, w: r, tick: 0.3 })
        }
        break
      }
    }
  }

  private moveShots(dt: number) {
    const state = this.state
    const players = new Map(state.players.map((player) => [player.id, player]))
    const kept: Shot[] = []
    for (const shot of state.shots) {
      const owner = players.get(shot.owner)
      if (!owner) continue
      if (shot.delay > 0) {
        shot.delay -= dt
        // Staples leave from wherever the owner is when their turn comes.
        if (shot.delay <= 0 && shot.kind === 'barrage') {
          shot.x = owner.x
          shot.y = owner.y
        }
        kept.push(shot)
        continue
      }
      if (
        shot.weapon === 'p_toxic' &&
        shot.sourceWeapon === 'p_toxic' &&
        owner.weapons.some((weapon) => weapon.id === 'p_toxic')
      )
        shot.life = shot.maxLife
      else shot.life -= dt
      if (shot.kind === 'garden' && shot.v === 0) {
        const travel = Math.min(dt, shot.aux)
        shot.x += shot.vx * travel
        shot.y += shot.vy * travel
        shot.aux -= dt
        if (shot.aux <= 0) {
          shot.v = 2
          shot.aux = 0.5
        }
        kept.push(shot)
        continue
      }
      if (shot.kind === 'garden' && shot.v === 2) {
        shot.aux -= dt
        if (shot.aux <= 0) {
          shot.v = 1
          shot.r = shot.w
          shot.life = shot.maxLife
          shot.pierce = Infinity
        }
        kept.push(shot)
        continue
      }
      if (shot.life <= 0 && shot.sourceWeapon !== 'w_travel') {
        if (shot.weapon === 'p_free') this.burst(shot, owner)
        continue
      }
      switch (shot.kind) {
        case 'sweep':
          shot.x += shot.vx * dt
          if (shot.sourceWeapon === 'w_travel' && (shot.x - shot.aux) * shot.vx >= 0) continue
          break
        case 'orbit':
          if (shot.weapon === 'p_monster') this.movePet(shot, owner, dt)
          else if (shot.weapon === 'p_over') this.moveGuardian(shot, owner, dt)
          else {
            shot.angle += shot.spin * dt
            shot.x = owner.x + Math.cos(shot.angle) * shot.orbit
            shot.y = owner.y + Math.sin(shot.angle) * shot.orbit
          }
          break
        case 'aura':
          shot.x = owner.x
          shot.y = owner.y
          break
        case 'homing': {
          const target = this.targets({ ...owner, x: shot.x, y: shot.y } as Player, 1, 260)[0]
          if (target) {
            const want = Math.atan2(target.y - shot.y, target.x - shot.x)
            let diff = want - shot.angle
            diff = Math.atan2(Math.sin(diff), Math.cos(diff))
            shot.angle += Math.max(-4 * dt, Math.min(4 * dt, diff))
            const speed = Math.hypot(shot.vx, shot.vy)
            shot.vx = Math.cos(shot.angle) * speed
            shot.vy = Math.sin(shot.angle) * speed
          }
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          break
        }
        case 'bounce':
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          if (Math.abs(shot.x - owner.x) > VIEW_HALF.x - 20) {
            shot.vx = -Math.sign(shot.x - owner.x) * Math.abs(shot.vx)
            shot.x = owner.x + Math.sign(shot.x - owner.x) * (VIEW_HALF.x - 20)
          }
          if (Math.abs(shot.y - owner.y) > VIEW_HALF.y - 20) {
            shot.vy = -Math.sign(shot.y - owner.y) * Math.abs(shot.vy)
            shot.y = owner.y + Math.sign(shot.y - owner.y) * (VIEW_HALF.y - 20)
          }
          shot.angle += dt * 10
          break
        case 'arc':
          shot.vy += 900 * dt
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
          shot.angle += dt * 9
          break
        case 'whip':
        case 'flail':
        case 'zone':
        case 'strike':
        case 'rain':
        case 'chain':
        case 'slam':
        case 'trail':
        case 'garden':
          break
        case 'beam':
          shot.x = owner.x + Math.cos(shot.angle) * shot.w
          shot.y = owner.y + Math.sin(shot.angle) * shot.w
          break
        case 'nova':
          shot.x = owner.x
          shot.y = owner.y
          shot.r = 10 + (shot.w - 10) * (1 - shot.life / shot.maxLife)
          break
        case 'boomerang': {
          shot.aux += dt
          const out = shot.maxLife * 0.42
          if (shot.aux < out) {
            const slowing = 1 - shot.aux / out
            shot.x += shot.vx * slowing * dt
            shot.y += shot.vy * slowing * dt
          } else {
            const dx = owner.x - shot.x
            const dy = owner.y - shot.y
            const d = Math.hypot(dx, dy)
            const speed = Math.min(720, 120 + (shot.aux - out) * 700)
            if (d < 22) continue
            shot.x += (dx / d) * Math.min(d, speed * dt)
            shot.y += (dy / d) * Math.min(d, speed * dt)
          }
          shot.angle += dt * 14
          break
        }
        case 'pet':
          this.movePet(shot, owner, dt)
          break
        case 'observe':
          this.moveObservation(shot, owner, dt)
          break
        case 'raid': {
          // Out and back along one line from the owner; the flying kick lands a wider blow than the run.
          const t = 1 - shot.life / shot.maxLife
          const d = shot.orbit * raidReach(t)
          shot.x = owner.x + Math.cos(shot.angle) * d
          shot.y = owner.y + Math.sin(shot.angle) * d
          shot.r = shot.w * (t >= RAID.kick && t < RAID.back ? 1.6 : 1)
          break
        }
        case 'mine':
          if (shot.aux > 0) {
            shot.aux -= dt
            shot.v = 0
          } else {
            shot.v = 1
            if (this.mineTouched(shot)) {
              this.burst(shot, owner)
              continue
            }
          }
          break
        default:
          shot.x += shot.vx * dt
          shot.y += shot.vy * dt
      }
      if (this.collide(shot, owner)) kept.push(shot)
      else if (shot.weapon === 'p_free') this.burst(shot, owner)
    }
    state.shots = kept
  }

  private moveObservation(shot: Shot, owner: Player, dt: number) {
    {
      const targets: Enemy[] = []
      this.near(shot.x, shot.y, shot.r, (enemy) => {
        if (enemy.hp > 0 && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) <= shot.r) targets.push(enemy)
      })
      targets.sort(
        (first, second) =>
          (first.x - shot.x) ** 2 + (first.y - shot.y) ** 2 - (second.x - shot.x) ** 2 - (second.y - shot.y) ** 2
      )
      shot.targets = targets.slice(0, shot.w)
    }
    for (const enemy of shot.targets) {
      if (enemy.hp <= 0 || !this.state.enemies.includes(enemy)) continue
      const dx = shot.x - enemy.x
      const dy = shot.y - enemy.y
      const distance = Math.hypot(dx, dy)
      if (distance > shot.r) continue
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const pull = Math.min(distance, 35 * this.knockScale(enemy, def) * dt)
      enemy.x += (dx / (distance || 1)) * pull
      enemy.y += (dy / (distance || 1)) * pull
      enemy.slow = Math.max(enemy.slow, 0.12)
      if ((shot.hits.get(enemy.id) ?? -1) <= this.state.time) {
        shot.hits.set(enemy.id, this.state.time + shot.tick)
        this.damage(enemy, def, shot, owner)
      }
    }
  }

  private moveGuardian(shot: Shot, owner: Player, dt: number) {
    const goalX = owner.x + Math.cos(shot.h) * shot.orbit * 0.72
    const goalY = owner.y + Math.sin(shot.h) * shot.orbit * 0.72
    const dx = goalX - shot.x
    const dy = goalY - shot.y
    const distance = Math.hypot(dx, dy)
    shot.angle = shot.h
    if (distance > 0) {
      const step = Math.min(distance, shot.spin * dt)
      shot.x += (dx / distance) * step
      shot.y += (dy / distance) * step
    }
  }

  private movePet(shot: Shot, owner: Player, dt: number) {
    shot.aux -= dt
    if (shot.aux <= 0 || (shot.target && shot.target.hp <= 0)) {
      shot.aux = 0.2
      let best: Enemy | undefined
      let distance = Infinity
      let lastHit = Infinity
      let occupied = Infinity
      const chasers = new Map<Enemy, number>()
      if (shot.weapon === 'w_pet')
        for (const other of this.state.shots)
          if (other !== shot && other.owner === shot.owner && other.weapon === 'w_pet' && other.target)
            chasers.set(other.target, (chasers.get(other.target) ?? 0) + 1)
      this.near(owner.x, owner.y, 300, (enemy) => {
        if (Math.hypot(enemy.x - owner.x, enemy.y - owner.y) > 300) return
        const d = (enemy.x - shot.x) ** 2 + (enemy.y - shot.y) ** 2
        const hit = shot.weapon === 'w_pet' ? (shot.hits.get(enemy.id) ?? -Infinity) : 0
        const count = chasers.get(enemy) ?? 0
        if (hit < lastHit || (hit === lastHit && (count < occupied || (count === occupied && d < distance)))) {
          lastHit = hit
          occupied = count
          distance = d
          best = enemy
        }
      })
      shot.target = best
    }
    const target = shot.target
    // With nothing to chase the dog trots back to its spot beside the owner.
    const goalX = target ? target.x : owner.x + Math.cos(shot.orbit) * 34
    const goalY = target ? target.y : owner.y + Math.sin(shot.orbit) * 34
    const dx = goalX - shot.x
    const dy = goalY - shot.y
    const d = Math.hypot(dx, dy)
    if (d > 4) {
      const step = Math.min(d, shot.spin * dt)
      shot.x += (dx / d) * step
      shot.y += (dy / d) * step
      if (d > 8) shot.angle = Math.atan2(dy, dx)
    }
    const reach = target ? shot.r + (ENEMY_BY_ID.get(target.kind)?.radius ?? 12) * target.scale + 6 : 0
    shot.v = target && d < reach ? 1 : 0
  }

  private mineTouched(shot: Shot) {
    let touched = false
    this.near(shot.x, shot.y, 30, (enemy) => {
      const reach = shot.r + 6 + ENEMY_BY_ID.get(enemy.kind)!.radius * enemy.scale
      if ((enemy.x - shot.x) ** 2 + (enemy.y - shot.y) ** 2 <= reach * reach) {
        touched = true
        return false
      }
    })
    return touched
  }

  private burst(shot: Shot, owner: Player) {
    const balloon = shot.weapon === 'p_free'
    const radius = balloon ? shot.r * 4 : shot.w
    const blast = balloon ? { ...shot, knockback: 240 } : shot
    this.near(shot.x, shot.y, radius, (enemy) => {
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const reach = radius + def.radius * enemy.scale
      if ((enemy.x - shot.x) ** 2 + (enemy.y - shot.y) ** 2 <= reach * reach)
        this.damage(enemy, def, blast, owner, balloon ? shot : undefined)
    })
    this.emit(FX.BLAST, shot.x, shot.y, radius, WEAPON_INDEX.get(shot.weapon)!)
  }

  /** Applies hits; returns false once the shot is used up. */
  private collide(shot: Shot, owner: Player) {
    const time = this.state.time
    if (shot.kind === 'chain' || shot.kind === 'slam' || shot.kind === 'mine' || shot.kind === 'observe') return true
    // Rain falls first and lands at the end of its life; strikes land immediately.
    if (shot.kind === 'rain' && shot.life > shot.maxLife * 0.35) return true
    let alive = true
    if (shot.kind === 'nova') {
      this.near(shot.x, shot.y, shot.r + 20, (enemy) => {
        const def = ENEMY_BY_ID.get(enemy.kind)!
        const d = Math.hypot(enemy.x - shot.x, enemy.y - shot.y)
        if (Math.abs(d - shot.r) > 16 + def.radius * enemy.scale) return
        const direction = Math.atan2(enemy.y - shot.y, enemy.x - shot.x) - shot.angle
        if (Math.cos(direction) < 0.5) return
        if (shot.hits.has(enemy.id)) return
        shot.hits.set(enemy.id, Infinity)
        this.damage(enemy, def, shot, owner)
      })
      return true
    }
    const rect = shot.kind === 'whip' || shot.kind === 'flail' || shot.kind === 'beam'
    const cos = Math.cos(shot.angle)
    const sin = Math.sin(shot.angle)
    this.near(shot.x, shot.y, shot.r, (enemy) => {
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const radius = def.radius * enemy.scale
      const dx = enemy.x - shot.x
      const dy = enemy.y - shot.y
      if (rect) {
        const along = dx * cos + dy * sin
        const across = -dx * sin + dy * cos
        if (Math.abs(along) > shot.w + radius || Math.abs(across) > shot.h + radius) return
      } else if (dx * dx + dy * dy > (shot.r + radius) ** 2) return
      if ((shot.hits.get(enemy.id) ?? -1) > time) return
      shot.hits.set(enemy.id, time + shot.tick)
      this.damage(enemy, def, shot, owner)
      if (--shot.pierce <= 0) {
        alive = false
        return false
      }
    })
    return alive
  }

  private damage(enemy: Enemy, def: EnemyDef, shot: Shot, owner: Player, origin?: { x: number; y: number }) {
    const strong = shot.strong.includes(def.tag)
    const crit = shot.crit || this.rng() < shot.critChance
    const amount =
      shot.damage * (strong ? shot.strongMult : 1) * (0.9 + this.rng() * 0.2) * (crit ? CRIT_MULTIPLIER : 1)
    enemy.hp -= amount
    enemy.flash = 0.12
    if (shot.weapon === 'w_love') enemy.slow = 1.2
    const knock = shot.knockback * this.knockScale(enemy, def)
    if (knock) {
      let dx = enemy.x - (origin?.x ?? owner.x)
      let dy = enemy.y - (origin?.y ?? owner.y)
      if (!dx && !dy && shot.weapon === 'p_over') {
        dx = Math.cos(shot.angle)
        dy = Math.sin(shot.angle)
      } else if (origin && !dx && !dy) dy = -1
      const l = Math.hypot(dx, dy) || 1
      enemy.kx += (dx / l) * knock
      enemy.ky += (dy / l) * knock
    }
    const weapon = owner.weapons.find((w) => w.id === shot.sourceWeapon)
    if (weapon) weapon.damage += Math.min(amount, Math.max(0, enemy.hp + amount))
    if (this.state.popups.length < 80)
      this.state.popups.push({
        x: enemy.x,
        y: enemy.y - def.radius,
        v: Math.round(amount),
        strong,
        crit,
        owner: owner.id,
        life: 0.6
      })
    if (this.tickHits < (crit ? 5 : 3)) {
      this.tickHits++
      this.emit(FX.HIT, enemy.x, enemy.y, WEAPON_INDEX.get(shot.weapon)!, (strong ? 1 : 0) | (crit ? 2 : 0))
    }
    if (enemy.hp <= 0) this.kill(enemy, def)
  }

  /** Leaves a pickup; the oldest one on the ground makes room when there are too many. */
  private drop(item: Item) {
    const items = this.state.items
    if (items.length >= MAX_ITEMS) items.shift()
    items.push(item)
  }

  private kill(enemy: Enemy, def: EnemyDef) {
    const state = this.state
    state.kills++
    const xp = def.xp * (enemy.elite ? 6 : 1)
    if (state.gems.length < MAX_GEMS) state.gems.push({ x: enemy.x, y: enemy.y, v: xp, pull: false })
    else state.gems[Math.floor(this.rng() * state.gems.length)].v += xp
    const index = ENEMY_INDEX.get(def.id)!
    if (def.behavior === 'boss') {
      this.drop({ kind: 'chest', x: enemy.x, y: enemy.y })
      state.slowmo = SLOWMO_SECONDS
      this.emit(FX.BOSS_KILL, enemy.x, enemy.y, index)
      this.log(`「${def.name}」を乗り越えた！ 転機が訪れる。`)
    } else {
      if (this.tickKills++ < 12) this.emit(FX.KILL, enemy.x, enemy.y, index, enemy.elite ? 1 : 0)
      if (enemy.elite) {
        // Elites always leave something: a meal, or now and then a turning point.
        const mealChance = state.time < RUN_SECONDS / 2 ? 0.6 : 0.8
        this.drop({ kind: this.rng() < mealChance ? 'meal' : 'chest', x: enemy.x, y: enemy.y })
      } else if (this.rng() < 0.0015 && state.items.length < 20) this.drop({ kind: 'meal', x: enemy.x, y: enemy.y })
      else if (this.rng() < 0.0012 && state.items.length < 20) this.drop({ kind: 'magnet', x: enemy.x, y: enemy.y })
    }
    if (def.child && def.children)
      for (let i = 0; i < def.children; i++) {
        const angle = (i / def.children) * Math.PI * 2 + this.rng()
        this.spawnEnemy(def.child, enemy.x + Math.cos(angle) * 22, enemy.y + Math.sin(angle) * 22)
      }
  }

  private collectGems(dt: number) {
    const state = this.state
    const alive = state.players.filter((player) => !player.downed)
    if (!alive.length) return
    const stats = new Map(alive.map((player) => [player.id, playerStats(player)]))
    const gathered = new Map<string, number>()
    const kept: Gem[] = []
    for (const gem of state.gems) {
      let best: Player | undefined
      let distance = Infinity
      for (const player of alive) {
        const d = Math.hypot(player.x - gem.x, player.y - gem.y)
        if (d < distance) {
          distance = d
          best = player
        }
      }
      if (!best) continue
      const s = stats.get(best.id)!
      if (distance < s.magnet) gem.pull = true
      if (gem.pull) {
        const speed = 420 * dt
        gem.x += ((best.x - gem.x) / (distance || 1)) * speed
        gem.y += ((best.y - gem.y) / (distance || 1)) * speed
      }
      if (distance < PLAYER_RADIUS + 8) {
        this.gainXp(gem.v * s.xpGain)
        gathered.set(best.id, (gathered.get(best.id) ?? 0) + 1)
      } else kept.push(gem)
    }
    state.gems = kept
    for (const [id, count] of gathered) {
      const player = alive.find((p) => p.id === id)!
      this.emit(FX.GEM, player.x, player.y, count, this.playerIndex(player))
    }
    state.items = state.items.filter((item) => {
      const taker = alive.find(
        (player) =>
          (!('owner' in item) || item.owner === player.id) &&
          Math.hypot(player.x - item.x, player.y - item.y) < PLAYER_RADIUS + 16
      )
      if (!taker) return true
      const takerIndex = this.playerIndex(taker)
      if ('owner' in item) {
        if (item.kind === 'food_heal') taker.hp = Math.min(taker.maxHp, taker.hp + 40 * item.power)
        else {
          taker.cookingBuffs ??= {}
          taker.cookingBuffs[item.kind] = { time: 60, power: item.power }
        }
        this.emit(FX.ITEM, item.x, item.y, ITEM_KINDS.indexOf(item.kind), takerIndex)
      } else if (item.kind === 'meal') {
        taker.hp = Math.min(taker.maxHp, taker.hp + 40)
        this.emit(FX.ITEM, item.x, item.y, ITEM_KINDS.indexOf('meal'), takerIndex)
      } else if (item.kind === 'magnet') {
        for (const gem of state.gems) gem.pull = true
        this.emit(FX.ITEM, item.x, item.y, ITEM_KINDS.indexOf('magnet'), takerIndex)
      } else {
        const grant = this.rng() < CHEST_TRIPLE ? 3 : 1
        for (const player of alive) player.pending += grant
        this.emit(FX.CHEST, item.x, item.y, grant, takerIndex)
      }
      return false
    })
  }

  gainXp(amount: number) {
    const state = this.state
    state.xp += amount
    let leveled = false
    while (state.xp >= state.xpNext) {
      state.xp -= state.xpNext
      state.level++
      leveled = true
      state.xpNext = Math.round(xpForLevel(state.level) * (1 + (state.players.length - 1) * 0.5))
      for (const player of state.players)
        if (!player.downed) {
          const hasOptions = this.options(player).length > 0
          if (
            state.level % 5 === 0 &&
            (!hasOptions || talentWeaponCount(player) >= weaponSlots(player, ageAt(state.time)))
          )
            player.swapPending++
          if (hasOptions || state.level % 5 !== 0) player.pending++
          // Growing up also mends the heart a little.
          player.hp = Math.min(player.maxHp, player.hp + player.maxHp * LEVEL_HEAL)
          this.emit(FX.LEVELUP, player.x, player.y, state.level, this.playerIndex(player))
        }
    }
    if (leveled) for (const player of state.players) if (!player.downed) this.shockwave(player)
  }

  /** A level-up pushes the crowd back off whoever grew (no damage). */
  private shockwave(player: Player) {
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue
      const dx = enemy.x - player.x
      const dy = enemy.y - player.y
      const d = Math.hypot(dx, dy)
      if (d > 190) continue
      const def = ENEMY_BY_ID.get(enemy.kind)!
      const push = 360 * (1 - d / 260) * this.knockScale(enemy, def)
      enemy.kx += (dx / (d || 1)) * push
      enemy.ky += (dy / (d || 1)) * push
    }
  }

  private loseParent(player: Player, event: number) {
    if (player.parentDeath) return
    const weapon = player.weapons.find((owned) => owned.id === player.parent)
    const legacy = PARENT_LEGACIES[player.parent]
    let reward: ParentReward = 'none'
    if (weapon && weapon.lv >= MAX_WEAPON_LEVEL) {
      if (passiveLevel(player, legacy) >= MAX_PASSIVE_LEVEL) {
        reward = 'choice'
        player.parentRewardPending++
      } else {
        reward = 'passive'
        this.grantPassive(player, legacy)
      }
    }
    player.parentDeath = { at: EVENTS[event].at, x: player.x, y: player.y, reward }
    player.weapons = player.weapons.filter((owned) => owned.id !== player.parent)
    this.state.shots = this.state.shots.filter(
      (shot) => shot.owner !== player.id || shot.sourceWeapon !== player.parent
    )
    player.shieldGrace = 0
    player.shieldRecovery = 0
    const clean = (hand: string[]) => {
      const result = hand.filter(
        (choice) =>
          choice !== `w:${player.parent}` &&
          !(choice === `p:${legacy}` && passiveLevel(player, legacy) >= MAX_PASSIVE_LEVEL)
      )
      if (hand.length && !result.length) player.parentRewardPending++
      return result
    }
    const choices = clean(player.choices)
    if (choices.length !== player.choices.length) player.choiceSeq++
    player.choices = choices
    const saved = this.familyHands.get(player.id)
    if (saved) this.familyHands.set(player.id, clean(saved))
    const outcome = parentFarewell(player.parent, reward)
    player.history.push({ event, outcome })
    player.history.sort(
      (first, second) => (first.at ?? EVENTS[first.event].at) - (second.at ?? EVENTS[second.event].at)
    )
    this.log(outcome, player.id)
    this.emit(FX.PARENT_DEATH, player.x, player.y, WEAPON_INDEX.get(player.parent)!, this.playerIndex(player))
  }

  /** Builds the level-up hand for a player from what their age and slots allow. */
  options(player: Player): string[] {
    const age = ageAt(this.state.time)
    const result: string[] = []
    for (const weapon of player.weapons)
      if (weapon.lv < MAX_WEAPON_LEVEL && !(player.parentDeath && weapon.id === player.parent))
        result.push(`w:${weapon.id}`)
    if (talentWeaponCount(player) < weaponSlots(player, age))
      for (const def of TALENT_WEAPONS) if (canObtainWeapon(player, def, age)) result.push(`w:${def.id}`)
    for (const passive of player.passives)
      if (passive.id !== PET_MEMORY && passive.lv < MAX_PASSIVE_LEVEL) result.push(`p:${passive.id}`)
    if (player.passives.filter((passive) => passive.id !== PET_MEMORY).length < PASSIVE_SLOTS)
      for (const def of PASSIVES)
        if (def.id !== PET_MEMORY && !player.passives.some((p) => p.id === def.id)) result.push(`p:${def.id}`)
    return result
  }

  /** Cards you already hold come up more often, so a build can actually be finished. */
  private cardWeight(player: Player, choice: string) {
    const [kind, id] = choice.split(':')
    const owned =
      kind === 'w' ? player.weapons.some((w) => w.id === id) : player.passives.some((passive) => passive.id === id)
    const weight = owned ? 2.5 : 1
    return kind === 'p' ? (weight * BASE_PASSIVE_COUNT) / (PASSIVES.length - 1) : weight
  }

  private offer(player: Player) {
    player.choiceSeq++
    const parentReward = player.pending === 0 && player.parentRewardPending > 0
    const career = player.pending === 0 && !parentReward && player.swapPending === 0 && player.careerPending > 0
    if ((player.pending === 0 && !parentReward && player.swapPending > 0) || (career && !this.options(player).length)) {
      if (career) player.careerPending--
      else player.swapPending--
      const age = ageAt(this.state.time)
      const pool = TALENT_WEAPONS.filter((def) => canObtainWeapon(player, def, age))
      const hand: string[] = []
      while (hand.length < 3 && pool.length)
        hand.push(`s:${pool.splice(Math.floor(this.rng() * pool.length), 1)[0].id}`)
      if (hand.length && talentWeaponCount(player)) player.choices = [...hand, 'x:skip']
      return
    }
    // 蒸発済み's first hand (自立): only the talents of early childhood, whatever the age.
    const birth = player.birthPick === true
    player.birthPick = false
    const pool = birth
      ? TALENT_WEAPONS.filter((def) => def.minAge <= 6).map((def) => `w:${def.id}`)
      : this.options(player)
    if (!pool.length && parentReward) pool.push('x:meal', 'x:coin')
    const hand: string[] = []
    // 運がいい sometimes deals a fourth card.
    const size = 3 + (this.rng() < passivePower(player, 'p_lucky') * 0.1 ? 1 : 0)
    while (hand.length < size && pool.length) {
      const weights = pool.map((choice) => this.cardWeight(player, choice))
      let roll = this.rng() * weights.reduce((sum, w) => sum + w, 0)
      let pick = pool.length - 1
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i]
        if (roll <= 0) {
          pick = i
          break
        }
      }
      hand.push(pool.splice(pick, 1)[0])
    }
    player.choices = hand
    if (career) player.careerPending--
    else if (parentReward) player.parentRewardPending--
    else player.pending--
  }

  choose(player: Player, index: number) {
    if (this.state.phase !== 'playing' || !Number.isSafeInteger(index) || !this.state.players.includes(player)) return
    const choice = player.choices[index]
    if (!choice) return
    if (choice === 'd:yes' || choice === 'd:no') {
      const hand = this.familyHands.get(player.id)
      if (!hand) return
      this.familyHands.delete(player.id)
      player.choices = hand
      player.choiceSeq++
      player.dating = choice === 'd:yes'
      this.log(player.dating ? 'パートナーと交際を始めた。' : '今は一人で歩むことにした。', player.id)
      return
    }
    if (choice === 'f:yes' || choice === 'f:no') {
      const hand = this.familyHands.get(player.id)
      if (!hand) return
      this.familyHands.delete(player.id)
      player.choices = hand
      player.choiceSeq++
      player.hasChild = choice === 'f:yes'
      const event = EVENTS.findIndex((entry) => entry.swarm === 'nightcry')
      const outcome = LIFE_OUTCOMES.nightcry[player.hasChild ? 0 : 1]
      player.history = player.history.filter((entry) => entry.event !== event)
      player.history.push({ event, outcome, at: this.state.time })
      player.history.sort(
        (first, second) => (first.at ?? EVENTS[first.event].at) - (second.at ?? EVENTS[second.event].at)
      )
      this.log(outcome, player.id)
      if (player.hasChild && !this.nightcryStarted) {
        this.nightcryStarted = true
        this.log(`${player.name}の家族の試練：${EVENTS[event].text}`)
        this.spawnSwarm(event, player)
      }
      return
    }
    const [kind, id, replacement] = choice.split(':')
    player.choices = []
    player.choiceSeq++
    if (kind === 's') {
      player.choices = [
        ...player.weapons
          .filter((weapon) => !WEAPON_BY_ID.get(weapon.id)?.parent)
          .map((weapon) => `r:${weapon.id}:${id}`),
        'x:skip'
      ]
    } else if (kind === 'r') {
      const index = player.weapons.findIndex((weapon) => weapon.id === id)
      if (index >= 0 && replacement && WEAPON_BY_ID.has(replacement)) {
        if (id === 'w_pet')
          this.state.shots = this.state.shots.filter((shot) => shot.owner !== player.id || shot.sourceWeapon !== id)
        player.weapons[index] = {
          id: replacement,
          lv: 1,
          cd: 0.2,
          held: 0,
          damage: 0,
          acquiredAge: ageAt(this.state.time)
        }
        this.feel(player, WEAPON_BY_ID.get(replacement)!, 1)
      }
    } else if (kind === 'w') {
      if (player.parentDeath && id === player.parent) return
      const owned = player.weapons.find((w) => w.id === id)
      if (owned) {
        const before = isEvolved(player, owned)
        owned.lv = Math.min(MAX_WEAPON_LEVEL, owned.lv + 1)
        this.feel(player, WEAPON_BY_ID.get(id)!, owned.lv)
        if (!before && isEvolved(player, owned)) this.announceEvolution(player, owned)
      } else {
        player.weapons.push({ id, lv: 1, cd: 0.2, held: 0, damage: 0, acquiredAge: ageAt(this.state.time) })
        this.feel(player, WEAPON_BY_ID.get(id)!, 1)
      }
    } else if (kind === 'p') {
      this.grantPassive(player, id)
    } else if (choice === 'x:meal') player.hp = Math.min(player.maxHp, player.hp + 40)
    else if (choice === 'x:coin') this.gainXp(this.state.xpNext * 0.25)
  }

  private grantPassive(player: Player, id: string) {
    const owned = player.passives.find((p) => p.id === id)
    const evolvedBefore = new Set(player.weapons.filter((w) => isEvolved(player, w)).map((w) => w.id))
    if (owned) {
      owned.lv = Math.min(MAX_PASSIVE_LEVEL, owned.lv + 1)
      this.feel(player, PASSIVE_BY_ID.get(id)!, owned.lv)
    } else {
      player.passives.push({ id, lv: 1 })
      this.feel(player, PASSIVE_BY_ID.get(id)!, 1)
    }
    let evolved = false
    for (const weapon of player.weapons)
      if (!evolvedBefore.has(weapon.id) && isEvolved(player, weapon)) {
        evolved = true
        this.emit(FX.EVOLVE, player.x, player.y, WEAPON_INDEX.get(weapon.id)!, this.playerIndex(player))
      }
    if (evolved) this.log(`${player.name}の手札が進化した！`)
    const stats = playerStats(player)
    if (!player.downed && stats.maxHp > player.maxHp) player.hp += stats.maxHp - player.maxHp
    player.maxHp = stats.maxHp
    player.hp = Math.min(player.hp, player.maxHp)
  }

  private announceEvolution(player: Player, weapon: OwnedWeapon) {
    this.emit(FX.EVOLVE, player.x, player.y, WEAPON_INDEX.get(weapon.id)!, this.playerIndex(player))
    this.log(`${player.name}の「${WEAPON_BY_ID.get(weapon.id)!.name}」が「${weaponName(player, weapon)}」に進化！`)
  }

  private feel(player: Player, def: Pick<WeaponDef, 'category' | 'icon' | 'name'>, level: number) {
    if (!def.category) return
    const power = player.talents[def.category]
    const actual = power >= 1.25 ? GIFTED : power <= 0.9 ? POOR : 1
    if (level === 1 && this.rng() >= 0.75) this.rng()
    const truthful = this.feelRng() < Math.min(1, 0.5 + (level - 1) * 0.1)
    const values = [GIFTED, 1, POOR]
    const sensed = truthful ? actual : values.filter((v) => v !== actual)[Math.floor(this.feelRng() * 2)]
    const text =
      sensed === GIFTED
        ? 'なんだか、しっくりくる…！'
        : sensed === POOR
          ? 'どうも向いていない気がする…'
          : 'まあ、ふつうかな。'
    this.log(`${def.icon} ${def.name}：${text}`, player.id)
  }
}
