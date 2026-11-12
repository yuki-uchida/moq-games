/** Shared pieces of the review page: a lit stage per cell and a camera that frames a model. */
import * as THREE from 'three'

export interface Cell {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  label: string
  sub?: string
  step(dt: number): void
}

/** Page-wide settings (set by main.ts before cells are built). */
export const view = { cellW: 300, cellH: 380, dark: false }

/** A lit stage with a round floor of `radius` metres and a shadow camera that covers it. */
export function stage(radius = 1.5, opts: { floor?: boolean } = {}): THREE.Scene {
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xeef3ff, 0x8a7864, 1.25))
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.3)
  const k = radius / 1.5
  sun.position.set(2.2 * k, 4.2 * k, 3.2 * k)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = sun.shadow.camera.bottom = -1.6 * k
  sun.shadow.camera.right = sun.shadow.camera.top = 1.6 * k
  sun.shadow.camera.far = 12 * k
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02 * Math.max(1, k * 0.5)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xc8dcff, 0.6)
  fill.position.set(-3 * k, 2 * k, -2.5 * k)
  scene.add(fill)
  if (opts.floor !== false) {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshStandardMaterial({ color: view.dark ? 0x3a4050 : 0xd8d0c4, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
  }
  return scene
}

/** A camera that fits `height` metres around `centerY` into a cell. */
export function fitCamera(height: number, centerY: number, extra = 1.12, elevation = 0.12): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(26, view.cellW / view.cellH, 0.05, 60)
  const fov = (camera.fov * Math.PI) / 180
  const dist = ((height * extra) / 2 / Math.tan(fov / 2)) * Math.max(1, (view.cellH / view.cellW) * 0.75)
  camera.position.set(0, centerY + Math.sin(elevation) * dist, Math.cos(elevation) * dist)
  camera.lookAt(0, centerY, 0)
  camera.far = Math.max(60, dist * 4)
  camera.near = Math.max(0.02, dist * 0.01)
  camera.updateProjectionMatrix()
  return camera
}

export const params = new URLSearchParams(location.search)
export const num = (key: string, def: number) => (params.has(key) ? Number(params.get(key)) : def)
