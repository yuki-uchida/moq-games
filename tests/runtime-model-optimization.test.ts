import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  validModelRole,
  optimizeGlb,
  readGlb,
  accessorArray,
  verifyPreservation,
  sanitizeRuntimeMetadata
} from '../scripts/optimize-tower-models.mjs'

function fixture(unknown = false) {
  const arrays: Buffer[] = [],
    accessors: any[] = [],
    views: any[] = []
  let byteOffset = 0
  const add = (array: Float32Array | Uint16Array, type: string, componentType = 5126) => {
    const index = accessors.length,
      bytes = Buffer.from(array.buffer)
    views.push({ buffer: 0, byteOffset, byteLength: bytes.length })
    byteOffset += Math.ceil(bytes.length / 4) * 4
    arrays.push(Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4)]))
    accessors.push({
      bufferView: views.length - 1,
      componentType,
      type,
      count: array.length / { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type]!
    })
    return index
  }
  const size = 32,
    position: number[] = [],
    normal: number[] = [],
    joints: number[] = [],
    weights: number[] = [],
    rest: number[] = [],
    morph: number[] = [],
    indices: number[] = []
  for (let y = 0; y <= size; y++)
    for (let x = 0; x <= size; x++) {
      position.push(x / size, y / size, 0)
      normal.push(0, 0, 1)
      rest.push(x / size, 0, y / size)
      joints.push(0, 1, 2, 3)
      weights.push(0.4, 0.3, 0.2, 0.1)
      morph.push(0, 0, x === 16 && y === 16 ? 0.1 : 0)
    }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = y * (size + 1) + x,
        b = a + 1,
        c = a + size + 1,
        d = c + 1
      indices.push(a, b, d, a, d, c)
    }
  const attributes: any = {
    POSITION: add(Float32Array.from(position), 'VEC3'),
    NORMAL: add(Float32Array.from(normal), 'VEC3'),
    JOINTS_0: add(Uint16Array.from(joints), 'VEC4', 5123),
    WEIGHTS_0: add(Float32Array.from(weights), 'VEC4'),
    _BLINKRESTPOSITION: add(Float32Array.from(rest), 'VEC3')
  }
  if (unknown) attributes._PRIVATE_FUTURE_EFFECT = add(Float32Array.from(normal), 'VEC3')
  const primitive = {
    attributes,
    indices: add(Uint16Array.from(indices), 'SCALAR', 5123),
    material: 0,
    targets: [{ POSITION: add(Float32Array.from(morph), 'VEC3') }]
  }
  const json: any = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Authored_Emitter', mesh: 0, translation: [0, 0, 0] }],
    materials: [{ name: 'Authored material' }],
    meshes: [{ name: 'Fixture', weights: [0], extras: { targetNames: ['BlinkDepth'] }, primitives: [primitive] }],
    animations: [
      {
        name: 'idle',
        extras: {
          durationMs: 1000,
          blinkAmountSamples: [
            [0, 0],
            [1, 1]
          ]
        },
        channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
        samplers: [
          {
            input: add(Float32Array.from([0, 1]), 'SCALAR'),
            output: add(Float32Array.from([0, 0, 0, 1, 0, 0]), 'VEC3'),
            interpolation: 'LINEAR'
          }
        ]
      }
    ],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: byteOffset }]
  }
  accessors[attributes.POSITION].min = [0, 0, 0]
  accessors[attributes.POSITION].max = [1, 1, 0]
  const raw = Buffer.from(JSON.stringify(json)),
    text = Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4, 0x20)]),
    header = Buffer.alloc(20),
    binHeader = Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + text.length + byteOffset, 8)
  header.writeUInt32LE(text.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  binHeader.writeUInt32LE(byteOffset)
  binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, text, binHeader, ...arrays])
}

