import type * as THREE from 'three'
import type { Scenery, StageLook } from '../../story'
import { buildScenery } from '../scenery-kit'

export const LOOK: StageLook = {
  sky: '#f0b48a',
  nightSky: '#27304a',
  fog: [40, 140],
  hemi: ['#ffe0c4', '#5a4a40', 2.2],
  sun: ['#ffc58a', 2.6],
  night: (state) => Math.min(1, (state.step ?? 0) * 0.5)
}

export function scenery(scene: THREE.Scene): Scenery {
  return buildScenery(scene, {
    colorAt: (x, _z, y) => (y > 1 ? '#a8a49a' : Math.abs(x + 0.5) < 4.5 ? '#4a4a50' : '#9b968c'),
    boxes: [
      { x: 18, y: 0, z: 8.25, w: 16, h: 0.9, d: 6.5, color: '#2b2b2b' }, // shadow under the parked car
      { x: 18, y: 0.9, z: 8.25, w: 16, h: 3, d: 6.5, color: '#e0d6c0' },
      { x: 17, y: 3.9, z: 8.25, w: 9, h: 1.6, d: 6, color: '#cfc4ad' },
      { x: 19, y: 0, z: -3, w: 0.4, h: 9, d: 0.4, color: '#55585e' } // streetlight pole
    ]
  })
}
