import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * いたずらゴブリン — a hunched, wide-eared prankster in dark plum-crimson patched rags so it
 * separates cleanly from meadow grass and never blends into allied archers or soldiers.
 */
export const goblin: StackDesign = {
  type: 'goblin',
  voxel: 2,
  walkDistance: 28,
  portraitCrop: 0.68,
  portraitYaw: -0.35,
  shadow: [7, 6],
  blueprint: {
    id: 'goblin',
    colors: {
      skin: '#7ebf3d',
      skinDark: '#4f8522',
      '*eye': '#ffb824',
      pupil: '#1c0f08',
      tooth: '#fffbf0',
      mouth: '#3d151c',
      hood: '#632842',
      hoodDark: '#3f1729',
      patch: '#e04234',
      patch2: '#f2b838',
      rags: '#4a2134',
      sack: '#d4a657',
      rope: '#5c381c',
      knife: '#e4edf5',
      handle: '#4d2b18',
      foot: '#45751e'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'pupil',
          legs: 'skinDark',
          boots: 'foot',
          torso: 'rags',
          belt: 'rope',
          sleeve: 'skin',
          hands: 'skin'
        },
        { legs: 3, torsoHalf: 3, torsoDepth: 3, torsoHeight: 5, headRadius: 4.5, armLength: 6, coveredSides: true }
      )
      // Menacing glowing amber eyes + wide toothy grin + big hooked nose.
      for (const x of [-3, -2, 1, 2]) b.head.face(x, 4, '*eye').face(x, 3, '*eye')
      b.head.face(-2, 3, 'pupil').face(1, 3, 'pupil')
      for (const x of [-3, -2, -1, 0, 1, 2]) b.head.face(x, 1, 'mouth')
      b.head.face(-2, 1, 'tooth').face(1, 1, 'tooth')
      b.head.box([-1, 2, 5], [0, 3, 6], 'skinDark')
      // Enormous pointed goblin ears jutting far beyond head width.
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -4.5 : 3.5
        b.head.segment([x0, 4.5, 0], [x0 + side * 7.5, 5.2, -1.5], 1.5, 'skin', 0.6)
        b.head.segment([x0 + side * 1, 4.3, 0.8], [x0 + side * 6, 4.8, -0.8], 0.7, 'skinDark')
      }
      // Dark plum-burgundy patched hood swept back so the face and giant ears dominate.
      b.head.fill(
        [-5, 5, -6],
        [4, 10, 4],
        'hood',
        (x, y, z) => Math.hypot(x / 4.7, (y - 5.2) / 4.5, (z + 0.6) / 4.6) <= 1 && !(z > 1.8 && y < 7.2)
      )
      b.head.box([1, 8, 1], [2, 8, 2], 'patch').box([-3, 7, -4], [-2, 8, -4], 'patch2')
      b.head.segment([0, 9, -3], [0, 7.5, -8], 1.2, 'hoodDark', 0.5)
      // Bulging loot sack on the back & clean front-only loincloth flap (never bleeding onto rear).
      b.torso
        .ellipsoid([0, 4.5, -5.5], [3.6, 3.8, 2.8], 'sack')
        .box([-1, 8, -5], [0, 8, -4], 'rope')
        .box([-3, 2, -4], [2, 2, -4], 'rope')
      b.hips.box([-3, -2, 1], [2, 0, 3], 'rags')
      // Curved bent dagger gripped solidly in the hand.
      const knife = kit.part('weapon', 'armR', [0, b.hand, 0])
      knife
        .box([0, 0, -1], [1, 1, 1], 'handle')
        .box([0, 0, 2], [1, 1, 5], 'knife')
        .box([0, 1, 5], [1, 2, 8], 'knife')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'stab', stride: 0.75, bob: 1.2, armSpread: 0.08 })
    pose.torso = { ...pose.torso, rx: (pose.torso?.rx ?? 0) + 0.28 }
    pose.head = { ...pose.head, rx: (pose.head?.rx ?? 0) - 0.18 }
    if (input.motion === 'idle') {
      // Natural crouched sneaky guard (eliminates T-pose horizontal arms!).
      pose.armL = { rx: -0.32, rz: 0.08 }
      pose.armR = { rx: -0.48, rz: -0.1 }
    }
    return pose
  }
}
