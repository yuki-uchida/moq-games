/**
 * The wolf heroes `hero:wolf:<job>` and the wolf co-op technique sprites `tech:wolf`, built lazily.
 * Ids missing here fall back to placeholders.
 */
import type { Sheet } from '../sheet'

export const wolfSheets: Record<string, () => Sheet> = {}
