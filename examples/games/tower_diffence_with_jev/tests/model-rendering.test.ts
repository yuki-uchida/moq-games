import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { GameEngine } from '../src/game/GameEngine'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { ModelUnitVisual, unitModelPose, type UnitModelDefinition } from '../src/rendering/ModelUnitVisual'
import { installOgreDQSkinningAdapter } from '../src/rendering/models/adapters/runtime/ogre-dq-skinning-adapter.js'
import { installOgreDQSkinningAdapter as installReferenceOgreDQ } from '../src/rendering/models/adapters/source/ogre-dq-skinning-adapter.js'
import { reuseSkinnedBoundsMatrices } from '../src/rendering/SkinnedBounds'
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
  it('warms only idle until selection requires the remaining motion sources', async () => {
    const load = vi.fn(async (_url: string) => fixture())
    const cache = new ModelAssetCache(load)
    const spec = {
      ...definition(),
      clips: {
        idle: { url: '/idle.glb', clip: 'idle' },
        walk: { url: '/walk.glb', clip: 'walk' },
        attack: { url: '/attack.glb', clip: 'attack' }
      }
    }
    const layer = new ModelUnitLayer(new THREE.Scene(), { soldier: spec }, cache)
    expect(layer.prepareDefender('soldier')).toBe(false)
    await settle()
    expect(layer.prepareDefender('soldier')).toBe(true)
    expect(load.mock.calls.map(([url]) => url)).toEqual(['/idle.glb'])
    const state = { units: [], attacks: [], phase: 'assault', stage: 1, time: 0 } as unknown as GameState
    expect(layer.ready(state, 'soldier')).toBe(false)
    await settle()
    expect(layer.ready(state, 'soldier')).toBe(true)
    expect(load.mock.calls.map(([url]) => url)).toEqual(['/idle.glb', '/walk.glb', '/attack.glb'])
    layer.dispose()
  })

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
    layer.setDefenderPreparationVisible(['soldier'], false)
    expect(scene.children).toHaveLength(0)
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
    expect(visual.diagnostics()).toMatchObject({ visible: false, meshes: 0, rigs: 0 })
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
  it('retains detached motion rigs without updating them and restores exact poses and emitters on reuse', async () => {
    const source = fixture()
    const bone = new THREE.Bone()
    bone.name = 'emitter'
    source.scene.children[0].add(bone)
    for (const clip of source.animations)
      clip.tracks.push(new THREE.NumberKeyframeTrack('emitter.position[y]', [0, 1], [0, 3]))
    const load = vi.fn(async () => source)
    const cache = new ModelAssetCache(load)
    cache.request('/model.glb')
    await settle()
    const acquire = vi.spyOn(cache, 'acquire')
    const spec = { ...definition(), emitter: { node: 'emitter', local: [1, 2, 3] as const } }
    const visual = new ModelUnitVisual(spec, cache)
    const scene = new THREE.Scene()
    scene.add(visual.root)
    visual.setPosition(123, 234)
    visual.setPresentation(1.2, 1.4)
    const pose = { seconds: 0.35, loop: true, facingX: 1, facingY: -1, boss: true }
    for (const motion of ['idle', 'walk', 'attack'] as const) visual.sample({ ...pose, motion })
    const leases = acquire.mock.results.map((result) => result.value!)
    const updates = leases.map((lease) => ({
      explicit: vi.spyOn(lease.scene, 'updateWorldMatrix'),
      render: vi.spyOn(lease.scene, 'updateMatrixWorld'),
      release: vi.spyOn(lease, 'release')
    }))
    // Each previously used rig must be reusable without reacquisition or a changed world pose.
    for (const motion of ['walk', 'idle', 'attack', 'idle'] as const) {
      for (const update of updates) {
        update.explicit.mockClear()
        update.render.mockClear()
      }
      visual.sample({ ...pose, motion })
      scene.updateMatrixWorld(true)
      const index = ['idle', 'walk', 'attack'].indexOf(motion)
      for (let i = 0; i < leases.length; i++) {
        expect(updates[i].explicit.mock.calls.length).toBe(i === index ? 1 : 0)
        expect(updates[i].render.mock.calls.length).toBe(i === index ? 1 : 0)
        expect(leases[i].scene.parent !== null).toBe(i === index)
      }
      const reference = new ModelUnitVisual(spec, cache)
      reference.setPosition(123, 234)
      reference.setPresentation(1.2, 1.4)
      reference.sample({ ...pose, motion })
      expect(visual.root.getObjectByName('emitter')!.matrixWorld.elements).toEqual(
        reference.root.getObjectByName('emitter')!.matrixWorld.elements
      )
      expect(visual.emitterAt({ ...pose, motion: 'attack', seconds: 0.8, loop: false })).toEqual(
        reference.emitterAt({ ...pose, motion: 'attack', seconds: 0.8, loop: false })
      )
      expect(visual.root.getObjectByName('emitter')!.matrixWorld.elements).toEqual(
        reference.root.getObjectByName('emitter')!.matrixWorld.elements
      )
      reference.dispose()
    }
    expect(visual.diagnostics().rigs).toBe(3)
    expect(load).toHaveBeenCalledTimes(1)
    // Only the independent reference actors acquired extra leases.
    expect(acquire).toHaveBeenCalledTimes(10)
    visual.dispose()
    for (const update of updates) expect(update.release).toHaveBeenCalledTimes(1)
    expect(scene.children).toHaveLength(0)
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

function ogreRigFixture(rigCount: number) {
  const root = new THREE.Group()
  const bones: THREE.Bone[][] = []
  const meshes: THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = []
  for (let n = 0; n < rigCount; n++) {
    const rig = Array.from({ length: 16 }, () => new THREE.Bone())
    rig.forEach((bone, i) => {
      bone.position.y = i ? 0.1 : 0
      if (i) rig[i - 1].add(bone)
    })
    root.add(rig[0])
    bones.push(rig)
  }
  root.updateMatrixWorld(true)
  for (let i = 0; i < 27; i++) {
    const geometry = new THREE.BoxGeometry(),
      count = geometry.attributes.position.count
    const weights = new Float32Array(count * 4),
      indices = new Uint16Array(count * 4)
    for (let v = 0; v < count; v++) {
      weights[v * 4] = 0.75
      weights[v * 4 + 1] = 0.25
      indices[v * 4 + 1] = 1
    }
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4))
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4))
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial())
    mesh.bind(new THREE.Skeleton(bones[i % rigCount]), new THREE.Matrix4())
    root.add(mesh)
    meshes.push(mesh)
  }
  return { root, bones, meshes }
}
function ogrePalettes(fixture: ReturnType<typeof ogreRigFixture>) {
  return fixture.meshes.map((mesh) => {
    const shader = {
      uniforms: {},
      vertexShader:
        '#include <skinning_pars_vertex>\n#include <skinbase_vertex>\n#include <skinnormal_vertex>\n#include <skinning_vertex>'
    } as any
    mesh.material.onBeforeCompile(shader, undefined as any)
    return shader
  })
}

