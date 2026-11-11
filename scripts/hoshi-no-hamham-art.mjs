// Review exporter for 星のハムハム pixel art: labelled PNG contact sheets of every sheet, terrain samples,
// backdrops and a composed scene per world.
// Usage: node scripts/hoshi-no-hamham-art.mjs [--scale N] [--out DIR] [--anim a,b] [prefix ...]
//   → .build/hoshi-no-hamham-art/
//   prefix filters by id: a sheet id (`hero`, `prop:`, `fx`), `terrain:<theme>`, `backdrop:<theme>`, `scene:<theme>`.
//   --anim keeps only the named animations of the exported sheets (for a close look at a few rows).
// Each sheet becomes <id>.png (all animations, one row each, frames left to right, on a dark checker with the
// anchor marked in magenta), <id>.txt (the row index) and <id>@1.png at native size on the grounds of three
// worlds, to judge readability as players see it. Stand-in art is listed in pending.txt.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const load = async (path) => (await runnerImport(resolve(root, path), { configFile: false, logLevel: 'error' })).module
const art = await load('examples/games/hoshi-no-hamham/src/art/index.ts')
const contract = await load('examples/games/hoshi-no-hamham/src/art/contract.ts')

const args = process.argv.slice(2)
let scale = 3
let out = resolve(root, '.build/hoshi-no-hamham-art')
const only = []
let anims = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scale') scale = Number(args[++i])
  else if (args[i] === '--out') out = resolve(args[++i])
  else if (args[i] === '--anim') anims = new Set(args[++i].split(','))
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
function draw(dst, raster, x, y, k = 1, flip = false) {
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
const fileOf = (id) => id.replaceAll(':', '_')

const checker = (x, y) => (((x >> 4) + (y >> 4)) & 1 ? [44, 42, 56] : [36, 34, 46])
const PAD = 8
// Meadow grass, cave rock and castle brick mid-tones: a character has to read on all of them.
const GROUNDS = [
  [127, 212, 100],
  [74, 63, 104],
  [200, 96, 79]
]

const written = []
for (const id of art.sheetIds().sort()) {
  if (!pick(id)) continue
  const s = art.sheet(id)
  const pending = new Set(art.missingAnims(id))
  const names = Object.keys(s).filter((name) => !anims || anims.has(name))
  if (!names.length) continue
  const rows = names.map((name) => s[name])
  const width = Math.max(...rows.map((a) => a.frames.length * (a.frames[0].w * scale + PAD))) + PAD
  const height = rows.reduce((h, a) => h + a.frames[0].h * scale + PAD, PAD)
  const img = image(width, height, checker)
  let y = PAD
  const index = []
  for (const [r, a] of rows.entries()) {
    const [ax, ay] = art.anchorOf(a)
    a.frames.forEach((f, i) => {
      const x = PAD + i * (f.w * scale + PAD)
      draw(img, f, x, y, scale)
      for (let d = -3; d <= 3; d++) {
        dot(img, x + ax * scale + d, y + ay * scale, [255, 0, 255])
        dot(img, x + ax * scale, y + ay * scale + d, [255, 0, 255])
      }
    })
    index.push(
      `${r}: ${names[r]} (${a.frames.length}f ${a.frames[0].w}×${a.frames[0].h} ${a.fps}fps${a.loop ? ' loop' : ''})${pending.has(names[r]) ? ' STAND-IN' : ''}`
    )
    y += a.frames[0].h * scale + PAD
  }
  await save(img, `${fileOf(id)}.png`)
  writeFileSync(resolve(out, `${fileOf(id)}.txt`), `${id}\n${index.join('\n')}\n`)
  const nativeW = Math.max(...rows.map((a) => a.frames.length * (a.frames[0].w + 4))) + 8
  const nativeH = rows.reduce((h, a) => h + a.frames[0].h + 4, 4)
  const native = image(
    nativeW * GROUNDS.length,
    nativeH,
    (x) => GROUNDS[Math.min(GROUNDS.length - 1, Math.floor(x / nativeW))]
  )
  for (const [g] of GROUNDS.entries()) {
    let ny = 4
    for (const a of rows) {
      a.frames.forEach((f, i) => draw(native, f, g * nativeW + 4 + i * (f.w + 4), ny, 1))
      ny += a.frames[0].h + 4
    }
  }
  await save(native, `${fileOf(id)}@1.png`)
  written.push(fileOf(id))
}

/** A small level that exercises hills, pits, platforms, dirt walls, spikes, ceilings and undersides. */
const SAMPLE = [
  '......................',
  '..##########..........',
  '..##########..........',
  '......................',
  '..........===.........',
  '....==..........DD....',
  '................DD....',
  '.......####.....DD....',
  '######.####^^..####.##',
  '######..............##',
  '######......##########',
  '######################'
]
const KIND = { '#': 'solid', D: 'dirt', '=': 'platform', '^': 'spike' }
const sampleAt = (x, y) => {
  if (y >= SAMPLE.length) return 'solid'
  if (x < 0 || x >= SAMPLE[0].length) return undefined
  if (y < 0) return 'empty'
  return KIND[SAMPLE[y][x]] ?? 'empty'
}
const aroundOf = (x, y) => [
  sampleAt(x, y - 1),
  sampleAt(x + 1, y - 1),
  sampleAt(x + 1, y),
  sampleAt(x + 1, y + 1),
  sampleAt(x, y + 1),
  sampleAt(x - 1, y + 1),
  sampleAt(x - 1, y),
  sampleAt(x - 1, y - 1)
]
const hashOf = (x, y, seed) => {
  let h = 2166136261
  for (const v of [x, y, seed]) {
    h ^= v | 0
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

function drawTerrain(img, theme, ox, oy) {
  for (let ty = 0; ty < SAMPLE.length; ty++)
    for (let tx = 0; tx < SAMPLE[0].length; tx++) {
      const kind = sampleAt(tx, ty)
      if (kind === 'empty') continue
      draw(img, art.tile({ theme, kind, around: aroundOf(tx, ty), tx, ty }), ox + tx * 64, oy + ty * 64)
    }
  const decor = art.decor(theme)
  const choose = (where, tx, ty) => {
    const list = decor.filter((d) => d.where === where)
    if (!list.length || hashOf(tx, ty, 1) > 0.45) return undefined
    let roll = hashOf(tx, ty, 2) * list.reduce((sum, d) => sum + d.weight, 0)
    for (const d of list) if ((roll -= d.weight) <= 0) return d
    return list[list.length - 1]
  }
  for (let ty = 0; ty < SAMPLE.length; ty++)
    for (let tx = 0; tx < SAMPLE[0].length; tx++) {
      if (sampleAt(tx, ty) !== 'solid') continue
      const jitter = Math.floor(hashOf(tx, ty, 3) * 32) + 16
      if (sampleAt(tx, ty - 1) === 'empty') {
        const d = choose('top', tx, ty)
        if (d) draw(img, d.image, ox + tx * 64 + jitter - d.anchor[0], oy + ty * 64 - d.anchor[1])
      }
      if (sampleAt(tx, ty + 1) === 'empty') {
        const d = choose('under', tx, ty)
        if (d) draw(img, d.image, ox + tx * 64 + jitter - d.anchor[0], oy + (ty + 1) * 64 - d.anchor[1])
      }
    }
}

function drawBackdrop(img, theme, camX, viewX, viewY, front) {
  const b = art.backdrop(theme)
  if (!b) return false
  if (!front) draw(img, b.sky, viewX, viewY)
  for (const layer of b.layers) {
    if (Boolean(layer.front) !== front) continue
    const shift = Math.floor(camX * layer.parallax) % 640
    for (let x = -shift - 640; x < 640; x += 640) {
      if (x + 640 <= 0) continue
      const clip = image(640, 360, [0, 0, 0])
      clip.data.fill(0)
      // Draw through a 640×360 window so layers never spill outside the view.
      const rgba = layer.image.rgba()
      for (let j = 0; j < 360 - layer.y; j++) {
        const sy = Math.min(layer.image.h - 1, j)
        for (let i = 0; i < 640; i++) {
          const dx = x + i
          if (dx < 0 || dx >= 640) continue
          const s = (sy * 640 + i) * 4
          if (!rgba[s + 3] || layer.y + j < 0) continue
          img.data.set([rgba[s], rgba[s + 1], rgba[s + 2], 255], ((viewY + layer.y + j) * img.w + viewX + dx) * 4)
        }
      }
    }
  }
  return true
}

for (const theme of contract.THEMES) {
  if (pick(`terrain:${theme}`)) {
    const img = image(SAMPLE[0].length * 64, SAMPLE.length * 64, [30, 26, 44])
    drawTerrain(img, theme, 0, 0)
    await save(img, `terrain_${theme}.png`)
    written.push(`terrain_${theme}`)
  }
  if (pick(`backdrop:${theme}`) && art.hasBackdrop(theme)) {
    // Two camera positions side by side: parallax and tiling seams show up as a mismatch between them.
    const img = image(1288, 360, [0, 0, 0])
    drawBackdrop(img, theme, 0, 0, 0, false)
    drawBackdrop(img, theme, 0, 0, 0, true)
    drawBackdrop(img, theme, 1500, 648, 0, false)
    drawBackdrop(img, theme, 1500, 648, 0, true)
    await save(img, `backdrop_${theme}.png`)
    written.push(`backdrop_${theme}`)
  }
  if (pick(`scene:${theme}`)) {
    // The world as the player sees it: backdrop, terrain, props and the cast at native size in a 640×360 view.
    const img = image(640, 360, [30, 26, 44])
    drawBackdrop(img, theme, 200, 0, 0, false)
    const scene = image(SAMPLE[0].length * 64, SAMPLE.length * 64, [0, 0, 0])
    scene.data.fill(0)
    drawTerrain(scene, theme, 0, 0)
    const place = (id, name, frame, tx, ty, flip = false) => {
      const a = art.sheet(id)[name]
      if (!a) return
      const [ax, ay] = art.anchorOf(a)
      const f = a.frames[frame % a.frames.length]
      const cellAnchored = ax === 0 || id.startsWith('prop:goal') || id.startsWith('prop:nest') || id === 'prop:cage'
      if (cellAnchored) draw(scene, f, tx * 64 - ax, ty * 64 - ay, 1, flip)
      else draw(scene, f, tx * 64 + 32 - ax, (ty + 1) * 64 - ay, 1, flip)
    }
    place('prop:tree', 'idle', 0, 7, 6)
    place('prop:rock', 'idle', 0, 9, 6)
    place('prop:switch1', 'off', 0, 16, 7)
    place('prop:goal', 'open', 0, 20, 7)
    place('walker', 'move', 1, 10, 6, true)
    place('flyer', 'move', 2, 12, 4, true)
    place('hero', 'run', 2, 8, 6)
    place('princess', 'idle', 0, 18, 7)
    // Copy the window of the scene that a camera at (300, 224) would show.
    const camX = 300
    const camY = 224
    for (let y = 0; y < 360; y++)
      for (let x = 0; x < 640; x++) {
        const s = ((y + camY) * scene.w + x + camX) * 4
        if (scene.data[s + 3]) img.data.set(scene.data.subarray(s, s + 4), (y * 640 + x) * 4)
      }
    drawBackdrop(img, theme, 200, 0, 0, true)
    await save(img, `scene_${theme}.png`)
    written.push(`scene_${theme}`)
  }
}

const pending = art.pendingArt()
const lines = [
  ...Object.entries(pending.sheets).map(([id, anims]) => `${id}: ${anims.join(', ')}`),
  ...pending.terrain.map((theme) => `terrain:${theme}`),
  ...pending.backdrops.map((theme) => `backdrop:${theme}`)
]
writeFileSync(resolve(out, 'pending.txt'), lines.length ? `${lines.join('\n')}\n` : 'nothing pending\n')
console.log(`Wrote ${written.length} images to ${out}; ${lines.length} stand-ins listed in pending.txt`)
