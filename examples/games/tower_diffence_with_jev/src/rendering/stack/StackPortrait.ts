import type { StackDesign } from './StackDesign'
import { poseMatrices, type StackPose } from './StackRig'
import { bakePoseSliceSheet, drawStackPixels, MAX_STACK_PARTS, STACK_SPACING, STACK_SQUASH } from './SliceSheet'
import { stackModel } from './StackVisual'

export interface StackPaintOptions {
  /** Figure turn in radians; 0 faces the viewer (+y down), negative turns toward viewer's right. */
  readonly yaw?: number
  readonly squash?: number
  readonly spacing?: number
  readonly pose?: StackPose
  /** Fraction of the figure's height (from the top) to frame. */
  readonly crop?: number
  /** Output square size in pixels. */
  readonly size: number
  readonly padding?: number
  readonly shadow?: boolean
}

export interface StackPixelSplat {
  readonly x: number
  readonly y: number
  readonly color: string
}

/**
 * Software SpriteCook stack pixels of a design (crisp nearest-neighbor slices + 1-art-px dark outline),
 * used for UI portraits, title screen heroes, and automated pixel tests.
 */
export function stackSplats(design: StackDesign, options: Omit<StackPaintOptions, 'size'> = {}): StackPixelSplat[] {
  const model = stackModel(design)
  const sheet = options.pose
    ? bakePoseSliceSheet(model, poseMatrices(model, options.pose, new Float32Array(MAX_STACK_PARTS * 16)))
    : model.restSheet
  const rendered = drawStackPixels(sheet, {
    turn: options.yaw ?? -0.52,
    squash: options.squash ?? STACK_SQUASH,
    spacing: options.spacing ?? STACK_SPACING,
    outline: true,
    shadow: false
  })
  const list: StackPixelSplat[] = []
  for (let y = 0; y < rendered.height; y++) {
    for (let x = 0; x < rendered.width; x++) {
      const i = (y * rendered.width + x) * 4
      if (rendered.pixels[i + 3] < 128) continue
      list.push({
        x: x - rendered.originX,
        y: y - rendered.originY,
        color: `rgb(${rendered.pixels[i]},${rendered.pixels[i + 1]},${rendered.pixels[i + 2]})`
      })
    }
  }
  return list
}

/**
 * Render a SpriteCook sprite stack onto a 2D canvas with crisp nearest-neighbor integer-like scaling,
 * 1-art-px dark outline around the finished stack, and optional stepped pixel shadow.
 */
export function paintStack(context: CanvasRenderingContext2D, design: StackDesign, options: StackPaintOptions): void {
  const model = stackModel(design)
  const sheet = options.pose
    ? bakePoseSliceSheet(model, poseMatrices(model, options.pose, new Float32Array(MAX_STACK_PARTS * 16)))
    : model.restSheet
  const rendered = drawStackPixels(sheet, {
    turn: options.yaw ?? -0.52,
    squash: options.squash ?? STACK_SQUASH,
    spacing: options.spacing ?? STACK_SPACING,
    outline: true,
    shadow: options.shadow ?? true
  })

  // Measure tight opaque bounds (body + outline) so portraits frame the character cleanly.
  let minX = rendered.width,
    maxX = -1,
    minY = rendered.height,
    maxY = -1
  for (let y = 0; y < rendered.height; y++) {
    for (let x = 0; x < rendered.width; x++) {
      const i = (y * rendered.width + x) * 4
      if (rendered.pixels[i + 3] >= 128) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) return

  const crop = options.crop ?? 1
  const fullW = maxX - minX + 1
  const fullH = maxY - minY + 1
  const croppedH = Math.max(1, Math.ceil(fullH * crop))
  const padding = options.padding ?? 0.08
  const usable = options.size * (1 - padding * 2)
  const scale = Math.max(1, Math.floor(usable / Math.max(fullW, croppedH)))
  const ox = Math.floor((options.size - fullW * scale) / 2)
  const oy =
    crop < 1
      ? Math.floor(options.size * padding)
      : Math.floor((options.size - croppedH * scale) / 2)

  // Draw crisp stepped shadow first (only when full-body framing is active).
  if (options.shadow !== false && crop >= 0.99) {
    for (let y = 0; y < rendered.height; y++) {
      for (let x = 0; x < rendered.width; x++) {
        const i = (y * rendered.width + x) * 4
        if (rendered.shadow[i + 3] < 16) continue
        const dx = ox + (x - minX) * scale
        const dy = oy + (y - minY) * scale
        if (dy >= options.size || dy + scale < 0) continue
        context.fillStyle = `rgba(${rendered.shadow[i]},${rendered.shadow[i + 1]},${rendered.shadow[i + 2]},${(rendered.shadow[i + 3] / 255).toFixed(3)})`
        context.fillRect(dx, dy, scale, scale)
      }
    }
  }

  // Draw crisp body + 1-art-px outline pixels.
  for (let y = minY; y < minY + croppedH && y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * rendered.width + x) * 4
      if (rendered.pixels[i + 3] < 128) continue
      context.fillStyle = `rgb(${rendered.pixels[i]},${rendered.pixels[i + 1]},${rendered.pixels[i + 2]})`
      context.fillRect(ox + (x - minX) * scale, oy + (y - minY) * scale, scale, scale)
    }
  }
}

const portraits = new Map<string, string>()

/** Cached data URL of a design's crisp SpriteCook bust or full-body figure. */
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
    context.imageSmoothingEnabled = false
    paintStack(
      context,
      design,
      full
        ? { size, crop: 1, yaw: full.yaw, padding: 0.04, shadow: true }
        : { size, crop: design.portraitCrop ?? 0.72, yaw: design.portraitYaw ?? -0.3, padding: 0.05, shadow: false }
    )
    url = canvas.toDataURL('image/png')
  }
  portraits.set(key, url)
  return url
}
