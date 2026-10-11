import type { Point, UnitType } from '../game/model'
import type { SpriteDirection } from './UnitSprites'
import { sampleWholeFrame, type WholeFrameManifest } from './WholeFrameAtlas'

export function authoredEmitter(
  origin: Readonly<Point>,
  manifest: WholeFrameManifest,
  elapsedMs: number,
  scale = 1
): Point | undefined {
  const emitter = sampleWholeFrame(manifest, elapsedMs).emitter
  if (!emitter) return undefined
  return {
    x: origin.x + ((emitter.x - manifest.frameSize.pivot.x) / manifest.pixelsPerWorldUnit) * scale,
    y: origin.y + ((emitter.y - manifest.frameSize.pivot.y) / manifest.pixelsPerWorldUnit) * scale
  }
}

export function projectilePose(
  origin: Readonly<Point>,
  target: Readonly<Point>,
  progress: number,
  flightSeconds: number,
  targetVelocity: Readonly<Point> = { x: 0, y: 0 },
  arcHeight = 12
): { position: Point; angle: number } {
  const phase = Math.max(0, Math.min(1, progress))
  const dx = target.x - origin.x,
    dy = target.y - origin.y
  const tangentX = dx + phase * targetVelocity.x * flightSeconds
  const tangentY = dy + phase * targetVelocity.y * flightSeconds - Math.PI * arcHeight * Math.cos(Math.PI * phase)
  return {
    position: {
      x: origin.x + dx * phase,
      y: origin.y + dy * phase - Math.sin(Math.PI * phase) * arcHeight
    },
    angle: Math.atan2(tangentY, tangentX)
  }
}

export function projectileDisplayScale(type: UnitType, flightAgeMs: number, travelDistance: number): number {
  if (type !== 'dragon' && type !== 'wraith') return 1
  const maximumScale = type === 'dragon' ? 0.4 : 0.45
  const tailLength = type === 'dragon' ? 109 : 86
  return Math.min(
    maximumScale * Math.max(0, Math.min(1, flightAgeMs / 60)),
    (Math.max(0, travelDistance) + 8) / tailLength
  )
}

export function authoredAxisProjectilePose(
  origin: Readonly<Point>,
  target: Readonly<Point>,
  progress: number,
  flightSeconds: number,
  direction: SpriteDirection,
  targetVelocity: Readonly<Point> = { x: 0, y: 0 }
): { position: Point; angle: number } {
  const phase = Math.max(0, Math.min(1, progress))
  const heading = ({ e: 0, se: 1, s: 2, sw: 3, w: 4, nw: -3, n: -2, ne: -1 }[direction] * Math.PI) / 4
  const axis = { x: Math.cos(heading), y: Math.sin(heading) }
  const dx = target.x - origin.x,
    dy = target.y - origin.y,
    distance = Math.hypot(dx, dy)
  const targetStep = { x: targetVelocity.x * flightSeconds, y: targetVelocity.y * flightSeconds }
  const distanceStep = distance > 0 ? (dx * targetStep.x + dy * targetStep.y) / distance : 0
  const controlWeight = phase * (1 - phase),
    targetWeight = phase * phase,
    controlTangent = (1 - 2 * phase) * distance + controlWeight * distanceStep
  const tangentX = controlTangent * axis.x + 2 * phase * dx + targetWeight * targetStep.x,
    tangentY = controlTangent * axis.y + 2 * phase * dy + targetWeight * targetStep.y
  return {
    position:
      phase === 1
        ? { x: target.x, y: target.y }
        : {
            x: origin.x + controlWeight * distance * axis.x + targetWeight * dx,
            y: origin.y + controlWeight * distance * axis.y + targetWeight * dy
          },
    angle: tangentX === 0 && tangentY === 0 ? heading : Math.atan2(tangentY, tangentX)
  }
}

/** Visual elevation in world units, fixed from the attack's captured ground aim. */
export function arrowArcHeight(groundDistance: number): number {
  return Math.max(18, Math.min(64, Math.max(0, groundDistance) * 0.28))
}

/** Arrow-only parabola. The simulation still owns the endpoint and impact clock. */
export function arrowProjectilePose(
  origin: Readonly<Point>,
  target: Readonly<Point>,
  progress: number,
  flightSeconds: number,
  targetVelocity: Readonly<Point> = { x: 0, y: 0 },
  arcHeight = 18
): { position: Point; angle: number; elevation: number } {
  const phase = Math.max(0, Math.min(1, progress))
  const dx = target.x - origin.x,
    dy = target.y - origin.y,
    elevation = 4 * arcHeight * phase * (1 - phase)
  // The target may move during flight. Include its velocity in the actual
  // trajectory derivative rather than aiming the sprite at the endpoint.
  const tangentX = dx + phase * targetVelocity.x * flightSeconds,
    tangentY = dy + phase * targetVelocity.y * flightSeconds - 4 * arcHeight * (1 - 2 * phase)
  return {
    position:
      phase === 0
        ? { x: origin.x, y: origin.y }
        : phase === 1
          ? { x: target.x, y: target.y }
          : { x: origin.x + dx * phase, y: origin.y + dy * phase - elevation },
    angle: Math.atan2(tangentY, tangentX),
    elevation
  }
}
