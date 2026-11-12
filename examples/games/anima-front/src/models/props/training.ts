/**
 * 訓練場 props: the target (a plywood cut-out of a cartoon ツブテ with a bullseye belly, hinged on a post with
 * crossed feet; moving targets wobble) and the tutorial checkpoint beacon (a post with a lamp and a spinning
 * halo, plus a pulsing ground ring).
 */
import * as THREE from 'three'
import { arc, box, capsule, cone, cylinder, ellipsoid, plane, scaled, Sculpt, sphere, torus } from '../sdf/sculpt'
import { GLOW, INK, pawEmblem, type PropRecipe, WHITE } from './kit'

const PLY = 0xdcbd8c
const PAINT = 0x5a4a8e
const PAINT_DARK = 0x3e3268
const VEIN_C = 0xb79aff
const EYE_C = 0xffa040
const POST = 0x8a5a3a
const RED = 0xe0574a

const BOARD_Y = 1.2
const HINGE_Y = 0.86

function standSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(capsule([0, 0.05, -0.1], [0, HINGE_Y + 0.02, -0.1], 0.065), { color: POST })
  for (const a of [Math.PI / 4, -Math.PI / 4])
    s.add(box([0, 0.06, -0.1], [0.5, 0.06, 0.07], 0.03, [0, a, 0]), { color: POST, k: 0.03 })
  // Hinge bracket and a sandbag on a foot.
  s.add(capsule([-0.2, HINGE_Y, -0.06], [0.2, HINGE_Y, -0.06], 0.045), { color: 0x6a6f78, k: 0.02 })
  s.add(ellipsoid([0.3, 0.15, 0.2], [0.18, 0.1, 0.13], [0, 0.6, 0]), { color: 0xcdb184, k: 0.03 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  s.paint(torus([0, 0.5, -0.1], 0.066, 0.02), { color: RED, union: [torus([0, 0.62, -0.1], 0.066, 0.02)] })
  return s
}

function boardSculpt(): Sculpt {
  const s = new Sculpt()
  const T = 0.045
  // Body and head (front view of a round crawler), six legs in the board plane, mandibles.
  s.add(scaled(sphere([0, BOARD_Y, 0], 0.46), [1.12, 0.86, T / 0.46]), { color: PLY })
  s.add(scaled(sphere([0, BOARD_Y + 0.38, 0], 0.26), [1.1, 0.8, T / 0.26]), { color: PLY, k: 0.08 })
  s.mirror((side) => {
    for (const [y, dy] of [
      [0.16, 0.18],
      [0.0, 0.0],
      [-0.16, -0.2]
    ]) {
      const a: [number, number, number] = [0.42 * side, BOARD_Y + y, 0]
      const b: [number, number, number] = [0.66 * side, BOARD_Y + y + 0.08 + dy * 0.3, 0]
      const c: [number, number, number] = [0.74 * side, BOARD_Y + y - 0.14 + dy * 0.6, 0]
      s.add(scaled(capsule(a, b, 0.05), [1, 1, T / 0.05]), { color: PLY, k: 0.03 })
      s.add(scaled(capsule(b, c, 0.04), [1, 1, T / 0.04]), { color: PLY, k: 0.02 })
    }
    s.add(
      scaled(cone([0.08 * side, BOARD_Y + 0.2, 0], [0.04 * side, BOARD_Y + 0.08, 0], 0.05, 0.015), [1, 1, T / 0.05]),
      {
        color: PLY,
        k: 0.02
      }
    )
    // Little antennae.
    s.add(
      scaled(capsule([0.1 * side, BOARD_Y + 0.56, 0], [0.22 * side, BOARD_Y + 0.74, 0], 0.035), [1, 1, T / 0.035]),
      {
        color: PLY,
        k: 0.02
      }
    )
    s.add(scaled(sphere([0.23 * side, BOARD_Y + 0.76, 0], 0.055), [1, 1, T / 0.055]), { color: PLY, k: 0.02 })
  })
  s.add(box([0, HINGE_Y + 0.05, 0], [0.08, 0.07, 0.03], 0.02), { color: 0x6a6f78, k: 0.02 })
  // Painted faces (both sides): body colour, veins, bullseye belly, big cartoon eyes.
  s.paint(box([0, BOARD_Y, T], [1.0, 1.0, 0.016], 0), {
    color: PAINT,
    union: [box([0, BOARD_Y, -T], [1.0, 1.0, 0.016], 0)]
  })
  s.paint(scaled(sphere([0, BOARD_Y, 0], 0.4), [1.12, 0.86, 1]), { color: PAINT_DARK })
  s.paint(scaled(sphere([0, BOARD_Y - 0.05, 0], 0.27), [1, 1, 1]), { color: WHITE })
  s.paint(scaled(sphere([0, BOARD_Y - 0.05, 0], 0.2), [1, 1, 1]), { color: RED })
  s.paint(scaled(sphere([0, BOARD_Y - 0.05, 0], 0.12), [1, 1, 1]), { color: WHITE })
  s.paint(scaled(sphere([0, BOARD_Y - 0.05, 0], 0.07), [1, 1, 1]), { color: RED })
  s.mirror((side) => {
    s.paint(sphere([0.11 * side, BOARD_Y + 0.42, 0], 0.085), { color: EYE_C, mask: GLOW })
    s.paint(sphere([0.09 * side, BOARD_Y + 0.45, 0], 0.03), { color: WHITE })
    s.paint(capsule([0.26 * side, BOARD_Y + 0.22, 0], [0.4 * side, BOARD_Y - 0.12, 0], 0.022), { color: VEIN_C })
  })
  s.paint(scaled(arc([0, BOARD_Y + 0.38, 0], 0.07, 0.014, 0.9, [Math.PI / 2, 0, 0]), [1, 6, 1]), { color: INK })
  return s
}

export function targetRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'stand', sculpt: standSculpt(), cell: 0.043, tris: 900 },
      { name: 'board', sculpt: boardSculpt(), cell: 0.033, tris: 2600, pivot: [0, HINGE_Y, 0] }
    ],
    look: { glowColor: 0xffa040, glow: 1.3, glow2Color: 0xffffff, outline: 0.008 },
    animate(c) {
      const time = c.clock
      const board = c.parts.board
      const moving = c.state >= 0.5
      const wob = moving ? 0.1 : 0.025
      board.rotation.z = wob * Math.sin(time * (moving ? 5.2 : 1.6))
      board.rotation.x = (moving ? 0.06 : 0.02) * Math.sin(time * (moving ? 3.7 : 1.1) + 0.5)
      board.position.y = HINGE_Y + (moving ? 0.03 * Math.abs(Math.sin(time * 5.2)) : 0)
      c.u.uGlow.value = 1.2 + 0.4 * Math.max(0, Math.sin(time * 3))
    }
  }
}

