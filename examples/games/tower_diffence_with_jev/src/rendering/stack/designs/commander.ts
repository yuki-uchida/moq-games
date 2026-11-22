import { bipedPose, track, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * Jev指揮官 — the monster army's marshal: a stout imp in a long crimson greatcoat with gold
 * epaulettes, a black bicorne with curved ivory horns, glowing amber eyes + cyan monocle, and
 * a baton topped with a fluttering war banner.
 */
export const commander: StackDesign = {
  type: 'commander',
  voxel: 2,
  walkDistance: 28,
  portraitCrop: 0.66,
  portraitYaw: -0.32,
  shadow: [8, 7],
  blueprint: {
    id: 'commander',
    colors: {
      skin: '#9460d4',
      skinDark: '#63379c',
      '*eye': '#ffe438',
      pupil: '#1a1024',
      coat: '#cf2738',
      coatDark: '#871423',
      gold: '#f7c334',
      hat: '#231b2e',
      horn: '#faf0d7',
      '*glass': '#9ee8ff',
      boot: '#1c1524',
      baton: '#4a2e1c',
      banner: '#f04330',
      bannerDark: '#a6221b'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'pupil',
          legs: 'coatDark',
          boots: 'boot',
          torso: 'coat',
          torsoTrim: 'gold',
          belt: 'gold',
          sleeve: 'coat',
          hands: 'skinDark'
        },
        { torsoHalf: 5, torsoDepth: 3, legs: 5, robe: true }
      )
      for (const x of [-3, -2, 1, 2]) b.head.face(x, 3, '*eye').face(x, 4, '*eye')
      b.head.face(-2, 3, 'pupil').face(1, 3, 'pupil')
      b.head.face(1, 5, 'gold').face(2, 5, 'gold').face(1, 2, 'gold').face(2, 2, '*glass', '+z', 1, 1)
      b.head.face(-1, 1, 'skinDark').face(0, 1, 'skinDark')
      // Swept black bicorne hat with gold brim and curved ivory horns.
      b.head.fill(
        [-8, 7, -4],
        [7, 11, 3],
        'hat',
        (x, y, z) => Math.abs(x) <= 7.5 - (y - 7) * 1.35 && Math.abs(z + 0.5) <= 3.2 - (y - 7) * 0.55
      )
      b.head.box([-6, 7, 3], [5, 7, 3], 'gold')
      b.head.segment([-4, 8, 0], [-7.5, 11.5, -1], 1.1, 'horn', 0.5).segment([3, 8, 0], [6.5, 11.5, -1], 1.1, 'horn', 0.5)
      // Broad gold epaulettes, double-breasted gold buttons, high collar.
      for (const x of [-7, 4]) b.torso.box([x, 6, -3], [x + 2, 7, 3], 'gold')
      for (const y of [1, 3, 5]) b.torso.box([-1, y, 4], [0, y, 4], 'gold')
      // Baton with chunky 2px shaft and crisp war banner.
      const baton = kit.part('weapon', 'armR', [0, b.hand, 0])
      baton.box([0, 0, -1], [1, 1, 9], 'baton').box([0, 0, 10], [1, 1, 10], 'gold')
      baton.box([1, 0, 6], [5, 1, 9], 'banner').box([1, 0, 6], [5, 1, 6], 'bannerDark')
    }
  },
  pose: (input) => {
    const pose = bipedPose({ ...input, motion: input.motion === 'attack' ? 'idle' : input.motion }, { attack: 'cast' })
    if (input.motion === 'attack') {
      const ms = input.seconds * 1000
      const jab = track(ms, [
        [0, 0],
        [180, 1],
        [700, 1],
        [1000, 0]
      ])
      pose.armR = { rx: -1.55 * jab, rz: -0.15 }
      pose.weapon = { rx: 0.45 * jab }
      pose.armL = { rz: 0.55 * jab + 0.12, rx: -0.3 * jab }
      pose.torso = { rx: 0.14 * jab, ry: -0.22 * jab }
      pose.head = { rx: -0.1 * jab }
    }
    return pose
  }
}
