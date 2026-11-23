import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * 岩のブルート — a colossal boulder golem on the unified voxel=2 grid with clean sculpted stone
 * facets (zero salt-and-pepper noise), a lush mossy back + golden flower, deep glowing ember eyes
 * and massive beveled slab fists.
 */
export const brute: StackDesign = {
  type: 'brute',
  voxel: 2,
  walkDistance: 26,
  portraitCrop: 0.56,
  portraitYaw: -0.32,
  shadow: [12, 10],
  blueprint: {
    id: 'brute',
    colors: {
      stone: '#ad9774',
      stoneDark: '#6e5c44',
      stoneLight: '#dbcaa4',
      crack: '#3f3326',
      moss: '#4ca63c',
      mossDark: '#2e6e24',
      petal: '#ffd43b',
      '*eye': '#ff9d24',
      '*eyeCore': '#fff2a6'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 6, 0])
      hips.box([-6, -1, -4], [5, 1, 4], 'stoneDark')
      for (const [name, x] of [
        ['legL', 3.5],
        ['legR', -3.5]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, -0.5, 0])
        leg.box([-2, -6, -2], [1, 0, 2], 'stoneDark').box([-2, -6, -2], [1, -5, 4], 'stone')
      }
      const torso = kit.part('torso', 'hips', [0, 1, -1])
      torso.fill(
        [-10, 0, -8],
        [9, 14, 8],
        'stone',
        (x, y, z) => Math.hypot(x / 8.8, (y - 6.8) / 7.6, (z + 0.5) / 6.8) <= 1
      )
      // Clean directional stone highlight on upper-left ridge + lush moss blanket on upper back.
      torso.paint((x, y, z) =>
        y >= 10 && z < 2
          ? 'moss'
          : y >= 8 && z < -3
            ? 'mossDark'
            : y >= 9 && x <= -3 && z >= 2
              ? 'stoneLight'
              : undefined
      )
      // Two crisp deliberate rock cracks instead of noisy random speckle.
      torso.box([-4, 5, 5], [-3, 8, 6], 'crack').box([2, 3, 6], [3, 6, 6], 'crack')
      // Sprouting golden wildflower on moss shoulder.
      torso
        .box([2, 14, -2], [3, 15, -2], 'mossDark')
        .box([1, 16, -3], [4, 16, 0], 'petal')
        .box([2, 16, -2], [3, 16, -1], 'stoneLight')

      const head = kit.part('head', 'torso', [0, 9, 5.5])
      head.box([-4, -2, -1], [3, 2, 4], 'stone').box([-5, 2, -1], [4, 4, 5], 'stoneDark')
      head.box([-4, -1, 3], [3, 1, 4], 'crack')
      // Blazing 2x2 amber-gold eyes deep under the overhanging stone brow.
      head.box([-3, 0, 4], [-2, 1, 4], '*eye').box([1, 0, 4], [2, 1, 4], '*eye')
      head.set(-2, 1, 4, '*eyeCore').set(1, 1, 4, '*eyeCore')
      // Profile eyes + neck crack keep the front/side readable.
      head.set(-5, 0, 2, '*eye').set(4, 0, 2, '*eye')
      head.box([-3, -3, 0], [2, -2, 2], 'crack')

      for (const [name, x] of [
        ['armL', 9],
        ['armR', -9]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 11, 0])
        const s = x > 0 ? 1 : -1
        arm.box([-2, -7, -2], [1, 0, 2], 'stoneDark')
        arm
          .box([-3 + (s > 0 ? 1 : 0), -14, -3], [3 + (s > 0 ? 1 : 0), -8, 3], 'stone')
          .box([-3 + (s > 0 ? 1 : 0), -14, 3], [3 + (s > 0 ? 1 : 0), -9, 3], 'stoneLight')
      }
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'smash', stride: 0.35, bob: 1.0, heavy: true, armSpread: 0.16 })
    pose.torso = { ...pose.torso, rx: (pose.torso?.rx ?? 0) + 0.14 }
    return pose
  }
}
