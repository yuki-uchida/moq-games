// Headless captures of the real Life Survivors game (dev server + Playwright, dev hook window.__life):
//   screens  → .build/life-survivors-art/screens/   stills (+ ×2 crops) at every stage, deaths, bosses, reaper
//   playback → .build/life-survivors-art/playback/dsf{1,2}/   recorded .webm clips + ffmpeg frame strips (native, ×3)
// Usage: E2E_PORT=5294 node scripts/life-survivors-screens.mjs [screens] [playback] [dsf=1|2]
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const outRoot = resolve(root, '.build/life-survivors-art')
const port = Number(process.env.E2E_PORT || 5294)
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg'
const args = process.argv.slice(2)
const doScreens = !args.some((a) => a === 'playback') || args.includes('screens')
const doPlayback = !args.some((a) => a === 'screens') || args.includes('playback')
const dsfs = args
  .find((a) => a.startsWith('dsf='))
  ?.slice(4)
  .split(',')
  .map(Number) ?? [1, 2]

// Stage name, an age inside it, and enemies from its pool.
const STAGES = [
  ['乳児期', 1, ['germ', 'germ', 'germ', 'insult']],
  ['幼児期', 4, ['germ', 'insult', 'bully', 'insult']],
  ['小学生', 8, ['bully', 'bully', 'lesson', 'teacher']],
  ['中学生', 13, ['lesson', 'exam', 'club', 'bully']],
  ['高校生', 16, ['exam', 'club', 'girlfriend', 'teacher']],
  ['大学生', 20, ['exam', 'expense', 'girlfriend', 'gossip']],
  ['社会人', 25, ['job', 'expense', 'boss', 'cert']],
  ['働き盛り', 40, ['kid', 'job', 'loan', 'boss']],
  ['中年', 55, ['illness', 'loan', 'gossip', 'job']],
  ['老後', 70, ['illness', 'loan', 'germ', 'gossip']],
  ['寝たきり', 77, ['illness', 'germ', 'expense', 'insult']]
]
const BOSSES = [
  ['b_hs', 14],
  ['b_univ', 18],
  ['b_shukatsu', 22],
  ['b_wedding', 30],
  ['b_mortgage', 38],
  ['b_rebel', 45],
  ['b_layoff', 52],
  ['b_illness', 60]
]
// Every death that exists: [clip name, age, killer].
const DEATHS = [
  ['hang', 25, 'boss'],
  ['starve', 25, 'expense'],
  ...STAGES.map(([name, age]) => [`collapse-${name}`, age, 'germ'])
]

const server = await createServer({
  configFile: resolve(root, 'vite.config.life-survivors.mjs'),
  server: { port, strictPort: true },
  logLevel: 'error'
})
await server.listen()
const browser = await chromium.launch({ headless: true })
const written = []
const errors = []

async function start(page) {
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.getByRole('button', { name: 'ひとりで生まれる' }).click()
  await page.locator('#hud').waitFor()
}

/** Sets the age, clears the field, removes weapons so crowds stay, and spawns enemies in a ring. */
const scene = (page, age, enemies, hp = Infinity, radius = 1) =>
  page.evaluate(
    ({ age, enemies, hp, radius }) => {
      const l = window.__life
      const s = l.game.state
      const p = s.players[0]
      s.time = (age / 80) * 30 * 60 + 1
      s.eventIndex = 999
      s.enemies = []
      s.gems = []
      p.weapons = []
      p.choices = []
      p.hp = Math.min(hp, p.maxHp)
      // Regeneration clamps hp to maxHp, so keep a scenery player topped up instead.
      clearInterval(window.__keepAlive)
      if (hp > 1) window.__keepAlive = setInterval(() => (p.hp = p.maxHp), 50)
      enemies.forEach((kind, i) => {
        const a = (i / enemies.length) * Math.PI * 2 + 0.4
        const d = (kind.startsWith('b_') ? 200 : 110 + (i % 3) * 45) * radius
        l.game.spawnEnemy(kind, p.x + Math.cos(a) * d * 1.6, p.y + Math.sin(a) * d)
      })
    },
    { age, enemies, hp, radius }
  )

const kill = (page, killer) =>
  page.evaluate((killer) => {
    const l = window.__life
    const p = l.game.state.players[0]
    l.game.spawnEnemy(killer, p.x + 4, p.y)
    // Once the blow lands, clear the field so the death animation is unobstructed.
    setTimeout(() => (l.game.state.enemies = []), 150)
  }, killer)

// ---------------------------------------------------------------------------------------------
// Stills.

