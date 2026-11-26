import { bipedPose, TAU, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 槍の斥候 — a tall, agile scout with long striding legs, bold streaming crimson scarf,
 * bright ivory headband over spiky hair, and a sleek tapered steel-tipped spear held diagonally.
 */
export const runner: StackDesign = {
  type: 'runner',
  voxel: 2,
  walkDistance: 34,
  portraitCrop: 0.62,
  portraitYaw: -0.22,
  portraitFocusY: 0.06,
  shadow: [7, 6],
  blueprint: {
    id: 'runner',
    density: 2,
    colors: {
      skin: '#f7c192',
      eye: '#241810',
      shine: '#ffffff',
      cheek: '#eb7d6a',
      jerkin: '#f5b33d',
      jerkinDark: '#bd7218',
      scarf: '#eb3131',
      scarfDark: '#a61722',
      hair: '#3a2214',
      band: '#fff6de',
      pants: '#45485e',
      boot: '#30231c',
      shaft: '#9e622c',
      blade: '#f2f9ff',
      bladeDark: '#8ea8bf'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          brow: 'hair',
          legs: 'pants',
          boots: 'boot',
          torso: 'jerkin',
          torsoTrim: 'jerkinDark',
          belt: 'jerkinDark',
          sleeve: 'jerkin',
          hands: 'skin'
        },
        { torsoHalf: 3, torsoDepth: 3, legs: 8, armLength: 7 }
      )
      b.head.paint((x, y, z) => (z < 1 && y >= 1 ? 'hair' : y >= 6 && z < 3 ? 'hair' : undefined))
      // Swept spiky anime scout hair above the ivory headband (zero blocky top-hat silhouette!).
      for (const [x, z, dx, h] of [
        [-2.8, -1.2, -1.0, 10.6],
        [-1.0, -2.0, -0.4, 11.2],
        [1.2, -1.8, 0.8, 11.0],
        [2.6, -0.6, 1.1, 10.4],
        [0.0, 0.2, 0.2, 10.8],
        [-1.8, 0.8, -0.8, 10.3]
      ] as const)
        b.head.segment([x, 8.4, z], [x + dx, h, z - 1.2], 1.15, 'hair', 0.35)
      // Slim ivory headband (single row so rear view doesn't look like a thick white bandage).
      b.head.fill([-6, 7, -6], [5, 7, 5], 'band', (x, y, z) => {
        const d = Math.hypot(x / 5.0, z / 4.8)
        return d <= 1.04 && d > 0.76
      })
      b.head.box([-1, 6, -6], [0, 7, -5], 'band').box([-1, 4, -7], [0, 5, -6], 'band')
      // Bold crimson scarf collar + draped folded tail (never sticking straight out like a T-pose!).
      b.torso.fill([-5, 5, -4], [4, 7, 4], 'scarf', (x, y, z) => Math.hypot(x / 3.9, z / 3.4) <= 1.15)
      const cape = kit.part('cape', 'torso', [1, 6.2, -3.2])
      cape.box([-1, -1, -5], [0, 0, -1], 'scarf').box([-1, -3, -7], [0, -1, -5], 'scarfDark')
      // Sleek tapered high-res spear held firmly in right fist.
      const spear = kit.part('weapon', 'armR', [0, b.hand, 1])
      spear
        .rawBox([0, 0, -14], [2, 2, 24], 'shaft')
        .rawBox([-2, -1, 22], [4, 3, 24], 'scarf')
        .rawBox([0, 0, 25], [2, 2, 30], 'bladeDark')
        .rawBox([0, 0, 31], [2, 2, 34], 'blade')
        .rawBox([0, 0, 35], [1, 1, 38], 'blade')
        .rawSet(1, 1, 39, 'blade')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'thrust', stride: 0.8, bob: 1.1 })
    // Negative rx rotates the -z scarf tail DOWNWARD along the back (no T-pose / sticking-out bar!).
    pose.cape = { rx: -0.82 + 0.08 * Math.sin(input.time * 2.5 + input.seed * TAU) }
    if (input.motion === 'idle') {
      pose.torso = { ...pose.torso, rx: 0.1 }
      pose.armR = { ...pose.armR, rx: -0.4 }
      pose.weapon = { rx: -0.35 }
    }
    if (input.motion === 'walk') pose.cape = { rx: -0.32 + 0.14 * Math.sin(input.cycle * TAU * 2) }
    return pose
  }
}
