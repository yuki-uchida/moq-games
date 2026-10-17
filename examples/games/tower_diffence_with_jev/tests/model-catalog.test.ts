import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { ModelUnitVisual, type ModelMotion, type ModelPose } from '../src/rendering/ModelUnitVisual'
import { ATTACK_PROFILES } from '../src/game/AttackProfiles'
import type { UnitType } from '../src/game/model'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import provenance from '../src/rendering/models/asset-provenance.json'

const originalRoot = existsSync(resolve('local-assets/models-source/tank/tank-idle-candidate.glb'))
  ? resolve('local-assets/models-source')
  : resolve('public/tower-defense-art/models')
const assetRoot = resolve(process.env.TOWER_MODEL_ASSET_ROOT ?? originalRoot)
const derivativeMode = assetRoot !== originalRoot || existsSync(resolve(assetRoot, 'runtime-manifest.json'))
const selectedRoles = new Set(
  process.env.TOWER_MODEL_ROLES?.split(',').filter(Boolean) ?? Object.keys(UNIT_MODEL_CATALOG)
)
const fixtures = Object.entries(UNIT_MODEL_CATALOG).filter(([role]) => selectedRoles.has(role))
const assetPath = (url: string) => resolve(assetRoot, url.split(/models(?:-optimized)?\//)[1])
const hasModels = existsSync(resolve(assetRoot, 'tank/tank-idle-candidate.glb'))

it('keeps all twenty-three animated models and special motions explicit', () => {
  expect(Object.keys(UNIT_MODEL_CATALOG)).toHaveLength(23)
  expect(UNIT_MODEL_CATALOG.runner?.clips.attack?.clip).toBe('attack')
  expect(UNIT_MODEL_CATALOG.runner?.attackTimeScale).toBeCloseTo(640 / 480)
  expect(UNIT_MODEL_CATALOG.healer?.clips.heal?.clip).toBe('heal')
  expect(UNIT_MODEL_CATALOG.healer?.clips.attack).toBeUndefined()
  expect(UNIT_MODEL_CATALOG.paladin?.clips.heal).toBeUndefined()
  expect(UNIT_MODEL_CATALOG.dragon?.clips.breath?.clip).toBe('breath')
  expect(UNIT_MODEL_CATALOG.slime?.clips.death?.clip).toBe('death')
  expect(UNIT_MODEL_CATALOG.tank?.clips.death).toBeUndefined()
  expect(UNIT_MODEL_CATALOG.ranger?.clips.idle?.url).not.toBe(UNIT_MODEL_CATALOG.ranger?.clips.walk?.url)
  expect(UNIT_MODEL_CATALOG.cannon?.clips.attack?.adapters).toHaveLength(1)
  expect(UNIT_MODEL_CATALOG.ranger?.clips.walk?.adapters).toHaveLength(2)
})

// Local originals are intentionally not committed. CI without the large source
// files still runs the contract tests above; this suite clearly reports skips.
// Texture I/O is stubbed here, so this does NOT establish WebGL/GPU acceptance.
describe.skipIf(!hasModels && !derivativeMode)(
  `materialized ${derivativeMode ? 'optimized' : 'original'} GLB adapter contracts (CPU, not WebGL)`,
  () => {
    it('verifies the selected original or derivative audit hashes and preservation contract', () => {
      const auditPath = resolve(process.env.TOWER_MODEL_AUDIT ?? 'local-assets/runtime-model-optimization.json')
      const audit = derivativeMode && existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, 'utf8')) : undefined
      const publicManifest =
        derivativeMode && !audit
          ? JSON.parse(readFileSync(resolve(assetRoot, 'runtime-manifest.json'), 'utf8'))
          : undefined
      for (const asset of provenance.filter((asset) => selectedRoles.has(asset.role))) {
        const actual = createHash('sha256')
          .update(readFileSync(resolve(assetRoot, asset.role, asset.file)))
          .digest('hex')
        if (!derivativeMode) {
          expect(actual).toBe(asset.sha256)
          continue
        }
        const record =
          audit?.assets.find(
            (entry: { role: string; file: string }) => entry.role === asset.role && entry.file === asset.file
          ) ??
          publicManifest?.models.find(
            (entry: { role: string; file: string }) =>
              entry.role === asset.role && entry.file === `${asset.role}/${asset.file}`
          )
        expect(record, `${asset.role}/${asset.file} derivative audit missing`).toBeDefined()
        expect(record.sourceSha256).toBe(asset.sha256)
        expect(actual).toBe(record.outputSha256)
        if (record.validation) {
          expect(record.validation.retainedVertexMaximumAbsoluteError).toBe(0)
          expect(record.validation.exactAnimationSamplers).toBeGreaterThan(0)
          expect(record.validation.exactNodesMaterialsSkinsAndExtras).toBe(true)
        } else {
          // Distributed runtimes carry public byte hashes. Exhaustive original-to-LOD
          // preservation is tested separately where the private source archive exists.
          expect(record.bytes).toBe(readFileSync(resolve(assetRoot, asset.role, asset.file)).byteLength)
          expect(record.triangles).toBeGreaterThan(0)
        }
      }
    })
    for (const [role, definition] of fixtures) {
      it(`${role}: isolated skeleton/material ownership, source shader hooks, every motion and reverse cleanup`, async () => {
        const loader = new GLTFLoader()
        loader.register(() => ({
          name: 'CPU_TEST_NO_TEXTURE_IO',
          loadTexture: () => Promise.resolve(new THREE.Texture())
        }))
        const load = async (url: string): Promise<GLTF> => {
          const local = assetPath(url)
          const bytes = readFileSync(local)
          return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
        }
        const cache = new ModelAssetCache(load, 1024 * 1024 * 512)
        try {
          for (const spec of Object.values(definition.clips)) {
            cache.request(spec.url)
            while (cache.request(spec.url) === 'loading' || cache.request(spec.url) === 'queued')
              await new Promise((resolve) => setTimeout(resolve, 0))
            expect(cache.error(spec.url)).toBeUndefined()
            const lease = cache.acquire(spec)!
            const peer = cache.acquire(spec)!
            const group = new THREE.Group()
            group.scale.set(35, -35, 35) // Includes the board projection reflection; DQ palettes stay local rigid transforms.
            group.rotation.set(0.15, 0.7, 0.05)
            group.position.set(200, 175, 7)
            group.add(lease.scene)
            const mixer = new THREE.AnimationMixer(lease.scene)
            mixer.clipAction(lease.clip).setLoop(THREE.LoopOnce, 1).play()
            for (const seconds of [0, 0.123, lease.clip.duration / 2, lease.clip.duration - 0.001]) {
              mixer.setTime(seconds)
              lease.scene.updateWorldMatrix(true, true)
              for (const adapter of lease.adapters) adapter.update(seconds)
            }
            let meshes = 0,
              totalFifthInfluences = 0
            lease.scene.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return
              meshes++
              const peerMesh = peer.scene.getObjectByName(object.name) as THREE.Mesh
              expect(object.geometry).toBe(peerMesh.geometry)
              expect(object.material).not.toBe(peerMesh.material)
              if (object instanceof THREE.SkinnedMesh) {
                expect(object.skeleton).not.toBe((peerMesh as THREE.SkinnedMesh).skeleton)
                expect(object.skeleton.bones[0]).not.toBe((peerMesh as THREE.SkinnedMesh).skeleton.bones[0])
              }
              if (
                (role === 'ranger' || role === 'cannon') &&
                spec.clip !== 'idle' &&
                object instanceof THREE.SkinnedMesh &&
                object.geometry.hasAttribute(`_${role}weights0`)
              ) {
                const original = object.geometry.getAttribute(`_${role}weights0`)
                const extra = object.geometry.getAttribute(`_${role}weights1`)
                expect(original).toBeDefined()
                expect(extra).toBeDefined()
                let fifthInfluences = 0
                for (let vertex = 0; vertex < original.count; vertex++) {
                  const raw = [
                    original.getX(vertex),
                    original.getY(vertex),
                    original.getZ(vertex),
                    original.getW(vertex),
                    extra.getX(vertex),
                    extra.getY(vertex),
                    extra.getZ(vertex),
                    extra.getW(vertex)
                  ]
                  expect(raw.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5)
                  if (raw.filter((weight) => weight > 0).length > 4) fifthInfluences++
                }
                totalFifthInfluences += fifthInfluences
              }
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                const shader = {
                  vertexShader: THREE.ShaderLib.standard.vertexShader,
                  fragmentShader: THREE.ShaderLib.standard.fragmentShader,
                  uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)
                }
                expect(() => material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)).not.toThrow()
                expect(shader.vertexShader).not.toContain('undefined')
                expect(shader.fragmentShader).not.toContain('undefined')
              }
            })
            expect(meshes).toBeGreaterThan(0)
            if ((role === 'ranger' || role === 'cannon') && spec.clip !== 'idle')
              expect(totalFifthInfluences).toBeGreaterThan(0)
            mixer.stopAllAction()
            mixer.uncacheRoot(lease.scene)
            peer.release()
            lease.release()
            lease.release()
          }
          // Exercise the actual actor class, including board reflection, pivot,
          // boss scaling, source clocks, root switching, and restored emitter samples.
          const visual = new ModelUnitVisual(definition, cache)
          try {
            visual.setPosition(211.5, 375.25)
            expect(visual.root.matrix.determinant()).toBeCloseTo(-1, 8)
            for (const motion of Object.keys(definition.clips) as ModelMotion[]) {
              expect(
                visual.sample({
                  motion,
                  seconds: 0.19,
                  loop: motion === 'idle' || motion === 'walk',
                  facingX: 1,
                  facingY: 1,
                  boss: true
                })
              ).toBe(true)
              expect(visual.diagnostics().meshes).toBeGreaterThan(0)
              expect(Number.isFinite(visual.diagnostics().seconds)).toBe(true)
            }
            // The board camera compresses native ground depth; solve yaw so
            // projected native +Z really points along the game's screen-space aim.
            for (const [facingX, facingY] of [
              [1, 1],
              [-1, 1],
              [0.7, -0.2]
            ]) {
              visual.sample({ motion: 'idle', seconds: 0.19, loop: true, facingX, facingY, boss: false })
              const normalized = visual.root.children[0].children[0]
              const origin = normalized.localToWorld(new THREE.Vector3(...definition.origin))
              const heading = normalized
                .localToWorld(new THREE.Vector3(...definition.origin).add(new THREE.Vector3(0, 0, 1)))
                .sub(origin)
              const cross = heading.x * facingY - heading.y * facingX
              expect(cross / Math.hypot(heading.x, heading.y), `${role} projected ground heading`).toBeCloseTo(0, 10)
              expect(heading.x * facingX + heading.y * facingY).toBeGreaterThan(0)
            }
            if (definition.emitter) {
              const motion = role === 'healer' ? 'heal' : 'attack'
              const seconds = role === 'healer' ? 0.6 : ATTACK_PROFILES[role as UnitType].cueMs / 1000
              const spec = definition.clips[motion]!
              const reference = cache.acquire(spec)!
              const mixer = new THREE.AnimationMixer(reference.scene)
              mixer.clipAction(reference.clip).setLoop(THREE.LoopOnce, 1).play()
              mixer.setTime(seconds * (motion === 'attack' ? (definition.attackTimeScale ?? 1) : 1))
              reference.scene.updateWorldMatrix(true, true)
              for (const adapter of reference.adapters) adapter.update(seconds)
              const node =
                reference.scene.getObjectByName(definition.emitter.node) ??
                reference.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(definition.emitter.node))
              expect(node, `${role} documented emitter node`).toBeDefined()
              const nativePoint = node!.localToWorld(new THREE.Vector3(...(definition.emitter.local ?? [0, 0, 0])))
              const previous: ModelPose = {
                motion: 'idle',
                seconds: 0.19,
                loop: true,
                facingX: 0,
                facingY: 1,
                boss: false
              }
              visual.sample(previous)
              for (const [facingX, facingY, boss] of [
                [0, 1, false],
                [1, 0, false],
                [-1, -1, true]
              ] as const) {
                const pose: ModelPose = { motion, seconds, loop: false, facingX, facingY, boss }
                const point = visual.emitterAt(pose)
                expect(point, `${role} real actor emitter`).toBeDefined()
                const tilt = definition.viewElevation ?? Math.atan2(2, 5)
                const local = nativePoint
                  .clone()
                  .sub(new THREE.Vector3(...definition.origin))
                  .multiplyScalar(definition.scale)
                  .applyAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    Math.atan2(facingX * Math.sin(tilt), facingY) + definition.yaw
                  )
                  .multiplyScalar(boss ? 1.35 : 1)
                const expected = new THREE.Vector3(
                  211.5 + local.x,
                  375.25 - Math.cos(tilt) * local.y + Math.sin(tilt) * local.z,
                  375.25 / 10 + 4 + Math.sin(tilt) * local.y + Math.cos(tilt) * local.z
                )
                expect(point!.distanceTo(expected), `${role} emitter source-to-board projection`).toBeLessThan(1e-5)
                expect(visual.diagnostics().motion).toBe('idle')
                expect(visual.diagnostics().seconds).toBeCloseTo(0.19, 12)
              }
              mixer.stopAllAction()
              mixer.uncacheRoot(reference.scene)
              reference.release()
            }
          } finally {
            visual.dispose()
          }
          expect(cache.diagnostics().entries.every((entry) => entry.references === 0)).toBe(true)
        } finally {
          cache.dispose()
        }
      })
    }
  }
)