if (doScreens) {
  const out = resolve(outRoot, 'screens')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
  page.on('pageerror', (error) => errors.push(error.message))
  const shot = async (name) => {
    const path = resolve(out, `${name}.png`)
    await page.screenshot({ path })
    // A ×2 nearest-neighbour crop (480×300 device px) centred on the player, who is always mid-screen.
    const piece = await sharp(path)
      .extract({ left: 1280 - 240, top: 720 - 150, width: 480, height: 300 })
      .toBuffer()
    await sharp(piece)
      .resize({ width: 960, kernel: 'nearest' })
      .toFile(resolve(out, `${name}_x2.png`))
    written.push(path)
  }
  await start(page)
  for (const [name, age, enemies] of STAGES) {
    await scene(page, age, enemies)
    await page.waitForTimeout(1700)
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(500)
    await shot(`age-${String(age).padStart(2, '0')}-${name}-walk`)
    await page.keyboard.up('KeyD')
    await page.waitForTimeout(1500)
    await shot(`age-${String(age).padStart(2, '0')}-${name}-idle`)
  }
  for (const [boss, age] of BOSSES) {
    await scene(page, age, [boss, 'germ', 'insult'], Infinity, 0.6)
    await page.waitForTimeout(1600)
    await shot(`boss-${boss}`)
  }
  for (const [name, age, killer] of DEATHS.slice(0, 2).concat([DEATHS.find((d) => d[0] === 'collapse-小学生')])) {
    await start(page)
    await scene(page, age, [], 0.01)
    await page.waitForTimeout(1700)
    await kill(page, killer)
    await page.waitForTimeout(900)
    await shot(`death-${name}-1-mid`)
    await page.waitForTimeout(1300)
    await shot(`death-${name}-2-late`)
    await page.waitForTimeout(1500)
    await shot(`death-${name}-3-result`)
  }
  await start(page)
  await scene(page, 79, [])
  await page.evaluate(() => (window.__life.game.state.time = 30 * 60 - 0.3))
  await page.waitForTimeout(2200)
  await shot('reaper')
  await page.close()
}

// ---------------------------------------------------------------------------------------------
// Playback: real recorded video of the running game, then frame strips cut from that video.

/** Tiles consecutive video frames (cropped around the screen centre) into one PNG, plus a ×3 copy. */
function strip(video, file, { from, seconds, fps, w, h, dsf, cols = 12, dy = 0 }) {
  const frames = Math.max(1, Math.round(seconds * fps))
  const rows = Math.ceil(frames / cols)
  const cw = Math.round(w * dsf)
  const ch = Math.round(h * dsf)
  const x = Math.round((1280 * dsf - cw) / 2)
  const y = Math.round((720 * dsf - ch) / 2 + dy * dsf)
  const vf = `fps=${fps},crop=${cw}:${ch}:${x}:${y},tile=${Math.min(cols, frames)}x${rows}:padding=2:color=0x222222`
  const native = `${file}_1x.png`
  execFileSync(FFMPEG, [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    String(from),
    '-t',
    String(seconds),
    '-i',
    video,
    '-vf',
    vf,
    '-frames:v',
    '1',
    native
  ])
  execFileSync(FFMPEG, [
    '-y',
    '-loglevel',
    'error',
    '-i',
    native,
    '-vf',
    'scale=iw*3:ih*3:flags=neighbor',
    `${file}_x3.png`
  ])
  written.push(native)
}

/**
 * Records the real running page. Playwright's bundled encoder lacks VP8 here, so frames come from Chrome's
 * own screencast (PNG, device pixels) and are encoded with the system ffmpeg into a lossless VP9 .webm,
 * timed by each frame's capture timestamp. Marks are seconds into that video.
 */
