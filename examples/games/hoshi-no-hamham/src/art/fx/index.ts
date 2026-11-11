import type { SheetModule } from '../module'
import { sheets as debris } from './debris'
import { sheets as impacts } from './impacts'
import { sheets as marks } from './marks'

export const fxModules: SheetModule[] = [impacts, debris, marks]
