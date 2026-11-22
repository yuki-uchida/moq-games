import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * 霧のレイス — a drifting mist wraith: a tall pale-teal hooded shroud fraying into wisps,
 * no face but two cold lights inside the hood, spectral hands and a hanging soul lantern.
 */
export const wraith: StackDesign = {
  type: 'wraith',
  voxel: 2,
  walkDistance: 30,
  shadow: [7, 6],
  emitter: { part: 'armR', at: [0, -10, 1] },
  blueprint: {
    id: 'wraith',
    colors: {
      shroud: '#5ad1e6',
      shroudDark: '#2c8fa8',
      shroudPale: '#ccf7ff',
      void: '#0d1824',
      hand: '#d9fbff',
      iron: '#394754',
      '*eye': '#f0fffc',
      '*lamp': '#6effdf'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 4, 0])
      for (let y = 0; y <= 15; y++) {
        const r = 3 + (15 - y) * 0.22 - (y > 12 ? (y - 12) * 0.6 : 0)
        body.fill([-7, y, -7], [6, y, 6], y < 3 ? 'shroudDark' : 'shroud', (x, yy, z) => {
          const tatter = y < 3 && Math.sin(Math.atan2(x, z) * 5 + y) > 0.4 - y * 0.3
          return Math.hypot(x, z * 0.9) <= r && !tatter
        })
      }
      // Hood opening with a dark void and two lights.
      body.paint((x, y, z) => (Math.hypot((x + 0.5) / 2.6, (y + 0.5 - 12.5) / 2.4) <= 1 && z >= 1 ? 'void' : undefined))
      body.set(-2, 13, 3, '*eye').set(1, 13, 3, '*eye')
      body.paint((x, y, z) => (y >= 15 || (y === 9 && z > 0) ? 'shroudPale' : undefined))
      body.segment([0, 15, -1], [0, 13, -6], 1.2, 'shroud', 0.4)
      for (const [name, x] of [
        ['armL', 4.5],
        ['armR', -4.5]
      ] as const) {
        const arm = kit.part(name, 'body', [x, 11, 0])
        arm.segment([0, 0, 0], [0, -6, 1], 1.4, 'shroud', 1.8).box([-1, -8, 0], [0, -7, 1], 'hand')
      }
      const lantern = kit.part('offhand', 'armR', [0, -8.5, 0.5])
      lantern
        .box([0, -1, 0], [0, -1, 0], 'iron')
        .box([-1, -4, -1], [1, -2, 1], '*lamp')
        .box([-1, -5, -1], [1, -5, 1], 'iron')
        .box([-1, -1, -1], [1, -1, 1], 'iron')
    }
  },
  pose: (input) => {
    const drift = Math.sin(input.time * 1.8 + input.seed * TAU)
    const base = {
      body: { y: 3 + drift * 0.8, rz: drift * 0.03 },
      armL: { rx: -0.2, rz: 0.2 },
      armR: { rx: -0.3, rz: -0.2 },
      offhand: { rx: 0.3 }
    }
    if (input.motion === 'walk')
      return { ...base, body: { y: 3 + drift * 0.8, rx: 0.2 }, armL: { rx: 0.4, rz: 0.3 }, armR: { rx: 0.2, rz: -0.3 } }
    if (input.motion === 'attack') {
      const { ms, cue, end } = actionClock(input)
      const lift = strike(ms, [
        [0, -0.3],
        [cue * 0.7, -2.2],
        [cue, -1.3],
        [end, -0.3]
      ])
      return {
        body: {
          y:
            3 +
            track(ms, [
              [0, 0],
              [cue * 0.7, 2],
              [cue, 0],
              [end, 0]
            ]),
          rx: track(ms, [
            [0, 0],
            [cue * 0.7, -0.15],
            [cue, 0.15],
            [end, 0]
          ])
        },
        armR: { rx: lift, rz: -0.2 },
        armL: {
          rx: track(ms, [
            [0, -0.2],
            [cue * 0.7, -1.6],
            [cue, -0.8],
            [end, -0.2]
          ]),
          rz: 0.3
        },
        offhand: { rx: -lift * 0.9 }
      }
    }
    return base
  }
}
