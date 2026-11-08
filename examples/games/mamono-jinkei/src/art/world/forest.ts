/**
 * Stage art for `forest`: the `props:forest` sheet and the terrain tile painter. Missing art falls back to placeholders.
 */
import type { TileQuery } from '../index'
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'
import { forestTile as paintForestTile } from './forest-tiles'
import { forestStageProps } from './forest-props'
import { forestScenery } from './forest-trees'

export const forestProps: Record<string, () => Sheet> = {
  'props:forest': () => ({ ...forestStageProps(), ...forestScenery() })
}
export const forestTile: ((q: TileQuery) => Raster | undefined) | undefined = paintForestTile
