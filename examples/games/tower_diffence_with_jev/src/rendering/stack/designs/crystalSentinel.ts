import { bipedPose, TAU, type StackDesign } from '../StackDesign'

/**
 * 水晶の番兵 — a construct of grey keystone blocks bound by violet crystal veins: a crystal
 * spire grows from its shoulders, one glowing eye-gem sits in a featureless face plate, and
 * three loose shards orbit its head. Its fists are crystal clusters.
 */
export const crystalSentinel: StackDesign = {
  type: 'crystalSentinel',
  voxel: 2.1,
  walkDistance: 26,
  shadow: [10, 8],
  blueprint: {
    id: 'crystalSentinel',
    colors: {
      stone: '#8c8a99',
      stoneDark: '#646274',
      stoneLight: '#b6b3c4',
      crystal: '#9c8cc7',
      crystalLight: '#d6ccf2',
      crystalDark: '#6a5a9c',
      '*gem': '#f1e6ff',
      '*vein': '#c6a8ff'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 6, 0])
      hips.box([-4, -1, -3], [3, 1, 3], 'stoneDark')
      for (const [name, x] of [
        ['legL', 3],
        ['legR', -3]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, -0.5, 0])
        leg.box([-2, -6, -2], [1, -1, 2], 'stone').box([-2, -4, -2], [1, -4, 2], '*vein')
      }
      const torso = kit.part('torso', 'hips', [0, 1.5, 0])
      torso
        .box([-6, 0, -4], [5, 9, 4], 'stone')
        .box([-6, 9, -4], [5, 9, 4], 'stoneLight')
        .box([-4, 0, -3], [3, 0, 3], 'stoneDark')
      torso.box([-1, 1, 5], [0, 8, 5], '*vein').box([-5, 4, 5], [4, 4, 5], '*vein')
      for (const [x, z, h] of [
        [-5, -2, 6],
        [3, -3, 8],
        [-1, -3, 10],
        [4, 1, 5]
      ])
        torso.cylinder(x + 0.5, z + 0.5, 10, 10 + h, 1.7, 0.4, 'crystal')
      torso.paint((x, y, z) => (y > 12 && x < 0 ? 'crystalLight' : y > 10 && z < -3 ? 'crystalDark' : undefined))
      const head = kit.part('head', 'torso', [0, 10, 0.5])
      head
        .box([-3, 0, -3], [2, 6, 3], 'stone')
        .box([-3, 6, -3], [2, 6, 3], 'stoneLight')
        .box([-2, 2, 4], [1, 4, 4], 'stoneDark')
      head.box([-1, 3, 5], [0, 4, 5], '*gem')
      const shards = kit.part('shards', 'head', [0, 4, 0])
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU
        const x = Math.sin(a) * 7,
          z = Math.cos(a) * 7
        shards.segment([x, -1, z], [x, 2.5, z], 1.1, i === 1 ? 'crystalLight' : 'crystal', 0.3)
      }
      for (const [name, x] of [
        ['armL', 7.5],
        ['armR', -7.5]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 8, 0])
        arm.box([-1, -6, -1], [1, 1, 1], 'stone').box([-1, -3, -1], [1, -3, 1], '*vein')
        arm.ellipsoid([0, -8.5, 0.5], [2.4, 2.6, 2.6], 'crystal')
        arm.cylinder(0.5, 0.5, -12, -9, 1.2, 0.3, 'crystalLight')
      }
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'smash', stride: 0.35, bob: 0.5, heavy: true, armSpread: 0.25 })
    pose.shards = { ry: input.time * 1.4 + input.seed * TAU, y: Math.sin(input.time * 2 + input.seed) * 0.8 }
    return pose
  }
}
