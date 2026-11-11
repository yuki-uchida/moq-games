/**
 * Art registry: every sheet, terrain tile and backdrop the game draws, built lazily on first use and cached.
 * Art registers through the aggregators (chars/, world/, fx/, ui/). The registry never invents a drawing: asking
 * for something no module draws throws, and `tests/art-complete.test.ts` keeps the whole contract covered. Works
 * in Node (tests, review exports) and in browsers; nothing here touches the DOM.
 */
import { charModules } from './chars'
import { allSheetSpecs, THEMES, type AnimSpec, type ThemeId, type TileQuery } from './contract'
import { fxModules } from './fx'
import type { SheetModule } from './module'
import { flash, type Raster } from './raster'
import { deferAnim, type Anim, type Sheet } from './sheet'
import { uiModules } from './ui'
import { backdrops, propModules, terrains, type Backdrop, type Decor } from './world'

export { THEMES, type ThemeId } from './contract'
export type { Anim, Sheet } from './sheet'
export { anchorOf, duration, frameAt } from './sheet'
export type { Backdrop, BackdropLayer, Decor } from './world'

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
const drawnCache = new Map<string, Sheet>()

/** Every sheet id the game may ask for. */
export const sheetIds = () => [...new Set([...Object.keys((specs ??= allSheetSpecs())), ...REAL.keys()])]

/** True when at least one module draws an animation for the sheet. */
export const hasArt = (id: string) => REAL.has(id)

/** Everything the modules draw for the sheet (may lack contract clips). */
function drawn(id: string): Sheet {
  let real = drawnCache.get(id)
  if (real) return real
  real = {}
  for (const build of REAL.get(id) ?? [])
    for (const [name, anim] of Object.entries(build())) if (anim) real[name] = anim
  drawnCache.set(id, real)
  return real
}

/** Contract animations of a sheet that no module draws. A report: it never throws. */
export function missingAnims(id: string): string[] {
  const real = drawn(id)
  return Object.keys(spec(id) ?? {}).filter((name) => !real[name])
}

/** The sheet with this id. Throws for unknown ids and when the contract asks for clips no module draws. */
export function sheet(id: string): Sheet {
  const cached = cache.get(id)
  if (cached) return cached
  const contract = spec(id)
  if (!contract && !REAL.has(id)) throw new Error(`Unknown sheet: ${id}`)
  const missing = missingAnims(id)
  if (missing.length) throw new Error(`Sheet "${id}" is not drawn: missing animations ${missing.join(', ')}`)
  const real = drawn(id)
  // Contract order first, so review sheets always list the clips the same way.
  const result: Sheet = {}
  for (const name of Object.keys(contract ?? {})) result[name] = real[name]
  for (const [name, anim] of Object.entries(real)) result[name] ??= anim
  cache.set(id, result)
  return result
}

/** The white silhouette of a clip, drawn when its frames are first read. */
const flashAnim = (a: Anim): Anim => deferAnim(() => ({ ...a, frames: a.frames.map(flash) }))

const flashCache = new Map<string, Sheet>()
/** White silhouettes of every frame of a sheet (hit flash). */
export function flashSheet(id: string): Sheet {
  let s = flashCache.get(id)
  if (s) return s
  const base = sheet(id)
  s = Object.fromEntries(Object.entries(base).map(([k, a]) => [k, flashAnim(a)]))
  flashCache.set(id, s)
  return s
}

/** True when the theme's terrain painter exists. */
export const hasTerrain = (theme: ThemeId) => Boolean(terrains[theme])

/**
 * One 64×64 terrain tile. Not cached here: providers cache their own variants and the view caches baked tiles
 * (the result must be deterministic for the same query). Throws when the theme has no terrain painter.
 */
export function tile(q: TileQuery): Raster {
  const painter = terrains[q.theme]
  if (!painter) throw new Error(`Terrain "${q.theme}" is not drawn`)
  const r = painter.tile(q)
  if (r.w !== 64 || r.h !== 64) throw new Error(`Tile ${q.theme}/${q.kind} is ${r.w}×${r.h}, expected 64×64`)
  return r
}

/** The decorations the view scatters over the theme's exposed terrain. */
export const decor = (theme: ThemeId): Decor[] => terrains[theme]?.decor ?? []

const backdropCache = new Map<ThemeId, Backdrop>()
/** True when the theme's backdrop is drawn. */
export const hasBackdrop = (theme: ThemeId) => Boolean(backdrops[theme])

/** The theme's sky and parallax layers. Throws when the theme has no backdrop. */
export function backdrop(theme: ThemeId): Backdrop {
  const cached = backdropCache.get(theme)
  if (cached) return cached
  const build = backdrops[theme]
  if (!build) throw new Error(`Backdrop "${theme}" is not drawn`)
  const built = build()
  backdropCache.set(theme, built)
  return built
}

/** What the contract asks for and nothing draws yet (empty when the art is complete). A report: never throws. */
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
  drawnCache.clear()
  flashCache.clear()
  backdropCache.clear()
}
