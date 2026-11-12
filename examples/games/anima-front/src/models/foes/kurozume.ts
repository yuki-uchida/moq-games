/**
 * Rig of クロヅメ兵 for previews (the renderer draws クロヅメ as animated animals; the codex turntable and tests
 * ask for a rig): the fox of the first クロヅメ squad as a rigid statue in charcoal armour with the red claw-mark
 * scarf and red glow, plus its glossy eyes, breathing and swaying a little.
 */
import * as THREE from 'three'
import type { FoeAnim, FoeRig } from '../api'
import type { CharacterAssembly } from '../assembly'
import { createEyeMaterial, createEyeUniforms, createToonMaterial, createUniforms } from '../materials'
import { pivotMatrix } from './rigging'

const NAVY = new THREE.Color(0x27355f)
const CHARCOAL = new THREE.Color(0x3c3b42)

export function kurozumeRig(assembly: CharacterAssembly): FoeRig {
  const a = assembly.asset
  const u = createUniforms()
  u.uArmorTint.value.setRGB(CHARCOAL.r / NAVY.r, CHARCOAL.g / NAVY.g, CHARCOAL.b / NAVY.b)
  u.uTrim.value.setHex(0xd43a3a)
  u.uGlowColor.value.setHex(0xff4a3a)
  u.uGlow.value = 1.6
  const body = createToonMaterial(
    u,
    { texture: assembly.texture, count: assembly.table.count, shapeBase: assembly.table.shapeBase },
    { merged: true }
  )
  const eyes = createEyeMaterial(createEyeUniforms(a.face.iris, a.face.irisDark, a.face.pupil), { instanced: true })
  const H = a.plan.H
  return {
    kind: 'kurozume',
    parts: [
      { name: 'body', geometry: assembly.statue(true).geometry, material: body },
      { name: 'eyes', geometry: assembly.eyes(0), material: eyes }
    ],
    pose(anim: FoeAnim, out: THREE.Matrix4[]) {
      const t = anim.time + anim.seed * 9
      const b = Math.sin(t * 2.2) * 0.012
      const sway = Math.sin(t * 0.9) * 0.04
      pivotMatrix(out[0], 0, 0, 0, 0, 0, 0, 0, sway, 0, 1, 1 + b, 1)
      out[1].copy(out[0])
      void H
    }
  }
}
