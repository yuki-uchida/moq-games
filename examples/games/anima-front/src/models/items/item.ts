/**
 * Antique models: each recipe is one or more rigid SDF parts (so details can move: jaws, wings, cheeks) plus a
 * muzzle/tip anchor and a small animation hook. All parts and the ink outline are ONE draw call: a single part
 * is a plain mesh, moving parts are rigidly skinned to one bone each (the bones are the animated pivots); the
 * paint regions of every part live in one merged table. The accent glow uses ITEMS[id].color. A lighter level of
 * detail is baked alongside for distant characters.
 */
import * as THREE from 'three'
import { ITEMS, type ItemId } from '../../data/items'
import type { HandAct } from '../../sim/types'
import type { Quality } from '../api'
import { mergePieces, type MergedGeometry } from '../assembly'
import type { KitItemModel } from '../character'
import { hullDepthMaterial } from '../hull'
import { createToonMaterial, createUniforms } from '../materials'
import { bakeModel, type BakedModel } from '../sdf/geometry'
import { mergeRegionTables, regionTexture, type RegionTable } from '../sdf/regions'
import type { Sculpt, Vec3 } from '../sdf/sculpt'

export interface ItemAnimState {
  t: number
  dt: number
  act: HandAct
  charge: number
  /** Smoothed 0..1 "active" level (firing, charging, beaming). */
  active: number
  /** Seconds since the last act change to 'fire' / 'swing'. */
  sinceFire: number
}

export type ItemAnimate = (
  parts: Record<string, THREE.Object3D>,
  s: ItemAnimState,
  setGlow2: (v: number) => void
) => void

export interface ItemRecipe {
  parts: { name: string; sculpt: Sculpt; pivot?: Vec3 }[]
  muzzle: Vec3
  /** Grid cell (m); default 6 mm at medium. */
  cell?: number
  /** Triangle budget of the whole antique at medium (default 2600). */
  tris?: number
  animate?: ItemAnimate
  /** Colour of the animated glow channel (mask w); default the accent colour. */
  glow2?: number
}

export interface ItemAsset {
  id: ItemId
  parts: { name: string; model: BakedModel; pivot: Vec3 }[]
  muzzle: Vec3
  animate?: ItemAnimate
  glow2?: number
  triangles: number
  ms: number
  /** Merged regions and geometries (built on first use, shared by every instance). */
  merged?: {
    table: RegionTable
    ranges: [number, number][]
    texture: THREE.DataTexture
    geometry: Map<string, MergedGeometry>
  }
}

const CELL_SCALE: Record<Quality, number> = { low: 1.45, medium: 1, high: 0.72 }
const TRI_SCALE: Record<Quality, number> = { low: 0.55, medium: 1, high: 1.8 }

export function* buildItemAsset(id: ItemId, recipe: ItemRecipe, quality: Quality): Generator<void, ItemAsset, void> {
  const t0 = performance.now()
  const cell = (recipe.cell ?? 0.006) * CELL_SCALE[quality]
  const parts: ItemAsset['parts'] = []
  let triangles = 0
  // The budget is shared between parts in proportion to their bounding radius squared (≈ surface).
  const area = recipe.parts.map(
    (p) => Math.max(...p.sculpt.ops.filter((o) => o.type === 0).map((o) => o.shape.radius), 0.01) ** 2
  )
  const total = area.reduce((a, b) => a + b, 0)
  const budget = (recipe.tris ?? 2600) * TRI_SCALE[quality]
  for (let i = 0; i < recipe.parts.length; i++) {
    const p = recipe.parts[i]
    const maxTris = Math.max(60, Math.round((budget * area[i]) / total))
    const model = yield* bakeModel(p.sculpt, {
      cell,
      maxTris,
      lodTris: Math.max(40, Math.round(maxTris * 0.28)),
      ao: { reach: cell * 6, min: 0.6 }
    })
    triangles += model.triangles
    parts.push({ name: p.name, model, pivot: p.pivot ?? [0, 0, 0] })
  }
  return {
    id,
    parts,
    muzzle: recipe.muzzle,
    animate: recipe.animate,
    glow2: recipe.glow2,
    triangles,
    ms: performance.now() - t0
  }
}

function mergedOf(asset: ItemAsset) {
  if (!asset.merged) {
    const { table, ranges } = mergeRegionTables(asset.parts.map((p) => p.model.regions))
    asset.merged = { table, ranges, texture: regionTexture(table), geometry: new Map() }
  }
  return asset.merged
}

/** The merged geometry of an antique (cached per level of detail and outline). */
export function itemGeometry(asset: ItemAsset, lod: 0 | 1, outline: boolean): MergedGeometry {
  const merged = mergedOf(asset)
  const key = `${lod}|${outline ? 1 : 0}`
  let g = merged.geometry.get(key)
  if (!g) {
    const multi = asset.parts.length > 1
    g = mergePieces(
      asset.parts.map((p, i) => ({
        geometry: lod === 1 && p.model.lod ? p.model.lod.geometry : p.model.geometry,
        matrix: null,
        bone: multi ? i : null,
        range: i,
        flags: 0,
        outline: true
      })),
      merged.ranges,
      { skinned: multi, hull: outline }
    )
    merged.geometry.set(key, g)
  }
  return g
}

