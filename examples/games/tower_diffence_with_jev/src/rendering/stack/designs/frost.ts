import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * 霜の術師 — a frost caster bundled in a glacier-blue long coat with a thick white fur hood,
 * mittens, and a staff of pale birch holding a floating six-pointed ice crystal.
 */
export const frost: StackDesign = {
  type: 'frost',
  voxel: 2,
  walkDistance: 27,
  shadow: [8, 6],
  emitter: { part: 'weapon', at: [0.5, 1.5, 15.5] },
  blueprint: {
    id: 'frost',
    colors: {
      skin: '#f4dccb',
      eye: '#1f3548',
      shine: '#ffffff',
      cheek: '#f0a8b4',
      coat: '#4f9fc4',
      coatDark: '#33789c',
      fur: '#f4f7fb',
      furShade: '#cfdce8',
      mitten: '#8ddbe4',
      boot: '#2f4f66',
      birch: '#e9e4d6',
      knot: '#7a6f61',
      hair: '#dfeefa',
      '*ice': '#c8f6ff',
      '*iceCore': '#ffffff'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'skin',
          eye: 'eye',
          shine: 'shine',
          cheek: 'cheek',
          legs: 'coatDark',
          boots: 'boot',
          torso: 'coat',
          torsoTrim: 'fur',
          belt: 'coatDark',
          sleeve: 'coat',
          hands: 'mitten'
        },
        { robe: true, legs: 5 }
      )
      b.head.paint((x, y, z) => (y >= 6 && z < 2 ? 'hair' : undefined))
      // Fur-lined hood: a coat-coloured shell with a white fur ring framing the face.
      b.head.fill([-7, 1, -7], [6, 11, 6], 'coat', (x, y, z) => {
        const d = Math.hypot(x / 5.4, (y - 4.8) / 5.6, z / 5.2)
        return d <= 1 && d > 0.8 && !(z > 2 && y < 8)
      })
      b.head.fill([-7, 0, 1], [6, 10, 6], 'fur', (x, y, z) => {
        const ring = Math.hypot(x / 5.4, (y - 4.6) / 5.4)
        return z > 1.6 && z < 4.2 && ring <= 1.05 && ring > 0.72
      })
      // Fur collar and hem trim.
      b.torso.fill([-6, 5, -4], [5, 7, 4], 'fur', (x, y, z) => Math.hypot(x / 4.6, z / 3.2) <= 1.1)
      b.hips.paint((x, y, z) => (y === -3 ? ((x + z) % 3 ? 'fur' : 'furShade') : undefined))
      b.torso.box([-1, 1, 3], [0, 4, 3], 'fur')
      // Birch staff with a floating snow crystal.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 0])
      staff.box([0, 0, -3], [0, 0, 12], 'birch').set(0, 0, 4, 'knot').set(0, 0, 9, 'knot')
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        staff.segment([0.5, 1.5, 15.5], [0.5 + Math.sin(a) * 3, 1.5, 15.5 + Math.cos(a) * 3], 0.6, '*ice')
      }
      staff.segment([0.5, -0.5, 15.5], [0.5, 3.5, 15.5], 0.6, '*ice').set(0, 1, 15, '*iceCore')
    }
  },
  pose: (input) => bipedPose(input, { attack: 'cast', stride: 0.4, bob: 0.6 })
}
