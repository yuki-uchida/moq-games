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
  portraitCrop: 0.66,
  portraitYaw: -0.35,
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

      const head = kit.part('head', 'torso', [0, 12, 1.5])
      head.fill([-6, 0, -5], [5, 8, 6], 'skin', (x, y, z) => Math.hypot(x / 5.2, (y - 4) / 4.4, (z - 0.5) / 5.0) <= 1)
      // Heavy protruding ogre brow + glowing eyes + broad nose + twin upturned tusks.
      head.box([-5, 5, 2], [4, 6, 6], 'brow')
      head.box([-4, 3, 4], [-3, 4, 5], '*eye').box([2, 3, 4], [3, 4, 5], '*eye')
      head.set(-3, 3, 5, 'pupil').set(2, 3, 5, 'pupil')
      head.box([-1, 2, 5], [0, 4, 6], 'skinDark')
      head.box([-4, 1, 5], [-3, 3, 6], 'tusk').box([2, 1, 5], [3, 3, 6], 'tusk')
      // Side ears & topknot.
      head.box([-6, 3, -1], [-5, 5, 1], 'skinDark').box([4, 3, -1], [5, 5, 1], 'skinDark')
      head.box([-1, 8, -2], [0, 11, 0], 'hair').box([-2, 11, -3], [1, 12, 0], 'hair')

      for (const [name, x] of [
        ['armL', 9.5],
        ['armR', -9.5]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 10.5, 0])
        arm.box([-2, -10, -2], [1, 0, 2], 'skin').box([-2, -13, -2], [1, -10, 2], 'skinDark')
      }

      const club = kit.part('weapon', 'armR', [0, -12, 0])
      club.box([-1, -1, -2], [1, 1, 5], 'woodDark')
      club.fill([-4, -4, 5], [4, 4, 17], 'wood', (x, y, z) => Math.hypot(x, y) <= 1.6 + (z - 5) * 0.19)
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
  pose: (input) => bipedPose(input, { attack: 'sweep', stride: 0.35, bob: 1.2, heavy: true, armSpread: 0.24 })
}
