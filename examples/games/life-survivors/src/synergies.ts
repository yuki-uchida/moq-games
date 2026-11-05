import { WEAPON_BY_ID, type TalentCategory } from './data'

export const SYNERGIES = [
  {
    name: '知識で資産形成',
    pair: ['study', 'invest'],
    target: 'invest',
    damage: 1.2,
    cooldown: 1,
    area: 1,
    text: '知性系 × 資産系 → 資産系の威力 +20%'
  },
  {
    name: '自分磨きの恋',
    pair: ['sports', 'love'],
    target: 'love',
    damage: 1,
    cooldown: 0.9,
    area: 1,
    text: '身体系 × 恋愛系 → 恋愛系の待ち時間 -10%'
  },
  {
    name: '友人がつなぐ縁',
    pair: ['friend', 'love'],
    target: 'love',
    damage: 1,
    cooldown: 1,
    area: 1.15,
    text: '対人系 × 恋愛系 → 恋愛系の範囲 +15%'
  },
  {
    name: '体験が育む表現',
    pair: ['sports', 'hobby'],
    target: 'hobby',
    damage: 1.1,
    cooldown: 1,
    area: 1,
    text: '身体系 × 創造系 → 創造系の威力 +10%'
  },
  {
    name: '遊びからのひらめき',
    pair: ['hobby', 'study'],
    target: 'study',
    damage: 1,
    cooldown: 0.95,
    area: 1,
    text: '創造系 × 知性系 → 知性系の待ち時間 -5%'
  },
  {
    name: 'ゆとりが広げる交流',
    pair: ['invest', 'friend'],
    target: 'friend',
    damage: 1,
    cooldown: 1,
    area: 1.1,
    text: '資産系 × 対人系 → 対人系の範囲 +10%'
  }
] as const

export function activeSynergies(weaponIds: readonly string[]) {
  const categories = new Set<TalentCategory>()
  for (const id of weaponIds) {
    const def = WEAPON_BY_ID.get(id)
    if (def && !def.parent) categories.add(def.category)
  }
  return SYNERGIES.filter((synergy) => synergy.pair.every((category) => categories.has(category)))
}

export interface PersonalitySynergy {
  weapon: string
  text: string
  cooldown?: number
  amount?: number
  area?: number
  duration?: number
  diceFloor?: number
}

export const diceFloorForLuck = (level: number) => 0.3 + level * 0.1

const PERSONALITY_SYNERGY_HINTS = [
  {
    weapon: 'w_overtime',
    triggers: ['p_bold', 'p_acceptance', 'p_large', 'p_small'],
    text: '最大精神力150以上で残業の連射増加（以降50ごと、最大15発）'
  },
  { weapon: 'w_sports', triggers: ['p_clever'], text: '器用 × スポーツ：待ち時間が性格Lvごとに5%短縮' },
  { weapon: 'w_karaoke', triggers: ['p_clever'], text: '器用 × カラオケ：待ち時間が性格Lvごとに5%短縮' },
  { weapon: 'w_gamble', triggers: ['p_lucky'], text: '運がいい × ギャンブル：最低威力が性格Lvごとに0.1倍上昇' },
  { weapon: 'w_muscle', triggers: ['p_large'], text: '大柄 × 筋トレ：範囲が性格Lvごとに5%拡大' },
  { weapon: 'w_perfume', triggers: ['p_small'], text: '小柄 × 香水：効果時間が性格Lvごとに10%延長' },
  { weapon: 'w_friend', triggers: ['p_kind'], text: '友人思い × 友人：範囲が性格Lvごとに8%拡大' },
  { weapon: 'w_reading', triggers: ['p_curious'], text: '好奇心 × 読書：効果時間が性格Lvごとに10%延長' },
  { weapon: 'w_savings', triggers: ['p_greedy'], text: 'がめつい × 貯金：爆発範囲が性格Lvごとに10%拡大' },
  { weapon: 'w_cooking', triggers: ['p_healthy'], text: '健康志向 × 料理：性格Lv1・Lv4で攻撃数 +1' }
] as const

export function personalitySynergyDetails(
  id: string,
  weaponIds: readonly string[],
  passives: readonly [string, number][],
  maxHp: number
) {
  const hints = PERSONALITY_SYNERGY_HINTS.filter(
    (entry) => entry.weapon === id || entry.triggers.some((trigger) => trigger === id)
  )
  const active = activePersonalitySynergies(weaponIds, passives, maxHp)
  return hints.map((entry) => {
    const bonus = active.find((synergy) => synergy.weapon === entry.weapon)
    return `連携条件：${entry.text}${bonus ? `。発動中：${bonus.text}` : ''}`
  })
}

export function activePersonalitySynergies(
  weaponIds: readonly string[],
  passives: readonly [string, number][],
  maxHp: number
): PersonalitySynergy[] {
  const level = (id: string) => passives.find(([passive]) => passive === id)?.[1] ?? 0
  const has = (id: string) => weaponIds.includes(id)
  const result: PersonalitySynergy[] = []
  const overtime = Math.min(5, Math.max(0, Math.floor((Math.round(maxHp) - 100) / 50)))
  if (has('w_overtime') && overtime)
    result.push({ weapon: 'w_overtime', text: `最大精神力 × 残業：連射 +${overtime * 3}発`, amount: overtime })
  const clever = level('p_clever')
  if (clever)
    for (const [weapon, name] of [
      ['w_sports', 'スポーツ'],
      ['w_karaoke', 'カラオケ']
    ]) {
      if (has(weapon))
        result.push({ weapon, text: `器用 × ${name}：待ち時間 -${clever * 5}%`, cooldown: 1 - clever * 0.05 })
    }
  const lucky = level('p_lucky')
  if (lucky && has('w_gamble')) {
    const diceFloor = diceFloorForLuck(lucky)
    result.push({
      weapon: 'w_gamble',
      text: `運がいい × ギャンブル：出目の最低威力 ${diceFloor.toFixed(1)}倍`,
      diceFloor
    })
  }
  for (const [weapon, passive, text, field, perLevel] of [
    ['w_muscle', 'p_large', '大柄 × 筋トレ：範囲', 'area', 5],
    ['w_perfume', 'p_small', '小柄 × 香水：効果時間', 'duration', 10],
    ['w_friend', 'p_kind', '友人思い × 友人：範囲', 'area', 8],
    ['w_reading', 'p_curious', '好奇心 × 読書：効果時間', 'duration', 10],
    ['w_savings', 'p_greedy', 'がめつい × 貯金：爆発範囲', 'area', 10]
  ] as const) {
    const value = level(passive)
    if (value && has(weapon))
      result.push({ weapon, text: `${text} +${value * perLevel}%`, [field]: 1 + (value * perLevel) / 100 })
  }
  const healthy = level('p_healthy')
  if (healthy && has('w_cooking')) {
    const amount = healthy >= 4 ? 2 : 1
    result.push({ weapon: 'w_cooking', text: `健康志向 × 料理：攻撃数 +${amount}`, amount })
  }
  return result
}
