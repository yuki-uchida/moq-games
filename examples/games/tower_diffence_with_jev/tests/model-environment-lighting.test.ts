import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ModelEnvironmentLighting } from '../src/rendering/ModelEnvironmentLighting'

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  generatorDispose: vi.fn(),
  roomDispose: vi.fn()
}))
vi.mock('three', async (original) => ({
  ...(await original<typeof import('three')>()),
  PMREMGenerator: class {
    fromScene = mocks.generate
    dispose = mocks.generatorDispose
  }
}))
vi.mock('three/addons/environments/RoomEnvironment.js', () => ({
  RoomEnvironment: class {
    dispose = mocks.roomDispose
  }
}))

describe('shared model environment lighting', () => {
  beforeEach(() => vi.clearAllMocks())
  it('is lazy, generates once across frames, uses the approved weak IBL and releases GPU ownership once', () => {
    const scene = new THREE.Scene()
    const background = new THREE.Color('green')
    scene.background = background
    const texture = new THREE.Texture()
    const dispose = vi.fn()
    mocks.generate.mockReturnValue({ texture, dispose })
    const lighting = new ModelEnvironmentLighting(scene)
    expect(scene.environment).toBeNull()
    expect(mocks.generate).not.toHaveBeenCalled()
    const renderer = {} as THREE.WebGLRenderer
    lighting.ensure(renderer)
    for (let frame = 0; frame < 120; frame++) lighting.ensure(renderer)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.generate.mock.calls[0][1]).toBe(0.04)
    expect(scene.environment).toBe(texture)
    expect(scene.environmentIntensity).toBe(0.25)
    expect(scene.background).toBe(background)
    expect(lighting.diagnostics()).toEqual({ ready: true, intensity: 0.25, generations: 1 })
    expect(mocks.roomDispose).toHaveBeenCalledTimes(1)
    expect(mocks.generatorDispose).toHaveBeenCalledTimes(1)
    lighting.dispose()
    lighting.dispose()
    lighting.ensure(renderer)
    expect(scene.environment).toBeNull()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
  it('cleans temporary resources if generation fails and permits a retry', () => {
    mocks.generate.mockImplementationOnce(() => {
      throw new Error('GPU unavailable')
    })
    const scene = new THREE.Scene()
    const lighting = new ModelEnvironmentLighting(scene)
    expect(() => lighting.ensure({} as THREE.WebGLRenderer)).toThrow('GPU unavailable')
    expect(mocks.roomDispose).toHaveBeenCalledTimes(1)
    expect(mocks.generatorDispose).toHaveBeenCalledTimes(1)
    expect(scene.environment).toBeNull()
    mocks.generate.mockReturnValue({ texture: new THREE.Texture(), dispose: vi.fn() })
    lighting.ensure({} as THREE.WebGLRenderer)
    expect(lighting.diagnostics().generations).toBe(1)
    lighting.dispose()
  })
  it('does not clear an environment subsequently installed by another owner', () => {
    mocks.generate.mockReturnValue({ texture: new THREE.Texture(), dispose: vi.fn() })
    const scene = new THREE.Scene()
    const lighting = new ModelEnvironmentLighting(scene)
    lighting.ensure({} as THREE.WebGLRenderer)
    const replacement = new THREE.Texture()
    scene.environment = replacement
    lighting.dispose()
    expect(scene.environment).toBe(replacement)
  })
})
