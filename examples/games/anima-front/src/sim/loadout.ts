/** Placeholder until the sim is implemented (owned by the sim workstream). */
import type { ItemId } from '../data/items'
import { LOADOUT_SLOTS, type Loadout } from '../data/loadout'
import type { SpeciesId } from '../data/species'
import type { SustainReport } from './api'

export function sanitizeLoadout(_loadout: unknown): Loadout {
  return { slots: Array.from({ length: LOADOUT_SLOTS }, () => null) }
}

export function loadoutErrors(_loadout: Loadout): string[] {
  return []
}

export function handLists(_loadout: Loadout): { R: ItemId[]; L: ItemId[]; passive: ItemId[] } {
  return { R: [], L: [], passive: [] }
}

export function sustainEstimate(_species: SpeciesId, _loadout: Loadout): SustainReport {
  throw new Error('sustainEstimate is not implemented yet')
}
