import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * 時計仕掛けのパッチリング — an unmistakable wind-up patchwork automaton with a gleaming brass
 * chest gearplate, mismatched glowing button eyes, stitched grin, prominent spinning 2-loop brass
 * wind-up key and riveted brass mallet fists.
 */
export const clockworkPatchling: StackDesign = {
  type: 'clockworkPatchling',
  voxel: 2,
  walkDistance: 22,
  portraitCrop: 0.6,
  portraitYaw: -0.34,
  shadow: [8, 7],
  blueprint: {
    id: 'clockworkPatchling',
    colors: {
      cloth: '#b87a40',
      clothDark: '#7d4d23',
      patchA: '#3594c7',
      patchB: '#d94d38',
      patchC: '#ebd042',
      stitch: '#fff5de',
      button: '#1c1824',
      buttonRim: '#faf0d7',
      '*eyeGlow': '#ffcf38',
      '*eyeCyan': '#6be8ff',
      iron: '#555d6e',
      brass: '#f2ba2e',
      brassLight: '#ffe478',
      brassDark: '#9c6b12',
      foot: '#4a311e'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 4, 0])
      hips.box([-4, -1, -3], [3, 1, 3], 'iron')
      for (const [name, x] of [
        ['legL', 2],
        ['legR', -2]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, -0.5, 0])
        leg.box([-1, -3, -1], [0, 0, 1], 'clothDark').box([-1, -4, -1], [0, -3, 2], 'foot')
      }

      const torso = kit.part('torso', 'hips', [0, 1, 0])
      torso.fill([-7, 0, -6], [6, 14, 6], 'cloth', (x, y, z) => Math.hypot(x / 6.3, (y - 6.8) / 7.2, z / 5.7) <= 1)
      torso.paint((x, y, z) =>
        x > 1 && y > 8 && z > 0
          ? 'patchA'
          : x < -2 && y < 6 && z > -1
            ? 'patchB'
            : y > 10 && z < -1
              ? 'patchC'
              : undefined
      )
      // Riveted iron & brass clockwork chest window so it reads immediately as mechanical, not a potato.
      torso.box([-3, 2, 5], [2, 5, 6], 'iron').box([-2, 3, 6], [1, 4, 6], 'brass')
      torso.set(-1, 4, 6, 'brassLight').set(0, 3, 6, 'brassDark')
      // Crisp patchwork seams.
      torso.paint((x, y, z) =>
        x === 0 && z > 4 && y >= 7 && y % 2 === 0
          ? 'stitch'
          : y === 8 && z > 3 && (x + 10) % 2 === 0 && x < -1
            ? 'stitch'
            : undefined
      )
      // Mismatched glowing button eyes (big golden left, bright cyan ringed right) + stitched grin.
      torso.box([-4, 9, 4], [-2, 11, 5], 'button').box([-3, 10, 5], [-3, 10, 5], '*eyeGlow')
      torso.box([1, 9, 4], [3, 11, 5], 'buttonRim').box([2, 10, 5], [2, 10, 5], '*eyeCyan')
      torso.face(-2, 7, 'stitch').face(-1, 6, 'stitch').face(0, 6, 'stitch').face(1, 6, 'stitch').face(2, 7, 'stitch')
      // Top brass crown bolt.
      torso.box([-1, 14, -1], [0, 15, 0], 'brassDark').box([-3, 16, -1], [2, 17, 0], 'brass')

      // Prominent oversized double-loop brass wind-up key in the back.
      const key = kit.part('key', 'torso', [0, 7.5, -5.5])
      key
        .box([-1, -1, -3], [0, 0, 0], 'brassDark')
        .fill(
          [-5, -4, -5],
          [4, 3, -3],
          'brass',
          (x, y) => {
            const dL = Math.hypot(x + 2.2, y + 0.5)
            const dR = Math.hypot(x - 1.8, y + 0.5)
            return (dL <= 2.4 && dL >= 0.9) || (dR <= 2.4 && dR >= 0.9)
          }
        )

      for (const [name, x] of [
        ['armL', 6.5],
        ['armR', -6.5]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 8.5, 0])
        arm.box([-1, -5, -1], [0, 0, 1], 'iron')
        arm.box([-2, -9, -2], [1, -6, 2], 'brass').box([-2, -9, -2], [1, -8, 2], 'brassDark')
      }
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'punch', stride: 0.52, bob: 1.25, armSpread: 0.35 })
    pose.key = { rz: input.time * 3.2 + input.seed * 6 }
    pose.torso = { ...pose.torso, rz: Math.sin(input.time * 5 + input.seed * 3) * 0.05 }
    return pose
  }
}
