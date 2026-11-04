// Battle rules. The poop tower (player, side 1) stands on the right and its army marches left;
// the enemy fort stands on the left and its cleaners, toilets, food and medicine march right.
export const HOME_X = 945
export const ENEMY_X = 55

/** Purchasable poop units. Stats are level-1 values; `price` is in 🧻 and `unlock` is the number of cleared stages needed. */
export const POOPS = [
  {
    key: 'katachi',
    name: 'カチカチうんこ',
    cost: 35,
    hp: 150,
    atk: 22,
    range: 32,
    speed: 27,
    period: 1.05,
    cooldown: 2.5,
    price: 0,
    unlock: 0,
    line: '盾と兜の前衛。安くて硬い'
  },
  {
    key: 'korokoro',
    name: 'コロコロうんこ',
    cost: 65,
    hp: 85,
    atk: 26,
    range: 160,
    speed: 24,
    period: 1.45,
    cooldown: 4,
    price: 0,
    unlock: 0,
    line: '丸いつぶてを遠くから投げる'
  },
  {
    key: 'geri',
    name: 'ゲリラうんこ',
    cost: 95,
    hp: 240,
    atk: 32,
    range: 38,
    speed: 46,
    period: 0.85,
    cooldown: 6,
    price: 150,
    unlock: 1,
    line: '速くて重い突撃役'
  },
  {
    key: 'bichi',
    name: 'ビチビチうんこ',
    cost: 120,
    hp: 130,
    atk: 26,
    range: 140,
    speed: 26,
    period: 1.6,
    cooldown: 7,
    price: 400,
    unlock: 5,
    line: '飛び散るしぶきで群れを巻き込む'
  },
  {
    key: 'dodeka',
    name: 'ドデカうんこ',
    cost: 160,
    hp: 720,
    atk: 30,
    range: 40,
    speed: 18,
    period: 1.4,
    cooldown: 12,
    price: 700,
    unlock: 10,
    line: '腹巻きの巨体で押し返す壁'
  },
  {
    key: 'daiou',
    name: '宿便大王',
    cost: 240,
    hp: 560,
    atk: 80,
    range: 45,
    speed: 22,
    period: 1.5,
    cooldown: 16,
    price: 1100,
    unlock: 16,
    line: '溜めこんだ王の一撃'
  }
]

/** Special units: things that upset the stomach. Strong at first and grow with the campaign. */
export const SPECIALS = [
  {
    key: 'aircon',
    name: '冷房',
    cost: 125,
    hp: 240,
    atk: 31,
    range: 170,
    speed: 22,
    period: 1.5,
    cooldown: 10,
    line: 'お腹を冷やす冷風で敵の足を鈍らせる'
  },
  {
    key: 'ramen',
    name: 'ラーメン',
    cost: 116,
    hp: 500,
    atk: 56,
    range: 36,
    speed: 30,
    period: 0.95,
    cooldown: 10,
    line: '背脂こってり。前線を支える万能型'
  },
  {
    key: 'yofukashi',
    name: '夜ふかし',
    cost: 130,
    hp: 400,
    atk: 40,
    range: 34,
    speed: 52,
    period: 0.525,
    cooldown: 7,
    crit: 0.3125,
    line: '寝不足の暴走。素早い連打と会心'
  },
  {
    key: 'sake',
    name: 'お酒',
    cost: 115,
    hp: 240,
    atk: 45,
    range: 165,
    speed: 24,
    period: 1.4,
    cooldown: 10,
    crit: 0.3,
    line: '酔いが回ると会心の大ダメージ'
  },
  {
    key: 'jiro',
    name: '二郎系ラーメン',
    cost: 270,
    hp: 1850,
    atk: 92,
    range: 44,
    speed: 16,
    period: 1.6,
    cooldown: 20,
    line: 'ヤサイマシマシ。超重量級'
  },
  {
    key: 'yakiniku',
    name: '焼肉',
    cost: 225,
    hp: 700,
    atk: 51,
    range: 40,
    speed: 26,
    period: 1.31,
    cooldown: 15,
    line: '脂がはねて周りも巻き込む'
  },
  {
    key: 'garlic',
    name: 'ニンニク',
    cost: 195,
    hp: 240,
    atk: 40,
    range: 150,
    speed: 24,
    period: 1.55,
    cooldown: 11,
    line: '強烈なにおいで群れごと攻撃'
  },
  {
    key: 'curry',
    name: '激辛カレー',
    cost: 190,
    hp: 430,
    atk: 105,
    range: 38,
    speed: 30,
    period: 1.52,
    cooldown: 16.25,
    line: '一撃が重い、辛さの暴力'
  },
  {
    key: 'milk',
    name: '牛乳',
    cost: 140,
    hp: 650,
    atk: 42.5,
    range: 36,
    speed: 28,
    period: 1.1,
    cooldown: 11.25,
    line: 'ゴロゴロ押し返す'
  },
  {
    key: 'oyster',
    name: '生ガキ',
    cost: 175,
    hp: 375,
    atk: 170,
    range: 40,
    speed: 34,
    period: 1.5,
    cooldown: 18.75,
    crit: 0.225,
    line: '当たると危険。一発逆転'
  },
  {
    key: 'ice',
    name: 'アイスの食べすぎ',
    cost: 85,
    hp: 425,
    atk: 45,
    range: 34,
    speed: 32,
    period: 0.75,
    cooldown: 10,
    line: 'キーンと冷やして足止め'
  },
  {
    key: 'energy',
    name: 'エナジードリンク',
    cost: 130,
    hp: 300,
    atk: 24,
    range: 150,
    speed: 30,
    period: 0.55,
    cooldown: 12.5,
    line: 'カフェインで超連射'
  }
].map((t) => ({ ...t, special: true }))

