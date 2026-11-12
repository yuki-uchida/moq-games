import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Sheet } from '../src/art/sheet'

/**
 * Art is drawn when a clip is first read, never while a module is imported or a sheet is assembled
 * (`lazyAnim` / `deferAnim` in src/art/sheet.ts). `Raster.created` counts every raster ever made, which makes
 * that observable. The pinned hashes guard the other half of the bargain: laziness must not change a pixel.
 */

/** One hash per sheet over every clip's timing and every frame's size and pixels. */
function hashSheet(s: Sheet): string {
  const h = createHash('sha1')
  for (const name of Object.keys(s).sort()) {
    const a = s[name]
    h.update(
      `${name}|${a.fps}|${a.loop}|${JSON.stringify(a.hold ?? null)}|${JSON.stringify(a.anchor ?? null)}|${a.frames.length}`
    )
    for (const f of a.frames)
      h.update(`${f.w}x${f.h}`).update(Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength))
  }
  return h.digest('hex').slice(0, 16)
}

/** Recorded from the eagerly drawn art before the lazy conversion; change only when the art is meant to change. */
const PINNED: Record<string, string> = {
  apeBoss: '7fe861c2ad7bfe25',
  bearBoss: '2cbe7ec521ac3658',
  beeBoss: 'ac4274b2b2fd7606',
  boarBoss: '081293f3d158ca5a',
  crowBoss: '50153f2fbbc52026',
  flyer: '49442ef57f74fe98',
  foxBoss: 'aa8193282e68d05a',
  fx: '7b11d8c732e3f476',
  hero: '6fab6f9fd55bba6e',
  jumper: 'f1ce7dde39fc5b1c',
  king: '80735bb825f39a56',
  mom: 'e3cb1ac29d1efb7d',
  princess: '6cbcfd7a36049843',
  'prop:animal': 'dafef98a3ac62330',
  'prop:bee': '8623c6cc3fba488e',
  'prop:berry': 'cf60e93b22e46490',
  'prop:cage': 'efa1e76b82c05163',
  'prop:door1': 'd96c3e82963eac01',
  'prop:door2': '5c58872b334d6427',
  'prop:feather': '2e29140e4fc3d208',
  'prop:fruit': '7d8644bf8a24fe70',
  'prop:gate': 'b38c4b3d05899ea2',
  'prop:goal': 'f1295434dcca6c78',
  'prop:hive': 'da1fb4113de2113c',
  'prop:log': 'ce22a15e997a45c4',
  'prop:log:cave': '0fd1fe6e09ce6c84',
  'prop:log:keep': 'e77519d6cafb11da',
  'prop:log:star': '8c697fd06afd22b8',
  'prop:nest': 'a10f5f3670152de7',
  'prop:orb': 'adf1661a0e9feaf8',
  'prop:pine': '33db2eec5c65f104',
  'prop:pine:cave': '321644b437d87bc4',
  'prop:pine:keep': '31cdb3b2e5be87b8',
  'prop:pine:star': 'e3841366e402959b',
  'prop:pipe': '698d73d7da831552',
  'prop:rock': 'ac5511f37e6475a6',
  'prop:seed': '085c1eb1c0dfbc92',
  'prop:shock': '3743238bb823de7e',
  'prop:star': 'bbadf159776b84c5',
  'prop:stinger': 'bc23bc3b8f411fa4',
  'prop:switch1': '421079938f2db64a',
  'prop:switch2': '9acc3e3892122158',
  'prop:tree': '3615526496bf3307',
  'prop:tree:cave': '6e935b06d23019e0',
  'prop:tree:keep': '10ebc7e3705925a9',
  'prop:tree:star': '45c541171364992d',
  'prop:twig': 'd084c5dd023fae08',
  spitter: 'fed3768954873e19',
  tough: '540a4576cf9bd368',
  ui: 'acc9511e3b2c17f9',
  walker: '12c2c345ee93d6f7',
  weaselBoss: '134d7358fecf910e',
  wolfBoss: '8bd66c04db43be0d'
}

describe('lazy art', () => {
  it('draws nothing while the registry is imported', async () => {
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
        h.update(Buffer.from(d.image.data.buffer, d.image.data.byteOffset, d.image.data.byteLength))
      }
    expect(h.digest('hex')).toBe('e15a560f551a27934fac740c5dcf59dedeb85452')
  })

  it('keeps every sheet pixel for pixel as it was drawn eagerly', { timeout: 120_000 }, async () => {
    const { sheet, sheetIds } = await import('../src/art')
    const ids = sheetIds().sort()
    expect(ids).toEqual(Object.keys(PINNED).sort())
    for (const id of ids) expect(hashSheet(sheet(id)), id).toBe(PINNED[id])
  })
})
