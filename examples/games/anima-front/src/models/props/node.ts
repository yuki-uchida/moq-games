/**
 * Hive node (殲滅任務, 蝕獣): a pulsating pod of glossy indigo-black chitin on a mound of roots, ringed with
 * violet crystal spikes, with pulsing violet veins. Three thick petals close over a hot core; `state` 1 =
 * exposed (the petals peel open and the core blazes). Uses the invaders' material with the hull outline.
 */
import { capsule, cone, ellipsoid, plane, scaled, Sculpt, shell, sphere, type Vec3 } from '../sdf/sculpt'
import { CREATURE_LOOK, HOT, MATTE, VEIN } from '../foes/material'
import { clamp01, type PropRecipe } from './kit'

const CHITIN = 0x2b2442
const CHITIN_LIGHT = 0x40345f
const FLESH = 0x8a4a9a
const CRYSTAL = 0x8a6cff
const VEIN_C = 0xc79bff

const POD_Y = 1.9
const POD_R: Vec3 = [1.15, 1.75, 1.15]
/** Pivot of the +Z petal (its foot); the other two are turned by 120°. */
const PETAL_PIVOT: Vec3 = [0, 0.55, 0.62]

function baseSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(scaled(sphere([0, 0.05, 0], 1.6), [1, 0.33, 1]), { color: CHITIN })
  // Roots creeping out over the ground.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3
    const len = 2.6 + 0.5 * Math.sin(i * 2.3)
    const mid: Vec3 = [Math.sin(a) * 1.6, 0.18, Math.cos(a) * 1.6]
    const tip: Vec3 = [Math.sin(a + 0.25) * len, 0.04, Math.cos(a + 0.25) * len]
    s.add(scaled(capsule([Math.sin(a) * 0.8, 0.35, Math.cos(a) * 0.8], mid, 0.24), [1, 0.8, 1]), {
      color: CHITIN,
      k: 0.18
    })
    s.add(cone(mid, tip, 0.18, 0.05), { color: CHITIN, k: 0.12 })
  }
  // Crystal spikes leaning outwards.
  const spikes: [number, number, number, number][] = [
    [0.4, 1.7, 1.5, 0.2],
    [1.5, 1.9, 1.1, 0.16],
    [2.5, 1.6, 1.4, 0.22],
    [3.4, 2.0, 0.9, 0.15],
    [4.3, 1.75, 1.6, 0.24],
    [5.3, 1.8, 1.0, 0.17],
    [6.0, 2.1, 1.25, 0.19]
  ]
  for (const [a, r, h, w] of spikes) {
    const foot: Vec3 = [Math.sin(a) * r, 0.1, Math.cos(a) * r]
    const tip: Vec3 = [Math.sin(a) * (r + h * 0.45), h, Math.cos(a) * (r + h * 0.45)]
    s.add(cone(foot, tip, w, 0.015), { color: CRYSTAL, k: 0.08 })
    const t2: Vec3 = [Math.sin(a + 0.25) * (r + 0.4), h * 0.55, Math.cos(a + 0.25) * (r + 0.4)]
    s.add(cone(foot, t2, w * 0.6, 0.012), { color: CRYSTAL, k: 0.05 })
  }
  // The stalk the pod sits on.
  s.add(cone([0, 0.2, 0], [0, 0.9, 0], 0.75, 0.45), { color: CHITIN_LIGHT, k: 0.25 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.02 })
  // Glowing crystal hearts and veins over the mound.
  for (const [a, r, h] of spikes) {
    const mid: Vec3 = [Math.sin(a) * (r + h * 0.2), h * 0.45, Math.cos(a) * (r + h * 0.2)]
    s.paint(sphere(mid, 0.3), { color: 0xd8c4ff, mask: HOT })
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3
    s.paint(
      scaled(
        capsule(
          [Math.sin(a) * 0.5, 0.6, Math.cos(a) * 0.5],
          [Math.sin(a + 0.25) * 2.4, 0.1, Math.cos(a + 0.25) * 2.4],
          0.05
        ),
        [4, 1, 4]
      ),
      {
        color: VEIN_C,
        mask: VEIN
      }
    )
  }
  return s
}

