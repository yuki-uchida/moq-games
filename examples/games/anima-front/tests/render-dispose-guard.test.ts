import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createFoeMaterial, createFoeUniforms } from '../src/models/foes/material'
import { hullDepthMaterial, noShadowDepthMaterial } from '../src/models/hull'
import { createModelKit } from '../src/models'
import { createToonMaterial, createUniforms } from '../src/models/materials'
import { guardWebGLRenderer } from '../src/models/renderer-guard'

type ListenerMap = { _listeners?: Record<string, ((e: { type: string }) => void)[]> }

function disposeListenerCount(target: THREE.EventDispatcher): number {
  return (target as unknown as ListenerMap)._listeners?.dispose?.length ?? 0
}

function fakeRenderer() {
  const dispose = vi.fn()
  const forceContextLoss = vi.fn()
  const domElement = { width: 640, height: 360 }
  const renderer = {
    domElement,
    dispose,
    forceContextLoss,
    render(scene: THREE.Object3D) {
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) {
          const onGeo = () => {
            mesh.geometry.removeEventListener('dispose', onGeo)
          }
          mesh.geometry.addEventListener('dispose', onGeo)
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        for (const m of mats) {
          const onMat = () => {
            m.removeEventListener('dispose', onMat)
          }
          m.addEventListener('dispose', onMat)
        }
      })
    },
    compile() {},
    initTexture(texture: THREE.Texture) {
      const onTex = () => {
        texture.removeEventListener('dispose', onTex)
      }
      texture.addEventListener('dispose', onTex)
    },
    setRenderTarget() {},
    renderBufferDirect() {}
  }
  return {
    renderer: renderer as unknown as THREE.WebGLRenderer,
    dispose,
    forceContextLoss,
    domElement
  }
}

describe('guardWebGLRenderer & shared model resources', () => {
  it('detaches only the released renderer dispose listeners from shared resources while keeping another live renderer intact', () => {
    const sharedGeo = new THREE.BoxGeometry(1, 1, 1)
    const sharedMat = new THREE.MeshBasicMaterial()
    const sharedTex = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(sharedGeo, sharedMat))
    const cam = new THREE.PerspectiveCamera()

    const backdrop = fakeRenderer()
    const releaseBackdrop = guardWebGLRenderer(backdrop.renderer)
    backdrop.renderer.render(scene, cam)
    backdrop.renderer.initTexture(sharedTex)

    expect(disposeListenerCount(sharedGeo)).toBe(1)
    expect(disposeListenerCount(sharedMat)).toBe(1)
    expect(disposeListenerCount(sharedTex)).toBe(1)

    for (let i = 0; i < 20; i++) {
      const match = fakeRenderer()
      const releaseMatch = guardWebGLRenderer(match.renderer)
      match.renderer.render(scene, cam)
      match.renderer.initTexture(sharedTex)
      expect(disposeListenerCount(sharedGeo)).toBe(2)
      expect(disposeListenerCount(sharedMat)).toBe(2)
      expect(disposeListenerCount(sharedTex)).toBe(2)

      releaseMatch()

      expect(match.dispose).toHaveBeenCalledTimes(1)
      expect(match.forceContextLoss).toHaveBeenCalledTimes(1)
      expect(match.domElement.width).toBe(0)
      expect(match.domElement.height).toBe(0)
      // Only the backdrop renderer's listeners remain; nothing accumulates across matches.
      expect(disposeListenerCount(sharedGeo)).toBe(1)
      expect(disposeListenerCount(sharedMat)).toBe(1)
      expect(disposeListenerCount(sharedTex)).toBe(1)
    }

    releaseBackdrop()
    expect(disposeListenerCount(sharedGeo)).toBe(0)
    expect(disposeListenerCount(sharedMat)).toBe(0)
    expect(disposeListenerCount(sharedTex)).toBe(0)

    sharedGeo.dispose()
    sharedMat.dispose()
    sharedTex.dispose()
  })

  it('returns distinct depth materials and disposes per-material fallback region textures without module singletons', () => {
    const a = noShadowDepthMaterial()
    const b = noShadowDepthMaterial()
    expect(a).not.toBe(b)
    const h = hullDepthMaterial()
    expect(h).not.toBe(a)

    const toon1 = createToonMaterial(createUniforms(), null)
    const toon2 = createToonMaterial(createUniforms(), null)
    expect(disposeListenerCount(toon1)).toBe(1)
    expect(disposeListenerCount(toon2)).toBe(1)
    toon1.dispose()
    expect(disposeListenerCount(toon1)).toBe(0)
    expect(disposeListenerCount(toon2)).toBe(1)
    toon2.dispose()

    const foe1 = createFoeMaterial(createFoeUniforms(), null)
    const foe2 = createFoeMaterial(createFoeUniforms(), null)
    expect(disposeListenerCount(foe1)).toBe(1)
    foe1.dispose()
    expect(disposeListenerCount(foe1)).toBe(0)
    expect(disposeListenerCount(foe2)).toBe(1)
    foe2.dispose()

    a.dispose()
    b.dispose()
    h.dispose()
  })

  it('disposes character, item, prop and boss customDepthMaterial instances when models are disposed', () => {
    const kit = createModelKit({ quality: 'low' })
    try {
      const ch = kit.createCharacter('shiba', { outline: true })
      const depthSpies: ReturnType<typeof vi.spyOn>[] = []
      ch.root.traverse((o) => {
        const cdm = (o as THREE.Mesh).customDepthMaterial
        if (cdm) depthSpies.push(vi.spyOn(cdm, 'dispose'))
      })
      expect(depthSpies.length).toBeGreaterThan(0)
      ch.dispose()
      for (const s of depthSpies) expect(s).toHaveBeenCalled()

      const item = kit.createItem('claw')
      const itemSpies: ReturnType<typeof vi.spyOn>[] = []
      item.root.traverse((o) => {
        const cdm = (o as THREE.Mesh).customDepthMaterial
        if (cdm) itemSpies.push(vi.spyOn(cdm, 'dispose'))
      })
      expect(itemSpies.length).toBeGreaterThan(0)
      item.dispose()
      for (const s of itemSpies) expect(s).toHaveBeenCalled()

      const prop = kit.createProp('lighthouse')
      const propSpies: ReturnType<typeof vi.spyOn>[] = []
      const seen = new Set<THREE.Material>()
      prop.root.traverse((o) => {
        const cdm = (o as THREE.Mesh).customDepthMaterial
        if (cdm && !seen.has(cdm)) {
          seen.add(cdm)
          propSpies.push(vi.spyOn(cdm, 'dispose'))
        }
      })
      expect(propSpies.length).toBeGreaterThan(0)
      prop.dispose()
      for (const s of propSpies) expect(s).toHaveBeenCalled()

      const boss = kit.createBoss('goutetsu')
      const bossSpies: ReturnType<typeof vi.spyOn>[] = []
      const seenBoss = new Set<THREE.Material>()
      boss.root.traverse((o) => {
        const cdm = (o as THREE.Mesh).customDepthMaterial
        if (cdm && !seenBoss.has(cdm)) {
          seenBoss.add(cdm)
          bossSpies.push(vi.spyOn(cdm, 'dispose'))
        }
      })
      expect(bossSpies.length).toBeGreaterThan(0)
      boss.dispose()
      for (const s of bossSpies) expect(s).toHaveBeenCalled()
    } finally {
      kit.dispose()
    }
  })
})
