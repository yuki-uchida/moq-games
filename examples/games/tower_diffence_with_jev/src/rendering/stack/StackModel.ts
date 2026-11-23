import * as THREE from 'three'
import { palette, VoxelPart, type PaletteBook, type Vec3 } from './Voxel'
import {
  bakePoseSliceSheet,
  MAX_STACK_PARTS,
  MAX_STACK_SLICES,
  shadeSliceColor,
  STACK_SPACING,
  STACK_SQUASH,
  type SliceSheet
} from './SliceSheet'
import type { StackDesign, StackMotion } from './StackDesign'
import { poseMatrices, type StackPose } from './StackRig'

export { MAX_STACK_PARTS }

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
  /** Retained for blueprint compatibility; true slice sheets use 1 slice per art-pixel layer. */
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
  /** Retained for software painting (portraits), baking slice sheets, and tests. */
  readonly voxels: readonly VoxelPart[]
  readonly sliceCount: number
  /** Rest-pose SpriteCook horizontal slice sheet (ground slice on left, facing +y down). */
  readonly restSheet: SliceSheet
  /** Damp the per-voxel light dither for this design (see StackDesign.softShade). */
  softShade?: boolean
  /** Use a single ellipse contact shadow (see StackDesign.simpleShadow). */
  simpleShadow?: boolean
  dispose(): void
}

export interface StackMotionBand {
  readonly offset: number
  readonly frames: number
}

/**
 * Multi-frame SpriteCook slice-sheet atlas for one animated design:
 * each row is one animation frame's horizontal slice strip (`count` slices + 1 shadow union slice).
 */
export interface StackFrameAtlas {
  readonly sliceWidth: number
  readonly sliceHeight: number
  readonly sliceCount: number
  readonly baseLift: number
  readonly cx: number
  readonly cy: number
  readonly frameCount: number
  readonly atlasWidth: number
  readonly atlasHeight: number
  readonly texture: THREE.DataTexture
  readonly bands: Readonly<Record<StackMotion, StackMotionBand>>
  readonly sheets: readonly SliceSheet[]
  /** Projected opaque top (art px above the feet) per frame, including the stack lift. */
  readonly frameHeights: readonly number[]
  /**
   * Projected opaque top per frame per 16 turn buckets. The sheet row is measured flat, so a
   * rotated slice projects its far edge higher on screen; this pre-computed ring keeps a nameplate
   * gap constant for every facing instead of letting it drift by up to a dozen pixels.
   */
  readonly frameTops: readonly Float64Array[]
  dispose(): void
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Clean SpriteCook top-vs-side voxel shading (flat fills, height-based side darkening, no noisy grain).
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
  const bounds = part.bounds()
  const height = bounds ? Math.max(1, bounds.max[1] - bounds.min[1] + 1) : 16
  const layer = bounds ? Math.max(0, y - bounds.min[1]) : Math.max(0, y)
  return shadeSliceColor(r, g, b, !part.has(x, y + 1, z), layer, height, book.glow.has(color))
}

function packSheetsToTexture(sheets: readonly SliceSheet[]): {
  texture: THREE.DataTexture
  atlasWidth: number
  atlasHeight: number
} {
  const first = sheets[0]
  const w = first.width
  const h = first.height
  const count = first.count
  // Extra column at index `count` holds the union ground-projection shadow footprint.
  const atlasWidth = w * (count + 1)
  const atlasHeight = h * sheets.length
  const data = new Uint8Array(atlasWidth * atlasHeight * 4)

  for (let f = 0; f < sheets.length; f++) {
    const sheet = sheets[f]
    const stripW = w * count
    for (let sy = 0; sy < h; sy++) {
      const dstRow = (f * h + sy) * atlasWidth * 4
      const srcRow = sy * stripW * 4
      data.set(sheet.pixels.subarray(srcRow, srcRow + stripW * 4), dstRow)
      // Shadow grounded footprint in column `count` (r = 255 core, 160 soft rim).
      const shadowBase = dstRow + stripW * 4
      for (let sx = 0; sx < w; sx++) {
        const sv = sheet.shadow[sy * w + sx]
        if (sv >= 128) {
          const o = shadowBase + sx * 4
          data[o] = sv
          data[o + 1] = sv
          data[o + 2] = sv
          data[o + 3] = 255
        }
      }
    }
  }

  const texture = new THREE.DataTexture(data, atlasWidth, atlasHeight, THREE.RGBAFormat)
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return { texture, atlasWidth, atlasHeight }
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
  const parts: StackPartRuntime[] = specs.map((spec) => {
    const bounds = spec.voxels.bounds() ?? {
      min: [0, 0, 0] as [number, number, number],
      max: [-1, -1, -1] as [number, number, number]
    }
    return {
      name: spec.name,
      parent: spec.parent ? partIndex.get(spec.parent)! : -1,
      at: spec.at,
      min: bounds.min,
      max: bounds.max
    }
  })

  const tempModel: StackModel = {
    id: blueprint.id,
    parts,
    partIndex,
    geometry: new THREE.PlaneGeometry(1, 1),
    texture: new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat),
    palette: book,
    voxels: specs.map((spec) => spec.voxels),
    sliceCount: 1,
    restSheet: {
      width: 2,
      height: 2,
      count: 1,
      cx: 1,
      cy: 1,
      baseLift: 0,
      pixels: new Uint8ClampedArray(16),
      shadow: new Uint8Array(4)
    },
    dispose() {}
  }

  const restSheet = bakePoseSliceSheet(tempModel, poseMatrices(tempModel, {}, new Float32Array(MAX_STACK_PARTS * 16)))
  const { texture } = packSheetsToTexture([restSheet])
  texture.name = `stack:${blueprint.id}`
  tempModel.texture.dispose()
  const geometry = new THREE.PlaneGeometry(1, 1)

  return {
    id: blueprint.id,
    parts,
    partIndex,
    geometry,
    texture,
    palette: book,
    voxels: tempModel.voxels,
    sliceCount: restSheet.count,
    restSheet,
    dispose() {
      geometry.dispose()
      texture.dispose()
    }
  }
}