/** The cleanup crew: everything that wants the poop flushed, cleaned up or settled. */
export const ENEMIES = [
  { key: 'cleaner', name: '清掃員', hp: 150, atk: 18, range: 32, speed: 28, period: 1, exp: 10 },
  { key: 'yogurt', name: 'ヨーグルト', hp: 90, atk: 14, range: 30, speed: 50, period: 0.8, exp: 8 },
  { key: 'sayu', name: '白湯', hp: 80, atk: 26, range: 150, speed: 24, period: 1.4, exp: 10 },
  { key: 'washiki', name: '和式便器', hp: 480, atk: 22, range: 34, speed: 17, period: 1.3, exp: 18 },
  { key: 'mop', name: 'モップのおばちゃん', hp: 280, atk: 26, range: 38, speed: 26, period: 1.2, exp: 16 },
  { key: 'yoshiki', name: '洋式便器', hp: 300, atk: 30, range: 170, speed: 18, period: 1.7, exp: 20 },
  { key: 'seichou', name: '整腸剤', hp: 130, atk: 28, range: 150, speed: 26, period: 1.5, exp: 14 },
  { key: 'geridome', name: '下痢止め', hp: 760, atk: 48, range: 42, speed: 15, period: 1.6, exp: 50 }
]
// Attack geometry and mechanics are shared by cards and summoned units.
const MECHANICS = {
  katachi: ['single', 'カチカチ装甲', '盾で受けて、受けるダメージを減らす。', { armor: true }],
  korokoro: ['bounce', '跳弾', '当たったつぶてが奥の敵へ転がって二撃目。'],
  geri: [
    'band',
    'ゲリラ奇襲',
    '歩いて来た最初の一撃が2倍になり、敵を押し返す。',
    { extra: 25, multipliers: [1, 0.6], ambush: true, ambushMultiplier: 2, ambushKnockback: 24 }
  ],
  bichi: [
    'circle',
    'ぬかるみ',
    '着弾点にぬかるみを作り、敵の足を遅くする。',
    { radius: 60, zone: 'mud', zoneDuration: 3, zoneInterval: 0.5 }
  ],
  dodeka: [
    'band',
    '押し返し',
    '前方の3体をまとめて押し返す。押されず、浮かない。',
    { extra: 30, multipliers: [1, 1, 1], knockback: 18, heavy: true, immovable: true }
  ],
  daiou: [
    'shockwave',
    '大王の号令',
    '叩きつけるたび、周りの味方の攻撃を速める。',
    { multipliers: [1, 0.8, 0.8, 0.8], rallyEffect: true, heavy: true }
  ],
  aircon: [
    'cone',
    '鈍足',
    '冷風で前方3体の足を鈍らせる。',
    { multipliers: [1, 0.8, 0.6], slowEffect: 2.5, slowFactor: 0.5 }
  ],
  ramen: ['single', '背脂ドレイン', '与えたダメージで体力を回復する。', { drain: 0.35 }],
  yofukashi: ['single', '眠気', '当てた敵を眠くして攻撃を遅らせる。会心あり。', { drowsyEffect: 3.125 }],
  sake: ['single', '千鳥足', '会心で敵を千鳥足にして後退させる。', { confuse: 1.2 }],
  jiro: ['ring', '打ち上げ', '地響きで周りの敵を打ち上げる。', { launch: 0.6, heavy: true }],
  yakiniku: [
    'circle',
    'やけど',
    '当たった敵全員をやけどさせる。',
    { radius: 45, burnEffect: 2, burnInterval: 0.5, burnDamage: 0.125 }
  ],
  garlic: [
    'circle',
    '悪臭',
    '着弾点に悪臭を残し、中の敵を削り続ける。',
    { radius: 70, zone: 'stench', zoneDuration: 3, zoneRadius: 60, zoneInterval: 0.5, zoneDamage: 0.12 }
  ],
  curry: [
    'single',
    '激辛マーク',
    '少し後に爆発する激辛マークを付ける。',
    { mark: 1.5, markRadius: 40, markDamage: 0.625 }
  ],
  milk: [
    'single',
    '玉突き',
    '押し飛ばした敵を後ろの敵にぶつける。',
    { knockback: 37.5, collision: 30, collisionDamage: 0.625, collisionPush: 15 }
  ],
  oyster: [
    'single',
    '食あたり',
    '重なる毒を与える。会心あり。',
    { poisonEffect: 5, poisonInterval: 1, poisonDamage: 0.125, poisonStacks: 3 }
  ],
  ice: ['single', '凍結', 'ときどき敵を凍らせて止める。', { freeze: 1, freezeChance: 0.375 }],
  energy: ['single', 'カフェイン加速', '同じ敵へ撃ち続けるほど連射が速くなる。', { caffeine: true }],
  cleaner: ['single', '掃き寄せ', 'うんこを手前へ引き寄せる。', { pull: 14 }],
  yogurt: ['single', '防御ダウン', '酸っぱさでうんこの防御を下げる。', { vulnerable: 3 }],
  sayu: ['single', '攻撃ダウン', 'ぽかぽかでうんこの攻撃力を下げる。', { weaken: 3 }],
  washiki: ['single', '流す', '弱ったうんこを流して倒す。', { execute: 0.2, executeHeavy: 0.1, heavy: true }],
  mop: [
    'band',
    '濡れ床',
    '前方3体をなぎ払い、濡れ床で滑らせる。',
    { extra: 30, multipliers: [1, 1, 1], zone: 'wet', zoneDuration: 3, zoneRadius: 45, zoneInterval: 0.5, zonePush: 6 }
  ],
  yoshiki: ['pierce', '水圧', '水流で3体を貫き、押し戻す。', { multipliers: [1, 0.75, 0.5], knockback: 15 }],
  seichou: ['circle', '整腸ヒール', '着弾点の仲間を回復する。', { radius: 45, heal: 0.0625 }],
  geridome: ['circle', 'スタン', '周りのうんこを少しの間止める。', { radius: 40, stun: 0.7, heavy: true }]
}
/** Short area label for menus, e.g. 「近接・前方3体」 or 「遠距離160・跳弾2体」. */
const AREA_LABELS = {
  single: () => '単体',
  bounce: () => '跳弾2体',
  band: (m) => `前方${m.multipliers.length}体`,
  circle: () => '着弾範囲',
  cone: () => '冷風3体',
  pierce: () => '貫通3体',
  shockwave: () => '衝撃波4体',
  ring: () => '周囲5体'
}
for (const unit of [...POOPS, ...SPECIALS, ...ENEMIES]) {
  const [areaKind, effect, effectLine, mechanics = {}] = MECHANICS[unit.key]
  const reach = unit.range > 80 ? `遠距離${unit.range}` : '近接'
  const area = `${reach}・${AREA_LABELS[areaKind](mechanics)}`
  Object.assign(unit, mechanics, { areaKind, area, effect, effectLine })
}
const TYPES = new Map([...POOPS, ...SPECIALS, ...ENEMIES].map((t) => [t.key, t]))
export const typeOf = (key) => TYPES.get(key)

