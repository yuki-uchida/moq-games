import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Sheet } from '../src/art/sheet'

/**
 * Art is drawn when a clip is first read, never while a module is imported or a sheet is assembled
 * (`lazyAnim` / `deferAnim` in src/art/sheet.ts). `Raster.created` counts every raster ever made, which makes
 * that observable. The pinned hashes guard the other half of the bargain: laziness must not change a pixel.
 */

/**
 * One hash per sheet over every clip's timing and every frame's size and pixels. Pixels are hashed as colours
 * (RGBA), not as palette indices: a module that registers a new colour shifts the indices of the colours
 * registered after it without changing a single pixel on screen.
 */
function hashSheet(s: Sheet): string {
  const h = createHash('sha1')
  for (const name of Object.keys(s).sort()) {
    const a = s[name]
    h.update(
      `${name}|${a.fps}|${a.loop}|${JSON.stringify(a.hold ?? null)}|${JSON.stringify(a.anchor ?? null)}|${a.frames.length}`
    )
    for (const f of a.frames) h.update(`${f.w}x${f.h}`).update(Buffer.from(f.rgba()))
  }
  return h.digest('hex').slice(0, 16)
}

/** Recorded from the eagerly drawn art before the lazy conversion; change only when the art is meant to change. */
const PINNED: Record<string, string> = {
  apeBoss: '9c86141b79925576',
  bearBoss: 'e9879d91cbe73ba2',
  beeBoss: '16b8f7f3b425fd1a',
  boarBoss: '2d5f79bc4bb888ae',
  crowBoss: 'fc621f74fa3690bf',
  flyer: 'f1346bc278ccc5ad',
  foxBoss: 'f681697069e7b54a',
  fx: 'b61fcacb7138b05c',
  hero: '3b9d3a08c487083b',
  jumper: '9616ea168d4e57a9',
  king: '48f6d1c094e2b0ff',
  'king:raged': '8de7e34a75a59eb8',
  mom: 'f22b6534e22652f2',
  princess: '3e9ce11e1b0f877c',
  'prop:animal': '0028d41eeefabcdc',
  'prop:bee': '0844d4e7efa1988c',
  'prop:berry': 'cffd4b471fcbc320',
  'prop:cage': 'b0ad261892481ef3',
  'prop:door1': '2663ad7a474b1eb8',
  'prop:door2': 'af870659aa01e925',
  'prop:feather': '0fd9a672ea9cab8e',
  'prop:fruit': '442775821251c312',
  'prop:gate': '05da0f12afe30ccf',
  'prop:goal': 'bee0e87f34950224',
  'prop:hive': '42c5dc6558d9dc29',
  'prop:log': '0232de2be544d82e',
  'prop:log:cave': '68a7efb6c9a1f190',
  'prop:log:keep': '14add3ed8414dadd',
  'prop:log:star': '93545008ca39649c',
  'prop:nest': '248f584d49e3ddb1',
  'prop:orb': 'ed60fcf66f5cfed7',
  'prop:pine': 'ebe24dea8ede898f',
  'prop:pine:cave': 'af0b5fd70c2e54d8',
  'prop:pine:keep': 'e62d4227f14c302f',
  'prop:pine:star': 'ae7883c2c24e8d80',
  'prop:pipe': '6349d799709ea1da',
  'prop:rock': '17a595cf29c75d81',
  'prop:seed': '378bc3a39454a57f',
  'prop:shock': 'c462e31904a63e3a',
  'prop:star': 'c5d0384f8ad0e20b',
  'prop:stinger': '023d428dc77dbdff',
  'prop:switch1': '89eb67eecf8588ed',
  'prop:switch2': 'e3869f683cd9354d',
  'prop:tree': 'd8d29e5dd485b06f',
  'prop:tree:cave': 'c1913ad2552bba83',
  'prop:tree:keep': '24c8e1f01bad5011',
  'prop:tree:star': '77c758e97ca39997',
  'prop:twig': 'e339dbc9311bf30c',
  spitter: '7f291dd64f402b36',
  tough: 'c3bbaccb3487532f',
  ui: '6db799f583abaac1',
  walker: '63f0b2b53526c77b',
  weaselBoss: '8e36ab68f40f7382',
  wolfBoss: '190b82199814acc4'
}

describe('lazy art', () => {
  it('draws nothing while the registry is imported', { timeout: 60_000 }, async () => {
    const { Raster } = await import('../src/art/raster')
    const before = Raster.created
    await import('../src/art')
    expect(Raster.created - before).toBe(0)
  })

  it(
    'draws nothing while a sheet is assembled, and one clip only when its frames are read',
    { timeout: 120_000 },
    async () => {
      const { Raster } = await import('../src/art/raster')
      const { sheet, sheetIds } = await import('../src/art')
      const ids = sheetIds()
      const before = Raster.created
      const sheets = ids.map((id) => sheet(id))
      expect(Raster.created - before).toBe(0)

      for (const [index, id] of ids.entries()) {
        const names = Object.keys(sheets[index])
        if (names.length < 2) continue
        const first = sheets[index][names[0]]
        const mark = Raster.created
        expect(first.frames.length, id).toBeGreaterThan(0)
        const drawn = Raster.created - mark
        expect(drawn, id).toBeGreaterThan(0)
        // Reading the same clip again reuses its frames.
        expect(first.frames).toBe(first.frames)
        expect(Raster.created - mark, id).toBe(drawn)
        // The other clips were not drawn along with it: reading them still has work to do.
        const rest = Raster.created
        for (const name of names.slice(1)) void sheets[index][name].frames
        expect(Raster.created - rest, id).toBeGreaterThan(0)
      }
    }
  )

  it('draws the hit-flash silhouettes of a clip only when they are read', async () => {
    const { Raster } = await import('../src/art/raster')
    const { flashSheet, sheet } = await import('../src/art')
    const names = Object.keys(sheet('walker'))
    const before = Raster.created
    const flashed = flashSheet('walker')
    expect(Raster.created - before).toBe(0)
    expect(flashed[names[0]].frames.length).toBe(sheet('walker')[names[0]].frames.length)
  })

  it('keeps every terrain decoration pixel for pixel as it was drawn eagerly', async () => {
    const { THEMES, decor } = await import('../src/art')
    const h = createHash('sha1')
    for (const theme of THEMES)
      for (const d of decor(theme)) {
        h.update(`${theme}|${d.where}|${d.weight}|${d.anchor}|${d.image.w}x${d.image.h}`)
        h.update(Buffer.from(d.image.rgba()))
      }
    expect(h.digest('hex')).toBe('4e2396679b68e920edcd5d1471b0eec605c40d39')
  })

  it('keeps every sheet pixel for pixel as it was drawn eagerly', { timeout: 120_000 }, async () => {
    const { sheet, sheetIds } = await import('../src/art')
    const ids = sheetIds().sort()
    expect(ids).toEqual(Object.keys(PINNED).sort())
    for (const id of ids) expect(hashSheet(sheet(id)), id).toBe(PINNED[id])
  })
})
