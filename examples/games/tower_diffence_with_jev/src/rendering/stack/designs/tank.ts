import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 盾の騎士 — a broad knight in blued plate with a bucket helm and a T visor, a tall kite
 * shield bearing the order's tower, and a flanged mace.
 */
export const tank: StackDesign = {
  type: 'tank',
  voxel: 2,
  walkDistance: 26,
  shadow: [9, 7],
  blueprint: {
    id: 'tank',
    colors: {
      plate: '#9faec6',
      plateDark: '#6e7d97',
      plateLight: '#d3dceb',
      visor: '#1c2230',
      gold: '#e0b24c',
      cloth: '#3d5c8f',
      shield: '#3f659f',
      shieldRim: '#c8d3e4',
      emblem: '#f3efe2',
      mace: '#7b8796',
      grip: '#5b3d27',
      boot: '#4a5468'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'plate',
          eye: 'visor',
          legs: 'plateDark',
          boots: 'boot',
          torso: 'plate',
          torsoTrim: 'plateDark',
          belt: 'cloth',
          sleeve: 'plate',
          hands: 'plateDark'
        },
        { torsoHalf: 5, torsoDepth: 3, legs: 5, headRadius: 4.2, armLength: 7 }
      )
      // Bucket helm replaces the round head.
      b.head.paint(() => 0)
      b.head
        .box([-4, 0, -4], [3, 7, 3], 'plate')
        .box([-4, 8, -3], [3, 8, 2], 'plateLight')
        .box([-4, 0, -4], [3, 0, 3], 'plateDark')
        .box([-3, 4, 4], [2, 4, 4], 'visor')
        .box([-1, 1, 4], [0, 4, 4], 'visor')
        .box([-1, 9, -2], [0, 10, 1], 'gold')
      // Pauldrons and a cloth tabard.
      for (const x of [-7, 4]) b.torso.box([x, 5, -3], [x + 2, 7, 3], 'plateLight')
      b.torso.box([-2, 0, 4], [1, 5, 4], 'cloth').box([-1, 2, 5], [0, 3, 5], 'gold')
      b.hips.box([-2, -3, 4], [1, 1, 4], 'cloth')
      // Kite shield on the left arm: a vertical slab facing forward.
      const shield = kit.part('offhand', 'armL', [1, -3, 2.5])
      const halfWidth = (y: number) => (y > 1 ? 4.6 : 4.6 * Math.max(0, (y + 9) / 10))
      shield.fill([-5, -9, 0], [5, 6, 1], 'shield', (x, y, z) => Math.abs(x - 0.5) <= halfWidth(y) && z < 2)
      shield.paint((x, y) => (Math.abs(x + 0.5 - 0.5) > halfWidth(y + 0.5) - 1.3 || y >= 5 ? 'shieldRim' : undefined))
      for (const [x0, y0, x1, y1] of [
        [-1, -3, 0, 2],
        [-2, 2, 1, 3],
        [-2, 4, -2, 4],
        [0, 4, 0, 4]
      ])
        shield.box([x0, y0, 2], [x1, y1, 2], 'emblem')
      // Flanged mace.
      const mace = kit.part('weapon', 'armR', [0, b.hand, 0])
      mace
        .box([0, 0, -1], [0, 0, 6], 'grip')
        .box([-1, -1, 7], [1, 1, 10], 'mace')
        .box([-2, 0, 8], [2, 0, 9], 'mace')
        .box([0, -2, 8], [0, 2, 9], 'mace')
        .set(0, 0, 11, 'gold')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'bash', stride: 0.42, bob: 0.6, heavy: true, armSpread: 0.2 })
}
