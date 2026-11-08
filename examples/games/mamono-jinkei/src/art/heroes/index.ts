/**
 * Hero art: `hero:<species>:<job>` and the co-op technique sprites `tech:<species>`.
 * Each entry builds its sheet lazily; ids missing here fall back to placeholders (see ../index.ts).
 * Every species lives in its own module (slime.ts/tech.ts, rat.ts, crow.ts, wolf.ts).
 */
import { JOBS } from '../../vocab'
import type { Sheet } from '../sheet'
import { crowSheets } from './crow'
import { ratSheets } from './rat'
import { slimeSheet } from './slime'
import { slimeTechSheet } from './tech'
import { wolfSheets } from './wolf'

export const heroSheets: Record<string, () => Sheet> = {
  ...Object.fromEntries(JOBS.map((job) => [`hero:slime:${job}`, () => slimeSheet(job)])),
  ...ratSheets,
  ...crowSheets,
  ...wolfSheets
}
export const techSheets: Record<string, () => Sheet> = { 'tech:slime': slimeTechSheet }
