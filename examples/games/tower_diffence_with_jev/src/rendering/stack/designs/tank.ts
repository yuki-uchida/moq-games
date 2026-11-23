import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 盾の騎士 — a broad, imposing bulwark knight in blued steel plate and royal cobalt pauldrons
 * (reads cleanly even against white snow!), a bucket helm with glowing heroic eyes inside a
 * deep dark T-visor, a towering tower-emblem kite shield, and a gold-trimmed flanged mace.
 */
export const tank: StackDesign = {
  type: 'tank',
  voxel: 2,
  walkDistance: 26,
  portraitCrop: 0.52,
  portraitYaw: -0.14,
  shadow: [10, 8],
  blueprint: {
    id: 'tank',
    colors: {
      plate: '#9eb6d6',
      plateDark: '#4f6485',
      plateLight: '#dce8f8',
      visor: '#101524',
      '*eyeGlow': '#ffe67a',
      gold: '#f7c234',
      cloth: '#1d54bd',
      shield: '#194fb8',
      shieldRim: '#d9e6f7',
      emblem: '#fff9eb',
      mace: '#697a91',
      grip: '#693f1f',
      boot: '#334059'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'plate',
          eye: 'visor',
          legs: 'plateDark',
          boots: 'boot',
          torso: 'plate',
          torsoTrim: 'cloth',
          belt: 'cloth',
          sleeve: 'plateDark',
          hands: 'plate'
        },
        { torsoHalf: 5, torsoDepth: 4, legs: 5, headRadius: 4.5, armLength: 7, coveredSides: true }
      )
      // Taper waist narrower than the broad overhanging pauldrons so side & back views read with heroic knight form!
      b.hips.paint(() => 0)
      b.hips.box([-4, 0, -3], [3, 1, 3], 'cloth').box([-1, 0, 3], [0, 1, 3], 'gold')
      // Sculpted bucket helm with gold brow crest and glowing eyes inside dark T-visor.
      b.head.paint(() => 0)
      b.head
        .box([-4, 0, -3], [3, 8, 3], 'plate')
        .box([-4, 8, -3], [3, 9, 3], 'plateLight')
        .box([-4, 0, -3], [3, 0, 3], 'plateDark')
        .box([-4, 5, 3], [3, 6, 3], 'gold')
        // Side visor slits and ear guards keep the profile from reading as a plain box.
        .box([-4, 3, 0], [-4, 4, 1], 'visor')
        .box([3, 3, 0], [3, 4, 1], 'visor')
        .box([-3, 3, 3], [2, 4, 3], 'visor')
        .box([-1, 1, 3], [0, 4, 3], 'visor')
        .box([-3, 3, 3], [-2, 4, 3], '*eyeGlow')
        .box([1, 3, 3], [2, 4, 3], '*eyeGlow')
        .box([-1, 9, -3], [0, 11, 2], 'gold')
      // Broad sculpted overhanging cobalt-and-gold pauldrons + chest tabard (contrasts strongly on frost snow!).
      for (const x of [-8, 5])
        b.torso
          .box([x, 4, -5], [x + 2, 7, 5], 'cloth')
          .box([x, 7, -4], [x + 2, 8, 4], 'gold')
          .box([x, 3, -4], [x + 2, 3, 4], 'plateDark')
      b.torso.box([-2, 0, 4], [1, 6, 5], 'cloth').box([-1, 2, 5], [0, 4, 5], 'gold')
      b.hips.box([-2, -3, 3], [1, 1, 4], 'cloth')
      // Flowing royal cobalt cape with white tower emblem & gold hem so side & back views never look like a flat slab.
      const cape = kit.part('cape', 'torso', [0, 6, -4.5])
      cape
        .box([-5, -8, -2], [4, 0, 0], 'cloth')
        .box([-5, -8, -2], [4, -8, 0], 'gold')
        .box([-1, -6, -2], [0, -2, -2], 'emblem')
        .box([-2, -3, -2], [1, -2, -2], 'emblem')
      // Towering kite shield held snug against left forearm.
      const shield = kit.part('offhand', 'armL', [0.5, -3, 2])
      const halfWidth = (y: number) => (y > 1 ? 4.8 : 4.8 * Math.max(0, (y + 9) / 10))
      shield.fill([-5, -9, 0], [5, 6, 1], 'shield', (x, y, z) => Math.abs(x - 0.5) <= halfWidth(y) && z < 2)
      shield.paint((x, y) => (Math.abs(x + 0.5 - 0.5) > halfWidth(y + 0.5) - 1.3 || y >= 5 ? 'shieldRim' : undefined))
      for (const [x0, y0, x1, y1] of [
        [-1, -3, 0, 2],
        [-2, 2, 1, 3],
        [-2, 4, -2, 4],
        [0, 4, 0, 4]
      ])
        shield.box([x0, y0, 2], [x1, y1, 2], 'emblem')
      // Chunky flanged mace anchored in right fist.
      const mace = kit.part('weapon', 'armR', [0, b.hand, 1])
      mace
        .box([0, 0, -1], [1, 1, 6], 'grip')
        .box([-1, -1, 7], [2, 2, 10], 'mace')
        .box([-2, 0, 8], [3, 1, 9], 'gold')
        .box([0, -2, 8], [1, 3, 9], 'gold')
        .box([0, 0, 11], [1, 1, 11], 'gold')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'bash', stride: 0.42, bob: 0.6, heavy: true, armSpread: 0.2 })
}
