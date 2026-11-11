/**
 * Art registry: every sheet, terrain tile and backdrop the game draws, built lazily on first use and cached.
 * Real art registers through the aggregators (chars/, world/, fx/, ui/); anything not drawn yet falls back to a
 * contract-shaped stand-in (placeholder.ts) so the game always runs. Works in Node (tests, review exports) and
 * in browsers; nothing here touches the DOM.
 */
import { charModules } from './chars'
import { allSheetSpecs, THEMES, type AnimSpec, type ThemeId, type TileQuery } from './contract'
import { fxModules } from './fx'
import type { SheetModule } from './module'
import { placeholderSheet, placeholderTile } from './placeholder'
import { flash, type Raster } from './raster'
import type { Sheet } from './sheet'
import { uiModules } from './ui'
import { backdrops, propModules, terrains, type Backdrop, type Decor } from './world'

export { THEMES, type ThemeId } from './contract'
export type { Anim, Sheet } from './sheet'
export { anchorOf, duration, frameAt } from './sheet'
export type { Backdrop, BackdropLayer, Decor } from './world'
// The first version's art, kept only until the view stops using it.
export { bakeArt, buildArt, getArt, type ArtSet, type BakedArt } from './legacy'

const REAL = new Map<string, (() => Partial<Sheet>)[]>()
const register = (modules: SheetModule[]) => {
  for (const module of modules)
    for (const [id, build] of Object.entries(module)) REAL.set(id, [...(REAL.get(id) ?? []), build])
}
register(charModules)
register(propModules)
register(fxModules)
register(uiModules)

let specs: Record<string, Record<string, AnimSpec>> | undefined
const spec = (id: string) => (specs ??= allSheetSpecs())[id]

const cache = new Map<string, Sheet>()
const filled = new Map<string, string[]>()

/** Every sheet id the game may ask for. */
export const sheetIds = () => [...new Set([...Object.keys((specs ??= allSheetSpecs())), ...REAL.keys()])]

/** True when at least one real (non-placeholder) animation is registered for the sheet. */
export const hasArt = (id: string) => REAL.has(id)

/**
 * The sheet with this id: real art where registered, with every contract animation the art does not draw yet
 * filled by a stand-in (see `missingAnims`). Throws for unknown ids.
 */
export function sheet(id: string): Sheet {
  const cached = cache.get(id)
  if (cached) return cached
  const contract = spec(id)
  const builders = REAL.get(id)
  if (!builders && !contract) throw new Error(`Unknown sheet: ${id}`)
  const real: Sheet = {}
  for (const build of builders ?? []) for (const [name, anim] of Object.entries(build())) if (anim) real[name] = anim
  const missing = Object.fromEntries(Object.entries(contract ?? {}).filter(([name]) => !real[name]))
  filled.set(id, Object.keys(missing))
  const standIns = Object.keys(missing).length ? placeholderSheet(id, missing) : {}
  // Contract order first, so review sheets always list the clips the same way.
  const result: Sheet = {}
  for (const name of Object.keys(contract ?? {})) result[name] = real[name] ?? standIns[name]
  for (const [name, anim] of Object.entries(real)) result[name] ??= anim
  cache.set(id, result)
  return result
}

/** Contract animations of a sheet that are still stand-ins (all of them when the sheet has no real art). */
export function missingAnims(id: string): string[] {
  sheet(id)
  return filled.get(id) ?? []
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

/** True when the theme's terrain painter exists (its tiles are not stand-ins). */
export const hasTerrain = (theme: ThemeId) => Boolean(terrains[theme])

/**
 * One 64×64 terrain tile. Not cached here: providers cache their own variants and the view caches baked tiles
 * (the result must be deterministic for the same query).
 */
export function tile(q: TileQuery): Raster {
  const r = terrains[q.theme]?.tile(q) ?? placeholderTile(q)
  if (r.w !== 64 || r.h !== 64) throw new Error(`Tile ${q.theme}/${q.kind} is ${r.w}×${r.h}, expected 64×64`)
  return r
}

/** The decorations the view scatters over the theme's exposed terrain (empty until its terrain is drawn). */
export const decor = (theme: ThemeId): Decor[] => terrains[theme]?.decor ?? []

const backdropCache = new Map<ThemeId, Backdrop>()
/** True when the theme's backdrop is drawn. */
export const hasBackdrop = (theme: ThemeId) => Boolean(backdrops[theme])

/** The theme's sky and parallax layers, or undefined while it is not drawn (the view keeps its old backdrop). */
export function backdrop(theme: ThemeId): Backdrop | undefined {
  const cached = backdropCache.get(theme)
  if (cached) return cached
  const built = backdrops[theme]?.()
  if (built) backdropCache.set(theme, built)
  return built
}

/** What is still a stand-in, for the contract test and the review exporter. */
export function pendingArt(): { sheets: Record<string, string[]>; terrain: ThemeId[]; backdrops: ThemeId[] } {
  const sheets: Record<string, string[]> = {}
  for (const id of sheetIds()) {
    const missing = missingAnims(id)
    if (missing.length) sheets[id] = missing
  }
  return {
    sheets,
    terrain: THEMES.filter((theme) => !hasTerrain(theme)),
    backdrops: THEMES.filter((theme) => !hasBackdrop(theme))
  }
}

/** Drops every cached sheet (for review tools that regenerate art). */
export function clearArtCache() {
  cache.clear()
  flashCache.clear()
  filled.clear()
  backdropCache.clear()
}