function petalSculpt(): Sculpt {
  // One third of the egg-shaped pod (facing +Z), a thick shell with a ridge, spines and veins.
  const s = new Sculpt()
  s.add(shell([0, POD_Y, 0], POD_R, 0.13), { color: CHITIN })
  const half = Math.PI / 3 - 0.05
  s.inter(plane([0, 0, 0], [Math.cos(half), 0, -Math.sin(half)]), { k: 0.04 })
  s.inter(plane([0, 0, 0], [-Math.cos(half), 0, -Math.sin(half)]), { k: 0.04 })
  s.inter(plane([0, 0.45, 0], [0, -1, 0]), { k: 0.06 })
  s.add(scaled(capsule([0, 0.75, 0.85], [0, POD_Y + 1.25, 0.55], 0.1), [1.1, 1, 1]), { color: CHITIN_LIGHT, k: 0.12 })
  for (const y of [1.3, 2.1, 2.8]) {
    const z = POD_R[2] * Math.sqrt(Math.max(0, 1 - ((y - POD_Y) / POD_R[1]) ** 2))
    s.add(cone([0, y, z + 0.02], [0, y + 0.25, z + 0.35], 0.09, 0.012), { color: CHITIN_LIGHT, k: 0.05 })
  }
  s.add(cone([0, POD_Y + 1.5, 0.35], [0, POD_Y + 2.05, 0.1], 0.12, 0.015), { color: CHITIN_LIGHT, k: 0.1 })
  // Veins on the outside, soft flesh inside.
  for (const side of [1, -1])
    s.paint(scaled(capsule([0.12 * side, 0.75, 0.92], [0.5 * side, 2.9, 0.86], 0.045), [1, 1, 5]), {
      color: VEIN_C,
      mask: VEIN,
      union: [scaled(capsule([0.3 * side, 1.7, 1.08], [0.8 * side, 2.1, 0.7], 0.04), [1, 1, 5])]
    })
  s.paint(ellipsoid([0, POD_Y, 0], [POD_R[0] - 0.06, POD_R[1] - 0.06, POD_R[2] - 0.06]), { color: FLESH, mask: MATTE })
  return s
}

function coreSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(sphere([0, 1.75, 0], 0.62), { color: 0xd890ff })
  s.add(sphere([0, 1.15, 0], 0.4), { color: FLESH, k: 0.25 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    s.add(sphere([Math.sin(a) * 0.45, 1.95 + 0.15 * Math.sin(i * 3), Math.cos(a) * 0.45], 0.22), {
      color: 0xd890ff,
      k: 0.15
    })
  }
  s.paint(sphere([0, 1.85, 0], 0.75), { color: 0xffe0ff, mask: HOT })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    s.paint(capsule([0, 1.1, 0], [Math.sin(a) * 0.55, 2.2, Math.cos(a) * 0.55], 0.035), { color: 0x5a2a7a })
  }
  return s
}

export function nodeRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'base', sculpt: baseSculpt(), cell: 0.095, tris: 4400, mat: 'foe' },
      { name: 'petal', sculpt: petalSculpt(), cell: 0.1, tris: 2000, mat: 'foe', pivot: PETAL_PIVOT, copies: 3 },
      { name: 'core', sculpt: coreSculpt(), cell: 0.09, tris: 900, mat: 'foe', pivot: [0, 1.0, 0] }
    ],
    look: {
      glowColor: 0xffffff,
      glow: 0,
      glow2Color: 0xffffff,
      outline: 0.012,
      foe: { ...CREATURE_LOOK, hot: 2.0, hotColor: 0xc77cff, glow: 1.7, pulse: [2.4, 0.6] }
    },
    animate(c) {
      const time = c.clock
      // Smoothly follow the exposed state.
      const target = c.state >= 0.5 ? 1 : 0
      const open = (c.mem.open ??= target)
      c.mem.open = open + (target - open) * Math.min(1, c.dt * 2.5)
      const o = c.mem.open
      const beat = Math.pow(0.5 + 0.5 * Math.sin(time * 2.4), 3)
      for (let i = 0; i < 3; i++) {
        const g = c.parts[i ? `petal${i}` : 'petal']
        const yaw = (i * Math.PI * 2) / 3
        g.position.set(Math.sin(yaw) * PETAL_PIVOT[2], PETAL_PIVOT[1], Math.cos(yaw) * PETAL_PIVOT[2])
        g.rotation.set(o * 1.2 + (1 - o) * beat * 0.03 + Math.sin(time * 1.3 + i) * 0.02 * o, yaw, 0, 'YXZ')
        const sc = 1 + beat * 0.025
        g.scale.set(sc, sc, sc)
      }
      const core = c.parts.core
      const swell = 1 + beat * (0.04 + 0.08 * o)
      core.scale.set(swell, swell, swell)
      if (c.fu) {
        c.fu.uGlow3.value = 0.9 + o * (2.2 + beat * 1.4)
        c.fu.uGlow.value = 1.4 + 0.5 * o
        c.fu.uDim.value = clamp01((0.25 - c.health) * 2) * 0.6
      }
    }
  }
}
