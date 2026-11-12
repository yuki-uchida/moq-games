/**
 * CharacterModel: one skinned mesh for the body with its uniform parts, face lines, passive gear, クロヅメ scarf
 * and ink outline (assembly.ts), one skinned mesh for both eyes, and the antiques on the paws — 4 draw calls
 * with an antique in each paw. Looks (ARK / クロヅメ / team / hologram / cloak), the procedural animator, and a
 * distance level of detail (the body and the antiques switch to lighter geometry beyond `LOD_DISTANCE`).
 */
import * as THREE from 'three'
import type { ItemId } from '../data/items'
import type { CharacterModel, CharacterPose, ItemModel, Quality } from './api'
import { Animator } from './animation'
import { EXTRA_BONES, type CharacterAssembly, type ExtraBone } from './assembly'
import { GEAR_ITEMS, type GearId } from './gear'
import { hullDepthMaterial } from './hull'
import { createEyeMaterial, createEyeUniforms, createToonMaterial, createUniforms } from './materials'
import { buildRig } from './rig'

/** Items created by the kit also expose their glow so the character can light them on swaps. */
export interface KitItemModel extends ItemModel {
  setSwapGlow(amount: number): void
  setCloak(amount: number): void
  /** 0 = full detail, 1 = distance level of detail. */
  setLod(level: 0 | 1): void
}

export interface CharacterDeps {
  item(id: ItemId): KitItemModel
  assembly(): CharacterAssembly
}

const ARK_TRIM = 0xffc861
const KUROZUME_TRIM = 0xd43a3a
const ARK_GLOW = 0xff9a3c
const KUROZUME_GLOW = 0xff4a3a
const NAVY_LINEAR = new THREE.Color(0x27355f)
const CHARCOAL = new THREE.Color(0x3c3b42)
/** Camera distance (m) beyond which a character uses its light level of detail (hysteresis ±12 %). */
export const LOD_DISTANCE: Record<Quality, number> = { low: 7, medium: 12, high: 20 }
const HIDDEN = 1e-4

let instanceSeed = 1

