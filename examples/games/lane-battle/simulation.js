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
    hp: 180,
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
    atk: 29,
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
    atk: 35,
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
    splash: 60,
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
    knock: 18,
    price: 700,
    unlock: 10,
    line: '腹巻きの巨体で押し返す壁'
  },
  {
    key: 'daiou',
    name: '宿便大王',
    cost: 240,
    hp: 560,
    atk: 88,
    range: 45,
    speed: 22,
    period: 1.5,
    cooldown: 16,
    splash: 45,
    price: 1100,
    unlock: 16,
    line: '溜めこんだ王の一撃'
  }
]

/** Special units: things that upset the stomach. Strong at first, but they rarely grow. */
export const SPECIALS = [
  {
    key: 'aircon',
    name: '冷房',
    cost: 120,
    hp: 260,
    atk: 34,
    range: 170,
    speed: 22,
    period: 1.5,
    cooldown: 10,
    slow: 2.5,
    line: 'お腹を冷やす冷風で敵の足を鈍らせる'
  },
  {
    key: 'ramen',
    name: 'ラーメン',
    cost: 120,
    hp: 520,
    atk: 48,
    range: 36,
    speed: 30,
    period: 1,
    cooldown: 8,
    line: '背脂こってり。前線を支える万能型'
  },
  {
    key: 'yofukashi',
    name: '夜ふかし',
    cost: 120,
    hp: 200,
    atk: 40,
    range: 34,
    speed: 58,
    period: 0.7,
    cooldown: 8,
    crit: 0.25,
    line: '寝不足の暴走。素早い連打と会心'
  },
  {
    key: 'sake',
    name: 'お酒',
    cost: 140,
    hp: 220,
    atk: 42,
    range: 165,
    speed: 24,
    period: 1.4,
    cooldown: 10,
    crit: 0.35,
    line: '酔いが回ると会心の大ダメージ'
  },
  {
    key: 'jiro',
    name: '二郎系ラーメン',
    cost: 300,
    hp: 1500,
    atk: 90,
    range: 44,
    speed: 16,
    period: 1.6,
    cooldown: 20,
    splash: 55,
    line: 'ヤサイマシマシ。超重量級'
  },
  {
    key: 'yakiniku',
    name: '焼肉',
    cost: 180,
    hp: 560,
    atk: 60,
    range: 40,
    speed: 26,
    period: 1.2,
    cooldown: 12,
    splash: 45,
    line: '脂がはねて周りも巻き込む'
  },
  {
    key: 'garlic',
    name: 'ニンニク',
    cost: 160,
    hp: 240,
    atk: 46,
    range: 150,
    speed: 24,
    period: 1.6,
    cooldown: 11,
    splash: 70,
    line: '強烈なにおいで群れごと攻撃'
  },
  {
    key: 'curry',
    name: '激辛カレー',
    cost: 190,
    hp: 380,
    atk: 115,
    range: 38,
    speed: 30,
    period: 1.5,
    cooldown: 13,
    line: '一撃が重い、辛さの暴力'
  },
  {
    key: 'milk',
    name: '牛乳',
    cost: 120,
    hp: 520,
    atk: 34,
    range: 36,
    speed: 28,
    period: 1.1,
    cooldown: 9,
    knock: 30,
    line: 'ゴロゴロ押し返す'
  },
  {
    key: 'oyster',
    name: '生ガキ',
    cost: 220,
    hp: 300,
    atk: 150,
    range: 40,
    speed: 34,
    period: 1.8,
    cooldown: 15,
    crit: 0.2,
    line: '当たると危険。一発逆転'
  },
  {
    key: 'ice',
    name: 'アイスの食べすぎ',
    cost: 110,
    hp: 340,
    atk: 36,
    range: 34,
    speed: 32,
    period: 1,
    cooldown: 8,
    slow: 2,
    line: 'キーンと冷やして足止め'
  },
  {
    key: 'energy',
    name: 'エナジードリンク',
    cost: 150,
    hp: 240,
    atk: 28,
    range: 150,
    speed: 30,
    period: 0.55,
    cooldown: 10,
    line: 'カフェインで超連射'
  }
].map((t) => ({ ...t, special: true }))

/** The cleanup crew: everything that wants the poop flushed, cleaned up or settled. */
export const ENEMIES = [
  { key: 'cleaner', name: '清掃員', hp: 150, atk: 18, range: 32, speed: 28, period: 1, exp: 10 },
  { key: 'yogurt', name: 'ヨーグルト', hp: 90, atk: 14, range: 30, speed: 50, period: 0.8, exp: 8 },
  { key: 'sayu', name: '白湯', hp: 80, atk: 26, range: 150, speed: 24, period: 1.4, exp: 10 },
  { key: 'washiki', name: '和式便器', hp: 480, atk: 22, range: 34, speed: 17, period: 1.3, exp: 18 },
  { key: 'mop', name: 'モップのおばちゃん', hp: 280, atk: 26, range: 38, speed: 26, period: 1.2, splash: 40, exp: 16 },
  { key: 'yoshiki', name: '洋式便器', hp: 300, atk: 30, range: 170, speed: 18, period: 1.7, knock: 15, exp: 20 },
  { key: 'seichou', name: '整腸剤', hp: 130, atk: 28, range: 150, speed: 26, period: 1.5, splash: 45, exp: 14 },
  { key: 'geridome', name: '下痢止め', hp: 900, atk: 48, range: 42, speed: 15, period: 1.6, splash: 40, exp: 50 }
]
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
    splash: t.splash || 0,
    slow: t.slow || 0,
    knock: t.knock || 0,
    crit: t.crit || 0
  }
}
export const starterDeck = () => POOPS.slice(0, 3).map((t, i) => card({ uid: i + 1, key: t.key }))

