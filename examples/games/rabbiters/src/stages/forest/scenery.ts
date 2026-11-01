import type * as THREE from 'three'
import { WorldView } from '../../world'
import { nightAmount } from '../../campaign'
import type { Scenery, StageLook } from '../../story'

export const LOOK: StageLook = {
  sky: '#b8d9d2',
  nightSky: '#1c2a40',
  // The field is 288 × 200 m: fog hides the far edge while hills and landmarks stay readable.
  fog: [50, 230],
  hemi: ['#e8f7f2', '#726442', 2.5],
  sun: ['#ffe8bc', 3.2],
  night: (state) => nightAmount(state.time)
}

export function scenery(scene: THREE.Scene): Scenery {
  const view = new WorldView(scene)
  return {
    update: (state, { underground, underLog }) => view.update(state.time, underground, underLog),
    dispose: () => view.dispose()
  }
}
