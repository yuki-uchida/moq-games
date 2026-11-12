/**
 * Which part of a story scene a panel of a given shape shows. The classic picture is the 2:1 rectangle
 * `SCENE_W × SCENE_H`; a taller panel keeps the ground strip on its bottom edge, grows upward into the backdrop's
 * sky (it has `EXTRA_SKY` more rows above the scene) and narrows around the characters, so a phone held upright
 * shows them larger instead of cropping them. Pure (no DOM): the Node tests check every shot.
 */
import { allSheetSpecs, type AnimSpec } from '../art/contract'
import { defaultAnchor } from '../art/sheet'
import { SCENE_H, SCENE_W, type Figure, type Mark, type Shot } from './story-scenes'

/** Rows of backdrop above the classic picture (the backdrop is drawn with its ground on the scene's ground). */
export const EXTRA_SKY = 160
/** Room kept between the outermost figure or mark and the frame's side. */
export const FRAME_MARGIN = 6
/** The widest panel shape the frame follows (the classic picture). */
export const CLASSIC_ASPECT = SCENE_W / SCENE_H
/** The tallest panel shape the frame follows (a square). */
export const TALLEST_ASPECT = 1

/** A rectangle of the scene, in scene pixels (`y` may be negative: the sky above the classic picture). */
export interface Frame {
  x: number
  y: number
  w: number
  h: number
}

export const CLASSIC_FRAME: Frame = { x: 0, y: 0, w: SCENE_W, h: SCENE_H }

/** How far each motion moves a figure sideways (see `Diorama.drawFigure`). */
const SWAY: Record<string, number> = { pace: 10, shake: 1, fall: 8 }

let specs: Record<string, Record<string, AnimSpec>> | null = null
const specOf = (sheet: string, clip: string): AnimSpec | undefined => (specs ??= allSheetSpecs())[sheet]?.[clip]

/** The horizontal extent of a figure's frame around its anchor, with its sideways motion. */
export function figureSpan(figure: Figure): readonly [number, number] | null {
  const spec = specOf(figure.sheet, figure.clip)
  if (!spec) return null
  const [ax] = spec.anchor ?? defaultAnchor(spec.w, spec.h)
  const sway = SWAY[figure.motion ?? 'none'] ?? 0
  // A mirrored frame turns around its anchor column.
  const left = figure.flip ? figure.x - (spec.w - ax) : figure.x - ax
  return [left - sway, left + spec.w + sway]
}

/** The horizontal extent of a mark (an `fx` clip centred on its x). */
export function markSpan(mark: Mark): readonly [number, number] | null {
  const spec = specOf('fx', mark.clip)
  if (!spec) return null
  const [ax] = spec.anchor ?? defaultAnchor(spec.w, spec.h)
  return [mark.x - ax, mark.x - ax + spec.w]
}

/** Everything a shot shows, clipped to the scene's width (null when the shot is empty). */
export function contentSpan(shot: Shot): readonly [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  const spans = [...shot.figures.map(figureSpan), ...(shot.marks ?? []).map(markSpan)]
  for (const span of spans) {
    if (!span) continue
    const a = Math.max(0, span[0])
    const b = Math.min(SCENE_W, span[1])
    if (b <= a) continue
    lo = Math.min(lo, a)
    hi = Math.max(hi, b)
  }
  return hi > lo ? [lo, hi] : null
}

/**
 * The rectangle of the scene a panel of `aspect = width / height` shows: the classic picture at 2:1, narrower and
 * taller (bottom edge on the scene's bottom) for taller panels, never narrower than the shot's content allows.
 * Whole scene pixels.
 */
export function frameFor(shot: Shot, aspect: number): Frame {
  if (!Number.isFinite(aspect) || aspect >= CLASSIC_ASPECT - 0.005) return { ...CLASSIC_FRAME }
  const a = Math.max(TALLEST_ASPECT, aspect)
  const span = contentSpan(shot) ?? [0, SCENE_W]
  const lo = Math.max(0, span[0] - FRAME_MARGIN)
  const hi = Math.min(SCENE_W, span[1] + FRAME_MARGIN)
  // The narrowest frame that still has no more than the backdrop's height.
  const least = Math.ceil(SCENE_H * a)
  let w = Math.min(SCENE_W, Math.max(Math.ceil(hi - lo), least))
  let h = Math.round(w / a)
  if (h > SCENE_H + EXTRA_SKY) {
    h = SCENE_H + EXTRA_SKY
    w = Math.min(SCENE_W, Math.round(h * a))
  }
  const x = Math.max(0, Math.min(SCENE_W - w, Math.round((lo + hi) / 2 - w / 2)))
  return { x, y: SCENE_H - h, w, h }
}
