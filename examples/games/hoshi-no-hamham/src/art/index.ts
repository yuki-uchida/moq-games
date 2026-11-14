/**
 * Art registry: every sheet, terrain tile and backdrop the game draws, built lazily on first use and cached.
 * Art registers through the aggregators (chars/, world/, fx/, ui/). The registry never invents a drawing: asking
 * for something no module draws throws, and `tests/art-complete.test.ts` keeps the whole contract covered. Works
 * in Node (tests, review exports) and in browsers; nothing here touches the DOM.
 *
 * Art can also be painted by another thread (see `remote.ts`) and adopted here: asking for something adopted
 * returns it without painting, asking for anything else still paints it on the spot.
 */
import { charModules } from './chars'
import { allSheetSpecs, THEMES, type AnimSpec, type ThemeId, type TileQuery } from './contract'
import { fxModules } from './fx'
import type { SheetModule } from './module'
import { flash, type Raster } from './raster'
import { deferAnim, type Anim, type Sheet } from './sheet'
import { artStats, counted } from './stats'
import { uiModules } from './ui'
import { backdrops, propModules, terrains, type Backdrop, type Decor } from './world'
import { clearTileMemos, tileKey } from './world/terrain/kit'

export { THEMES, type ThemeId } from './contract'
export type { Anim, Sheet } from './sheet'
export { anchorOf, duration, frameAt } from './sheet'
export type { Backdrop, BackdropLayer, Decor } from './world'
export { tileKey } from './world/terrain/kit'

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

/**
 * Whatever the modules draw for the sheet right now, complete or not (for the review exporter's `--draft`, so a
 * sheet can be looked at while its clips are still being drawn). The game uses `sheet()`.
 */
export const draftSheet = (id: string): Sheet => drawn(id)

/** Contract animations of a sheet that no module draws. A report: it never throws. */
export function missingAnims(id: string): string[] {
  const real = drawn(id)
  return Object.keys(spec(id) ?? {}).filter((name) => !real[name])
}

/**
 * A clip as the registry hands it out: one stable object per clip that forwards to the module's lazy clip until a
 * finished clip is adopted, and serves the adopted one from then on. The getters only forward, so reading `fps`
 * draws exactly what reading the module clip's `fps` would.
 */
interface Slot {
  anim: Anim
  /** Adopted, or its frames were read once (and therefore drawn in this thread). */
  ready(): boolean
  adopt(finished: Anim): void
}

function slot(source: () => Anim): Slot {
  let adopted: Anim | undefined
  let read = false
  const current = () => adopted ?? source()
  return {
    anim: {
      get frames() {
        if (adopted) return adopted.frames
        const frames = source().frames
        read = true
        return frames
      },
      get fps() {
        return current().fps
      },
      get loop() {
        return current().loop
      },
      get hold() {
        return current().hold
      },
      get anchor() {
        return current().anchor
      },
      get sustain() {
        return current().sustain
      }
    },
    ready: () => Boolean(adopted) || read,
    adopt(finished) {
      // A clip already drawn here keeps its frames (and the canvases baked from them).
      if (!adopted && !read) adopted = finished
    }
  }
}

const slots = new Map<string, Map<string, Slot>>()
const flashSlots = new Map<string, Map<string, Slot>>()

/** The sheet with this id. Throws for unknown ids and when the contract asks for clips no module draws. */
export function sheet(id: string): Sheet {
  const cached = cache.get(id)
  if (cached) return cached
  const contract = spec(id)
  if (!contract && !REAL.has(id)) throw new Error(`Unknown sheet: ${id}`)
  const missing = missingAnims(id)
  if (missing.length) throw new Error(`Sheet "${id}" is not drawn: missing animations ${missing.join(', ')}`)
  const real = drawn(id)
  const own = new Map<string, Slot>()
  // Contract order first, so review sheets always list the clips the same way.
  const result: Sheet = {}
  const add = (name: string) => {
    if (own.has(name)) return
    const s = slot(() => real[name])
    own.set(name, s)
    result[name] = s.anim
  }
  for (const name of Object.keys(contract ?? {})) add(name)
  for (const name of Object.keys(real)) add(name)
  slots.set(id, own)
  cache.set(id, result)
  return result
}

/** The white silhouette of a clip, drawn when its frames are first read. */
const flashAnim = (a: Anim): Anim => deferAnim(() => ({ ...a, frames: a.frames.map(flash) }))

const flashCache = new Map<string, Sheet>()
/**
 * White silhouettes of every frame of a sheet (hit flash). An unadopted silhouette derives from the sheet's clip,
 * so it uses adopted frames when there are.
 */
