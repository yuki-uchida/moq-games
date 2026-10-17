import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import provenance from '../src/rendering/models/asset-provenance.json'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { ModelUnitLayer } from '../src/rendering/ModelUnitLayer'
import type { GameState, Unit } from '../src/game/model'
import { ModelUnitVisual } from '../src/rendering/ModelUnitVisual'
import { createBoardCamera, MODEL_DEPTH_RADIUS, modelGroundDepth } from '../src/rendering/BoardCamera'
import { GAME_MODEL_PRESENTATION_SCALE } from '../src/rendering/BattlefieldPresentation'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'
import { authoredRole, authoredPortrait } from '../src/rendering/AuthoredRoster'
import { expressiveMotion } from '../src/rendering/ExpressiveMotion'
import { viewerRoles } from '../src/ui/ModelViewerSession'

const expected = {
  crystalSentinel: {
    file: 'crystal-sentinel.glb',
    sha: '5570f1e1bce2e5ba5cb944da337313d280f757e2444f8a7adaf53b6b461ffda7',
    scale: 40,
    walkDistance: 24,
    idle: 3,
    walk: 1.6,
    attack: 1.5,
    cue: 0.8666666667
  },
  koboldLancer: {
    file: 'amber-kobold-lancer.glb',
    sha: '039f26e6c10a2a6ed15de2524612f805048df83fdefc324bcd9ac0d1a01d7aed',
    scale: 32,
    walkDistance: 32,
    idle: 2,
    walk: 1,
    attack: 1.2,
    cue: 0.6333333333333333
  },
  clockworkPatchling: {
    file: 'clockwork-patchling-animated.glb',
    sha: '7b1a6f0d941d9a44eb4cb4bd15d83d8a8b44f2ffa353d6e8c95b7f1c44b03d98',
    scale: 29,
    walkDistance: 22,
    idle: 2,
    walk: 1,
    attack: 1.2,
    cue: 0.8
  }
} as const

it('discovers all 23 actual model roles while leaving model-only sprite art absent', () => {
  expect(Object.keys(UNIT_MODEL_CATALOG)).toHaveLength(23)
  expect(viewerRoles()).toHaveLength(23)
  for (const role of Object.keys(expected) as (keyof typeof expected)[]) {
    expect(viewerRoles()).toContain(role)
    expect(authoredRole(role)).toBeUndefined()
    expect(authoredPortrait(role, new URL('https://example.test/art/'))).toBe(
      `https://example.test/art/${role}/portrait.png`
    )
    const portrait = readFileSync(`public/tower-defense-art/${role}/portrait.png`)
    expect(createHash('sha256').update(portrait).digest('hex')).toBe(
      provenance.find((entry) => entry.role === role)?.portrait?.sha256
    )
    for (const motion of ['walk', 'attack'] as const)
      expect(expressiveMotion({ type: role, motion, elapsedMs: 200, durationMs: 600 })).toEqual({
        forward: 0,
        lift: 0,
        sway: 0,
        lean: 0,
        scaleX: 1,
        scaleY: 1,
        dust: 0,
        trail: 0
      })
  }
})

