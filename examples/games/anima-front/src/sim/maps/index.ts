/** Placeholder until the maps are built (owned by the maps workstream). */
import type { MapDef, MapId } from '../types'

export const MAP_IDS: readonly MapId[] = ['oldtown', 'harbor', 'blight', 'arena', 'range']

export function getMap(id: MapId, _variant?: 'night' | 'crater'): MapDef {
  return {
    id,
    name: id,
    theme: 'day',
    bounds: { min: [-40, -40], max: [40, 40] },
    boxes: [],
    spawns: [{ team: 'squad', p: [0, 0, 0], yaw: 0 }],
    bases: [],
    foeSpawns: [],
    pads: [],
    anchors: {},
    paths: {},
    decor: []
  }
}