export function createCharacterModel(
  assembly: CharacterAssembly,
  options: { look?: 'ark' | 'kurozume'; outline?: boolean; quality?: Quality },
  deps: CharacterDeps
): CharacterModel {
  const asset = assembly.asset
  const H = asset.plan.H
  const outlineOn = options.outline !== false
  const lodDistance = LOD_DISTANCE[options.quality ?? asset.quality]
  const root = new THREE.Group()
  root.name = `character:${asset.id}`
  const rig = buildRig(asset.plan.layout)
  root.add(rig.root)
  // Extra bones for blinks, brows, mouths, happy eyes and glider membranes.
  const extra = {} as Record<ExtraBone, THREE.Bone>
  for (const name of EXTRA_BONES) {
    const b = assembly.binds[name]
    const bone = new THREE.Bone()
    bone.name = name
    const parent = asset.plan.layout[b.parent]
    bone.position.set(b.p[0] - parent[0], b.p[1] - parent[1], b.p[2] - parent[2])
    bone.quaternion.copy(b.q)
    rig.byName[b.parent].add(bone)
    extra[name] = bone
  }
  rig.root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton([...rig.bones, ...EXTRA_BONES.map((n) => extra[n])])

  const u = createUniforms()
  u.uOutline.value = 0.0055 * H
  const material = createToonMaterial(
    u,
    { texture: assembly.texture, count: assembly.table.count, shapeBase: assembly.table.shapeBase },
    { hull: outlineOn, merged: true }
  )
  let gearSet: GearId[] = []
  let gearKey = ''
  let lod: 0 | 1 = 0
  let look: 'ark' | 'kurozume' = options.look ?? 'ark'
  const bodyGeometry = () => assembly.body(gearSet, look === 'kurozume', lod, outlineOn).geometry
  const body = new THREE.SkinnedMesh(bodyGeometry(), material)
  body.name = 'body'
  root.add(body)
  body.bind(skeleton)
  body.castShadow = true
  body.receiveShadow = true
  body.customDepthMaterial = hullDepthMaterial()
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.55, 0), H * 1.3)
  // Level of detail: the camera distance of the last rendered frame picks the geometry of the next one.
  let camDist = 0
  const camPos = new THREE.Vector3()
  const selfPos = new THREE.Vector3()
  const measure = (camera: THREE.Camera) => {
    camPos.setFromMatrixPosition(camera.matrixWorld)
    selfPos.setFromMatrixPosition(body.matrixWorld)
    camDist = camPos.distanceTo(selfPos)
  }
  body.onBeforeRender = (_r, _s, camera) => measure(camera)
  // Shadow passes get the main camera too (characters outside the view still cast shadows).
  body.onBeforeShadow = (_r, _o, camera) => measure(camera)

  // ------------------------------------------------------------------------------------------------ eyes
  const eu = createEyeUniforms(asset.face.iris, asset.face.irisDark, asset.face.pupil)
  const eyeMat = createEyeMaterial(eu, { skinned: true })
  const eyes = new THREE.SkinnedMesh(assembly.eyes(0), eyeMat)
  eyes.name = 'eyes'
  root.add(eyes)
  eyes.bind(skeleton, body.bindMatrix)
  eyes.boundingSphere = body.boundingSphere
  const browBase = [extra.browL.quaternion.clone(), extra.browR.quaternion.clone()]
  const browPos = [extra.browL.position.clone(), extra.browR.position.clone()]
  const beaked = asset.face.mouth === 'beak'

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

  // ------------------------------------------------------------------------------------------------ state
  const anim = new Animator(rig, asset.plan, asset.id, instanceSeed++ * 7919, [
    new THREE.Vector3(...asset.grip[0]),
    new THREE.Vector3(...asset.grip[1])
  ])
  let team: number | null = null
  let pattern: 0 | 1 | 2 | null = null
  let anima = 1
  let cloak = 0
  let holo = false

  const refreshGeometry = () => {
    const g = bodyGeometry()
    if (body.geometry !== g) body.geometry = g
  }
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
    refreshGeometry()
  }
  const applyTransparency = () => {
    const transparent = holo || cloak > 0.001
    for (const m of [material, eyeMat]) {
      if (m.transparent !== transparent) {
        m.transparent = transparent
        m.needsUpdate = true
      }
      m.depthWrite = !holo
    }
    u.uHullOn.value = !holo && cloak < 0.35 ? 1 : 0
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
      item.setLod(lod)
      if (cloak > 0) item.setCloak(cloak)
      grips[h].add(item.root)
      held[h] = item
    }
  }
  const hide = (b: THREE.Bone, shown: boolean, s = 1) => b.scale.setScalar(shown ? s : HIDDEN)

  const tmpV = new THREE.Vector3()
  const model: CharacterModel = {
    root,
    species: asset.id,
    update(dt: number, pose: CharacterPose) {
      u.uTime.value += dt
      eu.uTime.value = u.uTime.value
      // Level of detail with hysteresis.
      const want: 0 | 1 = camDist > lodDistance * (lod === 1 ? 0.88 : 1.12) ? 1 : 0
      if (want !== lod && camDist > 0) {
        lod = want
        refreshGeometry()
        eyes.geometry = assembly.eyes(lod)
        for (const item of held) item?.setLod(lod)
      }
      setItem(0, pose.hands[0].item)
      setItem(1, pose.hands[1].item)
      anim.update(dt, pose)
      // Face.
      const F = anim.face
      const happy = F.happy > 0.5
      const open = 1 - 0.92 * F.blink
      for (let i = 0; i < 2; i++) {
        const eye = i === 0 ? extra.eyeL : extra.eyeR
        if (happy) eye.scale.setScalar(HIDDEN)
        else eye.scale.set(1, Math.max(open, 0.05), 1)
        hide(i === 0 ? extra.happyL : extra.happyR, happy)
        const side = i === 0 ? 1 : -1
        const brow = i === 0 ? extra.browL : extra.browR
        brow.quaternion.copy(browBase[i]).multiply(tmpQ.setFromAxisAngle(Z_AXIS, F.brow * 0.42 * side))
        brow.position
          .copy(browPos[i])
          .add(tmpV.set(0, (F.browUp * 0.018 - Math.max(F.brow, 0) * 0.008) * H, 0).applyQuaternion(browBase[i]))
      }
      const mouthOpen = F.mouth > 0.35
      hide(extra.mouthOpen, beaked ? mouthOpen && F.mouth > 0.6 : mouthOpen, 0.5 + 0.5 * Math.min(1, F.mouth))
      hide(extra.mouthClosed, !mouthOpen && !beaked)
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
      const g = anim.glide
      for (const m of [extra.membraneL, extra.membraneR])
        if (g > 0.02) m.scale.set(0.55 + 0.45 * g, g, 1)
        else m.scale.setScalar(HIDDEN)
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
      const wanted = GEAR_ITEMS.filter((id) => passives.includes(id)) as GearId[]
      const key = wanted.join(',')
      if (key !== gearKey) {
        gearKey = key
        gearSet = wanted
        refreshGeometry()
      }
      u.uGearDim.value = online ? 0 : 1
      u.uGearGlow.value = online ? 0.45 : 0
    },
    setCloak(amount: number) {
      cloak = Math.min(Math.max(amount, 0), 1)
      u.uCloak.value = cloak
      eu.uCloak.value = cloak
      for (const item of held) item?.setCloak(cloak)
      applyTransparency()
    },
    setFlash(amount: number) {
      const a = Math.min(Math.max(amount, 0), 1)
      u.uFlash.value = a
      eu.uFlash.value = a
    },
    setAnima(fraction: number) {
      anima = Math.min(Math.max(fraction, 0), 1)
    },
    setHologram(on: boolean) {
      holo = on
      u.uHolo.value = eu.uHolo.value = on ? 1 : 0
      applyTransparency()
    },
    dispose() {
      for (const h of [0, 1] as const) setItem(h, null)
      material.dispose()
      eyeMat.dispose()
      skeleton.dispose()
      root.removeFromParent()
    }
  }
  return model
}

const tmpQ = new THREE.Quaternion()
const Z_AXIS = new THREE.Vector3(0, 0, 1)
