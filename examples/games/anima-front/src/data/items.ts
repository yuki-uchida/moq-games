/**
 * Antiques (DESIGN §6): the single source of truth for every number. Sim behaviours read `use`; ui shows `text`;
 * models and render use `motif` and `color`. Times are seconds, distances metres, angles degrees, speeds m/s.
 */

export const ITEM_IDS = [
  // melee
  'claw',
  'orca',
  'narwhal',
  'mammoth',
  'mantis',
  // ranged
  'bee',
  'wood',
  'humming',
  'puffer',
  'owl',
  'swallow',
  'pillbug',
  'eel',
  'hippo',
  // armour
  'turtle',
  'armadillo',
  'hedgehog',
  'jelly',
  // enhancements
  'fang',
  'hawk',
  'rhino',
  'sloth',
  'koala',
  'cheetah',
  'camel',
  // gadgets
  'frog',
  'gecko',
  'momonga',
  'leaf',
  'bat',
  'octopus',
  'pigeon',
  'hermit',
  'honeyant'
] as const
export type ItemId = (typeof ITEM_IDS)[number]

export type ItemCategory = 'melee' | 'ranged' | 'armor' | 'enhance' | 'gadget'

export const CATEGORY_NAMES: Record<ItemCategory, string> = {
  melee: '近接',
  ranged: '遠隔',
  armor: '防具',
  enhance: '強化',
  gadget: '小道具'
}

/** How an active antique behaves when its paw button is used. */
export type ItemUse =
  // --- melee ---
  /** Successive presses walk a combo; each hit is a sector test. */
  | { kind: 'combo'; damage: number; interval: number; reach: number; arc: number; hits: number; comboReset: number }
  /** One sector hit per press; `guard` when the button is held past `guardAfter`. */
  | {
      kind: 'slash'
      damage: number
      interval: number
      reach: number
      arc: number
      guard?: { after: number; arc: number; meleeBlock: number; rangedBlock: number; costPerHit: number }
    }
  /** Dashes `distance` forward over `duration`, damaging everything along the path once. */
  | { kind: 'lunge'; damage: number; distance: number; duration: number; width: number }
  /** Wind-up, then a radial slam around a point `reach` ahead. */
  | { kind: 'slam'; damage: number; windup: number; radius: number; reach: number; knockUp: number }
  // --- ranged ---
  /** One shot per press (held repeats at `interval`). */
  | {
      kind: 'semi'
      damage: number
      interval: number
      speed: number
      spread: number
      headMult: number
      range: number
    }
  /** Fires while held. Spread grows per shot and recovers when not firing. */
  | {
      kind: 'auto'
      damage: number
      rate: number
      speed: number
      spread: number
      spreadGrow: number
      spreadMax: number
      headMult: number
      range: number
    }
  /** Pellets in a cone; damage fades linearly to 30% at `range`. */
  | { kind: 'spread'; damage: number; pellets: number; interval: number; speed: number; cone: number; range: number }
  /** Hold to zoom; release fires. Sway settles over `steady`. */
  | {
      kind: 'zoom'
      damage: number
      interval: number
      speed: number
      headMult: number
      fov: number
      steady: number
      range: number
    }
  /** Hold to lock targets in a cone; release launches one homing dart per lock (or 1 straight dart). */
  | {
      kind: 'lock'
      damage: number
      maxLocks: number
      lockTime: number
      cone: number
      range: number
      speed: number
      turn: number
      interval: number
    }
  /** Lobbed bouncing grenade with a fuse; explodes on touching a foe. */
  | {
      kind: 'lob'
      damage: number
      radius: number
      speed: number
      fuse: number
      interval: number
      gravity: number
      bounce: number
    }
  /** Continuous hitscan while held (cost is `drain` per second). */
  | { kind: 'beam'; dps: number; range: number; chainRange: number; chainFactor: number; headMult: number }
  /** Hold to charge; releasing when full fires a slow explosive shell. */
  | { kind: 'charge'; damage: number; radius: number; charge: number; speed: number; gravity: number }
  // --- active armour ---
  | { kind: 'shield'; arc: number; blockCostFactor: number; moveFactor: number }
  // --- gadgets ---
  | { kind: 'pad'; range: number; launchUp: number; launchForward: number; life: number; max: number }
  | { kind: 'hook'; range: number; pull: number; maxTime: number }
  | { kind: 'cloak'; loseRange: number; revealAfterAttack: number }
  | { kind: 'pulse'; radius: number; duration: number }
  | { kind: 'throw'; radius: number; duration: number; speed: number; gravity: number }
  | { kind: 'decoy'; duration: number; speed: number }
  | { kind: 'wall'; range: number; width: number; height: number; hp: number; life: number; max: number }
  | { kind: 'jar'; radius: number; heal: number; duration: number }

