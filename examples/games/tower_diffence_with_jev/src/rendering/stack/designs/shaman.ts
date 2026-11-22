import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * きのこメイジ — a little mushroom sorcerer: an enormous spotted orchid cap for a head, a
 * frilled gill ring, a moss shawl and a twisted root staff holding a glowing spore bulb.
 */
export const shaman: StackDesign = {
  type: 'shaman',
  voxel: 2,
  walkDistance: 26,
  shadow: [8, 7],
  emitter: { part: 'weapon', at: [0.5, 1.5, 14.5] },
  blueprint: {
    id: 'shaman',
    colors: {
      stem: '#f2e4cc',
      stemShade: '#d9c5a3',
      cap: '#ca83bd',
      capDark: '#9c5a92',
      spot: '#fff4f8',
      gill: '#e9c9d8',
      eye: '#2b1a2e',
      moss: '#6f9a4a',
      mossDark: '#4f7536',
      root: '#6d4c35',
      foot: '#c9b48e',
      '*spore': '#d6ff8a',
      '*sporeCore': '#ffffff'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'stem',
          eye: 'eye',
          legs: 'stemShade',
          boots: 'foot',
          torso: 'moss',
          torsoTrim: 'mossDark',
          belt: 'mossDark',
          sleeve: 'stem',
          hands: 'stem'
        },
        { legs: 4, torsoHalf: 3, torsoHeight: 5, headRadius: 3.6, armLength: 6, eyeRow: 2 }
      )
      // The giant cap sits above the stem-face.
      const cap = b.head
      cap.fill([-9, 4, -9], [8, 10, 8], 'cap', (x, y, z) => {
        const r = 8.2 * Math.sqrt(Math.max(0, 1 - ((y - 4) / 6.4) ** 2))
        return Math.hypot(x, z) <= r
      })
      cap.fill([-9, 4, -9], [8, 4, 8], 'gill', (x, y, z) => Math.hypot(x, z) <= 8.2 && Math.hypot(x, z) > 3.6)
      cap.paint((x, y, z) => (y === 4 && Math.hypot(x + 0.5, z + 0.5) > 7.4 ? 'capDark' : undefined))
      for (const [x, y, z] of [
        [-4, 9, 1],
        [2, 9, -3],
        [4, 7, 4],
        [-6, 6, -3],
        [0, 10, -1],
        [-2, 8, 5],
        [5, 7, -5],
        [-5, 8, -5]
      ])
        cap.box([x, y, z], [x + 1, y, z + 1], 'spot')
      // Moss shawl.
      b.torso.fill([-5, 3, -4], [4, 5, 4], 'moss', (x, y, z) => Math.hypot(x / 4.4, z / 3.2) <= 1)
      // Twisted root staff with a glowing spore bulb.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 0])
      for (let z = -3; z <= 12; z++) staff.set(Math.round(Math.sin(z * 0.8) * 0.6), 0, z, 'root')
      staff.ellipsoid([0.5, 1.5, 14.5], [2, 2, 2], '*spore').set(0, 1, 14, '*sporeCore')
      staff.box([1, 0, 11], [2, 0, 12], 'root')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'cast', stride: 0.55, bob: 0.9 })
}
