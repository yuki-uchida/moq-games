/**
 * Ground cycles keep their feet still against the ground. A clip with a `stride` in the contract is played by the
 * distance its actor covers, so a foot that is down must move back stride/frames px from one frame to the next: then
 * it stays where it is in the world while the body passes over it. Each module lists where its feet are down
 * (`footfalls`), and this file holds the drawing to that list:
 *
 * - the list itself: a foot that stays down moves back exactly stride/frames px a frame;
 * - the drawing has the foot where the list says: sole pixels on the ground rows within `reach` px of it, and the
 *   same pixels again on the next frame, stride/frames px further back;
 * - nothing else is on the ground rows: a foot in the air, a tail, a cape or dust drawn there would be carried
 *   along the ground with the body.
 *
 * Clips that travel without a stride are drawn off the ground (`travel: 'air'`): those that show on a body that
 * walks or charges along the ground are checked here too. A roll or a whirl (`travel: 'slide'`) stays on it.
 */
import { describe, expect, it } from 'vitest'
import { anchorOf, draftSheet } from '../src/art'
import { charFootfalls } from '../src/art/chars'
import { KING_RAGED, allSheetSpecs, type AnimSpec } from '../src/art/contract'
import type { Footfall } from '../src/art/motion'
import type { Raster } from '../src/art/raster'
import { footfalls as propFootfalls } from '../src/art/world/props/gimmicks'

const SPECS = allSheetSpecs()
const FOOTFALLS: Record<string, Record<string, Footfall>> = { ...charFootfalls, ...propFootfalls }

/** Every ground cycle of the contract (the transformed king repeats the king's poses under his fire). */
const CYCLES: { name: string; id: string; clip: string; spec: AnimSpec }[] = []
for (const [id, clips] of Object.entries(SPECS)) {
  if (id === KING_RAGED) continue
  for (const [clip, spec] of Object.entries(clips))
    if (spec.stride) CYCLES.push({ name: `${id}.${clip}`, id, clip, spec })
}

/** The lowest painted row of a frame, or -1 when it is empty. */
function lowest(frame: Raster) {
  const b = frame.bounds()
  return b ? b.y + b.h - 1 : -1
}

/** The columns a frame paints on the two ground rows (`ground` and the row above it). */
function contact(frame: Raster, ground: number) {
  const columns: number[] = []
  for (let x = 0; x < frame.w; x++) if (frame.get(x, ground) || frame.get(x, ground - 1)) columns.push(x)
  return columns
}

describe('the ground cycles of the contract', () => {
  it('are the ones this file knows', () => {
    expect(CYCLES.map((c) => c.name).sort()).toEqual(
      [
        'hero.run',
        'mom.move',
        'walker.move',
        'tough.move',
        'weaselBoss.attack',
        'boarBoss.attack',
        'wolfBoss.attack',
        'bearBoss.move',
        'foxBoss.move',
        'apeBoss.move',
        'king.move',
        'prop:animal.run'
      ].sort()
    )
  })

  it('have no per-frame holds (a cycle played by distance gives every frame the same share of the stride)', () => {
    for (const { id, clip, spec } of CYCLES) expect(spec.hold, `${id}.${clip}`).toBeUndefined()
  })
})

