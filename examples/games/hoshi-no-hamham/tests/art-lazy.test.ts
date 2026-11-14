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
  apeBoss: 'dee4cea90730d6bf',
  bearBoss: 'b39630da52fef537',
  beeBoss: 'de6778bac758ffce',
  boarBoss: 'd935d4b4be8ce9b7',
  crowBoss: '2565b7b03a9918aa',
  flyer: 'f1346bc278ccc5ad',
  foxBoss: '4c8b46c22192dcaf',
  fx: 'b61fcacb7138b05c',
  hero: '8b2edaa9b9a9b196',
  jumper: '0017407d8d8af494',
  king: '591bcab9bb8b6b74',
  mom: '1f8dd31225add106',
  princess: '3e9ce11e1b0f877c',
  'prop:animal': '3cb39f00b24dcbc1',
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
  tough: '23167ee84770d851',
  ui: '6db799f583abaac1',
  walker: '62f0d007e04044c0',
  weaselBoss: '7af5fbadb1880000',
  wolfBoss: '23148acfa0051b22'
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
