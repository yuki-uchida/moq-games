/**
 * 蝕機 (machines, DESIGN §11): ミツメ, アシナガ, コロガシ, タテガミ. Pearl ceramic plates, cyan light seams and
 * single lens eyes; each recipe is a few rigid parts and an allocation-free pose (see machines/kit.ts).
 */
import type { FoeKind } from '../../data/enemies'
import type { FoeRecipe } from './index'
import { ashinaga } from './machines/ashinaga'
import { korogashi } from './machines/korogashi'
import { mitsume } from './machines/mitsume'
import { tategami } from './machines/tategami'

export const MACHINES: Partial<Record<FoeKind, () => FoeRecipe>> = { mitsume, ashinaga, korogashi, tategami }
