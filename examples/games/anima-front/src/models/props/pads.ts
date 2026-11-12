/**
 * Launch pads: the カエルパッド deployable (a plump frog on a lily pad, the big version of the antique) and the
 * fixed map pad (a mossy stone frog plinth with a bronze spring plate). Both point their launch chevrons to +Z.
 */
import { arc, box, capsule, cylinder, ellipsoid, plane, scaled, Sculpt, sphere, torus } from '../sdf/sculpt'
import { beadEyes, expiry, GLOW, popIn, type PropRecipe, WHITE } from './kit'

const FROG = 0x6fcf4a
const FROG_DARK = 0x5bb83c
const BELLY = 0xeaf7c8
const LILY = 0x58a447
const LILY_LIGHT = 0x8fd46a
/** Top of the lily pad (the frog sits on it). */
const LILY_TOP = 0.095

/** Frog body sitting at the origin facing +Z (≈ 0.55 m tall so animals step onto its back). */
function frogSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid([0, 0.27, -0.03], [0.36, 0.25, 0.33]), { color: FROG })
  s.add(ellipsoid([0, 0.34, 0.15], [0.3, 0.2, 0.23]), { color: FROG, k: 0.12 })
  s.mirror((side) => {
    s.add(sphere([0.15 * side, 0.49, 0.19], 0.105), { color: FROG, k: 0.07 })
    // Haunches, feet and front legs.
    s.add(ellipsoid([0.3 * side, 0.15, -0.1], [0.14, 0.13, 0.22]), { color: FROG_DARK, k: 0.07 })
    s.add(ellipsoid([0.34 * side, 0.035, 0.1], [0.11, 0.035, 0.13]), { color: FROG_DARK, k: 0.04 })
    s.add(capsule([0.17 * side, 0.2, 0.24], [0.21 * side, 0.05, 0.32], 0.05), { color: FROG_DARK, k: 0.05 })
    s.add(ellipsoid([0.22 * side, 0.03, 0.36], [0.075, 0.03, 0.065]), { color: FROG_DARK, k: 0.03 })
  })
  s.sub(plane([0, 0.005, 0], [0, 1, 0]), { k: 0.01 })
  beadEyes(s, [0, 0.505, 0.255], 0.15, 0.058)
  s.paint(ellipsoid([0, 0.2, 0.26], [0.26, 0.17, 0.16]), { color: BELLY })
  s.paint(scaled(arc([0, 0.4, 0.35], 0.11, 0.014, 0.95, [Math.PI / 2, 0, 0]), [1, 5, 1]), { color: 0x2d4a24 })
  s.mirror((side) => s.paint(sphere([0.24 * side, 0.33, 0.3], 0.05), { color: 0xff9aa8, alpha: 0.55 }))
  // The glowing launch spot on its back.
  s.paint(scaled(sphere([0, 0.52, -0.05], 0.2), [1, 0.4, 1]), { color: 0xd8ffb0, mask: GLOW })
  s.paint(torus([0, 0.505, -0.05], 0.2, 0.02), { color: WHITE, mask: GLOW })
  return s
}

/** A lily pad with a notch at the back, raised rim, light veins and a glowing launch ring. */
function lilySculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, 0.05, 0], 0.88, 0.05, 0.04), { color: LILY })
  s.add(torus([0, 0.085, 0], 0.84, 0.045), { color: LILY, k: 0.05 })
  s.sub(box([0, 0.05, -0.9], [0.17, 0.2, 0.17], 0.01, [0, Math.PI / 4, 0]), { k: 0.03 })
  for (let i = 0; i < 9; i++) {
    const a = Math.PI / 2 + ((i + 0.5) / 9) * Math.PI * 2 * 0.86 - Math.PI * 0.86
    s.paint(capsule([0, 0.1, 0], [Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8], 0.024), { color: LILY_LIGHT })
  }
  s.paint(torus([0, 0.1, 0], 0.66, 0.035), { color: WHITE, mask: GLOW })
  // Chevrons pointing the launch direction.
  for (const z of [0.42, 0.56])
    s.mirror((side) =>
      s.paint(box([0.06 * side, 0.1, z], [0.09, 0.05, 0.026], 0.01, [0, 0.8 * side, 0]), { color: WHITE, mask: GLOW })
    )
  return s
}

