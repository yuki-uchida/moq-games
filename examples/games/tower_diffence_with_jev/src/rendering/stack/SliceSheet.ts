import type { PaletteBook, Vec3, VoxelPart } from './Voxel'

/** Default vertical squash from SpriteCook's guide: 1 looks straight down, 0.75 is a lower camera. */
export const STACK_SQUASH = 0.75
/** Default vertical lift per slice in art pixels. */
export const STACK_SPACING = 1.0
/** Maximum slice height supported by the stack shader (supports 2x high-density characters). */
export const MAX_STACK_SLICES = 80
/** Maximum hierarchical parts supported per blueprint. */
export const MAX_STACK_PARTS = 24

export interface BakeablePart {
  readonly min: Vec3
  readonly max: Vec3
}

export interface BakeableModel {
  readonly parts: readonly BakeablePart[]
  readonly voxels: readonly VoxelPart[]
  readonly palette: PaletteBook
  readonly density?: number
  readonly softShade?: boolean
  readonly simpleShadow?: boolean
}

/**
 * One SpriteCook-format horizontal slice sheet: `count` equal slices of `width x height` art pixels,
 * ground slice (`z = 0`) on the left, top slice (`z = count - 1`) on the right.
 * In slice coordinates, the object faces DOWN (`+y`).
 */
export interface SliceSheet {
  readonly width: number
  readonly height: number
  readonly count: number
  /** Slice pivot in slice pixel coordinates: `(floor(w / 2), floor(h / 2))`. */
  readonly cx: number
  readonly cy: number
  /** Lowest voxel layer represented by slice 0 (0 for grounded objects, >0 for flyers). */
  readonly baseLift: number
  /** Voxel sub-resolution multiplier (1 = standard, 2 = 2x high-density art pixels). */
  readonly density?: number
  /** Horizontal strip RGBA bytes: `(width * count) x height x 4`. */
  readonly pixels: Uint8ClampedArray
  /** Compact grounded contact-shadow footprint mask (`width x height`, 255 = core, 160 = rim, 0 = empty). */
  readonly shadow: Uint8Array
}

export interface RenderedStack {
  readonly width: number
  readonly height: number
  /** Ground pivot in output pixel coordinates (center X, ground Y). */
  readonly originX: number
  readonly originY: number
  /** Body + optional 1-art-px exterior outline & internal depth-step crease lines. */
  readonly pixels: Uint8ClampedArray
  /** Crisp 2-tone stepped pixel-art contact shadow RGBA bytes (same dimensions as `pixels`). */
  readonly shadow: Uint8ClampedArray
}

