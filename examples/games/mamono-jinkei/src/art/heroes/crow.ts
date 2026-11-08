/**
 * The crow heroes `hero:crow:<job>` and the crow co-op technique sprites `tech:crow`, built lazily.
 * Ids missing here fall back to placeholders.
 */
import type { Sheet } from '../sheet'

export const crowSheets: Record<string, () => Sheet> = {}
