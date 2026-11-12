/**
 * Generated, cached data of one species at one quality: the skinned body geometry, face placements, mouth
 * geometries and anchors for gear. Pure data + BufferGeometry (no materials), safe to share between instances.
 */
import type * as THREE from 'three'
import type { SpeciesId } from '../../data/species'
import type { Quality } from '../api'
import { browGeometry, eyeGeometry, layoutFace, mouthGeometries, type FaceLayout } from '../face'
import { BONE_NAMES, type BodyPlan } from '../rig'
import { compileField } from '../sdf/field'
import { bakeModel, toGeometry, type BakedModel } from '../sdf/geometry'
import { meshField, traceSurface, type MeshData } from '../sdf/mesher'
import { buildRegions, regionTexture, type RegionTable } from '../sdf/regions'
import { simplify } from '../sdf/simplify'
import type { Vec3 } from '../sdf/sculpt'
import { speciesRecipe, type FaceSpec } from './recipes'
import type { Look } from './body'

export interface SpeciesAsset {
  id: SpeciesId
  quality: Quality
  plan: BodyPlan
  face: FaceSpec
  look: Look
  layout: FaceLayout
  body: THREE.BufferGeometry
  /** Distance level of detail of the body (same regions and skinning). */
  bodyLod: THREE.BufferGeometry
  /** Shader-drawn markings of the body (sdf/regions.ts) and their texture. */
  regions: RegionTable
  regionTexture: THREE.DataTexture
  /** Rigid uniform parts in model space (core gem, buckle, back plate) and their bones. */
  parts: { bone: 'chest' | 'hips'; model: BakedModel }[]
  eye: THREE.BufferGeometry
  brow: THREE.BufferGeometry
  mouthClosed: THREE.BufferGeometry
  mouthOpen: THREE.BufferGeometry
  /** Back surface point/normal at chest height (gear), belt side point (charms), top of the head. */
  back: { p: Vec3; n: Vec3 }
  beltSide: Vec3
  headTop: number
  /** Paw centre offsets from the wrist joint (grip of held antiques), left then right. */
  grip: [Vec3, Vec3]
  /** Generation time (ms) and triangles of the body. */
  ms: number
  triangles: number
}

/** Grid resolution: cells per body height. */
export const CHARACTER_RES: Record<Quality, number> = { low: 44, medium: 58, high: 84 }
/** Rigid uniform parts: grid resolution and triangle budget per part. */
const PART_RES: Record<Quality, number> = { low: 110, medium: 150, high: 200 }
const PART_TRIS: Record<Quality, number> = { low: 200, medium: 360, high: 700 }
/** Body triangle budget after simplification. */
export const CHARACTER_TRIS: Record<Quality, number> = { low: 4800, medium: 7200, high: 14000 }
/** Body triangles of the distance level of detail. */
export const CHARACTER_LOD_TRIS: Record<Quality, number> = { low: 1500, medium: 2200, high: 3600 }
const PART_LOD_TRIS: Record<Quality, number> = { low: 90, medium: 120, high: 200 }

export function* buildSpeciesAsset(id: SpeciesId, quality: Quality): Generator<void, SpeciesAsset, void> {
  const t0 = performance.now()
  const recipe = speciesRecipe(id)
  const { plan, sculpt, face, look } = recipe
  const H = plan.H
  const field = compileField(sculpt, BONE_NAMES)
  yield
  const cell = H / CHARACTER_RES[quality]
  const mesh = yield* meshField(field, {
    cell,
    skinned: true,
    regions: true,
    ao: quality === 'low' ? { reach: 0.045 * H, min: 0.66 } : { reach: 0.05 * H, min: 0.6 }
  })
  yield
  const debug = (globalThis as { __animaModelsDebug?: { noSimplify?: boolean } }).__animaModelsDebug
  const reduced = simplify(mesh, debug?.noSimplify ? Infinity : CHARACTER_TRIS[quality])
  // Bone-filtered regions read the summed skin weight of their bones from the regionFilter attribute.
  const regions = buildRegions(field)
  const skinnedGeometry = (m: MeshData) => {
    const g = toGeometry(m)
    if (regions.filters.length && m.skinIndex && m.skinWeight) {
      const out = (g.getAttribute('regionFilter') as THREE.BufferAttribute).array as Float32Array
      for (let v = 0; v < m.vertexCount; v++)
        regions.filters.forEach((bones, slot) => {
          let w = 0
          for (let c = 0; c < 4; c++) if (bones.includes(m.skinIndex![v * 4 + c])) w += m.skinWeight![v * 4 + c]
          out[v * 4 + slot] = w
        })
    }
    return g
  }
  const body = skinnedGeometry(reduced)
  yield
  const bodyLod = skinnedGeometry(simplify(reduced, CHARACTER_LOD_TRIS[quality]))
  const parts: SpeciesAsset['parts'] = []
  for (const part of recipe.parts) {
    const model = yield* bakeModel(part.sculpt, {
      cell: H / PART_RES[quality],
      maxTris: PART_TRIS[quality],
      lodTris: PART_LOD_TRIS[quality],
      ao: { reach: 0.02 * H, min: 0.7 }
    })
    parts.push({ bone: part.bone, model })
  }
  const layout = layoutFace(field, plan, face)
  const mouths = mouthGeometries(face.mouth, H, face.mouthColor)
  const backHit = traceSurface(field, [0, 0.47 * H, -H], [0, 0, 1], 2 * H)
  const beltHit = traceSurface(field, [H, 0.27 * H, 0.02 * H], [-1, 0, 0], 2 * H)
  const topHit = traceSurface(field, [0, 2 * H, plan.headC[2]], [0, -1, 0], 2 * H)
  const L = plan.layout
  const grip = (['L', 'R'] as const).map((S) => {
    const el = L[`lowerArm${S}`],
      wr = L[`paw${S}`]
    return [(wr[0] - el[0]) * 0.35, -0.012 * H, 0.01 * H] as Vec3
  }) as [Vec3, Vec3]
  return {
    id,
    quality,
    plan,
    face,
    look,
    layout,
    body,
    bodyLod,
    regions,
    regionTexture: regionTexture(regions),
    parts,
    eye: eyeGeometry(quality === 'low' ? 12 : quality === 'medium' ? 18 : 24),
    brow: browGeometry(H),
    mouthClosed: mouths.closed,
    mouthOpen: mouths.open,
    back: backHit ? { p: backHit.p, n: backHit.n } : { p: [0, 0.47 * H, -0.15 * H], n: [0, 0, -1] },
    beltSide: beltHit ? beltHit.p : [0.17 * H, 0.27 * H, 0],
    headTop: topHit ? topHit.p[1] : H,
    grip,
    ms: performance.now() - t0,
    triangles: reduced.triangleCount
  }
}
