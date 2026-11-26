import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * ぷるぷるスライム — a glossy emerald-mint jelly drop with clean quantized shading, a bold top-left
 * specular gleam, wide expressive eyes, rosy cheeks and a dramatic squash-and-stretch belly-flop.
 */
export const slime: StackDesign = {
  type: 'slime',
  voxel: 2,
  walkDistance: 34,
  portraitCrop: 0.85,
  portraitYaw: -0.35,
  portraitSquash: 0.56,
  shadow: [7, 6],
  blueprint: {
    id: 'slime',
    density: 2,
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
      body.ellipsoid([0, 9.2, 0], [1.4, 0.9, 1.4], 'jelly')
      body.paint((_x, y) => (y <= 1 ? 'jellyDark' : undefined))
      body.paint((x, y, z) => (y >= 6 && x < -1 && z > 0 ? 'jellyLight' : undefined))
      // Crescent high-res specular highlight on upper-left jelly dome.
      body.rawBox([-8, 14, 3], [-6, 16, 5], '*gloss').rawBox([-6, 16, 2], [-5, 17, 4], '*gloss')
      // Adorable 3x4 glossy slime eyes with 1px sparkle, rosy blush & curved happy smile.
      for (const gx of [-6, -5, -4, 3, 4, 5])
        for (let gy = 8; gy <= 11; gy++) body.rawFace(gx, gy, 'eye', '+z', 2)
      body.rawFace(-5, 11, '*gloss', '+z', 2).rawFace(3, 11, '*gloss', '+z', 2)
      body.rawFace(-4, 9, '*gloss', '+z', 1).rawFace(4, 9, '*gloss', '+z', 1)
      body
        .rawFace(-2, 7, 'mouth', '+z', 2)
        .rawFace(-1, 6, 'mouth', '+z', 2)
        .rawFace(0, 6, 'mouth', '+z', 2)
        .rawFace(1, 7, 'mouth', '+z', 2)
      body.rawFace(-9, 7, 'cheek', '+z', 2).rawFace(-8, 7, 'cheek', '+z', 2)
      body.rawFace(7, 7, 'cheek', '+z', 2).rawFace(8, 7, 'cheek', '+z', 2)
      body.rawBox([4, 4, -4], [6, 5, -3], 'pebble')
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
