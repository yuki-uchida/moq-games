import { bipedPose, type StackDesign } from '../StackDesign'

/**
 * 小さな剣士 — the castle's squire knight. Gleaming steel helm with a tall royal-blue crest,
 * expressive heroic face under a dark brow rim, cobalt tabard with a crisp white tower emblem,
 * short royal cape, broad short sword gripped firmly in the fist, and round heraldic buckler.
 */
export const soldier: StackDesign = {
  type: 'soldier',
  voxel: 2,
  walkDistance: 30,
  portraitCrop: 0.62,
  portraitYaw: -0.34,
  shadow: [7, 6],
  blueprint: {
    id: 'soldier',
    colors: {
      skin: '#ffcca3',
      cheek: '#f08278',
      eye: '#151b2b',
      shine: '#ffffff',
      steel: '#d2e0ef',
      steelDark: '#697d99',
      crest: '#2278e8',
      tabard: '#246ee0',
      tabardDark: '#17489c',
      cape: '#1f5ec7',
      emblem: '#fff9eb',
      leather: '#8a5028',
      boot: '#472a18',
      blade: '#f2f9ff',
      gold: '#f7c234',
      hair: '#78441e'
    },
    build(kit) {
      const hips = kit.part('hips', undefined, [0, 6, 0])
      hips.box([-4, 0, -3], [3, 1, 3], 'leather').box([-1, 0, 3], [0, 1, 3], 'gold')
      for (const [name, x] of [
        ['legL', 2],
        ['legR', -2]
      ] as const) {
        const leg = kit.part(name, 'hips', [x, 0.5, 0])
        leg
          .box([-1, -5, -1], [0, -1, 1], 'tabardDark')
          .box([-1, -6, -1], [0, -5, 2], 'boot')
          .box([-1, -4, -1], [0, -4, 1], 'leather')
      }
      const torso = kit.part('torso', 'hips', [0, 2, 0])
      torso
        .box([-4, 0, -3], [3, 6, 3], 'tabard')
        .box([-4, 0, -3], [3, 0, 3], 'tabardDark')
        .box([-3, 6, -3], [2, 6, 3], 'gold')
      // Crisp white castle-tower emblem on chest.
      torso.box([-1, 1, 4], [0, 4, 4], 'emblem').box([-2, 4, 4], [1, 5, 4], 'emblem')
      // Short royal cape on back so side & back views have real silhouette depth.
      const cape = kit.part('cape', 'torso', [0, 6, -3.5])
      cape.box([-4, -6, -1], [3, 0, 0], 'cape').box([-4, -6, -1], [3, -6, 0], 'gold')

      const head = kit.part('head', 'torso', [0, 7, 0.5])
      head.ellipsoid([0, 4.7, 0], [4.7, 4.8, 4.5], 'skin')
      // Full back-of-head hair + steel neck guard so rear view never looks bald!
      head.paint((x, y, z) => (z < 1 && y >= 2 ? 'hair' : z < 1 && y < 2 ? 'steelDark' : undefined))
      // Steel helm tilted slightly back so the face and eyes read boldly from 3/4 top-down.
      head.ellipsoid([0, 7.2, -0.8], [5.4, 1.0, 5.2], 'steelDark')
      head.ellipsoid([0, 7.8, -0.8], [4.9, 3.2, 4.8], 'steel')
      head.box([-1, 10, -4], [0, 12, 3], 'crest').box([-1, 12, -3], [0, 13, 1], 'crest')
      // Bold eyes + catchlight + brow + side wrap + cheeks.
      for (const x of [-3, -2, 1, 2]) head.face(x, 3, 'eye').face(x, 4, 'eye').face(x, 5, 'hair')
      head.face(-2, 4, 'shine').face(2, 4, 'shine')
      head.face(-4, 2, 'cheek').face(3, 2, 'cheek')
      head.set(4, 3, 2, 'eye').set(-5, 3, 2, 'eye')

      for (const [name, x] of [
        ['armL', 5],
        ['armR', -5]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 6, 0])
        arm
          .box([-1, -2, -2], [0, 1, 2], 'steel')
          .box([-1, -5, -1], [0, -3, 1], 'tabard')
          .box([-1, -7, -1], [0, -6, 1], 'leather')
      }
      // Broad knight's sword with crisp gold crossguard, pommel, center steel fuller & tapered point.
      const sword = kit.part('weapon', 'armR', [-0.5, -6, 1])
      sword
        .box([0, 0, -3], [1, 1, -2], 'gold')
        .box([0, 0, -1], [1, 1, 1], 'leather')
        .box([-3, 0, 1], [3, 1, 2], 'gold')
        .box([-1, 0, 3], [1, 1, 10], 'blade')
        .box([0, 1, 3], [0, 1, 9], 'steelDark')
        .box([0, 0, 11], [0, 1, 13], 'blade')
      // Round heraldic buckler snug against left forearm.
      const buckler = kit.part('offhand', 'armL', [1, -4.5, 1])
      buckler.fill([0, -4, -4], [1, 4, 4], 'crest', (x, y, z) => x < 2 && Math.hypot(y, z) <= 3.8)
      buckler.paint((x, y, z) => (Math.hypot(y + 0.5, z + 0.5) <= 2.3 ? 'steel' : undefined))
      buckler.paint((x, y, z) => (Math.abs(y + 0.5) < 1 && Math.abs(z + 0.5) < 1 ? 'gold' : undefined))
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'slash', stride: 0.6, bob: 0.8 })
    if (input.motion === 'idle') {
      pose.armR = { ...pose.armR, rx: -0.35 }
      pose.weapon = { rx: -0.25 }
    }
    return pose
  }
}
