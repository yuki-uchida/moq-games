import type { SheetModule } from '../module'
import { sheets as ape } from './bosses/ape'
import { sheets as bear } from './bosses/bear'
import { sheets as bee } from './bosses/bee'
import { sheets as boar } from './bosses/boar'
import { sheets as crow } from './bosses/crow'
import { sheets as fox } from './bosses/fox'
import { sheets as weasel } from './bosses/weasel'
import { sheets as wolf } from './bosses/wolf'
import { sheets as enemies } from './enemies'
import { sheets as hero } from './hero'
import { sheets as king } from './king'
import { sheets as mom } from './mom'
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
