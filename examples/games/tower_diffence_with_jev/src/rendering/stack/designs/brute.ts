import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * 岩のブルート — a hunched boulder golem with moss and a sprouting flower on its back,
 * ember-orange eyes deep under a stone brow, stubby legs and two enormous slab fists.
 */
export const brute: StackDesign = {
  type: 'brute',
  voxel: 2.2,
  walkDistance: 26,
  shadow: [11, 9],
  blueprint: {
    id: 'brute',
    colors: {
      stone: '#b8a07a',
      stoneDark: '#7a664a',
      stoneLight: '#e0cfa8',
      crack: '#4a3c2c',
      moss: '#55ad42',
      mossDark: '#36782a',
      petal: '#ffd138',
      '*eye': '#ff9d24'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 5, 0])
      hips.box([-5, -1, -3], [4, 1, 3], 'stoneDark')
      for (const [name, x] of [
        ['legL', 3],
        ['legR', -3]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, -0.5, 0])
        leg.box([-2, -5, -2], [1, 0, 2], 'stoneDark').box([-2, -5, -2], [1, -5, 3], 'stone')
      }
      const torso = kit.part('torso', 'hips', [0, 1, -1])
      torso.fill([-9, 0, -7], [8, 13, 7], 'stone', (x, y, z) => Math.hypot(x / 7.8, (y - 6) / 7, (z + 0.5) / 6) <= 1)
      torso.paint((x, y, z) => (y >= 9 && z < 2 ? 'moss' : y >= 7 && z < -3 ? 'mossDark' : undefined))
      torso.paint((x, y, z) =>
        (x * 3 + y * 5 + z * 7) % 11 === 0 ? 'crack' : (x + y) % 7 === 0 && y < 6 ? 'stoneLight' : undefined
      )
      torso
        .box([2, 13, -2], [2, 14, -2], 'mossDark')
        .box([1, 15, -3], [3, 15, -1], 'petal')
        .set(2, 15, -2, 'stoneLight')
      const head = kit.part('head', 'torso', [0, 8, 5])
      head.box([-3, -2, -1], [2, 2, 3], 'stone').box([-4, 2, -1], [3, 3, 4], 'stoneDark')
      head.set(-2, 0, 4, '*eye').set(1, 0, 4, '*eye').set(-2, 1, 4, '*eye').set(1, 1, 4, '*eye')
      for (const [name, x] of [
        ['armL', 8],
        ['armR', -8]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 10, 0])
        const s = x > 0 ? 1 : -1
        arm.box([-2, -6, -2], [1, 0, 2], 'stoneDark')
        arm
          .box([-3 + (s > 0 ? 1 : 0), -12, -3], [2 + (s > 0 ? 1 : 0), -7, 3], 'stone')
          .box([-3 + (s > 0 ? 1 : 0), -12, 3], [2 + (s > 0 ? 1 : 0), -8, 3], 'stoneLight')
      }
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'smash', stride: 0.35, bob: 0.9, heavy: true, armSpread: 0.15 })
    pose.torso = { ...pose.torso, rx: (pose.torso?.rx ?? 0) + 0.12 }
    return pose
  }
}
