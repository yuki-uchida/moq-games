/**
 * Stage 4 people: its four guild enemies, its boss sheets (and minions), built lazily.
 * Ids missing here fall back to placeholders.
 */
import type { Sheet } from '../sheet'

export const stage4Sheets: Record<string, () => Sheet> = {}
