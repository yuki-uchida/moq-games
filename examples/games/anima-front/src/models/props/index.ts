/**
 * Props drawn by the renderer (render/actors/props.ts): frog pads, the fixed launch pad, hermit shell walls,
 * honey jars, decoys, the anima lighthouse, the antique cart, hive nodes, training targets and tutorial beacons.
 * `buildPropAsset` bakes a recipe's rigid SDF parts once per kind (time-sliced by the kit); `createPropModel`
 * makes an animated instance with its own uniforms (toon parts get separate ink outline meshes, hive parts the
 * invaders' material with the single-draw hull).
 *
 * Beyond the PropModel contract every model has `setHealth(fraction)` (cracks, flicker) — the renderer can call
 * it with hp / maxHp when it has them.
 */
import * as THREE from 'three'
import type { PropKind } from '../../sim/types'
import type { PropModel, Quality } from '../api'
import { bakePart, disposeParts, type BakedPart } from '../foes/bake'
import { createFoeMaterial, createFoeUniforms } from '../foes/material'
import { hullDepthMaterial, noShadowDepthMaterial } from '../hull'
import { createOutlineMaterial, createToonMaterial, createUniforms, regionsOf } from '../materials'
import { cartRecipe } from './cart'
import { decoyRecipe, honeyRecipe, leafDecoyRecipe } from './deployables'
import { hermitRecipe } from './hermit'
import type { PropCtx, PropPart, PropRecipe } from './kit'
import { lighthouseRecipe } from './lighthouse'
import { nodeRecipe } from './node'
import { frogRecipe, padRecipe } from './pads'
import { targetRecipe, tutorialRecipe } from './training'

export interface PropAsset {
  kind: PropKind
  quality: Quality
  /** Triangles drawn by one prop (copies counted, outlines not) and generation time. */
  triangles: number
  ms: number
  recipe: PropRecipe
  parts: { part: PropPart; baked: BakedPart }[]
}

/** A prop model with the optional health hook (cracks / lamp flicker) on top of the contract. */
export interface PropModelExt extends PropModel {
  setHealth(fraction: number): void
}

const RECIPES: Partial<Record<PropKind, () => PropRecipe>> = {
  frog: frogRecipe,
  pad: padRecipe,
  hermit: hermitRecipe,
  honey: honeyRecipe,
  leafDecoy: leafDecoyRecipe,
  decoy: decoyRecipe,
  lighthouse: lighthouseRecipe,
  cart: cartRecipe,
  node: nodeRecipe,
  target: targetRecipe,
  tutorial: tutorialRecipe
}

/** Kinds the renderer draws itself (zone, base, ink, puddle) get an empty model. */
const emptyRecipe = (): PropRecipe => ({
  parts: [],
  look: { glowColor: 0xffffff, glow: 0, glow2Color: 0xffffff, outline: 0 },
  animate() {}
})

export function* buildPropAsset(kind: PropKind, quality: Quality): Generator<void, PropAsset, void> {
  const t0 = performance.now()
  const recipe = (RECIPES[kind] ?? emptyRecipe)()
  const parts: PropAsset['parts'] = []
  let triangles = 0
  for (const part of recipe.parts) {
    const baked = yield* bakePart(
      {
        name: part.name,
        sculpt: part.sculpt,
        cell: part.cell,
        tris: part.tris,
        hull: part.mat === 'foe',
        aoReach: part.aoReach,
        aoMin: part.aoMin
      },
      quality
    )
    parts.push({ part, baked })
    triangles += baked.triangles * (part.copies ?? 1)
    yield
  }
  return { kind, quality, triangles, ms: performance.now() - t0, recipe, parts }
}

