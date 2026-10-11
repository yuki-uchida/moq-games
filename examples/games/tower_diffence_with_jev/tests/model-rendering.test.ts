import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { ModelUnitVisual, type UnitModelDefinition } from '../src/rendering/ModelUnitVisual'

function fixture(): GLTF {
  const scene = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  mesh.name = 'body'
  scene.add(mesh)
  const clips = ['idle', 'walk', 'attack', 'death'].map(name => new THREE.AnimationClip(name, 1, [
    new THREE.NumberKeyframeTrack('body.position[x]', [0, 1], [0, 2])
  ]))
  return { scene, scenes: [scene], animations: clips, cameras: [], asset: { version: '2.0' } } as unknown as GLTF
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve() }
function definition(url = '/model.glb'): UnitModelDefinition {
  return { scale: 20, origin: [0, 0, 0], yaw: 0, walkDistance: 24, provenance: 'test fixture',
    clips: Object.fromEntries(['idle', 'walk', 'attack', 'death'].map(clip => [clip, { url, clip }])) }
}

describe('real mesh asset ownership', () => {
  it('loads lazily, de-duplicates a URL, and shares geometry but not materials', async () => {
    const load = vi.fn(async () => fixture())
    const cache = new ModelAssetCache(load)
    expect(load).not.toHaveBeenCalled()
    cache.request('/model.glb'); cache.request('/model.glb')
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
    const first = cache.acquire({ url: '/model.glb', clip: 'idle' })!
    const second = cache.acquire({ url: '/model.glb', clip: 'idle' })!
    const a = first.scene.children[0] as THREE.Mesh, b = second.scene.children[0] as THREE.Mesh
    expect(a).not.toBe(b)
    expect(a.geometry).toBe(b.geometry)
    expect(a.material).not.toBe(b.material)
    const dispose = vi.spyOn(a.geometry, 'dispose')
    first.release(); first.release()
    expect(dispose).not.toHaveBeenCalled()
    expect(cache.diagnostics().entries[0].references).toBe(1)
    second.release(); cache.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
  it('bounds concurrent loads and exposes failure without retry storms', async () => {
    const pending: Array<(value: GLTF) => void> = []
    const load = vi.fn(() => new Promise<GLTF>(resolve => pending.push(resolve)))
    const cache = new ModelAssetCache(load, 1024, 2)
    for (const url of ['a', 'b', 'c']) cache.request(url)
    expect(load).toHaveBeenCalledTimes(2)
    pending[0](fixture()); await settle()
    expect(load).toHaveBeenCalledTimes(3)
    pending[1](fixture()); pending[2](fixture()); await settle()
    cache.evict()
    expect(cache.residentBytes).toBeLessThanOrEqual(1024)
    cache.dispose()
    const fail = vi.fn(async () => { throw new Error('missing approved asset') })
    const broken = new ModelAssetCache(fail)
    broken.request('bad'); await settle(); broken.request('bad')
    expect(broken.error('bad')).toBe('missing approved asset')
    expect(fail).toHaveBeenCalledTimes(1)
    broken.dispose()
  })
  it('runs adapters after sampled animation and tears them down in reverse order', async () => {
    const cache = new ModelAssetCache(async () => fixture())
    cache.request('/model.glb'); await settle()
    const order: string[] = []
    const spec = definition()
    const adapters = ['material', 'skinning'].map(name => (scene: THREE.Object3D) => ({
      update: () => { expect(scene.children[0].position.x).toBeCloseTo(1); order.push(name) },
      dispose: () => { order.push(`dispose:${name}`) }
    }))
    const visual = new ModelUnitVisual({ ...spec, clips: { idle: { url: '/model.glb', clip: 'idle', adapters } } }, cache)
    expect(visual.sample({ motion: 'idle', seconds: .5, loop: true, facingX: 0, facingY: 1, boss: false })).toBe(true)
    expect(visual.diagnostics()).toMatchObject({ renderer: 'gltf-mesh', meshes: 1, triangles: 12, seconds: .5 })
    visual.dispose(); cache.dispose()
    expect(order).toEqual(['material', 'skinning', 'dispose:skinning', 'dispose:material'])
  })
  it('resamples clamped non-looping clips on replay and refuses missing special motions', async () => {
    const cache = new ModelAssetCache(async () => fixture())
    cache.request('/model.glb'); await settle()
    const visual = new ModelUnitVisual(definition(), cache)
    const pose = { motion: 'attack' as const, loop: false, facingX: 1, facingY: 0, boss: true }
    visual.sample({ ...pose, seconds: 4 })
    expect(visual.diagnostics().seconds).toBe(1)
    visual.sample({ ...pose, seconds: .25 })
    const body = visual.root.getObjectByName('body')!
    expect(body.position.x).toBeCloseTo(.5)
    expect(() => visual.sample({ ...pose, motion: 'heal', seconds: 0 })).toThrow('Missing required heal')
    visual.dispose(); cache.dispose()
  })
})
