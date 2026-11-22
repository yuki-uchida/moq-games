import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * 小さなドラゴン — a stocky young dragon in terracotta scales with a butter-yellow belly,
 * stubby horns, a spiny back ridge, leathery wings in rust red and a spaded tail. It rears
 * and breathes fire from its jaws.
 */
export const dragon: StackDesign = {
  type: 'dragon',
  voxel: 2.3,
  walkDistance: 34,
  portraitCrop: 0.92,
  shadow: [11, 12],
  emitter: { part: 'jaw', at: [0, 1, 5] },
  blueprint: {
    id: 'dragon',
    colors: {
      scale: '#d28d70',
      scaleDark: '#a5604a',
      belly: '#f3d78c',
      horn: '#f6efdc',
      spine: '#8f3f33',
      wing: '#b8503e',
      wingBone: '#7a3328',
      claw: '#fff4dc',
      eye: '#1c120e',
      mouth: '#5a1d1d',
      '*eyeGlow': '#ffe07a',
      '*ember': '#ff8a3c'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 8, 0])
      body.fill([-6, -5, -8], [5, 6, 7], 'scale', (x, y, z) => Math.hypot(x / 5.4, (y - 0.5) / 5, z / 7.4) <= 1)
      body.fill(
        [-4, -5, 0],
        [3, 3, 8],
        'belly',
        (x, y, z) => Math.hypot(x / 3.8, (y + 1) / 4, (z - 2) / 5.4) <= 1 && z > 2.6
      )
      for (let z = -6; z <= 5; z += 2) body.box([-1, 5, z], [0, 6, z], 'spine')
      const neck = kit.part('neck', 'body', [0, 3, 6])
      neck.segment([0, 0, 0], [0, 3, 2.5], 2.6, 'scale', 2.2)
      neck.segment([0, 0, 1.4], [0, 3, 3.8], 1.4, 'belly')
      const head = kit.part('head', 'neck', [0, 4, 3])
      head.fill([-4, -2, -3], [3, 3, 5], 'scale', (x, y, z) => Math.hypot(x / 3.6, y / 2.8, (z - 0.5) / 3.6) <= 1)
      head.box([-2, -1, 3], [1, 1, 7], 'scale').box([-2, 1, 4], [1, 1, 6], 'scaleDark')
      head.set(-2, 1, 3, '*eyeGlow').set(1, 1, 3, '*eyeGlow').set(-2, 1, 2, 'eye').set(1, 1, 2, 'eye')
      head.segment([-2, 2, -1], [-3, 5, -4], 0.8, 'horn', 0.4).segment([1, 2, -1], [2, 5, -4], 0.8, 'horn', 0.4)
      head.set(-1, 0, 7, 'mouth').set(0, 0, 7, 'mouth')
      const jaw = kit.part('jaw', 'head', [0, -1.5, 3])
      jaw.box([-2, -1, 0], [1, 0, 4], 'belly').box([-2, 0, 4], [1, 0, 4], 'claw').box([-1, 0, 1], [0, 0, 3], '*ember')
      for (const [name, x, z] of [
        ['legFL', 3.5, 4],
        ['legFR', -3.5, 4],
        ['legBL', 4, -4],
        ['legBR', -4, -4]
      ] as const) {
        const leg = kit.part(name, 'body', [x, -2, z])
        leg.box([-1, -6, -1], [1, 0, 1], 'scaleDark').box([-1, -6, 2], [1, -6, 2], 'claw')
      }
      for (const [name, side] of [
        ['wingL', 1],
        ['wingR', -1]
      ] as const) {
        const wing = kit.part(name, 'body', [side * 4, 4, 0])
        wing.fill([side > 0 ? 0 : -14, -1, -7], [side > 0 ? 13 : -1, 1, 4], 'wing', (x, y, z) => {
          const d = Math.abs(x)
          return (
            d <= 13 &&
            y > -0.5 &&
            y < 0.5 &&
            z <= 3 - d * 0.1 &&
            z >= -6 + d * 0.15 - 1.6 * Math.abs(Math.sin(d * 0.55))
          )
        })
        for (const zEnd of [-6, -2, 2]) wing.segment([0, 0.4, 1], [side * 13, 0.6, zEnd], 0.55, 'wingBone')
      }
      const tail = kit.part('tail', 'body', [0, 0, -7])
      tail.segment([0, 0, 0], [0, -2, -9], 2.4, 'scale', 1).segment([0, -2, -9], [0, -2, -12], 1, 'scaleDark')
      tail.box([-2, -2, -14], [1, -2, -12], 'spine')
    }
  },
  pose: (input) => {
    const beat = Math.sin(input.time * 2.2 * TAU * 0.5 + input.seed * TAU)
    const pose: Record<string, Record<string, number>> = {
      body: { y: 0.3 * beat },
      neck: { rx: -0.1 },
      head: { rx: 0.15 + 0.05 * Math.sin(input.time * 1.4) },
      jaw: { rx: 0.05 },
      wingL: { rz: 0.35 + beat * 0.25 },
      wingR: { rz: -0.35 - beat * 0.25 },
      tail: { ry: 0.3 * Math.sin(input.time * 1.7 + input.seed * 3) }
    }
    if (input.motion === 'walk') {
      const p = input.cycle * TAU
      Object.assign(pose, {
        legFL: { rx: Math.sin(p) * 0.6 },
        legBR: { rx: Math.sin(p) * 0.6 },
        legFR: { rx: -Math.sin(p) * 0.6 },
        legBL: { rx: -Math.sin(p) * 0.6 },
        body: { y: Math.abs(Math.sin(p)) * 0.8, rz: Math.sin(p) * 0.05 },
        tail: { ry: Math.sin(p) * 0.45 }
      })
    } else if (input.motion === 'attack' || input.motion === 'breath') {
      const { ms, cue, end } = actionClock(input)
      const rear = track(ms, [
        [0, 0],
        [cue * 0.75, 1],
        [cue + (end - cue) * 0.6, 0.8],
        [end, 0]
      ])
      const lunge = strike(ms, [
        [0, 0],
        [cue * 0.75, -0.6],
        [cue, 0.55],
        [cue + (end - cue) * 0.6, 0.45],
        [end, 0]
      ])
      pose.body = { rx: -0.32 * rear, y: 1.5 * rear }
      pose.neck = { rx: -0.6 * rear + lunge * 0.9 }
      pose.head = { rx: 0.15 + lunge * 0.5 }
      pose.jaw = {
        rx: track(ms, [
          [0, 0.05],
          [cue * 0.75, 0.15],
          [cue, 0.9],
          [cue + (end - cue) * 0.6, 0.8],
          [end, 0.05]
        ])
      }
      pose.wingL = { rz: 0.35 + 0.7 * rear + Math.sin(ms * 0.02) * 0.2 }
      pose.wingR = { rz: -0.35 - 0.7 * rear - Math.sin(ms * 0.02) * 0.2 }
      pose.legFL = { rx: -0.6 * rear }
      pose.legFR = { rx: -0.6 * rear }
    }
    return pose
  }
}
