/**
 * Ranged antiques. Guns hold the animal's face towards the shooter (the camera sees it over the shoulder) and
 * shoot from the other end; the hippo shoots from its mouth.
 */
import { capsule, cone, cylinder, ellipsoid, plane, scaled, Sculpt, slab, sphere, torus } from '../sdf/sculpt'
import type { ItemRecipe } from './item'
import { beadEyes, GLOW, GLOW2, grip, INK, WHITE } from './kit'

const BACK: [number, number, number] = [0, 0, -1]

/** ミツバチ: a round striped bee; its face looks back at the shooter, the stinger is the muzzle. */
export function bee(): ItemRecipe {
  const s = new Sculpt()
  const YEL = 0xffd23f
  grip(s, 0x4a3a2a)
  s.add(ellipsoid([0, 0.06, 0.07], [0.052, 0.05, 0.072]), { color: YEL, k: 0.02 })
  s.add(sphere([0, 0.065, -0.005], 0.042), { color: 0x3a2c2a, k: 0.02 })
  s.add(cone([0, 0.06, 0.13], [0, 0.058, 0.18], 0.018, 0.005), { color: 0x3a2c2a, k: 0.01 })
  for (const z of [0.05, 0.09]) s.paint(slab([0, 0, z], [0, 0, 1], 0.011), { color: 0x2d2424 })
  s.paint(slab([0, 0, 0.128], [0, 0, 1], 0.004), { color: WHITE, mask: GLOW })
  // Wings and antennae.
  for (const side of [1, -1]) {
    s.add(ellipsoid([0.035 * side, 0.115, 0.05], [0.032, 0.008, 0.045], [0, 0, -0.5 * side]), {
      color: 0xe8f6ff,
      k: 0.008
    })
    s.paint(ellipsoid([0.035 * side, 0.115, 0.05], [0.026, 0.02, 0.035], [0, 0, -0.5 * side]), {
      color: WHITE,
      mask: GLOW,
      alpha: 0.6
    })
    s.add(capsule([0.015 * side, 0.1, -0.015], [0.03 * side, 0.125, -0.035], 0.0035), { color: 0x2d2424, k: 0.004 })
    s.add(sphere([0.03 * side, 0.125, -0.035], 0.008), { color: 0x2d2424, k: 0.004 })
  }
  beadEyes(s, [0, 0.07, -0.035], 0.02, 0.011, BACK)
  s.paint(ellipsoid([0, 0.05, -0.042], [0.012, 0.006, 0.006]), { color: 0xff9aae })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.058, 0.185], cell: 0.004, tris: 2200 }
}

/** キツツキ: a black-and-white woodpecker with a red crest; the long beak is the barrel. */
export function wood(): ItemRecipe {
  const s = new Sculpt()
  grip(s, 0x3a3030)
  s.add(ellipsoid([0, 0.055, 0.06], [0.045, 0.05, 0.12]), { color: 0x2e2a30, k: 0.02 })
  s.add(sphere([0, 0.07, 0.19], 0.045), { color: 0x2e2a30, k: 0.03 })
  s.add(cone([0, 0.065, 0.22], [0, 0.06, 0.42], 0.018, 0.008), { color: 0xd8d2c4, k: 0.01 })
  s.add(scaled(cone([0, 0.1, 0.17], [0, 0.13, 0.12], 0.03, 0.012, [1, 0, 0]), [1, 1, 0.5]), {
    color: 0xe23c3c,
    k: 0.012
  })
  // Tail feathers as the stock.
  s.add(scaled(cone([0, 0.04, -0.04], [0, 0.0, -0.16], 0.04, 0.03, [1, 0, 0]), [1, 1, 0.35]), {
    color: 0x2e2a30,
    k: 0.02
  })
  s.paint(ellipsoid([0, 0.02, 0.07], [0.05, 0.035, 0.1]), { color: 0xf3efe8 })
  s.paint(ellipsoid([0, 0.07, 0.205], [0.05, 0.02, 0.025]), { color: 0xf3efe8 })
  s.paint(sphere([0, 0.11, 0.18], 0.03), { color: 0xe23c3c })
  for (const side of [1, -1]) {
    s.paint(sphere([0.04 * side, 0.08, 0.2], 0.009), { color: INK })
    s.paint(sphere([0.043 * side, 0.084, 0.204], 0.003), { color: WHITE })
  }
  for (const z of [0.28, 0.34, 0.39])
    s.paint(slab([0, 0, z], [0, 0, 1], 0.003), { color: WHITE, mask: GLOW, within: sphere([0, 0.063, z], 0.025) })
  s.paint(slab([0.045, 0, 0], [1, 0, 0], 0.004), {
    color: WHITE,
    mask: GLOW,
    within: ellipsoid([0, 0.06, 0.06], [0.06, 0.03, 0.1])
  })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.06, 0.43], cell: 0.0045, tris: 2400 }
}

