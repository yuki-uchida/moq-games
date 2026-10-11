import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { afterEach, expect, it, vi } from 'vitest'
import { Actual3DView, combineModelAdapters, disposeObject } from './Actual3DView'
import { verifiedBytes } from './api'
import type { ModelConfig } from './contracts'

vi.mock('./api', () => ({ verifiedBytes: vi.fn() }))
vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>()
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = { clientWidth: 128, clientHeight: 112 }
      setPixelRatio() {}
      setSize() {}
      render = vi.fn()
      dispose() {}
      forceContextLoss() {}
    }
  }
})
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = new THREE.Vector3()
    update() {}
    dispose() {}
  }
}))

function container() {
  const json = new TextEncoder().encode(JSON.stringify({ skins: [{ joints: [0] }], animations: [{}] }))
  const bytes = new ArrayBuffer(20 + json.length)
  const view = new DataView(bytes)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.byteLength, true)
  view.setUint32(12, json.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(bytes, 20).set(json)
  return bytes
}
function rig(joints: number) {
  const scene = new THREE.Group()
  const mesh = new THREE.SkinnedMesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial())
  const bones = Array.from({ length: joints }, () => new THREE.Bone())
  for (const bone of bones) scene.add(bone)
  const count = mesh.geometry.getAttribute('position').count
  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4))
  const weights = new Float32Array(count * 4)
  for (let index = 0; index < count; index++) weights[index * 4] = 1
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
  mesh.bind(new THREE.Skeleton(bones))
  scene.add(mesh)
  return { scene, mesh, animations: ['idle', 'walk', 'attack'].map((name) => new THREE.AnimationClip(name, 1, [])) }
}
function config(): ModelConfig {
  const file = {
    assetId: 'model',
    revision: 'synthetic',
    sha256: '0'.repeat(64),
    bytes: 1,
    mimeType: 'model/gltf-binary'
  }
  return { file, adapter: { ...file, assetId: 'adapter' }, manifest: file, cameraPresets: {} }
}
function arrange() {
  vi.stubGlobal('devicePixelRatio', 1)
  vi.mocked(verifiedBytes).mockImplementation(async (reference) =>
    reference.assetId === 'adapter' ? new TextEncoder().encode('{"adapterId":"synthetic"}').buffer : container()
  )
  const adapters: { sample: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = []
  const view = new Actual3DView({} as HTMLCanvasElement, {
    synthetic: () => {
      const adapter = { sample: vi.fn(), dispose: vi.fn() }
      adapters.push(adapter)
      return adapter
    }
  })
  return { view, adapters, signal: new AbortController().signal }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(verifiedBytes).mockReset()
})

it('loads only selected rigs and releases old resources and adapter on replacement', async () => {
  // Arrange
  const { view, adapters, signal } = arrange()
  const first = rig(2),
    second = rig(5)
  vi.spyOn(GLTFLoader.prototype, 'parseAsync')
    .mockResolvedValueOnce(first as never)
    .mockResolvedValueOnce(second as never)
  const firstDispose = vi.spyOn(first.mesh.geometry, 'dispose')
  const secondDispose = vi.spyOn(second.mesh.geometry, 'dispose')
  // Act
  await view.load(config(), signal)
  view.render(250)
  // Assert
  expect(adapters[0].sample).toHaveBeenCalledWith('idle', 250)
  expect(firstDispose).not.toHaveBeenCalled()
  expect(verifiedBytes).toHaveBeenCalledTimes(2)
  // Act
  await view.load(config(), signal)
  // Assert
  expect(firstDispose).toHaveBeenCalledOnce()
  expect(adapters[0].dispose).toHaveBeenCalledOnce()
  expect(second.mesh.skeleton.bones).toHaveLength(5)
  expect(secondDispose).not.toHaveBeenCalled()
  // Act
  view.dispose()
  view.dispose()
  // Assert
  expect(secondDispose).toHaveBeenCalledOnce()
  expect(adapters[1].dispose).toHaveBeenCalledOnce()
})
it('disposes a late model after viewer disposal instead of adopting it', async () => {
  // Arrange
  const { view, signal } = arrange()
  const late = rig(3)
  let resolve!: (value: never) => void
  vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const dispose = vi.spyOn(late.mesh.geometry, 'dispose')
  const loading = view.load(config(), signal)
  const rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  await new Promise<void>((done) => setImmediate(done))
  // Act
  view.dispose()
  resolve(late as never)
  await rejected
  // Assert
  expect(dispose).toHaveBeenCalledOnce()
})
it('disposes a skeleton shared by meshes exactly once', () => {
  // Arrange
  const { scene, mesh } = rig(2)
  const sibling = new THREE.SkinnedMesh(mesh.geometry, mesh.material)
  sibling.bind(mesh.skeleton)
  scene.add(sibling)
  const dispose = vi.spyOn(mesh.skeleton, 'dispose')
  // Act
  disposeObject(scene)
  // Assert
  expect(dispose).toHaveBeenCalledOnce()
})

