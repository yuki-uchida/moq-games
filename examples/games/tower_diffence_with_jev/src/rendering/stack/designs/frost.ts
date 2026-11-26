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
  portraitCrop: 0.64,
  portraitYaw: -0.22,
  portraitFocusY: 0.08,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0.5, 1.5, 15.5] },
  blueprint: {
    id: 'frost',
    density: 2,
    colors: {
      skin: '#ffd0ae',
      eye: '#111d38',
      shine: '#ffffff',
      cheek: '#f2889b',
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
      // Fur shoulder collar & vertical coat trim with ice-crystal clasp.
      b.torso.fill([-6, 5, -4], [5, 7, 4], 'fur', (x, _y, z) => Math.hypot(x / 4.8, z / 3.8) <= 1.1)
      b.torso.rawBox([-1, 1, 7], [0, 9, 8], 'fur').rawBox([-1, 10, 8], [0, 11, 8], '*ice')
      // Tapered birch staff with razor-crisp 6-pointed translucent ice star.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 1])
      staff.segment([0.5, 0.5, -3], [0.5, 0.5, 13], 0.72, 'birch', 0.62).rawSet(0, 2, 8, 'knot').rawSet(1, 2, 18, 'knot')
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        staff.segment([0.5, 1.5, 15.5], [0.5 + Math.sin(a) * 3.3, 1.5, 15.5 + Math.cos(a) * 3.3], 0.55, '*ice', 0.25)
      }
      staff.segment([0.5, -0.5, 15.5], [0.5, 3.5, 15.5], 0.5, '*ice', 0.25).rawBox([0, 2, 30], [1, 3, 31], '*iceCore')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'frostCast', stride: 0.4, bob: 0.6, ready: -0.6 })
}
