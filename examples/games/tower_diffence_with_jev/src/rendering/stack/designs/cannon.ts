import { bipedPose, strike, track, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 火薬の工兵 — a stout powder engineer with brass goggles on a leather cap, a soot-streaked
 * orange coat and apron, standing beside a squat bronze cannon on two spoked wheels.
 */
export const cannon: StackDesign = {
  type: 'cannon',
  voxel: 2,
  walkDistance: 26,
  shadow: [11, 8],
  emitter: { part: 'barrel', at: [0, 0, 11] },
  blueprint: {
    id: 'cannon',
    colors: {
      skin: '#e8b48a',
      eye: '#2a1b12',
      shine: '#ffffff',
      cheek: '#d98a6a',
      coat: '#e9a65f',
      coatDark: '#b8763a',
      apron: '#6b4a33',
      cap: '#7a5232',
      goggle: '#d8a83e',
      lens: '#8fd6e8',
      boot: '#3f2c20',
      bronze: '#b8823c',
      bronzeDark: '#7d5326',
      bore: '#221812',
      wood: '#7a5431',
      iron: '#555c63',
      beard: '#9a4d22',
      '*fuse': '#ffcf4a'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          legs: 'apron',
          boots: 'boot',
          torso: 'coat',
          torsoTrim: 'coatDark',
          belt: 'apron',
          sleeve: 'coat',
          hands: 'skin'
        },
        { torsoHalf: 5, torsoDepth: 3, legs: 5 }
      )
      b.head.paint((x, y, z) => (y <= 2 && z >= 1 ? 'beard' : undefined))
      // Leather cap with goggles pushed up on the brow.
      b.head.fill([-6, 6, -6], [5, 10, 5], 'cap', (x, y, z) => Math.hypot(x / 4.7, (y - 6) / 3.6, z / 4.5) <= 1)
      for (const x of [-3, 1])
        b.head
          .box([x, 7, 4], [x + 1, 8, 4], 'goggle')
          .set(x, 7, 5, 'lens')
          .set(x + 1, 8, 5, 'lens')
      b.head.paint((x, y, z, c) => (y === 7 && z < 4 && Math.hypot(x + 0.5, z + 0.5) > 3.6 ? 'goggle' : undefined))
      // Apron and soot.
      b.torso.box([-3, 0, 4], [2, 5, 4], 'apron').box([-3, 5, 4], [-3, 5, 4], 'coatDark')
      b.hips.box([-3, -3, 4], [2, 1, 4], 'apron')
      // Linstock in the right hand with a glowing slow match.
      const stick = kit.part('weapon', 'armR', [0, b.hand, 0])
      stick.box([0, 0, -1], [0, 0, 7], 'wood').box([0, 1, 7], [0, 1, 7], '*fuse')
      // Cannon on its carriage, its own root on the ground to the engineer's right and front.
      const carriage = kit.part('carriage', undefined, [-6, 0, 7])
      carriage.box([-2, 2, -5], [1, 3, 4], 'wood')
      for (const x of [-4, 3]) {
        carriage.fill(
          [x, 0, -3],
          [x, 6, 3],
          'wood',
          (cx, y, z) => Math.hypot(y - 3, z) <= 3 && Math.hypot(y - 3, z) > 2
        )
        carriage.fill(
          [x, 0, -3],
          [x, 6, 3],
          'iron',
          (cx, y, z) =>
            Math.hypot(y - 3, z) <= 1 || ((Math.abs(y - 3) < 0.6 || Math.abs(z) < 0.6) && Math.hypot(y - 3, z) <= 2.6)
        )
      }
      const barrel = kit.part('barrel', 'carriage', [0, 5, -1])
      barrel.fill([-3, -3, -5], [3, 3, 11], 'bronze', (x, y, z) => {
        const r = 2.9 - Math.max(0, z) * 0.05
        return Math.hypot(x, y) <= r && z <= 10
      })
      barrel.fill([-3, -3, 9], [3, 3, 10], 'bronzeDark', (x, y, z) => Math.hypot(x, y) <= 3.3)
      barrel.fill([-1, -1, 10], [0, 0, 10], 'bore', (x, y) => Math.hypot(x, y) <= 1.2)
      barrel.fill([-3, -3, -5], [3, 3, -4], 'bronzeDark', (x, y) => Math.hypot(x, y) <= 2.4)
      barrel.box([0, 3, -3], [0, 3, -3], '*fuse')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'stab', stride: 0.4, bob: 0.6, heavy: true })
    if (input.motion === 'attack') {
      const ms = input.seconds * 1000
      const cue = input.cueMs
      // The engineer touches the match to the vent, the barrel kicks back on the cue.
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
      pose.barrel = { z: -2.5 * kick, rx: -0.12 - 0.25 * kick }
      pose.carriage = { z: -1 * kick }
    } else pose.barrel = { rx: -0.12 }
    return pose
  }
}
