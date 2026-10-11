import { afterEach, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { inspectGlb } from './Actual3DView'
import { applyWolfLidMaterial, validateWolfLid } from './WolfLidMaterial'

const configuredStore = process.env.TOWER_DEBUG_TEST_ASSETS ?? process.env.TOWER_DEBUG_STORE
if (!configuredStore)
  throw new Error('Set TOWER_DEBUG_TEST_ASSETS or TOWER_DEBUG_STORE to the explicit readonly asset fixture')
const store: string = configuredStore
const catalog = JSON.parse(readFileSync(resolve(store, 'catalog.json'), 'utf8'))
const model = catalog.revisions
  .find((revision: { revisionKind: string }) => revision.revisionKind.startsWith('artist-candidate'))
  ?.representations.find((representation: { kind: string }) => representation.kind === 'actual3D')?.model
function bytes(id: string): ArrayBuffer {
  const asset = catalog.assets.find((asset: { assetId: string }) => asset.assetId === id)
  const buffer = readFileSync(resolve(store, 'assets', asset.storageName))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}
afterEach(() => vi.unstubAllGlobals())
it('formal GLB byte structure and required adapter identity validate without rendering', () => {
  // Arrange
  expect(model).toBeTruthy()
  // Act / Assert
  expect(() => inspectGlb(bytes(model.file.assetId))).not.toThrow()
  const adapter = validateWolfLid(JSON.parse(new TextDecoder().decode(bytes(model.adapter.assetId))))
  expect(adapter.tracks.attack.every((key) => key.blink === 0 && key.depthMorph === 0)).toBe(true)
  expect(adapter.tracks.idle.at(-1)?.timeMs).toBe(3000)
})
it('real Three loader resolves rig, clips and fixed shader bindings with explicitly mocked image decoding', async () => {
  // Arrange
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('createImageBitmap', async () => ({
    width: 2048,
    height: 2048,
    close() {}
  }))
  const gltf = await new GLTFLoader().parseAsync(bytes(model.file.assetId), '')
  const adapter = JSON.parse(new TextDecoder().decode(bytes(model.adapter.assetId)))
  // Act
  const lid = applyWolfLidMaterial(gltf.scene, adapter)
  let body!: THREE.SkinnedMesh
  gltf.scene.getObjectByName('Wolf_Original_Body')!.traverse((object) => {
    if (
      object instanceof THREE.SkinnedMesh &&
      (Array.isArray(object.material) ? object.material : [object.material]).some(
        (material) => material.name === 'Wolf_Blink_Surface'
      )
    )
      body = object
  })
  const materials = Array.isArray(body.material) ? body.material : [body.material]
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  }
  materials
    .find((material) => material.name === 'Wolf_Blink_Surface')!
    .onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
  const mixer = new THREE.AnimationMixer(gltf.scene),
    action = mixer.clipAction(gltf.animations.find((clip) => clip.name === 'idle')!)
  action.play()
  mixer.setTime(2.042)
  lid.sample('idle', 2042)
  // Assert
  expect(body.isSkinnedMesh).toBe(true)
  expect(body.skeleton.bones).toHaveLength(19)
  expect(body.geometry.getAttribute('_blink_rest').count).toBe(body.geometry.getAttribute('position').count)
  expect(gltf.animations.map((clip) => [clip.name, clip.duration])).toEqual(
    expect.arrayContaining([
      ['idle', 3],
      ['walk', 1],
      ['attack', 0.75]
    ])
  )
  expect(shader.vertexShader).toContain('vWolfRest = _blink_rest')
  expect(shader.fragmentShader).toContain('mapN.xy *= normalScale * (1.0 - wolfCurrentLid.mask)')
  expect((shader.uniforms as Record<string, { value: number }>).uWolfBlink.value).toBe(0.5)
  expect(body.morphTargetInfluences![body.morphTargetDictionary!.BlinkDepth]).toBeCloseTo(0.875, 4)
  lid.dispose()
  mixer.stopAllAction()
  mixer.uncacheRoot(gltf.scene)
})
