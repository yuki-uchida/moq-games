/**
 * CharacterModel: the skinned SDF body with outline, face parts on the head bone, antiques on the paws, passive
 * gear, looks (ARK / クロヅメ / hologram) and the procedural animator.
 */
import * as THREE from 'three'
import type { ItemId } from '../data/items'
import type { CharacterModel, CharacterPose, ItemModel } from './api'
import { Animator } from './animation'
import { GEAR_ITEMS, type GearId } from './gear'
import {
  createEyeMaterial,
  createFlatMaterial,
  createEyeUniforms,
  createOutlineMaterial,
  createToonMaterial,
  createUniforms,
  regionsOf
} from './materials'
import { buildRig, type BoneName } from './rig'
import type { SpeciesAsset } from './species/asset'
import type { BakedModel } from './sdf/geometry'
import type { Vec3 } from './sdf/sculpt'

/** Items created by the kit also expose their glow so the character can light them on swaps. */
export interface KitItemModel extends ItemModel {
  setSwapGlow(amount: number): void
  setCloak(amount: number): void
}

export interface CharacterDeps {
  item(id: ItemId): KitItemModel
  gear(id: GearId): BakedModel
  scarf(): BakedModel
  happyEye(): THREE.BufferGeometry
}

const ARK_TRIM = 0xffc861
const KUROZUME_TRIM = 0xd43a3a
const ARK_GLOW = 0xff9a3c
const KUROZUME_GLOW = 0xff4a3a
const NAVY_LINEAR = new THREE.Color(0x27355f)
const CHARCOAL = new THREE.Color(0x3c3b42)

let instanceSeed = 1