for (const rigCount of [1, 2]) {
  it(`shares Ogre palettes across equal binds with ${rigCount} rig(s), preserving original shader and float values`, () => {
    const baseline = ogreRigFixture(rigCount),
      candidate = ogreRigFixture(rigCount)
    const reference = installReferenceOgreDQ(baseline.root, { THREE })
    const optimized = installOgreDQSkinningAdapter(candidate.root, { THREE })
    const before = ogrePalettes(baseline),
      after = ogrePalettes(candidate)
    const oldUpdates = baseline.meshes.map((mesh) => vi.spyOn(mesh.skeleton, 'update'))
    const newUpdates = candidate.meshes.map((mesh) => vi.spyOn(mesh.skeleton, 'update'))
    const compare = () => {
      reference.update!()
      optimized.update!()
      for (let i = 0; i < before.length; i++) {
        expect(after[i].vertexShader).toBe(before[i].vertexShader)
        for (const key of ['ogreDQReal', 'ogreDQDual'])
          expect(Array.from(after[i].uniforms[key].value)).toEqual(Array.from(before[i].uniforms[key].value))
      }
    }
    for (let facing = 0; facing < 8; facing++) {
      for (const time of [0, 0.17, 0.33, 0.5, 0.7, 0.9, 1, 1.2]) {
        for (const fixture of [baseline, candidate]) {
          fixture.root.rotation.z = (facing * Math.PI) / 4
          fixture.bones.forEach((rig, n) => {
            rig[4].rotation.x = time * (n + 1) * 0.2
          })
        }
        compare()
      }
    }
    expect(oldUpdates.reduce((n, spy) => n + spy.mock.calls.length, 0)).toBe(64 * 27)
    expect(newUpdates.reduce((n, spy) => n + spy.mock.calls.length, 0)).toBe(64 * rigCount)
    for (const fixture of [baseline, candidate]) fixture.meshes[2].position.x = 3
    compare()
    for (const fixture of [baseline, candidate])
      fixture.meshes[1].skeleton.boneInverses[0] = new THREE.Matrix4().makeTranslation(0.25, 0, 0)
    compare()
    reference.dispose()
    optimized.dispose()
  })
}

