/**
 * Where each figure, mark and ground tile of a story shot is a moment after the shot came up. Pure (no DOM): the
 * diorama only draws what this returns, and the Node tests check it.
 *
 * One rule runs through it: a clip with a `stride` (a run, a gallop, a walk) is only ever played by ground that
 * really passes under its figure, one pass of the clip per `stride` px (`strideTime`), never by the clock, so a
 * planted foot stays planted. A figure covers ground in one of three ways: the camera tracks it (`Shot.pan`), it
 * dashes across the picture, or it patrols to and fro.
 */
import { allSheetSpecs, type AnimSpec, type TileQuery } from '../art/contract'
import { defaultAnchor } from '../art/sheet'
import { specDuration, strideTime } from '../view/clips'
import { groundTiles, SCENE_W, type Shot } from './story-scenes'

/** A dashing figure rests this long (seconds) once it is out of the picture, then starts again. */
export const DASH_REST = 1.4
/** A dashing figure fades in over this long (seconds) when it starts again. */
export const DASH_FADE = 0.2
/** Under reduced motion a dashing figure stands this far (px) along its run, the way it faces. */
export const DASH_STILL = 64
/** How much of a dash's run (px ahead of its `x`) a tall frame keeps in view: see `figureSpan`. */
export const DASH_VIEW = 96
/** The part of a pass of a ground cycle a still figure of a dash shows: a mid-stride frame, not the first. */
const DASH_POSE = 0.3
/**
 * A fall from the sky starts this high (px above the ground): wholly above the classic picture, whose top edge is the
 * scene's 136 px above the ground, so she comes in from outside. She drifts down at `FALL_SPEED` px/s.
 */
export const FALL_HEIGHT = 140
export const FALL_SPEED = 40
/** A patrol walks this far (px) to each side of its `x`. */
export const PACE_REACH = 24
/** A patrol's speed (px/s) when the figure names none. */
export const PACE_SPEED = 40
/** A dash's speed (px/s) when the figure names none and its clip has no stride. */
const DASH_SPEED = 120
/** Clips whose own drawing leaves the ground: a figure playing one gets no `hop` on top. */
const LEAVES_THE_GROUND = new Set(['cheer'])

/** Where a figure is drawn `time` seconds after its shot came up, and how far into its clip. */
export interface Placed {
  x: number
  lift: number
  flip: boolean | undefined
  clipTime: number
  alpha: number
}

let specs: Record<string, Record<string, AnimSpec>> | null = null
const specOf = (sheet: string, clip: string): AnimSpec | undefined => (specs ??= allSheetSpecs())[sheet]?.[clip]

/** How far a figure has been carried from its `x`, and the ground that has passed under its feet. */
interface Carry {
  dx: number
  alpha: number
  /** Ground (px) that has passed under the figure, the way it faces: what plays a stride clip. */
  ground: number
  /** Set by a patrol: which way it faces now. */
  flip?: boolean
  /** The figure is left behind by the camera: it goes by with the ground. */
  behind?: boolean
}

/** The figure whose displacement the figure at `index` takes: itself, or the end of its chain of `follow`s. */
function leadOf(shot: Shot, index: number) {
  let lead = index
  for (let step = 0; step < shot.figures.length; step++) {
    const next = shot.figures[lead].follow
    if (next === undefined || next === lead || !shot.figures[next]) break
    lead = next
  }
  return lead
}

/** How the figure at `lead` is carried (null: it is not in the picture just now). */
function carryOf(shot: Shot, lead: number, time: number, still: boolean): Carry | null {
  const figure = shot.figures[lead]
  // Under reduced motion a dash stands a fixed way along its run, clear of what it came out of.
  if (still) return { dx: figure.motion === 'dash' ? (figure.flip ? -1 : 1) * DASH_STILL : 0, alpha: 1, ground: 0 }
  const spec = specOf(figure.sheet, figure.clip)
  if (figure.motion === 'dash' && spec) {
    const speed = figure.speed ?? (spec.stride ? spec.stride / specDuration(spec) : DASH_SPEED)
    // Wholly outside the scene, whatever the frame: the scene's width plus the sprite's width is far enough.
    const run = (SCENE_W + spec.w) / speed
    const round = Math.floor(time / (run + DASH_REST))
    const local = time - round * (run + DASH_REST)
    if (local >= run) return null
    const covered = speed * local
    return {
      dx: (figure.flip ? -1 : 1) * covered,
      alpha: round > 0 ? Math.min(1, local / DASH_FADE) : 1,
      ground: covered
    }
  }
  if (figure.motion === 'pace') {
    const speed = figure.speed ?? PACE_SPEED
    const covered = speed * time
    const along = covered % (4 * PACE_REACH)
    // A triangle wave: right to the reach, back over the middle to the other side, and home again.
    const dx = along < PACE_REACH ? along : along < 3 * PACE_REACH ? 2 * PACE_REACH - along : along - 4 * PACE_REACH
    return { dx, alpha: 1, ground: covered, flip: along >= PACE_REACH && along < 3 * PACE_REACH }
  }
  const pan = shot.pan ?? 0
  if (!pan) return { dx: 0, alpha: 1, ground: 0 }
  if (figure.tracked) return { dx: 0, alpha: 1, ground: pan * time }
  return { dx: -pan * time, alpha: 1, ground: 0, behind: true }
}