export function createCharacterModel(
  asset: SpeciesAsset,
  options: { look?: 'ark' | 'kurozume'; outline?: boolean },
  deps: CharacterDeps
): CharacterModel {
  const H = asset.plan.H
  const root = new THREE.Group()
  root.name = `character:${asset.id}`
  const rig = buildRig(asset.plan.layout)
  root.add(rig.root)
  const u = createUniforms()
  const material = createToonMaterial(u, {
    texture: asset.regionTexture,
    count: asset.regions.count,
    shapeBase: asset.regions.shapeBase
  })
  // Rigid uniform parts share the uniforms but have their own paint regions.
  const partMaterials = asset.parts.map((p) => createToonMaterial(u, regionsOf(p.model)))
  const body = new THREE.SkinnedMesh(asset.body, material)
  body.name = 'body'
  root.add(body)
  body.bind(rig.skeleton)
  body.castShadow = true
  body.receiveShadow = true
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.55, 0), H * 1.3)
  const outlineMat = createOutlineMaterial(u)
  u.uOutline.value = 0.0055 * H
  let outline: THREE.SkinnedMesh | null = null
  const partOutlines: THREE.Mesh[] = []
  if (options.outline !== false) {
    outline = new THREE.SkinnedMesh(asset.body, outlineMat)
    outline.name = 'outline'
    root.add(outline)
    outline.bind(rig.skeleton, body.bindMatrix)
    outline.boundingSphere = body.boundingSphere
  }
  asset.parts.forEach((part, pi) => {
    const b = asset.plan.layout[part.bone]
    const mesh = new THREE.Mesh(part.model.geometry, partMaterials[pi])
    mesh.position.set(-b[0], -b[1], -b[2])
    mesh.castShadow = true
    rig.byName[part.bone].add(mesh)
    if (outline) {
      const ol = new THREE.Mesh(part.model.geometry, outlineMat)
      ol.position.copy(mesh.position)
      rig.byName[part.bone].add(ol)
      partOutlines.push(ol)
    }
  })
  const bindPos = (name: BoneName) => asset.plan.layout[name]
  const attach = (bone: BoneName, obj: THREE.Object3D, p: Vec3) => {
    const b = bindPos(bone)
    obj.position.set(p[0] - b[0], p[1] - b[1], p[2] - b[2])
    rig.byName[bone].add(obj)
  }

  // ------------------------------------------------------------------------------------------------ face
  const eu = createEyeUniforms(asset.face.iris, asset.face.irisDark, asset.face.pupil)
  const eyeMat = createEyeMaterial(eu)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x2a1c24 })
  const eyes: THREE.Mesh[] = []
  const happyEyes: THREE.Mesh[] = []
  const eyeScale: THREE.Vector3[] = []
  for (const pl of asset.layout.eyes) {
    const eye = new THREE.Mesh(asset.eye, eyeMat)
    eye.quaternion.set(pl.q[0], pl.q[1], pl.q[2], pl.q[3])
    eyeScale.push(new THREE.Vector3(pl.s[0], pl.s[1], pl.s[2]))
    eye.scale.copy(eyeScale[eyeScale.length - 1])
    attach('head', eye, pl.p)
    eyes.push(eye)
    const happy = new THREE.Mesh(deps.happyEye(), lineMat)
    happy.quaternion.copy(eye.quaternion)
    attach('head', happy, [pl.p[0], pl.p[1], pl.p[2]])
    happy.position.add(new THREE.Vector3(0, 0, pl.s[2] * 0.55).applyQuaternion(eye.quaternion))
    happy.scale.setScalar(pl.s[0] / (0.05 * 1.2))
    happy.visible = false
    happyEyes.push(happy)
  }
  const browMat = new THREE.MeshBasicMaterial({ color: asset.face.brow })
  const brows: THREE.Mesh[] = []
  const browBase: THREE.Quaternion[] = []
  const browPos: THREE.Vector3[] = []
  for (const pl of asset.layout.brows) {
    const brow = new THREE.Mesh(asset.brow, browMat)
    const q = new THREE.Quaternion(pl.q[0], pl.q[1], pl.q[2], pl.q[3])
    brow.quaternion.copy(q)
    attach('head', brow, pl.p)
    browBase.push(q)
    browPos.push(brow.position.clone())
    brows.push(brow)
  }
  const mouthMat = createFlatMaterial()
  const mouthClosed = new THREE.Mesh(asset.mouthClosed, mouthMat)
  const mouthOpen = new THREE.Mesh(asset.mouthOpen, mouthMat)
  for (const m of [mouthClosed, mouthOpen]) {
    const pl = asset.layout.mouth
    m.quaternion.set(pl.q[0], pl.q[1], pl.q[2], pl.q[3])
    attach('head', m, pl.p)
  }
  const beaked = asset.face.mouth === 'beak'
  mouthOpen.visible = false
  mouthClosed.visible = !beaked

  // ------------------------------------------------------------------------------------------------ hands
  const itemScale = Math.min(Math.max(H / 1.2, 0.82), 1.25)
  const grips: THREE.Object3D[] = []
  for (const h of [0, 1] as const) {
    const S = h === 0 ? 'R' : 'L'
    const grip = new THREE.Object3D()
    const g = asset.grip[h === 0 ? 1 : 0]
    grip.position.set(g[0], g[1], g[2])
    rig.byName[`paw${S}`].add(grip)
    grips.push(grip)
  }
  const held: (KitItemModel | null)[] = [null, null]

  // ------------------------------------------------------------------------------------------------ gear
  const gearU = createUniforms()
  gearU.uGlowColor.value.setHex(0xffffff)
  gearU.uGlow.value = 0.4
  gearU.uOutline.value = u.uOutline.value
  const gearMats: THREE.MeshToonMaterial[] = []
  const gearMatFor = (model: BakedModel) => {
    const m = createToonMaterial(gearU, regionsOf(model))
    gearMats.push(m)
    return m
  }
  const gearOutline = createOutlineMaterial(gearU)
  const gearScale = H / 1.2
  const gear = new Map<string, THREE.Object3D>()
  const membranes: THREE.Object3D[] = []
  const back = asset.back
  const backQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(back.n[0], 0, back.n[2]).normalize()
  )
  const makeGear = (id: GearId) => {
    const model = deps.gear(id)
    const geo = model.geometry
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(geo, gearMatFor(model))
    mesh.castShadow = true
    group.add(mesh)
    if (options.outline !== false) group.add(new THREE.Mesh(geo, gearOutline))
    group.scale.setScalar(gearScale)
    return group
  }
  const placeGear = (id: string) => {
    if (gear.has(id)) return
    if (id === 'turtle') {
      const g = makeGear('turtle')
      g.quaternion.copy(backQ)
      attach('chest', g, [back.p[0], back.p[1] + 0.01 * H, back.p[2] - 0.005 * H])
      gear.set(id, g)
    } else if (id === 'hedgehog') {
      const g = makeGear('hedgehog')
      g.quaternion.copy(backQ)
      const lift = gear.has('turtle') ? 0.06 * H : 0
      attach('chest', g, [back.p[0], back.p[1] + 0.02 * H, back.p[2] - lift])
      gear.set(id, g)
    } else if (id === 'momonga') {
      const g = makeGear('momonga')
      g.quaternion.copy(backQ)
      const out = gear.has('turtle') || gear.has('hedgehog') ? 0.07 * H : 0
      attach('chest', g, [back.p[0], back.p[1] - 0.09 * H, back.p[2] - out])
      gear.set(id, g)
      for (const S of ['L', 'R'] as const) {
        const m = makeGear('membrane')
        const side = S === 'L' ? 1 : -1
        // The sail runs along the arm (shoulder → wrist) and spreads inwards to the flank; the right one is
        // mirrored by flipping its width axis.
        const sh = asset.plan.layout[`upperArm${S}`]
        const wr = asset.plan.layout[`paw${S}`]
        m.rotation.z = Math.atan2(wr[1] - sh[1], wr[0] - sh[0])
        m.userData.flip = side
        m.scale.set(gearScale, gearScale * side, gearScale)
        // Start a third of the way down the arm so the sail shows past the shoulder blend.
        const k = 0.35
        attach(`upperArm${S}`, m, [
          sh[0] + (wr[0] - sh[0]) * k,
          sh[1] + (wr[1] - sh[1]) * k,
          sh[2] + (wr[2] - sh[2]) * k - 0.012 * H
        ])
        m.visible = false
        membranes.push(m)
      }
    } else if (id === 'jelly') {
      const g = makeGear('jelly')
      const p = asset.beltSide
      attach('hips', g, [p[0] + 0.01 * H, p[1] - 0.02 * H, p[2] + 0.02 * H])
      gear.set(id, g)
    }
  }
  const clearGear = () => {
    for (const g of gear.values()) g.removeFromParent()
    for (const m of membranes) m.removeFromParent()
    gear.clear()
    membranes.length = 0
  }

  // ------------------------------------------------------------------------------------------------ scarf
  let scarf: THREE.Group | null = null
  const ensureScarf = () => {
    if (scarf) return scarf
    const model = deps.scarf()
    const geo = model.geometry
    scarf = new THREE.Group()
    scarf.add(new THREE.Mesh(geo, gearMatFor(model)))
    if (options.outline !== false) scarf.add(new THREE.Mesh(geo, gearOutline))
    attach('chest', scarf, [0, 0, 0])
    scarf.position.copy(new THREE.Vector3().fromArray(asset.plan.layout.chest).negate())
    return scarf
  }

  // ------------------------------------------------------------------------------------------------ state
  const anim = new Animator(rig, asset.plan, asset.id, instanceSeed++ * 7919, [
    new THREE.Vector3(...asset.grip[0]),
    new THREE.Vector3(...asset.grip[1])
  ])
  let look: 'ark' | 'kurozume' = options.look ?? 'ark'
  let team: number | null = null
  let pattern: 0 | 1 | 2 | null = null
  let anima = 1
  let cloak = 0
  let holo = false

  const applyLook = () => {
    const kuro = look === 'kurozume'
    if (kuro)
      u.uArmorTint.value.setRGB(CHARCOAL.r / NAVY_LINEAR.r, CHARCOAL.g / NAVY_LINEAR.g, CHARCOAL.b / NAVY_LINEAR.b)
    else u.uArmorTint.value.setRGB(1, 1, 1)
    u.uTrim.value.setHex(kuro ? KUROZUME_TRIM : ARK_TRIM)
    u.uGlowColor.value.setHex(kuro ? KUROZUME_GLOW : ARK_GLOW)
    u.uTeamOn.value = team === null ? 0 : 1
    if (team !== null) u.uTeam.value.setHex(team)
    u.uPattern.value = pattern ?? 0
    if (kuro) ensureScarf().visible = true
    else if (scarf) scarf.visible = false
  }
  const applyTransparency = () => {
    const transparent = holo || cloak > 0.001
    for (const m of [material, ...partMaterials, ...gearMats, eyeMat, browMat, mouthMat]) {
      if (m.transparent !== transparent) {
        m.transparent = transparent
        m.needsUpdate = true
      }
      m.depthWrite = !holo
    }
    browMat.opacity = mouthMat.opacity = 1 - cloak * 0.95
    const showOutline = !holo && cloak < 0.35
    if (outline) outline.visible = showOutline
    for (const ol of partOutlines) ol.visible = showOutline
    gearOutline.visible = showOutline
  }
  applyLook()

  const setItem = (h: 0 | 1, id: ItemId | null) => {
    const cur = held[h]
    if ((cur?.id ?? null) === id) return
    if (cur) {
      cur.root.removeFromParent()
      cur.dispose()
    }
    held[h] = null
    if (id) {
      const item = deps.item(id)
      item.root.scale.setScalar(itemScale)
      grips[h].add(item.root)
      held[h] = item
    }
  }

  const tmpV = new THREE.Vector3()
  const model: CharacterModel = {
    root,
    species: asset.id,
    update(dt: number, pose: CharacterPose) {
      u.uTime.value += dt
      eu.uTime.value = u.uTime.value
      setItem(0, pose.hands[0].item)
      setItem(1, pose.hands[1].item)
      anim.update(dt, pose)
      // Face.
      const F = anim.face
      const happy = F.happy > 0.5
      for (let i = 0; i < 2; i++) {
        const s = eyeScale[i]
        const open = 1 - 0.92 * F.blink
        eyes[i].scale.set(s.x, s.y * Math.max(open, 0.05), s.z)
        eyes[i].visible = !happy
        happyEyes[i].visible = happy
        const side = i === 0 ? 1 : -1
        const rot = F.brow * 0.42 * side
        brows[i].quaternion.copy(browBase[i]).multiply(tmpQ.setFromAxisAngle(Z_AXIS, rot))
        brows[i].position
          .copy(browPos[i])
          .add(tmpV.set(0, (F.browUp * 0.018 - Math.max(F.brow, 0) * 0.008) * H, 0).applyQuaternion(browBase[i]))
      }
      const open = F.mouth > 0.35
      mouthOpen.visible = open
      mouthOpen.scale.setScalar(0.5 + 0.5 * Math.min(1, F.mouth))
      mouthClosed.visible = !open && !beaked
      if (beaked) mouthOpen.visible = open && F.mouth > 0.6
      // Antiques in the paws.
      for (const h of [0, 1] as const) {
        const item = held[h]
        if (!item) continue
        const hv = anim.handVis[h]
        item.root.scale.setScalar(itemScale * Math.max(hv.vis, 0.0001))
        item.root.visible = hv.vis > 0.01
        item.setSwapGlow(hv.glow)
        item.update(dt, pose.hands[h].act, pose.hands[h].charge)
      }
      for (const m of membranes) {
        const g = anim.glide
        m.visible = g > 0.02
        m.scale.set(gearScale * (0.55 + 0.45 * g), gearScale * g * m.userData.flip, gearScale)
      }
      u.uGlow.value = (0.2 + 1.9 * anima) * anim.core * (holo ? 0.5 : 1)
    },
    muzzle(hand: 0 | 1, out: THREE.Vector3) {
      const item = held[hand]
      if (item) {
        item.root.updateWorldMatrix(true, false)
        return item.root.localToWorld(out.copy(item.muzzle))
      }
      grips[hand].updateWorldMatrix(true, false)
      return grips[hand].getWorldPosition(out)
    },
    headTop(out: THREE.Vector3) {
      const head = rig.byName.head
      head.updateWorldMatrix(true, false)
      return head.localToWorld(out.set(0, asset.headTop - asset.plan.layout.head[1] + 0.08 * H, 0))
    },
    setTeam(color: number | null, pat: 0 | 1 | 2 | null) {
      team = color
      pattern = pat
      applyLook()
    },
    setLook(l: 'ark' | 'kurozume') {
      look = l
      applyLook()
    },
    setPassives(passives: ItemId[], online: boolean) {
      const wanted = GEAR_ITEMS.filter((id) => passives.includes(id))
      const have = [...gear.keys()]
      if (wanted.length !== have.length || wanted.some((id) => !gear.has(id))) {
        clearGear()
        for (const id of wanted) placeGear(id)
      }
      gearU.uDim.value = online ? 0 : 1
      gearU.uGlow.value = online ? 0.45 : 0
    },
    setCloak(amount: number) {
      cloak = Math.min(Math.max(amount, 0), 1)
      u.uCloak.value = cloak
      gearU.uCloak.value = cloak
      eu.uCloak.value = cloak
      for (const item of held) item?.setCloak(cloak)
      applyTransparency()
    },
    setFlash(amount: number) {
      const a = Math.min(Math.max(amount, 0), 1)
      u.uFlash.value = a
      gearU.uFlash.value = a
      eu.uFlash.value = a
    },
    setAnima(fraction: number) {
      anima = Math.min(Math.max(fraction, 0), 1)
    },
    setHologram(on: boolean) {
      holo = on
      u.uHolo.value = gearU.uHolo.value = eu.uHolo.value = on ? 1 : 0
      applyTransparency()
    },
    dispose() {
      for (const h of [0, 1] as const) setItem(h, null)
      clearGear()
      for (const m of [
        material,
        ...partMaterials,
        outlineMat,
        eyeMat,
        lineMat,
        browMat,
        mouthMat,
        ...gearMats,
        gearOutline
      ])
        m.dispose()
      rig.skeleton.dispose()
      root.removeFromParent()
    }
  }
  return model
}

const tmpQ = new THREE.Quaternion()
const Z_AXIS = new THREE.Vector3(0, 0, 1)
