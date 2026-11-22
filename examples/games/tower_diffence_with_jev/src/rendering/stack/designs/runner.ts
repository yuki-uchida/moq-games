import { bipedPose, TAU, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 槍の斥候 — a light scout: amber jerkin, a long red scarf that streams behind when running,
 * a cloth headband over spiky hair and a slim leaf-bladed spear.
 */
export const runner: StackDesign = {
  type: 'runner',
  voxel: 2,
  walkDistance: 34,
  shadow: [7, 6],
  blueprint: {
    id: 'runner',
    colors: {
      skin: '#e9b98c',
      eye: '#2a2118',
      shine: '#ffffff',
      cheek: '#dc8c72',
      jerkin: '#f0be72',
      jerkinDark: '#c98f45',
      scarf: '#d8553a',
      scarfDark: '#a83a28',
      hair: '#3c2a1d',
      band: '#f6ead0',
      pants: '#6a5a46',
      boot: '#4a3626',
      shaft: '#9c6b3c',
      blade: '#e6eef2',
      bladeDark: '#9fb0bb'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          legs: 'pants',
          boots: 'boot',
          torso: 'jerkin',
          torsoTrim: 'jerkinDark',
          belt: 'jerkinDark',
          sleeve: 'jerkin',
          hands: 'skin'
        },
        { torsoHalf: 3, legs: 7 }
      )
      // Spiky hair under a headband with tails.
      b.head.paint((x, y, z) => (y >= 6 && z < 3 ? 'hair' : undefined))
      for (const [x, z] of [
        [-3, -2],
        [-1, -3],
        [1, -3],
        [2, -1],
        [0, 0],
        [-2, 1]
      ])
        b.head.box([x, 9, z], [x + 1, 10, z + 1], 'hair')
      b.head.fill([-6, 6, -6], [5, 6, 5], 'band', (x, y, z) => {
        const d = Math.hypot(x / 4.8, z / 4.6)
        return d <= 1.02 && d > 0.7
      })
      b.head.box([-1, 6, -6], [0, 6, -5], 'band').box([-1, 5, -7], [-1, 5, -6], 'band')
      // Scarf around the neck and a streaming tail.
      b.torso.fill([-5, 6, -4], [4, 7, 4], 'scarf', (x, y, z) => Math.hypot(x / 3.6, z / 2.8) <= 1.15)
      const cape = kit.part('cape', 'torso', [1, 6.5, -2.5])
      cape.box([0, -1, -6], [1, 0, -1], 'scarf').box([0, -1, -7], [1, -1, -6], 'scarfDark')
      // Spear: shaft through the right hand, leaf blade forward.
      const spear = kit.part('weapon', 'armR', [0, b.hand, 0])
      spear
        .box([0, 0, -6], [0, 0, 13], 'shaft')
        .box([-1, 0, 14], [1, 0, 16], 'blade')
        .box([0, 0, 17], [0, 0, 18], 'blade')
        .box([0, 1, 14], [0, 1, 16], 'bladeDark')
        .box([-1, 0, 12], [1, 0, 12], 'scarf')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'thrust', stride: 0.75, bob: 1.1 })
    if (input.motion === 'walk') pose.cape = { rx: 0.9 + 0.15 * Math.sin(input.cycle * TAU * 2) }
    return pose
  }
}
