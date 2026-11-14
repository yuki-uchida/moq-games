/**
 * The arithmetic of the help screen's moves (pure, no DOM; the sprite player in pixel.ts only draws what it says).
 *
 * - The walk is a ground cycle, so the ground must pass under it in step with the clip: the marks on the ground band
 *   sit `stride ÷ frames` px further back on each frame, which keeps a foot that is down over the same mark.
 * - The jump is a whole hop on a loop: he stands, rises (`jump`), turns over the top (`apex`), comes down (`fall`),
 *   lands (`land`) and stands (`idle`) until the next one. The drawing goes up and down on a parabola, and each clip
 *   shows only while his motion matches it.
 */
import type { Raster } from '../art/raster'

/** The hero's clips a hop draws. */
export const HOP_CLIPS = ['idle', 'jump', 'apex', 'fall', 'land'] as const
export type HopClip = (typeof HOP_CLIPS)[number]

/** Seconds of one whole hop, standing included. */
export const HOP_LOOP = 1.6
/** He stands this long (s) before each leap. */
export const HOP_STAND = 0.3
/** The time in the air (s): the parabola from the line back to the line. */
export const HOP_AIR = 1
/** `jump` shows while he rises, up to this part of the way to the top; `apex` from there to the mirror point. */
export const HOP_RISE = 0.35
/** How long (s) `land` plays before he stands again (the contract's 4 frames at 18 fps). */
export const HOP_LAND = 4 / 18
/** The height (px) the drawing rises: the room above his head that the help screen's sprite makes for it. */
export const HOP_HEIGHT = 16

/** Which clip shows at a moment of the loop, how far into it (s) and how high the drawing is lifted (px). */
export interface HopPose {
  clip: HopClip
  t: number
  lift: number
}

/** The pose at `time` seconds (any time: the hop repeats). Fills and returns `out`, so a frame makes no garbage. */
export function hopPose(time: number, height = HOP_HEIGHT, out: HopPose = { clip: 'idle', t: 0, lift: 0 }): HopPose {
  const t = ((time % HOP_LOOP) + HOP_LOOP) % HOP_LOOP
  const air = t - HOP_STAND
  if (air < 0 || air >= HOP_AIR) {
    // On the line: landing first, then standing until the next leap.
    const since = air - HOP_AIR
    out.clip = since >= 0 && since < HOP_LAND ? 'land' : 'idle'
    out.t = out.clip === 'land' ? since : t
    out.lift = 0
    return out
  }
  const u = air / HOP_AIR
  out.lift = height * 4 * u * (1 - u)
  if (u < HOP_RISE) {
    out.clip = 'jump'
    out.t = air
  } else if (u <= 1 - HOP_RISE) {
    out.clip = 'apex'
    out.t = air - HOP_RISE * HOP_AIR
  } else {
    out.clip = 'fall'
    out.t = air - (1 - HOP_RISE) * HOP_AIR
  }
  return out
}

/**
 * How far above its anchor row the soles of a frame are (px): the anchor row less the lowest painted row. The clips
 * the hop plays in the air are drawn with their feet raised (`jump` 2 px, `fall` 4, `apex` 6 or 7), so the player
 * lowers each frame by this much near the ground (`hopDrawLift`): its soles meet the line at take-off and landing.
 */
export function soleGap(frame: Raster, anchorRow: number): number {
  const b = frame.bounds()
  return b ? Math.max(0, anchorRow - (b.y + b.h - 1)) : 0
}

/** The sole correction fades out over this much lift (px): above it a frame is drawn exactly on the parabola. */
export const HOP_SOLE_FADE = 6

/**
 * The lift (px) a hop frame is drawn at: `lift`, less its sole gap while he is near the ground, so the soles meet
 * the line at take-off and landing (`gap × max(0, 1 − lift ÷ HOP_SOLE_FADE)`). Higher up the body rides the
 * parabola whatever feet the clip draws: lowering a tucked `apex` all the way would dip the body at the top.
 */
export const hopDrawLift = (lift: number, gap: number) => lift - gap * Math.max(0, 1 - lift / HOP_SOLE_FADE)

/** The moment of the loop at which he is at the top of the hop (the still picture under reduced motion). */
export const HOP_TOP = HOP_STAND + HOP_AIR / 2

/** The marks on the ground band are this far apart (px): it divides the walk's stride, so the pattern never jumps. */
export const GROUND_SPACING = 32

/**
 * How far back (px, 0 up to `spacing`) the ground marks are on frame `frame` of a ground cycle of `frames` frames
 * that covers `stride` px: `stride ÷ frames` further on each frame.
 */
export const groundShift = (frame: number, frames: number, stride: number, spacing = GROUND_SPACING) =>
  ((((frame * stride) / frames) % spacing) + spacing) % spacing
