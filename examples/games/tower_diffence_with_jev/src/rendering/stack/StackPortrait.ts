import type { StackDesign } from './StackDesign'
import { poseMatrices, type StackPose } from './StackRig'
import { bakePoseSliceSheet, drawStackPixels, MAX_STACK_PARTS, STACK_SPACING, STACK_SQUASH } from './SliceSheet'
import { stackModel } from './StackVisual'

/** Lower portrait camera squash so faces and busts read heroically instead of looking down at hats. */
export const PORTRAIT_SQUASH = 0.48

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
  const pose = options.pose ?? design.portraitPose
  const sheet = pose
    ? bakePoseSliceSheet(model, poseMatrices(model, pose, new Float32Array(MAX_STACK_PARTS * 16)))
    : model.restSheet
  const rendered = drawStackPixels(sheet, {
    turn: options.yaw ?? design.portraitYaw ?? -0.35,
    squash: options.squash ?? design.portraitSquash ?? PORTRAIT_SQUASH,
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
 * Render a SpriteCook sprite stack onto a 2D canvas with crisp nearest-neighbor scaling,
 * framing strictly by the cropped bust bounds so every portrait has consistent face scale
 * and fits cleanly inside circular UI badges without clipping wings or horns.
 */
export function paintStack(context: CanvasRenderingContext2D, design: StackDesign, options: StackPaintOptions): void {
  const model = stackModel(design)
  const pose = options.pose ?? (options.crop === undefined || options.crop < 0.99 ? design.portraitPose : undefined)
  const sheet = pose
    ? bakePoseSliceSheet(model, poseMatrices(model, pose, new Float32Array(MAX_STACK_PARTS * 16)))
    : model.restSheet
  const rendered = drawStackPixels(sheet, {
    turn: options.yaw ?? design.portraitYaw ?? -0.35,
    squash: options.squash ?? design.portraitSquash ?? PORTRAIT_SQUASH,
    spacing: options.spacing ?? STACK_SPACING,
    outline: true,
    shadow: options.shadow ?? true
  })

  // First find vertical span of opaque pixels to determine the bust crop window.
  let topY = rendered.height,
    botY = -1
  for (let y = 0; y < rendered.height; y++) {
    for (let x = 0; x < rendered.width; x++) {
      if (rendered.pixels[(y * rendered.width + x) * 4 + 3] >= 128) {
        if (y < topY) topY = y
        if (y > botY) botY = y
      }
    }
  }
  if (botY < topY) return

  const crop = options.crop ?? 1
  const fullH = botY - topY + 1
  const cropBottom = Math.min(botY, topY + Math.max(1, Math.ceil(fullH * crop)) - 1)

  // Measure horizontal bounds strictly inside the cropped bust window so wide legs/weapons don't shrink faces!
  let minX = rendered.width,
    maxX = -1
  for (let y = topY; y <= cropBottom; y++) {
    for (let x = 0; x < rendered.width; x++) {
      if (rendered.pixels[(y * rendered.width + x) * 4 + 3] >= 128) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
    }
  }
  if (maxX < minX) return

  const cropW = maxX - minX + 1
  const cropH = cropBottom - topY + 1
  const padding = options.padding ?? 0.06
  const usable = options.size * (1 - padding * 2)
  // Inscribe cleanly inside circular badges with consistent 65-80% fill across busts & monsters.
  const circleDiameter = options.size * (1 - padding * 1.15)
  const rawScale = Math.min(usable / Math.max(cropW, cropH), circleDiameter / Math.hypot(cropW, cropH))
  const scale = rawScale >= 2 ? Math.floor(rawScale * 2) / 2 : Math.max(1, rawScale)
  const ox = Math.floor((options.size - cropW * scale) / 2)
  const oy = Math.floor((options.size - cropH * scale) / 2)

  // Draw crisp stepped shadow when framing the full body (e.g. title screen heroes).
  if (options.shadow !== false && crop >= 0.99) {
    for (let y = 0; y < rendered.height; y++) {
      for (let x = 0; x < rendered.width; x++) {
        const i = (y * rendered.width + x) * 4
        if (rendered.shadow[i + 3] < 16) continue
        const dx = Math.floor(ox + (x - minX) * scale)
        const dy = Math.floor(oy + (y - topY) * scale)
        if (dy >= options.size || dy + scale < 0) continue
        context.fillStyle = `rgba(${rendered.shadow[i]},${rendered.shadow[i + 1]},${rendered.shadow[i + 2]},${(rendered.shadow[i + 3] / 255).toFixed(3)})`
        context.fillRect(dx, dy, Math.ceil(scale), Math.ceil(scale))
      }
    }
  }

  for (let y = topY; y <= cropBottom; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = (y * rendered.width + x) * 4
      if (rendered.pixels[i + 3] < 128) continue
      context.fillStyle = `rgb(${rendered.pixels[i]},${rendered.pixels[i + 1]},${rendered.pixels[i + 2]})`
      context.fillRect(
        Math.floor(ox + (x - minX) * scale),
        Math.floor(oy + (y - topY) * scale),
        Math.ceil(scale),
        Math.ceil(scale)
      )
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
        ? { size, crop: 1, yaw: full.yaw, squash: STACK_SQUASH, padding: 0.04, shadow: true }
        : {
            size,
            crop: design.portraitCrop ?? 0.64,
            yaw: design.portraitYaw ?? -0.32,
            squash: design.portraitSquash ?? PORTRAIT_SQUASH,
            padding: 0.06,
            shadow: false
          }
    )
    url = canvas.toDataURL('image/png')
  }
  portraits.set(key, url)
  return url
}
