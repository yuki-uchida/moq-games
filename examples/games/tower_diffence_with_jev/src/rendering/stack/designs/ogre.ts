import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * おなかオーガ — a big round-bellied ogre with a tiny topknot, one tusk poking up, a patched
 * loincloth with a rope belt, and a knotty tree-trunk club studded with nails.
 */
export const ogre: StackDesign = {
  type: 'ogre',
  voxel: 2.4,
  walkDistance: 28,
  shadow: [11, 9],
  blueprint: {
    id: 'ogre',
    colors: {
      skin: '#db9369',
      skinDark: '#a6623f',
      belly: '#f5c79e',
      eye: '#1c120a',
      tusk: '#fff9e6',
      hair: '#3d1f12',
      cloth: '#528738',
      patch: '#d94836',
      rope: '#e0b35e',
      wood: '#875126',
      woodDark: '#543014',
      nail: '#dce4eb',
      foot: '#8f5236'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 5, 0])
      hips
        .box([-6, -2, -4], [5, 1, 4], 'cloth')
        .box([2, -2, 5], [3, -1, 5], 'patch')
        .box([-6, 1, -4], [5, 1, 4], 'rope')
      for (const [name, x] of [
        ['legL', 3],
        ['legR', -3]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, -1, 0])
        leg.box([-2, -4, -2], [1, 0, 2], 'skinDark').box([-2, -4, -2], [1, -4, 3], 'foot')
      }
      const torso = kit.part('torso', 'hips', [0, 1.5, 0])
      torso.fill(
        [-8, 0, -6],
        [7, 11, 7],
        'skin',
        (x, y, z) => Math.hypot(x / 7.4, (y - 4.5) / 6.5, (z - 0.5) / 6.2) <= 1
      )
      torso.fill(
        [-6, 0, 0],
        [5, 9, 8],
        'belly',
        (x, y, z) => Math.hypot(x / 5.2, (y - 4) / 5, (z - 2) / 5) <= 1 && z > 2.5
      )
      torso.set(-1, 4, 7, 'skinDark')
      const head = kit.part('head', 'torso', [0, 10, 1])
      head.fill([-5, 0, -4], [4, 7, 5], 'skin', (x, y, z) => Math.hypot(x / 4.4, (y - 3.4) / 3.8, (z - 0.5) / 4.2) <= 1)
      for (const x of [-2, 1]) head.face(x, 4, 'eye')
      head.face(-3, 3, 'skinDark').face(2, 3, 'skinDark')
      head.box([-1, 2, 5], [0, 3, 5], 'skinDark')
      head.box([1, 1, 4], [1, 3, 4], 'tusk')
      head.box([-1, 7, -1], [0, 9, 0], 'hair').box([-1, 10, -2], [0, 10, 0], 'hair')
      for (const [name, x] of [
        ['armL', 8],
        ['armR', -8]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 9, 0])
        arm.box([-2, -9, -2], [1, 0, 1], 'skin').box([-2, -11, -2], [1, -9, 2], 'skinDark')
      }
      const club = kit.part('weapon', 'armR', [0, -10.5, 0])
      club.box([0, 0, -2], [0, 0, 4], 'woodDark')
      club.fill([-3, -3, 4], [3, 3, 14], 'wood', (x, y, z) => Math.hypot(x, y) <= 1.4 + (z - 4) * 0.17)
      for (const [x, y, z] of [
        [2, 0, 10],
        [-3, 1, 12],
        [0, 2, 13],
        [1, -3, 11],
        [-1, 2, 8]
      ])
        club.set(x, y, z, 'nail')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'sweep', stride: 0.35, bob: 1.1, heavy: true, armSpread: 0.22 })
}
