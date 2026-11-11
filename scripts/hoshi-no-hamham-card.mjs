// Bakes the preview picture of 星のハムハム for its card on the landing page (landing/main.js) from the game's own
// art registry: the meadow backdrop, grass ground, a tree, ハム彦 mid-run and the pixel logo, composed at native
// size into one 320×260 palette PNG and printed as a data URL.
// The card crops it with object-fit: cover, so everything that matters (logo, hero, tree) stays in the middle 220 px.
// Usage: node scripts/hoshi-no-hamham-card.mjs [--write] [--out FILE]
//   Without flags it prints the size and the data URL.
//   --write replaces the constant between the `hamham-card:begin` / `hamham-card:end` markers in landing/main.js.
//   --out FILE also saves the PNG (look at it before committing; keep it out of published folders).
// Run it again whenever the art of the hero, the meadow or the logo changes. The landing page stays static and
// never imports the game's code; it only embeds this picture.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const load = async (path) => (await runnerImport(resolve(root, path), { configFile: false, logLevel: 'error' })).module
const art = await load('examples/games/hoshi-no-hamham/src/art/index.ts')
const contract = await load('examples/games/hoshi-no-hamham/src/art/contract.ts')

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outFile = outIndex >= 0 ? resolve(args[outIndex + 1]) : undefined

const W = 320
const H = 260
const THEME = 'meadow'
const CAM_X = 150 // backdrop scroll, picks which hills sit behind the hero
const VIEW_Y = 40 // backdrop row shown at the top of the card
const GROUND_Y = 184 // top edge of the grass in the card
const data = new Uint8Array(W * H * 4)

/** Copies a raster into the card, skipping transparent pixels. `k` shrinks by an integer factor with nearest sampling. */
function draw(raster, x, y, { flip = false, shrink = 1 } = {}) {
  const rgba = raster.rgba()
  const w = Math.floor(raster.w / shrink)
  const h = Math.floor(raster.h / shrink)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const sx = (flip ? w - 1 - i : i) * shrink
      const s = (j * shrink * raster.w + sx) * 4
      const dx = x + i
      const dy = y + j
      if (!rgba[s + 3] || dx < 0 || dy < 0 || dx >= W || dy >= H) continue
      data.set([rgba[s], rgba[s + 1], rgba[s + 2], 255], (dy * W + dx) * 4)
    }
}

const backdrop = art.backdrop(THEME)
const layerPass = (front) => {
  for (const layer of backdrop.layers) {
    if (Boolean(layer.front) !== front) continue
    const shift = Math.floor(CAM_X * layer.parallax) % 640
    const rgba = layer.image.rgba()
    for (let j = 0; j < 360 - layer.y; j++) {
      const y = layer.y + j - VIEW_Y
      if (y < 0 || y >= H) continue
      const sy = Math.min(layer.image.h - 1, j)
      for (let x = 0; x < W; x++) {
        const s = (sy * 640 + ((x + shift) % 640)) * 4
        if (rgba[s + 3]) data.set([rgba[s], rgba[s + 1], rgba[s + 2], 255], (y * W + x) * 4)
      }
    }
  }
}
// The sky is a 640×360 picture; show the window starting at VIEW_Y.
{
  const sky = backdrop.sky.rgba()
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      data.set(sky.subarray(((y + VIEW_Y) * 640 + x) * 4, ((y + VIEW_Y) * 640 + x) * 4 + 3), (y * W + x) * 4)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
}
layerPass(false)

// Ground: two rows of solid tiles with grass on top, ending in a cracked dirt wall on the right.
const KIND = { '#': 'solid', D: 'dirt' }
const MAP = ['.....', '#####', '#####']
const kindAt = (x, y) =>
  y < 0 ? 'empty' : x < 0 || x >= MAP[0].length ? undefined : y >= MAP.length ? 'solid' : (KIND[MAP[y][x]] ?? 'empty')
const around = (x, y) => [
  kindAt(x, y - 1),
  kindAt(x + 1, y - 1),
  kindAt(x + 1, y),
  kindAt(x + 1, y + 1),
  kindAt(x, y + 1),
  kindAt(x - 1, y + 1),
  kindAt(x - 1, y),
  kindAt(x - 1, y - 1)
]
for (let ty = 1; ty < MAP.length; ty++)
  for (let tx = 0; tx < MAP[0].length; tx++) {
    const kind = kindAt(tx, ty)
    if (kind === 'empty') continue
    draw(art.tile({ theme: THEME, kind, around: around(tx, ty), tx, ty }), tx * 64, GROUND_Y + (ty - 1) * 64)
  }

const place = (id, name, frame, cx, options) => {
  const a = art.sheet(id)[name]
  const [ax, ay] = art.anchorOf(a)
  draw(a.frames[frame % a.frames.length], cx - ax, GROUND_Y - ay, options)
}
place(contract.themedProp('prop:tree', THEME), 'idle', 0, 218)
place('hero', 'run', 2, 126)
layerPass(true)

// The logo is 384×128: halve it (whole-number) and centre it near the top.
const logo = art.sheet('ui').logo.frames[0]
draw(logo, Math.floor((W - logo.w / 2) / 2), 6, { shrink: 2 })

const png = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } })
  .png({ compressionLevel: 9, palette: true, colours: 256, dither: 0 })
  .toBuffer()
if (outFile) writeFileSync(outFile, png)
const url = `data:image/png;base64,${png.toString('base64')}`
console.log(`hoshi-no-hamham card: ${W}×${H}, ${png.length} bytes (${url.length} characters of data URL)`)

if (args.includes('--write')) {
  const file = resolve(root, 'landing/main.js')
  const source = readFileSync(file, 'utf8')
  const next = source.replace(
    /(\/\/ hamham-card:begin[^\n]*\n)[\s\S]*?(\n\s*\/\/ hamham-card:end)/,
    (_, begin, end) => `${begin}    const hamhamCard =\n      '${url}'${end}`
  )
  if (next === source && !source.includes(url)) throw new Error('hamham-card markers not found in landing/main.js')
  writeFileSync(file, next)
  console.log('Updated landing/main.js')
} else {
  console.log(url)
}
