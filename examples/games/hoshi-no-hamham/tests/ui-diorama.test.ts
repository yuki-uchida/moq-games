import { describe, expect, it } from 'vitest'
import {
  CLASSIC_FRAME,
  EXTRA_SKY,
  contentSpan,
  figureSpan,
  frameFor,
  markSpan,
  type Frame
} from '../src/ui/story-frame'
import { CREDITS_SHOT, ENDING_SCENES, SCENE_H, SCENE_W, STORY_SCENES, type Shot } from '../src/ui/story-scenes'

const SHOTS: [string, Shot][] = [
  ...Object.entries(STORY_SCENES).flatMap(([scene, shots]) =>
    shots.map((shot, page) => [`${scene} page ${page + 1}`, shot] as [string, Shot])
  ),
  ...ENDING_SCENES.map((shot, page) => [`ending page ${page + 1}`, shot] as [string, Shot]),
  ['credits', CREDITS_SHOT]
]
const ASPECTS = [2, 1.6, 4 / 3, 1.2, 1]

/** The part of a span the classic picture shows (null when it shows none of it). */
const shownInClassic = (span: readonly [number, number] | null) => {
  if (!span) return null
  const a = Math.max(0, span[0])
  const b = Math.min(SCENE_W, span[1])
  return b > a ? ([a, b] as const) : null
}

const inside = (span: readonly [number, number], frame: Frame) =>
  span[0] >= frame.x - 1e-9 && span[1] <= frame.x + frame.w + 1e-9

describe('story frames', () => {
  it('covers the opening, all ten stages, the ending and the credits', () => {
    expect(Object.keys(STORY_SCENES)).toEqual(
      expect.arrayContaining(['opening', ...Array.from({ length: 10 }, (_, i) => String(i + 1))])
    )
    expect(SHOTS.length).toBeGreaterThan(40)
  })

  it('knows the size of every figure and mark', () => {
    for (const [label, shot] of SHOTS) {
      for (const figure of shot.figures)
        expect(figureSpan(figure), `${label} ${figure.sheet}:${figure.clip}`).not.toBeNull()
      for (const mark of shot.marks ?? []) expect(markSpan(mark), `${label} fx:${mark.clip}`).not.toBeNull()
    }
  })

  for (const [label, shot] of SHOTS)
    it(`${label}: fits every panel shape and keeps what the classic picture shows`, () => {
      expect(frameFor(shot, 2)).toEqual(CLASSIC_FRAME)
      for (const aspect of ASPECTS) {
        const frame = frameFor(shot, aspect)
        const tag = `${label} at ${aspect.toFixed(2)}`
        // The asked shape, to a pixel.
        expect(Math.abs(frame.w - frame.h * aspect), `${tag} aspect`).toBeLessThanOrEqual(1)
        // Inside the scene and the sky above it, standing on the scene's bottom edge.
        expect(frame.x, tag).toBeGreaterThanOrEqual(0)
        expect(frame.x + frame.w, tag).toBeLessThanOrEqual(SCENE_W)
        expect(frame.y, tag).toBeGreaterThanOrEqual(-EXTRA_SKY)
        expect(frame.y + frame.h, tag).toBe(SCENE_H)
        expect(frame.h, tag).toBeGreaterThanOrEqual(SCENE_H)
        expect([frame.x, frame.y, frame.w, frame.h].every(Number.isInteger), `${tag} whole pixels`).toBe(true)
        // Whatever the classic picture shows of a figure or a mark, this frame shows too.
        for (const figure of shot.figures) {
          const span = shownInClassic(figureSpan(figure))
          if (span) expect(inside(span, frame), `${tag}: ${figure.sheet} ${span.join('–')} cut`).toBe(true)
        }
        for (const mark of shot.marks ?? []) {
          const span = shownInClassic(markSpan(mark))
          if (span) expect(inside(span, frame), `${tag}: fx:${mark.clip} ${span.join('–')} cut`).toBe(true)
        }
      }
    })

  it('narrows around the characters so they show larger on an upright panel', () => {
    // Opening page 2: the nest, mom and the hero span most of the scene; the frame still shows all three.
    const opening = STORY_SCENES.opening[1]
    const span = contentSpan(opening)!
    const frame = frameFor(opening, 1.2)
    expect(frame.w).toBeLessThanOrEqual(SCENE_W)
    expect(frame.x).toBeLessThanOrEqual(span[0])
    expect(frame.x + frame.w).toBeGreaterThanOrEqual(span[1])
    // A square panel is no wider than the content and its margins (or the classic height, whichever is more).
    for (const [label, shot] of SHOTS) {
      const content = contentSpan(shot)
      if (!content) continue
      const square = frameFor(shot, 1)
      expect(square.w, label).toBeLessThanOrEqual(Math.max(SCENE_H, Math.ceil(content[1] - content[0]) + 12))
    }
    // A lone figure gets the narrowest frame the backdrop allows.
    const alone = frameFor({ theme: 'meadow', figures: [{ sheet: 'hero', clip: 'idle', x: 160 }] }, 1)
    expect(alone).toEqual({ x: 80, y: 0, w: SCENE_H, h: SCENE_H })
  })

  it('keeps the classic picture for panels at least as wide as 2:1', () => {
    for (const [, shot] of SHOTS) {
      expect(frameFor(shot, 2.4)).toEqual(CLASSIC_FRAME)
      expect(frameFor(shot, Number.NaN)).toEqual(CLASSIC_FRAME)
    }
  })
})