const AREAS = [
  {
    name: '公園のトイレ',
    color: '#9fd3d8',
    base: [0, 0, 1],
    extra: [2, 0, 1, 2, 0, 2],
    stages: [
      '入口の手洗い場',
      'ベンチ裏の個室',
      '砂場わきの公衆トイレ',
      '噴水広場',
      '夕暮れの多目的トイレ',
      '管理事務所の清掃本部'
    ],
    hint: '清掃員とヨーグルトが相手。カチカチで守りコロコロで削ろう'
  },
  {
    name: '駅ナカトイレ',
    color: '#c4bde6',
    base: [0, 1, 2],
    extra: [3, 0, 4, 1, 3, 4],
    stages: ['改札前', '乗り換え通路', 'ホーム端の個室', '駅ビル地下', '終電前の大混雑', '駅長室の奥'],
    hint: '和式便器の壁とモップのおばちゃん。範囲攻撃に気をつけて'
  },
  {
    name: '学校のトイレ',
    color: '#bfe0b0',
    base: [0, 2, 3],
    extra: [4, 5, 1, 3, 5, 4],
    stages: ['昇降口', '体育館裏', '理科室前', '音楽室前', '放課後の校舎', '職員トイレ'],
    hint: '洋式便器のウォシュレットが押し戻してくる。突撃役で距離を詰めよう'
  },
  {
    name: '病院のトイレ',
    color: '#e3d3ee',
    base: [0, 1, 4],
    extra: [5, 6, 3, 6, 5, 7],
    stages: ['外来ロビー', '検査室前', '薬局カウンター', '真夜中の病棟', '手術室前', '院長室の奥'],
    hint: '整腸剤と下痢止めの薬軍団。育てたうんこと特殊ユニットで押し切ろう'
  },
  {
    name: '黄金の便器城',
    color: '#e8cf86',
    base: [0, 3, 4, 5],
    extra: [6, 7, 1, 5, 6, 7],
    stages: ['城門', '泡の堀', '水洗回廊', 'ウォシュレット塔', '玉座の間', '黄金の便器'],
    hint: '全勢力が集う最終決戦。編成と育成のすべてをぶつけよう'
  }
]
const ENEMY_HP = (i) => 5500 + 400 * i
const INTERVAL = (i) => 5 - 0.05 * i
const FLOOR = (i) => Math.max(1.8, 3.4 - 0.05 * i)
const POWER = (i) => 0.9 + 0.07 * i
export const STAGES = AREAS.flatMap((area, a) =>
  area.stages.map((sub, pos) => {
    const i = a * 6 + pos
    return {
      name: `${area.name} ${pos + 1}`,
      sub,
      area: a,
      hint: area.hint,
      color: area.color,
      enemy: ENEMY_HP(i),
      home: 1400 + 80 * i,
      gold: 100 + 5 * i,
      income: 9,
      interval: INTERVAL(i),
      floor: FLOOR(i),
      reward: 10 + i,
      power: POWER(i),
      pattern: [...area.base, ...area.extra.slice(0, pos)]
    }
  })
)

