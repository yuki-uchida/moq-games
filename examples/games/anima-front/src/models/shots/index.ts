/**
 * Projectile looks (render/actors/shots.ts draws one InstancedMesh per kind): unit scale facing +Z, emissive so
 * they read with bloom, `stretch` for streaks. Generated once per kind and shared by every caller (the renderer
 * never disposes them; the kit does through `disposeShotAsset`). Recipes are in recipes.ts, the shader in
 * material.ts.
 */
import type * as THREE from 'three'
import type { ShotKind } from '../../sim/types'
import type { Quality, ShotLook } from '../api'
import { createShotMaterial } from './material'
import { shotRecipe } from './recipes'

export interface ShotAsset extends ShotLook {
  kind: ShotKind
  triangles: number
  ms: number
}

export function* buildShotAsset(kind: ShotKind, quality: Quality): Generator<void, ShotAsset, void> {
  // Shots are a few hundred triangles at most: the same mesh at every quality.
  void quality
  const t0 = performance.now()
  const r = shotRecipe(kind)
  const geometry = r.mesh().build()
  const material = createShotMaterial(r.shade)
  material.name = `shot:${kind}`
  yield
  return {
    kind,
    geometry,
    material,
    stretch: r.stretch,
    triangles: triangleCount(geometry),
    ms: performance.now() - t0
  }
}

const triangleCount = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3

export function disposeShotAsset(asset: ShotAsset): void {
  asset.geometry.dispose()
  asset.material.dispose()
}
