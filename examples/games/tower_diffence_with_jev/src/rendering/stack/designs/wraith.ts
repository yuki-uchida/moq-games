import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * 霧のレイス — a spectral hooded wraith in rich twilight-teal tattered robes, bold 2x2 glowing
 * cyan phantom eyes inside a deep shadow cowl, clawed ghostly hands and a swinging soul lantern.
 */
export const wraith: StackDesign = {
  type: 'wraith',
  voxel: 2,
  walkDistance: 30,
  portraitCrop: 0.62,
  portraitYaw: -0.1,
  portraitFocusY: 0.08,
  softShade: true,
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
      // Tapered tattered spectral shroud below the shoulders.
      for (let y = 0; y <= 10; y++) {
        const r = 3.5 + (10 - y) * 0.34
        body.fill([-8, y, -8], [7, y, 7], y < 4 ? 'shroudDark' : 'shroud', (x, yy, z) => {
          const tatter = y < 4 && Math.sin(Math.atan2(x, z) * 5 + y * 0.7) > 0.35 - y * 0.25
          return Math.hypot(x, z * 0.92) <= r && !tatter
        })
      }
      // Flared spectral shoulder mantle separates the hood from the robe silhouette from every angle.
      body.fill([-7, 8, -6], [6, 10, 6], 'shroudDark', (x, y, z) => {
        const r = 5.6 - (y - 8) * 0.4
        return Math.hypot(x / r, z / (r * 0.88)) <= 1
      })
      body.paint((x, y, z) => (y === 8 && Math.hypot(x + 0.5, z + 0.5) > 4.4 ? 'shroudPale' : undefined))
      // Sculpted overhanging gothic hood framing a deep recessed shadow cavity.
      body.fill([-6, 10, -6], [5, 18, 5], 'shroud', (x, y, z) => {
        const taper = y > 15 ? 1 - (y - 15) * 0.28 : 1
        const d = Math.hypot(x / (5.0 * taper), (y - 12.6) / 5.4, (z + 0.8) / (5.0 * taper))
        const recess = z > 1.0 && y >= 10.2 && y <= 15.2 && Math.abs(x) < 3.8
        const frontCut = y >= 15 && z > 2.4 - (y - 15) * 0.8
        return d <= 1 && !recess && !frontCut
      })
      // Recessed dark void interior inside the hood with crisp pale cowl rim.
      body.fill([-4, 10, 0], [3, 14, 2], 'void', (x, y, z) => Math.hypot(x / 3.8, (y - 12.0) / 2.6) <= 1 && z >= 0)
      body.paint((x, y, z) =>
        y >= 10 && y <= 15 && z >= 2 && z <= 4 && Math.abs(x + 0.5) >= 3.5 && Math.abs(x + 0.5) <= 4.7
          ? 'shroudPale'
          : y === 15 && z >= 1 && z <= 2 && Math.abs(x + 0.5) <= 3.8
            ? 'shroudPale'
            : undefined
      )
      // Two sharply separated glowing cyan phantom eyes floating visibly inside the shadow cowl.
      body.box([-3, 11, 3], [-2, 12, 4], '*eye').box([1, 11, 3], [2, 12, 4], '*eye')
      // Swept pointed hood tail in the back so side & rear silhouettes read unmistakably as a reaper hood.
      body.segment([0, 16.5, -2], [0, 13.5, -8.5], 2.0, 'shroudDark', 0.65)

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