/** Seeded PRNG (mulberry32) so crits and growth are reproducible in tests. */
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Summon recharge multiplier over the listed `cooldown`s, so cards cannot be spammed. */
export const COOLDOWN_SCALE = 1.8
/** One summon card built from a roster entry ({ uid, key, hp, atk, spd }); speed growth shortens the attack period. */
export function card(entry) {
  const t = typeOf(entry.key)
  return {
    ...t,
    uid: entry.uid,
    key: t.key,
    name: t.name,
    special: !!t.special,
    level: entry.level ?? 1,
    cost: t.cost,
    cooldown: t.cooldown * COOLDOWN_SCALE,
    hp: entry.hp ?? t.hp,
    atk: entry.atk ?? t.atk,
    range: t.range,
    speed: t.speed,
    period: t.period / (1 + (entry.spd ?? 0) * 0.03),
    crit: t.crit || 0
  }
}
export const starterDeck = () => POOPS.slice(0, 3).map((t, i) => card({ uid: i + 1, key: t.key }))

export const income = (s) => STAGES[s.stage].income + s.level * 4
export function createGame(stage = 0, deck = starterDeck(), seed = 1) {
  return {
    time: 0,
    ticks: 0,
    tickRemainder: 0,
    stage,
    deck,
    rng: rng(seed),
    enemySpawned: 0,
    gold: STAGES[stage].gold,
    level: 1,
    home: STAGES[stage].home,
    enemy: STAGES[stage].enemy,
    units: [],
    deaths: [],
    effects: [],
    projectiles: [],
    zones: [],
    cooldowns: deck.map(() => 0),
    summons: deck.map(() => 0),
    burst: 0,
    spawn: 3,
    turret: 0,
    rushes: 0,
    opened: 0,
    alert: null,
    serial: 0,
    result: null,
    kills: 0,
    exp: {}
  }
}
/** 腸活 costs climb steeply so the later levels only pay off in a long siege. */
export const UPGRADE_COSTS = [100, 250, 450, 700]
export const upgradeCost = (s) => UPGRADE_COSTS[s.level - 1] ?? Infinity
/** Every 腸活 level draws the cleanup crew's attention: enemies spawn this much faster per level above 1. */
export const UPGRADE_ALARM = 0.07
/**
 * 朝の清掃: two early waves of 清掃員, growing with the stage, that pay no 💩 bounty. The smell of 腸活 draws
 * `perLevel` extra cleaners per level above 1, so investing before the morning is held costs more than it earns.
 */
