/**
 * Invaders and raiders (DESIGN §11). Base numbers at 正規 difficulty; the sim scales them per difficulty.
 * Every attack has a visible wind-up (`windup` ≥ 0.35 s except contact bites of tiny crawlers).
 */
import type { SpeciesId } from './species'
import type { ItemId } from './items'

export const FOE_KINDS = [
  'tsubute',
  'harigane',
  'oagos',
  'kagerou',
  'kuitsukushi',
  'mitsume',
  'ashinaga',
  'korogashi',
  'tategami',
  'goutetsu',
  'kurozume'
] as const
export type FoeKind = (typeof FOE_KINDS)[number]

export type Faction = 'creature' | 'machine' | 'animal'

/** Attack ids shared by sim events, effects and sounds. */
export type FoeAttack =
  | 'bite'
  | 'leap'
  | 'acid'
  | 'charge'
  | 'dive'
  | 'laser'
  | 'mortar'
  | 'explode'
  | 'shieldDome'
  | 'slam'
  | 'acidRain'
  | 'summon'
  | 'missile'
  | 'sweep'
  | 'stomp'

export interface FoeAttackDef {
  id: FoeAttack
  damage: number
  /** Telegraph time before the hit/launch. */
  windup: number
  cooldown: number
  /** Distance at which the attack is started. */
  range: number
  radius?: number
  /** Projectile speed for ranged attacks. */
  speed?: number
  /** Number of projectiles or ticks. */
  count?: number
}

export interface FoeDef {
  id: FoeKind
  name: string
  faction: Faction
  hp: number
  speed: number
  radius: number
  height: number
  flying?: boolean
  /** Hover height for flyers. */
  hover?: [number, number]
  boss?: boolean
  attacks: FoeAttackDef[]
  /** Anima shards dropped: chance, count, anima per shard. */
  drop: { chance: number; count: number; amount: number }
  /** Damage multiplier for hits inside the front arc (brutes). */
  front?: { arc: number; factor: number }
  /** Weak point multiplier (back sac, open core). */
  weak?: number
  text: string
}

