import type { SheetModule } from '../module'
import type { FootfallModule } from '../motion'
import { footfalls as apeFootfalls, sheets as ape } from './bosses/ape'
import { footfalls as bearFootfalls, sheets as bear } from './bosses/bear'
import { sheets as bee } from './bosses/bee'
import { footfalls as boarFootfalls, sheets as boar } from './bosses/boar'
import { sheets as crow } from './bosses/crow'
import { footfalls as foxFootfalls, sheets as fox } from './bosses/fox'
import { footfalls as weaselFootfalls, sheets as weasel } from './bosses/weasel'
import { footfalls as wolfFootfalls, sheets as wolf } from './bosses/wolf'
import { footfalls as enemyFootfalls, sheets as enemies } from './enemies'
import { footfalls as heroFootfalls, sheets as hero } from './hero'
import { footfalls as kingFootfalls, sheets as king } from './king'
import { footfalls as momFootfalls, sheets as mom } from './mom'
import { sheets as princess } from './princess'

export const charModules: SheetModule[] = [
  hero,
  princess,
  mom,
  king,
  enemies,
  crow,
  weasel,
  boar,
  wolf,
  bear,
  fox,
  ape,
  bee
]

/**
 * Where the feet of the cast's ground cycles are on the ground, by sheet id and clip (see `Footfall` in motion.ts).
 * Read by `tests/art-footfall.test.ts`; the game does not use it.
 */
export const charFootfalls: FootfallModule = {
  ...heroFootfalls,
  ...momFootfalls,
  ...kingFootfalls,
  ...enemyFootfalls,
  ...weaselFootfalls,
  ...boarFootfalls,
  ...wolfFootfalls,
  ...bearFootfalls,
  ...foxFootfalls,
  ...apeFootfalls
}
