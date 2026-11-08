/**
 * Art registry: every sheet and terrain tile the game draws, built lazily on first use and cached.
 * Real art modules register through the aggregators (heroes/, people/, world/, fx/); anything not yet drawn falls
 * back to contract-shaped placeholders so the game always runs. Works in Node (tests, review exports) and browsers.
 */
import { TILE, type StageId, type TileKind } from '../vocab'
import { TILE_FRAMES, allSheetSpecs, type AnimSpec } from './contract'
import { fxSheets, textRaster as fontRaster, type TextStyle } from './fx'
import { heroSheets, techSheets } from './heroes'
import { bossSheets, enemySheets, npcSheets } from './people'
import { placeholderSheet, placeholderTile } from './placeholder'
import { Raster, flash } from './raster'
import type { Sheet } from './sheet'
import { propSheets, tileProviders } from './world'

export type { Anim, Sheet } from './sheet'
export { frameAt, duration, anchorOf } from './sheet'
export type { TextStyle } from './fx'

const REAL: Record<string, () => Sheet> = {
  ...heroSheets,
  ...techSheets,
  ...enemySheets,
  ...bossSheets,
  ...npcSheets,
  ...propSheets,
  ...fxSheets
}

let specs: Record<string, Record<string, AnimSpec>> | undefined
const spec = (id: string) => (specs ??= allSheetSpecs())[id]

const cache = new Map<string, Sheet>()

/** True when real (non-placeholder) art is registered for the sheet. */
export const hasArt = (id: string) => id in REAL

/** Every sheet id the game may ask for. */
export const sheetIds = () => [...new Set([...Object.keys((specs ??= allSheetSpecs())), ...Object.keys(REAL)])]

/** The sheet with this id (real art when registered, else a placeholder). Throws for unknown ids. */
export function sheet(id: string): Sheet {
  let s = cache.get(id)
  if (s) return s
  const make = REAL[id]
  if (make) s = make()
  else {
    const contract = spec(id)
    if (!contract) throw new Error(`Unknown sheet: ${id}`)
    s = placeholderSheet(id, contract)
  }
  cache.set(id, s)
  return s
}

const flashCache = new Map<string, Sheet>()
/** White silhouettes of every frame of a sheet (hit flash). */
export function flashSheet(id: string): Sheet {
  let s = flashCache.get(id)
  if (s) return s
  const base = sheet(id)
  s = Object.fromEntries(Object.entries(base).map(([k, a]) => [k, { ...a, frames: a.frames.map(flash) }]))
  flashCache.set(id, s)
  return s
}

/** What the terrain painter needs to know about one tile. */
export interface TileQuery {
  stage: StageId
  kind: TileKind
  /** Kinds of the 8 neighbours in order N, NE, E, SE, S, SW, W, NW (undefined = outside the map). */
  around: readonly (TileKind | undefined)[]
  /** Map coordinates, for deterministic variation. */
  tx: number
  ty: number
  /** Animation frame for animated kinds (see TILE_FRAMES), else 0. */
  frame: number
}

/**
 * One 64×64 terrain tile. Not cached here: the renderer paints tiles once into ground chunks, and providers cache
 * their own variants (they must be deterministic for the same query).
 */
export function tile(q: TileQuery): Raster {
  const frames = TILE_FRAMES[q.kind] ?? 1
  const frame = ((q.frame % frames) + frames) % frames
  const r = tileProviders[q.stage]?.({ ...q, frame }) ?? placeholderTile(q.kind, frame)
  if (r.w !== TILE || r.h !== TILE) throw new Error(`Tile ${q.kind} is ${r.w}×${r.h}, expected ${TILE}×${TILE}`)
  return r
}

/** Frame count of an animated terrain kind (1 for still kinds). */
export const tileFrames = (kind: TileKind) => TILE_FRAMES[kind] ?? 1

/** Text in the bitmap font, or undefined when the font is not drawn yet. */
export const textRaster = (text: string, style: TextStyle): Raster | undefined => fontRaster?.(text, style)

/** Drops every cached sheet (for review tools that regenerate art). */
export function clearArtCache() {
  cache.clear()
  flashCache.clear()
}
