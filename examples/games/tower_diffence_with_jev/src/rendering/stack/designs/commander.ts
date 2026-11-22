import { bipedPose, track, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * Jev指揮官 — the monster army's marshal: a stout imp in a long crimson greatcoat with gold
 * epaulettes, a black bicorne with two curled horns pushing through, a smug single monocle
 * and a baton topped with a little war banner that it jabs forward to give orders.
 */
export const commander: StackDesign = {
  type: 'commander',
  voxel: 2,
  walkDistance: 28,
  shadow: [8, 7],
  blueprint: {
    id: 'commander',
    colors: {
      skin: '#8f6bb0',
      skinDark: '#6c4f8a',
      eye: '#ffe36a',
      pupil: '#1d1424',
      coat: '#a8323a',
      coatDark: '#7a2129',
      gold: '#e8bd4f',
      hat: '#2a2230',
      horn: '#efe4c8',
      glass: '#bfe8ff',
      boot: '#231c28',
      baton: '#3a2a20',
      banner: '#d8553a',
      bannerDark: '#9e3424'
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
      for (const x of [-3, -2, 1, 2]) b.head.face(x, 3, 'eye')
      b.head.face(-2, 3, 'pupil').face(1, 3, 'pupil')
      b.head.face(1, 4, 'gold').face(2, 4, 'gold').face(1, 2, 'gold').face(2, 2, 'glass', '+z', 1, 1)
      b.head.face(-1, 1, 'skinDark').face(0, 1, 'skinDark')
      // Bicorne hat with horns through it.
      b.head.fill(
        [-8, 7, -4],
        [7, 10, 3],
        'hat',
        (x, y, z) => Math.abs(x) <= 7 - (y - 7) * 1.4 && Math.abs(z + 0.5) <= 3 - (y - 7) * 0.6
      )
      b.head.box([-6, 7, 3], [5, 7, 3], 'gold')
      b.head.segment([-4, 8, 0], [-7, 11, -1], 1, 'horn', 0.5).segment([3, 8, 0], [6, 11, -1], 1, 'horn', 0.5)
      // Epaulettes and buttons.
      for (const x of [-7, 4]) b.torso.box([x, 6, -3], [x + 2, 7, 3], 'gold')
      for (const y of [1, 3, 5]) b.torso.set(-1, y, 4, 'gold')
      // Baton with a little banner.
      const baton = kit.part('weapon', 'armR', [0, b.hand, 0])
      baton.box([0, 0, -1], [0, 0, 9], 'baton').set(0, 0, 10, 'gold')
      baton.box([1, 0, 6], [4, 0, 9], 'banner').box([1, 0, 6], [4, 0, 6], 'bannerDark')
    }
  },
  pose: (input) => {
    const pose = bipedPose({ ...input, motion: input.motion === 'attack' ? 'idle' : input.motion }, { attack: 'cast' })
    if (input.motion === 'attack') {
      // An order: the baton jabs toward the battlefield and the hat tips.
      const ms = input.seconds * 1000
      const jab = track(ms, [
        [0, 0],
        [180, 1],
        [700, 1],
        [1000, 0]
      ])
      pose.armR = { rx: -1.5 * jab, rz: -0.15 }
      pose.weapon = { rx: 0.4 * jab }
      pose.armL = { rz: 0.5 * jab + 0.12, rx: -0.3 * jab }
      pose.torso = { rx: 0.12 * jab, ry: -0.2 * jab }
      pose.head = { rx: -0.1 * jab }
    }
    return pose
  }
}
