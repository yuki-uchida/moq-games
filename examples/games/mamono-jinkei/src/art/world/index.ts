/**
 * Stage terrain and props: `props:<stage>` sheets and terrain tiles.
 * `tileProviders[stage]` draws one 64×64 terrain tile from its neighbourhood; stages without a provider (and kinds
 * a provider returns undefined for) fall back to placeholders (see ../index.ts).
 * Stage 1 lives in meadow-tiles.ts/props-*.ts; stages 2–4 each own a module (sewer.ts, tower.ts, forest.ts).
 */
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'
import type { StageId } from '../../vocab'
import type { TileQuery } from '../index'
import { forestProps, forestTile } from './forest'
import { meadowTile } from './meadow-tiles'
import { featSheet } from './props-feat'
import { natureSheet } from './props-nature'
import { ruinsSheet } from './props-ruins'
import { sewerProps, sewerTile } from './sewer'
import { towerProps, towerTile } from './tower'

export const propSheets: Record<string, () => Sheet> = {
  'props:meadow': () => ({ ...natureSheet(), ...ruinsSheet(), ...featSheet() }),
  ...sewerProps,
  ...towerProps,
  ...forestProps
}
export const tileProviders: Partial<Record<StageId, (q: TileQuery) => Raster | undefined>> = {
  meadow: meadowTile,
  ...(sewerTile && { sewer: sewerTile }),
  ...(towerTile && { tower: towerTile }),
  ...(forestTile && { forest: forestTile })
}
