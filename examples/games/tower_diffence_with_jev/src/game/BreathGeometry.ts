import type { BattlefieldVersion, Point } from './model'

export const BREATH_TIMING = { durationMs: 1200, startMs: 480, endMs: 960, tickCount: 8 }
export const BREATH_SOURCE_GEOMETRY = { mouthToTipLength: 111.667, terminalHalfWidth: 53.333 }
export const BREATH_DIRECTIONS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const
export type BreathDirection = (typeof BREATH_DIRECTIONS)[number]
export interface MouthFrame {
  durationMs: number
  offset: Point
}
export interface BreathMouthTrack {
  direction: BreathDirection
  frames: readonly MouthFrame[]
}
export interface BreathAttackState {
  direction: BreathDirection
  nextTick: number
  lockedAim?: Point
  shape: BreathGeometry | null
}
export type BreathMouthTracks = Readonly<Record<BreathDirection, readonly MouthFrame[]>>
export interface BreathGeometry {
  origin: Point
  direction: Point
  length: number
  endHalfWidth: number
}

export function validateMouthTracks(tracks: readonly BreathMouthTrack[]): BreathMouthTracks {
  if (tracks.length !== 8) throw new Error('Breath requires all eight mouth tracks')
  const result = {} as Record<BreathDirection, readonly MouthFrame[]>
  for (const track of tracks) {
    if (!BREATH_DIRECTIONS.includes(track.direction) || result[track.direction])
      throw new Error('Duplicate or invalid breath direction')
    if (!track.frames.length || track.frames.length > 64) throw new Error('Invalid breath frame count')
    let duration = 0
    result[track.direction] = track.frames.map((frame) => {
      if (
        !Number.isFinite(frame.durationMs) ||
        frame.durationMs <= 0 ||
        frame.durationMs > 1000 ||
        !Number.isFinite(frame.offset.x) ||
        !Number.isFinite(frame.offset.y) ||
        Math.abs(frame.offset.x) > 128 ||
        Math.abs(frame.offset.y) > 128
      )
        throw new Error('Invalid breath mouth frame')
      duration += frame.durationMs
      return Object.freeze({ durationMs: frame.durationMs, offset: Object.freeze({ ...frame.offset }) })
    })
    if (Math.abs(duration - BREATH_TIMING.durationMs) > 0.001) throw new Error('Breath mouth timing mismatch')
    Object.freeze(result[track.direction])
  }
  return Object.freeze(result)
}

export function breathDirection(aim: Readonly<Point>): BreathDirection {
  return BREATH_DIRECTIONS[(Math.round(Math.atan2(aim.y, aim.x) / (Math.PI / 4)) + 8) % 8]
}

export function mouthAt(origin: Readonly<Point>, frames: readonly MouthFrame[], elapsedMs: number, scale = 1): Point {
  let elapsed = Math.max(0, elapsedMs)
  let selected = frames.at(-1)!
  let tolerance = 1e-6
  for (const frame of frames) tolerance = Math.min(tolerance, frame.durationMs / 1024)
  for (const frame of frames) {
    if (elapsed < frame.durationMs - tolerance) {
      selected = frame
      break
    }
    elapsed = Math.max(0, elapsed - frame.durationMs)
  }
  return { x: origin.x + selected.offset.x * scale, y: origin.y + selected.offset.y * scale }
}

export function breathGeometry(
  origin: Point,
  aim: Readonly<Point>,
  length: number,
  endHalfWidth = (length * BREATH_SOURCE_GEOMETRY.terminalHalfWidth) / BREATH_SOURCE_GEOMETRY.mouthToTipLength,
  battlefieldVersion: BattlefieldVersion = 1,
  geometryScale: 1 | 2 = 1
): BreathGeometry {
  const magnitude = Math.hypot(aim.x, aim.y)
  const direction =
    magnitude > 0 && Number.isFinite(magnitude) ? { x: aim.x / magnitude, y: aim.y / magnitude } : { x: 1, y: 0 }
  return {
    origin,
    direction,
    length: length * geometryScale,
    endHalfWidth: endHalfWidth * (battlefieldVersion === 2 ? 1.25 : 1) * geometryScale
  }
}

export function insideBreath(shape: Readonly<BreathGeometry>, point: Readonly<Point>): boolean {
  const dx = point.x - shape.origin.x,
    dy = point.y - shape.origin.y
  const forward = dx * shape.direction.x + dy * shape.direction.y
  const lateral = Math.abs(-dx * shape.direction.y + dy * shape.direction.x)
  return forward >= 0 && forward <= shape.length && lateral <= (forward / shape.length) * shape.endHalfWidth
}

export function breathTickAt(startedAt: number, tick: number, timeScale: 1 | 0.8 = 1): number {
  return (
    startedAt +
    ((BREATH_TIMING.startMs + (tick * (BREATH_TIMING.endMs - BREATH_TIMING.startMs)) / BREATH_TIMING.tickCount) *
      timeScale) /
      1000
  )
}

export function lockBreathAim(origin: Readonly<Point>, target: Readonly<Point>, bodyAim: Readonly<Point>): Point {
  const dx = target.x - origin.x,
    dy = target.y - origin.y
  const length = Math.hypot(dx, dy)
  if (length > 0 && dx * bodyAim.x + dy * bodyAim.y > 0) return { x: dx / length, y: dy / length }
  return breathGeometry({ x: 0, y: 0 }, bodyAim, 1).direction
}
