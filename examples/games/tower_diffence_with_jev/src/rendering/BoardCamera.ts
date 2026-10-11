import * as THREE from 'three'

// Catalog actors use a 128-world-unit authored presentation span. Reserve two
// spans about the pivot for animated weapons/wings and a full 1.35× boss. The
// public-runtime CPU regression samples this envelope for every roster motion;
// custom shader deformation also needs separate browser acceptance.
export const MODEL_DEPTH_RADIUS = 2 * 128
export const MODEL_BOSS_SCALE = 1.35
export const MODEL_GROUND_DEPTH_OFFSET = 4
export const modelGroundDepth = (y: number): number => y / 10 + MODEL_GROUND_DEPTH_OFFSET

export function configureBoardCamera(camera: THREE.OrthographicCamera, field: { width: number; height: number }): void {
  const animatedRadius = MODEL_DEPTH_RADIUS * MODEL_BOSS_SCALE
  camera.left = 0
  camera.right = field.width
  camera.top = 0
  camera.bottom = field.height
  // The camera looks down -Z: its near plane contains the highest world Z.
  // Derive this from the current field, including retained 1,440-unit layouts.
  camera.near = -(modelGroundDepth(field.height) + animatedRadius)
  camera.far = animatedRadius // Also contains background/effect layers below Z=0.
  camera.updateProjectionMatrix()
}

export function createBoardCamera(field: { width: number; height: number }): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera()
  configureBoardCamera(camera, field)
  return camera
}
