import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { GameEngine } from '../src/game/GameEngine'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { ModelUnitVisual, unitModelPose, type UnitModelDefinition } from '../src/rendering/ModelUnitVisual'
import { ModelUnitLayer } from '../src/rendering/ModelUnitLayer'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'
import type { Unit, CombatAttack, GameState } from '../src/game/model'

function fixture(): GLTF {
  const scene = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  mesh.name = 'body'
  scene.add(mesh)
  const clips = ['idle', 'walk', 'attack', 'death'].map(
    (name) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('body.position[x]', [0, 1], [0, 2])])
  )
  return { scene, scenes: [scene], animations: clips, cameras: [], asset: { version: '2.0' } } as unknown as GLTF
}
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}
function definition(url = '/model.glb'): UnitModelDefinition {
  return {
    scale: 20,
    origin: [0, 0, 0],
    yaw: 0,
    walkDistance: 24,
    provenance: 'test fixture',
    clips: Object.fromEntries(['idle', 'walk', 'attack', 'death'].map((clip) => [clip, { url, clip }]))
  }
}

describe('real mesh asset ownership', () => {
  it('keeps loaded clips and live rigs across stage 1→2 and releases session assets on disposal', async () => {
    const load = vi.fn(async () => {
      const source = fixture()
      const mesh = source.scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
      // Count a large decoded texture without allocating its pixels in the CPU fixture.
      mesh.material.map = new THREE.Texture({ width: 8192, height: 8192 })
      return source
    })
    const cache = new ModelAssetCache(load, Infinity)
    const scene = new THREE.Scene()
    const layer = new ModelUnitLayer(scene, { soldier: definition() }, cache)
    const engine = new GameEngine({ decide: async () => null })
    engine.place('soldier', 0)
    expect(layer.prepareDefender('soldier')).toBe(false)
    await settle()
    expect(layer.prepareDefender('soldier')).toBe(true)
    layer.render(engine.state)
    const rigs = [...scene.children]
    cache.request('/past-wave.glb')
    await settle()
    const entries = cache.diagnostics().entries
    engine.state.phase = 'cleared'
    expect(engine.nextStage()).toBe(true)
    layer.render(engine.state)
    cache.setRequiredUrls([])
    cache.evict()
    expect(scene.children).toEqual(rigs)
    expect(layer.visible(engine.state.units[0].id)).toBe(true)
    expect(cache.residentBytes).toBeGreaterThan(192 * 1024 * 1024)
    expect(cache.diagnostics().entries).toEqual(entries)
    expect(load).toHaveBeenCalledTimes(2)
    const geometry = (scene.children[0].getObjectByName('body') as THREE.Mesh).geometry
    const dispose = vi.spyOn(geometry, 'dispose')
    layer.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(cache.diagnostics().entries).toEqual([])
  })

  it('drops previous-stage corpses while reusing and resetting revived defenders', async () => {
    const cache = new ModelAssetCache(async () => fixture(), Infinity)
    const scene = new THREE.Scene()
    const layer = new ModelUnitLayer(scene, { soldier: definition() }, cache)
    cache.request('/model.glb')
    await settle()
    const engine = new GameEngine({ decide: async () => null })
    engine.place('soldier', 0)
    engine.state.units.push({ ...engine.state.units[0], id: 2, owner: 'ai' })
    layer.render(engine.state)
    const survivor = scene.children[0],
      corpse = scene.children[1]
    engine.state.time = 10
    for (const unit of engine.state.units) unit.hp = 0
    layer.render(engine.state)
    engine.state.phase = 'cleared'
    engine.nextStage()
    layer.render(engine.state)
    expect(scene.children).toContain(survivor)
    expect(scene.children).not.toContain(corpse)
    expect(layer.visible(engine.state.units[0].id)).toBe(true)
    engine.state.time = 2
    engine.state.units[0].hp = 0
    layer.render(engine.state)
    engine.state.time = 3.3
    layer.render(engine.state)
    expect(layer.visible(engine.state.units[0].id)).toBe(false)
    layer.dispose()
  })

  it('keeps upcoming motion clips ready above the soft budget and evicts after the wave releases them', async () => {
    const cache = new ModelAssetCache(async () => fixture(), 1)
    cache.setRequiredUrls(['/idle.glb', '/attack.glb'])
    cache.request('/idle.glb')
    cache.request('/attack.glb')
    await settle()
    cache.evict()
    expect(cache.diagnostics().entries).toHaveLength(2)
    expect(cache.diagnostics().entries.every((entry) => entry.state === 'ready' && entry.required)).toBe(true)
    cache.setRequiredUrls(['/idle.glb'])
    cache.evict()
    expect(cache.diagnostics().entries.map((entry) => entry.url)).toEqual(['/idle.glb'])
    cache.setRequiredUrls([])
    cache.evict()
    expect(cache.residentBytes).toBe(0)
    cache.dispose()
  })
  it('loads lazily, de-duplicates a URL, and shares geometry but not materials', async () => {
    const load = vi.fn(async () => fixture())
    const cache = new ModelAssetCache(load)
    expect(load).not.toHaveBeenCalled()
    cache.request('/model.glb')
    cache.request('/model.glb')
    await settle()
    expect(load).toHaveBeenCalledTimes(1)
    const timing = cache.diagnostics().entries[0]
    expect(timing.queueMs).toBeGreaterThanOrEqual(0)
    expect(timing.loadMs).toBeGreaterThanOrEqual(0)
    const first = cache.acquire({ url: '/model.glb', clip: 'idle' })!
    const second = cache.acquire({ url: '/model.glb', clip: 'idle' })!
    const a = first.scene.children[0] as THREE.Mesh,
      b = second.scene.children[0] as THREE.Mesh
    expect(a).not.toBe(b)
    expect(a.geometry).toBe(b.geometry)
    expect(a.material).not.toBe(b.material)
    const dispose = vi.spyOn(a.geometry, 'dispose')
    first.release()
    first.release()
    expect(dispose).not.toHaveBeenCalled()
    expect(cache.diagnostics().entries[0].references).toBe(1)
    second.release()
    cache.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
  it('bounds concurrent loads and exposes failure without retry storms', async () => {
    const pending: Array<(value: GLTF) => void> = []
    const load = vi.fn(() => new Promise<GLTF>((resolve) => pending.push(resolve)))
    const cache = new ModelAssetCache(load, 1024, 2)
    for (const url of ['a', 'b', 'c']) cache.request(url)
    expect(load).toHaveBeenCalledTimes(2)
    pending[0](fixture())
    await settle()
    expect(load).toHaveBeenCalledTimes(3)
    pending[1](fixture())
    pending[2](fixture())
    await settle()
    cache.evict()
    expect(cache.residentBytes).toBeLessThanOrEqual(1024)
    cache.dispose()
    const fail = vi.fn(async () => {
      throw new Error('missing approved asset')
    })
    const broken = new ModelAssetCache(fail)
    broken.request('bad')
    await settle()
    broken.request('bad')
    expect(broken.error('bad')).toBe('missing approved asset')
    expect(fail).toHaveBeenCalledTimes(1)
    broken.dispose()
  })
  it('runs adapters after sampled animation and tears them down in reverse order', async () => {
    const cache = new ModelAssetCache(async () => fixture())
    cache.request('/model.glb')
    await settle()
    const order: string[] = []
    const spec = definition()
    const adapters = ['material', 'skinning'].map((name) => (scene: THREE.Object3D) => ({
      update: () => {
        expect(scene.children[0].position.x).toBeCloseTo(1)
        order.push(name)
      },
      dispose: () => {
        order.push(`dispose:${name}`)
      }
    }))
    const visual = new ModelUnitVisual(
      { ...spec, clips: { idle: { url: '/model.glb', clip: 'idle', adapters } } },
      cache
    )
    expect(visual.sample({ motion: 'idle', seconds: 0.5, loop: true, facingX: 0, facingY: 1, boss: false })).toBe(true)
    expect(visual.diagnostics()).toMatchObject({ renderer: 'gltf-mesh', meshes: 1, triangles: 12, seconds: 0.5 })
    visual.dispose()
    cache.dispose()
    expect(order).toEqual(['material', 'skinning', 'dispose:skinning', 'dispose:material'])
  })
  it('resamples clamped non-looping clips on replay and refuses missing special motions', async () => {
    const cache = new ModelAssetCache(async () => fixture())
    cache.request('/model.glb')
    await settle()
    const visual = new ModelUnitVisual(definition(), cache)
    const pose = { motion: 'attack' as const, loop: false, facingX: 1, facingY: 0, boss: true }
    visual.sample({ ...pose, seconds: 4 })
    expect(visual.diagnostics().seconds).toBe(1)
    visual.sample({ ...pose, seconds: 0.25 })
    const body = visual.root.getObjectByName('body')!
    expect(body.position.x).toBeCloseTo(0.5)
    expect(() => visual.sample({ ...pose, motion: 'heal', seconds: 0 })).toThrow('Missing required heal')
    visual.dispose()
    cache.dispose()
  })
  it('preserves current Runner combat timing while mapping its latest 640/320 source clock', async () => {
    expect(ATTACK_PROFILES.runner).toMatchObject({ durationMs: 480, cueMs: 240 })
    const cache = new ModelAssetCache(async () => fixture())
    cache.request('/model.glb')
    await settle()
    const unit = { hp: 10, type: 'runner', moving: false, facingX: 0, facingY: 1, boss: false } as Unit
    const action = { startedAt: 1, endsAt: 1.48, status: 'windup', kind: 'attack' } as CombatAttack
    const visual = new ModelUnitVisual({ ...definition(), attackTimeScale: 640 / 480 }, cache)
    visual.sample(unitModelPose(unit, 1.24, action))
    expect(visual.diagnostics().seconds).toBeCloseTo(0.32)
    visual.dispose()
    cache.dispose()
  })
  it('blocks a missing roster member instead of constructing a sprite or unrelated model', () => {
    const scene = new THREE.Scene()
    const layer = new ModelUnitLayer(scene, {})
    const state = {
      phase: 'assault',
      units: [{ id: 1, type: 'runner', hp: 10 }],
      attacks: [],
      time: 0,
      stage: 1,
      fieldId: 'meadow'
    } as unknown as GameState
    expect(layer.ready(state)).toBe(false)
    layer.render(state)
    expect(layer.visible(1)).toBe(false)
    expect(layer.errors.runner).toContain('runner')
    expect(scene.children).toHaveLength(0)
    layer.dispose()
  })
  it('recognizes historical Healer and breath actions without modern kind/variant fields', () => {
    const unit = { hp: 10, type: 'healer', moving: false, facingX: 0, facingY: 1, boss: false } as Unit
    const action = { startedAt: 1, endsAt: 2, status: 'windup', healing: { active: true } } as CombatAttack
    expect(unitModelPose(unit, 1.2, action).motion).toBe('heal')
    expect(unitModelPose({ ...unit, type: 'dragon' }, 1.2, { ...action, breath: {} } as CombatAttack).motion).toBe(
      'breath'
    )
  })
})
