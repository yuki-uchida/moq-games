import { expect, it } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ModelAssetCache } from '../examples/games/tower_diffence_with_jev/src/rendering/ModelAssetCache'
import {
  ModelUnitVisual,
  type ModelMotion
} from '../examples/games/tower_diffence_with_jev/src/rendering/ModelUnitVisual'
import { UNIT_MODEL_CATALOG } from '../examples/games/tower_diffence_with_jev/src/rendering/models/catalog'
import {
  configureBoardCamera,
  createBoardCamera,
  MODEL_DEPTH_RADIUS,
  MODEL_BOSS_SCALE,
  modelGroundDepth
} from '../examples/games/tower_diffence_with_jev/src/rendering/BoardCamera'
import {
  ENEMY_TYPES,
  FIELDS,
  getField,
  stageRules,
  DEFINITIONS
} from '../examples/games/tower_diffence_with_jev/src/game/model'
import { attackContact } from '../examples/games/tower_diffence_with_jev/src/game/CombatContact'
import { GAME_MODEL_PRESENTATION_SCALE } from '../examples/games/tower_diffence_with_jev/src/rendering/BattlefieldPresentation'

const fields = Object.keys(FIELDS).flatMap((id) => [
  getField(id as keyof typeof FIELDS, 1, 1),
  getField(id as keyof typeof FIELDS, 2, 1),
  getField(id as keyof typeof FIELDS, 2, 2),
  getField(id as keyof typeof FIELDS, 2, 3),
  getField(id as keyof typeof FIELDS, 2, 4)
])

it('updates field-derived depth while preserving the board XY projection on all retained layouts', () => {
  const camera = createBoardCamera(fields[0])
  for (const field of fields) {
    configureBoardCamera(camera, field)
    camera.updateMatrixWorld()
    const previous = new THREE.OrthographicCamera(0, field.width, 0, field.height, -200, 200)
    previous.updateMatrixWorld()
    for (const y of [0, field.height]) {
      const position = new THREE.Vector3(field.width / 2, y, 0)
      const old = position.clone().project(previous)
      const projected = position.clone().project(camera)
      expect(projected.x).toBe(old.x)
      expect(projected.y).toBe(old.y)
      for (const z of [
        modelGroundDepth(y) - MODEL_DEPTH_RADIUS * MODEL_BOSS_SCALE * GAME_MODEL_PRESENTATION_SCALE,
        modelGroundDepth(y) + MODEL_DEPTH_RADIUS * MODEL_BOSS_SCALE * GAME_MODEL_PRESENTATION_SCALE
      ]) {
        const depth = new THREE.Vector3(0, 0, z).project(camera).z
        expect(depth).toBeGreaterThanOrEqual(-1 - 1e-12)
        expect(depth).toBeLessThanOrEqual(1 + 1e-12)
      }
    }
  }
})

