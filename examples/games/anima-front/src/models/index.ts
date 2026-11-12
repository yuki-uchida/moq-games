/**
 * The procedural model kit (DESIGN §15): SDF-sculpted animals with skeletons and procedural animation, and every
 * antique. Generated data is cached per kit (species, antiques, gear); `prepare` time-slices generation so a
 * page stays responsive. Crowd foes (foes/), bosses (bosses/), props (props/) and projectile looks (shots/) are
 * generated once per kind as well; `prepare` also bakes the shots of the requested antiques and foes.
 */
import type * as THREE from 'three'
import { FOES, KUROZUME_SQUADS, type FoeKind } from '../data/enemies'
import type { ItemId } from '../data/items'
import type { SpeciesId } from '../data/species'
import type { PropKind, ShotKind } from '../sim/types'
import type { ModelKit, Quality } from './api'
import { buildBossAsset, createBossModel, disposeBossAsset, type BossAsset, type BossKind } from './bosses'
import { CharacterAssembly } from './assembly'
import { createCharacterModel, type CharacterDeps } from './character'
import { happyEyeGeometry } from './face'
import { gearModel, scarfModel, type GearId } from './gear'
import { itemRecipe } from './items'
import { buildItemAsset, createItemModel, disposeItemAsset, type ItemAsset } from './items/item'
import type { BakedModel } from './sdf/geometry'
import { runSliced, runSync } from './sdf/mesher'
import { buildSpeciesAsset, type SpeciesAsset } from './species/asset'
import { buildFoeAsset, createFoeRig, disposeFoeAsset, type FoeAsset } from './foes'
import { kurozumeRig } from './foes/kurozume'
import { buildPropAsset, createPropModel, disposePropAsset, type PropAsset } from './props'
import { buildShotAsset, disposeShotAsset, type ShotAsset } from './shots'

type Stat = { ms: number; triangles: number }

export interface KitStats {
  species: Partial<Record<SpeciesId, Stat>>
  items: Partial<Record<ItemId, Stat>>
  foes: Partial<Record<FoeKind, Stat>>
  props: Partial<Record<PropKind, Stat>>
  shots: Partial<Record<ShotKind, Stat>>
}

/** Projectiles fired by each foe kind's attacks. */
const FOE_SHOTS: Partial<Record<FoeKind, ShotKind[]>> = {
  harigane: ['acid'],
  mitsume: ['laser'],
  ashinaga: ['plasma'],
  goutetsu: ['missile'],
  kuitsukushi: ['acidRain', 'acid']
}

