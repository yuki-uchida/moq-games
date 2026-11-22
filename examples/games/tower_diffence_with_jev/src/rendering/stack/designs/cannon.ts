import { bipedPose, strike, track, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 火薬の工兵 — a stout powder engineer in a bright saffron coat, dark leather apron, and glowing
 * cyan-lensed brass goggles, separated cleanly from a dark gunmetal-iron & gleaming brass wheeled
 * cannon with a deep black bore and bright gold muzzle ring.
 */
export const cannon: StackDesign = {
  type: 'cannon',
  voxel: 2,
  walkDistance: 26,
  portraitCrop: 0.54,
  portraitYaw: -0.35,
  shadow: [11, 8],
  emitter: { part: 'barrel', at: [0, 0, 11] },
  blueprint: {
    id: 'cannon',
    colors: {
      skin: '#f5be8e',
      eye: '#26170e',
      shine: '#ffffff',
      cheek: '#e6825c',
      coat: '#f5982e',
      coatDark: '#bf6515',
      apron: '#543522',
      cap: '#6b3e1e',
      goggle: '#f7c534',
      '*lens': '#7aefff',
      boot: '#301d14',
      gunmetal: '#4a5566',
      gunmetalLight: '#8596ad',
      brass: '#f0b830',
      bore: '#121018',
      wood: '#855024',
      iron: '#2e3542',
      beard: '#b04819',
      '*fuse': '#ffe040'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          brow: 'beard',
          legs: 'apron',
          boots: 'boot',
          torso: 'coat',
          torsoTrim: 'coatDark',
          belt: 'apron',
          sleeve: 'coat',
          hands: 'skin'
        },
        { torsoHalf: 5, torsoDepth: 3, legs: 5, headRadius: 4.8, eyeRow: 3 }
      )
      b.head.paint((x, y, z) => (y <= 1 && z >= 2 ? 'beard' : z < 1 && y >= 2 ? 'cap' : undefined))
      // Leather cap with bright gleaming cyan goggles perched high at y=8..9 so eyes read unmistakably below!
      b.head.fill([-6, 7, -6], [5, 10, 5], 'cap', (x, y, z) => Math.hypot(x / 5.0, (y - 7.2) / 3.4, z / 4.8) <= 1)
      for (const x of [-3, 1])
        b.head
          .box([x, 8, 4], [x + 1, 9, 5], 'goggle')
          .set(x, 8, 5, '*lens')
          .set(x + 1, 9, 5, '*lens')
      b.head.paint((x, y, z) => (y === 8 && z < 4 && Math.hypot(x + 0.5, z + 0.5) > 3.8 ? 'goggle' : undefined))
      b.torso.box([-3, 0, 4], [2, 5, 4], 'apron')
      b.hips.box([-3, -3, 4], [2, 1, 4], 'apron')
      // Linstock with glowing slow-match.
      const stick = kit.part('weapon', 'armR', [0, b.hand, 1])
      stick.box([0, 0, -1], [1, 1, 7], 'wood').box([0, 1, 7], [1, 2, 7], '*fuse')
      // Wheeled gunmetal-iron cannon set slightly further out (-8) for clear daylight gap from torso!
      const carriage = kit.part('carriage', undefined, [-8, 0, 6])
      carriage.box([-2, 2, -5], [1, 3, 4], 'wood')
      for (const x of [-4, 3]) {
        carriage.fill(
          [x, 0, -3],
          [x, 6, 3],
          'wood',
          (cx, y, z) => Math.hypot(y - 3, z) <= 3.1 && Math.hypot(y - 3, z) > 1.9
        )
        carriage.fill(
          [x, 0, -3],
          [x, 6, 3],
          'iron',
          (cx, y, z) =>
            Math.hypot(y - 3, z) <= 1.1 ||
            ((Math.abs(y - 3) < 0.6 || Math.abs(z) < 0.6) && Math.hypot(y - 3, z) <= 2.6)
        )
      }
      const barrel = kit.part('barrel', 'carriage', [0, 5.5, -1])
      barrel.fill([-3, -3, -5], [3, 3, 10], 'gunmetal', (x, y, z) => {
        const r = 3.0 - Math.max(0, z) * 0.04
        return Math.hypot(x, y) <= r && z <= 10
      })
      // Metallic top highlight stripe + bright gleaming brass bands & muzzle rim + deep dark bore!
      barrel.box([-1, 2, -3], [1, 3, 8], 'gunmetalLight')
      barrel.fill([-3, -3, 9], [3, 3, 10], 'brass', (x, y) => Math.hypot(x, y) <= 3.4)
      barrel.fill([-3, -3, 1], [3, 3, 2], 'brass', (x, y) => Math.hypot(x, y) <= 3.1)
      barrel.fill([-2, -2, 10], [1, 1, 11], 'bore', (x, y) => Math.hypot(x + 0.5, y + 0.5) <= 1.7)
      barrel.fill([-3, -3, -5], [3, 3, -4], 'iron', (x, y) => Math.hypot(x, y) <= 2.5)
      barrel.box([0, 3, -3], [0, 4, -3], '*fuse')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'stab', stride: 0.4, bob: 0.6, heavy: true })
    if (input.motion === 'attack') {
      const ms = input.seconds * 1000
      const cue = input.cueMs
      pose.armR = {
        rx: track(ms, [
          [0, 0],
          [cue * 0.6, -1.3],
          [cue, -1.25],
          [cue + 200, -0.4],
          [input.durationMs, 0]
        ]),
        rz: -0.5,
        ry: 0.4
      }
      pose.torso = {
        ry: track(ms, [
          [0, 0],
          [cue * 0.6, -0.4],
          [cue + 200, -0.2],
          [input.durationMs, 0]
        ])
      }
      const kick =
        ms >= cue
          ? strike(ms, [
              [cue, 0],
              [cue + 60, 1],
              [cue + 500, 0]
            ])
          : 0
      pose.barrel = { z: -2.8 * kick, rx: -0.12 - 0.28 * kick }
      pose.carriage = { z: -1.2 * kick }
    } else pose.barrel = { rx: -0.12 }
    return pose
  }
}
