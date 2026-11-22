import type { StackDesign } from '../StackDesign'
import { flyerPose } from './beasts'

/**
 * 夜のコウモリ — a round lavender night bat with giant ears, a pale tummy tuft, two fangs and
 * wide scalloped wings with dark membranes.
 */
export const bat: StackDesign = {
  type: 'bat',
  voxel: 2,
  walkDistance: 40,
  portraitCrop: 1,
  shadow: [6, 5],
  blueprint: {
    id: 'bat',
    colors: {
      fur: '#a594d6',
      furDark: '#6f5fa3',
      tummy: '#e6dcf6',
      ear: '#f0b3cf',
      membrane: '#4d3f78',
      bone: '#8d7cc4',
      fang: '#ffffff',
      '*eye': '#ffe36a'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 0, 0])
      body.ellipsoid([0, 0, 0], [4, 4, 3.6], 'fur')
      body.ellipsoid([0, -0.8, 1.6], [2.4, 2.4, 2], 'tummy')
      for (const x of [-3, 2]) {
        body.box([x, 3, -1], [x + 1, 7, 0], 'furDark').box([x, 4, 0], [x + 1, 6, 0], 'ear')
        body.face(x < 0 ? -2 : 1, 1, '*eye').face(x < 0 ? -2 : 1, 2, '*eye')
      }
      body.face(-1, -1, 'fang').face(0, -1, 'fang')
      body.box([-1, -5, -1], [0, -4, 0], 'furDark')
      for (const [name, side] of [
        ['wingL', 1],
        ['wingR', -1]
      ] as const) {
        const wing = kit.part(name, 'body', [side * 3.5, 1, -0.5])
        // Scalloped membrane between three finger bones.
        wing.fill([side > 0 ? 0 : -12, -1, -5], [side > 0 ? 11 : -1, 0, 4], 'membrane', (x, y, z) => {
          const d = Math.abs(x)
          const edge = 4.2 - d * 0.28 - 0.9 * Math.abs(Math.sin(d * 0.75))
          return d <= 11 && z <= 3.4 - d * 0.18 && z >= -edge && y > -0.5
        })
        for (const zEnd of [-3, -1, 2]) wing.segment([0, 0, 0], [side * 11, 0.2, zEnd], 0.5, 'bone')
      }
    }
  },
  pose: (input) => flyerPose(input, { hover: 18, flap: 0.75, rate: 3.2 })
}
