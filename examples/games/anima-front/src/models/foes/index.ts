/**
 * Crowd foes (DESIGN §11) as rigid parts posed per instance: the renderer draws each part of a kind with one
 * InstancedMesh and calls `pose(anim, out)` every frame. A recipe gives the parts (SDF sculpts) and an
 * allocation-free pose function; parts of one rig share their uniforms (time, glow) and each has its own paint
 * regions. `buildFoeAsset` bakes the geometry once per kind (time-sliced by the kit).
 */
import * as THREE from 'three'
import { FOES, type FoeKind } from '../../data/enemies'
import type { FoeAnim, FoeRig, Quality } from '../api'
import { regionsOf } from '../materials'
import { bakeParts, disposeParts, type BakedPart, type PartRecipe } from './bake'
import { CREATURE_LOOK, MACHINE_LOOK, createFoeMaterial, createFoeUniforms, type FoeLook } from './material'
import { CREATURES } from './creatures'
import { MACHINES } from './machines'

export type FoePose = (anim: FoeAnim, out: THREE.Matrix4[]) => void

export interface FoeRecipe {
  parts: PartRecipe[]
  look?: FoeLook
  pose: FoePose
}

export interface FoeAsset {
  kind: FoeKind
  quality: Quality
  parts: BakedPart[]
  look: FoeLook
  pose: FoePose
  /** Triangles of one foe (all parts, without hulls) and generation time. */
  triangles: number
  ms: number
}

const RECIPES: Partial<Record<FoeKind, () => FoeRecipe>> = { ...CREATURES, ...MACHINES }

export function* buildFoeAsset(kind: FoeKind, quality: Quality): Generator<void, FoeAsset, void> {
  const t0 = performance.now()
  const make = RECIPES[kind]
  // クロヅメ (animals) and bosses (full models) have no crowd recipe: see kurozume.ts and bosses/.
  if (!make) throw new Error(`no crowd rig recipe for ${kind}`)
  const recipe = make()
  const parts = yield* bakeParts(recipe.parts, quality)
  const base = FOES[kind].faction === 'machine' ? MACHINE_LOOK : CREATURE_LOOK
  return {
    kind,
    quality,
    parts,
    look: { ...base, ...recipe.look },
    pose: recipe.pose,
    triangles: parts.reduce((n, p) => n + p.triangles, 0),
    ms: performance.now() - t0
  }
}

export function createFoeRig(asset: FoeAsset): FoeRig {
  const u = createFoeUniforms(asset.look)
  const parts = asset.parts.map((p) => {
    const material = createFoeMaterial(u, p.model.regions.count ? regionsOf(p.model) : null, { hull: p.hull })
    if (p.opacity < 1) {
      material.transparent = true
      material.opacity = p.opacity
      material.depthWrite = false
    }
    return { name: p.name, geometry: p.geometry, material }
  })
  const pose = asset.pose
  return {
    kind: asset.kind,
    parts,
    pose(anim: FoeAnim, out: THREE.Matrix4[]) {
      u.uTime.value = anim.time
      pose(anim, out)
    }
  }
}

export const disposeFoeAsset = (asset: FoeAsset) => disposeParts(asset.parts)
