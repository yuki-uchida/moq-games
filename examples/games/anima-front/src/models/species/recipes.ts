/**
 * Recipe contract of the eight playable animals (DESIGN §4) and the registry. Each recipe returns the body plan
 * (skeleton layout), the body sculpt, rigid uniform parts and the face description used to place eyes, brows
 * and mouth. Order inside a recipe: all geometry (adds/subs) first, then crisp markings (paints), then the
 * uniform, then fuzzy blush — a later add would otherwise cut into the colour layers of earlier markings.
 */
import type { SpeciesId } from '../../data/species'
import type { BodyPlan } from '../rig'
import type { Sculpt } from '../sdf/sculpt'
import type { Attachment, Look } from './body'
import { owl, penguin } from './birds'
import { bear, cat, fox, hamster, rabbit, shiba } from './mammals'

export type MouthStyle = 'w' | 'smile' | 'beak' | 'x'

export interface FaceSpec {
  /** Eye direction from the head centre (rad): yaw outwards from +Z, pitch (− = down). */
  eyeYaw: number
  eyePitch: number
  /** Eye half width / half height (fractions of H). */
  eyeW: number
  eyeH: number
  iris: number
  irisDark: number
  pupil: number
  brow: number
  /** Mouth: direction pitch from the head centre and style. */
  mouthPitch: number
  mouth: MouthStyle
  mouthColor: number
}

export interface SpeciesRecipe {
  plan: BodyPlan
  sculpt: Sculpt
  /** Rigid uniform parts (core, buckle, back plate). */
  parts: Attachment[]
  face: FaceSpec
  look: Look
}

const RECIPES: Record<SpeciesId, () => SpeciesRecipe> = { shiba, cat, rabbit, bear, fox, penguin, hamster, owl }

export const speciesRecipe = (id: SpeciesId): SpeciesRecipe => RECIPES[id]()
