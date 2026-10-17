import { afterEach, describe, expect, it, vi } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as soldierSource from '../src/rendering/models/adapters/source/soldier-dq-skinning-adapter.js'
import * as tankSource from './fixtures/tank-dq-97e0b6f.mjs'
import * as dragonSource from '../src/rendering/models/adapters/source/dragon-dq-skinning-adapter.js'
import * as soldierRuntime from '../src/rendering/models/adapters/runtime/soldier-dq-skinning-adapter.js'
import * as tankRuntime from '../src/rendering/models/adapters/runtime/tank-dq-skinning-adapter.js'
import { installOgreDQSkinningAdapter as ogreReference } from '../src/rendering/models/adapters/source/ogre-dq-skinning-adapter.js'
import { installOgreDQSkinningAdapter as ogreRuntime } from '../src/rendering/models/adapters/runtime/ogre-dq-skinning-adapter.js'
import * as dragonRuntime from '../src/rendering/models/adapters/runtime/dragon-dq-skinning-adapter.js'

const cases = [
  {
    role: 'soldier',
    source: soldierSource,
    runtime: soldierRuntime,
    files: ['soldier-motion-v2-candidate.glb'],
    sha: '905f6f2e747d7c568b56b5629c841f8139ff696c026890e4571a6662022c3a7c'
  },
  {
    role: 'tank',
    source: tankSource,
    runtime: tankRuntime,
    files: ['tank-idle-candidate.glb', 'tank-walk-candidate.glb', 'tank-attack-candidate.glb'],
    sha: '33668424f8de9230416ee6ae6cb97e0d6781eb66a1226baa93268a40f1fc0783'
  },
  {
    role: 'dragon',
    source: dragonSource,
    runtime: dragonRuntime,
    files: ['dragon-motion-v2-candidate.glb'],
    sha: '1c866dfb3a5941c4eefbd53b28da75f682da5e30617bb9e29c3e7a4a73a0e5b4'
  }
]

