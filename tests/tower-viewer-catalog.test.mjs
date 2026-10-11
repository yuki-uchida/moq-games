import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { towerViewerCatalog } from '../scripts/tower-viewer-catalog.mjs'

test('EXTRA catalogs only published 3D sheet frames and hashes actual bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'tower-viewer-'))
  try {
    const art = join(root, 'public/tower-defense-viewer/sheets')
    const clip = {
      motion: 'walk',
      direction: 's',
      texture: 'sheet.png',
      textureWidth: 2,
      textureHeight: 1,
      loop: true,
      frames: [
        { index: 0, x: 0, y: 0, width: 1, height: 1, durationMs: 50, pivot: { x: 0, y: 0 } },
        { index: 1, x: 1, y: 0, width: 1, height: 1, durationMs: 70, pivot: { x: 0, y: 0 } }
      ]
    }
    for (const directory of ['slime']) {
      const pack = join(art, directory)
      mkdirSync(pack, { recursive: true })
      writeFileSync(join(pack, 'walk-s.json'), JSON.stringify(clip))
      writeFileSync(join(pack, 'sheet.png'), Buffer.from([1, 2, 3, 4]))
    }
    const catalog = towerViewerCatalog(root)
    assert.equal(catalog.clips.length, 1)
    assert.equal(catalog.clips[0].role, 'slime')
    assert.deepEqual(catalog.clips[0].frameStartTimesMs, [0, 50])
    assert.equal(catalog.clips[0].durationMs, 120)
    assert.equal(catalog.clips[0].texture.bytes, 4)
    assert.match(catalog.clips[0].texture.sha256, /^[a-f0-9]{64}$/)
    writeFileSync(join(art, 'slime/walk-s.json'), JSON.stringify({ ...clip, texture: '../soldier/sheet.png' }))
    assert.equal(towerViewerCatalog(root).clips.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('missing 3D packs produce an honest empty catalog', () => {
  const root = mkdtempSync(join(tmpdir(), 'tower-empty-'))
  try {
    assert.deepEqual(towerViewerCatalog(root), { version: 1, clips: [] })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