/** ハチドリ: a tiny iridescent hummingbird SMG; buzzing wings are a separate part. */
export function humming(): ItemRecipe {
  const s = new Sculpt()
  const TEAL = 0x22a39a
  grip(s, 0x2b3a44)
  s.add(ellipsoid([0, 0.055, 0.05], [0.04, 0.044, 0.08]), { color: TEAL, k: 0.02 })
  s.add(sphere([0, 0.07, 0.13], 0.034), { color: TEAL, k: 0.025 })
  s.add(cone([0, 0.068, 0.15], [0, 0.066, 0.29], 0.009, 0.004), { color: 0x2b2b33, k: 0.006 })
  s.add(scaled(cone([0, 0.05, -0.02], [0, 0.03, -0.1], 0.03, 0.025, [1, 0, 0]), [1, 1, 0.3]), {
    color: 0x1d6f6a,
    k: 0.015
  })
  s.paint(ellipsoid([0, 0.045, 0.13], [0.03, 0.022, 0.03]), { color: 0xff4f9a, mask: GLOW })
  for (const side of [1, -1]) {
    s.paint(sphere([0.03 * side, 0.08, 0.14], 0.008), { color: INK })
    s.paint(sphere([0.033 * side, 0.084, 0.143], 0.0028), { color: WHITE })
  }
  const wings = new Sculpt()
  for (const side of [1, -1])
    wings.add(ellipsoid([0.06 * side, 0.08, 0.04], [0.05, 0.006, 0.022], [0, -0.3 * side, 0.4 * side]), {
      color: 0xbff4ef,
      mask: GLOW2
    })
  return {
    parts: [
      { name: 'body', sculpt: s },
      { name: 'wings', sculpt: wings, pivot: [0, 0.075, 0.04] }
    ],
    muzzle: [0, 0.066, 0.3],
    cell: 0.0042,
    tris: 2200,
    animate(parts, st, glow2) {
      const buzz = Math.sin(st.t * (40 + 50 * st.active))
      parts.wings.rotation.z = buzz * (0.25 + 0.35 * st.active)
      glow2(0.3 + 0.7 * st.active)
    }
  }
}

