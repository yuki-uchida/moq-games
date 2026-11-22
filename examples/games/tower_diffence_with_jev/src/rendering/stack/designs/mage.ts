import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 星の魔法使い — a young stargazer in a night-violet robe scattered with gold stars, a huge
 * pointed hat whose tip droops forward, and a crook staff holding a glowing star.
 */
export const mage: StackDesign = {
  type: 'mage',
  voxel: 2,
  walkDistance: 28,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0.5, 1.5, 15.5] },
  blueprint: {
    id: 'mage',
    colors: {
      skin: '#ffd4b0',
      eye: '#211638',
      shine: '#ffffff',
      cheek: '#f28b99',
      robe: '#6f3ec7',
      robeDark: '#47238a',
      trim: '#d28ef7',
      star: '#ffd93b',
      hat: '#4d2899',
      hatBand: '#e08ef7',
      hair: '#ffefc2',
      shoe: '#2d1c47',
      wood: '#995c2e',
      '*glow': '#fff494',
      '*glowCore': '#ffcf24'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          legs: 'robeDark',
          boots: 'shoe',
          torso: 'robe',
          torsoTrim: 'trim',
          belt: 'trim',
          sleeve: 'robe',
          hands: 'skin'
        },
        { robe: true, legs: 5 }
      )
      b.head.paint((x, y, z) => (y >= 5 && z < 2 ? 'hair' : undefined))
      // Wide brim, a band, and a tall cone that bends forward at the tip.
      b.head.fill([-8, 7, -8], [7, 7, 7], 'hat', (x, y, z) => Math.hypot(x, z) <= 7.4)
      b.head.fill([-5, 8, -5], [4, 8, 4], 'hatBand', (x, y, z) => Math.hypot(x, z) <= 4.9)
      for (let y = 9; y <= 16; y++) {
        const r = 4.6 * (1 - (y - 9) / 9)
        const lean = Math.max(0, y - 12) * 0.9
        b.head.fill([-6, y, -6], [5, y, 9], 'hat', (x, yy, z) => Math.hypot(x, z - lean) <= Math.max(0.7, r))
      }
      b.head.box([-1, 16, 5], [0, 16, 7], 'hat').box([-1, 15, 8], [0, 15, 8], 'star')
      // Gold stars on the robe.
      for (const [x, y] of [
        [-3, 2],
        [2, 4],
        [-1, 5],
        [1, 1]
      ])
        b.torso.set(x, y, 3, 'star')
      for (const [x, y, z] of [
        [-5, -2, 2],
        [4, -1, 3],
        [1, -3, 4]
      ])
        b.hips.set(x, y, z, 'star')
      // Crook staff with a chunky 2px shaft and glowing star.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 0])
      staff.box([0, 0, -3], [1, 1, 12], 'wood').box([0, 1, 12], [1, 2, 13], 'wood')
      staff.ellipsoid([0.5, 1.5, 15.5], [1.6, 1.6, 1.6], '*glow')
      staff
        .box([-2, 1, 15], [2, 1, 15], '*glow')
        .box([0, -1, 15], [0, 3, 15], '*glow')
        .box([0, 1, 13], [0, 1, 17], '*glow')
      staff.set(0, 1, 15, '*glowCore')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'cast', stride: 0.4, bob: 0.6 })
}
