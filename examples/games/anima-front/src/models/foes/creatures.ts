/**
 * 蝕獣 (creatures, DESIGN §11): glossy indigo-black chitin, violet glowing veins and orange eye-cores. Creepy
 * but never gory; readable silhouettes in crowds. Each recipe is a few rigid parts and an allocation-free pose.
 */
import type { FoeKind } from '../../data/enemies'
import type { FoeRecipe } from './index'
import { tsubute } from './creatures/tsubute'
import { harigane } from './creatures/harigane'
import { oagos } from './creatures/oagos'
import { kagerou } from './creatures/kagerou'

export const CREATURES: Partial<Record<FoeKind, () => FoeRecipe>> = { tsubute, harigane, oagos, kagerou }
