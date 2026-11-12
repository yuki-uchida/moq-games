/**
 * Match setup shared by every lobby: what the player picked (mode, mission, difficulty, animal, loadout) →
 * lobby seats (humans + bots filling every empty seat) → the sim's MatchConfig.
 */
import { KUROZUME_SQUADS, type Difficulty, type FoeKind } from '../data/enemies'
import type { ItemId } from '../data/items'
import type { PrepareRequest } from '../models/api'
import { presetById, type Loadout } from '../data/loadout'
import { MISSIONS, type MissionId } from '../data/missions'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species'
import type { MapId, MatchConfig, ModeId, PlayerConfig, PropKind, TeamId } from '../sim/types'
import { cloneLoadout } from './loadouts'

export interface MatchSelection {
  mode: ModeId
  mission?: MissionId
  difficulty?: Difficulty
  training?: { tutorial: boolean; infiniteAnima: boolean }
}

export interface Seat {
  /** Player id inside the match. */
  id: string
  name: string
  species: SpeciesId
  loadout: Loadout
  loadoutName: string
  team: TeamId
  /** Bot skill 0..1, or undefined for a human. */
  bot?: number
  /** This browser's player. */
  local: boolean
  ready: boolean
}

export const SEATS_PER_TEAM = 4

export const TEAMS: readonly { id: TeamId; name: string; color: string; pattern: 'stripes' | 'dots' | 'chevrons' }[] = [
  { id: 0, name: 'アカネ隊', color: '#e5484d', pattern: 'stripes' },
  { id: 1, name: 'アオイ隊', color: '#3e8ed0', pattern: 'dots' },
  { id: 2, name: 'キハダ隊', color: '#f2b33d', pattern: 'chevrons' }
]

export const MODE_LABELS: Record<ModeId, string> = { pve: '防衛任務', pvp: '三つ巴演習', training: '訓練場' }

export function seatCount(mode: ModeId): number {
  return mode === 'pvp' ? SEATS_PER_TEAM * 3 : mode === 'pve' ? SEATS_PER_TEAM : 1
}

export function botSkill(sel: MatchSelection): number {
  if (sel.mode === 'pvp') return 0.6
  if (sel.mode === 'training') return 0.4
  return sel.difficulty === 'easy' ? 0.45 : sel.difficulty === 'hard' ? 0.85 : 0.65
}

export function mapFor(sel: MatchSelection): { map: MapId; variant?: 'night' | 'crater' } {
  if (sel.mode === 'pvp') return { map: 'arena' }
  if (sel.mode === 'training') return { map: 'range' }
  const m = MISSIONS[sel.mission ?? 'sakura']
  return m.variant ? { map: m.map, variant: m.variant } : { map: m.map }
}

export const MAP_NAMES: Record<MapId, string> = {
  oldtown: 'ヒナタ旧市街',
  harbor: '港湾ブロック',
  blight: '侵蝕域',
  arena: 'ユメクジラ演習場',
  range: '訓練場'
}

export function mapLabel(sel: MatchSelection): string {
  const { map, variant } = mapFor(sel)
  if (variant === 'night') return `${MAP_NAMES[map]}（夜）`
  if (variant === 'crater') return `${MAP_NAMES[map]}・クレーター`
  return MAP_NAMES[map]
}

/**
 * Fills the seats around the local player. Squad mates are the other ARK members (each animal once while
 * possible) with their default presets; PvP opponents too, so a 12-seat match uses every animal.
 */
