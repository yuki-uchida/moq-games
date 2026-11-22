import type { UnitType } from '../../../game/model'
import type { StackDesign } from '../StackDesign'
import { archer } from './archer'
import { bat } from './bat'
import { beetle } from './beetle'
import { brute } from './brute'
import { cannon } from './cannon'
import { clockworkPatchling } from './clockworkPatchling'
import { crystalSentinel } from './crystalSentinel'
import { dragon } from './dragon'
import { frost } from './frost'
import { goblin } from './goblin'
import { healer } from './healer'
import { koboldLancer } from './koboldLancer'
import { mage } from './mage'
import { ogre } from './ogre'
import { paladin } from './paladin'
import { ranger } from './ranger'
import { runner } from './runner'
import { shaman } from './shaman'
import { slime } from './slime'
import { soldier } from './soldier'
import { tank } from './tank'
import { wolf } from './wolf'
import { wraith } from './wraith'

export { archer, mage, soldier }

/** Every sprite-stacked figure, keyed by game role. */
export const STACK_DESIGNS: Readonly<Partial<Record<UnitType, StackDesign>>> = {
  soldier,
  archer,
  runner,
  tank,
  mage,
  healer,
  frost,
  ranger,
  cannon,
  paladin,
  slime,
  goblin,
  wolf,
  beetle,
  shaman,
  brute,
  bat,
  wraith,
  ogre,
  dragon,
  crystalSentinel,
  koboldLancer,
  clockworkPatchling
}
