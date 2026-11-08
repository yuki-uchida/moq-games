import { WEAPON_BY_ID } from './data'

export const PET_LIFESPAN = 20
export const PET_MEMORY = 'p_petmemory'
export const PET_TYPES = ['dog', 'cat', 'rabbit', 'parakeet', 'hamster'] as const

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

export const OUTDOOR_FORMS = [
  { age: 0, key: 'tricycle', name: '三輪車', icon: '🚲' },
  { age: 12, key: 'bicycle', name: '自転車', icon: '🚲' },
  { age: 15, key: 'motorcycle', name: 'バイク', icon: '🏍️' },
  { age: 18, key: 'car', name: '車', icon: '🚗' },
  { age: 23, key: 'plane', name: '飛行機', icon: '✈️' }
] as const

export function outdoorForm(age: number) {
  return OUTDOOR_FORMS.findLast((form) => age >= form.age) ?? OUTDOOR_FORMS[0]
}

export const GAMBLE_FORMS = [
  { age: 15, key: 'gacha', name: '課金', icon: '🎁' },
  { age: 18, key: 'poker', name: 'ポーカー', icon: '🃏' },
  { age: 23, key: 'pachinko', name: 'パチンコ', icon: '🎰' },
  { age: 50, key: 'horse', name: '競馬', icon: '🏇' }
] as const

export function gambleForm(age: number) {
  return GAMBLE_FORMS.findLast((form) => age >= form.age) ?? GAMBLE_FORMS[0]
}

export const OBSERVATION_FORMS = [
  { age: 3, name: '蟻・ミミズ', icon: '🐜' },
  { age: 6, name: 'カブトムシ', icon: '🪲' },
  { age: 12, name: 'ハムスター', icon: '🐹' },
  { age: 15, name: '鳥', icon: '🐦' },
  { age: 18, name: '魚', icon: '🐟' }
] as const

export const OBSERVATION_SPRITES = ['ant', 'worm', 'beetle', 'hamster', 'bird', 'fish'] as const

export function observationForm(age: number) {
  return OBSERVATION_FORMS.findLast((form) => age >= form.age) ?? OBSERVATION_FORMS[0]
}

export function observationSprite(age: number, count: number) {
  if (age < 6) return count % 2
  if (age < 12) return 2
  if (age < 15) return 3
  if (age < 18) return 4
  return 5
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
  if (id === 'w_travel') {
    const form = outdoorForm(age)
    return { name: `${def.name}（${form.name}）`, icon: form.icon, art: `w_travel_${form.key}` }
  }
  if (id === 'w_gamble') {
    const form = gambleForm(age)
    return { name: `${def.name}（${form.name}）`, icon: form.icon, art: `w_gamble_${form.key}` }
  }
  if (id === 'w_observe') {
    const form = observationForm(age)
    return { name: `${def.name}（${form.name}）`, icon: form.icon, art: id }
  }
  return { name: id === 'w_pet' ? `${def.name}（${petForm(petAge).name}）` : def.name, icon: def.icon, art: id }
}
