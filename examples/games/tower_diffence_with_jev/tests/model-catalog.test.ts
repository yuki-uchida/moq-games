import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ModelAssetCache } from '../src/rendering/ModelAssetCache'
import { UNIT_MODEL_CATALOG } from '../src/rendering/models/catalog'
import provenance from '../src/rendering/models/asset-provenance.json'

const assetRoot = resolve('public/tower-defense-art/models')
const hasModels = existsSync(resolve(assetRoot, 'tank/tank-idle-candidate.glb'))

it('keeps missing models and special motions explicit', () => {
  expect(UNIT_MODEL_CATALOG.runner).toBeUndefined()
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
describe.skipIf(!hasModels)('materialized real GLB adapter contracts (CPU, not WebGL)', () => {
  it('preserves every staged candidate GLB byte-for-byte', () => {
    for (const asset of provenance) {
      expect(createHash('sha256').update(readFileSync(resolve(assetRoot, asset.role, asset.file))).digest('hex')).toBe(asset.sha256)
    }
  })
  for (const [role, definition] of Object.entries(UNIT_MODEL_CATALOG)) {
    if (role === 'slime') continue // Separate authored-morph test covers this source.
    it(`${role}: isolated skeleton/material ownership, source shader hooks, every motion and reverse cleanup`, async () => {
      const loader = new GLTFLoader()
      loader.register(() => ({ name: 'CPU_TEST_NO_TEXTURE_IO', loadTexture: () => Promise.resolve(new THREE.Texture()) }))
      const load = async (url: string): Promise<GLTF> => {
        const local = resolve(assetRoot, url.split('models/')[1])
        const bytes = readFileSync(local)
        return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
      }
      const cache = new ModelAssetCache(load, 1024 * 1024 * 512)
      try {
        for (const spec of Object.values(definition.clips)) {
          cache.request(spec.url)
          while (cache.request(spec.url) === 'loading' || cache.request(spec.url) === 'queued') await new Promise(resolve => setTimeout(resolve, 0))
          expect(cache.error(spec.url)).toBeUndefined()
          const lease = cache.acquire(spec)!
          const peer = cache.acquire(spec)!
          const group = new THREE.Group()
          group.scale.setScalar(35)
          group.rotation.set(.15, .7, .05)
          group.position.set(200, 175, 7)
          group.add(lease.scene)
          const mixer = new THREE.AnimationMixer(lease.scene)
          mixer.clipAction(lease.clip).setLoop(THREE.LoopOnce, 1).play()
          for (const seconds of [0, .123, lease.clip.duration / 2, lease.clip.duration - .001]) {
            mixer.setTime(seconds)
            lease.scene.updateWorldMatrix(true, true)
            for (const adapter of lease.adapters) adapter.update(seconds)
          }
          let meshes = 0
          lease.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return
            meshes++
            const peerMesh = peer.scene.getObjectByName(object.name) as THREE.Mesh
            expect(object.geometry).toBe(peerMesh.geometry)
            expect(object.material).not.toBe(peerMesh.material)
            if ((role === 'ranger' || role === 'cannon') && spec.clip !== 'idle' && object instanceof THREE.SkinnedMesh) {
              const original = object.geometry.getAttribute(`_${role}weights0`)
              const extra = object.geometry.getAttribute(`_${role}weights1`)
              expect(original).toBeDefined()
              expect(extra).toBeDefined()
              let fifthInfluences = 0
              for (let vertex = 0; vertex < original.count; vertex++) {
                const raw = [original.getX(vertex), original.getY(vertex), original.getZ(vertex), original.getW(vertex), extra.getX(vertex), extra.getY(vertex), extra.getZ(vertex), extra.getW(vertex)]
                expect(raw.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5)
                if (raw.filter(weight => weight > 0).length > 4) fifthInfluences++
              }
              expect(fifthInfluences).toBeGreaterThan(0)
            }
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms) }
              expect(() => material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)).not.toThrow()
              expect(shader.vertexShader).not.toContain('undefined')
              expect(shader.fragmentShader).not.toContain('undefined')
            }
          })
          expect(meshes).toBeGreaterThan(0)
          mixer.stopAllAction()
          mixer.uncacheRoot(lease.scene)
          peer.release()
          lease.release()
          lease.release()
        }
        expect(cache.diagnostics().entries.every(entry => entry.references === 0)).toBe(true)
      } finally { cache.dispose() }
    })
  }
})
