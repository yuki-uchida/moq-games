// Review exporter for 星のハムハム pixel art.
// Usage: node scripts/hoshi-no-hamham-art.mjs   → .build/hoshi-no-hamham-art/*.png
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = resolve(root, '.build/hoshi-no-hamham-art')
mkdirSync(out, { recursive: true })
const { module: artModule } = await runnerImport(resolve(root, 'examples/games/hoshi-no-hamham/src/art/index.ts'), {
  configFile: false,
  logLevel: 'error'
})
const art = artModule.getArt()
const SCALE = 4

function scaleUp(sprite, scale = SCALE) {
  const { w, h, data } = sprite
  const out = Buffer.alloc(w * scale * h * scale * 4)
  for (let y = 0; y < h * scale; y++) {
    const sy = Math.floor(y / scale)
    for (let x = 0; x < w * scale; x++) {
      const sx = Math.floor(x / scale)
      const s = (sy * w + sx) * 4
      const d = (y * w * scale + x) * 4
      out[d] = data[s]
      out[d + 1] = data[s + 1]
      out[d + 2] = data[s + 2]
      out[d + 3] = data[s + 3]
    }
  }
  return { width: w * scale, height: h * scale, data: out }
}

async function save(sprite, name) {
  const image = scaleUp(sprite)
  await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
    .png()
    .toFile(resolve(out, name))
}

/** Composites sprites in a row onto a transparent canvas. */
function sheet(sprites, gap = 8) {
  const scale = SCALE
  const width = sprites.reduce((sum, s) => sum + s.w * scale + gap, gap)
  const height = Math.max(...sprites.map((s) => s.h * scale)) + gap * 2
  const canvas = Buffer.alloc(width * height * 4)
  let x = gap
  for (const sprite of sprites) {
    const image = scaleUp(sprite)
    for (let y = 0; y < image.height; y++) {
      for (let i = 0; i < image.width * 4; i++) {
        const s = y * image.width * 4 + i
        if (!image.data[s + 3]) continue
        const d = ((y + gap) * width + x) * 4 + i
        canvas[d] = image.data[s]
        canvas[d + 1] = image.data[s + 1]
        canvas[d + 2] = image.data[s + 2]
        canvas[d + 3] = image.data[s + 3]
      }
    }
    x += sprite.w * scale + gap
  }
  return { width, height, data: canvas }
}

async function saveSheet(sprites, name) {
  const image = sheet(sprites)
  await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
    .png()
    .toFile(resolve(out, name))
}

for (const [id, character] of Object.entries(art.characters)) {
  await saveSheet(
    [
      ...character.idle,
      ...character.walk,
      character.jump,
      character.fall,
      ...character.bite,
      character.hurt,
      character.happy
    ],
    `character-${id}.png`
  )
}
await saveSheet(
  Object.values(art.props).flatMap((value) => (Array.isArray(value) ? value : [value])),
  'props.png'
)
for (const [theme, tiles] of Object.entries(art.tiles)) {
  await saveSheet(Object.values(tiles), `tiles-${theme}.png`)
}
await save(art.bee, 'bee.png')

// An in-context mockup: the meadow tiles with props and characters, to review scale and palette.
const mock = Buffer.alloc(1200 * 700 * 4)
for (let i = 0; i < mock.length; i += 4) {
  mock[i] = 18
  mock[i + 1] = 10
  mock[i + 2] = 38
  mock[i + 3] = 255
}
const blit = (sprite, dx, dy) => {
  const image = scaleUp(sprite)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const s = (y * image.width + x) * 4
      if (!image.data[s + 3]) continue
      const tx = dx + x
      const ty = dy + y
      if (tx < 0 || ty < 0 || tx >= 1200 || ty >= 700) continue
      const d = (ty * 1200 + tx) * 4
      mock[d] = image.data[s]
      mock[d + 1] = image.data[s + 1]
      mock[d + 2] = image.data[s + 2]
      mock[d + 3] = 255
    }
  }
}
const ground = art.tiles.meadow.ground
for (let x = 0; x < 1200; x += 256) blit(ground, x, 440)
const props = art.props
blit(props.tree, 60, 190)
blit(props.pipe, 200, 190)
blit(props.hive, 300, 120)
blit(props.animal, 380, 200)
blit(props.rock, 500, 220)
blit(props.switchOff, 580, 200)
blit(props.door, 660, 60)
blit(art.characters.player.walk[0], 120, 200)
blit(art.characters.princess.idle[0], 760, 200)
blit(art.characters.mom.walk[0], 880, 180)
blit(art.characters.walker.walk[0], 980, 210)
blit((art.characters.flyer.fly ?? art.characters.flyer.walk)[0], 1060, 120)
blit(art.characters.king.idle[0], 420, 300)
await sharp(mock, { raw: { width: 1200, height: 700, channels: 4 } })
  .png()
  .toFile(resolve(out, 'mockup.png'))

console.log(`wrote art review to ${out}`)
