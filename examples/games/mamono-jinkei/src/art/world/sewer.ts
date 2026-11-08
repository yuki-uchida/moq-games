/**
 * Stage art for `sewer`: the `props:sewer` sheet and the terrain tile painter. Missing art falls back to placeholders.
 */
import type { TileQuery } from '../index'
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'

export const sewerProps: Record<string, () => Sheet> = {}
export const sewerTile: ((q: TileQuery) => Raster | undefined) | undefined = undefined
