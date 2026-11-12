/**
 * ミツメ: a three-eyed scout drone. A pearl teardrop shell with a glossy graphite face, three lens eyes in a
 * triangle, swept fins and a cyan thruster underneath, circled by an orbiting ring with three pods.
 *
 * Laser (wind-up): the ring swings in front of the face as a spinning aperture, the eyes charge red and grow;
 * attack = three shots, each with a recoil kick. Strafing tilts the nose down and rolls with speed.
 */
import type * as THREE from 'three'
import { FOES } from '../../../data/enemies'
import type { FoeAnim } from '../../api'
import { cone, cylinder, ellipsoid, plane, Sculpt, sphere, torus, type Vec3 } from '../../sdf/sculpt'
import type { FoeRecipe } from '../index'
import type { TubeSpec } from '../tube'
import { HOT, VEIN } from '../material'
import { clamp01, hash, mix, pivotMatrix, smooth, chain, windupT } from '../rigging'
import {
  beginPose,
  endPose,
  flicker,
  GRAPHITE,
  hidePart,
  kick,
  lensSculpt,
  panelLine,
  PEARL,
  PEARL_2,
  seam,
  SEAM_C,
  shudder,
  STEEL,
  sparkPose,
  sparkSculpt,
  WARN_C
} from './kit'

const DEF = FOES.mitsume
const LASER = DEF.attacks[0]
const WIND = LASER.windup
const SHOTS = LASER.count ?? 3
/** Seconds between the shots of a burst (sim/foes/machines.ts). */
const GAP = 0.12
/** Body centre. */
const CY = 0.36
/** Eyes: main (top) and the two lower ones. */
const EYES: { p: Vec3; r: number }[] = [
  { p: [0, 0.408, 0.25], r: 0.054 },
  { p: [0.098, 0.312, 0.236], r: 0.042 },
  { p: [-0.098, 0.312, 0.236], r: 0.042 }
]
/** Ring spin while orbiting and the extra spin rate reached at the end of the wind-up (rad/s). */
const SPIN = 1.6
const SPIN_UP = 26
const RING_R = 0.43

function body(): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid([0, 0.37, -0.01], [0.24, 0.205, 0.25]), { color: PEARL })
  s.add(cone([0, 0.38, -0.12], [0, 0.43, -0.38], 0.15, 0.03), { color: PEARL, k: 0.07 })
  // Swept stabiliser fins and a dorsal fin.
  s.mirror((side) => {
    s.add(ellipsoid([0.26 * side, 0.385, -0.16], [0.16, 0.022, 0.085], [0, -0.7 * side, -0.3 * side]), {
      color: PEARL,
      k: 0.025
    })
  })
  s.add(ellipsoid([0, 0.56, -0.13], [0.02, 0.075, 0.12], [-0.55, 0, 0]), { color: PEARL, k: 0.03 })
  // Graphite face: the shell is cut flat at the front and a glossy dome fills it.
  s.sub(plane([0, 0, 0.17], [0, 0, -1]), { k: 0.012, color: PEARL_2 })
  s.add(ellipsoid([0, 0.358, 0.15], [0.198, 0.162, 0.108]), { color: GRAPHITE, k: 0.006 })
  // Underside: a thruster housing.
  s.add(cylinder([0, 0.185, -0.03], 0.1, 0.04, 0.02), { color: GRAPHITE, k: 0.04 })
  // Tail warning light.
  s.add(sphere([0, 0.43, -0.385], 0.026), { color: WARN_C, mask: HOT, k: 0.006 })
  // Markings: equator light seam, panel lines, fin tips and the thruster glow.
  seam(s, [0, 0.372, 0], [0, 1, 0], 0.007, ellipsoid([0, 0.37, -0.1], [0.3, 0.05, 0.27]))
  panelLine(s, [0, 0, 0], [1, 0, 0], 0.006, ellipsoid([0, 0.5, -0.08], [0.06, 0.1, 0.2]))
  panelLine(s, [0, 0, -0.06], [0, 0, 1], 0.006, ellipsoid([0, 0.5, -0.06], [0.26, 0.11, 0.05]))
  s.paint(sphere([0, 0.62, -0.19], 0.035), { color: SEAM_C, mask: VEIN })
  s.mirror((side) => {
    s.paint(sphere([0.385 * side, 0.385, -0.255], 0.032), { color: SEAM_C, mask: VEIN })
  })
  s.paint(ellipsoid([0, 0.14, -0.03], [0.075, 0.03, 0.075]), { color: SEAM_C, mask: VEIN })
  return s
}

