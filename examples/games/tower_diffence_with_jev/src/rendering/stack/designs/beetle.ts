import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * 鉄甲ビートル — a gleaming royal-cobalt rhinoceros beetle with a bold golden center ridge, brass
 * rivets, blazing crimson-orange 2x2 eyes, a massive curved ivory horn and 6 splayed armored legs.
 */
export const beetle: StackDesign = {
  type: 'beetle',
  voxel: 2,
  walkDistance: 24,
  portraitCrop: 0.84,
  portraitYaw: -0.62,
  portraitSquash: 0.48,
  shadow: [10, 10],
  blueprint: {
    id: 'beetle',
    colors: {
      shell: '#3d5ac9',
      shellDark: '#213380',
      shellLight: '#85a4ff',
      rivet: '#ffd247',
      belly: '#9e6228',
      leg: '#251e3b',
      horn: '#f5f2e6',
      hornShade: '#c2beae',
      '*eye': '#ff5733'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 4, 0])
      body.fill(
        [-7, 0, -8],
        [6, 7, 6],
        'shell',
        (x, y, z) => Math.hypot(x / 6.6, y / 6.5, (z + 1) / 7.4) <= 1 && y >= 0.5
      )
      body.fill([-6, -1, -7], [5, 1, 5], 'belly', (x, y, z) => Math.hypot(x / 5.8, (z + 1) / 6.6) <= 1)
      // Crisp dark wing-case seam flanked by golden brass rivets + directional top-left sheen.
      body.paint((x, y, z) => (x === -1 || x === 0 ? (y > 2 ? 'shellDark' : undefined) : undefined))
      body.paint((x, y, z) =>
        (y === 5 || y === 4) && (z === -4 || z === 0 || z === 4) && (x === -3 || x === 2) ? 'rivet' : undefined
      )
      body.paint((x, y, z) => (y >= 5 && x <= -3 && z > -2 ? 'shellLight' : undefined))

      const head = kit.part('head', 'body', [0, 2, 6])
      head.fill([-4, -2, -1], [3, 3, 4], 'shellDark', (x, y, z) => Math.hypot(x / 3.6, y / 2.8, (z - 1) / 2.6) <= 1)
      // Bold 2x2 glowing eyes readable from front and 3/4.
      head.box([-4, 0, 2], [-3, 1, 3], '*eye').box([2, 0, 2], [3, 1, 3], '*eye')
      // Massive upward-curving rhinoceros horn + forked tip.
      head
        .segment([0, 1.5, 3], [0, 4.5, 8], 1.7, 'horn', 1.2)
        .segment([0, 4.5, 8], [0, 9.5, 9.5], 1.2, 'horn', 0.65)
      head.box([-1, 9, 9], [-1, 10, 10], 'hornShade').box([1, 9, 9], [1, 10, 10], 'hornShade')

      for (const [name, side] of [
        ['legsL', 1],
        ['legsR', -1]
      ] as const) {
        const legs = kit.part(name, 'body', [side * 5.5, 0, 0])
        for (const z of [-4, 0, 4]) legs.segment([0, 0, z], [side * 3.8, -4, z + 1], 1.0, 'leg', 0.75)
      }
    }
  },
  pose: (input) => {
    if (input.motion === 'walk') {
      const p = input.cycle * TAU
      return {
        body: { y: Math.abs(Math.sin(p * 2)) * 0.35, rz: Math.sin(p) * 0.05 },
        legsL: { rx: Math.sin(p) * 0.4, y: Math.max(0, Math.sin(p)) * 0.65 },
        legsR: { rx: -Math.sin(p) * 0.4, y: Math.max(0, -Math.sin(p)) * 0.65 },
        head: { ry: Math.sin(p) * 0.08 }
      }
    }
    if (input.motion === 'attack') {
      const { ms, cue, end } = actionClock(input)
      return {
        body: {
          z: strike(ms, [
            [0, 0],
            [cue * 0.6, -2.5],
            [cue, 5],
            [end, 0]
          ]),
          rx: track(ms, [
            [0, 0],
            [cue * 0.6, 0.16],
            [cue, -0.14],
            [end, 0]
          ])
        },
        head: {
          rx: strike(ms, [
            [0, 0],
            [cue * 0.6, 0.42],
            [cue, -0.68],
            [cue + 150, -0.45],
            [end, 0]
          ])
        },
        legsL: {
          rx: track(ms, [
            [0, 0],
            [cue, 0.35],
            [end, 0]
          ])
        },
        legsR: {
          rx: track(ms, [
            [0, 0],
            [cue, 0.35],
            [end, 0]
          ])
        }
      }
    }
    return {
      body: { y: Math.sin(input.time * 2 + input.seed * TAU) * 0.18 },
      head: { ry: 0.12 * Math.sin(input.time * 0.8 + input.seed * 9) }
    }
  }
}
