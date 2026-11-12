/**
 * Baking helpers shared by foes, bosses and props: rigid SDF parts at a quality-scaled grid and triangle budget,
 * optionally with the single-draw outline hull (hull.ts).
 */
import type * as THREE from 'three'
import type { Quality } from '../api'
import { withHull } from '../hull'
import { compileField } from '../sdf/field'
import { bakeModel, type BakedModel } from '../sdf/geometry'
import { buildRegions, regionTexture } from '../sdf/regions'
import { OpType, type Sculpt } from '../sdf/sculpt'
import { mergeGeometries, tubeGeometry, tubeTriangles, type TubeSpec } from './tube'

export const CELL_SCALE: Record<Quality, number> = { low: 1.45, medium: 1, high: 0.72 }
export const TRI_SCALE: Record<Quality, number> = { low: 0.55, medium: 1, high: 1.7 }

export interface PartRecipe {
  name: string
  sculpt: Sculpt
  /** Grid cell at medium (m). */
  cell: number
  /** Triangle budget at medium (without the hull). */
  tris: number
  /**
   * Procedural tubes (legs, mandibles, spines) merged into the part; the sculpt's paint regions apply to them
   * too. A sculpt without `add` ops only contributes paint regions.
   */
  tubes?: TubeSpec[]
  /** Append an outline hull (doubles the triangles drawn). */
  hull?: boolean
  /** < 1: a translucent part (wings, membranes): transparent material without depth writes. */
  opacity?: number
  /** AO reach (m); default 6 cells. */
  aoReach?: number
  aoMin?: number
}

export interface BakedPart {
  name: string
  model: BakedModel
  /** The drawn geometry: the model's geometry, with the hull appended when asked. */
  geometry: THREE.BufferGeometry
  hull: boolean
  opacity: number
  /** Triangles without the hull. */
  triangles: number
}

export function* bakePart(r: PartRecipe, quality: Quality): Generator<void, BakedPart, void> {
  const cell = r.cell * CELL_SCALE[quality]
  let model: BakedModel
  if (r.sculpt.ops.some((o) => o.type === OpType.Add))
    model = yield* bakeModel(r.sculpt, {
      cell,
      maxTris: Math.max(24, Math.round(r.tris * TRI_SCALE[quality])),
      ao: { reach: r.aoReach ?? cell * 6, min: r.aoMin ?? 0.6 }
    })
  else {
    const regions = buildRegions(compileField(r.sculpt))
    model = { geometry: tubeGeometry([]), regions, texture: regionTexture(regions), triangles: 0 }
  }
  if (r.tubes?.length) {
    // Fewer sides at low quality, more at high.
    const extra = quality === 'low' ? -1 : quality === 'high' ? 2 : 0
    const tubes = tubeGeometry(r.tubes.map((t) => ({ ...t, sides: Math.max(4, (t.sides ?? 6) + extra) })))
    const merged = mergeGeometries([model.geometry, tubes])
    if (merged !== model.geometry) model.geometry.dispose()
    model = { ...model, geometry: merged, triangles: model.triangles + tubeTriangles(tubes) }
  }
  const hull = !!r.hull
  return {
    name: r.name,
    model,
    geometry: hull ? withHull(model.geometry) : model.geometry,
    hull,
    opacity: r.opacity ?? 1,
    triangles: model.triangles
  }
}

export function* bakeParts(list: PartRecipe[], quality: Quality): Generator<void, BakedPart[], void> {
  const out: BakedPart[] = []
  for (const r of list) {
    out.push(yield* bakePart(r, quality))
    yield
  }
  return out
}

export function disposeParts(parts: readonly BakedPart[]): void {
  for (const p of parts) {
    if (p.geometry !== p.model.geometry) p.geometry.dispose()
    p.model.geometry.dispose()
    p.model.texture.dispose()
  }
}
