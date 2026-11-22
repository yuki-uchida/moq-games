import { bipedPose, track, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 鷹の狩人 — a hawk hunter in a rich deep-teal coat and tilted feathered hat showing a
 * determined gaze, a bold perched golden-brown hawk on the left shoulder (turned forward in
 * portraits so the hawk reads immediately!), and a heavy steel crossbow.
 */
export const ranger: StackDesign = {
  type: 'ranger',
  voxel: 2,
  walkDistance: 30,
  portraitCrop: 0.62,
  portraitYaw: 0.42,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0, 1, 12] },
  blueprint: {
    id: 'ranger',
    colors: {
      skin: '#f2be91',
      eye: '#162420',
      shine: '#ffffff',
      coat: '#258f74',
      coatDark: '#165e4c',
      hat: '#6e4724',
      hatBand: '#f2be38',
      feather: '#fff6de',
      featherTip: '#24303a',
      leather: '#8c5528',
      boot: '#472c1a',
      wood: '#9e6028',
      steel: '#c4d4e0',
      hawk: '#b56e2c',
      hawkDark: '#784218',
      hawkLight: '#fff0c7',
      beak: '#ffbe24',
      hawkEye: '#121212',
      hair: '#693f1f',
      beard: '#784822'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          brow: 'hair',
          legs: 'leather',
          boots: 'boot',
          torso: 'coat',
          torsoTrim: 'coatDark',
          belt: 'leather',
          sleeve: 'coatDark',
          hands: 'leather'
        },
        { headRadius: 4.8, eyeRow: 3 }
      )
      b.head.paint((x, y, z) => (y >= 6 && z < 2 ? 'hair' : y <= 1 && z >= 2 ? 'beard' : undefined))
      // Wide-brimmed hat perched at y=8 and shifted back slightly so eyes & brow show clearly.
      b.head.fill([-8, 8, -9], [7, 8, 5], 'hat', (x, y, z) => Math.hypot(x / 7.2, (z + 1.4) / 6.2) <= 1)
      b.head.fill([-5, 9, -6], [4, 11, 3], 'hat', (x, y, z) => Math.hypot(x / 4.4, (z + 1.4) / 4.2) <= 1 - (y - 9) * 0.12)
      b.head.fill([-5, 9, -6], [4, 9, 3], 'hatBand', (x, y, z) => Math.hypot(x / 4.4, (z + 1.4) / 4.2) <= 1)
      b.head.segment([3, 10, -1], [5, 13, -8], 0.9, 'feather').box([5, 12, -9], [5, 13, -8], 'featherTip')
      // Coat skirt + leather bandolier.
      b.hips.box([-4, -3, -3], [3, -1, 3], 'coat')
      b.torso.paint((x, y, z) => (x === y - 4 && z >= 3 ? 'leather' : undefined))
      // Prominent perched hawk on the left shoulder so it reads clearly in portraits & battlefield!
      const hawk = kit.part('hawk', 'torso', [6.2, 8.2, 1.4])
      hawk
        .ellipsoid([0, 2.2, 0], [2.2, 2.6, 2.5], 'hawk')
        .ellipsoid([0, 2.8, 1.6], [1.7, 1.8, 1.3], 'hawkLight')
        .ellipsoid([0, 5.5, 0.8], [2.0, 1.8, 1.9], 'hawkLight')
        .box([-1, 6, 0], [1, 7, 1], 'hawk')
        .set(-1, 5, 2, 'hawkEye')
        .set(1, 5, 2, 'hawkEye')
        .box([0, 4, 2], [0, 5, 4], 'beak')
        .box([-2, 1, -4], [2, 2, -2], 'hawkDark')
      // Chunky steel crossbow anchored in right fist.
      const bow = kit.part('weapon', 'armR', [0, b.hand, 1])
      bow
        .box([0, 0, -2], [1, 1, 11], 'wood')
        .box([-5, 0, 9], [5, 1, 10], 'steel')
        .box([-6, 0, 8], [-6, 1, 9], 'steel')
        .box([6, 0, 8], [6, 1, 9], 'steel')
        .box([-5, 2, 8], [5, 2, 8], 'feather')
        .box([0, 2, 3], [1, 2, 11], 'steel')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'crossbow', stride: 0.5 })
    const flap =
      input.motion === 'attack'
        ? track(input.seconds * 1000, [
            [0, 0],
            [input.cueMs, 0],
            [input.cueMs + 80, 1],
            [input.cueMs + 500, 0]
          ])
        : 0
    pose.hawk = { ry: 0.25 * Math.sin(input.time * 0.9 + input.seed * 6), y: flap * 2, rx: -flap * 0.4 }
    return pose
  }
}
