import { bipedPose, track, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 鷹の狩人 — a hawk hunter in a moss-teal coat and a wide hat with a long tail feather,
 * a brown hawk perched on the left shoulder, and a heavy crossbow for one decisive shot.
 */
export const ranger: StackDesign = {
  type: 'ranger',
  voxel: 2,
  walkDistance: 30,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0, 1, 12] },
  blueprint: {
    id: 'ranger',
    colors: {
      skin: '#f2be91',
      eye: '#182620',
      shine: '#ffffff',
      coat: '#34ad7d',
      coatDark: '#1f7856',
      hat: '#69482a',
      hatBand: '#ebb838',
      feather: '#fff6de',
      featherTip: '#24303a',
      leather: '#8a562c',
      boot: '#472c1a',
      wood: '#995e2c',
      steel: '#bdcbd6',
      hawk: '#a86930',
      hawkLight: '#f5deb0',
      beak: '#ffb824',
      hawkEye: '#121212',
      hair: '#693f1f',
      beard: '#7d4d26'
    },
    build(kit) {
      const b = human(kit, {
        skin: 'skin',
        eye: 'eye',
        shine: 'shine',
        legs: 'leather',
        boots: 'boot',
        torso: 'coat',
        torsoTrim: 'coatDark',
        belt: 'leather',
        sleeve: 'coatDark',
        hands: 'leather'
      })
      b.head.paint((x, y, z) => (y >= 5 && z < 2 ? 'hair' : y <= 2 && z >= 2 ? 'beard' : undefined))
      // Wide-brimmed hat with a band and a long feather sweeping back.
      b.head.fill([-8, 7, -8], [7, 7, 7], 'hat', (x, y, z) => Math.hypot(x / 7, z / 6.4) <= 1)
      b.head.fill([-5, 8, -5], [4, 10, 4], 'hat', (x, y, z) => Math.hypot(x / 4.2, z / 4) <= 1 - (y - 8) * 0.12)
      b.head.fill([-5, 8, -5], [4, 8, 4], 'hatBand', (x, y, z) => Math.hypot(x / 4.2, z / 4) <= 1)
      b.head.segment([3, 9, 0], [5, 12, -7], 0.7, 'feather').set(5, 12, -8, 'featherTip').set(5, 11, -7, 'featherTip')
      // Coat skirt and a strap.
      b.hips.box([-4, -3, -2], [3, -1, 2], 'coat')
      b.torso.paint((x, y, z) => (x === y - 4 && z >= 2 ? 'leather' : undefined))
      // Hawk on the left shoulder.
      const hawk = kit.part('hawk', 'torso', [5, 7.5, -0.5])
      hawk
        .ellipsoid([0, 2, 0], [1.6, 2, 2], 'hawk')
        .ellipsoid([0, 2.4, 1.2], [1.2, 1.2, 1], 'hawkLight')
        .ellipsoid([0, 4.6, 0.5], [1.4, 1.3, 1.4], 'hawk')
        .set(-1, 5, 1, 'hawkEye')
        .set(1, 5, 1, 'hawkEye')
        .set(0, 4, 2, 'beak')
        .set(0, 4, 3, 'beak')
        .box([-2, 1, -3], [1, 1, -2], 'hawk')
      // Heavy crossbow: chunky 2px stock along z, bold steel bow across the front.
      const bow = kit.part('weapon', 'armR', [0, b.hand, 0])
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
    pose.hawk = { ry: 0.3 * Math.sin(input.time * 0.9 + input.seed * 6), y: flap * 2, rx: -flap * 0.4 }
    return pose
  }
}
