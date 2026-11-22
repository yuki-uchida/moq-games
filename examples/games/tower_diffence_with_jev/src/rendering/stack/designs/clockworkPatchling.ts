import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * 時計仕掛けのパッチリング — a wind-up toy stitched from mismatched cloth patches: a round
 * potato body with cross stitches, two button eyes of different sizes, a brass wind-up key
 * turning in its back and little brass mallet hands.
 */
export const clockworkPatchling: StackDesign = {
  type: 'clockworkPatchling',
  voxel: 2,
  walkDistance: 22,
  shadow: [8, 7],
  blueprint: {
    id: 'clockworkPatchling',
    colors: {
      cloth: '#c48547',
      clothDark: '#8c5828',
      patchA: '#3ea4d4',
      patchB: '#e35c42',
      patchC: '#f5d442',
      stitch: '#fff5de',
      button: '#211d29',
      buttonRim: '#faf0d7',
      brass: '#f0b62b',
      brassDark: '#a67414',
      foot: '#593b24'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 4, 0])
      hips.box([-4, -1, -3], [3, 1, 3], 'clothDark')
      for (const [name, x] of [
        ['legL', 2],
        ['legR', -2]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, -0.5, 0])
        leg.box([-1, -3, -1], [0, 0, 1], 'cloth').box([-1, -4, -1], [0, -3, 2], 'foot')
      }
      const torso = kit.part('torso', 'hips', [0, 1, 0])
      torso.fill([-7, 0, -6], [6, 14, 6], 'cloth', (x, y, z) => Math.hypot(x / 6.2, (y - 6.6) / 7, z / 5.6) <= 1)
      torso.paint((x, y, z) =>
        x > 1 && y > 8 && z > 0
          ? 'patchA'
          : x < -2 && y < 6 && z > -1
            ? 'patchB'
            : y > 10 && z < -1
              ? 'patchC'
              : undefined
      )
      torso.paint((x, y, z) =>
        x === 0 && z > 3 && y % 2 === 0
          ? 'stitch'
          : y === 8 && z > 2 && (x + 10) % 2 === 0 && x < -1
            ? 'stitch'
            : undefined
      )
      // Odd button eyes.
      torso
        .face(-3, 9, 'button')
        .face(-2, 9, 'button')
        .face(-3, 10, 'button')
        .face(-2, 10, 'button')
        .face(-3, 10, 'buttonRim')
      torso.face(2, 9, 'button').face(2, 10, 'buttonRim')
      torso.face(-1, 6, 'stitch').face(0, 6, 'stitch').face(1, 6, 'stitch').face(-2, 7, 'stitch').face(2, 7, 'stitch')
      torso.box([-1, 14, 0], [0, 15, 0], 'brassDark').box([-2, 16, 0], [1, 16, 0], 'brass')
      // Wind-up key in the back.
      const key = kit.part('key', 'torso', [0, 7, -5.5])
      key
        .box([0, 0, -2], [0, 0, 0], 'brassDark')
        .fill(
          [-3, -3, -3],
          [2, 2, -3],
          'brass',
          (x, y) => Math.hypot(x + 1.5, y) <= 1.8 || Math.hypot(x - 1.5, y) <= 1.8
        )
      for (const [name, x] of [
        ['armL', 6],
        ['armR', -6]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 8, 0])
        arm.box([-1, -5, -1], [0, 0, 0], 'clothDark')
        arm.box([-2, -8, -1], [1, -6, 1], 'brass').box([-2, -8, -1], [1, -8, 1], 'brassDark')
      }
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'punch', stride: 0.5, bob: 1.2, armSpread: 0.35 })
    pose.key = { rz: input.time * 3 + input.seed * 6 }
    pose.torso = { ...pose.torso, rz: Math.sin(input.time * 5 + input.seed * 3) * 0.04 }
    return pose
  }
}
