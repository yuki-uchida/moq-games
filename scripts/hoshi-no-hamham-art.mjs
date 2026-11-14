// Review exporter for 星のハムハム pixel art: labelled PNG contact sheets of every sheet, terrain samples,
// backdrops and a composed scene per world.
// Usage: node scripts/hoshi-no-hamham-art.mjs [--scale N] [--out DIR] [--anim a,b] [--draft] [--gif] [--onion] [--motion]
//        [--lineup] [--game] [--stage theme ...] [prefix ...]
//   → .build/hoshi-no-hamham-art/
//   prefix filters by id: a sheet id (`hero`, `prop:`, `fx`), `terrain:<theme>`, `backdrop:<theme>`, `scene:<theme>`.
//   --anim keeps only the named animations of the exported sheets (for a close look at a few rows).
//   --draft exports whatever a sheet's modules draw so far, even while contract clips are missing.
//   --gif      <id>/<clip>.gif for every clip at the export scale on the meadow colour, with the clip's real timing (fps,
//              hold; a clip that plays once is followed by three cycles of its sustain tail and a 600 ms pause), and
//              <id>/all.gif: every clip in one labelled grid, each looping on its own timing. WebP if 256 colours do not fit.
//   --onion    <id>.onion.png: the contact sheet with each frame's predecessor (loops: frame 0 shows the last frame) as a
//              flat magenta ghost at 35 % underneath, so what moved is visible in one still.
//   --motion   <id>.motion.md: per clip a table per frame (bounds, centroid step, changed pixels, ground row, colours,
//              orphans, light edge pixels, cell edge) and the clip's loop seam, twin frames and boil; values past the gates
//              of tests/art-rig-quality.test.ts in bold.
//   --lineup   lineup.png (2x) and lineup@1.png: the idle frame (move for the flyer) of every character on one ground
//              line in front of the meadow, hero first, small cast, gang, bosses, ids burnt in. Relative scale, family.
//              A row wider than 1300 px (native) wraps; every row keeps its own ground line and lineup.txt says so.
//   --game     <id>@2.png: every clip at 2x on four flat grounds side by side (meadow green, cave violet, castle brick,
//              sky), one row per clip, a clip longer than 8 frames wraps onto further rows. The game draws art at 2x on a
//              1280 px screen: this is the size to judge. (<id>@1.png stays the native-size sheet on three grounds.)
//   --stage T  <id>@T.png: the clips at 2x over world T's real backdrop and ground tiles (repeatable, e.g. --stage cave
//              --stage castle). All of these honour --draft, --anim, --out, --scale and the id prefixes.
//   A sheet that cannot be built is reported and skipped; the others still export (exit code 1 at the end).
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
let draft = false
let gif = false
let onion = false
let motion = false
let lineup = false
let game = false
const stages = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--draft') draft = true
  else if (args[i] === '--gif') gif = true
  else if (args[i] === '--onion') onion = true
  else if (args[i] === '--motion') motion = true
  else if (args[i] === '--lineup') lineup = true
  else if (args[i] === '--game') game = true
  else if (args[i] === '--stage') stages.push(args[++i])
  else if (args[i] === '--scale') scale = Number(args[++i])
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
const rgbaCache = new WeakMap()
/** `raster.rgba()` once per raster (the exports draw the same frame many times). */
function rgbaOf(raster) {
  let rgba = rgbaCache.get(raster)
  if (!rgba) rgbaCache.set(raster, (rgba = raster.rgba()))
  return rgba
}
function draw(dst, raster, x, y, k = 1, flip = false) {
  const rgba = rgbaOf(raster)
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
const failed = []
/** The sheet to export, or undefined (reported, not thrown) when it cannot be built: one broken sheet must not stop the rest. */
function sheetOf(id) {
  try {
    return draft ? art.draftSheet(id) : art.sheet(id)
  } catch (error) {
    if (!failed.some((f) => f.id === id)) {
      failed.push({ id, message: error.message })
      console.error(`skipped ${id}: ${error.message}`)
    }
    return undefined
  }
}
for (const id of art.sheetIds().sort()) {
  if (!pick(id)) continue
  const s = sheetOf(id)
  if (!s) continue
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
      let a
      try {
        a = art.sheet(id)[name]
      } catch (error) {
        // A sheet that is still being drawn is left out of the scene; the rest of the export goes on.
        console.error(`scene:${theme} leaves out ${id}: ${error.message}`)
      }
      if (!a) return
      const [ax, ay] = art.anchorOf(a)
      const f = a.frames[frame % a.frames.length]
      const cellAnchored = ax === 0 || id.startsWith('prop:goal') || id.startsWith('prop:nest') || id === 'prop:cage'
      if (cellAnchored) draw(scene, f, tx * 64 - ax, ty * 64 - ay, 1, flip)
      else draw(scene, f, tx * 64 + 32 - ax, (ty + 1) * 64 - ay, 1, flip)
    }
    place(contract.themedProp('prop:tree', theme), 'idle', 0, 7, 6)
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

// ------------------------------------------------------------------------------------ animation review outputs
// --gif, --onion, --motion, --lineup and --stage. Each sheet is handled on its own: a sheet that fails is reported
// at the end and the others still export.

/** 3×5 bitmap font for burnt-in labels (lower case, digits, a few marks), one string of 15 bits per glyph. */
const FONT = {
  a: '010101111101101',
  b: '110101110101110',
  c: '011100100100011',
  d: '110101101101110',
  e: '111100110100111',
  f: '111100110100100',
  g: '011100101101011',
  h: '101101111101101',
  i: '111010010010111',
  j: '001001001101010',
  k: '101101110101101',
  l: '100100100100111',
  m: '101111111101101',
  n: '110101101101101',
  o: '010101101101010',
  p: '110101110100100',
  q: '010101101111011',
  r: '110101110101101',
  s: '011100010001110',
  t: '111010010010010',
  u: '101101101101111',
  v: '101101101101010',
  w: '101101111111101',
  x: '101101010101101',
  y: '101101010010010',
  z: '111001010100111',
  0: '111101101101111',
  1: '010110010010111',
  2: '110001010100111',
  3: '110001010001110',
  4: '101101111001001',
  5: '111100110001110',
  6: '011100111101111',
  7: '111001010010010',
  8: '111101111101111',
  9: '111101111001110',
  '-': '000000111000000',
  _: '000000000000111',
  '.': '000000000000010',
  ':': '000010000010000',
  '@': '111101111100011',
  '/': '001001010100100',
  ' ': '000000000000000'
}
/** Width in pixels of a label at scale k (glyph 3 px plus 1 px gap). */
const textWidth = (text, k) => text.length * 4 * k
/** Burns `text` into the image at scale k with a dark plate behind it. */
function label(dst, text, x, y, k = 1, color = [255, 255, 255], plate = [20, 18, 30]) {
  for (let j = -k; j < 6 * k; j++) for (let i = -k; i < textWidth(text, k); i++) dot(dst, x + i, y + j, plate)
  ;[...text.toLowerCase()].forEach((ch, n) => {
    const g = FONT[ch] ?? FONT[' ']
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 3; i++)
        if (g[j * 3 + i] === '1')
          for (let b = 0; b < k * k; b++) dot(dst, x + (n * 4 + i) * k + (b % k), y + j * k + Math.floor(b / k), color)
  })
}

