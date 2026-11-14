import { describe, expect, test } from 'vitest'
import {
  BOSS_ARTS,
  BOSS_KIND,
  ENEMY_KINDS,
  THEMES,
  TILE_KINDS,
  VIEW_H,
  VIEW_W,
  allSheetSpecs,
  type Neighbour
} from '../src/art/contract'
import { anchorOf, backdrop, clearArtCache, decor, sheet, sheetIds, tile } from '../src/art/index'
import { paletteSize } from '../src/art/palette'
import { STAGES } from '../src/game/stages'

const specs = allSheetSpecs()

/** Character cells: sheets whose frames must stay clear of the frame edge and stand on their anchor row. */
const CHARACTERS = ['hero', 'princess', 'mom', ...ENEMY_KINDS, ...BOSS_ARTS]
/** Clips in which the character stands on the ground (flying characters have none). */
const GROUNDED: Record<string, string[]> = {
  hero: ['idle', 'run', 'land'],
  princess: ['idle', 'sad'],
  mom: ['idle', 'move', 'tired'],
  walker: ['idle', 'move'],
  jumper: ['idle', 'land'],
  spitter: ['idle', 'shoot'],
  tough: ['idle', 'move'],
  weaselBoss: ['idle', 'recover'],
  boarBoss: ['idle', 'recover'],
  wolfBoss: ['idle', 'recover'],
  bearBoss: ['idle', 'move', 'land', 'recover'],
  foxBoss: ['idle', 'move', 'recover'],
  apeBoss: ['idle', 'move', 'land', 'recover'],
  king: ['idle', 'move', 'land', 'recover']
}

describe('every sheet matches the art contract', () => {
  for (const [id, spec] of Object.entries(specs))
    test(id, () => {
      const s = sheet(id)
      for (const [name, want] of Object.entries(spec)) {
        const a = s[name]
        expect(a, `${id}#${name} is missing`).toBeDefined()
        expect(a.frames.length, `${id}#${name} frames`).toBe(want.frames)
        expect(a.loop, `${id}#${name} loop`).toBe(want.loop)
        expect(a.fps, `${id}#${name} fps`).toBe(want.fps)
        // A clip has `sustain` exactly when its spec does, and it is a usable tail.
        expect(a.sustain, `${id}#${name} sustain`).toBe(want.sustain)
        if (want.sustain !== undefined) {
          expect(want.loop, `${id}#${name} a looping clip has no sustain`).toBe(false)
          expect(want.sustain, `${id}#${name} sustain is at least 2`).toBeGreaterThanOrEqual(2)
          expect(want.sustain, `${id}#${name} sustain is at most its frame count`).toBeLessThanOrEqual(want.frames)
        }
        for (const f of a.frames) {
          expect([f.w, f.h], `${id}#${name} frame size`).toEqual([want.w, want.h])
          expect(f.count(), `${id}#${name} has an empty frame`).toBeGreaterThan(0)
          for (const c of f.data) if (c >= paletteSize()) throw new Error(`${id}#${name} uses colour ${c}`)
        }
        if (want.anchor) expect(anchorOf(a), `${id}#${name} anchor`).toEqual(want.anchor)
        // The view times clips from the contract: a clip lingers on a frame only where the contract says so.
        expect(a.hold && [...a.hold], `${id}#${name} hold`).toEqual(want.hold && [...want.hold])
        if (want.hold) {
          expect(want.hold.length, `${id}#${name} hold length`).toBe(want.frames)
          for (const ticks of want.hold) expect(Number.isInteger(ticks) && ticks >= 1, `${id}#${name} hold`).toBe(true)
        }
      }
    })
})

describe('drawn sheets are real pixel art, not padding', () => {
  for (const [id, spec] of Object.entries(specs))
    test(id, () => {
      const s = sheet(id)
      for (const name of Object.keys(spec)) {
        const a = s[name]
        // Neighbouring frames must differ, and a loop must not stall at its seam.
        for (let i = 1; i < a.frames.length; i++)
          expect(a.frames[i].equals(a.frames[i - 1]), `${id}#${name} frame ${i} repeats frame ${i - 1}`).toBe(false)
        if (a.loop && a.frames.length > 2)
          expect(a.frames[0].equals(a.frames[a.frames.length - 1]), `${id}#${name} loop seam repeats`).toBe(false)
        for (const [i, f] of a.frames.entries()) {
          expect(f.colors().size, `${id}#${name} frame ${i} colour budget`).toBeLessThanOrEqual(32)
          if (!CHARACTERS.includes(id)) continue
          expect(f.colors().size, `${id}#${name} frame ${i} is flat`).toBeGreaterThanOrEqual(6)
          const b = f.bounds()!
          const clipped = b.x === 0 || b.y === 0 || b.x + b.w === f.w || b.y + b.h === f.h
          expect(clipped, `${id}#${name} frame ${i} touches the frame edge`).toBe(false)
        }
        if (GROUNDED[id]?.includes(name)) {
          const [, ay] = anchorOf(a)
          for (const [i, f] of a.frames.entries()) {
            const b = f.bounds()!
            const bottom = b.y + b.h - 1
            expect(bottom, `${id}#${name} frame ${i} floats above its anchor row`).toBeGreaterThanOrEqual(ay - 2)
            expect(bottom, `${id}#${name} frame ${i} sinks below its anchor row`).toBeLessThanOrEqual(ay + 3)
          }
        }
      }
    })
})

