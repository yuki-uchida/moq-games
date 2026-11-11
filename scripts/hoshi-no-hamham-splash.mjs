// Prints the small pictures baked into the instant splash in examples/games/hoshi-no-hamham/index.html as
// data-URL PNGs, taken from the game's own art registry (the `ui` sheet).
// Usage: node scripts/hoshi-no-hamham-splash.mjs [face_hero starOn ...]
//   Without arguments it prints the two the splash uses (face_hero = the hero's portrait, starOn = the star
//   icon). Paste each URL into the matching <img src="..."> of #splash when the art of those pictures changes.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const art = (
  await runnerImport(resolve(root, 'examples/games/hoshi-no-hamham/src/art/index.ts'), {
    configFile: false,
    logLevel: 'error'
  })
).module

const ids = process.argv.slice(2)
if (!ids.length) ids.push('face_hero', 'starOn')

for (const id of ids) {
  const raster = art.sheet('ui')[id]?.frames[0]
  if (!raster) throw new Error(`No ui clip named ${id}`)
  const png = await sharp(Buffer.from(raster.rgba()), { raw: { width: raster.w, height: raster.h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  console.log(`${id} (${raster.w}×${raster.h}, ${png.length} bytes)`)
  console.log(`data:image/png;base64,${png.toString('base64')}`)
}
