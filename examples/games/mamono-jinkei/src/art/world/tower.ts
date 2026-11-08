/**
 * Stage art for `tower`: the `props:tower` sheet and the terrain tile painter. Missing art falls back to placeholders.
 */
import type { TileQuery } from '../index'
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'

export const towerProps: Record<string, () => Sheet> = {}
export const towerTile: ((q: TileQuery) => Raster | undefined) | undefined = undefined
