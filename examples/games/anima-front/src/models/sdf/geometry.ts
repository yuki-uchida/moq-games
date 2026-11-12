/** MeshData → THREE.BufferGeometry, plus helpers shared by characters and antiques. */
import * as THREE from 'three'
import { compileField } from './field'
import { meshField, type MeshData, type MeshOptions } from './mesher'
import { buildRegions, regionTexture, type RegionTable } from './regions'
import type { Sculpt } from './sculpt'
import { simplify } from './simplify'

export function toGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3))
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3))
  g.setAttribute('markColor', new THREE.BufferAttribute(m.marks, 4))
  g.setAttribute('ao', new THREE.BufferAttribute(m.ao, 1))
  g.setAttribute('regionFilter', new THREE.BufferAttribute(new Float32Array(m.vertexCount * 4), 4))
  g.setAttribute('animaMask', new THREE.BufferAttribute(m.masks, 4))
  if (m.skinIndex && m.skinWeight) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.skinIndex, 4))
    g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4))
  }
  g.setIndex(new THREE.BufferAttribute(m.vertexCount > 65535 ? m.index : Uint16Array.from(m.index), 1))
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** A baked rigid SDF model: geometry plus its shader paint regions. */
export interface BakedModel {
  geometry: THREE.BufferGeometry
  regions: RegionTable
  texture: THREE.DataTexture
  triangles: number
  /** Distance level of detail (same regions), when asked for with `lodTris`. */
  lod?: { geometry: THREE.BufferGeometry; triangles: number }
}

/**
 * Meshes a rigid sculpt with shader-drawn markings: colours/masks of paint and emboss ops become regions, the
 * mesh is simplified to `maxTris` (geometry seams keep their vertex colour edges).
 */
export function* bakeModel(
  sculpt: Sculpt,
  opts: { cell: number; maxTris: number; ao?: MeshOptions['ao']; lodTris?: number }
): Generator<void, BakedModel, void> {
  const field = compileField(sculpt)
  const meshAt = (cell: number) =>
    meshField(field, { cell, regions: true, ao: opts.ao ?? { reach: opts.cell * 6, min: 0.62 } })
  let mesh = yield* meshAt(opts.cell)
  // Keep decimation mild (≤ ~3×): heavy reduction cuts corners off round shapes.
  if (mesh.triangleCount > opts.maxTris * 3.2)
    mesh = yield* meshAt(opts.cell * Math.sqrt(mesh.triangleCount / (opts.maxTris * 2.6)))
  const reduced = simplify(mesh, opts.maxTris)
  const regions = buildRegions(field)
  const model: BakedModel = {
    geometry: toGeometry(reduced),
    regions,
    texture: regionTexture(regions),
    triangles: reduced.triangleCount
  }
  if (opts.lodTris !== undefined) {
    yield
    const low = opts.lodTris < reduced.triangleCount ? simplify(reduced, opts.lodTris) : reduced
    model.lod = { geometry: low === reduced ? model.geometry : toGeometry(low), triangles: low.triangleCount }
  }
  return model
}

/** FNV-1a hash over a geometry's attribute bytes (determinism tests). */
export function geometryHash(g: THREE.BufferGeometry): string {
  let h = 0x811c9dc5
  const feed = (arr: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i]
      h = Math.imul(h, 0x01000193)
    }
  }
  for (const name of ['position', 'normal', 'color', 'markColor', 'ao', 'animaMask', 'skinIndex', 'skinWeight']) {
    const a = g.getAttribute(name)
    if (a) feed(a.array as Float32Array)
  }
  const idx = g.getIndex()
  if (idx) feed(idx.array as Uint16Array)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Triangle count of a geometry (indexed or not). */
export const triangles = (g: THREE.BufferGeometry) => (g.getIndex()?.count ?? g.getAttribute('position').count) / 3

/** Rebuilds mesh data from a baked geometry (to simplify it further, e.g. for a level of detail). */
export function fromGeometry(g: THREE.BufferGeometry): MeshData {
  const arr = (name: string) => (g.getAttribute(name) as THREE.BufferAttribute | undefined)?.array as Float32Array
  const n = g.getAttribute('position').count
  const index = Uint32Array.from(g.getIndex()!.array as ArrayLike<number>)
  const box =
    g.boundingBox ?? new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute)
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute | undefined
  return {
    positions: Float32Array.from(arr('position')),
    normals: Float32Array.from(arr('normal')),
    colors: Float32Array.from(arr('color')),
    marks: Float32Array.from(arr('markColor')),
    ao: Float32Array.from(arr('ao')),
    masks: Float32Array.from(arr('animaMask')),
    skinIndex: si ? Uint16Array.from(si.array as ArrayLike<number>) : null,
    skinWeight: si ? Float32Array.from(arr('skinWeight')) : null,
    index,
    vertexCount: n,
    triangleCount: index.length / 3,
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z]
  }
}

/** A lighter copy of a baked geometry (null when it is already light enough). */
export function lighterGeometry(g: THREE.BufferGeometry, tris: number): THREE.BufferGeometry | null {
  const n = (g.getIndex()?.count ?? 0) / 3
  if (n <= tris * 1.15) return null
  return toGeometry(simplify(fromGeometry(g), tris))
}