export function flashSheet(id: string): Sheet {
  let s = flashCache.get(id)
  if (s) return s
  const own = new Map<string, Slot>()
  s = {}
  for (const [name, anim] of Object.entries(sheet(id))) {
    let derived: Anim | undefined
    const flashSlot = slot(() => (derived ??= flashAnim(anim)))
    own.set(name, flashSlot)
    s[name] = flashSlot.anim
  }
  flashSlots.set(id, own)
  flashCache.set(id, s)
  return s
}

function slotOf(table: Map<string, Map<string, Slot>>, build: (id: string) => Sheet, id: string, name: string) {
  if (!table.has(id)) build(id)
  const found = table.get(id)?.get(name)
  if (!found) throw new Error(`Sheet "${id}" has no clip "${name}"`)
  return found
}

/** True when the clip's frames are here: adopted, or already drawn in this thread. */
export const clipReady = (id: string, name: string) => slotOf(slots, sheet, id, name).ready()

/** True when the clip's hit-flash silhouettes are here. */
export const flashReady = (id: string, name: string) => slotOf(flashSlots, flashSheet, id, name).ready()

/** Takes a clip painted elsewhere; a clip that is already here keeps its frames. Adopting paints nothing. */
export function adoptClip(id: string, name: string, anim: Anim) {
  slotOf(slots, sheet, id, name).adopt(anim)
  artStats.remote = true
}

/** Takes a clip's hit-flash silhouettes painted elsewhere (see `adoptClip`). */
export function adoptFlashClip(id: string, name: string, anim: Anim) {
  slotOf(flashSlots, flashSheet, id, name).adopt(anim)
  artStats.remote = true
}

/** True when the theme's terrain painter exists. */
export const hasTerrain = (theme: ThemeId) => Boolean(terrains[theme])

/** Tiles by theme and the painters' cache key (`tileKey`): adopted ones and those painted here. */
const tiles = new Map<ThemeId, Map<string, Raster>>()
const tilesOf = (theme: ThemeId) => {
  let table = tiles.get(theme)
  if (!table) tiles.set(theme, (table = new Map()))
  return table
}

/** True when the tile for this query is here (adopted or painted in this thread). */
export const hasTile = (q: TileQuery) => Boolean(tiles.get(q.theme)?.has(tileKey(q)))

/** Takes a tile painted elsewhere; a tile that is already here stays. Adopting paints nothing. */
export function adoptTile(q: TileQuery, r: Raster) {
  const table = tilesOf(q.theme)
  const key = tileKey(q)
  if (!table.has(key)) table.set(key, r)
  artStats.remote = true
}

/**
 * One 64×64 terrain tile: an adopted one, or painted here (the painters cache their variants, and every query with
 * the same key gets the same tile). Throws when the theme has no terrain painter.
 */
export function tile(q: TileQuery): Raster {
  const table = tilesOf(q.theme)
  const key = tileKey(q)
  const known = table.get(key)
  if (known) return known
  const painter = terrains[q.theme]
  if (!painter) throw new Error(`Terrain "${q.theme}" is not drawn`)
  const r = painter.tile(q)
  if (r.w !== 64 || r.h !== 64) throw new Error(`Tile ${q.theme}/${q.kind} is ${r.w}×${r.h}, expected 64×64`)
  table.set(key, r)
  return r
}

/** The decorations the view scatters over the theme's exposed terrain. */
export const decor = (theme: ThemeId): Decor[] => terrains[theme]?.decor ?? []

const backdropCache = new Map<ThemeId, Backdrop>()
/** True when the theme's backdrop is drawn. */
export const hasBackdrop = (theme: ThemeId) => Boolean(backdrops[theme])

/** True when the theme's backdrop is here (adopted or built in this thread). */
export const backdropReady = (theme: ThemeId) => backdropCache.has(theme)

/** Takes a backdrop painted elsewhere; one that is already here stays. Adopting paints nothing. */
export function adoptBackdrop(theme: ThemeId, art: Backdrop) {
  if (!backdropCache.has(theme)) backdropCache.set(theme, art)
  artStats.remote = true
}

/** The theme's sky and parallax layers. Throws when the theme has no backdrop. */
export function backdrop(theme: ThemeId): Backdrop {
  const cached = backdropCache.get(theme)
  if (cached) return cached
  const build = backdrops[theme]
  if (!build) throw new Error(`Backdrop "${theme}" is not drawn`)
  const built = counted('backdrops', build)
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

/**
 * Drops every cached sheet, tile and backdrop (for review tools that regenerate art, and to trim a worker after a
 * warm-up). The terrain painters keep their own variant caches.
 */
export function clearArtCache() {
  cache.clear()
  drawnCache.clear()
  flashCache.clear()
  slots.clear()
  flashSlots.clear()
  backdropCache.clear()
  tiles.clear()
  clearTileMemos()
}
