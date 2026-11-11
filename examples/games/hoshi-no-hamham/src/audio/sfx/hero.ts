import type { SfxName } from '../api'
import type { SfxDef } from '../sfx-builder'

/** The hero: jump, land, landHard, step, skid, bite, biteHit, hurt, die, splashIn, splashOut, swim, drop, respawn, heal, starGet, pickup, lowHp. */
export const defs: Partial<Record<SfxName, SfxDef>> = {}
