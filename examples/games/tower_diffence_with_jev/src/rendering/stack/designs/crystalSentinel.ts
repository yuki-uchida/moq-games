import { bipedPose, TAU, type StackDesign } from '../StackDesign'

/**
 * 水晶の番兵 — an obsidian-slate construct on the unified voxel=2 grid bound by glowing neon-violet
 * crystal veins, towering amethyst shoulder spires, a blazing cyclops eye-gem and orbiting shards.
 */
export const crystalSentinel: StackDesign = {
  type: 'crystalSentinel',
  voxel: 2,
  walkDistance: 26,
  portraitCrop: 0.56,
  portraitYaw: -0.32,
  shadow: [11, 9],
  blueprint: {
    id: 'crystalSentinel',
    colors: {
      stone: '#525670',
      stoneDark: '#2f3247',
      stoneLight: '#858bad',
      crystal: '#9657f5',
      crystalLight: '#e0c7ff',
      crystalDark: '#5426a3',
      '*gem': '#ffffff',
      '*vein': '#cf8cff'
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
        .box([-7, 0, -5], [6, 10, 5], 'stone')
        .box([-7, 10, -5], [6, 10, 5], 'stoneLight')
        .box([-5, 0, -4], [4, 0, 4], 'stoneDark')
      torso.box([-1, 1, 6], [0, 9, 6], '*vein').box([-6, 5, 6], [5, 5, 6], '*vein')
      for (const [x, z, h] of [
        [-6, -2, 7],
        [4, -3, 9],
        [-1, -4, 11],
        [5, 1, 6]
      ])
        torso.cylinder(x + 0.5, z + 0.5, 11, 11 + h, 1.9, 0.45, 'crystal')
      torso.paint((x, y, z) => (y > 13 && x < 0 ? 'crystalLight' : y > 11 && z < -3 ? 'crystalDark' : undefined))
      // Deep shoulder spires push the side silhouette away from a flat stone slab.
      for (const z of [-5.5, 5]) {
        torso.cylinder(0.5, z, 7, 13, 1.7, 0.55, 'crystal')
        torso.cylinder(0.5, z, 13, 15, 0.9, 0.3, 'crystalLight')
      }

      const head = kit.part('head', 'torso', [0, 11, 0.5])
      head
        .box([-4, 0, -4], [3, 7, 4], 'stone')
        .box([-4, 7, -4], [3, 7, 4], 'stoneLight')
        .box([-3, 2, 5], [2, 5, 5], 'stoneDark')
      head.box([-1, 3, 5], [0, 4, 6], '*gem')
      // Profile gem so the cyclops face still reads from the side.
      head.box([-5, 3, 0], [-4, 4, 2], '*gem').box([4, 3, 0], [5, 4, 2], '*vein')
      // Dark jaw/neck cut separates the head silhouette from the shoulder slab.
      head.box([-3, -1, 1], [2, 0, 4], 'stoneDark')

      const shards = kit.part('shards', 'head', [0, 4.5, 0])
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU
        const x = Math.sin(a) * 7.5
        const z = Math.cos(a) * 7.5
        shards.segment([x, -1, z], [x, 3, z], 1.2, i === 1 ? 'crystalLight' : 'crystal', 0.35)
      }

      for (const [name, x] of [
        ['armL', 8.5],
        ['armR', -8.5]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 9, 0])
        arm.box([-1, -6, -1], [1, 1, 1], 'stone').box([-1, -3, -1], [1, -3, 1], '*vein')
        // Fists sit at hip height with a dark gap to the torso in profile.
        arm.ellipsoid([0, -5.5, 0.5], [2.7, 2.9, 2.9], 'crystal')
        arm.cylinder(0.5, 0.5, -9, -5.5, 1.4, 0.35, 'crystalLight')
      }
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'smash', stride: 0.35, bob: 0.5, heavy: true, armSpread: 0.25 })
    // Stagger the fists in depth so the side view separates them from the slab torso.
    pose.armL = { ...pose.armL, z: 3.5 }
    pose.armR = { ...pose.armR, z: -3 }
    pose.shards = { ry: input.time * 1.4 + input.seed * TAU, y: Math.sin(input.time * 2 + input.seed) * 0.9 }
    return pose
  }
}