/** Scales an image up by whole pixels. */
function upscale(src, k) {
  const dst = image(src.w * k, src.h * k, [0, 0, 0])
  for (let y = 0; y < dst.h; y++)
    for (let x = 0; x < dst.w; x++) {
      const s = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4
      dst.data.set(src.data.subarray(s, s + 4), (y * dst.w + x) * 4)
    }
  return dst
}

/** Blends a flat colour over the painted pixels of `raster` (the onion-skin ghost). */
function ghost(dst, raster, x, y, k, color, alpha) {
  const rgba = rgbaOf(raster)
  for (let j = 0; j < raster.h * k; j++)
    for (let i = 0; i < raster.w * k; i++) {
      const s = (Math.floor(j / k) * raster.w + Math.floor(i / k)) * 4
      const dx = x + i
      const dy = y + j
      if (!rgba[s + 3] || dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue
      const d = (dy * dst.w + dx) * 4
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(dst.data[d + c] * (1 - alpha) + color[c] * alpha)
    }
}

const extras = gif || onion || motion || lineup || game || stages.length > 0
const quality = motion ? await load('examples/games/hoshi-no-hamham/src/art/quality.ts') : undefined
const fail = (id, what, error) => {
  failed.push({ id, message: `${what}: ${error.message}` })
  console.error(`failed ${what} for ${id}: ${error.stack?.split('\n').slice(0, 3).join(' | ') ?? error}`)
}
/** The exported sheets again, as { id, s, names } (same selection as the contact sheets). */
const exported = () =>
  art
    .sheetIds()
    .sort()
    .filter(pick)
    .map((id) => ({ id, s: sheetOf(id) }))
    .filter((e) => e.s)
    .map((e) => ({ ...e, names: Object.keys(e.s).filter((name) => !anims || anims.has(name)) }))
    .filter((e) => e.names.length)
const MEADOW = GROUNDS[0]

// ---- GIF

/**
 * What one pass of a clip shows, in order: [{ i: frame index, ms }]. A loop is one cycle; a clip that plays once is
 * followed by three cycles of its sustain tail and a 600 ms pause before it restarts.
 */
function timeline(a) {
  const hold = a.hold ?? a.frames.map(() => 1)
  const ms = (i) => Math.round((hold[i] * 1000) / a.fps)
  const seq = a.frames.map((_, i) => ({ i, ms: ms(i) }))
  if (a.loop) return seq
  const tail = Math.min(a.sustain ?? 0, a.frames.length)
  if (tail >= 2)
    for (let n = 0; n < 3; n++)
      for (let i = a.frames.length - tail; i < a.frames.length; i++) seq.push({ i, ms: ms(i) })
  seq[seq.length - 1].ms += 600
  return seq
}

/** Frame index of the clip `t` ms after it starts, on the same timeline as its GIF. */
function frameAtMs(a, t) {
  const seq = timeline(a)
  let rest = t % seq.reduce((sum, x) => sum + x.ms, 0)
  for (const x of seq) {
    rest -= x.ms
    if (rest < 0) return x.i
  }
  return seq[seq.length - 1].i
}

/** Writes same-sized images as one looping animation: GIF, or WebP when the palette does not fit 256 colours. Returns the file name. */
async function writeAnimation(base, images, delays) {
  const { w, h } = images[0]
  const colours = new Set()
  for (const img of images) {
    for (const v of new Uint32Array(img.data.buffer, img.data.byteOffset, img.data.length / 4)) colours.add(v)
    if (colours.size > 256) break
  }
  mkdirSync(resolve(out, base, '..'), { recursive: true })
  const stack = sharp(
    Buffer.concat(images.map((img) => Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length))),
    {
      raw: { width: w, height: h * images.length, channels: 4, pageHeight: h }
    }
  )
  if (colours.size <= 256) {
    await stack
      .gif({ delay: delays, loop: 0, dither: 0, interFrameMaxError: 0, interPaletteMaxError: 0 })
      .toFile(resolve(out, `${base}.gif`))
    return `${base}.gif`
  }
  await stack.webp({ delay: delays, loop: 0, lossless: true }).toFile(resolve(out, `${base}.webp`))
  return `${base}.webp`
}

