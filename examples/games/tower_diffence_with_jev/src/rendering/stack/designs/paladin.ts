import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 光の守護者 — a radiant guardian in ivory-and-gold plate with a flowing royal cape, bold winged
 * open-faced helm showcasing fierce eyes, a floating dawn halo behind the shoulders, and a giant
 * glowing two-handed warhammer.
 */
export const paladin: StackDesign = {
  type: 'paladin',
  voxel: 2,
  walkDistance: 27,
  portraitCrop: 0.62,
  portraitYaw: -0.32,
  softShade: true,
  shadow: [9, 7],
  blueprint: {
    id: 'paladin',
    colors: {
      skin: '#ffd0a8',
      eye: '#26180d',
      shine: '#ffffff',
      cheek: '#f09080',
      plate: '#faf5e6',
      plateShade: '#c4b693',
      gold: '#f7c234',
      goldDark: '#bd8317',
      tabard: '#246ee0',
      cloth: '#fff9e0',
      boot: '#7a6336',
      haft: '#7a4b24',
      wing: '#ffffff',
      '*sun': '#ffe46b',
      '*sunCore': '#fffbe0'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          brow: 'goldDark',
          legs: 'plateShade',
          boots: 'boot',
          torso: 'plate',
          torsoTrim: 'gold',
          belt: 'goldDark',
          sleeve: 'plateShade',
          hands: 'gold'
        },
        { torsoHalf: 5, torsoDepth: 3, legs: 6, headRadius: 4.8, eyeRow: 3, coveredSides: true }
      )
      // Open-faced winged helm exposing full brow & eyes cleanly (brow lifted to y=8).
      b.head.fill([-6, 1, -6], [5, 11, 5], 'plate', (x, y, z) => {
        const d = Math.hypot(x / 5.4, (y - 5.4) / 5.4, (z + 0.6) / 5.2)
        const openFace =
          (z > 0.8 && y < 8.2 && Math.abs(x) < 4.2) || (Math.abs(x) >= 4.4 && z > -1 && y < 7.5)
        return d <= 1 && d > 0.78 && !openFace
      })
      // Side profile: exposed cheek and one eye inside the open helm.
      b.head.box([-6, 3, 0], [-5, 5, 2], 'skin').box([4, 3, 0], [5, 5, 2], 'skin')
      b.head.box([-6, 2, 1], [-5, 3, 2], 'plateShade').box([4, 2, 1], [5, 3, 2], 'plateShade')
      b.head.set(-6, 4, 2, 'eye').set(5, 4, 2, 'eye')
      b.head.box([-4, 8, 3], [3, 9, 4], 'gold')
      b.head.box([-1, 10, -3], [0, 11, 2], 'gold')
      for (const side of [-1, 1]) {
        const x = side < 0 ? -6 : 5
        b.head
          .box([x, 6, -2], [x, 8, 0], 'wing')
          .box([x + side, 7, -3], [x + side, 9, -1], 'wing')
          .box([x + side * 2, 8, -4], [x + side * 2, 10, -2], 'wing')
      }
      // Royal blue & gold chest tabard + flowing cape (breaks cleanly off white snow!).
      b.torso.box([-2, 0, 4], [1, 5, 4], 'tabard').box([-1, 2, 5], [0, 3, 5], 'gold')
      // Dark collar separates the helm from the white pauldrons in the rear view.
      b.torso.box([-4, 7, -4], [3, 8, -2], 'plateShade')
      for (const x of [-7, 4]) b.torso.box([x, 5, -3], [x + 2, 7, 3], 'gold')
      b.hips.box([-3, -3, 4], [2, 1, 4], 'tabard').box([-3, -3, 4], [2, -3, 4], 'gold')
      const cape = kit.part('cape', 'torso', [0, 6, -3.5])
      cape.box([-5, -8, -1], [4, 0, 0], 'tabard').box([-5, -8, -1], [4, -8, 0], 'gold')
      // Floating sun-disc halo behind the shoulders.
      const halo = kit.part('halo', 'torso', [0, 10, -5.5])
      halo.fill([-7, -7, 0], [6, 7, 0], '*sun', (x, y) => {
        const r = Math.hypot(x, y)
        return r <= 6.4 && r > 5
      })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        halo.set(Math.round(Math.sin(a) * 7.3 - 0.5), Math.round(Math.cos(a) * 7.3 - 0.5), 0, '*sunCore')
      }
      // Giant two-handed dawn hammer anchored in right fist.
      const hammer = kit.part('weapon', 'armR', [0, b.hand, 1])
      hammer.box([0, 0, -4], [1, 1, 11], 'haft').box([0, 0, 4], [1, 1, 4], 'gold')
      hammer
        .box([-3, -2, 11], [3, 2, 15], 'gold')
        .box([-2, -1, 12], [2, 1, 14], '*sun')
        .box([-4, -1, 12], [4, 1, 14], 'goldDark')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'smash', stride: 0.45, bob: 0.6, heavy: true, armSpread: 0.2, ready: -0.5 })
    pose.halo = { y: 0.6 * Math.sin(input.time * 1.6 + input.seed * 4), rz: input.time * 0.4 }
    return pose
  }
}
