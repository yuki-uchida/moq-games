/** Stage data by id (stages without data are not selectable yet). */
import type { StageData } from '../sim/stage-data'
import type { StageId } from '../vocab'
import { MEADOW } from './meadow'
import { SEWER } from './sewer'

export const STAGE_DATA: Partial<Record<StageId, StageData>> = { meadow: MEADOW, sewer: SEWER }
