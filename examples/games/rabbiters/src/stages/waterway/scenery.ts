import * as THREE from 'three'
import type { Scenery, StageLook } from '../../story'
import { buildScenery } from '../scenery-kit'

export const LOOK: StageLook = {
  sky: '#141b24',
  fog: [12, 60],
  hemi: ['#5a6c86', '#1c1a18', 1.1],
  sun: ['#9fb4d8', 0.8],
  dark: true
}

export function scenery(scene: THREE.Scene): Scenery {
  // The floodgate slides away once its bit is open.
  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 3, 22),
    new THREE.MeshStandardMaterial({ color: '#6a5a40', flatShading: true })
  )
  gate.position.set(-4.5, 1.5, 0)
  const view = buildScenery(scene, {
    update(state) {
      gate.visible = !((state.open ?? 0) & 1)
    },
    colorAt: (_x, _z, y) => (y > 1 ? '#5b5f5a' : y < -0.5 ? '#2c3a3a' : '#7a7a70'),
    water: [{ minX: -4, maxX: 4, minZ: -11, maxZ: 11 }],
    boxes: [
      { x: -8, y: 0, z: 5, w: 0.4, h: 1.4, d: 0.4, color: '#8a3a2a' }, // valve post
      { x: -8, y: 1.4, z: 5, w: 1.2, h: 0.2, d: 1.2, color: '#c04a30' }
    ]
  })
  view.root.add(gate)
  return {
    update: view.update,
    dispose() {
      gate.geometry.dispose()
      gate.material.dispose()
      view.dispose()
    }
  }
}