/** One clip at the export scale on the meadow colour, with its real timing. */
async function clipGif(id, name, a) {
  const seq = timeline(a)
  const { w, h } = a.frames[0]
  const byFrame = new Map()
  const images = seq.map(({ i }) => {
    if (!byFrame.has(i)) {
      const img = image(w * scale, h * scale, MEADOW)
      draw(img, a.frames[i], 0, 0, scale)
      byFrame.set(i, img)
    }
    return byFrame.get(i)
  })
  return writeAnimation(
    `${fileOf(id)}/${name}`,
    images,
    seq.map((x) => x.ms)
  )
}

/**
 * Every clip of a sheet in one grid, each looping on its own timing: the time axis is sampled every 20 ms over the
 * longest cycle (at most 10 s) and runs of identical samples are merged into one frame. Each cell is labelled.
 */
async function allGif(id, s, names) {
  const dim = Math.max(...names.flatMap((n) => [s[n].frames[0].w, s[n].frames[0].h]))
  const k = Math.max(1, Math.min(scale, Math.floor(192 / dim)))
  const cell = dim * k
  const cols = Math.ceil(Math.sqrt(names.length))
  const rows = Math.ceil(names.length / cols)
  const w = cols * (cell + 4) + 4
  const h = rows * (cell + 12) + 4
  const period = Math.min(10000, Math.max(...names.map((n) => timeline(s[n]).reduce((sum, x) => sum + x.ms, 0))))
  const cuts = []
  for (let t = 0; t < period; t += 20) {
    const key = names.map((n) => frameAtMs(s[n], t)).join(',')
    if (cuts.length && cuts[cuts.length - 1].key === key) cuts[cuts.length - 1].ms += 20
    else cuts.push({ key, ms: 20 })
  }
  const images = cuts.map(({ key }) => {
    const picks = key.split(',').map(Number)
    const img = image(w, h, [36, 34, 46])
    names.forEach((n, c) => {
      const x = 4 + (c % cols) * (cell + 4)
      const y = 4 + Math.floor(c / cols) * (cell + 12)
      for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) dot(img, x + i, y + j, MEADOW)
      const f = s[n].frames[picks[c]]
      draw(img, f, x + Math.floor((cell - f.w * k) / 2), y + Math.floor((cell - f.h * k) / 2), k)
      label(img, n, x + 1, y + cell + 3, 1)
    })
    return img
  })
  return writeAnimation(
    `${fileOf(id)}/all`,
    images,
    cuts.map((c) => c.ms)
  )
}

