/** Registry of every antique's recipe (DESIGN §6). */
import type { ItemId } from '../../data/items'
import { camel, cheetah, fang, hawk, hedgehog, jelly, koala, rhino, sloth, turtle } from './emblems'
import { bat, frog, gecko, hermit, honeyant, leaf, momonga, octopus, pigeon } from './gadgets'
import type { ItemRecipe } from './item'
import { armadillo, claw, mammoth, mantis, narwhal, orca } from './melee'
import { bee, eel, hippo, humming, owl, pillbug, puffer, swallow, wood } from './ranged'

const RECIPES: Record<ItemId, () => ItemRecipe> = {
  claw,
  orca,
  narwhal,
  mammoth,
  mantis,
  bee,
  wood,
  humming,
  puffer,
  owl,
  swallow,
  pillbug,
  eel,
  hippo,
  turtle,
  armadillo,
  hedgehog,
  jelly,
  fang,
  hawk,
  rhino,
  sloth,
  koala,
  cheetah,
  camel,
  frog,
  gecko,
  momonga,
  leaf,
  bat,
  octopus,
  pigeon,
  hermit,
  honeyant
}

export const itemRecipe = (id: ItemId): ItemRecipe => RECIPES[id]()