for (const role of Object.keys(expected) as (keyof typeof expected)[]) {
  it(`loads source-identical ${role} lazily with real clips, combat timing and bounded board-camera geometry (CPU only)`, async () => {
    const contract = expected[role]
    const definition = UNIT_MODEL_CATALOG[role]!
    expect(definition.scale).toBe(contract.scale)
    expect(definition.origin).toEqual([0, 0, 0])
    expect(definition.yaw).toBe(0)
    expect(definition.walkDistance).toBe(contract.walkDistance)
    expect(Object.keys(definition.clips).sort()).toEqual(['attack', 'idle', 'walk'])
    expect(definition.clips.death).toBeUndefined()
    expect(ATTACK_PROFILES[role].durationMs).toBeCloseTo(contract.attack * 1000)
    expect(ATTACK_PROFILES[role].cueMs).toBeCloseTo(contract.cue * 1000)
    for (const spec of Object.values(definition.clips)) expect(spec.adapters).toEqual([])
    const bytes = readFileSync(`public/tower-defense-art/models/${role}/${contract.file}`)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(contract.sha)
    expect(provenance.find((entry) => entry.role === role)?.sha256).toBe(contract.sha)
    const loader = new GLTFLoader()
    // Geometry, rigs and animation are parsed unchanged; no GPU acceptance claim.
    loader.register(() => ({ name: 'CPU_NO_TEXTURE_IO', loadTexture: () => Promise.resolve(new THREE.Texture()) }))
    let loads = 0
    const cache = new ModelAssetCache(async () => {
      loads++
      const gltf = await loader.parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        ''
      )
      expect(gltf.animations.map((clip) => clip.name).sort()).toEqual(['attack', 'idle', 'walk'])
      for (const clip of gltf.animations)
        expect(clip.duration).toBeCloseTo(contract[clip.name as 'idle' | 'walk' | 'attack'], 5)
      return gltf
    })
    const visual = new ModelUnitVisual(definition, cache)
    const scene = new THREE.Scene()
    scene.add(visual.root)
    expect(loads).toBe(0)
    const url = definition.clips.idle!.url
    cache.request(url)
    while (['queued', 'loading'].includes(cache.request(url))) await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cache.error(url)).toBeUndefined()
    visual.setPresentation(GAME_MODEL_PRESENTATION_SCALE, 1.4)
    const point = new THREE.Vector3()
    try {
      for (const motion of ['idle', 'walk', 'attack'] as const)
        for (const cycle of [0, 0.25, 0.5, 0.75, 1]) {
          visual.setPosition(640, 1440)
          expect(visual.sample({ motion, seconds: 0, cycle, loop: false, facingX: 0, facingY: 1, boss: true })).toBe(
            true
          )
          scene.updateMatrixWorld(true)
          scene.traverse((object) => {
            if (object instanceof THREE.SkinnedMesh) object.skeleton.update()
          })
          const camera = createBoardCamera({ width: 1280, height: 1440 })
          camera.updateMatrixWorld(true)
          let vertices = 0,
            maxDepth = 0,
            radius = 0
          const ground = new THREE.Vector3(640, 1440, modelGroundDepth(1440))
          scene.traverseVisible((object) => {
            if (!(object instanceof THREE.Mesh)) return
            for (let i = 0; i < object.geometry.attributes.position.count; i++) {
              object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld)
              maxDepth = Math.max(maxDepth, Math.abs(point.clone().project(camera).z))
              point.sub(ground)
              radius = Math.max(radius, point.length() / (1.35 * GAME_MODEL_PRESENTATION_SCALE))
              vertices++
            }
          })
          expect(vertices).toBeGreaterThan(0)
          expect(maxDepth).toBeLessThan(1)
          expect(radius).toBeLessThan(MODEL_DEPTH_RADIUS)
        }
      expect(loads).toBe(1)
      // The layer intentionally never asks the visual for an absent death clip.
      const deathScene = new THREE.Scene()
      const layer = new ModelUnitLayer(deathScene, { [role]: definition }, cache)
      const unit = {
        id: 1,
        type: role,
        hp: 10,
        moving: false,
        facingX: 0,
        facingY: 1,
        boss: false,
        x: 640,
        y: 500,
        hitAnimation: 0
      } as Unit
      const state = {
        units: [unit],
        attacks: [],
        corpses: [],
        time: 0,
        stage: 1,
        fieldId: 'meadow',
        phase: 'assault'
      } as unknown as GameState
      try {
        layer.render(state)
        expect(layer.visible(1)).toBe(true)
        unit.hp = 0
        layer.render(state)
        state.time = 0.2
        layer.render(state)
        expect(layer.visible(1)).toBe(true)
        expect(layer.errors).toEqual({})
        state.time = 0.46
        layer.render(state)
        expect(layer.visible(1)).toBe(false)
      } finally {
        layer.dispose()
      }
    } finally {
      visual.dispose()
      cache.dispose()
    }
  }, 120000)
}