// ------------------------------------------------------------------------------------------- tutorial beacon

const LAMP_Y = 1.18

/** A wooden post on a stone foot with a paper lantern (lit panes, a little roof) on top. */
function beaconSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, 0.07, 0], 0.3, 0.07, 0.04), { color: 0xbdb3a3 })
  s.add(capsule([0, 0.1, 0], [0, 1.0, 0], 0.075), { color: 0x9a6a44, k: 0.04 })
  // A round paper lantern (chōchin) with dark caps.
  s.add(ellipsoid([0, LAMP_Y, 0], [0.19, 0.22, 0.19]), { color: 0xfff1d6, k: 0.02 })
  s.add(cylinder([0, LAMP_Y - 0.21, 0], 0.11, 0.035, 0.015), { color: INK, k: 0.015 })
  s.add(cylinder([0, LAMP_Y + 0.21, 0], 0.11, 0.035, 0.015), { color: INK, k: 0.015 })
  s.add(sphere([0, LAMP_Y + 0.27, 0], 0.045), { color: 0xffc861, k: 0.01 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  s.paint(cylinder([0, 0.62, 0], 0.09, 0.05, 0), { color: 0xfff1d6 })
  s.paint(ellipsoid([0, LAMP_Y, 0], [0.22, 0.17, 0.22]), { color: 0xffe6b0, mask: GLOW })
  s.paint(torus([0, LAMP_Y + 0.12, 0], 0.16, 0.014), {
    color: 0xe0574a,
    union: [torus([0, LAMP_Y - 0.12, 0], 0.16, 0.014)]
  })
  pawEmblem(s, [0, LAMP_Y - 0.01, 0.19], 0.16, 0xff7a1a, undefined, 0.05)
  return s
}

/** A floating halo ring with four beads (drawn bright, no outline). */
function haloSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(torus([0, LAMP_Y, 0], 0.42, 0.055), { color: WHITE })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    s.add(sphere([Math.cos(a) * 0.42, LAMP_Y, Math.sin(a) * 0.42], 0.085), { color: WHITE, k: 0.02 })
  }
  s.paint(sphere([0, LAMP_Y, 0], 0.6), { color: WHITE, mask: GLOW })
  return s
}

export function tutorialRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'post', sculpt: beaconSculpt(), cell: 0.042, tris: 1100 },
      { name: 'halo', sculpt: haloSculpt(), cell: 0.038, tris: 800, mat: 'glow', set: 1, pivot: [0, LAMP_Y, 0] }
    ],
    look: { glowColor: 0xffc070, glow: 1.6, glow2Color: 0xffffff, lampColor: 0x7af0c0, lamp: 2.2, outline: 0.007 },
    extras: [
      {
        name: 'ring',
        make() {
          const geometry = new THREE.RingGeometry(0.9, 1.15, 48, 1).rotateX(-Math.PI / 2).translate(0, 0.03, 0)
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x7af0c0).multiplyScalar(0.9),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          })
          const mesh = new THREE.Mesh(geometry, material)
          mesh.renderOrder = 5
          return {
            object: mesh,
            dispose: () => {
              geometry.dispose()
              material.dispose()
            }
          }
        }
      }
    ],
    animate(c) {
      const time = c.clock
      const halo = c.parts.halo
      halo.position.y = LAMP_Y + 0.08 * Math.sin(time * 2)
      halo.rotation.set(0.35 * Math.sin(time * 0.8), time * 1.6, 0.2, 'YXZ')
      const p = 0.5 + 0.5 * Math.sin(time * 3)
      c.u2.uGlow.value = 1.8 + p * 1.2
      c.u.uGlow.value = 1.4 + p * 0.6
      const ring = c.extra.ring as THREE.Mesh
      const k = (time * 0.6) % 1
      ring.scale.setScalar(0.7 + k * 0.5)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 1 - k
    }
  }
}