test('art is deterministic', () => {
  const before = sheetIds().map((id) => Object.values(sheet(id)).map((a) => a.frames.map((f) => Array.from(f.data))))
  clearArtCache()
  const after = sheetIds().map((id) => Object.values(sheet(id)).map((a) => a.frames.map((f) => Array.from(f.data))))
  expect(after).toEqual(before)
}, 60_000)

test('the boss table agrees with the stage list', () => {
  for (const stage of STAGES) {
    const art = stage.boss.art
    expect(sheetIds(), `${stage.id} boss art`).toContain(art)
    if (art === 'mom') continue
    expect(BOSS_KIND[art as keyof typeof BOSS_KIND], `${art} fights as ${stage.boss.kind}`).toBe(stage.boss.kind)
  }
})

describe('terrain', () => {
  const others: Neighbour[] = ['empty', 'solid', 'dirt', 'platform', 'spike', undefined]
  for (const theme of THEMES)
    test(theme, () => {
      for (const kind of TILE_KINDS)
        for (const other of others) {
          const around = [other, kind, other, kind, other, kind, other, kind] as const
          const r = tile({ theme, kind, around, tx: 3, ty: 5 })
          expect([r.w, r.h]).toEqual([64, 64])
          expect(r.count(), `${theme} ${kind} beside ${String(other)}`).toBeGreaterThan(0)
          // Ground never has holes: collision is the whole cell.
          if (kind === 'solid' || kind === 'dirt') expect(r.count(), `${theme} ${kind} has holes`).toBe(64 * 64)
        }
      // The same query always paints the same tile.
      const buried = ['solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid'] as const
      const open = ['empty', 'empty', 'solid', 'solid', 'solid', 'solid', 'solid', 'empty'] as const
      const a = tile({ theme, kind: 'solid', around: buried, tx: 7, ty: 9 })
      expect(a.equals(tile({ theme, kind: 'solid', around: buried, tx: 7, ty: 9 }))).toBe(true)
      // A buried tile differs from an exposed one.
      const b = tile({ theme, kind: 'solid', around: open, tx: 7, ty: 9 })
      expect(a.equals(b), `${theme}: exposed and buried ground look the same`).toBe(false)
      // Diggable dirt must not be mistaken for ground.
      const dirt = tile({ theme, kind: 'dirt', around: buried, tx: 7, ty: 9 })
      const shared = [...dirt.colors()].filter((c) => a.colors().has(c)).length
      expect(shared, `${theme}: dirt shares most of its colours with ground`).toBeLessThan(dirt.colors().size / 2)
      const set = decor(theme)
      expect(set.filter((d) => d.where === 'top').length, `${theme} top decorations`).toBeGreaterThanOrEqual(4)
      for (const d of set) {
        expect(d.image.count()).toBeGreaterThan(0)
        expect(d.image.w, `${theme} decoration width`).toBeLessThanOrEqual(64)
        expect(d.weight).toBeGreaterThan(0)
      }
    })
})

describe('backdrops', () => {
  for (const theme of THEMES)
    test(theme, () => {
      const b = backdrop(theme)
      expect([b.sky.w, b.sky.h]).toEqual([VIEW_W, VIEW_H])
      expect(b.sky.count(), `${theme} sky has holes`).toBe(VIEW_W * VIEW_H)
      expect(b.layers.length, `${theme} parallax layers`).toBeGreaterThanOrEqual(3)
      let last = 0
      for (const [i, layer] of b.layers.entries()) {
        expect(layer.image.w, `${theme} layer ${i} width`).toBe(VIEW_W)
        expect(layer.image.h, `${theme} layer ${i} height`).toBeLessThanOrEqual(VIEW_H)
        expect(layer.image.count(), `${theme} layer ${i} is empty`).toBeGreaterThan(0)
        expect(layer.y, `${theme} layer ${i} top`).toBeLessThan(VIEW_H)
        if (layer.front) expect(layer.parallax, `${theme} layer ${i} foreground parallax`).toBeGreaterThanOrEqual(1)
        else {
          expect(layer.parallax, `${theme} layer ${i} is ordered back to front`).toBeGreaterThanOrEqual(last)
          expect(layer.parallax).toBeLessThan(1)
          last = layer.parallax
        }
      }
    })
})
