/**
 * Temporary, while the cast is redrawn on the rig toolkit (rig.ts, motion.ts): the character sheets that already
 * follow the new clip contract. A sheet listed here is checked against its new spec and drawn by the view with the
 * new timing; every other sheet keeps its legacy spec. When every character is listed, this file and the legacy
 * specs in contract.ts go away.
 *
 * One line per sheet: uncomment yours when the new sheet is complete (every clip of its new spec drawn).
 */
export const MIGRATED: readonly string[] = [
  'hero',
  'princess',
  'mom',
  'king',
  'walker',
  'flyer',
  'jumper',
  'spitter',
  'tough',
  'crowBoss',
  'weaselBoss',
  'boarBoss',
  'wolfBoss',
  'bearBoss',
  'foxBoss',
  'apeBoss',
  'beeBoss'
]
