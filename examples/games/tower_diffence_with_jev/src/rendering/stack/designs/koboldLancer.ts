import { bipedPose, TAU, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 琥珀の槍コボルト — a scrappy dog-snouted kobold in a dented pot helmet and scale vest, a
 * curling tail, a round wooden targe on its arm and a lance tipped with a big amber stone.
 */
export const koboldLancer: StackDesign = {
  type: 'koboldLancer',
  voxel: 2,
  walkDistance: 28,
  shadow: [7, 6],
  blueprint: {
    id: 'koboldLancer',
    colors: {
      fur: '#c47a38',
      furLight: '#f7d59e',
      nose: '#24140d',
      eye: '#17100c',
      shine: '#ffffff',
      pot: '#8c99a8',
      potDark: '#535e6b',
      vest: '#8a5822',
      scale: '#c98a2c',
      wood: '#9c5e28',
      rim: '#566270',
      shaft: '#734620',
      '*amber': '#ffaa1c',
      amberDark: '#d97e1c'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'fur',
          eye: 'eye',
          shine: 'shine',
          legs: 'fur',
          boots: 'nose',
          torso: 'vest',
          belt: 'scale',
          sleeve: 'fur',
          hands: 'fur'
        },
        { legs: 5, torsoHalf: 3, torsoHeight: 6, headRadius: 4, armLength: 6 }
      )
      // Muzzle, ears and a pot helmet.
      b.head.box([-2, 1, 3], [1, 3, 6], 'furLight').box([-1, 3, 6], [0, 3, 6], 'nose')
      b.head.box([-4, 6, -1], [-3, 9, 0], 'fur').box([2, 6, -1], [3, 9, 0], 'fur')
      b.head.fill([-5, 6, -5], [4, 9, 4], 'pot', (x, y, z) => Math.hypot(x / 4.6, (y - 6) / 3.4, z / 4.4) <= 1)
      b.head.fill([-6, 6, -6], [5, 6, 5], 'potDark', (x, y, z) => Math.hypot(x / 5.3, z / 5.1) <= 1)
      b.head.set(2, 8, 2, 'potDark')
      // Scale vest pattern.
      b.torso.paint((x, y, z) => ((x + y) % 2 === 0 && z > 0 ? 'scale' : undefined))
      // Curly tail.
      const tail = kit.part('tail', 'hips', [0, 0, -2.5])
      tail.segment([0, 0, 0], [0, 2, -4], 1.2, 'fur').segment([0, 2, -4], [0, 5, -3], 1, 'furLight')
      // Round targe on the left arm.
      const targe = kit.part('offhand', 'armL', [1.5, -4, 0.5])
      targe.fill([0, -4, -4], [1, 4, 4], 'wood', (x, y, z) => Math.hypot(y, z) <= 3.6)
      targe.paint((x, y, z) =>
        Math.hypot(y + 0.5, z + 0.5) > 2.8 ? 'rim' : Math.hypot(y + 0.5, z + 0.5) < 1 ? '*amber' : undefined
      )
      // Lance with a chunky 2px shaft and bold amber tip.
      const lance = kit.part('weapon', 'armR', [0, b.hand, 0])
      lance.box([0, 0, -8], [1, 1, 16], 'shaft').box([-1, -1, 4], [1, 1, 5], 'rim')
      lance.ellipsoid([0.5, 0.5, 18.5], [1.6, 1.6, 2.8], '*amber').box([0, 0, 21], [1, 1, 22], 'amberDark')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'thrust', stride: 0.6, bob: 0.9 })
    pose.tail = { ry: Math.sin(input.time * 6 + input.seed * TAU) * 0.4 }
    return pose
  }
}
