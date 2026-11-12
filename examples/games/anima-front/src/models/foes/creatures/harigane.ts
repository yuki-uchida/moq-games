/**
 * ハリガネ: a stilt-legged spitter (2.4 m). A small armoured body slung high between four needle legs with
 * high knees, a long neck and a beaked head carrying a glowing acid sac that swells before every spit.
 *
 * Parts: body, head, sac (on the head; swells), legFL, legFR, legBL, legBR (rigid stilts that swing about the
 * hip: a trot of diagonal pairs with the body bobbing between them).
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import { ellipsoid, mx, plane, Sculpt, slab, sphere, type Vec3 } from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import { HOT, VEIN } from '../material'
import { bump, chain, clamp01, hash, pivotMatrix, sizeJitter, smooth, TAU } from '../rigging'
import type { TubeSpec } from '../tube'
import { BELLY, BONE, CHITIN, eyeCore, JOINT, PLATE, VEIN_C, vein, veinCut } from './palette'

const BODY = 0,
  HEAD = 1,
  SAC = 2,
  LEG0 = 3

/** Body centre, neck pivot (head turns here) and sac base. */
const BODY_C: Vec3 = [0, 1.72, -0.05]
const NECK: Vec3 = [0, 1.8, 0.2]
const SAC_C: Vec3 = [0, 2.12, 0.36]
const ACID = 0xb4ff5a

/** Hip, knee, foot of the front-left leg (others mirror / flip z). */
const LEG: Vec3[] = [
  [0.16, 1.68, 0.06],
  [0.52, 2.08, 0.34],
  [0.68, 0.9, 0.56],
  [0.74, 0.0, 0.66]
]

function body(): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid([0, 1.72, 0.02], [0.24, 0.17, 0.26]), { color: CHITIN })
  s.add(ellipsoid([0, 1.64, -0.3], [0.2, 0.2, 0.24], [0.5, 0, 0]), { color: CHITIN, k: 0.06 })
  s.add(ellipsoid([0, 1.48, -0.45], [0.12, 0.14, 0.12]), { color: CHITIN, k: 0.06 })
  // Dorsal shield and neck collar.
  s.add(ellipsoid([0, 1.83, -0.02], [0.22, 0.07, 0.26], [-0.1, 0, 0]), { color: CHITIN, k: 0.04 })
  s.add(ellipsoid([0, 1.79, 0.2], [0.12, 0.11, 0.1]), { color: CHITIN, k: 0.05 })
  s.paint(ellipsoid([0, 1.95, -0.05], [0.24, 0.14, 0.3]), { color: PLATE })
  s.paint(ellipsoid([0, 1.48, -0.2], [0.22, 0.14, 0.4]), { color: BELLY })
  for (const z of [-0.2, -0.34])
    s.paint(slab([0, 0, z], [0, -0.5, 1], 0.012), { color: JOINT, within: ellipsoid([0, 1.6, z], [0.3, 0.3, 0.1]) })
  vein(
    s,
    [
      [0, 1.9, 0.18],
      [0, 1.9, -0.05],
      [0, 1.82, -0.28],
      [0, 1.66, -0.46]
    ],
    0.03
  )
  s.mirror((side) => {
    veinCut(s, [0, 1.7, 0], [0, 1, -0.3], 0.016, ellipsoid(mx([0.2, 1.68, -0.15], side), [0.12, 0.14, 0.4]))
  })
  return s
}

function head(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  // Long neck, a narrow armoured head and a spout beak.
  s.add(ellipsoid([0, 2.0, 0.6], [0.13, 0.12, 0.2], [0.2, 0, 0]), { color: CHITIN })
  s.add(ellipsoid([0, 2.07, 0.58], [0.12, 0.06, 0.17], [0.1, 0, 0]), { color: CHITIN, k: 0.04 })
  s.sub(sphere([0, 1.97, 0.9], 0.05), { k: 0.02, color: JOINT })
  s.paint(ellipsoid([0, 2.14, 0.56], [0.14, 0.06, 0.2]), { color: PLATE })
  s.paint(ellipsoid([0, 1.9, 0.6], [0.1, 0.05, 0.16]), { color: BELLY })
  s.mirror((side) => eyeCore(s, mx([0.1, 2.04, 0.68], side), 0.035, [side * 0.7, 0.1, 0.7]))
  eyeCore(s, [0, 2.1, 0.74], 0.024, [0, 0.3, 1])
  s.paint(sphere([0, 1.97, 0.86], 0.05), { color: ACID, mask: HOT })
  const tubes: TubeSpec[] = [
    {
      pts: [NECK, [0, 1.93, 0.36], [0, 1.99, 0.5]],
      r: [0.085, 0.075, 0.08],
      color: CHITIN,
      sides: 7,
      smooth: 2,
      ao: [0.7, 1]
    },
    {
      pts: [
        [0, 1.98, 0.74],
        [0, 1.96, 0.88],
        [0, 1.95, 0.94]
      ],
      r: [0.06, 0.045, 0.04],
      color: CHITIN,
      sides: 7
    }
  ]
  return { sculpt: s, tubes }
}

