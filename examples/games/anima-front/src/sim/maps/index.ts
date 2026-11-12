/**
 * The five maps of DESIGN §14 as static MapDef data. `getMap` builds each map/variant once (deterministically, from a
 * fixed seed) and returns the same deep-frozen instance afterwards.
 */
import type { MapDef, MapId } from '../types'
import { buildArena } from './arena'
import { buildBlight } from './blight'
import { deepFreeze } from './builder'
import { buildHarbor } from './harbor'
import { buildOldtown } from './oldtown'
import { buildRange } from './range'

export const MAP_IDS: readonly MapId[] = ['oldtown', 'harbor', 'blight', 'arena', 'range']

/** Variants each map understands (others are ignored and give the base map). */
export const MAP_VARIANTS: Readonly<Record<MapId, readonly ('night' | 'crater')[]>> = {
  oldtown: ['night'],
  harbor: [],
  blight: ['crater'],
  arena: [],
  range: []
}

const builders: Record<MapId, (variant?: 'night' | 'crater') => MapDef> = {
  oldtown: buildOldtown,
  harbor: buildHarbor,
  blight: buildBlight,
  arena: buildArena,
  range: buildRange
}

const cache = new Map<string, MapDef>()

export function getMap(id: MapId, variant?: 'night' | 'crater'): MapDef {
  const v = variant && MAP_VARIANTS[id].includes(variant) ? variant : undefined
  const key = v ? `${id}:${v}` : id
  let map = cache.get(key)
  if (!map) {
    map = deepFreeze(builders[id](v))
    cache.set(key, map)
  }
  return map
}
