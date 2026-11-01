// The four chapters in story order. Each folder owns its map, script, dialogue, look and scenery.
import type { StageDef } from '../story'
import house from './house'
import town from './town'
import waterway from './waterway'
import forest from './forest'

export const STAGES: readonly StageDef[] = [house, town, waterway, forest]
/** Shared speaker names; a stage's `names` override these. */
export const DEFAULT_NAMES: Record<string, string> = { rabbit: 'モチ', narrator: '' }
export const speakerName = (stage: number, who: string) =>
  (Object.hasOwn(STAGES[stage].names, who) ? STAGES[stage].names[who] : DEFAULT_NAMES[who]) ?? who