// Mandatory public assets, never skip when private source archives are absent.
// Texture I/O is stubbed. Nine times are sampled CPU coverage, not a proof
// of every animation extremum or custom DQ/extra-influence shader deformation.
// GPU/pixel acceptance remains a separate browser check.
it('contains every runtime roster motion at role-appropriate scale on legacy and compact fields', async () => {
  const loader = new GLTFLoader()
  loader.register(() => ({ name: 'CPU_NO_TEXTURE_IO', loadTexture: () => Promise.resolve(new THREE.Texture()) }))
  const cache = new ModelAssetCache(
    async (url) => {
      const bytes = readFileSync('public/tower-defense-art/models/' + url.split('/models/')[1])
      return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    },
    512 * 1024 * 1024,
    2,
    async (url) =>
      JSON.parse(readFileSync('public/tower-defense-art/effects/special/motions/' + url.split('/').at(-1), 'utf8'))
  )
  const point = new THREE.Vector3()
  try {
    for (const [role, definition] of Object.entries(UNIT_MODEL_CATALOG)) {
      const visual = new ModelUnitVisual(definition, cache)
      visual.setPresentation(GAME_MODEL_PRESENTATION_SCALE, 1.4)
      const scene = new THREE.Scene()
      scene.add(visual.root)
      const boss = (ENEMY_TYPES as readonly string[]).includes(role)
      const scale = boss ? MODEL_BOSS_SCALE : 1
      try {
        for (const [motion, spec] of Object.entries(definition.clips)) {
          cache.requestSource(spec)
          while (['queued', 'loading'].includes(cache.requestSource(spec)))
            await new Promise((resolve) => setTimeout(resolve, 0))
          expect(cache.error(spec.url), `${role}/${motion} public asset`).toBeUndefined()
          for (const cycle of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
            // Normalized clock covers the full authored motion, including its endpoint.
            visual.setPosition(0, 0)
            expect(
              visual.sample({
                motion: motion as ModelMotion,
                seconds: 0,
                cycle,
                loop: false,
                facingX: 0,
                facingY: 1,
                boss
              })
            ).toBe(true)
            scene.updateMatrixWorld(true)
            scene.traverse((object) => {
              if (object instanceof THREE.SkinnedMesh) object.skeleton.update()
            })
            let radius = 0,
              minZ = Infinity,
              maxZ = -Infinity,
              vertices = 0
            scene.traverseVisible((object) => {
              if (!(object instanceof THREE.Mesh)) return
              for (let i = 0; i < object.geometry.attributes.position.count; i++) {
                object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld)
                minZ = Math.min(minZ, point.z - modelGroundDepth(0))
                maxZ = Math.max(maxZ, point.z - modelGroundDepth(0))
                point.z -= modelGroundDepth(0)
                radius = Math.max(radius, point.length() / (scale * GAME_MODEL_PRESENTATION_SCALE))
                vertices++
              }
            })
            expect(vertices).toBeGreaterThan(0)
            // Rotation/board tilt preserve radius, so this also bounds every facing.
            expect(radius, `${role}/${motion}@${cycle} pivot envelope`).toBeLessThan(MODEL_DEPTH_RADIUS)
            for (const field of fields) {
              const camera = createBoardCamera(field)
              camera.updateMatrixWorld()
              for (const y of [0, field.height])
                for (const z of [minZ, maxZ]) {
                  const depth = point.set(0, y, modelGroundDepth(y) + z).project(camera).z
                  expect(
                    Math.abs(depth),
                    `${role}/${motion}@${cycle}, ${field.id}/${field.layoutRevision}, y=${y}`
                  ).toBeLessThan(1)
                }
            }
          }
        }
      } finally {
        visual.dispose()
      }
    }
    // Exact formerly clipped legal Wolf contact, not just normalized motion samples.
    expect(stageRules(5).bossType).toBe('wolf')
    expect(
      attackContact({ x: 640, y: 1300, owner: 'ai', type: 'wolf' }, { x: 640, y: 1340 }, DEFINITIONS.wolf.range, 'base')
        .inRange
    ).toBe(true)
    const visual = new ModelUnitVisual(UNIT_MODEL_CATALOG.wolf!, cache)
    try {
      const scene = new THREE.Scene()
      scene.add(visual.root)
      visual.setPosition(640, 1300)
      expect(visual.sample({ motion: 'attack', seconds: 0.3, loop: false, facingX: 0, facingY: 1, boss: true })).toBe(
        true
      )
      scene.updateMatrixWorld(true)
      const camera = createBoardCamera(getField('meadow', 2, 2))
      camera.updateMatrixWorld()
      let maximum = -Infinity
      visual.root.traverseVisible((object) => {
        if (!(object instanceof THREE.Mesh)) return
        if (object instanceof THREE.SkinnedMesh) object.skeleton.update()
        for (let i = 0; i < object.geometry.attributes.position.count; i++) {
          object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld)
          maximum = Math.max(maximum, point.z)
          expect(Math.abs(point.project(camera).z)).toBeLessThan(1)
        }
      })
      expect(maximum).toBeGreaterThan(200)
    } finally {
      visual.dispose()
    }
  } finally {
    cache.dispose()
  }
}, 180_000)
