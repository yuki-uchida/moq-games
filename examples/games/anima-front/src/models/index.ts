/**
 * The procedural model kit (DESIGN §15): SDF-sculpted animals with skeletons and procedural animation, and every
 * antique. Generated data is cached per kit (species, antiques, gear); `prepare` time-slices generation so a
 * page stays responsive. Foes, bosses, props and shots are placeholders for now (placeholders.ts).
 */
import type * as THREE from 'three'
import type { ItemId } from '../data/items'
import type { SpeciesId } from '../data/species'
import type { ModelKit, Quality } from './api'
import { createCharacterModel, type CharacterDeps } from './character'
import { happyEyeGeometry } from './face'
import { gearModel, scarfModel, type GearId } from './gear'
import { itemRecipe } from './items'
import { buildItemAsset, createItemModel, type ItemAsset } from './items/item'
import type { BakedModel } from './sdf/geometry'
import { runSliced, runSync } from './sdf/mesher'
import { buildSpeciesAsset, type SpeciesAsset } from './species/asset'
import { placeholderBoss, placeholderProp, placeholderRig, placeholderShot } from './placeholders'

export interface KitStats {
  species: Partial<Record<SpeciesId, { ms: number; triangles: number }>>
  items: Partial<Record<ItemId, { ms: number; triangles: number }>>
}

export interface ModelKitExt extends ModelKit {
  readonly quality: Quality
  /** Generation times (ms) and triangle counts of everything generated so far. */
  stats(): KitStats
  speciesAsset(id: SpeciesId): SpeciesAsset
  itemAsset(id: ItemId): ItemAsset
}

export function createModelKit(options: { quality: Quality } = { quality: 'medium' }): ModelKitExt {
  const quality = options.quality
  const species = new Map<SpeciesId, SpeciesAsset>()
  const items = new Map<ItemId, ItemAsset>()
  const gear = new Map<GearId, BakedModel>()
  const scarves = new Map<SpeciesId, BakedModel>()
  let happyEye: THREE.BufferGeometry | null = null

  const speciesAsset = (id: SpeciesId) => {
    let a = species.get(id)
    if (!a) {
      a = runSync(buildSpeciesAsset(id, quality))
      species.set(id, a)
    }
    return a
  }
  const itemAsset = (id: ItemId) => {
    let a = items.get(id)
    if (!a) {
      a = runSync(buildItemAsset(id, itemRecipe(id), quality))
      items.set(id, a)
    }
    return a
  }
  const outlineOn = (want: boolean | undefined) => want !== false && quality !== 'low'
  const deps = (id: SpeciesId, outline: boolean): CharacterDeps => ({
    item: (item) => createItemModel(itemAsset(item), outline),
    gear: (g) => {
      let geo = gear.get(g)
      if (!geo) {
        geo = gearModel(g, quality)
        gear.set(g, geo)
      }
      return geo
    },
    scarf: () => {
      let geo = scarves.get(id)
      if (!geo) {
        geo = scarfModel(speciesAsset(id).plan, quality)
        scarves.set(id, geo)
      }
      return geo
    },
    happyEye: () => (happyEye ??= happyEyeGeometry())
  })

  return {
    quality,
    async prepare(request, onProgress) {
      const todo: (() => Promise<void>)[] = []
      for (const id of request.species ?? [])
        if (!species.has(id))
          todo.push(async () => {
            if (!species.has(id)) species.set(id, await runSliced(buildSpeciesAsset(id, quality)))
          })
      for (const id of request.items ?? [])
        if (!items.has(id))
          todo.push(async () => {
            if (!items.has(id)) items.set(id, await runSliced(buildItemAsset(id, itemRecipe(id), quality)))
          })
      const total = todo.length
      onProgress?.(total === 0 ? 1 : 0)
      for (let i = 0; i < total; i++) {
        await todo[i]()
        onProgress?.((i + 1) / total)
      }
    },
    createCharacter(id, opts = {}) {
      const outline = outlineOn(opts.outline)
      return createCharacterModel(speciesAsset(id), { look: opts.look, outline }, deps(id, outline))
    },
    createItem: (id) => createItemModel(itemAsset(id), quality !== 'low'),
    foeRig: (kind) => placeholderRig(kind),
    createBoss: (kind) => placeholderBoss(kind),
    createProp: (kind) => placeholderProp(kind),
    shotLook: (kind) => placeholderShot(kind),
    stats() {
      const s: KitStats = { species: {}, items: {} }
      for (const [id, a] of species) s.species[id] = { ms: a.ms, triangles: a.triangles }
      for (const [id, a] of items) s.items[id] = { ms: a.ms, triangles: a.triangles }
      return s
    },
    speciesAsset,
    itemAsset,
    dispose() {
      for (const a of species.values()) {
        for (const g of [a.body, a.eye, a.brow, a.mouthClosed, a.mouthOpen, ...a.parts.map((p) => p.model.geometry)])
          g.dispose()
        a.regionTexture.dispose()
        for (const p of a.parts) p.model.texture.dispose()
      }
      for (const a of items.values())
        for (const p of a.parts) {
          p.model.geometry.dispose()
          p.model.texture.dispose()
        }
      for (const g of [...gear.values(), ...scarves.values()]) {
        g.geometry.dispose()
        g.texture.dispose()
      }
      happyEye?.dispose()
      species.clear()
      items.clear()
      gear.clear()
      scarves.clear()
      happyEye = null
    }
  }
}
