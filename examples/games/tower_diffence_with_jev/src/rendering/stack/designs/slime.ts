import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * ぷるぷるスライム — a mint jelly drop with a glossy highlight, a darker jelly skirt, a tiny
 * swallowed pebble showing through and wide happy eyes. It hops along and belly-flops.
 */
export const slime: StackDesign = {
  type: 'slime',
  voxel: 2,
  walkDistance: 34,
  portraitCrop: 1,
  shadow: [7, 6],
  blueprint: {
    id: 'slime',
    colors: {
      jelly: '#3fd4a4',
      jellyDark: '#1c9674',
      jellyLight: '#9cf7d9',
      eye: '#102b24',
      mouth: '#1f4d40',
      cheek: '#ff8da8',
      pebble: '#e8cf7a',
      '*gloss': '#ffffff'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 0, 0])
      body.fill([-7, 0, -7], [6, 9, 6], 'jelly', (x, y, z) => {
        // A drop: wide base, rounded top, slight peak.
        const r = y < 3 ? 6.6 : 6.6 * Math.sqrt(Math.max(0, 1 - ((y - 3) / 6.6) ** 2))
        return Math.hypot(x, z) <= r + (y < 1 ? 0.3 : 0)
      })
      body.box([0, 9, 0], [0, 9, 0], 'jelly')
      body.paint((x, y, z) => (y <= 1 ? 'jellyDark' : undefined))
      body.paint((x, y, z) => (y >= 6 && x < -1 && z > 0 ? 'jellyLight' : undefined))
      body.box([-4, 7, 1], [-3, 8, 2], '*gloss')
      for (const x of [-3, -2, 1, 2]) body.face(x, 4, 'eye').face(x, 5, 'eye')
      body.face(-2, 5, '*gloss').face(2, 5, '*gloss')
      body.face(-1, 3, 'mouth').face(0, 3, 'mouth')
      body.face(-5, 3, 'cheek').face(4, 3, 'cheek')
      body.set(2, 2, -2, 'pebble').set(3, 2, -2, 'pebble')
    }
  },
  pose: (input) => {
    if (input.motion === 'walk') {
      const p = (input.cycle % 1) * TAU
      const hop = Math.max(0, Math.sin(p))
      const squash = 1 - 0.18 * Math.max(0, -Math.sin(p)) + 0.1 * hop
      return {
        body: { y: hop * 3, sy: squash, sx: 1 / Math.sqrt(squash), sz: 1 / Math.sqrt(squash), rx: Math.cos(p) * 0.1 }
      }
    }
    if (input.motion === 'attack') {
      const { ms, cue, end } = actionClock(input)
      const sy = strike(ms, [
        [0, 1],
        [cue * 0.6, 0.62],
        [cue * 0.85, 1.25],
        [cue, 0.7],
        [cue + 120, 1.1],
        [end, 1]
      ])
      return {
        body: {
          y: track(ms, [
            [0, 0],
            [cue * 0.6, 0],
            [cue * 0.85, 4],
            [cue, 0],
            [end, 0]
          ]),
          z: strike(ms, [
            [0, 0],
            [cue * 0.6, -1],
            [cue, 4],
            [end, 0]
          ]),
          sy,
          sx: 1 / Math.sqrt(sy),
          sz: 1 / Math.sqrt(sy),
          rx: track(ms, [
            [0, 0],
            [cue * 0.85, -0.2],
            [cue, 0.25],
            [end, 0]
          ])
        }
      }
    }
    const wobble = Math.sin(input.time * 4 + input.seed * TAU)
    return {
      body: {
        y: wobble > 0.2 ? 1 : 0,
        sy: 1 + wobble * 0.14,
        sx: 1 - wobble * 0.09,
        sz: 1 - wobble * 0.09
      }
    }
  }
}
