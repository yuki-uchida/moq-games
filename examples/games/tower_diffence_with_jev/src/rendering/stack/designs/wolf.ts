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
    density: 2,
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
      // Tapered wolf snout & wet black nose.
      head
        .rawBox([-4, -3, 6], [3, 2, 15], 'mid')
        .rawBox([-3, -2, 15], [2, 1, 17], 'mid')
        .rawBox([-4, 2, 6], [3, 3, 15], 'top')
        .rawBox([-2, 0, 16], [1, 2, 18], 'nose')
      // Fierce high-res glowing amber eyes with dark pupils.
      head.rawBox([-8, 2, 4], [-5, 4, 8], '*eye').rawBox([4, 2, 4], [7, 4, 8], '*eye')
      head.rawBox([-6, 2, 8], [-5, 3, 8], 'pupil').rawBox([4, 2, 8], [5, 3, 8], 'pupil')
      // Tall pointed wolf ears with crisp dark tips & inner ear pink.
      for (const side of [-1, 1]) {
        const bx = side < 0 ? -4.5 : 4.5
        head.segment([bx, 4.2, -1], [bx + side * 0.6, 8.4, -1.2], 1.25, 'ear', 0.45)
        head.segment([bx - side * 0.2, 4.4, 0.0], [bx + side * 0.2, 7.0, -0.3], 0.65, 'earInner', 0.25)
      }

      const jaw = kit.part('jaw', 'head', [0, -2, 3])
      jaw.rawBox([-3, -2, 0], [2, 0, 10], 'under')
      jaw.rawBox([-3, 0, 7], [-3, 1, 9], 'tooth').rawBox([2, 0, 7], [2, 1, 9], 'tooth')
      jaw.rawBox([-2, 0, 2], [1, 0, 7], 'mouth')

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
