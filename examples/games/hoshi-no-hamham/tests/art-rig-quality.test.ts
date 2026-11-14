/**
 * Quality gates for the character sheets. They measure what a pixel
 * artist would see in the contact sheet: stray pixels, missing outline, loop pops, twin frames, flicker in quiet
 * clips, figures touching the cell edge. Every failure names the sheet, the clip, the frame and the pixel.
 * The thresholds live in `LIMITS` (src/art/quality.ts), with the reasoning.
 */
import { describe, expect, test } from 'vitest'
import { BOSS_ARTS, ENEMY_KINDS } from '../src/art/contract'
import { sheet } from '../src/art/index'
import {
  LIMITS,
  boil,
  colours,
  edgeTouch,
  lightEdgeBlobs,
  loopSeam,
  orphans,
  stillness,
  type Px
} from '../src/art/quality'

/** Clips where the character is calm: contours must hold still, so flicker is a fault, not motion. */
const QUIET = new Set(['idle', 'blink', 'sad', 'recover', 'stunned', 'tired'])
/**
 * Quiet clips that are not still: a hovering boss beats its wings in `idle` and `recover` (the crow's deep
 * strokes, the queen's flutter between a spread and a blurred wing). That is the motion, not a contour that
 * boils, so the flicker gate does not apply to them.
 */
const WING_BEAT: Record<string, readonly string[]> = {
  crowBoss: ['idle', 'recover'],
  beeBoss: ['idle', 'recover']
}

const characters: readonly string[] = ['hero', 'princess', 'mom', ...ENEMY_KINDS, ...BOSS_ARTS, 'king:raged']

const where = (list: readonly Px[], max = 8) =>
  list
    .slice(0, max)
    .map(([x, y]) => `(${x},${y})`)
    .join(' ') + (list.length > max ? ` … ${list.length} in all` : '')

/** Every gate on one sheet; returns one line per fault. */
function faults(id: string): string[] {
  const out: string[] = []
  const s = sheet(id)
  for (const [name, anim] of Object.entries(s)) {
    const at = `${id}/${name}`
    anim.frames.forEach((f, i) => {
      const o = orphans(f)
      if (o.length) out.push(`${at} frame ${i}: orphan pixels ${where(o)}`)
      for (const blob of lightEdgeBlobs(f)) {
        const { x, y, w, h } = blob.box
        out.push(
          `${at} frame ${i}: ${blob.light.length} light pixels on the edge (no outline) of the ${blob.size} px blob at x ${x}..${x + w - 1}, y ${y}..${y + h - 1} (${w}×${h}): ${where(blob.light)}`
        )
      }
      const c = colours(f)
      if (c > LIMITS.colours) out.push(`${at} frame ${i}: ${c} colours, at most ${LIMITS.colours}`)
      const e = edgeTouch(f)
      if (e.length) out.push(`${at} frame ${i}: touches the cell edge ${where(e)}`)
    })
    if (anim.loop) {
      const seam = loopSeam(anim)
      if (seam.ratio > LIMITS.seamRatio)
        out.push(
          `${at}: loop pops, last→first changes ${seam.seam}px, ${seam.ratio.toFixed(2)}× the largest step (${seam.max}px), at most ${LIMITS.seamRatio}×`
        )
      for (const [a, b] of stillness(anim)) out.push(`${at}: frames ${a} and ${b} are near duplicates`)
    }
    if (QUIET.has(name) && !WING_BEAT[id]?.includes(name) && anim.frames.length >= LIMITS.boilFrames) {
      const b = boil(anim)
      const pct = (v: number) => `${(v * 100).toFixed(1)} %`
      if (b.max > LIMITS.boil)
        out.push(
          `${at} frames ${b.worst.frame}..${b.worst.frame + 3}: contour flicker, ${b.worst.count} pixels flip back and forth, ${pct(b.max)} of the ${b.worst.outline.toFixed(0)} px outline (at most ${pct(LIMITS.boil)}) ${where(b.worst.pixels)}`
        )
      if (b.mean > LIMITS.boilMean)
        out.push(
          `${at}: contour flicker, ${pct(b.mean)} of the outline flips back and forth on average (at most ${pct(LIMITS.boilMean)})`
        )
    }
  }
  return out
}

describe('character quality gates', () => {
  test.each(characters)(
    '%s passes every gate',
    (id) => {
      const found = faults(id)
      expect(found, `${id}:\n  ${found.join('\n  ')}`).toEqual([])
    },
    60_000
  )
})
