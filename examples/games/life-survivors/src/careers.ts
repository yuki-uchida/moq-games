import { MAX_WEAPON_LEVEL, WEAPONS } from './data'

export type Career = 'soccer' | 'bureaucrat' | 'entrepreneur'

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

export function rankedCareer(
  weapons: readonly (readonly [string, number, ...unknown[]])[],
  passives: readonly (readonly [string, number])[],
  eligible?: readonly Career[]
): Career | undefined {
  let best = 3
  let career: Career | undefined
  for (const def of WEAPONS) {
    const owned = weapons.find(([id]) => id === def.id)
    const candidate = CAREERS[def.id]
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
