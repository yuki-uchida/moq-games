// Bakes the preview picture of アニマフロント for its card on the landing page (landing/main.js): the game's own
// renderer draws the key-art scene of the render harness (render-test.html?scene=card — the squad in front of the
// lighthouse plaza with invaders behind), which is captured in Chromium and embedded as a WebP data URL.
// The cards are portrait (desktop ≈ 0.74, phones ≈ 0.83), so the picture is portrait too; object-fit: cover keeps
// the squad in the middle.
// Usage: node scripts/anima-front-card.mjs [--write] [--out FILE] [--software]
//   Without flags it prints the size of the data URL.
//   --write replaces the constant between the `anima-card:begin` / `anima-card:end` markers in landing/main.js.
//   --out FILE also saves the picture (look at it before committing; keep it out of published folders).
//   --software uses the default software rasterizer instead of the GPU (slower).
// Run it again whenever the look of the animals, the antiques, the foes or oldtown changes. The landing page stays
// static and never imports the game's code; it only embeds this picture.
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outFile = outIndex >= 0 ? resolve(args[outIndex + 1]) : undefined
const port = Number(process.env.CARD_PORT || 5223)
const W = 390
const H = 500
const query = [
  'scene=card',
  'map=oldtown',
  'quality=high',
  'hud=0',
  'w=1170',
  'h=1500',
  'cardcam=2.55,0.66,-0.18',
  'cardlook=-3,1.12,0.05'
].join('&')

const server = spawn(
  'npx',
  ['vite', '--config', 'vite.config.anima-front.mjs', '--port', String(port), '--strictPort'],
  {
    cwd: root,
    shell: true,
    stdio: 'ignore'
  }
)
const base = `http://127.0.0.1:${port}/`
try {
  let up = false
  for (let i = 0; i < 120 && !up; i++) {
    try {
      up = (await fetch(base)).ok
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (!up) throw new Error('the dev server did not start')
  const browser = await chromium.launch({
    headless: true,
    args: args.includes('--software') ? [] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1170, height: 1500 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}render-test.html?${query}`)
    await page.waitForFunction(() => window.__render !== undefined, null, { timeout: 180_000 })
    // Let the models settle into their poses and the cherry petals drift in.
    await page.waitForTimeout(6000)
    // Key art carries no in-world markers (they are a 2D canvas above the WebGL one).
    await page.addStyleTag({ content: '.anima-render-markers { display: none !important; }' })
    await page.waitForTimeout(300)
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`)
    const shot = await page.screenshot()
    const picture = await sharp(shot).resize(W, H).webp({ quality: 74, effort: 6 }).toBuffer()
    if (outFile) writeFileSync(outFile, picture)
    const dataUrl = `data:image/webp;base64,${picture.toString('base64')}`
    console.log(`card ${W}×${H} webp: ${picture.length} bytes (${dataUrl.length} characters as a data URL)`)
    if (args.includes('--write')) {
      const file = resolve(root, 'landing/main.js')
      const text = readFileSync(file, 'utf8')
      const pattern = /(\/\/ anima-card:begin[^\n]*\n)[\s\S]*?(\n\s*\/\/ anima-card:end)/
      if (!pattern.test(text)) throw new Error('anima-card markers not found in landing/main.js')
      writeFileSync(file, text.replace(pattern, `$1    const animaCard =\n      '${dataUrl}'$2`))
      console.log('wrote landing/main.js')
    }
  } finally {
    await browser.close()
  }
} finally {
  server.kill()
  if (process.platform === 'win32')
    spawn(
      'cmd',
      [
        '/c',
        `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %a /F /T`
      ],
      { shell: true, stdio: 'ignore' }
    )
}
