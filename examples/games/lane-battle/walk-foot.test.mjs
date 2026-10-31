import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { walkPose } from './animation.js'

// Measure a clearly visible stance portion of each original atlas, in source pixels.
test('distance cadence holds the sampled contact foot near its world position', async () => {
  const root = new URL('../../../public/tower-defense-art/', import.meta.url)
  for (const [role, name, first, last] of [
    ['soldier', 'leaf-squire', 3, 11],
    ['archer', 'forest-archer', 3, 10],
    ['wolf', 'dusk-wolf', 0, 6]
  ]) {
    for (const direction of ['e', 'w']) {
      const dir = new URL(`${role}/`, root)
      const meta = JSON.parse(await readFile(new URL(`${name}-walk-${direction}.json`, dir)))
      const { data, info } = await sharp(fileURLToPath(new URL(meta.texture, dir)))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const sign = direction === 'e' ? 1 : -1
      const positions = []
      for (let i = first; i <= last; i++) {
        const frame = meta.frames[i]
        const pixels = []
        for (let y = 87; y <= 95; y++)
          for (let x = 0; x < frame.width; x++)
            if (data[((frame.y + y) * info.width + frame.x + x) * 4 + 3] > 180) pixels.push([x, y])
        const bottom = Math.max(...pixels.map(([, y]) => y))
        const xs = [...new Set(pixels.filter(([, y]) => y >= bottom - 2).map(([x]) => x))].sort((a, b) => a - b)
        const groups = []
        for (const x of xs) {
          const group = groups.at(-1)
          if (!group || x > group.at(-1) + 1) groups.push([x])
          else group.push(x)
        }
        const group = direction === 'e' ? groups[0] : groups.at(-1)
        const x = (group[0] + group.at(-1)) / 2 - 64
        const pose = walkPose(meta, (meta.strideWorldUnits * i) / meta.frames.length, 128, sign, role)
        const transformedX = x * Math.cos(pose.angle) - (bottom - 94) * pose.height * Math.sin(pose.angle)
        positions.push((sign * meta.strideWorldUnits * i) / meta.frames.length + transformedX)
      }
      const drift = Math.max(...positions) - Math.min(...positions)
      assert.ok(drift < 1, `${role} ${direction} sampled stance drifts ${drift.toFixed(2)} source pixels`)
    }
  }
})