// ---- onion skin

/** The contact sheet where each frame also shows its predecessor as a flat magenta ghost at 35 % underneath (frame 0 of a loop shows the last frame). */
async function onionSheet(id, s, names) {
  const rows = names.map((name) => s[name])
  const width = Math.max(...rows.map((a) => a.frames.length * (a.frames[0].w * scale + PAD))) + PAD
  const height = rows.reduce((h, a) => h + a.frames[0].h * scale + PAD, PAD)
  const img = image(width, height, checker)
  let y = PAD
  for (const a of rows) {
    const [ax, ay] = art.anchorOf(a)
    a.frames.forEach((f, i) => {
      const x = PAD + i * (f.w * scale + PAD)
      const before = i > 0 ? a.frames[i - 1] : a.loop && a.frames.length > 1 ? a.frames[a.frames.length - 1] : undefined
      if (before) ghost(img, before, x, y, scale, [255, 0, 255], 0.35)
      draw(img, f, x, y, scale)
      for (let d = -3; d <= 3; d++) {
        dot(img, x + ax * scale + d, y + ay * scale, [255, 0, 255])
        dot(img, x + ax * scale, y + ay * scale + d, [255, 0, 255])
      }
    })
    y += a.frames[0].h * scale + PAD
  }
  await save(img, `${fileOf(id)}.onion.png`)
}

// ---- motion report

const QUIET = new Set(['idle', 'blink', 'sad', 'recover', 'stunned', 'tired'])
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
const bold = (text, flag) => (flag ? `**${text}**` : String(text))
const total = (list) => list.reduce((x, y) => x + y, 0)

