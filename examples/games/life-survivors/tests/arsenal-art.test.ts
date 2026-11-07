import { describe, expect, test } from 'vitest'
import { PALETTE } from '../src/art/palette'
import { BEAM_DIRS, STAPLE_DIRS, arsenalFx, arsenalIcons, arsenalSheets, beam } from '../src/art/arsenal'
import type { Anim } from '../src/art/sheet'

const sheets = Object.fromEntries(Object.entries(arsenalSheets()).map(([id, make]) => [id, make()]))
const frames = (id: string, name: string) => sheets[`weapon:${id}`][name].frames

describe('arsenal art', () => {
  test('weapon sheets have the stated frames, 32×32, looping', () => {
    const expected: Record<string, Record<string, number>> = {
      w_pet: { fly: 4, bite: 2 },
      w_pet_cat: { fly: 4, bite: 2 },
      w_pet_rabbit: { fly: 4, bite: 2 },
      w_pet_parakeet: { fly: 4, bite: 2 },
      w_pet_hamster: { fly: 4, bite: 2 },
      w_reading: { fly: 4 },
      w_overtime: { fly: STAPLE_DIRS },
      w_ring: { fly: 4 },
      w_travel: { fly: 4 },
      w_garden: { fly: 4, sprout: 4, bloom: 4, tulip: 4, daisy: 4 },
      w_savings: { fly: 2, armed: 2 },
      w_gamble: { fly: 4, faces: 6 },
      w_cooking: { fly: 4, alt: 4, alt2: 4 },
      w_karaoke: { fly: 2 },
      w_muscle: { fly: 2 }
    }
    expect(STAPLE_DIRS).toBe(16)
    for (const [id, anims] of Object.entries(expected))
      for (const [name, n] of Object.entries(anims)) {
        expect(sheets[`weapon:${id}`][name].loop).toBe(true)
        expect(frames(id, name)).toHaveLength(n)
        for (const f of frames(id, name)) expect([f.w, f.h]).toEqual([32, 32])
      }
  })

  test('each pet has distinct running and biting sprites', () => {
    const ids = ['w_pet', 'w_pet_cat', 'w_pet_rabbit', 'w_pet_parakeet', 'w_pet_hamster']
    for (const animation of ['fly', 'bite']) {
      const images = ids.map((id) => [...frames(id, animation)[0].data].join(','))
      expect(new Set(images).size).toBe(ids.length)
    }
    for (const id of ids) expect(frames(id, 'bite')[0].data).not.toEqual(frames(id, 'bite')[1].data)
  })

  test('fx particles exist with sizes and frame counts', () => {
    const fx = arsenalFx()
    const spec: Record<string, [number, number, number]> = {
      like: [3, 16, 16],
      note: [3, 12, 14],
      dust: [3, 16, 16],
      crack: [2, 48, 24],
      perfume: [3, 32, 32],
      boom: [5, 48, 48],
      spark: [3, 12, 12],
      crit: [2, 20, 20],
      poof: [4, 24, 24],
      shine: [2, 8, 8],
      heal: [2, 12, 12]
    }
    for (const [name, [n, w, h]] of Object.entries(spec)) {
      expect(fx[name].frames).toHaveLength(n)
      for (const f of fx[name].frames) expect([name, f.w, f.h]).toEqual([name, w, h])
    }
  })

  test('icons are 32×32', () => {
    const icons = arsenalIcons()
    const ids = [
      'w_sns',
      'w_pet',
      'w_muscle',
      'w_reading',
      'w_overtime',
      'w_ring',
      'w_karaoke',
      'w_travel',
      'w_garden',
      'w_savings',
      'w_gamble',
      'w_gamble_gacha',
      'w_gamble_poker',
      'w_gamble_pachinko',
      'w_gamble_horse',
      'w_perfume',
      'w_cooking',
      'p_lucky',
      'p_clever',
      'p_curious',
      'p_savvy'
    ]
    for (const id of ids) expect([id, icons[id]?.w, icons[id]?.h]).toEqual([id, 32, 32])
  })

  test('beam sizes, caching and wrapping', () => {
    expect(BEAM_DIRS).toBe(32)
    const b = beam(170, 0)
    expect(b.w).toBe(b.h)
    expect(b.w).toBeGreaterThanOrEqual(340)
    expect(beam(170, 0)).toBe(b)
    expect(beam(170, 32)).toBe(b)
    expect(beam(170, 8)).not.toBe(b)
    expect(b.data.some((c) => c)).toBe(true)
  })

  test('palette-only, deterministic', () => {
    const all: Anim[] = [...Object.values(arsenalFx()), ...Object.values(sheets).flatMap((s) => Object.values(s))]
    const rasters = [...all.flatMap((a) => a.frames), ...Object.values(arsenalIcons()), beam(64, 3), beam(64, 11)]
    // One assertion per raster on its highest index (a per-pixel expect made this test the slowest in the file).
    for (const r of rasters) {
      let top = 0
      for (const c of r.data) if (c > top) top = c
      expect(top).toBeLessThan(PALETTE.length)
    }
    const again = arsenalSheets()['weapon:w_gamble']()
    expect(again.faces.frames[5].data).toEqual(frames('w_gamble', 'faces')[5].data)
    expect(arsenalFx().boom.frames[2].data).toEqual(arsenalFx().boom.frames[2].data)
  })
})