export const OPENING = { at: [10, 30], size: (stage) => 4 + Math.floor(stage / 10), perLevel: 6 }
const MAX_UNITS = 24
/** side 1 summons deck slot `index`; side -1 summons ENEMIES[index] scaled to the stage. */
export function summon(s, index, side = 1) {
  const t = side === 1 ? s.deck[index] : ENEMIES[index]
  if (!t || s.result) return false
  if (side === 1) {
    if (s.gold < t.cost || s.cooldowns[index] > 0 || s.units.filter((u) => u.side === 1).length >= MAX_UNITS)
      return false
    s.gold -= t.cost
    s.cooldowns[index] = t.cooldown
    s.summons[index]++
  }
  const power = side === 1 ? 1 : STAGES[s.stage].power + Math.min(s.time / 350, 0.4)
  s.units.push({
    ...t,
    type: index,
    side,
    id: ++s.serial,
    x: side === 1 ? HOME_X - 30 : ENEMY_X + 30,
    hp: t.hp * power,
    maxHp: t.hp * power,
    atk: t.atk * power,
    exp: side === 1 ? 0 : Math.round(t.exp * (1 + 0.05 * s.stage)),
    attack: 0,
    cycle: t.period,
    phase: 0,
    strikes: 0,
    walkDistance: 0,
    slowUntil: 0,
    weak: { end: 0 },
    motion: 'walk'
  })
  return true
}
export function upgrade(s) {
  const cost = upgradeCost(s)
  if (s.result || s.gold < cost) return false
  s.gold -= cost
  s.level++
  return true
}
export const BURST_COOLDOWN = 24
export const burstDamage = (s) => Math.round(115 * STAGES[s.stage].power)
/** 大放屁: hurts and pushes back every enemy in the right (home) half. */
export function burst(s) {
  if (s.result || s.burst > 0) return false
  s.burst = BURST_COOLDOWN
  for (const u of s.units)
    if (u.side === -1 && u.x > 510) {
      damageUnit(s, { side: 1 }, u, burstDamage(s))
      move(s, u, -85)
      u.hurt = { at: s.time, power: 1.5 }
    }
  s.effects.push({ x: 760, life: 0.6, blast: true })
  return true
}
const dirOf = (u) => -u.side
/** The foe `u` engages (the nearest live foe not behind it, else the fort) and the distance still to walk before it is in range. */
export function reach(s, u) {
  const dir = dirOf(u)
  // One pass for the nearest; on a tie the earlier unit wins, exactly as a stable sort would pick.
  let target,
    nearest = Infinity
  for (const v of s.units) {
    if (v.side === u.side || !(v.hp > 0) || !((v.x - u.x) * dir >= -12)) continue
    const distance = Math.abs(v.x - u.x)
    if (distance < nearest) {
      target = v
      nearest = distance
    }
  }
  const baseX = u.side === 1 ? ENEMY_X + 7 : HOME_X - 7
  const distance = target ? nearest : Math.abs(baseX - u.x)
  return { target, baseX, gap: distance - (u.range + (target ? 0 : 25)) }
}
// Renderer contract: control {kind,start,end}, slow/drowsy/rally/vuln/weak {end},
// burn, poison[], curry, charged, ramp, flushed, tick and slide describe unit effects.
// zones hold {sourceId,side,kind,x,start,end,next,atk}; attack effects record areaKind,
// attackerKey, victims [{id,at}], crit and primaryX alongside existing visual fields.
function control(s, target, kind, duration) {
  if ((target.control?.end ?? 0) > s.time || (target.controlImmuneUntil ?? 0) > s.time) return
  if (kind === 'launch' && target.immovable) return
  const end = s.time + duration * (target.heavy ? 0.5 : 1)
  target.control = { kind, start: s.time, end }
  target.controlImmuneUntil = end + 1.2
}
function move(s, target, amount) {
  if (target.immovable) return
  const previous = target.x
  target.x = Math.min(HOME_X - 5, Math.max(ENEMY_X + 5, target.x + amount * (target.heavy ? 0.5 : 1)))
  if (target.x !== previous) {
    const remaining = Math.max(0, 1 - (s.time - (target.slide?.at ?? 0)) / 0.15)
    target.slide = { at: s.time, offset: (target.slide?.offset ?? 0) * remaining ** 2 + previous - target.x }
  }
}
function damageUnit(s, src, target, damage, kind = null, indirect = false) {
  if ((kind || indirect) && src.weak?.end > s.time) damage *= 0.7
  damage *= (target.vuln?.end > s.time ? 1.2 : 1) * (target.armor ? 0.7 : 1)
  const dealt = Math.min(target.hp, damage)
  target.hp -= damage
  if (kind) target.tick = { at: s.time, kind }
  else target.hurt = { at: s.time, power: Math.min(1.6, 0.7 + (damage / target.maxHp) * 3) }
  if (src.uid) (target.hitters ||= new Set()).add(src.uid)
  return dealt
}
function applyHit(s, src, target, damage, crit, primary = false, charged = false, effect = null) {
  if (target.hp <= 0) return
  if (primary && charged) damage *= src.ambushMultiplier
  const dealt = damageUnit(s, src, target, damage)
  if (src.drain && src.hp > 0) src.hp = Math.min(src.maxHp, src.hp + dealt * src.drain)
  if (src.slowEffect) target.slow = { end: s.time + src.slowEffect, factor: src.slowFactor }
  if (src.drowsyEffect) target.drowsy = { end: s.time + src.drowsyEffect }
  if (src.vulnerable) target.vuln = { end: s.time + src.vulnerable }
  if (src.weaken) target.weak.end = s.time + src.weaken
  if (src.freeze && s.rng() < src.freezeChance) control(s, target, 'freeze', src.freeze)
  if (src.stun) control(s, target, 'stun', src.stun)
  if (src.launch) control(s, target, 'launch', src.launch)
  if (src.confuse && crit) control(s, target, 'confuse', src.confuse)
  const attribution = { side: src.side, id: src.id, uid: src.uid, weak: src.weak }
  if (src.burnEffect)
    target.burn = {
      end: s.time + src.burnEffect,
      next: s.time + src.burnInterval,
      interval: src.burnInterval,
      damage: src.burnDamage,
      atk: src.atk,
      src: attribution
    }
  if (src.poisonEffect) {
    target.poison = (target.poison || []).filter((p) => p.end > s.time)
    if (target.poison.length < src.poisonStacks)
      target.poison.push({
        end: s.time + src.poisonEffect,
        next: s.time + src.poisonInterval,
        interval: src.poisonInterval,
        damage: src.poisonDamage,
        atk: src.atk,
        src: attribution
      })
  }
  if (src.mark && !target.curry) {
    const mark = { end: s.time + src.mark, atk: src.atk, src: attribution }
    target.curry = mark
    s.projectiles.push({ targetId: target.id, src, at: mark.end, curry: mark, effect: { x: target.x } })
  }
  if (src.execute && target.hp > 0 && target.hp <= target.maxHp * (target.heavy ? src.executeHeavy : src.execute)) {
    target.hp = 0
    target.flushed = true
  }
  const knock = src.knockback || (primary && charged ? src.ambushKnockback : 0)
  const previousX = target.x
  if (knock) move(s, target, knock * dirOf(src))
  if (src.pull) {
    const distance = Math.max(0, Math.abs(target.x - src.x) - 8)
    move(s, target, -dirOf(src) * Math.min(src.pull, distance))
  }
  if (src.collision && knock) {
    for (const other of s.units) {
      if (
        other !== target &&
        other.side === target.side &&
        other.hp > 0 &&
        (Math.abs(other.x - target.x) <= src.collision ||
          (other.x >= Math.min(previousX, target.x) && other.x <= Math.max(previousX, target.x)))
      ) {
        if (effect) (effect.collisions ||= []).push({ id: other.id, x: other.x, at: s.time })
        damageUnit(s, src, other, damage * src.collisionDamage)
        move(s, other, src.collisionPush * dirOf(src))
      }
    }
  }
}
function land(s, src, target, damage, crit = false, primary = true, charged = false, effect = null) {
  if (!target) {
    if (primary && charged) damage *= src.ambushMultiplier
    if (src.side === 1) s.enemy = Math.max(0, s.enemy - damage)
    else s.home = Math.max(0, s.home - damage)
    if (s.enemy <= 0) s.result = 'victory'
    else if (s.home <= 0) s.result = 'defeat'
    return
  }
  applyHit(s, src, target, damage, crit, primary, charged, effect)
}
function placeZone(s, src, x) {
  if (!src.zone) return
  s.zones = s.zones.filter((zone) => zone.sourceId !== src.id)
  s.zones.push({
    sourceId: src.id,
    side: src.side,
    kind: src.zone,
    x,
    start: s.time,
    end: s.time + src.zoneDuration,
    next: s.time + src.zoneInterval,
    radius: src.zoneRadius,
    interval: src.zoneInterval,
    damage: src.zoneDamage,
    push: src.zonePush,
    atk: src.atk,
    src: { side: src.side, uid: src.uid, weak: src.weak }
  })
}
function impact(s, shot, target) {
  const { src, damage, crit, effect } = shot
  effect.hit = true
  const x = target?.x ?? effect.primaryX
  if (shot.primary) {
    placeZone(s, src, x)
    if (target && src.heal)
      for (const ally of s.units) {
        if (ally.side === src.side && ally.hp > 0 && Math.abs(ally.x - x) <= src.radius) {
          ;(effect.healed ||= []).push({ id: ally.id, x: ally.x, side: ally.side, at: s.time })
          ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * src.heal)
        }
      }
  }
  if (!target) return land(s, src, null, damage, crit, shot.primary, shot.charged)
  if (shot.primary && src.areaKind === 'circle') {
    for (const victim of s.units.filter(
      (unit) => unit.side === target.side && unit.hp > 0 && Math.abs(unit.x - x) <= src.radius
    )) {
      effect.victims.push({ id: victim.id, at: s.time })
      land(s, src, victim, damage, crit, victim === target, false, effect)
    }
  } else {
    land(s, src, target, damage, crit, shot.primary, shot.charged, effect)
  }
  if (shot.primary && src.areaKind === 'bounce') {
    const next = s.units
      .filter(
        (unit) =>
          unit.side === target.side && unit.hp > 0 && (unit.x - x) * dirOf(src) > 0 && Math.abs(unit.x - x) <= 70
      )
      .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0]
    if (next) {
      const at = s.time + 0.15
      const victim = { id: next.id, at }
      effect.victims.push(victim)
      s.projectiles.push({ targetId: next.id, src, damage: damage * 0.6, crit, at, effect, victim, primary: false })
    }
  }
}
function attack(s, src, target, baseX, crit, damage) {
  const effect = {
    x: target?.x ?? baseX,
    primaryX: target?.x ?? baseX,
    life: ['korokoro', 'ramen', 'seichou', 'milk', 'daiou'].includes(src.key) ? 0.7 : 0.22,
    side: src.side,
    ranged: src.range > 80,
    crit,
    from: src.x,
    sourceId: src.id,
    targetId: target?.id ?? null,
    releasedAt: s.time,
    attackerKey: src.key,
    areaKind: src.areaKind,
    victims: []
  }
  s.effects.push(effect)
  const enqueue = (victim, multiplier, delay, primary) => {
    const at = s.time + delay
    const victimEntry = victim && src.areaKind !== 'circle' ? { id: victim.id, at } : null
    if (victimEntry) effect.victims.push(victimEntry)
    const shot = {
      targetId: victim?.id ?? null,
      src,
      damage: damage * multiplier,
      crit,
      at,
      effect,
      victim: victimEntry,
      primary,
      charged: src.charged
    }
    if (delay > 0) s.projectiles.push(shot)
    else impact(s, shot, victim)
  }
  if (!target) return enqueue(null, 1, effect.ranged ? 0.12 : 0, true)
  if (['band', 'cone', 'pierce', 'shockwave', 'ring'].includes(src.areaKind)) {
    // The engaged foe is always the first victim (even when it has closed in); the area adds the rest,
    // nearest first. The shockwave starts under the engaged foe and runs 80 further.
    const dir = dirOf(src)
    const start = (target.x - src.x) * dir
    const others = s.units
      .filter((unit) => {
        if (unit === target || unit.side === src.side || unit.hp <= 0) return false
        const distance = (unit.x - src.x) * dir
        if (src.areaKind === 'ring') return Math.abs(distance) <= src.range + 40
        if (src.areaKind === 'shockwave') return distance >= start && distance <= start + 80
        return distance >= 0 && distance <= src.range + (src.extra || 0)
      })
      .sort((a, b) =>
        src.areaKind === 'shockwave' ? (a.x - b.x) * dir : Math.abs(a.x - src.x) - Math.abs(b.x - src.x)
      )
    const multipliers = src.multipliers || [1, 1, 1, 1, 1]
    ;[target, ...others].slice(0, multipliers.length).forEach((victim, index) => {
      const distance = Math.abs(victim.x - src.x)
      const delay =
        src.areaKind === 'shockwave'
          ? ((victim.x - src.x) * dir - start) / 600
          : ['cone', 'pierce'].includes(src.areaKind)
            ? (0.12 * distance) / src.range
            : 0
      enqueue(victim, multipliers[index], delay, index === 0)
    })
  } else enqueue(target, 1, effect.ranged ? 0.12 : 0, true)
}
function arrive(s, p) {
  const target = p.targetId === null ? null : s.units.find((u) => u.id === p.targetId && u.hp > 0)
  if (target) p.effect.x = target.x
  if (p.curry) {
    if (target && target.curry === p.curry) {
      target.curry = null
      const effect = {
        x: target.x,
        primaryX: target.x,
        life: 0.22,
        side: p.src.side,
        ranged: false,
        crit: false,
        releasedAt: s.time,
        sourceId: p.src.id,
        targetId: target.id,
        attackerKey: p.src.key,
        explosion: true,
        hit: true,
        areaKind: 'circle',
        victims: []
      }
      s.effects.push(effect)
      for (const victim of s.units)
        if (victim.side === target.side && victim.hp > 0 && Math.abs(victim.x - target.x) <= p.src.markRadius) {
          effect.victims.push({ id: victim.id, at: p.at })
          damageUnit(s, p.src, victim, p.curry.atk * p.src.markDamage, null, true)
        }
    }
    return
  }
  p.effect.arrived = true
  if (!target && p.targetId !== null && p.victim) p.victim.missed = true
  p.effect.missed = !p.effect.hit && p.targetId !== null && !target
  if (target || p.targetId === null) impact(s, p, target)
}
function strike(s, u, target, baseX) {
  const targetId = target?.id ?? null
  if (u.caffeine) u.ramp = u.rampTarget === targetId ? Math.min(5, (u.ramp || 0) + 1) : 0
  u.rampTarget = targetId
  u.charged = !!u.ambush && (u.lastStrikeDistance === undefined || u.walkDistance - u.lastStrikeDistance >= 40)
  u.lastStrikeDistance = u.walkDistance
  if (u.rallyEffect)
    for (const ally of s.units) {
      if (ally.side === u.side && ally.hp > 0 && Math.abs(ally.x - u.x) <= 140) ally.rally = { end: s.time + 4 }
    }
  u.cycle =
    (u.period * (u.drowsy?.end > s.time ? 1.35 : 1) * (u.rally?.end > s.time ? 0.8 : 1)) / (1 + (u.ramp || 0) * 0.08)
  u.attack = u.cycle
  u.phase = 0
  u.motion = 'attack'
  const crit = u.crit > 0 && s.rng() < u.crit
  u.strikes++
  u.lastCrit = crit
  const damage = u.atk * (crit ? 2.5 : 1) * (u.weak?.end > s.time ? 0.7 : 1)
  attack(s, u, target, baseX, crit, damage)
}
function ongoing(s, start, struck) {
  const end = s.time
  let now = start
  let decisive = null
  while (true) {
    let event = null
    const consider = (at, run, priority = 0, fort = false) => {
      if (decisive !== null && (!fort || at !== decisive)) return
      if (at <= end + 1e-9 && (!event || at < event.at || (at === event.at && priority > event.priority)))
        event = { at, run, priority }
    }
    for (const unit of s.units) {
      if (unit.hp <= 0) continue
      const dots = unit.poison || []
      for (let index = -1; index < dots.length; index++) {
        const dot = index < 0 ? unit.burn : dots[index]
        if (!dot || dot.next > dot.end + 1e-9 || dot.next > end + 1e-9) continue
        consider(dot.next, () => {
          damageUnit(s, dot.src, unit, dot.atk * dot.damage, dot === unit.burn ? 'burn' : 'poison')
          dot.next += dot.interval
        })
      }
    }
    for (const zone of s.zones) {
      if (zone.kind === 'mud' || zone.next > zone.end + 1e-9 || zone.next > end + 1e-9) continue
      consider(zone.next, () => {
        for (const unit of s.units) {
          if (unit.side === zone.side || unit.hp <= 0 || Math.abs(unit.x - zone.x) > zone.radius) continue
          if (zone.kind === 'stench') damageUnit(s, zone.src, unit, zone.atk * zone.damage, 'stench')
          else move(s, unit, zone.push * unit.side)
        }
        zone.next += zone.interval
      })
    }
    for (const projectile of s.projectiles) {
      if (projectile.at > end + 1e-9) continue
      consider(
        projectile.at,
        () => {
          s.projectiles.splice(s.projectiles.indexOf(projectile), 1)
          arrive(s, projectile)
        },
        projectile.targetId === null && projectile.src.side === 1 ? 1 : 0,
        projectile.targetId === null
      )
    }
    for (const unit of s.units) {
      if (unit.hp <= 0 || struck.has(unit) || unit.attack > end - start + 1e-9) continue
      let at = start + unit.attack
      if (unit.control && unit.control.start <= at + 1e-9 && unit.control.end > start)
        at += unit.control.end - Math.max(start, unit.control.start)
      at = Math.max(at, now)
      if (unit.control && unit.control.start <= at && unit.control.end > at) at = unit.control.end
      if (at > end + 1e-9) continue
      const current = reach(s, unit)
      if (current.gap > 0) continue
      consider(
        at,
        () => {
          if (unit.hp <= 0 || (unit.control?.end ?? 0) > s.time) return
          const { target, baseX, gap } = reach(s, unit)
          if (gap > 0) return
          strike(s, unit, target, baseX)
          struck.set(unit, s.time)
        },
        !current.target && unit.side === 1 ? 1 : 0,
        !current.target && current.gap <= 0
      )
    }
    if (!event) break
    now = s.time = Math.max(start, event.at)
    event.run()
    if (s.result && decisive === null) decisive = s.time
  }
  if (decisive !== null) {
    s.time = decisive
    return
  }
  s.time = end
  for (const unit of s.units) if (unit.poison?.length) unit.poison = unit.poison.filter((dot) => dot.end > end)
  s.zones = s.zones.filter((zone) => zone.end > end)
}
/** Global marching pace: lane battles are meant to last two to three minutes. */
export const WALK_PACE = 1.25
export const RUSHES = 4
export const TURRET = { range: 260, period: 1.8, damage: 55 }
/** The enemy fort fires its ウォシュレット砲 at the closest poop, sends 朝の清掃 early and a 大掃除 rush at each fifth of its HP. */
function wave(s, size, text, { bounty, type } = {}) {
  const stage = STAGES[s.stage]
  for (let k = 0; k < size; k++) {
    summon(s, type ?? stage.pattern[(s.enemySpawned + k * 2) % stage.pattern.length], -1)
    s.units.at(-1).x -= k * 14
    s.units.at(-1).bounty = bounty
  }
  s.alert = { text, at: s.time }
}
function fortDefense(s, dt) {
  const stage = STAGES[s.stage]
  while (s.opened < OPENING.at.length && s.time >= OPENING.at[s.opened]) {
    s.opened++
    const smell = OPENING.perLevel * (s.level - 1)
    wave(s, OPENING.size(s.stage) + smell, smell ? '清掃員が増員だ！' : '朝の清掃だ！', { bounty: 0, type: 0 })
  }
  s.turret = Math.max(0, s.turret - dt)
  const near = s.units
    .filter((u) => u.side === 1 && u.hp > 0 && u.x - ENEMY_X < TURRET.range)
    .sort((a, b) => a.x - b.x)[0]
  if (near && s.turret <= 0) {
    s.turret = TURRET.period
    const effect = {
      x: near.x,
      life: 0.22,
      side: -1,
      ranged: true,
      turret: true,
      from: ENEMY_X + 20,
      sourceId: null,
      targetId: near.id,
      releasedAt: s.time
    }
    s.effects.push(effect)
    s.projectiles.push({
      targetId: near.id,
      src: { side: -1 },
      damage: TURRET.damage * stage.power,
      at: s.time + 0.12,
      effect
    })
  }
  while (s.rushes < RUSHES && s.enemy <= (stage.enemy * (RUSHES - s.rushes)) / (RUSHES + 1)) {
    s.rushes++
    wave(s, 3 + s.rushes, '大掃除だ！')
  }
}
const TICK = 1 / 60
export function step(s, dt) {
  if (s.result) return
  if (s.ticks === 0 && !s.tickRemainder) s.tickOrigin = s.time
  s.tickRemainder += dt * 60
  const ticks = Math.floor(s.tickRemainder + 1e-9)
  s.tickRemainder = Math.max(0, s.tickRemainder - ticks)
  for (let index = 0; index < ticks && !s.result; index++) {
    s.time = s.tickOrigin + ++s.ticks / 60
    tick(s, TICK)
  }
}
function tick(s, dt) {
  s.gold = Math.min(999, s.gold + income(s) * dt)
  s.cooldowns = s.cooldowns.map((c) => Math.max(0, c - dt))
  s.burst = Math.max(0, s.burst - dt)
  const struck = new Map()
  ongoing(s, s.time - dt, struck)
  if (s.result) return settleDeaths(s)
  fortDefense(s, dt)
  s.spawn -= dt
  if (s.spawn <= 0) {
    const stage = STAGES[s.stage]
    summon(s, stage.pattern[s.enemySpawned++ % stage.pattern.length], -1)
    s.spawn = Math.max(stage.floor, stage.interval - s.time / 100) * (1 - UPGRADE_ALARM * (s.level - 1))
  }
  for (const u of s.units) {
    if (u.hp <= 0) continue
    const dir = dirOf(u)
    const controlTime = u.control
      ? Math.max(0, Math.min(s.time, u.control.end) - Math.max(s.time - dt, u.control.start))
      : 0
    // Confused units stagger home at their own pace; heavy units only shorten the duration, not the walk.
    if (u.control?.kind === 'confuse' && controlTime > 0)
      u.x = Math.min(HOME_X - 5, Math.max(ENEMY_X + 5, u.x + u.side * u.speed * WALK_PACE * 0.4 * controlTime))
    const activeStart = struck.get(u) ?? s.time - dt
    const activeControl = u.control
      ? Math.max(0, Math.min(s.time, u.control.end) - Math.max(activeStart, u.control.start))
      : 0
    const activeTime = s.time - activeStart - activeControl
    u.attack = Math.max(0, u.attack - activeTime)
    u.phase += activeTime
    if (u.control?.end > s.time) {
      u.motion = 'idle'
      continue
    }
    if (struck.has(u)) continue
    const { target, baseX, gap } = reach(s, u)
    if (gap <= 0) {
      u.motion = 'attack'
      if (u.attack <= 0) {
        strike(s, u, target, baseX)
        if (s.result) return settleDeaths(s)
      }
    } else {
      u.motion = 'walk'
      u.ramp = 0
      u.rampTarget = undefined
      const muddy = s.zones.some((zone) => zone.kind === 'mud' && zone.side !== u.side && Math.abs(u.x - zone.x) <= 50)
      const slow = Math.min(u.slow?.end > s.time ? u.slow.factor : 1, muddy ? 0.55 : 1)
      const distanceWalked = u.speed * WALK_PACE * slow * activeTime
      u.x += distanceWalked * dir
      u.walkDistance += distanceWalked
    }
  }
  settleDeaths(s)
  s.effects = s.effects.filter((e) => (e.life -= dt) > 0)
}
function settleDeaths(s) {
  s.units = s.units.filter((u) => {
    if (u.hp > 0) return true
    s.deaths.push({ ...u, at: s.time })
    if (u.side === -1) {
      s.gold = Math.min(999, s.gold + (u.bounty ?? STAGES[s.stage].reward))
      s.kills++
      // Every unit that hurt the fallen enemy earns its EXP.
      for (const uid of u.hitters ?? []) s.exp[uid] = (s.exp[uid] || 0) + u.exp
    }
    return false
  })
}
