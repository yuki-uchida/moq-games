import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 霜の術師 — a frost mage in a deep sapphire fur-trimmed parka hood framing a crisp expressive
 * face (no beard-like chin fur!), pale-blue mittens, and a birch staff crowned by a glowing ice star.
 * Uses the dedicated low-crouched `frostCast` thrust pose.
 */
export const frost: StackDesign = {
  type: 'frost',
  voxel: 2,
  walkDistance: 27,
  portraitCrop: 0.62,
  portraitYaw: -0.14,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0.5, 1.5, 15.5] },
  blueprint: {
    id: 'frost',
    colors: {
      skin: '#ffe0cf',
      eye: '#12263b',
      shine: '#ffffff',
      cheek: '#f598aa',
      coat: '#1e7fc4',
      coatDark: '#124f87',
      fur: '#f2f8ff',
      furShade: '#b8d4ed',
      mitten: '#6de6f5',
      boot: '#1d3954',
      birch: '#f2ece0',
      knot: '#786858',
      hair: '#a6d9fa',
      '*ice': '#8cf2ff',
      '*iceCore': '#ffffff'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          brow: 'coatDark',
          legs: 'coatDark',
          boots: 'boot',
          torso: 'coat',
          torsoTrim: 'fur',
          belt: 'coatDark',
          sleeve: 'coatDark',
          hands: 'mitten'
        },
        { robe: true, robeFlare: 0.95, robeLength: 3, robePleat: 'coatDark', legs: 6, headRadius: 4.8, eyeRow: 3, coveredSides: true }
      )
      b.head.paint((x, y, z) => (y >= 7 && z < 3 ? 'hair' : undefined))
      // Deep sapphire hood framing a wide-open expressive face so eyes & cheeks shine in portraits.
      b.head.fill([-7, 2, -7], [6, 12, 5], 'coat', (x, y, z) => {
        const d = Math.hypot(x / 5.8, (y - 5.2) / 5.8, (z + 0.8) / 5.6)
        return d <= 1 && d > 0.78 && !(z > 0.6 && y < 8.6)
      })
      // Fur trim strictly along the outer arch rim (never blocking eyes!).
      b.head.fill([-7, 3, 0], [6, 11, 4], 'fur', (x, y, z) => {
        const ring = Math.hypot(x / 5.7, (y - 5.2) / 5.6)
        return z > 0.8 && z < 2.8 && ring <= 1.04 && ring > 0.8 && y >= 3.5
      })
      // Fur shoulder collar & vertical coat trim.
      b.torso.fill([-6, 5, -4], [5, 7, 4], 'fur', (x, y, z) => Math.hypot(x / 4.8, z / 3.8) <= 1.1)
      b.torso.box([-1, 1, 4], [0, 4, 4], 'fur')
      // Chunky 2px birch staff with a glowing six-pointed ice crystal.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 1])
      staff.box([0, 0, -3], [1, 1, 13], 'birch').set(0, 1, 4, 'knot').set(1, 1, 9, 'knot')
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        staff.segment([0.5, 1.5, 15.5], [0.5 + Math.sin(a) * 3.2, 1.5, 15.5 + Math.cos(a) * 3.2], 0.7, '*ice')
      }
      staff.segment([0.5, -0.5, 15.5], [0.5, 3.5, 15.5], 0.7, '*ice').set(0, 1, 15, '*iceCore')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'frostCast', stride: 0.4, bob: 0.6, ready: -0.6 })
}
