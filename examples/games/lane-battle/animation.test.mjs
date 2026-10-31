import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { animationFrame, spriteRect } from './animation.js'
import { TYPES } from './simulation.js'
test('original foot pixels meet the shared ground anchor in every left/right motion frame', async () => {
  for (const t of TYPES)
    for (const direction of ['e', 'w'])
      for (const motion of ['idle', 'walk', 'attack']) {
        const root = new URL(`../../../public/tower-defense-art/${t.role}/`, import.meta.url)
        const meta = JSON.parse(await readFile(new URL(`${t.file}-${motion}-${direction}.json`, root)))
        for (const frame of meta.frames) {
          const { data, info } = await sharp(new URL(meta.texture, root).pathname)
            .extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
          let bottom = 0
          for (let y = 0; y < info.height; y++)
            for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 100) bottom = y
          const rect = spriteRect(frame, 0, 0, 128)
          const foot = rect[1] + bottom + 1
          assert.ok(foot >= -5 && foot <= 1, `${t.role}/${direction}/${motion}/${frame.index}: ${foot}`)
        }
      }
})
test('attack contact matches the original event, then recovers and prepares without looping', async () => {
  for (const t of TYPES)
    for (const direction of ['e', 'w']) {
      const meta = JSON.parse(
        await readFile(
          new URL(`../../../public/tower-defense-art/${t.role}/${t.file}-attack-${direction}.json`, import.meta.url)
        )
      )
      const expected =
        meta.releaseFrame ?? Math.floor(((meta.events?.[0]?.atMs ?? meta.durationMs * 0.48) / 1000) * meta.fps)
      assert.equal(animationFrame(meta, 'attack', 0, t.period), expected)
      assert.equal(animationFrame(meta, 'attack', t.period * 0.4, t.period), 0)
      assert.ok(animationFrame(meta, 'attack', t.period * 0.95, t.period) < expected)
      assert.ok(animationFrame(meta, 'attack', t.period * 0.95, t.period) > 0)
    }
})
