import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import { ModelViewerSession, viewerMotions, viewerRoleLabel, viewerRoles } from '../src/ui/ModelViewerSession'
import type { ModelMotion } from '../src/rendering/ModelUnitVisual'
import type { UnitType } from '../src/game/model'

function fixture(): GLTF {
  const scene = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
  scene.add(mesh)
  // Minimal role torso nodes keep this playback-clock fixture compatible with directed rigs.
  for (const name of ['gel', 'chest', 'head']) {
    const bone = new THREE.Bone()
    bone.name = name
    scene.add(bone)
  }
  return {
    scene,
    scenes: [scene],
    animations: ['idle', 'walk', 'attack', 'death'].map(
      (name) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])])
    ),
    cameras: [],
    asset: { version: '2.0' },
    parser: { json: {} }
  } as unknown as GLTF
}
async function ready(session: ModelViewerSession) {
  for (let i = 0; i < 200 && session.state === 'loading'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    session.tick(0)
  }
  expect(session.state, session.error).toBe('ready')
}

describe('EXTRA shared real model playback', () => {
  it('keeps the entrypoint model-only and read-only', () => {
    const entry = readFileSync(resolve('examples/games/tower_diffence_with_jev/src/ui/ExtraViewer.ts'), 'utf8')
    const session = readFileSync(resolve('examples/games/tower_diffence_with_jev/src/ui/ModelViewerSession.ts'), 'utf8')
    for (const forbidden of [
      'SheetView',
      'tower-defense-viewer',
      'new Audio',
      'GameEngine',
      'CampaignStorage',
      'localStorage',
      'WebSocket'
    ]) {
      expect(entry).not.toContain(forbidden)
      expect(session).not.toContain(forbidden)
    }
    expect(session).toContain('new ModelUnitVisual')
    expect(session).toContain('new ModelAssetCache')
    expect(session).not.toContain('AnimationMixer')
  })

  it('lists all runtime roles and motions, including gameplay ally falls', () => {
    expect(viewerRoles()).toHaveLength(23)
    for (const role of viewerRoles()) {
      expect(viewerRoleLabel(role)).toBeTruthy()
      expect(viewerMotions(UNIT_MODEL_CATALOG[role]!)).toContain('idle')
      expect(viewerMotions(UNIT_MODEL_CATALOG[role]!)).toContain('walk')
    }
    expect(viewerMotions(UNIT_MODEL_CATALOG.healer!)).toEqual(['idle', 'walk', 'heal', 'death'])
    expect(viewerMotions(UNIT_MODEL_CATALOG.dragon!)).toContain('breath')
    expect(viewerMotions(UNIT_MODEL_CATALOG.slime!)).toContain('death')
    expect(viewerMotions(UNIT_MODEL_CATALOG.tank!)).toContain('death')
  })
  it('pauses, scrubs, loops idle/walk, clamps death and restarts without game simulation', async () => {
    const session = new ModelViewerSession(() => new ModelAssetCache(async () => fixture()))
    session.select('slime', 'idle')
    await ready(session)
    expect(session.paused).toBe(false)
    session.tick(0.1)
    expect(session.seconds).toBeCloseTo(0.1)
    for (let i = 0; i < 15; i++) session.tick(0.1)
    expect(session.seconds).toBeCloseTo(0.6)
    session.pause()
    session.tick(0.1)
    expect(session.seconds).toBeCloseTo(0.6)
    session.seek(0.75)
    expect(session.diagnostics().actor?.seconds).toBeCloseTo(0.75)
    session.seek(Number.NaN)
    expect(session.seconds).toBe(0.75)
    session.select('slime', 'death')
    await ready(session)
    session.speed = 2
    for (let i = 0; i < 10; i++) session.tick(0.1)
    expect(session.seconds).toBe(1)
    expect(session.paused).toBe(true)
    session.toggle()
    expect(session.seconds).toBe(0)
    expect(session.paused).toBe(false)
    session.dispose()
    session.dispose()
    session.tick(1)
    session.select('slime', 'idle')
    expect(session.root.children).toHaveLength(0)
    expect(session.state).toBe('disposed')
  })
  it('loops attacks beyond multiple clip durations', async () => {
    const session = new ModelViewerSession(() => new ModelAssetCache(async () => fixture()))
    session.select('slime', 'attack')
    await ready(session)
    for (let i = 0; i < 26; i++) session.tick(0.1)
    expect(session.seconds).toBeCloseTo(0.6)
    expect(session.paused).toBe(false)
    expect(session.diagnostics().actor?.motion).toBe('attack')
    session.dispose()
  })
  it('releases each selected actor/cache and rejects missing actions without fallbacks', async () => {
    const caches: ModelAssetCache[] = []
    const session = new ModelViewerSession(() => {
      const cache = new ModelAssetCache(async () => fixture())
      vi.spyOn(cache, 'dispose')
      caches.push(cache)
      return cache
    })
    for (const motion of ['idle', 'walk', 'attack', 'death', 'idle'] as ModelMotion[]) {
      session.select('slime', motion)
      await ready(session)
      expect(session.root.children).toHaveLength(1)
      expect(session.diagnostics().cache?.entries.reduce((sum, e) => sum + e.references, 0)).toBe(1)
    }
    session.select('goblin', 'death')
    expect(session.state).toBe('error')
    expect(session.root.children).toHaveLength(0)
    expect(session.error).toContain('ありません')
    for (const cache of caches) {
      expect(cache.dispose).toHaveBeenCalledTimes(1)
      expect(cache.diagnostics().entries).toEqual([])
    }
    session.dispose()
  })
  it('starts each selection and advances the actual animated pose after switches', async () => {
    const session = new ModelViewerSession(
      () =>
        new ModelAssetCache(
          async () => fixture(),
          undefined,
          undefined,
          async () => THREE.AnimationClip.toJSON(fixture().animations[2])
        )
    )
    for (const [role, motion] of [
      ['slime', 'idle'],
      ['slime', 'walk'],
      ['crystalSentinel', 'attack'],
      ['slime', 'idle']
    ] as const) {
      session.select(role, motion)
      await ready(session)
      expect(session.paused).toBe(false)
      const scene = session.root.getObjectByProperty('type', 'Mesh')!.parent!
      const before = scene.position.x
      session.tick(0.1)
      expect(scene.position.x).not.toBeCloseTo(before)
      session.pause()
      const paused = scene.position.x
      session.tick(0.1)
      expect(scene.position.x).toBeCloseTo(paused)
    }
    session.dispose()
  })
  it('reports load and absent-clip failures and retries with a fresh cache', async () => {
    let fails = true
    const session = new ModelViewerSession(
      () =>
        new ModelAssetCache(async () => {
          if (fails) throw new Error('network failure')
          return fixture()
        })
    )
    session.select('slime', 'idle')
    await new Promise((resolve) => setTimeout(resolve, 0))
    session.tick(0)
    expect(session.state).toBe('error')
    expect(session.error).toContain('Retry')
    fails = false
    session.select('slime', 'idle')
    await ready(session)
    session.dispose()
    const absent = new ModelViewerSession(
      () =>
        new ModelAssetCache(async () => {
          const data = fixture()
          data.animations = data.animations.filter((clip) => clip.name !== 'idle')
          return data
        })
    )
    absent.select('slime', 'idle')
    await new Promise((resolve) => setTimeout(resolve, 0))
    absent.tick(0)
    expect(absent.state).toBe('error')
    expect(absent.error).toContain('Missing authored')
    absent.dispose()
  })
  it('ignores a superseded late GLB and cleans pending loads on exit', async () => {
    const pending: ((data: GLTF) => void)[] = []
    const session = new ModelViewerSession(
      () => new ModelAssetCache(() => new Promise((resolve) => pending.push(resolve)))
    )
    session.select('slime', 'idle')
    session.select('slime', 'walk')
    const old = fixture()
    const dispose = vi.spyOn((old.scene.children[0] as THREE.Mesh).geometry, 'dispose')
    pending[0](old)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(session.motion).toBe('walk')
    expect(session.state).toBe('loading')
    session.dispose()
    const last = fixture()
    const disposeLast = vi.spyOn((last.scene.children[0] as THREE.Mesh).geometry, 'dispose')
    pending[1](last)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(disposeLast).toHaveBeenCalledTimes(1)
    expect(session.state).toBe('disposed')
  })
  it('reuses one loaded cache but rebuilds the actor and resets playback for valid same-role selections', async () => {
    const load = vi.fn(async () => fixture())
    const cache = new ModelAssetCache(load)
    const dispose = vi.spyOn(cache, 'dispose')
    const createCache = vi.fn(() => cache)
    const session = new ModelViewerSession(createCache)
    session.speed = 2
    let previousRoot: THREE.Object3D | undefined
    for (const motion of ['idle', 'walk', 'attack', 'death', 'idle', 'walk'] as const) {
      session.select('slime', motion)
      expect(session.seconds).toBe(0)
      expect(session.duration).toBe(0)
      expect(session.paused).toBe(false)
      expect(session.speed).toBe(2)
      expect(session.root.children).toHaveLength(1)
      expect(session.root.children[0]).not.toBe(previousRoot)
      if (previousRoot) {
        expect(previousRoot.parent).toBeNull()
        expect(previousRoot.visible).toBe(false)
      }
      previousRoot = session.root.children[0]
      await ready(session)
      expect(session.duration).toBe(1)
      expect(session.diagnostics().actor?.seconds).toBe(0)
      expect(session.diagnostics().actor?.rigs).toBe(1)
      expect(cache.diagnostics().entries.reduce((sum, entry) => sum + entry.references, 0)).toBe(1)
      const scene = session.root.getObjectByProperty('type', 'Mesh')!.parent!
      expect(scene.position.x).toBe(0)
      session.seek(0.6)
      expect(scene.position.x).toBeCloseTo(0.6)
    }
    expect(createCache).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)
    expect(dispose).not.toHaveBeenCalled()
    session.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(cache.diagnostics().entries).toEqual([])
    expect(session.root.children).toHaveLength(0)
  })
  it.each([
    ['slime', 'heal'],
    ['crystalSentinel', 'idle'],
    ['missing-role', 'idle']
  ] as const)('discards the ready cache when selecting %s/%s', async (role, motion) => {
    const caches: ModelAssetCache[] = []
    const session = new ModelViewerSession(() => {
      const cache = new ModelAssetCache(async () => fixture())
      vi.spyOn(cache, 'dispose')
      caches.push(cache)
      return cache
    })
    session.select('slime', 'idle')
    await ready(session)
    session.select(role as UnitType, motion)
    expect(caches[0].dispose).toHaveBeenCalledTimes(1)
    expect(caches[0].diagnostics().entries).toEqual([])
    if (role === 'crystalSentinel') {
      await ready(session)
      expect(caches).toHaveLength(2)
      expect(session.root.children).toHaveLength(1)
      expect(session.diagnostics().cache?.entries.reduce((sum, entry) => sum + entry.references, 0)).toBe(1)
    } else {
      expect(session.state).toBe('error')
      expect(session.error).toBe('この動作の3Dモデルはありません。')
      expect(session.diagnostics().cache).toBeUndefined()
      expect(session.root.children).toHaveLength(0)
      expect(caches).toHaveLength(1)
    }
    session.dispose()
    for (const cache of caches) expect(cache.dispose).toHaveBeenCalledTimes(1)
  })
  it('creates fresh caches for same-role loading reselection and error retry', async () => {
    const load = vi
      .fn<() => Promise<GLTF>>()
      .mockResolvedValueOnce(fixture())
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce(fixture())
    const caches: ModelAssetCache[] = []
    const session = new ModelViewerSession(() => {
      const cache = new ModelAssetCache(load)
      vi.spyOn(cache, 'dispose')
      caches.push(cache)
      return cache
    })
    session.select('slime', 'idle')
    expect(session.state).toBe('loading')
    session.select('slime', 'walk')
    expect(caches).toHaveLength(2)
    expect(caches[0].dispose).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    session.tick(0)
    expect(session.state).toBe('error')
    expect(session.error).toBe('3Dモデルを読み込めませんでした。Retry で再試行できます。')
    session.select('slime', 'idle')
    expect(caches).toHaveLength(3)
    expect(caches[1].dispose).toHaveBeenCalledTimes(1)
    await ready(session)
    expect(session.error).toBe('')
    expect(session.root.children).toHaveLength(1)
    expect(session.diagnostics().cache?.entries.reduce((sum, entry) => sum + entry.references, 0)).toBe(1)
    session.dispose()
    for (const cache of caches) {
      expect(cache.dispose).toHaveBeenCalledTimes(1)
      expect(cache.diagnostics().entries).toEqual([])
    }
  })
  for (const role of viewerRoles()) {
    it(`${role}: every available action uses the shipped runtime GLB and gameplay adapters (CPU)`, async () => {
      const loader = new GLTFLoader()
      loader.register(() => ({
        name: 'CPU_TEST_NO_TEXTURE_IO',
        loadTexture: () => Promise.resolve(new THREE.Texture())
      }))
      const session = new ModelViewerSession(
        () =>
          new ModelAssetCache(
            async (url) => {
              const path = resolve('public/tower-defense-art/models', url.split('/models/')[1])
              const bytes = readFileSync(path)
              return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
            },
            undefined,
            undefined,
            async (url) =>
              JSON.parse(readFileSync(resolve('public', url.split('/moq-games/').at(-1)!.replace(/^\//, '')), 'utf8'))
          )
      )
      try {
        for (const motion of viewerMotions(UNIT_MODEL_CATALOG[role]!)) {
          session.select(role, motion)
          await ready(session)
          expect(session.duration).toBeGreaterThan(0)
          for (const fraction of [0, 0.25, 0.5, 0.99]) {
            session.seek(session.duration * fraction)
            const actor = session.diagnostics().actor!
            expect(actor.renderer).toBe('gltf-mesh')
            expect(actor.motion).toBe(motion)
            expect(actor.visible).toBe(true)
            expect(actor.meshes).toBeGreaterThan(0)
            expect(actor.triangles).toBeGreaterThan(0)
            expect(actor.seconds).toBeCloseTo(
              session.seconds * (motion === 'attack' ? (UNIT_MODEL_CATALOG[role]!.attackTimeScale ?? 1) : 1)
            )
            const bounds = new THREE.Box3().setFromObject(session.root)
            expect(bounds.isEmpty()).toBe(false)
            expect(bounds.min.toArray().every(Number.isFinite)).toBe(true)
          }
          session.seek(session.duration * 0.99)
          session.toggle()
          session.tick(0.1)
          if (motion === 'death') {
            expect(session.paused).toBe(true)
            expect(session.seconds).toBe(session.duration)
          } else {
            expect(session.paused).toBe(false)
            expect(session.seconds).toBeLessThan(session.duration * 0.99)
          }
        }
      } finally {
        session.dispose()
      }
    }, 60_000)
  }
})
