import type { StackKit } from '../StackModel'
import type { VoxelPart } from '../Voxel'

export interface HumanColors {
  skin: string
  eye: string
  shine?: string
  cheek?: string
  brow?: string
  legs: string
  boots: string
  torso: string
  torsoTrim?: string
  belt?: string
  sleeve: string
  hands: string
}
export interface HumanShape {
  /** Leg length in cells (hip pivot height = legs + 1). */
  legs?: number
  torsoHeight?: number
  /** Half width of the torso in cells. */
  torsoHalf?: number
  torsoDepth?: number
  headRadius?: number
  armLength?: number
  /** Robe: widen the torso skirt smoothly down over the legs. */
  robe?: boolean
  /** Face rows: eyes at these local head rows. */
  eyeRow?: number
  /** Skip side-ear details (for helmeted/hooded figures). */
  coveredSides?: boolean
}
export interface HumanParts {
  hips: VoxelPart
  torso: VoxelPart
  head: VoxelPart
  armL: VoxelPart
  armR: VoxelPart
  legL: VoxelPart
  legR: VoxelPart
  /** Cells: top of torso, head pivot, hand position under the arm pivot. */
  torsoTop: number
  hand: number
  headRadius: number
}

/**
 * Shared commercial-grade chibi body plan:
 * - Deeper torso (`torsoDepth: 3`) so side & back views read with real sculptural volume.
 * - Expressive face with tall eyes, catchlights, brow/cheek cues, and side-wrapped eye accents
 *   so 3/4 and profile views never collapse into blank skin pillars.
 * - Solid 2x2 arms + fists so weapons attach directly inside the hand grip without floating gaps.
 */
export function human(kit: StackKit, c: HumanColors, shape: HumanShape = {}): HumanParts {
  const legs = shape.legs ?? 6
  const th = shape.torsoHeight ?? 7
  const half = shape.torsoHalf ?? 4
  const depth = shape.torsoDepth ?? 3
  const hr = shape.headRadius ?? 4.7
  const arm = shape.armLength ?? 7

  const hips = kit.part('hips', undefined, [0, legs, 0])
  hips.box([-half, 0, -depth], [half - 1, 1, depth], c.belt ?? c.torso)

  const legParts: VoxelPart[] = []
  for (const [name, x] of [
    ['legL', Math.max(2, Math.floor(half * 0.5))],
    ['legR', -Math.max(2, Math.floor(half * 0.5))]
  ] as const) {
    const leg = kit.part(name, 'hips', [x, 0.5, 0])
    if (shape.robe) {
      // Subtle tucked shoes beneath the robe hem (never two dark squares poking out front like eyes).
      leg.box([-1, -legs, -1], [0, -1, 1], c.legs).box([-1, -legs, -1], [0, -legs, 1], c.boots)
    } else {
      leg.box([-1, -legs + 1, -1], [0, -1, 1], c.legs).box([-1, -legs, -1], [0, -legs + 1, 2], c.boots)
    }
    legParts.push(leg)
  }

  const torso = kit.part('torso', 'hips', [0, 2, 0])
  torso.box([-half, 0, -depth], [half - 1, th - 1, depth], c.torso)
  if (c.torsoTrim) {
    torso.box([-half, 0, -depth], [half - 1, 0, depth], c.torsoTrim)
    torso.box([-half + 1, th - 1, -depth], [half - 2, th - 1, depth], c.torsoTrim)
  }
  if (shape.robe) {
    // Full flared robe reaching down cleanly to ankle height.
    for (let y = -legs + 1; y <= 1; y++) {
      const flare = 1 + Math.round(((1 - y) / Math.max(1, legs)) * 1.35)
      hips.box([-half - flare + 1, y, -depth - flare + 1], [half + flare - 2, y, depth + flare - 1], c.torso)
    }
    if (c.torsoTrim) hips.box([-half - 2, -legs + 1, -depth - 2], [half + 1, -legs + 1, depth + 2], c.torsoTrim)
  }

  const head = kit.part('head', 'torso', [0, th, 0.5])
  head.ellipsoid([0, hr, 0], [hr, hr + 0.3, hr], c.skin)

  // Expressive front face: tall eyes with catchlight, brow accent, cheeks, and side-profile eye wrap.
  const eyeRow = shape.eyeRow ?? Math.round(hr * 0.62)
  for (const x of [-3, -2, 1, 2]) {
    head.face(x, eyeRow, c.eye).face(x, eyeRow + 1, c.eye)
  }
  if (c.shine) head.face(-2, eyeRow + 1, c.shine).face(2, eyeRow + 1, c.shine)
  if (c.brow) {
    for (const x of [-3, -2, 1, 2]) head.face(x, eyeRow + 2, c.brow)
  }
  if (c.cheek) {
    head.face(-4, eyeRow - 1, c.cheek).face(3, eyeRow - 1, c.cheek)
    head.face(-1, Math.max(1, eyeRow - 1), c.cheek).face(0, Math.max(1, eyeRow - 1), c.cheek)
  }
  // Wrap a 1-voxel eye hint onto +/-x profile edges and add small ears so side views read clearly.
  const earX = Math.floor(hr)
  if (!shape.coveredSides) {
    head.set(earX, eyeRow, 2, c.eye).set(-earX - 1, eyeRow, 2, c.eye)
    head.set(earX, eyeRow, -1, c.skin).set(-earX - 1, eyeRow, -1, c.skin)
  }

  const parts: Partial<HumanParts> = { hips, torso, head }
  for (const [name, x] of [
    ['armL', half + 1],
    ['armR', -half - 1]
  ] as const) {
    const limb = kit.part(name, 'torso', [x, th - 1, 0])
    // Solid 2x2 sleeve + 2x2 fist so held weapons join directly into the hand without gaps.
    limb
      .box([-1, -arm + 2, -1], [0, 0, 1], c.sleeve)
      .box([-1, -arm, -1], [0, -arm + 1, 1], c.hands)
    parts[name] = limb
  }

  return {
    ...(parts as HumanParts),
    legL: legParts[0],
    legR: legParts[1],
    torsoTop: th,
    hand: -arm + 0.5,
    headRadius: hr
  }
}

/** A chunky 2px pole along +z (spear, staff) of length cells from the hand. */
export function pole(part: VoxelPart, from: number, to: number, color: string, y = 0): VoxelPart {
  return part.box([0, y, from], [1, y + 1, to], color)
}