export interface DrawStackOptions {
  /** Rotation in radians; 0 draws the slices facing down (+y) as authored in the sheet. */
  readonly turn?: number
  /** Vertical squash factor (1 = straight down, 0.75 = lower camera, 0.48 = portrait bust). */
  readonly squash?: number
  /** Screen/art pixels between consecutive slices (`round(z * spacing)`). */
  readonly spacing?: number
  /** Apply a crisp 1-art-px dark outline ONCE around the finished stack + subtle internal creases. */
  readonly outline?: boolean
  /** Generate the crisp stepped pixel-art ground shadow mask. */
  readonly shadow?: boolean
  /** Shadow pixel offset `(dx, dy)` in art pixels. */
  readonly shadowOffset?: readonly [number, number]
  /** Optional sideways fall angle in radians around the ground pivot. */
  readonly fall?: number
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Crisp hue-harmonized dark ink derived from a neighboring pixel color: keeps 100% silhouette
 * clarity while warming gold/peach/red borders and deepening cool steel/indigo edges.
 */
export function outlineColorFor(r: number, g: number, b: number): [number, number, number] {
  return [
    clamp255(18 * 0.48 + r * 0.28 * 0.52),
    clamp255(14 * 0.48 + g * 0.24 * 0.52),
    clamp255(30 * 0.48 + b * 0.30 * 0.52)
  ]
}

/** Internal depth-step crease ink: subtle contour separating major overlapping volumes without cluttering thin parts. */
function creaseColorFor(r: number, g: number, b: number): [number, number, number] {
  const [or, og, ob] = outlineColorFor(r, g, b)
  return [
    clamp255(r * 0.70 + or * 0.30),
    clamp255(g * 0.70 + og * 0.30),
    clamp255(b * 0.70 + ob * 0.30)
  ]
}

/**
 * Commercial 16-bit pixel-art hue-shifted 4-level directional ramp shading:
 * - Warm tones (skin, gold, crimson, wood): highlights shift warm cream-gold, shadows shift rich
 *   rose-terracotta/plum-ruby instead of turning muddy olive or grey.
 * - Greens (slime, goblin, foliage): highlights shift sunlit chartreuse, shadows shift emerald-teal.
 * - Cool tones (steel, sapphire, purple, stone): highlights shift sky-white, shadows shift deep indigo.
 */
export function shadeSliceColor(
  r: number,
  g: number,
  b: number,
  topExposed: boolean,
  z: number,
  height: number,
  glow: boolean,
  shade = 0.28,
  lightBias = 0,
  occluded = false
): [number, number, number] {
  if (glow) return [r, g, b]
  if (shade <= 0) return [r, g, b]

  // Quantize into 4 clean discrete pixel-art ramp levels instead of a smooth vertical gradient.
  let band: 0 | 1 | 2 | 3
  if (topExposed) {
    if (occluded) band = 2
    else band = lightBias > 0.2 ? 0 : 1
  } else {
    const hNorm = height > 1 ? z / (height - 1) : 1
    if (hNorm < 0.22) band = 3
    else if (occluded) band = 2
    else if (lightBias > 0.1 && hNorm >= 0.32) band = 1
    else band = 2
  }

  if (band === 1) return [r, g, b]

  const isWarm = r > b + 28 && r >= g - 8
  const isGreen = !isWarm && g >= r + 14 && g >= b + 10

  if (band === 0) {
    if (isWarm) return [clamp255(r * 1.08 + 7), clamp255(g * 1.08 + 5), clamp255(b * 1.02 + 2)]
    if (isGreen) return [clamp255(r * 1.10 + 6), clamp255(g * 1.08 + 5), clamp255(b * 0.98 + 1)]
    return [clamp255(r * 1.06 + 6), clamp255(g * 1.07 + 7), clamp255(b * 1.09 + 8)]
  }
  if (band === 2) {
    if (isWarm) return [clamp255(r * 0.84), clamp255(g * 0.74), clamp255(b * 0.79 + 5)]
    if (isGreen) return [clamp255(r * 0.72), clamp255(g * 0.83), clamp255(b * 0.92 + 6)]
    return [clamp255(r * 0.76), clamp255(g * 0.80), clamp255(b * 0.90 + 5)]
  }
  // band === 3: deep grounded shadow / AO
  if (isWarm) return [clamp255(r * 0.65), clamp255(g * 0.54), clamp255(b * 0.64 + 8)]
  if (isGreen) return [clamp255(r * 0.52), clamp255(g * 0.65), clamp255(b * 0.80 + 8)]
  return [clamp255(r * 0.56), clamp255(g * 0.61), clamp255(b * 0.76 + 7)]
}

/**
 * Bake a posed hierarchical voxel model into a genuine horizontal SpriteCook `SliceSheet`.
 *
 * Uses watertight inverse-mapped voxelization per part so rotated arms/weapons/wings never
 * splinter into floating tilted cards or leave 1-voxel pinholes; every layer is a clean flat
 * horizontal slice, facing DOWN (`+y`) in slice space, shaded with quantized directional pixel-art ramps.
 */
export function bakePoseSliceSheet(
  model: BakeableModel,
  matrices: Float32Array,
  options: {
    readonly width?: number
    readonly height?: number
    readonly count?: number
    readonly minY?: number
    readonly shade?: number
  } = {}
): SliceSheet {
  const shade = options.shade ?? 0.28

  interface PartBox {
    index: number
    x0: number
    x1: number
    y0: number
    y1: number
    z0: number
    z1: number
    inv: Float64Array
  }
  const boxes: PartBox[] = []
  let gMinX = Infinity,
    gMaxX = -Infinity,
    gMinY = Infinity,
    gMaxY = -Infinity,
    gMinZ = Infinity,
    gMaxZ = -Infinity

  for (let i = 0; i < model.parts.length; i++) {
    const part = model.parts[i]
    if (part.max[0] < part.min[0] || !model.voxels[i].size) continue
    const o = i * 16
    const m0 = matrices[o],
      m1 = matrices[o + 1],
      m2 = matrices[o + 2],
      m4 = matrices[o + 4],
      m5 = matrices[o + 5],
      m6 = matrices[o + 6],
      m8 = matrices[o + 8],
      m9 = matrices[o + 9],
      m10 = matrices[o + 10],
      m12 = matrices[o + 12],
      m13 = matrices[o + 13],
      m14 = matrices[o + 14]
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity
    for (const lx of [part.min[0], part.max[0] + 1])
      for (const ly of [part.min[1], part.max[1] + 1])
        for (const lz of [part.min[2], part.max[2] + 1]) {
          const wx = m0 * lx + m4 * ly + m8 * lz + m12
          const wy = m1 * lx + m5 * ly + m9 * lz + m13
          const wz = m2 * lx + m6 * ly + m10 * lz + m14
          if (wx < x0) x0 = wx
          if (wx > x1) x1 = wx
          if (wy < y0) y0 = wy
          if (wy > y1) y1 = wy
          if (wz < z0) z0 = wz
          if (wz > z1) z1 = wz
        }
    const det = m0 * (m5 * m10 - m6 * m9) - m4 * (m1 * m10 - m2 * m9) + m8 * (m1 * m6 - m2 * m5)
    if (Math.abs(det) < 1e-8) continue
    const id = 1 / det
    const inv = new Float64Array(12)
    inv[0] = (m5 * m10 - m6 * m9) * id
    inv[1] = (m8 * m6 - m4 * m10) * id
    inv[2] = (m4 * m9 - m8 * m5) * id
    inv[3] = (m2 * m9 - m1 * m10) * id
    inv[4] = (m0 * m10 - m2 * m8) * id
    inv[5] = (m1 * m8 - m0 * m9) * id
    inv[6] = (m1 * m6 - m2 * m5) * id
    inv[7] = (m2 * m4 - m0 * m6) * id
    inv[8] = (m0 * m5 - m1 * m4) * id
    inv[9] = -(inv[0] * m12 + inv[1] * m13 + inv[2] * m14)
    inv[10] = -(inv[3] * m12 + inv[4] * m13 + inv[5] * m14)
    inv[11] = -(inv[6] * m12 + inv[7] * m13 + inv[8] * m14)

    const ix0 = Math.floor(x0),
      ix1 = Math.ceil(x1) - 1,
      iy0 = Math.floor(y0),
      iy1 = Math.ceil(y1) - 1,
      iz0 = Math.floor(z0),
      iz1 = Math.ceil(z1) - 1
    boxes.push({ index: i, x0: ix0, x1: ix1, y0: iy0, y1: iy1, z0: iz0, z1: iz1, inv })
    if (ix0 < gMinX) gMinX = ix0
    if (ix1 > gMaxX) gMaxX = ix1
    if (iy0 < gMinY) gMinY = iy0
    if (iy1 > gMaxY) gMaxY = iy1
    if (iz0 < gMinZ) gMinZ = iz0
    if (iz1 > gMaxZ) gMaxZ = iz1
  }

  if (!boxes.length) {
    return {
      width: 2,
      height: 2,
      count: 1,
      cx: 1,
      cy: 1,
      baseLift: 0,
      pixels: new Uint8ClampedArray(16),
      shadow: new Uint8Array(4)
    }
  }

  const halfX = Math.max(Math.abs(gMinX), Math.abs(gMaxX) + 1)
  const halfZ = Math.max(Math.abs(gMinZ), Math.abs(gMaxZ) + 1)
  const width = options.width ?? Math.max(2, halfX * 2)
  const height = options.height ?? Math.max(2, halfZ * 2)
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  const baseLift = options.minY ?? gMinY
  const rawCount = Math.max(1, gMaxY - baseLift + 1)
  const count = Math.min(MAX_STACK_SLICES, options.count ?? rawCount)

  const density = model.density ?? 1
  const layerSize = width * height
  const vol = new Uint16Array(count * layerSize)
  const hasGlow = model.palette.glow.size > 0

  for (const box of boxes) {
    const grid = model.voxels[box.index].toDenseGrid()
    if (!grid) continue
    const { minX, minY, minZ, sx, sy, sz, data } = grid
    const strideZ = sx * sy
    const inv = box.inv
    const yStart = Math.max(baseLift, box.y0)
    const yEnd = Math.min(baseLift + count - 1, box.y1)
    const xStart = Math.max(-cx, box.x0)
    const xEnd = Math.min(width - 1 - cx, box.x1)
    const zStart = Math.max(-cy, box.z0)
    const zEnd = Math.min(height - 1 - cy, box.z1)

    for (let gy = yStart; gy <= yEnd; gy++) {
      const py = gy + 0.5
      const layerOff = (gy - baseLift) * layerSize
      const inv1y = inv[1] * py + inv[9]
      const inv4y = inv[4] * py + inv[10]
      const inv7y = inv[7] * py + inv[11]
      for (let gz = zStart; gz <= zEnd; gz++) {
        const pz = gz + 0.5
        const rowOff = layerOff + (gz + cy) * width
        const baseX = inv[2] * pz + inv1y
        const baseY = inv[5] * pz + inv4y
        const baseZ = inv[8] * pz + inv7y
        for (let gx = xStart; gx <= xEnd; gx++) {
          const px = gx + 0.5
          const ix = Math.floor(inv[0] * px + baseX) - minX
          if (ix < 0 || ix >= sx) continue
          const iy = Math.floor(inv[3] * px + baseY) - minY
          if (iy < 0 || iy >= sy) continue
          const iz = Math.floor(inv[6] * px + baseZ) - minZ
          if (iz < 0 || iz >= sz) continue
          const color = data[iz * strideZ + iy * sx + ix]
          if (color) vol[rowOff + (gx + cx)] = color
        }
      }
    }

    // Forward-stamp glowing accents (eyes, gems, embers) so oblique rotations never drop them.
    if (hasGlow) {
      const o = box.index * 16
      const m0 = matrices[o],
        m1 = matrices[o + 1],
        m2 = matrices[o + 2],
        m4 = matrices[o + 4],
        m5 = matrices[o + 5],
        m6 = matrices[o + 6],
        m8 = matrices[o + 8],
        m9 = matrices[o + 9],
        m10 = matrices[o + 10],
        m12 = matrices[o + 12],
        m13 = matrices[o + 13],
        m14 = matrices[o + 14]
      for (let iz = 0; iz < sz; iz++) {
        const pz = iz + minZ + 0.5
        const zOff = iz * strideZ
        for (let iy = 0; iy < sy; iy++) {
          const py = iy + minY + 0.5
          const yOff = zOff + iy * sx
          for (let ix = 0; ix < sx; ix++) {
            const color = data[yOff + ix]
            if (!color || !model.palette.glow.has(color)) continue
            const px = ix + minX + 0.5
            const gx = Math.floor(m0 * px + m4 * py + m8 * pz + m12)
            const gy = Math.floor(m1 * px + m5 * py + m9 * pz + m13)
            const gz = Math.floor(m2 * px + m6 * py + m10 * pz + m14)
            const layer = gy - baseLift
            const sxOut = gx + cx
            const syOut = gz + cy
            if (layer >= 0 && layer < count && sxOut >= 0 && sxOut < width && syOut >= 0 && syOut < height)
              vol[layer * layerSize + syOut * width + sxOut] = color
          }
        }
      }
    }
  }

  // Pack horizontal strip with quantized directional top-left shading + compact grounded shadow mask.
  const stripWidth = width * count
  const pixels = new Uint8ClampedArray(stripWidth * height * 4)
  const colCounts = new Uint16Array(layerSize)
  const paletteRgb = model.palette.colors.map(hexRgb)
  const sampleStep = Math.round(3 * density)
  const occStep1 = Math.round(2 * density)
  const occStep2 = Math.round(3 * density)

  const hasAt = (z: number, sx: number, sy: number) =>
    z >= 0 && z < count && sx >= 0 && sx < width && sy >= 0 && sy < height && vol[z * layerSize + sy * width + sx] !== 0

  for (let z = count - 1; z >= 0; z--) {
    const layerOff = z * layerSize
    const sliceX0 = z * width
    for (let sy = 0; sy < height; sy++) {
      const rowBase = sy * width
      for (let sx = 0; sx < width; sx++) {
        const idx = rowBase + sx
        const color = vol[layerOff + idx]
        if (!color) continue
        colCounts[idx]++

        const topExposed = !hasAt(z + 1, sx, sy)
        // Broad macro-normal bias scaled with voxel density (prevents 1px checkerboard noise on curved surfaces!).
        const openLeft2 = !hasAt(z, sx - sampleStep, sy) ? 1 : 0
        const openRight2 = !hasAt(z, sx + sampleStep, sy) ? 1 : 0
        const openBack2 = !hasAt(z, sx, sy - sampleStep) ? 1 : 0
        const openFront2 = !hasAt(z, sx, sy + sampleStep) ? 1 : 0
        const openFront = !hasAt(z, sx, sy + 1) ? 1 : 0
        const softShade = model.softShade === true
        const occluded = !softShade && topExposed
          ? hasAt(z + occStep1, sx, sy) || hasAt(z + occStep2, sx, sy)
          : !softShade && openFront === 1 && hasAt(z + density, sx, sy + density)
        const sideOpen = openLeft2 + openRight2,
          depthOpen = openFront2 + openBack2
        // Soft-shaded curved bodies (ogre, paladin, wraith) use pure smooth spatial volumetric shading:
        // zero 1px checkerboard shimmer while preserving rich 3-tone 16-bit sculptural volume!
        const nx = (sx - cx) / Math.max(3 * density, cx)
        const ny = (sy - cy) / Math.max(3 * density, cy)
        const smoothBias = -nx * 0.45 + ny * 0.35
        const lightBias = softShade
          ? topExposed
            ? z >= count * 0.5 && nx + ny * 0.4 < -0.18
              ? 0.35
              : 0
            : smoothBias
          : topExposed
            ? z >= count * 0.48 && (sx - cx) + (sy - cy) * 0.45 < -1.5 * density
              ? 0.4
              : 0
            : sideOpen === 2 || depthOpen === 2
              ? 0
              : (openLeft2 - openRight2) * 0.42 + (openFront2 * 0.42 - openBack2 * 0.35)

        const [r0, g0, b0] = paletteRgb[color]
        const [r, g, b] = shadeSliceColor(
          r0,
          g0,
          b0,
          topExposed,
          z,
          count,
          model.palette.glow.has(color),
          shade,
          lightBias,
          occluded
        )
        const dst = (sy * stripWidth + (sliceX0 + sx)) * 4
        pixels[dst] = r
        pixels[dst + 1] = g
        pixels[dst + 2] = b
        pixels[dst + 3] = 255
      }
    }
  }

  // Build compact grounded contact-shadow footprint from columns with solid vertical mass (>= 3 * density voxels)
  // + 1px morphological gap close so notched wings cast solid shadows.
  const minColMass = Math.round(3 * density)
  const shadow = new Uint8Array(layerSize)
  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const idx = sy * width + sx
      if (colCounts[idx] >= minColMass) shadow[idx] = 255
    }
  }
  const rawCore = new Uint8Array(shadow)
  for (let sy = 1; sy < height - 1; sy++) {
    for (let sx = 1; sx < width - 1; sx++) {
      const idx = sy * width + sx
      if (rawCore[idx] >= 200) continue
      const hBridge = rawCore[idx - 1] >= 200 && rawCore[idx + 1] >= 200
      const vBridge = rawCore[idx - width] >= 200 && rawCore[idx + width] >= 200
      if (hBridge || vBridge) shadow[idx] = 255
    }
  }
  // Small flying sprites (bats) leave 2px notches between wing fingers; close those too so the
  // contact shadow reads as one solid shape instead of broken glyph fragments.
  if (count < 12 * density) {
    const wide = new Uint8Array(shadow)
    const gap = Math.round(2 * density)
    for (let sy = gap; sy < height - gap; sy++) {
      for (let sx = gap; sx < width - gap; sx++) {
        const idx = sy * width + sx
        if (wide[idx] >= 200) continue
        if (wide[idx - gap] >= 200 && wide[idx + gap] >= 200) shadow[idx] = 255
        else if (wide[idx - width * gap] >= 200 && wide[idx + width * gap] >= 200) shadow[idx] = 255
      }
    }
  }
  if (model.simpleShadow) {
    // Flying sprites get one readable contact ellipse instead of fragmented wing-tip specks.
    shadow.fill(0)
    const cx = width / 2,
      cy = height / 2,
      rx = Math.max(4, width * 0.3),
      ry = Math.max(2, height * 0.1)
    for (let sy = 0; sy < height; sy++)
      for (let sx = 0; sx < width; sx++)
        if (((sx - cx) / rx) ** 2 + ((sy - cy) / ry) ** 2 <= 1) shadow[sy * width + sx] = 255
  }
  if (!model.simpleShadow) {
    // Keep only the largest connected contact shadow; detached weapon-tip dots read as ground dirt.
    const seen = new Uint8Array(layerSize)
    let best: number[] = []
    for (let sy = 0; sy < height; sy++) {
      for (let sx = 0; sx < width; sx++) {
        const start = sy * width + sx
        if (shadow[start] < 200 || seen[start]) continue
        const component: number[] = []
        const queue = [start]
        seen[start] = 1
        while (queue.length) {
          const idx = queue.pop()!
          component.push(idx)
          const x = idx % width,
            y = (idx - x) / width
          for (const next of [x > 0 ? idx - 1 : -1, x < width - 1 ? idx + 1 : -1, y > 0 ? idx - width : -1, y < height - 1 ? idx + width : -1]) {
            if (next < 0 || seen[next] || shadow[next] < 200) continue
            seen[next] = 1
            queue.push(next)
          }
        }
        if (component.length > best.length) best = component
      }
    }
    if (best.length) {
      shadow.fill(0)
      for (const idx of best) shadow[idx] = 255
    }
  }
  // Soft 1px outer shadow rim around the solid core (encoded as 160 vs core 255 for 2-tone pixel shadow).
  const core = new Uint8Array(shadow)
  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const idx = sy * width + sx
      if (core[idx] >= 200) continue
      if (
        (sx > 0 && core[idx - 1] >= 200) ||
        (sx + 1 < width && core[idx + 1] >= 200) ||
        (sy > 0 && core[idx - width] >= 200) ||
        (sy + 1 < height && core[idx + width] >= 200)
      ) {
        shadow[idx] = 160
      }
    }
  }

  return { width, height, count, cx, cy, baseLift, density, pixels, shadow }
}

