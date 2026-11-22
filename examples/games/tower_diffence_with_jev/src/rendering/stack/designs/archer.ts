import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 森の射手 — a forest archer in a deep leaf-green hood and short cape, a leaf clasp at the
 * throat, a tall pale-wood longbow and a quiver of fletched arrows on the back.
 */
export const archer: StackDesign = {
  type: 'archer',
  voxel: 2,
  walkDistance: 30,
  shadow: [7, 6],
  emitter: { part: 'offhand', at: [0, 0, 0] },
  blueprint: {
    id: 'archer',
    colors: {
      skin: '#f0c59b',
      eye: '#22301f',
      shine: '#ffffff',
      cheek: '#e5977f',
      hood: '#4f7f3a',
      hoodDark: '#36592a',
      tunic: '#8fb85b',
      leaf: '#c6e07a',
      leather: '#83593a',
      boot: '#5a3b26',
      wood: '#d9b77a',
      string: '#f3eedb',
      quiver: '#6e4a2f',
      fletch: '#f1e6c4',
      hair: '#c7843f'
    },
    build(kit) {
      const b = human(kit, {
        skin: 'skin',
        eye: 'eye',
        shine: 'shine',
        cheek: 'cheek',
        legs: 'leather',
        boots: 'boot',
        torso: 'tunic',
        belt: 'leather',
        sleeve: 'tunic',
        hands: 'leather'
      })
      // Hood: a shell over the head, open in front, with a drooping point at the back.
      b.head.paint((x, y, z) => (y >= 7 && z < 2 ? 'hair' : undefined))
      b.head.fill([-6, 2, -6], [5, 11, 5], 'hood', (x, y, z) => {
        const d = Math.hypot(x / 5.2, (y - 4.6) / 5.3, z / 5)
        return d <= 1 && d > 0.78 && !(z > 1.5 && y < 7.5)
      })
      b.head.segment([0, 8, -4], [0, 4, -7], 1.4, 'hoodDark', 0.6)
      // Short cape and leaf clasp.
      const cape = kit.part('cape', 'torso', [0, 6, -2.5])
      cape.box([-4, -6, -1], [3, 0, -1], 'hood').box([-4, -6, -1], [3, -6, -1], 'hoodDark')
      b.torso.box([-1, 5, 3], [0, 6, 3], 'leaf')
      // Quiver on the back with fletchings.
      b.torso.box([1, 1, -4], [2, 7, -3], 'quiver').box([1, 8, -4], [2, 9, -3], 'fletch').set(1, 10, -4, 'fletch')
      // Longbow in the left hand: limbs curl back from the grip along local z.
      const bow = kit.part('offhand', 'armL', [-0.5, b.hand, 0.5])
      for (let z = -9; z <= 9; z++) {
        const y = Math.round(2.6 * (z / 9) ** 2)
        bow.box([0, y, z], [0, y + (Math.abs(z) < 2 ? 1 : 0), z], Math.abs(z) < 2 ? 'leather' : 'wood')
      }
      bow.box([0, 3, -8], [0, 3, 8], 'string')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'bow', stride: 0.55 })
}
