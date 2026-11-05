import { MAX_WEAPON_LEVEL, PASSIVE_BY_ID, WEAPON_BY_ID } from './data'
import { activePersonalitySynergies, activeSynergies, personalitySynergyDetails, SYNERGIES } from './synergies'
import type { ViewPlayer } from './view'
import { weaponAppearance } from './weapon-life'

export interface StatusItem {
  icon: string
  name: string
  level: number
  levelText: string
  detail: string
  kind: 'parent' | 'weapon' | 'evolved' | 'passive'
}

export interface SynergyRow {
  name: string
  text: string
  active: boolean
}

export interface PersonalitySynergyRow {
  weapon: string
  text: string
}

export interface StatusModel {
  personalitySynergies: PersonalitySynergyRow[]
  weapons: StatusItem[]
  passives: StatusItem[]
  synergies: SynergyRow[]
  activeCount: number
  total: number
}

type StatusPlayer = Pick<ViewPlayer, 'weapons' | 'passives' | 'petAge'> & { maxHp?: number }

export function personalitySynergyRows(player: StatusPlayer): PersonalitySynergyRow[] {
  return activePersonalitySynergies(
    player.weapons.map(([id]) => id),
    player.passives,
    player.maxHp ?? 0
  ).map(({ weapon, text }) => ({ weapon: WEAPON_BY_ID.get(weapon)?.name ?? weapon, text }))
}

export function synergyRows(player: Pick<StatusPlayer, 'weapons'>): SynergyRow[] {
  const active = activeSynergies(player.weapons.map(([id]) => id))
  return SYNERGIES.map((synergy) => ({
    name: synergy.name,
    text: synergy.text,
    active: active.includes(synergy)
  }))
}

export function statusModel(player: StatusPlayer, age: number): StatusModel {
  const owned = new Set(player.passives.map(([id]) => id))
  const details = (id: string) =>
    personalitySynergyDetails(
      id,
      player.weapons.map(([weapon]) => weapon),
      player.passives,
      player.maxHp ?? 0
    )
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
      detail: [def.desc, def.perk, ...details(id)].filter(Boolean).join(' '),
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
      detail: [def.desc, ...details(id)].join(' '),
      kind: 'passive'
    }
  })
  const synergies = synergyRows(player)
  return {
    personalitySynergies: personalitySynergyRows(player),
    weapons,
    passives,
    synergies,
    activeCount: synergies.filter((row) => row.active).length,
    total: synergies.length
  }
}