/**
 * Software implementation of SpriteCook's exact `draw_stack` algorithm on an integer pixel grid,
 * with optional post-stack 1-art-px exterior outline, subtle internal height-step crease lines,
 * and crisp 2-tone pixel-art stepped contact shadow.
 */
export function drawStackPixels(sheet: SliceSheet, options: DrawStackOptions = {}): RenderedStack {
  const density = sheet.density ?? 1
  const turn = options.turn ?? 0
  const squash = options.squash ?? STACK_SQUASH
  const spacing = options.spacing ?? STACK_SPACING
  const outline = options.outline ?? false
  const wantShadow = options.shadow ?? false
  const [sdx, sdy] = options.shadowOffset ?? [Math.round(2 * density), Math.round(2 * density)]
  const fall = options.fall ?? 0
  const creaseStep = Math.round(7 * density)

  const { width: w, height: h, count, cx, cy, baseLift } = sheet
  const stripWidth = w * count
  const c = Math.cos(turn)
  const s = Math.sin(turn)

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  const corners = [
    [-cx, -cy],
    [w - 1 - cx, -cy],
    [-cx, h - 1 - cy],
    [w - 1 - cx, h - 1 - cy]
  ]
  const minLift = Math.round(baseLift * spacing)
  const maxLift = Math.round((baseLift + Math.max(0, count - 1)) * spacing)
  for (const [lx, ly] of corners) {
    const rx = lx * c - ly * s
    const ry = (lx * s + ly * c) * squash
    if (rx < minX) minX = rx
    if (rx > maxX) maxX = rx
    if (ry - maxLift < minY) minY = ry - maxLift
    if (ry - minLift > maxY) maxY = ry - minLift
    if (wantShadow) {
      if (rx + sdx < minX) minX = rx + sdx
      if (rx + sdx > maxX) maxX = rx + sdx
      if (ry + sdy < minY) minY = ry + sdy
      if (ry + sdy > maxY) maxY = ry + sdy
    }
  }

  const pad = outline ? 2 : 1
  if (fall) {
    const radius = Math.ceil(
      Math.hypot(Math.max(Math.abs(minX), Math.abs(maxX)), Math.max(Math.abs(minY), Math.abs(maxY)))
    )
    minX = -radius
    maxX = radius
    minY = -radius
    maxY = radius
  }
  const ix0 = Math.floor(minX) - pad
  const ix1 = Math.ceil(maxX) + pad
  const iy0 = Math.floor(minY) - pad
  const iy1 = Math.ceil(maxY) + pad
  const outW = Math.max(1, ix1 - ix0 + 1)
  const outH = Math.max(1, iy1 - iy0 + 1)
  const originX = -ix0
  const originY = -iy0

  const body = new Uint8ClampedArray(outW * outH * 4)
  const hitZ = new Int16Array(outW * outH).fill(-1)
  const shadowOut = new Uint8ClampedArray(outW * outH * 4)
  const fc = Math.cos(fall)
  const fs = Math.sin(fall)

  // Top-to-bottom scan matches drawing z = 0 .. count - 1 back-to-front pixel for pixel.
  for (let py = iy0; py <= iy1; py++) {
    const oy = py - iy0
    for (let px = ix0; px <= ix1; px++) {
      const ox = px - ix0
      const ux = fall ? px * fc + py * fs : px
      const uy = fall ? -px * fs + py * fc : py
      for (let z = count - 1; z >= 0; z--) {
        const lift = Math.round((baseLift + z) * spacing)
        const ry = (uy + lift) / squash
        const lx = ux * c + ry * s
        const ly = -ux * s + ry * c
        const sx = Math.floor(lx + cx + 0.5)
        const sy = Math.floor(ly + cy + 0.5)
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
        const src = (sy * stripWidth + z * w + sx) * 4
        if (sheet.pixels[src + 3] >= 128) {
          const dst = (oy * outW + ox) * 4
          body[dst] = sheet.pixels[src]
          body[dst + 1] = sheet.pixels[src + 1]
          body[dst + 2] = sheet.pixels[src + 2]
          body[dst + 3] = 255
          hitZ[oy * outW + ox] = z
          break
        }
      }
      if (wantShadow && !fall) {
        const rx = px - sdx
        const ry = (py - sdy) / squash
        const lx = rx * c + ry * s
        const ly = -rx * s + ry * c
        const sx = Math.floor(lx + cx + 0.5)
        const sy = Math.floor(ly + cy + 0.5)
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const sv = sheet.shadow[sy * w + sx]
          if (sv >= 128) {
            const dst = (oy * outW + ox) * 4
            shadowOut[dst] = 0x16
            shadowOut[dst + 1] = 0x14
            shadowOut[dst + 2] = 0x28
            shadowOut[dst + 3] = sv >= 200 ? 96 : 52
          }
        }
      }
    }
  }

  // Exterior 1-art-px dark outline ONCE around finished silhouette + subtle internal depth-step creases.
  if (outline) {
    const outlined = new Uint8ClampedArray(body)
    for (let oy = 0; oy < outH; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        const idx = oy * outW + ox
        const i = idx * 4
        const zHere = hitZ[idx]
        if (zHere >= 0) {
          // Subtle internal contour where a part overlaps another by >= 5 slices (hat brim, shield, arm).
          let stepUp = false
          for (const [dx, dy] of [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0]
          ]) {
            const nx = ox + dx,
              ny = oy + dy
            if (nx < 0 || nx >= outW || ny < 0 || ny >= outH) continue
            const nz = hitZ[ny * outW + nx]
            if (nz >= 0 && nz - zHere >= creaseStep) {
              stepUp = true
              break
            }
          }
          if (stepUp) {
            const [cr, cg, cb] = creaseColorFor(body[i], body[i + 1], body[i + 2])
            outlined[i] = cr
            outlined[i + 1] = cg
            outlined[i + 2] = cb
          }
          continue
        }
        let nr = 0,
          ng = 0,
          nb = 0,
          found = false
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0]
        ]) {
          const nx = ox + dx,
            ny = oy + dy
          if (nx < 0 || nx >= outW || ny < 0 || ny >= outH) continue
          const ni = (ny * outW + nx) * 4
          if (body[ni + 3] >= 128) {
            nr = body[ni]
            ng = body[ni + 1]
            nb = body[ni + 2]
            found = true
            break
          }
        }
        if (found) {
          const [or, og, ob] = outlineColorFor(nr, ng, nb)
          outlined[i] = or
          outlined[i + 1] = og
          outlined[i + 2] = ob
          outlined[i + 3] = 255
        }
      }
    }
    return { width: outW, height: outH, originX, originY, pixels: outlined, shadow: shadowOut }
  }

  return { width: outW, height: outH, originX, originY, pixels: body, shadow: shadowOut }
}