/** `<id>.motion.md`: per clip a table of numbers per frame and a summary, values past the gates in bold. */
function motionReport(id, s, names) {
  const L = quality.LIMITS
  const lines = [
    `# ${id}: motion`,
    '',
    `Bold means past a gate (thresholds: \`LIMITS\` in src/art/quality.ts).${draft ? ' Exported with --draft.' : ''}`,
    ''
  ]
  for (const name of names) {
    const a = s[name]
    const frames = a.frames
    const path = quality.centroidPath(a)
    const ground = quality.groundRow(a)
    const [, ay] = art.anchorOf(a)
    const seam = quality.loopSeam(a)
    const twins = quality.stillness(a)
    const twinSet = new Set(twins.map(([, j]) => j))
    const quiet = QUIET.has(name)
    const boil = quality.boil(a)
    const toggles = frames.length > 2 ? quality.oneFrameToggles(a) : { max: 0, mean: 0, worst: { frame: 0 } }
    const pct = (v) => `${(v * 100).toFixed(1)} %`
    const orphans = frames.map((f) => quality.orphans(f).length)
    const light = frames.map((f) => quality.lightEdge(f).length)
    const edge = frames.map((f) => quality.edgeTouch(f).length)
    lines.push(
      `## ${name}`,
      '',
      `${frames.length} frames, ${a.fps} fps, ${a.loop ? 'loop' : 'plays once'}${a.sustain ? `, sustain ${a.sustain}` : ''}, ${art.duration(a).toFixed(2)} s, anchor row ${ay}`,
      '',
      '| frame | hold | bounds x,y,w,h | centroid step | changed | ground | colours | orphans | light edge | cell edge |',
      '| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
    )
    frames.forEach((f, i) => {
      const b = quality.bounds(f)
      const colours = quality.colours(f)
      lines.push(
        `| ${i} | ${a.hold?.[i] ?? 1} | ${b ? `${b.x},${b.y},${b.w},${b.h}` : 'empty'} | ${i ? num(path.steps[i]) : '–'} | ${i ? bold(quality.changed(frames[i - 1], f), twinSet.has(i) && a.loop) : '–'} | ${ground[i]} | ${bold(colours, colours > L.colours)} | ${bold(orphans[i], orphans[i] > 0)} | ${bold(light[i], light[i] > 0)} | ${bold(edge[i], edge[i] > 0)} |`
      )
    })
    const ratio = Number.isFinite(seam.ratio) ? seam.ratio.toFixed(2) : '∞'
    lines.push(
      '',
      a.loop
        ? `- loop seam: last→first ${seam.seam} px; steps median ${num(seam.median)}, max ${seam.max}; ratio ${bold(ratio, seam.ratio > L.seamRatio)} (limit ${L.seamRatio})`
        : '- loop seam: not a loop',
      `- near-duplicate pairs (under ${L.twinRatio * 100} % changed): ${bold(twins.length ? twins.map(([x, y]) => `${x}→${y}`).join(', ') : 'none', twins.length > 0 && a.loop)}${a.loop ? '' : ' (gated on loops only)'}`,
      boil.measured
        ? `- boil (pixels that flip back and forth over four frames, share of the outline): max ${bold(pct(boil.max), quiet && boil.max > L.boil)}${boil.max ? ` in frames ${boil.worst.frame}..${boil.worst.frame + 3} (${boil.worst.count} px of ${num(boil.worst.outline)})` : ''}, mean ${bold(pct(boil.mean), quiet && boil.mean > L.boilMean)} (limits ${pct(L.boil)} / ${pct(L.boilMean)}, quiet clips only${quiet ? '' : '; not gated here'})`
        : `- boil: not measured (${frames.length} frames; needs at least ${L.boilFrames})`,
      `- pixels that change for one frame (information, not a gate): max ${toggles.max}${toggles.max ? ` at frame ${toggles.worst.frame}` : ''}, mean ${num(toggles.mean)}`,
      `- largest centroid step ${num(path.max)} px; orphans ${bold(total(orphans), total(orphans) > 0)}; light edge ${bold(total(light), total(light) > 0)}; cell edge ${bold(total(edge), total(edge) > 0)}`,
      ''
    )
  }
  writeFileSync(resolve(out, `${fileOf(id)}.motion.md`), `${lines.join('\n')}\n`)
}

// ---- worlds: backdrop and ground behind the cast

const backdropCache = new Map()
/** The theme's backdrop at 640×360, scaled by k (cached). */
function backdropScaled(theme, k) {
  const key = `${theme}@${k}`
  if (!backdropCache.has(key)) {
    const view = image(640, 360, [30, 26, 44])
    drawBackdrop(view, theme, 0, 0, 0, false)
    drawBackdrop(view, theme, 0, 0, 0, true)
    backdropCache.set(key, upscale(view, k))
  }
  return backdropCache.get(key)
}

/** A flat-topped ground tile (grass over earth) at column tx, or undefined where the theme draws no terrain. */
const groundTile = (theme, tx, ty) =>
  art.hasTerrain(theme)
    ? art.tile({
        theme,
        kind: 'solid',
        around: ['empty', 'empty', 'solid', 'solid', 'solid', 'solid', 'solid', 'empty'],
        tx,
        ty
      })
    : undefined