async function clip(dsf, dir, name, run) {
  // Chrome's screencast emits CSS-pixel frames, so the 2× run uses a 2560×1440 viewport at dpr 1: the game
  // canvas renders at exactly 2 device px per art px either way (scale = viewport / 1280 × dpr); only the
  // HTML HUD is smaller.
  const context = await browser.newContext({ viewport: { width: 1280 * dsf, height: 720 * dsf }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  const tmp = mkdtempSync(join(tmpdir(), 'ls-clip-'))
  const frames = []
  const writes = []
  const cdp = await context.newCDPSession(page)
  cdp.on('Page.screencastFrame', (e) => {
    const file = join(tmp, `f${String(frames.length).padStart(5, '0')}.png`)
    frames.push({ file, ts: e.metadata.timestamp })
    writes.push(writeFile(file, Buffer.from(e.data, 'base64')))
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: 1280 * dsf,
    maxHeight: 720 * dsf,
    everyNthFrame: 1
  })
  const wall = {}
  await run(page, (key) => (wall[key] = Date.now() / 1000))
  await page.waitForTimeout(200)
  await cdp.send('Page.stopScreencast')
  await Promise.all(writes)
  await context.close()
  const first = frames[0].ts
  const list = ['ffconcat version 1.0']
  frames.forEach((f, k) => {
    list.push(`file '${f.file}'`, `duration ${Math.max(0.001, (frames[k + 1]?.ts ?? f.ts + 1 / 30) - f.ts).toFixed(4)}`)
  })
  list.push(`file '${frames[frames.length - 1].file}'`)
  writeFileSync(join(tmp, 'list.txt'), list.join('\n'))
  const path = resolve(dir, `${name}.webm`)
  execFileSync(FFMPEG, [
    ...['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')],
    ...[
      '-fps_mode',
      'cfr',
      '-r',
      '30',
      '-c:v',
      'libvpx-vp9',
      '-lossless',
      '1',
      '-deadline',
      'realtime',
      '-cpu-used',
      '8',
      path
    ]
  ])
  rmSync(tmp, { recursive: true, force: true })
  const marks = Object.fromEntries(Object.entries(wall).map(([k, t]) => [k, Math.max(0, t - first)]))
  return { path, marks }
}

if (doPlayback)
  for (const dsf of dsfs) {
    const dir = resolve(outRoot, `playback/dsf${dsf}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const at = (name) => resolve(dir, name)
    // 1. Every stage: walking right, walking left, idle — with a few enemies about.
    for (const [name, age, enemies] of STAGES) {
      const { path, marks } = await clip(dsf, dir, `stage-${name}`, async (page, mark) => {
        await start(page)
        await scene(page, age, enemies, Infinity, 1.6)
        await page.waitForTimeout(1600)
        mark('right')
        await page.keyboard.down('KeyD')
        await page.waitForTimeout(2000)
        await page.keyboard.up('KeyD')
        mark('left')
        await page.keyboard.down('KeyA')
        await page.waitForTimeout(2000)
        await page.keyboard.up('KeyA')
        mark('idle')
        await page.waitForTimeout(1600)
      })
      const box = { w: 110, h: 100, dsf, dy: -12 }
      strip(path, at(`walk-${name}-right`), { ...box, from: marks.right + 0.2, seconds: 1.75, fps: 24 })
      strip(path, at(`walk-${name}-left`), { ...box, from: marks.left + 0.2, seconds: 1.75, fps: 24 })
      strip(path, at(`walk-${name}-right-12fps`), { ...box, from: marks.right, seconds: 2, fps: 12 })
      strip(path, at(`idle-${name}`), { ...box, from: marks.idle + 0.1, seconds: 1.5, fps: 12 })
    }
    // 2. Every death, from the moment the player is downed to the held last frame, then the result dialog.
    for (const [name, age, killer] of DEATHS) {
      const { path, marks } = await clip(dsf, dir, `death-${name}`, async (page, mark) => {
        await start(page)
        await scene(page, age, [], 0.01)
        await page.waitForTimeout(1600)
        await kill(page, killer)
        mark('down')
        await page.waitForTimeout(5200)
      })
      strip(path, at(`death-${name}`), { from: marks.down, seconds: 4.6, fps: 12, w: 130, h: 120, dsf, dy: -20 })
      strip(path, at(`death-${name}-result`), {
        from: marks.down + 4.4,
        seconds: 0.5,
        fps: 2,
        w: 640,
        h: 420,
        dsf,
        cols: 1
      })
    }
    // 3. Each boss with a crowd of regular enemies chasing the player.
    for (const [boss, age] of BOSSES) {
      const { path, marks } = await clip(dsf, dir, `boss-${boss}`, async (page, mark) => {
        await start(page)
        await scene(page, age, [boss, 'germ', 'insult', 'bully', 'job', 'expense', 'exam'], Infinity, 1.2)
        await page.waitForTimeout(800)
        mark('chase')
        await page.keyboard.down('KeyA')
        await page.waitForTimeout(2200)
        await page.keyboard.up('KeyA')
      })
      strip(path, at(`boss-${boss}`), { from: marks.chase, seconds: 2, fps: 12, w: 420, h: 300, dsf, cols: 6 })
    }
    // 4. The reaper's arrival through the 大往生 result.
    {
      const { path, marks } = await clip(dsf, dir, 'reaper', async (page, mark) => {
        await start(page)
        await scene(page, 79, ['illness', 'germ'])
        await page.waitForTimeout(800)
        await page.evaluate(() => (window.__life.game.state.time = 30 * 60 - 0.3))
        mark('arrive')
        await page.waitForTimeout(6000)
      })
      strip(path, at('reaper'), { from: marks.arrive, seconds: 4.4, fps: 12, w: 300, h: 240, dsf, cols: 8, dy: -30 })
      strip(path, at('reaper-result'), { from: marks.arrive + 5.4, seconds: 0.5, fps: 2, w: 640, h: 420, dsf, cols: 1 })
    }
  }

await browser.close()
await server.close()
if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`)
console.log(`${written.length} files, e.g.\n${written.slice(0, 5).join('\n')}`)
