import type { ThemeId } from '../contract'
import type { SheetModule } from '../module'
import { backdrop as castleBackdrop } from './backdrop/castle'
import { backdrop as caveBackdrop } from './backdrop/cave'
import { backdrop as forestBackdrop } from './backdrop/forest'
import { backdrop as fortressBackdrop } from './backdrop/fortress'
import { backdrop as meadowBackdrop } from './backdrop/meadow'
import { backdrop as nightBackdrop } from './backdrop/night'
import { backdrop as starBackdrop } from './backdrop/star'
import { sheets as doors } from './props/doors'
import { sheets as gimmicks } from './props/gimmicks'
import { sheets as items } from './props/items'
import { sheets as trees } from './props/trees'
import { terrain as castleTerrain } from './terrain/castle'
import { terrain as caveTerrain } from './terrain/cave'
import { terrain as forestTerrain } from './terrain/forest'
import { terrain as fortressTerrain } from './terrain/fortress'
import { terrain as meadowTerrain } from './terrain/meadow'
import { terrain as nightTerrain } from './terrain/night'
import { terrain as starTerrain } from './terrain/star'
import type { Backdrop, TerrainArt } from './types'

export type { Backdrop, BackdropLayer, Decor, TerrainArt, TileProvider } from './types'

export const propModules: SheetModule[] = [trees, gimmicks, doors, items]

export const terrains: Record<ThemeId, TerrainArt | undefined> = {
  meadow: meadowTerrain,
  night: nightTerrain,
  cave: caveTerrain,
  forest: forestTerrain,
  fortress: fortressTerrain,
  castle: castleTerrain,
  star: starTerrain
}

export const backdrops: Record<ThemeId, (() => Backdrop) | undefined> = {
  meadow: meadowBackdrop,
  night: nightBackdrop,
  cave: caveBackdrop,
  forest: forestBackdrop,
  fortress: fortressBackdrop,
  castle: castleBackdrop,
  star: starBackdrop
}
