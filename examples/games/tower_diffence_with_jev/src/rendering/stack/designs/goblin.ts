import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * いたずらゴブリン — a scrawny prankster with huge drooping ears, a patched burlap hood, a
 * toothy grin, a stolen bent kitchen knife and a lumpy loot sack on the back.
 */
export const goblin: StackDesign = {
  type: 'goblin',
  voxel: 2,
  walkDistance: 28,
  shadow: [7, 6],
  blueprint: {
    id: 'goblin',
    colors: {
      skin: '#a8bb69',
      skinDark: '#7f9447',
      eye: '#f6e35a',
      pupil: '#2a1c0c',
      tooth: '#fff8e6',
      mouth: '#3b2416',
      hood: '#9b7a4f',
      patch: '#c95a48',
      patch2: '#5c7fa8',
      rags: '#6f5638',
      sack: '#c8ad78',
      rope: '#6a4b2b',
      knife: '#c9d1d6',
      handle: '#5a3a22',
      foot: '#7f9447'
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
        { legs: 4, torsoHalf: 3, torsoHeight: 6, headRadius: 4.6, armLength: 7 }
      )
      // Wide grin, yellow eyes with pinprick pupils.
      for (const x of [-3, -2, 1, 2]) b.head.face(x, 4, 'eye').face(x, 3, 'eye')
      b.head.face(-2, 3, 'pupil').face(1, 3, 'pupil')
      for (const x of [-3, -2, -1, 0, 1, 2]) b.head.face(x, 1, 'mouth')
      b.head.face(-2, 1, 'tooth').face(1, 1, 'tooth')
      b.head.box([-1, 2, 5], [0, 3, 5], 'skinDark')
      // Big drooping ears.
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -5 : 4
        b.head.segment([x0 + 0.5, 4.5, 0], [x0 + side * 6 + 0.5, 3, -2], 1.3, 'skin', 0.5)
        b.head.segment([x0 + side * 1 + 0.5, 4.5, 0.5], [x0 + side * 5 + 0.5, 3.2, -1.2], 0.6, 'skinDark')
      }
      // Patched hood over the crown.
      b.head.fill(
        [-6, 5, -6],
        [5, 10, 5],
        'hood',
        (x, y, z) => Math.hypot(x / 4.9, (y - 5) / 4.8, z / 4.7) <= 1 && !(z > 2.5 && y < 6.5)
      )
      b.head.box([1, 8, 2], [2, 8, 3], 'patch').box([-3, 7, -4], [-2, 8, -4], 'patch2')
      b.head.segment([0, 9, -3], [0, 8, -7], 1, 'hood', 0.4)
      // Loot sack on the back.
      b.torso
        .ellipsoid([0, 5, -5], [3.4, 3.6, 2.6], 'sack')
        .box([-1, 8, -5], [0, 8, -4], 'rope')
        .box([-3, 3, -3], [2, 3, -3], 'rope')
      b.hips.box([-3, -2, -2], [2, 0, 2], 'rags')
      // Bent knife.
      const knife = kit.part('weapon', 'armR', [0, b.hand, 0])
      knife.box([0, 0, -1], [0, 0, 1], 'handle').box([0, 0, 2], [0, 1, 5], 'knife').box([0, 1, 6], [0, 1, 7], 'knife')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'stab', stride: 0.7, bob: 1.1 })
    pose.torso = { ...pose.torso, rx: (pose.torso?.rx ?? 0) + 0.16 }
    return pose
  }
}
