import type { SheetModule } from '../../module'
import type { FootfallModule } from '../../motion'
import { flyerSheet } from './flyer'
import { jumperSheet } from './jumper'
import { spitterSheet } from './spitter'
import { footfalls as toughFootfalls, toughSheet } from './tough'
import { footfalls as walkerFootfalls, walkerSheet } from './walker'

/** The gang: `walker`, `flyer`, `jumper`, `spitter`, `tough`. See ENEMY_SPEC in contract.ts. */
export const sheets: SheetModule = {
  walker: walkerSheet,
  flyer: flyerSheet,
  jumper: jumperSheet,
  spitter: spitterSheet,
  tough: toughSheet
}

/** The footfall tables of the gang's ground cycles. */
export const footfalls: FootfallModule = { ...walkerFootfalls, ...toughFootfalls }
