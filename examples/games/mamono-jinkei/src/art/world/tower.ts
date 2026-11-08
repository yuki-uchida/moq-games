/**
 * Stage art for `tower`: the `props:tower` sheet and the terrain tile painter. Missing art falls back to placeholders.
 */
import type { TileQuery } from '../index'
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'
import { propsA } from './tower-props-a'
import { propsB } from './tower-props-b'
import { towerTileImpl } from './tower-tiles'

export const towerProps: Record<string, () => Sheet> = { 'props:tower': () => ({ ...propsA(), ...propsB() }) }
export const towerTile: ((q: TileQuery) => Raster | undefined) | undefined = towerTileImpl
