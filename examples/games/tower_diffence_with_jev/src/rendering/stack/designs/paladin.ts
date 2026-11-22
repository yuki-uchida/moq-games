import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 光の守護者 — a guardian in ivory plate edged with gold, an open-faced helm with small
 * wings, a sun-disc halo floating behind the shoulders, and a two-handed hammer whose head
 * glows with dawn light.
 */
export const paladin: StackDesign = {
  type: 'paladin',
  voxel: 2,
  walkDistance: 27,
  shadow: [9, 7],
  blueprint: {
    id: 'paladin',
    colors: {
      skin: '#ffd0a8',
      eye: '#332214',
      shine: '#ffffff',
      plate: '#fbf7eb',
      plateShade: '#cfc3a3',
      gold: '#f7c234',
      goldDark: '#bd851a',
      tabard: '#f7df74',
      cloth: '#fff9e0',
      boot: '#8a7244',
      haft: '#7a4b24',
      wing: '#ffffff',
      '*sun': '#ffe46b',
      '*sunCore': '#fffbe0'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          legs: 'plateShade',
          boots: 'boot',
          torso: 'plate',
          torsoTrim: 'gold',
          belt: 'goldDark',
          sleeve: 'plate',
          hands: 'gold'
        },
        { torsoHalf: 5, torsoDepth: 3, legs: 6 }
      )
      // Open-faced helm with cheek guards and small wings.
      b.head.fill([-6, 0, -6], [5, 11, 5], 'plate', (x, y, z) => {
        const d = Math.hypot(x / 5, (y - 4.8) / 5.2, z / 4.8)
        return d <= 1 && d > 0.8 && !(z > 1.4 && y < 7.2 && Math.abs(x) < 3.6)
      })
      b.head.paint((x, y, z, c) =>
        y === 7 && c !== undefined && z > -5 && b.head.has(x, y, z) && Math.abs(x + 0.5) > 3 ? 'gold' : undefined
      )
      b.head.box([-1, 9, -3], [0, 10, 2], 'gold')
      for (const side of [-1, 1]) {
        const x = side < 0 ? -6 : 5
        b.head
          .box([x, 6, -2], [x, 8, 0], 'wing')
          .box([x + side, 7, -3], [x + side, 9, -1], 'wing')
          .box([x + side * 2, 8, -4], [x + side * 2, 10, -2], 'wing')
      }
      // Tabard with a sun and gilded pauldrons.
      b.torso.box([-2, 0, 4], [1, 5, 4], 'tabard').box([-1, 2, 5], [0, 3, 5], 'gold')
      for (const x of [-7, 4]) b.torso.box([x, 5, -3], [x + 2, 7, 3], 'gold')
      b.hips.box([-3, -3, 4], [2, 1, 4], 'tabard').box([-3, -3, 4], [2, -3, 4], 'goldDark')
      // Floating sun-disc halo behind the shoulders.
      const halo = kit.part('halo', 'torso', [0, 10, -5])
      halo.fill([-7, -7, 0], [6, 7, 0], '*sun', (x, y) => {
        const r = Math.hypot(x, y)
        return r <= 6.4 && r > 5
      })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        halo.set(Math.round(Math.sin(a) * 7.3 - 0.5), Math.round(Math.cos(a) * 7.3 - 0.5), 0, '*sunCore')
      }
      // Two-handed hammer with a chunky 2px haft and glowing head.
      const hammer = kit.part('weapon', 'armR', [0, b.hand, 0])
      hammer.box([0, 0, -4], [1, 1, 11], 'haft').box([0, 0, 4], [1, 1, 4], 'gold')
      hammer
        .box([-3, -2, 11], [3, 2, 14], 'gold')
        .box([-2, -1, 12], [2, 1, 13], '*sun')
        .box([-4, -1, 12], [4, 1, 13], 'goldDark')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'smash', stride: 0.45, bob: 0.6, heavy: true, armSpread: 0.2 })
    pose.halo = { y: 0.6 * Math.sin(input.time * 1.6 + input.seed * 4), rz: input.time * 0.4 }
    return pose
  }
}