/** A w×h stage: the theme's backdrop (scaled by k, tiled across) with ground tiles from `groundY` down. */
function stageImage(theme, k, w, h, groundY) {
  const img = image(w, h, [30, 26, 44])
  if (art.hasBackdrop(theme)) {
    const big = backdropScaled(theme, k)
    // The ground line sits 8 source pixels above the bottom of the backdrop picture.
    const top = Math.max(0, big.h - groundY - 8 * k)
    for (let y = 0; y < Math.min(h, big.h - top); y++)
      for (let x = 0; x < w; x++) {
        const s = ((y + top) * big.w + (x % big.w)) * 4
        img.data.set(big.data.subarray(s, s + 4), (y * w + x) * 4)
      }
  }
  for (let ty = 0; groundY + ty * 64 * k < h; ty++)
    for (let tx = 0; tx * 64 * k < w; tx++) {
      const t = groundTile(theme, tx % 8, ty)
      if (t) draw(img, t, tx * 64 * k, groundY + ty * 64 * k, k)
    }
  return img
}

/** Copies a stage image into rows of `img` starting at `y`. */
function paste(img, stage, y) {
  img.data.set(stage.data, y * img.w * 4)
}

// ---- line-up

const CAST = ['hero', 'princess', 'mom', ...contract.ENEMY_KINDS, ...contract.BOSS_ARTS]

/**
 * `lineup.png` (2×) and `lineup@1.png`: the first idle frame (move for the flyer) of every character, standing on
 * the ground line in front of the meadow, hero first, small cast → gang → bosses, ids burnt in underneath. A row
 * wider than about 2600 px (1300 at native size) wraps; every row has its own ground line, and the header comment
 * written to lineup.txt says how many rows there are.
 */
async function lineupImages() {
  const cast = CAST.filter(pick)
    .map((id) => {
      const s = sheetOf(id)
      const a = s?.idle ?? s?.move
      return a?.frames.length ? { id, a, f: a.frames[0] } : undefined
    })
    .filter(Boolean)
  if (!cast.length) return
  for (const k of [2, 1]) {
    const gap = 8 * k
    const limit = 1300 * k
    const rows = [[]]
    let used = gap
    for (const c of cast) {
      if (used + c.f.w * k + gap > limit && rows[rows.length - 1].length) {
        rows.push([])
        used = gap
      }
      rows[rows.length - 1].push(c)
      used += c.f.w * k + gap
    }
    const above = Math.max(...cast.map((c) => art.anchorOf(c.a)[1])) * k + 4 * k
    const rowH = above + 16 * k
    const width = Math.max(...rows.map((r) => r.reduce((x, c) => x + c.f.w * k + gap, gap)))
    const img = image(width, rowH * rows.length, [30, 26, 44])
    rows.forEach((row, r) => {
      paste(img, stageImage('meadow', k, width, rowH, above), r * rowH)
      let x = gap
      for (const c of row) {
        draw(img, c.f, x, r * rowH + above - art.anchorOf(c.a)[1] * k, k)
        label(img, c.id, x + Math.max(0, Math.floor((c.f.w * k - textWidth(c.id, k)) / 2)), r * rowH + above + 5 * k, k)
        x += c.f.w * k + gap
      }
    })
    await save(img, k === 2 ? 'lineup.png' : 'lineup@1.png')
    if (k === 2)
      writeFileSync(
        resolve(out, 'lineup.txt'),
        [
          rows.length > 1
            ? `The line-up wraps: ${rows.length} rows, each with its own ground line (limit ${limit} px per row at this scale).`
            : 'One row.',
          ...rows.map((row, r) => `row ${r + 1}: ${row.map((c) => c.id).join(' ')}`),
          ''
        ].join('\n')
      )
  }
  written.push('lineup', 'lineup@1')
}

// ---- stage pictures

/** `<id>@<theme>.png`: every clip at 2× over the world's backdrop and ground, one row per clip (the anchor row is the ground line). */
async function stagePicture(id, s, names, theme) {
  const k = 2
  const clips = names.map((n) => s[n])
  const w = Math.max(...clips.map((a) => a.frames.length * a.frames[0].w * k)) + 8 * k
  const rowH = (a) => a.frames[0].h * k + 12 * k
  const img = image(
    w,
    clips.reduce((h, a) => h + rowH(a), 0),
    [30, 26, 44]
  )
  let y = 0
  for (const [r, a] of clips.entries()) {
    paste(img, stageImage(theme, k, w, rowH(a), art.anchorOf(a)[1] * k), y)
    a.frames.forEach((f, i) => draw(img, f, 4 * k + i * f.w * k, y, k))
    label(img, names[r], 2, y + 2, 1)
    y += rowH(a)
  }
  await save(img, `${fileOf(id)}@${theme}.png`)
  written.push(`${fileOf(id)}@${theme}`)
}