it('updates adapters in installation order and disposes in reverse order', () => {
  // Arrange
  const events: string[] = []
  const combined = combineModelAdapters(
    ['blink', 'deformation'].map((name) => ({
      sample: () => {
        events.push(name)
      },
      dispose: () => {
        events.push('dispose-' + name)
      }
    }))
  )
  // Act
  combined.sample('attack', 750)
  combined.dispose()
  combined.dispose()
  combined.sample('idle', 0)
  // Assert
  expect(events).toEqual(['blink', 'deformation', 'dispose-deformation', 'dispose-blink'])
})

it('rejects an unknown adapter and preserves the already selected rig', async () => {
  // Arrange
  const { view, adapters, signal } = arrange()
  const first = rig(2),
    rejected = rig(3)
  vi.spyOn(GLTFLoader.prototype, 'parseAsync')
    .mockResolvedValueOnce(first as never)
    .mockResolvedValueOnce(rejected as never)
  const firstDispose = vi.spyOn(first.mesh.geometry, 'dispose')
  const rejectedDispose = vi.spyOn(rejected.mesh.geometry, 'dispose')
  await view.load(config(), signal)
  vi.mocked(verifiedBytes).mockImplementation(async (reference) =>
    reference.assetId === 'adapter' ? new TextEncoder().encode('{"adapterId":"toString"}').buffer : container()
  )
  // Act / Assert
  await expect(view.load(config(), signal)).rejects.toThrow('Unsupported character adapter')
  expect(firstDispose).not.toHaveBeenCalled()
  expect(rejectedDispose).toHaveBeenCalledOnce()
  view.render(250)
  expect(adapters[0].sample).toHaveBeenCalledWith('idle', 250)
  view.dispose()
})

it('samples adapter values after the selected rig animation mixer', async () => {
  // Arrange
  const { view, adapters, signal } = arrange()
  const model = rig(2)
  model.animations[0] = new THREE.AnimationClip('idle', 1, [
    new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 4])
  ])
  vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue(model as never)
  await view.load(config(), signal)
  adapters[0].sample.mockImplementation(() => expect(model.scene.position.x).toBeCloseTo(1))
  // Act
  view.render(250)
  // Assert
  expect(adapters[0].sample).toHaveBeenCalledOnce()
  view.dispose()
})

it('releases a superseded parsed rig and retains the newest selection', async () => {
  // Arrange
  const { view, adapters, signal } = arrange()
  const late = rig(2),
    latest = rig(5)
  let resolve!: (value: never) => void
  vi.spyOn(GLTFLoader.prototype, 'parseAsync')
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    .mockResolvedValueOnce(latest as never)
  const lateDispose = vi.spyOn(late.mesh.geometry, 'dispose')
  const loading = view.load(config(), signal)
  const rejected = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
  await new Promise<void>((done) => setImmediate(done))
  // Act
  await view.load(config(), signal)
  resolve(late as never)
  await rejected
  view.render(250)
  // Assert
  expect(lateDispose).toHaveBeenCalledOnce()
  expect(adapters).toHaveLength(1)
  expect(adapters[0].sample).toHaveBeenCalledWith('idle', 250)
  expect(latest.mesh.skeleton.bones).toHaveLength(5)
  view.dispose()
})