describe('detached action preparation', () => {
  const idle = { motion: 'idle' as const, seconds: 0.3, loop: true, facingX: 0, facingY: 1, boss: false }
  async function actor() {
    const cache = new ModelAssetCache(async () => fixture())
    cache.request('/model.glb')
    await settle()
    const visual = new ModelUnitVisual(definition(), cache)
    visual.sample(idle)
    return { cache, visual }
  }
  it('prepares one action at a time without sampling, changing the active pose or attaching a hidden rig', async () => {
    const { cache, visual } = await actor()
    const before = visual.diagnostics()
    const active = visual.root.getObjectByName('body')!
    const parent = active.parent
    const update = vi.spyOn(visual.root, 'updateWorldMatrix')
    const acquire = vi.spyOn(cache, 'acquire')
    let finish!: () => void
    const compile = vi.fn((scene: THREE.Object3D) => {
      expect(scene.parent).toBeNull()
      expect((scene.getObjectByName('body') as THREE.Mesh).position.x).toBe(0)
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const pending = visual.prepareNextMotion(compile)!
    await settle()
    expect(visual.prepareNextMotion(compile)).toBeUndefined()
    expect(visual.diagnostics()).toEqual({ ...before, rigs: 2 })
    expect(active.parent).toBe(parent)
    expect(visual.root.getObjectByName('body')).toBe(active)
    expect(update).not.toHaveBeenCalled()
    finish()
    await pending
    expect(visual.sample({ ...idle, motion: 'walk' })).toBe(true)
    expect(acquire).toHaveBeenCalledTimes(1)
    await visual.prepareNextMotion(async () => {})
    expect(acquire).toHaveBeenCalledTimes(2)
    expect(visual.prepareNextMotion(async () => {})).toBeUndefined()
    visual.sample({ ...idle, motion: 'attack', loop: false })
    visual.sample({ ...idle, motion: 'walk' })
    expect(acquire).toHaveBeenCalledTimes(2)
    visual.dispose()
    cache.dispose()
  })
  it('skips compilation if disposed before submission', async () => {
    const { cache, visual } = await actor()
    const compile = vi.fn(async () => {})
    const pending = visual.prepareNextMotion(compile)
    visual.dispose()
    await pending
    expect(compile).not.toHaveBeenCalled()
    expect(cache.diagnostics().entries[0].references).toBe(0)
    cache.dispose()
  })
  it('retains only the compiling lease through disposal, then releases it exactly once', async () => {
    const { cache, visual } = await actor()
    let finish!: () => void
    let material!: THREE.Material
    let dispose!: ReturnType<typeof vi.spyOn>
    const pending = visual.prepareNextMotion((scene) => {
      material = (scene.getObjectByName('body') as THREE.Mesh).material as THREE.Material
      dispose = vi.spyOn(material, 'dispose')
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    await settle()
    visual.dispose()
    visual.dispose()
    expect(dispose).not.toHaveBeenCalled()
    expect(cache.diagnostics().entries[0].references).toBe(1)
    finish()
    await pending
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(cache.diagnostics().entries[0].references).toBe(0)
    expect(visual.sample(idle)).toBe(false)
    cache.dispose()
  })
  it('keeps the same lease usable after compilation rejection', async () => {
    const { cache, visual } = await actor()
    const acquire = vi.spyOn(cache, 'acquire')
    await expect(
      visual.prepareNextMotion(async () => {
        throw Error('shader unavailable')
      })
    ).rejects.toThrow('shader unavailable')
    expect(visual.sample({ ...idle, motion: 'walk' })).toBe(true)
    expect(acquire).toHaveBeenCalledTimes(1)
    visual.dispose()
    cache.dispose()
  })
  it('does not retry a broken adapter every background frame', async () => {
    const cache = new ModelAssetCache(async () => fixture())
    cache.request('/model.glb')
    await settle()
    const install = vi.fn(() => {
      throw Error('invalid action rig')
    })
    const spec = definition()
    const visual = new ModelUnitVisual(
      { ...spec, clips: { idle: spec.clips.idle, walk: { ...spec.clips.walk!, adapters: [install] } } },
      cache
    )
    visual.sample(idle)
    for (let i = 0; i < 10; i++) visual.prepareNextMotion(async () => {})
    expect(install).toHaveBeenCalledTimes(1)
    expect(() => visual.sample({ ...idle, motion: 'walk' })).toThrow('invalid action rig')
    visual.dispose()
    cache.dispose()
  })
})

it('keeps the aimed facing through the special recovery instead of snapping to the prior idle direction', () => {
  const engine = new GameEngine({ decide: async () => null })
  engine.place('soldier', 0)
  engine.startAssault()
  const unit = engine.state.units[0]
  expect(engine.castSpecial(unit.id, { x: unit.x + 40, y: unit.y })).toBe(true)
  const casting = unitModelPose(unit, 0),
    recovered = unitModelPose(unit, 2)
  expect(casting.motion).toBe('special')
  expect(recovered.motion).toBe('idle')
  expect([casting.facingX, casting.facingY]).toEqual([1, 0])
  expect([recovered.facingX, recovered.facingY]).toEqual([1, 0])
})

describe('external dedicated special clip', () => {
  it('plays a JSON clip on the cached idle model without duplicating model downloads', async () => {
    const model = fixture(),
      load = vi.fn(async () => model),
      cache = new ModelAssetCache(load)
    const clip = new THREE.AnimationClip('ultimate_soldier', 1.2, [
      new THREE.NumberKeyframeTrack('body.position[x]', [0, 0.45, 1.2], [0, 3, 0])
    ])
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => THREE.AnimationClip.toJSON(clip) } as Response)
    const special = { url: '/model.glb', clip: 'ultimate_soldier', clipUrl: '/special.json' }
    expect(cache.requestSource(special)).not.toBe('ready')
    await settle()
    expect(cache.requestSource(special)).toBe('ready')
    const lease = cache.acquire(special)!
    expect(lease.clip.name).toBe('ultimate_soldier')
    expect(load).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    lease.release()
    cache.dispose()
    fetcher.mockRestore()
  })
})


describe('first posed skinned bounds matrix reuse', () => {
  function mesh(normalized = false) {
    const geometry = new THREE.BufferGeometry()
    const positions: number[] = [], indices: number[] = [], weights: number[] = []
    for (let i = 0; i < 256; i++) {
      positions.push(Math.sin(i) * 3, Math.cos(i * .7), (i % 13) / 7)
      indices.push(0, 1, 2, 3)
      weights.push(...(normalized ? [64, 64, 64, 63] : [.25, .25, .25, .25]))
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4))
    geometry.setAttribute('skinWeight', normalized
      ? new THREE.Uint8BufferAttribute(weights, 4, true)
      : new THREE.Float32BufferAttribute(weights, 4))
    const bones = Array.from({ length: 4 }, () => new THREE.Bone())
    const root = new THREE.Group(), value = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial())
    root.add(...bones, value)
    root.updateMatrixWorld(true)
    value.bind(new THREE.Skeleton(bones))
    return { value, bones, root }
  }
  function reference(value: THREE.SkinnedMesh) {
    value.boundingSphere = null
    THREE.SkinnedMesh.prototype.computeBoundingSphere.call(value)
    return value.boundingSphere!.clone()
  }
  function equal(value: THREE.SkinnedMesh, expected: THREE.Sphere) {
    value.boundingSphere = null
    value.computeBoundingSphere()
    expect(value.boundingSphere!.center.toArray()).toEqual(expected.center.toArray())
    expect(value.boundingSphere!.radius).toBe(expected.radius)
  }
  for (const normalized of [false, true]) {
    for (const relative of [undefined, false, true]) {
      it(`keeps exact spheres across changed poses/binds/inverses, normalized=${normalized}, morph=${relative}`, () => {
        const { value, bones, root } = mesh(normalized)
        if (relative !== undefined) {
          value.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(
            Array.from({length: 256 * 3}, (_, i) => Math.sin(i * .3) * .1), 3)]
          value.geometry.morphTargetsRelative = relative
          value.updateMorphTargets()
          value.morphTargetInfluences![0] = .37
        }
        reuseSkinnedBoundsMatrices(value)
        expect(value.boundingSphere).toBeNull()
        for (let pose = 0; pose < 16; pose++) {
          for (const [index, bone] of bones.entries()) {
            bone.position.set(Math.sin(pose + index), index / 10, pose / 25)
            bone.rotation.set(pose / 31, index / 8, pose / 23)
          }
          value.bindMatrix.makeTranslation(pose / 10, .2, -.3)
          value.bindMatrixInverse.copy(value.bindMatrix).invert()
          value.skeleton.boneInverses[1].makeRotationY(pose / 41)
          root.updateMatrixWorld(true)
          equal(value, reference(value))
        }
      })
    }
  }
  it('computes each used bone product once per call, never across poses or using Float32 boneMatrices', () => {
    const { value, bones, root } = mesh()
    const multiply = vi.spyOn(THREE.Matrix4.prototype, 'multiplyMatrices')
    reference(value)
    expect(multiply).toHaveBeenCalledTimes(256 * 4)
    multiply.mockClear()
    reuseSkinnedBoundsMatrices(value)
    value.computeBoundingSphere()
    expect(multiply).toHaveBeenCalledTimes(4)
    multiply.mockRestore()
    bones[0].position.x = 1.0000000001
    root.updateMatrixWorld(true)
    equal(value, reference(value))
    value.geometry.dispose()
  })
  for (const custom of ['vertex', 'transform', 'attribute', 'interleaved', 'half'] as const) {
    it(`preserves exact native semantics for ${custom}`, () => {
      const { value } = mesh()
      if (custom === 'vertex') value.getVertexPosition = function (i, v) {
        return THREE.SkinnedMesh.prototype.getVertexPosition.call(this, i, v).addScalar(.3)
      }
      if (custom === 'transform') value.applyBoneTransform = function(i, v) {
        return THREE.SkinnedMesh.prototype.applyBoneTransform.call(this, i, v).addScalar(.2)
      }
      if (custom === 'attribute') value.geometry.attributes.position.getX = i => Math.sin(i) * 4
      if (custom === 'interleaved') {
        const array = value.geometry.attributes.position.array
        value.geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(
          new THREE.InterleavedBuffer(new Float32Array(array), 3), 3, 0))
      }
      if (custom === 'half') value.geometry.setAttribute('position', new THREE.Float16BufferAttribute(
        new Uint16Array(256 * 3).fill(0x3800), 3))
      const expected = reference(value)
      reuseSkinnedBoundsMatrices(value)
      equal(value, expected)
    })
  }
  it('does not replace a custom bounds implementation', () => {
    const { value } = mesh()
    const custom = value.computeBoundingSphere = vi.fn()
    reuseSkinnedBoundsMatrices(value)
    expect(value.computeBoundingSphere).toBe(custom)
  })
})

