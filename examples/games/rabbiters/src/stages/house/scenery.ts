import type * as THREE from 'three'
import type { Scenery, StageLook } from '../../story'
import { buildScenery } from '../scenery-kit'

export const LOOK: StageLook = {
  sky: '#f3e6d0',
  fog: [40, 120],
  hemi: ['#fff4e0', '#8a6a4a', 2.6],
  sun: ['#ffe2b0', 2.4],
  indoor: true
}

export function scenery(scene: THREE.Scene): Scenery {
  return buildScenery(scene, {
    colorAt: (_x, _z, y) => (y > 1 ? '#e9dcc4' : '#b8875a'),
    boxes: [
      // Table top and legs, sofa, the bird cage shelf.
      { x: 0, y: 2.5, z: 0.5, w: 8, h: 0.3, d: 5, color: '#8a5a36' },
      ...[-3.7, 3.7].flatMap((x) => [-1.7, 2.7].map((z) => ({ x, y: 0, z, w: 0.3, h: 2.5, d: 0.3, color: '#7a4e2e' }))),
      { x: 10.5, y: 1, z: 9, w: 7, h: 1, d: 4, color: '#6f8fb4' },
      { x: 10.5, y: 2, z: 10.7, w: 7, h: 2, d: 0.8, color: '#6f8fb4' },
      { x: -15, y: 0, z: -10, w: 2, h: 2.5, d: 2, color: '#c9b089' }
    ]
  })
}
