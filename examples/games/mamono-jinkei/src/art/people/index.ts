/**
 * The adventurers' guild and friends: `enemy:<kind>`, `boss:<kind>` and `npc:<kind>`.
 * Each entry builds its sheet lazily; ids missing here fall back to placeholders (see ../index.ts).
 */
import type { Sheet } from '../sheet'
import { buildBossSheet } from './boss'
import { buildNpcSheet } from './npcs'
import { JOBS, buildJobSheet } from './jobs'

export const enemySheets: Record<string, () => Sheet> = Object.fromEntries(
  Object.keys(JOBS).map((kind) => [`enemy:${kind}`, () => buildJobSheet(kind)])
)
export const bossSheets: Record<string, () => Sheet> = { 'boss:garud': () => buildBossSheet('garud') }
export const npcSheets: Record<string, () => Sheet> = Object.fromEntries(
  ['elder', 'smith', 'seer', 'bard'].map((kind) => [`npc:${kind}`, () => buildNpcSheet(kind)])
)