/** What an equipped passive antique does (applied while online). */
export type ItemPassive =
  | { kind: 'armor'; reduce: number; speed: number }
  | { kind: 'reflect'; melee: number; contactDps: number }
  | { kind: 'negate'; every: number }
  | { kind: 'glide'; fall: number; forward: number }
  | {
      kind: 'mod'
      meleeDamage?: number
      meleeCost?: number
      rangedDamage?: number
      rangedCost?: number
      spread?: number
      armorEffect?: number
      armorUpkeep?: number
      cost?: number
      rate?: number
      regen?: number
      regenDelay?: number
      speed?: number
      dashCooldown?: number
      maxAnima?: number
    }

export interface ItemDef {
  id: ItemId
  /** Display name (Japanese). */
  name: string
  /** The animal it is shaped like (Japanese). */
  motif: string
  category: ItemCategory
  /** Active antiques go into a paw; passive ones work by being equipped. */
  active: boolean
  /** Catalogue description (Japanese, one or two short sentences). */
  text: string
  /** Accent colour (anima lines, projectiles, UI). */
  color: number
  /** Anima per use / per shot / per volley. */
  cost?: number
  /** Anima per second while held (beam, shield, cloak) or gliding. */
  drain?: number
  /** Anima per second while equipped and online (passives). */
  upkeep?: number
  /** Seconds between uses (in addition to the use's own interval). */
  cooldown?: number
  /** Maximum copies in one loadout (enhancements 3). Actives: once per paw. */
  stack: number
  use?: ItemUse
  passive?: ItemPassive
}

const melee = (d: Omit<ItemDef, 'category' | 'active' | 'stack'>): ItemDef => ({
  ...d,
  category: 'melee',
  active: true,
  stack: 1
})
const ranged = (d: Omit<ItemDef, 'category' | 'active' | 'stack'>): ItemDef => ({
  ...d,
  category: 'ranged',
  active: true,
  stack: 1
})
const gadget = (d: Omit<ItemDef, 'category' | 'stack'>): ItemDef => ({ ...d, category: 'gadget', stack: 1 })
const enhance = (d: Omit<ItemDef, 'category' | 'active' | 'stack'>): ItemDef => ({
  ...d,
  category: 'enhance',
  active: false,
  stack: 3
})

