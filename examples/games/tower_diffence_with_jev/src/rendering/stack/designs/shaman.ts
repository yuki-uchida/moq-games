import { bipedPose, type StackDesign } from '../StackDesign'
import { human } from './common'

/**
 * きのこメイジ — a mischievous mushroom sorcerer with a raised spotted crimson-orchid toadstool
 * cap revealing blazing toxic-lime eyes under its pale gills, a moss shawl and gnarled spore staff.
 */
export const shaman: StackDesign = {
  type: 'shaman',
  voxel: 2,
  walkDistance: 26,
  portraitCrop: 0.66,
  portraitYaw: -0.3,
  portraitFocusY: 0.14,
  shadow: [8, 7],
  emitter: { part: 'weapon', at: [0.5, 1.5, 14.5] },
  blueprint: {
    id: 'shaman',
    density: 2,
    colors: {
      stem: '#f5e4c6',
      stemShade: '#cfb388',
      cap: '#cf3680',
      capDark: '#8a1b52',
      spot: '#fff7fc',
      gill: '#edb8d4',
      '*eye': '#b8ff38',
      pupil: '#1d1024',
      moss: '#469c36',
      mossDark: '#2b6b23',
      root: '#6e4222',
      foot: '#b5976c',
      '*spore': '#c2ff47',
      '*sporeCore': '#ffffff'
    },
    build(kit) {
      const b = human(
        kit,
        {
          skin: 'stem',
          eye: 'pupil',
          legs: 'stemShade',
          boots: 'foot',
          torso: 'moss',
          torsoTrim: 'mossDark',
          belt: 'mossDark',
          sleeve: 'stem',
          hands: 'stem'
        },
        { legs: 4, torsoHalf: 3, torsoDepth: 3, torsoHeight: 5, headRadius: 3.9, armLength: 6, eyeRow: 2, coveredSides: true }
      )
      // Glowing high-res toxic-lime eyes with crisp irises peeking beneath the raised mushroom cap.
      for (const gx of [-6, -5, -4, 3, 4, 5])
        for (let gy = 4; gy <= 7; gy++) b.head.rawFace(gx, gy, '*eye', '+z', 2)
      b.head.rawFace(-5, 5, 'pupil', '+z', 2).rawFace(4, 5, 'pupil', '+z', 2)
      b.head.rawFace(-5, 6, 'pupil', '+z', 2).rawFace(4, 6, 'pupil', '+z', 2)
      // Raised silky toadstool cap with round cream spots & fine underside gills.
      const cap = b.head
      cap.fill([-9, 5, -9], [8, 12, 8], 'cap', (x, y, z) => {
        const yOff = z > 1 ? 0.9 : 0
        const yy = y - (5 + yOff)
        if (yy < 0) return false
        const r = 8.4 * Math.sqrt(Math.max(0, 1 - (yy / 6.6) ** 2))
        return Math.hypot(x, z + 0.6) <= r
      })
      cap.fill([-9, 5, -9], [8, 5, 8], 'gill', (x, _y, z) => {
        const d = Math.hypot(x, z + 0.6)
        return d <= 8.2 && d > 3.6 && z <= 2
      })
      cap.paint((x, y, z) => (y === 5 && Math.hypot(x + 0.5, z + 1.1) > 7.4 ? 'capDark' : undefined))
      for (const [x, y, z] of [
        [-4, 10.2, 1],
        [2.5, 10.2, -3],
        [4.5, 8.2, 3],
        [-6, 7.5, -3],
        [0, 11.4, -1],
        [-2, 9.2, 4.2],
        [5, 8.2, -5],
        [-5, 9.2, -5]
      ])
        cap.ellipsoid([x, y, z], [1.25, 0.85, 1.25], 'spot')
      // Moss shawl.
      b.torso.fill([-5, 3, -4], [4, 5, 4], 'moss', (x, y, z) => Math.hypot(x / 4.6, z / 3.6) <= 1)
      // Twisted root staff with chunky 2px shaft and bright spore bulb.
      const staff = kit.part('weapon', 'armR', [0, b.hand, 0])
      for (let z = -3; z <= 13; z++) {
        const ox = Math.round(Math.sin(z * 0.6) * 0.6)
        staff.box([ox, 0, z], [ox + 1, 1, z], 'root')
      }
      staff.ellipsoid([0.5, 1.5, 14.5], [2.3, 2.3, 2.3], '*spore').box([0, 1, 14], [1, 2, 15], '*sporeCore')
      staff.box([1, 0, 11], [2, 1, 12], 'root')
    }
  },
  pose: (input) => {
    const pose = bipedPose(input, { attack: 'cast', stride: 0.55, bob: 0.9 })
    pose.torso = { ...pose.torso, rx: (pose.torso?.rx ?? 0) + 0.14 }
    return pose
  }
}