export function frogRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'lily', sculpt: lilySculpt(), cell: 0.06, tris: 1300 },
      { name: 'frog', sculpt: frogSculpt(), cell: 0.032, tris: 2400 }
    ],
    look: { glowColor: 0x9cff5a, glow: 1.3, glow2Color: 0xffffff, outline: 0.008 },
    animate(c) {
      const frog = c.parts.frog
      const time = c.t
      // Every 4.5 s it crouches and springs as if launching (a launch itself is not visible in the view).
      const cyc = (time + 1.3) % 4.5
      let sy = 1 + 0.035 * Math.sin(time * 2.4)
      if (cyc < 0.35) sy -= 0.18 * Math.sin((cyc / 0.35) * Math.PI * 0.5)
      else if (cyc < 0.75) {
        const x = (cyc - 0.35) / 0.4
        sy += -0.18 * Math.cos(x * Math.PI * 0.5) + 0.2 * Math.sin(x * Math.PI) * Math.exp(-x * 1.5)
      }
      frog.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
      frog.position.y = LILY_TOP
      const end = expiry(c.life, time)
      const s = popIn(time) * end.scale
      c.body.scale.setScalar(Math.max(s, 1e-3))
      c.u.uGlow.value = 1.15 + 0.35 * Math.sin(time * 3.2) + end.blink * 2
      c.u.uFlash.value = end.blink * 0.6
    }
  }
}

// --------------------------------------------------------------------------------------------- fixed map pad

const STONE = 0xbdb3a3
const STONE_DARK = 0x8f8578
const MOSS = 0x7fae4a
const BRONZE = 0xc8923e
/** Verdigris of the old bronze plate. */
const PATINA = 0x5f9c8a

function plinthSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, 0.13, 0], 1.0, 0.13, 0.07), { color: STONE })
  s.add(cylinder([0, 0.05, 0], 1.12, 0.05, 0.04), { color: STONE_DARK, k: 0.03 })
  // A carved frog head at the front edge looking along the launch direction.
  s.add(ellipsoid([0, 0.28, 0.9], [0.44, 0.22, 0.24]), { color: STONE, k: 0.08 })
  s.mirror((side) => s.add(sphere([0.22 * side, 0.45, 0.92], 0.12), { color: STONE, k: 0.06 }))
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  s.mirror((side) => {
    s.add(sphere([0.22 * side, 0.47, 1.0], 0.07), { color: 0x2f4a3a, k: 0.015 })
    s.paint(sphere([0.22 * side, 0.48, 1.07], 0.035), { color: 0xd8ffb0, mask: GLOW })
  })
  s.paint(scaled(arc([0, 0.36, 1.05], 0.16, 0.016, 1.0, [Math.PI / 2, 0, 0]), [1, 5, 1]), { color: STONE_DARK })
  // Moss and weathering.
  for (const [a, y, r] of [
    [0.6, 0.12, 0.22],
    [2.3, 0.08, 0.3],
    [3.6, 0.15, 0.18],
    [4.9, 0.1, 0.26]
  ])
    s.paint(ellipsoid([Math.cos(a) * 1.05, y, Math.sin(a) * 1.05], [r, r * 0.6, r]), { color: MOSS })
  s.paint(ellipsoid([0.3, 0.42, 0.95], [0.16, 0.08, 0.2]), { color: MOSS })
  s.paint(torus([0, 0.26, 0], 0.93, 0.03), { color: BRONZE })
  return s
}

function plateSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, 0.29, 0], 0.8, 0.05, 0.035), { color: PATINA })
  s.add(torus([0, 0.33, 0], 0.77, 0.05), { color: BRONZE, k: 0.03 })
  s.paint(torus([0, 0.34, 0], 0.6, 0.035), { color: WHITE, mask: GLOW })
  for (const z of [-0.12, 0.08, 0.28])
    s.mirror((side) =>
      s.paint(box([0.085 * side, 0.34, z], [0.13, 0.05, 0.035], 0.012, [0, 0.8 * side, 0]), {
        color: WHITE,
        mask: GLOW
      })
    )
  // Rivets.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    s.add(sphere([Math.cos(a) * 0.68, 0.34, Math.sin(a) * 0.68], 0.06), { color: BRONZE, k: 0.015 })
  }
  return s
}

export function padRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'plinth', sculpt: plinthSculpt(), cell: 0.06, tris: 2600 },
      { name: 'plate', sculpt: plateSculpt(), cell: 0.056, tris: 1300, pivot: [0, 0.29, 0] }
    ],
    look: { glowColor: 0x9cff5a, glow: 1.4, glow2Color: 0xffffff, outline: 0.009 },
    animate(c) {
      const time = c.clock
      const cyc = time % 3.2
      // A gentle spring bob and a periodic boing.
      let y = 0.012 * Math.sin(time * 2.1)
      if (cyc < 0.6)
        y +=
          -0.05 * Math.sin((cyc / 0.6) * Math.PI) * Math.exp(-cyc * 2) +
          0.03 * Math.sin((cyc / 0.6) * Math.PI * 2) * (cyc > 0.3 ? 1 : 0)
      c.parts.plate.position.y = 0.29 + y
      c.u.uGlow.value = 1.2 + 0.4 * Math.max(0, Math.sin(time * 2.6))
    }
  }
}