export const FOES: Record<FoeKind, FoeDef> = {
  tsubute: {
    id: 'tsubute',
    name: 'ツブテ',
    faction: 'creature',
    hp: 22,
    speed: 7,
    radius: 0.42,
    height: 0.7,
    attacks: [
      { id: 'bite', damage: 7, windup: 0.18, cooldown: 0.8, range: 1.2 },
      { id: 'leap', damage: 11, windup: 0.4, cooldown: 3.5, range: 6 }
    ],
    drop: { chance: 0.25, count: 1, amount: 3 },
    text: '六本脚の小型蝕獣。群れで押し寄せ、飛びかかってくる。'
  },
  harigane: {
    id: 'harigane',
    name: 'ハリガネ',
    faction: 'creature',
    hp: 54,
    speed: 4.5,
    radius: 0.5,
    height: 2.4,
    attacks: [{ id: 'acid', damage: 14, windup: 0.6, cooldown: 2.2, range: 26, radius: 2, speed: 20 }],
    drop: { chance: 1, count: 2, amount: 3 },
    text: '竹馬のような脚の射撃型。距離を取り、酸の塊を放物線で吐く。'
  },
  oagos: {
    id: 'oagos',
    name: 'オオアゴ',
    faction: 'creature',
    hp: 310,
    speed: 4,
    radius: 1.1,
    height: 2.4,
    attacks: [
      { id: 'charge', damage: 30, windup: 0.8, cooldown: 4.5, range: 16 },
      { id: 'bite', damage: 22, windup: 0.5, cooldown: 1.6, range: 2.4 }
    ],
    drop: { chance: 1, count: 6, amount: 4 },
    front: { arc: 90, factor: 0.4 },
    weak: 2,
    text: '巨大な顎の重装蝕獣。正面は硬い殻。背中の光る袋が弱点。'
  },
  kagerou: {
    id: 'kagerou',
    name: 'カゲロウ',
    faction: 'creature',
    hp: 36,
    speed: 9,
    radius: 0.5,
    height: 0.8,
    flying: true,
    hover: [5, 8],
    attacks: [{ id: 'dive', damage: 17, windup: 0.45, cooldown: 3, range: 14 }],
    drop: { chance: 1, count: 1, amount: 3 },
    text: '薄い翅の飛行蝕獣。不規則に飛び回り、急降下してくる。'
  },
  kuitsukushi: {
    id: 'kuitsukushi',
    name: 'クイツクシ',
    faction: 'creature',
    hp: 9500,
    speed: 0,
    radius: 4.5,
    height: 9,
    boss: true,
    attacks: [
      { id: 'slam', damage: 30, windup: 1.1, cooldown: 3.5, range: 18, radius: 3.5 },
      { id: 'acidRain', damage: 8, windup: 1.4, cooldown: 9, range: 40, radius: 2.5, count: 8 },
      { id: 'summon', damage: 0, windup: 1.2, cooldown: 15, range: 60, count: 5 }
    ],
    drop: { chance: 1, count: 40, amount: 3 },
    weak: 2,
    text: '大地に根を張る巨大な口の花。アニマを吸い上げ、群れを産み続ける。'
  },
  mitsume: {
    id: 'mitsume',
    name: 'ミツメ',
    faction: 'machine',
    hp: 42,
    speed: 8,
    radius: 0.55,
    height: 0.7,
    flying: true,
    hover: [3, 6],
    attacks: [{ id: 'laser', damage: 5, windup: 0.5, cooldown: 2.4, range: 30, speed: 70, count: 3 }],
    drop: { chance: 1, count: 1, amount: 3 },
    text: '三つ目の偵察機。横へ滑るように動きながら光線を三連射する。'
  },
  ashinaga: {
    id: 'ashinaga',
    name: 'アシナガ',
    faction: 'machine',
    hp: 215,
    speed: 3,
    radius: 1.2,
    height: 2.2,
    attacks: [{ id: 'mortar', damage: 30, windup: 0.9, cooldown: 3.8, range: 40, radius: 3, speed: 22 }],
    drop: { chance: 1, count: 5, amount: 4 },
    text: '四本脚の歩行砲台。ゆっくり歩き、高く弧を描くプラズマ弾を撃つ。'
  },
  korogashi: {
    id: 'korogashi',
    name: 'コロガシ',
    faction: 'machine',
    hp: 30,
    speed: 9,
    radius: 0.6,
    height: 1.2,
    attacks: [{ id: 'explode', damage: 40, windup: 0.6, cooldown: 99, range: 2.2, radius: 3 }],
    drop: { chance: 0.5, count: 2, amount: 3 },
    text: '転がる球体爆弾。近づくと点滅し、爆発する。壊すと半分の威力で誘爆。'
  },
  tategami: {
    id: 'tategami',
    name: 'タテガミ',
    faction: 'machine',
    hp: 170,
    speed: 3.5,
    radius: 1,
    height: 2,
    attacks: [{ id: 'shieldDome', damage: 0, windup: 1, cooldown: 0, range: 6, radius: 6 }],
    drop: { chance: 1, count: 4, amount: 4 },
    text: '盾を張る機体。周りの蝕機を外からの攻撃から守る。ドームの内側へ踏み込め。'
  },
  goutetsu: {
    id: 'goutetsu',
    name: 'ゴウテツ',
    faction: 'machine',
    hp: 7000,
    speed: 1.5,
    radius: 5,
    height: 12,
    boss: true,
    attacks: [
      { id: 'missile', damage: 18, windup: 1, cooldown: 7, range: 70, radius: 3, speed: 24, count: 8 },
      { id: 'sweep', damage: 26, windup: 1.3, cooldown: 9, range: 45 },
      { id: 'stomp', damage: 28, windup: 0.9, cooldown: 4, range: 9, radius: 6 }
    ],
    drop: { chance: 1, count: 40, amount: 3 },
    weak: 2.5,
    text: '海から歩いてくる要塞。4本の脚を壊すと膝をつき、胸の核がむき出しになる。'
  },
  kurozume: {
    id: 'kurozume',
    name: 'クロヅメ兵',
    faction: 'animal',
    hp: 90,
    speed: 1,
    radius: 0.38,
    height: 1.25,
    attacks: [],
    drop: { chance: 1, count: 4, amount: 4 },
    text: '北のクロヅメ連合の獣兵。こちらと同じアンティークで武装している。'
  }
}

/** Fixed loadout themes for クロヅメ animals: species + the antiques in each paw (passives are added by the sim). */
export const KUROZUME_SQUADS: { species: SpeciesId; r: ItemId[]; l: ItemId[] }[] = [
  { species: 'fox', r: ['wood'], l: ['frog'] },
  { species: 'bear', r: ['mammoth'], l: ['armadillo'] },
  { species: 'cat', r: ['claw'], l: ['bee'] },
  { species: 'shiba', r: ['puffer'], l: ['gecko'] },
  { species: 'owl', r: ['owl'], l: ['bee'] },
  { species: 'penguin', r: ['humming'], l: ['pillbug'] }
]

/** Difficulty multipliers (DESIGN §11). */
export const DIFFICULTIES = {
  easy: { name: '訓練', hp: 0.7, damage: 0.7, tickets: 8, peak: 60 },
  normal: { name: '正規', hp: 1, damage: 1, tickets: 4, peak: 90 },
  hard: { name: '決死', hp: 1.1, damage: 1.05, tickets: 3, peak: 120 }
} as const
export type Difficulty = keyof typeof DIFFICULTIES
