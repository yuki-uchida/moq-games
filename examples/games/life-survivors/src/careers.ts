import { MAX_WEAPON_LEVEL, WEAPONS } from './data'

export type Career = 'soccer' | 'bureaucrat' | 'entrepreneur'
export type Appearance = Career | 'social' | 'romantic' | 'creative'

const CAREERS: Record<string, Career> = {
  w_sports: 'soccer',
  w_muscle: 'soccer',
  w_study: 'bureaucrat',
  w_reading: 'bureaucrat',
  w_work: 'bureaucrat',
  w_overtime: 'bureaucrat',
  w_invest: 'entrepreneur',
  w_savings: 'entrepreneur',
  w_gamble: 'entrepreneur'
}

const APPEARANCES: Record<string, Appearance> = {
  ...CAREERS,
  w_friend: 'social',
  w_sns: 'social',
  w_pet: 'social',
  w_love: 'romantic',
  w_beauty: 'romantic',
  w_ring: 'romantic',
  w_perfume: 'romantic',
  w_hobby: 'creative',
  w_karaoke: 'creative',
  w_travel: 'creative',
  w_cooking: 'creative'
}

export function rankedCareer(
  weapons: readonly (readonly [string, number, ...unknown[]])[],
  passives: readonly (readonly [string, number])[],
  eligible?: readonly Career[]
): Career | undefined {
  return rankedStyle(weapons, passives, CAREERS, eligible)
}

export function rankedAppearance(
  weapons: readonly (readonly [string, number, ...unknown[]])[],
  passives: readonly (readonly [string, number])[]
): Appearance | undefined {
  return rankedStyle(weapons, passives, APPEARANCES)
}

function rankedStyle<Style extends string>(
  weapons: readonly (readonly [string, number, ...unknown[]])[],
  passives: readonly (readonly [string, number])[],
  styles: Record<string, Style>,
  eligible?: readonly Style[]
): Style | undefined {
  let best = 3
  let career: Style | undefined
  for (const def of WEAPONS) {
    const owned = weapons.find(([id]) => id === def.id)
    const candidate = styles[def.id]
    if (!owned || !candidate || (eligible && !eligible.includes(candidate))) continue
    const evolved =
      owned[1] >= MAX_WEAPON_LEVEL && def.evolve && passives.some(([id, lv]) => id === def.evolve!.passive && lv > 0)
    const score = owned[1] + (evolved ? MAX_WEAPON_LEVEL : 0)
    if (score > best) {
      best = score
      career = candidate
    }
  }
  return career
}