export interface FlatViewImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/**
 * TypeScript implementation of SpriteCook's `carve(top, side, front, back, shade)` from
 * `views_to_slices.py`: carves a horizontal `SliceSheet` from four flat orthographic views.
 */
export function carveFourViews(
  top: FlatViewImage,
  side: FlatViewImage,
  front: FlatViewImage,
  back: FlatViewImage,
  shade = 0.25
): SliceSheet {
  const W = top.width
  const L = top.height
  const H = Math.min(MAX_STACK_SLICES, side.height)
  const layerSize = W * L
  const occ = new Uint8Array(H * layerSize)

  const alphaAt = (img: FlatViewImage, x: number, y: number) =>
    x >= 0 && x < img.width && y >= 0 && y < img.height && img.data[(y * img.width + x) * 4 + 3] >= 128

  const edgeColor = (img: FlatViewImage, row: number, col: number): [number, number, number] | null => {
    if (row < 0 || row >= img.height) return null
    let first = -1,
      last = -1
    for (let x = 0; x < img.width; x++)
      if (img.data[(row * img.width + x) * 4 + 3] >= 128) {
        if (first < 0) first = x
        last = x
      }
    if (first < 0) return null
    const x = Math.max(first, Math.min(last, col))
    const o = (row * img.width + x) * 4
    return [img.data[o], img.data[o + 1], img.data[o + 2]]
  }

  for (let z = 0; z < H; z++) {
    const r = H - 1 - z
    for (let y = 0; y < L; y++) {
      const along = alphaAt(side, Math.min(side.width - 1, Math.floor((y * side.width) / L)), r)
      if (!along) continue
      for (let x = 0; x < W; x++) {
        const fx = Math.min(front.width - 1, Math.floor((x * front.width) / W))
        const bx = Math.min(back.width - 1, Math.floor((x * back.width) / W))
        if (alphaAt(top, x, y) && (alphaAt(front, fx, r) || alphaAt(back, bx, r)))
          occ[z * layerSize + y * W + x] = 1
      }
    }
  }

  const stripWidth = W * H
  const pixels = new Uint8ClampedArray(stripWidth * L * 4)
  const shadow = new Uint8Array(layerSize)
  const covered = new Uint8Array(layerSize)

  for (let z = H - 1; z >= 0; z--) {
    const r = H - 1 - z
    const sliceOff = z * layerSize
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x
        if (!occ[sliceOff + idx]) continue
        const above = covered[idx] !== 0
        covered[idx] = 1
        shadow[idx] = 255
        let distL = 1,
          distR = 1,
          distB = 1,
          distF = 1
        while (x - distL >= 0 && occ[sliceOff + y * W + (x - distL)]) distL++
        while (x + distR < W && occ[sliceOff + y * W + (x + distR)]) distR++
        while (y - distB >= 0 && occ[sliceOff + (y - distB) * W + x]) distB++
        while (y + distF < L && occ[sliceOff + (y + distF) * W + x]) distF++
        const depth = Math.min(distL, distR, distB, distF)
        let rgb: [number, number, number]
        if (!above) {
          const o = (y * W + x) * 4
          rgb = [top.data[o], top.data[o + 1], top.data[o + 2]]
        } else if (depth > 2 && z + 1 < H) {
          const o = (y * stripWidth + (z + 1) * W + x) * 4
          rgb = [pixels[o], pixels[o + 1], pixels[o + 2]]
        } else {
          const sideCol = Math.min(side.width - 1, Math.floor((y * side.width) / L))
          const frontCol = Math.min(front.width - 1, Math.floor((x * front.width) / W))
          const backCol = Math.min(back.width - 1, Math.floor((x * back.width) / W))
          const picked =
            depth === distL || depth === distR
              ? edgeColor(side, r, sideCol)
              : depth === distB
                ? edgeColor(back, r, backCol)
                : edgeColor(front, r, frontCol)
          const o = (y * W + x) * 4
          rgb = picked ?? [top.data[o], top.data[o + 1], top.data[o + 2]]
        }
        if (above && depth <= 2 && shade > 0) {
          const factor = Math.max(0, 1 - shade * (1 - z / Math.max(H - 1, 1)) - shade * 0.4)
          rgb = [clamp255(rgb[0] * factor), clamp255(rgb[1] * factor), clamp255(rgb[2] * factor)]
        }
        const dst = (y * stripWidth + z * W + x) * 4
        pixels[dst] = rgb[0]
        pixels[dst + 1] = rgb[1]
        pixels[dst + 2] = rgb[2]
        pixels[dst + 3] = 255
      }
    }
  }

  return {
    width: W,
    height: L,
    count: H,
    cx: Math.floor(W / 2),
    cy: Math.floor(L / 2),
    baseLift: 0,
    pixels,
    shadow
  }
}