describe.each(CYCLES)('$name keeps its feet still against the ground', ({ id, clip, spec }) => {
  const table: Footfall | undefined = FOOTFALLS[id]?.[clip]
  const per = spec.stride! / spec.frames

  it('lists where its feet are down', () => {
    expect(table, `${id} exports no footfalls.${clip}`).toBeDefined()
    expect(table!.feet.length).toBeGreaterThanOrEqual(2)
    for (const foot of table!.feet) {
      expect(foot.length).toBe(spec.frames)
      // Every foot comes down, and every foot leaves the ground.
      expect(foot.some((x) => x !== null)).toBe(true)
      expect(foot.some((x) => x === null)).toBe(true)
    }
    expect(table!.reach).toBeGreaterThan(0)
    expect(table!.reach).toBeLessThanOrEqual(16)
  })

  it('a foot that stays down moves back stride/frames px a frame', () => {
    if (!table) return
    let pairs = 0
    table.feet.forEach((foot, f) => {
      for (let i = 0; i < spec.frames; i++) {
        const a = foot[i]
        const b = foot[(i + 1) % spec.frames]
        if (a === null || b === null) continue
        pairs++
        expect(b - a, `foot ${f}, frame ${i} to ${(i + 1) % spec.frames}`).toBeCloseTo(-per, 6)
      }
    })
    // At least one foot is seen planted over two frames, or the cycle shows no grip at all.
    expect(pairs).toBeGreaterThan(0)
  })

  it('the drawing has each foot where the list says, and nothing else on the ground', () => {
    if (!table) return
    const anim = draftSheet(id)[clip]
    expect(anim, `${id}.${clip} is drawn`).toBeDefined()
    const ax = anchorOf(anim)[0]
    const frames = anim.frames
    const ground = Math.max(...frames.map(lowest))
    for (let i = 0; i < frames.length; i++) {
      const columns = contact(frames[i], ground)
      const down = table.feet.map((foot) => foot[i]).filter((x): x is number => x !== null)
      for (const x of down)
        expect(
          columns.some((c) => Math.abs(c - (ax + x)) <= table.reach),
          `frame ${i}: no sole on the ground within ${table.reach} px of ${x} (ground columns ${columns.join(' ')})`
        ).toBe(true)
      const stray = columns.filter((c) => !down.some((x) => Math.abs(c - (ax + x)) <= table.reach + 1))
      expect(
        stray.map((c) => c - ax),
        `frame ${i}: paint on the ground rows away from every foot that is down (px from the anchor)`
      ).toEqual([])
    }
  })

  it('a planted foot is drawn the same again, stride/frames px further back', () => {
    if (!table) return
    const anim = draftSheet(id)[clip]
    const ax = anchorOf(anim)[0]
    const frames = anim.frames
    const ground = Math.max(...frames.map(lowest))
    const near = (i: number, x: number) =>
      contact(frames[i], ground).filter((c) => Math.abs(c - (ax + x)) <= table.reach)
    table.feet.forEach((foot, f) => {
      for (let i = 0; i < spec.frames; i++) {
        const j = (i + 1) % spec.frames
        const a = foot[i]
        const b = foot[j]
        if (a === null || b === null) continue
        const here = near(i, a)
        const next = new Set(near(j, b))
        const shift = Math.round(per)
        const kept = here.filter((c) => next.has(c - shift)).length
        expect(
          kept / Math.max(1, Math.min(here.length, next.size)),
          `foot ${f}, frame ${i} to ${j}: the sole's pixels do not line up ${shift} px further back`
        ).toBeGreaterThanOrEqual(0.5)
      }
    })
  })
})

describe('clips that travel along the ground without a stride are drawn off it', () => {
  /** [sheet, clip, the frames that may still touch the ground (a take-off, a landing)] */
  const LEAPS: [string, string, number[]][] = [
    ['foxBoss', 'shoot', [0, 5]],
    ['prop:animal', 'wake', [0]]
  ]
  it.each(LEAPS)('%s.%s', (id, clip, touching) => {
    expect(SPECS[id][clip].travel).toBe('air')
    const anim = draftSheet(id)[clip]
    // The ground rows of the sheet: where its standing or running clip puts its feet.
    const sheet = draftSheet(id)
    const stand = sheet.idle ?? sheet.run
    const ground = Math.max(...stand.frames.map(lowest))
    anim.frames.forEach((frame, i) => {
      if (touching.includes(i)) return
      expect(lowest(frame), `frame ${i} reaches the ground rows`).toBeLessThan(ground - 1)
    })
  })
})

describe('a roll or a whirl along the ground stays on the ground', () => {
  /** [sheet, clip]: charges drawn rolling or spinning (`travel: 'slide'`), on bodies the simulation keeps on the ground. */
  const ROLLS: [string, string][] = [
    ['king', 'attack'],
    ['foxBoss', 'attack']
  ]
  it.each(ROLLS)('%s.%s touches the ground in every frame, at one height', (id, clip) => {
    expect(SPECS[id][clip].travel).toBe('slide')
    const sheet = draftSheet(id)
    const ground = Math.max(...sheet.idle.frames.map(lowest))
    const rows = sheet[clip].frames.map(lowest)
    // On the ground rows of his standing pose (a whirl's streaks may sweep a little below them), never hovering.
    for (const [i, row] of rows.entries()) {
      expect(row, `frame ${i} hovers`).toBeGreaterThanOrEqual(ground - 2)
      expect(row, `frame ${i} sinks`).toBeLessThanOrEqual(ground + 6)
    }
  })
})