function sac(): Sculpt {
  const s = new Sculpt()
  // A swollen translucent-looking sac: glowing acid core, dark veins over it, a chitin cup at its base.
  s.add(ellipsoid([0, 2.24, 0.38], [0.17, 0.16, 0.2]), { color: 0x6a4a8a })
  s.add(ellipsoid([0, 2.12, 0.42], [0.13, 0.05, 0.16]), { color: CHITIN, k: 0.03 })
  s.paint(ellipsoid([0, 2.27, 0.38], [0.15, 0.13, 0.18]), { color: ACID, mask: HOT })
  for (const a of [-0.6, 0, 0.6])
    s.paint(slab([0, 2.2, 0.38], [Math.cos(a), 0, Math.sin(a)], 0.009), {
      color: 0x3a1c5a,
      within: ellipsoid([0, 2.3, 0.38], [0.2, 0.14, 0.22])
    })
  s.paint(slab([0, 2.12, 0], [0, 1, 0], 0.012), { color: VEIN_C, mask: VEIN, within: sphere(SAC_C, 0.2) })
  return s
}

function leg(side: number, back: boolean): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const zf = back ? -1 : 1
  const pts = LEG.map((p) => mx([p[0], p[1], p[2] * zf - (back ? 0.12 : 0)], side))
  const s = new Sculpt()
  s.paint(sphere(pts[3], 0.12), { color: BONE, mask: [0, 0, 1, 0] })
  s.paint(sphere(pts[1], 0.07), { color: PLATE })
  s.paint(slab(pts[2], [0, 1, 0], 0.03), { color: VEIN_C, mask: VEIN, within: sphere(pts[2], 0.1) })
  return {
    sculpt: s,
    tubes: [{ pts, r: [0.06, 0.055, 0.038, 0], color: CHITIN, sides: 6, ao: [0.65, 1] }]
  }
}

export function harigane(): FoeRecipe {
  const acid = FOES.harigane.attacks[0].windup
  return {
    parts: [
      { name: 'body', sculpt: body(), cell: 0.022, tris: 900 },
      { name: 'head', ...head(), cell: 0.018, tris: 520 },
      { name: 'sac', sculpt: sac(), cell: 0.016, tris: 320 },
      { name: 'legFL', ...leg(1, false), cell: 0.02, tris: 0 },
      { name: 'legFR', ...leg(-1, false), cell: 0.02, tris: 0 },
      { name: 'legBL', ...leg(1, true), cell: 0.02, tris: 0 },
      { name: 'legBR', ...leg(-1, true), cell: 0.02, tris: 0 }
    ],
    look: { hotColor: ACID, hot: 2.2 },
    pose: (a, out) => pose(a, out, acid)
  }
}

/** Hip of leg i (0 FL, 1 FR, 2 BL, 3 BR). */
const hip = (i: number): Vec3 => {
  const side = i & 1 ? -1 : 1
  const back = i >= 2
  return [LEG[0][0] * side, LEG[0][1], back ? -LEG[0][2] - 0.12 : LEG[0][2]]
}
const HIPS = [0, 1, 2, 3].map(hip)