/** フグ: a round spiky pufferfish; its mouth is the shotgun muzzle and it puffs up on every shot. */
export function puffer(): ItemRecipe {
  const s = new Sculpt()
  const SKIN = 0xffd76a
  s.add(sphere([0, 0.06, 0.07], 0.07), { color: SKIN })
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996
    const y = 1 - (i + 0.5) / 7
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const d: [number, number, number] = [Math.cos(a) * r, y, Math.sin(a) * r]
    if (d[2] > 0.75) continue
    const p: [number, number, number] = [d[0] * 0.066, 0.06 + d[1] * 0.066, 0.07 + d[2] * 0.066]
    s.add(cone(p, [p[0] + d[0] * 0.022, p[1] + d[1] * 0.022, p[2] + d[2] * 0.022], 0.008, 0.002), {
      color: 0xf3c24c,
      k: 0.006
    })
  }
  // Mouth ring (muzzle), fins, tail.
  s.add(torus([0, 0.055, 0.14], 0.018, 0.009, [Math.PI / 2, 0, 0]), { color: 0xf4a06a, k: 0.01 })
  s.sub(sphere([0, 0.055, 0.155], 0.014), { k: 0.004, color: 0x5a2a30 })
  for (const side of [1, -1])
    s.add(scaled(sphere([0.07 * side, 0.05, 0.08], 0.022), [0.4, 1, 1]), { color: 0xf7b955, k: 0.01 })
  s.add(scaled(cone([0, 0.06, 0.0], [0, 0.06, -0.06], 0.02, 0.035, [1, 0, 0]), [1, 1, 0.3]), {
    color: 0xf7b955,
    k: 0.015
  })
  s.paint(plane([0, 0.04, 0], [0, 1, 0]), { color: 0xfff6e2, within: sphere([0, 0.06, 0.07], 0.08) })
  for (const [x, y, z] of [
    [0.03, 0.11, 0.05],
    [-0.035, 0.1, 0.08],
    [0.0, 0.12, 0.09],
    [0.05, 0.09, 0.03],
    [-0.05, 0.09, 0.03]
  ])
    s.paint(sphere([x, y, z], 0.011), { color: 0xc98a3a })
  beadEyes(s, [0, 0.085, 0.115], 0.042, 0.012, [0.5, 0, 0.8])
  s.paint(torus([0, 0.055, 0.15], 0.018, 0.004, [Math.PI / 2, 0, 0]), { color: WHITE, mask: GLOW })
  const handle = new Sculpt()
  grip(handle, 0x6a4a3a)
  return {
    parts: [
      { name: 'handle', sculpt: handle },
      { name: 'body', sculpt: s, pivot: [0, 0.06, 0.07] }
    ],
    muzzle: [0, 0.055, 0.16],
    cell: 0.0045,
    tris: 2600,
    animate(parts, st) {
      const puff = Math.exp(-st.sinceFire * 7) * (st.act === 'fire' || st.sinceFire < 0.5 ? 1 : 0)
      parts.body.scale.setScalar(1 + 0.22 * puff)
    }
  }
}

/** フクロウアイ: a long lavender rifle; a round owl head is the scope, its eyes glow while zoomed. */
export function owl(): ItemRecipe {
  const s = new Sculpt()
  const LAV = 0xa794d6
  grip(s, 0x4a3f5f)
  s.add(capsule([0, 0.035, -0.02], [0, 0.035, 0.52], 0.02), { color: 0x6f5fa0 })
  s.add(cylinder([0, 0.035, 0.52], 0.026, 0.014, 0.006, [Math.PI / 2, 0, 0]), { color: 0x4a3f5f, k: 0.006 })
  s.add(scaled(cone([0, 0.03, 0.02], [0, 0.0, -0.17], 0.05, 0.04, [1, 0, 0]), [1, 1, 0.45]), { color: LAV, k: 0.02 })
  // Owl head scope on top, its face towards the shooter.
  s.add(ellipsoid([0, 0.115, 0.06], [0.068, 0.06, 0.058]), { color: LAV, k: 0.02 })
  for (const side of [1, -1])
    s.add(scaled(cone([0.04 * side, 0.155, 0.06], [0.062 * side, 0.205, 0.06], 0.02, 0.005, [0, 0, 1]), [1, 1, 0.45]), {
      color: 0x8a76c2,
      k: 0.01
    })
  s.paint(ellipsoid([0, 0.112, 0.01], [0.064, 0.05, 0.03]), { color: 0xefe9ff })
  for (const side of [1, -1]) {
    s.paint(sphere([0.027 * side, 0.118, 0.005], 0.021), { color: 0xffc94a, mask: GLOW2 })
    s.paint(sphere([0.027 * side, 0.118, 0.0], 0.009), { color: INK })
    s.paint(sphere([0.022 * side, 0.124, -0.004], 0.0035), { color: WHITE })
  }
  s.add(cone([0, 0.104, 0.008], [0, 0.09, 0.0], 0.008, 0.002), { color: 0xe6b24e, k: 0.003 })
  s.add(cylinder([0, 0.115, 0.125], 0.022, 0.012, 0.004, [Math.PI / 2, 0, 0]), { color: 0x4a3f5f, k: 0.008 })
  s.paint(sphere([0, 0.115, 0.14], 0.017), { color: 0xbfe8ff, mask: GLOW2 })
  for (const z of [0.2, 0.31, 0.42])
    s.paint(slab([0, 0, z], [0, 0, 1], 0.004), { color: WHITE, mask: GLOW, within: sphere([0, 0.035, z], 0.03) })
  return {
    parts: [{ name: 'body', sculpt: s }],
    muzzle: [0, 0.035, 0.54],
    cell: 0.0045,
    tris: 2700,
    glow2: 0xffd27a,
    animate(_parts, st, glow2) {
      glow2(st.act === 'charge' ? 0.6 + 2.2 * st.charge : 0.15)
    }
  }
}

