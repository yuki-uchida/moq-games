import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 花の癒やし手 — a gentle healer crowned with rose blossoms perched above a clearly visible
 * smiling face, wide petal-hemmed rose-and-cream robe, emerald leaf mantle, and glowing flower staff.
 * Uses the dedicated wide-open `bloom` casting pose.
 */
export const healer: StackDesign = {
  type: 'healer',
  voxel: 2,
  walkDistance: 28,
  portraitCrop: 0.62,
  portraitYaw: -0.25,
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
      robeDark: '#c74875',
      cream: '#fff5e4',
      leaf: '#4cb848',
      leafDark: '#2c8234',
      hair: '#b86832',
      petal: '#ff5291',
      petalLight: '#ffc7dc',
      stem: '#3f9638',
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
          brow: 'hair',
          legs: 'cream',
          boots: 'shoe',
          torso: 'robe',
          torsoTrim: 'cream',
          belt: 'leaf',
          sleeve: 'cream',
          hands: 'skin'
        },
        { robe: true, robeFlare: 1.65, robePleat: 'robeDark', legs: 5, headRadius: 4.8, eyeRow: 3 }
      )
      b.head.paint((x, y, z) => (z < 1 && y >= 0 ? 'hair' : y >= 6 && z < 3 ? 'hair' : undefined))
      b.head.box([-3, -4, -5], [2, 3, -4], 'hair')
      // Cream front apron panel distinguishing healer's bell skirt from mage & frost.
      b.hips.box([-2, -3, 3], [1, 1, 5], 'cream')
      // Blossom crown perched high at y=8..9 so the eyes & cheeks read clearly underneath.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        const x = Math.round(Math.sin(a) * 4.5 - 0.5)
        const z = Math.round(Math.cos(a) * 4.2 - 0.8)
        b.head.box([x - 1, 8, z - 1], [x + 1, 8, z + 1], 'petal').set(x, 9, z, i % 2 ? 'petalLight' : '*bloom')
      }
      // Emerald leaf mantle over shoulders.
      b.torso.fill(
        [-6, 5, -5],
        [5, 7, 4],
        'leaf',
        (x, y, z) => Math.hypot(x / 5.4, z / 4.0) <= 1 && y < 6.6 + (Math.abs(x) < 3 ? 0.5 : 0)
      )
      b.torso.paint((x, y, z) => (y === 5 && (x + z) % 3 === 0 ? 'leafDark' : undefined))
      b.hips.paint((x, y, z) => (y === -4 && (x + z) % 2 === 0 ? 'petalLight' : undefined))
      // Chunky 2px flower staff with glowing golden heart.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 1])
      staff.box([0, 0, -3], [1, 1, 13], 'stem').box([1, 0, 6], [2, 1, 7], 'leaf')
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        staff.ellipsoid(
          [0.5 + Math.sin(a) * 2.1, 2, 14.5 + Math.cos(a) * 2.1],
          [1.5, 1.2, 1.5],
          i % 2 ? 'petal' : 'petalLight'
        )
      }
      staff.ellipsoid([0.5, 2, 14.5], [1.3, 1.5, 1.3], '*bloom')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'bloom', stride: 0.4, bob: 0.6 })
}
