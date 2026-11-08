/**
 * Stage 3 people: its four guild enemies, its boss sheets (and minions), built lazily.
 * Ids missing here fall back to placeholders.
 */
import type { Sheet } from '../sheet'
import { buildHawkSheet } from './s3-hawk'
import { buildS3JobSheet } from './s3-jobs'
import { buildValkSheet } from './s3-valk'

export const stage3Sheets: Record<string, () => Sheet> = {
  'enemy:falconer': () => buildS3JobSheet('falconer'),
  'enemy:crossbow': () => buildS3JobSheet('crossbow'),
  'enemy:windmage': () => buildS3JobSheet('windmage'),
  'enemy:bellmonk': () => buildS3JobSheet('bellmonk'),
  'minion:hawk': buildHawkSheet,
  'boss:valk': buildValkSheet
}