/** ツバメ: a navy launcher with a swallow's swept wings (they fold while locking) and a forked tail. */
export function swallow(): ItemRecipe {
  const s = new Sculpt()
  const NAVY = 0x3a4a9a
  grip(s, 0x2d3566)
  s.add(capsule([0, 0.06, -0.06], [0, 0.06, 0.26], 0.045), { color: NAVY })
  s.add(sphere([0, 0.07, 0.27], 0.045), { color: NAVY, k: 0.03 })
  s.sub(cylinder([0, 0.06, 0.32], 0.026, 0.03, 0.006, [Math.PI / 2, 0, 0]), { k: 0.006, color: 0x1d2244 })
  s.paint(ellipsoid([0, 0.04, 0.27], [0.04, 0.03, 0.045]), { color: 0xfff6ee })
  s.paint(ellipsoid([0, 0.07, 0.31], [0.03, 0.018, 0.02]), { color: 0xe2453c })
  for (const side of [1, -1]) {
    s.paint(sphere([0.036 * side, 0.09, 0.285], 0.008), { color: INK })
    s.paint(sphere([0.038 * side, 0.094, 0.288], 0.003), { color: WHITE })
    s.add(scaled(cone([0.02 * side, 0.06, -0.06], [0.06 * side, 0.05, -0.16], 0.022, 0.006, [0, 1, 0]), [1, 1, 0.35]), {
      color: NAVY,
      k: 0.012
    })
  }
  s.paint(torus([0, 0.06, 0.305], 0.03, 0.004, [Math.PI / 2, 0, 0]), { color: WHITE, mask: GLOW })
  s.paint(slab([0, 0.105, 0], [0, 1, 0], 0.004), {
    color: WHITE,
    mask: GLOW,
    within: capsule([0, 0.06, -0.04], [0, 0.06, 0.22], 0.06)
  })
  const wings: { name: string; sculpt: Sculpt; pivot: [number, number, number] }[] = []
  for (const side of [1, -1]) {
    const w = new Sculpt()
    w.add(scaled(cone([0.03 * side, 0.08, 0.12], [0.2 * side, 0.08, -0.06], 0.04, 0.008, [0, 1, 0]), [1, 1, 0.22]), {
      color: NAVY
    })
    w.paint(slab([0, 0.08, 0], [0, 1, 0], 0.004), {
      color: WHITE,
      mask: GLOW2,
      within: sphere([0.11 * side, 0.08, 0.03], 0.12)
    })
    wings.push({ name: side > 0 ? 'wingL' : 'wingR', sculpt: w, pivot: [0.03 * side, 0.08, 0.12] })
  }
  return {
    parts: [{ name: 'body', sculpt: s }, ...wings],
    muzzle: [0, 0.06, 0.33],
    cell: 0.005,
    tris: 2600,
    animate(parts, st, glow2) {
      const fold = st.act === 'charge' ? st.charge : 0
      parts.wingL.rotation.y = -0.9 * fold
      parts.wingR.rotation.y = 0.9 * fold
      glow2(fold * 1.5)
    }
  }
}