const MOTION_FRAMES: Readonly<Record<StackMotion, number>> = {
  idle: 4,
  walk: 6,
  attack: 6,
  heal: 6,
  breath: 6,
  special: 4,
  death: 1
}

function sampleMotionPose(design: StackDesign, motion: StackMotion, index: number, total: number): StackPose {
  if (motion === 'death') {
    return design.pose({ motion: 'idle', seconds: 0, cycle: 0, time: 0, durationMs: 900, cueMs: 450, seed: 0.25 })
  }
  const f = total > 1 ? index / total : 0
  if (motion === 'idle') {
    return design.pose({
      motion: 'idle',
      seconds: f * 2.2,
      cycle: 0,
      time: f * 2.2,
      durationMs: 900,
      cueMs: 450,
      seed: 0
    })
  }
  if (motion === 'walk') {
    return design.pose({
      motion: 'walk',
      seconds: f,
      cycle: f,
      time: f,
      durationMs: 900,
      cueMs: 450,
      seed: 0
    })
  }
  if (motion === 'special') {
    const t = total > 1 ? (index / (total - 1)) * 1.3 : 0.4
    return design.pose({
      motion: 'special',
      seconds: t,
      cycle: 0,
      time: t,
      durationMs: 1400,
      cueMs: 500,
      seed: 0
    })
  }
  // Attack / heal / breath: distribute keyframes tightly around the strike cue (0.5).
  const keys = [0.05, 0.28, 0.5, 0.65, 0.82, 0.96]
  const frac = keys[index % keys.length]
  const durationMs = 1000
  const cueMs = 500
  return design.pose({
    motion,
    seconds: (frac * durationMs) / 1000,
    cycle: 0,
    time: (frac * durationMs) / 1000,
    durationMs,
    cueMs,
    seed: 0
  })
}

/**
 * Build one unified SpriteCook slice-sheet atlas containing all animation keyframes for a design.
 * All frames share identical `(sliceWidth, sliceHeight, sliceCount)` so switching animation frames
 * is a zero-allocation uniform update (`uFrame`).
 */