const isBoss = (kind: FoeKind): kind is BossKind => !!FOES[kind].boss

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
  const assemblies = new Map<SpeciesId, CharacterAssembly>()
  const foes = new Map<FoeKind, FoeAsset>()
  const bosses = new Map<BossKind, BossAsset>()
  const props = new Map<PropKind, PropAsset>()
  const shots = new Map<ShotKind, ShotAsset>()

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
  const foeAsset = (kind: FoeKind) => {
    let a = foes.get(kind)
    if (!a) {
      a = runSync(buildFoeAsset(kind, quality))
      foes.set(kind, a)
    }
    return a
  }
  const bossAsset = (kind: BossKind) => {
    let a = bosses.get(kind)
    if (!a) {
      a = runSync(buildBossAsset(kind, quality))
      bosses.set(kind, a)
    }
    return a
  }
  const propAsset = (kind: PropKind) => {
    let a = props.get(kind)
    if (!a) {
      a = runSync(buildPropAsset(kind, quality))
      props.set(kind, a)
    }
    return a
  }
  const shotAsset = (kind: ShotKind) => {
    let a = shots.get(kind)
    if (!a) {
      a = runSync(buildShotAsset(kind, quality))
      shots.set(kind, a)
    }
    return a
  }
  const outlineOn = (want: boolean | undefined) => want !== false && quality !== 'low'
  const gearOf = (g: GearId) => {
    let geo = gear.get(g)
    if (!geo) {
      geo = gearModel(g, quality)
      gear.set(g, geo)
    }
    return geo
  }
  const assemblyOf = (id: SpeciesId) => {
    let a = assemblies.get(id)
    if (!a) {
      a = new CharacterAssembly(speciesAsset(id), {
        gear: gearOf,
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
      assemblies.set(id, a)
    }
    return a
  }
  const deps = (id: SpeciesId, outline: boolean): CharacterDeps => ({
    item: (item) => createItemModel(itemAsset(item), outline),
    assembly: () => assemblyOf(id)
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
      const shotKinds = new Set<ShotKind>(request.items ?? [])
      for (const kind of request.foes ?? []) {
        for (const shot of FOE_SHOTS[kind] ?? []) shotKinds.add(shot)
        if (isBoss(kind)) {
          if (!bosses.has(kind))
            todo.push(async () => {
              if (!bosses.has(kind)) bosses.set(kind, await runSliced(buildBossAsset(kind, quality)))
            })
        } else if (kind !== 'kurozume' && !foes.has(kind))
          todo.push(async () => {
            if (!foes.has(kind)) foes.set(kind, await runSliced(buildFoeAsset(kind, quality)))
          })
      }
      for (const kind of request.props ?? [])
        if (!props.has(kind))
          todo.push(async () => {
            if (!props.has(kind)) props.set(kind, await runSliced(buildPropAsset(kind, quality)))
          })
      for (const kind of shotKinds)
        if (!shots.has(kind))
          todo.push(async () => {
            if (!shots.has(kind)) shots.set(kind, await runSliced(buildShotAsset(kind, quality)))
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
      return createCharacterModel(assemblyOf(id), { look: opts.look, outline, quality }, deps(id, outline))
    },
    createItem: (id) => createItemModel(itemAsset(id), quality !== 'low'),
    // クロヅメ are drawn as animals (previews get a fox statue); bosses are full models (createBoss), a rig
    // request for one gets the same stand-in.
    foeRig: (kind) =>
      kind === 'kurozume' || isBoss(kind)
        ? { ...kurozumeRig(assemblyOf(KUROZUME_SQUADS[0].species)), kind }
        : createFoeRig(foeAsset(kind)),
    createBoss: (kind) => createBossModel(bossAsset(kind)),
    createProp: (kind) => createPropModel(propAsset(kind)),
    shotLook: (kind) => shotAsset(kind),
    stats() {
      const s: KitStats = { species: {}, items: {}, foes: {}, props: {}, shots: {} }
      for (const [id, a] of species) s.species[id] = { ms: a.ms, triangles: a.triangles }
      for (const [id, a] of items) s.items[id] = { ms: a.ms, triangles: a.triangles }
      for (const [id, a] of foes) s.foes[id] = { ms: a.ms, triangles: a.triangles }
      for (const [id, a] of bosses) s.foes[id] = { ms: a.ms, triangles: a.triangles }
      for (const [id, a] of props) s.props[id] = { ms: a.ms, triangles: a.triangles }
      for (const [id, a] of shots) s.shots[id] = { ms: a.ms, triangles: a.triangles }
      return s
    },
    speciesAsset,
    itemAsset,
    dispose() {
      for (const a of species.values()) {
        for (const g of [a.body, a.bodyLod, a.eye, a.brow, a.mouthClosed, a.mouthOpen]) g.dispose()
        for (const p of a.parts) {
          p.model.geometry.dispose()
          p.model.lod?.geometry.dispose()
          p.model.texture.dispose()
        }
        a.regionTexture.dispose()
      }
      for (const a of assemblies.values()) a.dispose()
      assemblies.clear()
      for (const a of items.values()) disposeItemAsset(a)
      for (const g of [...gear.values(), ...scarves.values()]) {
        g.geometry.dispose()
        g.texture.dispose()
      }
      happyEye?.dispose()
      for (const a of foes.values()) disposeFoeAsset(a)
      for (const a of bosses.values()) disposeBossAsset(a)
      for (const a of props.values()) disposePropAsset(a)
      for (const a of shots.values()) disposeShotAsset(a)
      foes.clear()
      bosses.clear()
      props.clear()
      shots.clear()
      species.clear()
      items.clear()
      gear.clear()
      scarves.clear()
      happyEye = null
    }
  }
}