/** ダンゴムシ: a segmented pill bug launcher with a curled-up pill bug loaded at the muzzle. */
export function pillbug(): ItemRecipe {
  const s = new Sculpt()
  const GREY = 0x8a7a72
  grip(s, 0x4e4038)
  s.add(capsule([0, 0.06, -0.06], [0, 0.06, 0.2], 0.05), { color: GREY })
  for (let i = 0; i < 6; i++) {
    const z = -0.05 + i * 0.048
    s.emboss(slab([0, 0, z], [0, 0, 1], 0.019), {
      amount: 0.006,
      soft: 0.005,
      within: capsule([0, 0.06, -0.06], [0, 0.06, 0.2], 0.07)
    })
    s.paint(slab([0, 0, z + 0.024], [0, 0, 1], 0.003), {
      color: WHITE,
      mask: GLOW,
      within: ellipsoid([0, 0.07, 0.07], [0.06, 0.06, 0.2])
    })
  }
  s.paint(plane([0, 0.03, 0], [0, 1, 0]), { color: 0xc8b8a8, within: capsule([0, 0.06, -0.06], [0, 0.06, 0.2], 0.07) })
  s.sub(sphere([0, 0.06, 0.255], 0.04), { k: 0.008, color: 0x3a2e2a })
  // The ammo: a curled pill bug ball.
  s.add(sphere([0, 0.06, 0.24], 0.032), { color: 0x6f625b, k: 0.004 })
  for (const z of [0.225, 0.24, 0.255])
    s.paint(slab([0, 0, z], [0, 0, 1], 0.0025), { color: 0x4a403a, within: sphere([0, 0.06, 0.24], 0.04) })
  for (const side of [1, -1]) {
    s.add(capsule([0.03 * side, 0.1, 0.19], [0.06 * side, 0.14, 0.25], 0.004), { color: 0x4e4038, k: 0.004 })
    for (const z of [0.0, 0.06, 0.12])
      s.add(capsule([0.045 * side, 0.02, z], [0.06 * side, -0.005, z + 0.01], 0.006), { color: 0x6b5d55, k: 0.006 })
  }
  beadEyes(s, [0, 0.085, -0.095], 0.022, 0.01, BACK)
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.06, 0.27], cell: 0.005, tris: 2600 }
}

/** デンキウナギ: an eel coiled around a rod; its open mouth emits the beam and its spots crackle. */
export function eel(): ItemRecipe {
  const s = new Sculpt()
  const EEL = 0x2f5b64
  grip(s, 0x23343a)
  s.add(capsule([0, 0.05, -0.08], [0, 0.05, 0.24], 0.024), { color: 0x3b4a50 })
  // Coil: a chain of spheres spiralling around the rod.
  const n = 26
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const a = t * Math.PI * 5
    const z = -0.06 + t * 0.28
    const r = 0.038
    s.add(sphere([Math.cos(a) * r, 0.05 + Math.sin(a) * r, z], 0.02 - t * 0.004), { color: EEL, k: 0.02 })
  }
  // Head at the front, mouth open (emitter).
  s.add(ellipsoid([0, 0.05, 0.27], [0.032, 0.03, 0.05]), { color: EEL, k: 0.02 })
  s.sub(sphere([0, 0.05, 0.32], 0.017), { k: 0.004, color: 0xb8fbff })
  s.paint(sphere([0, 0.05, 0.31], 0.02), { color: 0xd8feff, mask: GLOW2 })
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10
    const a = t * Math.PI * 5
    s.paint(sphere([Math.cos(a) * 0.052, 0.05 + Math.sin(a) * 0.052, -0.06 + t * 0.28], 0.008), {
      color: 0xfff27a,
      mask: GLOW2
    })
  }
  for (const side of [1, -1]) {
    s.paint(sphere([0.028 * side, 0.068, 0.285], 0.007), { color: INK })
    s.paint(sphere([0.03 * side, 0.071, 0.288], 0.0026), { color: WHITE })
  }
  s.paint(plane([0, 0.04, 0], [0, 1, 0]), { color: 0xe7d38a, within: ellipsoid([0, 0.05, 0.27], [0.04, 0.04, 0.06]) })
  return {
    parts: [{ name: 'body', sculpt: s }],
    muzzle: [0, 0.05, 0.33],
    cell: 0.0045,
    tris: 2700,
    glow2: 0xfff27a,
    animate(_parts, st, glow2) {
      const crackle = st.act === 'beam' ? 1.2 + Math.max(0, Math.sin(st.t * 53) * Math.sin(st.t * 31)) * 2.5 : 0.25
      glow2(crackle)
    }
  }
}

