import { actionClock, strike, TAU, track, type StackDesign } from '../StackDesign'

/**
 * 小さなドラゴン — a fierce crimson dragon on the unified voxel=2 grid with sweeping veined wing
 * membranes, ivory horns, golden plated belly, glowing amber eyes, dorsal spines and a spaded tail.
 */
export const dragon: StackDesign = {
  type: 'dragon',
  voxel: 2,
  walkDistance: 34,
  portraitCrop: 0.64,
  portraitYaw: -0.28,
  portraitSquash: 0.48,
  portraitFocus: -0.6,
  portraitPose: {
    // Fold the membranes behind the shoulders and turn the head to camera so one eye, both
    // horn roots and the long snout stay readable inside the circular badge.
    wingL: { rz: 0.12, ry: -1.15 },
    wingR: { rz: -0.12, ry: 1.15 },
    neck: { ry: 0.28 },
    head: { ry: 0.55, rx: -0.04 },
    jaw: { rx: 0.3 }
  },
  shadow: [12, 13],
  emitter: { part: 'jaw', at: [0, 1, 6] },
  blueprint: {
    id: 'dragon',
    colors: {
      scale: '#d9412e',
      scaleDark: '#8f2119',
      scaleLight: '#f56e4e',
      belly: '#f5c647',
      bellyShade: '#c99326',
      horn: '#faf0d2',
      spine: '#5c1416',
      wing: '#b82a23',
      wingLight: '#e04c38',
      wingDark: '#7d1712',
      wingBone: '#4f1515',
      claw: '#fff5d6',
      eye: '#1c0b0a',
      mouth: '#4a1012',
      '*eyeGlow': '#ffe94d',
      '*ember': '#ff861c'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 9, 0])
      body.fill([-7, -6, -9], [6, 7, 8], 'scale', (x, y, z) => Math.hypot(x / 6.2, (y - 0.5) / 5.6, z / 8.4) <= 1)
      body.paint((x, y, z) => (y >= 4 && x < 0 && z > -4 ? 'scaleLight' : undefined))
      body.fill(
        [-5, -6, 0],
        [4, 3, 9],
        'belly',
        (x, y, z) => Math.hypot(x / 4.4, (y + 1.2) / 4.4, (z - 2.2) / 6.2) <= 1 && z > 2.8
      )
      body.paint((x, y, z) => (z > 4 && y <= -2 && y % 2 === 0 ? 'bellyShade' : undefined))
      for (let z = -7; z <= 6; z += 2) body.box([-1, 6, z], [0, 8, z + 1], 'spine')

      const neck = kit.part('neck', 'body', [0, 4, 7])
      neck.segment([0, 0, 0], [0, 4.5, 3], 3.0, 'scale', 2.6)
      neck.segment([0, -0.5, 1.8], [0, 3.8, 4.4], 1.7, 'belly')
      neck.box([-1, 2, -1], [0, 4, 0], 'spine')

      const head = kit.part('head', 'neck', [0, 5, 3.5])
      head.fill([-5, -2, -4], [4, 4, 5], 'scale', (x, y, z) => Math.hypot(x / 4.2, y / 3.2, (z - 0.5) / 4.2) <= 1)
      head.box([-3, -1, 3], [2, 2, 8], 'scale').box([-3, 2, 4], [2, 2, 7], 'scaleDark')
      head.box([-4, 2, 1], [-2, 3, 4], 'scaleDark').box([1, 2, 1], [3, 3, 4], 'scaleDark')
      // Bold 2x2 glowing eyes readable from front and 3/4.
      head.box([-4, 0, 2], [-3, 1, 4], '*eyeGlow').box([2, 0, 2], [3, 1, 4], '*eyeGlow')
      head.set(-3, 0, 4, 'eye').set(2, 0, 4, 'eye')
      // Swept ivory horns.
      head
        .segment([-2.5, 3, -1], [-4.5, 7, -5.5], 1.1, 'horn', 0.5)
        .segment([1.5, 3, -1], [3.5, 7, -5.5], 1.1, 'horn', 0.5)
      head.box([-2, 0, 8], [1, 0, 8], 'mouth').set(-2, 1, 8, 'scaleDark').set(1, 1, 8, 'scaleDark')

      const jaw = kit.part('jaw', 'head', [0, -1.8, 3.5])
      jaw.box([-3, -1, 0], [2, 0, 5], 'belly')
      jaw.box([-3, 0, 4], [-2, 1, 5], 'claw').box([1, 0, 4], [2, 1, 5], 'claw')
      jaw.box([-2, 0, 1], [1, 0, 3], '*ember')

      for (const [name, x, z] of [
        ['legFL', 4.5, 4.5],
        ['legFR', -4.5, 4.5],
        ['legBL', 5, -4.5],
        ['legBR', -5, -4.5]
      ] as const) {
        const leg = kit.part(name, 'body', [x, -2.5, z])
        leg.box([-2, -7, -2], [1, 0, 1], 'scaleDark').box([-2, -7, 2], [1, -6, 3], 'claw')
      }

      // Swept tapered bat-style crimson wings with 3 deep scallops (clean silhouette from front, side and attack!).
      for (const [name, side] of [
        ['wingL', 1],
        ['wingR', -1]
      ] as const) {
        const wing = kit.part(name, 'body', [side * 4.5, 4.5, -0.5])
        wing.fill([side > 0 ? 0 : -15, -1, -10], [side > 0 ? 14 : -1, 3, 4], 'wing', (x, y, z) => {
          const d = Math.abs(x)
          if (d < 0.8 || d > 14.2) return false
          const t = d / 14.2
          // Swept delta leading edge curving back + tapered trailing edge with 3 deep scallops.
          const arch = Math.sin(t * Math.PI) * 1.4
          const leadZ = 3.2 - t * 5.2
          const baseTrail = -6.8 + t * 5.0
          const scallop = Math.abs(Math.sin(t * Math.PI * 3)) * 2.4 * (1 - t * 0.45)
          const trailZ = baseTrail + scallop
          // Require a real chord so the trailing scallops never leave isolated 1-cell pixels.
          return leadZ - trailZ >= 1.4 && z <= leadZ && z >= trailZ && y >= arch - 0.85 && y <= arch + 0.75
        })
        // Dark membrane root separates the wing from the crimson torso in side/back views.
        wing.paint((x, y, z) =>
          Math.abs(x) <= 4
            ? 'wingDark'
            : z > -1.5 && Math.abs(x) > 3 && Math.abs(x) < 11
              ? 'wingLight'
              : undefined
        )
        // Leading spar sweeping back to wingtip claw + 3 finger ribs.
        wing.segment([0, 0.5, 2], [side * 7, 1.8, 1.2], 0.9, 'wingBone', 0.75)
        wing.segment([side * 7, 1.8, 1.2], [side * 14, 0.4, -2.0], 0.75, 'wingBone', 0.45)
        for (const [xEnd, zEnd, yEnd] of [
          [6.5, -6.5, -0.2],
          [10.2, -5.0, 0.2],
          [13.5, -2.5, 0.4]
        ]) {
          wing.segment([side * 5.5, 1.5, 1.0], [side * xEnd, yEnd, zEnd], 0.6, 'wingBone', 0.4)
        }
      }

      const tail = kit.part('tail', 'body', [0, 0, -8])
      tail.segment([0, 0, 0], [0, -2, -10], 2.8, 'scale', 1.2).segment([0, -2, -10], [0, -1.5, -14], 1.2, 'scaleDark')
      tail.box([-3, -2, -17], [2, -1, -13], 'spine').box([-1, -1, -18], [0, -1, -17], 'spine')
    }
  },
  pose: (input) => {
    const beat = Math.sin(input.time * 2.2 * TAU * 0.5 + input.seed * TAU)
    const pose: Record<string, Record<string, number>> = {
      body: { y: 0.4 * beat },
      neck: { rx: -0.1 },
      head: { rx: 0.14 + 0.05 * Math.sin(input.time * 1.4) },
      jaw: { rx: 0.12 },
      wingL: { rz: 0.32 + beat * 0.2, ry: -0.5 },
      wingR: { rz: -0.32 - beat * 0.2, ry: 0.5 },
      tail: { ry: 0.3 * Math.sin(input.time * 1.7 + input.seed * 3) }
    }
    if (input.motion === 'walk') {
      const p = input.cycle * TAU
      Object.assign(pose, {
        legFL: { rx: Math.sin(p) * 0.6 },
        legBR: { rx: Math.sin(p) * 0.6 },
        legFR: { rx: -Math.sin(p) * 0.6 },
        legBL: { rx: -Math.sin(p) * 0.6 },
        body: { y: Math.abs(Math.sin(p)) * 0.9, rz: Math.sin(p) * 0.05 },
        tail: { ry: Math.sin(p) * 0.45 }
      })
    } else if (input.motion === 'attack' || input.motion === 'breath') {
      const { ms, cue, end } = actionClock(input)
      const rear = track(ms, [
        [0, 0],
        [cue * 0.75, 1],
        [cue + (end - cue) * 0.6, 0.85],
        [end, 0]
      ])
      const lunge = strike(ms, [
        [0, 0],
        [cue * 0.75, -0.65],
        [cue, 0.6],
        [cue + (end - cue) * 0.6, 0.5],
        [end, 0]
      ])
      pose.body = { rx: -0.34 * rear, y: 1.8 * rear }
      pose.neck = { rx: -0.62 * rear + lunge * 0.95 }
      pose.head = { rx: 0.16 + lunge * 0.52 }
      pose.jaw = {
        rx: track(ms, [
          [0, 0.12],
          [cue * 0.75, 0.2],
          [cue, 0.95],
          [cue + (end - cue) * 0.6, 0.85],
          [end, 0.12]
        ])
      }
      pose.wingL = { rz: 0.4 + 0.42 * rear + Math.sin(ms * 0.02) * 0.15, ry: -0.5 }
      pose.wingR = { rz: -0.4 - 0.42 * rear - Math.sin(ms * 0.02) * 0.15, ry: 0.5 }
      pose.legFL = { rx: -0.65 * rear }
      pose.legFR = { rx: -0.65 * rear }
    }
    return pose
  }
}
