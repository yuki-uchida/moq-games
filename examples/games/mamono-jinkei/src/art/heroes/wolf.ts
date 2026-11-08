/**
 * The wolf heroes `hero:wolf:<job>` (stage 4) and the co-op technique sprites `tech:wolf`, built lazily.
 * Ids missing here fall back to placeholders.
 */
import { heroSpec } from '../contract'
import { JOBS } from '../../vocab'
import { anim, type Sheet } from '../sheet'
import type { JobId } from './jobs'
import { wolfFrames } from './wolf-anims'
import { wolfTechSheet } from './wolf-tech'

/** Builds `hero:wolf:<job>`. */
export function wolfSheet(job: JobId): Sheet {
  const sheet: Sheet = {}
  for (const [name, want] of Object.entries(heroSpec('wolf')))
    sheet[name] = anim(wolfFrames(job, name), want.fps, want.loop)
  return sheet
}

export const wolfSheets: Record<string, () => Sheet> = {
  ...Object.fromEntries(JOBS.map((job) => [`hero:wolf:${job}`, () => wolfSheet(job)])),
  'tech:wolf': wolfTechSheet
}
