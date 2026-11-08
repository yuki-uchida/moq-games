/**
 * Stage art for `forest`: the `props:forest` sheet and the terrain tile painter. Missing art falls back to placeholders.
 */
import type { TileQuery } from '../index'
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'

export const forestProps: Record<string, () => Sheet> = {}
export const forestTile: ((q: TileQuery) => Raster | undefined) | undefined = undefined
