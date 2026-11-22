import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * 小さな剣士 — the castle's youngest squire. An oversized round steel cap with a sky-blue
 * crest fin, a sky tabard carrying the white tower of the order, a broad short sword and a
 * small buckler. Quick two-beat cuts.
 */
export const soldier: StackDesign = {
  type: 'soldier',
  voxel: 2,
  walkDistance: 30,
  shadow: [7, 6],
  blueprint: {
    id: 'soldier',
    colors: {
      skin: '#f2c9a0',
      cheek: '#e89a86',
      eye: '#1d2433',
      steel: '#b9c4cf',
      steelDark: '#7d8a99',
      crest: '#75b6d5',
      tabard: '#5fa4c9',
      tabardDark: '#3f7ea3',
      emblem: '#f4f1e6',
      leather: '#7a4f31',
      boot: '#4e3424',
      blade: '#e3edf3',
      gold: '#e2b54a',
      hair: '#8a5a2f'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 6, 0])
      hips.box([-4, 0, -2], [3, 1, 2], 'leather').box([-1, 0, 2], [0, 1, 2], 'gold')
      for (const [name, x] of [
        ['legL', 2],
        ['legR', -2]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, 0.5, 0])
        leg
          .box([-1, -5, -1], [0, -1, 1], 'tabardDark')
          .box([-1, -7, -1], [0, -5, 2], 'boot')
          .box([-1, -5, -1], [0, -5, 1], 'leather')
      }
      const torso = kit.part('torso', 'hips', [0, 2, 0])
      torso
        .box([-4, 0, -2], [3, 6, 2], 'tabard')
        .box([-4, 0, -2], [3, 0, 2], 'tabardDark')
        .box([-3, 6, -2], [2, 6, 2], 'tabardDark')
      // White tower emblem on the chest.
      for (const [x, y] of [
        [-1, 2],
        [0, 2],
        [-1, 3],
        [0, 3],
        [-2, 4],
        [1, 4],
        [-1, 4],
        [0, 4]
      ])
        torso.set(x, y, 3, 'emblem')
      const head = kit.part('head', 'torso', [0, 7, 0.5])
      head.ellipsoid([0, 4.6, 0], [4.4, 4.6, 4.2], 'skin')
      head.paint((x, y, z) => (y === 4 && z < 1 ? 'hair' : y === 5 && z < 2 ? 'hair' : undefined))
      // Round steel cap above the brow with a flared brim and a crest fin.
      head.ellipsoid([0, 6.4, -0.3], [5.1, 0.8, 5.0], 'steelDark')
      head.ellipsoid([0, 7.0, -0.3], [4.6, 3.2, 4.5], 'steel')
      head.paint((x, y, z) => (y >= 7 && x === -3 && z > 1 ? 'blade' : undefined))
      head.box([-1, 9, -4], [0, 11, 3], 'crest').box([-1, 11, -3], [0, 12, 1], 'crest')
      // Face: tall eyes with a highlight, rosy cheeks.
      for (const x of [-3, -2, 1, 2]) head.face(x, 3, 'eye').face(x, 4, 'eye')
      head.face(-2, 4, 'blade').face(2, 4, 'blade')
      head.face(-4, 2, 'cheek').face(3, 2, 'cheek')
      head.face(-1, 1, 'cheek').face(0, 1, 'cheek')
      for (const [name, x] of [
        ['armL', 5],
        ['armR', -5]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 6, 0])
        arm
          .box([-1, -2, -1], [0, 0, 1], 'steel')
          .box([-1, -5, -1], [0, -3, 0], 'tabard')
          .box([-1, -7, -1], [0, -6, 0], 'leather')
      }
      // Broad short sword in the right hand, edge forward.
      const sword = kit.part('weapon', 'armR', [-0.5, -6.5, 0])
      sword
        .box([0, 0, -2], [0, 0, 0], 'leather')
        .box([-2, 0, 1], [2, 0, 1], 'gold')
        .box([-1, -1, 2], [1, 0, 10], 'blade')
        .box([0, 0, 2], [0, 0, 9], 'steel')
        .set(0, 0, 11, 'blade')
      // Small round buckler on the left forearm.
      const buckler = kit.part('offhand', 'armL', [1.5, -4.5, 0.5])
      buckler.fill([0, -4, -4], [1, 4, 4], 'crest', (x, y, z) => x < 2 && Math.hypot(y, z) <= 3.6)
      buckler.paint((x, y, z) => (Math.hypot(y + 0.5, z + 0.5) <= 2.2 ? 'steel' : undefined))
      buckler.paint((x, y, z) => (Math.abs(y + 0.5) < 1 && Math.abs(z + 0.5) < 1 ? 'gold' : undefined))
    }
  },
  pose: (input) => bipedPose(input, { attack: 'slash', stride: 0.6, bob: 0.8 })
}
