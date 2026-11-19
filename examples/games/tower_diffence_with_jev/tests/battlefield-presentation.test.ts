import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  battlefieldPresentation,
  GAME_MODEL_PRESENTATION_SCALE,
  modelPresentationScale
} from '../src/rendering/BattlefieldPresentation'
import { ModelUnitVisual } from '../src/rendering/ModelUnitVisual'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import { GameRenderer } from '../src/rendering/GameRenderer'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

describe('responsive presentation without changing world geometry', () => {
  const field = { width: 1280, height: 920, layoutRevision: 4 }
  for (const viewport of [
    { width: 2024, height: 1085, modelScale: 1.5 },
    { width: 1416, height: 812, modelScale: 1.5 },
    { width: 1256, height: 632, modelScale: 1.5 },
    { width: 366, height: 715, modelScale: 1.184 },
    { width: 820, height: 302, modelScale: 1.5 },
    { width: 296, height: 439, modelScale: 1.242 }
  ]) {
    it(`fits and uses the available field at ${viewport.width}×${viewport.height}`, () => {
      const fit = battlefieldPresentation(viewport, field)
      expect(fit.scaleX * field.width).toBeCloseTo(viewport.width)
      expect(fit.scaleY * field.height).toBeCloseTo(viewport.height)
      expect(fit.aspectExpansion).toBeCloseTo(fit.scaleX / fit.scaleY)
      expect(fit.modelScale).toBeCloseTo(viewport.modelScale, 3)
    })
  }
  it('retains scrollable legacy presentation exactly', () => {
    expect(battlefieldPresentation({ width: 390, height: 844 }, { ...field, layoutRevision: 2 })).toEqual({
      scaleX: 0.55,
      scaleY: 0.55,
      aspectExpansion: 1,
      modelScale: 1
    })
  })
  it('keeps real-model proportions and the same ground anchor after widening and resize', () => {
    const cache = new ModelAssetCache()
    const actor = new ModelUnitVisual(UNIT_MODEL_CATALOG.soldier!, cache)
    actor.setPosition(317, 436)
    const native = actor.root.matrix.clone()
    for (const aspect of [1.4, 1, 0.37]) {
      const scale = modelPresentationScale(aspect)
      actor.setPresentation(scale, aspect)
      const display = new THREE.Matrix4().makeScale(aspect, 1, 1).multiply(actor.root.matrix)
      for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
        const old = axis.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(native))
        const shown = axis.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(display))
        expect(shown.distanceTo(old.multiplyScalar(scale))).toBeLessThan(1e-10)
      }
      expect(new THREE.Vector3().setFromMatrixPosition(actor.root.matrix).toArray()).toEqual([317, 436, 47.6])
    }
    actor.dispose()
    cache.dispose()
  })
  it('maps pointer hits back to original world positions under nonuniform fit', () => {
    const bounds = { left: 12, top: 72, width: 2024, height: 1085 }
    const renderer = { host: { getBoundingClientRect: () => bounds }, field } as unknown as GameRenderer
    for (const point of [
      { x: 80, y: 76 },
      { x: 1200, y: 834 },
      { x: 634, y: 391 }
    ]) {
      const hit = GameRenderer.prototype.worldPointAt.call(
        renderer,
        bounds.left + (point.x / field.width) * bounds.width,
        bounds.top + (point.y / field.height) * bounds.height
      )!
      expect(hit.x).toBeCloseTo(point.x)
      expect(hit.y).toBeCloseTo(point.y)
    }
    expect(GameRenderer.prototype.worldPointAt.call(renderer, -1, 300)).toBeNull()
  })
  it('projects an authored projectile emitter from the enlarged real rig, preserving its ground anchor', async () => {
    const scene = new THREE.Group()
    const emitter = new THREE.Object3D()
    emitter.name = 'Emitter'
    emitter.position.set(10, 20, 0)
    scene.add(emitter)
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    const data = {
      scene,
      scenes: [scene],
      animations: [new THREE.AnimationClip('attack', 1, [])],
      cameras: [],
      asset: { version: '2.0' }
    } as unknown as GLTF
    const cache = new ModelAssetCache(async () => data)
    const actor = new ModelUnitVisual(
      {
        scale: 1,
        origin: [0, 0, 0],
        yaw: 0,
        walkDistance: 10,
        provenance: 'synthetic test',
        clips: { attack: { url: '/synthetic-emitter.glb', clip: 'attack' } },
        emitter: { node: 'Emitter' }
      },
      cache
    )
    cache.request('/synthetic-emitter.glb')
    for (let i = 0; i < 16 && cache.request('/synthetic-emitter.glb') === 'loading'; i++)
      await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cache.request('/synthetic-emitter.glb'), cache.error('/synthetic-emitter.glb')).toBe('ready')
    actor.setPosition(100, 200)
    actor.setPresentation(GAME_MODEL_PRESENTATION_SCALE, 1.4)
    const point = actor.emitterAt({ motion: 'attack', seconds: 0.4, loop: false, facingX: 0, facingY: 1, boss: false })!
    expect((point.x - 100) * 1.4).toBeCloseTo(10 * GAME_MODEL_PRESENTATION_SCALE)
    expect(point.y - 200).toBeCloseTo(-20 * Math.cos(Math.atan2(2, 5)) * GAME_MODEL_PRESENTATION_SCALE)
    expect(new THREE.Vector3().setFromMatrixPosition(actor.root.matrix).toArray()).toEqual([100, 200, 24])
    actor.dispose()
    cache.dispose()
  })
})
