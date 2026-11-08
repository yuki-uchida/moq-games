/**
 * Shared effects, pick-ups, UI glyphs and the bitmap font: sheets `fx`, `items`, `ui`.
 * Each entry builds its sheet lazily; ids missing here fall back to placeholders (see ../index.ts).
 */
import type { Raster } from '../raster'
import type { Sheet } from '../sheet'
import { buildFx } from './effects'
import { textRaster as renderText, type TextStyle } from './font'
import { buildItems } from './items'
import { buildUi } from './ui'

export const fxSheets: Record<string, () => Sheet> = { fx: buildFx, items: buildItems, ui: buildUi }

export type { TextStyle }

/**
 * Renders text in the game's outlined bitmap font (digits, A–Z, + - × / ! ? : . and space; 8×10 cells at most),
 * or undefined until the font exists (callers then fall back to canvas text).
 */
export const textRaster: ((text: string, style: TextStyle) => Raster) | undefined = renderText
