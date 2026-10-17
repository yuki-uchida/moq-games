import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  battlefieldPresentation,
  BATTLEFIELD_INSETS,
  GAME_MODEL_PRESENTATION_SCALE,
  MAX_FIELD_ASPECT_EXPANSION
} from '../src/rendering/BattlefieldPresentation'
import { ModelUnitVisual } from '../src/rendering/ModelUnitVisual'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import { GameRenderer } from '../src/rendering/GameRenderer'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

describe('responsive presentation without changing world geometry', () => {
  const field = { width: 1280, height: 920, layoutRevision: 4 }
  for (const viewport of [
    { width: 2048, height: 1173 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 320, height: 568 }
  ]) {
    it(`fits and uses the available field at ${viewport.width}×${viewport.height}`, () => {
      const fit = battlefieldPresentation(viewport, field)
      expect(fit.scaleX * field.width).toBeLessThanOrEqual(viewport.width - 24 + 1e-9)
      expect(fit.scaleY * field.height).toBeLessThanOrEqual(viewport.height - 88 + 1e-9)
      expect(fit.scaleX).toBe(fit.scaleY)
      expect(fit.aspectExpansion).toBe(1)
      expect(fit.aspectExpansion).toBeLessThanOrEqual(MAX_FIELD_ASPECT_EXPANSION + 1e-9)
      expect(fit.modelScale).toBe(GAME_MODEL_PRESENTATION_SCALE)
      const previous = Math.min((viewport.width - 24) / field.width, (viewport.height - 140) / field.height)
      expect(fit.scaleX).toBeGreaterThanOrEqual(previous)
      expect(fit.scaleY).toBeGreaterThanOrEqual(previous)
    })
  }
  it('preserves map proportions while retaining HUD and stage space', () => {
    const fit = battlefieldPresentation({ width: 2048, height: 1173 }, field)
    expect(fit.scaleX * field.width).toBeCloseTo((1280 * 1085) / 920)
    expect(fit.scaleY * field.height).toBeCloseTo(1085)
    expect(BATTLEFIELD_INSETS).toEqual({ top: 72, bottom: 16, sides: 12 })
  })
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
    for (const aspect of [1.4, 1, 1.27]) {
      actor.setPresentation(GAME_MODEL_PRESENTATION_SCALE, aspect)
      const display = new THREE.Matrix4().makeScale(aspect, 1, 1).multiply(actor.root.matrix)
      for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
        const old = axis.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(native))
        const shown = axis.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(display))
        expect(shown.distanceTo(old.multiplyScalar(GAME_MODEL_PRESENTATION_SCALE))).toBeLessThan(1e-10)
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
