import type { StackDesign } from '../StackDesign'
import { quadrupedPose } from './beasts'

/**
 * 黄昏ウルフ — a fierce dusk-slate dire wolf with a broad silver mane, deep indigo back ridge,
 * blazing amber eyes, pointed ears, bared white fangs and a thick dark tail.
 */
export const wolf: StackDesign = {
  type: 'wolf',
  voxel: 2,
  walkDistance: 44,
  portraitCrop: 0.8,
  portraitYaw: -0.5,
  portraitSquash: 0.48,
  portraitFocus: 0.06,
  portraitFocusY: 0.08,
  shadow: [8, 11],
  blueprint: {
    id: 'wolf',
    colors: {
      top: '#2e354d',
      mid: '#526080',
      under: '#23283b',
      ruff: '#b8c5db',
      ruffShade: '#8493b0',
      nose: '#17141f',
      '*eye': '#ffb82e',
      pupil: '#1c0f12',
      mouth: '#781929',
      tooth: '#ffffff',
      paw: '#222638',
      ear: '#3a425e',
      earInner: '#8a4a63',
      tip: '#cbd5e8'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 8, 0])
      // Broader muscular shoulders & chest so front & back views never collapse into a narrow bar.
      body.fill([-8, -3, -8], [7, 4, 7], 'mid', (x, y, z) => Math.hypot(x / 6.6, (y - 0.5) / 4.1, z / 8.2) <= 1)
      body.paint((x, y) => (y >= 2 ? 'top' : y <= -2 ? 'under' : undefined))
      // Thick silver mane ruff framing the broad shoulders.
      body.fill([-8, -3, 2], [7, 5, 8], 'ruff', (x, y, z) => Math.hypot(x / 6.8, (y - 1) / 4.5, (z - 5) / 3.2) <= 1)
      body.paint((x, y, z) => (z > 2 && y <= -1 && Math.abs(x) > 2 ? 'ruffShade' : undefined))

      const head = kit.part('head', 'body', [0, 3.5, 8])
      head.fill([-6, -3, -3], [5, 4, 4], 'mid', (x, y, z) => Math.hypot(x / 5.0, y / 3.6, (z - 0.5) / 3.6) <= 1)
      head.paint((x, y) => (y >= 2 ? 'top' : undefined))
      // Cheek fur tufts for unmistakable wolf width from the front and back.
      head.box([-6, -2, -1], [-5, 0, 2], 'ruff').box([4, -2, -1], [5, 0, 2], 'ruff')
      // Long wolf snout & black nose.
      head.box([-2, -2, 3], [1, 1, 8], 'mid').box([-2, 1, 3], [1, 1, 7], 'top').box([-1, 0, 8], [0, 1, 8], 'nose')
      // Bold blazing amber eyes visible from front and 3/4 profile.
      head.box([-4, 1, 2], [-3, 2, 4], '*eye').box([2, 1, 2], [3, 2, 4], '*eye')
      head.set(-3, 1, 4, 'pupil').set(2, 1, 4, 'pupil')
      // Tall pointed wolf ears.
      for (const [x, innerX] of [
        [-5, -4],
        [4, 4]
      ] as const) {
        head.box([x, 4, -2], [x + 1, 7, 0], 'ear').set(x, 8, -1, 'top')
        head.box([innerX, 4, 0], [innerX, 6, 0], 'earInner')
      }

      const jaw = kit.part('jaw', 'head', [0, -2, 3])
      jaw.box([-2, -1, 0], [1, 0, 5], 'under')
      jaw.set(-2, 0, 4, 'tooth').set(1, 0, 4, 'tooth').box([-1, 0, 1], [0, 0, 3], 'mouth')

      for (const [name, x, z] of [
        ['legFL', 3, 4],
        ['legFR', -3, 4],
        ['legBL', 3, -5],
        ['legBR', -3, -5]
      ] as const) {
        const leg = kit.part(name, 'body', [x, -1, z])
        leg.box([-1, -7, -1], [1, 0, 1], 'mid').box([-1, -7, -1], [1, -6, 2], 'paw')
      }

      const tail = kit.part('tail', 'body', [0, 2, -7.5])
      // Carry the tail back and slightly down so front/back views never read as a vertical antenna.
      tail
        .segment([0, 0, 0], [3, -1.5, -8.5], 2.1, 'top', 1.6)
        .segment([3, -1.5, -8.5], [4, -3, -11], 1.5, 'tip', 0.7)
    }
  },
  pose: (input) => quadrupedPose(input, { stride: 0.85, bob: 1.1, lunge: 6.5 })
}
