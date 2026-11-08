/**
 * Stage 2 people: its four guild enemies, its boss sheets (and minions), built lazily.
 * Ids missing here fall back to placeholders.
 */
import type { Sheet } from '../sheet'
import { stage2Enemies } from './s2-enemies'
import { buildCatSheet } from './s2-cat'
import { buildMildaSheet } from './s2-milda'

export const stage2Sheets: Record<string, () => Sheet> = {
  ...stage2Enemies,
  'boss:milda': buildMildaSheet,
  'boss:cat': buildCatSheet
}
