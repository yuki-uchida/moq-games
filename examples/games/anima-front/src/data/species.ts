/**
 * Playable animals (DESIGN §4). Pure data shared by sim, models, render and ui.
 * Heights and radii are metres; `anima` is the species' maximum anima before enhancements.
 */

export const SPECIES_IDS = ['shiba', 'cat', 'rabbit', 'bear', 'fox', 'penguin', 'hamster', 'owl'] as const
export type SpeciesId = (typeof SPECIES_IDS)[number]

export type TraitId =
  | 'eager'
  | 'doubleJump'
  | 'bigJump'
  | 'strong'
  | 'leafDecoy'
  | 'bellySlide'
  | 'cheekPouch'
  | 'glide'

export interface SpeciesDef {
  id: SpeciesId
  /** Species name, e.g. 柴犬. */
  kind: string
  /** The ARK member's name, e.g. ハヤテ. */
  name: string
  anima: number
  /** Multipliers of the base ground speed and jump velocity² (height). */
  speed: number
  jump: number
  /** Body height (feet → top of head, ears excluded) and capsule radius. */
  height: number
  radius: number
  /** Head hit sphere radius; centre at height − headRadius. */
  headRadius: number
  trait: TraitId
  traitName: string
  /** One line for menus. */
  traitText: string
  /** Character line for the codex. */
  profile: string
  /** UI accent colour (fur base colour). */
  color: number
  /** Default preset id (src/data/presets.ts). */
  preset: string
}

const head = (height: number, k = 0.2) => Math.round(height * k * 1000) / 1000

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  shiba: {
    id: 'shiba',
    kind: '柴犬',
    name: 'ハヤテ',
    anima: 100,
    speed: 1.0,
    jump: 1.0,
    height: 1.25,
    radius: 0.38,
    headRadius: head(1.25),
    trait: 'eager',
    traitName: '勇み足',
    traitText: 'ダッシュの再使用が30%早い',
    profile: '第七小隊の隊長。まっすぐで責任感が強く、誰よりも先に前へ出る。好物は干し芋。',
    color: 0xd9874a,
    preset: 'attacker'
  },
  cat: {
    id: 'cat',
    kind: '三毛猫',
    name: 'ミケ',
    anima: 85,
    speed: 1.06,
    jump: 1.05,
    height: 1.15,
    radius: 0.34,
    headRadius: head(1.15),
    trait: 'doubleJump',
    traitName: '二段跳び',
    traitText: '空中でもう一度ジャンプできる',
    profile: '身軽な切り込み役。からかい好きだが、仲間の背中は必ず守る。高い所が落ち着く。',
    color: 0xf0ebe0,
    preset: 'skirmisher'
  },
  rabbit: {
    id: 'rabbit',
    kind: 'ウサギ',
    name: 'ユキ',
    anima: 80,
    speed: 1.04,
    jump: 1.35,
    height: 1.2,
    radius: 0.34,
    headRadius: head(1.2),
    trait: 'bigJump',
    traitName: '大跳躍',
    traitText: 'ジャンプが1.35倍高く、着地で減速しない',
    profile: '無口な狙撃手。長い耳で風を読む。人見知りだが、照準の先だけは迷わない。',
    color: 0xf7f4f2,
    preset: 'sniper'
  },
  bear: {
    id: 'bear',
    kind: 'ヒグマ',
    name: 'ゴウ',
    anima: 140,
    speed: 0.9,
    jump: 0.92,
    height: 1.65,
    radius: 0.5,
    headRadius: head(1.65),
    trait: 'strong',
    traitName: '剛力',
    traitText: '近接ダメージ+20%、ノックバックを60%軽減',
    profile: '小隊の盾。大きな体に優しい心。崩れた街で拾った植物を、基地の屋上で育てている。',
    color: 0x6b4430,
    preset: 'tank'
  },
  fox: {
    id: 'fox',
    kind: 'キツネ',
    name: 'コノハ',
    anima: 90,
    speed: 1.04,
    jump: 1.0,
    height: 1.2,
    radius: 0.35,
    headRadius: head(1.2),
    trait: 'leafDecoy',
    traitName: '化け葉',
    traitText: 'ダッシュした場所に1.5秒間、敵が狙う木の葉の身代わりを残す',
    profile: 'いたずら好きの遊撃手。化かし合いなら誰にも負けない。本当は寂しがり屋。',
    color: 0xe8792e,
    preset: 'skirmisher'
  },
  penguin: {
    id: 'penguin',
    kind: 'ペンギン',
    name: 'ペンタ',
    anima: 115,
    speed: 0.94,
    jump: 0.9,
    height: 1.15,
    radius: 0.4,
    headRadius: head(1.15),
    trait: 'bellySlide',
    traitName: '腹すべり',
    traitText: 'ダッシュが長い腹すべりになり、アニマを使わない',
    profile: '規律を重んじる射撃手。教本は全部暗記している。氷の上の腹すべりが唯一の趣味。',
    color: 0x2b2f3a,
    preset: 'gunner'
  },
  hamster: {
    id: 'hamster',
    kind: 'ハムスター',
    name: 'モチ',
    anima: 70,
    speed: 1.0,
    jump: 1.05,
    height: 0.85,
    radius: 0.3,
    headRadius: head(0.85, 0.22),
    trait: 'cheekPouch',
    traitName: 'ほお袋',
    traitText: 'アニマ片の回収量1.5倍。小さくて当たりにくい',
    profile: '補給と支援の担当。いつも何かを頬張っている。誰とでもすぐ友だちになる。',
    color: 0xf2b45a,
    preset: 'support'
  },
  owl: {
    id: 'owl',
    kind: 'フクロウ',
    name: 'ソラ',
    anima: 85,
    speed: 0.98,
    jump: 1.0,
    height: 1.15,
    radius: 0.36,
    headRadius: head(1.15),
    trait: 'glide',
    traitName: '夜目',
    traitText: '空中でジャンプ長押しで滑空（アニマ不要）。ズームの揺れ半減',
    profile: '夜の見張り番。物静かで博識。人類の古い本を読み解くのが日課。',
    color: 0x8a7560,
    preset: 'sniper'
  }
}

/** Base ground speed (m/s) before species and modifiers. */
export const BASE_SPEED = 6.8
/** Base jump velocity (m/s); species `jump` multiplies the height, so velocity × √jump. */
export const BASE_JUMP_VELOCITY = 11.5
/** Gravity (m/s²). */
export const GRAVITY = 26

/** Eye height used as the aim pivot height (DESIGN §9). */
export const eyeHeight = (s: SpeciesDef) => s.height - s.headRadius
/** Lateral offset of the aim pivot (to the right, × shoulder side). */
export const shoulderOffset = (s: SpeciesDef) => 0.45 + s.radius
