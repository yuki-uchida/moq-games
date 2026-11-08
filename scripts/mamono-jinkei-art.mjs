// Review exporter for マモノ陣形 pixel art: labelled PNG contact sheets of every sheet and a terrain sample.
// Usage: node scripts/mamono-jinkei-art.mjs [--scale N] [id-prefix ...]   → .build/mamono-jinkei-art/
// Each sheet becomes <id>.png (all animations, one row each, frames left to right, on a checkered dark ground
// with the anchor marked), plus <id>@1.png at native size on a mid-tone ground to judge readability at 1×.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = resolve(root, '.build/mamono-jinkei-art')
const load = async (path) => (await runnerImport(resolve(root, path), { configFile: false, logLevel: 'error' })).module
const art = await load('examples/games/mamono-jinkei/src/art/index.ts')
const { anchorOf } = await load('examples/games/mamono-jinkei/src/art/sheet.ts')
const vocab = await load('examples/games/mamono-jinkei/src/vocab.ts')

const args = process.argv.slice(2)
let scale = 3
const only = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scale') scale = Number(args[++i])
  else only.push(args[i])
}
const pick = (id) => !only.length || only.some((prefix) => id.startsWith(prefix))
mkdirSync(out, { recursive: true })

/** Plain RGBA image buffer helpers. */
const image = (w, h, fill) => {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = typeof fill === 'function' ? fill(x, y) : fill
      data.set([c[0], c[1], c[2], 255], (y * w + x) * 4)
    }
  return { w, h, data }
}
function draw(dst, raster, x, y, k, flip = false) {
  const rgba = raster.rgba()
  for (let j = 0; j < raster.h * k; j++)
    for (let i = 0; i < raster.w * k; i++) {
      const sx = Math.floor(i / k)
      const sy = Math.floor(j / k)
      const s = (sy * raster.w + (flip ? raster.w - 1 - sx : sx)) * 4
      if (!rgba[s + 3]) continue
      const dx = x + i
      const dy = y + j
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue
      dst.data.set([rgba[s], rgba[s + 1], rgba[s + 2], 255], (dy * dst.w + dx) * 4)
    }
}
function dot(dst, x, y, c) {
  if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) return
  dst.data.set([...c, 255], (y * dst.w + x) * 4)
}
const save = (img, name) =>
  sharp(Buffer.from(img.data), { raw: { width: img.w, height: img.h, channels: 4 } })
    .png()
    .toFile(resolve(out, name))

const checker = (x, y) => (((x >> 4) + (y >> 4)) & 1 ? [44, 42, 56] : [36, 34, 46])
const PAD = 8
const LABEL_W = 0

const written = []
for (const id of art.sheetIds().sort()) {
  if (!pick(id)) continue
  const s = art.sheet(id)
  const names = Object.keys(s)
  const rows = names.map((name) => s[name])
  const width = Math.max(...rows.map((a) => a.frames.length * (a.frames[0].w * scale + PAD))) + PAD + LABEL_W
  const height = rows.reduce((h, a) => h + a.frames[0].h * scale + PAD, PAD)
  const img = image(width, height, checker)
  let y = PAD
  const index = []
  for (const [r, a] of rows.entries()) {
    const [ax, ay] = anchorOf(a)
    a.frames.forEach((f, i) => {
      const x = PAD + LABEL_W + i * (f.w * scale + PAD)
      const lift = a.lift?.[i] ?? 0
      draw(img, f, x, y - lift * scale, scale)
      // Anchor cross in magenta.
      for (let d = -3; d <= 3; d++) {
        dot(img, x + ax * scale + d, y + ay * scale, [255, 0, 255])
        dot(img, x + ax * scale, y + ay * scale + d, [255, 0, 255])
      }
    })
    index.push(
      `${r}: ${names[r]} (${a.frames.length}f ${a.frames[0].w}×${a.frames[0].h} ${a.fps}fps${a.loop ? ' loop' : ''})`
    )
    y += a.frames[0].h * scale + PAD
  }
  const file = id.replaceAll(':', '_')
  await save(img, `${file}.png`)
  writeFileSync(resolve(out, `${file}.txt`), `${id}${art.hasArt(id) ? '' : ' (placeholder)'}\n${index.join('\n')}\n`)
  // Native size on a grass-like mid tone, to judge readability as players see it.
  const native = image(
    Math.max(...rows.map((a) => a.frames.length * (a.frames[0].w + 4))) + 8,
    rows.reduce((h, a) => h + a.frames[0].h + 4, 4),
    [118, 160, 82]
  )
  let ny = 4
  for (const a of rows) {
    a.frames.forEach((f, i) => draw(native, f, 4 + i * (f.w + 4), ny - (a.lift?.[i] ?? 0), 1))
    ny += a.frames[0].h + 4
  }
  await save(native, `${file}@1.png`)
  written.push(file)
}

// Terrain sample per stage: a little island map exercising every kind the stage uses.
for (const stage of vocab.STAGES) {
  if (!pick(`tiles:${stage}`)) continue
  const kinds = vocab.STAGE_TILES[stage]
  const W = 14
  const H = 10
  const map = []
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const band = Math.floor(tx / 2) % kinds.length
      const ring = tx === 0 || ty === 0 || tx === W - 1 || ty === H - 1
      map.push(ring ? kinds[0] : ty < 3 ? kinds[0] : ty > 6 ? kinds[(band + 1) % kinds.length] : kinds[band])
    }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? undefined : map[y * W + x])
  const k = 2
  const img = image(W * 64 * k, H * 64 * k, [0, 0, 0])
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const around = [
        at(tx, ty - 1),
        at(tx + 1, ty - 1),
        at(tx + 1, ty),
        at(tx + 1, ty + 1),
        at(tx, ty + 1),
        at(tx - 1, ty + 1),
        at(tx - 1, ty),
        at(tx - 1, ty - 1)
      ]
      const r = art.tile({ stage, kind: at(tx, ty), around, tx, ty, frame: 0 })
      draw(img, r, tx * 64 * k, ty * 64 * k, k)
    }
  await save(img, `tiles_${stage}.png`)
  written.push(`tiles_${stage}`)
}

console.log(`Wrote ${written.length} sheets to ${out}`)