export const income = (s) => STAGES[s.stage].income + s.level * 4
export function createGame(stage = 0, deck = starterDeck(), seed = 1) {
  return {
    time: 0,
    stage,
    deck,
    rng: rng(seed),
    enemySpawned: 0,
    gold: STAGES[stage].gold,
    level: 1,
    home: STAGES[stage].home,
    enemy: STAGES[stage].enemy,
    units: [],
    effects: [],
    projectiles: [],
    cooldowns: deck.map(() => 0),
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
    phase: 0,
    walkDistance: 0,
    slowUntil: 0,
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
      u.hp -= burstDamage(s)
      u.x -= 85
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
/** Applies one released attack: splash, slow and knockback hit every foe near the recipient. */
function land(s, src, target, damage) {
  if (!target) {
    if (src.side === 1) s.enemy = Math.max(0, s.enemy - damage)
    else s.home = Math.max(0, s.home - damage)
    return
  }
  const victims = src.splash
    ? s.units.filter((v) => v.side === target.side && v.hp > 0 && Math.abs(v.x - target.x) <= src.splash)
    : [target]
  if (!victims.includes(target)) victims.push(target)
  for (const v of victims) {
    v.hp -= damage
    // Visual only: the renderer plays a hit reaction scaled by how hard this hit was.
    v.hurt = { at: s.time, power: Math.min(1.6, 0.7 + (damage / v.maxHp) * 3 + (src.knock ? 0.3 : 0)) }
    if (src.uid) (v.hitters ||= new Set()).add(src.uid)
    if (src.slow) v.slowUntil = s.time + src.slow
    if (src.knock) v.x = Math.min(HOME_X - 5, Math.max(ENEMY_X + 5, v.x + src.knock * dirOf(src)))
  }
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
export function step(s, dt) {
  if (s.result) return
  s.time += dt
  s.gold = Math.min(999, s.gold + income(s) * dt)
  s.cooldowns = s.cooldowns.map((c) => Math.max(0, c - dt))
  s.burst = Math.max(0, s.burst - dt)
  // Released shots keep their original recipient even if the shooter dies.
  s.projectiles = s.projectiles.filter((p) => {
    const target = p.targetId === null ? null : s.units.find((u) => u.id === p.targetId && u.hp > 0)
    if (target) p.effect.x = target.x
    if (s.time < p.at) return true
    p.effect.arrived = true
    p.effect.missed = p.targetId !== null && !target
    if (target || p.targetId === null) land(s, p.src, target, p.damage)
    return false
  })
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
    u.attack = Math.max(0, u.attack - dt)
    u.phase += dt
    const { target, baseX, gap } = reach(s, u)
    if (gap <= 0) {
      u.motion = 'attack'
      if (u.attack <= 0) {
        u.attack = u.period
        u.phase = 0
        const crit = u.crit > 0 && s.rng() < u.crit
        const damage = u.atk * (crit ? 2.5 : 1)
        const effect = {
          x: target?.x ?? baseX,
          life: 0.22,
          side: u.side,
          ranged: u.range > 80,
          crit,
          splash: u.splash,
          from: u.x,
          sourceId: u.id,
          targetId: target?.id ?? null,
          releasedAt: s.time
        }
        s.effects.push(effect)
        if (effect.ranged) s.projectiles.push({ targetId: effect.targetId, src: u, damage, at: s.time + 0.12, effect })
        else land(s, u, target, damage)
      }
    } else {
      u.motion = 'walk'
      const distanceWalked = u.speed * WALK_PACE * (s.time < u.slowUntil ? 0.5 : 1) * dt
      u.x += distanceWalked * dir
      u.walkDistance += distanceWalked
    }
  }
  s.units = s.units.filter((u) => {
    if (u.hp > 0) return true
    if (u.side === -1) {
      s.gold = Math.min(999, s.gold + (u.bounty ?? STAGES[s.stage].reward))
      s.kills++
      // Every unit that hurt the fallen enemy earns its EXP.
      for (const uid of u.hitters ?? []) s.exp[uid] = (s.exp[uid] || 0) + u.exp
    }
    return false
  })
  s.effects = s.effects.filter((e) => (e.life -= dt) > 0)
  if (s.home <= 0) s.result = 'defeat'
  else if (s.enemy <= 0) s.result = 'victory'
}
