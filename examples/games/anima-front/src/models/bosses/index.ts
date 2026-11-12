/**
 * Bosses (DESIGN §11): クイツクシ (a 9 m crater maw-flower) and ゴウテツ (a 12 m walking fortress). Each is one
 * full model posed from FoeAnim. `buildBossAsset` generates the cached geometry (time-sliced by the kit);
 * `createBossModel` makes an instance with its own materials.
 */
import type { BossModel, Quality } from '../api'
import { bakePart, disposeParts, type BakedPart } from '../foes/bake'
import type { BossAsset, BossKind, BossPartRecipe } from './common'
import { createGoutetsu } from './goutetsu'
import { goutetsuParts } from './goutetsu-parts'
import { createKuitsukushi } from './kuitsukushi'
import { kuitsukushiParts } from './kuitsukushi-parts'

export type { BossAsset, BossKind } from './common'

const RECIPES: Record<BossKind, () => BossPartRecipe[]> = {
  kuitsukushi: kuitsukushiParts,
  goutetsu: goutetsuParts
}

export function* buildBossAsset(kind: BossKind, quality: Quality): Generator<void, BossAsset, void> {
  let ms = 0
  let t0 = performance.now()
  const list = RECIPES[kind]()
  const parts: Record<string, BakedPart> = {}
  let triangles = 0
  let meshes = 0
  for (const r of list) {
    const gen = bakePart(r, quality)
    // Time only our own work (the kit time-slices this generator between frames).
    for (;;) {
      const step = gen.next()
      if (step.done) {
        parts[r.name] = step.value
        break
      }
      ms += performance.now() - t0
      yield
      t0 = performance.now()
    }
    triangles += parts[r.name].triangles * r.uses
    meshes += r.uses
  }
  ms += performance.now() - t0
  return { kind, quality, parts, triangles, meshes, ms }
}

export function createBossModel(asset: BossAsset): BossModel {
  return asset.kind === 'kuitsukushi' ? createKuitsukushi(asset) : createGoutetsu(asset)
}

export function disposeBossAsset(asset: BossAsset): void {
  disposeParts(Object.values(asset.parts))
}