function pose(a: FoeAnim, out: THREE.Matrix4[], windup: number) {
  const t = a.time + a.seed * 13
  const j = sizeJitter(a)
  const moving = clamp01(a.speed / 3)
  const ph = t * 2.6 * TAU
  let bob = 0,
    sway = 0,
    pitch = 0,
    roll = 0,
    drop = 0,
    splay = 0,
    fold = 0
  let neckPitch = 0.05 * Math.sin(t * 1.1),
    neckYaw = 0.25 * Math.sin(t * 0.6 + a.seed * 5) * (1 - moving),
    sacSwell = 1 + 0.04 * Math.sin(t * 3),
    stride = 0.16 * moving,
    lift = 0.07 * moving
  // Stilt trot: the body bobs twice per cycle and sways side to side.
  bob += -Math.abs(Math.sin(ph)) * 0.05 * moving + Math.sin(t * 1.4) * 0.015
  sway += Math.sin(ph) * 0.04 * moving
  roll += Math.sin(ph) * 0.04 * moving
  pitch += 0.05 * moving
  const st = a.st
  switch (a.state) {
    case 'spawn': {
      // Rises out of the ground with legs folded up, then unfolds them.
      const u = smooth((st - 0.2) / 0.6)
      fold = 1 - u
      neckPitch -= 0.5 * (1 - u)
      break
    }
    case 'windup': {
      // Braces (legs splay, body drops), rears the head back and the sac swells and flares.
      const u = smooth(st / windup)
      splay = 0.12 * u
      drop = 0.16 * u
      neckPitch -= 0.55 * u
      pitch -= 0.15 * u
      sacSwell = 1 + 0.55 * u + Math.sin(t * 40) * 0.05 * u
      stride = 0
      break
    }
    case 'attack': {
      // Spit: the head snaps forward and the sac empties.
      const u = clamp01(st / 0.18)
      neckPitch += 0.45 * bump(u, 0, 1) - 0.2 * (1 - u)
      sacSwell = 1.55 - 0.75 * u
      splay = 0.12
      drop = 0.16
      break
    }
    case 'recover': {
      const u = smooth(st / 0.45)
      sacSwell = 0.8 + 0.2 * u
      splay = 0.12 * (1 - u)
      drop = 0.16 * (1 - u)
      neckPitch += 0.15 * (1 - u)
      break
    }
    case 'stagger': {
      const u = clamp01(st / 0.6)
      roll += Math.sin(st * 22) * 0.12 * (1 - u)
      neckYaw += Math.sin(st * 17) * 0.5 * (1 - u)
      drop = 0.1 * bump(u, 0, 1)
      break
    }
    case 'dying': {
      // The stilts splay out and buckle; the body drops and tips over.
      const u = smooth(st / 0.45)
      splay = 0.75 * u
      drop = 1.1 * u
      roll += (hash(a.seed, 2) > 0.5 ? 1 : -1) * 0.5 * u
      neckPitch += 0.9 * u
      sacSwell = 1 - 0.4 * u
      stride = 0
      break
    }
  }
  const B = out[BODY]
  pivotMatrix(B, BODY_C[0], BODY_C[1], BODY_C[2], sway, bob - drop, 0, pitch, 0, roll, j, j, j)
  pivotMatrix(out[HEAD], NECK[0], NECK[1], NECK[2], 0, 0, 0, neckPitch, neckYaw, 0)
  chain(out[HEAD], B)
  pivotMatrix(out[SAC], SAC_C[0], 2.08, SAC_C[2], 0, 0, 0, 0, 0, 0, sacSwell, sacSwell, sacSwell)
  chain(out[SAC], out[HEAD])
  // Legs: rigid stilts swinging about the hip (diagonal pairs), lifted by shortening in the swing phase.
  for (let i = 0; i < 4; i++) {
    const h = HIPS[i]
    const side = i & 1 ? -1 : 1
    const back = i >= 2
    const p = ph + (i === 0 || i === 3 ? 0 : Math.PI)
    const swing = Math.max(0, Math.sin(p))
    const theta = -Math.cos(p) * stride
    const rollOut = side * (splay + fold * 1.1)
    // Feet stay on the ground: the stilt's length follows the hip height, the swing and the splay.
    const reach = (h[1] + bob - drop) / (h[1] * Math.cos(rollOut) * Math.cos(theta))
    const sy = Math.max(0.2, (reach - lift * swing) * (1 - fold * 0.55))
    pivotMatrix(
      out[LEG0 + i],
      h[0],
      h[1],
      h[2],
      sway,
      bob - drop,
      0,
      theta + (back ? -1 : 1) * fold * 0.6,
      0,
      rollOut,
      j,
      sy * j,
      j
    )
  }
}