it('prepares an existing actor fade without acquiring another rig, retains it during disposal and does not retry failures', async () => {
  const cache = new ModelAssetCache(async () => fixture())
  cache.request('/model.glb')
  await settle()
  const visual = new ModelUnitVisual(definition(), cache)
  visual.sample({ motion: 'idle', seconds: 0.3, loop: true, facingX: 0, facingY: 1, boss: false })
  const acquire = vi.spyOn(cache, 'acquire')
  const compile = vi.fn(async () => {})
  let finish!: () => void
  const fade = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const pending = visual.prepareNextMotion(compile, fade)
  await settle()
  expect(acquire).not.toHaveBeenCalled()
  expect(compile).not.toHaveBeenCalled()
  expect(fade).toHaveBeenCalledTimes(1)
  expect(visual.diagnostics()).toMatchObject({ visible: true, motion: 'idle', rigs: 1 })
  expect(visual.diagnostics().seconds).toBeCloseTo(0.3)
  expect(visual.prepareNextMotion(compile, fade)).toBeUndefined()
  visual.dispose()
  expect(cache.diagnostics().entries[0].references).toBe(1)
  finish()
  await pending
  expect(cache.diagnostics().entries[0].references).toBe(0)
  cache.dispose()
})

it('keeps a rejected fade usable without retrying it every frame or downloading another model', async () => {
  const cache = new ModelAssetCache(async () => fixture())
  cache.request('/model.glb')
  await settle()
  const visual = new ModelUnitVisual({ ...definition(), clips: { idle: definition().clips.idle } }, cache)
  const idle = { motion: 'idle' as const, seconds: 0.3, loop: true, facingX: 0, facingY: 1, boss: false }
  visual.sample(idle)
  const fade = vi.fn(async () => {
    throw Error('driver unavailable')
  })
  await expect(visual.prepareNextMotion(async () => {}, fade)).rejects.toThrow('driver unavailable')
  expect(visual.prepareNextMotion(async () => {}, fade)).toBeUndefined()
  expect(fade).toHaveBeenCalledTimes(1)
  expect(visual.sample(idle)).toBe(true)
  visual.dispose()
  cache.dispose()
})