/** The orbiting ring in the XY plane (axis +Z) around the body centre (a closed tube), with three pods. */
function ring(): { sculpt: Sculpt; tubes: TubeSpec[] } {
  const s = new Sculpt()
  const pts: Vec3[] = []
  const r: number[] = []
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2
    pts.push([Math.cos(a) * RING_R, CY + Math.sin(a) * RING_R, 0])
    r.push(0.022)
  }
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3
    const c: Vec3 = [Math.cos(a) * RING_R, CY + Math.sin(a) * RING_R, 0]
    s.add(ellipsoid(c, [0.045, 0.045, 0.06], [0, 0, a]), { color: PEARL, k: 0.015 })
    s.add(cylinder(c, 0.03, 0.068, 0.01, [Math.PI / 2, 0, 0]), { color: GRAPHITE, k: 0.006 })
    s.paint(sphere([c[0], c[1], c[2] + 0.07], 0.022), { color: SEAM_C, mask: VEIN })
    s.paint(sphere([c[0], c[1], c[2] - 0.07], 0.022), { color: SEAM_C, mask: VEIN })
  }
  // Light line on the inner edge.
  s.paint(torus([0, CY, 0], RING_R - 0.02, 0.009, [Math.PI / 2, 0, 0]), { color: SEAM_C, mask: VEIN })
  return { sculpt: s, tubes: [{ pts, r, color: PEARL, sides: 6, up: [0, 0, 1] }] }
}

/** Lens domes on the visor, each in a steel bezel. */
function eyes(): Sculpt {
  const s = new Sculpt()
  for (const e of EYES) {
    s.add(torus([e.p[0], e.p[1], e.p[2] - 0.004], e.r + 0.006, 0.011, [Math.PI / 2, 0, 0]), { color: STEEL })
    s.append(lensSculpt([e.p[0], e.p[1], e.p[2] - 0.008], e.r, 0.6))
  }
  return s
}

/** Red charge cores that grow out of the sockets over the lenses. */
function charge(): Sculpt {
  const s = new Sculpt()
  for (const e of EYES) {
    const z = e.p[2] - 0.006
    s.add(ellipsoid([e.p[0], e.p[1], z], [e.r * 1.1, e.r * 1.1, e.r * 0.72]), { color: 0xff8a7a, mask: HOT })
    s.paint(ellipsoid([e.p[0], e.p[1], z + e.r * 0.5], [e.r * 0.55, e.r * 0.55, e.r * 0.4]), {
      color: 0xfff2ec,
      mask: HOT
    })
  }
  return s
}

const B = 0
const RING = 1
const LENS = 2
const CHARGE = 3
const FX = 4

