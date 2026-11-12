/**
 * Antique models: each recipe is one or more rigid SDF parts (so details can move: jaws, wings, cheeks) plus a
 * muzzle/tip anchor and a small animation hook. Parts share one toon material per instance whose accent glow
 * uses ITEMS[id].color.
 */
import * as THREE from 'three'
import { ITEMS, type ItemId } from '../../data/items'
import type { HandAct } from '../../sim/types'
import type { Quality } from '../api'
import type { KitItemModel } from '../character'
import { createOutlineMaterial, createToonMaterial, createUniforms, regionsOf } from '../materials'
import { bakeModel, type BakedModel } from '../sdf/geometry'
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
    const model = yield* bakeModel(p.sculpt, {
      cell,
      maxTris: Math.max(60, Math.round((budget * area[i]) / total)),
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
  const materials: THREE.MeshToonMaterial[] = []
  const outlineMat = outline ? createOutlineMaterial(u) : null
  const parts: Record<string, THREE.Object3D> = {}
  for (const p of asset.parts) {
    const pivot = new THREE.Group()
    pivot.name = p.name
    pivot.position.set(p.pivot[0], p.pivot[1], p.pivot[2])
    // Geometry stays in item space (paint regions are item space): the mesh sits at −pivot inside its pivot.
    const material = createToonMaterial(u, regionsOf(p.model))
    materials.push(material)
    const mesh = new THREE.Mesh(p.model.geometry, material)
    mesh.position.set(-p.pivot[0], -p.pivot[1], -p.pivot[2])
    mesh.castShadow = true
    pivot.add(mesh)
    if (outlineMat) {
      const ol = new THREE.Mesh(p.model.geometry, outlineMat)
      ol.position.copy(mesh.position)
      pivot.add(ol)
    }
    root.add(pivot)
    parts[p.name] = pivot
  }
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
      for (const material of materials)
        if (material.transparent !== transparent) {
          material.transparent = transparent
          material.needsUpdate = true
        }
      if (outlineMat) outlineMat.visible = amount < 0.35
    },
    dispose() {
      for (const material of materials) material.dispose()
      outlineMat?.dispose()
      root.removeFromParent()
    }
  }
}