export function createPropModel(asset: PropAsset): PropModelExt {
  const { recipe } = asset
  const look = recipe.look
  const root = new THREE.Group()
  root.name = `prop:${asset.kind}`
  const body = new THREE.Group()
  body.name = 'body'
  root.add(body)

  const u = createUniforms()
  u.uGlowColor.value.setHex(look.glowColor)
  u.uGlow.value = look.glow
  u.uGlow2Color.value.setHex(look.glow2Color)
  u.uGlow2.value = look.glow2 ?? 0
  u.uRim.value = look.rim ?? 0.3
  u.uOutline.value = look.outline
  const u2 = createUniforms()
  u2.uGlowColor.value.setHex(look.lampColor ?? look.glowColor)
  u2.uGlow.value = look.lamp ?? look.glow
  u2.uGlow2Color.value.setHex(look.lampColor ?? look.glow2Color)
  u2.uRim.value = look.rim ?? 0.3
  u2.uOutline.value = look.outline
  const fu = asset.parts.some((p) => p.part.mat === 'foe') ? createFoeUniforms(look.foe) : null
  if (fu) fu.uOutline.value = look.outline * 1.6

  const materials: THREE.Material[] = []
  const outline = asset.quality !== 'low' && asset.parts.some((p) => (p.part.mat ?? 'toon') === 'toon')
  const outlineMat = outline ? createOutlineMaterial(u) : null
  if (outlineMat) materials.push(outlineMat)
  const hullDepth = fu ? hullDepthMaterial() : null
  if (hullDepth) materials.push(hullDepth)
  const noShadow = noShadowDepthMaterial()

  const parts: Record<string, THREE.Group> = {}
  for (const { part, baked } of asset.parts) {
    const mat = part.mat ?? 'toon'
    const regions = baked.model.regions.count ? regionsOf(baked.model) : null
    let material: THREE.Material
    if (mat === 'foe') material = createFoeMaterial(fu!, regions, { hull: true })
    else {
      const set = mat === 'holo' || part.set === 1 ? u2 : u
      const m = createToonMaterial(set, regions)
      if (mat === 'holo') {
        set.uHolo.value = 1
        m.transparent = true
        m.depthWrite = false
      }
      material = m
    }
    materials.push(material)
    const pivot = part.pivot ?? [0, 0, 0]
    for (let i = 0; i < (part.copies ?? 1); i++) {
      const g = new THREE.Group()
      g.name = i ? `${part.name}${i}` : part.name
      g.position.set(pivot[0], pivot[1], pivot[2])
      const mesh = new THREE.Mesh(baked.geometry, material)
      mesh.position.set(-pivot[0], -pivot[1], -pivot[2])
      mesh.name = g.name
      if (mat === 'foe') mesh.customDepthMaterial = hullDepth!
      else if (mat !== 'toon') mesh.customDepthMaterial = noShadow
      g.add(mesh)
      if (mat === 'toon' && outlineMat) {
        const ol = new THREE.Mesh(baked.geometry, outlineMat)
        ol.name = `${g.name}:outline`
        ol.position.copy(mesh.position)
        ol.customDepthMaterial = noShadow
        g.add(ol)
      }
      body.add(g)
      parts[g.name] = g
    }
  }

  const extra: Record<string, THREE.Object3D> = {}
  const disposers: (() => void)[] = []
  for (const e of recipe.extras ?? []) {
    const { object, dispose } = e.make()
    object.name = e.name
    // Light cards and beams are not part of the prop's solid bounds.
    object.userData.extra = true
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).customDepthMaterial = noShadow
    })
    body.add(object)
    extra[e.name] = object
    disposers.push(dispose)
  }

  const ctx: PropCtx = {
    parts,
    body,
    extra,
    u,
    u2,
    fu,
    dt: 0,
    t: 0,
    state: 0,
    life: undefined,
    health: 1,
    clock: 0,
    mem: {}
  }
  let disposed = false
  return {
    root,
    kind: asset.kind,
    update(dt, t, state, life) {
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0
      ctx.dt = step
      ctx.clock += step
      ctx.t = Number.isFinite(t) ? Math.max(0, t) : 0
      ctx.state = Number.isFinite(state) ? state : 0
      ctx.life = life !== undefined && Number.isFinite(life) ? Math.max(0, life) : undefined
      u.uTime.value = u2.uTime.value = ctx.clock
      if (fu) fu.uTime.value = ctx.clock
      recipe.animate(ctx)
    },
    setHealth(fraction) {
      ctx.health = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 1
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const m of materials) m.dispose()
      for (const d of disposers) d()
      root.removeFromParent()
    }
  }
}

export function disposePropAsset(asset: PropAsset): void {
  disposeParts(asset.parts.map((p) => p.baked))
}
