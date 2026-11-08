/**
 * The rat heroes `hero:rat:<job>` and the rat co-op technique sprites `tech:rat`, built lazily.
 * Ids missing here fall back to placeholders.
 */
import type { Sheet } from '../sheet'

export const ratSheets: Record<string, () => Sheet> = {}
