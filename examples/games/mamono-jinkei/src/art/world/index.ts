/**
 * Stage terrain and props: `props:<stage>` sheets and terrain tiles.
 * `tileProviders[stage]` draws one 64×64 terrain tile from its neighbourhood; stages without a provider (and kinds
 * a provider returns undefined for) fall back to placeholders (see ../index.ts).
 */
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'
import type { StageId } from '../../vocab'
import type { TileQuery } from '../index'
import { meadowTile } from './meadow-tiles'
import { featSheet } from './props-feat'
import { natureSheet } from './props-nature'
import { ruinsSheet } from './props-ruins'

export const propSheets: Record<string, () => Sheet> = {
  'props:meadow': () => ({ ...natureSheet(), ...ruinsSheet(), ...featSheet() })
}
export const tileProviders: Partial<Record<StageId, (q: TileQuery) => Raster | undefined>> = {
  meadow: meadowTile
}
