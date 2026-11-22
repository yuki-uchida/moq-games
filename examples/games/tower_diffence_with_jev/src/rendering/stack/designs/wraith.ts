import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * 霧のレイス — a spectral hooded wraith in rich twilight-teal tattered robes, bold 2x2 glowing
 * cyan phantom eyes inside a deep shadow cowl, clawed ghostly hands and a swinging soul lantern.
 */
export const wraith: StackDesign = {
  type: 'wraith',
  voxel: 2,
  walkDistance: 30,
  portraitCrop: 0.68,
  portraitYaw: -0.32,
  shadow: [7, 6],
  emitter: { part: 'armR', at: [0, -10, 1] },
  blueprint: {
    id: 'wraith',
    colors: {
      shroud: '#3098b8',
      shroudDark: '#1b5773',
      shroudPale: '#a8f0ff',
      void: '#0b1421',
      hand: '#d6fcff',
      iron: '#303c4a',
      '*eye': '#dcffff',
      '*lamp': '#6bffdc',
      '*lampCore': '#ffffff'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 4, 0])
      for (let y = 0; y <= 16; y++) {
        const r = 3.2 + (16 - y) * 0.25 - (y > 13 ? (y - 13) * 0.65 : 0)
        body.fill([-7, y, -7], [6, y, 6], y < 4 ? 'shroudDark' : 'shroud', (x, yy, z) => {
          const tatter = y < 4 && Math.sin(Math.atan2(x, z) * 5 + y * 0.7) > 0.35 - y * 0.25
          return Math.hypot(x, z * 0.92) <= r && !tatter
        })
      }
      // Deep shadow cowl opening with bold 2x2 glowing phantom eyes visible at 1x scale.
      body.paint((x, y, z) =>
        Math.hypot((x + 0.5) / 3.3, (y + 0.5 - 12.5) / 2.8) <= 1 && z >= 1 ? 'void' : undefined
      )
      body.box([-3, 12, 3], [-2, 13, 4], '*eye').box([1, 12, 3], [2, 13, 4], '*eye')
      // Pale spectral cowl rim & shoulder shawl edge.
      body.paint((x, y, z) => (y >= 16 || (y === 9 && z > 1) ? 'shroudPale' : undefined))
      body.segment([0, 16, -1], [0, 13.5, -7], 1.5, 'shroudDark', 0.5)

      for (const [name, x] of [
        ['armL', 5],
        ['armR', -5]
      ] as const) {
        const arm = kit.part(name, 'body', [x, 11.5, 0])
        arm.segment([0, 0, 0], [0, -6.5, 1.5], 1.6, 'shroud', 1.9).box([-1, -8, 0], [0, -7, 2], 'hand')
      }

      const lantern = kit.part('offhand', 'armR', [0, -8.5, 1])
      lantern
        .box([0, -1, 0], [0, -1, 0], 'iron')
        .box([-1, -5, -1], [1, -2, 1], '*lamp')
        .set(0, -3, 1, '*lampCore')
        .box([-1, -6, -1], [1, -6, 1], 'iron')
        .box([-1, -1, -1], [1, -1, 1], 'iron')
    }
  },
  pose: (input) => {
    const drift = Math.sin(input.time * 1.8 + input.seed * TAU)
    const base = {
      body: { y: 3 + drift * 0.9, rz: drift * 0.04 },
      armL: { rx: -0.25, rz: 0.25 },
      armR: { rx: -0.35, rz: -0.22 },
      offhand: { rx: 0.35 }
    }
    if (input.motion === 'walk')
      return {
        ...base,
        body: { y: 3 + drift * 0.9, rx: 0.24 },
        armL: { rx: 0.45, rz: 0.35 },
        armR: { rx: 0.2, rz: -0.35 }
      }
    if (input.motion === 'attack') {
      const { ms, cue, end } = actionClock(input)
      const lift = strike(ms, [
        [0, -0.35],
        [cue * 0.65, -2.5],
        [cue, -1.0],
        [end, -0.35]
      ])
      return {
        body: {
          y:
            3 +
            track(ms, [
              [0, 0],
              [cue * 0.65, 2.8],
              [cue, 0.5],
              [end, 0]
            ]),
          z: strike(ms, [
            [0, 0],
            [cue * 0.65, -2],
            [cue, 4.5],
            [end, 0]
          ]),
          rx: track(ms, [
            [0, 0],
            [cue * 0.65, -0.25],
            [cue, 0.32],
            [end, 0]
          ])
        },
        armR: { rx: lift, rz: -0.2 },
        armL: {
          rx: track(ms, [
            [0, -0.25],
            [cue * 0.65, -1.9],
            [cue, -0.6],
            [end, -0.25]
          ]),
          rz: 0.38
        },
        offhand: { rx: -lift * 0.9 }
      }
    }
    return base
  }
}
