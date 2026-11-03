import { TALENT_CATEGORIES } from './data'

export function talentRadarPoints(talents: Record<string, number>): string {
  return TALENT_CATEGORIES.map((category, index) => {
    const angle = (index * Math.PI) / 3 - Math.PI / 2
    const radius = Math.min(1, Math.max(0, talents[category] / 1.7)) * 100
    return `${(150 + Math.cos(angle) * radius).toFixed(1)},${(130 + Math.sin(angle) * radius).toFixed(1)}`
  }).join(' ')
}
