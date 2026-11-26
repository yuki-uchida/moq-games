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
  /** Robe: smooth flared ellipsoid skirt over the legs (instead of a boxy square pedestal). */
  robe?: boolean
  /** Robe skirt flare factor (default 1.3; customize per caster silhouette). */
  robeFlare?: number
  /** Robe skirt drop length in cells (default legs - 1; shorter for parkas showing boots). */
  robeLength?: number
  /** Optional dark color key for vertical robe pleats. */
  robePleat?: string
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
  const hr = shape.headRadius ?? 4.8
  const arm = shape.armLength ?? 7

  const hips = kit.part('hips', undefined, [0, legs, 0])
  hips.box([-half, 0, -depth], [half - 1, 1, depth], c.belt ?? c.torso)

  const d = hips.density
  const legParts: VoxelPart[] = []
  for (const [name, x] of [
    ['legL', Math.max(2, Math.floor(half * 0.5))],
    ['legR', -Math.max(2, Math.floor(half * 0.5))]
  ] as const) {
    const leg = kit.part(name, 'hips', [x, 0.5, 0])
    if (shape.robe) {
      // Subtle tucked shoes beneath the robe hem (never two dark squares poking out front like eyes).
      leg.box([-1, -legs, -1], [0, -1, 1], c.legs).box([-1, -legs, -1], [0, -legs, 1], c.boots)
    } else if (d >= 2) {
      // High-density rounded boots & trousers with crisp 1px sole bevel.
      leg.fill([-1, -legs + 1, -1], [0, -1, 1], c.legs, (lx, _ly, lz) => Math.hypot(lx / 1.05, lz / 1.25) <= 1.15)
      leg.fill([-1, -legs, -1], [0, -legs + 1, 2], c.boots, (lx, ly, lz) => {
        const front = ly < -legs + 0.8 ? 2.5 : 1.5
        return Math.abs(lx) <= 1.05 && lz >= -1.05 && lz <= front
      })
    } else {
      leg.box([-1, -legs + 1, -1], [0, -1, 1], c.legs).box([-1, -legs, -1], [0, -legs + 1, 2], c.boots)
    }
    legParts.push(leg)
  }

  const torso = kit.part('torso', 'hips', [0, 2, 0])
  if (d >= 2) {
    // High-density sculpted superellipse torso (organic beveled shoulders & waist instead of a hard cube!).
    torso.fill([-half, 0, -depth], [half - 1, th - 1, depth], c.torso, (x, y, z) => {
      const taper = 0.92 + 0.08 * Math.min(1, y / Math.max(1, th - 1))
      const nx = Math.abs(x) / (half * taper)
      const nz = Math.abs(z) / ((depth + 0.45) * taper)
      return nx ** 4 + nz ** 4 <= 1.05
    })
    if (c.torsoTrim) {
      // Crisp 1-art-px collar rim & lower tunic hem trim.
      torso.rawPaint((gx, gy) =>
        gy === 0 || gy === th * d - 1 ? c.torsoTrim : gy === th * d - 2 && Math.abs(gx + 0.5) <= 2.5 ? c.torsoTrim : undefined
      )
    }
  } else {
    torso.box([-half, 0, -depth], [half - 1, th - 1, depth], c.torso)
    if (c.torsoTrim) {
      torso.box([-half, 0, -depth], [half - 1, 0, depth], c.torsoTrim)
      torso.box([-half + 1, th - 1, -depth], [half - 2, th - 1, depth], c.torsoTrim)
    }
  }
  if (shape.robe) {
    // Smooth continuous flared bell skirt evaluated at every native slice (zero staircase banding!).
    const drop = shape.robeLength ?? Math.max(1, legs - 1)
    const flareMax = shape.robeFlare ?? 1.35
    const yBottom = 1 - drop
    const maxRx = Math.ceil(half + 0.4 + flareMax) + 1
    const maxRz = Math.ceil(depth + 0.4 + flareMax * 0.85) + 1
    hips.fill([-maxRx, yBottom, -maxRz], [maxRx, 1, maxRz], c.torso, (x, y, z) => {
      const t = Math.max(0, Math.min(1, (1.5 - y) / Math.max(1, drop)))
      const rx = half + 0.35 + t * flareMax
      const rz = depth + 0.35 + t * (flareMax * 0.85)
      return Math.hypot(x / rx, z / rz) <= 1
    })
    if (c.torsoTrim) {
      const hemGy = yBottom * d
      const rxHem = (half + 0.35 + flareMax) * d
      const rzHem = (depth + 0.35 + flareMax * 0.85) * d
      hips.rawPaint((gx, gy, gz) => {
        if (gy > hemGy + (d > 1 ? 1 : 0) || gy < hemGy) return undefined
        const dist = Math.hypot((gx + 0.5) / rxHem, (gz + 0.5) / rzHem)
        return dist >= 0.82 && dist <= 1.06 ? c.torsoTrim : undefined
      })
    }
    if (shape.robePleat) {
      hips.rawPaint((gx, gy, gz) => {
        if (gy >= d) return undefined
        const t = Math.max(0, Math.min(1, (1.5 * d - gy) / Math.max(1, drop * d)))
        const rz = (depth + 0.35 + t * (flareMax * 0.85)) * d
        return (Math.abs(gx + 0.5 - 3.5) < 0.9 || Math.abs(gx + 0.5 + 3.5) < 0.9) && Math.abs(gz + 0.5) >= rz - 2.2
          ? shape.robePleat
          : undefined
      })
    }
  }

  const head = kit.part('head', 'torso', [0, th, 0.5])
  head.ellipsoid([0, hr, 0], [hr, hr + 0.3, hr], c.skin)

  const eyeRow = shape.eyeRow ?? Math.round(hr * 0.62)
  if (d >= 2) {
    // True 2x high-resolution 16-bit RPG face (~19x19 art-px):
    // 3x4 expressive eyes with top-left sparkle catchlight, delicate 1px arched brows, soft cheeks, subtle smile & sculpted ears.
    const ey = eyeRow * d
    for (const gx of [-6, -5, -4, 3, 4, 5]) {
      for (let dy = 0; dy < 4; dy++) head.rawFace(gx, ey + dy, c.eye, '+z', 2)
    }
    if (c.shine) {
      head.rawFace(-5, ey + 3, c.shine, '+z', 2).rawFace(3, ey + 3, c.shine, '+z', 2)
    }
    if (c.brow) {
      for (const gx of [-6, -5, -4, 3, 4, 5]) head.rawFace(gx, ey + 5, c.brow, '+z', 2)
    }
    if (c.cheek) {
      head.rawFace(-7, ey - 1, c.cheek, '+z', 2).rawFace(-6, ey - 1, c.cheek, '+z', 2)
      head.rawFace(5, ey - 1, c.cheek, '+z', 2).rawFace(6, ey - 1, c.cheek, '+z', 2)
      // Gentle 2px smiling mouth accent.
      head.rawFace(-1, ey - 2, c.cheek, '+z', 2).rawFace(0, ey - 2, c.cheek, '+z', 2)
    }
    const earX = Math.floor(hr * d)
    if (!shape.coveredSides) {
      head.rawBox([earX, ey - 1, -2], [earX, ey + 2, -1], c.skin)
      head.rawBox([-earX - 1, ey - 1, -2], [-earX - 1, ey + 2, -1], c.skin)
    }
  } else {
    for (const x of [-3, -2, 1, 2]) {
      head.face(x, eyeRow, c.eye).face(x, eyeRow + 1, c.eye)
    }
    if (c.shine) head.face(-3, eyeRow + 1, c.shine).face(1, eyeRow + 1, c.shine)
    if (c.brow) {
      for (const x of [-3, -2, 1, 2]) head.face(x, eyeRow + 2, c.brow)
    }
    if (c.cheek) {
      head.face(-4, eyeRow - 1, c.cheek).face(3, eyeRow - 1, c.cheek)
    }
    const earX = Math.floor(hr)
    if (!shape.coveredSides) {
      head.set(earX, eyeRow, -1, c.skin).set(-earX - 1, eyeRow, -1, c.skin)
      head.set(earX, eyeRow - 1, -1, c.skin).set(-earX - 1, eyeRow - 1, -1, c.skin)
    }
  }

  const parts: Partial<HumanParts> = { hips, torso, head }
  for (const [name, x] of [
    ['armL', half + 1],
    ['armR', -half - 1]
  ] as const) {
    const limb = kit.part(name, 'torso', [x, th - 1, 0])
    if (d >= 2) {
      // Rounded 2x sleeve + sculpted cuff + hand so arms read organically from every facing.
      limb.fill([-1, -arm + 2, -1], [0, 0, 1], c.sleeve, (lx, _ly, lz) => Math.hypot(lx / 1.05, lz / 1.25) <= 1.15)
      limb.fill([-1, -arm, -1], [0, -arm + 1, 1], c.hands, (lx, _ly, lz) => Math.hypot(lx / 1.0, lz / 1.15) <= 1.15)
    } else {
      limb
        .box([-1, -arm + 2, -1], [0, 0, 1], c.sleeve)
        .box([-1, -arm, -1], [0, -arm + 1, 1], c.hands)
    }
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