it('reduces real topology while preserving every retained attribute, authored morph endpoint, animation and named node', async () => {
  const source = fixture(),
    beforeHash = createHash('sha256').update(source).digest('hex')
  const { bytes, audit } = await optimizeGlb(source, { resizeTextures: false })
  expect(audit.after.triangles).toBeLessThan(audit.before.triangles * 0.2)
  expect(audit.after.vertices).toBeLessThan(audit.before.vertices * 0.3)
  expect(audit.validation.retainedVertexMaximumAbsoluteError).toBe(0)
  expect(audit.validation.exactAnimationSamplers).toBe(1)
  expect(audit.primitives[0].retainedSourceVertices).toContain(16 * 33 + 16)
  expect(createHash('sha256').update(source).digest('hex')).toBe(beforeHash)
  expect(() => verifyPreservation(source, bytes, audit.primitives)).not.toThrow()
  expect(readGlb(bytes).json.extensionsRequired).toBeUndefined()
})

it('locks an unreviewed custom attribute rather than silently removing or approximating it', async () => {
  const { audit } = await optimizeGlb(fixture(true), { resizeTextures: false })
  expect(audit.after.triangles).toBe(audit.before.triangles)
  expect(audit.primitives[0].unreviewedAttributes).toEqual(['_PRIVATE_FUTURE_EFFECT'])
})

it('rejects unsafe quality bounds', async () => {
  await expect(optimizeGlb(fixture(), { error: 0.05, resizeTextures: false })).rejects.toThrow('safety limits')
})

it('strips private provenance only and preserves timing/blink/emitter contracts', () => {
  const original = {
    asset: { version: '2.0' },
    extras: {
      sourceLibraryId: 'libfile_private',
      sourceNotes: 'internal history',
      sourceFilePath: '/home/private/a.blend',
      emitterNode: 'Mouth',
      requiredAdapters: ['dragon-dq-skinning-adapter.js']
    },
    animations: [
      {
        extras: {
          durationMs: 1200,
          events: [{ atMs: 480, type: 'release' }],
          blinkAmountSamples: [
            [0, 0],
            [1, 1]
          ],
          timingSourceLibraryId: 'libfile_other'
        }
      }
    ]
  }
  const result = sanitizeRuntimeMetadata(original)
  expect(result.removed).toHaveLength(4)
  expect(result.json.extras).toEqual({ emitterNode: 'Mouth', requiredAdapters: ['dragon-dq-skinning-adapter.js'] })
  expect(result.json.animations[0].extras).toEqual({
    durationMs: 1200,
    events: [{ atMs: 480, type: 'release' }],
    blinkAmountSamples: [
      [0, 0],
      [1, 1]
    ]
  })
  expect(original.extras.sourceLibraryId).toBe('libfile_private')
})

const manifestPath = resolve(
  process.env.TOWER_MODEL_OPTIMIZATION_MANIFEST ?? 'local-assets/runtime-model-optimization.json'
)
const assets = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).assets : []
describe.skipIf(!assets.length)('local derivative exhaustive CPU preservation (not GPU acceptance)', () => {
  for (const asset of assets)
    it(`${asset.role}/${asset.file}: all numeric data and source hashes`, () => {
      const source = readFileSync(resolve(asset.source)),
        output = readFileSync(resolve(asset.output))
      expect(createHash('sha256').update(source).digest('hex')).toBe(asset.sourceSha256)
      expect(createHash('sha256').update(output).digest('hex')).toBe(asset.outputSha256)
      const maps = JSON.parse(readFileSync(resolve(asset.vertexMap), 'utf8'))
      const primitiveAudits = asset.primitives.map((p: any, i: number) => ({ ...p, retainedSourceVertices: maps[i] }))
      expect(verifyPreservation(source, output, primitiveAudits).retainedVertexMaximumAbsoluteError).toBe(0)
      expect(asset.after.triangles).toBeLessThanOrEqual(asset.before.triangles)
      expect(asset.after.bytes).toBeLessThan(asset.before.bytes)
      expect(asset.textures.every((texture: any) => texture.after.width <= 1024 && texture.after.height <= 1024)).toBe(
        true
      )
    })
})

