import type { StackDesign } from '../StackDesign'
import { flyerPose } from './beasts'

/**
 * 夜のコウモリ — a wide-winged lavender night bat with huge ears, blazing gold 2x2 eyes, sharp
 * fangs and sweeping 3x-width scalloped wings with real sculptural depth from side views.
 */
export const bat: StackDesign = {
  type: 'bat',
  voxel: 2,
  walkDistance: 40,
  portraitCrop: 0.9,
  portraitYaw: -0.22,
  portraitFocusY: 0.06,
  portraitSquash: 0.48,
  portraitPose: {
    wingL: { rz: 0.28, ry: -0.32, rx: -0.15 },
    wingR: { rz: -0.28, ry: 0.32, rx: -0.15 }
  },
  simpleShadow: true,
  shadow: [7, 6],
  blueprint: {
    id: 'bat',
    density: 2,
    colors: {
      fur: '#7e5cd6',
      furDark: '#4a2e94',
      tummy: '#efe5ff',
      ear: '#ff8cc2',
      membrane: '#341e6b',
      membraneLight: '#503299',
      bone: '#9c7ef0',
      fang: '#ffffff',
      '*eye': '#ffe438',
      pupil: '#1c0f2b'
    },
    build(kit) {
      const body = kit.part('body', undefined, [0, 0, 0])
      body.ellipsoid([0, 0, 0], [4.5, 4.4, 4.6], 'fur')
      body.ellipsoid([0, -0.8, 2.0], [2.7, 2.6, 2.4], 'tummy')
      // Tapered velvet bat ears with clean pink inner hollows, crisp 3x3 gold eyes, cute nose & twin fangs.
      for (const side of [-1, 1]) {
        const bx = side < 0 ? -3.1 : 3.1
        body.segment([bx, 3.4, -0.4], [bx + side * 0.4, 9.0, -0.6], 1.35, 'furDark', 0.45)
        body.segment([bx, 4.0, 0.7], [bx + side * 0.2, 7.6, 0.4], 0.8, 'ear', 0.25)
      }
      for (const gx of [-6, -5, -4, 3, 4, 5])
        for (let gy = 2; gy <= 4; gy++) body.rawFace(gx, gy, '*eye', '+z', 2)
      body.rawFace(-5, 2, 'pupil', '+z', 2).rawFace(4, 2, 'pupil', '+z', 2)
      body.rawFace(-1, 0, 'furDark', '+z', 2).rawFace(0, 0, 'furDark', '+z', 2)
      for (let gx = -4; gx <= 3; gx++) body.rawFace(gx, -1, 'furDark', '+z', 2)
      body.rawFace(-3, -2, 'fang', '+z', 2).rawFace(-3, -3, 'fang', '+z', 2)
      body.rawFace(2, -2, 'fang', '+z', 2).rawFace(2, -3, 'fang', '+z', 2)
      body.box([-1, -5, -1], [0, -4, 0], 'furDark')

      for (const [name, side] of [
        ['wingL', 1],
        ['wingR', -1]
      ] as const) {
        const wing = kit.part(name, 'body', [side * 3.8, 1, -0.5])
        // Wide sweeping 13-cell wings with forward-back curvature so side views stay chunky.
        wing.fill([side > 0 ? 0 : -14, -2, -7], [side > 0 ? 13 : -1, 2, 5], 'membrane', (x, y, z) => {
          const d = Math.abs(x)
          if (d < 0.6 || d > 13.2) return false
          const arch = Math.sin((d / 13) * Math.PI) * 1.4
          const leadZ = 3.8 - d * 0.14 + Math.sin((d / 13) * Math.PI) * 1.1
          const trailZ = -4.8 + d * 0.16 - 1.3 * Math.abs(Math.sin(d * 0.68))
          return leadZ - trailZ >= 1.3 && z <= leadZ && z >= trailZ && y >= arch - 0.9 && y <= arch + 0.8
        })
        wing.paint((x, y, z) => (z > 0 && Math.abs(x) > 2 && Math.abs(x) < 10 ? 'membraneLight' : undefined))
        wing.segment([0, 0.2, 1], [side * 7, 1.5, 2.6], 0.7, 'bone', 0.6)
        wing.segment([side * 7, 1.5, 2.6], [side * 13, 0.4, 1.8], 0.6, 'bone', 0.45)
        for (const zEnd of [-4.5, -1.6, 1.2]) {
          wing.segment([side * 5, 1.2, 1.6], [side * 12.5, 0.2, zEnd], 0.5, 'bone', 0.4)
        }
      }
    }
  },
  pose: (input) => {
    const pose = flyerPose(input, { hover: 18, flap: 0.78, rate: 3.2 })
    // Sweep both membranes partly toward the camera and keep a raised base angle so the side
    // views show a diagonal wing rather than an edge-on sliver.
    // Stagger the two wings in depth so the profile keeps a wing silhouette and a gap to the body.
    // Symmetric base angle: the flap itself is mirrored, so no constant twist is added.
    // Opposite base roll opens a V from the side while keeping both roots on the shoulder.
    pose.wingL = { ...pose.wingL, rz: (pose.wingL?.rz ?? 0) + 0.4, ry: -0.7, rx: -0.75, z: 3, y: -2 }
    pose.wingR = { ...pose.wingR, rz: (pose.wingR?.rz ?? 0) - 0.4, ry: 0.7, rx: -0.75, z: -3, y: -2 }
    return pose
  }
}
