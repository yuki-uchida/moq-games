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