/** The horizontal extent of a frame of `spec` anchored on `x`. */
function extent(spec: AnimSpec, x: number, flip: boolean | undefined): readonly [number, number] {
  const [ax] = spec.anchor ?? defaultAnchor(spec.w, spec.h)
  const left = flip ? x - (spec.w - ax) : x - ax
  return [left, left + spec.w]
}

/** Where the figure at `index` of a shot is drawn `time` seconds after it came up, or null (not drawn now). */
export function placeFigure(shot: Shot, index: number, time: number, still: boolean): Placed | null {
  const figure = shot.figures[index]
  const spec = figure && specOf(figure.sheet, figure.clip)
  if (!figure || !spec) return null
  const lead = leadOf(shot, index)
  const carry = carryOf(shot, lead, time, still)
  if (!carry) return null
  const phase = figure.phase ?? 0
  let x = figure.x + carry.dx
  let lift = figure.lift ?? 0
  const flip = lead === index && carry.flip !== undefined ? carry.flip : figure.flip
  // Left behind by the camera: gone for good once it is out of the picture's left edge.
  if (carry.behind && extent(spec, x, flip)[1] < 0) return null
  if (!still) {
    const t = time + phase
    const motion = figure.motion
    if (motion === 'hop' && !LEAVES_THE_GROUND.has(figure.clip)) lift += Math.round(Math.abs(Math.sin(t * 4.2)) * 10)
    else if (motion === 'float') lift += Math.round(Math.sin(t * 2.2) * 4)
    else if (motion === 'shake') x += Math.floor(t * 18) % 2 ? 1 : -1
    else if (motion === 'fall') {
      // A drift down from the sky, swaying while she is up, then she stands.
      const drop = Math.max(0, FALL_HEIGHT - time * FALL_SPEED)
      lift += Math.round(drop)
      x += Math.round(Math.sin(t * 2.4) * (drop > 0 ? 8 : 0))
    }
  }
  // A ground cycle plays by the ground under the figure; a figure the ground does not carry stands on one frame.
  const pose = still && figure.motion === 'dash' ? DASH_POSE * specDuration(spec) : 0
  const clipTime = spec.stride
    ? phase + pose + (still || carry.behind ? 0 : strideTime(spec, carry.ground))
    : time + phase
  return { x, lift, flip, clipTime, alpha: carry.alpha }
}

/** Where the mark at `index` of a shot is drawn `time` seconds after it came up, or null (not drawn now). */
export function placeMark(
  shot: Shot,
  index: number,
  time: number,
  still: boolean
): { x: number; lift: number; alpha: number } | null {
  const mark = shot.marks?.[index]
  if (!mark) return null
  const lift = mark.lift
  if (mark.follow !== undefined && shot.figures[mark.follow]) {
    // A mark is never left over nothing: it is drawn only while its figure is.
    if (!placeFigure(shot, mark.follow, time, still)) return null
    const carry = carryOf(shot, leadOf(shot, mark.follow), time, still)
    if (!carry) return null
    const spec = specOf('fx', mark.clip)
    if (carry.behind && spec && extent(spec, mark.x + carry.dx, false)[1] < 0) return null
    return { x: mark.x + carry.dx, lift, alpha: carry.alpha }
  }
  // A mark that belongs to nobody is left behind by a camera that moves.
  const x = mark.x - (still ? 0 : (shot.pan ?? 0) * time)
  const spec = specOf('fx', mark.clip)
  if (x !== mark.x && spec && extent(spec, x, false)[1] < 0) return null
  return { x, lift, alpha: 1 }
}

/** The scroll (px) the backdrop and the ground strip are drawn with. */
export function shotScroll(shot: Shot, time: number, still: boolean): number {
  return (shot.scroll ?? 0) + (still ? 0 : (shot.pan ?? 0) * time)
}

/**
 * The ground strip, tile by tile (`x` is the left edge, scene pixels). While a shot pans, the tiles of
 * `groundTiles(shot)` cycle through the strip: the tile at slot `i` is `tiles[(i + shift) mod n]`, where `shift` is
 * the number of whole tiles the world has gone by. The strip always covers the scene's whole width.
 */
export function groundStrip(shot: Shot, time: number, still: boolean): { tile: TileQuery; x: number }[] {
  const tiles = groundTiles(shot)
  const total = ((shot.scroll ?? 0) % 64) + shotScroll(shot, time, still) - (shot.scroll ?? 0)
  const shift = Math.floor(total / 64)
  const offset = total - shift * 64
  return tiles.map((_, i) => ({
    tile: tiles[(((i + shift) % tiles.length) + tiles.length) % tiles.length],
    x: i * 64 - offset
  }))
}
