import { describe, expect, test } from 'vitest'
import { allSheetSpecs } from '../src/art/contract'
import { anchorOf, sheet, tile } from '../src/art/index'
import { PALETTE } from '../src/art/palette'
import { STAGES, STAGE_TILES, TILE } from '../src/vocab'

const specs = allSheetSpecs()

describe('every sheet matches the art contract', () => {
  for (const [id, spec] of Object.entries(specs))
    test(id, () => {
      const s = sheet(id)
      for (const [name, want] of Object.entries(spec)) {
        const a = s[name]
        expect(a, `${id}#${name} is missing`).toBeDefined()
        expect(a.frames.length, `${id}#${name} frames`).toBe(want.frames)
        expect(a.loop, `${id}#${name} loop`).toBe(want.loop)
        expect(a.fps, `${id}#${name} fps`).toBeGreaterThan(0)
        for (const f of a.frames) {
          expect([f.w, f.h], `${id}#${name} frame size`).toEqual([want.w, want.h])
          expect(f.count(), `${id}#${name} has an empty frame`).toBeGreaterThan(0)
          for (const c of f.data) if (c >= PALETTE.length) throw new Error(`${id}#${name} uses colour ${c}`)
        }
        if (want.anchor) expect(anchorOf(a), `${id}#${name} anchor`).toEqual(want.anchor)
        if (want.lift) expect(a.lift?.length, `${id}#${name} lift`).toBe(want.frames)
        if (a.hold) expect(a.hold.length, `${id}#${name} hold`).toBe(want.frames)
      }
    })
})

test('art is deterministic', () => {
  const a = sheet('hero:slime:sword').idle_down.frames[0].data
  expect(Array.from(a)).toEqual(Array.from(sheet('hero:slime:sword').idle_down.frames[0].data))
})

test('every stage tileset draws every listed kind next to every other kind', () => {
  for (const stage of STAGES)
    for (const kind of STAGE_TILES[stage])
      for (const other of STAGE_TILES[stage]) {
        const around = [other, kind, other, kind, other, kind, other, kind] as const
        const r = tile({ stage, kind, around, tx: 3, ty: 5, frame: 0 })
        expect([r.w, r.h]).toEqual([TILE, TILE])
        expect(r.count(), `${stage} ${kind} beside ${other}`).toBeGreaterThan(0)
      }
})