export function buildSeats(
  sel: MatchSelection,
  me: { id: string; name: string; species: SpeciesId; loadout: Loadout; loadoutName: string; team?: TeamId },
  humans: readonly Omit<Seat, 'bot' | 'local'>[] = []
): Seat[] {
  const count = seatCount(sel.mode)
  const seats: Seat[] = []
  const myTeam: TeamId = sel.mode === 'pvp' ? (me.team ?? 0) : 0
  seats.push({ ...me, loadout: cloneLoadout(me.loadout), team: myTeam, local: true, ready: true })
  for (const h of humans) if (seats.length < count) seats.push({ ...h, local: false })
  const skill = botSkill(sel)
  const used = new Map<string, number>()
  for (const s of seats) used.set(s.name, (used.get(s.name) ?? 0) + 1)
  // Teams in seat order: fill the local team first, then the others.
  const teamOrder: TeamId[] =
    sel.mode === 'pvp' ? [myTeam, ...([0, 1, 2] as TeamId[]).filter((t) => t !== myTeam)] : [0]
  let pick = SPECIES_IDS.indexOf(me.species) + 1
  let botIndex = 1
  for (const team of teamOrder) {
    while (seats.filter((s) => s.team === team).length < (sel.mode === 'pvp' ? SEATS_PER_TEAM : count)) {
      const taken = new Set(seats.filter((s) => s.team === team).map((s) => s.species))
      let species = SPECIES_IDS[pick % SPECIES_IDS.length]
      for (let k = 0; k < SPECIES_IDS.length && taken.has(species); k++) {
        pick++
        species = SPECIES_IDS[pick % SPECIES_IDS.length]
      }
      pick++
      const def = SPECIES[species]
      const preset = presetById(def.preset)
      const n = (used.get(def.name) ?? 0) + 1
      used.set(def.name, n)
      seats.push({
        id: `bot${botIndex++}`,
        name: n > 1 ? `${def.name}${['', '', 'Ⅱ', 'Ⅲ', 'Ⅳ'][n] ?? n}` : def.name,
        species,
        loadout: cloneLoadout(preset.loadout),
        loadoutName: preset.name,
        team,
        bot: skill,
        local: false,
        ready: true
      })
    }
  }
  return seats
}

export function matchConfig(sel: MatchSelection, seats: readonly Seat[], seed: number): MatchConfig {
  const { map, variant } = mapFor(sel)
  const players: PlayerConfig[] = seats.map((s) => {
    const p: PlayerConfig = {
      id: s.id,
      name: s.name,
      species: s.species,
      loadout: cloneLoadout(s.loadout),
      team: s.team
    }
    if (s.bot != null) p.bot = s.bot
    return p
  })
  const config: MatchConfig = { mode: sel.mode, map, seed: seed >>> 0, players }
  if (variant) config.variant = variant
  if (sel.mode === 'pve') {
    config.mission = sel.mission ?? 'sakura'
    config.difficulty = sel.difficulty ?? 'normal'
  }
  if (sel.mode === 'training') {
    config.training = { tutorial: sel.training?.tutorial ?? false, infiniteAnima: sel.training?.infiniteAnima ?? false }
  }
  return config
}

/** Theme per mission / mode for the in-game music. */
export function musicFor(sel: MatchSelection) {
  if (sel.mode === 'pvp') return 'pvp' as const
  if (sel.mode === 'training') return 'training' as const
  switch (sel.mission) {
    case 'harbor':
      return 'harbor' as const
    case 'nightraid':
      return 'night' as const
    case 'blight':
      return 'blight' as const
    case 'maw':
      return 'finalBoss' as const
    default:
      return 'oldtown' as const
  }
}

export const PROP_KINDS: PropKind[] = [
  'frog',
  'hermit',
  'honey',
  'decoy',
  'leafDecoy',
  'ink',
  'lighthouse',
  'zone',
  'cart',
  'node',
  'target',
  'pad',
  'base',
  'tutorial'
]

/** Only what this match can show: its animals, their antiques, the mission's foes, every prop kind. */
export function prepareRequestFor(config: MatchConfig): PrepareRequest {
  const species = new Set<SpeciesId>(config.players.map((p) => p.species))
  const items = new Set<ItemId>()
  for (const p of config.players) for (const s of p.loadout.slots) if (s) items.add(s.item)
  const foes = new Set<FoeKind>()
  if (config.mode === 'pve') {
    const m = MISSIONS[config.mission ?? 'sakura']
    for (const w of m.waves) for (const g of w.groups) foes.add(g.kind)
    if (m.objective.kind === 'boss') foes.add(m.objective.foe)
    if (m.objective.kind === 'capture' && m.objective.boss) foes.add(m.objective.boss)
    if (foes.has('kuitsukushi')) foes.add('tsubute')
    if (foes.has('kurozume')) {
      for (const k of KUROZUME_SQUADS) {
        species.add(k.species)
        for (const id of [...k.r, ...k.l]) items.add(id)
      }
    }
  }
  return { species: [...species], items: [...items], foes: [...foes], props: PROP_KINDS }
}
