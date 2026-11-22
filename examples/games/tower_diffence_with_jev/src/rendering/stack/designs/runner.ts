import { bipedPose, TAU, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 槍の斥候 — a tall, agile scout with long striding legs, bold streaming crimson scarf,
 * bright ivory headband over spiky hair, and a sleek tapered steel-tipped spear held diagonally.
 */
export const runner: StackDesign = {
  type: 'runner',
  voxel: 2,
  walkDistance: 34,
  portraitCrop: 0.6,
  portraitYaw: -0.35,
  shadow: [7, 6],
  blueprint: {
    id: 'runner',
    colors: {
      skin: '#f7c192',
      eye: '#241810',
      shine: '#ffffff',
      cheek: '#eb7d6a',
      jerkin: '#f5b33d',
      jerkinDark: '#bd7218',
      scarf: '#eb3131',
      scarfDark: '#a61722',
      hair: '#3a2214',
      band: '#fff6de',
      pants: '#45485e',
      boot: '#30231c',
      shaft: '#9e622c',
      blade: '#f2f9ff',
      bladeDark: '#8ea8bf'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          brow: 'hair',
          legs: 'pants',
          boots: 'boot',
          torso: 'jerkin',
          torsoTrim: 'jerkinDark',
          belt: 'jerkinDark',
          sleeve: 'jerkin',
          hands: 'skin'
        },
        { torsoHalf: 3, torsoDepth: 3, legs: 8, armLength: 7 }
      )
      b.head.paint((x, y, z) => (y >= 6 && z < 3 ? 'hair' : undefined))
      for (const [x, z] of [
        [-3, -2],
        [-1, -3],
        [1, -3],
        [2, -1],
        [0, 0],
        [-2, 1]
      ])
        b.head.box([x, 9, z], [x + 1, 11, z + 1], 'hair')
      b.head.fill([-6, 6, -6], [5, 7, 5], 'band', (x, y, z) => {
        const d = Math.hypot(x / 5.0, z / 4.8)
        return d <= 1.04 && d > 0.72
      })
      b.head.box([-1, 6, -6], [0, 7, -5], 'band').box([-1, 5, -8], [0, 6, -6], 'band')
      // Bold crimson scarf collar + long dramatic streaming scarf tail.
      b.torso.fill([-5, 5, -4], [4, 7, 4], 'scarf', (x, y, z) => Math.hypot(x / 3.9, z / 3.4) <= 1.15)
      const cape = kit.part('cape', 'torso', [1, 6.5, -3])
      cape.box([-1, -1, -7], [1, 0, -1], 'scarf').box([-1, -2, -9], [1, -1, -7], 'scarfDark')
      // Sleek tapered spear held firmly in right fist (sharp tapered point, not a blocky sock).
      const spear = kit.part('weapon', 'armR', [0, b.hand, 1])
      spear
        .box([0, 0, -7], [1, 1, 12], 'shaft')
        .box([-1, 0, 11], [2, 1, 12], 'scarf')
        .box([0, 0, 13], [1, 1, 15], 'bladeDark')
        .box([0, 0, 16], [1, 1, 17], 'blade')
        .box([0, 0, 18], [0, 1, 19], 'blade')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'thrust', stride: 0.8, bob: 1.1 })
    if (input.motion === 'idle') {
      pose.torso = { ...pose.torso, rx: 0.1 }
      pose.armR = { ...pose.armR, rx: -0.4 }
      pose.weapon = { rx: -0.35 }
    }
    if (input.motion === 'walk') pose.cape = { rx: 0.95 + 0.15 * Math.sin(input.cycle * TAU * 2) }
    return pose
  }
}
