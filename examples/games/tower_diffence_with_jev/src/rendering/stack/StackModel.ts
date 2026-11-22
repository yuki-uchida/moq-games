import * as THREE from 'three'
import { palette, VoxelPart, type PaletteBook, type Vec3 } from './Voxel'

/** Hierarchical parts of one sprite-stacked figure, authored in voxel cells. */
export interface StackPartSpec {
  readonly name: string
  readonly parent?: string
  /** Pivot position in the parent's cells (the root's pivot is the ground point). */
  readonly at: Vec3
  readonly voxels: VoxelPart
}
export interface StackKit {
  /** Create a part; its local cells are around its own pivot. */
  part(name: string, parent?: string, at?: Vec3): VoxelPart
}
export interface StackBlueprint {
  readonly id: string
  readonly colors: Readonly<Record<string, string>>
  /** Thin horizontal copies per voxel layer, so a low camera never sees gaps between slices. */
  readonly layerCopies?: number
  build(kit: StackKit): void
}

export interface StackPartRuntime {
  readonly name: string
  readonly parent: number
  readonly at: Vec3
  readonly min: Vec3
  readonly max: Vec3
}
export interface StackModel {
  readonly id: string
  readonly parts: readonly StackPartRuntime[]
  readonly partIndex: ReadonlyMap<string, number>
  readonly geometry: THREE.BufferGeometry
  readonly texture: THREE.DataTexture
  readonly palette: PaletteBook
  /** Retained for software painting (portraits) and tests. */
  readonly voxels: readonly VoxelPart[]
  readonly sliceCount: number
  dispose(): void
}

export const MAX_STACK_PARTS = 24

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/**
 * Baked light: tops are lit, covered cells only show as side bands, the left/back sides
 * fall into shade and silhouettes get a darker rim so stacked slices read as solid volume.
 */
export function shadeVoxel(
  part: VoxelPart,
  book: PaletteBook,
  x: number,
  y: number,
  z: number,
  color: number
): [number, number, number] {
  const [r, g, b] = hexRgb(book.colors[color])
  if (book.glow.has(color)) return [r, g, b]
  const top = !part.has(x, y + 1, z)
  const right = !part.has(x + 1, y, z)
  const left = !part.has(x - 1, y, z)
  const front = !part.has(x, y, z + 1)
  const back = !part.has(x, y, z - 1)
  let k: number
  if (top) {
    k = 1.08
    if (right || left || front || back) k = 0.96
    if (!part.has(x, y + 1, z) && part.has(x, y - 1, z) === false) k -= 0.04
  } else {
    k = 0.72
    if (front) k = 0.86
    if (right) k = Math.max(k, 0.9)
    if (left && !front && !right) k = 0.66
    if (back && !front && !right && !left) k = 0.7
  }
  // Ambient occlusion below an overhang and a faint per-cell grain.
  if (part.has(x, y + 2, z) && (front || right)) k -= 0.03
  k *= 0.97 + hash(x, y, z) * 0.06
  const lift = top ? 10 : 0
  return [clamp(r * k + lift), clamp(g * k + lift), clamp(b * k + lift * 0.8)]
}

interface Slice {
  part: number
  layer: number
  minX: number
  minZ: number
  width: number
  depth: number
  cellX: number
  cellY: number
  pixels: Uint8Array
}