// ---- game-size pictures

/** Flat grounds of the game's worlds: meadow green, cave violet, castle brick, sky. */
const GAME_GROUNDS = [
  [127, 212, 100],
  [74, 63, 104],
  [200, 96, 79],
  [168, 220, 255]
]

/**
 * `<id>@2.png`: every clip at 2x (the size the game draws on a 1280 px screen) on four flat grounds side by side, one
 * row per clip; clips of more than 8 frames wrap onto further rows. The clip name is burnt in at the top left.
 */
async function gamePicture(id, s, names) {
  const k = 2
  const per = 8
  const gap = 4 * k
  const cellW = Math.max(...names.map((n) => s[n].frames[0].w)) * k
  const groundW = Math.min(per, Math.max(...names.map((n) => s[n].frames.length))) * (cellW + gap) + gap
  const rows = names.flatMap((name) => {
    const a = s[name]
    const out = []
    for (let from = 0; from < a.frames.length; from += per) out.push({ name, a, from, part: Math.floor(from / per) })
    return out
  })
  const rowH = (r) => r.a.frames[0].h * k + 10 * k
  const img = image(
    groundW * GAME_GROUNDS.length,
    rows.reduce((h, r) => h + rowH(r), 0),
    (x) => GAME_GROUNDS[Math.floor(x / groundW)]
  )
  let y = 0
  for (const r of rows) {
    for (const [g] of GAME_GROUNDS.entries()) {
      r.a.frames.slice(r.from, r.from + per).forEach((f, i) => {
        draw(img, f, g * groundW + gap + i * (cellW + gap), y + 8 * k, k)
      })
    }
    label(img, r.part ? `${r.name} ${r.from}-${Math.min(r.a.frames.length, r.from + per) - 1}` : r.name, 2, y + 2, 1)
    y += rowH(r)
  }
  await save(img, `${fileOf(id)}@2.png`)
  written.push(`${fileOf(id)}@2`)
}

// ---- driver

if (extras) {
  for (const { id, s, names } of exported()) {
    if (gif) {
      try {
        let n = 0
        for (const name of names) {
          await clipGif(id, name, s[name])
          n++
        }
        await allGif(id, s, names)
        written.push(`${fileOf(id)}: ${n + 1} animations`)
      } catch (error) {
        fail(id, '--gif', error)
      }
    }
    if (game) {
      try {
        await gamePicture(id, s, names)
      } catch (error) {
        fail(id, '--game', error)
      }
    }
    if (onion) {
      try {
        await onionSheet(id, s, names)
        written.push(`${fileOf(id)}.onion`)
      } catch (error) {
        fail(id, '--onion', error)
      }
    }
    if (motion) {
      try {
        motionReport(id, s, names)
        written.push(`${fileOf(id)}.motion`)
      } catch (error) {
        fail(id, '--motion', error)
      }
    }
    for (const theme of stages) {
      try {
        await stagePicture(id, s, names, theme)
      } catch (error) {
        fail(id, `--stage ${theme}`, error)
      }
    }
  }
  if (lineup) {
    try {
      await lineupImages()
    } catch (error) {
      fail('lineup', '--lineup', error)
    }
  }
}

const pending = art.pendingArt()
const lines = [
  ...Object.entries(pending.sheets).map(([id, anims]) => `${id}: ${anims.join(', ')}`),
  ...pending.terrain.map((theme) => `terrain:${theme}`),
  ...pending.backdrops.map((theme) => `backdrop:${theme}`)
]
writeFileSync(resolve(out, 'pending.txt'), lines.length ? `${lines.join('\n')}\n` : 'nothing pending\n')
console.log(`Wrote ${written.length} images to ${out}; ${lines.length} undrawn items listed in pending.txt`)
if (failed.length) {
  const report = failed.map((f) => `  ${f.id}: ${f.message}`).join('\n')
  console.error(`${failed.length} sheet(s) could not be exported:\n${report}`)
  process.exitCode = 1
}
