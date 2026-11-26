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
  portraitCrop: 0.68,
  portraitYaw: -0.3,
  portraitFocusY: 0.14,
  shadow: [12, 10],
  blueprint: {
    id: 'brute',
    density: 2,
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
      // Blazing high-res amber-gold eyes with gleaming white cores under the heavy boulder brow.
      head.rawBox([-8, 0, 10], [-3, 3, 11], '*eye').rawBox([2, 0, 10], [7, 3, 11], '*eye')
      head.rawBox([-6, 1, 11], [-5, 2, 11], '*eyeCore').rawBox([4, 1, 11], [5, 2, 11], '*eyeCore')
      head.box([-4, -2, 0], [3, -2, 3], 'crack')

      for (const [name, x] of [
        ['armL', 9],
        ['armR', -9]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 11, 1.6])
        const s = x > 0 ? 1 : -1
        // Dark shoulder seam + forward-set arms keep the near arm distinct from the torso in profile.
        arm.box([-2, -7, -3], [1, -2, 1], 'stoneDark')
        arm
          .box([-3 + (s > 0 ? 1 : 0), -11, -2], [3 + (s > 0 ? 1 : 0), -5, 4], 'stoneLight')
          .box([-3 + (s > 0 ? 1 : 0), -11, 4], [3 + (s > 0 ? 1 : 0), -6, 4], 'stoneLight')
          // Dark knuckle band so the fist never melts into the pale leg column in profile.
          .box([-3 + (s > 0 ? 1 : 0), -7, -2], [3 + (s > 0 ? 1 : 0), -7, 4], 'stoneDark')
      }
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'smash', stride: 0.35, bob: 1.0, heavy: true, armSpread: 0.16 })
    pose.torso = { ...pose.torso, rx: (pose.torso?.rx ?? 0) + 0.14 }
    // Keep the stone face (and its ember eyes) toward the camera through the smash lean.
    pose.head = { ...pose.head, rx: (pose.head?.rx ?? 0) - 0.42 }
    return pose
  }
}