export function buildStackFrameAtlas(design: StackDesign, model: StackModel): StackFrameAtlas {
  const isProp = design.type.startsWith('prop:')
  const motions: StackMotion[] = isProp
    ? ['idle']
    : design.type === 'dragon'
      ? ['idle', 'walk', 'attack', 'breath']
      : design.type === 'healer'
        ? ['idle', 'walk', 'heal', 'special']
        : ['idle', 'walk', 'attack', 'special']

  const entries: { motion: StackMotion; pose: StackPose }[] = []
  const bandMap: Partial<Record<StackMotion, StackMotionBand>> = {}

  for (const motion of motions) {
    const frames = isProp ? 1 : MOTION_FRAMES[motion]
    bandMap[motion] = { offset: entries.length, frames }
    for (let i = 0; i < frames; i++) {
      entries.push({ motion, pose: sampleMotionPose(design, motion, i, frames) })
    }
  }

  // First pass: measure max dimensions across all frames so every frame fits in one shared slice size.
  const entryMatrices = entries.map(({ pose }) => poseMatrices(model, pose, new Float32Array(MAX_STACK_PARTS * 16)))
  const rawSheets = entryMatrices.map((m) => bakePoseSliceSheet(model, m))
  let maxW = model.restSheet.width
  let maxH = model.restSheet.height
  let minLift = model.restSheet.baseLift
  let maxTop = model.restSheet.baseLift + model.restSheet.count - 1
  for (const sh of rawSheets) {
    if (sh.width > maxW) maxW = sh.width
    if (sh.height > maxH) maxH = sh.height
    if (sh.baseLift < minLift) minLift = sh.baseLift
    const top = sh.baseLift + sh.count - 1
    if (top > maxTop) maxTop = top
  }
  const sliceCount = Math.min(MAX_STACK_SLICES, Math.max(1, maxTop - minLift + 1))

  // Re-bake only frames whose bounds differed from the unified envelope (fast: most already match).
  const sheets = entryMatrices.map((m, idx) => {
    const s = rawSheets[idx]
    if (s.width === maxW && s.height === maxH && s.count === sliceCount && s.baseLift === minLift) return s
    return bakePoseSliceSheet(model, m, { width: maxW, height: maxH, count: sliceCount, minY: minLift })
  })

  // Project the real top: the highest slice lift plus that slice's maximum vertical radius.
  const frameHeights = sheets.map((sheet) => {
    let top = 0
    for (let slice = 0; slice < sheet.count; slice++) {
      let minY = sheet.height
      for (let y = 0; y < sheet.height; y++)
        for (let x = slice * sheet.width; x < (slice + 1) * sheet.width; x++)
          if (sheet.pixels[(y * sheet.width * sheet.count + x) * 4 + 3] >= 128) {
            if (y < minY) minY = y
            break
          }
      if (minY < sheet.height)
        top = Math.max(top, (sheet.baseLift + slice) * STACK_SPACING + (sheet.height / 2 - minY))
    }
    return top
  })
  // Per-turn projected top: the flat sheet row understates a rotated slice by (1 - cos) * depth,
  // which is what made the nameplate gap drift between facings. Support each slice's boundary
  // pixels in 16 directions so the bar can sit at one fixed gap above the true silhouette.
  const turnBuckets = 16
  const turnSin = new Float64Array(turnBuckets)
  const turnCos = new Float64Array(turnBuckets)
  for (let b = 0; b < turnBuckets; b++) {
    const turn = (b / turnBuckets) * Math.PI * 2
    turnSin[b] = Math.sin(turn)
    turnCos[b] = Math.cos(turn)
  }
  const frameTops = sheets.map((sheet) => {
    const tops = new Float64Array(turnBuckets)
    const stride = sheet.width * sheet.count
    for (let slice = 0; slice < sheet.count; slice++) {
      const lift = (sheet.baseLift + slice) * STACK_SPACING
      const base = slice * sheet.width
      for (let y = 0; y < sheet.height; y++) {
        for (let x = 0; x < sheet.width; x++) {
          const index = y * stride + base + x
          if (sheet.pixels[index * 4 + 3] < 128) continue
          // Interior pixels can never own the silhouette, so only the boundary is supported.
          if (
            x > 0 &&
            x + 1 < sheet.width &&
            y > 0 &&
            y + 1 < sheet.height &&
            sheet.pixels[(index - 1) * 4 + 3] >= 128 &&
            sheet.pixels[(index + 1) * 4 + 3] >= 128 &&
            sheet.pixels[(index - stride) * 4 + 3] >= 128 &&
            sheet.pixels[(index + stride) * 4 + 3] >= 128
          )
            continue
          const localX = x - sheet.cx
          const localY = y - sheet.cy
          for (let b = 0; b < turnBuckets; b++) {
            const top = lift - (turnSin[b] * localX + turnCos[b] * localY) * STACK_SQUASH
            if (top > tops[b]) tops[b] = top
          }
        }
      }
    }
    return tops
  })
  const { texture, atlasWidth, atlasHeight } = packSheetsToTexture(sheets)
  texture.name = `stack-atlas:${design.blueprint.id}`

  const idleBand = bandMap.idle ?? { offset: 0, frames: 1 }
  const attackBand = bandMap.attack ?? bandMap.heal ?? idleBand
  const bands: Record<StackMotion, StackMotionBand> = {
    idle: idleBand,
    walk: bandMap.walk ?? idleBand,
    attack: attackBand,
    heal: bandMap.heal ?? attackBand,
    breath: bandMap.breath ?? attackBand,
    special: bandMap.special ?? attackBand,
    death: idleBand
  }

  return {
    sliceWidth: maxW,
    sliceHeight: maxH,
    sliceCount,
    baseLift: minLift,
    cx: Math.floor(maxW / 2),
    cy: Math.floor(maxH / 2),
    frameCount: sheets.length,
    frameHeights,
    frameTops,
    atlasWidth,
    atlasHeight,
    texture,
    bands,
    sheets,
    dispose() {
      texture.dispose()
    }
  }
}
