import type { SheetModule } from '../../module'
import { flyerSheet } from './flyer'
import { jumperSheet } from './jumper'
import { spitterSheet } from './spitter'
import { toughSheet } from './tough'
import { walkerSheet } from './walker'

/** The gang: `walker`, `flyer`, `jumper`, `spitter`, `tough`. See ENEMY_SPEC in contract.ts. */
export const sheets: SheetModule = {
  walker: walkerSheet,
  flyer: flyerSheet,
  jumper: jumperSheet,
  spitter: spitterSheet,
  tough: toughSheet
}
