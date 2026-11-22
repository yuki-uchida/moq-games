import type { StackDesign } from '../StackDesign'
import { quadrupedPose } from './beasts'

/**
 * 夕焼けウルフ — a lean runner whose coat fades from sunset orange on the back to dusk violet
 * underneath, with a cream mane ruff, sharp ears and a brushy tail tipped in ember gold.
 */
export const wolf: StackDesign = {
  type: 'wolf',
  voxel: 2,
  walkDistance: 44,
  portraitCrop: 1,
  shadow: [7, 10],
  blueprint: {
    id: 'wolf',
    colors: {
      top: '#f07832',
      mid: '#d48252',
      under: '#684487',
      ruff: '#ffebc7',
      nose: '#21151a',
      eye: '#ffe047',
      pupil: '#21151a',
      mouth: '#6b1c2e',
      tooth: '#ffffff',
      paw: '#4d305c',
      ear: '#b54c28',
      tip: '#ffd24a'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 8, 0])
      body.fill([-4, -3, -8], [3, 4, 7], 'mid', (x, y, z) => Math.hypot(x / 3.6, (y - 0.5) / 3.4, z / 8) <= 1)
      body.paint((x, y) => (y >= 2 ? 'top' : y <= -1 ? 'under' : undefined))
      body.fill([-5, -3, 3], [4, 5, 8], 'ruff', (x, y, z) => Math.hypot(x / 4.2, (y - 1) / 4, (z - 5) / 2.6) <= 1)
      const head = kit.part('head', 'body', [0, 3, 8])
      head.fill([-4, -3, -2], [3, 3, 4], 'mid', (x, y, z) => Math.hypot(x / 3.3, y / 3, (z - 1) / 3.4) <= 1)
      head.paint((x, y) => (y >= 1 ? 'top' : undefined))
      head.box([-2, -2, 3], [1, 0, 7], 'mid').box([-2, 0, 3], [1, 0, 6], 'top').box([-1, 0, 7], [0, 0, 7], 'nose')
      for (const x of [-3, 2]) head.face(x, 1, 'eye')
      head.set(-3, 1, 3, 'pupil').set(2, 1, 3, 'pupil')
      for (const x of [-3, 2]) head.box([x, 3, -1], [x + 1, 6, 0], 'ear').set(x, 7, -1, 'top')
      const jaw = kit.part('jaw', 'head', [0, -2, 3])
      jaw.box([-2, -1, 0], [1, 0, 4], 'under').box([-2, 0, 3], [1, 0, 3], 'tooth').box([-1, 0, 1], [0, 0, 2], 'mouth')
      for (const [name, x, z] of [
        ['legFL', 2, 4],
        ['legFR', -2, 4],
        ['legBL', 2, -5],
        ['legBR', -2, -5]
      ] as const) {
        const leg = kit.part(name, 'body', [x, -1, z])
        leg.box([-1, -7, -1], [0, 0, 0], 'mid').box([-1, -7, -1], [0, -6, 1], 'paw')
      }
      const tail = kit.part('tail', 'body', [0, 2, -7])
      tail.segment([0, 0, 0], [0, 2, -8], 1.8, 'mid', 1.4).segment([0, 2, -8], [0, 2.5, -10], 1.3, 'tip', 0.6)
    }
  },
  pose: (input) => quadrupedPose(input, { stride: 0.8, bob: 1, lunge: 6 })
}