function pose(a: FoeAnim, out: THREE.Matrix4[]): void {
  const root = beginPose(a)
  const t = a.time + a.seed * 37
  const st = a.st
  const sp = clamp01(a.speed / DEF.speed)
  const dir = hash(a.seed, 9) < 0.5 ? 1 : -1
  // Hover: bob, nose down and roll with speed, an idle scan of the eyes when hanging still.
  let y = Math.sin(t * 2.2) * 0.04 + Math.sin(t * 3.9 + 1) * 0.012
  let z = 0
  let rx = sp * 0.26 + Math.sin(t * 1.3) * 0.03
  let rz = Math.sin(t * 0.8 + a.seed * 5) * (0.04 + 0.16 * sp)
  let ry = (Math.sin(t * 0.5) * 0.32 + Math.sin(t * 1.9) * 0.05) * (1 - sp)
  let open = 1
  let aim = 0
  let spin = t * SPIN
  let glow = 0
  let lit = true
  let sparks = a.hpFrac < 0.3 ? 0.05 : 0
  let ringDrop = 0
  let ringTip = 0
  const endWind = (SPIN_UP * WIND) / 2
  switch (a.state) {
    case 'spawn': {
      const u = smooth(st / 0.6)
      open = smooth((st - 0.2) / 0.4)
      ry += (1 - u) * 5 * dir
      rx = (1 - u) * 0.5
      lit = st > 0.62 || (st > 0.45 && flicker(a, 20, 0.5))
      break
    }
    case 'windup': {
      const w = windupT(a, WIND)
      glow = smooth(w * 1.25)
      aim = smooth(w * 1.9)
      spin += (SPIN_UP * st * st) / (2 * WIND)
      const steady = 1 - aim * 0.85
      rx *= steady
      rz *= steady
      ry *= steady
      const tr = smooth((w - 0.55) / 0.45) * 0.012
      y += shudder(a, 80) * tr
      z -= aim * 0.03
      break
    }
    case 'attack': {
      let r = 0
      for (let i = 0; i < SHOTS; i++) r += kick(st, i * GAP, 18)
      aim = 1
      glow = 1 + r * 0.35
      spin += endWind + SPIN_UP * st
      z -= r * 0.08 + 0.03
      rx = -r * 0.2
      rz *= 0.15
      ry *= 0.15
      break
    }
    case 'recover': {
      // The sim enters 'recover' on the tick of the last shot: its kick plays here.
      const r = kick(st, 0, 18)
      const u = smooth(st / 0.4)
      aim = 1 - u
      glow = (1 - smooth(st / 0.22)) * 0.95 + r * 0.35
      const s = Math.min(st, 0.4)
      spin += endWind + SPIN_UP * (SHOTS - 1) * GAP + SPIN_UP * (s - (s * s) / 0.8)
      rx = rx * u - r * 0.2
      rz *= 0.15 + 0.85 * u
      ry *= u
      z -= 0.03 * (1 - u) + r * 0.08
      break
    }
    case 'stagger': {
      const f = 1 - smooth((st - 0.3) / 0.4)
      y += shudder(a, 55) * 0.03 * f
      rz += shudder(a, 41, 2) * 0.3 * f
      rx += shudder(a, 37, 4) * 0.18 * f
      sparks = 0.65 * f
      lit = f < 0.2 || flicker(a, 18, 0.55)
      break
    }
    case 'dying': {
      const u = smooth(st / 0.4)
      const side = hash(a.seed, 11) < 0.5 ? 1 : -1
      rz += side * 1.25 * u + shudder(a, 60) * 0.12 * (1 - u)
      rx += 0.7 * u
      y -= 0.3 * u * u
      ringDrop = st * st * 2.4
      ringTip = u * 1.2 * side
      lit = st < 0.14 && flicker(a, 30, 0.5)
      sparks = st < 0.5 ? 0.8 : 0
      break
    }
    default:
      break
  }
  const body = pivotMatrix(out[B], 0, CY, 0, 0, y, z, rx, ry, rz)

  // Ring: tilted orbit → upright aperture in front of the face.
  const k = mix(0.4, 1, open) * mix(1, 0.6, aim)
  pivotMatrix(
    out[RING],
    0,
    CY,
    0,
    0,
    -ringDrop,
    mix(0, 0.3, aim),
    mix(-Math.PI / 2 + 0.38, 0, aim) + ringTip,
    (1 - aim) * Math.sin(t * 0.4) * 0.6,
    spin * dir,
    k,
    k,
    k
  )
  chain(out[RING], body)

  if (lit) out[LENS].copy(body)
  else chain(pivotMatrix(out[LENS], 0, 0, 0, 0, 0, -0.07, 0, 0, 0), body)

  if (glow > 0.01) {
    const g = 0.72 + 0.32 * Math.min(glow, 1.25) + (glow > 0.9 ? Math.sin(a.time * 60) * 0.02 : 0)
    chain(pivotMatrix(out[CHARGE], 0, CY, 0.08, 0, 0, 0, 0, 0, 0, g, g, g), body)
  } else chain(hidePart(out[CHARGE], 0, CY, 0.05), body)

  sparkPose(out[FX], a, 0, CY, 0, sparks)
  chain(out[FX], body)
  endPose(out, 5, root)
}

export function mitsume(): FoeRecipe {
  return {
    parts: [
      { name: 'body', sculpt: body(), cell: 0.011, tris: 1500 },
      { name: 'ring', ...ring(), cell: 0.009, tris: 300 },
      { name: 'eyes', sculpt: eyes(), cell: 0.0045, tris: 300 },
      { name: 'charge', sculpt: charge(), cell: 0.0045, tris: 240 },
      { name: 'sparks', sculpt: sparkSculpt([0, CY, 0], [0.27, 0.23, 0.28], 7, 0.08), cell: 0.008, tris: 120 }
    ],
    pose
  }
}
