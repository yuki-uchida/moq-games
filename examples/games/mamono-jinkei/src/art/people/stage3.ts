/**
 * Stage 3 people: its four guild enemies, its boss sheets (and minions), built lazily.
 * Ids missing here fall back to placeholders.
 */
import type { Sheet } from '../sheet'

export const stage3Sheets: Record<string, () => Sheet> = {}
