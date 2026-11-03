import { PASSIVE_BY_ID, TALENT_CATEGORIES, WEAPON_BY_ID } from './data'
import type { ViewPlayer } from './view'

export function resultCategories(player: Pick<ViewPlayer, 'weapons' | 'passives'>) {
  return TALENT_CATEGORIES.map((category) => ({
    category,
    weapons: player.weapons.filter(([id]) => WEAPON_BY_ID.get(id)?.category === category),
    passives: player.passives.filter(([id]) => PASSIVE_BY_ID.get(id)?.category === category)
  }))
}

export function talentRadarPoints(talents: Record<string, number>): string {
  return TALENT_CATEGORIES.map((category, index) => {
    const angle = (index * Math.PI) / 3 - Math.PI / 2
    const radius = Math.min(1, Math.max(0, talents[category] / 1.7)) * 100
    return `${(150 + Math.cos(angle) * radius).toFixed(1)},${(130 + Math.sin(angle) * radius).toFixed(1)}`
  }).join(' ')
}
