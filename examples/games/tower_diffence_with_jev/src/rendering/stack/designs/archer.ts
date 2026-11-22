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
      skin: '#ffc89e',
      eye: '#182419',
      shine: '#ffffff',
      cheek: '#eb8674',
      hood: '#2c7a3b',
      hoodDark: '#1d5428',
      tunic: '#57b848',
      leaf: '#b8f056',
      leather: '#8c552b',
      boot: '#52301a',
      wood: '#e8bc66',
      string: '#fff7e0',
      quiver: '#6e3f1e',
      fletch: '#fff3c4',
      hair: '#d97b29'
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
      // Longbow in the left hand: chunky 2px limbs so diagonals stay solid when turning.
      const bow = kit.part('offhand', 'armL', [-0.5, b.hand, 0.5])
      for (let z = -9; z <= 9; z++) {
        const y = Math.round(2.6 * (z / 9) ** 2)
        bow.box([-1, y, z], [0, y + 1, z], Math.abs(z) < 2 ? 'leather' : 'wood')
      }
      bow.box([0, 3, -8], [0, 3, 8], 'string')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'bow', stride: 0.55 })
}