export function buildStackModel(blueprint: StackBlueprint): StackModel {
  const book = palette(blueprint.colors)
  const specs: StackPartSpec[] = []
  blueprint.build({
    part(name, parent, at = [0, 0, 0]) {
      if (specs.some((spec) => spec.name === name)) throw new Error(`Duplicate stack part ${name}`)
      if (parent && !specs.some((spec) => spec.name === parent))
        throw new Error(`Stack part ${name} needs parent ${parent} first`)
      const voxels = new VoxelPart(book.index)
      specs.push({ name, parent, at, voxels })
      return voxels
    }
  })
  if (specs.length > MAX_STACK_PARTS) throw new Error(`${blueprint.id} has more than ${MAX_STACK_PARTS} parts`)
  const partIndex = new Map(specs.map((spec, i) => [spec.name, i]))
  const parts: StackPartRuntime[] = []
  const slices: Slice[] = []
  specs.forEach((spec, index) => {
    const bounds = spec.voxels.bounds() ?? {
      min: [0, 0, 0] as [number, number, number],
      max: [-1, -1, -1] as [number, number, number]
    }
    parts.push({
      name: spec.name,
      parent: spec.parent ? partIndex.get(spec.parent)! : -1,
      at: spec.at,
      min: bounds.min,
      max: bounds.max
    })
    if (!spec.voxels.size) return
    const width = bounds.max[0] - bounds.min[0] + 1
    const depth = bounds.max[2] - bounds.min[2] + 1
    const layers = new Map<number, [number, number, number, number][]>()
    for (const cell of spec.voxels.entries()) {
      const list = layers.get(cell[1]) ?? []
      list.push(cell)
      layers.set(cell[1], list)
    }
    for (const [layer, cells] of [...layers].sort((a, b) => a[0] - b[0])) {
      const pixels = new Uint8Array(width * depth * 4)
      for (const [x, y, z, color] of cells) {
        const [r, g, b] = shadeVoxel(spec.voxels, book, x, y, z, color)
        const offset = ((z - bounds.min[2]) * width + (x - bounds.min[0])) * 4
        pixels[offset] = r
        pixels[offset + 1] = g
        pixels[offset + 2] = b
        pixels[offset + 3] = 255
      }
      slices.push({
        part: index,
        layer,
        minX: bounds.min[0],
        minZ: bounds.min[2],
        width,
        depth,
        cellX: 0,
        cellY: 0,
        pixels
      })
    }
  })
  // Shelf-pack slices with one transparent texel of padding.
  const atlasWidth = Math.max(
    64,
    Math.min(
      1024,
      2 ** Math.ceil(Math.log2(Math.sqrt(slices.reduce((s, sl) => s + (sl.width + 1) * (sl.depth + 1), 0)) * 1.25 + 1))
    )
  )
  let x = 1,
    y = 1,
    row = 0
  for (const slice of [...slices].sort((a, b) => b.depth - a.depth)) {
    if (x + slice.width + 1 > atlasWidth) {
      x = 1
      y += row + 1
      row = 0
    }
    slice.cellX = x
    slice.cellY = y
    x += slice.width + 1
    row = Math.max(row, slice.depth)
  }
  const atlasHeight = Math.max(16, y + row + 1)
  const data = new Uint8Array(atlasWidth * atlasHeight * 4)
  for (const slice of slices)
    for (let j = 0; j < slice.depth; j++)
      data.set(
        slice.pixels.subarray(j * slice.width * 4, (j + 1) * slice.width * 4),
        ((slice.cellY + j) * atlasWidth + slice.cellX) * 4
      )
  const texture = new THREE.DataTexture(data, atlasWidth, atlasHeight, THREE.RGBAFormat)
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.colorSpace = THREE.NoColorSpace
  texture.name = `stack:${blueprint.id}`
  texture.needsUpdate = true

  const copies = blueprint.layerCopies ?? 3
  const positions: number[] = []
  const uvs: number[] = []
  const partAttr: number[] = []
  const indices: number[] = []
  for (const slice of slices) {
    const u0 = slice.cellX / atlasWidth,
      u1 = (slice.cellX + slice.width) / atlasWidth,
      v0 = slice.cellY / atlasHeight,
      v1 = (slice.cellY + slice.depth) / atlasHeight
    const x0 = slice.minX,
      x1 = slice.minX + slice.width,
      z0 = slice.minZ,
      z1 = slice.minZ + slice.depth
    for (let c = 0; c < copies; c++) {
      const h = slice.layer + (c + 1) / copies
      const base = positions.length / 3
      positions.push(x0, h, z0, x1, h, z0, x1, h, z1, x0, h, z1)
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1)
      partAttr.push(slice.part, slice.part, slice.part, slice.part)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('partIndex', new THREE.Float32BufferAttribute(partAttr, 1))
  geometry.setIndex(indices)
  // Animated parts leave the static bounds; actors disable culling instead.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
  return {
    id: blueprint.id,
    parts,
    partIndex,
    geometry,
    texture,
    palette: book,
    voxels: specs.map((spec) => spec.voxels),
    sliceCount: slices.length,
    dispose() {
      geometry.dispose()
      texture.dispose()
    }
  }
}
