import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 星の魔法使い — a stargazer mage in a starry violet robe, wide pointed witch hat tilted
 * slightly back so expressive eyes & rosy cheeks shine clearly, and a crook staff with a glowing star.
 */
export const mage: StackDesign = {
  type: 'mage',
  voxel: 2,
  walkDistance: 28,
  portraitCrop: 0.62,
  portraitYaw: -0.28,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0.5, 1.5, 15.5] },
  blueprint: {
    id: 'mage',
    colors: {
      skin: '#ffd4b0',
      eye: '#211638',
      shine: '#ffffff',
      cheek: '#f28b99',
      robe: '#6a38c9',
      robeDark: '#441f87',
      trim: '#d996ff',
      star: '#ffd93b',
      hat: '#4a2399',
      hatBand: '#ffd93b',
      hair: '#ffefc2',
      hairShade: '#d9bd84',
      hairLight: '#fffbe2',
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
          brow: 'robeDark',
          legs: 'robeDark',
          boots: 'shoe',
          torso: 'robe',
          torsoTrim: 'trim',
          belt: 'trim',
          sleeve: 'robeDark',
          hands: 'skin'
        },
        { robe: true, robeFlare: 1.0, robePleat: 'robeDark', legs: 5, headRadius: 4.8, eyeRow: 3 }
      )
      // Full golden-blonde hair down the back of the head (zero bald flesh rectangle in rear views!).
      b.head.paint((x, y, z) =>
        z < 1 && y >= 0
          ? y < 3
            ? 'hairShade'
            : x % 3 === 0
              ? 'hairLight'
              : 'hair'
          : y >= 6 && z < 3
            ? 'hairLight'
            : undefined
      )
      b.head.box([-4, 0, -5], [3, 5, -4], 'hair')
      // Wide brim raised at y=8 and shifted slightly back (-z) so eyes & cheeks are NEVER covered!
      b.head.fill([-8, 8, -9], [7, 8, 5], 'hat', (x, y, z) => Math.hypot(x / 7.6, (z + 1.5) / 6.8) <= 1)
      b.head.fill([-5, 9, -6], [4, 9, 3], 'hatBand', (x, y, z) => Math.hypot(x, z + 1.2) <= 4.9)
      for (let y = 10; y <= 17; y++) {
        const r = 4.6 * (1 - (y - 10) / 9)
        const lean = Math.max(0, y - 13) * 0.85
        b.head.fill([-6, y, -7], [5, y, 8], 'hat', (x, yy, z) => Math.hypot(x, z + 1.2 - lean) <= Math.max(0.8, r))
      }
      b.head.box([-1, 17, 4], [0, 17, 6], 'hat').box([-1, 16, 7], [0, 16, 7], '*glow')
      // Bright gold stars on the starry robe.
      for (const [x, y] of [
        [-3, 2],
        [2, 4],
        [-1, 5],
        [1, 1]
      ])
        b.torso.set(x, y, 4, 'star')
      for (const [x, y, z] of [
        [-5, -2, 3],
        [4, -1, 4],
        [1, -3, 5]
      ])
        b.hips.set(x, y, z, 'star')
      // Chunky 2px crook staff with a blazing star.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 1])
      staff.box([0, 0, -3], [1, 1, 12], 'wood').box([0, 1, 12], [1, 2, 13], 'wood')
      staff.ellipsoid([0.5, 1.5, 15.5], [1.8, 1.8, 1.8], '*glow')
      staff
        .box([-2, 1, 15], [2, 1, 15], '*glow')
        .box([0, -1, 15], [0, 3, 15], '*glow')
        .box([0, 1, 13], [0, 1, 17], '*glow')
      staff.set(0, 1, 15, '*glowCore')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'cast', stride: 0.4, bob: 0.6, ready: -0.6 })
}
