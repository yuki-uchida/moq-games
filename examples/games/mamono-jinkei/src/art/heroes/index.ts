/**
 * Hero art: `hero:<species>:<job>` and the co-op technique sprites `tech:<species>`.
 * Each entry builds its sheet lazily; ids missing here fall back to placeholders (see ../index.ts).
 */
import { JOBS } from '../../vocab'
import type { Sheet } from '../sheet'
import { slimeSheet } from './slime'
import { slimeTechSheet } from './tech'

export const heroSheets: Record<string, () => Sheet> = {
  ...Object.fromEntries(JOBS.map((job) => [`hero:slime:${job}`, () => slimeSheet(job)]))
}
export const techSheets: Record<string, () => Sheet> = { 'tech:slime': slimeTechSheet }