/** カバキャノン: a big hippo head; the jaw opens while charging and the mouth glows. */
export function hippo(): ItemRecipe {
  const s = new Sculpt()
  const SKIN = 0xb98ac6
  grip(s, 0x5a3f66, 0.08, 0.024)
  s.add(ellipsoid([0, 0.1, 0.06], [0.1, 0.085, 0.12]), { color: SKIN })
  s.add(ellipsoid([0, 0.11, 0.19], [0.105, 0.065, 0.075]), { color: SKIN, k: 0.04 })
  for (const side of [1, -1]) {
    s.add(sphere([0.04 * side, 0.165, 0.23], 0.022), { color: SKIN, k: 0.02 })
    s.paint(scaled(sphere([0.04 * side, 0.183, 0.24], 0.008), [1, 0.6, 1]), { color: 0x6a3e74 })
    s.add(sphere([0.055 * side, 0.175, 0.03], 0.024), { color: SKIN, k: 0.02 })
    s.add(scaled(sphere([0.07 * side, 0.18, -0.03], 0.02), [1, 1, 0.5]), { color: SKIN, k: 0.01 })
  }
  beadEyes(s, [0, 0.193, 0.045], 0.05, 0.014, [0, 0.4, 0.9])
  // Upper teeth and the glowing throat.
  s.sub(ellipsoid([0, 0.06, 0.2], [0.085, 0.035, 0.07]), { k: 0.01, color: 0x5a2a5e })
  for (const side of [1, -1])
    s.add(cone([0.06 * side, 0.08, 0.23], [0.062 * side, 0.055, 0.235], 0.011, 0.005), { color: WHITE, k: 0.004 })
  s.paint(sphere([0, 0.065, 0.16], 0.05), { color: 0xe9a8ff, mask: GLOW2 })
  s.paint(torus([0, 0.1, 0.06], 0.1, 0.005, [0.2, 0, 0]), { color: WHITE, mask: GLOW })
  const jaw = new Sculpt()
  jaw.add(ellipsoid([0, 0.035, 0.15], [0.095, 0.03, 0.095]), { color: SKIN })
  jaw.sub(ellipsoid([0, 0.06, 0.17], [0.08, 0.03, 0.08]), { k: 0.008, color: 0x5a2a5e })
  for (const side of [1, -1])
    jaw.add(cone([0.06 * side, 0.04, 0.22], [0.062 * side, 0.072, 0.225], 0.012, 0.005), { color: WHITE, k: 0.004 })
  jaw.paint(ellipsoid([0, 0.06, 0.16], [0.06, 0.02, 0.06]), { color: 0xff8fb5, mask: GLOW2 })
  return {
    parts: [
      { name: 'head', sculpt: s },
      { name: 'jaw', sculpt: jaw, pivot: [0, 0.05, 0.06] }
    ],
    muzzle: [0, 0.075, 0.27],
    cell: 0.005,
    tris: 2800,
    glow2: 0xe9a8ff,
    animate(parts, st, glow2) {
      const open = st.act === 'charge' ? st.charge : Math.exp(-st.sinceFire * 6) * 0.6
      parts.jaw.rotation.x = 0.45 * open
      glow2(0.3 + 2.5 * open)
    }
  }
}
