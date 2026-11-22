import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * おなかオーガ — an imposing broad-bellied ogre on the unified voxel=2 grid with clean warm-bronze
 * skin, heavy brow over glowing red-orange eyes, twin upturned tusks, patched loincloth and a giant
 * iron-studded tree-trunk club.
 */
export const ogre: StackDesign = {
  type: 'ogre',
  voxel: 2,
  walkDistance: 28,
  portraitCrop: 0.56,
  portraitYaw: -0.3,
  shadow: [12, 10],
  blueprint: {
    id: 'ogre',
    colors: {
      skin: '#cf835b',
      skinDark: '#965436',
      belly: '#edb88c',
      brow: '#783e26',
      '*eye': '#ff6a24',
      pupil: '#1c0b08',
      tusk: '#fff8e0',
      hair: '#331a10',
      cloth: '#467834',
      patch: '#d43d32',
      rope: '#deb054',
      wood: '#7d4922',
      woodDark: '#4d2b12',
      clubStone: '#8f98a6',
      clubStoneDark: '#4b5364',
      nail: '#e6eef5',
      foot: '#7d452c'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 6, 0])
      hips
        .box([-7, -2, -5], [6, 1, 5], 'cloth')
        .box([2, -2, 6], [4, 0, 6], 'patch')
        .box([-7, 1, -5], [6, 2, 5], 'rope')
      for (const [name, x] of [
        ['legL', 3.5],
        ['legR', -3.5]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, -1, 0])
        leg.box([-2, -5, -2], [1, 0, 2], 'skinDark').box([-2, -5, -2], [1, -4, 4], 'foot')
      }
      const torso = kit.part('torso', 'hips', [0, 2, 0])
      torso.fill(
        [-9, 0, -7],
        [8, 13, 8],
        'skin',
        (x, y, z) => Math.hypot(x / 8.6, (y - 5.5) / 7.5, (z - 0.5) / 7.2) <= 1
      )
      torso.fill(
        [-7, 0, 0],
        [6, 10, 9],
        'belly',
        (x, y, z) => Math.hypot(x / 6.2, (y - 4.8) / 5.8, (z - 2.2) / 5.8) <= 1 && z > 3
      )
      torso.box([-1, 4, 8], [0, 5, 8], 'skinDark')

      const head = kit.part('head', 'torso', [0, 11.5, 2.0])
      // Larger expressive ogre head & jaw so glowing eyes and twin ivory tusks dominate front & 3/4 views.
      head.fill([-7, 0, -5], [6, 9, 6], 'skin', (x, y, z) => Math.hypot(x / 5.9, (y - 4.4) / 4.8, (z - 0.5) / 5.2) <= 1)
      head.box([-5, 0, 2], [4, 2, 6], 'belly')
      // Raised heavy brow over bold 2x2 glowing orange eyes + broad nose + chunky upturned tusks.
      head.box([-5, 6, 3], [4, 7, 6], 'brow')
      head.box([-4, 4, 5], [-3, 5, 6], '*eye').box([2, 4, 5], [3, 5, 6], '*eye')
      head.set(-3, 4, 6, 'pupil').set(2, 4, 6, 'pupil')
      head.box([-1, 3, 6], [0, 4, 7], 'skinDark')
      head.box([-4, 1, 6], [-3, 3, 7], 'tusk').box([2, 1, 6], [3, 3, 7], 'tusk')
      // Side ears & topknot.
      head.box([-7, 4, -1], [-6, 6, 1], 'skinDark').box([5, 4, -1], [6, 6, 1], 'skinDark')
      head.box([-1, 9, -2], [0, 12, 0], 'hair').box([-2, 12, -3], [1, 13, 0], 'hair')

      for (const [name, x] of [
        ['armL', 10],
        ['armR', -10]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 10.5, 0])
        arm.box([-2, -10, -2], [1, 0, 2], 'skin').box([-2, -13, -2], [1, -10, 2], 'skinDark')
      }

      const club = kit.part('weapon', 'armR', [-1, -12, 1])
      club.box([-1, -1, -2], [1, 1, 5], 'woodDark')
      club.fill([-4, -4, 5], [4, 4, 17], 'clubStone', (x, y, z) => Math.hypot(x, y) <= 1.6 + (z - 5) * 0.19)
      club.box([-2, -2, 6], [1, 1, 9], 'clubStoneDark').box([-1, 2, 11], [1, 3, 14], 'clubStoneDark')
      for (const [x, y, z] of [
        [3, 0, 12],
        [-4, 1, 14],
        [0, 3, 15],
        [1, -4, 13],
        [-2, 2, 9],
        [2, 2, 16]
      ])
        club.box([x, y, z], [x, y, z + 1], 'nail')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'sweep', stride: 0.35, bob: 1.2, heavy: true, armSpread: 0.34 })
}