async function actor(spec: (typeof cases)[number], file: string, variant: 'source' | 'runtime') {
  const original = readFileSync(resolve('public/tower-defense-art/models', spec.role, file))
  const jsonLength = original.readUInt32LE(12)
  const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString())
  // Node only needs the authored rig/geometry/animation; never rewrite the GLB on disk.
  json.materials = json.materials?.map((material: any) => ({ name: material.name }))
  delete json.images
  delete json.textures
  delete json.samplers
  const text = Buffer.from(JSON.stringify(json))
  const padded = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 32)])
  const binary = original.subarray(20 + jsonLength)
  const bytes = Buffer.alloc(20 + padded.length + binary.length)
  original.copy(bytes, 0, 0, 12)
  bytes.writeUInt32LE(bytes.length, 8)
  bytes.writeUInt32LE(padded.length, 12)
  bytes.writeUInt32LE(0x4e4f534a, 16)
  padded.copy(bytes, 20)
  binary.copy(bytes, 20 + padded.length)
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ''
  )
  const module = spec[variant] as Record<string, any>
  const install = module[`install${spec.role[0].toUpperCase()}${spec.role.slice(1)}DQSkinningAdapter`]
  const adapter = install(gltf.scene, { THREE })
  const palettes: Float32Array[] = [],
    shaders: string[] = []
  let lastBone!: THREE.Bone
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return
    lastBone = object.skeleton.bones.at(-1)!
    const material = Array.isArray(object.material) ? object.material[0] : object.material
    const shader = {
      uniforms: {} as Record<string, { value: Float32Array }>,
      vertexShader:
        '#include <skinning_pars_vertex>\n#include <skinbase_vertex>\n#include <skinnormal_vertex>\n#include <skinning_vertex>'
    }
    material.onBeforeCompile(shader as any, null as any)
    palettes.push(shader.uniforms[`${spec.role}DQReal`].value, shader.uniforms[`${spec.role}DQDual`].value)
    shaders.push(shader.vertexShader)
  })
  const mixer = new THREE.AnimationMixer(gltf.scene)
  return {
    gltf,
    mixer,
    adapter,
    palettes,
    shaders,
    lastBone,
    dispose() {
      adapter.dispose()
      mixer.uncacheRoot(gltf.scene)
    }
  }
}
function allocations(update: () => void) {
  const counters = { float64: 0, from: 0, subarray: 0 }
  const F64 = Float64Array,
    from = Array.from,
    subarray = Float32Array.prototype.subarray
  vi.stubGlobal(
    'Float64Array',
    new Proxy(F64, {
      construct(target, args) {
        counters.float64++
        return Reflect.construct(target, args)
      }
    })
  )
  vi.spyOn(Array, 'from').mockImplementation(((...args: any[]) => {
    counters.from++
    return (from as any)(...args)
  }) as any)
  vi.spyOn(Float32Array.prototype, 'subarray').mockImplementation(function (begin, end) {
    counters.subarray++
    return subarray.call(this, begin, end)
  })
  try {
    update()
  } finally {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
  return counters
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('runtime DQ scratch reuse preserves authored output', () => {
  for (const spec of cases) {
    it(`${spec.role} retains the original reference and exported helpers`, () => {
      const source = readFileSync(
        resolve(
          `examples/games/tower_diffence_with_jev/src/rendering/models/adapters/source/${spec.role}-dq-skinning-adapter.js`
        )
      )
      const originalSha =
        spec.role === 'tank' ? 'bc3e5813608bbd2c934355d876c8cb87cfd56212e579e20299a8e942b14a3449' : spec.sha
      expect(createHash('sha256').update(source).digest('hex')).toBe(originalSha)
      // The adopted Tank has split primitives/14 bones; its accepted runtime predates this optimization.
      if (spec.role === 'tank')
        expect(
          createHash('sha256')
            .update(readFileSync(resolve('examples/games/tower_diffence_with_jev/tests/fixtures/tank-dq-97e0b6f.mjs')))
            .digest('hex')
        ).toBe(spec.sha)
      for (const suffix of ['MultiplyMatrices', 'MatrixToDualQuaternion']) {
        const name = spec.role + suffix
        expect((spec.runtime as any)[name].toString()).toBe((spec.source as any)[name].toString())
      }
    })
    for (const file of spec.files) {
      it(`${spec.role}/${file} matches shaders and every palette word across authored clips`, async () => {
        const a = await actor(spec, file, 'source'),
          b = await actor(spec, file, 'runtime')
        try {
          expect(b.shaders).toEqual(a.shaders)
          expect(b.palettes.length).toBe(a.palettes.length)
          for (const clip of a.gltf.animations) {
            for (const value of [a, b]) {
              value.mixer.stopAllAction()
              const action = value.mixer.clipAction(value.gltf.animations.find((c) => c.name === clip.name)!)
              action.reset().setLoop(THREE.LoopOnce, 1)
              action.clampWhenFinished = true
              action.play()
            }
            for (let k = 0; k <= 120; k++) {
              for (const value of [a, b]) {
                value.gltf.scene.position.set(Math.sin(k) * 3, k % 5, Math.cos(k))
                value.gltf.scene.rotation.set(k * 0.001, k * 0.02, -k * 0.003)
                value.gltf.scene.scale.setScalar([0.5, 1, 2][k % 3])
                value.mixer.setTime((clip.duration * k) / 120)
                value.adapter.update()
              }
              for (let i = 0; i < a.palettes.length; i++)
                assert.ok(
                  Buffer.from(a.palettes[i].buffer).equals(Buffer.from(b.palettes[i].buffer)),
                  `${clip.name} sample${k} palette${i}`
                )
            }
          }
        } finally {
          a.dispose()
          b.dispose()
        }
      })
    }
    it(`${spec.role} removes hot math temporaries while retaining world and skeleton updates`, async () => {
      const file = spec.files.find((x) => x.includes('walk')) ?? spec.files[0]
      const a = await actor(spec, file, 'source'),
        b = await actor(spec, file, 'runtime')
      try {
        const reference = allocations(() => a.adapter.update())
        const root = vi.spyOn(b.gltf.scene, 'updateMatrixWorld')
        const skeletons = new Set<THREE.Skeleton>()
        b.gltf.scene.traverse((o) => {
          if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton)
        })
        const updates = [...skeletons].map((s) => vi.spyOn(s, 'update'))
        expect(allocations(() => b.adapter.update())).toEqual({ float64: 0, from: 0, subarray: 0 })
        expect(reference.float64).toBeGreaterThan(0)
        expect(reference.from).toBeGreaterThan(0)
        expect(reference.subarray).toBeGreaterThan(0)
        expect(root).toHaveBeenCalledWith(true)
        for (const update of updates) expect(update).toHaveBeenCalledOnce()
      } finally {
        a.dispose()
        b.dispose()
      }
    })
    it(`${spec.role} preserves invalid-matrix and disposed guards`, async () => {
      const file = spec.files.find((x) => x.includes('walk')) ?? spec.files[0]
      const a = await actor(spec, file, 'source'),
        b = await actor(spec, file, 'runtime')
      try {
        for (const kind of ['scale', 'reflection', 'nan']) {
          const errors = [a, b].map((value) => {
            value.lastBone.scale.set(1, 1, 1)
            value.lastBone.position.x = 0
            if (kind === 'scale') value.lastBone.scale.x = 1.01
            if (kind === 'reflection') value.lastBone.scale.x = -1
            if (kind === 'nan') value.lastBone.position.x = NaN
            try {
              value.adapter.update()
              return null
            } catch (error) {
              return String(error)
            }
          })
          expect(errors[0]).not.toBeNull()
          expect(errors[1]).toBe(errors[0])
        }
        for (const value of [a, b]) {
          value.adapter.dispose()
          expect(() => value.adapter.update()).toThrow(/disposed/)
          value.adapter.dispose()
        }
      } finally {
        a.dispose()
        b.dispose()
      }
    })
  }
})

function skinFixture(type: string, mode: string, bad?: string) {
  const root = new THREE.Group(),
    bones = Array.from({ length: type === 'tank' ? 12 : 16 }, () => new THREE.Bone())
  root.add(...bones)
  for (let i = 0; i < (type === 'tank' ? 1 : 27); i++) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    let weights: THREE.BufferAttribute | THREE.InterleavedBufferAttribute = new THREE.Float32BufferAttribute(
        [0.5, 0.5, 0, 0],
        4
      ),
      indices: THREE.BufferAttribute | THREE.InterleavedBufferAttribute = new THREE.Uint16BufferAttribute(
        [0, 1, 0, 0],
        4
      )
    if (mode === 'normalized') weights = new THREE.Uint8BufferAttribute([128, 127, 0, 0], 4, true)
    if (mode === 'normalized-index') indices = new THREE.Uint8BufferAttribute([0, 255, 0, 0], 4, true)
    if (mode === 'half') weights = new THREE.Float16BufferAttribute(new Uint16Array([0x3800, 0x3800, 0, 0]), 4)
    if (mode === 'interleaved') {
      const data = new THREE.InterleavedBuffer(new Float32Array([0, 1, 0, 0, 0.5, 0.5, 0, 0]), 8)
      weights = new THREE.InterleavedBufferAttribute(data, 4, 4)
      indices = new THREE.InterleavedBufferAttribute(data, 4, 0)
    }
    if (mode === 'custom-weight-x') weights.getX = () => 0.25
    if (mode === 'custom-weight-y') weights.getY = () => 0.25
    if (mode === 'custom-index') indices.getX = () => 99
    if (mode === 'custom-decoder') {
      weights.array[0] = NaN
      weights.getX = () => 0.5
    }
    if (bad === 'negative') weights.setX(0, -1)
    if (bad === 'nan') weights.setX(0, NaN)
    if (bad === 'sum') weights.setX(0, 0.2)
    if (bad === 'fraction-index') indices = new THREE.Float32BufferAttribute([0, 0.5, 0, 0], 4)
    if (bad === 'range-index') indices.setY(0, 99)
    geo.setAttribute('skinWeight', weights)
    geo.setAttribute('skinIndex', indices)
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial())
    mesh.bind(new THREE.Skeleton(bones))
    root.add(mesh)
  }
  return root
}

describe('skin validation preserves decoded attribute semantics', () => {
  for (const role of ['tank', 'ogre']) {
    for (const mode of [
      'plain',
      'normalized',
      'normalized-index',
      'half',
      'interleaved',
      'custom-weight-x',
      'custom-weight-y',
      'custom-index',
      'custom-decoder'
    ]) {
      for (const bad of [undefined, 'negative', 'nan', 'sum', 'fraction-index', 'range-index']) {
        it(`${role} ${mode} ${bad ?? 'valid'}`, () => {
          const reference = role === 'tank' ? tankSource.installTankDQSkinningAdapter : ogreReference
          const runtime = role === 'tank' ? tankRuntime.installTankDQSkinningAdapter : ogreRuntime
          const outcome = (install: typeof reference) => {
            try {
              const adapter = install(skinFixture(role, mode, bad), { THREE })
              adapter.update()
              adapter.dispose()
              return 'accepted'
            } catch (error) {
              return (error as Error).message
            }
          }
          expect(outcome(runtime)).toBe(outcome(reference))
        })
      }
    }
  }
})
