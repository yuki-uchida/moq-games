import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 花の癒やし手 — a gentle healer with a crown of pink blossoms, a petal-hemmed robe of rose
 * and cream, a leaf mantle, and a green staff crowned by an open flower with a glowing heart.
 */
export const healer: StackDesign = {
  type: 'healer',
  voxel: 2,
  walkDistance: 28,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0.5, 2, 14.5] },
  blueprint: {
    id: 'healer',
    colors: {
      skin: '#ffd6b8',
      eye: '#331c29',
      shine: '#ffffff',
      cheek: '#ff8da1',
      robe: '#f77ea6',
      robeDark: '#cc4e7a',
      cream: '#fff5e4',
      leaf: '#5cc452',
      leafDark: '#36943c',
      hair: '#b86832',
      petal: '#ff5c96',
      petalLight: '#ffc2d9',
      stem: '#469e3a',
      shoe: '#a84266',
      '*bloom': '#fff078'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          legs: 'cream',
          boots: 'shoe',
          torso: 'robe',
          torsoTrim: 'cream',
          belt: 'leaf',
          sleeve: 'cream',
          hands: 'skin'
        },
        { robe: true, legs: 5 }
      )
      // Long hair falling down the back, braided ends.
      b.head.paint((x, y, z) => (y >= 5 && z < 2 ? 'hair' : y >= 1 && z < -2 ? 'hair' : undefined))
      b.head.box([-3, -4, -4], [2, 1, -4], 'hair')
      // Blossom crown: a ring of flowers around the head.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        const x = Math.round(Math.sin(a) * 4.4 - 0.5)
        const z = Math.round(Math.cos(a) * 4.2 - 0.5)
        b.head.box([x - 1, 7, z - 1], [x + 1, 7, z + 1], 'petal').set(x, 8, z, i % 2 ? 'petalLight' : '*bloom')
      }
      // Leaf mantle over the shoulders.
      b.torso.fill(
        [-6, 5, -4],
        [5, 7, 4],
        'leaf',
        (x, y, z) => Math.hypot(x / 5.2, z / 3.4) <= 1 && y < 6.5 + (Math.abs(x) < 3 ? 0.5 : 0)
      )
      b.torso.paint((x, y, z, c) => (y === 5 && (x + z) % 3 === 0 ? 'leafDark' : undefined))
      // Petal hem.
      b.hips.paint((x, y, z) => (y === -3 && (x + z) % 2 === 0 ? 'petalLight' : undefined))
      // Flower staff: chunky 2px stem so diagonals stay solid when turning.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 0])
      staff.box([0, 0, -3], [1, 1, 13], 'stem').box([1, 0, 6], [2, 1, 7], 'leaf')
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        staff.ellipsoid(
          [0.5 + Math.sin(a) * 2, 2, 14.5 + Math.cos(a) * 2],
          [1.4, 1.1, 1.4],
          i % 2 ? 'petal' : 'petalLight'
        )
      }
      staff.ellipsoid([0.5, 2, 14.5], [1.2, 1.4, 1.2], '*bloom')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'cast', stride: 0.4, bob: 0.6 })
}