export const ITEMS: Record<ItemId, ItemDef> = {
  claw: melee({
    id: 'claw',
    name: 'ネコノツメ',
    motif: 'ネコ',
    text: '肉球つきの爪で三連撃。安くて速いが、懐に入る勇気がいる。',
    color: 0xff8fb1,
    cost: 0.3,
    use: { kind: 'combo', damage: 12, interval: 0.26, reach: 1.9, arc: 100, hits: 3, comboReset: 0.6 }
  }),
  orca: melee({
    id: 'orca',
    name: 'シャチマル',
    motif: 'シャチ',
    text: 'シャチの形の刀。長押しで構えて防御できる万能の一振り。',
    color: 0x4fc3f7,
    cost: 0.8,
    use: {
      kind: 'slash',
      damage: 26,
      interval: 0.5,
      reach: 2.6,
      arc: 120,
      guard: { after: 0.22, arc: 100, meleeBlock: 1, rangedBlock: 0.6, costPerHit: 0.3 }
    }
  }),
  narwhal: melee({
    id: 'narwhal',
    name: 'イッカク',
    motif: 'イッカク',
    text: 'ツノの槍で7m突進し、通り道の敵をまとめて貫く。',
    color: 0x9fe7ff,
    cost: 2.2,
    cooldown: 1.2,
    use: { kind: 'lunge', damage: 36, distance: 7, duration: 0.28, width: 1.2 }
  }),
  mammoth: melee({
    id: 'mammoth',
    name: 'マンモス',
    motif: 'マンモス',
    text: '鼻と牙のハンマー。振りかぶって叩きつけ、周りの敵を打ち上げる。',
    color: 0xffb74d,
    cost: 3.5,
    cooldown: 1.1,
    use: { kind: 'slam', damage: 48, windup: 0.35, radius: 3.5, reach: 1.6, knockUp: 7 }
  }),
  mantis: melee({
    id: 'mantis',
    name: 'カマキリ',
    motif: 'カマキリ',
    text: '大鎌で前方を広く薙ぎ払う。群れを相手にする時に頼もしい。',
    color: 0x9ccc65,
    cost: 1.2,
    use: { kind: 'slash', damage: 22, interval: 0.6, reach: 3.0, arc: 160 }
  }),

  bee: ranged({
    id: 'bee',
    name: 'ミツバチ',
    motif: 'ミツバチ',
    text: 'ハチの拳銃。一発の威力は小さいが、ほとんどアニマを使わない。',
    color: 0xffd54f,
    cost: 0.15,
    use: { kind: 'semi', damage: 10, interval: 0.18, speed: 140, spread: 0.6, headMult: 1.5, range: 90 }
  }),
  wood: ranged({
    id: 'wood',
    name: 'キツツキ',
    motif: 'キツツキ',
    text: 'キツツキの連射銃。撃ち続けるほど弾がばらける。',
    color: 0xef5350,
    cost: 0.35,
    use: {
      kind: 'auto',
      damage: 7,
      rate: 9,
      speed: 160,
      spread: 1.2,
      spreadGrow: 0.25,
      spreadMax: 3,
      headMult: 1.5,
      range: 110
    }
  }),
  humming: ranged({
    id: 'humming',
    name: 'ハチドリ',
    motif: 'ハチドリ',
    text: '小さなハチドリの機関銃。近距離で弾をばらまく。',
    color: 0x26c6da,
    cost: 0.22,
    use: {
      kind: 'auto',
      damage: 4.5,
      rate: 14,
      speed: 130,
      spread: 2.5,
      spreadGrow: 0.1,
      spreadMax: 4,
      headMult: 1.5,
      range: 60
    }
  }),
  puffer: ranged({
    id: 'puffer',
    name: 'フグ',
    motif: 'フグ',
    text: 'ふくらむフグの散弾銃。至近距離なら一撃が重い。',
    color: 0xffca28,
    cost: 1.8,
    use: { kind: 'spread', damage: 6, pellets: 9, interval: 0.8, speed: 90, cone: 7, range: 25 }
  }),
  owl: ranged({
    id: 'owl',
    name: 'フクロウアイ',
    motif: 'フクロウ',
    text: '長押しで覗き、離して撃つ狙撃銃。頭を狙えば大きな一撃。',
    color: 0xb39ddb,
    cost: 5,
    use: { kind: 'zoom', damage: 65, interval: 1.2, speed: 400, headMult: 1.8, fov: 24, steady: 0.35, range: 260 }
  }),
  swallow: ranged({
    id: 'swallow',
    name: 'ツバメ',
    motif: 'ツバメ',
    text: '長押しで最大4体を捉え、離すと追尾するツバメを放つ。',
    color: 0x5c6bc0,
    cost: 4.5,
    use: {
      kind: 'lock',
      damage: 15,
      maxLocks: 4,
      lockTime: 0.3,
      cone: 12,
      range: 60,
      speed: 34,
      turn: 6,
      interval: 0.9
    }
  }),
  pillbug: ranged({
    id: 'pillbug',
    name: 'ダンゴムシ',
    motif: 'ダンゴムシ',
    text: '丸まったダンゴムシを放り投げる。跳ねて転がり、まとめて吹き飛ばす。',
    color: 0x8d6e63,
    cost: 3.5,
    use: { kind: 'lob', damage: 50, radius: 4, speed: 22, fuse: 1.4, interval: 0.9, gravity: 20, bounce: 0.45 }
  }),
  eel: ranged({
    id: 'eel',
    name: 'デンキウナギ',
    motif: 'デンキウナギ',
    text: '撃っている間ずっと電撃を流す。強力だがアニマをみるみる消費する。',
    color: 0x7cf9ff,
    drain: 6,
    use: { kind: 'beam', dps: 55, range: 35, chainRange: 4, chainFactor: 0.5, headMult: 1.25 }
  }),
  hippo: ranged({
    id: 'hippo',
    name: 'カバキャノン',
    motif: 'カバ',
    text: '大きな口から砲弾を撃つ。溜めて放つ一撃は最大火力、そして最大消費。',
    color: 0xba68c8,
    cost: 11,
    cooldown: 2,
    use: { kind: 'charge', damage: 100, radius: 5, charge: 0.8, speed: 60, gravity: 9 }
  }),

  turtle: {
    id: 'turtle',
    name: 'カメノコウラ',
    motif: 'カメ',
    category: 'armor',
    active: false,
    stack: 1,
    text: '背中の甲羅が受けるダメージを25%減らす。少し重い。',
    color: 0x66bb6a,
    upkeep: 0.4,
    passive: { kind: 'armor', reduce: 0.25, speed: -0.04 }
  },
  armadillo: {
    id: 'armadillo',
    name: 'アルマジロ',
    motif: 'アルマジロ',
    category: 'armor',
    active: true,
    stack: 1,
    text: '長押しで丸まったアルマジロの盾を構える。正面の攻撃をすべて防ぐ。',
    color: 0xa1887f,
    drain: 0.4,
    use: { kind: 'shield', arc: 120, blockCostFactor: 0.3, moveFactor: 0.7 }
  },
  hedgehog: {
    id: 'hedgehog',
    name: 'ハリネズミ',
    motif: 'ハリネズミ',
    category: 'armor',
    active: false,
    stack: 1,
    text: '背中の針が、殴りかかってきた敵にダメージの半分を返す。',
    color: 0xbcaaa4,
    upkeep: 0.25,
    passive: { kind: 'reflect', melee: 0.5, contactDps: 8 }
  },
  jelly: {
    id: 'jelly',
    name: 'クラゲヴェール',
    motif: 'クラゲ',
    category: 'armor',
    active: false,
    stack: 1,
    text: '5秒ごとに一度だけ、攻撃をクラゲの泡が完全に受け止める。',
    color: 0xf48fb1,
    upkeep: 0.35,
    passive: { kind: 'negate', every: 5 }
  },

  fang: enhance({
    id: 'fang',
    name: 'キバ',
    motif: 'オオカミのキバ',
    text: '近接ダメージ+15%。近接の消費+10%。',
    color: 0xe57373,
    passive: { kind: 'mod', meleeDamage: 0.15, meleeCost: 0.1 }
  }),
  hawk: enhance({
    id: 'hawk',
    name: 'タカノメ',
    motif: 'タカ',
    text: '遠隔ダメージ+12%、ばらつき-15%。遠隔の消費+10%。',
    color: 0xffb300,
    passive: { kind: 'mod', rangedDamage: 0.12, spread: -0.15, rangedCost: 0.1 }
  }),
  rhino: enhance({
    id: 'rhino',
    name: 'サイノカワ',
    motif: 'サイ',
    text: '防具の効果+30%。防具の維持消費+25%。',
    color: 0x90a4ae,
    passive: { kind: 'mod', armorEffect: 0.3, armorUpkeep: 0.25 }
  }),
  sloth: enhance({
    id: 'sloth',
    name: 'ナマケモノ',
    motif: 'ナマケモノ',
    text: 'すべての消費と維持-10%。攻撃の速さ-6%。',
    color: 0xa5d6a7,
    passive: { kind: 'mod', cost: -0.1, rate: -0.06 }
  }),
  koala: enhance({
    id: 'koala',
    name: 'コアラ',
    motif: 'コアラ',
    text: 'アニマの自然回復+0.8/秒、回復が始まるまで-1秒。',
    color: 0xb0bec5,
    passive: { kind: 'mod', regen: 0.8, regenDelay: -1 }
  }),
  cheetah: enhance({
    id: 'cheetah',
    name: 'チーター',
    motif: 'チーター',
    text: '移動速度+5%、ダッシュの再使用-15%。',
    color: 0xffd180,
    passive: { kind: 'mod', speed: 0.05, dashCooldown: -0.15 }
  }),
  camel: enhance({
    id: 'camel',
    name: 'ラクダ',
    motif: 'ラクダのこぶ',
    text: '最大アニマ+12。自然回復-0.2/秒。',
    color: 0xd7b98e,
    passive: { kind: 'mod', maxAnima: 12, regen: -0.2 }
  }),

  frog: gadget({
    id: 'frog',
    name: 'カエルパッド',
    motif: 'カエル',
    active: true,
    text: '狙った床にカエルを置く。踏むと高く跳ね上げてくれる。味方も使える。',
    color: 0x7bd84a,
    cost: 3,
    use: { kind: 'pad', range: 15, launchUp: 13, launchForward: 6, life: 20, max: 2 }
  }),
  gecko: gadget({
    id: 'gecko',
    name: 'ヤモリフック',
    motif: 'ヤモリ',
    active: true,
    text: 'ヤモリの吸盤を撃ち込み、そこまで一気に引き寄せる。',
    color: 0x80deea,
    cost: 2.5,
    cooldown: 1,
    use: { kind: 'hook', range: 35, pull: 26, maxTime: 1.8 }
  }),
  momonga: gadget({
    id: 'momonga',
    name: 'モモンガ',
    motif: 'モモンガ',
    active: false,
    text: '落下中にジャンプ長押しで滑空する。滑空中だけアニマを使う。',
    color: 0xce93d8,
    drain: 1.2,
    passive: { kind: 'glide', fall: 2.2, forward: 10 }
  }),
  leaf: gadget({
    id: 'leaf',
    name: 'コノハムシ',
    motif: 'コノハムシ',
    active: true,
    text: '押すたびに迷彩を切り替える。5m以上離れた敵から見えなくなる。',
    color: 0xaed581,
    drain: 2.5,
    use: { kind: 'cloak', loseRange: 5, revealAfterAttack: 1 }
  }),
  bat: gadget({
    id: 'bat',
    name: 'コウモリ',
    motif: 'コウモリ',
    active: true,
    text: '音波を放ち、50m以内の敵を6秒間、壁越しに味方全員へ知らせる。',
    color: 0x7e57c2,
    cost: 4,
    cooldown: 8,
    use: { kind: 'pulse', radius: 50, duration: 6 }
  }),
  octopus: gadget({
    id: 'octopus',
    name: 'タコスミ',
    motif: 'タコ',
    active: true,
    text: 'スミ玉を投げ、8秒間視界をさえぎる煙幕を張る。',
    color: 0x5d4e75,
    cost: 3,
    cooldown: 2,
    use: { kind: 'throw', radius: 6, duration: 8, speed: 18, gravity: 20 }
  }),
  pigeon: gadget({
    id: 'pigeon',
    name: 'ハトポッポ',
    motif: 'ハト',
    active: true,
    text: '自分そっくりの幻を前へ走らせ、6秒間敵の注意を引きつける。',
    color: 0xb0bec5,
    cost: 4,
    cooldown: 6,
    use: { kind: 'decoy', duration: 6, speed: 6 }
  }),
  hermit: gadget({
    id: 'hermit',
    name: 'ヤドカリ',
    motif: 'ヤドカリ',
    active: true,
    text: '狙った場所に貝殻の壁を建てる。味方の弾は通り抜ける。',
    color: 0xff8a65,
    cost: 6,
    use: { kind: 'wall', range: 10, width: 4, height: 2.5, hp: 250, life: 25, max: 1 }
  }),
  honeyant: gadget({
    id: 'honeyant',
    name: 'ミツツボアリ',
    motif: 'ミツツボアリ',
    active: true,
    text: '蜜壺を置き、周りの味方のアニマを8秒間回復する。',
    color: 0xffb74d,
    cost: 9,
    cooldown: 15,
    use: { kind: 'jar', radius: 4.5, heal: 4, duration: 8 }
  })
}

export const isWeapon = (id: ItemId) => ITEMS[id].category === 'melee' || ITEMS[id].category === 'ranged'
