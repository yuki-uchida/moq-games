import { WEAPON_BY_ID } from './data'

export const PET_LIFESPAN = 20
export const PET_MEMORY = 'p_petmemory'

export const SPORTS_FORMS = [
  { age: 0, key: 'soccer', name: 'サッカー', icon: '⚽' },
  { age: 12, key: 'baseball', name: '野球', icon: '⚾' },
  { age: 15, key: 'basketball', name: 'バスケ', icon: '🏀' },
  { age: 18, key: 'tennis', name: 'テニス', icon: '🎾' },
  { age: 23, key: 'golf', name: 'ゴルフ', icon: '⛳' },
  { age: 50, key: 'gateball', name: 'ゲートボール', icon: '🔴' }
] as const

export function sportsForm(age: number) {
  return SPORTS_FORMS.findLast((form) => age >= form.age) ?? SPORTS_FORMS[0]
}

export function petForm(years: number) {
  return years < 2
    ? { name: '子犬', scale: 0.65 }
    : years < 12
      ? { name: '成犬', scale: 1 }
      : { name: '老犬', scale: 0.85 }
}

export function weaponAppearance(id: string, age: number, petAge = 0) {
  const def = WEAPON_BY_ID.get(id)!
  if (id === 'w_sports') {
    const form = sportsForm(age)
    return { name: `${def.name}（${form.name}）`, icon: form.icon, art: `w_sports_${form.key}` }
  }
  return { name: id === 'w_pet' ? `${def.name}（${petForm(petAge).name}）` : def.name, icon: def.icon, art: id }
}
