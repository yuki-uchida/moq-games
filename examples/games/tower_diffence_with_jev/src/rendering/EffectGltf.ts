import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'

/** Loads a small special-ability effect scene; a stalled request fails after 60 s. */
export function loadEffectGLTF(url: string): Promise<GLTF> {
  const manager = new THREE.LoadingManager()
  const loader = new GLTFLoader(manager)
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      manager.abort()
      reject(new Error('Effect load timed out'))
    }, 60_000)
  })
  return Promise.race([loader.loadAsync(url), timeout]).finally(() => clearTimeout(timer))
}
