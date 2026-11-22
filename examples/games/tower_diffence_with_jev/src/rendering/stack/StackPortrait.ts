import { MAX_STACK_PARTS, shadeVoxel } from './StackModel'
import { poseMatrices, type StackPose } from './StackRig'
import type { StackDesign } from './StackDesign'
import { stackModel, STACK_ELEVATION } from './StackVisual'

export interface StackPaintOptions {
  /** Figure turn; 0 faces the viewer, positive turns the front toward the viewer's right. */
  readonly yaw?: number
  readonly elevation?: number
  readonly pose?: StackPose
  /** Fraction of the figure's height (from the top) to frame. */
  readonly crop?: number
  /** Output square size in pixels. */
  readonly size: number
  readonly padding?: number
}

interface Splat {
  x: number
  y: number
  depth: number
  color: string
}

/** Software voxel splatting of a sprite-stacked design (UI portraits, title art, tests). */
export function stackSplats(design: StackDesign, options: Omit<StackPaintOptions, 'size'> = {}): Splat[] {
  const model = stackModel(design)
  const pose =
    options.pose ??
    design.pose({ motion: 'idle', seconds: 0, cycle: 0, time: 0.6, durationMs: 900, cueMs: 450, seed: 0.25 })
  const matrices = poseMatrices(model, pose, new Float32Array(MAX_STACK_PARTS * 16))
  const yaw = options.yaw ?? -0.55
  const e = options.elevation ?? STACK_ELEVATION
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    ce = Math.cos(e),
    se = Math.sin(e)
  const splats: Splat[] = []
  model.voxels.forEach((part, index) => {
    const m = matrices.subarray(index * 16, index * 16 + 16)
    for (const [x, y, z, color] of part.entries()) {
      const [r, g, b] = shadeVoxel(part, model.palette, x, y, z, color)
      const px = x + 0.5,
        py = y + 0.5,
        pz = z + 0.5
      const wx = m[0] * px + m[4] * py + m[8] * pz + m[12]
      const wy = m[1] * px + m[5] * py + m[9] * pz + m[13]
      const wz = m[2] * px + m[6] * py + m[10] * pz + m[14]
      const rx = cy * wx + sy * wz
      const rz = -sy * wx + cy * wz
      splats.push({ x: rx, y: -ce * wy + se * rz, depth: se * wy + ce * rz, color: `rgb(${r},${g},${b})` })
    }
  })
  return splats.sort((a, b) => a.depth - b.depth)
}

export function paintStack(context: CanvasRenderingContext2D, design: StackDesign, options: StackPaintOptions): void {
  const splats = stackSplats(design, options)
  if (!splats.length) return
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const s of splats) {
    minX = Math.min(minX, s.x)
    maxX = Math.max(maxX, s.x)
    minY = Math.min(minY, s.y)
    maxY = Math.max(maxY, s.y)
  }
  const crop = options.crop ?? 1
  const bottom = minY + (maxY - minY) * crop
  const width = maxX - minX + 1
  const height = bottom - minY + 1
  const padding = options.padding ?? 0.08
  const scale = (options.size * (1 - padding * 2)) / Math.max(width, height)
  const ox = (options.size - width * scale) / 2 - minX * scale
  const oy = crop < 1 ? options.size * padding - minY * scale : (options.size - height * scale) / 2 - minY * scale
  const cell = scale * 1.18
  for (const s of splats) {
    if (s.y > bottom + 1) continue
    context.fillStyle = s.color
    context.fillRect(
      Math.floor(ox + s.x * scale - cell / 2),
      Math.floor(oy + s.y * scale - cell / 2),
      Math.ceil(cell),
      Math.ceil(cell)
    )
  }
}

const portraits = new Map<string, string>()
/** Cached data URL of a design's bust; empty when no canvas is available. */
export function stackPortrait(design: StackDesign | undefined, size = 128, full?: { yaw: number }): string {
  if (!design || typeof document === 'undefined') return ''
  const key = `${design.type}:${size}:${full?.yaw ?? 'bust'}`
  const cached = portraits.get(key)
  if (cached !== undefined) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  let url = ''
  if (context) {
    paintStack(
      context,
      design,
      full
        ? { size, crop: 1, yaw: full.yaw, padding: 0.02 }
        : { size, crop: design.portraitCrop ?? 0.78, yaw: design.portraitYaw }
    )
    url = canvas.toDataURL('image/png')
  }
  portraits.set(key, url)
  return url
}
