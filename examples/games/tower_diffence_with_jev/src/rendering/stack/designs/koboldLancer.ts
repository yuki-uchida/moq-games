import { bipedPose, TAU, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 琥珀の槍コボルト — a hunched, dog-snouted kobold with a long protruding muzzle, tall canine
 * ears under a dented iron pot helmet, a wagging curly tail, studded targe and amber-tipped lance.
 */
export const koboldLancer: StackDesign = {
  type: 'koboldLancer',
  voxel: 2,
  walkDistance: 28,
  portraitCrop: 0.64,
  portraitYaw: -0.42,
  portraitFocusY: 0.08,
  shadow: [7, 6],
  blueprint: {
    id: 'koboldLancer',
    colors: {
      fur: '#b86c32',
      furLight: '#f0ca92',
      nose: '#21120c',
      '*eye': '#ffb82e',
      pupil: '#170f0a',
      pot: '#788596',
      potDark: '#47515e',
      vest: '#5e391b',
      scale: '#bf7d26',
      wood: '#8f5222',
      rim: '#4b5666',
      shaft: '#663c1b',
      '*amber': '#ffaa1c',
      amberDark: '#cc6f14'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'fur',
          eye: 'pupil',
          legs: 'fur',
          boots: 'nose',
          torso: 'vest',
          belt: 'scale',
          sleeve: 'fur',
          hands: 'fur'
        },
        { legs: 4, torsoHalf: 3, torsoDepth: 3, torsoHeight: 6, headRadius: 4.1, armLength: 6, coveredSides: true }
      )
      // Glowing amber canine eyes + prominent protruding snout so profile never resembles human runner.
      for (const x of [-3, -2, 1, 2]) b.head.face(x, 3, '*eye').face(x, 4, '*eye')
      b.head.face(-2, 3, 'pupil').face(1, 3, 'pupil')
      // Wider front-facing eyes and a low nose tip so the pot-helmet face reads head-on.
      b.head.face(-3, 3, '*eye').face(-3, 4, '*eye').face(2, 3, '*eye').face(2, 4, '*eye')
      b.head.box([-2, 1, 3], [1, 3, 8], 'furLight').box([-1, 1, 7], [0, 2, 8], 'nose')
      // Big pointed canine ears sticking out above & beside the pot helmet.
      b.head.box([-5, 6, -1], [-3, 10, 0], 'fur').box([2, 6, -1], [4, 10, 0], 'fur')
      b.head.fill([-5, 6, -5], [4, 9, 4], 'pot', (x, y, z) => Math.hypot(x / 4.7, (y - 6) / 3.4, z / 4.5) <= 1)
      b.head.fill([-6, 6, -6], [5, 6, 5], 'potDark', (x, y, z) => Math.hypot(x / 5.4, z / 5.2) <= 1)
      b.head.box([2, 8, 1], [3, 8, 2], 'potDark')
      // Clean leather & bronze chest band (no checkerboard noise).
      b.torso.box([-3, 3, 4], [2, 4, 4], 'scale')
      // Prominent curly tail sticking out behind in profile.
      const tail = kit.part('tail', 'hips', [0, 0.5, -3])
      tail.segment([0, 0, 0], [0, 2.5, -5.5], 1.4, 'fur').segment([0, 2.5, -5.5], [0, 6.5, -4], 1.1, 'furLight')
      // Round wooden targe on the left arm.
      const targe = kit.part('offhand', 'armL', [1.5, -4, 0.5])
      targe.fill([0, -4, -4], [1, 4, 4], 'wood', (x, y, z) => Math.hypot(y, z) <= 3.7)
      targe.paint((x, y, z) =>
        Math.hypot(y + 0.5, z + 0.5) > 2.8 ? 'rim' : Math.hypot(y + 0.5, z + 0.5) < 1.1 ? '*amber' : undefined
      )
      // Heavy lance with glowing amber crystal head.
      const lance = kit.part('weapon', 'armR', [0, b.hand, 0])
      lance.box([0, 0, -7], [1, 1, 15], 'shaft').box([-1, -1, 4], [1, 1, 5], 'rim')
      lance.ellipsoid([0.5, 0.5, 17.5], [1.8, 1.8, 3.0], '*amber').box([0, 0, 20], [1, 1, 21], 'amberDark')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'thrust', stride: 0.65, bob: 0.95 })
    pose.torso = { ...pose.torso, rx: (pose.torso?.rx ?? 0) + 0.22 }
    pose.head = { ...pose.head, rx: (pose.head?.rx ?? 0) - 0.14 }
    pose.tail = { ry: Math.sin(input.time * 6 + input.seed * TAU) * 0.45 }
    return pose
  }
}
