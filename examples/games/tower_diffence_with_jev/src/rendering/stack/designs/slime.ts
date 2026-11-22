import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * ぷるぷるスライム — a glossy emerald-mint jelly drop with clean quantized shading, a bold top-left
 * specular gleam, wide expressive eyes, rosy cheeks and a dramatic squash-and-stretch belly-flop.
 */
export const slime: StackDesign = {
  type: 'slime',
  voxel: 2,
  walkDistance: 34,
  portraitCrop: 0.62,
  portraitYaw: -0.35,
  portraitSquash: 0.56,
  shadow: [7, 6],
  blueprint: {
    id: 'slime',
    colors: {
      jelly: '#35c998',
      jellyDark: '#178767',
      jellyLight: '#8cf2ce',
      eye: '#0f241e',
      mouth: '#1c473b',
      cheek: '#ff829e',
      pebble: '#e8c96b',
      '*gloss': '#ffffff'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 0, 0])
      body.fill([-7, 0, -7], [6, 9, 6], 'jelly', (x, y, z) => {
        const r = y < 3 ? 6.7 : 6.7 * Math.sqrt(Math.max(0, 1 - ((y - 3) / 6.7) ** 2))
        return Math.hypot(x, z) <= r + (y < 1 ? 0.3 : 0)
      })
      body.box([-1, 9, -1], [0, 9, 0], 'jelly')
      body.paint((x, y) => (y <= 1 ? 'jellyDark' : undefined))
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
      const squash = 1 - 0.2 * Math.max(0, -Math.sin(p)) + 0.14 * hop
      return {
        body: { y: hop * 3.4, sy: squash, sx: 1 / Math.sqrt(squash), sz: 1 / Math.sqrt(squash), rx: Math.cos(p) * 0.12 }
      }
    }
    if (input.motion === 'attack') {
      const { ms, cue, end } = actionClock(input)
      const sy = strike(ms, [
        [0, 1],
        [cue * 0.55, 0.52],
        [cue * 0.85, 1.38],
        [cue, 0.62],
        [cue + 130, 1.15],
        [end, 1]
      ])
      return {
        body: {
          y: track(ms, [
            [0, 0],
            [cue * 0.55, 0],
            [cue * 0.85, 5.2],
            [cue, 0],
            [end, 0]
          ]),
          z: strike(ms, [
            [0, 0],
            [cue * 0.55, -2],
            [cue, 5.5],
            [end, 0]
          ]),
          sy,
          sx: 1 / Math.sqrt(sy),
          sz: 1 / Math.sqrt(sy),
          rx: track(ms, [
            [0, 0],
            [cue * 0.85, -0.26],
            [cue, 0.34],
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
