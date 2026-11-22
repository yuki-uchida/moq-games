import type { StackKit } from '../StackModel'
import type { VoxelPart } from '../Voxel'

export interface HumanColors {
  skin: string
  eye: string
  shine?: string
  cheek?: string
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
  /** Robe: widen the torso skirt down over the legs. */
  robe?: boolean
  /** Face rows: eyes at these local head rows. */
  eyeRow?: number
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

/** Shared chibi body plan for the castle's people and the goblin folk. */
export function human(kit: StackKit, c: HumanColors, shape: HumanShape = {}): HumanParts {
  const legs = shape.legs ?? 6
  const th = shape.torsoHeight ?? 7
  const half = shape.torsoHalf ?? 4
  const depth = shape.torsoDepth ?? 2
  const hr = shape.headRadius ?? 4.4
  const arm = shape.armLength ?? 7
  const hips = kit.part('hips', undefined, [0, legs, 0])
  hips.box([-half, 0, -depth], [half - 1, 1, depth], c.belt ?? c.torso)
  const legParts: VoxelPart[] = []
  for (const [name, x] of [
    ['legL', 2],
    ['legR', -2]
  ] as const) {
    const leg = kit.part(name, 'hips', [x, 0.5, 0])
    leg.box([-1, -legs + 1, -1], [0, -1, 1], c.legs).box([-1, -legs - 1, -1], [0, -legs + 1, 2], c.boots)
    legParts.push(leg)
  }
  const torso = kit.part('torso', 'hips', [0, 2, 0])
  torso.box([-half, 0, -depth], [half - 1, th - 1, depth], c.torso)
  if (c.torsoTrim) torso.box([-half, 0, -depth], [half - 1, 0, depth], c.torsoTrim)
  if (shape.robe) {
    // A skirt hanging from the hips: it belongs to the hips so legs swing inside it.
    for (let y = -legs + 2; y <= 1; y++) {
      const flare = 1 + Math.round((1 - y) / legs)
      hips.box([-half - flare + 1, y, -depth - flare + 1], [half + flare - 2, y, depth + flare - 1], c.torso)
    }
    if (c.torsoTrim) hips.box([-half - 2, -legs + 2, -depth - 2], [half + 1, -legs + 2, depth + 2], c.torsoTrim)
  }
  const head = kit.part('head', 'torso', [0, th, 0.5])
  head.ellipsoid([0, hr, 0], [hr, hr + 0.2, hr - 0.2], c.skin)
  const eyeRow = shape.eyeRow ?? Math.round(hr * 0.7)
  for (const x of [-3, -2, 1, 2]) head.face(x, eyeRow, c.eye).face(x, eyeRow + 1, c.eye)
  if (c.shine) head.face(-2, eyeRow + 1, c.shine).face(2, eyeRow + 1, c.shine)
  if (c.cheek) head.face(-4, eyeRow - 1, c.cheek).face(3, eyeRow - 1, c.cheek)
  const parts: Partial<HumanParts> = { hips, torso, head }
  for (const [name, x] of [
    ['armL', half + 1],
    ['armR', -half - 1]
  ] as const) {
    const limb = kit.part(name, 'torso', [x, th - 1, 0])
    limb.box([-1, -arm + 2, -1], [0, 0, 0], c.sleeve).box([-1, -arm, -1], [0, -arm + 1, 0], c.hands)
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

/** A long pole along +z (spear, staff) of length cells from the hand. */
export function pole(part: VoxelPart, from: number, to: number, color: string, y = 0): VoxelPart {
  return part.box([0, y, from], [0, y + 1, to], color)
}
