import type { Ambience, DecorSpec, TileQuery } from '../contract'
import type { Raster } from '../raster'

/** Paints one 64×64 terrain tile. Must be deterministic for the same query; cache variants inside the module. */
export type TileProvider = (q: TileQuery) => Raster

export interface Decor extends DecorSpec {
  image: Raster
  /** The pixel that sits on the tile edge: bottom centre for `top`, top centre for `under`. */
  anchor: readonly [number, number]
}

export interface TerrainArt {
  tile: TileProvider
  decor: Decor[]
}

/**
 * One parallax layer. The view tiles `image` horizontally (its width must be 640) and extends its last pixel
 * row down to the bottom of the view.
 */
export interface BackdropLayer {
  image: Raster
  /** 0 = fixed to the screen, 1 = moves with the world; foreground layers use more than 1. */
  parallax: number
  /** Top of the layer in view pixels while the hero stands on the main ground of the stage. */
  y: number
  /** Auto-scroll in art px/s to the left (clouds, mist). */
  drift?: number
  /** Drawn in front of the world (dark foreground silhouettes at the screen edges). */
  front?: boolean
}

export interface Backdrop {
  /** 640×360, fixed to the screen. */
  sky: Raster
  /** Back to front. */
  layers: BackdropLayer[]
  /** The drifting particles the view adds for this world. */
  ambience: Ambience
}
