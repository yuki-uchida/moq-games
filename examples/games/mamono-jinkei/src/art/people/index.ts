/**
 * The adventurers' guild and friends: `enemy:<kind>`, `boss:<kind>`, `minion:<kind>` and `npc:<kind>`.
 * Each entry builds its sheet lazily; ids missing here fall back to placeholders (see ../index.ts).
 * Stage 1 lives in jobs.ts/boss.ts; stages 2–4 each own a module (stage2.ts, stage3.ts, stage4.ts).
 */
import type { Sheet } from '../sheet'
import { buildBossSheet } from './boss'
import { buildNpcSheet } from './npcs'
import { JOBS, buildJobSheet } from './jobs'
import { stage2Sheets } from './stage2'
import { stage3Sheets } from './stage3'
import { stage4Sheets } from './stage4'

export const enemySheets: Record<string, () => Sheet> = {
  ...Object.fromEntries(Object.keys(JOBS).map((kind) => [`enemy:${kind}`, () => buildJobSheet(kind)])),
  ...stage2Sheets,
  ...stage3Sheets,
  ...stage4Sheets
}
export const bossSheets: Record<string, () => Sheet> = { 'boss:garud': () => buildBossSheet('garud') }
export const npcSheets: Record<string, () => Sheet> = Object.fromEntries(
  ['elder', 'smith', 'seer', 'bard'].map((kind) => [`npc:${kind}`, () => buildNpcSheet(kind)])
)
