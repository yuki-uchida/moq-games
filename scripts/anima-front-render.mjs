/**
 * Render review kit for アニマフロント: starts the render workstream's Vite server (port 5211, its own dependency
 * cache) and captures screenshots of the render harness (examples/games/anima-front/render-test.html) with
 * Playwright Chromium on the real GPU, plus a performance table of the stress scene at each quality.
 *
 * Usage: node scripts/anima-front-render.mjs [--only env,themes,combat,stress,events,actors,perf] [--size 1280x720]
 *                                             [--swiftshader] [--out DIR] [--map oldtown]
 * Output: .build/anima-front/render/*.png and perf.json (ignored by Git).
 * Environment: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH selects the Chromium binary.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const SECTIONS = ['env', 'themes', 'combat', 'stress', 'events', 'actors', 'perf']
const only = new Set((valueOf('--only') ?? SECTIONS.join(',')).split(',').map((s) => s.trim()))
const [W, H] = (valueOf('--size') ?? '1280x720').split('x').map(Number)
const out = resolve(valueOf('--out') ?? join(root, '.build/anima-front/render'))
const mapArg = valueOf('--map')
const swiftshader = args.includes('--swiftshader')
mkdirSync(out, { recursive: true })

// No HMR: other workstreams edit files while captures run, and a reload would interrupt a capture.
const server = await createServer({
  configFile: join(root, '.build/anima-front/vite-render.mjs'),
  logLevel: 'warn',
  server: { hmr: false, watch: null }
})
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/render-test.html`
const launchArgs = swiftshader
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit']
const browser = await chromium.launch({
  headless: true,
  args: launchArgs,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
})
const errors = []
const cleanup = async () => {
  await browser.close().catch(() => {})
  await server.close().catch(() => {})
}
process.on('SIGINT', async () => {
  await cleanup()
  process.exit(130)
})

async function open(query, size = [W, H]) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } })
  page.on('pageerror', (e) => errors.push(`${query}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${query}: ${m.text()}`)
  })
  await page.goto(`${base}?${query}${mapArg ? `&map=${mapArg}` : ''}`)
  await page.waitForFunction(() => window.__render?.ready, null, { timeout: 120_000 })
  return page
}

async function waitFrames(page, n) {
  const start = await page.evaluate(() => window.__render.frames)
  await page.waitForFunction((target) => window.__render.frames >= target, start + n, { timeout: 120_000 })
}

async function shot(query, name, frames = 30, size) {
  const page = await open(query, size)
  await waitFrames(page, frames)
  await page.screenshot({ path: join(out, `${name}.png`) })
  const stats = await page.evaluate(() => window.__render.stats())
  await page.close()
  console.log(
    `${name}: ${stats.drawCalls} draws, ${Math.round(stats.triangles / 1000)}k tris, ${stats.fps.toFixed(0)} fps`
  )
  return stats
}

try {
  if (only.has('env')) {
    for (let v = 0; v < 8; v++) await shot(`scene=env&theme=day&view=${v}&hud=0&fixed=1`, `env-day-v${v}`, 20)
    await shot(`scene=env&theme=day&hud=0&fixed=1`, `env-day-shoulder`, 20)
  }
  if (only.has('themes')) {
    for (const theme of ['sunset', 'night', 'blight', 'virtual'])
      for (const v of [0, 1, 3])
        await shot(`scene=env&theme=${theme}&view=${v}&hud=0&fixed=1`, `env-${theme}-v${v}`, 20)
  }
  if (only.has('combat')) {
    for (const theme of ['day', 'night', 'blight'])
      await shot(`scene=combat&theme=${theme}&hud=0&fixed=1`, `combat-${theme}`, 150)
    await shot(`scene=combat&theme=day&view=1&hud=0&fixed=1`, `combat-day-wide`, 150)
  }
  if (only.has('stress')) {
    for (const q of ['low', 'medium', 'high'])
      await shot(`scene=stress&theme=day&quality=${q}&fixed=1`, `stress-${q}`, 200)
  }
  if (only.has('events')) {
    const page = await open(`scene=events&theme=day&fixed=1`)
    const STEPS = await page.evaluate(() => window.__render.steps)
    for (let i = 0; i < STEPS; i++) {
      // Each event step lasts 1.2 s; pause 0.2 s after it fires (dt = 0 while paused) and capture.
      const at = i * 1.2 + 0.2
      await page.waitForFunction((t) => window.__render.sceneTime >= t, at, { timeout: 60_000 })
      await page.evaluate(() => window.__render.setPaused(true))
      await waitFrames(page, 2)
      const label = await page.evaluate(() => window.__render.label())
      const safe = label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
      await page.screenshot({ path: join(out, `events-${String(i).padStart(2, '0')}-${safe}.png`) })
      await page.evaluate(() => window.__render.setPaused(false))
    }
    const sounds = await page.evaluate(() => window.__render.sounds())
    writeFileSync(join(out, 'events-sounds.json'), JSON.stringify(sounds, null, 2))
    await page.close()
  }
  if (only.has('actors')) {
    for (const v of [0, 1, 2]) await shot(`scene=actors&theme=day&view=${v}&hud=0&fixed=1`, `actors-v${v}`, 40)
  }
  if (only.has('perf')) {
    const rows = []
    for (const q of ['low', 'medium', 'high']) {
      const page = await open(`scene=stress&theme=day&quality=${q}`, [1920, 1080])
      await waitFrames(page, 120)
      // Measure real frame times over 5 s.
      const result = await page.evaluate(async () => {
        const times = []
        let last = performance.now()
        const end = last + 5000
        let draws = 0
        let tris = 0
        await new Promise((done) => {
          const tick = () => {
            const now = performance.now()
            times.push(now - last)
            last = now
            const s = window.__render.stats()
            draws = Math.max(draws, s.drawCalls)
            tris = Math.max(tris, s.triangles)
            if (now < end) requestAnimationFrame(tick)
            else done()
          }
          requestAnimationFrame(tick)
        })
        times.sort((a, b) => a - b)
        const avg = times.reduce((a, b) => a + b, 0) / times.length
        return {
          fps: 1000 / avg,
          avgMs: avg,
          p95Ms: times[Math.floor(times.length * 0.95)],
          maxDraws: draws,
          maxTris: tris,
          counts: window.__render.counts(),
          quality: window.__render.stats().quality
        }
      })
      rows.push({ quality: q, ...result })
      console.log(
        `perf ${q}: ${result.fps.toFixed(1)} fps (avg ${result.avgMs.toFixed(2)} ms, p95 ${result.p95Ms.toFixed(2)} ms), ≤${result.maxDraws} draws, ≤${Math.round(result.maxTris / 1000)}k tris`
      )
      await page.close()
    }
    writeFileSync(join(out, 'perf.json'), JSON.stringify({ size: '1920x1080', swiftshader, rows }, null, 2))
  }
} finally {
  await cleanup()
}
if (errors.length) {
  console.error(`\n${errors.length} page error(s):\n${[...new Set(errors)].slice(0, 30).join('\n')}`)
  process.exitCode = 1
}
console.log(`\nScreenshots in ${out}`)
