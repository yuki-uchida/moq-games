import type { SfxName } from '../api'
import type { SfxDef } from '../sfx-builder'

/** Interface and staging: menuMove, menuSelect, menuBack, pauseIn, pauseOut, textBlip, pageTurn, stageStart, ready, unlock, tallyTick, tallyDone, newRecord, irisOut, irisIn, titleStart, confetti. */
export const defs: Partial<Record<SfxName, SfxDef>> = {}
