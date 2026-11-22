import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * 鉄甲ビートル — an armoured rhinoceros beetle: a riveted blued-iron wing case split down the
 * middle, a curved iron horn, a bronze underbelly and six stubby legs.
 */
export const beetle: StackDesign = {
  type: 'beetle',
  voxel: 2,
  walkDistance: 24,
  portraitCrop: 1,
  shadow: [9, 10],
  blueprint: {
    id: 'beetle',
    colors: {
      shell: '#4c68d6',
      shellDark: '#2b3d91',
      shellLight: '#9cb4ff',
      rivet: '#ffd24a',
      belly: '#a66b2e',
      leg: '#2b2442',
      horn: '#f0f3ff',
      '*eye': '#ff5938'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 4, 0])
      body.fill(
        [-7, 0, -8],
        [6, 7, 6],
        'shell',
        (x, y, z) => Math.hypot(x / 6.4, y / 6.4, (z + 1) / 7.2) <= 1 && y >= 0.5
      )
      body.fill([-6, -1, -7], [5, 1, 5], 'belly', (x, y, z) => Math.hypot(x / 5.6, (z + 1) / 6.4) <= 1)
      body.paint((x, y, z) => (x === -1 || x === 0 ? (y > 1 ? 'shellDark' : undefined) : undefined))
      body.paint((x, y, z) => (y === 5 && z % 3 === 0 && Math.abs(x + 0.5) > 2 ? 'rivet' : undefined))
      body.paint((x, y, z) => (y >= 5 && x <= -3 && z > -2 ? 'shellLight' : undefined))
      const head = kit.part('head', 'body', [0, 2, 6])
      head.fill([-4, -2, -1], [3, 3, 3], 'shellDark', (x, y, z) => Math.hypot(x / 3.4, y / 2.6, (z - 1) / 2.4) <= 1)
      head.face(-3, 1, '*eye').face(2, 1, '*eye')
      head.segment([0, 2, 3], [0, 4, 7], 1.4, 'horn', 0.9).segment([0, 4, 7], [0, 8, 8], 0.9, 'horn', 0.5)
      for (const [name, side] of [
        ['legsL', 1],
        ['legsR', -1]
      ] as const) {
        const legs = kit.part(name, 'body', [side * 5, 0, 0])
        for (const z of [-4, 0, 4]) legs.segment([0, 0, z], [side * 3, -4, z + 1], 0.8, 'leg')
      }
    }
  },
  pose: (input) => {
    if (input.motion === 'walk') {
      const p = input.cycle * TAU
      return {
        body: { y: Math.abs(Math.sin(p * 2)) * 0.3, rz: Math.sin(p) * 0.04 },
        legsL: { rx: Math.sin(p) * 0.35, y: Math.max(0, Math.sin(p)) * 0.6 },
        legsR: { rx: -Math.sin(p) * 0.35, y: Math.max(0, -Math.sin(p)) * 0.6 },
        head: { ry: Math.sin(p) * 0.06 }
      }
    }
    if (input.motion === 'attack') {
      const { ms, cue, end } = actionClock(input)
      return {
        body: {
          z: strike(ms, [
            [0, 0],
            [cue * 0.6, -2],
            [cue, 4],
            [end, 0]
          ]),
          rx: track(ms, [
            [0, 0],
            [cue * 0.6, 0.12],
            [cue, -0.1],
            [end, 0]
          ])
        },
        head: {
          rx: strike(ms, [
            [0, 0],
            [cue * 0.6, 0.35],
            [cue, -0.55],
            [cue + 150, -0.4],
            [end, 0]
          ])
        },
        legsL: {
          rx: track(ms, [
            [0, 0],
            [cue, 0.3],
            [end, 0]
          ])
        },
        legsR: {
          rx: track(ms, [
            [0, 0],
            [cue, 0.3],
            [end, 0]
          ])
        }
      }
    }
    return {
      body: { y: Math.sin(input.time * 2 + input.seed * TAU) * 0.15 },
      head: { ry: 0.1 * Math.sin(input.time * 0.8 + input.seed * 9) }
    }
  }
}
