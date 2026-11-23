import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 森の射手 — a woodland ranger-archer in a vivid sea-teal tunic and cream-gold scarf
 * (pops cleanly off meadow grass!), pointed teal hood, crimson-fletched quiver on the back,
 * and a tall pale-wood recurve bow held high above the shoulder with clear daylight behind the string.
 */
export const archer: StackDesign = {
  type: 'archer',
  voxel: 2,
  walkDistance: 30,
  portraitCrop: 0.64,
  portraitYaw: -0.22,
  portraitFocusY: 0.1,
  shadow: [7, 6],
  emitter: { part: 'offhand', at: [0, 3, 2] },
  blueprint: {
    id: 'archer',
    colors: {
      skin: '#ffc89e',
      eye: '#162426',
      shine: '#ffffff',
      cheek: '#f08274',
      hood: '#1a7a72',
      hoodDark: '#104f4d',
      tunic: '#2aa697',
      scarf: '#fff0c2',
      gold: '#f2be38',
      leather: '#8a5228',
      boot: '#4f2d18',
      wood: '#f0c46c',
      string: '#fff9e6',
      quiver: '#73401c',
      fletch: '#e84338',
      hair: '#d97824'
    },
    build(kit) {
      const b = human(kit, {
        skin: 'skin',
        eye: 'eye',
        shine: 'shine',
        cheek: 'cheek',
        brow: 'hair',
        legs: 'leather',
        boots: 'boot',
        torso: 'tunic',
        torsoTrim: 'gold',
        belt: 'leather',
        sleeve: 'tunic',
        hands: 'leather'
      })
      // Pointed hood pulled back slightly so brow, hair fringe, and bright eyes read cleanly.
      b.head.paint((x, y, z) => (y >= 7 && z < 3 ? 'hair' : undefined))
      b.head.fill([-6, 2, -6], [5, 11, 4], 'hood', (x, y, z) => {
        const d = Math.hypot(x / 5.4, (y - 5.0) / 5.5, (z + 0.8) / 5.2)
        return d <= 1 && d > 0.76 && !(z > 0.5 && y < 8.2)
      })
      b.head.segment([0, 9, -4], [0, 5, -8], 1.7, 'hoodDark', 0.7)
      // Flowing woodland cape + bright cream-gold scarf clasp.
      const cape = kit.part('cape', 'torso', [0, 6, -3.5])
      cape.box([-4, -7, -1], [3, 0, 0], 'hood').box([-4, -7, -1], [3, -7, 0], 'gold')
      b.torso.box([-3, 5, 3], [2, 6, 4], 'scarf').box([-1, 5, 4], [0, 6, 4], 'gold')
      // Quiver with bright crimson arrow fletchings jutting above shoulder.
      b.torso
        .box([1, 1, -5], [3, 7, -3], 'quiver')
        .box([1, 8, -5], [3, 10, -4], 'fletch')
        .box([2, 10, -5], [2, 11, -5], 'scarf')
      // Tall recurve bow held upright in left fist with clear gap between grip and torso.
      const bow = kit.part('offhand', 'armL', [1, b.hand + 1, 2])
      for (let y = -7; y <= 10; y++) {
        const z = 3 - Math.round(2.8 * (y / 10) ** 2)
        bow.box([-1, y, z], [0, y, z + 1], Math.abs(y) < 2 ? 'leather' : 'wood')
      }
      bow.box([0, -6, 0], [0, 9, 0], 'string')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'bow', stride: 0.55 })
    if (input.motion === 'idle') {
      pose.armL = { ...pose.armL, rx: -0.45, rz: 0.25 }
      pose.offhand = { rx: 0.45 }
    }
    return pose
  }
}
