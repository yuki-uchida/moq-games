import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { prepareFadePrograms } from '../src/rendering/FadePrograms'

function fixture() {
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
  const uniform = { value: 0.4 }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.authoredBlink = uniform
  }
  material.customProgramCacheKey = () => 'authored-blink'
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material)
  mesh.bind(new THREE.Skeleton([]))
  const root = new THREE.Group().add(mesh)
  const scene = new THREE.Scene().add(root)
  return { material, mesh, root, scene, camera: new THREE.PerspectiveCamera(), uniform }
}

describe('lease-owned death fade shader preparation', () => {
  it('waits for both sides using disposable shader proxies and registers only ready programs on the lease', async () => {
    const f = fixture()
    let finish!: () => void
    let proxies!: THREE.Object3D
    const disposals: ReturnType<typeof vi.spyOn>[] = []
    const compileAsync = vi.fn((root: THREE.Object3D) => {
      proxies = root
      for (const object of root.children as THREE.Mesh[]) {
        expect(object).not.toBe(f.mesh)
        expect(object.geometry).toBe(f.mesh.geometry)
        expect((object as THREE.SkinnedMesh).skeleton).toBe(f.mesh.skeleton)
        const material = object.material as THREE.Material
        expect(material.transparent).toBe(true)
        expect(material.depthWrite).toBe(false)
        expect(material.customProgramCacheKey()).toBe('authored-blink')
        expect(material.onBeforeCompile).toBe(f.material.onBeforeCompile)
        disposals.push(vi.spyOn(material, 'dispose'))
      }
      expect(root.children.map((mesh) => ((mesh as THREE.Mesh).material as THREE.Material).side)).toEqual([
        THREE.BackSide,
        THREE.FrontSide
      ])
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const sides: THREE.Side[] = []
    const compile = vi.fn((root: THREE.Object3D) => {
      expect(compileAsync).toHaveBeenCalledTimes(1)
      expect((root as THREE.Mesh).material).toBe(f.material)
      expect(f.material.transparent).toBe(true)
      expect(f.material.depthWrite).toBe(false)
      sides.push(f.material.side)
      return new Set<THREE.Material>()
    })
    const geometryDispose = vi.spyOn(f.mesh.geometry, 'dispose')
    const originalDispose = vi.spyOn(f.material, 'dispose')
    const pending = prepareFadePrograms({ compileAsync, compile }, f.root, f.camera, f.scene)
    expect(f.material.transparent).toBe(false)
    expect(f.material.depthWrite).toBe(true)
    expect(f.material.side).toBe(THREE.DoubleSide)
    expect(f.mesh.parent).toBe(f.root)
    expect(f.root.parent).toBe(f.scene)
    expect(compile).not.toHaveBeenCalled()
    finish()
    await pending
    expect(sides).toEqual([THREE.BackSide, THREE.FrontSide])
    expect(f.material.transparent).toBe(false)
    expect(f.material.depthWrite).toBe(true)
    expect(f.material.side).toBe(THREE.DoubleSide)
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1)
    expect(proxies.children).toHaveLength(0)
    expect(originalDispose).not.toHaveBeenCalled()
    expect(geometryDispose).not.toHaveBeenCalled()
  })
  it.each(['reject', 'registration'] as const)(
    'cleans temporary programs and restores live flags after %s failure',
    async (failure) => {
      const f = fixture()
      const disposals: ReturnType<typeof vi.spyOn>[] = []
      const compileAsync = async (root: THREE.Object3D) => {
        for (const mesh of root.children as THREE.Mesh[])
          disposals.push(vi.spyOn(mesh.material as THREE.Material, 'dispose'))
        if (failure === 'reject') throw Error('driver failure')
      }
      const compile = () => {
        throw Error('driver failure')
      }
      await expect(prepareFadePrograms({ compileAsync, compile }, f.root, f.camera, f.scene)).rejects.toThrow(
        'driver failure'
      )
      for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1)
      expect(f.material.transparent).toBe(false)
      expect(f.material.depthWrite).toBe(true)
      expect(f.material.side).toBe(THREE.DoubleSide)
    }
  )
  it('does not register programs after loading is cancelled or the page leaves', async () => {
    const f = fixture(), request = new AbortController()
    let finish!: () => void
    const compile = vi.fn(() => new Set<THREE.Material>())
    const pending = prepareFadePrograms({ compileAsync: () => new Promise<void>(resolve => { finish = resolve }), compile }, f.root, f.camera, f.scene, request.signal)
    request.abort(new Error('page left'))
    finish()
    await expect(pending).rejects.toThrow('page left')
    expect(compile).not.toHaveBeenCalled()
    expect(f.material.transparent).toBe(false)
  })
  it('preserves a real fade or tint that begins while the driver is compiling', async () => {
    const f = fixture()
    let finish!: () => void
    const pending = prepareFadePrograms(
      {
        compileAsync: () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
        compile: () => new Set<THREE.Material>()
      },
      f.root,
      f.camera,
      f.scene
    )
    f.material.transparent = true
    f.material.depthWrite = false
    f.material.opacity = 0.4
    f.material.color.setHex(0xffc3b8)
    finish()
    await pending
    expect(f.material.transparent).toBe(true)
    expect(f.material.depthWrite).toBe(false)
    expect(f.material.opacity).toBe(0.4)
    expect(f.material.color.getHex()).toBe(0xffc3b8)
  })
  it.each([THREE.FrontSide, THREE.BackSide])('does not invent a second pass for side %i', async (side) => {
    const f = fixture()
    f.material.side = side
    const compileAsync = vi.fn(async (root: THREE.Object3D) => {
      expect(root.children).toHaveLength(1)
    })
    const compile = vi.fn(() => new Set<THREE.Material>())
    await prepareFadePrograms({ compileAsync, compile }, f.root, f.camera, f.scene)
    expect(compile).toHaveBeenCalledTimes(1)
    expect(f.material.side).toBe(side)
  })
})
