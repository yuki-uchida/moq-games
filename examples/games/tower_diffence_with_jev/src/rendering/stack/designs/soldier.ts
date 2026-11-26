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
    density: 2,
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
      torso.fill([-4, 0, -3], [3, 6, 3], 'tabard', (x, y, z) => {
        const taper = 0.92 + 0.08 * Math.min(1, y / 6)
        return (Math.abs(x) / (4 * taper)) ** 4 + (Math.abs(z) / (3.4 * taper)) ** 4 <= 1.05
      })
      torso.rawPaint((_gx, gy) => (gy === 0 ? 'tabardDark' : gy === 13 ? 'gold' : undefined))
      // Crisp 2x high-res crenellated white castle-tower emblem on chest.
      torso
        .rawBox([-2, 2, 7], [1, 8, 7], 'emblem')
        .rawBox([-3, 8, 7], [2, 10, 7], 'emblem')
        .rawSet(-3, 11, 7, 'emblem')
        .rawSet(-1, 11, 7, 'emblem')
        .rawSet(0, 11, 7, 'emblem')
        .rawSet(2, 11, 7, 'emblem')
        .rawBox([-1, 2, 7], [0, 4, 7], 'tabardDark')
      // Short royal cape on back so side & back views have real silhouette depth.
      const cape = kit.part('cape', 'torso', [0, 6, -3.5])
      cape.box([-4, -6, -1], [3, 0, 0], 'cape').rawBox([-8, -12, -2], [7, -12, 1], 'gold')

      const head = kit.part('head', 'torso', [0, 7, 0.5])
      head.ellipsoid([0, 4.7, 0], [4.8, 4.9, 4.7], 'skin')
      // Full back-of-head hair + steel neck guard so rear view never looks bald!
      head.paint((x, y, z) => (z < 1 && y >= 2 ? 'hair' : z < 1 && y < 2 ? 'steelDark' : undefined))
      // Steel helm tilted slightly back with curved brow bevel & gleaming royal crest.
      head.ellipsoid([0, 7.2, -0.8], [5.4, 1.0, 5.2], 'steelDark')
      head.ellipsoid([0, 7.8, -0.8], [4.9, 3.2, 4.8], 'steel')
      head.rawBox([-2, 14, 7], [1, 14, 8], 'gold')
      head.segment([0, 10.5, -3.5], [0, 12.2, 2.5], 0.95, 'crest', 0.85)
      head.segment([0, 12.0, -2.5], [0, 13.0, 0.8], 0.8, 'crest', 0.55)
      // High-res 19x19 heroic face: 3x4 eyes, crisp 1px catchlight, arched brows, smile, blush & ears.
      for (const gx of [-6, -5, -4, 3, 4, 5]) {
        for (let dy = 0; dy < 4; dy++) head.rawFace(gx, 6 + dy, 'eye', '+z', 2)
        head.rawFace(gx, 11, 'hair', '+z', 2)
      }
      head.rawFace(-5, 9, 'shine', '+z', 2).rawFace(3, 9, 'shine', '+z', 2)
      head.rawFace(-7, 5, 'cheek', '+z', 2).rawFace(-6, 5, 'cheek', '+z', 2)
      head.rawFace(5, 5, 'cheek', '+z', 2).rawFace(6, 5, 'cheek', '+z', 2)
      head.rawFace(-1, 4, 'cheek', '+z', 2).rawFace(0, 4, 'cheek', '+z', 2)
      head.rawBox([-10, 5, -2], [-10, 8, -1], 'skin').rawBox([9, 5, -2], [9, 8, -1], 'skin')

      for (const [name, x] of [
        ['armL', 5],
        ['armR', -5]
      ] as const) {
        const arm = kit.part(name, 'torso', [x, 6, 0])
        arm
          .ellipsoid([-0.5, -0.5, 0], [1.6, 1.9, 2.2], 'steel')
          .box([-1, -5, -1], [0, -3, 1], 'tabard')
          .box([-1, -7, -1], [0, -6, 1], 'leather')
      }
      // Tapered knight's broadsword with crisp 2x fuller, beveled edges, gold crossguard & gem pommel.
      const sword = kit.part('weapon', 'armR', [-0.5, -6, 1])
      sword
        .box([0, 0, -3], [1, 1, -2], 'gold')
        .box([0, 0, -1], [1, 1, 1], 'leather')
        .box([-3, 0, 1], [3, 1, 2], 'gold')
        .rawBox([-2, 0, 6], [3, 2, 21], 'blade')
        .rawBox([0, 2, 6], [1, 2, 19], 'steelDark')
        .rawBox([-1, 0, 22], [2, 2, 24], 'blade')
        .rawBox([0, 0, 25], [1, 1, 26], 'blade')
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