// Three's CPU skin function is LBS. Authored DQ is tested below with rigid
// local palettes rather than claiming that Three's applyBoneTransform is DQ.
function vertex(mesh: THREE.Mesh, index: number, extraRole?: string) {
  const geometry = mesh.geometry,
    result = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), index)
  for (let target = 0; target < (geometry.morphAttributes.position?.length ?? 0); target++)
    result.addScaledVector(
      new THREE.Vector3().fromBufferAttribute(geometry.morphAttributes.position[target], index),
      mesh.morphTargetInfluences?.[target] ?? 0
    )
  if (!(mesh instanceof THREE.SkinnedMesh)) return result.applyMatrix4(mesh.matrixWorld)
  const position = result.clone().applyMatrix4(mesh.bindMatrix),
    joint = geometry.getAttribute('skinIndex'),
    weight =
      geometry.getAttribute(extraRole ? `_${extraRole}weights0` : 'skinWeight') ?? geometry.getAttribute('skinWeight')
  result.set(0, 0, 0)
  for (let k = 0; k < 4; k++)
    result.addScaledVector(
      position
        .clone()
        .applyMatrix4(new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, joint.getComponent(index, k) * 16)),
      weight.getComponent(index, k)
    )
  if (extraRole && geometry.hasAttribute(`_${extraRole}joints1`)) {
    const joints = geometry.getAttribute(`_${extraRole}joints1`),
      weights = geometry.getAttribute(`_${extraRole}weights1`)
    for (let k = 0; k < 4; k++)
      result.addScaledVector(
        position
          .clone()
          .applyMatrix4(new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, joints.getComponent(index, k) * 16)),
        weights.getComponent(index, k)
      )
  }
  return result.applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld)
}

// Position deformed by shader-equivalent DQ blending, including hemisphere sign.
function dqVertex(mesh: THREE.SkinnedMesh, index: number) {
  const geometry = mesh.geometry,
    point = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), index)
  for (let target = 0; target < (geometry.morphAttributes.position?.length ?? 0); target++)
    point.addScaledVector(
      new THREE.Vector3().fromBufferAttribute(geometry.morphAttributes.position[target], index),
      mesh.morphTargetInfluences?.[target] ?? 0
    )
  const joints = geometry.getAttribute('skinIndex'),
    weights = geometry.getAttribute('skinWeight'),
    reals: THREE.Quaternion[] = [],
    duals: THREE.Quaternion[] = []
  for (let k = 0; k < 4; k++) {
    const matrix = mesh.bindMatrixInverse
      .clone()
      .multiply(new THREE.Matrix4().fromArray(mesh.skeleton.boneMatrices, joints.getComponent(index, k) * 16))
      .multiply(mesh.bindMatrix)
    const real = new THREE.Quaternion().setFromRotationMatrix(matrix).normalize(),
      translation = new THREE.Vector3().setFromMatrixPosition(matrix)
    const dual = new THREE.Quaternion(translation.x, translation.y, translation.z, 0).multiply(real)
    dual.set(dual.x * 0.5, dual.y * 0.5, dual.z * 0.5, dual.w * 0.5)
    reals.push(real)
    duals.push(dual)
  }
  const first = [0, 1, 2, 3].find((k) => weights.getComponent(index, k) > 0) ?? 3,
    real = new THREE.Vector4(),
    dual = new THREE.Vector4()
  real.set(0, 0, 0, 0)
  dual.set(0, 0, 0, 0)
  for (let k = 0; k < 4; k++) {
    const sign = reals[first].dot(reals[k]) < 0 ? -1 : 1,
      w = sign * weights.getComponent(index, k)
    real.addScaledVector(new THREE.Vector4(...reals[k].toArray()), w)
    dual.addScaledVector(new THREE.Vector4(...duals[k].toArray()), w)
  }
  const length = real.length()
  real.divideScalar(length)
  dual.divideScalar(length)
  const translation = new THREE.Quaternion(dual.x, dual.y, dual.z, dual.w).multiply(
    new THREE.Quaternion(-real.x, -real.y, -real.z, real.w)
  )
  return point
    .applyQuaternion(new THREE.Quaternion(real.x, real.y, real.z, real.w))
    .add(new THREE.Vector3(translation.x * 2, translation.y * 2, translation.z * 2))
    .applyMatrix4(mesh.matrixWorld)
}

