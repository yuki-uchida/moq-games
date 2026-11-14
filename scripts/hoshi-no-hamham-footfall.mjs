// Ground rulers for 星のハムハム: a walk, a run or a charge drawn one row per frame, each frame where the body is in
// the world on that frame, over a ground line with a plumb line every 8 px (a darker one every 32). A foot that is
// on the ground must stay on its plumb line from row to row: the body passes over it, the foot does not slide.
// Usage: node scripts/hoshi-no-hamham-footfall.mjs [--out DIR] [--scale N] [sheet.clip[@px] ...]
//   → .build/hoshi-no-hamham-footfall/<sheet>-<clip>.png and index.md
//   Without names: every ground cycle of the contract (a clip with a `stride`), the body moving stride/frames px per
//   frame, which is how the view plays it at any speed. A clip without a stride needs `@px`: how far its body travels
//   per frame of it in the game (for example `foxBoss.shoot@14.6`, the cast of a fox walking at 175 px/s).
//   index.md lists each cycle's stride, px per frame and the frames each foot is down (from the modules' `footfalls`,
//   which tests/art-footfall.test.ts holds the drawing to).
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { runnerImport } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const load = async (path) => (await runnerImport(resolve(root, path), { configFile: false, logLevel: 'error' })).module
const art = await load('examples/games/hoshi-no-hamham/src/art/index.ts')
const contract = await load('examples/games/hoshi-no-hamham/src/art/contract.ts')
const chars = await load('examples/games/hoshi-no-hamham/src/art/chars/index.ts')
const gimmicks = await load('examples/games/hoshi-no-hamham/src/art/world/props/gimmicks.ts')

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  if (i < 0) return fallback
  return args.splice(i, 2)[1]
}
const out = resolve(root, option('--out', '.build/hoshi-no-hamham-footfall'))
const scaleArg = option('--scale', null)
mkdirSync(out, { recursive: true })

const specs = contract.allSheetSpecs()
const footfalls = { ...chars.charFootfalls, ...gimmicks.footfalls }

/** [sheet, clip, px the body travels per frame] */
const jobs = []
if (args.length === 0) {
  for (const [id, clips] of Object.entries(specs))
    for (const [clip, spec] of Object.entries(clips)) if (spec.stride) jobs.push([id, clip, spec.stride / spec.frames])
} else
  for (const arg of args) {
    const [name, px] = arg.split('@')
    const dot = name.lastIndexOf('.')
    const id = name.slice(0, dot)
    const clip = name.slice(dot + 1)
    const spec = specs[id]?.[clip]
    if (!spec) throw new Error(`no clip ${name} in the contract`)
    if (px === undefined && !spec.stride)
      throw new Error(`${name} has no stride: give the px per frame as ${name}@<px>`)
    jobs.push([id, clip, px === undefined ? spec.stride / spec.frames : Number(px)])
  }

const GRASS = [150, 208, 140]
const PLUMB = [140, 198, 131]
const PLUMB_32 = [118, 176, 112]
const GROUND = [110, 120, 110]
const TICK = [70, 80, 70]
const PAD = 6

async function ruler(id, clip, per) {
  const anim = art.sheet(id)[clip]
  const frames = anim.frames
  const k = Number(scaleArg ?? (frames[0].w > 64 ? 2 : 3))
  const fw = frames[0].w
  const fh = frames[0].h
  // The lowest row the clip paints is its ground.
  let ground = 0
  for (const f of frames) {
    const b = f.bounds()
    if (b) ground = Math.max(ground, b.y + b.h - 1)
  }
  const worldW = Math.ceil(fw + per * (frames.length - 1)) + 8
  const W = worldW * k + PAD * 2
  const rowH = (ground + 6) * k
  const H = frames.length * rowH + PAD * 2
  const data = Buffer.alloc(W * H * 4)
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    data.set([c[0], c[1], c[2], 255], (y * W + x) * 4)
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, GRASS)
  for (let wx = 0; wx < worldW; wx += 8)
    for (let y = 0; y < H; y++) put(PAD + wx * k, y, wx % 32 === 0 ? PLUMB_32 : PLUMB)
  frames.forEach((f, r) => {
    const rgba = f.rgba()
    const oy = PAD + r * rowH
    const gy = oy + (ground + 1) * k
    for (let x = 0; x < W; x++) for (let t = 0; t < 2; t++) put(x, gy + t, GROUND)
    for (let wx = 0; wx < worldW; wx += 8)
      for (let t = 0; t < (wx % 32 === 0 ? 3 : 2) * k; t++)
        for (let u = 0; u < 2; u++) put(PAD + wx * k + u, gy + t, TICK)
    const ox = PAD + Math.round(r * per * k)
    for (let y = 0; y < fh * k; y++)
      for (let x = 0; x < fw * k; x++) {
        const s = (Math.floor(y / k) * fw + Math.floor(x / k)) * 4
        if (rgba[s + 3]) put(ox + x, oy + y, [rgba[s], rgba[s + 1], rgba[s + 2]])
      }
  })
  const file = `${id.replaceAll(':', '_')}-${clip}.png`
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(resolve(out, file))
  return file
}

const lines = [
  '# Ground rulers',
  '',
  'One row per frame, each frame drawn where the body is in the world on that frame. A foot on the ground stays on',
  'its plumb line.',
  '',
  '| clip | stride (px a pass) | px per frame | each foot: the frames it is down | picture |',
  '| --- | --- | --- | --- | --- |'
]
for (const [id, clip, per] of jobs) {
  const file = await ruler(id, clip, per)
  const spec = specs[id][clip]
  // The transformed king repeats the king's poses under his fire.
  const table = (footfalls[id] ?? footfalls[id.split(':')[0]])?.[clip]
  const feet = table
    ? table.feet
        .map((foot) =>
          foot
            .map((x, i) => (x === null ? null : i))
            .filter((i) => i !== null)
            .join(' ')
        )
        .join(' / ')
    : spec.travel
      ? `drawn ${spec.travel === 'air' ? 'off the ground' : spec.travel}`
      : '—'
  lines.push(`| ${id}.${clip} | ${spec.stride ?? '—'} | ${Math.round(per * 100) / 100} | ${feet} | ${file} |`)
  console.log(`${id}.${clip}: ${file}`)
}
writeFileSync(resolve(out, 'index.md'), `${lines.join('\n')}\n`)
console.log(`Wrote ${jobs.length} rulers to ${out}`)