export function disposeItemAsset(asset: ItemAsset): void {
  for (const p of asset.parts) {
    p.model.geometry.dispose()
    if (p.model.lod && p.model.lod.geometry !== p.model.geometry) p.model.lod.geometry.dispose()
    p.model.texture.dispose()
  }
  if (asset.merged) {
    for (const g of asset.merged.geometry.values()) g.geometry.dispose()
    asset.merged.texture.dispose()
    asset.merged = undefined
  }
}

export function createItemModel(asset: ItemAsset, outline: boolean): KitItemModel {
  const def = ITEMS[asset.id]
  const root = new THREE.Group()
  root.name = `item:${asset.id}`
  const u = createUniforms()
  u.uGlowColor.value.setHex(def.color)
  u.uGlow.value = 1.15
  u.uGlow2Color.value.setHex(asset.glow2 ?? def.color)
  u.uGlow2.value = 0
  u.uRim.value = 0.3
  u.uOutline.value = 0.0045
  const merged = mergedOf(asset)
  const material = createToonMaterial(
    u,
    { texture: merged.texture, count: merged.table.count, shapeBase: merged.table.shapeBase },
    { hull: outline, merged: true }
  )
  const parts: Record<string, THREE.Object3D> = {}
  const multi = asset.parts.length > 1
  let lod: 0 | 1 = 0
  let mesh: THREE.Mesh
  let skeleton: THREE.Skeleton | null = null
  if (multi) {
    // Moving parts: one bone per part at its pivot; the geometry stays in item space.
    const bones = asset.parts.map((p) => {
      const bone = new THREE.Bone()
      bone.name = `part:${p.name}`
      bone.position.set(p.pivot[0], p.pivot[1], p.pivot[2])
      root.add(bone)
      parts[p.name] = bone
      return bone
    })
    const skinned = new THREE.SkinnedMesh(itemGeometry(asset, 0, outline).geometry, material)
    root.add(skinned)
    root.updateMatrixWorld(true)
    skeleton = new THREE.Skeleton(bones)
    skinned.bind(skeleton)
    const bs = skinned.geometry.boundingSphere!
    skinned.boundingSphere = new THREE.Sphere(bs.center.clone(), bs.radius * 1.5)
    mesh = skinned
  } else {
    const p = asset.parts[0]
    const pivot = new THREE.Group()
    pivot.name = `part:${p.name}`
    pivot.position.set(p.pivot[0], p.pivot[1], p.pivot[2])
    mesh = new THREE.Mesh(itemGeometry(asset, 0, outline).geometry, material)
    mesh.position.set(-p.pivot[0], -p.pivot[1], -p.pivot[2])
    pivot.add(mesh)
    root.add(pivot)
    parts[p.name] = pivot
  }
  mesh.name = 'antique'
  mesh.castShadow = true
  mesh.customDepthMaterial = hullDepthMaterial()
  const state: ItemAnimState = { t: 0, dt: 0, act: 'idle', charge: 0, active: 0, sinceFire: 9 }
  let swapGlow = 0
  let glow2 = 0
  const setGlow2 = (v: number) => (glow2 = v)
  return {
    root,
    id: asset.id,
    muzzle: new THREE.Vector3(...asset.muzzle),
    update(dt: number, act: HandAct, charge: number) {
      state.dt = Math.min(dt, 0.1)
      state.t += state.dt
      if ((act === 'fire' || act === 'swing') && state.act !== act) state.sinceFire = 0
      state.sinceFire += state.dt
      state.act = act
      state.charge = charge
      const busy = act === 'fire' || act === 'charge' || act === 'beam' || act === 'guard' || act === 'swing'
      state.active += ((busy ? 1 : 0) - state.active) * (1 - Math.exp(-12 * state.dt))
      glow2 = 0
      asset.animate?.(parts, state, setGlow2)
      u.uGlow2.value = glow2 + swapGlow * 2
      u.uGlow.value = 1.15 + swapGlow * 2.5
      u.uFlash.value = swapGlow * 0.6
      u.uTime.value = state.t
    },
    setSwapGlow(amount: number) {
      swapGlow = amount
      u.uGlow.value = 1.15 + swapGlow * 2.5
      u.uFlash.value = swapGlow * 0.6
    },
    setCloak(amount: number) {
      u.uCloak.value = amount
      const transparent = amount > 0.001
      if (material.transparent !== transparent) {
        material.transparent = transparent
        material.needsUpdate = true
      }
      u.uHullOn.value = amount < 0.35 ? 1 : 0
    },
    setLod(level: 0 | 1) {
      if (level === lod) return
      lod = level
      mesh.geometry = itemGeometry(asset, lod, outline).geometry
    },
    dispose() {
      material.dispose()
      skeleton?.dispose()
      root.removeFromParent()
    }
  }
}