describe.skipIf(!assets.length)('authored animation CPU deformation samples', () => {
  for (const role of ['tank', 'mage', 'ranger', 'dragon'])
    it(`${role}: original and derivative match at sampled retained vertices in every authored clip`, async () => {
      const matches = assets.filter((asset: any) => asset.role === role)
      if (!matches.length) return
      for (const asset of matches) {
        const loader = new GLTFLoader()
        loader.register(() => ({
          name: 'CPU_TEST_TEXTURE_STUB',
          loadTexture: () => Promise.resolve(new THREE.Texture())
        }))
        const parse = (path: string) => {
          const bytes = readFileSync(resolve(path))
          return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
        }
        const [original, optimized] = await Promise.all([parse(asset.source), parse(asset.output)])
        const maps = JSON.parse(readFileSync(resolve(asset.vertexMap), 'utf8')),
          mixers = [new THREE.AnimationMixer(original.scene), new THREE.AnimationMixer(optimized.scene)]
        const primitives = [original, optimized].map((gltf) => {
          const result: THREE.Mesh[] = []
          gltf.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) result.push(object)
          })
          return result
        })
        expect(primitives[0].length).toBe(primitives[1].length)
        // Parser associations map each object to the source primitive; traversal
        // order alone is not a safe mapping when authored node order differs.
        for (let clip = 0; clip < original.animations.length; clip++) {
          const clips = [original.animations[clip], optimized.animations[clip]]
          expect(clips[0].duration).toBe(clips[1].duration)
          mixers.forEach((mixer, i) => {
            mixer.stopAllAction()
            mixer.clipAction(clips[i]).setLoop(THREE.LoopOnce, 1).play()
          })
          for (const fraction of [0, 0.23, 0.5, 0.93]) {
            mixers.forEach((mixer, i) => {
              mixer.setTime(clips[i].duration * fraction)
              ;[original, optimized][i].scene.updateMatrixWorld(true)
              primitives[i].forEach((mesh) => {
                if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update()
              })
            })
            for (let m = 0; m < primitives[0].length; m++) {
              const a = primitives[0][m],
                b = primitives[1][m],
                association = original.parser.associations.get(a)!
              const entryIndex = asset.primitives.findIndex(
                (p: any) => p.mesh === association.meshes && p.primitive === association.primitives
              )
              expect(entryIndex).toBeGreaterThanOrEqual(0)
              const map = maps[entryIndex]
              const count = b.geometry.getAttribute('position').count
              for (let index = 0; index < count; index += Math.max(1, Math.floor(count / 32))) {
                const dq = ['tank', 'dragon'].includes(role) && a instanceof THREE.SkinnedMesh
                const before = dq
                  ? dqVertex(a as THREE.SkinnedMesh, map[index])
                  : vertex(a, map[index], role === 'ranger' ? role : undefined)
                const after = dq
                  ? dqVertex(b as THREE.SkinnedMesh, index)
                  : vertex(b, index, role === 'ranger' ? role : undefined)
                expect(before.distanceTo(after)).toBeLessThan(1e-7)
              }
            }
          }
        }
        mixers.forEach((mixer, i) => {
          mixer.stopAllAction()
          mixer.uncacheRoot([original, optimized][i].scene)
        })
        primitives.flat().forEach((mesh) => {
          mesh.geometry.dispose()
          ;(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose())
        })
      }
    }, 120000)
})

it('permits exact camel-case game IDs without permitting paths in model optimization roles', () => {
  for (const role of ['tank', 'crystalSentinel', 'koboldLancer', 'clockworkPatchling'])
    expect(validModelRole(role)).toBe(true)
  for (const role of ['../tank', 'tank/attack', 'Tank', '', 'tank.glb', 'tank_1'])
    expect(validModelRole(role)).toBe(false)
})
