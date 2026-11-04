import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { mapTile } from '../src/art/maps'
import { tileHash } from '../src/art/world'

const hashes = {
  playground: '85b1e61b7be13e98ed72dd8af2db04575739852e61bd51344bede37c2ce31768',
  gym: 'be66161189f4b7c9d530fbae01ad419c1d32aa60e98f8db9492cb8875fad07ea',
  sidewalk: '8afc3bd2dc5922a842a2a3f35993e184d316624baac2fa43e378caf00a60b631',
  campus: '216b80847ed0a306ba689cb8dd7e627c3d09e2749e8004a03e41700c01543b6c',
  street: '790136833a50bfcea083dc0c1cb2f299ebba4df0ebf159e3604715d4219ca00f',
  golf: '1998c75f668de108294cd5f5192a1407f6c8459bd12709108c974f5c605474b4',
  garden: 'f811c087811f3060060e1ddb226f1c8c09db8812aacb434c1421ec7e551ddfc1',
  ward: '61feb97b3a8254a0660c265bc11e53541da3209f43e2b0e93a0abb1f9a56ee2a'
}

test.each(Object.entries(hashes))(
  '%s preserves every pixel across negative coordinates and features',
  (ground, expected) => {
    const hash = createHash('sha256')
    for (let ty = -10; ty <= 10; ty++)
      for (let tx = -10; tx <= 10; tx++) hash.update(mapTile(ground, tx, ty, tileHash(tx, ty)).data)
    expect(hash.digest('hex')).toBe(expected)
  }
)

test.each(['gym', 'campus', 'ward'])('%s shares identical unfeatured base tiles', (ground) => {
  for (const variantHash of [0, 4, 6]) {
    const tiles = new Map<string, ReturnType<typeof mapTile>>()
    for (let ty = -10; ty <= 10; ty++)
      for (let tx = -10; tx <= 10; tx++) {
        const tile = mapTile(ground, tx, ty, variantHash)
        const pixels = Buffer.from(tile.data).toString('base64')
        const previous = tiles.get(pixels)
        if (previous) expect(tile).toBe(previous)
        else tiles.set(pixels, tile)
      }
    expect(tiles.size).toBe(ground === 'campus' ? 1 : 2)
  }
})
