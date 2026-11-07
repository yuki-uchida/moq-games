import { MAX_WEAPON_LEVEL, PASSIVE_BY_ID, WEAPON_BY_ID } from './data'
import type { Tag } from './data'
import type { ViewPlayer } from './view'
import { weaponAppearance } from './weapon-life'

export interface StatusItem {
  icon: string
  name: string
  level: number
  levelText: string
  detail: string
  strong?: Tag[]
  kind: 'parent' | 'weapon' | 'evolved' | 'passive'
}

export interface StatusModel {
  weapons: StatusItem[]
  passives: StatusItem[]
}

type StatusPlayer = Pick<ViewPlayer, 'weapons' | 'passives' | 'petAge'>

export function statusModel(player: StatusPlayer, age: number): StatusModel {
  const owned = new Set(player.passives.map(([id]) => id))
  const weapons = player.weapons.map(([id, lv]): StatusItem => {
    const def = WEAPON_BY_ID.get(id)!
    const appearance = weaponAppearance(id, age, player.petAge)
    const evolved = Boolean(def.evolve && lv >= MAX_WEAPON_LEVEL && owned.has(def.evolve.passive))
    const name = evolved
      ? `${def.evolve!.name}${appearance.name === def.name ? '' : `／${appearance.name}`}`
      : appearance.name
    return {
      icon: appearance.art,
      name,
      level: lv,
      levelText: lv >= MAX_WEAPON_LEVEL ? 'MAX' : String(lv),
      detail: [def.desc, def.perk].filter(Boolean).join(' '),
      strong: def.strong,
      kind: def.parent ? 'parent' : evolved ? 'evolved' : 'weapon'
    }
  })
  const passives = player.passives.map(([id, lv]): StatusItem => {
    const def = PASSIVE_BY_ID.get(id)!
    return {
      icon: def.id,
      name: def.name,
      level: lv,
      levelText: String(lv),
      detail: def.desc,
      kind: 'passive'
    }
  })
  return { weapons, passives }
}
